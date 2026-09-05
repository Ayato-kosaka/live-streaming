"""あやとの配信から、サムネ作りの素材を落とす。

  - maxresdefault.jpg  … いま出ているサムネ。左右の黒帯を落として、撮ったままの縦フレームに戻す
  - maxres1〜3.jpg     … YouTube が自動で選んだ 16:9 の候補フレーム

使い方: python3 fetch_src.py <videoId> [<videoId> ...]
出力先: src/<videoId>_v.jpg（縦） / src/<videoId>_1.jpg（候補）
"""
import io
import os
import sys
import urllib.request

import numpy as np
from PIL import Image

_proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
_handler = (urllib.request.ProxyHandler({"https": _proxy, "http": _proxy})
            if _proxy else urllib.request.BaseHandler())


def get(url: str) -> bytes:
    op = urllib.request.build_opener(_handler)
    op.addheaders = [("User-Agent", "Mozilla/5.0")]
    with op.open(url, timeout=30) as r:
        return r.read()


def unpillar(im: Image.Image) -> Image.Image:
    """左右の黒帯を落として、撮ったままの縦フレームに戻す"""
    a = np.asarray(im.convert("RGB"), dtype=np.float32)
    w = a.shape[1]
    std = a.std(axis=(0, 2))
    mean = a.mean(axis=(0, 2))

    def run(reverse: bool) -> int:
        idx = range(w - 1, -1, -1) if reverse else range(w)
        n = 0
        for i in idx:
            if std[i] < 8 and mean[i] < 40:
                n += 1
            else:
                break
        return n

    left, right = run(False), run(True)
    return im.crop((left, 0, w - right, im.height))


def main() -> None:
    os.makedirs("src", exist_ok=True)
    for vid in sys.argv[1:]:
        for name in ("maxresdefault", "maxres1", "maxres2", "maxres3"):
            try:
                im = Image.open(io.BytesIO(get(f"https://i.ytimg.com/vi/{vid}/{name}.jpg"))).convert("RGB")
            except Exception:
                continue
            if name == "maxresdefault":
                unpillar(im).save(f"src/{vid}_v.jpg", quality=95)
            else:
                im.save(f"src/{vid}_{name[-1]}.jpg", quality=95)
        print(vid, "ok")


if __name__ == "__main__":
    main()
