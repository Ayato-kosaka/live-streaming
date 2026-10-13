"""**対照を当てる道具（`python/mutation_drill.py`）が、壊れていないか。**

    python3 python/mutation_drill_selftest.py

    BREAK=noguard  python3 python/mutation_drill_selftest.py  # 鍵と混み見を外す
    BREAK=noback   python3 python/mutation_drill_selftest.py  # 戻しを外す
    BREAK=plan     python3 python/mutation_drill_selftest.py  # 当てる先を0本にする

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


def ok(name: str, got, want) -> None:
    global CHECKED
    CHECKED += 1
    if got == want:
        print(f"  ○ {name}: {got}")
        return
    FAILED.append(name)
    print(f"  ✕ {name}: {got}（欲しかったのは {want}）")


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
    first = subprocess.Popen([sys.executable, drill, "--probe-lock", "20"],
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
    probe = Path(tmp) / "_drill_busy_probe_selftest.py"
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
        ok("同じ置き場で走っている見張りを拾える",
           any("_drill_busy_probe_selftest.py" in s for s in seen), True)
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
    sys.exit(2)
hit = [r for r in rows if not r.get("skip")]
print(f"  ○ 並べた {len(rows)}本 / そのうち当てられる {len(hit)}本")
CHECKED += 1
ok("当てられるものが1本以上ある", len(hit) > 0, True)
ok("当てかたは py / mjs / repo のどれか",
   sorted({r["kind"] for r in hit}) and
   all(r["kind"] in ("py", "mjs", "repo") for r in hit), True)


print("[7] 対照（この見張りが、落ちるときに落ちるか）")
if not BREAK:
    bad = []
    for leg in ("noguard", "noback", "plan"):
        rr = subprocess.run([sys.executable, str(Path(__file__).resolve())],
                            capture_output=True, text=True, timeout=900,
                            env=dict(os.environ, BREAK=leg), check=False)
        mark = "○" if rr.returncode != 0 else "✕"
        if rr.returncode == 0:
            bad.append(leg)
        print(f"  {mark} BREAK={leg} → 終了コード {rr.returncode}（0 でなければよい）")
    if bad:
        FAILED.append("対照: " + " / ".join(bad) + " を抜いても緑のまま")
    CHECKED += 3

print()
if CHECKED == 0:
    print("✕ 1つも数えなかった。**「通りました」とは言わない**")
    sys.exit(2)
if FAILED:
    print(f"✕ {CHECKED}件みて、{len(FAILED)}件 落ちた")
    for n in FAILED:
        print(f"   - {n}")
    sys.exit(1)
print(f"○ {CHECKED}件ぜんぶ通った")
sys.exit(0)
