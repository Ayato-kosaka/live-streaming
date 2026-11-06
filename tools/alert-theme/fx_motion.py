#!/usr/bin/env python3
"""投げ銭の段の動画が「どれだけ動いているか」を数で出し、前の版と比べる（#1095）。

あやと 2026-11-05「200,500は動きがもうちょいほしい」。目だけで「前より動いた」と言わないために数える。

    # 焼いた動画どうしで比べる（帯の中の、動いている画素の割合）
    python3 tools/alert-theme/fx_motion.py <fx の置き場> --old <前の版の fx の置き場> --tiers 2,3 [--min 1.5] [--json <結果.json>]
    # 台本どうしで比べる（主役＝猫の家族だけの層。雪や火の粉を数えない）
    python3 tools/alert-theme/fx_motion.py --script <台本> --old-script <前の版の台本> [--min 1.5]

終了コード:
    0 = 見た段は全部、滞在の動きが前の版の --min 倍以上
    1 = --min 倍に届かない段がある
    2 = 確かめられなかった（動画・台本が読めない、前の版が無い）

数えるもの（どちらも滞在の輪＝アラートが出ているあいだの大半を見る。登場も並べて出す）:

| 数 | 中身 |
| --- | --- |
| 動いている画素（1コマ） | 隣のコマとの差（前掛けの RGBA のどれかが 16/255 を超えて変わった画素）が、帯の何 % か。1コマずつの平均 |
| 1秒で動いた所 | 1秒ぶんのコマのどこかで動いた画素を合わせた広さが、帯の何 % か（小さく震えるだけだと増えない） |

帯は manifest の段の `charBottom`（〜999円の3段は 0.72。キャラ絵の箱の下の端）から、箱を広げたときに切れる高さ（1140px）まで。
`charBottom` の無い段は箱ぜんぶ。`--script` のときは、台本が `Stage.finish_hero` で残した主役だけの層（透明 0.5 超）が、
隣のコマで入れ替わった画素を数える（雪・火の粉・灯りの瞬きを数えないので、猫が動いた分だけが出る）。
"""
import argparse
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fx_check  # noqa: E402  動画の読み方（libvpx で透明ごと読む）を借りる

W, H, FPS = 720, 1280, 30
SAFE_BOTTOM = 1140
THR = 16


class Unchecked(Exception):
    pass


def premul(fr):
    x = fr.astype(np.int16)
    a = x[..., 3:4]
    return np.concatenate([(x[..., :3] * a) // 255, a], -1)


def measure(frames, y0, y1):
    """frames: (n, H, W, 4) uint8 か (n, H, W) bool。返す: (動いている画素 %, 1秒で動いた所 %)"""
    band = frames[:, y0:y1]
    if band.dtype == bool:
        mv = band[1:] ^ band[:-1]
    else:
        p = premul(band)
        mv = (np.abs(p[1:] - p[:-1]).max(-1) > THR)
    per = float(mv.mean() * 100)
    secs = []
    for s in range(0, len(mv), FPS):
        chunk = mv[s:s + FPS]
        if len(chunk) >= FPS // 2:
            secs.append(float(chunk.any(0).mean() * 100))
    return per, (float(np.mean(secs)) if secs else per)


def layered(fx, entry, clip):
    """その本の back（と front）を重ねたコマ。〜999円の段は back だけ"""
    v = entry["variants"].get("full") or next(iter(entry["variants"].values()))
    back = fx_check.decode(os.path.join(fx, v["back"][clip]))
    if v.get("front"):
        front = fx_check.decode(os.path.join(fx, v["front"][clip]))
        n = min(len(back), len(front))
        b = back[:n].astype(np.float32) / 255
        f = front[:n].astype(np.float32) / 255
        rgb = f[..., :3] * f[..., 3:4] + b[..., :3] * b[..., 3:4] * (1 - f[..., 3:4])
        a = f[..., 3:4] + b[..., 3:4] * (1 - f[..., 3:4])
        out = np.concatenate([np.where(a > 1e-4, rgb / np.maximum(a, 1e-4), 0), a], -1)
        return (np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8)
    return back


def band_of(entry):
    cb = entry.get("charBottom")
    return (int(round(H * cb)) if cb else 0), SAFE_BOTTOM


def from_videos(fx, old, tiers):
    rows = []
    for fxdir, tag in ((old, "前"), (fx, "今")):
        mp = os.path.join(fxdir, "manifest.json")
        if not os.path.exists(mp):
            raise Unchecked(f"manifest が無い: {mp}")
        man = json.load(open(mp, encoding="utf-8"))
        for t in tiers:
            e = man["tiers"].get(str(t))
            if e is None:
                raise Unchecked(f"{tag}の manifest に段{t} が無い")
            y0, y1 = band_of(e)
            for clip in ("intro", "stay"):
                fr = layered(fxdir, e, clip)
                per, sec = measure(fr, y0, y1)
                rows.append((t, tag, clip, per, sec, len(fr) / FPS, (y0, y1)))
    return rows


def hero_frames(script, clip):
    import fx_stage as fs
    S = fs.load_script(script).Scene
    st = S(S.VARIANTS[0])
    n = st.frames(clip)
    out = np.zeros((n, H, W), bool)
    for i in range(n):
        st.draw(st.ctx(clip, i))
        if st.last_hero is None:
            raise Unchecked(f"台本が主役の層を残していない: {script}")
        out[i] = st.last_hero[..., 3] > 0.5
    cb = getattr(S, "CHAR_BOTTOM", None)
    return out, S.TIER, ((int(round(H * cb)) if cb else 0), SAFE_BOTTOM)


def from_scripts(new, old):
    rows = []
    for sc, tag in ((old, "前"), (new, "今")):
        for clip in ("intro", "stay"):
            fr, tier, (y0, y1) = hero_frames(sc, clip)
            per, sec = measure(fr, y0, y1)
            rows.append((tier, tag, clip, per, sec, len(fr) / FPS, (y0, y1)))
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("fx", nargs="?")
    ap.add_argument("--old")
    ap.add_argument("--tiers", default="2,3")
    ap.add_argument("--script")
    ap.add_argument("--old-script")
    ap.add_argument("--min", type=float, default=1.5)
    ap.add_argument("--json", default=None, help="機械向けの結果（段ごとの滞在の倍率と、前・今の数）をこのファイルへ")
    o = ap.parse_args()
    out = {"code": None, "tiers": {}, "unchecked": None}
    code = _run(o, out)
    out["code"] = code
    if o.json:
        with open(o.json, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=1)
    return code


def _run(o, out):
    try:
        if o.script:
            if not o.old_script:
                raise Unchecked("--old-script が要る")
            rows = from_scripts(o.script, o.old_script)
            what = "主役だけの層（猫の家族）が隣のコマで入れ替わった画素"
        else:
            if not (o.fx and o.old):
                raise Unchecked("fx の置き場と --old が要る")
            rows = from_videos(o.fx, o.old, [int(t) for t in o.tiers.split(",")])
            what = f"焼いた動画の、隣のコマとの差が {THR}/255 を超えた画素"
    except (Unchecked, fx_check.Unchecked) as e:
        print("確かめられなかった:", e)
        out["unchecked"] = str(e)
        return 2
    print(f"数えたもの: {what}（帯の中の割合）")
    bad = []
    for t in sorted({r[0] for r in rows}):
        print(f"== 段{t}（帯 y {rows[0][6][0]}〜{rows[0][6][1]}）" if len({r[0] for r in rows}) == 1 else f"== 段{t}")
        got = {}
        for (tt, tag, clip, per, sec, dur, band) in rows:
            if tt != t:
                continue
            got[(tag, clip)] = (per, sec)
            print(f"   {tag} {clip:5s}（{dur:.1f}秒・帯 y {band[0]}〜{band[1]}）: 動いている画素 {per:5.2f}%／1コマ ・ 1秒で動いた所 {sec:5.1f}%")
        po, so = got[("前", "stay")]
        pn, sn = got[("今", "stay")]
        rp, rs = pn / max(po, 1e-6), sn / max(so, 1e-6)
        print(f"   滞在: 動いている画素 {rp:.2f} 倍 ・ 1秒で動いた所 {rs:.2f} 倍（合格は {o.min} 倍から）")
        out["tiers"][str(t)] = {"ok": not (rp < o.min or rs < o.min), "ratio_pixels": round(rp, 3), "ratio_sec": round(rs, 3),
                                **{f"{'old' if tag == '前' else 'new'}_{clip}": [round(a, 3), round(b, 2)]
                                   for (tag, clip), (a, b) in got.items()}}
        if rp < o.min or rs < o.min:
            bad.append(t)
            print(f"  ✗ 段{t}: 滞在の動きが前の版の {o.min} 倍に届かない")
        else:
            print(f"   ○ 段{t}: 滞在の動きが前の版の {o.min} 倍以上")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
