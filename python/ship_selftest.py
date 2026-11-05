"""**`ship.yml`（札 `出す` で出す口）の起こしの一覧と判断が、落ちるときに落ちるか**を当てる。

    python3 python/ship_selftest.py

ネットには1バイトも出ない。読むのは `.github/workflows/*.yml` と、判断の関数だけ。
毎 PR で `python/selftest_runner.py` が拾う。

## なぜ要るか

`ship.yml` は「PR の check が終わったら起きる」を `workflow_run` で持っていて、
**繋ぎはワークフローの `name:` で解決される。** 名前を変えると黙って切れ、
札を付けた PR が緑になっても出なくなる。赤くはならない。

名前が実在するかは `python/workflow_link_selftest.py` が見ている。ここが足すのは
**漏れ**——PR の枝で走るワークフローを新しく足したのに一覧に並べないと、その check が
最後に終わった PR は誰にも起こされない。見ていないと、**足した日から静かに出なくなる。**

## 対照

| | 食わせるもの | 欲しい答え |
| --- | --- | --- |
| 1 | いまのリポジトリ | 漏れ・余り・無い名前が**無い**（並べるべきものは1本以上） |
| 2 | PR で走るものの `name:` を1文字変えた写し | **その1本だけ**が漏れと無い名前に出る |
| 3 | PR で走るワークフローを1本足した写し | **その1本だけ**が漏れに出る |
| 4 | 並んでいるものから `pull_request` を外した写し | **その1本だけ**が余りに出る |
| 5 | `on:` を `doc.get("on")` だけで読む | 並べるべきものが **0本** に化ける（＝本体は 2 に倒す） |
| 6 | `push: master` を持つもの | ぜんぶ手で起こせる（`workflow_dispatch`）。docs だけなら shorts の見張りは起こさない |
| 7 | 変えたファイルの表 | 配り先と「手で出す面」が表どおり |
| 8 | check の表 | 走っている→待つ／赤→落とす／自分の check は数えない／neutral は緑にしない |
| 9 | PR の表 | 札なし・閉じた・下書きは黙る／base 違い・ぶつかり・手の面は落とす |
| 10 | `paths:` の形 | `**` は `/` をまたぎ、`*` はまたがない |
| 11 | 本番の HTML の作り物 | entry と書き出しの印が引ける。印が無ければ None |
| 12 | `chain_alive_watch` の実績の見張り | ship.yml の繋ぎは数えない。**外す札を剥がすと赤くなる** |
| 13 | 落ちたときのコメント | 5行以内で、札の名前が入る |

2・3・4 は「落ちること」だけでなく、**落ちる先が狙ったぶんだけ**かを見る
（`docs/island-misses.md` #128）。

終了コード 0=通った / 1=落ちた足がある / **2=数えるものが無い**。
"""

from __future__ import annotations

import copy
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import chain_alive_watch as ca  # noqa: E402
import ship  # noqa: E402
from ship import (  # noqa: E402
    OWN, after_merge, build_mark, checks_verdict, clean_path, decide, entry_of, fail_body,
    glob_re, hand, listed_wakes, load_docs, name_of, public_candidates, route, site_routes,
    wake_drift, wake_names,
)

NOW = datetime(2026, 11, 5, 0, 0, 0, tzinfo=timezone.utc)


def iso(days_ago: float) -> str:
    return (NOW - timedelta(days=days_ago)).strftime("%Y-%m-%dT%H:%M:%SZ")


def pr(**kw) -> dict:
    """出せる形の PR。ここから1か所ずつ崩す。"""
    base = {
        "state": "open", "draft": False, "mergeable": True, "mergeable_state": "clean",
        "labels": [{"name": ship.LABEL}],
        "head": {"sha": "a" * 40, "ref": "claude/x", "repo": {"full_name": "o/r"}},
        "base": {"ref": "master", "repo": {"full_name": "o/r"}},
    }
    base.update(kw)
    return base


def ck(name: str, status: str = "completed", conclusion: str | None = "success",
       suite: int = 1) -> dict:
    return {"name": name, "status": status, "conclusion": conclusion,
            "check_suite": {"id": suite}, "app": {"slug": "github-actions"}}


GREEN = [ck("selftest"), ck("closes"), ck("reachkeys", conclusion="skipped")]


def main() -> int:
    docs = load_docs()
    if OWN not in docs:
        print(f"!! {OWN} が無い。数えるものが無い")
        return 2
    ng = 0

    # [1] いまのリポジトリ
    d1 = wake_drift(docs)
    have = listed_wakes(docs[OWN])
    if not d1["want"]:
        print("[1] !! PR の枝で走るワークフローが1本も見つからない。**数えるものが無い**")
        return 2
    if d1["missing"] or d1["extra"] or d1["ghost"]:
        print(f"[1] ✕ 起こしの一覧がずれている: 漏れ {d1['missing']} / 余り {d1['extra']}"
              f" / 無い名前 {d1['ghost']}")
        print(f"      {OWN} の workflow_run.workflows に、PR の枝で走るものを全部並べる")
        ng += 1
    else:
        print(f"[1] ○ 起こしの一覧 {len(have)}本 = PR の枝で走るもの {len(d1['want'])}本")

    # [2] 1本の name: を1文字変える
    target = "Selftests" if "Selftests" in d1["want"] else d1["want"][0]
    path = next(p for p, d in docs.items() if name_of(p, d) == target)
    d2docs = copy.deepcopy(docs)
    d2docs[path]["name"] = target[:-1]
    d2 = wake_drift(d2docs)
    if d2["missing"] == [target[:-1]] and d2["ghost"] == [target] and not d2["extra"]:
        print(f"[2] ○ 「{target}」を1文字変えると、その1本だけが漏れと無い名前に出る")
    else:
        print(f"[2] ✕ 1文字変えたのに 漏れ {d2['missing']} / 無い名前 {d2['ghost']}"
              f" / 余り {d2['extra']}")
        ng += 1

    # [3] PR で走るワークフローを1本足す
    d3docs = copy.deepcopy(docs)
    d3docs[".github/workflows/zz_new.yml"] = {"name": "新しい見張り",
                                              True: {"pull_request": None}, "jobs": {}}
    d3 = wake_drift(d3docs)
    if d3["missing"] == ["新しい見張り"] and not d3["ghost"] and not d3["extra"]:
        print("[3] ○ PR で走るものを1本足すと、その1本だけが漏れに出る")
    else:
        print(f"[3] ✕ 足したのに 漏れ {d3['missing']} / 無い名前 {d3['ghost']} / 余り {d3['extra']}")
        ng += 1

    # [4] 並んでいるものから pull_request を外す
    cc = next((p for p, d in docs.items() if name_of(p, d) == "Closes Check"), None)
    if cc is None:
        print("[4] !! Closes Check が無い。対照を回せない")
        return 2
    d4docs = copy.deepcopy(docs)
    d4docs[cc][True] = {"workflow_dispatch": None}
    d4docs[cc].pop("on", None)
    d4 = wake_drift(d4docs)
    if d4["extra"] == ["Closes Check"] and not d4["missing"] and not d4["ghost"]:
        print("[4] ○ PR で走らなくなったものは、その1本だけが余りに出る")
    else:
        print(f"[4] ✕ 外したのに 余り {d4['extra']} / 漏れ {d4['missing']}")
        ng += 1

    # [5] `on:` を読み落とす側
    q = wake_names(docs, quirk=True)
    if not q and d1["want"]:
        print(f"[5] ○ `doc.get(\"on\")` だけで読むと、並べるべきものが {len(d1['want'])} → 0本に化ける"
              "（本体はそこで 2 に倒す）")
    else:
        print(f"[5] ✕ 読み落とす側でも {len(q)}本 見えた。この足は何も見ていない")
        ng += 1

    # [6] マージのあと、push: master の代わりに起こすもの
    am_docs = after_merge(docs, ["docs/a.md"])
    am_shorts = after_merge(docs, ["tools/shorts/qa/check.py"])
    cant = [a for a in am_shorts if not a["ok"]]
    rot = [f for f in ship.AFTER_MERGE_INPUTS if f".github/workflows/{f}" not in docs]
    names_docs = {a["file"] for a in am_docs}
    names_shorts = {a["file"] for a in am_shorts}
    req_missing = []
    for a in am_shorts:
        inputs = ((ship.triggers(docs[f".github/workflows/{a['file']}"]).get("workflow_dispatch")
                   or {}).get("inputs") or {})
        for k, v in inputs.items():
            if (v or {}).get("required") and k not in a["inputs"]:
                req_missing.append(f"{a['file']}:{k}")
    if (not cant and not rot and not req_missing and "selftest.yml" in names_docs
            and "shorts_selftest.yml" not in names_docs and "shorts_selftest.yml" in names_shorts):
        print(f"[6] ○ push: master の {len(am_shorts)}本はぜんぶ手で起こせる。"
              f"docs だけなら {sorted(names_docs)}、tools/shorts なら shorts の見張りも")
    else:
        print(f"[6] ✕ 起こせない {[a['file'] for a in cant]} / 腐った入力 {rot} /"
              f" 要る入力の抜け {req_missing} / docs {sorted(names_docs)} / shorts {sorted(names_shorts)}")
        ng += 1

    # [7] 配り先と手の面
    cases7 = [
        (["docs/a.md", ".claude/skills/x/SKILL.md"], set(), []),
        (["site/app/now/page.tsx"], {"hosting"}, []),
        (["public/alert/probe.html"], {"hosting"}, []),
        (["lib/log.ts"], {"hosting"}, []),
        (["functions/src/islandApi.ts"], {"functions"}, []),
        (["functions/src/a.ts", "app/index.tsx"], {"hosting", "functions"}, []),
        (["python/ship.py"], set(), []),
        (["firestore.rules"], set(), ["Firestore"]),
        ([".github/workflows/ship.yml"], set(), ["ワークフロー"]),
    ]
    bad7 = []
    for files, want_r, want_h in cases7:
        got_r = {k for k, v in route(files).items() if v}
        got_h = hand(files)
        if got_r != want_r or len(got_h) != len(want_h) or not all(
                any(w in g for g in got_h) for w in want_h):
            bad7.append(f"{files} → {got_r} / {got_h}")
    if bad7:
        print(f"[7] ✕ 配り先が表と違う: {bad7}")
        ng += 1
    else:
        print(f"[7] ○ 配り先と手の面が {len(cases7)}通りとも表どおり")

    # [8] check の読みかた
    cases8 = [
        (GREEN, {}, set(), "green"),
        (GREEN + [ck("shorts-selftest", "in_progress", None)], {}, set(), "running"),
        (GREEN + [ck("selftest2", conclusion="failure")], {}, set(), "red"),
        (GREEN + [ck("neutral", conclusion="neutral")], {}, set(), "red"),
        # 自分（ship.yml）の check は走っていても数えない
        (GREEN + [ck("見る", "in_progress", None, suite=99)], {}, {99}, "green"),
        ([ck("見る", "in_progress", None, suite=99)], {}, {99}, "none"),
        ([], {}, set(), "none"),
        (GREEN, {"statuses": [{"context": "ext", "state": "pending"}]}, set(), "running"),
        (GREEN, {"statuses": [{"context": "ext", "state": "failure"}]}, set(), "red"),
    ]
    bad8 = [f"{i}: {checks_verdict(c, s, o)[0]}（{w} のはず）"
            for i, (c, s, o, w) in enumerate(cases8) if checks_verdict(c, s, o)[0] != w]
    if bad8:
        print(f"[8] ✕ check の読みかたが違う: {bad8}")
        ng += 1
    else:
        print(f"[8] ○ check の読みかたが {len(cases8)}通りとも表どおり"
              "（自分の check は数えない・neutral は緑にしない）")

    # [9] PR の判断
    files = ["docs/a.md"]
    cases9 = [
        (pr(), files, GREEN, [], "go"),
        (pr(labels=[]), files, GREEN, [], "skip"),
        (pr(state="closed"), files, GREEN, [], "skip"),
        (pr(draft=True), files, GREEN, [], "skip"),
        (pr(head={"sha": "a", "ref": "x", "repo": {"full_name": "fork/r"}}), files, GREEN, [], "skip"),
        (pr(base={"ref": "dev", "repo": {"full_name": "o/r"}}), files, GREEN, [], "fail"),
        (pr(), [".github/workflows/x.yml"], GREEN, [], "fail"),
        (pr(), files, GREEN + [ck("x", conclusion="failure")], [], "fail"),
        (pr(), files, GREEN + [ck("x", "queued", None)], [], "wait"),
        (pr(mergeable=None), files, GREEN, [], "wait"),
        (pr(mergeable=False, mergeable_state="dirty"), files, GREEN, [], "fail"),
        # 枝でショートの取り込みが走っている（#291）。自分の run は数えない
        (pr(), files, GREEN, [{"name": "ショートの材料を作る", "status": "in_progress",
                               "path": ".github/workflows/shorts_ingest.yml"}], "wait"),
        (pr(), files, GREEN, [{"name": "出す", "status": "in_progress", "path": OWN}], "go"),
    ]
    bad9 = []
    for i, (p, f, c, br, want) in enumerate(cases9):
        k, line = decide(p, f, c, {}, set(), br)
        if k != want:
            bad9.append(f"{i}: {k}（{want} のはず）{line}")
    if bad9:
        print(f"[9] ✕ PR の判断が違う: {bad9}")
        ng += 1
    else:
        print(f"[9] ○ PR の判断が {len(cases9)}通りとも表どおり")

    # [10] paths: の形
    cases10 = [("tools/shorts/**", "tools/shorts/qa/check.py", True),
               ("tools/shorts/**", "tools/shortsx/a.py", False),
               ("shorts/preview/*.json", "shorts/preview/a.json", True),
               ("shorts/preview/*.json", "shorts/preview/x/a.json", False),
               ("**/*.md", "docs/a.md", True),
               ("**/*.md", "a.md", True)]
    bad10 = [f"{pt} / {p}" for pt, p, w in cases10 if bool(glob_re(pt).match(p)) != w]
    if bad10:
        print(f"[10] ✕ paths: の当てかたが違う: {bad10}")
        ng += 1
    else:
        print(f"[10] ○ paths: の当てかたが {len(cases10)}通りとも GitHub の形どおり")

    # [11] 本番の HTML から引くもの
    expo = '<script src="/_expo/static/js/web/entry-0f1e2d3c4b5a.js" defer></script>'
    nxt = ('<script>self.__next_f.push([1,"0:{\\"P\\":null,\\"b\\":\\"Ab3_x9QzLm\\",\\"p\\":\\"\\"'
           ',\\"c\\":[\\"\\",\\"\\"]}"])</script>')
    chunks = '<script src="/_next/static/chunks/app/page-1234abcd.js"></script>'
    ok11 = (entry_of(expo) == "/_expo/static/js/web/entry-0f1e2d3c4b5a.js"
            and entry_of("<html></html>") is None
            and build_mark(nxt) == "b:Ab3_x9QzLm"
            and (build_mark(chunks) or "").startswith("chunks:")
            and build_mark("<html>だけ</html>") is None
            and clean_path("/nordic/review.html") == "/nordic/review"
            and clean_path("/donut-progress/index.html") == "/donut-progress"
            and clean_path("/a/b.png") == "/a/b.png"
            and site_routes(["site/app/now/page.tsx", "site/app/island/[c]/page.tsx",
                             "site/app/page.tsx"]) == ["/now"]
            and public_candidates([{"filename": "public/a.html", "status": "modified"},
                                   {"filename": "public/b.html", "status": "removed"},
                                   {"filename": "public/.x", "status": "added"},
                                   {"filename": "site/c.ts", "status": "added"}]) == ["public/a.html"])
    if ok11:
        print("[11] ○ entry・書き出しの印・配られる道・触った面・突き合わせる public が引ける")
    else:
        print(f"[11] ✕ 本番の HTML から引くものが違う（entry {entry_of(expo)} / 印 {build_mark(nxt)}）")
        ng += 1

    # [12] 実績の見張り（chain_alive_watch）が ship.yml の繋ぎを数えないこと。剥がせば数えること
    linked = sorted(p for p in docs if ca.wanted(docs[p]))
    only = ca.wake_only(docs, linked)
    names = {name_of(p, d): p for p, d in docs.items()}
    table: dict[str, dict] = {}
    for p in linked:
        for w in ca.wanted(docs[p]):
            if w in names:
                table.setdefault(names[w], {})["last"] = iso(1)
    for p in linked:
        row = table.setdefault(p, {})
        row.setdefault("last", iso(1))
        row.update({"by_chain": iso(1), "created": iso(200)})
    for w in only:                       # PR を触った日にしか走らない繋ぎ先が10日走っていない
        table[names[w]]["last"] = iso(10)
    table[OWN]["by_chain"] = None        # ship.yml が繋ぎで一度も起きていない
    rows_on, _ = ca.judge(docs, table, ca.DAYS, NOW)
    saved = set(ca.PR_WAKES)
    try:
        ca.PR_WAKES.clear()
        rows_off, _ = ca.judge(docs, table, ca.DAYS, NOW)
    finally:
        ca.PR_WAKES.update(saved)
    hit_off = [r for r in rows_off if OWN in r or any(f"「{w}」" in r for w in only)]
    if OWN in ca.PR_WAKES and only and not rows_on and len(hit_off) == len(only) + 1:
        print(f"[12] ○ ship.yml の繋ぎ（PR でしか走らない {len(only)}本）は実績で数えない。"
              f"外す札を剥がすと {len(hit_off)}件 挙がる")
    else:
        print(f"[12] ✕ PR_WAKES={sorted(ca.PR_WAKES)} / 外したまま {len(rows_on)}件 /"
              f" 剥がして {len(hit_off)}件（{len(only) + 1} のはず）")
        for r in rows_on[:3]:
            print(f"      {r}")
        ng += 1

    # [13] 落ちたときのコメント
    body = fail_body(12, ["a", "b", "c", "d", "e"], merged=False, run_url="https://x/runs/1")
    body2 = fail_body(12, ["配りが failure"], merged=True, run_url="https://x/runs/1")
    if (len(body.splitlines()) <= 5 and ship.WAIT_LABEL in body and ship.LABEL in body
            and len(body2.splitlines()) <= 5 and ship.WAIT_LABEL in body2):
        print("[13] ○ 落ちたときのコメントは5行以内で、札の名前が入る")
    else:
        print(f"[13] ✕ 落ちたときのコメントが {len(body.splitlines())}行 / {body!r}")
        ng += 1

    print()
    if ng:
        print(f"!! 落ちた項目が {ng} あります")
        return 1
    print("○ ぜんぶ通った")
    return 0


if __name__ == "__main__":
    sys.exit(main())
