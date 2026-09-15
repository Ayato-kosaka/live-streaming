"""偽の Firestore で、`island_cards`（＝`cards_build`）を**実際に動かす。**

    python3 python/admin/island_cards_selftest.py

**本番には1バイトも出ない。** Firestore も BigQuery も資格情報も要らない
（どちらも偽物を `sys.modules` に置いてから読み込む）。見るのは6つ:

  1. **投げたときの名乗りが、カードに焼き込まれる**（台帳の
     `displayNameSnapshot` → カードの `nameSnapshot`）。Doneru に別名で
     投げた人は**別名のまま**入る——ここが絵の元なので、いまの名前を
     引き直すと匿名で投げた人の本体が公開の面に出る
  2. **写しを持たない古い書類にも、あとから足される**（本番の51枚）。
     足さないと `iconsOf` の引く元が無く、いま絵が出ている人が全員消える
  3. **置き方（`x` / `y` / `rot` / `scale`）を1つも書き換えない。**
     書き換えると、視聴者さんが動かしたカードが元に戻る
  4. そろっている書類には**1バイトも書かない**（毎晩の空回しで全枚数を
     書き直さない）
  5. **下見（`--dry-run`）が既定**の作りが生きている
  6. 公開の場（`GITHUB_ACTIONS=true`）で、出力にチャンネルIDも名乗りも
     1文字も出ない。**対照として、外すと出ることも見る**

## なぜ 6 に対照が要るのか

「出ていない」は、**何も動いていなくても通る。** 同じ仕込みで素が出ることを
先に見せておけば、0件は「出るはずのものが、公開の場でだけ消えている」になる。

## 壊した写しで落ちるところまで見る（`docs/island-misses.md` #99 #100）

`ISLAND_CARDS_PY` に壊した写しの道を渡すと、そちらを読み込む。

    cp python/island_cards.py /tmp/broken.py   # 守りを1つ外す
    ISLAND_CARDS_PY=/tmp/broken.py python3 python/admin/island_cards_selftest.py
"""

import importlib.util
import io
import os
import sys
import types

HERE = os.path.dirname(os.path.abspath(__file__))
PY_DIR = os.path.dirname(HERE)
sys.path.insert(0, PY_DIR)

# `config.py` はこの環境変数が無いと読み込みの時点で落ちる。ここで作る
# クライアントは偽物なので**本物の名前は要らない**が、無いと確かめそのものが
# 起動できない（`#99` の「回らない診断」）。**手元の値は上書きしない**
os.environ.setdefault("BQ_PROJECT_ID", "island-cards-selftest")

# ------------------------------------------------------- 偽の google.cloud
#
# `google-cloud-firestore` はこの箱に入っていない。**本体は import 文を
# 持ったままでよい**（本番には入っている）ので、読み込む前に偽物を置く。
import google.cloud  # noqa: E402

for _name in ("firestore", "bigquery"):
    _mod = types.ModuleType(f"google.cloud.{_name}")
    sys.modules[f"google.cloud.{_name}"] = _mod
    setattr(google.cloud, _name, _mod)
sys.modules["google.cloud.firestore"].Client = lambda **kw: None
sys.modules["google.cloud.bigquery"].Client = lambda **kw: None

# 本体。**写しは持たない**（写しを置くと、本体を直したのに古いものが通る）
_PATH = os.environ.get("ISLAND_CARDS_PY") or os.path.join(PY_DIR, "island_cards.py")
_spec = importlib.util.spec_from_file_location("island_cards_under_test", _PATH)
island_cards = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(island_cards)
print(f"# 読み込んだ本体: {_PATH}")

# ---------------------------------------------------------------- 偽の中身
#
# **ぜんぶ偽の字。** 本番のチャンネルIDも名乗りも1文字も置かない。

DAY = "2026-09-11"
VIDEO = "vid00000001"

CH = {
    "a": "UCa1b2c3d4e5f6g7h8i9j0kL",  # スパチャ。名乗り＝チャンネル名
    "b": "UCz9y8x7w6v5u4t3s2r1q0pM",  # Doneru に**別名で**投げた人
    "c": "UCm5n4o3p2q1r0s9t8u7v6wN",  # 名乗りを持たない投げ銭
}
NAME = {"a": "さくら", "b": "ななしのごんべえ"}

IMAGE_ID = "img_0000001"
EVENT_ID = "ev1"

# 置き方の欄。**ここが書き込みに1つでも出たら落とす**
PLACE = ("x", "y", "rot", "scale")


class Snap:
    """書類1件の姿。"""

    def __init__(self, doc_id, v):
        self.id = doc_id
        self._v = v

    @property
    def exists(self):
        return self._v is not None

    def to_dict(self):
        return self._v


class Ref:
    """書類への指し。`batch.set()` に渡る。"""

    def __init__(self, col, doc_id):
        self.col = col
        self.id = doc_id


class Col:
    """コレクション。`stream()` と `document()` だけ。"""

    def __init__(self, store, name):
        self._store = store
        self._name = name

    def stream(self):
        for doc_id, v in (self._store.get(self._name) or {}).items():
            yield Snap(doc_id, v)

    def document(self, doc_id):
        return Ref(self._name, doc_id)


class Batch:
    """まとめ書き。**袋に入れるだけで、どこにも出さない。**"""

    def __init__(self, sink):
        self._sink = sink
        self._pend = []

    def set(self, ref, v, merge=False):
        self._pend.append({"id": ref.id, "col": ref.col, "data": v, "merge": merge})

    def commit(self):
        self._sink["commits"] += 1
        self._sink["writes"].extend(self._pend)
        self._pend = []


class FakeDb:
    """偽の Firestore。"""

    def __init__(self, store, sink):
        self._store = store
        self._sink = sink

    def collection(self, name):
        return Col(self._store, name)

    def get_all(self, refs):
        for r in refs:
            yield Snap(r.id, (self._store.get(r.col) or {}).get(r.id))

    def batch(self):
        return Batch(self._sink)


def tips(with_name=True):
    """台帳3件。"""
    out = {
        "tip_a": {
            "channelId": CH["a"],
            "day": DAY,
            "videoId": VIDEO,
            "donatedAt": 1000,
            "displayNameSnapshot": NAME["a"] if with_name else None,
        },
        "tip_b": {
            "channelId": CH["b"],
            "day": DAY,
            "videoId": VIDEO,
            "donatedAt": 1100,
            # **Doneru の別名。** 紐付け（どねID → チャンネルID）はしてあるので
            # `channelId` は入るが、焼き込むのは名乗ったほう
            "displayNameSnapshot": NAME["b"] if with_name else None,
        },
        "tip_c": {
            "channelId": CH["c"],
            "day": DAY,
            "videoId": VIDEO,
            "donatedAt": 1200,
            # 名乗りを持たない投げ銭（欄ごと無い）
        },
    }
    return out


def store(cards=None, with_name=True):
    """入れ物ぜんぶ。"""
    return {
        "islandStreamEvent": {EVENT_ID: {"date": DAY, "videoIds": [VIDEO]}},
        "islandStreamEventImage": {
            IMAGE_ID: {
                "role": "card",
                "url": "https://example.invalid/1.jpg",
                "streamEventId": EVENT_ID,
                "at": 300,
            }
        },
        "islandTips": tips(with_name),
        "islandCards": cards or {},
    }


def run(argv, cards=None, public=True, with_name=True):
    """本体を1回まわす。

    Args:
        argv: `island_cards.py` に渡す引数
        cards: すでに入っているカード
        public: 公開の場（`GITHUB_ACTIONS`）として回すか
        with_name: 台帳に名乗りを入れるか

    Returns:
        (終了コード, 書いたものの一覧, `commit()` の回数, 出力ぜんぶ)
    """
    sink = {"writes": [], "commits": 0}
    db = FakeDb(store(cards, with_name), sink)
    island_cards.firestore.Client = lambda **kw: db

    had_env = os.environ.get("GITHUB_ACTIONS")
    if public:
        os.environ["GITHUB_ACTIONS"] = "true"
    else:
        os.environ.pop("GITHUB_ACTIONS", None)

    buf = io.StringIO()
    real_out, real_err = sys.stdout, sys.stderr
    sys.stdout, sys.stderr = buf, buf
    old_argv = sys.argv
    sys.argv = ["island_cards.py"] + argv
    # ログは作られた時点の stream を握るので、掴み直させる
    for h in list(island_cards.logging.getLogger().handlers):
        h.stream = buf
    try:
        code = island_cards.main()
    finally:
        sys.argv = old_argv
        sys.stdout, sys.stderr = real_out, real_err
        for h in list(island_cards.logging.getLogger().handlers):
            h.stream = sys.stderr
        if had_env is None:
            os.environ.pop("GITHUB_ACTIONS", None)
        else:
            os.environ["GITHUB_ACTIONS"] = had_env
    return code, sink["writes"], sink["commits"], buf.getvalue()


BAD = 0
OK = 0


def check(name, good, why=""):
    """1件の確かめ。"""
    global BAD, OK
    if good:
        OK += 1
        print(f"  ok   {name}")
        return
    BAD += 1
    print(f"  NG   {name}" + (f" — {why}" if why else ""))


def one(writes, doc_id):
    """書いた1件を取り出す。"""
    for w in writes:
        if w["id"] == doc_id:
            return w
    return None


CARD_A = f"{IMAGE_ID}__{CH['a']}"
CARD_B = f"{IMAGE_ID}__{CH['b']}"
CARD_C = f"{IMAGE_ID}__{CH['c']}"

print("\n# 0. 名乗りが焼き込まれる（先に見る・#19）")
code, writes, commits, out = run([], public=False)
check("終了コード 0", code == 0, str(code))
check("3枚ぶん書いた（空振りでない）", len(writes) == 3, f"{len(writes)} 件")
a, b, c = one(writes, CARD_A), one(writes, CARD_B), one(writes, CARD_C)
check(
    "スパチャの名乗りが `nameSnapshot` に入る",
    a and a["data"].get("nameSnapshot") == NAME["a"],
    repr(a and a["data"].get("nameSnapshot")),
)
check(
    "**Doneru の別名は、別名のまま入る**（いまの名前を引き直していない）",
    b and b["data"].get("nameSnapshot") == NAME["b"],
    repr(b and b["data"].get("nameSnapshot")),
)
check(
    "名乗りを持たない投げ銭は None（欄ごと欠けさせない）",
    c and "nameSnapshot" in c["data"] and c["data"]["nameSnapshot"] is None,
    repr(c and c["data"].get("nameSnapshot")),
)
check(
    "新しい書類には置き方が入る（`default_place`）",
    a and all(k in a["data"] for k in PLACE),
    repr(sorted((a or {}).get("data", {}))),
)
check(
    "台帳の欄の名前をそのまま持ち込んでいない",
    a and "displayNameSnapshot" not in a["data"],
    repr(sorted((a or {}).get("data", {}))),
)

print("\n# 1. 写しを持たない古い書類に、あとから足される（本番の51枚）")
MOVED = {
    "channelId": CH["a"],
    "streamEventId": EVENT_ID,
    "streamEventImageId": IMAGE_ID,
    "day": DAY,
    "earnedAt": 1000,
    "x": 0.111,
    "y": 0.222,
    "rot": 33.3,
    "scale": 0.44,
    "movedAt": 9999,
}
code, writes, commits, out = run([], cards={CARD_A: MOVED}, public=False)
w = one(writes, CARD_A)
check("終了コード 0", code == 0, str(code))
check("名乗りが足された", w and w["data"].get("nameSnapshot") == NAME["a"], repr(w))
check("`merge=True` で足している", w and w["merge"] is True, repr(w and w["merge"]))
check(
    "置き方（x / y / rot / scale）を1つも書いていない",
    w and not any(k in w["data"] for k in PLACE),
    repr(sorted((w or {}).get("data", {}))),
)
check(
    "書いたのは名乗りと時刻だけ",
    w and sorted(w["data"]) == ["nameSnapshot", "updatedAt"],
    repr(sorted((w or {}).get("data", {}))),
)

print("\n# 2. 旧来の「動かしたぶんだけ」の書類にも、置き方を書かない")
OLD = {"x": 0.111, "y": 0.222, "rot": 33.3, "scale": 0.44, "movedAt": 9999}
code, writes, commits, out = run([], cards={CARD_A: OLD}, public=False)
w = one(writes, CARD_A)
check("名乗りも一緒に入る", w and w["data"].get("nameSnapshot") == NAME["a"], repr(w))
check(
    "置き方（x / y / rot / scale）を1つも書いていない",
    w and not any(k in w["data"] for k in PLACE),
    repr(sorted((w or {}).get("data", {}))),
)
check("`merge=True`", w and w["merge"] is True, repr(w and w["merge"]))

print("\n# 3. もうそろっている書類には、1バイトも書かない")
DONE = {
    CARD_A: {**MOVED, "nameSnapshot": NAME["a"]},
    CARD_B: {
        "channelId": CH["b"],
        "streamEventId": EVENT_ID,
        "streamEventImageId": IMAGE_ID,
        "day": DAY,
        "earnedAt": 1100,
        "nameSnapshot": NAME["b"],
        "x": 0.7,
        "y": 0.9,
        "rot": 0,
        "scale": 1,
    },
    # 名乗りの無い者どうし。**None と欄なしを畳まないと、毎晩書き直す**
    CARD_C: {
        "channelId": CH["c"],
        "streamEventId": EVENT_ID,
        "streamEventImageId": IMAGE_ID,
        "day": DAY,
        "earnedAt": 1200,
        "x": 0.7,
        "y": 0.9,
        "rot": 0,
        "scale": 1,
    },
}
code, writes, commits, out = run([], cards=DONE, public=False)
check("書き込みが0件", len(writes) == 0, f"{len(writes)} 件")
check("`commit()` も呼んでいない", commits == 0, f"{commits} 回")

print("\n# 4. 下見（--dry-run）が既定の作りは生きている")
code, writes, commits, out = run(["--dry-run"], public=False)
check("終了コード 0", code == 0, str(code))
check("1バイトも書いていない", len(writes) == 0 and commits == 0, f"{len(writes)} 件")
check("書いていないと言っている", "--dry-run なので書いていません" in out, out[-200:])
# 対照。外せば書く（この確かめが空振りでない）
_, w2, _, _ = run([], public=False)
check("外せば書く（空振りでない）", len(w2) == 3, f"{len(w2)} 件")

print("\n# 5. 公開の場では、素性が1文字も出ない")
_, _, _, pub = run([], public=True)
_, _, _, priv = run([], public=False)
check(
    "手元では、チャンネルIDが素で出る（対照）",
    CH["a"] in priv,
    priv[-200:],
)
check("公開の場では、チャンネルIDが出ない", CH["a"] not in pub, pub[-200:])
check("公開の場では、`UC` で始まる字が無い", "UC" not in pub, pub[-200:])
check(
    "公開の場では、名乗りが出ない",
    NAME["a"] not in pub and NAME["b"] not in pub,
    pub[-200:],
)
check("枚数だけは出る（何も見ていないのではない）", "あるべきカード: 3枚" in pub, pub[-200:])

print("")
if BAD:
    print(f"NG が {BAD} 件（通ったのは {OK} 件）。")
    raise SystemExit(1)
print(f"{OK} 件ぜんぶ通った。")
