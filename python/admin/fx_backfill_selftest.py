"""偽の Firestore・偽のレートの口で、`fx_backfill` を**実際に動かして確かめる。**

    python3 python/admin/fx_backfill_selftest.py

**本番には1バイトも出ない。** Firestore も、為替の口も、資格情報も要らない。

## なぜ、これを書いたか

この道具が間違えたときに壊れるのは、**公開の面に出る誰かの額。**
0 を入れれば、出してくれた人が出していない人と同じ数になる。
元の表記を書き換えれば、**あとでレートを引き直して検算できなくなる。**
そして**どちらも赤くならない。** 数が1つ変わるだけで、run は緑で終わる。

しかも、この道具の出番は**2年に1度**くらいしか無い（2026-10-18 の本番で
2件）。**踏まれない道は腐るのに、腐っても誰も困らない**ので、
立つ側と立たない側の両方をここで当てる（`island-misses.md` #290 の決めごと3）。

## 確かめるもの

  1. **直っていない行だけ拾う**（円の行・もう直っている行には手を出さない）
  2. **下見では1バイトも書かない**（`_fs.readonly` が口ごと塞ぐ）
  3. `apply` で入るのは**4つの欄だけ**。`amount` と `currency` は触らない
  4. **頼んだ日ではなく、返ってきた日**が `fxDate` に入る（土日）
  5. **直せない行（TWD・口が落ちた日）は書かない。0 も入れない**
  6. 出力に**チャンネルIDも名前も元の表記も1文字も出ない**

## 対照（`BREAK=`。`docs/island-standards.md` §15）

  all   … もう直っている行まで拾う     → [1] が落ちる
  wrote … 下見でも書きに行く            → [2] が落ちる
  raw   … 元の表記も書き換える          → [3] が落ちる
  ask   … 頼んだ日を `fxDate` に入れる  → [4] が落ちる
  zero  … 直せない行に 0円 を入れる     → [5] が落ちる
  leak  … ログにチャンネルIDを混ぜる    → [6] が落ちる

終了コード 0=通った / 1=落ちた / 2=確かめが1つも無い。
"""

import io
import os
import sys
import urllib.error

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# **本番には触らない。** `_fs` が `config` を読み込むので名前だけ置く
os.environ.setdefault("BQ_PROJECT_ID", "fx-backfill-selftest-writes-nothing")
# **公開の場（Actions）と同じ条件で回す。** 伏せる側（`python/logsafe.py`）が
# 効いているかを見るので、手元の条件で回すと [6] が意味を持たない
os.environ["GITHUB_ACTIONS"] = "true"

# 出力を丸ごと溜める袋。**`_fs` の basicConfig を読み込む前に**二股にする
BUF = io.StringIO()
REAL_OUT = sys.stdout


class Tee:
    def write(self, s):
        BUF.write(s)
        REAL_OUT.write(s)

    def flush(self):
        REAL_OUT.flush()


sys.stdout = Tee()
sys.stderr = Tee()

import _fs  # noqa: E402
import fx_backfill as F  # noqa: E402

BREAK = os.environ.get("BREAK", "")
FAILED = []
PROBES = []

# 素性の付いた値。**ログに1文字も出てはいけない**
CID = "UCzzzzTESTzzzz0000000000"
NAME = "テスト視聴者さん"


def ok(name, got, want):
    PROBES.append(name)
    if got == want:
        print(f"  ○ {name}: {got}")
        return
    FAILED.append(name)
    print(f"  ✕ {name}: {got}（欲しかったのは {want}）")
    print(f"::error::{name}: 出た={got} / 欲しかったのは={want}")


# --- 偽の為替の口 ---------------------------------------------------------
# **本物の返事を写してある**（2026-10-18 に `curl` で引いたもの）。
# 10-18 は土曜なので、頼んだ日と返ってきた日が違う
REAL = {
    ("CAD", "2026-01-09"): {"date": "2026-01-09", "rates": {"JPY": 113.54}},
    ("ILS", "2026-05-07"): {"date": "2026-05-07", "rates": {"JPY": 53.787}},
    ("USD", "2026-10-18"): {"date": "2026-10-16", "rates": {"JPY": 158.02}},
}


def fake_get(url: str) -> dict:
    for (cur, day), body in REAL.items():
        if f"/{day}?" in url and f"base={cur}" in url:
            return body
    if "base=TWD" in url:
        raise urllib.error.HTTPError(url, 404, "Not Found", {}, None)
    raise urllib.error.URLError("つながらない（偽物）")


_to_jpy = F.fx_rate.to_jpy


def to_jpy(amount, currency, day, get=None):
    """外へ出ない `to_jpy`。**口だけ偽物に差し替える。**"""
    got = _to_jpy(amount, currency, day, get=fake_get)
    if BREAK == "ask" and got["yen"] is not None:
        got = {**got, "date": day}          # 頼んだ日を入れてしまう
    if BREAK == "zero" and got["yen"] is None:
        got = {**got, "yen": 0, "rate": 0.0, "date": day, "why": ""}
    return got


F.fx_rate.to_jpy = to_jpy

if BREAK == "wrote":
    # 下見のつもりで書きに行く。**口（`_fs.readonly`）も塞がない**
    F.args = lambda: {"apply": True}
    F.readonly = lambda c: c
    _fs.readonly = lambda c: c
if BREAK == "all":
    # もう直っている行まで拾う
    F.fx_rate.row_yen = lambda doc: (None, "pending")
if BREAK == "raw":
    _convert = F.convert

    def _raw(rows):
        ready, left = _convert(rows)
        # **元の表記を書き換えてしまう**（検算できなくなる）
        return ([(r, {**d, "amount": d["amountJpy"], "currency": "JPY"})
                 for r, d in ready], left)

    F.convert = _raw
if BREAK == "leak":
    _stuck = F.stuck_rows

    def _loud(client, day=None):
        got = _stuck(client, day)
        for r in got:
            F.log.info("  拾った行: %s（%s）", r["id"], CID)
        return got

    F.stuck_rows = _loud


# --- 偽の Firestore -------------------------------------------------------


class Doc:
    def __init__(self, doc_id, v):
        self.id = doc_id
        self._v = v

    def to_dict(self):
        return dict(self._v)


class Ref:
    def __init__(self, doc_id):
        self.id = doc_id


class Query:
    def __init__(self, rows, day):
        self.rows, self.day = rows, day

    def stream(self):
        return [Doc(k, v) for k, v in self.rows.items()
                if str(v.get("day") or "") == self.day]


class Col:
    def __init__(self, rows):
        self.rows = rows

    def stream(self):
        return [Doc(k, v) for k, v in self.rows.items()]

    def where(self, field, op, value):
        assert (field, op) == ("day", "=="), (field, op)
        return Query(self.rows, value)

    def document(self, doc_id):
        return Ref(doc_id)


class Batch:
    def __init__(self, db):
        self.db = db

    def set(self, ref, data, merge=False):
        assert merge is True, "merge=True でなければ、ほかの欄が消える"
        self.db.wrote.append((ref.id, dict(data)))

    def commit(self):
        self.db.commits += 1
        for doc_id, data in self.db.wrote[self.db.done:]:
            self.db.rows[doc_id].update(data)
        self.db.done = len(self.db.wrote)


class FakeDb:
    def __init__(self, rows):
        self.rows = rows
        self.wrote = []
        self.commits = 0
        self.done = 0

    def collection(self, name):
        assert name == F.TIPS, name
        return Col(self.rows)

    def batch(self):
        return Batch(self)


def ledger():
    """偽の台帳。**本番の2件と同じ形**（換算を入れる前に入った行）。"""
    return {
        # 円。手を出してはいけない
        "jpy1": {"day": "2026-10-01", "amount": 1000, "currency": "JPY",
                 "channelId": CID, "displayNameSnapshot": NAME},
        # もう直っている行。手を出してはいけない
        "done1": {"day": "2026-09-01", "amount": 2.0, "currency": "USD",
                  "amountJpy": 300, "fxRate": 150.0, "fxDate": "2026-09-01",
                  "channelId": CID},
        # 本番に残っていた2件
        "cad1": {"day": "2026-01-09", "amount": 2.79, "currency": "CAD",
                 "channelId": CID, "displayNameSnapshot": NAME},
        "ils1": {"day": "2026-05-07", "amount": 6.0, "currency": "ILS",
                 "channelId": CID},
        # 土曜。**返ってきた日は金曜（10-16）**
        "usd1": {"day": "2026-10-18", "amount": 2.0, "currency": "USD",
                 "channelId": CID},
        # この口が持っていない通貨。**直らない**
        "twd1": {"day": "2026-10-18", "amount": 100.0, "currency": "TWD",
                 "channelId": CID},
    }


# この道具自身が出した字だけを溜める。**自分の `ok()` の字を混ぜない**
# （混ぜると「元の額は触らない: 2.79」が「漏れた」に見える）
TOOL_OUT = []


def run(argv, rows, apply):
    """`main()` を1回まわす。**外へは1バイトも出ない。**"""
    F.fx_rate._SEEN.clear()
    db = FakeDb(rows)
    _fs_db = _fs.db
    F.db = lambda: db
    os.environ["ARGS"] = argv
    mark = len(BUF.getvalue())
    try:
        rc = F.main()
    finally:
        F.db = _fs_db
        TOOL_OUT.append(BUF.getvalue()[mark:])
    return rc, db


print("=== 円に直っていない投げ銭の埋め直しを、偽のデータで確かめる ===")
print("（Firestore にも為替の口にも1バイトも触りません）")

print("\n[1] 直っていない行だけ拾う")
rows = ledger()
got = F.stuck_rows(FakeDb(rows))
ok("拾うのは4件（円と、もう直っている行は拾わない）",
   sorted(r["id"] for r in got), ["cad1", "ils1", "twd1", "usd1"])
ok("日付順に並ぶ", [r["day"] for r in got],
   ["2026-01-09", "2026-05-07", "2026-10-18", "2026-10-18"])
ok("その日だけ見ることもできる",
   [r["id"] for r in F.stuck_rows(FakeDb(rows), "2026-01-09")], ["cad1"])

print("\n[2] 下見は1バイトも書かない")
rc, db = run("{}", ledger(), apply=False)
ok("終了コード 0", rc, 0)
ok("1回も書いていない", (db.wrote, db.commits), ([], 0))
# **口ごと塞がっているか**（呼ぶ側の `if` を書き忘れても止まる）
try:
    F.write(_fs.readonly(FakeDb(ledger())), [({"id": "cad1"}, {"amountJpy": 1})])
    blocked = False
except _fs.ReadOnly:
    blocked = True
ok("読み専用のクライアントに書くと止まる", blocked, True)

print("\n[3] apply で入るのは4つの欄だけ")
rc, db = run('{"apply": true}', ledger(), apply=True)
ok("終了コード 0", rc, 0)
wrote = dict(db.wrote)
ok("書いたのは3件（直せたぶんだけ）", sorted(wrote), ["cad1", "ils1", "usd1"])
ok("欄は4つだけ", sorted(wrote["cad1"]),
   ["amountJpy", "fxDate", "fxRate", "fxWhy"])
ok("元の額は触らない", db.rows["cad1"]["amount"], 2.79)
ok("元の通貨も触らない", db.rows["cad1"]["currency"], "CAD")
ok("本番で実測した円になる",
   [wrote["cad1"]["amountJpy"], wrote["ils1"]["amountJpy"],
    wrote["usd1"]["amountJpy"]], [317, 323, 316])
ok("直ったので理由は消える", wrote["cad1"]["fxWhy"], None)
# 直したあとは、足す側が足せるようになっている
ok("直したあと、足す側が読める",
   F.fx_rate.row_yen(db.rows["cad1"]), (317, ""))

print("\n[4] **頼んだ日ではなく、返ってきた日**（土日）")
ok("土曜に頼んだぶんは、直前の営業日", wrote["usd1"]["fxDate"], "2026-10-16")
ok("頼んだ日のほうは入らない", wrote["usd1"]["fxDate"] == "2026-10-18", False)
ok("平日はその日のまま", wrote["cad1"]["fxDate"], "2026-01-09")

print("\n[5] 直せない行は、書かない（**0 も入れない**）")
ok("TWD は1行も書いていない", "twd1" in wrote, False)
ok("台帳の TWD に円が入っていない", db.rows["twd1"].get("amountJpy"), None)
ok("足す側も「直っていない」と読む",
   F.fx_rate.row_yen(db.rows["twd1"]), (None, "pending"))
# 2回流しても、直らないものは増えないし、直ったものは書き直さない
rc, db2 = run('{"apply": true}', db.rows, apply=True)
ok("2回目に書くのは0件", db2.wrote, [])

print("\n[6] 人を指す字が、1文字も出ない")
out = "".join(TOOL_OUT)
for what, s in (("チャンネルID", CID), ("名前", NAME), ("元の表記", "2.79"),
                ("書類ID", "cad1")):
    ok(f"{what}がログに出ない", s in out, False)
ok("書類IDの指紋は出る（追えるように）", "指紋 #" in out, True)
ok("何件動いたかは出る（件数は伏せない）", "書きました: 3件" in out, True)

print()
if not PROBES:
    print("✕ 確かめが1つもありませんでした（数えるものが無い）")
    sys.exit(2)
if FAILED:
    print(f"✕ 通らなかった確かめ {len(FAILED)} 件: {', '.join(FAILED)}")
    sys.exit(1)
print(f"○ {len(PROBES)} 件ぜんぶ通りました")
sys.exit(0)
