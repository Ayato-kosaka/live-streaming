# BigQuery Infrastructure

このディレクトリには、YouTube チャット取得基盤の BigQuery 関連インフラストラクチャファイルが含まれています。

## ファイル構成

```
infra/big-query/
├── README.md                                         # このファイル
├── 20260128T0000_setup_youtube_chat_dataset.sh      # データセット初期セットアップスクリプト
└── migration/
    └── 20260129T0000_create_youtube_chat_tables.sql # テーブル作成マイグレーション
```

## セットアップ手順

### 1. 前提条件

- gcloud CLI がインストールされていること
  - インストール: https://cloud.google.com/sdk/docs/install
- 認証が完了していること
  - `gcloud auth login` を実行
- 対象 GCP プロジェクトへのアクセス権限があること
  - BigQuery Admin または相当のロール

### 2. データセットのセットアップ

```bash
# 環境変数を設定
export BQ_PROJECT_ID="your-gcp-project-id"

# セットアップスクリプトを実行
bash infra/big-query/20260128T0000_setup_youtube_chat_dataset.sh
```

このスクリプトは以下を実行します：

- BigQuery API の有効化（冪等）
- `youtube_chat` データセットの作成（冪等）
  - デフォルトロケーション: **us（US マルチリージョン）**
  - 別のリージョンを使用する場合は、スクリプト内の `--location` オプションを変更してください

### 3. テーブルの作成

```bash
# マイグレーションSQLを実行
bq query --project_id="$BQ_PROJECT_ID" --use_legacy_sql=false < infra/big-query/migration/20260129T0000_create_youtube_chat_tables.sql
```

この SQL は以下のテーブルを作成します：

- `youtube_chat.videos`: 動画の処理進捗管理
- `youtube_chat.chat_messages`: チャットイベントの保存（パーティション化・クラスタ化）

## テーブル設計

### youtube_chat.videos

動画の処理ステータスとリトライ制御を管理するテーブル。

主要な列：

- `video_id`: YouTube 動画 ID（一意識別子）
- `status`: 処理ステータス（PENDING, WAITING, SUCCEEDED, FAILED, SKIPPED）
- `first_seen_at`: 初回処理対象時刻（スキップ判定基準）
- `next_retry_at`: 次回リトライ予定時刻
- `attempt_count`: 試行回数
- `last_error_code`: エラー種別
- `yt_dlp_version`: 使用した yt-dlp バージョン

### youtube_chat.chat_messages

チャットイベントを正規化して保存するテーブル。

主要な列：

- `video_id`: YouTube 動画 ID
- `event_id`: チャットイベント ID（一意識別子）
- `event_type`: イベント種別（TEXT, PAID, MEMBERSHIP など）
- `published_at`: イベント発生時刻（パーティションキー）
- `message_text`: メッセージ本文
- `raw_item_json`: 生データ（JSON 型）

最適化設定：

- パーティション: `DATE(published_at)` - クエリコスト削減
- クラスタ: `video_id`, `event_type` - 頻繁なフィルタ条件

## 冪等性

すべてのスクリプトと SQL は冪等性を持ち、何度実行しても安全です：

- セットアップスクリプト: 既存リソースはスキップ
- マイグレーション SQL: `IF NOT EXISTS` を使用

## トラブルシューティング

### 認証エラー

```bash
gcloud auth login
gcloud config set project $BQ_PROJECT_ID
```

### 権限エラー

BigQuery Admin ロールまたは以下の権限が必要です：

- `bigquery.datasets.create`
- `bigquery.tables.create`
- `serviceusage.services.enable`

### データセット確認

```bash
bq ls --project_id="$BQ_PROJECT_ID"
bq ls --project_id="$BQ_PROJECT_ID" youtube_chat
```
