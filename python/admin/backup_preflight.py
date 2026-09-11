"""退避の下見。**読むだけ。1バイトも書かない。**

置き場を決めるのに要るものを、いっぺんに測る。

  1. このプロジェクトにいまあるバケット（場所・世代・公開の有無）
  2. サービスアカウントが**バケットを作れるか**（IAM の testPermissions）
  3. 旅の写真の実体（件数と合計バイト。**1日あたりの増え方**）
  4. Firestore のコレクションごとの件数と JSON にしたときのバイト数

**出すのは名前と数だけ。** 書類の中身も、書類IDも、人に結びつく値も出さない
（このリポジトリは公開で、Actions のログも誰でも読める）。

ARGS 例:
  {}                     … 全部見る
  {"skip_firestore": true}
"""

import json

from _fs import args, db, log

PROJECT = "live-streaming-d3cac"
PHOTO_BUCKET = f"{PROJECT}.firebasestorage.app"
PHOTO_PREFIX = "nordic/photos/"


def buckets() -> None:
    from google.cloud import storage

    c = storage.Client(project=PROJECT)
    log.info("--- バケット ---")
    for b in c.list_buckets():
        b.reload()
        pap = (b.iam_configuration or {}).get("publicAccessPrevention", "?")
        ubla = bool((b.iam_configuration or {}).get("uniformBucketLevelAccess", {}).get("enabled"))
        # 誰でも読めるバケットかどうか。**#289 と同じ形を二度作らないため**
        try:
            pol = b.get_iam_policy(requested_policy_version=3)
            openbind = any(
                m in ("allUsers", "allAuthenticatedUsers")
                for bind in pol.bindings
                for m in bind.get("members", [])
            )
        except Exception as e:  # noqa: BLE001
            openbind = f"読めない({type(e).__name__})"
        log.info(
            "  %-46s %-14s %-8s versioning=%s ubla=%s pap=%s public=%s",
            b.name, b.location, b.storage_class, b.versioning_enabled, ubla, pap, openbind,
        )


def can_create() -> None:
    """バケットを作れるか。**作らずに聞くだけ。**"""
    import google.auth
    import google.auth.transport.requests as gt
    import requests

    creds, _ = google.auth.default(
        scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )
    creds.refresh(gt.Request())
    want = [
        "storage.buckets.create",
        "storage.buckets.get",
        "storage.objects.create",
        "storage.objects.list",
        "resourcemanager.projects.get",
    ]
    r = requests.post(
        f"https://cloudresourcemanager.googleapis.com/v1/projects/{PROJECT}:testIamPermissions",
        headers={"Authorization": f"Bearer {creds.token}"},
        json={"permissions": want},
        timeout=30,
    )
    got = set(r.json().get("permissions", [])) if r.ok else set()
    log.info("--- サービスアカウントの権限（プロジェクト） ---")
    if not r.ok:
        log.info("  聞けなかった: HTTP %s", r.status_code)
    for p in want:
        log.info("  %-38s %s", p, "○" if p in got else "✕")


def photos() -> None:
    from google.cloud import storage

    c = storage.Client(project=PROJECT)
    n = 0
    total = 0
    per_day: dict[str, list[int]] = {}
    for o in c.list_blobs(PHOTO_BUCKET, prefix=PHOTO_PREFIX):
        n += 1
        total += o.size or 0
        # nordic/photos/<YYYY-MM-DD>/<id>.<ext>
        parts = o.name.split("/")
        day = parts[2] if len(parts) > 3 else "?"
        d = per_day.setdefault(day, [0, 0])
        d[0] += 1
        d[1] += o.size or 0
    log.info("--- 旅の写真（%s の %s） ---", PHOTO_BUCKET, PHOTO_PREFIX)
    log.info("  %d 件 / %d バイト", n, total)
    if n:
        log.info("  1件あたりの平均 %d バイト", total // n)
    for day in sorted(per_day):
        log.info("  %-12s %4d 件 %10d バイト", day, per_day[day][0], per_day[day][1])


def firestore_sizes() -> None:
    log.info("--- Firestore（件数と JSON にしたときのバイト数。中身は出さない） ---")
    client = db()
    rows = []
    for col in client.collections():
        n = 0
        b = 0
        for d in col.stream():
            n += 1
            b += len(json.dumps(d.to_dict(), ensure_ascii=False, default=str).encode())
        rows.append((col.id, n, b))
    rows.sort(key=lambda r: -r[2])
    tot_n = tot_b = 0
    for name, n, b in rows:
        tot_n += n
        tot_b += b
        log.info("  %-28s %6d 件 %10d バイト", name, n, b)
    log.info("  %-28s %6d 件 %10d バイト", "（合計）", tot_n, tot_b)


def main() -> None:
    a = args()
    for name, fn in (
        ("buckets", buckets),
        ("can_create", can_create),
        ("photos", photos),
        ("firestore", firestore_sizes),
    ):
        if a.get(f"skip_{name}"):
            continue
        try:
            fn()
        except Exception as e:  # noqa: BLE001
            # 1つ落ちても残りは見たい。下見なので、落ちたこと自体が情報
            log.error("%s で落ちた: %s: %s", name, type(e).__name__, e)


main()
