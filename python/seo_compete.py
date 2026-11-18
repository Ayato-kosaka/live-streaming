"""**狙う語の検索の上位を実物で読んで、うちの面と同じ物差しで並べる。**（#1262・#332）

    python3 python/seo_compete.py serp "ソフィア 観光"                 # 上位10件（Yahoo! JAPAN ＝ 中身は Google の検索）
    python3 python/seo_compete.py images "ソフィア 見どころマップ"      # 画像検索の上位。うちの絵は何位か
    python3 python/seo_compete.py run --out /tmp/compete               # 狙う語ぜんぶ → 上位の面を読んで表に
    python3 python/seo_compete.py run --out /tmp/compete --queries "ソフィア 観光" "スコピエ 観光"

終了コード 0=読めた / **2=検索の結果が1件も読めなかった**（0件を「上位に誰もいない」と読まない）。

## なぜ要るか

あやと（2026-11-18）「SEO 対策が 20点ぐらいしかできていない。業界標準を調べて、徹底的に」。
それまでの手は、こちらの思いつきの3手だった。**上位の面が持っていてうちに無いもの**を、
人の目ではなく同じ物差し（`python/seo_page.py`）で数えないと、何で負けているのかが言えない（#332）。

## 何を読むか

- **Yahoo! JAPAN の検索**（`search.yahoo.co.jp`）。日本では中身が Google の検索なので、Google の順位の代わりに使う。
  Google を直に引くと機械と見なされて読めない
- 語は `python/data/seo_targets.json` の狙う語（各束の頭の語）＋ `EXTRA`
- 上位の面は1本ずつ取ってきて `seo_page.features` を当てる。**JS は動かさない**（AI の読み手と同じ目）。
  取れなかった面は「読めなかった」と数え、分母から黙って抜かない

## 公開に出さないもの

上位の面の URL・題は公開の検索結果なので出してよい。**うちの Search Console の語は扱わない**（それは週の表）。
"""

from __future__ import annotations

import argparse
import gzip
import html as htmlmod
import json
import re
import statistics
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import quote, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parent))
from seo_page import features  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
TARGETS = ROOT / "python" / "data" / "seo_targets.json"
OURS = "ayato-arigato.com"
# 狙う語の束の頭の語に足して、あやとに頼まれた語（2026-11-18）
EXTRA = ["ソフィア 見どころ", "ソフィア 地図", "スコピエ 見どころ", "ブルガリア 観光 ブログ"]
IMAGE_Q = ["ソフィア 見どころマップ", "ソフィア 観光 マップ", "ソフィア 地図", "スコピエ 見どころ", "スコピエ 地図"]
# 検索の口は人の画面と同じ形でないと、空の箱が返る
BROWSER = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
           "Chrome/130.0 Safari/537.36")
PAUSE = 1.5


def get(url: str, timeout: float = 25) -> tuple[int, str]:
    """1本取る（ブラウザの名乗りで）。文字コードは見出し → meta の順に読む。（状態, 本文）"""
    req = urllib.request.Request(url, headers={
        "User-Agent": BROWSER, "Accept-Language": "ja,en;q=0.5", "Accept-Encoding": "gzip",
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw, st, ct = r.read(), r.status, r.headers.get("content-type", "")
            if r.headers.get("content-encoding", "") == "gzip":
                raw = gzip.decompress(raw)
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception:  # noqa: BLE001 — 届かなかった1本で全体を止めない
        return 0, ""
    cs = re.search(r"charset=([\w-]+)", ct) or re.search(rb'charset=["\']?([\w-]+)', raw[:3000])
    enc = (cs.group(1).decode() if isinstance(cs.group(1), bytes) else cs.group(1)) if cs else "utf-8"
    try:
        return st, raw.decode(enc, "replace")
    except LookupError:
        return st, raw.decode("utf-8", "replace")


def serp(q: str, n: int = 10) -> list[dict]:
    """Yahoo! JAPAN のウェブ検索の上位（広告とニュースの枠を除いた、ふつうの結果）。"""
    st, h = get(f"https://search.yahoo.co.jp/search?p={quote(q)}&ei=UTF-8")
    out: list[dict] = []
    for m in re.finditer(r'<a href="(https?://[^"]+)"[^>]*data-cl-params="_cl_vmodule:sr;_cl_link:title;'
                         r'_cl_position:(\d+)[^"]*"[^>]*>(.*?)</a>', h, re.S):
        h3 = re.search(r"<h3[^>]*>(.*?)</h3>", m.group(3), re.S)
        t = htmlmod.unescape(re.sub(r"<[^>]+>", "", h3.group(1) if h3 else m.group(3)))
        out.append({"rank": int(m.group(2)), "url": htmlmod.unescape(m.group(1)), "serp_title": " ".join(t.split())})
    return out[:n]


def images(q: str, n: int = 30) -> list[dict]:
    """Yahoo! JAPAN の画像検索の上位。絵の大きさ・載っている面・題（alt に近い字）。"""
    st, h = get(f"https://search.yahoo.co.jp/image/search?p={quote(q)}&ei=UTF-8")
    out: list[dict] = []
    # 結果は1件ずつ JSON の断片で埋まっている。original（元の絵）と refererUrl（載っている面）を順に拾う
    for m in re.finditer(r'"original":\{"url":"([^"]+)","height":(\d+),"width":(\d+)[^}]*\}(.{0,1500}?)"refererUrl":"([^"]+)"',
                         h, re.S):
        mid = m.group(4)
        if any(o["img"] == m.group(1) for o in out):
            continue                         # 同じ結果が2回埋まっている（画面の2つの並び）
        title = re.search(r'"title":"([^"]*)"', mid)
        thumb = re.search(r'"thumbnail":\{"url":"([^"]+)"', mid)
        out.append({"rank": len(out) + 1, "img": m.group(1),
                    "w": int(m.group(3)), "h": int(m.group(2)), "page": m.group(5),
                    "title": htmlmod.unescape(title.group(1)) if title else "",
                    "thumb": thumb.group(1) if thumb else ""})
        if len(out) >= n:
            break
    return out


def _med(xs: list) -> float | None:
    xs = [x for x in xs if x is not None]
    return statistics.median(xs) if xs else None


def share(rows: list[dict], key) -> str:
    ok = [r for r in rows if r.get("ok")]
    if not ok:
        return "—"
    hit = sum(1 for r in ok if key(r))
    return f"{hit}/{len(ok)}"


def run(queries: list[str], out: Path, workers: int = 6) -> int:
    out.mkdir(parents=True, exist_ok=True)
    cache = out / "pages"
    cache.mkdir(exist_ok=True)
    result: dict = {"queries": {}, "images": {}}
    read_any = False
    for q in queries:
        top = serp(q)
        time.sleep(PAUSE)
        result["queries"][q] = top
        read_any = read_any or bool(top)
    urls = sorted({r["url"] for top in result["queries"].values() for r in top})

    def one(u: str) -> tuple[str, dict]:
        f = cache / (re.sub(r"[^\w.-]", "_", u)[:180] + ".html")
        if f.exists():
            st, h = 200, f.read_text(encoding="utf-8")
        else:
            st, h = get(u)
            if st == 200 and h:
                f.write_text(h, encoding="utf-8")
        if st != 200 or not h:
            return u, {"url": u, "ok": False, "status": st}
        try:
            return u, {**features(h, u), "ok": True}
        except Exception as e:  # noqa: BLE001
            return u, {"url": u, "ok": False, "status": f"読めない: {type(e).__name__}"}

    with ThreadPoolExecutor(workers) as ex:
        feats = dict(ex.map(one, urls))
    for q, top in result["queries"].items():
        for r in top:
            r.update({k: v for k, v in feats.get(r["url"], {}).items() if k not in ("url",)})
            r["ok"] = feats.get(r["url"], {}).get("ok", False)
    for q in IMAGE_Q:
        result["images"][q] = images(q)
        time.sleep(PAUSE)
    (out / "compete.json").write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    print(report(result))
    return 0 if read_any else 2


def report(result: dict) -> str:
    """語ごとに1行。上位の面がどれだけ持っているか（持っている面/読めた面）。"""
    lines = ["| 語 | 読めた | うち | 題の字数 | 年 | ◯選 | 字数 | 絵 | 地図の絵 | 埋め込み地図 | 目次 | FAQ | 体験の言い回し | 書き手 | 更新の中央 |"
             + "".join(f" {k} |" for k in ("access", "safety", "season", "course", "prices")),
             "|" + "---|" * 20]
    for q, top in result["queries"].items():
        ok = [r for r in top if r.get("ok")]
        ours = next((r["rank"] for r in top if OURS in r["url"]), None)
        cells = [
            q, f"{len(ok)}/{len(top)}", f"{ours}位" if ours else "圏外",
            f"{_med([r['title_len'] for r in ok]) or '—'}",
            share(top, lambda r: r["title_year"]), share(top, lambda r: r["title_list"]),
            f"{int(_med([r['chars'] for r in ok]) or 0):,}",
            f"{_med([r['imgs'] for r in ok]) or 0:g}",
            share(top, lambda r: r["map_imgs"] > 0), share(top, lambda r: r["gmaps_embed"] > 0),
            share(top, lambda r: r["toc"]), share(top, lambda r: r["sec"]["faq"]),
            share(top, lambda r: r["firsthand"] >= 3), share(top, lambda r: r["author"]),
            f"{_med([r['age_days'] for r in ok]) or '—'}日",
        ] + [share(top, lambda r, k=k: r["sec"][k]) for k in ("access", "safety", "season", "course", "prices")]
        lines.append("| " + " | ".join(str(c) for c in cells) + " |")
    lines.append("")
    for q, imgs in result.get("images", {}).items():
        ours = [i["rank"] for i in imgs if OURS in i["page"]]
        big = sum(1 for i in imgs if i["w"] >= 1000)
        lines.append(f"- 画像検索「{q}」: 読めた {len(imgs)}枚・うちの絵 {', '.join(f'{r}位' for r in ours) or '圏外'}・"
                     f"横1000px以上 {big}枚・面の顔ぶれ {', '.join(sorted({urlsplit(i['page']).netloc for i in imgs[:10]}))}")
    return "\n".join(lines)


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="狙う語の検索の上位を読んで、うちの面と同じ物差しで並べる")
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("serp")
    s.add_argument("q")
    i = sub.add_parser("images")
    i.add_argument("q")
    r = sub.add_parser("run")
    r.add_argument("--out", required=True)
    r.add_argument("--queries", nargs="*")
    a = ap.parse_args(argv)
    if a.cmd == "serp":
        top = serp(a.q)
        for x in top:
            print(x["rank"], x["url"], x["serp_title"][:70])
        return 0 if top else 2
    if a.cmd == "images":
        got = images(a.q)
        for x in got:
            print(x["rank"], f"{x['w']}x{x['h']}", x["page"], x["title"][:50])
        return 0 if got else 2
    cfg = json.loads(TARGETS.read_text(encoding="utf-8"))
    qs = a.queries or ([t["queries"][0] for t in cfg["targets"]] + EXTRA)
    return run(qs, Path(a.out))


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
