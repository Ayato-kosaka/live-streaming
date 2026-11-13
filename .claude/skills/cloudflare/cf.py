#!/usr/bin/env python3
"""手元から回す。EC2 の Chrome（~/cdp-cloudflare）で Cloudflare に「Google」で入り、DNS を足し、API トークンを作る。
EC2 の上で動くのは同じ置き場の cf_ec2.py（ここが毎回 /home/ubuntu/cdp/ へ置き直す）。

    python3 .claude/skills/cloudflare/cf.py start            # 押して入る。数字が画面に出た瞬間に CHALLENGE numbers=[…] を1行出して抜ける
    CHECK_ONLY=1 python3 .claude/skills/cloudflare/cf.py start   # アカウントの選択の画面で、押さずに止まる（スマホは鳴らない）
    python3 .claude/skills/cloudflare/cf.py wait             # あやとが押したあと。LOGGED_IN / EXPIRED / STOP（最大7分）
    python3 .claude/skills/cloudflare/cf.py check            # 入っているかだけ（Google の画面は1枚も開かない）
    python3 .claude/skills/cloudflare/cf.py dns-add A @ 199.36.158.100 [TYPE NAME CONTENT …]   # DNS only で足す
    python3 .claude/skills/cloudflare/cf.py token [--name 名前] [--secret CLOUDFLARE_API_TOKEN]  # DNS の編集だけのトークン → Secret
    （dns-add と token も CHECK_ONLY=1 で、足さずに・作らずに見るだけ）

終了コード: 0 = LOGGED_IN / CHECK_ONLY / DONE / 数字が出た、3 = STOP、4 = NOT_LOGGED_IN、5 = EXPIRED、1 = それ以外。

## なぜ start と wait に分けるか

ログイン全体を SSM の1コマンドで回すと、出力は終わってからまとめて届く。数字が見えたときには
5分の窓が閉じている（Doneru で 2026-10-01 に踏んだ）。だから EC2 では cf_ec2.py を切り離して走らせ、
start は数字のファイルだけを聞き直して、出た瞬間に1行出して抜ける。続きは wait が読む。
"""
import os, re, shlex, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "ec2-chrome"))
import ec2  # noqa: E402

REMOTE = "/home/ubuntu/cdp/cf_ec2.py"
LOG = "/home/ubuntu/cloudflare/login.log"
CH = "/tmp/cloudflare_challenge.txt"
CHECK_ONLY = os.environ.get("CHECK_ONLY") == "1"
WHO = "cloudflare:" + (os.environ.get("CLAUDE_CODE_SESSION_ID", "")[:8] or "local")
RC = {"LOGGED_IN": 0, "CHECK_ONLY": 0, "DONE": 0, "STOP": 3, "NOT_LOGGED_IN": 4, "EXPIRED": 5}
# ログのうち、手元に出す行（読みどころ）。CHALLENGE は数字のファイルから1行だけ出すので、ここには入れない
SHOW = ("RESULT:", "  guard", "  account", "    [", "  押す前", "  press", "  challenge", "  shot", "  wait", "  cookies",
        "  profile", "cdp:", "Traceback")


def wake():
    """起きていなければ起こす。戻り値は、このコマンドが起こしたか（起こしたものだけ、終わりに止める）"""
    st = ec2.state()
    if st == "running":
        return False
    print(f"EC2: {st}。起こす（1〜2分）", flush=True)
    ec2.ensure_running()
    return True


def place():
    # cdp.py は EC2 のほうが新しい版なら置かない（ec2.put が比べる）。cf_ec2.py は毎回置き直す
    ec2.put(os.path.join(HERE, "..", "ec2-chrome", "cdp.py"), ec2.CDP_LIVE)
    ec2.put(os.path.join(HERE, "cf_ec2.py"), REMOTE)


def env(purpose, wait):
    # 札は EC2 の上の cdp.up("cloudflare") が、そのプロセスの pid で取る（終われば消える。止めるのを妨げない）
    return (f"CHECK_ONLY={int(CHECK_ONLY)} EC2_QUEUE_WHO={shlex.quote(WHO)} EC2_QUEUE_PURPOSE={shlex.quote(purpose)} "
            f"EC2_QUEUE_WAIT={wait}")


def result_rc(lines):
    res = [ln for ln in lines if ln.startswith("RESULT:")]
    if not res:
        return None
    return RC.get((res[-1].split() + ["", ""])[1], 1)


def poll(t0, since, want_challenge, limit):
    """EC2 の数字のファイルとログを聞き直す（1回 4〜6秒）。数字が出たら1行出して 0、RESULT が出たらその終了コード"""
    end, shown = time.time() + limit, 0
    while time.time() < end:
        st, out = ec2.run(f"cat {CH} 2>/dev/null; echo @@LOG@@; cat {LOG} 2>/dev/null; echo @@ALIVE@@; "
                          f"pgrep -f 'cf_ec2.py login' >/dev/null && echo alive", 30, quiet=True)
        ch, _, rest = out.partition("@@LOG@@")
        log, _, alive = rest.partition("@@ALIVE@@")
        lines = log.splitlines()
        for ln in lines[shown:]:
            if ln.startswith(SHOW):
                print(ln, flush=True)
        shown = len(lines)
        if want_challenge and "done" not in ch.split():
            m = [ln for ln in ch.splitlines() if "numbers=" in ln]
            ts = (m[-1].split() + [""])[0] if m else ""
            if m and ts.isdigit() and int(ts) >= since:
                print(f"CHALLENGE {m[-1].split(' ', 1)[1]}  （start から {int(time.time() - t0)}秒）", flush=True)
                return 0
        rc = result_rc(lines)
        if rc is not None:
            return rc
        if "alive" not in alive and lines:
            print("ログインの回が RESULT を出さずに終わった。ログの終わり:\n" + "\n".join(lines[-15:]))
            return 1
        time.sleep(1)
    print(f"TIMEOUT: {limit}秒待った。もう一度 wait で続きを見る（EC2 の {LOG}）")
    return 1


def start():
    t0 = time.time()
    woke = wake()
    if woke:
        print("EC2: このコマンドが起こした。全部済んだら python3 .claude/skills/ec2-chrome/ec2.py stop", flush=True)
    place()
    purpose = "Cloudflare のアカウントの選択まで（押さない）" if CHECK_ONLY else "Cloudflare に Google で入る"
    sh = (f"if pgrep -f 'cf_ec2.py login' >/dev/null; then echo RUNNING; exit 0; fi\n"
          f"mkdir -p /home/ubuntu/cloudflare /home/ubuntu/shots; rm -f {CH}\n"
          # timeout は、待ちが何で詰まっても札を持ち続けない（30分の自動停止を妨げない）ための上限
          f"cd /home/ubuntu/cdp && {env(purpose, 60)} setsid nohup timeout 900 python3 cf_ec2.py login > {LOG} 2>&1 < /dev/null &\n"
          f"sleep 1; echo \"STARTED $(date +%s)\"\n")
    st, out = ec2.run(sh, 60, quiet=True)
    if "RUNNING" in out:
        print("もう走っているログインの回がある。重ねない。続きは python3 .claude/skills/cloudflare/cf.py wait")
        return 1
    m = re.search(r"STARTED (\d+)", out)
    if not m:
        print(f"EC2 で起こせなかった（ssm {st}）: {out.strip()[-300:]}")
        return 1
    print(f"started（{'CHECK_ONLY: アカウントの選択で止まる' if CHECK_ONLY else '数字が出たら1行出す'}）", flush=True)
    return poll(t0, int(m.group(1)), not CHECK_ONLY, 240)


def wait():
    if ec2.state() != "running":
        print("EC2 が起きていない（ログインの回は無い）")
        return 1
    return poll(time.time(), 0, False, 420)


def oneshot(args, timeout):
    """check / dns-add / token。EC2 の上で1回回して、そのまま出力を読む"""
    woke = wake()
    place()
    sh = (f"mkdir -p /home/ubuntu/shots; cd /home/ubuntu/cdp && {env('Cloudflare の ' + args[0], 120)} "
          f"timeout {timeout} python3 cf_ec2.py {' '.join(shlex.quote(a) for a in args)} 2>&1")
    st, out = ec2.run(sh, timeout + 60, quiet=True)
    print(out.strip(), flush=True)
    rc = result_rc(out.splitlines())
    if woke:
        print("EC2: このコマンドが起こしたので止める（使っている人が居れば断られて、30分の自動停止に任せる）", flush=True)
        ec2.stop()
    return 1 if rc is None else rc


if __name__ == "__main__":
    cmd, rest = (sys.argv[1] if len(sys.argv) > 1 else ""), sys.argv[2:]
    try:
        if cmd == "start":
            sys.exit(start())
        elif cmd == "wait":
            sys.exit(wait())
        elif cmd == "check":
            sys.exit(oneshot(["check"], 120))
        elif cmd in ("dns-add", "token"):
            sys.exit(oneshot([cmd, *rest], 240))
        sys.exit(__doc__)
    except ec2.QueueError as e:
        print(f"EC2: {e}")
        sys.exit(1)
