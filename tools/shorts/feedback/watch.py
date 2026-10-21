#!/usr/bin/env python3
"""**ショートへのあやとの指摘が、帳面に入っているかを見張る。**

    python3 tools/shorts/feedback/watch.py                     # GitHub を読み、手元の帳面と突き合わせる
    python3 tools/shorts/feedback/watch.py --branches          # 全部の枝の帳面を合わせて突き合わせる（Actions はこれ）
    python3 tools/shorts/feedback/watch.py --save 置き場.json   # 読んだ issue とコメントを置いておく
    python3 tools/shorts/feedback/watch.py --from 置き場.json   # 置いておいたもので突き合わせる（issue は読みに出ない）
    python3 tools/shorts/feedback/watch.py --ledger 写し.md      # 帳面をこのファイルにする（何本でも。合わせて数える）
    python3 tools/shorts/feedback/watch.py --branches --apply  # issue を開く／書き換える／閉じる

終了コード **0=全部入っている / 1=帳面に入っていないあやとのコメントがある / 2=数えられなかった**
（GitHub に届かない・帳面を1つも読めない・札 `shorts` の issue か、あやとのコメントが1つも無い。
**0 を答えにしない**——置き場が動いて読めていないのを「取りこぼし無し」と言わない）。

## なぜ要るか（2026-10-21）

あやと:「私の毎回の指摘は以後繰り返さないようナレッジ溜まる仕組みは用意してね。」
指摘は帳面（`.claude/skills/viral-shorts-creator/references/ayato_feedback.md`）に集め、書く段・読む段・lint で当てる。
**帳面に入れ忘れた指摘は、どの段にも届かない。** 入れるのは人（セッション）の仕事で、人は忘れる。
だから「入っていないもの」を機械が数える。

## 何を「あやと本人のコメント」と読むか

このリポジトリでは、セッションも**あやとのアカウントで**書く。書き手の名前では見分けられない。

- 書き手が `ticket_labels.OWNER_LOGIN` でないもの（`github-actions[bot]` の呼び出しを含む）は数えない
- **末尾がこちらの署名**（`ticket_labels.signed_by_system()`。引用の中の署名は数えない）のものは数えない
- bot の呼び出しの字（`あやと島案内鳥が呼んでいます`）を持つものは数えない
- 見分けの決まりは `python/ticket_labels.py` の1か所にある。写さずに借りる（片方だけ直る日を作らない）

**書いてから3時間（`--grace-hours`）は数えない。** 帳面に足すのは返事を読んだその場だが、毎日の見張りが
その数分前に走ると、足す前の1件で issue が立って翌日に閉じる、を繰り返す。

## 帳面は、どの枝にあってもよい（`--branches`）

ショートの作業は作業枝で進み、master に入るのは何日かあと。帳面に足したのが作業枝だけのあいだも、
**入れたことは入れたこと**なので、全部の枝の帳面を合わせて数える。枝が消えれば、その枝だけにあった行も消え、
また数えられる（入れ直す）。読むのは GitHub の API（`contents?ref=<枝>`）で、git の履歴は取らない。

## 書くもの・書かないもの

issue の本文に書くのは、issue の番号と題・コメントの日付と URL だけ。**コメントの字は写さない**
（読めば分かるし、写した字が公開の本文に残り続ける）。直れば、次の回でひとりでに閉じる。
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "python"))
import ledger  # noqa: E402
import run_watch  # noqa: E402
from ticket_labels import OWNER_LOGIN, WAIT_STYLE, WAIT_US, signed_by_system  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("shorts_feedback_watch")

SRC_LABEL = "shorts"
LABEL = "shorts-feedback"
MARK = "<!-- shorts-feedback-watch -->"
TITLE = "【見張り】ショートへのあやとの指摘が帳面に入っていない"
WORKFLOW_FILE = "shorts_feedback_watch.yml"
CALL = "あやと島案内鳥が呼んでいます"
GRACE_HOURS = 3.0
PER_PAGE = 100


class Gh(run_watch.Gh):
    """GitHub の口。書く口（`create` / `patch` / `list_issues`）は `run_watch.Gh` のまま。読む口を足す。

    **鍵が無くても読める**（このリポジトリは公開）。手元で回すときに鍵を要らなくするため、鍵が空なら
    Authorization を付けない。書くときは鍵が要る（`--apply` は鍵が無ければ止まる）。
    """

    # 一覧で見張りごとに見分けられるよう、ほかの札（bake-down 5319e7 / donor-calls d93f0b / fx-tips d4c5f9 /
    # watch-down 1d76db / ingest-down b60205 / ship-down 006b75 / ticket-stock bfd4f2）と違う色
    LABEL_COLOR = "f9d0c4"
    LABEL_DESC = "ショートへのあやとの指摘が、帳面に入っていない"
    # **あやと待ちにしない。** 帳面に足すのはシステム（セッション）の仕事
    WAIT = WAIT_US
    STYLE = WAIT_STYLE

    def _open(self, method: str, path: str, payload=None, accept="application/vnd.github+json") -> bytes:
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        req = urllib.request.Request(run_watch.API + path, data=data, method=method)
        req.add_header("Accept", accept)
        req.add_header("X-GitHub-Api-Version", "2022-11-28")
        if self.token:
            req.add_header("Authorization", f"Bearer {self.token}")
        if data is not None:
            req.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read()

    def _call(self, method: str, path: str, payload=None):
        raw = self._open(method, path, payload)
        return json.loads(raw) if raw else {}

    def pages(self, path: str) -> list:
        out, page = [], 1
        sep = "&" if "?" in path else "?"
        while True:
            got = self._call("GET", f"{path}{sep}per_page={PER_PAGE}&page={page}")
            if not isinstance(got, list):
                raise ValueError(f"一覧の形でない返事: {path}")
            out += got
            if len(got) < PER_PAGE:
                return out
            page += 1

    def shorts_issues(self) -> list:
        """札 `shorts` の issue を、閉じたものも含めて。PR は除く。"""
        got = self.pages(f"/repos/{self.repo}/issues?labels={SRC_LABEL}&state=all")
        return [i for i in got if "pull_request" not in i]

    def comments(self, number: int) -> list:
        return self.pages(f"/repos/{self.repo}/issues/{number}/comments")

    def branches(self) -> list:
        return [b["name"] for b in self.pages(f"/repos/{self.repo}/branches")]

    def ledger_at(self, branch: str):
        """その枝の帳面の字。**無ければ None**（帳面がまだ無い枝のほうが多い）。"""
        path = urllib.parse.quote(ledger.REL)
        ref = urllib.parse.quote(branch, safe="")
        try:
            raw = self._open("GET", f"/repos/{self.repo}/contents/{path}?ref={ref}", accept="application/vnd.github.raw")
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            raise
        return raw.decode("utf-8")


def gather(gh) -> list:
    """札 `shorts` の issue と、そのコメント（数えるのに要る欄だけ）。"""
    out = []
    for i in gh.shorts_issues():
        cs = gh.comments(i["number"]) if i.get("comments") else []
        out.append({
            "number": i["number"], "title": i.get("title", ""),
            "comments": [{"id": c["id"], "html_url": c.get("html_url", ""),
                          "user": {"login": (c.get("user") or {}).get("login", ""),
                                   "type": (c.get("user") or {}).get("type", "")},
                          "created_at": c.get("created_at", ""), "body": c.get("body") or ""} for c in cs],
        })
    return out


def is_ayato(c: dict) -> bool:
    """あやと本人が書いたコメントか（モジュールの頭の3つ）。"""
    login = (c.get("user") or {}).get("login") or ""
    # bot（github-actions[bot] の呼び出し）も、書き手があやとでないのでここで外れる
    if login.lower() != OWNER_LOGIN.lower():
        return False
    body = c.get("body") or ""
    if signed_by_system(body):
        return False
    if CALL in body:
        return False
    return True


def _at(s: str):
    try:
        return datetime.fromisoformat((s or "").replace("Z", "+00:00"))
    except ValueError:
        return None


def survey(issues, refs: dict, now: datetime, grace_hours: float = GRACE_HOURS) -> dict:
    """数えて、見立てる。GitHub に触らない素の関数。

    Args:
        issues: `gather()` の返り値（読めなかったら None）
        refs: 帳面に入っているコメント。コメントID → issue 番号の集合（`--branches` なら全部の枝を合わせたもの）。
            帳面を1つも読めなかったら None
        now: いま
        grace_hours: 書いてから何時間は数えないか

    Returns:
        {"down": True（入っていないものがある）/ False / None（数えられない）, "why", "issues", "ayato",
         "young", "missing": [{issue, title, id, url, at}]}
    """
    a = {"down": None, "why": "", "issues": 0, "ayato": 0, "young": 0, "missing": []}
    if refs is None:
        a["why"] = "帳面を1つも読めなかった"
        return a
    got = issues or []
    a["issues"] = len(got)
    counted = []
    for i in got:
        for c in i.get("comments") or []:
            if not is_ayato(c):
                continue
            at = _at(c.get("created_at", ""))
            e = {"issue": i["number"], "title": i.get("title", ""), "id": int(c["id"]),
                 "url": c.get("html_url", ""), "at": c.get("created_at", "")}
            if at is not None and now - at < timedelta(hours=grace_hours):
                a["young"] += 1
                continue
            counted.append(e)
    a["ayato"] = len(counted)
    # **読めなかった・0本・0件は、どれも「取りこぼし無し」ではない。** 開きも閉じもしない
    if not got or not (counted or a["young"]):
        a["why"] = ("札 shorts の issue を読めなかった" if issues is None
                    else "札 shorts の issue が1本も無い" if not got else "あやとのコメントが1つも無い")
        return a
    # **issue の番号まで合っていて、入っている。** 番号の写し違いは、別のコメントを指していることがある
    a["missing"] = sorted((e for e in counted if e["issue"] not in refs.get(e["id"], ())),
                          key=lambda e: (e["at"], e["id"]))
    a["down"] = bool(a["missing"])
    return a


def read_refs(texts: list):
    """帳面の字（何本でも）から、入っているコメントを合わせる。1本も無ければ None。"""
    if not texts:
        return None
    refs: dict = {}
    for t in texts:
        for cid, nums in ledger.parse(t).refs().items():
            refs.setdefault(cid, set()).update(nums)
    return refs


def body(a: dict) -> str:
    """issue の本文。**毎回まるごと組み直す**（同じなら `decide()` が触らない）。日付の動く字を入れない。"""
    rows = ["| issue | 書いた日 | コメント |", "| --- | --- | --- |"]
    for e in a["missing"]:
        title = (e["title"] or "").replace("|", "／")
        rows.append(f"| #{e['issue']} {title} | {e['at'][:10]} | {e['url']} |")
    return "\n".join([
        MARK,
        "",
        f"**ショートの issue に、帳面に入っていないあやとのコメントが {len(a['missing'])} 件あります。**",
        "",
        f"同じ指摘をもう一度言わせないために、あやとのコメントは全部、帳面（`{ledger.REL}`）の"
        "「指摘」か「指摘ではないコメント」に入れます。",
        "",
        *rows,
        "",
        "### 直しかた",
        "",
        "1. コメントを読み、指摘なら「指摘」の節に1項目（同じ決まりなら、その項目の「言われた」に1行）、"
        "承認・時刻・素材などなら「指摘ではないコメント」に URL を1行足す",
        "2. 字で拾える指摘なら、`tools/shorts/script/lint.py` に規則を足す（帳面の「当てる場所」に `lint:<規則>`）",
        "3. どの枝に push してもよい（見張りは全部の枝の帳面を合わせて読む）。入っていれば、次の回でこの issue はひとりでに閉じる",
    ]) + "\n"


def run(gh, a: dict, apply: bool) -> dict:
    """数えた結果に issue を合わせる。**読むのは毎回、書くのは `apply` のときだけ。**"""
    issues = gh.list_issues(LABEL)
    issue = run_watch.find_issue(issues, MARK)
    want = body(a) if a["down"] else ""
    what = run_watch.decide(issue, want, a["down"])
    if not apply:
        logger.info("--apply を付けていないので GitHub には書きません（付けると: %s）", run_watch.PLAN[what])
        return {"action": "dry", "planned": what, "number": issue["number"] if issue else None}
    return run_watch.apply_plan(gh, what, issue, TITLE, want, LABEL, log=logger)


def say(a: dict) -> None:
    if a["down"] is None:
        logger.error("数えられませんでした: %s（issue は開きも閉じもしません）", a["why"])
        return
    logger.info("札 shorts の issue %d本・あやとのコメント %d件（書いてから%g時間未満で数えていない %d件）",
                a["issues"], a["ayato"], GRACE_HOURS, a["young"])
    if not a["missing"]:
        logger.info("○ 全部、帳面のどちらかの節に入っています")
        return
    logger.warning("✕ 帳面に入っていない: %d件", len(a["missing"]))
    for e in a["missing"]:
        logger.warning("  #%s %s %s", e["issue"], e["at"][:10], e["url"])


def main(argv=None, gh=None, now=None) -> int:
    ap = argparse.ArgumentParser(description="ショートへのあやとの指摘が、帳面に入っているかを見張る")
    ap.add_argument("--branches", action="store_true", help="全部の枝の帳面を合わせて数える")
    ap.add_argument("--ledger", action="append", default=[], help="帳面のファイル（何本でも）。既定は手元の帳面")
    ap.add_argument("--from", dest="src", help="置いておいた issue とコメント（--save で作ったもの）")
    ap.add_argument("--save", help="読んだ issue とコメントを置いておく")
    ap.add_argument("--grace-hours", type=float, default=GRACE_HOURS, help="書いてから何時間は数えないか")
    ap.add_argument("--apply", action="store_true", help="issue を実際に開く／書き換える／閉じる")
    a = ap.parse_args(argv)

    now = now or datetime.now(timezone.utc)
    token = os.getenv("GITHUB_TOKEN") or os.getenv("GH_TOKEN") or ""
    gh = gh or Gh(os.getenv("GITHUB_REPOSITORY") or ledger.REPO, token)

    issues = None
    try:
        if a.src:
            issues = json.loads(Path(a.src).read_text(encoding="utf-8"))
        else:
            issues = gather(gh)
    except (urllib.error.URLError, OSError, ValueError, KeyError) as e:
        # 返ってきた本文は出さない（ログは公開）
        logger.error("issue を読めませんでした: %s", str(e)[:200])
    if a.save and issues is not None:
        Path(a.save).write_text(json.dumps(issues, ensure_ascii=False, indent=1), encoding="utf-8")

    texts = []
    for p in a.ledger or ([] if a.branches and not ledger.PATH.exists() else [str(ledger.PATH)]):
        try:
            texts.append(Path(p).read_text(encoding="utf-8"))
        except OSError as e:
            logger.error("帳面を読めません: %s", e)
    if a.branches:
        try:
            names = gh.branches()
            got = [(n, gh.ledger_at(n)) for n in names]
            have = [t for _, t in got if t is not None]
            logger.info("枝 %d本のうち %d本に帳面があります", len(names), len(have))
            texts += have
        except (urllib.error.URLError, OSError, ValueError, KeyError) as e:
            logger.error("枝の帳面を読めませんでした: %s", str(e)[:200])
            texts = []
    s = survey(issues, read_refs(texts), now, a.grace_hours)
    say(s)

    if a.apply:
        if not getattr(gh, "token", "x"):
            logger.error("--apply には GITHUB_TOKEN が要ります")
            return 2
        try:
            run(gh, s, apply=True)
        except (urllib.error.URLError, OSError, ValueError) as e:
            logger.error("issue を合わせられませんでした（権限 issues: write を見る）: %s", str(e)[:200])
            return 2
    if s["down"] is None:
        return 2
    return 1 if s["down"] else 0


if __name__ == "__main__":
    sys.exit(main())
