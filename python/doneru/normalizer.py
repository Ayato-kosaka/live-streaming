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
    "donation_id": ("id", "donationId", "donation_id", "uuid", "_id", "transactionId", "orderId"),
    "donated_at": (
        "createdAt", "created_at", "donatedAt", "donated_at",
        "paidAt", "paid_at", "date", "datetime", "timestamp",
    ),
    "donor_name": (
        "name", "donorName", "donor_name", "nickname", "userName",
        "user_name", "supporterName", "from", "sender",
    ),
    "amount": ("amount", "price", "value", "donationAmount", "totalAmount", "total"),
    "currency": ("currency", "currencyCode", "currency_code"),
    "message_text": ("message", "comment", "text", "body", "content"),
}

# 「200円」「¥1,000」「1000.00」から数字だけ取り出す
_AMOUNT_RE = re.compile(r"-?\d[\d,]*(?:\.\d+)?")


def _pick(record: Dict[str, Any], candidates: Tuple[str, ...]) -> Tuple[Optional[Any], Optional[str]]:
    """候補キーのうち最初に見つかったものの値と、当たったキー名を返す。

    キー名の表記ゆれ（camelCase / snake_case / 大文字小文字）を吸収したいので、
    比較は英数字だけを残して小文字にしたもので行う。
    """
    normalized = {re.sub(r"[^a-z0-9]", "", key.lower()): key for key in record}
    for candidate in candidates:
        actual = normalized.get(re.sub(r"[^a-z0-9]", "", candidate.lower()))
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
        for pattern in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
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

    return {
        "donation_id": str(donation_id) if donation_id is not None else _fallback_id(record),
        "donated_at": _parse_datetime(donated_at_raw),
        "donor_name": str(donor_name) if donor_name is not None else None,
        "amount": _parse_amount(amount_raw),
        "amount_text": str(amount_raw) if amount_raw is not None else None,
        "currency": str(currency) if currency is not None else None,
        "message_text": str(message_text) if message_text is not None else None,
        "raw_json": record,
    }


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
