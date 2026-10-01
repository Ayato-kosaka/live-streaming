"""**`chatter_one` の決めを、BigQuery に触らずに確かめる。**

    python3 python/admin/chatter_one_selftest.py

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**
（`docs/island-standards.md` §15）。

## なぜ要るか

この道具が間違っても**赤くならない。** 出すのはコメントの一覧なので、
落とすべき行が混ざっても、拾うべき行が落ちても、読んだ人には
「その人はそれしか言っていない」に見える。

実際、`viewer-keywords` が外した3人はどれも**読む範囲を間違えた**のが
原因だった（1,521件のうち130件だけ読んで「候補が出そろった」と思った）。
**落とす判定を1つ緩めるだけで、同じことがもう一度起きる。**

## 何を見るか

| 見るもの | 落ちたら何が起きるか |
| --- | --- |
| 絵文字だけの行を落とす | 「:clap::clap:」が200行並んで、本文が埋もれる |
| 短い相槌を落とす | 「おお」「w」で埋まる |
| **意味のある短文を落とさない** | **その人の一言が消える。これがいちばん怖い** |
| 名前を SQL で引かない | 出さないものを持って帰ることになる |
| 日付を日本時間で切る | 深夜のコメントが前の日に出る |
| 口ぐせは2回以上だけ | 全部の行が「口ぐせ」として並ぶ |

**判定の規則をここに書き写さない。** 本体から取り込んで回す。
"""

import logging
import os
import sys
import types

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

# **本物の `_fs` を読まない。** あれは読み込んだだけで BQ_PROJECT_ID を
# 要求し、Firestore のクライアントまで用意する。ここで見たいのは判定の
# 規則だけなので、**資格情報にも環境変数にも触らない**偽物を先に置く
# （`chat_day_selftest.py` と同じ手）。
_fs = types.ModuleType("_fs")
_fs.args = lambda: {}
_fs.log = logging.getLogger("selftest")
sys.modules["_fs"] = _fs

import chatter_one as c  # noqa: E402 — 偽の `_fs` を置いたあとでなければ読めない

ok = 0
ng = 0


def check(label: str, got, want) -> None:
    """1件見る。"""
    global ok, ng
    if got == want:
        ok += 1
        print(f"  ○ {label}")
    else:
        ng += 1
        print(f"  × {label} — 出た: {got!r} / ほしい: {want!r}")


print("# 1. 落とす行（読んでも何も分からない行だけ）")
check("絵文字だけの行は落とす", c.drop(":clap::clap::clap:"), True)
check("絵文字＋空白だけでも落とす", c.drop(" :tada:  :tada: "), True)
check("空の行は落とす", c.drop(""), True)
check("空白だけの行は落とす", c.drop("   "), True)
check("None も落とす", c.drop(None), True)
check("短い相槌は落とす（おお）", c.drop("おお"), True)
check("短い相槌は落とす（w）", c.drop("w"), True)

print("\n# 2. **落としてはいけない行**（ここが本番）")
check("8文字ちょうどは残す", c.drop("ネクストレベル？"), False)
check("注文は残す", c.drop("なんかかわいいやつで"), False)
check("助言は残す", c.drop("あとは雨の日に滑らなさそうか"), False)
check("前後の空白は長さに数えない", c.drop("  ネクストレベル？  "), False)

print("\n# 3. SQL が、出さないものを持って帰らない")
sql = c.sql_of(0)
check("author_name を SELECT しない", "author_name AS" in sql, False)
check("チャンネルIDを SELECT しない", "author_channel_id" in sql, False)
check("名前は差し込みではなく当て込み（@name）", "@name" in sql, True)
check("日付は日本時間で切る", "'Asia/Tokyo'" in sql, True)
check("全期間のときは窓を付けない", "INTERVAL" in sql, False)
check("days を渡すと窓が付く", "INTERVAL 180 DAY" in c.sql_of(180), True)

print("\n# 4. 件数の SQL も同じ決め")
st = c.stats_sql(0)
check("author_name を SELECT しない", "author_name AS" in st, False)
check("名前は当て込み", "@name" in st, True)
check("配信の本数を数える", "COUNT(DISTINCT video_id)" in st, True)

print("\n# 5. 口ぐせは2回以上だけ")
rows = [
    ("2026-09-01", "おつかれさま"),
    ("2026-09-02", "おつかれさま"),
    ("2026-09-03", "おつかれさま"),
    ("2026-09-04", "一回だけの話"),
    ("2026-09-05", "またね"),
    ("2026-09-06", "またね"),
]
hb = c.habits(rows)
check("いちばん多いものが先頭", hb[0], ("おつかれさま", 3))
check("2回のものは入る", ("またね", 2) in hb, True)
check("**1回だけのものは入らない**", any(t == "一回だけの話" for t, _ in hb), False)
check("空の入力でも落ちない", c.habits([]), [])

print(f"\n通った {ok} 件 / 落ちた {ng} 件")
if ok == 0:
    print("× 1件も確かめていません（取り込みに失敗した？）")
    sys.exit(2)
sys.exit(1 if ng else 0)
