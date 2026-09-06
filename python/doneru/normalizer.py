"""Doneru のレコードを BigQuery に入れる形にそろえる。

## フィールド名を決め打ちしない理由

Doneru のレスポンスの形は公開されていない。画面が使っているだけの API なので、
**向こうの都合でいつ変わってもおかしくないし、変わったと知らせても来ない。**

なので、候補名を並べて当たったものを使う。当たらなくても `raw_json` に
元データを丸ごと残すので、**取りこぼしはしない**。あとから
`python/fetch_doneru_donations.py --probe` でキー名を見て候補を足せば、
過去ぶんは `raw_json` から作り直せる。

`chat_messages.raw_item_json` が同じ考え方で置かれている。
"""

import hashlib
import json
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

# Doneru は日本のサービスで、画面に出ているのは日本時間。
# タイムゾーンの付いていない文字列はこれで読む（_parse_datetime のコメント参照）。
_JST = timezone(timedelta(hours=9))

# 各列の候補キー。先に書いたものが優先。
# 実データを見て確定させるまでの受け皿なので、増やすのは安い。
FIELD_CANDIDATES: Dict[str, Tuple[str, ...]] = {
    # **本番の CSV のヘッダーを先頭に置いてある**（2026-09-06 の実データで確認）。
    # うしろは JSON の一覧を使っていたころの名前と、名前が変わったときの受け皿。
    #
    # CSV に寄付1件ごとの ID は無い。`どねID` は**人**のID（同じ人が何度も出てくる）。
    # なので主キーは中身から作る（_fallback_id と normalize_all を見ること）。
    "donation_id": (
        "id", "donationId", "donation_id", "uuid", "_id", "transactionId", "orderId",
    ),
    "donated_at": (
        "どね時刻",
        "createdAt", "created_at", "donatedAt", "donated_at",
        "paidAt", "paid_at", "date", "datetime", "timestamp",
        "日時", "日付", "支援日時",
    ),
    "donor_name": (
        "どねニックネーム",
        "name", "donorName", "donor_name", "nickname", "userName",
        "user_name", "supporterName", "from", "sender",
        "名前", "お名前", "支援者名",
    ),
    "amount": (
        "どね金額",
        "amount", "price", "value", "donationAmount", "totalAmount", "total",
        "金額", "支援金額",
    ),
    "currency": ("currency", "currencyCode", "currency_code", "通貨"),
    "message_text": (
        "メッセージ",
        "message", "comment", "text", "body", "content", "コメント", "本文",
    ),
    # 精算状態: 「振込完了」「振込待ち」。手元の帳簿と突き合わせるとき、
    #   まだ振り込まれていないぶんを分けられないと数字が合わない。
    "status": (
        "精算状態",
        "status", "state", "paymentStatus", "ステータス", "状態",
    ),
    # 実際精算金額: 手数料を引いたあとの、実際に振り込まれる額。
    #   どね金額（視聴者が払った額）とは 5% ほど違う。どちらを見たいかは用途で変わる。
    "settlement_amount": (
        "実際精算金額",
        "settlementAmount", "settlement_amount", "netAmount", "payoutAmount",
        "振込金額", "精算金額",
    ),
    # どねID: **人の同一性。名前で数えてはいけない**（名前は変わる）。
    #   chat_messages で author_channel_id を見ているのと同じ理由（docs/island-db.md）。
    #   あやとが持っている「どねID → チャンネル名」の対応表は、これで突き合わせる。
    "viewer_pk": (
        "どねID",
        "viewerPk", "viewer_pk", "viewerId", "userPk", "支援者ID", "ユーザーID",
    ),
    # プラットホーム: YouTube / Twitch など、どこから投げられたか。
    "platform": ("プラットホーム", "プラットフォーム", "platform"),
}

# 「200円」「¥1,000」「1000.00」から数字だけ取り出す
_AMOUNT_RE = re.compile(r"-?\d[\d,]*(?:\.\d+)?")

# キー名を突き合わせる形にそろえるとき落とすもの（区切りだけ。文字は残す）
_KEY_NOISE = re.compile(r"[\s_\-.・:：/／()（）]+")


def _key(name: str) -> str:
    """キー名を突き合わせ用にそろえる。日本語はそのまま残す。"""
    return _KEY_NOISE.sub("", name.strip().lower())


def _pick(record: Dict[str, Any], candidates: Tuple[str, ...]) -> Tuple[Optional[Any], Optional[str]]:
    """候補キーのうち最初に見つかったものの値と、当たったキー名を返す。

    キー名の表記ゆれ（camelCase / snake_case / 大文字小文字）を吸収したいので、
    比較は区切り文字を落として小文字にしたもので行う。

    **英数字以外を捨ててはいけない。** CSV のヘッダーは日本語なので、
    「英数字だけ残す」にすると `日時` も `名前` も `金額` も空文字になって、
    どの候補にも当たらなくなる（JSON だけを見ていたときの作りが残っていた）。
    落とすのは空白と `_ - . 　` などの区切りだけにする。
    """
    normalized = {_key(key): key for key in record}
    for candidate in candidates:
        actual = normalized.get(_key(candidate))
        if actual is not None and record[actual] not in (None, ""):
            return record[actual], actual
    return None, None


def _parse_amount(value: Any) -> Optional[float]:
    """金額を数値にする。`1000` でも `"¥1,000"` でも通す。"""
    if isinstance(value, (int, float)):
        return float(value)
    if not isinstance(value, str):
        return None
    matched = _AMOUNT_RE.search(value)
    if not matched:
        return None
    try:
        return float(matched.group(0).replace(",", ""))
    except ValueError:
        return None


def _parse_datetime(value: Any) -> Optional[datetime]:
    """時刻を UTC の datetime にする。

    epoch（秒 / ミリ秒）でも ISO 8601 でも `2026-09-05 12:34:56` でも通す。
    **タイムゾーンが付いていない文字列は UTC ではなく JST として読む。**
    Doneru は日本のサービスで、画面に出ているのは日本時間だから。
    ここを UTC と読むと、寄付が9時間ずれて前日に入る。
    """
    if isinstance(value, (int, float)):
        # 10桁なら秒、13桁ならミリ秒
        seconds = value / 1000 if value > 1e11 else value
        return datetime.fromtimestamp(seconds, tz=timezone.utc)

    if not isinstance(value, str):
        return None

    text = value.strip().replace("/", "-")
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"

    for pattern in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%d %H:%M:%S%z"):
        try:
            return datetime.strptime(text, pattern).astimezone(timezone.utc)
        except ValueError:
            pass

    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        for pattern in (
            "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d",
            # 日本語表記でも通す（CSV がどの形で出すか確証が無いので受け皿を広く）
            "%Y年%m月%d日 %H:%M:%S", "%Y年%m月%d日 %H:%M", "%Y年%m月%d日",
        ):
            try:
                parsed = datetime.strptime(text, pattern)
                break
            except ValueError:
                continue
        else:
            return None

    if parsed.tzinfo is None:
        # タイムゾーン無し = 日本時間として読む（上のコメントの理由）
        parsed = parsed.replace(tzinfo=_JST)
    return parsed.astimezone(timezone.utc)


def _fallback_id(record: Dict[str, Any]) -> str:
    """ID になりそうなキーが無いときの主キー。

    レコードの中身から作る。同じ寄付は同じ値になるので MERGE が効く。
    キーの順序で変わらないよう `sort_keys` を付ける。
    """
    canonical = json.dumps(record, ensure_ascii=False, sort_keys=True)
    return "sha256:" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def normalize(record: Dict[str, Any]) -> Dict[str, Any]:
    """1件を BigQuery の行にする。"""
    donation_id, _ = _pick(record, FIELD_CANDIDATES["donation_id"])
    donated_at_raw, _ = _pick(record, FIELD_CANDIDATES["donated_at"])
    donor_name, _ = _pick(record, FIELD_CANDIDATES["donor_name"])
    amount_raw, _ = _pick(record, FIELD_CANDIDATES["amount"])
    currency, _ = _pick(record, FIELD_CANDIDATES["currency"])
    message_text, _ = _pick(record, FIELD_CANDIDATES["message_text"])
    status, _ = _pick(record, FIELD_CANDIDATES["status"])
    settlement_raw, _ = _pick(record, FIELD_CANDIDATES["settlement_amount"])
    viewer_pk, _ = _pick(record, FIELD_CANDIDATES["viewer_pk"])
    platform, _ = _pick(record, FIELD_CANDIDATES["platform"])

    return {
        "donation_id": str(donation_id) if donation_id is not None else _fallback_id(record),
        "donated_at": _parse_datetime(donated_at_raw),
        "donor_name": str(donor_name) if donor_name is not None else None,
        "amount": _parse_amount(amount_raw),
        "amount_text": str(amount_raw) if amount_raw is not None else None,
        "currency": str(currency) if currency is not None else None,
        "message_text": str(message_text) if message_text is not None else None,
        "status": str(status) if status is not None else None,
        "settlement_amount": _parse_amount(settlement_raw),
        "viewer_pk": str(viewer_pk) if viewer_pk is not None else None,
        "platform": str(platform) if platform is not None else None,
        "raw_json": record,
    }


def normalize_all(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """まとめて行にする。**中身が同じ寄付を1件に潰さない。**

    CSV には寄付1件ごとの ID が無い（`どねID` は人のID）。なので主キーは
    中身から作るが、**同じ人が同じ時刻に同じ額を同じ言葉で2回出すと、
    2件が完全に同じ行になって MERGE が1件に潰す。** 実データで2件潰れた。

    なので同じ中身の何番目かを主キーに足す。CSV の並びは時刻順で安定なので、
    同じ期間を訊くかぎり同じ番号が付く。
    """
    counts: Dict[str, int] = {}
    rows = []
    for record in records:
        row = normalize(record)
        key = row["donation_id"]
        if key.startswith("sha256:"):
            counts[key] = counts.get(key, 0) + 1
            row["donation_id"] = f"{key}#{counts[key]}"
        rows.append(row)
    return rows


def describe_mapping(records: List[Dict[str, Any]]) -> Dict[str, Any]:
    """どのキーがどの列に当たったかをまとめる（`--probe` 用）。

    **返すのはキー名と件数だけで、値は入れない。** public リポジトリなので
    Actions のログは誰でも読める。寄付者の名前や金額を出すわけにいかない。
    """
    matched: Dict[str, Optional[str]] = {}
    for column, candidates in FIELD_CANDIDATES.items():
        matched[column] = None
        for record in records:
            _, actual = _pick(record, candidates)
            if actual:
                matched[column] = actual
                break

    seen_keys = sorted({key for record in records for key in record})
    used = {key for key in matched.values() if key}

    return {
        "record_count": len(records),
        "matched": matched,
        "unmapped_keys": [key for key in seen_keys if key not in used],
    }
