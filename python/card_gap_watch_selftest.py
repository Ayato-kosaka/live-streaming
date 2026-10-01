"""偽のデータで、`card_gap_watch` の**判定の規則だけ**を回す。

    python3 python/card_gap_watch_selftest.py

**Firestore も BigQuery も1バイトも触らない。** 資格情報も要らない
（どちらも偽物を `sys.modules` に置いてから読み込む）。ネットワークにも出ない
（公開の口の判定は、測った結果の数を直に渡して当てる）。

終了コード 0=ぜんぶ通った / 1=落ちた。

## 規則を、ここに書き写さない

見ているのは `card_gap_watch` の `tally` / `judge_day` / `judge_reach` /
`excuse_ok` / `exit_code` / `stale_excuses` **そのもの**で、同じ式を
こちらに持っていない。写すと、本体を直した日にこちらだけ古い規則で緑になる
（`docs/island-misses.md` #99 の「回らない診断」と同じ形）。

## 確かめるもの

| | |
| --- | --- |
| 1 | 写真あり・人あり・カード0 → **赤** |
| 2 | 写真あり・人0・カード0 → **緑**（0枚が正しい） |
| 3 | 0 < カード < 期待 → **黄色** |
| 4 | カード ≧ 期待 → 緑（本番の 9/17 の形） |
| 5 | 逃げ道が正しく書いてあれば外れる。**短い／日付が無いのは受け付けない** |
| 6 | もう要らない逃げ道が字に出る |
| 7 | 数えかたが生の `day`（`videoStartedAt` の補正を真似ていない） |
| 8 | `role` がカードでない画像・`url` の無い画像を数えない |
| 9 | 公開の口: 少ない → 赤 / 同数 → 緑 / 大きい → 黄色 / 読めない → 2 |
| 10 | 終了コード: 測れない(2) が 赤(1) より強い |

## わざと壊して落ちるところまで見る（`docs/island-misses.md` #99 #100）

`CARD_GAP_WATCH_PY` に壊した写しの道を渡すと、そちらを読み込む。

    cp python/card_gap_watch.py /tmp/broken.py   # 判定を逆にする
    CARD_GAP_WATCH_PY=/tmp/broken.py python3 python/card_gap_watch_selftest.py
"""

import importlib.util
import os
import sys
import types

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

# `config.py` はこの環境変数が無いと読み込みの時点で落ちる。本物の名前は
# 要らない（クライアントは1つも作らない）が、無いと確かめそのものが起動
# できない（#99 の「回らない診断」）。**手元の値は上書きしない**
os.environ.setdefault("BQ_PROJECT_ID", "card-gap-watch-selftest")

# ------------------------------------------------------- 偽の google.cloud
#
# `google-cloud-firestore` はこの箱に入っていないことがある。**本体は
# import 文を持ったままでよい**（本番には入っている）ので、先に偽物を置く。
import google.cloud  # noqa: E402

for _name in ("firestore", "bigquery"):
    if f"google.cloud.{_name}" not in sys.modules:
        _mod = types.ModuleType(f"google.cloud.{_name}")
        sys.modules[f"google.cloud.{_name}"] = _mod
        setattr(google.cloud, _name, _mod)
        _mod.Client = lambda **kw: None

# 本体。**写しは持たない**（写しを置くと、本体を直したのに古いものが通る）
_PATH = os.environ.get("CARD_GAP_WATCH_PY") or os.path.join(HERE, "card_gap_watch.py")
_spec = importlib.util.spec_from_file_location("card_gap_watch_under_test", _PATH)
w = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(w)
print(f"# 読み込んだ本体: {_PATH}")

BAD = 0
OK = 0


def check(name, good, why=""):
    """1件の確かめ。"""
    global BAD, OK
    if good:
        OK += 1
        print(f"  ok   {name}")
        return
    BAD += 1
    print(f"  NG   {name}" + (f" — {why}" if why else ""))


def img(day, role="card", url="https://example.invalid/1.jpg", at=0):
    """偽の画像1枚。"""
    return {"day": day, "role": role, "url": url, "at": at}


def tip(day, ch):
    """偽の投げ銭1件。**本番のチャンネルIDは1文字も置かない。**"""
    return {"day": day, "channelId": ch}


def card(day):
    """偽のカード1枚。"""
    return {"day": day}


def row_of(t, day):
    """`tally` の結果から1日ぶんを取り出す。"""
    for r in t["rows"]:
        if r["day"] == day:
            return r
    return None


# 偽のチャンネルID。形だけ本番に揃える（`UC` + 22文字）
CH1 = "UCa1b2c3d4e5f6g7h8i9j0kL"
CH2 = "UCz9y8x7w6v5u4t3s2r1q0pM"
CH3 = "UCm5n4o3p2q1r0s9t8u7v6wN"

print("\n# 0. 数えかた（`tally`）")
T = w.tally(
    images=[
        img("2026-09-21"), img("2026-09-21"),          # 写真2枚
        img("2026-09-22"),                              # 写真1枚
        img("2026-09-23"),                              # 写真1枚
        img("2026-09-24"),                              # 写真1枚（投げ銭0人）
        img("2026-09-25", role="gallery"),              # カード用でない
        img("2026-09-25", url=""),                      # 絵の実体が無い
        img(""),                                        # 日が分からない
    ],
    tips=[
        tip("2026-09-21", CH1), tip("2026-09-21", CH2),
        tip("2026-09-21", CH1),                         # 同じ人が2回
        tip("2026-09-22", CH1), tip("2026-09-22", CH2), tip("2026-09-22", CH3),
        tip("2026-09-23", CH1),
        tip("", CH1),                                   # 日が分からない
        {"day": "2026-09-21"},                          # 誰か分からない
    ],
    cards=[
        card("2026-09-22"), card("2026-09-22"),         # 期待3に対して2枚
        card("2026-09-23"), card("2026-09-23"),         # 期待1に対して2枚
        card(""),                                       # 日が分からない
    ],
)
r21, r22, r23, r24 = (row_of(T, f"2026-09-{d}") for d in ("21", "22", "23", "24"))
check("写真を日ごとに数える", r21 and r21["photos"] == 2, repr(r21))
check("同じ人が2回投げても1人", r21 and r21["people"] == 2, repr(r21))
check("期待 = 写真 × 人", r21 and r21["expected"] == 4, repr(r21))
check("`role` がカードでない画像を数えない",
      row_of(T, "2026-09-25") is None or row_of(T, "2026-09-25")["photos"] == 0,
      repr(row_of(T, "2026-09-25")))
check("誰か分からない投げ銭を人数に入れない", r21 and r21["people"] == 2, repr(r21))
check("日の分からない写真を黙って捨てない（数えて出す）",
      T["noDayImages"] == 1, repr(T["noDayImages"]))
check("日の分からない投げ銭も数える", T["noDayTips"] == 1, repr(T["noDayTips"]))
check("カードの総数は日の分からないぶんも入る",
      T["totalCards"] == 5, repr(T["totalCards"]))
check("新しい順に並ぶ",
      [x["day"] for x in T["rows"]][:2] == ["2026-09-24", "2026-09-23"],
      repr([x["day"] for x in T["rows"]]))

print("\n# 1. 写真あり・人あり・カード0 → 赤")
c, note = w.judge_day(r21, absences={})
check("赤になる", c == w.RED, f"{c} / {note}")
check("何枚と何人かが字に出る", "写真2枚" in note and "2人" in note, note)

print("\n# 2. 写真あり・人0・カード0 → 緑（0枚が正しい）")
c24, n24 = w.judge_day(r24, absences={})
check("写真1枚・0人・カード0 は緑", c24 == w.GREEN, f"{c24} / {n24}")
check("期待も0", r24 and r24["expected"] == 0, repr(r24))

print("\n# 3. 足りない日 → 黄色（赤にしない）")
c22, n22 = w.judge_day(r22, absences={})
check("期待3・カード2 は黄色", c22 == w.YELLOW, f"{c22} / {n22}")
check("期待と実際が字に出る", "3" in n22 and "2" in n22, n22)

print("\n# 4. カード ≧ 期待 → 緑（本番の 9/17 の形）")
c23, n23 = w.judge_day(r23, absences={})
check("期待1・カード2 は緑", c23 == w.GREEN, f"{c23} / {n23}")

print("\n# 5. 逃げ道（`ABSENCES`）")
GOOD = "0時またぎで、この日の人は前日の配信の人だった（2026-10-01 に確かめた）"
check("正しく書いた理由は通る", w.excuse_ok(GOOD), GOOD)
check("短い理由は通らない", not w.excuse_ok("0時またぎ"), "0時またぎ")
check("日付の無い理由は通らない",
      not w.excuse_ok("0時またぎで、この日の人は前日の配信の人だったため"), "")
check("空は通らない", not w.excuse_ok(""), "")
check("None も通らない", not w.excuse_ok(None), "")

c, note = w.judge_day(r21, absences={"2026-09-21": GOOD})
check("正しい逃げ道があれば赤にならない", c == w.EXCUSED, f"{c} / {note}")
check("理由がそのまま字に出る", note == GOOD, note)
c, note = w.judge_day(r21, absences={"2026-09-21": "0時またぎ"})
check("**短い逃げ道は受け付けない（赤のまま）**", c == w.RED, f"{c} / {note}")
check("受け付けなかったと字に出る", "逃げ道" in note, note)
c, note = w.judge_day(r21, absences={"2026-09-21": "0時またぎで前日の配信の人だった"})
check("**日付の無い逃げ道も受け付けない（赤のまま）**", c == w.RED, f"{c} / {note}")
c, note = w.judge_day(r21, absences={"2026-09-99": GOOD})
check("別の日の逃げ道では外れない", c == w.RED, f"{c} / {note}")

print("\n# 6. もう要らない逃げ道は字に出る")
vd = {r["day"]: w.judge_day(r, absences={})[0] for r in T["rows"]}
stale = w.stale_excuses(T["rows"], vd, absences={"2026-09-23": GOOD})
check("赤くない日に書いてある逃げ道が出る", stale == ["2026-09-23"], repr(stale))
vd21 = dict(vd)
vd21["2026-09-21"] = w.EXCUSED
check("効いている逃げ道は出ない",
      w.stale_excuses(T["rows"], vd21, absences={"2026-09-21": GOOD}) == [],
      repr(w.stale_excuses(T["rows"], vd21, absences={"2026-09-21": GOOD})))
check("そもそも無い日の逃げ道も出る",
      w.stale_excuses(T["rows"], vd, absences={"2020-01-01": GOOD}) == ["2020-01-01"],
      "")

print("\n# 7. 数えかたが生の `day`（当たり方の補正を真似ていない）")
# 22時に始まった配信に 00:23 で投げた人。台帳の `day` は翌日になっている。
# **ここは補正しない**——補正を2か所に置くと、同じ日に一緒に壊れる
T2 = w.tally(
    images=[img("2026-09-06")],
    tips=[{"day": "2026-09-07", "channelId": CH1,
           "videoStartedAt": 1757160000000, "donatedAt": 1757201000000}],
    cards=[],
)
check("投げ銭は台帳の `day`（翌日）のまま数える",
      row_of(T2, "2026-09-07") and row_of(T2, "2026-09-07")["people"] == 1,
      repr(T2["rows"]))
check("`videoStartedAt` の日に移していない",
      row_of(T2, "2026-09-06")["people"] == 0, repr(T2["rows"]))

print("\n# 8. 画像の日は `day` → `at` の順（企画を見ない）")
check("`day` があればそれ", w.image_day_raw({"day": "2026-09-21", "at": 0})
      == "2026-09-21", "")
check("`day` が無ければ `at` から切る",
      w.image_day_raw({"at": 1757201000000}) != "", w.image_day_raw({"at": 1757201000000}))
check("どちらも無ければ空", w.image_day_raw({}) == "", "")

print("\n# 9. 公開の口（`judge_reach`）")
c, note = w.judge_reach(617, 600, 343892)
check("**切れていたら赤**（617枚のうち600枚しか返っていない）", c == w.RED, f"{c} / {note}")
check("何枚取れていないかが字に出る", "17枚" in note, note)
c, note = w.judge_reach(617, 617, 343892)
check("同数なら緑", c == w.GREEN, f"{c} / {note}")
c, note = w.judge_reach(617, 617, w.BIG_BYTES + 1)
check("500KB を超えたら黄色（赤にしない）", c == w.YELLOW, f"{c} / {note}")
c, note = w.judge_reach(617, 617, w.BIG_BYTES)
check("ちょうど 500KB は黄色にしない", c == w.GREEN, f"{c} / {note}")
c, note = w.judge_reach(617, None, None)
check("**読めなかったら緑を返さない**", c == w.UNMEASURED, f"{c} / {note}")
check("多く返ってきても赤にしない（上限を外した直後）",
      w.judge_reach(600, 617, 1)[0] == w.GREEN, repr(w.judge_reach(600, 617, 1)))

print("\n# 10. 終了コード")
check("ぜんぶ緑なら 0", w.exit_code([w.GREEN, w.GREEN], w.GREEN) == 0, "")
check("黄色だけなら 0", w.exit_code([w.YELLOW, w.GREEN], w.YELLOW) == 0, "")
check("逃げ道で外した日だけなら 0", w.exit_code([w.EXCUSED], w.GREEN) == 0, "")
check("赤い日があれば 1", w.exit_code([w.GREEN, w.RED], w.GREEN) == 1, "")
check("口が切れていれば 1", w.exit_code([w.GREEN], w.RED) == 1, "")
check("**測れなければ 2**", w.exit_code([w.GREEN], w.UNMEASURED) == 2, "")
check("**測れない(2) は 赤(1) より強い**",
      w.exit_code([w.RED], w.UNMEASURED) == 2, "")

print("\n# 11. 素性を伏せる側に繋がっている")
check("明細は `logsafe.detail_lines` を通す",
      w.detail_lines([("2026-09-21", CH1)], public=True) == [],
      repr(w.detail_lines([("2026-09-21", CH1)], public=True)))
check("手元では出る（対照。空振りでない）",
      CH1 in "".join(w.detail_lines([("2026-09-21", CH1)], public=False)),
      repr(w.detail_lines([("2026-09-21", CH1)], public=False)))

print("\n# 12. いま配ってある逃げ道の表が、形として正しい")
for _day, _why in w.ABSENCES.items():
    check(f"{_day} の理由が12文字以上・日付つき", w.excuse_ok(_why), _why)
check("表が空でも確かめは回っている（分母を出す）",
      isinstance(w.ABSENCES, dict), f"{len(w.ABSENCES)}件")

print("")
if BAD:
    print(f"NG が {BAD} 件（通ったのは {OK} 件）。")
    raise SystemExit(1)
print(f"{OK} 件ぜんぶ通った。")
