#!/usr/bin/env python3
"""**テロップ・フックの見本を並べた1枚**を作り、あやとが選んだ見た目を控える（帳面 F-084）。

    L=tools/shorts/style/look_sheet.py
    python3 $L make --frame <コマ.jpg> --look A=tools/shorts/render/style_v3.json --look B=<様式>@<別のコマ.jpg> \\
        --line "字幕の1行" [--big "大きい字"] [--card "🇷🇴題の札"] --out <リポジトリの外>
    #   → <out>/looks.png（並べた1枚）と looks.json（案ごとの様式と見た目の指紋・見本の印 LOOKS:<8桁>）。
    #     制作 issue に、絵と「見本の印 LOOKS:<8桁>」の字と「どれが良いですか？」を1つのコメントで出す
    python3 $L chosen --sheet <out>/looks.json --pick B --comment <見本を出したコメントの URL> --reply <あやとが選んだコメントの URL>
    #   → 選んだ案の見た目の指紋を控え（looks_chosen.json）に足す。見本のコメントに印が在り、返事があやと本人のコメントのときだけ
    python3 $L fp <edit_X.json>      # 指示書の見た目の指紋と、控えに在るか（終了コード 0=在る / 1=無い / 2=読めない）

あやと（2026-11-18 #1266）「テロップがださい」「フックとテロップの編集は比較したい」、（2026-11-23 #1403）「迷ったらどれが良いですか？って
聞いてくれたら、完成共有します」。前は見本を出す段の道具が無く、こちらで1つに決めて書き出し、完成で初めて見せていた。

## 見た目の指紋（`fingerprint`）

様式（`extends` をたどって重ねたもの）のうち、字の見た目を決める区画（`LOOK_KEYS`: 書体・字幕・強調・大きい字・題の札・上の題・注）を、
`_` で始まる注を除いて並べ直した sha1 の頭16桁。位置・音・書き出しの設定（安全域・BGM・符号化）は入れない
（字の見た目を変えずに音を直した版で、見本を出し直させない）。

## 関所（`tools/shorts/post/preflight.py` の `looks`）

指示書の見た目の指紋が控えに無ければ、書き出し（`remote.py up`。下書き `--draft` は見本のために回すので止めない）と送る段
（`post.py send`）で止まる。控えに足せるのは `chosen` だけで、足すには**見本を出した制作 issue のコメント**（本文に印 `LOOKS:<8桁>`）と、
**あやと本人が選んだコメント**の URL が要る。2026-11-27 の時点で書き出していた指示書の見た目は、控えの頭に `baseline` で入れた
（2026-11-20 にあやとがテロップ A「今のまま」を選んだ。それより前に見せて通した回の見た目）。

**作った絵はリポジトリに置かない**（配信のコマが写る）。`--out` はリポジトリの外。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
RENDER = ROOT / "tools/shorts/render"
CHOSEN = HERE / "looks_chosen.json"
LOOK_KEYS = ("fonts", "caption", "telop", "big", "title_card", "title", "note")
MARK = "LOOKS:"
COMMENT = re.compile(r"https://github\.com/Ayato-kosaka/live-streaming/issues/(\d+)#issuecomment-(\d+)$")
TILE = (540, 960)   # 1案の大きさ（1080x1920 の半分）
LABEL_H = 64


# ---------------------------------------------------------------- 様式と指紋

def deep_merge(a: dict, b: dict) -> dict:
    """`render.py` の deep_merge と同じ重ねかた（b が勝つ。辞書どうしは中まで）。"""
    out = dict(a)
    for k, v in b.items():
        out[k] = deep_merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


def load_style(ref: str, base: Path) -> dict:
    """`render.py` の load_style と同じ引きかた（指示書の置き場 → render の置き場。`extends` をたどる）。"""
    path = Path(base) / ref
    if not path.exists():
        path = RENDER / ref
    st = json.loads(path.read_text(encoding="utf-8"))
    parent = st.pop("extends", None)
    return deep_merge(load_style(parent, path.parent), st) if parent else st


def _bare(v):
    if isinstance(v, dict):
        return {k: _bare(x) for k, x in sorted(v.items()) if not str(k).startswith("_")}
    if isinstance(v, list):
        return [_bare(x) for x in v]
    return v


def fingerprint(style: dict) -> str:
    """字の見た目の指紋（LOOK_KEYS の区画だけ。注は除く）。"""
    body = {k: _bare(style.get(k)) for k in LOOK_KEYS}
    return hashlib.sha1(json.dumps(body, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()[:16]


def edit_fp(edit_path: Path) -> str:
    edit = json.loads(Path(edit_path).read_text(encoding="utf-8"))
    return fingerprint(load_style(edit.get("style", "style.json"), Path(edit_path).resolve().parent))


def load_chosen(path: Path | None = None) -> dict:
    try:
        d = json.loads(Path(path or CHOSEN).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        d = {}
    d.setdefault("looks", [])
    return d


def chosen_fps(path: Path | None = None) -> set:
    return {x.get("fp") for x in load_chosen(path)["looks"] if x.get("fp")}


# ---------------------------------------------------------------- 見本の1枚

def _font(style: dict, key: str, size: int):
    from PIL import ImageFont
    name = style["fonts"].get(key, key)
    for d in (RENDER / "fonts",):
        if (d / name).exists():
            return ImageFont.truetype(str(d / name), size)
    sys.exit(f"書体が無い: {name}（tools/shorts/render/fetch_fonts.sh を先に回す）")


def _text(style: dict, sec: str, text: str):
    sys.path.insert(0, str(RENDER))
    import textlook  # noqa: E402
    st = style.get(sec) or {}
    font = _font(style, st.get("font", "caption"), int(st.get("size", 66)))
    lines = [ln for ln in str(text).split("\n") if ln] or [""]
    return textlook.text_img(lines, textlook.look_of(st), font, max_width=int(st.get("max_width", 900)))


def tile(frame: Path, style: dict, line: str, big: str | None, card: str | None):
    """1案: コマを 1080x1920 に cover で収め、題の札（上）・大きい字（中ほど）・字幕（下）を様式の見た目で置いて半分に縮める。"""
    from PIL import Image, ImageOps
    W, H = 1080, 1920
    im = ImageOps.fit(Image.open(frame).convert("RGB"), (W, H)).convert("RGBA")
    below = 0   # 題の札の下の端。大きい字は本物では札が消えてから出るので、見本では札の下に並べる（重ねると読めない）
    for sec, text, y in (("title_card", card, (style.get("title_card") or {}).get("top", 380)),
                         ("big", big, (style.get("big") or {}).get("top", 420)),
                         ("caption", line, (style.get("caption") or {}).get("center_y", 1000))):
        if not text:
            continue
        t = _text(style, sec, text)
        x = (W - t.width) // 2
        yy = int(y) - (t.height // 2 if sec == "caption" else 0)
        if sec == "big":
            yy = max(yy, below + 24)
        yy = max(0, min(H - t.height, yy))
        im.alpha_composite(t, (max(0, x), yy))
        if sec == "title_card":
            below = yy + t.height
    return im.convert("RGB").resize(TILE)


def make(looks: list, line: str, big: str | None, card: str | None, out: Path) -> dict:
    """looks: [(名前, 様式の道, コマの道)]。並べた1枚と記録を out に書き、記録を返す。"""
    from PIL import Image, ImageDraw
    if not 2 <= len(looks) <= 4:
        sys.exit(f"見本は2〜4案（いま {len(looks)}。帳面 F-084「同じコマで2〜4案を並べる」）")
    out.mkdir(parents=True, exist_ok=True)
    sheet = Image.new("RGB", (TILE[0] * len(looks), TILE[1] + LABEL_H), "white")
    rec = []
    for i, (name, ref, frame) in enumerate(looks):
        st = load_style(ref, Path.cwd())
        sheet.paste(tile(frame, st, line, big, card), (i * TILE[0], LABEL_H))
        ImageDraw.Draw(sheet).text((i * TILE[0] + 16, 8), name, fill="black", font=_font(st, "caption", 44))
        rec.append({"name": name, "style": str(ref), "frame": Path(frame).name, "fp": fingerprint(st)})
    png = out / "looks.png"
    sheet.save(png)
    sha = hashlib.sha256(png.read_bytes()).hexdigest()
    d = {"marker": MARK + sha[:8], "sheet_sha256": sha, "line": line, "big": big, "card": card, "looks": rec,
         "made": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    (out / "looks.json").write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return d


# ---------------------------------------------------------------- 選んだ見た目を控える

def _preflight():
    sys.path.insert(0, str(ROOT / "tools/shorts/post"))
    import preflight  # noqa: E402
    return preflight


def chosen_problems(sheet: dict, pick: str, comment_url: str, reply_url: str, fetch=None, is_ayato=None) -> list:
    """控えに足してよいか。止める訳の並び（空なら足してよい）。fetch(cid) → コメントの JSON・is_ayato(コメント) → bool。"""
    pf = None
    if fetch is None or is_ayato is None:
        pf = _preflight()
    fetch = fetch or pf.FETCH
    is_ayato = is_ayato or pf._is_ayato()
    out = []
    names = [x["name"] for x in sheet.get("looks") or []]
    if pick not in names:
        out.append(f"--pick {pick} が見本の案（{'・'.join(names)}）に無い")
    m1, m2 = COMMENT.match(comment_url or ""), COMMENT.match(reply_url or "")
    if not m1 or not m2:
        return out + ["--comment・--reply は制作 issue のコメントの URL（…/issues/N#issuecomment-M）"]
    try:
        c1, c2 = fetch(int(m1.group(2))), fetch(int(m2.group(2)))
    except (OSError, ValueError) as e:
        return out + [f"コメントを読めない: {e}"]
    if sheet.get("marker") not in str(c1.get("body") or ""):
        out.append(f"見本のコメントに印 {sheet.get('marker')} が無い（見本の1枚を出したコメントを渡す）")
    if not is_ayato(c2):
        out.append("返事が、あやと本人のコメントでない（署名・呼び出し・ほかの書き手は数えない。F-002）")
    elif str(c2.get("created_at") or "") < str(c1.get("created_at") or ""):
        out.append("返事が、見本を出したコメントより前に書かれている（見本を見て選んだ返事を渡す）")
    return out


def add_chosen(sheet: dict, pick: str, comment_url: str, reply_url: str, path: Path | None = None) -> dict:
    path = path or CHOSEN
    d = load_chosen(path)
    look = next(x for x in sheet["looks"] if x["name"] == pick)
    row = {"fp": look["fp"], "from": "chosen", "style": look["style"], "sheet": comment_url, "pick": reply_url,
           "marker": sheet.get("marker"), "at": time.strftime("%Y-%m-%d", time.gmtime())}
    if look["fp"] not in {x.get("fp") for x in d["looks"]}:
        d["looks"].append(row)
        Path(path).write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return row


# ---------------------------------------------------------------- 入口

def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="テロップ・フックの見本を並べた1枚と、選んだ見た目の控え（帳面 F-084）")
    sub = ap.add_subparsers(dest="cmd", required=True)
    mk = sub.add_parser("make")
    mk.add_argument("--frame", required=True, help="見本の地のコマ（全部の案で同じコマ。案ごとに替えるなら --look の @）")
    mk.add_argument("--look", action="append", default=[], help="<名前>=<様式の JSON>[@<コマ>]（2〜4回）")
    mk.add_argument("--line", required=True, help="字幕に置く1行")
    mk.add_argument("--big", help="大きい字（強調）")
    mk.add_argument("--card", help="題の札")
    mk.add_argument("--out", required=True)
    ch = sub.add_parser("chosen")
    ch.add_argument("--sheet", required=True)
    ch.add_argument("--pick", required=True)
    ch.add_argument("--comment", required=True)
    ch.add_argument("--reply", required=True)
    fp = sub.add_parser("fp")
    fp.add_argument("edit")
    a = ap.parse_args(argv)
    if a.cmd == "make":
        sys.path.insert(0, str(ROOT / "tools/shorts/footage"))
        import footage  # noqa: E402
        out = footage.private_dir(Path(a.out))   # 配信のコマが写る。リポジトリの中なら断る
        looks = []
        for s in a.look:
            name, _, rest = s.partition("=")
            ref, _, frame = rest.partition("@")
            if not name or not ref:
                ap.error(f"--look は <名前>=<様式>[@<コマ>]（{s}）")
            looks.append((name, ref, Path(frame or a.frame)))
        d = make(looks, a.line, a.big, a.card, out)
        print(f"{out / 'looks.png'}（{len(looks)}案）")
        print("制作 issue に絵と次の字を1つのコメントで出す:\n"
              f"  テロップの見本です（見本の印 {d['marker']}）。{'・'.join(x['name'] for x in d['looks'])} のどれが良いですか？")
        return 0
    if a.cmd == "chosen":
        sheet = json.loads(Path(a.sheet).read_text(encoding="utf-8"))
        probs = chosen_problems(sheet, a.pick, a.comment, a.reply)
        for p in probs:
            print(f"✕ {p}")
        if probs:
            return 1
        row = add_chosen(sheet, a.pick, a.comment, a.reply)
        print(f"控えに足した: {row['fp']}（{a.pick}・{row['style']}）→ {CHOSEN.relative_to(ROOT)}（コミットする）")
        return 0
    try:
        f = edit_fp(Path(a.edit))
    except (OSError, ValueError) as e:
        print(f"読めない: {e}", file=sys.stderr)
        return 2
    ok = f in chosen_fps()
    print(f"{a.edit}: 見た目の指紋 {f}（{'控えに在る' if ok else '控えに無い。make で見本を出し、選んでもらってから chosen'}）")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
