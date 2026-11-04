#!/usr/bin/env python3
"""投げ銭の段の主役（あやと）が、投げた人のキャラ絵の後ろに隠れていないかを数える（#1095）。

    python3 tools/alert-theme/fx_hero.py <台本> --chars <キャラ絵.png>… [--variants full,light] [--step 0.2]
           [--headroom 0.2] [--char-bottom 0.98] [--min 0.95] [--sheet <一覧.jpg>]

終了コード:
    0 = どのキャラ絵・どのコマでも、主役の見えている割合が --min 以上
    1 = 下回ったコマがある（どの絵の・何秒かを出す）
    2 = 確かめられなかった（台本が主役の層を残していない・キャラ絵が読めない）

キャラ絵の置き方は再生の側と同じにしてある（ここがずれると、数が本物と合わない）:

- 箱は面の幅いっぱい、上から headroom（段4〜7 は 0.2）〜下の端 char-bottom（`app/alertbox/index.tsx` の charTop・charBottom）。
  下の端は台本の `CHAR_BOTTOM`（manifest の段の `charBottom`。〜999円の3段は 0.72）、無ければ 0.98
- 絵の中身（透明 24/255 超の外接矩形）が箱に収まるいちばん大きな倍率で、縦も横も真ん中（`CharFit.tsx` の fitContent）
- 出る秒（revealAt）から 0.85 秒かけて、0.18 → 1.05（0.6 の所）→ 1.0 にふくらむ。全体の進みは
  cubic-bezier(0.2, 0.8, 0.3, 1)（`season/plate/CharBox.tsx`）。ふくらむ中心は箱の真ん中の高さ

主役の画素は、台本が `Stage.finish_hero` で残した主役だけの層（`last_hero`）の、透明 0.5 超
（段4〜6 はあやと、〜999円の3段は猫の家族と、その手前の小物）。
見るのは revealAt から滞在の終わりまで（締めは主役が帰っていくので見ない）。
back の層の主役はキャラ絵の後ろにいるので、顔に乗らない代わりに、キャラ絵の形によっては隠れる。
叩き台の枠（中央の 446×538）で置くと、縦長の絵（箱の高さいっぱい・上の端が headroom）を見落とす（2026-11-04）。
"""
import argparse
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fx_stage as fs  # noqa: E402

W, H, FPS = fs.W, fs.H, fs.FPS


class Unchecked(Exception):
    pass


def bezier(p1x, p1y, p2x, p2y):
    """CSS の cubic-bezier を、進み x → y の関数にする"""
    def at(t, a, b):
        return 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3

    def f(x):
        lo, hi = 0.0, 1.0
        for _ in range(40):
            mid = (lo + hi) / 2
            if at(mid, p1x, p2x) < x:
                lo = mid
            else:
                hi = mid
        return at((lo + hi) / 2, p1y, p2y)
    return f


EASE = bezier(0.2, 0.8, 0.3, 1.0)
EASE_IN_OUT = bezier(0.42, 0.0, 0.58, 1.0)


def pop_scale(age):
    """出てから age 秒の倍率（None は、まだ出ていない）"""
    if age < 0:
        return None
    p = EASE(min(1.0, age / 0.85))
    if p < 0.6:
        return 0.18 + (1.05 - 0.18) * EASE_IN_OUT(p / 0.6)
    return 1.05 + (1.0 - 1.05) * ((p - 0.6) / 0.4)


class CharLayout:
    """1人ぶんのキャラ絵を、再生の側と同じ置き方で 720×1280 の覆い（透明 0〜1）にする"""

    def __init__(self, path, headroom, char_bottom=0.98):
        im = Image.open(path).convert("RGBA")
        a = np.asarray(im, np.float32)[..., 3] / 255
        ys, xs = np.nonzero(a > 24 / 255)
        if len(ys) == 0:
            raise Unchecked(f"中身が無い絵: {path}")
        nh, nw = a.shape
        bx0, by0, bx1, by1 = max(0, xs.min() - 1), max(0, ys.min() - 1), min(nw, xs.max() + 2), min(nh, ys.max() + 2)
        top = round(H * headroom)
        bottom = round(H * (1 - char_bottom))
        aw, ah = W, H - top - bottom
        cw, ch = bx1 - bx0, by1 - by0
        s = min(aw / cw, ah / ch)
        cl, ct = (aw - cw * s) / 2, (ah - ch * s) / 2
        self.name = os.path.splitext(os.path.basename(path))[0]
        self.rgba = np.asarray(im, np.float32) / 255
        self.img = (cl - bx0 * s, top + ct - by0 * s, nw * s, nh * s)  # 絵の外枠（画面の px）
        self.content = (cl, top + ct, cw * s, ch * s)
        self.origin = (W / 2, top + ah / 2)
        self.shape = "縦長" if ch > cw * 1.15 else ("横長" if cw > ch * 1.15 else "四角")

    def mask(self, scale):
        """倍率 scale でふくらんだときの、キャラ絵の覆い（H,W）と色（前掛け RGBA）"""
        ox, oy = self.origin
        x, y, w, h = self.img
        x, y = ox + (x - ox) * scale, oy + (y - oy) * scale
        w, h = w * scale, h * scale
        src = np.float32([[0, 0], [self.rgba.shape[1], 0], [self.rgba.shape[1], self.rgba.shape[0]], [0, self.rgba.shape[0]]])
        dst = np.float32([[x, y], [x + w, y], [x + w, y + h], [x, y + h]])
        import cv2
        M = cv2.getPerspectiveTransform(src, dst)
        pm = self.rgba.copy()
        pm[..., :3] *= pm[..., 3:4]
        out = cv2.warpPerspective(pm, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
        return out[..., 3], out


def frames_to_check(S, step):
    """(本, コマ, 場面の時刻) — revealAt から登場の終わりまでと、滞在ぜんぶ"""
    out = []
    t = S.REVEAL
    while t < S.INTRO - 1e-6:
        out.append(("intro", int(round(t * FPS)), t))
        t += step
    t = 0.0
    while t < S.STAY - 1e-6:
        out.append(("stay", int(round(t * FPS)), S.INTRO + t))
        t += step
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("script")
    ap.add_argument("--chars", nargs="+", required=True)
    ap.add_argument("--variants", default=None)
    ap.add_argument("--step", type=float, default=0.2)
    ap.add_argument("--headroom", type=float, default=0.2)
    ap.add_argument("--char-bottom", type=float, default=None, help="無ければ台本の CHAR_BOTTOM、それも無ければ 0.98")
    ap.add_argument("--min", type=float, default=0.95)
    ap.add_argument("--sheet", default=None)
    o = ap.parse_args()
    try:
        S = fs.load_script(o.script).Scene
        cb = o.char_bottom if o.char_bottom is not None else (getattr(S, "CHAR_BOTTOM", None) or 0.98)
        chars = [CharLayout(p, o.headroom, cb) for p in o.chars]
        variants = o.variants.split(",") if o.variants else list(S.VARIANTS)
        print(f"段{S.TIER}: キャラ絵の箱 上 {o.headroom:.0%}〜下の端 {cb:.0%}・幅いっぱい（再生の側と同じ置き方）・"
              f"revealAt {S.REVEAL}秒から滞在の終わりまで {o.step}秒おき")
        for ch in chars:
            x, y, w, h = ch.content
            print(f"  {ch.name}（{ch.shape}）: 中身 x {x:.0f}〜{x + w:.0f}・y {y:.0f}〜{y + h:.0f}")
        bad = []
        worst = {}
        for v in variants:
            st = S(v)
            lo = (1.0, None)
            for clip, i, T in frames_to_check(S, o.step):
                back, front = st.draw(st.ctx(clip, i))
                hero_l = st.last_hero
                if hero_l is None:
                    raise Unchecked("台本が主役の層を残していない（`Stage.finish_hero` を通していない）")
                hero = hero_l[..., 3] > 0.5
                n = int(hero.sum())
                sc = pop_scale(T - S.REVEAL) if clip == "intro" else 1.0
                ys, xs = np.nonzero(hero)
                box = f"x {xs.min()}〜{xs.max()}・y {ys.min()}〜{ys.max()}" if n else "無し"
                fr = []
                for ch in chars:
                    if n == 0:
                        fr.append((0.0, ch.name))
                        continue
                    if sc is None:
                        fr.append((1.0, ch.name))
                        continue
                    m, _ = ch.mask(sc)
                    vis = float((hero & (m < 0.5)).sum()) / n
                    fr.append((vis, ch.name))
                vmin, who = min(fr)
                if vmin < lo[0]:
                    lo = (vmin, (clip, i, T, who, box))
                if vmin < o.min:
                    bad.append(f"{v} {clip} {T:.2f}秒: {who} で主役の {vmin:.0%} しか見えない（主役 {box}）")
            worst[v] = lo
            if lo[1] is None:
                print(f"  {v}: どのコマも全員で主役が見えている（いちばん少なくて 100%）")
            else:
                clip, i, T, who, box = lo[1]
                print(f"  {v}: いちばん少ないのは {T:.2f}秒（{clip}）の {who} で {lo[0]:.1%}（主役 {box}）")
        if o.sheet:
            make_sheet(S, variants, chars, o.sheet)
        for b in bad[:40]:
            print("  ✗", b)
        if len(bad) > 40:
            print(f"  ✗ ほか {len(bad) - 40} コマ")
        if not bad:
            print(f"  ○ どのキャラ絵でも、主役の {o.min:.0%} 以上が見えている")
        return 1 if bad else 0
    except Unchecked as e:
        print("確かめられなかった:", e)
        return 2


def make_sheet(S, variants, chars, path):
    """各通りの revealAt+0.5・登場の尻・滞在の半ばを、キャラ絵ごとに灰色の地へ重ねて並べる（主役の外形を黄色で囲む）"""
    import cv2
    tiles = []
    for v in variants:
        st = S(v)
        for clip, i, T in (("intro", int(round(min(S.INTRO - 1 / FPS, S.REVEAL + 0.5) * FPS)), min(S.INTRO - 1 / FPS, S.REVEAL + 0.5)),
                           ("intro", int(round(S.INTRO * FPS)) - 1, S.INTRO - 1 / FPS),
                           ("stay", int(round(S.STAY * FPS / 2)), S.INTRO + S.STAY / 2)):
            back, front = st.draw(st.ctx(clip, i))
            hero = (st.last_hero[..., 3] > 0.5).astype(np.uint8)
            cnt, _ = cv2.findContours(hero, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            sc = pop_scale(T - S.REVEAL) if clip == "intro" else 1.0
            for ch in chars:
                img = np.zeros((H, W, 3), np.float32) + 0.5
                img = back[..., :3] + img * (1 - back[..., 3:4])
                if sc is not None:
                    _, pm = ch.mask(sc)
                    img = pm[..., :3] + img * (1 - pm[..., 3:4])
                if front is not None:
                    img = front[..., :3] + img * (1 - front[..., 3:4])
                u8 = np.ascontiguousarray((np.clip(img, 0, 1) * 255).astype(np.uint8))
                cv2.drawContours(u8, cnt, -1, (255, 230, 0), 3)
                t = Image.fromarray(u8).resize((180, 320), Image.LANCZOS)
                ImageDraw.Draw(t).text((4, 4), f"t{S.TIER} {v} {T:.2f}s {ch.name}", fill=(255, 255, 255))
                tiles.append(t)
    cols = len(chars)
    rows = (len(tiles) + cols - 1) // cols
    sh = Image.new("RGB", (cols * 184, rows * 324), (255, 255, 255))
    for k, t in enumerate(tiles):
        sh.paste(t, ((k % cols) * 184, (k // cols) * 324))
    sh.save(path, quality=85)
    print("一覧:", path)


if __name__ == "__main__":
    sys.exit(main())
