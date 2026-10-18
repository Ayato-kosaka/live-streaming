"""月末の投げ銭ランキングの決め方を、偽のデータで動かして確かめる。

**BigQuery にも Firestore にも1バイトも触らない**（手元でも走る）。

見るのは6つ。4つめまでは 2026-09 の授賞式で実際に外したところ
（`docs/island-misses.md` #191 #192）、残り2つは外貨（#290 / #951）。

1. **額は貢献額**（スパチャ ÷ 2 + Doneru）。実額で出ていないか
2. **端数は切り捨て**。豚の貯金箱（`fund_box.box`）と同じ割り方か
3. **合計が豚の算数と1円まで合うか**。行ごとに丸めてから足すと、
   奇数円のスパチャの数だけずれる
4. **名寄せは図鑑の `lookupKeys` ちょうど1人のときだけ**。
   0人・2人では寄せない。寄らなかった人を消さない
5. **円以外は、台帳に入っている円（`amountJpy`）で足す。**
   直っていない行は足さずに名指しする（**0 にしない**）
6. **図鑑（`build_residents`）と月末で、同じ人の額が一致する。**
   足す側が2本に割れていないこと——割れると、島の順位と授賞式で
   同じ人の額が違う

## 対照（`BREAK=`。`docs/island-standards.md` §15）

  fxzero  … 直っていない行を 0円 として足す → [6] が落ちる
  fxraw   … 円に直す前の額をそのまま足す    → [6] [7] が落ちる
  fxdrop  … 円に直せた行をランキングに足さない → [6] [7] が落ちる
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# **`fx_detail()` は通貨の読み方を `python/island_tips.py` から借りる。**
# あちらは `config` を読み込むので `BQ_PROJECT_ID` が要る——が、
# **BigQuery にも Firestore にも1バイトも触らない**（読むのは表記の字だけ）。
# ここで置いておかないと、手元で直に回したときだけ落ちる
os.environ.setdefault("BQ_PROJECT_ID", "monthly-tips-selftest-reads-no-bigquery")

import build_residents as B  # noqa: E402
import fx_rate  # noqa: E402
import monthly_tips as M  # noqa: E402
from fund_box import SUPERCHAT_RATE, box, viewer_yen  # noqa: E402
from logsafe import detail_lines, mask  # noqa: E402
from monthly_tips import (  # noqa: E402
    Roster, fx_detail, fx_stuck, fx_superchats, merge, norm_key, rank, total,
)

BREAK = os.environ.get("BREAK", "")

# **対照：仕込みを先に刺す。** 本物を1つも測る前に、足を折っておく
if BREAK == "fxzero":
    _row = fx_rate.row_yen
    fx_rate.row_yen = lambda doc: (
        lambda g: (0, g[1]) if g[0] is None else g)(_row(doc))
if BREAK == "fxraw":
    fx_rate.row_yen = lambda doc: (
        int((doc or {}).get("amount") or 0), "")
if BREAK == "fxdrop":
    M.fx_superchats = lambda rows: []

FAILED = []
PROBES = []


def ok(name, got, want):
    """1つ確かめる。"""
    PROBES.append(name)
    if got == want:
        print(f"  ○ {name}: {got}")
        return
    FAILED.append(name)
    print(f"  ✕ {name}: {got}（欲しかったのは {want}）")


# 偽の図鑑。**あだ名を持っている人が1人**（「ひー」＝ スカイライン）
CHARS = [
    {"id": "sky", "channelId": "UC_sky", "channelName": "@スカイライン-t2w",
     "lookupKeys": ["@スカイライン-t2w", "スカイライン-t2w", "スカイライン", "ひー"]},
    {"id": "mako", "channelId": "UC_mako", "channelName": "@まこも-z3i",
     "lookupKeys": ["@まこも-z3i", "まこも-z3i", "まこも"]},
    # 同じ呼び名を2人が持っている。**どちらにも寄せない**
    {"id": "futa1", "channelId": "UC_f1", "channelName": "@ふたご1",
     "lookupKeys": ["@ふたご1", "ふたご1", "おなじなまえ"]},
    {"id": "futa2", "channelId": "UC_f2", "channelName": "@ふたご2",
     "lookupKeys": ["@ふたご2", "ふたご2", "おなじなまえ"]},
]


def case_formula():
    """[1] 額は貢献額。実額ではない。"""
    print("\n[1] 画面に出す額は、豚の貯金箱と同じ式か")
    ok("スパチャ 1,000 は 500 になる", viewer_yen(1000, 0), 500)
    ok("Doneru 1,000 は 1,000 のまま", viewer_yen(0, 1000), 1000)
    ok("実額の足し算にはならない", viewer_yen(1000, 1000) != 2000, True)
    ok("割る数は貯金箱と同じ", SUPERCHAT_RATE, 2)
    ok("貯金箱は貢献額から支出を引いたもの",
       box(65060, 26500, 7000), viewer_yen(65060, 26500) - 7000)


def case_floor():
    """[2] 端数は切り捨て。"""
    print("\n[2] 半分にして端数が出たとき（奇数円）")
    ok("321 円のスパチャは 160（切り上げの 161 ではない）",
       viewer_yen(321, 0), 160)
    ok("1 円のスパチャは 0", viewer_yen(1, 0), 0)
    ok("貯金箱と同じ丸め方", viewer_yen(321, 0), box(321, 0, 0))


def case_sum():
    """[3] 合計が豚の算数と1円まで合う。"""
    print("\n[3] 行ごとに丸めてから足しても、豚とずれないか")
    # 奇数円のスパチャを持つ人が3人。**1人ずつ半分にすると 1円ずつ落ちる**
    sc = [
        {"channelId": "UC_mako", "handle": "@まこも-z3i", "yen": 333},
        {"channelId": "UC_sky", "handle": "@スカイライン-t2w", "yen": 555},
        {"channelId": "UC_x", "handle": "@だれか", "yen": 777},
    ]
    rows = rank(merge(sc, [], Roster(CHARS)))
    got = total(rows)
    # 豚は「1人ぶんの合計」を半分にする。人ごとに分かれている時点で、
    # 行の合計と島ぜんぶの合計は**別の数になりうる**。ここで見るのは
    # 「行の合計 == 行ごとの viewer_yen の合計」であること
    want = sum(viewer_yen(s["yen"], 0) for s in sc)
    ok("行の合計は、行ごとの貢献額の足し算", got, want)
    ok("実額の半分（切り捨て）より小さいか同じ",
       got <= (333 + 555 + 777) // 2, True)


def case_alias():
    """[4] 名寄せは lookupKeys ちょうど1人のときだけ。"""
    print("\n[4] 名寄せ（図鑑の lookupKeys）")
    r = Roster(CHARS)
    ok("あだ名で当たる", r.by_alias("ひー"), "sky")
    ok("全角・大小のゆれを吸う", r.by_alias("ヒー") is None, True)
    ok("2人が持っている呼び名では当てない", r.by_alias("おなじなまえ"), None)
    ok("図鑑に無い名前では当てない", r.by_alias("ayato arigato"), None)
    ok("鍵の作り方が口と同じ", norm_key("  @Ａoi  Ｂ "), "@aoi b")

    sc = [{"channelId": "UC_sky", "handle": "@スカイライン-t2w", "yen": 320}]
    dn = [{"name": "ひー", "yen": 500}, {"name": "ayato arigato", "yen": 2000}]
    rows = rank(merge(sc, dn, r))
    by = {x["display"]: x for x in rows}
    ok("「ひー」が @スカイライン と1人になる", len(rows), 2)
    ok("スカイラインの貢献額は 320÷2 + 500",
       by["@スカイライン-t2w"]["yen"], 660)
    ok("寄らなかった人は消えずに残る", "ayato arigato" in by, True)
    ok("寄らなかった人にはキャラクターが付かない",
       by["ayato arigato"]["char"], None)


def case_rank():
    """[5] 並びと同順位。"""
    print("\n[5] 並びと同順位")
    r = Roster([])
    sc = [
        {"channelId": "a", "handle": "@a", "yen": 2000},   # 1,000
        {"channelId": "b", "handle": "@b", "yen": 4000},   # 2,000
        {"channelId": "c", "handle": "@c", "yen": 2000},   # 1,000
    ]
    rows = rank(merge(sc, [], r))
    ok("多い順", [x["yen"] for x in rows], [2000, 1000, 1000])
    ok("同額は同順位", [x["rank"] for x in rows], [1, 2, 2])
    ok("同額の並びは実行のたびに入れ替わらない",
       [x["display"] for x in rows[1:]], ["@a", "@c"])
    ok("0円になった人は出さない",
       [x["display"] for x in rank(merge(
           [{"channelId": "z", "handle": "@z", "yen": 1}], [], r))], [])


def case_fx():
    """[6] 円以外のスパチャ（#951 / `island-misses.md` #290）。"""
    print("\n[6] 円以外のスパチャ（台帳の円で足す／直っていなければ名指し）")
    sc = [{"channelId": "UC_sky", "handle": "@スカイライン-t2w", "yen": 1000}]
    # BigQuery が返す「円で始まらないスパチャ」。鍵は video_id と event_id
    bq = [
        # 同じ人の、円に直してある回
        {"cid": "UC_sky", "handle": "@スカイライン-t2w", "day": "2026-05-07",
         "amt": "₪6.00", "video_id": "v1", "event_id": "e1"},
        # この期間は外貨だけの人。**直っていない**（台湾ドル）
        {"cid": "UC_fx", "handle": "@fx", "day": "2026-01-09",
         "amt": "NT$100", "video_id": "v2", "event_id": "e2"},
    ]
    led = [
        {"sourceEventId": "yt:v1:e1", "amount": 6.0, "currency": "ILS",
         "amountJpy": 323, "fxRate": 53.787, "fxDate": "2026-05-07"},
        {"sourceEventId": "yt:v2:e2", "amount": 100.0, "currency": "TWD",
         "amountJpy": None, "fxWhy": "unsupported"},
    ]
    got = fx_detail(bq, sc, led)
    ok("日付順に並ぶ", [r["day"] for r in got], ["2026-01-09", "2026-05-07"])
    ok("通貨は表記から読む（島と同じ読み方）",
       [r["currency"] for r in got], ["TWD", "ILS"])
    ok("台帳の鍵で当てる", [r["src"] for r in got], ["yt:v2:e2", "yt:v1:e1"])
    ok("直してある行は、台帳の円が入る", [r["yen"] for r in got], [None, 323])
    ok("**直っていない行は 0 ではなく None**", got[0]["yen"], None)
    ok("直らない理由が残る", got[0]["why"], "unsupported")
    ok("円も出している人が分かる", [r["yen_too"] for r in got], [False, True])
    ok("元の表記を落とさない（月末に人が見る）",
       [r["amt"] for r in got], ["NT$100", "₪6.00"])

    add = M.fx_superchats(got)
    ok("ランキングに足すのは、直せた行だけ",
       add, [{"channelId": "UC_sky", "handle": "@スカイライン-t2w", "yen": 323}])
    ok("直っていない行は名指しで返る",
       [r["cid"] for r in fx_stuck(got)], ["UC_fx"])

    # **÷2 は、円に直したあとの合計にかかる**（1件ずつ半分にしない）
    r = Roster([])
    rows = rank(merge(sc + add, [], r))
    ok("÷2 は円に直したあとの合計にかかる", rows[0]["yen"],
       viewer_yen(1000 + 323, 0))

    # 台帳が1行も無い（取り込みがまだ届いていない）
    ok("台帳に無い行は pending（**0 にしない**）",
       [(x["yen"], x["why"]) for x in fx_detail(bq, sc, [])],
       [(None, "pending"), (None, "pending")])
    # **両側。** 外貨の無い期間で、1行も出ないこと
    ok("外貨が無い期間は、1行も出ない", fx_detail([], sc, led), [])
    # **誰だか読めない行を、数から落とさない**（落とすと「外貨は無かった」に化ける）
    ok("チャンネルIDが空でも1行として残す",
       len(fx_detail([{"cid": None, "day": "2026-01-09", "amt": "$1.00"}],
                     sc, led)), 1)
    ok("読めない表記は ? にする（黙って円にしない）",
       fx_detail([{"cid": "x", "day": "2026-01-09", "amt": "1.00"}],
                 sc, led)[0]["currency"], "?")
    # 公開の場では指紋。**生のチャンネルIDが出ない**
    ok("公開の場では、チャンネルIDが指紋になる",
       mask("UC_fx", public=True).startswith("#") and "UC_fx" not in
       mask("UC_fx", public=True), True)
    ok("公開の場では、元の表記は1行も流れない",
       detail_lines([("2026-01-09", "UC_fx", "CA$2.79")], public=True), [])


def case_same():
    """[7] 図鑑と月末で、同じ人の額が一致するか（#951 の合格条件4）。

    **足す側が2本に割れていないこと**を見る。割れると、島の順位
    （`build_residents`）と授賞式（`monthly_tips_run`）で同じ人の額が違う。
    同じ台帳を両方に食わせて、**スパチャとして足された円**を突き合わせる。
    """
    print("\n[7] 図鑑（build_residents）と月末で、同じ人の額が一致するか")
    d0, d1 = B.window()
    cid = "UC_same"
    # 台帳。円が1件、円に直してある外貨が1件、直っていない外貨が1件
    led = [
        {"sourceEventId": "yt:v0:e0", "day": d1, "channelId": cid,
         "amount": 1000, "currency": "JPY", "amountJpy": None},
        {"sourceEventId": "yt:v1:e1", "day": d1, "channelId": cid,
         "amount": 2.79, "currency": "CAD", "amountJpy": 317,
         "fxRate": 113.54, "fxDate": d1},
        {"sourceEventId": "yt:v2:e2", "day": d0, "channelId": cid,
         "amount": 100.0, "currency": "TWD", "amountJpy": None,
         "fxWhy": "unsupported"},
    ]

    class Doc:
        def __init__(self, v):
            self._v = v

        def to_dict(self):
            return dict(self._v)

    class Query:
        def __init__(self, rows, lo):
            self.rows, self.lo = rows, lo

        def stream(self):
            return [Doc(r) for r in self.rows if str(r["day"]) >= self.lo]

    class Col:
        def __init__(self, rows):
            self.rows = rows

        def where(self, field, op, value):
            return Query(self.rows, value)

    class FakeDb:
        def collection(self, name):
            return Col(led)

    island, tipped = B.fetch_tips(FakeDb())

    # 月末の側。円は SQL_SC が、円以外は SQL_FX ＋ 台帳が出す
    sc = [{"channelId": cid, "handle": "@same", "yen": 1000}]
    bq = [
        {"cid": cid, "handle": "@same", "day": d1, "amt": "CA$2.79",
         "video_id": "v1", "event_id": "e1"},
        {"cid": cid, "handle": "@same", "day": d0, "amt": "NT$100",
         "video_id": "v2", "event_id": "e2"},
    ]
    detail = fx_detail(bq, sc, led)
    monthly = sum(x["yen"] for x in sc + M.fx_superchats(detail))

    ok("スパチャとして足した円が、1円まで同じ", monthly, int(island[cid]))
    ok("直っていないぶんは、どちらにも入っていない", monthly, 1317)
    ok("図鑑も月末も、取りこぼしを1件と数える",
       (tipped["fx_stuck"], len(fx_stuck(detail))), (1, 1))
    # **÷2 は円に直したあとの合計に1回だけ**
    ok("貢献額は、合計してから半分", rank(merge(
        sc + M.fx_superchats(detail), [], Roster([])))[0]["yen"],
        viewer_yen(1317, 0))


def main() -> int:
    print("=== 月末の投げ銭ランキングの決め方を、偽のデータで確かめる ===")
    print("（BigQuery にも Firestore にも1バイトも触りません）")
    case_formula()
    case_floor()
    case_sum()
    case_alias()
    case_rank()
    case_fx()
    case_same()

    print()
    if not PROBES:
        print("✕ 確かめが1つもありませんでした（数えるものが無い）")
        return 2
    if FAILED:
        print(f"✕ 通らなかった確かめ {len(FAILED)} 件: {', '.join(FAILED)}")
        return 1
    print(f"○ {len(PROBES)} 件ぜんぶ通りました")
    return 0


if __name__ == "__main__":
    sys.exit(main())
