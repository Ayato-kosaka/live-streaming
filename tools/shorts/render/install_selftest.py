"""書き出しの Actions（shorts_render.yml）の「道具を入れる」が、止まったまま待たないかの見張り。
**GitHub にも GCS にも触らない。**

    python3 tools/shorts/render/install_selftest.py
    BREAK=pip python3 tools/shorts/render/install_selftest.py   # 守りを1つ外した版で回す（対照の子）

終了コード 0=通った / 1=落ちた / **2=数えるものが無い・外す字が見つからない**
（`docs/island-standards.md` §15）。

## なぜ要るか

2026-10-23 のフォカッチャの回（run 39884210053）で、本体の job だけが「道具を入れる（作業箱と同じ版）」で
21分止まった（双子は同じ段を数十秒で抜け、取り消して回し直すと通った）。apt も pip も黙って待ち続け、
job の上限（40分）まで誰も切らない。取り込み（shorts_ingest.yml）に入れた retry.sh・ffmpeg.sh を、
書き出しも写さずに呼ぶ。**呼ばなくなっても、上限を外しても、赤くならずに遅くなるだけ**なので、ここで数える。

retry.sh・ffmpeg.sh そのものの振る舞い（上限で切る・1回だけ取り直す・静的ビルドへ切り替える）は、
取り込みの見張り（tools/shorts/ingest/quick_captions_selftest.py の retry・ffmpeg）が当てている。
ここは**書き出しの側の繋ぎ**と、書き出しだけが持つ道具（書体の取り寄せ・下見の npm・ffmpeg の版の控え）を見る。

回し役（`python/selftest_runner.py`）が `tools/shorts/` を降りて拾う。要るのは PyYAML と bash・curl の偽物を
置ける一時フォルダだけ（ffmpeg も npm も使わない。どれも偽物）。

## 何を見るか

| 足 | 確かめること |
| --- | --- |
| `workflow` | prepare・render・report の「道具を入れる」に段の `timeout-minutes` があり、apt・pip・npm・curl・書体の取り寄せを全部 retry.sh（`$R 秒 …`）に通す。render の ffmpeg は ffmpeg.sh で入れ、apt-get を直に呼ばない。retry.sh・ffmpeg.sh が呼んでいる道に在り、checkout の sparse-checkout がそこを取る |
| `fonts` | fetch_fonts.sh（偽の curl で）: 1本ごとに `--max-time` がある・途中で切れたものを本物の名前で残さない（取り直しの `[ -s ]` が「在る」と読んで飛ばさない）・落とし切れば本物の名前になる |
| `npm` | remote.py の wait_tools（下見の firebase-tools・playwright-core）: 通れば1回だけ・止まったら上限で切って1回だけ入れ直す・2回とも駄目なら偽で返る（report ごと20分待って落ちない） |
| `ffver` | ffmpeg の版を `ffmpeg -version` から読み、要約に本体と双子の版を載せ、作業箱の版（6.1.1）でない job があれば `fetch` の要約が「!! ffmpeg が作業箱と違う版」と言う |

## 守りを1つずつ外す（§15「対照は、足の数だけ用意する」）

下の `CUTS` が本物の字を1か所だけ書き換えた写しを作り、それで足を全部回す。**外した守りの足だけが落ちる**
ことを確かめる。外す字が本物に見つからなければ 2 で落ちる（字を直したのに、ここを直し忘れた）。
"""

from __future__ import annotations

import contextlib
import importlib
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import traceback
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
WF_REL = ".github/workflows/shorts_render.yml"
BREAK = os.environ.get("BREAK", "")
JOBS = ("prepare", "render", "report")
INSTALL_PREFIX = "道具を入れる"
RETRY_LINE = 'R="bash tools/shorts/ingest/retry.sh"'
# 上限なしで走らせてはいけないもの（道具を外から取ってくるコマンド）
FETCHERS = ("apt-get ", "pip install", "npm ", "git clone", "curl ", "fetch_fonts.sh")

# 外す守り: 名前 → (ファイル（render の階か、リポジトリの根からの道）, 本物の字, 書き換えた字, 落ちるはずの足, 何を外すか)
CUTS: dict[str, tuple[str, str, str, set[str], str]] = {
    "step_limit": (WF_REL, "        timeout-minutes: 15\n", "",
                   {"workflow"}, "render の「道具を入れる」から段の上限を外す"),
    "apt": (WF_REL, "          bash tools/shorts/ingest/ffmpeg.sh\n",
            "          sudo apt-get install -y -qq --no-install-recommends ffmpeg\n",
            {"workflow"}, "render の ffmpeg を上限なしの apt-get に戻す"),
    "pip": (WF_REL, "          $R 300 python3 -m pip install", "          python3 -m pip install",
            {"workflow"}, "render の pip を retry.sh に通さない"),
    "part": ("fetch_fonts.sh", '-o "$1.part" "$2" && mv "$1.part" "$1"', '-o "$1" "$2"',
             {"fonts"}, "書体を本物の名前に直に落とす（切れたものが残る）"),
    "maxtime": ("fetch_fonts.sh", "--max-time 120 ", "",
                {"fonts"}, "書体の1本ごとの上限を外す"),
    "npm_once": ("remote.py", "    for n in (1, 2):\n", "    for n in (1,):\n",
                 {"npm"}, "下見の npm が止まっても入れ直さない"),
    "npm_limit": ("remote.py", "if p.wait(timeout=limit) == 0:", "if p.wait() == 0:",
                  {"npm"}, "下見の npm を上限なしで待つ"),
    "ffrec": ("remote.py", '"ffmpeg": {"main": it.get("ffmpeg")', '"ffmpeg": {"main": None',
              {"ffver"}, "要約に本体の ffmpeg の版を載せない"),
    "ffwarn": ("remote.py", "        if odd:\n", "        if False:\n",
               {"ffver"}, "作業箱と違う版でも黙る"),
}


class Ctx:
    """足に渡すもの。render（書き出しの階）・root（ワークフローの根）・tmp（使い捨て）。"""

    def __init__(self, render: Path, root: Path, tmp: Path):
        self.render, self.root, self.tmp = render, root, tmp
        sys.path.insert(0, str(render))
        self.remote = importlib.import_module("remote")


def fake_bin(d: Path, name: str, body: str) -> None:
    d.mkdir(parents=True, exist_ok=True)
    (d / name).write_text("#!/bin/bash\n" + body)
    (d / name).chmod(0o755)


# ---------------------------------------------------------------- 足

def leg_workflow(c: Ctx) -> list[str]:
    import yaml

    bad = []
    doc = yaml.safe_load((c.root / WF_REL).read_text(encoding="utf-8"))
    jobs = doc.get("jobs") or {}
    for script in ("retry.sh", "ffmpeg.sh"):
        if not (c.root / "tools/shorts/ingest" / script).is_file():
            bad.append(f"tools/shorts/ingest/{script} が無い（ワークフローが呼ぶ道）")
    for jn in JOBS:
        job = jobs.get(jn) or {}
        steps = job.get("steps") or []
        st = [s for s in steps if str(s.get("name", "")).startswith(INSTALL_PREFIX)]
        if not st:
            bad.append(f"{jn} に「{INSTALL_PREFIX}」の段が無い")
            continue
        lim = st[0].get("timeout-minutes")
        if not lim:
            bad.append(f"{jn} の「{st[0]['name']}」に timeout-minutes が無い")
        elif job.get("timeout-minutes") and lim >= job["timeout-minutes"]:
            bad.append(f"{jn} の「{st[0]['name']}」の上限 {lim}分が job の上限 {job['timeout-minutes']}分より短くない")
        run = str(st[0].get("run"))
        if RETRY_LINE not in run:
            bad.append(f"{jn} の「{st[0]['name']}」が retry.sh を使っていない")
        for ln in run.splitlines():
            s = ln.strip()
            if not s or s.startswith("#"):
                continue
            if "tools/shorts/ingest/ffmpeg.sh" in s:
                continue
            if any(k in s for k in FETCHERS) and not s.startswith("$R "):
                bad.append(f"{jn}: 上限なしで走るコマンドがある（{s[:60]}）")
        if jn == "render":
            if "bash tools/shorts/ingest/ffmpeg.sh" not in run:
                bad.append("render が ffmpeg を ffmpeg.sh（入っていれば apt に触らない・詰まったら静的ビルド）で入れていない")
            if "fetch_fonts.sh" not in run:
                bad.append("render が書体を取り寄せていない（fetch_fonts.sh）")
        # retry.sh・ffmpeg.sh は sparse-checkout で取った木から呼ぶ。そこを外すと「無い」で落ちる
        co = next((s for s in steps if str(s.get("uses", "")).startswith("actions/checkout")), None)
        sparse = str(((co or {}).get("with") or {}).get("sparse-checkout") or "")
        if sparse:
            roots = [x.strip().rstrip("/") for x in sparse.splitlines() if x.strip()]
            if not any(r in ("tools", "tools/shorts", "tools/shorts/ingest") for r in roots):
                bad.append(f"{jn} の checkout が tools/shorts/ingest を取らない（{roots}）")
    return bad


def leg_fonts(c: Ctx) -> list[str]:
    """fetch_fonts.sh を、偽の curl（切れる・通る）で回す。本物の書体は落とさない。"""
    bad = []
    # 写しで回す（fetch_fonts.sh は自分の隣の fonts/ に落とす。本物の階に偽の書体を置かない）
    work = c.tmp / "fonts-box"
    work.mkdir(parents=True)
    shutil.copy(c.render / "fetch_fonts.sh", work / "fetch_fonts.sh")
    fake = c.tmp / "fonts-bin"
    log = c.tmp / "curl.log"
    # 偽の curl: 呼ばれた引数を控え、-o の先に何か書く。cut なら書きかけて 28（時間切れ）で落ちる
    fake_bin(fake, "curl", 'echo "$*" >> "$CURL_LOG"\n'
                           'out=""; while [ "$#" -gt 0 ]; do [ "$1" = -o ] && out="$2"; shift; done\n'
                           '[ -n "$out" ] || exit 2\n'
                           'printf "partial" > "$out"\n'
                           '[ "$CURL_MODE" = cut ] && exit 28\n'
                           'exit 0\n')

    def go(mode: str) -> tuple[int, list[str], list[str]]:
        shutil.rmtree(work / "fonts", ignore_errors=True)
        shutil.rmtree(work / "models", ignore_errors=True)
        log.write_text("")
        env = dict(os.environ, PATH=f"{fake}:{os.environ.get('PATH', '')}", CURL_LOG=str(log), CURL_MODE=mode)
        r = subprocess.run(["bash", str(work / "fetch_fonts.sh")], env=env, capture_output=True, text=True,
                           timeout=60)
        names = sorted(p.name for p in (work / "fonts").glob("*")) if (work / "fonts").is_dir() else []
        return r.returncode, names, log.read_text().splitlines()

    rc, names, calls = go("cut")
    if rc == 0:
        bad.append("curl が切れたのに 0 で帰った")
    left = [n for n in names if not n.endswith(".part")]
    if left:
        bad.append(f"切れた書体が本物の名前で残った（{left}。取り直しの `[ -s ]` が「在る」と読んで飛ばす）")
    if not calls or not all("--max-time" in x for x in calls):
        bad.append(f"書体の取り寄せに1本ごとの上限（--max-time）が無い（{calls[:1]}）")
    rc, names, calls = go("ok")
    # 偽の中身は sha256 が合わないので、M PLUS（確かめない2本）のあとの Kaisei で止まる。そこまでに名前が付くか
    if "MPLUSRounded1c-ExtraBold.ttf" not in names or "MPLUSRounded1c-Black.ttf" not in names:
        bad.append(f"落とし切った書体が本物の名前にならない（{names}）")
    return bad


def leg_npm(c: Ctx) -> list[str]:
    bad = []
    wt = c.remote.wait_tools

    def go(first: list[str], second: list[str]) -> tuple[bool, int, float]:
        n = {"again": 0}

        def again():
            n["again"] += 1
            return subprocess.Popen(second)

        t0 = time.time()
        with contextlib.redirect_stdout(io.StringIO()):
            ok = wt(subprocess.Popen(first), again, limit=1)
        return ok, n["again"], time.time() - t0

    hang = ["sleep", "12"]
    ok, n, _ = go(["true"], ["true"])
    if (ok, n) != (True, 0):
        bad.append(f"通ったのに入れ直した・真で返らない（{ok}・入れ直し {n}回）")
    ok, n, dt = go(hang, ["true"])
    if (ok, n) != (True, 1) or dt > 8:
        bad.append(f"止まった npm を上限で切って入れ直さない（{ok}・入れ直し {n}回・{dt:.0f}秒）")
    ok, n, dt = go(hang, hang)
    if (ok, n) != (False, 1) or dt > 8:
        bad.append(f"2回とも止まったのに偽で返らない・入れ直しが1回でない（{ok}・{n}回・{dt:.0f}秒）")
    ok, n, _ = go(["false"], ["true"])
    if (ok, n) != (True, 1):
        bad.append(f"落ちた npm を入れ直さない（{ok}・{n}回）")
    return bad


def leg_ffver(c: Ctx) -> list[str]:
    bad = []
    rm = c.remote
    fake = c.tmp / "ff-bin"
    fake_bin(fake, "ffmpeg", 'echo "ffmpeg version n8.0-static-fake Copyright (c) 2000-2025 the FFmpeg developers"\n')
    old = os.environ.get("PATH", "")
    os.environ["PATH"] = f"{fake}:{old}"
    try:
        v = rm.ffmpeg_version()
    finally:
        os.environ["PATH"] = old
    if v != "n8.0-static-fake":
        bad.append(f"ffmpeg -version の頭の行から版を読めない（{v!r}）")

    def rep(main: str, twin: str) -> dict:
        return {"name": "selftest", "status": "ok", "draft": False,
                "items": [{"id": "A", "status": "ok", "sha256": "0" * 64, "ffmpeg": main,
                           "twin": {"sha256": "0" * 64, "same": True, "ffmpeg": twin}}]}

    summ = rm.summary(rep("n8.0-static-fake", rm.WORKBOX_FFMPEG + "-3ubuntu5"))
    got = summ["items"][0].get("ffmpeg")
    if got != {"main": "n8.0-static-fake", "twin": rm.WORKBOX_FFMPEG + "-3ubuntu5"}:
        bad.append(f"要約に本体と双子の ffmpeg の版が載らない（{got}）")
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rm.print_summary(summ)
    line = next((ln for ln in buf.getvalue().splitlines() if "!! ffmpeg" in ln), "")
    if "main n8.0-static-fake" not in line or "twin" in line:
        bad.append(f"作業箱と違う版の job だけを「!! ffmpeg が作業箱と違う版」と言わない（{line.strip()[:80]!r}）")
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rm.print_summary(rm.summary(rep(rm.WORKBOX_FFMPEG + "-3ubuntu5", rm.WORKBOX_FFMPEG + "-3ubuntu5")))
    if "!! ffmpeg" in buf.getvalue():
        bad.append("作業箱と同じ版なのに「!! ffmpeg」と言った")
    return bad


LEGS = {"workflow": leg_workflow, "fonts": leg_fonts, "npm": leg_npm, "ffver": leg_ffver}


def run_legs(render: Path, root: Path, tmp: Path, quiet: bool = False) -> tuple[list[str], int]:
    c = Ctx(render, root, tmp)
    failed, checked = [], 0
    for name, fn in LEGS.items():
        try:
            bad = fn(c)
        except Exception:  # noqa: BLE001 — 1本の足が倒れても残りの足を回す
            bad = ["例外: " + traceback.format_exc().strip().splitlines()[-1]]
        checked += 1
        if not quiet:
            print(f"  {'○' if not bad else '✕'} {name}" + ("" if not bad else "  " + " / ".join(bad)))
        if bad:
            failed.append(name)
    return failed, checked


def cut_copy(name: str, tmp: Path) -> tuple[Path, Path]:
    """本物を写して、CUTS の1か所だけ書き換える。（render の階, 根）。

    写すのは足が読む3つ（ワークフロー・remote.py・fetch_fonts.sh）だけ。remote.py が読む隣の階
    （preview・ingest）と、ワークフローが呼ぶ retry.sh・ffmpeg.sh は本物を指す（書き換えないので）。
    """
    root = tmp / "repo"
    render = root / "tools/shorts/render"
    render.mkdir(parents=True)
    for f in ("remote.py", "fetch_fonts.sh"):
        shutil.copy(HERE / f, render / f)
    for d in ("preview", "ingest"):
        (root / "tools/shorts" / d).symlink_to(HERE.parent / d)
    (root / WF_REL).parent.mkdir(parents=True)
    shutil.copy(ROOT / WF_REL, root / WF_REL)
    rel, old, new, _, _ = CUTS[name]
    p = (root / rel) if "/" in rel else (render / rel)
    text = p.read_text(encoding="utf-8")
    if text.count(old) != 1:
        print(f"✕ 外す字が {rel} に {text.count(old)}か所（1か所のはず）: {old!r}")
        sys.exit(2)
    p.write_text(text.replace(old, new), encoding="utf-8")
    return render, root


def child(name: str) -> int:
    with tempfile.TemporaryDirectory() as td:
        render, root = cut_copy(name, Path(td))
        work = Path(td) / "work"
        work.mkdir()
        failed, checked = run_legs(render, root, work, quiet=False)
    print("LEGS_FAILED " + json.dumps(sorted(failed)))
    if checked == 0:
        return 2
    return 1 if failed else 0


def drill() -> list[str]:
    """守りを1つずつ外して、**その守りの足だけ**が落ちるかを見る"""
    print("[対照] 守りを1つずつ外すと、その足だけが落ちるか")
    bad = []
    for name, (_, _, _, want, why) in CUTS.items():
        env = dict(os.environ, BREAK=name)
        r = subprocess.run([sys.executable, str(Path(__file__).resolve())], capture_output=True,
                           text=True, env=env, timeout=240, check=False)
        line = [ln for ln in r.stdout.splitlines() if ln.startswith("LEGS_FAILED ")]
        got = set(json.loads(line[-1][len("LEGS_FAILED "):])) if line else None
        hit = got == want and r.returncode == 1
        print(f"  {'○' if hit else '✕'} BREAK={name}（{why}）→ 落ちた足 "
              f"{sorted(got) if got is not None else '（読めない: ' + (r.stdout + r.stderr).strip()[-300:] + '）'}"
              f"（欲しいのは {sorted(want)}）")
        if not hit:
            bad.append(name)
    return bad


def main() -> int:
    if BREAK:
        return child(BREAK)
    if not (ROOT / WF_REL).is_file():
        print(f"✕ {WF_REL} が無い。数えるものが無い")
        return 2
    print("[足] 本物で回す")
    with tempfile.TemporaryDirectory() as td:
        failed, checked = run_legs(HERE, ROOT, Path(td))
    print()
    bad = drill()
    print()
    if checked == 0:
        print("✕ 1つも数えなかった。**「通りました」とは言わない**")
        return 2
    if failed or bad:
        if failed:
            print(f"✕ 落ちた足: {' / '.join(failed)}")
        if bad:
            print(f"✕ 対照が外れた: {' / '.join(bad)}（外しても、その足だけが落ちる形になっていない）")
        print("\nNG  書き出しの道具を入れる段の見張り 落ちた")
        return 1
    print(f"○ {len(LEGS)}本の足が通り、守り {len(CUTS)}個を1つずつ外すと、その足だけが落ちた")
    print("\nOK  書き出しの道具を入れる段の見張り 全部通った")
    return 0


if __name__ == "__main__":
    sys.exit(main())
