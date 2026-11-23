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
| 0 | **毎晩の一覧と allowlist が食い違っていないか** | `ALL` に足して毎晩に足し忘れた（2026-10-07 に踏んだ） |
| 1 | **焼いて commit するファイルが、全部 `RULES` に載っているか** | 見張りのいないファイルを commit している |
| 2 | **`RULES` の正規表現が、いまの焼き込みに当たるか**（分母） | 当たらない＝そのルールは永遠に鳴れない |
| 3 | **何も壊していない写しが通る** | 何にでも赤を出す関所になっている |
| 4a | **正常な晩（1% やせ）では鳴らない** | 狼少年。毎晩止まって、誰も読まなくなる |
| 4b | **塊が落ちたら（40% までに）鳴る** | 寝ている。4割消えても通す見張りは見張りではない |
| 5 | **そのルールを `RULES` から外すと、同じ写しが通る** | 別のルールが先に捕まえている（＝この行は要らない、か、重なっている） |
| 6 | **`match` が、名簿と帳尻の合う縮みを通し、合わない形で止まる** | 正しい縮みを止めている（2026-10-03 の 103→100 がこれ）か、何も見ていない |
| 7 | **絵の表を焼けなかった晩に、他の焼き込みが巻き添えにならない** | 外のサービスが落ちただけで島の数字が丸ごと止まる（#105 で「1本が落ちても後ろを止めない」と決めた） |
| 8 | **`roster` が、滞在の表から消えた国の縮みを通し、表に居る国の落ちで止まる** | 正しい縮みを止めている（2026-11-23 の `iran-border` がこれ）か、名簿の読みかたが焼く道具の国とずれている |

3 と 4 は**対**で見る。片方だけだと、何にでも赤を出す関所でも通る
（`docs/island-standards.md` §15 の決めごと）。

**4 が両側から当てるのは、片側だと通ってしまったから。** はじめは
「そのルールが落ちるまで、少しずつやせさせる」だけだった。それだと
**しきい値をゆるめても素通りする**——`場所の字が入っている配信` を
5pt → 95pt にゆるめて回したら、96% やせたところで落ちるので
「26本すべて効いている」と出た（`docs/island-misses.md` #125）。

**5 は「しきい値1つずつが仕事をしているか」。** 外しても落ちるなら、
その行が捕まえているのではなく、別の行が捕まえている。重なりは悪ではないが、
**どれが効いてどれが重なりかを、数で知っておく。**

## 壊しかたを、ルールの種類で変える理由

`RULES` の見かたは6つ（`keep` / `floor` / `band` / `share` / `match` / `roster`）。
壊しかたを変えるのは前の4つ。**`match` は 6章、`roster` は 8章でまとめて見る**（物差しが
「前の版」ではなく「同じ置き場の別のファイル」なので、やせ具合では読めない）。
前の4つはどれも**同じ物差し（やせた割合）**で壊す——そうしないと
「どれくらいやせたら鳴るか」を並べて読めない。
ただし**そのルールだけがやせる**ように、当てかたは分けてある。
（`roster` も 4b・5章には並ぶ。国の鍵を潰すと「名簿に居るのに落ちた」になるので、
数を数えるものと同じ壊しかたで当たる）

- **数を数えるもの**（`keep` / `count` の `floor` / `roster`）→ 当たっている字を潰す。
  **数字を持っている当たりは、小さいほうから。** 大きいほうから潰すと、
  同じ字を数えている合計のルールまで一緒に鳴る
- **数字を足すもの**（`sum` の `floor` / `band`）→ **字はそのままで数字だけ減らす。**
  潰すと件数まで減って、同じ字を見ている別のルールまで一緒に鳴る
  （前は `countryStats.ts` の「国」と「配信」が両方 `lives:` を見ていた）
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


def step_run(name: str) -> str:
    """step の `run:` の中身を切り出す（字下げ10桁を落とす）。

    7章で、**シェルのほうの足**（焼けなかった表を対象から外すところ）を
    そのまま走らせるために要る。ここも `guard_src()` と同じく PyYAML は使わない。
    """
    text = YML.read_text(encoding="utf-8")
    head = text.index(f"- name: {name}")
    lo = text.index("\n        run: |\n", head) + len("\n        run: |\n")
    out = []
    for line in text[lo:].split("\n"):
        if line.strip() and not line.startswith(" " * 10):
            break
        out.append(line[10:])
    return "\n".join(out)


def load_guard():
    """切り出した見張りを、走らせずに読み込む（`__main__` の番があるので走らない）。"""
    ns: dict = {"__name__": "shrink_guard"}
    exec(compile(guard_src(), "<rebake.yml:中の数が縮んでいないか>", "exec"), ns)
    return ns


# **毎晩には乗せない、と決めてあるもの。理由を書かないと足せない**
# （`python/watch_excuses.py` と同じ形。`docs/island-standards.md` §8）。
#
# ここに名前が無いスクリプトが `ALL` に在って毎晩の一覧に無ければ、
# **乗せたつもりで乗っていない**として落とす。1章で両側から見る。
NOT_NIGHTLY: dict[str, str] = {
    "build_kitchen_talk":
        "BigQuery を引かない。`python/data/kitchen_*.json` の焼き直しなので、"
        "回しても同じものが焼き直るだけ。先に JSON を取り直すのは人の仕事"
        "（2026-10-07 現在）",
}


def nightly_scripts() -> list[str]:
    """**毎晩ひとりでに回る一覧**を、step「今回の押しかたを決める」から読む。

    allowlist（`ALL`）とは**別の並び**。あちらの「入力が空なら全部」は、
    手で押して入力欄を空にしたときだけ通る道なので、`ALL` に足しただけでは
    毎晩には乗らない（2026-10-07 に実際に踏んだ）。
    """
    text = YML.read_text(encoding="utf-8")
    head = text.index("- name: 今回の押しかたを決める")
    tail = text.index("- name: 回すものを決める（allowlist）", head)
    m = re.search(r'echo "REBAKE_IN=([a-z0-9_,]+)"', text[head:tail])
    return sorted(m.group(1).split(",")) if m else []


def allowlist_scripts() -> list[str]:
    """**回してよい一覧**（`ALL`）を、step「回すものを決める（allowlist）」から読む。"""
    text = YML.read_text(encoding="utf-8")
    head = text.index("- name: 回すものを決める（allowlist）")
    m = re.search(r'^\s*ALL="([^"]+)"', text[head:], re.M)
    return sorted(m.group(1).split()) if m else []


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

    **数字を持っている当たりは、小さいほうから潰す。** 実際に起きる壊れかた
    （小さいものが1つ消える）に寄せる。前は `countryStats.ts` の「国」が
    `lives: (\\d+)` を件数で数えていて、同じ字を合計で見る「配信」と重なっていた。
    大きいほうから潰すと合計まで一緒に落ちて、**どちらの行が捕まえたのか
    分からなくなる**（いまは国の鍵を数えるので、潰しても `lives:` は残る）。
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
    潰してしまうと件数まで減って、同じ字を件数で数える別のルールがあれば
    一緒に鳴り、どちらが捕まえたのか分からなくなる（前は `countryStats.ts` の
    「国」と「配信」が両方 `lives: (\\d+)` を見ていた）。

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


def ring_at(g: dict, rule: dict, text: str, mate: str | None = None) -> tuple[float, str, str] | None:
    """**何%やせたら鳴るか。** (割合, 一言, 鳴った字面)。100% やせても鳴らなければ None。"""
    for pct in range(1, 101):
        after, how = thin(g, rule, text, pct / 100)
        if after == text:
            continue
        ok, *_ = g["judge"](rule, text, after, mate)
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


_SEED: dict[str, str] = {}


def roster_matched(box: str) -> str:
    """`characterBox.ts` を**名簿とそろえた形**にする（＝焼き直しが書くはずの形）。

    名簿に居ない id の箱を落とし、箱の無い人に箱を足す。値は見ない
    （この確かめが見るのは**数と id** だけ）。
    """
    roster = re.findall(r'icon: "([^"]+)"',
                        (CONTENT / "residents.ts").read_text(encoding="utf-8"))
    lines = box.split("\n")
    box_re = re.compile(r'^  "([^"]+)": \[')
    at = [i for i, ln in enumerate(lines) if box_re.match(ln)]
    have = {box_re.match(lines[i]).group(1): lines[i] for i in at}
    sample = lines[at[0]]
    body = [have.get(i) or re.sub(r'^  "[^"]+"', f'  "{i}"', sample) for i in roster]
    return "\n".join(lines[:at[0]] + body + lines[at[-1] + 1:])


def seed(name: str) -> str:
    """**対照の種**。本番の焼き込みそのまま——`characterBox.ts` だけは別。

    いま master に入っている `characterBox.ts` は**名簿より3人多い**
    （2026-10-03 現在、箱 103 / 名簿 100）。これは**関所が止めるべき状態**で、
    実際に止めている。そのまま「何も壊していない写し」の種にすると、
    3章（何も壊していない写しが通る）が仕様どおりに落ちてしまう。

    だから種だけ、**今夜の焼き直しが書くはずの形**（名簿とそろった 100箱）に
    直す。いま入っている 103箱のほうは 6章で名指しで当てる——
    **「箱だけ残っている」で止まること**が、そちらの見どころなので。

    国の焼き込み（`roster` で見るファイル）も同じ理由で直す（`country_matched()`）。
    """
    if name not in _SEED:
        text = (CONTENT / name).read_text(encoding="utf-8")
        if name == "characterBox.ts":
            text = roster_matched(text)
        _SEED[name] = country_matched(name, text)
    return _SEED[name]


_GUARD: dict = {}


def country_matched(name: str, text: str) -> str:
    """国の焼き込みを**滞在の表とそろえた形**にする（＝今夜の焼き直しが書くはずの形）。

    2026-11-23 に master に入っている `countryStats.ts` は、**滞在の表に居ない国を
    1つ持っている**（`iran-border`。#1355 で国の行から外したが、焼き直しが関所で
    止まっていて入っていない）。関所はそれを「名簿に居ない国が在る」で止めるので、
    そのまま種にすると3章が仕様どおりに落ちる。`characterBox.ts` と同じく、種だけ
    直す（居ない国の鍵を潰す。行の数字は残るが、この確かめが見るのは国の名前だけ）。
    いま入っている形は 8章で名指しで当てる。**焼き直しが通れば、ここは何もしなくなる。**
    """
    if not _GUARD:
        _GUARD.update(load_guard())
    g = _GUARD
    for r in g["RULES"].get(name, []):
        if r["kind"] != g["ROSTER"]:
            continue
        roster = g["roster_of"](seed(r["mate"]), r["mate_pat"])
        stray = [m for m in re.finditer(r["pat"], text, re.M) if m.group(1) not in roster]
        for m in reversed(stray):
            text = text[:m.start()] + "@" * (m.end() - m.start()) + text[m.end():]
    return text


def mate_of(g: dict, rule: dict) -> str | None:
    """`match` / `roster` のルールが帳尻を合わせる相手の字面。ほかの見かたでは None。"""
    return seed(rule["mate"]) if rule["kind"] in (g["MATCH"], g["ROSTER"]) else None


def stage(td: Path, override: dict[str, str] | None = None,
          before_override: dict[str, str] | None = None) -> tuple[Path, Path, list[str]]:
    """焼き込みの種を「焼く前」に、写しを「焼いた後」に置く。

    **種は本番のファイル**（`site/content/*.ts`）。作り物の2行で試すと、
    焼き込みの書き方が変わった日に、変わったことに気づけない。
    `characterBox.ts` と国の2枚だけ種を直している理由は `seed()` に書いた。

    **焼かない相手（`MATES`。滞在の表）も「焼いた後」の置き場に置く。** 関所は
    `roster` の相手を焼き込みの隣から読むので、置かないと「読めない」で止まる。
    """
    before, work = td / "before", td / "after"
    (work / "site" / "content").mkdir(parents=True, exist_ok=True)
    before.mkdir(parents=True, exist_ok=True)
    paths = []
    for name in sorted(WATCHED):
        (before / name).write_text(
            (before_override or {}).get(name) or seed(name), encoding="utf-8")
        text = (override or {}).get(name) or seed(name)
        (work / "site" / "content" / name).write_text(text, encoding="utf-8")
        paths.append(f"site/content/{name}")
    for name in sorted(MATES):
        text = (override or {}).get(name) or seed(name)
        (work / "site" / "content" / name).write_text(text, encoding="utf-8")
    return before, work, paths


WATCHED: list[str] = []
# 関所が読むが、焼かないファイル（`roster` の相手の滞在の表）。1章で `RULES` から拾う
MATES: list[str] = []


# ---------------------------------------------------------------- 1・2. 分母


def check_wiring() -> None:
    """**毎晩の一覧と allowlist が食い違っていないか。**

    `rebake.yml` は同じ「回すもの」を2か所に持っている。

    | どこ | 何の一覧か | いつ通る道か |
    | --- | --- | --- |
    | `REBAKE_IN=`（決める step） | **毎晩ひとりでに回る** | cron / 取り込みに繋いだぶん |
    | `ALL=`（allowlist step） | **回してよい** | 押されたぶん（入力が空なら全部） |

    2026-10-07 に `nordic_sun` を足したとき、**`ALL` にだけ足して毎晩の一覧に
    足し忘れた。** 手で押せば回るので、確かめも通る。**毎晩だけ乗らない。**
    見張り（`python/stale_content_watch.py`）が「旅程の日が焼かれていない」と
    言うようになっても、消すのは人の手になる——**乗せたつもりで乗っていない**
    （`docs/island-misses.md` #125 と同じ形）。
    """
    print("\n0. 毎晩の一覧と allowlist が食い違っていないか")
    nightly, allow = nightly_scripts(), allowlist_scripts()
    print(f"  毎晩 {len(nightly)}本 / 回してよい {len(allow)}本 / "
          f"毎晩に乗せない理由つき {len(NOT_NIGHTLY)}本")
    say(bool(nightly) and bool(allow),
        f"両方の一覧が読める（毎晩 {len(nightly)} / allowlist {len(allow)}）")
    stray = [n for n in nightly if n not in allow]
    say(not stray,
        f"毎晩の一覧が、ぜんぶ allowlist に在る（無い: {stray or 'なし'}）"
        "——**無いと毎晩の run が allowlist で止まる**")
    # 理由が腐っていないか（`BREAK=rot` 相当。表に在るのに `ALL` に無い）
    rot = [n for n in NOT_NIGHTLY if n not in allow]
    say(not rot, f"毎晩に乗せない理由が、在るものについて書かれている（余り: {rot or 'なし'}）")
    missing = [n for n in allow if n not in nightly and n not in NOT_NIGHTLY]
    say(not missing,
        f"allowlist に在って毎晩に無いものには、理由が書いてある（無い: {missing or 'なし'}）")
    for n, why in sorted(NOT_NIGHTLY.items()):
        if n in nightly:
            say(False, f"{n} は毎晩に乗っているのに、乗せない理由が残っている（{why[:30]}…）")
        else:
            say(len(why) >= 12 and re.search(r"\d{4}-\d\d-\d\d", why) is not None,
                f"{n} を毎晩に乗せない理由に、12文字以上と日付が在る")


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
    for n in WATCHED:
        for r in g["RULES"][n]:
            if r["mate"] and r["mate"] not in WATCHED and r["mate"] not in MATES:
                MATES.append(r["mate"])

    print("\n2. ルールの正規表現が、いまの焼き込みに当たるか（＝鳴れるか）")
    if not WATCHED:
        print("  見るものが1枚も無い")
        raise SystemExit(2)
    rows, dead = 0, []
    for name in WATCHED:
        text = seed(name)
        for r in g["RULES"][name]:
            rows += 1
            if r["kind"] == g["SHARE"]:
                den = g["measure"](text, r["den"], "count")
                numv = g["measure"](text, r["num"], "count")
                hit, shown = den, f"{numv}/{den}"
            elif r["kind"] == g["MATCH"]:
                # **相手の正規表現も当たらないと鳴れない。** こちらだけ数えて
                # 「当たっている」と読むと、相手が0件の回に黙って飛ばす行になる
                mine = g["measure"](text, r["pat"], "count")
                spare = g["measure"](text, r["spare"], "count") if r["spare"] else 0
                theirs = g["measure"](mate_of(g, r), r["mate_pat"], "count")
                hit = min(mine, theirs)
                shown = f"{mine}+{spare} / {r['mate_label']} {theirs}"
            elif r["kind"] == g["ROSTER"]:
                # ここも相手（滞在の表）が読めないと鳴れない——どころか、
                # 名簿が空なら関所は「読めない」で毎晩止まる
                mine = g["measure"](text, r["pat"], "count")
                theirs = len(g["roster_of"](mate_of(g, r), r["mate_pat"]))
                hit = min(mine, theirs)
                shown = f"{mine} / {r['mate_label']} {theirs}国"
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
        text = seed(name)
        for r in g["RULES"][name]:
            tag = f"{name} の「{r['label']}」"
            mate = mate_of(g, r)

            # 4a. **正常な晩で鳴らないこと。** `keep` と `match` と `roster` は
            #     「1つでも食い違ったら止める」ための行なので、ここは見ない
            #     （見ると、仕様どおりの行が落ちる。`roster` の正常な縮みは 8章）
            if r["kind"] in (g["KEEP"], g["MATCH"], g["ROSTER"]):
                quiet += 1
                print(f"  --   {tag} —— 正常な晩は見ない"
                      f"（`{r['kind']}` は1つ食い違っただけで止めるための行）")
            else:
                small, how = thin(g, r, text, NORMAL)
                ok, *_ = g["judge"](r, text, small)
                quiet += bool(ok)
                say(ok, f"{tag} —— 正常な晩（{how} やせ）では鳴らない")
                if not ok:
                    crybaby.append(tag)

            # 4b. **塊が落ちたら鳴ること。**
            got = ring_at(g, r, text, mate)
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


# ---------------------------------------------------------------- 6. 名簿とそろっているか


BOX_LINE = r'^  "[^"]+": \['
ROSTER_LINE = r'icon: "'


def to_no_art(box: str, n: int) -> str:
    """箱を n 人ぶん `noArt`（測れなかった人）へ移す。

    **帳尻は合ったまま、箱だけ減る形。** 絵の置き場が落ちた晩がこれ。
    「箱＋測れなかった人＝名簿」だけを見ていると素通りするので、
    `match` の `arg`（箱そのものの床）が仕事をしているかを、ここで当てる。
    """
    ms = list(re.finditer(BOX_LINE + r'.*\n', box, re.M))[:n]
    ids = [re.match(r'^  "([^"]+)"', m.group(0)).group(1) for m in ms]
    out = box
    for m in reversed(ms):
        out = out[:m.start()] + out[m.end():]
    lo = out.index("  noArt: [")
    hi = out.index("  ],", lo)
    body = "\n".join('    "%s",' % i for i in ids)
    return out[:lo] + "  noArt: [\n" + body + "\n" + out[hi:]


def with_strays(box: str, n: int) -> str:
    """名簿に居ない id の箱を n 個足す（＝**消えた人の箱が残っている**形）。

    いま master に入っているものをそのまま使わない。**今夜の焼き直しが通れば、
    master の箱は名簿とそろう**ので、本物に頼ると明日からこの足が空振りする。
    """
    ms = list(re.finditer(BOX_LINE + r'.*\n', box, re.M))
    sample = ms[0].group(0)
    extra = "".join(re.sub(r'^  "[^"]+"', f'  "もう名簿にいない人{i}"', sample)
                    for i in range(n))
    return box[:ms[-1].end()] + extra + box[ms[-1].end():]


def check_roster(g: dict) -> None:
    """**正しい縮みを通し、合わない形で止まるか。**

    ここだけ物差しが違う（前の版ではなく、同じ回に焼いた `residents.ts`）ので、
    4・5章のやせ具合では読めない。**5つとも本番のファイルを種にして当てる。**
    """
    print("\n6. `characterBox.ts` が、名簿（residents.ts）と帳尻が合っているか")
    if "characterBox.ts" not in WATCHED or "residents.ts" not in WATCHED:
        say(False, "characterBox.ts と residents.ts の両方を見張っている")
        return

    real = (CONTENT / "characterBox.ts").read_text(encoding="utf-8")
    matched = seed("characterBox.ts")          # 名簿とそろえた形（＝焼き直しが書くはず）
    roster = g["measure"](seed("residents.ts"), ROSTER_LINE, "count")
    n_real = g["measure"](real, BOX_LINE, "count")
    n_match = g["measure"](matched, BOX_LINE, "count")
    print(f"     いま master に入っている箱 {n_real} / 名簿 {roster}人"
          f" / 名簿とそろえると {n_match}箱")

    # 4人消えて1人入った晩（2026-10-03 に止まった形）を、本物に頼らず組み立てる。
    # **今夜の焼き直しが通れば master の箱は名簿とそろう**ので、
    # 「いま 103 入っている」に寄りかかると、明日からこの足が空振りする
    was = with_strays(neutralize(matched, BOX_LINE, 1), 4)
    stale = with_strays(matched, 3)

    # (前の版, 焼いた版, 止まってほしいか, 何を見ているか)
    cases = [
        (real, matched, False,
         f"**いま master に入っている箱を、今夜そのまま焼いたら。**"
         f" 箱 {n_real} → {n_match} / 名簿 {roster}人"),
        (was, matched, False,
         f"名簿から4人消えて1人入った晩（箱 {g['measure'](was, BOX_LINE, 'count')}"
         f" → {n_match}、名簿 {roster}人）。**正しい縮み**"),
        (matched, neutralize(matched, BOX_LINE, 5), True,
         f"箱だけ 5 減る（{n_match} → {n_match - 5}、名簿は {roster}人のまま）"),
        (stale, stale, True,
         f"名簿から消えた人の箱が残ったまま"
         f"（箱 {g['measure'](stale, BOX_LINE, 'count')} / 名簿 {roster}人）"),
        (matched, to_no_art(matched, 15), True,
         f"測れなかった人が 15人。帳尻は {n_match - 15}+15={roster} で合うが、"
         "箱そのものが名簿の9割を切る（＝絵の置き場が落ちた晩）"),
        (matched, to_no_art(matched, 2), False,
         f"測れなかった人が 2人。帳尻が合い、箱も {n_match - 2} 残っている"
         "——**この形まで止めると、永久に焼けなくなる**"),
    ]
    for before_box, after_box, want_stop, why in cases:
        with tempfile.TemporaryDirectory() as td:
            b, work, paths = stage(Path(td), {"characterBox.ts": after_box},
                                   {"characterBox.ts": before_box})
            code, out = run_guard(b, work, paths)
            hit = [ln for ln in out.splitlines()
                   if ln.startswith("::error::") and "名簿とそろった箱" in ln]
            ok = (code == 1 and len(hit) == 1) if want_stop else (code == 0 and not hit)
            say(ok, f"{'止まる' if want_stop else '通る'}: {why}（終了コード {code}）")
            if hit:
                print("         " + hit[0].replace("::error::", "→ "))


# ------------------------------------------- 7. 焼けなかった晩に、後ろを止めないか


CHARBOX_STEP = "住人の絵の大きさを測り直す"


def run_charbox_step(td: Path, charbox_rc: int, paths: list[str]) -> tuple[str, str]:
    """step「住人の絵の大きさを測り直す」を、**そのまま走らせる。**

    `charbox.py` の代わりに `charbox_rc` で終わる作り物を置く。返すのは
    (GITHUB_ENV に書かれたもの, GITHUB_STEP_SUMMARY に書かれたもの)。

    **シェルのほうも対照に入れる。** 「焼けなかった表を対象から外す」は
    ここ（yaml の `run:`）にしか無いので、見張りの python だけ回しても、
    外し忘れ・外しすぎのどちらも捕まらない。
    """
    work = td / f"step{charbox_rc}"
    (work / "tools" / "sprites").mkdir(parents=True)
    (work / "site" / "content").mkdir(parents=True)
    (work / "tools" / "sprites" / "charbox.py").write_text(
        f"raise SystemExit({charbox_rc})\n", encoding="utf-8")
    (work / "site" / "content" / "characterBox.ts").write_text("焼く前\n", encoding="utf-8")
    env_f, sum_f = work / "env.txt", work / "summary.md"
    env_f.write_text("", encoding="utf-8")
    sum_f.write_text("", encoding="utf-8")

    # `git checkout --` が効くように、ちゃんとした木にする。
    # 作業箱の ~/.gitconfig は commit に署名させ、署名は箱の外の口に頼む。口が1回黙ると守りと関係の無い
    # 「種」の commit で落ちるので、箱の設定から切り離す（CI の素の git と同じ）
    genv = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
    genv.update(GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_NOSYSTEM="1")
    for cmd in (["git", "init", "-q"],
                ["git", "config", "user.email", "t@example.com"],
                ["git", "config", "user.name", "t"],
                ["git", "add", "-A"],
                ["git", "commit", "-q", "-m", "種"]):
        subprocess.run(cmd, cwd=work, check=True, capture_output=True, env=genv)
    # 焼いたあと（通った回はここが残り、落ちた回は戻される）
    (work / "site" / "content" / "characterBox.ts").write_text("焼いた後\n", encoding="utf-8")

    env = {**os.environ,
           "REBAKE_PATHS": " ".join(paths),
           "GITHUB_ENV": str(env_f),
           "GITHUB_STEP_SUMMARY": str(sum_f)}
    subprocess.run(["bash", "-c", step_run(CHARBOX_STEP)],
                   cwd=work, env=env, capture_output=True)
    return env_f.read_text(encoding="utf-8"), sum_f.read_text(encoding="utf-8")


def check_unbaked(g: dict) -> None:
    """**焼けなかった晩に、他の焼き込みが巻き添えにならないか。**

    絵の置き場は外のサービスで、こちらでは直せない。落ちた晩に関所が
    `characterBox.ts` を名簿と当てて止めると、**同じ晩の他の焼き込みまで
    master に入らない**（#105 で「1本が落ちても後ろを止めない」と決めた）。
    """
    print("\n7. 絵の表を焼けなかった晩に、後ろを止めないか")
    paths = [f"site/content/{n}" for n in sorted(WATCHED)]

    with tempfile.TemporaryDirectory() as td:
        # 7a. 落ちた回 —— 表は戻り、対象から外れる
        env_bad, sum_bad = run_charbox_step(Path(td), 1, paths)
        left = [ln[len("REBAKE_PATHS="):] for ln in env_bad.splitlines()
                if ln.startswith("REBAKE_PATHS=")]
        say(bool(left) and "site/content/characterBox.ts" not in left[-1].split(),
            f"落ちた回: `characterBox.ts` が対象から外れる（残り {len(left[-1].split()) if left else 0} 枚）")
        say(bool(left) and sorted(left[-1].split()) == sorted(
                p for p in paths if not p.endswith("characterBox.ts")),
            "落ちた回: **外れるのはその1枚だけ**（他の焼き込みは残る）")
        say("CHARBOX_BAD=1" in env_bad, "落ちた回: run の最後で赤くする印が立つ")
        say("名簿との突き合わせも見ていません" in sum_bad,
            "落ちた回: **外したことを要約に書く**（黙って外さない）")

        # 7b. 通った回 —— 外す道が広すぎないか。ここが広いと関所が寝る
        env_ok, _ = run_charbox_step(Path(td), 0, paths)
        say("REBAKE_PATHS" not in env_ok,
            "通った回: 対象から外さない（**外す道が広すぎない**）")
        say("CHARBOX_BAD" not in env_ok, "通った回: 赤くする印も立たない")

    # 7c. その外れた対象で関所を回す。**表は古い 103 のまま、名簿は 100。**
    #     6章の4つめ（名簿から消えた人の箱が残ったまま）とまったく同じ中身で、
    #     違うのは対象に入っているかどうかだけ。あちらは止まり、こちらは通る
    stale = with_strays(seed("characterBox.ts"), 3)
    with tempfile.TemporaryDirectory() as td:
        before, work, all_paths = stage(Path(td), {"characterBox.ts": stale},
                                        {"characterBox.ts": stale})
        thin_paths = [p for p in all_paths if not p.endswith("characterBox.ts")]
        code, out = run_guard(before, work, thin_paths)
        n_box = g["measure"](stale, BOX_LINE, "count")
        n_res = g["measure"](seed("residents.ts"), ROSTER_LINE, "count")
        say(code == 0,
            f"焼けなかった晩: 箱 {n_box} / 名簿 {n_res}人 のままでも、"
            f"**他の焼き込み {len(thin_paths)} 枚は通る**（終了コード {code}）")
        say("characterBox.ts" not in [ln.split("|")[1].strip()
                                      for ln in out.splitlines()
                                      if ln.startswith("| ") and ln.count("|") > 2][1:],
            "焼けなかった晩: 当てた表に `characterBox.ts` の行が出ない")
        say("見ていないもの" in out and "characterBox.ts" in out,
            "焼けなかった晩: **見ていないものとして名指しで出る**（素通りで黙らない）")

        # 同じ写しを、対象に入れたまま回すと止まる。**外れたから通った**ことの裏
        code2, _ = run_guard(before, work, all_paths)
        say(code2 == 1,
            f"同じ写しでも、対象に入っていれば止まる（終了コード {code2}）"
            "——**通ったのは「外れたから」で、関所が寝たからではない**")

    # 外したのはこの回だけ。表そのものは見張りの分母に残っている（1章と噛み合わせ）
    say("characterBox.ts" in g["RULES"] and "characterBox.ts" in WATCHED,
        "外すのは**その回だけ**。`RULES` と分母からは外れていない（1章がそこを見ている）")


# ---------------------------------------------------------------- 8. 国の名簿とそろっているか


def drop_country(text: str, pat: str, slug: str) -> str:
    """`pat`（slug を1つ拾う形）に当たる字のうち、`slug` のものを**全部**潰す。

    滞在の表なら「その国が表から消えた」、焼き込みなら「その国が焼き込みから落ちた」。
    フランスのように行を2つ持つ国があるので、1つ目だけでは消えない。
    """
    ms = [m for m in re.finditer(pat, text, re.M) if m.group(1) == slug]
    for m in reversed(ms):
        text = text[:m.start()] + "@" * (m.end() - m.start()) + text[m.end():]
    return text


def in_comments(stays: str, pat: str, slug: str) -> str:
    """`slug` を表から外し、**その行の字を注釈の中にだけ残す**（ブロックと `//` の両方）。

    経緯を書く注釈に、昔の行をそのまま写した日の形。注釈まで数えると、
    消えた国が名簿に戻って、正しい縮みがまた止まる。
    """
    m = next(m for m in re.finditer(pat, stays, re.M) if m.group(1) == slug)
    note = f"\n/* 前は {{ {m.group(0)}, cities: [] }} が国の行として居た */\n  // {{ {m.group(0)} }}\n"
    return drop_country(stays, pat, slug) + note


def check_country_roster(g: dict) -> None:
    """**滞在の表から消えた国の縮みを通し、表に居る国の落ちで止まるか。**

    物差しが「前の版」ではなく滞在の表（`stays.ts`）なので、4・5章のやせ具合では
    「正しい縮みを通すか」が読めない。**本番の焼き込みと本番の表を種に、国の名前で当てる。**

    2026-11-23 まで国は `keep`（1国も減らない）で見ていて、W8（#1355）でイラン国境を
    国の行から外した晩に、正しい縮み（27 → 26）で毎晩止まるようになった。
    """
    print("\n8. 国の焼き込みが、滞在の表（stays.ts）と合っているか")
    rules = [(n, r) for n in WATCHED for r in g["RULES"][n] if r["kind"] == g["ROSTER"]]
    names = sorted(n for n, _ in rules)
    say(names == ["cityStreams.ts", "countryStats.ts"],
        f"国の2枚とも、物差しが滞在の表（`roster` で見ているもの: {names or 'なし'}）")
    if not rules:
        return

    # **名簿の読みかたが、焼く道具の国と1つも違わないか。** 関所は表を字で読む
    # （焼く側の読み口を通さない）ので、ずれたら黙る。突き合わせる相手は
    # 焼く2本が実際に国として数えている `stays.read_all()`（別の読み手）
    from stays import read_all
    tools = {c["slug"] for c in read_all()}
    mate, mate_pat = rules[0][1]["mate"], rules[0][1]["mate_pat"]
    stays = seed(mate)
    roster = g["roster_of"](stays, mate_pat)
    print(f"     焼く道具の国（stays.read_all）{len(tools)} / 関所の名簿 {len(roster)}国")
    say(bool(tools) and tools <= roster,
        f"焼く道具が国として数える国が、ぜんぶ関所の名簿に居る（居ない: {sorted(tools - roster) or 'なし'}）")
    if roster - tools:
        print(f"     名簿にだけ居る国（先の日付の行＝まだ着いていない国）: {sorted(roster - tools)}")

    empty = stays
    for s in roster:
        empty = drop_country(empty, mate_pat, s)

    for name, r in rules:
        text = seed(name)
        keys = [k for k in re.findall(r["pat"], text, re.M) if k in roster]
        if len(keys) < 2:
            say(False, f"{name}: 名簿に居る国が2つ以上ある（{len(keys)}）")
            continue
        x, y = keys[0], keys[1]
        less = drop_country(stays, mate_pat, x)
        lost_x = drop_country(text, r["pat"], x)
        # (前, 後, 表, 止まってほしいか, 出てほしい字, 何を見ているか)
        cases = [
            (text, lost_x, less, False, f"消えた国: {x}",
             f"表から {x} が消えて、焼き込みからも {x} が落ちた。**正しい縮み**"),
            (text, lost_x, stays, True, f"に居るのに落ちた: {x}",
             f"表はそのままで、焼き込みから {x} だけ落ちた（読み落とし）"),
            (text, drop_country(text, r["pat"], y), less, True, f"に居るのに落ちた: {y}",
             f"表から {x} が消えた晩に、焼き込みは {x} を残して {y} を落とした"
             "——**数で比べると差し引き0で通ってしまう形**"),
            (text, text, less, True, f"に居ない国が在る: {x}",
             f"表から {x} が消えたのに、焼き込みに {x} が残ったまま（名簿の読みかたが外れた形）"),
            (text, lost_x, in_comments(stays, mate_pat, x), False, f"消えた国: {x}",
             f"{x} の行が注釈の中にだけ残っている表で、{x} が落ちた（注釈は名簿に数えない）"),
            (text, text, empty, True, "国が1つも読めない",
             "表から国が1つも読めない（書きかたが変わった）。**空の名簿で通すと、どの国が落ちても寝る**"),
        ]
        # いま master に入っている形を、今夜そのまま焼いたら（2026-11-23 の `iran-border`）。
        # **焼き直しが通れば master は表とそろう**ので、そのあとは当てるものが無い
        real = (CONTENT / name).read_text(encoding="utf-8")
        gone = sorted(set(re.findall(r["pat"], real, re.M)) - roster)
        if gone:
            cases.insert(0, (real, text, stays, False, f"消えた国: {', '.join(gone)}",
                             f"**いま master に入っている焼き込みを、今夜そのまま焼いたら。**"
                             f" 表に居ない {', '.join(gone)} が落ちる"))
        else:
            print(f"  --   {name}: いま master の焼き込みは表とそろっている（今夜の形は当てるものが無い）")

        for before_t, after_t, stays_t, want_stop, frag, why in cases:
            # **同じ表を国の2枚が読む。** 相方は表に合わせて焼けた形にしておく
            # （本番でも2枚は同じ晩に、同じ表から焼き直る）。でないと相方が
            # 「居ない国が在る」で止まって、こちらの「通る」が読めない
            fit = g["roster_of"](stays_t, mate_pat)
            over = {name: after_t, mate: stays_t}
            for n2, r2 in rules:
                if n2 != name:
                    t2 = seed(n2)
                    for s in set(re.findall(r2["pat"], t2, re.M)) - fit:
                        t2 = drop_country(t2, r2["pat"], s)
                    over[n2] = t2
            with tempfile.TemporaryDirectory() as td:
                b, work, paths = stage(Path(td), over, {name: before_t})
                code, out = run_guard(b, work, paths)
                ok, line = roster_verdict(out, name, code, want_stop, frag)
                say(ok, f"{name}: {'止まる' if want_stop else '通る'}: {why}（終了コード {code}）")
                if line:
                    print("         → " + line)

        # 表そのものが無い（置き場が変わった）。**読めないものを「名簿から消えた」と読まない**
        with tempfile.TemporaryDirectory() as td:
            b, work, paths = stage(Path(td), {name: lost_x})
            (work / "site" / "content" / mate).unlink()
            code, out = run_guard(b, work, paths)
            ok, line = roster_verdict(out, name, code, True, "読めないので数えていない")
            say(ok, f"{name}: 止まる: 滞在の表が置き場に無い晩に {x} が落ちた（終了コード {code}）")
            if line:
                print("         → " + line)


def roster_verdict(out: str, name: str, code: int, want_stop: bool, frag: str) -> tuple[bool, str]:
    """関所の出力から、`name` の「国」の行が思ったとおりかを読む。(合っているか, 見せる1行)

    **止まった理由の字まで見る。** 止まりさえすればよいことにすると、守りを1つ外しても
    別の守りが違う理由で止めて、外したことに気づけない（名簿が空の晩は
    「居ない国が在る」でも止まる）。
    """
    hit = [ln for ln in out.splitlines()
           if ln.startswith("::error::") and name in ln and "「国」" in ln]
    row = [ln for ln in out.splitlines() if ln.startswith(f"| {name} | 国 |")]
    if want_stop:
        return code == 1 and len(hit) == 1 and frag in hit[0], (hit[0].replace("::error::", "") if hit else "")
    return code == 0 and not hit and bool(row) and frag in row[0], (row[0] if row else "")


def main() -> int:
    g = load_guard()
    print(f"見張りを {YML.name} の step「{STEP}」から切り出した（{len(guard_src().splitlines())} 行）")

    check_wiring()
    check_denominator(g)
    check_clean(g)
    check_broken(g)
    check_roster(g)
    check_unbaked(g)
    check_country_roster(g)

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
