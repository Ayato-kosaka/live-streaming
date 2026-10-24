#!/usr/bin/env python3
"""EC2 を使う順番待ち（札）。EC2 の上で動く（`/usr/local/sbin/ec2-queue`。手元の `ec2.py guard` が置く）。

    ec2-queue take <列> [--who 誰] [--purpose 何のため] [--ttl 秒] [--pid PID] [--ticket 札]
                                     # 札を取る。持てなければ待ち札になる。--ticket は待ち札の聞き直し（心拍を兼ねる）
    ec2-queue beat <札>              # 心拍（手元のセッションが持つ札は、これが途切れると期限で失効する）
    ec2-queue release <札>           # 返す（待ち札なら列から抜ける）
    ec2-queue owns <札> <列>         # その札がいまその列を持っているか（0 / 1）
    ec2-queue list                   # 誰が何を持ち、誰が待っているか
    ec2-queue busy                   # idle-stop が聞く。生きている札か待ち札があれば BUSY、無ければ IDLE（書かない）
    ec2-queue stop-mark --by 誰      # 列が全部空なら「止める印」を立てる（空でなければ BUSY で 3）
    ec2-queue stop-unmark <印>       # 止めるのをやめた
    ec2-queue stopping               # 止める印が生きていれば 0
    ec2-queue hold <列> [--who] [--purpose] [--wait 秒] -- <コマンド…>
                                     # EC2 の上の一括（nohup など）用。その pid で札を取り、取れたらコマンドに成り代わる（exec）

`--json` を頭に付けると、最後に `EC2Q {…}` の1行を出す（手元の ec2.py と cdp.py はこれを読む）。

## なぜ要るか（2026-10-24）

EC2 を、いくつものセッション・担当が同時に使っている。片方の「済んだので止める」が、もう片方の作業ごと
EC2 を止めた（10-23 23:45 UTC）。Fish の声作りを2人が同じタブで回しかけた。同じ Chrome の束（`cdp.py` の
`up(名前)`）を2人が触ると、タブを閉じ合い、入力が混ざる。だから束ごとに「列」を作り、1人ずつ持つ。

## 札の死にかた（どれでも札は消える）

| 持ち主 | 消える条件 |
| --- | --- |
| 手元のセッション（`kind=beat`） | 心拍が `ttl`（既定10分）途切れた。待ち札は `WAIT_TTL`（2分）。セッションは唐突に切れるので、返すのを当てにしない |
| EC2 の上のプロセス（`kind=pid`） | その pid が居ない・ゾンビ・別のプロセスに使い回された（起動時刻が違う）。次の確かめで即 |
| どちらも | 起動より前に作られた（EC2 が止まれば誰も持っていない）／持って `MAX_S`（6時間）を超えた／読めない（壊れた札は数えない） |

**止める側（idle-stop）を札に頼り切らない。** `busy` は札を書き換えない。idle-stop は、`busy` が答えない・
落ちるときも、札の置き場が6時間書かれていなければ数えない（`idle_stop.sh` の `# >>> queue`）。

## 止める印

`stop-mark` は、列が全部空なのを**鍵（flock）を持ったまま**確かめて印を立てる。印が生きているあいだ
`take` は `stopping` を返し、新しい札を出さない。印を見た人は、止まりきるのを待ってから起こし直す（手元の `ec2.py`）。
印は `STOP_TTL`（10分）か起動で消える（止める人が途中で死んでも、列は塞がったままにならない）。

見張りは同じ置き場の `ec2_queue_selftest.py`（偽の時計・偽の pid・偽の起動時刻で回す。本物の EC2 に触らない）。
"""
from __future__ import annotations

import argparse
import fcntl
import json
import os
import re
import secrets
import sys
import tempfile
import time

DIR = os.environ.get("EC2_QUEUE_DIR", "/var/lib/ec2-queue")
PROC = os.environ.get("EC2_QUEUE_PROC", "/proc")
TTL = 600            # 手元のセッションの札の既定の期限（心拍が途切れてから）
TTL_MIN = 20         # 本番で「期限60秒の札」を確かめられるように、60秒より短くまで許す
TTL_MAX = 1800       # 期限を延ばしすぎると、死んだセッションの札が長く残る
WAIT_TTL = 120       # 待ち札の期限。待つ人は15秒ごとに聞き直す。死んだ待ち人が列を長く塞がないよう、持ち札より短い
MAX_S = 6 * 3600     # 心拍し続けても、1枚の札が持てる長さの上限（idle-stop の鍵の STALE_H と同じ）
STOP_TTL = 600       # 止める印の寿命
LOCK_WAIT_S = 20     # 鍵（flock）を待つ上限。待ちきれなければ落ちる（止まって答えないより、落ちて呼んだ側が決める）
SKEW_S = 300         # これより先の時刻が書かれた札は壊れている
GRAVE_KEEP = 50
HIST_MAX = 512 * 1024
MARK = "EC2Q"
LANE_RE = re.compile(r"^[a-z0-9][a-z0-9_.-]{0,31}$")
TICKET_RE = re.compile(r"^[0-9a-f]{12}$")
RC = {"held": 0, "released": 0, "marked": 0, "unmarked": 0, "waiting": 10, "stopping": 11, "gone": 12}


class Fail(Exception):
    pass


def now() -> float:
    # EC2_QUEUE_NOW / EC2_QUEUE_SHIFT は自己テストの偽の時計（本番では誰も付けない）
    v = os.environ.get("EC2_QUEUE_NOW")
    return float(v) if v else time.time() + float(os.environ.get("EC2_QUEUE_SHIFT") or 0)


def boot_time() -> float:
    """起動した時刻（/proc/stat の btime）。読めなければ 0（起動での切り捨てだけ効かない。ほかの期限は効く）"""
    try:
        with open(f"{PROC}/stat", encoding="ascii") as f:
            for ln in f:
                if ln.startswith("btime "):
                    return float(ln.split()[1])
    except (OSError, ValueError, IndexError):
        pass
    return 0.0


def proc_stat(pid) -> tuple[str, int] | None:
    """(状態, 起動時刻のチック)。居なければ None。comm に空白や ) が入っても、最後の ) から読む"""
    try:
        with open(f"{PROC}/{int(pid)}/stat", encoding="utf-8", errors="replace") as f:
            s = f.read()
    except (OSError, ValueError, TypeError):
        return None
    rest = s[s.rfind(")") + 2:].split()
    try:
        return rest[0], int(rest[19])
    except (IndexError, ValueError):
        return None


def path(name: str) -> str:
    return os.path.join(DIR, name)


def _num(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def valid(t, at: float) -> bool:
    """札として読めるか。読めないものは「使っている」に数えない"""
    if not isinstance(t, dict):
        return False
    if not (isinstance(t.get("id"), str) and TICKET_RE.match(t["id"]) and isinstance(t.get("lane"), str)
            and LANE_RE.match(t["lane"]) and t.get("kind") in ("beat", "pid")
            and _num(t.get("t0")) and _num(t.get("beat")) and _num(t.get("ttl"))
            and (t.get("held") is None or _num(t.get("held")))):
        return False
    for k in ("t0", "beat", "held"):
        if _num(t.get(k)) and t[k] > at + SKEW_S:
            return False
    if t["kind"] == "pid" and not (isinstance(t.get("pid"), int) and t["pid"] > 0 and isinstance(t.get("pid_start"), int)):
        return False
    return True


def check(t, at: float, boot: float) -> tuple[bool, str]:
    """札が生きているか。(生きている, 死んだ理由)"""
    if not valid(t, at):
        return False, "broken"
    if t["t0"] < boot:
        return False, "boot"
    since = t["held"] if t.get("held") is not None else t["t0"]
    if at - since > MAX_S:
        return False, "max"
    if t["kind"] == "pid":
        st = proc_stat(t["pid"])
        if st is None or st[0] in ("Z", "X", "x") or st[1] != t["pid_start"]:
            return False, "pid"
        return True, ""
    ttl = min(max(t["ttl"], 0), TTL_MAX)
    if t.get("held") is None:
        ttl = min(ttl, WAIT_TTL)
    if at - t["beat"] > ttl:
        return False, "expired"
    return True, ""


def fresh() -> dict:
    return {"v": 1, "lanes": {}, "stop": None, "grave": []}


def load() -> tuple[dict, str | None]:
    """読めなければ空の状態と理由。壊れた置き場は「誰も持っていない」と読む"""
    try:
        with open(path("state.json"), encoding="utf-8") as f:
            raw = f.read()
    except FileNotFoundError:
        return fresh(), None
    except OSError as e:
        return fresh(), f"read: {e}"
    try:
        d = json.loads(raw)
    except ValueError:
        return fresh(), "broken"
    if not isinstance(d, dict) or not isinstance(d.get("lanes", {}), dict):
        return fresh(), "broken"
    st = fresh()
    st["lanes"] = {k: list(v) for k, v in d.get("lanes", {}).items() if isinstance(k, str) and isinstance(v, list)}
    st["stop"] = d.get("stop") if isinstance(d.get("stop"), dict) else None
    st["grave"] = [g for g in d.get("grave", []) if isinstance(g, dict)][-GRAVE_KEEP:]
    return st, None


def _write_file(p: str, data: str):
    fd, tmp = tempfile.mkstemp(prefix=".state.", dir=DIR)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(data)
            f.flush()
            os.fchmod(f.fileno(), 0o664)
        os.replace(tmp, p)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def save(st: dict):
    """書いた時刻（mtime）も、この道具の時計で付ける。idle-stop は置き場の新しさで6時間を切るので、
    札の時刻と置き場の時刻が同じ時計に乗っていないと、その守りが偽の時計の自己テストで確かめられない"""
    _write_file(path("state.json"), json.dumps(st, ensure_ascii=False, separators=(",", ":")))
    t = now()
    try:
        os.utime(path("state.json"), (t, t))
    except OSError:
        pass


def history(line: str):
    """何が起きたかを控える（この置き場の自前のファイル。/var/log には書かない）"""
    p = path("history.log")
    try:
        if os.path.getsize(p) > HIST_MAX:
            os.replace(p, p + ".1")
    except OSError:
        pass
    try:
        fd = os.open(p, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o664)
        try:
            os.fchmod(fd, 0o664)
        except OSError:
            pass
        with os.fdopen(fd, "a", encoding="utf-8") as f:
            f.write(time.strftime("%Y-%m-%dT%H:%M:%SZ ", time.gmtime(now())) + line.replace("\n", " ") + "\n")
    except OSError:
        pass


def ensure_dir():
    if os.path.isdir(DIR):
        return
    if os.geteuid() != 0:
        raise Fail(f"{DIR} が無い（root で ec2-queue を一度回すか、手元で ec2.py guard）")
    os.makedirs(DIR, exist_ok=True)
    os.chmod(DIR, 0o2775)
    try:
        import grp
        os.chown(DIR, 0, grp.getgrnam("ubuntu").gr_gid)
    except (KeyError, ImportError, OSError):
        pass


class Locked:
    """置き場の鍵（flock）。待ちきれなければ Fail（答えないまま居座らない）"""

    def __enter__(self):
        ensure_dir()
        fd = os.open(path("lock"), os.O_RDWR | os.O_CREAT, 0o664)
        try:
            os.fchmod(fd, 0o664)
        except OSError:
            pass
        end = time.monotonic() + LOCK_WAIT_S
        while True:
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.monotonic() > end:
                    os.close(fd)
                    raise Fail(f"鍵（{path('lock')}）が {LOCK_WAIT_S} 秒空かない")
                time.sleep(0.05)
        self.fd = fd
        return self

    def __exit__(self, *exc):
        os.close(self.fd)


def stop_alive(st: dict, at: float, boot: float) -> bool:
    m = st.get("stop")
    if not isinstance(m, dict) or not _num(m.get("t")) or not _num(m.get("ttl")):
        return False
    return m["t"] >= boot and m["t"] <= at + SKEW_S and at - m["t"] <= min(m["ttl"], STOP_TTL)


def prune(st: dict, at: float, boot: float) -> bool:
    """死んだ札と、切れた止める印を除く。何か除いたら True"""
    changed = False
    for lane in list(st["lanes"]):
        keep = []
        for t in st["lanes"][lane]:
            ok, why = check(t, at, boot)
            if ok and t["lane"] == lane:
                keep.append(t)
                continue
            changed = True
            tid = t.get("id") if isinstance(t, dict) and isinstance(t.get("id"), str) else "?"
            st["grave"].append({"id": tid, "lane": lane, "why": why or "lane", "at": at,
                                "who": (t.get("who") if isinstance(t, dict) else None)})
            history(f"drop {lane} id={tid} why={why or 'lane'} who={(t.get('who') if isinstance(t, dict) else '?')}")
        # 持ち主は列の頭にしか居ない（頭の待ち人だけが持ち主に上がる）。頭でない持ち主は壊れている
        if any(t.get("held") is not None for t in keep[1:]):
            for t in keep[1:]:
                if t.get("held") is not None:
                    t["held"] = None
            changed = True
        if keep:
            st["lanes"][lane] = keep
        else:
            del st["lanes"][lane]
    if st.get("stop") is not None and not stop_alive(st, at, boot):
        st["stop"] = None
        changed = True
    st["grave"] = st["grave"][-GRAVE_KEEP:]
    return changed


def live(st: dict, at: float, boot: float) -> dict:
    """書き換えずに、生きている札だけの列を返す（busy・list・owns 用）"""
    out = {}
    for lane, q in st["lanes"].items():
        keep = [t for t in q if check(t, at, boot)[0] and t["lane"] == lane]
        if keep:
            out[lane] = keep
    return out


def holder(q: list) -> dict | None:
    return q[0] if q and q[0].get("held") is not None else None


def brief(t: dict | None, at: float) -> dict | None:
    if not t:
        return None
    b = {"ticket": t["id"], "who": t.get("who", ""), "purpose": t.get("purpose", ""), "kind": t["kind"],
         "since": round(at - (t["held"] if t.get("held") is not None else t["t0"]))}
    if t["kind"] == "beat":
        ttl = min(t["ttl"], TTL_MAX) if t.get("held") is not None else min(t["ttl"], WAIT_TTL)
        b["expires_in"] = round(ttl - (at - t["beat"]))
    else:
        b["pid"] = t["pid"]
    return b


def where(st: dict, tid: str):
    for lane, q in st["lanes"].items():
        for i, t in enumerate(q):
            if t.get("id") == tid:
                return lane, i, t
    return None, -1, None


def grave_why(st: dict, tid: str) -> str:
    for g in reversed(st.get("grave", [])):
        if g.get("id") == tid:
            return g.get("why", "?")
    return "unknown"


def answer(state: str, **kw) -> dict:
    return dict(state=state, **kw)


def waiting(q: list, t: dict, at: float) -> dict:
    h = holder(q)
    ahead = q[:q.index(t)]
    pos = len(ahead) - (1 if h else 0) + 1
    return answer("waiting", ticket=t["id"], lane=t["lane"], pos=pos, holder=brief(h, at),
                  ahead=[brief(a, at) for a in ahead if a is not h])


def mutate(fn):
    """鍵を持って読み、死んだ札を除き、fn を当て、変わったら書く"""
    with Locked():
        st, err = load()
        at, boot = now(), boot_time()
        changed = False
        if err == "broken":
            # 読めない置き場は誰も持っていないと読む。中身は後で見られるように横へ写す
            try:
                os.replace(path("state.json"), path("state.json.broken"))
            except OSError:
                pass
            history("state.json が読めないので空から始める（state.json.broken に退けた）")
            changed = True
        changed |= prune(st, at, boot)
        res, ch = fn(st, at, boot)
        if changed or ch:
            save(st)
        return res


def clean(s, cap: int) -> str:
    return re.sub(r"\s+", " ", str(s or "")).strip()[:cap]


def op_take(lane: str, who: str, purpose: str, ttl: int, pid: int | None, ticket: str | None):
    if not LANE_RE.match(lane):
        raise Fail(f"列の名前が読めない: {lane!r}（英小文字・数字・_.- で32字まで）")
    ttl = int(max(TTL_MIN, min(TTL_MAX, ttl)))

    def fn(st, at, boot):
        if ticket:
            l, _, t = where(st, ticket)
            if t is None:
                return answer("gone", ticket=ticket, why=grave_why(st, ticket)), False
            if l != lane:
                raise Fail(f"札 {ticket} は列 {l} のもの（{lane} ではない）")
            q = st["lanes"][lane]
            if t.get("held") is not None:
                if t["kind"] == "beat":
                    t["beat"] = at
                return answer("held", ticket=t["id"], lane=lane), t["kind"] == "beat"
            if stop_alive(st, at, boot):
                return answer("stopping", left=round(st["stop"]["ttl"] - (at - st["stop"]["t"])), by=st["stop"].get("by")), False
            ch = False
            if t["kind"] == "beat":
                t["beat"] = at
                ch = True
            if holder(q) is None and q[0] is t:
                t["held"] = at
                t["beat"] = at
                history(f"held {lane} id={t['id']} who={t.get('who')} purpose={t.get('purpose')}")
                return answer("held", ticket=t["id"], lane=lane), True
            return waiting(q, t, at), ch
        if stop_alive(st, at, boot):
            return answer("stopping", left=round(st["stop"]["ttl"] - (at - st["stop"]["t"])), by=st["stop"].get("by")), False
        t = {"id": secrets.token_hex(6), "lane": lane, "who": clean(who, 80), "purpose": clean(purpose, 200),
             "kind": "pid" if pid else "beat", "t0": at, "beat": at, "ttl": ttl, "held": None}
        if pid:
            ps = proc_stat(pid)
            if ps is None or ps[0] in ("Z", "X", "x"):
                raise Fail(f"pid {pid} が居ない")
            t["pid"], t["pid_start"] = int(pid), ps[1]
        q = st["lanes"].setdefault(lane, [])
        q.append(t)
        if holder(q) is None and q[0] is t:
            t["held"] = at
            history(f"held {lane} id={t['id']} who={t['who']} purpose={t['purpose']}")
            return answer("held", ticket=t["id"], lane=lane), True
        history(f"wait {lane} id={t['id']} who={t['who']} purpose={t['purpose']}")
        return waiting(q, t, at), True

    return mutate(fn)


def op_beat(ticket: str):
    def fn(st, at, boot):
        lane, _, t = where(st, ticket)
        if t is None:
            return answer("gone", ticket=ticket, why=grave_why(st, ticket)), False
        if t["kind"] == "beat":
            t["beat"] = at
        q = st["lanes"][lane]
        if t.get("held") is not None:
            return answer("held", ticket=ticket, lane=lane), t["kind"] == "beat"
        return waiting(q, t, at), t["kind"] == "beat"

    return mutate(fn)


def op_release(ticket: str):
    def fn(st, at, boot):
        lane, i, t = where(st, ticket)
        if t is None:
            return answer("gone", ticket=ticket, why=grave_why(st, ticket)), False
        del st["lanes"][lane][i]
        if not st["lanes"][lane]:
            del st["lanes"][lane]
        st["grave"].append({"id": ticket, "lane": lane, "why": "released", "at": at, "who": t.get("who")})
        history(f"release {lane} id={ticket} who={t.get('who')}")
        return answer("released", ticket=ticket, lane=lane), True

    return mutate(fn)


def op_stop_mark(by: str, ttl: int):
    def fn(st, at, boot):
        lv = live(st, at, boot)
        if lv:
            return answer("busy", lanes={l: [brief(t, at) for t in q] for l, q in lv.items()}), False
        tok = secrets.token_hex(6)
        st["stop"] = {"token": tok, "t": at, "by": clean(by, 80), "ttl": int(max(60, min(STOP_TTL, ttl)))}
        history(f"stop-mark by={clean(by, 80)} token={tok}")
        return answer("marked", token=tok), True

    return mutate(fn)


def op_stop_unmark(token: str):
    def fn(st, at, boot):
        m = st.get("stop")
        if isinstance(m, dict) and m.get("token") == token:
            st["stop"] = None
            history(f"stop-unmark token={token}")
            return answer("unmarked", token=token), True
        return answer("gone", token=token), False

    return mutate(fn)


def read_only() -> tuple[dict, float, float, str | None]:
    st, err = load()
    return st, now(), boot_time(), err


def line_of(lane: str, q: list, at: float) -> str:
    h = holder(q)
    w = len(q) - (1 if h else 0)
    hb = brief(h, at)
    who = f"{hb['who']}（{hb['purpose']}）" if hb else "（頭の待ち人が来るまで空き）"
    return f"{lane} holder={who} waiting={w}"


def human(res: dict) -> str:
    s = res.get("state")
    if s == "held":
        return f"held {res['lane']} {res['ticket']}"
    if s == "waiting":
        h = res.get("holder")
        hs = f"{h['who']}（{h['purpose']}、{h['since'] // 60}分前から）" if h else "（すぐ空く）"
        return f"waiting {res['lane']} {res['ticket']} {res['pos']}番目。持っているのは {hs}"
    if s == "stopping":
        return f"stopping: {res.get('by')} が EC2 を止めている最中（印はあと {res.get('left')}秒）"
    if s == "busy":
        return "\n".join(f"BUSY {l} " + " / ".join(f"{t['who']}（{t['purpose']}）" for t in q) for l, q in res["lanes"].items())
    if s == "marked":
        return f"MARKED {res['token']}"
    return f"{s} {res.get('ticket') or res.get('token') or ''}".strip()


def emit(res: dict, as_json: bool) -> int:
    if as_json:
        print(MARK, json.dumps(res, ensure_ascii=False))
    else:
        print(human(res))
    return RC.get(res.get("state"), 3 if res.get("state") == "busy" else 1)


def env_with(tag: str) -> dict:
    env = dict(os.environ)
    env["EC2_QUEUE_TICKET"] = (env.get("EC2_QUEUE_TICKET", "") + " " + tag).strip()
    return env


def cmd_hold(a) -> int:
    """その pid で札を取り（待ち）、取れたらコマンドに成り代わる。pid が同じなので、コマンドが死ねば札も死ぬ"""
    if not a.cmd:
        raise Fail("hold: -- の後ろにコマンドが要る")
    pid = os.getpid()
    who = a.who or os.environ.get("EC2_QUEUE_WHO") or f"pid {pid}"
    purpose = a.purpose or " ".join(a.cmd)[:200]
    end = time.monotonic() + a.wait
    tk, said = None, None
    while True:
        r = op_take(a.lane, who, purpose, TTL, pid, tk)
        s = r["state"]
        if s == "held":
            tk = r["ticket"]
            break
        if s == "stopping":
            print(f"ec2-queue: {human(r)}。止まりきるので、起こし直してから流し直す", file=sys.stderr)
            if tk:
                op_release(tk)
            return 75
        if s == "gone":
            tk = None
        else:
            tk = r["ticket"]
            msg = human(r)
            if msg != said:
                print(f"ec2-queue: {msg}", file=sys.stderr, flush=True)
                said = msg
        if time.monotonic() > end:
            h = (r.get("holder") or {}) if s == "waiting" else {}
            if tk:
                op_release(tk)
            print(f"ec2-queue: {a.lane} が {a.wait}秒待っても空かないので諦める。持っているのは "
                  f"{h.get('who', '?')}（{h.get('purpose', '?')}）", file=sys.stderr)
            return 75
        time.sleep(2)
    try:
        os.execvpe(a.cmd[0], a.cmd, env_with(f"{a.lane}:{tk}"))
    except OSError as e:
        op_release(tk)
        raise Fail(f"hold: {a.cmd[0]} を起こせない: {e}")


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="ec2-queue")
    p.add_argument("--json", action="store_true")
    sub = p.add_subparsers(dest="op", required=True)
    t = sub.add_parser("take")
    t.add_argument("lane")
    t.add_argument("--who", default="")
    t.add_argument("--purpose", default="")
    t.add_argument("--ttl", type=int, default=TTL)
    t.add_argument("--pid", type=int)
    t.add_argument("--ticket")
    for name in ("beat", "release"):
        x = sub.add_parser(name)
        x.add_argument("ticket")
    o = sub.add_parser("owns")
    o.add_argument("ticket")
    o.add_argument("lane")
    sub.add_parser("list")
    sub.add_parser("busy")
    m = sub.add_parser("stop-mark")
    m.add_argument("--by", default="")
    m.add_argument("--ttl", type=int, default=STOP_TTL)
    u = sub.add_parser("stop-unmark")
    u.add_argument("token")
    sub.add_parser("stopping")
    h = sub.add_parser("hold")
    h.add_argument("lane")
    h.add_argument("--who", default="")
    h.add_argument("--purpose", default="")
    h.add_argument("--wait", type=int, default=1800)
    # hold のコマンドは -- の後ろ。argparse の REMAINDER は、列の後ろの --who まで飲み込むので、先に切る
    argv = list(sys.argv[1:] if argv is None else argv)
    tail = []
    if "--" in argv:
        i = argv.index("--")
        argv, tail = argv[:i], argv[i + 1:]
    a = p.parse_args(argv)
    a.cmd = tail
    try:
        if a.op == "take":
            return emit(op_take(a.lane, a.who, a.purpose, a.ttl, a.pid, a.ticket), a.json)
        if a.op == "beat":
            return emit(op_beat(a.ticket), a.json)
        if a.op == "release":
            return emit(op_release(a.ticket), a.json)
        if a.op == "stop-mark":
            return emit(op_stop_mark(a.by, a.ttl), a.json)
        if a.op == "stop-unmark":
            return emit(op_stop_unmark(a.token), a.json)
        if a.op == "hold":
            return cmd_hold(a)
        if a.op == "owns":
            st, at, boot, _ = read_only()
            q = live(st, at, boot).get(a.lane, [])
            ok = bool(q) and q[0]["id"] == a.ticket and q[0].get("held") is not None
            if a.json:
                print(MARK, json.dumps({"state": "owns" if ok else "not"}))
            return 0 if ok else 1
        if a.op == "busy":
            # idle-stop が5分ごとに聞く。**書かない**（書くと、札の置き場の新しさで上限を切る idle-stop の守りが効かなくなる）
            st, at, boot, err = read_only()
            lv = live(st, at, boot)
            if err:
                print(f"note: state {err}（誰も持っていないと読む）", file=sys.stderr)
            for lane, q in sorted(lv.items()):
                print("BUSY " + line_of(lane, q, at))
            if not lv:
                print("IDLE")
            return 0
        if a.op == "stopping":
            st, at, boot, _ = read_only()
            alive = stop_alive(st, at, boot)
            if a.json:
                print(MARK, json.dumps({"state": "stopping" if alive else "not", "stop": st.get("stop") if alive else None},
                                       ensure_ascii=False))
            elif alive:
                print(f"stopping by={st['stop'].get('by')} left={round(st['stop']['ttl'] - (at - st['stop']['t']))}s")
            return 0 if alive else 1
        if a.op == "list":
            st, at, boot, err = read_only()
            lv = live(st, at, boot)
            if a.json:
                print(MARK, json.dumps({"state": "list", "lanes": {l: [brief(t, at) for t in q] for l, q in lv.items()},
                                        "stop": st.get("stop") if stop_alive(st, at, boot) else None}, ensure_ascii=False))
                return 0
            rows = []
            for lane, q in sorted(lv.items()):
                hd = holder(q)
                if hd:
                    b = brief(hd, at)
                    exp = f"心拍が途切れて {b['expires_in']}秒で失効" if hd["kind"] == "beat" else f"pid {hd['pid']} が死ねば失効"
                    rows.append(f"{lane}: 持ち主 {b['who']}（{b['purpose']}）{b['since'] // 60}分前から・{exp}")
                else:
                    rows.append(f"{lane}: 持ち主なし（頭の待ち人が聞き直しに来れば渡る）")
                for i, w in enumerate(q[1:] if hd else q, 1):
                    b = brief(w, at)
                    rows.append(f"  待ち {i}. {b['who']}（{b['purpose']}）{b['since'] // 60}分前から")
            if stop_alive(st, at, boot):
                rows.append(f"止める印: {st['stop'].get('by')}（あと {round(st['stop']['ttl'] - (at - st['stop']['t']))}秒）")
            if err:
                rows.append(f"（置き場が {err}。誰も持っていないと読んだ）")
            print("\n".join(rows) if rows else "どの列も空いている")
            return 0
    except Fail as e:
        if a.json:
            print(MARK, json.dumps({"state": "error", "why": str(e)}, ensure_ascii=False))
        else:
            print(f"ec2-queue: {e}", file=sys.stderr)
        return 1
    return 2


if __name__ == "__main__":
    sys.exit(main())
