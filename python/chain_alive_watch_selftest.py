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
| 9 | **繋ぎ1本ずつ**（[5]）。ぜんぶ上流の直後に起きた表 | 挙がらない |
| 10 | 下流を**1本だけ**、上流とそろわない時刻にずらす | **その下流の繋ぎだけ**が挙がる |
| 11 | 同じ表で、上流を全部「**人が押した**」に替える | 判定しない（手押しで薄めない） |
| 12 | 上流を `PAIR_MIN` 本未満にする | 判定しない（0/0 を赤にしない） |
| 13 | [5] の表が空 | 判定 0 ＝ **2 に倒す側** |
| 14 | 下流の引きが窓を覆っていない | 判定しない（覆えない所を0と読まない） |
| 15 | 1回だけ上流とそろう | 挙がらない。**割合は残る** |
| 16 | 1回もそろわない | やはり挙がる（15 がゆるめ過ぎていないか） |
| 17 | 下流を「**今日できた新顔**」にする | 判定しない（足した当日に赤くしない） |
| 18 | 下流を「**GitHub がまだ知らない**」にする | 判定しない（新しいファイルで繋いだ日） |
| 19 | 18 と同じ表で古株に戻す | やはり挙がる（17・18 がゆるめ過ぎていないか） |

9〜16 を足したのは #865。**[4] では届かない**——受け皿を持つ下流は、
1本目の繋ぎが死んでいても受け皿が毎晩起こすので、ワークフロー単位では
生きて見える。11 がとくに効く足で、**手で押した上流を混ぜると、
死んでいる繋ぎが「半分は生きている」に化ける**（実測で 90/90 と 0/72）。

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
    DAYS, PAIR_MIN, WFDIR, conclusion_gates, judge, judge_pairs,
    load_docs, ts,
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


def all_paired(docs: dict[str, dict]) -> dict:
    """[5] 用。「**どの繋ぎも、無人の上流のたびに起きている**」表。

    上流は `PAIR_MIN` 本ちょうどでは足りない日が出るので、余裕を見て4本。
    下流は、その4本の**直後**に出来たことにする。
    """
    linked = sorted(p for p in docs if wanted(docs[p]))
    names = {name_of(p, d): p for p, d in docs.items()}
    targets = sorted({w for p in linked for w in wanted(docs[p]) if w in names})
    # 1.0 / 1.5 / 2.0 / 2.5 日前に、無人で終わった
    when = [1.0, 1.5, 2.0, 2.5]
    ups = {w: [{"end": iso(d), "nobody": True} for d in when] for w in targets}
    # 下流は、そのたび「1分あと」に出来た
    at = [iso(d - 1.0 / 1440) for d in when]
    downs = {p: {"at": list(at), "oldest": min(at)} for p in linked}
    return {"ups": ups, "downs": downs}


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

    # [6] `conclusion` で絞る `if:` を1本だけ足す。**その1本だけ**が増えること
    #
    # **いま絞っているものが在るかどうかは、ここでは問わない。** それは本体の
    # [2] が見ている。ここが見るのは「足したら気づくか」だけで、両方を
    # 1つの足に持たせると、本物が1本見つかった日に**この足も道連れで落ちて**、
    # 検出が壊れたのか対象が増えたのかが読めなくなる（#128）
    now_gated = {p for p in linked if conclusion_gates(docs[p])}
    g_victim = next((p for p in reversed(linked) if p not in now_gated), None)
    if g_victim is None:
        print("[6] !! 絞っていない繋ぎが1本も無い。足す先が作れない")
        return 2
    d6 = copy.deepcopy(docs)
    jobs = d6[g_victim].get("jobs")
    jname = sorted(jobs)[0]
    jobs[jname]["if"] = "${{ github.event.workflow_run.conclusion == 'success' }}"
    got6 = {p for p in d6 if conclusion_gates(d6[p])}
    if got6 == now_gated | {g_victim}:
        print(f"[6] ○ {g_victim} の job に conclusion の if: を足すと、そこだけが増える"
              f"（{conclusion_gates(d6[g_victim])[0]}）"
              + (f"／元から絞っているもの {len(now_gated)}本" if now_gated else ""))
    else:
        print(f"[6] ✕ conclusion の if: を1本足したのに挙がったのは {sorted(got6)}"
              f"（元から絞っているのは {sorted(now_gated)}）")
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

    # ---------------------------------------------------------------- [5]
    #
    # **繋ぎ1本ずつ**（`judge_pairs`）。[2]〜[4] と同じ作法で、作り物の表を差す。
    # ここで見たいのは、**#865 そのものが捕まるか**——受け皿のおかげで
    # ワークフロー単位では生きて見える繋ぎが、1本ずつ見ると死んでいること。
    base5 = all_paired(docs)
    rowsA, seenA = judge_pairs(docs, base5, DAYS, NOW)
    if not rowsA and seenA["judged"] > 0 and seenA["judged"] == seenA["ok"]:
        print(f"[9] ○ ぜんぶ起きている表では挙がらない（繋ぎ {seenA['judged']}本を"
              f"1本ずつ数えた）")
    else:
        print(f"[9] ✕ ぜんぶ起きている表で {len(rowsA)}件 挙がった／{seenA}")
        for r in rowsA:
            print(f"      {r}")
        ng += 1

    # [10] **#865 の形。** 下流を1本だけ「上流の完了とそろわない」ようにする。
    #      その下流が持つ繋ぎ**だけ**が挙がること
    victim5 = linked[0]
    t10 = copy.deepcopy(base5)
    # 時刻を6時間ずらす（run は在るのに、どの完了ともそろわない）
    t10["downs"][victim5]["at"] = [iso(d - 0.25) for d in (1.0, 1.5, 2.0, 2.5)]
    t10["downs"][victim5]["oldest"] = min(t10["downs"][victim5]["at"])
    rows10, seen10 = judge_pairs(docs, t10, DAYS, NOW)
    want10 = len(wanted(docs[victim5]))
    if (len(rows10) == want10 and all(victim5 in r for r in rows10)
            and seen10["judged"] == seenA["judged"]):
        print(f"[10] ○ {victim5} が上流とそろわないと、その繋ぎ {want10}本だけが挙がる")
        for r in rows10:
            print(f"      {r}")
    else:
        print(f"[10] ✕ 1本だけ潰したのに {len(rows10)}件 挙がった"
              f"（{want10}件のはず）／数えた数 {seen10['judged']}"
              f"（{seenA['judged']} のはず）")
        for r in rows10:
            print(f"      {r}")
        ng += 1

    # [11] **手押しを混ぜると生きて見える**、を混ぜないこと。
    #      上流を「人が押した」に替えると、下流がそろっていても**数えない**
    #      （判定できる本数が減る）。#865 で 84/202 と 3/98 を足して
    #      「半分は生きている」と読まないための足
    t11 = copy.deepcopy(t10)
    for w in t11["ups"]:
        for u in t11["ups"][w]:
            u["nobody"] = False
    rows11, seen11 = judge_pairs(docs, t11, DAYS, NOW)
    if not rows11 and seen11["judged"] == 0 and seen11["thin"] > 0:
        print(f"[11] ○ 上流が全部「人が押した」なら、1本も判定しない"
              f"（数が足りない {seen11['thin']}本。本体はそこで 2 を返す）")
    else:
        print(f"[11] ✕ 手押しだけの表で {len(rows11)}件 挙げ、{seen11['judged']}本 判定した")
        ng += 1

    # [12] **数が足りない繋ぎは判定しない。** 上流を `PAIR_MIN` 本未満にすると、
    #      死んでいる表でも挙がらず、数えからも外れる（0/0 を赤にしない）
    t12 = copy.deepcopy(t10)
    for w in t12["ups"]:
        t12["ups"][w] = t12["ups"][w][: PAIR_MIN - 1]
    rows12, seen12 = judge_pairs(docs, t12, DAYS, NOW)
    if not rows12 and seen12["judged"] == 0 and seen12["thin"] == seenA["judged"]:
        print(f"[12] ○ 上流が {PAIR_MIN - 1}本しか無ければ判定しない"
              f"（数が足りない {seen12['thin']}本）")
    else:
        print(f"[12] ✕ {PAIR_MIN - 1}本しか無いのに {len(rows12)}件 挙げ、"
              f"{seen12['judged']}本 判定した")
        ng += 1

    # [13] 表が空。**「ぜんぶ切れている」ではなく「数えられなかった」**に倒れること
    rows13, seen13 = judge_pairs(docs, {}, DAYS, NOW)
    if not rows13 and seen13["judged"] == 0 and seen13["missing"] > 0:
        print(f"[13] ○ 表が空なら判定 0 で、答えの返らなかったもの "
              f"{seen13['missing']}本（本体はそこで 2 を返す）")
    else:
        print(f"[13] ✕ 表が空なのに {seen13} を数え、{len(rows13)}件 挙げた")
        ng += 1

    # [14] **下流の引きが3日ぶんを覆っていないとき**、覆っていないところを
    #      0件と読まないこと。古い上流しか無ければ、判定しない側に倒れる
    t14 = copy.deepcopy(base5)
    for p in t14["downs"]:
        t14["downs"][p] = {"at": [iso(0.5)], "oldest": iso(0.5)}
    rows14, seen14 = judge_pairs(docs, t14, DAYS, NOW)
    if not rows14 and seen14["judged"] == 0 and seen14["thin"] == seenA["judged"]:
        print(f"[14] ○ 下流の引きが半日ぶんしか無ければ、そこは判定しない"
              f"（数が足りない {seen14['thin']}本）")
    else:
        print(f"[14] ✕ 覆えていない窓で {len(rows14)}件 挙げ、"
              f"{seen14['judged']}本 判定した")
        for r in rows14:
            print(f"      {r}")
        ng += 1

    # [15] **1回でも起きたら緑に戻ること**（`PAIR_DEAD`）。
    #      ここを「満点でなければ赤」にすると、繋ぎ直した翌朝も master が
    #      2日ぶん赤いまま残る。**毎回出る赤は、本物の赤を埋める。**
    #      割合は消えずに残ること（目で見えないと、半端な壊れが隠れる）
    t15 = copy.deepcopy(t10)          # victim5 の下流が6時間ずれた表
    t15["downs"][victim5]["at"].append(iso(1.5 - 1.0 / 1440))
    t15["downs"][victim5]["oldest"] = min(t15["downs"][victim5]["at"])
    rows15, seen15 = judge_pairs(docs, t15, DAYS, NOW)
    part = [(h, t) for p, w, h, t in seen15["rates"] if p == victim5]
    if (not [r for r in rows15 if victim5 in r] and part
            and all(0 < h < t for h, t in part)):
        print(f"[15] ○ 1回でも起きていれば挙げない。割合は残る（{part}）")
    else:
        print(f"[15] ✕ 1回起きた繋ぎで {len(rows15)}件 挙げた／割合 {part}")
        ng += 1

    # [16] **1回も起きていなければ、やはり赤**（[15] がゆるめ過ぎていないか）
    rows16, _ = judge_pairs(docs, t10, DAYS, NOW)
    if len([r for r in rows16 if victim5 in r]) == want10:
        print(f"[16] ○ 0回なら、やはり {want10}本 挙がる")
    else:
        print(f"[16] ✕ 0回なのに {len([r for r in rows16 if victim5 in r])}件"
              f"（{want10}件のはず）")
        ng += 1

    # [17] **今日できた新顔は、[5] でも数えない**（2026-10-16。#273）
    #
    #      [4] には「新顔は数えない」が在ったのに、[5] には無かった。
    #      だから**繋ぎを1本足した PR は、必ずここで赤くなる**——足した当日は
    #      無人の上流が何度も終わっているのに、下流はまだ1回も起きていない。
    #      「足したから赤い」が常態になると、本物の切れが埋もれる（§13）。
    t17 = copy.deepcopy(t10)          # victim5 の繋ぎが死んで見える表
    t17["made"] = {victim5: iso(0.5)}
    rows17, seen17 = judge_pairs(docs, t17, DAYS, NOW)
    if (not [r for r in rows17 if victim5 in r]
            and seen17["new"] == want10
            and seen17["judged"] == seen10["judged"] - want10):
        print(f"[17] ○ {victim5} が今日できた新顔なら挙がらず、"
              f"判定が {seen10['judged']} → {seen17['judged']}本 に減る"
              f"（新顔 {seen17['new']}本）")
    else:
        print(f"[17] ✕ 新顔なのに {len(rows17)}件 挙がった／{seen17}")
        ng += 1

    # [18] **GitHub がまだ知らないファイル**も新顔に落ちること。
    #
    #      この PR で足したワークフローは `created_at` すら返ってこないので
    #      [17] の `made` では拾えない。`live_pairs()` が `absent` を立てる。
    #      ここが効かないと、繋ぎを**新しいファイルで**足した PR が、
    #      本物の赤と見分けの付かない赤を出す
    t18 = copy.deepcopy(t10)
    t18["downs"][victim5] = {"at": [], "oldest": None, "absent": True}
    rows18, seen18 = judge_pairs(docs, t18, DAYS, NOW)
    if (not [r for r in rows18 if victim5 in r] and seen18["new"] == want10):
        print(f"[18] ○ GitHub がまだ知らないファイルも挙がらない"
              f"（新顔 {seen18['new']}本）")
    else:
        print(f"[18] ✕ 知らないファイルで {len(rows18)}件 挙がった／{seen18}")
        ng += 1

    # [19] **ゆるめ過ぎていないか。** 古株に戻せば、同じ表でやはり赤くなる
    rows19, _ = judge_pairs(docs, {**t10, "made": {victim5: iso(200)}}, DAYS, NOW)
    if len([r for r in rows19 if victim5 in r]) == want10:
        print(f"[19] ○ 古株に戻せば、同じ表で {want10}本 挙がる")
    else:
        print(f"[19] ✕ 古株なのに {len([r for r in rows19 if victim5 in r])}件"
              f"（{want10}件のはず）")
        ng += 1

    print()
    if ng:
        print(f"!! 落ちた項目が {ng} あります")
        return 1
    print("○ ぜんぶ通った")
    return 0


if __name__ == "__main__":
    sys.exit(main())
