"""公開の場に残るログから、**個人を指すもの**を外す。

## なぜ要るのか

このリポジトリは公開で、**GitHub Actions のログも誰でも読める。**
毎晩の取り込みは、その晩スパチャ・投げ銭してくれた人の
チャンネルID・ハンドル・どねID・表示名を、**1人ずつ並べて**いた。

並ぶのは「その日出してくれた人」だけなので、
**「誰が、いつ、いくら出したか」に等しいもの**が毎晩積まれることになる。
島には「名前を出してよい」と本人が言ったかを持つ仕組み
（`islandUsers` の `showName`。`functions/src/islandApi.ts` が絞っている）が
わざわざ在るのに、取り込みのログはその外で同じ名前を出していた。

## 分け方は「本番かどうか」ではなく「公開の場に出るかどうか」

**`--dry-run` かどうかでは分けない。** dry-run を Actions から回せば、
1バイトも書かなくても**ログは公開のまま残る**。逆に、手元で
`python python/doneru_supporters.py` を回したログはどこにも残らない。

見るのは `GITHUB_ACTIONS` ひとつ。Actions のランナーが必ず入れる変数で、
**「いま出している字が、誰でも読める場所に積まれるか」そのもの**を指す。
手元で回したときは、いままで通り1人ずつ出す（誰を取りこぼしたかを
その場で見たいのは、手で回しているときだから）。

## 名前を消したら操作できなくなる、という形にしない

消すのは**1人ずつの明細だけ。** 「紐付け待ちが2件あります」と
「`/me` の『投げ銭を、YouTube につなぐ』から」は残す。
誰なのかは `/me` の画面に出ているので、ログに要らない。
"""

import os


def public_log() -> bool:
    """いま出しているログが、誰でも読める場所に残るか。

    GitHub Actions のランナーは `GITHUB_ACTIONS=true` を必ず入れる。
    このリポジトリのワークフローのログは公開なので、ここが立っていたら
    個人を指すものは1文字も出さない。

    Returns:
        公開の場に残るなら True
    """
    return bool(os.getenv("GITHUB_ACTIONS"))


def detail_lines(rows, public: bool | None = None) -> list:
    """1人ずつの明細を、出してよいときだけ行にする。

    **公開の場では空の一覧を返す。** 呼ぶ側は返ってきた行を流すだけに
    しておくと、「ここでは出さない」の判断がこの1か所に寄る。
    呼ぶ側に `if` を書くと、書き忘れた1か所から漏れる。

    Args:
        rows: 1人ぶん1タプル。中身はそのまま並べて出す
        public: 公開の場かどうか（省略すると `public_log()` を見る）

    Returns:
        流してよい行の一覧。公開の場なら空
    """
    if public is None:
        public = public_log()
    if public:
        return []
    return ["    " + "  ".join("" if c is None else str(c) for c in r) for r in rows]


def mask(value, public: bool | None = None) -> str:
    """文の途中に出る**1つの識別子**を、出してよいときだけそのまま返す。

    `detail_lines` は「1人ずつの行」をまるごと落とすためのもので、
    「チャンネル %s が見つかりません」のように**行そのものは残したい**
    ところには使えない。行を落とすと、何が起きたのかが消える。

    公開の場では、値の代わりに**短い指紋**（`#a3f9`）を返す。
    ただの伏せ字（`***`）にすると、10件並んだときに何件が同じ人の話なのかが
    分からなくなって、Actions のログから直しようがなくなる。
    指紋なら、同じ値は同じ字になるので**追える**が、元には戻せない。

    Args:
        value: チャンネルID・ハンドル・どねID など、個人を指す値
        public: 公開の場かどうか（省略すると `public_log()` を見る）

    Returns:
        そのままの値（手元）か、指紋（公開の場）
    """
    if public is None:
        public = public_log()
    if not public:
        return "" if value is None else str(value)
    if value is None or value == "":
        return "（無い）"
    # sha256 の頭だけ。桁を増やしても読みにくくなるだけで、
    # ここで要るのは「同じか違うか」が分かることだけ
    import hashlib

    return "#" + hashlib.sha256(str(value).encode("utf-8")).hexdigest()[:4]


def sketch(value, public: bool | None = None) -> str:
    """Firestore の書類など、**中身の分からない塊**をログに出す形にする。

    `mask()` は「チャンネルIDが1つ」と分かっているところに使うもので、
    書類まるごとには使えない。書類は何の欄が入っているか呼ぶ側にも
    分からないので、**中身を見て出す／出さないを決める余地を残すと、
    そこが判断の穴になる。**

    実際に穴になった: `firestore_read.py` の docstring には
    「人に結びつくものが入っているコレクションは `keys_only` で」と
    書いてあったのに、`streamChatMessages` をそのまま読んで、
    視聴者さん120人ぶんの本文とチャンネルIDと表示名が公開のログに並んだ。
    **守りを「回す人が正しい入力を選ぶ」に預けていたから**で、
    それは `detail_lines` の docstring が禁じている
    「呼ぶ側に `if` を書く」と同じ形をしている。

    だから、ここでは**入力で選べる逃げ道を作らない。**
    公開の場では、どんな塊が来ても値は1文字も出さない。出すのは
    **欄の名前と、型と、長さ**だけ。それだけあれば
    「どの欄が入っているか」「空か」「長さが変か」は読めるので、
    Actions のログから形の話は続けられる。
    値そのものが要るなら手元で回すか、出すものを自分で決めた
    専用のスクリプトを書く（`admin/doneru_audit.py` が手本。数字しか出さない）。

    Args:
        value: 書類の中身など、ログに出したい塊
        public: 公開の場かどうか（省略すると `public_log()` を見る）

    Returns:
        `{at: int, channelId: str(24), text: str(18)}` のような形の写し（公開の場）か、
        そのままの JSON（手元）
    """
    if public is None:
        public = public_log()
    if not public:
        import json

        s = json.dumps(value, ensure_ascii=False, default=str)
    else:
        s = _shape(value)
    return s if len(s) <= 600 else s[:600] + "…"


def _shape(v, depth: int = 0) -> str:
    """値を「型と長さ」だけの字にする。中身は1文字も通さない。

    入れ子も同じ考えで畳む。深く潜りすぎると、形の話に要らない字が
    増えるだけなので打ち切る（欄の名前が延々と並ぶより、`{…}` のほうが読める）。
    """
    if depth > 3:
        return "…"
    # bool は int の一種なので先に見る。順番を変えると True が int になる
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "bool"
    if isinstance(v, (int, float)):
        return type(v).__name__
    if isinstance(v, (str, bytes, bytearray)):
        return f"{type(v).__name__}({len(v)})"
    if isinstance(v, dict):
        # 欄の名前は出す。何が入っているかが分からないと、
        # 「読めたが空だった」と「そもそも欄が無い」を見分けられない
        inner = ", ".join(f"{k}: {_shape(x, depth + 1)}" for k, x in v.items())
        return "{" + inner + "}"
    if isinstance(v, (list, tuple, set, frozenset)):
        # 一覧は、件数と**中の形の種類**だけ。1件ずつ並べると
        # 「長さ」のつもりで結局 n 件ぶんの形が出てしまう
        kinds = []
        for x in v:
            k = _shape(x, depth + 1)
            if k not in kinds:
                kinds.append(k)
        if not kinds:
            return "[0]"
        return f"[{len(v)}× " + " | ".join(kinds[:3]) + "]"
    # 日時など、上のどれでもない型。型の名前だけ出す。
    # `str(v)` を混ぜない（中身が出る）
    return type(v).__name__
