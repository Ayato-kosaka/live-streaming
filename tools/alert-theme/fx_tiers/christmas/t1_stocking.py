"""段1（〜199円・青）: 暖炉の棚に吊るした刺繍の靴下から、ピポがひょこっと顔を出す（画面の下の隅だけ。暗くしない。#1034）。

流れ（秒は登場の動画の時刻）:
- 前兆 0〜0.3: 下の隅に暖炉が浮かび、棚のろうそくが左から順に灯って、火がぼうっと明るくなる
- 登場 0.15〜0.7: 靴下がもぞもぞ揺れて、ピポがひょこっと顔を出す。口から青い光の粒がこぼれる（0.6 で投げた人のキャラ絵）
- 山場 0.75〜1.4: ピポが前足を振る。青い光の粒が靴下を伝ってこぼれ続ける
- 滞在（2秒の輪）: きょろきょろ見回し → 前足を振る → 2回ぴょこぴょこ跳ねる。光の粒がこぼれ、ろうそくと火がゆらぐ。雪がちらつく
- 締め 1.0秒: ピポが靴下にもぐり、光の粒がふわっと舞って、暖炉が消える

あやとが決めた中身（#1034）: 段1 は暖炉の棚に吊るした刺繍の靴下から、ピポがひょこっと顔を出す。青い光の粒がこぼれる。
控えめでよいが、豪華さと可愛さは要る。背景を汚さない。

置き方は段3 と同じ決まり: 〜999円の猫は、どの枠でも全身がキャラ絵の箱の下の端より下〜箱を広げたときに切れる高さ（1140）に
収まる。ピポの頭は 942（キャラ絵が出る瞬間のふくらみ）より下、靴下と暖炉の下の端は 1140 より上。物は箱の下 30%（y 896）
より上に出さない（fx_check の〜999円の場所）。ピポは靴下の口より下を描かず、口の手前のふわふわを重ねる（もぐって見える）。
"""
import math
import os
import sys

import numpy as np

ME = os.path.dirname(os.path.abspath(__file__))  # fx_stage も HERE を持つので、別の名前に
sys.path.insert(0, os.path.join(ME, "..", ".."))
sys.path.insert(0, ME)
from fx_stage import *  # noqa: E402,F401,F403
import fx_stage as fs  # noqa: E402
from xmas_kit import burst, emit_masked, lip_of, soft_dot  # noqa: E402

ART = os.path.join(ME, "..", "..", "fx_art", "christmas", "t1")

FX, FB, H_FIRE = 200.0, 1138.0, 210.0   # 暖炉（真ん中の x・下の端・高さ）
SX, H_STOCK = 296.0, 122.0             # 靴下（x・高さ）。吊るす輪が棚の下の端に来る
CUFF = (0.17, 0.40)                    # 靴下の絵の中の、口のふわふわ（縦の割合）
H_PIPO = 105.0                          # ピポ（胸から上の絵）の高さ。顔の幅が 50px 前後
POP = 0.3                               # ひょこっ
BLUE = np.float32([0.45, 0.75, 1.0])


class Scene(Stage):
    TIER = 1
    INTRO, STAY, OUTRO, REVEAL = 1.4, 2.0, 1.0, 0.6
    VARIANTS = ("full",)
    BUDGET_KB = {"full": 1500}
    FRONT = {"full": False}
    CHAR_BOTTOM = 0.72

    def setup(self):
        a = lambda n: Art.load(os.path.join(ART, n + ".webp"))
        self.fire, self.stock = a("fireplace"), a("stocking")
        self.peek, self.wave = a("pipo_peek"), a("pipo_wave")
        self.cuff = Art(lip_of(self.stock.levels[0], CUFF[0] + 0.02, CUFF[1]))
        self.fire_win = fs.window_mask(self.fire.levels[0])
        # 靴下の置き場: 口のふわふわの上の端（ピポの前足が掛かる所）
        self.s_top = FB - H_FIRE * 0.58          # 吊るす輪の上の端（棚の下の端）
        self.cuff_y = self.s_top + CUFF[0] * H_STOCK
        self.spill = Loop(40, 1101, cycles=(1, 2))
        self.float_ = Loop(16, 1102, cycles=(1, 1))
        self.snow = Loop(60, 1103, cycles=(1, 1))
        self.dot = {r: soft_dot(r, BLUE * 1.1 + WHITE * 0.2) for r in (1.6, 2.6)}
        self.flake = soft_dot(1.6)

    def pipo(self, c):
        """返す: (絵, 持ち上がり 0〜1.1, 回転, sy, 跳ね px)。1 で前足が靴下の口に掛かる高さ"""
        T, Ti, u = c.T, c.Ti, c.u
        if c.clip == "intro":
            if T < POP:
                return None
            r = back_out(ramp(T, POP, POP + 0.25), 2.4)
            sq = math.exp(-((T - POP - 0.27) / 0.05) ** 2)
            if 0.75 <= T < 1.3:
                q = (T - 0.75) / 0.55
                return self.wave, r, 4 * math.sin(2 * math.pi * 3 * q), 1.0, 0.0
            calm = 1 - ease(ramp(T, 1.3, 1.4)) if T >= 1.3 else 1.0
            return self.peek, r, 0.0 * calm, 1 + 0.06 * sq, 0.0
        if c.clip == "outro":
            r = 1 - ease_in(ramp(u, 0.0, 0.35)) * 1.15
            return self.peek, r, 0.0, 1.0, 0.0
        s = (c.ph * self.STAY) % self.STAY
        if s < 0.6:
            # きょろきょろ（左右を見回す）
            return self.peek, 1.0, 5 * math.sin(2 * math.pi * s / 0.6), 1.0, 0.0
        if s < 1.4:
            q = (s - 0.6) / 0.8
            return self.wave, 1.0, 7 * math.sin(2 * math.pi * 2 * q), 1.0, 0.0
        lift, land = hops(s, 1.4, 2.0, 2, 9)
        return self.peek, 1.0, 0.0, 1 - 0.07 * land, lift

    def draw(self, c):
        Ti, T, u = c.Ti, c.T, c.u
        cv, hero, lipc = Canvas(), Canvas(), Canvas()
        intro = c.clip == "intro"
        out_k = 1 - ease(ramp(u, 0.35, 1.0))
        k = ease(ramp(Ti, 0.0, 0.25)) * out_k
        lit = ease(ramp(Ti, 0.05, 0.4))

        # 暖炉（ろうそくは左から順に、火はぼうっと。滞在の輪でゆらぐ）
        dst = sprite(cv, self.fire, FX, FB, H_FIRE, k=k, grade=np.float32([0.95, 0.93, 0.95]) * (0.7 + 0.3 * lit))
        emit_masked(cv, self.fire_win, dst, lambda yy, xx: np.clip((Ti - 0.05 - xx * 0.25) / 0.08, 0, 1)
                    * (0.75 + 0.25 * np.sin(6.283 * (c.ph * 4 + xx * 5 + yy * 3)) + 0.1 * np.sin(6.283 * (c.ph * 6 + xx * 11))),
                    0.9 * k, col=GOLD * 0.9 + AMBER * 0.4 + WHITE * 0.2)
        glow(cv, FX, FB - H_FIRE * 0.2, 70, AMBER * 0.5 + GOLD * 0.3, (0.25 + 0.06 * c.osc(3)) * k * lit)

        # 靴下（ひょこっの前にもぞもぞ揺れる）
        wig = 6 * math.sin(T * 38) * env(T, 0.12, 0.2, 0.38, POP) if intro else 0.0
        sprite(cv, self.stock, SX, self.s_top, H_STOCK, anchor=(0.5, 0.0), rot=wig, k=k, rim=0.3, light_dir=(-0.4, -1.0))

        # ピポ（主役だけの層）。口より下は描かず、口の手前のふわふわを上に重ねる
        p = self.pipo(c)
        if p is not None:
            art, r, rot, sy, hop = p
            y = self.cuff_y + 14 + (1 - r) * H_PIPO * 0.95 - hop
            sprite(hero, art, SX + 2, y, H_PIPO * sy, anchor=(0.5, 1.0), rot=rot, k=out_k if c.clip == "outro" else 1.0,
                   rim=0.35, light_dir=(-0.4, -1.0), clip_below=self.cuff_y + 12)
            sprite(lipc, self.cuff, SX, self.s_top, H_STOCK, anchor=(0.5, 0.0), k=k, rim=0.3, light_dir=(-0.4, -1.0))

        # 青い光の粒: ひょこっでぱっとはじけ、口から靴下を伝ってこぼれ続ける（滞在の輪の周期）
        if intro:
            burst(cv, self.kit, SX, self.cuff_y, (T - POP - 0.05) / 0.5, 1104, n=14, spread=48, cols=("cyan", "white"))
        sk = ease(ramp(Ti, POP, POP + 0.3)) * out_k
        g = self.spill
        a_ = g.age(c)
        for j in range(g.n):
            rr = g.r[j]
            side = -1 if rr[0] < 0.5 else 1
            # 口からふわっと外へ出て、靴下の横を伝って落ちる
            x = SX + side * (16 + 40 * a_[j] + 10 * rr[1]) + 6 * math.sin(6.283 * (a_[j] + rr[2]))
            y = self.cuff_y - 8 - 30 * a_[j] + (130 + 40 * rr[3]) * a_[j] ** 2
            kk = math.sin(math.pi * a_[j]) ** 0.7 * (0.45 + 0.4 * rr[4]) * sk
            if y < 1140 and kk > 0.01:
                fxv.stamp(cv.L, self.dot[2.6 if rr[5] < 0.4 else 1.6], x, y, kk)
                if rr[6] < 0.25:
                    fxv.stamp(cv.L, self.kit.star["cyan"], x, y, 0.5 * kk)
        # ふわっと昇る青い粒（暖炉のまわり。箱の下 30% より上には出さない）
        g = self.float_
        a_ = g.age(c)
        for j in range(g.n):
            rr = g.r[j]
            x = FX - 120 + rr[0] * 300 + 12 * math.sin(6.283 * (a_[j] * 1.5 + rr[1]))
            y = 1120 - a_[j] * 200
            kk = math.sin(math.pi * a_[j]) ** 2 * (0.35 + 0.4 * rr[2]) * sk
            if y > 905:
                fxv.stamp(cv.L, self.kit.star["cyan" if j % 3 else "white"], x, y, kk)
        # 雪（ちらつく。下 30% の中だけ）
        g = self.snow
        a_ = g.age(c)
        for j in range(g.n):
            rr = g.r[j]
            x = rr[0] * W + 14 * math.sin(6.283 * (a_[j] * 2 + rr[1]))
            y = 905 + a_[j] * 235
            kk = math.sin(math.pi * a_[j]) ** 0.5 * 0.45 * (0.5 + 0.5 * rr[2]) * k
            fxv.stamp(cv.L, self.flake, x, y, kk)
        # 締め: もぐった口から光の粒がふわっと
        if c.clip == "outro":
            burst(cv, self.kit, SX, self.cuff_y, (u - 0.25) / 0.6, 1105, n=10, spread=40, cols=("cyan", "white"))

        out = over_rgba(self.finish_hero(hero, bloom=0.0), cv.finish(bloom=0.5, edge=self.edge))
        return over_rgba(lipc.finish(bloom=0.0, edge=self.edge), out), None
