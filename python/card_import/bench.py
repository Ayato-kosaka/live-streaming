"""本物の CLIP を通して測るための、偽の Takeout zip を作る（EC2 で回す）。

    python -m card_import.bench <出す.zip> [--n 20] [--big]

私的な写真はまだ無いので、**公開の既存カードの写真**（`GET /island-api/nordic/photos`）を
日がばらけるように n 枚とって、Takeout と同じ並び（`Takeout/Google Photos/Photos from YYYY/`）と
横の JSON（`.supplemental-metadata.json`、`photoTakenTime` はその日の正午 UTC）で包む。

`--big` はスマホの写真の重さに寄せる: 4032×3024 に引き伸ばした JPEG（EXIF の撮影時刻つき）と、
半分を HEIC にする。カードの写真は長辺1600の webp なので、そのままでは解く時間が軽く出すぎる。

この zip を `existing` のあとに読むと、全部「すでにカード」に落ちるはず（重複の判定の実地の確かめ）。
`existing` 無しの別の置き場で読むと、選ぶ・出すまで回る。
"""

from __future__ import annotations

import io
import json
import sys
import zipfile
from datetime import datetime, timezone

from PIL import Image

from . import conf
from .existing import _get, list_photos


def main(argv: list[str]) -> int:
    out = argv[0]
    n = int(argv[argv.index("--n") + 1]) if "--n" in argv else 20
    big = "--big" in argv
    cfg = conf.load()
    photos = sorted(list_photos(cfg["existing"]["url"]))
    step = max(1, len(photos) // n)
    pick = photos[::step][:n]
    heif = False
    if big:
        try:
            import pillow_heif  # type: ignore
            pillow_heif.register_heif_opener()
            heif = True
        except Exception:  # noqa: BLE001
            pass
    with zipfile.ZipFile(out, "w", zipfile.ZIP_STORED) as z:
        for i, (day, url) in enumerate(pick):
            raw = _get(url)
            y = day[:4]
            noon = datetime.fromisoformat(day + "T12:00:00").replace(tzinfo=timezone.utc)
            if big:
                im = Image.open(io.BytesIO(raw)).convert("RGB")
                w, h = (4032, 3024) if im.width >= im.height else (3024, 4032)
                im = im.resize((w, h), Image.BICUBIC)
                ex = Image.Exif()
                ex[271], ex[272] = "Google", "Pixel 8"
                sub = ex.get_ifd(0x8769)
                sub[36867] = day.replace("-", ":") + " 14:00:00"
                sub[36881] = "+02:00"
                b = io.BytesIO()
                if heif and i % 2:
                    name = f"IMG_{day.replace('-', '')}_{i:03d}.HEIC"
                    im.save(b, "HEIF", quality=85, exif=ex.tobytes())
                else:
                    name = f"PXL_{day.replace('-', '')}_{i:03d}.jpg"
                    im.save(b, "JPEG", quality=90, exif=ex.tobytes())
                raw = b.getvalue()
            else:
                name = f"PXL_{day.replace('-', '')}_{i:03d}.webp"
            base = f"Takeout/Google Photos/Photos from {y}/"
            z.writestr(base + name, raw)
            z.writestr(base + name + ".supplemental-metadata.json", json.dumps(
                {"title": name, "photoTakenTime": {"timestamp": str(int(noon.timestamp()))},
                 "geoData": {"latitude": 0.0, "longitude": 0.0}}))
    days = sorted({d for d, _ in pick})
    print(f"包んだ: {len(pick)}枚（{days[0]}〜{days[-1]}）{'・12MP' + ('・半分 HEIC' if heif else '') if big else ''}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
