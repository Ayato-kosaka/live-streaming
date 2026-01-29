# YouTube アーカイブチャット取得システム

YouTube のアーカイブ動画からチャットデータを取得し、BigQuery に保存するシステムです。

## 概要

このシステムは以下の機能を提供します：

1. **BigQuery からの動画取得**: 処理対象の動画を自動的に選択
2. **yt-dlp によるチャット取得**: YouTube のチャットデータをダウンロード
3. **データ正規化**: チャットイベントを解析し、構造化データに変換
4. **BigQuery への保存**: MERGE により冪等性を保証した保存
5. **リトライ制御**: 24時間ルール・7日間ルールに基づくインテリジェントなリトライ

## アーキテクチャ

### ディレクトリ構成

```
python/
├── fetch_chat_data.py      # エントリポイント（オーケストレーション）
├── config.py               # 設定（環境変数、定数）
├── logging_util.py         # ログ管理（run_id 付与）
├── requirements.txt        # Python 依存パッケージ
│
├── bq/                     # BigQuery 関連
│   ├── client.py           # クライアント生成
│   ├── queries.py          # SQL クエリ定義
│   └── repository.py       # データ操作（CRUD、MERGE）
│
├── youtube_chat/           # YouTube チャット処理
│   ├── downloader.py       # yt-dlp 実行
│   ├── parser.py           # JSONL ストリーム解析
│   └── normalizer.py       # データ正規化
│
├── models/                 # データモデル
│   └── types.py            # 型定義（Video, ChatMessage等）
│
└── utils/                  # ユーティリティ
    ├── time.py             # 時間関連（リトライ判定）
    ├── batching.py         # バッチ処理
    └── filesystem.py       # ファイル管理
```

### 責務分離

- **fetch_chat_data.py**: 処理フロー全体のオーケストレーションのみ
- **bq/**: BigQuery 操作を完全にカプセル化
- **youtube_chat/**: yt-dlp とデータ解析をカプセル化
- **models/**: 型安全性を保証
- **utils/**: 再利用可能な汎用機能

## セットアップ

### 前提条件

- Python 3.12 以上
- yt-dlp インストール済み
- Google Cloud 認証設定済み

### インストール

```bash
cd python
pip install -r requirements.txt
```

### 環境変数

以下の環境変数を設定してください：

```bash
export BQ_PROJECT_ID="your-gcp-project-id"
```

GCP 認証は以下のいずれかの方法で設定：
- サービスアカウントキー: `GOOGLE_APPLICATION_CREDENTIALS`
- gcloud CLI: `gcloud auth application-default login`

## 実行方法

### ローカル実行

```bash
cd python
python fetch_chat_data.py
```

### GitHub Actions

`.github/workflows/schedule_fetch_chat.yml` で定時実行されます。
- スケジュール: UTC 20:00（日本時間 05:00）
- 手動実行: Actions タブから "workflow_dispatch" で実行可能

## BigQuery テーブル構造

### videos テーブル

動画の処理進捗を管理：

- `video_id`: 動画ID（主キー相当）
- `status`: 処理ステータス（PENDING, WAITING, SUCCEEDED, FAILED, SKIPPED）
- `first_seen_at`: 初回確認時刻（リトライ判定の基準）
- `next_retry_at`: 次回リトライ予定時刻
- `attempt_count`: 試行回数
- `yt_dlp_version`: 使用した yt-dlp のバージョン
- その他エラー情報等

### chat_messages テーブル

チャットメッセージを保存：

- 主キー: `(video_id, event_id)`
- `event_type`: イベント種別（TEXT, PAID, MEMBERSHIP, SYSTEM, UNKNOWN）
- `timestamp_usec`: タイムスタンプ（マイクロ秒）
- `author_name`, `author_channel_id`: 投稿者情報
- `message_text`: メッセージ本文
- `raw_item_json`: 元データ（JSON型）
- その他メタデータ

## リトライ制御

### 24時間ルール

直近のアーカイブでチャットがまだ利用できない可能性がある期間：

- `first_seen_at` から 24時間以内にチャットが取得できない → `WAITING`（翌日リトライ）
- 24時間経過後も取得できない → `FAILED`

### 7日間ルール

長期間エラーが継続している場合：

- `first_seen_at` から 7日以上経過 → `SKIPPED`（永久スキップ）

## 設定のカスタマイズ

`config.py` で以下の設定を変更できます：

```python
# 1回の実行で処理する動画の最大数
MAX_VIDEOS_PER_RUN = 10

# MERGE 操作時の最大バッチサイズ
MAX_MERGE_BATCH_SIZE = 5000

# リトライ待機時間（秒）
RETRY_DELAY_SECONDS = 24 * 60 * 60  # 24時間

# 最大リトライ期間（秒）
MAX_RETRY_PERIOD_SECONDS = 7 * 24 * 60 * 60  # 7日間
```

## ログ

実行ごとに一意の `run_id` が発行され、以下の情報がログ出力されます：

- 処理対象動画数
- 各動画の処理状況（yt-dlp 実行、パース、MERGE）
- パース統計（メッセージ数、イベントタイプ別カウント）
- 最終結果サマリー

## エラーハンドリング

### 行レベルのエラー

- JSON パースエラー → 行をスキップして処理継続
- 未知の renderer → `UNKNOWN` タイプとして raw を保存

### 動画レベルのエラー

- yt-dlp 実行失敗 → エラーコード記録、リトライ制御
- チャットファイル不在 → 24時間ルール適用
- BigQuery エラー → エラー記録、処理中断

### エラーコード

- `YTDLP_FAILED`: yt-dlp 実行失敗
- `NO_CHAT_FILE`: チャットファイルが存在しない／0件
- `PARSE_FAILED`: パース失敗（現在未使用、将来の拡張用）
- `BQ_MERGE_FAILED`: BigQuery MERGE 失敗（現在未使用、将来の拡張用）
- `UNKNOWN`: 予期しないエラー

## 開発ガイド

### 新しいイベントタイプの追加

1. `models/types.py` の `EventType` に追加
2. `youtube_chat/normalizer.py` の `detect_event_type()` に判定ロジック追加
3. 必要に応じて `extract_common_fields()` を拡張

### SQL クエリの変更

すべての SQL クエリは `bq/queries.py` に集約されています。
クエリ変更時はこのファイルのみを編集してください。

### ログレベルの変更

```bash
export LOG_LEVEL=DEBUG
```

## トラブルシューティング

### yt-dlp がインストールされていない

```bash
# GitHub Actions の場合: AnimMouse/setup-yt-dlp@v3 を使用
# ローカルの場合:
pip install yt-dlp
# または
brew install yt-dlp  # macOS
```

### BigQuery 認証エラー

```bash
# サービスアカウントキーを使用
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json

# または gcloud CLI で認証
gcloud auth application-default login
```

### メモリ不足

`config.py` で `MAX_MERGE_BATCH_SIZE` を小さくしてください。

## ライセンス

このプロジェクトのライセンスに従います。
