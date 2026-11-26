"""**作業枝へ積む・読む（`branch.py`）が、作業箱では共有の clone に1つも書かずに回るか。**

    python3 tools/shorts/preview/branch_selftest.py
    BREAK=shared python3 tools/shorts/preview/branch_selftest.py   # 守りを1つ外した版で回す（対照の子）

終了コード 0=通った / 1=落ちた / 2=数えるものが無い・外す字が見つからない（`docs/island-standards.md` §15）。
外へは出ない。origin は一時の置き場に作った bare リポジトリ（`file://`）で、共有の clone は一時の置き場に作った
偽物（`branch.ROOT` を差し替える）。

2026-11-26、作業箱で `remote.py up` が共有の clone で作業枝を fetch し、ほかの担当の clips の暗号文（計 2.7GB）を
落としてディスクを 0 にした。いまは作業箱では使い捨ての bare に `--depth=1 --filter=blob:none` で木だけを取り、
そこで積む。読む中身は要る物だけを取る。

## 足

| 足 | 確かめること |
| --- | --- |
| `push` | 足すファイルが origin の作業枝の先に1 commit で載り、その親が前の先。消す置き場（前置き）は木から消える。何も変わらなければ None |
| `untouched` | 積む・取る・読む・出すを全部回しても、偽物の共有の clone の参照・物の数・設定・FETCH_HEAD が1つも変わらない |
| `blobless` | 取ったあと、一時の置き場に作業枝の大きい中身（2MB の暗号文の役）が入っていない |
| `read` | `read_json`・`wait_json`・`extract` が、中身を持たない置き場から読める（要る物だけ取りに行く） |
| `retry` | 先に誰かが積んで断られたら、取り直して積み直し、先に積まれた物も残る |
| `cleanup` | 一時の置き場が作られ、`cleanup()` で消える |
| `guard` | 平文の道（`shorts/.work/x/clip.mp4`）は積まずに止まる |
"""
from __future__ import annotations

import atexit
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "shorts" / "feedback"))
import legs  # noqa: E402

BR = "claude/selftest-branch"

CUTS = {
    "shared": ("branch.py", "    if _on_actions():\n        return ROOT\n", "    if True:\n        return ROOT\n",
               {"untouched", "cleanup"}, "作業箱でも共有の clone で fetch・積む"),
    "filter": ("branch.py", '([] if _on_actions() else ["--filter=blob:none"])', "([])",
               {"blobless"}, "作業箱でも中身ごと取る"),
    "retry": ("branch.py", "    for i in range(tries):\n        base = fetch(branch)\n",
              "    for i in range(1):\n        base = fetch(branch)\n", {"retry"}, "断られても積み直さない"),
    "cleanup": ("branch.py", "        shutil.rmtree(_SCRATCH.pop(), ignore_errors=True)\n", "        _SCRATCH.pop()\n",
                {"cleanup"}, "一時の置き場を消さない"),
    "guard": ("branch.py", "    if not (WORK_OK.match(path) or REQ_OK.match(path)) or \"..\" in path.split(\"/\"):\n",
              "    if False:\n", {"guard"}, "平文の道も積む"),
}


def sh(d, *a, check=True, data=None):
    r = subprocess.run(["git", "-C", str(d), *a], capture_output=True, input=data)
    if check and r.returncode != 0:
        raise RuntimeError(f"git {' '.join(a)}: {r.stderr.decode()[:200]}")
    return r.stdout.decode().strip()


def setup(cut):
    os.environ.pop("GITHUB_ACTIONS", None)
    c = CUTS[cut] if cut else None
    m = legs.load(HERE / "branch.py", "branch", (c[1], c[2]) if c else None)
    top = Path(tempfile.mkdtemp(prefix="branch-selftest-"))
    # branch.py の一時の置き場もこの下に作らせ、終わったら丸ごと消す（守りを外した子が置き場を残しても漏れない）
    tempfile.tempdir = str(top)
    atexit.register(shutil.rmtree, top, True)
    origin, seed, shared = top / "origin.git", top / "seed", top / "shared"
    sh(top, "init", "--quiet", "--bare", str(origin))
    for k, v in (("uploadpack.allowFilter", "true"), ("uploadpack.allowAnySHA1InWant", "true")):
        sh(origin, "config", k, v)
    url = f"file://{origin}"
    sh(top, "init", "--quiet", str(seed))
    for k, v in (("user.name", "selftest"), ("user.email", "selftest@example.invalid")):
        sh(seed, "config", k, v)
    (seed / "shorts/.work/big").mkdir(parents=True)
    (seed / "shorts/.work/big/payload.enc").write_bytes(os.urandom(2 * 1024 * 1024))
    (seed / "shorts/render").mkdir(parents=True)
    (seed / "shorts/render/old.json").write_text('{"old": 1}\n')
    sh(seed, "add", "-A")
    sh(seed, "commit", "--quiet", "-m", "seed")
    sh(seed, "push", "--quiet", url, f"HEAD:refs/heads/{BR}")
    sh(top, "init", "--quiet", str(shared))
    sh(shared, "remote", "add", "origin", url)
    for k, v in (("user.name", "selftest"), ("user.email", "selftest@example.invalid")):
        sh(shared, "config", k, v)
    m.ROOT = shared
    return {"m": m, "top": top, "origin": origin, "seed": seed, "shared": shared, "url": url}


def tip(ctx):
    return sh(ctx["origin"], "rev-parse", f"refs/heads/{BR}")


def snapshot(d: Path) -> dict:
    files = sorted(str(p.relative_to(d)) for p in (d / ".git").rglob("*") if p.is_file())
    return {"files": files, "refs": sh(d, "for-each-ref", check=False),
            "config": (d / ".git/config").read_text()}


def leg_push(ctx):
    m = ctx["m"]
    before = tip(ctx)
    c = m.push_change(BR, {"shorts/render/a.json": b'{"a": 1}\n'}, ["shorts/render/old.json"], "足す")
    files = sh(ctx["origin"], "ls-tree", "-r", "--name-only", f"refs/heads/{BR}").splitlines()
    parent = sh(ctx["origin"], "rev-parse", f"{c}^") if c else ""
    same = m.push_change(BR, {"shorts/render/a.json": b'{"a": 1}\n'}, [], "同じ")
    return [("足したファイルが作業枝の先に載る", c == tip(ctx) and "shorts/render/a.json" in files),
            ("親が前の先（1 commit）", parent == before),
            ("消す置き場が木から消える", "shorts/render/old.json" not in files),
            ("何も変わらなければ None", same is None)]


def leg_untouched(ctx):
    m = ctx["m"]
    before = snapshot(ctx["shared"])
    m.push_change(BR, {"shorts/render/u.json": b'{"u": 1}\n'}, [], "触らない")
    sha = m.fetch(BR)
    m.read_json(sha, "shorts/render/u.json")
    with tempfile.TemporaryDirectory() as td:
        m.extract(sha, "shorts/render", Path(td))
    after = snapshot(ctx["shared"])
    return [("共有の clone の .git の中のファイルが1つも増えない・減らない", before["files"] == after["files"]),
            ("参照も設定も変わらない", before["refs"] == after["refs"] and before["config"] == after["config"]),
            ("FETCH_HEAD を書かない", not (ctx["shared"] / ".git/FETCH_HEAD").exists())]


def leg_blobless(ctx):
    m = ctx["m"]
    m.fetch(BR)
    d = m.repo()
    big = sh(ctx["seed"], "rev-parse", "HEAD:shorts/.work/big/payload.enc")
    have = subprocess.run(["git", "-C", str(d), "cat-file", "-e", big], capture_output=True,
                          env=dict(os.environ, GIT_NO_LAZY_FETCH="1")).returncode == 0
    size = sum(p.stat().st_size for p in Path(d).rglob("*") if p.is_file())
    return [("大きい中身（2MB）を取っていない", not have),
            (f"一時の置き場が 1MB 未満（{size // 1024}KB）", size < 1024 * 1024)]


def leg_read(ctx):
    m = ctx["m"]
    m.push_change(BR, {"shorts/render/r.json": b'{"nonce": "n1"}\n'}, [], "読む")
    sha, d = m.wait_json(BR, "shorts/render/r.json", lambda x: x.get("nonce") == "n1", timeout=10, every=0.1)
    with tempfile.TemporaryDirectory() as td:
        out = m.extract(sha, "shorts/render", Path(td))
        got = json.loads((out / "r.json").read_text())
    return [("read_json・wait_json が中身を読む", d == {"nonce": "n1"} and m.read_json(sha, "shorts/render/r.json") == d),
            ("extract が置き場を書き出す", got == {"nonce": "n1"})]


def leg_retry(ctx):
    m = ctx["m"]
    stale = m.fetch(BR)
    other = ctx["seed"]
    sh(other, "fetch", "--quiet", ctx["url"], BR)
    sh(other, "checkout", "--quiet", "FETCH_HEAD")
    (other / "shorts/render/other.json").write_text('{"o": 1}\n')
    sh(other, "add", "-A")
    sh(other, "commit", "--quiet", "-m", "先に積んだ")
    sh(other, "push", "--quiet", ctx["url"], f"HEAD:refs/heads/{BR}")
    real = m.fetch
    calls = []

    def first_stale(b):
        calls.append(b)
        return stale if len(calls) == 1 else real(b)
    m.fetch = first_stale
    try:
        c = m.push_change(BR, {"shorts/render/mine.json": b'{"m": 1}\n'}, [], "あとから", tries=3)
    except RuntimeError:
        c = None
    finally:
        m.fetch = real
    files = sh(ctx["origin"], "ls-tree", "-r", "--name-only", f"refs/heads/{BR}").splitlines()
    return [("1回目は古い先で断られ、取り直して積めた", c is not None and c == tip(ctx) and len(calls) >= 2),
            ("先に積まれた物も残る", "shorts/render/other.json" in files and "shorts/render/mine.json" in files)]


def leg_cleanup(ctx):
    m = ctx["m"]
    m.fetch(BR)
    made = list(m._SCRATCH)
    m.cleanup()
    return [("一時の置き場が作られていた", len(made) == 1 and made[0] != ctx["shared"]),
            ("cleanup で消える", bool(made) and not any(Path(d).exists() for d in made) and not m._SCRATCH)]


def leg_guard(ctx):
    m = ctx["m"]
    try:
        m.push_change(BR, {"shorts/.work/x/clip.mp4": b"plain"}, [], "平文")
        refused = False
    except RuntimeError:
        refused = True
    files = sh(ctx["origin"], "ls-tree", "-r", "--name-only", f"refs/heads/{BR}").splitlines()
    return [("平文の道は積まずに止まる", refused and "shorts/.work/x/clip.mp4" not in files)]


LEGS = {"push": leg_push, "untouched": leg_untouched, "blobless": leg_blobless, "read": leg_read,
        "retry": leg_retry, "cleanup": leg_cleanup, "guard": leg_guard}

if __name__ == "__main__":
    sys.exit(legs.main(Path(__file__).resolve(), LEGS, CUTS, setup))
