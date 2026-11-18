"""
北欧旅ページのデータを作る。

元は、あやとが用意した北欧ガイドの HTML から抜き出した JSON（/tmp/nordic.json）。
そこにポーランドを足し、実際に通る国だけに絞って site/content/nordic/ に書き出す。

  - ノルウェーとデンマークは今回のルートから外れるので落とす。
  - 見どころの写真は **島の置き場の道**を焼く（`site/public/travel/<国>/photos/`。
    `python/guide_photos.py` が Commons から 250・500・960 の幅で落とした絵）。
    前は `upload.wikimedia.org` の縮小を直に指していて、Wikimedia が混んだ日に 429 で断られ、
    写真の枠が空になった（2026-11-15）。置き場に無い写真があれば焼かずに止まる。
    出どころ（`cm`。Commons のファイルのページ）は今までどおり面に出す。

実行: python3 python/guide_photos.py nordic && python3 python/build_nordic.py
"""

import json
import os
import sys

# **リポジトリの中に置いてある。** 前は `/tmp` にしか無く、箱が消えたら
# 二度と焼き直せなかった（`docs/island-misses.md` #104 で拾った）。
# ほかの `/tmp` 依存（地図）は curl で取り直せるが、**この2本は取り直せない**
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import guide_photos as gp  # noqa: E402  借りた写真の置き場の道は1か所で引く

_SRC_DIR = Path(__file__).resolve().parent / "data" / "nordic-src"
SRC = str(_SRC_DIR / "nordic.json")
POLAND = str(_SRC_DIR / "poland_spots.json")
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

def photo(slug: str, url: str, width: int) -> str:
    """見どころの写真（材料の Commons の URL）を、島の置き場の道に直す。**置いていなければ焼かずに止める**

    Args:
        slug: 国（`poland` など）
        url: 材料の写真の URL（空なら写真の無い見どころ）
        width: 面が読む幅（250・500・960）
    Returns:
        置き場の道（`/travel/<国>/photos/<名前>-<幅>.webp`）。写真の無い見どころと、
        Commons から消えた写真（`guide_photos.GONE`）は空（割れた絵の枠を出さない）
    """
    if not url or gp.gone(url):
        return ""
    key = f"nordic/{slug}"
    p = gp.local(key, url, width)
    if p is None:
        raise SystemExit(f"借りた写真が置き場に無い: {url}（先に python3 python/guide_photos.py {key}）")
    return p


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
                    # 出す大きさで3つ持つ。**画面の箱に合わせて選ぶ。**
                    # 段の頭のサムネイルは 52px 角なので、500 を取りに行くと
                    # 1枚で 4倍払う（フィンランドは段が42あるので、着いた
                    # とたんに 18枚ぶん）。国の札（/nordic）は 72px の帯で
                    # 幅いっぱいに伸びるので、そちらは 500 のまま。
                    "thumb": photo(slug, s.get("img", ""), 250),
                    "img": photo(slug, s.get("img", ""), 500),
                    "big": photo(slug, s.get("big", ""), 960),
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
