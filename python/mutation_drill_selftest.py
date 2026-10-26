"""**対照を当てる道具（`python/mutation_drill.py`）が、壊れていないか。**

    python3 python/mutation_drill_selftest.py

    BREAK=noguard  python3 python/mutation_drill_selftest.py  # 鍵と混み見を外す
    BREAK=noback   python3 python/mutation_drill_selftest.py  # 戻しを外す
    BREAK=plan     python3 python/mutation_drill_selftest.py  # 当てる先を0本にする
    BREAK=stalepyc python3 python/mutation_drill_selftest.py  # 子に空の pyc の置き場を渡さない
    BREAK=gate     python3 python/mutation_drill_selftest.py  # 本体の門もひっくり返す

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**（`docs/island-standards.md` §15）。

**実物は1バイトも壊さない。** 作り物の置き場と、道具の `--self-drill` と
`--list` だけを触る。本物に当てるのは `.github/workflows/mutation_drill.yml`
（手で押す口）の仕事。

## ここが見るもの

道具の中身は `--self-drill` が毎回見ている（緑のままのものを見つけられるか）。
**ここが見るのは、その外側の約束**——壊したものが戻ること・並べて回さないこと・
当てる先を数えられること。どれも、**外れても道具は緑を返してしまう。**

  1. `--self-drill` が通る（道具の中身）
  2. **壊したものが戻る**（作り物の置き場で、わざと壊して戻す）
  3. **鍵がある**（2本目は走れない）
  4. **混んでいたら当てない**（`busy()` が同じ置き場の相手を拾う）
  5. **当てる先が0本なら 2**（「ぜんぶ対照がある」と言わない）
  6. `--list` が、本物の置き場で1本以上並べられる（分母）
  7. **古い pyc を読まない**（元と時刻・大きさが同じで中身だけ違う pyc があっても、
     見張りは元の字で判定される。書き換えて戻したのが同じ1秒・同じ大きさでも）
  8. **本体の門はひっくり返さない**（`if __name__ == "__main__":` と、mjs の
     `import.meta.url` / `process.argv[1]` を比べる行。逆さにすると、見張りが
     `import` しただけで main が走る。門しか比べるところが無い本体は「壊すところが無い」）
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import mutation_drill as MD  # noqa: E402

BREAK = os.environ.get("BREAK", "")
FAILED: list[str] = []
CHECKED = 0

if BREAK == "noguard":
    MD.take_lock = lambda: object()      # type: ignore
    MD.busy = lambda: []                 # type: ignore
if BREAK == "noback":
    MD.restore = lambda rel: True        # type: ignore
if BREAK == "plan":
    MD.plan = lambda only, names: []     # type: ignore
if BREAK == "stalepyc":
    MD.FRESH_PYC = False                 # type: ignore
    # 外（回し役）から渡された置き場と「書かない」も外す。残すと、そちらが守りの代わりをして
    # 対照にならない（回し役は回ごとに置き場を渡している）
    os.environ.pop("PYTHONPYCACHEPREFIX", None)
    os.environ.pop("PYTHONDONTWRITEBYTECODE", None)
if BREAK == "gate":
    MD.KEEP_GATE = False                 # type: ignore


def ok(name: str, got, want) -> None:
    """1つ確かめる。

    **落ちたら `::error::` を出す。** これが無いと、CI の要約には
    「`mutation_drill_selftest.py`（終了コード 1）」としか出ず、
    **どの足が落ちたのかが1文字も読めない**（2026-10-13 に、手元で緑・
    CI で赤のまま1往復むだにした）。ほかの見張りは出している。
    """
    global CHECKED
    CHECKED += 1
    if got == want:
        print(f"  ○ {name}: {got}")
        return
    FAILED.append(name)
    print(f"  ✕ {name}: {got}（欲しかったのは {want}）")
    # 表の区切りと改行は、GitHub の注記では1行に畳む
    flat = f"{name}: 出た={got!r} / 欲しかったのは={want!r}"
    print("::error::" + " ".join(str(flat).split())[:900])


print("[1] 道具の中身（`--self-drill`）")
r = subprocess.run([sys.executable, str(HERE / "mutation_drill.py"),
                    "--self-drill"], capture_output=True, text=True,
                   timeout=300, check=False)
ok("`--self-drill` が通る", r.returncode, 0)
ok("「緑のままのものを見つけられる」と言っている",
   "緑のままのものを見つけられる" in r.stdout, True)


print("[2] 壊したものが戻る（作り物の置き場で）")
with tempfile.TemporaryDirectory() as tmp:
    box = Path(tmp)
    subprocess.run(["git", "init", "-q", str(box)], check=False)
    f = box / "a.py"
    f.write_text("X = 1 == 1\n", encoding="utf-8")
    subprocess.run(["git", "-C", str(box), "add", "a.py"], check=False)
    subprocess.run(["git", "-C", str(box), "-c", "user.name=t",
                    "-c", "user.email=t@t", "commit", "-qm", "x"], check=False)
    old_repo = MD.REPO
    MD.REPO = box
    try:
        f.write_text("X = 1 != 1\n", encoding="utf-8")
        back = MD.restore("a.py")
        ok("`git checkout --` で戻せる", back, True)
        ok("戻った字が元のまま", f.read_text(encoding="utf-8"), "X = 1 == 1\n")
        f.write_text("X = 2\n", encoding="utf-8")
        ok("汚れているファイルを見つけられる", "a.py" in MD.dirty(), True)
        MD.restore("a.py")
    finally:
        MD.REPO = old_repo


print("[3] 並べて回さない（**使い捨ての鍵で見る**）")
# **本物の鍵は使わない。**
#
# 前はここで `MD.take_lock()` を呼んで「鍵が取れる」を確かめていた。
# あれは**この箱にいま残り物が無いこと**を確かめていたのであって、
# 道具の良し悪しではない。実際、前の回の `mutation_drill.py` が1本
# 残っているだけで必ず赤くなり、CI でもこの箱でも落ちた。
# **満たしようのない見張り**で、§13 の形そのもの。
#
# 確かめたいのは「**同じ置き場で2本は走れない**」こと。
# それは使い捨ての鍵と、本物の子プロセス2本で決まりがつく。
# （`fcntl.flock` は**同じプロセスが2回 open すれば自分とも衝突する**ので、
#  手元で `take_lock()` を2回呼んで確かめると嘘の緑／嘘の赤が出る。
#  **必ず別のプロセスで測る。**）
with tempfile.TemporaryDirectory() as tmp:
    key = Path(tmp) / "k"
    env = dict(os.environ, MUTATION_DRILL_LOCK=str(key))
    drill = str(HERE / "mutation_drill.py")
    # **わざと長い道から起こす。**
    # 「誰が握っているか」の行は旗（`--probe-lock`）で見分けている。
    # 手元の命令は 89文字で、`holder()` の切り落とし 90文字に**1文字だけ**
    # 収まっていたので、CI（道が長くて 140文字）でだけ落ちていた。
    # ここで道を伸ばしておけば、同じ切り落としを入れた人は**手元で落ちる**。
    longdir = Path(tmp) / ("x" * 60)
    longdir.mkdir()
    longpy = longdir / "python3"
    try:
        longpy.symlink_to(sys.executable)
        runner = str(longpy)
    except OSError:
        runner = sys.executable  # symlink を張れない箱では諦める（短いまま）
    first = subprocess.Popen([runner, drill, "--probe-lock", "20"],
                             stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                             text=True, env=env)
    try:
        # 1本目が握るまで待つ（握ったら1行出す）
        got = ""
        for _ in range(80):
            line = first.stdout.readline()
            if line:
                got = line
                break
            if first.poll() is not None:
                break
        ok("1本目が鍵を取れる", "を取った" in got, True)

        second = subprocess.run([sys.executable, drill, "--probe-lock", "0"],
                                capture_output=True, text=True, timeout=120,
                                check=False, env=env)
        ok("握られているあいだ、2本目は 2 で帰る", second.returncode, 2)
        ok("**誰が握っているかを名指しで出す**",
           "--probe-lock" in second.stdout, True)
    finally:
        first.kill()
        first.wait(timeout=30)

    # 1本目が死ねば、鍵は空く（fd が閉じれば解ける）
    third = subprocess.run([sys.executable, drill, "--probe-lock", "0"],
                           capture_output=True, text=True, timeout=120,
                           check=False, env=env)
    ok("握っていたものが死ねば、次は取れる", third.returncode, 0)

# **本物の鍵そのものも、取れなければ 2 で帰ることだけは見ておく。**
# ただし「いま取れること」は確かめない（箱の都合なので）
ok("本物の鍵の置き場が決まっている", str(MD.LOCK).endswith(".lock"), True)


print("[4] 混んでいたら当てない")
# 見張りの顔をした子を、**この置き場を cwd にして**わざと走らせる。
# 置くのは外（`python/` に置くと、回し役がそれを拾ってしまう）
import time  # noqa: E402

with tempfile.TemporaryDirectory() as tmp:
    # **名前をわざと長くしてある。**
    # 前は `ps -eo pid,args` を読んでいて、**端末でないところへ出すと
    # 80桁で切る**版があった。CI の道（`/opt/hostedtoolcache/…/python3` ＋
    # 一時の道）は 114 文字あり、見分けに使う `_selftest.py` が切れて
    # 「誰も走っていない」と読めていた。手元の道は短くて切れないので緑だった。
    # **どの箱でも 80 桁を超える名前**にして、同じ外し方が戻ってきたら
    # ここで落ちるようにする
    probe = Path(tmp) / ("_drill_busy_probe_" + "x" * 90 + "_selftest.py")
    probe.write_text("import time\ntime.sleep(20)\n", encoding="utf-8")
    child = subprocess.Popen([sys.executable, str(probe)], cwd=MD.REPO,
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        # `ps` に出るまでの間がある。出るまで少し待つ
        seen: list[str] = []
        for _ in range(40):
            seen = MD.busy()
            if any("_drill_busy_probe_selftest.py" in s for s in seen):
                break
            time.sleep(0.25)
        hit = any("_drill_busy_probe_" in s for s in seen)
        if not hit:
            # 落ちたときに**何が見えていたか**を出す。出さないと、
            # CI で落ちた人が「拾えない」としか分からない
            print(f"     （`busy()` が見たもの {len(seen)}件 / "
                  f"当てた名前の長さ {len(str(probe))} 文字）")
            for s in seen[:5]:
                print(f"       {s}")
        ok("同じ置き場で走っている見張りを拾える（長い名前でも切れない）",
           hit, True)
        # **別の置き場の相手は拾わない**（worktree を切って並行で作業するので）
        other = subprocess.Popen([sys.executable, str(probe)], cwd=tmp,
                                 stdout=subprocess.DEVNULL,
                                 stderr=subprocess.DEVNULL)
        try:
            time.sleep(1.0)
            pids = {s.split()[1] for s in MD.busy()}
            ok("別の置き場で走っている相手には止められない",
               str(other.pid) in pids, False)
        finally:
            other.kill()
            other.wait(timeout=30)
    finally:
        child.kill()
        child.wait(timeout=30)


print("[5] 当てる先が0本なら 2")
ok("`plan()` が空なら「ぜんぶ対照がある」と言わない",
   MD.plan(None, ["python/does_not_exist_selftest.py"]), [])


print("[6] 本物の置き場で、当てる先を並べられる（分母）")
rows = MD.plan(None, [])
if not rows:
    print("✕ 当てる先を1本も並べられなかった。**数字は1つも出さない**")
    print("::error::当てる先を1本も並べられなかった"
          "（`selftest_runner.py --list --json` が読めていない）")
    sys.exit(2)
hit = [r for r in rows if not r.get("skip")]
print(f"  ○ 並べた {len(rows)}本 / そのうち当てられる {len(hit)}本")
CHECKED += 1
ok("当てられるものが1本以上ある", len(hit) > 0, True)
ok("当てかたは py / mjs / repo のどれか",
   sorted({r["kind"] for r in hit}) and
   all(r["kind"] in ("py", "mjs", "repo") for r in hit), True)


print("[7] 古い pyc を読まない（元と時刻・大きさが同じで、中身だけ違う pyc）")
# 2026-10-23 に手で `>` を `<` にして同じ1秒で戻したら、書き換えたほうの pyc が
# `python/__pycache__` に残り、`recipe_lag_watch.py` が3日、何も見ずに「遅れ0件」を返した。
# Python は pyc の記録（時刻の秒・大きさ）しか見ないので、同じ長さの書き換えは見分けられない。
# 道具の `attempt()` も「書き換える → 回す → `git checkout --` で戻す」なので、同じ形になりうる
import selftest_runner as SR  # noqa: E402  毒の置きかたは回し役の対照と1つにしておく

with tempfile.TemporaryDirectory() as tmp:
    box = Path(tmp)
    judge = box / "judge.py"
    judge.write_text(SR._JUDGE, encoding="utf-8")
    (box / "judge_selftest.py").write_text(SR._JUDGE_TEST, encoding="utf-8")
    old_repo = MD.REPO
    MD.REPO = box
    try:
        # (a) 前の誰かが置いていった毒
        cache = SR.plant_stale_pyc(judge, SR._JUDGE_BAD)
        ok("置いていった毒の pyc があっても、元の字で判定する",
           MD.run_watch("judge_selftest.py"), 0)
        cache.unlink()
        # (b) 当てているあいだにできる毒。同じ長さに書き換えて回し、同じ時刻で元に戻す
        judge.write_text(SR._JUDGE_BAD, encoding="utf-8")
        t = judge.stat()
        ok("書き換えたほうでは赤", MD.run_watch("judge_selftest.py"), 1)
        judge.write_text(SR._JUDGE, encoding="utf-8")
        os.utime(judge, ns=(t.st_atime_ns, t.st_mtime_ns))
        ok("同じ時刻・同じ大きさで戻したあと、戻した字で判定する",
           MD.run_watch("judge_selftest.py"), 0)
        ok("子が置き場の `__pycache__` に pyc を残していない", cache.exists(), False)
    finally:
        MD.REPO = old_repo


print("[8] 本体の門はひっくり返さない")
# 門を逆さにすると、見張りが本体を `import` しただけで main が走る。2026-10-26 に
# `recipe_lag_watch_selftest.py` がその `sys.exit(0)` で判定を1つも出さずに緑で終わり、
# `comments_pull_selftest.py` がリポジトリの直下に `out/comments.json` を残した
import ast  # noqa: E402

GATE_ONLY = 'def main():\n    return 0\n\n\nif __name__ == "__main__":\n    main()\n'
ok("門しか比べるところが無い本体は「壊すところが無い」", MD.mutate_py(GATE_ONLY), None)
BOTH = 'def f(x):\n    return x == 1\n\n\nif __name__ == "__main__":\n    f(1)\n'
got = MD.mutate_py(BOTH)
ok("門と本物の比較がある本体で、ひっくり返す数", got[1] if got else None, 1)
ops = sorted((type(n.ops[0]).__name__, MD.is_gate(n))
             for n in ast.walk(ast.parse(got[0] if got else BOTH))
             if isinstance(n, ast.Compare))
ok("ひっくり返ったのは本物の比較だけ（演算子, 門か）", ops, [("Eq", True), ("NotEq", False)])

JS_GATE_LINE = "if (import.meta.url === `file://${process.argv[1]}`) process.exit(main());\n"
ok("mjs: 門の行はそのままで、本物の等しさだけひっくり返る",
   MD.mutate_js("export const f = (x) => x === 1;\n" + JS_GATE_LINE),
   ("export const f = (x) => x !== 1;\n" + JS_GATE_LINE, 1))
# 数字の1つ動かし（定数の表のための逃げ道）も、門の `process.argv[1]` には当てない
ok("mjs: 門の行しか比べるところが無ければ「壊すところが無い」",
   MD.mutate_js('function main() { return "ok"; }\n' + JS_GATE_LINE), None)


print("[9] 対照（この見張りが、落ちるときに落ちるか）")
if not BREAK:
    bad = []
    for leg in ("noguard", "noback", "plan", "stalepyc", "gate"):
        rr = subprocess.run([sys.executable, str(Path(__file__).resolve())],
                            capture_output=True, text=True, timeout=900,
                            env=dict(os.environ, BREAK=leg), check=False)
        mark = "○" if rr.returncode != 0 else "✕"
        if rr.returncode == 0:
            bad.append(leg)
        print(f"  {mark} BREAK={leg} → 終了コード {rr.returncode}（0 でなければよい）")
    if bad:
        FAILED.append("対照: " + " / ".join(bad) + " を抜いても緑のまま")
    CHECKED += 5

print()
if CHECKED == 0:
    print("✕ 1つも数えなかった。**「通りました」とは言わない**")
    print("::error::対照の道具の見張りが、1つも数えなかった")
    sys.exit(2)
if FAILED:
    print(f"✕ {CHECKED}件みて、{len(FAILED)}件 落ちた")
    for n in FAILED:
        print(f"   - {n}")
    print("::error::対照の道具の見張りが "
          f"{len(FAILED)}件 落ちた: " + " / ".join(FAILED)[:800])
    sys.exit(1)
print(f"○ {CHECKED}件ぜんぶ通った")
sys.exit(0)
