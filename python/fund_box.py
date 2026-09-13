"""豚の貯金箱（投げ銭の控え・支出・目標）。**合計の出しかたは、ここ1か所。**

## なぜ1か所に置くのか

同じ額を出すところが、いまリポジトリに3つある。

  - `app/alertbox/index.tsx`  … OBS の豚。`startAmount + superChatAmount + doneruAmount`
  - `functions/src/islandApi.ts` の `GET /fund` … 上と同じものを GAS から読む
  - この控え（これから）

**式が3つあると、いつか3つが違う額を言う。** 実際、サイトが一度
360,096円 と出して、同じ時刻の豚が 37,800円 だったことがある
（`docs/nordic-fund.md` 2.2）。だから式はここにだけ書いて、
`docs/nordic-fund.md` 9章に同じものを日本語で残す。

## 式

    貯金箱 = スパチャ合計 ÷ 2 + Doneru － 支出合計

**「÷ 2」は仕様で、演出でも丸めでもない。** あやとの言葉:
「スパチャは投げ銭してくれたお金の**半分**を貯金箱に入れている」。
OBS 側にも同じ数（`SUPERCHAT_CONVERSION_RATE = 0.5`）が置いてあるが、
**なぜ半分なのかは、これまでどこにも書かれていなかった。**

切り捨ての位置も OBS に合わせる。あちらは1件ごとに
`Math.floor(jpy * 0.5)` している……**ように見えるが、豚の起点になっている
GAS の `superChatAmount` は `=SUM(SuperChats!$D$2:$D)/2`、つまり
「全部足してから半分」。** 1件ずつ半分にすると、奇数円のスパチャの数だけ
ずれる。**合計してから半分にする。** ここを間違えると1円単位で狂う。

## Doneru はここに入れない

Doneru の額は向こうの API（`api.doneru.jp/widget/goal/data`）が持っている
累計で、こちらは控えを持たない。持つと二重管理になるし、鍵が要る。
**Firestore に置くのはスパチャの控えと支出だけ**で、Doneru は読むときに足す。

## 書類ID＝重ならない鍵

**同じスパチャを2回入れても増えないこと**が、この仕組みのいちばん大事な性質。
入り口が3つ（OBS のアラートボックス・BigQuery・手入力）あるので、
3つが同じものを指したときに1件に潰れる鍵が要る。

YouTube のスパチャには26文字の item id がある。**出どころが違っても、
ここに行き着く。**

  - アラートボックス（YouTube Data API）… `LCC.` + base64url(protobuf)
    → 中に `CKPjqsSD8JEDFczAwgQdOK04Iw`
  - BigQuery `chat_messages.event_id` … base64(protobuf)
    → 中に同じ `CKPjqsSD8JEDFczAwgQdOK04Iw`

**この2つは、そのまま比べると1件も一致しない**（44文字と40文字で、
包み方が違うだけ）。ほどいて26文字にして初めて突き合わせられる。
実測でそこまで確かめてある（`docs/nordic-fund.md` 9章）。

手で入れたぶんは `manual-…`。GAS から移した16件は向こうのIDをそのまま使う
（移行を2回流しても増えないため）。
"""

import base64
import binascii
import hashlib
import json
import re
import urllib.request
from datetime import datetime, timedelta, timezone

# スパチャのうち、貯金箱に入る割合。**仕様。演出ではない。**
SUPERCHAT_RATE = 2  # 「÷ 2」。割る数で持つ（0.5 を掛けると浮動小数点が入る）

# コレクション名。**新しく3つ作る。** island/state に押し込まないのは、
# 1件1書類でないと「2回入れても増えない」が作れないため。
C_SUPERCHAT = "islandFundSuperChats"
C_SPEND = "islandFundSpends"
C_GOAL = "islandFundGoals"

JST = timezone(timedelta(hours=9))

# GAS の表（配信の OBS が読んでいるのと同じもの）。鍵は要らない。
GAS = (
    "https://script.google.com/macros/s/"
    "AKfycbycK8SzzuTbs6z-DUmju7eFjb4qXQPACCeq3PCWPTmZwtUxwokDgqnVa3uPl0UhBNEj"
    "/exec"
)

# 26文字の item id。YouTube が付ける形。
ITEM_ID = re.compile(r"^[A-Za-z0-9_-]{26}$")


def item_id_from_lcc(v: str) -> str:
    """アラートボックスが記録したID（`LCC.…`）から26文字を取り出す。

    Args:
        v: `LCC.` で始まる44文字ぶんの base64url

    Returns:
        26文字の item id。ほどけなければ空文字
    """
    if not v.startswith("LCC."):
        return ""
    b = v[4:]
    b += "=" * (-len(b) % 4)
    try:
        raw = base64.urlsafe_b64decode(b)
    except (binascii.Error, ValueError):
        return ""
    tail = raw[-26:].decode("ascii", "ignore")
    return tail if ITEM_ID.match(tail) else ""


def item_id_from_event(v: str) -> str:
    """BigQuery の `event_id` から26文字を取り出す。

    Args:
        v: `ChwKGk…` の40文字ぶんの base64

    Returns:
        26文字の item id。ほどけなければ空文字
    """
    b = v + "=" * (-len(v) % 4)
    try:
        raw = base64.b64decode(b)
    except (binascii.Error, ValueError):
        return ""
    tail = raw[-26:].decode("ascii", "ignore")
    return tail if ITEM_ID.match(tail) else ""


def manual_id(day: str, yen: int, who: str) -> str:
    """手で入れるスパチャの書類ID。

    **同じ日・同じ額・同じ人を2回入れても、同じIDになる。** 二重登録は
    書けるのではなく、上書きになって増えない。別人が同じ額を同じ日に
    出した場合は `who` が違うので分かれる。

    Args:
        day: JST の日付（`2026-09-10`）
        yen: 円
        who: 出した人の名前（分からなければ空文字でよい）

    Returns:
        `manual-20260910-xxxxxxxx` の形の書類ID
    """
    seed = f"{day}|{yen}|{who}".encode("utf-8")
    h = hashlib.sha1(seed).hexdigest()[:8]
    return f"manual-{day.replace('-', '')}-{h}"


def claim_key(day: str, yen: int) -> str:
    """手で入れた1件が「あとで BigQuery から出てくる同じもの」を待つ札。

    ## なぜ要るか（実測で見つかった）

    アラートボックスが取りこぼした晩、あやとは手でスパチャを入れている
    （GAS の `manual-14` 〜 `manual-16`）。ところが**その3件は BigQuery
    には入っている。** 手入力の書類IDは `manual-…` で、BigQuery のほうは
    26文字の item id なので、**書類IDでは重ならない。**

    そのまま毎晩の掃除を回すと、同じスパチャが2件になって貯金箱が増える。
    2026-09-11 の実測で、直近30日の BigQuery 35件のうち32件は控えと同じ
    書類IDに着き、**残り3件がちょうどこの手入力3件だった。**

    そこで手入力には「日付と額」の札を付けておく。BigQuery から同じ日・
    同じ額のものが出てきたら、**それはこの手入力のことだと見なして足さない。**
    札は1件につき1回しか使えない（`claimedBy` を書き込む）ので、同じ日に
    同じ額のスパチャが2つあっても、2つめはちゃんと足される。

    Args:
        day: JST の日付
        yen: 円

    Returns:
        `2026-08-26|1000` の形。日付が無ければ空文字（札を付けない）
    """
    return f"{day}|{yen}" if day else ""


def spend_id(day: str, title: str, yen: int) -> str:
    """支出の書類ID。**同じ支出を2回入れても増えない。**

    Args:
        day: JST の日付（`2026-05-21`）
        title: 何に使ったか
        yen: 円

    Returns:
        `2026-05-21-xxxxxxxx` の形の書類ID
    """
    h = hashlib.sha1(f"{day}|{title}|{yen}".encode("utf-8")).hexdigest()[:8]
    return f"{day}-{h}"


def box(superchat_yen: int, doneru: int, spend_yen: int) -> int:
    """貯金箱にいくら入っているか。**この式が正。**

        貯金箱 = スパチャ合計 ÷ 2 + Doneru － 支出合計

    **足してから半分にする。** 1件ずつ半分にすると、奇数円のスパチャの
    数だけ豚とずれる（GAS の `=SUM(...)/2` がそうなっている）。

    Args:
        superchat_yen: スパチャの円の合計（半分にする前）
        doneru: Doneru の累計（円）
        spend_yen: 支出の合計（円）

    Returns:
        貯金箱の額（円）
    """
    return superchat_yen // SUPERCHAT_RATE + doneru - spend_yen


def start_amount(spend_yen: int) -> int:
    """GAS の `startAmount` にあたる値（負の数）。

    豚は `startAmount + superChatAmount + doneruAmount` で額を出している。
    `startAmount` はこれまで手で入れた「引く額」で、**中身は支出の合計。**
    移行後も同じ数になっていることを確かめるために、こちらでも出す。

    Args:
        spend_yen: 支出の合計（円）

    Returns:
        負の数
    """
    return -spend_yen


# ---------------------------------------------------------------- 取り込み元


def gas_table(name: str, timeout: int = 30) -> list:
    """GAS の表を1枚まるごと読む。

    Args:
        name: 表の名前（`SuperChats` / `Goals`）
        timeout: 秒

    Returns:
        行の配列
    """
    url = f"{GAS}?table={name}"
    with urllib.request.urlopen(url, timeout=timeout) as r:
        d = json.loads(r.read().decode("utf-8"))
    v = d.get("data", d)
    return v if isinstance(v, list) else [v]


def to_yen(v) -> int:
    """円の欄を整数にする。読めなければ 0。

    Args:
        v: 表の値

    Returns:
        円
    """
    try:
        return int(round(float(v)))
    except (TypeError, ValueError):
        return 0


def jst_day(iso: str) -> str:
    """ISO8601 を JST の日付にする。読めなければ空文字。

    Args:
        iso: `2026-09-10T23:50:03+09:00` の形

    Returns:
        `2026-09-10`
    """
    s = (iso or "").strip()
    if not s:
        return ""
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(JST).strftime("%Y-%m-%d")
    except ValueError:
        return s[:10] if len(s) >= 10 else ""


def gas_superchats() -> list:
    """GAS の `SuperChats` を、Firestore に入れる形に直す。

    **`jpy`（表の D 列）だけを額として使う。** `amount` は外貨のときに
    現地通貨のままなので、足すと合計が狂う（`=SUM(SuperChats!$D$2:$D)`
    が D 列を見ているのと同じ）。

    Returns:
        `(書類ID, 中身)` の配列。額の読めない行は落とす
    """
    out = []
    for r in gas_table("SuperChats"):
        gid = str(r.get("id") or "").strip()
        yen = to_yen(r.get("jpy"))
        if yen <= 0:
            continue
        at = str(r.get("createdAt") or "").strip()
        name = str(r.get("nickname") or "").strip()
        item = item_id_from_lcc(gid)
        if item:
            doc = item
            src = "alertbox"
        elif gid:
            # `manual-1` … 向こうのIDをそのまま使う。**変えると移行を
            # 2回流したときに増える。**
            doc = gid
            src = "manual"
        else:
            continue
        day = jst_day(at)
        v = {
            "yen": yen,
            "at": at or None,
            "day": day,
            "who": name,
            "currency": str(r.get("currency") or "").strip(),
            "src": src,
            "from": "gas",
        }
        if src == "manual":
            # あとで BigQuery から同じものが出てきたときに、二重にしない札
            v["claim"] = claim_key(day, yen)
            v["claimedBy"] = None
        out.append((doc, v))
    return out


# **`at` を列の名前にしない。** BigQuery の予約語（`AT TIME ZONE`）なので、
# `AS at` と書くと `Unexpected keyword AT` で落ちる。**構文エラーなので、
# 毎晩ぜんぶ落ちる**（2026-09-11 に本番の fund_check で見つけた。手元は鍵が
# 無くて `DefaultCredentialsError` に化けていたので、そこでは出なかった）。
BQ_PAID_SQL = """
SELECT
  event_id,
  purchase_amount_text AS amt,
  SAFE_CAST(REGEXP_REPLACE(purchase_amount_text, r'[^0-9]', '') AS INT64) AS yen,
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%S%Ez', published_at, 'Asia/Tokyo') AS at_iso,
  FORMAT_TIMESTAMP('%Y-%m-%d', published_at, 'Asia/Tokyo') AS jst_day,
  author_name AS who
FROM `{p}.{d}.chat_messages`
WHERE event_type = 'PAID'
  AND published_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @days DAY)
"""


def bq_superchats(project: str, dataset: str, days: int) -> list:
    """BigQuery の直近 N 日ぶんのスパチャを、Firestore に入れる形で返す。

    **円の行だけ拾う。** 外貨（`CA$` / `₪`）が数件混ざっていて、
    豚も GAS も円しか足していない。ここで拾うと合計がずれる。

    Args:
        project: BigQuery のプロジェクトID
        dataset: データセット名
        days: 何日ぶん遡るか

    Returns:
        `(書類ID, 中身)` の配列
    """
    from google.cloud import bigquery

    client = bigquery.Client(project=project)
    cfg = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("days", "INT64", days)]
    )
    rows = list(client.query(BQ_PAID_SQL.format(p=project, d=dataset), cfg).result())
    client.close()
    out = []
    for r in rows:
        if not str(r["amt"] or "").startswith("¥"):
            continue
        yen = int(r["yen"] or 0)
        if yen <= 0:
            continue
        doc = item_id_from_event(str(r["event_id"]))
        if not doc:
            continue
        out.append(
            (
                doc,
                {
                    "yen": yen,
                    "at": r["at_iso"],
                    "day": r["jst_day"],
                    "who": str(r["who"] or ""),
                    "currency": "円",
                    "src": "bigquery",
                },
            )
        )
    return out


# ---------------------------------------------------------------- Firestore


def read_sums(db) -> dict:
    """控えと支出を数えて、合計を出す。

    **索引を作らない。** どちらも並べ替えも絞り込みもせず、そのまま全部
    読む（うちは複合索引を作れない。GitHub #168）。411件と数件なので、
    1回の読みで足りる。

    Args:
        db: Firestore クライアント

    **`people` は書かない。** `island/state.fund.people` は BigQuery の
    チャンネルIDで数えた人数（延べではなく人）で、こちらは名前でしか
    数えられない。同じ名前を上書きすると、人数が静かに減る。

    Returns:
        `superchatFull` `superchat` `count` `spend` `spendCount` `names`
    """
    full = 0
    count = 0
    who = set()
    for d in db.collection(C_SUPERCHAT).stream():
        v = d.to_dict() or {}
        full += int(v.get("yen") or 0)
        count += 1
        n = str(v.get("who") or "").strip()
        if n:
            who.add(n)
    spend = 0
    spend_count = 0
    for d in db.collection(C_SPEND).stream():
        v = d.to_dict() or {}
        spend += int(v.get("yen") or 0)
        spend_count += 1
    return {
        "superchatFull": full,
        "superchat": full // SUPERCHAT_RATE,
        "count": count,
        "names": len(who),
        "spend": spend,
        "spendCount": spend_count,
    }


def read_goal(db) -> dict:
    """いま走っている目標を1つ返す。

    **`to` が空いているものが、いまの目標。** 索引が要らないよう、
    `from` の降順に1件だけ引いて、それが閉じていたら「無し」とする
    （目標は同時に1つしか置かない決まり）。

    Args:
        db: Firestore クライアント

    Returns:
        目標の中身。無ければ空の辞書
    """
    q = db.collection(C_GOAL).order_by("from", direction="DESCENDING").limit(1)
    for d in q.stream():
        v = d.to_dict() or {}
        if v.get("to"):
            return {}
        return v
    return {}
