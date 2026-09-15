"""図鑑（`islandCharacter`）の**空いている `channelId` を、確実に分かるぶんだけ埋める。**

## なぜ要るのか

本番の図鑑は 102人中 99人が `channelId` を空のまま持っている
（`characters_gap` の実測・2026-09-15 18:46 UTC）。空のままだと、その人は
**名前でしか引けない。** 名前は変わるが `channelId`（`UC…`）は変わらないので、
名前頼みの人は**その人が YouTube の名前を変えた翌日に「キャラクターが無い」へ
化ける**（`characters_gap` の「名前でしか当たらなかった 24人」がそれ）。

ここは、その空欄を**推測せずに**埋める道具。

## 出どころは2つ。この順で当てる

| 順 | 出どころ | 何を持っているか | どれくらい確かか |
| --- | --- | --- | --- |
| 1 | Firestore `islandDonors` | `handle`（`@…`）と、あやとが手で結んだ `channelId` | **いちばん確か。** 人が見て結んだもの |
| 2 | BigQuery `chat_messages` | `author_name` と `author_channel_id` | 機械。同じ表示名を別の人が使っていることがある |

**`islandDonors` を先に見るのは、そこが人の手で結んだ正だから**
（`docs/island-db.md` 3.1「どねID とチャンネルの対応」）。ハンドルは
YouTube が1人に1つしか振らないので、表示名と違って人同士でぶつからない。

BigQuery の側は**表示名**なので、同じ名前に複数のチャンネルが付いていることが
ある。だから `COUNT(DISTINCT author_channel_id)` を必ず見て、**1つのときだけ**
採る。2つ以上あった名前は、鍵ごと捨てる（当てずっぽうで1人選ばない）。

## 引く鍵は、名簿に**保存されている**ものをそのまま使う

`channelKeys` / `lookupKeys` は保存のときに
`functions/src/islandCharacter.ts` の `keysOf` が作って入れてある。
`@` を落とした形もあちらが一緒に持っているので、**引く側で作り直さない。**
作り直すと、同じ決まりが2か所に散って、片方だけ変わった日に人違いが始まる
（`characters_gap` と同じ考え）。

こちらで揃えるのは、**出どころ側の名前だけ**（`norm`。`characters_add.py` と
同じもの＝`normKey` と同じ決まり）。

## 決まらないものは書かない

間違えると**他人のキャラクターが別人に紐づく。** 絵が配信の画面に出るので、
間違いはそのまま人目に触れる。だから、次はどれも「飛ばして数える」に倒す。

- ある書類の鍵から `channelId` が**2つ以上**引けた → 飛ばす
- 引けた `channelId` が、**すでに別の書類に付いている** → 飛ばす
  （同じ人に2人ぶんのキャラクターが付くほうが、空欄より厄介）
- **2つの書類が同じ `channelId` を指した** → 両方飛ばす
  （どちらが本人か、ここでは決められない）
- `islandDonors` と BigQuery が**違う `channelId` を指した** →
  `islandDonors` を採る（人が結んだ側が正）。ただし件数は別に出す

## 触るのは `channelId` の欄1つだけ

`emoji` も `channelKeys` も `lookupKeys` も `images` も `order` も**読むだけ。**
書くのは `update`（`set` ではない）で `channelId` ひとつ。すでに `channelId` が
入っている書類には**引きもしない**（上書きしない）。

## 既定では1バイトも書かない

`{}` は下見。書くのは `{"apply": true}` のときだけで、そのときも
**書いたあとに数え直して**「`channelId` が空の人数」が減ったことを見る
（`ip_purge` と同じ作法）。下見では Firestore の書く口ごと塞いである
（`_fs.readonly`）ので、`if apply:` を書き忘れても書けない。

## ログに名前を出さない

**このリポジトリは公開で、Actions のログも誰でも読める。**
出すのは**数字と時刻だけ。** 名前も書類IDもチャンネルIDも1つも出さない
（1人ずつの明細は `python/logsafe.py` の `detail_lines` を通してあるので、
Actions では空になる。手元で回したときだけ出る）。

実行:
  Actions > 管理スクリプトを実行 > script = characters_link
  ARGS: {}                        … 下見。**1バイトも書かない**
        {"apply": true}           … 埋める
        {"apply": true, "limit": 5} … 先に5人だけ埋めて確かめる
"""

import os
import re
import sys
import unicodedata
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import (  # noqa: E402
    BQ_DATASET,
    BQ_PROJECT_ID,
    BQ_TABLE_CHAT_MESSAGES,
)
from logsafe import detail_lines  # noqa: E402
from _fs import args, db, log, readonly  # noqa: E402

#: 図鑑
CHARACTERS = "islandCharacter"

#: どねID と YouTube の対応表
DONORS = "islandDonors"

#: 1回のまとめ書きで触る数。Firestore の上限は 500
BATCH = 400

#: 見えない文字と異体字セレクタ。`characters_add.py` の INVISIBLE と同じもの
#: （＝`islandCharacter.ts` の `normKey`）。**片方だけ変えない。**
INVISIBLE = re.compile(
    "[︎️​-‍﻿⁠᠎­͏؜]"
)


def norm(s) -> str:
    """名前を、名簿の鍵と同じ形にそろえる（`normKey` と同じ）。

    **そろえるだけで、`@` は落とさない。** `@` を落とした形は名簿の側が
    保存のときに作って持っている（`keysOf`）。ここで落とすと、同じ決まりを
    2か所に持つことになる。

    Args:
        s: 出どころ側の名前（ハンドル・表示名）

    Returns:
        そろえた鍵。空なら空文字
    """
    s = unicodedata.normalize("NFKC", str(s or ""))
    s = INVISIBLE.sub("", s)
    return re.sub(r"\s+", " ", s.strip()).lower()


def catalog(client) -> dict:
    """図鑑を**1回だけ**全件読んで、埋める相手と、埋めてはいけない値を集める。

    `channelId` が入っている書類は `taken` に入れるだけで、`blanks` には
    入れない。**入っている人には引きもしない**（上書きしないの実体はここ）。

    Args:
        client: Firestore クライアント（下見では読むだけの写し）

    Returns:
        `total`（全体の人数）、`taken`（すでに誰かに付いている channelId）、
        `blanks`（channelId が空の書類。保存済みの鍵つき）
    """
    total = 0
    taken: set[str] = set()
    blanks: list[dict] = []

    for d in client.collection(CHARACTERS).stream():
        v = d.to_dict() or {}
        total += 1

        cid = v.get("channelId")
        if isinstance(cid, str) and cid.strip():
            taken.add(cid.strip())
            continue

        # **保存済みの鍵をそのまま使う。** ここで作り直さない
        keys: list[str] = []
        for k in list(v.get("channelKeys") or []) + list(v.get("lookupKeys") or []):
            if isinstance(k, str) and k and k not in keys:
                keys.append(k)
        blanks.append({"id": d.id, "ref": d.reference, "keys": keys})

    return {"total": total, "taken": taken, "blanks": blanks}


def donor_keys(client) -> tuple[dict, dict]:
    """`islandDonors` から「ハンドルの鍵 → channelId」を作る。

    **あやとが手で結んだぶん**がここに入っている（`docs/island-db.md` 3.1）。
    `handle` と `channelId` の両方が入っている行だけを見る。片方でも欠けて
    いる行は、結ぶ材料になっていない。

    Args:
        client: Firestore クライアント

    Returns:
        （鍵 → channelId の集合, 数え）。集合が2つ以上ある鍵は、
        引いた先で「曖昧」として弾かれる
    """
    out: dict[str, set[str]] = {}
    tally = {"行": 0, "結んである": 0, "鍵になった": 0}

    for d in client.collection(DONORS).stream():
        v = d.to_dict() or {}
        tally["行"] += 1
        cid = v.get("channelId")
        cid = cid.strip() if isinstance(cid, str) else ""
        if not cid:
            continue
        tally["結んである"] += 1
        k = norm(v.get("handle"))
        if not k:
            continue
        out.setdefault(k, set()).add(cid)
        tally["鍵になった"] += 1

    return out, tally


def chat_keys() -> tuple[dict, dict]:
    """BigQuery の `chat_messages` から「表示名の鍵 → channelId」を作る。

    **期間で切らない。** 3年前の名前でも `channelId` は変わらないので、
    切ると当てられる人が減るだけ。135,427行の集約1回で済む。

    `COUNT(DISTINCT author_channel_id)` を必ず見て、**1つの名前に1つの
    チャンネル**のときだけ鍵にする。2つ以上付いていた名前は、その時点で
    誰か決められないので捨てる（`ARRAY_AGG(... LIMIT 2)` は、捨てる理由を
    数えるためだけに2件まで持ち帰っている）。

    Returns:
        （鍵 → channelId の集合, 数え）
    """
    from google.cloud import bigquery

    client = bigquery.Client(project=BQ_PROJECT_ID)
    rows = client.query(
        f"""
        SELECT author_name AS name,
               COUNT(DISTINCT author_channel_id) AS cids,
               ARRAY_AGG(DISTINCT author_channel_id LIMIT 2) AS sample
        FROM `{BQ_PROJECT_ID}.{BQ_DATASET}.{BQ_TABLE_CHAT_MESSAGES}`
        WHERE author_name IS NOT NULL
          AND author_channel_id IS NOT NULL
        GROUP BY name
        """
    ).result()

    out: dict[str, set[str]] = {}
    tally = {"名前": 0, "1人に決まる名前": 0, "複数のチャンネルが使う名前": 0}
    for r in rows:
        tally["名前"] += 1
        k = norm(r["name"])
        if not k:
            continue
        if int(r["cids"]) != 1:
            tally["複数のチャンネルが使う名前"] += 1
            # **鍵ごと捨てない。** そろえた形が同じ名前は1つの鍵に集まるので、
            # ここで複数を入れておくと、引いた先で「曖昧」に落ちる
            out.setdefault(k, set()).update(x for x in r["sample"] if x)
            continue
        tally["1人に決まる名前"] += 1
        out.setdefault(k, set()).update(x for x in r["sample"] if x)
    return out, tally


def lookup(keys: list, table: dict) -> set:
    """その書類の鍵で引ける channelId を全部集める。

    Args:
        keys: 書類に保存されている鍵
        table: 鍵 → channelId の集合

    Returns:
        引けた channelId の集合。1つなら決まる、2つ以上なら曖昧
    """
    got: set[str] = set()
    for k in keys:
        got |= table.get(k, set())
    return got


def plan(cat: dict, donor: dict, chat: dict) -> tuple[list, dict]:
    """誰にどの channelId を入れるかを決める。**ここでは書かない。**

    Args:
        cat: `catalog()` の結果
        donor: `islandDonors` から作った鍵の表
        chat: BigQuery から作った鍵の表

    Returns:
        （書く予定の一覧, 数え）。一覧は `{"ref", "id", "cid", "src"}`
    """
    stats = {
        "islandDonors から": 0,
        "BigQuery から": 0,
        "曖昧で飛ばした": 0,
        "すでに別の人に付いていて飛ばした": 0,
        "同じ人を2つの書類が指して飛ばした": 0,
        "出どころが食い違った": 0,
        "分からなかった": 0,
    }
    picked: list[dict] = []

    for b in cat["blanks"]:
        d = lookup(b["keys"], donor)
        c = lookup(b["keys"], chat)

        # **`islandDonors` が先。** 人が結んだ側を機械に上書きさせない
        if len(d) >= 2 or (not d and len(c) >= 2):
            stats["曖昧で飛ばした"] += 1
            continue
        if len(d) == 1:
            cid, src = next(iter(d)), "islandDonors"
            if len(c) == 1 and next(iter(c)) != cid:
                # 採るのは人が結んだほう。**件数は出す**（黙って選ばない）
                stats["出どころが食い違った"] += 1
        elif len(c) == 1:
            cid, src = next(iter(c)), "BigQuery"
        else:
            stats["分からなかった"] += 1
            continue

        if cid in cat["taken"]:
            # その人にはもうキャラクターが在る。**2人目を作らない**
            stats["すでに別の人に付いていて飛ばした"] += 1
            continue

        picked.append({"ref": b["ref"], "id": b["id"], "cid": cid, "src": src})

    # 同じ channelId を2つの書類が指したら、**どちらも書かない。**
    # どちらが本人かはここでは決められない（片方に入れると人違いになる）
    seen: dict[str, int] = {}
    for p in picked:
        seen[p["cid"]] = seen.get(p["cid"], 0) + 1
    writes = []
    for p in picked:
        if seen[p["cid"]] > 1:
            stats["同じ人を2つの書類が指して飛ばした"] += 1
            continue
        stats[p["src"] + " から"] += 1
        writes.append(p)
    return writes, stats


def fill(client, writes: list) -> int:
    """`channelId` の欄だけを、まとめ書きで入れる。

    `update` を使うのは、**ほかの欄を1つも触らないため**（`set` は
    置き換えになる）。渡す欄は `channelId` ひとつだけ。

    Args:
        client: Firestore クライアント（本物）
        writes: `plan()` が決めた一覧

    Returns:
        書いた件数
    """
    done = 0
    for i in range(0, len(writes), BATCH):
        chunk = writes[i:i + BATCH]
        batch = client.batch()
        for w in chunk:
            batch.update(w["ref"], {"channelId": w["cid"]})
        batch.commit()
        done += len(chunk)
        log.info("  %d / %d", done, len(writes))
    return done


def main() -> int:
    """エントリポイント。**既定は下見。**

    Returns:
        0 なら正常。書いたのに空欄が減っていなければ 1
    """
    a = args()
    apply = bool(a.get("apply", False))
    limit = int(a.get("limit") or 0)

    # **いつ測ったかを最初に出す。** 図鑑は画面からも増えるので、
    # 時刻の無い数字は一人歩きする（`characters_gap` と同じ理由）
    at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    log.info("測った時刻: %s / %s", at,
             "**書きます**" if apply else "下見。**1バイトも書きません**")

    client = db()
    # 下見では書く口ごと塞ぐ。`if apply:` の書き忘れでも本番は動かない
    store = client if apply else readonly(client)

    cat = catalog(store)
    log.info("図鑑（%s）: 全体 %d人 / channelId が空 %d人 / "
             "すでに結んである channelId %d件",
             CHARACTERS, cat["total"], len(cat["blanks"]), len(cat["taken"]))
    no_key = sum(1 for b in cat["blanks"] if not b["keys"])
    log.info("  空いている人のうち、引く鍵を1つも持っていないのが %d人", no_key)

    donor, dt = donor_keys(store)
    log.info("%s: %d行 / channelId が結んである %d行 / "
             "ハンドルの鍵になった %d行（鍵は %d通り）",
             DONORS, dt["行"], dt["結んである"], dt["鍵になった"], len(donor))

    chat, ct = chat_keys()
    log.info("BigQuery %s: 表示名 %d通り / 1人に決まる %d通り / "
             "複数のチャンネルが使っている %d通り（こちらは採らない）",
             BQ_TABLE_CHAT_MESSAGES, ct["名前"], ct["1人に決まる名前"],
             ct["複数のチャンネルが使う名前"])

    writes, stats = plan(cat, donor, chat)
    log.info("")
    log.info("埋められる: %d人（islandDonors から %d人 / BigQuery から %d人）",
             len(writes), stats["islandDonors から"], stats["BigQuery から"])
    log.info("飛ばした: 曖昧 %d人 / すでに別の人に付いている %d人 / "
             "同じ人を2つの書類が指した %d人",
             stats["曖昧で飛ばした"], stats["すでに別の人に付いていて飛ばした"],
             stats["同じ人を2つの書類が指して飛ばした"])
    log.info("どうやっても分からなかった: %d人", stats["分からなかった"])
    if stats["出どころが食い違った"]:
        log.info("  ※ 2つの出どころが違う人を指したのが %d人。"
                 "**islandDonors（人が結んだほう）を採りました**",
                 stats["出どころが食い違った"])

    for line in detail_lines([(w["src"], w["id"], w["cid"]) for w in writes]):
        log.info("%s", line)

    if limit and len(writes) > limit:
        log.info("limit=%d なので、上から %d人だけにします", limit, limit)
        writes = writes[:limit]

    if not apply:
        log.info('下見で終わりました（%d人ぶん書いていません）。'
                 '入れるには {"apply": true}', len(writes))
        return 0
    if not writes:
        log.info("入れるものがありません")
        return 0

    log.info("%d人の channelId を入れます（ほかの欄は1つも触りません）",
             len(writes))
    wrote = fill(client, writes)

    # **「入れたつもり」を作らない。** 同じ実行の中で数え直す
    after = catalog(client)
    log.info("書きました: %d人 / channelId が空の人数 %d人 → %d人",
             wrote, len(cat["blanks"]), len(after["blanks"]))
    if len(after["blanks"]) != len(cat["blanks"]) - wrote:
        log.error("**書いたあとの数が合いません。** 画面に出す前に見てください")
        return 1
    if after["total"] != cat["total"]:
        log.error("**人数が変わりました。** 欄を入れるだけで増減しないはず")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
