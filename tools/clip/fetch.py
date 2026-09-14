"""配信の好きな区間だけを mp4 で持ち帰る。**Actions のランナーで走らせる。**

## なぜ丸ごと落とさないのか

1日目は10時間52分ある。丸ごと落とすと、取れても30分掛かり、取れなければ30分捨てる。
**要るのは1分半の区間だけ**なので `--download-sections` で範囲だけ取る。
1本20〜40秒で終わるから、断られても安く次の口を試せる。

## なぜ「先に形式だけ聞く」のか

ボット確認は**媒体を取りに行く前、player に聞いた時点で**出る。
`--print` で形式を聞けば数秒で分かるので、**全部の口を先に当たって通る口を
1つ見つけてから**、その口だけで落とす。
`day1_cut.py` は口を1つずつ当たっては落としに行っていたので、1周に何分も掛かって
「24回試して6時間」になっていた。ここは1周が1分で終わる。

**絵コンテ（storyboard）だけ返ってくる状態を「通った」と数えない。**
ボット確認のとき yt-dlp は終了コード 0 のまま画像形式だけ並べることがある。
`sb0 / mhtml` を数えると「通った」と誤報する。

## 通らないときに何が起きたかを残す

口ごとに「本物の形式が見えたか」「断り文句は何か」を表にして `out/report.md` に置く。
**1回通っただけでは根拠にならない**ので、日をまたいで同じ表を見比べられるようにする。

## 出来たものを「あるかどうか」で見ない

配信の終わりを越えた区間を頼むと、yt-dlp は**短いものを黙って返す**
（5分の動画に 6:00-6:30 を頼むと2秒のものが出来る）。ファイルの有無だけを
見ると、これが「取れた」で通る。**頼んだ長さの半分に届かないものは落とす。**

## 手元で確かめるとき

`CLIP_SOURCE_URL` に mp4 を配る URL を置くと、YouTube の代わりにそこから取る。
**差し込みが無ければ、今までどおり YouTube を見る**（本番はこちら）。
口の当たり直しは YouTube にしか意味が無いので、差し込みがあるときだけ飛ばす。
確かめかたは `tools/clip/selftest.sh`。

    python3 tools/clip/fetch.py f3W2JxAHsQs "0:54:10-0:55:30,0:57:40-0:59:20"
"""

import json
import os
import pathlib
import re
import subprocess
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parents[2]
# 書き出す先。**既定は今までどおりリポジトリ直下の `out/`**（ワークフローはここを渡す）。
# 手元で確かめるときだけ、作業用の場所に逃がせるようにしてある。
OUT = pathlib.Path(os.environ.get("CLIP_OUT") or (ROOT / "out"))

# 当たる順。**上から順に、いま通りやすいと実測で分かっているもの。**
# 順番は out/report.md の実測で入れ替える。憶測で並べない。
CLIENTS = ["tv_simply", "default", "tv", "web_safari", "web_embedded",
           "mweb", "web", "android_vr", "ios"]

BOT = "Sign in to confirm"


def secs(t):
    """`0:54:10` も `3250` も受ける。"""
    if ":" not in t:
        return int(float(t))
    p = [float(x) for x in t.split(":")]
    while len(p) < 3:
        p.insert(0, 0.0)
    return int(p[0] * 3600 + p[1] * 60 + p[2])


def source_url(video):
    """本番は YouTube。差し込みがあるときだけ、そちらを見る。

    **差し込みは手元で確かめるためだけのもの。** 環境変数が無ければ
    1文字も経路が変わらないように、ここ1か所で決める。
    """
    return os.environ.get("CLIP_SOURCE_URL", "").strip() or \
        f"https://www.youtube.com/watch?v={video}"


def base_args(client):
    home = os.environ.get("BGUTIL_HOME", "/tmp/bgutil/server")
    a = [sys.executable, "-m", "yt_dlp", "--no-progress", "--no-warnings",
         # **黙って何分も待たせない。** 既定は20秒×10回で、断られているのか
         # 詰まっているのか分からないまま1本が2分になる。
         "--socket-timeout", "15", "-R", "2",
         "--extractor-args", f"youtube:player_client={client}",
         "--extractor-args", f"youtubepot-bgutilscript:server_home={home}"]
    # **使い捨てアカウントの Cookie があれば使う。無ければ使わない。**
    # 毎晩の取り込みが握っている YOUTUBE_COOKIES には絶対に触らない。
    ck = os.environ.get("CLIP_COOKIES_FILE", "")
    if ck and os.path.exists(ck) and os.path.getsize(ck) > 0:
        a += ["--cookies", ck]
    return a


def probe_client(url, client, timeout=75):
    """その口で「本物の映像形式」が見えるかを聞く。落としには行かない。

    **かかった秒数も返す。** 断られたのか詰まったのかは、文句だけでは分からない。
    2秒で断られたのと75秒で戻らなかったのを同じ「×」にすると、次の手が選べない。
    """
    cmd = base_args(client) + [
        "--skip-download", "--print", "%(format_id)s %(vcodec)s %(height)s",
        "-f", "bv*[height<=720]", url]
    t0 = time.time()
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return 0, f"{timeout}秒で戻らず", timeout
    dt = time.time() - t0
    out = (p.stdout or "").strip()
    err = (p.stderr or "").strip().splitlines()
    ok = bool(re.search(r"\s(avc1|vp0?9|av01)", out))
    if ok:
        return 1, out.splitlines()[0][:60], dt
    why = next((l for l in reversed(err) if l.strip()), "")[:180]
    return 0, ("ボット確認" if BOT in why else (why or "映像形式が無い")), dt


def grab(url, client, start, end, height, dst, fmt=None):
    cmd = base_args(client) + [
        "-f", fmt or f"bv*[height<={height}]+ba/b[height<={height}]",
        "--merge-output-format", "mp4",
        "--download-sections", f"*{start}-{end}",
        "-o", str(dst), url]
    print("$", " ".join(cmd[3:]), flush=True)
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
    except subprocess.TimeoutExpired:
        print("  -> 1800秒で戻らず", flush=True)
        return False
    if p.returncode != 0:
        tail = (p.stderr or p.stdout).strip().splitlines()
        print("  ->", (tail[-1] if tail else "")[:200], flush=True)
    return p.returncode == 0


def ffprobe(path):
    p = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "format=duration:stream=width,height,codec_name",
         "-of", "json", str(path)], capture_output=True, text=True)
    try:
        d = json.loads(p.stdout)
        st = (d.get("streams") or [{}])[0]
        return (float(d["format"]["duration"]), st.get("width"), st.get("height"),
                st.get("codec_name"))
    except Exception:
        return (0.0, None, None, None)


def main():
    video = sys.argv[1]
    spans = [s for s in (sys.argv[2] if len(sys.argv) > 2 else "").split(",") if s.strip()]
    height = os.environ.get("CLIP_HEIGHT", "720")
    rounds = int(os.environ.get("CLIP_ROUNDS", "3"))
    pause = int(os.environ.get("CLIP_PAUSE", "120"))
    src = source_url(video)
    # 差し込み先は YouTube ではないので、口を当たり直しても何も分からない。
    # **本番（差し込み無し）のときは、ここから下は今までと1行も変わらない。**
    local = src != f"https://www.youtube.com/watch?v={video}"
    OUT.mkdir(exist_ok=True)

    rows, good = [], None
    if local:
        good = "default"
        print(f"== 差し込み先から取る: {src}\n", flush=True)
    else:
        for r in range(rounds):
            for c in CLIENTS:
                n, why, dt = probe_client(src, c)
                rows.append((r + 1, c, n, why, dt))
                print(f"[{'見えた' if n else '駄目  '}] {r + 1}周目 client={c:<13} "
                      f"{dt:5.1f}秒 {why}", flush=True)
                if n:
                    good = c
                    break
            if good:
                break
            if r < rounds - 1:
                print(f"--- 全部断られた。{pause}秒あける", flush=True)
                time.sleep(pause)

    lines = ["# 取れたか取れなかったか", "",
             f"- 配信: `{video}`",
             f"- 出どころ: {'差し込み（手元で確かめている）' if local else 'YouTube'}",
             f"- 時刻: {time.strftime('%Y-%m-%d %H:%M:%S')} UTC",
             f"- Cookie: {'あり' if os.environ.get('CLIP_COOKIES_FILE') else 'なし'}", "",
             "| 周 | player_client | 映像形式 | かかった秒 | 断り文句 / 見えた形式 |",
             "| --- | --- | --- | --- | --- |"]
    lines += [f"| {r} | `{c}` | {'○' if n else '×'} | {dt:.1f} | {w} |"
              for r, c, n, w, dt in rows]

    made, bad = [], 0
    if good:
        if not local:
            print(f"\n== {good} で通った。区間を落とす\n", flush=True)
        for i, sp in enumerate(spans, 1):
            a, b = sp.split("-")
            s, e = secs(a), secs(b)
            dst = OUT / f"{video}_{i:02d}_{s}-{e}.mp4"
            # 差し込み先は mp4 が1本あるだけで、縦で絞ると1つも選べない。
            # **本番の選び方（CLIP_HEIGHT で絞る）はそのまま。**
            fmt = "bv*+ba/b" if local else None
            if grab(src, good, s, e, height, dst, fmt) and dst.exists():
                made.append((dst, s, e))
            else:
                print(f"  NG  {s}〜{e}秒  ← ファイルが出来ていません", flush=True)
                bad += 1
    else:
        print("\n!! どの口も通らなかった", flush=True)
        bad += len(spans)

    # **「落ちてきた」で終わらせない。** 配信の終わりを越えた区間を頼むと
    # yt-dlp は短いものを黙って返すので、頼んだ長さと出来た長さを突き合わせる。
    lines += ["", "## 出来たもの", ""]
    if made:
        lines += ["| ファイル | 元の位置 | 尺 | 解像度 | 符号 | |",
                  "| --- | --- | --- | --- | --- | --- |"]
        for dst, s, e in made:
            d, w, h, cd = ffprobe(dst)
            want = e - s
            # 空の器でも拡張子は .mp4 になる。長さと縦横が読めることまで見る
            if not d or not w or not h:
                mark, why = "NG", "ffprobe が読めません"
            elif d * 2 < want:
                mark, why = "NG", "配信の終わりを越えていませんか"
            else:
                mark, why = "OK", ""
            if mark == "NG":
                bad += 1
            lines.append(f"| `{dst.name}` | {s}〜{e}秒 (見込み {want}秒) | "
                         f"{d:.1f}秒 | {w}x{h} | {cd} | {mark} {why} |")
            print(f"  {mark}  {dst.name}  頼んだ {want}秒 / 出来た {d:.1f}秒  "
                  f"{w}x{h}  {cd}  {why}", flush=True)
    else:
        lines.append("無し。")
    (OUT / "report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines), flush=True)
    # **出来たぶんは artifact で持ち帰れる**（ワークフローは赤くても上げる）。
    # 赤くするのは、頼んだものと違うことに気づかずに使わないため
    if bad:
        print(f"\n!! 頼んだとおりになっていないものが {bad}本あります", flush=True)
    sys.exit(0 if made and not bad else 1)


if __name__ == "__main__":
    main()
