#!/usr/bin/env python3
"""手元から回す。EC2 の Chrome（~/cdp-cloudflare）で Cloudflare に入り、ayato-arigato.com の DNS を**読む**。
EC2 の上で動くのは同じ置き場の cf_ec2.py（ここが毎回 /home/ubuntu/cdp/ へ置き直す）。

    python3 .claude/skills/cloudflare/cf.py check        # 入っているかだけ（何も押さない。Google の本人確認は1枚も開かない）
    python3 .claude/skills/cloudflare/cf.py dns-list     # いまのレコード（種類・名前・値・プロキシ）
    python3 .claude/skills/cloudflare/cf.py dns-plan A @ 199.36.158.100 [TYPE NAME CONTENT …]
                                                         # いまと比べて、足りない・食い違う・プロキシが入っているものを、
                                                         # あやとがスマホの Cloudflare で打てる表にして出す
    python3 .claude/skills/cloudflare/cf.py start        # 入る。数字が画面に出た瞬間に CHALLENGE numbers=[…] を1行出して抜ける
    CHECK_ONLY=1 python3 .claude/skills/cloudflare/cf.py start   # 押す前に止まる（スマホは鳴らない）
    python3 .claude/skills/cloudflare/cf.py wait         # あやとが押したあと。LOGGED_IN / EXPIRED / STOP（最大7分）

終了コード: 0 = LOGGED_IN / CHECK_ONLY / DONE / 数字が出た / dns-plan で全部揃っている、3 = STOP、4 = NOT_LOGGED_IN、
5 = EXPIRED、6 = dns-plan であやとに打ってもらうものがある、2 = 呼びかたが違う、1 = それ以外。

## 書く口を持たない

DNS を足す・API トークンを作る・GitHub の Secret に入れる、は道具に持たせていない。
2026-11-13 にダッシュボードの中から DNS を足そうとしたら Cloudflare の WAF が 403 で止めた。あれは Cloudflare の守りで、
抜けようとしない。DNS はあやとがスマホで入れる（dns-plan の表をそのまま渡す）。トークンが要るときは、あやとが
Cloudflare の画面で作る仕事として issue を立てる（SKILL.md 5）。

## なぜ start と wait に分けるか

ログイン全体を SSM の1コマンドで回すと、出力は終わってからまとめて届く。数字が見えたときには
5分の窓が閉じている（Doneru で 2026-10-01 に踏んだ）。だから EC2 では cf_ec2.py を切り離して走らせ、
start は数字のファイルだけを聞き直して、出た瞬間に1行出して抜ける。続きは wait が読む。
"""
import json, os, re, shlex, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "ec2-chrome"))
import ec2  # noqa: E402

ZONE = "ayato-arigato.com"
REMOTE = "/home/ubuntu/cdp/cf_ec2.py"
LOG = "/home/ubuntu/cloudflare/login.log"
CH = "/tmp/cloudflare_challenge.txt"
CHECK_ONLY = os.environ.get("CHECK_ONLY") == "1"
WHO = "cloudflare:" + (os.environ.get("CLAUDE_CODE_SESSION_ID", "")[:8] or "local")
RC = {"LOGGED_IN": 0, "CHECK_ONLY": 0, "DONE": 0, "STOP": 3, "NOT_LOGGED_IN": 4, "EXPIRED": 5}
# ログのうち、手元に出す行（読みどころ）。CHALLENGE は数字のファイルから1行だけ出すので、ここには入れない
SHOW = ("RESULT:", "  guard", "  saved", "  account", "    [", "  押す前", "  press", "  challenge", "  shot", "  wait",
        "  zone", "cdp:", "Traceback")
PROXIABLE = {"A", "AAAA", "CNAME"}   # 雲（プロキシ）を持つ種類。どれも切る（橙にすると Firebase Hosting の証明書が進まない）
SOLE = {"A", "AAAA", "CNAME"}        # 同じ名前に別の値が並ぶと流れが割れる（A を2つ＝半分の人が違う所へ）


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
    purpose = "Cloudflare のログイン画面まで（押さない）" if CHECK_ONLY else "Cloudflare に入る"
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
    print(f"started（{'CHECK_ONLY: 押す前に止まる' if CHECK_ONLY else '数字が出たら1行出す'}）", flush=True)
    return poll(t0, int(m.group(1)), not CHECK_ONLY, 240)


def wait():
    if ec2.state() != "running":
        print("EC2 が起きていない（ログインの回は無い）")
        return 1
    return poll(time.time(), 0, False, 420)


def oneshot(cmd, timeout=120):
    """check / dns-list。EC2 の上で1回回して出力を返す。このコマンドが EC2 を起こしたときだけ、終わりに止める"""
    woke = wake()
    place()
    sh = (f"mkdir -p /home/ubuntu/shots; cd /home/ubuntu/cdp && {env('Cloudflare の ' + cmd + '（読むだけ）', 120)} "
          f"timeout {timeout} python3 cf_ec2.py {shlex.quote(cmd)} 2>&1")
    st, out = ec2.run(sh, timeout + 60, quiet=True)
    lines = out.strip().splitlines()
    if woke:
        print("EC2: このコマンドが起こしたので止める（使っている人が居れば断られて、30分の自動停止に任せる）", flush=True)
        ec2.stop()
    rc = result_rc(lines)
    return (1 if rc is None else rc), lines


# ---------------------------------------------------------------- DNS を読む・比べる（ここは手元だけで決まる）

def fqdn(name):
    name = name.strip().rstrip(".").lower()
    if name in ("@", ZONE):
        return ZONE
    return name if name.endswith("." + ZONE) else f"{name}.{ZONE}"


def short(name):
    """スマホの Cloudflare の「名前」の欄に打つ形（頂点は @、ほかはゾーンを外したもの）"""
    name = (name or "").rstrip(".").lower()
    return "@" if name == ZONE else name[: -len(ZONE) - 1] if name.endswith("." + ZONE) else name


def norm(typ, v):
    v = (v or "").strip()
    if typ == "TXT":
        # TXT は引用符つきで返ることがある（"..." と ... を同じものとして比べる）
        return v[1:-1] if len(v) >= 2 and v[0] == v[-1] == '"' else v
    if typ in ("CNAME", "NS", "MX"):
        return v.rstrip(".").lower()
    return v.lower()


def records(lines):
    """cf_ec2.py dns-list の `  REC {json}` を読む"""
    out = []
    for ln in lines:
        if ln.startswith("  REC "):
            try:
                out.append(json.loads(ln[6:]))
            except ValueError:
                pass
    return out


def plan(want, have):
    """欲しいレコード（(種類, 名前, 値) の並び）と、いまのレコードを比べる。1本ごとに (札, 欲しいもの, 関わる今のレコード)。
    札: SAME（在る）/ PROXIED（在るが雲が橙）/ MISSING（足りない）/ CLASH（同じ名前に、流れを割る別の値が在る）"""
    out = []
    for typ, name, content in want:
        at = [r for r in have if (r.get("name") or "").rstrip(".").lower() == name]
        same = [r for r in at if r.get("type") == typ and norm(typ, r.get("content")) == norm(typ, content)]
        # A・AAAA・CNAME は同じ名前に別の値が並ぶと流れが割れる。CNAME はその名前のほかのレコードと並べない
        clash = [r for r in at if r not in same
                 and ((typ in SOLE and r.get("type") == typ) or typ == "CNAME" or r.get("type") == "CNAME")]
        if clash:
            out.append(("CLASH", (typ, name, content), clash))
        elif not same:
            out.append(("MISSING", (typ, name, content), []))
        elif typ in PROXIABLE and any(r.get("proxied") for r in same):
            out.append(("PROXIED", (typ, name, content), same))
        else:
            out.append(("SAME", (typ, name, content), same))
    return out


def proxy_cell(typ):
    return "切る（DNS only・灰色の雲）" if typ in PROXIABLE else "—"


def show_plan(rows):
    n = {k: sum(1 for r in rows if r[0] == k) for k in ("SAME", "MISSING", "CLASH", "PROXIED")}
    print(f"PLAN: もう在る {n['SAME']}・足りない {n['MISSING']}・食い違う {n['CLASH']}・プロキシを切る {n['PROXIED']}")
    for k, (typ, name, content), rs in rows:
        print(f"  {k}: {typ} {short(name)} {content}" + (f"  今: {[(r.get('type'), r.get('content')) for r in rs]}" if k == "CLASH" else ""))
    todo = [r for r in rows if r[0] != "SAME"]
    if not todo:
        print("全部揃っている。あやとに打ってもらうものは無い")
        return 0
    # issue にそのまま貼る表。名前・値はスマホの欄に打つ形（TTL は Auto のまま）
    print(f"\nあやとがスマホの Cloudflare（{ZONE} の DNS）で打つもの。TTL は Auto のまま:\n")
    print("| # | すること | 種類 | 名前 | 値 | プロキシ |")
    print("| --- | --- | --- | --- | --- | --- |")
    for i, (k, (typ, name, content), rs) in enumerate(todo, 1):
        what = {"MISSING": "足す", "PROXIED": "雲を橙から灰色に（値はそのまま）",
                "CLASH": "直す（今: " + "、".join(f"{r.get('type')} {norm(r.get('type'), r.get('content'))}" for r in rs) + "）"}[k]
        print(f"| {i} | {what} | {typ} | {short(name)} | {norm(typ, content)} | {proxy_cell(typ)} |")
    if n["CLASH"]:
        print("\n「直す」は、今のレコードを消すか書き換えるかを、こちらが中身を見て決めてから表に書き足す（あやとに選ばせない）")
    return 6


def want_of(argv):
    if not argv or len(argv) % 3:
        return None
    return [(argv[i].upper(), fqdn(argv[i + 1]), argv[i + 2]) for i in range(0, len(argv), 3)]


def dns(cmd, argv):
    want = None
    if cmd == "dns-plan":
        want = want_of(argv)
        if want is None:
            # 呼びかたの間違いで EC2 を起こさない
            print("使いかた: cf.py dns-plan TYPE NAME CONTENT [TYPE NAME CONTENT …]（例: A @ 199.36.158.100 CNAME www live-streaming-d3cac.web.app）")
            return 2
    rc, lines = oneshot("dns-list")
    have = records(lines)
    for ln in lines:
        if not ln.startswith("  REC "):
            print(ln)
    if rc:
        return rc
    if cmd == "dns-list":
        print("\n| 種類 | 名前 | 値 | プロキシ |\n| --- | --- | --- | --- |")
        for r in have:
            px = "—" if r.get("type") not in PROXIABLE else ("入（橙）" if r.get("proxied") else "切（灰色）")
            print(f"| {r.get('type')} | {short(r.get('name'))} | {norm(r.get('type'), r.get('content'))} | {px} |")
        return 0
    return show_plan(plan(want, have))


if __name__ == "__main__":
    cmd, rest = (sys.argv[1] if len(sys.argv) > 1 else ""), sys.argv[2:]
    try:
        if cmd == "start":
            sys.exit(start())
        elif cmd == "wait":
            sys.exit(wait())
        elif cmd == "check":
            rc, lines = oneshot("check")
            print("\n".join(lines))
            sys.exit(rc)
        elif cmd in ("dns-list", "dns-plan"):
            sys.exit(dns(cmd, rest))
        print(__doc__)
        sys.exit(2)
    except ec2.QueueError as e:
        print(f"EC2: {e}")
        sys.exit(1)
