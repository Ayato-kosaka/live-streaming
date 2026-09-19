"""**素性を出す口の手前に、素性の見張りが置いてあるか**をワークフローから見る。

    python3 python/logsafe_wiring_selftest.py

BigQuery も Firestore も引かない。ネットワークも認証も要らない。
読むのは `.github/workflows/*.yml` と `python/` のソースだけ。

## なぜ要るか（#500）

`python/logsafe_selftest.py` は「公開の Actions ログに視聴者さんの素性
（チャンネルID・名前・ハンドル・どねID・uid）が出ないこと」を守る見張りで、
**中身はよく出来ている。** 困るのは中身ではなく**置き場所**だった。

あれは走らせて初めて効く。走らせていない job で素性を出す口を回すと、
守りが寝ているかどうかを誰も見ないまま明細が公開のログへ積まれる。
2026-09-19 まで `schedule_fetch_chat.yml`——**いちばん明細を出す毎晩の口**——に
繋がっておらず、漏れても別のワークフローが**翌日**に気づく形だった。
つまり最長1日、公開のログに出たままになる（過去に3回出ている。#180 #217 #379）。

置き忘れは `logsafe_selftest.py` 自身には映らない。あれは呼ばれた回しか
動かないので、**呼ばれていない job のことは何も言えない。**
だからここで、**ワークフローの側から**見る。

**#500 が名指ししていたのは1本だけだが、同じ形が7本あった。**
指摘は「見つかった1件」であって「直すべき全部」ではない（`island-misses.md` #5 #6）。

## 何を見るか

1. `python/` の中で `logsafe` を取り込んでいるものを**口**と呼ぶ（素性の明細を
   出しうるもの）
2. ワークフローの各 job の step を上から順に読み、`python …/x.py` の形で
   何を起こしているかを拾う
3. 起こしたものから**取り込みを辿って**、口に行き着くかを見る。
   `discover_videos.py` は自分では `logsafe` を取り込まないが、
   `youtube_api/discovery.py` を経由して口に届く。**1段しか見ないと見逃す**
4. 口に届く step より**手前の同じ job**に `python3 python/logsafe_selftest.py`
   が無ければ、そこを挙げる

**「同じ job」であることが要る。** job が違えばランナーが別なので、隣の job で
見張りが通っていても、こちらの出力は1文字も守られていない。
`schedule_fetch_chat.yml` の `island_stats` は `if: always()` なので
**手前の job が赤くても走る。** 手前の job に置いただけでは塞がらない。

**見張り（`*_selftest.py`）を起こす step は口として数えない。** あれが触るのは
こしらえた値だけで、本番の素性を1つも持たない。数えると、見張りを足すほど
「口が増えた」ことになって、足すのが損になる。

## 対照（`docs/island-standards.md` §15）

守っているのが「置き忘れ」なので、**この見張りが寝ていても本番の出力は満点と
同じ顔**になる。だからこしらえた yaml を食わせて、両側から当てる。

| | 食わせるもの | 欲しい答え |
| --- | --- | --- |
| 1 | いまのリポジトリ | 挙がるものが**無い** |
| 2 | 見張りの step を**消した**写し | 口のある job が挙がる |
| 3 | 見張りを口の**うしろ**へ動かした写し | 2 と**同じ**job が挙がる |
| 4 | 口を1つも起こさない job（見張りも無い） | 挙がらない |
| 5 | 見張りを**隣の job**にだけ置いた写し | 口のある job が挙がる |
| 6 | 取り込みを**辿らない**ことにした写し | 見つかる口が**減る** |

2 と 3 は**対**で見る。2 だけだと「step が在るかどうかしか見ていない見張り」でも
通ってしまう。4 が要るのは、何にでも赤を出すものは見張りではないから（#125）。
5 は、`island_stats` が `if: always()` で走るという、このリポジトリ固有の足。

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**（`island-standards.md` §15）。
"""

from __future__ import annotations

import ast
import copy
import re
import sys
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parent.parent
PYDIR = REPO / "python"
WFDIR = REPO / ".github" / "workflows"

# 手前に置いてほしい見張り
GUARD = "python/logsafe_selftest.py"

# `python x.py` / `python3 -u x.py` / `python  path/to/x.py --days 3` を拾う
RUN_PY = re.compile(r"\bpython3?\b((?:\s+-[A-Za-z]\S*)*)\s+(\S+\.py)")


def mouths() -> set[Path]:
    """`logsafe` を取り込んでいるもの＝素性の明細を出しうる口。"""
    found = set()
    for p in PYDIR.rglob("*.py"):
        if p.name.endswith("_selftest.py"):
            continue
        src = p.read_text(encoding="utf-8", errors="ignore")
        if re.search(r"^\s*(import logsafe|from logsafe import)", src, re.M):
            found.add(p.resolve())
    return found


def _module_paths(name: str, here: Path) -> list[Path]:
    """`a.b` を、実際に在りうるファイルの並びへ直す。

    スクリプトは `python python/x.py` の形で起きるので、探し先は**そのファイルの
    隣**と `python/`。`python/admin/` のものは自分で `sys.path` を足しているので
    そこも見る。
    """
    rel = Path(*name.split("."))
    out = []
    for base in (here, PYDIR, PYDIR / "admin"):
        out.append(base / f"{rel}.py")
        out.append(base / rel / "__init__.py")
    return out


def imports_of(path: Path) -> set[Path]:
    """そのファイルが取り込んでいる `python/` の中のファイル（1段ぶん）。"""
    try:
        tree = ast.parse(path.read_text(encoding="utf-8", errors="ignore"))
    except SyntaxError:
        return set()
    names: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names += [a.name for a in node.names]
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            names.append(node.module)
    out = set()
    for n in names:
        for cand in _module_paths(n, path.parent):
            if cand.is_file():
                out.add(cand.resolve())
                break
    return out


def reaches_mouth(start: Path, mouth_set: set[Path], *, follow: bool = True) -> bool:
    """起こしたものから、取り込みを辿って口に届くか。

    `follow=False` は**対照のための足外し**。辿らないと何本見逃すかを出す。
    """
    if not start.is_file():
        return False
    start = start.resolve()
    if start in mouth_set:
        return True
    if not follow:
        return False
    seen = {start}
    stack = [start]
    while stack:
        cur = stack.pop()
        for nxt in imports_of(cur):
            if nxt in seen:
                continue
            if nxt in mouth_set:
                return True
            seen.add(nxt)
            stack.append(nxt)
    return False


def _scripts_in(step: dict, job_wd: str) -> list[Path]:
    """1つの step が起こす `.py` を、リポジトリ直下からの道で返す。"""
    run = step.get("run")
    if not isinstance(run, str):
        return []
    wd = step.get("working-directory") or job_wd or "."
    return [(REPO / wd / rel).resolve() for _flags, rel in RUN_PY.findall(run)]


def is_guard(step: dict, job_wd: str = "") -> bool:
    return (REPO / GUARD).resolve() in _scripts_in(step, job_wd)


def audit(doc: dict, mouth_set: set[Path], *, follow: bool = True) -> list[str]:
    """1本のワークフローを読んで、手前に見張りの無い口を挙げる。"""
    bad = []
    for job_name, job in (doc.get("jobs") or {}).items():
        if not isinstance(job, dict):
            continue
        job_wd = ((job.get("defaults") or {}).get("run") or {}).get("working-directory", "")
        guarded = False
        for step in job.get("steps") or []:
            if not isinstance(step, dict):
                continue
            paths = _scripts_in(step, job_wd)
            if is_guard(step, job_wd):
                guarded = True
                continue
            if guarded:
                continue
            for p in paths:
                # 見張りを起こす step は口として数えない（こしらえた値しか触らない）
                if p.name.endswith("_selftest.py"):
                    continue
                if reaches_mouth(p, mouth_set, follow=follow):
                    bad.append(f"{job_name} / {step.get('name', '(名無し)')} → "
                               f"{p.relative_to(REPO).as_posix()}")
                    break
    return bad


def _drop_guard(doc: dict) -> dict:
    """見張りの step を取り除いた写しを作る。"""
    out = copy.deepcopy(doc)
    for job in (out.get("jobs") or {}).values():
        if isinstance(job, dict):
            job["steps"] = [s for s in (job.get("steps") or [])
                            if not (isinstance(s, dict) and is_guard(s))]
    return out


def _move_guard_last(doc: dict) -> dict:
    """見張りを、その job のいちばん**うしろ**へ動かした写しを作る。"""
    out = _drop_guard(doc)
    src_jobs = doc.get("jobs") or {}
    for name, job in (out.get("jobs") or {}).items():
        had = any(isinstance(s, dict) and is_guard(s)
                  for s in (src_jobs.get(name) or {}).get("steps") or [])
        if had:
            job["steps"].append({"name": "うしろに置いた見張り", "run": f"python3 {GUARD}"})
    return out


# ----------------------------------------------------------------------
# こしらえた yaml（対照用）。**本番の値は1つも置かない**
FAKE_QUIET = yaml.safe_load("""
name: 何も出さない
jobs:
  quiet:
    runs-on: ubuntu-latest
    steps:
      - run: python python/fund_daily.py --days 3
""")

FAKE_NEIGHBOUR = yaml.safe_load(f"""
name: 隣の job にだけ見張りがある
jobs:
  guarded:
    runs-on: ubuntu-latest
    steps:
      - run: python3 {GUARD}
  loud:
    runs-on: ubuntu-latest
    needs: guarded
    steps:
      - run: python python/island_tips.py
""")


def main() -> int:
    mouth_set = mouths()
    if not mouth_set:
        print("!! `logsafe` を取り込んでいるものが1つも無い。数えるものが無い")
        return 2

    wfs = sorted(WFDIR.glob("*.yml"))
    if not wfs:
        print("!! ワークフローが1本も無い。数えるものが無い")
        return 2

    docs = {}
    for wf in wfs:
        try:
            docs[wf.name] = yaml.safe_load(wf.read_text(encoding="utf-8")) or {}
        except yaml.YAMLError as e:
            print(f"!! {wf.name} が読めない: {e}")
            return 2

    print(f"口（`logsafe` を取り込んでいるもの）: {len(mouth_set)}本")
    print(f"見たワークフロー: {len(wfs)}本")
    print()

    ng = 0

    # [1] いまのリポジトリ。挙がるものが無いこと
    live = [f"{n}: {row}" for n, d in docs.items() for row in audit(d, mouth_set)]
    if live:
        print(f"[1] ✕ 手前に見張りの無い口が {len(live)}件")
        for row in live:
            print(f"      {row}")
        ng += 1
    else:
        print("[1] ○ 手前に見張りの無い口は無い")

    # 対照は、いちばん明細を出す1本で回す
    target = "schedule_fetch_chat.yml"
    if target not in docs:
        print(f"!! {target} が無い。対照を回せない")
        return 2
    base = docs[target]
    if not any(isinstance(s, dict) and is_guard(s)
               for j in (base.get("jobs") or {}).values() if isinstance(j, dict)
               for s in (j.get("steps") or [])):
        print(f"!! {target} に見張りが1本も無い。対照の当て先が無い")
        return 2

    # [2] 見張りを消す
    gone = audit(_drop_guard(base), mouth_set)
    gone_jobs = {row.split(" / ")[0] for row in gone}
    if gone_jobs:
        print(f"[2] ○ 見張りを消すと {len(gone_jobs)}つの job が挙がる"
              f"（{', '.join(sorted(gone_jobs))}／口 {len(gone)}件）")
    else:
        print("[2] ✕ 見張りを消しても1つも挙がらない。**この見張りは何も見ていない**")
        ng += 1

    # [3] 見張りをうしろへ動かす。step の有無ではなく**順番**を見ているか
    behind_jobs = {row.split(" / ")[0] for row in audit(_move_guard_last(base), mouth_set)}
    if behind_jobs and behind_jobs == gone_jobs:
        print(f"[3] ○ うしろへ動かしても同じ {len(behind_jobs)}つが挙がる（順番を見ている）")
    else:
        print(f"[3] ✕ うしろへ動かすと {sorted(behind_jobs)}。"
              f"消したとき {sorted(gone_jobs)} と違う")
        ng += 1

    # [4] 口を1つも起こさない job。何にでも赤を出すものではないこと
    if audit(FAKE_QUIET, mouth_set):
        print("[4] ✕ 口の無い job にも赤を出した。**何にでも赤を出す見張り**")
        ng += 1
    else:
        print("[4] ○ 口の無い job には何も言わない")

    # [5] 隣の job にだけ見張りがある形。ランナーが別なら守られていない
    if audit(FAKE_NEIGHBOUR, mouth_set):
        print("[5] ○ 隣の job に置いただけでは通さない")
    else:
        print("[5] ✕ 隣の job に置いただけで通した。**job をまたいで数えている**")
        ng += 1

    # [6] 取り込みを辿る足を外す。辿りが効いていること
    shallow = audit(_drop_guard(base), mouth_set, follow=False)
    if len(shallow) < len(gone):
        print(f"[6] ○ 辿りを外すと {len(gone)} → {len(shallow)} 件に減る（辿りが効いている）")
    else:
        print(f"[6] ✕ 辿りを外しても {len(shallow)} 件のまま。**1段しか見ていない**")
        ng += 1

    print()
    if ng:
        print(f"!! 落ちた項目が {ng} あります")
        return 1
    print("○ ぜんぶ通った")
    return 0


if __name__ == "__main__":
    sys.exit(main())
