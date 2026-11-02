"""**セッションの頭でブラウザを繋ぐ処理（`.claude/hooks/session-start.sh`）を当てる。**

    python3 python/session_start_browser_selftest.py

    BREAK=ci      python3 python/session_start_browser_selftest.py  # CI の歯止めを外す
    BREAK=gha     python3 python/session_start_browser_selftest.py  # GITHUB_ACTIONS の歯止めを外す
    BREAK=exists  python3 python/session_start_browser_selftest.py  # 「もう在る」の歯止めを外す
    BREAK=nolink  python3 python/session_start_browser_selftest.py  # link を張らない
    BREAK=stale   python3 python/session_start_browser_selftest.py  # 古い link を置き換えない
    BREAK=target  python3 python/session_start_browser_selftest.py  # 繋ぐ先を確かめない
    BREAK=liar    python3 python/session_start_browser_selftest.py  # 作れなくても「繋いだ」と言う

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**（hook が無い・
壊しかたの当て先が hook に見つからない・対照が外れた）
（`docs/island-standards.md` §15）。

**本物の `/opt/pw-browsers` には1バイトも触らない。** hook に
`SESSION_HOOK_PW_ROOT` で偽の置き場を渡して回す。この箱の本物の link は
ほかの担当が使っているので、消したり作り直したりしない。

## なぜ要るか

2026-10-22 に作業箱のイメージが替わり、`/opt/pw-browsers/chromium-1194` が
無くなった（在るのは `chromium-1243` の `chrome-linux64/chrome`）。道具の多くは
`chromium-1194/chrome-linux/chrome` を直に名指ししているので、hook が
セッションの頭で、名指しの場所に本物への link を置く。

この繋ぎは、**壊れても誰も気づかない側に倒れる。**

- 繋がなければ、道具が「ブラウザが無い」で起きない。手で回した人が
  「この箱では撮れない」と黙って諦める（壊れた、とは見えない）
- 繋ぎすぎれば（CI の上で繋ぐ・実在する 1194 を上書きする）、
  入れ損ねや本物の 1194 が link の陰に隠れる
- 作れなかったのに「繋いだ」と言えば、読んだ側は道具が動くと思って回す

## 当てる場面

| 場面 | 置き場 | 欲しい結果 |
| --- | --- | --- |
| 新しい箱 | 1194 無し・`chromium` 在り | 名指しの場所が本物を指す。知らせが1行 |
| 2回目 | 上のあと、もう一度 | 何も変わらない。知らせは出ない |
| 古い link | 名指しの場所が、消えた先を指している | 本物を指し直す。知らせが1行 |
| 1194 が実在 | 本物の 1194 在り | 触らない（種類も中身も同じ）。知らせは出ない |
| CI | `CI=true` | 何も作らない |
| GitHub Actions | `GITHUB_ACTIONS=true` | 何も作らない |
| 繋ぐ先が無い | `chromium` 無し | 何も作らない |
| 作れない | `chromium-1194` がふつうのファイル | 黙って 0 で抜け、頭の残りも出る |

どの場面も、終了コードが 0 で、頭の締めの線（`────`）まで出ることを見る
（**セッションの頭を止めない**）。

## 対照（足を1本ずつ抜く）

hook の**写し**を字の置き換えで壊して、上の場面のうち赤くなるべきものが
赤くなるかを見る。置き換える字が hook に見つからなければ、この見張りが
hook の形を見失っているので **2**。

| `BREAK=` | 抜く足 | 赤くなるはずの場面 |
| --- | --- | --- |
| `ci` | `CI` を見る歯止め | CI |
| `gha` | `GITHUB_ACTIONS` を見る歯止め | GitHub Actions |
| `exists` | 「名指しの場所にもう在る」の歯止め | 1194 が実在・2回目 |
| `nolink` | link を張るところ | 新しい箱 |
| `stale` | 古い link を置き換える（`ln -f`） | 古い link |
| `target` | 繋ぐ先が実行ファイルかを見る | 繋ぐ先が無い |
| `liar` | 作れたときだけ知らせる | 作れない |

**4通り当てても、同じ足を折っているなら1通り**（`island-misses.md` #128）。
上の7つは、それぞれ別のところを折っている。

## 繋ぎそのものも見る

hook が `.claude/settings.json` の `SessionStart` から呼ばれていなければ、
中身が正しくても一度も走らない。そこも1件として数える。
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
HOOK = REPO / ".claude" / "hooks" / "session-start.sh"
SETTINGS = REPO / ".claude" / "settings.json"
WANT = "chromium-1194/chrome-linux/chrome"
REAL = "chromium-1243/chrome-linux64/chrome"
RULE = "────────────────────────────"
NOTE = "ブラウザ:"

# 壊しかた: 名前 → (置き換える字, 置き換えた字, 赤くなるはずの場面)
BREAKS: dict[str, tuple[str, str, list[str]]] = {
    "ci": ('[ -z "${CI:-}" ]', "true", ["CI"]),
    "gha": ('[ -z "${GITHUB_ACTIONS:-}" ]', "true", ["GitHub Actions"]),
    "exists": ('[ ! -e "$want" ]', "true", ["1194 が実在", "2回目"]),
    "nolink": ('\n     && ln -sfn "$real" "$want" 2>/dev/null; then',
               "; then", ["新しい箱"]),
    "stale": ('ln -sfn "$real"', 'ln -s "$real"', ["古い link"]),
    "target": ('[ -f "$real" ] && [ -x "$real" ]', "true", ["繋ぐ先が無い"]),
    "liar": ('\n     && ln -sfn "$real" "$want" 2>/dev/null; then',
             '\n     ; ln -sfn "$real" "$want" 2>/dev/null; true; then', ["作れない"]),
}

BREAK = os.environ.get("BREAK", "")


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


def run_hook(hook: Path, root: Path, extra: dict[str, str] | None = None
             ) -> subprocess.CompletedProcess:
    """hook を偽の置き場で回す。

    **CI と GITHUB_ACTIONS は親から引き継がない**（この見張り自身が CI で走るので、
    引き継ぐと「新しい箱」の場面まで CI の場面になる）。
    `cwd` はリポジトリの外にする（hook の `git status` を数える場所にしない。
    重いリポジトリで何十回も回すと遅いうえ、他人の作業中のファイルを数える）。
    """
    env = {k: v for k, v in os.environ.items()
           if k not in ("CI", "GITHUB_ACTIONS", "GIT_DIR", "GIT_WORK_TREE")}
    env["SESSION_HOOK_PW_ROOT"] = str(root)
    env.update(extra or {})
    return subprocess.run(["bash", str(hook)], cwd=str(root.parent), env=env,
                          capture_output=True, text=True, timeout=60, check=False)


def make_box(root: Path, *, chromium: bool = True) -> Path:
    """いまの箱の形を偽の置き場に作る。本物の実行ファイル（の代わり）を返す。"""
    real = root / REAL
    real.parent.mkdir(parents=True)
    real.write_text("#!/bin/sh\necho fake-chrome\n", encoding="utf-8")
    real.chmod(0o755)
    if chromium:
        (root / "chromium").symlink_to(real)
    return real


def notes(r: subprocess.CompletedProcess) -> list[str]:
    return [ln for ln in r.stdout.splitlines() if ln.startswith(NOTE)]


def head_ok(r: subprocess.CompletedProcess) -> list[str]:
    """セッションの頭を止めていないか（どの場面でも見る）"""
    bad = []
    if r.returncode != 0:
        bad.append(f"終了コード {r.returncode}")
    if RULE not in r.stdout.splitlines()[-1:]:
        bad.append("締めの線まで出ていない")
    return bad


# ---- 場面 ------------------------------------------------------------
# どれも (hook, 置き場) を受け取り、外れた理由の一覧を返す（空なら通った）

def case_fresh(hook: Path, root: Path) -> list[str]:
    real = make_box(root)
    r = run_hook(hook, root)
    bad = head_ok(r)
    want = root / WANT
    if not want.is_symlink():
        bad.append("名指しの場所に link が無い")
    elif Path(os.path.realpath(want)) != real.resolve():
        bad.append(f"link の先が本物でない: {os.readlink(want)}")
    if len(notes(r)) != 1:
        bad.append(f"知らせが {len(notes(r))} 行（欲しいのは1行）")
    return bad


def case_again(hook: Path, root: Path) -> list[str]:
    real = make_box(root)
    run_hook(hook, root)
    want = root / WANT
    before = os.readlink(want) if want.is_symlink() else None
    r = run_hook(hook, root)
    bad = head_ok(r)
    if not want.is_symlink() or os.readlink(want) != before:
        bad.append("2回目で link が変わった")
    if Path(os.path.realpath(want)) != real.resolve():
        bad.append("2回目のあと、本物を指していない")
    if notes(r):
        bad.append(f"2回目にも知らせが出た: {notes(r)}")
    return bad


def case_stale(hook: Path, root: Path) -> list[str]:
    real = make_box(root)
    want = root / WANT
    want.parent.mkdir(parents=True)
    want.symlink_to(root / "chromium-1100" / "chrome-linux64" / "chrome")  # 消えた先
    r = run_hook(hook, root)
    bad = head_ok(r)
    if Path(os.path.realpath(want)) != real.resolve():
        bad.append(f"古い link が残った: {os.readlink(want)}")
    if len(notes(r)) != 1:
        bad.append(f"知らせが {len(notes(r))} 行（欲しいのは1行）")
    return bad


def case_real1194(hook: Path, root: Path) -> list[str]:
    make_box(root)
    want = root / WANT
    want.parent.mkdir(parents=True)
    want.write_text("REAL-1194\n", encoding="utf-8")
    want.chmod(0o755)
    r = run_hook(hook, root)
    bad = head_ok(r)
    if want.is_symlink():
        bad.append("実在する 1194 を link で上書きした")
    elif want.read_text(encoding="utf-8") != "REAL-1194\n":
        bad.append("実在する 1194 の中身が変わった")
    if notes(r):
        bad.append(f"知らせが出た: {notes(r)}")
    return bad


def _on_ci(name: str):
    def case(hook: Path, root: Path) -> list[str]:
        make_box(root)
        r = run_hook(hook, root, {name: "true"})
        bad = head_ok(r)
        if (root / "chromium-1194").exists() or (root / WANT).is_symlink():
            bad.append(f"{name}=true なのに作った")
        if notes(r):
            bad.append(f"知らせが出た: {notes(r)}")
        return bad
    return case


def case_nochromium(hook: Path, root: Path) -> list[str]:
    make_box(root, chromium=False)
    r = run_hook(hook, root)
    bad = head_ok(r)
    if (root / "chromium-1194").exists() or (root / WANT).is_symlink():
        bad.append("繋ぐ先が無いのに作った")
    if notes(r):
        bad.append(f"知らせが出た: {notes(r)}")
    return bad


def case_cannot(hook: Path, root: Path) -> list[str]:
    make_box(root)
    # 置き場の名前がふつうのファイルに取られている＝mkdir も ln も通らない。
    # root で回るこの箱では権限を絞っても書けてしまうので、この形で作れなくする
    (root / "chromium-1194").write_text("not a dir\n", encoding="utf-8")
    r = run_hook(hook, root)
    bad = head_ok(r)
    if notes(r):
        bad.append(f"作れていないのに「繋いだ」と言った: {notes(r)}")
    if r.stderr.strip():
        bad.append(f"黙っていない（標準エラー）: {r.stderr.strip()[:120]}")
    if (root / "chromium-1194").read_text(encoding="utf-8") != "not a dir\n":
        bad.append("置き場の名前を取っていたファイルを書き換えた")
    return bad


CASES = {
    "新しい箱": case_fresh,
    "2回目": case_again,
    "古い link": case_stale,
    "1194 が実在": case_real1194,
    "CI": _on_ci("CI"),
    "GitHub Actions": _on_ci("GITHUB_ACTIONS"),
    "繋ぐ先が無い": case_nochromium,
    "作れない": case_cannot,
}


def run_cases(text: str) -> dict[str, list[str]]:
    """全場面を、それぞれ別の空の置き場で回す。→ {場面: 外れた理由}"""
    out: dict[str, list[str]] = {}
    with tempfile.TemporaryDirectory(prefix="hook-pw-") as tmp:
        hook = Path(tmp) / "session-start.sh"
        hook.write_text(text, encoding="utf-8")
        for i, (name, case) in enumerate(CASES.items()):
            root = Path(tmp) / f"box{i}" / "pw-browsers"
            root.mkdir(parents=True)
            out[name] = case(hook, root)
    return out


def wired() -> list[str]:
    """`.claude/settings.json` の SessionStart から、この hook が呼ばれているか"""
    try:
        cfg = json.loads(SETTINGS.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise Broken(f"settings.json が読めない: {e}") from e
    cmds = [h.get("command", "")
            for blk in cfg.get("hooks", {}).get("SessionStart", [])
            for h in blk.get("hooks", [])]
    if any(c.endswith(".claude/hooks/session-start.sh") for c in cmds):
        return []
    return [f"SessionStart から session-start.sh が呼ばれていない（{cmds}）"]


def main() -> int:
    try:
        text = hook_text()
    except Broken as e:
        print(f"✕ 数えられない: {e}")
        return 2

    got = run_cases(text)
    failed = {k: v for k, v in got.items() if v}

    if BREAK:
        # 壊した写しを回すときは、結果だけ返す（呼ぶのは下の対照）
        want = BREAKS[BREAK][2]
        for k in want:
            print(f"  {'○' if k in failed else '✕'} {k}: {failed.get(k, ['緑のまま'])}")
        return 1 if failed else 0

    print("[1] 場面ごと（偽の置き場で hook を回す）")
    for k, v in got.items():
        print(f"  {'✕' if v else '○'} {k}" + (f": {' / '.join(v)}" if v else ""))

    print("[2] 繋ぎ（settings.json の SessionStart）")
    try:
        w = wired()
    except Broken as e:
        print(f"✕ 数えられない: {e}")
        return 2
    print(f"  {'✕' if w else '○'} session-start.sh が呼ばれている" + (f": {w[0]}" if w else ""))

    print("[3] 対照（足を1本ずつ抜くと、ここが赤くなるか）")
    miss = []
    for leg, (_, _, should) in BREAKS.items():
        r = subprocess.run([sys.executable, str(Path(__file__).resolve())],
                           env=dict(os.environ, BREAK=leg),
                           capture_output=True, text=True, timeout=300, check=False)
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

    checked = len(got) + 1
    print()
    if miss:
        print(f"✕ 対照が外れた（{' / '.join(miss)}）。**この見張りの緑は信用できない**ので数字を出さない")
        return 2
    bad = len(failed) + (1 if w else 0)
    if bad:
        print(f"✕ {checked}件みて、{bad}件 落ちた")
        return 1
    print(f"○ {checked}件ぜんぶ通った（対照 {len(BREAKS)} 本はどれも赤くなった）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
