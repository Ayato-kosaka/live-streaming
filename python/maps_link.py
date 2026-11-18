"""**Google マップを「名前で検索した状態」で開く道。組み立てるのはここ1か所。**

    from maps_link import search
    search("Ротонда „Свети Георги“", "София")
    # → https://www.google.com/maps/search/?api=1&query=Ротонда+„Свети+Георги“+София&hl=ja（字は URL の形に直る）

## 座標で開かない（2026-11-15・あやと、ソフィア滞在中）

> Google マップで開くボタンを押すと、座標に飛ばされてよく分かりにくい。
> 店が分かるように、Google マップで検索をかけた状態で渡してほしい。
> 例えばクロワッサンならパリのエリアでクロワッサンを検索した状態に

座標で開くと、地図には**名前の無い赤い点**が1つ立つだけで、それが何の店か・
開いているか・入口はどこかが出ない。名前で検索すれば、Google の店の札
（写真・営業時間・口コミ）がそのまま開く。

字は **現地の字の名前 ＋ 街の現地の名前**。看板も Google の店の名前も現地の字なので、
日本語で探すより当たる。名前だけでは別の所に当たるもの（チェーン店・「パン屋」の
意味しかない名前）は、呼ぶ側が通りの名前も渡す。

`hl=ja` は残す。付けないと、現地の端末の言葉で開く。

TS の側は `site/lib/mapsSearch.ts`。**同じ形にしてある**（片方だけ直さない）。
見張りは `python/maps_coord_watch.py`（焼いたものに座標の検索が1本でも在れば落ちる）。
"""

from __future__ import annotations

import re
import urllib.parse

BASE = "https://www.google.com/maps/search/?"

#: 「42.68,23.31」「42.68, 23.31」の形。**これを検索の字にしない**
_COORD = re.compile(r"\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*")


def words(*parts: str | None) -> str:
    """検索の字を組む。空の字は飛ばす。

    **名前に街の字が入っていても、街は足す。** 「Музеј на град Скопје」の
    重なりを削ろうとすると、「Църква „Света София“」（聖ソフィア教会）から
    街のソフィアまで消えて、よその街の同じ名前の教会に当たる（一度そう焼けた）。
    同じ字が2回並んでも、Google の検索は困らない。
    """
    return " ".join(w for w in ((p or "").strip() for p in parts) if w)


def search(*parts: str | None) -> str:
    """名前（と通り・街）で検索した状態の Google マップの道。"""
    q = words(*parts)
    if not q:
        raise ValueError("検索の字が空です")
    if _COORD.fullmatch(q):
        raise ValueError(f"座標で検索しない（名前を渡す）: {q}")
    return BASE + urllib.parse.urlencode({"api": "1", "query": q, "hl": "ja"})
