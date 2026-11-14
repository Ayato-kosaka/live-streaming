"""写真の取り込み（`python/card_import/`）の見張り。**偽の Takeout zip** で、落とす理由ごとの数と
選ばれる顔ぶれを当てる。CLIP は偽物（`FakeClip`）に差し替える。EC2 にも外にも出ない。

    python3 python/card_import_selftest.py

終了コード **0=全部合っている / 1=合っていないものが在った / 2=当てられなかった**
（道具が読めない・対照が当たらない）。

## 偽の写真

Pillow で描いた絵（640×480、色の違う図形を14個）。左上に3つの小さな札を描き、偽の CLIP は
それを読む: 1つ目の色が種類、2つ目の灰色が見栄え（0〜1）、3つ目の灰色が場面の番号
（番号ごとに決めた埋め込みを返す）。こうすると点と近さを狙って作れる。
pHash・ブレ・暗さ・白飛び・EXIF・横の JSON・zip は全部本物の道具が読む。

| 日 | 写真 | 行き先 |
| --- | --- | --- |
| 03-01 | 海・同じ写真をアルバムにも・ほぼ同じ1枚・真っ暗・ブレ・小さい・スクショ風・名前がスクショ・2023年・日付なし・壊れ・動画・既存のカードと同じ・EXIF なしで JSON が別の zip | pool 2 / 完全重複・ほぼ同じ・低品質3・無関係2・期間外2・壊れ・動画・既存 |
| 03-02 | 食事6・街並み3・自然3（全部良い） | 12枚から 5枚。種類が3つ以上に散る |
| 03-04 | 現地 00:30（+02:00）・UTC では 03-03 22:30 | **03-04** に入る |
| 03-05 | 点が境目の1枚 | `ambiguous` |
| 03-06/07 | 答え「no」の1枚と、それに CLIP が近い（0.85〜0.94）1枚 | 答えを読むと2枚とも消える |
| 03-09 | 名前が長く、JSON の名前が切れている | JSON の日付で入る |
| 03-11〜18 | 2枚ずつ | 認識合わせの頭数 |

## 対照

`card_import/guards.py` の守りを1つずつ外し、その守りの足が赤くなるかを見る。
1つでも赤くならなければ、本物の結果を出さずに 2。
"""

from __future__ import annotations

import io
import json
import math
import random
import shutil
import sys
import tarfile
import tempfile
import time
import traceback
import zipfile
from contextlib import redirect_stdout
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

try:
    from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

    from card_import import choose, conf, existing, guards, pack, run, scan, sheet, sources
    from card_import.embed import CATEGORIES
    from card_import.store import open_db
except Exception as e:  # noqa: BLE001
    print(f"道具が読めません: {type(e).__name__}: {e}")
    sys.exit(2)

DIR = "Takeout/Google Photos/Photos from 2025/"
RANGE = ("2025-01-01", "2025-06-30")
# 見張りの閾値。本番の config.json を調整しても、ここの足は動かない（形だけは下で突き合わせる）
CFG = {
    "day": {"good": 0.8, "floor": 0.6, "min": 1, "sqrtGain": 1.2, "max": 10},
    "ambiguous": {"margin": 0.06},
    "quality": {"blurHard": 30, "blurGood": 100, "darkHard": 22, "darkSoft": 50,
                "clipHard": 0.45, "clipSoft": 0.15},
    "group": {"phash": 10, "clip": 0.94, "looseClip": 0.85},
    "existing": {"phash": 10, "clip": 0.95},
    "calib": {"count": 24, "sim": 0.85, "k": 5, "gain": 0.15},
    "diversity": {"similar": 0.35, "similarFrom": 0.6, "sameCategory": 0.06,
                  "nearMeters": 150, "samePlace": 0.08},
    "missing": {"minDays": 14},
}

CATS = list(CATEGORIES)
PAL = {c: ((i * 53) % 256, (i * 97 + 40) % 256, (i * 151 + 80) % 256) for i, c in enumerate(CATS)}
DIM = 32


def _vec(seed: int) -> list[float]:
    r = random.Random(seed * 7919)
    v = [r.gauss(0, 1) for _ in range(DIM)]
    n = math.sqrt(sum(x * x for x in v))
    return [x / n for x in v]


def _near_vec(base: list[float], seed: int, k: float) -> list[float]:
    r = random.Random(seed)
    v = [b + k * r.gauss(0, 1) / math.sqrt(DIM) for b in base]
    n = math.sqrt(sum(x * x for x in v))
    return [x / n for x in v]


VECS = {sid: _vec(sid) for sid in range(1, 64)}
VECS[100] = _vec(100)
VECS[101] = _near_vec(VECS[100], 5, 0.5)


class FakeClip:
    """左上の札を読む偽の CLIP。呼ばれた回数を数える（再開の足が使う）。"""

    name = "fake"

    def __init__(self, fail_after: int | None = None):
        self.calls = 0
        self.fail_after = fail_after

    def analyze(self, img):
        self.calls += 1
        if self.fail_after is not None and self.calls > self.fail_after:
            raise RuntimeError("途中で落ちた（見張りの仕込み）")
        rgb = img.convert("RGB")
        c = rgb.getpixel((8, 8))
        cat = min(CATS, key=lambda k: sum((a - b) ** 2 for a, b in zip(PAL[k], c)))
        aes = rgb.getpixel((24, 8))[0] / 255
        sid = round(rgb.getpixel((40, 8))[0] / 4)
        vec = VECS.get(sid) or _vec(1000 + sid)
        rest = 0.1 / (len(CATS) - 1)
        return list(vec), {k: (0.9 if k == cat else rest) for k in CATS}, aes


# ---------------------------------------------------------------- 偽の写真

def scene(seed, cat, aes, sid, size=(640, 480), blur=0, dark=False, shift=0, bright=1.0):
    r = random.Random(seed)
    im = Image.new("RGB", size, tuple(r.randint(40, 200) for _ in range(3)))
    d = ImageDraw.Draw(im)
    for _ in range(14):
        x, y = r.randint(0, size[0]) + shift, r.randint(0, size[1])
        w, h = r.randint(30, 200), r.randint(30, 200)
        col = tuple(r.randint(30, 220) for _ in range(3))
        (d.rectangle if r.random() < 0.5 else d.ellipse)([x, y, x + w, y + h], fill=col)
    # 細かい模様（本物の写真の木の葉・石畳のかわり）。無いとブレの数が小さく出て、点がばらつく
    for _ in range(400):
        x, y = r.randint(0, size[0]) + shift, r.randint(0, size[1])
        k = r.randint(2, 6)
        d.rectangle([x, y, x + k, y + k], fill=tuple(r.randint(30, 220) for _ in range(3)))
    if blur:
        im = im.filter(ImageFilter.GaussianBlur(blur))
    if dark:
        im = ImageEnhance.Brightness(im).enhance(0.05)
    if bright != 1.0:
        im = ImageEnhance.Brightness(im).enhance(bright)
    d = ImageDraw.Draw(im)
    g = round(aes * 255)
    d.rectangle([0, 0, 15, 15], fill=PAL[cat])
    d.rectangle([16, 0, 31, 15], fill=(g, g, g))
    d.rectangle([32, 0, 47, 15], fill=(sid * 4,) * 3)
    return im


def jpeg(im, dt: str | None = None, off: str | None = None, gps=None, fmt="JPEG") -> bytes:
    ex = Image.Exif()
    if dt:
        sub = ex.get_ifd(0x8769)
        sub[36867] = dt
        if off:
            sub[36881] = off
        ex[271] = "FakeCam"
    if gps:
        g = ex.get_ifd(0x8825)
        g[1], g[2] = "N", (float(gps[0]), 0.0, 0.0)
        g[3], g[4] = "E", (float(gps[1]), 0.0, 0.0)
    b = io.BytesIO()
    im.save(b, fmt, quality=95, exif=ex.tobytes()) if fmt == "JPEG" else im.save(b, fmt)
    return b.getvalue()


def sidecar(ts: datetime, lat=0.0, lng=0.0, title="x") -> bytes:
    return json.dumps({"title": title, "photoTakenTime": {"timestamp": str(int(ts.timestamp()))},
                       "geoData": {"latitude": lat, "longitude": lng}}).encode()


def utc(*a) -> datetime:
    return datetime(*a, tzinfo=timezone.utc)


LONG = "a_very_long_file_name_from_some_camera_app_2025_03_09_x.jpg"
NAMES = {}   # 名前 → sha（顔ぶれを当てるため）


def build_zips(tmp: Path) -> tuple[Path, Path, bytes]:
    z1, z2 = tmp / "takeout-001.zip", tmp / "takeout-002.zip"
    files1: list[tuple[str, bytes]] = []
    files2: list[tuple[str, bytes]] = []
    s1 = jpeg(scene(1, "sea", 0.9, 1), "2025:03:01 10:00:00", "+01:00", gps=(41.99, 21.43))
    files1 += [
        (DIR + "s1.jpg", s1),
        ("Takeout/Google Photos/Trip/s1.jpg", s1),
        (DIR + "s1b.jpg", jpeg(scene(1, "sea", 0.8, 1, shift=2, bright=1.03), "2025:03:01 10:00:05", "+01:00")),
        (DIR + "dark.jpg", jpeg(scene(2, "street", 0.9, 2, dark=True), "2025:03:01 21:00:00", "+01:00")),
        (DIR + "blur.jpg", jpeg(scene(3, "street", 0.9, 3, blur=20), "2025:03:01 11:00:00", "+01:00")),
        (DIR + "small.jpg", jpeg(scene(4, "food", 0.9, 4, size=(300, 200)), "2025:03:01 12:00:00", "+01:00")),
        (DIR + "shot.png", jpeg(scene(5, "screenshot", 0.9, 5), fmt="PNG")),
        (DIR + "shot.png.supplemental-metadata.json", sidecar(utc(2025, 3, 1, 9, 0), title="shot.png")),
        (DIR + "Screenshot_20250301-101010.png", jpeg(scene(6, "street", 0.9, 6), fmt="PNG")),
        (DIR + "Screenshot_20250301-101010.png.json", sidecar(utc(2025, 3, 1, 9, 10))),
        (DIR + "old.jpg", jpeg(scene(9, "sea", 0.9, 9), "2023:05:05 10:00:00", "+02:00")),
        (DIR + "nodate.jpg", jpeg(scene(10, "sea", 0.9, 25))),
        (DIR + "broken.jpg", b"\xff\xd8\xff\xe0 not really a jpeg" * 20),
        (DIR + "movie.mp4", b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 500),
        (DIR + "card.jpg", jpeg(scene(7, "building", 0.9, 7), "2025:03:01 15:00:00", "+01:00")),
        (DIR + "food_json.jpg", jpeg(scene(8, "food", 0.9, 8))),
    ]
    cats2 = ["food"] * 6 + ["street"] * 3 + ["nature"] * 3
    for i, c in enumerate(cats2):
        aes = 1.0 if c == "food" else 0.8
        files1.append((DIR + f"d2_{i:02d}.jpg",
                       jpeg(scene(100 + i, c, aes, 10 + i), f"2025:03:02 {9 + i:02d}:00:00", "+01:00")))
    files1.append((DIR + "midnight.jpg", jpeg(scene(30, "street", 0.9, 22), "2025:03:04 00:30:00", "+02:00")))
    files1.append((DIR + "midnight.jpg.supplemental-metadata.json", sidecar(utc(2025, 3, 3, 22, 30), title="midnight.jpg")))

    # 2本目。1本目の写真の横の JSON が、こちらに入っている（割れ目をまたぐ）
    files2.append((DIR + "food_json.jpg.supplemental-metadata.json",
                   sidecar(utc(2025, 3, 1, 12, 0), 42.0, 13.0, "food_json.jpg")))
    files2 += [
        (DIR + "border.jpg", jpeg(scene(40, "nature", 0.44, 23), "2025:03:05 10:00:00", "+01:00")),
        (DIR + "lab_no.jpg", jpeg(scene(41, "food", 0.9, 63), "2025:03:06 10:00:00", "+01:00")),
        (DIR + "lab_near.jpg", jpeg(scene(42, "food", 0.05, 62), "2025:03:07 10:00:00", "+01:00")),
        (DIR + LONG, jpeg(scene(43, "mountain", 0.9, 24))),
        (DIR + LONG[:46] + ".json", sidecar(utc(2025, 3, 9, 9, 0), 0, 15.0, LONG)),
    ]
    for k in range(8):
        for j, aes in enumerate((0.9, 0.1)):
            files2.append((DIR + f"d{10 + k}_{j}.jpg",
                           jpeg(scene(200 + 2 * k + j, ["sea", "nature"][j], aes, 30 + 2 * k + j),
                                f"2025:03:{11 + k:02d} {10 + j:02d}:00:00", "+01:00")))
    for z, files in ((z1, files1), (z2, files2)):
        with zipfile.ZipFile(z, "w", zipfile.ZIP_STORED) as zf:
            for n, b in files:
                zf.writestr(n, b)
    for n, b in files1 + files2:
        if not n.endswith(".json"):
            NAMES.setdefault(n.rsplit("/", 1)[-1], scan.sha256(b))
    card = scene(7, "building", 0.9, 7).resize((400, 300))
    cb = io.BytesIO()
    card.save(cb, "WEBP", quality=80)
    return z1, z2, cb.getvalue()


# 場面 62/63 は、答え「no」と、それに近い写真。番号の札は 0〜63 にしか描けないので VECS を差し替える
VECS[63] = VECS[100]
VECS[62] = VECS[101]


# ---------------------------------------------------------------- 回す

def pipeline(tmp: Path, fx, name: str, *, limit_first: int | None = None, crash_after: int | None = None,
             calib: bool = False, labels: dict | None = None):
    """偽の zip 2本を読む → 既存のカード → 選ぶ → 出す。台帳の置き場ごと作り直す。"""
    z1, z2, card = fx
    root = tmp / name
    shutil.rmtree(root, ignore_errors=True)
    root.mkdir(parents=True)
    cfg = conf.load(CFG)
    db = open_db(root)
    news = 0
    quiet = (lambda *a, **k: None)
    # 本番と同じ順: 既存のカードを先に数えてから読む（読み終えるたびの prune が既存を見る）。
    # 逆の順でしか回していなかったので、prune が既存に近い写真の絵を消すと、選ぶときに
    # 「既存」ではなく「ほぼ同じ」に数えてしまうのを見逃した（EC2 の実地で出た）
    existing.refresh(db, cfg, FakeClip(), photos=[("2025-03-01", "https://example.invalid/card.webp")],
                     fetch=lambda url: card, log=quiet)
    if crash_after is not None:
        try:
            scan.scan(db, root, cfg, sources.open_source(str(z1)), FakeClip(crash_after), RANGE, log=quiet)
        except RuntimeError:
            pass
        db.close()
        db = open_db(root)   # 落ちたプロセスの代わりに、開き直す
    if limit_first is not None:
        st = scan.scan(db, root, cfg, sources.open_source(str(z1)), FakeClip(), RANGE, limit=limit_first, log=quiet)
        news += st["new"]
    em = FakeClip()
    for z in (z1, z2):
        st = scan.scan(db, root, cfg, sources.open_source(str(z)), em, RANGE, log=quiet)
        news += st["new"]
    if labels:
        for sha, ans in labels.items():
            db.execute("INSERT OR REPLACE INTO labels VALUES(?,?,?)", (sha, ans, 0))
        db.commit()
    m = choose.select(db, root, cfg, "2025-test", RANGE, calib)
    return {"root": root, "db": db, "cfg": cfg, "m": m, "news": news, "calls": em.calls}


def sha_of(n: str) -> str:
    return NAMES[n]


def legs(tmp: Path, fx, only: str | None = None) -> dict[str, list[str]]:
    """足ごとの、合っていなかったこと（空なら通った）。`only` は対照で回す1本だけ。"""
    out: dict[str, list[str]] = {}

    def leg(name, fn):
        try:
            out[name] = fn()
        except Exception as e:  # noqa: BLE001
            out[name] = [f"落ちた: {type(e).__name__}: {e}"]

    A: dict = {}

    def base():
        A.update(pipeline(tmp, fx, "a"))
        return []

    leg("回る", base)
    if out["回る"]:
        return out
    m, root, db, cfg = A["m"], A["root"], A["db"], A["cfg"]
    cands = {i["sha"]: i for i in m["items"] if i["kind"] == "candidate"}

    def counts():
        want = {"scanned": 47, "notImage": 1, "outOfRange": 2, "exactDup": 1, "broken": 1, "lowQuality": 3,
                "irrelevant": 2, "nearDup": 1, "alreadyCard": 1, "pool": 35, "selected": 28, "calib": 0}
        ng = [f"{k}: {m['counts'].get(k)}（期待 {v}）" for k, v in want.items() if m["counts"].get(k) != v]
        s = sum(m["counts"][k] for k in choose.STAGES) + m["counts"]["pool"]
        if s != m["counts"]["scanned"]:
            ng.append(f"行き先の和 {s} が scanned {m['counts']['scanned']} と合わない")
        for n in ("s1.jpg", "food_json.jpg", "midnight.jpg", "border.jpg", LONG):
            if sha_of(n) not in cands:
                ng.append(f"{n} が選ばれていない")
        for n in ("s1b.jpg", "dark.jpg", "blur.jpg", "small.jpg", "shot.png", "card.jpg",
                  "Screenshot_20250301-101010.png", "old.jpg", "nodate.jpg"):
            if sha_of(n) in cands:
                ng.append(f"{n} が選ばれてしまった")
        return ng

    def quota():
        d2 = [i for i in cands.values() if i["day"] == "2025-03-02"]
        return [] if len(d2) == 5 else [f"03-02 に {len(d2)}枚（良い12枚から 1+⌊1.2√12⌋=5 のはず）"]

    def diversity():
        cats = {i["category"] for i in cands.values() if i["day"] == "2025-03-02"}
        return [] if len(cats) >= 3 else [f"03-02 の種類が {sorted(cats)} に偏った"]

    def local_day():
        i = cands.get(sha_of("midnight.jpg"))
        ng = []
        if not i or i["day"] != "2025-03-04":
            ng.append(f"現地 00:30 の写真の日が {i and i['day']}（03-04 のはず）")
        elif i["takenAt"] != "2025-03-04T00:30:00+02:00":
            ng.append(f"takenAt が {i['takenAt']}")
        j = cands.get(sha_of("food_json.jpg"))
        if not j or j["takenAt"] != "2025-03-01T13:00:00+01:00":
            ng.append(f"別の zip の JSON から日付が引けていない: {j and j['takenAt']}")
        return ng

    def ambiguous():
        ng = []
        b = cands.get(sha_of("border.jpg"))
        if not b or not b["ambiguous"]:
            ng.append("境目の1枚に ambiguous が付いていない")
        if cands.get(sha_of("s1.jpg"), {}).get("ambiguous"):
            ng.append("良い写真に ambiguous が付いた")
        if len(m["missing"]) != 2 or m["missing"][0]["from"] != "2025-01-01" or m["missing"][0]["to"] != "2025-02-28":
            ng.append(f"写真の無い期間が違う: {m['missing']}")
        return ng

    def tar_and_sheet():
        ng = []
        pages = sheet.sheet(db, root, "2025-test")
        n_amb = sum(1 for i in cands.values() if i["ambiguous"])
        if len(pages) != (n_amb + 19) // 20 or Image.open(pages[0]).size != (1280, 1024):
            ng.append(f"一覧画が {len(pages)}枚（迷う {n_amb}枚）")
        first = db.execute("SELECT sha FROM sheets WHERE batch='2025-test' AND num=1").fetchone()[0]
        r = sheet.judge(db, "2025-test", sheet.parse_marks(["1=d"]))
        if r != {"keep": 0, "drop": 1, "unknown": 0}:
            ng.append(f"judge の答え {r}")
        out, man = pack.pack(db, root, cfg, "2025-test")
        with tarfile.open(out) as t:
            names = t.getnames()
            mf = t.extractfile("manifest.json").read().decode()
            blobs = {n: t.extractfile(n).read() for n in names if n.endswith(".webp")}
        j = json.loads(mf)
        if names[0] != "manifest.json" or len(names) != 1 + 2 * len(j["items"]):
            ng.append(f"tar の中身の数 {len(names)}（manifest の {len(j['items'])}枚ぶんと合わない）")
        if first in {i["sha"] for i in j["items"]} or j["counts"]["selected"] != 27:
            ng.append(f"一覧画で落とした1枚が残った（selected={j['counts']['selected']}）")
        if set(j) != {"batch", "source", "range", "missing", "counts", "items"}:
            ng.append(f"manifest の欄 {sorted(j)}")
        for it in j["items"]:
            if list(it) != pack.ITEM_KEYS:
                ng.append(f"項目の欄 {list(it)}")
                break
            if max(it["w"], it["h"]) > 1600 or max(it["tw"], it["th"]) > 400:
                ng.append("寸法が大きすぎる")
                break
        for bad in ("Takeout", "Photos from", ".jpg", ".png", "latitude", "lat", "lng", "41.99", "21.43", "FakeCam"):
            if bad in mf:
                ng.append(f"manifest に {bad!r} が出ている")
        for n, b in blobs.items():
            if b[:4] != b"RIFF" or b[8:12] != b"WEBP":
                ng.append(f"{n} が webp でない")
            elif b"EXIF" in b or b"FakeCam" in b:
                ng.append("webp に EXIF（位置）が残っている")
                break
        f = io.StringIO()
        with redirect_stdout(f):
            rc = run.main(["--root", str(root), "status"])
        if rc != 0 or any(x in f.getvalue() for x in ("Takeout", ".jpg", "s1", "41.99")):
            ng.append("status が名前・場所を出した")
        return ng

    def resume():
        ng = []
        b = pipeline(tmp, fx, "b", limit_first=7)
        c = pipeline(tmp, fx, "c", crash_after=5)
        for name, other in (("7枚で止めて再開", b), ("5枚目で落ちて再開", c)):
            if json.dumps(other["m"], sort_keys=True) != json.dumps(m, sort_keys=True):
                ng.append(f"{name}: 結果が違う")
        if b["news"] != A["news"]:
            ng.append(f"止めて再開で読んだ数 {b['news']}（続けて読むと {A['news']}）")
        return ng

    def labels():
        no, near = sha_of("lab_no.jpg"), sha_of("lab_near.jpg")
        ng = []
        if no not in cands or near not in cands:
            return ["答えの前から、答えの写真が選ばれていない（仕込みが効いていない）"]
        c = sum(a * b for a, b in zip(VECS[100], VECS[101]))
        if not (0.85 <= c < 0.94):
            return [f"仕込みの近さ {c:.3f} が 0.85〜0.94 に無い"]
        d = pipeline(tmp, fx, "d", labels={no: "no"})
        got = {i["sha"] for i in d["m"]["items"] if i["kind"] == "candidate"}
        if no in got:
            ng.append("答え no の写真が残った")
        if near in got:
            ng.append("答え no に近い写真が下がらなかった")
        if d["m"]["counts"]["selected"] != 26:
            ng.append(f"答えのあとの selected={d['m']['counts']['selected']}（26 のはず）")
        return ng

    def calib():
        e = pipeline(tmp, fx, "e", calib=True)
        cal = [i for i in e["m"]["items"] if i["kind"] == "calib"]
        ng = []
        if len(cal) != 24:
            ng.append(f"認識合わせが {len(cal)}枚")
        cand = {i["sha"] for i in e["m"]["items"] if i["kind"] == "candidate"}
        if cand & {i["sha"] for i in cal}:
            ng.append("候補と認識合わせに同じ写真が入った")
        took = sum(1 for i in cal if i["sha"] in cands)
        if took < 4 or len(cal) - took < 4:
            ng.append(f"採りそう {took}・落としそう {len(cal) - took} に偏った")
        if e["m"]["counts"]["calib"] + e["m"]["counts"]["selected"] > 28 + 24:
            ng.append("数が合わない")
        return ng

    def names():
        ng = []
        for j, want in [("IMG_1234.JPG.json", "IMG_1234.JPG"),
                        ("IMG_1234.JPG.supplemental-metadata.json", "IMG_1234.JPG"),
                        ("IMG_1234.JPG.supplemental-metadata(1).json", "IMG_1234(1).JPG"),
                        ("IMG_1234.JPG(1).json", "IMG_1234(1).JPG"),
                        ("PXL_20250301_101010123.MP.jpg.supplemental-met.json", "PXL_20250301_101010123.MP.jpg")]:
            got = sources.sidecar_media_name(j)
            if got != want:
                ng.append(f"{j} → {got}（{want} のはず）")
        # 本番の config.json が、見張りの差し替えと同じ欄を持っているか
        real = conf.load()
        for sec, d in CFG.items():
            for k in d:
                if k not in real.get(sec, {}):
                    ng.append(f"config.json に {sec}.{k} が無い")
        return ng

    for name, fn in (("数と顔ぶれ", counts), ("1日の上限", quota), ("同じ日の散らばり", diversity),
                     ("撮った土地の日付", local_day), ("迷う印", ambiguous), ("tar と一覧画", tar_and_sheet),
                     ("途中から再開", resume), ("答えを効かせる", labels), ("認識合わせ", calib),
                     ("名前と設定", names)):
        if only is None or name == only:
            leg(name, fn)
    db.close()
    return out


# 守り → それを外すと赤くなるはずの足
DRILL = {
    "exactDup": "数と顔ぶれ", "range": "数と顔ぶれ", "quality": "数と顔ぶれ", "irrelevant": "数と顔ぶれ",
    "group": "数と顔ぶれ", "existing": "数と顔ぶれ", "quota": "1日の上限", "diversity": "同じ日の散らばり",
    "localDay": "撮った土地の日付", "stripExif": "tar と一覧画", "resume": "途中から再開",
    "labels": "答えを効かせる",
}


def main() -> int:
    t0 = time.monotonic()
    tmp = Path(tempfile.mkdtemp(prefix="cardimport-selftest-"))
    try:
        fx = build_zips(tmp)
        if set(DRILL) != set(guards.ON):
            print(f"対照の表と守りの札がずれている: {sorted(set(DRILL) ^ set(guards.ON))}")
            return 2
        # 対照: 守りを1つずつ外して、その足が赤くなるか
        missed = []
        for g, want in DRILL.items():
            guards.ON[g] = False
            try:
                r = legs(tmp, fx, only=want)
            except Exception:  # noqa: BLE001
                r = {want: ["落ちた"]}
            finally:
                guards.ON[g] = True
            red = r.get(want) or r.get("回る")
            print(f"  対照 {g:<10} を外す → {want}: {'赤（よい）' if red else '緑のまま'}")
            if not red:
                missed.append(g)
        if missed:
            print(f"対照が当たらない（外しても赤くならない守り）: {missed}")
            return 2
        r = legs(tmp, fx)
        bad = {k: v for k, v in r.items() if v}
        for k, v in r.items():
            print(f"{'OK' if not v else 'NG'} {k}" + ("" if not v else "\n    " + "\n    ".join(v)))
        print(f"足 {len(r)}本・対照 {len(DRILL)}個・{time.monotonic() - t0:.0f} 秒")
        return 1 if bad else 0
    except Exception:  # noqa: BLE001
        traceback.print_exc()
        return 2
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
