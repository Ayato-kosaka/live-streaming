"""`python/legacy_hosting.py`（古いドメインの 301 の設定）と、手元の記録の受け渡しの字の見張り。

    python3 python/legacy_hosting_selftest.py

終了コード 0=通った / 1=落ちた / 2=当てられなかった。ネットには出ない。

## 守っているもの

1. **OBS・口・ログインの戻り先に、301 の規則が当たらない。** 当たると配信の画面が
   新しいドメインへ跳んで、ブラウザソースが真っ白になる。sitemap に `/roulette` が
   紛れ込んだら、作る段階で落ちることを当てる
2. **sitemap の道ぜんぶに、1本ずつ完全一致の規則がある。** 前方一致に崩すと
   同じ道の下の絵まで跳ぶ
3. **いまある内部の redirect が、古いドメインの中で2段に跳ばない**（行き先が新しいドメイン）
4. **字が3か所で揃っている。** 301 の目印（`#from-legacy`）・新しいドメイン・持ってこない鍵は、
   `python/legacy_hosting.py`・`site/lib/handoff.ts`・`public/handoff.html` の3か所に在る。
   1か所だけ変えると、**赤くならずに**記録が渡らなくなる

## 対照

    BREAK=prefix python3 python/legacy_hosting_selftest.py   # 規則を区画の前方一致に崩す
    BREAK=keep   python3 python/legacy_hosting_selftest.py   # 残すものの一覧を空にする
    BREAK=mark   python3 python/legacy_hosting_selftest.py   # 目印の字を片側だけ変える
    BREAK=stage  python3 python/legacy_hosting_selftest.py   # 段が空でも firebase.json を書き換える
    BREAK=verify python3 python/legacy_hosting_selftest.py   # 確認ファイルを残すものに数えない

## 段のファイル（`python/data/hosting_stage.json`）

**いまの値（空・false）なら、配る firebase.json は1バイトも変わらない**ことをここで当てる。
段を進めた PR では、mirror（両方のサイトに同じ島）と 301 の形になることも当てる。
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
sys.path.insert(0, str(HERE))

BREAK = os.environ.get("BREAK", "")
bad = 0


def ok(name: str, good: bool, detail: str = "") -> None:
    global bad
    print(f"  {'○' if good else '✕'} {name}{('：' + detail) if detail else ''}")
    if not good:
        bad += 1
        print(f"::error::{name} {detail}")


def main() -> int:
    try:
        import legacy_hosting as L
    except Exception as e:  # noqa: BLE001
        print(f"道具が読めません: {e}")
        return 2

    conf = json.loads((REPO / "firebase.json").read_text(encoding="utf-8"))
    island = conf["hosting"]
    origin = L.site_url()

    if BREAK == "prefix":
        real_build = L.build

        def build(island_hosting, sitemap, new_origin):  # 区画で束ねる（やってはいけない形）
            legacy, problems = real_build(island_hosting, sitemap, new_origin)
            secs = sorted({"/" + p.split("/")[1] for p in sitemap if p != "/"})
            legacy["redirects"] = [{"source": s + "/**", "destination": new_origin + s, "type": 301} for s in secs]
            return legacy, problems

        L.build = build
    if BREAK == "keep":
        L.KEEP_FIXED = []
    if BREAK == "stage":
        real_staged = L.staged
        L.staged = lambda conf, site, on, legacy, default_site: real_staged(conf, site or "x-island", on, legacy, default_site)
    if BREAK == "verify":
        L.verify_paths = lambda island_hosting=None: []
    mark_py = L.MARK + ("x" if BREAK == "mark" else "")

    # 1. ふつうの sitemap なら通り、数が合う
    sm = ["/", "/kitchen", "/kitchen/ramen", "/goods", "/travel/bulgaria/sofia", "/island/nordic"]
    legacy, problems = L.build(island, sm, origin)
    ok("ふつうの sitemap で外れが出ない", not problems, "; ".join(problems))
    exact = [r for r in legacy["redirects"] if r["source"] in sm]
    ok("sitemap の道ぜんぶに完全一致の規則", len(exact) == len(sm), f"{len(exact)} / {len(sm)}")
    ok("行き先は新しいドメインの同じ道＋目印",
       all(r["destination"] == origin + r["source"] + L.MARK and r["type"] == 301 for r in exact))
    ok("前方一致（** や :name*）の規則を作っていない",
       not any(r["source"].endswith("**") for r in legacy["redirects"]
               if r not in island.get("redirects", []) and r["source"] not in [x["source"] for x in island.get("redirects", [])]))

    # 2. 区画の下の実ファイルは跳ばない
    files = ["/goods/stamp-01.webp", "/kitchen/ramen.jpg", "/nordic/review"]
    hits = [f for f in files if any(L.glob_to_regex(r["source"]).match(f) for r in legacy["redirects"])]
    ok("区画の下の実ファイルに規則が当たらない", not hits, ", ".join(hits))

    # 3. 残すものに当たる sitemap は、作る段階で落ちる
    _, problems = L.build(island, sm + ["/roulette"], origin)
    ok("sitemap に /roulette（OBS）が紛れたら落とす", any("/roulette" in p for p in problems))
    _, problems = L.build(island, sm + ["/kitchen"], origin)
    ok("sitemap に同じ道が2回なら落とす", any("2回" in p for p in problems))
    keeps = L.keep_paths()
    for want in ["/alertbox", "/roulette", "/island-api/fund", "/__/auth/handler", "/handoff"]:
        ok(f"残すものに {want} が入っている", want in keeps)
    ok("月末の面（public の授賞式）を残すものに数えている",
       any(re.match(r"^/\d{6}_monthly_review", k) for k in keeps))

    # 4. いまある内部の redirect は、新しいドメインの最後の道へ1回で
    moved = legacy["redirects"][: len(island.get("redirects", []))]
    rel = [r for r in moved if not r["destination"].startswith(origin)]
    ok("いまある redirect の行き先がぜんぶ新しいドメイン", not rel, ", ".join(r["source"] for r in rel[:5]))
    ok("フラグメント付きの行き先はそのまま（目印を重ねない）",
       all(r["destination"].count("#") <= 1 for r in moved))

    # 5. 字が3か所で揃っている
    ts = (REPO / "site/lib/handoff.ts").read_text(encoding="utf-8")
    html = (REPO / "public/handoff.html").read_text(encoding="utf-8")
    m_ts = re.search(r'export const MARK = "([^"]+)"', ts)
    ok("301 の目印が python と handoff.ts で同じ", bool(m_ts) and m_ts.group(1) == mark_py,
       f"{m_ts and m_ts.group(1)} / {mark_py}")
    skip_ts = re.search(r'export const SKIP = "([^"]+)"', ts)
    skip_html = re.search(r'var SKIP = new RegExp\("([^"]+)"\)', html)
    ok("持ってこない鍵が handoff.ts と handoff.html で同じ",
       bool(skip_ts and skip_html) and skip_ts.group(1) == skip_html.group(1))
    new_html = re.search(r'var NEW = "([^"]+)"', html)
    ok("handoff.html の戻り先が SITE.url と同じ", bool(new_html) and new_html.group(1) == origin,
       f"{new_html and new_html.group(1)} / {origin}")
    legacy_ts = re.search(r'export const LEGACY = "([^"]+)"', ts)
    ok("handoff.ts の古いドメインが web.app", bool(legacy_ts) and legacy_ts.group(1) == "https://live-streaming-d3cac.web.app")
    nonce_ts = "a-f0-9]{8,64}" in ts
    nonce_html = "a-f0-9]{8,64}" in html
    ok("合言葉の形が両側で同じ（16進 8〜64字）", nonce_ts and nonce_html)

    # 7. 段のファイル。いまの値で読めて、空なら何も書き換えない
    try:
        site, on = L.read_stage()
        ok("段のファイルが読める", True, f"island_site={site!r} legacy_301={on}")
    except SystemExit as e:
        ok("段のファイルが読める", False, str(e))
        site, on = "", False
    ok("段が空なら firebase.json を書き換えない（配るものは今と同じ）", L.staged(conf, "", False, None, "live-streaming-d3cac") is None)
    mir = L.staged(conf, "ayato-arigato", False, None, "live-streaming-d3cac")
    ok("mirror は両方のサイトに同じ島（301 を1本も足さない）",
       bool(mir) and [h["site"] for h in mir["hosting"]] == ["ayato-arigato", "live-streaming-d3cac"]
       and all({k: v for k, v in h.items() if k != "site"} == island for h in mir["hosting"]))
    on301 = L.staged(conf, "ayato-arigato", True, legacy, "live-streaming-d3cac")
    ok("301 の段は、既定のサイトに古いドメイン用の設定", bool(on301) and on301["hosting"][1]["redirects"] == legacy["redirects"]
       and on301["hosting"][1]["site"] == "live-streaming-d3cac" and on301["hosting"][0]["site"] == "ayato-arigato")
    import tempfile
    for body, why in [('{"island_site": "", "legacy_301": true}', "島のサイトが無いのに 301"),
                      ('{"island_site": "Ayato_Arigato", "legacy_301": false}', "サイト名の形ではない"),
                      ('{"island_site": "", "legacy_301": "false"}', "true/false が字"),
                      ('{"island_site": "", "legacy_301": false, "x": 1}', "知らない鍵")]:
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            f.write(body)
        try:
            L.read_stage(Path(f.name))
            ok(f"段のファイルの形違いを止める（{why}）", False)
        except SystemExit:
            ok(f"段のファイルの形違いを止める（{why}）", True)
        os.unlink(f.name)

    # 8. Search Console の確認ファイル（rewrite で配る）は 301 の外
    vf = "/google0123456789abcdef.html"
    with_verify = {**island, "rewrites": island.get("rewrites", []) + [
        {"source": vf, "destination": "/google-site-verification/google0123456789abcdef.html.txt"}]}
    ok("確認ファイルを残すものに数える", vf in L.keep_paths(with_verify))
    _, problems = L.build(with_verify, sm + [vf], origin)
    ok("sitemap に確認ファイルが紛れたら落とす", any(vf in p for p in problems))
    lg, problems = L.build(with_verify, sm, origin)
    ok("確認ファイルに 301 の規則が当たらない",
       not problems and not any(L.glob_to_regex(r["source"]).match(vf) for r in lg["redirects"]))
    real = L.verify_paths()
    pub = REPO / "public/google-site-verification"
    files = sorted("/" + f.name[:-4] for f in pub.glob("google*.html.txt")) if pub.is_dir() else []
    ok("public の確認ファイルと firebase.json の rewrite が1対1", real == files, f"rewrite {real} / ファイル {files}")
    for p in files:
        body = (pub / (p[1:] + ".txt")).read_text(encoding="utf-8").strip()
        ok(f"{p} の中身が自分の名前を名乗る", body == f"google-site-verification: {p[1:]}", body[:60])

    # 6. 受け渡しの面は検索に載せない
    noidx = [h["source"] for h in island.get("headers", [])
             if any(x.get("key") == "X-Robots-Tag" and "noindex" in x.get("value", "") for x in h["headers"])]
    ok("/handoff に X-Robots-Tag: noindex", any(L.glob_to_regex(s).match("/handoff") for s in noidx))
    ok("handoff.html に robots noindex", 'name="robots" content="noindex"' in html)

    print("通った" if not bad else f"落ちた {bad}件")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
