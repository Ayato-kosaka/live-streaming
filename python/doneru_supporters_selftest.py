"""偽のデータで、**投げ銭まわりの決めを実際に動かして確かめる。**

    python python/doneru_supporters_selftest.py

**BigQuery にも Firestore にも1バイトも出ない。** 資格情報も要らない。
決めているところ（`plan_first_seen` / `plan_fix` / `jst_date` /
`detail_lines`）は素の関数に切り出してあるので、引数を渡して呼ぶだけで済む。

確かめるのは6つ:

  1. `firstSeenAt` に**全期間の最初の1回**が選ばれる（窓の中の2回目ではなく）
  2. `doneru_donations` に1行も無い どねID は**触られない**
  3. すでに `firstSeenAt` を持っている行は**上書きされない**
  4. すでに入っているぶんの直し（`plan_fix`）が、**何日ずれているか**を
     日本時間の日付で数え、元データに無い行を触らない
  5. 日付の切りかたが**日本時間**（UTC の夕方は、日本ではもう翌日）
  6. **公開の場に出る枝の出力を grep して、チャンネルID・どねID・
     ハンドル・表示名の形が0件**

## 6 の測りかた

このリポジトリは公開で、Actions のログも誰でも読める。
「出していないつもり」ではなく、**出たものを見る。**
`sys.stdout` を二股にして出力を丸ごと溜め、最後にそこを正規表現で探す。
探す形は本番と同じ字数（チャンネルIDは `UC` + 22文字、どねID は10桁）に
してある。形の違うもので試すと、本番では効かない字を探すことになる。
"""

import io
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "admin"))

# 実際の出力を溜める袋。**logsafe を読み込む前に**二股にしておく
BUF = io.StringIO()
REAL = sys.stdout


class Tee:
    """画面にも出しつつ、袋にも同じものを入れる。"""

    def __init__(self, *ws):
        self.ws = ws

    def write(self, s):
        for w in self.ws:
            w.write(s)
        return len(s)

    def flush(self):
        for w in self.ws:
            try:
                w.flush()
            except Exception:  # noqa: BLE001
                pass


sys.stdout = Tee(REAL, BUF)

from doneru_supporters import jst_date, plan_first_seen  # noqa: E402
from donors_first_seen import plan_fix  # noqa: E402
from logsafe import detail_lines  # noqa: E402

# ---------------------------------------------------------------- 偽のデータ

# **本番と同じ形を使う。** チャンネルIDは `UC` + 22文字、どねID は10桁、
# ハンドルは `@…`。形が違うと、6 の grep が本番では効かない字を探すことになる
PK_OLD = "1000000001"      # 前から来ている人（もう firstSeenAt がある）
PK_NEW = "1000000002"      # 今回はじめて見つかった人
PK_GHOST = "1000000003"    # 種から入ったが、寄付の表に1行も無い人
PK_DRIFT = "1000000004"    # 「見つけた日」が焼き付いている人
CID = "UCzzFAKE0000000000000000"
HANDLE = "@ふしぎな-fake1"
LABEL = "ふしぎな視聴者さん"

# その人の**全期間**の投げ銭。窓（--days 3）の中には2回目しか入っていない、
# という形をわざと作る
DONATIONS = [
    # 6月にいちど来ている。**これが本当の初回**
    {"pk": PK_NEW, "at": "2026-06-02T11:20:00+00:00"},
    # 窓の中にあるのは、この2回目のほう
    {"pk": PK_NEW, "at": "2026-09-10T13:05:00+00:00"},
    {"pk": PK_OLD, "at": "2025-04-01T09:00:00+00:00"},
    {"pk": PK_DRIFT, "at": "2026-09-10T13:05:00+00:00"},
]

TABLE = {
    PK_OLD: {"viewerPk": PK_OLD, "firstSeenAt": "2025-04-01T09:00:00+00:00"},
    PK_GHOST: {"viewerPk": PK_GHOST, "label": LABEL},
    # 取り込んだ翌朝 07:41 JST（＝前夜 22:41 UTC）が焼き付いている
    PK_DRIFT: {"viewerPk": PK_DRIFT, "firstSeenAt": "2026-09-10T22:41:00+00:00"},
}

# ---------------------------------------------------------------- 確かめる

FAILED: list = []


def ck(name: str, cond: bool, got) -> None:
    mark = "○" if cond else "✕"
    print(f"    {mark} {name}: {got}")
    if not cond:
        FAILED.append(name)


def case1():
    print("\n[1] 全期間の最初の1回が選ばれる（窓の中の2回目ではない）")
    got = plan_first_seen([PK_NEW], DONATIONS, TABLE)
    ck("入れる時刻", got.get(PK_NEW) == "2026-06-02T11:20:00+00:00",
       got.get(PK_NEW))
    ck("窓の中の2回目（9/10）にはなっていない",
       got.get(PK_NEW) != "2026-09-10T13:05:00+00:00", "9月ではない")
    ck("札に出る日付（日本時間）",
       jst_date(got[PK_NEW]) == "2026-06-02", jst_date(got[PK_NEW]))


def case2():
    print("\n[2] doneru_donations に1行も無い どねID は触られない")
    got = plan_first_seen([PK_GHOST, PK_NEW], DONATIONS, TABLE)
    ck("寄付の表に無い人が入っていない", PK_GHOST not in got, sorted(got) != [])
    ck("入れる件数", len(got) == 1, len(got))

    # 寄付の表がまるごと読めなかった晩（#186 の作り直しの途中）。
    # **1件も入れない**＝欄を空けたまま置く。`now` に落とさない
    none = plan_first_seen([PK_NEW, PK_GHOST], [], TABLE)
    ck("元データが1行も取れなかったら、入れるものは0件", none == {}, none)


def case3():
    print("\n[3] すでに firstSeenAt を持っている行は上書きされない")
    got = plan_first_seen([PK_OLD, PK_DRIFT, PK_NEW], DONATIONS, TABLE)
    ck("前から入っている人は入っていない", PK_OLD not in got, PK_OLD not in got)
    ck("ずれている人も、毎晩のほうでは触らない", PK_DRIFT not in got,
       PK_DRIFT not in got)
    ck("入るのは新規の1人だけ", list(got) == [PK_NEW], len(got))


def case4():
    print("\n[4] すでに入っているぶんの直し（管理スクリプト）")
    plan = plan_fix(TABLE, DONATIONS)
    ck("すでに合っている件数", plan["ok"] == 1, plan["ok"])
    ck("元データに無くて触らない件数", plan["unknown"] == 1, plan["unknown"])
    ck("ずれていた件数", plan["off"] == 1, plan["off"])
    ck("直す行の数", len(plan["fix"]) == 1, len(plan["fix"]))
    ck("直せない人は直す行に入っていない", PK_GHOST not in plan["fix"],
       PK_GHOST not in plan["fix"])
    # 9/10 22:05 JST に来た人が、9/11 07:41 JST として入っていた＝**1日ずれ**
    ck("ずれの内訳（1日）", plan["days"]["1日"] == 1, plan["days"])
    ck("直したあとの札の日付",
       jst_date(plan["fix"][PK_DRIFT]) == "2026-09-10",
       jst_date(plan["fix"][PK_DRIFT]))

    # 2日以上のずれも数えられること（境目の確認）
    far = plan_fix(
        {PK_DRIFT: {"firstSeenAt": "2026-09-13T22:41:00+00:00"}}, DONATIONS)
    ck("ずれの内訳（2日以上）", far["days"]["2日以上"] == 1, far["days"])
    # 同じ日のうちに入っていたぶんは「0日」。札の字は変わらない
    same = plan_fix(
        {PK_DRIFT: {"firstSeenAt": "2026-09-10T14:00:00+00:00"}}, DONATIONS)
    ck("ずれの内訳（0日）", same["days"]["0日"] == 1, same["days"])


def case5():
    print("\n[5] 日付は日本時間で切る（UTC の夕方は、日本ではもう翌日）")
    ck("22:05 JST（13:05 UTC）は 9月10日",
       jst_date("2026-09-10T13:05:00+00:00") == "2026-09-10",
       jst_date("2026-09-10T13:05:00+00:00"))
    ck("00:30 JST（前日 15:30 UTC）は 9月11日",
       jst_date("2026-09-10T15:30:00+00:00") == "2026-09-11",
       jst_date("2026-09-10T15:30:00+00:00"))
    ck("末尾が Z でも読める",
       jst_date("2026-09-10T15:30:00Z") == "2026-09-11",
       jst_date("2026-09-10T15:30:00Z"))


def case6_public():
    """**公開の枝を実際に流す。** 出た字は次の case6_grep が見る。"""
    print("\n[6] 公開の場では、1人ずつの明細が1行も出ない")
    os.environ["GITHUB_ACTIONS"] = "true"
    # 毎晩の取り込みが流すのと同じ形（doneru_supporters / nordic_supporters /
    # island_cards の3つとも、この関数を通している）
    rows = [
        (CID, HANDLE),                      # スパチャの名簿
        (PK_NEW, LABEL),                    # 紐付け待ちの どねID
        (f"{CID}_fakeImageId", "2026-09-10", CID),   # カードの鍵
    ]
    lines = detail_lines(rows)
    ck("公開の場で流す行の数", lines == [], len(lines))
    for line in lines:
        print(line)


def case6_grep():
    """**出力を grep する。** ここだけは袋を読むので、最後に回す。"""
    text = BUF.getvalue().split("[6の結果]")[0]
    shapes = {
        "チャンネルID（UC + 22文字）": r"UC[0-9A-Za-z_-]{22}",
        "どねID（10桁）": r"\b\d{10}\b",
        "ハンドル（@…）": r"@[^\s　]{2,}",
        "表示名": re.escape(LABEL),
    }
    for label, pat in shapes.items():
        n = len(re.findall(pat, text))
        ck(f"{label} の出現回数", n == 0, n)
    print(f"    （grep した出力は {len(text)} 文字）")


def case7_hand():
    """手で回したときは、いままで通り出る（**消えていないこと**の確認）。"""
    print("\n[7] 手元で回したときは、いままで通り1人ずつ出る")
    os.environ.pop("GITHUB_ACTIONS", None)
    lines = detail_lines([(CID, HANDLE)])
    ck("行の数", len(lines) == 1, len(lines))
    ck("チャンネルIDが入っている", CID in "".join(lines), "入っている")


def main() -> int:
    print("=== 偽のデータで、投げ銭まわりの決めを動かす（本番には1バイトも出ない） ===")
    case1()
    case2()
    case3()
    case4()
    case5()
    case6_public()
    print("\n[6の結果]")
    case6_grep()
    case7_hand()
    sys.stdout = REAL
    print()
    if FAILED:
        print(f"✕ 通らなかった確かめ {len(FAILED)} 件: {', '.join(FAILED)}")
        return 1
    print("○ ぜんぶ通りました")
    return 0


if __name__ == "__main__":
    sys.exit(main())
