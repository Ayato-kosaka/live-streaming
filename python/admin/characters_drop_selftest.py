"""偽の Firestore・偽の退避で、`characters_drop` を**実際に動かして確かめる。**

    python3 python/admin/characters_drop_selftest.py

**本番には1バイトも出ない。** Firestore も BigQuery も資格情報も要らない。

## なぜ、これを書いたか

**消すのは戻らない。** `firestore_delete.py` の頭にこう書いてある——
「退避があっても、『戻せるから』では縛りを緩めない。**戻すには『消えた』と
気づく必要がある**」。図鑑は103人あって、1人減ったことを毎日数えている人は
いない。

だから、この道具の守りは**消す前に全部効いていないと意味がない。**
落ちてから直すのでは遅い。

## 確かめるもの

  1. **下見では1件も消さない**
  2. **絵文字が合わなければ、何も消さずに 2**（照合）
  3. **同じ絵文字の人が2人いたら、何も消さずに 2**（1人に決まらない）
  4. **退避に同じ指紋の写しが無ければ、何も消さずに 2**
  5. **退避にはあるが中身が変わっていたら、何も消さずに 2**
     （「取れている」と「いまのが取れている」は別）
  6. `apply` で**ちょうど1人**消えて、人数が1だけ減る
  7. 置き場の絵は消さない（消しに行く呼び出しが1回も無い）
  8. 出力に名前もチャンネルIDも書類IDも1文字も出ない
  9. **対照**——守りを1本ずつ抜くと、その足だけが落ちる

## 5 が本命

4（退避に1件も無い）は分かりやすいが、本当に怖いのは **「3日前のは
取れているが、そのあと呼び名を足した」**ほう。件数だけ見ると緑になって、
戻したときに違うものが出てくる。だから指紋で見る。
"""

import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

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

os.environ.setdefault("BQ_PROJECT_ID", "characters-drop-selftest")

import characters_drop as dp  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backup import codec  # noqa: E402

# ---------------------------------------------------------------- 偽の中身

AT = chr(64)


def cid(tag: str) -> str:
    """偽のチャンネルID。**本物の形から1文字ずらしてある。**"""
    return "UC" + (tag + "0123456789abcdefghijk")[:21]


CH = {"gone": cid("gone"), "stay": cid("stay")}

NAME = {
    "gone": AT + "sayonara",
    "stay": AT + "nokoruhito",
    "alias": "のこるひと",
}

DOC = {k: f"{i}" + "0123456789abcdef" * 2 for i, k in enumerate(
    ["gone", "stay", "twin"])}

EMOJI = {"gone": "🐟", "stay": "🐰", "twin": "🐟"}   # twin は gone と同じ絵文字

#: 置き場の絵。**消さない**ことを数えるために持たせる
IMAGES = {
    "plain": {"url": "https://example.invalid/full.webp",
              "sizes": {"128": "https://example.invalid/128.webp",
                        "256": "https://example.invalid/256.webp"}},
}


def store(twin: bool = False) -> dict:
    """図鑑の仕込み。

    Args:
        twin: True なら、消す相手と**同じ絵文字**の人をもう1人置く
    """
    out = {
        DOC["gone"]: {
            "emoji": EMOJI["gone"],
            "channelName": NAME["gone"],
            "aliases": [],
            "channelId": CH["gone"],
            "images": IMAGES,
        },
        DOC["stay"]: {
            "emoji": EMOJI["stay"],
            "channelName": NAME["stay"],
            "aliases": [NAME["alias"]],
            "channelId": CH["stay"],
        },
    }
    if twin:
        out[DOC["twin"]] = {"emoji": EMOJI["twin"], "channelName": "",
                            "aliases": []}
    return out


# ------------------------------------------------------- 偽の Firestore


class Snap:
    """DocumentSnapshot のかわり。"""

    def __init__(self, client, key, data):
        self.id = key
        self.exists = data is not None
        self._data = dict(data or {})

    def to_dict(self):
        return dict(self._data)


class DocRef:
    """DocumentReference のかわり。**書く口は本物どおり生やしておく。**"""

    def __init__(self, client, key):
        self.client, self.key = client, key

    def get(self):
        return Snap(self.client, self.key, self.client.docs.get(self.key))

    def delete(self):
        self.client.deletes.append(self.key)
        self.client.docs.pop(self.key, None)

    def update(self, data):
        self.client.writes += 1

    def set(self, data, **kw):
        self.client.writes += 1


class Col:
    """CollectionReference のかわり。"""

    def __init__(self, client):
        self.client = client

    def document(self, key):
        return DocRef(self.client, key)

    def stream(self):
        self.client.reads += 1
        return iter([Snap(self.client, k, v)
                     for k, v in list(self.client.docs.items())])


class Fake:
    """偽の Firestore。消した書類IDと、書かれた回数を覚える。"""

    def __init__(self, docs):
        self.docs = docs
        self.reads = 0
        self.writes = 0
        self.deletes: list = []

    def collection(self, name):
        assert name == dp.CHARACTERS
        return Col(self)


# ---------------------------------------------------------------- 偽の退避


def fake_backup(docs: dict, mode: str):
    """退避に問い合わせる関数のかわり。

    Args:
        docs: 図鑑の仕込み
        mode: `ok`（同じ指紋がある）/ `none`（1件も無い）/
              `stale`（あるが中身が違う）
    """
    def ask(doc: str) -> list:
        if mode == "none":
            return []
        data = dict(docs.get(doc) or {})
        if mode == "stale":
            # **そのあと呼び名を足した、という形。** 件数は同じだが指紋が違う
            data = {**data, "aliases": ["あとから足した呼び名"]}
        return [{"taken_at": "2026-09-22 22:00:00+00:00",
                 "digest": codec.digest(doc, data)}]
    return ask


# ---------------------------------------------------------------- 確かめる

FAILED: list = []


def ck(name: str, cond: bool, got) -> None:
    mark = "○" if cond else "✕"
    print(f"    {mark} {name}: {got}")
    if not cond:
        FAILED.append(name)


def run(docs: dict, doc: str, emoji: str, apply: bool = False,
        mode: str = "ok", brk: str = "") -> tuple:
    """`characters_drop.main()` を1回通す。

    Returns:
        (その回の出力, 返り値, 偽の Firestore)
    """
    client = Fake(docs)
    was = (dp.db, dp._ask_backup)
    dp.db = lambda: client
    dp._ask_backup = fake_backup(docs, mode)

    a = {"doc": doc, "emoji": emoji}
    if apply:
        a["apply"] = True
    os.environ["ARGS"] = json.dumps(a)
    if brk:
        os.environ["BREAK"] = brk
    else:
        os.environ.pop("BREAK", None)

    here = BUF.tell()
    try:
        code = dp.main()
    except SystemExit as e:
        code = e.code or 0
    finally:
        (dp.db, dp._ask_backup) = was
        os.environ.pop("BREAK", None)
    return BUF.getvalue()[here:], code, client


def main() -> None:
    os.environ["GITHUB_ACTIONS"] = "true"   # 公開の場として回す

    print("[1] 下見 —— 1件も消さない")
    out, code, client = run(store(), DOC["gone"], EMOJI["gone"])
    ck("返り値 0", code == 0, code)
    ck("消していない", not client.deletes, len(client.deletes))
    ck("書いてもいない", client.writes == 0, client.writes)
    ck("これから消すのが1人だと数えている",
       "これから消すのは 1人です" in out, "数えている")
    ck("図鑑の人数を出している", "いま 2人" in out, "出している")

    print("\n[2] 絵文字が合わなければ、何も消さずに 2")
    out, code, client = run(store(), DOC["gone"], EMOJI["stay"], apply=True)
    ck("返り値 2", code == 2, code)
    ck("消していない", not client.deletes, len(client.deletes))

    print("\n[3] 同じ絵文字の人が2人いたら、何も消さずに 2")
    out, code, client = run(store(twin=True), DOC["gone"], EMOJI["gone"],
                            apply=True)
    ck("返り値 2", code == 2, code)
    ck("消していない", not client.deletes, len(client.deletes))
    ck("何人いるか出している", "🐟 の人は図鑑に 2人" in out, "出している")

    print("\n[4] 退避に1件も無ければ、何も消さずに 2")
    out, code, client = run(store(), DOC["gone"], EMOJI["gone"], apply=True,
                            mode="none")
    ck("返り値 2", code == 2, code)
    ck("消していない", not client.deletes, len(client.deletes))

    print("\n[5] **退避にはあるが、中身が変わっていたら 2**")
    out, code, client = run(store(), DOC["gone"], EMOJI["gone"], apply=True,
                            mode="stale")
    ck("返り値 2", code == 2, code)
    ck("消していない", not client.deletes, len(client.deletes))
    ck("中身が違うと書いている", "中身が違います" in out, "書いている")

    print("\n[6] apply —— ちょうど1人消えて、人数が1だけ減る")
    docs = store()
    out, code, client = run(docs, DOC["gone"], EMOJI["gone"], apply=True)
    ck("返り値 0", code == 0, code)
    ck("消したのは1件だけ", client.deletes == [DOC["gone"]],
       len(client.deletes))
    ck("残っているのは1人", list(docs) == [DOC["stay"]], len(docs))
    ck("人数を出している", "2人 → 1人" in out, "出している")
    ck("消えたことを引き直して確かめている", "1人 消しました" in out,
       "確かめている")

    print("\n[7] 置き場の絵は消さない")
    ck("消さないと書いている", "**消しません。**" in out, "書いている")
    ck("実体の数を数えている", "実体 3件" in out, "数えている")

    print("\n[8] 名前もチャンネルIDも書類IDも1文字も出ていない")
    whole = BUF.getvalue()
    leaked = [k for k, v in NAME.items() if v and v in whole]
    ck("出力に名前が無い", not leaked, leaked or "無し")
    ck("チャンネルIDが出ていない", not any(v in whole for v in CH.values()),
       "無し" if not any(v in whole for v in CH.values()) else "出ている")
    ck("書類IDが出ていない", not any(v in whole for v in DOC.values()),
       "無し" if not any(v in whole for v in DOC.values()) else "出ている")

    print("\n[9] 対照 —— 守りを1本ずつ抜くと、その足だけが落ちる")

    docs = store()
    _, code, client = run(docs, DOC["gone"], EMOJI["stay"], apply=True,
                          brk="emoji")
    ck("BREAK=emoji で、合わない絵文字でも消えてしまう",
       code == 0 and client.deletes == [DOC["gone"]],
       f"返り値 {code} / 消した {len(client.deletes)}件")

    docs = store(twin=True)
    _, code, client = run(docs, DOC["gone"], EMOJI["gone"], apply=True,
                          brk="one")
    ck("BREAK=one で、同じ絵文字が2人でも消えてしまう",
       code == 0 and client.deletes == [DOC["gone"]],
       f"返り値 {code} / 消した {len(client.deletes)}件")

    docs = store()
    _, code, client = run(docs, DOC["gone"], EMOJI["gone"], apply=True,
                          mode="none", brk="backup")
    ck("BREAK=backup で、退避が無くても消えてしまう",
       code == 0 and client.deletes == [DOC["gone"]],
       f"返り値 {code} / 消した {len(client.deletes)}件")

    docs = store()
    _, code, client = run(docs, DOC["gone"], EMOJI["gone"], brk="write")
    ck("BREAK=write で、下見なのに消えてしまう",
       client.deletes == [DOC["gone"]], f"消した {len(client.deletes)}件")

    print()
    if FAILED:
        print(f"✕ {len(FAILED)} 件落ちた: {', '.join(FAILED)}")
        raise SystemExit(1)
    print("○ ぜんぶ通った")


if __name__ == "__main__":
    main()
