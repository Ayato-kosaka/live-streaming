"""退避がちゃんと取れているかを見る。**読むだけ。**

**旅の途中に、Actions を開けなくてもこれで分かる。**
最後に取れたのはいつか、落ちていないか、何件入っているか。

ARGS 例:
  {}              … 直近10回
  {"limit": 30}
"""

import datetime as dt
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
        # **写真は「取れた枚数」だけでは足りない。** 1回の上限で切り上げた回と
        # 取り切った回が同じ字に見える。残りと落ちた数まで並べる
        if not ph.get("ok"):
            photo = "索引が引けず"
        else:
            photo = "+%d枚" % ph.get("n", 0)
            if ph.get("left"):
                photo += "/残%d" % ph["left"]
            if ph.get("failed"):
                photo += "/落%d" % ph["failed"]
        log.info(
            "  %s  %s  %4.0f秒  Firestore %d件/%dバイト  写真 %s",
            r["at"].isoformat(timespec="minutes"),
            "○" if r["ok"] else "✕",
            r["took_sec"] or 0,
            fs.get("docs", 0),
            fs.get("bytes", 0),
            photo,
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
    # 写真は**行数より「何バイト守れているか」**が見たい数字。
    # `size` の列だけ読むので、実体（body）は1バイトも読まない
    try:
        v = list(c.query(
            f"SELECT IFNULL(SUM(size), 0) AS b FROM `{sink.PROJECT}.{sink.DATASET}.photos`",
            location=sink.LOCATION,
        ).result())[0]["b"]
        log.info("  %-18s %d バイト", "写真の実体", v)
    except Exception:  # noqa: BLE001
        pass

    # ---- 合否。**「直近10回に1回でも赤があれば赤」にしない。**
    # 旅の17日でひと晩こければ、そのあと何日通っても赤のままになる。
    # **赤が出っぱなしになると、赤が意味を失う**（島の決めごと）。
    # 見るのは2つだけ。**いちばん新しい回が通ったか**と、**古びていないか。**
    if not rows:
        log.error("**1回も取れていません。**")
        raise SystemExit(1)

    latest = rows[0]
    age_h = (
        dt.datetime.now(dt.timezone.utc) - latest["at"]
    ).total_seconds() / 3600
    log.info("--- 合否 ---")
    if bad:
        # 落ちた回があること自体は出す。**ただしそれでは赤くしない**
        log.info("  直近 %d 回のうち %d 回は落ちている（過去のぶん）", len(rows), bad)

    ng = False
    if not latest["ok"]:
        log.error("**いちばん新しい退避が落ちています**（%s）", latest["at"].isoformat())
        ng = True
    # 毎晩 02:00 UTC なので、36時間あいたら「走っていない」。
    # **ワークフローが赤くなる形では捕まえられない唯一の壊れ方**
    # （cron そのものが動いていないときは、赤い実行すら残らない）
    if age_h > 36:
        log.error("**%.0f 時間、退避が走っていません**（毎晩のはず）", age_h)
        ng = True
    if ng:
        raise SystemExit(1)
    log.info("  ○ いちばん新しい退避は %.1f 時間前に通っています", age_h)


main()
