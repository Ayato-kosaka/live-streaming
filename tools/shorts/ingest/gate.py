"""Cookie（`YOUTUBE_COOKIES`）を使い始めてよいかを、**時計ではなく Actions の実際の状態で**決める。

    python3 tools/shorts/ingest/gate.py --list     # 見るワークフローの一覧（いまの .github/workflows から）
    python3 tools/shorts/ingest/gate.py --once     # 1回だけ見て判定を出す（待たない）

plan.py（取る前）と download.py（1本ごと）がここを通る。

## なぜ時計をやめたか（2026-10-18）

前は 21:15〜23:59 UTC を「毎晩の取り込みの時間帯」として止めていた。ところが
毎晩の取り込みは時刻どおりには走らない（遅れは `python3 python/cron_lag.py` で測る。
この日に測ったときは、20:00 UTC の cron が直近30日で 21:54〜01:48 UTC に来ていた）。だから時計の枠は、

- **ぶつかるのを防げていない** — 00:05・01:03・01:45 UTC に走った晩がある（枠の外）
- **空いている時間まで止めている** — 取り込みは1回3分ほどで終わる。22:08〜22:12 に走った晩に、
  20:25 に頼んだ取り込みが 00:00 まで3時間半待たされた（2026-10-18）

そこで「いま Cookie を握っているワークフローの run が在るか」を Actions の API で見る。

## 何を見るか

- **どのワークフローか** — `.github/workflows/*.yml` のうち、**コメントでない行**に
  `YOUTUBE_COOKIES` が出てくるもの（自分＝ショートの取り込みは数えない）。
  **一覧は手で並べない。** 見るたびに grep して求める（あちらが増えた日に黙ってずれないように）。
  コメントだけで名前を出しているもの（`rebake.yml` など）は Cookie を握らないので数えない
- **どの状態か** — `requested` / `queued` / `in_progress`、plan では `pending` も。
  `pending` は GitHub が「同じ concurrency の枠が空くのを待っている」run に付ける状態。
  **download.py（fetch の job の中）では数えない。** master で回したとき、fetch の job は
  毎晩の取り込みと同じ枠（`fetch-chat-refs/heads/master`）を握っているので、あちらの
  `pending` は**こちらが終わるのを待っている**。それを待つと、互いに待って60分止まる。
  plan は枠を握らないので、`pending` も「もうすぐ動くもの」として待つ
- 自分の run は数えない

## 動いていたら

1分ごとに見直して、最長60分待つ（1回の job の中で使い回す。download.py が1本ごとに
待っても、合わせて60分まで）。待ち切れたら止める。理由はログに1行で出る。

## API が読めないとき

権限が無い・通信に落ちた・置き場が動いて見るワークフローが0本、のどれかなら、
**前の時計の枠で決める**（枠の中なら止める）。読めないまま「通る」に倒さない。
ただし、**一度「動いている」と読めたあとで読めなくなったら、まだ動いているとみなして待つ**
（読めなくなったあいだに終わったとは言えないので）。
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import NO_GO_FROM, in_no_go  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
WF_DIR = ".github/workflows"
SECRET = "YOUTUBE_COOKIES"
# ショートの取り込みそのもの。同じ枝どうしは fetch の job の concurrency が並ばせる
SELF = "shorts_ingest.yml"
BUSY = ("requested", "queued", "in_progress")
# 枠の空き待ち。plan では待つ（count_pending=True）、fetch の job の中では数えない
HELD = ("pending", "waiting")
MAX_WAIT = 3600
EVERY = 60
# 最初の1回が読めないときに、時計に倒す前に読み直す回数（瞬間の通信落ちで時計に戻らない）
FIRST_TRIES = 3
RETRY_SEC = 10
# 見るワークフローの run は新しい順にこれだけ。毎晩の取り込みは1日1本＋手で押したぶん
PER_PAGE = 20

ListRuns = Callable[[str], list]


class Unreadable(Exception):
    """Actions の run の一覧が読めない（権限・通信・形）。"""


def uses_secret(text: str) -> bool:
    """コメントでない行に `YOUTUBE_COOKIES` が在るか。

    YAML のコメントも、`run: |` の中のシェルのコメントも `#` の前が行頭か空白なので、
    そこから後ろを捨てて見る（`${key#prefix}` のような `#` は前が空白でないので残る）。
    """
    for line in text.splitlines():
        body = re.split(r"(?:^|\s)#", line, maxsplit=1)[0]
        if SECRET in body:
            return True
    return False


def self_names() -> set[str]:
    out = {SELF}
    m = re.search(r"/\.github/workflows/([^/@]+)@", os.environ.get("GITHUB_WORKFLOW_REF", ""))
    if m:
        out.add(m.group(1))
    return out


def cookie_workflows(root: Path = ROOT, exclude: set[str] | None = None) -> list[str]:
    """Cookie を握るワークフロー（ファイル名）を、いまの置き場から grep して求める。"""
    skip = exclude if exclude is not None else self_names()
    d = root / WF_DIR
    out = []
    for p in sorted(list(d.glob("*.yml")) + list(d.glob("*.yaml"))):
        if p.name in skip:
            continue
        try:
            text = p.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        if uses_secret(text):
            out.append(p.name)
    return out


def api_lister(repo: str, token: str, api: str = "https://api.github.com") -> ListRuns:
    """ワークフロー1本ぶんの run を新しい順に返す口。読めなければ Unreadable。"""

    def list_runs(wf: str) -> list:
        if not repo:
            raise Unreadable("GITHUB_REPOSITORY が無い")
        url = (f"{api}/repos/{repo}/actions/workflows/{wf}/runs"
               f"?per_page={PER_PAGE}&exclude_pull_requests=true")
        req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json",
                                                   "X-GitHub-Api-Version": "2022-11-28"})
        if token:
            req.add_header("Authorization", f"Bearer {token}")
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                d = json.load(r)
        except urllib.error.HTTPError as e:
            raise Unreadable(f"{wf} が HTTP {e.code}") from None
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as e:
            raise Unreadable(f"{wf} が {type(e).__name__}") from None
        runs = d.get("workflow_runs") if isinstance(d, dict) else None
        if not isinstance(runs, list):
            raise Unreadable(f"{wf} の返事に workflow_runs が無い")
        return runs

    return list_runs


def scan(workflows: list[str], list_runs: ListRuns, own_run: str = "",
         count_pending: bool = True) -> dict:
    """いま Cookie を握っている（握りかけている）run（busy）と、数えない枠の空き待ち（held）。"""
    busy, held = [], []
    for wf in workflows:
        for r in list_runs(wf):
            if own_run and str(r.get("id")) == str(own_run):
                continue
            row = {"workflow": wf, "id": r.get("id"), "status": r.get("status"),
                   "branch": r.get("head_branch") or "",
                   "since": r.get("run_started_at") or r.get("created_at") or ""}
            if row["status"] in BUSY or (count_pending and row["status"] == "pending"):
                busy.append(row)
            elif row["status"] in HELD:
                held.append(row)
    return {"busy": busy, "held": held}


def describe(rows: list[dict]) -> str:
    out = []
    for r in rows:
        t = r["since"][11:16] + " UTC から" if len(r["since"]) >= 16 else "時刻不明"
        out.append(f"{r['workflow']} #{r['id']}（{r['status']}・{r['branch'] or '?'}・{t}）")
    return "、".join(out)


@dataclass
class Verdict:
    ok: bool
    # clear（動いていない）/ timeout（待ち切れ）/ clock-go・clock-stop（読めずに時計で決めた）
    how: str
    why: str
    waited: float = 0.0
    log: list[str] = field(default_factory=list)


class Gate:
    """待ちの持ち時間（max_wait）は、この1つの Gate で使い回す。"""

    def __init__(self, workflows: list[str], list_runs: ListRuns, *, own_run: str = "",
                 count_pending: bool = True, max_wait: float = MAX_WAIT, every: float = EVERY,
                 clock: Callable[[], float] = time.monotonic,
                 sleep: Callable[[float], None] = time.sleep,
                 now: Callable[[], dt.datetime] | None = None,
                 log: Callable[[str], None] = lambda s: print(s, flush=True)):
        self.workflows = list(workflows)
        self.list_runs = list_runs
        self.own_run = own_run
        self.count_pending = count_pending
        self.max_wait = max_wait
        self.left = max_wait
        self.every = every
        self.clock = clock
        self.sleep = sleep
        self.now = now or (lambda: dt.datetime.now(dt.timezone.utc))
        self._log = log

    @classmethod
    def from_env(cls, **kw) -> "Gate":
        e = os.environ.get
        lister = api_lister(e("GITHUB_REPOSITORY", ""), e("GH_TOKEN") or e("GITHUB_TOKEN") or "",
                            e("GITHUB_API_URL") or "https://api.github.com")
        return cls(cookie_workflows(), lister, own_run=e("GITHUB_RUN_ID", ""), **kw)

    def heading(self) -> str:
        return (f"見るワークフロー（{SECRET} を使うもの。自分を除く）{len(self.workflows)}本: "
                f"{', '.join(self.workflows) or 'なし'}")

    def _clock(self, why: str, lines: list[str]) -> Verdict:
        t = self.now()
        frm = f"{NO_GO_FROM[0]}:{NO_GO_FROM[1]:02d}〜23:59"
        if in_no_go(t):
            return Verdict(False, "clock-stop",
                           f"{why} → 時計の枠で見る: いま {t:%H:%M} UTC は {frm} の中 → 止める"
                           "（00:00 UTC を過ぎてから依頼を push し直す）", 0.0, lines)
        return Verdict(True, "clock-go",
                       f"{why} → 時計の枠で見る: いま {t:%H:%M} UTC は {frm} の外 → 通る", 0.0, lines)

    def wait(self) -> Verdict:
        lines: list[str] = []

        def say(s: str) -> None:
            lines.append(s)
            self._log(s)

        if not self.workflows:
            # **0 を「何も動いていない」と読まない。** 置き場が動いたか、grep が壊れた
            return self._clock("Cookie を使うワークフローが1本も見つからない", lines)
        t0 = self.clock()
        seen_busy: list[dict] = []
        fails = 0
        while True:
            try:
                s = scan(self.workflows, self.list_runs, self.own_run, self.count_pending)
            except Unreadable as e:
                if not seen_busy:
                    fails += 1
                    if fails < FIRST_TRIES:
                        say(f"   Actions が読めない（{e}）。{RETRY_SEC}秒あけて読み直す")
                        self.sleep(RETRY_SEC)
                        continue
                    self.left = max(0.0, self.left - (self.clock() - t0))
                    return self._clock(f"Actions が読めない（{e}）", lines)
                say(f"   Actions が読めない（{e}）。さっきまで動いていたので、まだ動いているとみなす")
                busy = seen_busy
            else:
                busy = s["busy"]
                if s["held"]:
                    say(f"   枠の空き待ち（数えない）: {describe(s['held'])}")
                if not busy:
                    waited = self.clock() - t0
                    self.left -= waited
                    if seen_busy:
                        why = f"毎晩の取り込みが終わった（{waited / 60:.0f}分待った） → 通る"
                    else:
                        why = f"毎晩の取り込み（Cookie を使うもの {len(self.workflows)}本）は動いていない → 通る"
                    return Verdict(True, "clear", why, waited, lines)
                seen_busy = busy
            waited = self.clock() - t0
            if waited >= self.left:
                self.left = 0
                how = (f"{self.max_wait / 60:.0f}分待っても終わらない" if self.max_wait > 0
                       else "動いている（待たない）")
                return Verdict(False, "timeout", f"{how}: {describe(busy)} → 止める", waited, lines)
            say(f"   動いている: {describe(busy)} → 待つ（{waited / 60:.0f}分目・"
                f"残り {(self.left - waited) / 60:.0f}分）")
            self.sleep(min(self.every, self.left - waited))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--once", action="store_true")
    a = ap.parse_args()
    gate = Gate.from_env(max_wait=0)
    print(gate.heading())
    if a.list or not a.once:
        return 0
    v = gate.wait()
    print(f"判定: {v.why}")
    return 0 if v.ok else 1


if __name__ == "__main__":
    sys.exit(main())
