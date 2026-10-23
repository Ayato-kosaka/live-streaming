"""**遠隔デスクトップの見張り（「あやとが触っているか」）の見張り。EC2 には1度も触らない。**

    python3 tools/shorts/post/desktop_guard_selftest.py
    BREAK=trust_xidle python3 tools/shorts/post/desktop_guard_selftest.py   # 守りを1つ外した版で回す（対照の子）

終了コード 0=通った / 1=落ちた / **2=数えるものが無い・外す字が見つからない**
（`docs/island-standards.md` §15）。

回し役（`python/selftest_runner.py`）が `tools/shorts/` を降りて拾う。要るのは Python と sh だけ。

## 何を見るか

投稿の段は、EC2 で Chrome を開く前に「遠隔デスクトップに7分以内の本物の入力があるか」を見る
（`post.py` の `GUARD`）。前は xprintidle をそのまま見ていて、**こちらの Chrome が動画を止めるだけで
0に戻り、1手ごとに7分待っていた**（2026-10-23 に EC2 で測った。`desktop_input.py` の頭）。
いまは EC2 の `desktop-input`（`.claude/skills/ec2-chrome/desktop_input.py`）が X に入った生の入力だけの
時刻を控え、GUARD と `idle_stop.sh` がそれを読む。

この守りは「止める」と「通す」の両方が壊れうる。通しすぎると、あやとが触っている最中にこちらの
Chrome が動く。止めすぎると、前の7分待ちに戻る。だから両方を足にする。判定は偽の値で回し、
GUARD と idle-stop の字は**本物の字を sh で回す**（`desktop-input` だけ偽物に差し替える）。

| 足 | 確かめること |
| --- | --- |
| `own_hands_pass` | 見張りが生きていて本物の入力が20分前なら、xprintidle が 135ms（こちらの Chrome が戻した）でも20分と答える |
| `real_input_stops` | 本物の入力が10秒前なら10秒と答える |
| `boot_never_pass` | X が立ってから入力が無ければ「一度も無い」（7分よりずっと長い）と答える。起こした直後に待たない |
| `dead_falls_back` | 見張りが居ない・控えが無いなら xprintidle に戻る |
| `xchanged_falls_back` | X が立ち直していたら（pid か立った時刻が違う）xprintidle に戻る |
| `stale_falls_back` | 「生きている」の印が古ければ xprintidle に戻る |
| `no_xidle_closed` | 戻った先の xprintidle も取れなければ 0（触っている）と答える |
| `seed_boot_none` | 繋いだとき、X が立ってからの時間とほぼ同じだけ無操作なら「入力は無い」 |
| `seed_input_kept` | 繋ぐ前の入力（xprintidle に残っている）を捨てない |
| `seed_unknown_waits` | 繋いだときに xprintidle が取れなければ「いま入力があった」とみなす |
| `raw_only` | 数えるのは生の入力（Raw*）だけ。FocusIn / FocusOut / Motion / DeviceChanged は数えない |
| `watch_records` | 見張りの本体に偽の xinput をつないで回す。生の入力は**書く間隔（FLUSH_S）のうちに**控えに書かれ、窓の出入りだけでは書かれない |
| `alive_by_name` | 見張りが生きているかを pid の有る無しではなく名前で見る（pid の使い回しに化かされない） |
| `x_start_boot_clock` | X の立った時刻を起動からの秒で持つ。壁の時計は起こした直後に chrony が跳ばし、跳んだぶん「X が立ち直した」に見えた（2026-10-23） |
| `guard_busy_under_7min` | GUARD: 419,999ms なら desktop_busy で戻り、本体を1行も動かさない |
| `guard_pass_over_7min` | GUARD: 420,000ms なら本体へ進む（xprintidle を見ない） |
| `guard_tool_missing_closed` | GUARD: desktop-input が無ければ desktop_busy（入れ直す一手を出す） |
| `guard_garbage_closed` | GUARD: 数でない答えなら desktop_busy |
| `stop_counts_real_input` | idle-stop: 本物の入力が1分前なら「使っている」、30分前なら数えない（xprintidle を見ない） |
| `stop_falls_back` | idle-stop: desktop-input が無い・答えないなら、前の xprintidle の見かたに戻る |
| `stop_none_not_busy` | idle-stop: X に繋がらない（none-…）なら数えない（前の見かたと同じ） |

## 守りを1つずつ外す（§15「対照は、足の数だけ用意する」）

下の `CUTS` が、`desktop_input.py` / `post.py` / `idle_stop.sh` の**本物の字**を1か所だけ書き換えた写しを
作り、それで足を全部回す。**外した守りの足だけが落ちる**ことを確かめる。外す字が本物に見つからなければ
2 で落ちる（字を直したのに、ここを直し忘れた）。
"""

from __future__ import annotations

import importlib.util
import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile
import threading
import time
import traceback
import types
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent.parent
SKILL = ROOT / ".claude" / "skills" / "ec2-chrome"
BREAK = os.environ.get("BREAK", "")

# 本物の置き場（写しを作るときは全部を1つの置き場に並べる。post.py は隣の posted.py を読む）
REAL = {"desktop_input.py": SKILL, "idle_stop.sh": SKILL, "post.py": HERE, "posted.py": HERE}

# 外す守り: 名前 → (ファイル, 本物の字, 書き換えた字, 落ちるはずの足, 何を外すか)
CUTS: dict[str, tuple[str, str, str, set[str], str]] = {
    "trust_xidle": ("desktop_input.py",
                    '    return max(0, int((now - last) * 1000)), "xi2"\n',
                    '    return min(int(xidle_ms or 0), max(0, int((now - last) * 1000))), "xi2"\n',
                    {"own_hands_pass"}, "見張りが生きていても xprintidle を混ぜる（前の7分待ち）"),
    "never_as_now": ("desktop_input.py", '        return NEVER_MS, "xi2-never"\n', '        return 0, "xi2-never"\n',
                     {"boot_never_pass"}, "X が立ってから入力が無いのを「いま触った」とみなす"),
    "dead_trusted": ("desktop_input.py", "    elif not alive:\n", "    elif False:\n",
                     {"dead_falls_back"}, "見張りが居なくても控えを信じる"),
    "xid": ("desktop_input.py",
            '    elif x_now is None or state.get("x_pid") != x_now[0] or abs(state.get("x_start", 0) - x_now[1]) > 1:\n',
            "    elif False:\n",
            {"xchanged_falls_back"}, "X が立ち直しても前の控えを信じる"),
    "stale": ("desktop_input.py", '    elif now - state.get("beat", 0) > STALE_S:\n', "    elif False:\n",
              {"stale_falls_back"}, "古い印を信じる"),
    "open_on_unknown": ("desktop_input.py", '            return 0, f"none-{why}"\n', '            return NEVER_MS, f"none-{why}"\n',
                        {"no_xidle_closed"}, "何も分からないときに「触っていない」と答える"),
    "seed_tol": ("desktop_input.py", "    if xidle_ms / 1000 >= (now - x_start) - SEED_TOL_S:\n", "    if False:\n",
                 {"seed_boot_none"}, "起こした直後も xprintidle から時刻を出す（起動のあと7分待つ）"),
    "seed_drop": ("desktop_input.py", "    return now - xidle_ms / 1000\n", "    return None\n",
                  {"seed_input_kept", "watch_records"}, "繋ぐ前の入力を捨てる（本体を回す足も、最初の控えを見ている）"),
    "seed_unknown_open": ("desktop_input.py", "    if xidle_ms is None:\n        return now\n",
                          "    if xidle_ms is None:\n        return None\n",
                          {"seed_unknown_waits"}, "xprintidle が取れないときに「入力は無い」とみなす"),
    "raw_any": ("desktop_input.py", r'RAW = re.compile(r"^EVENT type \d+ \(Raw(?:', r'RAW = re.compile(r"^EVENT type \d+ |\(Raw(?:',
                {"raw_only", "watch_records"}, "生の入力でない出来事（窓の出入り）も数える"),
    "watch_late": ("desktop_input.py", "max(0.0, wrote + FLUSH_S - clock()) if dirty else BEAT_S", "BEAT_S",
                   {"watch_records"}, "書き残した入力を次の「生きている」まで書かない（2026-10-23 に EC2 で踏んだ）"),
    "watch_drop": ("desktop_input.py", '                st["last"] = round(now, 2)\n', "                pass\n",
                   {"watch_records"}, "生の入力を読んでも控えない"),
    "alive_any": ("desktop_input.py",
                  '        return re.search(rb"desktop[-_]input", open(f"/proc/{int(pid)}/cmdline", "rb").read()) is not None\n',
                  '        return os.path.exists(f"/proc/{int(pid)}")\n',
                  {"alive_by_name"}, "pid が在れば見張りが生きているとみなす"),
    "wall_clock": ("desktop_input.py",
                   '        return pid, round(int(rest[19]) / os.sysconf("SC_CLK_TCK"), 2)\n',
                   '        return pid, round(time.time() - clock() + int(rest[19]) / os.sysconf("SC_CLK_TCK"), 2)\n',
                   {"x_start_boot_clock"}, "X の立った時刻を壁の時計で出す（起こした直後に跳んで、立ち直したに見える）"),
    "guard_threshold": ("post.py", '[ "$ms" -lt 420000 ]', '[ "$ms" -lt 60000 ]',
                        {"guard_busy_under_7min"}, "GUARD の7分を1分に縮める"),
    "guard_old": ("post.py",
                  "set -- $({DESKTOP_INPUT} idle 2>/dev/null); ms=${{1:-0}}; src=${{2:-error}}\n",
                  "ms=$(DISPLAY=:20 XAUTHORITY=~ubuntu/.Xauthority sudo -u ubuntu xprintidle 2>/dev/null || echo 0); src=xprintidle\n",
                  {"guard_busy_under_7min", "guard_pass_over_7min", "guard_tool_missing_closed"},
                  "GUARD が前の xprintidle を見る（出どころの字と、入れ直す一手も消える）"),
    "guard_default_open": ("post.py", "ms=${{1:-0}}", "ms=${{1:-999999999}}",
                           {"guard_tool_missing_closed"}, "desktop-input が答えないと「触っていない」に倒す"),
    "guard_garbage": ("post.py", """case "$ms" in ''|*[!0-9]*) ms=0 ;; esac\n""", ":\n",
                      {"guard_garbage_closed"}, "数でない答えを通す"),
    "stop_old": ("idle_stop.sh", "  set -- $(${DESKTOP_INPUT:-/usr/local/sbin/desktop-input} idle 2>/dev/null)\n", "  set --\n",
                 {"stop_counts_real_input", "stop_none_not_busy"}, "idle-stop が desktop-input を聞かない（前の xprintidle）"),
    "stop_no_fallback": ("idle_stop.sh", "      if command -v xprintidle >/dev/null 2>&1; then\n", "      if false; then\n",
                         {"stop_falls_back"}, "desktop-input が無いときに前の見かたへ戻らない"),
    "stop_none_busy": ("idle_stop.sh", "none-*) ;;", "none-NEVER) ;;",
                       {"stop_none_not_busy"}, "X に繋がらないのを「使っている」に数える"),
}

NOW = 1_792_760_000.0
X = (1029, NOW - 3600)
MIN7 = 420_000


def healthy(last, beat_ago=10.0):
    return {"pid": 4242, "x_pid": X[0], "x_start": X[1], "attached": NOW - 3500, "seed_xidle_ms": 3_500_000,
            "last": last, "beat": NOW - beat_ago}


def _load(name: str, path: Path):
    sys.modules.pop(name, None)
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


class Bench:
    """足を回す台。`files` は名前 → 置き場"""

    def __init__(self, files: dict[str, Path], tmp: Path) -> None:
        self.tmp = tmp
        self.di = _load("desktop_input", files["desktop_input.py"] / "desktop_input.py")
        # post.py は ec2 を import する。触らないので空の入れ物を渡す
        sys.modules["ec2"] = types.ModuleType("ec2")
        sys.modules.pop("posted", None)
        self.post = _load("post", files["post.py"] / "post.py")
        self.stop = (files["idle_stop.sh"] / "idle_stop.sh").read_text(encoding="utf-8")
        self.n = 0
        # 偽の xprintidle / sudo。前の見かたに戻ったかを見分けるため、xprintidle は「こちらの Chrome が戻した直後」の 135
        self.bin = tmp / "bin"
        self.bin.mkdir()
        self.script(self.bin / "xprintidle", "#!/bin/sh\necho 135\n")
        self.script(self.bin / "sudo", '#!/bin/sh\n[ "$1" = -u ] && shift 2\nexec "$@"\n')

    @staticmethod
    def script(p: Path, text: str) -> Path:
        p.write_text(text, encoding="utf-8")
        p.chmod(p.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
        return p

    def fresh(self) -> Path:
        self.n += 1
        d = self.tmp / f"case{self.n}"
        d.mkdir()
        return d

    def tool(self, d: Path, reply: str | None) -> Path:
        """偽の desktop-input。reply が None なら置かない（無い）"""
        p = d / "desktop-input"
        if reply is not None:
            self.script(p, f"#!/bin/sh\necho '{reply}'\n")
        return p

    def sh(self, script: str, extra_env: dict | None = None) -> tuple[int, str]:
        env = dict(os.environ, PATH=f"{self.bin}{os.pathsep}{os.environ.get('PATH', '')}", **(extra_env or {}))
        r = subprocess.run(["sh", "-c", script], env=env, capture_output=True, text=True, timeout=30, check=False)
        return r.returncode, r.stdout + r.stderr

    def guard(self, reply: str | None) -> tuple[int, str]:
        """本物の GUARD の字に、本体の代わりの1行を足して sh で回す。desktop-input と家だけ差し替える"""
        d = self.fresh()
        (d / "locks").mkdir()
        g = self.post.GUARD.replace(self.post.DESKTOP_INPUT, str(self.tool(d, reply))).replace(self.post.EC2_HOME, str(d))
        return self.sh(g + "echo BODY_RAN\n")

    def stop_block(self, reply: str | None, idle_min: int = 30) -> str:
        """idle_stop.sh の「# >>> desktop」〜「# <<< desktop」だけを切り出して回し、why を返す"""
        lines = self.stop.splitlines(keepends=True)
        try:
            a = next(i for i, ln in enumerate(lines) if ln.startswith("# >>> desktop"))
            b = next(i for i, ln in enumerate(lines) if ln.startswith("# <<< desktop"))
        except StopIteration:
            print("✕ idle_stop.sh に「# >>> desktop」「# <<< desktop」が無い。切り出す字を直したら、ここも直す")
            sys.exit(2)
        d = self.fresh()
        script = f'why=""; IDLE_MIN={idle_min}\n' + "".join(lines[a:b + 1]) + 'echo "why=$why"\n'
        rc, out = self.sh(script, {"DESKTOP_INPUT": str(self.tool(d, reply))})
        got = [ln for ln in out.splitlines() if ln.startswith("why=")]
        return got[-1][4:] if got else f"(読めない: {out.strip()[-120:]})"


# ---- 足 ---------------------------------------------------------------

def leg_own_hands_pass(b: Bench):
    out = []
    for xi in (135, 0):
        ms, src = b.di.judge(NOW, healthy(NOW - 1200), True, X, xi)
        out.append((f"本物の入力は20分前・xprintidle {xi}ms → {ms}ms {src}（7分を超える・xi2）",
                    ms >= MIN7 and abs(ms - 1_200_000) < 1000 and src == "xi2"))
    return out


def leg_real_input_stops(b: Bench):
    ms, src = b.di.judge(NOW, healthy(NOW - 10), True, X, 10_000)
    return [(f"本物の入力は10秒前 → {ms}ms {src}（7分より短い）", ms < MIN7 and abs(ms - 10_000) < 1000 and src == "xi2")]


def leg_boot_never_pass(b: Bench):
    ms, src = b.di.judge(NOW, healthy(None), True, X, 60_000)
    return [(f"X が立ってから入力なし（xprintidle は起動からの 60秒）→ {ms}ms {src}", ms >= MIN7 and src == "xi2-never")]


def leg_dead_falls_back(b: Bench):
    r1 = b.di.judge(NOW, healthy(NOW - 1200), False, X, 135)
    r2 = b.di.judge(NOW, None, False, X, 135)
    return [(f"見張りの pid が居ない → {r1}（xprintidle に戻る）", r1 == (135, "xprintidle-dead")),
            (f"控えが無い → {r2}", r2 == (135, "xprintidle-nostate"))]


def leg_xchanged_falls_back(b: Bench):
    out = []
    for x_now, what in (((9999, X[1]), "pid が違う"), ((X[0], NOW - 60), "立った時刻が違う"), (None, "X が無い")):
        r = b.di.judge(NOW, healthy(NOW - 1200), True, x_now, 135)
        out.append((f"X が{what} → {r}", r == (135, "xprintidle-xchanged")))
    return out


def leg_stale_falls_back(b: Bench):
    r = b.di.judge(NOW, healthy(NOW - 1200, beat_ago=600), True, X, 135)
    return [(f"「生きている」が10分前 → {r}", r == (135, "xprintidle-stale"))]


def leg_no_xidle_closed(b: Bench):
    r = b.di.judge(NOW, None, False, X, None)
    return [(f"控えも xprintidle も無い → {r}（0 = 触っている）", r[0] < MIN7 and r[1].startswith("none-"))]


def leg_seed_boot_none(b: Bench):
    return [(f"X が立って60秒・xprintidle {xi}ms → {b.di.seed(NOW, NOW - 60, xi)}（None）", b.di.seed(NOW, NOW - 60, xi) is None)
            for xi in (59_000, 56_000)]


def leg_seed_input_kept(b: Bench):
    s1 = b.di.seed(NOW, NOW - 600, 30_000)
    s2 = b.di.seed(NOW, NOW - 60, 40_000)
    return [(f"30秒前の入力 → いまから {None if s1 is None else round(NOW - s1, 1)}秒前", s1 is not None and abs(NOW - 30 - s1) < 0.01),
            (f"X が立って20秒後の入力 → いまから {None if s2 is None else round(NOW - s2, 1)}秒前", s2 is not None and abs(NOW - 40 - s2) < 0.01)]


def leg_seed_unknown_waits(b: Bench):
    s = b.di.seed(NOW, NOW - 600, None)
    return [(f"xprintidle が取れない → {s}（いま）", s == NOW)]


# 2026-10-23 に EC2 の `xinput test-xi2 --root` が実際に出した行
XI_YES = ["EVENT type 17 (RawMotion)", "EVENT type 13 (RawKeyPress)", "EVENT type 14 (RawKeyRelease)",
          "EVENT type 15 (RawButtonPress)", "EVENT type 16 (RawButtonRelease)", "EVENT type 22 (RawTouchBegin)"]
XI_NO = ["EVENT type 6 (Motion)", "EVENT type 9 (FocusIn)", "EVENT type 10 (FocusOut)", "EVENT type 1 (DeviceChanged)",
         "EVENT type 12 (PropertyEvent)", "EVENT type 7 (Enter)", "    device: 2 (12)", "    detail: 0", ""]


def leg_raw_only(b: Bench):
    bad_yes = [ln for ln in XI_YES if not b.di.is_input(ln)]
    bad_no = [ln for ln in XI_NO if b.di.is_input(ln)]
    return [(f"生の入力を数える（数えなかった: {bad_yes}）", not bad_yes),
            (f"生でない出来事は数えない（数えた: {bad_no}）", not bad_no)]


def run_watch(b: Bench, lines_py: str):
    """見張りの本体（watch）に偽の xinput をつないで回す。控えを書いた時刻と中身の並び・最後の控えを返す。
    書く間隔（FLUSH_S）は 0.2秒に縮める。縮めても「書き残した入力を、その間隔のうちに書くか」は同じに見える"""
    d = b.fresh()
    di = b.di
    saved = (di.STATE, di.XINPUT, di.ATTACH_S, di.FLUSH_S, di.x_server, di.xidle, di.write_state)
    di.STATE = str(d / "state.json")
    di.XINPUT = [sys.executable, "-c", lines_py]
    di.ATTACH_S = 0.05
    di.FLUSH_S = 0.2
    t0 = di.clock()
    di.x_server = lambda: (4242, t0 - 3600)
    di.xidle = lambda: 5000          # 繋ぐ5秒前に入力があった（控えの最初は「5秒前」）
    hist: list[tuple[float, dict]] = []
    write = di.write_state

    def recorded(st):
        hist.append((di.clock(), dict(st)))
        write(st)

    di.write_state = recorded
    err: list[str] = []

    def go():
        try:
            di.watch()
        except SystemExit:
            pass
        except Exception:
            err.append(traceback.format_exc())

    th = threading.Thread(target=go, daemon=True)
    try:
        th.start()
        th.join(15)
        end = json.loads(Path(di.STATE).read_text()) if Path(di.STATE).exists() else None
    finally:
        di.STATE, di.XINPUT, di.ATTACH_S, di.FLUSH_S, di.x_server, di.xidle, di.write_state = saved
    return t0, hist, end, err


def leg_watch_records(b: Bench):
    # 入力が続けて来て、2つ目が「書いた直後」に来る形（2026-10-23 の EC2 は、DeviceChanged で書いた直後の
    # RawMotion を30秒書かずにいた）。そのあと 0.8秒は何も来ない（「生きている」は30秒ごと）
    t0, hist, end, err = run_watch(b, (
        "import time\n"
        "time.sleep(0.3); print('EVENT type 1 (DeviceChanged)', flush=True); print('EVENT type 17 (RawMotion)', flush=True)\n"
        "time.sleep(0.05); print('EVENT type 17 (RawMotion)', flush=True); print('    device: 2 (12)', flush=True)\n"
        "time.sleep(0.8)\n"))
    final = (end or {}).get("last")
    first = next((at for at, st in hist if final is not None and st.get("last") == final), None)
    lag = None if first is None else round(first - final, 2)
    out = [(f"見張りが落ちない（{err[0].strip().splitlines()[-1] if err else 'ok'}）", not err),
           (f"最後の RawMotion の時刻が控えに入る（始めから {None if final is None else round(final - t0, 2)}秒）",
            final is not None and 0.2 < final - t0 < 1.6),
           (f"それを読んでから {lag}秒で書く（書く間隔 0.2秒のうち。次の入力も「生きている」も来ないまま）",
            lag is not None and lag <= 0.5)]
    # 窓の出入りだけ（Chrome のタブを開けて閉じた形）
    t1, hist2, end2, err2 = run_watch(b, (
        "import time\n"
        "for s in ('EVENT type 9 (FocusIn)', 'EVENT type 10 (FocusOut)', 'EVENT type 6 (Motion)'):\n"
        "    time.sleep(0.1); print(s, flush=True)\n"
        "time.sleep(0.3)\n"))
    last2 = (end2 or {}).get("last")
    out.append((f"窓の出入りだけなら控えは最初のまま（繋ぐ5秒前。last は始めから {None if last2 is None else round(last2 - t1, 2)}秒）",
                not err2 and last2 is not None and -6 < last2 - t1 < -4))
    return out


def leg_alive_by_name(b: Bench):
    child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(20)", "desktop-input", "watch"])
    try:
        time.sleep(0.2)
        yes = b.di.alive(child.pid)
    finally:
        child.kill()
        child.wait()
    other = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(20)"])
    try:
        time.sleep(0.2)
        no = b.di.alive(other.pid)
    finally:
        other.kill()
        other.wait()
    return [(f"desktop-input の名で動いている pid → {yes}", yes is True),
            (f"別のもの（pid の使い回し）→ {no}", no is False),
            (f"居ない pid → {b.di.alive(child.pid)}", b.di.alive(child.pid) is False)]


def leg_x_start_boot_clock(b: Bench):
    d = b.fresh()
    lock = d / "X20-lock"
    lock.write_text(f"{os.getpid():>10}\n")     # X は pid を右寄せで書く
    saved = b.di.LOCK
    b.di.LOCK = str(lock)
    try:
        x1 = b.di.x_server()
    finally:
        b.di.LOCK = saved
    now = b.di.clock()
    return [(f"X の立った時刻 {x1} は起動からの秒（いま {round(now, 2)}）", x1 is not None and x1[0] == os.getpid() and 0 <= x1[1] <= now)]


def busy(out: str) -> bool:
    return '"error": "desktop_busy"' in out


def leg_guard_busy_under_7min(b: Bench):
    rc, out = b.guard("419999 xi2")
    return [("419,999ms: desktop_busy で戻る", busy(out)), ("本体を1行も動かさない", "BODY_RAN" not in out),
            ("待つ理由に数と出どころを出す", "419999ms, xi2" in out)]


def leg_guard_pass_over_7min(b: Bench):
    rc, out = b.guard("420000 xi2")
    return [(f"420,000ms: 本体へ進む（xprintidle は 135ms を返す偽物）→ {out.strip()[-80:]!r}", "BODY_RAN" in out and not busy(out))]


def leg_guard_tool_missing_closed(b: Bench):
    rc, out = b.guard(None)
    return [("desktop-input が無い: desktop_busy", busy(out) and "BODY_RAN" not in out),
            ("入れ直す一手（ec2.py guard）を出す", "ec2.py guard" in out)]


def leg_guard_garbage_closed(b: Bench):
    rc, out = b.guard("abc xi2")
    return [(f"数でない答え: desktop_busy（{out.strip()[-60:]!r}）", busy(out) and "BODY_RAN" not in out)]


def leg_stop_counts_real_input(b: Bench):
    w1 = b.stop_block("60000 xi2")
    w2 = b.stop_block("1800000 xi2")
    return [(f"本物の入力が1分前 → why={w1!r}（使っている）", w1 == "desktop:xi2"),
            (f"本物の入力が30分前（xprintidle は 135ms）→ why={w2!r}（数えない）", w2 == "")]


def leg_stop_falls_back(b: Bench):
    w1 = b.stop_block(None)
    w2 = b.stop_block("")
    return [(f"desktop-input が無い → why={w1!r}（前の xprintidle の見かた）", w1.startswith("desktop:") and "xi2" not in w1),
            (f"desktop-input が答えない → why={w2!r}", w2.startswith("desktop:") and "xi2" not in w2)]


def leg_stop_none_not_busy(b: Bench):
    w = b.stop_block("0 none-nostate")
    return [(f"X に繋がらない（0 none-nostate）→ why={w!r}（数えない）", w == "")]


LEGS = {
    "own_hands_pass": leg_own_hands_pass,
    "real_input_stops": leg_real_input_stops,
    "boot_never_pass": leg_boot_never_pass,
    "dead_falls_back": leg_dead_falls_back,
    "xchanged_falls_back": leg_xchanged_falls_back,
    "stale_falls_back": leg_stale_falls_back,
    "no_xidle_closed": leg_no_xidle_closed,
    "seed_boot_none": leg_seed_boot_none,
    "seed_input_kept": leg_seed_input_kept,
    "seed_unknown_waits": leg_seed_unknown_waits,
    "raw_only": leg_raw_only,
    "watch_records": leg_watch_records,
    "alive_by_name": leg_alive_by_name,
    "x_start_boot_clock": leg_x_start_boot_clock,
    "guard_busy_under_7min": leg_guard_busy_under_7min,
    "guard_pass_over_7min": leg_guard_pass_over_7min,
    "guard_tool_missing_closed": leg_guard_tool_missing_closed,
    "guard_garbage_closed": leg_guard_garbage_closed,
    "stop_counts_real_input": leg_stop_counts_real_input,
    "stop_falls_back": leg_stop_falls_back,
    "stop_none_not_busy": leg_stop_none_not_busy,
}


def run_legs(files: dict[str, Path], tmp: Path, quiet: bool) -> tuple[list[str], int]:
    b = Bench(files, tmp)
    failed: list[str] = []
    checked = 0
    for name, fn in LEGS.items():
        try:
            res = fn(b)
        except Exception:
            res = [(f"足が落ちた: {traceback.format_exc().strip().splitlines()[-1]}", False)]
        checked += len(res)
        if any(not ok for _, ok in res):
            failed.append(name)
        if not quiet:
            print(f"[{name}]")
            for what, ok in res:
                print(f"  {'○' if ok else '✕'} {what}")
    return failed, checked


def cut_copy(name: str, dst: Path) -> dict[str, Path]:
    """本物を1つの置き場に写して、守りを1つだけ外す。外す字が無ければ 2 で落ちる"""
    for f, d in REAL.items():
        shutil.copy(d / f, dst / f)
    fname, old, new, _, _ = CUTS[name]
    text = (dst / fname).read_text(encoding="utf-8")
    if text.count(old) != 1:
        print(f"✕ BREAK={name}: 外す字が {fname} に {text.count(old)} か所（1か所のはず）。字を直したら CUTS も直す")
        sys.exit(2)
    (dst / fname).write_text(text.replace(old, new), encoding="utf-8")
    return {f: dst for f in REAL}


def child(name: str) -> int:
    """守りを1つ外した写しで足を全部回し、落ちた足の名前を1行で返す（親が読む）"""
    if name not in CUTS:
        print(f"✕ BREAK={name} という守りは無い（{' / '.join(CUTS)}）")
        return 2
    with tempfile.TemporaryDirectory() as td:
        src, tmp = Path(td) / "src", Path(td) / "work"
        src.mkdir()
        tmp.mkdir()
        files = cut_copy(name, src)
        failed, checked = run_legs(files, tmp, quiet=False)
    print("LEGS_FAILED " + json.dumps(sorted(failed)))
    if checked == 0:
        return 2
    return 1 if failed else 0


def drill() -> list[str]:
    """守りを1つずつ外して、**その守りの足だけ**が落ちるかを見る"""
    print("[対照] 守りを1つずつ外すと、その足だけが落ちるか")
    from concurrent.futures import ThreadPoolExecutor

    def one(name):
        return subprocess.run([sys.executable, str(Path(__file__).resolve())], capture_output=True,
                              text=True, env=dict(os.environ, BREAK=name), timeout=120, check=False)

    # 1本ずつ回すと2分かかった（子が21本）。4本ずつ並べる。足の時間の見張りは、見張り自身の時計で測るので混んでも狂わない
    with ThreadPoolExecutor(4) as ex:
        runs = dict(zip(CUTS, ex.map(one, CUTS)))
    bad = []
    for name, (fname, _, _, want, why) in CUTS.items():
        r = runs[name]
        line = [ln for ln in r.stdout.splitlines() if ln.startswith("LEGS_FAILED ")]
        got = set(json.loads(line[-1][len("LEGS_FAILED "):])) if line else None
        hit = got == want and r.returncode == 1
        print(f"  {'○' if hit else '✕'} BREAK={name}（{fname}: {why}）→ 落ちた足 "
              f"{sorted(got) if got is not None else '（読めない: ' + (r.stdout + r.stderr).strip()[-200:] + '）'}"
              f"（欲しいのは {sorted(want)}）")
        if not hit:
            bad.append(name)
    return bad


def main() -> int:
    if BREAK:
        return child(BREAK)
    with tempfile.TemporaryDirectory() as td:
        failed, checked = run_legs(REAL, Path(td), quiet=False)
    print()
    bad = drill()
    print()
    if checked == 0:
        print("✕ 1つも数えなかった。**「通りました」とは言わない**")
        return 2
    if failed or bad:
        if failed:
            print(f"✕ 落ちた足: {' / '.join(failed)}")
        if bad:
            print(f"✕ 対照が外れた: {' / '.join(bad)}（外しても、その足だけが落ちる形になっていない）")
        return 1
    print(f"○ {len(LEGS)}本の足（{checked}件）が通り、守り {len(CUTS)}個を1つずつ外すと、その足だけが落ちた")
    return 0


if __name__ == "__main__":
    sys.exit(main())
