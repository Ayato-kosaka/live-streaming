"""`python/disk_guard.py` の見張り。

    python3 python/disk_guard_selftest.py

**この見張りは本物の置き場を触らない。** 作り物の木を建てて、そこだけ見る。
本物を掃いてしまうと、並んで走っている担当のビルドが壊れる。

## 対照

数えるだけの道具は、数えかたが壊れると静かに通る。**先に落ちることを見る。**

  noage … 「古いものだけ」をやめて、触られたばかりの書き出しまで拾う
          → 走っているビルドを掃いてしまう。拾ってはいけない
  nofloor … 下限に届かなくても 0 で帰る → ビルドが途中で尽きる

終了コード 0=通った / 1=落ちた。
"""

import os
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import disk_guard as DG  # noqa: E402

BREAK = os.environ.get("BREAK", "")
bad = 0


def ok(name, got, want):
    global bad
    good = got == want
    print(f"  {'○' if good else '✕'} {name}: {got}" + ("" if good else f"（欲しかったのは {want}）"))
    if not good:
        bad += 1
        print(f"::error::{name}: 出た={got} / 欲しかったのは={want}")


def tree(root: Path, spec: dict) -> None:
    """`{相対の道: (MB, 何時間前に触ったか)}` で作り物を建てる。"""
    for rel, (mb, hours) in spec.items():
        d = root / rel
        d.mkdir(parents=True, exist_ok=True)
        (d / "blob").write_bytes(b"\0" * (mb * 1024 * 1024))
        t = time.time() - hours * 3600
        os.utime(d, (t, t))


print("[1] 掃いてよいものだけを拾う")
with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    tree(root, {
        "wt-a/site/.next": (3, 10),          # 古い開発サーバーの置き土産 → 掃く
        "wt-b/site/.next-3130": (2, 5),      # 古い書き出し → 掃く
        "wt-c/site/.next-3140": (2, 0.1),    # **いま走っている** → 触らない
        "wt-d/site/content": (2, 10),        # 手で書いたもの → 触らない
        "wt-e/.next": (2, 10),               # site/ の下ではない → 触らない
    })
    stale = 0 if BREAK == "noage" else DG.STALE_SEC
    got = {str(d.relative_to(root)) for d, _, _ in DG.builds(roots=[str(root)], stale_sec=stale)}

    ok("古い書き出しを拾う", "wt-a/site/.next" in got, True)
    ok("古い書き出しを拾う（ポート付き）", "wt-b/site/.next-3130" in got, True)
    # **ここが対照の当たり所。** 「古いものだけ」をやめると、走っている
    # ビルドの書き出し先まで拾って、そのビルドを壊す
    ok("**走っているビルドの書き出しは拾わない**", "wt-c/site/.next-3140" in got, False)
    ok("手で書いたものは拾わない", "wt-d/site/content" in got, False)
    ok("site/ の下でないものは拾わない", "wt-e/.next" in got, False)

print("[2] 大きい順に並ぶ（掃くなら効くものから）")
with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    tree(root, {"a/site/.next": (1, 10), "b/site/.next": (4, 10), "c/site/.next": (2, 10)})
    mbs = [mb for _, mb, _ in DG.builds(roots=[str(root)])]
    ok("大きい順", mbs == sorted(mbs, reverse=True), True)

print("[3] --dry では消さない")
with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    tree(root, {"a/site/.next": (1, 10)})
    items = DG.builds(roots=[str(root)])
    DG.sweep(items, dry=True)
    ok("--dry のあとも在る", (root / "a/site/.next").is_dir(), True)
    DG.sweep(items, dry=False)
    ok("本気のときは消える", (root / "a/site/.next").is_dir(), False)

print("[4] 足りなければ 2 で帰る（ビルドを始めない）")
# 下限を「いまの空き + 1TB」にすれば、掃いても絶対に届かない。
# **本物の掃除はしたくない**ので、拾う先を空の木に差し替えて呼ぶ
real_roots = DG.ROOTS
with tempfile.TemporaryDirectory() as tmp:
    # **先に、差し替えが効くことを確かめる。**
    # 一度ここで滑って、作り物だけ見ているつもりの見張りが**本物の置き場を
    # 掃いた**（`builds(roots=ROOTS, …)` の既定が読み込んだ瞬間に束ねられる）。
    # 「掃かなかったはず」を信じず、**掃く相手の名前を見てから**呼ぶ。
    tree(Path(tmp), {"mark/site/.next": (1, 10)})
    DG.ROOTS = (tmp,)
    try:
        seen = [str(d) for d, _, _ in DG.builds()]
        ok("差し替えた先だけを見ている", all(s.startswith(tmp) for s in seen) and len(seen) == 1, True)

        sys.argv = ["disk_guard.py", "--floor-mb", str(DG.free_mb() + 1024 * 1024)]
        code = DG.main()
    finally:
        DG.ROOTS = real_roots
    ok("掃いても届かなければ 2", code, 0 if BREAK == "nofloor" else 2)
    if BREAK != "nofloor":
        ok("**足りないまま 0 を返さない**", code != 0, True)

print("[5] 足りていれば、何も掃かずに 0")
sys.argv = ["disk_guard.py", "--floor-mb", "1"]
ok("足りていれば 0", DG.main(), 0)

print("" if bad else "")
print(f"{'✕ ' + str(bad) + '件 落ちた' if bad else '○ ぜんぶ通った'}")
sys.exit(1 if bad else 0)
