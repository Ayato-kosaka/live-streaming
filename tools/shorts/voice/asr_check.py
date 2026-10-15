"""作った声を聞き取り直して、原稿どおりに読めているかを見る（EC2 の上の venv で動く）。

    /home/ubuntu/voice/asr-venv/bin/python asr_check.py <音声のフォルダ> <書き出す.json> [--model large-v3-turbo]

フォルダの下の `*.mp3` `*.wav` を全部聞いて、`{相対パス: {"text", "duration"}}` を書く。
比べるのは手元の `collect.py`（字幕の字と並べて、数・名前の食い違いを拾う）。

## 原稿を手がかりに渡さない

`initial_prompt` に原稿を入れると、聞き取りが原稿に寄って、読み違いが「合っている」に化ける。
確かめたいのは**実際に何と言ったか**なので、何も渡さない。

## `vad_filter=False`・`condition_on_previous_text=False`

1本は1文（数秒）なので区切る必要が無い。VAD は文頭・文末の弱い音を落として、
「あと」の「あ」のような短い音を消すことがある。前の文を手がかりにもさせない（1本ずつ別物）。
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time


def load(path: str):
    """mp3 を 16kHz モノラルの float に開く。

    faster-whisper 1.2.1 の `decode_audio` は `av.open(..., metadata_errors=...)` を呼ぶが、
    PyAV 19 にはその引数が無く TypeError で落ちる（2026-10-15 に踏んだ。`av<15` は EC2 で wheel が
    取れずビルドに落ちた）。なので自前で開いて配列を渡す。EC2 には ffmpeg が無いので PyAV で開く。
    """
    import av
    import numpy as np
    out = []
    with av.open(path) as c:
        rs = av.AudioResampler(format="s16", layout="mono", rate=16000)
        for frame in c.decode(audio=0):
            out += [f.to_ndarray() for f in rs.resample(frame)]
        out += [f.to_ndarray() for f in rs.resample(None)]
    return np.concatenate(out, axis=1).reshape(-1).astype(np.float32) / 32768.0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    ap.add_argument("out")
    ap.add_argument("--model", default="large-v3-turbo")
    ap.add_argument("--only", default="", help="この字を含むパスだけ（例: A/04）")
    a = ap.parse_args()

    from faster_whisper import WhisperModel
    t0 = time.time()
    m = WhisperModel(a.model, device="cpu", compute_type="int8", cpu_threads=os.cpu_count() or 2)
    print(f"model {a.model} {time.time() - t0:.0f}s", flush=True)

    files = []
    for root, _, names in os.walk(a.folder):
        for n in sorted(names):
            if n.rsplit(".", 1)[-1].lower() in ("mp3", "wav", "m4a", "ogg", "opus"):
                p = os.path.join(root, n)
                rel = os.path.relpath(p, a.folder)
                if not a.only or any(k in rel for k in a.only.split(",")):
                    files.append((rel, p))
    old = json.load(open(a.out)) if os.path.exists(a.out) else {}
    for rel, p in sorted(files):
        t1 = time.time()
        segs, info = m.transcribe(load(p), language="ja", beam_size=5, vad_filter=False,
                                  condition_on_previous_text=False, temperature=0.0)
        text = "".join(s.text.strip() for s in segs)
        old[rel] = {"text": text, "duration": round(float(info.duration), 3), "model": a.model}
        print(f"{rel}\t{info.duration:.2f}s\t{time.time() - t1:.1f}s\t{text}", flush=True)
        json.dump(old, open(a.out, "w"), ensure_ascii=False, indent=1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
