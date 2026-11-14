"""1枚ごとの数。**Pillow だけで数える**（numpy を要らないようにしてある）。

numpy を使わないのは、見張りが回る Actions（`selftest.yml`）に numpy が入っておらず、
`.github/` はこの担当の範囲の外だから。数えるのは長辺512の灰色の絵なので、
Pillow のフィルタと `ImageStat` で十分に速い（1枚 10ms 前後）。

- ブレ … ラプラシアンの分散。Pillow の Kernel は 0〜255 に丸めるので offset 128 を足して
  数える。くっきりした絵ほど丸めで小さく出るが、落とす側（小さい値）は丸められない
- 暗さ … 明るさの平均（0〜255）
- 白飛び … 250 以上の画素の割合
- pHash … 32×32 の DCT の左上 8×8 を中央値で2値にした64ビット（`imagehash.phash` と同じ作り）
"""

from __future__ import annotations

import hashlib
import io
import math
from datetime import datetime, timedelta, timezone

from PIL import Image, ImageFilter, ImageOps, ImageStat

from . import guards

try:  # HEIC は pillow-heif があれば読む。無い箱（見張り）では「壊れ」に落ちる
    import pillow_heif  # type: ignore

    pillow_heif.register_heif_opener()
except Exception:  # noqa: BLE001
    pass

EXIF_IFD, GPS_IFD = 0x8769, 0x8825
T_DTO, T_OFFO, T_OFF, T_DT, T_MAKE, T_MODEL = 36867, 36881, 36880, 306, 271, 272


class Broken(Exception):
    pass


def sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _rgb(im: Image.Image) -> Image.Image:
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[-1])
        return bg
    return im.convert("RGB")


def _fit(im: Image.Image, long_side: int) -> Image.Image:
    w, h = im.size
    s = long_side / max(w, h)
    if s >= 1:
        return im.copy()
    return im.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)


_DCT: list[list[float]] | None = None


def _dct_rows() -> list[list[float]]:
    global _DCT
    if _DCT is None:
        n = 32
        _DCT = [[math.cos(math.pi * (2 * x + 1) * u / (2 * n)) for x in range(n)] for u in range(8)]
    return _DCT


def phash(gray: Image.Image) -> str:
    px = list(gray.resize((32, 32), Image.LANCZOS).getdata())
    rows = [px[i * 32:(i + 1) * 32] for i in range(32)]
    c = _dct_rows()
    # 行ごとに8個だけ → 列ごとに8個だけ（左上 8×8 しか要らない）
    tmp = [[sum(cu[x] * row[x] for x in range(32)) for cu in c] for row in rows]   # 32×8
    coef = [[sum(c[v][y] * tmp[y][u] for y in range(32)) for u in range(8)] for v in range(8)]
    flat = [coef[v][u] for v in range(8) for u in range(8)]
    med = sorted(flat)[32]
    bits = 0
    for f in flat:
        bits = (bits << 1) | (1 if f > med else 0)
    return f"{bits:016x}"


def hamming(a: str, b: str) -> int:
    return bin(int(a, 16) ^ int(b, 16)).count("1")


def _ratio(v) -> float:
    try:
        return float(v)
    except Exception:  # noqa: BLE001
        n, d = v
        return n / d


def _gps(exif) -> tuple[float | None, float | None]:
    try:
        g = exif.get_ifd(GPS_IFD)
        if not g or 2 not in g or 4 not in g:
            return None, None
        lat = sum(_ratio(x) / 60 ** i for i, x in enumerate(g[2]))
        lng = sum(_ratio(x) / 60 ** i for i, x in enumerate(g[4]))
        if g.get(1) in ("S", b"S"):
            lat = -lat
        if g.get(3) in ("W", b"W"):
            lng = -lng
        return (lat, lng) if (lat or lng) else (None, None)
    except Exception:  # noqa: BLE001
        return None, None


def _exif_time(exif) -> tuple[datetime | None, str | None]:
    try:
        sub = exif.get_ifd(EXIF_IFD)
    except Exception:  # noqa: BLE001
        sub = {}
    raw = sub.get(T_DTO) or exif.get(T_DT)
    off = sub.get(T_OFFO) or sub.get(T_OFF)
    dt = None
    if isinstance(raw, str):
        try:
            dt = datetime.strptime(raw.strip()[:19], "%Y:%m:%d %H:%M:%S")
        except ValueError:
            dt = None
    if isinstance(off, str) and len(off) == 6 and off[0] in "+-" and off[3] == ":":
        return dt, off
    return dt, None


def _fmt_off(minutes: int) -> str:
    sign = "+" if minutes >= 0 else "-"
    m = abs(minutes)
    return f"{sign}{m // 60:02d}:{m % 60:02d}"


def resolve_time(exif_dt: datetime | None, exif_off: str | None,
                 json_ts: int | None, lng: float | None) -> dict:
    """撮った時刻と日付。**日付は撮った土地の日付**（docs 2章）。

    EXIF の撮影時刻はカメラ（スマホ）がその土地の時計で書いたものなので、まずこれ。
    時差（`OffsetTimeOriginal`）が無ければ、JSON の UTC との差から出す。
    EXIF が無いときだけ JSON（UTC の秒）を使い、時差は経度から粗く当てる
    （15度で1時間。国境の時差とはずれるが、UTC のまま日付を切るよりずっと近い）。
    """
    if exif_dt and (guards.on("localDay") or not json_ts):
        tz = exif_off
        if tz is None and json_ts:
            utc = datetime.fromtimestamp(json_ts, timezone.utc).replace(tzinfo=None)
            diff = round((exif_dt - utc).total_seconds() / 900) * 15
            if abs(diff) <= 14 * 60:
                tz = _fmt_off(diff)
        return {"taken": exif_dt.strftime("%Y-%m-%dT%H:%M:%S"), "tz": tz,
                "day": exif_dt.strftime("%Y-%m-%d"), "date_src": "exif"}
    if json_ts:
        utc = datetime.fromtimestamp(json_ts, timezone.utc)
        if guards.on("localDay"):
            mins = round((lng or 0) / 15) * 60
        else:
            mins = 0
        local = (utc + timedelta(minutes=mins)).replace(tzinfo=None)
        return {"taken": local.strftime("%Y-%m-%dT%H:%M:%S"), "tz": _fmt_off(mins),
                "day": local.strftime("%Y-%m-%d"), "date_src": "json"}
    return {"taken": None, "tz": None, "day": None, "date_src": "none"}


def measure(raw: bytes, keep_long: int, max_pixels: int) -> tuple[dict, Image.Image]:
    """数と、出す大きさに縮めた絵（RGB・向きを直したもの）を返す。読めなければ Broken。"""
    Image.MAX_IMAGE_PIXELS = max_pixels
    try:
        im = Image.open(io.BytesIO(raw))
        w0, h0 = im.size
        exif = im.getexif()
        if im.format == "JPEG":
            im.draft("RGB", (keep_long, keep_long))   # 縮めて解く。12MP で数倍速い
        im.load()
        im = ImageOps.exif_transpose(im)
        im = _rgb(im)
    except Exception as e:  # noqa: BLE001
        raise Broken(type(e).__name__) from e
    # 向きを直したので、元の寸法も回っていれば入れ替える
    if (im.width > im.height) != (w0 > h0) and w0 != h0:
        w0, h0 = h0, w0
    keep = _fit(im, keep_long)
    gray = _fit(keep, 512).convert("L")
    lap = gray.filter(ImageFilter.Kernel((3, 3), [0, 1, 0, 1, -4, 1, 0, 1, 0], scale=1, offset=128))
    blur = ImageStat.Stat(lap).var[0]
    hist = gray.histogram()
    total = sum(hist) or 1
    dark = sum(i * n for i, n in enumerate(hist)) / total
    clip = sum(hist[250:]) / total
    dt, off = _exif_time(exif)
    lat, lng = _gps(exif)
    camera = 1 if (exif.get(T_MAKE) or exif.get(T_MODEL)) else 0
    return ({"w0": w0, "h0": h0, "blur": round(blur, 2), "dark": round(dark, 2),
             "clip": round(clip, 4), "phash": phash(gray), "exif_dt": dt, "exif_off": off,
             "lat": lat, "lng": lng, "camera": camera}, keep)


def write_webp(im: Image.Image, path, quality: int) -> tuple[int, int]:
    """webp に書く。**EXIF も ICC 以外の付けものも付けない**（位置情報を落とす。docs 2章）。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    kw = {"quality": quality, "method": 4}
    if guards.on("stripExif"):
        # 付けものは色の札（ICC）だけ残す。iPhone の写真は Display P3 なので、落とすと色がくすむ
        icc = im.info.get("icc_profile")
        im = im.copy()
        im.info = {"icc_profile": icc} if icc else {}
        kw.update(exif=b"", xmp=b"")
        if icc:
            kw["icc_profile"] = icc
    elif im.info.get("exif"):
        kw["exif"] = im.info["exif"]
    im.save(tmp, "WEBP", **kw)
    tmp.replace(path)
    return im.size
