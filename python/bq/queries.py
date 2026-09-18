"""
BigQuery SQL クエリ定義モジュール

抽出SQL・更新SQLを集約し、SQLの散逸を防ぐ。
すべてのクエリはここで定義・管理する。
"""

from config import (
    BQ_DATASET,
    BQ_TABLE_VIDEOS,
    BQ_TABLE_CHAT_MESSAGES,
    MAX_RETRY_PERIOD_SECONDS,
)

# ============================================================================
# videos テーブル - Discovery 関連
# ============================================================================

# Discovery で使用: 指定期間内の既存 video_id を取得
# 
# 用途:
# - Discovery 時の打ち切り判定に使用
# - 既知の video_id が連続で現れたら Discovery を打ち切る
# - lookback 範囲内の video_id のみを取得してパフォーマンスを最適化
QUERY_GET_EXISTING_VIDEO_IDS_IN_RANGE = f"""
SELECT
  video_id
FROM
  `{BQ_DATASET}.{BQ_TABLE_VIDEOS}`
WHERE
  actual_start_time >= @cutoff_time
  OR actual_start_time IS NULL
"""

# Discovery で使用: 既存の video_id をすべて取得（後方互換性のため保持）
# 
# 注意: この クエリは大量のレコードを返す可能性があるため、
# 代わりに QUERY_GET_EXISTING_VIDEO_IDS_IN_RANGE の使用を推奨
QUERY_GET_EXISTING_VIDEO_IDS = f"""
SELECT
  video_id
FROM
  `{BQ_DATASET}.{BQ_TABLE_VIDEOS}`
"""

# ============================================================================
# videos テーブル - Discovery UPSERT
# ============================================================================

# Discovery で取得した動画を MERGE（新規 or 既存のメタデータ更新のみ）
# 
# 重要: 既存レコードの進捗情報（status, attempt_count 等）は絶対に更新しない
# 更新対象は title と actual_start_time のみ
QUERY_DISCOVERY_UPSERT_VIDEO = f"""
MERGE `{BQ_DATASET}.{BQ_TABLE_VIDEOS}` T
USING UNNEST(@videos) S
ON T.video_id = S.video_id
WHEN MATCHED THEN
  UPDATE SET
    title = S.title,
    actual_start_time = SAFE_CAST(S.actual_start_time AS TIMESTAMP)
WHEN NOT MATCHED THEN
  INSERT (
    video_id,
    status,
    first_seen_at,
    attempt_count,
    title,
    actual_start_time
  )
  VALUES (
    S.video_id,
    'PENDING',
    CURRENT_TIMESTAMP(),
    0,
    S.title,
    SAFE_CAST(S.actual_start_time AS TIMESTAMP)
  )
"""

# ============================================================================
# videos テーブル - 取得対象抽出
# ============================================================================

# 処理対象の動画を抽出するクエリ
#
# **枠は2つある。窓（7日）の内側と、窓からこぼれたぶん。**
#
# ## なぜ2つに分かれているか（2026-09-17）
#
# もとは「`first_seen_at` が7日以内」の1本だけだった。7日を過ぎたものは
# SKIPPED に落とす決まりだが、**その判定は選ばれた動画にしか走らない**
# （`fetch_chat_data.handle_no_chat_file` → `utils.time.should_skip_after_7days`）。
# つまり窓の外に出た WAITING は、**拾われもせず、落ちもしない。**
#
# 本番でそれが26本あった。全部 `attempt_count = 1`（＝1回試したきり）で、
# いちばん古いのは 2026-02-06。原因は窓そのものではなく、**取り込みが
# 毎晩は走っていなかったこと**にある。実際に走った日は 02-06 / 02-27 / 03-03 /
# 03-13 / 03-27 / 04-24 / 05-20 / 05-30 / 06-24 / 06-27 / 07-25 / 07-28 /
# 08-28 と、ひと月おきの追いつき処理だった（毎晩になったのは 2026-09-04 から）。
# **次に走るのが10〜31日後なら、どの行も必ず窓の外にいる。**
# だから2回目の試行が一度も起きなかった。詳しくは `docs/island-misses.md` #123。
#
# ## 窓を外さないのはなぜか
#
# 外すと毎晩、取り込めなかった全部（本番で91本）を yt-dlp にかけ直すことになる。
# 欲しいのは「もう一度だけ拾って、決着をつける」ことなので、
# **窓の外には本数を絞った別枠を置く**（`LATE_LANE_MAX_VIDEOS`）。
#
# この枠から入った動画は、`first_seen_at` が必ず7日より古いので、
# チャットが出なければその場で SKIPPED、本物のエラーでも SKIPPED になる。
# **1本につき1回で終わり、WAITING には戻らない。** だから溜まらない。
#
# ## 抽出条件
#
# 共通: `next_retry_at` が NULL、または現在時刻以前（リトライ可能）
#
# | 枠 | status | first_seen_at | 上限 |
# | --- | --- | --- | --- |
# | 窓の内側 | PENDING / WAITING / FAILED | 7日以内 | `@max_videos` |
# | 窓の外側 | PENDING / WAITING | 7日より古い、または NULL | `@max_late_videos` |
#
# **窓の外側に FAILED を入れていない。** FAILED は「試して駄目だった」という
# 判定が既に出ている状態で、`build_residents` の数え方でも SKIPPED と同じ
# 「読めなかった日」に入る（状態を移しても島の数字は1日も動かない）。
# いっぽう WAITING は「次の晩にもう一度試す」と言ったまま試していない状態で、
# **言っていることが嘘になっている。** 直す相手はそちら。
# 本番の FAILED 63本を拾い直すかどうかは、別に決めればよい。
#
# 窓の日数は `MAX_RETRY_PERIOD_SECONDS` から作る。**数字を書き写さない。**
# ここと `should_skip_after_7days()` がずれると、拾ったのに落とせない
# （あるいは落とすのに拾えない）行がまた出る。
#
# ## 窓の外の並びは、`first_seen_at` だけでは決まらない（2026-09-18）
#
# **`first_seen_at` は同じ値がずらりと並ぶ。** Discovery の MERGE が
# `CURRENT_TIMESTAMP()` を1回だけ評価して、その回に見つけた全部へ同じ値を
# 焼くため。本番の `videos` 777行のうち **261行が同値の組**（20組）で、
# いちばん大きい組は **37行が 2026-05-30 10:05:41.218578 でぴったり同じ**。
#
# 枠は1晩 `@max_late_videos` 本しか通さないので、**同値の組が枠より大きいと、
# 誰が入って誰が余るかは `ORDER BY` が決めていない**（BigQuery は同値の
# 並びを約束しない）。2026-09-17 の晩に実際にそうなった。窓の外の候補26本の
# うち、
#
#   - 9本 … `first_seen_at` が本当に古い（02-06 〜 05-20）
#   - 12本 … 2026-05-30 10:05:41 で**全部同じ値**。枠の残りは11。**1本あぶれた**
#
# あぶれた `__Puza5-4q0` は、残り5本（06-27 の3本・07-28 の2本）と一緒に
# 翌晩へ回った。**順番待ちとしては正しい。** ただし誰があぶれたかは
# たまたまで、次の晩も同じ組で争えば**また同じ行が負けうる。**
#
# だから並びを**必ず一意に決まるところまで**書く。
#
#   1. `first_seen_at` — 古い取りこぼしから
#   2. `last_attempt_at` — 同着なら**いちばん長く試されていないもの**から。
#      NULL（一度も試していない）は BigQuery でも sqlite でも ASC の先頭に来る
#   3. `video_id` — それでも同着なら、**何度流しても同じ答え**になるように
#
# 2 を 3 より先に置いているのは、同着の組の中では「放っておかれた順」が
# 拾う順として正しいから。3 は最後の保険で、**意味ではなく再現性のため**に要る。
#
# ソート順:
# - next_retry_at または first_seen_at の早い順（古いものから処理）
QUERY_SELECT_TARGET_VIDEOS = f"""
WITH due AS (
  SELECT
    video_id,
    status,
    first_seen_at,
    next_retry_at,
    attempt_count,
    last_attempt_at,
    last_error_code,
    last_error_detail,
    succeeded_at,
    yt_dlp_version,
    title,
    actual_start_time
  FROM
    `{BQ_DATASET}.{BQ_TABLE_VIDEOS}`
  WHERE
    next_retry_at IS NULL OR next_retry_at <= CURRENT_TIMESTAMP()
),
fresh AS (
  SELECT * FROM due
  WHERE
    status IN ('PENDING', 'WAITING', 'FAILED')
    AND first_seen_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {MAX_RETRY_PERIOD_SECONDS} SECOND)
  ORDER BY
    COALESCE(next_retry_at, first_seen_at) ASC,
    first_seen_at ASC
  LIMIT @max_videos
),
late AS (
  SELECT * FROM due
  WHERE
    status IN ('PENDING', 'WAITING')
    AND (
      first_seen_at IS NULL
      OR first_seen_at < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {MAX_RETRY_PERIOD_SECONDS} SECOND)
    )
  ORDER BY
    first_seen_at ASC,
    last_attempt_at ASC,
    video_id ASC
  LIMIT @max_late_videos
),
-- 2つの枠を足してから並べ直す。**足したものを一度くくる**のは、
-- UNION の外の ORDER BY に式（COALESCE）を書くため。
picked AS (
  SELECT * FROM fresh
  UNION ALL
  SELECT * FROM late
)
SELECT * FROM picked
ORDER BY
  COALESCE(next_retry_at, first_seen_at) ASC,
  first_seen_at ASC
"""

# ============================================================================
# videos テーブル - 更新/挿入
# ============================================================================

# 動画レコードを MERGE（存在すれば更新、なければ挿入）
# 
# 用途:
# - 処理開始時の attempt_count 更新
# - 処理終了時の status/エラー情報更新
QUERY_MERGE_VIDEO = f"""
MERGE `{BQ_DATASET}.{BQ_TABLE_VIDEOS}` T
USING (
  SELECT
    @video_id AS video_id,
    @status AS status,
    @first_seen_at AS first_seen_at,
    @next_retry_at AS next_retry_at,
    @attempt_count AS attempt_count,
    @last_attempt_at AS last_attempt_at,
    @last_error_code AS last_error_code,
    @last_error_detail AS last_error_detail,
    @succeeded_at AS succeeded_at,
    @yt_dlp_version AS yt_dlp_version,
    @title AS title,
    @actual_start_time AS actual_start_time
) S
ON T.video_id = S.video_id
WHEN MATCHED THEN
  UPDATE SET
    status = S.status,
    first_seen_at = S.first_seen_at,
    next_retry_at = S.next_retry_at,
    attempt_count = S.attempt_count,
    last_attempt_at = S.last_attempt_at,
    last_error_code = S.last_error_code,
    last_error_detail = S.last_error_detail,
    succeeded_at = S.succeeded_at,
    yt_dlp_version = S.yt_dlp_version,
    title = S.title,
    actual_start_time = S.actual_start_time
WHEN NOT MATCHED THEN
  INSERT (
    video_id,
    status,
    first_seen_at,
    next_retry_at,
    attempt_count,
    last_attempt_at,
    last_error_code,
    last_error_detail,
    succeeded_at,
    yt_dlp_version,
    title,
    actual_start_time
  )
  VALUES (
    S.video_id,
    S.status,
    S.first_seen_at,
    S.next_retry_at,
    S.attempt_count,
    S.last_attempt_at,
    S.last_error_code,
    S.last_error_detail,
    S.succeeded_at,
    S.yt_dlp_version,
    S.title,
    S.actual_start_time
  )
"""

# ============================================================================
# chat_messages テーブル - MERGE（idempotent）
# ============================================================================

# チャットメッセージを MERGE（主キー: video_id + event_id）
# 
# 特徴:
# - 同一 (video_id, event_id) は上書きされる（冪等性）
# - ingest_run_id / ingested_at は常に最新で更新（最終取得を追跡）
# 
# 重要な設計方針（Primitive-only pattern）:
# - Python側では TIMESTAMP や JSON をすべて STRING として渡す
# - SQL側で SAFE_CAST / SAFE.PARSE_JSON で変換
# 
# 理由:
# - ArrayQueryParameter + STRUCT では datetime や JSON を直接渡せない
# - すべてプリミティブ型（STRING/INT64）として扱う必要がある
# 
# SAFE_CAST vs PARSE_TIMESTAMP:
# - SAFE_CAST(... AS TIMESTAMP): RFC3339 文字列を自動解釈（推奨）
# - PARSE_TIMESTAMP(format, ...): フォーマット文字列が必要（フォーマット事故のリスク）
# 
# SAFE.PARSE_JSON:
# - 不正な JSON → NULL に変換（クエリは失敗しない）
# - 正常な JSON → JSON 型として格納
# 
# 注意:
# - バッチサイズに注意（Python側で分割処理）
QUERY_MERGE_CHAT_MESSAGES = f"""
MERGE `{BQ_DATASET}.{BQ_TABLE_CHAT_MESSAGES}` T
USING UNNEST(@messages) S
ON T.video_id = S.video_id AND T.event_id = S.event_id
WHEN MATCHED THEN
  UPDATE SET
    event_type = S.event_type,
    timestamp_usec = S.timestamp_usec,
    published_at = SAFE_CAST(S.published_at AS TIMESTAMP),
    author_name = S.author_name,
    author_channel_id = S.author_channel_id,
    message_text = S.message_text,
    message_runs_json = SAFE.PARSE_JSON(S.message_runs_json),
    purchase_amount_text = S.purchase_amount_text,
    ingest_run_id = S.ingest_run_id,
    ingested_at = SAFE_CAST(S.ingested_at AS TIMESTAMP),
    source_file = S.source_file,
    source_line_no = S.source_line_no,
    raw_item_json = SAFE.PARSE_JSON(S.raw_item_json)
WHEN NOT MATCHED THEN
  INSERT (
    video_id,
    event_id,
    event_type,
    timestamp_usec,
    published_at,
    author_name,
    author_channel_id,
    message_text,
    message_runs_json,
    purchase_amount_text,
    ingest_run_id,
    ingested_at,
    source_file,
    source_line_no,
    raw_item_json
  )
  VALUES (
    S.video_id,
    S.event_id,
    S.event_type,
    S.timestamp_usec,
    SAFE_CAST(S.published_at AS TIMESTAMP),
    S.author_name,
    S.author_channel_id,
    S.message_text,
    SAFE.PARSE_JSON(S.message_runs_json),
    S.purchase_amount_text,
    S.ingest_run_id,
    SAFE_CAST(S.ingested_at AS TIMESTAMP),
    S.source_file,
    S.source_line_no,
    SAFE.PARSE_JSON(S.raw_item_json)
  )
"""
