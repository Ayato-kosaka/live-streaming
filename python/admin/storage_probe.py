"""置き場（Storage）に、Actions のサービスアカウントで何ができるかを見る。

`drop_photo` が 403 で止まったとき、原因が2つある。**ログの文面では
区別が付かない**（GCS は権限が無いときも「無いかもしれない」と言う）。

  1. バケツの名前が違う（別の置き場を見にいっている）
  2. 名前は合っていて、このサービスアカウントに権限が無い

`testIamPermissions` は「持っているものだけ返す」ので、**何も消さずに**
どちらなのかが分かる。読むだけ。1件も書かない。

ARGS 例:
  {}                                  … 既定のバケツを見る
  {"bucket": "…", "path": "nordic/…"} … 名指しで見る
"""

import os

from _fs import args, log

# drop_photo と同じ決め方。**片方だけ変えると、ここで見たものが当てにならない**
DEFAULT = os.getenv("NORDIC_BUCKET") or (
    f"{os.getenv('BQ_PROJECT_ID') or 'live-streaming-d3cac'}.firebasestorage.app"
)
WANT = [
    "storage.objects.get",
    "storage.objects.list",
    "storage.objects.create",
    "storage.objects.delete",
    "storage.buckets.get",
]


def probe(client, name: str, path: str) -> None:
    log.info("バケツ %s", name)
    b = client.bucket(name)
    try:
        log.info("  ある: %s", b.exists())
    except Exception as e:  # noqa: BLE001 権限が無いときもここに来る
        log.warning("  あるか見にいけません: %s", type(e).__name__)
    try:
        got = set(b.test_iam_permissions(WANT))
    except Exception as e:  # noqa: BLE001
        log.warning("  権限を尋ねられません: %s", type(e).__name__)
        got = set()
    for p in WANT:
        log.info("    %-26s %s", p, "持っている" if p in got else "持っていない")
    if not path:
        return
    try:
        log.info("  その1枚: %s", "ある" if b.blob(path).exists() else "見あたらない")
    except Exception as e:  # noqa: BLE001
        log.warning("  その1枚を見にいけません: %s", type(e).__name__)


def main() -> None:
    from google.auth import default

    a = args()
    creds, proj = default()
    # 誰として動いているか。**鍵ではないので出してよい**（403 の文面にも出る）
    log.info("いま: %s / project=%s", getattr(creds, "service_account_email", "?"), proj)

    from google.cloud import storage

    client = storage.Client(project=os.getenv("BQ_PROJECT_ID") or None)
    path = a.get("path") or ""
    if a.get("bucket"):
        probe(client, a["bucket"], path)
        return
    # 既定と、Firebase の古い組み立て。**どちらに実体があるかを見分ける**
    probe(client, DEFAULT, path)
    probe(client, f"{os.getenv('BQ_PROJECT_ID') or 'live-streaming-d3cac'}.appspot.com", path)

    log.info("--- 読んだだけです。1件も消していません ---")


main()
