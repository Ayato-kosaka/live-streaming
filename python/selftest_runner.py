"""**見張り（`*_selftest.py`）をまとめて回して、落ちたものを並べる。**

    python3 python/selftest_runner.py              # 拾えるもの全部
    python3 python/selftest_runner.py --list       # 何を回すかだけ出す
    python3 python/selftest_runner.py --only-drill # 対照だけ回して帰る
    python3 python/selftest_runner.py path/to/a_selftest.py …  # 指定のものだけ

終了コード 0=ぜんぶ通った / 1=落ちたものがある /
**2=数えるものが無い**（`docs/island-standards.md` §15）。

## なぜ要るか

2026-09-18 まで、このリポジトリには **`pull_request` で走るワークフローが
1本も無かった。** 見張りは全部、毎晩の焼き直し（`rebake.yml`）などの中でしか
走っていない——つまり **master にマージして、本番に配ったあと。**

その日に実害が2つ出た。

1. `python/dead_stream_watch_selftest.py` が **master で赤いまま2日残った**
   （#520 が対照の前提を壊した）。どこからも走っていなかったので誰も気づかない
2. **その赤い見張りを抱えたまま #520 をマージして、本番に配った**

同じ日に棚卸ししたら、**どこからも走っていない見張りが12本**あった
（`python/admin/` の9本＋`public_ids` `text_expires_watch` `name_tail`）。
`python/admin/` の3本（`donors_import` / `firestore_delete` / `ip_purge`）は
**消す道具を守っている見張り**で、いちばん走っていてほしいものが走っていなかった。

## 拾い方は「全部拾って、外すものだけ名前で断る」

`SKIP` に名前が無いものは**黙って回る。** 逆（回すものを表に並べる）にすると、
**見張りを足した日に表へ書き足し忘れても赤くならない**——#125 で踏んだ
「書いたのに走らない」がそのまま戻ってくる。外す側を書かせれば、
足した人は何もしなくても繋がる。

外してよいのは「外に出る・鍵が要る・遅い」ものだけ。毎 PR で落ちる見張りを
混ぜると**赤が意味を失う**ので、そこは `SKIP` に理由ごと書く。

**拾うのは Python の `*_selftest.py` だけ。** `site/selftest/*.mjs` の4本
（`chatdown` / `chatter` / `folk` / `roster`）は `site/node_modules` の
`tsc` が要るので、ここでは拾わない（`rebake.yml` では回っている）。
繋ぐなら `npm ci` を足す回で、この行も一緒に消すこと。

## 対照（`docs/island-standards.md` §15）

**回し役そのものが落ちられるか**を、本物の見張りを1本も回す前に見る。
偽の見張りを3本こしらえて、

  - 通るものだけ → **0**
  - 1本落ちるものを混ぜる → **1**（しかも落ちた名前が出る）
  - 1本も拾えない → **2**

を実測する。1つでも外れたら、本物の数字を1つも出さずに 2 で落ちる。
「いつも緑の CI」は、何も守っていないのに守っている気にさせる——
それがいちばん高くつく。

## `BQ_PROJECT_ID` を置いていくのはなぜか

`python/config.py` は読み込まれた時点で `BQ_PROJECT_ID` が無いと投げる。
見張りは BigQuery のクライアントを全部偽物に差し替えてあるので、
**この値はどこにも届かない**（届く道が残っていたら、でたらめな名前で
落ちてほしい）。置かないと `python/backup/photos_selftest.py` が
「環境変数が無い」だけで赤くなり、手元と CI で結果が変わる。
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent          # python/
REPO = HERE.parent

# 1本にかける上限。止まった見張りは「落ちた」であって「待つもの」ではない
TIMEOUT_SEC = 300

# **要約欄の行き先は、起動した時点で環境から取り上げる。**
#
# 見張りの中には、守っている本物の道具を子として起こすものがある
# （`stale_content_watch_selftest.py` / `text_expires_watch_selftest.py`）。
# あれが仕込みで作った偽の赤——「recipes.ts が 200日前で止まっています」——を
# そのまま GitHub の要約欄に書くので、**26本ぜんぶ通った回の要約が、
# 落ちた回とそっくりになる。** 見る人には見分けがつかない。
#
# 取り上げておけば、子は環境変数が無いので何も書かない
# （どの見張りも「欄が無ければ黙る」作りになっている）。
# **要約欄に書いてよいのは、ここだけ。**
SUMMARY_PATH = os.environ.pop("GITHUB_STEP_SUMMARY", None)

# **回さないもの。名前と、回さない理由。**
#
# ここに書いてよいのは「外に出る・鍵が要る・遅い」の3つだけ。
# 「たぶん落ちるから」で外さない——落ちるなら、それは見つけた不具合。
SKIP: dict[str, str] = {
    # 2026-09-18 現在、外すものは1本も無い。Python の見張り26本は
    # どれも「ネットにも鍵にも触らない」と自分の頭に書いてあり、
    # 実際に全部この箱で回った（いちばん遅い1本で5秒、26本で18秒）
}

# 既定の引数。ここに載せたものは、載せた形でだけ回る
ARGS: dict[str, list[str]] = {
    # 本番を叩く側は PR では回さない。**対照（探し方が効くか）だけ**を回す。
    # 本番を読むほうは `python3 python/public_ids_selftest.py` を手で
    "python/public_ids_selftest.py": ["--offline"],
}


def discover(root: Path) -> list[Path]:
    """`*_selftest.py` を拾う。この回し役自身は `_selftest.py` で終わらない。"""
    return sorted(
        p for p in root.rglob("*_selftest.py")
        if "__pycache__" not in p.parts
    )


def label(path: Path, cwd: Path) -> str:
    """出すときの名前。cwd の外を名指しされたら、そのままの姿で出す。"""
    try:
        return path.relative_to(cwd).as_posix()
    except ValueError:
        return path.as_posix()


def run_one(path: Path, cwd: Path, env: dict) -> tuple[int, float, str]:
    """1本回して（終了コード, かかった秒, 最後の1行）を返す。"""
    rel = label(path, cwd)
    cmd = [sys.executable, rel if not rel.startswith("/") else str(path),
           *ARGS.get(rel, [])]
    t0 = time.monotonic()
    try:
        r = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True,
                           text=True, timeout=TIMEOUT_SEC, check=False)
        rc, out = r.returncode, (r.stdout + r.stderr)
    except subprocess.TimeoutExpired:
        # **黙って飛ばさない。** 止まったものは落ちたものとして数える
        rc, out = 1, f"{TIMEOUT_SEC} 秒で返ってこなかった"
    dt = time.monotonic() - t0
    tail = ""
    for line in reversed(out.splitlines()):
        if line.strip():
            tail = line.strip()[:160]
            break
    return rc, dt, tail


def drill() -> bool:
    """**回し役が落ちられるか**を、偽の見張り3本で先に見る。

    本物を1本も回す前に、0 と 1 と 2 が実測で出ることを確かめる。
    1つでも外れたら False。
    """
    ok = True
    with tempfile.TemporaryDirectory() as tmp:
        box = Path(tmp)
        (box / "green_selftest.py").write_text("print('ok')\n", encoding="utf-8")
        (box / "also_green_selftest.py").write_text("print('ok')\n", encoding="utf-8")
        (box / "red_selftest.py").write_text(
            "import sys\nprint('わざと落とす')\nsys.exit(1)\n", encoding="utf-8")
        empty = box / "empty"
        empty.mkdir()

        # 上で `SUMMARY_PATH` を環境から取り上げてあるので、対照の子
        # （偽の見張り）も要約欄には1行も書けない
        env = dict(os.environ)

        def sub(root: Path, want: int, need: str | None) -> None:
            nonlocal ok
            r = subprocess.run(
                [sys.executable, str(Path(__file__).resolve()),
                 "--root", str(root), "--no-drill"],
                capture_output=True, text=True, timeout=TIMEOUT_SEC,
                check=False, env=env)
            got = r.returncode
            hit = (need is None) or (need in r.stdout)
            mark = "○" if (got == want and hit) else "✕"
            if mark == "✕":
                ok = False
            extra = "" if need is None else f"・「{need}」が出た: {hit}"
            print(f"  {mark} {root.name} → 終了コード {got}（欲しいのは {want}）{extra}")

        print("[対照] 回し役そのものが、落ちるときに落ちるか")
        # 2本とも通る → 0
        only_green = box / "onlygreen"
        only_green.mkdir()
        (only_green / "a_selftest.py").write_text("print('ok')\n", encoding="utf-8")
        (only_green / "b_selftest.py").write_text("print('ok')\n", encoding="utf-8")
        sub(only_green, 0, None)
        # 1本落ちる → 1。**落ちた名前が出るところまで見る**
        sub(box, 1, "red_selftest.py")
        # 1本も拾えない → 2。ここが 0 だと「ぜんぶ通りました」の嘘になる
        sub(empty, 2, None)
    print("  " + ("○ 回し役は落ちられる" if ok else "✕ 回し役の対照が外れた"))
    return ok


def summary(lines: list[str]) -> None:
    """GitHub の要約欄に書く。欄が無ければ何もしない（手元で回したとき）。"""
    p = SUMMARY_PATH
    if not p:
        return
    try:
        with open(p, "a", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
    except OSError as e:
        print(f"::warning::要約欄に書けなかった: {e}")


def main() -> int:
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("paths", nargs="*", help="回すものを名指しする（対照を作るとき）")
    ap.add_argument("--root", default=None, help="拾いに行く場所（既定: python/）")
    ap.add_argument("--list", action="store_true", help="回さずに、回すものを並べる")
    ap.add_argument("--only-drill", action="store_true", help="対照だけ回して帰る")
    ap.add_argument("--no-drill", action="store_true", help="対照を飛ばす（対照の中から呼ぶ用）")
    a = ap.parse_args()

    # `python/config.py` は読み込んだ時点で投げる。見張りの中では
    # BigQuery のクライアントが偽物に差し替わっているので、この値は届かない
    os.environ.setdefault("BQ_PROJECT_ID", "selftest-no-such-project")

    if not a.no_drill:
        if not drill():
            print("\n✕ 回し役の対照が外れた。**本物の見張りは1本も回していない**")
            summary(["### 見張り", "",
                     "**回し役の対照が外れた。見張りは1本も回していない。**"])
            return 2
        if a.only_drill:
            return 0
        print()

    root = Path(a.root).resolve() if a.root else HERE
    cwd = REPO if a.root is None else root

    skipped: list[tuple[str, str]] = []
    if a.paths:
        found = [Path(p).resolve() for p in a.paths]
        missing = [p for p in found if not p.is_file()]
        if missing:
            for p in missing:
                print(f"✕ 見つからない: {p}")
            return 2
    else:
        found = discover(root)
        # `--root` を渡されているのは対照の中から呼ばれたときだけ。
        # そこに本物の `SKIP` を当てても意味がないので、素の拾いだけを見る
        if a.root is None:
            # **`SKIP` が腐っていないか。** 名前が変わったのに表に残っていると、
            # 「外してある」つもりのものが黙って居なくなる（#125 と同じ形）
            rot = [n for n in list(SKIP) + list(ARGS)
                   if not (cwd / n).is_file()]
            if rot:
                for n in rot:
                    print(f"✕ 表に在るのに、そのファイルが無い: {n}")
                print("拾いかたが壊れている。数字は1つも出さない")
                return 2
            skipped = sorted(SKIP.items())
            found = [p for p in found if label(p, cwd) not in SKIP]

    if not found:
        print("✕ 見張りを1本も拾えなかった（拾いに行った先: "
              f"{root}）。**「ぜんぶ通りました」とは言わない**")
        summary(["### 見張り", "", "**1本も拾えなかった。**"])
        return 2

    if a.list:
        print(f"[見張り] {len(found)}本"
              + (f"（外したもの {len(skipped)}本）" if skipped else ""))
        for p in found:
            rel = label(p, cwd)
            print("  " + " ".join([rel, *ARGS.get(rel, [])]))
        for n, why in skipped:
            print(f"  — 外した {n} … {why}")
        return 0

    print(f"[見張り] {len(found)}本を回す"
          + (f"（外したもの {len(skipped)}本）" if skipped else ""))
    for n, why in skipped:
        print(f"  — 外した {n} … {why}")

    env = dict(os.environ)
    bad: list[tuple[str, int, str]] = []
    for p in found:
        rel = label(p, cwd)
        rc, dt, tail = run_one(p, cwd, env)
        mark = "○" if rc == 0 else "✕"
        if rc != 0:
            bad.append((rel, rc, tail))
        print(f"  {mark} {rel}  終了コード {rc}  {dt:.1f}秒")
        if rc != 0:
            print(f"      {tail}")

    print()
    print(f"見た {len(found)}本 / 通った {len(found) - len(bad)}本 / "
          f"落ちた {len(bad)}本")

    head = [f"### 見張り {len(found) - len(bad)}/{len(found)} 本が通りました", ""]
    if bad:
        print("\n落ちた見張り:")
        head = [f"### 見張りが {len(bad)} 本落ちました", "",
                f"見た {len(found)}本 / 通った {len(found) - len(bad)}本", "",
                "| 見張り | 終了コード | 最後の1行 |", "| --- | --- | --- |"]
        for rel, rc, tail in bad:
            print(f"  ✕ {rel}（終了コード {rc}）")
            # 表の区切りと同じ字が本文に入ると、列がずれる
            safe = tail.replace("|", "\\|")
            head.append(f"| `{rel}` | {rc} | {safe} |")
        summary(head)
        return 1

    summary(head + [f"見た {len(found)}本、落ちたものはありません。"])
    print("○ ぜんぶ通りました")
    return 0


if __name__ == "__main__":
    sys.exit(main())
