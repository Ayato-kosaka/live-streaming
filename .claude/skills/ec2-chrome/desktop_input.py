#!/usr/bin/env python3
"""遠隔デスクトップ（表示 :20）に、**人の本物の入力**が最後にあった時刻を控える。EC2 の上で動く。

    desktop-input watch     # desktop-input.service（ubuntu）が回す。X に入った生の入力を読み、時刻を控える
    desktop-input idle      # 「最後の本物の入力から何ミリ秒か」と「その数の出どころ」を1行で出す
                            #   例: 1834000 xi2 / 2147483647 xi2-never / 9190 xprintidle-dead / 0 none-nostate
    desktop-input install   # root で。unit を書いて起こす（手元の `ec2.py guard` が呼ぶ）

置き場は EC2 の /usr/local/sbin/desktop-input（`ec2.py guard` が置く）。読むのは
`tools/shorts/post/post.py` の GUARD（7分）と `idle_stop.sh`（30分）。見張りは
`tools/shorts/post/desktop_guard_selftest.py`（偽の値で回す。EC2 に触らない）。

## なぜ xprintidle をそのまま使わないか（2026-10-23 に EC2 で測った）

xprintidle は X の「無操作の時間」で、**入力の無い出来事でも0に戻る。** こちらの Chrome は
動画を流すあいだ X のスクリーンセーバーを止めていて（画面の消灯止め）、**動画を止める・閉じる
ときにそれを外すと、:20 の無操作の時間が0に戻る。** そのあいだ X の生の入力（XI2 の RawMotion
など）は1つも出ていない。使い捨てのプロファイルの Chrome で4秒の動画を60秒流して消すと、
1〜2秒後に xprintidle が 311,899ms → 965ms に戻った。
- セッションバスを切った Chrome でも戻った（部品を落とし終えたときにも1回戻った）
- Chrome を別の表示（Xvfb :99）で起こすと、xfce4-power-manager への Inhibit は同じだけ
  飛んだのに、:20 は1度も戻らなかった。戻しているのは、Chrome が :20 に繋いでいる X の線
だから xprintidle だけを見ると、こちらの手が「あやとが触っている」に化ける
（投稿の1手ごとに7分待っていた。#1011）。Chrome を別の表示へ移すと、あやとが遠隔デスクトップで
こちらの Chrome を開けなくなる（本人確認・ログインをそこでしてもらっている）ので、移さない。

ここでは **X に入ってきた生の入力（キー・ボタン・ポインタ・タッチ）だけ**を数える。
遠隔デスクトップの入力は XTest で X に入るので生の入力が出る（xdotool も同じ道）。
CDP（Input.dispatch*）の入力は Chrome の中で閉じていて X に出ない。窓が開く・閉じるときの
FocusIn / FocusOut も出るが、生の入力ではないので数えない。

## 見張りが居ないときは、前の xprintidle に戻る

見張りが動いていない・X が立ち直した・印が古い、のどれかなら、控えは信じずに xprintidle を
そのまま返す（待つ側に倒れる。前と同じ遅さになるだけ）。xprintidle も取れなければ 0
（触っている、とみなす）。
"""
import json, os, re, select, subprocess, sys, time

DISPLAY = ":20"
XAUTH = "/home/ubuntu/.Xauthority"
LOCK = "/tmp/.X20-lock"                 # X が自分の pid を書く
STATE = "/run/desktop-input/state.json"  # /run は止めると消える（前の起動の控えを持ち越さない）
UNIT_PATH = "/etc/systemd/system/desktop-input.service"
XINPUT = ["stdbuf", "-oL", "xinput", "test-xi2", "--root"]
ATTACH_S = 1.0     # xinput が X に繋いだかを見るまでの間
BEAT_S = 30        # 入力が無くても、この間隔で「生きている」を書く
FLUSH_S = 1.0      # 入力を書くのはこの間隔に1回まで。書き残した入力も、この時間のうちに必ず書く（7分を測るのに足りる）
STALE_S = 120      # 印がこれより古ければ、見張りは止まっているとみなす
SEED_TOL_S = 5     # X が立ってからの時間と xprintidle の差がこれ以内なら、立ってから入力は無い
NEVER_MS = 2**31 - 1
RAW = re.compile(r"^EVENT type \d+ \(Raw(?:KeyPress|KeyRelease|ButtonPress|ButtonRelease|Motion|TouchBegin|TouchUpdate|TouchEnd)\)")

UNIT = """[Unit]
Description=Record the last real input on the remote desktop :20 (desktop-input)
StartLimitIntervalSec=0

[Service]
User=ubuntu
RuntimeDirectory=desktop-input
RuntimeDirectoryPreserve=yes
ExecStart=/usr/bin/python3 /usr/local/sbin/desktop-input watch
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
"""


def is_input(line):
    """`xinput test-xi2 --root` の1行が、人の本物の入力か"""
    return bool(RAW.match(line))


def seed(now, x_start, xidle_ms):
    """見張りが X に繋いだ時点の「最後の入力」。X が立ってから一度も入力が無ければ None。

    繋ぐ前の入力は xprintidle にしか残っていない。xprintidle はこちらの手でも0に戻るので、
    そこから出す時刻は本当より新しくなる（待つ側に倒れる）。X が立ってからの時間と
    ほぼ同じだけ無操作なら、立ってから誰も触っていない（起こした直後がこれ）"""
    if xidle_ms is None:
        return now
    if xidle_ms / 1000 >= (now - x_start) - SEED_TOL_S:
        return None
    return now - xidle_ms / 1000


def judge(now, state, alive, x_now, xidle_ms):
    """(最後の本物の入力からのミリ秒, 出どころ)。控えが信じられないときは xprintidle に戻る"""
    why = None
    if not state:
        why = "nostate"
    elif not alive:
        why = "dead"
    elif x_now is None or state.get("x_pid") != x_now[0] or abs(state.get("x_start", 0) - x_now[1]) > 1:
        why = "xchanged"
    elif now - state.get("beat", 0) > STALE_S:
        why = "stale"
    if why:
        if xidle_ms is None:
            return 0, f"none-{why}"
        return int(xidle_ms), f"xprintidle-{why}"
    last = state.get("last")
    if last is None:
        return NEVER_MS, "xi2-never"
    return max(0, int((now - last) * 1000)), "xi2"


def xenv():
    return dict(os.environ, DISPLAY=DISPLAY, XAUTHORITY=XAUTH)


def clock():
    """起動からの秒（CLOCK_BOOTTIME）。時刻は全部これで持つ。壁の時計は、起こした直後に chrony が
    跳ばす（2026-10-23 は見張りが繋いだ5秒後に 1.84秒）。壁の時計で X の立った時刻を出していたら、
    跳んだぶん「X が立ち直した」に見えて、起こした直後の GUARD が前の xprintidle に戻った"""
    return time.clock_gettime(time.CLOCK_BOOTTIME)


def x_server():
    """表示 :20 の X の (pid, 立った時刻（起動からの秒）)。立ち直したかを pid と時刻の両方で見分ける"""
    try:
        pid = int(open(LOCK).read().strip())
        rest = open(f"/proc/{pid}/stat").read().rsplit(")", 1)[1].split()
        return pid, round(int(rest[19]) / os.sysconf("SC_CLK_TCK"), 2)
    except (OSError, ValueError, IndexError):
        return None


def xidle():
    try:
        r = subprocess.run(["xprintidle"], env=xenv(), capture_output=True, text=True, timeout=10)
        return int(r.stdout.strip()) if r.returncode == 0 else None
    except (OSError, ValueError, subprocess.SubprocessError):
        return None


def alive(pid):
    try:
        return re.search(rb"desktop[-_]input", open(f"/proc/{int(pid)}/cmdline", "rb").read()) is not None
    except (OSError, TypeError, ValueError):
        return False


def write_state(st):
    tmp = STATE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(st, f)
    os.chmod(tmp, 0o644)
    os.replace(tmp, STATE)


def watch():
    x = x_server()
    while not x:
        time.sleep(2)
        x = x_server()
    # 先に xinput を繋いでから xprintidle を読む（間に入った入力は、どちらかに必ず残る）
    p = subprocess.Popen(XINPUT, env=xenv(), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    time.sleep(ATTACH_S)
    if p.poll() is not None:
        sys.exit(f"xinput を {DISPLAY} に繋げない（systemd が起こし直す）")
    now = clock()
    xi = xidle()
    last = seed(now, x[1], xi)
    st = {"pid": os.getpid(), "x_pid": x[0], "x_start": x[1], "attached": round(now, 2),
          "seed_xidle_ms": xi, "last": None if last is None else round(last, 2), "beat": round(now, 2)}
    write_state(st)
    fd, buf, wrote, dirty = p.stdout.fileno(), b"", now, False
    while True:
        # 入力は続けて来るので、書くのは FLUSH_S に1回まで。ただし書き残した入力は FLUSH_S のうちに必ず書く
        # （xdotool の1回は DeviceChanged → RawMotion の順に来る。前者で書いた直後の後者を
        # 次の「生きている」まで30秒書かずにいて、その間の GUARD が素通りした。2026-10-23）
        r, _, _ = select.select([fd], [], [], max(0.0, wrote + FLUSH_S - clock()) if dirty else BEAT_S)
        now = clock()
        if r:
            chunk = os.read(fd, 65536)
            if not chunk:
                write_state(st)
                sys.exit("xinput が終わった（X が落ちた。systemd が起こし直す）")
            *lines, buf = (buf + chunk).split(b"\n")
            if any(is_input(ln.decode("utf-8", "replace")) for ln in lines):
                st["last"] = round(now, 2)
                dirty = True
        if not r or (dirty and now - wrote >= FLUSH_S) or now - wrote >= BEAT_S:
            st["beat"] = round(now, 2)
            write_state(st)
            wrote, dirty = now, False


def idle():
    try:
        st = json.load(open(STATE))
    except (OSError, ValueError):
        st = None
    ms, src = judge(clock(), st, bool(st) and alive(st.get("pid")), x_server(), xidle())
    print(ms, src)


def install():
    with open(UNIT_PATH, "w") as f:
        f.write(UNIT)
    for c in (["systemctl", "daemon-reload"], ["systemctl", "enable", "-q", "desktop-input.service"],
              ["systemctl", "restart", "desktop-input.service"]):
        subprocess.run(c, check=True)
    time.sleep(ATTACH_S + 3)
    print("desktop-input:", subprocess.run(["systemctl", "is-active", "desktop-input.service"],
                                           capture_output=True, text=True).stdout.strip())
    idle()


if __name__ == "__main__":
    fn = {"watch": watch, "idle": idle, "install": install}.get(sys.argv[1] if len(sys.argv) > 1 else "")
    if not fn:
        sys.exit(__doc__)
    fn()
