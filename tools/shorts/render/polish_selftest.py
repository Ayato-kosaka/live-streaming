"""**編集の磨き（#1284）で足した4つの欄が、書かない回は何も変えず、書いた回は思ったとおりに効くか。**

    python3 tools/shorts/render/polish_selftest.py
    BREAK=grade_apply python3 tools/shorts/render/polish_selftest.py   # 守りを1つ外した版で回す（対照の子）

終了コード 0=通った / 1=落ちた / **2=数えるものが無い・外す字が見つからない**（`docs/island-standards.md` §15）。

足した欄（README の「編集指示書」）:

- T1 `stickers[]` … 外の画像を、動いている画の上に札で重ねる（`sticker.py`。白い縁・影・傾き・ポン・漂い・消えかた）
- T2 `sfx[]` … 効果音。BGM の隣の4つ目の束（`stem_sfx.f32`）で混ぜ、BGM 抜きの版にも入れる
- T4 `grade` / `cuts[].grade` … 色の整え（彩度・コントラスト・暖かさ）。カットごとに上書き・`false` で外す
- T5 透かしの `bands` / 素材の `bands` … 配信の上下に焼き込まれた札の帯を切り落とす

要るのは ffmpeg・numpy・Pillow・OpenCV・budoux（書き出しそのもの）。Selftests には無いので、回し役
（`python/selftest_runner.py`）の SKIP に理由つきで載せ、`.github/workflows/shorts_selftest.yml` が名指しで回す
（`live_badge_selftest.py` と同じ形）。

## 足

| 足 | 確かめること |
| --- | --- |
| `off_same` | 新しい欄を書かない指示書の時間割に、札・効果音・整えの欄が出ない。切り方は今までどおり透かしの箱の上まで（[0, 0, 360, 596]）。整えを「変えない値」（1・1・0）で書いても欄を作らない |
| `grade` | 彩度 1.6 で、HSV の S の平均（コマの上15%を除く。編集案 1章の測り）が 0.30 前後から 0.42〜0.52 へ。コントラスト 1.2 で明るさのばらつきが 15% 以上増える。暖かさ 0.1 でまん中の灰の赤が上がり青が下がり、黒と白は動かない。カットの `grade: false` はそのカットだけ1画素も変えない。カットの上書きは欄ごとに全体へ重なる。範囲の外の値は書き出さずに止まる |
| `bands` | 様式の透かしに帯（上 135〜235・下 1115〜。720x1280 の画素・余白 5）を書くと、元素材の 240〜1110 だけを使う（編集案 2章 #11）。素材の `bands` でも同じ。帯の画素（赤と青）が書き出しの画に1画素も出ない |
| `sticker_look` | 札が見本の形で描ける: 白い縁（面積が縁の幅×周りの 7〜11割）・傾き（白い縁の上端の傾きが −4° ±0.7°）・影（札の下が地より暗く、上は地のまま）・写真のまん中が写真の色。ポンの1コマ目は落ち着いた札の 15〜40% の面積。消える最後のコマは薄い。漂いで位置が動き、漂いなしなら毎コマ同じ。2回描いて同じバイト |
| `sticker_check` | 知らない欄・画面の外の真ん中・無い画像は、書き出さずに止まる |
| `sfx_level` | 効果音の束: at のコマより前は無音・鳴っている間の RMS が様式の −22dBFS（db −6 なら −28）±0.5dB・動画の終わりを越えるぶんは切って、最後は 0 へ消える。範囲の外の at・知らない欄は止まる |
| `e2e` | 本物の書き出し（下書き・BGM 抜きの版も）を4つの欄を全部書いた指示書で回す: 時間割に札・効果音・カットごとの整え・帯で切った切り方が載る。札が字ありの版にも字なしの版（`--no-text`）にも同じ所に出る。効果音が BGM 入り・BGM 抜きの仕上がりの両方で鳴り、BGM 抜きの置き場にも束がある。品質チェックの束の当てはめが効果音の束を1列に入れ（効果音とナレーションの倍率の比 0.8〜1.25・効果音の鳴る所の残りが −45dB より小さい）、止め絵の検査は札を止め絵と数えない |

## 守りを1つずつ外す（§15「対照は、足の数だけ用意する」）

下の `CUTS` が本物の字を1か所だけ書き換えた写しを作り、それで足を回す。**外した守りの足だけが落ちる**ことを
確かめる。外す字が本物に見つからなければ 2 で落ちる（字を直したのに、ここを直し忘れた）。
`e2e` は書き出しを2回回すので、**落ちるはずの足に `e2e` がある子と、外さない本物でだけ回す**（ほかの子は
書き出しの部品を関数で叩く足だけ。子1本 数秒）。

**書かない回が書き出しで1バイトも変わらないこと**は、本番の素材で確かめた（2026-11-18、パソコンの回 p2 を入れる前と
後の道具で書き出して sha256 が同じ。README の「編集の磨き」）。ここでは時間割と画で当てる。
"""
from __future__ import annotations

import colorsys
import importlib.util
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
BREAK = os.environ.get("BREAK", "")
SR = 48000
ORANGE = (255, 140, 0)   # 札の写真の色（地の灰と見分ける）

# 名前: (ファイル（render/ の名前か tools/shorts/qa/…）, 本物の字, 外した字, 落ちるはずの足, 何を外したか)
CUTS: dict[str, tuple[str, str, str, set[str], str]] = {
    "grade_apply": ("render.py",
                    "            out = inset_of(cv2, img, out, c[\"inset\"], c[\"in\"] + j)\n"
                    "        if c.get(\"grade\"):\n            out = grade_frame(cv2, out, c[\"grade\"])\n",
                    "            out = inset_of(cv2, img, out, c[\"inset\"], c[\"in\"] + j)\n",
                    {"grade"}, "整えをコマに掛けない"),
    "grade_identity": ("render.py", "    if all(out[k] == GRADE[k][0] for k in GRADE):\n        return None\n", "",
                       {"off_same"}, "何も変えない整えでも、時間割に欄を作る"),
    "grade_cut_off": ("render.py", "    if own is False:\n        return None\n", "",
                      {"grade"}, "カットの grade: false を見ない（全体の整えが掛かる）"),
    "grade_range": ("render.py", "        if not lo <= v <= hi:\n", "        if False:\n",
                    {"grade"}, "範囲の外の値でも止まらない"),
    "bands_style": ("render.py", "    if spec and spec.get(\"bands\"):\n", "    if False:\n",
                    {"bands"}, "様式の透かしの帯を読まない"),
    "bands_src": ("render.py", "    sb = src.get(\"bands\")\n", "    sb = None\n",
                  {"bands"}, "素材の帯を読まない"),
    "bands_keep": ("render.py", "    a, b = max(gaps, key=lambda g: (g[1] - g[0], -g[0]))\n", "    a, b = gaps[0]\n",
                   {"bands"}, "いちばん高い一続きではなく、いちばん上の隙間を使う（上の帯より上の細い帯になる）"),
    "sticker_pop": ("sticker.py", "    s = it[\"pop\"][i] if i < len(it[\"pop\"]) else 1.0\n", "    s = 1.0\n",
                    {"sticker_look"}, "出だしのポンをしない"),
    "sticker_fade": ("sticker.py", "        alpha = u\n", "        alpha = 1.0\n",
                     {"sticker_look"}, "消えるときに薄くしない"),
    "sticker_shadow": ("sticker.py", "    if sh:\n        # 影は画面の上で", "    if False:\n        # 影は画面の上で",
                       {"sticker_look"}, "影を描かない"),
    "sticker_rotate": ("sticker.py", "-(it[\"rotate\"] + dt)", "-(dt)",
                       {"sticker_look"}, "札を傾けない"),
    "sticker_border": ("sticker.py", "    if b:\n        col = ", "    if False:\n        col = ",
                       {"sticker_look"}, "白い縁を描かない"),
    "sticker_drift": ("sticker.py", "    dr = it.get(\"drift\")\n    if dr:\n", "    dr = None\n    if dr:\n",
                      {"sticker_look"}, "いるあいだ漂わない"),
    "sticker_keys": ("sticker.py", "        if bad:\n            sys.exit(f\"{where}: 知らない欄",
                     "        if False:\n            sys.exit(f\"{where}: 知らない欄",
                     {"sticker_check"}, "知らない欄を黙って既定に落とす"),
    "sticker_draw": ("render.py", "                    ST.draw(cv2, frame, sprites[si], p[\"stickers\"][si], f, k)\n",
                     "                    pass\n", {"e2e"}, "札を時間割に置いても、コマに重ねない"),
    "sfx_level": ("render.py", "        g = db(target + s[\"db\"]) / r\n", "        g = db(s[\"db\"])\n",
                  {"sfx_level"}, "効果音の大きさを様式の目標に揃えない（素材の音量のまま）"),
    "sfx_check": ("render.py", "        if not 0 <= at < total:\n", "        if False:\n",
                  {"sfx_level"}, "動画の外の at でも止まらない"),
    "sfx_mix": ("render.py", "    extra = [sfx_p] if sfx_p else []\n", "    extra = []\n",
                {"e2e"}, "効果音の束を作っても仕上がりに混ぜない"),
    "sfx_nobgm": ("render.py", "master([narr_p, src_p, *extra], work, \"no_bgm\"", "master([narr_p, src_p], work, \"no_bgm\"",
                  {"e2e"}, "BGM 抜きの版に効果音を入れない"),
    "qa_sfx": ("tools/shorts/qa/common.py", "for name in (\"narration\", \"bgm\", \"source\", \"sfx\"):",
               "for name in (\"narration\", \"bgm\", \"source\"):",
               {"e2e"}, "品質チェックが効果音の束を読まない（効果音が「束に無い音」として残りに出る）"),
}


# ---------------------------------------------------------------- 道具と素材の用意

def fonts_dir(box: Path) -> Path | None:
    """本物の書体（fetch_fonts.sh）が無ければ、箱の太字を M PLUS の名前で置く（live_badge_selftest.py と同じ）。"""
    names = ["MPLUSRounded1c-ExtraBold.ttf", "MPLUSRounded1c-Black.ttf", "DelaGothicOne-Regular.ttf"]
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
    for p in HERE.glob("*.py"):
        shutil.copy(p, dst / p.name)
    for p in HERE.glob("*.json"):
        shutil.copy(p, dst / p.name)
    shutil.copytree(HERE / "flags", dst / "flags")
    shutil.copytree(HERE.parent / "qa", dst.parent / "qa", ignore=shutil.ignore_patterns("__pycache__"))
    if cut:
        fname, old, new, _, _ = CUTS[cut]
        # tools/shorts/… はリポジトリからの道（qa/ は写しの render の隣）。ほかは render/ の名前
        f = dst.parent / fname.removeprefix("tools/shorts/") if fname.startswith("tools/shorts/") else dst / fname
        text = f.read_text(encoding="utf-8")
        if text.count(old) != 1:
            print(f"✕ BREAK={cut}: 外す字が {fname} に {text.count(old)} か所（1か所のはず）。字を直したら CUTS も直す")
            sys.exit(2)
        f.write_text(text.replace(old, new), encoding="utf-8")


def make_assets(d: Path) -> None:
    import numpy as np
    from PIL import Image
    # 動く元素材（360x640。720x1280 の半分）。止め絵の検査が「動いている」と読む絵
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                    "testsrc2=s=360x640:r=30", "-t", "3", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                    str(d / "src.mp4")], check=True)
    t = np.arange(int(0.8 * SR)) / SR
    v = (np.sin(2 * np.pi * 200 * t) + 0.5 * np.sin(2 * np.pi * 400 * t)) * (0.6 + 0.4 * np.sin(2 * np.pi * 4 * t))
    wav(d / "voice.wav", 0.2 * v)
    # 効果音: 0.25秒の 1.2kHz を減衰させた「ポン」
    t2 = np.arange(int(0.25 * SR)) / SR
    wav(d / "pop.wav", 0.5 * np.sin(2 * np.pi * 1200 * t2) * np.exp(-t2 / 0.06))
    # 札の写真: 橙の地に濃い縞（写真のまん中は橙）
    im = np.zeros((450, 400, 3), dtype=np.uint8)
    im[:] = ORANGE
    im[::40, :, :] = (120, 60, 0)
    Image.fromarray(im).save(d / "card.png")
    base = {"extends": "style_v3.json", "avoid_faces": {"enabled": False}}
    (d / "st.json").write_text(json.dumps(base), encoding="utf-8")
    bands = {**base, "watermarks": {"prism_live": {"bands": [[135, 235], [1115, 1280]], "margin": 5}}}
    (d / "st_bands.json").write_text(json.dumps(bands), encoding="utf-8")


def wav(path: Path, x) -> None:
    import numpy as np
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1",
                    "-i", "-", "-c:a", "pcm_f32le", str(path)],
                   input=np.ascontiguousarray(x, dtype="<f4").tobytes(), check=True)


def edit_of(d: Path, name: str, extra: dict | None = None, style: str = "st.json") -> Path:
    """動く画2カット（1.5秒ずつ）。字幕の行が2つ（0 と 60 コマ。0.8秒の声）。extra で新しい欄を足す。"""
    e = {"version": 2, "id": f"selftest-{name}", "style": style,
         "sources": {"s": {"path": "src.mp4", "watermark": "prism_live"}},
         "cuts": [{"src": "s", "in": 0, "out": 45}, {"src": "s", "in": 45, "out": 90}],
         "narration": {"engine": "files", "lines": [
             {"at": 0, "text": "ヨーグルトの国へ", "file": "voice.wav"},
             {"at": 60, "text": "本場の味は", "file": "voice.wav"}]}}
    for k, v in (extra or {}).items():
        if k == "cut_grade":
            e["cuts"][1]["grade"] = v
        elif k == "src_bands":
            e["sources"]["s"]["bands"] = v
        else:
            e[k] = v
    p = d / f"edit_{name}.json"
    p.write_text(json.dumps(e, ensure_ascii=False), encoding="utf-8")
    return p


FULL = {  # 4つの欄を全部書いた指示書（e2e と、時間割を見る足）
    "grade": {"saturation": 1.4, "contrast": 1.08, "warmth": 0.05},
    "cut_grade": {"saturation": 1.0},
    "src_bands": {"size": [720, 1280], "rows": [[135, 235], [1115, 1280]], "margin": 5},
    "stickers": [{"image": "card.png", "from": 20, "to": 85, "x": 800, "y": 1330, "w": 320}],
    "sfx": [{"at": 30, "file": "pop.wav", "db": 0}],
}


def load(src: Path):
    for name in ("render", "textlook", "flags", "live_badge", "orig_voice", "talk", "sticker"):
        sys.modules.pop(name, None)
    sys.path.insert(0, str(src))
    try:
        spec = importlib.util.spec_from_file_location("render", src / "render.py")
        mod = importlib.util.module_from_spec(spec)
        sys.modules["render"] = mod
        spec.loader.exec_module(mod)
        return mod
    finally:
        sys.path.pop(0)


_PLAN: dict = {}


def planned(R, d: Path, name: str, extra: dict | None = None, style: str = "st.json") -> dict:
    """時間割（声の詰めで1回 1〜2秒。同じ指示書は1回だけ作る）。"""
    key = (name, json.dumps(extra, sort_keys=True), style)
    if key not in _PLAN:
        e, st, base = R.load(edit_of(d, name, extra, style))
        w = d / f"w_{name}"
        w.mkdir(parents=True, exist_ok=True)
        _PLAN[key] = R.plan(e, st, base, w)
    return _PLAN[key]


def stops(fn) -> tuple[bool, str]:
    try:
        fn()
    except SystemExit as e:
        return True, str(e.code)[:80]
    return False, ""


def sat_mean(img) -> float:
    """HSV の S の平均（コマの上15%を除く）。編集案 1章の「色」の測り。"""
    import cv2
    h = img.shape[0]
    hsv = cv2.cvtColor(img[int(h * 0.15):], cv2.COLOR_RGB2HSV)
    return float(hsv[:, :, 1].mean() / 255)


def muted(h: int = 640, w: int = 360):
    """配信の画に似た、くすんだ色の板（S 0.30 前後・V 0.55 前後の色のマス目）。"""
    import numpy as np
    rng = np.random.default_rng(7)
    img = np.zeros((h, w, 3), dtype=np.uint8)
    for y in range(0, h, 40):
        for x in range(0, w, 40):
            r, g, b = colorsys.hsv_to_rgb(rng.random(), 0.22 + 0.16 * rng.random(), 0.4 + 0.3 * rng.random())
            img[y:y + 40, x:x + 40] = (round(r * 255), round(g * 255), round(b * 255))
    return img


# ---------------------------------------------------------------- 足

def leg_off_same(R, d: Path) -> list[tuple[str, bool]]:
    p = planned(R, d, "off")
    q = planned(R, d, "ident", {"grade": {"saturation": 1.0, "contrast": 1.0, "warmth": 0.0}})
    return [("時間割に札・効果音の欄が無い", "stickers" not in p and "sfx" not in p),
            ("カットに整えの欄が無い", all("grade" not in c for c in p["cuts"])),
            (f"切り方は透かしの箱の上まで（{p['cuts'][0]['crop']}）", p["cuts"][0]["crop"] == [0, 0, 360, 596]),
            ("整えを変えない値（1・1・0）で書いても、カットに欄を作らない", all("grade" not in c for c in q["cuts"]))]


def leg_grade(R, d: Path) -> list[tuple[str, bool]]:
    import cv2
    import numpy as np
    p = planned(R, d, "off")
    c0 = dict(p["cuts"][0])
    img = muted()
    W, H = 540, 960   # 下書きの大きさ（色の整えは画素ごとなので、大きさに依らない）
    plain = R.frame_of(cv2, img.copy(), c0, 0, W, H)
    out = []

    def with_g(**g):
        full = {"saturation": 1.0, "contrast": 1.0, "warmth": 0.0, **g}
        return R.frame_of(cv2, img.copy(), {**c0, "grade": full}, 0, W, H)
    s0, s1 = sat_mean(plain), sat_mean(with_g(saturation=1.6))
    out.append((f"彩度 1.6 で S の平均 {s0:.3f} → {s1:.3f}（0.42〜0.52 へ）", 0.26 <= s0 <= 0.34 and 0.42 <= s1 <= 0.52))
    y0 = cv2.cvtColor(plain, cv2.COLOR_RGB2GRAY).std()
    y1 = cv2.cvtColor(with_g(contrast=1.2), cv2.COLOR_RGB2GRAY).std()
    out.append((f"コントラスト 1.2 で明るさのばらつき {y0:.1f} → {y1:.1f}（15% 以上増える）", y1 >= y0 * 1.15))
    lut = R.grade_lut({"saturation": 1.0, "contrast": 1.0, "warmth": 0.1})[0]
    out.append((f"暖かさ 0.1 でまん中の灰の赤 {lut[128][0]}・青 {lut[128][2]}（赤 ≥ 134・青 ≤ 122）、黒と白は動かない",
                lut[128][0] >= 134 and lut[128][2] <= 122 and lut[0].tolist() == [0, 0, 0]
                and lut[255].tolist() == [255, 255, 255]))
    # 全体に彩度 1.4、2つ目のカットは grade: false → 2つ目は1画素も変えない
    q = planned(R, d, "cutoff", {"grade": {"saturation": 1.4}, "cut_grade": False})
    g0, g1 = q["cuts"][0].get("grade"), q["cuts"][1].get("grade")
    same = np.array_equal(R.frame_of(cv2, img.copy(), q["cuts"][1], 0, W, H), plain)
    out.append((f"grade: false のカットは整えない（欄 {g1}・画が同じ {same}）、ほかのカットは整える（{g0}）",
                g1 is None and same and g0 == {"saturation": 1.4, "contrast": 1.0, "warmth": 0.0}))
    f = planned(R, d, "full", FULL)
    out.append((f"カットの上書きは欄ごとに重なる（{f['cuts'][1].get('grade')}）",
                f["cuts"][0].get("grade") == {"saturation": 1.4, "contrast": 1.08, "warmth": 0.05}
                and f["cuts"][1].get("grade") == {"saturation": 1.0, "contrast": 1.08, "warmth": 0.05}))
    hit, why = stops(lambda: R.grade_of({"saturation": 3.0}, None, "足"))
    out.append((f"範囲の外（彩度 3.0）は止まる（{why}）", hit))
    return out


def leg_bands(R, d: Path) -> list[tuple[str, bool]]:
    import cv2
    import numpy as np
    out = []
    p = planned(R, d, "bands", None, "st_bands.json")
    q = planned(R, d, "srcbands", {"src_bands": FULL["src_bands"]})
    want = [0, 120, 360, 435]   # 720x1280 の 240〜1110
    out.append((f"様式の透かしの帯で切る（{p['cuts'][0]['crop']}・欲しいのは {want}）", p["cuts"][0]["crop"] == want))
    out.append((f"素材の帯で切る（{q['cuts'][0]['crop']}）", q["cuts"][0]["crop"] == want))
    img = np.full((640, 360, 3), 128, dtype=np.uint8)
    img[67:118] = (230, 20, 20)      # 上の題の帯（135〜235 の半分）
    img[557:] = (20, 20, 230)        # 下のお城の絵と透かし（1115〜 の半分）
    fr = R.frame_of(cv2, img.copy(), p["cuts"][0], 0, 540, 960)
    red = int(((fr[:, :, 0] > 150) & (fr[:, :, 1] < 90)).sum())
    blue = int(((fr[:, :, 2] > 150) & (fr[:, :, 0] < 90)).sum())
    base = R.frame_of(cv2, img.copy(), planned(R, d, "off")["cuts"][0], 0, 540, 960)
    red0 = int(((base[:, :, 0] > 150) & (base[:, :, 1] < 90)).sum())
    out.append((f"帯の画素が書き出しに出ない（赤 {red}・青 {blue}。帯を書かない切り方なら赤 {red0}）",
                red == 0 and blue == 0 and red0 > 1000))
    return out


def sticker_item(R, d: Path, **kw) -> dict:
    import sticker as ST
    st = R.load_style("st.json", d)
    it = {"image": "card.png", "from": 0, "to": 60, "x": 540, "y": 960, "w": 400, **kw}
    return ST.plan_items({"stickers": [it]}, st, d, 60, 1080, 1920, 30, R.resolve)[0]


def leg_sticker_look(R, d: Path) -> list[tuple[str, bool]]:
    import cv2
    import numpy as np
    import sticker as ST
    out = []
    it = sticker_item(R, d, drift=False)
    spr = ST.sprite(it)

    def drawn(item, f):
        fr = np.full((1920, 1080, 3), 128, dtype=np.uint8)
        ST.draw(cv2, fr, spr, item, f)
        return fr
    fr = drawn(it, 10)
    white = (fr.min(axis=2) >= 245)
    ring = 2 * (428 + 478) * 14 - 4 * 14 * 14
    out.append((f"白い縁 {int(white.sum())}画素（縁の幅×周り {ring} の 7〜11割）", 0.7 * ring <= white.sum() <= 1.1 * ring))
    tops = []
    for x in (540 - 150, 540 + 150):
        ys = np.nonzero(white[:, x])[0]
        tops.append(int(ys.min()) if len(ys) else 0)
    ang = math.degrees(math.atan2(tops[1] - tops[0], 300))
    out.append((f"白い縁の上端の傾き {ang:.2f}°（rotate −4 ±0.7）", abs(ang - (-4.0)) <= 0.7))
    col = np.nonzero(white[:, 540])[0]   # まん中の列の、白い縁の上端と下端
    below, above = fr[int(col.max()) + 6, 540], fr[int(col.min()) - 40, 540]
    out.append((f"影: 札の下 {below.tolist()} が地（128）より暗く、上 {above.tolist()} は地のまま",
                int(below.max()) <= 112 and int(above.min()) >= 125))
    ctr = fr[960, 540]
    out.append((f"写真のまん中が写真の色（{ctr.tolist()}）", int(ctr[0]) >= 240 and 120 <= int(ctr[1]) <= 160))
    card = lambda f: int((np.abs(f.astype(int) - 128).max(axis=2) > 6).sum())  # noqa: E731
    a0, a1 = card(drawn(it, 0)), card(fr)
    out.append((f"ポンの1コマ目は落ち着いた札の {a0 / a1:.0%} の面積（15〜40%）", 0.15 <= a0 / a1 <= 0.40))
    last = drawn(it, 59)[960, 540]
    out.append((f"消える最後のコマは薄い（まん中の赤 {int(last[0])}・地 128・写真 255。170 未満）", int(last[0]) < 170))
    itd = sticker_item(R, d)
    sprd = ST.sprite(itd)

    def cent(f):
        fr2 = np.full((1920, 1080, 3), 128, dtype=np.uint8)
        ST.draw(cv2, fr2, sprd, itd, f)
        ys, xs = np.nonzero(fr2.min(axis=2) >= 245)
        return float(xs.mean()), float(ys.mean())
    c10, c40 = cent(10), cent(40)
    mv = math.hypot(c40[0] - c10[0], c40[1] - c10[1])
    still = np.array_equal(drawn(it, 10), drawn(it, 40))
    out.append((f"漂い: 10コマ目と 40コマ目で縁の重心が {mv:.1f}px 動く（1px 以上）・漂いなしなら同じ絵（{still}）",
                mv >= 1.0 and still))
    out.append(("2回描いて同じバイト", np.array_equal(drawn(it, 3), drawn(it, 3))))
    return out


def leg_sticker_check(R, d: Path) -> list[tuple[str, bool]]:
    out = []
    for why, kw in (("知らない欄", {"angle": 5}), ("画面の外の真ん中", {"x": 1500}), ("無い画像", {"image": "nope.png"})):
        hit, msg = stops(lambda: sticker_item(R, d, **kw))
        out.append((f"{why}は止まる（{msg}）", hit))
    return out


def leg_sfx_level(R, d: Path) -> list[tuple[str, bool]]:
    import numpy as np
    st = R.load_style("st.json", d)
    work = d / "w_sfx"
    work.mkdir(exist_ok=True)
    pop = str(d / "pop.wav")
    p = {"fps": 30, "frames": 90, "audio_override": {},
         "sfx": [{"at": 30, "file": pop, "db": 0}, {"at": 60, "file": pop, "db": -6}, {"at": 88, "file": pop, "db": 0}]}
    path = R.sfx_stem(p, st, work)
    x = np.fromfile(path, dtype="<f4").reshape(-1, 2)[:, 0]
    spf = SR // 30

    def lvl(a, b):
        return 20 * math.log10(max(R.speech_rms(x[a * spf:b * spf]), 1e-9))
    l1, l2 = lvl(30, 45), lvl(60, 75)
    target = st["audio"]["sfx_rms_dbfs"]
    out = [(f"束の長さ {len(x)}（{90 * spf} のはず）", len(x) == 90 * spf),
           (f"at より前は無音（最大 {float(np.abs(x[:30 * spf]).max()):.1e}）", float(np.abs(x[:30 * spf]).max()) == 0.0),
           (f"鳴っている間 {l1:.2f}dBFS（{target} ±0.5）", abs(l1 - target) <= 0.5),
           (f"db −6 は {l2:.2f}dBFS（{target - 6} ±0.5）", abs(l2 - (target - 6)) <= 0.5),
           (f"終わりを越えるぶんは切って 0 へ消える（最後 {abs(float(x[-1])):.1e}）", abs(float(x[-1])) < 1e-3)]
    for why, s in (("動画の外の at", {"at": 95, "file": "pop.wav"}), ("知らない欄", {"at": 3, "file": "pop.wav", "gain": 2})):
        hit, msg = stops(lambda: R.sfx_items({"sfx": [s]}, d, 90))
        out.append((f"{why}は止まる（{msg}）", hit))
    return out


def leg_e2e(R, d: Path) -> list[tuple[str, bool]]:
    """本物の書き出し（下書き・BGM 抜きの版も）を回し、品質チェックの束の当てはめと止め絵の検査に通す。"""
    import numpy as np
    edit = edit_of(d, "e2e", FULL)
    mp4, work, nb = d / "e2e.mp4", d / "e2e.work", d / "e2e_nobgm.mp4"
    plate = d / "e2e_plate.mp4"
    tool = str(Path(R.__file__))

    def run(*args):
        return subprocess.run([sys.executable, tool, str(edit), "--draft", *args], capture_output=True, text=True,
                              timeout=300)
    with ThreadPoolExecutor(2) as ex:
        fa = ex.submit(run, "--out", str(mp4), "--work", str(work), "--no-bgm-out", str(nb))
        fb = ex.submit(run, "--no-text", "--out", str(plate), "--work", str(d / "e2e_plate.work"))
        r, r2 = fa.result(), fb.result()
    if r.returncode != 0 or r2.returncode != 0:
        return [(f"書き出しが落ちた（{r.returncode} {r2.returncode}）: {(r.stderr or r2.stderr or '')[-300:]}", False)]
    p = json.loads((work / "plan.json").read_text())
    out = [(f"時間割に札 {len(p.get('stickers', []))}・効果音 {len(p.get('sfx', []))}・切り方 {p['cuts'][0]['crop']}",
            len(p.get("stickers", [])) == 1 and len(p.get("sfx", [])) == 1 and p["cuts"][0]["crop"] == [0, 120, 360, 435]
            and "footprint" in p["stickers"][0] and "gain_db" in p["sfx"][0])]

    def frame(path: Path, f: int):
        raw = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path), "-vf",
                              f"select=eq(n\\,{f})", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                             capture_output=True, check=True).stdout
        return np.frombuffer(raw, dtype=np.uint8).reshape(960, 540, 3)
    # 落ち着いた札（20 + ポン6コマ）のまん中。下書きは縦横半分
    a, b = frame(mp4, 50)[665, 400], frame(plate, 50)[665, 400]
    out.append((f"札が字ありの版（{a.tolist()}）にも字なしの版（{b.tolist()}）にも出る（写真の橙）",
                all(int(v[0]) >= 200 and 90 <= int(v[1]) <= 190 and int(v[2]) <= 80 for v in (a, b))))

    def rms(path: Path, a_s: float, b_s: float) -> float:
        raw = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path), "-vn", "-f", "f32le",
                              "-ac", "1", "-ar", str(SR), "-"], capture_output=True, check=True).stdout
        x = np.frombuffer(raw, dtype="<f4")[int(a_s * SR):int(b_s * SR)].astype(np.float64)
        return 20 * math.log10(max(float(np.sqrt(np.mean(x ** 2))) if len(x) else 0.0, 1e-9))
    for name, path in (("BGM 入り", mp4), ("BGM 抜き", nb)):
        on, off = rms(path, 1.0, 1.2), rms(path, 1.4, 1.9)
        out.append((f"{name}の仕上がりで効果音が鳴る（鳴る所 {on:.1f}dBFS・静かな所 {off:.1f}dBFS）", on >= -40 and on - off >= 20))
    w2 = Path(str(work.with_suffix("")) + "_nobgm.work")
    out.append(("BGM 抜きの置き場にも効果音の束がある", (w2 / "stem_sfx.f32").is_file()))
    qa = Path(R.__file__).resolve().parent.parent / "qa"
    code = ("import json,sys,math; from pathlib import Path; sys.path.insert(0, sys.argv[1]); import check as C; "
            "import numpy as np; ctx = C.make_ctx(Path(sys.argv[2]), Path(sys.argv[3])); f = ctx.stem_fit(); "
            "r = f['resid']; o = f['offset']; a = int(1.0 * 48000) - o; seg = r[a:a + 9600]; "
            "rep = C.run_checks(ctx, only=['still_image']); "
            "print(json.dumps({'gain_sfx': f.get('gain_sfx'), 'gain_narration': f['gain_narration'], "
            "'resid_db': 20 * math.log10(max(float(np.sqrt(np.mean(seg ** 2))), 1e-9)), "
            "'still': rep['checks'][0]}, default=str))")
    q = subprocess.run([sys.executable, "-c", code, str(qa), str(mp4), str(work)], capture_output=True, text=True,
                       timeout=300)
    try:
        got = json.loads(q.stdout.strip().splitlines()[-1])
    except (ValueError, IndexError):
        return out + [(f"品質チェックが読めない: {(q.stderr or q.stdout)[-300:]}", False)]
    gs, gn = got.get("gain_sfx"), got["gain_narration"]
    out.append((f"束の当てはめが効果音を1列に入れる（倍率 効果音 {gs}・ナレーション {gn:.3f}。比 0.8〜1.25）",
                gs is not None and 0.8 <= gs / gn <= 1.25))
    out.append((f"効果音の鳴る所の残り {got['resid_db']:.1f}dB（−45 より小さい。束に無い音として残らない）",
                got["resid_db"] < -45))
    si = got["still"]
    stk = si.get("measured", {}).get("stickers", [])
    out.append((f"止め絵の検査は札を止め絵と数えない（{si['status']}: {si['summary'][:80]}）",
                si["status"] == "pass" and len(stk) == 1 and stk[0]["still"] is False))
    return out


LEGS = {
    "off_same": leg_off_same,
    "grade": leg_grade,
    "bands": leg_bands,
    "sticker_look": leg_sticker_look,
    "sticker_check": leg_sticker_check,
    "sfx_level": leg_sfx_level,
    "e2e": leg_e2e,
}


def run_legs(src: Path, d: Path, with_e2e: bool) -> tuple[list[str], int]:
    R = load(src)
    sys.path.insert(0, str(src))
    failed, checked = [], 0
    for name, fn in LEGS.items():
        if name == "e2e" and not with_e2e:
            continue
        try:
            res = fn(R, d)
        except SystemExit as e:
            res = [(f"途中で止まった: {e.code}", False)]
        except Exception as e:  # noqa: BLE001 — 足が落ちたことを、ほかの足を止めずに数える
            res = [(f"途中で落ちた: {type(e).__name__}: {e}", False)]
        checked += len(res)
        if any(not ok for _, ok in res):
            failed.append(name)
        print(f"[{name}]")
        for what, ok in res:
            print(f"  {'○' if ok else '✕'} {what}")
    return failed, checked


def child(name: str | None) -> int:
    """写し（守りを1つ外すならそれ）で足を回し、落ちた足の名前を1行で返す（親が読む）"""
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
        src = box / "render"
        src.mkdir()
        make_src(src, name)
        d = box / "case"
        d.mkdir()
        make_assets(d)
        failed, checked = run_legs(src, d, with_e2e=(not name) or "e2e" in CUTS[name][3])
    print("LEGS_FAILED " + json.dumps(sorted(failed)))
    if checked == 0:
        return 2
    return 1 if failed else 0


def drill() -> list[str]:
    """守りを1つずつ外して、**その守りの足だけ**が落ちるかを見る（子は CPU の数まで並べる。多くは数秒）"""
    print("[対照] 守りを1つずつ外すと、その足だけが落ちるか")

    def one(name: str):
        return name, subprocess.run([sys.executable, str(Path(__file__).resolve())], capture_output=True, text=True,
                                    env=dict(os.environ, BREAK=name), timeout=600, check=False)
    with ThreadPoolExecutor(max(1, min(4, os.cpu_count() or 1))) as ex:
        done = dict(ex.map(one, CUTS))
    bad = []
    for name, (_, _, _, want, why) in CUTS.items():
        r = done[name]
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
        print(f"✕ 回せない: {e.name} が無い（numpy・Pillow・opencv-python-headless・budoux が要る）")
        return 2
    if shutil.which("ffmpeg") is None:
        print("✕ 回せない: ffmpeg が無い")
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
