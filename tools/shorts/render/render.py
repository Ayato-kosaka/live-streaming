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

sys.path.insert(0, str(Path(__file__).resolve().parent))
import textlook as TL  # noqa: E402

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

def deep_merge(a: dict, b: dict) -> dict:
    """b を a に重ねる（入れ子の dict は中まで。ほかは b で置き換える）。"""
    out = dict(a)
    for k, v in b.items():
        out[k] = deep_merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


def load_style(ref: str, base: Path) -> dict:
    """様式の JSON。`"extends": "style.json"` があれば、その様式に重ねる（参考の動画ごとの様式を差分だけで書く）。"""
    path = base / ref
    if not path.exists():
        path = HERE / ref
    st = json.loads(path.read_text())
    parent = st.pop("extends", None)
    return deep_merge(load_style(parent, path.parent), st) if parent else st


def load(edit_path: Path) -> tuple[dict, dict, Path]:
    edit = json.loads(edit_path.read_text())
    base = edit_path.resolve().parent
    style = load_style(edit.get("style", "style.json"), base)
    return edit, style, base


def font_path(style: dict, key: str) -> Path:
    """書体。様式の fonts の名前か、書体のファイル名そのもの（fonts/ か SHORTS_FONTS_DIR に置く）。"""
    name = style["fonts"].get(key, key)
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


def atempo_chain(tempo: float) -> str:
    """速さ tempo 倍の atempo（音の高さは変えない）。1段 2.0 倍までに、同じ倍率で割って重ねる
    （2.2 倍を 2.0 × 1.1 にすると、2.0 の段で崩れが目立つ。1.483 × 1.483 のほうが滑らか）。"""
    n = max(1, math.ceil(math.log(tempo) / math.log(2.0) - 1e-9))
    step = tempo ** (1.0 / n)
    return ",".join(f"atempo={step:.6f}" for _ in range(n))


def compress_pauses(x: np.ndarray, max_s: float, rel_db: float = -35.0) -> np.ndarray:
    """行の中の無音（その行のいちばん大きい所から rel_db より小さい 10ms が続く所）を max_s 秒までに縮める。

    縮めるのは間の真ん中だけ（前後 max_s/2 ずつは残す）。つなぎ目は 5ms で重ねる（無音どうしなので跡は出ない）。
    """
    w = SR // 100
    k = len(x) // w
    if k < 3:
        return x
    r = np.sqrt(np.mean(x[:k * w].reshape(k, w).astype(np.float64) ** 2, axis=1))
    quiet = r < r.max() * db(rel_db)
    keep = int(round(max_s * 100))
    cuts, s = [], None
    for j, q in enumerate(list(quiet) + [False]):
        if q and s is None:
            s = j
        elif not q and s is not None:
            if s > 0 and j < k and j - s > keep:
                a = (s + keep // 2) * w
                b = (j - (keep - keep // 2)) * w
                cuts.append((a, b))
            s = None
    if not cuts:
        return x
    xf = int(SR * 0.005)
    out, pos = [], 0
    for a, b in cuts:
        seg = x[pos:a].astype(np.float32).copy()
        nxt = x[b:b + xf].astype(np.float32)
        n = min(xf, len(seg), len(nxt))
        if n:
            ramp = np.linspace(0, 1, n, dtype=np.float32)
            seg[-n:] = seg[-n:] * (1 - ramp) + nxt[:n] * ramp
        out.append(seg)
        pos = b + n
    out.append(x[pos:].astype(np.float32))
    return np.concatenate(out)


def tempo_wav(src: Path, tempo: float, work: Path, max_pause: float | None = None) -> Path:
    """詰めた声 src を tempo 倍の速さにして、もう一度頭と尻を詰める（字幕の出だしの物差しを保つ）。

    1本の動画の中では全行を同じ倍率にする（行ごとに変えると、行の間で喋る速さが揺れる）。
    max_pause があれば、行の中の間もその秒数までに縮める（伸びているショートはほとんど間を置かない）。
    """
    key = hashlib.sha256(src.read_bytes() + f"tempo|{tempo:.4f}|{max_pause}|{TRIM_VER}".encode()).hexdigest()[:16]
    out = work / "narration" / f"{key}.wav"
    if out.exists():
        return out
    if abs(tempo - 1.0) < 1e-6:
        x = decode_audio(src, 1)[:, 0]
    else:
        raw = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(src), "-af",
                              atempo_chain(tempo), "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"],
                             check=True, capture_output=True).stdout
        x = np.frombuffer(raw, dtype="<f4")
    x = trim_voice(x)
    if max_pause:
        x = compress_pauses(x, float(max_pause))
    return write_wav(x[:, None], out)


def narration_wav(line: dict, narr: dict, base: Path, work: Path) -> Path:
    """1行ぶんのナレーションの wav（48kHz・1ch・頭と尻の無音を詰めたもの）を返す。

    - `audio`: 行ごとの声のファイル（Fish Audio で作ったもの）。詰めて使う。`engine: "files"` の本番
    - `file`: 詰めずにそのまま使う（人が録った声など。頭の間も演出として残したいとき）
    - どちらも無ければ open_jtalk で読ませる（尺の下書き用。`tts_text` があれば読みはそちら）
    - `narration.tempo`（1 より大きい）があれば、詰めたあと音の高さを変えずにその倍率で速くする
    - `narration.max_pause_s` があれば、行の中の間をその秒数までに縮める（速めたあとの時間で）
    中身と処理が同じなら作り直さない。
    """
    tempo = float(narr.get("tempo") or 1.0)
    mp = narr.get("max_pause_s")
    out = narration_wav_raw(line, narr, base, work)
    if line.get("file") or (abs(tempo - 1.0) < 1e-6 and not mp):
        return out
    return tempo_wav(out, tempo, work, mp)


def narration_wav_raw(line: dict, narr: dict, base: Path, work: Path) -> Path:
    """narration_wav の、速さを変える前の段。"""
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
    """行ごとに中央揃えで字を置いた絵（RGBA）。見た目は様式の区画 st（の look）どおり（textlook.py）。

    hl があれば、その言葉だけ強調の色にし、少し大きくする（数字・値段を目に入れる）。
    大きくして max_width を越える行が出るなら、色だけ変える。
    """
    return TL.text_img(lines, TL.look_of(st), font, highlight_marks(lines, hl) if hl else None, st.get("max_width"))


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
    # 字幕の出はじめ（ふつうは声の頭。caption_from があればそこ。前の行の字幕はそこまで）
    starts = [ln.get("caption_from", ln["at"]) for ln in narr.get("lines", [])] + [total]
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
        # 【大】の行は字幕そのものを大きく出す（1枚。折り返しと大きさは layout が置き場に合わせて決める）
        big = ln.get("big")
        pages = [[text]] if big else paginate(text, cap_font, inner, cap_st["max_lines"])
        end = min(ln["at"] + frames + cap_st.get("hold_frames", 0), starts[i + 1], total)
        # 次の行がすぐ（bridge_frames 以内）なら、次の行の頭まで出しておく。行の頭はカットの切れ目なので、
        # 字幕が消えるのと画が変わるのが同じコマになる（7コマだけ字幕が消えてまた出る、のちらつきも無くなる）
        nxt = starts[i + 1]
        if ln["at"] + frames <= nxt <= min(total, ln["at"] + frames + cap_st.get("bridge_frames", 0)):
            end = nxt
        bounds = [starts[i]]
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
            if big:
                cap["big"] = big
                cap["text"] = text
            captions.append(cap)

    title = edit.get("title")
    titles = []
    if title:
        look = title.get("look")
        ti_st = style["title_card"] if look == "card" else style["title"]
        if look == "card":
            # 題の札は、題を決めた人の改行どおりに出す（大きさのほうを layout で合わせる）
            rows = [s for s in title["text"].split("\n") if s]
        else:
            ti_font = ImageFont.truetype(str(font_path(style, ti_st["font"])), ti_st["size"])
            rows = wrap(title["text"], ti_font, ti_st["max_width"] - 2 * ti_st["pad_x"])
        if len(rows) > ti_st.get("max_lines", 9):
            print(f"注意: タイトルが {len(rows)} 行（上限 {ti_st.get('max_lines', 9)}）", file=sys.stderr)
        ti = {"from": title.get("from", 0), "to": min(title.get("to") or total, total), "lines": rows,
              "text": title["text"].replace("\n", "")}
        if look:
            ti["look"] = look
        if "line" in title:
            # 札がそのナレーションの行の字幕を兼ねる（同じ言葉を札と字幕で2回出さない）
            ti["line"] = int(title["line"])
        titles.append(ti)

    notes = [{"from": int(n["from"]), "to": min(int(n["to"]), total), "text": n["text"]}
             for n in edit.get("notes", []) if n.get("text")]

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
            "captions": captions, "titles": titles, "telops": telops, "notes": notes, "bgm": edit.get("bgm"),
            "tempo": float(narr.get("tempo") or 1.0), "audio_override": edit.get("audio") or {}}


def audio_cfg(p: dict, style: dict) -> dict:
    """音の決まり（様式）に、指示書の audio の上書きを重ねたもの（BGM の大きさやダッキングを動画ごとに）。"""
    return {**style["audio"], **(p.get("audio_override") or {})}


# ---------------------------------------------------------------- 題の札・【大】の字幕

# 節の終わり、または3字以上のカタカナの語のあとにひらがな・漢字が続く所（「イエローバス｜やんか！」「ポテト｜入り！？」）
_CLAUSE_END = re.compile(r"(だら|たら|から|けど|ので|のに|ても|でも|[ァ-ヴー]{3,}(?=[ぁ-ゖ一-鿿])(?![はがをにへともでのや][、。！？…]|[はがをにへともでの]$))(?=.)")


def fine_chunks(text: str) -> list[str]:
    """文節（BudouX）を、節の終わり（〜たら・〜から・〜けど…）でもう一段割る。

    BudouX は「ケバブ頼んだらまさかの」を1つの文節にする。題を2行に割るとき、それだと
    「ケバブ頼んだらまさかの／事態！」しか選べない。「ケバブ頼んだら／まさかの事態！」を選べるようにする。
    """
    out = []
    for ch in chunks_of(text):
        pos = 0
        for m in _CLAUSE_END.finditer(ch):
            out.append(ch[pos:m.end()])
            pos = m.end()
        out.append(ch[pos:])
    return [c for c in out if c]


def halve_longest(ch: list[str]) -> list[str] | None:
    """いちばん長い文節（5字以上）を、真ん中の字の切れ目で2つに割る（文節の切れ目だけでは大きく出せないときの最後の手）。

    「ちょうどすぎる」→「ちょうど」「すぎる」。句読点の手前では割らない。
    """
    k = max(range(len(ch)), key=lambda i: len(ch[i].rstrip("、。！？…")))
    c = ch[k]
    body = len(c.rstrip("、。！？…"))
    if body < 5:
        return None
    m = (body + 1) // 2
    return ch[:k] + [c[:m], c[m:]] + ch[k + 1:]


def split_candidates(text: str, n: int, ch: list[str] | None = None) -> list[list[str]]:
    """text を文節（fine_chunks）の切れ目で n 行に割る、すべての割り方（行末の「、」「。」は落とす）。"""
    ch = ch or fine_chunks(text)
    if n == 1:
        return [[text]]
    if len(ch) < n:
        return []
    out = []

    def rec(start: int, k: int, acc: list[str]):
        if k == 1:
            out.append(acc + ["".join(ch[start:])])
            return
        for j in range(start + 1, len(ch) - k + 2):
            rec(j, k - 1, acc + ["".join(ch[start:j])])

    rec(0, n, [])
    return [[ln.rstrip("、。").strip() for ln in c] for c in out if all(ln.rstrip("、。").strip() for ln in c)]


def fit_lines(text: str, lk: dict, fpath: Path, size: int, min_size: int, max_w: float, max_lines: int = 2,
              wrap_below: int = 0, step: int = 2, fold_floor: int = 0) -> tuple[list[str], int]:
    """text を幅 max_w に収める（行と大きさ）。字幅は字間（tracking）と縁・発光の広がりまで入れて見積もる。

    縮めるより先に折る: 1行で wrap_below 以上に出せるなら1行。出せないなら2行（文節の切れ目のうち、
    いちばん大きく出せる割り方）。2行でも fold_floor に届かず max_lines が 3 以上なら3行。どれも届かないなら、
    いちばん大きく出せる行数にする。
    """
    def fits(lines, s):
        # 絵は見積もりより両側 2〜3px 広くなる（2倍で描くときの余白と丸め）。その分を空けて比べる
        return TL.text_width(lines, lk, ImageFont.truetype(str(fpath), s)) + 6 <= max_w

    def best(lines):
        for s in range(size, min_size - 1, -step):
            if fits(lines, s):
                return s
        return None

    results = []
    chunk_sets = [fine_chunks(text)]
    forced = halve_longest(chunk_sets[0]) if fold_floor else None
    if forced:
        chunk_sets.append(forced)
    for ch in chunk_sets:
        for n in range(1, max(1, max_lines) + 1):
            cands = split_candidates(text, n, ch)
            top = None
            for c in cands:
                s = best(c)
                # 同じ大きさなら、行の幅がそろう割り方（読む目が戻りやすい）
                if s is not None and (top is None or s > top[0] or (s == top[0] and _spread(c, lk, fpath, s) < top[2])):
                    top = (s, c, _spread(c, lk, fpath, s))
            if top:
                results.append((n, top[0], top[1]))
            floor = wrap_below if n == 1 else fold_floor
            if top and top[0] >= floor:
                return top[1], top[0]
    if results:
        n, s, c = max(results, key=lambda r: (r[1], -r[0]))
        return c, s
    f = ImageFont.truetype(str(fpath), min_size)
    return wrap(text, f, max_w - 2 * TL.margin_of(lk, min_size)), min_size


def _spread(lines: list[str], lk: dict, fpath: Path, s: int) -> float:
    f = ImageFont.truetype(str(fpath), s)
    ws = [TL.advance(ln, f, lk.get("tracking", 0.0)) for ln in lines]
    return max(ws) - min(ws)


def title_card_img(text: str, st: dict, style: dict) -> Image.Image:
    """題の札。黒い箱の中に、題の行ごとに様式の lines[k] の見た目で字を積む（参考の題は1行目と2行目で見た目が違う）。

    題の改行（\\n）ごとに1つの見た目。箱の幅に収まる大きさまで縮め、2つ目からは縮めすぎるなら文節で2行に割る。
    lines が無い古い様式では、全部の行を1つの見た目で出す。
    """
    parts = [s for s in text.split("\n") if s]
    pad_x, pad_y = st.get("pad", [st.get("pad_x", 30), st.get("pad_y", 20)])
    inner = st["max_width"] - 2 * pad_x
    styles = st.get("lines") or [{"font": st["font"], "size": st["size"], "min_size": st["min_size"],
                                  "look": {k: v for k, v in TL.look_of(st).items() if k != "box"}}]
    gap = st.get("gap", 0)

    def build(shrink: int) -> list[Image.Image]:
        imgs = []
        for k, part in enumerate(parts):
            ls = styles[min(k, len(styles) - 1)]
            fpath = font_path(style, ls["font"])
            lk = ls["look"]
            # 大きさは縁までで決める。発光は箱の余白に広がってよい（はみ出す分は箱の縁で切る）
            lk_fit = {k: v for k, v in lk.items() if k != "glow"}
            top = max(ls.get("min_size", 40), ls["size"] - shrink)
            lines, size = fit_lines(part, lk_fit, fpath, top, min(top, ls.get("min_size", 40)), inner,
                                    ls.get("max_lines", 2), min(top, ls.get("wrap_below", 0)))
            im = TL.text_img(lines, lk, ImageFont.truetype(str(fpath), size), seed=TL.text_seed(part))
            if im.width > st["max_width"]:
                cut = (im.width - st["max_width"]) // 2
                im = im.crop((cut, 0, cut + st["max_width"], im.height))
            imgs.append(im)
        return imgs

    # 箱は max_height に収める（下の字幕の置き場（画面のまん中）に掛からないように）。収まるまで字を小さくする
    shrink = 0
    imgs = build(0)
    while st.get("max_height") and sum(i.height for i in imgs) + gap * (len(imgs) - 1) + 2 * pad_y > st["max_height"] \
            and shrink < 80:
        shrink += 4
        imgs = build(shrink)
    w = max(min(st["max_width"], max(i.width for i in imgs) + 2 * pad_x), max(i.width for i in imgs))
    h = sum(i.height for i in imgs) + gap * (len(imgs) - 1) + 2 * pad_y
    card_img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    bx = st.get("box") or {"color": st.get("bg", "#000000"), "alpha": st.get("bg_alpha", 1.0),
                           "radius": st.get("radius", 24)}
    ImageDraw.Draw(card_img).rounded_rectangle([0, 0, w - 1, h - 1], radius=bx.get("radius", 24),
                                               fill=hex_rgba(bx["color"], bx.get("alpha", 1.0)))
    y = pad_y
    for im in imgs:
        card_img.alpha_composite(im, ((w - im.width) // 2, y))
        y += im.height + gap
    return card_img


def anim_scale_max(anim: dict | None) -> float:
    """出入りの動きで、いちばん大きくなるときの倍率（置き場に収まるかは、そのときの大きさで見る）。"""
    sts = TL.anim_frames((anim or {}).get("in")) + TL.anim_frames((anim or {}).get("out"))
    return max([1.0] + [s["scale"] for s in sts])


def big_extent(img: Image.Image, smax: float, mx: float, my: float, alpha_min: int = 16) -> tuple[float, ...]:
    """【大】の字の見える箱を、置く中心（字のかたまりの真ん中＝ink_y の cy）からの距離で
    （左, 右, 上, 下）。動きでいちばん大きくなったとき・揺れでいちばん動いたときまで含める。"""
    vb = visible_box(img, alpha_min)
    bb = img.getbbox() or (0, 0, img.width, img.height)
    ay = (bb[1] + bb[3]) / 2                      # ink_y が cy に合わせる所（絵の中の y）
    cy_img, cx_img = img.height / 2 - ay, img.width / 2   # 拡大の中心（絵の真ん中）の、cy からの位置
    ys = [cy_img + s * (v - ay - cy_img) for s in (1.0, smax) for v in (vb[1], vb[3])]
    xs = [s * (v - cx_img) for s in (1.0, smax) for v in (vb[0], vb[2])]
    return min(xs) - mx, max(xs) + mx, min(ys) - my, max(ys) + my


def big_layout(it: dict, p: dict, style: dict, faces: list | None = None) -> tuple[Image.Image, int, int, dict | None, dict]:
    """【大】の字幕の、出来上がりの絵・置く中心の y・字の大きさ・出入りの動き・見た目の設定。

    見た目と動きは style の big.looks[名前]（{"look": …, "anim": …, "font"・"size"・"min_size"・"speedlines"}）。
    いちばん大きく出せる大きさを探し（長い行は文節で2行に割る）、centers の順に置ける所へ置く。
    右のボタン列（y>=840 で x>888）に掛かる高さなら幅 696 まで、掛からなければ 840 まで。
    動きでいちばん大きくなるとき・揺れでいちばん動いたときにも収まるように測る。
    題の札・札（inset）の帯とは重ねない。

    faces（コマごとの顔の箱）を渡すと、その行のどのコマかで顔に掛かるときは、揺れの中心ごと顔の下へ
    （収まらなければ上へ）ずらす。どちらにも収まらなければ、収まるまで字を小さくする。
    """
    st, safe = style["big"], style["safe"]
    af = style.get("avoid_faces") or {}
    W = p["size"][0]
    ent = st["looks"][it["big"]]
    lk, anim = ent.get("look", ent), ent.get("anim")
    fpath = font_path(style, ent.get("font", st["font"]))
    seed = TL.text_seed(it["text"])
    top_lim = top_limit(it, p, st["top"])
    busy = busy_bands(it, p)
    smax = anim_scale_max(anim)
    mx, my = TL.shake_margin(anim)
    half_narrow, half_wide = safe["right_column_x"] - W / 2, safe["right"] - W / 2

    def fit(half: float, cap: int | None = None):
        max_w = min(st["max_width"], 2 * (half - mx) / smax)
        lines, size = fit_lines(it["text"], lk, fpath, cap or ent.get("size", st["size"]),
                                ent.get("min_size", st["min_size"]), max_w,
                                ent.get("max_lines", st.get("max_lines", 2)),
                                ent.get("wrap_below", 0), fold_floor=ent.get("fold_floor", 0))
        return lines, size, TL.text_img(lines, lk, ImageFont.truetype(str(fpath), size), seed=seed)

    chosen = None
    for cy in st["centers"]:
        for half in (half_wide, half_narrow):
            lines, size, img = fit(half)
            w, h = img.width * smax + 2 * mx, img.height * smax + 2 * my
            if cy - h / 2 < top_lim or cy + h / 2 > safe["bottom"]:
                continue
            if any(cy - h / 2 < b and a < cy + h / 2 for a, b in busy):
                continue
            lim = half_narrow if cy + h / 2 > safe["right_column_from_y"] else half_wide
            if w / 2 <= lim + 0.5:
                chosen = (lines, size, img, cy)
                break
        if chosen:
            break
    if not chosen:
        sys.exit(f"【大】の字幕が置き場に収まらない: {it['text']}")
    lines, size, img, cy = chosen
    if faces is not None:
        def where(img_: Image.Image):
            l, r, t, b = big_extent(img_, smax, mx, my, af.get("alpha_min", 16))
            ymax = safe["bottom"] - b
            if W / 2 + r > safe["right_column_x"]:
                ymax = min(ymax, safe["right_column_from_y"] - b)
            return place_off_face(cy, t, b, W / 2 + l, W / 2 + r, it, faces, af, busy, top_lim - t, ymax)

        first = where(img)
        if first[1]:
            # 顔に掛かる。揺れの中心ごと下（上）へ。どこにも置けなければ、置けるまで小さくする
            # （下限は見た目の min_size。折りかたも大きさごとに選び直す）
            step = af.get("shrink_step", 4)
            caps = list(range(size - step, ent.get("min_size", st["min_size"]) - 1, -step))
            got = None if first[3] else (lines, size, img, first)
            for cap in caps if got is None else []:
                l2, s2, im2 = fit(half_narrow, cap)
                r2 = where(im2)
                if not r2[3]:
                    got = (l2, s2, im2, r2)
                    break
            if got is None:
                # どの大きさでも避けきれない（顔が画面いっぱい・行の間に顔が大きく動く）。大きさは元のまま、
                # 重なりがいちばん少ない所へ。品質チェックはこの行で落ちる（隠さない）
                note_move(p, it, "big", cy, first[0], first[1], first[2], unresolved=True)
                cy = first[0]
            else:
                l2, s2, im2, (y2, how2, sp2, _) = got
                note_move(p, it, "big", cy, y2, how2 if s2 == size else f"{how2 or 'その場'}・{size}→{s2}px", sp2,
                          size_from=size, size_to=s2)
                lines, size, img, cy = l2, s2, im2, y2
    it["lines"] = lines
    return img, cy, size, anim, ent


_IDENT = TL.state_key(TL.IDENTITY)


# ---------------------------------------------------------------- 顔を避ける

YUNET = HERE / "models" / "face_detection_yunet_2023mar.onnx"


def qa_faces():
    """品質チェックの顔の検査（qa/faces.py）の、肌色と「ぼかしてあるか」の式と線。

    同じ式を2か所に書くと、片方だけ直されて「書き出しは顔でないと見たのに、チェックは顔と言う」が
    起きる。だから写さずに読む（render/faces.py と名前がぶつかるので、場所を名指しして読む）。
    """
    import importlib.util
    qa = HERE.parent / "qa"
    if str(qa) not in sys.path:
        sys.path.append(str(qa))  # qa/faces.py の `from common import` のため。書き出しの道具より後ろに置く
    spec = importlib.util.spec_from_file_location("qa_faces", qa / "faces.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def qa_facetrack():
    """品質チェックの、顔の箱をコマをまたいでつなぐ道具（qa/facetrack.py。同じ線で選ぶため写さずに読む）。"""
    import importlib.util
    spec = importlib.util.spec_from_file_location("qa_facetrack", HERE.parent / "qa" / "facetrack.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def plate_faces(plate: Path, W: int, H: int, cfg: dict) -> list[list[list]]:
    """字なしの書き出しの全コマで顔を探す。コマごとの [x, y, w, h, 点, 肌色の割合, 細かさ, まわりの細かさ]。

    品質チェック（qa/textface.py）と同じ絵——書き出して読み直した字なしの版——を、同じ縮め方
    （色を BGR にしてから縦横半分に面積平均）で YuNet に通し、同じ式で肌色とぼかしを測る。
    どれを顔として避けるかは face_boxes が決める（チェックより緩い線で、避ける側に倒す）。
    """
    cv2 = cv()
    QF = qa_faces()
    model = Path(cfg["model"]) if cfg.get("model") else YUNET
    if not model.exists() or not hasattr(cv2, "FaceDetectorYN"):
        sys.exit(f"顔を避けるための顔の重みが無い: {model}（tools/shorts/render/fetch_fonts.sh を回す）。"
                 "避けずに書くなら様式の avoid_faces.enabled を false に")
    s = cfg.get("det_scale", 0.5)
    w, h = int(W * s), int(H * s)
    det = cv2.FaceDetectorYN.create(str(model), "", (w, h), cfg.get("score", 0.5), 0.3, 5000)
    proc = subprocess.Popen(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(plate), "-map", "0:v:0",
                             "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
    out, size = [], W * H * 3
    try:
        while len(buf := proc.stdout.read(size)) == size:
            img = np.frombuffer(buf, dtype=np.uint8).reshape(H, W, 3)
            sm = cv2.resize(cv2.cvtColor(img, cv2.COLOR_RGB2BGR), (w, h), interpolation=cv2.INTER_AREA)
            det.setInputSize((w, h))
            _, fs = det.detect(sm)
            row = []
            if fs is not None:
                gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
                for f in fs:
                    X, Y, Wd, Hd = [int(round(int(v) / s)) for v in f[:4]]
                    inner, outer = QF.sharpness(cv2, gray, X, Y, Wd, Hd)
                    row.append([X, Y, Wd, Hd, round(float(f[-1]), 3), round(QF.skin_share(cv2, img, X, Y, Wd, Hd), 3),
                                round(inner, 1), round(outer, 1)])
            out.append(row)
    finally:
        proc.stdout.close()
        proc.wait()
    return out


def face_boxes(dets: list[list[list]], cfg: dict, strict: bool = False) -> list[list[list[int]]]:
    """避ける顔の箱（コマごと）。

    strict=False（先に使う）: 品質チェックが顔と数えるもの（点 0.6・肌色 SKIN_MIN 以上・ぼかしていない）を
    必ず含むように、チェックより緩い線で選ぶ。点は様式の score まで、肌色は skin_ratio 倍まで下げ、
    「ぼかしてある」は細かさがチェックの線の blur_ratio 倍より小さいときだけ。
    strict=True（緩い線では置き場が無い行だけ）: チェックとちょうど同じ線。食べ物を顔と間違えた
    点 0.5〜0.6 の箱が、置き場を塞いでいたことがある（B の「ちなみに肉は」）。
    どちらも、続けて出ない箱（1〜2コマ）はチェックと同じ道具で落とす。
    """
    QF = qa_faces()
    if strict:
        k_skin, k_blur, min_score = 1.0, 1.0, QF.YUNET_SCORE
    else:
        k_skin, k_blur, min_score = cfg.get("skin_ratio", 0.6), cfg.get("blur_ratio", 0.5), 0.0
    out = []
    for row in dets:
        keep = []
        for x, y, w, h, score, skin, inner, outer in row:
            if score < min_score or skin < QF.SKIN_MIN * k_skin:
                continue
            if inner < QF.BLUR_ABS * k_blur and (outer <= 0 or inner < QF.BLUR_RATIO * k_blur * outer):
                continue
            keep.append([x, y, w, h])
        out.append(keep)
    return qa_facetrack().keep_persistent(out)


def place_off_face(y0: float, top: float, bot: float, x0: float, x1: float, it: dict, tiers: list, cfg: dict,
                   busy: list, ymin: float, ymax: float) -> tuple[float, str, list, bool]:
    """字の見える箱 [y + top, y + bot]（横 x0..x1）を、顔に掛からない y に置く。（y, どう動かしたか, 顔の縦の範囲, 避けきれないか）。

    tiers は [緩い線の顔, チェックと同じ線の顔]。緩い線で置ければそれで、置けなければチェックの線で、
    それでも置けなければ重なりが最少の所（避けきれない。品質チェックはこの行で落ちる）。
    顔に掛かっていなければ y0 のまま（how は ""）。
    """
    gap = cfg.get("gap", 12)
    spans = face_spans(tiers[0], it["from"], it["to"], x0, x1, cfg)
    if not on_face(y0, top, bot, spans, gap):
        return y0, "", spans, False
    for k, faces in enumerate(tiers):
        sp = spans if k == 0 else face_spans(faces, it["from"], it["to"], x0, x1, cfg)
        if k and not on_face(y0, top, bot, sp, gap):
            return y0, "その場（チェックの線では顔に掛からない）", sp, False
        got = free_y(y0, top, bot, sp, busy, ymin, ymax, gap)
        if got:
            return got[0], got[1] + ("（チェックの線で）" if k else ""), sp, False
    sp = face_spans(tiers[-1], it["from"], it["to"], x0, x1, cfg)
    return least_y(y0, top, bot, sp, busy, ymin, ymax, gap), "避けきれない（重なりが最少の所）", sp, True


def visible_box(img: Image.Image, alpha_min: int = 16) -> tuple[int, int, int, int]:
    """絵の見える範囲（縁・発光まで。濃さ alpha_min 以上）。品質チェックの字の箱と同じ線。"""
    a = np.asarray(img.getchannel("A"))
    ys, xs = np.nonzero(a >= alpha_min)
    if not len(xs):
        return 0, 0, img.width, img.height
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def face_spans(faces: list | None, f0: int, f1: int, x0: float, x1: float, cfg: dict) -> list[tuple[float, float]]:
    """コマ [f0, f1) に出る顔のうち、横 [x0, x1) に掛かるものの縦の範囲（眉から顎＋余裕）。"""
    if not faces:
        return []
    px, py, gap = cfg.get("pad_x", 0.02), cfg.get("pad_y", 0.02), cfg.get("gap", 12)
    out = []
    for f in range(max(0, f0), min(len(faces), f1)):
        for x, y, w, h in faces[f]:
            if x + w * (1 + px) + gap <= x0 or x - w * px - gap >= x1:
                continue
            out.append((y - h * py, y + h * (1 + py)))
    return out


def free_y(y0: float, top: float, bot: float, spans: list, busy: list, ymin: float, ymax: float,
           gap: float) -> tuple[int, str] | None:
    """字の見える箱 [y + top, y + bot] が顔（spans）にも塞がった帯（busy）にも掛からない y。

    顔の下へ（いちばん下に掛かる顔の下端＋gap から）。下の安全域を越えるなら顔の上へ。
    どちらにも置けなければ None。y の範囲は [ymin, ymax]。
    """
    iv = [(a - gap - bot, b + gap - top) for a, b in spans] + [(a - bot, b - top) for a, b in busy]

    def hit(y):
        return next(((a, b) for a, b in iv if a < y < b), None)

    y = y0
    while (h := hit(y)) is not None:
        y = math.ceil(h[1])
    if ymin <= y <= ymax:
        return int(y), "below"
    y = y0
    while (h := hit(y)) is not None:
        y = math.floor(h[0])
    if ymin <= y <= ymax:
        return int(y), "above"
    return None


def least_y(y0: float, top: float, bot: float, spans: list, busy: list, ymin: float, ymax: float,
            gap: float) -> int:
    """顔を避けきれない行の置き場: 塞がった帯には掛けず、顔との重なり（コマごとの重なった高さの和）が
    いちばん少ない y。同じなら下（顔の下へ、の向き）。置ける所が無ければ y0 のまま。"""
    best = None
    for y in range(math.ceil(ymin), math.floor(ymax) + 1, 2):
        if any(a - bot < y < b - top for a, b in busy):
            continue
        cost = sum(max(0.0, min(b + gap, y + bot) - max(a - gap, y + top)) for a, b in spans)
        if best is None or cost < best[0] or (cost == best[0] and y > best[1]):
            best = (cost, y)
    return int(y0) if best is None else best[1]


def on_face(y: float, top: float, bot: float, spans: list, gap: float) -> bool:
    return any(a - gap - bot < y < b + gap - top for a, b in spans)


def busy_bands(it: dict, p: dict, pad: int = 16) -> list[tuple[float, float]]:
    """行 it が出ている間、字を置けない縦の帯（札（inset）の絵・左上の注）。"""
    out = []
    for c in p["cuts"]:
        ins = c.get("inset")
        if ins and c["at"] < it["to"] and it["from"] < c["at"] + c["frames"]:
            r0 = ins["keys"][0]["rect"] if ins.get("keys") else ins["rect"]
            oh = r0[3] * int(ins.get("w", 840)) / r0[2]
            cyi = int(ins.get("cy", 765))
            out.append((cyi - oh / 2 - pad, cyi + oh / 2 + pad))
    for nt in p.get("notes", []):
        if "h" in nt and nt["from"] < it["to"] and it["from"] < nt["to"]:
            out.append((nt["y"] - pad, nt["y"] + nt["h"] + pad))
    return out


def top_limit(it: dict, p: dict, base: float, pad: int = 24) -> float:
    """行 it の字の上端の限り。題の札が同じ時に出ていれば、その下。"""
    lim = base
    for t in p["titles"]:
        if t["from"] < it["to"] and it["from"] < t["to"] and "h" in t:
            lim = max(lim, t["y"] + t["h"] + pad)
    return lim


def note_move(p: dict, it: dict, kind: str, y0: float, y1: float | None, how: str, spans: list, **kw):
    """顔を避けて動かした（動かせなかった）行を、時間割に残す（報告と品質チェックの手がかり）。"""
    p.setdefault("face_avoid", []).append({
        "kind": kind, "text": it.get("text") or "／".join(it.get("lines", [])), "from": it["from"], "to": it["to"],
        "y_from": round(y0), "y_to": None if y1 is None else round(y1), "how": how,
        "faces": len(spans), "face_y": [round(min(a for a, _ in spans)), round(max(b for _, b in spans))] if spans else None,
        **kw})


def layer_at(ly: dict, f: int, W: int, style: dict):
    """層 ly を f コマ目に重ねる形（Overlay・絵の見分けの鍵・絵）。出ていなければ None。

    テロップは昔からの「ポン」の段（pick）。ほかは様式の anim（textlook.state_at）で、
    出来上がりの絵を真ん中を動かさずに拡大・傾け・ぼかし・薄くし、dx・dy だけずらして置く。
    絵は位置のずれを除いた鍵で覚える（揺れは同じ絵を毎コマ別の所に置くだけ）。
    """
    it = ly["item"]
    if not (it["from"] <= f < it["to"]):
        return None
    cache = ly.setdefault("cache", {})
    if ly["kind"] == "telop":
        k = pick(it, f, len(style["telop"].get("pop", [1.0])))
        key = ("pick", k)
        if key not in cache:
            img = ly["imgs"][k]
            cache[key] = (Overlay(img, (W - img.width) // 2, ly["cy"] - img.height // 2), img)
        return cache[key][0], key, cache[key][1]
    st = TL.state_at(ly.get("anim"), f - it["from"], it["to"] - it["from"], it["from"] == 0, ly.get("seed", 0))
    key = TL.state_key(st)
    if key not in cache:
        imgs = ly.setdefault("img_cache", {})
        lkey = TL.look_key(st)
        if lkey not in imgs:
            blur = (ly.get("anim") or {}).get("sharp_blur_em", 0.10) * ly.get("font_px", 0)
            imgs[lkey] = ly["base"] if lkey == TL.look_key(TL.IDENTITY) else TL.transform(ly["base"], st, blur)
        img = imgs[lkey]
        x = round(ly["cx"] + st["dx"] - img.width / 2)
        y = round(ly["cy"] + st["dy"] - img.height / 2)
        ovs = ly.setdefault("ov_cache", {})
        cache[key] = (Overlay(img, x, y, like=ovs.get(lkey)), img)
        ovs.setdefault(lkey, cache[key][0])
    return cache[key][0], key, cache[key][1]


# ---------------------------------------------------------------- 字の置き場

def layout(p: dict, style: dict, work: Path, faces: list | None = None) -> list[dict]:
    """タイトル・テロップ・字幕の絵を作り、置き場を決める。

    置き場（README の「字の置き場」）:
      上   タイトル（黄色の箱に黒い字）  y=380 から
      間   テロップ（黄色い字に黒の縁）  タイトルの下端と、字幕2行ぶんの上端の、ちょうど間
      中央 字幕（白い字に黒の縁）       中心 y=1000
    3つは縦に重ならない。テロップは同時に1つまで。

    faces（字なしの書き出しのコマごとの顔の箱）を渡すと、字幕と【大】の字は、その行のどのコマかで
    顔に掛かるなら、行ごとに1回だけ顔の下（収まらなければ上）へずらす。顔の無い行は動かさない。
    """
    W, H = p["size"]
    safe = style["safe"]
    af = style.get("avoid_faces") or {}
    out = []
    # 2回呼ばれる（顔を探す前と後）。前の回の効果と記録を持ち越さない
    p["fx"] = []
    p.pop("face_avoid", None)

    def still(kind: str, it: dict, img: Image.Image, anim: dict | None) -> dict:
        """出来上がりの絵を (x, y) に置く層。動きは真ん中を基準にする。"""
        return {"kind": kind, "item": it, "base": img, "imgs": [img], "anim": anim,
                "cx": it["x"] + img.width / 2, "cy": it["y"] + img.height / 2}

    title_bottom = safe["top"]
    for i, it in enumerate(p["titles"]):
        if it.get("look") == "card":
            ti_st = style["title_card"]
            img = title_card_img("\n".join(it["lines"]), ti_st, style)
        else:
            ti_st = style["title"]
            img = card(it["lines"], ti_st, ImageFont.truetype(str(font_path(style, ti_st["font"])), ti_st["size"]))
        top = ti_st["top"]
        path = work / f"title_{i:02d}.png"
        img.save(path)
        it.update({"png": str(path), "x": (W - img.width) // 2, "y": top, "w": img.width, "h": img.height})
        # 全編に出るタイトルだけが、テロップの置き場の上端を決める（4秒で消える札は決めない）
        if it.get("look") != "card":
            title_bottom = max(title_bottom, top + img.height)
        out.append(still("title", it, img, ti_st.get("anim")))

    for i, it in enumerate(p.get("notes", [])):
        st = style["note"]
        img = card([it["text"]], st, ImageFont.truetype(str(font_path(style, st["font"])), st["size"]))
        path = work / f"note_{i:02d}.png"
        img.save(path)
        it.update({"png": str(path), "x": st["x"], "y": st["y"], "w": img.width, "h": img.height})
        out.append(still("note", it, img, st.get("anim")))

    cap_st = style["caption"]
    cap_font = ImageFont.truetype(str(font_path(style, cap_st["font"])), cap_st["size"])
    # 字幕2行ぶんの高さ。テロップの置き場の下端は、字幕が何行でも同じにする（行数で動くと目が迷う）
    two = card(["国国"] * cap_st["max_lines"], cap_st, cap_font)
    cap_top = cap_st["center_y"] - two.height // 2
    def ink_y(img: Image.Image, cy: float) -> int:
        """絵の見える部分（縁まで）の上下の真ん中を cy に置くときの、絵の上端。"""
        bb = img.getbbox() or (0, 0, img.width, img.height)
        return round(cy - (bb[1] + bb[3]) / 2)

    for i, it in enumerate(p["captions"]):
        path = work / f"caption_{i:02d}.png"
        if it.get("big"):
            img, cy, size, anim, ent = big_layout(it, p, style, faces)
            img.save(path)
            it.update({"png": str(path), "x": (W - img.width) // 2, "y": ink_y(img, cy),
                       "w": img.width, "h": img.height, "size": size})
            ly = still("caption", it, img, anim)
            ly.update({"seed": TL.text_seed(it["text"]), "font_px": size})
            if ent.get("speedlines"):
                # 集中線は字ではなく画の効果（字なしの書き出しにも入れる。品質チェックが字の画素と数えない）
                p.setdefault("fx", []).append({"type": "speedlines", "from": it["from"], "to": it["to"],
                                               "seed": TL.text_seed(it["text"]), "cfg": ent["speedlines"]})
            out.append(ly)
            continue
        img = card(it["lines"], cap_st, cap_font, hl=it.get("hl"))
        img.save(path)
        y = ink_y(img, cap_st["center_y"]) if cap_st.get("anchor") == "ink_center" \
            else cap_st["center_y"] - img.height // 2
        if faces is not None:
            # 字の見える箱（縁まで）を [y + top, y + bot] として、顔に掛かるなら行ごとに1回だけ動かす
            x_img = (W - img.width) // 2
            vb = visible_box(img, af.get("alpha_min", 16))
            ymax = safe["bottom"] - vb[3]
            if x_img + vb[2] > safe["right_column_x"]:
                ymax = min(ymax, safe["right_column_from_y"] - vb[3])
            ymin = top_limit(it, p, safe["top"]) - vb[1]
            y2, how, sp, bad = place_off_face(y, vb[1], vb[3], x_img + vb[0], x_img + vb[2], it, faces, af,
                                              busy_bands(it, p), ymin, ymax)
            if how:
                mid = (vb[1] + vb[3]) / 2
                note_move(p, it, "caption", y + mid, y2 + mid, how, sp, **({"unresolved": True} if bad else {}))
                y = y2
        it.update({"png": str(path), "x": (W - img.width) // 2, "y": y, "w": img.width, "h": img.height})
        out.append(still("caption", it, img, cap_st.get("anim")))

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


def level_bgm(x: np.ndarray, cfg: dict) -> tuple[np.ndarray, dict]:
    """BGM のゆっくりした大小（サビ・静かな所）をならす。参考のショートの BGM は 5秒ごとに見て ±1.5dB で一定だった。

    window_s ごとの RMS を、全体の RMS との差だけ逆に動かす（max_db まで）。動かし方は smooth_s でなめらかにする
    （速く動かすと曲の拍で音量が揺れて聞こえる）。行ごとの「声 − BGM」がそろい、いちばん小さい行が上がる。
    """
    hop = SR // 20
    k = len(x) // hop
    if k < 4:
        return x, {}
    m = x[:k * hop].astype(np.float64).mean(axis=1).reshape(k, hop)
    e = (m ** 2).mean(axis=1)
    w = max(1, int(round(cfg.get("window_s", 1.0) * 20)))
    kern = np.ones(w) / w
    e_s = np.convolve(np.pad(e, (w // 2, w - 1 - w // 2), mode="edge"), kern, mode="valid")
    lvl = 10 * np.log10(np.maximum(e_s, 1e-12))
    ref = 10 * np.log10(max(float(e.mean()), 1e-12))
    loud = lvl > ref - 30  # 曲の頭と尻の無音は持ち上げない
    g = np.where(loud, np.clip(ref - lvl, -cfg.get("max_db", 6), cfg.get("max_db", 6)), 0.0)
    s = max(1, int(round(cfg.get("smooth_s", 2.0) * 20)))
    ks = np.ones(s) / s
    g = np.convolve(np.pad(g, (s // 2, s - 1 - s // 2), mode="edge"), ks, mode="valid")
    t_hop = (np.arange(k) + 0.5) * hop
    gs = np.interp(np.arange(len(x)), t_hop, g)
    y = (x * db(gs)[:, None]).astype(np.float32)
    return y, {"window_s": cfg.get("window_s", 1.0), "smooth_s": cfg.get("smooth_s", 2.0),
               "max_db": cfg.get("max_db", 6), "gain_db_range": [round(float(g.min()), 2), round(float(g.max()), 2)]}


def audio_stems(p: dict, style: dict, base: Path, work: Path) -> tuple[Path, Path, Path]:
    """ナレーションの束・ダッキング済みの BGM・元の音（使うカットだけ）を、サンプル単位で作る。

    ダッキングはコンプレッサーに任せず、時間割から音量の折れ線を引く。
    いつ・どれだけ下がるかが指示書から一意に決まり、測って確かめられるから。
    """
    au = audio_cfg(p, style)
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
        if au.get("bgm_level"):
            bgm, lv = level_bgm(bgm, au["bgm_level"])
            p["bgm"]["level"] = lv
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

    def __init__(self, img: Image.Image | None, x: int, y: int, like: "Overlay | None" = None):
        # like: 同じ絵を別の所に置く（揺れ）。整数の配列は 1画素 10バイトあるので、置き場ごとに作り直さない
        if like is not None:
            self.alpha, self.pre, self.inv = like.alpha, like.pre, like.inv
        else:
            a = np.asarray(img, dtype=np.uint16)
            self.alpha = a[:, :, 3:4]
            self.pre = a[:, :, :3] * self.alpha
            self.inv = 255 - self.alpha
        self.x, self.y = x, y
        self.h, self.w = self.alpha.shape[:2]

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

    enc = style["encode"]
    au = audio_cfg(p, style)
    p["audio"] = au
    # 音の仕上げ（一定の音量＋リミッター）。BGM 入りと、BGM 抜き（TikTok 向け）を別々に作る
    p["master"] = {"with_bgm": master([narr_p, bgm_p, src_p], work, "with_bgm", au, enc)}
    if no_bgm_out:
        p["master"]["no_bgm"] = master([narr_p, src_p], work, "no_bgm", au, enc)

    def encode(path: Path, timeline: list[list[Overlay]], keep_args: bool):
        """コマを作って ffmpeg に流す（字の絵は timeline のとおりに重ねる。集中線は字なしでも入れる）。"""
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
            "-map_metadata", "-1", "-movflags", "+faststart", str(path),
        ]
        if keep_args:
            (work / "ffmpeg_args.json").write_text(json.dumps(args, ensure_ascii=False, indent=1))
        enc_proc = subprocess.Popen(args, stdin=subprocess.PIPE)

        # 画の効果（集中線など）。字ではないので、字なしの書き出しにも同じに入れる
        fx_at: list[list[dict]] = [[] for _ in range(p["frames"])]
        for fx in p.get("fx", []):
            for f in range(max(0, fx["from"]), min(p["frames"], fx["to"])):
                fx_at[f].append(fx)

        def frames():
            f = 0
            for c in p["cuts"]:
                for j, img in enumerate(prefetch(decode_cut(c, fps))):
                    frame = frame_of(cv2, img, c, j, W, H)
                    for fx in fx_at[f]:
                        if fx["type"] == "speedlines":
                            Overlay(TL.speedlines(W, H, fx["cfg"], fx["seed"], f - fx["from"]), 0, 0).blend(frame)
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

    af = style.get("avoid_faces") or {}
    if text and af.get("enabled"):
        # 字を顔に被せない（自撮りの画が多い。字を縦のまん中に置くと、顔のど真ん中に乗る）。
        # まず字なしで書き、それを読み直して全コマの顔を探す。品質チェックはこの字なしの版で
        # 顔を探すので、同じ絵で探せば「書き出しは避けたのに、チェックは被っていると言う」が起きない。
        # 字なしの版は work/no_text.mp4（品質チェックが既定で読む所）に置く
        t_face = time.time()
        plate = work / "no_text.mp4"
        encode(plate, [[] for _ in range(p["frames"])], False)
        dets = plate_faces(plate, W, H, af)
        if len(dets) != p["frames"]:
            sys.exit(f"字なしの版から {len(dets)} コマしか読めなかった（{p['frames']} コマのはず）")
        (work / "faces.json").write_text(json.dumps(dets))
        faces = [face_boxes(dets, af), face_boxes(dets, af, strict=True)]
        layers = layout(p, style, work, faces)
        fa = p.get("face_avoid", [])
        p["faces"] = {"plate": str(plate), "frames": len(dets), "frames_with_detection": sum(1 for x in dets if x),
                      "frames_with_face": sum(1 for x in faces[0] if x),
                      "frames_with_face_strict": sum(1 for x in faces[1] if x), "score": af.get("score", 0.5),
                      "seconds": round(time.time() - t_face, 1),
                      "moved": sum(1 for m in fa if not m.get("unresolved")),
                      "unresolved": sum(1 for m in fa if m.get("unresolved"))}
        for m in fa:
            if m.get("unresolved"):
                print(f"顔を避けきれない: {m['kind']}「{m['text']}」{m['from']}〜{m['to']}コマ", file=sys.stderr)

    # コマごとに、重ねる字の絵を引けるようにする（タイトル → テロップ → 字幕 の順に重ねる）
    order = {"title": 0, "note": 1, "telop": 2, "caption": 3}
    timeline: list[list[Overlay]] = [[] for _ in range(p["frames"])]
    p["overlays"] = []
    kind_count: dict[str, int] = {}
    saved: set = set()
    if text:
        for ly in sorted(layers, key=lambda z: order[z["kind"]]):
            it = ly["item"]
            seq = []
            for f in range(max(0, it["from"]), min(p["frames"], it["to"])):
                ov, key, img = layer_at(ly, f, W, style)
                timeline[f].append(ov)
                seq.append((f, key, ov, img))

            # 品質チェックが「重ねた物の全部」を読めるように、コマの範囲ごとに1つずつ書き出す
            # （「ポン」や出入りの動きでは数コマごとに絵が変わるので、絵ごとに1件）
            nth = kind_count.get(ly["kind"], 0)
            kind_count[ly["kind"]] = nth + 1
            names: dict = {}
            k0 = 0
            while k0 < len(seq):
                k1 = k0
                while k1 + 1 < len(seq) and seq[k1 + 1][1] == seq[k0][1]:
                    k1 += 1
                _, key, ov, img = seq[k0]
                # 絵が同じなら（揺れで置き場だけ違う）同じ PNG を指す
                gi = names.setdefault(id(img), len(names))
                png = work / f"ov_{ly['kind']}_{nth:02d}_{gi}.png"
                if (ly["kind"], nth, gi) not in saved:
                    img.save(png)
                    saved.add((ly["kind"], nth, gi))
                o = {"kind": ly["kind"], "png": str(png), "x": ov.x, "y": ov.y, "w": ov.w, "h": ov.h,
                     "from": seq[k0][0], "to": seq[k1][0] + 1, "text": it.get("text") or "／".join(it["lines"])}
                if key not in (_IDENT,) and key[0] != "pick":
                    # 出入りの動き・揺れの途中の絵（大きさ・濃さ・ぼけ・位置が出来上がりと違う）。
                    # 濃さが 1 より小さい絵は、字の画素を「不透明な所」で探す検査には見つからない
                    o["anim"] = dict(zip(("scale", "alpha", "dx", "dy", "rotate", "sharp"), key))
                if "line" in it:
                    o["line"] = it["line"]
                if it.get("big"):
                    o["big"] = it["big"]
                if o.get("anim") and o["anim"]["alpha"] < 0.999:
                    # 薄い途中の絵は、品質チェックが「不透明な画素」で字の位置を探せない（見つからない、と落ちる）。
                    # 別に控える。安全領域は字なしの書き出しとの差（画素）で、薄い字も含めて確かめられる
                    p.setdefault("overlays_anim", []).append(o)
                    k0 = k1 + 1
                    continue
                p["overlays"].append(o)
                if ly["kind"] == "title" and "line" in it:
                    # 題の札はその行の字幕を兼ねる。字幕と声のずれの検査が札を字幕として測れるよう、
                    # 同じ絵・同じ置き場で「その行の字幕」としても書いておく（画面に重ねるのは1回だけ）
                    p["overlays"].append({**o, "kind": "caption", "card": True})
                k0 = k1 + 1
    p["style"] = style
    p["blur_out"] = blur_out(p, W, H)

    encode(out, timeline, True)
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
