"""偽の Firestore・偽の YouTube・偽の口で、
`characters_handle` を**実際に動かして確かめる。**

    python3 python/admin/characters_handle_selftest.py

**本番には1バイトも出ない。** Firestore も YouTube も口も資格情報も要らない。

## なぜ、これを書いたか

この道具が間違えたときに壊れるのは、**公開の面に出る誰かの絵。**
別の人の書類に名乗りを入れると、その人のカードに他人の絵が乗る。
そして**それは赤くならない。** 出てから「これ私じゃない」と言われて
初めて分かる（`characters_link_selftest.py` と同じ理由）。

しかもこの道具は、`characters_link` と違って**1人ずつ名指しで**書く。
「決まらないものは書かない」という逃げ場が無いので、**指した先が合って
いるか**を、書く前に見る守りのほうが重くなる。

## 確かめるもの

  1. **下見では、口を1回も叩かない・Firestore に1回も書かない**
  2. **絵文字が合わなければ、何も書かずに 2**（照合）
  3. **名乗りが1つの channelId に決まらなければ、何も書かずに 2**
  4. **その channelId を別の人が持っていたら、何も書かずに 2**
  5. `apply` で、**口が叩かれて**鍵と `channelId` が入る
  6. **機械が当てた channelId と食い違ったら、名乗りのほうへ入れ直す**
     （口は埋まっている欄に触らないので、ここを見ないと古いIDが残る）
  7. 入ったかを**引く側の口**で確かめている
  8. 出力に名前も呼び名もチャンネルIDも書類IDも1文字も出ない
  9. **対照**——守りを1本ずつ抜くと、その足だけが落ちる

## 6 が本命

#553 の4人には、機械が表示名の完全一致で当てたIDが**すでに入っている。**
口（`POST /characters/{id}`）は「すでに入っている書類には触らない」ので、
**口に頼むだけでは古いIDが残る。** あやとの名乗りを正にすると決めた以上、
そこを見ないと「入れたのに直っていない」が静かに残る。
"""

import io
import json
import os
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

# `_fs` が読む `config.py` は、この環境変数が無いと import の時点で落ちる。
# 偽物しか触らないので**本物の名前は要らない**
os.environ.setdefault("BQ_PROJECT_ID", "characters-handle-selftest")

import characters_handle as ch  # noqa: E402
import characters_link as cl  # noqa: E402

# ---------------------------------------------------------------- 偽の中身

# ハンドルの印。**字として並べて書かない**（`characters_link_selftest` と同じ。
# `tools/logident.py` が「ハンドルが出ている」と数える形にしない）
AT = chr(64)


def cid(tag: str) -> str:
    """偽のチャンネルID。**本物の形から1文字ずらしてある。**"""
    return "UC" + (tag + "0123456789abcdefghijk")[:21]


CH = {
    "yt": cid("yt"),        # 名乗りから YouTube が返すID
    "old": cid("old"),      # 機械が当てて、すでに入っているID（食い違い）
    "owned": cid("owned"),  # **別の人がもう持っている**ID
}

NAME = {
    "handle": AT + "tsukimidango",     # 入れる名乗り
    "title": "つきみだんご",            # YouTube が返す表示名
    "alias": "だんごさん",              # もともと入っている呼び名
    "other": AT + "hokanohito",        # 別の人の名乗り
    "nobody": AT + "dokonimoinai",     # YouTube が知らない名乗り
}

DOC = {k: f"{i}" + "0123456789abcdef" * 2 for i, k in enumerate(
    ["blank", "clash", "other"])}

EMOJI = {"blank": "🐰", "clash": "🐟", "other": "🐢"}

#: 偽の YouTube。ハンドルの鍵 → （ID, 表示名）
KNOWN = {cl.norm(NAME["handle"]): (CH["yt"], NAME["title"])}


def store() -> dict:
    """図鑑の仕込み。

    - blank … `channelId` が無い。**口が入れる**
    - clash … 機械が当てたIDが入っている。**名乗りと食い違う**
    - other … `CH["owned"]` をもう持っている人
    """
    return {
        DOC["blank"]: {
            "emoji": EMOJI["blank"],
            "channelName": "",
            "aliases": [NAME["alias"]],
            "channelKeys": [],
            "lookupKeys": cl.src_keys(NAME["alias"]),
        },
        DOC["clash"]: {
            "emoji": EMOJI["clash"],
            "channelName": "",
            "aliases": [],
            "channelKeys": [],
            "lookupKeys": [],
            "channelId": CH["old"],
        },
        DOC["other"]: {
            "emoji": EMOJI["other"],
            "channelName": NAME["other"],
            "aliases": [],
            "channelKeys": cl.src_keys(NAME["other"]),
            "lookupKeys": cl.src_keys(NAME["other"]),
            "channelId": CH["owned"],
        },
    }


# ------------------------------------------------------- 偽の Firestore


class Snap:
    """DocumentSnapshot のかわり。"""

    def __init__(self, client, key, data):
        self.id = key
        self.exists = data is not None
        self.reference = DocRef(client, key)
        self._data = dict(data or {})

    def to_dict(self):
        return dict(self._data)


class DocRef:
    """DocumentReference のかわり。**書く口は本物どおり生やしておく。**"""

    def __init__(self, client, key):
        self.client, self.key = client, key

    def get(self):
        return Snap(self.client, self.key, self.client.docs.get(self.key))

    def update(self, data):
        self.client.writes += 1
        self.client.wrote.append((self.key, dict(data)))
        self.client.docs[self.key].update(data)

    def set(self, data, **kw):
        self.client.writes += 1

    def delete(self):
        self.client.writes += 1


class Query:
    """Query のかわり。この道具が使うのは `where` / `limit` / `get`。"""

    def __init__(self, client, rows):
        self.client, self.rows = client, rows

    def where(self, field, op, value):
        assert op == "=="
        return Query(self.client,
                     [k for k in self.rows
                      if self.client.docs[k].get(field) == value])

    def limit(self, n):
        return Query(self.client, self.rows[:n])

    def get(self):
        self.client.reads += 1
        return [Snap(self.client, k, self.client.docs[k]) for k in self.rows]

    def stream(self):
        return iter(self.get())

    def document(self, key):
        return DocRef(self.client, key)


class Fake:
    """偽の Firestore。読んだ回数と、書かれた回数と、中身を覚える。"""

    def __init__(self, docs):
        self.docs = docs
        self.reads = 0
        self.writes = 0
        self.wrote: list = []

    def collection(self, name):
        assert name == ch.CHARACTERS
        return Query(self, list(self.docs))


# ------------------------------------------------------------ 偽の YouTube


def fake_youtube(asked: list):
    """`characters_link.youtube_finder` と同じ形を返す。"""

    def finder(on: bool = True):
        tally = {"訊いた": 0, "見つかった": 0, "訊けなかった": 0}

        def ask(handles):
            got = set()
            for h in handles:
                asked.append(h)
                tally["訊いた"] += 1
                hit = KNOWN.get(h)
                if hit:
                    tally["見つかった"] += 1
                    got.add(hit[0])
            return got

        return ask, tally

    return finder


# ---------------------------------------------------------------- 偽の口


def fake_owner(client, calls: list):
    """`POST /characters/{id}` を、本物と同じ決まりで真似る。

    真似るのは `functions/src/islandCharacter.ts` の5つ。
    **`channelId` は空のときだけ入れる**——ここを本物どおりにしないと、
    「食い違ったら入れ直す」の確かめが空回りする。
    """

    def call(method, path, token, body=None):
        calls.append((method, path, dict(body or {})))
        assert method == "POST"
        key = path.rsplit("/", 1)[-1]
        v = client.docs[key]
        name = str(body.get("channelName") or "")
        aliases = [a for a in (body.get("aliases") or []) if a]
        hit = KNOWN.get(cl.norm(name))
        state = "skipped"
        if hit:
            title = hit[1]
            state = "added"
            if cl.norm(title) in cl.src_keys(name) + [
                    k for a in aliases for k in cl.src_keys(a)]:
                state = "already"
            else:
                aliases = aliases + [title]
        v["channelName"] = name
        v["emoji"] = str(body.get("emoji") or "")
        v["aliases"] = aliases
        v["channelKeys"] = cl.src_keys(name) if name else []
        v["lookupKeys"] = [k for s in [name, *aliases] if s
                           for k in cl.src_keys(s)]
        # **空のときだけ。** 本物と同じ（埋まっている書類には触らない）
        if not v.get("channelId") and hit:
            v["channelId"] = hit[0]
        client.writes += 1
        return {"character": {"id": key}, "named": {"state": state, "why": ""}}

    return call


class FakeRes:
    """`requests.get` の返事のかわり。"""

    def __init__(self, payload):
        self.status_code = 200
        self._payload = payload

    def json(self):
        return self._payload


def fake_requests(client):
    """読むだけの口（`GET /characters/lookup`）を真似る。

    本物と同じく **`lookupKeys` に完全一致で、当たったのが1人のときだけ**返す。
    """

    class R:
        @staticmethod
        def get(url, params=None, timeout=None):
            key = cl.norm((params or {}).get("alias"))
            hits = [k for k, v in client.docs.items()
                    if key and key in (v.get("lookupKeys") or [])]
            if len(hits) != 1:
                return FakeRes({"character": None})
            return FakeRes({"character": {"id": hits[0]}})

    return R


# ---------------------------------------------------------------- 確かめる

FAILED: list = []


def ck(name: str, cond: bool, got) -> None:
    mark = "○" if cond else "✕"
    print(f"    {mark} {name}: {got}")
    if not cond:
        FAILED.append(name)


def run(docs: dict, doc: str, handle: str, emoji: str, apply: bool = False,
        brk: str = "") -> tuple:
    """`characters_handle.main()` を1回通す。

    Returns:
        (その回の出力, 返り値, 偽の Firestore, 口を叩いた記録, 訊いたハンドル)
    """
    client = Fake(docs)
    calls: list = []
    asked: list = []
    was = (ch.db, cl.youtube_finder, ch.owner_token, ch.call, ch.requests)
    ch.db = lambda: client
    cl.youtube_finder = fake_youtube(asked)
    ch.owner_token = lambda c: "token"
    ch.call = fake_owner(client, calls)
    ch.requests = fake_requests(client)

    a = {"doc": doc, "handle": handle, "emoji": emoji}
    if apply:
        a["apply"] = True
    os.environ["ARGS"] = json.dumps(a)
    if brk:
        os.environ["BREAK"] = brk
    else:
        os.environ.pop("BREAK", None)

    here = BUF.tell()
    try:
        code = ch.main()
    except SystemExit as e:
        code = e.code or 0
    finally:
        (ch.db, cl.youtube_finder, ch.owner_token, ch.call,
         ch.requests) = was
        os.environ.pop("BREAK", None)
    return BUF.getvalue()[here:], code, client, calls, asked


def main() -> None:
    os.environ["GITHUB_ACTIONS"] = "true"   # 公開の場として回す

    print("[1] 下見 —— 口も Firestore も1回も叩かない")
    out, code, client, calls, asked = run(
        store(), DOC["blank"], NAME["handle"], EMOJI["blank"])
    ck("返り値 0", code == 0, code)
    ck("口を叩いていない", not calls, len(calls))
    ck("Firestore に書いていない", client.writes == 0, client.writes)
    ck("YouTube には訊いている（引けるかは下見でも見る）",
       asked == [cl.norm(NAME["handle"])], len(asked))

    print("\n[2] 絵文字が合わなければ、何も書かずに 2")
    out, code, client, calls, _ = run(
        store(), DOC["blank"], NAME["handle"], EMOJI["clash"], apply=True)
    ck("返り値 2", code == 2, code)
    ck("口を叩いていない", not calls, len(calls))
    ck("Firestore に書いていない", client.writes == 0, client.writes)

    print("\n[3] 名乗りが1つに決まらなければ、何も書かずに 2")
    out, code, client, calls, _ = run(
        store(), DOC["blank"], NAME["nobody"], EMOJI["blank"], apply=True)
    ck("返り値 2", code == 2, code)
    ck("口を叩いていない", not calls, len(calls))

    print("\n[4] その channelId を別の人が持っていたら、何も書かずに 2")
    docs = store()
    docs[DOC["other"]]["channelId"] = CH["yt"]      # 名乗りの先を先に取らせる
    out, code, client, calls, _ = run(
        docs, DOC["blank"], NAME["handle"], EMOJI["blank"], apply=True)
    ck("返り値 2", code == 2, code)
    ck("口を叩いていない", not calls, len(calls))

    print("\n[5] apply —— 空いている人に入る")
    docs = store()
    out, code, client, calls, _ = run(
        docs, DOC["blank"], NAME["handle"], EMOJI["blank"], apply=True)
    v = docs[DOC["blank"]]
    ck("返り値 0", code == 0, code)
    ck("口を1回だけ叩いた", len(calls) == 1, len(calls))
    ck("口に渡したのは名乗り・絵文字・呼び名の3つだけ",
       sorted(calls[0][2]) == ["aliases", "channelName", "emoji"],
       sorted(calls[0][2]))
    ck("もとの呼び名を消していない", NAME["alias"] in v["aliases"],
       len(v["aliases"]))
    ck("表示名が呼び名に足された", NAME["title"] in v["aliases"],
       len(v["aliases"]))
    ck("channelKeys に名乗りの鍵が入った",
       all(k in v["channelKeys"] for k in cl.src_keys(NAME["handle"])),
       len(v["channelKeys"]))
    ck("lookupKeys にも入った",
       all(k in v["lookupKeys"] for k in cl.src_keys(NAME["handle"])),
       len(v["lookupKeys"]))
    ck("channelId が入った", v.get("channelId") == CH["yt"], "入った"
       if v.get("channelId") == CH["yt"] else "入っていない")
    ck("引く口でこの人が返る", "○ この人が返りました" in out, "確かめている")

    print("\n[6] **食い違ったら、名乗りのほうへ入れ直す**")
    docs = store()
    out, code, client, calls, _ = run(
        docs, DOC["clash"], NAME["handle"], EMOJI["clash"], apply=True)
    v = docs[DOC["clash"]]
    ck("返り値 0", code == 0, code)
    ck("食い違いだと書いている", "食い違" in out, "書いている")
    ck("channelId が名乗りのほうになった", v.get("channelId") == CH["yt"],
       "名乗りのほう" if v.get("channelId") == CH["yt"] else "**古いまま**")
    ck("入れ直したことをログに出している",
       "入れ直しました" in out, "出している")

    print("\n[7] 名前もチャンネルIDも書類IDも1文字も出ていない")
    leaked = [k for k, v in NAME.items() if v and v in out]
    ck("出力に名前が無い", not leaked, leaked or "無し")
    ck("チャンネルIDが出ていない", not any(v in out for v in CH.values()),
       "無し" if not any(v in out for v in CH.values()) else "出ている")
    ck("書類IDが出ていない", not any(v in out for v in DOC.values()),
       "無し" if not any(v in out for v in DOC.values()) else "出ている")

    print("\n[8] 対照 —— 守りを1本ずつ抜くと、その足だけが落ちる")

    # emoji: 違う絵文字を渡しても止まらなくなる
    _, code, _, calls, _ = run(store(), DOC["blank"], NAME["handle"],
                               EMOJI["clash"], apply=True, brk="emoji")
    ck("BREAK=emoji で、合わない絵文字でも通ってしまう",
       code == 0 and len(calls) == 1, f"返り値 {code} / 口 {len(calls)}回")

    # yt: 見つからない名乗りでも止まらなくなる
    _, code, _, calls, _ = run(store(), DOC["blank"], NAME["nobody"],
                               EMOJI["blank"], brk="yt")
    ck("BREAK=yt で、見つからない名乗りでも通ってしまう", code == 0,
       f"返り値 {code}")

    # taken: 別の人が持っているIDでも止まらなくなる
    docs = store()
    docs[DOC["other"]]["channelId"] = CH["yt"]
    _, code, _, calls, _ = run(docs, DOC["blank"], NAME["handle"],
                               EMOJI["blank"], brk="taken")
    ck("BREAK=taken で、取られているIDでも通ってしまう", code == 0,
       f"返り値 {code}")

    # write: 下見のつもりで口が叩かれる
    _, code, client, calls, _ = run(store(), DOC["blank"], NAME["handle"],
                                    EMOJI["blank"], brk="write")
    ck("BREAK=write で、下見なのに口が叩かれる", len(calls) == 1,
       f"口 {len(calls)}回")

    print()
    if FAILED:
        print(f"✕ {len(FAILED)} 件落ちた: {', '.join(FAILED)}")
        raise SystemExit(1)
    print("○ ぜんぶ通った")


if __name__ == "__main__":
    main()
