"""偽の Firestore で、`island_cards`（＝`cards_build`）を**実際に動かす。**

    python3 python/admin/island_cards_selftest.py

**本番には1バイトも出ない。** Firestore も BigQuery も資格情報も要らない
（どちらも偽物を `sys.modules` に置いてから読み込む）。見るのは9つ:

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
  7. **その日を配信日とする投げ銭が0件の日（配信の無い日）の写真が、
     その日に届いた投げ銭の人に渡る**（本番の 2026-09-27）。
     **配信があった日は1人も増えない**ことも、同じ仕込みで見る
  8. 2026-09-06 の補正（22時開始の配信に 00:23 で投げた人を前日へ戻す）が
     生きている。**7 の絞りを外すと、配信があった日の人数が増える**（対照）
  9. Doneru（`videoStartedAt` を持たない）が届いた日は、必ず「0件」に
     ならない。7 の安全弁

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
from datetime import datetime, timedelta, timezone

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


def run_on(st, argv=None, public=False):
    """**入れ物をそのまま渡して**本体を1回まわす。

    `run` は仕込みが1日ぶんに決まっているので、日付をまたぐ筋書き
    （0時またぎ・配信の無い日）はこちらを使う。

    Args:
        st: 入れ物ぜんぶ（コレクション名 -> 書類ID -> 中身）
        argv: `island_cards.py` に渡す引数
        public: 公開の場（`GITHUB_ACTIONS`）として回すか

    Returns:
        (終了コード, 書いたものの一覧, `commit()` の回数, 出力ぜんぶ)
    """
    sink = {"writes": [], "commits": 0}
    db = FakeDb(st, sink)
    island_cards.firestore.Client = lambda **kw: db
    argv = argv or []

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


def run(argv, cards=None, public=True, with_name=True):
    """1日ぶんの仕込みで、本体を1回まわす。

    Args:
        argv: `island_cards.py` に渡す引数
        cards: すでに入っているカード
        public: 公開の場（`GITHUB_ACTIONS`）として回すか
        with_name: 台帳に名乗りを入れるか

    Returns:
        (終了コード, 書いたものの一覧, `commit()` の回数, 出力ぜんぶ)
    """
    return run_on(store(cards, with_name), argv, public)


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


# ---------------------------------------------------- 日付をまたぐ筋書き
#
# **ここから下は、`store()` の1日ぶんでは作れない形。** `run_on` に入れ物を
# そのまま渡す。本番で実際に起きた3つを、形だけ写してある。

CH4 = "UCq7r6s5t4u3v2w1x0y9z8aO"  # 4人目。**偽の字**
V26, V06, V07, V28 = "vid00000026", "vid00000006", "vid00000007", "vid00000028"


def jst(iso: str) -> int:
    """日本時間の `YYYY-MM-DDTHH:MM:SS` を、ミリ秒にする。

    配信の始まりを仕込むのに使う。`functions/selftest/cards_mint_selftest.mjs`
    の `jst()` と同じもの。

    Args:
        iso: `2026-09-26T21:00:00` の形（日本時間）

    Returns:
        ミリ秒
    """
    t = datetime.fromisoformat(iso).replace(tzinfo=timezone(timedelta(hours=9)))
    return int(t.timestamp() * 1000)


def photo(doc_id: str, day: str, at: int) -> dict:
    """カードになる写真1枚。**企画は付いていない**（`streamEventId` は空）。

    Args:
        doc_id: 書類ID（使う側で持つ）
        day: 写真の日
        at: 貼った時刻（ミリ秒）

    Returns:
        画像1件の中身
    """
    del doc_id
    return {
        "role": "card",
        "url": "https://example.invalid/x.jpg",
        "streamEventId": "",
        "at": at,
        "day": day,
    }


def ids(writes) -> list:
    """書いたものの書類IDを並べる。"""
    return sorted(w["id"] for w in writes)


print("\n# 6. 配信の無い日の写真（本番の 2026-09-27 の形）")
#
# 配信は 9/26（月末配信）と 9/28 で、**9/27 には1本も無い。** 日本時間
# 9/27 の未明に届いた投げ銭3件は 9/26 に始まった配信のものなので、補正
# （`tip_day`）が 9/26 へ寄せる。**その結果 9/27 の写真が0枚になっていた。**
START_26 = jst("2026-09-26T21:00:00")
GAP = {
    "islandStreamEvent": {},
    "islandStreamEventImage": {
        "img_0000026": photo("img_0000026", "2026-09-26", jst("2026-09-26T23:00:00")),
        "img_0000027": photo("img_0000027", "2026-09-27", jst("2026-09-27T12:00:00")),
    },
    "islandTips": {
        # 配信中（9/26 21:30）。生の日も配信の日も 9/26
        "tip_m1": {
            "channelId": CH["a"],
            "day": "2026-09-26",
            "videoId": V26,
            "videoStartedAt": START_26,
            "donatedAt": jst("2026-09-26T21:30:00"),
            "displayNameSnapshot": NAME["a"],
        },
        # **0時すぎ。生の日は 9/27 だが、配信の日は 9/26**。3人ぶん
        "tip_m2": {
            "channelId": CH["b"],
            "day": "2026-09-27",
            "videoId": V26,
            "videoStartedAt": START_26,
            "donatedAt": jst("2026-09-27T00:10:00"),
            "displayNameSnapshot": NAME["b"],
        },
        "tip_m3": {
            "channelId": CH["c"],
            "day": "2026-09-27",
            "videoId": V26,
            "videoStartedAt": START_26,
            "donatedAt": jst("2026-09-27T00:20:00"),
        },
        "tip_m4": {
            "channelId": CH4,
            "day": "2026-09-27",
            "videoId": V26,
            "videoStartedAt": START_26,
            "donatedAt": jst("2026-09-27T00:30:00"),
        },
    },
    "islandCards": {},
}
code, writes, _, out = run_on(GAP)
check("終了コード 0", code == 0, str(code))
check(
    "配信日として数えられている日は 9/26 だけ（9/27 は0件）",
    island_cards.stream_days(list(GAP["islandTips"].values())) == {"2026-09-26"},
    repr(island_cards.stream_days(list(GAP["islandTips"].values()))),
)
got_27 = [w for w in writes if w["id"].startswith("img_0000027__")]
got_26 = [w for w in writes if w["id"].startswith("img_0000026__")]
check(
    "**9/27 の写真が、その日に届いた投げ銭の3人に渡る**（0枚だったところ）",
    len(got_27) == 3,
    f"{len(got_27)} 枚 / {ids(writes)}",
)
check(
    "9/27 のカードは、生の日で届いた3人ぶん（4人目を増やしていない）",
    sorted(w["id"].split("__")[1] for w in got_27)
    == sorted([CH["b"], CH["c"], CH4]),
    repr(sorted(w["id"].split("__")[1] for w in got_27)),
)
check(
    "**配信があった 9/26 の写真は4枚のまま**（1人も増えない）",
    len(got_26) == 4,
    f"{len(got_26)} 枚 / {ids(writes)}",
)
check(
    "9/27 のカードの `day` は写真の日（割れていない）",
    all(w["data"]["day"] == "2026-09-27" for w in got_27),
    repr([w["data"]["day"] for w in got_27]),
)
check("ぜんぶで7枚", len(writes) == 7, f"{len(writes)} 枚 / {ids(writes)}")

print("\n# 7. 2026-09-06 の補正は生きている（配信があった日は増えない）")
#
# 22時に始まった配信に、22:27 と（日をまたいで）00:23 の2人。**同じ配信**
# なので、00:23 の人も前日 9/06 の写真をもらう。翌日 9/07 にも配信があるので、
# **9/07 の写真は 9/07 の配信の人だけ**（00:23 の人が二重に取らない）。
START_06 = jst("2026-09-06T22:00:00")
MID = {
    "islandStreamEvent": {},
    "islandStreamEventImage": {
        "img_0000006": photo("img_0000006", "2026-09-06", jst("2026-09-06T23:00:00")),
        "img_0000007": photo("img_0000007", "2026-09-07", jst("2026-09-07T21:00:00")),
    },
    "islandTips": {
        "tip_early": {
            "channelId": CH["a"],
            "day": "2026-09-06",
            "videoId": V06,
            "videoStartedAt": START_06,
            "donatedAt": jst("2026-09-06T22:27:00"),
            "displayNameSnapshot": NAME["a"],
        },
        "tip_late": {
            # **生の日は翌日。配信の始まりは前日**
            "channelId": CH["b"],
            "day": "2026-09-07",
            "videoId": V06,
            "videoStartedAt": START_06,
            "donatedAt": jst("2026-09-07T00:23:00"),
            "displayNameSnapshot": NAME["b"],
        },
        "tip_next": {
            # **翌日に始まった、別の配信**
            "channelId": CH4,
            "day": "2026-09-07",
            "videoId": V07,
            "videoStartedAt": jst("2026-09-07T20:00:00"),
            "donatedAt": jst("2026-09-07T20:10:00"),
        },
    },
    "islandCards": {},
}
code, writes, _, out = run_on(MID)
check("終了コード 0", code == 0, str(code))
check(
    "**00:23 に投げた人が、前日 9/06 の写真のカードになっている**",
    f"img_0000006__{CH['b']}" in ids(writes),
    repr(ids(writes)),
)
check(
    "9/06 の写真は2枚（前半の人と、0時すぎの人）",
    len([w for w in writes if w["id"].startswith("img_0000006__")]) == 2,
    repr(ids(writes)),
)
check(
    "**9/07 の写真は、9/07 の配信の1人だけ**（0時すぎの人が二重に取らない）",
    [w["id"] for w in writes if w["id"].startswith("img_0000007__")]
    == [f"img_0000007__{CH4}"],
    repr(ids(writes)),
)
check("ぜんぶで3枚", len(writes) == 3, f"{len(writes)} 枚 / {ids(writes)}")

# **対照。** 絞り（「その日を配信日とする投げ銭が0件のときだけ」）を外すと、
# 配信があった 9/07 の写真を 00:23 の人も取って**2人に増える。**
# これが増えないことが、絞りが効いている証拠。
ROWS = list(MID["islandTips"].values())
IMG_07 = {"id": "img_0000007", "streamEventId": "", "at": 0,
          "day": "2026-09-07", "videoIds": []}
DAYS = island_cards.stream_days(ROWS)
N_ON = sum(1 for t in ROWS if island_cards.hits(t, IMG_07, {}, DAYS))
N_OFF = sum(1 for t in ROWS if island_cards.hits(t, IMG_07, {}, set()))
check(
    "9/06 と 9/07 の両方が、配信日として数えられている",
    DAYS == {"2026-09-06", "2026-09-07"},
    repr(DAYS),
)
check("絞りがあると、9/07 の写真は1人", N_ON == 1, f"{N_ON} 人")
check(
    "**絞りを外すと2人に増える**（対照。この絞りが効いている）",
    N_OFF == 2,
    f"{N_OFF} 人",
)

print("\n# 8. Doneru が届いた日は、必ず「0件」にならない（安全弁）")
#
# Doneru は `videoStartedAt` を持たないので、**補正後の日＝生の日**になる。
# つまり Doneru が1件でも届いた日は `stream_days` に必ず入り、生の `day` へ
# 落ちることがない。**投げ銭のある日がうっかり落ちない**のはこの性質。
DONERU = {
    "islandStreamEvent": {},
    "islandStreamEventImage": {
        "img_0000029": photo("img_0000029", "2026-09-29", jst("2026-09-29T20:00:00")),
    },
    "islandTips": {
        # Doneru。配信IDも配信の始まりも持たない
        "tip_dn": {
            "channelId": CH["a"],
            "day": "2026-09-29",
            "donatedAt": jst("2026-09-29T19:00:00"),
            "displayNameSnapshot": NAME["a"],
        },
        # 前の晩（9/28 22:00 開始）の配信に、0時すぎで投げてくれた人
        "tip_prev": {
            "channelId": CH["b"],
            "day": "2026-09-29",
            "videoId": V28,
            "videoStartedAt": jst("2026-09-28T22:00:00"),
            "donatedAt": jst("2026-09-29T00:40:00"),
            "displayNameSnapshot": NAME["b"],
        },
    },
    "islandCards": {},
}
code, writes, _, out = run_on(DONERU)
check("終了コード 0", code == 0, str(code))
check(
    "Doneru の1件で、9/29 が配信日として数えられる",
    "2026-09-29" in island_cards.stream_days(list(DONERU["islandTips"].values())),
    repr(island_cards.stream_days(list(DONERU["islandTips"].values()))),
)
check(
    "9/29 の写真は、Doneru の1人だけ（前の晩の配信の人は取らない）",
    ids(writes) == [f"img_0000029__{CH['a']}"],
    repr(ids(writes)),
)

print("")
if BAD:
    print(f"NG が {BAD} 件（通ったのは {OK} 件）。")
    raise SystemExit(1)
print(f"{OK} 件ぜんぶ通った。")
