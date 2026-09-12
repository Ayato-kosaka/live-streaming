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
VIDEOS = ["hrXYXcu9IDE", "HCI2IKaVEuQ", "sxIz_bKd7SQ", "Mzf_LgF6Cxc"]

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


def ytdlp(args, tries=6):
    """yt-dlp を叩く。**ボット確認は出たり出なかったりする**ので、
    別の player_client に替えながら何度か試す。Cookie は使わない。"""
    home = os.environ.get("BGUTIL_HOME", "/tmp/bgutil/server")
    clients = ["default", "web", "tv", "web_embedded", "visionos", "web_safari"]
    last = ""
    for i in range(tries):
        c = clients[i % len(clients)]
        cmd = [
            sys.executable, "-m", "yt_dlp",
            "--no-progress", "--sleep-requests", "2",
            "--extractor-args", f"youtube:player_client={c}",
            "--extractor-args", f"youtubepot-bgutilscript:server_home={home}",
        ] + args
        p = subprocess.run(cmd, capture_output=True, text=True)
        if p.returncode == 0:
            return True
        last = (p.stdout + p.stderr)[-800:]
        print(f"-- try {i + 1} (client={c}) 失敗:\n{last}", flush=True)
        time.sleep(20 * (i + 1))  # ボット確認は待つと明ける
    print(f"!! 諦めた: {' '.join(args)}\n{last}", flush=True)
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
                   f"https://www.youtube.com/watch?v={v}"])
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


def download(v, height):
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
    ])
    return dst if ok and dst.exists() else None


def cmd_check():
    """媒体が本当に取れるかを、いちばん短い配信の小さい形式1つで確かめる。
    **長い方を回してから 403 だと分かるのが、いちばん高くつく。**"""
    WORK.mkdir(exist_ok=True)
    v = VIDEOS[-1]  # 19分46秒。144p なら 9MB 弱
    ok = ytdlp(["-f", "394/160/worst", "-o", str(WORK / "check.%(ext)s"),
                f"https://www.youtube.com/watch?v={v}"], tries=8)
    got = sorted(WORK.glob("check.*"))
    print(f"媒体が取れたか: {ok} / {[(f.name, f.stat().st_size) for f in got]}", flush=True)
    if not ok or not got:
        sys.exit(1)


def cmd_build():
    height = os.environ.get("CLIP_HEIGHT", "720")
    scenes = json.load(open(SCENES))
    OUT.mkdir(exist_ok=True)

    need = sorted({s["video"] for s in scenes})
    have = {}
    for v in need:
        p = download(v, height)
        if p:
            have[v] = p
        else:
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

    # 繋ぐ。元が同じ配信なので、そのまま繋げる（焼き直さない）。
    if made:
        lst = WORK / "concat.txt"
        lst.write_text("".join(f"file '{(OUT / n).as_posix()}'\n" for n, _ in made))
        sh(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "concat",
            "-safe", "0", "-i", str(lst), "-c", "copy", str(OUT / "day1_joined.mp4")])

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
