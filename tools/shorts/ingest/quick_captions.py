"""字幕だけを取って封をする（mode `captions`）。**媒体は落とさない。** Actions のランナーで。

    python3 tools/shorts/ingest/quick_captions.py ITEMS.json SEALED_ROOT

ITEMS.json は plan.py の `captions` 出力（`{"include": [...]}`。公開鍵つき）。
1本ごとに `SEALED_ROOT/<key>/` へ manifest.json・key.enc・payload.enc を置く。
作業枝に置くのはワークフローの次の段（push.sh）。Cookie の写しを消してから置く。

## なぜ要るか（#1014・帳面 F-046）

archive は配信を丸ごと取り、whisper にかけ、全部が終わってから1つの封にする。
フォカッチャの回（VusdZVyjgjQ）では、自動字幕は取る段（最初の4分）でもう取れていたのに、
解析の job の道具の入れで32分・whisper で40分を越えて止まり、1時間を越えても
原稿の段に入れなかった。**区間を決めて原稿に入るには、YouTube の自動字幕で足りる。**
だから媒体を落とさず（`--skip-download`）、字幕（`ja-orig`・`ja`）と題・長さだけを取って、
その場で封をする。ffmpeg も whisper も要らないので、道具の入れも短い。

## Cookie と PO Token は fetch の job と同じ

yt-dlp の呼びかた（口・PO Token・Cookie・時間切れ）は download.py の `yt_args` をそのまま使う。
口は tools/clip/fetch.py の `CLIENTS` の順に当たり、字幕が取れた口で止める
（字幕の取りかたは口ごとに違い、形式が見えても字幕が来ない口がある）。
**Cookie を使い始める前に gate.py を通す**（1本ごと。`pending` は数えない。
この job は fetch と同じ concurrency の枠に入るので、download.py と同じ理由）。

## ログに出すもの

段・口・成否・行数・秒だけ。**題名・字幕の中身は出さない**（yt-dlp の出力はファイルに受けて封の中へ）。
平文（取った字幕・info.json・整えたもの）は、封をしたらその場で消す。
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from captions import lines, parse_json3, parse_vtt  # noqa: E402
from common import hms, now_iso, read_json, write_json  # noqa: E402
from gate import Gate  # noqa: E402
import download  # noqa: E402  口の並び・yt-dlp の呼びかたは download.py と1つに
import seal  # noqa: E402

LANGS = ("ja-orig", "ja")
# 1つの口で待つ秒。字幕だけなら1本10〜20秒で戻る。媒体を取らないので長く粘る理由が無い
PER_CLIENT_SEC = 150
# 何個の口まで当たるか。断られ続けたら、それ以上当たっても Cookie を擦り減らすだけ
MAX_CLIENTS = 5
# 字幕の一覧に ja が無い、と何個の口が揃って言ったら「まだ付いていない」と見切るか。
# 配信の直後は自動字幕が遅れて付く（streams/README.md）。口1つの返事では決めない
NO_CAPS_AGREE = 2


def drop(p: Path) -> None:
    """平文（取った字幕・info.json・整えたもの）を消す。封をしたあとと、job の終わりに。"""
    shutil.rmtree(p, ignore_errors=True)


def sub_cmd(client: str, d: Path, video: str) -> list[str]:
    """字幕と info.json だけを頼む yt-dlp の呼びかた。**媒体の形式は頼まない。**"""
    url = f"https://www.youtube.com/watch?v={video}"
    return download.yt_args(client) + [
        "--skip-download",
        # ボット確認ではなく「形式が無い」だけなら、字幕と info は書かせる
        "--ignore-no-formats-error",
        "--write-info-json",
        "--write-subs", "--write-auto-subs", "--sub-langs", ",".join(LANGS),
        "--sub-format", "json3/vtt/best",
        "-o", str(d / "src.%(ext)s"), url]


def pick_sub(d: Path) -> tuple[str, Path] | None:
    """取れた字幕のうち、`ja-orig`（話した言葉のまま）を先に、無ければ `ja`。"""
    for lang in LANGS:
        for ext in (".json3", ".vtt"):
            p = d / f"src.{lang}{ext}"
            if p.is_file() and p.stat().st_size > 0:
                return lang, p
    return None


def ja_tracks(info: dict) -> tuple[list[str], list[str]]:
    auto = [k for k in (info.get("automatic_captions") or {}) if k.startswith("ja")]
    manual = [k for k in (info.get("subtitles") or {}) if k.startswith("ja")]
    return auto, manual


def fetch_one(it: dict, d: Path, first: str | None = None) -> dict:
    """口を順に当たって字幕を取る。`{"ok", "client", "tries", "why"}`。"""
    d.mkdir(parents=True, exist_ok=True)
    log = d / "ytdlp.log"
    order = ([first] if first else []) + [c for c in download.clip.CLIENTS if c != first]
    tries, no_caps = [], 0
    for client in order[:MAX_CLIENTS]:
        for old in d.glob("src.*"):
            old.unlink()
        t0 = time.time()
        rc = download.run_ytdlp(sub_cmd(client, d, it["video"]), log, PER_CLIENT_SEC)
        info = read_json(d / "src.info.json", {}) or {}
        got = pick_sub(d)
        row = {"client": client, "rc": rc, "sec": round(time.time() - t0, 1),
               "info": bool(info), "ok": bool(got)}
        if got:
            row["file"] = got[1].name
            tries.append(row)
            print(f"   [取れた] {client:<13} {row['sec']:5.1f}秒  {got[1].name}", flush=True)
            return {"ok": True, "client": client, "tries": tries, "why": None}
        auto, manual = ja_tracks(info)
        if info and not auto and not manual:
            no_caps += 1
            row["why"] = "この口の返事に ja の字幕が無い"
        elif info:
            row["why"] = "ja の字幕は一覧にあるが、取れなかった"
        else:
            row["why"] = download.why_failed(log.read_text(errors="ignore"))
        tries.append(row)
        print(f"   [駄目  ] {client:<13} {row['sec']:5.1f}秒  {row['why']}", flush=True)
        if row["why"] == "動画が見られない":
            break
        if no_caps >= NO_CAPS_AGREE:
            return {"ok": False, "client": client, "tries": tries,
                    "why": "この動画には ja の字幕（自動も手動も）がまだ無い"
                           "（配信の直後は遅れて付く。時間をおいて頼み直す）"}
    last = tries[-1]["why"] if tries else "当たる口が無い"
    return {"ok": False, "client": None, "tries": tries, "why": f"字幕が取れなかった（{last}）"}


def caption_text(meta: dict, cap: dict, said: list) -> str:
    """読む用の captions.txt。頭に `# ` の数行（題・URL・長さ・字幕の種類・行数）、そのあと1行1文。"""
    head = [f"# {meta.get('title') or meta.get('id')}", f"# {meta.get('url')}",
            f"# 長さ: {meta.get('duration_hms')}  字幕: {cap.get('lang')}（{cap.get('format')}）",
            f"# 行数: {len(said)}（1行1文。語の時刻で切った）", ""]
    return "\n".join(head) + "".join(f"[{hms(t)}] {s}\n" for t, s in said)


def build(it: dict, d: Path, out: Path, res: dict, ver: str) -> dict:
    """取った字幕を、封の中身（out）に整える。数（平文の manifest に出してよいもの）を返す。"""
    out.mkdir(parents=True, exist_ok=True)
    info = read_json(d / "src.info.json", {}) or {}
    auto, manual = ja_tracks(info)
    meta = {
        "id": info.get("id") or it["video"],
        "url": f"https://www.youtube.com/watch?v={it['video']}",
        "title": info.get("title"), "channel": info.get("channel"),
        "duration": info.get("duration"), "duration_hms": hms(info.get("duration") or 0),
        "upload_date": info.get("upload_date"),
        "release_timestamp": info.get("release_timestamp"),
        "live_status": info.get("live_status"),
        "chapters": info.get("chapters"),
        # YouTube の「よく再生された部分」。区間を選ぶ手がかりになる（再生の少ない動画には無い）
        "heatmap": info.get("heatmap"),
        "captions_available": {"auto_ja": auto, "manual_ja": manual},
        "fetched_at": now_iso(), "client": res.get("client"), "yt_dlp_version": ver,
    }
    write_json(out / "meta.json", meta)
    got = pick_sub(d) if res.get("ok") else None
    rows, said = [], []
    if got:
        lang, p = got
        rows = parse_json3(p) if p.suffix == ".json3" else parse_vtt(p)
        said = lines(rows)
        cap = {"ok": True, "lang": lang, "source": "manual" if lang in (info.get("subtitles") or {})
               else "auto", "format": p.suffix[1:], "segments": rows}
        write_json(out / "captions.json", cap)
        (out / "captions.txt").write_text(caption_text(meta, cap, said), encoding="utf-8")
    else:
        write_json(out / "captions.json", {"ok": False, "why": res.get("why"), "segments": []})
    logs = out / "logs"
    logs.mkdir(exist_ok=True)
    if (d / "ytdlp.log").exists():
        shutil.copy(d / "ytdlp.log", logs / "ytdlp.log")
    files = ["meta.json", "captions.json"] + (["captions.txt"] if got else []) + ["run.json", "logs/"]
    (out / "index.md").write_text("\n".join([
        f"# {it['video']} / captions", "",
        f"- 題名: {meta['title']}", f"- 長さ: {meta['duration_hms']}",
        f"- 字幕: {'取れた（' + got[0] + '）' if got else '取れなかった: ' + str(res.get('why'))}",
        f"- 1行1文の行数: {len(said)}（`captions.txt`）", "",
        "## ファイル", "",
        "- `captions.txt` — 読む用。`[H:MM:SS] 文` を1行1文（句点・1.2秒を越える息つぎ・40字で切る）",
        "- `captions.json` — `segments[]` = start / end / text / words[t, w]（字幕の1行ずつ）",
        "- `meta.json` — 題名・長さ・公開日時・chapters・heatmap（よく再生された部分）",
        "- `run.json` / `logs/ytdlp.log` — 当たった口と成否", "",
        "区間が決まったら、その区間だけを clips / zoom で頼む（README「字幕だけの道」）。", ""]),
        encoding="utf-8")
    write_json(out / "run.json", {
        "item": {k: v for k, v in it.items() if k != "pubkey"}, "created_at": now_iso(),
        "fetch": res, "files": files, "runner": {"run": os.environ.get("RUN_URL")}})
    return {"caption_segments": len(rows), "caption_lines": len(said)}


def main() -> int:
    items = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))["include"]
    sealed_root = Path(sys.argv[2])
    sealed_root.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix="captions-", dir=os.environ.get("RUNNER_TEMP")))
    ver = subprocess.run([sys.executable, "-m", "yt_dlp", "--version"], capture_output=True,
                         text=True).stdout.strip()
    gate = Gate.from_env(count_pending=False)
    print(gate.heading(), flush=True)
    good, bad = None, 0
    try:
        for n, it in enumerate(items):
            t0 = time.time()
            print(f"\n== [{n + 1}/{len(items)}] {it['key']}", flush=True)
            d, out = work / it["key"] / "src", work / it["key"] / "out"
            v = gate.wait()
            print(f"   判定: {v.why}", flush=True)
            if v.ok:
                res = fetch_one(it, d, good)
                good = res.get("client") if res["ok"] else good
            else:
                res = {"ok": False, "client": None, "tries": [],
                       "why": f"Cookie を使い始めなかった: {v.why}"}
            sec = round(time.time() - t0, 1)
            counts = build(it, d, out, res, ver)
            # 段の語だけが平文の manifest に出る（理由の文は run.json の中）
            stages = {"stages": {"download": "ok" if res["ok"] else "failed",
                                 "captions": "ok" if counts["caption_lines"] else "failed"},
                      "counts": counts}
            seal.seal(it, out, sealed_root / it["key"], stages)
            # **平文はここで捨てる。** 置く段は sealed だけを見る
            drop(work / it["key"])
            ok = res["ok"] and counts["caption_lines"] > 0
            bad += 0 if ok else 1
            print(f"   {'OK' if ok else 'NG'}  字幕 {counts['caption_segments']}行 → "
                  f"1行1文 {counts['caption_lines']}行  {sec}秒", flush=True)
    finally:
        drop(work)
    print(f"\n字幕が取れた {len(items) - bad}/{len(items)}", flush=True)
    return 1 if bad else 0


def retext(cap_json: Path) -> int:
    """復号した置き場で captions.txt を作り直す（切りかたを直したとき、取り直さずに揃える）。

        python3 tools/shorts/ingest/quick_captions.py --text <out>/<videoId>/captions/captions.json
    """
    cap = read_json(cap_json, {}) or {}
    if not cap.get("ok"):
        print(f"!! 字幕の無い置き場: {cap.get('why')}")
        return 1
    meta = read_json(cap_json.parent / "meta.json", {}) or {}
    said = lines(cap["segments"])
    (cap_json.parent / "captions.txt").write_text(caption_text(meta, cap, said), encoding="utf-8")
    print(f"captions.txt  {len(said)}行")
    return 0


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--text":
        sys.exit(retext(Path(sys.argv[2])))
    sys.exit(main())
