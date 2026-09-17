"""**焼き込みがやせたときに commit を止める関所が、本当に止めるのかを見る。**

    python3 python/shrink_guard_selftest.py

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**（`docs/island-standards.md` §15）。

BigQuery も資格情報も要らない。**この箱で回る。**

## なぜ要るか

`.github/workflows/rebake.yml` の step「中の数が縮んでいないか」は、
**焼き込みがやせたときに commit を止める唯一の関所**。毎晩ひとりでに走って
master へ押し込む run なので、**読む人はいない。**

ところが 2026-09-17 に棚卸ししたら、その判定（`judge()` と `RULES`）を
**回すものがリポジトリのどこにも無かった。** 27 run で一度も赤くなっておらず、
「効いている」の証拠がゼロだった。**黙れば、やせた焼き込みがそのまま master と
本番に入る。** 隣の step「凍っていないか」は字面が動いたことしか見ないので
「動いた＝新しくなった」と読み、**誰も鳴らない。**

手本は隣にある。`python/bake_order_selftest.py` が step「凍っていないか」を
切り出して、並び替えだけの写しで赤・数字を1つ動かした写しで緑をやっている。
ここは同じやりかたで、step「中の数が縮んでいないか」に対照を付ける。

## 何を見るか

| | 見るもの | 落ちる条件 |
| --- | --- | --- |
| 1 | **焼いて commit するファイルが、全部 `RULES` に載っているか** | 見張りのいないファイルを commit している |
| 2 | **`RULES` の正規表現が、いまの焼き込みに当たるか**（分母） | 当たらない＝そのルールは永遠に鳴れない |
| 3 | **何も壊していない写しが通る** | 何にでも赤を出す関所になっている |
| 4a | **正常な晩（1% やせ）では鳴らない** | 狼少年。毎晩止まって、誰も読まなくなる |
| 4b | **塊が落ちたら（40% までに）鳴る** | 寝ている。4割消えても通す見張りは見張りではない |
| 5 | **そのルールを `RULES` から外すと、同じ写しが通る** | 別のルールが先に捕まえている（＝この行は要らない、か、重なっている） |

3 と 4 は**対**で見る。片方だけだと、何にでも赤を出す関所でも通る
（`docs/island-standards.md` §15 の決めごと）。

**4 が両側から当てるのは、片側だと通ってしまったから。** はじめは
「そのルールが落ちるまで、少しずつやせさせる」だけだった。それだと
**しきい値をゆるめても素通りする**——`場所の字が入っている配信` を
5pt → 95pt にゆるめて回したら、96% やせたところで落ちるので
「26本すべて効いている」と出た（`docs/island-misses.md` #124）。

**5 は「しきい値1つずつが仕事をしているか」。** 外しても落ちるなら、
その行が捕まえているのではなく、別の行が捕まえている。重なりは悪ではないが、
**どれが効いてどれが重なりかを、数で知っておく。**

## 壊しかたを、ルールの種類で変える理由

`RULES` の見かたは4つ（`keep` / `floor` / `band` / `share`）。
どれも**同じ物差し（やせた割合）**で壊す——そうしないと
「どれくらいやせたら鳴るか」を並べて読めない。
ただし**そのルールだけがやせる**ように、当てかたは分けてある。

- **数を数えるもの**（`keep` / `count` の `floor`）→ 当たっている字を潰す。
  **数字を持っている当たりは、小さいほうから。** 大きいほうから潰すと、
  同じ字を数えている合計のルールまで一緒に鳴る
- **数字を足すもの**（`sum` の `floor` / `band`）→ **字はそのままで数字だけ減らす。**
  潰すと件数まで減って、`countryStats.ts` の「国」と「配信」のように
  同じ字を見ている2本が同時に鳴る
- **割合（`share`）**→ **分子だけ**潰す。分母（`"v":` など）は残す。
  分子の当たりが分母の当たりを含んでいるときは、**分母のぶんだけ残して切る**

## 見張りをどうやって手元で回すか

step は**ワークフローの中に埋めてある**（チェックアウトが `ref: master` なので、
別ファイルにすると枝で試せない）。`bake_order_selftest.py` と同じく、
**PyYAML を使わずに**字面で切り出す。毎晩の焼き直しの箱に PyYAML は入って
いないし、確かめ1つのために焼き直しへ依存を増やさない。
"""

from __future__ import annotations

import io
import contextlib
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
YML = ROOT / ".github" / "workflows" / "rebake.yml"
CONTENT = ROOT / "site" / "content"
STEP = "中の数が縮んでいないか"

fails: list[str] = []
checks = 0


def say(ok: bool, line: str) -> None:
    global checks
    checks += 1
    print(("  OK   " if ok else "  NG   ") + line)
    if not ok:
        fails.append(line)


# ---------------------------------------------------------------- 切り出し


def guard_src() -> str:
    """rebake.yml に埋めてある step「中の数が縮んでいないか」を切り出す。

    `run:` の中のヒアドキュメント（`<<'PY'` 〜 `PY`）をそのまま取って、
    YAML の字下げ（10桁）を落とす。**PyYAML は使わない**（理由は上の docstring）。
    """
    text = YML.read_text(encoding="utf-8")
    head = text.index(f"- name: {STEP}")
    lo = text.index("<<'PY'\n", head) + 7
    hi = text.index("\n          PY\n", lo)
    return "\n".join(line[10:] for line in text[lo:hi].split("\n"))


def load_guard():
    """切り出した見張りを、走らせずに読み込む（`__main__` の番があるので走らない）。"""
    ns: dict = {"__name__": "shrink_guard"}
    exec(compile(guard_src(), "<rebake.yml:中の数が縮んでいないか>", "exec"), ns)
    return ns


def baked_paths() -> list[str]:
    """**焼いて commit しうるファイル**を、同じワークフローの allowlist から読む。

    見張りの表（`RULES`）を数えても、それは「見張っている数」でしかない。
    **分母は「焼いている数」**なので、あちらから取る（`docs/island-standards.md` §15）。
    """
    text = YML.read_text(encoding="utf-8")
    head = text.index("- name: 回すものを決める（allowlist）")
    tail = text.index("- name: Python 環境のセットアップ", head)
    return sorted(set(re.findall(r"site/content/\w+\.ts", text[head:tail])))


# ---------------------------------------------------------------- 壊しかた


def neutralize(text: str, pat: str, n: int) -> str:
    """当たっている字を n 個だけ**当たらない字**に潰す（＝件数がその数だけ減る）。

    同じ長さの `@` に置き換える。`@` は `RULES` のどの正規表現にも出てこないので、
    **潰したところが別のルールに当たり直すことはない。**

    **数字を持っている当たりは、小さいほうから潰す。** `countryStats.ts` の
    「国」（`lives: (\\d+)` を数える）は、**いちばん小さい国が落ちたときに
    捕まえるための行**（本数の合計を見る「配信」では 5% に届かない）。
    大きいほうから潰すと合計まで一緒に落ちて、**どちらの行が捕まえたのか
    分からなくなる。** 実際に起きる壊れかた（小さい国が1つ消える）に寄せる。
    """
    ms = list(re.finditer(pat, text, re.M))
    if ms and ms[0].lastindex and all(m.group(1).isdigit() for m in ms):
        ms.sort(key=lambda m: int(m.group(1)))
    out, cut = text, sorted((m.span() for m in ms[:n]), reverse=True)
    for lo, hi in cut:
        out = out[:lo] + "@" * (hi - lo) + out[hi:]
    return out


def shrink_sum(text: str, pat: str, amount: int) -> str:
    """当たっている字はそのまま、**中の数字だけ**を減らして合計を `amount` 落とす。

    合計で見るルール（`sum`）を、**件数を1件も減らさずに**やせさせる。
    潰してしまうと、同じ字を数えている別のルール（`countryStats.ts` の
    「国」と「配信」は両方 `lives: (\\d+)`）まで一緒に鳴って、
    どちらが捕まえたのか分からなくなる。

    減らすのは**小さいほうから**。大きい1つを 0 にすると行き過ぎるので、
    「どれくらいやせたら鳴るか」がその1つの大きさに引きずられる。
    """
    ms = [m for m in re.finditer(pat, text, re.M) if m.group(1).isdigit()]
    ms.sort(key=lambda m: int(m.group(1)))
    edits, left = [], amount
    for m in ms:
        if left <= 0:
            break
        v = int(m.group(1))
        cut = min(v, left)
        edits.append((m.span(1), str(v - cut)))
        left -= cut
    out = text
    for (lo, hi), new in sorted(edits, reverse=True):   # 後ろから当てて桁を崩さない
        out = out[:lo] + new + out[hi:]
    return out


def thin_share(text: str, num: str, den: str, n: int) -> str:
    """**分子だけ**を n 個やせさせる。分母は1件も減らさない。

    分子の当たりが分母の当たりを飲み込んでいることがある
    （`chapterStreams.ts` は分子 `["…", "…", "…"` ／ 分母 `["`）。
    そのときは**分母のぶんだけ残して切る**ので、件数はそのまま・割合だけ落ちる。
    """
    def repl(m: re.Match) -> str:
        inner = re.search(den, m.group(0), re.M)
        return inner.group(0) if inner else "@" * len(m.group(0))
    return re.sub(num, repl, text, count=n, flags=re.M)


def thin(g: dict, rule: dict, text: str, f: float) -> tuple[str, str]:
    """**「f だけやせた焼き込み」**を作る。(字面, 何をどれだけ減らしたかの一言)

    どのルールも同じ物差し（やせた割合）で壊す。そうしないと
    **「どれくらいやせたら鳴るか」を並べて読めない。**
    """
    if rule["kind"] == g["SHARE"]:
        den = g["measure"](text, rule["den"], "count")
        n = max(1, round(f * den))
        return thin_share(text, rule["num"], rule["den"], n), f"分子を {n}/{den} 件"
    b = g["measure"](text, rule["pat"], rule["mode"])
    if rule["mode"] == "sum":
        amount = max(1, round(f * b))
        return shrink_sum(text, rule["pat"], amount), f"合計を {amount:,}/{b:,}"
    n = max(1, round(f * b))
    return neutralize(text, rule["pat"], n), f"{n}/{b} 件"


# **「どれくらいやせたら鳴るか」を見る物差し。**
#
# `RULES` の本文には、しきい値の決めかたがこう書いてある——正常な晩の縮みは
# 「1〜数件」、塊（国ひとつ・章ひとつ）が落ちると「数十%」。**その2つのあいだ**に
# しきい値を置く、と。だからここは、その2つを両方から当てる。
#
# - 正常な晩（`NORMAL`）で鳴ったら、**狼少年**。毎晩止まって誰も読まなくなる
# - 塊（`BLOCK`）で鳴らなかったら、**寝ている。** 4割が消えても通す見張りは見張りではない
#
# **この2つを見ないと、しきい値をゆるめても対照が素通りする。** 実際、
# やせる量を「落ちるまで増やす」だけにしていたとき、`場所の字が入っている配信` の
# しきい値を 5pt → 95pt にゆるめても、95% やせさせて落ちるので「通った」と出た。
NORMAL = 0.01   # 1%（1本非公開になった、取り込み直しで境目が動いた）
BLOCK = 0.40    # 4割（国ひとつ・章ひとつが落ちる、より大きい）


def ring_at(g: dict, rule: dict, text: str) -> tuple[float, str, str] | None:
    """**何%やせたら鳴るか。** (割合, 一言, 鳴った字面)。100% やせても鳴らなければ None。"""
    for pct in range(1, 101):
        after, how = thin(g, rule, text, pct / 100)
        if after == text:
            continue
        ok, *_ = g["judge"](rule, text, after)
        if not ok:
            return pct / 100, how, after
    return None


# ---------------------------------------------------------------- 回しかた


def run_guard(before: Path, work: Path, paths: list[str], rules=None) -> tuple[int, str]:
    """見張りを1回回す。`rules` を渡すとその表で回る（しきい値を1つ外すため）。"""
    g = load_guard()
    if rules is not None:
        g["RULES"] = rules
    keep_argv, keep_cwd = sys.argv, os.getcwd()
    keep_env = os.environ.get("REBAKE_PATHS")
    buf = io.StringIO()
    try:
        os.chdir(work)
        sys.argv = ["guard", "--before", str(before), "--paths", " ".join(paths)]
        os.environ.pop("GITHUB_STEP_SUMMARY", None)
        with contextlib.redirect_stdout(buf):
            code = g["main"]()
    finally:
        sys.argv = keep_argv
        if keep_env is None:
            os.environ.pop("REBAKE_PATHS", None)
        else:
            os.environ["REBAKE_PATHS"] = keep_env
        os.chdir(keep_cwd)
    return code, buf.getvalue()


def stage(td: Path, override: dict[str, str] | None = None) -> tuple[Path, Path, list[str]]:
    """本番の焼き込みを「焼く前」に、写しを「焼いた後」に置く。

    **種は本番のファイル**（`site/content/*.ts`）。作り物の2行で試すと、
    焼き込みの書き方が変わった日に、変わったことに気づけない。
    """
    before, work = td / "before", td / "after"
    (work / "site" / "content").mkdir(parents=True, exist_ok=True)
    before.mkdir(parents=True, exist_ok=True)
    paths = []
    for name in sorted(WATCHED):
        src = CONTENT / name
        shutil.copyfile(src, before / name)
        text = (override or {}).get(name) or src.read_text(encoding="utf-8")
        (work / "site" / "content" / name).write_text(text, encoding="utf-8")
        paths.append(f"site/content/{name}")
    return before, work, paths


WATCHED: list[str] = []


# ---------------------------------------------------------------- 1・2. 分母


def check_denominator(g: dict) -> None:
    print("\n1. 焼いて commit するファイルが、見張りの表に載っているか")
    baked = baked_paths()
    names = [p.split("/")[-1] for p in baked]
    missing = [n for n in names if n not in g["RULES"]]
    extra = [n for n in g["RULES"] if n not in names]
    print(f"  allowlist が commit しうるファイル {len(names)} 枚 / "
          f"`RULES` に載っているファイル {len(g['RULES'])} 枚")
    say(not missing, f"見張りのいないファイルが無い（無い: {missing or 'なし'}）")
    say(not extra, f"`RULES` に、焼かないファイルが載っていない（余り: {extra or 'なし'}）")
    for n in names:
        if n in g["RULES"] and (CONTENT / n).exists():
            WATCHED.append(n)

    print("\n2. ルールの正規表現が、いまの焼き込みに当たるか（＝鳴れるか）")
    if not WATCHED:
        print("  見るものが1枚も無い")
        raise SystemExit(2)
    rows, dead = 0, []
    for name in WATCHED:
        text = (CONTENT / name).read_text(encoding="utf-8")
        for r in g["RULES"][name]:
            rows += 1
            if r["kind"] == g["SHARE"]:
                den = g["measure"](text, r["den"], "count")
                numv = g["measure"](text, r["num"], "count")
                hit, shown = den, f"{numv}/{den}"
            else:
                hit = g["measure"](text, r["pat"], r["mode"])
                shown = f"{hit:,}"
            print(f"     {name:<20} {r['label']:<22} {shown}")
            if hit == 0:
                dead.append(f"{name} の「{r['label']}」")
    print(f"  ルール {rows} 本を、本番の焼き込み {len(WATCHED)} 枚に当てた")
    say(not dead, f"当たらない（永遠に鳴れない）ルールが無い（{dead or 'なし'}）")


# ---------------------------------------------------------------- 3. 壊していない写し


def check_clean(g: dict) -> int:
    print("\n3. 何も壊していない写しが、先に通る")
    with tempfile.TemporaryDirectory() as td:
        before, work, paths = stage(Path(td))
        code, out = run_guard(before, work, paths)
        rows = len([ln for ln in out.splitlines() if ln.startswith("| ") and "---" not in ln]) - 1
        want = sum(len(v) for k, v in g["RULES"].items() if k in WATCHED)
        say(code == 0, f"終了コード 0（実際: {code}）")
        say("縮んでいるものはありませんでした" in out, "「縮んでいるものはありませんでした」と言う")
        say(rows == want, f"表の行が、当てたルールの数と同じ（{rows} 行 / ルール {want} 本）")

        # **ここも対照。** 前を空にすると「初めて焼いた」に落ちて全部素通りするので、
        # そのときに「通った」と読まないことを見ておく
        empty = Path(td) / "からっぽ"
        empty.mkdir()
        code2, out2 = run_guard(empty, work, paths)
        skipped = out2.count("初めて焼いたので比べない")
        say(code2 == 0 and skipped == len(paths),
            f"前が1枚も無い回は、比べずに素通りする（{skipped}/{len(paths)} 枚）"
            "——**この回の「通った」は、見たという意味ではない**")
    return want


# ---------------------------------------------------------------- 4・5. 壊した写し


def check_broken(g: dict) -> None:
    print("\n4・5. ルール1つずつ、そこだけやせさせた写しを当てる")
    print(f"     4a: 正常な晩（{NORMAL:.0%} やせ）で鳴らないか"
          f" / 4b: 塊が落ちたら（{BLOCK:.0%} までに）鳴るか / 5: その行を外すと通るか")
    caught = alone = quiet = 0
    asleep, overlap, crybaby = [], [], []
    total = sum(len(g["RULES"][n]) for n in WATCHED)

    for name in WATCHED:
        text = (CONTENT / name).read_text(encoding="utf-8")
        for r in g["RULES"][name]:
            tag = f"{name} の「{r['label']}」"

            # 4a. **正常な晩で鳴らないこと。** `keep` は「1つでも減ったら止める」
            #     ための行なので、ここは見ない（見ると、仕様どおりの行が落ちる）
            if r["kind"] == g["KEEP"]:
                quiet += 1
                print(f"  --   {tag} —— 正常な晩は見ない"
                      "（`keep` は1つ減っただけで止めるための行）")
            else:
                small, how = thin(g, r, text, NORMAL)
                ok, *_ = g["judge"](r, text, small)
                quiet += bool(ok)
                say(ok, f"{tag} —— 正常な晩（{how} やせ）では鳴らない")
                if not ok:
                    crybaby.append(tag)

            # 4b. **塊が落ちたら鳴ること。**
            got = ring_at(g, r, text)
            if got is None or got[0] > BLOCK:
                where = "100% やせても鳴らない" if got is None else f"{got[0]:.0%} やせないと鳴らない"
                asleep.append(f"{tag}（{where}）")
                say(False, f"{tag} —— {where}（{BLOCK:.0%} までに鳴ってほしい）")
                continue
            f, how, broken = got

            with tempfile.TemporaryDirectory() as td:
                before, work, paths = stage(Path(td), {name: broken})
                code, out = run_guard(before, work, paths)
                hit = [ln for ln in out.splitlines()
                       if ln.startswith("::error::") and name in ln and r["label"] in ln]
                ok = code == 1 and len(hit) == 1
                caught += bool(ok)
                say(ok, f"{tag} —— {how}（{f:.0%}）やせさせたら落ちた（終了コード {code}）")
                if hit:
                    print("         " + hit[0].replace("::error::", "→ "))

                # 5. **その行を外すと通るか。** 通れば、捕まえたのは確かにその行
                thinned = {k2: [x for x in v if x is not r] for k2, v in g["RULES"].items()}
                code2, out2 = run_guard(before, work, paths, rules=thinned)
                if code2 == 0:
                    alone += 1
                    print("         外すと通る＝この行が捕まえている")
                else:
                    who = sorted({ln.split(" の「")[1].split("」")[0]
                                  for ln in out2.splitlines() if ln.startswith("::error::")})
                    overlap.append((tag, who))
                    print(f"         外しても落ちる＝重なっている（捕まえたのは: {', '.join(who)}）")

    print(f"\n  ルール {total} 本のうち")
    print(f"    正常な晩に鳴らない  : {quiet} 本")
    print(f"    塊が落ちたら鳴る    : {caught} 本")
    print(f"    外すと通る（その行しか捕まえていない）: {alone} 本")
    if overlap:
        print("  重なっている行（外しても別の行が捕まえる）:")
        for tag, who in overlap:
            print(f"    - {tag} ← {', '.join(who)}")
    if asleep:
        print("  寝ている行:")
        for tag in asleep:
            print("    - " + tag)
    if crybaby:
        print("  狼少年の行（正常な晩に鳴る）:")
        for tag in crybaby:
            print("    - " + tag)


def main() -> int:
    g = load_guard()
    print(f"見張りを {YML.name} の step「{STEP}」から切り出した（{len(guard_src().splitlines())} 行）")

    check_denominator(g)
    check_clean(g)
    check_broken(g)

    print()
    if fails:
        print(f"{checks} 件みて、落ちたのは {len(fails)} 件")
        for f in fails:
            print("  - " + f)
        return 1
    print(f"{checks} 件みて、落ちたのは 0 件")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
