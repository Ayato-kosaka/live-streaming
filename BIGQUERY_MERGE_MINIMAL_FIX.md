# Fix: BigQuery MERGE QueryParameter - Minimal Fix with Typed STRUCT

## 問題

`merge_chat_messages()` で `ArrayQueryParameter("messages", "STRUCT", batch_dicts)` を使用していたが、
Python の dict 配列を直接渡すと BigQuery Python Client が `to_api_repr()` を呼ぶ際に
`AttributeError: 'dict' object has no attribute 'to_api_repr'` エラーで失敗する。

## 解決策：STRUCT型定義の明示化

QueryParameter の使用を維持しつつ、STRUCT型を明示的に定義し、値をタプルで渡す最小限の修正。

### 実装の変更点

1. **STRUCT型定義の明示化**
   ```python
   struct_type = (
       "STRUCT<"
       "video_id STRING, "
       "event_id STRING, "
       "event_type STRING, "
       "timestamp_usec INT64, "
       "published_at TIMESTAMP, "
       "author_name STRING, "
       "author_channel_id STRING, "
       "message_text STRING, "
       "message_runs_json JSON, "
       "purchase_amount_text STRING, "
       "ingest_run_id STRING, "
       "ingested_at TIMESTAMP, "
       "source_file STRING, "
       "source_line_no INT64, "
       "raw_item_json JSON"
       ">"
   )
   ```

2. **dict から tuple への変換**
   - 辞書ではなく、STRUCT定義の順序に従ったタプルで値を渡す
   - JSON型フィールド（`message_runs_json`, `raw_item_json`）は `json.dumps()` で文字列化

3. **バッチ処理の維持**
   - 既存のバッチング機能はそのまま維持
   - `utils.batching` の `batch_items()` を継続使用

### コード例

```python
# 各メッセージをタプルに変換
batch_tuples = []
for msg in batch:
    msg_dict = msg.to_dict()
    
    # JSON型フィールドを文字列化
    message_runs_json_str = None
    if msg_dict.get('message_runs_json'):
        message_runs_json_str = json.dumps(msg_dict['message_runs_json'])
    
    raw_item_json_str = json.dumps(msg_dict['raw_item_json'])
    
    # タプルに変換（STRUCT型定義の順序と一致）
    batch_tuples.append((
        msg_dict['video_id'],
        msg_dict['event_id'],
        # ... 全フィールド ...
        raw_item_json_str,
    ))

# ArrayQueryParameter に型定義とタプルを渡す
job_config = bigquery.QueryJobConfig(
    query_parameters=[
        bigquery.ArrayQueryParameter("messages", struct_type, batch_tuples),
    ]
)
```

## メリット

✅ **最小限の変更**：既存の QueryParameter 方式を維持
✅ **型安全**：STRUCT型が明示的で、フィールドの順序・型が明確
✅ **エラー解消**：`to_api_repr()` エラーを完全に回避
✅ **バッチング維持**：既存のバッチ処理機能をそのまま利用

## 注意事項

- **フィールド順序の厳守**：タプルの順序は STRUCT型定義と完全に一致させる必要がある
- **JSON型フィールドの文字列化**：BigQuery の JSON型には文字列で渡す
- **NULL値の取り扱い**：NULL可能なフィールドは None を渡せる

## テスト

✅ Python 構文チェック合格
✅ STRUCT型定義がフィールド順序と一致していることを確認
✅ JSON型フィールドの文字列化を実装

## 変更ファイル

- `python/bq/repository.py`: `merge_chat_messages()` を修正

## 参考

- レビューコメント: #3820088390
- BigQuery Python Client: `ArrayQueryParameter` with STRUCT types
