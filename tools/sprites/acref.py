"""
どうぶつの森の公式スクリーンショットを落としてくる。

デザインを詰めるときに「本物と何が違うか」を実際に並べて見るための素材。
Nookipedia の API から、大きめの画像だけ /tmp/acref に落とす。

実行: python3 tools/sprites/acref.py
"""

import json
import os
import re
import urllib.parse
import urllib.request

OUT = "/tmp/acref"
UA = {"User-Agent": "AyatoIslandBot/1.0 (design reference study)"}
# 風景だけ集めても、UI（枠・ボタン・カード・一覧）の作りが分からない。
# 島の絵と、画面の部品と、両方を落とす。
TERMS = [
    # 島の絵
    "island scenery",
    "New Horizons screenshot",
    "resident services",
    "beach",
    "villager house",
    "museum",
    "plaza",
    "river bridge",
    # 画面の部品。カード・一覧・枠・ボタンの作りを見るため
    "NookPhone",
    "Nook Shopping catalog",
    "Critterpedia",
    "DIY Recipes app",
    "Nook Miles app",
    "island designer app",
    "map app New Horizons",
    "passport New Horizons",
    "dialogue New Horizons",
    "inventory New Horizons",
    "Able Sisters shop interface",
    "Nook Stop terminal",
]


def api(url: str) -> dict:
    """Nookipedia の API を叩く。

    Args:
        url: 叩くURL
    Returns:
        返ってきた JSON
    """
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.load(r)


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    base = "https://nookipedia.com/w/api.php"
    seen: set[str] = set()
    n = 0
    for term in TERMS:
        q = (
            base
            + "?action=query&generator=search&gsrsearch="
            + urllib.parse.quote(term)
            + "&gsrnamespace=6&gsrlimit=12&prop=imageinfo&iiprop=url|size"
            + "&iiurlwidth=1280&format=json"
        )
        try:
            d = api(q)
        except Exception as e:  # noqa: BLE001
            print("search failed", term, e)
            continue
        for p in (d.get("query", {}).get("pages") or {}).values():
            ii = (p.get("imageinfo") or [{}])[0]
            url = ii.get("thumburl") or ii.get("url")
            if not url or ii.get("width", 0) < 700:
                continue
            name = re.sub(r"[^A-Za-z0-9._-]", "_", p["title"].replace("File:", ""))
            if name in seen:
                continue
            seen.add(name)
            try:
                req = urllib.request.Request(url, headers=UA)
                with urllib.request.urlopen(req, timeout=60) as r:
                    open(f"{OUT}/ref_{name}", "wb").write(r.read())
                print("OK", name)
                n += 1
            except Exception as e:  # noqa: BLE001
                print("NG", name, e)
    print(f"{n} 枚 -> {OUT}")


if __name__ == "__main__":
    main()
