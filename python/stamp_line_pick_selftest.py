"""`stamp_line_pick` の確かめ（#716）。**偽の字だけで回る。**

    python3 python/stamp_line_pick_selftest.py

BigQuery も Firestore も資格情報も要らない。

## なぜ、これを書いたか

ここが外れると、**本人に「あなたの口ぐせはこれです」と嘘を見せる。**
いちばん出やすい外れ方は2つで、どちらも赤くならない。

  1. **みんなの挨拶が1位になる**（「こんばんは」を全員に出す）
  2. **1回しか言っていない字が出る**（口ぐせではない）

どちらも「候補が3本出た」だけ見ていると通る。だから、出た中身を当てる。

## 探し方が当たることを、先に見る（`docs/island-misses.md` #19）

「挨拶が入っていない」は、**候補が0本でも通る。** だから先に
「その人の口ぐせがちゃんと1位に来る」ことを見てから、
「挨拶が落ちている」ことを見る。

## 終了コード

0=通った / 1=落ちた
"""

import sys

from stamp_line_pick import (
    MAX_LEN,
    MIN_SAID,
    MIN_SHARE,
    clean,
    norm,
    pick_all,
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
MOB = ["UC_mob{:d}_0000000000000".format(i) for i in range(8)]

# **挨拶。** 島のみんなが同じだけ言う。落ちなければいけない
HELLO = "こんばんは"

# **その人の口ぐせ。** 2人で分け合っているが、こちらのほうが多い
MINE = "いやぁまいったね"

# **1回しか言っていない字。** 落ちなければいけない
ONCE = "きょうはさむいね"


def rows() -> list:
    """偽の数え上げ。`(チャンネルID, 打った字, 回数)`。

    Returns:
        並び
    """
    r = [
        # わたし
        (ME, MINE, 6),
        (ME, MINE + "🎉", 2),          # **絵文字つきは同じ口ぐせ**
        (ME, HELLO, 30),               # みんなも言う挨拶。**落ちる**
        (ME, ONCE, 1),                 # 1回だけ。**落ちる**
        (ME, "w", 40),                 # 短すぎる。**落ちる**
        (ME, "https://example.invalid/とてもすごい", 5),  # URL。**落ちる**
        (ME, ":yt_laugh::yt_laugh:", 20),  # カスタム絵文字だけ。**落ちる**
        (ME, "あ" * (MAX_LEN + 5), 9),  # 長すぎる。**落ちる**
        (ME, "ねむい", 4),              # 2本目の口ぐせ
        (ME, "そうきたか", 3),          # 3本目
        (ME, "なるほどね", 2),          # 4本目（3本で切れるので出ない）
        # もう1人。同じ口ぐせを少しだけ言う
        (YOU, MINE, 2),
        (YOU, HELLO, 30),
        (YOU, "たべたい", 5),
    ]
    # **挨拶を島ぜんぶに広げる。** これで share が下がって落ちる
    r += [(m, HELLO, 30) for m in MOB]
    return r


print("# 0. 探し方が当たるか（先に見る）")
got = pick_all(rows(), [ME, YOU], top=3)
check("わたしの候補が3本出る", len(got.get(ME, [])) == 3, str(got.get(ME)))
check(
    "口ぐせが1位（絵文字つきと同じものとして数えている）",
    got.get(ME, [None])[0] == MINE,
    str(got.get(ME)),
)
check("2本目・3本目も口ぐせ",
      got.get(ME, [])[1:] == ["ねむい", "そうきたか"], str(got.get(ME)))
# もう1人は「たべたい」(5回・独り占め) が1位。**同じ口ぐせを2回言っている**
# ので、割合の下限ちょうど（2/10）で2本目に残る。**これは正しい**——
# 2人で分け合っている言い回しは、どちらのものでもある
check("もう1人ぶんも出る", got.get(YOU, [None])[0] == "たべたい",
      str(got.get(YOU)))
check("分け合っている口ぐせは、下限ちょうどなので残る",
      got.get(YOU) == ["たべたい", MINE], str(got.get(YOU)))

print("\n# 1. 落ちるものが落ちている")
mine = got.get(ME, [])
check("みんなの挨拶が入っていない", HELLO not in mine, str(mine))
check("1回だけの字が入っていない", ONCE not in mine, str(mine))
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

print("\n# 2. 挨拶が落ちるのは、割合のせい（回数ではない）")
# **挨拶を言うのが自分だけになったら、ちゃんと出る。**
# これを見ないと「長さで落ちていた」のか「割合で落ちていた」のか分からない
alone = [(ME, HELLO, 30), (ME, "ねむい", 4)]
check("自分だけが言っている挨拶は出る",
      pick_all(alone, [ME], top=3).get(ME, [None])[0] == HELLO,
      str(pick_all(alone, [ME], top=3).get(ME)))
# ちょうど境目の確かめ。share が下限ぴったりなら残る
half = [(ME, "ぎりぎり", 2), (YOU, "ぎりぎり", 8)]
check(f"割合が {MIN_SHARE} ぴったりなら残る",
      pick_all(half, [ME], top=3).get(ME) == ["ぎりぎり"],
      str(pick_all(half, [ME], top=3).get(ME)))
low = [(ME, "ぎりぎり", 2), (YOU, "ぎりぎり", 9)]
check("割合が下限を割ったら落ちる",
      pick_all(low, [ME], top=3).get(ME) is None,
      str(pick_all(low, [ME], top=3).get(ME)))

print("\n# 3. 回数の線")
one = [(ME, "いちどだけ", MIN_SAID - 1)]
check(f"{MIN_SAID} 回未満は落ちる", pick_all(one, [ME]).get(ME) is None)
two = [(ME, "にどめ", MIN_SAID)]
check(f"{MIN_SAID} 回なら残る", pick_all(two, [ME]).get(ME) == ["にどめ"])

print("\n# 4. 同じ入力なら、同じ答え（乱数を使っていない）")
a = pick_all(rows(), [ME, YOU], top=3)
b = pick_all(list(reversed(rows())), [ME, YOU], top=3)
check("並びを逆にしても同じ", a == b, f"{a} / {b}")

print("\n# 5. 字そのものは書き換えない")
check("置くのは、その人がいちばん多く打った形",
      MINE in got.get(ME, []), str(got.get(ME)))
check("鍵は揃えるが、置く字は揃えない",
      norm("ありがとう！") == norm("ありがとう！")
      and clean("ありがとう！") == "ありがとう！",
      f"{norm('ありがとう！')} / {clean('ありがとう！')}")
check("語尾の伸ばし棒は鍵では揃う",
      norm("ねむい〜") == norm("ねむい"), norm("ねむい〜"))

print("\n# 6. 選ばれていない人のぶんは作らない")
check("渡していないチャンネルは入らない", YOU in pick_all(rows(), [ME, YOU])
      and MOB[0] not in pick_all(rows(), [ME, YOU]))
check("1人も渡さなければ空", pick_all(rows(), []) == {})
check("数え上げが空でも落ちない", pick_all([], [ME]) == {})

print("\n# 7. 整えるところ")
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
