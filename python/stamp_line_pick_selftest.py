"""`stamp_line_pick` の確かめ（#716）。**偽の字だけで回る。**

    python3 python/stamp_line_pick_selftest.py
    BREAK=gate python3 python/stamp_line_pick_selftest.py   # 壊して赤くする

BigQuery も Firestore も資格情報も要らない。

## なぜ、これを書いたか

ここが外れると、**あやとが「採用するわけない」と言う字を本人に見せる。**

あやとの言葉（#716、2026-10-10）:

> **「うん」とか出すのやめて。採用するわけない。個性がなさすぎる。**
> あと候補が少なくてしっくりこない。もっとこのセリフがその人っぽい！ってのがあるはず

**前の式は、これを通していた。** 日数（何日にわたって言ったか）を主軸に
したので、**毎日みんなが使う字がいちばん上に来た**（「うん」が 92日）。
らしさは √ で弱めてあって、日数の差で負けた。

だからここで当てるのは4つ。どれも**赤くならない外れ方**。

  1. **個性のない字が候補に出る**（「うん」「はい」「こんばんは」「ありがとう」）
  2. **珍しい名セリフが落ちる**（回数の少ない字。「まめまめキューン」の形）
  3. **1行に2つ言っている片方が、1回も数えられない**（「たのしかった！」の形）
  4. **挨拶がくっついたまま出る**（「イケオニこんばんは」の形）

## 個性のない字の表は、**判定には使わない**

下の `PLAIN` は**対照**で、選ぶ側は1文字も見ていない。
門（`MANY_SPEAKERS`）は「何人が言ったか」しか見ないので、
**表に無い字でも、みんなが言っていれば落ちる。**
表の役は「門が効いているか」を当てることだけ。

## 壊して赤くなることを、その場で見る（`island-standards` §15）

`BREAK=` を渡すと**判定の足を1本ずつ抜ける。** 抜いたら
**赤くならなければならない**ので、`BREAK` 付きのときは**通ったら 1 で落ちる。**

| `BREAK=` | 抜く足 | 通ってしまうもの |
| --- | --- | --- |
| `gate` | 門（何人が言ったか） | 「うん」「こんばんは」が候補に出る |
| `share` | 割合（その字の半分以上がその人か） | 人のことばを借りた字が出る |
| `rare` | 珍しい字を1回でも通す決め | 「まめまめキューン」が落ちる |
| `parts` | 言い切りごとに切る | 「たのしかった！」が1回も数えられない |
| `peel` | 島のことばを剥がす | 「イケオニ」が出ない |
| `days` | 日数を点に入れない決め | 日数の多い字が上に来る（前の式に戻る） |

## 終了コード

0=通った / 1=落ちた（`BREAK` 付きなら 0=壊れたと分かった / 1=分からなかった）
"""

import math
import os
import sys

import stamp_line_pick as P
from stamp_line_pick import (
    GOOD_LEN,
    MANY_SPEAKERS,
    MAX_LEN,
    MIN_SAID,
    MIN_SHARE,
    TOP,
    clean,
    fold,
    gated,
    norm,
    pick_all,
    score,
    shape_check,
    short_of,
    tally,
    texts_of,
    tidy,
    usable,
)

BAD = 0
CAUGHT: list = []
BREAK = (os.getenv("BREAK") or "").strip()


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
    CAUGHT.append(name)
    print(f"  NG   {name}" + (f" — {why}" if why else ""))


# ---------------------------------------------------------------- 足を抜く

if BREAK == "gate":
    # 門を外す。**「うん」が候補に出る**
    P.MANY_SPEAKERS = 10 ** 9
elif BREAK == "share":
    P.MIN_SHARE = 0.0
elif BREAK == "rare":
    # 珍しい字も2回言わないと通さない（回数で殴る側に戻す）
    P.lone_said = lambda speakers: P.MIN_SAID  # noqa: ARG005
elif BREAK == "parts":
    P.parts = lambda text: []  # noqa: ARG005
elif BREAK == "peel":
    P.PEEL_SPEAKERS = 10 ** 9
elif BREAK == "days":
    # 前の式に戻す（日数 × √らしさ × 短さ）
    P.score = lambda share, n, text: (
        1.0 * math.sqrt(max(share, 0.0)) * short_of(text))
elif BREAK:
    print(f"BREAK={BREAK} は知らない足です（gate/share/rare/parts/peel/days）")
    sys.exit(1)


# ---------------------------------------------------------------- 偽の中身

# 偽のチャンネルID。**本物の形（`UC` + 22文字）から1文字ずらしてある。**
# このファイルは公開のリポジトリに残るので、本物の形で並べない
ME = "UC_me_000000000000000"
YOU = "UC_you_00000000000000"
MOB = ["UC_mob{:d}_0000000000000".format(i) for i in range(12)]

# **あやとが名指しした「個性のない字」。**
# **判定には1文字も使わない。** 門が効いているかを当てるための対照
PLAIN = ["うん", "はい", "こんばんは", "ありがとう"]

# **その人の名セリフ。** みんなは言わない
FAME = "えがたえがた"

# **珍しい名セリフ。** 1回しか言っていない（「まめまめキューン」の形）
RARE = "まめまめキューン"

# **1行に2つ言っているところ。** 後ろは島のみんなが言う字
TWO = "たのしかった！ おやすみなさい！"
TWO_HEAD = "たのしかった！"

# **1行に2つ言っていて、どちらも島のことばではないところ。**
# 剥がす側（`peels`）では1本も取れないので、**切る側だけが拾える**。
# 後ろを長くしてあるのは、**行まるごとだと長さで負ける**ようにするため——
# 短い行だと、切らなくても行まるごとが候補に入ってしまって、
# 切る側が効いているかが見えない
PAIR = "ほんま！ ええやんめっちゃええやん！"
PAIR_HEAD = "ほんま！"

# **空白で区切ってある1つの名セリフ。** 空白でも切るが、
# 同じ回数なら丸ごとのほうが先に並ぶので、切れ端は候補に出ない
SPACED = "コン バンワ"

# **挨拶がくっついている名セリフ。** 剥がすと前だけ残る
STUCK = "イケオニこんばんは"
STUCK_HEAD = "イケオニ"

# **長い名セリフ。** 20字ちょうど。短さの下駄で消してはいけない
LONGONE = "この先のコンビニで買ってやってくれ"


def rows() -> list:
    """偽の数え上げ。`(チャンネルID, 打った字, 回数, 日数)`。

    Returns:
        並び
    """
    r = [
        (ME, FAME, 18, 7),
        (ME, FAME + "！", 3, 2),        # **同じ鍵**（末尾の感嘆符は揃う）
        (ME, RARE, 1, 1),               # **1回だけ。島で1人なら通す**
        (ME, TWO, 2, 2),
        (ME, PAIR, 3, 2),
        (ME, SPACED, 9, 7),
        (ME, STUCK, 16, 16),
        (ME, LONGONE, 4, 3),
        (ME, "w", 40, 20),              # 短すぎる。**落ちる**
        (ME, "https://example.invalid/とてもすごい", 5, 4),  # URL。**落ちる**
        (ME, ":yt_laugh::yt_laugh:", 20, 9),  # カスタム絵文字だけ。**落ちる**
        (ME, "あ" * (MAX_LEN + 5), 9, 7),      # 長すぎる。**落ちる**
        (YOU, "ほなちがうか〜", 6, 4),
    ]
    # **個性のない字を、島ぜんぶに広げる。** 門（人数）で落ちる。
    #
    # **わたしがいちばん多く言っていることにしておく。**
    # ここで相手に多く言わせると、割合（`MIN_SHARE`）のほうで落ちてしまって、
    # **門を外しても赤くならない**（本番の「うん」は、いちばん喋る人が
    # いちばん多く言っている字なので、割合では落ちない）。
    # 回数と日数でも落としていないことを、ここ1か所で当てている
    for w in PLAIN:
        r.append((ME, w, 296, 92))
        r += [(m, w, 10, 8) for m in MOB]
    # 島のみんなが言う挨拶（剥がす相手・切り離す相手）
    r += [(m, "こんばんは", 80, 40) for m in MOB]
    r += [(m, "おやすみなさい！", 12, 9) for m in MOB]
    return r


C = tally(rows(), who=[ME, YOU])
GOT = pick_all(rows(), [ME, YOU], top=TOP, counts=C)
MINE = texts_of(GOT.get(ME, []))

print("# 0. 探し方が当たるか（先に見る）")
check("わたしの候補が出る", len(MINE) >= 5, str(MINE))
check("名セリフが1位", MINE[:1] == [FAME], str(MINE))
check("もう1人ぶんも出る",
      texts_of(GOT.get(YOU, []))[:1] == ["ほなちがうか〜"],
      str(texts_of(GOT.get(YOU, []))))
check("回数・日数・人数・割合が付いて返る",
      {"n", "d", "people", "share"} <= set(GOT[ME][0]), str(GOT[ME][0]))

print("\n# 1. **個性のない字が、1本も出ていない**")
for w in PLAIN:
    check(f"「{w}」が候補に出ていない（島で何人も言っている）",
          w not in MINE, str(MINE))
check("島のみんなが言う挨拶も出ていない",
      "こんばんは" not in MINE and "おやすみなさい！" not in MINE, str(MINE))
check("落ちた理由が「人数」として並ぶ（黙って落とさない）",
      [g["why"] for g in gated(C.own[ME], C, 4)].count("人数") >= 1,
      str([(g["text"], g["why"]) for g in gated(C.own[ME], C, 4)]))

print("\n# 2. **珍しい名セリフが残っている**")
check(f"1回しか言っていない字が候補に出る（島で1人だけなら）",
      RARE in MINE, str(MINE))
# **割合は、偽データから数え直す。** 手で写すと、偽データを直した日に
# 写し間違いが起きても赤くならない
PLAIN_N = 296
PLAIN_SHARE = PLAIN_N / max(int(C.all_n.get(norm(PLAIN[0]), PLAIN_N)), 1)
# **回数で殴らせない。** 296倍言っていても、点は 6.7倍しか動かない
# （3乗根）。ここを1乗にすると、回数の多い字が珍しい名セリフを
# **300倍の点で**押しのける
check("回数が 296倍でも、点は 7倍までしか動かない（3乗根）",
      score(1.0, 296, "あいうえ") / score(1.0, 1, "あいうえ") < 7.0,
      f"{score(1.0, 296, 'あいうえ') / score(1.0, 1, 'あいうえ'):.2f} 倍")
# **点では勝てない。落としているのは門。**
# ここを「点で勝つ」と書くと嘘になる——いちばん喋る人の「うん」は
# 割合も回数も高いので、**式では上に来る**。だから門が要る
check("回数 296 の個性のない字は、点では上に来てしまう（だから門が要る）",
      score(PLAIN_SHARE, PLAIN_N, PLAIN[0]) > score(1.0, 1, RARE),
      f"{score(PLAIN_SHARE, PLAIN_N, PLAIN[0]):.3f} / "
      f"{score(1.0, 1, RARE):.3f}")
check("**個性のない字は、割合では落ちていない**"
      "（落としているのは門。本番と同じ形）",
      PLAIN_SHARE >= MIN_SHARE, f"{PLAIN_SHARE:.3f}")
check("20字に近い長い名セリフも残る",
      LONGONE in MINE, str(MINE))

print("\n# 3. **1行に2つ言っている片方が、ちゃんと数えられている**")
check("言い切りごとに切れている", TWO_HEAD in MINE, str(MINE))
check("**島のことばが1つも入っていない行でも、切れている**"
      "（剥がす側では取れない）", PAIR_HEAD in MINE, str(MINE))
check("切る前の行まるごとは並ばない（2つ言っているほう）",
      PAIR not in MINE, str(MINE))
check("後ろ（島のみんなが言う字）は出ていない",
      "おやすみなさい！" not in MINE, str(MINE))
check("切る前の行まるごとは並ばない（同じ言い方を2本出さない）",
      TWO not in MINE, str(MINE))

print("\n# 4. **挨拶がくっついた名セリフが、剥がれている**")
check("剥がした残りが出る", STUCK_HEAD in MINE, str(MINE))
check("くっついたままのものは並ばない", STUCK not in MINE, str(MINE))
check("剥がすのは1回だけ（2字まで削れない）",
      all(len(t) >= 2 for t in MINE), str(MINE))
check("**剥がした残りが、剥がす前の字より先に並ぶ**"
      "（同じ点なら、挨拶が付いていないほう）",
      STUCK_HEAD in MINE and STUCK not in MINE, str(MINE))
check("**頭は剥がさない**（語尾だけの切れ端を作らない）",
      "こんばんは" not in MINE and all(not t.startswith("ニ") for t in MINE),
      str(MINE))

print("\n# 4.5 **空白で切っても、丸ごとのほうが残る**")
check("空白で区切った名セリフが、そのまま候補に出る",
      SPACED in MINE, str(MINE))
check("**切れ端（前半だけ）が候補に出ていない**"
      "（同じ回数なら、丸ごとのほうが先に並ぶ）",
      "コン" not in MINE, str(MINE))
check("**言い切りの印ちがいを、2本並べない**",
      fold("たのしかった おやすみなさい！")
      == fold("たのしかった！ おやすみなさい！"),
      f"{fold('たのしかった おやすみなさい！')} / "
      f"{fold('たのしかった！ おやすみなさい！')}")

print("\n# 5. 関所を1本ずつ当てる（他の関所は通る形で）")
# **人数（門）。** 回数も割合も長さも通るのに、何人も言っているだけで落ちる
mob = [(ME, "みんなのくち", 40, 20)]
mob += [(m, "みんなのくち", 1, 1) for m in MOB[:MANY_SPEAKERS - 1]]
check(f"{MANY_SPEAKERS} 人が言っている字は落ちる（回数は多くても）",
      "みんなのくち" not in texts_of(pick_all(mob, [ME]).get(ME, [])),
      str(texts_of(pick_all(mob, [ME]).get(ME, []))))
few = [(ME, "みんなのくち", 40, 20)]
few += [(m, "みんなのくち", 1, 1) for m in MOB[:MANY_SPEAKERS - 2]]
check(f"{MANY_SPEAKERS - 1} 人なら残る",
      "みんなのくち" in texts_of(pick_all(few, [ME]).get(ME, [])),
      str(texts_of(pick_all(few, [ME]).get(ME, []))))
# **割合。** 2人しか言っていなくても、相手のほうがずっと多ければ落ちる
half = [(ME, "わけあい", 5, 3), (YOU, "わけあい", 5, 3)]
check(f"割合が {MIN_SHARE} ぴったりなら残る",
      "わけあい" in texts_of(pick_all(half, [ME]).get(ME, [])))
low = [(ME, "わけあい", 4, 3), (YOU, "わけあい", 9, 5)]
check("相手のほうが多く言っている字は落ちる",
      "わけあい" not in texts_of(pick_all(low, [ME]).get(ME, [])),
      str(texts_of(pick_all(low, [ME]).get(ME, []))))
# **回数。** 2人で分けているなら、1回では通さない
one = [(ME, "いちどだけ", 1, 1), (YOU, "いちどだけ", 1, 1)]
check(f"2人が言っている字は、{MIN_SAID} 回言っていないと落ちる",
      pick_all(one, [ME]).get(ME) is None,
      str(texts_of(pick_all(one, [ME]).get(ME, []))))
# **長さ。** 関所（20字）は据え置き
over = [(ME, "あ" * (MAX_LEN + 1), 9, 9)]
check(f"{MAX_LEN} 字より長い字は落ちる", pick_all(over, [ME]).get(ME) is None)
check("短すぎる字・URL・カスタム絵文字だけの行が入っていない",
      all("http" not in t and ":" not in t and len(t) >= 2 for t in MINE),
      str(MINE))

print("\n# 6. 日常度（日数）は、**同点決着にしか効かない**")
check("式に日数が入っていない（同じ割合・回数・長さなら同じ点）",
      score(1.0, 5, "あいうえ") == score(1.0, 5, "かきくけ"))
# **これが 2026-10-10 に外した形そのもの。**
# 92日にわたって言った個性のない字より、2日しか言っていない名セリフが上
check("**92日にわたって言っていても、個性のない字は1本も出ない**",
      all(w not in MINE for w in PLAIN), str(MINE))
check("同じ点なら、日数の多いほうが先に並ぶ",
      texts_of(pick_all([(ME, "おなじてん", 4, 4), (ME, "おなじ点", 4, 2)],
                        [ME], top=2).get(ME, []))[:1] == ["おなじてん"],
      str(texts_of(pick_all([(ME, "おなじてん", 4, 4), (ME, "おなじ点", 4, 2)],
                            [ME], top=2).get(ME, []))))

print("\n# 7. 重みが、決めたとおりか")
check("らしさは2乗で効く（割合が倍なら、点は4倍）",
      abs(score(1.0, 8, "あいうえ") / score(0.5, 8, "あいうえ") - 4.0) < 1e-9)
check("回数は3乗根（回数が8倍で、点は2倍）",
      abs(score(1.0, 8, "あいうえ") / score(1.0, 1, "あいうえ") - 2.0) < 1e-9)
check(f"{GOOD_LEN} 字までは、長さの下駄がつかない",
      short_of("あ" * GOOD_LEN) == 1.0 and short_of("あ") == 1.0)
check(f"{MAX_LEN} 字でも 0.7 倍までしか薄くならない（長い名セリフを殺さない）",
      short_of("あ" * MAX_LEN) > 0.7,
      f"{short_of('あ' * MAX_LEN):.3f}")
# **11字の名セリフが、7字の字に負けない。** 本番の1回目で
# 「まめまめキューーーン」（11字）がこれで10本から落ちた
check("11字と7字が、同じ回数・同じ独占なら同じ点（下駄を付けすぎない）",
      score(1.0, 3, "あ" * 11) == score(1.0, 3, "あ" * 7),
      f"{score(1.0, 3, 'あ' * 11):.3f} / {score(1.0, 3, 'あ' * 7):.3f}")
check("らしさが同じなら、回数の多いほうが上",
      score(1.0, 20, "あいうえ") > score(1.0, 3, "あいうえ"))

print("\n# 8. 字は、言い方を変えずに整える")
check("末尾の句点は落ちる", tidy("おばんですー。") == "おばんですー")
check("伸ばし棒は残る", tidy("おばんですー") == "おばんですー")
check("笑いは残る", tidy("かわいいw") == "かわいいw")
check("感嘆符は残る", tidy("ワーイ！！") == "ワーイ！！")
check("真ん中の読点は残る", tidy("湖、楽しみ") == "湖、楽しみ")
check("句点だけの字は、落として空にしない", tidy("。") == "。")
dot = [(ME, "おばんですー。", 10, 6), (ME, "おばんですー", 6, 5)]
one_of = pick_all(dot, [ME], top=3).get(ME, [{}])[0]
check("出す字は句点が落ちている", one_of.get("text") == "おばんですー",
      str(one_of))
check("元の字は打った形のまま残る", one_of.get("from") == "おばんですー。",
      str(one_of))
check("同じ字が2本にならない（句点ちがいは1本）",
      len(pick_all(dot, [ME], top=3).get(ME, [])) == 1)

print("\n# 9. 鍵は揃える。**ただし「コン バンワ」は潰さない**")
check("鍵は揃えるが、置く字は揃えない",
      norm("ありがとう！") == norm("ありがとう！")
      and clean("ありがとう！") == "ありがとう！")
check("語尾の伸ばし棒は鍵では揃う", norm("ねむい〜") == norm("ねむい"))
check("末尾の `w` は鍵では揃う", norm("あやちゃんw") == norm("あやちゃん"))
check("大文字の `W` は削らない（NEW が NE にならない）", norm("NEW") == "new")
check("**「コン バンワ」と「こんばんは」は別の鍵**",
      norm("コン バンワ") != norm("こんばんは"),
      f"{norm('コン バンワ')} / {norm('こんばんは')}")
check("**真ん中の空白が消えていない**", " " in norm("コン バンワ"),
      norm("コン バンワ"))
kana = [(ME, "コン バンワ", 25, 25)] + [(m, "こんばんは", 80, 40) for m in MOB]
check("島のみんなが「こんばんは」と言っていても、「コン バンワ」は残る",
      "コン バンワ" in texts_of(pick_all(kana, [ME]).get(ME, [])),
      str(texts_of(pick_all(kana, [ME]).get(ME, []))))

print("\n# 10. 探すときだけ畳む（`fold` / `near` / `by_word`）")
check("伸ばし棒ちがいは、探すときは近い",
      P.near("ばーい", {norm("ばあい"): {"n": 9, "d": 5,
                                        "raw": {"ばあい": 9}}}, C),
      "ばあい が出ない")
check("片仮名と平仮名は、探すときは同じ",
      fold("イケオニ") == fold("いけおに"))
check("**畳んでも「コン バンワ」と「こんばんは」は別**",
      fold("コン バンワ") != fold("こんばんは"),
      f"{fold('コン バンワ')} / {fold('こんばんは')}")
check("語で探せる（うろ覚えのぶん）",
      [x["text"] for x in P.by_word("コンビニ", C.own[ME], C)] == [LONGONE],
      str(P.by_word("コンビニ", C.own[ME], C)))
check("近い字が1本も無ければ空で返る（無いものを作らない）",
      P.near("ぜんぜんちがうことば", C.own[ME], C) == [])

print("\n# 11. 採点表の形（渡されたものを、置いてよい形にする）")
check("名前の無いものは落ちる", shape_check([{"lines": ["あ"]}]) == [])
check("字と語が入る",
      shape_check([{"name": " だれか ", "lines": [" あいうえ ", ""],
                    "words": ["かきく"]}])
      == [{"name": "だれか", "lines": ["あいうえ"], "words": ["かきく"]}])
check("並びでないものを渡しても落ちない", shape_check({"name": "x"}) == [])

print("\n# 12. 同じ入力なら、同じ答え（乱数を使っていない）")
a = pick_all(rows(), [ME, YOU], top=TOP)
b = pick_all(list(reversed(rows())), [ME, YOU], top=TOP)
check("並びを逆にしても同じ", a == b, f"{texts_of(a.get(ME, []))}")

print("\n# 13. 選ばれていない人のぶんは作らない")
check("渡していないチャンネルは入らない",
      YOU in GOT and MOB[0] not in GOT)
check("1人も渡さなければ空", pick_all(rows(), []) == {})
check("数え上げが空でも落ちない", pick_all([], [ME]) == {})
check("日数の無い並び（3つ組）でも落ちない",
      texts_of(pick_all([(ME, "みっつぐみ", 3)], [ME]).get(ME, []))
      == ["みっつぐみ"])

print("\n# 14. 出す本数")
check(f"既定は {TOP} 本（あやと「候補が少なくてしっくりこない」）", TOP >= 8)
many = [(ME, f"ことば{i:02d}です", 3, 2) for i in range(20)]
check(f"候補がたくさんあるときは {TOP} 本出る",
      len(pick_all(many, [ME], top=TOP).get(ME, [])) == TOP,
      str(len(pick_all(many, [ME], top=TOP).get(ME, []))))

print("\n# 15. 整えるところ")
check("空は使えない", not usable(""))
check("記号だけは使えない", not usable("！！！"))
check("数字だけは使えない", not usable("1234"))
check("絵文字だけの行は空になる", clean("🎉🎉") == "")
check("改行は1つの余白になる", clean("あし\nたも") == "あし たも")
check("前後の余白は落ちる", clean("  よし  ") == "よし")

print("")
if BREAK:
    # **壊した側。** 赤くなっていなければ、見張りは何も守っていない
    if BAD:
        print(f"BREAK={BREAK} で NG が {BAD} 件。**壊したら赤くなる**")
        for n in CAUGHT[:6]:
            print(f"  捕まえた: {n}")
        sys.exit(0)
    print(f"BREAK={BREAK} なのに、ぜんぶ通ってしまった。"
          "**この足は誰も見ていない**")
    sys.exit(1)
if BAD:
    print(f"NG が {BAD} 件。")
    sys.exit(1)
print("ぜんぶ通った。")
