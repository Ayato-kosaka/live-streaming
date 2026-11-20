"""**`docs/island-misses.md` に次に足す節の番号を、開いている PR まで見て出す。**

    python3 python/misses_next.py           # 次の番号を1つだけ出す（例: 341）
    python3 python/misses_next.py --why     # どの番号を、master・どの PR・この枝が持っているかも出す

終了コード 0=出せた / 2=数えられなかった（GitHub に届かない・見出しが1つも取れない）。
**2 のときは番号を出さない。** 数えずに「最大の次」を出すと、まさに下の事故になる。

## なぜ要るか（2026-11-20）

番号は「足す直前に `git fetch` して、master の最大の次」を人が採っていた（`misses_num_selftest.py` の頭）。
**master しか見ていないので、並行する PR が先に採った番号が見えない。** 街のガイドを3〜4本並べて回した
2026-11-19〜20 に、#337〜#339 を2本ずつが同時に採り、マージのたびに `misses_num_selftest` が赤くなった。

ここは**採る前に見る道具**。master・開いている PR ぜんぶ・いまの枝の3つから、節の番号（`## #N`）を集めて、
いちばん大きい番号の次を出す。番号を書き換える道具ではない（書き換えると、マージのたびに衝突が増える）。
採り間違いを鳴らすのは今までどおり `misses_num_selftest.py`。

## 何を見るか

| どこ | どう読むか |
| --- | --- |
| master | `docs/island-misses.md` の中身（API）を `misses_num_selftest.split()` で読む（昔の `### #N` の節も数える） |
| 開いている PR | そのファイルを触っている PR だけ。差分の足した行（`+## #N`）。差分が大きすぎて API が `patch` を返さないときは、枝の先のファイルそのものを読む |
| いまの枝 | 手元のファイル（自分がもう足した番号） |

PR の差分は**節の深さ（`##`）だけ**数える。`### #104 …` は節の中の小見出しで、ほかの節を指しているだけ。
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from misses_num_selftest import DOC, Broken, split  # noqa: E402

PATH = "docs/island-misses.md"
REPO_SLUG = "Ayato-kosaka/live-streaming"
# 足した行のうち、節の見出し（いまの深さ）。`### #N` は小見出しなので数えない
ADDED_RE = re.compile(r"^\+## #(\d+)\b")


def numbers(text: str) -> set[int]:
    """1つのファイルの中身から、節の番号を全部。"""
    sections, _ = split(text)
    return {n for _, n, _ in sections}


def added(patch: str) -> set[int]:
    """差分（unified diff）の足した行から、節の番号。"""
    return {int(m.group(1)) for line in patch.splitlines() if (m := ADDED_RE.match(line))}


def gh_json(path: str) -> object:
    """`gh api` を1回（`--paginate` で全ページ）。配列はつなげて返す。"""
    out = subprocess.run(["gh", "api", "--paginate", "--slurp", path],
                         capture_output=True, text=True, timeout=120)
    if out.returncode != 0:
        raise Broken(f"gh api {path} が {out.returncode}: {out.stderr.strip()[:200]}")
    # `--slurp` はページの配列を返す（[[…], […]]）。1本につなぐ
    pages = json.loads(out.stdout or "[]")
    return [x for page in pages for x in (page if isinstance(page, list) else [page])]


def gh_raw(path: str) -> str:
    out = subprocess.run(["gh", "api", "-H", "Accept: application/vnd.github.raw", path],
                         capture_output=True, text=True, timeout=120)
    if out.returncode != 0:
        raise Broken(f"gh api {path} が {out.returncode}: {out.stderr.strip()[:200]}")
    return out.stdout


class GitHub:
    """読むのは3つだけ。selftest は同じ形の偽物を渡す。"""

    def __init__(self, repo: str = REPO_SLUG):
        self.repo = repo

    def file(self, ref: str) -> str:
        return gh_raw(f"repos/{self.repo}/contents/{PATH}?ref={ref}")

    def open_prs(self) -> list[dict]:
        return list(gh_json(f"repos/{self.repo}/pulls?state=open&per_page=100") or [])

    def pr_files(self, n: int) -> list[dict]:
        return list(gh_json(f"repos/{self.repo}/pulls/{n}/files?per_page=100") or [])


def holders(gh, local: str | None) -> dict[str, set[int]]:
    """{持ち主: 番号}。持ち主は `master` / `#<PR>` / `この枝`。"""
    base = numbers(gh.file("master"))
    out: dict[str, set[int]] = {"master": base}
    for pr in gh.open_prs():
        n = pr["number"]
        row = next((f for f in gh.pr_files(n) if f.get("filename") == PATH), None)
        if row is None:
            continue
        if row.get("patch"):
            got = added(row["patch"])
        else:
            # 差分が大きすぎると API は patch を返さない。枝の先のファイルを読んで、master に無い番号を取る
            got = numbers(gh.file(pr["head"]["sha"])) - base
        if got:
            out[f"#{n}"] = got
    if local is not None:
        mine = numbers(local) - base
        if mine:
            out["この枝"] = mine
    return out


def next_number(held: dict[str, set[int]]) -> int:
    every = set().union(*held.values())
    if not every:
        raise Broken("番号を1つも集められなかった")
    return max(every) + 1


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--why", action="store_true", help="誰がどの番号を持っているかも出す")
    ap.add_argument("--repo", default=REPO_SLUG)
    a = ap.parse_args(argv)
    local = DOC.read_text(encoding="utf-8") if DOC.exists() else None
    try:
        held = holders(GitHub(a.repo), local)
        nxt = next_number(held)
    except (Broken, json.JSONDecodeError, subprocess.TimeoutExpired, OSError) as e:
        print(f"!! 数えられなかった: {e}", file=sys.stderr)
        return 2
    if a.why:
        top = max(held["master"])
        print(f"master のいちばん大きい番号 #{top}")
        for who, ns in held.items():
            if who != "master":
                print(f"  {who}: " + " ".join(f"#{x}" for x in sorted(ns)))
        print(f"次に使える番号: #{nxt}")
    else:
        print(nxt)
    return 0


if __name__ == "__main__":
    sys.exit(main())
