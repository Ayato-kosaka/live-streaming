"""偽の Firestore で、`characters_freeze` を**実際に動かして確かめる。**

    python3 python/admin/characters_freeze_selftest.py

**本番には1バイトも出ない。** Firestore も資格情報も要らない。

## なぜ、これを書いたか

`characters_freeze` は本番で**2回続けて外した。**

1回目は「機械で固められる 0人」と答えた。対照が無かったので、
その 0 が「本当に 0」なのか「何も見ていない」のかが分からなかった。
2回目は対照を入れて、**対照が 13/15 落ちて止まった**（数字は出なかった）。
原因は、`iconsOf` がチャンネルの名前に `keysOf` を当てて
**`@` を落とした形まで作ってから**引いているのに、こちらは `norm_key`
だけで引いていたこと。

**同じことを本番で3回やらない。** 引き当て方は手元で固定できる。

## 確かめるもの

  1. 3つの仕分け（既に持っている／機械で固められる／決めるしかない）が、
     **仕込みどおりの人数**になる
  2. **`@` の食い違いが、ちゃんと当たる。** 名簿が `@さくら`・
     キャラクターの鍵が `さくら` の組（2回目に落ちたのがこれ）
  3. **名前を80字で切ってから正規化する**のが本番と同じ順番になっている
  4. **対照が、本当に火を噴く。** 引き当て方をわざと壊した写しを回して、
     終了コード 2 で止まり、数字が1つも出ないことを見る
  5. 出力に**名前が1文字も出ない**（指紋と人数だけ）
  6. **1バイトも書かない**

## 4 が本命

1〜3 は「通った」を見る確かめで、**対照が壊れていても通る。**
対照が火を噴かないなら、本番で通ったことにも意味が無い
（`docs/island-standards.md` 15）。だから、**壊した写しが落ちるところまで**
を1本の確かめに入れてある。順番は「壊していない写しが通る」が先。
先に壊した写しを回すと、落ちた理由が対照なのか、壊し方なのか分からない。
"""

import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# 出力を丸ごと溜める袋。**`_fs` の basicConfig を読み込む前に**二股にする。
# logging のハンドラは作られた時点の stream を握るため
BUF = io.StringIO()
REAL_OUT, REAL_ERR = sys.stdout, sys.stderr


class Tee:
    """画面にも出しつつ、袋にも同じものを入れる。"""

    def __init__(self, *ws):
        self.ws = ws

    def write(self, s):
        for w in self.ws:
            w.write(s)
        return len(s)

    def flush(self):
        for w in self.ws:
            try:
                w.flush()
            except Exception:  # noqa: BLE001
                pass


sys.stdout = Tee(REAL_OUT, BUF)
sys.stderr = Tee(REAL_ERR, BUF)

# `_fs` が読む `config.py` は、この環境変数が無いと import の時点で落ちる。
# 偽物しか触らないので**本物の名前は要らない**。手元の値は上書きしない
os.environ.setdefault("BQ_PROJECT_ID", "characters-freeze-selftest")

import characters_freeze as cf  # noqa: E402
from _fs import readonly  # noqa: E402

# ---------------------------------------------------------------- 偽の中身

# 本番と同じ形のチャンネルID（`UC` + 22文字）。
# **形を変えて試すと、本番では効かない字を探すことになる**
CH = {
    "have": "UChave1b2c3d4e5f6g7h8i9j",   # 既に channelId を持っている人の先
    "one": "UCone1b2c3d4e5f6g7h8i9j0",    # ちょうど1つに当たる
    "dup1": "UCdup1b2c3d4e5f6g7h8i9j0",   # 同じ名前を名乗る2つのうち片方
    "dup2": "UCdup2b2c3d4e5f6g7h8i9j0",   # もう片方
    "at": "UCat001b2c3d4e5f6g7h8i9j",     # 名簿が `@` 付き（2回目に落ちた形）
    "long": "UClong1b2c3d4e5f6g7h8i9j",   # 名前が80字を超える
}

# 表示名。**ここが1文字でも出力に出たら落とす**
NAME = {
    "have": "もっちり団子",
    "one": "みずうみのほとり",
    "dup": "ななし",                       # dup1 と dup2 が同じ名前を名乗る
    "at": "@さくらもち",                   # 名簿は `@` 付き
}
# 80字を超える名前。**81字目から先は切られる**
LONG_HEAD = "な" * cf.MAX_NAME
NAME["long"] = LONG_HEAD + "ここから先は切られる"

# キャラクターの書類ID（本番と同じ32桁の形）
DOC = {k: f"{i}" + "0123456789abcdef" * 2 for i, k in enumerate(
    ["have", "one", "dup", "at", "long", "orphan"])}

# **対照。** 本番の書類IDのかわりに、仕込みのうち
# 「当たらなければおかしい」4人を置く。`at` と `long` が本命
CONTROL = [DOC["one"], DOC["dup"], DOC["at"], DOC["long"]]


def make_store() -> dict:
    """本番に似せた中身。**外し方を1つずつ仕込んである。**

    - have … 既に `channelId` を持っている。名前は見ない
    - one  … 鍵が `みずうみのほとり` ちょうど1つに当たる → 固められる
    - dup  … 鍵が `ななし` で、そう名乗るチャンネルが2つ → あやとが決める
    - at   … **キャラクターの鍵は `さくらもち`（`@` なし）、名簿は `@さくらもち`。**
             `keysOf` が `@` を落とした形を作るので、本番では当たる。
             `norm_key` だけで引くと落ちる（2回目の本番がこれ）
    - long … 名簿の名前が80字を超える。鍵は**切ったあとの80字**。
             切るのを正規化のあとにすると、ここがずれる
    - orphan … 鍵に当たるチャンネルが名簿に1つも無い
    """
    channels = {
        CH["have"]: {"name": NAME["have"]},
        CH["one"]: {"name": NAME["one"]},
        CH["dup1"]: {"name": NAME["dup"]},
        CH["dup2"]: {"name": NAME["dup"]},
        CH["at"]: {"name": NAME["at"]},
        CH["long"]: {"name": NAME["long"]},
    }
    chars = {
        DOC["have"]: {
            "channelName": NAME["have"], "channelId": CH["have"],
            "channelKeys": [NAME["have"]],
        },
        DOC["one"]: {
            "channelName": NAME["one"], "channelId": None,
            "channelKeys": [NAME["one"]],
        },
        DOC["dup"]: {
            "channelName": NAME["dup"], "channelId": None,
            "channelKeys": [NAME["dup"]],
        },
        DOC["at"]: {
            "channelName": NAME["at"], "channelId": None,
            # **`@` を落とした形しか持っていない。** ここが2回目に落ちた
            "channelKeys": [NAME["at"].lstrip("@")],
        },
        DOC["long"]: {
            "channelName": NAME["long"], "channelId": None,
            # 鍵は**切ったあとの80字**
            "channelKeys": [LONG_HEAD],
        },
        DOC["orphan"]: {
            "channelName": "いないひと", "channelId": None,
            "channelKeys": ["いないひと"],
        },
    }
    return {"islandChannels": channels, "islandCharacter": chars}


# 仕込みから導く期待値。**手で書いた数を置かない**
EXPECT = {
    "have": 1,                              # have
    "freezable": 3,                         # one / at / long
    "ambiguous": 1,                         # dup
    "orphan": 1,                            # orphan
}

# ------------------------------------------------------- 偽の Firestore


class Snap:
    """DocumentSnapshot のかわり。`select` で絞ったぶんだけ返す。"""

    def __init__(self, key, data, fields):
        self.id = key
        # **projection を本物どおりに再現する。** 欄が無ければ鍵ごと返らない
        self._data = {k: v for k, v in data.items()
                      if fields is None or k in fields}

    def to_dict(self):
        return dict(self._data)


class Query:
    """Query のかわり。この道具が使うのは `select` / `limit` / `get` だけ。"""

    def __init__(self, client, col, fields=None, cap=None):
        self.client, self.col = client, col
        self.fields, self.cap = fields, cap

    def select(self, fields):
        return Query(self.client, self.col, list(fields), self.cap)

    def limit(self, n):
        return Query(self.client, self.col, self.fields, n)

    def get(self):
        self.client.reads += 1
        out = [Snap(k, v, self.fields)
               for k, v in self.client.store.get(self.col, {}).items()]
        return out[:self.cap] if self.cap is not None else out


class DocRef:
    """DocumentReference のかわり。**書く口は本物どおり生やしておく。**

    生やしておかないと、`_fs.readonly()` が塞いでいるのか、
    そもそも口が無いだけなのかが分からない。
    """

    def __init__(self, client):
        self.client = client

    def set(self, data):
        self.client.writes += 1

    def update(self, data):
        self.client.writes += 1

    def delete(self):
        self.client.writes += 1


class Col(Query):
    def document(self, key):
        return DocRef(self.client)


class Fake:
    """偽の Firestore。読んだ回数と、書かれた回数を数える。"""

    def __init__(self, store):
        self.store = store
        self.reads = 0
        self.writes = 0

    def collection(self, name):
        return Col(self, name)

    def batch(self):
        raise AssertionError("まとめ書きを作ろうとしました")


# ---------------------------------------------------------------- 確かめる

FAILED: list = []


def ck(name: str, cond: bool, got) -> None:
    mark = "○" if cond else "✕"
    print(f"    {mark} {name}: {got}")
    if not cond:
        FAILED.append(name)


def run(store: dict, break_keys: bool = False):
    """`characters_freeze.main()` を1回通す。

    Args:
        store: 偽の中身
        break_keys: True なら**引き当て方をわざと壊す**（`@` を落とさない）

    Returns:
        (その回の出力, 終了コード, 書かれた回数)
    """
    client = Fake(store)
    was_db, was_ro, was_keys = cf.db, cf.readonly, cf.keys_of
    cf.db = lambda: client
    cf.readonly = readonly
    if break_keys:
        # 2回目の本番と同じ壊し方。`@` を落とした形を作らない
        cf.keys_of = lambda names: [cf.norm_key(n) for n in names
                                    if cf.norm_key(n)]
    here = BUF.tell()
    code = 0
    try:
        cf.main()
    except SystemExit as e:
        code = e.code or 0
    finally:
        cf.db, cf.readonly, cf.keys_of = was_db, was_ro, was_keys
    return BUF.getvalue()[here:], code, client.writes


def main() -> None:
    os.environ["GITHUB_ACTIONS"] = "true"   # 公開の場として回す
    os.environ["ARGS"] = "{}"
    cf.CONTROL = CONTROL

    print("[1] 壊していない写し —— 仕分けの人数が仕込みどおり")
    out, code, writes = run(make_store())
    ck("終了コード 0", code == 0, code)
    ck("対照がぜんぶ当たった", "ぜんぶ当たった" in out, "対照" in out)
    for label, want, needle in (
        ("既に channelId を持っている", EXPECT["have"], "既に channelId"),
        ("機械で固められる", EXPECT["freezable"], "機械で固められる"),
        ("2つ以上に当たる", EXPECT["ambiguous"], "2つ以上に当たる（"),
        ("1つも当たらない", EXPECT["orphan"], "1つも当たらない"),
    ):
        line = next((x for x in out.splitlines() if needle in x), "")
        got = "".join(c for c in line.rsplit(":", 1)[-1] if c.isdigit())
        ck(label, got == str(want), f"{got}（仕込み {want}）")

    print("\n[2] 書いていない")
    ck("書かれた回数 0", writes == 0, writes)

    print("\n[3] 名前が1文字も出ていない")
    leaked = [k for k, v in NAME.items() if v and v in out]
    ck("出力に名前が無い", not leaked, leaked or "無し")
    ck("チャンネルIDも出ていない",
       not any(v in out for v in CH.values()), "無し" if not any(
           v in out for v in CH.values()) else "出ている")

    print("\n[4] **対照が、本当に火を噴く**（引き当て方をわざと壊す）")
    out2, code2, _ = run(make_store(), break_keys=True)
    ck("終了コード 2 で止まる", code2 == 2, code2)
    ck("「この道具は何も見ていない」と言う",
       "何も見ていない" in out2, "何も見ていない" in out2)
    ck("**数字を1つも出していない**",
       "機械で固められる" not in out2, "出していない"
       if "機械で固められる" not in out2 else "出してしまった")

    print("\n[5] **辞書が1件も返らないとき**（本番で2回起きた形）に止まる")
    # `select("name")` と字を渡していたときと同じ景色。問い合わせは通るが
    # 名前が1つも返らない。**赤くならずに全員「当たらない」になる**
    empty = make_store()
    empty["islandChannels"] = {}
    out3, code3, _ = run(empty)
    ck("終了コード 2 で止まる", code3 == 2, code3)
    ck("**数字を1つも出していない**",
       "機械で固められる" not in out3, "出していない"
       if "機械で固められる" not in out3 else "出してしまった")

    print()
    if FAILED:
        print(f"✕ {len(FAILED)} 件落ちた: {', '.join(FAILED)}")
        raise SystemExit(1)
    print("○ ぜんぶ通った")


if __name__ == "__main__":
    main()
