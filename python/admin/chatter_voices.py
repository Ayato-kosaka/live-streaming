"""**セリフの無い住人の口調を、本人のコメントから拾ってくる。** 読むだけ。

ARGS 例:
  {}              … よく歩く順に、セリフの無い人 8人ぶん拾う
  {"top": 12}     … 人数を変える
  {"days": 180}   … さかのぼる日数（既定 120日）

## なぜ要るか

島の住人のセリフ（`site/content/chatter.ts`）は**手で書く**。持っていない人は
共通のセリフに落ちて、**80人が一字一句同じ4行**を喋る。視聴者さんから
「台詞が普通すぎる」と言われて初めて出てきた（2026-09-16）。

書くには**その人の口調**が要る。`chatter.ts` の決まり1が「口調はその人のもの。
似ていないセリフは、いない人が喋っているのと同じ」なので、想像で書けない。
口調の出どころは配信のチャット＝BigQuery の `chat_messages` しかない。

## 誰を拾うか。**入力に人を指さない**

`site/content/residents.ts`（icon・channel・score）と `site/content/chatter.ts`
（収録済みの icon）を**このスクリプトが自分で読む。** 差はそこで出る。

**ARGS に呼び名やチャンネルIDを渡さない。** ARGS はワークフローのログに出る
（`hint_query_probe.py` の注と同じ）。人を指さなければ、こちらの手から
識別子が1文字も出ない。

## 何を出すか

**icon とコメント本文だけ。** 表示名もチャンネルIDも出さない。
icon は `residents.ts` に載っていて既に公開なので、これで新しく漏れるものは無い。

## 流す量

`chat_messages` は `published_at` で区切られているので、日数で切れば読む量は
その範囲だけで済む。**流す前に必ず見積もって、上限を超えたら引かずに止める**
（あやと「1GB超えるSQL流すのは控えて」2026-09-11）。
"""

import json
import os
import sys
from collections import defaultdict

from _fs import args, log  # noqa: E402

# **`site/content/*.ts` を字で読むのは、このリポジトリで1本だけ**（`python/ts_read.py`）
import ts_read  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RESIDENTS = os.path.join(ROOT, "site", "content", "residents.ts")
CHATTER = os.path.join(ROOT, "site", "content", "chatter.ts")

PROJECT = os.environ.get("BQ_PROJECT_ID", "live-streaming-d3cac")
DATASET = os.environ.get("BQ_DATASET", "youtube_chat")
BOT_NAME = "Nightbot"

# 1人あたり何件見せるか。多すぎると読めないし、少ないと口調が分からない
PER_PERSON = 40
# 流してよい量の上限。これを超えたら引かない
MAX_BYTES = 1 << 30  # 1GiB


def _read(path: str, name: str, keys: tuple) -> list:
    """焼き込みの並びを1つ読む。**読み落としたら止める。**

    字を読むのは `python/ts_read.py` の1本だけ（`ts_read.py` の頭）。
    ここは前、`\\{[^{}]*icon:\\s*"…"[^{}]*\\}` のように**1人が1行で
    焼かれていること**を当てにしていた。行の折り方が変わればその人が
    黙って消えるので、数で止める形に直した。
    """
    with open(path, encoding="utf-8") as f:
        got = ts_read.read_array(f.read(), name, keys=keys, id_key="icon")
    if got.declared == 0:
        raise SystemExit(f"{os.path.basename(path)} の {name} が空です（置き場が変わった？）")
    if got.missed:
        raise SystemExit(
            f"{os.path.basename(path)} の {name} の {got.declared} 件のうち "
            f"{got.missed} 件を読み落としました"
        )
    return got.rows


def voiced_icons() -> set:
    """`chatter.ts` の VOICES に載っている icon。"""
    return {r["icon"] for r in _read(CHATTER, "VOICES", ("icon",))}


def roster() -> list:
    """名簿を score の高い順に。`{icon, channel, score, days}`。"""
    out = []
    for r in _read(RESIDENTS, "RESIDENTS", ("icon", "channel", "score", "days")):
        if not r["channel"]:
            continue  # チャンネルIDの付いていない人（名乗りでしか結べていない人）
        out.append({
            "icon": r["icon"], "channel": r["channel"],
            "score": float(r["score"]) if r["score"] else 0.0,
            "days": int(r["days"]) if r["days"].isdigit() else 0,
        })
    out.sort(key=lambda p: -p["score"])
    return out


def sql_of(n_channels: int, days: int) -> str:
    """その人たちのコメントを、新しい順に1人 PER_PERSON 件まで。

    **本文と日付だけ。** 表示名もチャンネルIDも SELECT しない——ログに
    出さないものは、はじめから持って帰らない。並べ替えの鍵に icon を
    使えないので、`ch` は returns に残すが出力では icon に置き換える。
    """
    return f"""
    WITH m AS (
      SELECT author_channel_id AS ch,
             message_text AS t,
             DATE(TIMESTAMP_SUB(published_at, INTERVAL 9 HOUR)) AS d,
             ROW_NUMBER() OVER (
               PARTITION BY author_channel_id ORDER BY published_at DESC
             ) AS rn
      FROM `{PROJECT}.{DATASET}.chat_messages`
      WHERE published_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {days} DAY)
        AND event_type IN ('TEXT', 'PAID')
        AND author_name != '{BOT_NAME}'
        AND author_channel_id IN UNNEST(@chs)
        AND message_text IS NOT NULL
        AND CHAR_LENGTH(message_text) BETWEEN 4 AND 120
    )
    SELECT ch, t, d FROM m WHERE rn <= {PER_PERSON} ORDER BY ch, d DESC
    """


def main() -> int:
    a = args()
    top = int(a.get("top") or 8)
    days = int(a.get("days") or 120)

    have = voiced_icons()
    people = roster()
    want = [p for p in people if p["icon"] not in have][:top]

    log.info("名簿 %d 人 / セリフ持ち %d 人 / 拾う %d 人（よく歩く順）",
             len(people), len(have), len(want))
    if not want:
        log.info("セリフの無い人がいません。**引きません**")
        return 2

    from google.cloud import bigquery  # BQ を使うときだけ要る

    client = bigquery.Client(project=PROJECT)
    chs = [p["channel"] for p in want]
    sql = sql_of(len(chs), days)
    cfg = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ArrayQueryParameter("chs", "STRING", chs)]
    )

    # **流す前に見積もる。** 超えたら引かずに止める
    dry = client.query(sql, job_config=bigquery.QueryJobConfig(
        dry_run=True, use_query_cache=False,
        query_parameters=cfg.query_parameters))
    mb = dry.total_bytes_processed / (1 << 20)
    log.info("見積もり: %.1f MB（上限 %.0f MB）", mb, MAX_BYTES / (1 << 20))
    if dry.total_bytes_processed > MAX_BYTES:
        log.error("上限を超えるので**引きません**。days を小さくしてください")
        return 1

    rows = list(client.query(sql, job_config=cfg).result())
    by_ch = defaultdict(list)
    for r in rows:
        by_ch[r["ch"]].append((str(r["d"]), r["t"]))

    log.info("引けたコメント %d 件 / %d 人", len(rows), len(by_ch))
    for p in want:
        got = by_ch.get(p["channel"], [])
        # **icon で見出しを出す。** チャンネルIDも表示名も出さない
        print(f"\n## icon {p['icon']} / score {p['score']:.3f} / 出席 {p['days']}日"
              f" / コメント {len(got)} 件")
        if not got:
            print("   （この範囲にコメントが無い）")
        for d, t in got:
            print(f"   {d}  {t}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
