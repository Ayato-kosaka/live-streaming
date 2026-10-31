"""**題の札の国旗（「🇦🇱アルバニアの…」）が、描かれるときに描かれるか。** 書き出し（ffmpeg）は使わない。

    python3 tools/shorts/render/flag_selftest.py
    BREAK=draw python3 tools/shorts/render/flag_selftest.py   # 守りを1つ外した版で回す（対照の子）

終了コード 0=通った / 1=落ちた / **2=数えるものが無い・外す字が見つからない**
（`docs/island-standards.md` §15）。

要るのは numpy・Pillow・OpenCV（字の縁を `textlook.py` が OpenCV で測る）と budoux。Selftests には numpy が
無いので、回し役（`python/selftest_runner.py`）の SKIP に理由つきで載せ、`.github/workflows/shorts_selftest.yml`
が名指しで回す（BGM の物差しの見張りと同じ形）。書体は本物（`fetch_fonts.sh`）が無ければ、箱にある書体を
同じ名前で置く（国旗は絵なので、和文が豆腐でも国旗の画素は同じに出る）。

## 何を見るか

本物の `render.py`・`textlook.py`・`flags.py` と、git に入っている国旗の絵（`flags/`）で回す。

| 足 | 確かめること |
| --- | --- |
| `title_flag` | ホステルの回の題（様式 v3）に 🇦🇱 を書くと、1行目の頭に**アルバニアの赤と鷲の黒**が出る。赤の塊の縦横比が国旗（7:5）で、高さが字の大きさの 0.82 倍前後。国旗の右に1行目の白い字が始まり、国旗と字が重ならない。🇦🇱 の無い同じ題には、その赤が1画素も無い |
| `dark_edge` | 縁の無い様式（style.json の黒い箱に白い字）で 🇩🇪 を置いても、黒い帯の上の辺に明るい縁が出る（黒い箱に溶けない） |
| `measure` | 国旗1つの送り幅が「絵の縦横比 × 高さ 0.82em ＋ 両側 0.09em」。数は `textlook.py` の関数を使わずに PNG の大きさから手で出す |
| `glue` | 折り返しで国旗を割らない・国の名前から離さない（地域指示子の間・国旗の直後では割らない。空白を挟んでも。割ってよい所は `qa/linebreak.py`） |
| `missing` | 絵の無い国（ZZ）は、豆腐を焼かずに止まり、足す手順（`flags.py add ZZ`）を言う |
| `manifest` | `flags/` の PNG が控え（`SOURCES.json`）の sha256 どおり。PNG を1枚いじると、控えとの食い違いとして出る |

## 守りを1つずつ外す（§15「対照は、足の数だけ用意する」）

下の `CUTS` が本物の字を1か所だけ書き換えた写しを作り、それで足を全部回す。**外した守りの足だけが落ちる**
ことを確かめる。外す字が本物に見つからなければ 2 で落ちる（字を直したのに、ここを直し忘れた）。
"""
from __future__ import annotations

import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
BREAK = os.environ.get("BREAK", "")
AL = "\U0001F1E6\U0001F1F1"   # 🇦🇱
DE = "\U0001F1E9\U0001F1EA"   # 🇩🇪
HOSTEL = "アルバニアの1泊1400円ホステルが、\n異常すぎた"   # shorts/videos/zjHZucyfrq8/p2 の題の札

# 名前: (ファイル, 本物の字, 外した字, 落ちるはずの足, 何を外したか)
CUTS: dict[str, tuple[str, str, str, set[str], str]] = {
    "draw": ("textlook.py", "                    flags.append((im, fx, fy))\n", "                    pass\n",
             {"title_flag", "dark_edge"}, "国旗の絵を置かない（送り幅だけ空く）"),
    "measure": ("textlook.py",
                "            total += flag_box(flag_code(seg), font.size, c)[0] + 2 * c[\"side_em\"] * font.size"
                " + tracking * font.size\n",
                "            total += 0.0\n",
                {"title_flag", "measure"}, "国旗の送り幅を数えない（国旗に字が重なる）"),
    "edge": ("textlook.py", "    ew = c.get(\"edge_em\", 0) * size\n", "    ew = 0\n",
             {"dark_edge"}, "国旗の内側の明るい縁を引かない"),
    "glue": ("render.py", "        if out and pos in keep:\n", "        if False:\n",
             {"glue"}, "国旗の中・直後で文節を割る"),
    # 書き出しの「1字ずつ割る」は無くなった（語の途中で割れた。2026-10-21）。割れ目は qa/linebreak.py が決めるので、
    # そちらの「国旗の直後（空白を挟んでも）は割らない」を外す
    "cut": ("../qa/linebreak.py", "            return \"国旗の直後（国旗は後ろの国の名前と1つ）\"\n", "            pass\n",
            {"glue"}, "割ってよい所の決め（qa/linebreak.py）で、国旗の直後を割ってよいことにする"),
    "missing": ("textlook.py", "    if not path.exists():\n",
                "    if not path.exists():\n        return Image.new(\"RGBA\", (7, 5))\n",
                {"missing"}, "絵の無い国で止まらない（透明な絵を黙って置く）"),
    "manifest": ("flags.py", "        elif sha(p.read_bytes()) != ent[\"png_sha256\"]:\n", "        elif False:\n",
                 {"manifest"}, "控えの sha256 と PNG を比べない"),
}


# ---------------------------------------------------------------- 道具の用意

def fonts_dir(box: Path) -> Path | None:
    """本物の書体（fetch_fonts.sh）が無ければ、箱の太字を M PLUS の名前で置く（drill.py と同じ考え）。"""
    names = ["MPLUSRounded1c-ExtraBold.ttf", "MPLUSRounded1c-Black.ttf"]
    for d in [os.environ.get("SHORTS_FONTS_DIR"), str(HERE / "fonts")]:
        if d and all((Path(d) / n).exists() for n in names):
            return Path(d)
    cands = []
    for root in ("/usr/share/fonts", "/usr/local/share/fonts"):
        if os.path.isdir(root):
            cands += sorted(Path(root).rglob("*.ttf"))
    pick = next((p for p in cands if "Bold" in p.name), cands[0] if cands else None)
    if pick is None:
        return None
    d = box / "fonts"
    d.mkdir(exist_ok=True)
    for n in names:
        (d / n).symlink_to(pick)
    return d


def make_src(dst: Path, cut: str | None) -> None:
    """本物を写す（守りを1つ外すなら、その字だけ書き換える）。外す字が無ければ 2 で落ちる。"""
    for name in ("render.py", "textlook.py", "flags.py", "style.json", "style_p3.json", "style_v3.json"):
        shutil.copy(HERE / name, dst / name)
    shutil.copytree(HERE / "flags", dst / "flags")
    # 書き出しは割ってよい所を品質チェックの qa/linebreak.py から読む（render.py の隣の ../qa/）
    (dst.parent / "qa").mkdir(exist_ok=True)
    shutil.copy(HERE.parent / "qa" / "linebreak.py", dst.parent / "qa" / "linebreak.py")
    if cut:
        fname, old, new, _, _ = CUTS[cut]
        text = (dst / fname).read_text(encoding="utf-8")
        if text.count(old) != 1:
            print(f"✕ BREAK={cut}: 外す字が {fname} に {text.count(old)} か所（1か所のはず）。字を直したら CUTS も直す")
            sys.exit(2)
        (dst / fname).write_text(text.replace(old, new), encoding="utf-8")


def load(src: Path):
    """写しの render.py（と、それが読む textlook.py）・flags.py を読み込む。"""
    for name in ("render", "textlook", "flags"):
        sys.modules.pop(name, None)
    sys.path.insert(0, str(src))
    try:
        mods = []
        for name in ("render", "flags"):
            spec = importlib.util.spec_from_file_location(name, src / f"{name}.py")
            mod = importlib.util.module_from_spec(spec)
            sys.modules[name] = mod
            spec.loader.exec_module(mod)
            mods.append(mod)
        return mods[0], sys.modules["textlook"], mods[1]
    finally:
        sys.path.pop(0)


# ---------------------------------------------------------------- 足

def al_red(a):
    """アルバニアの赤（region-flags の #E41E20）の、面になっている所。

    題の札の2行目の赤い縁（#EF0101）は、黄の字や発光とのにじみの1〜2画素だけが同じ色になる（179画素あった）。
    5x5 で削って、面（国旗）だけを残す。
    """
    import cv2
    import numpy as np
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    m = (np.abs(r - 228) <= 22) & (np.abs(g - 30) <= 18) & (np.abs(b - 32) <= 18) & (a[..., 3] >= 250)
    return cv2.erode(m.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)


def leg_title_flag(R, TL, F) -> list[tuple[str, bool]]:
    import numpy as np
    style = R.load_style("style_v3.json", HERE)
    st = style["title_card"]
    with_flag = np.asarray(R.title_card_img(AL + HOSTEL, st, style))
    plain = np.asarray(R.title_card_img(HOSTEL, st, style))
    red = al_red(with_flag)
    out = [(f"🇦🇱 の無い題に、アルバニアの赤が無い（{int(al_red(plain).sum())} 画素）", int(al_red(plain).sum()) == 0)]
    n = int(red.sum())
    out.append((f"🇦🇱 を書いた題に、アルバニアの赤がある（{n} 画素）", n >= 1500))
    if n < 1500:
        return out
    ys, xs = np.nonzero(red)
    # 削った面に、削った 2px と内側の白い縁（約 2px）を戻して、国旗の外形にする
    y0, y1, x0, x1 = ys.min() - 4, ys.max() + 5, xs.min() - 4, xs.max() + 5
    h, w = y1 - y0, x1 - x0
    # 1行目の字の大きさ（様式 v3 の1行目は 82px。箱に収めるため 52px まで縮むことがある）
    size_hi, size_lo = st["lines"][0]["size"], st["lines"][0]["min_size"]
    out.append((f"赤の塊の縦横比が国旗（7:5 = 1.40）に近い（{w}x{h} = {w / h:.2f}）", abs(w / h - 1.4) <= 0.15))
    out.append((f"赤の塊の高さが 1行目の字の 0.82 倍前後（{h}px。{size_lo}〜{size_hi}px の字なら "
                f"{0.82 * size_lo * 0.85:.0f}〜{0.82 * size_hi:.0f}px）", 0.82 * size_lo * 0.85 <= h <= 0.82 * size_hi))
    H, W = red.shape
    out.append((f"国旗が1行目（札の上半分）の左寄り（左上 {x0},{y0}・札 {W}x{H}）", y1 <= H / 2 and x1 <= W * 0.45))
    box = with_flag[y0:y1, x0:x1]
    dark = (box[..., :3].max(axis=-1) < 70) & (box[..., 3] >= 250)
    out.append((f"赤の中に鷲の黒がある（{dark.mean() * 100:.1f}%）", 0.03 <= dark.mean() <= 0.4))
    # 国旗の右の、同じ高さの白い字（1行目「アルバニアの」）。国旗の右端より右から始まる
    band = with_flag[y0:y1]
    white = (band[..., :3].min(axis=-1) >= 235) & (band[..., 3] >= 250)
    wx = np.nonzero(white.any(axis=0))[0]
    right = wx[wx > x1 - 1]
    out.append((f"国旗の右に1行目の白い字が続く（右端 {x1}・字の始まり {right.min() if len(right) else '無し'}）",
                len(right) > 0 and right.min() > x1))
    # 国旗の上に字が重なっていない（赤の塊の中に、字の白がほぼ無い。縁の白は外周の 3px に収まる）
    inner = white[:, x0 + 4:x1 - 4][4:-4]
    out.append((f"国旗の中に字の白が重なっていない（{int(inner.sum())} 画素）", int(inner.sum()) <= 20))
    return out


def leg_dark_edge(R, TL, F) -> list[tuple[str, bool]]:
    """ドイツの黒い帯が、黒い箱の上で縁ごと消えないか。縁の無い様式（style.json）で見る。"""
    import numpy as np
    style = R.load_style("style.json", HERE)
    st = style["title_card"]
    a = np.asarray(R.title_card_img(DE + "ドイツの\n安すぎる宿", st, style))
    rgb = a[..., :3].astype(int)
    gold = (rgb[..., 0] >= 230) & (rgb[..., 1] >= 170) & (rgb[..., 1] <= 225) & (rgb[..., 2] <= 60)
    out = [(f"ドイツの金（黄）の帯がある（{int(gold.sum())} 画素）", int(gold.sum()) >= 200)]
    if gold.sum() < 200:
        return out
    ys, xs = np.nonzero(gold)
    x0, x1 = xs.min(), xs.max() + 1
    band = ys.max() + 1 - ys.min()
    xm = slice(x0 + (x1 - x0) // 4, x1 - (x1 - x0) // 4)   # 角の丸みを避けて、帯の真ん中の半分の幅で見る
    rows = rgb[:, xm].mean(axis=1)                 # 行ごとの平均の色
    # 金の帯から上へ、赤の帯を抜けた所が黒の帯。そこから上へ帯 1.6本ぶんのうちに、明るい行（縁）があるか。
    # 縁が無ければ、黒の帯はそのまま黒い箱へつながって、明るい行は1つも無い
    y = ys.min() - 1
    while y > 0 and rows[y, 0] > 120 and rows[y, 1] < 90:
        y -= 1
    red_top = y + 1
    win = rows[max(0, red_top - int(1.6 * band)):red_top].mean(axis=1)
    black = rows[max(0, red_top - band // 2), :].mean()
    out.append((f"赤の帯の上は黒い帯（明るさ {black:.0f}）", black < 40))
    out.append((f"黒い帯の上の辺に明るい縁がある（赤の帯の上端 {red_top}・その上でいちばん明るい行 "
                f"{win.max() if len(win) else 0:.0f}）", len(win) > 0 and win.max() >= 120))
    return out


def leg_measure(R, TL, F) -> list[tuple[str, bool]]:
    from PIL import Image, ImageFont
    out = []
    font = ImageFont.truetype(str(R.font_path(R.load_style("style.json", HERE), "caption")), 100)
    for code, pair in (("AL", AL), ("DE", DE)):
        im = Image.open(HERE / "flags" / f"{code.lower()}.png")
        want = 0.82 * 100 * im.width / im.height + 2 * 0.09 * 100
        got = TL.advance(pair, font, 0.0)
        out.append((f"{code} の送り幅 {got:.1f}px（手で出した値 {want:.1f}px）", abs(got - want) <= 0.5))
    plain = "アルバニアの"
    got = TL.advance(AL + plain, font, -0.04)
    want = TL.advance(AL, font, -0.04) + TL.advance(plain, font, -0.04)
    out.append((f"国旗＋字の送り幅が、国旗と字の和（{got:.1f} / {want:.1f}）", abs(got - want) <= 0.01))
    return out


def leg_glue(R, TL, F) -> list[tuple[str, bool]]:
    from PIL import ImageFont
    out = []
    ri = set(AL)
    got = R.glue_flags(["ようこそ", AL[0], AL[1], "アルバニアへ"])
    out.append((f"地域指示子の間で割れた文節をつなぐ（{got}）", got == ["ようこそ", AL + "アルバニアへ"]))
    got = R.glue_flags(["今日は", AL, "アルバニア"])
    out.append((f"国旗だけの文節を、後ろの国の名前につなぐ（{got}）", got == ["今日は", AL + "アルバニア"]))
    # 書き出しは「1字ずつ割る」をやめた（語の途中で割れた。2026-10-21）。割れ目は qa/linebreak.py が決め、
    # 国旗の中と直後（空白を挟んでも）は割らない
    got = R.chunks_of("ようこそ" + AL + " アルバニアへ")
    out.append((f"国旗と後ろの国の名前の間（空白を挟む）で割らない（{got}）",
                [c for c in got if AL in c] == [c for c in got if "アルバニア" in c] != []))
    font = ImageFont.truetype(str(R.font_path(R.load_style("style.json", HERE), "caption")), 60)
    text = "ついに" + AL + "アルバニアに着いたけど宿が見つからへん"
    for width in (300, 420, 560):
        lines = R.wrap(text, font, width)
        bad = [ln for ln in lines if ln.endswith(AL) or (ln and (ln[0] in ri) != ln.startswith(AL)) or
               any(ch in ri for ch in TL.FLAG_RE.sub("", ln))]
        out.append((f"幅 {width}px の折り返しで、国旗が割れず行末に残らない（{lines}）", not bad and len(lines) >= 2))
    return out


def leg_missing(R, TL, F) -> list[tuple[str, bool]]:
    from PIL import ImageFont
    font = ImageFont.truetype(str(R.font_path(R.load_style("style.json", HERE), "caption")), 60)
    zz = TL.flag_emoji("ZZ")
    try:
        TL.text_img([zz + "どこか"], {"fill": "#FFFFFF"}, font)
    except SystemExit as e:
        msg = str(e.code)
        return [(f"絵の無い国で止まり、足す手順を言う（{msg[:60]}…）", "flags.py add ZZ" in msg)]
    return [("絵の無い国で止まらず、そのまま描いた", False)]


def leg_manifest(R, TL, F) -> list[tuple[str, bool]]:
    pr = F.check()
    out = [(f"flags/ の PNG が控えどおり（食い違い {len(pr)} 件・{len(F.load())} 国）", not pr and len(F.load()) > 0)]
    # 写しの1枚をいじると、食い違いとして出る
    al = F.DIR / "al.png"
    al.write_bytes(al.read_bytes() + b"\0")
    pr2 = F.check()
    out.append((f"PNG を1枚いじると、控えとの食い違いとして出る（{pr2[:1]}）", any(p.startswith("AL:") for p in pr2)))
    # 控えと絵文字が合っている（地域指示子の作り）
    m = F.load()
    out.append(("控えの絵文字が、2字から作った国旗の字と同じ", all(e["emoji"] == TL.flag_emoji(c) for c, e in m.items())))
    return out


LEGS = {
    "title_flag": leg_title_flag,
    "dark_edge": leg_dark_edge,
    "measure": leg_measure,
    "glue": leg_glue,
    "missing": leg_missing,
    "manifest": leg_manifest,
}


def run_legs(src: Path, quiet: bool) -> tuple[list[str], int]:
    R, TL, F = load(src)
    failed, checked = [], 0
    for name, fn in LEGS.items():
        try:
            res = fn(R, TL, F)
        except SystemExit as e:
            res = [(f"途中で止まった: {e.code}", False)]
        except Exception as e:  # noqa: BLE001 — 足が落ちたことを、ほかの足を止めずに数える
            res = [(f"途中で落ちた: {type(e).__name__}: {e}", False)]
        checked += len(res)
        if any(not ok for _, ok in res):
            failed.append(name)
        if not quiet:
            print(f"[{name}]")
            for what, ok in res:
                print(f"  {'○' if ok else '✕'} {what}")
    return failed, checked


def child(name: str | None) -> int:
    """写し（守りを1つ外すならそれ）で足を全部回し、落ちた足の名前を1行で返す（親が読む）"""
    if name and name not in CUTS:
        print(f"✕ BREAK={name} という守りは無い（{' / '.join(CUTS)}）")
        return 2
    with tempfile.TemporaryDirectory() as td:
        box = Path(td)
        fd = fonts_dir(box)
        if fd is None:
            print("✕ 回せない: 書体が1つも無い（tools/shorts/render/fetch_fonts.sh か、fonts-dejavu-core）")
            return 2
        os.environ["SHORTS_FONTS_DIR"] = str(fd)
        src = box / "src"
        src.mkdir()
        make_src(src, name)
        failed, checked = run_legs(src, quiet=False)
    print("LEGS_FAILED " + json.dumps(sorted(failed)))
    if checked == 0:
        return 2
    return 1 if failed else 0


def drill() -> list[str]:
    """守りを1つずつ外して、**その守りの足だけ**が落ちるかを見る"""
    print("[対照] 守りを1つずつ外すと、その足だけが落ちるか")
    bad = []
    for name, (_, _, _, want, why) in CUTS.items():
        r = subprocess.run([sys.executable, str(Path(__file__).resolve())], capture_output=True, text=True,
                           env=dict(os.environ, BREAK=name), timeout=240, check=False)
        line = [ln for ln in r.stdout.splitlines() if ln.startswith("LEGS_FAILED ")]
        got = set(json.loads(line[-1][len("LEGS_FAILED "):])) if line else None
        hit = got == want and r.returncode == 1
        print(f"  {'○' if hit else '✕'} BREAK={name}（{why}）→ 落ちた足 "
              f"{sorted(got) if got is not None else '（読めない: ' + (r.stdout + r.stderr).strip()[-300:] + '）'}"
              f"（欲しいのは {sorted(want)}）")
        if not hit:
            bad.append(name)
    return bad


def main() -> int:
    try:
        import cv2  # noqa: F401
        import numpy  # noqa: F401
        from PIL import Image  # noqa: F401
    except ImportError as e:
        print(f"✕ 回せない: {e.name} が無い（numpy・Pillow・opencv-python-headless が要る）")
        return 2
    if BREAK:
        return child(BREAK)
    rc = child(None)
    print()
    bad = drill()
    print()
    if rc == 2:
        print("✕ 1つも数えなかった。**「通りました」とは言わない**")
        return 2
    if rc or bad:
        if rc:
            print("✕ 本物で落ちた足がある（上の ✕）")
        if bad:
            print(f"✕ 対照が外れた: {' / '.join(bad)}（外しても、その足だけが落ちる形になっていない）")
        return 1
    print(f"○ {len(LEGS)}本の足が通り、守り {len(CUTS)}個を1つずつ外すと、その足だけが落ちた")
    return 0


if __name__ == "__main__":
    sys.exit(main())
