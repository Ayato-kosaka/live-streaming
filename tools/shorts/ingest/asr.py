"""faster-whisper で文字起こしする（日本語・単語ごとの時刻つき）。

## 既定が large-v3-turbo・int8・まとめて8本なのは

Actions のランナーは 4 vCPU / 16GB で GPU が無い。large-v3 は decoder が32層あり、
CPU だと1時間43分に2時間近くかかる見込みになる。turbo は encoder が同じで
decoder が4層なので、精度をほぼ落とさずに decoder の手間がほぼ消える。
`BatchedInferencePipeline` は VAD で区切った30秒の塊を8本ずつまとめて encoder に
通すので、CPU でも行列演算の効率が上がる。

## `condition_on_previous_text=False`

配信は BGM・雑踏・無音が長い。前の文を手がかりにさせると、1回の聞き違いが
同じ句の繰り返し（「ご視聴ありがとうございました」が20回、など）に育つ。

**文字起こしの中身はログに出さない。** 出すのは進み具合（何%・どこまで・何秒）だけ。
"""

from __future__ import annotations

import gc
import os
import time

from common import hms


def _r(x, n=2):
    return None if x is None else round(float(x), n)


def transcribe(audio, *, model: str, language: str | None, batch: int, beam: int,
               duration_hint: float = 0.0, label: str = "whisper") -> dict:
    from faster_whisper import BatchedInferencePipeline, WhisperModel

    threads = os.cpu_count() or 4
    t0 = time.time()
    m = WhisperModel(model, device="cpu", compute_type="int8", cpu_threads=threads)
    load_sec = time.time() - t0
    kw = dict(language=language, beam_size=beam, word_timestamps=True, vad_filter=True,
              condition_on_previous_text=False)
    t1 = time.time()
    if batch > 1:
        segs, info = BatchedInferencePipeline(model=m).transcribe(audio, batch_size=batch, **kw)
    else:
        segs, info = m.transcribe(audio, **kw)
    dur = float(getattr(info, "duration", 0) or duration_hint or 0)
    out, next_pct = [], 5
    for s in segs:
        out.append({
            "start": _r(s.start), "end": _r(s.end), "text": s.text.strip(),
            "avg_logprob": _r(s.avg_logprob, 3), "no_speech_prob": _r(s.no_speech_prob, 3),
            "compression_ratio": _r(s.compression_ratio, 2),
            "words": [{"start": _r(w.start), "end": _r(w.end), "word": w.word,
                       "p": _r(w.probability, 3)} for w in (s.words or [])],
        })
        if dur and s.end / dur * 100 >= next_pct:
            print(f"   {label} {int(s.end / dur * 100):3d}%  {hms(s.end)} / {hms(dur)}  "
                  f"経過 {time.time() - t1:.0f}秒", flush=True)
            next_pct = int(s.end / dur * 100) // 5 * 5 + 5
    elapsed = time.time() - t1
    res = {
        "model": model, "compute_type": "int8", "device": "cpu", "cpu_threads": threads,
        "batch": batch, "beam": beam, "vad_filter": True, "condition_on_previous_text": False,
        "language": getattr(info, "language", language),
        "language_probability": _r(getattr(info, "language_probability", None), 3),
        "duration": _r(dur), "duration_after_vad": _r(getattr(info, "duration_after_vad", None)),
        "load_sec": round(load_sec, 1), "elapsed_sec": round(elapsed, 1),
        "rtf": round(elapsed / dur, 3) if dur else None,
        "segments": out,
    }
    del m
    gc.collect()
    return res


END_MARKS = ("。", "！", "？", "!", "?")


def to_text(segments: list[dict], offset: float = 0.0, max_chars: int = 30,
            gap: float = 0.6) -> str:
    """読む用の `[H:MM:SS] 文` を、**単語の時刻で**刻み直して作る。

    まとめて8本通すと、1区間が VAD の塊（20〜30秒）になる。1分のショートが
    3行にしかならず、どの秒に何を言ったかが読めなかった（2026-10-15）。
    句点・0.6秒以上の間・30字のどれかで行を切る。
    """
    rows: list[tuple[float, str]] = []
    for s in segments:
        words = s.get("words") or []
        if not words:
            rows.append((s["start"], s["text"]))
            continue
        cur, t0, prev_end = "", None, None
        for w in words:
            st = w["start"] if w["start"] is not None else s["start"]
            if cur and ((prev_end is not None and st - prev_end > gap) or len(cur) >= max_chars):
                rows.append((t0, cur.strip()))
                cur, t0 = "", None
            if t0 is None:
                t0 = st
            cur += w["word"]
            prev_end = w["end"] if w["end"] is not None else st
            if w["word"].strip().endswith(END_MARKS):
                rows.append((t0, cur.strip()))
                cur, t0 = "", None
        if cur.strip():
            rows.append((t0, cur.strip()))
    return "".join(f"[{hms(t + offset)}] {txt}\n" for t, txt in rows if txt)


if __name__ == "__main__":
    # 復号した transcript.json から読む用の文を作り直す（前の版で作ったものを読みやすくする）
    #   python3 tools/shorts/ingest/asr.py text <transcript.json>
    import json
    import sys

    if len(sys.argv) == 3 and sys.argv[1] == "text":
        d = json.loads(open(sys.argv[2], encoding="utf-8").read())
        sys.stdout.write(to_text(d["segments"]))
