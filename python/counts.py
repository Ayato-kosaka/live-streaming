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

**ただし「片づいたら 0 になる」欄がある**（スプシの口・ドライブの絵・
`nickname`・まだ入っていない `requireOwner`）。あそこの 0 は答えなので
落とさない。そのかわり**分母**（`code_files`）を欄にしてあって、
置き場が動いた回は分母のほうが 0 で落ちる。
**「片づいた 0」と「1本も見に行っていない 0」を見分けるのはそこ。**

## 棚おろしの紙（`docs/island-audit.md`）とどう繋がるか

あの紙は数を1つも持っていない。**鍵を名指しするだけ**（`counts.py: watches`）。
鍵の名前を変えても紙は赤くならない——字として残るだけなので、
`python/audit_counts_selftest.py` が両側から当てている
（紙が指す鍵が在るか / 棚おろし向きの欄が紙から指されているか /
鍵のすぐ隣に数を書いていないか）。**欄を足したら、紙にも1行足す。**
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "python"))

# **`site/content/*.ts` を字で読むのは、このリポジトリで1本だけ**
# （`python/ts_read.py`。`docs/island-fresh.md` 2章 / `python/ts_readers_selftest.py`）。
# ここで自前の正規表現を書くと、注釈を1行挟んだ日に黙って1件減る。
from ts_read import (  # noqa: E402
    code_only,
    fields,
    objects,
    read_array,
    read_chapters,
    read_countries,
    read_map,
    spans,
)


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


# ------------------------------------------------- 字を grep するときの決まり
#
# `docs/island-audit.md` の1章にこう書いてある。
#
# > **生 grep のヒットを件数にしない。** `/* */` と `//` を落としてから数える。
# > 直した記録（コメント）を、直っていない証拠として数えたことが実際にある。
#
# だから、ここで字を数えるものは**全部 `_hits()` を通す。**
# **分母（見に行ったファイルの数）も欄に出す**（`code_files`）——
# 0件は「片づいた」と「見に行っていない」の2通りに読めるので、
# 分母が落ちたら 0 ではなく 2 で止まる（`docs/island-standards.md` §15）。

SKIP_DIR = {"node_modules", "__pycache__", ".git", "out", "dist", ".expo"}
CODE_EXT = {".ts", ".tsx", ".js", ".mjs", ".cjs", ".html", ".py"}

# **見に行く置き場。** 配るもの（`app` `site` `functions/src` `public` `lib`）と、
# 手元の道具（`python` `tools/sprites`）。置き場が1つ消えたら分母が落ちる
SCAN_ROOTS = (
    "app", "lib", "public",
    "site/app", "site/components", "site/content", "site/lib", "site/selftest",
    "functions/src", "functions/selftest",
    "python", "tools/sprites",
)


def _scan_files() -> list[Path]:
    """grep の分母。**置き場が1つでも消えていたら投げる**（0 を答えにしない）。

    **この道具と、その対照は数えない。** 探す字（`script.google.com/…`）を
    自分の中に書いているので、入れると自分を1件ずつ数えて、
    **剥がし終わった日も 0 にならない**（実際に GAS が 4→5、
    対照に仕込みを足した日にさらに 6 まで増えた。ドライブの絵も 8→10 だった）。
    """
    me = {Path(__file__).resolve(),
          (ROOT / "python/counts_selftest.py").resolve()}
    out: list[Path] = []
    for rel in SCAN_ROOTS:
        base = ROOT / rel
        if not base.is_dir():
            raise ValueError(f"置き場が無い: {rel}（数えかたが腐っている）")
        for p in base.rglob("*"):
            if p.is_file() and p.suffix in CODE_EXT and not (SKIP_DIR & set(p.parts)):
                if p.resolve() not in me:
                    out.append(p)
    return out


def _no_comment(p: Path, raw: str) -> str:
    """コメントを落とした字。

    `.py` は `#` の行まるごとだけを落とす（字の途中の `#` は URL の中にも出る）。
    ほかは `ts_read.code_only`（**文字列の中は1字も触らない**）。
    """
    if p.suffix == ".py":
        return re.sub(r"(?m)^[ \t]*#.*$", "", raw)
    return code_only(raw)


def _hits(pattern: str, pre: str, roots: tuple[str, ...] | None = None) -> int:
    """コメントを落としてから数える。`pre` は素の字での下見（速さのため）。

    @param roots 見に行く置き場を絞るとき（既定は `SCAN_ROOTS` ぜんぶ）
    """
    rx = re.compile(pattern)
    n = 0
    for p in _scan_files():
        if roots and not any(p.is_relative_to(ROOT / r) for r in roots):
            continue
        raw = p.read_text(encoding="utf-8", errors="replace")
        if pre not in raw:
            continue
        n += len(rx.findall(_no_comment(p, raw)))
    return n


def _fn_src() -> dict[str, str]:
    """`functions/src/*.ts` を、コメントを落として読む。"""
    return {p.name: code_only(p.read_text(encoding="utf-8"))
            for p in sorted((ROOT / "functions/src").glob("*.ts"))}


def _out(*args: str) -> str:
    """子を起こして、その口から数える。**落ちたら投げる**（黙って 0 にしない）。"""
    r = subprocess.run(args, cwd=str(ROOT), capture_output=True, text=True, check=False)
    if r.returncode != 0:
        raise ValueError(f"{args[1] if len(args) > 1 else args[0]} が {r.returncode} で落ちた")
    return r.stdout


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


# ------------------------------------------------ 棚おろし（`docs/island-audit.md`）
#
# **ここから下は、棚おろしの紙が持っていた数。** あの紙は「いま何が、どこに、
# いくつあるか」を見に来るところなのに、数を手で書いていたので
# **書いた日から古くなっていた**（2026-09-19 に数えて、2026-10-14 に #884 が立った）。
# 数えかたは正しくて、数だけが古い——いつもの形なので、同じ手を打つ。
# **紙からは数を消して、こちらの鍵を名指しする。**


def n_watches() -> int:
    """見張りの本数。**回し役が拾うものをそのまま数える。**

    ここに glob を書き写すと、あちらの拾いかたを変えた日に黙ってずれる
    （`python/watch_census_selftest.py` が同じ理由で、同じ口から取っている）。
    """
    got = json.loads(_out(sys.executable, "python/selftest_runner.py",
                          "--list", "--json", "--no-drill"))
    return len(got["picked"])


def n_api_routes() -> int:
    """口（`/island-api/*`）の本数。**照合式を数えるのは、あちらが本職。**

    `functions/selftest/api_trust_selftest.mjs --routes` が
    `functions/src/*.ts` の `if (method === …)` を走査して並べる（#864）。
    数えかたをこちらに写すと、口の形が変わった日に2か所がずれる。
    """
    out = _out("node", "functions/selftest/api_trust_selftest.mjs", "--routes")
    return len([ln for ln in out.splitlines() if ln.strip().startswith('"')])


def _workflows() -> dict[str, dict]:
    """`.github/workflows/*.yml` を読む。**`on:` は `True` でも引く。**

    読みかた（`on:` を真偽値として読む PyYAML の癖を外すところ）は
    `python/workflow_link_selftest.py` が持っているので、そこから借りる。
    **自前でもう1つ書くと、あちらを直した日にこちらだけ黙って 0 本になる。**
    """
    import yaml  # 置いていない箱では、この欄だけが「数えられません」になる

    wfdir = ROOT / ".github" / "workflows"
    docs = {}
    for p in sorted(wfdir.glob("*.yml")) + sorted(wfdir.glob("*.yaml")):
        docs[p.name] = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
    if not docs:
        raise ValueError(".github/workflows が空（置き場が動いた？）")
    return docs


def n_workflows() -> int:
    return len(_workflows())


def _links() -> dict[str, list[str]]:
    import workflow_link_selftest as wl

    return {p: wl.wanted(d) for p, d in _workflows().items() if wl.wanted(d)}


def n_workflow_links() -> int:
    """繋ぎ（`workflow_run`）の本数。1本のワークフローが2本繋ぐこともある。"""
    return sum(len(v) for v in _links().values())


def n_workflow_linked() -> int:
    """繋ぎを持つワークフローの数。"""
    return len(_links())


def n_workflow_targets() -> int:
    """繋ぎ先の数。**ここが少ないほど、1本止まったときに道連れが多い。**"""
    return len({w for v in _links().values() for w in v})


def n_cron_workflows() -> int:
    """`cron:` を持つワークフローの数（遅れそのものは `python/cron_lag.py`）。"""
    import workflow_link_selftest as wl

    return len([1 for d in _workflows().values() if wl.triggers(d).get("schedule")])


def n_owner_uid_api() -> int:
    """`islandApi.ts` の中の `ownerUid(`。**同じ関所が何回写されているか。**"""
    return len(re.findall(r"\bownerUid\s*\(", _fn_src()["islandApi.ts"]))


def n_owner_uid_all() -> int:
    return sum(len(re.findall(r"\bownerUid\s*\(", v)) for v in _fn_src().values())


def n_require_owner() -> int:
    """関所を1本にまとめたもの。**まだ無ければ 0**（下の `ZERO_OK`）。"""
    return sum(len(re.findall(r"\brequireOwner\s*\(", v)) for v in _fn_src().values())


def n_api_collections() -> int:
    """`islandApi.ts` が直に触るコレクションの種類。"""
    return len(set(re.findall(r'\.collection\(\s*"([^"]+)"', _fn_src()["islandApi.ts"])))


def n_rules_collections() -> int:
    """`firestore.rules` が名指ししているコレクション（`databases/` の囲いは外す）。"""
    src = code_only((ROOT / "firestore.rules").read_text(encoding="utf-8"))
    return len({c for c in re.findall(r"match\s+/([A-Za-z0-9_]+)/", src) if c != "databases"})


def n_fn_limits() -> int:
    """`functions/src` の `.limit(`。**溜まったときに黙って落とす口の数。**"""
    return sum(len(re.findall(r"\.limit\s*\(", v)) for v in _fn_src().values())


def n_cap_hits() -> int:
    """上限に当たったことを言う口（`capHit(`）。`capWatch.ts` の定義は数えない。"""
    return sum(len(re.findall(r"\bcapHit\s*\(", v))
               for k, v in _fn_src().items() if k != "capWatch.ts")


def n_page_of() -> int:
    """続きを返せる口（`pageOf<T>()` を通るもの）。"""
    return sum(len(re.findall(r"\bpageOf\s*[<(]", v)) for v in _fn_src().values())


def n_bang_asserts() -> int:
    """`!`（非 null 表明）。**字の中は数えない**（`ts_read.spans` で code だけ見る）。

    素の grep だと `"Konbanwa!"` のような地の文まで当たって、2026-10-15 に
    51 が 62 に膨らんだ。`docs/island-misses.md` の C（`!` で黙らせる）の分母。
    """
    rx = re.compile(r"[A-Za-z0-9_\)\]]\!(?=[.\),;\]\s])")
    n = 0
    for p in _scan_files():
        if p.suffix not in {".ts", ".tsx"} or "selftest" in p.name:
            continue
        src = p.read_text(encoding="utf-8")
        n += sum(len(rx.findall(src[a:b])) for kind, a, b in spans(src) if kind == "code")
    return n


def n_gas_exec() -> int:
    """GAS の口（`script.google.com/macros/…/exec`）。**片づいたら 0 でよい。**"""
    return _hits(r"script\.google\.com/macros/", "script.google.com")


def n_gas_log_calls() -> int:
    """画面からスプシへ1行ずつ送るログ（`sendLog(`）。**片づいたら 0 でよい。**"""
    return _hits(r"\bsendLog\s*\(", "sendLog", roots=("app", "lib"))


def n_drive_img() -> int:
    """ドライブのキャラクター画像（`lh3.googleusercontent.com/d/`）。

    **コメントは数えない。** 2026-09-19 に生 grep で10件当たったうち2件は
    「前はこうしていた」という記録だった。**片づいたら 0 でよい。**
    """
    return _hits(r"lh3\.googleusercontent\.com/d/", "lh3.googleusercontent.com/d/")


def n_nickname() -> int:
    """島の側の `nickname`（`site/` と `functions/src`）。**片づいたら 0 でよい。**

    `app/alertbox/` の `nickname` は**Doneru の通知に入っている別物**
    （投げ銭した人の表示名）なので、混ぜて数えない。
    """
    return _hits(r"\bnickname\b", "nickname",
                 roots=("site/app", "site/components", "site/content", "site/lib",
                        "functions/src"))


def n_logsafe_books() -> int:
    """`python/logsafe.py` を取り込んでいる本。"""
    return len([1 for p in _scan_files()
                if p.suffix == ".py"
                and re.search(r"^\s*(from\s+logsafe\s+import|import\s+logsafe)",
                              p.read_text(encoding="utf-8"), re.M)])


def n_logsafe_checks() -> int:
    """`logsafe_selftest.py` が登録してある口。**上との差が、見ていない本の数。**"""
    return len(re.findall(r"(?m)^\s*check\(", _read("python/logsafe_selftest.py")))


def n_misses_sections() -> int:
    """`docs/island-misses.md` の節。数えかたは番号の見張りから借りる。"""
    import misses_num_selftest as mn

    sections, _subs = mn.split(_read("docs/island-misses.md"))
    return len(sections)


def n_lieshot_pages() -> int:
    """`tools/sprites/lieshot.mjs` が「落として撮る」面（3-A の分母）。"""
    body = re.search(r"PAGES\s*=\s*\[(.*?)\n\];", _read("tools/sprites/lieshot.mjs"), re.S)
    if not body:
        raise ValueError("lieshot.mjs の PAGES が読めない（書き方が変わった？）")
    return len(re.findall(r'(?m)^\s*\["', code_only(body.group(1))))


def n_obs_pages() -> int:
    """`app/` の直下の route（OBS に出す面）。`_layout` と `+not-found` は数えない。"""
    base = ROOT / "app"
    names = {p.stem for p in base.iterdir()
             if (p.is_dir() or p.suffix == ".tsx") and not p.name.startswith(("_", "+"))}
    if not names:
        raise ValueError("app/ に route が1つも無い（置き場が動いた？）")
    return len(names)


def n_code_files() -> int:
    """上の grep が見に行った字のファイル。**0件を読むときの分母。**"""
    return len(_scan_files())


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
        "docs/island-audit.md 5-1",
    ),
    "pages": ("書き出した面（html）", n_pages, "docs/island-standards.md 15章"),
    # ---- 棚おろし（`docs/island-audit.md`）。紙には数を書かず、この鍵を名指しする
    "code_files": ("見に行った字のファイル", n_code_files, "docs/island-audit.md 0章"),
    "watches": ("見張り", n_watches, "docs/island-audit.md 5-1"),
    "logsafe_books": ("logsafe を使う本", n_logsafe_books, "docs/island-audit.md 5-1"),
    "logsafe_checks": ("うち見張りが登録した口", n_logsafe_checks, "docs/island-audit.md 5-1"),
    "workflows": ("ワークフロー", n_workflows, "docs/island-audit.md 5-2"),
    "workflow_links": ("繋ぎ（workflow_run）", n_workflow_links, "docs/island-audit.md 5-2"),
    "workflow_linked": ("繋ぎを持つワークフロー", n_workflow_linked, "docs/island-audit.md 5-2"),
    "workflow_targets": ("繋ぎ先", n_workflow_targets, "docs/island-audit.md 5-2"),
    "cron_workflows": ("cron を持つワークフロー", n_cron_workflows, "docs/island-audit.md 5-2"),
    "api_routes": ("口（/island-api/*）", n_api_routes, "docs/island-audit.md 2-1"),
    "owner_uid_api": ("ownerUid(（islandApi.ts）", n_owner_uid_api, "docs/island-audit.md 2-1"),
    "owner_uid_all": ("ownerUid(（functions/src）", n_owner_uid_all, "docs/island-audit.md 2-1"),
    "require_owner": ("requireOwner(（まとめた関所）", n_require_owner, "docs/island-audit.md 2-1"),
    "api_collections": ("islandApi.ts が触る箱", n_api_collections, "docs/island-audit.md 2-1"),
    "rules_collections": ("rules が名指しする箱", n_rules_collections, "docs/island-audit.md 4-4"),
    "fn_limits": ("上限（.limit(）", n_fn_limits, "docs/island-audit.md 3-D"),
    "cap_hits": ("うち当たったと言う口", n_cap_hits, "docs/island-audit.md 3-D"),
    "page_of": ("続きを返せる口（pageOf）", n_page_of, "docs/island-audit.md 3-D"),
    "bang_asserts": ("`!` の非 null 表明", n_bang_asserts, "docs/island-audit.md 3-C"),
    "gas_exec": ("GAS の口", n_gas_exec, "docs/island-audit.md 1-3"),
    "gas_log_calls": ("画面のログ（sendLog）", n_gas_log_calls, "docs/island-audit.md 1-1"),
    "drive_img": ("ドライブの絵（lh3…/d/）", n_drive_img, "docs/island-audit.md 1-2"),
    "nickname": ("nickname（島の側）", n_nickname, "docs/island-audit.md 2-3"),
    "obs_pages": ("app/ の直下の route", n_obs_pages, "docs/island-audit.md 1-1"),
    "lieshot_pages": ("落として撮る面", n_lieshot_pages, "docs/island-audit.md 3-A"),
    "misses_sections": ("island-misses.md の節", n_misses_sections, "docs/island-audit.md 3章"),
}

# **0 が本当の答えでありうる欄。** ほかは 0 が出たら置き場が動いている、
# と読む（`docs/island-standards.md` §15）。
#
# 2通りある。**どちらも「0 でも落ちない」が、出しかたが違う。**
#
#   - `UNMEASURED` … まだ測っていないので 0（面は書き出してからでないと数えられない）。
#     **「—」で出す。** 0 と書くと「1面も無い」に見える
#   - 残り …「片づいたら 0 になる」欄（スプシ・ドライブ・まとめた関所）。
#     **0 と出す。** ここの 0 は答えで、片づいた日に 0 と出てほしい
#
# **残件の欄が 0 になったのが本当かどうかは、分母（`code_files`）で読む。**
# 置き場が動いて1本も見に行っていなければ、分母のほうが 0 で落ちる。
UNMEASURED = {"pages"}
OPTIONAL = UNMEASURED | {
    "require_owner",   # まだ入っていない（入ったら 0 でなくなる）
    "gas_exec",        # スプシの口。剥がし終われば 0
    "gas_log_calls",   # 画面のログ。移し終われば 0
    "drive_img",       # ドライブの絵。道具からも消えれば 0
    "nickname",        # 消すと決めてある欄
}


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
        v = "—" if (n == 0 and key in UNMEASURED) else f"{n:,}"
        print("  %-28s %8s  %s" % (label, v, where))
    if got.get("pages", 0) == 0:
        print("\n  （面は書き出してから数える: tools/build.sh <ポート>）")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
