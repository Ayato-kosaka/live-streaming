"""
住人のキャラクター画像を、本番と同じものを手元に落としてくる。

スクショを撮るとき、これまでは住人12人ぶんを全部 `ayato.png` に差し替えていた。
そのせいで**島の上の12人が全員そっくり同じ**に写り、
「住人が生きているか」をレビューしても何も分からなかった。

ブラウザからは lh3.googleusercontent.com に出られないが、**curl では取れる。**
先に落としておいて、Playwright の page.route から手元のファイルを返す。

実行: python3 tools/sprites/avatars.py
出力: /tmp/avatars/<icon>.png（`site/content/residents.ts` の icon がそのまま名前）
"""

import os
import re
import urllib.request

SRC = "/home/user/live-streaming/site/content/residents.ts"
OUT = "/tmp/avatars"
UA = {"User-Agent": "AyatoIslandBot/1.0 (design reference study)"}


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


if __name__ == "__main__":
    main()
