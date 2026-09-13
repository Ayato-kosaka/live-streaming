"""退避から Firestore へ戻す。**既定では本番に1バイトも書かない。**

    # どの世代があるか見る
    python python/backup/restore.py --list

    # エミュレータへ戻して、件数と中身が合うか実測する（本番は触らない）
    FIRESTORE_EMULATOR_HOST=localhost:8080 \
      python python/backup/restore.py --collection islandNotes --apply

    # 本当に本番へ戻すとき（**事故のあとだけ**）
    RESTORE_TO_PRODUCTION=yes-i-mean-it \
      python python/backup/restore.py --collection islandNotes --apply

    # 旅の写真を1枚戻して、**バイト列が一致するか**を見る（本番は触らない）
    python python/backup/restore.py --photo
    python python/backup/restore.py --photo --photo-out /tmp/one.jpg

手順は docs/island-backup.md。

## 写真は「戻せるか」まで見ないと退避ではない

置き場に入っているのは base64 ではなく BYTES の列。戻すというのは
**取り出して、記録してある大きさと指紋（sha256）にバイト列が一致すること**を
見ること。取れているだけで戻せないものは退避ではない
（`backup.yml` の `drill` が毎晩1枚やる）。

## 二重の縛り

1. **既定は下見。** `--apply` を渡すまで1件も書かない。何件書くことになるか、
   いま入っているものと何件違うかを出して終わる
2. **本番へ書くには合言葉が要る。** `FIRESTORE_EMULATOR_HOST` が立っていない
   ときは、`RESTORE_TO_PRODUCTION=yes-i-mean-it` を環境変数で渡さないと動かない。
   `collection_drop.py` が「引数だけで本番の生きたデータに当たる道具を作らない」と
   書いているのと同じ理由

## 戻したあと必ず突き合わせる

書いたら読み直して、**1件ずつ指紋（sha256）を比べる。** 件数だけ合っていて
中身が違う、を通さない。出すのは合った数と合わなかった数だけで、値は出さない。
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backup import codec, photos, sink  # noqa: E402
from logging_util import setup_logger  # noqa: E402

log = setup_logger("restore")

PROD_OK = "yes-i-mean-it"
# 1回のバッチで書く数。Firestore の上限は 500
BATCH = 400


def target():
    """戻し先。**エミュレータでなければ合言葉を求める。**"""
    from google.cloud import firestore

    emu = os.getenv("FIRESTORE_EMULATOR_HOST")
    if emu:
        # エミュレータは資格情報を見ない。プロジェクトIDは何でもよいが、
        # **本番と同じ名前にしない**（取り違えを目で防ぐ）
        log.info("戻し先: エミュレータ %s（本番ではありません）", emu)
        return firestore.Client(project=os.getenv("RESTORE_PROJECT", "demo-restore")), False
    if os.getenv("RESTORE_TO_PRODUCTION") != PROD_OK:
        log.error(
            "戻し先が本番になります。エミュレータを立てるか、"
            "どうしても本番へ戻すなら RESTORE_TO_PRODUCTION=%s を渡してください",
            PROD_OK,
        )
        raise SystemExit(2)
    log.warning("戻し先: **本番の Firestore**")
    return firestore.Client(project=sink.PROJECT), True


def snapshots(c, collection: str | None):
    where = "WHERE collection = @c" if collection else ""
    from google.cloud import bigquery

    q = f"""
      SELECT taken_at, collection, COUNT(*) AS n
      FROM `{sink.FS_TABLE}` {where}
      GROUP BY taken_at, collection
      ORDER BY taken_at DESC, collection
      LIMIT 200
    """
    cfg = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("c", "STRING", collection)]
        if collection
        else []
    )
    return list(c.query(q, job_config=cfg, location=sink.LOCATION).result())


def read_snapshot(c, collection: str, at: str | None):
    """戻す元。`at` を省くと**そのコレクションのいちばん新しい世代。**"""
    from google.cloud import bigquery

    pick = "@at" if at else f"(SELECT MAX(taken_at) FROM `{sink.FS_TABLE}` WHERE collection = @c)"
    q = f"""
      SELECT doc_id, doc_json, digest, taken_at
      FROM `{sink.FS_TABLE}`
      WHERE collection = @c AND taken_at = {pick}
      ORDER BY doc_id
    """
    params = [bigquery.ScalarQueryParameter("c", "STRING", collection)]
    if at:
        params.append(bigquery.ScalarQueryParameter("at", "TIMESTAMP", at))
    rows = list(
        c.query(q, job_config=bigquery.QueryJobConfig(query_parameters=params),
                location=sink.LOCATION).result()
    )
    return rows


def restore_photo(read_row, path: str | None, out_path: str | None) -> int:
    """写真を1枚戻して突き合わせる。**出すのは 〇✕ と数だけ。**

    置き場の名前（`path`）は日付と書類IDでできていて、貼った人を指しうるので
    **ログに出さない。** 同じ理由で、戻した実体の中身も出さない。
    """
    r = photos.restore_one(read_row, path, out_path)
    if not r["found"]:
        # まだ1枚も入っていない＝取るほうがまだ回っていない。
        # **ここで赤くしない。** 毎晩の drill が、写真が0枚の晩に落ちてしまう
        log.warning("置き場に写真がまだ1枚も入っていません")
        print("::warning::置き場に写真がまだ入っていないので、戻す試しができませんでした")
        return 0
    log.info("1枚戻しました: %d バイト / 大きさ %s / 指紋 %s",
             r["bytes"], "一致" if r["size_ok"] else "**不一致**",
             "一致" if r["sha_ok"] else "**不一致**")
    if not r["ok"]:
        log.error("**戻した実体が、記録してあるバイト列と一致しません。**")
        return 1
    log.info("**バイト列が一致しました。**")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--collection", help="戻すコレクション名")
    ap.add_argument("--at", help="いつの世代か（省くといちばん新しいもの）")
    ap.add_argument("--apply", action="store_true", help="実際に書く（既定は下見）")
    ap.add_argument("--list", action="store_true", help="どの世代があるか出す")
    ap.add_argument("--photo", action="store_true",
                    help="旅の写真を1枚戻して、バイト列が一致するか見る")
    ap.add_argument("--photo-path", help="どの1枚か（省くと置き場のいちばん新しいもの）")
    ap.add_argument("--photo-out", help="戻した実体の書き出し先")
    a = ap.parse_args()

    bq = sink.client()

    if a.photo:
        # **Firestore を1ミリも触らない。** 置き場から読んで、置き場に
        # 記録してある大きさと指紋に合うかを見るだけ
        return restore_photo(photos.read_row_bq(bq), a.photo_path, a.photo_out)

    if a.list:
        for r in snapshots(bq, a.collection):
            log.info("  %s  %-26s %5d 件", r["taken_at"].isoformat(), r["collection"], r["n"])
        return 0

    if not a.collection:
        log.error("--collection か --list が要ります")
        return 2

    rows = read_snapshot(bq, a.collection, a.at)
    if not rows:
        log.error("%s の世代が退避に見つかりません", a.collection)
        return 1
    log.info("退避にある %s: %d 件（%s の世代）", a.collection, len(rows), rows[0]["taken_at"].isoformat())

    fs, is_prod = target()
    col = fs.collection(a.collection)

    # いま戻し先に何が入っているか。**上書きになるものを先に数える**
    now = {d.id: codec.digest(d.id, d.to_dict()) for d in col.stream()}
    want = {r["doc_id"]: r["digest"] for r in rows}
    same = sum(1 for k, v in want.items() if now.get(k) == v)
    diff = sum(1 for k, v in want.items() if k in now and now[k] != v)
    add = sum(1 for k in want if k not in now)
    extra = sum(1 for k in now if k not in want)
    log.info(
        "  戻し先はいま %d 件 — そのまま %d / 中身が違う %d / 無いので足す %d"
        " / 退避に無いのに戻し先にある %d",
        len(now), same, diff, add, extra,
    )

    if not a.apply:
        log.info('--- 下見です。書くには --apply を付けてください ---')
        return 0

    if is_prod:
        log.warning("**本番に書きます。** %d 件", len(rows))

    import json

    batch = fs.batch()
    n = 0
    for i, r in enumerate(rows, 1):
        data = codec.dec(json.loads(r["doc_json"]), fs)
        batch.set(col.document(r["doc_id"]), data)
        n += 1
        if i % BATCH == 0:
            batch.commit()
            batch = fs.batch()
            log.info("  %d / %d", i, len(rows))
    if n % BATCH:
        batch.commit()
    log.info("%d 件 書きました", n)

    # ---- 突き合わせ。**読み直して1件ずつ指紋を比べる**
    back = {d.id: codec.digest(d.id, d.to_dict()) for d in col.stream()}
    hit = sum(1 for k, v in want.items() if back.get(k) == v)
    miss = [k for k, v in want.items() if back.get(k) != v]
    log.info("突き合わせ: 退避 %d 件 / 戻し先に %d 件 / 中身が一致 %d 件",
             len(want), len(back), hit)
    if miss:
        # 書類IDは人を指していることがあるので、**数だけ出す**
        log.error("一致しなかったのが %d 件あります", len(miss))
        return 1
    log.info("**件数も中身も一致しました。**")
    return 0


if __name__ == "__main__":
    sys.exit(main())
