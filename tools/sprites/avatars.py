"""
住人のキャラクター画像を、本番と同じものを手元に落としてくる。

スクショを撮るとき、これまでは住人12人ぶんを全部 `ayato.png` に差し替えていた。
そのせいで**島の上の12人が全員そっくり同じ**に写り、
「住人が生きているか」をレビューしても何も分からなかった。

ブラウザからは lh3.googleusercontent.com に出られないが、**curl では取れる。**
先に落としておいて、Playwright の page.route から手元のファイルを返す。

実行: python3 tools/sprites/avatars.py
出力: /tmp/avatars/<icon>.png（`site/content/residents.ts` の icon がそのまま名前）
     /tmp/avatars/yt/<url の sha1>.jpg（`site/content/voices.ts` の視聴者さんのアイコン）

視聴者さんのアイコンは yt3/yt4.ggpht.com にあって、ここもブラウザからは出られない。
落としておかないと、他己紹介の11人が全員おなじ絵で写って、並びを見ても何も分からない。
"""

import hashlib
import os
import re
import urllib.request

SRC = "/home/user/live-streaming/site/content/residents.ts"
VOICES = "/home/user/live-streaming/site/content/voices.ts"
OUT = "/tmp/avatars"
UA = {"User-Agent": "AyatoIslandBot/1.0 (design reference study)"}


def get(url: str, dst: str) -> bool:
    """1枚落とす。すでにあるものは触らない。"""
    if os.path.exists(dst) and os.path.getsize(dst) > 500:
        return True
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=40) as r:
            b = r.read()
    except Exception as e:  # noqa: BLE001
        print("取れなかった", url, e)
        return False
    if len(b) < 500:
        print("小さすぎる", url, len(b))
        return False
    open(dst, "wb").write(b)
    return True


def voices() -> None:
    """他己紹介に出る視聴者さんのアイコン。名前は URL の sha1（route.mjs と同じ決め方）。"""
    out = f"{OUT}/yt"
    os.makedirs(out, exist_ok=True)
    urls = re.findall(r'icon:\s*"(https://[^"]+)"', open(VOICES, encoding="utf-8").read())
    got = sum(get(u, f"{out}/{hashlib.sha1(u.split('=')[0].encode()).hexdigest()}.jpg") for u in urls)
    print(f"{got}/{len(urls)} 枚（視聴者さんのアイコン） -> {out}")


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    ids = re.findall(r'icon:\s*"([^"]+)"', open(SRC, encoding="utf-8").read())
    got = 0
    for i in ids:
        dst = f"{OUT}/{i}.png"
        if os.path.exists(dst) and os.path.getsize(dst) > 1000:
            got += 1
            continue
        url = f"https://lh3.googleusercontent.com/d/{i}=s160"
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=40) as r:
                b = r.read()
            if len(b) < 1000:
                print("小さすぎる", i, len(b))
                continue
            open(dst, "wb").write(b)
            got += 1
        except Exception as e:  # noqa: BLE001
            print("取れなかった", i, e)
    print(f"{got}/{len(ids)} 枚 -> {OUT}")
    voices()


if __name__ == "__main__":
    main()
