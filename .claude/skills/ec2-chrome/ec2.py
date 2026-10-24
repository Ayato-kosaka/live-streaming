#!/usr/bin/env python3
"""EC2 に SSM でスクリプトを送り、標準出力を受け取る。ファイルも持ち帰れる。

    python3 .claude/skills/ec2-chrome/ec2.py run <script.sh> [timeout秒]   # EC2 で実行して stdout/stderr を出す
    python3 .claude/skills/ec2-chrome/ec2.py get <EC2のパス> <手元のパス>   # EC2 のファイルを持ち帰る
    python3 .claude/skills/ec2-chrome/ec2.py put <手元のパス> <EC2のパス>   # 手元のファイルを EC2 へ送る
    python3 .claude/skills/ec2-chrome/ec2.py state | start
    python3 .claude/skills/ec2-chrome/ec2.py stop [--force]   # 使っている人が居れば止めずに理由を出して 1（下の「止める前に見るもの」）
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

## 止める前に見るもの（stop）

2026-10-23 23:45 UTC、ショートの投稿の担当が EC2 で YouTube を読み直している最中に、EC2 が
`Client.UserInitiatedShutdown`（外から stop-instances）で止まった。見張り（idle-stop）の記録には無い。
担当たちは「自分で起こした EC2 は、誰も使っていないのを見てから stop」で動いていたが、2人が同時に
使うと「誰も使っていない」の見分けが外れる。だから **stop そのものが、止める前に EC2 の中を見る。**
並びは `idle_stop.sh` と同じ（SSM → 鍵 → 遠隔デスクトップ）。鍵の置き場は idle_stop.sh の `LOCKS` を
そのまま読む（写すと黙ってずれる）。どれか1つでも当たれば止めずに 1。

| 見るもの | 止めない条件 |
| --- | --- |
| ほかの SSM コマンド | この確かめを流している ssm-document-worker（自分の先祖）以外が走っている |
| 鍵（ファイルでもディレクトリでも） | 15分以内に触られている |
| 遠隔デスクトップ | `desktop-input idle` が7分未満（投稿の GUARD と同じ）。答えが無い・数でないも触っている側 |
| 確かめそのもの | 答えが返らない（前のコマンドが終わるまで始まらないことがある） |

既に止まっている（stopped / stopping）なら何もせずに 0。`--force` は中を見ずに止める。
見張りの見張りは同じ置き場の `stop_guard_selftest.py`（偽の EC2 で回す。本物には触らない）。
"""
import base64, json, os, re, subprocess, sys, time, hashlib, threading

INSTANCE = os.environ.get("EC2_CHROME_INSTANCE_ID", "i-0684d39b0c1b1abb6")
AWS = ["aws", "--profile", "sandbox", "--region", "ap-northeast-1"]
CHUNK = 20000
HERE = os.path.dirname(os.path.abspath(__file__))
# EC2 の家（手元の道具に直書きしない。tools/sprites/rootcheck.mjs と同じ考え）
EC2_HOME = "/home/ubuntu"
DESKTOP_INPUT = "/usr/local/sbin/desktop-input"
LOCK_FRESH_S = 15 * 60       # 鍵がこれより新しければ、誰かが使っている
DESKTOP_BUSY_MS = 420000     # 遠隔デスクトップの本物の入力がこれより新しければ、あやとが触っている（post.py の GUARD と同じ7分）
CHECK_TIMEOUT = 60           # 確かめの1回。前のコマンドが居座っていると始まらず、答えが無いまま切れる


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


def idle_stop_locks():
    """鍵の置き場は idle_stop.sh の LOCKS をそのまま使う。こちらに書き写すと、あちらに鍵を足した日に黙ってずれる"""
    m = re.search(r'^LOCKS="([^"]+)"$', open(os.path.join(HERE, "idle_stop.sh"), encoding="utf-8").read(), re.M)
    if not m:
        sys.exit("idle_stop.sh に LOCKS=\"…\" の行が無い（鍵の置き場を読めないので止めない）")
    return m.group(1)


def busy_script():
    """EC2 の上で「いま誰が使っているか」を見る sh。当たったものを `BUSY <理由>` で1行ずつ、最後に CHECKED を出す。
    並びは idle_stop.sh と同じ（SSM → 鍵 → 遠隔デスクトップ）"""
    return f"""now=$(date +%s)
# この確かめを流している ssm-document-worker は自分の先祖。先祖を辿って、それ以外の worker だけを数える
mine=" "; p=$$
while [ -n "$p" ] && [ "$p" -gt 1 ] 2>/dev/null; do mine="$mine$p "; p=$(sed 's/.*) //' "/proc/$p/stat" 2>/dev/null | cut -d' ' -f2); done
for w in $(pgrep -f ssm-document-worker 2>/dev/null); do
  case "$mine" in *" $w "*) ;; *) echo "BUSY ssm: ほかの SSM コマンドが走っている（ssm-document-worker pid $w）" ;; esac
done
for f in {idle_stop_locks()}; do
  [ -e "$f" ] || continue
  age=$(( now - $(stat -c %Y "$f") ))
  if [ "$age" -lt {LOCK_FRESH_S} ]; then echo "BUSY lock: $f が ${{age}}秒前に触られた"; fi
done
set -- $({DESKTOP_INPUT} idle 2>/dev/null); ms=${{1:-}}; src=${{2:-}}
case "$ms" in
  ''|*[!0-9]*) echo "BUSY desktop: desktop-input が答えない（'$ms $src'。触っている側に倒す。入れ直すなら ec2.py guard）" ;;
  *) if [ "$ms" -lt {DESKTOP_BUSY_MS} ]; then echo "BUSY desktop: 遠隔デスクトップの本物の入力が ${{ms}}ms 前（$src）"; fi ;;
esac
echo CHECKED
"""


def busy_reasons():
    """止めない理由の並び。空なら誰も使っていない。答えが返らないのも「止めない」に倒す"""
    try:
        st, out = run(busy_script(), CHECK_TIMEOUT, quiet=True)
    except SystemExit as e:
        return [f"確かめのコマンドを送れなかった（{e}）"]
    lines = [ln.strip() for ln in out.splitlines()]
    why = [ln[5:] for ln in lines if ln.startswith("BUSY ")]
    if st != "Success" or "CHECKED" not in lines:
        why.append(f"確かめの答えが返らない（ssm status: {st}）。ほかのコマンドが居座っていると、それが終わるまで始まらない")
    return why


def stop(force=False):
    """ほかの担当やあやとが使っている最中なら止めずに理由を出して 1。--force のときだけ中を見ずに止める"""
    st = state()
    if st in ("stopped", "stopping"):
        print(f"{st}（もう止まっている。何もしない）")
        return 0
    if not force:
        why = busy_reasons() if st == "running" else [f"いまの状態が {st}（誰かが起こしている途中かもしれない）"]
        if why:
            print("止めない。使っている最中:")
            for w in why:
                print(f"  - {w}")
            print("自分の鍵なら外してからもう一度。ほかの人のなら置いておく（誰も使わなくなって30分で idle-stop が止める）。\n"
                  "中を見ずに止めると決めたときだけ: python3 .claude/skills/ec2-chrome/ec2.py stop --force")
            return 1
    aws("ec2", "stop-instances", "--instance-ids", INSTANCE)
    aws("ec2", "wait", "instance-stopped", "--instance-ids", INSTANCE)
    print(state())
    return 0


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
        sys.exit(stop("--force" in sys.argv[2:]))
