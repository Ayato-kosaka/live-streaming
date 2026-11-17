"""**古いドメイン（`live-streaming-d3cac.web.app` / `.firebaseapp.com`）の Hosting の設定を作り、配ったものを数える。**

    python3 python/legacy_hosting.py build --sitemap dist/sitemap.xml --out firebase.legacy.json
    python3 python/legacy_hosting.py check --base https://live-streaming-d3cac--legacy-301-xxxx.web.app \\
        --sitemap dist/sitemap.xml            # 配ったもの（プレビューの道 or 本番）を数える

#1202 の段 B。古いドメインの**島の面だけ**を、新しいドメインの同じ道へ 301 で送る。
Firebase Hosting は `firebase.json` にホスト名ごとの redirect を書けないので、
古いドメイン（既定のサイト）と新しいドメイン（島のサイト）を別のサイトに分け、
古いほうにだけこの設定を配る。

## 何を送り、何を送らないか

- **送るのは sitemap に載っている道だけ**（1本ずつ完全一致）。区画の前方一致
  （`/goods/**`）にすると、同じ道の下の実ファイル（`site/public/goods` の絵など）まで
  跳ばしてしまう（`docs/seo-2026-11/D_domain.md` 5章）
- **OBS・口・ログインの戻り先は sitemap に無い**ので、規則がそもそも当たらない。
  当たっていないことは `KEEP` で、作るときと配ったあとの2回数える
- いまある内部の redirect（`/bulgaria` → `/travel/bulgaria/sofia` など）は、
  行き先を**新しいドメインの最後の道**に直す。古いドメインの中で1回跳んでから
  もう1回跳ぶ、の2段にしない

## 行き先に付ける `#from-legacy`

301 で来た人だけ、新しいドメインの頭（`site/lib/handoff.ts`）が古いドメインの
`/handoff` へ1往復して、手元の記録（`localStorage`）を持ってくる。**目印が無いと、
新しいドメインに初めて来た人を全員往復させることになる**（検索から来た人も）。
フラグメントはサーバに届かず、Google も URL の一部として扱わないので、
301 の行き先としての意味は変わらない。

## 終了コード

0 = 合格 / 1 = 外れがある / 2 = 数えられなかった（測れないことと、外れていることは別）
"""

from __future__ import annotations

import argparse
import concurrent.futures as cf
import copy
import glob
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# 301 の行き先に付ける目印。`site/lib/handoff.ts` の `MARK` と同じ字（見張りが突き合わせる）
MARK = "#from-legacy"

# **古いドメインのまま 200 で返り続けないといけないもの。** 規則がここに当たったら作らない。
# 月末の面は `public/` の実ファイルから足す（`keep_paths()`）
KEEP_FIXED = [
    # OBS のブラウザソース（配信の画面に映る）
    "/alertbox",
    "/alertbox/settings",
    "/roulette",
    "/daily_user_stats",
    "/ve-comment",
    "/ve-postit",
    "/donut-progress",
    "/alert/probe.html",
    # 口（Functions へ渡す rewrite）。誰でも読める軽いもの
    "/island-api/fund",
    # ログインの戻り先と、その設定（Hosting の予約の道。redirect より先に配られる）
    "/__/auth/handler",
    "/__/auth/iframe",
    "/__/firebase/init.json",
    # 古いドメインで手元の記録を読む受け渡しの面
    "/handoff",
    # ログインした本人の机（sitemap に無い。島の中から入る）
    "/me",
    "/robots.txt",
    "/sitemap.xml",
]


def site_url() -> str:
    """正の URL を `site/content/site.ts` の1か所から読む（手で二重に持たない）。"""
    src = (ROOT / "site/content/site.ts").read_text(encoding="utf-8")
    m = re.search(r'\burl:\s*"(https://[^"]+)"', src)
    if not m:
        raise SystemExit("site/content/site.ts から SITE.url を読めませんでした")
    return m.group(1).rstrip("/")


def keep_paths() -> list[str]:
    out = list(KEEP_FIXED)
    for f in sorted(glob.glob(str(ROOT / "public/*_monthly_review*.html"))
                    + glob.glob(str(ROOT / "public/*_donation_ceremony*.html"))):
        out.append("/" + Path(f).stem)  # cleanUrls なので .html を外した道で配られる
    for f in sorted(glob.glob(str(ROOT / "public/monthly/**/*.html"), recursive=True)):
        out.append("/" + str(Path(f).relative_to(ROOT / "public").with_suffix("")))
    return out


def read_sitemap(src: str) -> list[str]:
    """sitemap の `<loc>` を、道（`/kitchen` など）にして返す。ファイルでも URL でもよい。"""
    if re.match(r"https?://", src):
        with urllib.request.urlopen(src, timeout=30) as r:
            text = r.read().decode("utf-8")
    else:
        text = Path(src).read_text(encoding="utf-8")
    paths = []
    for loc in re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", text):
        m = re.match(r"https?://[^/]+(/.*)?$", loc)
        if not m:
            continue
        p = m.group(1) or "/"
        paths.append(p)
    return paths


def glob_to_regex(src: str) -> re.Pattern:
    """Firebase の source（`**` `*` `:name` `:name*`）を正規表現にする。KEEP に当たらないかを見るだけ。"""
    out, i = "", 0
    while i < len(src):
        if src.startswith("@(", i):  # extglob の「どれか1つ」（headers の source が使っている）
            j = src.index(")", i)
            out += "(?:" + "|".join(re.escape(x) for x in src[i + 2:j].split("|")) + ")"
            i = j + 1
        elif src.startswith("**", i):
            out += ".*"
            i += 2
        elif src[i] == "*":
            out += "[^/]*"
            i += 1
        elif src[i] == ":":
            m = re.match(r":[A-Za-z_][A-Za-z0-9_]*(\*)?", src[i:])
            out += ".*" if m.group(1) else "[^/]+"
            i += len(m.group(0))
        else:
            out += re.escape(src[i])
            i += 1
    return re.compile("^" + out + "$")


def build(island_hosting: dict, sitemap: list[str], new_origin: str) -> tuple[dict, list[str]]:
    """島の設定を写して、redirects だけを古いドメイン用に作り直す。（設定, 外れの一覧）を返す。"""
    legacy = copy.deepcopy(island_hosting)
    legacy.pop("site", None)
    legacy.pop("target", None)
    problems: list[str] = []

    moved = []
    for r in island_hosting.get("redirects", []):
        d = r["destination"]
        if d.startswith("/"):
            d = new_origin + d  # 古いドメインの中で2段に跳ばない
            if "#" not in d:
                d += MARK  # 古いブックマークから来た人にも、手元の記録を持ってくる
        moved.append({**r, "destination": d})

    exact = []
    seen = set()
    for p in sitemap:
        if p in seen:
            problems.append(f"sitemap に同じ道が2回: {p}")
            continue
        seen.add(p)
        exact.append({"source": p, "destination": new_origin + p + MARK, "type": 301})

    legacy["redirects"] = moved + exact

    # 島の面が、島の側でも redirect の source になっていたら、もともと 2段跳び
    for r in island_hosting.get("redirects", []):
        rx = glob_to_regex(r["source"])
        for p in sitemap:
            if rx.match(p):
                problems.append(f"sitemap の {p} が島の redirect（{r['source']}）にも当たる")

    for k in keep_paths():
        for r in legacy["redirects"]:
            if glob_to_regex(r["source"]).match(k):
                problems.append(f"古いドメインに残す {k} が {r['source']} に当たる")
    if len(exact) != len(set(sitemap)):
        problems.append(f"規則 {len(exact)} 本と sitemap {len(set(sitemap))} 本が合わない")
    return legacy, problems


# ---------------------------------------------------------------- check


class _NoFollow(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):  # 跳ばずに、最初の答えをそのまま見る
        return None


_OPENER = urllib.request.build_opener(_NoFollow)


def fetch(url: str) -> tuple[int, str]:
    req = urllib.request.Request(url, method="GET", headers={"User-Agent": "ayato-legacy-check"})
    try:
        with _OPENER.open(req, timeout=30) as r:
            r.read(1)
            return r.status, r.headers.get("Location", "")
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get("Location", "") if e.headers else ""
    except Exception as e:  # noqa: BLE001  届かなかった（測れない）
        return -1, f"{type(e).__name__}: {e}"


def check(base: str, sitemap: list[str], new_origin: str, island_hosting: dict) -> int:
    base = base.rstrip("/")
    rows: list[str] = []
    bad = 0

    with cf.ThreadPoolExecutor(8) as ex:
        got = dict(zip(sitemap, ex.map(lambda p: fetch(base + p), sitemap)))
    unreachable = [p for p, (s, _) in got.items() if s == -1]
    if len(unreachable) == len(sitemap):
        print(f"届きませんでした: {got[sitemap[0]][1]}")
        return 2
    ok = [p for p, (s, loc) in got.items() if s == 301 and loc == new_origin + p + MARK]
    miss = [p for p in sitemap if p not in ok]
    bad += len(miss)
    rows.append(f"| 島の面（sitemap）が 301 一発で新しいドメインの同じ道へ | **{len(ok)} / {len(sitemap)}** |")
    for p in miss[:15]:
        rows.append(f"| 　外れ `{p}` | {got[p][0]} `{got[p][1]}` |")

    keeps = keep_paths()
    with cf.ThreadPoolExecutor(8) as ex:
        kept = dict(zip(keeps, ex.map(lambda p: fetch(base + p), keeps)))
    k_ok = [p for p, (s, _) in kept.items() if s == 200]
    bad += len(keeps) - len(k_ok)
    rows.append(f"| 古いドメインのまま 200（OBS・口・ログインの戻り先・受け渡し） | **{len(k_ok)} / {len(keeps)}** |")
    for p in keeps:
        s, loc = kept[p]
        rows.append(f"| 　`{p}` | {s}{(' → ' + loc) if loc else ''} |")

    # 形の違う入りかた。行き先が崩れないか（クエリ・末尾の斜線・いまある内部の redirect）。
    # 古いドメインの中は手で1段ずつ追い、新しいドメインに出たところで止める
    # （新しいドメインの中身はここでは見ない。見るのは「どこへ何段で着くか」）
    extra: list[tuple[str, str, int]] = []  # (入る道, 着くはずの道, 何段までなら良いか)
    if "/kitchen" in sitemap:
        extra += [("/kitchen?from=yt", "/kitchen?from=yt", 1), ("/?from=yt", "/?from=yt", 1),
                  ("/kitchen/", "/kitchen", 2), ("/kitchen.html", "/kitchen", 2)]
    for r in island_hosting.get("redirects", []):
        if not re.search(r"[:*]", r["source"]) and "#" not in r["destination"]:
            extra.append((r["source"], r["destination"], 1))
            break
    extra.append(("/map/bulgaria", "/travel/bulgaria", 1))
    for p, want, hops in extra:
        url, chain = base + p, []
        for _ in range(4):
            s, loc = fetch(url)
            chain.append(s)
            if s not in (301, 302, 307, 308) or not loc:
                break
            url = loc if re.match(r"https?://", loc) else base + loc
            if not url.startswith(base):
                break
        sp = urllib.parse.urlsplit(url)
        landed = sp.path + (f"?{sp.query}" if sp.query else "")
        good = url.startswith(new_origin) and landed == want and len(chain) <= hops
        rows.append(f"| 入りかた `{p}` | {'→'.join(map(str, chain))} → `{url}`"
                    f"{'' if good else f' **外れ**（{want} へ {hops} 段で着くはず）'} |")
        bad += 0 if good else 1

    print("| 見たもの | 結果 |\n| --- | --- |")
    print("\n".join(rows))
    return 1 if bad else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build")
    b.add_argument("--config", default=str(ROOT / "firebase.json"))
    b.add_argument("--sitemap", required=True)
    b.add_argument("--out", required=True)
    b.add_argument("--site", default="", help="配る先のサイト（空なら既定のサイト）")
    b.add_argument("--island-site", default="",
                   help="渡すと、島（このサイトへ）と古いドメイン（--site へ）の2つを並べた設定を書く。"
                        "段 B の本番の配りが、配る step の前で firebase.json をこれに置き換える")
    b.add_argument("--mode", choices=["301", "mirror"], default="301",
                   help="mirror = 古いドメインにも島をそのまま配る（ドメインを新しいサイトへ移すあいだ）。"
                        "301 = 古いドメインの島の面を新しいドメインへ送る")
    c = sub.add_parser("check")
    c.add_argument("--config", default=str(ROOT / "firebase.json"))
    c.add_argument("--sitemap", required=True)
    c.add_argument("--base", required=True)
    a = ap.parse_args()

    conf = json.loads(Path(a.config).read_text(encoding="utf-8"))
    island = conf["hosting"]
    try:
        sitemap = read_sitemap(a.sitemap)
    except Exception as e:  # noqa: BLE001
        print(f"sitemap を読めませんでした: {e}")
        return 2
    if not sitemap:
        print("sitemap に道が1本もありません（0 を答えにしない）")
        return 2
    origin = site_url()

    if a.cmd == "build":
        legacy, problems = build(island, sitemap, origin)
        if a.site:
            legacy["site"] = a.site
        for p in problems:
            print("::error::" + p)
        if problems:
            return 1
        if a.island_site:
            if not a.site:
                print("::error::--island-site を渡すときは、古いドメインのサイト（--site）も名指しする")
                return 1
            # 1本の firebase.json に2つ並べると、`firebase deploy --only hosting`
            # （action-hosting-deploy の live）が両方のサイトへ1回で配る
            # mirror: ドメインを新しいサイトへ移すあいだは、どちらのサイトも島を配る。
            # 新しいドメインが古いサイトに付いたまま 301 を配ると、新しいドメインも
            # 自分自身へ 301 する輪になるので、301 はドメインが移り終わってから
            second = {**island, "site": a.site} if a.mode == "mirror" else legacy
            out = {**conf, "hosting": [{**island, "site": a.island_site}, second]}
        else:
            out = {**conf, "hosting": legacy}
        Path(a.out).write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        if a.island_site and a.mode == "mirror":
            print(f"{a.out}: 島を {a.island_site} と {a.site} の両方へ（301 はまだ配らない）")
            return 0
        print(f"{a.out}: redirect {len(legacy['redirects'])} 本"
              f"（sitemap {len(sitemap)} ＋ いまある {len(island.get('redirects', []))}）→ {origin}")
        return 0
    return check(a.base, sitemap, origin, island)


if __name__ == "__main__":
    sys.exit(main())
