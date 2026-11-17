"""他己紹介（`site/content/voices.ts`）に足す声を、**BigQuery の行のまま・封をして**返す。

    python3 python/sealed_run.py voices_sealed '{"since":"2026-09-11","pick":["<指紋>", …]}'

**1バイトも書かない。** `build_voices.py` の候補の SQL を流して、指紋の合う行だけ返す。

## なぜ要るか

`voices_picks.json` に置く行は `d` `v` `e` `a` `i` `m` の6つで、**`a`（名前）と
`i`（アイコン）と `e`（イベントID）は手で書かない**決まり。どれも BigQuery の
`chat_messages` にしか無く、**この箱には Google の身分が無い**ので引けない。

候補を**読む**ほうは手元で足りる。`streams/YYYY/MM/<stem>.chat.txt` が同じ
`chat_messages` の本文を配信ごとに置いているので、そこで `build_voices.py` と
同じ正規表現をかけて読み、選ぶ。足りないのは選んだ行の6つの欄だけで、
ここはそれを持って帰る口。

## 何を渡すか。**本文も名前も渡さない**

ARGS はワークフローのログに出る。だから選んだ声は**指紋**で指す——
本文の空白を1つに畳んで（`stream_text.one_line` と同じ畳みかた。
`chat.txt` はその形で置かれている）、SHA-256 の頭16字。
手元の `chat.txt` の本文から作った指紋と、ここで BigQuery の本文から
作った指紋が同じになる。

**本文は BigQuery のほうを返す。** `chat.txt` は全角の空白まで半角1つに
畳んであるので、そちらを写すと引用が1文字変わる。

## 返すもの（封の中）

`{"since": …, "rows": [{d, v, e, a, i, m, h}, …], "missing": [指紋, …]}`

`h` は当たった指紋。`missing` は SQL の候補に1行も当たらなかった指紋で、
`build_voices.py` の正規表現（RE2）と手元の Python の正規表現が食い違ったときに出る。

## 流す量

`build_voices.py` の SQL は名前とアイコンのために `chat_messages` を全部なめる。
**流す前に見積もって、1GiB を超えたら引かない**（あやと「1GB超えるSQL流すのは
控えて」2026-09-11。`chatter_voices.py` と同じ上限）。
"""

import gzip
import hashlib
import json
import os
import re
import sys

from _fs import args, log, need, notice
from _seal import chunks, pack, seal

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import build_voices  # noqa: E402
from config import BQ_PROJECT_ID  # noqa: E402

#: 流してよい量の上限。これを超えたら引かない
MAX_BYTES = 1 << 30  # 1GiB


def fingerprint(text: str) -> str:
    """本文の指紋。空白の畳みかたは `stream_text.one_line` と同じにする。

    `chat.txt` の本文はこの形で置かれているので、手元で作った指紋と揃う。
    """
    one = re.sub(r"\s+", " ", text or "").strip()
    return hashlib.sha256(one.encode("utf-8")).hexdigest()[:16]


def main() -> int:
    a = args()
    since, picks, pubkey = need(a, "since", "pick", "pubkey")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(since)):
        log.error("since は YYYY-MM-DD で渡してください")
        return 1
    want = {str(p) for p in picks}

    from google.cloud import bigquery  # BQ を使うときだけ要る

    client = bigquery.Client(project=BQ_PROJECT_ID)
    sql = build_voices.sql(BQ_PROJECT_ID, since)
    dry = client.query(sql, job_config=bigquery.QueryJobConfig(
        dry_run=True, use_query_cache=False))
    mb = (dry.total_bytes_processed or 0) / (1 << 20)
    log.info("見積もり: %.1f MB（上限 %.0f MB）", mb, MAX_BYTES / (1 << 20))
    if (dry.total_bytes_processed or 0) > MAX_BYTES:
        log.error("上限を超えるので**引きません**")
        return 1

    rows = [dict(r) for r in client.query(sql).result()]
    cands = [r for r in rows if r.get("k") == "v"]
    hit, seen = [], set()
    for r in cands:
        h = fingerprint(r.get("m") or "")
        # 同じ本文を同じ人が2回打っていることがある。最初の1件（日付の早いほう）を採る
        if h in want and h not in seen:
            seen.add(h)
            hit.append({k: r.get(k) for k in ("d", "v", "e", "a", "i", "m")} | {"h": h})
    missing = sorted(want - seen)

    # **件数だけログに出す。** 本文も名前もアイコンも出さない
    log.info("候補 %d 件 / 頼まれた指紋 %d 件 / 当たった %d 件 / 当たらない %d 件",
             len(cands), len(want), len(hit), len(missing))
    notice(f"voices_sealed: 候補 {len(cands)} 件 / 当たった {len(hit)} 件 / 当たらない {len(missing)} 件")

    plain = gzip.compress(json.dumps(
        {"since": since, "rows": hit, "missing": missing}, ensure_ascii=False).encode())
    # **平文はここまで。** 以降、ログにも注記にも暗号文しか出ない
    blob = pack(seal(plain, pubkey))
    lines = chunks(blob)
    log.info("封を %d 行で出します（封 %d 字）", len(lines), len(blob))
    if len(lines) > 9:
        # 注記は1つの step で10件までしか見せない。上の件数で1件使っているので9行まで。
        # **足りないまま返さない**
        log.error("注記は10行までしか読めません。pick を分けて押してください")
        return 1
    for line in lines:
        notice(line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
