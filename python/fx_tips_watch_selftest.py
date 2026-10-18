"""`python/fx_tips_watch.py` の見張り。

    python3 python/fx_tips_watch_selftest.py

## 何を守っているか

**円に直せなかった投げ銭が残っていることに、誰かが気づけること。**

円以外はその日のレートで円に直して足すようになった（`#951`）。
直せなかったぶんは**足さない。0 にもしない**ので、その人の貢献額は
そのぶん足りないまま、島の順位にも月ごとのふりかえりにも出る。
`python/build_residents.py` がログに1行出すが、**あのログは誰も見ない。**
だから issue 1本に映す——が、**直せないことが起きるのは年に1〜2回。**
踏まれない道は腐る。**腐っても赤くならない**ので、ここで両側から当てる。

黙って効かなくなる道が5つある。どれも**赤くならずに**効かなくなる。

  1. **直っていない行を「直った」と読む**（`row_yen` と別の読み方を作った）
     → 取りこぼしているのに issue が立たない。いちばん静かな失敗
  2. **直っている行を「直っていない」と読む**
     → 毎晩 issue が立って、誰も読まなくなる
  3. **台帳を日付で絞る** → 古い取りこぼしが「直った」に化けて issue が閉じる
     （逆に、**レートでは直らない行**を数えると issue が永久に閉じない）
  4. **台帳が読めなかった朝に「取りこぼしなし」へ倒す**
     → 開いている issue を「直った」と言って閉じる（いちばん悪い）
  5. **直しかたを本文に書かない** → 読んだ人がまた自力で探す（#290 の決めごと4）

## 対照（`BREAK=`。`docs/island-standards.md` §15）

**足の数だけ用意する。** 1本抜くごとに、別々の検査が落ちる。

  recent  … 台帳を直近90日で切る              → [2] が落ちる
  done    … 直っていない行を「直った」と読む  → [3] の「立つ側」が落ちる
  stuck   … 直っている行も取りこぼしに数える  → [3] の「立たない側」が落ちる
  noamt   … 額の読めない行まで取りこぼしに数える → [3] の「立たない側」が落ちる
  jpy     … 円も外貨に数える                   → [3] の「立たない側」が落ちる
  unknown … 読めなかったのを「0件」に倒す      → [4] が落ちる
  ask     … 本文から #951 への指しを落とす     → [5] が落ちる
  nofix   … 本文から直しかたを落とす           → [5] が落ちる
  leak    … 本文に台帳の中身を混ぜる           → [6] が落ちる
  nocase  … 通貨を大文字にそろえない           → [7] が落ちる（島との突き合わせ）
  nowire  … 見る先を在りもしないワークフローに → [9] が落ちる

終了コード 0=通った / 1=落ちた。
"""

import os
import sys
from datetime import date, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
sys.path.insert(0, str(HERE))

import build_residents as B  # noqa: E402
import fx_tips_watch as H  # noqa: E402
import run_watch  # noqa: E402

BREAK = os.environ.get("BREAK", "")
bad = 0
checks = 0

# **対照：仕込みを先に刺す。** 本物を1つも測る前に、判定の足を折っておく
if BREAK == "recent":
    _read = H.read_ledger
    _cut = (date.today() - timedelta(days=90)).isoformat()
    H.read_ledger = lambda db: [r for r in _read(db)
                                if str(r.get("day") or "") >= _cut]
if BREAK == "done":
    H.fx_rate.row_yen = lambda doc: (1, "")        # 何が来ても「直っている」
if BREAK == "stuck":
    H.fx_rate.row_yen = lambda doc: (None, "unsupported")   # 何でも「直らない」
if BREAK == "noamt":
    _survey = H.survey

    def _withamt(rows):
        got = _survey(rows)
        extra = sum(1 for d in rows or []
                    if H.currency_of(d) != H.MAIN_CURRENCY
                    and (d or {}).get("amount") is None)
        return {**got, "stuck": got["stuck"] + extra,
                "down": (got["stuck"] + extra) > 0}

    H.survey = _withamt
if BREAK == "jpy":
    H.MAIN_CURRENCY = "円"          # `JPY` が外貨に化ける
if BREAK == "unknown":
    H.unknown = lambda: {"rows": 0, "fx": 0, "stuck": 0, "by": {},
                         "last": None, "down": False}
if BREAK == "ask":
    _body = H.body
    H.body = lambda a: _body(a).replace(f"#{H.ASK}", "（相談中）")
if BREAK == "nofix":
    _body3 = H.body
    H.body = lambda a: _body3(a).replace(H.FIX, "（どこかの道具）")
if BREAK == "leak":
    _body2 = H.body
    H.body = lambda a: _body2(a) + str(a.get("_rows") or "")
if BREAK == "nocase":
    H.currency_of = lambda doc: str((doc or {}).get("currency")
                                    or H.MAIN_CURRENCY)
if BREAK == "nowire":
    H.WORKFLOW_FILE = "fx_tips_watch_nope.yml"


def ok(name, got, want):
    global bad, checks
    checks += 1
    good = got == want
    print(f"  {'○' if good else '✕'} {name}: {got}"
          + ("" if good else f"（欲しかったのは {want}）"))
    if not good:
        bad += 1
        print(f"::error::{name}: 出た={got} / 欲しかったのは={want}")


# --- 偽の台帳 -------------------------------------------------------------
# **1バイトも外に出ない。** `where("day", ">=", d0).stream()`（島の
# `fetch_tips` の引き方）と `stream()`（こちらの引き方）の両方を持たせてある
# ——[7] で**本物の島に同じ行を食わせる**ため


class Doc:
    def __init__(self, v):
        self._v = v

    def to_dict(self):
        return dict(self._v)


class Query:
    def __init__(self, rows, d0):
        self.rows, self.d0 = rows, d0

    def stream(self):
        return [Doc(r) for r in self.rows if str(r.get("day") or "") >= self.d0]


class Col:
    def __init__(self, rows):
        self.rows = rows

    def where(self, field, op, value):
        assert (field, op) == ("day", ">="), (field, op)
        return Query(self.rows, value)

    def stream(self):
        """**日付で絞らずに全部返す。** こちらが台帳ぜんぶを見るほう"""
        return [Doc(r) for r in self.rows]


class FakeDb:
    """`islandTips` だけを持つ偽の Firestore。`boom=True` で読めなくする。"""

    def __init__(self, rows, boom=False):
        self.rows, self.boom = rows, boom

    def collection(self, name):
        assert name == H.TIPS, name
        if self.boom:
            raise RuntimeError("台帳に届かない（偽物）")
        return Col(self.rows)


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


D0, D1 = B.window()


def day_off(d: str, n: int) -> str:
    y, m, dd = (int(x) for x in d.split("-"))
    return (date(y, m, dd) + timedelta(days=n)).isoformat()


# 素性の付いた行。**本文にもログにも1文字も出てはいけない**
CID = "UCzzzzTESTzzzz0000000000"
NAME = "テスト視聴者さん"


def tip(day, currency, amount=1000.0, cid=CID, jpy=None, why=None):
    """台帳の1行。`jpy` を入れると「円に直してある行」になる。"""
    return {"day": day, "currency": currency, "amount": amount,
            "amountJpy": jpy, "fxWhy": why,
            "channelId": cid, "displayNameSnapshot": NAME,
            "source": "youtube_superchat"}


print("[1] 通貨の読み方が、島と同じか")
ok("空は円", H.currency_of({"day": D1}), "JPY")
ok("None も円", H.currency_of({"currency": None}), "JPY")
ok("小文字はそろえる", H.currency_of({"currency": "cad"}), "CAD")
ok("外貨はそのまま", H.currency_of({"currency": "ILS"}), "ILS")

print("[2] **古い取りこぼしも数える**（窓で切らない）")
# 直せていない行は、その月のふりかえりから永久に抜け続ける。
# 90日で切ると、1月の取りこぼしを3月以降だれも知らない
old = [
    tip("2026-01-09", "CAD", 2.79),            # 換算を入れる前に入った行
    tip("2026-05-07", "ILS", 6.0),             # 同上
    tip(D1, "JPY", 1000.0),
]
a = H.look(FakeDb(old))
ok("何年前でも数える", a["stuck"], 2)
ok("台帳ぜんぶを見た件数", a["rows"], 3)
ok("理由ごとの内訳", a["by"], {("CAD", "pending"): 1, ("ILS", "pending"): 1})
ok("いちばん新しい取りこぼしの日", a["last"], "2026-05-07")

print("[3] 取りこぼしが在る／無い の仕分け（両側）")
ok("直せていない行が在れば立てる",
   H.survey([tip(D1, "TWD", 100.0, why="unsupported")])["down"], True)
ok("**円に直してある行では立てない**",
   H.survey([tip(D1, "CAD", 2.79, jpy=317)])["down"], False)
ok("円だけなら立てない",
   H.survey([tip(D1, "JPY"), tip(D0, None)])["down"], False)
ok("1件も無くても立てない", H.survey([])["down"], False)
# **額が読めない行では立てない。** レートを引いても直らないので、
# 数えると issue が永久に閉じない（島は `no_amount` で別に数えている）
ok("額が読めない行では立てない",
   H.survey([tip(D1, "CAD", amount=None)])["down"], False)
ok("直してある行は、円以外としては数える",
   H.survey([tip(D1, "CAD", 2.79, jpy=317)])["fx"], 1)
ok("直してある行の内訳は空", H.survey([tip(D1, "CAD", 2.79, jpy=317)])["by"], {})

print("[4] 台帳が読めなかった朝は、開きも閉じもしない")
bust = H.look(FakeDb([], boom=True))
ok("**0件に倒さない**", bust["down"], None)
ok("件数も持たない", bust["stuck"], None)
live = H.look(FakeDb([tip(D1, "TWD", 100.0, why="unsupported")]))
ok("読めれば数える", (live["stuck"], live["down"]), (1, True))

print("[5] 本文")
text = H.body(live)
ok("印が入っている", H.MARK in text, True)
ok("件数が出る", "**1件**" in text, True)
ok("通貨コードが出る", "| TWD |" in text, True)
ok("なぜ直せないかが出る", H.fx_rate.WHY["unsupported"] in text, True)
ok("いちばん新しい日が出る", D1 in text, True)
ok(f"#{H.ASK} を指している", f"#{H.ASK}" in text, True)
ok("**直しかたが書いてある**", H.FIX in text, True)
ok("2回組んでも同じ字",
   H.body(live) == H.body(H.look(FakeDb(
       [tip(D1, "TWD", 100.0, why="unsupported")]))), True)

print("[6] 人を指す字が、1文字も出ない")
# 台帳の行には素性も額も入っている。**持ち帰らないので出しようがない**
noisy = H.look(FakeDb([tip(D1, "CAD", 2.79, why="unreachable"),
                       tip(D0, "JPY", 10000.0)]))
noisy["_rows"] = [tip(D1, "CAD", 2.79)]   # BREAK=leak の餌
leaky = H.body(noisy)
for what, s in (("チャンネルID", CID), ("名前", NAME), ("額", "2.79"),
                ("円の額", "10000")):
    ok(f"{what}が本文に出ない", s in leaky, False)
ok("数えた結果そのものが素性を持たない",
   sorted(k for k in H.survey([tip(D1, "CAD", 2.79)])),
   ["by", "down", "fx", "last", "rows", "stuck"])

print("[7] 島（build_residents）が足せていない行と、同じ行を数えているか")
# **口と画面を突き合わせる**（§15）。島の `fetch_tips` に同じ台帳を食わせて、
# あちらが「足せなかった件数」とこちらの件数が合うかを見る
mixed = [
    tip(D1, "CAD", 2.79, jpy=317),            # 直してある。**足されている**
    tip(D1, "ILS", 6.0, why="unreachable"),   # 直っていない
    tip(D0, "twd", 100.0, why="unsupported"),  # 小文字。あちらも大文字にそろえる
    tip(D0, "JPY", 500.0), tip(D0, None, 1000.0),
    tip("2026-01-09", "CAD", 2.79),           # 窓の外。**島は数えない**
]
yen, tipped = B.fetch_tips(FakeDb(mixed))
mine = H.survey([r for r in mixed if D0 <= r["day"] <= D1])
ok("島が足せなかった件数と同じ", mine["stuck"], tipped["fx_stuck"])
ok("理由ごとの内訳も同じ", mine["by"], tipped["fx_why"])
ok("島が見た円以外の件数と同じ", mine["fx"], tipped["fx_rows"])
ok("円のぶんは、島ではちゃんと足されている", bool(yen), True)
ok("**直してある外貨も足されている**", yen.get(CID), 317.0 + 500.0 + 1000.0)

print("[8] issue をどう動かすか")
want = H.body(live)
g = FakeGh([])
ok("取りこぼしが在って issue が無い → 開く",
   H.run(g, live, apply=True)["action"], "create")
ok("  実際に1本 開いた", [d[0] for d in g.did], ["create"])

g = FakeGh([{"number": 7, "state": "open", "body": want, "labels": []}])
ok("取りこぼしが在って本文も同じ → 触らない",
   H.run(g, live, apply=True)["action"], "noop")
ok("  1バイトも書いていない", g.did, [])

g = FakeGh([{"number": 7, "state": "closed", "body": want, "labels": []}])
ok("取りこぼしが在って閉じている → 同じ1本を開け直す",
   H.run(g, live, apply=True)["action"], "reopen")

gone = H.look(FakeDb([tip(D1, "CAD", 2.79, jpy=317)]))
g = FakeGh([{"number": 7, "state": "open", "body": want, "labels": []}])
ok("**埋め直して直った → 自分で閉じる**",
   H.run(g, gone, apply=True)["action"], "close")

g = FakeGh([{"number": 7, "state": "open", "body": want, "labels": []}])
ok("**読めなかった → 開きも閉じもしない**",
   H.run(g, bust, apply=True)["action"], "noop")
ok("  1バイトも書いていない", g.did, [])

g = FakeGh([])
ok("--apply が無ければ書かない", H.run(g, live, apply=False)["action"], "dry")
ok("  それでも issue は読みにいく（道が生きているか）", g.did, [])

print("[9] 本物の fx_tips_watch.yml と食い違っていないか")
import yaml  # noqa: E402

wf = REPO / ".github" / "workflows" / H.WORKFLOW_FILE
ok("ワークフローが在る", wf.is_file(), True)
doc = yaml.safe_load(wf.read_text(encoding="utf-8")) if wf.is_file() else {}
# `on:` は YAML では True（予約語）に化ける
trig = (doc or {}).get("on") or (doc or {}).get(True) or {}
ok("issue を書ける権限がある", ((doc or {}).get("permissions") or {}).get("issues"),
   "write")
# **繋ぎ先の名前が実在するか。** あちらの `name:` を変えると黙って切れる
# （赤くならない。走らなくなるだけ）
names = run_watch.linked_names(str(REPO / ".github" / "workflows"))
hooked = ((trig.get("workflow_run") or {}).get("workflows")) or []
ok("繋ぎ先が1本以上ある", bool(hooked), True)
for n in hooked:
    ok(f"繋ぎ先「{n}」が実在する", n in names, True)
ok("cron の保険もある", bool(trig.get("schedule")), True)

steps = []
for job in ((doc or {}).get("jobs") or {}).values():
    for s in (job.get("steps") or []):
        steps.append(str(s.get("run") or "")
                     + " " + " ".join(str(v) for v in (s.get("env") or {}).values()))
flat = "\n".join(steps)


def before(first: str, second: str) -> bool:
    """`first` が `second` より手前に在るか。**無ければ False**（落ちる側）。

    `index()` を直に使うと、片方が無い回に**例外で死ぬ。**
    死に方が「見張りが落ちた」と見分けられないので、答えを返す。
    """
    i, j = flat.find(first), flat.find(second)
    return 0 <= i < j


ok("この道具を呼んでいる", "python/fx_tips_watch.py" in flat, True)
ok("見張りを、口を開く前に回している",
   before("fx_tips_watch_selftest.py", "fx_tips_watch.py --apply"), True)
# **素性の見張りが手前に在るか**（`python/logsafe_wiring_selftest.py` と同じ決め）。
# この道具は島ごしに `logsafe` を読み込む口なので、同じ job の手前に要る
ok("素性の見張りが手前に在る",
   before("logsafe_selftest.py", "python/fx_tips_watch.py"), True)

print()
print(f"見た項目 {checks}")
print(f"{'✕ ' + str(bad) + '件 落ちた' if bad else '○ ぜんぶ通った'}")
sys.exit(1 if bad else 0)
