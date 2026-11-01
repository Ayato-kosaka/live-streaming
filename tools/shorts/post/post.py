#!/usr/bin/env python3
"""承認されたショートを、EC2 の Chrome から YouTube と TikTok に出す（手元で回す入口）。

    D=<動画と投稿文の置き場（A.mp4 post_A.json …）>
    python3 tools/shorts/post/post.py send     --dir $D --video yk-by7R7iPA --option A
    python3 tools/shorts/post/post.py yt-draft   --video yk-by7R7iPA --option A --sha <sha256>
    python3 tools/shorts/post/post.py yt-related --video yk-by7R7iPA --id <ショートのID>
    python3 tools/shorts/post/post.py yt-publish --id <ショートのID> [--at 2026-10-17T05:00:00Z]
    python3 tools/shorts/post/post.py yt-unschedule --id <古いショートのID> --post-json <手元の post_A.json> [--dry]
    python3 tools/shorts/post/post.py yt-draft   --video yk-by7R7iPA --option A --sha <sha256> --replaces <古いショートのID>
    python3 tools/shorts/post/post.py tt-post    --video yk-by7R7iPA --option A --dry
    python3 tools/shorts/post/post.py tt-post    --video yk-by7R7iPA --option A --sha <sha256> [--at 2026-10-17T05:00:00Z]
    python3 tools/shorts/post/post.py mark       --place tiktok --sha <sha256> --done --id <投稿ID>
    python3 tools/shorts/post/post.py clean    --video yk-by7R7iPA

手順と判断の基準は同じ置き場の README.md。EC2 で動くのは yt_post.py / tt_post.py。
投稿の段（yt-draft / tt-post）は、EC2 に触る前に台帳（posted.json、posted.py）を引く。
動画・投稿文・題の札の絵は send.py（GCS の署名付き URL を EC2 が curl で落とす）で送る。
中身が SSM のログに残るので ec2.put では送らない。ec2.put で送るのはリポジトリの道具だけ。
"""
import argparse, hashlib, json, os, re, shlex, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, ".claude", "skills", "ec2-chrome"))
sys.path.insert(0, HERE)
import ec2  # noqa: E402
import posted  # noqa: E402
# EC2 の家。手元の道具に直書きしない（tools/sprites/rootcheck.mjs）
EC2_HOME = "/home/ubuntu"

REPO = "Ayato-kosaka/live-streaming"
REMOTE = f"{EC2_HOME}/shorts_post"
CDP = f"{EC2_HOME}/cdp"
# あやと 2026-10-17: TikTok では YouTube のどのチャンネルの配信かが分かるように、題の行のすぐ下に足す
TT_SOURCE_LINE = "YouTube「@あやとグルメアプリ」の生配信から"

# 遠隔デスクトップであやとが触っている最中に Chrome を開かない（本物の入力が7分止まっているのを見てから）。
# 数えるのは X に入った本物の入力だけ（desktop-input）。xprintidle は、こちらの Chrome が動画を流すだけで
# 0に戻る（README「分かっていること」・desktop_input.py の頭）。答えが無い・読めないときは、触っている側に倒す。
# 前はここで ~/locks/shorts-post を触っていた（idle-stop に止められないように）。いまは列の札を持つ（下の LANES）
DESKTOP_INPUT = "/usr/local/sbin/desktop-input"
GUARD = f"""set -- $({DESKTOP_INPUT} idle 2>/dev/null); ms=${{1:-0}}; src=${{2:-error}}
case "$ms" in ''|*[!0-9]*) ms=0 ;; esac
if [ "$src" = error ]; then echo "WAIT: desktop-input が無い・答えない（手元で python3 .claude/skills/ec2-chrome/ec2.py guard）"; fi
if [ "$ms" -lt 420000 ]; then echo "WAIT: desktop input within 7 min (${{ms}}ms, $src)"; echo 'RESULT {{"ok": false, "error": "desktop_busy"}}'; exit 0; fi
"""


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


# 投稿先ごとの Chrome の束（= 列）。yt_post.py / yt_thumb.py は yt_studio.py の "ytstudio"、
# tt_post.py は TikTok にログインしてある "fish"（声作りの fish_web.py と同じ束なので、札で順番を待つ）
LANES = {"youtube": "ytstudio", "tiktok": "fish"}


def remote_run(body, timeout=420, lane="ytstudio"):
    """列 lane の札を持って（取れるまで待つ）、GUARD + 本体を EC2 で回す。札は終わったら必ず返す"""
    try:
        with ec2.lease(lane, who=f"post.py {ec2.default_who()}", purpose=body.strip().split("&&")[-1].strip()[:160]):
            st, out = ec2.run(GUARD + body, timeout, quiet=True)
    except ec2.QueueError as e:
        print(f"止めた: {e}")
        return {"ok": False, "error": "queue_busy"}
    print(out.rstrip())
    res = [ln[7:] for ln in out.splitlines() if ln.startswith("RESULT ")]
    return json.loads(res[-1]) if res else {"ok": False, "error": f"no result (ssm {st})"}


def tt_caption(post):
    lines = post["tiktok"]["caption"].split("\n")
    # 配信の映像を使わない回（旅の写真に曲を当てた回など）は、投稿文で外す。「生配信から」が嘘になる（帳面 F-052）
    if post["tiktok"].get("source_line", True) and TT_SOURCE_LINE not in lines:
        lines.insert(1, TT_SOURCE_LINE)
    return "\n".join(lines)


def cmd_send(a):
    mp4, pj = os.path.join(a.dir, f"{a.option}.mp4"), os.path.join(a.dir, f"post_{a.option}.json")
    post = json.load(open(pj))
    cap = tt_caption(post)
    capf = os.path.join(tempfile.mkdtemp(), f"tt_caption_{a.option}.txt")
    open(capf, "w", encoding="utf-8").write(cap)
    d = f"{REMOTE}/{a.video}"
    r = subprocess.run([sys.executable, os.path.join(HERE, "send.py"), "put",
                        pj, f"{d}/post_{a.option}.json", capf, f"{d}/tt_caption_{a.option}.txt", mp4, f"{d}/{a.option}.mp4"])
    for f in ("cdp.py",):
        ec2.put(os.path.join(ROOT, ".claude", "skills", "ec2-chrome", f), f"{CDP}/{f}")
    ec2.put(os.path.join(ROOT, ".claude", "skills", "youtube-studio", "yt_studio.py"), f"{CDP}/yt_studio.py")
    for f in ("yt_post.py", "tt_post.py", "yt_thumb.py"):
        ec2.put(os.path.join(HERE, f), f"{CDP}/{f}")
    print(json.dumps({"mp4_sha256": sha(mp4), "tt_caption": cap}, ensure_ascii=False, indent=1))
    return r.returncode


def remote_sha_ok(a, want):
    st, out = ec2.run(f"sha256sum {REMOTE}/{a.video}/{a.option}.mp4 | cut -c1-64", 60, quiet=True)
    got = out.strip()
    print("EC2 sha256", got, "OK" if got == want else "MISMATCH")
    return got == want


def ledger_sha(a):
    """台帳を引く鍵（動画の sha256）と、引けないときの理由。--sha か、--dir の動画から"""
    s = a.sha.lower() if a.sha else None
    if a.dir and a.option:
        local = posted.sha256_of(os.path.join(a.dir, f"{a.option}.mp4"))
        if s and s != local:
            return None, f"--sha と --dir の動画の sha256 が違う（{s[:8]}… / {local[:8]}…）"
        s = local
    if not s:
        return None, "台帳を引くのに動画の sha256 が要る。--sha <send が出した mp4_sha256> か --dir を付ける"
    if not posted.SHA_RE.fullmatch(s):
        return None, f"--sha が 64 桁の16進ではない: {s}"
    return s, None


def posting(a, place, body, timeout):
    """投稿の段を台帳で挟む。**EC2 に触る前に引く** → EC2 の mp4 を照らす → 始める直前に pending →
    ID が取れたら done。落ちたら pending のまま残る（次の回が止まる）"""
    sha, why = ledger_sha(a)
    if why:
        print(f"止めた: {why}")
        return 1
    try:
        rows = posted.load()
    except posted.Broken as e:
        print(f"止めた: {e}")
        return 1
    stop = posted.refusal(rows, sha, place, a.again)
    if stop:
        print(stop)
        return 1
    # 台帳に書く sha256 が、実際に上げるもの（EC2 に送った mp4）と同じであること
    if not remote_sha_ok(a, sha):
        return 1
    rec = posted.begin(sha, place, f"{a.video}/{a.option}", a.again)
    r = remote_run(body, timeout, LANES[place])
    if r.get("error") in ("desktop_busy", "queue_busy"):
        # GUARD は本体を1行も動かさずに戻る（札が取れなかったときも、EC2 では何も始まっていない）。pending を残さない
        posted.forget(rec)
        return 1
    vid = posted.id_of(place, r)
    done = bool(r.get("ok") and vid)
    new = posted.finish(rec, vid, done)
    if new["state"] == "done":
        print(f"台帳: {place} {new['plan']} → done（投稿 ID {new['id']}）")
        return 0
    print(f"台帳: 終わりを確かめられなかったので pending のまま残した（{new['plan']}・{place}）。\n" + posted.next_step(new))
    return 1


def cmd_yt_draft(a):
    d = f"{REMOTE}/{a.video}"
    rep = ""
    if a.replaces:
        # 予約の差し替えで、古い版を消さずに非公開で残した回（yt-unschedule のあと）。同じ題の見張りを、その1本だけ通す
        if not re.fullmatch(r"[\w-]{11}", a.replaces):
            print(f"止めた: --replaces が動画 ID の形ではない: {a.replaces}")
            return 1
        rep = f" --replaces {a.replaces}"
    return posting(a, "youtube", f"cd {CDP} && timeout 400 python3 yt_post.py draft {d}/{a.option}.mp4 {d}/post_{a.option}.json{rep}\n", 450)


def cmd_yt_unschedule(a):
    """予約を差し替えるとき、古い版の一般公開の予約を外して非公開のまま残す（消さない）。題は手元の投稿文から"""
    if not (a.id and a.post_json):
        print("止めた: yt-unschedule は --id <古い動画の ID> と --post-json <手元の post_<案>.json> が要る")
        return 1
    title = json.load(open(a.post_json))["youtube"]["title"]
    dry = " --dry" if a.dry else ""
    r = remote_run(f"cd {CDP} && timeout 300 python3 yt_post.py unschedule {a.id} {shlex.quote(title)}{dry}\n", 350, LANES["youtube"])
    return 0 if r.get("ok") else 1


def cmd_yt_related(a):
    r = remote_run(f"cd {CDP} && timeout 300 python3 yt_post.py related {a.id} {a.video}\n", 350, LANES["youtube"])
    return 0 if r.get("ok") else 1


def cmd_yt_publish(a):
    if a.sha and not remote_sha_ok(a, a.sha):
        return 1
    at = f" --at {a.at}" if a.at else ""
    r = remote_run(f"cd {CDP} && timeout 300 python3 yt_post.py publish {a.id}{at}\n", 350, LANES["youtube"])
    return 0 if r.get("ok") else 1


def cmd_tt_post(a):
    d = f"{REMOTE}/{a.video}"
    extra = (" --dry" if a.dry else "") + (f" --at {a.at}" if a.at else "") + (f" --cover {d}/{a.option}_cover.jpg" if getattr(a, "cover", None) else "")
    # 曲を動画に入れられない回は、投稿文の tiktok.sound（[曲名, 歌い手]）で TikTok の音源を敷く
    snd = json.load(open(a.post_json)).get("tiktok", {}).get("sound") if getattr(a, "post_json", None) else None
    if snd:
        extra += " --sound " + " ".join(shlex.quote(x) for x in snd)
    if getattr(a, "draft", False):
        # 下書きで止める。投稿 ID が無いので台帳は pending のまま残る（あやとが出したら mark で done にする）
        extra += " --draft"
    # 2>&1: EC2 の側で例外が出ても、ec2.run(quiet) は stderr を返さない。段が黙って止まって見え、
    # 予約まで押せたかが分からなくなる（2026-10-29 グルメの回）。traceback ごと持ち帰る
    body = f"cd {CDP} && timeout 500 python3 tt_post.py post {d}/{a.option}.mp4 {d}/tt_caption_{a.option}.txt{extra} 2>&1\n"
    if a.dry:
        # 投稿の手前までの確かめ。出さないので台帳は見ない・書かない
        if a.sha and not remote_sha_ok(a, a.sha):
            return 1
        r = remote_run(body, 560, LANES["tiktok"])
        return 0 if r.get("ok") else 1
    return posting(a, "tiktok", body, 560)


def cmd_cover(a):
    """題の札が見えるコマを切り出して <案>_cover.jpg にし、EC2 へ送る（YouTube のサムネイルと TikTok のカバーに使う）。
    題の札は1行目の読み上げのあいだ（0秒〜約2〜3秒）出ているので、既定は 1.0 秒のコマ"""
    mp4 = os.path.join(a.dir, f"{a.option}.mp4")
    jpg = os.path.join(a.dir, f"{a.option}_cover.jpg")
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-ss", str(a.cover_at), "-i", mp4, "-frames:v", "1", "-q:v", "2", jpg], check=True)
    # 出す前の動画のコマなので ec2.put（中身が SSM のログに残る）ではなく send.py で
    r = subprocess.run([sys.executable, os.path.join(HERE, "send.py"), "put", jpg, f"{REMOTE}/{a.video}/{a.option}_cover.jpg"])
    print(jpg)
    return r.returncode


def cmd_yt_thumb(a):
    """題の札が見えるコマ（<案>_cover.jpg、送り済み）を YouTube のサムネイルにする"""
    d = f"{REMOTE}/{a.video}"
    try:
        with ec2.lease(LANES["youtube"], who=f"post.py {ec2.default_who()}", purpose=f"yt_thumb.py {a.id}"):
            st, out = ec2.run(f"cd {CDP} && timeout 200 python3 yt_thumb.py {a.id} {d}/{a.option}_cover.jpg 2>&1 | tail -4", 260, quiet=True)
    except ec2.QueueError as e:
        print(f"止めた: {e}")
        return 1
    print(out)
    return 0 if '"ok": true' in out else 1


def cmd_mark(a):
    """投稿先で見て確かめた結果を台帳に書く（pending → done）。EC2 には触らない"""
    if not a.done:
        print("止めた: mark は --done だけ（出ていなかったなら、投稿の段に --again を付けてやり直す）")
        return 1
    sha, why = ledger_sha(a)
    if why:
        print(f"止めた: {why}")
        return 1
    plan = f"{a.video}/{a.option}" if a.video and a.option else None
    try:
        r = posted.mark(sha, a.place, a.id, plan)
    except (posted.Broken, posted.Refused) as e:
        print(f"止めた: {e}")
        return 1
    print("台帳: " + json.dumps(r, ensure_ascii=False))
    return 0


def cmd_clean(a):
    # 送った動画を消すだけ。SSM のログには触らない（send.py の頭）
    return subprocess.run([sys.executable, os.path.join(HERE, "send.py"), "clean", f"{REMOTE}/{a.video}"]).returncode


def main(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument("cmd")
    p.add_argument("--issue", type=int)
    p.add_argument("--option")
    p.add_argument("--dir")
    p.add_argument("--video")
    p.add_argument("--id")
    p.add_argument("--at")
    p.add_argument("--sha", help="公開の直前に EC2 の mp4 と照らす sha256")
    p.add_argument("--dry", action="store_true")
    p.add_argument("--cover-at", type=float, default=1.0, help="cover: 切り出す秒（題の札が見えている間）")
    p.add_argument("--cover", action="store_true", help="tt-post: 題の札が見えるコマ（<案>_cover.jpg、送り済み）をカバーにする")
    p.add_argument("--again", action="store_true", help="yt-draft / tt-post: 台帳に記録があっても出す（投稿先で出ていないのを見たときだけ）")
    p.add_argument("--draft", action="store_true", help="tt-post: 投稿せず TikTok の下書きに保存する")
    p.add_argument("--post-json", help="tt-post: 投稿文（tiktok.sound を読む）。手元の post_<案>.json")
    p.add_argument("--replaces", help="yt-draft: 予約を差し替える回の、非公開で残した古い動画の ID（同じ題の見張りをその1本だけ通す）")
    p.add_argument("--place", help="mark: youtube / tiktok")
    p.add_argument("--done", action="store_true", help="mark: 投稿先で出ているのを見た（--id と一緒に）")
    a = p.parse_args(argv)
    fn = {"send": cmd_send, "yt-draft": cmd_yt_draft, "yt-unschedule": cmd_yt_unschedule, "yt-related": cmd_yt_related,
          "yt-publish": cmd_yt_publish, "tt-post": cmd_tt_post, "yt-thumb": cmd_yt_thumb, "cover": cmd_cover,
          "mark": cmd_mark, "clean": cmd_clean}.get(a.cmd)
    if not fn:
        sys.exit(__doc__)
    return fn(a)


if __name__ == "__main__":
    sys.exit(main())
