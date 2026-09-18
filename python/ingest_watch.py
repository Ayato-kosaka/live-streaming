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
| 2 | 窓の外の枠が `DRAIN_DAYS` 晩ひとつも吐き出していない | 赤 | **枠が止まっている。** 残っているぶんは永久に残る |
| 3 | 窓の外から拾われたのに、まだ PENDING / WAITING のまま | 赤 | **拾い直しは来ているのに終わっていない。** 1回で終わるはずの枠が空回りしている |
| 4 | 枠に空きがあるのに選ばれていない | 赤 | 枠は動いている。**落としているのは選ぶ条件のほう**（#123 はこの形） |
| 5 | 枠が上限まで出していて、順番待ちしているだけのもの | 一言 | 吐き出している最中。**赤にはしない** |

1 は「どこも赤くならないまま止まる」型の壊れかたで、いちばん見つけにくい。
`schedule_fetch_chat.yml` の cron は 20:00 UTC だが**実際に走り出すのは
21:49〜23:32 UTC**（`docs/island-fresh.md`）。この見張りは取り込みの後ろに
繋いで走る（`rebake.yml`）ので、前の晩のぶんではなく今夜のぶんを見ている。
それでも遅れを踏まないよう、しきい値は 36時間に置いた。

## 猶予は `first_seen_at` から測らない（2026-09-18 に直した）

**2026-09-17 22:52 の本番で、この見張りは「直っている最中」に赤くなった。**
窓の外の枠が初めて回った晩で、26本のうち20本（＝1晩の上限）が片づき、
**残り6本は次の晩に片づくぶん**だった。詰まってはいない。

赤くなったのは、猶予を **`first_seen_at` からの日数**で測っていたから
（`grace = window + DRAIN_DAYS`）。`first_seen_at` は「いつ見つけたか」で、
**枠が効いているかとは何の関係もない。** 半年前の取りこぼしは、枠が
正しく毎晩吐き出している最中でも、必ず猶予の外にいる。

`DRAIN_DAYS` の言葉のほう（「3晩みても残っているなら、枠が効いていない」）は
**「拾い直しが何晩来ていないか」**と言っている。測るのはそちら。
**毎晩赤いものは読まれなくなる**（`docs/island-misses.md` #125 #127）。

## 「拾い直しが来ているか」を、どこで見るか

**行ごとの `last_attempt_at` に置き換えるだけでは足りない。**
窓の外の枠は1晩 `LATE_LANE_MAX_VIDEOS` 本なので、**順番待ちの行は、
枠が正しく動いていても何晩も当たらない。** 実際に残った6本は
`last_attempt_at` が 2026-05-30 / 06-27 / 07-28 のままだった。

見るのは行ではなく**枠**。窓の外から拾われた行は
`last_attempt_at - first_seen_at >= 窓` という形をしているので、
**その形をした行のいちばん新しい `last_attempt_at`** が「枠が最後に吐き出した晩」。
本番で数えると 2026-09-17 22:38 の20本ちょうどで、枠の足跡はここにしか出ない。

| 行の様子 | 見立て |
| --- | --- |
| その行自身が窓の外から拾われた跡がある（`last_attempt_at - first_seen_at >= 窓`）のに、まだ PENDING / WAITING | **赤。** 枠は当てている。終端の判定が効いていない |
| 枠が `DRAIN_DAYS` 晩ひとつも吐き出していない | **赤。** 枠が止まっている。`last_attempt_at` が NULL の置き去りもここで拾う |
| 枠が回った晩、この行はもう窓の外にいたのに選ばれず、**枠には空きがあった** | **赤。** 枠ではなく、選ぶ条件がこの行を落としている |
| 枠は上限まで出している。この行はまだ順番が来ていない | 一言。あと何晩で空になるかを添える |

**「残っている」は、枠が上限まで出したかどうかで意味が逆になる。**
上限ちょうど（本番の20本）なら順番待ち。上限に届いていないのに残っているなら、
枠は動いていてその行を**選んでいない**——#123 が半年止まったのがこの形で、
止めていたのは枠ではなく `first_seen_at >= 現在 - 7日` という選ぶ条件だった。

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

# **対照用の、足を1本ずつ抜く旗。** 決めは他の道具と同じで、`BREAK=` に足の
# 名前を入れるとその足だけが抜ける（`docs/island-standards.md` §15）。
# 「赤くなる形を3つ当てた」は、3つが同じ足を折っているなら1つなので、
# 足ごとに抜いて**そのたびに見逃すようになること**を見せるために要る
# （`python/stuck_waiting_selftest.py` の `check_watch_legs`）。
# **本番では立てない。** 立っていたら、その run は印字の頭でそう言う。
LEGS = ("stale", "unfinished", "lane", "capacity", "window")


def _broken() -> set[str]:
    """いま抜いている足。"""
    want = {x.strip() for x in os.environ.get("BREAK", "").split(",") if x.strip()}
    odd = want - set(LEGS)
    if odd:
        raise SystemExit(f"BREAK に知らない足があります: {' '.join(sorted(odd))}（{' '.join(LEGS)}）")
    return want


# **窓の外の枠が、何晩ひとつも吐き出さなかったら赤にするか。**
# 数えるのは「行が見つかってから何日たったか」ではなく
# 「枠の足跡が何晩ないか」。前者で測ると、半年前の取りこぼしは
# 吐き出している最中でも必ず赤になる（2026-09-17 に実際にそうなった）。
DRAIN_DAYS = 3

TABLE = f"{BQ_DATASET}.{BQ_TABLE_VIDEOS}"

# 見るのに要る列だけ。**全部は引かない**（チャット本文には一切触れない）。
# **`title` も引かない。** 判定に1度も使っていないうえ、`FAILED` の37本は
# 非公開の配信で、Actions のログは誰でも読める（`docs/island-standards.md`）
SQL = f"""
SELECT
  video_id,
  status,
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
    # 窓の外の枠が最後に吐き出した時刻。**行の試行ではなく、枠の足跡。**
    lane_last_emit: datetime | None = None
    # その晩に枠が出した本数。上限に届いていれば「順番待ち」、届いていなければ
    # 「選ばれていない」。同じ「残っている」でも意味が逆になる
    lane_last_night: int = 0

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


def _late_pickup(row: dict, window: timedelta) -> bool:
    """その行は、**窓の外から拾われた跡**を持っているか。

    窓の外の枠（`QUERY_SELECT_TARGET_VIDEOS` の `late`）が選んだ行は、
    選ばれた時点で `first_seen_at` が窓より古い。だから試行の跡は必ず
    `last_attempt_at - first_seen_at >= 窓` の形で残る。

    **`first_seen_at` が無い行は、枠の判定（`utils.time.is_late_lane`）が
    無条件に「窓の外」と読む。** だから試行の跡があれば、それは枠の跡。
    """
    at = _ts(row.get("last_attempt_at"))
    if at is None:
        return False
    seen = _ts(row.get("first_seen_at"))
    if seen is None:
        return True
    return (at - seen) >= window


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
    broken = _broken()

    window = timedelta(seconds=MAX_RETRY_PERIOD_SECONDS)
    drain = timedelta(days=DRAIN_DAYS)

    # --- 1. 取り込みそのものが走っているか -------------------------------
    attempts = [_ts(r.get("last_attempt_at")) for r in rows]
    attempts = [a for a in attempts if a is not None]
    v.last_attempt_at = max(attempts) if attempts else None

    if v.last_attempt_at is None:
        v.red.append("`videos` に試行の記録が1行もありません。取り込みが一度も走っていないか、表を見る先が違います")
    else:
        idle_h = (now - v.last_attempt_at).total_seconds() / 3600
        if idle_h >= STALE_HOURS and "stale" not in broken:
            v.red.append(
                f"取り込みが {idle_h:.0f} 時間走っていません"
                f"（最後の試行 {v.last_attempt_at:%Y-%m-%d %H:%M} UTC / しきい値 {STALE_HOURS}時間）"
            )

    # --- 枠の足跡 ---------------------------------------------------------
    # 窓の外から拾われた行は、状態が何であれ
    # `last_attempt_at - first_seen_at >= 窓` という形で残る。
    # **その形のいちばん新しい時刻が「枠が最後に吐き出した晩」。**
    # 行の `last_attempt_at` をそのまま見ると、順番待ちの行が
    # 「何晩も当たっていない」と出てしまう（枠は1晩 20本しか出せない）。
    emits = [
        at
        for at in (
            _ts(r.get("last_attempt_at"))
            for r in rows
            if _late_pickup(r, window)
        )
        if at is not None
    ]
    v.lane_last_emit = max(emits) if emits else None
    lane_idle = None if v.lane_last_emit is None else (now - v.lane_last_emit)
    lane_moving = (lane_idle is not None and lane_idle < drain) or "lane" in broken

    # その晩に枠が何本出したか。**上限に届いていないのに残っているなら、
    # 枠は動いているが「その行を選んでいない」。** #123 はこの形で半年止まった
    # （枠そのものではなく、選ぶ条件が行を落としていた）。
    # 数えるのは最後の晩ぶんだけ（同じ run の試行は数分の中に固まっている）
    v.lane_last_night = (
        0 if v.lane_last_emit is None
        else sum(1 for a in emits if (v.lane_last_emit - a) < timedelta(hours=12))
    )

    # --- 2/3/4. 窓の外に残っているもの -------------------------------------
    for r in rows:
        if r.get("status") not in ("PENDING", "WAITING"):
            continue
        seen = _ts(r.get("first_seen_at"))
        if seen is not None and (now - seen) < window and "window" not in broken:
            continue  # 窓の内側。毎晩拾われている
        item = {
            "video_id": r.get("video_id"),
            "status": r.get("status"),
            "attempt_count": r.get("attempt_count"),
            "days": None if seen is None else (now - seen).days,
            "last_attempt_at": r.get("last_attempt_at"),
            "first_seen_at": r.get("first_seen_at"),
        }
        if _late_pickup(r, window) and "unfinished" not in broken:
            # 枠は当てている。窓の外から拾われた行は
            # `handle_no_chat_file` / `handle_failure` がその場で SKIPPED に
            # 落とすので、**1回で終わるはず。** 残っているなら終端が効いていない
            item["why"] = "拾い直しが来たのに終わっていない"
            v.stuck.append(item)
        elif not lane_moving:
            # 枠が止まっている。`last_attempt_at` が NULL のまま置き去りに
            # なっている行も、枠が動いていないのでここに落ちる
            item["why"] = "枠が吐き出していない"
            v.stuck.append(item)
        else:
            v.draining.append(item)

    # 枠が回った晩に**素通りされた**行。数えてよいのは2つとも当てはまるものだけ。
    #
    # 1. 枠が回った時点で、もう窓の外にいた（`first_seen + 窓 <= 足跡`）。
    #    **窓を出たのが枠の後だった行を巻き込まない。** 7日ちょうどの行は
    #    取り込みと見張りのあいだ（十数分）に窓を出ることがある
    # 2. その晩に触られていない。触られていれば素通りではない
    if lane_moving and v.lane_last_emit is not None and "capacity" not in broken:
        passed_over = []
        for item in list(v.draining):
            seen = _ts(item.get("first_seen_at"))
            if seen is not None and (seen + window) > v.lane_last_emit:
                continue
            at = _ts(item.get("last_attempt_at"))
            if at is None or at < v.lane_last_emit - timedelta(hours=1):
                passed_over.append(item)
        if passed_over and v.lane_last_night < LATE_LANE_MAX_VIDEOS:
            for item in passed_over:
                item["why"] = "枠に空きがあるのに選ばれていない"
                v.stuck.append(item)
                v.draining.remove(item)
            v.red.append(
                f"窓の外の枠は {v.lane_last_night} 本しか出していないのに"
                f"（上限 {LATE_LANE_MAX_VIDEOS} 本）、選ばれないまま残っている配信が "
                f"{len(passed_over)} 本あります。枠は動いているので、"
                f"落としているのは `QUERY_SELECT_TARGET_VIDEOS` の `late` の選ぶ条件です"
            )

    unfinished = [s for s in v.stuck if s["why"] == "拾い直しが来たのに終わっていない"]
    waiting_lane = [s for s in v.stuck if s["why"] == "枠が吐き出していない"]

    if unfinished:
        worst = max((s["attempt_count"] or 0) for s in unfinished)
        v.red.append(
            f"窓の外から拾い直したのに終わっていない配信が {len(unfinished)} 本あります"
            f"（いちばん試した回数で {worst} 回）。窓の外で拾った行は1回で SUCCEEDED か SKIPPED に"
            f"なるはずです。`fetch_chat_data.handle_no_chat_file` / `handle_failure` の終端を見てください"
        )
    if waiting_lane:
        since = (
            "一度も吐き出していません"
            if v.lane_last_emit is None
            else f"最後に吐き出したのは {v.lane_last_emit:%Y-%m-%d %H:%M} UTC（{lane_idle.days}日前）"
        )
        v.red.append(
            f"窓の外の枠が {DRAIN_DAYS} 晩ひとつも吐き出していないのに、窓の外に "
            f"{len(waiting_lane)} 本残っています（{since}）。"
            f"`QUERY_SELECT_TARGET_VIDEOS` の窓の外の枠を見てください"
        )
    if v.draining:
        nights = -(-len(v.draining) // max(LATE_LANE_MAX_VIDEOS, 1))
        emit = (
            "枠の足跡は見ていません"
            if v.lane_last_emit is None
            else f"枠が最後に吐き出したのは {v.lane_last_emit:%Y-%m-%d %H:%M} UTC"
        )
        v.notes.append(
            f"窓の外から拾い直している最中のものが {len(v.draining)} 本あります"
            f"（1晩 {LATE_LANE_MAX_VIDEOS} 本まで。あと {nights} 晩で SUCCEEDED か SKIPPED になります。{emit}）"
        )
    return v


def fetch(project: str) -> list[dict]:
    """BigQuery から見るぶんだけ引く。"""
    from google.cloud import bigquery

    client = bigquery.Client(project=project)
    return [dict(r) for r in client.query(SQL.format(project=project)).result()]


def report(v: Verdict) -> None:
    """人が読む形と、Actions が読む形の両方で出す。"""
    if _broken():
        print(f"※ BREAK={','.join(sorted(_broken()))}。足を抜いているので、この判定は根拠になりません")
    if v.last_attempt_at:
        print(f"最後に試したのは {v.last_attempt_at:%Y-%m-%d %H:%M} UTC")
    for line in v.notes:
        print(f"  {line}")
    if v.lane_last_emit:
        print(f"窓の外の枠が最後に吐き出したのは {v.lane_last_emit:%Y-%m-%d %H:%M} UTC")
    for item in v.stuck:
        print(
            f"  止まっている  {item['video_id']}  {item['status']}"
            f"  {item['days']}日  試行{item['attempt_count']}  {item['why']}"
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
                f.write(
                    f"  - `{item['video_id']}` {item['status']} {item['days']}日"
                    f" 試行{item['attempt_count']} {item['why']}\n"
                )


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
