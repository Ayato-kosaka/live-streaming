"""管理スクリプト共通。Firestore クライアントと入力の受け取り。"""

import json
import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import BQ_PROJECT_ID  # noqa: E402
from logsafe import sketch  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("admin")


def db():
    """Firestore クライアント（GitHub Actions のサービスアカウントで動く）。

    **読み込みは呼ばれたときに行う。** ここを import 文にしておくと、
    Firestore を1度も触らないスクリプト（手元で数字だけ確かめたいときなど）まで
    google-cloud-firestore が入っていないと起動できない。
    """
    from google.cloud import firestore

    return firestore.Client(project=BQ_PROJECT_ID)


def args() -> dict:
    """ワークフローから渡された JSON の入力。"""
    raw = (os.getenv("ARGS") or "").strip()
    if not raw:
        return {}
    try:
        v = json.loads(raw)
    except json.JSONDecodeError as e:
        log.error("ARGS が JSON として読めません: %s", e)
        sys.exit(1)
    if not isinstance(v, dict):
        log.error("ARGS はオブジェクト（{...}）で渡してください")
        sys.exit(1)
    return v


def need(a: dict, *keys: str) -> list:
    """必須の入力を取り出す。足りなければ止める。"""
    out = []
    for k in keys:
        if k not in a or a[k] in (None, ""):
            log.error("入力 '%s' が要ります。ARGS=%s", k, a)
            sys.exit(1)
        out.append(a[k])
    return out


def show(v) -> str:
    """ログ用に短く整形する。**公開の場では値を1文字も通さない。**

    ここは `firestore_read` / `firestore_write` / `notes_theme` /
    `nordic_supporter` / `streamevents_import` ほか、Firestore の書類を
    ログに出すところ全部が通る1か所。**塞ぐならここ。**
    呼ぶ側それぞれに「この入れ物は人に結びつくか」を判断させると、
    判断し忘れた1か所から漏れる（実際に `streamChatMessages` で漏れた）。

    公開の場かどうかの見分けと、出してよい形は `logsafe.sketch()` が持つ。
    """
    return sketch(v)


class ReadOnly(Exception):
    """下見のつもりで、書きに行った。"""


# 書く側の名前。**塞ぐのは口であって、判断ではない。**
# 呼ぶ側に `if apply:` を書き忘れても、ここで止まる
_WRITE = frozenset({
    "set", "update", "delete", "create", "add", "commit", "batch",
    "bulk_writer", "transaction", "recursive_delete", "write",
})

# それ以上中を覗く必要のないもの
_FLAT = (str, bytes, bytearray, bool, int, float, complex)

# 書く口へ行ける道の入口になる属性
_DOOR = ("collection", "document", "stream", "where", "reference",
         "to_dict", "get", "set")


def _veil(v):
    """返ってきたものが Firestore の口なら、それも塞いだ写しにする。

    **器ごと見る。** 本物は同じ「引く」でも返す器が型で違う
    （`Query.get()` は list、`stream()` は生成器、`list_documents()` や
    `collections()` も一覧）。器を素通りさせると、中の書類から
    `delete()` が通る。引いた中身（`to_dict()`）の中に書類が入っている
    ことも本物にはあるので、辞書と一覧は中まで下りる。
    """
    if v is None or isinstance(v, _FLAT):
        return v
    if isinstance(v, dict):
        return {k: _veil(x) for k, x in v.items()}
    if isinstance(v, (list, tuple, set, frozenset)):
        out = [_veil(x) for x in v]
        try:
            return type(v)(out)
        except TypeError:
            # 名前つきの組など、作り方の違う器。**素通りさせるより落とす**
            return type(v)(*out)
    # 入れ物・書類・問い合わせ・引いた中身。ここから先も書けてはいけない。
    # **「書く口を持っている」も見る**（`set` / `get` だけを持つ書類がある）
    if any(hasattr(v, n) for n in _DOOR):
        return _ReadOnly(v)
    if hasattr(v, "__next__"):
        return (_veil(x) for x in v)
    return v


class _ReadOnly:
    """書く口を塞いだ写し。読むほうはそのまま通す。"""

    def __init__(self, inner):
        object.__setattr__(self, "_inner", inner)

    def __getattr__(self, name):
        if name in _WRITE:
            raise ReadOnly(f"下見では Firestore に書けません（{name}）")
        v = getattr(object.__getattribute__(self, "_inner"), name)
        if callable(v):
            def call(*a, **k):
                return _veil(v(*a, **k))
            return call
        return _veil(v)

    def __setattr__(self, name, value):
        raise ReadOnly(f"下見では Firestore に書けません（{name}）")

    def __iter__(self):
        return (_veil(x) for x in iter(object.__getattribute__(self, "_inner")))


def readonly(client):
    """**読むだけ**の Firestore クライアント。

    下見が Firestore につながっていないと、上書きや衝突の数は数える機会が
    無いまま 0 になる。読む人には、その 0 が「無い」のか「見ていない」のか
    見分けがつかない。つないだうえで、書く側だけを塞ぐ。

    Args:
        client: `db()` で作ったクライアント

    Returns:
        読むほうはそのまま通り、書く口を叩くと `ReadOnly` で止まる写し
    """
    return _ReadOnly(client)
