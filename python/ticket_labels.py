"""**issue を「誰待ちか」で仕分ける札と、あやとに本当に届く書きかた。**

ここには外に出る口が1つも無い。判定だけを置いてある。
使うのは `python/ticket_stock.py`（毎週の棚卸し）と、
機械で issue を立てる3本（`donor_calls` / `ingest_down` / `bake_down`）。

## なぜ札が要るか

2026-09-19 の時点で、開いている issue 25本に**ラベルが1つも付いていなかった。**
誰待ちかは題名の【】でしか分からず、【あやとの操作】と書いてあるものと
【親】と書いてあるものが同じ見た目で並んでいた。

**題名は人が読むもので、機械からは読めない。** 機械から読めないと、
「あやと待ちが何本あるか」を誰も数えられない。数えられないものは溜まる。

| 札 | 意味 | 誰が動かすと進むか |
| --- | --- | --- |
| `待ち-あやと` | 鍵・権限・コンソールの操作・「どうしたいか」の答え | **あやとだけ** |
| `待ち-こちら` | 直せる。まだ手が回っていないだけ | こちら |
| `旅のあと` | 旅が終わるまで着手すると壊れる | 時間 |

**迷ったら `待ち-こちら` に倒す。** あやと待ちに置くと、こちらの手が
止まったまま「待っている」ことにできてしまう。

## なぜメンションが要るか

**題名に【あやとの操作】と書いても、通知は1通も飛ばない。**
2026-09-19 にあやとから「これ、私にメンションしてほしいと言ったはず」と
言われたのが #478 で、**あれは人ではなく機械（`github-actions[bot]`）が
立てたもの**だった。機械が立てる issue は、こちらが手で書き足すことが
できない——**立てる側のコードに入っていなければ、永遠に入らない。**

## 全部にメンションを入れない

毎晩鳴るものに毎晩メンションを付けると、そのうち誰も読まなくなる。
**あやとにしかできないことを待っているものだけ**に付ける。

| 立てるもの | メンションするか | なぜ |
| --- | --- | --- |
| `donor_calls`（紐付け待ち） | **する** | 対応表を触れるのはあやただけ |
| `ingest_down` の `session_expired` | **する** | cookie を入れ直せるのはあやただけ |
| `ingest_down` の「何日も入っていない」 | しない | こちらが流し直せば入ることがある |
| `bake_down`（焼き直しの赤） | しない | こちらで直せる |
| 毎週の棚卸し | **あやと待ちが在るときだけ** | 0本の週に鳴らす意味が無い |

## 「書いてある」と「飛ぶ」は別

GitHub はコードブロックの中・引用（`>`）の中・バッククォートで囲んだ
`@名前` を**メンションとして扱わない。** 字として在るのに1通も飛ばない、
がいちばん起きやすい外し方なので、`mention_live()` で機械に見させる。

**そして、本文を書き換えても通知は飛ばない。** 飛ぶのは
**issue を開いたとき**と**コメントを足したとき**だけ。ここが効いてくるのは
`donor_calls` や `bake_down` のように**同じ1本の本文を毎晩差し替える**形で、
本文にメンションを入れておくだけでは、開いた最初の1回しか届かない。
かといって毎晩コメントを足すと雑音になる。**変わり目でだけ鳴らす**のが
`should_ping()`。
"""

import re

# 待ちの相手を表す3つの札。**この3つだけ。** 増やすと、どれを付ければいいか
# 迷う面が増えて、結局付かなくなる
WAIT_AYATO = "待ち-あやと"
WAIT_US = "待ち-こちら"
AFTER_TRIP = "旅のあと"

# 並べる順。**あやと待ちが先頭。** 棚卸しの本文も一覧もこの順で出す
WAITS = (WAIT_AYATO, WAIT_US, AFTER_TRIP)

# 札の見た目（色・説明）。無ければ作る。既に居る札とは別の色にする
# （`donor-calls` d93f0b / `ingest-down` b60205 / `bake-down` 5319e7）
WAIT_STYLE = {
    WAIT_AYATO: ("fbca04", "あやとにしかできないことを待っている"),
    WAIT_US: ("0e8a16", "こちらで直せる。まだ手が回っていない"),
    AFTER_TRIP: ("1d76db", "旅が終わるまで着手すると壊れる"),
}

# あやとの GitHub の名乗り。**ここ1か所だけに書く。**
# 散らすと、変わった日に半分だけ直る
HANDLE = "@Ayato-kosaka"

# コードブロックの囲い（``` か ~~~）。中に入った `@名前` は飛ばない
_FENCE = re.compile(r"^\s*(```|~~~)")

# 行の頭の引用・箇条書きの記号を落としてから見る。
# `> @Ayato-kosaka` は引用なので飛ばないが、`- @Ayato-kosaka` は飛ぶ
_QUOTE = re.compile(r"^\s*>")

# 4つ以上の空白で始まる行は、GitHub ではコードとして描かれる
_INDENT = re.compile(r"^(?: {4,}|\t)")


def wait_of(labels) -> str:
    """付いている札から、**待ちの相手**を1つ選ぶ。

    GitHub が返す形（`[{"name": ...}, ...]`）でも、名前だけの並びでも読む。

    2つ以上付いていたら `WAITS` の順で先に来るほうを採る。**黙って両方
    数えない**——数えると本数の合計が開いている本数と合わなくなって、
    分母が壊れる（`docs/island-standards.md` §15）。

    Args:
        labels: issue に付いている札

    Returns:
        `WAIT_AYATO` / `WAIT_US` / `AFTER_TRIP` のどれか。
        1つも付いていなければ空文字
    """
    names = set()
    for x in labels or []:
        name = x.get("name") if isinstance(x, dict) else x
        if isinstance(name, str):
            names.add(name)
    for w in WAITS:
        if w in names:
            return w
    return ""


def mention_live(text: str) -> bool:
    """本文の中に、**通知として飛ぶ形の** `@Ayato-kosaka` が在るか。

    字として在るだけでは足りない。GitHub は次の中の `@名前` を
    メンションとして扱わない:

    - コードブロック（``` / ~~~ の中、4つ以上の空白で始まる行）
    - 引用（行頭の `>`）
    - バッククォートで囲んだところ（`` `@Ayato-kosaka` ``）

    **「書いたのに飛ばない」がいちばん起きやすい外し方**なので、
    人の目ではなくここで見る。

    Args:
        text: issue の本文かコメント

    Returns:
        飛ぶ形で入っていれば True
    """
    fenced = False
    for line in (text or "").splitlines():
        if _FENCE.match(line):
            fenced = not fenced
            continue
        if fenced or _QUOTE.match(line) or _INDENT.match(line):
            continue
        # 行の中のバッククォートで囲まれたところを落としてから探す
        bare = re.sub(r"`[^`]*`", "", line)
        if HANDLE in bare:
            return True
    return False


def should_ping(action: str, prev_body: str, needs_ayato: bool) -> bool:
    """**コメントで鳴らすか**を決める。GitHub を触らない素の関数。

    本文を書き換えても通知は飛ばない。飛ぶのは開いたときとコメントだけ。
    だから「鳴らす」は**コメントを1本足す**という意味になる。

    | いま | すること | なぜ |
    | --- | --- | --- |
    | あやと待ちではない | 鳴らさない | 毎晩鳴るものに毎晩メンションすると読まれなくなる |
    | `create` | 鳴らさない | **本文にメンションを入れて開く**ので、開いた時点で飛ぶ |
    | `reopen` | **鳴らす** | 状態を変えるだけでは1通も飛ばない |
    | `update` で、前の本文にメンションが無かった | **鳴らす** | ここで初めてあやと待ちになった |
    | `update` で、前の本文にもう在った | 鳴らさない | 同じことを毎晩言わない |

    Args:
        action: `decide()` が返した動き（create / reopen / update / close / noop）
        prev_body: いま GitHub に載っている本文（無ければ空文字）
        needs_ayato: この用事が、あやとにしかできないものか

    Returns:
        コメントを足すなら True
    """
    if not needs_ayato:
        return False
    if action == "create":
        return False
    if action == "reopen":
        return True
    if action == "update":
        return not mention_live(prev_body or "")
    return False


def ping_text(what: str) -> str:
    """鳴らすときのコメント。**1行だけ。**

    本文に何が書いてあるかはすぐ上に出ているので、繰り返さない。
    `HANDLE` を行の先頭に置くのは、囲いや引用に巻き込まれないため。

    Args:
        what: 何を待っているか（「投げ銭の紐付け」など。1行で書ける短いもの）

    Returns:
        コメントの本文
    """
    return f"{HANDLE} {what}。ここはあやとの手が要ります。\n"
