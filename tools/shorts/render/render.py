#!/usr/bin/env python3
"""編集指示書（JSON）1つから、縦型ショート（1080x1920）を ffmpeg で書き出す。

    python3 tools/shorts/render/render.py edit.json --out out.mp4 [--work DIR]

## なぜ ffmpeg を直に叩くか

GitHub Actions の ubuntu ランナー（GPU なし・4コア）で、毎回同じ結果を
速く出せるのがこれだけだったから（README.md の比較表）。ブラウザを起こす
道具（Remotion・OpenChatCut）は同じ指示書から同じ見た目を出せるが、
30秒の書き出しに数倍かかる。

## 何が「正」か

- **カットは元素材のフレーム番号で持つ**（`in` は含む、`out` は含まない）。
  秒で持つと 29.97 と 30 の丸めで1コマずれる。
- **字幕はナレーションの音声ファイルの長さから決める。** 行ごとに音声を作り、
  その長さぶんだけ字幕を出す。だから字幕とナレーションは同じフレームで始まる。
- **できあがりの時間割（plan.json）を work に書き出す。** 人が直す画面・
  ほかの書き出し先（CapCut の下書きなど）は、この plan.json を読む。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import shutil
import subprocess
import sys
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


def probe(path: Path) -> dict:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
         "stream=width,height,r_frame_rate", "-of", "json", str(path)],
        check=True, capture_output=True, text=True).stdout
    s = json.loads(out)["streams"][0]
    num, den = s["r_frame_rate"].split("/")
    return {"w": int(s["width"]), "h": int(s["height"]), "fps": int(num) / int(den)}


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


# ---------------------------------------------------------------- ナレーション

# 声の後処理。前後の無音を詰め（字幕の出だしが声より先に出ないように）、80Hz より下を落とす
# （open_jtalk の声は 70Hz 以下にも -28dB ほど鳴っていて、BGM の低音と混ざる。声には要らない帯）
NARR_FILTER = ("highpass=f=80,highpass=f=80,"
               "silenceremove=start_periods=1:start_threshold=-45dB,areverse,"
               "silenceremove=start_periods=1:start_threshold=-45dB,areverse")


def synth(line: dict, narr: dict, work: Path) -> Path:
    """1行ぶんのナレーションを作る。文字と声の設定が同じなら作り直さない。

    本番は Fish Audio（別担当が調査中）。差し替えるときはここだけ替える。
    `file` が書いてあれば、それをそのまま使う（人が録った声など）。
    """
    if line.get("file"):
        return Path(line["file"])
    engine = narr.get("engine", "open_jtalk")
    speed = narr.get("speed", 1.0)
    key = hashlib.sha256(f"{engine}|{speed}|{line['text']}|{NARR_FILTER}".encode()).hexdigest()[:16]
    out = work / "narration" / f"{key}.wav"
    if out.exists():
        return out
    out.parent.mkdir(parents=True, exist_ok=True)
    if engine != "open_jtalk":
        sys.exit(f"未対応のナレーション: {engine}")
    txt = out.with_suffix(".txt")
    txt.write_text(line["text"])
    raw = out.with_suffix(".raw.wav")
    sh(["open_jtalk", "-m", JTALK_VOICE, "-x", JTALK_DIC, "-r", str(speed), "-ow", str(raw), str(txt)])
    sh(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(raw), "-af", NARR_FILTER,
        "-ar", str(SR), "-ac", "1", str(out)])
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


def decode_audio(path: Path, channels: int = 2) -> np.ndarray:
    raw = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path), "-f", "f32le",
         "-ac", str(channels), "-ar", str(SR), "-"], check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype="<f4").reshape(-1, channels).copy()


# ---------------------------------------------------------------- 文字の折り返し

def chunks_of(para: str) -> list[str]:
    try:
        import budoux
        return budoux.load_default_japanese_parser().parse(para)
    except ImportError:
        return list(para)


def balanced2(chunks: list[str], font: ImageFont.FreeTypeFont, max_px: int) -> list[str] | None:
    """2行に割れるなら、2行の幅が揃う区切りを選ぶ。「、」の後ろで割れるならそこを優先。

    前から詰めるだけだと「一台目は、親切な／おっちゃん」になる。読む人は
    意味の切れ目で目を戻すので「一台目は、／親切なおっちゃん」のほうが速く読める。
    """
    best = None
    for k in range(1, len(chunks)):
        a, b = "".join(chunks[:k]).rstrip("、。"), "".join(chunks[k:]).rstrip("、。")
        wa, wb = font.getlength(a), font.getlength(b)
        if wa > max_px or wb > max_px:
            continue
        score = max(wa, wb) - (font.size * 3 if chunks[k - 1].endswith("、") else 0)
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


# ---------------------------------------------------------------- テロップの絵

def hex_rgba(h: str, alpha: float = 1.0) -> tuple:
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), round(alpha * 255))


def card(lines: list[str], st: dict, font: ImageFont.FreeTypeFont) -> Image.Image:
    """角丸の箱に、行ごとに中央揃えで字を置いた絵（RGBA、箱ぶんの大きさ）。"""
    stroke = st.get("stroke", 0)
    asc, desc = font.getmetrics()
    line_h = asc + desc
    widths = [font.getlength(ln) for ln in lines]
    w = math.ceil(max(widths)) + 2 * st["pad_x"] + 2 * stroke
    h = len(lines) * line_h + (len(lines) - 1) * st["line_gap"] + 2 * st["pad_y"] + 2 * stroke
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=st["radius"],
                        fill=hex_rgba(st["bg"], st.get("bg_alpha", 1.0)))
    y = st["pad_y"] + stroke
    for ln in lines:
        d.text((w / 2, y + line_h / 2), ln, font=font, anchor="mm", fill=hex_rgba(st["color"]),
               stroke_width=stroke, stroke_fill=hex_rgba(st.get("stroke_color", "#000000")))
        y += line_h + st["line_gap"]
    return img


# ---------------------------------------------------------------- 時間割

def plan(edit: dict, style: dict, base: Path, work: Path) -> dict:
    fps = style["canvas"]["fps"]
    spf = SR // fps  # 1コマあたりのサンプル数（48000/30 = 1600）
    cuts, t = [], 0
    for c in edit["cuts"]:
        src = (base / edit["sources"][c["src"]]["path"]).resolve()
        n = c["out"] - c["in"]
        if n <= 0:
            sys.exit(f"カットの長さが 0 以下: {c}")
        meta = probe(src)
        if abs(meta["fps"] - fps) > 1e-6:
            sys.exit(f"元素材のフレームレートが {meta['fps']}（{fps} 以外はまだ扱わない）: {src}")
        cuts.append({**c, "path": str(src), "w": meta["w"], "h": meta["h"],
                     "at": t, "frames": n, "fit": c.get("fit", "cover")})
        t += n
    total = t

    narr = edit.get("narration", {})
    cap_st = style["caption"]
    cap_font = ImageFont.truetype(str(font_path(style, cap_st["font"])), cap_st["size"])
    inner = cap_st["max_width"] - 2 * cap_st["pad_x"] - 2 * cap_st.get("stroke", 0)
    lines, captions = [], []
    starts = [ln["at"] for ln in narr.get("lines", [])] + [total]
    for i, ln in enumerate(narr.get("lines", [])):
        wav = synth(ln, narr, work)
        samples = len(decode_audio(wav, 1))
        frames = math.ceil(samples / spf)
        lines.append({"at": ln["at"], "frames": frames, "file": str(wav), "text": ln["text"]})
        text = ln.get("caption", ln["text"])
        if text == "":
            continue
        rows = wrap(text, cap_font, inner)
        pages = [rows[k:k + cap_st["max_lines"]] for k in range(0, len(rows), cap_st["max_lines"])]
        end = min(ln["at"] + frames + cap_st.get("hold_frames", 0), starts[i + 1], total)
        span = end - ln["at"]
        weights = [sum(len(r) for r in p) for p in pages]
        acc = ln["at"]
        for k, p in enumerate(pages):
            f1 = end if k == len(pages) - 1 else acc + round(span * weights[k] / sum(weights))
            # line: 何行目のナレーションの字幕か（人が直す画面で、直した字幕を指示書のどこに戻すか）
            captions.append({"from": acc, "to": f1, "lines": p, "line": i})
            acc = f1

    title = edit.get("title")
    titles = []
    if title:
        ti_st = style["title"]
        ti_font = ImageFont.truetype(str(font_path(style, ti_st["font"])), ti_st["size"])
        rows = wrap(title["text"], ti_font, ti_st["max_width"] - 2 * ti_st["pad_x"])
        if len(rows) > ti_st["max_lines"]:
            print(f"注意: タイトルが {len(rows)} 行（上限 {ti_st['max_lines']}）", file=sys.stderr)
        titles.append({"from": title.get("from", 0), "to": title.get("to") or total, "lines": rows})

    return {"fps": fps, "size": [style["canvas"]["width"], style["canvas"]["height"]],
            "frames": total, "cuts": cuts, "narration": lines, "captions": captions,
            "titles": titles, "bgm": edit.get("bgm")}


# ---------------------------------------------------------------- 音

def audio_stems(p: dict, style: dict, base: Path, work: Path) -> tuple[Path, Path]:
    """ナレーションの束と、ダッキング済みの BGM を、サンプル単位で作る。

    ダッキングはコンプレッサーに任せず、時間割から音量の折れ線を引く。
    いつ・どれだけ下がるかが指示書から一意に決まり、測って確かめられるから。
    """
    au = style["audio"]
    spf = SR // p["fps"]
    n = p["frames"] * spf
    narr = np.zeros((n, 2), dtype=np.float32)
    # 声の大きさは「話している間の RMS」で揃える。TTS の版や話者が変わっても
    # 仕上がりの音量が動かないように、ファイルの音量ではなく目標値から決める。
    clips = [decode_audio(Path(ln["file"]), 1)[:, 0] for ln in p["narration"]]
    if clips:
        cat = np.concatenate(clips)
        g_n = db(au["narration_rms_dbfs"]) / max(float(np.sqrt(np.mean(cat.astype(np.float64) ** 2))), 1e-9)
    for i, (ln, x) in enumerate(zip(p["narration"], clips)):
        x = x * g_n
        # 音量を揃えた1行ぶんも残す（Remotion・CapCut の下書きなど、ほかの書き出し先が使う）
        ln["norm_file"] = str(write_wav(x[:, None], work / f"narr_norm_{i:02d}.wav"))
        s = ln["at"] * spf
        e = min(n, s + len(x))
        narr[s:e, 0] += x[: e - s]
        narr[s:e, 1] += x[: e - s]

    bgm = np.zeros((n, 2), dtype=np.float32)
    if p.get("bgm"):
        src = decode_audio((base / p["bgm"]["path"]).resolve(), 2)
        reps = math.ceil(n / len(src))
        bgm = np.tile(src, (reps, 1))[:n] if reps > 1 else src[:n].copy()
        if len(bgm) < n:
            bgm = np.vstack([bgm, np.zeros((n - len(bgm), 2), dtype=np.float32)])
        t = np.arange(n) / SR
        rms = max(float(np.sqrt(np.mean(bgm.astype(np.float64) ** 2))), 1e-9)
        base_g = db(au["bgm_rms_dbfs"] + p["bgm"].get("db", 0)) / rms
        low_g = base_g * db(au["duck_db"])
        p["bgm"]["norm_file"] = str(write_wav(bgm * base_g, work / "bgm_norm.wav"))
        p["bgm"]["duck_db"] = au["duck_db"]
        p["bgm"]["attack_s"] = au["attack_s"]
        p["bgm"]["release_s"] = au["release_s"]
        p["bgm"]["fade_out_s"] = au.get("bgm_fade_out_s", 0)
        g = np.full(n, base_g, dtype=np.float64)
        for ln in p["narration"]:
            s = ln["at"] / p["fps"]
            e = (ln["at"] + ln["frames"]) / p["fps"]
            a, r = au["attack_s"], au["release_s"]
            # s-a で下がり始めて s で底、e で上がり始めて e+r で戻る
            k = np.clip(np.maximum((s - t) / a, (t - e) / r), 0, 1)
            g = np.minimum(g, low_g + (base_g - low_g) * k)
        fo = au.get("bgm_fade_out_s", 0)
        if fo:
            g *= np.clip((n / SR - t) / fo, 0, 1)
        bgm = (bgm * g[:, None]).astype(np.float32)

    narr_p = work / "stem_narration.f32"
    bgm_p = work / "stem_bgm.f32"
    narr.astype("<f4").tofile(narr_p)
    bgm.astype("<f4").tofile(bgm_p)
    return narr_p, bgm_p


# ---------------------------------------------------------------- 映像

def fit_chain(c: dict, W: int, H: int, label_in: str, label_out: str, k: int) -> str:
    """元素材を 1080x1920 に収める。cover は切り抜き、blur は全体＋ぼかした背景。"""
    w, h = c["w"], c["h"]
    if c["fit"] == "cover":
        s = max(W / w, H / h)
        sw, sh_ = 2 * math.ceil(w * s / 2), 2 * math.ceil(h * s / 2)
        x = round((sw - W) * c.get("focus_x", 0.5))
        y = round((sh_ - H) * c.get("focus_y", 0.5))
        return f"[{label_in}]scale={sw}:{sh_}:flags=bicubic,crop={W}:{H}:{x}:{y}[{label_out}]"
    if c["fit"] == "blur":
        s = max(W / w, H / h)
        sw, sh_ = 2 * math.ceil(w * s / 2), 2 * math.ceil(h * s / 2)
        s2 = min(W / w, H / h)
        fw, fh = 2 * round(w * s2 / 2), 2 * round(h * s2 / 2)
        return (f"[{label_in}]split=2[bg{k}][fg{k}];"
                f"[bg{k}]scale={sw}:{sh_}:flags=bicubic,crop={W}:{H},gblur=sigma=40,"
                f"eq=brightness=-0.10[bgb{k}];"
                f"[fg{k}]scale={fw}:{fh}:flags=bicubic[fgs{k}];"
                f"[bgb{k}][fgs{k}]overlay=({W}-w)/2:({H}-h)/2[{label_out}]")
    sys.exit(f"未対応の fit: {c['fit']}")


def render(edit_path: Path, out: Path, work: Path) -> dict:
    t0 = time.time()
    edit, style, base = load(edit_path)
    work = work.resolve()  # plan.json に書くパスは、どこから読んでも同じ所を指すように
    work.mkdir(parents=True, exist_ok=True)
    p = plan(edit, style, base, work)
    fps = p["fps"]
    W, H = p["size"]
    spf = SR // fps
    narr_p, bgm_p = audio_stems(p, style, base, work)

    # テロップの絵
    overlays = []
    for kind, items in (("title", p["titles"]), ("caption", p["captions"])):
        st = style[kind]
        font = ImageFont.truetype(str(font_path(style, st["font"])), st["size"])
        for i, it in enumerate(items):
            img = card(it["lines"], st, font)
            path = work / f"{kind}_{i:02d}.png"
            img.save(path)
            if kind == "title":
                x, y = (W - img.width) // 2, st["top"]
            else:
                x, y = (W - img.width) // 2, st["center_y"] - img.height // 2
            it.update({"png": str(path), "x": x, "y": y, "w": img.width, "h": img.height})
            overlays.append(it)

    args = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y"]
    fc = []
    for k, c in enumerate(p["cuts"]):
        # 入力側で手前の整数秒まで飛ばす（長い配信でも頭から読まない）。
        # 飛ばした先からの相対で、半コマずらした時刻で切る（丸めで隣のコマを拾わない）。
        ss = max(0, math.floor(c["in"] / fps) - 1)
        args += ["-ss", str(ss), "-i", c["path"]]
        rel_in, rel_out = c["in"] - ss * fps, c["out"] - ss * fps
        fc.append(f"[{k}:v]trim=start={(rel_in - 0.5) / fps:.6f}:end={(rel_out - 0.5) / fps:.6f},"
                  f"setpts=PTS-STARTPTS[t{k}]")
        fc.append(fit_chain(c, W, H, f"t{k}", f"f{k}", k))
        fc.append(f"[f{k}]setsar=1,format=yuv420p[v{k}]")
        n = c["frames"] * spf
        fc.append(f"[{k}:a]aresample={SR},atrim=start_sample={rel_in * spf}:end_sample={rel_out * spf},"
                  f"asetpts=PTS-STARTPTS,apad=whole_len={n},atrim=end_sample={n},"
                  f"aformat=sample_fmts=fltp:channel_layouts=stereo[a{k}]")
    K = len(p["cuts"])
    fc.append("".join(f"[v{k}][a{k}]" for k in range(K)) + f"concat=n={K}:v=1:a=1[vc][ac]")
    ni = K
    args += ["-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", str(narr_p)]
    args += ["-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", str(bgm_p)]
    cur = "vc"
    for j, ov in enumerate(overlays):
        args += ["-i", ov["png"]]
        idx = K + 2 + j
        nxt = f"o{j}"
        fc.append(f"[{cur}][{idx}:v]overlay={ov['x']}:{ov['y']}:"
                  f"enable='between(n,{ov['from']},{ov['to'] - 1})'[{nxt}]")
        cur = nxt
    fc.append(f"[{cur}]format=yuv420p[vout]")
    au = style["audio"]
    fc.append(f"[ac]volume={au['source_db']}dB[as]")
    fc.append(f"[as][{ni}:a][{ni + 1}:a]amix=inputs=3:normalize=0:duration=first,"
              f"alimiter=limit=0.89:level=false:latency=1[aout]")
    enc = style["encode"]
    args += [
        "-filter_complex", ";".join(fc), "-map", "[vout]", "-map", "[aout]",
        "-frames:v", str(p["frames"]), "-r", str(fps),
        "-c:v", "libx264", "-preset", enc["preset"], "-crf", str(enc["crf"]),
        "-profile:v", "high", "-pix_fmt", "yuv420p", "-threads", "4",
        # x264 をコマ単位で並列にすると、箱が混んでいるときだけ別のバイト列が出た
        # （同時に3本回して1本だけ違った。filtergraph の出力は3本とも同じ）。
        # スライス単位の並列は混んでいても3本とも同じだった。遅くなる（27秒→45秒）が、
        # 「同じ指示書から同じ動画」を取る。
        "-x264-params", "sliced-threads=1",
        "-c:a", "aac", "-b:a", enc["audio_bitrate"], "-ar", str(SR),
        # 同じ指示書から同じバイト列を出すため、版や日時を書き込ませない
        "-fflags", "+bitexact", "-flags:v", "+bitexact", "-flags:a", "+bitexact",
        "-map_metadata", "-1", "-movflags", "+faststart", str(out),
    ]
    (work / "ffmpeg_args.json").write_text(json.dumps(args, ensure_ascii=False, indent=1))
    sh(args)
    p["render_seconds"] = round(time.time() - t0, 2)
    (work / "plan.json").write_text(json.dumps(p, ensure_ascii=False, indent=1))
    return p


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("edit", type=Path)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--work", type=Path, help="途中のファイル（既定: 出力の横に <名前>.work）")
    a = ap.parse_args()
    for tool in ("ffmpeg", "ffprobe"):
        if not shutil.which(tool):
            sys.exit(f"{tool} が無い")
    work = a.work or a.out.with_suffix(".work")
    p = render(a.edit, a.out, work)
    print(json.dumps({"out": str(a.out), "frames": p["frames"], "seconds": p["frames"] / p["fps"],
                      "captions": len(p["captions"]), "render_seconds": p["render_seconds"]},
                     ensure_ascii=False))


if __name__ == "__main__":
    main()
