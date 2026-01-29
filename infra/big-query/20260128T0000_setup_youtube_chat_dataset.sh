#!/bin/bash
#
# BigQuery youtube_chat データセット初期セットアップスクリプト
#
# 【目的】
# YouTube チャット取得基盤の BigQuery 側環境を整備する。
# ・BigQuery API の有効化
# ・youtube_chat データセットの作成
#
# 【前提条件】
# - gcloud CLI がインストールされていること
#   https://cloud.google.com/sdk/docs/install
# - bq コマンド（BigQuery CLI）が利用可能であること（gcloud に含まれる）
# - gcloud auth login で認証済みであること
#   または GCE/Cloud Run などで既に認証されていること
# - 環境変数 BQ_PROJECT_ID に対象 GCP プロジェクト ID がセットされていること
#
# 【使用方法】
# export BQ_PROJECT_ID="your-gcp-project-id"
# bash infra/big-query/20260128T0000_setup_youtube_chat_dataset.sh
#
# 【特徴】
# ・冪等性：何度実行しても安全（既存リソースは保持される）
# ・失敗時は非ゼロ終了コードを返す
#

set -e  # エラー時に即座に終了

# ========================================
# 1. 環境変数チェック
# ========================================
if [ -z "$BQ_PROJECT_ID" ]; then
  echo "エラー: 環境変数 BQ_PROJECT_ID が設定されていません。"
  echo "使用方法: export BQ_PROJECT_ID='your-gcp-project-id'"
  exit 1
fi

echo "=== BigQuery セットアップ開始 ==="
echo "プロジェクト ID: $BQ_PROJECT_ID"
echo ""

# ========================================
# 2. BigQuery API 有効化（冪等）
# ========================================
echo "--- BigQuery API を有効化中... ---"
gcloud services enable bigquery.googleapis.com --project "$BQ_PROJECT_ID"

if [ $? -eq 0 ]; then
  echo "✓ BigQuery API が有効化されました（または既に有効です）"
else
  echo "✗ BigQuery API の有効化に失敗しました"
  exit 1
fi
echo ""

# ========================================
# 3. データセット youtube_chat の作成（冪等）
# ========================================
DATASET_NAME="youtube_chat"

echo "--- データセット '$DATASET_NAME' の存在確認中... ---"

# bq show でデータセットの存在を確認
if bq show --project_id="$BQ_PROJECT_ID" "$DATASET_NAME" > /dev/null 2>&1; then
  echo "✓ データセット '$DATASET_NAME' は既に存在します（スキップ）"
else
  echo "データセット '$DATASET_NAME' が存在しないため作成します..."
  
  # データセット作成
  # デフォルトのロケーションは asia-northeast1 (東京) を推奨
  # 必要に応じて --location オプションを変更してください
  bq mk --project_id="$BQ_PROJECT_ID" --dataset --location=asia-northeast1 "$DATASET_NAME"
  
  if [ $? -eq 0 ]; then
    echo "✓ データセット '$DATASET_NAME' を作成しました"
  else
    echo "✗ データセット '$DATASET_NAME' の作成に失敗しました"
    exit 1
  fi
fi
echo ""

# ========================================
# 完了
# ========================================
echo "=== BigQuery セットアップ完了 ==="
echo "次のステップ: マイグレーション SQL を実行してテーブルを作成してください"
echo "  bq query --project_id='$BQ_PROJECT_ID' --use_legacy_sql=false < infra/big-query/migration/20260129T0000_create_youtube_chat_tables.sql"
echo ""
