"""`python/misses_next.py` の見張り。GitHub には出ない（偽の GitHub を渡す）。

    python3 python/misses_next_selftest.py

終了コード 0=通った / 1=答えがずれた / 2=数えるものが無い（本物の misses が読めない）。

当てる場面（どれも 2026-11-19〜20 に実際に起きた形）:

1. master が #340 まで・PR が #341 を差分で足している → 次は #342（master だけ見ると #341 を出して、ぶつかる）
2. 差分が大きすぎて `patch` が無い PR → 枝の先のファイルを読んで #343 を拾う
3. ほかのファイルしか触っていない PR・小見出し（`### #N`）だけを足した PR は数えない
4. いまの枝で自分が足した番号も数える
5. 本物の `docs/island-misses.md` を読めて、節が1つ以上取れる（置き場が動いたら 2）
"""

from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import misses_next as mn  # noqa: E402
from misses_num_selftest import DOC  # noqa: E402


def doc(*nums: int) -> str:
    return "# 外した記録\n\n" + "".join(f"## #{n} 何か（2026-11-20）\n\n本文\n\n### 決めごと\n\n" for n in nums)


class Fake:
    def __init__(self, files: dict[str, str], prs: list[dict], pr_files: dict[int, list[dict]]):
        self.files, self.prs, self.rows = files, prs, pr_files

    def file(self, ref: str) -> str:
        return self.files[ref]

    def open_prs(self) -> list[dict]:
        return self.prs

    def pr_files(self, n: int) -> list[dict]:
        return self.rows[n]


def main() -> int:
    ng = 0
    master = doc(338, 339, 340)
    other = {"filename": "site/app/page.tsx", "patch": "@@ -1 +1 @@\n+## #900 ここは misses ではない\n"}
    gh = Fake(
        files={"master": master, "sha-big": doc(338, 339, 340, 343)},
        prs=[{"number": 1, "head": {"sha": "sha-1"}}, {"number": 2, "head": {"sha": "sha-big"}},
             {"number": 3, "head": {"sha": "sha-3"}}, {"number": 4, "head": {"sha": "sha-4"}}],
        pr_files={
            1: [other, {"filename": mn.PATH, "patch": "@@ -10,3 +10,9 @@\n ## #340 前\n+\n+## #341 足した\n+本文\n"}],
            2: [{"filename": mn.PATH}],                      # patch が無い（大きすぎる差分）
            3: [other],                                       # misses を触っていない
            4: [{"filename": mn.PATH, "patch": "@@ -1 +1 @@\n+### #350 ほかの節を指す小見出し\n"}],
        },
    )

    # [1][2][3] 開いている PR まで見る
    held = mn.holders(gh, None)
    want = {"master": {338, 339, 340}, "#1": {341}, "#2": {343}}
    if held == want and mn.next_number(held) == 344:
        print("[1] ○ 差分の #341・枝の先の #343 を拾い、ほかのファイルと小見出しは数えない → 次は #344")
    else:
        print(f"[1] ✕ 持ち主 {held} / 次 {mn.next_number(held)}（欲しいのは {want} と 344）")
        ng += 1

    # 対照: master だけ見ると、もう PR が採った番号を出す（この道具が無かった日の答え）
    blind = mn.next_number({"master": held["master"]})
    if blind == 341:
        print("[2] ○ master だけ見ると #341（PR が採った番号）を出す——[1] がその事故を止めている")
    else:
        print(f"[2] ✕ master だけで {blind}。場面の作りが崩れている")
        ng += 1

    # [4] いまの枝で足した番号
    held4 = mn.holders(Fake({"master": master}, [], {}), doc(338, 339, 340, 341, 342))
    if held4.get("この枝") == {341, 342} and mn.next_number(held4) == 343:
        print("[3] ○ いまの枝で足した #341 #342 も数える → 次は #343")
    else:
        print(f"[3] ✕ この枝の番号 {held4.get('この枝')} / 次 {mn.next_number(held4)}")
        ng += 1

    # [5] 差分の読みかた（節の深さだけ）
    got = mn.added("+## #12 a\n ## #13 b\n+### #14 c\n-## #15 d\n+## #16b\n")
    if got == {12}:
        print("[4] ○ 足した行の `## #N` だけを数える（残した行・小見出し・消した行・番号でない字は数えない）")
    else:
        print(f"[4] ✕ 差分から {got}（欲しいのは {{12}}）")
        ng += 1

    # [6] 本物のファイル
    if not DOC.exists():
        print(f"!! {DOC} が無い。数えるものが無い")
        return 2
    real = mn.numbers(DOC.read_text(encoding="utf-8"))
    if len(real) < 100:
        print(f"!! 本物から節が {len(real)} しか取れない。数えかたか置き場が変わった")
        return 2
    print(f"[5] ○ 本物から節 {len(real)} 本（いちばん大きい #{max(real)}）")
    return 1 if ng else 0


if __name__ == "__main__":
    sys.exit(main())
