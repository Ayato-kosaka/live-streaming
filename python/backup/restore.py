"""退避から Firestore へ戻す。**既定では本番に1バイトも書かない。**

    # どの世代があるか見る
    python python/backup/restore.py --list

    # エミュレータへ戻して、件数と中身が合うか実測する（本番は触らない）
    FIRESTORE_EMULATOR_HOST=localhost:8080 \
      python python/backup/restore.py --collection islandNotes --apply

    # 本当に本番へ戻すとき（**事故のあとだけ**）
    RESTORE_TO_PRODUCTION=yes-i-mean-it \
      python python/backup/restore.py --collection islandNotes --apply

    # 旅の写真を何枚か戻して、**バイト列が一致するか**を見る（本番は触らない）
    python python/backup/restore.py --photo
    python python/backup/restore.py --photo --photo-n 20
    python python/backup/restore.py --photo --photo-path <置き場の名前> --photo-out /tmp/one.jpg

手順は docs/island-backup.md。

## 写真は「戻せるか」まで見ないと退避ではない

置き場に入っているのは base64 ではなく BYTES の列。戻すというのは
**取り出して、記録してある大きさと指紋（sha256）にバイト列が一致すること**を
見ること。取れているだけで戻せないものは退避ではない
（`backup.yml` の `drill` が毎晩やる）。

見るのは4つ。**大きさ・指紋・空でないこと・絵であること。**
はじめの2つだけでは足りない——`size` も `sha256` も**取ったときの実体から
計算して一緒に書いている**ので、合言葉の切れた URL から返った HTML や
0 バイトの実体は、**行の中で辻褄が合ったまま**入る。突き合わせは一致と出て、
戻した先に絵は無い。

## 何枚のうち何枚戻したかを、必ず出す

1枚だけ戻して〇を出すのは、584 枚のうち 0.2% を見たということでしかない。
しかも `ORDER BY taken_at DESC LIMIT 1` はいつも同じ側を引くので、
**古いところが腐っても永久に当たらない。** 晩ごとに違う組み合わせで
`--photo-n` 枚（既定5枚）引いて、**分母（置き場の枚数）と一緒に**出す
（`docs/island-standards.md` §15）。

**0枚は緑にしない。** 置き場に1枚も無い晩は「戻せた」ではなく
「**何も戻していない**」ので、終了コード 2 で落ちる。取るほうが回って
いないなら、それは退避が止まっているということ。2026-09-17 まで、ここは
`::warning::` を出して 0 で通していた。

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
import base64
import datetime as dt
import hashlib
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


# 毎晩、置き場の写真を何枚引いて戻すか。**1枚では分母にならない。**
# 584 枚のうち同じ1枚を毎晩なぞっても、古いところが腐ったことは永久に出ない。
# 5枚 × 晩ごとに違う組み合わせで、置き場をゆっくり一周する
PHOTO_N = int(os.getenv("PHOTO_DRILL_N") or 5)


def judge_photo(row) -> dict:
    """写真1枚ぶんの合否。**大きさ・指紋・空でないこと・絵であること**の4つ。

    大きさと指紋だけでは足りない。`size` も `sha256` も**取ったときの実体から
    計算して一緒に書いている**ので、取り違えた中身（合言葉の切れた URL から
    返った HTML、0 バイトの実体）は**行の中で辻褄が合ったまま**入る。
    突き合わせは一致と出て、戻した先に絵は無い。**それを退避と呼ばない。**

    返すのは 〇✕ と数だけ。置き場の名前は貼った人を指しうるので**入れない。**
    """
    body = row["body"]
    if isinstance(body, str):
        # クライアントの版によっては base64 の字で返る
        body = base64.b64decode(body)
    body = bytes(body)
    kind = photos.image_kind(body)
    size_ok = len(body) == int(row["size"])
    sha_ok = hashlib.sha256(body).hexdigest() == str(row["sha256"])
    return {
        "bytes": len(body),
        "size_ok": size_ok,
        "sha_ok": sha_ok,
        "empty": len(body) == 0,
        "kind": kind,
        "ok": size_ok and sha_ok and len(body) > 0 and kind is not None,
    }


def drill_photos(bq, n: int, path: str | None = None, out_path: str | None = None) -> int:
    """置き場から n 枚戻して、**何枚のうち何枚が戻せたか**を出す。

    終了コード 0=戻せた / 1=戻せない写真があった / **2=数えるものが無い**
    （`docs/island-standards.md` §15）。

    **0枚を緑にしない。** ここは 2026-09-17 まで、置き場に1枚も無い晩を
    `::warning::` のまま 0 で通していた。「戻せた」ではなく「**何も戻して
    いない**」なので、いちばん見張ってほしい晩に黙る形だった。
    取るほうが回っていないなら、それは退避が止まっているということ。
    """
    if path:
        # 名指しの1枚（人が手で調べるとき）。分母は1
        row = photos.read_row_bq(bq)(path)
        if row is None:
            # **名指ししたものが無いのも「戻せた」ではない。**
            # 置き場の名前は貼った人を指しうるので、名前は出さない
            log.error("名指しされた1枚が置き場に見つかりません")
            print("::error::名指しされた写真が置き場にありません。戻す試しができていません")
            return 2
        rows = [row]
        st = {"n": 1, "paths": 1, "bytes": int(row["size"])}
    else:
        st = photos.stats_bq(bq)
        if st["n"] == 0:
            log.error("置き場に写真が1枚も入っていません")
            print("::error::置き場に写真が0枚です。戻す試しができていません"
                  "（取るほうが回っていないか、置き場が消えています）")
            return 2
        salt = dt.date.today().isoformat()
        rows = photos.read_sample_bq(bq, n, salt)

    log.info("置き場の写真: %d 枚（別々の置き場所 %d / 合わせて %d バイト）",
             st["n"], st["paths"], st["bytes"])
    if not rows:
        # 置き場には在るのに引けない。**「無い」と「見ていない」は別物**
        log.error("置き場には %d 枚あるのに、1枚も引けませんでした", st["n"])
        print("::error::置き場には %d 枚あるのに、戻す試しに1枚も引けませんでした" % st["n"])
        return 2

    ok = sizes = shas = kinds = 0
    empty = 0
    bad: list[str] = []
    for i, row in enumerate(rows, 1):
        r = judge_photo(row)
        sizes += r["size_ok"]
        shas += r["sha_ok"]
        kinds += r["kind"] is not None
        empty += r["empty"]
        ok += r["ok"]
        if out_path and i == 1:
            body = row["body"]
            if isinstance(body, str):
                body = base64.b64decode(body)
            with open(out_path, "wb") as f:
                f.write(bytes(body))
        if not r["ok"]:
            # **何枚目か、だけ。** 置き場の名前も中身も出さない
            why = []
            if not r["size_ok"]:
                why.append("大きさが違う")
            if not r["sha_ok"]:
                why.append("指紋が違う")
            if r["empty"]:
                why.append("**空っぽ**")
            elif r["kind"] is None:
                why.append("**絵ではない**")
            bad.append(f"{i} 枚目（{r['bytes']} バイト / " + "・".join(why) + "）")

    log.info("戻した %d 枚 / %d 枚中 — 大きさ一致 %d ・指紋一致 %d ・中身が絵 %d ・空 %d",
             len(rows), st["n"], sizes, shas, kinds, empty)
    if bad:
        log.error("**戻せなかったのが %d / %d 枚**", len(bad), len(rows))
        for line in bad:
            print("::error::戻せない写真: " + line)
        return 1
    log.info("**%d 枚とも、バイト列が記録どおりに戻りました**（置き場 %d 枚のうち %d 枚を見た）",
             ok, st["n"], len(rows))
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--collection", help="戻すコレクション名")
    ap.add_argument("--at", help="いつの世代か（省くといちばん新しいもの）")
    ap.add_argument("--apply", action="store_true", help="実際に書く（既定は下見）")
    ap.add_argument("--list", action="store_true", help="どの世代があるか出す")
    ap.add_argument("--photo", action="store_true",
                    help="旅の写真を1枚戻して、バイト列が一致するか見る")
    ap.add_argument("--photo-path", help="どの1枚か（省くと晩ごとの組み合わせから引く）")
    ap.add_argument("--photo-n", type=int, default=PHOTO_N,
                    help=f"何枚戻して見るか（既定 {PHOTO_N}）")
    ap.add_argument("--photo-out", help="戻した実体の書き出し先")
    a = ap.parse_args()

    bq = sink.client()

    if a.photo:
        # **Firestore を1ミリも触らない。** 置き場から読んで、置き場に
        # 記録してある大きさと指紋に合うかを見るだけ
        return drill_photos(bq, a.photo_n, a.photo_path, a.photo_out)

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
