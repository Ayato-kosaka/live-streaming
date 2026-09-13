"""キャラクターの絵の **256** を `/tmp/chars` に足す。

`chars.py` は 128（図鑑の一覧）と 640（見開き）だけを落とす。
けれど**料理・伝説・国の面が使っているのは 256** で、そこが落ちていないと
`route.mjs` の `offline()` が `ayato.webp` に落ちる。
その結果、料理の面の「この晩の台所にいた」8〜26人が**全員そっくり同じ絵**で写る。
route.mjs 自身が戒めている失敗そのものなので、撮る前にここを通す。

    curl -s https://live-streaming-d3cac.web.app/island-api/characters > /tmp/ch.json
    python3 tools/sprites/pcchars.py

`chars.py` には手を入れていない（あちらは図鑑のための道具で、
256 を足すと落とす枚数が 1.5 倍になる）。**要る面の側で足す。**
"""
import json
import os
import urllib.parse
import urllib.request

OUT = "/tmp/chars"
SRC = "/tmp/ch.json"
SIZES = ("256",)


def main() -> None:
    """エントリポイント。"""
    os.makedirs(OUT, exist_ok=True)
    chars = json.load(open(SRC, encoding="utf-8")).get("characters") or []
    got = skip = fail = 0
    for c in chars:
        for role in ("plain", "scene"):
            sizes = (c.get(role) or {}).get("sizes") or {}
            for k in SIZES:
                u = sizes.get(k)
                if not u:
                    continue
                name = urllib.parse.unquote(u.split("/o/")[1].split("?")[0]).replace("/", "__")
                path = os.path.join(OUT, name)
                if os.path.exists(path):
                    skip += 1
                    continue
                try:
                    with urllib.request.urlopen(u, timeout=60) as r:
                        open(path, "wb").write(r.read())
                    got += 1
                except Exception as e:  # noqa: BLE001 — 1枚こけても残りは落とす
                    fail += 1
                    print(f"  取れない: {name} {e}")
    # **落とせなかった数を必ず出す。** 黙って減ると、その人だけ ayato に化けて
    # 「絵が全部同じ」を見落とす（`docs/island-misses.md` #77）
    print(f"{len(chars)}人  落とした {got}枚 / もうあった {skip}枚 / 取れなかった {fail}枚")


main()
