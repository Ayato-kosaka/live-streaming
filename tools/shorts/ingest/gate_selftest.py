"""Cookie を使い始めてよいか（gate.py）の見張り。**YouTube にも GitHub にも触らない。**

    python3 tools/shorts/ingest/gate_selftest.py

回し役（`python/selftest_runner.py`）が `tools/shorts/` を降りて拾う。Actions の API は
偽物（時刻ごとに run の一覧を返す関数）で、時計も偽物（sleep で進む）なので一瞬で終わる。
要るのは openssl（plan に渡す公開鍵）と PyYAML（ワークフローを読む）。どちらも Selftests に在る。

## 何を見るか

gate.py は「毎晩の取り込みとぶつからないか」を決める唯一の場所。ここが緩むと
Cookie を2か所で同時に握り、きつすぎると空いている時間まで止める（時計の枠がそれで、
2026-10-18 に20:25 の依頼を 00:00 まで止めた）。だから両側を当てる。

- 動いていない → すぐ通る（待たない）
- `queued` / `in_progress` → 待って、終わったら通る
- 60分待っても終わらない → 止まる（それ以上は待たない）
- Actions が読めない → 時計の枠に戻る（枠の中なら止める・外なら通る）。1回だけの通信落ちでは戻らない
- 動いていると読めたあとに読めなくなった → 「終わった」とみなさず待ち続ける
- 見るワークフローが0本 → 「動いていない」と読まず、時計の枠に戻る
- `pending` は plan では待ち、fetch の job の中では数えない（互いに待って止まらない）
- 自分の run は数えない・待ちの持ち時間は1つの Gate で使い回す
- 一覧: コメントでない行に `YOUTUBE_COOKIES` が在るものだけ。自分を除く。
  `grep -l YOUTUBE_COOKIES` との差は、全部「コメントでしか名前を出していない」もの
- plan.py と download.py が本当にここを通る（時計を直に見ない）。
  ワークフローが `actions: read` と `GH_TOKEN` を渡している（渡さないと毎回 403 で時計に戻り、
  **緑のまま何も見ていない**ことになる）
"""

from __future__ import annotations

import ast
import datetime as dt
import json
import os
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import gate  # noqa: E402

WF = ["clip_fetch.yml", "schedule_fetch_chat.yml", "yt_comments_pull.yml"]
OUT_OF_BAND = dt.datetime(2026, 10, 18, 20, 25, tzinfo=dt.timezone.utc)
IN_BAND = dt.datetime(2026, 10, 18, 22, 0, tzinfo=dt.timezone.utc)


def run(wid: int, status: str, wf_branch: str = "master") -> dict:
    return {"id": wid, "status": status, "head_branch": wf_branch,
            "run_started_at": "2026-10-18T22:08:54Z"}


class Fake:
    """偽の時計と偽の Actions。`states(t, wf)` が時刻 t の run の一覧を返す（例外も投げられる）。"""

    def __init__(self, states, now=OUT_OF_BAND):
        self.t = 0.0
        self.states = states
        self.sleeps: list[float] = []
        self.calls = 0
        self.wall = now
        self.lines: list[str] = []

    def lister(self, wf: str) -> list:
        self.calls += 1
        return self.states(self.t, wf)

    def sleep(self, s: float) -> None:
        self.sleeps.append(s)
        self.t += s

    def gate(self, workflows=WF, **kw) -> gate.Gate:
        return gate.Gate(workflows, self.lister, clock=lambda: self.t, sleep=self.sleep,
                         now=lambda: self.wall, log=self.lines.append, **kw)


def idle(t, wf):
    return [run(1, "completed")]


def busy_until(sec: float, status: str = "in_progress", wf_name: str = "schedule_fetch_chat.yml"):
    def f(t, wf):
        if wf == wf_name and t < sec:
            return [run(9, status), run(1, "completed")]
        return [run(1, "completed")]
    return f


def unreadable(t, wf):
    raise gate.Unreadable(f"{wf} が HTTP 403")


def main() -> int:
    fails: list[str] = []

    def check(ok: bool, what: str) -> None:
        print(f"{'ok' if ok else 'NG'}  {what}")
        if not ok:
            fails.append(what)

    # --- 動いていない → すぐ通る
    f = Fake(idle)
    v = f.gate().wait()
    check(v.ok and v.how == "clear" and not f.sleeps and "動いていない → 通る" in v.why,
          f"動いていない → 待たずに通る（{v.how}・sleep {len(f.sleeps)}回）")

    # --- queued / in_progress → 待つ → 終わったら通る
    for st, sec in (("queued", 300), ("in_progress", 720), ("requested", 60)):
        f = Fake(busy_until(sec, st))
        v = f.gate().wait()
        check(v.ok and v.how == "clear" and abs(v.waited - sec) < 1 and "終わった" in v.why,
              f"{st} が {sec // 60}分 → 待ってから通る（待った {v.waited:g}秒）")
        check(all(s <= gate.EVERY for s in f.sleeps) and any("待つ" in s for s in f.lines),
              f"{st}: 1分ごとに見直し、待っていることをログに出す")

    # --- 待ち切れ → 止まる（60分を超えて待たない）
    f = Fake(busy_until(10 ** 9))
    v = f.gate().wait()
    check(not v.ok and v.how == "timeout" and "止める" in v.why,
          f"in_progress のまま → 止まる（{v.how}）")
    check(abs(v.waited - gate.MAX_WAIT) < 1 and abs(sum(f.sleeps) - gate.MAX_WAIT) < 1,
          f"待つのは {gate.MAX_WAIT // 60}分ちょうどまで（待った {v.waited:g}秒）")
    check("schedule_fetch_chat.yml #9" in v.why, "止めた理由に、どの run が動いていたかが出る")

    # --- Actions が読めない → 時計の枠に戻る
    f = Fake(unreadable, now=OUT_OF_BAND)
    v = f.gate().wait()
    check(v.ok and v.how == "clock-go", f"読めない・20:25 UTC（枠の外）→ 時計で通る（{v.how}）")
    check(f.calls == gate.FIRST_TRIES, f"時計に戻る前に {gate.FIRST_TRIES}回読み直す（{f.calls}回）")
    f = Fake(unreadable, now=IN_BAND)
    v = f.gate().wait()
    check(not v.ok and v.how == "clock-stop" and "止める" in v.why,
          f"読めない・22:00 UTC（枠の中）→ 時計で止める（{v.how}）")

    # --- 1回だけの通信落ちでは時計に戻らない
    def flaky(t, wf):
        if t < gate.RETRY_SEC:
            raise gate.Unreadable("URLError")
        return idle(t, wf)
    f = Fake(flaky, now=IN_BAND)
    v = f.gate().wait()
    check(v.ok and v.how == "clear", f"1回だけ読めない → 読み直して Actions で決める（{v.how}）")

    # --- 動いていると読めたあとで読めなくなった → 待ち続ける（枠の外でも通さない）
    def busy_then_dark(t, wf):
        if t < 120:
            return busy_until(10 ** 9)(t, wf)
        raise gate.Unreadable("HTTP 502")
    f = Fake(busy_then_dark, now=OUT_OF_BAND)
    v = f.gate().wait()
    check(not v.ok and v.how == "timeout",
          f"動いている → 読めなくなった → 終わったとみなさず待ち切れで止める（{v.how}）")

    # --- 見るワークフローが0本 → 時計の枠に戻る（「動いていない」と読まない）
    f = Fake(idle, now=IN_BAND)
    v = f.gate(workflows=[]).wait()
    check(not v.ok and v.how == "clock-stop", f"0本・枠の中 → 止める（{v.how}）")
    f = Fake(idle, now=OUT_OF_BAND)
    v = f.gate(workflows=[]).wait()
    check(v.how == "clock-go", f"0本・枠の外 → 時計で通る。clear にはしない（{v.how}）")

    # --- pending: plan では待つ、fetch の job の中では数えない
    f = Fake(busy_until(300, "pending"))
    v = f.gate(count_pending=True).wait()
    check(v.ok and abs(v.waited - 300) < 1, f"plan: pending は待つ（待った {v.waited:g}秒）")
    f = Fake(busy_until(10 ** 9, "pending"))
    v = f.gate(count_pending=False).wait()
    check(v.ok and v.waited == 0 and any("数えない" in s for s in f.lines),
          "fetch: pending は数えない（こちらを待っている run を待って止まらない）")

    # --- 自分の run は数えない
    f = Fake(lambda t, wf: [run(42, "in_progress")])
    v = f.gate(own_run="42").wait()
    check(v.ok and v.waited == 0, "自分の run（GITHUB_RUN_ID）は数えない")

    # --- 待ちの持ち時間は1つの Gate で使い回す（download.py が1本ごとに待っても合わせて60分）
    f = Fake(busy_until(50 * 60))
    g = f.gate()
    v1 = g.wait()
    f.states = lambda t, wf: [run(7, "in_progress", "claude/x")]
    v2 = g.wait()
    check(v1.ok and not v2.ok and abs(v2.waited - 10 * 60) < 1,
          f"50分待ったあと、2回目は残りの10分で止まる（2回目 {v2.waited:g}秒）")

    # --- 一覧: 偽の置き場で、コメント・シェルのコメント・自分・.yaml を見分ける
    with tempfile.TemporaryDirectory() as td:
        d = Path(td) / gate.WF_DIR
        d.mkdir(parents=True)
        (d / "uses.yml").write_text("env:\n  CK: ${{ secrets.YOUTUBE_COOKIES }}\n")
        (d / "uses_tail.yml").write_text("  cookies: ${{ secrets.YOUTUBE_COOKIES }} # 説明\n")
        (d / "writes.yaml").write_text("  cookies_secret_name: YOUTUBE_COOKIES\n")
        (d / "comment.yml").write_text("# YOUTUBE_COOKIES を書き換えるので触らない\n"
                                       "      # あちらは YOUTUBE_COOKIES を\n")
        (d / "shell_comment.yml").write_text("run: |\n  # YOUTUBE_COOKIES は読まない\n"
                                             "  echo \"${key#YOUTUBE}\"\n")
        (d / "shorts_ingest.yml").write_text("CK: ${{ secrets.YOUTUBE_COOKIES }}\n")
        (d / "other.yml").write_text("name: x\n")
        got = gate.cookie_workflows(Path(td), exclude={"shorts_ingest.yml"})
        check(got == ["uses.yml", "uses_tail.yml", "writes.yaml"],
              f"偽の置き場: 使うものだけ・自分とコメントを除く（{got}）")

    # --- 一覧: 本物の置き場。毎晩の取り込みが入り、自分が入らず、grep -l との差はコメントだけ
    real = gate.cookie_workflows()
    check("schedule_fetch_chat.yml" in real, f"本物: 毎晩の取り込みを見ている（{real}）")
    check(gate.SELF not in real, "本物: 自分（shorts_ingest.yml）を数えない")
    wfdir = gate.ROOT / gate.WF_DIR
    raw = sorted(p.name for p in list(wfdir.glob("*.yml")) + list(wfdir.glob("*.yaml"))
                 if gate.SECRET in p.read_text(encoding="utf-8"))
    extra = sorted(set(raw) - set(real) - {gate.SELF})
    # 別の読みかた（行頭の # だけ）で「コメントでしか出していない」を確かめる
    only_comment = [n for n in extra
                    if all(ln.lstrip().startswith("#")
                           for ln in (wfdir / n).read_text(encoding="utf-8").splitlines()
                           if gate.SECRET in ln)]
    check(extra == only_comment and not set(real) - set(raw),
          f"本物: grep -l {gate.SECRET} との差（{extra}）は、全部コメントでしか名前を出していない")

    # --- plan.py と download.py が本当にここを通る
    for stem in ("plan", "download"):
        name = f"{stem}.py"
        src = (HERE / name).read_text(encoding="utf-8")
        names = {n.id for n in ast.walk(ast.parse(src)) if isinstance(n, ast.Name)}
        check("in_no_go" not in names and "Gate" in names,
              f"{name}: 時計（in_no_go）を直に見ず、gate.Gate を通る")
    check_plan(check)
    check_download(check)
    check_workflow(check)

    print(f"\nNG  gate の見張り {len(fails)}件落ちた" if fails else "\nOK  gate の見張り 全部通った")
    return 1 if fails else 0


class StubGate:
    """plan / download に差し込む偽の Gate。決まった判定を返し、呼ばれた回数を数える。"""

    def __init__(self, verdict: gate.Verdict):
        self.verdict = verdict
        self.workflows = WF
        self.calls = 0

    def heading(self) -> str:
        return "見るワークフロー（偽）"

    def wait(self) -> gate.Verdict:
        self.calls += 1
        return self.verdict


def check_plan(check) -> None:
    """plan.main が、判定が「止める」なら出力を書かずに 1 で帰り、「通る」なら書く。"""
    import plan
    from plan_selftest import pubkey  # 鍵の作りかたは plan の見張りと同じものを借りる
    pem = pubkey()
    with tempfile.TemporaryDirectory() as td:
        env ={"GITHUB_EVENT_NAME": "workflow_dispatch", "IN_MODE": "zoom",
               "IN_VIDEOS": "yk-by7R7iPA", "IN_RANGE": "0:12:00-0:12:30", "IN_FPS": "1",
               "IN_PUBKEY": pem, "IN_BRANCH": "claude/selftest"}
        old_env = {k: os.environ.get(k) for k in [*env, "GITHUB_OUTPUT"]}
        old_gate = plan.Gate
        try:
            for ok, how in ((False, "timeout"), (True, "clear")):
                out = Path(td) / f"out-{how}"
                out.write_text("")
                os.environ.update(env, GITHUB_OUTPUT=str(out))
                stub = StubGate(gate.Verdict(ok, how, f"偽の判定（{how}）"))
                plan.Gate = type("G", (), {"from_env": staticmethod(lambda **kw: stub)})
                rc = plan.main()
                text = out.read_text()
                if ok:
                    check(rc == 0 and stub.calls == 1 and "count=1" in text,
                          f"plan: 判定が通るなら、出力を書いて 0（rc={rc}）")
                else:
                    check(rc == 1 and stub.calls == 1 and text == "",
                          f"plan: 判定が止めるなら、出力を書かずに 1（rc={rc}・出力 {len(text)}字）")
        finally:
            plan.Gate = old_gate
            for k, val in old_env.items():
                if val is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = val


def check_download(check) -> None:
    """download.main が、判定が「止める」なら YouTube に当たりに行かず、理由を fetch.json に残す。"""
    import download
    with tempfile.TemporaryDirectory() as td:
        items = Path(td) / "items.json"
        items.write_text(json.dumps({"include": [
            {"key": "yk-by7R7iPA__archive", "mode": "archive", "video": "yk-by7R7iPA"}]}))
        media = Path(td) / "media"
        stub = StubGate(gate.Verdict(False, "timeout", "60分待っても終わらない: 偽 → 止める"))
        touched: list[str] = []
        old = (download.Gate, download.find_client, sys.argv)
        try:
            download.Gate = type("G", (), {"from_env": staticmethod(lambda **kw: stub)})
            download.find_client = lambda *a, **kw: touched.append("find_client") or (None, "x")
            sys.argv = [download.__file__, str(items), str(media)]
            download.main()
        finally:
            download.Gate, download.find_client, sys.argv = old
        st = json.loads((media / "yk-by7R7iPA__archive" / "fetch.json").read_text())
        check(stub.calls == 1 and not touched and st.get("ok") is False
              and "Cookie を使い始めなかった" in (st.get("why") or ""),
              f"download: 判定が止めるなら YouTube に当たらず、理由を残す（当たった {len(touched)}回）")


def check_workflow(check) -> None:
    """shorts_ingest.yml が、plan と fetch に actions: read と GH_TOKEN を渡している。"""
    import yaml

    doc = yaml.safe_load((gate.ROOT / gate.WF_DIR / gate.SELF).read_text(encoding="utf-8"))
    top = doc.get("permissions") or {}
    jobs = doc.get("jobs") or {}
    for job, step_name in (("plan", "依頼を読む"), ("fetch", "1本ずつ取る")):
        j = jobs.get(job) or {}
        perm = j.get("permissions", top) or {}
        steps = [s for s in j.get("steps") or [] if s.get("name") == step_name]
        env = (steps[0].get("env") or {}) if steps else {}
        check(perm.get("actions") in ("read", "write") and "GH_TOKEN" in env,
              f"ワークフロー: {job} に actions: read と GH_TOKEN（{step_name}）が在る"
              f"（actions={perm.get('actions')}・GH_TOKEN {'あり' if 'GH_TOKEN' in env else 'なし'}）")


if __name__ == "__main__":
    sys.exit(main())
