"""偽の Firestore と偽の口で、`tip_alias` を**実際に動かして確かめる。**

    python3 python/admin/tip_alias_selftest.py

**本番には1バイトも出ない。** Firestore も資格情報も口も要らない。

## なぜ、これを書いたか

この道具が間違えたときに壊れるのは、**公開の面に出る誰かの絵**。
1人に決まらないものを当てずっぽうで決めれば、別人の絵が
その人のカードに乗る。そして**それは赤くならない。** 出てから
「この人、私じゃない」と言われて初めて分かる。

だから、**決めない側**を先に固定する。

  - `channelId` が2人に当たる → 飛ばす
  - `channelId` がどこにも当たらない → 飛ばす

「足せた」ほうだけを見て通すと、**何にでも当てる道具**が通ってしまう。

## 確かめるもの

  1. 名乗りがタイポで、`channelId` が (a)（`islandCharacter.channelId`）で
     決まる → 1件足す
  2. 名乗りがタイポで、`channelId` が (b)（辞書の名前 → `lookupKeys`）で
     決まる → 1件足す
  3. **`channelId` が2人に当たる → 飛ばす（0件）**
  4. **`channelId` がどこにも当たらない → 飛ばす（0件）**
  5. 名乗りが既に当たっている → 何もしない
  6. **`apply` 無しでは書き込みが1回も呼ばれない**（Firestore にも口にも）
  7. `aliases` が上限のとき足さない
  7b. **同じ名乗りが、別々の2人ぶんに出た → どちらにも足さない**
      （足すと同じ鍵を2人が持つので、`cards.ts` の `characterBook` が
      どちらも使わなくなる。**足したせいで引けなくなる**）
  8. 口へ送る中身が、**いま入っている `channelName` と `emoji` を
     そのまま乗せている**（送らなかった欄が消える書き方をしていない）。
     **`lookupKeys` を Python 側で作って送っていない。**
     絵（`plain` / `scene`）も送っていない
  9. 出力に**名前も呼び名もチャンネルIDも1文字も出ない**

## 8 が本命の半分

足せたかどうかは 1〜2 で見えるが、**足したせいで別の欄が消える**のは
ここでしか見えない。口は `channelName` / `emoji` / `aliases` を
送られたぶんで置き換える（`islandCharacter.ts` の POST）ので、
呼び名を1つ足すつもりで絵文字を消せてしまう。
"""

import io
import json
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
os.environ.setdefault("BQ_PROJECT_ID", "tip-alias-selftest")

import tip_alias as ta  # noqa: E402
from _fs import readonly  # noqa: E402

DAY = "2026-09-16"
OTHER_DAY = "2026-09-15"

# ---------------------------------------------------------------- 偽の中身

# チャンネルIDに似せた字。**わざと本物の形（`UC` + 22文字）から1文字
# ずらしてある。** このファイルは公開のリポジトリに残るので、偽物でも
# `tools/logident.py` が「チャンネルIDが出ている」と数える形にはしない
# ——数えたものが0でなくなると、**本物が混ざった日に気づけなくなる。**
# この道具はチャンネルIDの形を1度も見ない（長さで切るだけ）ので、
# ずらしても確かめるものは変わらない
CH = {
    "a": "UCaaa1b2c3d4e5f6g7h8i9j",    # (a) channelId で1人に決まる
    "b": "UCbbb1b2c3d4e5f6g7h8i9j",    # (b) 辞書の名前で1人に決まる
    "dup": "UCdup1b2c3d4e5f6g7h8i9j",  # 2人が同じ channelId を持っている
    "none": "UCnone1b2c3d4e5f6g7h8ij",  # 辞書に名前はあるが、誰にも当たらない
    "gone": "UCgone1b2c3d4e5f6g7h8ij",  # 辞書にすら載っていない
    "full": "UCfull1b2c3d4e5f6g7h8ij",  # 呼び名がいっぱいの人
    # **同じ名乗りが、別々の2人ぶんに出る**（どちらにも足さない）
    "cla1": "UCcla11b2c3d4e5f6g7h8ij",
    "cla2": "UCcla21b2c3d4e5f6g7h8ij",
}

# 表示名と名乗り。**ここが1文字でも出力に出たら落とす**
NAME = {
    "a": "ほしのこ",
    "a_typo": "ほしのご",              # 濁点がずれた名乗り
    "b": "みずうみのほとり",
    "b_typo": "みずうみのほどり",
    "dup": "ふたりのなまえ",
    "dup_typo": "ふたりのなまへ",
    "none": "だれでもないひと",
    "none_typo": "だれでもないひど",
    "gone_typo": "のっていないひど",
    "full": "いっぱいさん",
    "full_typo": "いっぱいざん",
    "other": "きのうのひと",           # 前の日の行。**引いてはいけない**
    "cla1": "かぶりのひとつめ",
    "cla2": "かぶりのふたつめ",
    # 2人が、同じ名乗りで投げてきた
    "clash": "おなじなまえ",
}
# 上限に達している人の呼び名。**中身は見ない。数だけが効く**
FULL_ALIASES = [f"よびな{i:02d}" for i in range(ta.MAX_ALIASES)]

# キャラクターの書類ID（本番と同じ32桁＋1の形）
DOC = {k: f"{i}" + "0123456789abcdef" * 2 for i, k in enumerate(
    ["a", "b", "dup1", "dup2", "none_owner", "full", "cla1", "cla2"])}

EMOJI = {"a": "🍑", "b": "🌊", "dup1": "🐟", "dup2": "🐡",
         "none_owner": "🌰", "full": "🍩", "cla1": "🌱", "cla2": "🌿"}


def char(name, cid, aliases=None, emoji="") -> dict:
    """図鑑の1人ぶん。**鍵は `keys_of` で作る**（口と同じ作り方）。"""
    aliases = aliases or []
    return {
        "channelName": name,
        "emoji": emoji,
        "aliases": list(aliases),
        "channelId": cid,
        "lookupKeys": ta.keys_of([name] + list(aliases)),
        "channelKeys": ta.keys_of([name]),
        # 絵。**送っていないことを見るために、入れておく**
        "images": {"plain": {"full": "plain.webp"}},
    }


def make_store() -> dict:
    """本番に似せた中身。**外し方を1つずつ仕込んである。**

    - a    … `channelId` を持っている。台帳の名乗りはタイポ → (a) で決まる
    - b    … `channelId` を持っていない。辞書に名前がある → (b) で決まる
    - dup1 / dup2 … **同じ `channelId` を2人が持っている** → 決めない
    - none_owner … 辞書の名前とは別の名前で入っている → 誰にも当たらない
    - full … 呼び名が上限まで入っている → 足さない
    """
    chars = {
        DOC["a"]: char(NAME["a"], CH["a"], emoji=EMOJI["a"]),
        DOC["b"]: char(NAME["b"], None, emoji=EMOJI["b"]),
        DOC["dup1"]: char(NAME["dup"], CH["dup"], emoji=EMOJI["dup1"]),
        # **2人目は別の名前**（名前で当たってしまうと、何を見て飛ばしたか
        # が分からなくなる）。効かせたいのは channelId が同じことだけ
        DOC["dup2"]: char("もうひとり", CH["dup"], emoji=EMOJI["dup2"]),
        DOC["none_owner"]: char("まったく別の名前", None,
                                emoji=EMOJI["none_owner"]),
        DOC["full"]: char(NAME["full"], CH["full"], FULL_ALIASES,
                          emoji=EMOJI["full"]),
        DOC["cla1"]: char(NAME["cla1"], CH["cla1"], emoji=EMOJI["cla1"]),
        DOC["cla2"]: char(NAME["cla2"], CH["cla2"], emoji=EMOJI["cla2"]),
    }
    channels = {
        CH["a"]: {"name": NAME["a"]},
        CH["b"]: {"name": NAME["b"]},
        CH["dup"]: {"name": NAME["dup"]},
        # **誰の鍵にも当たらない名前**。(b) が 0人で止まることを見る
        CH["none"]: {"name": NAME["none"]},
        CH["full"]: {"name": NAME["full"]},
    }
    tips = {
        "t1": {"day": DAY, "displayNameSnapshot": NAME["a_typo"],
               "channelId": CH["a"]},
        # 同じ人が、同じ名乗りでもう1回。**1件に畳まれる**
        "t2": {"day": DAY, "displayNameSnapshot": NAME["a_typo"],
               "channelId": CH["a"]},
        "t3": {"day": DAY, "displayNameSnapshot": NAME["b_typo"],
               "channelId": CH["b"]},
        # 2人に当たる channelId
        "t4": {"day": DAY, "displayNameSnapshot": NAME["dup_typo"],
               "channelId": CH["dup"]},
        # 辞書には載っているが、誰の鍵にも当たらない
        "t5": {"day": DAY, "displayNameSnapshot": NAME["none_typo"],
               "channelId": CH["none"]},
        # 辞書にすら載っていない
        "t6": {"day": DAY, "displayNameSnapshot": NAME["gone_typo"],
               "channelId": CH["gone"]},
        # **名乗りが既に当たっている**（タイポではない）
        "t7": {"day": DAY, "displayNameSnapshot": NAME["a"],
               "channelId": CH["a"]},
        # 呼び名がいっぱいの人
        "t8": {"day": DAY, "displayNameSnapshot": NAME["full_typo"],
               "channelId": CH["full"]},
        # 紐付いていない（`islandDonors` に無い どねID）
        "t9": {"day": DAY, "displayNameSnapshot": "ひもづいてないひと",
               "channelId": None},
        # 名乗りが空
        "t10": {"day": DAY, "displayNameSnapshot": "", "channelId": CH["a"]},
        # **前の日の行。引いてはいけない**
        "t11": {"day": OTHER_DAY, "displayNameSnapshot": NAME["other"],
                "channelId": CH["b"]},
        # **同じ名乗りが、別々の2人ぶんに出る。** どちらも channelId では
        # 1人に決まるが、足すと鍵が2人のものになるので、どちらにも足さない
        "t12": {"day": DAY, "displayNameSnapshot": NAME["clash"],
                "channelId": CH["cla1"]},
        "t13": {"day": DAY, "displayNameSnapshot": NAME["clash"],
                "channelId": CH["cla2"]},
    }
    return {"islandCharacter": chars, "islandChannels": channels,
            "islandTips": tips}


# 仕込みから導く期待値。**手で書いた数を置かない**
EXPECT = {
    "rows": 12,          # その日のぶんだけ（t11 は入らない）
    "already": 1,        # t7
    "no_name": 1,        # t10
    "no_channel": 1,     # t9
    "undecided": 3,      # t4（2人）・t5（0人）・t6（辞書に無い）
    "by_a": 5,           # t1 t2（畳まれる前の件数）・t8・t12・t13
    "by_b": 1,           # t3
    "clash": 2,          # t12 と t13（**どちらにも足さない**）
    "full": 1,           # t8
    "people": 2,         # a と b
    "added": 2,
}

# ------------------------------------------------------- 偽の Firestore


class Snap:
    """DocumentSnapshot のかわり。`select` で絞ったぶんだけ返す。"""

    def __init__(self, key, data, fields, exists=True):
        self.id = key
        self.exists = exists
        # **projection を本物どおりに再現する。** 欄が無ければ鍵ごと返らない
        self._data = {k: v for k, v in (data or {}).items()
                      if fields is None or k in fields}

    def to_dict(self):
        return dict(self._data)


class Query:
    """Query のかわり。この道具が使うのは `where` / `select` / `limit`。"""

    OPS = {"==": lambda a, b: a == b}

    def __init__(self, client, col, wh=None, fields=None, cap=None):
        self.client, self.col = client, col
        self.wh = list(wh or [])
        self.fields, self.cap = fields, cap

    def where(self, field, op, value):
        if op not in self.OPS:
            raise AssertionError(f"偽の Firestore が知らない条件: {op}")
        return Query(self.client, self.col, self.wh + [(field, op, value)],
                     self.fields, self.cap)

    def select(self, fields):
        # **本物と同じように、字を渡されたら1文字ずつの欄として扱う。**
        # ここを親切にすると、`select("name")` の踏み抜きが手元で通ってしまう
        return Query(self.client, self.col, self.wh, list(fields), self.cap)

    def limit(self, n):
        return Query(self.client, self.col, self.wh, self.fields, n)

    def _rows(self):
        self.client.reads += 1
        out = []
        for key, data in self.client.store.get(self.col, {}).items():
            if all(self.OPS[op](data.get(f), v) for f, op, v in self.wh):
                out.append(Snap(key, data, self.fields))
        return out[:self.cap] if self.cap is not None else out

    def get(self):
        return self._rows()

    def stream(self):
        return iter(self._rows())


class DocRef:
    """DocumentReference のかわり。**書く口は本物どおり生やしておく。**

    生やしておかないと、`_fs.readonly()` が塞いでいるのか、
    そもそも口が無いだけなのかが分からない。
    """

    def __init__(self, client, col, key):
        self.client, self.col, self.key = client, col, key

    def get(self):
        self.client.reads += 1
        data = self.client.store.get(self.col, {}).get(self.key)
        return Snap(self.key, data, None, exists=data is not None)

    def set(self, data, **kw):
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


class FakeApi:
    """偽の口。**叩かれたものをそのまま覚えておく。**

    本物（`_owner.call`）は HTTP を投げるので、ここを差し替えないと
    確かめが本番の Functions を叩く。叩いた道と中身を覚えて、
    **何を送ったか**まで見られるようにしておく。
    """

    def __init__(self, store):
        self.store = store
        self.calls: list = []

    def __call__(self, method, path, token, body=None):
        self.calls.append((method, path, body))
        if method == "GET" and path == "/characters":
            chars = []
            for key, v in self.store["islandCharacter"].items():
                chars.append({
                    "id": key,
                    "channelName": v.get("channelName") or "",
                    "emoji": v.get("emoji") or "",
                    "aliases": list(v.get("aliases") or []),
                })
            return {"characters": chars, "total": len(chars)}
        if method == "POST" and path.startswith("/characters/"):
            return {"character": {"id": path.rsplit("/", 1)[-1]}}
        raise AssertionError(f"偽の口が知らない道: {method} {path}")

    def posts(self):
        return [(p.rsplit("/", 1)[-1], b)
                for m, p, b in self.calls if m == "POST"]


# ---------------------------------------------------------------- 確かめる

FAILED: list = []


def ck(name: str, cond: bool, got) -> None:
    mark = "○" if cond else "✕"
    print(f"    {mark} {name}: {got}")
    if not cond:
        FAILED.append(name)


def run(store: dict, apply: bool = False):
    """`tip_alias.main()` を1回通す。

    Args:
        store: 偽の中身
        apply: `{"apply": true}` を付けるか

    Returns:
        (その回の出力, 終了コード, 書かれた回数, 偽の口)
    """
    client = Fake(store)
    api = FakeApi(store)
    was = (ta.db, ta.readonly, ta.call, ta.owner_token)
    ta.db = lambda: client
    ta.readonly = readonly
    ta.call = api
    ta.owner_token = lambda c: "（偽の札）"
    a = {"day": DAY}
    if apply:
        a["apply"] = True
    os.environ["ARGS"] = json.dumps(a, ensure_ascii=False)
    here = BUF.tell()
    code = 0
    try:
        ta.main()
    except SystemExit as e:
        code = e.code or 0
    finally:
        ta.db, ta.readonly, ta.call, ta.owner_token = was
    return BUF.getvalue()[here:], code, client.writes, api


def num(out: str, needle: str) -> str:
    """その行の末尾の数字。**行そのものを正として読む**"""
    line = next((x for x in out.splitlines() if needle in x), "")
    return "".join(c for c in line.rsplit("…", 1)[-1] if c.isdigit())


def main() -> None:
    os.environ["GITHUB_ACTIONS"] = "true"   # 公開の場として回す

    print("[1] 下見 —— 仕分けの件数が仕込みどおり")
    out, code, writes, api = run(make_store())
    ck("終了コード 0", code == 0, code)
    for label, want, needle in (
        ("その日の台帳の件数", EXPECT["rows"], "の台帳:"),
        ("名乗りが既に当たっている", EXPECT["already"], "当たっている"),
        ("名乗りが空", EXPECT["no_name"], "名乗りが空"),
        ("channelId が無い", EXPECT["no_channel"], "が入っていない"),
        ("1人に決まらない", EXPECT["undecided"], "決まらない"),
        ("同じ名乗りが2人ぶん", EXPECT["clash"], "2人ぶんに出た"),
        ("呼び名がいっぱい", EXPECT["full"], "いっぱいで足せない"),
    ):
        if needle == "の台帳:":
            line = next((x for x in out.splitlines() if needle in x), "")
            got = "".join(c for c in line.rsplit(":", 1)[-1] if c.isdigit())
        else:
            got = num(out, needle)
        ck(label, got == str(want), f"{got}（仕込み {want}）")
    ck("足す先は2人", "足す先: 2人 / 足す名乗り: 2件" in out,
       "足す先: 2人 / 足す名乗り: 2件" in out)

    print("\n[2] **下見では、1回も書いていない**")
    ck("Firestore に書かれた回数 0", writes == 0, writes)
    ck("口を1回も叩いていない", not api.calls, len(api.calls))
    ck("下見だと言っている", "1バイトも書いていません" in out, True)

    print("\n[3] apply —— (a) と (b) で1人ずつ、1件ずつ足す")
    store = make_store()
    out2, code2, writes2, api2 = run(store, apply=True)
    posts = api2.posts()
    ck("終了コード 0", code2 == 0, code2)
    ck("Firestore には直に書いていない（口だけ）", writes2 == 0, writes2)
    ck("POST は2本", len(posts) == 2, len(posts))
    ck("書いた人数と件数",
       f"書きました: {EXPECT['people']}人 / {EXPECT['added']}件" in out2,
       f"{EXPECT['people']}人 / {EXPECT['added']}件")
    sent = {doc: body for doc, body in posts}
    ck("(a) で決まった人に足した", DOC["a"] in sent, DOC["a"] in sent)
    ck("(b) で決まった人に足した", DOC["b"] in sent, DOC["b"] in sent)

    print("\n[4] **決まらないものには、1本も投げていない**")
    for label, key in (("2人に当たる channelId", "dup1"),
                       ("2人に当たる channelId（もう片方）", "dup2"),
                       ("どこにも当たらない channelId", "none_owner")):
        ck(label + " に投げていない", DOC[key] not in sent, DOC[key] in sent)

    print("\n[5] **同じ名乗りが2人ぶんに出たら、どちらにも足さない**")
    for key in ("cla1", "cla2"):
        ck(f"{EMOJI[key]} に投げていない", DOC[key] not in sent,
           DOC[key] in sent)

    print("\n[6] 呼び名が上限の人には足さない")
    ck("いっぱいの人に投げていない", DOC["full"] not in sent,
       DOC["full"] in sent)
    # **apply のときも、飛ばした件数を出している。** 黙って足さないと、
    # 「足りない」に気づけるのが本人だけになる
    ck("足せなかった件数を出している",
       num(out2, "いっぱいで足せない") == str(EXPECT["full"]),
       num(out2, "いっぱいで足せない"))

    print("\n[7] **送った中身**（欄が消える書き方をしていない）")
    a_body = sent.get(DOC["a"]) or {}
    was = store["islandCharacter"][DOC["a"]]
    ck("channelName を乗せ直している",
       a_body.get("channelName") == was["channelName"],
       "乗せている" if a_body.get("channelName") else "空で送った")
    ck("emoji を乗せ直している", a_body.get("emoji") == EMOJI["a"],
       a_body.get("emoji") or "空で送った")
    ck("足すのは1件だけ（元の呼び名は残す）",
       a_body.get("aliases") == was["aliases"] + [NAME["a_typo"]],
       len(a_body.get("aliases") or []))
    ck("**lookupKeys を Python で作って送っていない**",
       "lookupKeys" not in a_body and "channelKeys" not in a_body,
       sorted(a_body.keys()))
    ck("絵（plain / scene）を送っていない",
       "plain" not in a_body and "scene" not in a_body, sorted(a_body.keys()))
    b_body = sent.get(DOC["b"]) or {}
    ck("(b) の人も同じ形で送っている",
       set(b_body.keys()) == {"channelName", "emoji", "aliases"},
       sorted(b_body.keys()))

    print("\n[8] 名前もチャンネルIDも1文字も出ていない")
    both = out + out2
    leaked = [k for k, v in NAME.items() if v and v in both]
    ck("出力に名乗りが無い", not leaked, leaked or "無し")
    ck("呼び名も出ていない",
       not any(x in both for x in FULL_ALIASES), "無し")
    ck("チャンネルIDも出ていない",
       not any(v in both for v in CH.values()), "無し")
    ck("書類IDも生では出ていない",
       not any(v in both for v in DOC.values()), "無し")

    print("\n[9] 図鑑が1件も返らないとき（読めていないのに 0 と言わない）")
    empty = make_store()
    empty["islandCharacter"] = {}
    out3, code3, writes3, api3 = run(empty)
    ck("終了コード 2 で止まる", code3 == 2, code3)
    ck("**件数を1つも出していない**", "の台帳:" not in out3,
       "出していない" if "の台帳:" not in out3 else "出してしまった")
    ck("何も書いていない", writes3 == 0 and not api3.calls, writes3)

    print()
    if FAILED:
        print(f"✕ {len(FAILED)} 件落ちた: {', '.join(FAILED)}")
        raise SystemExit(1)
    print("○ ぜんぶ通った")


if __name__ == "__main__":
    main()
