"""
北欧旅ページのデータを作る。

元は、あやとが用意した北欧ガイドの HTML から抜き出した JSON（/tmp/nordic.json）。
そこにポーランドを足し、実際に通る国だけに絞って site/content/nordic/ に書き出す。

  - ノルウェーとデンマークは今回のルートから外れるので落とす。
  - Wikimedia の画像は 2026 年から使える幅が決まっているので 500/960 に直す。

実行: python python/build_nordic.py
"""

import json
import os
import re

SRC = "/tmp/nordic.json"
POLAND = "/tmp/poland_spots.json"
OUT = "site/content/nordic"

# 通る順。ポーランドから北上して、ストックホルムで終わる。
ROUTE_ORDER = [
    ("poland", "ポーランド"),
    ("lithuania", "リトアニア"),
    ("latvia", "ラトビア"),
    ("estonia", "エストニア"),
    ("finland", "フィンランド"),
    ("sweden", "スウェーデン"),
]

POLAND_META = {
    "en": "POLAND",
    "flag": "🇵🇱",
    "color": "#c0392b",
    "catch": "旅のはじまり。壊された街と、積み直した街。",
    "cur": "ズウォティ PLN（約40円）",
    "tz": "−7/−8時間",
    "fly": "クタイシから直行 約3時間35分（Wizz Air）",
    "best": "5〜9月",
    "price": "58.0",
}

# Wikimedia は決まった幅のサムネイルしか返さなくなった。
GOOD_WIDTHS = (120, 250, 330, 500, 960, 1920)


def fix_width(url: str, want: int) -> str:
    """Wikimedia のサムネイル幅を、いま使える幅に直す。

    Args:
        url: 元のURL
        want: 使いたい幅
    Returns:
        直したURL
    """
    if not url or "upload.wikimedia.org" not in url:
        return url
    w = min(GOOD_WIDTHS, key=lambda g: abs(g - want))
    return re.sub(r"/(\d+)px-", f"/{w}px-", url)


def main() -> None:
    src = json.load(open(SRC, encoding="utf-8"))
    poland = json.load(open(POLAND, encoding="utf-8"))
    os.makedirs(OUT, exist_ok=True)

    countries = []
    for i, (slug, jp) in enumerate(ROUTE_ORDER):
        meta = POLAND_META if slug == "poland" else src["meta"][jp]
        spots = poland if slug == "poland" else src["spots"][jp]
        clean = []
        for s in spots:
            clean.append(
                {
                    "id": f"{slug}-{s['id']}",
                    "cat": s["cat"],
                    "title": s["title"],
                    "local": s.get("local", ""),
                    "city": s.get("city", ""),
                    "area": s.get("area", ""),
                    "body": s.get("body", ""),
                    "point": s.get("point", ""),
                    "tips": s.get("tips", []),
                    "info": s.get("info", ""),
                    "budget": s.get("budget", ""),
                    "time": s.get("time", ""),
                    "season": s.get("season", ""),
                    "tags": s.get("tags", []),
                    "img": fix_width(s.get("img", ""), 500),
                    "big": fix_width(s.get("big", ""), 960),
                    "cm": s.get("cm") or "",
                }
            )
        cities = []
        for s in clean:
            if s["city"] and s["city"] not in cities:
                cities.append(s["city"])
        json.dump(
            {"slug": slug, "name": jp, "spots": clean},
            open(f"{OUT}/{slug}.json", "w", encoding="utf-8"),
            ensure_ascii=False,
            indent=1,
        )
        countries.append(
            {
                "slug": slug,
                "name": jp,
                "leg": i + 1,
                "en": meta["en"],
                "flag": meta["flag"],
                "color": meta["color"],
                "catch": meta["catch"],
                "cur": meta["cur"],
                "tz": meta["tz"],
                "best": meta["best"],
                "price": meta.get("price"),
                "spots": len(clean),
                "cities": cities,
            }
        )

    guide = src["guide"]
    # ルートから外した国の話は落とす
    drop = ("ノルウェー", "デンマーク")
    guide["phrases"] = [p for p in guide["phrases"] if p.get("country") not in drop]
    guide["souvenir"] = [p for p in guide["souvenir"] if p.get("country") not in drop]
    guide["light"] = [p for p in guide["light"] if not any(d in p.get("place", "") for d in drop)]
    guide["move"] = [p for p in guide["move"] if not any(d in p.get("from", "") for d in drop)]
    # 見出しがノルウェー・デンマークの話だけの項目も落とす。
    # 本文の中で地域全体の比較として名前が出てくるぶんは、事実なので残す。
    for key in ("basic", "money", "connect", "trouble"):
        guide[key] = [n for n in guide[key] if not any(d in n.get("title", "") for d in drop)]

    json.dump(
        {"countries": countries, "guide": guide},
        open(f"{OUT}/index.json", "w", encoding="utf-8"),
        ensure_ascii=False,
        indent=1,
    )
    total = sum(c["spots"] for c in countries)
    print(f"{len(countries)} countries / {total} spots -> {OUT}")


if __name__ == "__main__":
    main()
