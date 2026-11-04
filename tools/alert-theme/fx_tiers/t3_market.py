"""段3（500〜999円・緑）: 家族で、クリスマスマーケットをおさんぽ（画面の下 1/2。暗くしない）。

叩き台ペラ一の流れ（秒は登場の動画の時刻）:
- 前兆 0〜0.4: 下の帯に、マーケットの灯りがひとつずつ点く
- 登場 0.4〜1.4: ラブブ母さんが子どもたちを連れて、灯りの中を歩いてくる（1.4 で投げた人のキャラ絵）
- 山場 1.4〜2.2: 家族そろってこちらを向くと、灯りがいっせいにきらめき、雪が舞い始める
- 滞在（3秒の輪）: 子どもたちが交互に跳ね、雪が降り、灯りが瞬く
- 締め 1.0秒: 右の奥へ歩いて行き、灯りが順に消える

屋台は左右の端、灯りの紐はその間にかかる。猫たちは下の端を歩く。箱の真ん中より上には何も出さない。
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from fx_stage import *  # noqa: E402,F401,F403
import fx_stage as fs  # noqa: E402

ART = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "fx_art", "t3")


class Scene(Stage):
    TIER = 3
    INTRO, STAY, OUTRO, REVEAL = 2.2, 3.0, 1.0, 1.4
    VARIANTS = ("full",)
    # 〜999円の段は隅の小さな絵なので、予算は小さく（画質の段が QBEST に当たって、たいていこれより小さく焼ける）
    BUDGET_KB = {"full": 1500}
    FRONT = {"full": False}

    BOTTOM = SAFE_BOTTOM

    def setup(self):
        a = lambda n: Art.load(os.path.join(ART, n + ".webp"))
        self.stalls = a("stalls")
        # 母さんを先頭に、左から歩いてくる。止まるのは左右の端（真ん中は投げた人のキャラ絵の場所）
        self.fam = [(a("oreo_walk"), 160, 72, 0.0), (a("jimomo_walk"), 160, 178, 0.33),
                    (a("pipo_walk"), 150, 520, 0.66), (a("lovebu_walk"), 300, 628, 0.0)]
        # 灯り（屋台の電球・ランタン）: 描かれた明るい暖色の小さな塊
        lvl = self.stalls.levels[0]
        self.win = fs.window_mask(lvl)
        self.sw = 760.0
        self.sh = self.sw * self.stalls.h / self.stalls.w
        self.sx0 = 360 - self.sw / 2
        self.sy0 = self.BOTTOM - self.sh
        R = np.random.default_rng(303)
        ys, xs = np.nonzero(self.win > 0.6)
        pick = R.choice(len(ys), size=min(60, len(ys)), replace=False)
        self.bulbs = np.stack([xs[pick], ys[pick]], -1).astype(np.float64)
        self.bulb_ph = R.random(len(pick))
        self.snow = Loop(150, 304, cycles=(1, 2))
        # 奥のマーケットの灯り（ぼけ玉）。左右の帯に多く、真ん中は薄く
        self.bok = Loop(16, 305, cycles=(1, 1))

    def draw(self, c):
        Ti, T, u = c.Ti, c.T, c.u
        cv = Canvas()
        out_k = 1 - ease(ramp(u, 0.4, 1.0))
        top = H * 0.5 + 8  # これより上に出さない
        # 屋台（灯りは前兆で左から順に点く）
        sk = ease(ramp(Ti, 0.0, 0.35)) * (1 - ease(ramp(u, 0.5, 1.0)))
        lit = ease(ramp(Ti, 0.05, 0.45))
        sprite(cv, self.stalls, 360, self.BOTTOM, self.sh, k=sk, grade=np.array([0.95, 0.92, 0.95], np.float32) * (0.55 + 0.45 * lit))
        xx = np.linspace(0, 1, self.stalls.w, dtype=np.float32)[None, :]
        on = np.clip((Ti - 0.05 - xx * 0.35) / 0.08, 0, 1)
        if c.clip == "outro":
            on = on * np.clip((xx - u * 1.3 + 0.2) / 0.1, 0, 1)
        spark = 1 + 1.3 * math.exp(-((Ti - 1.55) / 0.12) ** 2) * (c.clip == "intro")
        fl = 0.8 + 0.2 * np.sin(6.283 * (c.ph * 3 + xx * 9))
        em = (self.win * on * fl * spark)[..., None] * (GOLD * 0.9 + WHITE * 0.4) * 0.6 * sk
        src = np.float32([[0, 0], [self.stalls.w, 0], [self.stalls.w, self.stalls.h], [0, self.stalls.h]])
        dst = np.float32([[self.sx0, self.sy0], [self.sx0 + self.sw, self.sy0], [self.sx0 + self.sw, self.BOTTOM], [self.sx0, self.BOTTOM]])
        r = fs.warp_into(em.astype(np.float32), src, dst)
        if r is not None:
            im, x0, y0 = r
            cv.emit(im[..., :3], x0, y0)
        # 灯りの星（滞在の輪で瞬く。山場でいっせいに）
        s = self.sw / self.stalls.w
        for j, (bx, by) in enumerate(self.bulbs):
            tw = max(0.0, math.sin(6.283 * (c.ph * (1 + j % 3) + self.bulb_ph[j]))) ** 6
            tw = max(tw, math.exp(-((Ti - 1.55 - (bx / self.stalls.w) * 0.2) / 0.1) ** 2) * (c.clip == "intro"))
            x, y = self.sx0 + bx * s, self.sy0 + by * s
            if y > top and tw > 0.03:
                fxv.stamp(cv.L, self.kit.star["gold" if j % 4 else "white"], x, y, 0.55 * tw * sk * float(on[0, min(int(bx), on.shape[1] - 1)]))
        # 奥の灯りのぼけ玉（前兆で点き、滞在の輪でゆっくり漂う。箱の下半分の中だけ）
        bk = ease(ramp(Ti, 0.1, 0.6)) * (1 - ease(ramp(u, 0.3, 0.9)))
        if bk > 0.003:
            cols = (GOLD * 0.9 + AMBER * 0.3, np.float32([1.0, 0.35, 0.3]), np.float32([0.45, 1.0, 0.55]), WHITE * 0.7 + GOLD * 0.4)
            for j in range(self.bok.n):
                rr = self.bok.r[j]
                a1 = self.bok.age(c)[j]
                side = rr[0] < 0.75
                x = (rr[1] * 150 + 10) if (side and j % 2) else ((W - 10 - rr[1] * 150) if side else 200 + rr[1] * 320)
                x += 16 * math.sin(6.283 * (a1 + rr[2]))
                y = 700 + rr[3] * 230 - 40 * a1
                kk = (0.09 + 0.1 * rr[4]) * (0.55 + 0.45 * math.sin(math.pi * a1) ** 2) * bk * (1.0 if side else 0.55)
                kk *= 1 + 1.2 * math.exp(-((Ti - 1.55) / 0.15) ** 2) * (c.clip == "intro")
                spr = self.kit.bokeh_spr(16 + rr[5] * 20, j % 4, cols[j % 4], 4 + rr[6] * 4)
                fxv.stamp(cv.L, spr, x, y, kk)
        # 家族: 左から歩いてくる → こちらを向いて止まる。滞在は子どもたちが交互に跳ねる
        walk_in = ease_out(ramp(Ti, 0.4, 1.4))
        for art, h, x_end, ph in self.fam:
            x = lerp(x_end - 760, x_end, walk_in) + ease_in(u) * 700
            stride = (1 - ease(ramp(Ti, 1.25, 1.45))) if c.clip == "intro" else (ease(u) if c.clip == "outro" else 0.0)
            bob = abs(math.sin((T * 2.6 + ph) * math.pi * 2)) * 10 * stride
            hop = 0.0
            if c.clip != "intro" or Ti > 1.45:
                # 締めの頭は滞在の頭と同じ跳ね方から始めて、歩き出すまでに収める（本のつなぎで跳ばない）
                hop = (12 if h < 200 else 5) * max(0.0, c.osc(2 if h < 200 else 1, ph)) * ease(ramp(Ti, 1.45, 1.9))
                hop *= 1 - ease(ramp(u, 0.0, 0.4))
            k = ease(ramp(Ti, 0.4, 0.55)) * out_k
            contact_shadow(cv, x, self.BOTTOM - 2, h * 0.42, 0.3 * k)
            sprite(cv, art, x, self.BOTTOM - bob - hop, h, k=k, rim=0.35, light_dir=(-0.5, -1.0),
                   sy=1 + 0.03 * math.sin(T * 2.6 * math.pi * 2 + ph * 6.283) * stride)
        # 雪（山場から。滞在の輪で降り続ける）
        amb = ease(ramp(Ti, 1.45, 2.0)) * out_k
        if amb > 0.003:
            g = self.snow
            a_ = g.age(c)
            x = g.r[:, 0] * W + 30 * np.sin(6.283 * (a_ * 2 + g.r[:, 1]))
            y = top + 10 + a_ * (self.BOTTOM - top - 10)
            near = g.r[:, 2] < 0.25
            kd = np.sin(np.pi * a_) ** 0.5 * amb * np.where(near, 0.55, 0.35)
            sp = Splat()
            sp.add_screen(x, y, (WHITE * 1.4)[None] * kd[:, None], coc=np.where(near, 3.0, 0.0))
            sp.into(cv)
        return cv.finish(bloom=0.55, edge=self.edge), None
