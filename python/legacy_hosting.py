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

## 段はファイルで進める（`python/data/hosting_stage.json`）

    {"island_site": "", "legacy_301": false}

| island_site | legacy_301 | 配るもの |
| --- | --- | --- |
| 空 | false | いまのまま（既定のサイト1つに島。firebase.json に1バイトも触らない） |
| サイト名 | false | 島を**両方の**サイトへ（ドメインを移すあいだ。どちらで開いても同じ島） |
| サイト名 | true | 島 → 島のサイト／既定のサイト → 島の面だけ 301 |

段は PR で進める（だれが・いつ進めたかが git に残る）。本番の配りは
`python3 python/legacy_hosting.py stage` で読み、`stage --sitemap … --out firebase.json` で書く。

## Search Console の確認ファイルは、301 の外で、跳ばずに 200

確認ファイル（`google<16桁>.html`）は、Search Console が**その URL ちょうど**を見に来る
（「転送は追わない」と書いてある）。ところが Hosting は `cleanUrls` なので、`public/` に
`.html` のまま置くと `/google….html` → `/google…` へ 301 する。だから
`public/google-site-verification/<名前>.txt` に置き、`firebase.json` の rewrite
（`/<名前>` → そのファイル）で配る。この形の rewrite は `keep_paths()` が拾うので、
古いドメインに残すものとして作る段階と配ったあとの2回数える（200・跳ばない・中身が名乗りと合う）。

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
    "/alert/probe",
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


# 段のファイル。値の意味は頭の表
STAGE_FILE = ROOT / "python/data/hosting_stage.json"
# Hosting のサイト名の形（小文字・数字・ハイフン。Firebase の決まり）
SITE_ID = re.compile(r"^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$")
# Search Console の確認ファイルの道（`google` ＋16桁の16進 ＋ `.html`）
VERIFY = re.compile(r"^/google[0-9a-f]{16}\.html$")


def read_stage(path: Path = STAGE_FILE) -> tuple[str, bool]:
    """段のファイルを読んで（島のサイト名, 301 を配るか）を返す。形が違えば止める（推して配らない）。"""
    d = json.loads(path.read_text(encoding="utf-8"))
    site, on = d.get("island_site", None), d.get("legacy_301", None)
    if set(d) != {"island_site", "legacy_301"} or not isinstance(site, str) or not isinstance(on, bool):
        raise SystemExit(f"{path.name} の形が違います（island_site: 文字・legacy_301: true/false の2つだけ）: {d}")
    if site and not SITE_ID.match(site):
        raise SystemExit(f"island_site がサイト名の形ではありません: {site!r}")
    if on and not site:
        raise SystemExit("legacy_301 を true にするのは、island_site が入ってから")
    return site, on


def staged(conf: dict, site: str, on: bool, legacy: dict | None, default_site: str) -> dict | None:
    """段に合わせた firebase.json を返す。**いまのまま（段が空）なら None**（書き換えない）。"""
    if not site:
        return None
    island = conf["hosting"]
    # 1本の firebase.json に2つ並べると、`firebase deploy --only hosting`
    # （action-hosting-deploy の live）が両方のサイトへ1回で配る。
    # mirror のあいだは、どちらのサイトも島を配る。新しいドメインが古いサイトに
    # 付いたまま 301 を配ると、新しいドメインも自分自身へ 301 する輪になるので、
    # 301 はドメインが移り終わってから（配りの側でも Hosting の口で確かめる）
    second = {**legacy, "site": default_site} if on else {**island, "site": default_site}
    return {**conf, "hosting": [{**island, "site": site}, second]}


def island_of(hosting: dict | list) -> dict:
    """firebase.json の `hosting` から島の設定を1つ取り出す。

    段が空なら dict が1つ。段を進めた配りでは `stage` が firebase.json を
    **[島のサイト, 既定のサイト]** の配列に書き換えてから（`staged()`）、同じ job の中で
    `check` を呼ぶ。配列のまま `.get` すると落ちて、301 を数えられなかった（#1253 の配り）。
    島は段のファイルの `island_site` の名前のもの。名前で見つからなければ1本目（`staged()` の並び）。
    """
    if isinstance(hosting, dict):
        return hosting
    try:
        want, _ = read_stage()
    except SystemExit:
        want = ""
    for h in hosting:
        if want and h.get("site") == want:
            return h
    return hosting[0]


def site_url() -> str:
    """正の URL を `site/content/site.ts` の1か所から読む（手で二重に持たない）。

    読むのは `ts_read`（焼き込みを読む口は1本。`python/ts_readers_selftest.py`）。
    `seo_audit.site_url()` と同じ読みかた。あちらを import すると重いので、口だけ借りる。
    """
    sys.path.insert(0, str(ROOT / "python"))
    from ts_read import code_only, fields, object_body

    src = (ROOT / "site/content/site.ts").read_text(encoding="utf-8")
    url = fields(object_body(code_only(src), "SITE")).get("url", "")
    if not re.fullmatch(r"https://[^/]+", url):
        raise SystemExit(f"site/content/site.ts の SITE.url が原点だけの URL として読めない（{url or '無い'}）")
    return url


def verify_paths(island_hosting: dict | None = None) -> list[str]:
    """`firebase.json` の rewrite のうち、Search Console の確認ファイルを配るもの。"""
    if island_hosting is None:
        island_hosting = island_of(json.loads((ROOT / "firebase.json").read_text(encoding="utf-8"))["hosting"])
    return sorted(r["source"] for r in island_hosting.get("rewrites", [])
                  if VERIFY.match(r.get("source", "")) and r.get("destination"))


def keep_paths(island_hosting: dict | None = None) -> list[str]:
    out = list(KEEP_FIXED) + verify_paths(island_hosting)
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

    for k in keep_paths(island_hosting):
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


def fetch_body(url: str) -> tuple[int, str]:
    req = urllib.request.Request(url, method="GET", headers={"User-Agent": "ayato-legacy-check"})
    try:
        with _OPENER.open(req, timeout=30) as r:
            return r.status, r.read(400).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get("Location", "") if e.headers else ""
    except Exception as e:  # noqa: BLE001
        return -1, f"{type(e).__name__}: {e}"


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

    keeps = keep_paths(island_hosting)
    with cf.ThreadPoolExecutor(8) as ex:
        kept = dict(zip(keeps, ex.map(lambda p: fetch(base + p), keeps)))
    k_ok = [p for p, (s, _) in kept.items() if s == 200]
    bad += len(keeps) - len(k_ok)
    rows.append(f"| 古いドメインのまま 200（OBS・口・ログインの戻り先・受け渡し） | **{len(k_ok)} / {len(keeps)}** |")
    for p in keeps:
        s, loc = kept[p]
        rows.append(f"| 　`{p}` | {s}{(' → ' + loc) if loc else ''} |")

    # 確認ファイルは、跳ばずに 200 で、中身が自分の名前を名乗っていること（Search Console が見る形）
    for p in verify_paths(island_hosting):
        s, body = fetch_body(base + p)
        good = s == 200 and body.strip() == f"google-site-verification: {p[1:]}"
        rows.append(f"| Search Console の確認ファイル `{p}` | {s} {'中身が合う' if good else '**外れ** `' + body[:60] + '`'} |")
        bad += 0 if good else 1

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
        # Firebase は元のクエリを行き先の**後ろ**に足す。行き先にフラグメント（目印）があると
        # `…/kitchen#from-legacy?from=yt` になる（2026-11-17 にプレビューで見た）。
        # 新しいドメインの頭（`site/lib/handoff.ts`）がフラグメントからクエリを戻すので、
        # ここもその読みかたで「着く道」を出す
        q = sp.query or (sp.fragment.split("?", 1)[1] if "?" in sp.fragment else "")
        landed = sp.path + (f"?{q}" if q else "")
        good = url.startswith(new_origin) and landed == want and len(chain) <= hops
        rows.append(f"| 入りかた `{p}` | {'→'.join(map(str, chain))} → `{url}`"
                    f"{'' if good else f' **外れ**（{want} へ {hops} 段で着くはず）'} |")
        bad += 0 if good else 1

    print("| 見たもの | 結果 |\n| --- | --- |")
    print("\n".join(rows))
    return 1 if bad else 0


def add_verify(name: str) -> int:
    """確認ファイルを `public/google-site-verification/<名前>.txt` に置き、firebase.json に rewrite を足す。

    中身は Search Console が出すものと同じ1行（`google-site-verification: <名前>`）。
    `.html` のまま `public/` に置くと cleanUrls が 301 するので、この形でしか置かない。
    """
    if not VERIFY.match("/" + name):
        print(f"::error::確認ファイルの名前の形ではありません（google＋16桁の16進＋.html）: {name}")
        return 1
    d = ROOT / "public/google-site-verification"
    d.mkdir(parents=True, exist_ok=True)
    (d / f"{name}.txt").write_text(f"google-site-verification: {name}", encoding="utf-8")
    fj = ROOT / "firebase.json"
    conf = json.loads(fj.read_text(encoding="utf-8"))
    rw = conf["hosting"].setdefault("rewrites", [])
    src = "/" + name
    if not any(r.get("source") == src for r in rw):
        rw.append({"source": src, "destination": f"/google-site-verification/{name}.txt"})
    fj.write_text(json.dumps(conf, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"足した: public/google-site-verification/{name}.txt と rewrite {src}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build")
    b.add_argument("--config", default=str(ROOT / "firebase.json"))
    b.add_argument("--sitemap", required=True)
    b.add_argument("--out", required=True)
    b.add_argument("--site", default="", help="配る先のサイト（空なら既定のサイト）")
    c = sub.add_parser("check")
    c.add_argument("--config", default=str(ROOT / "firebase.json"))
    c.add_argument("--sitemap", required=True)
    c.add_argument("--base", required=True)
    st = sub.add_parser("stage", help="段のファイルを読む（--out を渡すと、段に合わせた firebase.json を書く）")
    st.add_argument("--config", default=str(ROOT / "firebase.json"))
    st.add_argument("--stage", default=str(STAGE_FILE))
    st.add_argument("--sitemap", default="")
    st.add_argument("--out", default="")
    st.add_argument("--default-site", default="")
    v = sub.add_parser("add-verify", help="Search Console の確認ファイルを、跳ばずに 200 で配る形で足す")
    v.add_argument("name", help="Search Console が出したファイル名（google<16桁>.html）")
    a = ap.parse_args()

    if a.cmd == "add-verify":
        return add_verify(a.name)
    if a.cmd == "stage":
        site, on = read_stage(Path(a.stage))
        if not a.out:
            # 配りの step が `>> $GITHUB_OUTPUT` で読む形
            print(f"island_site={site}")
            print(f"legacy_301={'true' if on else 'false'}")
            return 0
        conf = json.loads(Path(a.config).read_text(encoding="utf-8"))
        default_site = a.default_site or json.loads((ROOT / ".firebaserc").read_text())["projects"]["default"]
        legacy = None
        if on:
            sitemap = read_sitemap(a.sitemap)
            if not sitemap:
                print("::error::sitemap に道が1本もありません（0 を答えにしない）")
                return 1
            legacy, problems = build(conf["hosting"], sitemap, site_url())
            for p in problems:
                print("::error::" + p)
            if problems:
                return 1
        out = staged(conf, site, on, legacy, default_site)
        if out is None:
            print("段: いまのまま（firebase.json は書き換えない）")
            return 0
        Path(a.out).write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"段: 島 → {site}／{default_site} → " + (f"島の面だけ 301（{len(legacy['redirects'])} 本）" if on else "島（mirror）"))
        return 0

    conf = json.loads(Path(a.config).read_text(encoding="utf-8"))
    island = island_of(conf["hosting"])
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
        out = {**conf, "hosting": legacy}
        Path(a.out).write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"{a.out}: redirect {len(legacy['redirects'])} 本"
              f"（sitemap {len(sitemap)} ＋ いまある {len(island.get('redirects', []))}）→ {origin}")
        return 0
    return check(a.base, sitemap, origin, island)


if __name__ == "__main__":
    sys.exit(main())
