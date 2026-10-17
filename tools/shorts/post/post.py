#!/usr/bin/env python3
"""承認されたショートを、EC2 の Chrome から YouTube と TikTok に出す（手元で回す入口）。

    D=<動画と投稿文の置き場（A.mp4 post_A.json …）>
    python3 tools/shorts/post/post.py approval --issue 926 --option A --dir $D --files A.mp4 post_A.json B.mp4 post_B.json C.mp4 post_C.json
    python3 tools/shorts/post/post.py send     --dir $D --video yk-by7R7iPA --option A
    python3 tools/shorts/post/post.py yt-draft   --video yk-by7R7iPA --option A
    python3 tools/shorts/post/post.py yt-related --video yk-by7R7iPA --id <ショートのID>
    python3 tools/shorts/post/post.py yt-publish --id <ショートのID> [--at 2026-10-17T05:00:00Z]
    python3 tools/shorts/post/post.py tt-post    --video yk-by7R7iPA --option A --dry
    python3 tools/shorts/post/post.py tt-post    --video yk-by7R7iPA --option A [--at 2026-10-17T05:00:00Z]
    python3 tools/shorts/post/post.py clean    --video yk-by7R7iPA

手順と判断の基準は同じ置き場の README.md。EC2 で動くのは yt_post.py / tt_post.py。
"""
import argparse, hashlib, json, os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, ".claude", "skills", "ec2-chrome"))
import ec2  # noqa: E402

REPO = "Ayato-kosaka/live-streaming"
REMOTE = "/home/ubuntu/shorts_post"
CDP = "/home/ubuntu/cdp"
# あやと 2026-10-17: TikTok では YouTube のどのチャンネルの配信かが分かるように、題の行のすぐ下に足す
TT_SOURCE_LINE = "YouTube「@あやとグルメアプリ」の生配信から"

# 遠隔デスクトップであやとが触っている最中に Chrome を開かない（入力が7分止まっているのを見てから）
GUARD = """touch /home/ubuntu/locks/shorts-post
ms=$(DISPLAY=:20 XAUTHORITY=/home/ubuntu/.Xauthority sudo -u ubuntu xprintidle 2>/dev/null || echo 0)
if [ "${ms:-0}" -lt 420000 ]; then echo "WAIT: desktop input within 7 min (${ms}ms)"; echo 'RESULT {"ok": false, "error": "desktop_busy"}'; exit 0; fi
"""


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def remote_run(body, timeout=420):
    st, out = ec2.run(GUARD + body, timeout, quiet=True)
    print(out.rstrip())
    res = [ln[7:] for ln in out.splitlines() if ln.startswith("RESULT ")]
    return json.loads(res[-1]) if res else {"ok": False, "error": f"no result (ssm {st})"}


def tt_caption(post):
    lines = post["tiktok"]["caption"].split("\n")
    if TT_SOURCE_LINE not in lines:
        lines.insert(1, TT_SOURCE_LINE)
    return "\n".join(lines)


def cmd_approval(a):
    """関所（gate.py require）を通す。終了コード 0 で、出てきた JSON の options に案が入っているときだけ 0 を返す。
    --files は Gate 2 で提出したのと同じ並び（案ごとの動画なら A.mp4 post_A.json B.mp4 …）。
    公開の手（yt-publish / tt-post）の直前に毎回これを回す"""
    r = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "shorts", "gate.py"), "require", "--issue", str(a.issue),
                        "--gate", "video", "--files", *a.files], cwd=a.dir, capture_output=True, text=True)
    out = (r.stdout + r.stderr).strip()
    opts = None
    if r.returncode == 0:
        try:
            opts = json.loads(r.stdout).get("options")
        except Exception:
            opts = None
    ok = r.returncode == 0 and isinstance(opts, list) and a.option in opts
    print(json.dumps({"ok": ok, "exit": r.returncode, "options": opts, "out": out[:600]}, ensure_ascii=False, indent=1))
    return 0 if ok else 1


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
    for f in ("yt_post.py", "tt_post.py"):
        ec2.put(os.path.join(HERE, f), f"{CDP}/{f}")
    print(json.dumps({"mp4_sha256": sha(mp4), "tt_caption": cap}, ensure_ascii=False, indent=1))
    return r.returncode


def remote_sha_ok(a, want):
    st, out = ec2.run(f"sha256sum {REMOTE}/{a.video}/{a.option}.mp4 | cut -c1-64", 60, quiet=True)
    got = out.strip()
    print("EC2 sha256", got, "OK" if got == want else "MISMATCH")
    return got == want


def cmd_yt_draft(a):
    d = f"{REMOTE}/{a.video}"
    r = remote_run(f"cd {CDP} && timeout 400 python3 yt_post.py draft {d}/{a.option}.mp4 {d}/post_{a.option}.json\n", 450)
    return 0 if r.get("ok") else 1


def cmd_yt_related(a):
    r = remote_run(f"cd {CDP} && timeout 300 python3 yt_post.py related {a.id} {a.video}\n", 350)
    return 0 if r.get("ok") else 1


def cmd_yt_publish(a):
    if a.sha and not remote_sha_ok(a, a.sha):
        return 1
    at = f" --at {a.at}" if a.at else ""
    r = remote_run(f"cd {CDP} && timeout 300 python3 yt_post.py publish {a.id}{at}\n", 350)
    return 0 if r.get("ok") else 1


def cmd_tt_post(a):
    if a.sha and not remote_sha_ok(a, a.sha):
        return 1
    d = f"{REMOTE}/{a.video}"
    extra = (" --dry" if a.dry else "") + (f" --at {a.at}" if a.at else "")
    r = remote_run(f"cd {CDP} && timeout 500 python3 tt_post.py post {d}/{a.option}.mp4 {d}/tt_caption_{a.option}.txt{extra}\n", 560)
    return 0 if r.get("ok") else 1


def cmd_clean(a):
    return subprocess.run([sys.executable, os.path.join(HERE, "send.py"), "clean", f"{REMOTE}/{a.video}"]).returncode


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("cmd")
    p.add_argument("--issue", type=int)
    p.add_argument("--files", nargs="+", help="approval: Gate 2 に出したファイルの並び（--dir の中の名前）")
    p.add_argument("--option")
    p.add_argument("--dir")
    p.add_argument("--video")
    p.add_argument("--id")
    p.add_argument("--at")
    p.add_argument("--sha", help="公開の直前に EC2 の mp4 と照らす sha256")
    p.add_argument("--dry", action="store_true")
    a = p.parse_args()
    fn = {"approval": cmd_approval, "send": cmd_send, "yt-draft": cmd_yt_draft, "yt-related": cmd_yt_related,
          "yt-publish": cmd_yt_publish, "tt-post": cmd_tt_post, "clean": cmd_clean}.get(a.cmd)
    if not fn:
        sys.exit(__doc__)
    sys.exit(fn(a))
