"""**書き出す前に、置き場が残っているかを見る。**

    python3 python/disk_guard.py           # 見るだけ。足りなければ掃いてから、もう一度見る
    python3 python/disk_guard.py --sweep-only
    python3 python/disk_guard.py --floor-mb 3000

終了コード 0=足りている / 2=掃いても足りない（**ビルドを始めない**）。

## なぜ要るか（2026-10-14）

担当を10人並べた晩に、**箱の置き場が尽きた。** `df` は

    /dev/vda  252G  38G  4.7M  100% /

で、「252G のうち 38G しか使っていないのに空きが 4.7M」。この箱の置き場は
**使った量ではなく、与えられた枠**で決まる（`/home/user/live-streaming` の
手引きにも書いてある）。枠を使い切ると**書くほうだけが黙って失敗する。**
そのとき出たのは

    the temp filesystem at …/tasks is full (0MB free)

で、**ビルドの失敗ではなく、道具の出力が消えた。** 10人ぶんの作業が
いちどに、原因の見えない形で止まりかけた。

## 何を掃くか

**書き出したもの（`.next*`）だけ。** 手で書いたものには触らない。
しかも**しばらく触られていないもの**だけ（既定で2時間）。走っている
ビルドの書き出し先を消すと、そのビルドが壊れる。

実測（2026-10-14、この箱）:

| | 1つあたり | いくつあったか |
| --- | ---: | ---: |
| 書き出し（`next build` の `.next-<ポート>`） | **73MB** | 7 |
| 開発サーバー（`.next`） | **380〜441MB** | 14 |
| worktree そのもの（checkout + node_modules） | 177〜181MB | 40 |

**開発サーバーの置き土産が、書き出しの5倍重い。** 終わった担当の
`.next` が14個残っていて、それだけで 5.3GB あった。

## 下限を 2000MB にした理由

書き出し1本が 73MB、途中の仮置きを含めても数百MB。並んで3〜4本
走ることがあるので、**書き出し4本ぶん＋余白**で 2000MB。
`next build` が落ちるのは置き場が尽きた瞬間なので、**余白は広めに取る。**
狭くすると、掃いた直後にまた尽きる。
"""

import argparse
import os
import shutil
import sys
import time
from pathlib import Path

#: ここを下回ったらビルドを始めない（MB）。上の「下限を 2000MB にした理由」
FLOOR_MB = 2000

#: これより古い書き出しだけ掃く（秒）。走っているビルドを壊さないため
STALE_SEC = 2 * 60 * 60

#: 書き出しを探しに行く先。worktree はここの下に散らばる
ROOTS = ("/home/user", "/tmp/claude-0")


def free_mb(path: str = "/") -> int:
    """その置き場の空き（MB）。"""
    return shutil.disk_usage(path).free // (1024 * 1024)


def builds(roots=None, stale_sec: int = STALE_SEC, now: float | None = None) -> list[tuple[Path, int, float]]:
    """掃いてよい書き出しの一覧。`(道, MB, 最後に触られてからの秒)`。

    **`site/` の直下の `.next` か `.next-*` だけ。** 名前で拾うので、
    手で書いたものを巻き込まない。

    **`roots` の既定は呼ばれたときに読む。** `roots=ROOTS` と書いて
    既定に入れると、束ねられるのは**読み込んだ瞬間の値**で、見張りが
    `DG.ROOTS` を作り物に差し替えても効かない。実際にそれで、
    「作り物だけ見ているつもりの見張り」が**本物の置き場を掃いた**。
    消えたのが終わった担当の置き土産だったから被害は無かったが、
    走っている担当のものだったら、その人のビルドが壊れていた。
    """
    roots = ROOTS if roots is None else roots
    now = time.time() if now is None else now
    out = []
    for root in roots:
        r = Path(root)
        if not r.is_dir():
            continue
        for d in r.glob("**/site/.next*"):
            if not d.is_dir():
                continue
            try:
                age = now - d.stat().st_mtime
                if age < stale_sec:
                    continue
                mb = sum(f.stat().st_size for f in d.rglob("*") if f.is_file()) // (1024 * 1024)
            except OSError:
                continue
            out.append((d, mb, age))
    return sorted(out, key=lambda t: -t[1])


def sweep(items, dry: bool = False) -> int:
    """掃いて、空いた MB を返す。**消したものは必ず名前で出す。**"""
    got = 0
    for d, mb, age in items:
        print(f"  掃く {d}  {mb}MB  （{age / 3600:.1f}時間 触られていない）")
        if not dry:
            shutil.rmtree(d, ignore_errors=True)
        got += mb
    return got


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--floor-mb", type=int, default=FLOOR_MB)
    ap.add_argument("--stale-hours", type=float, default=STALE_SEC / 3600)
    ap.add_argument("--sweep-only", action="store_true", help="足りていても掃く")
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()

    before = free_mb()
    if before >= a.floor_mb and not a.sweep_only:
        print(f"置き場の空き {before}MB（下限 {a.floor_mb}MB）")
        return 0

    print(f"置き場の空きが {before}MB しかない（下限 {a.floor_mb}MB）。古い書き出しを掃きます")
    items = builds(stale_sec=int(a.stale_hours * 3600))
    if not items:
        print("  掃けるものが無い")
    got = sweep(items, dry=a.dry)
    after = free_mb()
    print(f"{got}MB ぶん掃いて、空きは {before}MB → {after}MB")

    if after < a.floor_mb:
        # **足りないまま始めない。** 途中で尽きると、落ちるのはビルドではなく
        # 道具の出力で、原因が見えなくなる（上の「なぜ要るか」）
        print(f"✕ 掃いても {a.floor_mb}MB に届かない。ビルドを始めません。"
              f"\n  終わった担当の worktree を畳んでください（git worktree remove）。"
              f"\n  開発サーバーの置き土産（site/.next）が 1つ 400MB あります", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
