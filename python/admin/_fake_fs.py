"""見張り用の**偽の Firestore**。本番にも資格情報にも触らない。

`python/admin/*_selftest.py` から使う。持っているのは、管理スクリプトが
実際に叩く口だけ——`collection()` / `document()` / `get()` / `set()` /
`list_documents()`。**無い口を叩いたら例外になる**ので、スクリプトが
新しい口を使い始めた日に黙って通らない。

**書いた跡を `writes` に残す。** 「書いていない」を数えるには、
書けたことも数えられないといけない（`docs/island-standards.md` 15）。

ここに置いてあるのは**偽物だけ**で、本物の判断は1つも持っていない。
"""


def cid(tag: str) -> str:
    """偽のチャンネルID。**本物の形（`UC` + 22文字）から1文字ずらしてある。**

    見張りは公開のリポジトリに残るので、本物の形で並べない
    （`tools/logident.py` が数えたものが0でなくなると、本物が混ざった日に
    気づけなくなる。`characters_link_selftest.py` と同じ決め）。

    Args:
        tag: 見分けるための短い字

    Returns:
        `UC` + 21文字
    """
    return "UC" + (tag + "0123456789abcdefghijk")[:21]


class FakeSnap:
    """引いた結果。`exists` と `to_dict()` だけ。"""

    def __init__(self, doc_id, v):
        self.id = doc_id
        self.exists = v is not None
        self._v = v

    def to_dict(self):
        """中身。

        Returns:
            中身の辞書（無ければ None）
        """
        return dict(self._v) if self._v is not None else None


class FakeDoc:
    """書類1件。"""

    def __init__(self, store, name, doc_id):
        self._store = store
        self._name = name
        self.id = doc_id

    def get(self):
        """引く。

        Returns:
            書類の姿
        """
        return FakeSnap(self.id, self._store.data.get(self._name, {}).get(self.id))

    def set(self, patch, merge=False):
        """置く。**何を置いたかを跡に残す。**

        Args:
            patch: 置く中身
            merge: 混ぜるか
        """
        self._store.writes.append(
            {"collection": self._name, "id": self.id,
             "patch": dict(patch), "merge": merge})
        box = self._store.data.setdefault(self._name, {})
        if merge:
            box[self.id] = {**(box.get(self.id) or {}), **patch}
        else:
            box[self.id] = dict(patch)


class FakeCollection:
    """入れ物。"""

    def __init__(self, store, name):
        self._store = store
        self._name = name

    def document(self, doc_id):
        """書類を指す。

        Args:
            doc_id: 書類ID

        Returns:
            書類
        """
        return FakeDoc(self._store, self._name, doc_id)

    def list_documents(self):
        """中の書類ぜんぶ。

        Returns:
            書類の一覧
        """
        return [FakeDoc(self._store, self._name, k)
                for k in list(self._store.data.get(self._name, {}))]


class FakeDb:
    """偽の Firestore。中身は `data` に入れる。"""

    def __init__(self, data=None):
        self.data = data if data is not None else {}
        self.writes = []

    def collection(self, name):
        """入れ物を指す。

        Args:
            name: 入れ物の名前

        Returns:
            入れ物
        """
        return FakeCollection(self, name)
