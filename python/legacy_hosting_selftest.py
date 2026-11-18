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
    BREAK=ship   python3 python/legacy_hosting_selftest.py   # 出したあとの突き合わせが段を見ない
    BREAK=named  python3 python/legacy_hosting_selftest.py   # 古いドメインを名指ししてよい表から1つ抜く
    BREAK=list   python3 python/legacy_hosting_selftest.py   # 段で配列にした firebase.json を、そのまま島として読む

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


# **古いドメインを名指ししてよいところ。** 島の面を開く道具の既定は正の URL（`tools/sprites/origin.mjs` の
# `SITE_ORIGIN`）へ寄せた。段 B のあと古いドメインの島の面は 301 になるので、ここに無いところが
# 古いドメインで面を開くと、黙って 301 を読む。口（`/island-api`）を引く字は数えない（301 の外）
LEGACY_NAMED = {
    # 段 B の仕掛けそのもの
    "python/legacy_hosting.py": "古いドメイン用の設定を作り、数える",
    "python/legacy_hosting_selftest.py": "この見張り",
    "site/lib/handoff.ts": "手元の記録を取りに行く先",
    "public/handoff.html": "受け渡しの面の説明",
    "tools/sprites/handoff.mjs": "引き継ぎの試し（本番のホスト名のまま）",
    ".github/workflows/legacy_preview.yml": "プレビューの説明",
    ".github/workflows/firebase-hosting-deploy-prod.yml": "段 B のあと古いドメインを数える",
    # 段 B のあとも古いドメインで動くもの
    "tools/sprites/origin.mjs": "LEGACY_ORIGIN（OBS と口の宛先）の1か所",
    ".github/workflows/alert_watch.yml": "OBS が開く /alertbox を、OBS と同じ古いドメインで確かめる",
    "public/alert/perf.html": "OBS の計測面の案内（OBS は古いドメインのまま）",
    "site/lib/firebase.ts": "ログインを同じホストで受けるドメインの一覧（古いドメインの /me などでもログインする）",
    "site/selftest/firebase_selftest.mjs": "上の一覧の見張り",
    "python/seo_audit.py": "比べる相手（同じ中身を配っていないか）としての古いドメイン",
    "tools/sprites/prodcurl_selftest.mjs": "PASS に当たる名前で試す（偽のサーバで受け、本番には出ない）",
    # 記録（宛先ではない）
    "site/content/site.ts": "説明のコメント",
    "tools/sprites/sitemap-2026-11-13.txt": "日付つきの写しの見出し",
    "tools/shorts/stickies/README.md": "作業箱から島に届かなかった、という当時の記録",
    ".github/workflows/stickies_pull.yml": "同じ記録",
    "public/nordic/review.html": "過去の配信で映した面の字",
}


def scan_named() -> dict[str, list[int]]:
    """古いドメインを名指ししている行（`/island-api` を引く字は除く）を、ファイルごとに返す。"""
    pat = re.compile(r"live-streaming-d3cac\\?\.web\\?\.app(?!/island-api)")
    out: dict[str, list[int]] = {}
    for d in ["tools", "python", ".github", "site", "public"]:
        for f in (REPO / d).rglob("*"):
            if not f.is_file() or "node_modules" in f.parts or any(p.startswith(".next") for p in f.parts) \
                    or f.suffix in {".png", ".jpg", ".webp", ".mp4", ".woff2", ".gz"}:
                continue
            try:
                lines = f.read_text(encoding="utf-8").splitlines()
            except (UnicodeDecodeError, OSError):
                continue
            hits = [i for i, ln in enumerate(lines, 1) if pat.search(ln)]
            if hits:
                out[str(f.relative_to(REPO))] = hits
    return out


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
    if BREAK == "list":
        L.island_of = lambda hosting: hosting
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

    # 9. 出したあとの突き合わせ（ship.py）は、301 の段で正の URL を見る
    import ship
    if BREAK == "ship":
        ship.prod_base = lambda stage_text=None: "https://live-streaming-d3cac.web.app"
    old_host = "https://live-streaming-d3cac.web.app"
    ok("突き合わせ: 段が空なら web.app", ship.prod_base('{"island_site": "", "legacy_301": false}') == old_host)
    ok("突き合わせ: mirror でも web.app（新しいドメインの証明書待ちに巻き込まれない）",
       ship.prod_base('{"island_site": "ayato-arigato", "legacy_301": false}') == old_host)
    got = ship.prod_base('{"island_site": "ayato-arigato", "legacy_301": true}')
    ok("突き合わせ: 301 の段は正の URL", got == origin, got)

    # 10. 古いドメインを名指ししてよいのは、理由のあるところだけ（口 /island-api を引く字は除く）
    named = scan_named()
    allow = dict(LEGACY_NAMED)
    if BREAK == "named":
        allow.pop("tools/sprites/origin.mjs")
    extra = sorted(set(named) - set(allow))
    ok("古いドメインを名指ししているのは、理由の表にあるところだけ", not extra,
       "表に無い: " + ", ".join(f"{f}:{named[f][0]}" for f in extra[:6]))
    gone = sorted(set(allow) - set(named))
    ok("理由の表に、もう名指ししていないところが残っていない", not gone, ", ".join(gone))


    # 11. 段を進めた配りでは、firebase.json が [島, 既定] の配列に書き換わってから check が走る。
    #     配列のまま読むと 301 を数えられずに落ちた（#1253 の配り）。main の check の口を通して見る
    staged_conf = L.staged(conf, "ayato-arigato", True, legacy, "live-streaming-d3cac")
    with tempfile.TemporaryDirectory() as td:
        cpath, spath = Path(td) / "firebase.json", Path(td) / "sitemap.xml"
        cpath.write_text(json.dumps(staged_conf), encoding="utf-8")
        spath.write_text("".join(f"<url><loc>{origin}{p}</loc></url>" for p in sm), encoding="utf-8")
        seen = {}
        real_check, real_argv = L.check, sys.argv
        L.check = lambda base, sitemap, new_origin, island_hosting: seen.update(island=island_hosting) or 0
        sys.argv = ["legacy_hosting.py", "check", "--base", "http://127.0.0.1:9", "--config", str(cpath), "--sitemap", str(spath)]
        try:
            rc = L.main()
            got_island = seen.get("island")
            good = (rc == 0 and isinstance(got_island, dict) and got_island.get("site") == "ayato-arigato"
                    and L.keep_paths(got_island) == L.keep_paths(island))
            ok("段で配列になった firebase.json でも、check は島の設定を読む", good,
               f"渡ったもの: {type(got_island).__name__}")
        except Exception as e:  # noqa: BLE001
            ok("段で配列になった firebase.json でも、check は島の設定を読む", False, f"{type(e).__name__}: {e}")
        finally:
            L.check, sys.argv = real_check, real_argv

    # 6. 受け渡しの面は検索に載せない
    noidx = [h["source"] for h in island.get("headers", [])
             if any(x.get("key") == "X-Robots-Tag" and "noindex" in x.get("value", "") for x in h["headers"])]
    ok("/handoff に X-Robots-Tag: noindex", any(L.glob_to_regex(s).match("/handoff") for s in noidx))
    ok("handoff.html に robots noindex", 'name="robots" content="noindex"' in html)

    print("通った" if not bad else f"落ちた {bad}件")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
