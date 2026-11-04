"""段2（200〜499円・水色）: 兄たち（ジモモとオレオ）が、焼き栗を転がしてくる（画面の下 1/3。暗くしない）。

叩き台ペラ一の流れ（秒は登場の動画の時刻）:
- 前兆 0〜0.3: 火の粉がひとつ、ぱちっと跳ねる
- 登場 0.3〜1.0: 画面の端から、ふたりが焼き栗をころころ転がしてくる
- 山場 1.0〜1.8: 栗がぱかっと割れて、湯気と金の火の粉。ふたりでばんざい（1.0 で投げた人のキャラ絵）
- 滞在（2秒の輪）: ふたりが交互に跳ね、栗から湯気がゆらゆら、火の粉が昇る
- 締め 1.0秒: 栗を抱えて、反対の端へ走って行く

ふたりと栗は、下の 28% の帯（キャラ絵の箱の下の端 0.72 より下。CONTRACT.md の追記 2026-11-04）の中。
キャラ絵は出るとき 1.05 倍にふくらむので、帯の上の端より 20px 下（944）から。湯気と火の粉は帯の上に出てよい。
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from fx_stage import *  # noqa: E402,F401,F403

ART = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "fx_art", "t2")


class Scene(Stage):
    TIER = 2
    INTRO, STAY, OUTRO, REVEAL = 1.8, 2.0, 1.0, 1.0
    VARIANTS = ("full",)
    # 〜999円の段は隅の小さな絵なので、予算は小さく（画質の段が QBEST に当たって、たいていこれより小さく焼ける）
    BUDGET_KB = {"full": 1500}
    FRONT = {"full": False}
    CHAR_BOTTOM = 0.72

    BOTTOM = SAFE_BOTTOM

    def setup(self):
        a = lambda n: Art.load(os.path.join(ART, n + ".webp"))
        self.jp, self.op, self.jb, self.ob = a("jimomo_push"), a("oreo_push"), a("jimomo_banzai"), a("oreo_banzai")
        self.nut, self.nut_open = a("chestnut"), a("chestnut_open")
        self.mist = Mist(202)
        self.sparks = Loop(40, 203, cycles=(1, 2))
        R = np.random.default_rng(204)
        n = 60
        ang = -math.pi / 2 + (R.random(n) - 0.5) * 2.2
        sp = 180 + R.random(n) * 280
        self.burst = dict(vx=np.cos(ang) * sp, vy=np.sin(ang) * sp, life=0.5 + R.random(n) * 0.5, col=np.where(R.random(n)[:, None] < 0.7, GOLD, WHITE))

    def draw(self, c):
        Ti, T, u = c.Ti, c.T, c.u
        cv = Canvas()
        hero = Canvas()  # ふたりと栗だけ（fx_hero.py が、キャラ絵に隠れていないかを数える。重ねはしない）
        out_k = 1 - ease(ramp(u, 0.55, 1.0))
        run = ease_in(ramp(u, 0.1, 1.0)) * 760  # 締め: 右の端へ走って行く
        come = ease_out(ramp(Ti, 0.3, 1.0))
        opened = Ti >= 1.0
        # 栗: 左の端から転がってくる（回りながら）。割れたら少し跳ねる
        nx = lerp(-80, 360, come) + run
        rot = -360 * 1.6 * (1 - come) if not opened else 0.0
        pop = math.exp(-((Ti - 1.02) / 0.08) ** 2) * (c.clip == "intro")
        nut = self.nut_open if opened else self.nut
        nh = 106 * (1 + 0.12 * pop)
        sq = 1 + 0.18 * pop
        # 滞在: 栗の上の湯気（ゆらゆら昇る）
        steam_k = ease(ramp(Ti, 1.05, 1.5)) * out_k
        if steam_k > 0.003:
            for j in range(3):
                m = self.mist.layer(c, self.BOTTOM - 280, self.BOTTOM - 95, 0.55 * steam_k, (0.98, 0.96, 0.94), laps=0, scale=0.25,
                                    soft_top=120, soft_bot=60, drift_y=c.ph + j / 3)
                if m:
                    p, a = m
                    xx = np.arange(W, dtype=np.float32)[None, :]
                    col = np.exp(-((xx - (nx + (j - 1) * 30 + 10 * c.osc(1, j / 3))) / 30) ** 2)
                    cv.over(p * col[..., None] * 0.85, a * col * 0.85)
        contact_shadow(cv, nx, self.BOTTOM - 4, 70, 0.3 * ease(ramp(Ti, 0.3, 0.5)) * out_k)
        nk = ease(ramp(Ti, 0.3, 0.42)) * out_k
        for tgt in (cv, hero):
            if opened:
                sprite(tgt, nut, nx, self.BOTTOM - 2, nh, anchor=(0.5, 1.0), sx=sq, sy=2 - sq, k=nk, rim=0.3)
            else:
                # 転がる: 真ん中のまわりに回す
                sprite(tgt, nut, nx, self.BOTTOM - 2 - nh / 2, nh, anchor=(0.5, 0.5), rot=rot, k=nk, rim=0.3)
        glow(cv, nx, self.BOTTOM - 60, 70, GOLD * 0.6 + AMBER * 0.3, (0.6 * pop + 0.25 * steam_k))
        # ふたり: 押してくる → ばんざい。滞在は交互に跳ねる
        for who, (push, banz, x_end, x_from, ph) in {"j": (self.jp, self.jb, 112, -200, 0.0), "o": (self.op, self.ob, 604, 900, 0.5)}.items():
            x = lerp(x_from, x_end, ease_out(ramp(Ti, 0.3, 0.95))) + run
            hop = 0.0
            if opened:
                hop = 14 * max(0.0, math.sin(math.pi * clamp01((Ti - 1.0) / 0.32))) * (c.clip == "intro")
                hop += 10 * max(0.0, c.osc(2, ph)) * (c.clip != "intro")
            walk = 5 * abs(math.sin(Ti * 18)) * (1 - ease(ramp(Ti, 0.85, 1.0))) if not opened else 0.0
            art = banz if opened else push
            k = ease(ramp(Ti, 0.3, 0.45)) * out_k
            contact_shadow(cv, x, self.BOTTOM - 2, 90, 0.28 * k)
            for tgt in (cv, hero):
                sprite(tgt, art, x, self.BOTTOM - hop - walk, 178.0, k=k, sy=1 + 0.04 * math.sin(math.pi * clamp01((Ti - 1.0) / 0.32)) * (c.clip == "intro"),
                       rim=0.3, light_dir=(0.0, -1.0))
        # 火の粉: 前兆の1つ・割れた瞬間のはじけ・滞在で昇る
        if c.clip == "intro" and 0.05 < Ti < 0.45:
            a = (Ti - 0.05) / 0.4
            fxv.stamp(cv.L, self.kit.star["gold"], 360 + 30 * a, self.BOTTOM - 40 - 120 * math.sin(math.pi * a), 0.9 * math.sin(math.pi * a))
        tau = T - 1.0
        if c.clip == "intro" and 0 < tau < 1.0:
            b = self.burst
            sp = Splat()
            live = tau < b["life"]
            for s in range(3):
                ts = max(0.0, tau - s * 0.02)
                x = nx + b["vx"][live] * ts
                y = self.BOTTOM - 80 + b["vy"][live] * ts + 380 * ts * ts
                y = np.maximum(y, H * 2 / 3 + 10)
                fade = (1 - tau / b["life"][live]) ** 1.2
                sp.add_screen(x, y, b["col"][live] * (fade * 5.5)[:, None])
            sp.into(cv)
            # 割れた瞬間の星（大きめ）と、あたたかい閃き
            R = np.random.default_rng(205)
            for j in range(12):
                ang = -math.pi / 2 + (R.random() - 0.5) * 2.6
                d = (60 + 120 * R.random()) * ease_out(min(1.0, tau / 0.5))
                x = nx + math.cos(ang) * d
                y = max(self.BOTTOM - 70 + math.sin(ang) * d * 0.8, H * 2 / 3 + 16)
                fxv.stamp(cv.L, self.kit.star["gold" if j % 3 else "white"], x, y, 0.9 * (1 - min(1.0, tau / 0.7)) ** 1.3)
            glow(cv, nx, self.BOTTOM - 60, 110, GOLD * 0.9 + WHITE * 0.3, 0.8 * math.exp(-tau / 0.15))
        g = self.sparks
        a_ = g.age(c)
        amb = ease(ramp(Ti, 1.1, 1.6)) * out_k
        if amb > 0.003:
            sp = Splat()
            x = nx + (g.r[:, 0] - 0.5) * 140 + 18 * np.sin(6.283 * (a_ + g.r[:, 1]))
            y = self.BOTTOM - 70 - a_ * 300
            ok = y > H * 2 / 3 + 10
            kd = np.sin(np.pi * a_) ** 2 * (0.6 + 1.6 * g.r[:, 2]) * amb
            sp.add_screen(x[ok], y[ok], (np.where(g.r[:, 3:4] < 0.7, GOLD, AMBER) * kd[:, None] * 3.6)[ok])
            sp.into(cv)
        self.finish_hero(hero, bloom=0.0)
        return cv.finish(bloom=0.55, edge=self.edge), None
