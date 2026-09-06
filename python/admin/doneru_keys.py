"""Doneru の生データが、どんな欄を持っているかだけを出す。

## なぜ要るのか

対応表の「どねID」は21桁（Google のユーザーID）や18〜19桁だが、
こちらの `doneru_donations.viewer_pk` は6桁だった。**突き合わせる鍵が
違う。** どの欄に21桁のほうが入っているかを知りたい。

## 値は出さない

このリポジトリは公開で、**Actions のログも誰でも読める**。投げ銭の
中身（名前・金額・メッセージ）を出さないのは取り込みスクリプトと同じ決め。

出すのは**欄の名前と、値の形だけ**（数字か・何桁か）。中身は出さない。

    script: doneru_keys
    args:   {"limit": 5}
"""

import os
import sys

from _fs import args, log

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import BQ_DATASET, BQ_PROJECT_ID  # noqa: E402


def shape(v) -> str:
    """値の形だけを言う。中身は出さない。"""
    if v is None:
        return "なし"
    s = str(v)
    if s.isdigit():
        return f"数字{len(s)}桁"
    return f"文字{len(s)}文字"


def main() -> None:
    import json

    from google.cloud import bigquery

    a = args()
    n = int(a.get("limit", 5))
    client = bigquery.Client(project=BQ_PROJECT_ID)
    sql = f"""
    SELECT viewer_pk, TO_JSON_STRING(raw_json) AS raw
    FROM `{BQ_PROJECT_ID}.{BQ_DATASET}.doneru_donations`
    WHERE raw_json IS NOT NULL
    ORDER BY donated_at DESC
    LIMIT {n}
    """
    keys = {}
    for row in client.query(sql).result():
        log.info("viewer_pk の形: %s", shape(row["viewer_pk"]))
        try:
            v = json.loads(row["raw"])
        except Exception:
            continue
        for k, val in sorted(v.items()):
            if isinstance(val, (dict, list)):
                if isinstance(val, dict):
                    for k2, v2 in sorted(val.items()):
                        keys.setdefault(f"{k}.{k2}", set()).add(shape(v2))
                continue
            keys.setdefault(k, set()).add(shape(val))
    client.close()

    log.info("生データの欄（%d件ぶんを重ねたもの）:", n)
    for k in sorted(keys):
        log.info("  %-28s %s", k, " / ".join(sorted(keys[k])))


main()
