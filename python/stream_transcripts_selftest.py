"""**文字起こしの取り込み（`python/stream_transcripts.py`）が、分けて・待って・続きを起こす形を外さないか。**

    python3 python/stream_transcripts_selftest.py

ネットワークも鍵も要らない。BigQuery の行・YouTube の返事・Actions の run の一覧は、
こしらえたものを食わせる。

## なぜ要るか

3つに分けて並べて取り、429 では止まらず待ち、残りがあれば自分で次を起こす。
どこが崩れても**ログは緑のまま**で、崩れたことが見えない。

- 分け方が重なると、同じ配信を2つが取って manifest の回数が2つ進む
- 分け方が取りこぼすと、選んだのに誰も取らない配信が出る。**続きを起こす判定は
  「残りがある」なので、取りこぼしがあると起こし続けて止まらない**
- 429 の配信を記録すると、締め出しのあいだに「取りに行った回数」を使い切って、
  字幕があるのに諦める
- 1本も取れなかった回にも続きを起こすと、締め出しが明けるまで run が積まれ続ける
- 続きを起こすとき、同じ枠で待っている毎晩の取り込みを GitHub に消させてしまう

## 対照

`python3 python/mutation_drill.py python/stream_transcripts_selftest.py` が、隣の
`stream_transcripts.py` の比較をひっくり返して赤くなるかを見る。
"""

from __future__ import annotations

import datetime as dt
import inspect
import json
import re
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
import stream_text as st  # noqa: E402
import stream_transcripts as tr  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
ok: list[str] = []
ng: list[str] = []


def check(name: str, got, want) -> None:
    if got == want:
        ok.append(name)
        print(f"  ok  {name}")
    else:
        ng.append(f"{name}: 欲しい {want!r} / 出た {got!r}")
        print(f"  NG  {name}\n       欲しい {want!r}\n       出た   {got!r}")


def items(n: int) -> list[dict]:
    base = dt.datetime(2026, 10, 1, 11, tzinfo=dt.timezone.utc)
    return [{"video_id": f"v{i:03d}", "title": "", "start": (base - dt.timedelta(days=i)).isoformat(),
             "tries": 0} for i in range(n)]


# ---------------------------------------------------------------- 分け方

def check_split() -> None:
    print("分け方（split）")
    for n in (150, 7, 2, 1, 0):
        todo = items(n)
        parts = tr.split(todo)
        ids = [t["video_id"] for p in parts for t in p]
        check(f"{n}本: 取りこぼさない", sorted(ids), sorted(t["video_id"] for t in todo))
        check(f"{n}本: 重ならない", len(ids), len(set(ids)))
        check(f"{n}本: 空の分を作らない", all(parts), True)
        check(f"{n}本: 3つを超えない", len(parts) <= tr.SHARDS, True)
        if parts:
            sizes = [len(p) for p in parts]
            check(f"{n}本: 大きさの差は1本まで", max(sizes) - min(sizes) <= 1, True)
            order = {t["video_id"]: i for i, t in enumerate(todo)}
            check(f"{n}本: 1つの中は新しい順のまま",
                  all([order[t["video_id"]] for t in p] == sorted(order[t["video_id"]] for t in p)
                      for p in parts), True)
    parts = tr.split(items(150))
    check("150本は 50本ずつ", [len(p) for p in parts], [tr.PER_SHARD] * tr.SHARDS)
    check("新しい3本は別々の1つに散る", sorted(p[0]["video_id"] for p in parts),
          ["v000", "v001", "v002"])
    check("既定の上限は 150本", tr.SHARDS * tr.PER_SHARD, 150)


# ---------------------------------------------------------------- 選び方

def vrow(vid: str, day: int, status: str = "COMPLETED") -> dict:
    return {"video_id": vid, "title": "t", "status": status,
            "start": dt.datetime(2026, 10, day, 11, tzinfo=dt.timezone.utc)}


def check_select() -> None:
    print("選び方（select）")
    rows = [vrow("a", 1), vrow("b", 5), vrow("c", 3), vrow("d", 4, "PENDING"), vrow("e", 2),
            vrow("f", 6)]
    man = {"f": {"video_id": "f", "caption": "ok", "tries": "1"},
           "e": {"video_id": "e", "caption": "error", "tries": "3"},
           "c": {"video_id": "c", "caption": "none", "tries": "1"}}
    todo, waiting = tr.select(rows, man, None)
    check("新しい順・済みと諦めたものとチャット待ちは外す", [t["video_id"] for t in todo], ["b", "c", "a"])
    check("チャット待ちを数える", waiting, 1)
    check("取りに行った回数を引き継ぐ", [t["tries"] for t in todo], [0, 1, 0])
    todo2, _ = tr.select(rows, man, 2)
    check("count で頭から切る", [t["video_id"] for t in todo2], ["b", "c"])
    # plan と next が同じ数え方——選んだぶんを ok にしたら、残りはちょうどその分減る
    for t in todo2:
        man[t["video_id"]] = {"video_id": t["video_id"], "caption": "ok", "tries": "1"}
    left, _ = tr.select(rows, man, None)
    check("取ったぶんだけ残りが減る", [t["video_id"] for t in left], ["a"])


# ---------------------------------------------------------------- 待ち方

class Fake:
    """take の返事を配信ごとに並べておく。並びが尽きたら ok。"""

    def __init__(self, script: dict[str, list[str]], clock_step: float = 0.0):
        self.script = {k: list(v) for k, v in script.items()}
        self.taken: list[str] = []
        self.recorded: list[str] = []
        self.slept: list[float] = []
        self.now = 0.0
        self.clock_step = clock_step

    def take(self, item, n):
        vid = item["video_id"]
        self.taken.append(vid)
        self.now += self.clock_step
        seq = self.script.get(vid) or []
        why = seq.pop(0) if seq else "ok"
        return {"ok": True} if why == "ok" else {"ok": False, "why": why}

    def record(self, item, cap):
        self.recorded.append(item["video_id"])
        caption = "ok" if cap.get("ok") else ("none" if cap["why"] == "ja の字幕が無い" else "error")
        return {"caption": caption, "note": cap.get("why", ""), "chars": 0, "chat_count": 0,
                "tries": item["tries"] + 1}

    def sleep(self, s):
        self.slept.append(s)
        self.now += s

    def clock(self):
        return self.now


def run(f: Fake, todo, **kw):
    return tr.drive(todo, f.take, f.record, sleep=f.sleep, clock=f.clock, pause=1,
                    log=lambda s: None, **kw)


def check_drive() -> None:
    print("429 で止めない（drive）")
    todo = items(4)
    f = Fake({})
    res = run(f, todo)
    check("全部取れたら全部書く", f.recorded, ["v000", "v001", "v002", "v003"])
    check("全部取れた回は止めない", res["stopped"], "")
    check("あけるのは1本ごとの間だけ", f.slept, [1, 1, 1, 1])

    f = Fake({"v001": ["429", "ボット確認", "ok"]})
    res = run(f, todo)
    check("429・ボット確認は待って同じ配信を取り直す", f.taken,
          ["v000", "v001", "v001", "v001", "v002", "v003"])
    check("待つのは 60→120 と倍々", [s for s in f.slept if s > 1], [60, 120])
    check("取り直して取れたら、1回だけ書く", f.recorded, ["v000", "v001", "v002", "v003"])
    check("取り直して取れたら止めない", res["stopped"], "")
    check("待った秒を数える", res["waited"], 180)

    f = Fake({"v001": ["429"] * 10})
    res = run(f, todo)
    check("待ち切っても続いたら、その1つの残りを次回に回す", f.recorded, ["v000"])
    check("回したものは取りに行かない", "v002" in f.taken, False)
    check("待つのは決めた段だけ", [s for s in f.slept if s > 1], list(tr.BACKOFF))
    check("回した本数", res["deferred"], 3)
    check("止めた理由が出る", "次回" in res["stopped"], True)
    check("待つ段は上限を持つ", 0 < len(tr.BACKOFF) and sum(tr.BACKOFF) <= 30 * 60, True)

    f = Fake({"v000": ["ja の字幕が無い"], "v001": ["どの口も通らなかった"]})
    run(f, todo)
    check("締め出しでない失敗は待たずに書いて進む", f.recorded, ["v000", "v001", "v002", "v003"])
    check("締め出しでない失敗では待たない", [s for s in f.slept if s > 1], [])

    f = Fake({}, clock_step=10)
    res = run(f, todo, deadline=20)
    check("持ち時間を過ぎたら新しい配信に手を付けない", f.recorded, ["v000", "v001"])
    check("持ち時間で止めた残りは次回", res["deferred"], 2)

    f = Fake({"v000": ["429"] * 10})
    res = run(f, todo, deadline=100)
    check("持ち時間を越える待ちはしない", [s for s in f.slept if s > 1], [60])
    check("持ち時間で待てないときは書かずに回す", f.recorded, [])

    f = Fake({})
    res = run(f, todo, gate_wait=lambda n: SimpleNamespace(ok=n < 2, how="timeout"))
    check("Cookie を使い始めなかったら、そこから後ろは書かない", f.recorded, ["v000", "v001"])
    check("throttled は 429 の言い方を全部拾う",
          [tr.throttled({"ok": False, "why": w}) for w in ("429", "429（取りすぎ）", "ボット確認",
                                                         "ja の字幕が無い")]
          + [tr.throttled({"ok": True}), tr.throttled(None)],
          [True, True, True, False, False, False])


# ---------------------------------------------------------------- 集め方

def check_merge() -> None:
    print("集め方（merge）")
    with tempfile.TemporaryDirectory() as d:
        d = Path(d)
        streams, man = d / "streams", d / "streams/manifest.tsv"
        st.write_manifest(man, {"old": {"video_id": "old", "start_jst": "2026-01-01 20:00",
                                        "caption": "ok", "tries": "1"}})
        (streams / "2026/01").mkdir(parents=True)
        note = streams / "2026/01/2026-01-01_2000_old.md"
        note.write_text("人が書いた議事録", encoding="utf-8")
        got = d / "got"
        for i, vid in enumerate(("a", "b")):
            s = got / f"shard-{i}" / "streams/2026/10"
            s.mkdir(parents=True)
            (s / f"2026-10-0{i + 1}_2000_{vid}.transcript.txt").write_text("t", encoding="utf-8")
            (s / f"2026-10-0{i + 1}_2000_{vid}.chat.txt").write_text("c", encoding="utf-8")
            (got / f"shard-{i}/rows.json").write_text(json.dumps([
                {"video_id": vid, "start_jst": f"2026-10-0{i + 1} 20:00", "caption": "ok" if i else "none",
                 "tries": 1, "stem": f"2026/10/2026-10-0{i + 1}_2000_{vid}"}]), encoding="utf-8")
        # 取り込みの側が議事録を持ってきても、置かない
        (got / "shard-0/streams/2026/01").mkdir(parents=True)
        (got / "shard-0/streams/2026/01/2026-01-01_2000_old.md").write_text("上書き", encoding="utf-8")
        # 落ちた1つ（rows.json が壊れている）は、ほかを止めない
        (got / "shard-2").mkdir()
        (got / "shard-2/rows.json").write_text("{", encoding="utf-8")
        res = tr.merge([got], streams, man)
        back = st.read_manifest(man)
        check("全部の1つから行を足す", sorted(back), ["a", "b", "old"])
        check("前からの行は残す", back["old"]["caption"], "ok")
        check("字幕とチャットのファイルを置く", res["files"], 4)
        check("ok を数える（続きの判定に使う）", res["tally"]["ok"], 1)
        check("議事録（.md）は上書きしない", note.read_text(encoding="utf-8"), "人が書いた議事録")
        check("置いたファイルが在る",
              (streams / "2026/10/2026-10-02_2000_b.transcript.txt").exists(), True)


# ---------------------------------------------------------------- 続きを起こすか

def check_chain() -> None:
    print("続きを起こすか（should_chain）")
    check("残りがあって1本以上取れたら起こす", tr.should_chain(10, 1)[0], True)
    check("残り0なら起こさない", tr.should_chain(0, 30)[0], False)
    check("1本も取れなかったら起こさない", tr.should_chain(10, 0)[0], False)
    check("同じ枠で待っている run がいたら起こさない",
          tr.should_chain(10, 3, [{"workflow": "schedule_fetch_chat.yml", "id": 1}])[0], False)
    check("待っている run が読めないなら起こさない", tr.should_chain(10, 3, [], "HTTP 403")[0], False)

    sharers = tr.slot_sharers()
    check("枠を使う毎晩の取り込みを拾う", "schedule_fetch_chat.yml" in sharers, True)
    check("自分は数えない", tr.WORKFLOW in sharers, False)
    with tempfile.TemporaryDirectory() as d:
        d = Path(d)
        (d / "a.yml").write_text("concurrency:\n  group: fetch-chat-${{ github.ref }}\n")
        (d / "b.yml").write_text("# group: fetch-chat-x はコメントだけ\nname: b\n")
        (d / "c.yml").write_text("concurrency:\n  group: other\n")
        check("コメントだけのものと別の枠は数えない", tr.slot_sharers(d, set()), ["a.yml"])

    runs = {"x.yml": [{"id": 1, "status": "pending", "head_branch": "master"},
                      {"id": 2, "status": "in_progress", "head_branch": "master"},
                      {"id": 3, "status": "queued", "head_branch": "feature"},
                      {"id": 4, "status": "completed", "head_branch": "master"},
                      {"id": 5, "status": "waiting", "head_branch": "master"}]}
    got = tr.slot_waiting(["x.yml"], lambda wf: runs[wf], "master")
    check("同じ枝で枠の空きを待っているものだけ", [r["id"] for r in got], [1, 5])


# ---------------------------------------------------------------- Cookie を握る job

def check_cookie_jobs() -> None:
    print("Cookie を握る job だけを待つ（job_aware）")
    wf_dir = ROOT / ".github/workflows"
    # 実物の置き場から。ショートの取り込みが Cookie を握るのは captions（字幕だけの道。#1014）と
    # fetch だけ（解析は握らない）
    check("ショートの取り込みで握るのは captions と fetch だけ",
          tr.cookie_jobs(wf_dir / "shorts_ingest.yml"), ["captions", "fetch"])
    check("毎晩の取り込みで握るのは fetch_chat_data だけ",
          tr.cookie_jobs(wf_dir / "schedule_fetch_chat.yml"), ["fetch_chat_data"])
    with tempfile.TemporaryDirectory() as d:
        d = Path(d)
        (d / "a.yml").write_text("jobs:\n  x:\n    name: ${{ matrix.k }}\n"
                                 "    env:\n      C: ${{ secrets.YOUTUBE_COOKIES }}\n")
        check("名前が式の job は見分けられない", tr.cookie_jobs(d / "a.yml"), [None])
        (d / "b.yml").write_text("env:\n  C: ${{ secrets.YOUTUBE_COOKIES }}\njobs:\n  x:\n    runs-on: u\n")
        check("頭で読むものは、どの job とも言えない", tr.cookie_jobs(d / "b.yml"), [None])
        (d / "c.yml").write_text("jobs:\n  x:\n    runs-on: u  # YOUTUBE_COOKIES はコメントだけ\n")
        check("コメントだけのものは握らない", tr.cookie_jobs(d / "c.yml"), [])

    done = {"status": "completed", "conclusion": "success"}
    # captions の job は依頼に字幕だけの道が無い回も、skipped（status は completed）で一覧に出る
    shorts = [{"name": "plan", **done}, {"name": "captions", "status": "completed", "conclusion": "skipped"},
              {"name": "fetch", **done}, {"name": "VusdZVyjgjQ__archive", "status": "in_progress"}]
    check("握る job が終わって解析だけ動いている run は待たない", tr.holds_cookie(shorts, ["fetch"]), False)
    check("握る job が動いていたら待つ",
          tr.holds_cookie([{"name": "plan", **done}, {"name": "fetch", "status": "in_progress"}], ["fetch"]),
          True)
    check("握る job がまだ一覧に無い（前の job が動いている）なら待つ",
          tr.holds_cookie([{"name": "plan", "status": "in_progress"}], ["fetch"]), True)
    check("並べた job は1つでも動いていたら待つ",
          tr.holds_cookie([{"name": "fetch (0)", **done}, {"name": "fetch (1)", "status": "queued"}],
                          ["fetch"]), True)
    check("並べた job が全部終わったら待たない",
          tr.holds_cookie([{"name": "fetch (0)", **done}, {"name": "fetch (1)", **done}], ["fetch"]), False)
    check("似た名前の別の job を握る job と数えない",
          tr.holds_cookie([{"name": "fetcher", **done}], ["fetch"]), True)
    check("見分けられない job があれば待つ", tr.holds_cookie(shorts, ["fetch", None]), True)
    check("握る job が分からないワークフローは待つ", tr.holds_cookie(shorts, []), True)
    check("job が読めなければ待つ", tr.holds_cookie(None, ["fetch"]), True)

    runs = {"s.yml": [{"id": 1, "status": "in_progress"}, {"id": 2, "status": "queued"},
                      {"id": 3, "status": "completed"}, {"id": 4, "status": "pending"}]}
    jobs = {1: shorts, 2: [], 3: shorts, 4: []}
    w = tr.job_aware(lambda wf: runs[wf], lambda rid: jobs.get(rid), lambda wf: ["fetch"])
    check("動いている run のうち、握り終えたものだけ外す", [r["id"] for r in w("s.yml")], [2, 3, 4])
    w = tr.job_aware(lambda wf: runs[wf], lambda rid: None, lambda wf: ["fetch"])
    check("job が読めない run は外さない", [r["id"] for r in w("s.yml")], [1, 2, 3, 4])

    # gate.py の数え方に通して、2026-10-22 の晩の形で「待たない」になるか
    gate = tr._load("gate", ROOT / "tools/shorts/ingest/gate.py")
    live = {"shorts_ingest.yml": [{"id": 9, "status": "in_progress", "head_branch": "work"}]}
    plain = gate.scan(["shorts_ingest.yml"], lambda wf: live[wf], "", False)["busy"]
    aware = gate.scan(["shorts_ingest.yml"],
                      tr.job_aware(lambda wf: live[wf], lambda rid: shorts,
                                   lambda wf: tr.cookie_jobs(wf_dir / wf)), "", False)["busy"]
    check("run で見ると解析のあいだ待つ（直す前の形）", len(plain), 1)
    check("job で見ると解析のあいだは待たない", len(aware), 0)
    # 部品が正しくても、fetch が gate に渡していなければ前と同じに待つ
    src = inspect.getsource(tr.fetch)
    check("fetch は job まで見る一覧を gate に渡す",
          [bool(re.search(r"job_aware\(\s*gate_mod\.api_lister\(", src)),
           bool(re.search(r"jobs_lister\(repo, token, api\)", src))], [True, True])


# ---------------------------------------------------------------- ワークフロー

def check_workflow() -> None:
    print("ワークフロー（stream_transcripts.yml）")
    wf = yaml.safe_load((ROOT / ".github/workflows" / tr.WORKFLOW).read_text(encoding="utf-8"))
    on = wf.get(True) or wf.get("on")
    jobs = wf["jobs"]
    check("job は plan / fetch / commit", sorted(jobs), ["commit", "fetch", "plan"])
    strat = jobs["fetch"].get("strategy", {})
    check("並べるのは3つまで", strat.get("max-parallel"), tr.SHARDS)
    check("1つが落ちてもほかを止めない", strat.get("fail-fast"), False)
    check("集める job は落ちた1つがあっても走る", "!cancelled()" in str(jobs["commit"].get("if")), True)
    check("続きを起こす権限", wf.get("permissions", {}).get("actions"), "write")
    inputs = on["workflow_dispatch"]["inputs"]
    check("既定の本数は 150", str(inputs["count"]["default"]), "150")
    check("chain の入力がある", "chain" in inputs, True)
    check("毎晩の取り込みの完了に繋いだまま", on["workflow_run"]["workflows"], ["Fetch YouTube Chat Data"])
    steps = " ".join(str(s.get("run", "")) for s in jobs["commit"]["steps"])
    check("自分をもう一度起こす", f"gh workflow run {tr.WORKFLOW}" in steps, True)
    check("コミットは集める job の1か所だけ",
          [j for j, v in jobs.items() if "git commit" in " ".join(str(s.get("run", ""))
                                                                  for s in v["steps"])], ["commit"])
    check("枠は毎晩の取り込みと同じ", wf["concurrency"]["group"], "fetch-chat-${{ github.ref }}")


def main() -> int:
    check_split()
    check_select()
    check_drive()
    check_merge()
    check_chain()
    check_cookie_jobs()
    check_workflow()
    print(f"\n対照 {len(ok) + len(ng)}件中 {len(ok)}件通った")
    for line in ng:
        print(f"::error::{line}")
    if not ok:
        print("::error::対照が0件です")
        return 1
    return 1 if ng else 0


if __name__ == "__main__":
    sys.exit(main())
