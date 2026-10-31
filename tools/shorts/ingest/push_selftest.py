"""作業枝に置く（push.sh）の見張り。**GitHub にも YouTube にも触らない。**

    python3 tools/shorts/ingest/push_selftest.py

回し役（`python/selftest_runner.py`）が `tools/shorts/` を降りて拾う。要るのは git と bash だけで、
Python は標準ライブラリしか使わない（Selftests にも、取り込みの job にも、足すものが無い）。
一時置き場に bare リポジトリを作って origin にし、`actions/checkout` と同じく depth=1 で
clone した中から**本物の push.sh** を回す。箱の git の設定（署名など）は読まない。

## 何を見るか

作業枝は PR の head も兼ねていて、マージすると GitHub が枝を消す（delete_branch_on_merge）。
2026-10-19、解析を終えた4本の push.sh が「couldn't find remote ref」で全部落ち、
50分ぶんの結果を失った（`docs/island-misses.md` #291）。だから枝が在るときと無いときの両方を当てる。

- a. 枝が在る（checkout のあとでほかの job が積んでいる）→ その上に積む。
     ほかの job の置き場は残り、自分の置き場に残っていた古い切れ端は消える
- b. 枝が無い（マージで消えた）→ checkout した commit の上に置いて、枝を作り直す。
     作り直したことがログと注記に出る
- c. 2本が同時に「無い」と見た → 先のほうが作り、遅いほうの1回目の push は断られ、
     次の回で、できた枝の上に積む。両方の結果が枝に残る。
     遅いほうの pre-push の hook の中で先のほうを回して、ぶつかりを毎回同じ形で起こす
- d. sealed に置かないはずのもの（平文・下の階・90MB 以上）・claude/ 以外の枝・変な置き場
     → 何も push しない。枝が無いときも作らない
- e. origin が読めない（通信が落ちた）→ 「無い」と読まない。枝を作らずに落ちる。
     読むほうの URL だけを壊し、push のほうは本物に向けておく——「無い」と読み違えれば、
     本物に枝ができて見える
- f. clips の見る用の小さな封（sheets.key.enc・sheets.enc）も置く。シートの平文は置かない
- g. 字幕だけの道（captions の job）: 1つの job の封を、置き場ごとに `SEALED` で指して続けて置く。
     指した置き場が無ければ何も push しない

終了コード 0=全部通った / 1=落ちたものがある / 2=回せない（git・bash・push.sh が無い）。
"""

from __future__ import annotations

import json
import os
import shlex
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
PUSH = HERE / "push.sh"
BRANCH = "claude/selftest-ingest"
RECREATE = "枝を作り直す"        # 「無い」と見たときに出す行
RECREATED = "作り直した"         # 作り直して置けたときに出す行
REJECTED = "push を断られた"


def make_env(root: Path) -> dict:
    """箱の git の設定と、外から来た GIT_* を切った環境。"""
    cfg = root / "gitconfig"
    cfg.write_text("[user]\n\tname = selftest\n\temail = selftest@example.invalid\n"
                   "[init]\n\tdefaultBranch = master\n"
                   "[advice]\n\tdetachedHead = false\n", encoding="utf-8")
    env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
    env.update(GIT_CONFIG_GLOBAL=str(cfg), GIT_CONFIG_NOSYSTEM="1", GIT_TERMINAL_PROMPT="0")
    return env


class Box:
    """1本の足ぶんの置き場。origin（bare）と、それを触る seed（人やほかの job の代わり）。"""

    def __init__(self, root: Path, env: dict):
        self.root = root
        self.env = env
        self.origin = root / "origin.git"
        self.url = self.origin.as_uri()
        self.seed = root / "seed"
        self.git("init", "-q", "--bare", str(self.origin))
        self.git("clone", "-q", self.url, str(self.seed))
        self.put(self.seed, {"README.md": "島\n"}, "はじめ")
        self.git("push", "-q", "origin", "HEAD:refs/heads/master", cwd=self.seed)
        self.git("checkout", "-q", "-b", BRANCH, cwd=self.seed)
        self.put(self.seed, {"shorts/requests/req.json": '{"mode": "archive"}\n'}, "依頼")
        self.git("push", "-q", "origin", f"HEAD:refs/heads/{BRANCH}", cwd=self.seed)
        self.base = self.git("rev-parse", "HEAD", cwd=self.seed)

    def git(self, *args: str, cwd: Path | None = None) -> str:
        r = subprocess.run(["git", *args], cwd=cwd or self.root, env=self.env,
                           capture_output=True, text=True, timeout=60)
        if r.returncode != 0:
            raise RuntimeError(f"git {' '.join(args)} が {r.returncode}: {r.stderr.strip()}")
        return r.stdout.strip()

    def put(self, repo: Path, files: dict[str, str], msg: str) -> None:
        for rel, body in files.items():
            p = repo / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(body, encoding="utf-8")
        self.git("add", "-A", cwd=repo)
        self.git("commit", "-q", "-m", msg, cwd=repo)

    def checkout(self, name: str) -> Path:
        """actions/checkout の代わり。この run の sha（いまの枝の先）を depth=1 で取る。"""
        job = self.root / name
        self.git("clone", "-q", "--depth=1", "--branch", BRANCH, self.url, str(job))
        return job

    def merge_and_delete(self) -> None:
        """PR をマージした形。master に入り、GitHub が作業枝を消す。"""
        self.git("fetch", "-q", "origin", cwd=self.seed)
        self.git("checkout", "-q", "master", cwd=self.seed)
        self.git("merge", "-q", "--no-ff", "-m", "Merge pull request", f"origin/{BRANCH}",
                 cwd=self.seed)
        self.git("push", "-q", "origin", "master", cwd=self.seed)
        self.git("push", "-q", "origin", "--delete", BRANCH, cwd=self.seed)

    def refs(self) -> dict[str, str]:
        out = self.git("--git-dir", str(self.origin), "for-each-ref",
                       "--format=%(refname) %(objectname)")
        return dict(line.split(" ", 1) for line in out.splitlines() if line)

    def tip(self) -> str | None:
        return self.refs().get(f"refs/heads/{BRANCH}")

    def parent(self, rev: str) -> str:
        return self.git("--git-dir", str(self.origin), "rev-parse", f"{rev}^")

    def files(self, rev: str, prefix: str) -> dict[str, bytes]:
        names = self.git("--git-dir", str(self.origin), "ls-tree", "-r", "--name-only",
                         rev, "--", prefix).splitlines()
        out = {}
        for n in names:
            r = subprocess.run(["git", "--git-dir", str(self.origin), "cat-file", "blob",
                                f"{rev}:{n}"], env=self.env, capture_output=True, check=True)
            out[n[len(prefix) + 1:]] = r.stdout
        return out

    def changed(self, a: str, b: str) -> list[str]:
        return self.git("--git-dir", str(self.origin), "diff", "--name-only", a, b).splitlines()


def sealed(root: Path, name: str) -> Path:
    """RUNNER_TEMP の代わり。seal.py が置く形の偽物（中身は乱数）を sealed/ に置く。"""
    rt = root / f"rt-{name}"
    s = rt / "sealed"
    s.mkdir(parents=True)
    (s / "manifest.json").write_text(json.dumps({"key": name, "status": "ok"}), encoding="utf-8")
    (s / "key.enc").write_bytes(os.urandom(256))
    (s / "payload.enc.000").write_bytes(os.urandom(4096))
    (s / "payload.enc.001").write_bytes(os.urandom(1000))
    return rt


def on_disk(rt: Path) -> dict[str, bytes]:
    return {p.name: p.read_bytes() for p in (rt / "sealed").iterdir()}


def job_env(env: dict, rt: Path, dest: str, branch: str = BRANCH) -> dict:
    return dict(env, BRANCH=branch, DEST=dest, KEY=dest.replace("/", "__"),
                RUNNER_TEMP=str(rt), RUN_ID="selftest")


def run_push(job: Path, env: dict) -> subprocess.CompletedProcess:
    return subprocess.run(["bash", str(PUSH)], cwd=job, env=env, capture_output=True,
                          text=True, timeout=180)


def tail(r: subprocess.CompletedProcess) -> str:
    """push.sh が最後に言ったこと。言っていなければ git の言ったこと。"""
    for out in (r.stdout, r.stderr):
        lines = [x.strip() for x in out.splitlines() if x.strip()]
        if lines:
            return lines[-1][:120]
    return f"終了コード {r.returncode}・出力なし"


def main() -> int:
    for tool in ("git", "bash"):
        if not shutil.which(tool):
            print(f"!! {tool} が無いので回せない")
            return 2
    if not PUSH.is_file():
        print(f"!! 守る実物が無い: {PUSH}")
        return 2

    fails: list[str] = []

    def check(ok: bool, what: str) -> None:
        print(f"{'ok' if ok else 'NG'}  {what}")
        if not ok:
            fails.append(what)

    with tempfile.TemporaryDirectory() as td:
        top = Path(td)
        env = make_env(top)

        # --- a. 枝が在る → ほかの job が積んだ先の上に積む
        root = top / "a"
        root.mkdir()
        box = Box(root, env)
        job = box.checkout("job")
        dest = "vidA/archive"
        # checkout のあとで、ほかの job が別の置き場に積み、前の回の切れ端も同じ置き場に残っている
        box.git("checkout", "-q", BRANCH, cwd=box.seed)
        box.put(box.seed, {"shorts/.work/other/archive/manifest.json": "{}\n",
                           f"shorts/.work/{dest}/payload.enc.009": "前の回の切れ端\n"}, "ほかの job")
        box.git("push", "-q", "origin", f"HEAD:refs/heads/{BRANCH}", cwd=box.seed)
        before = box.tip()
        rt = sealed(root, "a")
        r = run_push(job, job_env(env, rt, dest))
        tip = box.tip()
        check(r.returncode == 0 and tip != before, f"a. 枝が在る → 置けた（{tail(r)}）")
        check(tip is not None and box.parent(tip) == before,
              "a. ほかの job が積んだ先の上に積む（checkout した commit に戻らない）")
        check(tip is not None and box.files(tip, f"shorts/.work/{dest}") == on_disk(rt),
              "a. 置き場の中身が sealed と1バイトも違わない（前の回の切れ端 .009 は消える）")
        check(tip is not None and bool(box.files(tip, "shorts/.work/other")),
              "a. ほかの job の置き場は残る")
        check(RECREATE not in r.stdout and RECREATED not in r.stdout,
              "a. 在る枝を「作り直した」とは言わない")

        # --- b. 枝が無い → checkout した commit の上に置いて、枝を作り直す
        root = top / "b"
        root.mkdir()
        box = Box(root, env)
        job = box.checkout("job")
        box.merge_and_delete()
        master = box.refs()["refs/heads/master"]
        check(box.tip() is None, "b. 前提: マージで枝が消えている")
        dest = "vidB/archive"
        rt = sealed(root, "b")
        r = run_push(job, job_env(env, rt, dest))
        tip = box.tip()
        check(r.returncode == 0 and tip is not None, f"b. 枝が無い → 作り直して置けた（{tail(r)}）")
        check(tip is not None and box.parent(tip) == box.base,
              "b. 作り直した枝は、checkout した commit（この run の sha）の上に1つ積んだもの")
        check(tip is not None and box.changed(box.base, tip)
              == sorted(f"shorts/.work/{dest}/{n}" for n in on_disk(rt)),
              "b. 土台から変わったのは置き場の暗号文だけ")
        check(tip is not None and box.files(tip, f"shorts/.work/{dest}") == on_disk(rt),
              "b. 置き場の中身が sealed と1バイトも違わない")
        check(RECREATE in r.stdout and "::warning::" in r.stdout and RECREATED in r.stdout,
              "b. 作り直したことがログ（と注記）に出る")
        check(box.refs()["refs/heads/master"] == master, "b. master には触らない")

        # --- c. 2本が同時に「無い」と見た → 遅いほうは断られ、次の回で積む
        root = top / "c"
        root.mkdir()
        box = Box(root, env)
        job_a, job_b = box.checkout("jobA"), box.checkout("jobB")
        box.merge_and_delete()
        rt_a, rt_b = sealed(root, "cA"), sealed(root, "cB")
        dest_a, dest_b = "vidC1/archive", "vidC2/archive"
        mark, log_a, rc_a = root / "hook-fired", root / "a.log", root / "a.rc"
        # B が「無い」と見て commit したあと、1回目の push を送る直前に A を回す。
        # A が枝を作るので、B の「無い枝を作る」push は断られる（本番で2本が同じ秒に来た形）
        a_env = " ".join(f"{k}={shlex.quote(v)}" for k, v in job_env(env, rt_a, dest_a).items()
                         if k in ("BRANCH", "DEST", "KEY", "RUNNER_TEMP", "RUN_ID"))
        hook = job_b / ".git" / "hooks" / "pre-push"
        hook.write_text(
            "#!/bin/sh\n"
            f"[ -e {shlex.quote(str(mark))} ] && exit 0\n"
            f": > {shlex.quote(str(mark))}\n"
            # hook の中は B の git の環境。A の置き場へ移る前に剥がす
            "unset $(git rev-parse --local-env-vars)\n"
            f"cd {shlex.quote(str(job_a))} || exit 1\n"
            f"env {a_env} bash {shlex.quote(str(PUSH))} > {shlex.quote(str(log_a))} 2>&1\n"
            f"echo $? > {shlex.quote(str(rc_a))}\n"
            "exit 0\n", encoding="utf-8")
        hook.chmod(0o755)
        r = run_push(job_b, job_env(env, rt_b, dest_b))
        out_a = log_a.read_text(encoding="utf-8") if log_a.exists() else ""
        a_ok = rc_a.exists() and rc_a.read_text().strip() == "0"
        tip = box.tip()
        check(mark.exists() and a_ok and RECREATED in out_a,
              f"c. 先のほう（A）が枝を作り直した（{out_a.strip().splitlines()[-1:] if out_a else '走っていない'}）")
        check(RECREATE in r.stdout and REJECTED in r.stdout,
              "c. 遅いほう（B）も「無い」と見て、1回目の push を断られた")
        check(r.returncode == 0 and tip is not None, f"c. B は取り直して置けた（{tail(r)}）")
        both = (tip is not None
                and box.files(tip, f"shorts/.work/{dest_a}") == on_disk(rt_a)
                and box.files(tip, f"shorts/.work/{dest_b}") == on_disk(rt_b))
        check(both, "c. A と B の結果が両方とも枝に残る")
        a_tip = box.parent(tip) if tip else None
        check(tip is not None and a_tip is not None and box.parent(a_tip) == box.base,
              "c. 枝は 土台 → A → B の一本道（B は A の作った枝の上に積んだ）")
        last = [x for x in r.stdout.splitlines() if "置いた:" in x]
        check(bool(last) and RECREATED not in last[-1],
              "c. B は「作り直した」とは言わない（できた枝に積んだだけ）")

        # --- d. 置かないはずのもの・変な枝・変な置き場 → 何も push しない
        root = top / "d"
        root.mkdir()
        box = Box(root, env)
        job = box.checkout("job")

        def refused(what: str, mutate=None, dest: str = "vidD/archive",
                    branch: str = BRANCH, need: str = "") -> None:
            rt = sealed(root, f"d{len(list(root.glob('rt-*')))}")
            if mutate:
                mutate(rt / "sealed")
            before = box.refs()
            r = run_push(job, job_env(env, rt, dest, branch))
            check(r.returncode != 0 and box.refs() == before and need in r.stdout,
                  f"d. {what} → 何も push しない（{tail(r)}）")

        def plain(s: Path) -> None:
            (s / "transcript.txt").write_text("平文の字幕", encoding="utf-8")

        def subdir(s: Path) -> None:
            (s / "sheets").mkdir()
            (s / "sheets" / "0001.jpg").write_bytes(b"\xff\xd8")

        def odd_part(s: Path) -> None:
            (s / "payload.enc.12").write_bytes(os.urandom(16))

        def huge(s: Path) -> None:
            # 疎なファイルで 90MB ちょうど（ディスクは食わない）
            with open(s / "payload.enc.002", "wb") as f:
                f.truncate(90 * 1024 * 1024)

        refused("平文（transcript.txt）が混ざった", plain, need="置かないはずのもの")
        refused("下の階（sheets/）が混ざった", subdir, need="置かないはずのもの")
        refused("切れ端の番号の形が違う（payload.enc.12）", odd_part, need="置かないはずのもの")
        refused("90MB の切れ端が混ざった", huge, need="90MB")
        refused("claude/ 以外の枝（master）", branch="master", need="claude/ 以外")
        refused("置き場が上へ出る（../）", dest="../../escape", need="置き場の道が変")
        refused("置き場が絶対の道（/）", dest="/tmp/escape", need="置き場の道が変")
        refused("置き場が空", dest="")
        box.merge_and_delete()
        refused("枝が消えているときに平文が混ざった（枝も作らない）", plain, need="置かないはずのもの")
        check(box.tip() is None, "d. 断ったあとも、消えた枝は作られていない")

        # --- e. origin が読めない → 「無い」と読まず、枝を作らずに落ちる
        root = top / "e"
        root.mkdir()
        box = Box(root, env)
        job = box.checkout("job")
        # 読む URL だけを壊す。push の URL（pushurl）は本物のまま
        box.git("remote", "set-url", "--push", "origin", box.url, cwd=job)
        box.git("remote", "set-url", "origin", (root / "unreachable.git").as_uri(), cwd=job)
        before = box.refs()
        r = run_push(job, job_env(env, sealed(root, "e1"), "vidE/archive"))
        check(r.returncode != 0 and box.refs() == before and RECREATE not in r.stdout,
              f"e. 枝が在る・読めない → 前と同じく落ちる（{tail(r)}）")
        box.merge_and_delete()
        before = box.refs()
        r = run_push(job, job_env(env, sealed(root, "e2"), "vidE/archive"))
        check(r.returncode != 0 and box.tip() is None and box.refs() == before
              and RECREATE not in r.stdout,
              f"e. 枝が無い・読めない → 「無い」と読まず、枝を作らない（{tail(r)}）")

        # --- f. clips の見る用の小さな封（seal.py の sheets.key.enc・sheets.enc）も置く。
        #        シートの平文（.jpg）は置かない
        root = top / "f"
        root.mkdir()
        box = Box(root, env)
        job = box.checkout("job")
        dest = "vidF/clips"

        def light(s: Path) -> None:
            (s / "sheets.key.enc").write_bytes(os.urandom(384))
            (s / "sheets.enc").write_bytes(os.urandom(2048))

        rt = sealed(root, "f")
        light(rt / "sealed")
        r = run_push(job, job_env(env, rt, dest))
        tip = box.tip()
        check(r.returncode == 0 and tip is not None
              and box.files(tip, f"shorts/.work/{dest}") == on_disk(rt)
              and {"sheets.key.enc", "sheets.enc"} <= set(on_disk(rt)),
              f"f. 見る用の小さな封（sheets.key.enc・sheets.enc）も一緒に置く（{tail(r)}）")
        rt2 = sealed(root, "f2")
        light(rt2 / "sealed")
        (rt2 / "sealed" / "01_01.jpg").write_bytes(b"\xff\xd8")
        before = box.refs()
        r = run_push(job, job_env(env, rt2, dest))
        check(r.returncode != 0 and box.refs() == before and "置かないはずのもの" in r.stdout,
              f"f. シートの平文（01_01.jpg）が混ざったら何も push しない（{tail(r)}）")

        # --- g. 字幕だけの道（captions の job）。1つの job で何本も封をするので、
        #        置き場ごとに SEALED で指して続けて置く。2本とも枝に残る。指した置き場が無ければ置かない
        root = top / "g"
        root.mkdir()
        box = Box(root, env)
        job = box.checkout("job")
        rt = root / "rt-g"
        caps: dict[str, Path] = {}
        for v in ("vidG1", "vidG2"):
            s = rt / "sealed-captions" / f"{v}__captions"
            s.mkdir(parents=True)
            (s / "manifest.json").write_text(json.dumps({"key": f"{v}__captions"}), encoding="utf-8")
            (s / "key.enc").write_bytes(os.urandom(384))
            (s / "payload.enc").write_bytes(os.urandom(2048))
            caps[v] = s
        rcs = [run_push(job, dict(job_env(env, rt, f"{v}/captions"), SEALED=str(s))).returncode
               for v, s in caps.items()]
        tip = box.tip()
        check(rcs == [0, 0] and tip is not None and all(
            box.files(tip, f"shorts/.work/{v}/captions")
            == {p.name: p.read_bytes() for p in s.iterdir()} for v, s in caps.items()),
            f"g. SEALED で指した置き場を、続けて2本とも置く（{rcs}）")
        before = box.refs()
        r = run_push(job, dict(job_env(env, rt, "vidG3/captions"), SEALED=str(rt / "nope")))
        check(r.returncode != 0 and box.refs() == before and "封の置き場が無い" in r.stdout,
              f"g. SEALED の置き場が無ければ何も push しない（{tail(r)}）")

    print(f"\nNG  作業枝に置く見張り {len(fails)}件落ちた" if fails else "\nOK  作業枝に置く見張り 全部通った")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
