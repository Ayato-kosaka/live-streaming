"""偽の Firestore・偽の口・偽の YouTube で、`channel_alias` を**動かして確かめる。**

    python3 python/admin/channel_alias_selftest.py

**本番には1バイトも出ない。ネットにも出ない。** Firestore も資格情報も要らない。

## なぜ、これを書いたか

呼び名を1つ足すと**引ける字が増える。** 増えるということは、
**別人にも当たりやすくなる**ということで、外したときに壊れるのは
**配信の画面に出る誰かの絵**。しかも赤くならない。

しかも今度は、足す字を**外から取ってくる。** 取ってくる道は落ちる。
落ちたことを「名前が無い」と読むと、届かなかっただけの人が
図鑑から静かに外れる（`docs/island-standards.md` §10）。

だから見るのは4つ。**どれか1つでも外れたら、本物に触らずに 2。**

  1. 答えの分かっている仕込みで、**足すべき人に足せる**
  2. **ぶつかる人に足さない**（いちばん危ない）
  3. **取れなかった人を「名前が無い」と混ぜない**
  4. **下見が本当に1バイトも書かない**（走らせる前後で数える）

## 対照の対照

`channel_alias.run_control()` は本番でも毎回回る。**それが本当に
落ちられるのか**を、ここで足を1本ずつ抜いて（`BREAK=`）見る。
「壊し方を4通り当てた」は、4通りが同じ足を折っているなら1通り
（`docs/island-standards.md` §15）。

**その前に「壊していない写しが通ること」を先に見る**（`island-misses.md` #99）。
写しを作る途中で壊れても終了コードは同じなので、そこを見ないと対照にならない。

## 題の読み方も見る

Atom には**動画の題も `<title>`** で入っている。`<entry>` より前で
切らないと、1本目の動画名をその人の名前として足すことになる。
締め出されたときに返る `og:title`（`YouTube`）も、名前として受け取らない。
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

os.environ.setdefault("BQ_PROJECT_ID", "channel-alias-selftest")

import channel_alias as ca  # noqa: E402
from _fs import readonly  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------- 偽の中身
#
# **本物の名前もハンドルもチャンネルIDも1つも使わない。** 形だけ似せてある。

# 書類ID -> (ハンドル, もともとの呼び名, YouTube から返ってくるもの)
PEOPLE = {
    # 足せる人。**チャンネル名はハンドルと別の字**（ここが #509 で外した点。
    # しっぽを落とした形は `naminori` で、チャンネル名は `nami nori`）
    "plain": ("@naminori6229", [], ca.Got(ca.GOT, "nami nori")),
    # 日本語のチャンネル名
    "jp": ("@umibeno1234", [], ca.Got(ca.GOT, "うみべの ひと")),
    # **取れなかった人。** 「名前が無い」に混ぜない
    "blind": ("@todokazu9999", [], ca.Got(ca.BLIND, why="届かない")),
    # チャンネルが消えている
    "gone": ("@kieta0001", [], ca.Got(ca.GONE, why="404")),
    # 取れたが、名前が空
    "empty": ("@karano0002", [], ca.Got(ca.NONE, why="題が空")),
    # **ハンドルと同じ字。** 足しても引ける字が増えない
    "handle": ("@onajiji1234", [], ca.Got(ca.GOT, "onajiji1234")),
    # **もう同じ字を呼び名に持っている**
    "already": ("@motteru0003", ["もってる ひと"],
                ca.Got(ca.GOT, "もってる ひと")),
    # **他の人の鍵とぶつかる**
    "taken": ("@kabuse0001", [], ca.Got(ca.GOT, "かぶせにん")),
    "holder": ("かぶせにん", [], ca.Got(ca.GONE, why="404")),
    # **2人が同じ字になる**
    "same1": ("@futarime0001", [], ca.Got(ca.GOT, "ふたりめ")),
    "same2": ("@futarime0002", [], ca.Got(ca.GOT, "ふたりめ")),
    # 呼び名が上限まで入っている
    "full": ("@manpuku0004", [f"よびな{i:02d}" for i in range(ca.MAX_ALIASES)],
             ca.Got(ca.GOT, "まんぷく ひと")),
    # **channelId を持っていない。** 引きに行きようがない
    "noid": ("@idnashi0005", [], None),
}

DOC = {k: f"{i:x}" + "0123456789abcdef" * 2
       for i, k in enumerate(PEOPLE)}
CID = {k: "UC" + f"{i:02d}" + "channeliddummy00000000"[:20]
       for i, k in enumerate(PEOPLE)}
EMOJI = {k: e for k, e in zip(PEOPLE, "🐚🌊🌫🕳🫙🪞🧺🐡🐟🌱🌿🍩🔑")}

# 足せるはずの人。**手で数を書かず、ここから数える**
CAN_ADD = ["plain", "jp"]
NO_ADD = [k for k in PEOPLE if k not in CAN_ADD]


def make_store() -> dict:
    chars = {}
    for key, (channel, aliases, _got) in PEOPLE.items():
        chars[DOC[key]] = {
            "channelName": channel,
            "emoji": EMOJI[key],
            "aliases": list(aliases),
            "lookupKeys": ca.keys_of([channel] + list(aliases)),
            "channelKeys": ca.keys_of([channel]),
            "channelId": "" if key == "noid" else CID[key],
            # 絵。**送っていないことを見るために、入れておく**
            "images": {"plain": {"full": "plain.webp"}},
        }
    return {"islandCharacter": chars}


def fake_fetch(cid: str) -> "ca.Got":
    """偽の YouTube。**ネットに1回も出ない。**"""
    for key, (_c, _a, got) in PEOPLE.items():
        if CID[key] == cid:
            return got
    raise AssertionError("知らないチャンネルIDを引きに行きました")


# ------------------------------------------------------- 偽の Firestore


class Snap:
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
            # 送られた欄で置き換えて、**鍵はこちら（＝サーバー）が焼き直す**
            doc = path.rsplit("/", 1)[-1]
            v = self.store["islandCharacter"].setdefault(doc, {})
            v["channelName"] = (body or {}).get("channelName") or ""
            v["emoji"] = (body or {}).get("emoji") or ""
            v["aliases"] = list((body or {}).get("aliases") or [])
            v["channelKeys"] = ca.keys_of(
                [v["channelName"]] if v["channelName"] else [])
            v["lookupKeys"] = ca.keys_of(
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
    """`channel_alias.main()` を1回通す。**ネットには出ない。**"""
    client = Fake(store)
    api = FakeApi(store)
    was = (ca.db, ca.readonly, ca.call, ca.owner_token, ca.fetch_one)
    ca.db = lambda: client
    ca.readonly = readonly
    ca.call = api
    ca.owner_token = lambda c: "（偽の札）"
    ca.fetch_one = fake_fetch
    a = {"apply": True} if apply else {}
    os.environ["ARGS"] = json.dumps(a, ensure_ascii=False)
    here = BUF.tell()
    code = 0
    try:
        ca.main()
    except SystemExit as e:
        code = e.code or 0
    finally:
        (ca.db, ca.readonly, ca.call, ca.owner_token, ca.fetch_one) = was
    return BUF.getvalue()[here:], code, client, api


def num(out: str, needle: str) -> str:
    line = next((x for x in out.splitlines() if needle in x), "")
    return "".join(c for c in line.rsplit("…", 1)[-1] if c.isdigit())


def main() -> None:
    os.environ["GITHUB_ACTIONS"] = "true"   # 公開の場として回す
    os.environ.pop("BREAK", None)

    print("[0] **壊していない写しが通る**（対照の対照の、その前）")
    bad = ca.run_control()
    ck("対照4つが通る", not bad, bad or "通った")

    print("\n[1] 下見 —— 仕分けの件数が仕込みどおり")
    out, code, client, api = run(make_store())
    ck("終了コード 0", code == 0, code)
    ck("対照が通ったと言っている", "対照 4つ、通りました" in out, True)
    ck("取れた人数", num(out, "取れた  ") == "8", num(out, "取れた  "))
    ck("**取れなかった**人数", num(out, "取れなかった") == "1",
       num(out, "取れなかった"))
    ck("チャンネルが消えている", num(out, "消えている") == "2",
       num(out, "消えている"))
    ck("名前が空だった", num(out, "名前が空") == "1", num(out, "名前が空"))
    ck("channelId を持っていない", num(out, "channelId を持って") == "1",
       num(out, "channelId を持って"))
    ck("ハンドルと同じ字", num(out, "ハンドルと同じ字") == "1",
       num(out, "ハンドルと同じ字"))
    ck("もう同じ字で引ける", num(out, "もう同じ字で引ける") == "1",
       num(out, "もう同じ字で引ける"))
    ck("他の人の鍵とぶつかる", num(out, "鍵とぶつかる") == "1",
       num(out, "鍵とぶつかる"))
    ck("2人が同じ字になる", num(out, "同じ字になる") == "2",
       num(out, "同じ字になる"))
    ck("呼び名がいっぱい", num(out, "いっぱいで足せない") == "1",
       num(out, "いっぱいで足せない"))
    ck("ぶつかって足さない人数", num(out, "ぶつかって足さない人") == "3",
       num(out, "ぶつかって足さない人"))
    ck("指紋を3人ぶん出している",
       out.count("    ぶつかって足さない: ") == 3,
       out.count("    ぶつかって足さない: "))
    ck(f"足す先は {len(CAN_ADD)}人",
       f"足す先: {len(CAN_ADD)}人 / 足す呼び名: {len(CAN_ADD)}件" in out,
       f"{len(CAN_ADD)}人")

    print("\n[2] **下見では、1回も書いていない**（前後で数える）")
    ck("Firestore に書かれた回数 0", client.writes == 0, client.writes)
    ck("口を1回も叩いていない", not api.calls, len(api.calls))
    ck("下見だと言っている", "1バイトも書いていません" in out, True)
    # **図鑑の姿が前後で同じ**と、そう言っていること
    shapes = [x.split("姿 ")[1].split()[0]
              for x in out.splitlines() if "姿 " in x]
    ck("図鑑の姿を前後で出している", len(shapes) == 2, len(shapes))
    ck("前後の姿が同じ", len(shapes) == 2 and shapes[0] == shapes[1],
       "同じ" if len(shapes) == 2 and shapes[0] == shapes[1] else shapes)
    ck("「はじめと同じ」と言っている", "← はじめと同じ" in out, True)

    print("\n[3] apply —— 足せる人にだけ足す")
    store = make_store()
    out2, code2, client2, api2 = run(store, apply=True)
    posts = api2.posts()
    sent = dict(posts)
    ck("終了コード 0", code2 == 0, code2)
    ck("Firestore には直に書いていない（口だけ）", client2.writes == 0,
       client2.writes)
    ck(f"POST は {len(CAN_ADD)}本", len(posts) == len(CAN_ADD), len(posts))
    ck("書いた人数と件数",
       f"書きました: {len(CAN_ADD)}人 / {len(CAN_ADD)}件" in out2,
       f"{len(CAN_ADD)}人")
    for k in CAN_ADD:
        ck(f"{EMOJI[k]} に足した", DOC[k] in sent, DOC[k] in sent)
    ck("図鑑の姿が変わったと言っている", "← **変わりました**" in out2, True)

    print("\n[4] **足してはいけない人には、1本も投げていない**")
    for k in NO_ADD:
        ck(f"{EMOJI[k]} に投げていない", DOC[k] not in sent, DOC[k] in sent)

    print("\n[5] **送った中身**（欄が消える書き方をしていない）")
    body = sent.get(DOC["plain"]) or {}
    was = make_store()["islandCharacter"][DOC["plain"]]
    ck("channelName を乗せ直している",
       body.get("channelName") == was["channelName"],
       "乗せている" if body.get("channelName") else "空で送った")
    ck("emoji を乗せ直している", body.get("emoji") == EMOJI["plain"],
       body.get("emoji") or "空で送った")
    ck("足すのは1件だけ（元の呼び名は残す）",
       body.get("aliases") == was["aliases"] + [PEOPLE["plain"][2].name],
       len(body.get("aliases") or []))
    ck("**lookupKeys を Python で作って送っていない**",
       "lookupKeys" not in body and "channelKeys" not in body,
       sorted(body.keys()))
    ck("**channelKeys には触っていない**",
       store["islandCharacter"][DOC["plain"]]["channelKeys"]
       == was["channelKeys"], "そのまま")
    ck("絵（plain / scene）を送っていない",
       "plain" not in body and "scene" not in body, sorted(body.keys()))
    ck("送る欄は3つだけ",
       all(set(b.keys()) == {"channelName", "emoji", "aliases"}
           for _, b in posts), sorted(body.keys()))

    print("\n[6] 名前も呼び名もチャンネルIDも書類IDも1文字も出ていない")
    both = out + out2
    names = [c for c, _a, _g in PEOPLE.values()]
    names += [g.name for _c, _a, g in PEOPLE.values() if g and g.name]
    names += [x for _c, a, _g in PEOPLE.values() for x in a]
    leaked = sorted({v for v in names if v and v in both})
    ck("出力に名前が無い", not leaked, leaked or "無し")
    bare = sorted({v.lstrip("@") for v in names
                   if v.startswith("@") and v.lstrip("@") in both})
    ck("`@` を落とした形も出ていない", not bare, bare or "無し")
    ck("チャンネルIDも出ていない",
       not any(v in both for v in CID.values()), "無し")
    ck("書類IDも生では出ていない",
       not any(v in both for v in DOC.values()), "無し")

    print("\n[7] 足した**あと**、口と OBS の両方で当たる（食い違い 0）")
    import alertbox_names as an
    typed = PEOPLE["plain"][2].name   # ドネルが送ってくる字＝チャンネル名

    def names_run(store):
        client = Fake(store)
        was_an = (an.db, an.readonly)
        an.db, an.readonly = (lambda: client), readonly
        os.environ["ARGS"] = json.dumps({"name": typed}, ensure_ascii=False)
        here = BUF.tell()
        try:
            an.main()
        finally:
            an.db, an.readonly = was_an
        return BUF.getvalue()[here:]

    out_before = names_run(make_store())
    ck("足す前は口で 0人", "口（lookupKeys）で当たる人数: 0" in out_before, "0人")
    ck("足す前は OBS でも 0人",
       "OBS（生の名前）で当たる人数: 0" in out_before, "0人")
    out_after = names_run(store)   # [3] の apply が通ったあとの名簿
    ck("足したあと、口で 1人",
       "口（lookupKeys）で当たる人数: 1" in out_after, "1人")
    ck("足したあと、OBS でも 1人",
       "OBS（生の名前）で当たる人数: 1" in out_after, "1人")
    ck("食い違いは 0 / 0",
       "食い違い: lookupKeys にしか無い 0 人 / 生の名前にしか無い 0 人"
       in out_after, "0 / 0")
    ck("チャンネル名も、この出力に出ていない",
       typed not in out_after and typed not in out_before, "無し")

    print("\n[8] 図鑑が1件も返らないとき（読めていないのに 0 と言わない）")
    out3, code3, client3, api3 = run({"islandCharacter": {}})
    ck("終了コード 2 で止まる", code3 == 2, code3)
    ck("**件数を1つも出していない**", "図鑑（はじめ）" not in out3,
       "出していない" if "図鑑（はじめ）" not in out3 else "出してしまった")
    ck("何も書いていない", client3.writes == 0 and not api3.calls,
       client3.writes)

    print("\n[9] 1人も名前を取れなかったとき（0人と言わない）")
    was_fetch = ca.fetch_one
    try:
        ca.fetch_one = lambda cid: ca.Got(ca.BLIND, why="届かない")
        client4 = Fake(make_store())
        api4 = FakeApi(client4.store)
        was4 = (ca.db, ca.readonly, ca.call, ca.owner_token)
        ca.db, ca.readonly, ca.call = (lambda: client4), readonly, api4
        ca.owner_token = lambda c: "（偽の札）"
        os.environ["ARGS"] = "{}"
        here = BUF.tell()
        code4 = 0
        try:
            ca.main()
        except SystemExit as e:
            code4 = e.code or 0
        finally:
            (ca.db, ca.readonly, ca.call, ca.owner_token) = was4
        out4 = BUF.getvalue()[here:]
    finally:
        ca.fetch_one = was_fetch
    ck("終了コード 2 で止まる", code4 == 2, code4)
    ck("「足すものはありません」と言っていない",
       "足すものはありません" not in out4, "言っていない")
    ck("何も書いていない", client4.writes == 0 and not api4.calls,
       client4.writes)

    print("\n[10] 題の読み方（動画の題を名前にしない・締め出しを名前にしない）")
    feed = ("<feed><title>ちゃんねる の な</title>"
            "<entry><title>きょうの はいしん</title></entry></feed>")
    ck("`<entry>` より前の題を読む",
       ca.title_from_feed(feed) == "ちゃんねる の な",
       ca.title_from_feed(feed))
    ck("動画の題を読んでいない",
       "はいしん" not in ca.title_from_feed(feed), "読んでいない")
    ck("実体参照を戻す",
       ca.title_from_feed("<feed><title>a &amp; b</title></feed>") == "a & b",
       ca.title_from_feed("<feed><title>a &amp; b</title></feed>"))
    page = '<meta property="og:title" content="なまえ  のひと">'
    ck("`og:title` を読む", ca.title_from_page(page) == "なまえ  のひと",
       ca.title_from_page(page))
    ck("題が無ければ空", ca.title_from_page("<html></html>") == "", "空")
    ck("締め出しの題は名前にしない", "youtube" in ca.BAD_TITLE, True)

    print("\n[11] **対照の足を1本ずつ抜く。抜いたら 2 で止まる**")
    # 本物の書き方（`python ＜名前＞.py`）で、別のプロセスとして回す。
    # 同じプロセスで環境変数を立てると、前の回の状態が残る
    for brk, why in (("add", "足すべき人に足せない"),
                     ("clash", "ぶつかる人に足しに行く"),
                     ("blind", "取れなかった人を『名前が無い』に混ぜる"),
                     ("write", "下見で書けてしまう")):
        env = dict(os.environ, BREAK=brk, ARGS="{}",
                   BQ_PROJECT_ID="channel-alias-selftest")
        r = subprocess.run(
            [sys.executable, "-c",
             "import sys; sys.path.insert(0, %r)\n"
             "import channel_alias as ca\n"
             "bad = ca.run_control()\n"
             "print('\\n'.join(bad))\n"
             "sys.exit(2 if bad else 0)\n" % HERE],
            capture_output=True, text=True, env=env, timeout=60)
        ck(f"BREAK={brk}（{why}）→ 2 で止まる", r.returncode == 2,
           f"終了コード {r.returncode}")
        ck(f"BREAK={brk} の理由が出る", bool(r.stdout.strip()),
           len(r.stdout.strip().splitlines()))

    print("\n[12] 抜いた足で、本物の `main()` も 2 で止まる")
    os.environ["BREAK"] = "clash"
    try:
        out5, code5, client5, api5 = run(make_store())
    finally:
        os.environ.pop("BREAK", None)
    ck("終了コード 2", code5 == 2, code5)
    ck("**本物の数字を1つも出していない**", "図鑑（はじめ）" not in out5,
       "出していない" if "図鑑（はじめ）" not in out5 else "出してしまった")
    ck("Firestore を1回も読んでいない", client5.reads == 0, client5.reads)
    ck("何も書いていない", client5.writes == 0 and not api5.calls,
       client5.writes)

    print()
    if FAILED:
        print(f"✕ {len(FAILED)} 件落ちた: {', '.join(FAILED)}")
        raise SystemExit(1)
    print("○ ぜんぶ通った")


if __name__ == "__main__":
    main()
