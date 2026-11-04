"""段1（〜199円・青）: ピポが、落ち葉から顔を出す（画面の下の隅だけ。暗くしない）。

叩き台ペラ一の流れ（秒は登場の動画の時刻）:
- 前兆 0〜0.2: 下の隅の落ち葉の山が、かさっと揺れる
- 登場 0.2〜0.8: ピポがぴょこっと顔を出す（0.6 で投げた人のキャラ絵）
- 山場 0.8〜1.4: 前足を振ると、紅葉がふわっと舞い上がる
- 滞在（2秒の輪）: きょろっと字のほうを見上げる。1周に1回、もう一度前足を振って紅葉を舞わせる
- 締め 1.0秒: 落ち葉の中へもぐり、葉が1枚だけ舞って消える

箱の下 30%（y 896 より下）から出さない（配信の景色を汚さない）。手で広げた箱は配信画面の下で切れるので、
山の下の端は SAFE_BOTTOM（1140）に置く。見えるのは 896〜1140 の帯なので、ピポは山から上半身だけ出す大きさにした。
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from fx_stage import *  # noqa: E402,F401,F403

ART = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "fx_art", "t1")


class Scene(Stage):
    TIER = 1
    INTRO, STAY, OUTRO, REVEAL = 1.4, 2.0, 1.0, 0.6
    VARIANTS = ("full",)
    FRONT = {"full": False}
    KBPS = {"full-back": 700}

    X, BOTTOM = 130.0, SAFE_BOTTOM  # 落ち葉の山の真ん中と、下の端（キャラ絵の枠 137〜583 の左の外に寄せる）

    def setup(self):
        self.pile = Art.load(os.path.join(ART, "pile.webp"))
        self.jump = Art.load(os.path.join(ART, "pipo_jump.webp"))
        self.look = Art.load(os.path.join(ART, "pipo_look.webp"))
        self.leaves = [load_rgba(os.path.join(ART, f"leaf{i}.webp"), 90) for i in range(6)]
        R = np.random.default_rng(101)
        n = 14
        # 上へは控えめに（見えるのは山の上の 90px ほど）、横へ大きく散らす
        self.toss = dict(vx=(R.random(n) - 0.3) * 340, vy=-(170 + R.random(n) * 120), spin=(R.random(n) - 0.5) * 8,
                         sc=0.28 + R.random(n) * 0.22, kind=R.integers(0, 6, n), ph=R.random(n),
                         # 舞い上がるのはピポの左右から（真ん中から出すと、ピポの顔に葉がかぶる）
                         x0=np.where(np.arange(n) % 2 == 0, -1.0, 1.0) * (62 + R.random(n) * 60))
        self.toss["vx"] = np.sign(self.toss["x0"]) * np.abs(self.toss["vx"]) + self.toss["vx"] * 0.15
        self.glint = Loop(18, 102, cycles=(1, 2))
        self.mote = Loop(9, 103, cycles=(1, 1))

    def leaf_toss(self, cv, age, k, strength=1.0):
        """前足を振ったときに舞い上がる紅葉（age 秒め）。上がって、ゆらゆら落ちる"""
        if age < 0 or age > 1.9 or k <= 0.003:
            return
        t = self.toss
        for j in range(len(t["vx"])):
            if strength < 1 and j % 2:
                continue
            g = 520.0
            x = self.X + t["x0"][j] + t["vx"][j] * (1 - math.exp(-2.5 * age)) / 2.5 + 22 * math.sin(6.283 * (age * 1.3 + t["ph"][j]))
            vy = t["vy"][j] * strength
            y = self.BOTTOM - 100 + (t["ph"][j] - 0.5) * 60 + vy * age * math.exp(-1.2 * age) + 0.5 * g * age * age * 0.3
            top = H * 0.70 + 10
            y = max(y, top + 20)  # 下の 30% から出さない
            fade = (1 - ease(ramp(age, 1.3, 1.9))) * k
            spr = sprite_rot(self.leaves[t["kind"][j]], t["spin"][j] * age + t["ph"][j] * 6.283, t["sc"][j])
            put_sprite(cv, spr, x, y, fade)

    def draw(self, c):
        Ti, T, u = c.Ti, c.T, c.u
        cv = Canvas()
        out_k = 1 - ease(ramp(u, 0.35, 1.0))
        # 落ち葉の山: かさっと揺れて現れる
        pk = ease(ramp(Ti, 0.0, 0.15)) * (1 - ease(ramp(u, 0.6, 1.0)))
        wob = math.sin(Ti * 40) * math.exp(-Ti * 6) * 4 if c.clip == "intro" else 0.0
        sq = 1 + 0.06 * math.exp(-((Ti - 0.12) / 0.06) ** 2) * (c.clip == "intro")
        # 前に足もとのやわらかい光（暗い配信の上で、山が沈まない）
        glow(cv, self.X, self.BOTTOM - 40, 120, GOLD * 0.22 + AMBER * 0.1, 0.6 * pk)
        # ピポ（山の後ろ）: 0.2〜0.75 でぴょこっと
        rise = back_out(ramp(Ti, 0.2, 0.62), 2.0)
        down = ease_in(ramp(u, 0.12, 0.5))
        dy = (1 - rise) * 190 + down * 200
        in_toss = False
        tossing = [a for a, _ in c.events(0.82, self.STAY, first=0.82, dur=1.9)]
        if c.clip == "intro":
            # 登場の終わりの前に見上げる姿へ（姿の入れ替えを、本のつなぎ目に重ねない）
            in_toss = 0.2 <= Ti < 1.22
        else:
            ph = c.ph
            in_toss = 0.62 <= ph < 0.92
        # 締めは滞在の頭と同じ姿（見上げる）から始めて、もぐる前に跳ねる姿へ
        art = self.jump if in_toss or (c.clip == "outro" and u > 0.12) else self.look
        hop = 0.0
        for age in tossing:
            hop = max(hop, math.sin(math.pi * clamp01(age / 0.35)) * 16)
        bob = 4 * c.osc(1) if c.clip != "intro" else 0.0
        h = 180.0 if art is self.jump else 160.0
        x = self.X + (6 if art is self.jump else 0) + wob
        y = self.BOTTOM - 50 + dy - hop + bob
        clip_y = self.BOTTOM - 44
        sprite(cv, art, x, y, h, anchor=(0.5, 0.92), k=ease(ramp(Ti, 0.18, 0.3)) * out_k,
               sy=1 + 0.05 * math.sin(math.pi * clamp01((Ti - 0.2) / 0.3)) * (c.clip == "intro"), clip_below=clip_y + 60,
               rim=0.35, light_dir=(0.6, -1.0))
        # 山（手前）。ピポの下半分を隠す
        sprite(cv, self.pile, self.X + wob * 0.5, self.BOTTOM, 112.0, anchor=(0.5, 1.0), sx=sq, sy=2 - sq, k=pk, rim=0.3, light_dir=(0.3, -1.0))
        # 舞い上がる紅葉（山場と、滞在の輪で1回ずつ）
        for age in tossing:
            self.leaf_toss(cv, age, out_k, 1.0 if age < 9 else 0.6)
        # 締め: 葉が1枚だけ舞って消える
        if c.clip == "outro":
            a = u
            x = self.X + 40 + 60 * a
            y = self.BOTTOM - 120 - 90 * math.sin(math.pi * a * 0.8)
            spr = sprite_rot(self.leaves[2], a * 4.0, 0.42)
            put_sprite(cv, spr, x, y, 1 - ease(ramp(a, 0.6, 1.0)))
        # きらめき（落ち葉の上で、滞在の輪で瞬く）
        g = self.glint
        a_ = g.age(c)
        amb = ease(ramp(Ti, 0.5, 1.0)) * out_k
        for j in range(g.n):
            r = g.r[j]
            x = self.X + (r[0] - 0.5) * 280
            y = self.BOTTOM - 30 - r[1] * 160 - a_[j] * 40
            tw = math.sin(math.pi * a_[j]) ** 4
            if y > H * 0.70 + 12 and tw > 0.02:
                fxv.stamp(cv.L, self.kit.star["gold" if j % 3 else "white"], x, y, 0.45 * tw * amb)
        # ぴょこっと出た瞬間、頭のまわりに金の星がぽんと散る（一度きり）
        if c.clip == "intro":
            pa = (Ti - 0.42) / 0.5
            if 0 <= pa < 1:
                for j in range(10):
                    ang = math.pi * (1.05 + 0.9 * j / 9)
                    d = 40 + 70 * ease_out(pa)
                    x = self.X + 10 + math.cos(ang) * d * 1.3
                    y = max(self.BOTTOM - 140 + math.sin(ang) * d * 0.55, H * 0.70 + 14)
                    fxv.stamp(cv.L, self.kit.star["gold" if j % 3 else "white"], x, y, 0.8 * (1 - pa) ** 1.4)
        # 山から昇る、あたたかいぼけ玉（滞在の輪で）
        for j in range(self.mote.n):
            r = self.mote.r[j]
            a1 = self.mote.age(c)[j]
            x = self.X + (r[0] - 0.5) * 220 + 14 * math.sin(6.283 * (a1 + r[1]))
            y = self.BOTTOM - 40 - a1 * 170
            kk = math.sin(math.pi * a1) ** 2 * (0.12 + 0.1 * r[2]) * amb
            if y > H * 0.70 + 16 and kk > 0.003:
                spr = self.kit.bokeh_spr(7 + r[3] * 7, j % 2, (GOLD * 0.9 + AMBER * 0.3) if j % 2 else (WHITE * 0.6 + GOLD * 0.5), 2.5)
                fxv.stamp(cv.L, spr, x, y, kk)
        return cv.finish(bloom=0.5, edge=self.edge), None
