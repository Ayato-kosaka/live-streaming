"""**街のガイドを Actions で1本回した結果を、PR の1コメント（表1枚）にする。**（`heavy_watch.yml` の `guide`）

    python3 python/guide_run.py run --rows rows.tsv --name <名前> -- <コマンド…>    # 回して、1段ぶんの行を足す
    python3 python/guide_run.py row <名前> <終了コード> <ログ> --rows rows.tsv   # 回した結果から行を足す
    python3 python/guide_run.py report --rows rows.tsv --pr 1338 --guide romania/bucharest [--dry]

`report` は同じ run の重い見張り（`browserwatch`・`reachwatch`）の job と step も API で読んで、表に足す。
同じ PR に何度押しても、コメントは1つ（頭の印 `<!-- guide-run -->`）を書き換える。増やさない。

終了コード: `row` は 0。`report` は 0=書いた / 2=GitHub に書けない。表が赤くても 0
（赤は表で読む。ここが赤くなると「書けなかった」と区別がつかない）。

## なぜ（2026-11-20）

ブカレスト・スコピエ・記事15本で、トークンを食ったのは作業箱で回した重い処理（写真・焼き・書体・見張り・撮影）と、
その長いログを読む往復だった。担当は**この表だけ読む**。赤い行には落ちた所の1行が付いているので、ログを開くのはその1行で
分からないときだけ。

## 行の読みかた

| 印 | 終了コード | 意味 |
| --- | --- | --- |
| 緑 | 0 | 通った |
| 赤 | 1 | 見つかった（直すもの） |
| 黄 | 2 ほか | 数えられなかった（**合格と読まない**。道具か置き場のほう） |
| ─ | `skip` | この回は回さなかった（理由は落ちた所の欄） |
| ⏳ | `wait` | 重い見張りがまだ走っている（終われば同じコメントが書き換わる） |
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

MARK = "<!-- guide-run -->"
ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")
# 落ちた所の1行に使わない行（道具が最後に出す決まり文句・終了コードの行）
NOISE = re.compile(r"^(── .*終了コード|exit code|Error: Process completed)|^\s*$")
HEAVY_JOBS = ("browserwatch", "reachwatch")
# 重い見張りの step のうち、表に出さないもの（土台。落ちたら job の行で分かる）
SETUP = re.compile(r"^(Set up job|Run actions/|Post |Complete job|.*依存を入れる|ブラウザを入れる|書き出す|"
                   r"先の日で|住人の名簿|落とした絵|住人の絵|Run actions)")


def last_line(text: str, width: int = 160) -> str:
    """ログの終わりから、意味のある1行。"""
    for line in reversed(ANSI.sub("", text).splitlines()):
        line = line.strip()
        if not NOISE.search(line):
            line = line.replace("|", "／")
            return line if len(line) <= width else line[: width - 1] + "…"
    return ""


def add_row(rows: Path, name: str, rc: str, log: Path | None) -> str:
    text = log.read_text(encoding="utf-8", errors="replace") if log and log.exists() else ""
    why = "" if rc == "0" else last_line(text)
    with rows.open("a", encoding="utf-8") as f:
        f.write(f"{name}\t{rc}\t{why}\n")
    return why


def read_rows(rows: Path) -> list[tuple[str, str, str]]:
    out = []
    if rows.exists():
        for line in rows.read_text(encoding="utf-8").splitlines():
            parts = (line.split("\t") + ["", ""])[:3]
            if parts[0]:
                out.append((parts[0], parts[1], parts[2]))
    return out


def run(rows: Path, name: str, cmd: list[str]) -> int:
    """回して、出力をそのまま流し（ログにも残す）、行を1つ足す。**終了コードは返すが、step は止めない**
    （呼ぶ側が `|| true` を付けなくてよいように、ここは常に 0 で帰る）。"""
    log = rows.parent / f"log-{len(read_rows(rows)):02d}.txt"
    with log.open("w", encoding="utf-8") as f:
        try:
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                                    encoding="utf-8", errors="replace")
        except OSError as e:
            f.write(f"起こせなかった: {e}\n")
            rc = 2
        else:
            for line in proc.stdout:
                sys.stdout.write(line)
                f.write(line)
            rc = proc.wait()
    why = add_row(rows, name, str(rc), log)
    print(f"── {mark(str(rc))} {name}（終了コード {rc}）{why}")
    return rc


def mark(rc: str) -> str:
    if rc == "wait":
        return "⏳"
    if rc == "0" or rc == "success":
        return "🟢"
    if rc in ("skip", "skipped"):
        return "─"
    if rc in ("1", "failure"):
        return "🔴"
    return "🟡"


def heavy_rows(jobs: list[dict]) -> list[tuple[str, str, str]]:
    """同じ run の重い見張り。job ごとに1行、赤い job は落ちた step も1行ずつ。"""
    out = []
    for name in HEAVY_JOBS:
        job = next((j for j in jobs if j.get("name") == name), None)
        if job is None:
            out.append((f"重い見張り {name}", "skip", "この run に job が無い"))
            continue
        if job.get("status") != "completed":
            out.append((f"重い見張り {name}", "wait", job.get("status") or "?"))
            continue
        c = job.get("conclusion") or "?"
        rc = {"success": "0", "failure": "1", "skipped": "skip", "cancelled": "2"}.get(c, "2")
        out.append((f"重い見張り {name}", rc, "" if rc == "0" else c))
        for st in job.get("steps") or []:
            if st.get("conclusion") == "failure" and not SETUP.match(st.get("name", "")):
                out.append((f"　└ {st['name']}", "1", "ログのこの step"))
    return out


def table(guide: str, sha: str, rows: list[tuple[str, str, str]], run_url: str, pushed: str) -> str:
    red = sum(1 for _, rc, _ in rows if mark(rc) == "🔴")
    yellow = sum(1 for _, rc, _ in rows if mark(rc) == "🟡")
    waiting = sum(1 for _, rc, _ in rows if rc == "wait")
    head = "🟢 ぜんぶ緑" if not red and not yellow else f"🔴 赤 {red}・🟡 数えられない {yellow}"
    if waiting:
        head += f"（⏳ 重い見張り {waiting}本がまだ走っている）"
    lines = [MARK, f"### 街のガイドを回した: `{guide}`（`{sha[:7]}`）— {head}", "",
             "| 段 | 結果 | 落ちた所 |", "| --- | :---: | --- |"]
    lines += [f"| {n} | {mark(rc)} | {why} |" for n, rc, why in rows]
    lines += ["", f"積み戻し: {pushed or 'なし'} · [run]({run_url}) · artifact `guide-shots`（390幅・240px）"]
    return "\n".join(lines) + "\n"


class Gh:
    def __init__(self, repo: str, token: str):
        self.repo, self.token = repo, token

    def req(self, method: str, path: str, body: dict | None = None):
        url = path if path.startswith("http") else f"https://api.github.com/repos/{self.repo}{path}"
        data = json.dumps(body).encode() if body is not None else None
        r = urllib.request.Request(url, data=data, method=method, headers={
            "Authorization": f"Bearer {self.token}", "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28"})
        with urllib.request.urlopen(r, timeout=60) as res:
            return json.loads(res.read() or b"null")

    def comments(self, pr: int) -> list[dict]:
        out, page = [], 1
        while True:
            got = self.req("GET", f"/issues/{pr}/comments?per_page=100&page={page}") or []
            out += got
            if len(got) < 100:
                return out
            page += 1

    def jobs(self, run_id: str) -> list[dict]:
        return (self.req("GET", f"/actions/runs/{run_id}/jobs?per_page=100") or {}).get("jobs", [])


def upsert(gh, pr: int, body: str) -> str:
    """印の付いたコメントがあれば書き換え、無ければ1つ足す。→ "patched" / "posted" """
    mine = [c for c in gh.comments(pr) if (c.get("body") or "").startswith(MARK)]
    if mine:
        gh.req("PATCH", f"/issues/comments/{mine[0]['id']}", {"body": body})
        return "patched"
    gh.req("POST", f"/issues/{pr}/comments", {"body": body})
    return "posted"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    x = sub.add_parser("run")
    x.add_argument("--rows", type=Path, required=True)
    x.add_argument("--name", required=True)
    x.add_argument("command", nargs=argparse.REMAINDER, help="-- のあとに回すコマンド")
    r = sub.add_parser("row")
    r.add_argument("name")
    r.add_argument("rc")
    r.add_argument("log", nargs="?", type=Path)
    r.add_argument("--rows", type=Path, required=True)
    p = sub.add_parser("report")
    p.add_argument("--rows", type=Path, required=True)
    p.add_argument("--pr", type=int, required=True)
    p.add_argument("--guide", required=True)
    p.add_argument("--sha", default=os.environ.get("GITHUB_SHA", ""))
    p.add_argument("--pushed", default="")
    p.add_argument("--dry", action="store_true", help="書かずに表を出すだけ")
    a = ap.parse_args(argv)

    if a.cmd == "run":
        cmd = a.command[1:] if a.command[:1] == ["--"] else a.command
        if not cmd:
            ap.error("run は -- のあとにコマンドが要る")
        run(a.rows, a.name, cmd)
        return 0
    if a.cmd == "row":
        why = add_row(a.rows, a.name, a.rc, a.log)
        print(f"{mark(a.rc)} {a.name} {a.rc} {why}")
        return 0

    repo = os.environ.get("GITHUB_REPOSITORY", "Ayato-kosaka/live-streaming")
    run_id = os.environ.get("GITHUB_RUN_ID", "")
    run_url = f"{os.environ.get('GITHUB_SERVER_URL', 'https://github.com')}/{repo}/actions/runs/{run_id}"
    gh = Gh(repo, os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN", ""))
    rows = read_rows(a.rows)
    try:
        if run_id:
            rows += heavy_rows(gh.jobs(run_id))
        body = table(a.guide, a.sha, rows, run_url, a.pushed)
        print(body)
        summary = os.environ.get("GITHUB_STEP_SUMMARY")
        if summary:
            with open(summary, "a", encoding="utf-8") as f:
                f.write(body)
        if a.dry:
            return 0
        print(f"PR #{a.pr} のコメント: {upsert(gh, a.pr, body)}")
    except (urllib.error.URLError, OSError, ValueError) as e:
        print(f"!! GitHub に書けなかった: {e}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
