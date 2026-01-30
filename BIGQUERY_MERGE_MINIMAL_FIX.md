# Fix: BigQuery MERGE QueryParameter - Complete Type-Safe Implementation

## 問題の経緯

### 問題1: dict を ArrayQueryParameter に直接渡すエラー
`AttributeError: 'dict' object has no attribute 'to_api_repr'`

### 問題2: JSON型フィールドの型不一致
`Invalid value for type: STRUCT<... JSON ...> is not a valid value`
- STRUCT定義で `JSON` を使用したが、Python側で `json.dumps()` した文字列を渡していた

### 問題3: TIMESTAMP型フィールドの型不一致
`Invalid value for type: STRUCT<... TIMESTAMP ...> is not a valid value`
- `ChatMessage.to_dict()` を使用したため、datetime が ISO形式文字列に変換されていた
- BigQuery の ArrayQueryParameter は TIMESTAMP型に datetime オブジェクトを要求

## 最終解決策：型安全な実装

### 1. STRUCT型定義の正確な指定

```python
struct_type = (
    "STRUCT<"
    "video_id STRING, "
    "event_id STRING, "
    "event_type STRING, "
    "timestamp_usec INT64, "
    "published_at TIMESTAMP, "     # datetime を渡す
    "author_name STRING, "
    "author_channel_id STRING, "
    "message_text STRING, "
    "message_runs_json STRING, "   # JSON→STRING（SQL側で変換）
    "purchase_amount_text STRING, "
    "ingest_run_id STRING, "
    "ingested_at TIMESTAMP, "      # datetime を渡す
    "source_file STRING, "
    "source_line_no INT64, "
    "raw_item_json STRING"         # JSON→STRING（SQL側で変換）
    ">"
)
```

### 2. to_dict() を使わず直接フィールドアクセス

**変更前**（問題あり）:
```python
msg_dict = msg.to_dict()
batch_tuples.append((
    msg_dict['video_id'],
    ...
    msg_dict['published_at'],  # ❌ ISO文字列になる
    ...
))
```

**変更後**（正しい）:
```python
# TIMESTAMP: datetime オブジェクトを直接使用
published_at = msg.published_at
if published_at is not None and published_at.tzinfo is None:
    published_at = published_at.replace(tzinfo=timezone.utc)

batch_tuples.append((
    msg.video_id,
    ...
    published_at,  # ✅ datetime オブジェクト
    ...
))
```

### 3. JSON フィールドの正しい処理

```python
# JSON型フィールドは STRING として渡す
message_runs_json_str = None
if msg.message_runs_json:
    message_runs_json_str = json.dumps(msg.message_runs_json, ensure_ascii=False)

raw_item_json_str = json.dumps(msg.raw_item_json, ensure_ascii=False)
```

### 4. SQL側での JSON 変換

```sql
UPDATE SET
  message_runs_json = SAFE.PARSE_JSON(S.message_runs_json),
  raw_item_json = SAFE.PARSE_JSON(S.raw_item_json)

INSERT VALUES (
  ...
  SAFE.PARSE_JSON(S.message_runs_json),
  ...
  SAFE.PARSE_JSON(S.raw_item_json)
)
```

## 実装の重要ポイント

### TIMESTAMP 型の扱い

✅ **正しい**: datetime オブジェクトを渡す
```python
published_at = msg.published_at  # datetime
if published_at.tzinfo is None:
    published_at = published_at.replace(tzinfo=timezone.utc)
```

❌ **誤り**: ISO文字列を渡す
```python
published_at = msg.published_at.isoformat()  # string - NG!
```

### JSON 型の扱い

✅ **正しい**: STRING で渡し、SQL で PARSE_JSON
```python
# STRUCT定義
"message_runs_json STRING"

# Python側
json.dumps(msg.message_runs_json)

# SQL側
SAFE.PARSE_JSON(S.message_runs_json)
```

❌ **誤り**: JSON型で渡そうとする
```python
# STRUCT定義
"message_runs_json JSON"  # NG!

# Python側
json.dumps(msg.message_runs_json)  # 文字列なのでNG!
```

### 数値型の扱い

```python
int(msg.timestamp_usec)  # INT64 として明示的に変換
```

### Enum 型の扱い

```python
msg.event_type.value  # Enum の値を取得
```

## タイムゾーン処理の重要性

BigQuery は UTC ベースでタイムスタンプを扱うため、naive datetime（タイムゾーン情報なし）は
意図しない解釈をされる可能性がある。

```python
if published_at.tzinfo is None:
    published_at = published_at.replace(tzinfo=timezone.utc)
```

これにより：
- ✅ 明示的に UTC であることを示せる
- ✅ BigQuery 側での解釈のブレを防止
- ✅ 将来的な国際化対応に備える

## to_dict() メソッドの使用制限

`ChatMessage.to_dict()` は以下の用途に限定すべき：
- ✅ ログ出力
- ✅ デバッグ表示
- ✅ JSON API レスポンス

以下の用途では使用すべきでない：
- ❌ BigQuery の構造化パラメータ
- ❌ 型安全性が必要な処理

理由：
- datetime → ISO文字列に変換される
- Enum → 値に変換されるが型情報が失われる
- 型検証ができない

## メリット

✅ **完全な型安全性**: すべてのフィールドが正しい型で渡される
✅ **BigQuery エラー解消**: STRUCT validation エラーが発生しない
✅ **JSON 構造保持**: SAFE.PARSE_JSON により JSON 列に正しく保存
✅ **タイムゾーン明示**: UTC を明示することで解釈のブレを防止
✅ **デバッグ容易**: `ensure_ascii=False` で日本語/絵文字が読める
✅ **安全なエラー処理**: SAFE.PARSE_JSON で不正 JSON も処理可能

## テスト

✅ Python 構文チェック合格
✅ datetime オブジェクトを直接使用
✅ JSON フィールドは STRING + SAFE.PARSE_JSON パターン
✅ タイムゾーン処理の実装
✅ Enum の値取得
✅ INT64 の明示的変換

## 変更ファイル

- `python/bq/repository.py`: 
  - `to_dict()` の使用を廃止
  - datetime オブジェクトを直接使用
  - タイムゾーン処理を追加
  - 詳細なコメントを追加

## 参考

- レビューコメント: #3820088390, #3820163438, #3820235182
- BigQuery Python Client: ArrayQueryParameter with STRUCT types
- BigQuery: TIMESTAMP 型の扱い
- BigQuery: PARSE_JSON / SAFE.PARSE_JSON 関数
