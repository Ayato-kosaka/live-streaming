"""本物の CLIP を通して測るための、偽の Takeout zip を作る（EC2 で回す）。

    python -m card_import.bench <出す.zip> [--n 20] [--big]

私的な写真はまだ無いので、**公開の既存カードの写真**（`GET /island-api/nordic/photos`）を
日がばらけるように n 枚とって、Takeout と同じ並び（`Takeout/Google Photos/Photos from YYYY/`）と
横の JSON（`.supplemental-metadata.json`、`photoTakenTime` はその日の正午 UTC）で包む。

`--big` はスマホの写真の重さに寄せる: 4032×3024 に引き伸ばした JPEG（EXIF の撮影時刻つき）と、
半分を HEIC にする。カードの写真は長辺1600の webp なので、そのままでは解く時間が軽く出すぎる。

この zip を `existing` のあとに読むと、全部「すでにカード」に落ちるはず（重複の判定の実地の確かめ）。
`existing` 無しの別の置き場で読むと、選ぶ・出すまで回る。

`--neg` は落ちるはずの絵を足す（閾値を本物の CLIP で確かめるため）: 1枚目をぼかしたもの・
暗くしたもの・少しだけ切り詰めたもの（ほぼ同じ）、字だけの紙、スマホの画面風の PNG。
名前は `NEG_<何>` にしてあり、`bench.py report` が行き先を名前ごとに数える（手元の台帳から）。
"""

from __future__ import annotations

import io
import json
import sys
import zipfile
from datetime import datetime, timezone

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

from . import conf
from .existing import _get, list_photos


def _negatives(z, day: str, raw: bytes) -> None:
    base = Image.open(io.BytesIO(raw)).convert("RGB")
    w, h = base.size
    try:
        font = ImageFont.load_default(size=30)
    except TypeError:  # 古い Pillow
        font = ImageFont.load_default()
    words = "the of and to in is for that with as on by this be are from at or it an was".split()
    paper = Image.new("RGB", (1200, 1600), (248, 248, 244))
    d = ImageDraw.Draw(paper)
    d.text((100, 60), "BOARDING PASS / AGREEMENT", fill=(20, 20, 20), font=font)
    for i in range(38):
        line = " ".join(words[(i * 7 + k) % len(words)] for k in range(9))
        d.text((100, 130 + i * 38), line, fill=(40, 40, 40), font=font)
    receipt = Image.new("RGB", (700, 1800), (250, 250, 250))
    d = ImageDraw.Draw(receipt)
    d.text((220, 40), "SUPERMARKET", fill=(0, 0, 0), font=font)
    for i in range(30):
        d.text((60, 120 + i * 50), f"ITEM {i:02d} ............", fill=(30, 30, 30), font=font)
        d.text((520, 120 + i * 50), f"{(i * 37) % 90 + 1}.{i % 10}0", fill=(30, 30, 30), font=font)
    d.text((60, 1650), "TOTAL            123.40 EUR", fill=(0, 0, 0), font=font)
    phone = Image.new("RGB", (1080, 2340), (255, 255, 255))
    d = ImageDraw.Draw(phone)
    d.rectangle([0, 0, 1080, 90], fill=(30, 30, 30))
    for i in range(12):
        d.rectangle([40, 160 + i * 170, 1040, 300 + i * 170], outline=(210, 210, 210), width=3)
        d.ellipse([60, 180 + i * 170, 160, 280 + i * 170], fill=(80 + i * 10, 140, 220))
        d.rectangle([190, 200 + i * 170, 900, 225 + i * 170], fill=(60, 60, 60))
        d.rectangle([190, 245 + i * 170, 700, 265 + i * 170], fill=(150, 150, 150))
    negs = {
        "NEG_blur.jpg": base.filter(ImageFilter.GaussianBlur(6)),
        "NEG_dark.jpg": ImageEnhance.Brightness(base).enhance(0.08),
        "NEG_crop.jpg": base.crop((w // 40, h // 40, w - w // 40, h - h // 40)),
        "NEG_paper.jpg": paper,
        "NEG_receipt.jpg": receipt,
        "NEG_phone.png": phone,
    }
    noon = datetime.fromisoformat(day + "T12:00:00").replace(tzinfo=timezone.utc)
    for name, im in negs.items():
        b = io.BytesIO()
        im.save(b, "PNG" if name.endswith(".png") else "JPEG", quality=90)
        path = f"Takeout/Google Photos/Photos from {day[:4]}/{name}"
        z.writestr(path, b.getvalue())
        z.writestr(path + ".supplemental-metadata.json", json.dumps(
            {"title": name, "photoTakenTime": {"timestamp": str(int(noon.timestamp()))}}))


def report(root: str, batch: str) -> int:
    """`NEG_` の絵がどこへ行ったか。名前は道具が作った偽物なので出してよい。"""
    from . import choose
    from .store import open_db
    from pathlib import Path
    cfg = conf.load()
    db = open_db(Path(root))
    run = db.execute("SELECT range_from, range_to FROM runs WHERE batch=?", (batch,)).fetchone()
    photos, stage, _ = choose.group(db, Path(root), cfg, (run[0], run[1]))
    picks = {r[0] for r in db.execute("SELECT sha FROM picks WHERE batch=?", (batch,))}
    for o in db.execute("SELECT seq, sha, member FROM occ ORDER BY seq"):
        name = o["member"].rsplit("/", 1)[-1]
        if not name.startswith("NEG_"):
            continue
        p = photos.get(o["sha"]) or {}
        st = stage.get(o["seq"])
        st = "selected" if o["sha"] in picks else st
        sc = round(choose.parts(p, cfg)["score"], 3) if p.get("probs") else None
        print(f"{name:<15} {st:<11} score={sc} blur={p.get('blur')} dark={p.get('dark')} "
              f"aesth={p.get('aesth')} irr={round(choose.irrelevant_prob(p, cfg), 3) if p.get('probs') else None} "
              f"cat={choose.category(p, cfg) if p.get('probs') else None}")
    return 0


def main(argv: list[str]) -> int:
    if argv[0] == "report":
        return report(argv[1], argv[2])
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
        if "--neg" in argv:
            _negatives(z, pick[0][0], _get(pick[0][1]))
    days = sorted({d for d, _ in pick})
    print(f"包んだ: {len(pick)}枚（{days[0]}〜{days[-1]}）{'・12MP' + ('・半分 HEIC' if heif else '') if big else ''}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
