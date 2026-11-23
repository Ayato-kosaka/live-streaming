"""島の口（`islandApi`）が、直近何日に何回呼ばれたかを数える。**読むだけ。**

なぜ要るか。口を畳む前に「画面から呼ぶ所が0」を確かめても、それは
**このリポジトリの中**の話で、古い版の画面を開いたままの端末・手で叩く道具・
別のワークフローは数えていない。消す前に、本番に実際に来ている数を見る（#1281）。

数えるのは Cloud Run の**要求のログ**（`run.googleapis.com/requests`）。
Functions の v2 は Cloud Run の上で動くので、1回呼ばれるたびに1行残る。
既定の置き場（`_Default`）は30日で落ちるので、**30日より前は数えられない。**
出す表に「いちばん古い行」を添えて、窓が本当に30日ぶんあるかを読めるようにする。

ARGS 例:
  {}                                     既定の口（企画・古い付箋・いま）を30日
  {"days": 7}
  {"paths": ["nextplans", "notes"]}      数える口の頭（`/island-api/` の次の段）

**このリポジトリは公開で、Actions のログも誰でも読める。** 出すのは
口の形（id は `:id` に畳む）・回数・応答の番号・呼んだ側の種類（ブラウザ／
Python／Node／curl／その他）・ブラウザなら開いていた面の道（問い合わせの字は落とす）
・日付だけ。**IP・呼んだ人・本文・書類IDは1つも出さない。**
"""

import json
import os
import re
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

from _fs import args, log

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import BQ_PROJECT_ID  # noqa: E402

API = "https://logging.googleapis.com/v2/entries:list"
SCOPE = "https://www.googleapis.com/auth/logging.read"
SERVICE = "islandapi"
DEFAULT_PATHS = ["nextplans", "notes", "current"]
# 1分に60回までしか引けない（entries.list の上限）。1頁ごとに少し待つ
PAGE_WAIT = 1.1
MAX_PAGES = 400

ID_SEG = re.compile(r"^[A-Za-z0-9_-]{6,}$")
KNOWN = {"themes", "heart", "status", "videos", "archive", "pic", "reply"}


def shape(path: str) -> str:
    """id を `:id` に畳んだ口の形。頭の `/islandApi` と `/island-api` は落とす。

    Hosting から回ってきた要求は、Cloud Run には `/islandApi/island-api/…` で
    届く（2026-11-23 の下見で確かめた）。落とさないと口の頭が `islandApi` に
    なって、数える口に1件も当たらない（はじめの1回はそれで「0通り」と出た）。"""
    p = re.sub(r"^(/islandApi)?(/island-api)?", "", path) or "/"
    segs = []
    for i, s in enumerate(p.split("/")):
        if i >= 2 and s not in KNOWN and ID_SEG.match(s):
            segs.append(":id")
        else:
            segs.append(s)
    return "/".join(segs)


def who(ua: str) -> str:
    u = (ua or "").lower()
    if not u:
        return "なし"
    if "python" in u:
        return "Python"
    if "node" in u or "undici" in u or "axios" in u:
        return "Node"
    if "curl" in u:
        return "curl"
    if "headlesschrome" in u or "playwright" in u:
        return "自動のブラウザ"
    if "mozilla" in u:
        return "ブラウザ"
    return "その他"


def page_of(referer: str) -> str:
    if not referer:
        return "—"
    r = urlparse(referer)
    return f"{r.netloc}{r.path}"[:80]


def main() -> None:
    a = args()
    days = int(a.get("days", 30))
    heads = [str(x) for x in a.get("paths", DEFAULT_PATHS)]
    for h in heads:
        if not re.fullmatch(r"[a-z0-9_-]+", h):
            log.error("口の頭に使えるのは英小文字・数字・-_ だけです: %r", h)
            raise SystemExit(2)

    import google.auth
    from google.auth.transport.requests import AuthorizedSession

    creds, _ = google.auth.default(scopes=[SCOPE])
    sess = AuthorizedSession(creds)
    since = (datetime.now(timezone.utc) - timedelta(days=days)).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )
    base = [
        'resource.type="cloud_run_revision"',
        f'resource.labels.service_name="{SERVICE}"',
        f'logName="projects/{BQ_PROJECT_ID}/logs/run.googleapis.com%2Frequests"',
    ]

    def pull(filt: str, order: str, limit: int, pages: int):
        token = None
        n = 0
        for _ in range(pages):
            body = {
                "resourceNames": [f"projects/{BQ_PROJECT_ID}"],
                "filter": filt,
                "orderBy": f"timestamp {order}",
                "pageSize": limit,
            }
            if token:
                body["pageToken"] = token
            res = sess.post(API, json=body, timeout=90)
            if res.status_code == 429:
                time.sleep(20)
                continue
            if res.status_code != 200:
                log.error("Cloud Logging が %d を返しました", res.status_code)
                log.error("%s", res.text[:300])
                raise SystemExit(2)
            j = res.json()
            for e in j.get("entries", []):
                n += 1
                yield e
            token = j.get("nextPageToken")
            if not token:
                return
            time.sleep(PAGE_WAIT)
        log.warning("頁の上限（%d）で切りました。数は下限です", pages)

    if a.get("probe"):
        # 何が残っているかの下見。直近2時間の、この口の行を種類ごとに数える
        near = (datetime.now(timezone.utc) - timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
        kinds: Counter = Counter()
        for e in pull(" AND ".join(base[:2] + [f'timestamp>="{near}"']), "desc", 200, 3):
            h = e.get("httpRequest") or {}
            ln = e.get("logName", "").rsplit("/", 1)[-1]
            kinds[(ln, shape(urlparse(h.get("requestUrl", "")).path) if h else "—")] += 1
        for (ln, p), n in kinds.most_common(30):
            log.info("  %-40s %-30s %d", ln, p, n)
        return

    # 窓の確かめ: この口に残っている、いちばん古い要求の行
    # （時刻の縛りが無いと既定の窓しか探さないので、数える窓と同じ頭を付ける）
    oldest = next(
        iter(pull(" AND ".join(base + [f'timestamp>="{since}"']), "asc", 1, 30)),
        None,
    )
    log.info(
        "残っている要求のログのいちばん古い行: %s（数える窓は %s から）",
        (oldest or {}).get("timestamp", "なし")[:19],
        since[:10],
    )

    alt = "|".join(heads)
    filt = " AND ".join(
        base
        + [
            f'timestamp>="{since}"',
            f'httpRequest.requestUrl=~"/({alt})([/?]|$)"',
        ]
    )
    counts: Counter = Counter()
    first: dict = {}
    last: dict = {}
    callers: dict = defaultdict(Counter)
    pages: dict = defaultdict(Counter)
    for e in pull(filt, "asc", 1000, MAX_PAGES):
        h = e.get("httpRequest") or {}
        url = urlparse(h.get("requestUrl", ""))
        s = shape(url.path)
        head = s.split("/")[1] if s.count("/") >= 1 else ""
        if head not in heads:
            continue
        q = sorted(k for k in parse_qs(url.query).keys() if k in {"mine", "archived", "events"})
        key = (h.get("requestMethod", "?"), s + (("?" + "&".join(q)) if q else ""), str(h.get("status", "?")))
        counts[key] += 1
        day = e.get("timestamp", "")[:10]
        first.setdefault(key, day)
        last[key] = day
        c = who(h.get("userAgent", ""))
        callers[key][c] += 1
        if c in ("ブラウザ", "自動のブラウザ"):
            pages[key][page_of(h.get("referer", ""))] += 1

    log.info("直近 %d日・口の頭 %s: %d通り", days, ",".join(heads), len(counts))
    if not counts:
        log.info("1回も呼ばれていません")
    for key in sorted(counts, key=lambda k: (k[1], k[0], k[2])):
        m, p, st = key
        log.info(
            "  %-6s %-34s %s  %5d回  %s〜%s  呼んだ側 %s",
            m,
            p,
            st,
            counts[key],
            first[key],
            last[key],
            json.dumps(dict(callers[key]), ensure_ascii=False),
        )
        if pages[key]:
            top = pages[key].most_common(5)
            log.info("         開いていた面 %s", json.dumps(dict(top), ensure_ascii=False))


main()
