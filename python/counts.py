"""**島の「動く数」を、その場で数えて出す。手引きに書き写さないための道具。**

    python3 python/counts.py            # 表で出す
    python3 python/counts.py --json     # 機械で読む形
    python3 python/counts_selftest.py   # 自分が落ちられることを見る（対照）

終了コード 0=数えられた / 2=数えられなかった（**0 を答えとして出さない**）。

## なぜ要るか

2026-10-13 に手引きの数を突き合わせたら、**書いた日から動いたものばかり**だった。

| どこ | 書いてあった | その日の実物 |
| --- | --- | --- |
| `docs/island-fresh.md` | 焼き込み 35本 | **38本** |
| `CLAUDE.md` | `tools/sprites` 461本 / git 242本 | **349本 / 340本** |
| `CLAUDE.md` | `avatars.py` は 22人ぶん落とす | **129人ぶん** |
| `docs/island-standards.md` | 島は 138面（料理33・伝説9） | **141面（料理39・伝説8）** |
| `docs/island-audit.md` | `islandApi.ts` 4,215行 | **4,958行**（24日で +18%） |

**どれも「数えかた」は正しくて、数だけが古かった。**
手で書くかぎり、書いた瞬間から古くなる。直しても、次の月にまた同じことをする。

だから**数を書くのをやめて、数えかたを名指しする。**
手引きには「`python3 python/counts.py` が出す」と書いておけば、
読む人がその場で正しい数を見る。これは `tools/sprites/islepages.mjs`
（面の一覧を手で並べるのをやめた）と `python/dead_stream_watch_selftest.py`
（島が名指ししている配信の数を、書き写さずにその場で数える）と同じ形。

## 数えないもの

- **本番（BigQuery / Firestore / YouTube）を引く数。** ここはネットに出ない。
  本番の側は `/island-fresh` の1章と `python/stale_content_watch.py` が持っている
- **遅れ（何日止まっているか）。** あれは「今日」を要るので、別の係のもの

## 0 を答えとして出さない

`docs/island-standards.md` §15。数えるものが1つも見つからなかったら、
**その数を 0 として出さずに 2 で落ちる。** 置き場が動いた日に
「0本になりました」と報告するのがいちばん悪い。
`python/counts_selftest.py` が、わざと置き場を外して 2 が返ることを実測する。
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "python"))

# **`site/content/*.ts` を字で読むのは、このリポジトリで1本だけ**
# （`python/ts_read.py`。`docs/island-fresh.md` 2章 / `python/ts_readers_selftest.py`）。
# ここで自前の正規表現を書くと、注釈を1行挟んだ日に黙って1件減る。
from ts_read import read_array, read_chapters, read_countries, read_map, objects, fields  # noqa: E402


def _read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def _git(*args: str) -> list[str]:
    out = subprocess.run(
        ["git", "-C", str(ROOT), *args], capture_output=True, text=True, check=False
    )
    return [ln for ln in out.stdout.splitlines() if ln]


def _rows(rel: str, name: str, key: str, id_key: str | None = None) -> list[dict]:
    """1つの並びを読む。**読み落としたら 0 を返さずに投げる**（上が 2 で止める）。"""
    got = read_array(_read(rel), name, keys=(key,), id_key=id_key or key)
    if got.missed:
        raise ValueError(f"{rel} の {name}: {got.declared} 件のうち {got.missed} 件を読み落とした")
    return got.rows


# ---------------------------------------------------------------- 数えるところ
#
# 1つの欄は (鍵, 見出し, 数える関数, どこに書いてあるか) の4つ。
# **「どこに書いてあるか」を持たせてあるのは、直す先を探し回らないため。**


def n_content_books() -> int:
    return len(list((ROOT / "site/content").glob("*.ts")))


def n_chapters() -> int:
    got = read_chapters(_read("site/content/chapters.ts"))
    if got.missed:
        raise ValueError("chapters.ts を読み落とした")
    return len(got.rows)


def _today() -> str:
    from datetime import date

    return date.today().isoformat()


def n_walked() -> int:
    """歩いた国。決めは `content/walked.ts` と同じ（`-border` は数えない ＋ 旅程の入国ずみ）。"""
    src = _read("site/content/countries.ts")
    got = read_countries(src)
    if got.missed:
        raise ValueError("countries.ts を読み落とした")
    done = [c for c in got.rows if not c["slug"].endswith("-border")]
    today = _today()
    ahead = read_array(src, "AHEAD_COUNTRIES", keys=("entered",), id_key="slug").rows
    return len(done) + len([1 for a in ahead if a["entered"] and a["entered"] <= today])


def n_residents() -> int:
    return len(_rows("site/content/residents.ts", "RESIDENTS", "icon"))


def n_recipes() -> int:
    return len(_rows("site/content/recipes.ts", "RECIPES", "name", id_key="slug"))


def n_legends() -> int:
    return len(_rows("site/content/legends.ts", "LEGENDS", "name", id_key="slug"))


def n_line_stamps() -> int:
    """LINEスタンプの絵（`goods.ts` の `LINE_STAMPS`）。"""
    return len(_rows("site/content/goods.ts", "LINE_STAMPS", "art", id_key="art"))


def n_sprite_tools() -> int:
    return len(
        [p for p in (ROOT / "tools/sprites").rglob("*") if p.is_file() and "node_modules" not in p.parts]
    )


def n_sprite_tools_git() -> int:
    return len(_git("ls-files", "tools/sprites"))


def n_avatars() -> int:
    """`tools/sprites/avatars.py` が落とす視聴者さんの絵（名簿＋他己紹介＋料理の回）。"""
    icons = {r["icon"] for r in _rows("site/content/residents.ts", "RESIDENTS", "icon")}
    icons |= {r["icon"] for r in _rows("site/content/voices.ts", "VOICES", "icon")}
    for _slug, body in read_map(_read("site/content/kitchenTalk.ts"), "KITCHEN_TALK"):
        icons |= {v for o in objects(body) if (v := fields(o).get("icon", ""))}
    return len(icons)


def n_functions_lines() -> int:
    return sum(
        len(p.read_text(encoding="utf-8").splitlines()) for p in (ROOT / "functions/src").glob("*.ts")
    )


def n_island_api_lines() -> int:
    return len(_read("functions/src/islandApi.ts").splitlines())


def n_outside_text_watch() -> int:
    """`python/text_expires_watch.py` が見ていない置き場（`public/*.html` ＋ 直下 `app/` ＋ `site/lib/`）。"""
    a = len(list((ROOT / "public").rglob("*.html")))
    b = len([p for p in (ROOT / "app").rglob("*") if p.is_file()])
    c = len([p for p in (ROOT / "site/lib").iterdir() if p.is_file()])
    return a + b + c


def n_pages() -> int:
    """書き出した面（`.html`）。**書き出していなければ 0**（下の `OPTIONAL`。「—」で出す）。"""
    for d in [ROOT / "site/out"] + sorted((ROOT / "site").glob(".next-*")) + [ROOT / "site/.next"]:
        if not d.is_dir():
            continue
        n = len([p for p in d.rglob("*.html") if "_next" not in p.parts])
        if n:
            return n
    return 0


# 鍵 → (見出し, 数える関数, どこが名指ししているか)
COUNTS: dict[str, tuple[str, object, str]] = {
    "content_books": ("焼き込み（site/content/*.ts）", n_content_books, "docs/island-fresh.md 6章"),
    "chapters": ("章（島）", n_chapters, "docs/island-atlas.md"),
    "walked": ("歩いた国", n_walked, "site/content/walked.ts"),
    "residents": ("図鑑の名簿", n_residents, "docs/island-fresh.md 2章"),
    "recipes": ("料理（スタンプ帳）", n_recipes, "docs/island-fresh.md 4章"),
    "legends": ("伝説", n_legends, "docs/island-fresh.md 6章"),
    "line_stamps": ("LINEスタンプの絵", n_line_stamps, "site/content/goods.ts"),
    "sprite_tools": ("tools/sprites のファイル", n_sprite_tools, "CLAUDE.md"),
    "sprite_tools_git": ("うち git に在るもの", n_sprite_tools_git, "CLAUDE.md"),
    "avatars": ("avatars.py が落とす絵", n_avatars, "CLAUDE.md"),
    "functions_lines": ("functions/src ぜんぶ（行）", n_functions_lines, "docs/island-audit.md 2-1"),
    "island_api_lines": ("islandApi.ts（行）", n_island_api_lines, "docs/island-audit.md 2-1"),
    "outside_text_watch": (
        "text_expires_watch の範囲外",
        n_outside_text_watch,
        "docs/island-audit.md 5章",
    ),
    "pages": ("書き出した面（html）", n_pages, "docs/island-standards.md 15章"),
}

# **書き出していないときだけ 0 でよい欄。** ほかは 0 が出たら置き場が動いている
OPTIONAL = {"pages"}


def collect() -> tuple[dict[str, int], list[str]]:
    """全部数える。**0 が出てはいけない欄で 0 が出たら、その鍵を並べて返す。**"""
    got: dict[str, int] = {}
    bad: list[str] = []
    for key, (_label, fn, _where) in COUNTS.items():
        try:
            n = int(fn())  # type: ignore[operator]
        except Exception as e:  # noqa: BLE001
            bad.append(f"{key}: 数えられません（{e.__class__.__name__}: {e}）")
            continue
        got[key] = n
        if n == 0 and key not in OPTIONAL:
            bad.append(f"{key}: 0 と出ました（置き場が動いた？ 数えかた: {COUNTS[key][2]}）")
    return got, bad


def main(argv: list[str]) -> int:
    got, bad = collect()
    if bad:
        for b in bad:
            print(f"::error::{b}", file=sys.stderr)
        print("\n**数えられませんでした。** 0 を答えとして出していません。", file=sys.stderr)
        return 2
    if "--json" in argv:
        print(json.dumps(got, ensure_ascii=False, indent=2))
        return 0
    print(f"島の動く数（{_today()} に数えた）。**手引きに書き写さない。**\n")
    print("  %-28s %8s  %s" % ("何", "いくつ", "どこが名指ししているか"))
    for key, (label, _fn, where) in COUNTS.items():
        n = got[key]
        v = "—" if (n == 0 and key in OPTIONAL) else f"{n:,}"
        print("  %-28s %8s  %s" % (label, v, where))
    if got.get("pages", 0) == 0:
        print("\n  （面は書き出してから数える: tools/build.sh <ポート>）")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
