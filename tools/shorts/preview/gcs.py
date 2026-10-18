"""GCS の非公開バケットに、ファイルごとの署名付き URL を作る（Actions 側。`serve.py` から呼ぶ）。

Actions のサービスアカウントは、プロジェクト全体の Storage には何もできない
（2026-10-16 に実測: storage.buckets.create ✕、Firebase の既定バケットで objects.* ✕。
#283・`docs/island-misses.md` #61 と同じ壁）。**このバケットだけ**、あやとが作って
roles/storage.admin を付けた（#938、2026-10-17）。だから作るのではなく、在るものを使う。

作業箱には GCP の資格情報が無い。**鍵を作業箱へ渡さずに、作業箱から直に上げる**ために、
ファイルごとに「その1つだけを・その操作だけ・決まった時間だけ」許す URL を作る。

- 上げる（PUT・1時間）… 作業箱が直に上げる
- 見る（GET・7日）…… V4 署名の上限が7日
- 消す（DELETE・7日）… 7日を過ぎたらバケットの寿命（14日）が消す

置き場は `live-streaming-d3cac-shorts-preview`（公開アクセス防止を強制・均一アクセス・
`preview/` `render/` は14日で消える・消したものを取っておかない）。**使う前に権限を聞き、設定を読み直す。**
寿命の決まりが無ければ、`storage.buckets.update` があればここで足す。
同じバケットの `uploads/`（あやとが上げる録画）は30日で消える（`tools/shorts/upload/store.py`）。
寿命の決まりは「どれか1つに当たれば消す」ので、14日の決まりは全体ではなく短い道だけに掛ける。
ログに出すのはバケット名・権限の ○/✕・成否だけ。URL と道の乱数は出さない。

## 受け渡しの道（`transfer/`、依頼の place が `transfer`）

EC2 へ動画などを渡すための道（`tools/shorts/post/send.py`）。前は中身を base64 にして
SSM のコマンドに載せていて、**中身が EC2 の SSM エージェントのログにそのまま残った。**
ここに置いて、EC2 には URL だけを渡して `curl` で落とさせる。SSM のコマンドに載るのは URL だけ。

- 上げる（PUT・1時間）… 作業箱が直に上げる
- 見る・消す（GET / DELETE・3時間）… **URL は SSM のコマンド（＝EC2 のログ）に載る。** 載っても
  困らないように寿命を短くし、EC2 が落とし終えたら send.py がすぐ消す（以後の URL は 404）
- 置いたものは1日で消える（寿命の決まりを `transfer/` だけに掛ける。ほかの道の決まりには触らない）
"""

from __future__ import annotations

import datetime as dt
import secrets
from pathlib import Path

from req import Bad

PROJECT = "live-streaming-d3cac"
BUCKET = f"{PROJECT}-shorts-preview"
# 米国の1リージョン。書き出し（第2段）で素材を何百MB も読むのは米国のランナーで、
# Cloud Storage の無料枠（保存5GB・北米からの転送100GB/月）も米国のリージョンにしか付かない。
# あやとが日本から30MB の動画を開く分には、遠さで困らない
LOCATION = "us-central1"
KEEP_DAYS = 14
# 14日で消す道。全体に掛けると uploads/（30日）まで14日で消える
SHORT_LIVED = ("preview/", "render/")
PUT_TTL = dt.timedelta(hours=1)
# V4 署名の上限（604800秒）。これより長くは作れない
GET_TTL = dt.timedelta(days=7)
# 受け渡しの道。URL が EC2 のログに載るので、見る・消すの URL は数時間で切れるようにする
TRANSFER = "transfer/"
TRANSFER_DAYS = 1
TRANSFER_TTL = dt.timedelta(hours=3)
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
NEED = {"storage.buckets.get", "storage.objects.create", "storage.objects.get",
        "storage.objects.delete"}


def content_type(name: str) -> str:
    return TYPES.get(Path(name).suffix.lower(), "application/octet-stream")


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
    b.add_lifecycle_delete_rule(age=KEEP_DAYS, matches_prefix=list(SHORT_LIVED))
    # 消したものを7日取っておく既定（soft delete）を外す。顔の写った下見を
    # 「消したのに残っている」にしない
    b.soft_delete_policy.retention_duration_seconds = 0
    b.labels = {"purpose": "shorts-preview"}
    return client.create_bucket(b, location=LOCATION)


def has_lifecycle(b) -> bool:
    """短い道（preview/ render/）が、どれも14日以内に消える決まりに当たるか。"""
    rules = [r for r in b.lifecycle_rules if r.get("action", {}).get("type") == "Delete"
             and 0 < (r.get("condition", {}).get("age") or 0) <= KEEP_DAYS]
    return all(any(not r["condition"].get("matchesPrefix")
                   or any(p.startswith(m) for m in r["condition"]["matchesPrefix"]) for r in rules)
               for p in SHORT_LIVED)


def bucket_ok(b, can_update: bool) -> list[str]:
    """非公開であること・寿命があることを、使う前に読み直して見る。寿命だけは足せるなら足す。"""
    b.reload()
    if not has_lifecycle(b) and can_update:
        b.add_lifecycle_delete_rule(age=KEEP_DAYS, matches_prefix=list(SHORT_LIVED))
        b.patch()
        b.reload()
        print(f"  {KEEP_DAYS}日で消える決まりを足した")
    bad = []
    if (b.iam_configuration.public_access_prevention or "") != "enforced":
        bad.append("公開アクセス防止が強制になっていない")
    if not b.iam_configuration.uniform_bucket_level_access_enabled:
        bad.append("均一アクセスになっていない")
    if not has_lifecycle(b):
        bad.append(f"{KEEP_DAYS}日で消える決まりが無い")
    return bad


def life_days(b, path: str) -> int | None:
    """その道のものが何日で消えるか（当たる Delete の決まりのうち、いちばん短いもの）。"""
    ages = [r["condition"]["age"] for r in b.lifecycle_rules
            if (r.get("action") or {}).get("type") == "Delete"
            and (r.get("condition") or {}).get("age")
            and (not r["condition"].get("matchesPrefix")
                 or any(path.startswith(m) for m in r["condition"]["matchesPrefix"]))]
    return min(ages) if ages else None


def ensure_transfer_life(b, can_update: bool) -> dict:
    """`transfer/` を1日で消す決まりを、無ければ足す。**足すだけで、ほかの決まりは書き換えない**
    （`uploads/` の30日・`preview/` `render/` の14日はそのまま）。"""
    b.reload()
    notes = []
    if life_days(b, TRANSFER + "x") != TRANSFER_DAYS and can_update:
        b.add_lifecycle_delete_rule(age=TRANSFER_DAYS, matches_prefix=[TRANSFER])
        b.patch()
        b.reload()
        notes.append(f"{TRANSFER} を{TRANSFER_DAYS}日で消す決まりを足した")
    days = {p: life_days(b, p + "x") for p in ("uploads/", *SHORT_LIVED, TRANSFER)}
    for n in notes:
        print(f"  {n}")
    print("  寿命: " + "  ".join(f"{p} {d}日" for p, d in days.items()))
    if days[TRANSFER] != TRANSFER_DAYS:
        e = Bad(f"{TRANSFER} が{TRANSFER_DAYS}日で消える決まりが無い（{days[TRANSFER]}）。"
                "buckets.update が要る")
        e.probe = {"days": days}  # type: ignore[attr-defined]
        raise e
    return {"changed": notes, "days": days}


def choose_bucket(client, creds) -> tuple[str, dict]:
    """(バケット名, 聞いた結果) を返す。置けなければ Bad（聞いた結果は Bad の probe に持たせる）。"""
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
    if got is None or not NEED <= got:
        e = Bad(f"{BUCKET} に、読む・上げる・消すの権限がそろっていない（上の ○/✕）。"
                "README の「GCS の道」の付与が要る")
        e.probe = probe  # type: ignore[attr-defined]
        raise e
    bad = bucket_ok(client.bucket(BUCKET), "storage.buckets.update" in got)
    if bad:
        e = Bad(f"{BUCKET} を使わない: " + " / ".join(bad))
        e.probe = dict(probe, bad=bad)  # type: ignore[attr-defined]
        raise e
    print(f"  ここに置く: {BUCKET}（非公開・{' '.join(SHORT_LIVED)} は{KEEP_DAYS}日で消える）")
    return BUCKET, probe


def client_and_creds():
    import google.auth
    from google.cloud import storage

    creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    return storage.Client(project=PROJECT, credentials=creds), creds


def sign(client, bucket: str, req: dict, space: str = "preview",
         ttl: dt.timedelta = GET_TTL, keep_days: int = KEEP_DAYS) -> dict:
    """ttl は見る・消す URL の寿命（上げる URL はどの道も1時間）。"""
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
    # 道に乱数を挟む。バケットは非公開なので道を知っても読めないが、名前から当てられる形にしない
    prefix = f"{space}/{req['name']}/{secrets.token_hex(8)}/"
    b = client.bucket(bucket)
    files = []
    for f in req["files"]:
        name = f["name"]
        blob = b.blob(prefix + name)
        ct = content_type(name)
        files.append(dict(f, object=prefix + name, content_type=ct,
                          put=blob.generate_signed_url(version="v4", method="PUT",
                                                       expiration=PUT_TTL, content_type=ct),
                          get=blob.generate_signed_url(version="v4", method="GET",
                                                       expiration=ttl),
                          delete=blob.generate_signed_url(version="v4", method="DELETE",
                                                          expiration=ttl),
                          # 署名なしの道。**これで 403 になる**ことを作業箱が確かめる（非公開の証明）
                          plain=f"https://storage.googleapis.com/{bucket}/{prefix}{name}"))
    return {"format": "shorts-preview/1", "place": "gcs", "name": req["name"], "bucket": bucket,
            "prefix": prefix, "created_at": now.isoformat(),
            "put_expires": (now + PUT_TTL).isoformat(), "get_expires": (now + ttl).isoformat(),
            "keep_days": keep_days, "files": files}


def gcs_up(req: dict) -> tuple[dict, dict]:
    """(urls.json の中身, 聞いた結果)。place が transfer なら受け渡しの道（短い URL・1日で消える）。"""
    client, creds = client_and_creds()
    bucket, probe = choose_bucket(client, creds)
    if req.get("place") == "transfer":
        probe["transfer"] = ensure_transfer_life(client.bucket(bucket),
                                                 "storage.buckets.update" in (probe.get("bucket") or []))
        return sign(client, bucket, req, space=TRANSFER.rstrip("/"), ttl=TRANSFER_TTL,
                    keep_days=TRANSFER_DAYS), probe
    return sign(client, bucket, req), probe
