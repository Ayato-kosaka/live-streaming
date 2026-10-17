"""`python/heavy_down.py` の見張り。

    python3 python/heavy_down_selftest.py

## 何を守っているか

**「master が赤いまま誰も知らない」を作らないこと。** `browserwatch` と
`reachwatch` を PR の通り道から外した（#273）ので、赤くなる場所が
master の Actions 一覧だけになった。あの一覧の赤は「起きたこと」であって
「いま残っていること」ではない——だから issue 1本に映す。

ここが黙って効かなくなる道が3つある。どれも**赤くならずに**効かなくなる。

  1. **結果が1つも渡らない**（ワークフローの env を書き換えた）
     → 空を緑に倒すと、開いている issue を「直った」と言って閉じる
  2. **job の名前を変えた**（`reachwatch` → `reach_watch` など）
     → `needs.*.result` が別名で来て、表に無い job として素通りする
  3. **`cancelled` を緑に倒す**（ランナーが死んだ晩）
     → 落ちているかを読めなかった晩に、issue を閉じる

1と3は下の [2]、2は [5]（**本物の `heavy_watch.yml` を読む**）で見ている。

## 対照（`BREAK=`）

  empty   … 結果が空のとき緑に倒す → [2] が落ちる
  cancel  … `cancelled` を緑に数える → [2] が落ちる
  nowire  … 見る先を在りもしないワークフローにする → [5] が落ちる
            （**本物のファイルを読んでいる**ことの裏取り）

終了コード 0=通った / 1=落ちた。
"""

import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
sys.path.insert(0, str(HERE))

import heavy_down as H  # noqa: E402

BREAK = os.environ.get("BREAK", "")
bad = 0
checks = 0

# **対照：仕込みを先に刺す。** 本物の表を見る前に、判定の足を折っておく
if BREAK == "empty":
    H.assess = lambda results: {"down": False, "red": [], "results": results}
if BREAK == "cancel":
    H.GREEN = ("success", "cancelled")
if BREAK == "nowire":
    H.WORKFLOW_FILE = "heavy_watch_nope.yml"


def ok(name, got, want):
    global bad, checks
    checks += 1
    good = got == want
    print(f"  {'○' if good else '✕'} {name}: {got}"
          + ("" if good else f"（欲しかったのは {want}）"))
    if not good:
        bad += 1
        print(f"::error::{name}: 出た={got} / 欲しかったのは={want}")


class FakeGh:
    """`run_watch.Gh` と同じ口を持つ偽物。**1バイトも外に出ない。**"""

    def __init__(self, issues=None):
        self.issues = issues or []
        self.did = []

    def list_issues(self, label):
        return self.issues

    def create(self, title, text, label):
        self.did.append(("create", title, text))
        return {"number": 999}

    def patch(self, number, payload):
        self.did.append(("patch", number, payload))
        return {"number": number}


print("[1] 結果の字を読む")
ok("2本ぶん読める", H.parse_results("browserwatch=success,reachwatch=failure"),
   {"browserwatch": "success", "reachwatch": "failure"})
ok("空は空", H.parse_results(""), {})
# **読めない字を捨てない。** 捨てると「見る相手が0本」＝緑に化ける
ok("= の無い字も残す", H.parse_results("browserwatch"), {"browserwatch": "?"})

print("[2] 赤い／通っている／分からない の仕分け")
CASES = [
    ({"browserwatch": "success", "reachwatch": "success"}, False, "両方とおった"),
    ({"browserwatch": "failure", "reachwatch": "success"}, True, "片方が赤い"),
    ({"browserwatch": "success", "reachwatch": "timed_out"}, True, "打ち切りも赤"),
    # **ここが肝。** 読めなかった晩に緑へ倒すと、issue を閉じにいく
    ({"browserwatch": "cancelled", "reachwatch": "success"}, None, "打ち切られた"),
    ({"browserwatch": "skipped", "reachwatch": "skipped"}, None, "走っていない"),
    ({}, None, "**結果が1つも渡っていない**"),
    ({"browserwatch": "?"}, None, "読めない字"),
]
for results, want, why in CASES:
    ok(why, H.assess(results)["down"], want)

print("[3] 赤い job の名前が、本文に出る")
a = H.assess({"browserwatch": "failure", "reachwatch": "failure"})
text = H.body(a, "https://example.invalid/run/1")
ok("印が入っている", H.MARK in text, True)
for j in ("browserwatch", "reachwatch"):
    ok(f"{j} が名指しされている", f"`{j}`" in text, True)
# **毎回変わる字を入れない。** 入れると毎晩「編集しました」が積まれる
ok("run の URL は本文に入れない", "example.invalid" in text, False)
ok("2回組んでも同じ字", H.body(a, "x") == H.body(a, "y"), True)

print("[4] issue をどう動かすか")
red = H.assess({"browserwatch": "failure", "reachwatch": "success"})
green = H.assess({"browserwatch": "success", "reachwatch": "success"})
unknown = H.assess({"browserwatch": "cancelled", "reachwatch": "success"})
want_red = H.body(red, "")

g = FakeGh([])
ok("赤くて issue が無い → 開く", H.run(g, red, "", apply=True)["action"], "create")
ok("  実際に1本 開いた", [d[0] for d in g.did], ["create"])

g = FakeGh([{"number": 7, "state": "open", "body": want_red, "labels": []}])
ok("赤くて本文も同じ → 触らない", H.run(g, red, "", apply=True)["action"], "noop")
ok("  1バイトも書いていない", g.did, [])

g = FakeGh([{"number": 7, "state": "closed", "body": want_red, "labels": []}])
ok("赤くて閉じている → 同じ1本を開け直す",
   H.run(g, red, "", apply=True)["action"], "reopen")

g = FakeGh([{"number": 7, "state": "open", "body": want_red, "labels": []}])
ok("通った → 閉じる", H.run(g, green, "", apply=True)["action"], "close")

g = FakeGh([{"number": 7, "state": "open", "body": want_red, "labels": []}])
ok("**分からない → 開きも閉じもしない**",
   H.run(g, unknown, "", apply=True)["action"], "noop")
ok("  1バイトも書いていない", g.did, [])

g = FakeGh([])
ok("--apply が無ければ書かない", H.run(g, red, "", apply=False)["action"], "dry")
ok("  それでも issue は読みにいく（道が生きているか）", g.did, [])

print("[5] 本物の heavy_watch.yml と食い違っていないか")
import yaml

wf = REPO / ".github" / "workflows" / H.WORKFLOW_FILE
ok("ワークフローが在る", wf.is_file(), True)
doc = yaml.safe_load(wf.read_text(encoding="utf-8")) if wf.is_file() else {}
jobs = (doc or {}).get("jobs") or {}
ok("映す job が在る", "watch_down" in jobs, True)
wd = jobs.get("watch_down") or {}
needs = wd.get("needs") or []
ok("見ているのは2本", sorted(needs), ["browserwatch", "reachwatch"])
# **表と job 名がそろっているか。** 片方だけ直すと、落ちた job が
# 「表に無い」として本文に出なくなる（赤くならずに情報だけ消える）
ok("本文の表と job 名がそろっている", sorted(H.WHAT), sorted(needs))
for j in needs:
    ok(f"job「{j}」が在る", j in jobs, True)
# **`needs.*.result` を渡しているか。** ここを書き換えると、空が渡って
# 「分からない」になり、赤が一生 issue にならない
env = " ".join(str(v) for v in (wd.get("env") or {}).values())
steps = wd.get("steps") or []
for s in steps:
    env += " " + " ".join(str(v) for v in (s.get("env") or {}).values())
    env += " " + str(s.get("run") or "")
for j in needs:
    ok(f"{j} の結果を渡している", f"needs.{j}.result" in env, True)
ok("この道具を呼んでいる", "python/heavy_down.py" in env, True)
# **落ちた job があっても走ること。** `always()` が外れると、
# 赤い晩にこの job ごと skip されて**いちばん要る晩だけ黙る**
ok("前が落ちても走る（always）", "always()" in str(wd.get("if") or ""), True)

print()
print(f"見た項目 {checks}")
print(f"{'✕ ' + str(bad) + '件 落ちた' if bad else '○ ぜんぶ通った'}")
sys.exit(1 if bad else 0)
