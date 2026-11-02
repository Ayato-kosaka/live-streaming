"""**YouTube ライブの札（様式の `live_badge`。帳面 F-064・#1097）が、出さない回は何も変えず、出す回は上・左寄せに
0コマ目から最後まで出て、題の札・左上の注を札の下へ空けているか。**

    python3 tools/shorts/render/live_badge_selftest.py
    BREAK=gate python3 tools/shorts/render/live_badge_selftest.py   # 守りを1つ外した版で回す（対照の子）

終了コード 0=通った / 1=落ちた / **2=数えるものが無い・外す字が見つからない**（`docs/island-standards.md` §15）。

要るのは ffmpeg・numpy・Pillow・OpenCV・budoux（書き出しそのもの）。Selftests には無いので、回し役
（`python/selftest_runner.py`）の SKIP に理由つきで載せ、`.github/workflows/shorts_selftest.yml` が名指しで回す
（`bgm_cta_selftest.py` と同じ形）。書体は本物（`fetch_fonts.sh`）が無ければ、箱にある書体を同じ名前で置く。

## 何を見るか

本物の `render.py`・`live_badge.py`・様式（いまの本番の `style_v3.json` に、顔よけだけ切ったもの）を写して回す。
素材は ffmpeg と numpy で作る（灰色の画・200Hz の声）。`room` の足だけ、題を犬の回 v5 と同じ2行の札にする
（札を出すと字が小さくなる長さ）。

| 足 | 確かめること |
| --- | --- |
| `off_default` | 様式のまま（`enabled: false`）では、時間割に札が無く・重ね物に札が無く・題の札は y 380・注は y 400。様式から `live_badge` を丸ごと消した版と、字の絵（PNG のバイト）と置き場が全部同じ |
| `on_place` | 出すと、札が x 120・y 372 に 0コマ目から最後のコマまで1枚（`layer_at` が0コマ目と最後のコマで札を返す） |
| `room` | 題の札と左上の注（終わりの札）が、札の下端＋gap（16）へ下がる。題の札の下端は元の限り（380+456=836）を越えない。札と、題の札・注の見える画素が 8px より近づかない |
| `limits` | 字幕・【大】の字の上端の限り（`top_limit`）が札の下端＋24 より下。テロップの置き場の上端が札の下端＋20 より下 |
| `looks` | A・B・C が描ける（高さ 54〜56・幅 280〜480）。A は赤い札と白い字、B は地が無く赤い三角、C は半透明の黒い地と赤い点。2回描いて同じバイト。scale 1.5 で高さが 1.5倍 |
| `bad_look` | looks に無い look を選ぶと、書き出さずに止まる |
| `e2e` | 本物の書き出し（下書き）の mp4 を品質チェック（`qa/badge.py`・字の置き場）に通すと、札が最初と最後のコマに見えて、ぶつかりが無い |

**出さない回が書き出しで1バイトも変わらないこと**は、本番の素材で確かめた（2026-11-02、浸水の回 v6 を入れる前と後の
道具で書き出して sha256 が同じ。README の「YouTube ライブの札」）。ここでは時間割と字の絵で当てる（下書きの x264 は
コマ単位の並列でバイト一致を求めないので、mp4 のバイトでは当てない）。

## 守りを1つずつ外す（§15「対照は、足の数だけ用意する」）

下の `CUTS` が本物の字を1か所だけ書き換えた写しを作り、それで足を全部回す。**外した守りの足だけが落ちる**
ことを確かめる。外す字が本物に見つからなければ 2 で落ちる（字を直したのに、ここを直し忘れた）。
"""
from __future__ import annotations

import copy
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
SR = 48000
TITLE = "🇬🇪ジョージアに来たら、\n野良犬が共存してた！"   # 犬の回 v5 の題（札を出すと縮む長さ。room の足だけ）
SHORT = "🇬🇪ジョージアの野良犬"                         # ほかの足（長い題の札は描くのに1回 3〜4秒かかる）
MARGIN = 8

# 名前: (ファイル, 本物の字, 外した字, 落ちるはずの足, 何を外したか)
CUTS: dict[str, tuple[str, str, str, set[str], str]] = {
    "default_on": ("style.json", "    \"enabled\": false,\n    \"look\": \"A\",\n",
                   "    \"enabled\": true,\n    \"look\": \"A\",\n",
                   {"off_default"}, "既定を「出す」にする（札を入れる前の回まで変わる）"),
    "gate": ("live_badge.py", "    if not lb.get(\"enabled\"):\n        return None\n", "",
             {"off_default"}, "enabled を見ずに出す"),
    "draw": ("render.py", "        out.append(still(\"badge\", p[\"live_badge\"], badge_img, None))\n", "",
             {"on_place", "e2e"}, "札を時間割に置いても、コマに重ねない"),
    "span": ("live_badge.py", "\"from\": 0, \"to\": frames,", "\"from\": 0, \"to\": frames // 2,",
             {"on_place", "e2e"}, "札を半分のコマまでしか出さない"),
    "room_title": ("live_badge.py", "            s[\"top\"] = bottom\n", "",
                   {"room", "e2e"}, "題の札を札の下へ下げない（札と題の札が重なる）"),
    "room_height": ("live_badge.py", "                s[\"max_height\"] -= d\n", "",
                    {"room"}, "題の札を下げたぶん縮めない（下端が 836 を越え、下の字幕・右のボタン列に掛かる）"),
    "room_note": ("live_badge.py", "        nt[\"y\"] = bottom\n", "",
                  {"room", "e2e"}, "左上の注（終わりの札）を下げない（札と重なる）"),
    "top_limit": ("render.py", "        lim = max(lim, lb[\"y\"] + lb[\"h\"] + pad)\n", "        pass\n",
                  {"limits"}, "字幕・【大】の字の上端の限りに札を入れない"),
    "telop_zone": ("render.py",
                   "        title_bottom = max(title_bottom, p[\"live_badge\"][\"y\"] + p[\"live_badge\"][\"h\"])\n", "",
                   {"limits"}, "テロップの置き場の上端に札を入れない"),
    "look_check": ("live_badge.py", "    if name not in looks:\n", "    if False:\n",
                   {"bad_look"}, "looks に無い look でも止まらない"),
}


# ---------------------------------------------------------------- 道具と素材の用意

def fonts_dir(box: Path) -> Path | None:
    """本物の書体（fetch_fonts.sh）が無ければ、箱の太字を M PLUS の名前で置く（bgm_cta_selftest.py と同じ）。"""
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
    # 書き出しは割ってよい所を品質チェックの qa/ から読み、e2e は qa/ の検査を回す
    shutil.copytree(HERE.parent / "qa", dst.parent / "qa", ignore=shutil.ignore_patterns("__pycache__"))
    if cut:
        fname, old, new, _, _ = CUTS[cut]
        text = (dst / fname).read_text(encoding="utf-8")
        if text.count(old) != 1:
            print(f"✕ BREAK={cut}: 外す字が {fname} に {text.count(old)} か所（1か所のはず）。字を直したら CUTS も直す")
            sys.exit(2)
        (dst / fname).write_text(text.replace(old, new), encoding="utf-8")


def make_assets(d: Path) -> None:
    import numpy as np
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                    "color=c=0x808080:s=180x320:r=30", "-t", "6", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                    str(d / "src.mp4")], check=True)
    t = np.arange(int(0.8 * SR)) / SR
    v = (np.sin(2 * np.pi * 200 * t) + 0.5 * np.sin(2 * np.pi * 400 * t)) * (0.6 + 0.4 * np.sin(2 * np.pi * 4 * t))
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1",
                    "-i", "-", "-c:a", "pcm_f32le", str(d / "voice.wav")],
                   input=np.ascontiguousarray(0.2 * v, dtype="<f4").tobytes(), check=True)
    base = {"extends": "style_v3.json", "avoid_faces": {"enabled": False}}
    (d / "st_off.json").write_text(json.dumps(base), encoding="utf-8")
    (d / "st_on.json").write_text(json.dumps({**base, "live_badge": {"enabled": True, "look": "A"}}), encoding="utf-8")
    (d / "st_bad.json").write_text(json.dumps({**base, "live_badge": {"enabled": True, "look": "Z"}}), encoding="utf-8")


def edit_of(d: Path, name: str, style: str) -> Path:
    """灰色の画2カット（2秒と2.5秒）。題の札（2行・字幕を兼ねる）と、字幕の行が2つ。終わりの札は様式が足す。"""
    e = {"version": 2, "id": f"selftest-{name}", "style": style, "sources": {"s": {"path": "src.mp4"}},
         "cuts": [{"src": "s", "in": 0, "out": 60}, {"src": "s", "in": 60, "out": 135}],
         "title": {"text": SHORT, "look": "card", "from": 0, "to": 50, "line": 0},
         "narration": {"engine": "files", "lines": [
             {"at": 0, "text": "ジョージアに来たら", "caption": "", "file": "voice.wav"},
             {"at": 60, "text": "首都の大通りでも寝てる", "file": "voice.wav"}]}}
    p = d / f"edit_{name}.json"
    p.write_text(json.dumps(e, ensure_ascii=False), encoding="utf-8")
    return p


def load(src: Path):
    for name in ("render", "textlook", "flags", "live_badge", "orig_voice"):
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


def laid(R, d: Path, name: str, style: str | dict, long: bool = False):
    """時間割を作り、字を置く（顔は探さない）。style は様式のファイル名か、様式そのもの。

    時間割（plan）は札を見ない（札は字を置く layout で足す）ので、札を出さない様式で1回だけ作って写して使う
    （声の詰め・音の段で1回 3〜4秒かかる。足ごとに作ると、守りを外す子11本で倍の時間になる）。
    """
    ed, st, base = R.load(edit_of(d, "base", style if isinstance(style, str) else "st_off.json"))
    if isinstance(style, dict):
        st = style
    if d not in _PLAN:
        e0, s0, b0 = R.load(edit_of(d, "base", "st_off.json"))
        (d / "w_plan").mkdir(parents=True, exist_ok=True)
        _PLAN[d] = R.plan(e0, s0, b0, d / "w_plan")
    p = copy.deepcopy(_PLAN[d])
    if long:
        p["titles"][0]["lines"] = TITLE.split("\n")
    work = d / f"w_{name}"
    work.mkdir(parents=True, exist_ok=True)
    layers = R.layout(p, st, work)
    return p, st, layers


def vis(png: str, x: int, y: int) -> list[int]:
    import numpy as np
    from PIL import Image
    a = np.asarray(Image.open(png).convert("RGBA"))[:, :, 3]
    ys, xs = np.nonzero(a >= 16)
    return [x + int(xs.min()), y + int(ys.min()), x + int(xs.max()) + 1, y + int(ys.max()) + 1]


def near(a, b, m) -> bool:
    return a[0] < b[2] + m and b[0] < a[2] + m and a[1] < b[3] + m and b[1] < a[3] + m


def sig(layers) -> list:
    """置き場と絵のバイト（出さない回が何も変わらないかを、字の全部で比べる）。"""
    out = []
    for ly in layers:
        it = ly["item"]
        img = ly["imgs"][0] if ly.get("imgs") else ly["base"]
        out.append((ly["kind"], it.get("from"), it.get("to"), it.get("x"), it.get("y"), img.size, img.tobytes()))
    return out


# ---------------------------------------------------------------- 足

def leg_off_default(R, d: Path) -> list[tuple[str, bool]]:
    p, st, layers = laid(R, d, "off", "st_off.json")
    kinds = [ly["kind"] for ly in layers]
    t, n = p["titles"][0], p["notes"][0]
    out = [(f"様式のまま（enabled: {st['live_badge'].get('enabled')}）では時間割に札が無い", "live_badge" not in p),
           (f"重ね物に札が無い（{sorted(set(kinds))}）", "badge" not in kinds),
           (f"題の札は y 380（{t['y']}）・注は y 400（{n['y']}）", (t["y"], n["y"]) == (380, 400))]
    st2 = json.loads(json.dumps(st))
    st2.pop("live_badge")
    _, _, layers2 = laid(R, d, "nokey", st2)
    out.append((f"様式から live_badge を消した版と、字の絵と置き場が全部同じ（{len(layers)} 枚）", sig(layers) == sig(layers2)))
    return out


def leg_on_place(R, d: Path) -> list[tuple[str, bool]]:
    p, st, layers = laid(R, d, "on", "st_on.json")
    lb = p.get("live_badge")
    if not lb:
        return [("時間割に札がある", False)]
    bl = [ly for ly in layers if ly["kind"] == "badge"]
    out = [(f"札は x 120・y 372（{lb['x']}, {lb['y']}）", (lb["x"], lb["y"]) == (120, 372)),
           (f"0コマ目から最後まで（{lb['from']}〜{lb['to']} / {p['frames']}）", (lb["from"], lb["to"]) == (0, p["frames"])),
           (f"重ね物に札がちょうど1枚（{len(bl)}）", len(bl) == 1)]
    if len(bl) == 1:
        W = p["size"][0]
        got = [R.layer_at(bl[0], f, W, st) for f in (0, p["frames"] - 1)]
        out.append(("0コマ目と最後のコマで、札が (120, 372) に重なる",
                    all(g is not None and (g[0].x, g[0].y) == (120, 372) for g in got)))
    return out


def leg_room(R, d: Path) -> list[tuple[str, bool]]:
    p, st, layers = laid(R, d, "room", "st_on.json", long=True)
    lb = p.get("live_badge")
    if not lb:
        return [("時間割に札がある", False)]
    bottom = lb["y"] + lb["h"] + lb["gap"]
    t, n = p["titles"][0], p["notes"][0]
    lim = 380 + 456
    bb = vis(lb["png"], lb["x"], lb["y"])
    tb, nb = vis(t["png"], t["x"], t["y"]), vis(n["png"], n["x"], n["y"])
    return [(f"題の札が札の下（y {t['y']}、欲しいのは {bottom}）", t["y"] == bottom),
            (f"題の札の下端 {t['y'] + t['h']} が元の限り {lim} を越えない", t["y"] + t["h"] <= lim),
            (f"終わりの札（注の置き場）が札の下（y {n['y']}、欲しいのは {bottom}）", n["y"] == bottom),
            (f"札と題の札の見える画素が {MARGIN}px より近づかない（{bb} と {tb}）", not near(bb, tb, MARGIN)),
            (f"札と終わりの札が {MARGIN}px より近づかない（{bb} と {nb}）", not near(bb, nb, MARGIN))]


def leg_limits(R, d: Path) -> list[tuple[str, bool]]:
    p, st, layers = laid(R, d, "lim", "st_on.json")
    lb = p.get("live_badge")
    if not lb:
        return [("時間割に札がある", False)]
    bot = lb["y"] + lb["h"]
    it = {"from": p["frames"] - 10, "to": p["frames"]}   # 題の札が消えたあとの行
    tl = R.top_limit(it, p, st["safe"]["top"])
    zone = p["layout"]["telop_zone"]
    return [(f"字の上端の限り {tl} が札の下端＋24（{bot + 24}）より下", tl >= bot + 24),
            (f"テロップの置き場の上端 {zone[0]} が札の下端＋20（{bot + 20}）より下", zone[0] >= bot + 20)]


def leg_looks(R, d: Path) -> list[tuple[str, bool]]:
    import numpy as np
    import live_badge as LB
    st = R.load_style("st_off.json", d)
    fp = lambda k: R.font_path(st, k)  # noqa: E731
    out = []
    imgs = {}
    for look in "ABC":
        s = json.loads(json.dumps(st))
        s["live_badge"].update({"enabled": True, "look": look})
        cfg = LB.config(s)
        im = LB.badge_img(cfg, fp)
        imgs[look] = np.asarray(im)
        out.append((f"{look}: 高さ 54〜56・幅 280〜480（{im.size}）", 54 <= im.height <= 56 and 280 <= im.width <= 480))
        out.append((f"{look}: 2回描いて同じバイト", im.tobytes() == LB.badge_img(cfg, fp).tobytes()))
    a = imgs["A"]
    red = (a[:, :, 0] > 200) & (a[:, :, 1] < 90) & (a[:, :, 2] < 90) & (a[:, :, 3] > 250)
    white = (a[:, :, :3].min(axis=2) > 235) & (a[:, :, 3] > 250)
    out.append((f"A: 赤い札（{int(red.sum())}画素）と白い字（{int(white.sum())}画素）", red.sum() > 3000 and white.sum() > 800))
    b = imgs["B"]
    redb = (b[:, :, 0] > 200) & (b[:, :, 1] < 90) & (b[:, :, 2] < 90) & (b[:, :, 3] > 250)
    clear = (b[:, :, 3] == 0).mean()
    out.append((f"B: 赤い三角（{int(redb.sum())}画素）・地が無い（透明 {clear:.0%}）", redb.sum() > 300 and clear > 0.35))
    c = imgs["C"]
    half = (c[:, :, 3] > 120) & (c[:, :, 3] < 170)
    redc = (c[:, :, 0] > 200) & (c[:, :, 1] < 90) & (c[:, :, 3] > 250)
    out.append((f"C: 半透明の地（{int(half.sum())}画素）と赤い点（{int(redc.sum())}画素）", half.sum() > 4000 and redc.sum() > 60))
    s = json.loads(json.dumps(st))
    s["live_badge"].update({"enabled": True, "look": "A", "scale": 1.5})
    big = LB.badge_img(LB.config(s), fp)
    out.append((f"scale 1.5 で高さ 84（{big.height}）", big.height == 84))
    return out


def leg_bad_look(R, d: Path) -> list[tuple[str, bool]]:
    try:
        laid(R, d, "bad", "st_bad.json")
    except SystemExit as e:
        return [(f"looks に無い look で止まった（{e.code}）", True)]
    return [("looks に無い look で止まる", False)]


def leg_e2e(R, d: Path) -> list[tuple[str, bool]]:
    """本物の書き出し（下書き）を回して、品質チェックの札の検査と字の置き場の検査に通す。"""
    edit = edit_of(d, "e2e", "st_on.json")
    mp4, work = d / "e2e.mp4", d / "e2e.work"
    r = subprocess.run([sys.executable, str(Path(R.__file__)), str(edit), "--draft", "--out", str(mp4),
                        "--work", str(work)], capture_output=True, text=True, timeout=300)
    if r.returncode != 0 or not mp4.is_file():
        return [(f"書き出しが落ちた（{r.returncode}）: {(r.stderr or '')[-300:]}", False)]
    qa = Path(R.__file__).resolve().parent.parent / "qa"
    code = ("import json,sys; sys.path.insert(0, sys.argv[1]); import check as C; "
            "ctx = C.make_ctx(__import__('pathlib').Path(sys.argv[2]), __import__('pathlib').Path(sys.argv[3])); "
            "print(json.dumps(C.run_checks(ctx, only=['live_badge', 'safe_area']), default=str))")
    q = subprocess.run([sys.executable, "-c", code, str(qa), str(mp4), str(work)], capture_output=True, text=True,
                       timeout=300)
    try:
        rep = json.loads(q.stdout.strip().splitlines()[-1])
    except (ValueError, IndexError):
        return [(f"品質チェックが読めない: {(q.stderr or q.stdout)[-300:]}", False)]
    got = {c["id"]: c for c in rep["checks"]}
    lbc = got.get("live_badge", {})
    m = lbc.get("measured", {})
    return [(f"札の検査が通る（{lbc.get('status')}: {lbc.get('summary')}）", lbc.get("status") == "pass"),
            (f"札を出す回として見た（applicable {m.get('applicable')}・{m.get('frames_looked')}コマ）",
             m.get("applicable") is True and (m.get("frames_looked") or 0) >= 3),
            (f"字の置き場の検査が通る（{got.get('safe_area', {}).get('status')}）", got.get("safe_area", {}).get("status") == "pass")]


LEGS = {
    "off_default": leg_off_default,
    "on_place": leg_on_place,
    "room": leg_room,
    "limits": leg_limits,
    "looks": leg_looks,
    "bad_look": leg_bad_look,
    "e2e": leg_e2e,
}


def run_legs(src: Path, d: Path) -> tuple[list[str], int]:
    R = load(src)
    sys.path.insert(0, str(src))
    failed, checked = [], 0
    for name, fn in LEGS.items():
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
        src = box / "render"
        src.mkdir()
        make_src(src, name)
        d = box / "case"
        d.mkdir()
        make_assets(d)
        failed, checked = run_legs(src, d)
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
                           env=dict(os.environ, BREAK=name), timeout=600, check=False)
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
