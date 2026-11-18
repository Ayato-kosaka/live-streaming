"""**続けて書いて1つに見せる字（「……」「——」「ーー」）が、どの字幕の見た目でも1つの塊に見えるか。**

    python3 tools/shorts/render/join_selftest.py
    python3 tools/shorts/render/join_selftest.py --table [--src DIR]   # 見た目ごとの空きの表だけ（DIR は別の写しの render/）
    python3 tools/shorts/render/join_selftest.py --sheet out.png       # 見た目ごとに「苦手やってん……」を描いて並べた1枚
    BREAK=dots python3 tools/shorts/render/join_selftest.py            # 守りを1つ外した版で回す（対照の子）

終了コード 0=通った / 1=落ちた / **2=数えるものが無い・外す字が見つからない**（`docs/island-standards.md` §15）。

ヨーグルトの回の下見 `ygt-p1-v2` の 32秒「苦手やってん……」が「苦手やってん… …」に見えた（感情の字幕 `anxious`、
書体 Yusei Magic）。書体の「…」が3つの点を em の真ん中に寄せていて、2つ並べると継ぎ目だけ 0.34em 空く
（字の中の点と点は 0.13em）。直しは `textlook.py` の「続けて書いて1つに見せる字」（継ぎ目の送りを字形から測る）と、
テロップの `render.py` の `telop_canvas`。

要るのは numpy・Pillow・OpenCV（字の縁を `textlook.py` が OpenCV で描く）と budoux（行の割り）。書き出し（ffmpeg）は
使わない。**書体は本物が要る**（隙間は書体の字形で出るので、代わりの書体では測れない）。`fonts/` に無ければ
`fetch_fonts.sh` の写しで一時の置き場に落とす（CI はこちら）。Selftests には numpy が無いので、回し役
（`python/selftest_runner.py`）の SKIP に理由つきで載せ、`.github/workflows/shorts_selftest.yml` が名指しで回す。

## 何を見るか

様式3つ（`style.json`・`style_p3.json`・`style_v3.json`）にある、字を描く見た目の全部（字幕・注の札・題・題の札の
行ごと・【大】の見た目・感情の字幕の見た目。中身が同じものは1つ）を、本物の `render.py` の行の割り（`fit_lines`）と
`textlook.text_img` で1コマずつ描く。字の塗りだけ緑（#00FF00）に替えて描き、緑の画素を字の形として測る
（縁・発光・地はそのまま。塗りと縁の色が同じ見た目でも、塗りだけを数えられる）。

| 足 | 確かめること |
| --- | --- |
| `dots` | 「苦手やってん……」「苦手やってん‥‥」の、2つの字の継ぎ目の空きが、1つの字の中の点と点の空きの 1/1.5〜1.5 倍 |
| `lines` | 「苦手やってん——」「――」「ーー」が、継ぎ目で切れずに1本（右端の1本の長さが、1字の線の 1.5〜2 倍） |
| `center` | 「苦手やってん……」を描いた絵の、字の左右の空きが「苦手やってん…」と同じ（±2px）。測る送り（`advance`）と描く送りが食い違うと、字が絵の中で片寄る |
| `same` | 続けて書かない字（「…」「ー」「—」が1つずつ）は、直しを切った描き方と1バイトも変わらない |
| `telop` | テロップ（`telop_card`）でも「ーー」が1本・「……」の空きがそろう・続けて書かない字は変わらない |

## 守りを1つずつ外す（§15「対照は、足の数だけ用意する」）

下の `CUTS` が本物の字を1か所だけ書き換えた写しを作り、それで足を全部回す。**外した守りの足だけが落ちる**
ことを確かめる。外す字が本物に見つからなければ 2 で落ちる（字を直したのに、ここを直し忘れた）。
"""
from __future__ import annotations

import argparse
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
STYLES = ("style.json", "style_p3.json", "style_v3.json")
GREEN = "#00FF00"
BASE = "苦手やってん"
SAME_TEXT = "苦手…ラーメンたべた—！ほんま―"   # 続けて書く字が1つずつ（続かない）
RATIO = 1.5

# 名前: (ファイル, 本物の字, 外した字, 落ちるはずの足, 何を外したか)
CUTS: dict[str, tuple[str, str, str, set[str], str]] = {
    "dots": ("textlook.py",
             "        want = min(natural, float(np.median(starts[1:] - ends[:-1])))\n",
             "        want = natural\n",
             {"dots"}, "点の字の継ぎ目を、字の中の点の空きにそろえない"),
    "lines": ("textlook.py",
              "        want = natural if natural <= 0 else -float(body[0] + (len(hs) - 1 - body[-1]))\n",
              "        want = natural\n",
              {"lines", "telop"}, "線の字の継ぎ目を重ねない（切れたまま）"),
    "tracking": ("textlook.py",
                 "    return _joint_em(font.path, a) * font.size - tracking * font.size\n",
                 "    return _joint_em(font.path, a) * font.size\n",
                 {"dots"}, "継ぎ目にも字間を掛ける（字間が負の見た目で、継ぎ目だけ詰まる）"),
    "pair": ("textlook.py",
             "    if a != b or len(a) != 1 or a not in JOIN_CHARS:\n",
             "    if len(a) != 1 or a not in JOIN_CHARS:\n",
             {"same"}, "同じ字が続かなくても、続けて書く字の後ろを詰める"),
    "measure": ("textlook.py",
                "        return sum(advance(p, font, tracking, fl) for p in ps) + \\\n"
                "            sum(join_step(a, b, font, tracking) for a, b in zip(ps, ps[1:]))\n",
                "        return sum(advance(p, font, tracking, fl) for p in ps)\n",
                {"center"}, "測る送りに継ぎ目の直しを入れない（描く送りと食い違う）"),
    "draw": ("textlook.py",
             "                    x += join_step(pc, pieces[k + 1], f, tracking)\n",
             "                    pass\n",
             {"dots", "lines", "center"}, "描くときに継ぎ目の送りを直さない"),
    "telop": ("render.py", "                if shown and TL.has_join(shown):\n", "                if False:\n",
              {"telop"}, "テロップでは続けて書く字をそのまま描く"),
    "telop_order": ("render.py",
                    "                    for pc, px in zip(ps, xs):\n"
                    "                        d.text((px, y + asc + dy), pc, font=f, anchor=\"ls\", fill=stroke_fill,\n"
                    "                               stroke_width=stroke, stroke_fill=stroke_fill)\n"
                    "                    for pc, px in zip(ps, xs):\n"
                    "                        d.text((px, y + asc + dy), pc, font=f, anchor=\"ls\", fill=fill)\n",
                    "                    for pc, px in zip(ps, xs):\n"
                    "                        d.text((px, y + asc + dy), pc, font=f, anchor=\"ls\", fill=fill,\n"
                    "                               stroke_width=stroke, stroke_fill=stroke_fill)\n",
                    {"telop"}, "テロップの縁と塗りを1字ずつ描く（重ねた線の継ぎ目に、後ろの字の縁が乗る）"),
}


# ---------------------------------------------------------------- 道具の用意

def style_fonts() -> set[str]:
    """様式3つが名指しする書体のファイル名。"""
    names: set[str] = set()

    def walk(v):
        if isinstance(v, dict):
            for k, x in v.items():
                if k == "font" and isinstance(x, str) and x.endswith(".ttf"):
                    names.add(x)
                walk(x)
        elif isinstance(v, list):
            for x in v:
                walk(x)

    for s in STYLES:
        st = json.loads((HERE / s).read_text(encoding="utf-8"))
        names |= {v for k, v in (st.get("fonts") or {}).items() if not k.startswith("_")}
        walk(st)
    return names


def ensure_fonts(box: Path) -> Path | None:
    """本物の書体の置き場。fonts/（か SHORTS_FONTS_DIR）に揃っていなければ、fetch_fonts.sh の写しで box に落とす。"""
    need = style_fonts()
    for d in [os.environ.get("SHORTS_FONTS_DIR"), str(HERE / "fonts")]:
        if d and all((Path(d) / n).exists() for n in need):
            return Path(d)
    ff = box / "fetch"
    ff.mkdir(exist_ok=True)
    shutil.copy(HERE / "fetch_fonts.sh", ff / "fetch_fonts.sh")
    r = subprocess.run(["bash", str(ff / "fetch_fonts.sh")], capture_output=True, text=True, timeout=600, check=False)
    if r.returncode != 0 or not all((ff / "fonts" / n).exists() for n in need):
        print(f"✕ 書体を落とせない（fetch_fonts.sh の終わり: {(r.stdout + r.stderr).strip()[-300:]}）")
        return None
    return ff / "fonts"


def make_src(dst: Path, cut: str | None) -> None:
    """本物を写す（守りを1つ外すなら、その字だけ書き換える）。外す字が無ければ 2 で落ちる。"""
    for p in HERE.glob("*.py"):
        shutil.copy(p, dst / p.name)
    for p in HERE.glob("*.json"):
        shutil.copy(p, dst / p.name)
    shutil.copytree(HERE / "flags", dst / "flags")
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
    """写しの render.py（と、それが読む textlook.py）を読み込む。"""
    for name in ("render", "textlook", "flags", "live_badge", "orig_voice", "talk", "sticker"):
        sys.modules.pop(name, None)
    sys.path.insert(0, str(src))
    try:
        spec = importlib.util.spec_from_file_location("render", src / "render.py")
        mod = importlib.util.module_from_spec(spec)
        sys.modules["render"] = mod
        spec.loader.exec_module(mod)
        return mod, sys.modules["textlook"]
    finally:
        sys.path.pop(0)


# ---------------------------------------------------------------- 見た目の全部

def looks(R, TL, src: Path) -> list[dict]:
    """様式3つの、字を描く見た目の全部（中身が同じものは1つ）。描くときの大きさと幅は render.py と同じ所から取る。"""
    out, seen = [], set()
    for sname in STYLES:
        style = R.load_style(sname, src)
        tag = sname.removesuffix(".json")
        cands = []
        for key in ("caption", "note", "title"):
            st = style[key]
            cands.append((key, TL.look_of(st), st["font"], st["size"], st.get("min_size", st["size"]),
                          st.get("max_width", 840), st.get("max_lines", 2), 0, 0))
        tc = style["title_card"]
        pad_x = tc.get("pad", [tc.get("pad_x", 30)])[0]
        if tc.get("lines"):
            for k, ls in enumerate(tc["lines"]):
                cands.append((f"title_card.lines[{k}]", ls["look"], ls["font"], ls["size"], ls.get("min_size", 40),
                              tc["max_width"] - 2 * pad_x, ls.get("max_lines", 2), ls.get("wrap_below", 0), 0))
        else:
            cands.append(("title_card", {k: v for k, v in TL.look_of(tc).items() if k != "box"}, tc["font"],
                          tc["size"], tc["min_size"], tc["max_width"] - 2 * pad_x, 2, 0, 0))
        big = style.get("big") or {}
        for name, ent in (big.get("looks") or {}).items():
            if isinstance(ent, dict):
                cands.append((f"big.{name}", ent.get("look", ent), ent.get("font", big["font"]),
                              ent.get("size", big["size"]), ent.get("min_size", big["min_size"]), big["max_width"],
                              ent.get("max_lines", big.get("max_lines", 2)), ent.get("wrap_below", 0),
                              ent.get("fold_floor", 0)))
        moods = style.get("moods") or {}
        for name, ment in (moods.get("looks") or {}).items():
            if isinstance(ment, dict):
                cands.append((f"moods.{name}", ment["look"], ment["font"], ment["size"],
                              ment.get("min_size", ment["size"]), moods["max_width"], moods.get("max_lines", 2),
                              ment["size"], 0))
        for name, lk, font, size, mn, mw, ml, wb, ff in cands:
            fpath = R.font_path(style, font)
            key = json.dumps([fpath.name, lk, size, mn, mw, ml, wb, ff], sort_keys=True, ensure_ascii=False)
            if key in seen:
                continue
            seen.add(key)
            out.append({"name": f"{tag}:{name}", "look": lk, "fpath": fpath, "size": size, "min": mn,
                        "max_w": mw, "max_lines": ml, "wrap_below": wb, "fold_floor": ff})
    return out


def green(lk: dict) -> dict:
    """塗りだけ緑にした look（縁・発光・地・置き場はそのまま）。"""
    g = {**lk, "fill": GREEN}
    if g.get("highlight"):
        g["highlight"] = {**g["highlight"], "fill": GREEN}
    return g


def fit(R, L: dict, text: str):
    return R.fit_lines(text, L["look"], L["fpath"], L["size"], L["min"], L["max_w"], L["max_lines"],
                       L["wrap_below"], fold_floor=L["fold_floor"])


def draw(R, TL, L: dict, lines: list[str], size: int, look: dict | None = None):
    from PIL import ImageFont
    return TL.text_img(lines, look or green(L["look"]), ImageFont.truetype(str(L["fpath"]), size),
                       seed=TL.text_seed("".join(lines)))


_DRAWN: dict = {}


def drawn(R, TL, L: dict, lines: list[str], size: int):
    """塗りを緑にした絵（足どうしで同じ絵を2回描かない。直しを切って描く `same` では使わない）。"""
    key = (L["name"], tuple(lines), size)
    if key not in _DRAWN:
        _DRAWN[key] = draw(R, TL, L, lines, size)
    return _DRAWN[key]


def fill_mask(img):
    """緑の塗りの画素（濃さ半分より上）。"""
    import numpy as np
    a = np.asarray(img.convert("RGBA")).astype(int)
    return ((a[..., 1] - np.maximum(a[..., 0], a[..., 2])) >= 128) & (a[..., 3] >= 128)


def runs(v) -> list[tuple[int, int]]:
    import numpy as np
    e = np.diff(np.concatenate([[0], v.astype(np.int8), [0]]))
    return list(zip(np.nonzero(e == 1)[0].tolist(), np.nonzero(e == -1)[0].tolist()))


def last_line_cols(m) -> list[tuple[int, int]]:
    """いちばん下の行（字の形のある行の帯のうち最後）の、字の形の列の切れ目。続けて書く字は文の終わりなので、ここにある。"""
    bands = runs(m.any(axis=1))
    if not bands:
        return []
    y0, y1 = bands[-1]
    return runs(m[y0:y1].any(axis=0))


def dot_gaps(img, n: int, size: int) -> tuple[float, float] | str:
    """右端 n 個の点の、字の中の空き（平均）と継ぎ目の空き。読めなければ理由。

    いちばん左の点は、字間を詰めた見た目で前の字（「ん」の払い）とつながることがあるので、幅を見ない（右の端だけ使う）。
    """
    cols = last_line_cols(fill_mask(img))
    if len(cols) < n:
        return f"点が {len(cols)} 個しか読めない"
    r = cols[-n:]
    if any(b - a > 0.3 * size for a, b in r[1:]):
        return f"右端の {n} 個が点に見えない（幅 {[b - a for a, b in r]}。点どうしがつながった）"
    gaps = [r[i + 1][0] - r[i][1] for i in range(n - 1)]
    j = n // 2 - 1
    inner = [g for i, g in enumerate(gaps) if i != j]
    return sum(inner) / len(inner), float(gaps[j])


def line_join(img, fpath: Path, size: int, ch: str) -> tuple[int, int, int]:
    """右端の線の長さ・1字の線の長さ（書体の字形から）・継ぎ目の空き（1本なら 0）。

    線のまん中の行（±1）に沿って、右端からつながっている長さを測る。字間を詰めた見た目では前の字（「ん」）が
    線に触れることがあるので、1字ぶんは描いた絵からではなく書体の字形から取る。
    """
    import numpy as np
    from PIL import ImageFont
    bb = ImageFont.truetype(str(fpath), size).getmask(ch).getbbox()
    w = bb[2] - bb[0] if bb else 0
    m = fill_mask(img)
    bands = runs(m.any(axis=1))
    if not bands or not w:
        return 0, w, -1
    sub = m[bands[-1][0]:bands[-1][1]]
    xr = int(np.nonzero(sub.any(axis=0))[0][-1])
    ys = np.nonzero(sub[:, max(0, xr - w // 4):xr + 1].any(axis=1))[0]
    yc = (int(ys[0]) + int(ys[-1])) // 2
    rr = runs(sub[max(0, yc - 1):yc + 2].any(axis=0))
    ln = rr[-1][1] - rr[-1][0]
    gap = 0 if ln >= 1.5 * w else (rr[-1][0] - rr[-2][1] if len(rr) > 1 else -1)
    return ln, w, gap


def drop_last(lines: list[str], k: int = 1) -> list[str]:
    return lines[:-1] + [lines[-1][:-k]]


# ---------------------------------------------------------------- 足

def measure_dots(R, TL, Ls) -> list[dict]:
    rows = []
    for L in Ls:
        for pair, n in (("……", 6), ("‥‥", 4)):
            lines, size = fit(R, L, BASE + pair)
            got = dot_gaps(drawn(R, TL, L, lines, size), n, size)
            rows.append({"look": L["name"], "text": pair, "size": size, "got": got})
    return rows


def measure_lines(R, TL, Ls) -> list[dict]:
    rows = []
    for L in Ls:
        for ch in "—―ー":
            lines, size = fit(R, L, BASE + ch * 2)
            ln, w, gap = line_join(draw(R, TL, L, lines, size), L["fpath"], size, ch)
            rows.append({"look": L["name"], "text": ch * 2, "size": size, "len": ln, "w1": w, "gap": gap})
    return rows


def dots_ok(got) -> bool:
    return not isinstance(got, str) and got[0] > 0 and 1 / RATIO <= got[1] / got[0] <= RATIO


def lines_ok(r) -> bool:
    return r["w1"] > 0 and r["gap"] == 0 and r["len"] >= 1.5 * r["w1"]


def leg_dots(R, TL, Ls) -> list[tuple[str, bool]]:
    out = []
    for r in measure_dots(R, TL, Ls):
        g = r["got"]
        what = g if isinstance(g, str) else f"字の中 {g[0]:.1f}px・継ぎ目 {g[1]:.0f}px（{g[1] / max(g[0], 1e-6):.2f} 倍）"
        out.append((f"{r['look']}「{r['text']}」{r['size']}px: {what}", dots_ok(g)))
    return out


def leg_lines(R, TL, Ls) -> list[tuple[str, bool]]:
    return [(f"{r['look']}「{r['text']}」{r['size']}px: つながった線 {r['len']}px（1字 {r['w1']}px）・継ぎ目の空き {r['gap']}px",
             lines_ok(r)) for r in measure_lines(R, TL, Ls)]


def leg_center(R, TL, Ls) -> list[tuple[str, bool]]:
    """いちばん下の行の、字の右の空きと左の空きの差（片寄り）が「……」と「…」で同じか。"""
    def lean(img):
        m = fill_mask(img)
        y0, y1 = runs(m.any(axis=1))[-1]
        c = runs(m[y0:y1].any(axis=0))
        return (img.width - c[-1][1]) - c[0][0]
    out = []
    for L in Ls:
        lines, size = fit(R, L, BASE + "……")
        a2, a1 = lean(drawn(R, TL, L, lines, size)), lean(drawn(R, TL, L, drop_last(lines), size))
        out.append((f"{L['name']} {size}px: 字の片寄り（右の空き−左の空き）「……」{a2}px・「…」{a1}px", abs(a2 - a1) <= 2))
    return out


def plain(TL):
    """直しを切った描き方（続けて書く字を見ない）にする。戻す関数を返す。"""
    keep = (TL.has_join, TL.join_step)
    TL.has_join = lambda text: False
    TL.join_step = lambda *a: 0.0

    def back():
        TL.has_join, TL.join_step = keep
    return back


def leg_same(R, TL, Ls) -> list[tuple[str, bool]]:
    out = []
    for L in Ls:
        lines, size = fit(R, L, SAME_TEXT)
        real = draw(R, TL, L, lines, size).tobytes()
        back = plain(TL)
        try:
            off = draw(R, TL, L, lines, size).tobytes()
        finally:
            back()
        out.append((f"{L['name']}「{'｜'.join(lines)}」{size}px: 直しを切った描き方と同じバイト", real == off))
    return out


def leg_telop(R, TL, Ls) -> list[tuple[str, bool]]:
    out = []
    for sname in STYLES:
        style = R.load_style(sname, R.HERE)
        st = style["telop"]
        stg = {**st, "color": GREEN}
        fpath = R.font_path(style, st["font"])
        size = st["size"]
        tag = sname.removesuffix(".json")
        for ch in "—―ー":
            ln, w, gap = line_join(R.telop_card([BASE + ch * 2], stg, fpath, size), fpath, size, ch)
            out.append((f"{tag}:telop「{ch * 2}」: つながった線 {ln}px（1字 {w}px）・継ぎ目の空き {gap}px",
                        lines_ok({"len": ln, "w1": w, "gap": gap})))
        got = dot_gaps(R.telop_card([BASE + "……"], stg, fpath, size), 6, size)
        out.append((f"{tag}:telop「……」: " + (got if isinstance(got, str) else
                    f"字の中 {got[0]:.1f}px・継ぎ目 {got[1]:.0f}px"), dots_ok(got)))
        real = R.telop_card([SAME_TEXT], st, fpath, size).tobytes()
        back = plain(TL)
        try:
            off = R.telop_card([SAME_TEXT], st, fpath, size).tobytes()
        finally:
            back()
        out.append((f"{tag}:telop 続けて書かない字は、直しを切った描き方と同じバイト", real == off))
    return out


LEGS = {"dots": leg_dots, "lines": leg_lines, "center": leg_center, "same": leg_same, "telop": leg_telop}


def run_legs(src: Path, quiet: bool) -> tuple[list[str], int]:
    R, TL = load(src)
    Ls = looks(R, TL, src)
    if not quiet:
        print(f"見た目 {len(Ls)} 個（{' / '.join(STYLES)}）")
    failed, checked = [], 0
    for name, fn in LEGS.items():
        try:
            res = fn(R, TL, Ls)
        except SystemExit as e:
            res = [(f"途中で止まった: {e.code}", False)]
        except Exception as e:  # noqa: BLE001 — 足が落ちたことを、ほかの足を止めずに数える
            res = [(f"途中で落ちた: {type(e).__name__}: {e}", False)]
        checked += len(res)
        if any(not ok for _, ok in res):
            failed.append(name)
        if not quiet:
            bad = [r for r in res if not r[1]]
            print(f"[{name}] {len(res) - len(bad)}/{len(res)}")
            for what, ok in (res if name in ("dots", "lines") else bad):
                print(f"  {'○' if ok else '✕'} {what}")
    return failed, checked


def child(name: str | None) -> int:
    """写し（守りを1つ外すならそれ）で足を全部回し、落ちた足の名前を1行で返す（親が読む）"""
    if name and name not in CUTS:
        print(f"✕ BREAK={name} という守りは無い（{' / '.join(CUTS)}）")
        return 2
    with tempfile.TemporaryDirectory() as td:
        box = Path(td)
        fd = ensure_fonts(box)
        if fd is None:
            return 2
        os.environ["SHORTS_FONTS_DIR"] = str(fd)
        src = box / "render"
        src.mkdir()
        make_src(src, name)
        failed, checked = run_legs(src, quiet=bool(name))
    print("LEGS_FAILED " + json.dumps(sorted(failed)))
    if checked == 0:
        return 2
    return 1 if failed else 0


def drill() -> list[str]:
    """守りを1つずつ外して、**その守りの足だけ**が落ちるかを見る。

    子は CPU の数（`JOBS` で絞れる。ほかの書き出しと箱を分けているときは JOBS=2）だけ並べて回す。1本 30〜40秒。
    """
    from concurrent.futures import ThreadPoolExecutor
    print("[対照] 守りを1つずつ外すと、その足だけが落ちるか")
    jobs = max(1, int(os.environ.get("JOBS") or os.cpu_count() or 1))

    def run(name):
        return subprocess.run([sys.executable, str(Path(__file__).resolve())], capture_output=True, text=True,
                              env=dict(os.environ, BREAK=name), timeout=900, check=False)

    with ThreadPoolExecutor(jobs) as ex:
        done = dict(zip(CUTS, ex.map(run, CUTS)))
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


def table(src: Path) -> int:
    """見た目ごとの空きの表（直す前と後を並べるとき。src は render/ の写し）。"""
    with tempfile.TemporaryDirectory() as td:
        fd = ensure_fonts(Path(td))
        if fd is None:
            return 2
        os.environ["SHORTS_FONTS_DIR"] = str(fd)
        R, TL = load(src)
        Ls = looks(R, TL, src)
        lines = {(r["look"], r["text"]): r for r in measure_lines(R, TL, Ls)}
        print("見た目\t大きさ\t……（字の中/継ぎ目/倍）\t‥‥\t——\t――\tーー（継ぎ目の空き px）")
        dots = {}
        for r in measure_dots(R, TL, Ls):
            dots[(r["look"], r["text"])] = r
        for L in Ls:
            cells = []
            for pair in ("……", "‥‥"):
                g = dots[(L["name"], pair)]["got"]
                cells.append(g if isinstance(g, str) else f"{g[0]:.1f}/{g[1]:.0f}/{g[1] / max(g[0], 1e-6):.2f}")
            cells += [str(lines[(L["name"], ch * 2)]["gap"]) for ch in "—―ー"]
            print("\t".join([L["name"], str(dots[(L["name"], "……")]["size"])] + cells))
    return 0


def sheet(out: Path) -> int:
    """見た目ごとに「苦手やってん……」を本物の色で描いて、縦に並べた1枚（人が目で見る用）。"""
    from PIL import Image, ImageDraw
    with tempfile.TemporaryDirectory() as td:
        fd = ensure_fonts(Path(td))
        if fd is None:
            return 2
        os.environ["SHORTS_FONTS_DIR"] = str(fd)
        R, TL = load(HERE)
        Ls = looks(R, TL, HERE)
        ims = []
        for L in Ls:
            lines, size = fit(R, L, BASE + "……")
            ims.append((L["name"], draw(R, TL, L, lines, size, look=L["look"])))
        W = max(im.width for _, im in ims) + 20
        H = sum(im.height + 28 for _, im in ims) + 10
        page = Image.new("RGB", (W, H), (96, 110, 120))
        d = ImageDraw.Draw(page)
        y = 5
        for name, im in ims:
            d.text((10, y), name, fill=(255, 255, 255))
            page.paste(im, (10, y + 22), im)
            y += im.height + 28
        page.save(out)
        print(f"{out}（{len(ims)} 個）")
    return 0


def main() -> int:
    try:
        import cv2  # noqa: F401
        import numpy  # noqa: F401
        from PIL import Image  # noqa: F401
    except ImportError as e:
        print(f"✕ 回せない: {e.name} が無い（numpy・Pillow・opencv-python-headless が要る）")
        return 2
    ap = argparse.ArgumentParser()
    ap.add_argument("--table", action="store_true")
    ap.add_argument("--src", type=Path, default=HERE)
    ap.add_argument("--sheet", type=Path)
    a = ap.parse_args()
    if a.table:
        return table(a.src.resolve())
    if a.sheet:
        return sheet(a.sheet)
    if BREAK:
        return child(BREAK)
    with tempfile.TemporaryDirectory() as td:
        # 書体は1回だけ落として、子（守りを外した写し）にも同じ置き場を渡す
        fd = ensure_fonts(Path(td))
        if fd is None:
            return 2
        os.environ["SHORTS_FONTS_DIR"] = str(fd)
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
