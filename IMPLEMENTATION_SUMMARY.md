# YouTube アーカイブ動画 Discovery + Fetch システム実装サマリー

## 概要

YouTube ライブ配信アーカイブ（completed）の video_id を自動発見（Discovery）し、BigQuery `youtube_chat.videos` に投入。続けて yt-dlp でチャット取得 → 解析 → BigQuery `chat_messages` に MERGE する処理を実装。

## 実装内容

### 1. BigQuery スキーマ拡張

**変更ファイル:** `infra/big-query/migration/20260129T0000_create_youtube_chat_tables.sql`

`youtube_chat.videos` テーブルに以下のカラムを追加:
- `title STRING`: 動画タイトル（YouTube API から取得）
- `actual_start_time TIMESTAMP`: 実際の配信開始時刻（liveStreamingDetails.actualStartTime）

### 2. Python モジュール構造

```
python/
├── discover_videos.py          # Discovery エントリポイント
├── fetch_chat_data.py          # Fetch エントリポイント（既存）
├── config.py                   # 設定（環境変数、定数）
├── logging_util.py             # ログユーティリティ
├── bq/
│   ├── client.py              # BigQuery クライアント
│   ├── queries.py             # SQL 定義
│   └── repository.py          # クエリ実行・データ操作
├── youtube_api/
│   ├── client.py              # YouTube Data API クライアント
│   └── discovery.py           # completed 動画の検索・取得
├── youtube_chat/
│   ├── downloader.py          # yt-dlp 実行
│   ├── parser.py              # JSONL パース
│   └── normalizer.py          # データ正規化
├── models/
│   └── types.py               # データクラス定義
└── utils/
    ├── time.py                # 時間関連ユーティリティ
    ├── batching.py            # バッチ分割
    └── filesystem.py          # ファイル操作
```

### 3. Discovery 処理フロー

**エントリポイント:** `python/discover_videos.py`

1. **YouTube Data API 呼び出し**
   - `search.list`: completed 動画を検索（ページング対応）
     - channelId, type=video, eventType=completed
     - publishedAfter: 現在時刻 - lookback_days（デフォルト 10 日）
   - `videos.list`: 詳細情報を取得（50 件ずつバッチ処理）
     - title, actualStartTime を収集

2. **BigQuery UPSERT**
   - 新規レコード:
     - video_id, title, actual_start_time
     - status='PENDING', first_seen_at=CURRENT_TIMESTAMP(), attempt_count=0
   - 既存レコード:
     - title, actual_start_time のみ更新
     - **重要:** status, attempt_count, first_seen_at 等の進捗情報は更新しない

### 4. Fetch 処理フロー（既存維持）

**エントリポイント:** `python/fetch_chat_data.py`

1. **対象動画抽出**
   - status IN ('PENDING', 'WAITING', 'FAILED')
   - next_retry_at IS NULL OR next_retry_at <= CURRENT_TIMESTAMP()
   - first_seen_at >= CURRENT_TIMESTAMP() - 7 日

2. **yt-dlp 実行**
   - チャットデータをダウンロード
   - タイムアウト: 300 秒（設定可能）

3. **JSONL パース**
   - ストリーム読み込み（大容量対応）
   - エラー行はスキップし統計に記録
   - renderer 種別で正規化:
     - liveChatTextMessageRenderer → TEXT
     - liveChatPaidMessageRenderer → PAID
     - liveChatMembershipItemRenderer → MEMBERSHIP
     - その他 → UNKNOWN（raw 保持）

4. **BigQuery MERGE**
   - 主キー: (video_id, event_id)
   - 冪等性: 同一キーは上書き
   - バッチ分割: 5000 件ごと（設定可能）

5. **状態更新**
   - 成功: SUCCEEDED
   - チャット未取得（24h 以内）: WAITING（翌日リトライ）
   - チャット未取得（24h 超過）: FAILED
   - 7 日超過: SKIPPED

### 5. GitHub Actions ワークフロー

**ファイル:** `.github/workflows/schedule_fetch_chat.yml`

```yaml
jobs:
  discover_videos:
    # YouTube API から動画を検索・登録
    
  fetch_chat_data:
    needs: discover_videos  # Discovery 成功後に実行
    # チャットデータを取得・解析
```

**workflow_dispatch 入力:**
- `lookback_days`: Discovery の検索日数（デフォルト: 10）

**環境変数:**
- `YOUTUBE_API_KEY`: YouTube Data API キー（Secrets）
- `YOUTUBE_CHANNEL_ID`: 対象チャンネル ID（Vars）
- `BQ_PROJECT_ID`: BigQuery プロジェクト ID
- `DISCOVERY_LOOKBACK_DAYS`: 検索日数（inputs から注入）

### 6. 依存パッケージ

**追加:** `python/requirements.txt`
- `google-api-python-client>=2.100.0`: YouTube Data API v3

**既存:**
- `google-cloud-bigquery>=3.11.0`: BigQuery 操作
- `requests>=2.31.0`: HTTP 通信（将来の拡張用）

## 主要な設計判断

### Discovery の UPSERT 方針

**新規動画:**
- status='PENDING' で初期化
- first_seen_at=CURRENT_TIMESTAMP() を記録
- リトライ判定の基準点となる

**既存動画:**
- title, actual_start_time のみ更新
- **status, attempt_count, first_seen_at は絶対に更新しない**
- 理由: Discovery が勝手に進捗をリセットする事故を防ぐ

### リトライ戦略

**24 時間ルール:**
- first_seen_at から 24h 以内にチャット未取得 → WAITING
- next_retry_at = first_seen_at + 24h
- 理由: 直近のアーカイブはチャットがまだ利用できない可能性

**7 日間ルール:**
- first_seen_at から 7 日超過 → SKIPPED
- 理由: 7 日経ってもチャットが取得できない場合、永久に取得不可の可能性が高い

### エラーハンドリング

**YouTube API:**
- HTTP 429, 500, 503 → 指数バックオフでリトライ（最大 3 回）
- その他のエラー → 即座に失敗（Discovery job 全体を失敗させる）

**JSONL パース:**
- JSON デコードエラー → 該当行をスキップ（統計に記録）
- 未知の renderer → UNKNOWN として raw_item_json のみ保持

**BigQuery:**
- MERGE 失敗 → 動画を FAILED に移行、エラーコード・詳細を記録

## 運用上の注意点

### 環境変数の設定

GitHub Actions で以下を設定する必要があります:
- Secrets: `YOUTUBE_API_KEY`, `GCP_SA_KEY`
- Variables: `YOUTUBE_CHANNEL_ID`, `BQ_PROJECT_ID`

### BigQuery テーブル初期化

初回実行前に以下のスクリプトを実行:
```bash
export BQ_PROJECT_ID="your-project-id"
bash infra/big-query/20260128T0000_setup_youtube_chat_dataset.sh
bq query --project_id="$BQ_PROJECT_ID" --use_legacy_sql=false < infra/big-query/migration/20260129T0000_create_youtube_chat_tables.sql
```

### 手動実行

workflow_dispatch から lookback_days を変更して手動実行可能:
- デフォルト: 10 日
- 初回実行: 30〜90 日を推奨（過去のアーカイブを一括取得）

### 同時実行制御

`concurrency: group: fetch-chat-${{ github.ref }}` により、同一ブランチでの同時実行を防止。

## テスト結果

- [x] Python 構文チェック完了（全モジュール）
- [x] import テスト完了（全モジュール）
- [x] npm lint: 既存警告のみ（Python コード影響なし）
- [x] npm typecheck: 既存エラーのみ（Python コード影響なし）

## 今後の拡張候補

- Discovery の増分更新最適化（etag 対応）
- Fetch のバッチ並列処理（複数動画同時処理）
- エラー通知機能（Slack, Discord 等）
- ダッシュボード（処理状況の可視化）
