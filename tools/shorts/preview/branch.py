"""作業枝へ積む・作業枝から読むを、**作業ツリーに触らずに**やる小物（作業箱と Actions の両方で使う）。

作業箱では、統括のセッションが同じ clone で別の枝を開いていることがある。
`git checkout` も `git add` もせず、索引を一時ファイルにして「作業枝の先 + 足す/消す」の
木を作り、commit を1つ積んで push する。断られたら（ほかの誰かが先に積んだら）
取り直して積み直す。

**平文を積まないことはここでも見る。** `shorts/.work/` の下に積めるのは
manifest.json / key.enc / payload.enc(.NNN) / inbox.json だけ（inbox.json は
Actions がその場で作った**公開鍵**と乱数だけを持つ）。90MB 以上のファイルは積まない
（GitHub は 100MB を超えるファイルを断る。seal.py は 45MB で切る）。
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import tarfile
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
WORK_OK = re.compile(r"^shorts/\.work/.+/(manifest\.json|key\.enc|payload\.enc(\.\d{3})?|inbox\.json)$")
REQ_OK = re.compile(r"^shorts/(preview|render|upload)/[A-Za-z0-9][A-Za-z0-9._-]{0,63}\.json$")
MAX_FILE = 90 * 1024 * 1024
# Actions の中では git の名前が無いので、ここで決める（作業箱では clone の設定を使う）
BOT = {"GIT_AUTHOR_NAME": "github-actions[bot]",
       "GIT_AUTHOR_EMAIL": "41898282+github-actions[bot]@users.noreply.github.com"}


def git(*a: str, env: dict | None = None, data: bytes | None = None) -> str:
    r = subprocess.run(["git", "-C", str(ROOT), *a], env=env, input=data, capture_output=True)
    if r.returncode != 0:
        raise RuntimeError(f"git {a[0]} が落ちた: {r.stderr.decode(errors='replace').strip()[:300]}")
    return r.stdout.decode()


def fetch(branch: str) -> str:
    # **作業箱では --depth を付けない。** 共有の clone で `fetch --depth=1` を回すと、
    # 取った先が .git/shallow に境目として書き足され、手元にある履歴まで見えなくなる
    # （2026-10-16 に実際に踏んだ。HEAD から31件しか辿れなくなった）。浅く取るのは
    # 使い捨てのランナーの中だけ。ほかのセッションの fetch と shallow.lock を取り合ったら待って取り直す
    args = ["fetch", "--quiet"] + (["--depth=1"] if os.environ.get("GITHUB_ACTIONS") == "true"
                                   else []) + ["origin", branch]
    for i in range(6):
        try:
            git(*args)
            break
        except RuntimeError as e:
            if ".lock" not in str(e) or i == 5:
                raise
            time.sleep(2 + 2 * i)
    return git("rev-parse", "FETCH_HEAD").strip()


def _commit_env() -> dict:
    env = dict(os.environ)
    if os.environ.get("GITHUB_ACTIONS") == "true":
        env.update(BOT, GIT_COMMITTER_NAME=BOT["GIT_AUTHOR_NAME"],
                   GIT_COMMITTER_EMAIL=BOT["GIT_AUTHOR_EMAIL"])
    return env


def check_path(path: str, size: int) -> None:
    if not (WORK_OK.match(path) or REQ_OK.match(path)) or ".." in path.split("/"):
        raise RuntimeError(f"積まないはずの道: {path}")
    if size >= MAX_FILE:
        raise RuntimeError(f"90MB 以上のファイルは積まない: {path}")


def push_change(branch: str, adds: dict[str, bytes | Path], removes: list[str],
                message: str, tries: int = 8) -> str | None:
    """作業枝の先に、足す・消すを1 commit で積む。何も変わらなければ None。"""
    if not branch.startswith("claude/"):
        raise RuntimeError(f"claude/ 以外の枝には積まない: {branch}")
    for path, v in adds.items():
        check_path(path, v.stat().st_size if isinstance(v, Path) else len(v))
    blobs: dict[str, str] = {}
    for path, v in adds.items():
        blobs[path] = (git("hash-object", "-w", str(v)) if isinstance(v, Path)
                       else git("hash-object", "-w", "--stdin", data=v)).strip()
    for i in range(tries):
        base = fetch(branch)
        with tempfile.TemporaryDirectory() as td:
            env = dict(os.environ, GIT_INDEX_FILE=str(Path(td) / "index"))
            git("read-tree", base, env=env)
            for prefix in removes:
                for p in git("ls-tree", "-r", "--name-only", base, "--", prefix).splitlines():
                    if p:
                        git("update-index", "--force-remove", p, env=env)
            for path, sha in blobs.items():
                git("update-index", "--add", "--cacheinfo", f"100644,{sha},{path}", env=env)
            # --missing-ok: Actions は中身（blob）を落とさない checkout（blob:none）で回る。write-tree は既定で
            # 木の全部の中身が手元にあるかを確かめ、無ければ取りに行く。作業枝の暗号文 889MB を毎回落として
            # 1回の push に 65〜92秒かかった（2026-10-21、r1011-b）。木を作るのに中身は要らない
            tree = git("write-tree", "--missing-ok", env=env).strip()
        if tree == git("rev-parse", f"{base}^{{tree}}").strip():
            return None
        commit = git("commit-tree", tree, "-p", base, "-m", message, env=_commit_env()).strip()
        r = subprocess.run(["git", "-C", str(ROOT), "push", "--quiet", "origin",
                            f"{commit}:refs/heads/{branch}"], capture_output=True)
        if r.returncode == 0:
            return commit
        # 同じ枝へ Actions と作業箱が同時に積むことがある。揃ってぶつからないよう、ずらして待つ
        time.sleep(2 + 2 * i + (os.getpid() % 5))
    raise RuntimeError(f"作業枝に{tries}回とも積めなかった")


def read_json(sha: str, path: str) -> dict | None:
    try:
        return json.loads(git("show", f"{sha}:{path}"))
    except (RuntimeError, json.JSONDecodeError):
        return None


def wait_json(branch: str, path: str, ok, timeout: float, every: float = 5) -> tuple[str, dict]:
    """作業枝の `path` が現れて ok(中身) が真になるまで待つ。"""
    t0 = time.time()
    while True:
        sha = fetch(branch)
        d = read_json(sha, path)
        if d is not None and ok(d):
            return sha, d
        if time.time() - t0 > timeout:
            raise TimeoutError(f"{timeout:.0f}秒待っても {path} が来ない")
        time.sleep(every)


def extract(sha: str, rel: str, into: Path) -> Path:
    """作業枝の置き場を、作業ツリーを通さずに一時の場所へ出す。"""
    r = subprocess.run(["git", "-C", str(ROOT), "archive", "--format=tar", sha, rel],
                       capture_output=True, check=True)
    tar = into / "a.tar"
    tar.write_bytes(r.stdout)
    with tarfile.open(tar) as tf:
        tf.extractall(into, filter="data")
    tar.unlink()
    return into / rel
