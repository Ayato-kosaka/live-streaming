"""下見の置き場を用意して、ファイルごとの署名付き URL を作り、暗号化して作業枝へ渡す（Actions 側）。

    python3 tools/shorts/preview/sign.py OUT_SEALED_DIR      # Actions の中で
    python3 tools/shorts/preview/sign.py --check REQ.json    # 手元で依頼の形だけ見る

作業箱には GCP の資格情報が無い。持っているのは Actions のサービスアカウント
（`FIREBASE_SERVICE_ACCOUNT`）だけ。**鍵を作業箱へ渡さずに、作業箱から直に上げる**ために、
ここでファイルごとに「その1つだけを・その操作だけ・決まった時間だけ」許す URL を作って渡す。

- 上げる（PUT・1時間）… 作業箱が mp4 を直に上げる
- 見る（GET・7日）…… あやとがスマホで開く。V4 署名の上限が7日
- 消す（DELETE・7日）… 投稿が済んだら作業箱から消す。7日を過ぎたら置き場の寿命（14日）が消す

## 置き場

非公開のバケット `live-streaming-d3cac-shorts-preview` を使う（無ければ作る）。
作るときは**公開アクセス防止を強制・均一アクセス・14日で消える・消したものを取っておかない**
（soft delete 0日。顔の写った下見を「消したのに7日残る」にしない）。
作れない・書けないときは Firebase の既定バケットの `shorts-preview/` の下に置く。

**どちらも、ここで権限を聞いてから使う**（`docs/island-misses.md` #61。「GCS に書けばいい」を
書けるか確かめずに決めた外し方）。聞いた結果は権限の名前と ○/✕ だけをログに出す。

## ログに出さないもの

このリポジトリは公開で、Actions のログは誰でも読める。**署名付き URL・置き場の中の道
（乱数の部分）・鍵はログに出さない。** 出すのはバケット名・ファイルの数と名前・権限の ○/✕・成否。
URL は依頼に入っている公開鍵で暗号化して（`tools/shorts/ingest/seal.py` と同じ形）、
作業枝の `shorts/.work/preview/<name>/` に置く。

## 依頼（`shorts/preview/<name>.json`）

    {"name": "yk-v2", "files": ["A.mp4", "B.mp4", "C.mp4"], "pubkey": "-----BEGIN PUBLIC KEY-----…",
     "nonce": "作業箱が作った乱数（届いた結果がこの依頼のものかを見分ける）"}
"""

from __future__ import annotations

import datetime as dt
import json
import os
import re
import secrets
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "ingest"))
import seal  # noqa: E402
from plan import Bad, compare_files, norm_pem  # noqa: E402

ROOT = HERE.parents[2]
PROJECT = "live-streaming-d3cac"
BUCKET = f"{PROJECT}-shorts-preview"
FALLBACK_BUCKET = f"{PROJECT}.firebasestorage.app"
FALLBACK_ROOT = "shorts-preview/"
# あやとが見るのは日本から。作業箱・ランナーとの往復より、スマホで開く速さを取る
LOCATION = "asia-northeast1"
KEEP_DAYS = 14
PUT_TTL = dt.timedelta(hours=1)
# V4 署名の上限（604800秒）。これより長くは作れない
GET_TTL = dt.timedelta(days=7)
REQ_DIR = "shorts/preview/"
NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
SEG = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
MAX_FILES = 200
BRANCH_OK = re.compile(r"^claude/[A-Za-z0-9._/-]+$")
TYPES = {".mp4": "video/mp4", ".mov": "video/quicktime", ".wav": "audio/wav",
         ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".json": "application/json",
         ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
         ".webp": "image/webp", ".md": "text/markdown; charset=utf-8",
         ".txt": "text/plain; charset=utf-8", ".csv": "text/csv; charset=utf-8"}

# 聞く権限。**置き場を決めるのに要るものだけ。** 聞くだけなら権限は要らない
# （testIamPermissions は「持っているもの」を返すだけ）
PROJECT_PERMS = ["storage.buckets.create", "storage.buckets.list"]
BUCKET_PERMS = ["storage.buckets.get", "storage.buckets.update",
                "storage.objects.create", "storage.objects.get",
                "storage.objects.delete", "storage.objects.list"]
NEED = {"storage.objects.create", "storage.objects.get", "storage.objects.delete"}


def content_type(name: str) -> str:
    return TYPES.get(Path(name).suffix.lower(), "application/octet-stream")


def check_files(files, origin: str) -> list[str]:
    if isinstance(files, str):
        files = [f for f in re.split(r"[,\s]+", files) if f]
    if not files:
        raise Bad(f"{origin}: files が空")
    if len(files) > MAX_FILES:
        raise Bad(f"{origin}: 1回に {MAX_FILES} ファイルまで（来たのは {len(files)}）")
    out = []
    for f in files:
        parts = str(f).split("/")
        # 置き場の道にそのまま使うので、ASCII の名前に絞る（`..` も先頭の `/` も通さない）
        if not all(SEG.match(p) for p in parts):
            raise Bad(f"{origin}: ファイル名の形が違う: {f!r}（英数字と . _ - と / だけ）")
        if f in out:
            raise Bad(f"{origin}: 同じ名前が2回: {f!r}")
        out.append(f)
    return out


def read_request(req: dict, origin: str) -> dict:
    name = str(req.get("name") or "")
    if not NAME.match(name):
        raise Bad(f"{origin}: name の形が違う: {name!r}（英数字と . _ - で64字まで）")
    pem, fp = norm_pem(req.get("pubkey", ""))
    nonce = str(req.get("nonce") or "")
    if nonce and not re.match(r"^[A-Za-z0-9_-]{8,64}$", nonce):
        raise Bad(f"{origin}: nonce の形が違う")
    return {"name": name, "files": check_files(req.get("files"), origin), "pubkey": pem,
            "pubkey_sha256": fp, "nonce": nonce, "req": origin}


def changed_requests() -> list[str]:
    """この push で足された・書き換えられた依頼（ingest の plan.py と同じ読みかた）。"""
    ev = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text(encoding="utf-8"))
    before = ev.get("before") or ""
    head = ev.get("after") or os.environ.get("GITHUB_SHA", "")
    if not before.strip("0"):
        before = (ev.get("repository") or {}).get("default_branch") or "master"
    seen: list[str] = []
    for f in compare_files(before, head):
        if f.startswith(REQ_DIR) and f.endswith(".json") and f.count("/") == 2 and f not in seen:
            seen.append(f)
    return [f for f in seen if (ROOT / f).is_file()]


def requests_now() -> list[dict]:
    g = os.environ.get
    if g("GITHUB_EVENT_NAME") == "workflow_dispatch":
        return [read_request({"name": g("IN_NAME", ""), "files": g("IN_FILES", ""),
                              "pubkey": g("IN_PUBKEY", ""), "nonce": g("IN_NONCE", "")},
                             "workflow_dispatch")]
    files = changed_requests()
    print(f"この push で来た依頼: {len(files)}件")
    return [read_request(json.loads((ROOT / f).read_text(encoding="utf-8")), f) for f in files]


def out_branch() -> str:
    b = (os.environ.get("IN_BRANCH") or "").strip() or os.environ.get("GITHUB_REF_NAME", "")
    if not BRANCH_OK.match(b):
        raise Bad(f"結果を置く枝は claude/ で始まる名前にする（来たのは {b!r}）")
    return b


# ---- 権限を聞く・置き場を用意する -------------------------------------------------

def project_perms(creds) -> set[str]:
    import google.auth.transport.requests as gt
    import requests

    creds.refresh(gt.Request())
    r = requests.post(
        f"https://cloudresourcemanager.googleapis.com/v1/projects/{PROJECT}:testIamPermissions",
        headers={"Authorization": f"Bearer {creds.token}"},
        json={"permissions": PROJECT_PERMS}, timeout=30)
    if not r.ok:
        print(f"  プロジェクトの権限を聞けなかった: HTTP {r.status_code}")
        return set()
    return set(r.json().get("permissions", []))


def bucket_perms(client, name: str) -> set[str] | None:
    """バケットに対して持っている権限。バケットが無ければ None。"""
    from google.api_core import exceptions as gx

    try:
        return set(client.bucket(name).test_iam_permissions(BUCKET_PERMS))
    except gx.NotFound:
        return None
    except gx.GoogleAPICallError as e:
        print(f"  {name} の権限を聞けなかった: {type(e).__name__}")
        return set()


def show(title: str, perms: list[str], got: set[str] | None) -> None:
    print(f"--- {title} ---")
    if got is None:
        print("  （バケットが無い）")
        return
    for p in perms:
        print(f"  {p:<28} {'○' if p in got else '✕'}")


def create_bucket(client):
    from google.cloud import storage

    b = storage.Bucket(client, BUCKET)
    b.iam_configuration.uniform_bucket_level_access_enabled = True
    b.iam_configuration.public_access_prevention = "enforced"
    b.add_lifecycle_delete_rule(age=KEEP_DAYS)
    # 消したものを7日取っておく既定（soft delete）を外す。顔の写った下見を
    # 「消したのに残っている」にしない
    b.soft_delete_policy.retention_duration_seconds = 0
    b.labels = {"purpose": "shorts-preview"}
    return client.create_bucket(b, location=LOCATION)


def bucket_ok(b) -> list[str]:
    """非公開であること・寿命があることを、作ったあと（在ったものは使う前）に読み直して見る。"""
    b.reload()
    bad = []
    if (b.iam_configuration.public_access_prevention or "") != "enforced":
        bad.append("公開アクセス防止が強制になっていない")
    if not b.iam_configuration.uniform_bucket_level_access_enabled:
        bad.append("均一アクセスになっていない")
    ages = [r.get("condition", {}).get("age") for r in b.lifecycle_rules
            if r.get("action", {}).get("type") == "Delete"]
    if not any(a and a <= KEEP_DAYS for a in ages):
        bad.append(f"{KEEP_DAYS}日で消える決まりが無い")
    return bad


def choose_place(client, creds) -> tuple[str, str, dict]:
    """(バケット名, その中の根の道, 聞いた結果) を返す。どこにも置けなければ Bad。"""
    probe: dict = {}
    proj = project_perms(creds)
    show(f"プロジェクト {PROJECT}", PROJECT_PERMS, proj)
    probe["project"] = sorted(proj)

    got = bucket_perms(client, BUCKET)
    if got is None and "storage.buckets.create" in proj:
        print(f"{BUCKET} が無いので作る（{LOCATION}・公開アクセス防止を強制・{KEEP_DAYS}日で消える）")
        create_bucket(client)
        got = bucket_perms(client, BUCKET)
    show(f"バケット {BUCKET}", BUCKET_PERMS, got)
    probe["bucket"] = None if got is None else sorted(got)
    if got is not None and NEED <= got:
        bad = bucket_ok(client.bucket(BUCKET)) if "storage.buckets.get" in got else \
            ["設定を読めない（storage.buckets.get が無い）"]
        if bad:
            print("  使わない: " + " / ".join(bad))
            probe["bucket_bad"] = bad
        else:
            print(f"  ここに置く: {BUCKET}（非公開・{KEEP_DAYS}日で消える）")
            return BUCKET, "", probe

    fb = bucket_perms(client, FALLBACK_BUCKET)
    show(f"バケット {FALLBACK_BUCKET}（代わりの置き場）", BUCKET_PERMS, fb)
    probe["fallback"] = None if fb is None else sorted(fb)
    if fb is not None and NEED <= fb:
        print(f"  ここに置く: {FALLBACK_BUCKET} の {FALLBACK_ROOT}（寿命の決まりは無い。消すのは作業箱から）")
        return FALLBACK_BUCKET, FALLBACK_ROOT, probe
    raise Bad("どのバケットにも、上げる・読む・消すの3つがそろっていない（上の ○/✕）。"
              "サービスアカウントに Storage の権限が無い")


# ---- 署名 -----------------------------------------------------------------------

def sign(client, bucket: str, root: str, req: dict) -> dict:
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
    # 道に乱数を挟む。バケットは非公開なので道を知っても読めないが、名前から当てられる形にしない
    prefix = f"{root}preview/{req['name']}/{secrets.token_hex(8)}/"
    b = client.bucket(bucket)
    files = []
    for f in req["files"]:
        blob = b.blob(prefix + f)
        ct = content_type(f)
        files.append({
            "name": f, "object": prefix + f, "content_type": ct,
            "put": blob.generate_signed_url(version="v4", method="PUT", expiration=PUT_TTL,
                                            content_type=ct),
            "get": blob.generate_signed_url(version="v4", method="GET", expiration=GET_TTL),
            "delete": blob.generate_signed_url(version="v4", method="DELETE", expiration=GET_TTL),
            # 署名なしの道。**これで 403 になる**ことを作業箱が確かめる（非公開の証明）
            "plain": f"https://storage.googleapis.com/{bucket}/{prefix}{f}",
        })
    return {"format": "shorts-preview/1", "name": req["name"], "bucket": bucket,
            "prefix": prefix, "created_at": now.isoformat(),
            "put_expires": (now + PUT_TTL).isoformat(), "get_expires": (now + GET_TTL).isoformat(),
            "keep_days": KEEP_DAYS if not root else None, "files": files}


def seal_one(req: dict, body: dict | None, error: str | None, probe: dict,
             sealed_root: Path, tmp: Path) -> Path:
    out = tmp / req["name"]
    out.mkdir(parents=True, exist_ok=True)
    if body:
        seal.write_json(out / "urls.json", body)
    seal.write_json(out / "run.json", {"error": error, "probe": probe,
                                        "run": os.environ.get("RUN_URL")})
    dest = sealed_root / req["name"]
    item = {"key": f"preview__{req['name']}", "mode": "preview", "dest": f"preview/{req['name']}",
            "pubkey": req["pubkey"], "pubkey_sha256": req["pubkey_sha256"], "req": req["req"]}
    stages = {"stages": {"sign": "ok" if body else "failed"},
              "counts": {"signed": len(body["files"]) if body else 0}}
    man = seal.seal(item, out, dest, stages)
    # 届いた結果がどの依頼のものかを、作業箱が平文の manifest で見分けられるように
    man["nonce"] = req["nonce"]
    seal.write_json(dest / "manifest.json", man)
    return dest


def main() -> int:
    if len(sys.argv) > 2 and sys.argv[1] == "--check":
        for f in sys.argv[2:]:
            r = read_request(json.loads(Path(f).read_text(encoding="utf-8")), f)
            print(f"ok  {r['name']}  {len(r['files'])}ファイル  鍵 {r['pubkey_sha256'][:16]}…")
        return 0
    sealed_root = Path(sys.argv[1])
    sealed_root.mkdir(parents=True, exist_ok=True)
    reqs = requests_now()
    branch = out_branch()
    if not reqs:
        print("依頼なし")
        return 0
    for r in reqs:
        print(f"  {r['name']}: {len(r['files'])}ファイル（{', '.join(r['files'][:10])}"
              f"{' …' if len(r['files']) > 10 else ''}）← {r['req']}")

    import tempfile

    import google.auth
    from google.cloud import storage

    creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    client = storage.Client(project=PROJECT, credentials=creds)
    probe: dict = {}
    failed = 0
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        try:
            bucket, root, probe = choose_place(client, creds)
            err = None
        except Exception as e:  # noqa: BLE001  置き場が決まらないことも、暗号化して返す
            bucket = root = None
            err = str(e) if isinstance(e, Bad) else f"{type(e).__name__}: {e}"
            print(f"!! 置き場を決められない: {err if isinstance(e, Bad) else type(e).__name__}")
        for r in reqs:
            body = None
            e1 = err
            if bucket:
                try:
                    body = sign(client, bucket, root, r)
                except Exception as e:  # noqa: BLE001
                    # 中身（道や URL が混ざりうる）は暗号化した run.json にだけ書く
                    e1 = f"{type(e).__name__}: {e}"
                    print(f"!! 署名で落ちた: {type(e).__name__}")
            dest = seal_one(r, body, e1, probe, sealed_root, td)
            print(f"  {r['name']}: {'署名した ' + str(len(body['files'])) + '本' if body else '失敗'}"
                  f" → 暗号化した（{dest.name}）")
            failed += 0 if body else 1
    gh_out = os.environ.get("GITHUB_OUTPUT")
    if gh_out:
        with open(gh_out, "a", encoding="utf-8") as f:
            f.write(f"branch={branch}\nfailed={failed}\n")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Bad as e:
        print(f"!! 依頼を受けられない: {e}")
        sys.exit(1)
