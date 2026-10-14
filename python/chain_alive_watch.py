"""**繋ぎ（`workflow_run`）が生きているかを、名前と実績の両方から当てる。**

    python3 python/chain_alive_watch.py             # 4つぜんぶ（GitHub の API を読む）
    python3 python/chain_alive_watch.py --offline   # ネットに出ない2つだけ
    python3 python/chain_alive_watch.py --days 3    # 「走っていない」と言うまでの日数

終了コード 0=通った / 1=見つかった / **2=数えるものが無い**
（`docs/island-standards.md` §15）。

## なぜ要るか

`CLAUDE.md` にこう書いてある。

> **繋ぎはワークフローの `name:` で解決される。** あちらの名前を変えると
> 黙って切れる。**赤くならない。走らなくなるだけ。**

`python/workflow_link_selftest.py` が、**名前の side** を毎 PR で当てている。
ここはその続き——**名前が合っていても死ぬ3通り**を足す。

| 切れかた | 名前の見張りで止まるか | ここで止まるか |
| --- | --- | --- |
| 繋ぎ先の `name:` を書き換えた | ○ | ○（借りて出す） |
| 繋ぎ先そのものが**走らなくなった**（止めた・消した・鍵が切れた） | ✕ 名前は在る | ○ [3] |
| 繋ぎは在るのに、こちらが**一度も起きていない** | ✕ | ○ [4] |
| `conclusion` で絞ってしまい、**赤い晩だけ落ちる** | ✕ | ○ [2] |

4つ目がいちばん見つからない。繋ぎ先は毎晩走り、こちらも**ほとんどの晩は**
起きるので、一覧を見ても何もおかしくない。`schedule_fetch_chat.yml` は
**「表に無い どねID が投げ銭してきた」晩だけ** 最後の step が `exit 1` で
終わる——あれは失敗ではなく**呼び出し**で、BigQuery には入っている。
`conclusion == 'success'` で絞ると、**呼び出しの出た晩だけ焼かれない。**
月に何度かしか起きないので、気づくのは数字が古いと言われたとき。

## 「走っていない」と言うまでの日数（既定 3日）

**実測から決めた**（2026-10-14。GitHub の API から数えた）。

| 数えたもの | n | 中央の間隔 | **いちばん空いた間隔** |
| --- | ---: | ---: | ---: |
| 繋ぎ先5本の、連続する run の間隔 | 824 | 0.04〜1.00日 | **1.22日**（`Fetch YouTube Chat Data`） |
| 繋ぎを持つ13本の、**繋ぎで起きた回**の間隔 | 661 | 0.03〜0.99日 | **1.10日** |

いちばん空いたところで 1.22日。定時そのものの遅れは**最長 8.0時間**
（= 0.33日）で、上の間隔はその遅れを含んだ値。
**3日は、いちばん空いた間隔の 2.5倍。** 1日ぶん落としても赤くならず、
2晩つづけて落ちたら赤くなる。

**短くしない。** このリポジトリの定時は「もう来ないはず」と判断するまで
**最低5時間**みる決まりで（`CLAUDE.md`）、2日にすると
「遅れている晩」と「切れている」の区別がつかなくなる。

## 届かないところ（先に書いておく）

**見るのはワークフロー1本ずつで、繋ぎ1本ずつではない。** [4] は「このファイルが
**何かの**繋ぎで起きたか」しか見ないので、**受け皿を持つものは、1本目の繋ぎが
死んでいても緑になる。**

実例が在る（#865）。`ship_down.yml` の1本目は `Firebase Hosting Deploy` で、
コメントにも「読む元は1本目の run」と書いてあるのに、**毎晩の配りに対しては
死んでいる**——毎晩の配りは `rebake.yml` の中から `GITHUB_TOKEN` で押していて、
GitHub の再帰よけでその完了が次を起こさないから（人が押した配りは 84/202 で
`ship_down` を起こすが、bot が押した配りは **3/98**。2026-10-14 実測）。
それでもチャットとどねるの受け皿が毎晩起こすので、ここは [4] を通る。

繋ぎ1本ずつを見るには、**どの上流の完了と時刻がそろったか**を寄せるしかない。
足すならこの下の `judge()` に、上流の run 一覧を渡す形で。

## 対照

`python/chain_alive_watch_selftest.py` が、**作り物の run の表**を差し込んで
毎 PR で回している（ネットには出ない）。ここが落ちられることは、
本物の数字を見る前に向こうで確かめてある。
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))

# **名前の突き合わせは借りる。** ここに書き写すと、`on:` の読み方
# （PyYAML が `on:` を `True` にする癖）が2か所に散って、片方だけ直した日に
# 黙ってずれる。あちらが読み方と対照を持っていて、ここは結果を使うだけ
from workflow_link_selftest import audit, name_of, triggers, wanted  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
WFDIR = REPO / ".github" / "workflows"
API = "https://api.github.com"

# 既定の日数。上の表のとおり、実測のいちばん空いた間隔（1.22日）の 2.5倍
DAYS = 3

# 繋ぎ先1本につき API を2回まで。13本＋5本で 36回に届かない
PER_PAGE = 1


def repo_name() -> str:
    """どのリポジトリを読むか。Actions の中では環境が教えてくれる。"""
    return os.environ.get("GITHUB_REPOSITORY") or "Ayato-kosaka/live-streaming"


def token() -> str:
    return os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN") or ""


def load_docs() -> dict[str, dict]:
    """`.github/workflows/*.yml` を全部読む。読めない1本で 2 に倒す。"""
    wfs = sorted(WFDIR.glob("*.yml")) + sorted(WFDIR.glob("*.yaml"))
    docs: dict[str, dict] = {}
    for wf in wfs:
        rel = wf.relative_to(REPO).as_posix()
        docs[rel] = yaml.safe_load(wf.read_text(encoding="utf-8")) or {}
    return docs


def conclusion_gates(doc: dict) -> list[str]:
    """**`conclusion` で絞っている `if:` を挙げる。**

    拾うのは job と step の `if:` だけ。`run:` の中の字は拾わない
    ——`ticket_stock.yml` のように**ログに出すだけ**のものが在って、
    あれは絞っていない（出すのは正しい。何がこの run を起こしたかが残る）。

    `if:` に出たら、それは**走るか走らないかを決めている。**
    繋ぎ先の `conclusion` でそれを決めてよい理由はこのリポジトリには無い。
    """
    out: list[str] = []
    jobs = doc.get("jobs") if isinstance(doc, dict) else None
    if not isinstance(jobs, dict):
        return out
    for jname, job in jobs.items():
        if not isinstance(job, dict):
            continue
        cond = job.get("if")
        if isinstance(cond, str) and "workflow_run.conclusion" in cond:
            out.append(f"job「{jname}」の if:")
        for i, step in enumerate(job.get("steps") or []):
            if not isinstance(step, dict):
                continue
            cond = step.get("if")
            if isinstance(cond, str) and "workflow_run.conclusion" in cond:
                label = step.get("name") or step.get("uses") or f"{i + 1}本目"
                out.append(f"job「{jname}」の step「{label}」の if:")
    return out


def ts(s: str) -> datetime:
    """GitHub の時刻を読む。**2通りの形で返ってくる。**

    run は `2026-10-13T23:49:36Z`、ワークフローそのものは
    `2026-09-11T04:06:25.000+02:00`（**UTC ですらない**）。`%Y-…Z` だけで
    読むと、新顔を数えないところで落ちて、**本物の数字を1つも出さずに
    終わる**（実際に踏んだ）。どちらも `fromisoformat` が読む。
    """
    return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc)


class Gh:
    """GitHub を読む口。**読むだけ**（1バイトも書かない）。"""

    def __init__(self, repo: str, tok: str):
        self.repo = repo
        self.tok = tok

    def _get(self, path: str) -> dict:
        req = urllib.request.Request(API + path)
        req.add_header("Accept", "application/vnd.github+json")
        req.add_header("X-GitHub-Api-Version", "2022-11-28")
        if self.tok:
            req.add_header("Authorization", f"Bearer {self.tok}")
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
        return json.loads(raw) if raw else {}

    def latest(self, wf_file: str, event: str = "") -> dict | None:
        """そのワークフローの、いちばん新しい run を1本。無ければ None。

        **ファイル名で引く**（`name:` は人が変える。変えられたことを
        ここで見たいのに、変えられる側で引いたら意味がない）。
        """
        f = urllib.parse.quote(Path(wf_file).name)
        q = f"/repos/{self.repo}/actions/workflows/{f}/runs?per_page={PER_PAGE}"
        if event:
            q += f"&event={urllib.parse.quote(event)}"
        got = self._get(q)
        runs = got.get("workflow_runs") or [] if isinstance(got, dict) else []
        return runs[0] if runs else None

    def made_on(self) -> dict[str, str]:
        """**ワークフローが GitHub に出来た日を、1回で全部**。新顔を赤くしないため。

        1本ずつ引くと13回になる。ここは一覧で1回（この箱で、丸ごと 20秒 → 12秒）。
        返す鍵は `.github/workflows/xxx.yml`（API が `path` で返す形そのまま）。
        """
        got = self._get(f"/repos/{self.repo}/actions/workflows?per_page=100")
        out: dict[str, str] = {}
        for w in (got.get("workflows") or [] if isinstance(got, dict) else []):
            path, made = w.get("path"), w.get("created_at")
            if isinstance(path, str) and isinstance(made, str):
                out[path] = made
        return out


def live_table(docs: dict[str, dict], gh: Gh) -> dict[str, dict]:
    """本物の GitHub から、判定に要るぶんだけ引いてくる。

    返すのは `{ワークフローのファイル: {...}}`。**ここだけが外に出る。**
    下の `judge()` は表を受け取るだけなので、対照は作り物の表を差せる。
    """
    linked = sorted(p for p in docs if wanted(docs[p]))
    names = {name_of(p, d): p for p, d in docs.items()}
    targets = sorted({w for p in linked for w in wanted(docs[p]) if w in names})

    made = gh.made_on()
    table: dict[str, dict] = {}
    # 繋ぎ先は「いつでもいいから最後に走ったのはいつか」。手で押した回も数える
    # ——**生きているか**を見ているので、何が起こしたかは問わない
    for want in targets:
        path = names[want]
        last = gh.latest(path)
        table.setdefault(path, {})["last"] = last.get("created_at") if last else None
    # こちらは「**繋ぎで**起きたのはいつか」。手押しや cron の回を数えると、
    # 保険の cron が毎朝拾っているぶんで、切れた繋ぎが隠れる
    for path in linked:
        row = table.setdefault(path, {})
        bychain = gh.latest(path, event="workflow_run")
        row["by_chain"] = bychain.get("created_at") if bychain else None
        row["created"] = made.get(path)
    return table


def judge(docs: dict[str, dict], table: dict[str, dict], days: int,
          now: datetime) -> tuple[list[str], dict]:
    """表を当てる。→ (挙がった1行たち, 数えたものの数)

    **数も返す。** 0件が「ぜんぶ通った」なのか「1本も見ていない」なのかは、
    挙がった側からは区別できない（`docs/island-standards.md` §15）。
    """
    rows: list[str] = []
    linked = sorted(p for p in docs if wanted(docs[p]))
    names = {name_of(p, d): p for p, d in docs.items()}
    targets = sorted({w for p in linked for w in wanted(docs[p]) if w in names})
    limit = now - timedelta(days=days)
    seen = {"links": 0, "targets": 0, "downstream": 0, "new": 0, "missing": 0}

    for p in linked:
        seen["links"] += len(wanted(docs[p]))

    # [3] 繋ぎ先が、直近◯日に走っているか
    for want in targets:
        path = names[want]
        row = table.get(path)
        # **表に行が無いのと、行が在って run が 0 本なのは別物。**
        # 前者は「GitHub から答えが返らなかった」で、**数えられていない**。
        # ここを一緒にすると、API が空を返した朝に **23本ぜんぶ切れている**と
        # 言う——いちばん悪い嘘（対照 [5] がこれを毎回当てている）
        if row is None:
            seen["missing"] += 1
            continue
        last = row.get("last")
        seen["targets"] += 1
        who = ", ".join(sorted(p for p in linked if want in wanted(docs[p])))
        if not last:
            rows.append(f"繋ぎ先「{want}」（{path}）は run が1本も無い。"
                        f"ここに繋いでいる {len(who.split(', '))}本は一度も起きない: {who}")
            continue
        when = ts(last)
        if when < limit:
            age = (now - when).total_seconds() / 86400
            rows.append(f"繋ぎ先「{want}」（{path}）が {age:.1f}日 走っていない"
                        f"（{days}日まで）。繋いでいるのは: {who}")

    # [4] 繋ぎを持つ側が、**繋ぎで**起きているか
    for p in linked:
        row = table.get(p)
        if row is None:
            seen["missing"] += 1
            continue
        made = row.get("created")
        # **新顔は数えない。** 足した当日の PR で赤くなると、
        # 「足したから赤い」が常態になって、本物の切れが埋もれる
        if made and ts(made) > limit:
            seen["new"] += 1
            continue
        seen["downstream"] += 1
        by = row.get("by_chain")
        if not by:
            rows.append(f"{p} は `workflow_run` で起きた run が1本も無い"
                        f"（繋ぎ先: {' / '.join(wanted(docs[p]))}）")
            continue
        when = ts(by)
        if when < limit:
            age = (now - when).total_seconds() / 86400
            rows.append(f"{p} が繋ぎで起きたのは {age:.1f}日前（{days}日まで）"
                        f"。繋ぎ先: {' / '.join(wanted(docs[p]))}")

    return rows, seen


def main() -> int:
    ap = argparse.ArgumentParser(description="繋ぎ（workflow_run）が生きているか")
    ap.add_argument("--days", type=int, default=DAYS,
                    help=f"「走っていない」と言うまでの日数（既定 {DAYS}）")
    ap.add_argument("--offline", action="store_true",
                    help="ネットに出ない2つ（名前・conclusion）だけ見る")
    args = ap.parse_args()

    if not WFDIR.is_dir():
        print("!! .github/workflows が無い。数えるものが無い")
        return 2
    try:
        docs = load_docs()
    except yaml.YAMLError as e:
        print(f"!! ワークフローが読めない: {e}")
        return 2
    if not docs:
        print("!! ワークフローが1本も無い。数えるものが無い")
        return 2

    linked = sorted(p for p in docs if wanted(docs[p]))
    name_rows, links = audit(docs)
    if links == 0:
        print("!! 繋ぎ（workflow_run）が1本も無い。**数えるものが無い**")
        return 2

    print(f"ワークフロー {len(docs)}本 / 繋ぎを持つもの {len(linked)}本 / 繋ぎ {links}本")
    for p in linked:
        print(f"   {p} → {' / '.join(wanted(docs[p]))}")
    print()

    ng = 0

    # [1] 名前。`workflow_link_selftest.py` から借りて、同じ画面に出す
    if name_rows:
        print(f"[1] ✕ 行き先の無い繋ぎが {len(name_rows)}件")
        for r in name_rows:
            print(f"      {r['row']}")
        ng += 1
    else:
        print(f"[1] ○ 繋ぎ {links}本、ぜんぶ実在する name: を指している")

    # [2] `conclusion` で絞っていないか
    gated = []
    for p in linked:
        for where in conclusion_gates(docs[p]):
            gated.append(f"{p} の {where} が繋ぎ先の conclusion を見ている")
    if gated:
        print(f"[2] ✕ `conclusion` で絞っている繋ぎが {len(gated)}件")
        for g in gated:
            print(f"      {g}")
        print("      繋ぎ先の最後の step は『表に無い どねID が投げ銭してきた』晩に")
        print("      exit 1 で終わる。あれは失敗ではなく呼び出しで、数字は入っている")
        ng += 1
    else:
        print(f"[2] ○ 繋ぎを持つ {len(linked)}本、どれも conclusion で絞っていない")

    if args.offline:
        print()
        print("（--offline。実績は見ていない）")
        return 1 if ng else 0

    tok = token()
    if not tok:
        print("!! GITHUB_TOKEN が無い。実績を数えられない")
        return 2
    gh = Gh(repo_name(), tok)
    try:
        table = live_table(docs, gh)
    except (urllib.error.URLError, urllib.error.HTTPError, OSError, ValueError) as e:
        print(f"!! GitHub が読めない: {e}。**実績を数えられない**")
        return 2

    now = datetime.now(timezone.utc)
    try:
        rows, seen = judge(docs, table, args.days, now)
    except ValueError as e:
        # 時刻が読めないなら**数えられていない。** ここを 1 で返すと、
        # 「切れている」と「読めなかった」が同じ赤になる
        print(f"!! GitHub が返した時刻が読めない: {e}。**実績を数えられない**")
        return 2
    if seen["missing"] or seen["targets"] == 0 or seen["downstream"] == 0:
        print(f"!! 数えられた繋ぎ先 {seen['targets']}本 / 繋ぎを持つ側 "
              f"{seen['downstream']}本 / 答えの返らなかったもの {seen['missing']}本。"
              "**0件を通さない**")
        return 2

    live = [r for r in rows if r.startswith("繋ぎ先")]
    down = [r for r in rows if not r.startswith("繋ぎ先")]
    if live:
        print(f"[3] ✕ 直近{args.days}日に走っていない繋ぎ先が {len(live)}件")
        for r in live:
            print(f"      {r}")
        ng += 1
    else:
        print(f"[3] ○ 繋ぎ先 {seen['targets']}本、ぜんぶ直近{args.days}日に走っている")
        for want in sorted({w for p in linked for w in wanted(docs[p])}):
            path = next((q for q, d in docs.items() if name_of(q, d) == want), None)
            last = (table.get(path) or {}).get("last") if path else None
            if last:
                age = (now - ts(last)).total_seconds() / 86400
                print(f"      {want}: {last}（{age:.2f}日前）")

    if down:
        print(f"[4] ✕ 直近{args.days}日に**繋ぎで**起きていないものが {len(down)}件")
        for r in down:
            print(f"      {r}")
        ng += 1
    else:
        print(f"[4] ○ 繋ぎを持つ {seen['downstream']}本、ぜんぶ直近{args.days}日に"
              f"繋ぎで起きている" + (f"（新顔 {seen['new']}本は数えていない）"
                                     if seen["new"] else ""))
        for p in linked:
            made = (table.get(p) or {}).get("created")
            fresh = "（新顔。数えていない）" if made and ts(made) > now - timedelta(
                days=args.days) else ""
            by = (table.get(p) or {}).get("by_chain")
            if by:
                age = (now - ts(by)).total_seconds() / 86400
                print(f"      {p}: {by}（{age:.2f}日前）{fresh}")
            else:
                print(f"      {p}: 繋ぎで起きた run はまだ無い{fresh}")

    print()
    if ng:
        print(f"!! 落ちた項目が {ng} あります")
        return 1
    print("○ 繋ぎはぜんぶ生きている")
    return 0


if __name__ == "__main__":
    sys.exit(main())
