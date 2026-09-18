"""YouTube の**表示名（チャンネル名）**を、その人の呼び名として図鑑に足す。

ARGS 例:
  {}                  … 下見。**1バイトも書かない**
  {"apply": true}     … 呼び名として足す
  {"apply": true, "limit": 5} … 先に少しだけ
  {"budget_min": 10}  … 名前を引くのに使う時間の上限（既定 25分）

## 何が起きているか

あやとの言葉（2026-09-17）:

> また ＜名前＞ v でキャラクターヒットせず。これもしかして、チャンネル名？
> （だとしたらヒットしないとおかしい）… いづれにせよ、あだ名に加えた方が良い

**チャンネル名だった。** 図鑑（`islandCharacter`）に入っている
`channelName` は**ハンドル**（`@…`）で、引き当ては**完全一致**。

| 誰が引くか | 何を見るか |
| --- | --- |
| 口（`GET /characters/lookup?alias=`） | `lookupKeys` |
| カードの絵（`functions/src/cards.ts` の `iconsOf`） | `lookupKeys` |
| 配信の OBS（`app/alertbox`） | `channelName` と `aliases` の生の字 |

**ドネルは、チャンネル名を初期値として入れてくる。** ハンドルではない。
だから投げ銭のたびに、ハンドルしか知らない図鑑には当たらない。

## #509（しっぽ落とし）では直らなかった

`tail_alias` が足したのは**ハンドルからしっぽを落とした形**で、
チャンネル名ではない。似ている人はたまたま似ているだけで、
**空白1つ違えば当たらない。**

    ドネル → findBy("lookupKeys", …)      array-contains ＝ 完全一致
    normKey は空白を残す（/\\s+/g → " "）  「でこぼこ v」≠「でこぼこv」

空白を無視する Collator は **OBS（`app/alertbox/matching.utils.ts`）に
しか無く**、ドネルが通る鍵引きには無い。だから**チャンネル名そのもの**を
呼び名に足す。足せば `normKey` を通しても字が変わらないので、
ドネルが送ってくる字と**完全一致**する。

**`normKey` は触らない。** 正規化を広げると全員の鍵が変わって、
取り違えが増える。そこは別の判断。

## 名前の出どころ

図鑑は `channelId` を持っている。そこから YouTube を引く。**鍵は使わない。**
`python/dead_stream_watch.py` が配信でやっているのと同じで、
**ログインしていない側から**頁を引いて題を読む（cookie も鍵も渡さない）。

軽いほうから当てる。

| 道 | 大きさ（実測 2026-09-18） | 読むもの |
| --- | --- | --- |
| `feeds/videos.xml?channel_id=` | **668バイト**（動画が1本も無い人でも 200） | `<entry>` より前の `<title>` |
| `channel/<id>` の頁 | 807KB | `og:title` |

頁のほうは**1200倍重い。** 100人ぶんぶら下げると 80MB になって、
そのぶん締め出されやすい。だから feed を先に当てて、駄目なときだけ頁へ落とす。

**締め出される。** 間を空けて、断られたら倍にして休んで、当て直す
（`dead_stream_watch.py` の構えをそのまま借りている）。
**「取れなかった」を「名前が無い」と書かない**——別の欄で数える。

## 足すのは `aliases` だけ

`channelKeys`（スパチャがチャンネル名から引く欄）には触らない。
あちらは**取り違えを減らすためにわざと狭くしてある**
（`islandCharacter.ts`「2つに分けてあるのは、取り違えを減らすため」）。
ここが広げるのは Doneru と OBS が見る側だけ。

## 鍵（lookupKeys）を Python で作らない

`islandCharacter.ts` にこう書いてある。

> **鍵はここで作る。** 画面から作らせない。作り方が2か所にあると、
> 片方だけ直したときに引けない行が静かに増える。

だから送るのは `aliases` だけで、鍵は口（`POST /characters/{id}`）に作らせる。
口は `channelName` / `emoji` / `aliases` を**送られたぶんで置き換える**ので、
いま入っている値を口から取り直してから乗せ直す（`tail_alias.py` と同じ）。

## ぶつかったら、どちらにも足さない

足した鍵が**他の誰かのもの**だったら、そこへ足すのは人違いの元。
2人が同じ鍵を持つと `cards.ts` の `characterBook` はどちらも使わなくなるので、
**足したせいで、いま引けている人まで引けなくなる。**

  - その鍵を**他の人が既に持っている** → 足さない
  - **2人のチャンネル名が同じ字になる** → どちらにも足さない
  - **ハンドルと同じ字になる** → 足さない（引ける字が増えない）

## 対照（本物に1行も書く前に、毎回）

`run_control()` が**先に**回る。外れたら**本物の数字を1つも出さずに 2**。

  1. 答えの分かっている仕込みで、**足すべき人に足せる**
  2. **ぶつかる人に足さない**（いちばん危ない。足したせいで、いま
     引けている人まで引けなくなる）
  3. **取れなかった人を「名前が無い」と混ぜない**
  4. **下見が本当に1バイトも書かない**

`BREAK=add|clash|blind|write` を渡すと、その足を1本ずつ抜ける。
抜いたぶんの対照が落ちることまで見るのが `channel_alias_selftest.py`。

## 出さないもの

**このリポジトリは公開で、Actions のログも誰でも読める。**
出すのは件数と、`logsafe.mask()` の**指紋**（書類ID・チャンネルID・鍵）と、
絵文字（図鑑が誰にでも返している値）だけ。
**名前も呼び名も1文字も出さない。** ARGS にも名前を取らない（ARGS はログに出る）。
"""

import hashlib
import html
import os
import random
import re
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass

from _fs import ReadOnly, args, db, log, readonly
from _owner import call, owner_token

sys.path.insert(0, __file__.rsplit("/", 2)[0])

from logsafe import mask  # noqa: E402

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from alertbox_names import keys_of, norm_key  # noqa: E402

CHARACTERS = "islandCharacter"

# Functions 側の MAX_CHARACTERS / MAX_ALIASES / MAX_NAME と同じ
MAX_CHARACTERS = 500
MAX_ALIASES = 20
MAX_NAME = 80

# --- 名前を取りに行った結果。**混ぜない** ---
GOT = "GOT"        # 取れた
NONE = "NONE"      # 取れたが、名前が空だった（＝本当に名前が無い）
GONE = "GONE"      # チャンネルが消えている（404）
BLIND = "BLIND"    # **取れなかった**（届かない・締め出された・題が読めない）
NOID = "NOID"      # そもそも channelId を持っていない

FEED = "https://www.youtube.com/feeds/videos.xml?channel_id={}"
PAGE = "https://www.youtube.com/channel/{}"

# 名乗らない側から見る。**cookie も鍵も渡さない**
UA = "Mozilla/5.0 (compatible; island-name/1.0)"

# 締め出されているときに返ってくる題。**名前として受け取らない。**
# 頁が bot 判定を出すと `og:title` が YouTube そのものの題になる
BAD_TITLE = {"youtube", "youtube - 404 not found", "404 not found"}

# 1人と1人のあいだ（秒）。**速く当てると、速くなるのではなく測れなくなる**
# （`dead_stream_watch.py` の PLAY_GAP と同じ話）。feed は 668バイトなので
# 1人 1秒で、100人ぶんでも2分かからない
GAP = 1.0

# 1人あたり、何周まで当て直すか。**失敗したときしか当て直さない**
TRIES = 3

# 429 を受けたときに休む秒数。1度めは2分、来るたび倍にして10分で頭打ち
COOL_FIRST = 120.0
COOL_MAX = 600.0

# **引きに使ってよい時間ぜんたい（秒）。** 締め出しが続くと、休みは
# 2分→4分→8分→10分と延びる。102人ぶん当てるあいだ延び続けると、
# 1回の実行が何時間にもなる。ここで打ち切って、**残りは「取れなかった」**
# に積む。0人だけ取れて終わるより、何人ぶん見られなかったかが出るほうがよい
BUDGET = 25 * 60.0

_cool_until = 0.0
_cool_span = COOL_FIRST


def _break(name: str) -> bool:
    """対照の足を1本抜く。**`BREAK=` を渡したときだけ。**

    抜いた足のぶんだけ `run_control()` が落ちて、本物の数字を出さずに
    2 で止まる——ということを、見張りが確かめるために要る。
    """
    return (os.getenv("BREAK") or "") == name


def _cool_down() -> None:
    """締め出された。休む刻限を先に延ばす。"""
    global _cool_until, _cool_span
    _cool_until = max(_cool_until, time.monotonic() + _cool_span)
    _cool_span = min(COOL_MAX, _cool_span * 2)


def _cool_ok() -> None:
    """通った。**次に断られたときの休みを、いちばん短いところへ戻す。**

    戻さないと、1度 10分まで延びた休みがそのまま最後まで付いて回る。
    締め出しは解けるものなので、解けたことを忘れない。
    """
    global _cool_span
    _cool_span = COOL_FIRST


def _wait_cool() -> None:
    """休む刻限が来ていたら、そこまで待つ。当てに行く前に必ず通る。"""
    while True:
        left = _cool_until - time.monotonic()
        if left <= 0:
            return
        time.sleep(min(left, 5.0))


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


def guard(client, apply: bool):
    """下見のあいだは**書く口ごと塞ぐ。** `if apply:` を書き忘れても止まる。"""
    if _break("write"):
        return client
    return client if apply else readonly(client)


# ------------------------------------------------------------ 図鑑を読む


def roster(src) -> dict:
    """図鑑を1回だけ全件読む。

    Args:
        src: Firestore クライアント（下見では読むだけの写し）

    Returns:
        書類ID -> {emoji, channel, channelId, aliases, keys（持っている鍵）}
    """
    out: dict = {}
    # **`select` には一覧を渡す。** 字を渡すと1文字ずつの欄を頼むことになる
    q = (
        src.collection(CHARACTERS)
        .select(["channelName", "aliases", "lookupKeys", "channelKeys",
                 "emoji", "channelId"])
        .limit(MAX_CHARACTERS)
    )
    for d in q.get():
        v = d.to_dict() or {}
        channel = clean(v.get("channelName"), MAX_NAME)
        aliases = [clean(a, MAX_NAME) for a in (v.get("aliases") or [])
                   if isinstance(a, str)]
        aliases = [a for a in aliases if a]
        keys = set()
        for field in ("lookupKeys", "channelKeys"):
            for k in (v.get(field) or []):
                if isinstance(k, str) and k:
                    keys.add(k)
        # **生の名前も鍵として数える。** OBS が見ているのはこちらなので、
        # 保存された鍵だけ見ていると OBS 側のぶつかりを見落とす
        for n in ([channel] + aliases):
            k = norm_key(n)
            if k:
                keys.add(k)
        out[d.id] = {
            "emoji": clean(v.get("emoji"), 16),
            "channel": channel,
            "channelId": clean(v.get("channelId"), 64),
            "aliases": aliases,
            "keys": keys,
        }
    return out


def shape(book: dict) -> str:
    """図鑑の姿。**前後で比べて「1件も変わっていない」を言うため。**

    人数だけだと、呼び名が1つ増えても同じ数字になる。
    見るのは**書類IDと、呼び名の数と、鍵の数**。
    """
    rows = [f"{k}:{len(v['aliases'])}:{len(v['keys'])}"
            for k, v in sorted(book.items())]
    return fingerprint("\n".join(rows))


# --------------------------------------------------------- 名前を取りに行く


@dataclass
class Got:
    """1人ぶんの、取ってきた結果。`why` は人が読む1行。"""

    kind: str
    name: str = ""
    why: str = ""


def _get(url: str, timeout: float) -> tuple:
    req = urllib.request.Request(
        url, headers={"User-Agent": UA, "Accept-Language": "ja,en;q=0.8"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read().decode("utf8", "replace")


def title_from_feed(body: str):
    """Atom の、**`<entry>` より前の** `<title>`。

    動画の題も `<title>` なので、切ってから拾わないと1本目の動画名を
    その人の名前として足すことになる。

    Returns:
        題（空の題なら `""`）。**題の欄そのものが無ければ `None`**
    """
    head = body.split("<entry>", 1)[0]
    m = re.search(r"<title>(.*?)</title>", head, re.S)
    return html.unescape(m.group(1)).strip() if m else None


def title_from_page(body: str):
    """チャンネル頁の `og:title`。

    Returns:
        題（空の題なら `""`）。**題の欄そのものが無ければ `None`**
    """
    m = re.search(r'<meta\s+property="og:title"\s+content="([^"]*)"', body)
    return html.unescape(m.group(1)).strip() if m else None


def fetch_one(cid: str, timeout: float = 20.0, tries: int = TRIES) -> Got:
    """チャンネルIDから表示名を取る。**取れなかったら `BLIND`。**

    届かないことを「名前が無い」と読むと、電波の弱い日に
    「この人には名前がありません」と言い切ることになる
    （`docs/island-standards.md` §10）。
    """
    n_404 = n_empty = n_fail = 0
    last = ""
    for _ in range(tries):
        for url, pick in ((FEED.format(cid), title_from_feed),
                          (PAGE.format(cid), title_from_page)):
            _wait_cool()
            time.sleep(GAP * (0.5 + random.random()))
            try:
                st, body = _get(url, timeout)
            except urllib.error.HTTPError as e:
                if e.code == 429:
                    # **箱ごと締め出された。** 休んでから当て直す
                    n_fail += 1
                    last = "429（箱ごと締め出された）"
                    _cool_down()
                    continue
                if e.code == 404:
                    n_404 += 1
                    last = "404"
                    continue
                n_fail += 1
                last = f"HTTP {e.code}"
                continue
            except (urllib.error.URLError, OSError, TimeoutError) as e:
                n_fail += 1
                last = f"届かない: {type(e).__name__}"
                time.sleep(min(30.0, GAP * 4))
                continue
            if st != 200:
                n_fail += 1
                last = f"HTTP {st}"
                continue
            name = pick(body)
            if name is None:
                # **題の欄そのものが無い。** 読めなかったのであって、
                # 「名前が無い」ではない。同意の頁や作りの変わった頁がここ
                n_fail += 1
                last = "題の欄が無い（読めなかった）"
                continue
            if name and name.lower() not in BAD_TITLE:
                _cool_ok()
                return Got(GOT, clean(name, MAX_NAME))
            if name:
                # **締め出されている。** 名前が無いのではない
                n_fail += 1
                last = "題が YouTube のまま（締め出し）"
                continue
            n_empty += 1
            last = "題が空"
    # **「取れなかった」と「名前が無い」を分ける。**
    # 何か1つでも失敗していたら、言い切らない。
    # 「名前が空」と言えるのは、**題の欄を読めたうえで空だった**ときだけ
    # （欄が無いのは上で `n_fail` に積んである）
    if n_fail == 0 and n_404 and not n_empty:
        return Got(GONE, why="404")
    if n_fail == 0 and n_empty:
        return Got(NONE, why="題が空")
    return Got(BLIND, why=last or "届かない")


def fetch_all(book: dict, fetch=None, budget: float = BUDGET) -> dict:
    """図鑑の全員ぶん。**1人ずつ順に当てる。**

    同時に当てると、そのぶん締め出される。feed は 668バイトなので
    順に当てても 100人で2分かからない（`dead_stream_watch.py` の
    「速くしようとすると、速くなるのではなく測れなくなる」）。

    **時間で打ち切る。** 締め出しが続くと休みが延びて、1回が何時間にもなる。
    打ち切ったぶんは `BLIND`＝**取れなかった**に積む。`GOT` に畳まない。
    """
    fetch = fetch or fetch_one
    out: dict = {}
    total = len(book)
    end = time.monotonic() + budget
    for i, (doc_id, v) in enumerate(sorted(book.items()), 1):
        cid = v["channelId"]
        if not cid:
            out[doc_id] = Got(NOID, why="channelId が無い")
            continue
        if time.monotonic() >= end:
            # **時間切れ。** 見ていないのであって、名前が無いのではない
            out[doc_id] = Got(BLIND, why="時間切れ（締め出しで休みが延びた）")
            continue
        out[doc_id] = fetch(cid)
        if i % 20 == 0:
            # **数は出さない。** 途中の数を読まれると、測り終える前に
            # 結論を書く相手が出る（`dead_stream_watch.py` の `_tick`）
            print(f"  ...名前を引いています {i}/{total}",
                  file=sys.stderr, flush=True)
    return out


# ------------------------------------------------------------ 足す先を決める


def plan(book: dict, got: dict) -> tuple:
    """取ってきた名前のうち、足せるものだけ残す。**読むだけ。**

    Args:
        book: `roster()` が返した図鑑
        got: 書類ID -> `Got`

    Returns:
        (書類ID -> 足す呼び名の一覧, 数えたもの, ぶつかって足さない書類IDの一覧)
    """
    n = {"people": len(book), "noid": 0, "got": 0, "gone": 0,
         "noname": 0, "blind": 0, "handle": 0, "already": 0,
         "taken": 0, "shared": 0, "full": 0}
    # 鍵 -> その鍵を持っている人。**図鑑ぜんぶぶん**
    owner: dict = {}
    for doc_id, v in book.items():
        for k in v["keys"]:
            owner.setdefault(k, set()).add(doc_id)

    want: dict = {}
    # 足す字 -> 作った人。**2人が同じ字になったら、どちらにも足さない**
    by_key: dict = {}
    blocked: set = set()

    for doc_id, v in sorted(book.items()):
        g = got.get(doc_id) or Got(BLIND, why="引いていない")
        if g.kind == NOID:
            n["noid"] += 1
            continue
        if g.kind == GONE:
            n["gone"] += 1
            continue
        if g.kind == NONE:
            n["noname"] += 1
            continue
        if g.kind != GOT:
            # **取れなかった。** ここを `noname` に足すと、届かなかっただけの
            # 人が「名前が無い」に化ける
            if _break("blind"):
                n["noname"] += 1
            else:
                n["blind"] += 1
            continue
        n["got"] += 1

        name = clean(g.name, MAX_NAME)
        keys = keys_of([name])
        if not keys:
            # 正規化すると何も残らない字。**鍵にならないので足さない**
            n["noname"] += 1
            continue
        # **ハンドルと同じ字なら足さない。** 引ける字が1つも増えない
        if all(k in set(keys_of([v["channel"]])) for k in keys):
            n["handle"] += 1
            continue
        if any(k in v["keys"] for k in keys):
            # もう自分で持っている。**何もしない**
            n["already"] += 1
            continue
        others = set()
        for k in keys:
            others |= (owner.get(k, set()) - {doc_id})
        if others and not _break("clash"):
            # 他の人の鍵。**そこへ足すと人違いになる**
            n["taken"] += 1
            blocked.add(doc_id)
            by_key.setdefault(keys[0], set()).add(doc_id)
            continue
        want.setdefault(doc_id, []).append(name)
        by_key.setdefault(keys[0], set()).add(doc_id)

    # **2人以上が同じ字になったら、どちらにも足さない**
    clash = {k for k, ids in by_key.items() if len(ids) > 1}
    if _break("clash"):
        clash = set()
    for k in clash:
        blocked |= by_key[k]
    out: dict = {}
    for doc_id, names in want.items():
        keep = [x for x in names if keys_of([x])[0] not in clash]
        n["shared"] += len(names) - len(keep)
        if not keep:
            continue
        room = MAX_ALIASES - len(book[doc_id]["aliases"])
        if room <= 0:
            n["full"] += len(keep)
            continue
        if len(keep) > room:
            n["full"] += len(keep) - room
            keep = keep[:room]
        out[doc_id] = keep
    if _break("add"):
        out = {}
    return out, n, sorted(blocked)


# ---------------------------------------------------------------- 対照
#
# **本物に1行も書く前に、毎回回る。** 仕込みの名前は形だけ本物に似せた
# 作り物で、本物のハンドルも名前も1つも入っていない。

_C_DOC = {k: f"{i}" + "0123456789abcdef" * 2 for i, k in enumerate(
    ["add", "taken", "holder", "blind", "same1", "same2", "handle"])}

# 書類ID -> (channelName, 取ってきた結果)
_C_BOOK = {
    # 1. 足すべき人。**チャンネル名はハンドルと別の字**
    "add": ("@shikakuhensei1234", Got(GOT, "しかく へんせい")),
    # 2. ぶつかる人。取ってきた字を、別の人がもう持っている
    "taken": ("@kabusenin0001", Got(GOT, "かぶせにん")),
    "holder": ("かぶせにん", Got(NONE, why="（引かない）")),
    # 3. 取れなかった人。**「名前が無い」に混ぜない**
    "blind": ("@todokazu9999", Got(BLIND, why="届かない")),
    # 4. 2人が同じ字になる
    "same1": ("@futarime0001", Got(GOT, "ふたりめ")),
    "same2": ("@futarime0002", Got(GOT, "ふたりめ")),
    # 5. ハンドルと同じ字。**引ける字が増えないので足さない**
    "handle": ("@onajiji1234", Got(GOT, "onajiji1234")),
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


def _control_book() -> tuple:
    book: dict = {}
    got: dict = {}
    for key, (channel, g) in _C_BOOK.items():
        doc = _C_DOC[key]
        aliases: list = []
        keys = set(keys_of([channel] + aliases))
        book[doc] = {"emoji": "🐚", "channel": channel, "channelId": "UC" + key,
                     "aliases": aliases, "keys": keys}
        got[doc] = g
    # `holder` は「かぶせにん」を生の名前として持っている人
    return book, got


def run_control() -> list:
    """**対照。** 落ちた理由を並べて返す。空なら通った。"""
    bad: list = []
    book, got = _control_book()
    todo, n, blocked = plan(book, got)

    # 1. 足すべき人に足せる
    want = todo.get(_C_DOC["add"])
    if want != [_C_BOOK["add"][1].name]:
        bad.append("(1) 足すべき人に足せていない")

    # 2. ぶつかる人に足さない。**いちばん危ない足**
    if _C_DOC["taken"] in todo or _C_DOC["holder"] in todo:
        bad.append("(2) 他の人の鍵とぶつかる人に足そうとした")
    elif n["taken"] != 1:
        bad.append(f"(2) ぶつかりの数え方が違う（{n['taken']}、欲しいのは 1）")
    if _C_DOC["same1"] in todo or _C_DOC["same2"] in todo:
        bad.append("(2) 2人が同じ字になるのに足そうとした")
    elif n["shared"] != 2:
        bad.append(f"(2) 同じ字の数え方が違う（{n['shared']}、欲しいのは 2）")
    if _C_DOC["handle"] in todo:
        bad.append("(2) ハンドルと同じ字なのに足そうとした")
    if len(blocked) != 3:
        bad.append(f"(2) 足さないと決めた人数が違う（{len(blocked)}、欲しいのは 3）")

    # 3. 取れなかった人を「名前が無い」に混ぜない
    if _C_DOC["blind"] in todo:
        bad.append("(3) 取れていない人に足そうとした")
    if n["blind"] != 1:
        bad.append(f"(3) 取れなかった人数が違う（{n['blind']}、欲しいのは 1）")
    if n["noname"] != 1:
        # 仕込みで「名前が無い」のは `holder` の1人だけ
        bad.append(f"(3) 名前が無い人数が違う（{n['noname']}、欲しいのは 1）")

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


# ---------------------------------------------------------------- 書く


def write(todo: dict, token: str) -> tuple:
    """口に頼んで `aliases` を足す。**鍵は向こうが作る。**

    Args:
        todo: 書類ID -> 足す呼び名の一覧
        token: オーナーの札

    Returns:
        (書いた人数, 足した件数)
    """
    # **いまの値を口から取り直す。** 口は送られたぶんで置き換えるので、
    # 手元の古い写しから送ると、その間に直された呼び名が消える
    cur_list = call("GET", "/characters", token).get("characters") or []
    cur = {c.get("id"): c for c in cur_list if isinstance(c, dict)}
    log.info("図鑑が口から %d人ぶん返りました", len(cur))

    people = added = 0
    for doc_id, names in todo.items():
        c = cur.get(doc_id)
        if not c:
            log.warning("  %s が図鑑から消えています。飛ばします", mask(doc_id))
            continue
        aliases = [a for a in (c.get("aliases") or []) if isinstance(a, str)]
        have = {norm_key(a) for a in aliases}
        add = [x for x in names if norm_key(x) not in have]
        add = add[:max(0, MAX_ALIASES - len(aliases))]
        if not add:
            continue
        body = {
            # **送らなかった欄は消える。** いま入っているものを乗せ直す
            "channelName": clean(c.get("channelName"), MAX_NAME),
            "emoji": clean(c.get("emoji"), 16),
            "aliases": aliases + add,
        }
        try:
            call("POST", f"/characters/{doc_id}", token, body)
        except SystemExit as e:
            # `_owner.call` は断られた文に**道（＝書類ID）をそのまま**載せる。
            # 公開のログに出るので、指紋に置き換えて投げ直す
            raise SystemExit(
                f"{mask(doc_id)} への書き込みが断られました"
            ) from e
        people += 1
        added += len(add)
        log.info("  %s %s ← %d件 足しました",
                 mask(doc_id), c.get("emoji") or "（絵文字なし）", len(add))
    return people, added


# ---------------------------------------------------------------- 本体


def main() -> None:
    a = args()
    apply = a.get("apply") is True
    limit = a.get("limit")
    limit = int(limit) if isinstance(limit, (int, float)) else None
    budget = a.get("budget_min")
    budget = float(budget) * 60 if isinstance(budget, (int, float)) else BUDGET

    # **対照が先。** 外れたら、本物の数字を1つも出さずに 2 で止まる
    bad = run_control()
    if bad:
        log.error("対照が落ちました。**本物には1バイトも触っていません**")
        for line in bad:
            log.error("  %s", line)
        raise SystemExit(2)
    log.info("対照 4つ、通りました（足す／ぶつかる／取れない／書かない）")

    client = db()
    src = guard(client, apply)

    book = roster(src)
    if not book:
        # 0人と「読めていない」を同じ顔で返さない
        log.error("図鑑が1件も返りませんでした。**何も書いていません**")
        raise SystemExit(2)
    before = shape(book)
    log.info("図鑑（はじめ）: %d人 / 姿 %s", len(book), before)

    got = fetch_all(book, budget=budget)
    todo, n, blocked = plan(book, got)

    log.info("名前を取りに行った結果")
    log.info("  取れた                       … %d人", n["got"])
    log.info("  **取れなかった**（届かない・締め出し）… %d人", n["blind"])
    log.info("  チャンネルが消えている       … %d人", n["gone"])
    log.info("  取れたが、名前が空だった     … %d人", n["noname"])
    log.info("  channelId を持っていない     … %d人", n["noid"])
    if not n["got"]:
        # **1人も取れていないのに「足すものはありません」と言わない**
        log.error("1人も名前を取れませんでした。"
                  "**0人だったのか、届かなかったのかが分けられません**")
        raise SystemExit(2)

    log.info("足す／足さないの仕分け")
    log.info("  ハンドルと同じ字             … %d人", n["handle"])
    log.info("  もう同じ字で引ける           … %d人", n["already"])
    log.info("  **他の人の鍵とぶつかる**     … %d人", n["taken"])
    log.info("  **2人が同じ字になる**        … %d件", n["shared"])
    if n["full"]:
        log.info("  呼び名がいっぱいで足せない   … %d件", n["full"])
    log.info("  ぶつかって足さない人           … %d人", len(blocked))
    for who in blocked[:40]:
        log.info("    ぶつかって足さない: %s %s",
                 mask(who), book[who]["emoji"] or "（絵文字なし）")

    if limit is not None and limit >= 0:
        todo = dict(list(todo.items())[:limit])
        log.info("limit=%d のぶんだけにしました", limit)

    if todo:
        log.info("足す先: %d人 / 足す呼び名: %d件",
                 len(todo), sum(len(v) for v in todo.values()))
        for doc_id, names in todo.items():
            v = book[doc_id]
            for name in names:
                # **名前は1文字も出さない。** 出すのは指紋と字数だけ。
                # 「この人に、この字が足される」は指紋で突き合わせられる
                log.info("  足す: %s %s / ch %s ← 鍵 %s（%d字）",
                         mask(doc_id), v["emoji"] or "（絵文字なし）",
                         mask(v["channelId"]), mask(norm_key(name)),
                         len(name))
    else:
        log.info("足すものはありません")

    if apply and todo:
        token = owner_token(src)
        log.info("口に頼む札を取りました")
        people, added = write(todo, token)
        log.info("書きました: %d人 / %d件", people, added)
        log.info("**口が lookupKeys を焼き直しています。**"
                 "食い違いが 0 かどうかは alertbox_names で数えてください")
    elif not apply:
        log.info("---- 下見です。1バイトも書いていません ----")
        log.info('書くには {"apply": true} を付けてください')

    # **前後で図鑑を数え直す。** 下見なら1件も変わっていないはず
    after_book = roster(src)
    after = shape(after_book)
    same = "はじめと同じ" if after == before else "**変わりました**"
    log.info("図鑑（おわり）: %d人 / 姿 %s ← %s", len(after_book), after, same)
    if not apply and after != before:
        log.error("下見なのに図鑑が変わりました")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
