"""**PR に札 `出す` を付けたら、緑になりしだいマージして本番に出し、出たことを確かめる**（`.github/workflows/ship.yml` の中身）。

    python3 python/ship.py look [--pr N] [--dry-run]   # 判断だけ。**1バイトも書かない**
    python3 python/ship.py go --prs "12 34"            # 出す（マージ → 配り → 待つ → 突き合わせ → 1コメント）

## なぜ要るか（#1117）

それまでは、CI の待ち・マージ・デプロイの起動・デプロイの待ち・本番との突き合わせを
**セッションが何十回も API を叩き、長いログを読んで**回していた。待っているあいだも
トークンは減る。Actions は無料なので、**待ちと突き合わせは全部ここでやる。**
セッションに残るのは「札を1つ付ける」と「結果の1行を読む」だけ。

**札を付けることが「出す」という判断。** 判断そのものは今までどおりセッションの責務で、
ここは「緑なら出す」を機械的に回すだけ。何も決めない。

## 判断（全部そろったときだけ進む）

| 見るもの | そろわないとき |
| --- | --- |
| PR が open・札 `出す`・同じリポジトリの枝・下書きでない | **何もしない**（黙る） |
| base が master | **落とす**（1行書いて札を替える） |
| 手で出す面に触れていない（下の `HAND`） | **落とす** |
| head の check が自分以外ぜんぶ success か skipped | 走っていれば**黙って終わる**（次の完了でまた起きる）。赤なら**落とす** |
| 枝でほかの run が走っていない | **黙って終わる**（ショートの取り込みの返し先が消える。`docs/island-misses.md` #291） |
| mergeable | 分からなければ黙る。ぶつかっていれば**落とす** |

**落としたら札 `出す` を外す。** 付けたままだと、ほかの PR の CI が終わるたびに
同じ「赤い」を書き続ける。直したら付け直す——それが「もう一度出す」という判断になる。

## 札は `待ち-システム`（`待ち-こちら` ではない）

依頼文には `待ち-こちら` とあったが、2026-09-23 に `待ち-システム` へ改名してある
（`docs/island-tickets.md` 1章。「こちら」は読む人から見てどちらか分からない、という
あやとの指摘）。`python/ticket_labels.py` が読むのも `待ち-システム` のほう。

終了コード 0=やることをやった（黙った回も含む）/ 1=出そうとして落ちた / 2=GitHub が読めない。
"""

from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))

# **閉じる issue の読みかたは借りる。** 書き写すと、`Closes Check` が
# 「閉じる」と読む書きかたと、ここが閉じたと思う書きかたが黙ってずれる
from closes_check import closed_by  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
WFDIR = REPO / ".github" / "workflows"
API = "https://api.github.com"

OWN = ".github/workflows/ship.yml"
BASE = "master"

LABEL = "出す"
LABEL_COLOR = "006b75"
LABEL_DESC = "付けると、checks が緑になりしだい ship.yml がマージして本番に出し、出たかを確かめる"
WAIT_LABEL = "待ち-システム"

# **配り先。** `CLAUDE.md` の表（site/ public/ app/ → Hosting、functions/ → Functions）に、
# Expo の書き出しへ入るものを足してある。`app/` は `@/lib` `@/components` `@/hooks` を
# 読んでいて（`app/` の import を数えた）、そこだけ直した PR を「配り先なし」にすると
# **直したのに出ていない**ものができる。`firebase.json` は Hosting が配る
# （Functions の設定も持つが、そこを変えるのは稀なので、変えたら手で Functions も押す）。
ROUTES: dict[str, dict] = {
    "hosting": {
        "file": "firebase-hosting-deploy-prod.yml",
        "name": "Hosting",
        "prefixes": ("site/", "public/", "app/", "components/", "hooks/", "constants/",
                     "lib/", "assets/", "web/"),
        "files": ("app.json", "metro.config.js", "package.json", "package-lock.json",
                  "tsconfig.json", "firebase.json", "firestore.indexes.json"),
    },
    "functions": {
        "file": "firebase-functions-deploy.yml",
        "name": "Functions",
        "prefixes": ("functions/",),
        "files": (),
    },
}

# Expo の書き出しに入るもの（entry の名前が変わったかを見る理由になる）
EXPO = ("app/", "components/", "hooks/", "constants/", "lib/", "assets/", "web/",
        "app.json", "metro.config.js", "package.json", "package-lock.json", "tsconfig.json")

# **ここでは出さないもの。** 札が付いていても、1行書いて手の道へ返す。
#
# - ワークフロー: GITHUB_TOKEN は `workflows` の権限を持てないので、
#   `.github/workflows/` を触った PR は**マージの時点で GitHub に断られる**
# - ルール: 配る前に手で dry-run する面（`/island-ship` の手で回す手順）。
#   Hosting を押すと本番のルールがそのまま差し替わる
HAND: tuple[tuple[str, str], ...] = (
    (".github/workflows/", "ワークフローを触っている（GITHUB_TOKEN ではマージできない）"),
    ("firestore.rules", "Firestore のルールを触っている（配る前に手で dry-run する面）"),
    ("storage.rules", "Storage のルールを触っている（配る前に手で dry-run する面）"),
)

# **マージを GITHUB_TOKEN でするので、`push: master` で起きるものが起きない**
# （GitHub の再帰よけ）。人がマージしていたときに走っていた見張りを、名指しで起こし直す。
# 起こす先は YAML から毎回読む（ここに一覧を書かない。足した日に書き足し忘れても漏れない）。
# ここに書くのは「push のときと同じ動きにするための入力」だけ
AFTER_MERGE_INPUTS: dict[str, dict[str, str]] = {
    # push のときは issue を開け閉めする（`APPLY` が 1）。手押しの既定は見るだけ
    "heavy_watch.yml": {"apply": "true"},
}

# check の結論で「緑」とみなすもの。**neutral は緑にしない**（依頼の条件どおり）
GREEN = ("success", "skipped")

# 公開の public/ を本番と突き合わせる上限
PUBLIC_MAX = 20
# site の代表の面（`/` のほかに、触った面を何枚まで見るか）
SITE_MAX = 4
# デプロイを待つ上限（Hosting は実測 4〜5分。ランナー待ちと配りの後ろの見張りぶん余裕を見る）
DEPLOY_WAIT_S = 45 * 60


# ---------------------------------------------------------------------------
# ワークフローの YAML を読む（名前の照合と、マージ後に起こすもの）
# ---------------------------------------------------------------------------

def load_docs(wfdir: Path = WFDIR) -> dict[str, dict]:
    docs: dict[str, dict] = {}
    for wf in sorted(wfdir.glob("*.yml")) + sorted(wfdir.glob("*.yaml")):
        rel = f".github/workflows/{wf.name}"
        docs[rel] = yaml.safe_load(wf.read_text(encoding="utf-8")) or {}
    return docs


def triggers(doc: dict, quirk: bool = False) -> dict:
    """`on:` の中身。**PyYAML は `on:` を `True` と読む**ので、両方を引く。

    @param quirk 対照の足。`doc.get("on")` だけで読む（読み落とす側）
    """
    if not isinstance(doc, dict):
        return {}
    on = doc.get("on")
    if not quirk and on is None:
        on = doc.get(True)
    if isinstance(on, str):
        return {on: None}
    if isinstance(on, list):
        return {k: None for k in on if isinstance(k, str)}
    return on if isinstance(on, dict) else {}


def name_of(path: str, doc: dict) -> str:
    n = doc.get("name") if isinstance(doc, dict) else None
    return n if isinstance(n, str) and n.strip() else path


def _branches(spec) -> list[str] | None:
    """`push:` の枝の指定。None は「全部の枝」。"""
    if not isinstance(spec, dict):
        return None
    if "branches" in spec:
        b = spec["branches"]
        return [b] if isinstance(b, str) else list(b or [])
    if "branches-ignore" in spec:
        return None
    if "tags" in spec or "tags-ignore" in spec:
        return []          # タグだけ。枝の push では起きない
    return None


def runs_on_branches(doc: dict, quirk: bool = False) -> bool:
    """**PR の枝で走りうるか。** `pull_request` を持つか、master 以外の枝への `push` を持つか。

    `push: claude/**` のもの（ショートの取り込みなど）も入れる。あれは PR の枝に
    コミットを積み、走っているあいだにマージすると返し先が消える（#291）。
    待つなら、終わったときに起こしてもらう側にも並んでいないといけない。
    """
    on = triggers(doc, quirk)
    if "pull_request" in on or "pull_request_target" in on:
        return True
    if "push" in on:
        b = _branches(on.get("push"))
        if b is None:
            return True
        return any(x not in ("master", "main") for x in b)
    return False


def wake_names(docs: dict[str, dict], quirk: bool = False) -> set[str]:
    """起こしてもらうべき相手（ship.yml 自身を除く）の `name:`。"""
    return {name_of(p, d) for p, d in docs.items()
            if p != OWN and runs_on_branches(d, quirk)}


def listed_wakes(doc: dict) -> list[str]:
    """ship.yml の `workflow_run.workflows` に並べてある名前。"""
    wr = triggers(doc).get("workflow_run")
    ws = wr.get("workflows") if isinstance(wr, dict) else None
    if isinstance(ws, str):
        return [ws]
    return [w for w in (ws or []) if isinstance(w, str)]


def wake_drift(docs: dict[str, dict], quirk: bool = False) -> dict:
    """並べた名前と、並べるべき名前のずれ。→ {"missing", "extra", "ghost", "want"}

    - missing: PR の枝で走るのに並んでいない（そこが最後に終わると、誰も起こさない）
    - extra:   並んでいるのに PR の枝では走らない（害は無いが、一覧が嘘になる）
    - ghost:   並んでいる名前のワークフローが無い（**名前を変えると黙って切れる**のがこれ）
    """
    want = wake_names(docs, quirk)
    have = set(listed_wakes(docs.get(OWN) or {}))
    names = {name_of(p, d) for p, d in docs.items()}
    return {"missing": sorted(want - have), "extra": sorted((have - want) & names),
            "ghost": sorted(have - names), "want": sorted(want)}


def glob_re(pattern: str) -> re.Pattern:
    """GitHub の `paths:` の形（`**` は `/` をまたぐ、`*` はまたがない）。"""
    out, i = "", 0
    while i < len(pattern):
        c = pattern[i]
        if pattern.startswith("**/", i):
            out += "(?:.*/)?"
            i += 3
        elif pattern.startswith("**", i):
            out += ".*"
            i += 2
        elif c == "*":
            out += "[^/]*"
            i += 1
        elif c == "?":
            out += "[^/]"
            i += 1
        else:
            out += re.escape(c)
            i += 1
    return re.compile(out + r"\Z")


def paths_hit(spec, files: list[str]) -> bool:
    """`push:` の `paths` / `paths-ignore` に、変えたファイルが当たるか。"""
    if not isinstance(spec, dict):
        return True
    if "paths" in spec:
        pats = [p for p in (spec["paths"] or []) if isinstance(p, str)]
        pos = [glob_re(p) for p in pats if not p.startswith("!")]
        neg = [glob_re(p[1:]) for p in pats if p.startswith("!")]
        return any(any(r.match(f) for r in pos) and not any(r.match(f) for r in neg)
                   for f in files)
    if "paths-ignore" in spec:
        ign = [glob_re(p) for p in (spec["paths-ignore"] or []) if isinstance(p, str)]
        return any(not any(r.match(f) for r in ign) for f in files)
    return True


def after_merge(docs: dict[str, dict], files: list[str]) -> list[dict]:
    """マージのあと、`push: master` の代わりに起こすもの。→ [{"file","name","inputs","ok","why"}]"""
    out = []
    for p, d in sorted(docs.items()):
        on = triggers(d)
        if p == OWN or "push" not in on:
            continue
        b = _branches(on.get("push"))
        if b is not None and not any(fnmatch.fnmatchcase(BASE, x) for x in b):
            continue
        if not paths_hit(on.get("push"), files):
            continue
        f = p.rsplit("/", 1)[-1]
        ok = "workflow_dispatch" in on
        out.append({"file": f, "name": name_of(p, d), "inputs": AFTER_MERGE_INPUTS.get(f, {}),
                    "ok": ok, "why": "" if ok else "workflow_dispatch が無いので起こせない"})
    return out


# ---------------------------------------------------------------------------
# 判断（ネットに出ない。ship_selftest.py が表を差して当てる）
# ---------------------------------------------------------------------------

def route(files: list[str]) -> dict[str, list[str]]:
    """変えたファイルから配り先を決める。→ {"hosting": [...], "functions": [...]}"""
    out: dict[str, list[str]] = {k: [] for k in ROUTES}
    for f in files:
        for k, r in ROUTES.items():
            if f.startswith(r["prefixes"]) or f in r["files"]:
                out[k].append(f)
    return out


def hand(files: list[str]) -> list[str]:
    """手で出す面に触れていれば、その理由（重ねない）。"""
    why = []
    for pre, reason in HAND:
        if any(f == pre or f.startswith(pre) for f in files) and reason not in why:
            why.append(reason)
    return why


def check_name(c: dict) -> str:
    app = ((c.get("app") or {}).get("slug")) or ""
    return c.get("name", "?") + ("" if app in ("", "github-actions") else f"（{app}）")


def checks_verdict(checks: list[dict], status: dict, own_suites: set) -> tuple[str, str]:
    """head の check を読む。→ ("green"|"running"|"red"|"none", 1行)

    **自分（ship.yml）の check は数えない。** 札で起きた回の「見る」が、見ているあいだ
    in_progress で居るので、数えると永遠に「走っている」になる。
    """
    mine = [c for c in checks if ((c.get("check_suite") or {}).get("id")) not in own_suites]
    sts = (status or {}).get("statuses") or []
    if not mine and not sts:
        return "none", "checks がまだ1本も無い"
    run = [check_name(c) for c in mine if c.get("status") != "completed"]
    run += [s.get("context", "?") for s in sts if s.get("state") == "pending"]
    if run:
        return "running", "走っている: " + "・".join(sorted(run))
    bad = [f"{check_name(c)}（{c.get('conclusion')}）" for c in mine
           if c.get("conclusion") not in GREEN]
    bad += [f"{s.get('context', '?')}（{s.get('state')}）" for s in sts
            if s.get("state") != "success"]
    if bad:
        return "red", "checks が赤い: " + "・".join(sorted(bad))
    return "green", f"checks {len(mine) + len(sts)}本ぜんぶ緑"


def latest_checks(checks: list[dict], suite_path: dict) -> list[dict]:
    """**同じ check が同じ head で何度も走ったら、いちばん新しいものだけを読む。**

    PR の本文を書き直すと `Closes Check` が同じ head でもう1本走り、GitHub は前の結果も
    別の check suite として残す（`filter=latest` は suite ごとの新しさしか見ない）。
    #1121 で実際に `closes` の success と failure が並んだ。古い赤を数えると、
    **本文を直して緑になった PR が、いつまでも赤に見える。**
    同じものかどうかは「どのワークフローの、どの job か」で見る（job の名前だけだと、
    別のワークフローに同じ名前の job があったときに片方が消える）。
    """
    best: dict = {}
    for c in checks:
        sid = (c.get("check_suite") or {}).get("id")
        key = (suite_path.get(sid) or ((c.get("app") or {}).get("slug")) or "", c.get("name"))
        if key not in best or (c.get("id") or 0) > (best[key].get("id") or 0):
            best[key] = c
    return list(best.values())


@dataclass
class Decision:
    n: int
    kind: str            # go / wait / skip / fail
    line: str
    pr: dict = field(default_factory=dict)
    files: list = field(default_factory=list)
    rows: list = field(default_factory=list)


def decide(pr: dict, files: list[str], checks: list[dict], status: dict, own_suites: set,
           branch_runs: list[dict]) -> tuple[str, str]:
    """1本の PR を判断する。→ (kind, 1行)。**ここは何も書かない。**

    - skip: 札が無い・閉じている・フォーク・下書き。**黙る**
    - wait: まだ判断できない（checks が走っている・mergeable が分からない）。**黙る**
    - fail: 出せないと分かった。**1行書いて札を替える**
    - go:   出す
    """
    if pr.get("state") != "open":
        return "skip", "閉じている"
    labels = {(lb or {}).get("name") for lb in pr.get("labels") or []}
    if LABEL not in labels:
        return "skip", f"札 `{LABEL}` が無い"
    head_repo = ((pr.get("head") or {}).get("repo") or {}).get("full_name")
    base_repo = ((pr.get("base") or {}).get("repo") or {}).get("full_name")
    if head_repo != base_repo:
        return "skip", "フォークからの PR は出さない"
    if pr.get("draft"):
        return "skip", "下書き"
    base = (pr.get("base") or {}).get("ref")
    if base != BASE:
        return "fail", f"base が {BASE} でない（{base}）"
    why = hand(files)
    if why:
        return "fail", "手で出す面: " + "・".join(why)
    v, line = checks_verdict(checks, status, own_suites)
    if v in ("none", "running"):
        return "wait", line
    if v == "red":
        return "fail", line
    busy = sorted({r.get("name", "?") for r in branch_runs
                   if r.get("status") != "completed" and r.get("path") != OWN})
    if busy:
        return "wait", "枝で走っている run がある: " + "・".join(busy)
    m = pr.get("mergeable")
    if m is None:
        return "wait", "mergeable がまだ分からない"
    if m is False:
        return "fail", f"master とぶつかっている（{pr.get('mergeable_state')}）"
    return "go", line


def tops(files: list[str]) -> str:
    """「配り先なし（docs/ と .claude/ だけ）」の中身。"""
    seen: list[str] = []
    for f in files:
        t = f.split("/", 1)[0] + ("/" if "/" in f else "")
        if t not in seen:
            seen.append(t)
    return "・".join(seen[:4]) + (f" ほか{len(seen) - 4}" if len(seen) > 4 else "")


def site_routes(files: list[str]) -> list[str]:
    """触った面（`site/app/**/page.tsx`）の道。動く段（`[x]`）は道が決まらないので外す。"""
    out = []
    for f in files:
        m = re.match(r"site/app/(.*?)/?page\.(?:tsx|ts|jsx|js|mdx)$", f)
        if not m:
            continue
        segs = [s for s in m.group(1).split("/") if s and not s.startswith("(")]
        if any("[" in s for s in segs):
            continue
        r = "/" + "/".join(segs)
        if r != "/" and r not in out:
            out.append(r)
    return out


def public_candidates(rows: list[dict]) -> list[str]:
    """突き合わせてよい public/ のファイル（消したもの・ドットで始まるものを除く）。

    Hosting は `**/.*` を配らない（`firebase.json` の `ignore`）。
    """
    out = []
    for r in rows:
        f = r.get("filename", "")
        if not f.startswith("public/") or r.get("status") == "removed":
            continue
        if any(seg.startswith(".") for seg in f.split("/")):
            continue
        out.append(f)
    return out


def clean_path(p: str) -> str:
    """Hosting の `cleanUrls` / `trailingSlash: false` で、そのファイルが配られる道。"""
    if p.endswith("/index.html"):
        p = p[: -len("index.html")]
        return p.rstrip("/") or "/"
    if p.endswith(".html"):
        return p[: -len(".html")]
    return p


ENTRY = re.compile(r"/_expo/static/js/web/entry-[A-Za-z0-9_-]+\.js")


def entry_of(html: str) -> str | None:
    m = ENTRY.search(html or "")
    return m.group(0) if m else None


def build_mark(html: str) -> str | None:
    """**その HTML がどの書き出しのものか**の印。

    Next 15 の静的書き出しは、最初の RSC に buildId を入れる（`0:{"P":null,"b":"<id>",…`。
    HTML の中では `\\"` に包まれている）。書き出すたびに変わるので、
    配る前と後で違えば「新しいビルドが出ている」。形が変わった日のために、
    `_buildManifest` の道と、チャンクの名前の並びにも落ちる（`NEXT_PUBLIC_BUILT_AT` が
    焼き込まれるので、どれかのチャンクの名前は毎回変わる）。
    """
    h = html or ""
    for pat in (r'\\?"P\\?":null,\\?"b\\?":\\?"([A-Za-z0-9_-]{5,})',
                r'\\?"buildId\\?":\\?"([A-Za-z0-9_-]{5,})',
                r"/_next/static/([A-Za-z0-9_-]{5,})/_(?:build|ssg)Manifest\.js"):
        m = re.search(pat, h)
        if m:
            return "b:" + m.group(1)
    chunks = sorted(set(re.findall(r"/_next/static/chunks/[^\"'\s<>\\]+", h)))
    if chunks:
        return "chunks:" + hashlib.sha256("\n".join(chunks).encode()).hexdigest()[:12]
    return None


def minutes(sec: float) -> int:
    return max(0, int(round(sec / 60)))


# ---------------------------------------------------------------------------
# GitHub と本番を読む口
# ---------------------------------------------------------------------------

class Gh:
    def __init__(self, repo: str, tok: str):
        self.repo = repo
        self.tok = tok

    def req(self, method: str, path: str, body=None, accept: str = "application/vnd.github+json",
            raw: bool = False):
        """→ (status, json か bytes)。**4xx は例外にしない**（呼ぶ側が意味を決める）。"""
        url = path if path.startswith("http") else API + path
        data = json.dumps(body).encode() if body is not None else None
        for i in range(4):
            r = urllib.request.Request(url, data=data, method=method, headers={
                "Authorization": f"Bearer {self.tok}", "Accept": accept,
                "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "ship.yml"})
            try:
                with urllib.request.urlopen(r, timeout=60) as resp:
                    b = resp.read()
                    return resp.status, (b if raw else (json.loads(b) if b else None))
            except urllib.error.HTTPError as e:
                b = e.read()
                if e.code >= 500 and i < 3:
                    time.sleep(2 ** (i + 1))
                    continue
                try:
                    return e.code, (b if raw else json.loads(b))
                except ValueError:
                    return e.code, b
            except (urllib.error.URLError, TimeoutError, OSError):
                if i < 3:
                    time.sleep(2 ** (i + 1))
                    continue
                raise
        raise RuntimeError(f"{method} {path} が返らない")

    def get(self, path: str):
        st, b = self.req("GET", path)
        if st != 200:
            raise RuntimeError(f"GET {path} → {st}: {str(b)[:200]}")
        return b

    def pages(self, path: str, key: str | None = None, limit: int = 30) -> list:
        sep = "&" if "?" in path else "?"
        out: list = []
        for page in range(1, limit + 1):
            b = self.get(f"{path}{sep}per_page=100&page={page}")
            rows = b.get(key, []) if key else b
            out += rows
            if len(rows) < 100:
                break
        return out

    def r(self, tail: str) -> str:
        return f"/repos/{self.repo}{tail}"


def fetch(url: str) -> tuple[int, str, bytes]:
    """本番を1つ取る。→ (status, 着いた URL, 中身)。転送はたどる（`cleanUrls`）。

    `Accept-Encoding` は送らない。送ると圧縮した中身が返って、git の中身と比べられない。
    """
    for i in range(3):
        try:
            r = urllib.request.Request(url, headers={"User-Agent": "ship.yml"})
            with urllib.request.urlopen(r, timeout=30) as resp:
                return resp.status, resp.geturl(), resp.read()
        except urllib.error.HTTPError as e:
            return e.code, url, e.read() or b""
        except (urllib.error.URLError, TimeoutError, OSError):
            if i == 2:
                return 0, url, b""
            time.sleep(3)
    return 0, url, b""


def prod_base() -> str:
    """本番のドメイン。**`firebase.json` の `site` → `.firebaserc` の default** の順で読む。"""
    site = None
    try:
        h = json.loads((REPO / "firebase.json").read_text(encoding="utf-8")).get("hosting")
        if isinstance(h, dict):
            site = h.get("site")
    except (OSError, ValueError):
        pass
    if not site:
        rc = json.loads((REPO / ".firebaserc").read_text(encoding="utf-8"))
        site = rc["projects"]["default"]
    return f"https://{site}.web.app"


def cb(url: str) -> str:
    # `/island-api/*` と同じく CDN に乗る。付けないと配る前の返事を読む
    return url + ("&" if "?" in url else "?") + f"cb={int(time.time() * 1000)}"


def prod_marks(base: str, pages: list[str]) -> dict:
    """配る前の本番。entry の名前と、代表の面の印。"""
    out: dict = {"entry": None, "site": {}}
    st, _, body = fetch(cb(base + "/expo-app"))
    if st == 200:
        out["entry"] = entry_of(body.decode("utf-8", "replace"))
    for p in pages:
        st, _, body = fetch(cb(base + p))
        out["site"][p] = build_mark(body.decode("utf-8", "replace")) if st == 200 else None
    return out


# ---------------------------------------------------------------------------
# PR を読んで判断する
# ---------------------------------------------------------------------------

def suite_paths(gh: Gh, sha: str) -> dict:
    """その head で走った run の、check suite → ワークフローのファイル。"""
    runs = gh.get(gh.r(f"/actions/runs?head_sha={sha}&per_page=100")).get("workflow_runs", [])
    return {r.get("check_suite_id"): r.get("path") for r in runs}


def pr_files(gh: Gh, n: int) -> list[dict]:
    return gh.pages(gh.r(f"/pulls/{n}/files"))


def evaluate(gh: Gh, n: int, as_if: bool = False) -> Decision:
    """1本読んで判断する。

    @param as_if dry-run の足。**札が付いていたら**どう判断するか（札を付ける前に見るため。
      ここで go と出れば、付けた瞬間に出る）。本物の判断では使わない
    """
    pr = gh.get(gh.r(f"/pulls/{n}"))
    if as_if:
        pr = {**pr, "labels": [*(pr.get("labels") or []), {"name": LABEL}]}
    # 札・閉じた・フォークは、checks を読む前に分かる。読まずに黙る
    k, line = decide(pr, [], [{"status": "completed", "conclusion": "success"}], {}, set(), [])
    if k == "skip" or (k == "fail" and line.startswith("base")):
        return Decision(n, k, line, pr)
    rows = pr_files(gh, n)
    files = [r["filename"] for r in rows]
    sha = pr["head"]["sha"]
    checks = gh.pages(gh.r(f"/commits/{sha}/check-runs"), "check_runs")
    status = gh.get(gh.r(f"/commits/{sha}/status"))
    ref = urllib.parse.quote(pr["head"]["ref"], safe="")
    branch = gh.get(gh.r(f"/actions/runs?branch={ref}&per_page=50")).get("workflow_runs", [])
    # mergeable は GitHub が裏で計算する。null のあいだは少し待つ
    for _ in range(5):
        if pr.get("mergeable") is not None:
            break
        time.sleep(4)
        pr = gh.get(gh.r(f"/pulls/{n}"))
    if as_if:
        pr = {**pr, "labels": [*(pr.get("labels") or []), {"name": LABEL}]}
    paths = suite_paths(gh, sha)
    own = {sid for sid, path in paths.items() if path == OWN}
    k, line = decide(pr, files, latest_checks(checks, paths), status, own, branch)
    return Decision(n, k, line, pr, files, rows)


def sweep(gh: Gh) -> list[int]:
    """札 `出す` の付いた開いている PR。"""
    q = urllib.parse.quote(LABEL)
    items = gh.pages(gh.r(f"/issues?state=open&labels={q}"))
    return sorted(i["number"] for i in items if i.get("pull_request"))


def plan_lines(d: Decision, docs: dict, base: str | None, with_prod: bool) -> list[str]:
    """dry-run で出す「何をするか」。"""
    rows = d.rows
    plan = route(d.files)
    out = [f"マージ: #{d.n} を merge commit で（head `{d.pr['head']['sha'][:7]}`）"]
    am = after_merge(docs, d.files)
    if am:
        out.append("master の見張りを起こす（push の代わり）: " + "・".join(
            f"{a['name']}（{a['file']}{' ' + json.dumps(a['inputs']) if a['inputs'] else ''}）"
            + ("" if a["ok"] else f" ✕{a['why']}") for a in am))
    deps = [k for k in ROUTES if plan[k]]
    if not deps:
        out.append(f"配り先なし（{tops(d.files)}だけ）。デプロイは起こさない")
    for k in deps:
        out.append(f"配る: {ROUTES[k]['file']} を {BASE} で workflow_dispatch し、終わるまで待つ"
                   f"（理由: {', '.join(plan[k][:3])}{' ほか' if len(plan[k]) > 3 else ''}）")
    if plan["hosting"]:
        pub = public_candidates(rows)
        what = []
        if pub:
            what.append(f"public {min(len(pub), PUBLIC_MAX)}本（{', '.join(pub[:3])}…）")
        if any(f.startswith(EXPO) or f in EXPO for f in d.files):
            what.append("entry（/expo-app の entry-….js が変わったか）")
        if any(f.startswith("site/") for f in d.files):
            what.append(f"site {1 + len(site_routes(d.files)[:SITE_MAX])}面（"
                        + ", ".join(["/"] + site_routes(d.files)[:SITE_MAX]) + "）")
        out.append(f"突き合わせ（{base}）: " + ("・".join(what) if what else "配りの結論だけ"))
        if with_prod and base:
            m = prod_marks(base, ["/"])
            out.append(f"いまの本番: entry {m['entry'] or '（取れない）'} / / の印 {m['site'].get('/') or '（取れない）'}")
    if plan["functions"]:
        out.append("突き合わせ: Functions は配りの job の結論で見る")
    closes = sorted(closed_by(d.pr.get("body") or ""))
    if closes:
        out.append("閉じる issue: " + "・".join(f"#{i}" for i in closes)
                   + "（マージで GitHub が閉じる。同じ1行を書く）")
    return out


def look(gh: Gh, pr_arg: str, dry: bool, event: str) -> int:
    docs = load_docs()
    drift = wake_drift(docs)
    if drift["missing"] or drift["ghost"]:
        # 判断は止めない（走っているものは走らせる）。ただし赤い字で残す
        print(f"::error::起こしの一覧がずれている: 漏れ {drift['missing']} / 無い名前 {drift['ghost']}"
              "（python/ship_selftest.py）")
    numbers = [int(pr_arg)] if pr_arg else sweep(gh)
    if not numbers:
        print(f"札 `{LABEL}` の付いた開いている PR は無い（{event}）")
        out(prs="")
        return 0
    base = prod_base() if dry else None
    act, summary = [], [f"### 出す: 判断（{event}{'・dry-run' if dry else ''}）", ""]
    for n in numbers:
        d = evaluate(gh, n)
        row = f"#{n} → {d.kind}: {d.line}"
        print(row)
        summary.append(f"- {row}")
        if d.kind in ("go", "fail"):
            act.append(str(n))
        if dry and d.kind == "skip" and d.line.startswith("札"):
            # 札を付ける前に「付けたらどうなるか」を見せる（付けた瞬間に動くので、先に見たい）
            d = evaluate(gh, n, as_if=True)
            row = f"    札を付けたら → {d.kind}: {d.line}"
            print(row)
            summary.append(f"  - {row.strip()}")
        if dry and d.kind == "go":
            for x in plan_lines(d, docs, base, with_prod=True):
                print(f"    {x}")
                summary.append(f"    - {x}")
        elif dry and d.kind == "fail":
            for x in fail_body(d.n, [d.line], merged=False, run_url=run_url()).splitlines():
                print(f"    書く: {x}")
                summary.append(f"    - 書く: {x}")
    out(prs=" ".join(act))
    step_summary(summary)
    return 0


# ---------------------------------------------------------------------------
# 出す
# ---------------------------------------------------------------------------

def run_url() -> str:
    s = os.environ.get("GITHUB_SERVER_URL", "https://github.com")
    return f"{s}/{os.environ.get('GITHUB_REPOSITORY', '')}/actions/runs/{os.environ.get('GITHUB_RUN_ID', '')}"


def out(**kv) -> None:
    p = os.environ.get("GITHUB_OUTPUT")
    if p:
        with open(p, "a", encoding="utf-8") as f:
            for k, v in kv.items():
                f.write(f"{k}={v}\n")


def step_summary(lines: list[str]) -> None:
    p = os.environ.get("GITHUB_STEP_SUMMARY")
    if p:
        with open(p, "a", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")


def ensure_label(gh: Gh) -> None:
    st, _ = gh.req("GET", gh.r(f"/labels/{urllib.parse.quote(LABEL)}"))
    if st == 404:
        gh.req("POST", gh.r("/labels"), {"name": LABEL, "color": LABEL_COLOR,
                                         "description": LABEL_DESC})


def comment(gh: Gh, n: int, body: str) -> None:
    st, b = gh.req("POST", gh.r(f"/issues/{n}/comments"), {"body": body})
    if st != 201:
        print(f"::warning::#{n} に書けなかった（{st}）: {str(b)[:200]}")


def fail_body(n: int, lines: list[str], merged: bool, run_url: str) -> str:
    """落ちたときのコメント。**落ちた行だけ**＋札をどうしたか。"""
    head = lines[:3] + ([f"ほか {len(lines) - 3}件"] if len(lines) > 3 else [])
    tail = (f"札 `{WAIT_LABEL}` を付けました（[run]({run_url})）" if merged else
            f"札 `{LABEL}` を外して `{WAIT_LABEL}` を付けました。直したら `{LABEL}` を付け直す"
            f"（[run]({run_url})）")
    first = ("出しきれませんでした: " if merged else "出せませんでした: ") + head[0]
    return "\n".join([first, *head[1:], tail][:5])


def report_fail(gh: Gh, d: Decision, lines: list[str], merged: bool = False,
                closes: list[int] | None = None, sha7: str = "") -> None:
    body = fail_body(d.n, lines, merged, run_url())
    comment(gh, d.n, body)
    gh.req("POST", gh.r(f"/issues/{d.n}/labels"), {"labels": [WAIT_LABEL]})
    if not merged:
        gh.req("DELETE", gh.r(f"/issues/{d.n}/labels/{urllib.parse.quote(LABEL)}"))
    for i in closes or []:
        comment(gh, i, f"#{d.n} はマージしました（`{sha7}`）が、{lines[0]}（[run]({run_url()})）")
    print(body)
    step_summary([f"- #{d.n} ✕ " + body.replace("\n", " / ")])


def label_time(gh: Gh, n: int) -> datetime | None:
    ev = gh.pages(gh.r(f"/issues/{n}/events"), limit=5)
    ts = [e["created_at"] for e in ev
          if e.get("event") == "labeled" and (e.get("label") or {}).get("name") == LABEL]
    return datetime.fromisoformat(ts[-1].replace("Z", "+00:00")) if ts else None


def includes(gh: Gh, head: str, sha: str) -> bool:
    """`head` が `sha` を含むか（配った run が、このマージより後の master か）。"""
    if head == sha:
        return True
    st, b = gh.req("GET", gh.r(f"/compare/{sha}...{head}"))
    return st == 200 and (b or {}).get("status") in ("ahead", "identical")


def dispatch(gh: Gh, wf: str, inputs: dict | None = None) -> int:
    body: dict = {"ref": BASE}
    if inputs:
        body["inputs"] = inputs
    st, _ = gh.req("POST", gh.r(f"/actions/workflows/{wf}/dispatches"), body)
    return st


def dispatch_and_wait(gh: Gh, wf: str, sha: str) -> dict:
    """配りを master で押して、**終わるまでここで待つ。** → run（取れなければ conclusion に理由）"""
    last = gh.get(gh.r(f"/actions/workflows/{wf}/runs?per_page=1")).get("workflow_runs", [])
    before = last[0]["id"] if last else 0
    t0 = time.time()
    st = dispatch(gh, wf)
    if st != 204:
        return {"conclusion": f"押せなかった（{st}）", "html_url": run_url()}
    run = None
    # **押しただけでは足りない。** 増えた run のうち、このマージを含む master のものを掴む
    # （毎晩の焼き直しも同じ配りを押すので、いちばん新しいものを盲目に取らない）
    for _ in range(40):
        time.sleep(6)
        rows = gh.get(gh.r(f"/actions/workflows/{wf}/runs?event=workflow_dispatch&per_page=10")
                      ).get("workflow_runs", [])
        for r in sorted(rows, key=lambda r: r["id"]):
            if r["id"] > before and includes(gh, r.get("head_sha", ""), sha):
                run = r
                break
        if run:
            break
    if not run:
        return {"conclusion": "押したのに run が見つからない", "html_url": run_url()}
    while run.get("status") != "completed" and time.time() - t0 < DEPLOY_WAIT_S:
        time.sleep(20)
        run = gh.get(gh.r(f"/actions/runs/{run['id']}"))
    if run.get("status") != "completed":
        run = {**run, "conclusion": f"{DEPLOY_WAIT_S // 60}分待っても終わらない"}
    run["waited"] = time.time() - t0
    return run


def failed_steps(gh: Gh, run: dict) -> str:
    if "id" not in run:
        return ""
    jobs = gh.get(gh.r(f"/actions/runs/{run['id']}/jobs?per_page=50")).get("jobs", [])
    bad = []
    for j in jobs:
        for s in j.get("steps") or []:
            if s.get("conclusion") == "failure":
                bad.append(s.get("name", "?"))
        if j.get("conclusion") == "failure" and not j.get("steps"):
            bad.append(j.get("name", "?"))
    return "・".join(bad[:3])


def raw_file(gh: Gh, path: str, sha: str) -> bytes | None:
    st, b = gh.req("GET", gh.r(f"/contents/{urllib.parse.quote(path)}?ref={sha}"),
                   accept="application/vnd.github.raw", raw=True)
    return b if st == 200 else None


def exists(gh: Gh, path: str, sha: str) -> bool:
    st, _ = gh.req("GET", gh.r(f"/contents/{urllib.parse.quote(path)}?ref={sha}"))
    return st == 200


def verify_hosting(gh: Gh, d: Decision, sha: str, base: str, before: dict) -> dict:
    """配ったあとの本番を、git の中身と突き合わせる。→ {"ok","total","bad","skip","parts"}"""
    res = {"ok": 0, "total": 0, "bad": [], "skip": [], "parts": []}

    # public/: 中身を sha256 で。**site が同じ道に重ねるもの**は本番では site の側になるので外す
    # （`npm run build:island` が `site/out/.` を `dist/` に重ねる）
    pub_ok = pub_n = 0
    for f in public_candidates(d.rows):
        if pub_n >= PUBLIC_MAX:
            break
        rel = f[len("public/"):]
        route_ = clean_path("/" + rel)
        if exists(gh, f"site/public/{rel}", sha) or (
                rel.endswith(".html") and exists(gh, f"site/app{route_ if route_ != '/' else ''}/page.tsx", sha)):
            res["skip"].append(f"{f}（site が重ねる）")
            continue
        want = raw_file(gh, f, sha)
        if want is None:
            res["skip"].append(f"{f}（git から読めない）")
            continue
        st, final, body = fetch(cb(base + urllib.parse.quote("/" + rel)))
        got_path = urllib.parse.unquote(urllib.parse.urlparse(final).path)
        if st == 200 and got_path not in ("/" + rel, route_):
            res["skip"].append(f"{f}（{got_path} へ転送される）")
            continue
        pub_n += 1
        if st == 200 and hashlib.sha256(body).hexdigest() == hashlib.sha256(want).hexdigest():
            pub_ok += 1
        else:
            res["bad"].append(f"{f} が本番と違う（{st}）")
    if pub_n:
        res["parts"].append(f"public {pub_ok}/{pub_n}")
        res["ok"] += pub_ok
        res["total"] += pub_n

    # entry: Expo の書き出しの名前が本番の index から引けて、配る前から変わったか
    if any(f.startswith(EXPO) or f in EXPO for f in d.files):
        st, _, body = fetch(cb(base + "/expo-app"))
        e = entry_of(body.decode("utf-8", "replace")) if st == 200 else None
        ok = False
        if not e:
            res["bad"].append(f"/expo-app から entry が引けない（{st}）")
        elif fetch(base + e)[0] != 200:
            res["bad"].append(f"{e} が 200 で返らない")
        elif before.get("entry") and e == before["entry"]:
            res["bad"].append(f"entry が配る前と同じ（{e}）")
        else:
            ok = True
        res["parts"].append(f"entry {int(ok)}/1")
        res["ok"] += int(ok)
        res["total"] += 1

    # site: 代表の面が 200 で、新しいビルドの印を持つか
    if any(f.startswith("site/") for f in d.files):
        pages = ["/"] + site_routes(d.files)[:SITE_MAX]
        marks = {}
        for p in pages:
            st, _, body = fetch(cb(base + p))
            marks[p] = (st, build_mark(body.decode("utf-8", "replace")) if st == 200 else None)
        top = marks["/"][1]
        s_ok = 0
        for p in pages:
            st, mk = marks[p]
            if st != 200 or not mk:
                res["bad"].append(f"{p} が {st}{'' if mk or st != 200 else '（印が無い）'}")
            elif p == "/" and before.get("site", {}).get("/") == mk:
                res["bad"].append(f"/ の印が配る前と同じ（{mk}）")
            elif p != "/" and mk != top:
                res["bad"].append(f"{p} の印が / と違う（{mk} / {top}）")
            else:
                s_ok += 1
        res["parts"].append(f"site {s_ok}/{len(pages)}")
        res["ok"] += s_ok
        res["total"] += len(pages)
    return res


def ship_one(gh: Gh, d: Decision, docs: dict) -> bool:
    t0 = time.time()
    n, pr = d.n, d.pr
    tag = label_time(gh, n)
    closes = []
    for i in sorted(closed_by(pr.get("body") or "")):
        st, b = gh.req("GET", gh.r(f"/issues/{i}"))
        if st == 200 and not b.get("pull_request") and b.get("state") == "open":
            closes.append(i)

    st, b = gh.req("PUT", gh.r(f"/pulls/{n}/merge"),
                   {"merge_method": "merge", "sha": pr["head"]["sha"]})
    if st == 409:
        # 見ているあいだに head が動いた。新しい head の CI が終わればまた起きる
        print(f"#{n}: head が動いたのでマージしない（次の完了で見直す）")
        return True
    if st != 200 or not (b or {}).get("merged"):
        report_fail(gh, d, [f"マージできなかった（{st}: {(b or {}).get('message', '')}）"])
        return False
    sha = b["sha"]
    sha7 = sha[:7]

    woke = []
    for a in after_merge(docs, d.files):
        if a["ok"] and dispatch(gh, a["file"], a["inputs"]) == 204:
            woke.append(a["name"])

    plan = route(d.files)
    deps = [k for k in ROUTES if plan[k]]
    base = prod_base()
    lines_dep, fails, check_line = [], [], ""
    for k in deps:
        before = prod_marks(base, ["/"]) if k == "hosting" else {}
        run = dispatch_and_wait(gh, ROUTES[k]["file"], sha)
        c = run.get("conclusion")
        lines_dep.append(f"{ROUTES[k]['name']} [run]({run.get('html_url')}) {c}"
                         f"（{minutes(run.get('waited', 0))}分）")
        if c != "success":
            why = failed_steps(gh, run)
            fails.append(f"{ROUTES[k]['name']} の配りが {c}" + (f"（{why}）" if why else ""))
            continue
        if k == "hosting":
            v = verify_hosting(gh, d, sha, base, before)
            skip = f"・外した {len(v['skip'])}本" if v["skip"] else ""
            check_line = (f"本番の突き合わせ: {v['ok']}/{v['total']}（{'・'.join(v['parts'])}{skip}）"
                          if v["total"] else f"本番の突き合わせ: 見るものなし（配りの結論だけ）{skip}")
            fails += v["bad"]
            for s in v["skip"]:
                print(f"    外した: {s}")

    if fails:
        report_fail(gh, d, fails, merged=True, closes=closes, sha7=sha7)
        return False

    dest = "・".join(ROUTES[k]["name"] for k in deps) if deps else f"配り先なし（{tops(d.files)}だけ）"
    took = f"かかった: この run {minutes(time.time() - t0)}分"
    if tag:
        took = f"かかった: 札から {minutes((datetime.now(timezone.utc) - tag).total_seconds())}分" \
               f"（この run {minutes(time.time() - t0)}分）"
    if woke:
        took += "・master の見張り（" + "・".join(woke) + "）を起こした"
    body = [f"出しました: #{n} をマージ（`{sha7}`）→ {dest}"]
    if lines_dep:
        body.append("デプロイ: " + "・".join(lines_dep))
    if check_line:
        body.append(check_line)
    body.append(took)
    comment(gh, n, "\n".join(body[:5]))

    one = f"#{n} で出しました（`{sha7}`・{dest}" + (f"・{check_line.split(': ', 1)[-1]}" if check_line else "") + "）"
    for i in closes:
        # マージで GitHub が閉じるのは裏で起きる。閉じたのを見てから書く
        for _ in range(6):
            st, b = gh.req("GET", gh.r(f"/issues/{i}"))
            if st == 200 and b.get("state") == "closed":
                comment(gh, i, one)
                break
            time.sleep(5)
        else:
            print(f"::warning::#{i} が閉じていない（Closes はあったが）")
    print("\n".join(body))
    step_summary([f"- #{n} ○ " + " / ".join(body)])
    return True


def go(gh: Gh, numbers: list[int]) -> int:
    ensure_label(gh)
    docs = load_docs()
    rc = 0
    for n in numbers:
        d = evaluate(gh, n)
        print(f"#{n} → {d.kind}: {d.line}")
        if d.kind in ("skip", "wait"):
            continue
        if d.kind == "fail":
            report_fail(gh, d, [d.line])
            rc = 1
            continue
        if not ship_one(gh, d, docs):
            rc = 1
    return rc


def main() -> int:
    ap = argparse.ArgumentParser(description="札 `出す` の PR を出す")
    ap.add_argument("cmd", choices=("look", "go"))
    ap.add_argument("--pr", default="")
    ap.add_argument("--prs", default="")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--event", default=os.environ.get("GITHUB_EVENT_NAME", "手元"))
    a = ap.parse_args()
    if a.pr and not a.pr.isdigit():
        print(f"!! --pr は番号だけ: {a.pr}")
        return 2
    tok = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN") or ""
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    if not tok or not repo:
        print("!! GITHUB_TOKEN と GITHUB_REPOSITORY が要る")
        return 2
    gh = Gh(repo, tok)
    try:
        if a.cmd == "look":
            return look(gh, a.pr, a.dry_run, a.event)
        nums = [int(x) for x in a.prs.split() if x.isdigit()]
        return go(gh, nums)
    except RuntimeError as e:
        print(f"!! GitHub が読めない: {e}")
        return 2


if __name__ == "__main__":
    sys.exit(main())
