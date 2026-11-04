"""段3（500〜999円・緑）: 家族で、クリスマスマーケットをおさんぽ（画面の下 1/2。暗くしない）。

叩き台ペラ一の流れ（秒は登場の動画の時刻）:
- 前兆 0〜0.4: 下の帯に、マーケットの灯りがひとつずつ点く
- 登場 0.4〜1.4: ラブブ母さんが子どもたちを連れて、灯りの中を歩いてくる（1.4 で投げた人のキャラ絵）
- 山場 1.4〜2.2: 家族そろってこちらを向くと、灯りがいっせいにきらめき、雪が舞い始める
- 滞在（3秒の輪）: 子どもたちが交互に跳ね、雪が降り、灯りが瞬く
- 締め 1.0秒: 右の奥へ歩いて行き、灯りが順に消える

屋台は帯の左右の端、灯りの紐はその間にかかる。家族は下の 28% の帯（キャラ絵の箱の下の端 0.72 より下。
CONTRACT.md の追記 2026-11-04）の中を歩く。光と粒（雪・ぼけ玉）は帯の上に出てよいが、箱の真ん中より上には出さない。
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
    # 投げた人のキャラ絵の箱の下の端。下の 28%（y 922〜）が猫の帯（CONTRACT.md の追記 2026-11-04）
    CHAR_BOTTOM = 0.72
    # 帯の中に収める高さ（px）。キャラ絵は出るとき 1.05 倍にふくらむので、箱の下の端（922）より 20px 下から
    BAND_TOP = 944
    STALL_H = 188.0

    def setup(self):
        a = lambda n: Art.load(os.path.join(ART, n + ".webp"))
        stalls = a("stalls").levels[0]
        h_, w_ = stalls.shape[:2]
        # 屋台の絵（左右の屋台と、間の灯りの紐）を左右の屋台に分けて、帯の両端に置く。
        # 1枚のまま帯の高さに縮めると、屋台が真ん中に寄って家族の後ろに隠れた
        r0, r1 = int(0.10 * h_), int(0.95 * h_)
        self.stall_l = Art(np.ascontiguousarray(stalls[r0:r1, :int(0.40 * w_)]))
        self.stall_r = Art(np.ascontiguousarray(stalls[r0:r1, int(0.61 * w_):]))
        self.st_scale = self.STALL_H / self.stall_l.h
        self.st_lx1 = self.stall_l.w * self.st_scale            # 左の屋台の右の端
        self.st_rx0 = W - self.stall_r.w * self.st_scale        # 右の屋台の左の端
        # 母さんを先頭に、左から歩いてくる。止まるのは帯の左右（屋台の前）。(絵, 高さ, 止まる x, 位相, 子か)
        self.fam = [(a("oreo_walk"), 106, 70, 0.0, True), (a("jimomo_walk"), 106, 168, 0.33, True),
                    (a("pipo_walk"), 100, 548, 0.66, True), (a("lovebu_walk"), 190, 640, 0.0, False)]
        # 灯り（屋台の電球・ランタン）: 描かれた明るい暖色の小さな塊
        self.win_l = fs.window_mask(self.stall_l.levels[0])
        self.win_r = fs.window_mask(self.stall_r.levels[0])
        R = np.random.default_rng(303)
        bl = []
        for side, win in (("l", self.win_l), ("r", self.win_r)):
            ys, xs = np.nonzero(win > 0.6)
            pick = R.choice(len(ys), size=min(28, len(ys)), replace=False)
            for yy_, xx_ in zip(ys[pick], xs[pick]):
                sx = xx_ * self.st_scale + (0 if side == "l" else self.st_rx0)
                sy = self.BOTTOM - self.STALL_H + yy_ * self.st_scale
                bl.append((sx, sy))
        self.bulbs = np.array(bl, np.float64)
        self.bulb_ph = R.random(len(bl))
        # 屋台の間にかかる灯りの紐（光だけ。帯の上の端にたわむ）
        n = 13
        xs_ = np.linspace(self.st_lx1 - 18, self.st_rx0 + 18, n)
        t_ = np.linspace(0, 1, n)
        ys_ = self.BOTTOM - self.STALL_H + 22 + 34 * 4 * t_ * (1 - t_)
        self.garland = np.stack([xs_, ys_], -1)
        self.snow = Loop(150, 304, cycles=(1, 2))
        # 奥のマーケットの灯り（ぼけ玉）。左右の帯に多く、真ん中は薄く
        self.bok = Loop(16, 305, cycles=(1, 1))

    def stall_light(self, cv, art, win, x0, Ti, c, u, sk):
        """屋台の灯り（描かれた電球）を、前兆で左から順に点ける。締めは右から順に消える"""
        xx = (x0 + np.arange(art.w, dtype=np.float32)[None, :] * self.st_scale) / W
        on = np.clip((Ti - 0.05 - xx * 0.35) / 0.08, 0, 1)
        if c.clip == "outro":
            on = on * np.clip((xx - u * 1.3 + 0.2) / 0.1, 0, 1)
        spark = 1 + 1.3 * math.exp(-((Ti - 1.55) / 0.12) ** 2) * (c.clip == "intro")
        fl = 0.8 + 0.2 * np.sin(6.283 * (c.ph * 3 + xx * 9))
        em = (win * on * fl * spark)[..., None] * (GOLD * 0.9 + WHITE * 0.4) * 0.6 * sk
        sw, sh = art.w * self.st_scale, art.h * self.st_scale
        src = np.float32([[0, 0], [art.w, 0], [art.w, art.h], [0, art.h]])
        dst = np.float32([[x0, self.BOTTOM - sh], [x0 + sw, self.BOTTOM - sh], [x0 + sw, self.BOTTOM], [x0, self.BOTTOM]])
        r = fs.warp_into(em.astype(np.float32), src, dst)
        if r is not None:
            im, ox, oy = r
            cv.emit(im[..., :3], ox, oy)

    def draw(self, c):
        Ti, T, u = c.Ti, c.T, c.u
        cv = Canvas()
        hero = Canvas()  # 猫の家族だけ（fx_hero.py が、キャラ絵に隠れていないかを数える。重ねはしない）
        out_k = 1 - ease(ramp(u, 0.4, 1.0))
        top = H * 0.5 + 8  # これより上に出さない（光と粒も）
        # 屋台（帯の左右の端。灯りは前兆で左から順に点く）
        sk = ease(ramp(Ti, 0.0, 0.35)) * (1 - ease(ramp(u, 0.5, 1.0)))
        lit = ease(ramp(Ti, 0.05, 0.45))
        grade = np.array([0.95, 0.92, 0.95], np.float32) * (0.55 + 0.45 * lit)
        sprite(cv, self.stall_l, 0, self.BOTTOM, self.STALL_H, anchor=(0.0, 1.0), k=sk, grade=grade)
        sprite(cv, self.stall_r, W, self.BOTTOM, self.STALL_H, anchor=(1.0, 1.0), k=sk, grade=grade)
        self.stall_light(cv, self.stall_l, self.win_l, 0.0, Ti, c, u, sk)
        self.stall_light(cv, self.stall_r, self.win_r, self.st_rx0, Ti, c, u, sk)
        # 屋台の間の灯りの紐（前兆で左から順に点く。山場でいっせいにきらめく。滞在は順に瞬く）
        sp = Splat()
        xs_ = np.linspace(self.garland[0, 0], self.garland[-1, 0], 160)
        t_ = (xs_ - xs_[0]) / (xs_[-1] - xs_[0])
        ys_ = self.BOTTOM - self.STALL_H + 22 + 34 * 4 * t_ * (1 - t_)
        sp.add_screen(xs_, ys_, np.tile(AMBER * 0.12 + GOLD * 0.05, (160, 1)) * sk)
        sp.into(cv)
        for j, (bx, by) in enumerate(self.garland):
            on = clamp01((Ti - 0.1 - (bx / W) * 0.3) / 0.08)
            if c.clip == "outro":
                on *= clamp01((bx / W - u * 1.3 + 0.2) / 0.1)
            tw = 0.7 + 0.3 * math.sin(6.283 * (c.ph * 2 + j / 4))
            tw += 1.2 * math.exp(-((Ti - 1.55 - (bx / W) * 0.2) / 0.1) ** 2) * (c.clip == "intro")
            col = [GOLD, np.float32([1.0, 0.4, 0.35]), np.float32([0.5, 1.0, 0.6])][j % 3]
            glow(cv, bx, by, 7, col * 0.9 + WHITE * 0.2, 0.9 * on * tw * sk)
            glow(cv, bx, by, 22, col * 0.25, 0.5 * on * tw * sk)
        # 灯りの星（滞在の輪で瞬く。山場でいっせいに）
        for j, (bx, by) in enumerate(self.bulbs):
            tw = max(0.0, math.sin(6.283 * (c.ph * (1 + j % 3) + self.bulb_ph[j]))) ** 6
            tw = max(tw, math.exp(-((Ti - 1.55 - (bx / W) * 0.2) / 0.1) ** 2) * (c.clip == "intro"))
            on = clamp01((Ti - 0.05 - (bx / W) * 0.35) / 0.08)
            if c.clip == "outro":
                on *= clamp01((bx / W - u * 1.3 + 0.2) / 0.1)
            if by > top and tw > 0.03:
                fxv.stamp(cv.L, self.kit.star["gold" if j % 4 else "white"], bx, by, 0.55 * tw * sk * on)
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
                y = 830 + rr[3] * 200 - 40 * a1
                kk = (0.09 + 0.1 * rr[4]) * (0.55 + 0.45 * math.sin(math.pi * a1) ** 2) * bk * (1.0 if side else 0.55)
                kk *= 1 + 1.2 * math.exp(-((Ti - 1.55) / 0.15) ** 2) * (c.clip == "intro")
                spr = self.kit.bokeh_spr(16 + rr[5] * 20, j % 4, cols[j % 4], 4 + rr[6] * 4)
                fxv.stamp(cv.L, spr, x, y, kk)
        # 家族: 左から歩いてくる → こちらを向いて止まる。滞在は子どもたちが交互に跳ねる。帯（BAND_TOP より下）の中だけ
        walk_in = ease_out(ramp(Ti, 0.4, 1.4))
        for art, h, x_end, ph, kid in self.fam:
            x = lerp(x_end - 760, x_end, walk_in) + ease_in(u) * 700
            stride = (1 - ease(ramp(Ti, 1.25, 1.45))) if c.clip == "intro" else (ease(u) if c.clip == "outro" else 0.0)
            bob = abs(math.sin((T * 2.6 + ph) * math.pi * 2)) * (6 if kid else 3) * stride
            hop = 0.0
            if c.clip != "intro" or Ti > 1.45:
                # 締めの頭は滞在の頭と同じ跳ね方から始めて、歩き出すまでに収める（本のつなぎで跳ばない）
                hop = (9 if kid else 3) * max(0.0, c.osc(2 if kid else 1, ph)) * ease(ramp(Ti, 1.45, 1.9))
                hop *= 1 - ease(ramp(u, 0.0, 0.4))
            k = ease(ramp(Ti, 0.4, 0.55)) * out_k
            contact_shadow(cv, x, self.BOTTOM - 2, h * 0.42, 0.3 * k)
            for tgt in (cv, hero):
                sprite(tgt, art, x, self.BOTTOM - bob - hop, h, k=k, rim=0.35, light_dir=(-0.5, -1.0),
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
        self.finish_hero(hero, bloom=0.0)
        return cv.finish(bloom=0.55, edge=self.edge), None
