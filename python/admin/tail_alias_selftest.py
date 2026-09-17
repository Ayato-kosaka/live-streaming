"""偽の Firestore と偽の口で、`tail_alias` を**実際に動かして確かめる。**

    python3 python/admin/tail_alias_selftest.py

**本番には1バイトも出ない。** Firestore も資格情報も口も要らない。

## なぜ、これを書いたか

呼び名を1つ足すと**引ける字が増える。** 増えるということは、
**別人にも当たりやすくなる**ということで、外したときに壊れるのは
**配信の画面に出る誰かの絵**。しかも赤くならない。出てから
「この人、私じゃない」と言われて初めて分かる。

だから、**足さない側**を先に固定する。

  - その字を**他の人がもう持っている** → 足さない
  - **2人のしっぽを落とすと同じ字になる** → どちらにも足さない
  - しっぽではない字（`-chan`・西暦・落とすと短すぎる） → そもそも作らない

「足せた」ほうだけを見て通すと、**何にでも足す道具**が通ってしまう。

しっぽの見分けそのもの（どの形を落とすか）と、
**落とした字で本当に当たるようになるか**は `python/name_tail_selftest.py`
が本物の OBS（`app/alertbox/matching.utils.ts`）まで動かして見ている。
ここが見るのは**図鑑ぜんぶを見渡して、足す先を決めるところ。**

## 確かめるもの

  1. しっぽ付きの人に、落とした字を1件足す
  2. **他の人の鍵とぶつかる → 足さない**（数と指紋を出す。名前は出さない）
  3. **2人が同じ字になる → どちらにも足さない**
  4. しっぽではない形（`-chan`・西暦・短すぎる）→ 足さない
  5. **`apply` 無しでは、Firestore にも口にも1回も書かない**
  6. `aliases` が上限のとき足さない
  7. 送る中身が、いま入っている `channelName` と `emoji` を乗せ直している。
     **`lookupKeys` を Python 側で作って送っていない。** 絵も送っていない
  8. 出力に名前も呼び名も書類IDも1文字も出ない
  8. **足したあと、口と OBS の両方で当たる。**（`alertbox_names` を
     同じ偽の名簿に当てて、食い違いが 0 で、当たる人数が 1／1 になること）
  9. 図鑑が1件も返らないとき、**0 と言わずに 2 で落ちる**

## 7 が本命の半分

足せたかどうかは 1 で見えるが、**足したせいで別の欄が消える**のは
ここでしか見えない。口は `channelName` / `emoji` / `aliases` を
送られたぶんで置き換える（`islandCharacter.ts` の POST）ので、
呼び名を1つ足すつもりで絵文字を消せてしまう。
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

os.environ.setdefault("BQ_PROJECT_ID", "tail-alias-selftest")

import tail_alias as ta  # noqa: E402
from _fs import readonly  # noqa: E402

# ---------------------------------------------------------------- 偽の中身
#
# **本物の名前もハンドルも1つも使わない。** 形だけ本物に似せてある。

NAME = {
    # しっぽ付き。落とすと足せる
    "d4": "@ぬまのぬし1234",       # 数字ちょうど4桁
    "h3": "@Kuroneko-t2f",         # `-` ＋ 3字（英字と数字が混じる）
    "h5": "@keiki-a1b2c",          # `-` ＋ 5字
    # しっぽではない
    "chan": "@mikan-chan",         # 本人の字
    "year": "@sora2024",           # 西暦に見える
    "short": "@たこ1234",           # 落とすと2字
    # 落とした字を、別の人がもう持っている
    "taken": "@ひだまり1234",
    "holder": "ひだまり",
    # 2人が同じ字になる
    "same1": "@こもれび1234",
    "same2": "@こもれび-a1b",
    # 呼び名が上限まで入っている人
    "full": "@まんぷく1234",
}
FULL_ALIASES = [f"よびな{i:02d}" for i in range(ta.MAX_ALIASES)]

DOC = {k: f"{i}" + "0123456789abcdef" * 2 for i, k in enumerate(
    ["d4", "h3", "h5", "chan", "year", "short",
     "taken", "holder", "same1", "same2", "full"])}

EMOJI = {"d4": "🐟", "h3": "🐈", "h5": "🍰", "chan": "🍊", "year": "🌅",
         "short": "🐙", "taken": "🌻", "holder": "🦆", "same1": "🌱",
         "same2": "🌿", "full": "🍩"}

# 足せるはずの人。**手で数を書かず、ここから数える**
CAN_ADD = ["d4", "h3", "h5"]
# 足してはいけない人
NO_ADD = ["chan", "year", "short", "taken", "holder", "same1", "same2",
          "full"]


def char(key, aliases=None) -> dict:
    """図鑑の1人ぶん。**鍵は `keys_of` で作る**（口と同じ作り方）。"""
    name = NAME[key]
    aliases = list(aliases or [])
    return {
        "channelName": name,
        "emoji": EMOJI[key],
        "aliases": aliases,
        "lookupKeys": ta.keys_of([name] + aliases),
        "channelKeys": ta.keys_of([name]),
        # 絵。**送っていないことを見るために、入れておく**
        "images": {"plain": {"full": "plain.webp"}},
    }


def make_store() -> dict:
    chars = {DOC[k]: char(k) for k in CAN_ADD + NO_ADD if k != "full"}
    chars[DOC["full"]] = char("full", FULL_ALIASES)
    return {"islandCharacter": chars}


# ------------------------------------------------------- 偽の Firestore


class Snap:
    """DocumentSnapshot のかわり。`select` で絞ったぶんだけ返す。"""

    def __init__(self, key, data, fields, exists=True):
        self.id = key
        self.exists = exists
        self._data = {k: v for k, v in (data or {}).items()
                      if fields is None or k in fields}

    def to_dict(self):
        return dict(self._data)


class Query:
    """Query のかわり。この道具が使うのは `select` / `limit` だけ。"""

    def __init__(self, client, col, fields=None, cap=None):
        self.client, self.col = client, col
        self.fields, self.cap = fields, cap

    def select(self, fields):
        # **本物と同じように、字を渡されたら1文字ずつの欄として扱う。**
        # ここを親切にすると、`select("name")` の踏み抜きが手元で通る
        return Query(self.client, self.col, list(fields), self.cap)

    def limit(self, n):
        return Query(self.client, self.col, self.fields, n)

    def _rows(self):
        self.client.reads += 1
        out = [Snap(k, v, self.fields)
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


class FakeApi:
    """偽の口。**叩かれたものをそのまま覚えておく。**"""

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
            # **口（`islandCharacter.ts` の POST）と同じ書き方をする。**
            # 送られた欄で置き換えて、**鍵はこちら（＝サーバー）が焼き直す。**
            # ここを「返事だけ返す」にすると、足したあとに食い違いが
            # 0 になるかを見られない
            doc = path.rsplit("/", 1)[-1]
            v = self.store["islandCharacter"].setdefault(doc, {})
            v["channelName"] = (body or {}).get("channelName") or ""
            v["emoji"] = (body or {}).get("emoji") or ""
            v["aliases"] = list((body or {}).get("aliases") or [])
            v["channelKeys"] = ta.keys_of(
                [v["channelName"]] if v["channelName"] else [])
            v["lookupKeys"] = ta.keys_of(
                [x for x in [v["channelName"]] + v["aliases"] if x])
            return {"character": {"id": doc}}
        raise AssertionError(f"偽の口が知らない道: {method} {path}")

    def posts(self):
        return [(p.rsplit("/", 1)[-1], b)
                for m, p, b in self.calls if m == "POST"]


# ---------------------------------------------------------------- 確かめる

FAILED: list = []


def ck(name: str, cond: bool, got) -> None:
    print(f"    {'○' if cond else '✕'} {name}: {got}")
    if not cond:
        FAILED.append(name)


def run(store: dict, apply: bool = False):
    """`tail_alias.main()` を1回通す。"""
    client = Fake(store)
    api = FakeApi(store)
    was = (ta.db, ta.readonly, ta.call, ta.owner_token)
    ta.db = lambda: client
    ta.readonly = readonly
    ta.call = api
    ta.owner_token = lambda c: "（偽の札）"
    a = {"apply": True} if apply else {}
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
    line = next((x for x in out.splitlines() if needle in x), "")
    return "".join(c for c in line.rsplit("…", 1)[-1] if c.isdigit())


def main() -> None:
    os.environ["GITHUB_ACTIONS"] = "true"   # 公開の場として回す

    print("[1] 下見 —— 仕分けの件数が仕込みどおり")
    out, code, writes, api = run(make_store())
    ck("終了コード 0", code == 0, code)
    # **しっぽ付きと数えられるのは、しっぽを落とせる形の人だけ。**
    # 手で数を書かず、仕込みから数える
    tailed = [k for k in NAME if ta.strip_tail(NAME[k])]
    ck("しっぽ付きの人数", num(out, "しっぽの付いた") == str(len(tailed)),
       f"{num(out, 'しっぽの付いた')}（仕込み {len(tailed)}）")
    ck("他の人の鍵とぶつかる", num(out, "ぶつかる") == "1",
       num(out, "ぶつかる"))
    ck("2人が同じ字になる", num(out, "同じ字") == "2", num(out, "同じ字"))
    ck("呼び名がいっぱい", num(out, "いっぱいで足せない") == "1",
       num(out, "いっぱいで足せない"))
    # **ぶつかって足さない人は、数だけでなく指紋も出す**
    ck("ぶつかって足さない人数", num(out, "ぶつかって足さない人") == "3",
       num(out, "ぶつかって足さない人"))
    ck("指紋を3人ぶん出している",
       out.count("    ぶつかって足さない: ") == 3,
       out.count("    ぶつかって足さない: "))
    ck(f"足す先は {len(CAN_ADD)}人",
       f"足す先: {len(CAN_ADD)}人 / 足す呼び名: {len(CAN_ADD)}件" in out,
       f"{len(CAN_ADD)}人")

    print("\n[2] **下見では、1回も書いていない**")
    ck("Firestore に書かれた回数 0", writes == 0, writes)
    ck("口を1回も叩いていない", not api.calls, len(api.calls))
    ck("下見だと言っている", "1バイトも書いていません" in out, True)

    print("\n[3] apply —— しっぽ付きの人にだけ足す")
    store = make_store()
    out2, code2, writes2, api2 = run(store, apply=True)
    posts = api2.posts()
    sent = dict(posts)
    ck("終了コード 0", code2 == 0, code2)
    ck("Firestore には直に書いていない（口だけ）", writes2 == 0, writes2)
    ck(f"POST は {len(CAN_ADD)}本", len(posts) == len(CAN_ADD), len(posts))
    ck("書いた人数と件数",
       f"書きました: {len(CAN_ADD)}人 / {len(CAN_ADD)}件" in out2,
       f"{len(CAN_ADD)}人")
    for k in CAN_ADD:
        ck(f"{EMOJI[k]} に足した", DOC[k] in sent, DOC[k] in sent)

    print("\n[4] **足してはいけない人には、1本も投げていない**")
    for k in NO_ADD:
        ck(f"{EMOJI[k]} に投げていない", DOC[k] not in sent, DOC[k] in sent)

    print("\n[5] **送った中身**（欄が消える書き方をしていない）")
    body = sent.get(DOC["d4"]) or {}
    # **足す前**の姿。`store` は偽の口が書き換えたあとなので、
    # 仕込みを作り直して比べる（比べる相手が動いていると、何も比べていない）
    was = make_store()["islandCharacter"][DOC["d4"]]
    ck("channelName を乗せ直している",
       body.get("channelName") == was["channelName"],
       "乗せている" if body.get("channelName") else "空で送った")
    ck("emoji を乗せ直している", body.get("emoji") == EMOJI["d4"],
       body.get("emoji") or "空で送った")
    ck("足すのは1件だけ（元の呼び名は残す）",
       body.get("aliases") == was["aliases"] + [
           ta.strip_tail(NAME["d4"])[0]],
       len(body.get("aliases") or []))
    ck("**lookupKeys を Python で作って送っていない**",
       "lookupKeys" not in body and "channelKeys" not in body,
       sorted(body.keys()))
    ck("絵（plain / scene）を送っていない",
       "plain" not in body and "scene" not in body, sorted(body.keys()))
    ck("送る欄は3つだけ",
       all(set(b.keys()) == {"channelName", "emoji", "aliases"}
           for _, b in posts), sorted(body.keys()))

    print("\n[6] 名前も呼び名も書類IDも1文字も出ていない")
    both = out + out2
    leaked = [k for k, v in NAME.items() if v and v in both]
    ck("出力に名前が無い", not leaked, leaked or "無し")
    # `@` を落とした形・しっぽを落とした形も出していないこと
    bare = [k for k, v in NAME.items() if v.lstrip("@") in both]
    ck("`@` を落とした形も出ていない", not bare, bare or "無し")
    bases = [k for k in NAME if ta.strip_tail(NAME[k])
             and ta.strip_tail(NAME[k])[0] in both]
    ck("しっぽを落とした形も出ていない", not bases, bases or "無し")
    ck("呼び名も出ていない", not any(x in both for x in FULL_ALIASES), "無し")
    ck("書類IDも生では出ていない",
       not any(v in both for v in DOC.values()), "無し")

    print("\n[7] 足した**あと**、口と OBS の両方で当たる（食い違い 0）")
    import alertbox_names as an
    base = ta.strip_tail(NAME["d4"])[0]

    def names_run(store):
        """`alertbox_names` を同じ偽の名簿に当てる。"""
        client = Fake(store)
        was = (an.db, an.readonly)
        an.db, an.readonly = (lambda: client), readonly
        os.environ["ARGS"] = json.dumps({"name": base}, ensure_ascii=False)
        here = BUF.tell()
        try:
            an.main()
        finally:
            an.db, an.readonly = was
        return BUF.getvalue()[here:]

    # 対照: **足す前**は、どちらの道でも 0人
    out_before = names_run(make_store())
    ck("足す前は口で 0人", "口（lookupKeys）で当たる人数: 0" in out_before,
       "0人")
    ck("足す前は OBS でも 0人",
       "OBS（生の名前）で当たる人数: 0" in out_before, "0人")
    # `store` は [3] の apply が通ったあとの名簿
    out_after = names_run(store)
    ck("足したあと、口で 1人",
       "口（lookupKeys）で当たる人数: 1" in out_after, "1人")
    ck("足したあと、OBS でも 1人",
       "OBS（生の名前）で当たる人数: 1" in out_after, "1人")
    ck("食い違いは 0 / 0",
       "食い違い: lookupKeys にしか無い 0 人 / 生の名前にしか無い 0 人"
       in out_after, "0 / 0")
    ck("しっぽを落とした形も、この出力に出ていない",
       base not in out_after and base not in out_before, "無し")

    print("\n[8] 図鑑が1件も返らないとき（読めていないのに 0 と言わない）")
    out3, code3, writes3, api3 = run({"islandCharacter": {}})
    ck("終了コード 2 で止まる", code3 == 2, code3)
    ck("**件数を1つも出していない**", "図鑑:" not in out3,
       "出していない" if "図鑑:" not in out3 else "出してしまった")
    ck("何も書いていない", writes3 == 0 and not api3.calls, writes3)

    print()
    if FAILED:
        print(f"✕ {len(FAILED)} 件落ちた: {', '.join(FAILED)}")
        raise SystemExit(1)
    print("○ ぜんぶ通った")


if __name__ == "__main__":
    main()
