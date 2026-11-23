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
7. **島の投げ銭（#1405）は払った額のまま足す。** 島 1,000 は 1,000、
   スパチャ 1,000 ＋ 島 1,000 は 1,500。寄せるのはスパチャと同じ `channelId` の側
8. **`island_yen` を渡さないと `TypeError`**（既定値を持たせない。
   `docs/island-standards.md` 30.4）。`merge()` の `island` も同じ
9. **島の投げ銭の無い月（2026-11 より前）は、順位も額も前と1円も変わらない。**
   直す前の `merge()` と `rank()` の写し（下の `_old_*`）と、偽の月を
   200通り並べて突き合わせる
10. **割り算は `viewer_yen()` の1行だけ**（`docs/island-money.md` 1章）。
   `fund_box` を読み込んでいる道具に、自前の `// 2` が無いこと

## 対照（`BREAK=`。`docs/island-standards.md` §15）

  fxzero  … 直っていない行を 0円 として足す → [6] が落ちる
  fxraw   … 円に直す前の額をそのまま足す    → [6] [7] が落ちる
  fxdrop  … 円に直せた行をランキングに足さない → [6] [7] が落ちる
  default … `fund_box.py` の `island_yen` に既定値（`= 0`）を足した写しを読む
            → [9] の TypeError の足だけが落ちる
"""

import os
import random
import re
import sys
import types
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

BREAK = os.environ.get("BREAK", "")

# **対照 `default` は、ほかを読み込む前に刺す。** 本物の `fund_box.py` の字を
# 書き換えた写し（`island_yen` に `= 0` を足したもの）を `fund_box` として読ませる。
# リポジトリのファイルは1バイトも変わらない
if BREAK == "default":
    _src = (HERE / "fund_box.py").read_text(encoding="utf-8")
    _sig = "*, island_yen: int)"
    if _src.count(_sig) != 2:
        print(f"✕ 対照を当てられない: fund_box.py に `{_sig}` が {_src.count(_sig)} か所（2か所のはず）")
        sys.exit(2)
    _mod = types.ModuleType("fund_box")
    _mod.__file__ = str(HERE / "fund_box.py")
    exec(compile(_src.replace(_sig, "*, island_yen: int = 0)"), _mod.__file__, "exec"),
         _mod.__dict__)
    sys.modules["fund_box"] = _mod

# **`fx_detail()` は通貨の読み方を `python/island_tips.py` から借りる。**
# あちらは `config` を読み込むので `BQ_PROJECT_ID` が要る——が、
# **BigQuery にも Firestore にも1バイトも触らない**（読むのは表記の字だけ）。
# ここで置いておかないと、手元で直に回したときだけ落ちる
os.environ.setdefault("BQ_PROJECT_ID", "monthly-tips-selftest-reads-no-bigquery")

import build_residents as B  # noqa: E402
import fund_box  # noqa: E402
import fx_rate  # noqa: E402
import monthly_tips as M  # noqa: E402
from fund_box import SUPERCHAT_RATE, box, viewer_yen  # noqa: E402
from logsafe import detail_lines, mask  # noqa: E402
from monthly_tips import (  # noqa: E402
    Roster, fx_detail, fx_stuck, fx_superchats, island_rows, merge, norm_key,
    rank, total,
)

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
    ok("スパチャ 1,000 は 500 になる", viewer_yen(1000, 0, island_yen=0), 500)
    ok("Doneru 1,000 は 1,000 のまま", viewer_yen(0, 1000, island_yen=0), 1000)
    ok("実額の足し算にはならない", viewer_yen(1000, 1000, island_yen=0) != 2000, True)
    ok("割る数は貯金箱と同じ", SUPERCHAT_RATE, 2)
    ok("貯金箱は貢献額から支出を引いたもの",
       box(65060, 26500, 7000, island_yen=0), viewer_yen(65060, 26500, island_yen=0) - 7000)


def case_floor():
    """[2] 端数は切り捨て。"""
    print("\n[2] 半分にして端数が出たとき（奇数円）")
    ok("321 円のスパチャは 160（切り上げの 161 ではない）",
       viewer_yen(321, 0, island_yen=0), 160)
    ok("1 円のスパチャは 0", viewer_yen(1, 0, island_yen=0), 0)
    ok("貯金箱と同じ丸め方", viewer_yen(321, 0, island_yen=0), box(321, 0, 0, island_yen=0))


def case_sum():
    """[3] 合計が豚の算数と1円まで合う。"""
    print("\n[3] 行ごとに丸めてから足しても、豚とずれないか")
    # 奇数円のスパチャを持つ人が3人。**1人ずつ半分にすると 1円ずつ落ちる**
    sc = [
        {"channelId": "UC_mako", "handle": "@まこも-z3i", "yen": 333},
        {"channelId": "UC_sky", "handle": "@スカイライン-t2w", "yen": 555},
        {"channelId": "UC_x", "handle": "@だれか", "yen": 777},
    ]
    rows = rank(merge(sc, [], Roster(CHARS), island=[]))
    got = total(rows)
    # 豚は「1人ぶんの合計」を半分にする。人ごとに分かれている時点で、
    # 行の合計と島ぜんぶの合計は**別の数になりうる**。ここで見るのは
    # 「行の合計 == 行ごとの viewer_yen の合計」であること
    want = sum(viewer_yen(s["yen"], 0, island_yen=0) for s in sc)
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
    rows = rank(merge(sc, dn, r, island=[]))
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
    rows = rank(merge(sc, [], r, island=[]))
    ok("多い順", [x["yen"] for x in rows], [2000, 1000, 1000])
    ok("同額は同順位", [x["rank"] for x in rows], [1, 2, 2])
    ok("同額の並びは実行のたびに入れ替わらない",
       [x["display"] for x in rows[1:]], ["@a", "@c"])
    ok("0円になった人は出さない",
       [x["display"] for x in rank(merge(
           [{"channelId": "z", "handle": "@z", "yen": 1}], [], r, island=[]))], [])


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
    rows = rank(merge(sc + add, [], r, island=[]))
    ok("÷2 は円に直したあとの合計にかかる", rows[0]["yen"],
       viewer_yen(1000 + 323, 0, island_yen=0))

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
        sc + M.fx_superchats(detail), [], Roster([]), island=[]))[0]["yen"],
        viewer_yen(1317, 0, island_yen=0))


def case_island():
    """[8] 島の投げ銭（#1405）は払った額のまま。寄せるのはスパチャの側。"""
    print("\n[8] 島の投げ銭（払った額のまま・スパチャと同じ側で寄せる）")
    ok("島 1,000 は 1,000 のまま", viewer_yen(0, 0, island_yen=1000), 1000)
    ok("スパチャ 1,000 ＋ 島 1,000 は 1,500", viewer_yen(1000, 0, island_yen=1000), 1500)
    ok("Doneru 1,000 ＋ 島 1,000 は 2,000", viewer_yen(0, 1000, island_yen=1000), 2000)
    ok("島は割らない（奇数円もそのまま）", viewer_yen(1, 0, island_yen=333), 333)
    ok("貯金箱も同じ式（支出を引くだけ）",
       box(1000, 0, 300, island_yen=1000), viewer_yen(1000, 0, island_yen=1000) - 300)

    r = Roster(CHARS)
    sc = [{"channelId": "UC_sky", "handle": "@スカイライン-t2w", "yen": 1000},
          {"channelId": "UC_nobody", "handle": "@図鑑に無い人", "yen": 1001}]
    il = [{"channelId": "UC_sky", "handle": "スカイライン", "yen": 1000},
          {"channelId": "UC_nobody", "handle": "図鑑に無い人", "yen": 500},
          {"channelId": "UC_mako", "handle": "まこも", "yen": 777}]
    rows = rank(merge(sc, [], r, island=il))
    by = {x["display"]: x for x in rows}
    ok("同じチャンネルのスパチャと島は1行になる（図鑑に当たる人）",
       by["@スカイライン-t2w"]["yen"], 1000 // 2 + 1000)
    ok("図鑑に当たらなくても、同じチャンネルなら1行になる",
       (len(rows), by["@図鑑に無い人"]["yen"]), (3, 1001 // 2 + 500))
    ok("島だけの人は図鑑のキャラクターで出る", by["@まこも-z3i"]["char"], "mako")
    ok("島だけの人の額は払った額のまま", by["@まこも-z3i"]["yen"], 777)

    led = [
        {"source": "island", "sourceEventId": "island:cs_a", "channelId": "UC_sky",
         "amount": 1000, "currency": "JPY", "displayNameSnapshot": "スカイライン"},
        {"source": "doneru", "sourceEventId": "doneru:1", "channelId": "UC_sky",
         "amount": 9999, "currency": "JPY"},
        {"source": "youtube_superchat", "sourceEventId": "yt:v:e", "channelId": "UC_sky",
         "amount": 8888, "currency": "JPY"},
        # 額の読めない島の行・チャンネルの無い島の行。**0 にせず、件数で返す**
        {"source": "island", "sourceEventId": "island:cs_b", "channelId": "UC_x",
         "amount": None, "currency": "JPY"},
        {"source": "island", "sourceEventId": "island:cs_c", "channelId": None,
         "amount": 500, "currency": "JPY"},
    ]
    got, stuck = island_rows(led)
    ok("台帳から拾うのは島の行だけ（スパチャと Doneru は拾わない）",
       got, [{"channelId": "UC_sky", "handle": "スカイライン", "yen": 1000}])
    ok("足せない島の行は件数で返る", stuck, 2)


def case_typeerror():
    """[9] `island_yen` を渡さないと TypeError。"""
    import inspect

    print("\n[9] island_yen を渡さないと TypeError（既定値を持たせない）")

    def raises(fn) -> bool:
        try:
            fn()
        except TypeError:
            return True
        return False

    ok("viewer_yen(1000, 0) は TypeError", raises(lambda: fund_box.viewer_yen(1000, 0)), True)
    ok("box(1000, 0, 0) は TypeError", raises(lambda: fund_box.box(1000, 0, 0)), True)
    ok("位置で渡しても TypeError（名前で書かせる）",
       raises(lambda: fund_box.viewer_yen(1000, 0, 1000)), True)
    for fn in (fund_box.viewer_yen, fund_box.box):
        p = inspect.signature(fn).parameters["island_yen"]
        ok(f"{fn.__name__} の island_yen は名前だけ・既定値なし",
           (p.kind == p.KEYWORD_ONLY, p.default is p.empty), (True, True))
    ok("merge() の island も省略できない",
       raises(lambda: merge([], [], Roster([]))), True)


# ---- 直す前（2026-11-23 の master）の `merge()` と `rank()` の写し。**変えない** ----
# [10] で、島の投げ銭の無い月が前と1円も変わらないことの物差しにする


def _old_viewer_yen(superchat_yen, doneru_yen):
    return superchat_yen // 2 + doneru_yen


def _old_merge(superchats, doneru, roster):
    rows = {}

    def slot(key, handle, display, char):
        r = rows.get(key)
        if r is None:
            r = rows[key] = {
                "char": char, "handle": handle, "display": display,
                "sc": 0, "dn": 0,
            }
        if char and not r["char"]:
            r["char"], r["display"] = char, display
        if handle and not r["handle"]:
            r["handle"] = handle
        return r

    for s in superchats:
        handle = str(s.get("handle") or "")
        char = roster.by_channel(s.get("channelId"))
        key = ("c", char) if char else ("s", str(s.get("channelId") or handle))
        name = (roster.by_id.get(char, {}).get("channelName") or handle
                if char else handle)
        slot(key, handle, name, char)["sc"] += int(s.get("yen") or 0)

    for d in doneru:
        name = str(d.get("name") or "")
        char = roster.by_alias(name)
        key = ("c", char) if char else ("d", norm_key(name) or name)
        shown = roster.by_id.get(char, {}).get("channelName") or name
        slot(key, "", shown, char)["dn"] += int(d.get("yen") or 0)

    return list(rows.values())


def _old_rank(rows):
    out = []
    for r in rows:
        yen = _old_viewer_yen(int(r["sc"]), int(r["dn"]))
        if yen <= 0:
            continue
        out.append({**r, "yen": yen})
    out.sort(key=lambda r: (-r["yen"], r["display"]))
    for i, r in enumerate(out):
        r["rank"] = out[i - 1]["rank"] if i and out[i - 1]["yen"] == r["yen"] \
            else i + 1
    return out


def case_past():
    """[10] 島の投げ銭の無い月は、順位も額も前と1円も変わらない。"""
    print("\n[10] 島の投げ銭の無い月（2026-11 より前）は、前と1円も変わらない")
    rnd = random.Random(20261123)
    names = ["ひー", "まこも", "おなじなまえ", "ayato arigato", "スカイライン", "@まこも-z3i",
             "  ヒー ", "だれか", "Ｂob", ""]

    def shown(rows):
        return [(x["rank"], x["display"], x["yen"], x["char"], x["handle"], x["sc"], x["dn"])
                for x in rows]

    diff = 0
    months = 200
    people = 0
    for _ in range(months):
        chans = [f"UC_p{i}" for i in range(rnd.randint(1, 30))] + ["UC_sky", "UC_mako", "UC_f1"]
        sc = [{"channelId": rnd.choice(chans),
               "handle": rnd.choice(["", "@h1", "@h2", "@スカイライン-t2w"]),
               "yen": rnd.choice([1, 99, 100, 321, 500, 1000, 1001, 5000, 10000, 50000])}
              for _ in range(rnd.randint(0, 40))]
        dn = [{"name": rnd.choice(names), "yen": rnd.choice([0, 1, 100, 333, 500, 1000, 3000])}
              for _ in range(rnd.randint(0, 25))]
        # 台帳には島の行が無い（スパチャと Doneru だけ）。月末の道と同じく台帳から拾う
        led = [{"source": rnd.choice(["youtube_superchat", "doneru"]),
                "channelId": rnd.choice(chans), "amount": 1000, "currency": "JPY"}
               for _ in range(rnd.randint(0, 5))]
        isl, stuck = island_rows(led)
        new = rank(merge(sc, dn, Roster(CHARS), island=isl))
        old = _old_rank(_old_merge(sc, dn, Roster(CHARS)))
        people += len(old)
        if shown(new) != shown(old) or total(new) != total(old) or stuck:
            diff += 1
    ok(f"偽の月 {months}通り（{people}行）で、順位・呼び名・額・合計が前と同じ", diff, 0)
    ok("偽の月に人が並んでいる（0行どうしの一致で通らない）", people > 1000, True)
    ok("島の無い月は、どの行も島が 0円",
       all(x["il"] == 0 for x in rank(merge(
           [{"channelId": "UC_sky", "handle": "", "yen": 1000}], [], Roster(CHARS),
           island=[]))), True)


def halvings(text: str) -> list:
    """Python の字句から、**半分にしている演算**の行番号を拾う。

    字の並びで探すと、説明の中の `jpy * 0.5`（OBS の写し）や文字列に当たる。
    字句（`tokenize`）で見れば、コメントと文字列は最初から外れる。
    拾うのは `// 2`・`// SUPERCHAT_RATE`・`// fb.SUPERCHAT_RATE`・`* 0.5`。

    Args:
        text: ファイルの中身

    Returns:
        行番号の並び
    """
    import io
    import tokenize

    toks = [t for t in tokenize.generate_tokens(io.StringIO(text).readline)
            if t.type not in (tokenize.COMMENT, tokenize.NL, tokenize.NEWLINE,
                              tokenize.INDENT, tokenize.DEDENT)]
    out = []
    for i, t in enumerate(toks[:-1]):
        nxt = toks[i + 1]
        if t.type == tokenize.OP and t.string == "//":
            rhs = [x.string for x in toks[i + 1:i + 4]]
            if nxt.string == "2" or nxt.string == "SUPERCHAT_RATE" \
                    or rhs[:3] == ["fb", ".", "SUPERCHAT_RATE"]:
                out.append(t.start[0])
        if t.type == tokenize.OP and t.string == "*" and nxt.string == "0.5":
            out.append(t.start[0])
    return out


def case_divide():
    """[11] 割り算は `viewer_yen()` の1行だけ。"""
    print("\n[11] 割り算は viewer_yen() の1行だけ（自前の // 2 が無いか）")
    reads = re.compile(r"^\s*(?:import fund_box\b|from fund_box import)", re.M)
    seen, bad = 0, []
    for f in sorted(HERE.rglob("*.py")):
        if f.name.endswith("_selftest.py") or "__pycache__" in f.parts:
            continue
        text = f.read_text(encoding="utf-8")
        if f.name != "fund_box.py" and not reads.search(text):
            continue
        seen += 1
        bad += [f"{f.relative_to(HERE)}:{n}" for n in halvings(text)]
    one = "return superchat_yen // SUPERCHAT_RATE + doneru_yen + island_yen"
    want = [f"fund_box.py:{i}" for i, line in enumerate(
        (HERE / "fund_box.py").read_text(encoding="utf-8").splitlines(), 1) if one in line]
    ok("fund_box を読む道具を数えた（0本なら何も見ていない）", seen >= 5, True)
    ok("割っているのは viewer_yen() の1行だけ", bad, want)
    ok("その1行が在る", len(want), 1)
    # **両側。** 拾い方が寝ていないか（自前の半分を書いた字を食わせる）
    ok("拾い方が効く（// 2・// fb.SUPERCHAT_RATE・* 0.5 を拾い、説明の字は拾わない）",
       halvings('x = a // 2\ny = b // fb.SUPERCHAT_RATE\nz = c * 0.5\n'
                '"""jpy * 0.5 と // 2"""\nw = d // 3  # // 2\n'), [1, 2, 3])


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
    case_island()
    case_typeerror()
    case_past()
    case_divide()

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
