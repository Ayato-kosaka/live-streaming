"""退避がちゃんと取れているかを見る。**読むだけ。**

**旅の途中に、Actions を開けなくてもこれで分かる。**
最後に取れたのはいつか、落ちていないか、何件入っているか。

ARGS 例:
  {}              … 直近10回
  {"limit": 30}
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from _fs import args, log  # noqa: E402
from backup import sink  # noqa: E402


def main() -> None:
    a = args()
    c = sink.client()
    n = int(a.get("limit", 10))

    log.info("--- 直近の退避 ---")
    bad = 0
    rows = list(
        c.query(
            # **`at` は逆引用符で囲む。** GoogleSQL の `AT` は予約語
            # （`AT TIME ZONE`）なので、裸で書くと構文エラーになる。
            # 貯金箱の担当も同じところで踏んでいる（「BigQuery の SQL が
            # 予約語で落ちていたのを直す」）
            f"SELECT `at`, ok, took_sec, error, detail_json FROM `{sink.RUNS_TABLE}`"
            f" ORDER BY `at` DESC LIMIT {n}",
            location=sink.LOCATION,
        ).result()
    )
    for r in rows:
        d = json.loads(r["detail_json"] or "{}")
        fs = d.get("firestore", {})
        ph = d.get("photos", {})
        log.info(
            "  %s  %s  %4.0f秒  Firestore %d件/%dバイト  写真 %s",
            r["at"].isoformat(timespec="minutes"),
            "○" if r["ok"] else "✕",
            r["took_sec"] or 0,
            fs.get("docs", 0),
            fs.get("bytes", 0),
            ("+%d件" % ph.get("n", 0)) if ph.get("ok") else "権限待ち",
        )
        if not r["ok"]:
            bad += 1
            log.error("     %s", (r["error"] or "")[:300])

    log.info("--- いま置き場に入っているもの ---")
    for q, label in (
        (f"SELECT COUNT(DISTINCT taken_at) AS n FROM `{sink.FS_TABLE}`", "Firestore の世代"),
        (f"SELECT COUNT(*) AS n FROM `{sink.FS_TABLE}`", "Firestore の行"),
    ):
        log.info("  %-18s %d", label, list(c.query(q, location=sink.LOCATION).result())[0]["n"])
    for t in ("chat_messages", "videos", "doneru_donations", "doneru_ingest_runs", "photos"):
        try:
            v = list(c.query(
                f"SELECT COUNT(*) AS n FROM `{sink.PROJECT}.{sink.DATASET}.{t}`",
                location=sink.LOCATION,
            ).result())[0]["n"]
            log.info("  %-18s %d 行", t, v)
        except Exception:  # noqa: BLE001
            log.info("  %-18s まだ無い", t)

    if not rows:
        log.error("**1回も取れていません。**")
        raise SystemExit(1)
    if bad:
        log.error("**直近 %d 回のうち %d 回落ちています。**", len(rows), bad)
        raise SystemExit(1)


main()
