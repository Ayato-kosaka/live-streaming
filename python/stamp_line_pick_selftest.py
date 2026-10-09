"""`stamp_line_pick` の確かめ（#716）。**偽の字だけで回る。**

    python3 python/stamp_line_pick_selftest.py

BigQuery も Firestore も資格情報も要らない。

## なぜ、これを書いたか

ここが外れると、**本人に「あなたの口ぐせはこれです」と嘘を見せる。**
いちばん出やすい外れ方は4つで、どれも赤くならない。

  1. **みんなの挨拶が1位になる**（「こんばんは」を全員に出す）
  2. **1回しか言っていない字が出る**（口ぐせではない）
  3. **その場かぎりの実況が出る**（「特大花火が打ち上がりました！！」）←2026-10-09 に実際に出た
  4. **長すぎて1枚に乗らない字が出る**（20字）←同上

3と4は、**前の式（回数 × 割合）では上位に来るのが正しかった。**
だから「候補が3本出た」だけ見ていると通る。ここでは**前の式なら上に来て、
いまの式なら落ちる**ことを、同じ偽データで両方当てる。

## 探し方が当たることを、先に見る（`docs/island-misses.md` #19）

「実況が入っていない」は、**候補が0本でも通る。** だから先に
「その人の口ぐせがちゃんと1位に来る」ことを見てから、
「実況が落ちている」ことを見る。

## 関所は1本ずつ抜いて当てる（`island-standards` 15）

日数・長さ・らしさ・回数の4つは、**どれか1つが効いていなくても
他の3つで落ちることがある。** だから「落ちた」だけを見ない。
**その関所だけに当たる字を1本ずつ用意して、他の関所は通る形**にしてある。

## 終了コード

0=通った / 1=落ちた
"""

import sys

from stamp_line_pick import (
    GOOD_LEN,
    MAX_LEN,
    MIN_DAYS,
    MIN_SAID,
    MIN_SHARE,
    clean,
    norm,
    pick_all,
    score,
    score_before,
    short_of,
    texts_of,
    tidy,
    usable,
)

BAD = 0


def check(name: str, ok: bool, why: str = "") -> None:
    """1件の確かめ。

    Args:
        name: 何を見ているか
        ok: 通ったか
        why: 落ちたときに出す中身（**偽の字だけ**）
    """
    global BAD
    if ok:
        print(f"  ok   {name}")
        return
    BAD += 1
    print(f"  NG   {name}" + (f" — {why}" if why else ""))


# ---------------------------------------------------------------- 偽の中身

# 偽のチャンネルID。**本物の形（`UC` + 22文字）から1文字ずらしてある。**
# このファイルは公開のリポジトリに残るので、本物の形で並べない
ME = "UC_me_000000000000000"
YOU = "UC_you_00000000000000"
EV = "UC_ev_000000000000000"
LN = "UC_ln_000000000000000"
MOB = ["UC_mob{:d}_0000000000000".format(i) for i in range(8)]

# **挨拶。** 島のみんなが同じだけ言う。落ちなければいけない
HELLO = "こんばんは"

# **その人の口ぐせ。** 2人で分け合っているが、こちらのほうが多い
MINE = "いやぁまいったね"

# **1回しか言っていない字。** 落ちなければいけない
ONCE = "きょうはさむいね"

# **その場かぎりの実況。** 1日に固まっている。落ちなければいけない
EVENT = "特大花火が打ち上がりました"

# **配信の中でしか意味がない長い字。** 20字ちょうど
LONG = "こんばんはお疲れ様です高評価押しましたよ"


def rows() -> list:
    """偽の数え上げ。`(チャンネルID, 打った字, 回数, 日数)`。

    Returns:
        並び
    """
    r = [
        # わたし
        (ME, MINE, 6, 5),
        (ME, MINE + "🎉", 2, 2),       # **絵文字つきは同じ口ぐせ**
        (ME, HELLO, 30, 20),           # みんなも言う挨拶。**落ちる**
        (ME, ONCE, 1, 1),              # 1回だけ。**落ちる**
        (ME, "w", 40, 20),             # 短すぎる。**落ちる**
        (ME, "https://example.invalid/とてもすごい", 5, 4),  # URL。**落ちる**
        (ME, ":yt_laugh::yt_laugh:", 20, 9),  # カスタム絵文字だけ。**落ちる**
        (ME, "あ" * (MAX_LEN + 5), 9, 7),      # 長すぎる。**落ちる**
        (ME, EVENT, 4, 1),             # **1日に固まった実況。落ちる**
        (ME, "ねむい", 4, 4),           # 2本目の口ぐせ
        (ME, "そうきたか", 3, 3),       # 3本目
        (ME, "なるほどね", 2, 2),       # 4本目（3本で切れるので出ない）
        # もう1人。同じ口ぐせを少しだけ言う
        (YOU, MINE, 2, 2),
        (YOU, HELLO, 30, 20),
        (YOU, "たべたい", 5, 5),
    ]
    # **挨拶を島ぜんぶに広げる。** これで share が下がって落ちる
    r += [(m, HELLO, 30, 20) for m in MOB]
    return r


print("# 0. 探し方が当たるか（先に見る）")
got = pick_all(rows(), [ME, YOU], top=3)
mine = texts_of(got.get(ME, []))
check("わたしの候補が3本出る", len(mine) == 3, str(mine))
check(
    "口ぐせが1位（絵文字つきと同じものとして数えている）",
    mine[:1] == [MINE],
    str(mine),
)
check("2本目・3本目も口ぐせ", mine[1:] == ["ねむい", "そうきたか"], str(mine))
check("もう1人ぶんも出る", texts_of(got.get(YOU, []))[:1] == ["たべたい"],
      str(texts_of(got.get(YOU, []))))
check("回数も日数も付いて返る",
      got.get(ME, [{}])[0].get("n") == 8 and got.get(ME, [{}])[0].get("d") == 5,
      str(got.get(ME, [{}])[0]))

print("\n# 1. 落ちるものが落ちている")
check("みんなの挨拶が入っていない", HELLO not in mine, str(mine))
check("1回だけの字が入っていない", ONCE not in mine, str(mine))
check("**1日に固まった実況が入っていない**", EVENT not in mine, str(mine))
check("短すぎる字が入っていない", "w" not in mine, str(mine))
check("URL の行が入っていない",
      not any("http" in t for t in mine), str(mine))
check("カスタム絵文字だけの行が入っていない",
      not any(":" in t for t in mine), str(mine))
check(f"{MAX_LEN} 字より長い字が入っていない",
      all(len(t) <= MAX_LEN for t in mine), str(mine))
check("絵文字が1文字も残っていない",
      not any(ord(c) > 0x2000 and ord(c) < 0x3000 or ord(c) > 0x1F000
              for t in mine for c in t), str(mine))

print("\n# 2. 関所を1本ずつ当てる（他の関所は通る形で）")
# **日数。** 回数も割合も長さも通るのに、1日に固まっているだけで落ちる
one_day = [(ME, "いちにちだけ", 9, 1), (ME, "まいにち", 4, 4)]
check(f"{MIN_DAYS} 日に満たない字は落ちる（回数は {MIN_SAID} 以上あっても）",
      texts_of(pick_all(one_day, [ME], top=3).get(ME, [])) == ["まいにち"],
      str(texts_of(pick_all(one_day, [ME], top=3).get(ME, []))))
two_day = [(ME, "ふつかめ", 2, MIN_DAYS)]
check(f"{MIN_DAYS} 日なら残る",
      texts_of(pick_all(two_day, [ME], top=3).get(ME, [])) == ["ふつかめ"])
# **回数。** 1回しか言っていなければ、日数も1日なので落ちる
one = [(ME, "いちどだけ", MIN_SAID - 1, 1)]
check(f"{MIN_SAID} 回未満は落ちる", pick_all(one, [ME]).get(ME) is None)
# **らしさ。** 日数も回数も長さも通るのに、みんなが言っているだけで落ちる
half = [(ME, "ぎりぎり", 2, 2), (YOU, "ぎりぎり", 8, 8)]
check(f"割合が {MIN_SHARE} ぴったりなら残る",
      texts_of(pick_all(half, [ME], top=3).get(ME, [])) == ["ぎりぎり"])
low = [(ME, "ぎりぎり", 2, 2), (YOU, "ぎりぎり", 9, 9)]
check("割合が下限を割ったら落ちる", pick_all(low, [ME], top=3).get(ME) is None)
# **らしさを捨てていない。** 何日言っていようが、みんなの字は落ちる
many = [(ME, HELLO, 100, 60)] + [(m, HELLO, 100, 60) for m in MOB]
check("60日にわたって言っていても、みんなの挨拶なら落ちる",
      pick_all(many, [ME], top=3).get(ME) is None)
# **長さ。** 関所（20字）は据え置き
over = [(ME, "あ" * (MAX_LEN + 1), 9, 9)]
check(f"{MAX_LEN} 字より長い字は落ちる", pick_all(over, [ME]).get(ME) is None)

print("\n# 3. 前の式なら上に来て、いまの式では落ちる（新しい軸が効いている証拠）")
# **その場かぎりの実況。** 回数は多いが1日に固まっている
ev = [(EV, EVENT, 4, 1), (EV, "ねむい", 3, 3)]
check("前の式では、実況が1位だった",
      texts_of(pick_all(ev, [EV], top=3, before=True).get(EV, []))[:1]
      == [EVENT],
      str(texts_of(pick_all(ev, [EV], top=3, before=True).get(EV, []))))
check("いまの式では、実況が1本も出ない",
      texts_of(pick_all(ev, [EV], top=3).get(EV, [])) == ["ねむい"],
      str(texts_of(pick_all(ev, [EV], top=3).get(EV, []))))
# **長すぎる字。** 回数は多いが1枚に乗らない
ln = [(LN, LONG, 4, 4), (LN, "了解やで", 3, 3)]
check("前の式では、20字の字が1位だった",
      texts_of(pick_all(ln, [LN], top=3, before=True).get(LN, []))[:1]
      == [LONG],
      str(texts_of(pick_all(ln, [LN], top=3, before=True).get(LN, []))))
check("いまの式では、短いほうが1位",
      texts_of(pick_all(ln, [LN], top=3).get(LN, []))[:1] == ["了解やで"],
      str(texts_of(pick_all(ln, [LN], top=3).get(LN, []))))

print("\n# 4. 軸の重みが、決めたとおりか")
# **日数がいちばん強い。** 同じ割合・同じ長さなら、日数の多いほうが上
check("同じ割合・同じ長さなら、日数の多いほうが上",
      score(6, 1.0, "あいうえ") > score(3, 1.0, "あいうえ"))
# **長さ。** 同じ日数・同じ割合なら、短いほうが上
check("同じ日数・同じ割合なら、短いほうが上",
      score(3, 1.0, "あいうえ") > score(3, 1.0, "あ" * 16))
check(f"{GOOD_LEN} 字までは、長さの下駄がつかない",
      short_of("あ" * GOOD_LEN) == 1.0 and short_of("あ") == 1.0)
check(f"{MAX_LEN} 字は {GOOD_LEN}/{MAX_LEN} 倍まで薄くなる",
      abs(short_of("あ" * MAX_LEN) - GOOD_LEN / MAX_LEN) < 1e-9)
# **らしさは弱めてある。** 日数が倍なら、割合の低い字が勝てる
check("らしさを強くしすぎていない（日数が倍なら、割合 0.3 の字が 1.0 に勝つ）",
      score(6, 0.3, "あいうえ") > score(3, 1.0, "あいうえ"))
check("前の式（割合が1乗）なら、逆に珍しい字が勝っていた",
      score_before(3, 1.0) > score_before(6, 0.3))
# **らしさを捨ててもいない。** 日数が同じなら、らしさの高いほうが上
check("日数が同じなら、らしさの高いほうが上",
      score(4, 1.0, "あいうえ") > score(4, 0.3, "あいうえ"))

print("\n# 5. 日数は足さない（max を取る）")
# 同じ日に書き方を変えただけのものを足すと、1日の実況が2日に化ける
same_day = [(ME, EVENT + "！！", 2, 1), (ME, EVENT + "！", 2, 1)]
check("同じ鍵の日数を足していない（足すと実況が素通りする）",
      pick_all(same_day, [ME], top=3).get(ME) is None,
      str(texts_of(pick_all(same_day, [ME], top=3).get(ME, []))))

print("\n# 6. 字は、言い方を変えずに整える")
check("末尾の句点は落ちる", tidy("おばんですー。") == "おばんですー")
check("伸ばし棒は残る", tidy("おばんですー") == "おばんですー")
check("笑いは残る", tidy("かわいいw") == "かわいいw")
check("感嘆符は残る", tidy("ワーイ！！") == "ワーイ！！")
check("真ん中の読点は残る", tidy("湖、楽しみ") == "湖、楽しみ")
check("句点だけの字は、落として空にしない", tidy("。") == "。")
# 置く字は tidy ずみ、元の字はそのまま返る
dot = [(ME, "おばんですー。", 10, 6), (ME, "おばんですー", 6, 5)]
one_of = pick_all(dot, [ME], top=3).get(ME, [{}])[0]
check("出す字は句点が落ちている", one_of.get("text") == "おばんですー",
      str(one_of))
check("元の字は打った形のまま残る", one_of.get("from") == "おばんですー。",
      str(one_of))
check("同じ字が2本にならない（句点ちがいは1本）",
      len(pick_all(dot, [ME], top=3).get(ME, [])) == 1)

print("\n# 7. 鍵は揃える（置く字は揃えない）")
check("鍵は揃えるが、置く字は揃えない",
      norm("ありがとう！") == norm("ありがとう！")
      and clean("ありがとう！") == "ありがとう！",
      f"{norm('ありがとう！')} / {clean('ありがとう！')}")
check("語尾の伸ばし棒は鍵では揃う",
      norm("ねむい〜") == norm("ねむい"), norm("ねむい〜"))
check("末尾の句点は鍵では揃う",
      norm("おばんですー。") == norm("おばんですー"))
check("末尾の `w` は鍵では揃う",
      norm("あやちゃんw") == norm("あやちゃん"))
check("末尾の `笑` `草` も鍵では揃う",
      norm("かわいい笑") == norm("かわいい")
      and norm("かわいい草") == norm("かわいい"))
check("大文字の `W` は削らない（NEW が NE にならない）",
      norm("NEW") == "new")
wd = [(ME, "あやちゃん", 5, 4), (ME, "あやちゃんw", 2, 2)]
check("「あやちゃん」と「あやちゃんw」が2本に並ばない",
      texts_of(pick_all(wd, [ME], top=3).get(ME, [])) == ["あやちゃん"],
      str(texts_of(pick_all(wd, [ME], top=3).get(ME, []))))

print("\n# 8. 同じ入力なら、同じ答え（乱数を使っていない）")
a = pick_all(rows(), [ME, YOU], top=3)
b = pick_all(list(reversed(rows())), [ME, YOU], top=3)
check("並びを逆にしても同じ", a == b, f"{a} / {b}")

print("\n# 9. 選ばれていない人のぶんは作らない")
check("渡していないチャンネルは入らない", YOU in pick_all(rows(), [ME, YOU])
      and MOB[0] not in pick_all(rows(), [ME, YOU]))
check("1人も渡さなければ空", pick_all(rows(), []) == {})
check("数え上げが空でも落ちない", pick_all([], [ME]) == {})
check("日数の無い並び（3つ組）でも落ちない",
      texts_of(pick_all([(ME, "みっつぐみ", 3)], [ME]).get(ME, []))
      == ["みっつぐみ"])

print("\n# 10. 整えるところ")
check("空は使えない", not usable(""))
check("記号だけは使えない", not usable("！！！"))
check("数字だけは使えない", not usable("1234"))
check("絵文字だけの行は空になる", clean("🎉🎉") == "")
check("改行は1つの余白になる", clean("あし\nたも") == "あし たも")
check("前後の余白は落ちる", clean("  よし  ") == "よし")

print("")
if BAD:
    print(f"NG が {BAD} 件。")
    sys.exit(1)
print("ぜんぶ通った。")
