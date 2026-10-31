"""`python/doneru/dedup.py` の見張り。**BigQuery にも本番にも1バイトも触らない。**

    python3 python/doneru_dedup_selftest.py

## 何を守っているか

**払われた1件の寄付が、2回数えられないこと。**（#1067）

`doneru_donations` の主キー `donation_id` は、CSV に寄付1件ごとの ID が
無いので `python/doneru/normalizer.py` の `_fallback_id()` が
**レコードの中身まるごとの sha256** で作っている。その中身に
**精算状態（`status`）と実際精算金額（`settlement_amount`）が入っている。**

だから寄付が振り込まれて状態が変わった瞬間に、同じ寄付が**別の鍵で
生え直す。** MERGE は `donation_id` で突き合わせるので古い行には当たらず、
**古い行が残って2行になる。**

実測（2026-09-26〜2026-10-30）: 置き場の行 30 / 実際の寄付 26 /
重なっていた組 4。同じ期間の `振込完了` は4件で、重なった組も4組。
**振り込まれれば必ず起きる。**

`GROUP BY donation_id` では寄らない（鍵そのものが増えている）。なので
引く側は `doneru.dedup` を通す。ここはその寄せの判定を見ている。

## SQL は実行できない。だから判定を Python に割ってある

この箱には BigQuery を引く身分が無い。`ROW_NUMBER() ... rn = 1` を
そのまま回せないので、**同じ判定を `pick()` / `better()` /
`dedup_key()` に割って**、ここから呼ぶ。SQL の側は
`PARTITION BY` と `ORDER BY` が同じ決め（`KEY` / `SETTLED`）から
組まれているかを字で見る。

## 配線も見る

寄せる口を作っても、**引く側が通っていなければ何も直らない。**
足している5か所が `dedup_sql` を通っていることを [6] で数える。

## 対照（`BREAK=`。`docs/island-standards.md` §15）

  flip   … 振込完了を後ろに回す            → [1] [2] [5] が落ちる
  status … 寄せる鍵に status を足す        → [1] [2] [4] [5] が落ちる
  loose  … 寄せる鍵から本文を落とす        → [2] [4] [5] が落ちる
  old    … 取り込みの古いほうを残す        → [3] が落ちる
  wire   … 引く側の配線を1か所ほどく       → [6] が落ちる

終了コード 0=通った / 1=落ちた。
"""

import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from doneru import dedup as D  # noqa: E402

BREAK = os.environ.get("BREAK", "")
bad = 0
checks = 0

# **対照：仕込みを先に刺す。**
if BREAK == "flip":
    # 振込待ちを先に残す。あとから来た真実を捨てる形
    D.settled_rank = lambda row: 1 if row.get("status") == D.SETTLED else 0
if BREAK == "status":
    # 精算状態を鍵に入れる＝状態が変わった2行が別物になる（＝直っていない）
    D.KEY = D.KEY + ("status",)
if BREAK == "loose":
    # 本文を鍵から落とす＝同じ額で別の言葉を添えた2件が1件に潰れる
    D.KEY = tuple(c for c in D.KEY if c != "message_text")
if BREAK == "old":
    D.better = lambda a, b: (
        D.settled_rank(a) < D.settled_rank(b)
        if D.settled_rank(a) != D.settled_rank(b)
        else str(a.get("ingested_at") or "") < str(b.get("ingested_at") or "")
    )


def ok(name, got, want):
    global bad, checks
    checks += 1
    good = got == want
    print(f"  {'○' if good else '✕'} {name}: {got}"
          + ("" if good else f"（欲しかったのは {want}）"))
    if not good:
        bad += 1
        print(f"::error::{name}: 出た={got} / 欲しかったのは={want}")


def row(viewer, at, yen, text, status, ingested, donation_id):
    """`doneru_donations` の1行（作り物）。**実データは1行も使わない。**"""
    return {
        "donation_id": donation_id,
        "viewer_pk": viewer,
        "donated_at": at,
        "amount": yen,
        "message_text": text,
        "status": status,
        "ingested_at": ingested,
        "donor_name": "だれか",
    }


WAIT, DONE = "振込待ち", "振込完了"

# --- 作り物の置き場 -------------------------------------------------------
#
# **実測の形をそのまま写した**（2026-09-26〜2026-10-30。行 30 / 寄付 26 /
# 重なった組 4）。数は縮めてあるが、重なり方は同じ——
# 日・人・額・本文が同じで、違うのは精算状態だけ。
#
# `donation_id` が組ごとに違うところが本題。**同じ寄付なのに鍵が別**
PAIRS = [
    # 振り込まれたぶん。古い行（振込待ち）が残ったまま新しい行が生えた
    row("v1", "2026-09-26T12:00:00", 1000, "いつもありがとう", WAIT,
        "2026-09-26T21:00:00", "sha256:aaa#1"),
    row("v1", "2026-09-26T12:00:00", 1000, "いつもありがとう", DONE,
        "2026-10-25T21:00:00", "sha256:bbb#1"),
]
SINGLES = [
    # まだ振り込まれていない人。1行しか無い
    row("v2", "2026-10-20T19:30:00", 500, "応援してます", WAIT,
        "2026-10-20T21:00:00", "sha256:ccc#1"),
    # 同じ人が同じ日に、違う額で2回。**寄ってはいけない**
    row("v3", "2026-10-21T20:00:00", 300, "おめでとう", WAIT,
        "2026-10-21T21:00:00", "sha256:ddd#1"),
    row("v3", "2026-10-21T21:00:00", 700, "おめでとう", WAIT,
        "2026-10-21T21:00:00", "sha256:eee#1"),
    # 同じ人が同じ時刻に、同じ額で違う本文。**寄ってはいけない**
    row("v4", "2026-10-22T20:00:00", 1500, "1通目", WAIT,
        "2026-10-22T21:00:00", "sha256:fff#1"),
    row("v4", "2026-10-22T20:00:00", 1500, "2通目", WAIT,
        "2026-10-22T21:00:00", "sha256:ggg#1"),
    # 本文なしで投げてくれた人（`message_text` が None）。落ちないこと
    row("v5", "2026-10-23T20:00:00", 2000, None, WAIT,
        "2026-10-23T21:00:00", "sha256:hhh#1"),
]
TABLE = PAIRS + SINGLES


def yen_total(rows):
    return sum(int(r["amount"]) for r in rows)


print("[1] 精算状態だけ違う2行は、1行に寄る（残るのは振込完了）")
got = D.pick(PAIRS)
ok("2行が1行になる", len(got), 1)
ok("残ったのは振込完了のほう", [r["status"] for r in got], [DONE])
ok("残ったのは新しい鍵のほう", [r["donation_id"] for r in got], ["sha256:bbb#1"])
# **順番を変えても同じものが残る。** 置き場が返す順は決まっていない
ok("逆順で渡しても同じ", [r["status"] for r in D.pick(list(reversed(PAIRS)))],
   [DONE])

print("[2] 違う額・違う本文・違う人は、寄らない")
ok("1行ずつ残る", len(D.pick(SINGLES)), len(SINGLES))
ok("同じ人・同じ日で違う額の2件が残る",
   len(D.pick([r for r in SINGLES if r["viewer_pk"] == "v3"])), 2)
ok("同じ時刻・同じ額で違う本文の2件が残る",
   len(D.pick([r for r in SINGLES if r["viewer_pk"] == "v4"])), 2)
ok("本文なしの行も消えない",
   [r["viewer_pk"] for r in D.pick([SINGLES[-1]])], ["v5"])
# 本文なしが2行あったら、それは同じ寄付が2行入っているのと同じ形
none_pair = [SINGLES[-1], dict(SINGLES[-1], status=DONE,
                               ingested_at="2026-10-26T21:00:00",
                               donation_id="sha256:iii#1")]
ok("本文なしでも、精算状態だけ違う2行は寄る",
   [r["status"] for r in D.pick(none_pair)], [DONE])

print("[3] 精算状態が並んだら、取り込みの新しいほう")
same = [
    row("v9", "2026-10-24T20:00:00", 100, "やあ", WAIT,
        "2026-10-24T21:00:00", "sha256:old#1"),
    row("v9", "2026-10-24T20:00:00", 100, "やあ", WAIT,
        "2026-10-28T21:00:00", "sha256:new#1"),
]
ok("新しいほうが残る", [r["donation_id"] for r in D.pick(same)],
   ["sha256:new#1"])
ok("逆順でも同じ", [r["donation_id"] for r in D.pick(list(reversed(same)))],
   ["sha256:new#1"])
# **`ingested_at` が無い行で落ちない。** 置き場には古い行が在る
noing = [dict(same[0], ingested_at=None), same[1]]
ok("取り込み時刻が無くても落ちない",
   [r["donation_id"] for r in D.pick(noing)], ["sha256:new#1"])
ok("両方無くても落ちない",
   len(D.pick([dict(r, ingested_at=None) for r in same])), 1)

print("[4] 寄せたあとの件数と合計（**1円まで同じ**）")
one = D.pick(TABLE)
ok("置き場の行", len(TABLE), 8)
ok("寄せたあとの寄付", len(one), 7)
ok("寄った組", len(TABLE) - len(one), 1)
# **残した行の額が、重なる前の額と同じ。** 寄せるのは行で、額ではない
ok("合計は、重なりを1組ぶん引いた額と同じ",
   yen_total(one), yen_total(TABLE) - 1000)
ok("寄せても、寄っていない人の額は1円も動かない",
   yen_total([r for r in one if r["viewer_pk"] != "v1"]),
   yen_total(SINGLES))
ok("寄った人の額は1件ぶんだけ",
   yen_total([r for r in one if r["viewer_pk"] == "v1"]), 1000)
# 何回通しても変わらない（口を2度通る面がある）
ok("もう一度通しても変わらない", len(D.pick(one)), len(one))
# **`donation_id` で寄せても直らない**——これが #1067 そのもの
by_id = len({r["donation_id"] for r in TABLE})
ok("`donation_id` では寄らない（鍵が増えている）", by_id, len(TABLE))

print("[5] 鍵と順の決めごと")
ok("寄せる鍵", list(D.KEY),
   ["viewer_pk", "donated_at", "amount", "message_text"])
ok("精算状態は鍵に入れない（そこが変わるから2行になる）",
   "status" in D.KEY, False)
ok("実際精算金額も鍵に入れない", "settlement_amount" in D.KEY, False)
ok("振込完了が先", D.settled_rank({"status": DONE}), 0)
ok("振込待ちはあと", D.settled_rank({"status": WAIT}), 1)
ok("状態が空の行もあと", D.settled_rank({}), 1)
ok("振込完了のほうを残す", D.better({"status": DONE}, {"status": WAIT}), True)
ok("振込待ちは残さない", D.better({"status": WAIT}, {"status": DONE}), False)

print("[6] SQL の字と、引く側の配線")
sql = D.dedup_sql("P", "DS",
                  columns=["donation_id", "donor_name"],
                  where="donated_at IS NOT NULL")
ok("鍵どおりに `PARTITION BY` している",
   f"PARTITION BY {', '.join(D.KEY)}" in sql, True)
ok("振込完了を先に並べている",
   f"IF(status = '{D.SETTLED}', 0, 1)" in sql, True)
ok("並んだら取り込みの新しいほう", "ingested_at DESC" in sql, True)
ok("採るのは1行目だけ", f"WHERE {D.RN} = 1" in sql, True)
ok("窓の列を外に漏らさない", f"EXCEPT ({D.RN})" in sql, True)
ok("絞り込みを窓の中に入れている",
   sql.index("donated_at IS NOT NULL") < sql.index("WHERE _dedup_rn = 1"),
   True)
ok("絞り込みが空でも SQL になる",
   "WHERE TRUE" in D.dedup_sql("P", "DS"), True)
ok("表の名前は差し替えられる（`{t}` を使う口が在る）",
   "`P.DS.T2`" in D.dedup_sql("P", "DS", table="T2"), True)

# **足している口が、全部ここを通っているか。**
# 口が1つ漏れると、その面だけ同じ寄付が2回数えられる
WIRED = [
    "admin/monthly_tips_run.py",
    "admin/tips_sealed.py",
    "admin/doneru_msgs_sealed.py",
    "doneru_ledger.py",
    "island_tips.py",
]
#: 寄せる口を通さずに表を直に引いている形（`{t}` 越しも拾う）
RAW = re.compile(r"FROM\s+`[^`]*(?:doneru_donations|\{t\})`")
for i, rel in enumerate(WIRED):
    src = (HERE / rel).read_text(encoding="utf-8")
    if BREAK == "wire" and i == 0:
        src = src.replace("dedup_sql(", "_nope(")
        src += "\nSQL_X = \"SELECT 1 FROM `{p}.{d}.doneru_donations`\"\n"
    ok(f"{rel} が寄せる口を通している",
       "from doneru.dedup import dedup_sql" in src and "dedup_sql(" in src,
       True)
    ok(f"{rel} が表を直に引いていない", RAW.search(src) is None, True)

print()
print(f"見た項目 {checks}")
print(f"{'✕ ' + str(bad) + '件 落ちた' if bad else '○ ぜんぶ通った'}")
sys.exit(1 if bad else 0)
