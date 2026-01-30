# BigQuery MERGE Implementation - Final Summary

## Overview

This document summarizes the complete implementation of a robust, production-ready BigQuery MERGE system for YouTube archive chat data, including all iterative fixes and final improvements.

## Problem Evolution & Solutions

### Issue 1: `to_api_repr()` Error
**Problem**: Raw Python dicts passed to ArrayQueryParameter
**Solution**: Explicit STRUCT type definition with tuple values
**Commit**: 9e08579

### Issue 2: JSON Type Incompatibility
**Problem**: JSON-typed STRUCT fields incompatible with json.dumps() strings
**Solution**: Use STRING in STRUCT, convert with SAFE.PARSE_JSON in SQL
**Commit**: c59d611

### Issue 3: TIMESTAMP Serialization Error
**Problem**: datetime objects not JSON-serializable in STRUCT parameters
**Solution**: Convert datetime → RFC3339 strings, parse in SQL
**Commit**: d583a98

### Issue 4: Robustness & Debugging (Final Review)
**Problems**:
- Error-prone PARSE_TIMESTAMP usage
- No shared utility for datetime conversion
- No pre-flight validation (hard to debug failures)
- Insufficient logging

**Solutions**: Commit 3a34337
1. Changed PARSE_TIMESTAMP → SAFE_CAST (more robust, auto-interprets RFC3339)
2. Created shared utils/timestamp.py with to_rfc3339() function
3. Implemented _validate_batch_tuples() for pre-flight validation
4. Enhanced logging with batch-level progress tracking

## Final Architecture

### Design Pattern: Primitive-Only with SQL Conversion

```python
# Python: Only primitives (STRING/INT64)
struct_type = "STRUCT<video_id STRING, published_at STRING, message_runs_json STRING, ...>"

# Values: All converted to primitives
published_at_str = to_rfc3339(msg.published_at)  # datetime → "2024-01-29T10:00:00Z"
message_runs_json_str = json.dumps(msg.message_runs_json)  # dict → "{...}"

batch_tuples = [(msg.video_id, published_at_str, message_runs_json_str, ...)]
```

```sql
-- SQL: Convert back to complex types
UPDATE SET
  published_at = SAFE_CAST(S.published_at AS TIMESTAMP),
  message_runs_json = SAFE.PARSE_JSON(S.message_runs_json)
```

### Type Mapping

| Field | Python Type | Parameter Type | SQL Conversion | Final BigQuery Type |
|-------|-------------|----------------|----------------|---------------------|
| video_id | str | STRING | - | STRING |
| event_id | str | STRING | - | STRING |
| published_at | str (RFC3339) | STRING | SAFE_CAST | TIMESTAMP |
| ingested_at | str (RFC3339) | STRING | SAFE_CAST | TIMESTAMP |
| message_runs_json | str (JSON) | STRING | SAFE.PARSE_JSON | JSON |
| raw_item_json | str (JSON) | STRING | SAFE.PARSE_JSON | JSON |
| timestamp_usec | int | INT64 | - | INT64 |

## Safety Layers

### Layer 1: Type Conversion (utils/timestamp.py)
- `to_rfc3339()`: Ensures consistent datetime → RFC3339 conversion
- Handles naive datetime → adds UTC timezone
- Standardized format: "2024-01-29T10:00:00Z"

### Layer 2: Pre-Flight Validation (bq/repository.py)
- `_validate_batch_tuples()`: Validates before BigQuery submission
- Rejects complex types (datetime, dict, list)
- Identifies exact problem: record index, field, video_id, event_id
- Detailed error logs with troubleshooting hints

### Layer 3: SQL Safety (bq/queries.py)
- `SAFE_CAST`: Malformed timestamps → NULL (doesn't crash)
- `SAFE.PARSE_JSON`: Malformed JSON → NULL (doesn't crash)
- Query continues even with some malformed data

## Error Handling Example

**Invalid Value Detected**:
```
❌ BigQuery MERGE バリデーションエラー
  レコード番号: 42
  video_id: abc123
  event_id: xyz789
  source_line_no: 150
  フィールド: published_at (位置: 4)
  不正な値: datetime.datetime(2024, 1, 29, 10, 0)
  型: datetime
  期待される型: None, str, または int

原因:
  - datetime オブジェクトが to_rfc3339() で変換されていない可能性
  - STRUCT 定義の順序と値の順序が不一致の可能性
```

**Result**: Error caught BEFORE BigQuery call, exact problem identified, easy to fix

## Key Design Decisions

### 1. Primitive-Only Pattern
**Why**: ArrayQueryParameter + STRUCT cannot handle complex types (datetime, JSON)
**How**: Convert all complex types to STRING in Python, parse back in SQL
**Benefit**: No JSON serialization errors, no type conversion errors

### 2. SAFE_CAST Over PARSE_TIMESTAMP
**Why**: PARSE_TIMESTAMP requires format string, error-prone
**How**: SAFE_CAST auto-interprets RFC3339, more flexible
**Benefit**: Resilient to minor format variations, safer

### 3. Pre-Flight Validation
**Why**: "Invalid value for type: STRUCT" errors were hard to debug
**How**: Validate all values before BigQuery call, log detailed error
**Benefit**: Fails fast, clear error messages, easy debugging

### 4. Shared Utilities
**Why**: Datetime conversion scattered, inconsistent
**How**: Centralized to_rfc3339() in utils/timestamp.py
**Benefit**: Single source of truth, reusable, well-documented

## Implementation Files

```
python/
  bq/
    repository.py     - MERGE logic, validation, batch processing
    queries.py        - SQL with SAFE_CAST and SAFE.PARSE_JSON
    client.py         - BigQuery client initialization
  utils/
    timestamp.py      - Shared to_rfc3339() function (NEW)
    batching.py       - Batch splitting logic
  models/
    types.py          - ChatMessage, Video dataclasses
```

## Production Readiness

### ✅ Type Safety
- Explicit primitive-only pattern enforced
- Pre-flight validation catches type errors
- Comprehensive type hints and documentation

### ✅ Error Handling
- Three-layer safety (conversion, validation, SQL SAFE functions)
- Detailed error messages with troubleshooting hints
- Graceful degradation (malformed data → NULL, not crash)

### ✅ Observability
- Batch-level progress logging
- Validation success/failure logging
- Detailed error context (video_id, event_id, field, value)

### ✅ Maintainability
- Clear separation of concerns
- Shared utilities (timestamp.py)
- Comprehensive documentation in code
- Design patterns explicitly documented

### ✅ Idempotency
- MERGE on (video_id, event_id) key
- Re-running same data doesn't create duplicates
- Safe for retries and failures

## Testing Checklist

- [x] Python syntax validation
- [x] Import resolution
- [x] Type conversion (datetime → RFC3339)
- [x] Validation logic (reject complex types)
- [x] Logging integration
- [x] SQL syntax (SAFE_CAST, SAFE.PARSE_JSON)
- [ ] End-to-end test with actual BigQuery (requires credentials)
- [ ] Large batch test (5,000+ messages)
- [ ] Malformed data test (invalid timestamps, broken JSON)

## Future Improvements (Optional)

1. **Metrics**: Add counters for validation failures, MERGE durations
2. **Retry Logic**: Automatic retry on transient BigQuery errors
3. **Batch Optimization**: Dynamic batch sizing based on message length
4. **Performance**: Parallel batch processing (with concurrency limits)
5. **Testing**: Mock BigQuery client for unit tests

## Conclusion

The implementation establishes a **robust, production-ready pattern** for BigQuery ArrayQueryParameter + STRUCT operations:

1. **Enforces primitive-only pattern** (prevents type errors at design level)
2. **Validates before submission** (catches errors early with clear messages)
3. **Uses SQL safety functions** (graceful handling of malformed data)
4. **Provides comprehensive logging** (enables rapid debugging)

This pattern is **reusable for other BigQuery MERGE operations** and serves as a **reference implementation** for handling complex types with BigQuery Python Client.
