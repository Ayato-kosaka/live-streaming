"""**毎晩の焼き直しが落ちた回の要約が、嘘をついていないか。**

    python3 python/rebake_summary_selftest.py

終了コード 0=ぜんぶ通った / 1=落ちたものがある / **2=数えるものが無い**
（`docs/island-standards.md` §15）。

## なぜ要るか

`rebake.yml` の最後に、落ちた回だけ走る記録係（`if: failure()`）が在る。
あれは長いあいだ、**落ちた場所を見ずに**こう書いていた。

> - **master には入れていません。**

2026-10-07 の scheduled run（`37583492083`）が、その字を出しながら
**step 34「master に入れる」と 35「Hosting を配る」を通していた**
（commit `599290b`）。すぐ上の見張りが「**この赤は『落ちた』ではありません。**
焼けたものは master に入れて、配るところまで済んでいます」と正しく言っているのを、
**job の要約が打ち消していた。** 要約は run の1枚目に出るので、
ログを開かずに読む人はそちらを信じる。

## 何を見ているか

**`rebake.yml` の `run:` を、そのまま bash で回す。** 写しを置くと、
本体を直したのに確かめが古いまま通る。step 34 / 35 の結果を6通り差し込んで、
出てきた字を読む。

  1. 入れて配った回 → 「配るところまで済んでいます」。**「入れていません」と言わない**
  2. 入れたが配っていない回 → 「入れてあります」。同じく言わない
  3. 焼いた結果が前と同じ回 → 「commit するものがありませんでした」
  4. 見るだけ（dry_run）の回 → 「見るだけ」＋「入れていません」
  5. commit が落ちた回 → 「入れていません」＋**焼く手前の心当たり3つ**
  6. commit まで来ていない回 → 同じ

**心当たりの3つ（焼く・縮み・ビルド）は、どれも commit より前の step。**
入っている回に並べると、通った step を疑わせることになるので出さない。

## 焼き込みが古いという赤が、焼き直しを止めないこと

企画の表（`plans.ts`）の見張りは `python/stale_content_watch.py` から外した
（0件が正常な状態で、**消しようのない赤**になった。#673）。外したあとも、
あの step が**配りのうしろに在る**ことは変わらず要る——古い焼き込みが1本
あるだけで、同じ晩に焼けた他の数字まで master に入らないのは悪い。

ここでは step の並び（`master に入れる` → `Hosting を配る` →
`焼き込みが古くなっていないか`）と、`bake_down.why_red()` がその赤を
**`stale`（焼き直しは通っている）**と読むことを見る。
並びが入れ替わったら、ここが落ちる。
"""
from __future__ import annotations

import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
WORKFLOW = REPO / ".github" / "workflows" / "rebake.yml"

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bake_down  # noqa: E402

SUMMARY_STEP = "落ちたときに、どこで落ちたかを残す"
COMMIT_STEP = "master に入れる"
DEPLOY_STEP = "Hosting を配る"

OK: list[str] = []
NG: list[str] = []


def check(label: str, got, want) -> None:
    (OK if got == want else NG).append(f"{label}: 出た={got} ほしい={want}")


def steps_of(src: str) -> list[str]:
    """`rebake.yml` の step の名前を、書いてある順に。

    **yaml で読まない。** このファイルは `${{ }}` を含むので、素の yaml として
    読める保証を1本の道具に賭けない。`- name:` の行だけを順番に拾う。
    """
    return re.findall(r"^      - name: (.+)$", src, re.M)


def run_block(src: str, name: str) -> str:
    """その step の `run:` の中身を、字下げを落として返す。"""
    # `- name: <name>` から、次の `      - name:` までを切る
    start = src.index(f"      - name: {name}\n")
    rest = src[start + 1 :]
    nxt = rest.find("\n      - name: ")
    chunk = rest[: nxt if nxt >= 0 else len(rest)]
    m = re.search(r"^        run: \|\n(.*)", chunk, re.S | re.M)
    if not m:
        return ""
    lines = []
    for line in m.group(1).split("\n"):
        if line.strip() and not line.startswith("          "):
            break
        lines.append(line[10:] if line.startswith("          ") else line)
    return "\n".join(lines)


def summary_for(script: str, env: dict[str, str]) -> str:
    """その `run:` を bash で回して、要約に書かれた字を返す。"""
    with tempfile.TemporaryDirectory() as tmp:
        sh = Path(tmp) / "step.sh"
        sh.write_text(script, encoding="utf-8")
        out = Path(tmp) / "summary.md"
        out.write_text("", encoding="utf-8")
        e = dict(os.environ)
        e.update({"GITHUB_STEP_SUMMARY": str(out)})
        e.update(env)
        r = subprocess.run(["bash", str(sh)], env=e, capture_output=True, text=True)
        if r.returncode != 0:
            NG.append(f"要約の run が {r.returncode} で落ちました: {r.stderr[:400]}")
        return out.read_text(encoding="utf-8")


LANDED = "入れていません"
CAUSES = "よくあるのは3つです"


def main() -> int:
    if not WORKFLOW.exists():
        print(f"::error::{WORKFLOW} が無いので、数えるものがありません")
        return 2
    src = WORKFLOW.read_text(encoding="utf-8")
    names = steps_of(src)
    if not names:
        print("::error::step の名前を1つも読めませんでした")
        return 2
    print(f"# {WORKFLOW.relative_to(REPO)} の step {len(names)}本")

    # --- 0. 読めているか（分母。§15）------------------------------------
    for want in (SUMMARY_STEP, COMMIT_STEP, DEPLOY_STEP, bake_down.STALE_STEP):
        check(f"step 「{want}」が在る", want in names, True)
    script = run_block(src, SUMMARY_STEP)
    check("要約の run を読めた", len(script) > 200, True)
    if NG:
        for line in NG:
            print(f"  NG   {line}")
        print("::error::要約の step を読めていないので、合否は出しません")
        return 2

    # --- 1. step 34 の結果ごとに、出る字を見る ---------------------------
    #
    # | commit | changed | deploy | dry | 要約が言うこと |
    # | --- | --- | --- | --- | --- |
    CASES = (
        (
            "入れて配った回（2026-10-07 の run がこれ）",
            {"COMMIT_RESULT": "success", "COMMIT_CHANGED": "1",
             "DEPLOY_RESULT": "success", "REBAKE_DRY": "0"},
            ["配るところまで済んでいます"],
            [LANDED, CAUSES],
        ),
        (
            "入れたが、まだ配っていない回",
            {"COMMIT_RESULT": "success", "COMMIT_CHANGED": "1",
             "DEPLOY_RESULT": "skipped", "REBAKE_DRY": "0"},
            ["master に入れてあります", "まだ配っていません"],
            [LANDED, CAUSES],
        ),
        (
            "焼いた結果が前と同じで、commit しなかった回",
            {"COMMIT_RESULT": "success", "COMMIT_CHANGED": "0",
             "DEPLOY_RESULT": "skipped", "REBAKE_DRY": "0"},
            ["commit するものがありませんでした"],
            [LANDED, CAUSES],
        ),
        (
            "見るだけ（dry_run）の回",
            {"COMMIT_RESULT": "skipped", "COMMIT_CHANGED": "",
             "DEPLOY_RESULT": "skipped", "REBAKE_DRY": "1"},
            ["見るだけ", LANDED, CAUSES],
            [],
        ),
        (
            "commit が落ちた回（push がぶつかった、など）",
            {"COMMIT_RESULT": "failure", "COMMIT_CHANGED": "",
             "DEPLOY_RESULT": "skipped", "REBAKE_DRY": "0"},
            [LANDED, CAUSES],
            ["配るところまで済んでいます"],
        ),
        (
            "commit まで来ずに落ちた回",
            {"COMMIT_RESULT": "", "COMMIT_CHANGED": "",
             "DEPLOY_RESULT": "", "REBAKE_DRY": "0"},
            [LANDED, CAUSES],
            ["配るところまで済んでいます"],
        ),
    )
    for label, env, want_in, want_out in CASES:
        env = {"REBAKE_SCRIPTS": "build_shorts", **env}
        text = summary_for(script, env)
        for w in want_in:
            check(f"{label}：「{w}」と言う", w in text, True)
        for w in want_out:
            check(f"{label}：「{w}」と言わない", w in text, False)
        # **どの回でも、落ちたことは言う。** 字を分けたせいで
        # 「落ちました」が消えると、要約として意味が無くなる
        check(f"{label}：落ちたこと自体は言う", "落ちました" in text, True)

    # --- 2. 古い焼き込みの赤が、焼き直しを止めないこと --------------------
    #
    # 企画の表（`plans.ts`）はこの見張りから外したが、**見張りが配りのうしろに
    # 在ること**は変わらず要る（1本古いだけで、同じ晩の数字まで入らないのは悪い）
    i_commit = names.index(COMMIT_STEP)
    i_deploy = names.index(DEPLOY_STEP)
    i_stale = names.index(bake_down.STALE_STEP)
    check("「Hosting を配る」は「master に入れる」のうしろ", i_deploy > i_commit, True)
    check("「焼き込みが古くなっていないか」は配りのうしろ", i_stale > i_deploy, True)
    # 止めないための札。**`!cancelled()`** なので、前が赤くても走る
    stale_chunk = src[src.index(f"      - name: {bake_down.STALE_STEP}\n") :][:400]
    check("古い焼き込みの見張りは `!cancelled()` で走る",
          "!cancelled()" in stale_chunk, True)
    # その赤を、朝の仕分けが「焼き直しは通っている」と読むか
    verdict = bake_down.why_red([
        {"name": COMMIT_STEP, "conclusion": "success"},
        {"name": DEPLOY_STEP, "conclusion": "success"},
        {"name": bake_down.STALE_STEP, "conclusion": "failure"},
    ])
    check("古い焼き込みだけが赤い回の仕分け", verdict["why"], "stale")
    # **対照。** 焼くのが落ちた回は、同じ道具が別の答えを出す
    # （出さなければ、上の合格は「いつでも stale と言う」でも通る）
    check("焼くのが落ちた回の仕分け（対照）",
          bake_down.why_red([{"name": "焼く", "conclusion": "failure"}])["why"],
          "broken")

    for line in OK:
        print(f"  ok   {line}")
    for line in NG:
        print(f"  NG   {line}")
    print(f"\n{len(OK) + len(NG)}件中 {len(OK)}件通った")
    if NG:
        print("::error::落ちた回の要約が、入れたかどうかを言い違えています")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
