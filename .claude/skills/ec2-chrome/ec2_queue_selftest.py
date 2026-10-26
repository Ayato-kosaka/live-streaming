"""**EC2 の順番待ち（札）の見張り。本物の EC2 には1度も触らない。**

    python3 .claude/skills/ec2-chrome/ec2_queue_selftest.py
    BREAK=beat_never_expires python3 .claude/skills/ec2-chrome/ec2_queue_selftest.py   # 守りを1つ外した版で回す（対照の子）

終了コード 0=通った / 1=落ちた / **2=数えるものが無い・外す字や差し替える字が見つからない**
（`docs/island-standards.md` §15）。要るのは Python・sh・bash・jq だけ。

## なぜ要るか（2026-10-24）

EC2 をいくつものセッションが同時に使い、片方の「済んだので止める」がもう片方の作業ごと EC2 を止めた。
同じ Chrome の束を2人が触って、タブを閉じ合った。だから束ごとの列に札を置いた（`ec2_queue.py`）。
**札には2つの壊れかたがある。** 札が消えないと、セッションが死んだあと EC2 が止まらない（お金が出ていく）。
札が早く消えると、また人の作業ごと止める・タブを閉じ合う。だから両方を足にする。

## 偽物

- **偽の時計・偽の /proc・偽の起動時刻**: 本物の `ec2_queue.py` を、`EC2_QUEUE_NOW`（時刻）・`EC2_QUEUE_PROC`
  （`stat` の btime と `<pid>/stat`）・使い捨ての置き場で回す
- **偽の EC2**: `fakeaws.py`（この中で書き出す）を `aws` の代わりにする。`send-command` で来た sh は、
  EC2 の置き場（`/usr/local/sbin/ec2-queue`・`/home/ubuntu`・`desktop-input`）だけ差し替えて手元の sh で回す。
  `ec2.py` は `AWS` を差し替えて読み込み、`ec2_exec.sh` は PATH の頭に偽の `aws` を置いて回す
  （本物の aws が呼ばれても届かないよう、インスタンスは `i-fake…`、`AWS_CONFIG_FILE` は無い場所）
- **idle-stop**: `idle_stop.sh` の本物の字の、時刻・uptime・置き場・shutdown だけを差し替えて、5分ごとの cron を偽の時計で回す
- **実時間**: 流れるのは本物のプロセスを相手にする所（心拍のスレッド・kill -9・exec・2つのプロセスの順番）だけ。
  そこも決まった秒は待たず、条件が満ちるまで見る（`until`）。CI が混んでも答えが変わらないように（2026-10-26）

| 足 | 確かめること（依頼の合格の条件の番号） |
| --- | --- |
| `fifo` | 1. 空なら取れる・持っていれば待ち札・3人で順番が入れ替わらない・列どうしは独立 |
| `beat_expiry` | 2. 手元の持ち主が心拍を止めたら、期限（600秒）で失効して次の待ち人に回る。打ち続ければ持てる |
| `session_death` | 2. 札を持ったプロセスを kill -9 すると、心拍が1本も来なくなる（切り離した裏で心拍が生き残らない）。期限で空く |
| `pid_death` | 3. EC2 の上の持ち主（pid の札）が kill -9・ゾンビ・pid の使い回しなら次の確かめで失効。`ec2-queue hold` の exec も |
| `dead_waiter` | 4. 待ち札の持ち主が死んだら、その待ち札は列を塞がない（心拍の待ち札は2分、pid の待ち札は即） |
| `boot` | 5. 起動より前の札・待ち札・止める印は無効 |
| `max_hold` | 6. 心拍し続けても6時間で失効（pid の札も） |
| `broken_tickets` | 壊れた札・読めない置き場は「使っている」に数えない。`busy` は置き場を書かない |
| `idle_stop_live_dead` | 7. 生きた札があれば止めない／持ち主が全員死んだら、期限＋30分で止める判断になる |
| `idle_stop_failsafe` | 8. ec2-queue が無い・答えない・嘘をつく・壊れた札のとき、6時間を超えて起こし続けない |
| `stop_flow` | 9. 列が空でなければ止めない。印を見た人（札・run）は止まりきるのを待って起こし直す。止められなければ印を外す |
| `exec_respects` | 10. `ec2_exec.sh` は札を持って回り、ほかの人の札があれば止めない（無ければ止める） |
| `lease_local` | 手元の `ec2.lease`: 心拍で持ち続け、抜けたら返す（例外でも）。待つ間は何番目で誰かを出し、上限で持ち主と目的を出して諦める |
| `cdp_hold` | `cdp.py` の `up()` が札を pid で自分で取り、空くまで待つ。手元から渡された自分の札では待たない |

## 守りを1つずつ外す（§15「対照は、足の数だけ用意する」）

下の `CUTS` が、本物の字を1か所だけ書き換えた写しを作り、それで足を全部回す。**外した守りの足だけが落ちる**
ことを確かめる。外す字が本物に見つからなければ 2 で落ちる。`ec2_queue.py` の比較を全部ひっくり返す対照は
`python3 python/mutation_drill.py` が当てる（隣の `ec2_queue.py` に、名前で繋がっている）。

## どこから走るか

回し役（`python/selftest_runner.py`）の `MJS_ROOTS` に `.claude/skills/ec2-chrome` が入っていて、Selftests から回る。
"""

from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import os
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import threading
import time
import traceback
from pathlib import Path

HERE = Path(__file__).resolve().parent
BREAK = os.environ.get("BREAK", "")
NAMES = ("ec2_queue.py", "ec2.py", "idle_stop.sh", "ec2_exec.sh", "cdp.py", "cdp_heal.sh")
REAL = {n: HERE for n in NAMES}
NOW = 1_792_900_000.0
BOOT = NOW - 86_400
PY = sys.executable

# 外す守り: 名前 → (ファイル, 本物の字, 書き換えた字, 落ちるはずの足, 何を外すか)
CUTS: dict[str, tuple[str, str, str, set[str], str]] = {
    "fifo_jump": ("ec2_queue.py",
                  '            if holder(q) is None and q[0] is t:\n                t["held"] = at\n                t["beat"] = at\n',
                  '            if holder(q) is None:\n                t["held"] = at\n                t["beat"] = at\n',
                  {"fifo", "dead_waiter"}, "持ち主が抜けたら、先着でなくても聞き直しに来た待ち人に渡す"),
    "beat_never_expires": ("ec2_queue.py", '    if at - t["beat"] > ttl:\n', "    if False:\n",
                           {"beat_expiry", "session_death", "dead_waiter", "idle_stop_live_dead"},
                           "心拍が途切れても札を消さない"),
    "waiter_ttl_long": ("ec2_queue.py", "        ttl = min(ttl, WAIT_TTL)\n", "        pass\n",
                        {"dead_waiter"}, "待ち札も持ち札と同じ10分の期限にする（死んだ待ち人が列を長く塞ぐ）"),
    "pid_trust": ("ec2_queue.py", '        if st is None or st[0] in ("Z", "X", "x") or st[1] != t["pid_start"]:\n',
                  "        if False:\n", {"pid_death", "dead_waiter", "idle_stop_live_dead"},
                  "pid の札を、pid が死んでも消さない"),
    "pid_reuse": ("ec2_queue.py", '        if st is None or st[0] in ("Z", "X", "x") or st[1] != t["pid_start"]:\n',
                  '        if st is None or st[0] in ("Z", "X", "x"):\n', {"pid_death"},
                  "pid の使い回し（起動時刻が違う）を見分けない"),
    "pid_zombie": ("ec2_queue.py", '        if st is None or st[0] in ("Z", "X", "x") or st[1] != t["pid_start"]:\n',
                   '        if st is None or st[1] != t["pid_start"]:\n', {"pid_death"}, "ゾンビを生きているとみなす"),
    "no_boot": ("ec2_queue.py", '    if t["t0"] < boot:\n', "    if False:\n", {"boot"}, "起動より前の札を数える"),
    "no_max": ("ec2_queue.py", "    if at - since > MAX_S:\n", "    if False:\n", {"max_hold"}, "6時間の上限を外す"),
    "broken_crash": ("ec2_queue.py", '    if not valid(t, at):\n        return False, "broken"\n', "",
                     {"broken_tickets", "idle_stop_failsafe"}, "壊れた札を読まずに数えに行く（落ちる。idle-stop は新しい置き場で ec2-queue が落ちたのを、6時間は使っている側に倒す）"),
    "busy_writes": ("ec2_queue.py", "            lv = live(st, at, boot)\n            if err:\n",
                    "            prune(st, at, boot)\n            save(st)\n            lv = live(st, at, boot)\n            if err:\n",
                    {"broken_tickets"}, "busy が置き場を書く（idle-stop の6時間の上限が、置き場の新しさで切れなくなる）"),
    "mark_ignores_lanes": ("ec2_queue.py", "        lv = live(st, at, boot)\n        if lv:\n",
                           "        lv = live(st, at, boot)\n        if False:\n",
                           {"stop_flow", "exec_respects"}, "列に人が居ても止める印を立てる"),
    "take_ignores_mark": ("ec2_queue.py",
                          '            return waiting(q, t, at), ch\n        if stop_alive(st, at, boot):\n',
                          '            return waiting(q, t, at), ch\n        if False:\n',
                          {"stop_flow"}, "止める印が立っていても新しい札を出す（止める EC2 の上に置き去りにする）"),
    "mark_survives_boot": ("ec2_queue.py", '    return m["t"] >= boot and', '    return True and',
                           {"boot", "stop_flow"}, "起動より前の止める印を生かす"),
    "idle_no_queue": ("idle_stop.sh", "      *BUSY*) [", "      *NEVERBUSY*) [",
                      {"idle_stop_live_dead", "idle_stop_failsafe"}, "idle-stop が生きた札を数えない"),
    "idle_no_cap": ("idle_stop.sh", '      *BUSY*) [ "$qage" -lt $((STALE_H * 3600)) ] && qwhy=',
                    '      *BUSY*) qwhy=', {"idle_stop_failsafe"},
                    "ec2-queue が「使っている」と言えば、置き場が古くても数える"),
    "idle_unknown_forever": ("idle_stop.sh", '  elif [ "$qage" -lt $((STALE_H * 3600)) ]; then\n', "  elif true; then\n",
                             {"idle_stop_failsafe"}, "ec2-queue が答えないと、いつまでも使っているとみなす"),
    "idle_unknown_open": ("idle_stop.sh", '  elif [ "$qage" -lt $((STALE_H * 3600)) ]; then\n', "  elif false; then\n",
                          {"idle_stop_failsafe"}, "ec2-queue が答えないと、札があっても誰も居ないとみなす"),
    "stop_no_queue": ("ec2.py", "  *) if [ -x {QUEUE} ]; then\n", "  *) if false; then\n",
                      {"stop_flow", "exec_respects"}, "ec2.py stop が札を見ない（印を立てずに止める）"),
    "run_ignores_mark": ("ec2.py", "        if raw or not out.startswith(STOPPING):\n", "        if True:\n",
                         {"stop_flow"}, "run() が止める印を見ても、待たずに戻る"),
    "lease_no_beat": ("ec2.py", "    beater.start()\n", "    pass\n", {"lease_local", "session_death"}, "手元の札に心拍を打たない"),
    "lease_no_release": ("ec2.py", '        r = queue_call(["release", tk], 60)\n', '        r = {"state": "released"}\n',
                         {"lease_local", "exec_respects"}, "抜けても札を返さない"),
    "beat_detached": ("ec2.py", "    beater.start()\n",
                      "    subprocess.Popen([sys.executable, '-c', 'import sys, time; sys.path.insert(0, sys.argv[1]); import ec2; "
                      "ec2.AWS = __import__(\"json\").loads(sys.argv[3]); ec2.INSTANCE = sys.argv[4]; ec2.T = 0.002\\n"
                      "while True:\\n    ec2.queue_call([\"beat\", sys.argv[2]]); time.sleep(0.05)', HERE, tk, json.dumps(AWS), INSTANCE], "
                      "start_new_session=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)\n    beater.start()\n",
                      {"session_death"}, "心拍を切り離した裏のプロセスで打つ（セッションが死んでも心拍が生き残る）"),
    "exec_unconditional_stop": ("ec2_exec.sh", '        out=$(timeout 600 python3 "$EC2PY" stop 2>&1); rc=$?\n',
                                '        out=$(timeout 60 $AWSP ec2 stop-instances --instance-ids "$INSTANCE_ID" 2>&1); rc=$?\n',
                                {"exec_respects"}, "ec2_exec.sh が中を見ずに止める（前の形）"),
    "exec_no_hold": ("ec2_exec.sh", '  python3 "$EC2PY" hold "$LANE" --who "ec2_exec:$(basename "$REMOTE_FILE")" \\\n'
                     '    --purpose "ec2_exec.sh $(basename "$REMOTE_FILE")" -- env EC2_EXEC_INNER=1 bash "$0" "$@"',
                     '  env EC2_EXEC_INNER=1 bash "$0" "$@"', {"exec_respects"}, "ec2_exec.sh が札を持たずに回す"),
    "cdp_no_hold": ("cdp.py", "    hold(name)\n    port, udd = _port(name), _udd(name)\n", "    port, udd = _port(name), _udd(name)\n",
                    {"cdp_hold"}, "up() が札を取らずに Chrome を触る"),
    "cdp_ignore_env": ("cdp.py", '    if name in mine and _q("owns", mine[name], name)[0] == 0:\n', "    if False:\n",
                       {"cdp_hold"}, "手元から渡された自分の札を使わず、自分の札を待って詰まる"),
}


# 足ごとに、読む本物のファイル。子（守りを1つ外した写し）では、外したファイルを読まない足を回さない
# （読まないので結果は変わらない。親が本物で全部の足を回して確かめている）
QUEUE_ONLY = {"ec2_queue.py"}
DEPS: dict[str, set[str]] = {
    "fifo": QUEUE_ONLY, "beat_expiry": QUEUE_ONLY, "pid_death": QUEUE_ONLY, "dead_waiter": QUEUE_ONLY,
    "boot": QUEUE_ONLY, "max_hold": QUEUE_ONLY, "broken_tickets": QUEUE_ONLY,
    "session_death": {"ec2.py", "ec2_queue.py"},
    "idle_stop_live_dead": {"idle_stop.sh", "ec2_queue.py"},
    "idle_stop_failsafe": {"idle_stop.sh", "ec2_queue.py"},
    "stop_flow": {"ec2.py", "ec2_queue.py", "idle_stop.sh"},
    "exec_respects": {"ec2_exec.sh", "ec2.py", "ec2_queue.py", "idle_stop.sh", "cdp.py", "cdp_heal.sh"},
    "lease_local": {"ec2.py", "ec2_queue.py"},
    "cdp_hold": {"cdp.py", "ec2_queue.py"},
}


def _script(p: Path, text: str) -> Path:
    p.write_text(text, encoding="utf-8")
    p.chmod(p.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    return p


def _load(name: str, path: Path):
    sys.modules.pop(name, None)
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


def ems(out: str) -> dict:
    for ln in reversed(out.splitlines()):
        if ln.startswith("EC2Q "):
            return json.loads(ln[5:])
    return {"state": "noanswer", "out": out.strip()[-300:]}


# ---- 実時間で待つところ -----------------------------------------------------------
# 時刻で決まる答えは偽の時計（NOW と q.at()）で出す。本物のプロセスを相手にする足（心拍のスレッド・
# kill -9・exec・2つのプロセスの順番）だけは実時間が流れるが、**決まった秒は待たない**。
# 決まった秒は、ランナーが混むと足りなくなって答えが揺れた（PR #1038 の Selftests で、
# 4本並べた見張りの裏で BREAK=beat_never_expires の対照が外れた）。条件が満ちるまで短く何度も見て、
# 満ちたら次へ進む。上限は混んでも届かない長さにして、使い切るのは満ちない形（守りを外した写し）だけにする

def until(cond, cap: float, every: float = 0.02) -> bool:
    """cond() が真になるまで見続ける。真になれば True、cap 秒たっても偽なら False"""
    end = time.monotonic() + cap
    while not cond():
        if time.monotonic() > end:
            return False
        time.sleep(every)
    return True


class Lines:
    """パイプを裏で読み続ける。readline で止まらずに「この字が来たか」を until で見るため"""

    def __init__(self, pipe) -> None:
        self.got: list[str] = []

        def pump():
            for ln in pipe:
                self.got.append(ln)
        self.th = threading.Thread(target=pump, daemon=True)
        self.th.start()

    def has(self, s: str) -> bool:
        return any(s in ln for ln in list(self.got))

    def text(self) -> str:
        self.th.join(30)
        return "".join(self.got)


def _pstat(pid) -> list[str] | None:
    """/proc/<pid>/stat の ) より後ろ（[0]=状態 [1]=親 [3]=セッション [19]=起動時刻）。居なければ None"""
    try:
        s = Path(f"/proc/{pid}/stat").read_text(errors="replace")
    except OSError:
        return None
    return s[s.rfind(")") + 2:].split()


def _alive(pid: int, start: str) -> bool:
    ps = _pstat(pid)
    return bool(ps) and ps[0] not in ("Z", "X", "x") and ps[19] == start


class Bench:
    def __init__(self, files: dict[str, Path], tmp: Path) -> None:
        self.tmp = tmp
        self.files = files
        self.tool = files["ec2_queue.py"] / "ec2_queue.py"
        self.n = 0
        self._qmod = None

    @property
    def qmod(self):
        """写しの置き場の ec2_queue.py を読み込んだもの（足の大半は、これの main() を同じプロセスで回す）"""
        if self._qmod is None:
            self._qmod = _load(f"ec2_queue_under_test_{id(self)}", self.tool)
        return self._qmod

    def fresh(self) -> Path:
        self.n += 1
        d = self.tmp / f"case{self.n}"
        d.mkdir()
        return d


# ---- 偽の時計・偽の /proc で回す ec2-queue -----------------------------------

class Q:
    """本物の ec2_queue.py を、偽の時計（now）・偽の /proc・使い捨ての置き場で回す。real=True なら本物の時計と /proc"""

    def __init__(self, b: Bench, now=NOW, boot=BOOT, real=False):
        self.b = b
        self.d = b.fresh()
        self.qdir = self.d / "q"
        self.qdir.mkdir()
        self.real = real
        self.now = now
        self.proc = self.d / "proc"
        if not real:
            self.proc.mkdir()
            self.set_boot(boot)

    def set_boot(self, t: float):
        (self.proc / "stat").write_text(f"cpu  1 2 3 4\nbtime {t}\nprocesses 1\n")

    def pid(self, pid: int, start=1000, state="S", comm="python3 x)y"):
        d = self.proc / str(pid)
        d.mkdir(exist_ok=True)
        rest = [state, "1"] + ["0"] * 17 + [str(start)] + ["0"] * 10
        (d / "stat").write_text(f"{pid} ({comm}) " + " ".join(rest) + "\n")

    def kill(self, pid: int):
        shutil.rmtree(self.proc / str(pid))

    def at(self, t: float):
        self.now = t
        return self

    def env(self) -> dict:
        e = dict(os.environ)
        for k in ("EC2_QUEUE_PROC", "EC2_QUEUE_NOW", "EC2_QUEUE_SHIFT", "EC2_QUEUE_TICKET", "EC2_QUEUE_WHO"):
            e.pop(k, None)
        e["EC2_QUEUE_DIR"] = str(self.qdir)
        if not self.real:
            e["EC2_QUEUE_PROC"] = str(self.proc)
            e["EC2_QUEUE_NOW"] = repr(self.now)
        return e

    def raw(self, *args, json_=True) -> tuple[int, str, str]:
        """本物の main() を回す。偽の時計なら同じプロセスで（main の字は同じ。起こす手間だけ省く）、本物の時計なら子で"""
        argv = [*(["--json"] if json_ else []), *map(str, args)]
        if self.real:
            r = subprocess.run([PY, str(self.b.tool), *argv], env=self.env(), capture_output=True, text=True,
                               timeout=30, check=False)
            return r.returncode, r.stdout, r.stderr
        m = self.b.qmod
        m.DIR, m.PROC = str(self.qdir), str(self.proc)
        m.now = lambda: self.now
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            try:
                rc = m.main(argv)
            except SystemExit as e:
                rc = e.code if isinstance(e.code, int) else 2
        return rc, out.getvalue(), err.getvalue()

    def call(self, *args) -> dict:
        return ems(self.raw(*args)[1])

    def take(self, lane, who, ticket=None, ttl=None, pid=None, purpose="p") -> dict:
        a = ["take", lane, "--who", who, "--purpose", purpose]
        if ticket:
            a += ["--ticket", ticket]
        if ttl:
            a += ["--ttl", ttl]
        if pid:
            a += ["--pid", pid]
        return self.call(*a)

    def busy(self) -> str:
        return self.raw("busy", json_=False)[1].strip()


def st(r: dict) -> str:
    return r.get("state", "?")


# ---- 足 1〜6・壊れた札 ---------------------------------------------------------

def leg_fifo(b: Bench):
    q = Q(b)
    a = q.take("fish", "A")
    bb = q.take("fish", "B")
    c = q.take("fish", "C")
    other = q.take("ytstudio", "Y")
    out = [(f"空の列は取れる（{st(a)}）", st(a) == "held"),
           (f"持っていれば待ち札（B: {st(bb)} {bb.get('pos')}番目・持ち主 {(bb.get('holder') or {}).get('who')}）",
            st(bb) == "waiting" and bb.get("pos") == 1 and (bb.get("holder") or {}).get("who") == "A"),
           (f"3人目は2番目（C: {st(c)} {c.get('pos')}番目）", st(c) == "waiting" and c.get("pos") == 2),
           (f"別の列は独立（ytstudio: {st(other)}）", st(other) == "held")]
    q.call("release", a["ticket"])
    c1 = q.take("fish", "C", ticket=c["ticket"])
    b1 = q.take("fish", "B", ticket=bb["ticket"])
    d = q.take("fish", "D")
    q.call("release", bb["ticket"])
    d1 = q.take("fish", "D", ticket=d["ticket"])
    c2 = q.take("fish", "C", ticket=c["ticket"])
    out += [(f"A が返したあと、C が先に聞きに来ても渡さない（{st(c1)}）", st(c1) == "waiting"),
            (f"B に回る（{st(b1)}）", st(b1) == "held"),
            (f"後から来た D は C の後ろ（{d.get('pos')}番目）", st(d) == "waiting" and d.get("pos") == 2),
            (f"B が返したあと、D が先に聞きに来ても渡さない（{st(d1)}）", st(d1) == "waiting"),
            (f"C に回る（{st(c2)}）", st(c2) == "held")]
    return out


def leg_beat_expiry(b: Bench):
    q = Q(b)
    a = q.take("fish", "A", ttl=600)["ticket"]
    w = q.take("fish", "B")["ticket"]
    seen = []
    for dt in (100, 200, 300, 400, 500, 600):
        seen.append(st(q.at(NOW + dt).take("fish", "B", ticket=w)))
    late = q.at(NOW + 601).take("fish", "B", ticket=w)
    beat = q.at(NOW + 602).call("beat", a)
    # 打ち続ければ持てる（対照）
    q2 = Q(b)
    a2 = q2.take("fish", "A", ttl=600)["ticket"]
    w2 = q2.take("fish", "B")["ticket"]
    kept = []
    for dt in range(100, 2401, 100):     # 待ち人は2分以内に聞き直す。持ち主は5分ごとに打つ
        if dt % 300 == 0:
            kept.append(st(q2.at(NOW + dt).call("beat", a2)))
        q2.at(NOW + dt).take("fish", "B", ticket=w2)
    w2s = q2.at(NOW + 2400).take("fish", "B", ticket=w2)
    return [(f"心拍が止まって600秒までは A が持つ（B: {seen}）", seen == ["waiting"] * 6),
            (f"601秒で B に回る（{st(late)}）", st(late) == "held"),
            (f"A の心拍は失効を返す（{st(beat)} {beat.get('why')}）", st(beat) == "gone" and beat.get("why") == "expired"),
            (f"5分ごとに打ち続ければ40分でも持つ（{set(kept)}・B は {st(w2s)}）", set(kept) == {"held"} and st(w2s) == "waiting")]


def leg_pid_death(b: Bench):
    out = []
    for what, act in (("kill -9（pid が居ない）", lambda q: q.kill(4242)),
                      ("ゾンビ", lambda q: q.pid(4242, start=777, state="Z")),
                      ("pid の使い回し（起動時刻が違う）", lambda q: q.pid(4242, start=999))):
        q = Q(b)
        q.pid(4242, start=777)
        a = q.take("fish", "batch", pid=4242)
        w = q.take("fish", "B")["ticket"]
        before = st(q.take("fish", "B", ticket=w))
        act(q)
        after = st(q.take("fish", "B", ticket=w))
        out += [(f"{what}: 生きているあいだは持つ（{st(a)} / 待ち {before}）", st(a) == "held" and before == "waiting"),
                (f"{what}: 次の確かめで待ち人に回る（{after}）", after == "held")]
    # 本物のプロセス: ec2-queue hold は札を取ってからコマンドに成り代わる（pid が同じなので、死ねば札も死ぬ）
    q = Q(b, real=True)
    p = subprocess.Popen([PY, str(b.tool), "hold", "fish", "--who", "batch", "--", "sleep", "60"], env=q.env(),
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    lst: dict = {}

    def listed():
        lst.update(q.call("list"))
        return bool((lst.get("lanes") or {}).get("fish"))

    def argv0():
        try:
            return Path(f"/proc/{p.pid}/cmdline").read_bytes().split(b"\0")[0].decode()
        except OSError:
            return "?"
    until(listed, 60)
    h = ((lst.get("lanes") or {}).get("fish") or [{}])[0]
    # 札を書いてから exec するまでの間がある。混むと決まった 0.2秒で足りる保証は無いので、成り代わるまで見る
    until(lambda: argv0() == "sleep" or p.poll() is not None, 30)
    cmdline = argv0()
    w = q.take("fish", "B")
    os.kill(p.pid, signal.SIGKILL)
    p.wait(10)
    after = q.take("fish", "B", ticket=w.get("ticket"))
    out += [(f"hold: 札の pid が exec したコマンドの pid（{h.get('pid')} = {p.pid}・{cmdline}）",
             h.get("pid") == p.pid and cmdline == "sleep"),
            (f"hold: 持っているあいだ B は待つ（{st(w)}）", st(w) == "waiting"),
            (f"hold: kill -9 のあと B に回る（{st(after)}）", st(after) == "held")]
    return out


def leg_dead_waiter(b: Bench):
    q = Q(b)
    a = q.take("fish", "A")["ticket"]
    q.take("fish", "B")                       # B は待ち札を取ったまま死ぬ（聞き直しに来ない）
    c = q.take("fish", "C")["ticket"]
    q.at(NOW + 10).call("release", a)
    s1 = st(q.at(NOW + 10).take("fish", "C", ticket=c))
    s2 = st(q.at(NOW + 60).take("fish", "C", ticket=c))
    s3 = st(q.at(NOW + 121).take("fish", "C", ticket=c))
    # pid の待ち札は、pid が死ねば即
    q2 = Q(b)
    q2.pid(5151, start=55)
    a2 = q2.take("fish", "A")["ticket"]
    q2.take("fish", "W", pid=5151)
    c2 = q2.take("fish", "C")["ticket"]
    q2.kill(5151)
    q2.call("release", a2)
    s4 = st(q2.take("fish", "C", ticket=c2))
    # 待ち札しか残っていない列も、待ち人が死ねば「使っている」に数えない
    q3 = Q(b)
    a3 = q3.take("fish", "A")["ticket"]
    q3.take("fish", "B")
    q3.call("release", a3)
    busy_alive = q3.at(NOW + 60).busy()
    busy_dead = q3.at(NOW + 121).busy()
    return [(f"死んだ B が先頭でも、生きているうちは C は待つ（{s1} / {s2}）", s1 == "waiting" and s2 == "waiting"),
            (f"B が2分聞きに来なければ C に回る（{s3}）", s3 == "held"),
            (f"pid の待ち札は、pid が死ねば飛ばす（{s4}）", s4 == "held"),
            (f"待ち札だけの列: 生きていれば BUSY（{busy_alive[:40]}）・死ねば IDLE（{busy_dead}）",
             busy_alive.startswith("BUSY fish") and busy_dead == "IDLE")]


def leg_boot(b: Bench):
    q = Q(b)
    a = q.take("fish", "A")["ticket"]
    w = q.take("fish", "B")["ticket"]
    q.pid(77, start=7)
    q.take("ytstudio", "batch", pid=77)
    q.set_boot(NOW + 100)
    q.at(NOW + 130)
    busy = q.busy()
    gone = q.take("fish", "B", ticket=w)
    c = q.take("fish", "C")
    beat = q.call("beat", a)
    q2 = Q(b)
    m = q2.call("stop-mark", "--by", "x")
    alive = q2.raw("stopping")[0]
    q2.set_boot(NOW + 50)
    dead = q2.at(NOW + 60).raw("stopping")[0]
    t2 = q2.take("fish", "A")
    return [(f"起動より前の札（心拍・pid・待ち札）は数えない（busy: {busy}）", busy == "IDLE"),
            (f"起動より前の待ち札は消えている（{st(gone)} {gone.get('why')}）", st(gone) == "gone" and gone.get("why") == "boot"),
            (f"起動より前の持ち主の心拍も失効（{st(beat)}）", st(beat) == "gone"),
            (f"新しい人はすぐ取れる（{st(c)}）", st(c) == "held"),
            (f"止める印: 立てて生きている（{st(m)}・stopping={alive}）", st(m) == "marked" and alive == 0),
            (f"起動より前の止める印は無効（stopping={dead}・take は {st(t2)}）", dead == 1 and st(t2) == "held")]


def leg_max_hold(b: Bench):
    q = Q(b)
    a = q.take("fish", "A", ttl=1800)["ticket"]
    q.take("fish", "B")
    c = None
    seen = []
    for dt in range(100, 6 * 3600 + 1, 100):
        q.at(NOW + dt)
        if dt % 1500 == 0:
            seen.append(st(q.call("beat", a)))
        if dt == 5 * 3600:
            c = q.take("fish", "C")["ticket"]
        elif c:
            q.take("fish", "C", ticket=c)     # 待ち人は2分以内に聞き直す
    q.at(NOW + 6 * 3600 + 100)
    end = q.call("beat", a)
    cc = q.take("fish", "C", ticket=c)
    q2 = Q(b)
    q2.pid(88, start=8)
    q2.take("fish", "batch", pid=88)
    pid_in = q2.at(NOW + 6 * 3600).busy()
    pid_out = q2.at(NOW + 6 * 3600 + 1).busy()
    return [(f"6時間までは打ち続ければ持つ（{set(seen)}）", set(seen) == {"held"}),
            (f"6時間を超えると失効（{st(end)} {end.get('why')}）", st(end) == "gone" and end.get("why") == "max"),
            (f"次の待ち人に回る（{st(cc)}）", st(cc) == "held"),
            (f"pid の札も6時間で切れる（{pid_in[:30]} → {pid_out}）", pid_in.startswith("BUSY") and pid_out == "IDLE")]


def leg_broken_tickets(b: Bench):
    q = Q(b)
    sp = q.qdir / "state.json"
    sp.write_text("{not json")
    busy1 = q.busy()
    t = q.take("fish", "A")
    moved = (q.qdir / "state.json.broken").exists()
    q2 = Q(b)
    q2.take("fish", "A")
    d = json.loads((q2.qdir / "state.json").read_text())
    d["lanes"]["ytstudio"] = [{"id": "zz"}, "x", {"id": "0123456789ab", "lane": "ytstudio", "kind": "beat", "t0": "x"}]
    d["lanes"]["chatgpt"] = [{"id": "abcdefabcdef", "lane": "chatgpt", "kind": "beat", "t0": NOW, "beat": NOW + 99999,
                              "ttl": 600, "held": NOW}]
    (q2.qdir / "state.json").write_text(json.dumps(d))
    busy2 = q2.busy()
    lst = q2.call("list")
    y = q2.take("ytstudio", "Y")
    # busy は書かない（idle-stop は置き場の新しさで6時間を切る。busy が書くと、その守りが効かない）
    q3 = Q(b)
    q3.take("fish", "A")
    p3 = q3.qdir / "state.json"
    os.utime(p3, (NOW - 7200, NOW - 7200))
    m0 = p3.stat().st_mtime
    q3.at(NOW + 700).busy()
    q3.at(NOW + 700).raw("list", json_=False)
    m1 = p3.stat().st_mtime
    return [(f"読めない置き場: busy は IDLE（{busy1}）", busy1 == "IDLE"),
            (f"読めない置き場でも取れる（{st(t)}）・中身は state.json.broken に退ける（{moved}）", st(t) == "held" and moved),
            (f"壊れた札（形が違う・字だけ・未来の心拍）は数えない（{busy2}）", busy2.startswith("BUSY fish") and "ytstudio" not in busy2
             and "chatgpt" not in busy2),
            (f"一覧にも出ない（{sorted((lst.get('lanes') or {}))}）", sorted((lst.get("lanes") or {})) == ["fish"]),
            (f"壊れた札しか無い列は空いている（{st(y)}）", st(y) == "held"),
            (f"busy と list は置き場を書かない（mtime {m0:.0f} → {m1:.0f}）", m0 == m1)]


# ---- 足 7・8: idle-stop を偽の時計で回す ---------------------------------------

class IdleRig:
    """idle_stop.sh の本物の字の、時刻・uptime・置き場・shutdown だけを差し替えて回す。5分ごとの cron の代わり"""

    def __init__(self, b: Bench, q: Q, queue: str = "real"):
        self.b, self.q = b, q
        self.d = b.fresh()
        (self.d / "state").mkdir()
        (self.d / "home").mkdir()
        (self.d / "armed").write_text("behavior=stop\n")
        self.bin = self.d / "bin"
        self.bin.mkdir()
        _script(self.bin / "pgrep", "#!/bin/sh\nexit 1\n")
        _script(self.d / "desktop-input", "#!/bin/sh\necho '2147483647 xi2-never'\n")
        if queue == "real":
            qt = _script(self.d / "ec2-queue", f'#!/bin/sh\nexec "{PY}" "{b.tool}" "$@"\n')
        elif queue == "missing":
            qt = self.d / "no-such-ec2-queue"
        elif queue == "hang":
            qt = _script(self.d / "ec2-queue", "#!/bin/sh\nsleep 30\n")
        elif queue == "liar":
            qt = _script(self.d / "ec2-queue", "#!/bin/sh\necho 'BUSY fish holder=x waiting=0'\nexit 0\n")
        else:
            raise ValueError(queue)
        text = (b.files["idle_stop.sh"] / "idle_stop.sh").read_text(encoding="utf-8")
        subs = [("now=$(date +%s)", "now=${FAKE_NOW}"),
                ("up=$(cut -d. -f1 /proc/uptime)", "up=${FAKE_UP}"),
                ("STATE=/var/lib/idle-stop", f"STATE={self.d}/state"),
                ("LOG=/var/log/idle-stop.log", f"LOG={self.d}/idle.log"),
                ("EC2_QUEUE=/usr/local/sbin/ec2-queue", f"EC2_QUEUE={qt}"),
                ("QUEUE_STATE=/var/lib/ec2-queue/state.json", f"QUEUE_STATE={q.qdir}/state.json"),
                # 答えない ec2-queue だけ短く待つ（本物の ec2-queue は混んでいると 0.2秒では返らず、答えないに化ける）
                ("QUEUE_TIMEOUT=30", f"QUEUE_TIMEOUT={0.2 if queue == 'hang' else 20}"),
                ("/etc/idle-stop/armed", f"{self.d}/armed"),
                ("  pkill -TERM -u ubuntu -f 'user-data-dir=/home/ubuntu/cdp-' 2>/dev/null\n", "  :\n"),
                ("  sleep 10\n", "  :\n"),
                ("/sbin/shutdown -h now", "echo SHUTDOWN"),
                ("/home/ubuntu", f"{self.d}/home")]
        for old, new in subs:
            n = text.count(old)
            if (n != 1 and old != "/etc/idle-stop/armed" and old != "/home/ubuntu") or n == 0:
                print(f"✕ idle_stop.sh の差し替える字 {old!r} が {n} か所。字を直したら、ここも直す")
                sys.exit(2)
            text = text.replace(old, new)
        self.sh = text
        self.last_busy = None

    def tick(self, t: float) -> str:
        """1回ぶんの cron。shutdown なら 'SHUTDOWN'、使っている判断なら 'busy'、それ以外は 'idle'"""
        self.q.at(t)
        env = self.q.env()
        env.update(FAKE_NOW=str(int(t)), FAKE_UP=str(int(t - BOOT)), DESKTOP_INPUT=str(self.d / "desktop-input"),
                   PATH=f"{self.bin}{os.pathsep}{os.environ.get('PATH', '')}")
        before = (self.d / "state" / "last").read_text().strip() if (self.d / "state" / "last").exists() else None
        r = subprocess.run(["sh", "-c", self.sh], env=env, capture_output=True, text=True, timeout=30, check=False)
        if "SHUTDOWN" in r.stdout:
            return "SHUTDOWN"
        after = (self.d / "state" / "last").read_text().strip() if (self.d / "state" / "last").exists() else None
        if after == str(int(t)) and after != before:
            self.last_busy = t
            return "busy"
        return "idle"

    def until_shutdown(self, t0: float, t1: float, step=300, each=None) -> tuple[float | None, list]:
        trail = []
        t = t0
        while t <= t1:
            if each:
                each(t)
            v = self.tick(t)
            trail.append((t - t0, v))
            if v == "SHUTDOWN":
                return t, trail
            t += step
        return None, trail


def leg_idle_stop_live_dead(b: Bench):
    out = []
    # 生きた札（5分ごとに心拍）がある2時間は止めない
    q = Q(b)
    a = q.take("fish", "A", ttl=600)["ticket"]
    rig = IdleRig(b, q)
    (rig.d / "state" / "last").write_text(str(int(NOW)))
    sd, _ = rig.until_shutdown(NOW, NOW + 5400, each=lambda t: q.at(t).call("beat", a))
    out.append((f"心拍のある札があれば1時間半でも止めない（止めた時刻: {sd}）", sd is None))
    # 心拍の札の持ち主が死ぬ（NOW から心拍なし）→ 期限 600秒 + 30分で止める
    q = Q(b)
    q.take("fish", "A", ttl=600)
    rig = IdleRig(b, q)
    sd, trail = rig.until_shutdown(NOW, NOW + 2 * 3600)
    out.append((f"心拍の持ち主が死んだ: 期限(600秒)+30分 = 2400秒で止める判断（{None if sd is None else sd - NOW}秒）",
                sd is not None and sd - NOW == 600 + 1800))
    # pid の札の持ち主が 900秒の確かめのあとで kill -9 → 900 + 30分で止める
    q = Q(b)
    q.pid(4242, start=7)
    q.take("ytstudio", "batch", pid=4242)
    rig = IdleRig(b, q)
    killed = []

    def each(t):
        if t - NOW == 1200 and not killed:
            q.kill(4242)
            killed.append(t)
    sd, _ = rig.until_shutdown(NOW, NOW + 2 * 3600, each=each)
    out.append((f"pid の持ち主が死んだ: 最後に生きていた確かめ(900秒)+30分 = 2700秒で止める（{None if sd is None else sd - NOW}秒）",
                sd is not None and sd - NOW == 900 + 1800))
    # 2人（心拍と pid）とも死ぬ → 遅いほう + 30分
    q = Q(b)
    q.take("fish", "A", ttl=900)
    q.pid(99, start=9)
    q.take("ytstudio", "batch", pid=99)
    rig = IdleRig(b, q)

    def each2(t):
        if t - NOW == 300:
            q.kill(99)
    sd, _ = rig.until_shutdown(NOW, NOW + 2 * 3600, each=each2)
    out.append((f"2人とも死んだ: 遅いほう（心拍の期限 900秒）+30分 = 2700秒（{None if sd is None else sd - NOW}秒）",
                sd is not None and sd - NOW == 900 + 1800))
    return out


def leg_idle_stop_failsafe(b: Bench):
    out = []
    six = 6 * 3600
    for kind, what in (("missing", "ec2-queue が無い"), ("hang", "ec2-queue が答えない"), ("liar", "ec2-queue がいつも BUSY と言う")):
        q = Q(b)
        sp = q.qdir / "state.json"
        sp.write_text('{"v": 1, "lanes": {}}')
        os.utime(sp, (NOW, NOW))
        rig = IdleRig(b, q, queue=kind)
        step = 3600 if kind == "hang" else 600
        sd, trail = rig.until_shutdown(NOW, NOW + 8 * 3600, step=step)
        lb = None if rig.last_busy is None else rig.last_busy - NOW
        out += [(f"{what}・置き場は今書かれた: 6時間は使っている側に倒す（最後に使っていた判断 {lb}秒）",
                 lb is not None and six - step <= lb < six),
                (f"{what}: 6時間を超えて起こし続けない（止めた {None if sd is None else sd - NOW}秒・6時間+35分まで）",
                 sd is not None and sd - NOW <= six + 35 * 60)]
    # 置き場が無い（ec2-queue を一度も使っていない）で答えない → 30分で止める
    q = Q(b)
    rig = IdleRig(b, q, queue="missing")
    (rig.d / "state" / "last").write_text(str(int(NOW)))
    sd, _ = rig.until_shutdown(NOW, NOW + 3 * 3600)
    out.append((f"置き場も ec2-queue も無い: 30分で止める（{None if sd is None else sd - NOW}秒）", sd is not None and sd - NOW == 1800))
    # 壊れた札しか無い置き場（本物の ec2-queue）→ 数えない → 30分で止める
    # 置き場の時刻は偽の時計（NOW）で書く。書いたままだと本物の時刻になり、本物の時刻が NOW を
    # 越えた日（2026-10-25）から「未来に書かれた＝新しい置き場」に化けて、答えが変わった。
    # 新しい置き場にしておくのが本来の確かめ（6時間より古いと、ec2-queue が何と言っても数えないので何も見ていない）
    q = Q(b)
    (q.qdir / "state.json").write_text('{"lanes": {"fish": [{"id": "zz", "held": 1}], "x": "y"}}')
    os.utime(q.qdir / "state.json", (NOW, NOW))
    rig = IdleRig(b, q)
    (rig.d / "state" / "last").write_text(str(int(NOW)))
    sd, _ = rig.until_shutdown(NOW, NOW + 3 * 3600)
    out.append((f"壊れた札は数えない: 30分で止める（{None if sd is None else sd - NOW}秒）", sd is not None and sd - NOW == 1800))
    q = Q(b)
    (q.qdir / "state.json").write_text("{{{ not json")
    os.utime(q.qdir / "state.json", (NOW, NOW))
    rig = IdleRig(b, q)
    (rig.d / "state" / "last").write_text(str(int(NOW)))
    sd, _ = rig.until_shutdown(NOW, NOW + 3 * 3600)
    out.append((f"読めない置き場も数えない: 30分で止める（{None if sd is None else sd - NOW}秒）", sd is not None and sd - NOW == 1800))
    return out


# ---- 偽の EC2（aws の代わり） ---------------------------------------------------

FAKEAWS = r'''
import fcntl, json, os, subprocess, sys, time
args = sys.argv[1:]
d = args[args.index("--dir") + 1]
rest, skip = [], 0
for i, a in enumerate(args):
    if skip:
        skip -= 1
        continue
    if a in ("--dir", "--profile", "--region"):
        skip = 1
        continue
    rest.append(a)
cfg = json.load(open(f"{d}/config.json"))
def opt(name):
    return rest[rest.index(name) + 1] if name in rest else None
def locked(fn):
    with open(f"{d}/lock", "a+") as lf:
        fcntl.flock(lf, fcntl.LOCK_EX)
        s = json.load(open(f"{d}/aws.json"))
        r = fn(s)
        tmp = f"{d}/aws.json.{os.getpid()}"
        json.dump(s, open(tmp, "w"))
        os.replace(tmp, f"{d}/aws.json")
        return r
def log(entry):
    with open(f"{d}/calls.jsonl", "a") as f:
        f.write(json.dumps(entry) + "\n")
def shift():
    try:
        return float(open(f"{d}/shift").read())
    except (OSError, ValueError):
        return 0.0
cmd = rest[:2]
log({"t": time.time(), "cmd": cmd, "q": opt("--query"), "w": rest[2] if cmd == ["ec2", "wait"] else None})
state = json.load(open(f"{d}/aws.json"))["state"]
if cmd == ["ec2", "describe-instances"]:
    print(state)
elif cmd == ["ec2", "stop-instances"]:
    if os.path.exists(f"{d}/stop_fail"):
        print("An error occurred (UnauthorizedOperation) when calling the StopInstances operation", file=sys.stderr)
        sys.exit(255)
    locked(lambda s: s.update(state="stopped"))
elif cmd == ["ec2", "start-instances"]:
    def start(s):
        s["state"] = "running"
        open(cfg["proc"] + "/stat", "w").write(f"btime {time.time() + shift() + 0.001}\n")
    locked(start)
elif cmd == ["ec2", "wait"]:
    pass
elif cmd == ["ssm", "describe-instance-information"]:
    print("Online" if state == "running" else "ConnectionLost")
elif cmd == ["ssm", "send-command"]:
    if state != "running":
        print("An error occurred (InvalidInstanceId) when calling the SendCommand operation", file=sys.stderr)
        sys.exit(255)
    script = json.load(open(opt("--parameters")[len("file://"):]))["commands"][0]
    for old, new in cfg["subst"]:
        script = script.replace(old, new)
    cid = locked(lambda s: s.update(seq=s["seq"] + 1) or f"cmd{s['seq']}")
    env = dict(os.environ, **cfg["env"])
    env["EC2_QUEUE_SHIFT"] = str(shift())
    env["PATH"] = cfg["bin"] + os.pathsep + env.get("PATH", "")
    wrapper = 'FAKE_SELF=$$; export FAKE_SELF; sh -c "$1"; exit $?'
    r = subprocess.run(["sh", "-c", wrapper, "ssm-worker", script], env=env, capture_output=True, text=True, timeout=120)
    os.makedirs(f"{d}/cmds", exist_ok=True)
    json.dump({"status": "Success" if r.returncode == 0 else "Failed", "out": r.stdout, "err": r.stderr},
              open(f"{d}/cmds/{cid}.json", "w"))
    print(cid)
elif cmd == ["ssm", "get-command-invocation"]:
    res = json.load(open(f"{d}/cmds/{opt('--command-id')}.json"))
    q = opt("--query")
    if q == "Status":
        print(res["status"])
    elif q == "StandardOutputContent":
        print(res["out"])
    elif q == "StandardErrorContent":
        print(res["err"])
    else:
        print(json.dumps({"Status": res["status"], "StandardOutputContent": res["out"], "StandardErrorContent": res["err"]}))
else:
    print(f"fakeaws: 知らない呼びかた {rest[:3]}", file=sys.stderr)
    sys.exit(2)
'''


class FakeEC2:
    """偽の EC2。aws の代わり（fakeaws.py）と、EC2 の上の置き場（ec2-queue・家・desktop-input・pgrep）を持つ"""

    INSTANCE = "i-fake00000000000"

    def __init__(self, b: Bench, state="running"):
        self.b = b
        self.d = b.fresh()
        self.home = self.d / "home"
        (self.home / "locks").mkdir(parents=True)
        self.qdir = self.d / "q"
        self.qdir.mkdir()
        self.canon = self.d / "canon"
        self.proc = self.d / "proc"
        self.proc.mkdir()
        (self.proc / "stat").write_text(f"btime {time.time() - 3600}\n")
        self.bin = self.d / "bin"
        self.bin.mkdir()
        self.fake = self.d / "fakeaws.py"
        self.fake.write_text(FAKEAWS, encoding="utf-8")
        _script(self.bin / "aws", f'#!/bin/sh\nexec "{PY}" "{self.fake}" --dir "{self.d}" "$@"\n')
        _script(self.bin / "pgrep", '#!/bin/sh\n[ "$1" = -f ] && [ "$2" = ssm-document-worker ] || exit 1\n'
                                    '[ -n "${FAKE_SELF:-}" ] && echo "$FAKE_SELF"\nexit 0\n')
        self.queue = _script(self.d / "ec2-queue", f'#!/bin/sh\nexec "{PY}" "{b.tool}" "$@"\n')
        di = _script(self.d / "desktop-input", "#!/bin/sh\necho '2147483647 xi2-never'\n")
        (self.d / "aws.json").write_text(json.dumps({"state": state, "seq": 0}))
        (self.d / "config.json").write_text(json.dumps({
            "proc": str(self.proc), "bin": str(self.bin),
            "env": {"EC2_QUEUE_DIR": str(self.qdir), "EC2_QUEUE_PROC": str(self.proc)},
            # cdp.py の正の版と戻した記録（ec2.py put が cdp_heal.sh の字を送ってくる）も、手元の置き場へ
            "subst": [["/usr/local/sbin/ec2-queue", str(self.queue)], ["/usr/local/sbin/desktop-input", str(di)],
                      ["/home/ubuntu", str(self.home)], ["/usr/local/lib/ec2-chrome", str(self.canon)],
                      ["/var/log/cdp-heal.log", str(self.d / "cdp-heal.log")]]}))
        self.aws_cmd = [PY, str(self.fake), "--dir", str(self.d)]

    def shift(self, s: float) -> list[tuple[int, str]]:
        """偽の EC2 の時計を s 秒進める。返すのは、進める前から動いていた偽の aws（古い時計で書くかもしれない）。
        書きかけの shift を読ませないよう、別の名前に書いてから置き換える"""
        tmp = self.d / "shift.tmp"
        tmp.write_text(str(s))
        os.replace(tmp, self.d / "shift")
        return self.inflight()

    def inflight(self) -> list[tuple[int, str]]:
        """いま動いている偽の aws（pid, 起動時刻）"""
        me = str(self.fake).encode()
        out = []
        for d in Path("/proc").glob("[0-9]*"):
            try:
                argv = (d / "cmdline").read_bytes().split(b"\0")
            except OSError:
                continue
            if len(argv) > 1 and argv[1] == me and (ps := _pstat(d.name)):
                out.append((int(d.name), ps[19]))
        return out

    def qenv(self) -> dict:
        e = dict(os.environ)
        for k in ("EC2_QUEUE_NOW", "EC2_QUEUE_TICKET", "EC2_QUEUE_WHO"):
            e.pop(k, None)
        e.update(EC2_QUEUE_DIR=str(self.qdir), EC2_QUEUE_PROC=str(self.proc))
        try:
            e["EC2_QUEUE_SHIFT"] = (self.d / "shift").read_text()
        except OSError:
            e.pop("EC2_QUEUE_SHIFT", None)
        return e

    def q(self, *args) -> dict:
        r = subprocess.run([PY, str(self.b.tool), "--json", *map(str, args)], env=self.qenv(), capture_output=True,
                           text=True, timeout=30, check=False)
        return ems(r.stdout + r.stderr)

    def busy(self) -> str:
        r = subprocess.run([PY, str(self.b.tool), "busy"], env=self.qenv(), capture_output=True, text=True, timeout=30)
        return r.stdout.strip()

    def calls(self) -> list[dict]:
        # 偽の aws は心拍のたびに書き足す。書きかけの最後の行（改行の無い行）は読まない
        # （足が回っている最中に何度も数えるので、書く途中に当たると json が読めずに足ごと落ちる）
        p = self.d / "calls.jsonl"
        return [json.loads(ln) for ln in p.read_text().split("\n")[:-1]] if p.exists() else []

    def count(self, a, b2) -> int:
        return sum(1 for c in self.calls() if c["cmd"] == [a, b2])

    def state(self) -> str:
        return json.loads((self.d / "aws.json").read_text())["state"]

    def history(self) -> str:
        p = self.qdir / "history.log"
        return p.read_text() if p.exists() else ""

    def beat_of(self, tk) -> float:
        """置き場に書かれた、その札の最後の心拍の時刻（無ければ -inf）"""
        try:
            lanes = json.loads((self.qdir / "state.json").read_text()).get("lanes", {})
        except (OSError, ValueError):
            return float("-inf")
        return next((t.get("beat", float("-inf")) for q in lanes.values() for t in q
                     if isinstance(t, dict) and t.get("id") == tk), float("-inf"))

    def module(self):
        """偽の EC2 に繋いだ ec2.py（写しの置き場のもの）"""
        m = _load(f"ec2_under_test_{self.b.n}", self.b.files["ec2.py"] / "ec2.py")
        m.AWS = list(self.aws_cmd)
        m.INSTANCE = self.INSTANCE
        m.T = 0.01
        return m


@contextlib.contextmanager
def quiet_env():
    """ec2.py の lease は札を os.environ に入れる。足どうしで混ざらないように、抜けるときに戻す"""
    keys = ("EC2_QUEUE_TICKET", "EC2_QUEUE_WHO", "EC2_QUEUE_PURPOSE")
    saved = {k: os.environ.get(k) for k in keys}
    for k in keys:
        os.environ.pop(k, None)
    err = io.StringIO()
    try:
        with contextlib.redirect_stderr(err), contextlib.redirect_stdout(io.StringIO()):
            yield err
    finally:
        for k, v in saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v


# ---- 足 9・10・手元の札・cdp --------------------------------------------------

def leg_stop_flow(b: Bench):
    out = []
    # (a) ほかの人の札があれば止めない
    f = FakeEC2(b)
    other = f.q("take", "fish", "--who", "post", "--purpose", "tt-post")
    m = f.module()
    with quiet_env():
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            rc = m.stop()
    out += [(f"札がある: 止めない（終了コード {rc}・stop-instances {f.count('ec2', 'stop-instances')}回）",
             st(other) == "held" and rc == 1 and f.count("ec2", "stop-instances") == 0),
            (f"札がある: 理由に持ち主が出る（{[ln.strip() for ln in buf.getvalue().splitlines() if 'queue' in ln][:1]}）",
             "queue: fish post" in buf.getvalue())]
    # (b) 列が空なら印を立てて止める
    f = FakeEC2(b)
    m = f.module()
    with quiet_env():
        rc = m.stop()
    out += [(f"空: 止める（終了コード {rc}・stop-instances {f.count('ec2', 'stop-instances')}回・{f.state()}）",
             rc == 0 and f.count("ec2", "stop-instances") == 1 and f.state() == "stopped"),
            ("空: 止める前に印を立てた", "stop-mark" in f.history())]
    # (c) 確かめてから止めるまでのあいだに来た人（札）は、止まりきるのを待って起こし直す
    for who_kind in ("lease", "run"):
        f = FakeEC2(b)
        m = f.module()
        got: dict = {}
        with quiet_env() as err:
            why, token = m.busy_reasons()

            def entrant():
                try:
                    if who_kind == "lease":
                        with m.lease("fish", who="B", purpose="race", wait=15):
                            got["held_at_call"] = len(f.calls())
                            got["boot_ok"] = f.busy().startswith("BUSY fish")
                    else:
                        s, o = m.run("echo ran-on-ec2", 60, quiet=True)
                        got["held_at_call"] = len(f.calls())
                        got["out"] = o
                except BaseException as e:  # noqa: BLE001
                    got["err"] = repr(e)
            th = threading.Thread(target=entrant, daemon=True)
            th.start()
            # 来た人が印を見る（「止めている最中」と言う）か、取ってしまうまで待ってから止める。
            # 決まった秒（前は0.3秒）だと、混んだ箱では来た人が札を聞く前に止めてしまい、
            # 印を見ずに「止まっているので起こす」道を通る（印を無視して札を出す写しでも通ってしまう）
            until(lambda: "止めている最中" in err.getvalue() or bool(got) or not th.is_alive(), 120)
            early = dict(got)
            stop_at = len(f.calls())
            m.aws("ec2", "stop-instances", "--instance-ids", m.INSTANCE)
            th.join(180)
        cl = f.calls()
        stops = [i for i, c in enumerate(cl) if c["cmd"] == ["ec2", "stop-instances"]]
        starts = [i for i, c in enumerate(cl) if c["cmd"] == ["ec2", "start-instances"]]
        tail = err.getvalue().strip().splitlines()[-1:] if err.getvalue().strip() else []
        ok_flow = (not why and token and not early and stops and starts and starts[0] > stops[0]
                   and got.get("held_at_call", 0) > starts[0] and "err" not in got)
        if who_kind == "lease":
            out.append((f"印のあとに来た札: 止まる前には渡さず、止まりきってから起こし直して取る"
                        f"（印 {bool(token)}・止める前 {early or '待ち'}・{got.get('err') or ''}{tail}）", bool(ok_flow and got.get("boot_ok"))))
        else:
            out.append((f"印のあとに来た run(): 止まる前には流さず、起こし直してから流す（{got.get('out', '').strip()[:30]!r}"
                        f"{got.get('err') or ''}）", bool(ok_flow and "ran-on-ec2" in got.get("out", "")
                                                          and "STOPPING" not in got.get("out", ""))))
        del stop_at
    # (d) stop-instances が落ちたら印を外す（印の寿命の10分、誰も札を取れなくならないように）
    f = FakeEC2(b)
    (f.d / "stop_fail").write_text("1")
    m = f.module()
    with quiet_env():
        try:
            m.stop()
            raised = False
        except SystemExit:
            raised = True
    after = f.q("take", "fish", "--who", "next")
    out.append((f"stop-instances が落ちた: 印を外す（落ちた {raised}・次の人は {st(after)}）", raised and st(after) == "held"))
    return out


def leg_exec_respects(b: Bench):
    out = []
    for with_other in (True, False):
        f = FakeEC2(b)
        if with_other:
            f.q("take", "fish", "--who", "voice", "--purpose", "fish gen")
        remote = f.d / "remote.sh"
        remote.write_text("echo hello-from-ec2\necho \"ticket=$EC2_QUEUE_TICKET\"\n")
        log = f.d / "exec.log"
        path = f"{f.bin}{os.pathsep}{os.environ.get('PATH', '')}"
        if shutil.which("aws", path=path) != str(f.bin / "aws"):
            return [("偽の aws が PATH の頭に無い（本物の aws に届くので回さない）", False)]
        env = dict(os.environ, PATH=path, EC2_CHROME_INSTANCE_ID=FakeEC2.INSTANCE, EC2_CHROME_LOG=str(log),
                   EC2_CHROME_PARAMS=str(f.d / "params.json"), EC2_EXEC_RETRY_S="0",
                   EC2_PY_TIME_SCALE="0.01", EC2_QUEUE_LANE="doneru", AWS_CONFIG_FILE="/nonexistent/aws-config",
                   AWS_SHARED_CREDENTIALS_FILE="/nonexistent/aws-credentials")
        for k in ("EC2_QUEUE_TICKET", "EC2_QUEUE_WHO", "EC2_QUEUE_PURPOSE", "AWS_PROFILE"):
            env.pop(k, None)
        r = subprocess.run(["bash", str(b.files["ec2_exec.sh"] / "ec2_exec.sh"), str(remote), "60"], env=env,
                           capture_output=True, text=True, timeout=120, check=False)
        text = log.read_text() if log.exists() else r.stdout + r.stderr
        hist = f.history()
        ran = "hello-from-ec2" in text and "ticket=doneru:" in text
        held = "held doneru" in hist and "release doneru" in hist
        stops = f.count("ec2", "stop-instances")
        if with_other:
            out += [(f"ほかの人の札: 止めない（stop-instances {stops}回・{f.state()}）", stops == 0 and f.state() == "running"),
                    ("ほかの人の札: 「idle-stop に任せる」とログに書く", "idle-stop に任せる" in text),
                    (f"列 doneru の札を取って回し、返した（札は EC2 の上へ渡った {ran}・控え {held}）", ran and held)]
        else:
            out += [(f"誰も居ない: 止める（stop-instances {stops}回・{f.state()}）", stops == 1 and f.state() == "stopped"),
                    (f"誰も居ない: 回して返してから止めた（{ran} / {held}）", ran and held)]
    return out


def leg_lease_local(b: Bench):
    out = []
    f = FakeEC2(b)
    m = f.module()
    m.T = 0.001     # 心拍は 120秒×0.001 = 0.12秒ごと
    with quiet_env():
        t0 = time.monotonic()
        with m.lease("fish", who="me", purpose="voice A", ttl=600) as tk:
            took = time.monotonic() - t0    # 起こして札を取るまで（偽の aws を5回）。いまの混み具合の物差し
            inside = f.busy()
            env_tk = os.environ.get("EC2_QUEUE_TICKET", "")
            threads = [t.name for t in threading.enumerate()]
            beater = next((t for t in threading.enumerate() if t.name == "ec2-queue-beat-fish"), None)
            for sh in (250, 500, 750, 1000):
                # 進めたあとの心拍が置き場に届き、進める前に出かけた心拍（古い時計で書く）が全部書き終わるまで見る。
                # 前は「500秒ずつ2回・send-command が2本増えるまで6秒」で、2つ外れた（CPU を絞って回した元の形）:
                #  - 混むと6秒で1本も届かない。守りと関係の無い写し（BREAK=stop_no_queue）でこの足が落ちた
                #  - 心拍が並んで走る形（BREAK=beat_detached。この足は通るはず）で、古い時計の心拍が新しい心拍より
                #    後に書き、古い側から見て札が SKEW_S（300秒）より先に書かれている＝壊れた札として消した
                # だから一度に進めるのは300秒未満にし、次に進める前に古い心拍が書き終わるのを見る。
                # 上限は使い切らない（心拍のスレッドが居なければ来ないので待たない。その形は「スレッド」の確かめで落ちる）
                due = time.time() + sh
                old = f.shift(sh)
                until(lambda: (f.beat_of(tk) >= due and not any(_alive(*k) for k in old))
                      or beater is None or not beater.is_alive(), max(30.0, 10 * took))
            alive = f.busy()
        after = f.busy()
    out += [(f"取れる（{tk}）・札は環境に入る（{env_tk}）", bool(tk) and env_tk == f"fish:{tk}"),
            (f"心拍はこのプロセスのスレッド（{[t for t in threads if 'beat' in t]}）", "ec2-queue-beat-fish" in threads),
            (f"心拍で持ち続ける（時計を1000秒進めても {alive[:24]}）", alive.startswith("BUSY fish") and inside.startswith("BUSY fish")),
            (f"抜けたら返す（{after}）", after == "IDLE")]
    old = f.shift(0)        # 戻す前に出かけた心拍（1000秒先の時計で書く）が、次の札を古いとみなして消さないように
    until(lambda: not any(_alive(*k) for k in old), 60)
    try:
        with quiet_env():
            with m.lease("fish", who="me", purpose="boom"):
                raise RuntimeError("boom")
    except RuntimeError:
        pass
    out.append((f"例外で抜けても返す（{f.busy()}）", f.busy() == "IDLE"))
    # 待つ: 何番目で誰が持っているかを出し、上限で持ち主と目的を出して諦める
    f.q("take", "fish", "--who", "post", "--purpose", "tt-post vus-p1/A")
    msg, said = "", ""
    with quiet_env() as err:
        try:
            with m.lease("fish", who="me", purpose="voice", wait=0.3):
                pass
        except m.QueueError as e:
            msg = str(e)
        said = err.getvalue()
    out += [(f"待つあいだ、何番目で誰が持っているかを出す（{[ln for ln in said.splitlines() if '番目' in ln][:1]}）",
             "1番目に待っている" in said and "post（tt-post vus-p1/A" in said),
            (f"上限で、持ち主と目的を出して諦める（{msg[-60:]}）", "諦める" in msg and "post（tt-post vus-p1/A" in msg),
            (f"諦めたら待ち札を返す（{f.busy()}）", "waiting=0" in f.busy())]
    return out


DRIVER = r'''
import importlib.util, json, sys, time
cfg = json.loads(sys.argv[1])
spec = importlib.util.spec_from_file_location("ec2", cfg["ec2"])
m = importlib.util.module_from_spec(spec)
sys.modules["ec2"] = m
spec.loader.exec_module(m)
m.AWS, m.INSTANCE, m.T = cfg["aws"], cfg["instance"], 0.002   # 心拍は 120秒×0.002 = 0.24秒ごと
with m.lease("fish", who="dying", purpose="session", ttl=600):
    print("HELD", flush=True)
    time.sleep(120)
'''


def leg_session_death(b: Bench):
    f = FakeEC2(b)
    drv = f.d / "driver.py"
    drv.write_text(DRIVER, encoding="utf-8")
    cfg = {"ec2": str(b.files["ec2.py"] / "ec2.py"), "aws": f.aws_cmd, "instance": FakeEC2.INSTANCE}
    env = dict(os.environ)
    for k in ("EC2_QUEUE_TICKET", "EC2_QUEUE_WHO", "EC2_QUEUE_PURPOSE"):
        env.pop(k, None)
    t0 = time.monotonic()
    p = subprocess.Popen([PY, str(drv), json.dumps(cfg)], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, env=env)
    line = p.stdout.readline().strip()
    took = time.monotonic() - t0       # 起動して札を取るまで（偽の aws を5回）。いまの混み具合の物差し

    def beats():
        return sum(1 for c in f.calls() if c["cmd"] == ["ssm", "send-command"])
    # 上限は守りを外した写しでしか使い切らない。心拍のスレッドが無い（タスクが1本）なら来ないので待たない
    until(lambda: beats() >= 3 or len(list(Path(f"/proc/{p.pid}/task").glob("[0-9]*"))) < 2, max(30.0, 10 * took))
    b0 = beats()
    # kill -9 の瞬間に出かけていた心拍（子の偽の aws）は、親が死んでも書き終わる。それを「生き残った心拍」と
    # 数えないよう、止めて（SIGSTOP）から子を控え、kill -9 し、控えた子が抜けるまで見る。
    # 切り離した裏（start_new_session）はセッションが違うので控えない（それが生き残るのを見たい）
    os.kill(p.pid, signal.SIGSTOP)
    until(lambda: all((_pstat(f"{p.pid}/task/{t.name}") or ["T"])[0] in ("T", "t")
                      for t in Path(f"/proc/{p.pid}/task").glob("[0-9]*")), 10)
    me = _pstat(p.pid) or [""] * 4
    kids = [(int(d.name), ps[19]) for d in Path("/proc").glob("[0-9]*")
            if (ps := _pstat(d.name)) and ps[1] == str(p.pid) and ps[3] == me[3]]
    os.kill(p.pid, signal.SIGKILL)
    p.wait(10)
    until(lambda: not any(_alive(k, s) for k, s in kids), 60)
    b1 = beats()
    # 生き残った心拍が居れば、札を取るまでにかかった時間の2倍のうちに1本は来る（裏の心拍は0.05秒おき）。
    # 来れば待ち切らずに次へ
    until(lambda: beats() > b1, max(0.8, 2 * took))
    b2 = beats()
    busy_before = f.busy()
    f.shift(601)
    busy_after = f.busy()
    nxt = f.q("take", "fish", "--who", "next")
    return [(f"札を取って心拍を打っていた（{line}・SSM {b0}本）", line == "HELD" and b0 >= 3),
            (f"kill -9 のあと、心拍が1本も来ない（{b1} → {b2}）", b1 == b2),
            (f"期限までは札が残る（{busy_before[:24]}）", busy_before.startswith("BUSY fish")),
            (f"期限（600秒）を過ぎたら空く（{busy_after}・次の人は {st(nxt)}）", busy_after == "IDLE" and st(nxt) == "held")]


CDP_DRIVER = r'''
import importlib.util, json, os, sys, time
cfg = json.loads(sys.argv[1])
spec = importlib.util.spec_from_file_location("cdp", cfg["cdp"])
cdp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cdp)
cdp.QUEUE = cfg["queue"]
cdp.QUEUE_POLL_S = 0.1
cdp._alive = lambda port: True          # Chrome はもう起きている、として up() の札の段だけを通す
mode = cfg["mode"]
if mode == "up":
    print("PORT", cdp.up("fish"), flush=True)
    print("TICKETS", os.environ.get("EC2_QUEUE_TICKET", ""), flush=True)
    # 見張りが「2人目が待っている」のを見て gate を置くまで持つ（決まった秒は持たない）
    end = time.time() + 120
    while cfg.get("gate") and not os.path.exists(cfg["gate"]) and time.time() < end:
        time.sleep(0.02)
elif mode == "hold":
    try:
        print("GOT", cdp.hold("fish", wait=float(cfg["wait"])), flush=True)
    except RuntimeError as e:
        print("TIMEOUT", e, flush=True)
'''


def leg_cdp_hold(b: Bench):
    q = Q(b, real=True)
    qt = _script(q.d / "ec2-queue", f'#!/bin/sh\nexec "{PY}" "{b.tool}" "$@"\n')
    drv = q.d / "cdp_driver.py"
    drv.write_text(CDP_DRIVER, encoding="utf-8")

    def spawn(cfg, env=None):
        c = dict(cfg, cdp=str(b.files["cdp.py"] / "cdp.py"), queue=str(qt))
        return subprocess.Popen([PY, str(drv), json.dumps(c)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                                env=env or q.env())
    # 1人目は2人目が待ちに入るのを見てから抜ける。前は「1人目は1.2秒持つ」で、混むと2人目が起きて
    # 札を聞く前に1人目が抜け、待たずに取れてしまう（「待つ」を確かめられずに落ちる）
    gate = q.d / "gate"
    p1 = spawn({"mode": "up", "gate": str(gate)})
    first = p1.stdout.readline().strip()
    lst = q.call("list")
    h = ((lst.get("lanes") or {}).get("fish") or [{}])[0]
    p2 = spawn({"mode": "hold", "wait": 60})
    out2, err2 = Lines(p2.stdout), Lines(p2.stderr)
    until(lambda: err2.has("番目に待つ") or p2.poll() is not None, 60)
    held_back = p2.poll() is None and not out2.has("GOT")     # 1人目が持っているあいだは取れていない
    gate.write_text("")
    try:
        p2.wait(90)
    except subprocess.TimeoutExpired:
        p2.kill()
    o2, e2 = out2.text(), err2.text()
    p1.wait(30)
    # 手元から渡された自分の札（心拍の札）なら、取り直さずにそれを使う（待たない）
    mine = q.take("fish", "session", ttl=600)
    env = q.env()
    env["EC2_QUEUE_TICKET"] = f"fish:{mine.get('ticket')}"
    env["EC2_QUEUE_WAIT"] = "3"      # 自分の札を待ってしまう形なら、3秒で諦めて落ちる
    p3 = spawn({"mode": "up"}, env=env)
    o3, _ = p3.communicate(timeout=60)
    lst3 = q.call("list")
    n3 = len((lst3.get("lanes") or {}).get("fish") or [])
    q.call("release", mine.get("ticket", ""))
    return [(f"up() は札を pid で取る（{first}・持ち主の pid {h.get('pid')} = {p1.pid}）",
             first.startswith("PORT") and h.get("pid") == p1.pid and h.get("kind") == "pid"),
            (f"2人目は何番目で誰が持っているかを出して待つ（{[ln for ln in e2.splitlines() if '待つ' in ln][:1]}）",
             "番目に待つ" in e2 and f"pid {p1.pid}" in e2),
            (f"1人目が終われば2人目に回る（{o2.strip()[:24]}・1人目が持つあいだは待っていた {held_back}）",
             held_back and o2.startswith("GOT ")),
            (f"手元から渡された自分の札では待たず、札を増やさない（{o3.strip().splitlines()[:1]}・列 {n3}枚）",
             o3.startswith("PORT") and n3 == 1)]


LEGS = {
    "fifo": leg_fifo,
    "beat_expiry": leg_beat_expiry,
    "session_death": leg_session_death,
    "pid_death": leg_pid_death,
    "dead_waiter": leg_dead_waiter,
    "boot": leg_boot,
    "max_hold": leg_max_hold,
    "broken_tickets": leg_broken_tickets,
    "idle_stop_live_dead": leg_idle_stop_live_dead,
    "idle_stop_failsafe": leg_idle_stop_failsafe,
    "stop_flow": leg_stop_flow,
    "exec_respects": leg_exec_respects,
    "lease_local": leg_lease_local,
    "cdp_hold": leg_cdp_hold,
}


def reap(root: Path):
    """足が残したプロセス（守りを外した写しの、切り離した心拍など）を落とす。使い捨ての置き場の名前で見分ける"""
    me = os.getpid()
    for d in Path("/proc").glob("[0-9]*"):
        try:
            if int(d.name) != me and str(root) in (d / "cmdline").read_bytes().decode(errors="replace"):
                os.kill(int(d.name), signal.SIGKILL)
        except (OSError, ValueError):
            pass


def run_legs(files: dict[str, Path], tmp: Path, quiet: bool, cut_file: str | None = None,
             root: Path | None = None) -> tuple[list[str], int]:
    b = Bench(files, tmp)
    failed: list[str] = []
    checked = 0
    for name, fn in LEGS.items():
        if cut_file and cut_file not in DEPS[name]:
            if not quiet:
                print(f"[{name}]（{cut_file} を読まないので、この写しでは回さない）")
            continue
        t0 = time.time()
        try:
            res = fn(b)
        except SystemExit:
            raise
        except BaseException:  # noqa: BLE001
            res = [(f"足が落ちた: {traceback.format_exc().strip().splitlines()[-1]}", False)]
        reap(root or tmp)
        checked += len(res)
        if any(not ok for _, ok in res):
            failed.append(name)
        if not quiet:
            print(f"[{name}]（{time.time() - t0:.1f}秒）")
            for what, ok in res:
                print(f"  {'○' if ok else '✕'} {what}")
    return failed, checked


def cut_copy(name: str, dst: Path) -> dict[str, Path]:
    """本物を1つの置き場に写して、守りを1つだけ外す。外す字が無ければ 2 で落ちる"""
    for n in NAMES:
        shutil.copy(REAL[n] / n, dst / n)
    fname, old, new, _, _ = CUTS[name]
    text = (dst / fname).read_text(encoding="utf-8")
    if text.count(old) != 1:
        print(f"✕ BREAK={name}: 外す字が {fname} に {text.count(old)} か所（1か所のはず）。字を直したら CUTS も直す")
        sys.exit(2)
    (dst / fname).write_text(text.replace(old, new), encoding="utf-8")
    return {n: dst for n in NAMES}


def child(name: str) -> int:
    if name not in CUTS:
        print(f"✕ BREAK={name} という守りは無い（{' / '.join(CUTS)}）")
        return 2
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as td:
        src, tmp = Path(td) / "src", Path(td) / "work"
        src.mkdir()
        tmp.mkdir()
        files = cut_copy(name, src)
        failed, checked = run_legs(files, tmp, quiet=False, cut_file=CUTS[name][0], root=Path(td))
    print("LEGS_FAILED " + json.dumps(sorted(failed)))
    if checked == 0:
        return 2
    return 1 if failed else 0


def drill() -> list[str]:
    print("[対照] 守りを1つずつ外すと、その足だけが落ちるか")
    from concurrent.futures import ThreadPoolExecutor

    def one(name):
        t0 = time.time()
        try:
            r = subprocess.run([PY, str(Path(__file__).resolve())], capture_output=True, text=True,
                               env=dict(os.environ, BREAK=name), timeout=280, check=False)
        except subprocess.TimeoutExpired as e:
            # 1本が上限に当たっても、ほかの対照の結果は読めるように（例外で全部を落とさない）
            out = e.stdout.decode(errors="replace") if isinstance(e.stdout, bytes) else (e.stdout or "")
            r = subprocess.CompletedProcess(e.cmd, 1, out + "\n280秒で返ってこなかった", "")
        r.secs = time.time() - t0
        return r

    # 子どうしは時刻を見て待つ足を持つので、コアの数より多く並べない（混みすぎると待ちが長くなるだけ）
    with ThreadPoolExecutor(int(os.environ.get("EC2_QUEUE_DRILL_JOBS") or max(2, os.cpu_count() or 2))) as ex:
        runs = dict(zip(CUTS, ex.map(one, CUTS)))
    bad = []
    for name, (fname, _, _, want, why) in CUTS.items():
        r = runs[name]
        line = [ln for ln in r.stdout.splitlines() if ln.startswith("LEGS_FAILED ")]
        got = set(json.loads(line[-1][len("LEGS_FAILED "):])) if line else None
        hit = got == want and r.returncode == 1
        print(f"  {'○' if hit else '✕'} BREAK={name}（{fname}: {why}）→ 落ちた足 "
              f"{sorted(got) if got is not None else '（読めない: ' + (r.stdout + r.stderr).strip()[-300:] + '）'}"
              f"（欲しいのは {sorted(want)}・{r.secs:.0f}秒）")
        if not hit:
            # 回し役は最後の1行しか出さないので、外れ方（余計に落ちた足・落ちなかった足）を名前に添えて最後の行に載せる
            how = ([f"+{x}" for x in sorted(got - want)] + [f"-{x}" for x in sorted(want - got)]
                   if got is not None else ["読めない"])
            bad.append(f"{name}[{' '.join(how) or f'rc={r.returncode}'}]")
            # どの確かめで外れたかを出す（CI のログだけで、揺れか本物かを見分けられるように）
            leg, shown = "?", 0
            for ln in r.stdout.splitlines():
                if ln.startswith("["):
                    leg = ln.split("]")[0][1:]
                elif ln.lstrip().startswith("✕") and shown < 8:
                    print(f"      [{leg}] {ln.strip()[:200]}")
                    shown += 1
    return bad


def main() -> int:
    if BREAK:
        return child(BREAK)
    t0 = time.time()
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
    print(f"○ {len(LEGS)}本の足（{checked}件）が通り、守り {len(CUTS)}個を1つずつ外すと、その足だけが落ちた"
          f"（{time.time() - t0:.0f}秒）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
