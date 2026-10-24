#!/usr/bin/env python3
"""EC2 に SSM でスクリプトを送り、標準出力を受け取る。ファイルも持ち帰れる。

    python3 .claude/skills/ec2-chrome/ec2.py run <script.sh> [timeout秒]   # EC2 で実行して stdout/stderr を出す
    python3 .claude/skills/ec2-chrome/ec2.py get <EC2のパス> <手元のパス>   # EC2 のファイルを持ち帰る
    python3 .claude/skills/ec2-chrome/ec2.py put <手元のパス> <EC2のパス>   # 手元のファイルを EC2 へ送る
    python3 .claude/skills/ec2-chrome/ec2.py state | start
    python3 .claude/skills/ec2-chrome/ec2.py stop [--force]   # 使っている人が居れば止めずに理由を出して 1（下の「止める前に見るもの」）
    python3 .claude/skills/ec2-chrome/ec2.py guard            # 誰も使っていなければ EC2 がひとりでに止まる見張りと、
                                                              # 遠隔デスクトップの本物の入力の見張り（desktop_input.py）と、
                                                              # 順番待ち（ec2-queue）と cdp.py の正の版・戻す見張り（cdp-heal）を入れ直す
    python3 .claude/skills/ec2-chrome/ec2.py hold <列> --who 誰 --purpose 何のため [--wait 秒] [--ttl 秒] -- <コマンド…>
                                                              # 列の札を取ってコマンドを回し、終わったら必ず返す（下の「札」）
    python3 .claude/skills/ec2-chrome/ec2.py queue            # いま誰が何を持ち、誰が待っているか

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

**`/home/ubuntu/cdp/cdp.py` へ置くときは、EC2 の版のほうが新しければ置かない**（`cdp.py` の頭「版の番号」）。
一時ファイルに書いてから、`cdp_heal.sh` の place を字ごと送ってその場で比べる（EC2 に `cdp-heal` が
まだ無くても効く）。置かなかったときは理由を出して戻る（落とさない。EC2 の新しい版で続ければよい）。

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

**最後に札を見る。** 上のどれにも当たらなければ、同じ1回の SSM の中で `ec2-queue stop-mark` を呼ぶ。
列が全部空なのを EC2 の鍵（flock）を持ったまま確かめ、「止める印」を立ててから、外で stop-instances を打つ。
確かめてから止めるまでのあいだに来た人は、印を見て止まりきるのを待ち、起こし直してから札を取る（`lease`）。
stop-instances が落ちたら印を外す。

## 札（順番待ち。2026-10-24）

Chrome の束（`cdp.py` の `up(名前)`）ごとに列があり、1人ずつ持つ。持ち主と待ち人は EC2 の中
（`/var/lib/ec2-queue`、道具は `ec2_queue.py`）に置く。セッションどうしは別の箱なので、手元では分け合えない。

    with ec2.lease("fish", who="voice", purpose="A/01〜A/13"):   # 取れるまで待つ。EC2 が止まっていれば起こす
        ec2.run(...)                                              # 札は EC2 の上の up("fish") にも渡る

- **心拍はこのプロセスの中のスレッドで打つ。** 切り離した裏のプロセスで打たない（セッションが死んでも
  心拍だけ生き残ると、EC2 が止まらなくなる）。セッションが死ねば心拍が止まり、札は `ttl`（既定10分）で失効する
- 待っているあいだは、何番目で誰が持っているかを出す。`wait` 秒を超えたら、持ち主と目的を出して諦める（`QueueError`）
- `run()` は、手元の札（`EC2_QUEUE_TICKET`）を EC2 の上のプロセスへ渡す（`cdp.py` の `up()` が、自分の
  セッションの札を他人の札と取り違えて待ち続けないように）。止める印が立っていれば何もせずに戻り、
  止まりきるのを待って起こし直してから送り直す
"""
import base64, contextlib, json, os, re, shlex, signal, socket, subprocess, sys, time, hashlib, threading

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
QUEUE = "/usr/local/sbin/ec2-queue"   # 順番待ち（ec2_queue.py）。guard が置く
QUEUE_DIR = "/var/lib/ec2-queue"
# cdp.py の生きている置き場・正の版（root だけが書ける）・戻す見張り（cdp_heal.sh）。置き場の名前は cdp_heal.sh の頭と同じ
CDP_LIVE = f"{EC2_HOME}/cdp/cdp.py"
CDP_CANON = "/usr/local/lib/ec2-chrome/cdp.py"
CDP_HEAL = "/usr/local/sbin/cdp-heal"
HEAL_EOF = "CDP_HEAL_SH_EOF"
PART = 40000                 # put の1片（send-command の引数は 64KB まで）
QMARK = "EC2Q"                         # ec2-queue --json の答えの行の頭
STOPPING = "EC2-QUEUE: STOPPING"       # run() の頭が、止める印を見て何もせずに戻ったときの1行
TTL = 600                    # 手元の札の期限（心拍が途切れてから）。ec2_queue.py の TTL と同じ
WAIT_S = 1800                # 札を待つ上限の既定
# 待ち・聞き直しの間を、まとめて縮める（自己テストだけが使う。本番は 1）
T = float(os.environ.get("EC2_PY_TIME_SCALE", "1"))


def aws(*args, check=True):
    r = subprocess.run(AWS + list(args), capture_output=True, text=True)
    if check and r.returncode:
        sys.exit(f"aws failed: {' '.join(args[:3])}: {r.stderr.strip()[:500]}")
    return r.stdout.strip()


def state():
    return aws("ec2", "describe-instances", "--instance-ids", INSTANCE,
               "--query", "Reservations[0].Instances[0].State.Name", "--output", "text")


def _send(script: str, timeout: int = 600):
    """1本送って待ち、(状態, 標準出力, 標準エラー) を返す"""
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
        time.sleep(2 * T)
        st = aws("ssm", "get-command-invocation", "--command-id", cid, "--instance-id", INSTANCE,
                 "--query", "Status", "--output", "text", check=False) or "Pending"
        if st in ("Success", "Failed", "Cancelled", "TimedOut"):
            break
    out = json.loads(aws("ssm", "get-command-invocation", "--command-id", cid, "--instance-id", INSTANCE, "--output", "json"))
    return st, out.get("StandardOutputContent", ""), out.get("StandardErrorContent", "")


def _prefix() -> str:
    """run() で送る sh の頭。手元の札を EC2 の上のプロセスへ渡し、止める印が立っていれば何もせずに戻る"""
    lines = [f"export {k}={shlex.quote(os.environ[k])}" for k in ("EC2_QUEUE_TICKET", "EC2_QUEUE_WHO", "EC2_QUEUE_PURPOSE")
             if os.environ.get(k)]
    lines.append(f'if [ -x {QUEUE} ] && {QUEUE} stopping >/dev/null 2>&1; then echo "{STOPPING}"; exit 0; fi')
    return "\n".join(lines) + "\n"


def run(script: str, timeout: int = 600, quiet=False, raw=False):
    """EC2 で sh を回す。raw=False（ふつう）なら頭に _prefix() を付け、止める印を見たら止まりきるのを待って
    起こし直し、送り直す（印を立てた人が確かめてから止めるまでのあいだに来た人を、止めた EC2 の上に置き去りにしない）"""
    for _ in range(3):
        st, out, err = _send(script if raw else _prefix() + script, timeout)
        if raw or not out.startswith(STOPPING):
            break
        _log("EC2 を止めている最中だった（止める印）。止まりきるのを待って起こし直してから送り直す")
        ride_out_stop()
    if not quiet:
        sys.stdout.write(out)
        if err.strip():
            sys.stdout.write("\n--- stderr ---\n" + err)
        print(f"\n[ssm status: {st}]")
    return st, out


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


def heal_sh(*args) -> str:
    """cdp_heal.sh の字をそのまま送って、EC2 の上でその場で回す sh（EC2 に cdp-heal がまだ無くても効く）。
    置いてある cdp-heal を呼ばずに字で送るのは、手元の版の比べかたで比べるためと、偽の EC2 の置き場の
    差し替えが中まで届くように（自己テスト）"""
    body = open(os.path.join(HERE, "cdp_heal.sh"), encoding="utf-8").read().rstrip("\n")
    if HEAL_EOF in body:
        sys.exit(f"cdp_heal.sh に {HEAL_EOF} の字がある（ヒアドキュメントの終わりと取り違える）")
    return f"sh -s {' '.join(shlex.quote(str(a)) for a in args)} <<'{HEAL_EOF}'\n{body}\n{HEAL_EOF}\n"


def put(local: str, remote: str):
    """手元のファイルを EC2 へ送る。戻り値は置いたか（cdp.py で EC2 の版のほうが新しく、置かなかったときだけ False）"""
    # 中身が SSM のログに残るので、動画はここを通さない（上の「put で送ってよいもの」）
    if os.path.splitext(local)[1].lower() in VIDEO:
        sys.exit(f"put は動画を送らない（中身が SSM のログに残る）: {local}\n"
                 "  → python3 tools/shorts/post/send.py put <手元> <EC2>")
    data = open(local, "rb").read()
    b64 = base64.b64encode(data).decode()
    # cdp.py の生きている置き場は、一時ファイルに書いてから版を比べて置く（下げない。上の「put で送ってよいもの」）
    live = os.path.normpath(remote) == CDP_LIVE
    dst = f"{remote}.put.{os.getpid()}" if live else remote
    if len(b64) <= PART:
        # 1片で収まるもの（道具はほぼ全部）は1回で送る。片に割ると send-command が4回になる
        write = f"mkdir -p \"$(dirname '{remote}')\" && printf '%s' '{b64}' | base64 -d > '{dst}'"
    else:
        # send-command の引数は 64KB まで。40,000 字ずつ番号付きの片に書き、8本並べて送る
        # （順に足していくと 1MB で5分かかった）。最後に番号順につなぐ
        from concurrent.futures import ThreadPoolExecutor
        run(f"rm -rf '{remote}.parts' && mkdir -p '{remote}.parts'", 30, quiet=True)
        offs = list(range(0, len(b64), PART))
        def one(i):
            for _ in range(3):
                st, _ = run(f"printf '%s' '{b64[offs[i]:offs[i] + PART]}' > '{remote}.parts/{i:05d}'", 60, quiet=True)
                if st == "Success":
                    return
            sys.exit(f"part {i} failed")
        with ThreadPoolExecutor(8) as ex:
            list(ex.map(one, range(len(offs))))
        run(f"cat '{remote}.parts'/* > '{remote}.b64' && rm -rf '{remote}.parts'", 60, quiet=True)
        write = f"base64 -d '{remote}.b64' > '{dst}' && rm -f '{remote}.b64'"
    want = hashlib.sha256(data).hexdigest()
    if live:
        st, out = run(f"{write} && echo WROTE", 60, quiet=True)
        if "WROTE" not in out.split():
            sys.exit(f"put failed (ssm {st}): {out.strip()[-300:]}")
        st, out = run(heal_sh("place", dst), 60, quiet=True)
        words = next((ln.split() for ln in out.splitlines() if ln.split()[:1] in (["PLACED"], ["KEPT"])), [])
        if words[:1] == ["KEPT"]:
            kv = dict(w.split("=", 1) for w in words[1:] if "=" in w)
            print(f"put: EC2 の cdp.py は版 {kv.get('ec2')} で、手元（版 {kv.get('local')}）より新しい。"
                  f"下げないので置かなかった（{local} -> {remote}）")
            return False
        if words[:1] != ["PLACED"] or words[-1] != want:
            sys.exit(f"put: cdp.py を置けなかった（ssm {st}）: {out.strip()[-300:]}")
    else:
        st, out = run(f"{write} && chmod 644 '{remote}' && sha256sum '{remote}' | cut -c1-64", 60, quiet=True)
        if out.strip() != want:
            sys.exit("sha256 mismatch on put")
    print(f"put {local} -> {remote} ({len(data)} bytes)")
    return True


def guard():
    """idle_stop.sh を EC2 に置き、root の cron で5分ごとに回す（ec2-chrome の SKILL.md 2）。
    desktop_input.py も置いて systemd で起こす（投稿の GUARD と idle-stop が「あやとが触っているか」を聞く先）。
    順番待ち（ec2_queue.py → ec2-queue）と、その札を自分で取る cdp.py も置く。
    cdp.py は root だけが書ける置き場に**正の版**として置き（今の正の版より小さければ置かない）、生きている置き場
    （/home/ubuntu/cdp/cdp.py）へは版を比べて写す。生きている版が正の版より小さくなったら戻す見張り
    （cdp_heal.sh → cdp-heal。systemd の .path と5分ごとの cron）も入れる（cdp.py の頭「版の番号」）。
    セッションは唐突に切れるので、止めるのを手元に頼らない。何度入れ直してもよい。
    **置くのは .new に書いてから mv。** cron が5分ごとに idle-stop を起こすので、書いている途中の字を sh が読まないように"""
    items = [("idle_stop.sh", "/usr/local/sbin/idle-stop"), ("desktop_input.py", DESKTOP_INPUT),
             ("ec2_queue.py", QUEUE), ("cdp_heal.sh", CDP_HEAL)]
    for src, dst in items:
        put(os.path.join(HERE, src), dst + ".new")
    put(os.path.join(HERE, "cdp.py"), CDP_CANON + ".new")
    mv = " && ".join(f"mv -f {d}.new {d}" for _, d in items)
    st, out = run(f"chmod 755 /usr/local/sbin/idle-stop.new {DESKTOP_INPUT}.new {QUEUE}.new {CDP_HEAL}.new && {mv} && "
                  # 正の版を置いてから（下げない）、生きている置き場へ版を比べて写し、見張りを入れて1回確かめる
                  f"mkdir -p {EC2_HOME}/cdp && cp {CDP_CANON}.new {CDP_LIVE}.guard && "
                  f"{CDP_HEAL} canon {CDP_CANON}.new && {CDP_HEAL} place {CDP_LIVE}.guard && "
                  f"{CDP_HEAL} install && {CDP_HEAL} check guard && "
                  f"install -d -m 2775 -o root -g ubuntu {QUEUE_DIR} && "
                  "(command -v xprintidle >/dev/null || DEBIAN_FRONTEND=noninteractive apt-get install -y -q xprintidle >/dev/null 2>&1); "
                  "(command -v xinput >/dev/null || DEBIAN_FRONTEND=noninteractive apt-get install -y -q xinput >/dev/null 2>&1); "
                  "/usr/local/sbin/desktop-input install && "
                  "printf '%s\\n' 'SHELL=/bin/sh' '*/5 * * * * root /usr/local/sbin/idle-stop' > /etc/cron.d/idle-stop && "
                  "chmod 644 /etc/cron.d/idle-stop && "
                  "echo armed=$([ -f /etc/idle-stop/armed ] && echo yes || echo no) && "
                  "echo cron: $(grep idle-stop /etc/cron.d/idle-stop) && "
                  f"echo queue: $(stat -c '%A %U:%G' {QUEUE_DIR}) && {QUEUE} list && {CDP_HEAL} status && "
                  "tail -3 /var/log/idle-stop.log 2>/dev/null; tail -3 /var/log/cdp-heal.log 2>/dev/null", 300, quiet=True, raw=True)
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
    checks = f"""now=$(date +%s)
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
"""
    # 既存の確かめ（SSM・鍵・遠隔デスクトップ）に1つも当たらなければ、札を見る。列が全部空なら、EC2 の鍵を
    # 持ったまま止める印を立てる（ec2_queue.py の stop-mark）。ec2-queue が無い EC2 には、そもそも札が無い
    who = shlex.quote(default_who())
    return f"""out=$(
{checks})
[ -n "$out" ] && printf '%s\\n' "$out"
case "$out" in
  *BUSY*) ;;
  *) if [ -x {QUEUE} ]; then
       q=$(timeout 30 {QUEUE} stop-mark --by {who} 2>&1); rc=$?
       case "$rc" in
         0) printf '%s\\n' "$q" | grep '^MARKED ' ;;
         3) printf '%s\\n' "$q" | sed -n 's/^BUSY /BUSY queue: /p' ;;
         *) echo "BUSY queue: ec2-queue が答えない（rc=$rc: $(printf '%s' "$q" | tail -1 | cut -c1-160)）" ;;
       esac
     else
       echo NOQUEUE
     fi ;;
esac
echo CHECKED
"""


def busy_reasons():
    """(止めない理由の並び, 止める印)。理由が空なら誰も使っておらず、印が立っている（ec2-queue が無ければ印は None）。
    答えが返らないのも「止めない」に倒す"""
    try:
        st, out = run(busy_script(), CHECK_TIMEOUT, quiet=True, raw=True)
    except SystemExit as e:
        return [f"確かめのコマンドを送れなかった（{e}）"], None
    lines = [ln.strip() for ln in out.splitlines()]
    why = [ln[5:] for ln in lines if ln.startswith("BUSY ")]
    token = next((ln.split()[1] for ln in lines if ln.startswith("MARKED ") and len(ln.split()) > 1), None)
    if st != "Success" or "CHECKED" not in lines:
        why.append(f"確かめの答えが返らない（ssm status: {st}）。ほかのコマンドが居座っていると、それが終わるまで始まらない")
    elif not why and not token and "NOQUEUE" not in lines:
        why.append("札（ec2-queue）の確かめが答えない（止める印が立たなかった）")
    if why and token:
        queue_call(["stop-unmark", token], 60)
        token = None
    return why, token


def stop(force=False):
    """ほかの担当やあやとが使っている最中なら止めずに理由を出して 1。--force のときだけ中を見ずに止める"""
    st = state()
    if st in ("stopped", "stopping"):
        print(f"{st}（もう止まっている。何もしない）")
        return 0
    token = None
    if not force:
        why, token = busy_reasons() if st == "running" else ([f"いまの状態が {st}（誰かが起こしている途中かもしれない）"], None)
        if why:
            print("止めない。使っている最中:")
            for w in why:
                print(f"  - {w}")
            print("自分の鍵・札なら外してからもう一度。ほかの人のなら置いておく（誰も使わなくなって30分で idle-stop が止める）。\n"
                  "中を見ずに止めると決めたときだけ: python3 .claude/skills/ec2-chrome/ec2.py stop --force")
            return 1
    try:
        aws("ec2", "stop-instances", "--instance-ids", INSTANCE)
    except SystemExit:
        # 止められなかった。印を残すと、印の寿命（10分）のあいだ誰も札を取れない
        if token:
            queue_call(["stop-unmark", token], 60)
        raise
    aws("ec2", "wait", "instance-stopped", "--instance-ids", INSTANCE)
    print(state())
    return 0


# ---- 札（順番待ち） --------------------------------------------------------

class QueueError(Exception):
    """札が取れない（待つ上限を超えた・ec2-queue が答えない）"""


def _log(msg: str):
    print(f"[ec2-queue] {msg}", file=sys.stderr, flush=True)


def default_who() -> str:
    """誰の札か。セッションの ID の頭と pid（同じ箱の別の担当とも見分けられるように）"""
    sid = os.environ.get("CLAUDE_CODE_SESSION_ID", "")[:8] or socket.gethostname()
    return os.environ.get("EC2_QUEUE_WHO") or f"{sid}:{os.getpid()}"


def queue_call(args, timeout=60) -> dict:
    """EC2 の ec2-queue を1回呼び、答え（EC2Q の行の JSON）を返す。無ければ {"state": "noqueue"}、
    送れない・読めないときは {"state": "error"}"""
    cmd = " ".join(shlex.quote(str(a)) for a in args)
    sh = (f"if [ -x {QUEUE} ]; then {QUEUE} --json {cmd}; "
          f"else echo '{QMARK} {{\"state\": \"noqueue\"}}'; fi")
    try:
        st, out = run(sh, timeout, quiet=True, raw=True)
    except SystemExit as e:
        return {"state": "error", "why": f"送れなかった: {e}"}
    for ln in reversed(out.splitlines()):
        if ln.startswith(QMARK + " "):
            try:
                return json.loads(ln[len(QMARK) + 1:])
            except ValueError:
                break
    return {"state": "error", "why": f"ssm {st}: {out.strip()[-300:]}"}


def ensure_running(log=_log, limit=900):
    """止まっていれば起こし、SSM が繋がるまで待つ。止めている途中なら止まりきるのを待ってから起こす"""
    end = time.time() + limit * T
    while True:
        st = state()
        if st == "running":
            break
        if time.time() > end:
            raise QueueError(f"EC2 が {limit}秒たっても起きない（いま {st}）")
        if st == "stopped":
            log("EC2 が止まっているので起こす")
            aws("ec2", "start-instances", "--instance-ids", INSTANCE)
            aws("ec2", "wait", "instance-running", "--instance-ids", INSTANCE)
        elif st == "pending":
            aws("ec2", "wait", "instance-running", "--instance-ids", INSTANCE)
        else:
            log(f"EC2 が {st}。止まりきるのを待つ")
            time.sleep(10 * T)
    for _ in range(60):
        ping = aws("ssm", "describe-instance-information", "--filters", f"Key=InstanceIds,Values={INSTANCE}",
                   "--query", "InstanceInformationList[0].PingStatus", "--output", "text", check=False)
        if ping == "Online":
            return
        time.sleep(5 * T)
    raise QueueError("EC2 は起きたが SSM が繋がらない（ec2-ssm-role が外れていないか）")


def ride_out_stop(log=_log, limit=900):
    """止める印を見たとき。止まりきれば起こし直す。印が消えて起きたままなら、そのまま戻る"""
    end = time.time() + limit * T
    while time.time() < end:
        st = state()
        if st == "stopped":
            ensure_running(log)
            return
        if st == "running":
            r = queue_call(["stopping"], 60)
            # 印が消えた（止める人が止めずに抜けた）ときだけ戻る。答えないのは、止めている最中で SSM が切れたのかもしれない
            if r.get("state") in ("not", "noqueue"):
                return
        time.sleep(10 * T)
    raise QueueError(f"止める印が立ったまま {limit}秒たっても止まりきらない")


def _who_str(h) -> str:
    if not h:
        return "（持ち主は抜けた。頭の待ち人が来れば渡る）"
    return f"{h.get('who')}（{h.get('purpose')}、{int(h.get('since', 0)) // 60}分前から）"


def _acquire(lane, who, purpose, wait, ttl, log):
    end = time.time() + wait
    tk, said, said_at, errors = None, None, 0.0, 0
    r = {}
    while True:
        args = ["take", lane, "--who", who, "--purpose", purpose, "--ttl", str(ttl)] + (["--ticket", tk] if tk else [])
        r = queue_call(args)
        s = r.get("state")
        if s == "held":
            log(f"{lane}: 札を取った（{r['ticket']}）")
            return r["ticket"]
        if s == "noqueue":
            log(f"{lane}: EC2 に ec2-queue が無い（python3 .claude/skills/ec2-chrome/ec2.py guard で入る）。札なしで進む")
            return None
        if s == "waiting":
            errors = 0
            tk = r["ticket"]
            h = r.get("holder") or {}
            key = (r.get("pos"), h.get("ticket"))
            if key != said or time.time() - said_at > 300:
                log(f"{lane}: {r.get('pos')}番目に待っている。持っているのは {_who_str(r.get('holder'))}")
                said, said_at = key, time.time()
        elif s == "gone":
            log(f"{lane}: 待ち札が切れていた（{r.get('why')}）。列の後ろに並び直す")
            tk = None
        elif s == "stopping":
            log(f"{lane}: {r.get('by')} が EC2 を止めている最中。止まりきるのを待って起こし直す")
            ride_out_stop(log)
            tk = None
            continue
        else:
            if state() != "running":
                # 聞いているあいだに止まった（印を立てた人が stop-instances を打った）。止まりきってから起こし直す
                log(f"{lane}: EC2 が起きていない。止まりきるのを待って起こし直す")
                ride_out_stop(log)
                tk = None
                continue
            errors += 1
            log(f"{lane}: ec2-queue が答えない（{r.get('why') or r}）")
            if errors >= 4:
                if tk:
                    queue_call(["release", tk])
                raise QueueError(f"{lane}: ec2-queue が答えない（{r.get('why') or r}）")
        if time.time() > end:
            if tk:
                queue_call(["release", tk])
            raise QueueError(f"{lane}: {wait}秒待っても空かないので諦める。持っているのは {_who_str(r.get('holder'))}")
        time.sleep(15 * T)


class _Beater(threading.Thread):
    """心拍。**札を取ったプロセスの中のスレッド**で打つ（プロセスが死ねば一緒に止まる。daemon）"""

    def __init__(self, lane, tk, ttl, log):
        super().__init__(daemon=True, name=f"ec2-queue-beat-{lane}")
        self.lane, self.tk, self.log = lane, tk, log
        self.every = max(5.0, min(120.0, ttl / 5)) * T
        self.done = threading.Event()
        self.lost = None

    def run(self):
        while not self.done.wait(self.every):
            try:
                r = queue_call(["beat", self.tk], 60)
            except BaseException as e:  # aws() は sys.exit で落ちる。スレッドを黙って死なせない
                r = {"state": "error", "why": repr(e)}
            s = r.get("state")
            if s == "gone":
                self.lost = r.get("why")
                self.log(f"{self.lane}: 札を失った（{self.lost}）。ほかの人が持っているかもしれない")
                return
            if s not in ("held", "waiting"):
                self.log(f"{self.lane}: 心拍が届かなかった（{r.get('why') or s}）。続けて打つ")


@contextlib.contextmanager
def lease(lane, who=None, purpose="", wait=WAIT_S, ttl=TTL, log=_log):
    """列 lane の札を取り（取れるまで待つ）、抜けるときに必ず返す。EC2 が止まっていれば起こす。
    札はこのプロセスの環境（EC2_QUEUE_TICKET）に入り、run() が EC2 の上へ渡す"""
    who = who or default_who()
    ensure_running(log)
    tk = _acquire(lane, who, purpose, wait, ttl, log)
    if tk is None:
        yield None
        return
    beater = _Beater(lane, tk, ttl, log)
    beater.start()
    keys = ("EC2_QUEUE_TICKET", "EC2_QUEUE_WHO", "EC2_QUEUE_PURPOSE")
    saved = {k: os.environ.get(k) for k in keys}
    os.environ["EC2_QUEUE_TICKET"] = ((saved["EC2_QUEUE_TICKET"] or "") + f" {lane}:{tk}").strip()
    os.environ["EC2_QUEUE_WHO"] = who
    if purpose:
        os.environ["EC2_QUEUE_PURPOSE"] = purpose
    try:
        yield tk
    finally:
        beater.done.set()
        for k, v in saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        r = queue_call(["release", tk], 60)
        if r.get("state") in ("released", "gone"):
            log(f"{lane}: 札を返した")
        else:
            log(f"{lane}: 札を返せなかった（{r.get('why') or r}）。心拍は止めたので {ttl}秒で失効する")


def hold_main(argv) -> int:
    """ec2.py hold <列> --who 誰 --purpose 何のため [--wait 秒] [--ttl 秒] [-- <コマンド…>]"""
    import argparse
    p = argparse.ArgumentParser(prog="ec2.py hold")
    p.add_argument("lane")
    p.add_argument("--who", required=True)
    p.add_argument("--purpose", required=True)
    p.add_argument("--wait", type=int, default=WAIT_S)
    p.add_argument("--ttl", type=int, default=TTL)
    # コマンドは -- の後ろ。argparse の REMAINDER は列の後ろの --who まで飲み込むので、先に切る
    argv = list(argv)
    cmd = []
    if "--" in argv:
        i = argv.index("--")
        argv, cmd = argv[:i], argv[i + 1:]
    a = p.parse_args(argv)

    def term(signum, frame):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, term)
    try:
        with lease(a.lane, a.who, a.purpose, a.wait, a.ttl) as tk:
            if not cmd:
                # コマンドを渡さないとき: 止められるまで持つ。続く手元のコマンドに札を渡すには、頭に付ける
                print(f"EC2_QUEUE_TICKET={os.environ.get('EC2_QUEUE_TICKET', '')}  ← 続く ec2.py run の頭に付ける"
                      if tk else "（札なし）", flush=True)
                while True:
                    time.sleep(3600)
            child = subprocess.Popen(cmd)
            try:
                return child.wait()
            except KeyboardInterrupt:
                child.terminate()
                try:
                    child.wait(15)
                except subprocess.TimeoutExpired:
                    child.kill()
                return 130
    except KeyboardInterrupt:
        return 130
    except QueueError as e:
        print(f"[ec2-queue] {e}", file=sys.stderr)
        return 75


def queue_show() -> int:
    st = state()
    if st != "running":
        print(f"{st}（EC2 が起きていない。誰も持っていない）")
        return 0
    s, out = run(f"if [ -x {QUEUE} ]; then {QUEUE} list; else echo 'ec2-queue が無い（ec2.py guard で入る）'; fi", 60,
                 quiet=True, raw=True)
    print(out.strip())
    return 0 if s == "Success" else 1


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
        ensure_running()
        print(state())
    elif cmd == "guard":
        guard()
    elif cmd == "stop":
        sys.exit(stop("--force" in sys.argv[2:]))
    elif cmd == "hold":
        sys.exit(hold_main(sys.argv[2:]))
    elif cmd == "queue":
        sys.exit(queue_show())
    else:
        sys.exit(__doc__)
