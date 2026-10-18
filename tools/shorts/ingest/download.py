"""依頼の動画（とチャンネルの一覧）を YouTube から取る。**Actions のランナーで、1本ずつ順に。**

    python3 tools/shorts/ingest/download.py ITEMS.json MEDIA_DIR

## なぜ解析と別の job で、しかも1本ずつなのか

Cookie（`YOUTUBE_COOKIES`）を握るのはここだけにしたい。解析を matrix で並べると
2本の配信が同時に Cookie を使うことになり、`docs/clip-download.md` の
「同じセッションを2か所から同時に使うと、片方が無効化されることがある」を
自分で踏む。**取るのは1つのランナーで順に、重い解析は Cookie 無しで並べて。**
取ったものは Actions のキャッシュで解析の job へ渡す（artifact は公開リポジトリだと
誰でも落とせるので、他人のショートの実物をそこに置かない）。

## 落とし方は `tools/clip/fetch.py` のを使う

口（player_client）の当たり方・PO Token・Cookie の渡し方は、2026-09-22 に
通った `tools/clip/fetch.py` をそのまま読み込んで使う（**読むだけ。書き換えない**）。
口の選び方を2か所に持つと、片方だけ直して片方が古いまま、になる。

## ログに出すもの

段の名前・口・成否・バイト数・縦横・秒数だけ。**題名・説明・字幕は出さない**
（yt-dlp の出力はまるごとファイルに受けて、暗号化する側へ回す）。
"""

from __future__ import annotations

import importlib.util
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import now_iso, read_json, write_json  # noqa: E402
from gate import Gate  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]


def _load_clip_fetch():
    spec = importlib.util.spec_from_file_location("clip_fetch", ROOT / "tools/clip/fetch.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


clip = _load_clip_fetch()
MEDIA_EXT = (".mkv", ".mp4", ".webm", ".m4a", ".opus")


def yt_args(client: str) -> list[str]:
    """`clip.base_args` と同じ4つ（時間切れ・口・PO Token・Cookie）に、
    長い配信を丸ごと落とすための粘りを足したもの。

    `--no-warnings` は付けない。字幕が 429 で落ちたことはここでしか分からない
    （出力はファイルに受けるので、ログには出ない）。
    """
    home = os.environ.get("BGUTIL_HOME", "/tmp/bgutil/server")
    a = [sys.executable, "-m", "yt_dlp", "--no-progress", "--newline",
         "--socket-timeout", "20", "-R", "10", "--fragment-retries", "10",
         "--extractor-args", f"youtube:player_client={client}",
         "--extractor-args", f"youtubepot-bgutilscript:server_home={home}"]
    ck = os.environ.get("CLIP_COOKIES_FILE", "")
    if ck and os.path.exists(ck) and os.path.getsize(ck) > 0:
        a += ["--cookies", ck]
    return a


def find_client(url: str, first: str | None, rounds: int = 3, pause: int = 60) -> tuple[str | None, str]:
    order = ([first] if first else []) + [c for c in clip.CLIENTS if c != first]
    for r in range(rounds):
        whys = []
        for c in order:
            ok, why, dt = clip.probe_client(url, c)
            # 断り文句は「ボット確認」などの決まった語か yt-dlp の1行。題名は入らない
            print(f"   [{'見えた' if ok else '駄目  '}] {r + 1}周目 {c:<13} {dt:5.1f}秒"
                  f"{'' if ok else '  ' + why[:80]}", flush=True)
            if ok:
                return c, ""
            whys.append(why)
        # **全部の口が「Video unavailable」なら、粘っても出てこない**（消された・非公開）。
        # 1つの口だけがそう言うことはある（2026-10-15 に default が言って mweb で取れた）
        if whys and all("Video unavailable" in w for w in whys):
            print("   どの口でも Video unavailable。粘らない", flush=True)
            return None, "動画が見られない（どの口でも Video unavailable）"
        if r < rounds - 1:
            print(f"   全部断られた。{pause}秒あける", flush=True)
            time.sleep(pause)
    return None, "どの口も通らなかった"


REF_MAX_SEC = 240
# 取り直しても変わらない理由。これで落ちたら口を当たり直さずに次の動画へ進む
FINAL = ("長尺", "動画が見られない")


def why_failed(log: str) -> str:
    if "does not pass filter" in log:
        return f"長尺（{REF_MAX_SEC}秒超）なので取らなかった"
    if clip.BOT in log:
        return "ボット確認"
    if "HTTP Error 429" in log:
        return "429（取りすぎ）"
    if re.search(r"Private video|Video unavailable|This video is not available", log):
        return "動画が見られない"
    if "Requested format is not available" in log:
        return "形式が無い"
    return "その他（ytdlp.log）"


def run_ytdlp(cmd: list[str], log: Path, timeout: int) -> int:
    with open(log, "a", encoding="utf-8") as f:
        f.write(f"\n$ yt-dlp {' '.join(cmd[3:])}\n")
        f.flush()
        try:
            return subprocess.run(cmd, stdout=f, stderr=subprocess.STDOUT, timeout=timeout).returncode
        except subprocess.TimeoutExpired:
            f.write(f"\n!! {timeout}秒で戻らず\n")
            return 124


def media_files(d: Path) -> list[Path]:
    return sorted(p for p in d.glob("src.*") if p.suffix in MEDIA_EXT and ".part" not in p.name)


def ffprobe_dur(p: Path) -> float:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                        "-of", "default=nw=1:nk=1", str(p)], capture_output=True, text=True)
    try:
        return float(r.stdout.strip())
    except ValueError:
        return 0.0


def fetch_video(it: dict, d: Path, client: str) -> dict:
    """1本取る。成否は「頼んだ長さの9割以上の動画が読めたか」で決める。"""
    url = f"https://www.youtube.com/watch?v={it['video']}"
    log = d / "ytdlp.log"
    if it["mode"] == "zoom":
        s, e = it["range"]
        # コマを大きく頼まれたら、元もそれに見合う大きさで取る（短いほうの辺で 720 か 1080）
        res = 1080 if int(it.get("tile") or 0) > 1280 * 0.75 else 720
        fmt = ["-f", "bv*", "-S", f"res:{res},+vcodec:avc",
               "--download-sections", f"*{s}-{e}", "--write-info-json"]
        want, timeout = e - s, 900
    elif it["mode"] == "clips":
        # **区間ごとに `--download-sections` で取らず、1本まるごと元の画質で取る。**
        # 区間取りは yt-dlp が ffmpeg の `-ss … -c copy` で落とすので、頭が
        # 区間の手前のキーフレームに寄り、そのファイルの 0秒が配信の何秒かが
        # 確かめられない（zoom の秒の足し込みはそこを信じている）。編集の素材は
        # 1コマ単位で頭を合わせたいので、配信と同じ時間軸のファイルを1本持ち、
        # 切るのは解析の job（Cookie 無し）で ffmpeg に任せる。
        # 並べ方は「縦横 → fps → 符号化」。縦横と fps を落とさないのが先で、
        # 同じ縦横・fps なら avc1 を選ぶ（`vcodec:avc` は「h264 より上の符号化は
        # 後回し」の意味）。YouTube は同じ縦横なら avc1 にいちばん多くビットを割くうえ、
        # zoom（`+vcodec:avc`）と同じ元になるのでコマを突き合わせられる。
        # avc1 が最大の縦横に無い動画では、縦横を優先して別の符号化を取る。
        # 音は既定の並び（opus が aac より先）でいちばん良いもの
        fmt = ["-f", "bv*+ba/b", "-S", "res,fps,vcodec:avc",
               "--merge-output-format", "mkv", "--write-info-json"]
        want, timeout = None, 3000
    else:
        # **短いほうの辺で 480 まで**（`-S res:`）。縦の配信を `height<=480` で絞ると
        # 270x480 まで落ちる（tools/clip/fetch.py の grab() の説明）。
        fmt = ["-f", "bv*+ba/b", "-S", "res:480,+codec:avc:m4a",
               "--merge-output-format", "mkv", "--write-info-json",
               "--write-subs", "--write-auto-subs", "--sub-langs", "ja-orig,ja",
               "--sub-format", "json3/vtt/best", "--ignore-errors"]
        want, timeout = None, 3000
        if it["mode"] == "reference":
            # 参考は60秒〜3分のショートのつもりで頼む。長尺が混ざっていたら取らずに飛ばす
            # （1時間の動画を1秒1コマで並べると3600コマになる）
            fmt += ["--match-filter", f"duration <= {REF_MAX_SEC}"]
    rc = run_ytdlp(yt_args(client) + fmt + ["-o", str(d / "src.%(ext)s"), url], log, timeout)
    info = read_json(d / "src.info.json", {}) or {}
    if want is None:
        want = float(info.get("duration") or 0)
    files = media_files(d)
    vid = next((p for p in files if p.suffix in (".mkv", ".mp4", ".webm")), None)
    got = ffprobe_dur(vid) if vid else 0.0
    ok = bool(vid) and (not want or got >= want * 0.9)
    subs = sorted(p.name for p in d.glob("src.*") if p.suffix in (".json3", ".vtt"))
    return {"ok": ok, "rc": rc, "client": client, "file": vid.name if vid else None,
            "bytes": vid.stat().st_size if vid else 0, "duration": round(got, 1),
            "want": round(want, 1), "subs": subs,
            "why": None if ok else why_failed(log.read_text(errors="ignore"))}


def fetch_channel(it: dict, d: Path, client: str, gate: Gate | None = None) -> dict:
    """チャンネルのタブ（既定 shorts）の一覧を取り、上位は1本ずつ詳しく引く。

    一覧（`--flat-playlist`）だけだと、ショートのタブは**長さと投稿日が空**で返る
    （ショートの札に載っていない）。だから再生数の多い順に `details` 本まで、
    1本ずつのページから長さ・投稿日・高評価数を引き直す。媒体は取らない。
    """
    ch = it["channel"]
    base = (f"https://www.youtube.com/{ch}" if ch.startswith("@")
            else f"https://www.youtube.com/channel/{ch}")
    url = f"{base}/{it['tab']}"
    log = d / "ytdlp.log"
    flat = d / "flat.json"
    cmd = yt_args(client) + ["--flat-playlist", "-J", "--playlist-end", str(it["limit"]),
                             "--extractor-args", "youtubetab:approximate_date", url]
    with open(log, "a", encoding="utf-8") as lf, open(flat, "w", encoding="utf-8") as out:
        lf.write(f"\n$ yt-dlp {' '.join(cmd[3:])}\n")
        lf.flush()
        rc = subprocess.run(cmd, stdout=out, stderr=lf, timeout=600).returncode
    data = read_json(flat, {}) or {}
    entries = [e for e in (data.get("entries") or []) if e.get("id")]
    res = {"ok": bool(entries), "rc": rc, "client": client, "entries": len(entries),
           "why": None if entries else why_failed(log.read_text(errors="ignore"))}
    if not entries:
        return res

    top = sorted(entries, key=lambda e: -(e.get("view_count") or 0))[:it["details"]]
    detail = d / "details.jsonl"
    t0, done, waited = time.time(), 0, 0.0
    # 25本ずつ。**ほかの取り込みと時間切れを塊ごとに見る**（途中で止めても引けたぶんは残す）。
    # 20分は引いている時間で数える（ほかの取り込みを待ったぶんは足さない）
    for i in range(0, len(top), 25):
        if time.time() - t0 - waited > 1200:
            res["details_stopped"] = "20分で打ち切り"
            break
        if gate is not None:
            v = gate.wait()
            waited += v.waited
            if v.waited or not v.ok:
                print(f"   判定: {v.why}", flush=True)
            if not v.ok:
                res["details_stopped"] = f"Cookie を使い始めなかった（{v.how}）"
                break
        batch = d / f"_batch{i // 25}.txt"
        batch.write_text("".join(f"https://www.youtube.com/watch?v={e['id']}\n"
                                 for e in top[i:i + 25]))
        tmpl = ("%(.{id,title,duration,upload_date,timestamp,release_timestamp,view_count,"
                "like_count,comment_count,live_status,availability})j")
        c2 = yt_args(client) + ["--skip-download", "--ignore-no-formats-error", "-i",
                                "--sleep-requests", "1", "-O", tmpl, "-a", str(batch)]
        with open(log, "a", encoding="utf-8") as lf, open(detail, "a", encoding="utf-8") as out:
            lf.write(f"\n$ yt-dlp {' '.join(c2[3:])}\n")
            lf.flush()
            try:
                subprocess.run(c2, stdout=out, stderr=lf, timeout=900)
            except subprocess.TimeoutExpired:
                lf.write("\n!! 900秒で戻らず\n")
        done = sum(1 for _ in open(detail, encoding="utf-8"))
        print(f"   詳しく引けた {done}/{len(top)}", flush=True)
    res["details"] = done
    res["details_sec"] = round(time.time() - t0, 1)
    return res


def main() -> int:
    items = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))["include"]
    # **一覧（channel）は最後。** 1本ずつ引き直すので1チャンネル7分かかる（2026-10-15 に
    # 実測 60本で412秒）。ほかの取り込みに掛かって途中で止めるなら、動画のほうを先に取っておく
    order = {"archive": 0, "zoom": 1, "clips": 1, "reference": 2, "channel": 3}
    items.sort(key=lambda it: order.get(it["mode"], 9))
    media = Path(sys.argv[2])
    media.mkdir(parents=True, exist_ok=True)
    good: str | None = None
    rows = []
    ver = subprocess.run([sys.executable, "-m", "yt_dlp", "--version"], capture_output=True,
                         text=True).stdout.strip()
    # **1本ごとに、Cookie を使うほかの取り込みが動き出していないかを見る**（plan で見てから
    # ここまで、ランナー待ちと道具の入れで数分あく）。動いていれば待つ。待ちの持ち時間は
    # この job で合わせて60分。`pending` は数えない（gate.py の頭。master で回すと、
    # 毎晩の取り込みの `pending` はこの job が終わるのを待っている）
    gate = Gate.from_env(count_pending=False)
    print(gate.heading(), flush=True)
    for n, it in enumerate(items):
        d = media / it["key"]
        d.mkdir(parents=True, exist_ok=True)
        st = {"key": it["key"], "mode": it["mode"], "started_at": now_iso(), "tries": [],
              "yt_dlp_version": ver}
        print(f"\n== [{n + 1}/{len(items)}] {it['key']}", flush=True)
        v = gate.wait()
        if n == 0 or v.waited or not v.ok:
            print(f"   判定: {v.why}", flush=True)
        if not v.ok:
            st.update(ok=False, why=f"Cookie を使い始めなかった: {v.why}")
            write_json(d / "fetch.json", st)
            rows.append(st)
            continue
        t0 = time.time()
        probe_url = (f"https://www.youtube.com/watch?v={it['video']}" if it.get("video")
                     else "https://www.youtube.com/watch?v=jNQXAC9IVRw")
        for attempt in range(3):
            client, nowhy = find_client(probe_url, good)
            if not client:
                st["tries"].append({"ok": False, "why": nowhy})
                break
            try:
                r = (fetch_channel(it, d, client, gate) if it["mode"] == "channel"
                     else fetch_video(it, d, client))
            except Exception as e:  # noqa: BLE001 — 1本の失敗で残りを止めない
                r = {"ok": False, "client": client, "why": f"{type(e).__name__}"}
            st["tries"].append(r)
            if r["ok"]:
                good = client
                break
            if (r.get("why") or "").startswith(FINAL):
                good = client
                print(f"   取らない（{r['why']}）", flush=True)
                break
            good = None
            print(f"   取れなかった（{r['why']}）。30秒あけて口から当たり直す", flush=True)
            time.sleep(30)
        last = st["tries"][-1] if st["tries"] else {}
        st.update(ok=bool(last.get("ok")), why=last.get("why"), sec=round(time.time() - t0, 1),
                  finished_at=now_iso())
        write_json(d / "fetch.json", st)
        rows.append(st)
        if it["mode"] == "channel":
            print(f"   {'OK' if st['ok'] else 'NG'}  一覧 {last.get('entries', 0)}本 / "
                  f"詳しく {last.get('details', 0)}本  {st['sec']}秒", flush=True)
        else:
            print(f"   {'OK' if st['ok'] else 'NG'}  {last.get('bytes', 0) / 1e6:.1f}MB  "
                  f"{last.get('duration', 0)}秒（頼んだ {last.get('want', 0)}秒）  "
                  f"字幕 {len(last.get('subs') or [])}本  {st['sec']}秒", flush=True)
        time.sleep(5)
    write_json(media / "fetch-summary.json", rows)
    ok = sum(1 for r in rows if r.get("ok"))
    print(f"\n取れた {ok}/{len(rows)}", flush=True)
    # **ここでは赤くしない。** 取れなかった動画も「取れなかった」という manifest を
    # 解析の job が置く。ここで止めると、何が取れなかったかが枝に届かない。
    return 0


if __name__ == "__main__":
    sys.exit(main())
