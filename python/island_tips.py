"""投げ銭の台帳（`islandTips`）を作る。#202

YouTube のスパチャ（`chat_messages` の `event_type='PAID'`）と、Doneru の寄付
（`doneru_donations`）と、**島で受けた投げ銭**（Firestore `islandSiteTips`。
#1405・決定の記録 0017）を**1本にまとめて** Firestore に置く。あやと島カードは
ここから組み上がる（`python/island_cards.py`）。台帳の書き手はここ1本。

## なぜ名簿ではなく台帳にするのか

旧 `nordicDays/{YYYY-MM-DD}.people` は「その日いた人」しか持っていなかった。
日付が鍵で、旅の名前がついていて、企画から辿れない。**章＝島 ⊃ 企画 ⊃ 配信**
という決めに合っていない（#202）。

台帳にすると、**どの配信のものか（`videoId`）**が1件ずつに付く。企画と配信は
N:N（1本の配信に企画が何本も乗る）なので、配信から逆に引けないと、
9月11日のように3企画が乗る日を扱えない。

## 配信日の境目は日本時間の0時

旧来は `published_at` / `donated_at` から**9時間引いていた**（＝日本時間の
18時が境目）。旅で時差が9回変わると、そのたびに「その日いた人」が2日に
割れる（#201）。境目は `DATE(..., "Asia/Tokyo")` に固定して、**またいだぶんは
人が決める**（`islandStreamEvent.videoIds` に後半の動画IDを足す）。

実際にまたいでいる配信がある。`MoxSgyW_12k` は 8/30 と 8/31 の両方に
スパチャが入っている。境目をどこに置いても、機械には割れる。

## 流し直しても増えない

書類IDは `sourceEventId` から決まる（SHA-1 の頭32文字）。同じ寄付を何度
取り込んでも同じ書類に上書きされる。**変わっていないものは書かない。**

## 金額は持つ。ただし外に出さない

`amount` を持つのは、いままで意図的に避けていたことの反転（#202 で承認）。
Doneru と突き合わせるのに要る。**代わりに2つ守る。**

1. **島の画面で、金額で並べない・出さない。** 決めは生きている
2. **`islandTips` はクライアントから読めない**（`firestore.rules` で閉じてある）

## 円以外は、その日のレートで円に直して**一緒に持つ**（#951）

2026-10-18 まで、円以外はどこでも足されていなかった（落とすほうが正しいと
決めていた。為替の日付を置く場所が無かったので）。あやとが
「**レートが無料で引けるなら、Firestore に入れるときに直して入れて**」と
決めたので、取り込みのここで直す（`python/fx_rate.py`）。

- **元の表記（`amount` / `currency`）は消さない。** 直した値だけ持つと、
  あとでレートを引き直して検算できない
- 足すのは `amountJpy` と、**使ったレート**（`fxRate`）と、
  **そのレートの日**（`fxDate`）。土日は ECB がレートを出さないので、
  `fxDate` は**直前の営業日**になる（頼んだ日ではない）
- **直せなかったら 0 にしない。** `amountJpy` は None のまま、
  `fxWhy` に理由を残す。issue のほうで知らせる（`python/fx_tips_watch.py`）

## Doneru はチャンネルIDを持っていない

`viewer_pk`（どねID）しか無いので、`islandDonors` の対応表を通す。
紐付いていない人は `channelId: null` で入れる。**台帳には残す**
（金額の突き合わせは紐付けと関係ない）。カードは渡らない。

赤くするのは `python/doneru_supporters.py` の役目なので、ここでは数えて
知らせるだけで、終了コードは 0 のまま。**2か所で赤くしない。**

## 島の投げ銭（`source: island`。#1405）

Stripe の知らせを受けた口（`functions/src/islandApi.ts`）が `islandSiteTips` に
書く。ここはそれを読んで台帳に畳むだけ（台帳の書き手は増やさない）。

- **入れるのは `fund_box.island_counts()` を通るものだけ**——`livemode` が真
  （本番の支払い）で、`status` が `paid`。テストの支払いは台帳に1行も入れない。
  貯金箱（`python/fund_daily.py`）も同じ1本を通すので、両者は食い違わない
- 書類IDは今と同じ作り方（`sourceEventId` = `island:<checkoutSessionId>` の SHA-1）。
  **同じ支払いを何度読んでも1行**
- `channelId` は `islandSiteTips.channelId` をそのまま入れる（口が
  `islandUsers/{uid}.channelId` から引いた値）。名乗りでは当てない
- `day` / `donatedAt` / `videoId` / `videoStartedAt` は **Doneru と同じ当て方**。
  払い終わった時刻（`paidAt`）を日本時間で切り、配信の時間帯（`_WIN`）に当てる

### あとで返金・払い戻しの請求になったら、**台帳から消す**

`status` が `refunded` / `disputed` に変わった支払い（と、`islandSiteTips` から
書類ごと無くなった支払い）は、**台帳の行を消す**（`delete`）。

**印を付けて残さない**のは、台帳を読む所が多いから（カード・図鑑・月末・
円の見張り……）。印にすると、その全部が印を見ないと黙って数えてしまう
（`docs/island-standards.md` 30.4）。消せば、読む側は何も知らなくてよい。
元の記録は `islandSiteTips`（と Stripe）に残るので、消しても戻せる。

**窓で切らない。** 返金はいつ来るか分からない（払い戻しの請求は数か月後にも
来る）ので、島の投げ銭だけは毎晩 `islandSiteTips` を全部読んで見比べる。
数が小さい（1件1支払い）ので、読みは軽い。

### 読めなかった晩は、**島の行を1つも消さない・足さない**

`islandSiteTips` が読めなかったら、島のぶんは丸ごと飛ばす（スパチャと Doneru は
そのまま入れる）。読めなかったのを「0件だった」と読むと、台帳の島の行を
全部消してしまう（`docs/island-standards.md` 10）。**読めたのに0件で、台帳には
島の行が在る**ときも消さない（受け取りの書類は消さない決めなので、それは
読む先を間違えている）。どちらも `::warning::` を出す。

**終了コードは 0 のまま。** ここを赤くすると、後ろのカード作り
（`tips_after_doneru.yml`）まで止まる（`docs/island-standards.md` 31.3）。
受け取りの書類が読めない晩は、同じ書類を読む貯金箱（`python/fund_daily.py`）
のほうが赤くなる。

実行:
  BQ_PROJECT_ID=live-streaming-d3cac python python/island_tips.py
  python python/island_tips.py --days 7
  python python/island_tips.py --all --dry-run
"""

import argparse
import hashlib
import logging
import re
import sys
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from google.cloud import bigquery, firestore

sys.path.insert(0, __file__.rsplit("/", 1)[0])

import fund_box as fb  # noqa: E402
import fx_rate  # noqa: E402
from config import BQ_DATASET, BQ_PROJECT_ID  # noqa: E402
from doneru.dedup import dedup_sql  # noqa: E402
from logsafe import detail_lines  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def log_changed(rows) -> None:
    """入れ替わるぶんの明細を出す。**公開の場では1行も出さない。**

    チャンネルIDと金額が並ぶ＝「誰がいくら出したか」なので、
    誰でも読める Actions のログには出せない（`python/logsafe.py`）。
    `--dry-run` でも同じ。dry-run を Actions から回してもログは公開のまま残る。

    Args:
        rows: 入れ替わる行の一覧
    """
    for line in detail_lines([
        (r["day"], r["source"], r["channelId"], r["amount"]) for r in rows
    ]):
        logger.info("%s", line)

# 集計用の bot。本人の配信通知なので人ではない。
BOT_NAME = "@あやとグルメアプリ"

# 何日ぶんさかのぼるか（--day も --all も指定しないとき）。
# 取り込みが1日こけても翌日に埋まる幅にしておく。
DEFAULT_DAYS = 7

# Firestore の1回のまとめ書きに入る上限。超えると弾かれるので手前で切る。
BATCH = 400

# スパチャの金額表記から通貨を読む。**円だけを前提にしない。**
# 本番の380件に ₪6.00（イスラエル）と CA$2.79（カナダ）が混ざっていた。
#
# **円に直すのは `yen_of()`**（2026-10-18。#951。あやとが「レートが無料で
# 引けるならそれで」と決めた）。元の表記と通貨は**そのまま残す**——
# 直した値だけ持つと、あとでレートを引き直して検算できない。
CURRENCY_MARKS = [
    ("¥", "JPY"),
    ("￥", "JPY"),
    ("CA$", "CAD"),
    ("A$", "AUD"),
    ("NZ$", "NZD"),
    ("HK$", "HKD"),
    ("NT$", "TWD"),
    ("US$", "USD"),
    ("$", "USD"),
    ("€", "EUR"),
    ("£", "GBP"),
    ("₩", "KRW"),
    ("₪", "ILS"),
    ("₱", "PHP"),
    ("₹", "INR"),
    ("R$", "BRL"),
]

# --- YouTube のスパチャ ---------------------------------------------------
# 配信の開始時刻も持つ。0時をまたいだ配信を人が拾うとき、画面に
# 「この配信は何時に始まったか」が出ていないと、どれを足すか決められない。
SQL_YOUTUBE = f"""
SELECT
  m.video_id AS video_id,
  m.event_id AS event_id,
  FORMAT_DATE('%Y-%m-%d', DATE(m.published_at, 'Asia/Tokyo')) AS day,
  UNIX_MILLIS(m.published_at) AS donated_ms,
  UNIX_MILLIS(v.actual_start_time) AS started_ms,
  m.author_channel_id AS channel_id,
  m.author_name AS name,
  m.purchase_amount_text AS amount_text
FROM `{BQ_PROJECT_ID}.{BQ_DATASET}.chat_messages` m
LEFT JOIN `{BQ_PROJECT_ID}.{BQ_DATASET}.videos` v USING (video_id)
WHERE m.event_type = 'PAID'
  AND m.author_channel_id IS NOT NULL
  AND m.author_name != @bot
  AND DATE(m.published_at, 'Asia/Tokyo') BETWEEN @d0 AND @d1
"""

# --- Doneru ---------------------------------------------------------------
# 入金の段階（`status`）では絞らない。「振込待ち」は**あやとへの入金が
# どこまで進んだか**であって、投げ銭が成立したかどうかではない。
#
# ## 動画IDを、時刻から当てる
#
# **Doneru の投げ銭は、どの配信のものかを持っていない。** 生データにあるのは
# 時刻・金額・呼び名だけで、videoId はどこにも無い。
#
# それで困ったのが 2026-09-06 だった。日本時間0時で切ったので、0時をまたいだ
# ひめひめさんと aoi さんの投げ銭が翌日に落ち、その日の写真にカードが
# 付かなかった。あやとの用意した逃げ道（`islandStreamEvent.videoIds` に
# 動画IDを手で足す）は、**足す動画IDが無いので効かない。**
#
# なので**投げ銭の時刻を、配信の時間帯に当てる。** 配信の終わりは持って
# いないが、**その配信の最後のチャット**が実質の終わりなので、そこから出す。
# 当たれば videoId が入り、YouTube のスパチャと同じ土俵に乗る
# （ホワイトリストも効くようになる）。
#
# **終わりから30分の猶予を置く。** チャットが止まってから投げてくれる人が
# いる。逆に、次の配信が始まっていたらそちらが勝つ（`started_at` の新しい
# ほうを採る）ので、猶予で2つに当たることはない。
#
# **寄せる口を通してから当てる。** 置き場には同じ寄付が2行入っている——
# 主キーに精算状態が入っているので、振り込まれた寄付は**別の鍵で生え直して
# 2行になる**（`python/doneru/dedup.py`。#1067）。台帳の書類IDは
# `sourceEventId`（`donation_id` から決まる）なので、寄せないと
# **同じ投げ銭のカードが2枚立つ。**
_DONERU_ROWS = dedup_sql(
    BQ_PROJECT_ID, BQ_DATASET,
    columns=[
        "donation_id",
        "donated_at",
        "viewer_pk",
        "donor_name",
        "amount",
        "settlement_amount",
        "currency",
    ],
    where="donated_at IS NOT NULL\n"
          "    AND DATE(donated_at, 'Asia/Tokyo') BETWEEN @d0 AND @d1",
)

# 配信の時間帯。**Doneru と島の投げ銭が同じ1本を使う**（当て方を2つにしない）
_WIN = f"""win AS (
  SELECT
    v.video_id,
    UNIX_MILLIS(v.actual_start_time) AS started_ms,
    -- 配信の終わり。最後のチャット + 30分。チャットが1件も無い配信は
    -- 当てようがないので、開始から6時間で打ち切る
    UNIX_MILLIS(
      COALESCE(
        TIMESTAMP_ADD(MAX(m.published_at), INTERVAL 30 MINUTE),
        TIMESTAMP_ADD(v.actual_start_time, INTERVAL 6 HOUR)
      )
    ) AS ended_ms
  FROM `{BQ_PROJECT_ID}.{BQ_DATASET}.videos` v
  LEFT JOIN `{BQ_PROJECT_ID}.{BQ_DATASET}.chat_messages` m USING (video_id)
  WHERE v.actual_start_time IS NOT NULL
  GROUP BY v.video_id, v.actual_start_time
)"""

# 時間帯に当たった配信。**またがったら、始まりの新しいほうを採る**（Doneru と島で同じ）
_PICK = """ARRAY_AGG(w.video_id ORDER BY w.started_ms DESC LIMIT 1)[SAFE_OFFSET(0)] AS video_id,
  MAX(w.started_ms) AS started_ms"""

SQL_DONERU = f"""
WITH {_WIN}
SELECT
  d.donation_id,
  FORMAT_DATE('%Y-%m-%d', DATE(d.donated_at, 'Asia/Tokyo')) AS day,
  UNIX_MILLIS(d.donated_at) AS donated_ms,
  d.viewer_pk,
  d.donor_name,
  d.amount,
  d.settlement_amount,
  d.currency,
  -- 時間帯に当たった配信。またがったら、始まりの新しいほうを採る
  {_PICK}
FROM (
{_DONERU_ROWS}
) d
LEFT JOIN win w
  ON UNIX_MILLIS(d.donated_at) BETWEEN w.started_ms AND w.ended_ms
GROUP BY
  d.donation_id, day, donated_ms, d.viewer_pk, d.donor_name,
  d.amount, d.settlement_amount, d.currency
"""

# --- 島の投げ銭 -----------------------------------------------------------
# 払い終わった時刻（`islandSiteTips.paidAt`。ミリ秒）を、**Doneru と同じ
# 時間帯（`_WIN`）・同じ選び方（`_PICK`）**で配信に当てる。時刻は Firestore に
# しか無いので、配列で渡す
SQL_ISLAND = f"""
WITH {_WIN}
SELECT
  t AS paid_ms,
  {_PICK}
FROM UNNEST(@ms) AS t
LEFT JOIN win w
  ON t BETWEEN w.started_ms AND w.ended_ms
GROUP BY t
"""


def parse_amount(text: Optional[str]) -> tuple:
    """スパチャの金額表記を、数と通貨に割る。

    Args:
        text: `¥1,000` `CA$2.79` のような表記

    Returns:
        (金額, 通貨)。読めなければ (None, None)
    """
    if not text:
        return None, None
    s = str(text).strip()
    cur = None
    for mark, code in CURRENCY_MARKS:
        if mark in s:
            cur = code
            break
    num = re.sub(r"[^0-9.]", "", s.replace(",", ""))
    if not num or num.count(".") > 1:
        return None, cur
    try:
        v = float(num)
    except ValueError:
        return None, cur
    # 円は小数を持たない。整数で入れておくと、あとで足すときに誤差が出ない
    return (int(v) if cur == "JPY" and v == int(v) else v), cur


def yen_of(amount, currency, day: str) -> dict:
    """円以外なら、**その日のレートで円に直す。** 円のときは何もしない。

    直せなかったとき（対応していない通貨・口が落ちている）は
    **0 ではなく None** を入れて、理由を残す。足すほうは None を飛ばすので、
    その人の額には入らない——そのぶんは `python/fx_tips_watch.py` が
    issue にして知らせる。**黙って 0円 にしない**
    （`docs/island-standards.md` 10）。

    Args:
        amount: 元の額
        currency: 元の通貨（`CAD`）
        day: 投げてくれた日（日本時間で切ったもの）

    Returns:
        台帳に足す4つ。**円の行は4つとも None**（欄が増えないので、
        既に入っている行を書き換えずに済む）
    """
    blank = {"amountJpy": None, "fxRate": None, "fxDate": None, "fxWhy": None}
    cur = str(currency or fx_rate.TARGET).upper()
    if amount is None or cur == fx_rate.TARGET:
        return blank
    got = fx_rate.to_jpy(amount, cur, day)
    return {"amountJpy": got["yen"], "fxRate": got["rate"],
            # **頼んだ日ではなく、レートの返ってきた日**（土日は直前の営業日）
            "fxDate": got["date"], "fxWhy": got["why"] or None}


def jst_day(ms: int) -> str:
    """ミリ秒を日本時間の日付に切る。**ここが配信日の境目**（#201・#202）。

    日本は夏時間を持たないので、足し算でよい。

    Args:
        ms: ミリ秒

    Returns:
        YYYY-MM-DD
    """
    return (
        datetime.fromtimestamp(ms / 1000, timezone.utc) + timedelta(hours=9)
    ).strftime("%Y-%m-%d")


def doc_id(source_event_id: str) -> str:
    """`sourceEventId` から書類IDを作る。

    生の値をそのまま書類IDにしない。YouTube の `event_id` は Base64 風で、
    `/` が入りうる。Firestore の書類IDに `/` は使えないので、ハッシュにする。
    **同じ寄付なら毎回同じIDになる**ので、流し直しても増えない。

    Args:
        source_event_id: 元のイベントID

    Returns:
        32文字の16進
    """
    return hashlib.sha1(source_event_id.encode("utf-8")).hexdigest()[:32]


def fetch_youtube(d0: str, d1: str) -> List[dict]:
    """その期間の YouTube スパチャ。

    Args:
        d0: 始まりの日（YYYY-MM-DD）
        d1: 終わりの日（この日を含む）

    Returns:
        台帳に入れる形の一覧
    """
    client = bigquery.Client(project=BQ_PROJECT_ID)
    cfg = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("bot", "STRING", BOT_NAME),
            bigquery.ScalarQueryParameter("d0", "DATE", d0),
            bigquery.ScalarQueryParameter("d1", "DATE", d1),
        ]
    )
    out = []
    for r in client.query(SQL_YOUTUBE, job_config=cfg).result():
        amount, cur = parse_amount(r["amount_text"])
        src = f"yt:{r['video_id']}:{r['event_id']}"
        out.append(
            {
                "id": doc_id(src),
                "sourceEventId": src,
                "source": "youtube_superchat",
                "channelId": r["channel_id"],
                "day": r["day"],
                "donatedAt": int(r["donated_ms"]),
                "videoId": r["video_id"],
                "videoStartedAt": int(r["started_ms"]) if r["started_ms"] else None,
                "amount": amount,
                "currency": cur,
                # 円以外は、その日のレートで直した円も持つ（#951）。
                # **元の表記と通貨はそのまま残す**ので、あとで検算できる
                **yen_of(amount, cur, r["day"]),
                "settlementAmount": None,
                "displayNameSnapshot": r["name"] or None,
            }
        )
    client.close()
    return out


def fetch_doneru(d0: str, d1: str, donors: Dict[str, dict]) -> List[dict]:
    """その期間の Doneru の寄付。

    Args:
        d0: 始まりの日（YYYY-MM-DD）
        d1: 終わりの日（この日を含む）
        donors: どねID -> `islandDonors` の中身

    Returns:
        台帳に入れる形の一覧
    """
    client = bigquery.Client(project=BQ_PROJECT_ID)
    cfg = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("d0", "DATE", d0),
            bigquery.ScalarQueryParameter("d1", "DATE", d1),
        ]
    )
    out = []
    for r in client.query(SQL_DONERU, job_config=cfg).result():
        pk = str(r["viewer_pk"]) if r["viewer_pk"] else None
        known = donors.get(pk) if pk else None
        # あやと本人の寄付。台帳には残すが、カードは自分に配らない
        owner = bool(known and known.get("isOwner"))
        src = f"doneru:{r['donation_id']}"
        out.append(
            {
                "id": doc_id(src),
                "sourceEventId": src,
                "source": "doneru",
                "channelId": None if owner else (known or {}).get("channelId"),
                "day": r["day"],
                "donatedAt": int(r["donated_ms"]),
                # Doneru 自身はどの配信のものか持っていない。**時刻を配信の
                # 時間帯に当てて埋めている**（SQL_DONERU の頭）。当たらな
                # かった投げ銭（配信していない時間のもの）は None のまま
                "videoId": r["video_id"],
                "videoStartedAt": (
                    int(r["started_ms"]) if r["started_ms"] is not None else None
                ),
                "amount": float(r["amount"]) if r["amount"] is not None else None,
                # 本番データは全件 NULL（＝円）。NULL のときは JPY と読む
                "currency": r["currency"] or "JPY",
                # 円のときは口を1回も叩かない（`yen_of` が先に帰る）ので、
                # 本番ではここで1件も外に出ない。将来 Doneru が外貨を
                # 返してきた晩に、スパチャと同じ直し方になる
                **yen_of(
                    float(r["amount"]) if r["amount"] is not None else None,
                    r["currency"] or "JPY", r["day"],
                ),
                "settlementAmount": (
                    float(r["settlement_amount"])
                    if r["settlement_amount"] is not None
                    else None
                ),
                "displayNameSnapshot": r["donor_name"] or None,
                "viewerPk": pk,
            }
        )
    client.close()
    return out


def read_site_tips(db) -> Optional[List[tuple]]:
    """島で受けた投げ銭（`islandSiteTips`）を**全部**読む。**読むだけ。**

    窓で切らない（返金はいつ来るか分からない。この文書の頭）。

    Args:
        db: Firestore クライアント

    Returns:
        `(checkoutSessionId, 中身)` の並び。**読めなければ None**
        （0件の `[]` と分ける。`docs/island-standards.md` 10）
    """
    try:
        return [(d.id, d.to_dict() or {}) for d in db.collection(fb.C_ISLAND).stream()]
    except Exception as e:  # noqa: BLE001  何で読めなくても、島の行は消さない
        logger.warning("島の投げ銭（%s）が読めませんでした: %s", fb.C_ISLAND, type(e).__name__)
        return None


def island_why(v: dict) -> str:
    """台帳に入れない島の投げ銭の、**入れない理由**（ログに出す符丁）。

    Args:
        v: `islandSiteTips` の中身

    Returns:
        `test`（テストの支払い）/ `refunded` / `disputed` / `status:<字>`
    """
    if (v or {}).get("livemode") is not True:
        return "test"
    st = str((v or {}).get("status") or "")
    return st if st in ("refunded", "disputed") else f"status:{st or '?'}"


def plan_island(site: Optional[List[tuple]], had: set) -> dict:
    """島の投げ銭を、**入れるもの・消すもの**に分ける。外は読まない。

    Args:
        site: `read_site_tips()` の返り値。None は「読めなかった」
        had: 台帳にいま在る島の行（`source: island`）の書類ID

    Returns:
        `keep`: 入れる `(checkoutSessionId, 中身)`、
        `drop`: 消す `(台帳の書類ID, 理由)`、
        `broken`: 数に入れてよいのに時刻が読めず、入れられなかった件数、
        `held`: 消さずに置いた理由（無ければ空文字）
    """
    if site is None:
        # **読めなかった晩は、何も入れず、何も消さない**
        return {"keep": [], "drop": [], "broken": 0, "held": "unreadable"}
    keep, broken = [], 0
    stay = set()      # 台帳に残してよい書類ID（入れるもの＋読めないが払われたもの）
    why = {}          # 書類ID -> 入れない理由
    for sid, v in site:
        key = doc_id(f"island:{sid}")
        if not fb.island_counts(v):
            why[key] = island_why(v)
            continue
        paid = v.get("paidAt")
        if isinstance(paid, bool) or not isinstance(paid, (int, float)) or paid <= 0:
            # 払われているのに時刻が読めない。**入れないが、在るものは消さない**
            broken += 1
            stay.add(key)
            continue
        keep.append((sid, v))
        stay.add(key)
    gone = sorted(had - stay)
    if gone and not site:
        # **読めたのに0件で、台帳には島の行が在る。** 受け取りの書類は消さない
        # 決めなので、読む先を間違えている。消さない
        return {"keep": [], "drop": [], "broken": 0, "held": "empty"}
    drop = [(k, why.get(k, "gone")) for k in gone]
    return {"keep": keep, "drop": drop, "broken": broken, "held": ""}


def island_row(sid: str, v: dict, hit: Optional[dict]) -> dict:
    """島の投げ銭1件を、台帳の1行にする。**外は読まない。**

    Args:
        sid: Checkout Session の ID（`islandSiteTips` の書類ID）
        v: `islandSiteTips` の中身（`plan_island()` の `keep` に入ったもの）
        hit: 当たった配信 `{"video_id", "started_ms"}`。当たらなければ None

    Returns:
        台帳に入れる形
    """
    src = f"island:{sid}"
    paid = int(v["paidAt"])
    day = jst_day(paid)
    amount = v.get("amount")
    if isinstance(amount, bool) or not isinstance(amount, (int, float)):
        amount = None
    elif amount == int(amount):
        # 円は小数を持たない。整数で入れておくと、足すときに誤差が出ない
        amount = int(amount)
    cur = str(v.get("currency") or "JPY").upper()
    net = v.get("settlementAmount")
    hit = hit or {}
    return {
        "id": doc_id(src),
        "sourceEventId": src,
        "source": fb.SOURCE_ISLAND,
        # 口が `islandUsers/{uid}.channelId` から引いた値。**そのまま入れる**
        "channelId": v.get("channelId") or None,
        "day": day,
        "donatedAt": paid,
        # Doneru と同じく、時刻を配信の時間帯に当てて埋める（`SQL_ISLAND`）
        "videoId": hit.get("video_id") or None,
        "videoStartedAt": (int(hit["started_ms"])
                           if hit.get("started_ms") is not None else None),
        "amount": amount,
        "currency": cur,
        # 島の投げ銭は円だけ。円なら口を1回も叩かない（`yen_of` が先に帰る）
        **yen_of(amount, cur, day),
        # Stripe の `balance_transaction.net`。引けていなければ None
        "settlementAmount": (net if isinstance(net, (int, float))
                             and not isinstance(net, bool) else None),
        "displayNameSnapshot": v.get("displayNameSnapshot") or None,
    }


def window_hits(ms: List[int]) -> Dict[int, dict]:
    """払い終わった時刻を、配信の時間帯に当てる（BigQuery。`SQL_ISLAND`）。

    Args:
        ms: ミリ秒の並び

    Returns:
        ミリ秒 -> `{"video_id", "started_ms"}`。当たらなかった時刻は値が None
    """
    if not ms:
        return {}
    client = bigquery.Client(project=BQ_PROJECT_ID)
    cfg = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ArrayQueryParameter("ms", "INT64", sorted(set(ms)))]
    )
    out = {}
    for r in client.query(SQL_ISLAND, job_config=cfg).result():
        out[int(r["paid_ms"])] = {"video_id": r["video_id"], "started_ms": r["started_ms"]}
    client.close()
    return out


def fetch_island(plan: dict) -> List[dict]:
    """`plan_island()` の `keep` を、台帳に入れる形にする。

    Args:
        plan: `plan_island()` の返り値

    Returns:
        台帳に入れる形の一覧
    """
    keep = plan["keep"]
    hits = window_hits([int(v["paidAt"]) for _, v in keep])
    return [island_row(sid, v, hits.get(int(v["paidAt"]))) for sid, v in keep]


def island_had(db) -> set:
    """台帳にいま在る島の行（`source: island`）の書類ID。

    **1本の等号なので、自動でできる索引だけで引ける**（複合索引を作らない。#168）。

    Args:
        db: Firestore クライアント

    Returns:
        書類IDの集合
    """
    col = db.collection("islandTips")
    return {d.id for d in col.where("source", "==", fb.SOURCE_ISLAND).stream()}


def same(had: dict, want: dict) -> bool:
    """すでに入っているものと同じか。**同じなら書かない。**

    毎日7日ぶんを引き直すので、ほとんどの行は変わらない。読みは書きより
    ずっと安いし、この台帳を書くのはここだけなので、読んだ内容が
    古くなることもない（`island_channels.py` と同じ判断）。

    Args:
        had: いま入っているもの
        want: 入れたいもの

    Returns:
        同じなら True
    """
    keys = (
        "sourceEventId",
        "source",
        "channelId",
        "day",
        "donatedAt",
        "videoId",
        "videoStartedAt",
        "amount",
        "currency",
        # 円に直したぶん。**ここを見ないと、レートを入れた日に
        # 古い行が書き換わらない**（#951 の埋め直しが効かない）。
        # 円の行は4つとも None なので、入れても書き換えは起きない
        "amountJpy",
        "fxRate",
        "fxDate",
        "fxWhy",
        "settlementAmount",
        "displayNameSnapshot",
    )
    return all(had.get(k) == want.get(k) for k in keys)


def log_island(site: Optional[List[tuple]], plan: dict, rows: List[dict]) -> None:
    """島の投げ銭の数を出す。**件数と理由だけ。人を指す字も額も出さない。**

    Args:
        site: `read_site_tips()` の返り値
        plan: `plan_island()` の返り値
        rows: 台帳に入れる形にした島の投げ銭
    """
    if plan["held"]:
        msg = {
            "unreadable": "島の投げ銭（islandSiteTips）が読めないので、台帳の島の行は"
                          "足しも消しもしません",
            "empty": "島の投げ銭（islandSiteTips）が0件なのに、台帳には島の行が在ります。"
                     "受け取りの書類は消さない決めなので、読む先がおかしい。消しません",
        }[plan["held"]]
        logger.warning("%s", msg)
        # 注記は行頭でないと拾われないので、ログとは別に素で出す
        print("::warning::" + msg, flush=True)
        return
    out: dict = {}
    for v in (v for _, v in site or [] if not fb.island_counts(v)):
        k = island_why(v)
        out[k] = out.get(k, 0) + 1
    logger.info("島の投げ銭: 受け取り %d件 → 台帳に入れる %d件 / 入れない %s",
                len(site or []), len(rows),
                ", ".join(f"{k} {n}件" for k, n in sorted(out.items())) or "0件")
    if plan["drop"]:
        why: dict = {}
        for _, k in plan["drop"]:
            why[k] = why.get(k, 0) + 1
        logger.info("島の投げ銭: 台帳から消す %s",
                    ", ".join(f"{k} {n}件" for k, n in sorted(why.items())))
    if plan["broken"]:
        msg = (f"島の投げ銭 {plan['broken']}件 は払われているのに時刻（paidAt）が読めず、"
               "台帳に入れていません（在る行は消していません）")
        logger.warning("%s", msg)
        print("::warning::" + msg, flush=True)
    nameless = sum(1 for r in rows if not r["channelId"])
    if nameless:
        # 島の投げ銭はチャンネルを結んだ人しか投げられない（決定の記録 0017 の3）。
        # 空なら口の側がおかしい。**台帳には残す**（額の突き合わせは紐付けと関係ない）
        msg = f"島の投げ銭 {nameless}件 にチャンネルが入っていません（カードは渡りません）"
        logger.warning("%s", msg)
        print("::warning::" + msg, flush=True)


def probe(d0: str, d1: str) -> int:
    """島の当て方（`SQL_ISLAND`）を、**Doneru の本番の時刻**で確かめる。

    島の投げ銭が本番に1件も無いうちは、`SQL_ISLAND` は毎晩1度も流れない。
    **最初の1件が来た晩に初めて流れて、そこで文が壊れていたら台帳の job ごと
    落ちる。** だから先に、同じ時間帯（`_WIN`）で当ててある Doneru の投げ銭の
    時刻を `SQL_ISLAND` に通して、videoId と配信の始まりが**1件残らず同じ**かを
    数える。Firestore は開かない。**1バイトも書かない。** 出すのは件数だけ。

        script: tips_pull
        args:   {"days": 30, "probe": true}

    Args:
        d0: 始まりの日
        d1: 終わりの日

    Returns:
        0=全件同じ / 1=違うものが在る / 2=比べる Doneru の投げ銭が0件
    """
    dn = fetch_doneru(d0, d1, {})
    if not dn:
        logger.warning("比べる Doneru の投げ銭が0件です（期間を広げる）")
        return 2
    hits = window_hits([r["donatedAt"] for r in dn])
    hit = sum(1 for r in dn if r["videoId"])
    diff = sum(1 for r in dn
               if ((hits.get(r["donatedAt"]) or {}).get("video_id") or None) != r["videoId"]
               or (hits.get(r["donatedAt"]) or {}).get("started_ms") != r["videoStartedAt"])
    logger.info("島の当て方 × Doneru の当て方: %d件（配信に当たった %d件）のうち、違う %d件",
                len(dn), hit, diff)
    return 0 if diff == 0 else 1


def main() -> int:
    """エントリポイント。"""
    ap = argparse.ArgumentParser()
    ap.add_argument("--day", help="この日だけ（YYYY-MM-DD）")
    ap.add_argument("--days", type=int, default=DEFAULT_DAYS, help="直近この日数ぶん")
    ap.add_argument("--all", action="store_true", help="ぜんぶ入れ直す（最初の1回）")
    ap.add_argument("--dry-run", action="store_true", help="書かずに出すだけ")
    ap.add_argument("--probe", action="store_true",
                    help="島の当て方（SQL_ISLAND）を Doneru の本番の時刻で確かめる。"
                         "Firestore を開かない・1バイトも書かない")
    a = ap.parse_args()

    if a.all:
        d0, d1 = "2000-01-01", "2100-01-01"
    elif a.day:
        d0 = d1 = a.day
    else:
        # 日本時間で数える。境目を JST に揃えたので、窓の切り方も揃える
        today = (datetime.now(timezone.utc) + timedelta(hours=9)).date()
        d1 = (today + timedelta(days=1)).isoformat()
        d0 = (today - timedelta(days=max(1, a.days) - 1)).isoformat()
    logger.info("%s 〜 %s", d0, d1)

    if a.probe:
        return probe(d0, d1)

    db = firestore.Client(project=BQ_PROJECT_ID)
    donors = {d.id: (d.to_dict() or {}) for d in db.collection("islandDonors").stream()}
    logger.info("どねID の対応表: %d件", len(donors))

    # 島の投げ銭（#1405）。**読めなければ None**——島の行は足しも消しもしない
    site = read_site_tips(db)
    plan = plan_island(site, island_had(db) if site is not None else set())
    island = fetch_island(plan)

    rows = fetch_youtube(d0, d1) + fetch_doneru(d0, d1, donors)
    logger.info("BigQuery: %d件", len(rows))
    rows += island
    log_island(site, plan, island)

    # **円以外を、直せたぶんと直せなかったぶんに分けて出す。**
    # 「0件」と「直せなかった」を同じ顔にしない（`island-standards.md` §15）。
    # 直せなかったぶんは額に入らないので、issue のほうにも出る
    # （`python/fx_tips_watch.py`）。**人を指す字は1つも出さない**
    fx = [r for r in rows
          if str(r.get("currency") or fx_rate.TARGET).upper() != fx_rate.TARGET]
    if fx:
        done = [r for r in fx if r.get("amountJpy") is not None]
        logger.info("円以外の投げ銭 %d件 → 円に直せた %d件 / 直せなかった %d件",
                    len(fx), len(done), len(fx) - len(done))
        for r in done:
            logger.info("  %s %s → 円（レート %s / レートの日 %s）",
                        r["day"], r["currency"], r["fxRate"], r["fxDate"])
        stuck: dict = {}
        for r in fx:
            if r.get("amountJpy") is None:
                k = (r["currency"], r.get("fxWhy") or "?")
                stuck[k] = stuck.get(k, 0) + 1
        for (cur, why), n in sorted(stuck.items()):
            logger.warning("  **%s の %d件は円に直せていない**（%s）。"
                           "額に足されないので、その人の順位はそのぶん下がる",
                           cur, n, fx_rate.WHY.get(why, why))
    drop = plan["drop"]
    if not rows and not drop:
        logger.info("入れるものはありません")
        return 0

    col = db.collection("islandTips")
    # いま入っているぶんを読んでから比べる。**書きを減らすための読み**
    had = {}
    for i in range(0, len(rows), 300):
        part = [col.document(r["id"]) for r in rows[i : i + 300]]
        for snap in db.get_all(part):
            if snap.exists:
                had[snap.id] = snap.to_dict() or {}
    logger.info("台帳にいま入っているの（この期間ぶん）: %d件", len(had))

    now = datetime.now(timezone.utc).isoformat()
    changed = [r for r in rows if not same(had.get(r["id"], {}), r)]
    logger.info("入れる / 直すもの: %d件", len(changed))

    # **0時をまたいだ配信を名指しで出す。** 境目を日本時間の0時にしたので、
    # 配信の始まった日と投げ銭の日がずれる行が出る（本番の380件のうち33件、
    # 8.7%）。その人たちのカードは、始まった日の企画ではなく**翌日の企画**に
    # 付く。直すには後半の動画IDを islandStreamEvent.videoIds に足す。
    #
    # 機械で寄せない。**時差を追いかけないと決めた**のがこの設計なので
    # （#201）、どれを足すかは人が決める。ここは「足す候補はこれ」を出すだけ。
    crossed = {}
    for r in rows:
        if not r.get("videoStartedAt"):
            continue
        started = jst_day(r["videoStartedAt"])
        if started != r["day"]:
            crossed.setdefault((r["videoId"], started), set()).add(r["day"])
    if crossed:
        logger.info("")
        logger.info("**0時をまたいだ配信**（始まった日と投げ銭の日が違う）:")
        for (vid, started), days in sorted(crossed.items()):
            logger.info("  %s  開始 %s → 投げ銭 %s", vid, started, ", ".join(sorted(days)))
        # **写真のほうに足す。** カードの軸は 2026-10-01 から日付（写真の日）で、
        # 企画は立っていない日がある（`docs/island-card-rfc.md`）。
        # ただし `videoStartedAt` が入っていれば `tip_day` が自動で前の日へ戻すので、
        # ここに出たからといって手で足す必要があるとは限らない
        logger.info(
            "  %s の写真（無ければ企画）に videoIds を足すと、後半のぶんも拾えます",
            started,
        )

    nameless = [r for r in rows if r["source"] == "doneru" and not r["channelId"]]
    if nameless:
        # ここでは赤くしない。**赤くするのは doneru_supporters.py の役目**
        logger.info(
            "Doneru で紐付いていないぶん: %d件（カードは渡りません）", len(nameless)
        )

    if a.dry_run:
        log_changed(changed[:30])
        logger.info("--dry-run なので書いていません（消すはずだった島の行 %d件）", len(drop))
        return 0

    wrote = 0
    batch = db.batch()
    n = 0
    for r in changed:
        doc = dict(r)
        key = doc.pop("id")
        doc["updatedAt"] = now
        if key not in had:
            doc["createdAt"] = now
        batch.set(col.document(key), doc, merge=True)
        n += 1
        wrote += 1
        if n >= BATCH:
            batch.commit()
            batch = db.batch()
            n = 0
    # **返金・払い戻しの請求・無くなった島の投げ銭は、行ごと消す**（この文書の頭）
    for key, _why in drop:
        batch.delete(col.document(key))
        n += 1
        if n >= BATCH:
            batch.commit()
            batch = db.batch()
            n = 0
    if n:
        batch.commit()

    logger.info("islandTips を %d件 更新し、島の行を %d件 消しました", wrote, len(drop))
    return 0


if __name__ == "__main__":
    sys.exit(main())
