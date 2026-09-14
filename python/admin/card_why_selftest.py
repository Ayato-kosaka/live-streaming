"""偽の Firestore で、`card_why` の**振る舞いを実際に動かして確かめる。**

    python3 python/admin/card_why_selftest.py

**本番には1バイトも出ない。** Firestore も BigQuery も資格情報も要らない
（`card_why` が触る口を偽物に差し替えてある）。確かめるのは5つ:

  1. **公開の場（`GITHUB_ACTIONS=true`）で、出力に素性が1文字も無い。**
     チャンネルID（`UC…`）・ハンドル（`@…`）・チャットの本文・表示名のどれも
     （0件を信じる前に、**その探し方が仕込んだ字に当たること**を先に見る）
  2. **対照。** `GITHUB_ACTIONS` を外して同じものを回すと、チャンネルIDが
     素で出る。ここが出ないなら、1 の 0件は「消えた」ではなく
     **「そもそも何も出ていない」**
  3. 数が合う（台帳の空欄・日本時間の日の境目・カードの候補の人数・
     **配られたカードの枚数と、投げ銭したのに1枚も無い人の数**）
  4. **1バイトも書かない。** 書く口は `_fs.readonly()` が塞ぐ
  5. 日付が無い／形が違う入力は、はっきり落ちる

## なぜ 2 が要るのか

1 は「出ていないこと」を見る確かめで、**何も動いていなくても通る。**
仕込みを読み損ねていても、表が空でも、`grep` は 0件と言う。
同じ仕込みで素が出ることを先に見せておけば、1 の 0件は
「出るはずのものが、公開の場でだけ消えている」になる。

## 1 の測りかた

`sys.stdout` と `sys.stderr` を二股にして出力を丸ごと溜め、最後に正規表現で
探す（`log` は stderr へ出るので、**両方**を溜める必要がある）。
探す形は本番と同じにしてある。チャンネルIDは `UC` + 22文字、ハンドルは
`@` 始まり。**形の違うもので試すと、本番では効かない字を探すことになる。**
"""

import io
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# 実際の出力を溜める袋。**card_why（＝_fs の basicConfig）を読み込む前に**
# 二股にしておく。logging のハンドラは作られた時点の stream を握るため
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
# ここで作る Firestore クライアントは偽物なので**本物の名前は要らない**が、
# 無いと確かめそのものが起動できない。**手元の値を上書きはしない**
os.environ.setdefault("BQ_PROJECT_ID", "card-why-selftest")

import card_why  # noqa: E402
from _fs import ReadOnly, readonly  # noqa: E402

# ---------------------------------------------------------------- 偽の中身

DAY = "2026-09-12"

# 本番と同じ形のチャンネルID（`UC` + 22文字）。
# **形を変えて試すと、本番では効かない字を探すことになる**
CH = {
    "a": "UCa1b2c3d4e5f6g7h8i9j0kL",   # 台帳にも居て、チャットにも居る
    "b": "UCz9y8x7w6v5u4t3s2r1q0pM",   # チャットにだけ居る（＝カードが渡らない）
    "c": "UCm5n4o3p2q1r0s9t8u7v6wN",   # 台帳にだけ居る（何も書かなかった投げ銭）
    "d": "UCd0d1d2d3d4d5d6d7d8d9eO",   # **前後の日にしか居ない**（境目の確かめ）
}

# 表示名とハンドル。**ここが1文字でも出力に出たら落とす**
NAME = {
    "a": "@ayatojima-tori",
    "b": "@nanashi-9q2",
    "c": "ちゃんあお",
    "d": "@tonari-no-hi",
}

# チャットの本文。溜めてはいるが、この道具は1文字も出さない
TEXT = "今日もありがとうございました"


def ms(day: str, hh: int, mm: int) -> int:
    """日本時間の `day hh:mm` をミリ秒に。境目の確かめに使う。"""
    from datetime import datetime

    return int(
        datetime.strptime(f"{day} {hh:02d}:{mm:02d}", "%Y-%m-%d %H:%M")
        .replace(tzinfo=card_why.JST)
        .timestamp()
        * 1000
    )


def doc_id(n: int) -> str:
    """Firestore の自動採番と同じ形（20文字の英数字）。"""
    abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    out, v = [], n * 2654435761 + 12345
    for _ in range(20):
        v = (v * 1103515245 + 12345) & 0x7FFFFFFF
        out.append(abc[v % len(abc)])
    return "".join(out)


def make_store() -> dict:
    """本番に似せた中身。**外し方を1つずつ仕込んである。**

    - a … 台帳に1件・チャット17件（うち有料2件）・キャラクターはチャンネルIDで当たる。
          **カードはその日3枚（企画のカード画像3枚ぶん）と、前の日に1枚**
    - b … **台帳に居ない。** チャットだけ4件（うち有料1件）。カードが渡らない側
    - c … 台帳に2件。チャットは1件も無い（本文を書かずに投げた人）。
          キャラクターは**名前でしか当たらない**（`channelId` を持っていない人）。
          **カードは1枚も無い。＝ 投げ銭したのに配られていない人**（この道具の本命）
    - d … 前の日の 23:59 と 次の日の 00:00 にだけ居る。**1行も出てはいけない**。
          ただし**その日のカードは1枚持つ**（0時をまたいだ配信で、台帳が翌日・
          カードが配信日に載った形）。枚数には数えるが、**行は増やさない**
    - Doneru の紐付け待ち … `channelId` が空の台帳の行を3件
    - チャンネルIDの無いチャット … 1件
    """
    tips = {}
    tips[doc_id(1)] = {
        "day": DAY, "channelId": CH["a"], "source": "youtube_superchat",
        "amount": 500, "currency": "JPY", "videoId": "MoxSgyW_12k",
        "displayNameSnapshot": NAME["a"],
    }
    for i, amt in enumerate((1000, 300)):
        tips[doc_id(10 + i)] = {
            "day": DAY, "channelId": CH["c"], "source": "doneru",
            "amount": amt, "currency": "JPY", "videoId": "MoxSgyW_12k",
            "displayNameSnapshot": NAME["c"],
        }
    # 紐付け待ち。**台帳には残るが、カードは渡らない**（island_tips の頭）
    for i in range(3):
        tips[doc_id(20 + i)] = {
            "day": DAY, "channelId": None, "source": "doneru",
            "amount": 500, "currency": "JPY", "videoId": None,
            "displayNameSnapshot": f"どねの呼び名{i}",
        }
    # 別の日の台帳。**混ざってはいけない**
    tips[doc_id(30)] = {
        "day": "2026-09-11", "channelId": CH["d"], "source": "youtube_superchat",
        "amount": 200, "currency": "JPY", "videoId": "aaaaaaaaaaa",
        "displayNameSnapshot": NAME["d"],
    }

    msgs = {}
    n = 0
    for i in range(17):
        # 17件のうち2件が有料（スパチャとステッカー）
        kind = ("superChatEvent" if i == 3 else
                "superStickerEvent" if i == 9 else "textMessageEvent")
        msgs[f"MoxSgyW_12k_m{n}"] = {
            "videoId": "MoxSgyW_12k", "messageId": f"m{n}",
            "at": ms(DAY, 21, i % 60), "text": TEXT,
            "channelId": CH["a"], "name": NAME["a"], "kind": kind,
        }
        n += 1
    for i in range(4):
        kind = "newSponsorEvent" if i == 1 else "textMessageEvent"
        msgs[f"MoxSgyW_12k_m{n}"] = {
            "videoId": "MoxSgyW_12k", "messageId": f"m{n}",
            "at": ms(DAY, 22, i), "text": TEXT,
            "channelId": CH["b"], "name": NAME["b"], "kind": kind,
        }
        n += 1
    # チャンネルIDの無い1件
    msgs[f"MoxSgyW_12k_m{n}"] = {
        "videoId": "MoxSgyW_12k", "messageId": f"m{n}",
        "at": ms(DAY, 22, 30), "text": TEXT,
        "channelId": "", "name": "", "kind": "textMessageEvent",
    }
    n += 1
    # 境目。前の日の 23:59 と 翌日の 00:00。**どちらも入ってはいけない**
    for at in (ms("2026-09-11", 23, 59), ms("2026-09-13", 0, 0)):
        msgs[f"aaaaaaaaaaa_m{n}"] = {
            "videoId": "aaaaaaaaaaa", "messageId": f"m{n}",
            "at": at, "text": TEXT,
            "channelId": CH["d"], "name": NAME["d"], "kind": "superChatEvent",
        }
        n += 1
    # その日のいちばん端（23:59）。**これは入る**
    msgs[f"MoxSgyW_12k_m{n}"] = {
        "videoId": "MoxSgyW_12k", "messageId": f"m{n}",
        "at": ms(DAY, 23, 59), "text": TEXT,
        "channelId": CH["a"], "name": NAME["a"], "kind": "textMessageEvent",
    }

    chars = {
        # チャンネルIDを持っている人
        doc_id(100): {
            "channelName": NAME["a"], "emoji": "🐦",
            "channelKeys": [NAME["a"], NAME["a"].lstrip("@")],
            "lookupKeys": [NAME["a"], NAME["a"].lstrip("@")],
            "channelId": CH["a"],
            "images": {"plain": {"url": "https://example.invalid/a.webp"}},
        },
        # **チャンネルIDを持っていない人。** 名前でしか当たらない
        doc_id(101): {
            "channelName": "@aoi1685", "emoji": "🐟",
            "channelKeys": ["@aoi1685", "aoi1685"],
            "lookupKeys": ["@aoi1685", "aoi1685", NAME["c"]],
            "channelId": None,
            "images": {"plain": {"url": "https://example.invalid/c.webp"}},
        },
    }
    # 配られたカード。鍵は本番と同じ `<画像のID>__<チャンネルID>`
    # （`functions/src/streamEvents.ts` の `cardId`）。
    # **`day` は企画の日**（`island_cards.py` が `企画の日付 || 台帳の day`
    # で入れる）なので、台帳の日とずれることがある。d がその形
    cards = {}
    for i, img in enumerate((doc_id(200), doc_id(201), doc_id(202))):
        cards[f"{img}__{CH['a']}"] = {
            "channelId": CH["a"], "day": DAY,
            "streamEventId": doc_id(300), "streamEventImageId": img,
            "earnedAt": ms(DAY, 21, 3), "x": 0.7, "y": 0.9,
        }
    # **前の日のカード。** a の `cards` に数えてはいけない
    cards[f"{doc_id(210)}__{CH['a']}"] = {
        "channelId": CH["a"], "day": "2026-09-11",
        "streamEventId": doc_id(301), "streamEventImageId": doc_id(210),
        "earnedAt": ms("2026-09-11", 22, 0), "x": 0.7, "y": 0.9,
    }
    # 0時をまたいだ配信の後半に投げた人。台帳は前の日、カードはこの日。
    # **枚数と人数には入るが、表の行は増えない**
    cards[f"{doc_id(200)}__{CH['d']}"] = {
        "channelId": CH["d"], "day": DAY,
        "streamEventId": doc_id(300), "streamEventImageId": doc_id(200),
        "earnedAt": ms("2026-09-11", 23, 59), "x": 0.7, "y": 0.9,
    }
    # 次の日のカード。どこにも数えてはいけない
    cards[f"{doc_id(220)}__{CH['b']}"] = {
        "channelId": CH["b"], "day": "2026-09-13",
        "streamEventId": doc_id(302), "streamEventImageId": doc_id(220),
        "earnedAt": ms("2026-09-13", 21, 0), "x": 0.7, "y": 0.9,
    }

    return {"islandTips": tips, "streamChatMessages": msgs,
            "islandCharacter": chars, "islandCards": cards}


# 仕込みから導く期待値。**手で書いた数を置かない**（仕込みを足した日に、
# 期待値だけ古いまま残ると「間違ったことを確かめる確かめ」になる）
def expect(store: dict) -> dict:
    tips = store["islandTips"]
    msgs = store["streamChatMessages"]
    t0, t1 = card_why.jst_range(DAY)
    day_tips = [v for v in tips.values() if v["day"] == DAY]
    day_msgs = [v for v in msgs.values() if t0 <= v["at"] < t1]
    day_cards = [v for v in store["islandCards"].values() if v["day"] == DAY]
    tipped = {v["channelId"] for v in day_tips if v["channelId"]}
    carded = {v["channelId"] for v in day_cards if v["channelId"]}
    return {
        "tips_total": len(day_tips),
        "tips_blank": sum(1 for v in day_tips if not v["channelId"]),
        "chat_total": len(day_msgs),
        "chat_blank": sum(1 for v in day_msgs if not v["channelId"]),
        "people": len({v["channelId"] for v in day_tips + day_msgs
                       if v["channelId"]}),
        "cards": len(tipped),
        "cards_total": len(day_cards),
        "cards_people": len(carded),
        # 投げ銭したのに1枚も配られていない人
        "tips_no_card": len(tipped - carded),
        # 1人ぶんの枚数。**その日のぶんだけ**
        "cards_by": {c: sum(1 for v in day_cards if v["channelId"] == c)
                     for c in CH.values()},
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
    """Query のかわり。`where` は `==` と範囲だけ。"""

    OPS = {
        "==": lambda a, b: a == b,
        ">=": lambda a, b: a is not None and a >= b,
        "<": lambda a, b: a is not None and a < b,
    }

    def __init__(self, client, col, wh=None, fields=None):
        self.client, self.col = client, col
        self.wh = list(wh or [])
        self.fields = fields

    def where(self, field, op, value):
        if op not in self.OPS:
            raise AssertionError(f"偽の Firestore が知らない条件: {op}")
        return Query(self.client, self.col, self.wh + [(field, op, value)],
                     self.fields)

    def select(self, fields):
        return Query(self.client, self.col, self.wh, list(fields))

    def stream(self):
        self.client.reads += 1
        for key, data in self.client.store.get(self.col, {}).items():
            if all(self.OPS[op](data.get(f), v) for f, op, v in self.wh):
                yield Snap(key, data, self.fields)


class DocRef:
    """DocumentReference のかわり。**書く口は本物どおり生やしておく。**

    生やしておかないと、`_fs.readonly()` が塞いでいるのか、
    そもそも口が無いだけなのかが分からない。
    """

    def __init__(self, client, col, key):
        self.client, self.col, self.key = client, col, key

    def set(self, data):
        self.client.writes += 1

    def update(self, data):
        self.client.writes += 1

    def delete(self):
        self.client.writes += 1


class Col(Query):
    def document(self, key):
        return DocRef(self.client, self.col, key)


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


def run_as(public: bool, store: dict) -> str:
    """`card_why` を1回通して、その回の出力だけを文字で返す。"""
    was = os.environ.get("GITHUB_ACTIONS")
    if public:
        os.environ["GITHUB_ACTIONS"] = "true"
    else:
        os.environ.pop("GITHUB_ACTIONS", None)
    here = BUF.tell()
    try:
        card_why.run(readonly(Fake(store)), DAY)
    finally:
        if was is None:
            os.environ.pop("GITHUB_ACTIONS", None)
        else:
            os.environ["GITHUB_ACTIONS"] = was
    return BUF.getvalue()[here:]


def case_counts():
    print("\n[3] 数が合う（空欄・日の境目・カードの候補）")
    store = make_store()
    exp = expect(store)
    c = Fake(store)
    res = card_why.collect(readonly(c), DAY)

    ck("台帳の行数", res["tips_total"] == exp["tips_total"], res["tips_total"])
    ck("うち channelId が空", res["tips_blank"] == exp["tips_blank"],
       res["tips_blank"])
    ck("その日のチャット件数", res["chat_total"] == exp["chat_total"],
       res["chat_total"])
    ck("うち channelId が空", res["chat_blank"] == exp["chat_blank"],
       res["chat_blank"])
    ck("表に並んだ人数", len(res["per"]) == exp["people"], len(res["per"]))
    ck("カードの候補", res["cards"] == exp["cards"], res["cards"])

    a, b, cc = res["per"].get(CH["a"]), res["per"].get(CH["b"]), res["per"].get(CH["c"])
    ck("a … 台帳にもチャットにも居る", bool(a and a["tips"] == 1), a and a["tips"])
    ck("a … その日の端（23:59）まで数える",
       bool(a and a["chat_all"] == 18), a and a["chat_all"])
    ck("a … 有料は2件（スパチャ＋ステッカー）",
       bool(a and a["chat_paid"] == 2), a and a["chat_paid"])
    ck("a … キャラクターはチャンネルIDで当たる", bool(a and a["char"]),
       a and a["char"])
    ck("b … 台帳に居ないので card=NO",
       bool(b and b["tips"] == 0 and not b["card"]), b and b["card"])
    ck("b … メンバー加入も有料に数える",
       bool(b and b["chat_paid"] == 1), b and b["chat_paid"])
    ck("b … キャラクターが無い", bool(b and not b["char"]), b and b["char"])
    ck("c … チャットは1件も無いが card=yes",
       bool(cc and cc["chat_all"] == 0 and cc["card"]), cc and cc["card"])
    ck("c … 名前でキャラクターに当たる（channelId を持たない人）",
       bool(cc and cc["char"]), cc and cc["char"])
    ck("名前で当てるぶんが使えている", res["by_name"], res["by_name"])
    ck("前後の日の人は1行も出ない", CH["d"] not in res["per"],
       "出ていない" if CH["d"] not in res["per"] else "出ている")

    # --- 配られたカード（`islandCards`）--------------------------------
    # **欄が無いときも ✕ で報せる**（`res["cards_total"]` と書くと
    # 足す前のコードで KeyError になり、そこから先の確かめが1つも走らない）
    ck("その日の islandCards の枚数",
       res.get("cards_total") == exp["cards_total"], res.get("cards_total"))
    ck("カードが渡っている人数",
       res.get("cards_people") == exp["cards_people"], res.get("cards_people"))
    ck("a … その日のカードは3枚（前の日の1枚は数えない）",
       bool(a and a.get("cards") == exp["cards_by"][CH["a"]] == 3),
       a and a.get("cards"))
    ck("b … 次の日のカードは数えない",
       bool(b and b.get("cards") == exp["cards_by"][CH["b"]] == 0),
       b and b.get("cards"))
    ck("c … 投げ銭2件あるのにカードは0枚（＝本命の形）",
       bool(cc and cc["tips"] == 2 and cc.get("cards") == 0),
       cc and cc.get("cards"))
    ck("d … その日のカードは枚数に入るが、行は増えない",
       exp["cards_by"][CH["d"]] == 1 and CH["d"] not in res["per"],
       f"{exp['cards_by'][CH['d']]}枚 / 行なし")
    ck("投げ銭したのにカードが無い人数",
       res.get("tips_no_card") == exp["tips_no_card"] == 1,
       res.get("tips_no_card"))

    # 表とまとめに、実際にその字が出ること。数えられていても出なければ意味がない
    try:
        text = card_why.lines(res)
    except KeyError as e:  # 欄が足りないまま行を組もうとした
        text = []
        ck("表とまとめが組める", False, f"KeyError {e}")
    ck("行に cards= が並ぶ（人数ぶん）",
       sum(1 for x in text if "cards=" in x) == len(res["per"]),
       sum(1 for x in text if "cards=" in x))
    hit = [x for x in text if "カードが1枚も無い人" in x]
    ck("まとめに「投げ銭したのにカードが無い人」が目立つ形で出る",
       len(hit) == 1 and "★" in hit[0] and f"{exp['tips_no_card']}人" in hit[0],
       hit[0].strip() if hit else "出ていない")
    hit = [x for x in text if "islandCards" in x]
    ck("まとめに islandCards の枚数と人数が出る",
       len(hit) == 1 and f"{exp['cards_total']}枚" in hit[0]
       and f"{exp['cards_people']}人" in hit[0],
       hit[0].strip() if hit else "出ていない")


def case_readonly():
    print("\n[4] 1バイトも書かない")
    store = make_store()
    c = Fake(store)
    was = {k: {x: dict(y) for x, y in v.items()} for k, v in store.items()}
    card_why.collect(readonly(c), DAY)
    ck("書かれた回数", c.writes == 0, c.writes)
    ck("読んだ回数（0 なら何も見ていない）", c.reads > 0, c.reads)
    ck("中身が1文字も変わっていない",
       {k: {x: dict(y) for x, y in v.items()} for k, v in store.items()} == was,
       "変わっていない")
    # 塞いでいるのが `readonly` であることを、実際に叩いて見る
    guarded = readonly(c)
    for name, call in (
        ("document().set()",
         lambda: guarded.collection("islandTips").document("x").set({})),
        ("document().delete()",
         lambda: guarded.collection("islandTips").document("x").delete()),
        ("batch()", lambda: guarded.batch()),
    ):
        try:
            call()
            ck(f"{name} が止まる", False, "通ってしまった")
        except ReadOnly:
            ck(f"{name} が止まる", True, "ReadOnly で止まった")
    ck("叩いたあとも書かれた回数は 0", c.writes == 0, c.writes)


def case_bad_input():
    print("\n[5] 日付が無い／形が違う入力は、はっきり落ちる")
    for label, raw in (
        ("入力そのものが無い", ""),
        ("day が無い", '{"days": 7}'),
        ("day が空", '{"day": ""}'),
        ("形が違う", '{"day": "2026/09/12"}'),
        ("その形だが日付ではない", '{"day": "2026-13-45"}'),
        ("ARGS が JSON でない", "day=2026-09-12"),
    ):
        os.environ["ARGS"] = raw
        try:
            code = card_why.main()
        except SystemExit as e:
            code = e.code
        ck(f"{label} → 0 以外で落ちる", code not in (0, None), code)
    os.environ.pop("ARGS", None)


def case_public():
    """**出力を grep する。** ここだけは袋を読むので、最後に回す。"""
    print("\n[1] 公開の場（GITHUB_ACTIONS=true）で、素性が1文字も出ない")
    store = make_store()
    text = run_as(True, store)

    shapes = {
        "チャンネルID（UC + 22文字）": r"UC[A-Za-z0-9_-]{22}",
        "ハンドル（@…）": r"@[A-Za-z0-9ぁ-んァ-ヶ一-龠_-]+",
        "チャットの本文": re.escape(TEXT),
        "書類ID（20文字の英数字）": r"\b[A-Za-z0-9]{20}\b",
    }
    # **先に、探し方が効くことを確かめる。** 正規表現が間違っていれば、
    # 何が出ていても「0件」と言える。0件を信じる前に、当たることを見る
    bait = f"INFO {CH['a']} / {NAME['a']} / {TEXT} / {doc_id(1)}"
    for label, pat in shapes.items():
        ck(f"{label} — 探し方が当たる（仕込んだ字で）",
           len(re.findall(pat, bait)) > 0, "当たる")
    for label, pat in shapes.items():
        n = len(re.findall(pat, text))
        ck(f"{label} の出現回数", n == 0, n)
    # 仕込んだ値そのものも、名指しで探す
    leaked = [k for k, v in list(CH.items()) + list(NAME.items()) if v in text]
    ck("仕込んだ値がそのまま出ていない", not leaked, f"{len(leaked)} 件")
    # **表が出ていることも見る**（空を 0件と言っているのではない）
    ck("指紋の行が出ている（表は空ではない）",
       len(re.findall(r"^#[0-9a-f]{4}\s", text, re.M)) == 3,
       len(re.findall(r"^#[0-9a-f]{4}\s", text, re.M)))
    print(f"    （grep した出力は {len(text)} 文字）")

    print("\n[2] 対照。GITHUB_ACTIONS を外すと、チャンネルIDが素で出る")
    plain = run_as(False, store)
    for who in ("a", "b", "c"):
        ck(f"{who} のチャンネルIDが素で出る", CH[who] in plain,
           "出る" if CH[who] in plain else "出ない")
    ck("前後の日の人は、素でも出ない", CH["d"] not in plain,
       "出ていない" if CH["d"] not in plain else "出ている")
    ck("素でも、チャットの本文は出ない", TEXT not in plain,
       "出ていない" if TEXT not in plain else "出ている")


def main() -> int:
    print("=== 偽の Firestore で card_why を動かす（本番には1バイトも出ない） ===")
    case_counts()
    case_readonly()
    case_bad_input()
    case_public()
    sys.stdout, sys.stderr = REAL_OUT, REAL_ERR
    print()
    if FAILED:
        print(f"✕ 通らなかった確かめ {len(FAILED)} 件: {', '.join(FAILED)}")
        return 1
    print("○ ぜんぶ通りました")
    return 0


if __name__ == "__main__":
    sys.exit(main())
