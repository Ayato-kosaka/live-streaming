"""**セッションの頭が「こちらの番」の issue を並べる段（`.claude/hooks/session-start.sh` の `waits_us`）を当てる。**

    python3 python/session_start_waits_selftest.py

    BREAK=list    python3 python/session_start_waits_selftest.py  # 一覧の行を出さない
    BREAK=zero    python3 python/session_start_waits_selftest.py  # 0本の行を出さない
    BREAK=fail    python3 python/session_start_waits_selftest.py  # gh が落ちたのを 0本 と読む
    BREAK=stderr  python3 python/session_start_waits_selftest.py  # gh の標準エラーを拾わない
    BREAK=slow    python3 python/session_start_waits_selftest.py  # 5秒で切らない
    BREAK=nogh    python3 python/session_start_waits_selftest.py  # gh が無いのを見分けない
    BREAK=ci      python3 python/session_start_waits_selftest.py  # CI の上でも引く
    BREAK=pr      python3 python/session_start_waits_selftest.py  # PR を除かない
    BREAK=label   python3 python/session_start_waits_selftest.py  # 違う札で引く

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**（hook が無い・
壊しかたの当て先が hook に見つからない・偽の gh が組めない・対照が外れた）
（`docs/island-standards.md` §15）。

**本物の GitHub には1回も出ない。** PATH の先頭に偽の `gh` を置いて hook を回す。
偽の gh は、置いた issue の束に hook が渡した `--jq` を**そのまま** `jq -r` で当てる
（gh の `--jq` と同じ）。だから PR を除く式・題を40字で切る式も、本物の字で当たる。

## なぜ要るか

札 `待ち-システム` は「あやとが答えて、こちらの番」の印（`docs/island-tickets.md` 5章）。
#147 で、裏返った札に気づかずあやとの「やって良いよ」を2日拾わなかった
（`docs/island-misses.md` #330）。hook がセッションの頭でその札の issue を並べる。

この段は、**壊れても誰も気づかない側に倒れる。**

- 引けなかったのに「0本」と言えば、#147 と同じ見落としに戻る（いちばん危ない）
- 札の名前が `ticket_labels.WAIT_US` とずれると、GitHub は空の束を返す——
  **赤くならずに、毎回「0本」**
- 5秒で切らなければ、ネットの悪い日にセッションの頭が止まる
- 落ちて終了コードが 0 でなければ、頭の残り（ブラウザの段・締めの線）が出ない

## 当てる場面

| 場面 | 偽の gh | 欲しい結果 |
| --- | --- | --- |
| 2本 | issue 2本＋PR 1本を返す | `待ち-システム: 2本…` の下に `#番号 題` が2行。PR は出ない。題は40字で切れる。札は `WAIT_US` で引く |
| 0本 | 空の束 | `待ち-システム: 0本` の1行だけ |
| 失敗 | 標準エラーに理由を書いて exit 1 | `待ち-システム: 読めなかった（HTTP 401…）`。0本 とは言わない。標準エラーに漏らさない |
| 遅い | 6秒眠ってから答える | `読めなかった（5秒で返らなかった）`。眠り終わるのを待たない |
| gh が無い | PATH に gh が無い | `読めなかった（gh が無い）` |
| CI | `CI=true` | gh を1回も起こさない。行も出さない |
| GitHub Actions | `GITHUB_ACTIONS=true` | 同上 |

どの場面も、終了コードが 0 で、締めの線（`────`）まで出ること、
`待ち-システム` の行が「始める前に」の枠の中に在ることを見る。

## 対照（足を1本ずつ抜く）

hook の**写し**を字の置き換えで壊して、赤くなるべき場面が赤くなるかを見る。
置き換える字が hook に1か所だけ見つからなければ、この見張りが hook の形を
見失っているので **2**。

| `BREAK=` | 抜く足 | 赤くなるはずの場面 |
| --- | --- | --- |
| `list` | `#番号 題` の行を出すところ | 2本 |
| `zero` | `0本` の行を出すところ | 0本 |
| `fail` | 終了コードを見るところ | 失敗 |
| `stderr` | gh の標準エラーを拾うところ | 失敗 |
| `slow` | `timeout 5` | 遅い |
| `nogh` | gh が在るかを先に見るところ | gh が無い |
| `ci` | CI / GITHUB_ACTIONS の歯止め | CI・GitHub Actions |
| `pr` | `select(.pull_request|not)` | 2本 |
| `label` | 引く札の名前 | 2本 |

**4通り当てても、同じ足を折っているなら1通り**（`island-misses.md` #128）。
上の9つは、それぞれ別のところを折っている。
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
HOOK = REPO / ".claude" / "hooks" / "session-start.sh"
LABELS = REPO / "python" / "ticket_labels.py"
HEAD = "──────── 始める前に ────────"
RULE = "────────────────────────────"

# 壊しかた: 名前 → (置き換える字, 置き換えた字, 赤くなるはずの場面)
BREAKS: dict[str, tuple[str, str, list[str]]] = {
    "list": ("printf '%s\\n' \"$wo\" | sed 's/^/     /'", ":", ["2本"]),
    "zero": ('echo "   $wl: 0本"', ":", ["0本"]),
    "fail": ('elif [ "$rc" -ne 0 ]; then', "elif false; then", ["失敗"]),
    "stderr": ('2>"$we")', ")", ["失敗"]),
    "slow": ("timeout -k 1 5 gh api", "gh api", ["遅い"]),
    "nogh": ("if ! command -v gh >/dev/null 2>&1; then", "if false; then", ["gh が無い"]),
    "ci": ('[ -z "${CI:-}${GITHUB_ACTIONS:-}" ] && waits_us', "waits_us",
           ["CI", "GitHub Actions"]),
    "pr": ("select(.pull_request|not) | ", "", ["2本"]),
    "label": ('-f labels="$wl"', '-f labels="待ち-しすてむ"', ["2本"]),
}

BREAK = os.environ.get("BREAK", "")

# 偽の gh。呼ばれた引数を控え、場面ごとの役をする。
# list の役では、hook が渡した --jq を置いた束にそのまま当てる（gh の --jq は -r と同じ）
FAKE_GH = '''#!{py}
import json, os, subprocess, sys, time
d = os.environ["FAKE_GH_DIR"]
with open(os.path.join(d, "argv.json"), "a", encoding="utf-8") as f:
    f.write(json.dumps(sys.argv[1:], ensure_ascii=False) + "\\n")
mode = os.environ.get("FAKE_GH_MODE", "list")
if mode == "fail":
    sys.stderr.write("HTTP 401: Bad credentials (https://api.github.com/repos/x/y/issues)\\n")
    sys.exit(1)
if mode == "slow":
    time.sleep(6)
    open(os.path.join(d, "slow-finished"), "w").close()
    print("#1 遅れて来た")
    sys.exit(0)
expr = sys.argv[sys.argv.index("--jq") + 1]
with open(os.path.join(d, "issues.json"), encoding="utf-8") as src:
    r = subprocess.run([{jq!r}, "-r", expr], stdin=src, capture_output=True, text=True)
sys.stdout.write(r.stdout)
sys.stderr.write(r.stderr)
sys.exit(r.returncode)
'''

LONG = "【あやとの操作】YouTubeログインの「未確認アプリ」警告を消す(OAuth審査を通す・手順は本文)"
ISSUES = [
    {"number": 147, "title": LONG, "labels": [{"name": "待ち-システム"}]},
    {"number": 1228, "title": "短い題", "labels": [{"name": "待ち-システム"}]},
    {"number": 1254, "title": "札の付いた PR",
     "pull_request": {"url": "https://api.github.com/repos/x/y/pulls/1254"},
     "labels": [{"name": "待ち-システム"}]},
]


class Broken(Exception):
    """数えられない（2）"""


def hook_text() -> str:
    if not HOOK.is_file():
        raise Broken(f"hook が無い: {HOOK}")
    src = HOOK.read_text(encoding="utf-8")
    if not BREAK:
        return src
    if BREAK not in BREAKS:
        raise Broken(f"知らない BREAK: {BREAK}")
    old, new, _ = BREAKS[BREAK]
    if src.count(old) != 1:
        # 当て先を見失った＝hook の形が変わった。**黙って本物を回さない**
        raise Broken(f"BREAK={BREAK} の当て先が hook に1か所だけ在るはずが {src.count(old)} か所: {old!r}")
    return src.replace(old, new)


def wait_label() -> str:
    """札の名前の正（`ticket_labels.WAIT_US`）。import はせず字で読む（読むだけで済ませる）"""
    try:
        m = re.search(r'^WAIT_US\s*=\s*"([^"]+)"', LABELS.read_text(encoding="utf-8"), re.M)
    except OSError as e:
        raise Broken(f"ticket_labels.py が読めない: {e}") from e
    if not m:
        raise Broken("ticket_labels.py に WAIT_US が見つからない")
    return m.group(1)


class Box:
    """場面1つぶんの置き場。偽の gh と、その控え。"""

    def __init__(self, base: Path, jq: str):
        self.dir = base
        self.bin = base / "fakebin"
        self.bin.mkdir(parents=True)
        gh = self.bin / "gh"
        gh.write_text(FAKE_GH.format(py=sys.executable, jq=jq), encoding="utf-8")
        gh.chmod(0o755)
        (base / "issues.json").write_text(json.dumps([], ensure_ascii=False), encoding="utf-8")
        # ブラウザの段は空の置き場へ向ける（本物の /opt/pw-browsers に触らない）
        self.pw = base / "pw-browsers"
        self.pw.mkdir()

    def issues(self, rows: list[dict]) -> None:
        (self.dir / "issues.json").write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")

    def calls(self) -> list[list[str]]:
        p = self.dir / "argv.json"
        if not p.is_file():
            return []
        return [json.loads(ln) for ln in p.read_text(encoding="utf-8").splitlines() if ln]

    def run(self, hook: Path, mode: str = "list", extra: dict[str, str] | None = None,
            path: str | None = None) -> subprocess.CompletedProcess:
        """hook を回す。

        **CI と GITHUB_ACTIONS は親から引き継がない**（この見張り自身が CI で走るので、
        引き継ぐと全部の場面が CI の場面になる）。`cwd` はリポジトリの外にする
        （hook の `git status` で他人の作業中のファイルを数えない）。
        """
        env = {k: v for k, v in os.environ.items()
               if k not in ("CI", "GITHUB_ACTIONS", "GIT_DIR", "GIT_WORK_TREE")}
        env["PATH"] = path if path is not None else f"{self.bin}{os.pathsep}{env.get('PATH', '')}"
        env["FAKE_GH_DIR"] = str(self.dir)
        env["FAKE_GH_MODE"] = mode
        env["SESSION_HOOK_PW_ROOT"] = str(self.pw)
        env.update(extra or {})
        return subprocess.run([BASH, str(hook)], cwd=str(self.dir), env=env,
                              capture_output=True, text=True, encoding="utf-8",
                              timeout=60, check=False)


BASH = shutil.which("bash") or "/bin/bash"


def frame(r: subprocess.CompletedProcess) -> list[str]:
    """セッションの頭を止めていないか・`待ち-システム` の行が枠の中に在るか（どの場面でも見る）"""
    bad = []
    lines = r.stdout.splitlines()
    if r.returncode != 0:
        bad.append(f"終了コード {r.returncode}")
    if RULE not in lines[-1:]:
        bad.append("締めの線まで出ていない")
    if HEAD in lines:
        top = lines.index(HEAD)
        for i, ln in enumerate(lines):
            if "待ち-システム:" in ln and not top < i < len(lines) - 1:
                bad.append(f"待ち-システム の行が枠の外: {ln.strip()}")
    else:
        bad.append("「始める前に」の見出しが無い")
    if r.stderr.strip():
        bad.append(f"標準エラーに漏れた: {r.stderr.strip()[:120]}")
    return bad


def waits(r: subprocess.CompletedProcess) -> list[str]:
    """`待ち-システム:` の行と、その下の `#番号 題` の行（字下げを外して）"""
    return [ln.strip() for ln in r.stdout.splitlines()
            if ln.strip().startswith("待ち-システム:") or re.match(r"\s+#\d+ ", ln)]


# ---- 場面 ------------------------------------------------------------
# どれも (hook, 置き場) を受け取り、外れた理由の一覧を返す（空なら通った）

def case_two(hook: Path, box: Box) -> list[str]:
    box.issues(ISSUES)
    r = box.run(hook)
    bad = frame(r)
    got = waits(r)
    want = ["#147 " + LONG[:40], "#1228 短い題"]
    if not got or not got[0].startswith("待ち-システム: 2本"):
        bad.append(f"見出しが「待ち-システム: 2本」でない: {got[:1]}")
    if got[1:] != want:
        bad.append(f"一覧が違う: {got[1:]}（欲しいのは {want}）")
    if any(g.startswith("#1254 ") for g in got):
        bad.append("PR（#1254）が並んだ")
    calls = box.calls()
    if len(calls) != 1:
        bad.append(f"gh を {len(calls)} 回起こした（欲しいのは1回）")
    else:
        lab = f"labels={wait_label()}"
        if lab not in calls[0]:
            bad.append(f"札 {lab} で引いていない（ticket_labels.WAIT_US とずれると、GitHub は空の束を返す）")
        if "state=open" not in calls[0]:
            bad.append("開いているものに絞っていない")
    return bad


def case_zero(hook: Path, box: Box) -> list[str]:
    box.issues([])
    r = box.run(hook)
    bad = frame(r)
    got = waits(r)
    if got != ["待ち-システム: 0本"]:
        bad.append(f"「待ち-システム: 0本」の1行でない: {got}")
    return bad


def case_fail(hook: Path, box: Box) -> list[str]:
    r = box.run(hook, "fail")
    bad = frame(r)
    got = waits(r)
    if len(got) != 1 or not got[0].startswith("待ち-システム: 読めなかった（HTTP 401: Bad credentials"):
        bad.append(f"「読めなかった（gh の理由）」の1行でない: {got}")
    if any("0本" in g for g in got):
        bad.append("引けなかったのに 0本 と言った")
    return bad


def case_slow(hook: Path, box: Box) -> list[str]:
    t0 = time.monotonic()
    r = box.run(hook, "slow")
    took = time.monotonic() - t0
    bad = frame(r)
    got = waits(r)
    if got != ["待ち-システム: 読めなかった（5秒で返らなかった）"]:
        bad.append(f"「読めなかった（5秒で返らなかった）」の1行でない: {got}")
    # 壁の時計ではなく、偽の gh が眠り終えたかで見る（箱が混んでいても揺れない）
    if (box.dir / "slow-finished").exists():
        bad.append(f"gh が眠り終えるまで待った（{took:.1f}秒）")
    return bad


def case_nogh(hook: Path, box: Box) -> list[str]:
    # gh だけが無い PATH。hook が使うほかの道具は、本物への link で置く
    only = box.dir / "nogh"
    only.mkdir()
    for name in ("git", "timeout", "mktemp", "rm", "wc", "sed", "grep",
                 "readlink", "mkdir", "ln", "cat", "sleep", "env"):
        p = shutil.which(name)
        if p and name != "gh":
            (only / name).symlink_to(p)
    r = box.run(hook, path=str(only))
    bad = frame(r)
    got = waits(r)
    if got != ["待ち-システム: 読めなかった（gh が無い）"]:
        bad.append(f"「読めなかった（gh が無い）」の1行でない: {got}")
    return bad


def _on_ci(name: str):
    def case(hook: Path, box: Box) -> list[str]:
        box.issues(ISSUES)
        r = box.run(hook, extra={name: "true"})
        bad = frame(r)
        if box.calls():
            bad.append(f"{name}=true なのに gh を起こした")
        if waits(r):
            bad.append(f"{name}=true なのに行を出した: {waits(r)}")
        return bad
    return case


CASES = {
    "2本": case_two,
    "0本": case_zero,
    "失敗": case_fail,
    "遅い": case_slow,
    "gh が無い": case_nogh,
    "CI": _on_ci("CI"),
    "GitHub Actions": _on_ci("GITHUB_ACTIONS"),
}


def run_cases(text: str, only: list[str] | None = None) -> dict[str, list[str]]:
    """場面を、それぞれ別の空の置き場で回す。→ {場面: 外れた理由}"""
    jq = shutil.which("jq")
    if not jq:
        raise Broken("jq が無い（偽の gh が --jq を当てられない）")
    out: dict[str, list[str]] = {}
    with tempfile.TemporaryDirectory(prefix="hook-waits-") as tmp:
        hook = Path(tmp) / "session-start.sh"
        hook.write_text(text, encoding="utf-8")
        for i, (name, case) in enumerate(CASES.items()):
            if only is not None and name not in only:
                continue
            out[name] = case(hook, Box(Path(tmp) / f"box{i}", jq))
    return out


def main() -> int:
    try:
        text = hook_text()
        wait_label()
        # 壊した写しを回すときは、赤くなるはずの場面だけ回す（遅い場面を何度も待たない）
        got = run_cases(text, BREAKS[BREAK][2] if BREAK else None)
    except Broken as e:
        print(f"✕ 数えられない: {e}")
        return 2
    failed = {k: v for k, v in got.items() if v}

    if BREAK:
        # 結果だけ返す（呼ぶのは下の対照）
        for k in BREAKS[BREAK][2]:
            print(f"  {'○' if k in failed else '✕'} {k}: {failed.get(k, ['緑のまま'])}")
        return 1 if failed else 0

    print("[1] 場面ごと（偽の gh で hook を回す）")
    for k, v in got.items():
        print(f"  {'✕' if v else '○'} {k}" + (f": {' / '.join(v)}" if v else ""))

    print("[2] 対照（足を1本ずつ抜くと、ここが赤くなるか）")
    miss = []
    for leg, (_, _, should) in BREAKS.items():
        r = subprocess.run([sys.executable, str(Path(__file__).resolve())],
                           env=dict(os.environ, BREAK=leg),
                           capture_output=True, text=True, encoding="utf-8",
                           timeout=300, check=False)
        if r.returncode == 2:
            print(f"  ✕ BREAK={leg} → 2（当て先を見失った）: {r.stdout.strip()[-200:]}")
            miss.append(leg)
            continue
        hit = all(f"✕ {k}:" not in r.stdout for k in should)
        mark = "○" if r.returncode == 1 and hit else "✕"
        if mark == "✕":
            miss.append(leg)
        print(f"  {mark} BREAK={leg} → 終了コード {r.returncode}"
              f"（{' / '.join(should)} が赤くなるはず）")

    print()
    if miss:
        print(f"✕ 対照が外れた（{' / '.join(miss)}）。**この見張りの緑は信用できない**ので数字を出さない")
        return 2
    if failed:
        print(f"✕ {len(got)}件みて、{len(failed)}件 落ちた")
        return 1
    print(f"○ {len(got)}件ぜんぶ通った（対照 {len(BREAKS)} 本はどれも赤くなった）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
