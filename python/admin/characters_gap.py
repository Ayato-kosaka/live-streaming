"""**投げ銭してくれたのに、まだキャラクターが作られていない人**を洗い出す。

## 何を見るか

直近 N 日（既定 30日）に出してくれた人を、3つの出どころから集めて、
`islandCharacter` の名簿と突き合わせる。

| 出どころ | 何が入っているか | いつのぶんか |
| --- | --- | --- |
| BigQuery `chat_messages`（`event_type='PAID'`） | チャンネルID と表示名 | 前の晩まで |
| BigQuery `doneru_donations` | Doneru の呼び名と どねID | 前の晩まで |
| Firestore `streamChatMessages` | チャンネルID と表示名（`kind` が本文以外） | **今日のぶん** |

**3つ目が要る理由は、BigQuery が前の晩までしか無いから。**
取り込みは 20:00 UTC の予定で、実際には1〜3時間半遅れて走る。
その日の配信で初めて投げてくれた人は、翌朝までどこにも出てこない。
`collectLiveChat`（5分おき）が Firestore に溜めているぶんを足して埋める。

## 突き合わせは **channelId が先、名前は後**

人の同一性は `channelId`（`UC…`）で見る（`docs/island-db.md` 2.1）。
**名前は変わるが channelId は変わらない。** `islandCharacter` の書類は
`channelId` の欄を持っているので、まずそれで当てる。

名前で当てるのは、`channelId` が入っていない人のための保険。
**保険で当たったぶんは「危うい側」**——相手が名前を変えた翌日には外れる——
なので、`channelId` で当たった人数と分けて数えて出す。

名前の鍵は、**名簿に保存されている `channelKeys` / `lookupKeys` を
そのまま使う**（`functions/src/islandCharacter.ts` の `keysOf`）。
あちらは保存のときに「`@` を落とした形」まで作って入れてあるので、
**引く側で作り直さない。** 作り直すと、あちらの決まりを2か所に持つことになる。

⚠ **名前で引ける範囲には、もともと穴がある。** `@moimoilove6331` で
登録された人は `@moimoilove6331` と `moimoilove6331` では当たるが、
YouTube の**チャンネル表示名**（この人なら `moilove`）では当たらない。
`channelId` で当てる道が要るのは、そこを塞ぐため。

## 名簿は Firestore から **1回だけ**まとめて読む

前はここが `GET /island-api/characters/lookup` を人数ぶん叩いていた
（1人につき最大 名前数×2 回）。遅いうえに、手前の CDN のキャッシュを踏む。
**この道具は `islandDonors` と `streamChatMessages` を読むために
管理者の Firestore をもともと持っている**ので、名簿も直に読める。
新しい権限は要らない。

読んだついでに、**図鑑そのものの健康状態**も数える。
「書類がある＝キャラクターができている」ではない。絵文字が空・`scene` が無い・
`channelId` が無い書類が混ざっていて、それを「あり」に数えると
**半分しかできていない人が、できている人として消える。**

## オーナーの札は要らない

読むのは Firestore（`islandCharacter` / `islandDonors` /
`streamChatMessages`）と BigQuery だけ。**公開の口は叩かない。**
Actions のサービスアカウントで全部足りるので、札は作らない。

## 1バイトも書かない

読むだけ。キャラクターも `islandDonors` も触らない。

## 名前はログに出さない

**このリポジトリは公開で、Actions のログも誰でも読める。**
出すのは**数字だけ**。名前も書類IDもチャンネルIDも1つも出さない。
1人ずつの明細は `python/logsafe.py` の `detail_lines` を通してあるので、
Actions では**空になる**。手元で回したときだけ名前が出る。

実行:
  Actions > 管理スクリプトを実行 > script = characters_gap
  ARGS: {}              … 直近30日
        {"days": 60}    … 日数を変える
"""

import json
import os
import re
import sys
import unicodedata
from datetime import datetime, timezone

from google.cloud import bigquery

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import (  # noqa: E402
    BQ_DATASET,
    BQ_PROJECT_ID,
    BQ_TABLE_CHAT_MESSAGES,
    BQ_TABLE_DONERU_DONATIONS,
)
from logsafe import detail_lines  # noqa: E402
from _fs import args, db, log  # noqa: E402

# `collectLiveChat` が入れる `kind` のうち、**本文だけのもの**。
# これ以外（スパチャ・スーパーステッカー・メンバー加入）が投げ銭の側。
PLAIN_KIND = "textMessageEvent"

# 種。`islandDonors` に無い どねID の逃げ場
SEED = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "donors_seed.json"
)

#: 目に見えない文字と異体字セレクタ。`functions/src/islandCharacter.ts` の
#: `normKey` と**同じ決まり**。片方だけ変えると、名簿にちゃんと居る人を
#: 「まだ無い」と数え始める。
INVISIBLE = re.compile("[​-‍﻿⁠᠎­͏؜]")
VARIATION = re.compile("[︎️]")


def norm(s) -> str:
    """打たれた名前を、名簿の鍵と同じ形にそろえる（`normKey` と同じ）。

    **そろえるだけで、`@` は落とさない。** `@` を落とした形は名簿の側が
    保存のときに作って持っている（`keysOf`）。ここで落とすと、
    同じ決まりが2か所に散る。
    """
    s = unicodedata.normalize("NFKC", str(s or ""))
    s = VARIATION.sub("", s)
    s = INVISIBLE.sub("", s)
    return re.sub(r"\s+", " ", s.strip()).lower()


def catalog(client) -> dict:
    """`islandCharacter` を**1回だけ**全件読んで、突き合わせの材料を作る。

    Returns:
        `ids`（channelId の集合）、`keys`（名前の鍵 → 書類ID）、
        `health`（図鑑そのものの健康状態の数え）
    """
    ids: set[str] = set()
    keys: dict[str, str] = {}
    health = {"人": 0, "channelId が空": 0, "絵文字が空": 0,
              "plain が無い": 0, "scene が無い": 0}

    for d in client.collection("islandCharacter").stream():
        v = d.to_dict() or {}
        health["人"] += 1

        cid = v.get("channelId")
        if isinstance(cid, str) and cid:
            ids.add(cid)
        else:
            health["channelId が空"] += 1

        if not str(v.get("emoji") or "").strip():
            health["絵文字が空"] += 1

        # 絵は `images.plain` / `images.scene` に入る（`islandCharacter.ts` の
        # `picture()`）。**欄が在るだけでは絵があることにならない**ので、
        # 中身が空でないことまで見る
        im = v.get("images")
        im = im if isinstance(im, dict) else {}
        if not im.get("plain"):
            health["plain が無い"] += 1
        if not im.get("scene"):
            health["scene が無い"] += 1

        # **保存済みの鍵をそのまま入れる。** 作り直さない（上の norm 参照）
        for k in list(v.get("channelKeys") or []) + list(v.get("lookupKeys") or []):
            if isinstance(k, str) and k:
                keys.setdefault(k, d.id)

    return {"ids": ids, "keys": keys, "health": health}


def hit(row: dict, cat: dict) -> str | None:
    """1人ぶん、名簿に居るか。**居れば当たり方を返す。**

    Returns:
        `"channelId"`（変わらない鍵で当たった）、`"name"`（名前でしか
        当たらなかった＝危うい側）、当たらなければ None
    """
    cid = row.get("cid") or ""
    if cid and cid in cat["ids"]:
        return "channelId"
    for n in row.get("names") or []:
        k = norm(n)
        if k and k in cat["keys"]:
            return "name"
    return None


def from_bigquery(days: int) -> tuple[dict[str, dict], list[dict]]:
    """BigQuery の2本。スパチャは名前が鍵、Doneru は行のまま返す。"""
    client = bigquery.Client(project=BQ_PROJECT_ID)
    base = f"{BQ_PROJECT_ID}.{BQ_DATASET}"
    out: dict[str, dict] = {}

    # `author_channel_id` を足して持ち帰る。**1人1つに寄せるので
    # `ANY_VALUE`。** 同じ表示名を別のチャンネルが使っていることは有り得るが、
    # そのときは名前で引いても当てられない（口も2件当たったら決めない）ので、
    # ここで複数を抱えても判定が増えない
    sc = client.query(
        f"""
        SELECT author_name AS name,
               ANY_VALUE(author_channel_id) AS cid,
               COUNT(*) AS n,
               MAX(published_at) AS last_at
        FROM `{base}.{BQ_TABLE_CHAT_MESSAGES}`
        WHERE event_type = 'PAID'
          AND author_name IS NOT NULL
          AND published_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {days} DAY)
        GROUP BY name
        """
    ).result()
    for r in sc:
        out[r["name"]] = {
            "src": "スパチャ",
            "names": [r["name"]],
            "cid": r["cid"] or "",
            "n": r["n"],
            "last": r["last_at"],
        }

    # Doneru の表は channelId を持たない（Doneru の中の識別子しか無い）。
    # どねID → channelId は `islandDonors` が持っているので、下で足す
    dn = client.query(
        f"""
        SELECT donor_name AS name, viewer_pk, COUNT(*) AS n, MAX(donated_at) AS last_at
        FROM `{base}.{BQ_TABLE_DONERU_DONATIONS}`
        WHERE donated_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {days} DAY)
        GROUP BY name, viewer_pk
        """
    ).result()
    return out, [dict(r) for r in dn]


def donors(client, pks: set[str]) -> dict[str, dict]:
    """どねID → {ハンドル, チャンネルID}。**正は `islandDonors`、無ければ種。**

    **`channelId` も一緒に持ち帰る。** あやとが手で結んだぶんはここに
    入っていて、それは名前より強い鍵になる（`docs/island-db.md` 3.1）。
    """
    table: dict[str, dict] = {}
    try:
        with open(SEED, encoding="utf-8") as f:
            for d in json.load(f).get("donors", []):
                if d.get("viewerPk") and d.get("handle"):
                    table[d["viewerPk"]] = {"handle": d["handle"], "cid": ""}
    except OSError:
        pass
    for pk in pks:
        doc = client.collection("islandDonors").document(pk).get()
        v = doc.to_dict() if doc.exists else None
        if not v:
            continue
        cur = table.setdefault(pk, {"handle": "", "cid": ""})
        if v.get("handle"):
            cur["handle"] = v["handle"]
        if isinstance(v.get("channelId"), str) and v["channelId"]:
            cur["cid"] = v["channelId"]
    return table


def from_firestore(client, days: int) -> list[dict]:
    """配信中に溜めたぶん（`streamChatMessages`）の、**本文以外**。

    BigQuery に届いていない当日ぶんがここにある。
    **本文が空のスパチャはここにも入らない**（`chatCapture.ts` が
    `if (!messageId || !text) continue;` で落としている）。取りこぼしうる。

    `channelId` も入っている（`chatCapture.ts` の `channelId:`）ので、
    当日ぶんも変わらない鍵で当てられる。
    """
    edge = datetime.now(timezone.utc).timestamp() * 1000 - days * 86400000
    tally: dict[str, dict] = {}
    for d in client.collection("streamChatMessages").stream():
        v = d.to_dict() or {}
        if (v.get("kind") or "") == PLAIN_KIND:
            continue
        at = int(v.get("at") or 0)
        if at and at < edge:
            continue
        name = (v.get("name") or "").strip()
        cid = str(v.get("channelId") or "").strip()
        if not name and not cid:
            continue
        # 同じ人を1つにまとめる鍵は channelId。無い行だけ名前でまとめる
        key = cid or name
        cur = tally.setdefault(key, {"name": name, "cid": cid, "n": 0, "at": 0})
        if not cur["name"]:
            cur["name"] = name
        cur["n"] += 1
        cur["at"] = max(cur["at"], at)
    return list(tally.values())


def day(v) -> str:
    """日付だけにして返す。**時刻までは要らない**（誰かを指す手がかりを増やさない）。"""
    if isinstance(v, (int, float)):
        if not v:
            return "?"
        v = datetime.fromtimestamp(v / 1000, timezone.utc)
    return v.astimezone(timezone.utc).strftime("%Y-%m-%d") if v else "?"


def main() -> None:
    a = args()
    days = int(a.get("days") or 30)
    client = db()

    # **いつ測ったかを最初に出す。** 島は何人もが同時に触っているので、
    # 時刻の無い結果は一人歩きする（「3人足りない」だけが残って、
    # 足したあとの数字と見分けがつかなくなった）
    at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    log.info("測った時刻: %s / 直近 %d日の投げ銭。**1バイトも書きません。**", at, days)

    cat = catalog(client)
    h = cat["health"]
    log.info("図鑑（islandCharacter）: 全体 %d人 / channelId が空 %d人 / "
             "絵文字が空 %d人 / plain が無い %d人 / scene が無い %d人",
             h["人"], h["channelId が空"], h["絵文字が空"],
             h["plain が無い"], h["scene が無い"])
    log.info("  突き合わせに使える鍵: channelId %d件 / 名前 %d件",
             len(cat["ids"]), len(cat["keys"]))

    sc, doneru = from_bigquery(days)
    with_cid = sum(1 for v in sc.values() if v["cid"])
    log.info("BigQuery: スパチャ %d人（うち channelId が取れた %d人）/ Doneru %d件",
             len(sc), with_cid, len(doneru))

    table = donors(client, {r["viewer_pk"] for r in doneru if r.get("viewer_pk")})
    # どねID ごとにまとめる（同じ人が呼び名を変えていることがある）
    by_pk: dict[str, dict] = {}
    for r in doneru:
        pk = r.get("viewer_pk") or r["name"]
        cur = by_pk.setdefault(
            pk, {"src": "Doneru", "names": [], "cid": "", "n": 0, "last": None}
        )
        cur["n"] += r["n"]
        if r["name"] not in cur["names"]:
            cur["names"].append(r["name"])
        known = table.get(pk) or {}
        if known.get("handle") and known["handle"] not in cur["names"]:
            cur["names"].append(known["handle"])
        if known.get("cid"):
            cur["cid"] = known["cid"]
        if cur["last"] is None or r["last_at"] > cur["last"]:
            cur["last"] = r["last_at"]
    log.info("  Doneru はまとめて %d人（同じ人が呼び名を変えているぶんを寄せた）",
             len(by_pk))
    no_handle = [pk for pk in by_pk if not (table.get(pk) or {}).get("handle")]
    if no_handle:
        log.info("  うち %d人は YouTube のハンドルが分かりません（呼び名だけで当てます）",
                 len(no_handle))
    linked = sum(1 for v in by_pk.values() if v["cid"])
    log.info("  うち %d人は islandDonors で channelId に結んであります", linked)

    live = from_firestore(client, days)
    # BigQuery に既に居る人は数えない。**channelId で先に見る**
    seen_cid = {v["cid"] for v in sc.values() if v["cid"]}
    seen_cid |= {v["cid"] for v in by_pk.values() if v["cid"]}
    seen_name = set(sc) | {n for v in by_pk.values() for n in v["names"]}
    fresh = [r for r in live
             if not (r["cid"] and r["cid"] in seen_cid) and r["name"] not in seen_name]
    log.info("Firestore（配信中のぶん）: 投げ銭らしい行から %d人。"
             "うち BigQuery にまだ居ないのが %d人", len(live), len(fresh))

    rows = list(sc.values()) + list(by_pk.values())
    for r in fresh:
        rows.append({
            "src": "当日（Firestore）",
            "names": [r["name"]] if r["name"] else [],
            "cid": r["cid"],
            "n": r["n"],
            "last": r["at"],
        })

    missing = []
    by_id = by_name = 0
    for r in rows:
        how = hit(r, cat)
        if how == "channelId":
            by_id += 1
        elif how == "name":
            by_name += 1
        else:
            missing.append(r)

    log.info("")
    log.info("調べた人数: %d人 / キャラクターあり %d人 / **まだ無い %d人**",
             len(rows), by_id + by_name, len(missing))
    # **後者が危うい側。** 相手が名前を変えた翌日には外れて、
    # 「まだ無い」に化ける。減らすには名簿に channelId を入れる
    log.info("  当たり方: channelId で %d人 / **名前でしか当たらなかった %d人**",
             by_id, by_name)

    for line in detail_lines(
        [(r["src"], ", ".join(r["names"]), f'最後 {day(r["last"])}', f'{r["n"]}回')
         for r in sorted(missing, key=lambda r: str(r["last"]), reverse=True)]
    ):
        log.info("%s", line)
    if missing:
        log.info("名前は出しません（このログは公開）。誰かはオーナー画面で見てください")


main()
