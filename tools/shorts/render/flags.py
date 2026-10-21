#!/usr/bin/env python3
"""題の札などの字に置く国旗の絵（flags/<小文字の2字>.png）を足す・確かめる。

    python3 tools/shorts/render/flags.py add AL=アルバニア MK=北マケドニア   # 落として PNG に焼き、flags/SOURCES.json に控える
    python3 tools/shorts/render/flags.py check            # PNG が控えのとおりか（書き出しの前にも回せる）
    python3 tools/shorts/render/flags.py emoji アルバニア   # 🇦🇱（題に書く字。2字の AL でもよい）
    python3 tools/shorts/render/flags.py list             # いま入っている国（絵文字・2字・名前）

国の2字は ISO 3166-1 alpha-2（コソボは国際的に使われている XK）。題の札には、この絵文字を国の名前の前に書く
（`"title_card": "🇦🇱アルバニアの…"`）。絵が無い国の題を書き出すと、render.py がこのコマンドを出して止まる。

## なぜ絵を git に置くか

書き出しは作業箱と Actions のランナーで同じバイト列を出す（双子を sha256 で比べる）。SVG をその場で
焼くと、焼く道具の版で画素が変わるうえ、ランナーに道具を足す必要がある。PNG にしておけば Pillow が
読むだけで、どこで書き出しても同じ画素になる。1国 1〜30KB（紋章のある国ほど大きい）。

## 出どころと許諾

region-flags（noto-emoji の third_party。Noto Color Emoji の国旗の元）。Wikipedia から落として
パブリックドメイン（または著作権の対象外）と確かめた国旗の SVG。**クレジットは要らない。** 版は
noto-emoji のタグで止める（中身が変わらない）。詳しくは flags/README.md。

焼くのは resvg（resvg-py）。作業箱で足すときだけ要る:

    pip install resvg-py==0.5.0
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
DIR = HERE / "flags"
MANIFEST = DIR / "SOURCES.json"
TAG = "v2.047"
URL = "https://raw.githubusercontent.com/googlefonts/noto-emoji/{tag}/third_party/region-flags/svg/{code}.svg"
# 焼く高さ。いちばん大きい字（【大】の 184px）に 0.82em で置いても、出来上がりで縮める側に収まる
HEIGHT = 256


def emoji(code: str) -> str:
    return "".join(chr(0x1F1E6 + ord(c) - ord("A")) for c in code.upper())


def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def load() -> dict:
    return json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}


def save(m: dict):
    MANIFEST.write_text(json.dumps(dict(sorted(m.items())), ensure_ascii=False, indent=1) + "\n")


def rasterize(svg: bytes) -> bytes:
    try:
        import resvg_py
    except ImportError:
        sys.exit("resvg-py が無い（pip install resvg-py==0.5.0）。焼くのは足すときだけ")
    from PIL import Image
    png = bytes(resvg_py.svg_to_bytes(svg_string=svg.decode("utf-8"), height=HEIGHT))
    img = Image.open(io.BytesIO(png)).convert("RGBA")
    out = io.BytesIO()
    # 日付などを持たせない（同じ SVG から同じバイト列）
    img.save(out, "PNG", optimize=True)
    return out.getvalue()


def add(codes: list[str]):
    """codes: 「AL」か「AL=アルバニア」。名前は emoji・list で国を名前から引くため（題を書く人は国の名前で考える）。"""
    m = load()
    DIR.mkdir(exist_ok=True)
    try:
        from importlib.metadata import version
        tool = f"resvg-py {version('resvg-py')}"
    except Exception:
        tool = "resvg-py"
    for arg in codes:
        code, _, name = arg.partition("=")
        code = code.upper()
        name = name or m.get(code, {}).get("name", "")
        if len(code) != 2 or not code.isascii() or not code.isalpha():
            sys.exit(f"国は ISO 3166-1 の2字で（AL・MK・XK）: {code}")
        url = URL.format(tag=TAG, code=code)
        try:
            svg = urllib.request.urlopen(url, timeout=30).read()
        except Exception as e:
            sys.exit(f"{code}: 落とせなかった（{e}）。region-flags に無い国かもしれない: {url}")
        png = rasterize(svg)
        (DIR / f"{code.lower()}.png").write_bytes(png)
        m[code] = {"emoji": emoji(code), "name": name, "svg": url, "svg_sha256": sha(svg), "png_sha256": sha(png),
                   "height": HEIGHT, "tool": tool}
        print(f"{emoji(code)} {code} {name}: {len(png)} バイト")
    save(m)


def lookup(key: str) -> str:
    """2字か国の名前から、2字。名前は控えにある国だけ引ける。"""
    if len(key) == 2 and key.isascii() and key.isalpha():
        return key.upper()
    hit = [c for c, e in load().items() if e.get("name") == key]
    if not hit:
        sys.exit(f"国の名前が控えに無い: {key}（2字で書くか、flags.py add XX={key} で足す）")
    return hit[0]


def check() -> list[str]:
    """控えと PNG の食い違い（無ければ空）。"""
    m = load()
    problems = []
    for code, ent in m.items():
        p = DIR / f"{code.lower()}.png"
        if not p.exists():
            problems.append(f"{code}: 控えにあるのに {p.name} が無い")
        elif sha(p.read_bytes()) != ent["png_sha256"]:
            problems.append(f"{code}: {p.name} が控えの sha256 と違う（手で直した？ flags.py add {code} で焼き直す）")
    for p in sorted(DIR.glob("*.png")):
        if p.stem.upper() not in m:
            problems.append(f"{p.name}: 控え（SOURCES.json）に無い。出どころの分からない絵は焼かない")
    return problems


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("add")
    a.add_argument("codes", nargs="+")
    sub.add_parser("check")
    e = sub.add_parser("emoji")
    e.add_argument("codes", nargs="+")
    sub.add_parser("list")
    args = ap.parse_args()
    if args.cmd == "add":
        add(args.codes)
    elif args.cmd == "check":
        pr = check()
        for x in pr:
            print(x, file=sys.stderr)
        print(f"国旗 {len(load())} 国" + ("" if not pr else f"・食い違い {len(pr)} 件"))
        sys.exit(1 if pr else 0)
    elif args.cmd == "emoji":
        print(" ".join(emoji(lookup(c)) for c in args.codes))
    else:
        for code, ent in load().items():
            print(f"{ent['emoji']} {code} {ent.get('name', '')}")


if __name__ == "__main__":
    main()
