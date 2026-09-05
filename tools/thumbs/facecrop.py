"""縦フレームから顔を切り出して、横サムネの主役になる素材にする。

縦動画のいちばんの問題は「横に伸ばすと何も見えない」こと。
顔だけ切り出せば横位置に置ける素材になる、というのがこの処理の狙い。

fetch_src.py が落とした src/ の中を見て、次を作る。

  src/<id>_vc.jpg     縦フレームから PRISM Live の透かし（下端）を落としたもの
  src/<id>_<n>c.jpg   16:9 の候補フレームから同じく透かしを落としたもの
  src/<id>_faceb.jpg  顔を切り出して、明るさを上げたもの

OpenCV は 5.0 で Haar カスケードが消えているので `opencv-python-headless<5` を入れること。
サングラス・横顔・暗い場所では顔を外す。数を出すなら YuNet か MediaPipe に替える。
"""
import glob
import os
from typing import Optional, Tuple

import cv2
from PIL import Image, ImageEnhance

# 透かしは下端に出るので、その手前で切る
CROP_V = 0.92   # 縦フレーム
CROP_W = 0.91   # 16:9 フレーム

# 切り出した顔はたいてい夜の路上で暗い。ここまで上げてやっとサムネとして見られる
BRIGHTNESS, CONTRAST, SATURATION = 1.28, 1.12, 1.18

_det = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")


def trim_watermark(path: str, out: str, ratio: float) -> None:
    im = Image.open(path)
    im.crop((0, 0, im.width, int(im.height * ratio))).save(out, quality=95)


def crop_face(path: str, out: str, ratio: float = 0.85, zoom: float = 3.0) -> Optional[Tuple[int, int, int, int]]:
    img = cv2.imread(path)
    h, w = img.shape[:2]
    faces = _det.detectMultiScale(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), 1.1, 5, minSize=(60, 60))
    if len(faces) == 0:
        return None
    x, y, fw, fh = max(faces, key=lambda f: f[2] * f[3])
    # 顎を切らないよう、中心を少し上に取る
    cx, cy = x + fw / 2, y + fh / 2 - fh * 0.12
    side = fh * zoom
    cw, ch = (side * ratio, side) if ratio <= 1 else (side, side / ratio)
    x0 = max(0, min(w - cw, cx - cw / 2))
    y0 = max(0, min(h - ch, cy - ch / 2))
    cv2.imwrite(out, img[int(y0):int(y0 + ch), int(x0):int(x0 + cw)])

    im = Image.open(out)
    im = ImageEnhance.Brightness(im).enhance(BRIGHTNESS)
    im = ImageEnhance.Contrast(im).enhance(CONTRAST)
    im = ImageEnhance.Color(im).enhance(SATURATION)
    im.save(out, quality=95)
    return int(x), int(y), int(fw), int(fh)


def main() -> None:
    for f in sorted(glob.glob("src/*_v.jpg")):
        trim_watermark(f, f.replace("_v.jpg", "_vc.jpg"), CROP_V)
    for f in sorted(glob.glob("src/*_[123].jpg")):
        trim_watermark(f, f.replace(".jpg", "c.jpg"), CROP_W)

    hit = 0
    targets = sorted(glob.glob("src/*_vc.jpg"))
    for f in targets:
        r = crop_face(f, f.replace("_vc.jpg", "_faceb.jpg"))
        if r:
            hit += 1
        print(os.path.basename(f), "→", r)
    print(f"顔が取れた: {hit}/{len(targets)}")


if __name__ == "__main__":
    main()
