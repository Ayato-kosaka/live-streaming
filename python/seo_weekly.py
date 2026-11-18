"""**Search Console の週の数を API で読んで、#1262 に表を1コメント書く。**（SEO・AIO の PDCA の Check）

    python3 python/seo_weekly.py --dry-run                 # 表を標準出力へ（issue に書かない）
    python3 python/seo_weekly.py                           # 表を #1262 に1コメント
    python3 python/seo_weekly.py --dry-run --inspect 5     # URL 検査を5面だけ（試すとき）
    python3 python/seo_weekly.py --audit audit.txt         # seo_audit の合否を表に添える

終了コード 0=全部読めた / 1=読めなかった節がある（表には「読めなかった」と書いて出す） /
**2=1つも読めなかった**（鍵・権限・API が止まっている。`docs/island-standards.md` §15）。

## なぜ要るか

あやと（2026-11-18）「SEO・AIO はできる対策は全部やって、PDCA 回せるようにしてね」。
それまで Search Console の数は、EC2 の Chrome で画面の字を読んで issue に手で写していた（#1200 #1262）。
**人が読みに行く週は数が残り、行かない週は何も残らない。** Check を人の手から外す。

## 何を読むか（`python/data/seo_targets.json` が決める。語を足すのはそちら）

| 節 | API | 中身 |
| --- | --- | --- |
| 島ぜんたい | searchAnalytics（次元なし） | この週・前週・28日の クリック／表示／平均順位 |
| 狙う語 | searchAnalytics（`query`） | 狙う語ごと（言い換えは束ねる）の 表示・クリック・平均順位（前週比） |
| 面ごと | searchAnalytics（`page`）＋ URL 検査 | 決めた面の 表示・クリック・順位と、Google の台帳での状態 |
| 画像検索 | searchAnalytics（`type: image`） | 画像検索ぜんたいと、「見どころマップ」を含む語・地図の語 |
| 載った面 | URL 検査（sitemap の全面） | Google に載っている面の数（前週比は前の週のコメントの印から） |
| sitemap | sitemaps.list | 最終読み込み・送った数・エラー |

週は「3日前まで」の7日（Search Console の数は2〜3日遅れて固まる）。前週はその前の7日。

## 「0」を答えにしない

- **API が読めなかった節は「読めなかった（理由）」と書く。** 0 と書かない。終了コードも 1 にする
- 読めたのに行が無い語は **「—」**。Search Console は打った人の少ない語を伏せる（#1262 で 13表示のうち
  語が出たのは3語）ので、「表示 0」と「少なくて伏せられた」を見分けられない。見分けられないものを 0 と書かない

## 公開のログ・issue に出さないもの

- **狙う語以外の語は、1つも出さない**（数と表示の合計だけ）。打たれた語には人の名前が混ざりうる
- 鍵の値。認証は `GOOGLE_APPLICATION_CREDENTIALS`（`google-github-actions/auth` が置く）から読むだけで、出さない

## 鍵

新しい秘密は作らない。`FIREBASE_SERVICE_ACCOUNT` のサービスアカウントを Search Console の
`sc-domain:ayato-arigato.com` に「制限付き」で足し（2026-11-18）、プロジェクト `live-streaming-d3cac` で
Search Console API を有効にした（同じ日）。読むだけの scope（`webmasters.readonly`）しか求めない。

## 対照

`python/seo_weekly_selftest.py`。手元の口に偽の Search Console と偽の GitHub を立てて回す（外に出ない）。
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGETS = ROOT / "python" / "data" / "seo_targets.json"

SCOPE = "https://www.googleapis.com/auth/webmasters.readonly"
# 偽の口へ向けるのは対照だけ（`seo_weekly_selftest.py`）。本番では読まない
API = os.environ.get("SEO_WEEKLY_API_BASE", "https://searchconsole.googleapis.com").rstrip("/")
GH_API = os.environ.get("GITHUB_API_URL", "https://api.github.com").rstrip("/")
REPO = os.environ.get("GITHUB_REPOSITORY", "Ayato-kosaka/live-streaming")

# 前の週のコメントを見分ける印。**中の JSON を前週比に使う**（載った面の数は API が履歴を持たない）
MARK = "<!-- seo-weekly v1 "
LAG_DAYS = 3
# URL 検査は 1プロパティ 1分 600回・1日 2,000回まで。1回 5秒ほどかかる（2026-11-18、本物の鍵で 149面に
# 約14分）ので、4本ずつ並べる（1分 50回ほど。上限の 1/10）。1本ごとに少し待つ
INSPECT_PAUSE = 0.25
INSPECT_WORKERS = 4
# 理由の字は長いと表が崩れる。API の返事には鍵は入らない（入るのはサービスアカウントの名前まで）
WHY_MAX = 140


class Unread(Exception):
    """読めなかった。**0 として扱わない**ための印"""


# ---- 字をそろえる ------------------------------------------------------

def norm_q(s: str) -> str:
    """打たれた語を比べる形に。全角半角・大小・空白の違いは同じ語として数える"""
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", s)).lower()


def norm_path(url: str, origin: str) -> str | None:
    """Search Console の URL を島の道に。錨（`#see-…`）は同じ面として束ねる。島の外は None"""
    u = urllib.parse.urlsplit(url)
    o = urllib.parse.urlsplit(origin)
    if u.netloc.lower() != o.netloc.lower():
        return None
    p = u.path or "/"
    return p.rstrip("/") or "/"


# ---- 外に出る ----------------------------------------------------------

def http(method: str, url: str, token: str | None = None, body: dict | None = None,
         timeout: float = 60) -> tuple[int, dict | list | None, dict]:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Accept", "application/json")
    req.add_header("User-Agent", "seo-weekly/1.0")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else None), dict(r.headers)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            got = json.loads(raw)
        except ValueError:
            got = {"error": {"message": raw[:WHY_MAX].decode("utf-8", "replace")}}
        return e.code, got, dict(e.headers or {})


def why(code: int, got) -> str:
    msg = ""
    if isinstance(got, dict):
        err = got.get("error")
        msg = err.get("message", "") if isinstance(err, dict) else str(err or got.get("message", ""))
    msg = re.sub(r"\s+", " ", msg).strip()
    return f"HTTP {code}" + (f": {msg[:WHY_MAX]}" if msg else "")


def google_token() -> str:
    """鍵は `GOOGLE_APPLICATION_CREDENTIALS` から。**値はどこにも出さない**"""
    fake = os.environ.get("SEO_WEEKLY_FAKE_TOKEN")
    if fake is not None:  # 対照だけ
        if not fake:
            raise Unread("鍵が読めない（対照: 空の鍵）")
        return fake
    try:
        import google.auth
        import google.auth.transport.requests
    except ImportError as e:
        raise Unread(f"google-auth が入っていない（{e.name}）") from None
    try:
        creds, _ = google.auth.default(scopes=[SCOPE])
        creds.refresh(google.auth.transport.requests.Request())
    except Exception as e:  # noqa: BLE001 — どの形で落ちても「読めなかった」に寄せる
        raise Unread(f"鍵が読めない（{type(e).__name__}）") from None
    return creds.token


class Console:
    def __init__(self, site: str, token: str):
        self.site = site
        self.token = token
        self.calls = 0

    def _site(self) -> str:
        return urllib.parse.quote(self.site, safe="")

    def query(self, start: date, end: date, dims: list[str], kind: str = "web") -> list[dict]:
        rows: list[dict] = []
        start_row = 0
        while True:
            body = {"startDate": start.isoformat(), "endDate": end.isoformat(), "dimensions": dims,
                    "type": kind, "rowLimit": 25000, "startRow": start_row}
            code, got, _ = http("POST", f"{API}/webmasters/v3/sites/{self._site()}/searchAnalytics/query",
                                self.token, body)
            self.calls += 1
            if code != 200 or not isinstance(got, dict):
                raise Unread(why(code, got))
            page = got.get("rows") or []
            rows += page
            if len(page) < 25000:
                return rows
            start_row += len(page)

    def sitemaps(self) -> list[dict]:
        code, got, _ = http("GET", f"{API}/webmasters/v3/sites/{self._site()}/sitemaps", self.token)
        self.calls += 1
        if code != 200 or not isinstance(got, dict):
            raise Unread(why(code, got))
        return got.get("sitemap") or []

    def inspect(self, url: str) -> dict:
        body = {"inspectionUrl": url, "siteUrl": self.site, "languageCode": "ja"}
        code, got, _ = http("POST", f"{API}/v1/urlInspection/index:inspect", self.token, body)
        self.calls += 1
        if code != 200 or not isinstance(got, dict):
            raise Unread(why(code, got))
        return (got.get("inspectionResult") or {}).get("indexStatusResult") or {}


def sitemap_urls(origin: str) -> list[str]:
    """本番の sitemap.xml の `<loc>`。読めなければ Unread"""
    req = urllib.request.Request(f"{origin}/sitemap.xml", headers={"User-Agent": "seo-weekly/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            xml = r.read().decode("utf-8", "replace")
    except (urllib.error.URLError, TimeoutError) as e:
        raise Unread(f"sitemap が読めない（{getattr(e, 'code', '') or type(e).__name__}）") from None
    locs = [unicodedata.normalize("NFC", m.strip()) for m in re.findall(r"<loc>\s*([^<]+?)\s*</loc>", xml)]
    if not locs:
        raise Unread("sitemap に `<loc>` が1つも無い")
    seen: dict[str, None] = {}
    for u in locs:
        seen.setdefault(u, None)
    return list(seen)


# ---- 数える ------------------------------------------------------------

def weeks(today: date) -> dict[str, tuple[date, date]]:
    end = today - timedelta(days=LAG_DAYS)
    return {
        "now": (end - timedelta(days=6), end),
        "prev": (end - timedelta(days=13), end - timedelta(days=7)),
        "d28": (end - timedelta(days=27), end),
    }


def total(rows: list[dict]) -> dict:
    """行を足す。順位は表示で重み付けした平均（Search Console の画面と同じ平均のしかた）"""
    imp = sum(r.get("impressions", 0) for r in rows)
    clk = sum(r.get("clicks", 0) for r in rows)
    pos = (sum(r.get("position", 0) * r.get("impressions", 0) for r in rows) / imp) if imp else None
    return {"impressions": imp, "clicks": clk, "position": pos, "rows": len(rows)}


def by_query(rows: list[dict]) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    for r in rows:
        out.setdefault(norm_q((r.get("keys") or [""])[0]), []).append(r)
    return out


def by_page(rows: list[dict], origin: str) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    for r in rows:
        p = norm_path((r.get("keys") or [""])[0], origin)
        if p is not None:
            out.setdefault(p, []).append(r)
    return out


def pick(groups: dict[str, list[dict]], queries: list[str]) -> dict:
    want = {norm_q(q) for q in queries}
    return total([r for k, rs in groups.items() if k in want for r in rs])


def containing(groups: dict[str, list[dict]], words: list[str]) -> dict:
    ws = [norm_q(w) for w in words]
    return total([r for k, rs in groups.items() if any(w in k for w in ws) for r in rs])


# ---- 表にする ----------------------------------------------------------

def num(n: int | float) -> str:
    return f"{n:,}"


def pos_s(p: float | None) -> str:
    return "—" if p is None else f"{p:.1f}位"


def cell(now: dict | None, prev: dict | None, key: str) -> str:
    """この週（前週）。行が無ければ「—」。**0 は行があって 0 のときだけ**"""
    def one(t: dict | None) -> str:
        if t is None:
            return "読めなかった"
        if not t["rows"]:
            return "—"
        return pos_s(t["position"]) if key == "position" else num(t[key])
    a, b = one(now), one(prev)
    # どちらの週も行が無いなら「—」だけ（15語の表がほとんど「—（前週 —）」で埋まると、動いた行が見えない）
    return "—" if a == b == "—" else f"{a}（前週 {b}）"


def table(head: list[str], rows: list[list[str]]) -> str:
    out = ["| " + " | ".join(head) + " |", "|" + "---|" * len(head)]
    out += ["| " + " | ".join(c.replace("|", "／") for c in r) + " |" for r in rows]
    return "\n".join(out)


STATE_JA = {
    "PASS": "載っている",
    "NEUTRAL": "載っていない",
    "FAIL": "載っていない（問題あり）",
    "PARTIAL": "載っている（一部に問題）",
    "VERDICT_UNSPECIFIED": "分からない",
}


def inspect_word(st: dict) -> str:
    v = STATE_JA.get(st.get("verdict", ""), st.get("verdict", "") or "分からない")
    bits = []
    cov = st.get("coverageState")
    if cov and st.get("verdict") != "PASS":
        bits.append(cov)
    if st.get("indexingState") in ("BLOCKED_BY_META_TAG", "BLOCKED_BY_HTTP_HEADER"):
        bits.append("noindex")
    crawl = (st.get("lastCrawlTime") or "")[:10]
    if crawl:
        bits.append(f"最終クロール {crawl}")
    g, u = st.get("googleCanonical"), st.get("userCanonical")
    if g and u and g.rstrip("/") != u.rstrip("/"):
        bits.append(f"Google の正は {g}")
    return v + (f"（{'・'.join(bits)}）" if bits else "")


def read_prev(issue: int, repo: str, gh_token: str | None) -> dict | None:
    """前の週のコメントの印（JSON）。無い・読めないなら None（前週比を「—」にする）"""
    if not (repo and gh_token):
        return None
    last = None
    for page in range(1, 20):
        code, got, _ = http("GET", f"{GH_API}/repos/{repo}/issues/{issue}/comments?per_page=100&page={page}",
                            gh_token)
        if code != 200 or not isinstance(got, list):
            return last
        for c in got:
            body = c.get("body") or ""
            i = body.find(MARK)
            if i >= 0:
                j = body.find("-->", i)
                try:
                    last = json.loads(body[i + len(MARK):j].strip())
                except ValueError:
                    pass
        if len(got) < 100:
            return last
    return last


def audit_lines(path: str | None) -> tuple[list[str], bool]:
    """`seo_audit.py --expect` の出力から、合否の行だけを拾う。（行, 読めたか）"""
    if not path:
        return [], True
    try:
        text = Path(path).read_text(encoding="utf-8")
    except OSError:
        return ["seo_audit の結果が読めなかった"], False
    i = text.find("== 合否")
    if i < 0:
        tail = [ln for ln in text.strip().splitlines() if ln.strip()][-1:] or ["（出力が空）"]
        return [f"seo_audit が合否まで行かなかった: {tail[0][:WHY_MAX]}"], False
    out = []
    for ln in text[i:].splitlines()[1:]:
        if ln.startswith("==") or not ln.strip():
            break
        out.append(ln.strip())
    return out, True


def build(cfg: dict, today: date, con: Console | None, auth_err: str | None,
          prev_mark: dict | None, inspect_n: int | None, audit: str | None) -> tuple[str, int, dict]:
    origin = cfg["origin"]
    w = weeks(today)
    unread: list[str] = []
    mark: dict = {"end": w["now"][1].isoformat()}

    def get(name: str, fn):
        if con is None:
            unread.append(name)
            return None
        try:
            return fn()
        except Unread as e:
            unread.append(f"{name}: {e}")
            return None

    q_now = get("語（この週）", lambda: by_query(con.query(*w["now"], ["query"])))
    q_prev = get("語（前週）", lambda: by_query(con.query(*w["prev"], ["query"])))
    p_now = get("面（この週）", lambda: by_page(con.query(*w["now"], ["page"]), origin))
    p_prev = get("面（前週）", lambda: by_page(con.query(*w["prev"], ["page"]), origin))
    t = {k: get(f"島ぜんたい（{k}）", lambda k=k: total(con.query(*w[k], []))) for k in w}
    i_now = get("画像検索（この週）", lambda: by_query(con.query(*w["now"], ["query"], "image")))
    i_prev = get("画像検索（前週）", lambda: by_query(con.query(*w["prev"], ["query"], "image")))
    sm = get("sitemap", con.sitemaps if con else None)

    # 載った面: sitemap の全面を URL 検査
    insp: dict[str, dict] = {}
    insp_err: list[str] = []
    urls = get("sitemap.xml（本番）", lambda: sitemap_urls(origin))
    want_pages = [origin + (p["path"] if p["path"] != "/" else "") for p in cfg["pages"]]
    if urls is not None and con is not None:
        todo = list(dict.fromkeys([u for u in want_pages] + urls))
        if inspect_n is not None:
            todo = todo[:inspect_n]
        def one(u: str) -> tuple[str, dict | None, str | None]:
            try:
                return u, con.inspect(u), None
            except Unread as e:
                return u, None, str(e)
            finally:
                time.sleep(INSPECT_PAUSE)

        # 1本目だけ先に。権限・止められた（401/403/429）は、続けても同じ答えなので、そこで止める
        first = one(todo[0]) if todo else None
        rest = todo[1:] if first and not (first[2] and re.match(r"HTTP (401|403|429)", first[2])) else []
        with ThreadPoolExecutor(INSPECT_WORKERS) as ex:
            for u, st, err in ([first] if first else []) + list(ex.map(one, rest)):
                if err:
                    insp_err.append(err)
                else:
                    insp[u] = st
        if insp_err:
            unread.append(f"URL 検査: {len(insp_err)}面 読めなかった（{insp_err[0]}）")

    def md(r: tuple[date, date]) -> str:
        return f"{r[0].month}/{r[0].day}〜{r[1].month}/{r[1].day}"

    out: list[str] = []
    out.append(f"## 検索の週の数（{w['now'][0].year}年 {md(w['now'])}・前週 {md(w['prev'])}）")
    out.append("")
    out.append(f"Search Console（`{cfg['site']}`）を API で読んだ。数が固まるのを待って、{LAG_DAYS}日前までの7日。"
               f"読みかたと「効いた／効いていない」の決めかたは [`docs/seo.md`](https://github.com/{REPO}/blob/master/docs/seo.md) の Check。")
    if auth_err:
        out.append("")
        out.append(f"**読めなかった**: {auth_err}。数はどれも書いていない（0 ではない）。")

    # 1. 島ぜんたい
    out.append("\n### 1. 島ぜんたい（ウェブ検索）\n")
    def tot(k: str, key: str) -> str:
        v = t.get(k)
        if v is None:
            return "読めなかった"
        return pos_s(v["position"]) if key == "position" else num(v[key])
    out.append(table(["", "この週", "前週", "28日"], [
        [lbl, tot("now", key), tot("prev", key), tot("d28", key)]
        for lbl, key in (("表示", "impressions"), ("クリック", "clicks"), ("平均順位", "position"))
    ]))

    # 2. 狙う語
    out.append(f"\n### 2. 狙う語（{len(cfg['targets'])}語・`python/data/seo_targets.json`）\n")
    rows = []
    for tg in cfg["targets"]:
        a = pick(q_now, tg["queries"]) if q_now is not None else None
        b = pick(q_prev, tg["queries"]) if q_prev is not None else None
        rows.append([tg["label"], f"`{tg['page']}`", cell(a, b, "impressions"), cell(a, b, "clicks"),
                     cell(a, b, "position")])
    out.append(table(["語", "狙う面", "表示", "クリック", "平均順位"], rows))
    if q_now is not None:
        hit = {norm_q(q) for tg in cfg["targets"] for q in tg["queries"]}
        others = [r for k, rs in q_now.items() if k not in hit for r in rs]
        o = total(others)
        # 狙う語以外は、語そのものを出さない（人の名前が混ざりうる）。数だけ
        out.append(f"\n狙う語以外: この週 {num(len({norm_q((r.get('keys') or [''])[0]) for r in others}))}語・"
                   f"表示 {num(o['impressions'])}・クリック {num(o['clicks'])}（語は出さない。Search Console の画面で見る）。"
                   "「—」は行が無い＝表示が無いか、打った人が少なくて Search Console が伏せた。")

    # 3. 面ごと
    out.append("\n### 3. 面ごと\n")
    rows = []
    for pg in cfg["pages"]:
        a = total(p_now.get(pg["path"], [])) if p_now is not None else None
        b = total(p_prev.get(pg["path"], [])) if p_prev is not None else None
        st = insp.get(origin + (pg["path"] if pg["path"] != "/" else ""))
        rows.append([f"{pg['label']} `{pg['path']}`", cell(a, b, "impressions"), cell(a, b, "clicks"),
                     cell(a, b, "position"), inspect_word(st) if st is not None else "読めなかった"])
    out.append(table(["面", "表示", "クリック", "平均順位", "Google の台帳（URL 検査）"], rows))
    if p_now is not None:
        top = sorted(((k, total(v)) for k, v in p_now.items()), key=lambda x: -x[1]["impressions"])[:5]
        if top:
            out.append("\nこの週に表示のあった面（上位5）: " + "・".join(
                f"`{k}` {num(v['impressions'])}" for k, v in top))

    # 4. 画像検索
    out.append("\n### 4. 画像検索\n")
    rows = []
    a = total([r for rs in i_now.values() for r in rs]) if i_now is not None else None
    b = total([r for rs in i_prev.values() for r in rs]) if i_prev is not None else None
    rows.append(["画像検索ぜんたい", cell(a, b, "impressions"), cell(a, b, "clicks"), cell(a, b, "position")])
    words = cfg.get("image_contains") or []
    if words:
        a = containing(i_now, words) if i_now is not None else None
        b = containing(i_prev, words) if i_prev is not None else None
        rows.append([f"「{'」「'.join(words)}」を含む語", cell(a, b, "impressions"), cell(a, b, "clicks"),
                     cell(a, b, "position")])
    for tg in cfg["targets"]:
        if tg.get("image"):
            a = pick(i_now, tg["queries"]) if i_now is not None else None
            b = pick(i_prev, tg["queries"]) if i_prev is not None else None
            rows.append([tg["label"], cell(a, b, "impressions"), cell(a, b, "clicks"), cell(a, b, "position")])
    out.append(table(["", "表示", "クリック", "平均順位"], rows))

    # 5. 載った面
    out.append("\n### 5. Google に載った面（sitemap の面を URL 検査）\n")
    sm_insp = {u: insp[u] for u in (urls or []) if u in insp}
    if urls is None or not sm_insp:
        out.append("**読めなかった**（" + ("sitemap.xml" if urls is None else "URL 検査") + "）。0 ではない。")
    else:
        on = [u for u, s in sm_insp.items() if s.get("verdict") == "PASS"]
        mark["indexed"], mark["inspected"], mark["sitemap"] = len(on), len(sm_insp), len(urls)
        pv = prev_mark or {}
        prev_s = (f"（前週 {pv['indexed']}/{pv['inspected']}・{pv.get('end', '')} の表）"
                  if isinstance(pv.get("indexed"), int) and isinstance(pv.get("inspected"), int) else "（前週の表が無い）")
        part = "" if len(sm_insp) == len(urls) else f"（sitemap {len(urls)}面のうち {len(sm_insp)}面を検査）"
        out.append(f"載っている **{len(on)}/{len(sm_insp)}**{part}{prev_s}")
        # 「載っている」は URL 検査の verdict が PASS（Search Console の「有効」）。内訳の字（coverageState）も
        # 並べて、数が何から来たかを読めるようにする（画面の「ページ」の表は数日遅れて固まるので、数が合わないことがある）
        for label, want in (("載っている内訳", True), ("載っていない理由", False)):
            n: dict[str, int] = {}
            for st in sm_insp.values():
                if (st.get("verdict") == "PASS") == want:
                    k = st.get("coverageState") or st.get("verdict") or "分からない"
                    n[k] = n.get(k, 0) + 1
            if n:
                out.append(f"\n{label}: " + "・".join(f"{k} {v}" for k, v in sorted(n.items(), key=lambda x: -x[1])))
        odd = [(u, s.get("googleCanonical")) for u, s in sm_insp.items()
               if s.get("googleCanonical") and s.get("userCanonical")
               and s["googleCanonical"].rstrip("/") != s["userCanonical"].rstrip("/")]
        if odd:
            out.append("\nGoogle が別の URL を正と見ている面: " + "・".join(
                f"`{norm_path(u, origin)}` → {g}" for u, g in odd[:5]) + (" …" if len(odd) > 5 else ""))

    # 6. sitemap
    out.append("\n### 6. sitemap\n")
    if sm is None:
        out.append("**読めなかった**。")
    elif not sm:
        out.append("Search Console に送った sitemap が1本も無い。")
    else:
        for s in sm:
            sub = sum(int(c.get("submitted", 0) or 0) for c in s.get("contents") or [])
            out.append(f"- `{s.get('path', '')}`: 最終読み込み {(s.get('lastDownloaded') or '—')[:10]}・"
                       f"送った {num(sub)}面・エラー {s.get('errors', 0)}・警告 {s.get('warnings', 0)}"
                       + ("・**読み込み待ち**" if s.get("isPending") else ""))

    # 7. サイトの作り（seo_audit の線）
    a_lines, a_ok = audit_lines(audit)
    if audit:
        out.append("\n### 7. サイトの作り（`seo_audit.py --expect prod` を本番へ）\n")
        if not a_ok:
            unread.append("seo_audit")
        # seo_audit の印は ○（通った）× （外れた）？（測れなかった）。頭の「（読めた面）」も1本に数える
        bad = [ln for ln in a_lines if ln.startswith(("×", "？"))]
        good = [ln for ln in a_lines if ln.startswith("○")]
        if a_ok and not bad:
            out.append(f"線 {len(good)}本、ぜんぶ通った。")
        else:
            out.append(f"通った {len(good)}本・**外れた／測れなかった {len(bad)}本**:")
            out += [f"- {ln}" for ln in (bad or a_lines)[:12]]

    if unread:
        out.append("\n### 読めなかったもの\n")
        out += [f"- {u}" for u in unread]
    out.append("")
    out.append(f"{MARK}{json.dumps(mark, ensure_ascii=False)} -->")
    out.append("---")
    out.append("_毎週 `seo_weekly.yml` が書いた表。手で押すときは Actions の「検索の週の数」_")
    body = "\n".join(out)
    # 1つも読めなかった（鍵・権限）なら 2。一部なら 1
    code = 2 if (auth_err or con is None) else (1 if unread else 0)
    return body, code, mark


def post(issue: int, repo: str, token: str, body: str) -> str:
    code, got, _ = http("POST", f"{GH_API}/repos/{repo}/issues/{issue}/comments", token, {"body": body})
    if code not in (200, 201) or not isinstance(got, dict):
        raise Unread(f"issue に書けなかった（{why(code, got)}）")
    return got.get("html_url", "")


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="Search Console の週の数を読んで、issue に表を1コメント書く")
    ap.add_argument("--dry-run", action="store_true", help="issue に書かずに、表を標準出力へ")
    ap.add_argument("--inspect", type=int, metavar="N", help="URL 検査を N 面まで（既定は sitemap の全面）")
    ap.add_argument("--audit", metavar="FILE", help="`seo_audit.py --expect prod` の出力。合否の行を表に添える")
    ap.add_argument("--today", help="今日の日付（対照用。YYYY-MM-DD）")
    ap.add_argument("--targets", default=str(TARGETS))
    a = ap.parse_args(argv)

    cfg = json.loads(Path(a.targets).read_text(encoding="utf-8"))
    today = date.fromisoformat(a.today) if a.today else datetime.now(timezone.utc).date()
    repo = os.environ.get("GITHUB_REPOSITORY", "Ayato-kosaka/live-streaming")
    gh_token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")

    auth_err = None
    con = None
    try:
        con = Console(cfg["site"], google_token())
    except Unread as e:
        auth_err = str(e)

    prev = read_prev(cfg["issue"], repo, gh_token)
    body, code, mark = build(cfg, today, con, auth_err, prev, a.inspect, a.audit)

    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write(body + "\n")
    if a.dry_run:
        print(body)
    else:
        if not gh_token:
            print("::error::GITHUB_TOKEN が無いので issue に書けない", file=sys.stderr)
            return 2
        try:
            url = post(cfg["issue"], repo, gh_token, body)
        except Unread as e:
            print(f"::error::{e}", file=sys.stderr)
            return 2
        print(f"#{cfg['issue']} に書いた: {url}")
    print(f"API を {con.calls if con else 0}回・終了コード {code}"
          f"（{ {0: '全部読めた', 1: '読めなかった節がある', 2: '1つも読めなかった'}[code] }）", file=sys.stderr)
    return code


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
