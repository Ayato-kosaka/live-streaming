"""Cloud Functions のログを読む。**読むだけ。**

なぜ要るか。`collectLiveChat`（配信中にコメントを溜める、#153）のような
**5分おきに勝手に動くもの**は、壊れても誰も気づかない。溜まっていないとき、
原因は「鍵が無い」「トークンが取れない」「配信を見つけられない」「YouTube が
返さない」のどれかで、**書き分けたログを見ないと区別がつかない。**
Firestore を数えるだけでは「0件」しか分からず、そこから先は憶測になる。

gcloud はこの箱に無いので、Cloud Logging の REST を素で叩く。
認証は GitHub Actions のサービスアカウント（`FIREBASE_SERVICE_ACCOUNT`）。
**新しい依存は足さない**（google-auth は google-cloud-bigquery が連れてくる）。

ARGS 例:
  {"name": "collectLiveChat"}                   直近6時間
  {"name": "collectLiveChat", "hours": 24}
  {"name": "collectLiveChat", "hours": 24, "limit": 200}
  {"contains": "鍵"}                            本文で絞る

**このリポジトリは公開で、Actions のログも誰でも読める。** 出るのは
Functions が自分で書いた文なので、鍵や個人を書いていない限り安全だが、
1行 300文字で切ってある。
"""

import json
import os
import sys
from datetime import datetime, timedelta, timezone

from _fs import args, log

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import BQ_PROJECT_ID  # noqa: E402

API = "https://logging.googleapis.com/v2/entries:list"
SCOPE = "https://www.googleapis.com/auth/logging.read"


def main() -> None:
    a = args()
    name = a.get("name", "collectLiveChat")
    hours = int(a.get("hours", 6))
    limit = min(int(a.get("limit", 100)), 500)
    contains = a.get("contains")

    import google.auth
    from google.auth.transport.requests import AuthorizedSession

    creds, _ = google.auth.default(scopes=[SCOPE])
    sess = AuthorizedSession(creds)

    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )
    parts = [
        'resource.type="cloud_run_revision"',
        f'resource.labels.service_name="{name.lower()}"',
        f'timestamp>="{since}"',
    ]
    if contains:
        parts.append(f'textPayload:"{contains}" OR jsonPayload.message:"{contains}"')
    body = {
        "resourceNames": [f"projects/{BQ_PROJECT_ID}"],
        "filter": " AND ".join(parts),
        "orderBy": "timestamp desc",
        "pageSize": limit,
    }

    res = sess.post(API, json=body, timeout=60)
    if res.status_code != 200:
        # 権限が無いのも「分かったこと」なので、隠さずそのまま出す
        log.error("Cloud Logging が %d を返しました", res.status_code)
        log.error("%s", res.text[:500])
        raise SystemExit(2)

    entries = res.json().get("entries", [])
    log.info("%s の直近 %d時間: %d行", name, hours, len(entries))
    if not entries:
        log.info("1行もありません。**そもそも起動していない**か、名前が違います。")
        log.info("（scheduled function の名前は index.ts の export 名。小文字で引く）")
        return

    for e in reversed(entries):  # 古い順に読めるほうが追いやすい
        msg = e.get("textPayload")
        if msg is None:
            p = e.get("jsonPayload") or {}
            msg = p.get("message") or json.dumps(p, ensure_ascii=False)
        log.info("  %s  %s  %s", e.get("timestamp", "")[:19], e.get("severity", ""), str(msg)[:300])


main()
