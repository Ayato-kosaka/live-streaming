"""スタンプに乗せる**候補のことば**を、その人のコメントから選ぶ（#716）。

**ここには置き場も外の口も1つも無い。** 数えたものを渡すと、候補を返す。
BigQuery を引くのと Firestore に置くのは `python/admin/stamp_line_suggest.py`。

## なぜ「本人の言葉から」なのか

あやとの言葉（2026-10-09）:

> どのセリフにするか提案して言い直してもらおう。

**こちらで考えた言葉を出すと、言い直す相手が居ない。** 「これでいいですか」に
なってしまって、本人の口調が1文字も入らない。だから提案は、その人が
**実際に何度も言っている言い回し**から取る。

`docs/island-design.md` 5章「住人のセリフ」は「配信のコメントをそのまま
持ってくるのは禁止」と言っているが、**あれは島の住人に喋らせるときの話**で、
読む相手は初めて来た人。ここは**その人自身のスタンプ**で、読む相手は
その人を知っている人なので、文脈の無いコメントでも意味が通る。

## 選び方は2つの数の掛け算

| 数 | 何を見ているか |
| --- | --- |
| **その人が言った回数**（`own`） | 口ぐせか、1回の思いつきか |
| **島ぜんぶで言われた回数に対する割合**（`share`） | その人のものか、みんなのものか |

割合を見ないと「こんばんは」「おつかれさま」が全員の1位になる。
回数を見ないと、1回しか言っていない珍しい字が上に来る。**両方要る。**

    点 = own × (own / 島ぜんぶで言われた回数)

## 落とすもの

- **短すぎる・長すぎる**（2字未満、20字より長い。スタンプの絵に乗らない）
- **絵文字とカスタム絵文字（`:name:`）だけの行**
- **URL が入っている行**
- **1回しか言っていない**（口ぐせではない）
- **割合が低い**（みんなが言っている字）

**絵文字は落とすのではなく、抜いてから数える。** 「いいね🎉」と「いいね」は
同じ口ぐせなので、別のものとして数えると両方とも回数が足りなくなる。
抜いた結果が2字未満になったら、そこで落ちる。

## 字そのものは書き換えない

数えるための鍵（`norm`）と、置く字（`text`）は別に持つ。置くのは
**その人が実際に打った形**のうち、いちばん回数の多いもの（から絵文字と
URL と余白を落としたもの）。送り仮名や語尾をこちらで直すと、その人の
言い回しでなくなる。
"""

import re
import unicodedata
from collections import Counter

# スタンプの絵に乗る字数。**口（`functions/src/stampLine.ts` の `MAX_LEN`）と
# 同じ値**。あちらが切るので、ここで長いものを出しても画面では切れる
MAX_LEN = 20

# これより短いものは、読んで何も分からない（「w」「草」「！」）
MIN_LEN = 2

# 口ぐせと言える回数。1回は思いつき（`chatter_one.py` の `habits` と同じ線）
MIN_SAID = 2

# 島ぜんぶで言われた回数に対する、その人の割合の下限。
# **ここが「みんなの挨拶」を落とす唯一の関所。**
# 0.2 にしてあるのは、2人で分け合っている口ぐせ（0.5）は残して、
# 5人以上が同じだけ言っている字は落としたいから
MIN_SHARE = 0.2

# カスタム絵文字（YouTube のチャットはこの形で入る）
CUSTOM_EMOJI = re.compile(r":[A-Za-z0-9_+-]+:")

# URL
URL = re.compile(r"https?://\S+")

# 絵文字そのもの。**面ごとに書かない**——ここが1か所。
# 範囲で取るので、知らない絵文字が増えた日にも勝手に捕まる
EMOJI = re.compile(
    "["
    "\U0001f000-\U0001faff"   # 絵文字ぜんぶ（記号・顔・旗・手）
    "☀-➿"           # 天気・記号
    "←-⇿"           # 矢印
    "⬀-⯿"           # 矢印（追加）
    "️︎"            # 字の見た目を変える印
    "‍"                  # 繋ぎ（家族の絵文字などで使う）
    "⃣"                  # 丸数字の囲み
    "]+"
)


def clean(text: str) -> str:
    """置いてよい形にする。**絵文字・カスタム絵文字・URL・余白を落とす。**

    落とすだけで、**字そのものは書き換えない。**

    Args:
        text: その人が打った字

    Returns:
        整えた字（空になることもある）
    """
    t = text or ""
    t = URL.sub(" ", t)
    t = CUSTOM_EMOJI.sub(" ", t)
    t = EMOJI.sub(" ", t)
    # 改行と連続した余白は1つに。**スタンプの絵に乗るのは1行**
    t = re.sub(r"\s+", " ", t).strip()
    return t


def norm(text: str) -> str:
    """数えるための鍵。**置く字には使わない。**

    全角と半角、濁点の付け方を揃える（`NFKC`）。これをしないと
    「ありがとう！」と「ありがとう！」（全角と半角の感嘆符）が別の口ぐせになる。

    Args:
        text: その人が打った字

    Returns:
        鍵（空なら数えない）
    """
    t = clean(text)
    if not t:
        return ""
    t = unicodedata.normalize("NFKC", t).lower()
    # 末尾の伸ばし棒と感嘆符の数は、その日の気分で変わる。鍵では揃える
    t = re.sub(r"[!?！？ー〜~…\.]+$", "", t).strip()
    return t


def usable(text: str) -> bool:
    """スタンプに乗せられる形か。

    Args:
        text: `clean()` を通した字

    Returns:
        乗せられるなら True
    """
    if not text:
        return False
    if len(text) < MIN_LEN or len(text) > MAX_LEN:
        return False
    # 記号と数字だけの行は、読んで何も分からない
    if not re.search(r"[^\W\d_]", text, re.UNICODE):
        return False
    return True


def tally(rows) -> tuple[dict, dict]:
    """数え上げる。**1回ぜんぶ歩いて、2つの数を作る。**

    Args:
        rows: `(チャンネルID, 打った字, 回数)` の並び

    Returns:
        (`own[ch][鍵] = {"n": 回数, "raw": Counter}`,
         `all_n[鍵] = 島ぜんぶで言われた回数`)
    """
    own: dict = {}
    all_n: Counter = Counter()
    for ch, text, n in rows:
        k = norm(text)
        if not k:
            continue
        cnt = int(n or 0)
        if cnt <= 0:
            continue
        all_n[k] += cnt
        if not ch:
            continue
        box = own.setdefault(ch, {})
        slot = box.setdefault(k, {"n": 0, "raw": Counter()})
        slot["n"] += cnt
        slot["raw"][clean(text)] += cnt
    return own, all_n


def pick(own_one: dict, all_n: dict, top: int) -> list:
    """1人ぶんの候補を選ぶ。

    Args:
        own_one: その人の `{鍵: {"n": 回数, "raw": Counter}}`
        all_n: 島ぜんぶの `{鍵: 回数}`
        top: 出す本数

    Returns:
        候補の字の一覧（点の高い順）
    """
    scored = []
    for k, slot in (own_one or {}).items():
        n = slot["n"]
        if n < MIN_SAID:
            continue
        # **置くのは、その人がいちばん多く打った形。**
        # 同じ回数のものが並んだときは短いほうを採る（スタンプに乗る）
        raw = sorted(slot["raw"].items(), key=lambda kv: (-kv[1], len(kv[0])))
        text = raw[0][0] if raw else ""
        if not usable(text):
            continue
        total = max(all_n.get(k, n), n)
        share = n / total
        if share < MIN_SHARE:
            continue
        # 並びを決め打ちにする。**同じ入力なら同じ答え**
        # （`docs/island-design.md`「乱数を使わない」）
        scored.append((n * share, n, -len(text), text))
    scored.sort(key=lambda r: (-r[0], -r[1], r[2], r[3]))
    out: list = []
    for _, _, _, text in scored:
        if text in out:
            continue
        out.append(text)
        if len(out) >= top:
            break
    return out


def pick_all(rows, picked, top: int = 3) -> dict:
    """選ばれた人ぶん、まとめて選ぶ。

    Args:
        rows: `(チャンネルID, 打った字, 回数)` の並び（**島ぜんぶ**）
        picked: 候補を出す相手のチャンネルIDの集まり
        top: 1人あたり出す本数

    Returns:
        `{チャンネルID: [候補, …]}`。**候補が0本の人は入らない**
    """
    own, all_n = tally(rows)
    out = {}
    for ch in picked:
        got = pick(own.get(ch, {}), all_n, top)
        if got:
            out[ch] = got
    return out
