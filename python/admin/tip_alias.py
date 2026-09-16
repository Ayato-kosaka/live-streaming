"""投げ銭の**名乗りのタイポ**を、その人の呼び名として図鑑に足す。

ARGS 例:
  {"day": "2026-09-16"}                 … 下見。**1バイトも書かない**
  {"day": "2026-09-16", "apply": true}  … あだ名として足す

## 何が起きているか

カードの行が作られるかどうかは `islandTips.channelId` で決まる
（`functions/src/streamEvents.ts` の `mintCards`）。ところが
**カードに誰の絵が乗るかは、まったく別の道で決まる。**
投げたときの名乗り（`displayNameSnapshot` → カードの `nameSnapshot`）を
`islandCharacter.lookupKeys` に当てている（`functions/src/cards.ts` の
`iconsOf`）。

だから Doneru の表示名にタイポが1文字あると、**カードの行はできるのに、
絵も名前も乗らない。** 本人は投げてくれたのに、島に出てこない。

`iconsOf` は**読むたびに引き直している**ので、あとから `lookupKeys` を
足すと**過去のカードにも遡って絵が乗る。** ここが足すのは呼び名だけで、
カードそのものは1行も触らない。

## なぜ、名前の似ている度合いで当てないのか

「1文字違い」で当てにいくと、**別人の絵が公開の面に出る。**
呼び名は短い字（「あお」）が入るので、編集距離1の別人は普通にいる。
島は「2人に当たったら、どちらも使わない」で通してある
（`islandCharacter.ts` の `findBy` が `limit(2)`、`cards.ts` の
`characterBook` が `twice`、`donors.ts` の `findChannel`）。
**当てずっぽうに1人選ぶ道を、ここだけ開けない。**

当てるのは **`islandTips.channelId`** だけ。あれは
`islandDonors`（あやとが手で結んだ対応表）を通って入った値なので、
**人が見て結んだもの**が出どころになる。名前は1文字も見ない。
決め方は2つだけで、どちらも「ちょうど1人」のときしか通さない。

  (a) `islandCharacter.channelId` がその `channelId` と一致する人が1人
  (b) `islandChannels`（チャンネルID → いま名乗っている名前）で名前を
      引いて、その名前が `lookupKeys` でちょうど1人に当たる

(b) を後ろに置くのは、あれが**相手の改名で外れる側**だから
（`characters_link.py` と同じ順番）。

## なぜ鍵（lookupKeys）を Python で作らないのか

`islandCharacter.ts` にこう書いてある。

> **鍵はここで作る。** 画面から作らせない。作り方が2か所にあると、
> 片方だけ直したときに引けない行が静かに増える。

だから**足すのは呼び名（`aliases`）だけ**にして、口
（`POST /island-api/characters/{id}`）に送り、鍵はサーバー側の `keysOf`
に作らせる。ここで `lookupKeys` を組み立てると、`@` の落とし方を1回
直しそこねただけで、赤くならないまま引けない行が増える。

口は `channelName` / `emoji` / `aliases` を**送られたぶんで置き換える**
（`clean()` を通して丸ごと書く）ので、いま入っている値をオーナーとして
`GET /island-api/characters` から取り直してから、足したものを乗せて送る。
**送らなかった欄が消える書き方をしない。** 絵（`plain` / `scene`）は
送らない——送らなければ触られない、と向こうに書いてある。

## なぜ ARGS に名前を取らないのか

**ARGS は公開のログにそのまま出る。** このリポジトリは公開で、Actions の
ログも誰でも読める。名乗りを引数で渡せるようにすると、回すたびに
「誰が、どの名前で投げたか」がログに積まれる。取るのは `day` と `apply`
だけにして、名乗りは**台帳から拾って、外に出さないまま使う。**

同じ理由で、出すのは**件数**と**書類IDの指紋**（`logsafe.mask()`）と
**絵文字**（図鑑が誰にでも返している値）だけ。名乗りの中身も、文字数も
出さない。

## 足すだけ。1つも消さない

`aliases` から取り除く道はここには無い。上限（`MAX_ALIASES`）に当たったら
**足さずに飛ばして、飛ばした件数を出す。** 消して空きを作らない。
"""

import re
import sys

from _fs import args, db, log, need, readonly
from _owner import call, owner_token

sys.path.insert(0, __file__.rsplit("/", 2)[0])

from logsafe import mask  # noqa: E402

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from alertbox_names import keys_of, norm_key  # noqa: E402

TIPS = "islandTips"
CHARACTERS = "islandCharacter"
CHANNELS = "islandChannels"

# Functions 側の MAX_CHARACTERS と同じ
MAX_CHARACTERS = 500
# `islandCharacter.ts` の MAX_ALIASES と同じ。**超えたぶんは向こうで
# 黙って切られる**（`slice(0, MAX_ALIASES)`）ので、送る前にこちらで見る
MAX_ALIASES = 20
# `cards.ts` / `streamEvents.ts` の MAX_NAME と同じ
MAX_NAME = 80
# チャンネルIDの長さ。`UC` + 22文字だが、形は見ずに長さだけで切る
MAX_CHANNEL_ID = 64

# 台帳の `day` は**日本時間の0時区切り**で入っている（`python/island_tips.py`）。
# ここで切り直さない。切り直すと、台帳と1日ずれた日を引くことになる
DAY = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def clean(v, max_len: int) -> str:
    """`streamEvents.ts` の `clean`。**trim してから字数で切る。**

    正規化（`norm_key`）より**先に**切るのが向こうの順番。あとから切ると
    NFKC で字数が変わった名前でひと文字ずれる。

    Args:
        v: 生の値
        max_len: 切る字数

    Returns:
        そろえた字（文字列でなければ空）
    """
    if not isinstance(v, str):
        return ""
    return v.strip()[:max_len]


def roster(src) -> tuple:
    """図鑑を1回だけ全件読む。

    **`cards.ts` の `characterBook` と同じ数え方**にする。あちらは
    同じ鍵が2人に付いていたらどちらも使わないが、ここでは
    「誰かが持っている鍵かどうか」も要る（持っている鍵にもう1人ぶん
    足すと、**ますます誰にも引けなくなる**）ので、**持ち主を集合で持つ。**

    Args:
        src: Firestore クライアント（下見では読むだけの写し）

    Returns:
        (鍵 -> 持ち主の集合, channelId -> 持ち主の集合, 書類ID -> 中身)
    """
    owners: dict = {}
    by_channel: dict = {}
    info: dict = {}
    # **`select` には一覧を渡す。** 字を渡すと1文字ずつの欄を頼むことに
    # なって、中身が空のまま問い合わせだけが通る（`characters_freeze` が
    # 本番で2回踏んだ）
    q = (
        src.collection(CHARACTERS)
        .select(["lookupKeys", "channelId", "aliases", "emoji"])
        .limit(MAX_CHARACTERS)
    )
    for d in q.get():
        v = d.to_dict() or {}
        info[d.id] = {
            "emoji": clean(v.get("emoji"), 16),
            "aliases": [a for a in (v.get("aliases") or [])
                        if isinstance(a, str)],
        }
        for k in (v.get("lookupKeys") or []):
            if isinstance(k, str) and k:
                owners.setdefault(k, set()).add(d.id)
        cid = clean(v.get("channelId"), MAX_CHANNEL_ID)
        if cid:
            by_channel.setdefault(cid, set()).add(d.id)
    return owners, by_channel, info


def channel_name(src, cid: str) -> str:
    """辞書（`islandChannels`）が持っている、いまの名乗り。

    書類IDがチャンネルIDそのものなので1発で引ける。候補は多くても
    数件なので、全件読まずにこちらを叩く。
    """
    d = src.collection(CHANNELS).document(cid).get()
    if not d.exists:
        return ""
    return clean((d.to_dict() or {}).get("name"), MAX_NAME)


def decide(src, cid: str, owners: dict, by_channel: dict):
    """その `channelId` の人を、図鑑の中で1人に決める。

    **決まらなければ None。** 2人以上に当たっても、0人でも None。
    当てずっぽうで1人選ぶと、別人の絵が公開の面に乗る。

    Args:
        src: Firestore クライアント
        cid: 台帳に入っていた channelId
        owners: 鍵 -> 持ち主の集合
        by_channel: channelId -> 持ち主の集合

    Returns:
        (決め方, 書類ID)。決まらなければ None
    """
    hit = by_channel.get(cid) or set()
    if len(hit) == 1:
        return ("a", next(iter(hit)))
    if hit:
        # 2人が同じ channelId を持っている。ここで選ぶのはこちらの仕事ではない
        return None

    # (b) 辞書の名前 → lookupKeys。**改名で外れる側**なので後ろに置く
    name = channel_name(src, cid)
    if not name:
        return None
    ids: set = set()
    for k in keys_of([name]):
        ids |= owners.get(k, set())
    if len(ids) == 1:
        return ("b", next(iter(ids)))
    return None


def fit(aliases: list, names: list) -> tuple:
    """入っている呼び名に、**上限に収まるぶんだけ**足す。

    Args:
        aliases: いま入っている呼び名
        names: 足したい名乗り

    Returns:
        (足す名乗り, 上限で足せなかった件数)
    """
    have = {norm_key(a) for a in aliases}
    add: list = []
    full = 0
    for n in names:
        k = norm_key(n)
        if not k or k in have:
            # 既に同じものが入っている。**何もしない**
            continue
        if len(aliases) + len(add) >= MAX_ALIASES:
            full += 1
            continue
        add.append(n)
        have.add(k)
    return add, full


def plan(src, day: str, owners: dict, by_channel: dict, info: dict) -> tuple:
    """その日の台帳を1行ずつ見て、足す先を決める。**読むだけ。**

    Args:
        src: Firestore クライアント
        day: YYYY-MM-DD（日本時間の0時区切り）
        owners: 鍵 -> 持ち主の集合
        by_channel: channelId -> 持ち主の集合
        info: 書類ID -> 絵文字と呼び名

    Returns:
        (書類ID -> 足す名乗りの一覧, 数えたもの)
    """
    n = {"rows": 0, "no_name": 0, "already": 0, "no_channel": 0,
         "undecided": 0, "by_a": 0, "by_b": 0, "clash": 0, "full": 0}
    want: dict = {}
    decided: dict = {}
    # 鍵 -> その名乗りを足すことになった人。**2人に増えたら、どちらにも
    # 足さない**（同じ鍵を2人が持つと `cards.ts` の `characterBook` が
    # どちらも使わなくなる。足したせいで引けなくなる）
    by_name: dict = {}
    for d in src.collection(TIPS).where("day", "==", day).stream():
        v = d.to_dict() or {}
        n["rows"] += 1
        # **`cards.ts` と同じ切り方**（`clean(nameSnapshot, MAX_NAME)`）。
        # ここだけ違う切り方をすると、当たる／当たらないがずれる
        name = clean(v.get("displayNameSnapshot"), MAX_NAME)
        if not name:
            n["no_name"] += 1
            continue
        keys = keys_of([name])
        if any(k in owners for k in keys):
            # もう引けている。**2人が持っている鍵もここで落とす**——
            # そこへ足すと、ますます誰にも引けなくなる
            n["already"] += 1
            continue
        cid = clean(v.get("channelId"), MAX_CHANNEL_ID)
        if not cid:
            # 紐付いていない人（`islandDonors` に無い どねID）。
            # **名前で当てにいかない。** ここで終わり
            n["no_channel"] += 1
            continue
        if cid not in decided:
            decided[cid] = decide(src, cid, owners, by_channel)
        hit = decided[cid]
        if hit is None:
            n["undecided"] += 1
            continue
        how, doc_id = hit
        n["by_a" if how == "a" else "by_b"] += 1
        # 同じ名乗りで何回も投げてくれていることがある。**1件に畳む**
        got = want.setdefault(doc_id, [])
        if all(norm_key(x) != norm_key(name) for x in got):
            got.append(name)
        for k in keys_of([name]):
            by_name.setdefault(k, set()).add(doc_id)

    # **同じ名乗りが2人ぶんに出ていたら、どちらにも足さない。**
    # 足すと、その鍵は2人のものになって誰にも引けなくなる
    clash = {k for k, ids in by_name.items() if len(ids) > 1}
    out: dict = {}
    for doc_id, names in want.items():
        keep = [x for x in names
                if not any(k in clash for k in keys_of([x]))]
        n["clash"] += len(names) - len(keep)
        if not keep:
            continue
        # 上限に当たるぶんを、下見のうちに数えておく
        add, full = fit(info.get(doc_id, {}).get("aliases") or [], keep)
        n["full"] += full
        if add:
            out[doc_id] = add
    return out, n


def write(src, todo: dict) -> tuple:
    """口に頼んで `aliases` を足す。**鍵は向こうが作る。**

    Args:
        src: Firestore クライアント（札を取るのに使う）
        todo: 書類ID -> 足す名乗りの一覧

    Returns:
        (書いた人数, 足した件数, 上限で足せなかった件数)
    """
    token = owner_token(src)
    log.info("口に頼む札を取りました")

    # **いまの値を口から取り直す。** 口は送られたぶんで置き換えるので、
    # 手元の古い写しから送ると、その間に直された呼び名が消える
    got = call("GET", "/characters", token).get("characters") or []
    cur = {c.get("id"): c for c in got if isinstance(c, dict)}
    log.info("図鑑が口から %d人ぶん返りました", len(cur))

    people = added = full = 0
    for doc_id, names in todo.items():
        c = cur.get(doc_id)
        if not c:
            # 下見のあとで消された。**作り直さない**
            log.warning("  %s が図鑑から消えています。飛ばします", mask(doc_id))
            continue
        aliases = [a for a in (c.get("aliases") or []) if isinstance(a, str)]
        add, over = fit(aliases, names)
        full += over
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
            # `_owner.call` は断られた文に**道（＝書類ID）をそのまま**
            # 載せる。公開のログに出るので、指紋に置き換えて投げ直す
            raise SystemExit(
                f"{mask(doc_id)} への書き込みが断られました"
            ) from e
        people += 1
        added += len(add)
        log.info("  %s %s ← %d件 足しました",
                 mask(doc_id), c.get("emoji") or "（絵文字なし）", len(add))
    return people, added, full


def main() -> None:
    a = args()
    (day,) = need(a, "day")
    day = str(day).strip()
    if not DAY.match(day):
        log.error("day は YYYY-MM-DD で渡してください"
                  "（台帳と同じ、日本時間の0時区切り）")
        raise SystemExit(1)
    apply = a.get("apply") is True

    client = db()
    # **下見のあいだは書く口ごと塞ぐ。** `if apply:` を書き忘れても止まる
    src = client if apply else readonly(client)

    owners, by_channel, info = roster(src)
    log.info("図鑑: %d人（引ける鍵 %d本）", len(info), len(owners))
    if not info:
        # 0人と「読めていない」を同じ顔で返さない
        log.error("図鑑が1件も返りませんでした。**何も書いていません**")
        raise SystemExit(2)

    todo, n = plan(src, day, owners, by_channel, info)
    log.info("%s の台帳: %d件", day, n["rows"])
    log.info("  名乗りが図鑑に当たっている   … %d件", n["already"])
    log.info("  名乗りが空                   … %d件", n["no_name"])
    log.info("  channelId が入っていない     … %d件", n["no_channel"])
    log.info("  channelId から1人に決まらない … %d件", n["undecided"])
    log.info("  1人に決まった                … %d件"
             "（channelId で %d / 辞書の名前で %d）",
             n["by_a"] + n["by_b"], n["by_a"], n["by_b"])
    if n["clash"]:
        log.info("  同じ名乗りが2人ぶんに出た    … %d件", n["clash"])
    if n["full"]:
        log.info("  呼び名がいっぱいで足せない   … %d件", n["full"])

    if not todo:
        log.info("足すものはありません")
        return
    log.info("足す先: %d人 / 足す名乗り: %d件",
             len(todo), sum(len(v) for v in todo.values()))
    for doc_id, names in todo.items():
        log.info("  %s %s ← %d件",
                 mask(doc_id),
                 info.get(doc_id, {}).get("emoji") or "（絵文字なし）",
                 len(names))

    if not apply:
        log.info("---- 下見です。1バイトも書いていません ----")
        log.info('書くには {"apply": true} を付けてください')
        return

    people, added, full = write(src, todo)
    log.info("書きました: %d人 / %d件", people, added)
    if full:
        log.info("呼び名がいっぱいで足せなかった: %d件", full)
    log.info("**カードは読むたびに引き直している**ので、"
             "過去のカードにも絵が乗ります。手前（CDN）が30分ためこむので、"
             "すぐ見たいなら少し待ってから開き直してください")


if __name__ == "__main__":
    main()
