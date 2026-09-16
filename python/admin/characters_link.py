"""図鑑（`islandCharacter`）の**空いている `channelId` を、
確実に分かるぶんだけ埋める。**

## なぜ要るのか

本番の図鑑は 102人中 24人が `channelId` を空のまま持っている
（2026-09-16 20:11 UTC 実測）。空のままだと、その人は**名前でしか引けない。**
名前は変わるが `channelId`（`UC…`）は変わらないので、名前頼みの人は
**その人が YouTube の名前を変えた翌日に「キャラクターが無い」へ化ける。**

ここは、その空欄を**推測せずに**埋める道具。

## なぜ空のままなのか（2026-09-16 に出どころを洗い直して分かったこと）

キャラクターは実在の視聴者さん1人ずつに対してあやとが作ったものなので、
作った時点では誰のものか分かっていた。ではどこに残っているのか——
**どこにも残っていなかった。**

図鑑の元になった Viewers 表（GAS 越しのスプレッドシート）が持っていた列は
`name` / `Emoji` / `Icon` / `videoUrl` の4つで、**チャンネルIDの列が無い**
（`docs/island-character.md` 1章の実測）。だから移行の道具
（`characters_migrate`）は落としたのではなく、**運ぶものを持っていなかった。**

表にあった `name` のうち `@` で始まるものが、いま `channelName` と
`channelKeys` に入っている。**ハンドルは残っている。** 残っていないのは
「ハンドル → チャンネルID」の対応だけで、それは YouTube に訊けば分かる。

人が手で結んだ写しが1つだけ在る——`python/residents_map.json`（22行）。
あやとが Viewers 表から手で写した「絵のID → チャンネルID」で、
**絵のIDは図鑑の書類IDそのもの。** `build_residents.py` は図鑑の
`channelId` を見るようになってこの表を読まなくなった
（`docs/island-character.md`「`residents.ts` はどう作られているか」）。
読まれなくなっただけで、中身は人が結んだ正のまま残っている。

## 出どころは6つ。**上の3つが人の手、下の3つが機械**

| 順 | 出どころ | 何で引くか | どれくらい確かか |
| --- | --- | --- | --- |
| 1 | `residents_map.json` | **書類ID** | あやとが手で写した22行 |
| 2 | `islandDonors` | 名前3つ | あやとが手で結んだ |
| 3 | `islandUsers` | 名前2つ | **本人**がログインした |
| 4 | YouTube `channels.list` | **ハンドル** | YouTube が1人1つを保証 |
| 5 | `islandChannels` | いまの表示名 | 機械。名前は変わる |
| 6 | BigQuery `chat_messages` | 昔の表示名も | 機械。同名の別人がいる |

**1〜3 を先に見るのは、そこが人の手で結んだ正だから**
（`docs/island-db.md` 3.1）。4 は機械だが、**表示名ではなくハンドルで引く**
ので、相手が名前を変えていても当たる。ここがいちばん効く——
名前頼みで当たらなかった人は、名前を変えた人だから。

5 と 6 は表示名なので、同じ名前に複数のチャンネルが付いていることがある。
だから引けた `channelId` が**1つのときだけ**採る。

**見に行って、出どころにならなかったもの**（`docs/island-db.md` 5章）:
`islandCharacter` の書類そのもの（欄は17個あるが、人を指すのは
`channelId` と名前の系統だけ）、`migratedFrom`（ドライブの画像IDと
ハッシュとバイト数だけ）、`islandTips`（`channelId` は `islandDonors` か
BigQuery から来ているので、新しい出どころにならない）。

## 引く鍵は、名簿に**保存されている**ものをそのまま使う

`channelKeys` / `lookupKeys` は保存のときに
`functions/src/islandCharacter.ts` の `keysOf` が作って入れてある。
`@` を落とした形もあちらが一緒に持っているので、**引く側で作り直さない。**

こちらで揃えるのは、**出どころ側の名前だけ**（`src_keys`。`normKey` と
同じ決まり ＋ `@` を落とした形）。出どころ側にも `@` なしを作るのは
`characters_freeze` が2回目の本番でそこを落としたから——名簿が `@…` で
キャラクターの鍵が `@` なしの組は、片側だけ揃えると当たらない。

## 決まらないものは書かない

間違えると**他人のキャラクターが別人に紐づく。** 絵が配信の画面に出るので、
間違いはそのまま人目に触れる。だから、次はどれも「飛ばして数える」に倒す。

- ある書類の鍵から `channelId` が**2つ以上**引けた → 飛ばす
- 引けた `channelId` が、**すでに別の書類に付いている** → 飛ばす
- **2つの書類が同じ `channelId` を指した** → 両方飛ばす
  （どちらが本人か、ここでは決められない。**指紋で報告する**）
- 人の手（1〜3）と機械（4〜6）が**違う `channelId` を指した** →
  **人の手を採る。** ただし件数は別に出す（黙って選ばない）

## 触るのは `channelId` の欄1つだけ

書くのは `update`（`set` ではない）で `channelId` ひとつ。すでに
`channelId` が入っている書類には**引きもしない**（上書きしない）。

## 既定では1バイトも書かない

`{}` は下見。書くのは `{"apply": true}` のときだけで、そのときも
**書いたあとに数え直して**「`channelId` が空の人数」が減ったことを見る。
下見では Firestore の書く口ごと塞いである（`_fs.readonly`）。

## ログに名前を出さない

**このリポジトリは公開で、Actions のログも誰でも読める。**
出すのは**数と、書類IDの指紋（`mask`）と、絵文字**だけ。名前・呼び名・
チャンネルID・ハンドル・どねIDは1文字も出さない。

実行:
  Actions > 管理スクリプトを実行 > script = characters_link
  ARGS: {}                        … 下見。**1バイトも書かない**
        {"apply": true}           … 埋める
        {"apply": true, "limit": 5} … 先に5人だけ埋めて確かめる
        {"yt": false}             … YouTube に訊かずに回す
"""

import json
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
from logsafe import detail_lines, mask  # noqa: E402
from _fs import args, db, log, readonly  # noqa: E402

#: 図鑑
CHARACTERS = "islandCharacter"

#: どねID と YouTube の対応表
DONORS = "islandDonors"

#: ログインした人
USERS = "islandUsers"

#: チャンネルIDと名前の辞書
CHANNELS = "islandChannels"

#: あやとが手で写した「絵のID → チャンネルID」。
#: **絵のIDは図鑑の書類IDそのもの**なので、名前を1度も通さずに結べる
RESIDENTS_MAP = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "residents_map.json",
)

#: 1回のまとめ書きで触る数。Firestore の上限は 500
BATCH = 400

#: 出どころ。**人の手が先、機械があと**
HAND = ("residents_map", "islandDonors", "islandUsers")
MACHINE = ("YouTube", "islandChannels", "BigQuery")
SOURCES = HAND + MACHINE

#: ログに並べるときの短い名前（1人ぶんを1行に収めるため）
SHORT = {
    "residents_map": "地図",
    "islandDonors": "どね",
    "islandUsers": "本人",
    "YouTube": "YT",
    "islandChannels": "辞書",
    "BigQuery": "BQ",
}

#: BigQuery に流してよい大きさ（あやとの決め）。**見積もってから流す**
MAX_BYTES = 1024 ** 3

#: YouTube に訊く上限。空いている人ぶんしか訊かないが、
#: 図鑑が膨らんだ日に黙って何百回も叩かないための止め
MAX_YT = 200

#: ハンドルの形。YouTube のハンドルは3〜30字で、空白も2つ目の印も無い。
#: **これに当たる鍵だけを YouTube に訊く**（表示名を訊いても当たらないし、
#: 1件ぶんの枠を捨てることになる）
HANDLE = re.compile(r"^@[^\s@]{3,30}$")

#: 見えない文字と異体字セレクタ。`characters_add.py` の INVISIBLE と同じもの
#: （＝`islandCharacter.ts` の `normKey`）。**片方だけ変えない。**
INVISIBLE = re.compile(
    "[︎️​-‍﻿⁠᠎­͏؜]"
)


def norm(s) -> str:
    """名前を、名簿の鍵と同じ形にそろえる（`normKey` と同じ）。

    **そろえるだけで、`@` は落とさない。** 落とした形が要るところは
    `src_keys` が両方を作る。

    Args:
        s: 出どころ側の名前（ハンドル・表示名）

    Returns:
        そろえた鍵。空なら空文字
    """
    s = unicodedata.normalize("NFKC", str(s or ""))
    s = INVISIBLE.sub("", s)
    return re.sub(r"\s+", " ", s.strip()).lower()


def src_keys(s) -> list:
    """出どころ側の名前から、引く鍵を作る（`keysOf` と同じ形）。

    **`@` を落とした形も作る。** 名簿の側は保存のときに両方を持っているが、
    出どころ側の名前が `@…` で、キャラクターの鍵が `@` なしの形しか
    無いことがある。片側だけ揃えると、その組は当たらない
    （`characters_freeze` が本番で1度そこを落とした）。

    Args:
        s: 出どころ側の名前

    Returns:
        鍵の一覧（重複なし）
    """
    out = []
    for v in (norm(s), norm(str(s or "").lstrip("@"))):
        if v and v not in out:
            out.append(v)
    return out


def add(table: dict, name, cid: str) -> bool:
    """「名前 → channelId」の表に1つ足す。

    Args:
        table: 鍵 → channelId の集合
        name: 出どころ側の名前
        cid: チャンネルID

    Returns:
        1つでも鍵になったか
    """
    ks = src_keys(name)
    for k in ks:
        table.setdefault(k, set()).add(cid)
    return bool(ks)


def catalog(client) -> dict:
    """図鑑を**1回だけ**全件読んで、埋める相手と、埋めてはいけない値を集める。

    `channelId` が入っている書類は `taken` に入れるだけで、`blanks` には
    入れない。**入っている人には引きもしない**（上書きしないの実体はここ）。

    Args:
        client: Firestore クライアント（下見では読むだけの写し）

    Returns:
        `total`（全体の人数）、`taken`（すでに誰かに付いている channelId）、
        `blanks`（channelId が空の書類。保存済みの鍵と絵文字つき）
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
        had = list(v.get("channelKeys") or [])
        had += list(v.get("lookupKeys") or [])
        for k in had:
            if isinstance(k, str) and k and k not in keys:
                keys.append(k)
        blanks.append({
            "id": d.id,
            "ref": d.reference,
            "keys": keys,
            # **絵文字は出してよい。** 図鑑の口が誰にでも返している値で、
            # あやとが「どの子の話か」を見分けられる手がかりになる
            "emoji": str(v.get("emoji") or ""),
        })

    return {"total": total, "taken": taken, "blanks": blanks}


def map_keys() -> tuple[dict, dict]:
    """`python/residents_map.json` を読む。**書類IDで直に結ぶ。**

    名前を1度も通さないので、この表に載っている人は改名の影響を受けない。
    **もう誰も読んでいない表**（`build_residents.py` が図鑑の `channelId` を
    見るようになって外した）だが、中身はあやとが手で写した正のまま。

    Returns:
        （書類ID → channelId, 数え）
    """
    tally = {"行": 0}
    try:
        with open(RESIDENTS_MAP, encoding="utf-8") as f:
            raw = json.load(f)
    except (OSError, ValueError) as e:
        log.warning("%s が読めません（%s）。この出どころは使いません",
                    os.path.basename(RESIDENTS_MAP), type(e).__name__)
        return {}, tally

    out: dict[str, str] = {}
    for k, v in (raw or {}).items():
        if isinstance(k, str) and isinstance(v, str) and k and v.strip():
            out[k] = v.strip()
            tally["行"] += 1
    return out, tally


def donor_keys(client) -> tuple[dict, dict]:
    """`islandDonors` から「名前の鍵 → channelId」を作る。

    **あやとが手で結んだぶん**がここに入っている（`docs/island-db.md` 3.1）。
    `channelId` が入っている行だけを見て、その行が持っている名前を
    **3つとも**鍵にする——ハンドル（`handle`）・YouTube のチャンネル名
    （`channelName`）・Doneru 側の呼び名（`label`）。どれも**同じ1行**の中の
    名前なので、どれで当たっても結び先は変わらない。`label` を入れるのは、
    図鑑の `lookupKeys` が「Doneru が引く欄」として作られているから。

    Args:
        client: Firestore クライアント

    Returns:
        （鍵 → channelId の集合, 数え）
    """
    out: dict[str, set[str]] = {}
    tally = {"行": 0, "結んである": 0, "鍵になった": 0}

    cols = ["handle", "channelName", "label", "channelId"]
    for d in client.collection(DONORS).select(cols).get():
        v = d.to_dict() or {}
        tally["行"] += 1
        cid = v.get("channelId")
        cid = cid.strip() if isinstance(cid, str) else ""
        if not cid:
            continue
        tally["結んである"] += 1
        got = [add(out, v.get(f), cid)
               for f in ("handle", "channelName", "label")]
        if any(got):
            tally["鍵になった"] += 1

    return out, tally


def user_keys(client) -> tuple[dict, dict]:
    """`islandUsers` から「名前の鍵 → channelId」を作る。

    **本人がログインしたときに入った行**なので、名前とチャンネルIDの
    対応は本人が証明したもの。鍵にするのは `handle` と `name` の2つ。
    `nickname` は島で出す呼び名で、**ほかの人と同じにできる**ので入れない。

    Args:
        client: Firestore クライアント

    Returns:
        （鍵 → channelId の集合, 数え）
    """
    out: dict[str, set[str]] = {}
    tally = {"行": 0, "channelId がある": 0, "鍵になった": 0}

    cols = ["handle", "name", "channelId"]
    for d in client.collection(USERS).select(cols).get():
        v = d.to_dict() or {}
        tally["行"] += 1
        cid = v.get("channelId")
        cid = cid.strip() if isinstance(cid, str) else ""
        if not cid:
            continue
        tally["channelId がある"] += 1
        got = [add(out, v.get(f), cid) for f in ("handle", "name")]
        if any(got):
            tally["鍵になった"] += 1

    return out, tally


def channel_keys(client) -> tuple[dict, dict]:
    """`islandChannels`（辞書）から「表示名の鍵 → channelId」を作る。

    **いま名乗っている名前**しか持っていないので、BigQuery（過去ぜんぶ）の
    部分集合になることが多い。それでも見るのは、辞書が
    `python/island_channels.py` の作った写しで、**ログインしただけで
    1度も喋っていない人**もここには居るから。

    `select` には**一覧**を渡す。字（`select("name")`）を渡すと
    `n` `a` `m` `e` の4つの欄を頼んだことになり、`name` が1件も返らない
    のに問い合わせは通る（`characters_freeze` が本番で2回続けて踏んだ）。

    Args:
        client: Firestore クライアント

    Returns:
        （鍵 → channelId の集合, 数え）
    """
    out: dict[str, set[str]] = {}
    tally = {"行": 0, "名前がある": 0}

    for d in client.collection(CHANNELS).select(["name"]).get():
        v = d.to_dict() or {}
        tally["行"] += 1
        if add(out, v.get("name"), d.id):
            tally["名前がある"] += 1

    return out, tally


def chat_keys() -> tuple[dict, dict]:
    """BigQuery の `chat_messages` から「表示名の鍵 → channelId」を作る。

    **期間で切らない。** 3年前の名前でも `channelId` は変わらないので、
    切ると当てられる人が減るだけ。集約1回で済む。

    `COUNT(DISTINCT author_channel_id)` を必ず見て、**1つの名前に1つの
    チャンネル**のときだけ数え上げる。2つ以上付いていた名前も表には入れて
    おく（引いた先で「曖昧」に落ちて、当てずっぽうにならない）。

    **流す前に見積もる。** 1GB を超えたら引かずに止める（あやとの決め）。
    見ていない出どころを黙って混ぜると、「当たらなかった」が
    「見に行っていない」と同じ顔で出る。

    Returns:
        （鍵 → channelId の集合, 数え）
    """
    from google.cloud import bigquery

    client = bigquery.Client(project=BQ_PROJECT_ID)
    sql = f"""
        SELECT author_name AS name,
               COUNT(DISTINCT author_channel_id) AS cids,
               ARRAY_AGG(DISTINCT author_channel_id LIMIT 2) AS sample
        FROM `{BQ_PROJECT_ID}.{BQ_DATASET}.{BQ_TABLE_CHAT_MESSAGES}`
        WHERE author_name IS NOT NULL
          AND author_channel_id IS NOT NULL
        GROUP BY name
        """
    est = client.query(
        sql, job_config=bigquery.QueryJobConfig(dry_run=True)
    ).total_bytes_processed or 0
    log.info("BigQuery の見積もり: %.1f MB（上限 %d GB）",
             est / 1048576, MAX_BYTES // 1024 ** 3)
    if est > MAX_BYTES:
        log.error("**見積もりが上限を超えました。引かずに止めます**")
        raise SystemExit(2)

    rows = client.query(sql).result()

    out: dict[str, set[str]] = {}
    tally = {"名前": 0, "1人に決まる名前": 0, "複数のチャンネルが使う名前": 0}
    for r in rows:
        tally["名前"] += 1
        if int(r["cids"]) != 1:
            tally["複数のチャンネルが使う名前"] += 1
        else:
            tally["1人に決まる名前"] += 1
        # **鍵ごと捨てない。** そろえた形が同じ名前は1つの鍵に集まるので、
        # ここで複数を入れておくと、引いた先で「曖昧」に落ちる
        for x in r["sample"]:
            if x:
                add(out, r["name"], x)
    return out, tally


def youtube_finder(on: bool = True):
    """ハンドルから `channelId` を引く（YouTube `channels.list`）。

    **ここだけが島の外に訊きに行く。** 表示名ではなく**ハンドル**で引くので、
    相手が名前を変えていても当たる。ハンドルは YouTube が1人に1つしか
    振らないので、返るのは0件か1件。

    訊けなかったとき（鍵が無い・口が答えない）は**その出どころを使わない**
    だけにして、道具は止めない。ほかの5つは動くし、止めると
    「YouTube が答えない日は1人も埋められない」道具になってしまう。

    Args:
        on: False なら1回も訊かない（`{"yt": false}`）

    Returns:
        （ハンドルの一覧 → channelId の集合 を返す関数, 数え）
    """
    cache: dict[str, set] = {}
    tally = {"訊いた": 0, "見つかった": 0, "訊けなかった": 0}
    state: dict = {"client": None, "dead": not on}

    def ask(handles) -> set:
        got: set[str] = set()
        for h in handles:
            if h in cache:
                got |= cache[h]
                continue
            if state["dead"] or tally["訊いた"] >= MAX_YT:
                continue
            if state["client"] is None:
                try:
                    from youtube_api.client import get_youtube_client

                    state["client"] = get_youtube_client(log)
                except Exception as e:  # noqa: BLE001 止めない。使わないだけ
                    log.warning("YouTube に訊けません（%s）。"
                                "この出どころは使いません", type(e).__name__)
                    state["dead"] = True
                    continue
            tally["訊いた"] += 1
            try:
                from youtube_api.client import execute_api_request

                r = execute_api_request(
                    state["client"].channels().list(part="id", forHandle=h),
                    logger=log,
                )
            except Exception as e:  # noqa: BLE001 1件の失敗で全部を捨てない
                # **ハンドルそのものはログに出さない**（ログは公開）
                log.warning("YouTube が答えませんでした（%s）",
                            type(e).__name__)
                tally["訊けなかった"] += 1
                cache[h] = set()
                continue
            ids = {str(i.get("id")) for i in (r.get("items") or [])
                   if i.get("id")}
            cache[h] = ids
            if ids:
                tally["見つかった"] += 1
            got |= ids
        return got

    return ask, tally


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


def hits(b: dict, tables: dict, ask) -> dict:
    """1人ぶんについて、出どころごとに引けた channelId を集める。

    **全部の出どころに当ててから決める。** 先に当たった1つで打ち切ると、
    食い違いが起きていることに気づけない。

    Args:
        b: `catalog()` の `blanks` の1人ぶん
        tables: 出どころ名 → 引く表
        ask: ハンドルから引く関数（YouTube）

    Returns:
        出どころ名 → 引けた channelId の集合（引けた出どころだけ）
    """
    got: dict = {}
    one = tables["residents_map"].get(b["id"])
    if one:
        got["residents_map"] = {one}
    for src in ("islandDonors", "islandUsers", "islandChannels", "BigQuery"):
        s = lookup(b["keys"], tables[src])
        if s:
            got[src] = s
    s = ask([k for k in b["keys"] if HANDLE.match(k)])
    if s:
        got["YouTube"] = s
    return got


def decide(got: dict) -> tuple:
    """引けたものから、入れる `channelId` を決める。

    **人の手（`HAND`）が機械（`MACHINE`）より強い。** 人の手どうしが
    食い違ったら、どちらが正かはここでは決められないので飛ばす。

    Args:
        got: `hits()` の結果

    Returns:
        `(channelId, 出どころ, 食い違った機械の出どころ)`。
        決まらなければ `(None, 飛ばす理由, [])`
    """
    # **順に見て、先に1つへ決まった段を採る。** 段は上から
    # 「人の手」「機械」。同じ段の中で2つに割れたら、そこで止める
    for i, tier in enumerate((HAND, MACHINE)):
        ids = {c for s in tier if s in got for c in got[s]}
        if len(ids) >= 2:
            return None, ("人の手が2つ以上を指した" if i == 0
                          else "2つ以上に当たった"), []
        if not ids:
            continue
        cid = next(iter(ids))
        src = next(s for s in tier if s in got)
        # 採るのは上の段。**下の段が違う人を指した件数は出す**（黙って選ばない）
        below = [x for t in (HAND, MACHINE)[i + 1:] for x in t]
        return cid, src, [s for s in below
                          if s in got and got[s] != {cid}]
    return None, "どこにも当たらない", []


def plan(cat: dict, tables: dict, ask) -> tuple:
    """誰にどの `channelId` を入れるかを決める。**ここでは書かない。**

    Args:
        cat: `catalog()` の結果
        tables: 出どころ名 → 引く表
        ask: ハンドルから引く関数（YouTube）

    Returns:
        （書く予定の一覧, 報告）。一覧は `{"ref", "id", "cid", "src"}`
    """
    rep = {
        "当たった": {s: 0 for s in SOURCES},
        "決め手": {s: 0 for s in SOURCES},
        "飛ばした": {"曖昧": 0, "すでに別の人": 0, "二重": 0, "食い違い": 0},
        "分からない": 0,
        "跡": [],
        "二重": [],
    }
    picked: list[dict] = []

    for b in cat["blanks"]:
        got = hits(b, tables, ask)
        for s in got:
            rep["当たった"][s] += 1
        cid, src, clash = decide(got)
        t = {
            "id": b["id"],
            "emoji": b["emoji"],
            "keys": len(b["keys"]),
            "ats": sum(1 for k in b["keys"] if HANDLE.match(k)),
            "got": {s: len(got.get(s, ())) for s in SOURCES},
            "why": "",
        }

        if not cid:
            t["why"] = src
            if src == "どこにも当たらない":
                rep["分からない"] += 1
            else:
                rep["飛ばした"]["曖昧"] += 1
            rep["跡"].append(t)
            continue
        if clash:
            rep["飛ばした"]["食い違い"] += 1
        if cid in cat["taken"]:
            # その人にはもうキャラクターが在る。**2人目を作らない**
            t["why"] = "すでに別の人に付いている"
            rep["飛ばした"]["すでに別の人"] += 1
            rep["跡"].append(t)
            continue
        picked.append({"ref": b["ref"], "id": b["id"], "cid": cid,
                       "src": src, "emoji": b["emoji"], "trace": t})

    # 同じ channelId を2つの書類が指したら、**どちらも書かない。**
    # どちらが本人かはここでは決められない（片方に入れると人違いになる）
    seen: dict[str, list] = {}
    for p in picked:
        seen.setdefault(p["cid"], []).append(p)
    writes = []
    for p in picked:
        if len(seen[p["cid"]]) > 1:
            p["trace"]["why"] = "同じ人を2つの書類が指した"
            rep["飛ばした"]["二重"] += 1
            rep["跡"].append(p["trace"])
            continue
        rep["決め手"][p["src"]] += 1
        writes.append(p)
    rep["二重"] = [g for g in seen.values() if len(g) > 1]
    return writes, rep


def trace_line(t: dict) -> str:
    """決まらなかった1人を、**名前を出さずに**1行にする。

    出すのは書類IDの指紋・絵文字・鍵の本数・出どころごとの当たり数。
    あやとが `/me` の図鑑で見分けられるだけの手がかりを残しつつ、
    公開のログに素性を出さないため。

    Args:
        t: `plan()` が溜めた1人ぶんの跡

    Returns:
        ログに出す1行
    """
    got = " ".join(f"{SHORT[s]}{t['got'][s]}" for s in SOURCES)
    return (f"    {mask(t['id'])} {t['emoji'] or '（絵文字なし）'} "
            f"鍵{t['keys']}本(@{t['ats']}) {got} … {t['why']}")


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


def sources(store) -> dict:
    """6つの出どころを、引ける形にして揃える。**ここでは決めない。**

    Args:
        store: Firestore クライアント（下見では読むだけの写し）

    Returns:
        出どころ名 → 引く表
    """
    tables = {}

    tables["residents_map"], mt = map_keys()
    log.info("residents_map.json: %d行（書類IDで直に結ぶ）", mt["行"])

    tables["islandDonors"], dt = donor_keys(store)
    log.info("%s: %d行 / channelId が結んである %d行 / "
             "名前の鍵になった %d行（鍵は %d通り）",
             DONORS, dt["行"], dt["結んである"], dt["鍵になった"],
             len(tables["islandDonors"]))

    tables["islandUsers"], ut = user_keys(store)
    log.info("%s: %d行 / channelId がある %d行 / "
             "名前の鍵になった %d行（鍵は %d通り）",
             USERS, ut["行"], ut["channelId がある"], ut["鍵になった"],
             len(tables["islandUsers"]))

    tables["islandChannels"], ht = channel_keys(store)
    log.info("%s: %d行 / 名前がある %d行（鍵は %d通り）",
             CHANNELS, ht["行"], ht["名前がある"],
             len(tables["islandChannels"]))

    tables["BigQuery"], ct = chat_keys()
    log.info("BigQuery %s: 表示名 %d通り / 1人に決まる %d通り / "
             "複数のチャンネルが使っている %d通り（鍵は %d通り）",
             BQ_TABLE_CHAT_MESSAGES, ct["名前"], ct["1人に決まる名前"],
             ct["複数のチャンネルが使う名前"], len(tables["BigQuery"]))

    return tables


def report(cat: dict, rep: dict, writes: list) -> None:
    """数えたものを並べる。**名前は1文字も出さない。**

    Args:
        cat: `catalog()` の結果
        rep: `plan()` の報告
        writes: 書く予定の一覧
    """
    log.info("")
    log.info("出どころごと（空いている %d人に当てた結果）", len(cat["blanks"]))
    for s in SOURCES:
        log.info("  %-14s 当たった %d人 / 決め手になった %d人",
                 s, rep["当たった"][s], rep["決め手"][s])

    log.info("")
    log.info("埋められる: %d人", len(writes))
    log.info("飛ばした: 曖昧 %d人 / すでに別の人に付いている %d人 / "
             "同じ人を2つの書類が指した %d人",
             rep["飛ばした"]["曖昧"], rep["飛ばした"]["すでに別の人"],
             rep["飛ばした"]["二重"])
    log.info("どうやっても分からなかった: %d人", rep["分からない"])
    if rep["飛ばした"]["食い違い"]:
        log.info("  ※ 人の手と機械が違う人を指したのが %d人。"
                 "**人が結んだほうを採りました**", rep["飛ばした"]["食い違い"])

    if rep["二重"]:
        log.info("")
        log.info("**同じ相手を指した書類**（キャラクターが2つある人かも"
                 "しれません。どちらが本物かはここでは決めません）")
        for g in rep["二重"]:
            who = "  と  ".join(
                f"{mask(p['id'])} {p['emoji'] or '（絵文字なし）'}" for p in g)
            log.info("    %s （%d件が同じ1人を指しました）", who, len(g))

    if rep["跡"]:
        log.info("")
        log.info("**決まらなかった人**（%d人）。数は出どころごとの当たり数",
                 len(rep["跡"]))
        log.info("    指紋 絵文字 鍵の本数(@の形) %s … 理由",
                 " ".join(SHORT[s] for s in SOURCES))
        for t in rep["跡"]:
            log.info("%s", trace_line(t))


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

    tables = sources(store)
    ask, yt = youtube_finder(a.get("yt", True) is not False)

    writes, rep = plan(cat, tables, ask)
    log.info("YouTube: ハンドル %d件を訊いた / 見つかった %d件 / "
             "答えが返らなかった %d件",
             yt["訊いた"], yt["見つかった"], yt["訊けなかった"])

    report(cat, rep, writes)

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
