"""旅の写真の実体を退避する。**Storage の IAM を1つも通らない。**

## なぜ Storage の口を使わないのか（本番の実測・2026-09-12）

Functions のサービスアカウントで、写真の置き場
`live-streaming-d3cac.firebasestorage.app`（544件・340,231,177 バイト）に
何ができるかを `testIamPermissions` で測った:

    storage.objects.list    ○   ← **数えられる**
    storage.objects.get     ✕   ← **中身が1バイトも読めない**
    storage.objects.create  ○
    storage.objects.delete  ○
    storage.objects.update  ✕
    storage.buckets.get     ○

Actions のサービスアカウントのほうは、この置き場に対して**権限が1つも無い**
（`python/admin/backup_preflight.py` の実測。`python/backup/sink.py` の頭）。

**数えられることは、退避できることではない。** どちらの道でも実体は読めない。

## では何を通るのか

Firestore の書類（`islandStreamEventImage` / 旧 `nordicPhotos`）の `url` 欄に、
**合言葉つきのダウンロード URL** がそのまま入っている
（`functions/src/islandApi.ts` の `photoUrl()`。
`…/o/<path>?alt=media&token=<合言葉>`）。これは IAM ではなく合言葉で読ませる口
なので、**Storage の権限が1つも無くても 200 が返る。**
本番で1枚試した実測（2026-09-12）: `HTTP 200 / 993,115 バイト / image/jpeg`。

**その Firestore は毎晩の退避に入っている。** つまり名前の一覧も合言葉も
こちらの手元にある。**退避が退避のための鍵束になっている**形。

## この道で守れないもの（測っていないことは書かない）

- **索引に載っていない実体には届かない。** ここが辿るのは Firestore の
  2つの入れ物に書かれた `url` だけ。置き場の他の中身
  （キャラクターの絵・公開バケットの残り）は**1枚も入らない**
- **合言葉が作り直された1枚は、二度と取れない。** 貼り直しは新しい書類IDに
  なるので普段は起きないが、起きたら 403 か 404 で返る。**数えて報告する**
- `url` 欄の無い書類は取れない。**数えて報告する**

## 1回で取る量の上限（なぜ 128MB か）

あやとの決めに「1GB を超える SQL を流すのは控えて」がある。ここは SQL では
ないが、**1回の実行が持ち出す量を区切る**という筋は同じにする。

- **いま溜まっているのは 340MB。** 128MB で区切ると3回で取り切る。
  退避は1晩に最低2回起きる（`backup.yml` が取り込み2本の完了に繋いである）
  ので、**2晩で追いつく**
- **定常はぜんぜん当たらない。** 貼られるのは1日20枚 ≒ 6MB で、上限の 5%
- **1回の実行が長くならない。** 128MB の HTTP と base64 で1〜2分
- 1GB の線からは8分の1。**上限に当たっても次の回が続きから拾う**ので、
  当たること自体は事故ではない

枚数の上限（400枚）は**バイト数では止まらない場合の保険。** 写真は
1枚 1KB 以上（`islandApi.ts` の `bad size`）なので、理屈のうえでは
128MB に13万枚入る。HTTP を13万本叩く実行を作らない。

## 続きから拾うしくみ

**栞を別に持たない。置き場そのものに聞く**（`sink.last_ingested_at` と同じ理由）。
`island_backup.photos` に入っている `path` を引いて、**大きさと指紋の両方が
入っている行だけ**を「取ってある」と数える。途中で落ちた行を「ある」ことに
しないので、次の回がそこから取り直す。

置き場の名前には書類IDが入っていて、中身は変わらない
（`islandApi.ts` の `nordic/photos/<日>/<id>.<拡張子>`・`immutable`）。
**同じ名前の実体が別物に化けることはない**ので、名前で突き合わせてよい。
"""

import base64
import datetime as dt
import hashlib
import os
from typing import NamedTuple

from backup import plan, sink
from logging_util import setup_logger

log = setup_logger("backup")

# 1回で取るバイト数の上限。理由は上の docstring。環境変数で押し上げられる
# ようにしてあるのは、**溜まった 340MB を手で早く流し込みたいときのため**
BUDGET_BYTES = int(os.getenv("PHOTO_BUDGET_MB") or 128) * 1024 * 1024

# 1回で叩く HTTP の本数の上限。バイト数で止まらない形（極端に小さい写真が
# たくさん）への保険
BUDGET_COUNT = int(os.getenv("PHOTO_BUDGET_COUNT") or 400)

# 1回のストリーミング挿入に詰める生のバイト数。base64 で 4/3 に膨らむので
# 4MB → 5.4MB。BigQuery の1リクエスト 10MB の線の内側に収める。
# **足してから溢れるのではなく、溢れる前に流す**（1枚 4MB まで許してあるので、
# 「4MB を超えたら流す」だと最大 8MB＝11MB の山が作れてしまう）
CHUNK_BYTES = 4 * 1024 * 1024

# 1本の URL を待つ秒数。旅の途中の電波ではなく Actions から叩くので長くない
HTTP_TIMEOUT = 30

SCHEMA_FIELDS = (
    ("path", "STRING", "REQUIRED"),
    ("taken_at", "TIMESTAMP", "REQUIRED"),
    ("size", "INTEGER", "REQUIRED"),
    ("sha256", "STRING", "REQUIRED"),
    ("content_type", "STRING", "NULLABLE"),
    ("body", "BYTES", "REQUIRED"),
)


def schema():
    from google.cloud import bigquery

    return [bigquery.SchemaField(n, t, mode=m) for n, t, m in SCHEMA_FIELDS]


class Ref(NamedTuple):
    """写真1枚ぶんの手がかり。**ログには出さない。**"""

    path: str
    url: str
    at_ms: int


class Got(NamedTuple):
    """1本取った結果。`status` が 0 なら通信そのものが落ちた。"""

    status: int
    body: bytes
    content_type: str
    error: str


# ---------------------------------------------------------------- 索引を引く


def refs_from_firestore(fs=None) -> tuple[list[Ref], dict]:
    """Firestore から、写真の名前と合言葉つき URL を集める。**読むだけ。**

    2つの入れ物は**同じ実体を指している**（`islandApi.ts` が貼るときに
    両方へ同じ書類IDで書く）。**名前で1本にまとめる**。まとめないと、
    544枚が1088枚に見えて上限の意味が変わる。
    """
    if fs is None:
        from google.cloud import firestore

        fs = firestore.Client(project=sink.PROJECT)

    seen: dict[str, Ref] = {}
    # **url 無しは、書類ごとではなく実体ごとに数える。** 片方の入れ物に
    # url があってもう片方に無いだけの1枚を「取れない1枚」と報告すると、
    # 直しようのない警告が毎晩出続ける
    url_less: set[str] = set()
    n_docs = no_path = 0
    for col, field in plan.PHOTO_DOCS.items():
        for d in fs.collection(col).stream():
            data = d.to_dict() or {}
            n_docs += 1
            path = str(data.get(field) or "").strip()
            url = str(data.get("url") or "").strip()
            if not path:
                # 置き場の名前が無い＝どこにある実体か言えない。
                # 名前は置き場の鍵なので、これが無いと積めない
                no_path += 1
                continue
            if not url:
                url_less.add(path)
                continue
            if path not in seen:
                seen[path] = Ref(path, url, int(data.get("at") or data.get("createdAt") or 0))
    # 名前で並べる＝**日付の古い順**（`nordic/photos/<日>/<id>`）。
    # 溜まったぶんを古いほうから取る。古い写真ほど、失ったときに取り返せない
    return sorted(seen.values(), key=lambda r: r.path), {
        "docs": n_docs,
        "no_path": no_path,
        "no_url": len(url_less - set(seen)),
    }


def read_index(c) -> dict[str, tuple[int, str]]:
    """置き場に**もう入っている**写真の、名前 → (大きさ, 指紋)。

    表がまだ無い＝初回。空で返す（落とさない）。
    """
    tbl = f"{sink.PROJECT}.{sink.DATASET}.photos"
    try:
        rows = c.query(
            f"SELECT path, size, sha256 FROM `{tbl}`", location=sink.LOCATION
        ).result()
    except Exception:  # noqa: BLE001  表がまだ無い
        return {}
    return {r["path"]: (int(r["size"] or 0), str(r["sha256"] or "")) for r in rows}


def have_already(idx: dict, path: str) -> bool:
    """**大きさと指紋の両方が入っている行だけ**を「取ってある」と数える。

    名前だけ入って中身が空の行を「ある」ことにすると、途中で落ちた1枚が
    永遠に取り直されない。
    """
    size, sha = idx.get(path, (0, ""))
    return size > 0 and len(sha) == 64


# ---------------------------------------------------------------- 実体を取る


def fetch_http(url: str) -> Got:
    """URL を1本取る。

    **例外をそのまま上へ投げない。** `requests` の例外文には URL が入るので、
    投げると合言葉つきの URL が公開のログ（このリポジトリの Actions）に出る。
    握って、**型の名前と HTTP の番号だけ**を返す。
    """
    import requests

    try:
        r = requests.get(url, timeout=HTTP_TIMEOUT)
    except Exception as e:  # noqa: BLE001
        return Got(0, b"", "", type(e).__name__)
    if r.status_code != 200:
        return Got(r.status_code, b"", "", "")
    return Got(200, r.content, r.headers.get("content-type", ""), "")


# 表の作り直しを毎回問い合わせない。128MB を 4MB ずつ流すと32回来るので、
# そのたびに create_table を叩くと無駄な往復が32本増える
_TABLE = None


def write_rows(c, rows: list[dict]) -> None:
    """置き場へ流し込む。**落ちた理由は件数と reason だけ出す。**

    `insert_rows_json` の返す errors には行の中身が混ざることがあるので、
    そのまま例外文に入れない（名前も合言葉も出さない）。
    """
    global _TABLE
    if _TABLE is None:
        _TABLE = sink.ensure_table(c, "photos", schema())
    tbl = _TABLE
    errs = c.insert_rows_json(tbl, rows)
    if errs:
        why = sorted({
            str((e.get("errors") or [{}])[0].get("reason") or "unknown")
            for e in errs
        })
        raise RuntimeError(f"写真を置き場に書けませんでした: {len(errs)} 件（{', '.join(why)}）")


def _iso(at_ms: int) -> str:
    if at_ms > 0:
        return dt.datetime.fromtimestamp(at_ms / 1000, dt.timezone.utc).isoformat()
    return dt.datetime.now(dt.timezone.utc).isoformat()


def dump(
    c,
    dry: bool,
    *,
    list_refs=None,
    fetch=None,
    read_idx=None,
    write=None,
    budget_bytes: int | None = None,
    budget_count: int | None = None,
) -> dict:
    """旅の写真を1回ぶん退避する。**上限まで取って、残りは次の回に渡す。**

    `list_refs` / `fetch` / `read_idx` / `write` は差し替えられるようにして
    ある。**本番を叩かずに振る舞いを実測する**ため
    （`python/backup/photos_selftest.py`）。
    """
    list_refs = list_refs or refs_from_firestore
    fetch = fetch or fetch_http
    read_idx = read_idx or (lambda: read_index(c))
    write = write or (lambda rows: write_rows(c, rows))
    bb = BUDGET_BYTES if budget_bytes is None else budget_bytes
    bc = BUDGET_COUNT if budget_count is None else budget_count

    try:
        refs, listing = list_refs()
    except Exception as e:  # noqa: BLE001
        # 索引そのものが引けない。**赤くはしない**（写真以外は取れている）が、黙らない
        reason = type(e).__name__
        log.warning("写真の索引が引けません（%s）", reason)
        print("::warning::旅の写真の索引（Firestore の url 欄）が引けませんでした。"
              "この回は写真を取っていません")
        return {"ok": False, "reason": reason, "n": 0, "bytes": 0, "left": None}

    idx = read_idx()
    todo = [r for r in refs if not have_already(idx, r.path)]
    have = len(refs) - len(todo)

    out = {
        "ok": True,
        "n_all": len(refs),
        "have": have,
        "docs": listing.get("docs", 0),
        "no_url": listing.get("no_url", 0),
        "no_path": listing.get("no_path", 0),
    }
    log.info(
        "  索引 %d 書類 → 実体 %d 枚 / 取ってある %d 枚 / まだ %d 枚"
        "（url 無し %d・置き場の名前無し %d）",
        out["docs"], len(refs), have, len(todo), out["no_url"], out["no_path"],
    )
    if out["no_url"] or out["no_path"]:
        # **数だけ。** どの書類かは出さない
        print(f"::warning::写真の書類のうち {out['no_url'] + out['no_path']} 件は"
              "実体に辿れません（url か置き場の名前が入っていない）")

    if dry:
        log.info("  下見なので取りません（上限 %d バイト / %d 枚）", bb, bc)
        out.update({"n": 0, "bytes": 0, "written": 0, "failed": 0, "left": len(todo)})
        return out

    got = failed = written = 0
    got_bytes = 0
    fails: dict[str, int] = {}
    chunk: list[dict] = []
    chunk_bytes = 0

    for r in todo:
        if got_bytes >= bb or (got + failed) >= bc:
            break
        res = fetch(r.url)
        if res.status != 200 or not res.body:
            # **1枚で全部を止めない。** 数えて、次へ行く
            failed += 1
            key = res.error or str(res.status)
            fails[key] = fails.get(key, 0) + 1
            continue
        body = res.body
        if chunk and chunk_bytes + len(body) > CHUNK_BYTES:
            write(chunk)
            written += len(chunk)
            chunk, chunk_bytes = [], 0
        chunk.append({
            "path": r.path,
            "taken_at": _iso(r.at_ms),
            "size": len(body),
            "sha256": hashlib.sha256(body).hexdigest(),
            "content_type": res.content_type or None,
            "body": base64.b64encode(body).decode(),
        })
        chunk_bytes += len(body)
        got += 1
        got_bytes += len(body)
    if chunk:
        write(chunk)
        written += len(chunk)

    left = len(todo) - (got + failed)
    out.update({
        "n": got, "bytes": got_bytes, "written": written,
        "failed": failed, "fails": fails, "left": left,
    })
    log.info("  取った %d 枚 %d バイト / 置き場へ %d 行 / 落ちた %d 枚 / 残り %d 枚",
             got, got_bytes, written, failed, left)
    if failed:
        # **数と理由の種類だけ。** 名前も URL も出さない
        print(f"::warning::旅の写真 {failed} 枚が取れませんでした"
              f"（{', '.join(f'{k}×{v}' for k, v in sorted(fails.items()))}）。"
              "合言葉が作り直されている可能性があります")
    if left:
        print(f"::notice::旅の写真はあと {left} 枚残っています。"
              "次の回が続きから取ります（1回の上限で区切っています）")
    return out


# ---------------------------------------------------------------- 戻す


def read_row_bq(c):
    """置き場から写真を1行読む口。`path` を省くといちばん新しい1枚。"""
    from google.cloud import bigquery

    tbl = f"{sink.PROJECT}.{sink.DATASET}.photos"

    def read(path: str | None):
        where = "WHERE path = @p" if path else ""
        q = (f"SELECT path, taken_at, size, sha256, content_type, body "
             f"FROM `{tbl}` {where} ORDER BY taken_at DESC LIMIT 1")
        cfg = bigquery.QueryJobConfig(
            query_parameters=[bigquery.ScalarQueryParameter("p", "STRING", path)]
            if path else []
        )
        rows = list(c.query(q, job_config=cfg, location=sink.LOCATION).result())
        return dict(rows[0]) if rows else None

    return read


def restore_one(read_row, path: str | None = None, out_path: str | None = None,
                against: bytes | None = None) -> dict:
    """写真を1枚戻して、**バイト列が一致するか**を見る。

    合否は3つ。**大きさ**と**指紋（sha256）**と、`against` を渡したときは
    **バイト列そのもの。** 「取れているつもり」を潰すのがここの仕事で、
    戻せないものは退避ではない。

    出すのは 〇✕ と数だけ。**名前も中身も返り値に入れるが、ログには出さない。**
    """
    row = read_row(path)
    if row is None:
        return {"found": False}
    body = row["body"]
    if isinstance(body, str):
        # クライアントの版によっては base64 の字で返る
        body = base64.b64decode(body)
    size_ok = len(body) == int(row["size"])
    sha = hashlib.sha256(body).hexdigest()
    sha_ok = sha == str(row["sha256"])
    same = None if against is None else (bytes(body) == bytes(against))
    if out_path:
        with open(out_path, "wb") as f:
            f.write(body)
    return {
        "found": True,
        "path": row["path"],
        "bytes": len(body),
        "size_ok": size_ok,
        "sha_ok": sha_ok,
        "same_bytes": same,
        "ok": size_ok and sha_ok and (same is not False),
    }
