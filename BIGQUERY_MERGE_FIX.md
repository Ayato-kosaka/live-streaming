# Fix: BigQuery MERGE QueryParameter Issue

## 問題

`merge_chat_messages()` で `ArrayQueryParameter("messages", "STRUCT", batch_dicts)` を使用していたが、
Python の dict 配列を直接渡すと BigQuery Python Client が `to_api_repr()` を呼ぶ際に
`AttributeError: 'dict' object has no attribute 'to_api_repr'` エラーで失敗する。

## 原因

- `query_parameters` に dict を直接渡すのはNG
- STRUCT 配列の型定義が不正確で、ライブラリ側の変換経路に乗らない

## 解決策

### ステージングテーブル経由の MERGE に変更

QueryParameter の型定義問題を回避するため、以下のフローに変更：

1. **一時ステージングテーブル作成**
   - `staging_chat_messages_{uuid}` という名前で作成
   - `chat_messages` と同じスキーマ
   - TTL 1時間（自動削除）

2. **NDJSON ファイルとしてロード**
   - メッセージを NDJSON 形式で一時ファイルに書き出し
   - `load_table_from_file()` でステージングテーブルへロード
   - JSON型フィールド（`message_runs_json`, `raw_item_json`）は文字列化

3. **ステージングテーブルから MERGE**
   - テーブル間の MERGE クエリを実行
   - QueryParameter を使わないため型変換エラーなし

4. **クリーンアップ**
   - ステージングテーブルを削除
   - 一時ファイルを削除

### メリット

✅ **QueryParameter の型変換エラーを完全回避**
✅ **大量メッセージの取り扱いが堅牢**（リクエストサイズ制限なし）
✅ **JSON型フィールドの取り扱いが容易**
✅ **将来の列追加に強い**（スキーマ定義が明示的）

## 追加改善

### エラーハンドリング強化

1. **ログ出力追加**
   - MERGE開始時のメッセージ数
   - サンプルメッセージのキー一覧（デバッグ用）
   - ステージングテーブル作成・削除のログ
   - ロード完了時の行数

2. **エラーコード明確化**
   - BigQuery MERGE 失敗時は `ERROR_CODE_BQ_MERGE_FAILED` を設定
   - `last_error_detail` に BigQuery の job error 詳細を記録
   - エラー時も適切にログ出力

3. **例外処理**
   - `fetch_chat_data.py` で `merge_chat_messages()` を try-catch
   - MERGE失敗時は適切にエラー処理し、動画を FAILED に遷移

## 変更ファイル

- `python/bq/repository.py`: `merge_chat_messages()` を完全書き換え
- `python/fetch_chat_data.py`: MERGE呼び出し部分に try-catch 追加

## テスト

✅ Python 構文チェック合格
✅ モジュール構造確認済み
✅ エラーコード定義確認済み

## 参考

レビューコメント: https://github.com/Ayato-kosaka/live-streaming/pull/.../files#r3820041019
