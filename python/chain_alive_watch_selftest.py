"""**`python/chain_alive_watch.py` が落ちられるか**を、作り物の表で当てる。

    python3 python/chain_alive_watch_selftest.py

**ネットには1バイトも出ない。** 本物を読む口（`Gh`）は触らず、
判定（`judge` / `conclusion_gates` / `ts`）だけを、差し込んだ表で回す。
毎 PR で `python/selftest_runner.py` が拾う。

## なぜ、本物の run を見る見張りに、作り物の対照が要るか

本物を見る側は、**ふだん必ず緑になる。** 繋ぎが生きているのが平常なので、
「落ちられるか」は平常運転では一度も確かめられない。いつも緑の見張りは、
何も守っていないのに守っている気にさせる（`docs/island-standards.md` §15）。

だから落ちる形を**毎回こちらで作る。** 作るのは表のほうで、判定は本物。

## 対照

| | 食わせるもの | 欲しい答え |
| --- | --- | --- |
| 1 | いまのリポジトリ＋「ぜんぶ昨日走った」表 | 挙がらない |
| 2 | 繋ぎ先を**1本だけ** 10日前にした表 | **その繋ぎ先だけ**が挙がる |
| 3 | 下流を**1本だけ**「繋ぎで起きた実績なし」にした表 | **その1本だけ**が挙がる |
| 4 | 同じ下流を「**今日できた新顔**」にする | 挙がらない（数えからも外れる） |
| 5 | 表が空 | 数えたものが 0 ＝ **2 に倒す側** |
| 6 | `conclusion` で絞る `if:` を1本足した写し | **その1本だけ**が挙がる |
| 7 | どこかの `name:` を1文字変えた写し | **そこを指す繋ぎだけ**が挙がる（借り物が効いているか） |
| 8 | GitHub が返す**2通りの**時刻 | どちらも読める |

2・3・6・7 は「落ちること」だけでなく、**落ちる先が狙ったぶんだけ**かを見る。
道連れで他まで落ちる対照は、死んだ足を隠す（`docs/island-misses.md` #128）。

8 が在るのは**実際に踏んだから。** run は `…Z` で返るが、ワークフロー
そのものの `created_at` は `2026-09-11T04:06:25.000+02:00` で返る
（**UTC ですらない**）。`%Y-…Z` だけで読んでいたら、新顔を数えないところで
落ちて、本物の数字を1つも出さずに終わった。

終了コード 0=通った / 1=落ちた足がある / **2=数えるものが無い**。
"""

from __future__ import annotations

import copy
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))

from chain_alive_watch import (  # noqa: E402
    DAYS, WFDIR, conclusion_gates, judge, load_docs, ts,
)
from workflow_link_selftest import audit, name_of, wanted  # noqa: E402

NOW = datetime(2026, 10, 14, 0, 0, 0, tzinfo=timezone.utc)


def iso(days_ago: float) -> str:
    return (NOW - timedelta(days=days_ago)).strftime("%Y-%m-%dT%H:%M:%SZ")


def all_fresh(docs: dict[str, dict]) -> dict[str, dict]:
    """「繋ぎ先も下流も、ぜんぶ昨日走った」表。ここからいじって落とす。"""
    linked = sorted(p for p in docs if wanted(docs[p]))
    names = {name_of(p, d): p for p, d in docs.items()}
    table: dict[str, dict] = {}
    for p in linked:
        for want in wanted(docs[p]):
            if want in names:
                table.setdefault(names[want], {})["last"] = iso(1)
    for p in linked:
        row = table.setdefault(p, {})
        row.setdefault("last", iso(1))
        row["by_chain"] = iso(1)
        row["created"] = iso(200)       # ぜんぶ古株（新顔の足は [4] で別に見る）
    return table


def target_of(docs: dict[str, dict], want: str) -> str:
    return next(p for p, d in docs.items() if name_of(p, d) == want)


def tally_targets(docs: dict[str, dict]) -> set[str]:
    """繋ぎ先（重複を畳んだもの）の、ファイルの道。"""
    names = {name_of(p, d): p for p, d in docs.items()}
    linked = [p for p in docs if wanted(docs[p])]
    return {names[w] for p in linked for w in wanted(docs[p]) if w in names}


def main() -> int:
    if not WFDIR.is_dir():
        print("!! .github/workflows が無い。数えるものが無い")
        return 2
    docs = load_docs()
    linked = sorted(p for p in docs if wanted(docs[p]))
    if not linked:
        print("!! 繋ぎ（workflow_run）が1本も無い。**数えるものが無い**")
        return 2

    base = all_fresh(docs)
    print(f"繋ぎを持つもの {len(linked)}本 / 作り物の表 {len(base)}行 / 境目 {DAYS}日")
    print()
    ng = 0

    # [1] ぜんぶ新しい。何も挙がらないこと
    rows, seen = judge(docs, base, DAYS, NOW)
    if rows:
        print(f"[1] ✕ ぜんぶ昨日走った表で {len(rows)}件 挙がった")
        for r in rows:
            print(f"      {r}")
        ng += 1
    else:
        print(f"[1] ○ ぜんぶ昨日走った表では挙がらない"
              f"（繋ぎ先 {seen['targets']}本 / 下流 {seen['downstream']}本を数えた）")

    # [2] 繋ぎ先を1本だけ古くする。**そこを指す繋ぎぶんだけ**が挙がること
    #
    # 当て先は「いちばん多く指されている繋ぎ先」。そこが死ぬと被害がいちばん大きい
    tally: dict[str, int] = {}
    for p in linked:
        for w in wanted(docs[p]):
            tally[w] = tally.get(w, 0) + 1
    hot = max(sorted(tally), key=lambda w: tally[w])
    hot_path = target_of(docs, hot)
    t2 = copy.deepcopy(base)
    t2[hot_path]["last"] = iso(10)
    rows2, seen2 = judge(docs, t2, DAYS, NOW)
    # 繋ぎ先が古いだけなら、挙がるのは**その繋ぎ先の1行だけ**。
    # 下流はこの表では昨日起きているので、[4] の側は動かない
    want2 = [r for r in rows2 if r.startswith(f"繋ぎ先「{hot}」")]
    if len(rows2) == 1 and want2 and seen2 == seen:
        print(f"[2] ○ 繋ぎ先「{hot}」を10日前にすると、その1件だけが挙がる")
        print(f"      {rows2[0]}")
    else:
        print(f"[2] ✕ 1本だけ古くしたのに {len(rows2)}件 挙がった（1件のはず）"
              f"／数えた数 {seen2}（{seen} のはず）")
        for r in rows2:
            print(f"      {r}")
        ng += 1

    # [3] 下流を1本だけ「繋ぎで起きた実績なし」に。**その1本だけ**が挙がること
    victim = linked[0]
    t3 = copy.deepcopy(base)
    t3[victim]["by_chain"] = None
    rows3, seen3 = judge(docs, t3, DAYS, NOW)
    if len(rows3) == 1 and rows3[0].startswith(victim) and seen3 == seen:
        print(f"[3] ○ {victim} が繋ぎで一度も起きていないと、その1本だけが挙がる")
        print(f"      {rows3[0]}")
    else:
        print(f"[3] ✕ 1本だけ潰したのに {len(rows3)}件 挙がった（1件のはず）"
              f"／数えた数 {seen3}（{seen} のはず）")
        for r in rows3:
            print(f"      {r}")
        ng += 1

    # [4] 同じものを「今日できた新顔」にすると、挙がらず、数えからも外れる
    t4 = copy.deepcopy(t3)
    t4[victim]["created"] = iso(0)
    rows4, seen4 = judge(docs, t4, DAYS, NOW)
    if not rows4 and seen4["downstream"] == seen["downstream"] - 1 and seen4["new"] == 1:
        print(f"[4] ○ 同じものが今日できた新顔なら挙がらず、"
              f"下流の数が {seen['downstream']} → {seen4['downstream']} に減る")
    else:
        print(f"[4] ✕ 新顔なのに {len(rows4)}件 挙がった／数えた数 {seen4}")
        ng += 1

    # [5] 表が空。**「ぜんぶ切れている」ではなく「数えられなかった」**に倒れること
    #
    # GitHub が空を返した朝に 23本ぜんぶ赤くすると、その日から誰も読まなくなる。
    # 数えた数が 0 で、答えの返らなかったものが全部ぶんになるのが正しい
    rows5, seen5 = judge(docs, {}, DAYS, NOW)
    if (seen5["targets"] == 0 and seen5["downstream"] == 0 and not rows5
            and seen5["missing"] == len(linked) + len(tally_targets(docs))):
        print(f"[5] ○ 表が空なら、数えた数は 0 で、答えの返らなかったもの "
              f"{seen5['missing']}本（本体はそこで 2 を返す）")
    else:
        print(f"[5] ✕ 表が空なのに {seen5} を数え、{len(rows5)}件 挙げた。"
              "**空の答えが『ぜんぶ切れている』に化ける**")
        ng += 1

    # [6] `conclusion` で絞る `if:` を1本だけ足す。**その1本だけ**が挙がること
    now_gated = [p for p in linked if conclusion_gates(docs[p])]
    g_victim = linked[-1]
    d6 = copy.deepcopy(docs)
    jobs = d6[g_victim].get("jobs")
    jname = sorted(jobs)[0]
    jobs[jname]["if"] = "${{ github.event.workflow_run.conclusion == 'success' }}"
    got6 = [p for p in sorted(d6) if conclusion_gates(d6[p])]
    if got6 == sorted(set(now_gated) | {g_victim}) and not now_gated:
        print(f"[6] ○ {g_victim} の job に conclusion の if: を足すと、そこだけが挙がる"
              f"（{conclusion_gates(d6[g_victim])[0]}）")
    else:
        print(f"[6] ✕ conclusion の if: を1本足したのに挙がったのは {got6}"
              f"（いま絞っているのは {now_gated}）")
        ng += 1

    # [7] 借り物（名前の突き合わせ）が効いているか。
    #     **1文字変えたら、そこを指す繋ぎだけ**が挙がること
    before, links = audit(docs)
    d7 = copy.deepcopy(docs)
    d7[hot_path]["name"] = hot[:-1]
    after, links7 = audit(d7)
    added = {(r["at"], r["want"]) for r in after} - {(r["at"], r["want"]) for r in before}
    wantpairs = {(p, hot) for p in linked if hot in wanted(docs[p])}
    if added == wantpairs and links7 == links and links > 0:
        print(f"[7] ○ 「{hot}」の name: を1文字変えると、そこを指す {len(added)}本だけが挙がる")
    else:
        print(f"[7] ✕ 1文字変えて増えたのは {sorted(added)}（{sorted(wantpairs)} のはず）"
              f"／見た繋ぎ {links7}（{links} のはず）")
        ng += 1

    # [8] GitHub が返す2通りの時刻。**どちらも読めること**
    try:
        a = ts("2026-10-13T23:49:36Z")
        b = ts("2026-09-11T04:06:25.000+02:00")
        ok8 = (a.tzinfo is not None and b.tzinfo is not None
               and b.strftime("%Y-%m-%dT%H:%M:%SZ") == "2026-09-11T02:06:25Z")
    except ValueError as e:
        print(f"[8] ✕ 時刻が読めない: {e}")
        ok8 = False
    if ok8:
        print("[8] ○ `…Z` も `…+02:00` も読めて、UTC に揃う")
    else:
        ng += 1

    print()
    if ng:
        print(f"!! 落ちた項目が {ng} あります")
        return 1
    print("○ ぜんぶ通った")
    return 0


if __name__ == "__main__":
    sys.exit(main())
