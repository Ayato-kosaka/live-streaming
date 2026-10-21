"""配信アーカイブの文字起こし（自動字幕）とチャットを取り、`streams/` に置く。

    python3 python/stream_transcripts.py plan  --count 40 --out todo.json   # 何を取るか（BQ だけ）
    python3 python/stream_transcripts.py fetch todo.json                    # 取って streams/ に書く

Actions（`.github/workflows/stream_transcripts.yml`）で回す。作業箱からは YouTube の
字幕が 429 で断られ、BigQuery にも届かないので。

## 何を取るか（plan）

BQ の `videos` から、開始時刻のある配信を**新しい順**に並べ、`streams/manifest.tsv` で
済みでないもの（字幕が ok でない・まだ3回取りに行っていない）を最大 N 本。
チャットの取り込みが落ち着いていない配信（PENDING / WAITING）は待つ。
いま書くとチャットが0件のまま「済み」になって、あとから増えた分を取り直さないので。

## 取り方（fetch）

- 字幕は yt-dlp で `--skip-download`（動画は落とさない）。口の当たり方・PO Token・Cookie は
  ショートの取り込み（`tools/shorts/ingest/download.py`）のをそのまま使う
- **Cookie を使うほかの取り込みと同時に使わない。** 1本ごとに `gate.py` で見る
- 1本ごとに数秒あける。429 か「ボット確認」が続いたら、その回はそこで打ち切る
  （取れたぶんは書いてある。ワークフローがそれをコミットする）
- チャットは BQ の `chat_messages` から1回のクエリでまとめて引く

## ログに出すもの

動画ID・本数・字数・件数・成否の理由だけ。**題名・字幕・視聴者さんの名前やコメントは出さない**
（このリポジトリは公開で、Actions のログも誰でも読める）。中身はファイルにだけ書く。
"""

from __future__ import annotations

import argparse
import datetime as dt
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import stream_text as st  # noqa: E402

STREAMS = ROOT / "streams"
MANIFEST = STREAMS / "manifest.tsv"
DATASET = "youtube_chat"
WORKFLOW = "stream_transcripts.yml"
# 1本ごとにあける秒。字幕は1本1〜2回の要求なので、これで1分に数本に収まる
PAUSE_SEC = 8
# 429 / ボット確認がこの本数続いたら、その回は打ち切る（粘るほど長く締め出される）
STOP_AFTER = 2


def bq():
    from google.cloud import bigquery

    project = os.environ.get("BQ_PROJECT_ID", "")
    if not project:
        raise SystemExit("BQ_PROJECT_ID が無い")
    return bigquery, bigquery.Client(project=project), project


# ---------------------------------------------------------------- plan

def plan(count: int, out: Path) -> int:
    bigquery, client, project = bq()
    sql = f"""
SELECT video_id, title, actual_start_time, status
FROM `{project}.{DATASET}.videos`
WHERE actual_start_time IS NOT NULL
ORDER BY actual_start_time DESC
"""
    rows = list(client.query(sql).result())
    man = st.read_manifest(MANIFEST)
    todo, waiting = [], 0
    for r in rows:
        if not st.wanted(man.get(r.video_id)):
            continue
        if r.status in ("PENDING", "WAITING"):
            waiting += 1
            continue
        start = r.actual_start_time.astimezone(dt.timezone.utc)
        prev = man.get(r.video_id) or {}
        todo.append({"video_id": r.video_id, "title": r.title or "",
                     "start": start.isoformat(), "tries": int(prev.get("tries") or 0)})
        if len(todo) >= count:
            break
    done = sum(1 for r in man.values() if r.get("caption") == "ok")
    print(f"配信 {len(rows)}本 / 済み {done}本 / チャット待ち {waiting}本 / 今回取る {len(todo)}本",
          flush=True)
    out.write_text(json.dumps(todo, ensure_ascii=False), encoding="utf-8")
    gh_out = os.environ.get("GITHUB_OUTPUT")
    if gh_out:
        with open(gh_out, "a", encoding="utf-8") as f:
            f.write(f"count={len(todo)}\n")
    return 0


# ---------------------------------------------------------------- チャット

def fetch_chat(ids: list[str]) -> dict[str, list[dict]]:
    """動画ごとのチャット。配信内の時刻の手がかり（msec / timestampText）は生データから抜く。"""
    bigquery, client, project = bq()
    sql = f"""
SELECT
  video_id, event_type, published_at, author_name, message_text, purchase_amount_text,
  REGEXP_EXTRACT(TO_JSON_STRING(raw_item_json), r'"videoOffsetTimeMsec":"?(\\d+)') AS offset_msec,
  REGEXP_EXTRACT(TO_JSON_STRING(raw_item_json), r'"timestampText":\\{{"simpleText":"([^"]+)"') AS clock
FROM `{project}.{DATASET}.chat_messages`
WHERE video_id IN UNNEST(@ids) AND event_type IN ('TEXT', 'PAID', 'MEMBERSHIP')
ORDER BY video_id, timestamp_usec
"""
    cfg = bigquery.QueryJobConfig(query_parameters=[
        bigquery.ArrayQueryParameter("ids", "STRING", ids)])
    out: dict[str, list[dict]] = {i: [] for i in ids}
    for r in client.query(sql, job_config=cfg).result():
        out[r.video_id].append(dict(r.items()))
    return out


# ---------------------------------------------------------------- 字幕

def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.path.insert(0, str(path.parent))
    spec.loader.exec_module(mod)
    return mod


def caption_kind(info: dict, files: dict[str, Path]) -> tuple[str, Path, str] | None:
    """使う字幕を選ぶ。手動の ja があればそれ、無ければ自動の ja-orig、無ければ自動の ja。"""
    manual = info.get("subtitles") or {}
    for lang, src in (("ja", "manual"), ("ja-orig", "auto"), ("ja", "auto")):
        if lang in files and (src == "auto" or lang in manual):
            return lang, files[lang], ("手動" if lang in manual else "自動")
    return None


def grab_captions(dl, vid: str, work: Path, client: str) -> dict:
    """1本ぶんの字幕と info を取る。結果は {ok, why, lang, path, kind, info}。"""
    url = f"https://www.youtube.com/watch?v={vid}"
    log = work / "ytdlp.log"
    cmd = dl.yt_args(client) + [
        "--skip-download", "--write-info-json", "--write-subs", "--write-auto-subs",
        "--sub-langs", "ja-orig,ja", "--sub-format", "json3/vtt/best",
        "--sleep-subtitles", "3", "-o", str(work / "src.%(ext)s"), url]
    rc = dl.run_ytdlp(cmd, log, 600)
    info = {}
    try:
        info = json.loads((work / "src.info.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        pass
    files = {}
    for p in sorted(work.glob("src.*")):
        parts = p.name.split(".")
        if len(parts) == 3 and parts[2] in ("json3", "vtt"):
            files.setdefault(parts[1], p)
    text = log.read_text(errors="ignore") if log.exists() else ""
    pick = caption_kind(info, files)
    if pick:
        lang, path, kind = pick
        return {"ok": True, "lang": lang, "path": path, "kind": kind, "info": info, "rc": rc}
    have = [k for k in list((info.get("automatic_captions") or {})) +
            list((info.get("subtitles") or {})) if k.startswith("ja")]
    if "HTTP Error 429" in text:
        why = "429"
    elif "Sign in to confirm" in text:
        why = "ボット確認"
    elif info and not have:
        why = "ja の字幕が無い"
    elif not info:
        why = dl.why_failed(text)
    else:
        why = "ja の字幕はあるが取れなかった"
    return {"ok": False, "why": why, "info": info, "rc": rc}


def next_client(dl, cur: str) -> str:
    """口の並び（tools/clip/fetch.py の CLIENTS）で、いまの次のもの。"""
    cs = list(dl.clip.CLIENTS)
    return cs[(cs.index(cur) + 1) % len(cs)] if cur in cs else cs[0]


# ---------------------------------------------------------------- fetch

def write_one(item: dict, cap: dict | None, chat: list[dict], fetched: str) -> dict:
    start = dt.datetime.fromisoformat(item["start"])
    stem = st.stem_for(item["video_id"], start)
    d = STREAMS / st.rel_dir(start)
    d.mkdir(parents=True, exist_ok=True)
    head = {"video_id": item["video_id"], "title": item["title"], "start": start}
    row = {"video_id": item["video_id"], "start_jst": f"{start.astimezone(st.JST):%Y-%m-%d %H:%M}",
           "stem": f"{st.rel_dir(start)}/{stem}", "fetched_at": fetched,
           "tries": item["tries"] + 1}
    lines, src = st.chat_lines(chat, start)
    chat_body = st.chat_text(head, lines, src)
    (d / f"{stem}.chat.txt").write_text(chat_body, encoding="utf-8")
    row["chat_count"] = len(lines)
    if cap and cap.get("ok"):
        raw = st.bin_captions(st.read_captions(cap["path"]))
        bins, n_music = st.mask_music(raw)
        head["caption_desc"] = f"{cap['lang']}（{cap['kind']}・{cap['path'].suffix[1:]}）"
        body = st.transcript_text(head, bins)
        (d / f"{stem}.transcript.txt").write_text(body, encoding="utf-8")
        # chars は**伏せる前**の字数。議事録の目安字数（stream_notes.py）がこの数から出ていて、
        # 伏せたあとで数えると、伏せる前に書いた議事録が目安の外に押し出される（実際に14本出た）。
        # 列の意味を「字幕の字数」で揃えておく
        row.update(caption="ok", chars=sum(len(s) for _, s in raw),
                   note=st.music_note(head["caption_desc"], n_music))
    else:
        why = (cap or {}).get("why") or "取りに行かなかった"
        row.update(caption="none" if why == "ja の字幕が無い" else "error", chars=0, note=why)
    return row


def fetch(todo_path: Path) -> int:
    todo = json.loads(todo_path.read_text(encoding="utf-8"))
    if not todo:
        print("取るものが無い", flush=True)
        return 0
    dl = _load("shorts_download", ROOT / "tools/shorts/ingest/download.py")
    gate_mod = sys.modules["gate"]
    # **自分以外の、Cookie を使うワークフローを全部見る。** `Gate.from_env` は
    # ショートの取り込みを自分として外すので、そのままだとショートとぶつかる
    e = os.environ.get
    gate = gate_mod.Gate(gate_mod.cookie_workflows(exclude={WORKFLOW}),
                         gate_mod.api_lister(e("GITHUB_REPOSITORY", ""),
                                             e("GH_TOKEN") or e("GITHUB_TOKEN") or "",
                                             e("GITHUB_API_URL") or "https://api.github.com"),
                         own_run=e("GITHUB_RUN_ID", ""), count_pending=False)
    print(gate.heading(), flush=True)
    chats = fetch_chat([t["video_id"] for t in todo])
    man = st.read_manifest(MANIFEST)
    fetched = dt.datetime.now(st.JST).strftime("%Y-%m-%d")
    good: str | None = None
    streak, stopped = 0, ""
    tally = {"ok": 0, "none": 0, "error": 0}
    for n, item in enumerate(todo):
        vid = item["video_id"]
        print(f"\n== [{n + 1}/{len(todo)}] {vid}", flush=True)
        v = gate.wait()
        if n == 0 or v.waited or not v.ok:
            print(f"   判定: {v.why}", flush=True)
        if not v.ok:
            stopped = f"Cookie を使い始めなかった（{v.how}）"
            break
        work = Path(tempfile.mkdtemp(prefix=f"cap-{vid}-"))
        try:
            url = f"https://www.youtube.com/watch?v={vid}"
            if not good:
                good, nowhy = dl.find_client(url, None, rounds=1 if n else 2, pause=30)
            if not good:
                cap = {"ok": False, "why": nowhy}
            else:
                cap = grab_captions(dl, vid, work, good)
                # 取れなかったら、次の口で1回だけ当たり直す。「字幕が無い」も口によって
                # 一覧が空で返ることがあるので、無いと決める前に別の口でもう一度見る。
                # **429 だけは当たり直さない。** 口を変えても同じ IP なので、締め出しを延ばすだけ
                if not cap["ok"] and cap["why"] != "429":
                    alt = next_client(dl, good)
                    print(f"   取れなかった（{cap['why']}）。口 {alt} で当たり直す", flush=True)
                    for p in work.glob("src.*"):
                        p.unlink()
                    cap2 = grab_captions(dl, vid, work, alt)
                    if cap2["ok"] or cap["why"] == "ja の字幕が無い":
                        cap = cap2
                    if cap2["ok"]:
                        good = alt
            row = write_one(item, cap, chats.get(vid, []), fetched)
        finally:
            shutil.rmtree(work, ignore_errors=True)
        man[vid] = row
        st.write_manifest(MANIFEST, man)
        tally[row["caption"]] += 1
        print(f"   字幕 {row['caption']}（{row['note'] if row['caption'] != 'ok' else '済'}）"
              f"  字数 {row['chars']}  チャット {row['chat_count']}件  {row['tries']}回目",
              flush=True)
        if cap and not cap.get("ok") and cap.get("why") in ("429", "ボット確認"):
            streak += 1
            good = None
            if streak >= STOP_AFTER:
                stopped = f"{cap['why']} が {streak}本続いた"
                break
        else:
            streak = 0
        time.sleep(PAUSE_SEC)
    print(f"\n字幕 ok {tally['ok']} / 無い {tally['none']} / 取れなかった {tally['error']}"
          f"（頼んだ {len(todo)}本）", flush=True)
    if stopped:
        print(f"打ち切り: {stopped}", flush=True)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write(f"### 配信の文字起こし\n\n字幕 ok **{tally['ok']}** / 無い {tally['none']} / "
                    f"取れなかった {tally['error']}（頼んだ {len(todo)}本）\n\n")
            if stopped:
                f.write(f"**打ち切り:** {stopped}\n\n")
    gh_out = os.environ.get("GITHUB_OUTPUT")
    if gh_out:
        with open(gh_out, "a", encoding="utf-8") as f:
            f.write(f"ok={tally['ok']}\nnone={tally['none']}\nerror={tally['error']}\n"
                    f"stopped={'1' if stopped else '0'}\n")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("plan")
    p.add_argument("--count", type=int, default=40)
    p.add_argument("--out", type=Path, required=True)
    f = sub.add_parser("fetch")
    f.add_argument("todo", type=Path)
    a = ap.parse_args()
    if a.cmd == "plan":
        return plan(max(1, a.count), a.out)
    return fetch(a.todo)


if __name__ == "__main__":
    sys.exit(main())
