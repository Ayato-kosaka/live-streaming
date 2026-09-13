"""失ったら取り戻せないものを、1回ぶん退避する。

    BQ_PROJECT_ID=live-streaming-d3cac python python/backup/run.py
    …… --dry-run  で、何をどれだけ取るかだけ出す（1バイトも書かない）

何を取って何を取らないかは `python/backup/plan.py`。置き場は `python/backup/sink.py`。
戻しかたは `docs/island-backup.md`。

## 落ちたら分かるようにしてある

- **落ちたら終了コードが 0 でない。** `continue-on-error` を使わない
- どこで落ちても `island_backup.runs` に `ok=false` と理由が1行残る。
  Actions を開けない旅の途中でも、`backup_status` で読める
- **写真だけは、1枚落ちても止まらない。** 544枚のうち何枚かが 403 や 404 で
  返ることはありえる（合言葉が作り直された・書類に `url` が無い）。
  **落ちた枚数を数えて、残りは取り切る。** 毎晩赤くしても直らないものを
  赤くすると、赤が意味を失う。代わりに `::warning::` を出して、runs にも残す
- **写真は1回の実行に上限がある**（既定 128MB / 400枚）。上限に当たったら
  そこで切り上げて、`::notice::` に残り枚数を出す。**次の回が続きから拾う**
"""

import argparse
import datetime as dt
import decimal
import json
import os
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backup import codec, photos, plan, sink  # noqa: E402
from logging_util import setup_logger  # noqa: E402

log = setup_logger("backup")

# 1本のクエリで読むバイト数の上限。**あやとの決め（1GB を超える SQL を流さない）。**
# 流す前に dryRun で測って、超えたら流さずに落とす
MAX_SCAN_BYTES = 1024 * 1024 * 1024

# サブコレクションが増えていないかの見張り。**全書類は見ない**（書類の数だけ
# 問い合わせが増える）。コレクションごとに頭からこの数だけ見る
SUBCOL_PROBE = 3


# ------------------------------------------------------------------ Firestore


def dump_firestore(dry: bool, taken_at: str, out) -> dict:
    """Firestore を1回ぶん書き出す。**読むだけ。**"""
    from google.cloud import firestore

    fs = firestore.Client(project=sink.PROJECT)
    kept, skipped, unknown, subcols = {}, {}, [], []
    n_docs = n_bytes = 0

    for col in fs.collections():
        take, why, known = plan.classify(col.id)
        if not known:
            unknown.append(col.id)
        if not take:
            skipped[col.id] = why
            log.info("  取らない  %-26s %s", col.id, why)
            continue

        cn = cb = 0
        for i, d in enumerate(col.stream()):
            body = codec.data_json(d.to_dict())
            cn += 1
            cb += len(body.encode())
            if not dry:
                out.write(
                    json.dumps(
                        {
                            "taken_at": taken_at,
                            "collection": col.id,
                            "doc_id": d.id,
                            "doc_json": body,
                            "digest": codec.digest(d.id, d.to_dict()),
                        },
                        ensure_ascii=False,
                    )
                    + "\n"
                )
            # 下にぶら下がった入れ物が増えていないか。**頭の数件だけ見る**
            if i < SUBCOL_PROBE:
                for sub in d.reference.collections():
                    subcols.append(f"{col.id}/*/{sub.id}")
        kept[col.id] = cn
        n_docs += cn
        n_bytes += cb
        log.info("  取る      %-26s %5d 件 %9d バイト", col.id, cn, cb)

    if unknown:
        # 取ってはある。**分類だけ足りない。** 黙って進むと、新しく作った
        # 入れ物が誰にも気づかれないまま退避から漏れる日が来る
        log.warning("分類していない入れ物があります: %s", ", ".join(sorted(unknown)))
        print(f"::warning::分類していない Firestore の入れ物: {', '.join(sorted(unknown))}"
              " — python/backup/plan.py の KEEP か SKIP に理由と一緒に足してください")
    if subcols:
        log.warning("サブコレクションを見つけました: %s", sorted(set(subcols)))
        print(f"::warning::サブコレクションが増えています（いまの退避は取っていません）: "
              f"{', '.join(sorted(set(subcols)))}")

    return {
        "docs": n_docs,
        "bytes": n_bytes,
        "kept": kept,
        "skipped": sorted(skipped),
        "unknown": sorted(unknown),
        "subcollections": sorted(set(subcols)),
    }


# ------------------------------------------------------------------ BigQuery


def _jsonable(field, v):
    """BigQuery から読んだ値を、載せ直せる形にする。

    **型を落とさないのがここの仕事。** `default=str` で丸めると、
    NUMERIC が浮動小数点になったり、JSON の列が文字列になったりする。
    そうなっても載りはするので、**戻すまで気づけない。**
    """
    if v is None:
        return None
    # 繰り返しの列は、中身1つずつを同じ規則で
    if getattr(field, "mode", "") == "REPEATED" and isinstance(v, (list, tuple)):
        return [_one(field, x) for x in v]
    return _one(field, v)


def _one(field, v):
    if v is None:
        return None
    t = field.field_type
    if t in ("RECORD", "STRUCT"):
        return {f.name: _jsonable(f, v.get(f.name)) for f in field.fields}
    if t == "JSON":
        # クライアントの版によって、字で返るときと組み立てて返るときがある。
        # **字のまま載せると JSON 型ではなく文字列になってしまう**ので、
        # 字なら一度ほどく
        return json.loads(v) if isinstance(v, str) else v
    if t in ("NUMERIC", "BIGNUMERIC"):
        # **Decimal は JSON にできない。** 浮動小数点に落とすと桁が狂うので、
        # 字のまま渡す（BigQuery は NUMERIC を字から読める）。
        # 額の列（doneru_donations.amount）がこれ。**1円ずれてはいけない**
        return str(v)
    if isinstance(v, (dt.datetime, dt.date, dt.time)):
        return v.isoformat()
    if isinstance(v, (bytes, bytearray)):
        import base64

        return base64.b64encode(bytes(v)).decode()
    if isinstance(v, decimal.Decimal):
        return str(v)
    return v


def _scan_bytes(c, sql, params, location) -> int:
    from google.cloud import bigquery

    cfg = bigquery.QueryJobConfig(dry_run=True, use_query_cache=False, query_parameters=params)
    return int(c.query(sql, job_config=cfg, location=location).total_bytes_processed or 0)


def dump_bigquery(c, dry: bool, tmpdir: str) -> dict:
    """本番の表を、置き場の表へ積み直す。**本番は読むだけ。**"""
    from google.cloud import bigquery

    out = {}
    for name, (how, _why) in plan.BQ.items():
        src_ref = f"{sink.PROJECT}.{sink.SRC_DATASET}.{name}"
        src = c.get_table(src_ref)
        # **下見のときは表も作らない。** 「1バイトも書かない」を守る
        dst = None
        if not dry:
            dst = sink.ensure_table(
                c,
                name,
                src.schema,
                partition_field=(src.time_partitioning.field if src.time_partitioning else None),
                cluster=src.clustering_fields,
            )

        params = []
        if how == "inc":
            since = sink.last_ingested_at(c, name)
            if since is None:
                sql = f"SELECT * FROM `{src_ref}`"
                mode = "はじめの1回（まるごと）"
            else:
                sql = f"SELECT * FROM `{src_ref}` WHERE ingested_at > @since"
                params = [bigquery.ScalarQueryParameter("since", "TIMESTAMP", since)]
                mode = f"増えたぶん（{since.isoformat()} より後）"
        else:
            sql = f"SELECT * FROM `{src_ref}`"
            mode = "まるごと"

        scan = _scan_bytes(c, sql, params, src.location)
        if scan > MAX_SCAN_BYTES:
            raise RuntimeError(
                f"{name}: 1回で {scan} バイト読むことになります（上限 {MAX_SCAN_BYTES}）。流しません"
            )
        log.info("  %-20s %s / 読むのは %d バイト", name, mode, scan)
        if dry:
            out[name] = {"mode": mode, "scan_bytes": scan, "rows": None}
            continue

        # 書き出してから載せる。**行を全部メモリに持たない**
        path = os.path.join(tmpdir, f"{name}.ndjson")
        rows = 0
        with open(path, "w", encoding="utf-8") as f:
            it = c.query(
                sql,
                job_config=bigquery.QueryJobConfig(query_parameters=params),
                location=src.location,
            ).result()
            for r in it:
                f.write(
                    json.dumps(
                        {fld.name: _jsonable(fld, r.get(fld.name)) for fld in src.schema},
                        ensure_ascii=False,
                    )
                    + "\n"
                )
                rows += 1
        size = os.path.getsize(path)
        loaded = 0
        if rows:
            loaded = sink.load_ndjson(c, dst, path, src.schema, truncate=(how == "full"))
            if loaded != rows:
                raise RuntimeError(f"{name}: 書き出し {rows} 行に対して載ったのが {loaded} 行")
        os.remove(path)
        log.info("    → %d 行 / %d バイト 載せました", loaded, size)
        out[name] = {"mode": mode, "scan_bytes": scan, "rows": loaded, "bytes": size}
    return out


def _fingerprint(c, sql, location) -> tuple[int, int]:
    r = list(c.query(sql, location=location).result())[0]
    return int(r["n"]), int(r["fp"] or 0)


def verify_bigquery(c) -> dict:
    """本番と置き場を突き合わせる。**件数と、中身の指紋。**

    「取れているつもり」を潰すのがここ。指紋は行ごとの JSON を
    `FARM_FINGERPRINT` に通して XOR したもので、**値そのものは外に出ない。**
    """
    out = {}
    for name, (how, _why) in plan.BQ.items():
        src_ref = f"{sink.PROJECT}.{sink.SRC_DATASET}.{name}"
        bk_ref = f"{sink.PROJECT}.{sink.DATASET}.{name}"
        src_loc = c.get_table(src_ref).location
        agg = "SELECT COUNT(*) AS n, IFNULL(BIT_XOR(FARM_FINGERPRINT(TO_JSON_STRING(t))), 0) AS fp"
        sn, sf = _fingerprint(c, f"{agg} FROM `{src_ref}` t", src_loc)
        if how == "inc":
            # 積むだけなので、同じ行が取り込み直されると2つ入る。
            # **戻すときと同じたたみ方**で見る（video_id + event_id の最新）
            bk_sql = f"""
              {agg} FROM (
                SELECT * EXCEPT(_rn) FROM (
                  SELECT b.*, ROW_NUMBER() OVER (
                    PARTITION BY video_id, event_id ORDER BY ingested_at DESC
                  ) AS _rn FROM `{bk_ref}` b
                ) WHERE _rn = 1
              ) t
            """
        else:
            bk_sql = f"{agg} FROM `{bk_ref}` t"
        bn, bf = _fingerprint(c, bk_sql, sink.LOCATION)
        ok = (sn == bn) and (sf == bf)
        out[name] = {"src_rows": sn, "backup_rows": bn, "same": ok}
        log.info("  %-20s 本番 %7d 行 / 退避 %7d 行 / 中身 %s", name, sn, bn, "一致" if ok else "**不一致**")
        if not ok:
            raise RuntimeError(f"{name}: 退避と本番が一致しません（本番 {sn} 行 / 退避 {bn} 行）")
    return out


# ------------------------------------------------------------------ 写真

# 旅の写真の実体は `python/backup/photos.py`。**Storage の IAM を1つも通らず、
# Firestore の url 欄に入っている合言葉つき URL から取る**（両方のサービス
# アカウントで `storage.objects.get` が立たないことを本番で実測してある）。
# 1回の実行に上限があり、**残りは次の回が続きから拾う。**


# ------------------------------------------------------------------ 本体


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="何をどれだけ取るかだけ出す")
    a = ap.parse_args()

    t0 = time.time()
    taken_at = dt.datetime.now(dt.timezone.utc).isoformat()
    detail: dict = {"taken_at": taken_at, "dry_run": a.dry_run}
    c = sink.client()
    err = ""
    ok = True

    try:
        if not a.dry_run:
            sink.ensure_dataset(c)
            sink.ensure_table(c, "firestore_docs", sink.FS_SCHEMA,
                              partition_field="taken_at", cluster=["collection"])

        log.info("--- Firestore ---")
        with tempfile.TemporaryDirectory() as tmp:
            fs_path = os.path.join(tmp, "firestore.ndjson")
            with open(fs_path, "w", encoding="utf-8") as f:
                detail["firestore"] = dump_firestore(a.dry_run, taken_at, f)
            if not a.dry_run and detail["firestore"]["docs"]:
                loaded = sink.load_ndjson(c, sink.FS_TABLE, fs_path, sink.FS_SCHEMA, truncate=False)
                if loaded != detail["firestore"]["docs"]:
                    raise RuntimeError(
                        f"Firestore: 書き出し {detail['firestore']['docs']} 件に対して"
                        f" 載ったのが {loaded} 件"
                    )
                detail["firestore"]["loaded"] = loaded
                detail["firestore"]["file_bytes"] = os.path.getsize(fs_path)

            log.info("--- BigQuery ---")
            detail["bigquery"] = dump_bigquery(c, a.dry_run, tmp)

        # 旅の写真だけでなく住人の絵も同じ口を通る（置き場の 94% はそちら）
        log.info("--- 置き場の実体（旅の写真・住人の絵） ---")
        detail["photos"] = photos.dump(c, a.dry_run)

        if not a.dry_run:
            log.info("--- 突き合わせ ---")
            detail["verify"] = verify_bigquery(c)
            detail["swept"] = sink.sweep(c)
            log.info("  %d 日より古い世代を %d 件落としました", sink.KEEP_DAYS, detail["swept"])

    except Exception as e:  # noqa: BLE001
        ok = False
        err = f"{type(e).__name__}: {e}"
        log.error("退避が落ちました: %s", err)

    took = time.time() - t0
    if not a.dry_run:
        try:
            sink.record_run(c, ok, took, err, detail)
        except Exception as e:  # noqa: BLE001
            log.error("runs に記録できませんでした: %s", e)
            ok = False
        # **旅のあいだ Actions を開けなくても読める札。**
        # ここが置けなくても退避そのものの成否は変えない（置き場には入っている）。
        # ただし黙らない。札が置けないと、旅の途中の見張りが効かなくなる
        try:
            sink.record_health(ok, took, err, detail)
        except Exception as e:  # noqa: BLE001
            log.error("islandBackupHealth の札を置けませんでした: %s", e)
            print("::warning::islandBackupHealth の札を置けませんでした。"
                  "旅の途中に firestore_read で生死が読めません")

    fs = detail.get("firestore", {})
    bq = detail.get("bigquery", {})
    ph = detail.get("photos", {})
    # **写真は「取れた枚数」だけでは足りない。** 上限で切り上げた回と、
    # 全部取り切った回が同じ字に見えてしまう。残りと落ちた数も併記する
    line = (
        f"Firestore {fs.get('docs', 0)} 件 / {fs.get('bytes', 0)} バイト、"
        f"BigQuery {sum((v or {}).get('rows') or 0 for v in bq.values())} 行、"
        f"写真 +{ph.get('n', 0)} 枚 / {ph.get('bytes', 0)} バイト"
        f"（残り {ph.get('left')} ・落ちた {ph.get('failed', 0)}）、{took:.0f} 秒"
    )
    log.info("%s — %s", "取れました" if ok else "落ちました", line)
    summary = os.getenv("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write(f"### 退避 {'○' if ok else '✕'}\n\n{line}\n\n")
            if err:
                f.write(f"```\n{err}\n```\n")
    if not ok:
        print(f"::error::退避が落ちました: {err}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
