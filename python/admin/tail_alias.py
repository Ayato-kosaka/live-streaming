"""ハンドルの**しっぽを落とした形**を、その人の呼び名として図鑑に足す。

ARGS 例:
  {}                  … 下見。**1バイトも書かない**
  {"apply": true}     … 呼び名として足す
  {"apply": true, "limit": 5} … 先に少しだけ

## 何が起きているか

図鑑（`islandCharacter`）のチャンネル名は**ハンドル**（`@…`）で入っていて、
引き当ては**完全一致**。

| 誰が引くか | 何を見るか |
| --- | --- |
| 口（`GET /characters/lookup?alias=`） | `lookupKeys` |
| カードの絵（`functions/src/cards.ts` の `iconsOf`） | `lookupKeys` |
| 配信の OBS（`app/alertbox`） | `channelName` と `aliases` の生の字 |

ところが**人が打つのはハンドルの人の部分だけ**で、YouTube が付けた
しっぽ（`-r9z` `1234`）までは打たない。だから打っても当たらない。
当たらないと、**配信の画面にその人の絵が出ない**し、カードにも乗らない。

しっぽの見分けかたは `python/name_tail.py` にある。**当てずっぽうではなく、
BigQuery のハンドル 2,335通りを数えて決めた**（そちらの冒頭に表がある）。

## 足すのは `aliases` だけ

`channelKeys`（スパチャがチャンネル名から引く欄）には触らない。
あちらは**取り違えを減らすためにわざと狭くしてある**
（`islandCharacter.ts`「2つに分けてあるのは、取り違えを減らすため」）。
ここが広げるのは Doneru と OBS が見る側だけ。

`aliases` に足すと、口が `lookupKeys` を**焼き直す**（`keysOf`）。
OBS は生の `aliases` を見るので、**同じ1回で両方が直る。**
片方だけ直すと「口では当たるのに配信では当たらない」が増える
（`python/admin/alertbox_names.py` が数えているのがそれ）。

## 鍵（lookupKeys）を Python で作らない

`islandCharacter.ts` にこう書いてある。

> **鍵はここで作る。** 画面から作らせない。作り方が2か所にあると、
> 片方だけ直したときに引けない行が静かに増える。

だから送るのは `aliases` だけで、鍵は口（`POST /characters/{id}`）に作らせる。
口は `channelName` / `emoji` / `aliases` を**送られたぶんで置き換える**ので、
いま入っている値を口から取り直してから乗せ直す（`tip_alias.py` と同じ）。

## ぶつかったら、どちらにも足さない

足した鍵が**他の誰かのもの**だったら、そこへ足すのは人違いの元。
2人が同じ鍵を持つと `cards.ts` の `characterBook` はどちらも使わなくなるので、
**足したせいで、いま引けている人まで引けなくなる。**

  - その鍵を**他の人が既に持っている** → 足さない
  - **2人のしっぽを落とすと同じ字になる** → どちらにも足さない
  - 落とした残りが短い（`name_tail.MIN_BASE` 未満） → そもそも作らない

数えるのは `channelKeys` と `lookupKeys` と**生の名前**の3つぜんぶ。
OBS は生の字を見るので、鍵だけ見ていると OBS 側のぶつかりを見落とす。

## 出さないもの

**このリポジトリは公開で、Actions のログも誰でも読める。**
出すのは件数と、書類IDの指紋（`logsafe.mask()`）と、絵文字
（図鑑が誰にでも返している値）だけ。名前も呼び名もしっぽも1文字も出さない。
ARGS にも名前を取らない（ARGS はログに出る）。
"""

import sys

from _fs import args, db, log, readonly
from _owner import call, owner_token

sys.path.insert(0, __file__.rsplit("/", 2)[0])

from logsafe import mask  # noqa: E402
from name_tail import strip_tail  # noqa: E402

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from alertbox_names import keys_of, norm_key  # noqa: E402

CHARACTERS = "islandCharacter"

# Functions 側の MAX_CHARACTERS / MAX_ALIASES / MAX_NAME と同じ
MAX_CHARACTERS = 500
MAX_ALIASES = 20
MAX_NAME = 80


def clean(v, max_len: int) -> str:
    """`islandCharacter.ts` の `clean`。**trim してから字数で切る。**"""
    if not isinstance(v, str):
        return ""
    return v.strip()[:max_len]


def roster(src) -> dict:
    """図鑑を1回だけ全件読む。

    Args:
        src: Firestore クライアント（下見では読むだけの写し）

    Returns:
        書類ID -> {emoji, names（生の名前）, keys（その人が持っている鍵）}
    """
    out: dict = {}
    # **`select` には一覧を渡す。** 字を渡すと1文字ずつの欄を頼むことになる
    q = (
        src.collection(CHARACTERS)
        .select(["channelName", "aliases", "lookupKeys", "channelKeys",
                 "emoji"])
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
            "aliases": aliases,
            "keys": keys,
        }
    return out


def candidates(book: dict) -> tuple:
    """しっぽを落とした形を作って、足せるものだけ残す。**読むだけ。**

    Args:
        book: `roster()` が返した図鑑

    Returns:
        (書類ID -> 足す呼び名の一覧, 数えたもの, ぶつかって足さない書類IDの一覧)
    """
    n = {"people": len(book), "tailed": 0, "already": 0,
         "taken": 0, "shared": 0, "full": 0}
    # 鍵 -> その鍵を持っている人。**図鑑ぜんぶぶん**
    owner: dict = {}
    for doc_id, v in book.items():
        for k in v["keys"]:
            owner.setdefault(k, set()).add(doc_id)

    want: dict = {}
    # 落とした字 -> 作った人。**2人が同じ字になったら、どちらにも足さない**
    by_base: dict = {}
    tailed_ids = set()
    # **足さないと決めた人。** 数だけでなく指紋も出す（あとで人の目で
    # 見に行けるように。名前は出さない）
    blocked: set = set()
    for doc_id, v in book.items():
        # **ハンドルにしか、しっぽは付かない。** `aliases` は tip_alias が
        # 入れた「本人の名乗り」なので、そこの数字を落とすのは当てずっぽう。
        # 見るのは channelName と、`@` で始まる呼び名だけ
        names = [v["channel"]] + [a for a in v["aliases"] if a.startswith("@")]
        for name in names:
            got = strip_tail(name)
            if not got:
                continue
            base = got[0]
            tailed_ids.add(doc_id)
            keys = keys_of([base])
            if not keys:
                # 正規化すると何も残らない字。**鍵にならないので足さない**
                continue
            if any(k in v["keys"] for k in keys):
                # もう自分で持っている。**何もしない**
                n["already"] += 1
                continue
            others = set()
            for k in keys:
                others |= (owner.get(k, set()) - {doc_id})
            if others:
                # 他の人の鍵。**そこへ足すと人違いになる**
                n["taken"] += 1
                blocked.add(doc_id)
                by_base.setdefault(keys[0], set()).add(doc_id)
                continue
            got_list = want.setdefault(doc_id, [])
            if all(norm_key(x) != norm_key(base) for x in got_list):
                got_list.append(base)
            by_base.setdefault(keys[0], set()).add(doc_id)
    n["tailed"] = len(tailed_ids)

    # **2人以上が同じ字になったら、どちらにも足さない**
    clash = {k for k, ids in by_base.items() if len(ids) > 1}
    for k in clash:
        blocked |= by_base[k]
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
    return out, n, sorted(blocked)


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
    got = call("GET", "/characters", token).get("characters") or []
    cur = {c.get("id"): c for c in got if isinstance(c, dict)}
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


def main() -> None:
    a = args()
    apply = a.get("apply") is True
    limit = a.get("limit")
    limit = int(limit) if isinstance(limit, (int, float)) else None

    client = db()
    # **下見のあいだは書く口ごと塞ぐ。** `if apply:` を書き忘れても止まる
    src = client if apply else readonly(client)

    book = roster(src)
    if not book:
        # 0人と「読めていない」を同じ顔で返さない
        log.error("図鑑が1件も返りませんでした。**何も書いていません**")
        raise SystemExit(2)

    todo, n, blocked = candidates(book)
    log.info("図鑑: %d人", n["people"])
    log.info("  しっぽの付いたハンドルを持つ … %d人", n["tailed"])
    log.info("  落とした形で、もう引ける     … %d件", n["already"])
    log.info("  **他の人の鍵とぶつかる**     … %d件", n["taken"])
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

    if not todo:
        log.info("足すものはありません")
        return
    log.info("足す先: %d人 / 足す呼び名: %d件",
             len(todo), sum(len(v) for v in todo.values()))
    for doc_id, names in todo.items():
        log.info("  %s %s ← %d件", mask(doc_id),
                 book[doc_id]["emoji"] or "（絵文字なし）", len(names))

    if not apply:
        log.info("---- 下見です。1バイトも書いていません ----")
        log.info('書くには {"apply": true} を付けてください')
        return

    token = owner_token(src)
    log.info("口に頼む札を取りました")
    people, added = write(todo, token)
    log.info("書きました: %d人 / %d件", people, added)
    log.info("**口が lookupKeys を焼き直しています。**"
             "食い違いが 0 かどうかは alertbox_names で数えてください")


if __name__ == "__main__":
    main()
