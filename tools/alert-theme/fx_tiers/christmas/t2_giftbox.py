"""段2（200〜499円・水色）: ジモモとオレオがプレゼントの箱のふたを持ち上げると、水色の光と雪の結晶があふれ出す
（画面の下の帯。暗くしない。#1034）。

流れ（秒は登場の動画の時刻）:
- 前兆 0〜0.45: 雪の上に水色のプレゼントの箱。ふたのすきまから光がもれて、箱がかたかた揺れる
- 登場 0.3〜1.0: ジモモが左から、オレオが右から跳ねてきて、ふたに前足をかけて持ち上げる
- 山場 1.0〜1.8: ふたが開くと、水色の光の柱と雪の結晶がぶわっとあふれ出す（1.0 で投げた人のキャラ絵）。
  ふたはぽーんと右へ飛んで雪に刺さり、ふたりはばんざいで跳ねる
- 滞在（4秒の輪）: 箱から雪の結晶が昇り続け、光の柱が脈打つ。ふたりは代わりばんこに跳び上がって結晶をつかまえる
  （跳ぶと、つかんだ結晶が手の中ではじける）
- 締め 1.0秒: 光がしぼみ、ふたりは左右へ跳ねて帰る

あやとが決めた中身（#1034）: 段2 はジモモとオレオがプレゼントの箱のふたを持ち上げると、水色の光と雪の結晶があふれ出す。

置き方は段3 と同じ決まり: 〜999円の猫は、どの枠でも全身がキャラ絵の箱の下の端より下〜箱を広げたときに切れる高さ（1140）に
収まる（ふたりの頭は 942 より下、足もとは 1140 より上）。物は箱の下 1/3（y 853）より上に出さない（fx_check の〜999円の場所）。
"""
import math
import os
import sys

import numpy as np

ME = os.path.dirname(os.path.abspath(__file__))  # fx_stage も HERE を持つので、別の名前に
sys.path.insert(0, os.path.join(ME, "..", ".."))
sys.path.insert(0, ME)
from fx_stage import *  # noqa: E402,F401,F403
from xmas_kit import burst, crystal, pose_point, soft_dot  # noqa: E402

ART = os.path.join(ME, "..", "..", "fx_art", "christmas", "t2")

BX, JX, OX, LX_REST = 360.0, 248.0, 472.0, 612.0   # 箱・ジモモ・オレオ・飛んだふたが刺さる所（x）
G_KID, G_BOX = 1130.0, 1137.0
# 高さ（px）。並べ絵の同じ倍率（0.29）で縮めた。持ち上げる絵の中身が箱の 13.8%
H_UP, H_JY, H_OY = 180.0, 163.0, 155.0
H_BOX, H_LID = 151.0, 106.0
RIM = 0.30                     # 箱の絵の中で、ふたが乗る口の高さ（上の端からの割合）
PAWS = (0.5, 0.04)             # 持ち上げる絵の、上げた前足（真ん中の上）
OPEN = 1.05                    # ふたが開いて光があふれる秒
CYAN_L = np.float32([0.45, 0.88, 1.0])


class Scene(Stage):
    TIER = 2
    INTRO, STAY, OUTRO, REVEAL = 1.8, 4.0, 1.0, 1.0
    VARIANTS = ("full",)
    # 帯の中の絵。猫を大きくしたぶん、11月の段2（1500）より少し多く
    BUDGET_KB = {"full": 2000}
    FRONT = {"full": False}
    CHAR_BOTTOM = 0.72

    def setup(self):
        a = lambda n: Art.load(os.path.join(ART, n + ".webp"))
        self.j_up, self.j_yay = a("jimomo_up"), a("jimomo_yay")
        self.o_up, self.o_yay = a("oreo_up"), a("oreo_yay")
        self.box, self.lid = a("box"), a("lid")
        self.rim_y = G_BOX - H_BOX * (1 - RIM)
        self.cry = {r: crystal(r) for r in (10, 16)}
        self.rise = Loop(22, 2101, cycles=(1, 2))
        self.spark = Loop(60, 2102, cycles=(1, 2))
        self.snow = Loop(70, 2103, cycles=(1, 1))
        self.flake = soft_dot(1.6)
        R = np.random.default_rng(2104)
        m = 16
        self.erupt = np.stack([(R.random(m) - 0.5) * 360, -(180 + R.random(m) * 260), R.random(m), R.random(m)], -1)

    def s_of(self, c):
        if c.clip == "stay":
            return (c.ph * self.STAY) % self.STAY
        return c.T - self.INTRO

    def ceiling(self, c):
        if c.clip == "intro" and c.T < self.REVEAL:
            return H * 0.5 + 30
        if c.clip == "intro" and c.T < self.REVEAL + 0.9:
            return 942.0
        return 926.0

    # ---------------- ふた: 箱の口に乗る → 持ち上がる → 右へぽーんと飛んで雪に刺さる
    def lid_at(self, c):
        """返す: (x, 下の端の y, 回転, 濃さ)"""
        T, Ti, u = c.T, c.Ti, c.u
        rest = (BX, self.rim_y + H_LID * 0.62, 0.0)
        up = (BX, self.rim_y - 26, 0.0)
        land = (LX_REST, G_BOX + 2, 18.0)
        if c.clip == "intro":
            if T < 0.85:
                rat = 3 * math.sin(T * 40) * env(T, 0.15, 0.2, 0.4, 0.5)
                return rest[0], rest[1] - 2 * abs(math.sin(T * 40)) * env(T, 0.15, 0.2, 0.4, 0.5), rat, 1.0
            if T < 1.2:
                p = ease(ramp(T, 0.85, OPEN))
                return BX, lerp(rest[1], up[1], p) - 4 * math.sin(T * 30) * (1 - p), 0.0, 1.0
            p = ramp(T, 1.2, 1.55)
            if p < 1:
                x = lerp(up[0], land[0], p)
                y = lerp(up[1], land[1], p) - arc(p, 120)
                return x, y, 360 * ease(p) + land[2] * p, 1.0
            b = math.exp(-((T - 1.6) / 0.05) ** 2)
            return land[0], land[1] - 6 * b, land[2], 1.0
        return land[0], land[1], land[2], 1.0

    def draw(self, c):
        Ti, T, u = c.Ti, c.T, c.u
        cv, hero = Canvas(), Canvas()
        intro = c.clip == "intro"
        out_k = 1 - ease(ramp(u, 0.35, 1.0))
        k = ease(ramp(Ti, 0.0, 0.25)) * out_k
        opened = ease(ramp(Ti, OPEN - 0.05, OPEN + 0.1))
        s = self.s_of(c)
        pulse_ = 0.75 + 0.25 * math.sin(2 * math.pi * c.ph * 4)   # 登場でも同じ式（登場の尻と滞在の頭がつながる）
        flash = math.exp(-((T - OPEN - 0.04) / 0.1) ** 2) * intro

        # 雪の吹きだまり（足もとの細い帯）
        self.snow_bank(cv, k)
        # 光の柱（ふたが開くと、箱の口から上へ。箱の下 1/3 より上には出さない）
        lk = opened * pulse_ * out_k
        if lk > 0.003:
            y0, y1 = 862, int(self.rim_y + 8)
            ys = np.arange(y0, y1, dtype=np.float32)[:, None]
            xs = np.arange(W, dtype=np.float32)[None, :]
            t_ = (y1 - ys) / (y1 - y0)
            wdt = 46 + 40 * t_
            beam = np.exp(-((xs - BX) / wdt) ** 2) * np.clip(1 - t_, 0, 1) ** 1.3 * np.clip((ys - y0) / 30, 0, 1)
            cv.emit((beam[..., None] * (CYAN_L * 0.55 + WHITE * 0.25) * (0.6 * lk + 0.6 * flash)).astype(np.float32), 0, y0)
            glow(cv, BX, self.rim_y, 60, CYAN_L * 0.6 + WHITE * 0.2, (0.4 * lk + 0.45 * flash))
        # 箱（ふたが閉まっているあいだは、すきまから光がもれる）
        rat = 3 * math.sin(T * 40) * env(T, 0.15, 0.2, 0.4, 0.5) if intro else 0.0
        sprite(cv, self.box, BX, G_BOX, H_BOX, rot=rat * 0.5, k=k, rim=0.3, light_dir=(-0.4, -1.0))
        if opened < 1:
            glow(cv, BX, self.rim_y, 50, CYAN_L * 0.5, (0.25 + 0.15 * math.sin(T * 20)) * k * (1 - opened))
        # ふた
        lx, ly, lr, lk2 = self.lid_at(c)
        sprite(cv, self.lid, lx, ly, H_LID, anchor=(0.5, 1.0), rot=lr, k=k * lk2, rim=0.3, light_dir=(-0.4, -1.0))

        # 兄たち
        ceil = self.ceiling(c)
        tg = (cv, hero)
        for who in ("j", "o"):
            pose = self.kid(c, who)
            if pose is None:
                continue
            contact_shadow(cv, pose.x, G_KID, 50 * (1 - min(0.6, pose.lift / 100)), 0.28 * pose.k * out_k)
            put_pose(tg, pose, G_KID, ceil, k=out_k, rim=0.35, light_dir=(-0.4, -1.0))
            # 跳んだ頂で、つかんだ結晶が手の中ではじける（滞在の輪の出来事）
            if c.clip == "stay":
                t_hit = {"j": (0.45, 2.45), "o": (1.45, 3.45)}[who]
                for th in t_hit:
                    bx, by = pose.x, G_KID - (H_JY if who == "j" else H_OY) - 34
                    burst(cv, self.kit, bx, by + 14, (s - th) / 0.45, 2105 + int(th * 10), n=10, spread=36, cols=("cyan", "white"))

        # あふれる結晶: 開いた瞬間は四方へ噴き出し、滞在は口から昇り続ける（滞在の輪の周期）
        if intro:
            age = T - OPEN
            if 0 <= age < 0.8:
                e = self.erupt
                for j in range(len(e)):
                    x = BX + e[j, 0] * age
                    y = self.rim_y - 10 + e[j, 1] * age + 300 * age * age
                    y = max(y, 870.0)
                    kk = (1 - age / 0.8) ** 1.2 * (0.6 + 0.4 * e[j, 2])
                    spr = sprite_rot(np.dstack([self.cry[16], self.cry[16][..., :1]]), 6.283 * (age * 1.5 + e[j, 3]), 0.6 + 0.5 * e[j, 2])
                    fxv.stamp(cv.L, np.ascontiguousarray(spr[..., :3]), x, y, kk)
            burst(cv, self.kit, BX, self.rim_y - 20, age / 0.6, 2106, n=18, spread=90, cols=("cyan", "white", "cyan"))
        g = self.rise
        a_ = g.age(c)
        rk = opened * out_k
        for j in range(g.n):
            rr = g.r[j]
            x = BX + (rr[0] - 0.5) * 140 * a_[j] + 18 * math.sin(6.283 * (a_[j] * 1.2 + rr[1]))
            y = self.rim_y - 6 - a_[j] * (self.rim_y - 880)
            kk = math.sin(math.pi * a_[j]) ** 0.8 * (0.55 + 0.4 * rr[2]) * rk
            if kk > 0.02:
                cr = self.cry[10 if rr[3] < 0.5 else 16]
                spr = sprite_rot(np.dstack([cr, cr[..., :1]]), 6.283 * (a_[j] * (0.5 + rr[4]) + rr[5]), 1.0)
                fxv.stamp(cv.L, np.ascontiguousarray(spr[..., :3]), x, y, kk)
        g = self.spark
        a_ = g.age(c)
        for j in range(g.n):
            rr = g.r[j]
            x = BX + (rr[0] - 0.5) * 260 + 14 * math.sin(6.283 * (a_[j] + rr[1]))
            y = self.rim_y + 20 - a_[j] * 250
            tw = (0.5 + 0.5 * math.sin(6.283 * (a_[j] * 3 + rr[2]))) ** 2
            kk = math.sin(math.pi * a_[j]) * tw * (0.3 + 0.5 * rr[3]) * rk
            if y > 870 and kk > 0.02:
                fxv.stamp(cv.L, self.kit.star["cyan" if j % 3 else "white"], x, y, kk)
        # 雪（帯の上にちらつく。下 1/3 の中だけ）
        g = self.snow
        a_ = g.age(c)
        for j in range(g.n):
            rr = g.r[j]
            fxv.stamp(cv.L, self.flake, rr[0] * W + 14 * math.sin(6.283 * (a_[j] * 2 + rr[1])), 862 + a_[j] * 270,
                      math.sin(math.pi * a_[j]) ** 0.5 * 0.42 * (0.5 + 0.5 * rr[2]) * k)
        out = over_rgba(self.finish_hero(hero, bloom=0.0), cv.finish(bloom=0.55, edge=self.edge))
        return out, None

    def snow_bank(self, cv, k):
        if k <= 0.003:
            return
        y0, y1 = 1100, 1200
        xs = np.arange(W, dtype=np.float32)[None, :]
        ys = np.arange(y0, y1, dtype=np.float32)[:, None]
        top = 1128 + 4 * np.sin(xs / 49.0) + 3 * np.sin(xs / 21.0 + 0.7) - 6 * np.exp(-((xs - BX) / 120) ** 2)
        a = np.clip((ys - top) / 5.0, 0, 1) * np.clip((1186 - ys) / 40.0, 0, 1)
        a = a * (0.6 + 0.4 * np.clip(1 - np.abs(xs - 360) / 420, 0, 1)) * 0.95 * k
        shade = np.clip((ys - top) / 26.0, 0, 1)[..., None]
        col = (1 - shade) * np.float32([0.97, 0.98, 1.0]) + shade * np.float32([0.66, 0.76, 0.95])
        cv.over((col * a[..., None]).astype(np.float32), a.astype(np.float32), 0, y0)

    # ---------------- 兄たち: 登場で跳ねてきて、ふたを持ち上げ、開いたらばんざい。滞在は代わりばんこに跳んで結晶をつかむ
    def kid(self, c, who):
        T, Ti, u = c.T, c.Ti, c.u
        up, yay = (self.j_up, self.j_yay) if who == "j" else (self.o_up, self.o_yay)
        hy = H_JY if who == "j" else H_OY
        home = JX if who == "j" else OX
        side = -1 if who == "j" else 1
        if c.clip == "intro":
            t0 = 0.3 if who == "j" else 0.36
            if T < t0:
                return None
            if T < 0.82:
                p = ease_out(ramp(T, t0, 0.8))
                lift, land = hops(T, t0, 0.8, 3, 22)
                return Pose(up, H_UP, lerp(home + side * 420, home, p), lift, sx=1 + 0.08 * land, sy=1 - 0.1 * land)
            if T < OPEN + 0.12:
                # ふたに前足をかけて、ぐっと持ち上げる（少しつぶれてから伸びる）
                q = ramp(T, 0.82, OPEN)
                return Pose(up, H_UP, home + side * 6, 0.0, sx=1 + 0.05 * math.sin(math.pi * q), sy=1 - 0.06 * math.sin(math.pi * q),
                            rot=-side * 4 * math.sin(math.pi * q))
            if T < 1.6:
                q = (T - OPEN - 0.12) / (1.6 - OPEN - 0.12)
                return Pose(yay, hy, home, arc(q, 34), rot=side * 6 * math.sin(math.pi * q))
            land = math.exp(-((T - 1.64) / 0.04) ** 2)
            return Pose(up, H_UP, home, 0.0, sx=1 + 0.08 * land, sy=1 - 0.1 * land)
        if c.clip == "outro":
            w = ease_in(ramp(u, 0.05, 1.0))
            lift, land = hops(u, 0.05, 1.0, 3, 18)
            return Pose(up, H_UP, home + side * w * 430, lift, sx=1 + 0.08 * land, sy=1 - 0.1 * land)
        s = self.s_of(c)
        jumps = (0.2, 2.2) if who == "j" else (1.2, 3.2)
        for t0 in jumps:
            if t0 <= s < t0 + 0.5:
                q = (s - t0) / 0.5
                return Pose(yay, hy, home - side * 44 * math.sin(math.pi * q), arc(q, 40), rot=-side * 10 * math.sin(math.pi * q),
                            sy=1 + 0.05 * math.sin(math.pi * q))
            if t0 + 0.5 <= s < t0 + 0.62:
                land = math.sin(math.pi * (s - t0 - 0.5) / 0.12)
                return Pose(up, H_UP, home, 0.0, sx=1 + 0.08 * land, sy=1 - 0.1 * land)
        # 待つあいだも、前足を上げたまま跳ねて応援する（1秒に2回。輪の頭で 0・速さも 0）
        b = 12 * math.sin(2 * math.pi * 2 * s) ** 2
        return Pose(up, H_UP, home + side * 8 * math.sin(2 * math.pi * s), b, rot=side * 5 * math.sin(2 * math.pi * s),
                    sy=1 - 0.04 * math.cos(2 * math.pi * 4 * s) ** 8)
