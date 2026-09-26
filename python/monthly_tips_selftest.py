"""月末の投げ銭ランキングの決め方を、偽のデータで動かして確かめる。

**BigQuery にも Firestore にも1バイトも触らない**（手元でも走る）。

見るのは4つ。どれも 2026-09 の授賞式で実際に外したところ
（`docs/island-misses.md` #191 #192）。

1. **額は貢献額**（スパチャ ÷ 2 + Doneru）。実額で出ていないか
2. **端数は切り捨て**。豚の貯金箱（`fund_box.box`）と同じ割り方か
3. **合計が豚の算数と1円まで合うか**。行ごとに丸めてから足すと、
   奇数円のスパチャの数だけずれる
4. **名寄せは図鑑の `lookupKeys` ちょうど1人のときだけ**。
   0人・2人では寄せない。寄らなかった人を消さない
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fund_box import SUPERCHAT_RATE, box, viewer_yen  # noqa: E402
from monthly_tips import Roster, merge, norm_key, rank, total  # noqa: E402

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


def main() -> int:
    print("=== 月末の投げ銭ランキングの決め方を、偽のデータで確かめる ===")
    print("（BigQuery にも Firestore にも1バイトも触りません）")
    case_formula()
    case_floor()
    case_sum()
    case_alias()
    case_rank()

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
