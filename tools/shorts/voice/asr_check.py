"""作った声を聞き取り直して、原稿どおりに読めているかを見る（EC2 の上の venv で動く）。

    ~/voice/asr-venv/bin/python asr_check.py   # EC2 の ubuntu のホームで <音声のフォルダ> <書き出す.json> [--model large-v3-turbo]

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


GAP = 1.2   # 詰めるときに文と文のあいだに置く無音（秒）


def packed(m, files, old, a):
    """数秒の文を、無音をはさんで1つの窓（--pack 秒まで）に並べて聞き、単語の時刻で文に割り戻す。

    Whisper は数秒の音声でも30秒の窓ぶん encoder を回すので、1本ずつだと2 vCPU で1本約30秒かかる
    （2026-10-15、54本で27分）。詰めれば窓の数が数分の1になる。割り戻しは単語の真ん中の時刻で決める。
    境目で取り違えると「合わない」に出るので、その文だけ1本ずつ聞き直せば済む（取り違えで合格には化けない）"""
    import numpy as np
    import re
    sr = 16000
    # 同じ文の2テイクを同じ窓に並べると、Whisper は2回目を「繰り返し」とみなして1回ぶんしか書かない
    # （2026-10-16、142本のうち17本が空になった）。しかも残った1回がどちらの音から来たか分からず、
    # 片方が読み違えていても「合っている」に化けうる。なのでテイク1を全部並べてから、テイク2を並べる
    take = lambda rel: int((re.search(r"_t(\d+)\.", rel) or [0, 0])[1])
    files = sorted(files, key=lambda f: (take(f[0]), f[0]))
    clips = [(rel, load(p)) for rel, p in files]
    groups, cur, cur_len = [], [], 0.0
    for rel, x in clips:
        d = len(x) / sr
        if cur and cur_len + GAP + d > a.pack:
            groups.append(cur)
            cur, cur_len = [], 0.0
        cur.append((rel, x))
        cur_len += d + GAP
    if cur:
        groups.append(cur)
    gap = np.zeros(int(GAP * sr), dtype=np.float32)
    for g in groups:
        t1 = time.time()
        parts, spans, pos = [], [], 0.0
        for rel, x in g:
            spans.append((rel, pos, pos + len(x) / sr))
            parts += [x, gap]
            pos += len(x) / sr + GAP
        segs, _ = m.transcribe(np.concatenate(parts), language="ja", beam_size=5, vad_filter=False,
                               condition_on_previous_text=False, temperature=0.0, word_timestamps=True)
        got = {rel: [] for rel, _, _ in spans}
        for s in segs:
            for w in (s.words or []):
                mid = (w.start + w.end) / 2
                rel = min(spans, key=lambda sp: 0 if sp[1] - GAP / 2 <= mid <= sp[2] + GAP / 2 else
                          min(abs(mid - sp[1]), abs(mid - sp[2])))[0]
                got[rel].append(w.word)
        for rel, st, en in spans:
            text = "".join(got[rel]).replace(" ", "").strip()
            old[rel] = {"text": text, "duration": round(en - st, 3), "model": a.model, "packed": True}
            print(f"{rel}\t{en - st:.2f}s\tpacked\t{text}", flush=True)
        print(f"-- window {len(g)} clips {pos:.1f}s audio {time.time() - t1:.1f}s", flush=True)
        json.dump(old, open(a.out, "w"), ensure_ascii=False, indent=1)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    ap.add_argument("out")
    ap.add_argument("--model", default="large-v3-turbo")
    ap.add_argument("--only", default="", help="この字を含むパスだけ（例: A/04）")
    ap.add_argument("--pack", type=float, default=0,
                    help="何秒ぶんまで1つの窓に詰めて聞くか（0 は1本ずつ）。合わなかった文は --only で1本ずつ聞き直す")
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
    if a.pack:
        packed(m, sorted(files), old, a)
        return 0
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
