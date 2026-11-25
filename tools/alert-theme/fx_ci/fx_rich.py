#!/usr/bin/env python3
"""段の動画が「前の月の同じ段に見劣りしないか」を、景色の厚み・動き・主役の大きさで数える（12月の段3〜5 の見直し）。

あやと 2026-11-23「500円がちょいショボい」「1,000以上の演出も11月に比べてショボくない？」
「2,000以上のキャラ出てからの背景もっと派手にしたい」「7段の見せ場の演出の大きさと動きの6段の映像の比率が違う」。
目で「前より派手」と言わないために、比べる相手（既定は 11月の城）と同じ物差しで並べる。合否は出さない（数を並べるだけ）。

    python3 tools/alert-theme/fx_ci/fx_rich.py --theme christmas --tiers 3,4,5 [--ref castle] [--step 3] [--json <結果.json>]

数えるもの（段ごと。テーマと比べる相手の両方）:

| 数 | 中身 |
| --- | --- |
| 滞在の覆い | 焼いた動画の滞在の back で、透明 0.9 以上の画素が箱の何 %（コマの平均）。0.5 以上・0.1 超・透明の平均も並べる。箱の縁の溶かし（box_edge）の内側は、全面の景色なら 0.9 以上になる |
| 縁の覆い | 同じ滞在の back の、真ん中（キャラ絵と字の所 x 140〜580・y 300〜1100。fx_check の MID）の外だけの透明の平均。1,000円の段（景色が縁だけに引く段）を比べる物差し |
| 滞在の動き | fx_motion.py と同じ数（back と front を重ねた、隣のコマとの差が 16/255 を超えた画素。〜999円は帯の中だけ） |
| 滞在の主役 | 台本の主役だけの層（`finish_hero`）の、透明 0.5 超の外接矩形の幅・高さと画素数（滞在のコマの中央値） |
| 登場の主役 | 登場のうち、主役の外接矩形の幅がいちばん広いコマの幅（箱の幅の %）と、revealAt のコマの主役の下の端 |
| 帯（〜999円） | 主役の層（猫とツリー）が、どのコマでも帯（台本の ceiling(c)〜1140）の外に出ていないか。帯の高さ（922〜1140）を主役の外接矩形の高さがどれだけ埋めるか（滞在のコマの中央値） |

主役の層は台本を描いて取る（`--step` コマおき）。動画は public の fx（`public/alert/themes/<テーマ>/fx`）を読む。
"""
import argparse
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
ROOT = os.path.dirname(os.path.dirname(TOOLS))
sys.path.insert(0, TOOLS)
sys.path.insert(0, HERE)

import fx_check  # noqa: E402
import fx_motion  # noqa: E402
import fx_stage as fs  # noqa: E402

W, H, FPS = fs.W, fs.H, fs.FPS
MID = fx_check.MID
BAND = (922, fs.SAFE_BOTTOM)  # 〜999円の帯（キャラ絵の箱の下の端 0.72 〜 箱を広げたときに切れる高さ）


def scripts_of(theme):
    from run import scripts_of as so
    return {t: os.path.join(ROOT, p) for t, p in so(theme).items()}


def video_side(fx, tier):
    man = json.load(open(os.path.join(fx, "manifest.json"), encoding="utf-8"))
    e = man["tiers"][str(tier)]
    v = e["variants"].get("full") or next(iter(e["variants"].values()))
    back = fx_check.decode(os.path.join(fx, v["back"]["stay"]))
    a = back[..., 3].astype(np.float32) / 255
    out = {
        "cov90": float((a >= 0.9).mean() * 100),
        "cov50": float((a >= 0.5).mean() * 100),
        "cov10": float((a > 0.1).mean() * 100),
        "alpha_mean": float(a.mean()),
    }
    outer = np.ones((H, W), bool)
    outer[MID[0], MID[1]] = False
    out["edge_alpha_mean"] = float(a[:, outer].mean())
    out["mid_alpha_mean"] = float(a[:, MID[0], MID[1]].mean())
    y0, y1 = fx_motion.band_of(e)
    fr = fx_motion.layered(fx, e, "stay")
    out["motion_pixels"], out["motion_sec"] = fx_motion.measure(fr, y0, y1)
    return out


def bbox(m):
    ys, xs = np.nonzero(m)
    if len(ys) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def script_side(script, step):
    S = fs.load_script(script).Scene
    st = S(S.VARIANTS[0])
    out = {}
    # 滞在
    ws, hs, ns, fills = [], [], [], []
    for i in range(0, st.frames("stay"), step):
        c = st.ctx("stay", i)
        st.draw(c)
        m = st.last_hero[..., 3] > 0.5
        b = bbox(m)
        if b:
            ws.append(b[2] - b[0])
            hs.append(b[3] - b[1])
            ns.append(int(m.sum()))
    out["stay_hero_w"] = float(np.median(ws)) if ws else 0.0
    out["stay_hero_h"] = float(np.median(hs)) if hs else 0.0
    out["stay_hero_px"] = float(np.median(ns)) if ns else 0.0
    # 登場
    best, rev_bottom = (0, None), None
    ri = int(round(S.REVEAL * FPS))
    for i in sorted(set(range(0, st.frames("intro"), step)) | {ri}):
        c = st.ctx("intro", i)
        st.draw(c)
        b = bbox(st.last_hero[..., 3] > 0.5)
        if b and b[2] - b[0] > best[0]:
            best = (b[2] - b[0], round(i / FPS, 2))
        if i == ri and b:
            rev_bottom = b[3]
    # 山場（台本の PEAK。無ければ登場で主役がいちばん広いコマ）の、主役の組の幅。〜999円は猫とツリー（last_subject）
    pk = getattr(S, "PEAK", None)
    if pk is not None:
        st.draw(st.ctx("intro", int(round(pk * FPS))))
        a = getattr(st, "last_subject", None)
        a = np.maximum(a, st.last_hero[..., 3]) if a is not None else st.last_hero[..., 3]
        b = bbox(a > 0.5)
        out["peak_w"] = (b[2] - b[0]) if b else 0
        out["peak_x"] = (b[0], b[2]) if b else None
        out["peak_at"] = pk
    out["intro_hero_w_max"] = best[0]
    out["intro_hero_w_pct"] = round(best[0] / W * 100, 1)
    out["intro_hero_w_at"] = best[1]
    out["reveal_hero_bottom"] = rev_bottom
    # 〜999円の帯
    if getattr(S, "CHAR_BOTTOM", None):
        worst_out, fills = 0, []
        for clip in ("intro", "stay", "outro"):
            for i in range(0, st.frames(clip), step):
                c = st.ctx(clip, i)
                st.draw(c)
                a = st.last_hero[..., 3]
                if getattr(st, "last_subject", None) is not None:
                    a = np.maximum(a, st.last_subject)
                # 出る前（キャラ絵がまだ無い）は帯の外でもよい。キャラ絵が出たあとは帯（922〜1140）の外に出ない。
                # 出る瞬間のふくらみ（942）に主役が隠れないかは fx_hero.py が数える
                top = BAND[0]
                above = int((a[:top] > 0.05).sum()) if not (clip == "intro" and c.T < S.REVEAL) else 0
                below = int((a[BAND[1]:] > 0.05).sum())
                worst_out = max(worst_out, above + below)
                if clip == "stay":
                    b = bbox(a > 0.5)
                    if b:
                        fills.append((b[3] - b[1]) / (BAND[1] - BAND[0]))
        out["band_out_px_max"] = worst_out
        out["band_fill"] = round(float(np.median(fills)) * 100, 1) if fills else 0.0
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--theme", default="christmas")
    ap.add_argument("--ref", default="castle")
    ap.add_argument("--tiers", default="3,4,5")
    ap.add_argument("--step", type=int, default=3)
    ap.add_argument("--no-video", action="store_true", help="台本だけ数える（焼く前）")
    ap.add_argument("--no-ref-script", action="store_true", help="比べる相手の台本を描かない（相手の数は動画だけ）")
    ap.add_argument("--json")
    o = ap.parse_args()
    res = {}
    for t in [int(x) for x in o.tiers.split(",") if x]:
        row = {}
        for side, theme in (("new", o.theme), ("ref", o.ref)):
            d = {}
            fx = os.path.join(ROOT, "public/alert/themes", theme, "fx")
            if not o.no_video:
                d.update(video_side(fx, t))
            if not (side == "ref" and o.no_ref_script):
                d.update(script_side(scripts_of(theme)[t], o.step))
            row[side] = d
        n, r = row["new"], row["ref"]
        lines = [f"段{t}（{o.theme} / {o.ref}）"]
        if "cov90" in n:
            lines.append(f"  滞在の覆い α≥0.9 {n['cov90']:.1f}% / {r['cov90']:.1f}%・α≥0.5 {n['cov50']:.1f}% / {r['cov50']:.1f}%・"
                         f"縁の透明の平均 {n['edge_alpha_mean']:.3f} / {r['edge_alpha_mean']:.3f}・真ん中 {n['mid_alpha_mean']:.3f}")
            lines.append(f"  滞在の動き {n['motion_pixels']:.2f}% / {r['motion_pixels']:.2f}%（{n['motion_pixels'] / max(r['motion_pixels'], 1e-6):.2f}倍）・"
                         f"1秒 {n['motion_sec']:.1f}% / {r['motion_sec']:.1f}%")
        if "stay_hero_h" in n:
            rr = f" / {r['stay_hero_w']:.0f}×{r['stay_hero_h']:.0f}（{r['stay_hero_px']:.0f}px）" if "stay_hero_h" in r else ""
            lines.append(f"  滞在の主役 {n['stay_hero_w']:.0f}×{n['stay_hero_h']:.0f}（{n['stay_hero_px']:.0f}px）{rr}")
            if "peak_w" in n:
                lines.append(f"  山場（{n['peak_at']}秒）の主役の組の幅 {n['peak_w']}px（{n['peak_w'] / W * 100:.1f}%・x {n['peak_x']}）")
            lines.append(f"  登場の主役の幅 最大 {n['intro_hero_w_max']}px（{n['intro_hero_w_pct']}%・{n['intro_hero_w_at']}秒）・"
                         f"revealAt の主役の下の端 {n['reveal_hero_bottom']}")
        if "band_fill" in n:
            lines.append(f"  帯: 外に出た画素 最大 {n['band_out_px_max']}・帯の高さを埋める {n['band_fill']}%")
        print("\n".join(lines))
        res[str(t)] = row
    if o.json:
        json.dump(res, open(o.json, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
