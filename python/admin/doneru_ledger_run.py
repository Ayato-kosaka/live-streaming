"""Doneru の投げ銭を、1件ずつ島の置き場へ写す（Actions から押す用）。

ARGS:
  {}                    … 直近30日ぶん（毎晩と同じ）
  {"all": true}         … **ぜんぶ**（配ったあとの1回目。1,027件ほど）
  {"dry_run": true}     … 書かずに数える

## なぜ Actions から押せる口が要るのか

中身は `python/doneru_ledger.py` で、**毎晩ひとりでに走る**
（`fetch_doneru_donations.yml`）。ここはその引き金だけ。

要るのは2つの場面。

1. **配った日。** 写しが1件も無いあいだ、机は内訳を1行も出さない
   （読めていないことを 0 と書かないため）。毎晩の回を待たずに
   `{"all": true}` で1回流す
2. **写しがずれたと思ったとき。** `{"dry_run": true}` なら1バイトも書かずに、
   BigQuery と置き場の数だけを突き合わせられる

**豚の額は、この道具では1円も動かない。** 写しは履歴と内訳のためだけに
あって、合計は向こうのウィジェットの累計から出ている（内訳の「開始時点」も
残差なので、写しがずれても額は動かない）。

## 出さないもの

**このリポジトリは公開で、Actions のログも誰でも読める。**
出るのは件数と円と日付だけ（`doneru_ledger.py` がそう書いている）。
名前も本文も1文字も出ない。
"""

import os
import sys

from _fs import args, log

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import doneru_ledger as dl  # noqa: E402


def main() -> int:
    """エントリポイント。

    Returns:
        0 なら写せた。1 なら落ちた（**前の写しはそのまま残る**）
    """
    a = args()
    days = None if a.get("all") else int(a.get("days") or dl.LOOKBACK_DAYS)
    dry = bool(a.get("dry_run", False))
    log.info(
        "%s / %s",
        "ぜんぶ" if days is None else f"直近{days}日",
        "書かずに数えるだけ" if dry else "書きます",
    )
    try:
        dl.run(days, dry)
    except Exception as e:  # noqa: BLE001  何で落ちても、前の写しは消さない
        log.error("写せませんでした: %s: %s", type(e).__name__, e)
        return 1
    return 0


sys.exit(main())
