#!/usr/bin/env python3
"""キャラクターの絵を、置き場から /tmp/chars に落としておく。

この箱のブラウザは `firebasestorage.googleapis.com` に出られないので、
先に curl 相当で落としておいて `route.mjs` の `offline()` が返す。
落としていないと全員が `ayato.webp` になって、95人並べても
「大きさが揃っているか」すら見られない（住人を1枚に潰していたのと同じ失敗）。

  curl -s https://live-streaming-d3cac.web.app/island-api/characters > /tmp/ch.json
  python3 tools/sprites/chars.py

名前は置き場のパス（`/o/` のうしろ）の `/` を `__` にしたもの。
`route.mjs` が URL から同じ名前を作って引く。
"""
import json
import os
import urllib.parse
import urllib.request

OUT = "/tmp/chars"
SRC = "/tmp/ch.json"


def main() -> None:
    """エントリポイント。"""
    os.makedirs(OUT, exist_ok=True)
    chars = json.load(open(SRC, encoding="utf-8")).get("characters") or []
    got = 0
    for c in chars:
        for role in ("plain", "scene"):
            sizes = (c.get(role) or {}).get("sizes") or {}
            # 図鑑が使うのは一覧の 128 と見開きの 640 だけ。full は 2MB あるので落とさない
            for k in ("128", "640"):
                u = sizes.get(k)
                if not u:
                    continue
                name = urllib.parse.unquote(u.split("/o/")[1].split("?")[0]).replace("/", "__")
                path = os.path.join(OUT, name)
                if os.path.exists(path):
                    continue
                try:
                    with urllib.request.urlopen(u, timeout=60) as r:
                        open(path, "wb").write(r.read())
                    got += 1
                except Exception as e:  # noqa: BLE001 — 1枚こけても残りは落とす
                    print(f"  取れない: {name} {e}")
    print(f"落とした {got}枚 / 合計 {len(os.listdir(OUT))}枚")


main()
