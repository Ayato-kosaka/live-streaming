"""偽の Firestore と**口のそっくりさん**で、`characters_touch` を動かして確かめる。

    python3 python/admin/characters_touch_selftest.py

**本番には1バイトも出ない。ネットにも出ない。** Firestore も資格情報も要らない。

## なぜ、これを書いたか

口（`POST /island-api/characters/{id}`）は、**送られた中身で欄を置き換える。**

    const patch = { channelName, emoji, aliases,
                    channelKeys: …, lookupKeys: … }

**`emoji` を送り忘れれば絵文字が消え、`aliases` を送り忘れれば呼び名が
全部消える。** 島から絵文字と呼び名が消えても、**赤くならない。**
run は緑で終わって、次に配信で誰かが投げ銭したときに初めて分かる。

だから、ここで見るのは「通ったかどうか」ではなく**欄が消えないこと**で、
しかも**口のそっくりさんに実際に消させて**、それをこちらが捕まえるところまで見る。
「送っているつもり」を読むのではなく、**送らなかったらどうなるかを実測する。**

## 口のそっくりさん

`FakeApi` は `functions/src/islandCharacter.ts` の POST と同じ順で書く。

  - `channelName` / `emoji` / `aliases` を**送られたぶんで置き換える**
  - `channelKeys` / `lookupKeys` を**こちら（＝サーバー）が焼き直す**
  - 書く前に YouTube を引いて、表示名を `aliases` に、`channelId` を
    **空のときだけ**入れる（#155）
  - 絵は**送られてこなかった役どころに触らない**
  - `editedAt` / `editedBy` / `updatedAt` / `channelTitleFor` を毎回書く
  - 返事に `named`（`state` / `name` / `why`）を乗せる。**引けなかった
    ときの理由がここにしか無い**ので、そこまで真似る

**引き先だけが偽物。** 置き換えの順も、鍵の焼き直しも、`merge` も本物に合わせる。
ここを親切に作ると（送られなかった欄を残すなど）、**本物では消えるものが
手元では消えず、いちばん危ない足が緑で通る。**

## 対照の対照

`characters_touch.run_control()` は本番でも毎回回る。**それが本当に
落ちられるのか**を、ここで足を1本ずつ抜いて（`BREAK=`）見る。
「壊し方を4通り当てた」は、4通りが同じ足を折っているなら1通り
（`docs/island-standards.md` §15）。

**その前に「壊していない写しが通ること」を先に見る**（`island-misses.md` #99）。
"""

import io
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# 出力を丸ごと溜める袋。**`_fs` の basicConfig を読み込む前に**二股にする
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

os.environ.setdefault("BQ_PROJECT_ID", "characters-touch-selftest")

import characters_touch as ct  # noqa: E402
from _fs import readonly  # noqa: E402
from alertbox_names import keys_of, norm_key  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------- 偽の中身
#
# **本物の名前もハンドルもチャンネルIDも1つも使わない。** 形だけ似せてある。

UC1 = "UC" + "aaaaaaaaaaaaaaaaaaaaaa"
UC2 = "UC" + "bbbbbbbbbbbbbbbbbbbbbb"
UC3 = "UC" + "cccccccccccccccccccccc"
UC4 = "UC" + "dddddddddddddddddddddd"

# **404 を返す引き先**（#159）。その名乗りがもう無い＝人が直す話で、
# 「届かない」（出口の話。こちらが直す）とは別のもの。
# 口が印（`channelGoneFor`）を付けるのは、**こちらのときだけ**
GONE_YT = frozenset({"@kieta00000001"})

# ハンドル（または `UC…`）-> YouTube が返す表示名。**引けない人は入れない**
YT = {
    "@tsuresasare1234": ("つれ ささ れ", UC1),
    "@umibeno1234": ("うみべの ひと", UC2),
    UC3: ("ゆーしー の ひと", UC3),
}

# 書類ID -> 図鑑の1行。**通す先は `channelId` が空でハンドルの人だけ**
PEOPLE = {
    # 通す先。呼び名も絵も順番も持っている（**どれも消えてはいけない**）
    "todo1": {
        "channelName": "@tsuresasare1234", "emoji": "🐚",
        "aliases": ["つれ"], "channelId": "",
        "images": {"plain": {"full": "p1.webp", "w": 512},
                   "scene": {"full": "s1.webp", "w": 640}},
        "order": 7, "createdAt": "2026-08-01T00:00:00.000Z",
        "videoUrl": "https://example.invalid/v.mp4",
    },
    # 通す先。呼び名は1つも持っていない
    "todo2": {
        "channelName": "@umibeno1234", "emoji": "🌊",
        "aliases": [], "channelId": "",
        "images": {"plain": {"full": "p2.webp"}},
    },
    # 通す先。名乗りが `UC…`。**そのまま channelId になる**
    "ucname": {
        "channelName": UC3, "emoji": "🌫", "aliases": [], "channelId": "",
        "images": {},
    },
    # 通す先だが、**引けない。** 通しても channelId は入らない
    "blind": {
        "channelName": "@todokazu9999", "emoji": "🕳",
        "aliases": ["とどかず"], "channelId": "", "images": {},
    },
    # すでに channelId を持っている。**毎晩の繋ぎが見ている側**
    "hasid": {
        "channelName": "@mochimochi0001", "emoji": "🫙",
        "aliases": [], "channelId": UC4, "images": {},
    },
    # ふつうの表示名。**口は引きに行かない**ので通す意味が無い
    "plain": {
        "channelName": "なまえ のひと", "emoji": "🪞",
        "aliases": [], "channelId": "", "images": {},
    },
    # channelName が空（呼び名だけ持っている人）
    "noname": {
        "channelName": "", "emoji": "🧺", "aliases": [], "channelId": "",
        "images": {},
    },
}

DOC = {k: f"{i:x}" + "0123456789abcdef" * 2 for i, k in enumerate(PEOPLE)}
# **書類IDの形が違う人。** 口が `bad id` で断るので、叩く前に外す
DOC["baddoc"] = "x"
PEOPLE["baddoc"] = {
    "channelName": "@katachichigai1", "emoji": "🐡",
    "aliases": [], "channelId": "", "images": {},
}

EMOJI = {k: v["emoji"] for k, v in PEOPLE.items()}

# 通せるはずの人。**手で数を書かず、ここから数える**
CAN_TOUCH = ["todo1", "todo2", "ucname", "blind"]
NO_TOUCH = [k for k in PEOPLE if k not in CAN_TOUCH]
# 通して channelId が入るのは、引けた3人だけ
GETS_ID = ["todo1", "todo2", "ucname"]


def make_store(drop=()) -> dict:
    chars = {}
    for key, v in PEOPLE.items():
        if key in drop:
            continue
        row = {k: (dict(x) if isinstance(x, dict) else
                   list(x) if isinstance(x, list) else x)
               for k, x in v.items()}
        name = row["channelName"]
        row["channelKeys"] = keys_of([name] if name else [])
        row["lookupKeys"] = keys_of([name] + row["aliases"])
        chars[DOC[key]] = row
    return {"islandCharacter": chars}


# ------------------------------------------------------- 偽の Firestore


class Snap:
    def __init__(self, key, data, exists=True):
        self.id = key
        self.exists = exists
        self._data = dict(data or {})

    def to_dict(self):
        return dict(self._data)


class Query:
    """Query のかわり。この道具が使うのは `limit` だけ。"""

    def __init__(self, client, col, cap=None):
        self.client, self.col, self.cap = client, col, cap

    def select(self, fields):
        raise AssertionError("**欄を絞ってはいけない**（全欄を突き合わせる）")

    def limit(self, n):
        return Query(self.client, self.col, n)

    def _rows(self):
        self.client.reads += 1
        out = [Snap(k, v)
               for k, v in self.client.store.get(self.col, {}).items()]
        return out[:self.cap] if self.cap is not None else out

    def get(self):
        return self._rows()

    def stream(self):
        return iter(self._rows())


class DocRef:
    """**書く口は本物どおり生やしておく。**

    生やしておかないと、`_fs.readonly()` が塞いでいるのか、
    そもそも口が無いだけなのかが分からない。
    """

    def __init__(self, client, col, key):
        self.client, self.col, self.key = client, col, key

    def get(self):
        self.client.reads += 1
        data = self.client.store.get(self.col, {}).get(self.key)
        return Snap(self.key, data, exists=data is not None)

    def set(self, data, **kw):
        self.client.writes += 1

    def update(self, data):
        self.client.writes += 1

    def delete(self):
        self.client.writes += 1


class Col(Query):
    def document(self, key):
        return DocRef(self.client, self.col, key)

    def where(self, *a, **k):
        raise AssertionError("この道具は where を使いません")


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


# ------------------------------------------------------------ 口のそっくりさん

MAX_ALIASES = 20
NOW = "2026-09-18T20:00:00.000Z"


def _lookup(channel_name: str) -> tuple:
    """`islandCharacter.ts` の `lookupChannel`。**引き先だけが偽物。**

    Returns:
        (state, 表示名, channelId, why, **gone**)。`gone` は
        「その名乗りがもう無い（404）」（#159）。**届かないのとは別**
    """
    v = channel_name.strip()
    handle = v.startswith("@") and len(v) > 1
    cid = v.startswith("UC") and len(v) == 24
    if not handle and not cid:
        # ふつうの表示名。**引きに行かない**
        return ("skipped", "", "", "", False)
    if v in GONE_YT:
        # **その名乗りがもう無い。** 機械では直せない（#159）
        return ("failed", "", v if cid else "", "見つからない（404）", True)
    hit = YT.get(v)
    if not hit:
        # 届かなかった。**channelId だけは、打たれた字が `UC…` なら分かる**
        # ——本番でこれが出た（run 35386977128）ので、理由まで真似る
        # **ここで印を付けてはいけない**（出口の話）
        return ("failed", "", v if cid else "", "届かなかった", False)
    return ("added", hit[0], hit[1], "", False)


def _with_title(channel_name: str, aliases: list, state: str,
                name: str) -> tuple:
    """`islandCharacter.ts` の `withChannelTitle`。"""
    if state != "added" or not name:
        return (aliases, state)
    if norm_key(name) in keys_of([channel_name] + aliases):
        return (aliases, "already")
    if len(aliases) >= MAX_ALIASES:
        return (aliases, "failed")
    return (aliases + [name], "added")


class FakeApi:
    """偽の口。**叩かれたものをそのまま覚えて、本物と同じ書き方をする。**"""

    def __init__(self, store, shows_gone: bool = True):
        self.store = store
        self.calls: list = []
        self.named: dict = {}
        #: **配った口が古い日**を真似る。False だと `channelGone` を
        #: 1人ぶんも返さない（欄そのものが無い）
        self.shows_gone = shows_gone

    def __call__(self, method, path, token, body=None):
        self.calls.append((method, path, body))
        if method == "GET" and path == "/characters":
            chars = []
            for key, v in self.store["islandCharacter"].items():
                # `shapeFull`。**オーナーには名乗りと呼び名まで返る**
                row = {
                    "id": key,
                    "channelName": v.get("channelName") or "",
                    "emoji": v.get("emoji") or "",
                    "aliases": list(v.get("aliases") or []),
                    "channelId": v.get("channelId") or None,
                }
                if self.shows_gone:
                    # **`shapeFull` と同じ条件。**（#159）
                    # `channelGoneFor` が**いまの名乗りと同じ字のときだけ**
                    # 立てる。書き換えられた人に古い札を出さないため
                    gf = v.get("channelGoneFor")
                    row["channelGone"] = (isinstance(gf, str) and bool(gf)
                                          and gf == v.get("channelName"))
                chars.append(row)
            return {"characters": chars, "total": len(chars)}
        if method == "POST" and path.startswith("/characters/"):
            doc = self._post(path, body or {})
            # 本物は `{character, named}` を返す。**理由はここに乗ってくる**
            return {"character": {"id": doc}, "named": self.named}
        raise AssertionError(f"偽の口が知らない道: {method} {path}")

    def _post(self, path, body):
        doc = path.rsplit("/", 1)[-1]
        v = self.store["islandCharacter"].setdefault(doc, {})
        had = dict(v)
        channel_name = ct.clean(body.get("channelName"), ct.MAX_NAME)
        emoji = ct.clean(body.get("emoji"), 16)
        typed = [ct.clean(a, ct.MAX_NAME)
                 for a in (body.get("aliases") or [])]
        typed = [a for a in typed if a][:MAX_ALIASES]

        done = (had.get("channelTitleFor") == channel_name
                and bool(had.get("channelId")))
        if done:
            raw, name, got_id, why, gone = ("already", "", "", "", False)
        else:
            raw, name, got_id, why, gone = _lookup(channel_name)
        aliases, state = _with_title(channel_name, typed, raw, name)
        self.named = {"state": state, "name": name, "why": why}

        patch = {
            "channelName": channel_name,
            "emoji": emoji,
            "aliases": aliases,
            "channelKeys": keys_of([channel_name] if channel_name else []),
            "lookupKeys": keys_of(
                [x for x in [channel_name] + aliases if x]),
            "editedAt": NOW, "editedBy": "uid-owner", "updatedAt": NOW,
        }
        if state in ("added", "already"):
            patch["channelTitleFor"] = channel_name
        if not had.get("channelId") and got_id:
            patch["channelId"] = got_id
        # **もう無い名乗りの印（#159）。** 付け外しは口の中だけ。
        # 判定は `raw`（引いた結果そのもの）で見る——`state` は
        # `withChannelTitle` が「呼び名がいっぱい」で failed に
        # 書き換えることがあるので、引けたかどうかと一致しない
        gone_for = ct.clean(had.get("channelGoneFor"), ct.MAX_NAME)
        drop_gone = False
        if gone:
            patch["channelGoneFor"] = channel_name
        elif gone_for and not (gone_for == channel_name
                               and raw == "failed"):
            drop_gone = True
        # **送られてこなかった役どころには触らない**
        images = dict(had.get("images") or {})
        patch["images"] = images
        v.update(patch)     # `ref.set(patch, {merge: true})`
        if drop_gone:
            # `FieldValue.delete()`。**欄ごと落ちる**
            v.pop("channelGoneFor", None)
        return doc

    def posts(self):
        return [(p.rsplit("/", 1)[-1], b)
                for m, p, b in self.calls if m == "POST"]


# ---------------------------------------------------------------- 確かめる

FAILED: list = []


def ck(name: str, cond: bool, got) -> None:
    print(f"    {'○' if cond else '✕'} {name}: {got}")
    if not cond:
        FAILED.append(name)


def run(store: dict, apply: bool = False, limit=None, probe: bool = False,
        api=None):
    """`characters_touch.main()` を1回通す。**ネットには出ない。**"""
    client = Fake(store)
    api = api or FakeApi(store)
    was = (ct.db, ct.readonly, ct.call, ct.owner_token)
    ct.db = lambda: client
    ct.readonly = readonly
    ct.call = api
    ct.owner_token = lambda c: "（偽の札）"
    a: dict = {}
    if apply:
        a["apply"] = True
    if limit is not None:
        a["limit"] = limit
    if probe:
        a["probe"] = True
    os.environ["ARGS"] = json.dumps(a, ensure_ascii=False)
    here = BUF.tell()
    code = 0
    try:
        ct.main()
    except SystemExit as e:
        code = e.code or 0
    finally:
        (ct.db, ct.readonly, ct.call, ct.owner_token) = was
    return BUF.getvalue()[here:], code, client, api


def num(out: str, needle: str) -> str:
    line = next((x for x in out.splitlines() if needle in x), "")
    return "".join(c for c in line.rsplit("…", 1)[-1] if c.isdigit())


def main() -> None:  # noqa: C901
    os.environ["GITHUB_ACTIONS"] = "true"   # 公開の場として回す
    os.environ.pop("BREAK", None)

    print("[0] **壊していない写しが通る**（対照の対照の、その前）")
    bad = ct.run_control()
    ck("対照4つが通る", not bad, bad or "通った")

    print("\n[1] 下見 —— 仕分けの件数が仕込みどおり")
    out, code, client, api = run(make_store())
    ck("終了コード 1（通す先が残っている）", code == 1, code)
    ck("対照が通ったと言っている", "対照 4つ、通りました" in out, True)
    ck("すでに channelId を持っている", num(out, "すでに channelId") == "1",
       num(out, "すでに channelId"))
    ck("channelName が空", num(out, "channelName が空") == "1",
       num(out, "channelName が空"))
    ck("ふつうの表示名", num(out, "ふつうの表示名") == "1",
       num(out, "ふつうの表示名"))
    ck("書類IDの形が違う", num(out, "書類IDの形が違う") == "1",
       num(out, "書類IDの形が違う"))
    ck(f"**通す先** は {len(CAN_TOUCH)}人",
       num(out, "**通す先**") == str(len(CAN_TOUCH)), num(out, "**通す先**"))
    ck("通す先を1人ずつ指紋で出している",
       out.count("  通す: ") == len(CAN_TOUCH), out.count("  通す: "))

    print("\n[2] **下見では、1回も書いていない**（前後で数える）")
    ck("Firestore に書かれた回数 0", client.writes == 0, client.writes)
    # **下見でも口は1回読む**（#159 の1ホップを測るため）。読むだけ
    ck("口に投げた POST は0本", not api.posts(), len(api.posts()))
    ck("口から読んだのは GET だけ",
       [m for m, _p, _b in api.calls] == ["GET"],
       [m for m, _p, _b in api.calls])
    ck("下見だと言っている", "1バイトも書いていません" in out, True)
    shapes = [x.split("姿 ")[1].split()[0]
              for x in out.splitlines() if "姿 " in x]
    ck("図鑑の姿を前後で出している", len(shapes) == 2, len(shapes))
    ck("前後の姿が同じ", len(shapes) == 2 and shapes[0] == shapes[1],
       "同じ" if len(shapes) == 2 and shapes[0] == shapes[1] else shapes)
    ck("「はじめと同じ」と言っている", "← はじめと同じ" in out, True)

    print("\n[3] apply —— 通す先だけを口に通す")
    store = make_store()
    before = {k: dict(v) for k, v in store["islandCharacter"].items()}
    out2, code2, client2, api2 = run(store, apply=True)
    posts = api2.posts()
    sent = dict(posts)
    now = store["islandCharacter"]
    ck("Firestore には直に書いていない（口だけ）", client2.writes == 0,
       client2.writes)
    ck(f"POST は {len(CAN_TOUCH)}本", len(posts) == len(CAN_TOUCH),
       len(posts))
    ck("通した人数と増えたぶん",
       f"通しました: {len(CAN_TOUCH)}人 / 呼び名 +{len(GETS_ID)}件"
       f" / channelId +{len(GETS_ID)}人" in out2, out2.count("通しました"))
    for k in CAN_TOUCH:
        ck(f"{EMOJI[k]} に通した", DOC[k] in sent, DOC[k] in sent)
    ck("引けなかった人は、まだ残っていると言う",
       "通す先は、まだ 1人 残っています" in out2, True)
    ck("終了コード 1（引けなかった1人が残っている）", code2 == 1, code2)

    print("\n[4] **通してはいけない人には、1本も投げていない**")
    for k in NO_TOUCH:
        ck(f"{EMOJI[k]} に投げていない", DOC[k] not in sent, DOC[k] in sent)
    for k in NO_TOUCH:
        ck(f"{EMOJI[k]} の中身が1文字も動いていない",
           now[DOC[k]] == before[DOC[k]], "そのまま")

    print("\n[5] **送った中身**（欄が消える書き方をしていない）")
    body = sent.get(DOC["todo1"]) or {}
    ck("送る欄は3つだけ",
       all(set(b.keys()) == {"channelName", "emoji", "aliases"}
           for _, b in posts), sorted(body.keys()))
    ck("channelName を乗せ直している",
       body.get("channelName") == PEOPLE["todo1"]["channelName"], "乗せた")
    ck("emoji を乗せ直している", body.get("emoji") == EMOJI["todo1"],
       body.get("emoji") or "空で送った")
    ck("aliases を乗せ直している",
       body.get("aliases") == PEOPLE["todo1"]["aliases"],
       len(body.get("aliases") or []))
    ck("**lookupKeys / channelKeys を Python で作って送っていない**",
       "lookupKeys" not in body and "channelKeys" not in body,
       sorted(body.keys()))
    ck("絵（plain / scene）を送っていない",
       "plain" not in body and "scene" not in body, sorted(body.keys()))

    print("\n[6] **通したあと、増えたのは呼び名1件と channelId だけ**")
    for k in CAN_TOUCH:
        w, v = before[DOC[k]], now[DOC[k]]
        d = ct.verdict(w, v)
        ck(f"{EMOJI[k]} 別の欄が動いていない", not d.bad, d.bad or "動いていない")
        ck(f"{EMOJI[k]} 絵文字が残っている", v.get("emoji") == EMOJI[k],
           v.get("emoji") or "消えた")
        ck(f"{EMOJI[k]} 呼び名が減っていない",
           v.get("aliases", [])[:len(w["aliases"])] == w["aliases"],
           len(v.get("aliases") or []))
        ck(f"{EMOJI[k]} 絵が1枚も減っていない",
           all(v.get("images", {}).get(r) == x
               for r, x in (w.get("images") or {}).items()),
           sorted((v.get("images") or {}).keys()))
    for k in GETS_ID:
        ck(f"{EMOJI[k]} に channelId が入った", bool(now[DOC[k]]["channelId"]),
           "入った" if now[DOC[k]]["channelId"] else "空のまま")
        ck(f"{EMOJI[k]} 呼び名がちょうど1件増えた",
           len(now[DOC[k]]["aliases"]) - len(before[DOC[k]]["aliases"]) == 1,
           len(now[DOC[k]]["aliases"]))
    ck("引けなかった人には channelId が入らない",
       not now[DOC["blind"]]["channelId"], "空のまま")
    ck("引けなかった人の呼び名も減っていない",
       now[DOC["blind"]]["aliases"] == PEOPLE["blind"]["aliases"],
       now[DOC["blind"]]["aliases"] and "そのまま")
    ck("todo1 の順番・作った日・動画は触られていない",
       all(now[DOC["todo1"]][f] == PEOPLE["todo1"][f]
           for f in ("order", "createdAt", "videoUrl")), "そのまま")

    print("\n[6b] **入らなかった理由が出る**（「入らなかった」で終わらせない）")
    # 本番で口が 200 を返したのに何も入らず、ログには「入らなかった」しか
    # 出ていなかった（run 35386977128）。**次に何を直すかが決められない。**
    ck("引けた人は added と出る", "口の返事: added" in out2, True)
    ck("**引けなかった人は理由まで出る**",
       "口の返事: failed（届かなかった）" in out2, True)
    ck("全員ぶん、口の返事を出している",
       out2.count("← 口の返事: ") == len(CAN_TOUCH),
       out2.count("← 口の返事: "))
    ck("動いた欄を全員ぶん出している",
       out2.count("      動いた欄: ") == len(CAN_TOUCH),
       out2.count("      動いた欄: "))
    moved_blind = ct.verdict(before[DOC["blind"]], now[DOC["blind"]]).moved
    ck("引けなかった人は**時刻の印しか動いていない**",
       moved_blind == ["editedAt", "editedBy", "updatedAt"], moved_blind)
    ck("そう出ている",
       "動いた欄: editedAt,editedBy,updatedAt" in out2, True)
    moved_ok = ct.verdict(before[DOC["todo1"]], now[DOC["todo1"]]).moved
    ck("引けた人は呼び名と channelId と鍵が動く",
       {"aliases", "channelId", "lookupKeys"} <= set(moved_ok), moved_ok)
    # **理由の字は、決まり文句だけを通す。** 向こうが作りを変えて素性を
    # 混ぜはじめた日に、ここから漏れる
    ck("決まり文句はそのまま出す",
       ct.reason({"state": "failed", "why": "届かなかった"})
       == "failed（届かなかった）",
       ct.reason({"state": "failed", "why": "届かなかった"}))
    leak = ct.reason({"state": "failed", "name": "もれる なまえ",
                      "why": "もれる なまえ です"})
    ck("**表に無い理由は、字を出さずに指紋にする**",
       "もれる" not in leak, leak)
    ck("引けた表示名（named.name）も出さない", "もれる" not in leak, leak)
    ck("知らない state も字を出さない",
       "@abunai" not in ct.reason({"state": "@abunai", "why": ""}),
       ct.reason({"state": "@abunai", "why": ""}))
    ck("返事に named が無くても落ちない",
       ct.reason(None) == "（返事に named が無い）", ct.reason(None))

    # ------------------------------------------------------------------
    # **欄が消えないことを、偽の口に実際に消させて確かめる。**
    #
    # 網は2枚ある。1枚目は対照（`run_control` の足 2）で、**叩く前に**
    # 止める。2枚目は突き合わせ（`verdict`）で、**叩いたあとに**気づいて
    # 止める。1枚目だけを見ると、対照をすり抜けた日に何が起きるかを
    # 1度も測らないまま「守られている」と言うことになるので、
    # **対照を黙らせて2枚目だけを実測する回**を分けて置く。
    was_carry, was_control = ct.carry, ct.run_control
    no_emoji = {
        "channelName": lambda r: ct.clean(r.get("channelName"), ct.MAX_NAME),
        "aliases": ct.aliases_of,
    }
    no_alias = {
        "channelName": lambda r: ct.clean(r.get("channelName"), ct.MAX_NAME),
        "emoji": lambda r: ct.clean(r.get("emoji"), 16),
    }

    def broken_carry(fields):
        return lambda row: {k: f(row) for k, f in fields.items()}

    print("\n[7a] 絵文字を送り忘れる —— **1枚目の網（対照）が叩く前に止める**")
    store7a = make_store()
    try:
        ct.carry = broken_carry(no_emoji)
        out7a, code7a, _c7a, api7a = run(store7a, apply=True)
    finally:
        ct.carry = was_carry
    ck("終了コード 2", code7a == 2, code7a)
    ck("対照が落ちたと言っている", "対照が落ちました" in out7a, True)
    ck("**口を1回も叩いていない**", not api7a.calls, len(api7a.calls))
    ck("Firestore を1行も読んでいない", "図鑑（はじめ）" not in out7a,
       "読んでいない")

    print("\n[7b] 対照をすり抜けても、**突き合わせが捕まえて止める**")
    store7 = make_store()
    try:
        ct.carry = broken_carry(no_emoji)
        ct.run_control = lambda: []     # 1枚目の網をわざと外す
        out7, code7, _c7, api7 = run(store7, apply=True)
    finally:
        ct.carry, ct.run_control = was_carry, was_control
    gone = store7["islandCharacter"][api7.posts()[0][0]]
    ck("偽の口は、送らなかった絵文字を**本当に消す**",
       gone.get("emoji") == "", repr(gone.get("emoji")))
    ck("**それを捕まえて止める**", "通したら別の欄が動きました" in out7, True)
    ck("消えた欄の名前を出している", "欄が変わった: emoji" in out7, True)
    ck("終了コード 1", code7 == 1, code7)
    ck("**残りには1人も投げていない**（1本で止まる）",
       len(api7.posts()) == 1, len(api7.posts()))
    ck("止めたと言っている", "ここで止めました" in out7, True)

    print("\n[8] 呼び名を送り忘れても、同じ2枚で止まる")
    store8a = make_store()
    try:
        ct.carry = broken_carry(no_alias)
        out8a, code8a, _c8a, api8a = run(store8a, apply=True)
    finally:
        ct.carry = was_carry
    ck("1枚目の網で 2", code8a == 2, code8a)
    ck("口を1回も叩いていない", not api8a.calls, len(api8a.calls))
    store8 = make_store()
    try:
        ct.carry = broken_carry(no_alias)
        ct.run_control = lambda: []
        out8, code8, _c8, api8 = run(store8, apply=True)
    finally:
        ct.carry, ct.run_control = was_carry, was_control
    lost = store8["islandCharacter"][api8.posts()[0][0]]
    ck("偽の口は、送らなかった呼び名を**本当に消す**",
       lost.get("aliases") == ["つれ ささ れ"], len(lost.get("aliases")))
    ck("**それを捕まえて止める**", "通したら別の欄が動きました" in out8, True)
    ck("呼び名が書き換わったと言っている", "呼び名が書き換わった" in out8, True)
    ck("終了コード 1", code8 == 1, code8)

    print("\n[9] 口と中身が食い違っていたら、触らない")
    store9 = make_store()
    client9 = Fake(store9)
    api9 = FakeApi({"islandCharacter": {
        k: {**v, "emoji": "🍩"} for k, v in store9["islandCharacter"].items()
    }})
    was9 = (ct.db, ct.readonly, ct.call, ct.owner_token)
    ct.db, ct.readonly, ct.call = (lambda: client9), readonly, api9
    ct.owner_token = lambda c: "（偽の札）"
    os.environ["ARGS"] = '{"apply": true}'
    here9 = BUF.tell()
    code9 = 0
    try:
        ct.main()
    except SystemExit as e:
        code9 = e.code or 0
    finally:
        (ct.db, ct.readonly, ct.call, ct.owner_token) = was9
    out9 = BUF.getvalue()[here9:]
    ck("1本も投げていない", not api9.posts(), len(api9.posts()))
    ck("食い違いを言っている", "口と中身が食い違っています" in out9, True)
    ck("終了コード 1（通す先が残ったまま）", code9 == 1, code9)

    print("\n[10] limit —— 1人ずつ試せる")
    store10 = make_store()
    out10, code10, _c10, api10 = run(store10, apply=True, limit=1)
    ck("POST は1本だけ", len(api10.posts()) == 1, len(api10.posts()))
    ck("limit を言っている", "limit=1 のぶんだけにしました" in out10, True)
    ck("終了コード 1（残りがある）", code10 == 1, code10)

    print("\n[11] 通す先が無いとき —— やることなしで 0")
    out11, code11, _c11, api11 = run(make_store(drop=CAN_TOUCH), apply=True)
    ck("終了コード 0", code11 == 0, code11)
    ck("「通す先はありません」と言っている",
       "通す先はありません" in out11, True)
    ck("口に投げた POST は0本", not api11.posts(), len(api11.posts()))

    print("\n[12] 図鑑が1件も返らないとき（読めていないのに 0 と言わない）")
    out12, code12, client12, api12 = run({"islandCharacter": {}})
    ck("終了コード 2 で止まる", code12 == 2, code12)
    ck("**件数を1つも出していない**", "図鑑（はじめ）" not in out12,
       "出していない" if "図鑑（はじめ）" not in out12 else "出してしまった")
    ck("何も書いていない", client12.writes == 0 and not api12.calls,
       client12.writes)

    print("\n[13] 名前も呼び名もチャンネルIDも書類IDも1文字も出ていない")
    both = (out + out2 + out7a + out7 + out8a + out8 + out9
            + out10 + out11)
    names = [v["channelName"] for v in PEOPLE.values() if v["channelName"]]
    names += [x for v in PEOPLE.values() for x in v["aliases"]]
    names += [n for n, _c in YT.values()]
    names += sorted(GONE_YT)
    leaked = sorted({v for v in names if v and v in both})
    ck("出力に名前が無い", not leaked, leaked or "無し")
    bare = sorted({v.lstrip("@") for v in names
                   if v.startswith("@") and v.lstrip("@") in both})
    ck("`@` を落とした形も出ていない", not bare, bare or "無し")
    ck("チャンネルIDも出ていない",
       not any(v in both for v in (UC1, UC2, UC3, UC4)), "無し")
    ck("書類IDも生では出ていない",
       not any(len(v) > 8 and v in both for v in DOC.values()), "無し")

    print("\n[13b] probe —— **Actions の側から引き直す**（1バイトも書かない）")
    # 口が「届かなかった」と言ったとき、名乗りが死んでいるのか
    # **Functions の出口が塞がれている**のかが、口の返事だけでは分からない。
    # 別の場所から同じ名乗りを引いて突き合わせる
    was_probe, was_gap = ct.probe_one, ct.ca.GAP
    fake_probe = {
        DOC["todo1"]: (ct.P_GOT, "", 0.4),
        DOC["todo2"]: (ct.P_GONE, "見つからない（404）", 0.1),
        DOC["ucname"]: (ct.P_BLIND, "届かない: URLError", 12.3),
        DOC["blind"]: (ct.P_BROKEN, "こちらが落ちた: UnicodeEncodeError",
                       0.0),
    }
    by_name = {PEOPLE[k]["channelName"]: v
               for k, v in zip(CAN_TOUCH, fake_probe.values())}
    try:
        ct.ca.GAP = 0.0
        ct.probe_one = lambda name, timeout=20.0: by_name[name]
        out16, code16, client16, api16 = run(make_store(), apply=True,
                                             limit=None, probe=True)
    finally:
        ct.probe_one, ct.ca.GAP = was_probe, was_gap
    ck("**1バイトも書いていない**", client16.writes == 0, client16.writes)
    ck("**口に1本も投げていない**（probe は apply より強い）",
       not api16.posts(), len(api16.posts()))
    ck("口から読んだのは GET だけ",
       [m for m, _p, _b in api16.calls] == ["GET"],
       [m for m, _p, _b in api16.calls])
    ck("下見だと言っている", "1バイトも書いていません" in out16, True)
    ck("**apply を効かせていないことを言う**（押した人に嘘をつかない）",
       "一緒に渡された apply は効かせていません" in out16, True)
    ck("取れた人はそう出る", "← 取れた / 0.4秒" in out16, True)
    ck("**404 は「もう無い」と出る**（届かないと混ぜない）",
       "← もう無い（見つからない（404））" in out16, True)
    ck("届かない人は理由まで出る",
       "← 届かない（届かない: URLError）" in out16, True)
    ck("**こちらが落ちた人は「測れていない」と出る**",
       "← **測れていない**（こちらが落ちた: UnicodeEncodeError）" in out16,
       True)
    # **口の待ちは8秒。** 秒数が無いと「時間切れ」が遅さの話か
    # 塞がれている話かを分けられない
    ck("かかった秒数も出る", "/ 12.3秒（口の待ちは8秒）" in out16, True)
    ck("**5つに割って数えている**",
       "取れた 1人 / もう無い（404） 1人 / 断られた 0人 / "
       "届かない 1人 / **測れていない** 1人" in out16, True)
    ck("**測れていないものがあると、そう言って赤くする**",
       "1人ぶんは、こちらのコードが落ちて測れていません" in out16, True)
    ck("**出口の話だと言える形になっている**",
       "Functions の出口の話です" in out16, True)
    ck("404 は出口の話ではないと言う",
       "もう無い（404）の人は、出口の話ではありません" in out16, True)
    ck("図鑑の姿は変わっていない", "← はじめと同じ" in out16, True)
    ck("終了コード 1（通す先が残ったまま）", code16 == 1, code16)

    print("\n[13c] **日本語のハンドルで落ちない**（今日そこで3人測れなかった）")
    # run 35388297836 で `UnicodeEncodeError`。符号化せずに URL へ載せていた。
    # **`channel_alias.py` には写す先が無い**——あちらが URL に入れるのは
    # `channelId`（ぜんぶ ascii）だけで、ハンドルを1度も載せていない
    for raw in ("@えびっち-m7r", "@ふつう1234", "@a-b_c.d", "@100%おいしい"):
        url = ct.handle_url(raw)
        ok = True
        try:
            url.encode("ascii")
        except UnicodeEncodeError:
            ok = False
        ck(f"URL が ascii だけでできている（{len(raw)}字のハンドル）", ok, url)
        ck("`@` を落としている", "/@@" not in url, url)
    ck("符号化されている（生の日本語が URL に出ない）",
       "えびっち" not in ct.handle_url("@えびっち-m7r"),
       ct.handle_url("@えびっち-m7r"))
    ck("口と同じ広さで符号化する（`/` も通さない）",
       ct.handle_url("@a/b").endswith("%2Fb"), ct.handle_url("@a/b"))
    ck("`UC…` は feed のまま",
       ct.handle_url(UC1) == ct.ca.FEED.format(UC1), ct.handle_url(UC1))
    # **落ちたら「届かない」ではなく「測れていない」に積む**
    was_get = ct.ca._get

    def boom(url, timeout):
        raise UnicodeEncodeError("ascii", "x", 0, 1, "だめ")

    try:
        ct.ca._get = boom
        kind, why, _sec = ct.probe_one("@えびっち-m7r")
    finally:
        ct.ca._get = was_get
    ck("**こちらが落ちたら BROKEN**（BLIND に混ぜない）",
       kind == ct.P_BROKEN, f"{kind}（{why}）")
    ck("落ちた種類が出る", "UnicodeEncodeError" in why, why)

    print("\n[13d] 向こうの返事は、種類ごとに別の字にする")
    import urllib.error as ue
    cases = [
        ("404", ue.HTTPError("u", 404, "no", None, None), ct.P_GONE,
         "見つからない（404）"),
        ("429", ue.HTTPError("u", 429, "no", None, None), ct.P_DENIED,
         "断られた（HTTP 429）"),
        ("届かない", ue.URLError("boom"), ct.P_BLIND, None),
        ("時間切れ", TimeoutError("late"), ct.P_BLIND, None),
        ("こちらのバグ", ValueError("bug"), ct.P_BROKEN, None),
    ]
    for label, err, want, want_why in cases:
        def raiser(url, timeout, _e=err):
            raise _e
        try:
            ct.ca._get = raiser
            kind, why, _sec = ct.probe_one("@futsuu1234")
        finally:
            ct.ca._get = was_get
        ck(f"{label} → {want}", kind == want, f"{kind}（{why}）")
        if want_why:
            ck(f"{label} の字", why == want_why, why)
    # 口が返す理由も、種類ごとに通す／伏せる
    ck("口の「見つからない（404）」はそのまま出す",
       ct.reason({"state": "failed", "why": "見つからない（404）"})
       == "failed（見つからない（404））", True)
    ck("口の「断られた（HTTP 429）」もそのまま出す",
       ct.reason({"state": "failed", "why": "断られた（HTTP 429）"})
       == "failed（断られた（HTTP 429））", True)
    ck("**数字以外を混ぜた「断られた」は通さない**",
       "もれる" not in ct.reason(
           {"state": "failed", "why": "断られた（HTTP もれる）"}),
       ct.reason({"state": "failed", "why": "断られた（HTTP もれる）"}))

    print("\n[13e] **もう無い名乗りの印を、この道具が通せるか**（#159）")
    # 口が 404 を見たとき、書類に `channelGoneFor` を残すようになった。
    # **その欄はこの道具の突き合わせが知らない欄**なので、名指ししないと
    # 印が付いた回は「欄が変わった」、消えた回は「欄が消えた」で
    # **1人目で止まる。** つまり**印を付けるための唯一の道が、印のせいで
    # 塞がる。** 守りを弱めるのではなく、この欄が何者かを教えて通す。
    #
    # 足は4本。**1つずつ、別の仕込みで測る。**

    def gone_store(rows: dict) -> dict:
        """印まわりだけの、小さな図鑑。**既存の仕込みに触らない**"""
        out = {}
        for doc, r in rows.items():
            row = dict(r)
            name = row.get("channelName") or ""
            row.setdefault("emoji", "🔖")
            row.setdefault("aliases", [])
            row.setdefault("channelId", "")
            row.setdefault("images", {})
            row["channelKeys"] = keys_of([name] if name else [])
            row["lookupKeys"] = keys_of([name] + row["aliases"])
            out[doc] = row
        return {"islandCharacter": out}

    # 書類IDは、既存の仕込みと1つもぶつからない形にする
    G_PUT = "g0" + "0123456789abcdef" * 2     # 404 を返す引き先
    G_OFF = "g1" + "0123456789abcdef" * 2     # 印が付いていて、いまは引ける
    GONE_H = sorted(GONE_YT)[0]

    store13 = gone_store({
        G_PUT: {"channelName": GONE_H, "emoji": "🍰"},
        # **すでに印が付いている人。** 通すと引けるので、印は落ちるはず
        G_OFF: {"channelName": "@tsuresasare1234", "emoji": "🦐",
                "aliases": ["つれ"], "channelGoneFor": "@tsuresasare1234"},
    })
    was13 = {k: dict(v) for k, v in store13["islandCharacter"].items()}
    out13, code13, _c13, api13 = run(store13, apply=True)
    now13 = store13["islandCharacter"]

    # ---- 足1. 404 を返す引き先 → 印が付いて、**それでも通る**
    ck("印が付いた（名乗りと同じ字）",
       now13[G_PUT].get("channelGoneFor") == GONE_H,
       "付いた" if now13[G_PUT].get("channelGoneFor") == GONE_H else "付かない")
    ck("**印が付いても、突き合わせは通る**",
       not ct.verdict(was13[G_PUT], now13[G_PUT]).bad,
       ct.verdict(was13[G_PUT], now13[G_PUT]).bad or "通った")

    # ---- 足2. 印が付いていた人が引けた → 印が**消えて**、それでも通る
    ck("印が消えた（欄ごと落ちる）",
       "channelGoneFor" not in now13[G_OFF],
       "消えた" if "channelGoneFor" not in now13[G_OFF] else "残っている")
    ck("**印が消えても、突き合わせは通る**",
       not ct.verdict(was13[G_OFF], now13[G_OFF]).bad,
       ct.verdict(was13[G_OFF], now13[G_OFF]).bad or "通った")

    # ---- そして、**1人目で止まっていない**（これが直したかったこと）
    ck("2人とも口に通している（1人目で止まらない）",
       len(api13.posts()) == 2, len(api13.posts()))
    ck("「ここで止めました」と言っていない",
       "ここで止めました" not in out13, "止まっていない")
    ck("「別の欄が動きました」と言っていない",
       "通したら別の欄が動きました" not in out13, "言っていない")
    ck("印が動いた欄として名前は出る（値は出ない）",
       "channelGoneFor" in out13 and GONE_H not in out13,
       "名前だけ出ている")
    ck("**404 の理由が出る**",
       "口の返事: failed（見つからない（404））" in out13, True)

    # ---- 足3. 印が**名乗りと違う字**で入った → **止まる**
    # 口の作りからしてありえない。ここを緩めると、口が壊れた日に
    # 気づけない（印が別人の名乗りを指したまま画面に出る）
    w3 = {"channelName": "@tsuresasare1234", "emoji": "🐚", "aliases": []}
    n3 = {**w3, "channelGoneFor": "@chigaujimei01",
          "editedAt": NOW, "updatedAt": NOW}
    d3 = ct.verdict(w3, n3)
    ck("**違う字の印は止める**", bool(d3.bad), d3.bad or "通してしまった")
    ck("欄の名前で言う", any("channelGoneFor" in b for b in d3.bad), d3.bad)
    ck("**文句に値（ハンドル）を出さない**",
       not any("@chigaujimei01" in b for b in d3.bad), d3.bad)

    # ---- 足4. 印が付いたうえで、**ほかの欄も動いた** → 今までどおり止まる
    # 「印が動いた回は何でも通る」に書いていないことの確認（通し過ぎ）
    w4 = {"channelName": GONE_H, "emoji": "🍰", "aliases": []}
    n4 = {**w4, "emoji": "", "channelGoneFor": GONE_H,
          "editedAt": NOW, "updatedAt": NOW}
    d4 = ct.verdict(w4, n4)
    ck("**印と一緒に絵文字が消えたら、やはり止める**",
       any("emoji" in b for b in d4.bad), d4.bad or "通してしまった")

    print("\n[13f] **その4つは、守りを外すと落ちる**（対照）")
    # 足を1本ずつ抜いて、**そのたび別の足が落ちる**ところまで見る。
    # 同じ足を4通りに折っているだけなら、それは1通り
    was_gone_name, was_gone_fn = ct.GONE, ct.gone_moved
    was_stamp = ct.STAMP
    controls = []

    # (a) 印を「知らない欄」に戻す → 足1・足2 が落ちる
    try:
        ct.GONE = "__shiranai_ran__"
        a1 = bool(ct.verdict(was13[G_PUT], now13[G_PUT]).bad)
        a2 = bool(ct.verdict(was13[G_OFF], now13[G_OFF]).bad)
    finally:
        ct.GONE = was_gone_name
    controls.append(("印を知らない欄のままにする", a1 and a2,
                     f"足1={a1} / 足2={a2}"))

    # (b) 印を素通しにする → 足3 が落ちる
    try:
        ct.gone_moved = lambda was, now: ""
        b3 = not ct.verdict(w3, n3).bad
    finally:
        ct.gone_moved = was_gone_fn
    controls.append(("印を素通しにする", b3, f"足3={b3}"))

    # (c) 免除を広げすぎる（絵文字まで「変わってよい」に入れる）→ 足4
    try:
        ct.STAMP = frozenset(set(was_stamp) | {"emoji"})
        c4 = not any("emoji" in x for x in ct.verdict(w4, n4).bad)
    finally:
        ct.STAMP = was_stamp
    controls.append(("免除を広げすぎる", c4, f"足4={c4}"))

    # (d) 突き合わせの文句をぜんぶ黙らせる（既存の `BREAK=diff`）→ 足3・足4
    os.environ["BREAK"] = "diff"
    try:
        d3b = not ct.verdict(w3, n3).bad
        d4b = not ct.verdict(w4, n4).bad
    finally:
        os.environ.pop("BREAK", None)
    controls.append(("BREAK=diff で文句を黙らせる", d3b and d4b,
                     f"足3={d3b} / 足4={d4b}"))

    for label, fell, got in controls:
        ck(f"{label} → 落ちる", fell, got)
    # **壊していないときは通る**（片側だけは対照ではない）
    ck("守りを戻したら、足1と足2はまた通る",
       not ct.verdict(was13[G_PUT], now13[G_PUT]).bad
       and not ct.verdict(was13[G_OFF], now13[G_OFF]).bad, "通る")
    ck("守りを戻したら、足3と足4はまた止まる",
       bool(ct.verdict(w3, n3).bad) and bool(ct.verdict(w4, n4).bad),
       "止まる")

    print("\n[13g] **配った口が、その印を返しているか**（#159 の1ホップ）")
    # `channelGoneFor` が Firestore に入ったことは、`verdict` が
    # **Firestore を直に読んで**確かめている（本番 run 35396736705 で3人）。
    # **だが「配った口が `channelGone` にして返す」ところは、本番で1度も
    # 測っていない。** 書類に入るのは `channelGoneFor`（字）、口が返すのは
    # `channelGone`（真偽）で、**別の欄。** 見張り
    # （`character_alias_selftest.mjs`）が通っていることは、
    # **本番の配り物の証拠にはならない**（#157）。
    #
    # 足は4本。**1つずつ、別の仕込みで測る。**

    G_D1 = "h0" + "0123456789abcdef" * 2
    G_D2 = "h1" + "0123456789abcdef" * 2
    G_NEW = "@iremaoshita1"      # 入れ直されたあとの名乗り

    def gbook(name, stamp=None) -> dict:
        v = {"channelName": name}
        if stamp is not None:
            v["channelGoneFor"] = stamp
        return v

    def gcur(doc, gone=None) -> dict:
        """口の返した1人。`gone` が None だと**欄そのものが無い**（古い口）"""
        row = {"id": doc}
        if gone is not None:
            row["channelGone"] = gone
        return row

    def say(book, cur, why=""):
        """`gone_report` を1回回して、(見立て, 出した字) を取る。"""
        here = BUF.tell()
        st = ct.gone_report("いま", book, cur, why)
        return st, BUF.getvalue()[here:]

    # ---- 足1. 口も Firestore も立っている → **揃っている**
    b_on = {G_D1: gbook(GONE_H, GONE_H)}
    st1, lg1 = say(b_on, {G_D1: gcur(G_D1, True)})
    ck("足1 **揃っていると出る**", st1 == "" and "**揃っています**" in lg1,
       st1 or "揃っている")
    ck("足1 **口が立てて返した人数を出している**",
       "channelGone を立てて返した … 1人" in lg1, True)
    ck("足1 Firestore 側の人数も並べている",
       "Firestore に印（channelGoneFor）がある … 1人" in lg1, True)

    # ---- 足2. 口が返さないのに Firestore には在る（名乗りは同じ）
    #      → **食い違いとして言う。** ここがこの直しの本体
    st2, lg2 = say(b_on, {G_D1: gcur(G_D1, False)})
    ck("足2 **食い違いとして赤くする**",
       st2 == "差" and "食い違っています" in lg2, st2)
    ck("足2 どちらの向きかまで言う",
       "立つはずなのに、口は立てていません" in lg2, True)
    ck("足2 **口の側の話だと言う**（この道具では直さない）",
       "islandCharacter.ts" in lg2, True)

    # ---- 足3. 名乗りが書き換わっている（古い印・口は false）
    #      → **食い違いにしない。** `shapeFull` はそう作ってある
    b_moved = {G_D1: gbook(G_NEW, GONE_H)}
    st3, lg3 = say(b_moved, {G_D1: gcur(G_D1, False)})
    ck("足3 **食い違いにしない**",
       st3 == "" and "食い違っています" not in lg3, st3 or "言っていない")
    ck("足3 書き換わった人として、別に数える",
       "名乗りが書き換わった（**口は立てない。食い違いではない**） … 1人"
       in lg3, True)

    # ---- 足4. どちらも0 → **静かに0**。ただし「口から0人」は 0 ではない
    b_none = {G_D1: gbook("@futsuu1234")}
    st4, lg4 = say(b_none, {G_D1: gcur(G_D1, False)})
    ck("足4 どちらも0なら、静かに0と出る",
       st4 == "" and "を立てて返した … 0人" in lg4, st4 or "0人")
    ck("足4 0人のときに赤くしていない",
       "食い違っています" not in lg4, True)
    st4b, lg4b = say(b_none, {})
    ck("足4 **口から1人も返らない回は、0ではなく「測れていない」**",
       st4b == "盲" and "測れていません" in lg4b, st4b)
    ck("足4 「0人ではありません」と言っている",
       "0人ではありません" in lg4b, True)
    st4c, lg4c = say(b_none, None, "口を叩けませんでした")
    ck("足4 口を叩けなかった回も「測れていない」", st4c == "盲", st4c)

    # ---- 足5. 立たないはずなのに、口が立てている（逆向き）
    st5, lg5 = say(b_moved, {G_D1: gcur(G_D1, True)})
    ck("足5 逆向きの食い違いも言う",
       st5 == "差" and "立たないはずなのに、口が立てています" in lg5, st5)

    # ---- 足6. 口が `channelGone` という欄を1つも返していない（古い配り物）
    #
    # **印が0人の日で測る。** 印が在る日は「立つはずなのに立っていない」の
    # ほうが先に捕まえるので、この足の守りを測ったことにならない。
    # 0人の日は誰も食い違わないので、**欄が無いことを見ないと
    # 「揃っています 0人」と嘘をつく**
    st6, lg6 = say(b_none, {G_D1: gcur(G_D1)})
    ck("足6 **配った口が古いと言う**（印が0人の日でも）",
       st6 == "差" and "1人ぶんも返していません" in lg6, st6)

    # ---- 足7. Firestore に在るのに、口が返さなかった人がいる
    st7, lg7 = say({**b_on, G_D2: gbook("@futsuu1234")},
                   {G_D1: gcur(G_D1, True)})
    ck("足7 **返ってこなかった人ぶんは「測れていない」**",
       st7 == "盲" and "口が返さなかった人が 1人" in lg7, st7)

    print("\n[13h] **その足は、守りを外すと落ちる**（対照）")
    # 足を1本ずつ抜いて、**そのたび別の足が落ちる**ところまで見る
    was_want, was_api_name = ct.gone_want, ct.GONE_API
    was_blind, was_gtally = ct.gone_blind, ct.gone_tally
    gcontrols = []

    # (a) 「印が在れば立つはず」に緩める → **足3**（書き換わった人）が落ちる
    try:
        ct.gone_want = lambda v: bool(v.get(ct.GONE))
        a3 = say(b_moved, {G_D1: gcur(G_D1, False)})[0] != ""
        a1 = say(b_on, {G_D1: gcur(G_D1, True)})[0] == ""
    finally:
        ct.gone_want = was_want
    gcontrols.append(("印が在れば立つはず、に緩める", a3 and a1,
                      f"足3={a3} / 足1は無事={a1}"))

    # (b) 口の返す欄の名前を読み違える → **足1** が落ちる
    try:
        ct.GONE_API = "__betsu_no_ran__"
        b1 = say(b_on, {G_D1: gcur(G_D1, True)})[0] != ""
    finally:
        ct.GONE_API = was_api_name
    gcontrols.append(("口の返す欄を読み違える", b1, f"足1={b1}"))

    # (c) 「口から0人」を 0 として通す → **足4** が落ちる
    try:
        ct.gone_blind = lambda cur, why: ""
        c4 = say(b_none, {})[0] != "盲"
    finally:
        ct.gone_blind = was_blind
    gcontrols.append(("口から0人を 0 として通す", c4, f"足4={c4}"))

    # (d) 欄が返っていなくても返ったことにする → **足6** が落ちる
    def _blind_field(book, cur):
        g = was_gtally(book, cur)
        g.field_seen = g.seen
        return g

    try:
        ct.gone_tally = _blind_field
        d6 = say(b_none, {G_D1: gcur(G_D1)})[0] == ""
    finally:
        ct.gone_tally = was_gtally
    gcontrols.append(("欄が無くても返ったことにする", d6, f"足6={d6}"))

    # (e) 「立つはずなのに立っていない」を数えない → **足2** が落ちる
    def _no_missing(book, cur):
        g = was_gtally(book, cur)
        g.missing = []
        return g

    try:
        ct.gone_tally = _no_missing
        e2 = say(b_on, {G_D1: gcur(G_D1, False)})[0] == ""
        e5 = say(b_moved, {G_D1: gcur(G_D1, True)})[0] == "差"
    finally:
        ct.gone_tally = was_gtally
    gcontrols.append(("立っていないほうを数えない", e2 and e5,
                      f"足2={e2} / 足5は無事={e5}"))

    for label, fell, got in gcontrols:
        ck(f"{label} → 落ちる", fell, got)
    ck("守りを戻したら、足1と足3はまた通る",
       say(b_on, {G_D1: gcur(G_D1, True)})[0] == ""
       and say(b_moved, {G_D1: gcur(G_D1, False)})[0] == "", "通る")
    ck("守りを戻したら、足2と足6はまた止まる",
       say(b_on, {G_D1: gcur(G_D1, False)})[0] == "差"
       and say(b_none, {G_D1: gcur(G_D1)})[0] == "差", "止まる")

    print("\n[13i] **本物の `main()` でも、通す前と通したあとに数える**")
    # 印を書いたのは口だが、**書いた口と配る口が同じとは限らない。**
    # 通す前だけ見ていると、いま書いたぶんが返るかを1度も測らない
    store13i = gone_store({
        G_PUT: {"channelName": GONE_H, "emoji": "🍰"},
        G_OFF: {"channelName": "@tsuresasare1234", "emoji": "🦐",
                "aliases": ["つれ"], "channelGoneFor": "@tsuresasare1234"},
    })
    out13i, code13i, _c13i, _a13i = run(store13i, apply=True)
    ck("通す前に数えている", "いま、口が返す「もう無い名乗り」の印" in out13i,
       True)
    ck("**通したあとにも数えている**",
       "通したあと、口が返す「もう無い名乗り」の印" in out13i, True)
    ck("どちらも揃っている", out13i.count("**揃っています**") == 2,
       out13i.count("**揃っています**"))
    ck("通したあとも、口は1人ぶん立てて返している",
       out13i.count("channelGone を立てて返した … 1人") == 2,
       out13i.count("channelGone を立てて返した … 1人"))
    ck("終了コード 1（404 の人が通す先に残る）", code13i == 1, code13i)

    print("\n[13j] **配った口が古い日を、本物の `main()` が赤くする**")
    # 欄そのものを返さない口（配り物が印より古い）
    store13j = gone_store({
        G_OFF: {"channelName": "@tsuresasare1234", "emoji": "🦐",
                "aliases": ["つれ"], "channelGoneFor": "@tsuresasare1234"},
    })
    out13j, code13j, c13j, a13j = run(
        store13j, api=FakeApi(store13j, shows_gone=False))
    ck("**古い口だと言う**", "1人ぶんも返していません" in out13j, True)
    ck("1バイトも書いていない", c13j.writes == 0 and not a13j.posts(),
       c13j.writes)
    ck("終了コード 1", code13j == 1, code13j)

    # 欄は返すが、**印だけ出てこない**口（`shapeFull` の条件が違う日）
    class StaleApi(FakeApi):
        """欄は返すのに、印だけ立たない口。**いちばん静かな壊れ方**"""

        def __call__(self, method, path, token, body=None):
            r = FakeApi.__call__(self, method, path, token, body)
            if method == "GET":
                for row in r["characters"]:
                    row["channelGone"] = False
            return r

    store13k = gone_store({
        G_OFF: {"channelName": "@tsuresasare1234", "emoji": "🦐",
                "aliases": ["つれ"], "channelGoneFor": "@tsuresasare1234"},
    })
    out13k, code13k, c13k, _a13k = run(store13k, api=StaleApi(store13k))
    ck("**書類には在るのに口が返さない、を捕まえる**",
       "立つはずなのに、口は立てていません" in out13k, True)
    ck("食い違いだと言っている", "食い違っています" in out13k, True)
    ck("1バイトも書いていない", c13k.writes == 0, c13k.writes)
    ck("終了コード 1", code13k == 1, code13k)

    print("\n[13l] 印が1人もいない日は、静かに0と出る（下見）")
    out13l, _c, _cl, _a = run(make_store())
    ck("節は出ている", "口が返す「もう無い名乗り」の印" in out13l, True)
    ck("0人と出る", "channelGone を立てて返した … 0人" in out13l, True)
    ck("赤くしていない", "食い違っています" not in out13l
       and "測れていません" not in out13l, True)

    print("\n[13m] この節でも、名乗りは1文字も出ていない")
    gout = (lg1 + lg2 + lg3 + lg4 + lg4b + lg4c + lg5 + lg6 + lg7
            + out13i + out13j + out13k + out13l)
    ck("もう無い名乗りが出ていない", GONE_H not in gout, "無し")
    ck("入れ直しの名乗りも出ていない", G_NEW not in gout, "無し")
    ck("書類IDも生では出ていない",
       G_D1 not in gout and G_D2 not in gout and G_PUT not in gout, "無し")

    print("\n[14] **対照の足を1本ずつ抜く。抜いたら 2 で止まる**")
    # 本物の書き方（`python ＜名前＞.py`）で、別のプロセスとして回す。
    # 同じプロセスで環境変数を立てると、前の回の状態が残る
    for brk, why in (("pick", "通してはいけない人まで選ぶ"),
                     ("carry", "絵文字と呼び名を送り忘れる"),
                     ("diff", "欄が消えても文句を言わない"),
                     ("write", "下見で書けてしまう")):
        env = dict(os.environ, BREAK=brk, ARGS="{}",
                   BQ_PROJECT_ID="characters-touch-selftest")
        r = subprocess.run(
            [sys.executable, "-c",
             "import sys; sys.path.insert(0, %r)\n"
             "import characters_touch as ct\n"
             "bad = ct.run_control()\n"
             "print('\\n'.join(bad))\n"
             "sys.exit(2 if bad else 0)\n" % HERE],
            capture_output=True, text=True, env=env, timeout=60)
        ck(f"BREAK={brk}（{why}）→ 2 で止まる", r.returncode == 2,
           f"終了コード {r.returncode}")
        ck(f"BREAK={brk} の理由が出る", bool(r.stdout.strip()),
           len(r.stdout.strip().splitlines()))

    print("\n[15] 抜いた足で、本物の `main()` も 2 で止まる")
    os.environ["BREAK"] = "diff"
    try:
        out15, code15, client15, api15 = run(make_store())
    finally:
        os.environ.pop("BREAK", None)
    ck("終了コード 2", code15 == 2, code15)
    ck("**本物の数字を1つも出していない**", "図鑑（はじめ）" not in out15,
       "出していない" if "図鑑（はじめ）" not in out15 else "出してしまった")
    ck("Firestore を1回も読んでいない", client15.reads == 0, client15.reads)
    ck("何も書いていない", client15.writes == 0 and not api15.calls,
       client15.writes)

    print()
    if FAILED:
        print(f"✕ {len(FAILED)} 件落ちた: {', '.join(FAILED)}")
        raise SystemExit(1)
    print("○ ぜんぶ通った")


if __name__ == "__main__":
    main()
