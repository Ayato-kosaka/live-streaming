"""元素材のカクつきの検査: 使った区間の元素材が、同じ絵を何コマも繰り返していないか。

    python3 tools/shorts/qa/stutter.py clip.mp4 [--from 秒] [--to 秒] [--win 秒]   # 素材を1秒ずつ測る

検査は check.py から呼ぶ（`source_stutter`）。上の使いかたは、**区間を選ぶ前に**素材のどこが
なめらかかを見る道具（1秒ごとの繰り返しの割合と実質 fps を並べ、線を越える所に ✕ を付ける）。

あやと（2026-10-19、最安ホステルの回 p2）:「映像がカクカクしてる（これは元動画が悪いの）」。
配信は回線が詰まるとコマを落とし、落ちたコマは前の絵の繰り返しで埋まる。動いている画で同じ絵が
3〜5コマ続いてから跳ぶので、カクカクに見える。

**出来上がりを見ても分からない。** 書き出しはゆっくり寄せる（zoom 1.27→1.33）ので、全部のコマで
全部の画素が変わる。出来上がりで「同じコマ」を数えると 0 になる（frozen が拾えないのはこれ）。
1秒1コマの一覧も動きを持たない。だから**時間割から元素材に戻って**、使った区間 [in, out) を
元の fps・元の大きさ（寄せる前・縮める前。透かしを切り落とした crop の中だけ）で読む。

## 測りかた

1. 隣のコマとの差（白黒の全画素の平均の絶対差）を並べる
2. コマごとに、前後 15コマ（±0.5秒）の差の 90 パーセンタイルを「そのあたりの動きの大きさ」とする
3. それが 1.0 未満なら、そのあたりは**動いていない**（写真・止まった画面）。止まった画は繰り返しても
   カクつかないので数えない
4. 動いている所で、差がそのあたりの動きの 15% 未満のコマを「同じ絵の繰り返し」と数える
5. 区間ごとに 繰り返し ÷ 動いている所のコマ。元の fps ×（1 − それ）が、実際に絵が変わる回数（実質 fps）

### 実測（2026-10-19。区間ごと）

| 動画 | 人の判定 | 繰り返しの割合（実質 fps） |
| --- | --- | --- |
| zjHZucyfrq8 p2 v2 | カクカク（あやと） | 20区間のうち13区間が **71〜81%（5.6〜8.7fps）**。同じ絵が 4〜7コマ続いて跳ぶ。残り7区間は 13〜51% |
| Hc-z52fs108 p2 | 出した | 配信の区間 4〜**54%**（13.9〜28.9fps。多くは1コマおきの 15fps）。写真6枚は動きなし |
| yk-by7R7iPA A・B | 出した | 4〜37%（19〜28.8fps。5コマに1つの繰り返し＝24fps が多い） |
| yk-by7R7iPA C | 出した | 0〜6% |

線は **60%（実質 12fps 未満）**。出したものの最悪（54%・13.9fps）と、カクカクと言われたものの最良
（71%・8.7fps）の間で、アニメの「2コマ打ち」（12fps）より絵が変わらないと動きが途切れて見える、に合わせた。
15% と 90 パーセンタイルを動かしても（0.08〜0.25 / 80〜97）、カクカクの区間は 65% を下回らず、
出したものは 59% を超えなかった。

ffmpeg の mpdecimate（hi=64*4:lo=64*2:frac=0.33）では分けにくかった。カクカクの区間で 21〜46%、
出したもので 0〜10% と並びは合うが、**繰り返しの半分を見逃す**（符号化し直した繰り返しのコマは、
8x8 の塊の差が 140〜600 あり、hi=256 を越える）。写真は 96〜99% と出て、止まった画とカクつきを分けない。
"""
from __future__ import annotations

import math
import os
import subprocess
from pathlib import Path

import numpy as np

from common import (FAIL, NA, PASS, Ctx, ffprobe, hms, native_size, rate, result, segments, stream_of,
                    where)

REL = 0.15            # 差がそのあたりの動きの 15% 未満なら、同じ絵の繰り返し
WIN = 15              # 「そのあたり」は前後 15コマ（±0.5秒）
LEVEL_PCT = 90        # そのあたりの動きの大きさは、差の 90 パーセンタイル（動いたコマが1割あれば拾う）
STILL_MAD = 1.0       # そのあたりの動きが平均 1.0 未満なら、止まった画（繰り返しても見た目は変わらない）
MIN_MOVING = 8        # 動いている所が 8コマ（0.27秒）に満たない区間は、割合を出さない
REPEAT_FAIL = 0.60    # 繰り返しが 6割を越える（実質 12fps 未満）区間が1つでもあれば落とす


def zooming(z) -> bool:
    """カットに**動く**寄せが掛かっているか（from と to が違う）。from == to は止まった切り出しで、
    寄せが動かないので「なめらかな寄せの下で中身だけ跳ぶ」は起きない。"""
    if not isinstance(z, dict) or z.get("from") is None or z.get("to") is None:
        return False
    return abs(float(z["from"]) - float(z["to"])) > 1e-9


def source_gray(path: str, a: int, b: int, fps: float, crop):
    """元素材の [a, b) コマを、元の大きさの白黒で1コマずつ返す（書き出しの decode_cut と同じ切りかた）。"""
    W, H = native_size(path)
    x, y, w, h = [int(v) for v in crop] if crop else (0, 0, W, H)
    ss = max(0, math.floor(a / fps) - 1)
    ra, rb = a - ss * fps, b - ss * fps
    vf = (f"trim=start={(ra - 0.5) / fps:.6f}:end={(rb - 0.5) / fps:.6f},setpts=PTS-STARTPTS,"
          + (f"crop={w}:{h}:{x}:{y}," if crop else "") + "format=gray")
    proc = subprocess.Popen(["ffmpeg", "-hide_banner", "-loglevel", "error", "-ss", str(ss), "-i", path,
                             "-map", "0:v:0", "-vf", vf, "-f", "rawvideo", "-"], stdout=subprocess.PIPE)
    size = w * h
    try:
        for _ in range(b - a):
            buf = proc.stdout.read(size)
            if len(buf) < size:
                break
            yield np.frombuffer(buf, dtype=np.uint8).reshape(h, w)
    finally:
        proc.stdout.close()
        proc.kill()
        proc.wait()


_DIFFS: dict = {}


def source_diffs(path: str, a: int, b: int, fps: float, crop) -> np.ndarray:
    """元素材の [a, b) の隣どうしの差。同じファイル（大きさと更新の時刻で見る）の同じ区間は2度読まない
    （selftest の足は、同じ元素材の同じ区間を何度も測る）。"""
    st = os.stat(path)
    key = (path, st.st_size, st.st_mtime_ns, a, b, fps, tuple(crop) if crop else None)
    if key not in _DIFFS:
        _DIFFS[key] = diffs(source_gray(path, a, b, fps, crop))
    return _DIFFS[key]


def diffs(frames) -> np.ndarray:
    out, prev = [], None
    for g in frames:
        if prev is not None:
            out.append(float(np.abs(g.astype(np.int16) - prev).mean()))
        prev = g.astype(np.int16)
    return np.array(out)


def classify(d: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """（繰り返し, 止まっている）をコマの対ごとに。"""
    rep = np.zeros(len(d), bool)
    still = np.zeros(len(d), bool)
    for i in range(len(d)):
        lvl = float(np.percentile(d[max(0, i - WIN): i + WIN + 1], LEVEL_PCT))
        if lvl < STILL_MAD:
            still[i] = True
        elif d[i] < REL * lvl:
            rep[i] = True
    return rep, still


def measure(d: np.ndarray, fps: float) -> dict:
    rep, still = classify(d)
    moving = ~still
    nm = int(moving.sum())
    m = {"pairs": int(len(d)), "moving_pairs": nm, "still_share": round(float(still.mean()), 3) if len(d) else 1.0}
    if nm < MIN_MOVING:
        return {**m, "repeat": None, "eff_fps": None, "longest_hold": None}
    r = rep[moving]
    # 同じ絵が何コマ続いたか（繰り返しが k 個続けば k+1 コマ）
    longest, k = 1, 1
    for x in r:
        k = k + 1 if x else 1
        longest = max(longest, k)
    ratio = float(r.mean())
    return {**m, "repeat": round(ratio, 3), "eff_fps": round(fps * (1 - ratio), 1), "longest_hold": longest}


def check(ctx: Ctx) -> dict:
    cid, title = "source_stutter", "元素材のカクつき"
    th = {"repeat_if_diff_lt": f"前後{WIN}コマの差の{LEVEL_PCT}パーセンタイルの {REL} 倍",
          "still_if_level_lt": STILL_MAD, "fail_if_repeat_gt": REPEAT_FAIL,
          "fail_if_eff_fps_lt": round(ctx.fps * (1 - REPEAT_FAIL), 1)}
    segs = segments(ctx.plan)
    if not segs:
        return result(cid, title, NA, "時間割（plan.json の cuts）が無く、元素材に戻れない", thresholds=th)
    fps = float(ctx.plan["fps"])
    rows, missing = [], []
    for s in segs:
        if not os.path.exists(s["path"]):
            missing.append(s)
            continue
        d = source_diffs(s["path"], s["in"], s["out"], fps, s["crop"])
        rows.append({**{k: s[k] for k in ("from_s", "to_s", "file", "in", "out")},
                     "src_from": round(s["src_from"], 2), "src_to": round(s["src_to"], 2),
                     "zoom": zooming(s.get("zoom")), "where": where(s), **measure(d, fps)})
    rated = [r for r in rows if r["repeat"] is not None]
    bad = [r for r in rated if r["repeat"] > REPEAT_FAIL]
    worst = max(rated, key=lambda r: r["repeat"], default=None)
    m = {"segments": rows, "measured_segments": len(rated), "still_segments": len(rows) - len(rated),
         "missing_sources": sorted({s["path"] for s in missing}),
         "worst": {k: worst[k] for k in ("from_s", "to_s", "file", "repeat", "eff_fps")} if worst else None}
    problems = []
    for r in sorted(bad, key=lambda r: -r["repeat"]):
        tip = "。ゆっくり寄せているので、寄せはなめらかなまま中身だけ跳ぶ" if r["zoom"] else ""
        problems.append(f"{r['where']}: 同じ絵の繰り返し {r['repeat']:.0%}（実質 {r['eff_fps']}fps・"
                        f"同じ絵が最長 {r['longest_hold']}コマ）{tip} → 繰り返しの少ない区間か別の画に替える")
    for s in missing:
        problems.append(f"{where(s)}: 元素材が無い（{s['path']}）")
    if worst is None:
        summ = f"動きのある区間が無い（{len(rows)} 区間すべて止まった画）" if rows else "元素材が1つも無い"
    else:
        summ = (f"繰り返しがいちばん多い区間 {worst['repeat']:.0%}（実質 {worst['eff_fps']}fps・"
                f"{worst['from_s']:.1f}〜{worst['to_s']:.1f}秒）／線 {REPEAT_FAIL:.0%} を越える区間 "
                f"{len(bad)} / {len(rated)}")
        if len(rows) > len(rated):
            summ += f"（止まった画 {len(rows) - len(rated)} 区間は数えない）"
    if bad:
        status = FAIL
    elif missing:
        status = NA
        summ = f"元素材が {len(missing)} 区間ぶん無い／" + summ
    else:
        status = PASS
    return result(cid, title, status, summ, measured=m, thresholds=th, problems=problems)


def scan(path: str, t0: float, t1: float | None, win: float) -> list[dict]:
    """素材の [t0, t1) 秒を win 秒ごとに測る（区間の選び直しに使う。検査と同じ数えかた）。"""
    pr = ffprobe(Path(path))
    v = next(x for x in pr["streams"] if x.get("codec_type") == "video")
    fps = rate(v.get("r_frame_rate")) or 30.0
    end = float(pr["format"]["duration"]) if t1 is None else t1
    d = diffs(source_gray(path, int(round(t0 * fps)), int(round(end * fps)), fps, None))
    rep, still = classify(d)
    _, base = stream_of(Path(path))
    rows, step = [], max(2, int(round(win * fps)))
    for k in range(0, len(d), step):
        r, mv = rep[k:k + step], ~still[k:k + step]
        sec = t0 + k / fps
        ratio = float(r[mv].mean()) if mv.sum() >= step // 2 else None  # 半分以上止まっていれば、止まった画
        rows.append({"from": round(sec, 2), "to": round(min(end, sec + step / fps), 2),
                     "stream_from": round(base + sec, 2), "repeat": None if ratio is None else round(ratio, 3),
                     "eff_fps": None if ratio is None else round(fps * (1 - ratio), 1)})
    return rows


def main() -> int:
    import argparse
    ap = argparse.ArgumentParser(description="素材のカクつきを1秒ずつ測る（区間を選ぶ前に）")
    ap.add_argument("clip")
    ap.add_argument("--from", dest="t0", type=float, default=0.0, help="素材の中の秒（既定 0）")
    ap.add_argument("--to", dest="t1", type=float, help="素材の中の秒（既定 終わりまで）")
    ap.add_argument("--win", type=float, default=1.0, help="まとめる秒（既定 1）")
    a = ap.parse_args()
    if not os.path.exists(a.clip):
        print(f"✕ 無い: {a.clip}")
        return 2
    rows = scan(a.clip, a.t0, a.t1, a.win)
    print("| 素材の秒 | 配信の時刻 | 繰り返し | 実質 fps | |")
    print("| --- | --- | --- | --- | --- |")
    for r in rows:
        if r["repeat"] is None:
            print(f"| {r['from']:.1f}〜{r['to']:.1f} | {hms(r['stream_from'])} | — | — | 止まった画 |")
        else:
            mark = "✕" if r["repeat"] > REPEAT_FAIL else "○"
            print(f"| {r['from']:.1f}〜{r['to']:.1f} | {hms(r['stream_from'])} | {r['repeat']:.0%} | "
                  f"{r['eff_fps']} | {mark} |")
    rated = [r for r in rows if r["repeat"] is not None]
    good = sum(r["repeat"] <= REPEAT_FAIL for r in rated)
    print(f"\n線 {REPEAT_FAIL:.0%} 以下（○）: {good} / {len(rated)} 区切り（止まった画 {len(rows) - len(rated)} 区切り）")
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
