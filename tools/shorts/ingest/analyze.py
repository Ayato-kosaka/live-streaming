"""取ったもの1本から、統括が読む材料（文字起こし・コンタクトシート・数値の時系列）を作る。

    python3 tools/shorts/ingest/analyze.py ITEM.json MEDIA_DIR OUT_DIR

ITEM.json は plan.py が作る matrix の1件。MEDIA_DIR は download.py が置いた
`<key>/` の親。OUT_DIR に出来たものを、seal.py が丸ごと暗号化する。

**OUT_DIR の中身は全部、暗号化される側。** ここで作るものはリポジトリに平文では
入らないので、題名・字幕・画を遠慮なく入れてよい。逆に、ログ（標準出力）には
段の名前・状態・秒・個数しか出さない（公開ログ）。

段は1つ落ちても次へ進む（common.Stages）。何が落ちたかは run.json に残り、
manifest.json の `stages` に状態の語だけが出る。
"""

from __future__ import annotations

import json
import os
import platform
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import Stages, hms, now_iso, read_json, write_json  # noqa: E402

# 各 mode の作り。シートは「Read で1枚開いたとき、1コマに何が映っているか分かる」
# 大きさから決めた。Read は長辺 1568px・約115万画素に縮めて見せるので、1枚に
# 20コマ（5×4）なら1コマあたり実効 約180×320、12コマ（4×3）なら約230×410 になる。
# 配信の通し見は 5×4（200秒/枚）、ショートと zoom は字幕も読みたいので 4×3。
# 配信の通しは枚数が多い（3時間半で63枚）ので JPEG を少し強く絞る（1本20MB の目安に収める）。
PLAN = {
    "archive": {"stats_fps": 5, "sheet_fps": 0.1, "long": 384, "grid": (5, 4), "gap": 1.0,
                "q": 74},
    "reference": {"stats_fps": 30, "sheet_fps": 1, "long": 480, "grid": (4, 3), "gap": 0.3,
                  "q": 80},
    "zoom": {"stats_fps": 10, "sheet_fps": None, "long": 480, "grid": (4, 3), "gap": 0.3,
             "q": 80},
}


def src_video(mdir: Path) -> Path | None:
    for ext in (".mkv", ".mp4", ".webm"):
        p = mdir / f"src{ext}"
        if p.exists():
            return p
    return None


# ---------------------------------------------------------------- meta

def _iso(ts):
    if not ts:
        return None
    import datetime as dt
    return dt.datetime.fromtimestamp(int(ts), dt.timezone.utc).isoformat()


def build_meta(it: dict, mdir: Path, out: Path, ctx: dict) -> dict:
    from media import probe

    info = read_json(mdir / "src.info.json", {}) or {}
    fetch = read_json(mdir / "fetch.json", {}) or {}
    src = src_video(mdir)
    pr = probe(src) if src else {}
    v = pr.get("video") or {}
    vfmts = [f for f in info.get("formats") or [] if f.get("vcodec") not in (None, "none")
             and f.get("height")]
    best = max(vfmts, key=lambda f: (f.get("height") or 0) * (f.get("width") or 0), default={})
    w, h = v.get("width") or info.get("width"), v.get("height") or info.get("height")
    meta = {
        "id": info.get("id") or it.get("video"),
        "url": f"https://www.youtube.com/watch?v={it.get('video')}",
        "title": info.get("title"),
        "channel": info.get("channel"), "channel_id": info.get("channel_id"),
        "uploader_id": info.get("uploader_id"),
        "duration": info.get("duration"), "duration_hms": hms(info.get("duration") or 0),
        "upload_date": info.get("upload_date"),
        "timestamp": _iso(info.get("timestamp")),
        "release_timestamp": _iso(info.get("release_timestamp")),
        "live_status": info.get("live_status"), "was_live": info.get("was_live"),
        "view_count": info.get("view_count"), "like_count": info.get("like_count"),
        "comment_count": info.get("comment_count"),
        # **数は取った時刻つきで。** 再生数は日ごとに動くので、時刻の無い数は比べられない
        "counts_fetched_at": fetch.get("finished_at") or fetch.get("started_at"),
        "width": w, "height": h,
        "aspect": None if not (w and h) else ("portrait" if h >= w else "landscape"),
        "fps": v.get("fps") or info.get("fps"),
        "analysed_file": {"codec": v.get("codec"), "width": v.get("width"),
                          "height": v.get("height"), "duration": pr.get("duration"),
                          "bytes": pr.get("bytes"), "format_id": info.get("format_id")},
        "original_max": f"{best.get('width')}x{best.get('height')}" if best else None,
        "categories": info.get("categories"), "tags": info.get("tags"),
        "description": (info.get("description") or "")[:3000],
        "chapters": info.get("chapters"),
        # YouTube の「よく再生された部分」。見どころ探しのいちばん直な手がかり
        "heatmap": info.get("heatmap"),
        "captions_available": {
            "auto_ja": [k for k in (info.get("automatic_captions") or {}) if k.startswith("ja")],
            "manual_ja": [k for k in (info.get("subtitles") or {}) if k.startswith("ja")],
        },
        "yt_dlp_version": fetch.get("yt_dlp_version"),
        "client": (fetch.get("tries") or [{}])[-1].get("client"),
    }
    if it["mode"] == "zoom":
        s, e = it["range"]
        meta.update(range=[s, e], range_hms=[hms(s), hms(e)], zoom_fps=it["fps"])
    write_json(out / "meta.json", meta)
    ctx["meta"] = meta
    return {"heatmap": bool(meta["heatmap"])}


# ---------------------------------------------------------------- captions

def parse_json3(path: Path) -> list[dict]:
    """YouTube の json3。自動字幕は1語ずつの `segs` に時刻のずれ（tOffsetMs）がつく。

    自動字幕は2行で流れるので、表示の長さ（dDurationMs）は次の行と重なる。
    重なりは次の行の頭で切る。改行だけの `aAppend` の行は捨てる。
    """
    d = json.loads(path.read_text(encoding="utf-8"))
    evs = [e for e in d.get("events") or [] if e.get("segs")]
    rows = []
    for e in evs:
        txt = "".join(s.get("utf8", "") for s in e["segs"]).replace("\n", " ").strip()
        if not txt:
            continue
        st = e.get("tStartMs", 0) / 1000
        rows.append({"start": round(st, 2), "end": round(st + e.get("dDurationMs", 0) / 1000, 2),
                     "text": txt,
                     "words": [{"t": round(st + s.get("tOffsetMs", 0) / 1000, 2),
                                "w": s.get("utf8", "")} for s in e["segs"]
                               if s.get("utf8", "").strip()]})
    for a, b in zip(rows, rows[1:]):
        if b["start"] > a["start"]:
            a["end"] = min(a["end"], b["start"])
    return rows


VTT_TIME = re.compile(r"(\d+):(\d\d):(\d\d)\.(\d+)\s+-->\s+(\d+):(\d\d):(\d\d)\.(\d+)")


def parse_vtt(path: Path) -> list[dict]:
    rows, cur, last = [], None, ""
    for line in path.read_text(encoding="utf-8").splitlines():
        m = VTT_TIME.search(line)
        if m:
            g = [int(x) for x in m.groups()]
            cur = {"start": g[0] * 3600 + g[1] * 60 + g[2] + g[3] / 1000,
                   "end": g[4] * 3600 + g[5] * 60 + g[6] + g[7] / 1000, "text": ""}
            rows.append(cur)
        elif cur is not None and line.strip():
            t = re.sub(r"<[^>]+>", "", line).strip()
            # 自動字幕の vtt は前の行をもう一度書いてから足すので、同じ行は捨てる
            if t and t != last:
                cur["text"] = (cur["text"] + " " + t).strip()
                last = t
    return [r for r in rows if r["text"]]


def build_captions(it: dict, mdir: Path, out: Path, ctx: dict) -> dict:
    info = read_json(mdir / "src.info.json", {}) or {}
    pick = None
    for lang in ("ja-orig", "ja"):
        for ext in (".json3", ".vtt"):
            p = mdir / f"src.{lang}{ext}"
            if p.exists():
                pick = (lang, p)
                break
        if pick:
            break
    if not pick:
        auto = [k for k in info.get("automatic_captions") or {} if k.startswith("ja")]
        manual = [k for k in info.get("subtitles") or {} if k.startswith("ja")]
        log = (mdir / "ytdlp.log").read_text(errors="ignore") if (mdir / "ytdlp.log").exists() else ""
        if not auto and not manual:
            why = "この動画には ja の字幕（自動も手動も）が無い"
        elif "429" in log:
            why = "ja の字幕はあるが、取りに行って 429 で断られた"
        else:
            why = "ja の字幕はあるが、取れなかった（logs/ytdlp.log）"
        write_json(out / "captions.json", {"ok": False, "why": why, "segments": []})
        ctx["captions"] = []
        return {"_skip": why}
    lang, p = pick
    rows = parse_json3(p) if p.suffix == ".json3" else parse_vtt(p)
    source = "manual" if lang in (info.get("subtitles") or {}) else "auto"
    write_json(out / "captions.json", {"ok": True, "lang": lang, "source": source,
                                       "format": p.suffix[1:], "segments": rows})
    (out / "captions.txt").write_text(
        "".join(f"[{hms(r['start'])}] {r['text']}\n" for r in rows), encoding="utf-8")
    ctx["captions"] = rows
    return {"segments": len(rows)}


# ---------------------------------------------------------------- audio / video

def build_audio(it: dict, mdir: Path, out: Path, ctx: dict, work: Path) -> dict:
    from media import audio_series, extract_wav, write_csv

    src = src_video(mdir)
    wav = work / "audio16k.wav"
    extract_wav(src, wav)
    ctx["wav"] = wav
    rows, summ = audio_series(src, wav, work)
    write_csv(out / "audio.csv", rows, ["t", "hms", "rms_db", "peak_db", "lufs_m", "lufs_s"])
    ctx["audio"], ctx["audio_summary"] = rows, summ
    return {"seconds": len(rows)}


def build_visual(it: dict, mdir: Path, out: Path, ctx: dict, work: Path) -> dict:
    from media import (detect_cuts, make_sheets, per_second_visual, probe, tile_size,
                       video_pass, write_csv)

    mode = it["mode"]
    pl = PLAN[mode]
    src = src_video(mdir)
    pr = probe(src)
    v = pr.get("video") or {}
    w, h = int(v["width"]), int(v["height"])
    src_fps = float(v.get("fps") or 30)
    stats_fps = min(pl["stats_fps"], max(1.0, round(src_fps)))
    sheet_fps = pl["sheet_fps"] or float(it["fps"])
    tile = tile_size(w, h, pl["long"])
    grid = pl["grid"] if h >= w else (pl["grid"][1], pl["grid"][0])
    offset = float(it["range"][0]) if mode == "zoom" else 0.0
    vp = video_pass(src, work, stats_fps=stats_fps, sheet_fps=sheet_fps, tile=tile)
    cuts = detect_cuts(vp["score"], stats_fps, min_gap=pl["gap"])
    for c in cuts:
        c["t"] = round(c["t"] + offset, 3)
        c["hms"] = hms(c["t"])
    rows = per_second_visual(vp, [dict(c, t=c["t"] - offset) for c in cuts], offset)
    write_csv(out / "visual.csv", rows,
              ["t", "hms", "motion_mean", "motion_max", "bright", "sat", "score_max", "cut"])
    write_csv(out / "scenes.csv", cuts, ["t", "hms", "score", "ratio"])
    times = [offset + t for t in vp["frame_times"]]
    step = f"{1 / sheet_fps:g}s/frame" if sheet_fps < 1 else f"{sheet_fps:g} fps"
    sheets = make_sheets(vp["frames"], times, out / "sheets", grid=grid, tile=tile,
                         title=f"{it.get('video')} {mode}", step_label=step, quality=pl["q"])
    write_csv(out / "sheets.csv", sheets, ["file", "from_hms", "to_hms", "from", "to", "frames", "bytes"])
    shutil.rmtree(work / "_frames", ignore_errors=True)
    ctx.update(visual=rows, cuts=cuts, sheets=sheets, stats_fps=stats_fps,
               sheet_fps=sheet_fps, tile=tile, grid=grid)
    return {"sheets": len(sheets), "cuts": len(cuts), "frames": len(times)}


# ---------------------------------------------------------------- whisper

def _lang(w: dict):
    lg = (w.get("language") or "ja").strip()
    return None if lg in ("auto", "") else lg


def build_whisper(it: dict, out: Path, ctx: dict) -> dict:
    from asr import to_text, transcribe

    if "wav" not in ctx:
        return {"_skip": "音が無い（audio の段が落ちた）"}
    from media import read_wav

    w = it["whisper"]
    # **道（ファイル名）ではなく波形を渡す。** 道を渡すと faster-whisper が PyAV で
    # 読み直すが、いまの PyAV は faster-whisper 1.2.1 が渡す引数（metadata_errors）を
    # 受け付けず、10秒で落ちた（2026-10-15 run 38743396219）。16kHz に直した wav は
    # もう手元にあるので、こちらで読んで渡せば PyAV を通らない
    audio = read_wav(ctx["wav"]).astype("float32") / 32768.0
    res = transcribe(audio, model=w["model"], language=_lang(w), batch=w["batch"],
                     beam=w["beam"], duration_hint=len(audio) / 16000,
                     label=f"whisper {w['model']}")
    del audio
    write_json(out / "transcript.json", res)
    (out / "transcript.txt").write_text(to_text(res["segments"]), encoding="utf-8")
    ctx["whisper"] = res
    print(f"   whisper: {len(res['segments'])}区間  読み込み {res['load_sec']}秒  "
          f"書き起こし {res['elapsed_sec']}秒  RTF {res['rtf']}", flush=True)
    return {"segments": len(res["segments"]), "rtf": res["rtf"]}


def build_bench(it: dict, out: Path, ctx: dict) -> dict:
    """同じ5分を別のモデルでも書き起こして、かかった時間と中身を並べる。"""
    from asr import to_text, transcribe
    from media import read_wav

    b = it.get("bench")
    if not b or not b.get("models"):
        return {"_skip": "依頼に bench が無い"}
    if "wav" not in ctx:
        return {"_skip": "音が無い"}
    s, e = b["range"]
    x = read_wav(ctx["wav"]).astype("float32") / 32768.0
    clip = x[int(s * 16000):int(e * 16000)]
    w = it["whisper"]
    runs = []
    for m in b["models"]:
        r = transcribe(clip, model=m, language=_lang(w), batch=w["batch"], beam=w["beam"],
                       duration_hint=e - s, label=f"bench {m}")
        runs.append(r)
        print(f"   bench {m}: 読み込み {r['load_sec']}秒  書き起こし {r['elapsed_sec']}秒  "
              f"RTF {r['rtf']}", flush=True)
    main = [sg for sg in (ctx.get("whisper") or {}).get("segments", [])
            if s <= sg["start"] < e]
    caps = [c for c in ctx.get("captions") or [] if s <= c["start"] < e]
    bdir = out / "bench"
    bdir.mkdir(exist_ok=True)
    write_json(bdir / "bench.json", {"range": [s, e], "range_hms": [hms(s), hms(e)],
                                     "main_model": w["model"], "runs": runs})
    md = [f"# 同じ区間（{hms(s)}〜{hms(e)}）の書き起こし比べ", ""]
    md += ["| モデル | 読み込み秒 | 書き起こし秒 | RTF |", "| --- | --- | --- | --- |"]
    wm = ctx.get("whisper") or {}
    if wm:
        md.append(f"| {w['model']}（本番・全体の値） | {wm.get('load_sec')} | "
                  f"{wm.get('elapsed_sec')} | {wm.get('rtf')} |")
    for r in runs:
        md.append(f"| {r['model']} | {r['load_sec']} | {r['elapsed_sec']} | {r['rtf']} |")
    md += ["", f"## 自動字幕（YouTube）", "", "".join(
        f"[{hms(c['start'])}] {c['text']}\n" for c in caps) or "（無し）", "",
           f"## {w['model']}（本番）", "", to_text(main) or "（無し）"]
    for r in runs:
        md += ["", f"## {r['model']}", "", to_text(r["segments"], offset=s) or "（無し）"]
    (bdir / "bench.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    return {"models": [r["model"] for r in runs]}


# ---------------------------------------------------------------- derived

def _heat_at(heat, t):
    for hseg in heat or []:
        if hseg.get("start_time", 0) <= t < hseg.get("end_time", 0):
            return hseg.get("value")
    return None


def build_timeline10(it: dict, out: Path, ctx: dict) -> dict:
    """10秒ごとの要約。コンタクトシートの1コマと同じ刻みなので、並べて読める。"""
    from common import write_csv

    dur = float((ctx.get("meta") or {}).get("duration") or 0)
    vis = ctx.get("visual") or []
    aud = ctx.get("audio") or []
    if not dur:
        dur = max([r["t"] for r in vis] + [r["t"] for r in aud] + [0]) + 1
    nb = int(dur // 10) + 1
    B = [{"t": i * 10, "hms": hms(i * 10), "speech_chars": 0, "caption_chars": 0, "cuts": 0}
         for i in range(nb)]

    def agg(rows, key, fn, name):
        by: dict[int, list] = {}
        for r in rows:
            if r.get(key) is not None:
                by.setdefault(int(r["t"] // 10), []).append(r[key])
        for i, vals in by.items():
            if i < nb:
                B[i][name] = fn(vals)

    agg(vis, "motion_mean", lambda v: round(sum(v) / len(v), 2), "motion_mean")
    agg(vis, "motion_max", lambda v: round(max(v), 2), "motion_max")
    agg(vis, "bright", lambda v: round(sum(v) / len(v), 1), "bright")
    agg(vis, "sat", lambda v: round(sum(v) / len(v), 3), "sat")
    agg(aud, "rms_db", lambda v: round(sum(v) / len(v), 1), "rms_db")
    agg(aud, "lufs_m", lambda v: round(max(v), 1), "lufs_m_max")
    for sg in (ctx.get("whisper") or {}).get("segments", []):
        words = sg.get("words") or []
        if words:
            for wd in words:
                i = int((wd["start"] or sg["start"]) // 10)
                if i < nb:
                    B[i]["speech_chars"] += len(wd["word"].strip())
        else:
            i = int(sg["start"] // 10)
            if i < nb:
                B[i]["speech_chars"] += len(sg["text"])
    for c in ctx.get("captions") or []:
        i = int(c["start"] // 10)
        if i < nb:
            B[i]["caption_chars"] += len(c["text"].replace(" ", ""))
    for c in ctx.get("cuts") or []:
        i = int(c["t"] // 10)
        if i < nb:
            B[i]["cuts"] += 1
    heat = (ctx.get("meta") or {}).get("heatmap")
    for r in B:
        r["heat"] = _heat_at(heat, r["t"] + 5)
    write_csv(out / "timeline10.csv", B,
              ["t", "hms", "motion_mean", "motion_max", "bright", "sat", "rms_db", "lufs_m_max",
               "speech_chars", "caption_chars", "cuts", "heat"])
    return {"rows": len(B)}


def build_structure(it: dict, out: Path, ctx: dict) -> dict:
    """参考ショートの「作り」を数にする。カットの間隔・喋りの密度・頭3秒。"""
    meta = ctx.get("meta") or {}
    dur = float(meta.get("duration") or (meta.get("analysed_file") or {}).get("duration") or 0)
    cuts = [c["t"] for c in ctx.get("cuts") or []]
    bounds = [0.0] + cuts + [dur]
    shots = [round(b - a, 2) for a, b in zip(bounds, bounds[1:]) if b > a]
    shots_sorted = sorted(shots)
    segs = (ctx.get("whisper") or {}).get("segments", [])
    wchars = sum(len(s["text"].replace(" ", "")) for s in segs)
    speech = sum(max(0.0, (s["end"] or 0) - (s["start"] or 0)) for s in segs)
    caps = ctx.get("captions") or []
    cchars = sum(len(c["text"].replace(" ", "")) for c in caps)
    vis = ctx.get("visual") or []
    aud = ctx.get("audio") or []
    head = [r for r in vis if r["t"] < 3]
    headw = sum(len(wd["word"].strip()) for s in segs for wd in s.get("words") or []
                if (wd["start"] or 99) < 3)
    vc, lc = meta.get("view_count"), meta.get("like_count")

    def mean(xs):
        xs = [x for x in xs if x is not None]
        return round(sum(xs) / len(xs), 2) if xs else None

    st = {
        "duration": dur, "aspect": meta.get("aspect"),
        "width": meta.get("width"), "height": meta.get("height"),
        "cuts": {
            "count": len(cuts), "times": cuts,
            "shot_lengths": shots,
            "mean_shot": mean(shots),
            "median_shot": shots_sorted[len(shots_sorted) // 2] if shots_sorted else None,
            "min_shot": min(shots) if shots else None, "max_shot": max(shots) if shots else None,
            "cuts_per_10s": round(len(cuts) / dur * 10, 2) if dur else None,
            "first_cut_at": cuts[0] if cuts else None,
        },
        "speech": {
            "whisper_chars": wchars,
            "whisper_chars_per_sec": round(wchars / dur, 2) if dur else None,
            "speech_sec": round(speech, 1),
            "speech_ratio": round(speech / dur, 3) if dur else None,
            "first_speech_at": segs[0]["start"] if segs else None,
            "captions_chars": cchars,
            "captions_chars_per_sec": round(cchars / dur, 2) if dur and caps else None,
            "captions_source": (read_json(out / "captions.json", {}) or {}).get("source"),
        },
        "audio": dict(ctx.get("audio_summary") or {}),
        "visual": {"motion_mean": mean([r["motion_mean"] for r in vis]),
                   "bright_mean": mean([r["bright"] for r in vis]),
                   "sat_mean": mean([r["sat"] for r in vis])},
        "hook_3s": {"cuts": sum(1 for c in cuts if c < 3), "whisper_chars": headw,
                    "motion_mean": mean([r["motion_mean"] for r in head]),
                    "lufs_m_max": max([r["lufs_m"] for r in aud if r["t"] < 3
                                       and r["lufs_m"] is not None], default=None)},
        "engagement": {"view_count": vc, "like_count": lc,
                       "like_per_view": round(lc / vc, 4) if vc and lc else None,
                       "fetched_at": meta.get("counts_fetched_at"),
                       "upload_date": meta.get("upload_date")},
    }
    write_json(out / "structure.json", st)
    return {"cuts": len(cuts)}


# ---------------------------------------------------------------- channel

def build_channel(it: dict, mdir: Path, out: Path, ctx: dict) -> dict:
    from common import write_csv

    flat = read_json(mdir / "flat.json", {}) or {}
    fetch = read_json(mdir / "fetch.json", {}) or {}
    det = {}
    if (mdir / "details.jsonl").exists():
        for line in (mdir / "details.jsonl").read_text(encoding="utf-8").splitlines():
            try:
                d = json.loads(line)
            except ValueError:
                continue
            if d.get("id"):
                det[d["id"]] = d
    shorts = it["tab"] == "shorts"
    rows = []
    for i, e in enumerate(e for e in flat.get("entries") or [] if e.get("id")):
        d = det.get(e["id"], {})
        rows.append({
            "order": i, "id": e["id"], "title": d.get("title") or e.get("title"),
            "url": (f"https://www.youtube.com/shorts/{e['id']}" if shorts
                    else f"https://www.youtube.com/watch?v={e['id']}"),
            # 一覧の再生数は「12万回」のような丸めた数。詳しく引けたものはそちらを使う
            "view_count": d.get("view_count") or e.get("view_count"),
            "view_count_from": "detail" if d.get("view_count") else "list",
            "like_count": d.get("like_count"), "comment_count": d.get("comment_count"),
            "duration": d.get("duration") or e.get("duration"),
            "upload_date": d.get("upload_date") or e.get("upload_date"),
            "timestamp": _iso(d.get("timestamp") or e.get("timestamp")),
            "date_from": "detail" if d.get("upload_date") else (
                "approx" if e.get("timestamp") or e.get("upload_date") else None),
            "detail": bool(d),
        })
    for rank, r in enumerate(sorted(rows, key=lambda r: -(r["view_count"] or 0)), 1):
        r["rank_views"] = rank
    ch = {"input": it["channel"], "id": flat.get("channel_id") or flat.get("id"),
          "name": flat.get("channel") or flat.get("uploader"),
          "handle": flat.get("uploader_id"), "url": flat.get("channel_url") or flat.get("webpage_url"),
          "follower_count": flat.get("channel_follower_count"), "tab": it["tab"],
          "playlist_title": flat.get("title")}
    write_json(out / "channel.json", {
        "channel": ch, "fetched_at": fetch.get("finished_at"), "limit": it["limit"],
        "count": len(rows), "details_count": sum(1 for r in rows if r["detail"]),
        "details_stopped": (fetch.get("tries") or [{}])[-1].get("details_stopped"),
        "yt_dlp_version": fetch.get("yt_dlp_version"), "entries": rows})
    write_csv(out / "channel.csv", sorted(rows, key=lambda r: r["rank_views"]),
              ["rank_views", "id", "title", "view_count", "view_count_from", "like_count",
               "comment_count", "duration", "upload_date", "date_from", "order", "url"])
    return {"entries": len(rows), "details": sum(1 for r in rows if r["detail"])}


# ---------------------------------------------------------------- index / run

FILES = {
    "meta.json": "題名・チャンネル・長さ・公開日時・再生数/高評価数（`counts_fetched_at` の時点）・"
                 "縦横・fps・yt-dlp の版・`heatmap`（YouTube の「よく再生された部分」。"
                 "start_time / end_time / value。無い動画もある）・chapters",
    "captions.json": "YouTube の字幕（ja）。`source` が auto（自動）か manual（手動）。"
                     "`segments[]` = start / end / text / words[t, w]。取れなかったら `ok:false` と `why`",
    "captions.txt": "上を `[H:MM:SS] 文` の1行ずつにしたもの（読む用）",
    "transcript.json": "faster-whisper。`segments[]` = start / end / text / avg_logprob / "
                       "no_speech_prob / compression_ratio / words[start, end, word, p]。"
                       "頭に model・かかった秒（load_sec / elapsed_sec）・RTF",
    "transcript.txt": "上を `[H:MM:SS] 文` の1行ずつにしたもの（読む用）",
    "sheets/NNNN.jpg": "コンタクトシート。各コマの下の帯がそのコマの時刻（H:MM:SS）。"
                       "見出しに範囲と刻み",
    "sheets.csv": "file / from_hms / to_hms / from / to（秒）/ frames / bytes",
    "scenes.csv": "場面の変わりめ。t（秒）/ hms / score（HSV の差の平均。0〜255）/ "
                  "ratio（前後2コマの平均の何倍跳ねたか。3以上を変わりめとした）",
    "visual.csv": "1秒ごと。motion_mean / motion_max（隣のコマとの明るさの差の平均。0〜255。"
                  "大きいほど画が動いている）/ bright（明るさ 0〜255）/ sat（彩度 0〜1）/ "
                  "score_max（その秒の場面の変わりめの点数の最大）/ cut（その秒の変わりめの数）",
    "audio.csv": "1秒ごと。rms_db / peak_db（dBFS。0 が最大）/ lufs_m（その秒の momentary "
                 "ラウドネスの最大。LUFS）/ lufs_s（short-term。3秒窓）",
    "timeline10.csv": "10秒ごとの要約（シートの1コマと同じ刻み）。motion / bright / sat / rms_db / "
                      "lufs_m_max / speech_chars（whisper の字数）/ caption_chars（自動字幕の字数）/ "
                      "cuts / heat（よく再生された度合い 0〜1。無ければ空）",
    "structure.json": "ショートの作り。cuts（数・時刻・ショットの長さ）/ speech（字数/秒・喋っている割合・"
                      "最初に喋る時刻）/ audio / visual / hook_3s（頭3秒）/ engagement（再生数・"
                      "高評価・取った時刻）",
    "bench/bench.md": "同じ区間を別のモデルで書き起こした比べ（かかった秒と中身）",
    "channel.json": "チャンネルの一覧。channel（名前・ID・登録者数）/ fetched_at / entries[]"
                    "（order＝タブでの並び。0 が新しい / id / title / url / view_count / "
                    "view_count_from（detail＝1本ずつ引いた正確な数、list＝一覧の丸めた数）/ "
                    "like_count / duration / upload_date / date_from / rank_views）",
    "channel.csv": "上を再生数の多い順に並べた表",
    "run.json": "段ごとのかかった秒・成否・落ちた理由、道具の版、ランナー",
    "logs/": "yt-dlp と ffmpeg のログ（落ちたときに見る）",
}


def write_index(it: dict, out: Path, ctx: dict, stages: Stages) -> None:
    present = []
    for name, desc in FILES.items():
        p = out / name.split("/")[0] if "/" in name else out / name
        if p.exists():
            present.append(f"- `{name}` — {desc}")
    meta = ctx.get("meta") or {}
    who, sub = it.get("video") or it.get("channel"), it["dir"]
    head = [f"# {who} / {sub}", ""]
    if meta.get("title"):
        head += [f"- 題名: {meta['title']}", f"- チャンネル: {meta.get('channel')}",
                 f"- 長さ: {meta.get('duration_hms')}  縦横: {meta.get('width')}x{meta.get('height')}",
                 f"- 再生数: {meta.get('view_count')}（{meta.get('counts_fetched_at')} 時点）", ""]
    head += ["## 段", "", "| 段 | 状態 | 秒 |", "| --- | --- | --- |"]
    head += [f"| {r['stage']} | {r['status']} | {r['sec']} |" for r in stages.rows]
    head += ["", "## ファイル", ""] + present + [""]
    (out / "index.md").write_text("\n".join(head), encoding="utf-8")


def versions() -> dict:
    v = {"python": platform.python_version()}
    for mod in ("faster_whisper", "ctranslate2", "numpy", "PIL"):
        try:
            v[mod] = __import__(mod).__version__
        except Exception:  # noqa: BLE001
            pass
    try:
        v["ffmpeg"] = subprocess.run(["ffmpeg", "-version"], capture_output=True,
                                     text=True).stdout.split("\n")[0][:60]
    except OSError:
        pass
    return v


def main() -> int:
    it = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    media, out = Path(sys.argv[2]), Path(sys.argv[3])
    mdir = media / it["key"]
    out.mkdir(parents=True, exist_ok=True)
    work = Path(os.environ.get("RUNNER_TEMP", "/tmp")) / f"shorts-work-{it['key']}"
    work.mkdir(parents=True, exist_ok=True)
    st = Stages()
    ctx: dict = {}
    fetch = read_json(mdir / "fetch.json")
    mode = it["mode"]
    t0 = time.time()

    if not fetch:
        st.rows.append({"stage": "download", "status": "failed", "sec": 0,
                        "error": "取ったものがキャッシュに無い（fetch の job が落ちたか、"
                                 "キャッシュの受け渡しに失敗）"})
    else:
        st.rows.append({"stage": "download", "status": "ok" if fetch.get("ok") else "failed",
                        "sec": fetch.get("sec", 0), "error": fetch.get("why"),
                        "tries": fetch.get("tries")})

    if fetch and fetch.get("ok"):
        if mode == "channel":
            st.run("channel", build_channel, it, mdir, out, ctx)
        else:
            st.run("meta", build_meta, it, mdir, out, ctx)
            if mode in ("archive", "reference"):
                st.run("captions", build_captions, it, mdir, out, ctx)
                st.run("audio", build_audio, it, mdir, out, ctx, work)
            st.run("visual", build_visual, it, mdir, out, ctx, work)
            if mode in ("archive", "reference"):
                st.run("whisper", build_whisper, it, out, ctx)
            if mode == "archive":
                st.run("bench", build_bench, it, out, ctx)
                st.run("timeline10", build_timeline10, it, out, ctx)
            if mode == "reference":
                st.run("structure", build_structure, it, out, ctx)

    logs = out / "logs"
    logs.mkdir(exist_ok=True)
    if (mdir / "ytdlp.log").exists():
        shutil.copy(mdir / "ytdlp.log", logs / "ytdlp.log")
    fv = work / "_ffmpeg_video.log"
    if fv.exists():
        # showinfo の1コマ1行（時刻を拾うためのもの）は落とす。3時間半で 1MB を超える
        (logs / "ffmpeg_video.log").write_text("".join(
            ln for ln in fv.read_text(errors="ignore").splitlines(keepends=True)
            if "Parsed_showinfo" not in ln), encoding="utf-8")
    write_index(it, out, ctx, st)
    item_public = {k: v for k, v in it.items() if k != "pubkey"}
    files = sorted(str(p.relative_to(out)) for p in out.rglob("*") if p.is_file())
    write_json(out / "run.json", {
        "item": item_public, "created_at": now_iso(), "total_sec": round(time.time() - t0, 1),
        "stages": st.rows, "versions": versions(),
        "runner": {"cpus": os.cpu_count(), "run": os.environ.get("RUN_URL")},
        "files": files,
    })
    status = st.status()
    write_json(Path(os.environ.get("RUNNER_TEMP", "/tmp")) / f"stages-{it['key']}.json", {
        "stages": status,
        "counts": {"sheets": len(ctx.get("sheets") or []),
                   "caption_segments": len(ctx.get("captions") or []),
                   "transcript_segments": len((ctx.get("whisper") or {}).get("segments", [])),
                   "cuts": len(ctx.get("cuts") or []),
                   "channel_entries": len((read_json(out / "channel.json", {}) or {})
                                          .get("entries", []))},
    })
    shutil.rmtree(work, ignore_errors=True)
    bad = [k for k, v in status.items() if v == "failed"]
    print(f"\n段: {status}", flush=True)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
