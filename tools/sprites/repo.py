"""「いま自分が居るリポジトリの根」を1か所で決める（Python 側）。

考え方も理由も `tools/sprites/repo.mjs` と同じ。**直書きしない。**
`/home/user/live-streaming`（直書き点検: 記録）と書いた道具は、worktree から回すと本体のファイルを
読む。しかも赤くならない（`docs/island-misses.md` #129 / #131）。

使い方:

    import sys, pathlib
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
    from repo import repo_path

    SRC = repo_path("site/content/residents.ts")

自分で確かめる:

    python3 tools/sprites/repo.py --selftest
"""

import os
import subprocess
import sys
from pathlib import Path

# 根の目印。**片方だけでは足りない**（`site/` だけなら site/site でも当たる）
MARKS = (("site", "public"), ("tools", "sprites"))


def repo_root(start: str | None = None) -> Path:
    """このファイルが入っているリポジトリの根。見つからなければ **投げる。**

    黙って `/home/user/live-streaming`（直書き点検: 記録）や cwd に落ちない。落ちたことは
    「別の枝のファイルを読んで、それらしい結果が出た」という形でしか出ない。
    """
    here = Path(start or __file__).resolve()
    for d in [here, *here.parents]:
        if d.is_dir() and all((d.joinpath(*m)).exists() for m in MARKS):
            return d
    # `tools/` ごと別の場所へ写した場合の受け皿
    try:
        top = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            cwd=here.parent,
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
        if top and (Path(top) / "site" / "public").exists():
            return Path(top)
    except (OSError, subprocess.CalledProcessError):
        pass  # git が無い・リポジトリの外。下で投げる
    raise RuntimeError(
        f"repo.py: リポジトリの根が見つかりません（{here} から上に site/public と "
        "tools/sprites を両方持つ段がない）。どのファイルを読めばいいか決まらないので、"
        "ここで止めます"
    )


def repo_path(*parts: str) -> str:
    """根からの相対で組み立てる。`repo_path("site/content/residents.ts")`"""
    return str(repo_root().joinpath(*parts))


def from_root(p: str) -> str:
    """絶対パスならそのまま、相対なら**根から**（cwd からではない）。

    道具は `tools/sprites/` の中からも根からも回すので、cwd 基準だと同じ値が
    呼ぶ場所で別のところを指す。どこから回しても同じものを見るほうを取った。
    """
    return p if os.path.isabs(p) else str(repo_root() / p)


def _selftest() -> int:
    """偽のリポジトリを2つ作り、**別々の写しが別々のファイルを読む**ことを見る。

    直書きに戻した写しも植えて、**そのときこの対照が落ちる**ことまで見る。
    """
    import shutil
    import tempfile

    ok, ng = [], []

    def check(label, got, want):
        (ok if str(got) == str(want) else ng).append(f"{label}: 出た={got} ほしい={want}")

    base = Path(tempfile.mkdtemp(prefix="repocheck-py-"))
    me = Path(__file__).resolve()

    def fake(name: str, mark: str, hard: Path | None = None) -> Path:
        root = base / name
        (root / "site" / "public").mkdir(parents=True)
        (root / "tools" / "sprites").mkdir(parents=True)
        (root / "site" / "public" / "og.png").write_text(mark, encoding="utf8")
        shutil.copy(me, root / "tools" / "sprites" / "repo.py")
        body = (
            f"P = {str(hard / 'site' / 'public' / 'og.png')!r}\n"
            if hard
            else "import sys, pathlib\n"
            "sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))\n"
            "from repo import repo_path\n"
            'P = repo_path("site/public/og.png")\n'
        )
        (root / "tools" / "sprites" / "tool.py").write_text(body, encoding="utf8")
        return root

    def read_via(root: Path) -> str:
        """写しを**別プロセスで**走らせて、読めた中身を返す。

        同じプロセスで import すると sys.modules が1つ目の写しを使い回して、
        2つ目も同じ根を見る。**対照が素通りする**のでプロセスを分ける。
        """
        out = subprocess.run(
            [
                sys.executable,
                "-c",
                "import sys,pathlib,runpy;"
                "d=pathlib.Path(sys.argv[1]);sys.path.insert(0,str(d));"
                "g=runpy.run_path(str(d/'tool.py'));"
                "print(open(g['P'],encoding='utf8').read(),end='')",
                str(root / "tools" / "sprites"),
            ],
            capture_output=True,
            text=True,
        )
        if out.returncode != 0:
            # 空文字で返すと「読めた中身が空」と見分けがつかない。理由を持って帰る
            return f"落ちた: {out.stderr.strip().splitlines()[-1] if out.stderr.strip() else '?'}"
        return out.stdout

    a = fake("repo-a", "AAAA-これは a のファイル")
    b = fake("repo-b", "BBBB-これは b のファイル")

    check("a の写しが見つけた根", repo_root(a / "tools" / "sprites" / "repo.py"), a)
    check("b の写しが見つけた根", repo_root(b / "tools" / "sprites" / "repo.py"), b)
    check("a の道具が読んだ中身", read_via(a), "AAAA-これは a のファイル")
    check("b の道具が読んだ中身", read_via(b), "BBBB-これは b のファイル")
    check("2つが違う中身を読んだ", read_via(a) != read_via(b), "True")

    # 直書きに戻すと、自分の中身を読めない＝#129 そのもの
    h = fake("repo-hard", "HHHH-これは hard のファイル", a)
    check("直書きの写しは自分の中身を読めない", read_via(h), "AAAA-これは a のファイル")
    check("直書きだと対照が落ちる", read_via(h) != "HHHH-これは hard のファイル", "True")

    # 根の無いところ・片方しか無い段は、黙って落ちずに投げる
    lost = base / "lost"
    lost.mkdir()
    shutil.copy(me, lost / "repo.py")
    try:
        repo_root(lost / "repo.py")
        check("根の無いところの写し", "投げなかった", "投げた")
    except RuntimeError:
        check("根の無いところの写し", "投げた", "投げた")

    half = base / "half"
    (half / "site" / "public").mkdir(parents=True)
    (half / "sub" / "tools" / "sprites").mkdir(parents=True)
    try:
        repo_root(half / "sub" / "tools" / "sprites" / "x.py")
        check("片方しか無い段は根にしない", "投げなかった", "投げた")
    except RuntimeError:
        check("片方しか無い段は根にしない", "投げた", "投げた")

    shutil.rmtree(base, ignore_errors=True)

    print(f"対照 {len(ok) + len(ng)}件中 {len(ok)}件通った")
    for line in ng:
        print(f"::error::{line}")
    if not ok:
        print("::error::対照が0件です")
        return 2
    return 1 if ng else 0


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        sys.exit(_selftest())
    print(f"repo.py の根: {repo_root()}")
    print("対照を回す: python3 tools/sprites/repo.py --selftest")
