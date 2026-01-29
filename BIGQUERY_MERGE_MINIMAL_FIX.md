# Fix: BigQuery MERGE QueryParameter - JSON Type Handling

## 問題

`merge_chat_messages()` で STRUCT型定義に `JSON` を使用していたが、
Python側で `json.dumps()` した文字列を渡していたため、BigQuery が
`Invalid value for type: STRUCT<... JSON ...> is not a valid value` エラーを返していた。

**根本原因**:
- STRUCT型定義: `message_runs_json JSON`, `raw_item_json JSON`
- Python側の値: `json.dumps()` で生成した STRING
- BigQuery は JSON型のパラメータに文字列を直接受け付けない

## 解決策：STRING + SAFE.PARSE_JSON パターン

BigQuery クエリパラメータでは JSON を直接扱わず、以下の2段階で処理：

1. **パラメータは STRING として渡す**
   - STRUCT定義を `JSON` → `STRING` に変更
   - Python側の `json.dumps()` はそのまま維持

2. **SQL側で JSON に変換**
   - `SAFE.PARSE_JSON()` を使用して STRING → JSON に変換
   - SAFE プレフィックスにより、不正なJSONでもジョブが落ちない

### 実装の変更点

#### ① `repository.py`：STRUCT型定義を JSON → STRING に変更

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
    "message_runs_json STRING, "  # ← JSON から STRING に変更
    "purchase_amount_text STRING, "
    "ingest_run_id STRING, "
    "ingested_at TIMESTAMP, "
    "source_file STRING, "
    "source_line_no INT64, "
    "raw_item_json STRING"  # ← JSON から STRING に変更
    ">"
)
```

#### ② `queries.py`：MERGE時に SAFE.PARSE_JSON を使用

**UPDATE 時**:
```sql
UPDATE SET
  message_runs_json = SAFE.PARSE_JSON(S.message_runs_json),
  ...
  raw_item_json = SAFE.PARSE_JSON(S.raw_item_json)
```

**INSERT 時**:
```sql
VALUES (
  S.video_id,
  S.event_id,
  ...
  SAFE.PARSE_JSON(S.message_runs_json),
  ...
  SAFE.PARSE_JSON(S.raw_item_json)
)
```

## メリット

✅ **BigQuery パラメータエラー解消**: STRUCT validation エラーが発生しなくなる
✅ **JSON構造の保持**: 最終的に JSON型カラムに正しく保存される
✅ **安全性**: `SAFE.PARSE_JSON` により不正JSONでもジョブが落ちない（NULL になる）
✅ **既存設計との互換性**: バッチング・冪等性を維持
✅ **最小変更**: Python側のコードはほぼ変更なし

## 技術的背景

BigQuery の Python クライアントでは、クエリパラメータとして JSON型を直接渡すことができない。
これは設計上の制約であり、以下の方法が推奨パターン：

1. **パラメータは STRING で渡す**
2. **SQL内で PARSE_JSON / SAFE.PARSE_JSON で変換**

この方法により：
- 型の不一致エラーを回避
- SQLレベルで柔軟な処理が可能
- エラーハンドリングが容易（SAFE プレフィックス）

## 注意事項

- **NULL値の扱い**: `json.dumps(None)` は `"null"` という文字列になり、`SAFE.PARSE_JSON("null")` は JSON の `null` に変換される
- **空のJSON**: `message_runs_json` が None の場合、Python側で None を渡し、`SAFE.PARSE_JSON(NULL)` は NULL を返す
- **パフォーマンス**: `PARSE_JSON` は軽量な操作で、大量データでも問題ない

## テスト

✅ Python 構文チェック合格
✅ STRUCT型定義が STRING に変更されていることを確認
✅ SQL クエリに SAFE.PARSE_JSON が適用されていることを確認

## 変更ファイル

- `python/bq/repository.py`: STRUCT型定義を JSON → STRING に変更（コメント追加）
- `python/bq/queries.py`: MERGE クエリに SAFE.PARSE_JSON を追加

## 参考

- レビューコメント: #3820163438
- BigQuery ドキュメント: PARSE_JSON 関数
- BigQuery Python Client: クエリパラメータの制約
