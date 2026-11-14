"""写真の取り込み（Google フォト → あやと島カード）の、Actions 側。

    python3 python/card_import_actions.py   # モードは環境変数 IN_MODE（ワークフローが渡す）

仕様は `docs/card-import.md`（2章の置き場と状態の決まり）。
ワークフローは `.github/workflows/card_import.yml`（workflow_dispatch だけ）。
作業箱から URL をもらう道具は `python/card_import_url.py`。

| モード | 何をする |
| --- | --- |
| `url` | 受け取り口（tar 1本ぶん）への署名付き PUT URL を1本作り、**依頼の公開鍵で包んで**作業枝に置く |
| `ingest` | tar を開いて manifest を検め、候補を私有の置き場（Functions 経由）と Firestore に置く。tar は消す |
| `labels` | 認識合わせの答えと外したものを `{sha: "yes"|"no"|"excluded"}` で job summary に出す |
| `status` | 回ごとの範囲・数・状態の内訳を job summary に表で出す |

## このリポジトリは公開で、Actions のログも誰でも読める

**ログ・job summary・成果物に写真を置かない。** URL も出さない（持っている人なら誰でも
上げられる鍵なので、`tools/shorts/preview/serve.py` と同じく公開鍵で包んで作業枝に置く）。
ログに出すのは数だけ。summary に出すのは sha（元の写真ファイルの SHA-256。中身は
何も分からない）と数と日付の範囲だけ。

## 受け取り口は Firebase の置き場ではない

Actions のサービスアカウントは、Firebase の既定の置き場に**権限が1つも無い**
（`docs/island-misses.md` #61・#283。`python/admin/_owner.py` の頭）。そこへの署名付き URL を
作っても、上げると 403 になる。だから

- tar の受け取り口は、Actions が `roles/storage.admin` を持っている非公開バケット
  （`live-streaming-d3cac-shorts-preview`、#938）の `transfer/cardimport/` に置く。
  `transfer/` は**1日で消える**決まりが掛かっている（`tools/shorts/preview/gcs.py`）ので、
  取り込みが走らなかった tar も置き去りにならない
- 候補の本体（`cardImport/cand/` `thumb/`）は Firebase の置き場に要る（登録と一覧の口が
  Functions から読む）。**Functions に頼んで置く**（`POST /island-api/cardimport/put`。
  キャラクターの移行と同じ道）
"""

from __future__ import annotations

import base64
import datetime as dt
import json
import os
import re
import sys
import tarfile
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

PROJECT = "live-streaming-d3cac"
# Actions が持っている非公開バケット（tools/shorts/preview/gcs.py の BUCKET）
INBOX_BUCKET = f"{PROJECT}-shorts-preview"
# `transfer/` は1日で消える（gcs.py の TRANSFER_DAYS）。その下に置く
INBOX_PREFIX = "transfer/cardimport/"
PUT_TTL = dt.timedelta(hours=1)

IMPORT = "islandCardImport"
RUNS = "islandCardImportRuns"

SHA = re.compile(r"^[0-9a-f]{64}$")
# functions/src/cardImport.ts の BATCH と同じ形
BATCH = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
NONCE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
MEMBER = re.compile(r"^([0-9a-f]{64})(\.t)?\.webp$")
KINDS = ("candidate", "calib")
STATUSES = ("candidate", "calib", "excluded", "registering", "registered", "failed", "withdrawn")
# 取り込みが**書き換えない**状態（2章）。あやとが外したもの・登録したもの・登録中のもの
PROTECTED = ("registered", "registering", "excluded")
# 同じ回の新しい manifest から消えたら withdrawn に落とすもの
WITHDRAWABLE = ("candidate", "calib", "failed")
# 写真の位置・元の名前を思わせる欄。**来たら回ごと断る**（2章「入れない」）
FORBIDDEN = {"lat", "lng", "lon", "latitude", "longitude", "gps", "geo", "location", "place",
             "path", "file", "filename", "name", "src", "original", "exif"}

MAX_TAR = 4 * 1024 ** 3
MAX_ITEMS = 5000
MAX_MANIFEST = 32 * 1024 * 1024
# functions/src/cardImport.ts の CAND_MIN / CAND_MAX / THUMB_MAX と同じ
CAND_MIN, CAND_MAX = 1024, 4 * 1024 * 1024
THUMB_MIN, THUMB_MAX = 64, 600 * 1024
# Firestore のまとめ書きは500まで。余裕をみて切る
CHUNK = 400


class Bad(Exception):
    """manifest・tar・入力が約束と違う。**回ごと断る**（半分だけ入れない）。"""


def log(msg: str) -> None:
    # 公開のログ。数と段だけを出す
    print(msg, flush=True)


def summary(md: str) -> None:
    p = os.environ.get("GITHUB_STEP_SUMMARY")
    if p:
        with open(p, "a", encoding="utf-8") as f:
            f.write(md.rstrip() + "\n")
    else:
        print(md)


def inbox_object(batch: str) -> str:
    if not BATCH.match(batch or ""):
        raise Bad(f"batch の形が違う: {batch!r}（英数字と . _ - で64字まで）")
    return f"{INBOX_PREFIX}{batch}.tar"


def is_day(s) -> bool:
    if not isinstance(s, str) or not re.match(r"^\d{4}-\d{2}-\d{2}$", s):
        return False
    try:
        dt.date.fromisoformat(s)
        return True
    except ValueError:
        return False


def is_webp(b: bytes) -> bool:
    return len(b) >= 12 and b[:4] == b"RIFF" and b[8:12] == b"WEBP"


def _short(v, n: int) -> str:
    return re.sub(r"[\x00-\x1f\x7f]", " ", str(v if v is not None else ""))[:n]


def _int(v, lo: int, hi: int) -> int:
    try:
        n = int(v)
    except (TypeError, ValueError):
        raise Bad(f"数でない: {v!r}") from None
    if not lo <= n <= hi:
        raise Bad(f"範囲の外: {n}")
    return n


# ---------------------------------------------------------------- tar と manifest

def read_tar(path: Path) -> tuple[dict, dict[str, dict[str, bytes]]]:
    """tar を開いて (manifest, {sha: {"cand": 中身, "thumb": 中身}})。

    **ふつうのファイルだけ・決まった名前だけ**を受ける。リンク・ディレクトリの外へ出る名前・
    知らない名前が1つでもあれば回ごと断る（展開はしない。中身はメモリで読む）。
    """
    if path.stat().st_size > MAX_TAR:
        raise Bad(f"tar が大きすぎる（{path.stat().st_size} バイト）")
    try:
        return _read_tar(path)
    except (tarfile.TarError, UnicodeDecodeError, json.JSONDecodeError) as e:
        raise Bad(f"tar か manifest.json が読めない（{type(e).__name__}）") from None


def _read_tar(path: Path) -> tuple[dict, dict[str, dict[str, bytes]]]:
    manifest = None
    files: dict[str, dict[str, bytes]] = {}
    with tarfile.open(path, mode="r:") as tf:
        for m in tf:
            name = m.name[2:] if m.name.startswith("./") else m.name
            if m.isdir() and name in ("", "."):
                continue
            if not m.isreg():
                raise Bad("tar にふつうのファイルでないものがある（リンク・ディレクトリなど）")
            if name == "manifest.json":
                if manifest is not None or m.size > MAX_MANIFEST:
                    raise Bad("manifest.json が2つある・大きすぎる")
                manifest = json.loads(tf.extractfile(m).read().decode("utf-8"))
                continue
            hit = MEMBER.match(name)
            if not hit:
                # 名前は出さない（元のファイル名が混ざっているかもしれない）
                raise Bad("tar に約束に無い名前のファイルがある")
            sha, thumb = hit.group(1), bool(hit.group(2))
            lo, hi = (THUMB_MIN, THUMB_MAX) if thumb else (CAND_MIN, CAND_MAX)
            if not lo <= m.size <= hi:
                raise Bad(f"{sha[:12]}… の{'一覧用' if thumb else '本体'}の大きさが範囲の外（{m.size}）")
            data = tf.extractfile(m).read()
            if not is_webp(data):
                raise Bad(f"{sha[:12]}… の{'一覧用' if thumb else '本体'}が webp でない")
            slot = files.setdefault(sha, {})
            key = "thumb" if thumb else "cand"
            if key in slot:
                raise Bad(f"{sha[:12]}… が2つある")
            slot[key] = data
    if manifest is None:
        raise Bad("tar に manifest.json が無い")
    return manifest, files


def check_manifest(m: dict, batch: str, files: dict[str, dict[str, bytes]]) -> dict:
    """manifest を検めて、**Firestore に書いてよい欄だけ**に絞ったものを返す。"""
    if not isinstance(m, dict):
        raise Bad("manifest がオブジェクトでない")
    if m.get("batch") != batch:
        raise Bad("manifest の batch が、頼まれた batch と違う")
    rng = m.get("range") or {}
    if not (is_day(rng.get("from")) and is_day(rng.get("to")) and rng["from"] <= rng["to"]):
        raise Bad("range の from / to が日付でない・逆")
    missing = []
    for x in m.get("missing") or []:
        if not (isinstance(x, dict) and is_day(x.get("from")) and is_day(x.get("to"))):
            raise Bad("missing の from / to が日付でない")
        missing.append({"from": x["from"], "to": x["to"], "why": _short(x.get("why"), 120)})
    counts = {}
    for k, v in (m.get("counts") or {}).items():
        if not re.match(r"^[A-Za-z][A-Za-z0-9]{0,31}$", str(k)):
            raise Bad("counts の名前が変")
        counts[str(k)] = _int(v, 0, 10 ** 7)
    items = m.get("items")
    if not isinstance(items, list) or not items or len(items) > MAX_ITEMS:
        raise Bad(f"items が空・{MAX_ITEMS}を超える")
    out_items = []
    seen = set()
    for it in items:
        if not isinstance(it, dict):
            raise Bad("items の中にオブジェクトでないものがある")
        bad_keys = {k.lower() for k in it} & FORBIDDEN
        if bad_keys:
            raise Bad(f"items に入れない約束の欄がある: {sorted(bad_keys)}（位置・名前・道は入れない）")
        sha = it.get("sha")
        if not isinstance(sha, str) or not SHA.match(sha):
            raise Bad("sha が64桁の16進でない")
        if sha in seen:
            raise Bad(f"{sha[:12]}… が items に2回ある")
        seen.add(sha)
        if not is_day(it.get("day")):
            raise Bad(f"{sha[:12]}… の day が日付でない")
        if it.get("kind") not in KINDS:
            raise Bad(f"{sha[:12]}… の kind が candidate / calib でない")
        slot = files.get(sha) or {}
        if "cand" not in slot or "thumb" not in slot:
            raise Bad(f"{sha[:12]}… の本体か一覧用が tar に無い")
        reasons = it.get("reasons") or []
        if not isinstance(reasons, list):
            raise Bad(f"{sha[:12]}… の reasons が並びでない")
        try:
            score = float(it.get("score") or 0)
        except (TypeError, ValueError):
            raise Bad(f"{sha[:12]}… の score が数でない") from None
        out_items.append({
            "sha": sha,
            "kind": it["kind"],
            "day": it["day"],
            "takenAt": _short(it.get("takenAt"), 40),
            "w": _int(it.get("w") or 0, 0, 20000), "h": _int(it.get("h") or 0, 0, 20000),
            "tw": _int(it.get("tw") or 0, 0, 20000), "th": _int(it.get("th") or 0, 0, 20000),
            "category": _short(it.get("category"), 32),
            "score": score,
            "group": _short(it.get("group"), 40),
            "ambiguous": it.get("ambiguous") is True,
            "reasons": [_short(r, 80) for r in reasons[:12]],
        })
    extra = set(files) - seen
    if extra:
        raise Bad(f"manifest に無い写真が tar に {len(extra)}枚ある")
    return {"batch": batch, "source": _short(m.get("source"), 32),
            "range": {"from": rng["from"], "to": rng["to"]}, "missing": missing,
            "counts": counts, "items": out_items}


# ---------------------------------------------------------------- 状態の決まり（2章）

def plan(man: dict, existing: dict[str, dict | None], batch_docs: dict[str, dict],
         now: int) -> dict:
    """何を書くか。**書く前に全部決める**（決まりはここ1か所）。

    - `registered` `registering` `excluded` の書類には**1文字も触らない**
    - それ以外（無い・candidate・calib・failed・withdrawn）は manifest の中身で上書きする。
      `calibAnswer` と `imageId` は触らない（merge で書くので残る）
    - 同じ batch で、新しい manifest から消えた candidate / calib / failed は `withdrawn`
    """
    sets: dict[str, dict] = {}
    uploads: list[str] = []
    kept: dict[str, int] = {}
    shas = set()
    for it in man["items"]:
        sha = it["sha"]
        shas.add(sha)
        cur = existing.get(sha)
        st = (cur or {}).get("status")
        if st in PROTECTED:
            kept[st] = kept.get(st, 0) + 1
            # 外したものは画面から戻せる。戻したときに本体が要るので、置き直しはする
            if st == "excluded":
                uploads.append(sha)
            continue
        fields = {k: it[k] for k in ("day", "takenAt", "w", "h", "tw", "th", "category",
                                     "score", "group", "ambiguous", "reasons")}
        fields.update(batch=man["batch"], status=it["kind"], error=None, updatedAt=now)
        if cur is None:
            fields["createdAt"] = now
        sets[sha] = fields
        uploads.append(sha)
    withdraw = sorted(s for s, d in batch_docs.items()
                      if s not in shas and (d or {}).get("status") in WITHDRAWABLE)
    return {"sets": sets, "uploads": uploads, "withdraw": withdraw, "kept": kept}


def labels_of(docs: dict[str, dict]) -> dict[str, str]:
    """`{sha: "yes"|"no"|"excluded"}`。**sha と答えのほかは何も出さない。**"""
    out = {}
    for sha, d in sorted(docs.items()):
        if not SHA.match(sha):
            continue
        if d.get("status") == "excluded":
            out[sha] = "excluded"
        elif d.get("calibAnswer") in ("yes", "no"):
            out[sha] = d["calibAnswer"]
    return out


def status_md(runs: dict[str, dict], docs: dict[str, dict]) -> str:
    by: dict[str, dict[str, int]] = {}
    for d in docs.values():
        b = str(d.get("batch") or "?")
        st = str(d.get("status") or "?")
        by.setdefault(b, {})
        by[b][st] = by[b].get(st, 0) + 1
    order = sorted(set(runs) | set(by),
                   key=lambda b: -(runs.get(b, {}).get("createdAt") or 0))
    cols = list(STATUSES)
    lines = ["## 写真の取り込み", "",
             "| 回 | 範囲 | 選んだ | " + " | ".join(cols) + " | 登録した日 |",
             "| --- | --- | ---: | " + " | ".join("---:" for _ in cols) + " | --- |"]
    for b in order:
        r = runs.get(b, {})
        rng = r.get("range") or {}
        span = f"{rng.get('from', '?')} 〜 {rng.get('to', '?')}" if rng else "—"
        cnt = by.get(b, {})
        reg = r.get("registeredAt")
        when = (dt.datetime.fromtimestamp(reg / 1000, dt.timezone(dt.timedelta(hours=9)))
                .strftime("%Y-%m-%d") if reg else "—")
        name = b if BATCH.match(b) else "?"
        lines.append(f"| {name} | {span} | {r.get('items', '—')} | "
                     + " | ".join(str(cnt.get(c, 0)) for c in cols) + f" | {when} |")
    if not order:
        lines.append("| （まだ1回も無い） |" + " |" * (len(cols) + 3))
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------- Firestore（本物）

class FsStore:
    """Firestore に触るところ。selftest は同じ形の偽物を渡す。"""

    def __init__(self, client=None):
        if client is None:
            from google.cloud import firestore
            client = firestore.Client(project=PROJECT)
        self.c = client

    def _by(self, col: str, field: str, value) -> dict[str, dict]:
        from google.cloud.firestore_v1.base_query import FieldFilter
        q = self.c.collection(col).where(filter=FieldFilter(field, "==", value))
        return {d.id: d.to_dict() or {} for d in q.stream()}

    def get_many(self, shas: list[str]) -> dict[str, dict | None]:
        out: dict[str, dict | None] = {}
        col = self.c.collection(IMPORT)
        for i in range(0, len(shas), 300):
            for snap in self.c.get_all([col.document(s) for s in shas[i:i + 300]]):
                out[snap.id] = snap.to_dict() if snap.exists else None
        return out

    def by_batch(self, batch: str) -> dict[str, dict]:
        return self._by(IMPORT, "batch", batch)

    def all_items(self) -> dict[str, dict]:
        return {d.id: d.to_dict() or {} for d in self.c.collection(IMPORT).stream()}

    def runs(self) -> dict[str, dict]:
        return {d.id: d.to_dict() or {} for d in self.c.collection(RUNS).stream()}

    def write(self, sets: dict[str, dict], withdraw: list[str], now: int) -> None:
        col = self.c.collection(IMPORT)
        ops = [("set", s, f) for s, f in sets.items()] + [("w", s, None) for s in withdraw]
        for i in range(0, len(ops), CHUNK):
            b = self.c.batch()
            for kind, sha, f in ops[i:i + CHUNK]:
                if kind == "set":
                    b.set(col.document(sha), f, merge=True)
                else:
                    b.update(col.document(sha), {"status": "withdrawn", "updatedAt": now})
            b.commit()

    def set_run(self, batch: str, fields: dict) -> None:
        self.c.collection(RUNS).document(batch).set(fields, merge=True)

    def get_run(self, batch: str) -> dict | None:
        s = self.c.collection(RUNS).document(batch).get()
        return s.to_dict() if s.exists else None


# ---------------------------------------------------------------- 取り込み

def ingest_core(tar: Path, batch: str, store, upload, now: int | None = None) -> dict:
    """tar → 検め → 置き場 → Firestore。`upload(sha, cand, thumb)` は置けたら True。

    **置き場に置けなかった1枚は、候補として書かない**（画面に中身の無い1枚が並ぶ）。
    1枚でも置けなければ tar を残す（呼ぶ側が消さない）ために、結果に数を返す。
    """
    now = now or int(time.time() * 1000)
    m, files = read_tar(tar)
    man = check_manifest(m, batch, files)
    shas = [it["sha"] for it in man["items"]]
    existing = store.get_many(shas)
    batch_docs = store.by_batch(batch)
    p = plan(man, existing, batch_docs, now)
    failed = []
    for i, sha in enumerate(p["uploads"], 1):
        if not upload(sha, files[sha]["cand"], files[sha]["thumb"]):
            failed.append(sha)
        if i % 50 == 0:
            log(f"  置いた {i}/{len(p['uploads'])}")
    sets = {s: f for s, f in p["sets"].items() if s not in failed}
    store.write(sets, p["withdraw"], now)
    run = store.get_run(batch)
    fields = {"range": man["range"], "missing": man["missing"], "counts": man["counts"],
              "source": man["source"], "items": len(man["items"]), "updatedAt": now}
    if not run or not run.get("createdAt"):
        fields["createdAt"] = now
    store.set_run(batch, fields)
    by_kind: dict[str, int] = {}
    for s, f in sets.items():
        by_kind[f["status"]] = by_kind.get(f["status"], 0) + 1
    return {"items": len(man["items"]), "written": by_kind, "kept": p["kept"],
            "withdrawn": len(p["withdraw"]), "uploaded": len(p["uploads"]) - len(failed),
            "uploadFailed": len(failed)}


def api_uploader():
    """Functions の `POST /cardimport/put` に、あやとの札で頼む（`python/admin/_owner.py`）。"""
    import requests
    sys.path.insert(0, str(HERE / "admin"))
    from _owner import API_BASE, owner_token  # noqa: E402

    token = owner_token(FsStore().c)
    sess = requests.Session()

    def up(sha: str, cand: bytes, thumb: bytes) -> bool:
        body = {"sha": sha, "cand": base64.b64encode(cand).decode("ascii"),
                "thumb": base64.b64encode(thumb).decode("ascii")}
        for i in range(3):
            try:
                r = sess.post(f"{API_BASE}/cardimport/put", json=body, timeout=120,
                              headers={"authorization": f"Bearer {token}"})
                if r.status_code == 200:
                    return True
                # 本文は出さない。状態番号だけ
                log(f"  !! 置けなかった {sha[:12]}…: HTTP {r.status_code}")
                if r.status_code < 500:
                    return False
            except requests.RequestException as e:
                log(f"  !! 置けなかった {sha[:12]}…: {type(e).__name__}")
            time.sleep(2 + 3 * i)
        return False

    return up


def gcs_bucket():
    import google.auth
    from google.cloud import storage

    creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    return storage.Client(project=PROJECT, credentials=creds).bucket(INBOX_BUCKET)


def mode_ingest(batch: str) -> int:
    obj = inbox_object(batch)
    blob = gcs_bucket().blob(obj)
    if not blob.exists():
        raise Bad("受け取り口に tar が無い（上げ終わっていない・1日たって消えた・batch 違い）")
    with tempfile.TemporaryDirectory(dir=os.environ.get("RUNNER_TEMP")) as td:
        tar = Path(td) / "in.tar"
        blob.download_to_filename(str(tar))
        log(f"tar を受け取った（{tar.stat().st_size // 1024 // 1024}MB）")
        res = ingest_core(tar, batch, FsStore(), api_uploader())
    log("取り込んだ: " + json.dumps(res, ensure_ascii=False))
    summary("\n".join([
        f"## 写真の取り込み `{batch}`", "",
        "| 何 | 数 |", "| --- | ---: |",
        f"| manifest の写真 | {res['items']} |",
        *[f"| 書いた（{k}） | {v} |" for k, v in sorted(res["written"].items())],
        *[f"| 触らなかった（{k}） | {v} |" for k, v in sorted(res["kept"].items())],
        f"| 取り下げた（withdrawn） | {res['withdrawn']} |",
        f"| 置き場に置けなかった | {res['uploadFailed']} |",
    ]))
    if res["uploadFailed"]:
        log("::error::置けなかった写真がある。tar は残した（1日で消える。その前に流し直す）")
        return 1
    blob.delete()
    log("tar を消した")
    return 0


# ---------------------------------------------------------------- 受け取り口の URL（url）

def sign_put(batch: str) -> dict:
    blob = gcs_bucket().blob(inbox_object(batch))
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
    url = blob.generate_signed_url(version="v4", method="PUT", expiration=PUT_TTL)
    return {"format": "card-import-inbox/1", "batch": batch, "bucket": INBOX_BUCKET,
            "object": inbox_object(batch), "put": url,
            "put_expires": (now + PUT_TTL).isoformat(), "keep_days": 1}


def result_dir(nonce: str) -> str:
    return f"shorts/.work/cardimport/{nonce}"


def mode_url(batch: str, pubkey: str, nonce: str, branch: str, sign=sign_put) -> int:
    """URL を作って、依頼の公開鍵で包んで作業枝に置く。**URL はログに出さない。**"""
    sys.path.insert(0, str(ROOT / "tools/shorts/preview"))
    sys.path.insert(0, str(ROOT / "tools/shorts/ingest"))
    import branch as br  # noqa: E402
    import seal  # noqa: E402
    from plan import norm_pem  # noqa: E402

    inbox_object(batch)
    if not NONCE.match(nonce or ""):
        raise Bad("nonce が無い・形が違う")
    if not re.match(r"^claude/[A-Za-z0-9._/-]+$", branch or ""):
        raise Bad("結果を置く枝は claude/ で始まる名前にする")
    pem, fp = norm_pem(pubkey)
    body = sign(batch)
    with tempfile.TemporaryDirectory(dir=os.environ.get("RUNNER_TEMP")) as td:
        dest = seal_url(body, pem, fp, nonce, Path(td), seal)
        rel = result_dir(nonce)
        adds = {f"{rel}/{p.name}": p for p in sorted(dest.iterdir())}
        ensure_branch(br, branch)
        br.push_change(branch, adds, [],
                       f"写真の取り込みの受け取り口（{batch}）を暗号化して置く"
                       f"（run {os.environ.get('GITHUB_RUN_ID', '?')}）\n\n"
                       "署名付き URL は持っている人なら誰でも上げられる鍵なので、"
                       "依頼の公開鍵で包んだものだけを置く。")
    log("受け取り口の URL を1本作って、包んで置いた（1時間で切れる・置いたものは1日で消える）")
    return 0


def seal_url(body: dict, pem: str, fp: str, nonce: str, tmp: Path, seal) -> Path:
    out = tmp / "res"
    out.mkdir()
    (out / "inbox.json").write_text(json.dumps(body, ensure_ascii=False), encoding="utf-8")
    dest = tmp / "sealed"
    item = {"key": f"cardimport__{nonce}", "mode": "cardimport", "dest": f"cardimport/{nonce}",
            "pubkey": pem, "pubkey_sha256": fp, "req": "workflow_dispatch"}
    man = seal.seal(item, out, dest, {"stages": {"url": "ok"}, "counts": {}})
    man["nonce"] = nonce
    seal.write_json(dest / "manifest.json", man)
    return dest


def ensure_branch(br, branch: str) -> None:
    """結果を置く枝が無ければ、いまの commit から作る（初めての1回だけ）。"""
    try:
        br.fetch(branch)
    except RuntimeError:
        br.git("push", "--quiet", "origin", f"{os.environ.get('GITHUB_SHA', 'HEAD')}:refs/heads/{branch}")


# ---------------------------------------------------------------- labels / status

def mode_labels(batch: str, store=None) -> int:
    store = store or FsStore()
    docs = store.by_batch(batch) if batch else store.all_items()
    lab = labels_of(docs)
    tally: dict[str, int] = {}
    for v in lab.values():
        tally[v] = tally.get(v, 0) + 1
    log("答え: " + json.dumps(tally, ensure_ascii=False))
    summary("## 認識合わせの答えと外したもの" + (f"（`{batch}`）" if batch else "") + "\n\n"
            "```json\n" + json.dumps(lab, indent=1, sort_keys=True) + "\n```\n")
    return 0


def mode_status(store=None) -> int:
    store = store or FsStore()
    runs, docs = store.runs(), store.all_items()
    log(f"回 {len(runs)} / 候補 {len(docs)}")
    summary(status_md(runs, docs))
    return 0


def main() -> int:
    g = os.environ.get
    mode = (g("IN_MODE") or "").strip()
    batch = (g("IN_BATCH") or "").strip()
    if mode == "url":
        return mode_url(batch, g("IN_PUBKEY", ""), (g("IN_NONCE") or "").strip(),
                        (g("IN_BRANCH") or "").strip())
    if mode == "ingest":
        inbox_object(batch)
        return mode_ingest(batch)
    if mode == "labels":
        if batch:
            inbox_object(batch)
        return mode_labels(batch)
    if mode == "status":
        return mode_status()
    raise Bad(f"mode は url / ingest / labels / status（来たのは {mode!r}）")


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Bad as e:
        print(f"::error::{e}")
        sys.exit(1)
