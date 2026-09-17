"""**取り込みが詰まっていないかを、毎晩見る。**

    BQ_PROJECT_ID=live-streaming-d3cac python3 python/ingest_watch.py
    python3 python/ingest_watch.py --fixture path.json   # BigQuery を引かずに判定だけ

終了コード 0=異常なし / 1=見つけた（赤）/ 2=数えるものが無い。

## なぜ要るか

2026-09-17 に本番を数えたら、`youtube_chat.videos` の `WAITING` 28本のうち
26本が**1回試したきりで半年止まっていた**（いちばん古いのは 2026-02-06）。
91本ぶんのチャットが1行も入っておらず、出席日数も引用もカードも、そこから
下流のものが全部欠けていた。

**誰も見ていなかったから、半年気づかれなかった。** 取り込みのワークフローは
その間ずっと緑で終わっている。緑が言っているのは「落ちなかった」だけで、
「入るべきものが入った」ではない。

直しかた（窓の外に細い枠をあける）は `python/bq/queries.py` にある。
ここはその見張りで、**直したものが効かなくなったときに気づくためのもの。**

## 何を見るか

| | 見るもの | 出しかた | なぜ |
| --- | --- | --- | --- |
| 1 | 最後に試した時刻が `STALE_HOURS` より古い | 赤 | **取り込みが走っていない。** 今回の26本はこれが元 |
| 2 | 窓（7日）＋猶予 を過ぎた PENDING / WAITING | 赤 | 拾い直す枠が効いていない。放っておくと永久に残る |
| 3 | 窓の外にいる PENDING / WAITING（猶予の内側） | 一言 | 吐き出している最中。**赤にはしない** |

1 は「どこも赤くならないまま止まる」型の壊れかたで、いちばん見つけにくい。
`schedule_fetch_chat.yml` の cron は 20:00 UTC だが**実際に走り出すのは
21:49〜23:32 UTC**（`docs/island-fresh.md`）。この見張りは取り込みの後ろに
繋いで走る（`rebake.yml`）ので、前の晩のぶんではなく今夜のぶんを見ている。
それでも遅れを踏まないよう、しきい値は 36時間に置いた。

2 の猶予（`DRAIN_DAYS`）は、詰まっているぶんを吐き出す時間。窓の外の枠は
1晩 `LATE_LANE_MAX_VIDEOS` 本なので、26本なら2晩で空になる。
**3晩みても残っているなら、枠が効いていない。**

## 判定は BigQuery に置かない

`judge()` は行の並びを受け取るだけで、口を持たない。**本番にも資格情報にも
触らずに、仕込んだ行で赤くなることを確かめられる**ようにするため
（`python/stuck_waiting_selftest.py`）。見張りそのものが壊れていたら、
見張っていないのと同じなので。
"""

from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

# `config.py` は `BQ_PROJECT_ID` が無いと import した時点で落ちる。
# **仕込みで判定だけを見るときは、繋ぎ先が要らない。**
# ここで置き換えるのは `--fixture` のときだけなので、本番の口を叩く経路では
# 環境変数が無いことがそのまま落ちる（見張りが黙って別の先を見ないため）。
if "--fixture" in sys.argv:
    os.environ.setdefault("BQ_PROJECT_ID", "fixture")

from config import (  # noqa: E402
    BQ_DATASET,
    BQ_TABLE_VIDEOS,
    LATE_LANE_MAX_VIDEOS,
    MAX_RETRY_PERIOD_SECONDS,
)

# 最後の試行からこれだけ経っていたら「取り込みが走っていない」。
# 定時実行のぶれ（21:49〜23:32 UTC）を丸ごと呑んでも鳴らない値にする。
# 24時間だと、遅い晩と早い晩が隣り合っただけで鳴って、狼少年になる。
STALE_HOURS = 36

# 窓の外のぶんを吐き出しきるまでに見込む晩数。これを過ぎても残っていたら赤。
DRAIN_DAYS = 3

TABLE = f"{BQ_DATASET}.{BQ_TABLE_VIDEOS}"

# 見るのに要る列だけ。**全部は引かない**（チャット本文には一切触れない）
SQL = f"""
SELECT
  video_id,
  status,
  title,
  first_seen_at,
  last_attempt_at,
  attempt_count
FROM `{{project}}.{TABLE}`
WHERE status IN ('PENDING', 'WAITING')
   OR last_attempt_at IS NOT NULL
"""


@dataclass
class Verdict:
    """見た結果。**赤にするかどうかと、その理由。**"""

    red: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    stuck: list[dict] = field(default_factory=list)
    draining: list[dict] = field(default_factory=list)
    last_attempt_at: datetime | None = None

    @property
    def ok(self) -> bool:
        return not self.red


def _ts(v) -> datetime | None:
    """BigQuery の TIMESTAMP も、JSON の文字列も、同じ形にそろえる。"""
    if v is None or v == "":
        return None
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    s = str(v).replace("Z", "+00:00").replace(" UTC", "")
    if " " in s and "T" not in s:
        s = s.replace(" ", "T", 1)
    d = datetime.fromisoformat(s)
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def judge(rows: list[dict], now: datetime | None = None) -> Verdict:
    """行を見て、赤にするかどうかを決める。**BigQuery を引かない。**

    Args:
        rows: `video_id` / `status` / `first_seen_at` / `last_attempt_at` を持つ辞書の並び
        now: 現在時刻（省略時は UTC の現在時刻）

    Returns:
        Verdict
    """
    if now is None:
        now = datetime.now(timezone.utc)
    v = Verdict()

    window = timedelta(seconds=MAX_RETRY_PERIOD_SECONDS)
    grace = window + timedelta(days=DRAIN_DAYS)

    # --- 1. 取り込みそのものが走っているか -------------------------------
    attempts = [_ts(r.get("last_attempt_at")) for r in rows]
    attempts = [a for a in attempts if a is not None]
    v.last_attempt_at = max(attempts) if attempts else None

    if v.last_attempt_at is None:
        v.red.append("`videos` に試行の記録が1行もありません。取り込みが一度も走っていないか、表を見る先が違います")
    else:
        idle_h = (now - v.last_attempt_at).total_seconds() / 3600
        if idle_h >= STALE_HOURS:
            v.red.append(
                f"取り込みが {idle_h:.0f} 時間走っていません"
                f"（最後の試行 {v.last_attempt_at:%Y-%m-%d %H:%M} UTC / しきい値 {STALE_HOURS}時間）"
            )

    # --- 2/3. 窓の外に残っているもの ---------------------------------------
    for r in rows:
        if r.get("status") not in ("PENDING", "WAITING"):
            continue
        seen = _ts(r.get("first_seen_at"))
        age = None if seen is None else (now - seen)
        if age is not None and age < window:
            continue  # 窓の内側。毎晩拾われている
        item = {
            "video_id": r.get("video_id"),
            "status": r.get("status"),
            "title": r.get("title"),
            "attempt_count": r.get("attempt_count"),
            "days": None if age is None else age.days,
        }
        if age is None or age >= grace:
            v.stuck.append(item)
        else:
            v.draining.append(item)

    if v.stuck:
        oldest = max((s["days"] or 0) for s in v.stuck)
        v.red.append(
            f"7日の窓を{DRAIN_DAYS}日以上すぎても拾い直せていない配信が {len(v.stuck)} 本あります"
            f"（いちばん古いもので {oldest} 日）。`QUERY_SELECT_TARGET_VIDEOS` の窓の外の枠を見てください"
        )
    if v.draining:
        v.notes.append(
            f"窓の外から拾い直している最中のものが {len(v.draining)} 本あります"
            f"（1晩 {LATE_LANE_MAX_VIDEOS} 本まで。あと数晩で SUCCEEDED か SKIPPED になります）"
        )
    return v


def fetch(project: str) -> list[dict]:
    """BigQuery から見るぶんだけ引く。"""
    from google.cloud import bigquery

    client = bigquery.Client(project=project)
    return [dict(r) for r in client.query(SQL.format(project=project)).result()]


def report(v: Verdict) -> None:
    """人が読む形と、Actions が読む形の両方で出す。"""
    if v.last_attempt_at:
        print(f"最後に試したのは {v.last_attempt_at:%Y-%m-%d %H:%M} UTC")
    for line in v.notes:
        print(f"  {line}")
    for item in v.stuck:
        print(
            f"  止まっている  {item['video_id']}  {item['status']}"
            f"  {item['days']}日  試行{item['attempt_count']}  {item['title'] or ''}"
        )
    for line in v.red:
        print(f"::error::{line}")

    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write("\n### 取り込みの詰まり\n\n")
            if v.ok and not v.notes:
                f.write("詰まっているものはありません。\n")
            for line in v.red:
                f.write(f"- 🔴 {line}\n")
            for line in v.notes:
                f.write(f"- {line}\n")
            for item in v.stuck[:20]:
                f.write(f"  - `{item['video_id']}` {item['status']} {item['days']}日 {item['title']}\n")


def main() -> int:
    argv = sys.argv[1:]
    if "--fixture" in argv:
        path = Path(argv[argv.index("--fixture") + 1])
        rows = json.loads(path.read_text(encoding="utf-8"))
    else:
        project = os.environ.get("BQ_PROJECT_ID", "")
        if not project:
            print("環境変数 BQ_PROJECT_ID がありません", file=sys.stderr)
            return 2
        rows = fetch(project)

    if not rows:
        print("数えるものがありません（`videos` が空）", file=sys.stderr)
        return 2

    v = judge(rows)
    report(v)
    return 0 if v.ok else 1


if __name__ == "__main__":
    sys.exit(main())
