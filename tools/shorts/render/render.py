#!/usr/bin/env python3
"""編集指示書（JSON）1つから、縦型ショート（1080x1920）を書き出す。

    python3 tools/shorts/render/render.py edit.json --out out.mp4 [--work DIR] [--no-text]

## 形

    元素材 ─ffmpeg で復号→ 1コマずつ Python（numpy / OpenCV）
        透かしを外す → 顔をぼかす → 1080x1920 に収める（ゆっくり寄るもここ）→ 字を重ねる
    ─生のコマを pipe で→ ffmpeg（H.264 / AAC。音は Python で作った束を混ぜる）

GitHub Actions の ubuntu ランナー（GPU なし・4コア）で毎回同じ結果を速く出すために、
ブラウザを起こす道具（Remotion・OpenChatCut）ではなく ffmpeg で復号・符号化する（README.md）。
コマだけ Python に通すのは、**ffmpeg のフィルタでは決められないことが3つあったから。**
- ゆっくり寄る: `zoompan` / `scale` の式は整数の画素に丸めるので、1.0→1.1倍を3秒かけると
  1コマごとに 0.5px ずつ跳ねて震えて見える。OpenCV の warpAffine は小数の画素で引ける
- 顔のぼかし: 箱の大きさが時間で変わる（人が近づく）。`crop` の幅と高さは最初に1回しか評価されない
- 字の出し方: テロップを「ポン」と出す（数コマで大きさを変える）には、コマごとに絵を選ぶ必要がある

## 何が「正」か

- **カットは元素材のフレーム番号で持つ**（`in` は含む、`out` は含まない）。
  秒で持つと 29.97 と 30 の丸めで1コマずれる。
- **字幕はナレーションの音声の長さから決める。** 行ごとの声の頭と尻の無音を詰め、
  声が鳴っているあいだだけ字幕を出す。だから字幕とナレーションは同じフレームで始まる。
- **できあがりの時間割（plan.json）を work に書き出す。** 人が直す画面・
  ほかの書き出し先（CapCut の下書きなど）は、この plan.json を読む。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import queue
import re
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
SR = 48000  # 音声のサンプリング周波数。ffmpeg も open_jtalk もこれで揃える

JTALK_VOICE = "/usr/share/hts-voice/nitech-jp-atr503-m001/nitech_jp_atr503_m001.htsvoice"
JTALK_DIC = "/var/lib/mecab/dic/open-jtalk/naist-jdic"


def db(x: float) -> float:
    return 10 ** (x / 20)


def sh(cmd, **kw):
    return subprocess.run(cmd, check=True, **kw)


def cv():
    """OpenCV は書き出しのときだけ要る（時間割だけ作る道具から import しても落ちないように）。"""
    try:
        import cv2
    except ImportError:
        sys.exit("OpenCV が無い（pip install opencv-python-headless）")
    return cv2


def probe(path: Path) -> dict:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
         "stream=width,height,r_frame_rate,color_space", "-of", "json", str(path)],
        check=True, capture_output=True, text=True).stdout
    s = json.loads(out)["streams"][0]
    num, den = s["r_frame_rate"].split("/")
    return {"w": int(s["width"]), "h": int(s["height"]), "fps": int(num) / int(den),
            "color_space": s.get("color_space", "unknown")}


# ---------------------------------------------------------------- 読み込み

def load(edit_path: Path) -> tuple[dict, dict, Path]:
    edit = json.loads(edit_path.read_text())
    base = edit_path.resolve().parent
    style_ref = edit.get("style", "style.json")
    style_path = base / style_ref
    if not style_path.exists():
        style_path = HERE / style_ref
    style = json.loads(style_path.read_text())
    return edit, style, base


def font_path(style: dict, key: str) -> Path:
    name = style["fonts"][key]
    for d in [os.environ.get("SHORTS_FONTS_DIR"), HERE / "fonts"]:
        if d and (Path(d) / name).exists():
            return Path(d) / name
    sys.exit(f"フォントが無い: {name}（tools/shorts/render/fetch_fonts.sh を先に回す）")


def resolve(base: Path, p: str) -> Path:
    q = Path(p)
    return q if q.is_absolute() else (base / q).resolve()


# ---------------------------------------------------------------- ナレーション

# 声の後処理。前後の無音を詰め（字幕の出だしが声より先に出ないように）、80Hz より下を落とす
# （open_jtalk の声は 70Hz 以下にも -28dB ほど鳴っていて、BGM の低音と混ざる。声には要らない帯）
NARR_FILTER = "highpass=f=80,highpass=f=80"

# 頭と尻の詰め方（声の大きさに対する比で決める）。
# 前は ffmpeg の silenceremove（-45dBFS より小さい所を落とす）で詰めていたが、Fish Audio の声は
# 頭に息や部屋鳴りが -45dBFS より大きく入っていて、詰め残した分だけ字幕が声より先に出た。
# 声の出だしは「その行のいちばん大きい所から -30dB を越えた最初のサンプル（2.5ms の後ろ向き RMS）」
# とし（品質チェックの測り方と同じ）、その 20ms 前から使う。20ms は1コマ（33ms）より短いので、
# 字幕を行の頭のコマに出せば、声の出だしも同じコマに入る。
TRIM_ONSET_DB = -30.0
TRIM_TAIL_DB = -40.0
TRIM_PRE_S = 0.020
TRIM_POST_S = 0.080
TRIM_VER = f"trim1|{TRIM_ONSET_DB}|{TRIM_TAIL_DB}|{TRIM_PRE_S}|{TRIM_POST_S}"


def trim_voice(x: np.ndarray) -> np.ndarray:
    """声の頭と尻の、息・部屋鳴り・無音を落とす（上の TRIM_* の説明）。"""
    if len(x) < 240:
        return x
    w = int(SR * 0.0025)
    c = np.concatenate([[0.0], np.cumsum(x.astype(np.float64) ** 2)])
    idx = np.arange(len(x))
    lo = np.maximum(0, idx + 1 - w)
    r = np.sqrt((c[idx + 1] - c[lo]) / (idx + 1 - lo))
    peak = r.max()
    if peak <= 0:
        return x
    on = int(np.argmax(r >= peak * db(TRIM_ONSET_DB)))
    above = np.nonzero(r >= peak * db(TRIM_TAIL_DB))[0]
    off = int(above[-1]) if len(above) else len(x) - 1
    s = max(0, on - int(SR * TRIM_PRE_S))
    e = min(len(x), off + 1 + int(SR * TRIM_POST_S))
    y = x[s:e].astype(np.float32).copy()
    fi, fo = int(SR * 0.003), int(SR * 0.015)
    if len(y) > fi + fo:
        y[:fi] *= np.linspace(0, 1, fi, dtype=np.float32)
        y[-fo:] *= np.linspace(1, 0, fo, dtype=np.float32)
    return y


def trimmed_wav(src: Path, out: Path) -> Path:
    """src を 48kHz・1ch に直し、80Hz より下を落とし、頭と尻を詰めて out に書く。"""
    raw = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(src), "-af", NARR_FILTER,
                          "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"], check=True, capture_output=True).stdout
    x = np.frombuffer(raw, dtype="<f4")
    return write_wav(trim_voice(x)[:, None], out)


def narration_wav(line: dict, narr: dict, base: Path, work: Path) -> Path:
    """1行ぶんのナレーションの wav（48kHz・1ch・頭と尻の無音を詰めたもの）を返す。

    - `audio`: 行ごとの声のファイル（Fish Audio で作ったもの）。詰めて使う。`engine: "files"` の本番
    - `file`: 詰めずにそのまま使う（人が録った声など。頭の間も演出として残したいとき）
    - どちらも無ければ open_jtalk で読ませる（尺の下書き用。`tts_text` があれば読みはそちら）
    中身と処理が同じなら作り直さない。
    """
    if line.get("file"):
        return resolve(base, line["file"])
    engine = narr.get("engine", "open_jtalk")
    if line.get("audio"):
        src = resolve(base, line["audio"])
        key = hashlib.sha256(src.read_bytes() + f"{NARR_FILTER}|{TRIM_VER}".encode()).hexdigest()[:16]
        out = work / "narration" / f"{key}.wav"
        if not out.exists():
            out.parent.mkdir(parents=True, exist_ok=True)
            trimmed_wav(src, out)
        return out
    if engine == "files":
        sys.exit(f"engine が files なのに audio が無い行: {line.get('text')}")
    if engine != "open_jtalk":
        sys.exit(f"未対応のナレーション: {engine}")
    speed = narr.get("speed", 1.0)
    text = line.get("tts_text") or line["text"]
    key = hashlib.sha256(f"{engine}|{speed}|{text}|{NARR_FILTER}|{TRIM_VER}".encode()).hexdigest()[:16]
    out = work / "narration" / f"{key}.wav"
    if out.exists():
        return out
    out.parent.mkdir(parents=True, exist_ok=True)
    txt = out.with_suffix(".txt")
    txt.write_text(text)
    raw = out.with_suffix(".raw.wav")
    sh(["open_jtalk", "-m", JTALK_VOICE, "-x", JTALK_DIC, "-r", str(speed), "-ow", str(raw), str(txt)])
    trimmed_wav(raw, out)
    raw.unlink()
    txt.unlink()
    return out


def write_wav(x: np.ndarray, path: Path) -> Path:
    """float の配列を 16bit の wav に書く（ffmpeg 経由。Python の wave は float を書けない）。"""
    ch = x.shape[1]
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "f32le", "-ar", str(SR),
                    "-ac", str(ch), "-i", "-", "-c:a", "pcm_s16le", "-bitexact", str(path)],
                   input=np.ascontiguousarray(x, dtype="<f4").tobytes(), check=True)
    return path


def decode_audio(path: Path, channels: int = 2, ss: float = 0) -> np.ndarray:
    pre = ["-ss", str(ss)] if ss else []
    raw = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", *pre, "-i", str(path), "-vn",
         "-f", "f32le", "-ac", str(channels), "-ar", str(SR), "-"], check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype="<f4").reshape(-1, channels).copy()


def speech_onsets(x: np.ndarray, spf: int, min_gap: int = 2, rel_db: float = -32) -> list[tuple[int, int]]:
    """1行の声の中の「間」を、コマ単位で（間の始まり, 次に声が出るコマ）の組で返す。

    字幕を何枚かに分けるとき・1行に画を2つ当てるとき、切り替えを声の間に合わせるために使う
    （字数の比だけで切ると、声より先に次の字幕が出たり、遅れたりする）。
    """
    n = len(x) // spf
    if n < 3:
        return []
    fr = x[: n * spf].reshape(n, spf).astype(np.float64)
    rms = np.sqrt(np.mean(fr ** 2, axis=1)) + 1e-12
    lvl = 20 * np.log10(rms / rms.max())
    quiet = lvl < rel_db
    out, k = [], 0
    while k < n:
        if quiet[k]:
            j = k
            while j < n and quiet[j]:
                j += 1
            if k > 0 and j < n and j - k >= min_gap:
                out.append((k, j))
            k = j
        else:
            k += 1
    return out


# ---------------------------------------------------------------- 文字の折り返し

def chunks_of(para: str) -> list[str]:
    try:
        import budoux
        return budoux.load_default_japanese_parser().parse(para)
    except ImportError:
        return list(para)


def balanced2(chunks: list[str], font: ImageFont.FreeTypeFont, max_px: int) -> list[str] | None:
    """2行に割れるなら、2行の幅が揃う区切りを選ぶ。「、」「。」の後ろで割れるならそこを優先。

    前から詰めるだけだと「一台目は、親切な／おっちゃん」になる。読む人は
    意味の切れ目で目を戻すので「一台目は、／親切なおっちゃん」のほうが速く読める。
    """
    best = None
    for k in range(1, len(chunks)):
        a, b = "".join(chunks[:k]).rstrip("、。"), "".join(chunks[k:]).rstrip("、。")
        wa, wb = font.getlength(a), font.getlength(b)
        if wa > max_px or wb > max_px:
            continue
        score = max(wa, wb) - (font.size * 3 if chunks[k - 1].endswith(("、", "。", "？", "！")) else 0)
        if best is None or score < best[0]:
            best = (score, [a, b])
    return best[1] if best else None


def wrap(text: str, font: ImageFont.FreeTypeFont, max_px: int) -> list[str]:
    """文節（BudouX）で区切って、幅に収まるように詰める。

    行末の「、」「。」は落とす。字幕の行末に句読点があると読みにくい。
    """
    lines_out = []
    for para in text.split("\n"):
        chunks = chunks_of(para)
        if font.getlength(para.rstrip("、。")) <= max_px:
            lines_out.append(para)
            continue
        two = balanced2(chunks, font, max_px)
        if two:
            lines_out += two
            continue
        cur = ""
        for ch in chunks:
            cand = cur + ch
            if cur and font.getlength(cand.rstrip("、。")) > max_px:
                lines_out.append(cur)
                cur = ch
            else:
                cur = cand
            # 文節1つが幅を超えるときは、1文字ずつ割る
            while font.getlength(cur.rstrip("、。")) > max_px and len(cur) > 1:
                cut = len(cur)
                while cut > 1 and font.getlength(cur[:cut]) > max_px:
                    cut -= 1
                lines_out.append(cur[:cut])
                cur = cur[cut:]
        if cur:
            lines_out.append(cur)
    return [ln.rstrip("、。").strip() for ln in lines_out if ln.rstrip("、。").strip()]


_SENT = re.compile(r".*?(?:[。！？!?]+[」』）)]*|$)")


def sentences(text: str) -> list[str]:
    """文に分ける。「。」「？」の後ろ（閉じかっこがあればその後ろ）で切る。「……」では切らない。"""
    return [s for s in (m.group(0).strip() for m in _SENT.finditer(text)) if s]


def clauses(sent: str) -> list[str]:
    out, cur = [], ""
    for ch in sent:
        cur += ch
        if ch == "、":
            out.append(cur)
            cur = ""
    if cur:
        out.append(cur)
    return out


def paginate(text: str, font: ImageFont.FreeTypeFont, max_px: int, max_lines: int) -> list[list[str]]:
    """字幕を「1枚 max_lines 行まで」の束に分ける。

    全部が max_lines 行に収まれば1枚。収まらなければ文ごと、文が長ければ「、」ごとに束ねる。
    声は文の切れ目で息をつくので、字幕の切り替えもそこに置くと、目と耳がずれない。
    """
    whole = wrap(text, font, max_px)
    if len(whole) <= max_lines:
        return [whole]
    pages: list[list[str]] = []

    def flush(s: str):
        w = wrap(s, font, max_px)
        for k in range(0, len(w), max_lines):
            pages.append(w[k:k + max_lines])

    for sent in sentences(text):
        if len(wrap(sent, font, max_px)) <= max_lines:
            pages.append(wrap(sent, font, max_px))
            continue
        cur = ""
        for cl in clauses(sent):
            if cur and len(wrap(cur + cl, font, max_px)) > max_lines:
                flush(cur)
                cur = cl
            else:
                cur += cl
        if cur:
            flush(cur)
    return [pg for pg in pages if pg]


def reading_weight(s: str) -> float:
    """読む長さの目安。漢字は仮名の約1.7拍、数字は1桁2拍、記号は0。"""
    w = 0.0
    for ch in s:
        if "一" <= ch <= "鿿":
            w += 1.7
        elif ch.isdigit():
            w += 2.0
        elif re.match(r"[ぁ-んァ-ンーa-zA-Z]", ch):
            w += 1.0
    return max(w, 0.5)


# ---------------------------------------------------------------- 字の絵

def hex_rgba(h: str, alpha: float = 1.0) -> tuple:
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), round(alpha * 255))


_HL_SKIP = "、。，．,. 　"


def highlight_marks(lines: list[str], phrases: list[str]) -> list[list[bool]]:
    """字幕の各字が、強調する言葉（phrases）の一部かどうか。

    折り返しで行末の「、」「。」が落ちるので、句読点と空白を除いた並びで探す（行をまたいでも当たる）。
    """
    marks = [[False] * len(ln) for ln in lines]
    pos = [(i, j) for i, ln in enumerate(lines) for j, ch in enumerate(ln) if ch not in _HL_SKIP]
    flat = "".join(lines[i][j] for i, j in pos)
    for ph in phrases or []:
        key = "".join(ch for ch in ph if ch not in _HL_SKIP)
        if not key:
            continue
        k = flat.find(key)
        while k >= 0:
            for i, j in pos[k:k + len(key)]:
                marks[i][j] = True
            k = flat.find(key, k + len(key))
    return marks


def card(lines: list[str], st: dict, font: ImageFont.FreeTypeFont, hl: list[str] | None = None) -> Image.Image:
    """角丸の箱に、行ごとに中央揃えで字を置いた絵（RGBA、箱ぶんの大きさ）。箱の濃さが 0 なら字だけ。

    hl があれば、その言葉だけタイトルの箱と同じ黄色にし、少し大きくする（数字・値段を目に入れる）。
    大きくして max_width を越える行が出るなら、色だけ変える。
    """
    stroke = st.get("stroke", 0)
    marks = highlight_marks(lines, hl) if hl else [[False] * len(ln) for ln in lines]
    scale = st.get("highlight_scale", 1.0) if any(any(m) for m in marks) else 1.0
    path = getattr(font, "path", None)
    big = ImageFont.truetype(path, round(font.size * scale)) if scale != 1.0 and path else font

    def runs(ln, mk, f_big):
        out, k = [], 0
        while k < len(ln):
            j = k
            while j < len(ln) and mk[j] == mk[k]:
                j += 1
            out.append((ln[k:j], f_big if mk[k] else font, mk[k]))
            k = j
        return out

    def measure(f_big):
        rs = [runs(ln, mk, f_big) for ln, mk in zip(lines, marks)]
        return rs, [sum(f.getlength(t) for t, f, _ in r) for r in rs]

    rows, widths = measure(big)
    if big is not font and max(widths) > st["max_width"] - 2 * st["pad_x"] - 2 * stroke:
        big = font
        rows, widths = measure(big)
    asc = max(font.getmetrics()[0], big.getmetrics()[0])
    desc = max(font.getmetrics()[1], big.getmetrics()[1])
    line_h = asc + desc
    w = math.ceil(max(widths)) + 2 * st["pad_x"] + 2 * stroke
    h = len(lines) * line_h + (len(lines) - 1) * st["line_gap"] + 2 * st["pad_y"] + 2 * stroke
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if st.get("bg_alpha", 1.0) > 0:
        d.rounded_rectangle([0, 0, w - 1, h - 1], radius=st["radius"],
                            fill=hex_rgba(st["bg"], st.get("bg_alpha", 1.0)))
    y = st["pad_y"] + stroke
    hl_color = hex_rgba(st.get("highlight_color", st["color"]))
    for r, width in zip(rows, widths):
        x = (w - width) / 2
        for t, f, on in r:
            d.text((x, y + asc), t, font=f, anchor="ls", fill=hl_color if on else hex_rgba(st["color"]),
                   stroke_width=stroke, stroke_fill=hex_rgba(st.get("stroke_color", "#000000")))
            x += f.getlength(t)
        y += line_h + st["line_gap"]
    return img


_RUN = re.compile(r"[0-9０-９][0-9０-９,.]*|[^0-9０-９]+")


def telop_lines(text: str) -> list[list[str]]:
    """テロップの行の割り方の候補。空白は「ここで割ってよい」の印（1行に収まれば空白のまま）。"""
    parts = [p for p in re.split(r"[ 　]+", text.strip()) if p]
    cands = [[" ".join(parts)]] if parts else [[text]]
    if len(parts) >= 2:
        best = min(range(1, len(parts)),
                   key=lambda k: abs(len("".join(parts[:k])) - len("".join(parts[k:]))))
        cands.append([" ".join(parts[:best]), " ".join(parts[best:])])
    return cands


def telop_card(lines: list[str], st: dict, fpath: Path, size: float, visible: int | None = None) -> Image.Image:
    """テロップを字の形ぎりぎりに切った絵。visible があれば、頭から visible 字（空白を除く）だけ描く。

    途中まで描いた絵も、全部描いた絵と同じ枠で切る（順に出すとき、出た字が動かないように）。
    2行のときは1行ずつ字の形で切ってから line_gap で積む。書体の行の高さ（上下の余白込み。
    この書体は字の大きさの1.4倍）で積むと、置き場の高さを余白が食って字が2割小さくなる。
    """
    gap = round(st.get("line_gap", 0) * size / st["size"])
    left = visible if visible is not None else 10 ** 9
    parts = []
    for ln in lines:
        full = telop_canvas([ln], st, fpath, size)
        box = full.getchannel("A").getbbox() or (0, 0, full.width, full.height)
        img = full if visible is None else telop_canvas([ln], st, fpath, size, max(0, left))
        left -= sum(1 for ch in ln if ch.strip())
        parts.append(img.crop(box))
    w = max(p.width for p in parts)
    h = sum(p.height for p in parts) + gap * (len(parts) - 1)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    y = 0
    for p in parts:
        out.alpha_composite(p, ((w - p.width) // 2, y))
        y += p.height + gap
    return out


def telop_canvas(lines: list[str], st: dict, fpath: Path, size: float, visible: int | None = None) -> Image.Image:
    """テロップ（強調の字）。数字だけ digit_scale 倍に大きくする（「あと25分」の 25）。

    字の基準線（baseline）を揃えて、走り（数字／それ以外）ごとに書く。影は縁ごと下にずらして敷く。
    """
    stroke = max(2, round(st["stroke"] * size / st["size"]))
    f_main = ImageFont.truetype(str(fpath), round(size))
    f_dig = ImageFont.truetype(str(fpath), round(size * st.get("digit_scale", 1.0)))
    asc = max(f_dig.getmetrics()[0], f_main.getmetrics()[0])
    desc = max(f_dig.getmetrics()[1], f_main.getmetrics()[1])
    line_h = asc + desc
    gap = round(st.get("line_gap", 0) * size / st["size"])
    rows = []
    for ln in lines:
        runs = [(m.group(0), f_dig if m.group(0)[0].isdigit() else f_main) for m in _RUN.finditer(ln)]
        rows.append((runs, sum(f.getlength(t) for t, f in runs)))
    sh_dy = round(st.get("shadow_dy", 0) * size / st["size"])
    pad = stroke + st.get("pad", 0)
    w = math.ceil(max(r[1] for r in rows)) + 2 * pad
    h = len(rows) * line_h + (len(rows) - 1) * gap + 2 * pad + sh_dy

    def draw(img: Image.Image, dy: int, fill, stroke_fill):
        d = ImageDraw.Draw(img)
        y = pad
        left = visible if visible is not None else 10 ** 9  # まだ描いてよい字の数（空白は数えない）
        for runs, width in rows:
            x = (w - width) / 2
            for t, f in runs:
                shown = ""
                for ch in t:
                    if ch.strip() and left <= 0:
                        break
                    shown += ch
                    left -= 1 if ch.strip() else 0
                if shown:
                    d.text((x, y + asc + dy), shown, font=f, anchor="ls", fill=fill,
                           stroke_width=stroke, stroke_fill=stroke_fill)
                x += f.getlength(t)
            y += line_h + gap

    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    if sh_dy:
        # 影は別の絵に不透明で描いてから薄める（同じ絵に半透明で描くと、字の重なりで濃くなる）
        shadow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        draw(shadow, sh_dy, (0, 0, 0, 255), (0, 0, 0, 255))
        a = np.asarray(shadow)[:, :, 3].astype(np.float32) * st.get("shadow_alpha", 0.5)
        arr = np.zeros((h, w, 4), dtype=np.uint8)
        arr[:, :, :3] = hex_rgba(st.get("shadow_color", "#000000"))[:3]
        arr[:, :, 3] = np.round(a).astype(np.uint8)
        img = Image.fromarray(arr, "RGBA")
    draw(img, 0, hex_rgba(st["color"]), hex_rgba(st.get("stroke_color", "#000000")))
    return img  # 呼ぶ側（telop_card）が字の形ぎりぎりに切る


# ---------------------------------------------------------------- 時間割

def source_crop(src: dict, meta: dict, style: dict) -> list[int]:
    """元素材のうち、使ってよい範囲 [x, y, w, h]。

    配信ソフトの透かし（PRISM Live）は右下の帯に焼き込まれている。その帯より上だけを使い、
    縦横比が足りないぶんは cover で左右を切る。ぼかしや描き埋めと違って、跡が1画素も残らない
    （捨てるのは下の 7%。どのみち画面の下は説明文とチャンネル名で隠れる帯）。
    """
    w, h = meta["w"], meta["h"]
    if src.get("crop"):
        return [int(v) for v in src["crop"]]
    wm = src.get("watermark")
    if not wm:
        return [0, 0, w, h]
    spec = style.get("watermarks", {}).get(wm)
    if not spec:
        sys.exit(f"style.json に透かしの定義が無い: {wm}")
    if spec.get("mode", "crop") != "crop":
        return [0, 0, w, h]
    sy = h / spec["size"][1]
    top = math.floor((spec["rect"][1] - spec.get("margin", 0)) * sy)
    return [0, 0, w, top]


def delogo_rect(src: dict, meta: dict, style: dict) -> list[int] | None:
    """切り落とせない素材（横長を blur で入れるなど）向け: 透かしの箱を周りから描き埋める。"""
    wm = src.get("watermark")
    spec = style.get("watermarks", {}).get(wm) if wm else None
    if not spec or spec.get("mode", "crop") != "inpaint":
        return None
    sx, sy = meta["w"] / spec["size"][0], meta["h"] / spec["size"][1]
    x, y, w, h = spec["rect"]
    m = spec.get("margin", 0)
    return [math.floor((x - m) * sx), math.floor((y - m) * sy),
            math.ceil((w + 2 * m) * sx), math.ceil((h + 2 * m) * sy)]


def plan(edit: dict, style: dict, base: Path, work: Path) -> dict:
    fps = style["canvas"]["fps"]
    spf = SR // fps  # 1コマあたりのサンプル数（48000/30 = 1600）
    W, H = style["canvas"]["width"], style["canvas"]["height"]
    cuts, t = [], 0
    metas: dict[str, dict] = {}
    for c in edit["cuts"]:
        src_def = edit["sources"][c["src"]]
        src = resolve(base, src_def["path"])
        n = c["out"] - c["in"]
        if n <= 0:
            sys.exit(f"カットの長さが 0 以下: {c}")
        if str(src) not in metas:
            metas[str(src)] = probe(src)
        meta = metas[str(src)]
        if abs(meta["fps"] - fps) > 1e-6:
            sys.exit(f"元素材のフレームレートが {meta['fps']}（{fps} 以外はまだ扱わない）: {src}")
        cut = {**c, "path": str(src), "w": meta["w"], "h": meta["h"], "color_space": meta["color_space"],
               "at": t, "frames": n, "fit": c.get("fit", "cover"), "crop": source_crop(src_def, meta, style)}
        dl = delogo_rect(src_def, meta, style)
        if dl:
            cut["delogo"] = dl
        cuts.append(cut)
        t += n
    total = t
    cut_starts = sorted({c["at"] for c in cuts if c["at"] > 0})

    narr = edit.get("narration", {})
    cap_st = style["caption"]
    cap_font = ImageFont.truetype(str(font_path(style, cap_st["font"])), cap_st["size"])
    inner = cap_st["max_width"] - 2 * cap_st["pad_x"] - 2 * cap_st.get("stroke", 0)
    lines, captions = [], []
    starts = [ln["at"] for ln in narr.get("lines", [])] + [total]
    for i, ln in enumerate(narr.get("lines", [])):
        wav = narration_wav(ln, narr, base, work)
        x = decode_audio(wav, 1)[:, 0]
        frames = math.ceil(len(x) / spf)
        lines.append({"at": ln["at"], "frames": frames, "file": str(wav), "text": ln["text"]})
        if ln["at"] + frames > total:
            print(f"注意: {i}行目のナレーションが動画の終わりを越える（{ln['at'] + frames} > {total}）",
                  file=sys.stderr)
        text = ln.get("caption", ln["text"])
        if text == "":
            continue
        pages = paginate(text, cap_font, inner, cap_st["max_lines"])
        end = min(ln["at"] + frames + cap_st.get("hold_frames", 0), starts[i + 1], total)
        # 次の行がすぐ（bridge_frames 以内）なら、次の行の頭まで出しておく。行の頭はカットの切れ目なので、
        # 字幕が消えるのと画が変わるのが同じコマになる（7コマだけ字幕が消えてまた出る、のちらつきも無くなる）
        nxt = starts[i + 1]
        if ln["at"] + frames <= nxt <= min(total, ln["at"] + frames + cap_st.get("bridge_frames", 0)):
            end = nxt
        bounds = [ln["at"]]
        if len(pages) > 1:
            # 字数の比で見当をつけ、いちばん近い「声の間のあと、次に声が出るコマ」に合わせる
            weights = [reading_weight("".join(pg)) for pg in pages]
            onsets = [ln["at"] + j for _, j in speech_onsets(x, spf)]
            acc = 0.0
            for k in range(len(pages) - 1):
                acc += weights[k]
                guess = ln["at"] + round(frames * acc / sum(weights))
                near = [o for o in onsets if abs(o - guess) <= 15 and o > bounds[-1] + 6]
                b = min(near, key=lambda o: abs(o - guess)) if near else guess
                # すぐ近くにカットの切れ目があれば、そこに揃える（画と字が同時に変わるほうが自然。
                # それに、切り替えの1コマ後にカットがあると、字幕の出入りの検査が絵の変化と区別できない）
                cs = [c for c in cut_starts if abs(c - b) <= 3]
                if cs:
                    b = min(cs, key=lambda c: abs(c - b))
                bounds.append(max(bounds[-1] + 6, min(b, end - 6)))
        bounds.append(end)
        for k, pg in enumerate(pages):
            # line: 何行目のナレーションの字幕か（人が直す画面で、直した字幕を指示書のどこに戻すか）
            cap = {"from": bounds[k], "to": bounds[k + 1], "lines": pg, "line": i}
            if ln.get("highlight"):
                cap["hl"] = list(ln["highlight"])
            captions.append(cap)

    title = edit.get("title")
    titles = []
    if title:
        ti_st = style["title"]
        ti_font = ImageFont.truetype(str(font_path(style, ti_st["font"])), ti_st["size"])
        rows = wrap(title["text"], ti_font, ti_st["max_width"] - 2 * ti_st["pad_x"])
        if len(rows) > ti_st["max_lines"]:
            print(f"注意: タイトルが {len(rows)} 行（上限 {ti_st['max_lines']}）", file=sys.stderr)
        titles.append({"from": title.get("from", 0), "to": title.get("to") or total, "lines": rows})

    telops = []
    prev_end = -1
    for tp in sorted(edit.get("telops", []), key=lambda z: z["from"]):
        parts = tp.get("parts")
        text = " ".join(pt["text"] for pt in parts) if parts else tp.get("text")
        if not text:
            continue
        a, b = int(tp["from"]), min(int(tp["to"]), total)
        if a < prev_end:
            sys.exit(f"テロップが重なっている（画面に出すのは1つまで）: {tp}")
        item = {"from": a, "to": b, "text": text}
        if parts:
            # 順に出す: 1つ目はテロップの頭で出し、2つ目からは at のコマで足していく
            item["parts"] = [{"text": pt["text"], "at": a if k == 0 else min(max(int(pt["at"]), a), b - 1)}
                             for k, pt in enumerate(parts)]
        telops.append(item)
        prev_end = b

    return {"fps": fps, "size": [W, H], "frames": total, "cuts": cuts, "narration": lines,
            "captions": captions, "titles": titles, "telops": telops, "bgm": edit.get("bgm")}


# ---------------------------------------------------------------- 字の置き場

def layout(p: dict, style: dict, work: Path) -> list[dict]:
    """タイトル・テロップ・字幕の絵を作り、置き場を決める。

    置き場（README の「字の置き場」）:
      上   タイトル（黄色の箱に黒い字）  y=380 から
      間   テロップ（黄色い字に黒の縁）  タイトルの下端と、字幕2行ぶんの上端の、ちょうど間
      中央 字幕（白い字に黒の縁）       中心 y=1000
    3つは縦に重ならない。テロップは同時に1つまで。
    """
    W, H = p["size"]
    safe = style["safe"]
    out = []

    ti_st = style["title"]
    ti_font = ImageFont.truetype(str(font_path(style, ti_st["font"])), ti_st["size"])
    title_bottom = safe["top"]
    for i, it in enumerate(p["titles"]):
        img = card(it["lines"], ti_st, ti_font)
        path = work / f"title_{i:02d}.png"
        img.save(path)
        it.update({"png": str(path), "x": (W - img.width) // 2, "y": ti_st["top"], "w": img.width, "h": img.height})
        title_bottom = max(title_bottom, ti_st["top"] + img.height)
        out.append({"kind": "title", "item": it, "imgs": [img]})

    cap_st = style["caption"]
    cap_font = ImageFont.truetype(str(font_path(style, cap_st["font"])), cap_st["size"])
    # 字幕2行ぶんの高さ。テロップの置き場の下端は、字幕が何行でも同じにする（行数で動くと目が迷う）
    two = card(["国国"] * cap_st["max_lines"], cap_st, cap_font)
    cap_top = cap_st["center_y"] - two.height // 2
    for i, it in enumerate(p["captions"]):
        img = card(it["lines"], cap_st, cap_font, hl=it.get("hl"))
        path = work / f"caption_{i:02d}.png"
        img.save(path)
        it.update({"png": str(path), "x": (W - img.width) // 2, "y": cap_st["center_y"] - img.height // 2,
                   "w": img.width, "h": img.height})
        out.append({"kind": "caption", "item": it, "imgs": [img]})

    tp_st = style["telop"]
    fpath = font_path(style, tp_st["font"])
    zone = [title_bottom + tp_st["gap"], cap_top - tp_st["gap"]]
    mid = (zone[0] + zone[1]) / 2
    pop = tp_st.get("pop", [1.0])
    over = max(pop)
    p["layout"] = {"title_bottom": title_bottom, "telop_zone": zone, "telop_center_y": round(mid),
                   "caption_top_2lines": cap_top, "caption_center_y": cap_st["center_y"]}

    def place(img: Image.Image) -> float | None:
        """置き場の真ん中に置けるか。右のボタン列（y>=840 で x>888）に掛かる幅なら、840 より上に寄せる。"""
        half_narrow = safe["right_column_x"] - W / 2
        half_wide = safe["right"] - W / 2
        if img.width / 2 <= half_narrow:
            lo, hi = zone[0], zone[1]
        elif img.width / 2 <= half_wide:
            lo, hi = zone[0], min(zone[1], safe["right_column_from_y"])
        else:
            return None
        if img.height > hi - lo:
            return None
        return min(max(mid, lo + img.height / 2), hi - img.height / 2)

    for i, it in enumerate(p["telops"]):
        best = None
        for cand in telop_lines(it["text"]):
            size = tp_st["size"]
            # 「ポン」でいちばん大きくなったときでも、置き場と安全領域に収まる大きさを探す
            while size > tp_st["min_size"] and place(telop_card(cand, tp_st, fpath, size * over)) is None:
                size -= 2
            # 1行で min_size_1line 以上に収まるなら1行。収まらなければ、大きく出せるほう
            if best is None or size > best[0]:
                best = (size, cand)
            if len(cand) == 1 and size >= tp_st["min_size_1line"]:
                break
        size, cand = best
        # 順に出すときは、k 個目までの字数（空白を除く）だけ描いた絵を並べる。1つ目は「ポン」で出す
        counts = [None]
        if it.get("parts"):
            acc = 0
            counts = []
            for pt in it["parts"]:
                acc += len(pt["text"].replace(" ", "").replace("　", ""))
                counts.append(acc)
        imgs = [telop_card(cand, tp_st, fpath, size * s, counts[0]) for s in pop]
        imgs += [telop_card(cand, tp_st, fpath, size, n) for n in counts[1:]]
        cy = round(place(telop_card(cand, tp_st, fpath, size * over)) or mid)
        path = work / f"telop_{i:02d}.png"
        full = telop_card(cand, tp_st, fpath, size)
        full.save(path)
        it.update({"png": str(path), "lines": cand, "size": size, "w": full.width, "h": full.height,
                   "x": (W - full.width) // 2, "y": cy - full.height // 2, "cy": cy, "pop": pop})
        out.append({"kind": "telop", "item": it, "imgs": imgs, "cy": cy})
    return out


def pick(item: dict, f: int, n_pop: int) -> int:
    """コマ f で重ねる絵の番号。頭の数コマは「ポン」の絵、順に出す字があればその段の絵。"""
    shown = sum(1 for pt in item.get("parts", []) if pt["at"] <= f)
    if shown >= 2:
        return n_pop - 1 + (shown - 1)
    if item["from"] == 0:
        # 動画の頭のコマは、出来上がった大きさで始める（0コマ目が小さな字だと、止めて見る人に半端に見える）
        return n_pop - 1
    return min(f - item["from"], n_pop - 1)


# ---------------------------------------------------------------- 音

def speech_rms(x: np.ndarray) -> float:
    """話している間の RMS。50ms ごとの RMS のうち、いちばん大きい窓から 20dB 以内の窓だけで測る
    （文の中の息継ぎや、頭と尻に残った無音で、短い行ほど小さく出るのを避ける）。"""
    w = SR // 20
    k = len(x) // w
    if k == 0:
        return float(np.sqrt(np.mean(np.square(x.astype(np.float64))))) if len(x) else 0.0
    fr = x[: k * w].reshape(k, w).astype(np.float64)
    r = np.sqrt(np.mean(fr ** 2, axis=1))
    keep = r >= r.max() * db(-20)
    return float(np.sqrt(np.mean(fr[keep] ** 2)))


def split_band(x: np.ndarray, lo_hz: float, hi_hz: float) -> tuple[np.ndarray, np.ndarray]:
    """音を低い側と高い側に分ける（2つを足せば元に戻る）。lo_hz〜hi_hz をなめらかに受け渡す。

    1本まるごとの FFT で切る（scipy を足さずに済み、同じ入力なら同じ出力）。両端の回り込みは、
    BGM の頭と尻のフェードの中に収まる。
    """
    X = np.fft.rfft(x.astype(np.float64), axis=0)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    u = np.clip((f - lo_hz) / (hi_hz - lo_hz), 0, 1)
    w_lo = 0.5 * (1 + np.cos(np.pi * u))
    lo = np.fft.irfft(X * w_lo[:, None], n=len(x), axis=0)
    return lo.astype(np.float32), (x.astype(np.float64) - lo).astype(np.float32)


def audio_stems(p: dict, style: dict, base: Path, work: Path) -> tuple[Path, Path, Path]:
    """ナレーションの束・ダッキング済みの BGM・元の音（使うカットだけ）を、サンプル単位で作る。

    ダッキングはコンプレッサーに任せず、時間割から音量の折れ線を引く。
    いつ・どれだけ下がるかが指示書から一意に決まり、測って確かめられるから。
    """
    au = style["audio"]
    fps = p["fps"]
    spf = SR // fps
    n = p["frames"] * spf
    t = np.arange(n) / SR
    narr = np.zeros((n, 2), dtype=np.float32)
    # 声の大きさは**1行ずつ**「話している間の RMS」で揃える。Fish Audio の声は1文ずつ作るので、
    # 行ごとに -28〜-21 LUFS とばらつき、全体で1つの倍率を掛けると行の変わり目で音量が跳ねた。
    # ファイルの音量ではなく目標値から決めるので、声の版や話者が変わっても仕上がりは動かない。
    clips = [decode_audio(Path(ln["file"]), 1)[:, 0] for ln in p["narration"]]
    for i, (ln, x) in enumerate(zip(p["narration"], clips)):
        g_line = db(au["narration_rms_dbfs"]) / max(speech_rms(x), 1e-9)
        ln["gain_db"] = round(20 * math.log10(g_line), 2)
        x = x * g_line
        # 音量を揃えた1行ぶんも残す（Remotion・CapCut の下書きなど、ほかの書き出し先が使う）
        ln["norm_file"] = str(write_wav(x[:, None], work / f"narr_norm_{i:02d}.wav"))
        s = ln["at"] * spf
        e = min(n, s + len(x))
        narr[s:e, 0] += x[: e - s]
        narr[s:e, 1] += x[: e - s]

    # ナレーションの間だけ下げる折れ線（BGM と元の音の両方に掛ける）。
    # s-a で下がり始めて s で底、e で上がり始めて e+r で戻る
    duck = np.ones(n, dtype=np.float64)
    low = db(au["duck_db"])
    # BGM の高い側（子音の帯域）だけ、ナレーションの間さらに下げる。明るい曲（弦・シンバル・高い旋律）は
    # 全体を 12dB 下げても 2〜5kHz で声の子音とぶつかり、そこだけ差が 7dB まで縮んだ。
    # 全体をもっと下げると曲の土台（低音と拍）まで消えるので、高い側だけを深くする
    duck_hi = np.ones(n, dtype=np.float64)
    low_hi = db(au["duck_db"] + au.get("duck_hi_db", 0))
    for ln in p["narration"]:
        s = ln["at"] / fps
        e = (ln["at"] + ln["frames"]) / fps
        a, r = au["attack_s"], au["release_s"]
        k = np.clip(np.maximum((s - t) / a, (t - e) / r), 0, 1)
        duck = np.minimum(duck, low + (1 - low) * k)
        duck_hi = np.minimum(duck_hi, low_hi + (1 - low_hi) * k)

    bgm = np.zeros((n, 2), dtype=np.float32)
    if p.get("bgm"):
        src = decode_audio(resolve(base, p["bgm"]["path"]), 2)
        src = src[int(p["bgm"].get("start_s", 0) * SR):]
        reps = math.ceil(n / len(src))
        bgm = np.tile(src, (reps, 1))[:n] if reps > 1 else src[:n].copy()
        if len(bgm) < n:
            bgm = np.vstack([bgm, np.zeros((n - len(bgm), 2), dtype=np.float32)])
        rms = max(float(np.sqrt(np.mean(bgm.astype(np.float64) ** 2))), 1e-9)
        base_g = db(au["bgm_rms_dbfs"] + p["bgm"].get("db", 0)) / rms
        p["bgm"]["norm_file"] = str(write_wav(bgm * base_g, work / "bgm_norm.wav"))
        p["bgm"]["duck_db"] = au["duck_db"]
        p["bgm"]["attack_s"] = au["attack_s"]
        p["bgm"]["release_s"] = au["release_s"]
        p["bgm"]["fade_out_s"] = au.get("bgm_fade_out_s", 0)
        p["bgm"]["fade_in_s"] = au.get("bgm_fade_in_s", 0)
        fades = np.ones(n, dtype=np.float64)
        fo = au.get("bgm_fade_out_s", 0)
        if fo:
            fades = fades * np.clip((n / SR - t) / fo, 0, 1)
        fi = au.get("bgm_fade_in_s", 0)
        if fi:
            fades = fades * np.clip(t / fi, 0, 1)
        g = base_g * duck * fades
        if au.get("duck_hi_db"):
            p["bgm"]["duck_hi_db"] = au["duck_hi_db"]
            p["bgm"]["duck_hi_hz"] = au["duck_hi_hz"]
            lo_part, hi_part = split_band(bgm, *au["duck_hi_hz"])
            g_hi = base_g * duck_hi * fades
            bgm = (lo_part * g[:, None] + hi_part * g_hi[:, None]).astype(np.float32)
        else:
            bgm = (bgm * g[:, None]).astype(np.float32)

    # 元の音は既定で消す。カットに audio_db があるときだけ、その dB で入れる
    # （本人の短い一言を残すとき）。ナレーションと重なったら BGM と同じだけ下げる。
    srcs = np.zeros((n, 2), dtype=np.float32)
    fade = int(SR * 0.012)
    for c in p["cuts"]:
        if c.get("audio_db") is None:
            continue
        ss = max(0, math.floor(c["in"] / fps) - 1)
        rel_in, rel_out = c["in"] - ss * fps, c["out"] - ss * fps
        x = decode_audio(Path(c["path"]), 2, ss=ss)[rel_in * spf:rel_out * spf]
        m = c["frames"] * spf
        if len(x) < m:
            x = np.vstack([x, np.zeros((m - len(x), 2), dtype=np.float32)])
        env = np.ones(m, dtype=np.float32)
        if m > 2 * fade:
            env[:fade] = np.linspace(0, 1, fade, dtype=np.float32)
            env[-fade:] = np.linspace(1, 0, fade, dtype=np.float32)
        s = c["at"] * spf
        srcs[s:s + m] += x[:m] * env[:, None] * db(c["audio_db"])
    srcs = (srcs * duck[:, None]).astype(np.float32)

    narr_p, bgm_p, src_p = work / "stem_narration.f32", work / "stem_bgm.f32", work / "stem_source.f32"
    narr.astype("<f4").tofile(narr_p)
    bgm.astype("<f4").tofile(bgm_p)
    srcs.astype("<f4").tofile(src_p)
    return narr_p, bgm_p, src_p


# ---------------------------------------------------------------- 映像

def cover_affine(c: dict, W: int, H: int) -> tuple[float, float, float, float]:
    """使ってよい範囲（crop）を 1080x1920 いっぱいに拡大して切る写像（X = kx*x + tx）。

    拡大後の大きさを偶数に丸め、focus で切る位置を決める。verify.py の読み戻しと同じ式。
    """
    cx, cy, cw, ch = c["crop"]
    s = max(W / cw, H / ch)
    sw, sh_ = 2 * math.ceil(cw * s / 2 - 1e-9), 2 * math.ceil(ch * s / 2 - 1e-9)
    ox = round((sw - W) * c.get("focus_x", 0.5))
    oy = round((sh_ - H) * c.get("focus_y", 0.5))
    kx, ky = sw / cw, sh_ / ch
    # 画素の中心どうしを合わせる（(x+0.5)*k-0.5）。ffmpeg の scale と同じ取り方
    return kx, ky, (0.5 - cx) * kx - 0.5 - ox, (0.5 - cy) * ky - 0.5 - oy


def zoom_at(c: dict, j: int) -> float:
    z = c.get("zoom")
    if not z:
        return 1.0
    u = j / max(1, c["frames"] - 1)
    if z.get("ease") == "out":
        u = 1 - (1 - u) ** 2
    return z.get("from", 1.0) + (z.get("to", 1.0) - z.get("from", 1.0)) * u


def cover_map(c: dict, j: int, W: int, H: int) -> tuple[float, float, float, float]:
    """cover のカットの j コマ目の写像（X = ax*x + bx, Y = ay*y + by。x, y は元素材の画素）。

    zoom に sx / sy（画面の 0〜1）があれば、寄る先（x, y）をその画面の位置に置く。配信の画は
    見せたい物（バス・看板）が上の 3〜4割に写っていることが多く、その場で寄るとタイトルの箱の裏か、
    画面の上の UI の裏に入る。置き場を下げると元素材の外が見えるときは、見えない所まで戻す。
    """
    z = zoom_at(c, j)
    kx, ky, tx, ty = cover_affine(c, W, H)
    zz = c.get("zoom") or {}
    if "sx" not in zz and "sy" not in zz:
        px, py = zoom_point(c, kx, ky, tx, ty, W, H)
        return z * kx, z * tx + px * (1 - z), z * ky, z * ty + py * (1 - z)
    ax, ay = z * kx, z * ky
    xp, yp = zz.get("x", 0.5) * c["w"], zz.get("y", 0.5) * c["h"]
    bx = zz.get("sx", 0.5) * W - ax * xp
    by = zz.get("sy", 0.5) * H - ay * yp
    cx, cy, cw, ch = c["crop"]
    # 元素材の使ってよい範囲（透かしの帯を切ったあと）の外を見せない
    bx = min(max(bx, W - ax * (cx + cw)), -ax * cx)
    by = min(max(by, H - ay * (cy + ch)), -ay * cy)
    return ax, bx, ay, by


def zoom_point(c: dict, kx, ky, tx, ty, W, H) -> tuple[float, float]:
    """寄る先（元素材の 0〜1 の位置）が、画面のどこに来るか。そこを動かさずに拡大する。

    画面の内側の1点を中心に 1 倍以上へ拡大するので、元素材の外（黒い縁）は決して見えない。
    """
    z = c.get("zoom") or {}
    px = z.get("x", 0.5) * c["w"] * kx + tx
    py = z.get("y", 0.5) * c["h"] * ky + ty
    return min(max(px, 0), W), min(max(py, 0), H)


def interp_rect(reg: dict, f: int) -> list[float] | None:
    """ぼかしの箱（元素材の画素 [x, y, w, h]）。keys があれば、元素材のコマ番号 f で直線に補う。"""
    if f < reg.get("from", -10 ** 9) or f >= reg.get("to", 10 ** 9):
        return None
    if "rect" in reg:
        return reg["rect"]
    keys = reg["keys"]
    if f <= keys[0]["f"]:
        return keys[0]["rect"]
    for a, b in zip(keys, keys[1:]):
        if f <= b["f"]:
            u = (f - a["f"]) / max(1, b["f"] - a["f"])
            return [ra + (rb - ra) * u for ra, rb in zip(a["rect"], b["rect"])]
    return keys[-1]["rect"]


def blur_box(cv2, img: np.ndarray, rect, cells: int):
    """箱の中を、顔と分からないところまで潰す（モザイク＋ぼかし）。縁は外側にぼかして馴染ませる。

    ガウスのぼかしだけだと、強くしても目鼻の位置と肌の色が残って、知っている人には分かる。
    箱の短い辺に cells 個のモザイクにしてから、そのマス目が見えなくなるまでぼかす。
    """
    H, W = img.shape[:2]
    x, y, w, h = [float(v) for v in rect]
    if w < 2 or h < 2:
        return
    feather = max(4, round(0.12 * min(w, h)))
    X0, Y0 = max(0, math.floor(x) - feather), max(0, math.floor(y) - feather)
    X1, Y1 = min(W, math.ceil(x + w) + feather), min(H, math.ceil(y + h) + feather)
    if X1 - X0 < 2 or Y1 - Y0 < 2:
        return
    roi = img[Y0:Y1, X0:X1]
    cell = max(2.0, min(w, h) / cells)
    sw, sh_ = max(1, round((X1 - X0) / cell)), max(1, round((Y1 - Y0) / cell))
    small = cv2.resize(roi, (sw, sh_), interpolation=cv2.INTER_AREA)
    mos = cv2.resize(small, (X1 - X0, Y1 - Y0), interpolation=cv2.INTER_LINEAR)
    mos = cv2.GaussianBlur(mos, (0, 0), sigmaX=cell * 0.9)
    # 角を丸めた箱の形（角ばった四角は「隠しました」と目立つ）
    mask = np.zeros((Y1 - Y0, X1 - X0), dtype=np.float32)
    r = 0.3 * min(w, h)
    ix0, iy0, ix1, iy1 = x - X0, y - Y0, x + w - X0, y + h - Y0
    cv2.rectangle(mask, (round(ix0 + r), round(iy0)), (round(ix1 - r), round(iy1)), 1.0, -1)
    cv2.rectangle(mask, (round(ix0), round(iy0 + r)), (round(ix1), round(iy1 - r)), 1.0, -1)
    for ccx, ccy in ((ix0 + r, iy0 + r), (ix1 - r, iy0 + r), (ix0 + r, iy1 - r), (ix1 - r, iy1 - r)):
        cv2.circle(mask, (round(ccx), round(ccy)), round(r), 1.0, -1)
    soft = cv2.GaussianBlur(mask, (0, 0), sigmaX=feather / 2)
    # 箱の内側は必ず潰しきる（縁のぼかしで内側が薄まらないように、外側にだけ広げる）
    m = np.maximum(mask, soft)[:, :, None]
    roi[:] = (roi.astype(np.float32) * (1 - m) + mos.astype(np.float32) * m + 0.5).astype(np.uint8)


class Overlay:
    """字の絵を、コマに重ねるための形（premultiplied の整数）にしておく。整数で混ぜるので毎回同じ値になる。"""

    def __init__(self, img: Image.Image, x: int, y: int):
        a = np.asarray(img, dtype=np.uint16)
        self.alpha = a[:, :, 3:4]
        self.pre = a[:, :, :3] * self.alpha
        self.inv = 255 - self.alpha
        self.x, self.y = x, y
        self.h, self.w = a.shape[:2]

    def blend(self, frame: np.ndarray):
        H, W = frame.shape[:2]
        x0, y0 = max(0, self.x), max(0, self.y)
        x1, y1 = min(W, self.x + self.w), min(H, self.y + self.h)
        if x1 <= x0 or y1 <= y0:
            return
        sx, sy = x0 - self.x, y0 - self.y
        roi = frame[y0:y1, x0:x1]
        pre = self.pre[sy:sy + y1 - y0, sx:sx + x1 - x0]
        inv = self.inv[sy:sy + y1 - y0, sx:sx + x1 - x0]
        roi[:] = ((roi.astype(np.uint16) * inv + pre + 127) // 255).astype(np.uint8)


def color_matrix(c: dict) -> str:
    """復号の色の変換式。元素材の印に従い、印が無い HD 以上は bt709（YouTube の 720p はこれ）。"""
    cs = c.get("color_space") or "unknown"
    if cs == "bt709":
        return "bt709"
    if cs in ("bt470bg", "smpte170m"):
        return "bt601"
    return "bt709" if min(c["w"], c["h"]) >= 720 else "bt601"


def decode_cut(c: dict, fps: int):
    """カット1本ぶんのコマを、元の大きさの RGB で1枚ずつ返す。"""
    # 入力側で手前の整数秒まで飛ばす（長い配信でも頭から読まない）。
    # 飛ばした先からの相対で、半コマずらした時刻で切る（丸めで隣のコマを拾わない）。
    ss = max(0, math.floor(c["in"] / fps) - 1)
    rel_in, rel_out = c["in"] - ss * fps, c["out"] - ss * fps
    vf = (f"trim=start={(rel_in - 0.5) / fps:.6f}:end={(rel_out - 0.5) / fps:.6f},setpts=PTS-STARTPTS,"
          f"scale=in_color_matrix={color_matrix(c)}:in_range=tv:flags=bicubic+accurate_rnd+full_chroma_int,"
          f"format=rgb24")
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-ss", str(ss), "-i", c["path"],
           "-map", "0:v:0", "-vf", vf, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    size = c["w"] * c["h"] * 3
    try:
        for j in range(c["frames"]):
            buf = proc.stdout.read(size)
            if len(buf) < size:
                raise RuntimeError(f"元素材のコマが足りない: {c['path']} の {c['in'] + j} コマ目"
                                   f"（カット {c['in']}–{c['out']}）")
            yield np.frombuffer(buf, dtype=np.uint8).reshape(c["h"], c["w"], 3).copy()
    finally:
        proc.stdout.close()
        proc.kill()
        proc.wait()


def prefetch(gen, depth: int = 6):
    """生成器を別の糸で先に回す（復号・加工・符号化を重ねて走らせる）。順番は変わらない。"""
    q: queue.Queue = queue.Queue(depth)
    end = object()

    def run():
        try:
            for x in gen:
                q.put(x)
            q.put(end)
        except BaseException as e:  # noqa: BLE001 — 糸の中の失敗は、呼んだ側で投げ直す
            q.put(e)

    th = threading.Thread(target=run, daemon=True)
    th.start()
    while True:
        x = q.get()
        if x is end:
            break
        if isinstance(x, BaseException):
            raise x
        yield x
    th.join()


def inset_of(cv2, src: np.ndarray, full: np.ndarray, ins: dict, f_src: int | None = None) -> np.ndarray:
    """元素材の一部（rect）を、暗くした画面の上に、札にして大きく見せる。

    見せたい所が画面の端（上の UI に隠れる帯）にしか写っていないときに使う。北マケドニアの回の
    メニューは「Doner … 280 Lekë」の行がどのコマでも上の端にあり、寄っても切り方を変えても
    安全領域に入らなかった（寄る中心を動かすと、元素材の外が見えてしまう）。

    keys（元素材のコマ f と rect）があれば直線で補い、小数の画素で切る（手ぶれを追う・ゆっくり寄る）。
    札の高さは最初の rect の縦横比で決まる（rect の縦横比は keys で揃えておく）。
    bg_blur 0 なら背景はぼかさず暗くするだけ（元の画面のままに見せたいとき）。
    """
    H, W = full.shape[:2]
    blur = ins.get("bg_blur", 4)
    if blur:
        small = cv2.resize(full, (W // 8, H // 8), interpolation=cv2.INTER_AREA)
        small = cv2.GaussianBlur(small, (0, 0), sigmaX=blur)
        bg = cv2.resize(small, (W, H), interpolation=cv2.INTER_LINEAR)
    else:
        bg = full
    bg = (bg.astype(np.uint16) * ins.get("dim", 150) // 255).astype(np.uint8)
    first = ins["keys"][0]["rect"] if ins.get("keys") else ins["rect"]
    x, y, w, h = [float(v) for v in (interp_rect(ins, f_src) if f_src is not None else first)]
    ow = int(ins.get("w", 840))
    oh = round(first[3] * ow / first[2])
    s = ow / w
    M = np.array([[s, 0, -x * s], [0, s, -y * s]], dtype=np.float64)
    fg = cv2.warpAffine(src, M, (ow, oh), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    b = int(ins.get("border", 6))
    r = int(ins.get("radius", 28))
    X0, Y0 = (W - ow) // 2, int(ins.get("cy", 765)) - oh // 2

    def rounded(ww, hh, rr):
        m = np.zeros((hh, ww), dtype=np.uint8)
        cv2.rectangle(m, (rr, 0), (ww - 1 - rr, hh - 1), 255, -1)
        cv2.rectangle(m, (0, rr), (ww - 1, hh - 1 - rr), 255, -1)
        for cx_, cy_ in ((rr, rr), (ww - 1 - rr, rr), (rr, hh - 1 - rr), (ww - 1 - rr, hh - 1 - rr)):
            cv2.circle(m, (cx_, cy_), rr, 255, -1, lineType=cv2.LINE_AA)
        return m.astype(np.float32)[:, :, None] / 255

    if X0 - b < 0 or Y0 - b < 0 or X0 + ow + b > W or Y0 + oh + b + 40 > H:
        raise ValueError(f"inset が画面からはみ出す: {ins}")
    # 影 → 白い縁 → 中身 の順に重ねる
    frame_m = rounded(ow + 2 * b, oh + 2 * b, r + b)
    sh = np.zeros((H, W), dtype=np.float32)
    sh[Y0 - b + 10:Y0 + oh + b + 10, X0 - b:X0 + ow + b] = frame_m[:, :, 0]
    sh = cv2.GaussianBlur(sh, (0, 0), sigmaX=14)[:, :, None] * 0.55
    out = bg.astype(np.float32) * (1 - sh)
    region = out[Y0 - b:Y0 + oh + b, X0 - b:X0 + ow + b]
    region[:] = region * (1 - frame_m) + 255 * frame_m
    in_m = rounded(ow, oh, r)
    reg2 = out[Y0:Y0 + oh, X0:X0 + ow]
    reg2[:] = reg2 * (1 - in_m) + fg.astype(np.float32) * in_m
    return (out + 0.5).astype(np.uint8)


_GAMMA: dict[float, np.ndarray] = {}


def gamma_lut(g: float) -> np.ndarray:
    if g not in _GAMMA:
        _GAMMA[g] = np.round(np.power(np.arange(256) / 255.0, float(g)) * 255).astype(np.uint8)
    return _GAMMA[g]


def frame_of(cv2, img: np.ndarray, c: dict, j: int, W: int, H: int) -> np.ndarray:
    """元のコマ1枚 → 透かしを外し・顔をぼかし・1080x1920 に収めた1枚。"""
    if c.get("delogo"):
        x, y, w, h = c["delogo"]
        pad = 8
        X0, Y0 = max(0, x - pad), max(0, y - pad)
        X1, Y1 = min(c["w"], x + w + pad), min(c["h"], y + h + pad)
        roi = np.ascontiguousarray(img[Y0:Y1, X0:X1])
        mask = np.zeros(roi.shape[:2], dtype=np.uint8)
        mask[max(0, y - Y0):y - Y0 + h, max(0, x - X0):x - X0 + w] = 255
        img[Y0:Y1, X0:X1] = cv2.inpaint(roi, mask, 6, cv2.INPAINT_TELEA)
    f_src = c["in"] + j
    for reg in c.get("blur", []):
        rect = interp_rect(reg, f_src)
        if rect:
            blur_box(cv2, img, rect, reg.get("cells", 7))
    z = zoom_at(c, j)
    if c["fit"] == "cover":
        ax, bx, ay, by = cover_map(c, j, W, H)
        M = np.array([[ax, 0, bx], [0, ay, by]], dtype=np.float64)
        interp = cv2.INTER_CUBIC if min(ax, ay) >= 1 else cv2.INTER_AREA
        out = cv2.warpAffine(img, M, (W, H), flags=interp, borderMode=cv2.BORDER_REPLICATE)
        if c.get("gamma"):
            # 暗い車内などを持ち上げる（1 より小さいほど明るい。白は飛ばさない）
            out = cv2.LUT(out, gamma_lut(c["gamma"]))
        if c.get("inset"):
            out = inset_of(cv2, img, out, c["inset"], c["in"] + j)
        return out
    if c["fit"] == "blur":
        cx, cy, cw, ch = c["crop"]
        src = img[cy:cy + ch, cx:cx + cw]
        # 背景: いっぱいに拡大して強くぼかし、少し暗く。ぼかすので 1/8 の大きさで作って戻す
        s = max(W / cw, H / ch)
        sw, sh_ = 2 * math.ceil(cw * s / 2 - 1e-9), 2 * math.ceil(ch * s / 2 - 1e-9)
        small = cv2.resize(src, (max(1, sw // 8), max(1, sh_ // 8)), interpolation=cv2.INTER_AREA)
        small = cv2.GaussianBlur(small, (0, 0), sigmaX=5)
        bg = cv2.resize(small, (sw, sh_), interpolation=cv2.INTER_LINEAR)
        ox, oy = (sw - W) // 2, (sh_ - H) // 2
        out = np.ascontiguousarray(bg[oy:oy + H, ox:ox + W])
        out = np.clip(out.astype(np.int16) - 26, 0, 255).astype(np.uint8)
        s2 = min(W / cw, H / ch)
        fw, fh = 2 * round(cw * s2 / 2), 2 * round(ch * s2 / 2)
        fg = cv2.resize(src, (fw, fh), interpolation=cv2.INTER_AREA if s2 < 1 else cv2.INTER_CUBIC)
        x0, y0 = (W - fw) // 2, (H - fh) // 2
        out[y0:y0 + fh, x0:x0 + fw] = fg
        if z != 1.0:
            M = np.array([[z, 0, W / 2 * (1 - z)], [0, z, H / 2 * (1 - z)]], dtype=np.float64)
            out = cv2.warpAffine(out, M, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
        return out
    sys.exit(f"未対応の fit: {c['fit']}")


def loudness(inp: list[str]) -> tuple[float, float]:
    """（積分ラウドネス LUFS, トゥルーピーク dBTP）。ffmpeg の ebur128 で測る。"""
    e = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", *inp, "-vn", "-af", "ebur128=peak=true",
                        "-f", "null", "-"], capture_output=True, text=True).stderr
    i = re.search(r"Integrated loudness:\s+I:\s+(-?[\d.]+|-inf) LUFS", e)
    tp = re.search(r"True peak:\s+Peak:\s+(-?[\d.]+|-inf) dBFS", e)
    if not i or not tp:
        sys.exit("ラウドネスを測れなかった")
    f = lambda s: -120.0 if s == "-inf" else float(s)  # noqa: E731
    return f(i.group(1)), f(tp.group(1))


def master(stems: list[Path], work: Path, name: str, au: dict, enc: dict) -> dict:
    """音の束を足して、一定の音量＋リミッターで仕上げ、AAC にする。

    媒体は再生のときに大きすぎる音を下げる（YouTube はだいたい -14 LUFS）。小さく作ると前後の動画より
    小さく鳴るので、-14 LUFS に合わせる。音量は一定の倍率で上げ下げし（loudnorm の動的な合わせ方は、
    声と BGM の差を時間で変えてしまう）、山だけをリミッターで抑える。リミッターは4倍に上げてから
    掛ける（標本の間の山＝トゥルーピークを抑えるため）。AAC にすると山が 0.5〜1dB 上に出るので、
    符号化したものを測り、トゥルーピークと音量が線に入るまで、天井と倍率を直して作り直す。
    """
    mix = None
    for s in stems:
        x = np.fromfile(s, dtype="<f4")
        mix = x.astype(np.float64) if mix is None else mix + x
    raw = work / f"mix_{name}.f32"
    mix.astype("<f4").tofile(raw)
    inp = ["-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", str(raw)]
    target, tp_max = au.get("master_lufs", -14.0), au.get("master_tp_dbtp", -1.5)
    i0, tp0 = loudness(inp)
    gain, ceil = target - i0, tp_max - 0.5
    out = work / f"master_{name}.m4a"
    for k in range(8):
        af = (f"volume={gain:.3f}dB,aresample={4 * SR},"
              f"alimiter=limit={db(ceil):.6f}:attack=1:release=60:level=false:latency=1,aresample={SR}")
        sh(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *inp, "-af", af,
            "-c:a", "aac", "-b:a", enc["audio_bitrate"], "-ar", str(SR),
            "-fflags", "+bitexact", "-flags:a", "+bitexact", "-map_metadata", "-1", str(out)])
        lufs, tp = loudness(["-i", str(out)])
        ok_tp, ok_i = tp <= tp_max - 0.1, abs(lufs - target) <= 0.4
        if ok_tp and ok_i:
            break
        if not ok_tp:
            ceil -= tp - (tp_max - 0.3)
        if not ok_i:
            gain += target - lufs
    return {"file": str(out), "stems": [Path(s).name for s in stems], "input_lufs": i0, "input_tp_dbtp": tp0,
            "gain_db": round(gain, 3), "ceiling_db": round(ceil, 3), "lufs": lufs, "true_peak_dbtp": tp,
            "passes": k + 1, "target_lufs": target, "max_tp_dbtp": tp_max}


def out_affine(c: dict, j: int, W: int, H: int) -> tuple[float, float, float, float]:
    """元素材の画素 → 書き出しの画素（X = ax*x + bx, Y = ay*y + by）。frame_of と同じ式。"""
    z = zoom_at(c, j)
    if c["fit"] == "cover":
        return cover_map(c, j, W, H)
    cx, cy, cw, ch = c["crop"]
    s2 = min(W / cw, H / ch)
    fw, fh = 2 * round(cw * s2 / 2), 2 * round(ch * s2 / 2)
    x0, y0 = (W - fw) // 2, (H - fh) // 2
    ax, ay = fw / cw, fh / ch
    bx, by = x0 - cx * ax, y0 - cy * ay
    return z * ax, z * bx + W / 2 * (1 - z), z * ay, z * by + H / 2 * (1 - z)


def blur_out(p: dict, W: int, H: int, step: int = 3) -> list[dict]:
    """ぼかしの箱を、書き出しのコマと画素で（品質チェックの顔の検査が「ぼかした所」を知るため）。"""
    out = []
    for k, c in enumerate(p["cuts"]):
        for r_i, reg in enumerate(c.get("blur", [])):
            keys = []
            js = list(range(0, c["frames"], step))
            if js[-1] != c["frames"] - 1:
                js.append(c["frames"] - 1)
            for j in js:
                rect = interp_rect(reg, c["in"] + j)
                if not rect:
                    continue
                ax, bx, ay, by = out_affine(c, j, W, H)
                x0, y0 = ax * rect[0] + bx, ay * rect[1] + by
                x1, y1 = ax * (rect[0] + rect[2]) + bx, ay * (rect[1] + rect[3]) + by
                x0, y0, x1, y1 = max(0, x0), max(0, y0), min(W, x1), min(H, y1)
                if x1 > x0 and y1 > y0:
                    keys.append({"f": c["at"] + j, "rect": [round(x0), round(y0), round(x1 - x0), round(y1 - y0)]})
            if keys:
                out.append({"cut": k, "region": r_i, "note": reg.get("note", ""),
                            "from": keys[0]["f"], "to": keys[-1]["f"] + 1, "keys": keys})
    return out


def render(edit_path: Path, out: Path, work: Path, text: bool = True, no_bgm_out: Path | None = None,
           no_bgm_work: Path | None = None) -> dict:
    t0 = time.time()
    cv2 = cv()
    edit, style, base = load(edit_path)
    work = work.resolve()  # plan.json に書くパスは、どこから読んでも同じ所を指すように
    work.mkdir(parents=True, exist_ok=True)
    p = plan(edit, style, base, work)
    fps = p["fps"]
    W, H = p["size"]
    narr_p, bgm_p, src_p = audio_stems(p, style, base, work)
    layers = layout(p, style, work)

    # コマごとに、重ねる字の絵を引けるようにする（タイトル → テロップ → 字幕 の順に重ねる）
    order = {"title": 0, "telop": 1, "caption": 2}
    timeline: list[list[Overlay]] = [[] for _ in range(p["frames"])]
    p["overlays"] = []
    kind_count: dict[str, int] = {}
    saved: set = set()
    if text:
        for ly in sorted(layers, key=lambda z: order[z["kind"]]):
            it = ly["item"]
            ovs = [Overlay(img, (W - img.width) // 2,
                           (ly["cy"] - img.height // 2) if ly["kind"] == "telop" else it["y"])
                   for img in ly["imgs"]]
            n_pop = len(style["telop"].get("pop", [1.0])) if ly["kind"] == "telop" else 1
            for f in range(max(0, it["from"]), min(p["frames"], it["to"])):
                timeline[f].append(ovs[pick(it, f, n_pop) if ly["kind"] == "telop" else 0])

            # 品質チェックが「重ねた物の全部」を読めるように、コマの範囲ごとに1つずつ書き出す
            # （テロップの「ポン」は数コマごとに絵が変わるので、絵ごとに1件）
            seq = [(f, pick(it, f, n_pop) if ly["kind"] == "telop" else 0)
                   for f in range(max(0, it["from"]), min(p["frames"], it["to"]))]
            nth = kind_count.get(ly["kind"], 0)
            kind_count[ly["kind"]] = nth + 1
            k0 = 0
            while k0 < len(seq):
                k1 = k0
                while k1 + 1 < len(seq) and seq[k1 + 1][1] == seq[k0][1]:
                    k1 += 1
                ov, gi = ovs[seq[k0][1]], seq[k0][1]
                png = work / f"ov_{ly['kind']}_{nth:02d}_{gi}.png"
                if (ly["kind"], nth, gi) not in saved:
                    ly["imgs"][gi].save(png)
                    saved.add((ly["kind"], nth, gi))
                o = {"kind": ly["kind"], "png": str(png), "x": ov.x, "y": ov.y, "w": ov.w, "h": ov.h,
                     "from": seq[k0][0], "to": seq[k1][0] + 1, "text": it.get("text") or "／".join(it["lines"])}
                if "line" in it:
                    o["line"] = it["line"]
                p["overlays"].append(o)
                k0 = k1 + 1
    p["style"] = style
    p["blur_out"] = blur_out(p, W, H)

    enc = style["encode"]
    au = style["audio"]
    # 音の仕上げ（一定の音量＋リミッター）。BGM 入りと、BGM 抜き（TikTok 向け）を別々に作る
    p["master"] = {"with_bgm": master([narr_p, bgm_p, src_p], work, "with_bgm", au, enc)}
    if no_bgm_out:
        p["master"]["no_bgm"] = master([narr_p, src_p], work, "no_bgm", au, enc)

    args = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-framerate", str(fps), "-i", "pipe:0",
            "-i", p["master"]["with_bgm"]["file"]]
    fc = ["[0:v]scale=out_color_matrix=bt709:out_range=tv:flags=bicubic+accurate_rnd+full_chroma_int,"
          "format=yuv420p[vout]"]
    args += [
        "-filter_complex", ";".join(fc), "-map", "[vout]", "-map", "1:a",
        "-frames:v", str(p["frames"]), "-r", str(fps),
        "-c:v", "libx264", "-preset", enc["preset"], "-crf", str(enc["crf"]),
        "-profile:v", "high", "-pix_fmt", "yuv420p", "-threads", "4",
        # x264 をコマ単位で並列にすると、箱が混んでいるときだけ別のバイト列が出た
        # （同時に3本回して1本だけ違った。filtergraph の出力は3本とも同じ）。
        # スライス単位の並列は混んでいても3本とも同じだった。遅くなる（27秒→45秒）が、
        # 「同じ指示書から同じ動画」を取る。
        "-x264-params", "sliced-threads=1",
        "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
        # 音は仕上げた AAC をそのまま入れる（測って合わせたものを、もう一度符号化して変えない）
        "-c:a", "copy",
        # 同じ指示書から同じバイト列を出すため、版や日時を書き込ませない
        "-fflags", "+bitexact", "-flags:v", "+bitexact", "-flags:a", "+bitexact",
        "-map_metadata", "-1", "-movflags", "+faststart", str(out),
    ]
    (work / "ffmpeg_args.json").write_text(json.dumps(args, ensure_ascii=False, indent=1))
    enc_proc = subprocess.Popen(args, stdin=subprocess.PIPE)

    def frames():
        f = 0
        for c in p["cuts"]:
            for j, img in enumerate(prefetch(decode_cut(c, fps))):
                frame = frame_of(cv2, img, c, j, W, H)
                for ov in timeline[f]:
                    ov.blend(frame)
                yield frame.tobytes()
                f += 1

    # 書き込みは別の糸で（pipe が詰まっているあいだに、次のコマを作れるように）
    wq: queue.Queue = queue.Queue(4)
    err: list[BaseException] = []

    def writer():
        try:
            while (b := wq.get()) is not None:
                enc_proc.stdin.write(b)
        except BaseException as e:  # noqa: BLE001
            err.append(e)
            while wq.get() is not None:  # 作る側を止めないように、残りを捨てる
                pass

    wt = threading.Thread(target=writer, daemon=True)
    wt.start()
    try:
        for b in frames():
            wq.put(b)
    finally:
        wq.put(None)
        wt.join()
        enc_proc.stdin.close()
        rc = enc_proc.wait()
    if err or rc != 0:
        sys.exit(f"ffmpeg の符号化が落ちた（{rc} {err[:1]}）")
    if no_bgm_out:
        # BGM 抜きの版（TikTok は投稿のときに媒体の音源から曲を付けるので、ファイルに曲を入れない）。
        # 映像は書いたものをそのまま写す（同じ絵を2回符号化しない。2本の絵が1画素も違わない）
        sh(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(out),
            "-i", p["master"]["no_bgm"]["file"], "-map", "0:v", "-map", "1:a", "-c", "copy",
            "-fflags", "+bitexact", "-map_metadata", "-1", "-movflags", "+faststart", str(no_bgm_out)])
        p["variants"] = {"with_bgm": str(out), "no_bgm": str(no_bgm_out)}
    p["render_seconds"] = round(time.time() - t0, 2)
    (work / "plan.json").write_text(json.dumps(p, ensure_ascii=False, indent=1))
    if no_bgm_out:
        # BGM 抜きの版にも、その版の時間割と音の束を置く（品質チェックは work の束と仕上がりを
        # 突き合わせる。BGM 入りの束で BGM 抜きを測ると、BGM の段が合わない）
        w2 = no_bgm_work or Path(str(work.with_suffix("")) + "_nobgm.work")
        w2.mkdir(parents=True, exist_ok=True)
        for name in ("stem_narration.f32", "stem_source.f32"):
            shutil.copyfile(work / name, w2 / name)
        np.zeros(p["frames"] * (SR // fps) * 2, dtype="<f4").tofile(w2 / "stem_bgm.f32")
        p2 = {**p, "bgm": None, "variant": "no_bgm", "out": str(no_bgm_out),
              "master": {"no_bgm": p["master"]["no_bgm"]}}
        (w2 / "plan.json").write_text(json.dumps(p2, ensure_ascii=False, indent=1))
        p["variants"]["no_bgm_work"] = str(w2)
        (work / "plan.json").write_text(json.dumps(p, ensure_ascii=False, indent=1))
    return p


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("edit", type=Path)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--work", type=Path, help="途中のファイル（既定: 出力の横に <名前>.work）")
    ap.add_argument("--no-bgm-out", type=Path,
                    help="BGM を抜いた版も書く（映像は同じものを写す。TikTok 向け）")
    ap.add_argument("--no-bgm-work", type=Path,
                    help="BGM 抜きの版の時間割と音の束の置き場（既定: <work から拡張子を外した名前>_nobgm.work）")
    ap.add_argument("--no-text", action="store_true",
                    help="字を重ねずに書く（字の画素を、書き出したコマどうしの差で測るときの比べる相手）")
    a = ap.parse_args()
    for tool in ("ffmpeg", "ffprobe"):
        if not shutil.which(tool):
            sys.exit(f"{tool} が無い")
    work = a.work or a.out.with_suffix(".work")
    p = render(a.edit, a.out, work, text=not a.no_text, no_bgm_out=a.no_bgm_out, no_bgm_work=a.no_bgm_work)
    print(json.dumps({"out": str(a.out), "frames": p["frames"], "seconds": p["frames"] / p["fps"],
                      "captions": len(p["captions"]), "telops": len(p["telops"]),
                      "render_seconds": p["render_seconds"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
