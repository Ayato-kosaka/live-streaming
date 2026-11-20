"""**焼いた書体が入力（表と `subset.py`）に追いついているか**の判定（`tools/fonts/subset.py --stale`）を見張る。

    python3 python/fontstamp_selftest.py

終了コード 0=通った / 1=判定がずれた / 2=本物の置き場が読めない。

## なぜ要るか（2026-11-20）

焼いたもの（woff2・fonts.css）を PR に入れなくなった（`subset.py` の頭）。代わりに、PR の CI と
`fontbake.yml` と `heavy_watch.yml` の `guide` が、`--stale` を見て「焼くか」を決める。
**この判定が「追いついている」と嘘をつくと、PR の見張りは焼く前の古い束を見て通り**、
master には誰も焼かない（fontbake が帰る）——表に足した字が本番で端末の書体に落ちる。
逆に「古い」と嘘をつき続けると、毎 PR が1分焼く。どちらも黙って起きるので、ここで当てる。

当てる場面:

1. fonts.css が無い・「焼いた元」の行が無い → 古い
2. 焼いた元が表とこの道具の指紋と同じ → 追いついている
3. 表を1字変える・道具を1字変える → 古い
4. 指紋は表と道具だけで決まる（ほかの文章を変えても動かない）
5. 本物: `subset.py --stale` が 0 か 1 で帰る（2 や例外で帰らない）。焼いたものの頭に「焼いた元」を書く口が残っている
"""

from __future__ import annotations

import importlib.util
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SUBSET = ROOT / "tools" / "fonts" / "subset.py"


def load():
    spec = importlib.util.spec_from_file_location("subset_under_test", SUBSET)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main() -> int:
    if not SUBSET.exists():
        print(f"!! {SUBSET} が無い")
        return 2
    sb = load()
    ng = 0
    with tempfile.TemporaryDirectory() as d:
        d = Path(d)
        table, tool, css = d / "weights.json", d / "subset.py", d / "fonts.css"
        table.write_text('{"index": {"400": "あ"}}\n', encoding="utf8")
        tool.write_text("SOLO = []\n", encoding="utf8")

        r_none = sb.stale(css, table, tool)
        css.write_text("/* 島の書体 */\n@font-face {}\n", encoding="utf8")
        r_nostamp = sb.stale(css, table, tool)
        if r_none and r_nostamp:
            print("[1] ○ fonts.css が無い・焼いた元の行が無い → 古い")
        else:
            print(f"[1] ✕ 無い {r_none!r} / 行が無い {r_nostamp!r}")
            ng += 1

        fp = sb.fingerprint(table, tool)
        css.write_text(f"/*\n * 島の書体\n * 焼いた元: {fp}（…）\n */\n@font-face {{}}\n", encoding="utf8")
        r_fresh = sb.stale(css, table, tool)
        if r_fresh is None:
            print("[2] ○ 焼いた元が入力の指紋と同じ → 追いついている")
        else:
            print(f"[2] ✕ 同じ指紋なのに {r_fresh!r}")
            ng += 1

        table.write_text('{"index": {"400": "あい"}}\n', encoding="utf8")
        r_table = sb.stale(css, table, tool)
        table.write_text('{"index": {"400": "あ"}}\n', encoding="utf8")
        tool.write_text('SOLO = ["travel/x"]\n', encoding="utf8")
        r_tool = sb.stale(css, table, tool)
        tool.write_text("SOLO = []\n", encoding="utf8")
        if r_table and r_tool and sb.stale(css, table, tool) is None:
            print("[3] ○ 表を1字・道具を1字変えると古い。戻すと追いついている")
        else:
            print(f"[3] ✕ 表 {r_table!r} / 道具 {r_tool!r}")
            ng += 1

        other = d / "page.tsx"
        other.write_text("新しい字", encoding="utf8")
        if sb.fingerprint(table, tool) == fp:
            print("[4] ○ 指紋は表と道具だけで決まる（文章を足しても PR が毎回焼かない）")
        else:
            print("[4] ✕ 入力を変えていないのに指紋が動いた")
            ng += 1

    out = subprocess.run([sys.executable, str(SUBSET), "--stale"], capture_output=True, text=True, timeout=60)
    src = SUBSET.read_text(encoding="utf8")
    if out.returncode in (0, 1) and "焼いた元: {fingerprint(" in src:
        print(f"[5] ○ 本物の --stale は {out.returncode}（{out.stdout.strip()[:60]}）。焼くときに焼いた元を書く")
    else:
        print(f"[5] ✕ 本物の --stale が {out.returncode}: {out.stderr.strip()[-200:]} / 焼いた元を書く口 "
              f"{'あり' if '焼いた元: {fingerprint(' in src else '無し'}")
        ng += 1
    return 1 if ng else 0


if __name__ == "__main__":
    sys.exit(main())
