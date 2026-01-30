# Fix: BigQuery MERGE QueryParameter - Complete Type-Safe Implementation

## Core Problem: ArrayQueryParameter + STRUCT Can Only Handle Primitives

**BigQuery Python Client Limitation:**
- `ArrayQueryParameter` with `STRUCT` type can only accept primitive types: `STRING`, `INT64`, `FLOAT64`, `BOOL`
- Complex types (`JSON`, `TIMESTAMP`, `DATE`, `DATETIME`) cannot be passed directly
- Must convert to primitives in Python, then parse in SQL

## Three Sequential Issues Encountered

### Issue 1: `AttributeError: 'dict' object has no attribute 'to_api_repr'`

**Problem:**
```python
batch_dicts = [msg.to_dict() for msg in batch]
bigquery.ArrayQueryParameter("messages", "STRUCT", batch_dicts)  # ❌ Fails
```

**Root Cause:** Passing raw Python dicts to `ArrayQueryParameter` doesn't work.

**Fix:** Use explicit STRUCT type definition and convert to tuples.

---

### Issue 2: `Invalid value for type: STRUCT<... JSON ...> is not a valid value`

**Problem:**
```python
struct_type = "STRUCT<..., message_runs_json JSON, raw_item_json JSON>"
json.dumps(msg.message_runs_json)  # STRING passed to JSON field
```

**Root Cause:** BigQuery QueryParameter cannot accept JSON type directly. Python passes STRING but STRUCT expects JSON.

**Fix:** Declare as STRING in STRUCT, use `SAFE.PARSE_JSON()` in SQL.

---

### Issue 3: `TypeError: Object of type datetime is not JSON serializable`

**Problem:**
```python
struct_type = "STRUCT<..., published_at TIMESTAMP, ingested_at TIMESTAMP>"
batch_tuples.append((msg.published_at, ...))  # datetime object
```

**Root Cause:** When BigQuery client serializes the request, it calls `json.dumps()` internally. Python datetime objects cannot be JSON serialized. While `ScalarQueryParameter` handles this, `ArrayQueryParameter + STRUCT` does not.

**Fix:** Convert datetime to RFC3339 STRING in Python, use `PARSE_TIMESTAMP()` in SQL.

---

## Final Solution: All Primitives Pattern

### Design Principle

> **Pass only primitive types (STRING/INT64) as parameters**
> **Convert to complex types (TIMESTAMP/JSON) in SQL**

This is the **only reliable pattern** for BigQuery + Python + ArrayQueryParameter + STRUCT.

---

## Implementation

### 1. STRUCT Definition - All Primitives

```python
struct_type = (
    "STRUCT<"
    "video_id STRING, "
    "event_id STRING, "
    "event_type STRING, "
    "timestamp_usec INT64, "
    "published_at STRING, "        # ✅ STRING (SQL: PARSE_TIMESTAMP)
    "author_name STRING, "
    "author_channel_id STRING, "
    "message_text STRING, "
    "message_runs_json STRING, "   # ✅ STRING (SQL: SAFE.PARSE_JSON)
    "purchase_amount_text STRING, "
    "ingest_run_id STRING, "
    "ingested_at STRING, "         # ✅ STRING (SQL: PARSE_TIMESTAMP)
    "source_file STRING, "
    "source_line_no INT64, "
    "raw_item_json STRING"         # ✅ STRING (SQL: SAFE.PARSE_JSON)
    ">"
)
```

### 2. Python - Convert to Strings

```python
def to_rfc3339(dt):
    """Convert datetime to RFC3339 string for BigQuery."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        from datetime import timezone
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat().replace("+00:00", "Z")

# TIMESTAMP → STRING
published_at_str = to_rfc3339(msg.published_at)
ingested_at_str = to_rfc3339(msg.ingested_at)

# JSON → STRING
message_runs_json_str = json.dumps(msg.message_runs_json, ensure_ascii=False) if msg.message_runs_json else None
raw_item_json_str = json.dumps(msg.raw_item_json, ensure_ascii=False)

batch_tuples.append((
    msg.video_id,
    msg.event_id,
    msg.event_type.value,
    int(msg.timestamp_usec),
    published_at_str,          # ✅ STRING
    msg.author_name,
    msg.author_channel_id,
    msg.message_text,
    message_runs_json_str,     # ✅ STRING
    msg.purchase_amount_text,
    msg.ingest_run_id,
    ingested_at_str,           # ✅ STRING
    msg.source_file,
    msg.source_line_no,
    raw_item_json_str,         # ✅ STRING
))
```

### 3. SQL - Parse to Correct Types

```sql
MERGE `youtube_chat.chat_messages` T
USING UNNEST(@messages) S
ON T.video_id = S.video_id AND T.event_id = S.event_id
WHEN MATCHED THEN
  UPDATE SET
    published_at = PARSE_TIMESTAMP(S.published_at),      -- STRING → TIMESTAMP
    message_runs_json = SAFE.PARSE_JSON(S.message_runs_json),  -- STRING → JSON
    ingested_at = PARSE_TIMESTAMP(S.ingested_at),        -- STRING → TIMESTAMP
    raw_item_json = SAFE.PARSE_JSON(S.raw_item_json)     -- STRING → JSON
WHEN NOT MATCHED THEN
  INSERT (...)
  VALUES (
    ...
    PARSE_TIMESTAMP(S.published_at),
    ...
    SAFE.PARSE_JSON(S.message_runs_json),
    ...
    PARSE_TIMESTAMP(S.ingested_at),
    ...
    SAFE.PARSE_JSON(S.raw_item_json)
  )
```

---

## Type Mapping Summary

| Field | Python Type | STRUCT Type | SQL Conversion |
|-------|-------------|-------------|----------------|
| `video_id` | `str` | `STRING` | - |
| `event_id` | `str` | `STRING` | - |
| `event_type` | `str` (Enum.value) | `STRING` | - |
| `timestamp_usec` | `int` | `INT64` | - |
| `published_at` | `str` (RFC3339) | `STRING` | `PARSE_TIMESTAMP()` |
| `message_runs_json` | `str` (JSON) | `STRING` | `SAFE.PARSE_JSON()` |
| `ingested_at` | `str` (RFC3339) | `STRING` | `PARSE_TIMESTAMP()` |
| `raw_item_json` | `str` (JSON) | `STRING` | `SAFE.PARSE_JSON()` |

---

## Benefits

✅ **No type conversion errors** - All primitives pass through cleanly
✅ **JSON serializable** - No datetime serialization issues
✅ **Safe error handling** - `SAFE.PARSE_JSON` returns NULL on malformed JSON
✅ **Timezone explicit** - RFC3339 with Z suffix ensures UTC interpretation
✅ **Maintainable** - Clear separation: Python = primitives, SQL = type conversion
✅ **Debuggable** - String representations are human-readable

---

## Anti-Patterns to Avoid

❌ **Don't use `to_dict()`** - Loses type information, converts datetime to strings inconsistently
❌ **Don't pass datetime to STRUCT** - Will fail with JSON serialization error
❌ **Don't pass JSON type in STRUCT** - QueryParameter doesn't support JSON type
❌ **Don't mix types** - If one field is STRING, make all complex types STRING

---

## Files Changed

- `python/bq/repository.py`:
  - STRUCT definition: All TIMESTAMP → STRING, all JSON → STRING
  - Added `to_rfc3339()` helper function
  - Convert datetime to RFC3339 strings
  - Direct field access (no `to_dict()`)

- `python/bq/queries.py`:
  - Added `PARSE_TIMESTAMP(S.published_at)`
  - Added `PARSE_TIMESTAMP(S.ingested_at)`
  - Kept `SAFE.PARSE_JSON()` for JSON fields

---

## Key Insight

The fundamental issue is that **`ArrayQueryParameter` with `STRUCT` does not have the same type coercion as `ScalarQueryParameter`**. While scalar parameters can handle datetime objects directly, STRUCT parameters undergo JSON serialization which fails on complex Python types.

**Solution:** Treat `ArrayQueryParameter + STRUCT` as a "primitive-only" interface, and handle all type conversions explicitly in SQL.
