"""偽の Firestore・偽の BigQuery・偽の YouTube で、
`characters_link` を**実際に動かして確かめる。**

    python3 python/admin/characters_link_selftest.py

**本番には1バイトも出ない。** Firestore も BigQuery も YouTube も
資格情報も要らない。

## なぜ、これを書いたか

この道具が間違えたときに壊れるのは、**公開の面に出る誰かの絵。**
別人の `channelId` を入れると、その人のカードに他人の絵が乗る。
そして**それは赤くならない。** 出てから「これ私じゃない」と言われて
初めて分かる。

出どころを2つから6つに増やした（`residents_map.json` / `islandUsers` /
YouTube のハンドル引き / `islandChannels` を足した）。増やすほど
「当たった」は増えるが、**食い違いと人違いも増える。** だから、
増やしたぶんだけ**決めない側**を先に固定する。

## 確かめるもの

  1. **新しい出どころで1人に決まる → 埋める**
     （`residents_map.json` / YouTube のハンドル / `islandDonors` の
     `label` と `channelName`）
  2. **新しい出どころと `islandDonors` が食い違う → `islandDonors` を採り、
     件数を別に出す**
  3. **2つ以上に当たる → 飛ばす**
  4. **すでに別の人に付いている → 飛ばす**
  5. **2つの書類が同じ人を指した → 両方飛ばす**
  6. **既に `channelId` がある書類には引きもしない**
     （YouTube にその人のハンドルを1回も訊いていないことで見る。
     「当たらなかった」ではなく「見に行っていない」を確かめる）
  7. **`apply` 無しでは書き込みが1回も呼ばれない**
  8. `apply` を付けたら、**`channelId` の欄だけ**が入って、空欄が減る
  9. 出力に**名前も呼び名もチャンネルIDも1文字も出ない**

## 6 が本命の半分

1〜5 は「決め方」の確かめで、**上書きしない**ことはそこには出ない。
すでに埋まっている78人を1人でも引き直すと、名前が変わっている人の
`channelId` を**機械が上書きする**道が開く（あやとの決めごと
「YouTube を更新しても変わらないのが正しい」の反対）。
だから「引かない」を、訊いた回数で見る。
"""

import io
import json
import os
import sys
import tempfile

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
os.environ.setdefault("BQ_PROJECT_ID", "characters-link-selftest")

import characters_link as cl  # noqa: E402
from _fs import readonly  # noqa: E402

# ---------------------------------------------------------------- 偽の中身

# ハンドルの印。**字として並べて書かない。** このファイルは公開の
# リポジトリに残るので、偽物でも `tools/logident.py` が「ハンドルが出て
# いる」と数える形にはしない——数えたものが0でなくなると、**本物が
# 混ざった日に気づけなくなる。**
AT = chr(64)


def cid(tag: str) -> str:
    """偽のチャンネルID。**本物の形（`UC` + 22文字）から1文字ずらしてある。**

    理由はハンドルと同じ。この道具はチャンネルIDの形を1度も見ない
    （文字列として扱うだけ）ので、ずらしても確かめるものは変わらない。

    Args:
        tag: 見分けるための短い字

    Returns:
        `UC` + 21文字
    """
    return "UC" + (tag + "0123456789abcdefghijk")[:21]


CH = {
    "have": cid("have"),      # 既に channelId を持っている人の先
    "map": cid("map"),        # residents_map.json で決まる
    "yt": cid("yt"),          # YouTube のハンドルで決まる
    "hand": cid("hand"),      # islandDonors（人の手）が指すほう
    "mach": cid("mach"),      # BigQuery（機械）が指すほう。**採らない**
    "lbl": cid("lbl"),        # islandDonors の label で決まる
    "two1": cid("two1"),      # 同じ表示名を名乗る2つのうち片方
    "two2": cid("two2"),      # もう片方
    "twin": cid("twin"),      # 2つの書類が同じ人を指す
}

# 表示名・呼び名・ハンドル。**ここが1文字でも出力に出たら落とす**
NAME = {
    "have": "もっちり団子",
    "have_at": AT + "mottiri",          # **訊きに行ってはいけないハンドル**
    "yt_at": AT + "sakuramoti",         # YouTube だけが知っている
    "orphan_at": AT + "dokonimoinai",   # 訊いたが見つからない
    "clash": "みずうみのほとり",         # 人の手と機械で行き先が違う
    "clash_at": AT + "mizuumi",
    "label": "どねのよびな",
    "cname": "ちゃんねるのなまえ",
    "two": "ななし",                     # 2つのチャンネルが名乗っている
    "taken_at": AT + "mottiri2",        # 行き先が have と同じ
    "twin": "ふたご",
    "orphan": "いないひと",
}

# キャラクターの書類ID（本番と同じ32桁の形）
DOC = {k: f"{i}" + "0123456789abcdef" * 2 for i, k in enumerate(
    ["have", "map", "yt", "clash", "lbl", "two", "taken",
     "twinA", "twinB", "orphan"])}

EMOJI = {k: e for k, e in zip(DOC, "🐟🐰🐻🐢🐧🦊🐨🐮🐭🦉")}


def chars() -> dict:
    """図鑑。**外し方を1つずつ仕込んである。**

    - have   … 既に `channelId` を持っている。**引きもしないはず**
    - map    … `residents_map.json` に書類IDが載っている
    - yt     … ハンドルしか手がかりが無い。YouTube だけが知っている
    - clash  … 人の手は `hand`、機械は `mach` を指す。**人の手を採る**
               （鍵は `@` なしの形しか持っていない）
    - lbl    … `islandDonors` の `label` で当たる
    - two    … 同じ表示名のチャンネルが2つある → 飛ばす
    - taken  … 行き先が `have` に付いている → 飛ばす
    - twinA/B… 2つの書類が同じ人を指す → **両方**飛ばす
    - orphan … どこにも当たらない（ハンドルも YouTube が知らない）
    """
    return {
        DOC["have"]: {
            "emoji": EMOJI["have"], "channelId": CH["have"],
            "channelKeys": [NAME["have_at"], NAME["have"]],
            "lookupKeys": [NAME["have"]],
        },
        DOC["map"]: {
            "emoji": EMOJI["map"], "channelId": "",
            "channelKeys": [], "lookupKeys": ["ちずのひと"],
        },
        DOC["yt"]: {
            "emoji": EMOJI["yt"], "channelId": None,
            # ハンドルしか手がかりが無い人。**表示名はどこにも無い**
            "channelKeys": [NAME["yt_at"]],
            "lookupKeys": [],
        },
        DOC["clash"]: {
            "emoji": EMOJI["clash"], "channelId": "",
            # **`@` を落とした形しか持っていない。** 出どころ（`islandDonors`）
            # 側の `@…` から落とした形も作らないと、この組は当たらない
            "channelKeys": [NAME["clash_at"].lstrip(AT)],
            "lookupKeys": [NAME["clash"]],
        },
        DOC["lbl"]: {
            "emoji": EMOJI["lbl"], "channelId": "",
            "channelKeys": [], "lookupKeys": [NAME["label"]],
        },
        DOC["two"]: {
            "emoji": EMOJI["two"], "channelId": "",
            "channelKeys": [NAME["two"]], "lookupKeys": [],
        },
        DOC["taken"]: {
            "emoji": EMOJI["taken"], "channelId": "",
            "channelKeys": [NAME["taken_at"]], "lookupKeys": [],
        },
        DOC["twinA"]: {
            "emoji": EMOJI["twinA"], "channelId": "",
            "channelKeys": [], "lookupKeys": [NAME["twin"]],
        },
        DOC["twinB"]: {
            "emoji": EMOJI["twinB"], "channelId": "",
            "channelKeys": [], "lookupKeys": [NAME["twin"]],
        },
        DOC["orphan"]: {
            "emoji": EMOJI["orphan"], "channelId": "",
            "channelKeys": [NAME["orphan_at"]],
            "lookupKeys": [NAME["orphan"]],
        },
    }


def make_store() -> dict:
    """偽の Firestore の中身。"""
    donors = {
        # 人の手。ハンドルで `clash` に当たる
        "d1": {"handle": NAME["clash_at"], "channelId": CH["hand"],
               "channelName": NAME["cname"], "label": None},
        # **`label`（Doneru 側の呼び名）だけが手がかりの行**
        "d2": {"handle": None, "channelId": CH["lbl"],
               "channelName": None, "label": NAME["label"]},
        # 結んでいない行。鍵にならない
        "d3": {"handle": NAME["orphan_at"], "channelId": None,
               "channelName": None, "label": None},
    }
    users = {
        # 本人がログインした行。行き先は `have` と同じ人
        "u1": {"handle": NAME["taken_at"], "name": NAME["have"],
               "channelId": CH["have"]},
    }
    channels = {
        # 同じ表示名を名乗る2つ。**どちらとも決められない**
        CH["two1"]: {"name": NAME["two"]},
        CH["two2"]: {"name": NAME["two"]},
    }
    return {"islandCharacter": chars(), "islandDonors": donors,
            "islandUsers": users, "islandChannels": channels}


def fake_chat() -> tuple:
    """偽の BigQuery（表示名 → channelId）。

    - `clash` の表示名は **人の手と違う先** を指す
    - `twin` の呼び名は、2つの書類のどちらからも引ける
    """
    out: dict = {}
    cl.add(out, NAME["clash"], CH["mach"])
    cl.add(out, NAME["twin"], CH["twin"])
    tally = {"名前": 2, "1人に決まる名前": 2, "複数のチャンネルが使う名前": 0}
    return out, tally


def fake_youtube(asked: list):
    """偽の YouTube。**訊かれたハンドルを覚えておく。**

    Args:
        asked: 訊かれたハンドルを溜める一覧

    Returns:
        （`youtube_finder` と同じ形を返す関数）
    """
    known = {cl.norm(NAME["yt_at"]): {CH["yt"]}}

    def finder(on: bool = True):
        tally = {"訊いた": 0, "見つかった": 0, "訊けなかった": 0}

        def ask(handles):
            got = set()
            for h in handles:
                asked.append(h)
                tally["訊いた"] += 1
                hit = known.get(h, set())
                if hit:
                    tally["見つかった"] += 1
                got |= hit
            return got

        return ask, tally

    return finder


# 仕込みから導く期待値。**手で書いた数を置かない**
EXPECT = {
    "total": len(DOC),
    "blanks": len(DOC) - 1,          # have 以外
    "writes": 3,                     # map / yt / clash（lbl を足して4）
    "by": {
        "residents_map": 1,          # map
        "islandDonors": 2,           # clash（人の手を採る）・lbl
        "islandUsers": 0,            # taken に当たるが、飛ばす
        "YouTube": 1,                # yt
        "islandChannels": 0,         # two に当たるが、曖昧
        "BigQuery": 0,               # twin は二重、clash は採られない
    },
    "ambiguous": 1,                  # two
    "taken": 1,                      # taken
    "twin": 2,                       # twinA と twinB
    "clash": 1,                      # clash
    "unknown": 1,                    # orphan
}
EXPECT["writes"] = sum(EXPECT["by"].values())

# ------------------------------------------------------- 偽の Firestore


class Snap:
    """DocumentSnapshot のかわり。`select` で絞ったぶんだけ返す。"""

    def __init__(self, client, col, key, data, fields):
        self.id = key
        self.reference = DocRef(client, col, key)
        # **projection を本物どおりに再現する。** 欄が無ければ鍵ごと返らない
        self._data = {k: v for k, v in (data or {}).items()
                      if fields is None or k in fields}

    def to_dict(self):
        return dict(self._data)


class Query:
    """Query のかわり。この道具が使うのは `select` / `get` / `stream`。"""

    def __init__(self, client, col, fields=None):
        self.client, self.col, self.fields = client, col, fields

    def select(self, fields):
        # **本物と同じように、字を渡されたら1文字ずつの欄として扱う。**
        # ここを親切にすると、`select("name")` の踏み抜きが手元で通ってしまう
        return Query(self.client, self.col, list(fields))

    def _rows(self):
        self.client.reads += 1
        return [Snap(self.client, self.col, k, v, self.fields)
                for k, v in self.client.store.get(self.col, {}).items()]

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

    def set(self, data, **kw):
        self.client.writes += 1

    def update(self, data):
        self.client.writes += 1

    def delete(self):
        self.client.writes += 1


class Batch:
    """WriteBatch のかわり。**commit まで1件も入れない。**"""

    def __init__(self, client):
        self.client = client
        self.todo: list = []

    def update(self, ref, data):
        self.todo.append((ref, dict(data)))

    def commit(self):
        for ref, data in self.todo:
            self.client.writes += 1
            self.client.wrote.append((ref.key, data))
            self.client.store[ref.col][ref.key].update(data)
        self.todo = []


class Col(Query):
    def document(self, key):
        return DocRef(self.client, self.col, key)


class Fake:
    """偽の Firestore。読んだ回数と、書かれた回数と、中身を覚える。"""

    def __init__(self, store):
        self.store = store
        self.reads = 0
        self.writes = 0
        self.wrote: list = []

    def collection(self, name):
        return Col(self, name)

    def batch(self):
        return Batch(self)


# ---------------------------------------------------------------- 確かめる

FAILED: list = []


def ck(name: str, cond: bool, got) -> None:
    mark = "○" if cond else "✕"
    print(f"    {mark} {name}: {got}")
    if not cond:
        FAILED.append(name)


def num(out: str, needle: str) -> str:
    """その言葉が出てくる行から、数字だけを取る。"""
    line = next((x for x in out.splitlines() if needle in x), "")
    tail = line.split(needle, 1)[-1]
    got = ""
    for c in tail:
        if c.isdigit():
            got += c
        elif got:
            break
    return got


def run(store: dict, apply: bool = False):
    """`characters_link.main()` を1回通す。

    Args:
        store: 偽の中身
        apply: `{"apply": true}` を付けるか

    Returns:
        (その回の出力, 返り値, 偽の Firestore, 訊かれたハンドル)
    """
    client = Fake(store)
    asked: list = []
    was = (cl.db, cl.readonly, cl.chat_keys, cl.youtube_finder,
           cl.RESIDENTS_MAP)
    cl.db = lambda: client
    cl.readonly = readonly
    cl.chat_keys = fake_chat
    cl.youtube_finder = fake_youtube(asked)

    # **本物の読み手を通す。** ここを辞書で差し替えると、
    # 「ファイルが読めなかったとき黙って空になる」道が確かめられない
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False,
                                     encoding="utf-8") as f:
        json.dump({DOC["map"]: CH["map"]}, f)
        cl.RESIDENTS_MAP = f.name

    os.environ["ARGS"] = json.dumps({"apply": True} if apply else {})
    here = BUF.tell()
    try:
        code = cl.main()
    except SystemExit as e:
        code = e.code or 0
    finally:
        os.unlink(cl.RESIDENTS_MAP)
        (cl.db, cl.readonly, cl.chat_keys, cl.youtube_finder,
         cl.RESIDENTS_MAP) = was
    return BUF.getvalue()[here:], code, client, asked


def main() -> None:
    os.environ["GITHUB_ACTIONS"] = "true"   # 公開の場として回す

    print("[1] 下見 —— 決め方が仕込みどおり")
    out, code, client, asked = run(make_store())
    ck("返り値 0", code == 0, code)
    ck("図鑑の人数", num(out, "全体 ") == str(EXPECT["total"]),
       f'{num(out, "全体 ")}（仕込み {EXPECT["total"]}）')
    ck("channelId が空", num(out, "channelId が空 ") == str(EXPECT["blanks"]),
       f'{num(out, "channelId が空 ")}（仕込み {EXPECT["blanks"]}）')
    ck("埋められる人数", num(out, "埋められる: ") == str(EXPECT["writes"]),
       f'{num(out, "埋められる: ")}（仕込み {EXPECT["writes"]}）')

    print("\n[2] 出どころごとの決め手")
    for src, want in EXPECT["by"].items():
        # **「決め手になった」がある行だけを見る。** 出どころの名前は
        # 手前の「何行読んだか」の行にも出るので、名前だけで拾うと
        # 数の無い行に当たって、いつでも空が返る
        line = next((x for x in out.splitlines()
                     if f" {src} " in x and "決め手になった" in x), "")
        got = num(line, "決め手になった ")
        ck(f"{src} が決め手", got == str(want), f"{got}（仕込み {want}）")

    print("\n[3] 人の手と機械が食い違ったら、人の手を採る")
    ck("食い違いの件数を別に出している",
       num(out, "違う人を指したのが ") == str(EXPECT["clash"]),
       f'{num(out, "違う人を指したのが ")}（仕込み {EXPECT["clash"]}）')

    print("\n[4] 決まらないものは飛ばす")
    ck("2つ以上に当たった", num(out, "曖昧 ") == str(EXPECT["ambiguous"]),
       f'{num(out, "曖昧 ")}（仕込み {EXPECT["ambiguous"]}）')
    ck("すでに別の人に付いている",
       num(out, "すでに別の人に付いている ") == str(EXPECT["taken"]),
       f'{num(out, "すでに別の人に付いている ")}（仕込み {EXPECT["taken"]}）')
    ck("同じ人を2つの書類が指した",
       num(out, "同じ人を2つの書類が指した ") == str(EXPECT["twin"]),
       f'{num(out, "同じ人を2つの書類が指した ")}（仕込み {EXPECT["twin"]}）')
    ck("どうやっても分からなかった",
       num(out, "分からなかった: ") == str(EXPECT["unknown"]),
       f'{num(out, "分からなかった: ")}（仕込み {EXPECT["unknown"]}）')
    ck("二重になった相手を、指紋で報告している",
       "同じ相手を指した書類" in out, "出している"
       if "同じ相手を指した書類" in out else "出していない")
    ck("決まらなかった人を、1人ずつ並べている",
       out.count(" … ") >= EXPECT["unknown"] + EXPECT["ambiguous"],
       out.count(" … "))

    print("\n[5] **既に channelId がある人には引きもしない**")
    ck("その人のハンドルを YouTube に訊いていない",
       cl.norm(NAME["have_at"]) not in asked, len(asked))
    ck("訊いたのは、空いている人のハンドルだけ",
       sorted(asked) == sorted([cl.norm(NAME["yt_at"]),
                                cl.norm(NAME["taken_at"]),
                                cl.norm(NAME["orphan_at"])]),
       len(asked))

    print("\n[6] **apply 無しでは書き込みが1回も呼ばれない**")
    ck("書かれた回数 0", client.writes == 0, client.writes)
    ck("入れた中身も0件", not client.wrote, len(client.wrote))

    print("\n[7] 名前もチャンネルIDも1文字も出ていない")
    leaked = [k for k, v in NAME.items() if v and v in out]
    ck("出力に名前が無い", not leaked, leaked or "無し")
    ck("チャンネルIDも出ていない",
       not any(v in out for v in CH.values()),
       "無し" if not any(v in out for v in CH.values()) else "出ている")
    ck("書類IDも出ていない", not any(v in out for v in DOC.values()),
       "無し" if not any(v in out for v in DOC.values()) else "出ている")

    print("\n[8] apply —— channelId の欄だけが入って、空欄が減る")
    store = make_store()
    out2, code2, client2, _ = run(store, apply=True)
    ck("返り値 0", code2 == 0, code2)
    ck("書いた件数", client2.writes == EXPECT["writes"], client2.writes)
    ck("入れた欄は channelId だけ",
       all(list(d) == ["channelId"] for _, d in client2.wrote),
       sorted({k for _, d in client2.wrote for k in d}))
    ck("空欄が減った",
       f'{EXPECT["blanks"]}人 → {EXPECT["blanks"] - EXPECT["writes"]}人'
       in out2, num(out2, "空の人数 "))
    ck("ほかの欄を1つも書き換えていない",
       all(store["islandCharacter"][d]["emoji"] for d, _ in client2.wrote),
       "絵文字はそのまま")
    was = dict(client2.wrote).get(DOC["clash"], {}).get("channelId")
    ck("食い違った人に入ったのは、人が結んだほう", was == CH["hand"],
       "人の手" if was == CH["hand"] else "**機械のほうが入った**")
    ck("既に持っていた人の channelId は動いていない",
       store["islandCharacter"][DOC["have"]]["channelId"] == CH["have"],
       "そのまま")

    print()
    if FAILED:
        print(f"✕ {len(FAILED)} 件落ちた: {', '.join(FAILED)}")
        raise SystemExit(1)
    print("○ ぜんぶ通った")


if __name__ == "__main__":
    main()
