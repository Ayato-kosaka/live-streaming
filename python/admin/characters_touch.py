"""**すでに作られてしまった人**を、新しくなった口に通し直す。

ARGS 例:
  {}                      … 下見。**1バイトも書かない**
  {"apply": true}         … 口に通す
  {"apply": true, "limit": 1} … 先に1人だけ

**ARGS に名前も書類IDも取らない。** ARGS は公開のログに出る。

## 何が起きているか

#155 で口（`POST /island-api/characters/{id}`）を直した。
いまは**書く前に YouTube を引いて**、表示名を `aliases` に、
`channelId` を空欄に入れてから書く。

**直ったのは、これから作られる人だけ。** 本番の実測（2026-09-18）:

```
図鑑 103人 / channelId を持っていない … 19人
```

この19人は毎晩の繋ぎ（`channel_alias.py`）の**対象外**である。
あちらは `channelId` から YouTube を引くので、**空の人は永久に拾われない。**
「あとで追いつく」が来ない側に、19人が溜まっている。

だからここは、**その人たちを口に通し直すだけ**の道具。
表示名を引くのも、`channelId` を入れるのも、鍵を焼き直すのも、
**全部あちら（口）の仕事。** ここは判定をしない。

**19人ぜんぶが通せるわけではない。** 本番の下見（2026-09-18）で数えると、

| | 人数 |
| --- | --- |
| 通せる（`channelName` がハンドル） | **4人** |
| `channelName` が空（呼び名だけ持っている） | **15人** |

下の15人は**引く手がかりが1つも無い。** ハンドルを人が入れるまで、
この道具でも毎晩の繋ぎでも拾えない（issue #553 でお願いしてある）。**数だけ出して黙っていると
「そのうち直る」に見える**ので、下見のログで名指しして出す。
（図鑑ぜんたいで「名前を1つも持たない人」は 0人。あの15人は
呼び名は持っていて、**ハンドルだけが無い**）

| 誰が | 何をするか |
| --- | --- |
| この道具 | 通す先を選ぶ / いまの値をそのまま送り返す / 前後を突き合わせる |
| 口 | YouTube を引く / `aliases` に足す / `channelId` を入れる / 鍵を焼く |

## 通す先の選びかた

**2つとも満たす人だけ。**

  1. `channelId` が**空**（＝毎晩の繋ぎの対象外）
  2. `channelName` が**ハンドル（`@…`）か `UC…`**

2つめが要るのは、口が引きに行くのが**その2つの形のときだけ**だから
（`islandCharacter.ts` の `lookupChannel`。ふつうの表示名が入っている人は
`skipped` で帰ってくるので、通しても1文字も変わらない）。

## いちばん危ないところ

**口は、送られた中身で欄を置き換える。**

    const patch = { channelName, emoji, aliases,
                    channelKeys: …, lookupKeys: … }

つまり **`emoji` を送らなければ絵文字が消え、`aliases` を送らなければ
呼び名が全部消える。** ここが外れると、島から絵文字と呼び名が消える。
しかも**赤くならない。**

だから、

  - 送る3欄（`channelName` / `emoji` / `aliases`）は、**口から読み直した
    いまの値をそのまま**乗せ直す（`tail_alias.py` `channel_alias.py` と同じ）
  - 口が返した値と、Firestore に入っている値が**食い違っていたら触らない**
  - 通したあと、**その人の全欄を突き合わせる。**
    増えてよいのは `aliases` の1件と `channelId` と、それに伴う
    `lookupKeys` と、時刻の印だけ。**1つでも別の欄が動いたら、そこで止める**

絵（`plain` / `scene`）は、口が「送られてこなかった役どころには触らない」
作りになっている（`islandCharacter.ts` の `ROLES` のところ）。
**作りを読んだだけでは足りない**ので、突き合わせでも役どころごとに見る。

## 終了コード

  0 … 通す先が無い（やることなし）
  1 … 通す先が残っている（下見はここ。**止めたときもここ**）
  2 … **数えられていない**（対照が落ちた・図鑑が1件も返らない）

止めたときに 2 にしないのは、**そのとき数えられてはいる**から。
数えた結果「まだ残っている」ので 1（`docs/island-standards.md` §15）。

## 対照（本物に1行も読みに行く前に、毎回）

`run_control()` が**先に**回る。外れたら**本物の数字を1つも出さずに 2**。

  1. **選ぶ条件が効く**（IDを持っている人・ふつうの表示名の人を選ばない）
  2. **送る中身に、いまの値が乗っている**（絵文字と呼び名を落とさない）
  3. **突き合わせが、欄の消失を捕まえる**（いちばん危ない足）
  4. **下見が本当に1バイトも書かない**

`BREAK=pick|carry|diff|write` で足を1本ずつ抜ける。
抜いたぶんの対照が落ちることまで見るのが `characters_touch_selftest.py`。

## 出さないもの

**このリポジトリは公開で、Actions のログも誰でも読める。**
出すのは件数と、`logsafe.mask()` の**指紋**（書類ID・チャンネルID）と、
絵文字（図鑑が誰にでも返している値）だけ。
**名前も呼び名も1文字も出さない。**
"""

import hashlib
import os
import re
import sys
from dataclasses import dataclass, field

from _fs import ReadOnly, args, db, log, readonly
from _owner import call, owner_token

sys.path.insert(0, __file__.rsplit("/", 2)[0])

from logsafe import mask  # noqa: E402

CHARACTERS = "islandCharacter"

# Functions 側の MAX_CHARACTERS / MAX_NAME と同じ
MAX_CHARACTERS = 500
MAX_NAME = 80

# `islandCharacter.ts` の HANDLE / CHANNEL_ID / CHARACTER_ID と同じ形。
# **口が引きに行くのはこの2つのときだけ**なので、ここで同じ形を見る
HANDLE = re.compile(r"^@[^\s/?#]+$")
CHANNEL_ID = re.compile(r"^UC[A-Za-z0-9_-]{22}$")
CHARACTER_ID = re.compile(r"^[A-Za-z0-9_-]{10,64}$")

# 口が毎回書き直す印。**中身ではないので、変わってよい**
STAMP = frozenset({"editedAt", "editedBy", "updatedAt", "channelTitleFor"})

# 通したときに増えてよい欄。**減ってよい欄は1つも無い**
GAIN = frozenset({"aliases", "channelId", "lookupKeys", "images"})


def _break(name: str) -> bool:
    """対照の足を1本抜く。**`BREAK=` を渡したときだけ。**

    抜いた足のぶんだけ `run_control()` が落ちて、本物の数字を出さずに
    2 で止まる——ということを、見張りが確かめるために要る。
    """
    return (os.getenv("BREAK") or "") == name


def fingerprint(s: str) -> str:
    """中身を出さずに「同じか違うか」だけ言える字。

    `logsafe.mask()` は手元では素の値を返す（そういう道具）ので、
    **図鑑まるごとの姿**を出すのには使えない。ここは公開でも手元でも
    同じ指紋を返す。
    """
    return "#" + hashlib.sha256(s.encode("utf-8")).hexdigest()[:8]


def clean(v, max_len: int) -> str:
    """`islandCharacter.ts` の `clean`。**trim してから字数で切る。**"""
    if not isinstance(v, str):
        return ""
    return v.strip()[:max_len]


def aliases_of(v) -> list:
    """書類（または口の返事）から、呼び名を `clean` して取り出す。"""
    out = []
    for a in (v.get("aliases") or []):
        s = clean(a, MAX_NAME)
        if s:
            out.append(s)
    return out


def guard(client, apply: bool):
    """下見のあいだは**書く口ごと塞ぐ。** `if apply:` を書き忘れても止まる。"""
    if _break("write"):
        return client
    return client if apply else readonly(client)


# ------------------------------------------------------------ 図鑑を読む


def roster(src) -> dict:
    """図鑑を**欄を絞らずに**全件読む。

    `channel_alias.py` は `select` で欄を絞っているが、こちらは
    **通したあとに全欄を突き合わせる**のが仕事なので、絞ると
    「絞ったせいで見えなかった欄」がそのまま見落としになる。

    Args:
        src: Firestore クライアント（下見では読むだけの写し）

    Returns:
        書類ID -> 書類まるごと
    """
    out: dict = {}
    for d in src.collection(CHARACTERS).limit(MAX_CHARACTERS).get():
        out[d.id] = d.to_dict() or {}
    return out


def _canon(v) -> str:
    """並びの揺れに左右されない字にする。**指紋に通す前だけに使う。**

    Firestore は辞書の鍵の順を約束しない。`repr` をそのまま指紋にすると、
    1行も変わっていないのに姿が変わって見える回が出る。
    """
    if isinstance(v, dict):
        return "{" + ",".join(f"{k}={_canon(v[k])}" for k in sorted(v)) + "}"
    if isinstance(v, (list, tuple)):
        return "[" + ",".join(_canon(x) for x in v) + "]"
    return repr(v)


def shape(book: dict) -> str:
    """図鑑の姿。**前後で比べて「1件も変わっていない」を言うため。**

    人数でも呼び名の数でもなく、**書類の中身そのもの**を指紋にする。
    数だけ見ていると、絵文字が別の字に化けた回を取り逃がす。
    """
    rows = [f"{k}:{_canon(v)}" for k, v in sorted(book.items())]
    return fingerprint("\n".join(rows))


# ------------------------------------------------------------ 通す先を選ぶ


def pick(book: dict) -> tuple:
    """通す先。**読むだけ。**

    Args:
        book: `roster()` が返した図鑑

    Returns:
        (通す書類IDの一覧, 数えたもの)
    """
    n = {"people": len(book), "has_id": 0, "plain_name": 0,
         "no_name": 0, "bad_doc": 0}
    out: list = []
    for doc_id, v in sorted(book.items()):
        name = clean(v.get("channelName"), MAX_NAME)
        # 1. すでに `channelId` が入っている人。**毎晩の繋ぎが見ている側**
        if clean(v.get("channelId"), 64) and not _break("pick"):
            n["has_id"] += 1
            continue
        if not name:
            # `channelName` が空。**引く手がかりが1つも無い**
            # （呼び名は持っていることが多い。無いのはハンドルだけ）
            n["no_name"] += 1
            continue
        # 2. ふつうの表示名。**口は引きに行かない**（`skipped` で帰る）ので、
        #    通しても1文字も変わらない。通す意味が無い
        handle = HANDLE.match(name) or CHANNEL_ID.match(name)
        if not handle and not _break("pick"):
            n["plain_name"] += 1
            continue
        if not CHARACTER_ID.match(doc_id):
            # 口が `bad id` で断る形。**叩く前にこちらで数える**
            n["bad_doc"] += 1
            continue
        out.append(doc_id)
    n["todo"] = len(out)
    return out, n


# --------------------------------------------------------- 送る中身を作る


def carry(row: dict) -> dict:
    """いま入っている値を、**そのまま送り返す**形にする。

    **口は、送られた中身で欄を置き換える。** 送らなかった欄は消える。
    ここが「足すぶんだけ送る」になっていると、絵文字と呼び名が消える。

    Args:
        row: 口（`GET /characters`）が返した、その人のいまの値

    Returns:
        `POST /characters/{id}` に送る中身。**3欄だけ**
    """
    body = {
        "channelName": clean(row.get("channelName"), MAX_NAME),
        "emoji": clean(row.get("emoji"), 16),
        "aliases": aliases_of(row),
    }
    if _break("carry"):
        # **絵文字と呼び名を落とす。** 対照 2 が捕まえるべき形そのもの
        body.pop("emoji")
        body.pop("aliases")
    return body


def agrees(was: dict, row: dict) -> bool:
    """口が返した値と、Firestore に入っている値が同じか。

    **食い違っていたら触らない。** 読んでから送るまでのあいだに誰かが
    直していたら、こちらの写しを送り返すのは**その直しを消す**ことになる。
    """
    return (clean(was.get("channelName"), MAX_NAME)
            == clean(row.get("channelName"), MAX_NAME)
            and clean(was.get("emoji"), 16) == clean(row.get("emoji"), 16)
            and aliases_of(was) == aliases_of(row))


# ------------------------------------------------------- 前後を突き合わせる


@dataclass
class Diff:
    """1人ぶんの、通す前と通したあとの差。`bad` が空なら通ってよい。"""

    alias_added: int = 0
    id_added: bool = False
    bad: list = field(default_factory=list)


def verdict(was: dict, now: dict) -> Diff:
    """**増えたのは `aliases` の1件と `channelId` だけ**を数える。

    `bad` に1件でも入ったら、呼ぶ側はそこで止める。

    Args:
        was: 通す前の書類まるごと
        now: 通したあとの書類まるごと

    Returns:
        増えた数と、**おかしいところの一覧**（欄の名前だけ。値は入れない）
    """
    d = Diff(bad=[])

    def ng(why: str) -> None:
        if not _break("diff"):
            d.bad.append(why)

    lost = sorted(set(was) - set(now))
    if lost:
        ng("欄が消えた: " + ",".join(lost))

    # 呼び名。**頭からそのまま残って、増えるのは末尾だけ**
    a_was, a_now = aliases_of(was), aliases_of(now)
    if a_now[:len(a_was)] != a_was:
        ng("呼び名が書き換わった")
    d.alias_added = len(a_now) - len(a_was)
    if d.alias_added < 0:
        ng(f"呼び名が {-d.alias_added} 件 減った")
    elif d.alias_added > 1:
        ng(f"呼び名が {d.alias_added} 件 増えた（1件までのはず）")

    # チャンネルID。**空だった人に入るぶんだけ**
    c_was = clean(was.get("channelId"), 64)
    c_now = clean(now.get("channelId"), 64)
    if c_was and c_now != c_was:
        ng("channelId が付け替わった")
    d.id_added = bool(c_now) and not c_was

    # 引く鍵。`lookupKeys` は足した呼び名のぶん増えてよいが、**減ってはいけない**
    k_was = {k for k in (was.get("lookupKeys") or []) if isinstance(k, str)}
    k_now = {k for k in (now.get("lookupKeys") or []) if isinstance(k, str)}
    if not k_was <= k_now:
        ng("lookupKeys から鍵が減った")

    # `channelKeys` は `channelName` からだけ焼かれる。**1つも動かないはず**
    ck_was = [k for k in (was.get("channelKeys") or []) if isinstance(k, str)]
    ck_now = [k for k in (now.get("channelKeys") or []) if isinstance(k, str)]
    if ck_was != ck_now:
        ng("channelKeys が変わった")

    # 絵。**送っていない役どころは触られないはず**（作りだけでなく実物で見る）
    i_was = was.get("images") if isinstance(was.get("images"), dict) else {}
    i_now = now.get("images") if isinstance(now.get("images"), dict) else {}
    for role in sorted(i_was):
        if i_now.get(role) != i_was[role]:
            ng(f"絵（{role}）が変わった")

    # 残り全部。**1つでも動いたらおかしい**（`emoji` と `channelName` はここ）
    for f in sorted(set(was) | set(now)):
        if f in GAIN or f in STAMP:
            continue
        if was.get(f) != now.get(f):
            ng(f"欄が変わった: {f}")
    return d


# ---------------------------------------------------------------- 対照
#
# **本物を1行も読む前に、毎回回る。** 仕込みは形だけ本物に似せた作り物で、
# 本物のハンドルもチャンネルIDも書類IDも1つも入っていない。

_C_DOC = {k: f"{i}" + "0123456789abcdef" * 2 for i, k in enumerate(
    ["todo", "ucname", "hasid", "plain", "noname"])}
# **書類IDの形が違う人。** 口が `bad id` で断る形
_C_DOC["baddoc"] = "x"

_C_BOOK = {
    # 1. 通す先。ハンドルで、`channelId` が空
    "todo": {"channelName": "@tsuresasare1234", "emoji": "🐚",
             "aliases": ["つれ"], "channelId": "",
             "channelKeys": ["@tsuresasare1234", "tsuresasare1234"],
             "lookupKeys": ["@tsuresasare1234", "tsuresasare1234", "つれ"],
             "images": {"plain": {"full": "plain.webp"}}},
    # 通す先。`UC…` が名乗りに入っている人も、口は引きに行く
    "ucname": {"channelName": "UCaaaaaaaaaaaaaaaaaaaaaa", "emoji": "🌊",
               "aliases": [], "channelId": ""},
    # 2. すでに `channelId` を持っている。**毎晩の繋ぎが見ている側**
    "hasid": {"channelName": "@mochimochi0001", "emoji": "🌫",
              "aliases": [], "channelId": "UCbbbbbbbbbbbbbbbbbbbbbb"},
    # 3. ふつうの表示名。**口は引きに行かない**
    "plain": {"channelName": "なまえ のひと", "emoji": "🕳",
              "aliases": [], "channelId": ""},
    # 4. 名乗りが空。引きようが無い
    "noname": {"channelName": "", "emoji": "🫙",
               "aliases": [], "channelId": ""},
    # 5. 書類IDの形が違う
    "baddoc": {"channelName": "@katachichigai1", "emoji": "🪞",
               "aliases": [], "channelId": ""},
}


class _Counter:
    """偽の Firestore。**書かれた回数を数えるだけ。**"""

    def __init__(self):
        self.writes = 0

    def collection(self, name):
        return self

    def document(self, key):
        return self

    def set(self, *a, **k):
        self.writes += 1

    def update(self, *a, **k):
        self.writes += 1

    def delete(self, *a, **k):
        self.writes += 1


def _control_book() -> dict:
    return {_C_DOC[k]: dict(v) for k, v in _C_BOOK.items()}


def run_control() -> list:
    """**対照。** 落ちた理由を並べて返す。空なら通った。"""
    bad: list = []
    book = _control_book()

    # 1. 選ぶ条件が効く
    todo, n = pick(book)
    want = [_C_DOC["todo"], _C_DOC["ucname"]]
    if sorted(todo) != sorted(want):
        bad.append(f"(1) 通す先の選び方が違う（{len(todo)}人、欲しいのは 2人）")
    for key, field_name in (("hasid", "has_id"), ("plain", "plain_name"),
                            ("noname", "no_name"), ("baddoc", "bad_doc")):
        if _C_DOC[key] in todo:
            bad.append(f"(1) 通してはいけない人を選んだ（{field_name}）")
        elif n[field_name] != 1:
            bad.append(f"(1) {field_name} の数え方が違う（{n[field_name]}）")

    # 2. 送る中身に、いまの値が乗っている
    src_row = {"channelName": "@tsuresasare1234", "emoji": "🐚",
               "aliases": ["つれ"]}
    body = carry(src_row)
    if set(body) != {"channelName", "emoji", "aliases"}:
        bad.append(f"(2) 送る欄が3つではない（{sorted(body)}）")
    if body.get("emoji") != "🐚":
        bad.append("(2) 絵文字を乗せ直していない（送らないと消える）")
    if body.get("aliases") != ["つれ"]:
        bad.append("(2) 呼び名を乗せ直していない（送らないと全部消える）")
    if body.get("channelName") != "@tsuresasare1234":
        bad.append("(2) 名乗りを乗せ直していない")
    if not agrees(_C_BOOK["todo"], src_row):
        bad.append("(2) 同じ値どうしを食い違いと読んでいる")
    if agrees(_C_BOOK["todo"], {**src_row, "emoji": "🐡"}):
        bad.append("(2) 絵文字が違うのに食い違いと読んでいない")

    # 3. 突き合わせ。**いちばん危ない足**
    was = dict(_C_BOOK["todo"])
    ok = {**was, "aliases": ["つれ", "つれ ささ れ"],
          "channelId": "UCcccccccccccccccccccc",
          "lookupKeys": was["lookupKeys"] + ["つれ ささ れ"],
          "editedAt": "2026-09-18T00:00:00.000Z", "editedBy": "uid",
          "updatedAt": "2026-09-18T00:00:00.000Z",
          "channelTitleFor": was["channelName"]}
    d = verdict(was, ok)
    if d.bad:
        bad.append(f"(3) 正しく通ったものに文句を付けた（{d.bad}）")
    if d.alias_added != 1 or not d.id_added:
        bad.append(f"(3) 増えたぶんの数え方が違う（呼び名 {d.alias_added}）")
    broken = (
        ("絵文字が消えた", {**ok, "emoji": ""}),
        ("呼び名が消えた", {**ok, "aliases": []}),
        ("名乗りが消えた", {**ok, "channelName": ""}),
        ("絵が消えた", {**ok, "images": {}}),
        ("欄が丸ごと消えた", {k: v for k, v in ok.items() if k != "emoji"}),
        ("channelKeys が変わった", {**ok, "channelKeys": []}),
        ("lookupKeys から鍵が減った", {**ok, "lookupKeys": ["つれ ささ れ"]}),
        ("呼び名が2件増えた", {**ok, "aliases": ["つれ", "あ", "い"]}),
        ("知らない欄が増えた", {**ok, "videoUrl": "https://example/x.mp4"}),
    )
    for why, after in broken:
        if not verdict(was, after).bad:
            bad.append(f"(3) **{why}**のに、通してよいと言った")

    # 4. 下見が1バイトも書かない
    probe = _Counter()
    src = guard(probe, apply=False)
    try:
        src.collection(CHARACTERS).document("x").set({"a": 1})
    except ReadOnly:
        pass
    except Exception as e:  # noqa: BLE001
        bad.append(f"(4) 下見の写しが思わぬ落ち方をした（{type(e).__name__}）")
    else:
        bad.append("(4) 下見の写しに書けてしまった")
    if probe.writes:
        bad.append(f"(4) 下見で {probe.writes} 回書かれた")
    return bad


# ---------------------------------------------------------------- 通す


def touch(src, todo: list, token: str) -> tuple:
    """口に通す。**1人ずつ、通すたびに突き合わせる。**

    Args:
        src: Firestore クライアント（読み直しに使う）
        todo: 通す書類IDの一覧
        token: オーナーの札

    Returns:
        (通した人数, 増えた呼び名, `channelId` が入った人数, 止めた理由)
    """
    # **いまの値を口から取り直す。** 口は送られたぶんで置き換えるので、
    # 手元の古い写しから送ると、その間に直された呼び名が消える
    cur_list = call("GET", "/characters", token).get("characters") or []
    cur = {c.get("id"): c for c in cur_list if isinstance(c, dict)}
    log.info("図鑑が口から %d人ぶん返りました", len(cur))

    ref = src.collection(CHARACTERS)
    people = aliases = ids = 0
    for doc_id in todo:
        row = cur.get(doc_id)
        if not row:
            log.warning("  %s が図鑑から消えています。飛ばします", mask(doc_id))
            continue
        was = ref.document(doc_id).get().to_dict() or {}
        if not agrees(was, row):
            # 読んでから送るまでに誰かが直した。**こちらの写しで上書きしない**
            log.warning("  %s 口と中身が食い違っています。触りません",
                        mask(doc_id))
            continue
        try:
            call("POST", f"/characters/{doc_id}", token, carry(row))
        except SystemExit as e:
            # `_owner.call` は断られた文に**道（＝書類ID）をそのまま**載せる。
            # 公開のログに出るので、指紋に置き換えて投げ直す
            raise SystemExit(
                f"{mask(doc_id)} への書き込みが断られました"
            ) from e
        now = ref.document(doc_id).get().to_dict() or {}
        d = verdict(was, now)
        if d.bad:
            log.error("  %s %s **通したら別の欄が動きました**",
                      mask(doc_id), row.get("emoji") or "（絵文字なし）")
            for why in d.bad:
                log.error("      %s", why)
            return people, aliases, ids, "別の欄が動いた"
        people += 1
        aliases += d.alias_added
        ids += 1 if d.id_added else 0
        log.info("  %s %s ← 呼び名 +%d件 / channelId %s",
                 mask(doc_id), row.get("emoji") or "（絵文字なし）",
                 d.alias_added, "入った" if d.id_added else "入らなかった")
    return people, aliases, ids, ""


# ---------------------------------------------------------------- 本体


def main() -> None:
    a = args()
    apply = a.get("apply") is True
    limit = a.get("limit")
    limit = int(limit) if isinstance(limit, (int, float)) else None

    # **対照が先。** 外れたら、本物の数字を1つも出さずに 2 で止まる
    bad = run_control()
    if bad:
        log.error("対照が落ちました。**本物には1バイトも触っていません**")
        for line in bad:
            log.error("  %s", line)
        raise SystemExit(2)
    log.info("対照 4つ、通りました（選ぶ／乗せ直す／突き合わせ／書かない）")

    client = db()
    src = guard(client, apply)

    book = roster(src)
    if not book:
        # 0人と「読めていない」を同じ顔で返さない
        log.error("図鑑が1件も返りませんでした。**何も書いていません**")
        raise SystemExit(2)
    before = shape(book)
    log.info("図鑑（はじめ）: %d人 / 姿 %s", len(book), before)

    todo, n = pick(book)
    log.info("通す先の仕分け")
    log.info("  すでに channelId を持っている … %d人", n["has_id"])
    log.info("  channelName が空               … %d人", n["no_name"])
    if n["no_name"]:
        # **ここは、この道具では永久に直らない側。** 引く手がかりが
        # 1つも無いので、人がハンドルを入れるまで誰も拾えない。
        # 数だけ出して黙っていると「そのうち直る」に見える
        log.info("    （呼び名は持っているが**ハンドルが無い**人。"
                 "手で入れるまで、この道具でも毎晩の繋ぎでも拾えません）")
    log.info("  ふつうの表示名（口は引かない） … %d人", n["plain_name"])
    if n["bad_doc"]:
        log.info("  書類IDの形が違う               … %d人", n["bad_doc"])
    log.info("  **通す先**                     … %d人", n["todo"])

    if limit is not None and limit >= 0:
        todo = todo[:limit]
        log.info("limit=%d のぶんだけにしました", limit)
    for doc_id in todo:
        # **名乗りも呼び名も1文字も出さない。** 出すのは指紋と絵文字だけ
        log.info("  通す: %s %s", mask(doc_id),
                 clean(book[doc_id].get("emoji"), 16) or "（絵文字なし）")

    stopped = ""
    if apply and todo:
        token = owner_token(src)
        log.info("口に頼む札を取りました")
        people, aliases, ids, stopped = touch(src, todo, token)
        log.info("通しました: %d人 / 呼び名 +%d件 / channelId +%d人",
                 people, aliases, ids)
        if stopped:
            log.error("**%s ので、ここで止めました。**"
                      "残りは1人も触っていません", stopped)
    elif not apply:
        log.info("---- 下見です。1バイトも書いていません ----")
        log.info('通すには {"apply": true} を付けてください')

    # **前後で図鑑を読み直す。** 下見なら1件も変わっていないはず
    after_book = roster(src)
    after = shape(after_book)
    same = "はじめと同じ" if after == before else "**変わりました**"
    log.info("図鑑（おわり）: %d人 / 姿 %s ← %s", len(after_book), after, same)
    if not apply and after != before:
        log.error("下見なのに図鑑が変わりました")
        raise SystemExit(1)

    left, _ = pick(after_book)
    if left or stopped:
        log.info("通す先は、まだ %d人 残っています", len(left))
        raise SystemExit(1)
    log.info("通す先はありません")


if __name__ == "__main__":
    main()
