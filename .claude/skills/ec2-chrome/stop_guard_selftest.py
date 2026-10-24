"""**`ec2.py stop` の守り（使っている最中なら止めない）の見張り。本物の EC2 には1度も触らない。**

    python3 .claude/skills/ec2-chrome/stop_guard_selftest.py
    BREAK=no_ssm python3 .claude/skills/ec2-chrome/stop_guard_selftest.py   # 守りを1つ外した版で回す（対照の子）

終了コード 0=通った / 1=落ちた / **2=数えるものが無い・外す字が見つからない**
（`docs/island-standards.md` §15）。要るのは Python と sh だけ。

## なぜ要るか

2026-10-23 23:45 UTC、ショートの投稿の担当が EC2 で YouTube を読み直している最中に、EC2 が
`Client.UserInitiatedShutdown` で止まった（見張り idle-stop の記録には無い）。`ec2.py stop` が
何も見ずに stop-instances を打っていたので、2人が同時に EC2 を使うと、片方の「済んだので止める」が
もう片方の作業ごと止める。いまの stop は止める前に EC2 の中を見る（`ec2.py` の頭「止める前に見るもの」）。

この守りは「止めない」と「止める」の両方が壊れうる。止めすぎると、自分で起こした EC2 を誰も止められず
idle-stop の30分待ちになる。通しすぎると、また人の作業ごと止める。だから両方を足にする。

## 偽の EC2

`ec2.py` を読み込み、`aws` と `run` だけを差し替える。

- `aws`: describe-instances には偽の状態を返し、stop-instances が来たら stopped にする。来た順に控える
- `run`: 送られた sh（`busy_script()` の**本物の字**）を手元の sh で回す。EC2 の家と desktop-input の置き場だけ
  一時置き場に差し替え、`pgrep` は偽物（この確かめを流している worker として先祖の pid を、居ればほかの worker も答える）

| 足 | 確かめること |
| --- | --- |
| `idle_stops` | 誰も使っていない（自分の worker だけ・7時間前の鍵・本物の入力は30分前）→ 止める |
| `ssm_busy` | ほかの SSM コマンドが走っている → 止めない |
| `lock_file_busy` | 鍵のファイルが1分前に触られている → 止めない |
| `lock_dir_busy` | 鍵のディレクトリ（mkdir で取る鍵）が1分前に触られている → 止めない |
| `lock_window` | 14分前の鍵は数え、16分前の鍵は数えない |
| `lock_same_as_idle_stop` | idle_stop.sh の LOCKS のほかの置き場（`chatgpt/LOCK`・`stamp/RUNNING`）も数える |
| `desktop_7min` | 本物の入力が 419,999ms 前なら数え、420,000ms 前なら数えない |
| `desktop_silent_busy` | desktop-input が無い・空・数でない・`0 none-…` → 触っている側に倒す |
| `no_reply_refuses` | 確かめの答えが返らない（InProgress・CHECKED が無い・送れない）→ 止めない |
| `force_stops` | `--force` なら、使っている最中でも中を見ずに止める |
| `already_stopped` | stopped / stopping なら何もしない（stop-instances も確かめも送らない）で 0 |
| `pending_refuses` | pending（誰かが起こしている途中）→ 止めない |
| `idle_stop_counts_dirs` | idle_stop.sh の鍵の段も、ディレクトリの鍵を数える（`# >>> locks` 〜 `# <<< locks` を切り出して回す） |

## 守りを1つずつ外す（§15「対照は、足の数だけ用意する」）

下の `CUTS` が、`ec2.py` / `idle_stop.sh` の**本物の字**を1か所だけ書き換えた写しを作り、それで足を全部回す。
**外した守りの足だけが落ちる**ことを確かめる。外す字が本物に見つからなければ 2 で落ちる。

## どこから走るか

回し役（`python/selftest_runner.py`）の `MJS_ROOTS` に `.claude/skills/ec2-chrome` を足して、Selftests から回す
（2026-10-24。足すまでは `.claude/` の下がどこからも走っていなかった）。棚卸し（`python/watch_census_selftest.py`）は
`.` で始まる置き場を見ないので、ここが外れても棚卸しは赤くならない。`MJS_ROOTS` の行を消さないこと。
"""

from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import traceback
from pathlib import Path

HERE = Path(__file__).resolve().parent
BREAK = os.environ.get("BREAK", "")
REAL = {"ec2.py": HERE, "idle_stop.sh": HERE}
# pid_max（この箱は 32768、64bit の上限でも 4194304）より大きいので、先祖に紛れることが無い
OTHER_PID = "4194999"

# 外す守り: 名前 → (ファイル, 本物の字, 書き換えた字, 落ちるはずの足, 何を外すか)
CUTS: dict[str, tuple[str, str, str, set[str], str]] = {
    "no_ssm": ("ec2.py", '*) echo "BUSY ssm:', '*) : "BUSY ssm:',
               {"ssm_busy"}, "ほかの SSM コマンドを数えない"),
    "ssm_self": ("ec2.py", 'case "$mine" in *" $w "*) ;;', 'case "$mine" in NEVER) ;;',
                 {"idle_stops"}, "この確かめを流している自分の worker も「ほかの SSM」に数える（いつも止めない）"),
    "lock_none": ("ec2.py", '  if [ "$age" -lt {LOCK_FRESH_S} ]; then echo "BUSY lock:',
                  '  if false; then echo "BUSY lock:',
                  {"lock_file_busy", "lock_dir_busy", "lock_window", "lock_same_as_idle_stop"}, "鍵を数えない"),
    "lock_files_only": ("ec2.py", '  [ -e "$f" ] || continue\n  age=', '  [ -f "$f" ] || continue\n  age=',
                        {"lock_dir_busy"}, "ディレクトリの鍵を数えない（前の idle_stop.sh と同じ見かた）"),
    "lock_window_short": ("ec2.py", "LOCK_FRESH_S = 15 * 60", "LOCK_FRESH_S = 10 * 60",
                          {"lock_window"}, "鍵の新しさを10分に縮める"),
    "lock_window_long": ("ec2.py", "LOCK_FRESH_S = 15 * 60", "LOCK_FRESH_S = 20 * 60",
                         {"lock_window"}, "鍵の新しさを20分に延ばす"),
    "lock_list_own": ("ec2.py", "for f in {idle_stop_locks()}; do", "for f in {EC2_HOME}/locks/*; do",
                      {"lock_same_as_idle_stop"}, "鍵の置き場を idle_stop.sh から読まず、locks/ だけを書き写す"),
    "desktop_threshold": ("ec2.py", "DESKTOP_BUSY_MS = 420000", "DESKTOP_BUSY_MS = 60000",
                          {"desktop_7min"}, "遠隔デスクトップの7分を1分に縮める"),
    "desktop_open_on_silence": ("ec2.py", """  ''|*[!0-9]*) echo "BUSY desktop:""", """  ''|*[!0-9]*) : "BUSY desktop:""",
                                {"desktop_silent_busy"}, "desktop-input が答えないと「触っていない」に倒す"),
    # 答えが返らないときは、2つの守りがどちらも止めない（CHECKED が無い・止める印が立っていない）。両方を外す
    "trust_no_reply": ("ec2.py", '    if st != "Success" or "CHECKED" not in lines:\n'
                       '        why.append(f"確かめの答えが返らない（ssm status: {st}）。ほかのコマンドが居座っていると、それが終わるまで始まらない")\n'
                       '    elif not why and not token and "NOQUEUE" not in lines:\n',
                       "    if False:\n        pass\n    elif False:\n",
                       {"no_reply_refuses"}, "確かめの答えが返らなくても止める"),
    "force_ignored": ("ec2.py", "    if not force:\n", "    if True:\n",
                      {"force_stops"}, "--force でも中を見る"),
    "stop_when_stopped": ("ec2.py", '    if st in ("stopped", "stopping"):\n', "    if False:\n",
                          {"already_stopped"}, "止まっている EC2 にも確かめを送る"),
    "pending_open": ("ec2.py", 'busy_reasons() if st == "running" else', "busy_reasons() if True else",
                     {"pending_refuses"}, "起こしている途中の EC2 も、中が静かなら止める"),
    "idle_stop_files_only": ("idle_stop.sh", '    [ -e "$f" ] || continue\n', '    [ -f "$f" ] || continue\n',
                             {"idle_stop_counts_dirs"}, "idle-stop がディレクトリの鍵を数えない（前の見かた）"),
}


def _load(name: str, path: Path):
    sys.modules.pop(name, None)
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


def _script(p: Path, text: str) -> Path:
    p.write_text(text, encoding="utf-8")
    p.chmod(p.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    return p


class FakeEC2:
    """1件ぶんの偽の EC2。家（locks など）・desktop-input・ほかの worker の有る無しを持つ"""

    def __init__(self, bench: "Bench", state="running", desktop: str | None = "1800000 xi2", other=False, reply=None):
        self.b = bench
        self.state = state
        self.dir = bench.fresh()
        self.home = self.dir / "home"
        (self.home / "locks").mkdir(parents=True)
        self.tool = self.dir / "desktop-input"
        if desktop is not None:
            _script(self.tool, f"#!/bin/sh\necho '{desktop}'\n")
        self.other = other
        self.reply = reply          # None なら sh を回す。(st, out) か例外なら、それをそのまま返す（答えが返らない形）
        self.calls: list[tuple] = []
        self.sent: list[str] = []
        self.err = ""

    def lock(self, rel: str, age_s: float, is_dir=False):
        p = self.home / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        if is_dir:
            p.mkdir()
            (p / "owner").write_text("someone\n")
        else:
            p.write_text("")
        t = time.time() - age_s
        os.utime(p, (t, t))     # 中に書いたあとで時刻を戻す（ディレクトリの時刻は中身を作ると動く）
        return self

    def aws(self, *args, check=True):
        self.calls.append(args)
        if args[:2] == ("ec2", "describe-instances"):
            return self.state
        if args[:2] == ("ec2", "stop-instances"):
            self.state = "stopped"
            return ""
        if args[:2] == ("ec2", "wait"):
            return ""
        raise AssertionError(f"偽の aws が知らない呼びかた: {args[:3]}")

    def run(self, script: str, timeout: int = 600, quiet=False, raw=False):
        self.sent.append(script)
        if isinstance(self.reply, BaseException):
            raise self.reply
        if self.reply is not None:
            return self.reply
        m = self.b.mod
        for s in (m.EC2_HOME, m.DESKTOP_INPUT, m.QUEUE):
            if s not in script:
                raise AssertionError(f"確かめの sh に {s} が無い（差し替える字が変わった。偽物を直す）")
        # 札（ec2-queue）の段は偽物に答えさせる（列は空・印を立てた）。札の守りは ec2_queue_selftest.py が見る
        s = (script.replace(m.QUEUE, str(self.b.bin / "ec2-queue")).replace(m.DESKTOP_INPUT, str(self.tool))
             .replace(m.EC2_HOME, str(self.home)))
        env = dict(os.environ, PATH=f"{self.b.bin}{os.pathsep}{os.environ.get('PATH', '')}")
        env.pop("FAKE_OTHER", None)
        if self.other:
            env["FAKE_OTHER"] = OTHER_PID
        # 外側の sh が「この確かめを流している ssm-document-worker」の代わり（中の sh の先祖になる）
        wrapper = 'FAKE_SELF=$$; export FAKE_SELF; sh -c "$1"; rc=$?; exit $rc'
        r = subprocess.run(["sh", "-c", wrapper, "ssm-worker", s], env=env, capture_output=True, text=True,
                           timeout=30, check=False)
        self.err = r.stderr
        return ("Success" if r.returncode == 0 else "Failed"), r.stdout

    @property
    def stopped_by_us(self) -> bool:
        return any(c[:2] == ("ec2", "stop-instances") for c in self.calls)


class Bench:
    def __init__(self, files: dict[str, Path], tmp: Path) -> None:
        self.tmp = tmp
        self.files = files
        self.mod = _load("ec2_stop_under_test", files["ec2.py"] / "ec2.py")
        self.idle_stop = (files["idle_stop.sh"] / "idle_stop.sh").read_text(encoding="utf-8")
        self.n = 0
        self.bin = tmp / "bin"
        self.bin.mkdir()
        # 偽の pgrep。`-f ssm-document-worker` にだけ答える（字が変わったら答えず、ssm の足が落ちて気づく）
        _script(self.bin / "pgrep", '#!/bin/sh\n[ "$1" = -f ] && [ "$2" = ssm-document-worker ] || exit 1\n'
                                    '[ -n "${FAKE_SELF:-}" ] && echo "$FAKE_SELF"\n'
                                    '[ -n "${FAKE_OTHER:-}" ] && echo "$FAKE_OTHER"\nexit 0\n')
        _script(self.bin / "ec2-queue", '#!/bin/sh\n[ "$1" = stop-mark ] && { echo "MARKED 0123456789ab"; exit 0; }\nexit 1\n')

    def fresh(self) -> Path:
        self.n += 1
        d = self.tmp / f"case{self.n}"
        d.mkdir()
        return d

    def stop(self, fake: FakeEC2, force=False) -> tuple[int, str]:
        self.mod.aws = fake.aws
        self.mod.run = fake.run
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            try:
                rc = self.mod.stop(force)
            except SystemExit as e:
                rc = f"SystemExit({e})"
        return rc, buf.getvalue()


def reasons(out: str, kind: str) -> list[str]:
    return [ln.strip()[2:] for ln in out.splitlines() if ln.strip().startswith(f"- {kind}:")]


def refused(b: Bench, fake: FakeEC2, out_rc: tuple, kind: str, what: str):
    rc, out = out_rc
    got = reasons(out, kind)
    return [(f"{what}: 終了コード {rc}（1 のはず）", rc == 1),
            (f"{what}: stop-instances を送らない", not fake.stopped_by_us),
            (f"{what}: 理由に {kind} が出る（{got[:1] or out.strip()[-120:]!r}）", bool(got))]


# ---- 足 ---------------------------------------------------------------

def leg_idle_stops(b: Bench):
    f = FakeEC2(b).lock("locks/old-batch", 7 * 3600)
    rc, out = b.stop(f)
    return [(f"終了コード {rc}（0 のはず）" + ('' if rc == 0 else f"：{out.strip()[-200:]!r}"), rc == 0),
            ("stop-instances を1回送る", sum(c[:2] == ("ec2", "stop-instances") for c in f.calls) == 1),
            ("確かめの sh を1回送る（自分の worker は数えない）", len(f.sent) == 1),
            (f"最後に stopped と出す（{out.strip().splitlines()[-1:] }）", out.strip().endswith("stopped"))]


def leg_ssm_busy(b: Bench):
    f = FakeEC2(b, other=True)
    return refused(b, f, b.stop(f), "ssm", "ほかの worker が居る")


def leg_lock_file_busy(b: Bench):
    f = FakeEC2(b).lock("locks/fish-voice", 60)
    res = refused(b, f, b.stop(f), "lock", "鍵のファイルが1分前")
    return res


def leg_lock_dir_busy(b: Bench):
    f = FakeEC2(b).lock("locks/fish-busy", 60, is_dir=True)
    return refused(b, f, b.stop(f), "lock", "鍵のディレクトリが1分前")


def leg_lock_window(b: Bench):
    f1 = FakeEC2(b).lock("locks/shorts-post", 14 * 60)
    _, o1 = b.stop(f1)
    f2 = FakeEC2(b).lock("locks/shorts-post", 16 * 60)
    _, o2 = b.stop(f2)
    return [(f"14分前の鍵は数える（{reasons(o1, 'lock')[:1]}）", bool(reasons(o1, "lock"))),
            (f"16分前の鍵は数えない（{reasons(o2, 'lock')[:1]}）", not reasons(o2, "lock"))]


def leg_lock_same_as_idle_stop(b: Bench):
    out = []
    for rel in ("chatgpt/LOCK", "stamp/RUNNING"):
        f = FakeEC2(b).lock(rel, 60)
        out += refused(b, f, b.stop(f), "lock", f"{rel} が1分前")
    return out


def leg_desktop_7min(b: Bench):
    _, o1 = b.stop(FakeEC2(b, desktop="419999 xi2"))
    _, o2 = b.stop(FakeEC2(b, desktop="420000 xi2"))
    return [(f"419,999ms 前は触っている（{reasons(o1, 'desktop')[:1]}）", bool(reasons(o1, "desktop"))),
            (f"420,000ms 前は数えない（{reasons(o2, 'desktop')[:1]}）", not reasons(o2, "desktop"))]


def leg_desktop_silent_busy(b: Bench):
    out = []
    for reply, what in ((None, "desktop-input が無い"), ("", "空の答え"), ("abc xi2", "数でない答え"),
                        ("0 none-nostate", "X に繋がらない（0 none-nostate）")):
        f = FakeEC2(b, desktop=reply)
        out += refused(b, f, b.stop(f), "desktop", what)
    f = FakeEC2(b, desktop=None)
    _, o = b.stop(f)
    out.append(("答えないときは入れ直す一手（ec2.py guard）を出す", any("ec2.py guard" in r for r in reasons(o, "desktop"))))
    return out


def leg_no_reply_refuses(b: Bench):
    out = []
    for reply, what in ((("InProgress", ""), "InProgress のまま切れた"),
                        (("Success", "BUSY-less\n"), "CHECKED が無い"),
                        (SystemExit("aws failed: ssm send-command: InvalidInstanceId"), "send-command が落ちた")):
        f = FakeEC2(b, reply=reply)
        rc, o = b.stop(f)
        out += [(f"{what}: 終了コード {rc}（1 のはず）", rc == 1),
                (f"{what}: stop-instances を送らない", not f.stopped_by_us),
                (f"{what}: 理由を出す（{o.strip().splitlines()[1:2]}）", "止めない" in o)]
    return out


def leg_force_stops(b: Bench):
    f = FakeEC2(b, desktop="0 xi2", other=True).lock("locks/fish-voice", 10)
    rc, out = b.stop(f, force=True)
    return [(f"--force: 終了コード {rc}（0 のはず）", rc == 0),
            ("--force: stop-instances を送る", f.stopped_by_us),
            ("--force: 確かめを送らない", not f.sent)]


def leg_already_stopped(b: Bench):
    out = []
    for st in ("stopped", "stopping"):
        f = FakeEC2(b, state=st, other=True)
        rc, o = b.stop(f)
        out += [(f"{st}: 終了コード {rc}（0 のはず）", rc == 0),
                (f"{st}: stop-instances を送らない", not f.stopped_by_us),
                (f"{st}: 確かめも送らない", not f.sent)]
    return out


def leg_pending_refuses(b: Bench):
    f = FakeEC2(b, state="pending")
    rc, o = b.stop(f)
    return [(f"pending: 終了コード {rc}（1 のはず）", rc == 1),
            ("pending: stop-instances を送らない", not f.stopped_by_us)]


def idle_stop_block(b: Bench, fake: FakeEC2) -> str:
    """idle_stop.sh の「# >>> locks」〜「# <<< locks」だけを切り出して回し、why を返す"""
    lines = b.idle_stop.splitlines(keepends=True)
    try:
        a = next(i for i, ln in enumerate(lines) if ln.startswith("# >>> locks"))
        z = next(i for i, ln in enumerate(lines) if ln.startswith("# <<< locks"))
        locks = next(ln for ln in lines if ln.startswith("LOCKS="))
    except StopIteration:
        print("✕ idle_stop.sh に「# >>> locks」「# <<< locks」か LOCKS= が無い。字を直したら、ここも直す")
        sys.exit(2)
    script = ('why=""; now=$(date +%s); STALE_H=6\n' + locks + "".join(lines[a:z + 1]) + 'echo "why=$why"\n')
    script = script.replace(b.mod.EC2_HOME, str(fake.home))
    r = subprocess.run(["sh", "-c", script], capture_output=True, text=True, timeout=30, check=False)
    got = [ln for ln in r.stdout.splitlines() if ln.startswith("why=")]
    return got[-1][4:] if got else f"(読めない: {(r.stdout + r.stderr).strip()[-120:]})"


def leg_idle_stop_counts_dirs(b: Bench):
    w1 = idle_stop_block(b, FakeEC2(b).lock("locks/fish-busy", 60, is_dir=True))
    w2 = idle_stop_block(b, FakeEC2(b).lock("locks/fish-voice", 60))
    w3 = idle_stop_block(b, FakeEC2(b).lock("locks/fish-busy", 7 * 3600, is_dir=True))
    return [(f"鍵のディレクトリが1分前 → why={w1[-40:]!r}（使っている）", w1.startswith("lock:") and w1.endswith("fish-busy")),
            (f"鍵のファイルが1分前 → why={w2[-40:]!r}", w2.startswith("lock:") and w2.endswith("fish-voice")),
            (f"7時間前のディレクトリ → why={w3!r}（数えない）", w3 == "")]


LEGS = {
    "idle_stops": leg_idle_stops,
    "ssm_busy": leg_ssm_busy,
    "lock_file_busy": leg_lock_file_busy,
    "lock_dir_busy": leg_lock_dir_busy,
    "lock_window": leg_lock_window,
    "lock_same_as_idle_stop": leg_lock_same_as_idle_stop,
    "desktop_7min": leg_desktop_7min,
    "desktop_silent_busy": leg_desktop_silent_busy,
    "no_reply_refuses": leg_no_reply_refuses,
    "force_stops": leg_force_stops,
    "already_stopped": leg_already_stopped,
    "pending_refuses": leg_pending_refuses,
    "idle_stop_counts_dirs": leg_idle_stop_counts_dirs,
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
