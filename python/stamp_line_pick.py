"""スタンプに乗せる**名セリフの候補**を、その人のコメントから選ぶ（#716）。

**ここには置き場も外の口も1つも無い。** 数えたものを渡すと、候補を返す。
BigQuery を引くのと Firestore に置くのは `python/admin/stamp_line_suggest.py`。

## なぜ「本人の言葉から」なのか

あやとの言葉（2026-10-09）:

> どのセリフにするか提案して言い直してもらおう。

**こちらで考えた言葉を出すと、言い直す相手が居ない。** 「これでいいですか」に
なってしまって、本人の口調が1文字も入らない。だから提案は、その人が
**実際に言っている言い回し**から取る。

`docs/island-design.md` 5章「住人のセリフ」は「配信のコメントをそのまま
持ってくるのは禁止」と言っているが、**あれは島の住人に喋らせるときの話**で、
読む相手は初めて来た人。ここは**その人自身のスタンプ**で、読む相手は
その人を知っている人なので、文脈の無いコメントでも意味が通る。

## 選ぶものが変わった（2026-10-10。**2回目の作り直し**）

あやとの言葉（#716）:

> **「うん」とか出すのやめて。採用するわけない。個性がなさすぎる。**
> あと**候補が少なくてしっくりこない**。もっと**このセリフがその人っぽい！**ってのがあるはず

### 1回目の作り直しで外した理由

前の晩に「日常で使える言葉を優先」と言われて、**日常度（何日にわたって
言ったか）を主軸にした。** それが行きすぎた。

**毎日使う言葉は、誰でも使う。** だから日数を主軸にすると、
**いちばん個性のない字が上に来る**——「うん」が 92日、「うんうん」が 87日。
らしさ（その人のことばか、みんなのことばか）は √ で**弱めて**あったので、
日数の差で簡単に負けた。**らしさを捨てるなと渡してあったのに、捨てていた。**

**狙いは「日常で使える」ではなく「名セリフ」。** 見た瞬間に
「これ◯◯さんだ」となる字。日数は**最後の同点決着**にしか使わない。

### いまの決め方——**門が1つ、式が1本**

    門: 島のほかの人も言っている字は、その人の名セリフではない
    点 = らしさ² × ∛回数 × 短さ

| | 何を見ているか | なぜ |
| --- | --- | --- |
| **門**（`MANY_SPEAKERS`） | **その字を、島で何人が言ったか** | ここが「個性のない字」を落とす唯一の関所。**重みではなく門**にしたのは、重みだと回数の多さで押し返されるから（「うん」は 296回ある） |
| **らしさ**（`share`） | その字のうち、その人が言った割合 | **2乗で効かせる。** 前は √ で弱めていた——そこが外した場所 |
| **回数**（`n`） | 何回言ったか | **3乗根。** 効かせるが殴らせない。回数で殴ると「まめまめキューン」のような**珍しい名セリフがいちばん先に落ちる** |
| **短さ**（`short`） | 8字までは下駄なし、長いほど薄く | スタンプの1枚に乗るのは短い字。ただし√で薄め——**長い名セリフを殺さない** |
| 日数（`d`） | 何日にわたって言ったか | **点に入れない。同点のときの並べ替えだけ**（あやと「日常で使える、ではなく名セリフ」） |

### 「個性のない字の表」は作らない

「うん」「はい」「こんばんは」「ありがとう」を名指しで落とすと、
**表の外で同じことが起きる。** 落とすのは**何人が言ったか**という数で、
語の中身は1文字も見ない。

**そのうえで、落ちたことは毎回確かめる。** `stamp_line_pick_selftest.py` に
**あやとが名指しした4本を対照として置いてある**（判定には使わない。
門が効いているかを当てるためだけ）。`BREAK=gate` を渡すと門を外せるので、
**外したときに赤くなること**まで見られる。

## 候補は10本

あやと「候補が少なくてしっくりこない」。前は3本だった。
**選ぶ余地が3本では、気に入るものが1本も無い回がある。**
画面（`/me`）に出るのは口（`functions/src/stampLine.ts` の `SUGGEST`）が
先頭3本に切るので、**10本置いても画面は変わらない**——10本はあやとが
issue の表で選ぶためのもの。

## 拾い方も変えた——**言い切りごとに切る／島のことばを剥がす**

「たのしかった！ おやすみなさい！」のように**1行に2つ入っている**とき、
行まるごとだけを数えると「たのしかった！」が1回も数えられない
（あやとが挙げた字がこれ）。

| やること | 例 | なぜ |
| --- | --- | --- |
| **言い切りごとに切る**（`parts`） | 「たのしかった！ おやすみなさい！」→ 2本 | 1行に2つ言っている人の、片方だけが名セリフのことがある |
| **島のことばを剥がす**（`peels`） | 「イケオニこんばんは」→「イケオニ」 | 挨拶がくっついているだけで、名セリフが長くなって埋もれる |

**剥がすものも語の表では持たない。** 剥がすのは「島で `PEEL_SPEAKERS` 人
以上が言っている字」だけ——**データがそう言っているものだけ**を剥がす。

## 落とすもの（関所）

- **その字を島で `MANY_SPEAKERS` 人以上が言っている**（門。上で書いたもの）
- **その字の半分以上が、その人のものではない**（`MIN_SHARE`）
- **1回しか言っていない**（`MIN_SAID`）。
  **ただし、島でその人しか言っていない字なら1回でも通す**——
  「まめまめキューン」のような字は回数が少ない。
  **回数の門で落とすと、狙っているものから先に落ちる**
- 短すぎる・長すぎる（2字未満、20字より長い）
- 絵文字とカスタム絵文字（`:name:`）だけの行、URL が入っている行

**日数の関所（`MIN_DAYS`）は外した。** あれは「日常で使えるか」のための
関所で、**1日しか言っていない名セリフを落としていた。**

**絵文字は落とすのではなく、抜いてから数える。** 「いいね🎉」と「いいね」は
同じ口ぐせなので、別のものとして数えると両方とも回数が足りなくなる。

## 字そのものは、**言い方を変えない範囲でだけ**整える

あやとの言葉（2026-10-09）:

> その人いいそう！！！ってならば良いから少しアレンジしてもいいよ。

機械がやってよいのは **`tidy()` の1つだけ**——**末尾の句点を落とす。**
送り仮名も語尾も丁寧語も関西弁も、機械は1文字も触らない。
**それ以上のアレンジは人がやる**（`python/admin/stamp_line_arrange.py`）。
どちらの道で入れても**元の字が `suggestedFrom` に残る**ので、表で
「直したもの」と「直していないもの」が見分けられる。

数えるための鍵（`norm`）と、置く字（`text`）は別に持つ。置くのは
**その人が実際に打った形**のうち、いちばん回数の多いもの。

## 探すための畳みかた（`fold` / `near`）

**「データに無い」と言う前に、言い方の揺れで取りこぼしていないかを見る。**
「ばあい」「ばぁい」「ばーい」、「コンバンワ」「コン バンワ」は、
鍵（`norm`）では別のものになる——**別のものとして数えるのは正しい**
（「コン バンワ」は「こんばんは」とは別の字。あやとの指摘）。
だから**数える鍵は畳まず、探すときだけ `fold` で畳む。**
"""

import difflib
import math
import re
import unicodedata
from collections import Counter

# スタンプの絵に乗る字数。**口（`functions/src/stampLine.ts` の `MAX_LEN`）と
# 同じ値**。あちらが切るので、ここで長いものを出しても画面では切れる
MAX_LEN = 20

# これより短いものは、読んで何も分からない（「w」「草」「！」）
MIN_LEN = 2

# **ここまでなら、字の大きさを落とさずにスタンプの絵に乗る。**
# 20（上限）との差が「短さ」の下駄になる。
#
# **8 から 12 に広げた**（2026-10-10、本番の1回目を見て）。
# 8 のままだと、あやとが名セリフとして挙げた「まめまめキューーーン」（11字）が
# **同じ回数・同じ独占ぐあいの7字の字に負けて、10本から落ちた。**
# スタンプの絵に11字は普通に乗るので、ここで負けるのは下駄の付けすぎ
GOOD_LEN = 12

# 1人あたり出す本数。**あやと「候補が少なくてしっくりこない」**（#716）。
# 画面に出るのは口が切る先頭3本なので、ここを増やしても画面は変わらない
TOP = 10

# **門。この人数以上が言っている字は、その人の名セリフではない。**
#
# 「何人まで残すか」は実測で決めた（`stamp_line_suggest.py` の較正）。
# 1人（その人しか言っていない字だけ）にすると、**ほかの人が1回真似した
# だけで名セリフが落ちる**——島の名セリフは真似されるものなので、
# そこで落ちるのはいちばん有名な字になる。
# 4人以上が言っていたら、それはもう島のことば。
MANY_SPEAKERS = 4

# 言った回数の下限。**島でその人しか言っていない字は、1回でも通す**
# （`lone_said()`）。回数で殴ると珍しい名セリフから先に落ちる
MIN_SAID = 2

# **その字の半分以上が、その人のものであること。**
# 門（人数）と向きが同じだが、見ているものが違う——人数は「何人が言ったか」、
# ここは「何回のうち何回がその人か」。2人しか言っていなくても、
# 相手のほうが9倍言っているならその人の名セリフではない
MIN_SHARE = 0.5

# **剥がしてよい「島のことば」の人数。** これだけの人が言っている字は、
# くっついていても名セリフの一部ではない（挨拶・相槌）。
# 門（4人）より厚くしてあるのは、**剥がすほうが取り返しがつかない**から——
# 門は候補が1本減るだけだが、剥がし間違えると**言っていない字を作る**
PEEL_SPEAKERS = 8

# 剥がす側の字の長さの上限。長い字は挨拶ではなく、その人の言ったこと
PEEL_LEN = 10

# 1行から取る言い切りの数の上限。**長い行から大量の切れ端を作らない**
MAX_PARTS = 6

# 探すとき（`near`）に「近い」とみなす似ぐあい。`difflib` の比
NEAR = 0.72

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

# **鍵のときだけ落とす末尾。** その日の気分で変わるもの——伸ばし棒・感嘆符・
# 句読点・笑い（`w` `ｗ` `笑` `草`）。
# ここに `w` を入れたのは、「あやちゃん」と「あやちゃんw」が**別の口ぐせとして
# 2本並んだ**から（#716 で実際に出た）。大文字の `W` は入れない——
# 「NEW」のような字の末尾を削ってしまう
TAIL = re.compile(r"[!?！？ー〜~…。、\.wｗ笑草]+$")

# **置く字から落とす末尾。** 機械が触ってよいのはここだけ（句読点）。
# 笑いも伸ばし棒も、**その人の言い方そのもの**なので触らない
TIDY_TAIL = re.compile(r"[。、]+$")

# **言い切りの切れ目。** 言い終わりの印だけ（その印は前の側に残す）。
# 「たのしかった！ おやすみなさい！」を2本にするのがこれ。
#
# **素の空白では切らない**（2026-10-10、本番の1回目を見て）。
# 空白で切ると「コン バンワ」が「コン」と「バンワ」になって、
# **あやとが挙げた名セリフが切れ端に割れる。** 日本語のチャットの空白は
# 言い切りの境ではなく、ただの間（ま）のことが多い
SPLIT = re.compile(r"(?<=[。！？!?♪…])\s*")

# 探すときだけ畳む字。伸ばし棒・中黒・空白（`fold`）
FOLD_DROP = str.maketrans({c: "" for c in "ー〜~・ 　,，"})

# 小書き（捨て仮名）を大書きに。「ばぁい」と「ばあい」を同じものとして**探す**
FOLD_SMALL = str.maketrans("ぁぃぅぇぉっゃゅょゎ", "あいうえおつやゆよわ")


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


def tidy(text: str) -> str:
    """出す字を、**言い方を変えずに**スタンプの1枚へ寄せる。

    やるのは**末尾の句読点を落とす**1つだけ。「おばんですー。」の `。` は
    1字ぶん損をするうえ、スタンプの字として句点で終わらない
    （あやとが挙げた例そのもの）。

    **伸ばし棒も笑いも絵文字の癖も残す。** そこを削ると、その人の言い方で
    なくなる。全部落として空になったら、元の字をそのまま返す。

    Args:
        text: `clean()` を通した字

    Returns:
        出してよい字
    """
    t = TIDY_TAIL.sub("", text or "").strip()
    return t or (text or "")


def norm(text: str) -> str:
    """数えるための鍵。**置く字には使わない。**

    全角と半角、濁点の付け方を揃える（`NFKC`）。これをしないと
    「ありがとう！」と「ありがとう！」（全角と半角の感嘆符）が別の口ぐせになる。

    **真ん中の空白は潰さない。** 「コン バンワ」は「こんばんは」とは別の字で、
    そこを潰すとあやとの挙げた名セリフが消える（#716）。

    Args:
        text: その人が打った字

    Returns:
        鍵（空なら数えない）
    """
    t = clean(text)
    if not t:
        return ""
    t = unicodedata.normalize("NFKC", t)
    # 末尾の伸ばし棒・感嘆符・句読点・笑いは、その日の気分で変わる。鍵では揃える。
    # **小文字に落とす前に削る。** 先に落とすと「NEW」が「ne」になる
    t = TAIL.sub("", t).strip()
    return t.lower()


def fold(text: str) -> str:
    """**探すときだけ**使う、言い方の揺れを畳んだ形。

    鍵（`norm`）は畳まない——「コン バンワ」と「こんばんは」を同じものに
    してはいけない。畳むのは**あやとが挙げた字がデータに在るかを探す**ときだけ
    （「ばあい」「ばぁい」「ばーい」を同じものとして探す）。

    やること: 鍵にしてから、伸ばし棒・中黒・空白を落とし、
    片仮名を平仮名に寄せ、小書きを大書きにする。
    **`は` と `わ` は寄せない**——「こんばんは」と「コン バンワ」が
    同じものになってしまう。

    Args:
        text: 字

    Returns:
        畳んだ形
    """
    t = norm(text)
    if not t:
        return ""
    t = t.translate(FOLD_DROP).translate(FOLD_SMALL)
    # 片仮名 → 平仮名（ァ〜ヶ の 0x60 ぶん下）
    t = "".join(
        chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in t)
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


def parts(text: str) -> list:
    """1行を**言い切りごとに**切る。

    「たのしかった！ おやすみなさい！」は、行まるごとで数えると
    **どちらも1回も数えられない**（あやとの挙げた「たのしかった！」がこれ）。
    言い終わりの印は**前の側に残す**——「たのしかった」ではなく
    「たのしかった！」がその人の言い方。

    Args:
        text: `clean()` を通した字

    Returns:
        切れ端の並び（切れ目が無ければ空。**行まるごとは呼ぶ側が持つ**）
    """
    t = (text or "").strip()
    if not t:
        return []
    got = [p.strip() for p in SPLIT.split(t) if p and p.strip()]
    if len(got) < 2:
        return []
    return got[:MAX_PARTS]


def peels(text: str, common: set) -> list:
    """**後ろにくっついた島のことばを剥がした残り**を返す。

    「イケオニこんばんは」の「こんばんは」は島のみんなの字で、
    くっついているだけ。剥がすと「イケオニ」が出る。

    **剥がすのは末尾だけ。頭は剥がさない**（2026-10-10、本番の1回目を見て）。
    頭を剥がすと、**語尾だけの切れ端が残る**——「あやとちゃん」から
    「あやと」を剥がして「ちゃん」が1位に来た。日本語は言いたいことが前に
    来て、挨拶や丁寧語が後ろにつくので、**剥がしてよいのは後ろだけ**。

    **剥がすのは、島で `PEEL_SPEAKERS` 人以上が言っている字だけ。**
    語の表は持たない——データがそう言っているものだけを剥がす。
    剥がすのは**いちばん長く一致するもの1つだけ。** 何度も剥がすと、
    どんな字でも2字まで削れてしまう。

    Args:
        text: `clean()` を通した字
        common: 島のことば（打った形の集まり）。`common_of()` が作る

    Returns:
        残りの並び（0本か1本）
    """
    t = (text or "").strip()
    if not t or not common:
        return []
    # **長いほうから見て、最初に当たったところで止める。**
    # 短い一致（「んは」）で切ると、切りすぎる
    top = min(PEEL_LEN, len(t) - MIN_LEN)
    for ln in range(top, MIN_LEN - 1, -1):
        if t[-ln:] in common:
            rest = t[:-ln].strip()
            return [rest] if usable(rest) else []
    return []


def short_of(text: str) -> float:
    """**短さ**。`GOOD_LEN` までは下駄なし、長いほど薄くなる。

    **√ で薄めている。** 1乗だと 20字の字が 0.4倍まで落ちて、
    「この先のコンビニで買ってや」のような**長い名セリフが消える。**

    Args:
        text: 出す字

    Returns:
        0 より大きく 1 以下
    """
    return math.sqrt(GOOD_LEN / max(len(text or ""), GOOD_LEN))


def score(share: float, n: int, text: str) -> float:
    """**名セリフらしさ**の点。式は1か所。

    Args:
        share: その字のうち、その人が言った割合（0〜1）
        n: その人がその字を言った回数
        text: 出す字

    Returns:
        点（大きいほど上）
    """
    s = max(share, 0.0)
    return s * s * (max(int(n), 1) ** (1.0 / 3.0)) * short_of(text)


def lone_said(speakers: int) -> int:
    """その字を**何回言っていれば候補にするか。**

    島でその人しか言っていない字（`speakers <= 1`）は、**1回でも通す。**
    「まめまめキューン」のような名セリフは回数が少ない——回数で門を作ると、
    狙っているものから先に落ちる（あやと「もっとその人っぽいのがあるはず」）。

    Args:
        speakers: その字を言った人の数（島ぜんぶ）

    Returns:
        要る回数
    """
    return 1 if speakers <= 1 else MIN_SAID


class Counts:
    """数え上げた結果。**何を数えたかを1か所に持つ。**

    | 欄 | 何 |
    | --- | --- |
    | `own[ch][鍵]` | `{"n": 回数, "d": 日数, "raw": Counter}` |
    | `all_n[鍵]` | 島ぜんぶで言われた回数 |
    | `spk[鍵]` | **その字を言った人の数**（門が見るもの） |
    """

    def __init__(self):
        self.own: dict = {}
        self.all_n: Counter = Counter()
        self.spk: Counter = Counter()

    def said(self, ch: str, text: str) -> dict:
        """その人がその字を何回・何日打ったか。

        Args:
            ch: チャンネルID
            text: 字（鍵にしてから引く）

        Returns:
            `{"n", "d"}`。引けなければ空の辞書
        """
        slot = (self.own.get(ch) or {}).get(norm(text))
        return dict(slot) if slot else {}

    def speakers(self, text: str) -> int:
        """その字を言った人の数。

        Args:
            text: 字

        Returns:
            人数（引けなければ 0）
        """
        return int(self.spk.get(norm(text), 0))


def common_of(spk: Counter, raw_of: dict) -> set:
    """**剥がしてよい「島のことば」**の集まり。

    **打ち方の揺れを全部入れる。** いちばん多い形1つだけを入れていたのが、
    本番の1回目で効かなかった原因——島のみんなは「こんばんはー」と
    打つことが多くて、**「こんばんは」で終わる字が1本も剥がれなかった**
    （「イケオニこんばんは」がそのまま1位になった）。

    Args:
        spk: `{鍵: 言った人の数}`
        raw_of: `{鍵: {打った形: 回数}}`

    Returns:
        打った形の集まり（`peels()` が末尾と突き合わせる）
    """
    out: set = set()
    for k, people in spk.items():
        if people < PEEL_SPEAKERS:
            continue
        for raw in (raw_of.get(k) or {}):
            if MIN_LEN <= len(raw) <= PEEL_LEN:
                out.add(raw)
    return out


def _keys(text: str, common) -> list:
    """1行から数える鍵を作る。**行まるごと・言い切り・剥がした残り。**

    Args:
        text: その人が打った字（生）
        common: 剥がしてよい島のことばの集まり（無ければ剥がさない）

    Returns:
        `[(鍵, 打った形, 剥がした残りか)]`。**同じ鍵は1行から1回だけ**
        （同じ回数を2回数えない）
    """
    base = clean(text)
    if not base:
        return []
    raws = [(base, False)]
    raws += [(r, False) for r in parts(base)]
    if common:
        for r, _ in list(raws):
            raws += [(x, True) for x in peels(r, common)]
    out = []
    seen = set()
    for r, cut in raws:
        k = norm(r)
        if not k or k in seen:
            continue
        seen.add(k)
        out.append((k, r, cut))
    return out


def tally(rows, who=None, peel: bool = True) -> Counts:
    """数え上げる。

    `rows` の4つめ（日数）は無くてもよい——無ければ**回数と同じ**として
    扱う。偽のデータで回す見張りが、日数を気にせず書けるようにしてある。

    **言った人の数は、同じ人を2回数えない。** そのために
    チャンネルIDで並べ替えてから、1人ぶんずつ鍵を畳んで数える
    （`set` を鍵ごとに持つと、島ぜんぶで何十万個になる）。

    **同じ鍵に別の打ち方が集まったときの日数は、足さずに `max` を取る。**
    足すと同じ日に書き方を変えただけの人が2日ぶんに化ける。
    `max` は少なく出るが、**少なく出て落ちるのは安全な側**。

    Args:
        rows: `(チャンネルID, 打った字, 回数[, 日数])` の並び（**島ぜんぶ**）
        who: 明細（`own`）を持つ相手。`None` なら全員
        peel: 島のことばを剥がすか（見張りが切れるように）

    Returns:
        `Counts`
    """
    want = set(who) if who is not None else None
    # **1回だけ整える。** 鍵を作るのがいちばん重いので、2周目で作り直さない。
    # 同じ字を何人も打っているので、鍵は字ごとに覚えて使い回す
    cache: dict = {}
    prep = []
    for row in rows:
        ch, text, n = row[0], row[1], row[2]
        d = row[3] if len(row) > 3 else None
        cnt = int(n or 0)
        if cnt <= 0:
            continue
        base = clean(text)
        if not base:
            continue
        if base not in cache:
            cache[base] = _keys(base, None)
        days = cnt if d is None else min(int(d or 0), cnt)
        prep.append((ch or "", base, cnt, max(days, 0)))
    # **同じ人のぶんを続けて見る。** 人数を数えるのに `set` を使わない
    prep.sort(key=lambda r: r[0])

    def walk(keys_of) -> Counts:
        """1周して数える。

        Args:
            keys_of: 字から `[(鍵, 打った形)]` を返すもの

        Returns:
            `Counts`
        """
        c = Counts()
        here = None
        mine: set = set()
        for ch, base, cnt, days in prep:
            if ch != here:
                here, mine = ch, set()
            for k, raw, cut in keys_of(base):
                c.all_n[k] += cnt
                if ch and k not in mine:
                    mine.add(k)
                    c.spk[k] += 1
                if not ch or (want is not None and ch not in want):
                    continue
                box = c.own.setdefault(ch, {})
                slot = box.setdefault(k, {"n": 0, "d": 0, "raw": Counter(),
                                          "cut": False})
                slot["n"] += cnt
                slot["d"] = max(slot["d"], days)
                slot["raw"][raw] += cnt
                # **剥がした残りかどうかを覚える。**
                # 同じ点なら、剥がした残りのほうを先に並べる（`pick`）
                if cut:
                    slot["cut"] = True
        return c

    got = walk(lambda base: cache[base])
    if not peel:
        return got
    # **剥がす相手は、1周目の数え上げから決める。**
    # 「島で何人が言っているか」を知らないと、剥がしてよい字が分からない
    raw_of: dict = {}
    for _ch, base, cnt, _d in prep:
        for k, raw, _cut in cache[base]:
            cur = raw_of.setdefault(k, {})
            cur[raw] = cur.get(raw, 0) + cnt
    common = common_of(got.spk, raw_of)
    cache2: dict = {}

    def with_peel(base: str) -> list:
        """剥がしたぶんも入れた鍵。

        Args:
            base: 整えた字

        Returns:
            `[(鍵, 打った形)]`
        """
        if base not in cache2:
            cache2[base] = _keys(base, common)
        return cache2[base]

    return walk(with_peel)


def best_raw(slot: dict) -> str:
    """その鍵で**いちばん多く打たれた形**。

    同じ回数のものが並んだときは短いほうを採る（スタンプに乗る）。

    Args:
        slot: `own[ch][鍵]`

    Returns:
        打った形（無ければ空）
    """
    raw = sorted((slot.get("raw") or {}).items(),
                 key=lambda kv: (-kv[1], len(kv[0]), kv[0]))
    return raw[0][0] if raw else ""


def gate_of(key: str, slot: dict, counts: Counts) -> tuple:
    """1本ぶんの関所。**落ちた理由も返す。**

    Args:
        key: 鍵
        slot: `own[ch][鍵]`
        counts: 数え上げ

    Returns:
        `(通ったか, 理由, {"text","from","n","d","people","share"})`
    """
    n = int(slot.get("n") or 0)
    d = int(slot.get("d") or n)
    people = int(counts.spk.get(key, 1)) or 1
    src = best_raw(slot)
    text = tidy(src)
    total = max(int(counts.all_n.get(key, n)), n, 1)
    one = {"text": text, "from": src, "n": n, "d": d,
           "people": people, "share": n / total,
           "cut": bool(slot.get("cut"))}
    if not usable(src) or not usable(text):
        return (False, "形", one)
    if people >= MANY_SPEAKERS:
        # **門。** 島のほかの人も言っている字は、その人の名セリフではない
        return (False, "人数", one)
    if n < lone_said(people):
        return (False, "回数", one)
    if one["share"] < MIN_SHARE:
        return (False, "割合", one)
    return (True, "", one)


def pick(own_one: dict, counts: Counts, top: int = TOP) -> list:
    """1人ぶんの候補を選ぶ。

    Args:
        own_one: その人の `{鍵: {"n", "d", "raw"}}`
        counts: 島ぜんぶの数え上げ
        top: 出す本数

    Returns:
        `{"text", "from", "n", "d", "people", "share"}` の並び（点の高い順）
    """
    scored = []
    for k, slot in (own_one or {}).items():
        ok, _why, one = gate_of(k, slot, counts)
        if not ok:
            continue
        pt = score(one["share"], one["n"], one["text"])
        # 並びを決め打ちにする。**同じ入力なら同じ答え**
        # （`docs/island-design.md`「乱数を使わない」）。
        # 同点は **剥がした残りが先** → 日数 → 回数 → **長いほう** → 字の順。
        #
        # **剥がした残りを先にする**のは、剥がしたのが「島のみんなの字」
        # だから——付いていても名セリフにならない（「イケオニこんばんは」
        # より「イケオニ」。本番の1回目は、同じ点で長いほうが勝って
        # **挨拶付きのまま1位**になった）。
        # 長いほうを先にするのは、同じ点なら**言い切っているほう**が
        # 名セリフだから（短いほうを先にすると、回数の並んだ中から
        # **いちばん短い切れ端**が10本を埋める）。
        # **日数はここにしか出てこない**（あやと「日常度は同点決着だけ」）
        scored.append((pt, 0 if one["cut"] else 1, one["d"], one["n"],
                       -len(one["text"]), one["text"], one))
    scored.sort(key=lambda r: (-r[0], r[1], -r[2], -r[3], r[4], r[5]))
    out: list = []
    folds: list = []
    for _pt, _cut, _d, _n, _l, text, one in scored:
        f = fold(text)
        # **同じ言い方を並べない。** 「イケオニ」を採ったあとに
        # 「イケオニこんばんは」を並べても、選ぶ余地が増えない
        if any(f == g or f in g or g in f for g in folds):
            continue
        folds.append(f)
        out.append(one)
        if len(out) >= top:
            break
    return out


def gated(own_one: dict, counts: Counts, top: int = 3) -> list:
    """**門で落ちた字**を、落ちた理由つきで返す。

    「ほかの人も言っている字が落ちている」は、**候補が0本でも通る**
    （`docs/island-misses.md` #19）。だから落ちたほうも並べて、
    あやとが**何が落ちたか**を見られるようにする。

    並びは**回数の多い順**。点を付けない——落ちたものに点を付けると、
    その点がそのまま「惜しかった順」に見えて、門を疑う材料になる。

    Args:
        own_one: その人の `{鍵: {"n", "d", "raw"}}`
        counts: 島ぜんぶの数え上げ
        top: 出す本数

    Returns:
        `{"text", "n", "d", "people", "why"}` の並び
    """
    out = []
    for k, slot in (own_one or {}).items():
        ok, why, one = gate_of(k, slot, counts)
        if ok or why in ("形",):
            continue
        one["why"] = why
        out.append(one)
    out.sort(key=lambda o: (-o["n"], -o["people"], o["text"]))
    return out[:top]


def pick_all(rows, picked, top: int = TOP, counts: Counts = None) -> dict:
    """選ばれた人ぶん、まとめて選ぶ。

    Args:
        rows: `(チャンネルID, 打った字, 回数[, 日数])` の並び（**島ぜんぶ**）
        picked: 候補を出す相手のチャンネルIDの集まり
        top: 1人あたり出す本数
        counts: 先に数え上げてあるもの（2度数えないため）

    Returns:
        `{チャンネルID: [{"text", "from", "n", "d", "people", "share"}, …]}`。
        **候補が0本の人は入らない**
    """
    who = list(picked or [])
    c = counts if counts is not None else tally(rows, who=who)
    out = {}
    for ch in who:
        got = pick(c.own.get(ch, {}), c, top)
        if got:
            out[ch] = got
    return out


def texts_of(got: list) -> list:
    """候補の並びから、**出す字だけ**を取り出す。

    Args:
        got: `pick()` の返り（または字そのものの並び）

    Returns:
        字の並び
    """
    return [c["text"] if isinstance(c, dict) else c for c in (got or [])]


def shape_check(v) -> list:
    """**あやとが挙げた字（採点表）**を、置いてよい形にする。

    あやとは #716 で、10人ぶんの名セリフを名指しで挙げた。
    **あれが候補に出てくるかどうかが合否**なので、突き合わせる相手として
    持ち回る。

    **リポジトリには書かない。** 名前と字の組は、10人ぶんでも
    「あやとが選んだ人の一部」そのものなので、git に残すと公開される
    （#716 の決め「焼き込みにも git にも入れない」）。
    渡すのは `repository_dispatch` の `client_payload`。

    Args:
        v: 渡されたもの（`[{"name", "lines": [字…], "words": [語…]}]`）

    Returns:
        `[{"name", "lines", "words"}]`（名前の無いものは落とす）
    """
    out = []
    if not isinstance(v, list):
        return out
    for one in v[:60]:
        if not isinstance(one, dict):
            continue
        name = one.get("name")
        if not isinstance(name, str) or not name.strip():
            continue
        lines = [x.strip() for x in (one.get("lines") or [])
                 if isinstance(x, str) and x.strip()]
        words = [x.strip() for x in (one.get("words") or [])
                 if isinstance(x, str) and x.strip()]
        out.append({"name": name.strip(), "lines": lines[:8],
                    "words": words[:8]})
    return out


def near(text: str, own_one: dict, counts: Counts, top: int = 5) -> list:
    """その人の言った字の中から、**その字に近いもの**を探す。

    「データに無い」と言う前にここを通す。鍵（`norm`）は畳まないので、
    「ばあい」「ばぁい」「ばーい」は**別の鍵**になる——
    畳んで探すのはここだけ（`fold`）。

    Args:
        text: 探す字（あやとが挙げたもの）
        own_one: その人の `{鍵: {"n", "d", "raw"}}`
        counts: 島ぜんぶの数え上げ
        top: 出す本数

    Returns:
        `[{"text", "n", "d", "people", "how"}]`。近い順。
        `how` は `同じ` / `揺れ` / `含む` / `近い`
    """
    want_k = norm(text)
    want_f = fold(text)
    if not want_f:
        return []
    out = []
    for k, slot in (own_one or {}).items():
        raw = best_raw(slot)
        if not raw:
            continue
        f = fold(raw)
        if not f:
            continue
        if k == want_k:
            how, like = "同じ", 1.0
        elif f == want_f:
            how, like = "揺れ", 0.99
        elif want_f in f or f in want_f:
            how, like = "含む", 0.9 - abs(len(f) - len(want_f)) / 100.0
        else:
            like = difflib.SequenceMatcher(None, want_f, f).ratio()
            if like < NEAR:
                continue
            how = "近い"
        out.append({"text": raw, "n": slot.get("n"), "d": slot.get("d"),
                    "people": int(counts.spk.get(k, 0)), "how": how,
                    "like": round(like, 3)})
    out.sort(key=lambda o: (-o["like"], -(o["n"] or 0), o["text"]))
    return out[:top]


def by_word(word: str, own_one: dict, counts: Counts, top: int = 5) -> list:
    """その人の言った字の中から、**その語が入っているもの**を探す。

    あやとが「この先のコンビニで買ってや的な名セリフがあったはず」のように
    **うろ覚えで挙げた**ぶんを探すのに使う。字そのものが分からないので、
    語で引く。

    Args:
        word: 語
        own_one: その人の `{鍵: {"n", "d", "raw"}}`
        counts: 島ぜんぶの数え上げ
        top: 出す本数

    Returns:
        `[{"text", "n", "d", "people"}]`。回数の多い順
    """
    w = fold(word)
    if not w:
        return []
    out = []
    for k, slot in (own_one or {}).items():
        raw = best_raw(slot)
        if not raw or w not in fold(raw):
            continue
        out.append({"text": raw, "n": slot.get("n"), "d": slot.get("d"),
                    "people": int(counts.spk.get(k, 0))})
    out.sort(key=lambda o: (-(o["n"] or 0), len(o["text"]), o["text"]))
    return out[:top]
