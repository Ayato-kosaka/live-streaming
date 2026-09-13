"""1日目の配信4本から、ショートの素材になる mp4 を切り出して1本に繋ぐ。

## なぜこれが Actions の中にあるか

作業箱から媒体（googlevideo）に取りに行くと、何をしても 403 になる。
署名付き URL は**取りに来た IP に紐づく**のに、箱の出口は接続ごとに別の IP へ
移る（実測で 160.79.106.128 / .131 / .137 が混ざる）。抽出した IP と
取りに行く IP が一致しないので、YouTube は当然断る。ffmpeg でも yt-dlp 自身でも
同じで、手元では 20 回試して 20 回とも 403 だった。
**ランナーは1つの IP で最後まで通る。** だからここでやる。

もう1つ、PO Token が要る。今の YouTube は媒体の URL に `pot` が無いと
ほぼ弾く。BotGuard を deno で回して作る（bgutil-ytdlp-pot-provider）。

## 使い方

    python3 tools/clip/day1_cut.py chat    # コメントの記録を取る
    python3 tools/clip/day1_cut.py scan    # 場面の当たりを出す
    python3 tools/clip/day1_cut.py build   # 落として切って繋ぐ
"""

import json
import os
import pathlib
import subprocess
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parents[2]
CHAT = ROOT / "chat"
WORK = ROOT / "work"
OUT = ROOT / "out"
SCENES = pathlib.Path(__file__).with_name("day1_scenes.json")

# 1日目の配信。順番が話の順番。
# 後ろ2本は1日目の**前**。「バイバイ一年住んだジョージア」はそこにしか無い。
# コメントは6本ぶん見るが、**落とすのは場面表に出てくる配信だけ。**
VIDEOS = ["hrXYXcu9IDE", "HCI2IKaVEuQ", "sxIz_bKd7SQ", "Mzf_LgF6Cxc",
          "lzJshROVAl4", "tXlQDwZQRBE"]

# 視聴者さんが場面を教えてくれる言葉。**筋書きの各行に対応させてある。**
MARKERS = [
    "ロータリー", "くるくる", "目が回", "教会", "チーズ", "スープ", "ワルシャワ",
    "サービスエリア", "バス", "ボード", "乗せ", "ヒッチ", "パン", "野宿", "夕日",
    "カメラ", "ニキ", "逆", "止まら", "おっちゃん", "おじ", "スケート", "ローラー",
    "着いた", "到着", "泣", "ヒーロー", "神", "空港", "街", "乗っ", "ありがとう",
]


def sh(cmd, **kw):
    print("$", " ".join(cmd), flush=True)
    return subprocess.run(cmd, check=True, **kw)


def ytdlp(args, tries=24, gentle=True, limit=1800):
    """yt-dlp を叩く。

    **ボット確認（Sign in to confirm you're not a bot）は、出たり出なかったりする。**
    ランナーの IP は世界中の取得に使われていて評判が悪いので、断られる方が多い。
    効くのは「別の口で、間を空けて、何度も」だけ。Cookie は使わない（毎晩の
    取り込みが使っている鍵を回してしまう）。

    実測では、同じ配信でも数分あけると通ることがある。だから**諦めるのが早いと
    落とせない。** 既定で24回、間を最大2分まで広げながら試す。

    `gentle=False` はコメント取り用。あちらは細切れの取得を何百回も繰り返すので、
    1回ごとに2秒待たせると10時間の配信で何十分も掛かる。
    """
    home = os.environ.get("BGUTIL_HOME", "/tmp/bgutil/server")
    clients = ["default", "tv", "web_safari", "visionos", "web", "web_embedded",
               "tv_simply", "mweb", "android_vr"]
    last = ""
    for i in range(tries):
        c = clients[i % len(clients)]
        extra = ["youtube:player_client=" + c]
        # 何度か目からは webpage を取りに行かせない。**あそこで断られることが多い。**
        if i >= len(clients):
            extra[0] += ";player_skip=webpage,configs"
        cmd = [sys.executable, "-m", "yt_dlp", "--no-progress"]
        cmd += ["--sleep-requests", "2"] if gentle else []
        for e in extra:
            cmd += ["--extractor-args", e]
        cmd += ["--extractor-args", f"youtubepot-bgutilscript:server_home={home}"]
        cmd += args
        try:
            p = subprocess.run(cmd, capture_output=True, text=True, timeout=limit)
        except subprocess.TimeoutExpired:
            print(f"-- {i + 1}/{tries} client={c} {limit}秒で戻らず", flush=True)
            continue
        if p.returncode == 0:
            print(f"++ {i + 1}/{tries} client={c} で通った", flush=True)
            return True
        last = (p.stdout + p.stderr).strip().splitlines()
        why = last[-1][:160] if last else ""
        print(f"-- {i + 1}/{tries} client={c} {why}", flush=True)
        time.sleep(min(15 * (i + 1), 120))
    print(f"!! 諦めた: {' '.join(args)}", flush=True)
    return False


def parse_chat(src):
    """live_chat の記録から (秒, 名前, 本文) を起こす。
    **各行に videoOffsetTimeMsec が入っている**ので、配信内の位置がそのまま取れる。"""
    rows = []
    for line in open(src, encoding="utf-8"):
        line = line.strip()
        if not line:
            continue
        try:
            d = json.loads(line)
        except ValueError:
            continue
        rca = d.get("replayChatItemAction") or {}
        off = int(rca.get("videoOffsetTimeMsec") or 0)
        for a in rca.get("actions", []):
            item = (a.get("addChatItemAction") or {}).get("item") or {}
            for _, v in item.items():
                msg = v.get("message") or {}
                txt = "".join(r.get("text", "") for r in msg.get("runs", []))
                if not txt:
                    txt = msg.get("simpleText", "")
                if txt:
                    who = (v.get("authorName") or {}).get("simpleText", "")
                    rows.append([off // 1000, who, txt])
    return rows


def hm(s):
    return f"{s // 3600}:{(s % 3600) // 60:02d}:{s % 60:02d}"


def cmd_chat():
    CHAT.mkdir(exist_ok=True)
    for v in VIDEOS:
        raw = CHAT / f"{v}.live_chat.json"
        if not raw.exists():
            ytdlp(["--skip-download", "--write-subs", "--sub-langs", "live_chat",
                   "-o", str(CHAT / "%(id)s.%(ext)s"),
                   f"https://www.youtube.com/watch?v={v}"], tries=8, gentle=False)
        if raw.exists():
            rows = parse_chat(raw)
            json.dump(rows, open(CHAT / f"{v}.chat.json", "w"), ensure_ascii=False)
            print(f"{v}: {len(rows)} 件 (0〜{hm(rows[-1][0]) if rows else '-'})", flush=True)
        else:
            print(f"{v}: コメントが取れなかった", flush=True)


def cmd_scan():
    """場面の当たりを出す。**切る位置を決めるのは人**で、これはその材料。"""
    for v in VIDEOS:
        f = CHAT / f"{v}.chat.json"
        if not f.exists():
            print(f"\n##### {v}: 記録なし")
            continue
        rows = json.load(open(f))
        print(f"\n##### {v} ({len(rows)} 件)")
        for k in MARKERS:
            hits = [(t, x) for t, _, x in rows if k in x]
            if hits:
                print(f"--- {k} ({len(hits)})")
                for t, x in hits[:12]:
                    print("   ", hm(t), x[:56])


def download(v, height, tries=24):
    """h264 + m4a で揃えて落とす。**揃えておくと、繋ぐときに焼き直さずに済む。**"""
    dst = WORK / f"{v}.mp4"
    if dst.exists():
        return dst
    WORK.mkdir(exist_ok=True)
    ok = ytdlp([
        "-f", f"bv*[height<={height}][vcodec^=avc1]+ba[ext=m4a]/b[height<={height}]",
        "--merge-output-format", "mp4",
        "-o", str(WORK / "%(id)s.%(ext)s"),
        f"https://www.youtube.com/watch?v={v}",
    ], tries=tries)
    return dst if ok and dst.exists() else None


def cmd_check():
    """媒体が本当に取れるかを、いちばん短い配信で確かめる。
    **長い方を回してから 403 だと分かるのが、いちばん高くつく。**

    どの player_client なら通るかは日によって変わるので、**全部試して表にする。**
    1つ落ちるたびに止めると、往復のたびに1つしか分からない。"""
    WORK.mkdir(exist_ok=True)
    home = os.environ.get("BGUTIL_HOME", "/tmp/bgutil/server")
    v = "Mzf_LgF6Cxc"  # 19分46秒。144p なら 9MB 弱
    url = f"https://www.youtube.com/watch?v={v}"
    clients = ["default", "web", "web_safari", "tv", "web_embedded",
               "visionos", "mweb", "android", "ios"]
    good = []
    for c in clients:
        cmd = [sys.executable, "-m", "yt_dlp", "--no-progress", "--no-warnings",
               "--extractor-args", f"youtube:player_client={c}",
               "--extractor-args", f"youtubepot-bgutilscript:server_home={home}",
               "-f", "394/160/worstvideo/worst",
               "-o", str(WORK / f"chk_{c}.%(ext)s"), url]
        try:
            p = subprocess.run(cmd, capture_output=True, text=True, timeout=240)
            rc, err = p.returncode, (p.stderr or p.stdout).strip().splitlines()
        except subprocess.TimeoutExpired:
            rc, err = -9, ["240秒で戻らず"]
        got = sorted(WORK.glob(f"chk_{c}.*"))
        size = sum(f.stat().st_size for f in got)
        mark = "取れた" if rc == 0 and size else "駄目"
        why = err[-1][:150] if err else ""
        print(f"[{mark}] client={c:<13} rc={rc:<3} {size:>10} バイト  {why}", flush=True)
        if rc == 0 and size:
            good.append(c)
    print(f"\n通った player_client: {good or 'なし'}", flush=True)
    if not good:
        sys.exit(1)


def probe_dur(path):
    """出来たものの尺を測る。**見込みと違ったら、繋ぎ方が合っていない。**"""
    p = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                        "-of", "csv=p=0", str(path)], capture_output=True, text=True)
    try:
        return float(p.stdout.strip())
    except ValueError:
        return 0.0


def cmd_build():
    height = os.environ.get("CLIP_HEIGHT", "720")
    scenes = json.load(open(SCENES))
    OUT.mkdir(exist_ok=True)

    # **1本を粘るより、順番に1回ずつ当たって何周もする方が通る。**
    # ボット確認は IP の評判で出るので、同じ配信を続けざまに叩くと余計に固くなる。
    # 実際、probe で4本ぶんのコメントが取れた直後に full を重ねたら、
    # そこから43分ぶん24回、一度も通らなくなった。
    need = sorted({s["video"] for s in scenes})
    have = {}
    rounds = int(os.environ.get("CLIP_ROUNDS", "22"))
    pause = int(os.environ.get("CLIP_PAUSE", "600"))
    for r in range(rounds):
        left = [v for v in need if v not in have]
        if not left:
            break
        print(f"=== {r + 1}周目 残り {left}", flush=True)
        for v in left:
            p = download(v, height, tries=1)
            if p:
                have[v] = p
                print(f"++ {v} 取れた", flush=True)
        if [v for v in need if v not in have] and r < rounds - 1:
            print(f"--- 一息入れる（{pause}秒）", flush=True)
            time.sleep(pause)
    for v in need:
        if v not in have:
            print(f"!! {v} が落とせなかった。この配信の場面は飛ばす", flush=True)

    made, missing = [], []
    for i, s in enumerate(scenes, 1):
        v = s["video"]
        if v not in have:
            missing.append(s)
            continue
        name = f"{i:02d}_{s['slug']}.mp4"
        dst = OUT / name
        dur = s["end"] - s["start"]
        # **切るのは長めに。** 詰めるのはあやとがやる。
        sh(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-ss", str(s["start"]), "-i", str(have[v]), "-t", str(dur),
            "-c", "copy", "-avoid_negative_ts", "make_zero", str(dst)])
        made.append((name, s))

    # 繋ぐ。まずは焼き直さずに繋いでみる。
    # **配信が違うと画の作りも違うことがある**ので、繋いだ尺が合わなければ焼き直す。
    if made:
        want = sum(s["end"] - s["start"] for _, s in made)
        lst = WORK / "concat.txt"
        lst.write_text("".join(f"file '{(OUT / n).as_posix()}'\n" for n, _ in made))
        joined = OUT / "day1_joined.mp4"
        base = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-f", "concat", "-safe", "0", "-i", str(lst)]
        subprocess.run(base + ["-c", "copy", str(joined)], check=False)
        got = probe_dur(joined)
        print(f"繋いだ尺 {got:.0f}秒 / 見込み {want}秒", flush=True)
        if got < want * 0.97:
            print("尺が合わないので焼き直す", flush=True)
            sh(base + ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
                       "-c:a", "aac", "-b:a", "128k", str(joined)])
            print(f"焼き直し後 {probe_dur(joined):.0f}秒", flush=True)

    # どの場面がどの配信の何分何秒か。**これが無いと差し替えられない。**
    lines = ["# 1日目 ショート素材 場面表", ""]
    t = 0
    for n, s in made:
        d = s["end"] - s["start"]
        lines.append(
            f"- {n}  {s['title']}\n"
            f"    元: {s['video']} {hm(s['start'])}〜{hm(s['end'])} ({d}秒)\n"
            f"    繋いだ1本の中: {hm(t)}〜{hm(t + d)}\n"
            f"    https://youtu.be/{s['video']}?t={s['start']}")
        t += d
    if missing:
        lines += ["", "## 取れなかった場面"] + [f"- {s['title']} ({s['video']})" for s in missing]
    (OUT / "scenes.md").write_text("\n".join(lines), encoding="utf-8")
    print("\n".join(lines), flush=True)


if __name__ == "__main__":
    {"chat": cmd_chat, "scan": cmd_scan, "check": cmd_check, "build": cmd_build}[sys.argv[1]]()
