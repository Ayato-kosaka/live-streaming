#!/usr/bin/env python3
"""EC2 に SSM でスクリプトを送り、標準出力を受け取る。ファイルも持ち帰れる。

    python3 .claude/skills/ec2-chrome/ec2.py run <script.sh> [timeout秒]   # EC2 で実行して stdout/stderr を出す
    python3 .claude/skills/ec2-chrome/ec2.py get <EC2のパス> <手元のパス>   # EC2 のファイルを持ち帰る
    python3 .claude/skills/ec2-chrome/ec2.py put <手元のパス> <EC2のパス>   # 手元のファイルを EC2 へ送る
    python3 .claude/skills/ec2-chrome/ec2.py state | start | stop
    python3 .claude/skills/ec2-chrome/ec2.py guard            # 誰も使っていなければ EC2 がひとりでに止まる見張りと、
                                                              # 遠隔デスクトップの本物の入力の見張り（desktop_input.py）を入れ直す

## なぜこの形か

この sandbox からは suzuri.jp に出られない（プロキシが 403）。
EC2 へのポート転送（ssm:StartSession）も権限が無い。S3 も無い。
使えるのは **SSM の send-command だけ**で、その標準出力は 24,000 字で切れる。
なので、ファイルは base64 を 20,000 字ずつに割って、何回かに分けて受け取る。

## put で送ってよいもの

`put` は中身を base64 にして SSM のコマンドに載せる。**中身が EC2 の SSM エージェントの
ログにそのまま残る**（ログは消さない。SKILL.md の 4）。送ってよいのは、中身がリポジトリの
公開物と同じもの（cdp.py のような道具・スクリプト・設定の JSON）だけ。
**秘密や動画は送らない。** それは `tools/shorts/post/send.py put`（GCS の署名付き URL を EC2 が
curl で落とす。SSM のコマンドに載るのは URL だけ）。動画の拡張子はここで断る。
"""
import base64, json, os, subprocess, sys, time, hashlib, threading

INSTANCE = os.environ.get("EC2_CHROME_INSTANCE_ID", "i-0684d39b0c1b1abb6")
AWS = ["aws", "--profile", "sandbox", "--region", "ap-northeast-1"]
CHUNK = 20000


def aws(*args, check=True):
    r = subprocess.run(AWS + list(args), capture_output=True, text=True)
    if check and r.returncode:
        sys.exit(f"aws failed: {' '.join(args[:3])}: {r.stderr.strip()[:500]}")
    return r.stdout.strip()


def state():
    return aws("ec2", "describe-instances", "--instance-ids", INSTANCE,
               "--query", "Reservations[0].Instances[0].State.Name", "--output", "text")


def run(script: str, timeout: int = 600, quiet=False):
    params = {"commands": [script], "executionTimeout": [str(timeout)]}
    pf = f"/tmp/ec2py_params_{os.getpid()}_{threading.get_ident()}.json"
    with open(pf, "w") as f:
        json.dump(params, f)
    cid = aws("ssm", "send-command", "--instance-ids", INSTANCE, "--document-name", "AWS-RunShellScript",
              "--timeout-seconds", "600", "--parameters", f"file://{pf}", "--query", "Command.CommandId", "--output", "text")
    os.unlink(pf)
    deadline = time.time() + timeout + 120
    st = "Pending"
    while time.time() < deadline:
        time.sleep(2)
        st = aws("ssm", "get-command-invocation", "--command-id", cid, "--instance-id", INSTANCE,
                 "--query", "Status", "--output", "text", check=False) or "Pending"
        if st in ("Success", "Failed", "Cancelled", "TimedOut"):
            break
    out = json.loads(aws("ssm", "get-command-invocation", "--command-id", cid, "--instance-id", INSTANCE, "--output", "json"))
    if not quiet:
        sys.stdout.write(out.get("StandardOutputContent", ""))
        err = out.get("StandardErrorContent", "")
        if err.strip():
            sys.stdout.write("\n--- stderr ---\n" + err)
        print(f"\n[ssm status: {st}]")
    return st, out.get("StandardOutputContent", "")


def get(remote: str, local: str):
    st, out = run(f"stat -c %s '{remote}' && sha256sum '{remote}' | cut -c1-64", 60, quiet=True)
    lines = out.split()
    if st != "Success" or len(lines) < 2:
        sys.exit(f"no such file on EC2: {remote}")
    size, digest = int(lines[0]), lines[1]
    b64len = (size + 2) // 3 * 4
    # 1片ごとに send-command → 待つ → 受け取る で 8秒ほどかかる。1MB で 70片あるので、
    # 順に回すと10分。片どうしは独立なので、8本ずつ並べて投げる
    from concurrent.futures import ThreadPoolExecutor
    offs = list(range(0, b64len, CHUNK))
    def one(off):
        for _ in range(3):
            st, out = run(f"base64 -w0 '{remote}' | cut -c{off + 1}-{off + CHUNK}", 60, quiet=True)
            if st == "Success":
                return out.strip()
        sys.exit(f"chunk at {off} failed")
    with ThreadPoolExecutor(8) as ex:
        parts = list(ex.map(one, offs))
    data = base64.b64decode("".join(parts))
    if hashlib.sha256(data).hexdigest() != digest:
        sys.exit("sha256 mismatch")
    os.makedirs(os.path.dirname(os.path.abspath(local)), exist_ok=True)
    with open(local, "wb") as f:
        f.write(data)
    print(f"got {remote} -> {local} ({size} bytes, {len(parts)} parts)")


VIDEO = (".mp4", ".mov", ".m4v", ".webm", ".mkv")


def put(local: str, remote: str):
    # 中身が SSM のログに残るので、動画はここを通さない（上の「put で送ってよいもの」）
    if os.path.splitext(local)[1].lower() in VIDEO:
        sys.exit(f"put は動画を送らない（中身が SSM のログに残る）: {local}\n"
                 "  → python3 tools/shorts/post/send.py put <手元> <EC2>")
    data = open(local, "rb").read()
    b64 = base64.b64encode(data).decode()
    # send-command の引数は 64KB まで。40,000 字ずつ番号付きの片に書き、8本並べて送る
    # （順に足していくと 1MB で5分かかった）。最後に番号順につなぐ
    from concurrent.futures import ThreadPoolExecutor
    run(f"rm -rf '{remote}.parts' && mkdir -p '{remote}.parts'", 30, quiet=True)
    offs = list(range(0, len(b64), 40000))
    def one(i):
        for _ in range(3):
            st, _ = run(f"printf '%s' '{b64[offs[i]:offs[i] + 40000]}' > '{remote}.parts/{i:05d}'", 60, quiet=True)
            if st == "Success":
                return
        sys.exit(f"part {i} failed")
    with ThreadPoolExecutor(8) as ex:
        list(ex.map(one, range(len(offs))))
    run(f"cat '{remote}.parts'/* > '{remote}.b64' && rm -rf '{remote}.parts'", 60, quiet=True)
    st, out = run(f"base64 -d '{remote}.b64' > '{remote}' && rm -f '{remote}.b64' && chmod 644 '{remote}' && sha256sum '{remote}' | cut -c1-64", 60, quiet=True)
    if out.strip() != hashlib.sha256(data).hexdigest():
        sys.exit("sha256 mismatch on put")
    print(f"put {local} -> {remote} ({len(data)} bytes)")


def guard():
    """idle_stop.sh を EC2 に置き、root の cron で5分ごとに回す（ec2-chrome の SKILL.md 2）。
    desktop_input.py も置いて systemd で起こす（投稿の GUARD と idle-stop が「あやとが触っているか」を聞く先）。
    セッションは唐突に切れるので、止めるのを手元に頼らない。何度入れ直してもよい"""
    here = os.path.dirname(os.path.abspath(__file__))
    put(os.path.join(here, "idle_stop.sh"), "/usr/local/sbin/idle-stop")
    # 遠隔デスクトップの本物の入力を控える見張り（desktop_input.py）。投稿の GUARD と idle-stop が読む
    put(os.path.join(here, "desktop_input.py"), "/usr/local/sbin/desktop-input")
    st, out = run("chmod 755 /usr/local/sbin/idle-stop /usr/local/sbin/desktop-input && "
                  "(command -v xprintidle >/dev/null || DEBIAN_FRONTEND=noninteractive apt-get install -y -q xprintidle >/dev/null 2>&1); "
                  "(command -v xinput >/dev/null || DEBIAN_FRONTEND=noninteractive apt-get install -y -q xinput >/dev/null 2>&1); "
                  "/usr/local/sbin/desktop-input install && "
                  "printf '%s\\n' 'SHELL=/bin/sh' '*/5 * * * * root /usr/local/sbin/idle-stop' > /etc/cron.d/idle-stop && "
                  "chmod 644 /etc/cron.d/idle-stop && "
                  "echo armed=$([ -f /etc/idle-stop/armed ] && echo yes || echo no) && tail -3 /var/log/idle-stop.log 2>/dev/null", 300, quiet=True)
    print(out.strip())


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "state"
    if cmd == "run":
        script = open(sys.argv[2]).read()
        run(script, int(sys.argv[3]) if len(sys.argv) > 3 else 600)
    elif cmd == "get":
        get(sys.argv[2], sys.argv[3])
    elif cmd == "put":
        put(sys.argv[2], sys.argv[3])
    elif cmd == "state":
        print(state())
    elif cmd == "start":
        aws("ec2", "start-instances", "--instance-ids", INSTANCE)
        aws("ec2", "wait", "instance-running", "--instance-ids", INSTANCE)
        print(state())
    elif cmd == "guard":
        guard()
    elif cmd == "stop":
        aws("ec2", "stop-instances", "--instance-ids", INSTANCE)
        aws("ec2", "wait", "instance-stopped", "--instance-ids", INSTANCE)
        print(state())
