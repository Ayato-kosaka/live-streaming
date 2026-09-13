"""**投げ銭してくれたのに、まだキャラクターが作られていない人**を洗い出す。

## 何を見るか

直近 N 日（既定 30日）に出してくれた人を、3つの出どころから集めて、
1人ずつ `/island-api/characters/lookup` に当てる。

| 出どころ | 何が入っているか | いつのぶんか |
| --- | --- | --- |
| BigQuery `chat_messages`（`event_type='PAID'`） | YouTube のハンドル | 前の晩まで |
| BigQuery `doneru_donations` | Doneru の呼び名と どねID | 前の晩まで |
| Firestore `streamChatMessages` | 表示名（`kind` が本文以外） | **今日のぶん** |

**3つ目が要る理由は、BigQuery が前の晩までしか無いから。**
取り込みは 20:00 UTC の予定で、実際には1〜3時間半遅れて走る。
その日の配信で初めて投げてくれた人は、翌朝までどこにも出てこない。
`collectLiveChat`（5分おき）が Firestore に溜めているぶんを足して埋める。

## 当て方が2本あるのは、名前の付き方が2通りあるから

`islandCharacter` は `channelKeys`（スパチャ用・チャンネル名）と
`lookupKeys`（他の呼び名も含む）の2本で引く（`functions/src/islandCharacter.ts`）。
Doneru の「ゆずたつ」と YouTube の「@ゆずたつ-q3n」は別の字なので、
**どちらか片方で引いて「無い」と決めない。** 両方に当ててから判定する。

どねID からハンドルへ寄せるのは `islandDonors`（正）。
そこに無ければ `python/donors_seed.json`（種）を見る。

## 使うのは公開の口。**オーナーの札は要らない**

図鑑（`GET /characters`）は `channel=` を見ずに全件返すので、
**あれで「この人は居る」を確かめることはできない**（誰で引いても
全員「あり」に見える）。名前で引くのは
`GET /characters/lookup?channel=` / `?alias=` のほうで、こちらは
合言葉も札も無しで引けて、**返るのは絵と絵文字だけ**（名前は返らない）。
打った名前をこちらが既に持っているときだけ答えが返る、という作りなので、
名簿を集める道にはならない。だから札を作らずに済む。

## 1バイトも書かない

読むだけ。キャラクターも `islandDonors` も触らない。

## 名前はログに出さない

**このリポジトリは公開で、Actions のログも誰でも読める。**
1人ずつの明細は `python/logsafe.py` の `detail_lines` を通してあるので、
Actions では**空になる**。出るのは人数だけ。手元で回したときだけ名前が出る。

実行:
  Actions > 管理スクリプトを実行 > script = characters_gap
  ARGS: {}              … 直近30日
        {"days": 60}    … 日数を変える
"""

import json
import os
import sys
import urllib.parse
from datetime import datetime, timezone

import requests
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

API = "https://live-streaming-d3cac.web.app/island-api/characters/lookup"

# `collectLiveChat` が入れる `kind` のうち、**本文だけのもの**。
# これ以外（スパチャ・スーパーステッカー・メンバー加入）が投げ銭の側。
PLAIN_KIND = "textMessageEvent"

# 種。`islandDonors` に無い どねID の逃げ場
SEED = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "donors_seed.json"
)


def lookup(kind: str, name: str) -> str | None:
    """口に1回当てる。当たれば書類ID、外れれば None。"""
    if not name:
        return None
    url = API + "?" + urllib.parse.urlencode({kind: name})
    res = requests.get(url, timeout=30)
    if res.status_code >= 400:
        # **名前は混ぜない。** 落ちた理由はステータスだけで足りる
        raise SystemExit(f"lookup が {res.status_code} で返りました")
    ch = (res.json() or {}).get("character")
    return ch.get("id") if ch else None


def has_character(names: list[str]) -> str | None:
    """渡した呼び名のどれかで当たるか。**チャンネル名と呼び名の両方に当てる。**

    片方で外れても、もう片方で当たることがある（Doneru の呼び名と
    YouTube のハンドルは別の字）。**全部外して初めて「無い」**。
    """
    seen: set[str] = set()
    for n in names:
        n = (n or "").strip()
        if not n or n in seen:
            continue
        seen.add(n)
        for kind in ("channel", "alias"):
            hit = lookup(kind, n)
            if hit:
                return hit
    return None


def from_bigquery(days: int) -> tuple[dict[str, dict], list[dict]]:
    """BigQuery の2本。スパチャは名前が鍵、Doneru は行のまま返す。"""
    client = bigquery.Client(project=BQ_PROJECT_ID)
    base = f"{BQ_PROJECT_ID}.{BQ_DATASET}"
    out: dict[str, dict] = {}

    sc = client.query(
        f"""
        SELECT author_name AS name, COUNT(*) AS n, MAX(published_at) AS last_at
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
            "n": r["n"],
            "last": r["last_at"],
        }

    dn = client.query(
        f"""
        SELECT donor_name AS name, viewer_pk, COUNT(*) AS n, MAX(donated_at) AS last_at
        FROM `{base}.{BQ_TABLE_DONERU_DONATIONS}`
        WHERE donated_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {days} DAY)
        GROUP BY name, viewer_pk
        """
    ).result()
    return out, [dict(r) for r in dn]


def handles(client, pks: set[str]) -> dict[str, str]:
    """どねID → YouTube のハンドル。**正は `islandDonors`、無ければ種。**"""
    table: dict[str, str] = {}
    try:
        with open(SEED, encoding="utf-8") as f:
            for d in json.load(f).get("donors", []):
                if d.get("viewerPk") and d.get("handle"):
                    table[d["viewerPk"]] = d["handle"]
    except OSError:
        pass
    for pk in pks:
        doc = client.collection("islandDonors").document(pk).get()
        v = doc.to_dict() if doc.exists else None
        if v and v.get("handle"):
            table[pk] = v["handle"]
    return table


def from_firestore(client, days: int) -> list[dict]:
    """配信中に溜めたぶん（`streamChatMessages`）の、**本文以外**。

    BigQuery に届いていない当日ぶんがここにある。
    **本文が空のスパチャはここにも入らない**（`chatCapture.ts` が
    `if (!messageId || !text) continue;` で落としている）。取りこぼしうる。
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
        if not name:
            continue
        cur = tally.setdefault(name, {"name": name, "n": 0, "at": 0})
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

    log.info("直近 %d日の投げ銭を見ます。**1バイトも書きません。**", days)

    sc, doneru = from_bigquery(days)
    log.info("BigQuery: スパチャ %d人 / Doneru %d件", len(sc), len(doneru))

    table = handles(client, {r["viewer_pk"] for r in doneru if r.get("viewer_pk")})
    # どねID ごとにまとめる（同じ人が呼び名を変えていることがある）
    by_pk: dict[str, dict] = {}
    for r in doneru:
        pk = r.get("viewer_pk") or r["name"]
        cur = by_pk.setdefault(
            pk, {"src": "Doneru", "names": [], "n": 0, "last": None}
        )
        cur["n"] += r["n"]
        if r["name"] not in cur["names"]:
            cur["names"].append(r["name"])
        if table.get(pk) and table[pk] not in cur["names"]:
            cur["names"].append(table[pk])
        if cur["last"] is None or r["last_at"] > cur["last"]:
            cur["last"] = r["last_at"]
    log.info("  Doneru はまとめて %d人（同じ人が呼び名を変えているぶんを寄せた）",
             len(by_pk))
    no_handle = [pk for pk in by_pk if pk not in table]
    if no_handle:
        log.info("  うち %d人は YouTube のハンドルが分かりません（呼び名だけで当てます）",
                 len(no_handle))

    live = from_firestore(client, days)
    # BigQuery に既に居る人は数えない
    known = set(sc) | {n for v in by_pk.values() for n in v["names"]}
    fresh = [r for r in live if r["name"] not in known]
    log.info("Firestore（配信中のぶん）: 投げ銭らしい行から %d人。"
             "うち BigQuery にまだ居ないのが %d人", len(live), len(fresh))

    rows = list(sc.values()) + list(by_pk.values())
    for r in fresh:
        rows.append({
            "src": "当日（Firestore）",
            "names": [r["name"]],
            "n": r["n"],
            "last": r["at"],
        })

    missing = [r for r in rows if not has_character(r["names"])]

    log.info("")
    log.info("調べた人数: %d人 / キャラクターあり %d人 / **まだ無い %d人**",
             len(rows), len(rows) - len(missing), len(missing))
    for line in detail_lines(
        [(r["src"], ", ".join(r["names"]), f'最後 {day(r["last"])}', f'{r["n"]}回')
         for r in sorted(missing, key=lambda r: str(r["last"]), reverse=True)]
    ):
        log.info("%s", line)
    if missing:
        log.info("名前は出しません（このログは公開）。誰かはオーナー画面で見てください")


main()
