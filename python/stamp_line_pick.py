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

## 選ぶものが変わった（2026-10-09）

あやとの言葉:

> LINEスタンプとして、**日常で使える言葉を優先的に選別**してね

前は「その人らしさ」だけを見ていた（回数 × 割合）。らしさは出ていたが、
**LINE で明日も使えるか**を1つも見ていなかったので、こういうものが上に来た。

| 上に来ていたもの | なぜ明日使えないか |
| --- | --- |
| 「特大花火が打ち上がりました！！」 | **その場かぎりの実況。** 画面に出た字を打ち返したもの |
| 「こんばんはお疲れ様です高評価押しましたよ」 | **配信の中でしか意味がない。** しかも20字で1枚に乗らない |

**語の表（禁止ワード）は作らない。** 表を作ると、表の外でまた同じことが起きる。
見るのは**データから出せるもの**だけ。

## 選び方は3つの掛け算

    点 = 日数 × √らしさ × 短さ

| 数 | 何を見ているか | なぜ |
| --- | --- | --- |
| **日数**（`days`） | **何日にわたって言ったか** | ここがいちばん強い。毎日のように使う言葉は**たくさんの日に散る**。その場かぎりの実況は**1日に固まる** |
| **らしさ**（`share`） | その字をその人が言った回数 ÷ 島ぜんぶ | みんなの挨拶を落とす。**ただし √ で弱める**——珍しすぎる字は「その人らしい」が、**本人も毎日は使わない** |
| **短さ**（`short`） | `GOOD_LEN ÷ max(字数, GOOD_LEN)` | LINE の1枚に乗るのは短い字。**20字は上限であって狙いではない** |

**回数（`n`）は点に入れない。** 1日に20回言った字と、20日にわたって1回ずつ
言った字では、**後ろが口ぐせ**。回数は同点のときの並べ替えにだけ使う。

### らしさを √ で弱めた理由

前は `回数 × 割合` で、割合が1乗で効いていた。1乗のままで日数に置き換えると、
**その人しか言っていない珍しい字**（割合1.0）が、みんなも言う口ぐせ（割合0.3）に
対して3倍以上の下駄を履く。珍しい字は「その人らしい」けれど、**本人も毎日は
使わない。** √ にすると 1.0 と 0.3 の差が 1.8倍まで縮む。

**捨ててはいない。** 下の `MIN_SHARE` が関所として残っているので、
みんなの挨拶（割合0.2未満）は点を付ける前に落ちる。

## 落とすもの（関所）

- **短すぎる・長すぎる**（2字未満、20字より長い）
- **絵文字とカスタム絵文字（`:name:`）だけの行**
- **URL が入っている行**
- **1回しか言っていない**（口ぐせではない）
- **1日で終わっている**（`MIN_DAYS`。**ここが「その場かぎりの実況」を落とす唯一の関所**）
- **割合が低い**（`MIN_SHARE`。**ここが「みんなの挨拶」を落とす唯一の関所**）

**絵文字は落とすのではなく、抜いてから数える。** 「いいね🎉」と「いいね」は
同じ口ぐせなので、別のものとして数えると両方とも回数が足りなくなる。
抜いた結果が2字未満になったら、そこで落ちる。

## 字そのものは、**言い方を変えない範囲でだけ**整える

あやとの言葉（2026-10-09）:

> その人いいそう！！！ってならば良いから少しアレンジしてもいいよ。

機械がやってよいのは **`tidy()` の1つだけ**——**末尾の句点を落とす。**
「おばんですー。」は1字ぶん損をするうえ、スタンプの字として句点で終わらない
（あやとが挙げた例そのもの）。送り仮名も語尾も丁寧語も関西弁も、機械は
1文字も触らない。

**それ以上のアレンジは人がやる。** どちらの道で入れても、**元の字が
`suggestedFrom` に残る**ので、表で「直したもの」と「直していないもの」が
見分けられる。

数えるための鍵（`norm`）と、置く字（`text`）は別に持つ。置くのは
**その人が実際に打った形**のうち、いちばん回数の多いもの。
"""

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
# 20（上限）との差が「短さ」の下駄になる。20字ちょうどの字は 8/20 = 0.4 倍
GOOD_LEN = 8

# 口ぐせと言える回数。1回は思いつき（`chatter_one.py` の `habits` と同じ線）
MIN_SAID = 2

# **何日にわたって言ったか**の下限。1日で終わった字は口ぐせではない。
# 2回言っていても、その2回が同じ日なら**その日の出来事**（#716）
MIN_DAYS = 2

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

# **鍵のときだけ落とす末尾。** その日の気分で変わるもの——伸ばし棒・感嘆符・
# 句読点・笑い（`w` `ｗ` `笑` `草`）。
# ここに `w` を入れたのは、「あやちゃん」と「あやちゃんw」が**別の口ぐせとして
# 2本並んだ**から（#716 で実際に出た）。大文字の `W` は入れない——
# 「NEW」のような字の末尾を削ってしまう
TAIL = re.compile(r"[!?！？ー〜~…。、\.wｗ笑草]+$")

# **置く字から落とす末尾。** 機械が触ってよいのはここだけ（句読点）。
# 笑いも伸ばし棒も、**その人の言い方そのもの**なので触らない
TIDY_TAIL = re.compile(r"[。、]+$")


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


def short_of(text: str) -> float:
    """**短さ**。`GOOD_LEN` までは下駄なし、長いほど薄くなる。

    Args:
        text: 出す字

    Returns:
        0 より大きく 1 以下
    """
    return GOOD_LEN / max(len(text or ""), GOOD_LEN)


def score(days: int, share: float, text: str) -> float:
    """**日常で使えるか**の点。式は1か所。

    Args:
        days: その人がその字を言った日数
        share: その字をその人が言った回数 ÷ 島ぜんぶで言われた回数
        text: 出す字

    Returns:
        点（大きいほど上）
    """
    return days * math.sqrt(max(share, 0.0)) * short_of(text)


def score_before(n: int, share: float) -> float:
    """**前の式**（回数 × 割合）。**選ぶのには使わない。**

    残してあるのは1つの用のためだけ——**あやとに「どの字がどう動いたか」を
    見せる**（`python/admin/stamp_line_table.py` の「前の式との動き」）。
    前の表を手で写すと、写し間違いが起きても赤くならない。

    Args:
        n: その人がその字を言った回数
        share: 島ぜんぶに対する割合

    Returns:
        前の式の点
    """
    return n * share


def tally(rows) -> tuple[dict, dict]:
    """数え上げる。**1回ぜんぶ歩いて、2つの数を作る。**

    `rows` の4つめ（日数）は無くてもよい——無ければ**回数と同じ**として
    扱う。偽のデータで回す見張りが、日数を気にせず書けるようにしてある。

    **同じ鍵に別の打ち方が集まったときの日数は、足さずに `max` を取る。**
    足すと「特大花火が打ち上がりました！！」と「〜！」を同じ日に打った人が
    **2日ぶん**に化けて、1日の関所（`MIN_DAYS`）を素通りする。
    `max` は少なく出るが、**少なく出て落ちるのは安全な側**。

    Args:
        rows: `(チャンネルID, 打った字, 回数[, 日数])` の並び

    Returns:
        (`own[ch][鍵] = {"n": 回数, "d": 日数, "raw": Counter}`,
         `all_n[鍵] = 島ぜんぶで言われた回数`)
    """
    own: dict = {}
    all_n: Counter = Counter()
    for row in rows:
        ch, text, n = row[0], row[1], row[2]
        d = row[3] if len(row) > 3 else None
        k = norm(text)
        if not k:
            continue
        cnt = int(n or 0)
        if cnt <= 0:
            continue
        # 日数は回数を超えない。**渡されなかったら回数と同じ**とみなす
        days = cnt if d is None else min(int(d or 0), cnt)
        all_n[k] += cnt
        if not ch:
            continue
        box = own.setdefault(ch, {})
        slot = box.setdefault(k, {"n": 0, "d": 0, "raw": Counter()})
        slot["n"] += cnt
        slot["d"] = max(slot["d"], days)
        slot["raw"][clean(text)] += cnt
    return own, all_n


def pick(own_one: dict, all_n: dict, top: int, before: bool = False) -> list:
    """1人ぶんの候補を選ぶ。

    Args:
        own_one: その人の `{鍵: {"n": 回数, "d": 日数, "raw": Counter}}`
        all_n: 島ぜんぶの `{鍵: 回数}`
        top: 出す本数
        before: **前の式**で選ぶ（表に動きを出すためだけ。選ぶのには使わない）

    Returns:
        `{"text": 出す字, "from": 元の字, "n": 回数, "d": 日数}` の並び（点の高い順）
    """
    scored = []
    for k, slot in (own_one or {}).items():
        n = slot["n"]
        d = slot.get("d", n)
        if n < MIN_SAID:
            continue
        # **1日で終わった字は、口ぐせではない。**（前の式のときは見ない）
        if not before and d < MIN_DAYS:
            continue
        # **置くのは、その人がいちばん多く打った形。**
        # 同じ回数のものが並んだときは短いほうを採る（スタンプに乗る）
        raw = sorted(slot["raw"].items(), key=lambda kv: (-kv[1], len(kv[0])))
        src = raw[0][0] if raw else ""
        if not usable(src):
            continue
        # 機械が触ってよいのは末尾の句点だけ。整えたあとも乗る形か見る
        text = src if before else tidy(src)
        if not usable(text):
            continue
        total = max(all_n.get(k, n), n)
        share = n / total
        if share < MIN_SHARE:
            continue
        pt = score_before(n, share) if before else score(d, share, text)
        # 並びを決め打ちにする。**同じ入力なら同じ答え**
        # （`docs/island-design.md`「乱数を使わない」）。
        # 同点は 日数 → 回数 → 短い順 → 字の順
        scored.append((pt, d, n, -len(text), text, src))
    scored.sort(key=lambda r: (-r[0], -r[1], -r[2], r[3], r[4]))
    out: list = []
    seen = set()
    for _, d, n, _, text, src in scored:
        if text in seen:
            continue
        seen.add(text)
        out.append({"text": text, "from": src, "n": n, "d": d})
        if len(out) >= top:
            break
    return out


def pick_all(rows, picked, top: int = 3, before: bool = False) -> dict:
    """選ばれた人ぶん、まとめて選ぶ。

    Args:
        rows: `(チャンネルID, 打った字, 回数[, 日数])` の並び（**島ぜんぶ**）
        picked: 候補を出す相手のチャンネルIDの集まり
        top: 1人あたり出す本数
        before: **前の式**で選ぶ（表に動きを出すためだけ）

    Returns:
        `{チャンネルID: [{"text", "from", "n", "d"}, …]}`。
        **候補が0本の人は入らない**
    """
    own, all_n = tally(rows)
    out = {}
    for ch in picked:
        got = pick(own.get(ch, {}), all_n, top, before=before)
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
