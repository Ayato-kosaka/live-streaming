"""段5（2,000〜4,999円・橙）: 冬服のあやとが、夜の観覧車のてっぺんのゴンドラでマグを掲げる（#1034）。

流れ（秒は登場の動画の時刻）:
- 前兆 0〜0.7: 紫の夜空が降りてきて星が瞬き、雪が降り始める。観覧車の電球がてっぺんから順に灯る
- 登場 0.4〜1.0: 箱の真ん中に、あやとのゴンドラを大きく（箱の幅の 56%）。ゴンドラが揺れながら止まる
- 山場 1.0〜2.55: あやとがマグを高く掲げて「かんぱい！」。金の粒がはじけ、湯気がふわっと昇る。金の光の筋が2本、
  観覧車の輪をぐるりと走る。あやとは手を振る。2.2〜2.55 にカメラが引いて、観覧車の全体と、下のメリーゴーランドと
  マーケットの屋台が見えてくる。ゴンドラは上の帯（観覧車のてっぺん）
- キャラ絵が出たら（2.6）: 金の輪がはじける。2,000円からは全面の景色のまま
- 滞在（3秒の輪）: マグを掲げる → 手を振る。ゴンドラがゆっくり揺れ、マグから湯気が昇る。観覧車の電球が輪を回り、
  金の光の筋が輪を走る。屋台とメリーゴーランドの灯りが瞬き、雪が箱ぜんぶに降り続ける
- 締め 1.2秒: 電球が消えて、景色が溶ける

あやとが決めた中身（#1034）: 冬服のあやと（マフラー・耳あて・湯気の立つマグ）が夜の観覧車のてっぺんでマグを掲げる。
下にメリーゴーランドとマーケットの屋台。2,000円からは画面を大きく使う。
段3・段4 で決めたこと: 登場でいちばん大きく（主役の組が箱の幅の 55% 以上）→ キャラ絵が出る前に上の帯へ退く。
光の筋・粒は録画の 1.0／2.5 秒ではっきり見える明るさと太さ。キャラ絵が出る秒は 11月の 2.2 から 2.6 に遅らせた
（大きく見せる時間を取るため。登場の長さ 3.2 は同じ）。

観覧車は輪を回さない（脚ごと描いた絵なので）。かわりに電球の灯りが輪を回り、金の光の筋が輪の上を走る。
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
from xmas_kit import burst, emit_masked, snowfall, soft_dot, trail  # noqa: E402

ART = os.path.join(ME, "..", "..", "fx_art", "christmas", "t5")

# 世界（落ち着いたあとの画面）の置き場
HX, HY, H_HERO = 360.0, 22.0, 232.0     # あやとのゴンドラ（吊り輪の x・y・高さ）。上の帯に収まる
WCX, WCY, WR = 360.0, 352.0, 330.0      # 観覧車の輪（真ん中・半径）。てっぺんの吊り輪があやとのゴンドラ
WHEEL_C = (0.5, 252 / 629)              # 観覧車の絵の中の輪の真ん中（割合）
MUG = (112 / 566, 150 / 800)            # あやとの絵の中のマグの口
H_GOND = 200.0                          # ほかのゴンドラの高さ
SETTLE = (2.2, 2.55)
START_ZOOM, START_X, START_Y = 2.45, 360.0, 330.0   # 登場のあいだ、ゴンドラを箱の真ん中に大きく（吊り輪が y 330）
CHEERS = 1.0
VIOLET_SKY = (np.float32([0.05, 0.04, 0.17]), np.float32([0.20, 0.12, 0.33]))


class Scene(Stage):
    TIER = 5
    INTRO, STAY, OUTRO, REVEAL = 3.2, 3.0, 1.2, 2.6
    VARIANTS = ("full",)
    FRONT = {"full": True}

    def setup(self):
        a = lambda n: Art.load(os.path.join(ART, n + ".webp"))
        self.mug, self.wave = a("ayato_mug"), a("ayato_wave")
        self.wheel, self.gond, self.carousel, self.market = a("wheel"), a("gondola"), a("carousel"), a("market")
        self.wheel_win = fs.window_mask(self.wheel.levels[0])
        self.car_win = fs.window_mask(self.carousel.levels[0])
        self.market_win = fs.window_mask(self.market.levels[0])
        # 電球が輪を回る模様のための、観覧車の絵の中の角度
        ih, iw = self.wheel_win.shape
        yy, xx = np.mgrid[0:ih, 0:iw].astype(np.float32)
        self.wheel_ang = (np.arctan2(yy - WHEEL_C[1] * ih, xx - WHEEL_C[0] * iw) / (2 * np.pi)) % 1.0
        yy = np.arange(H, dtype=np.float32)[:, None] / H
        top, bot = VIOLET_SKY
        self.sky_col = np.broadcast_to(((1 - yy) * top + yy * bot)[:, None, :], (H, W, 3)).astype(np.float32).copy()
        R = np.random.default_rng(5101)
        self.stars = np.stack([R.random(130) * W, R.random(130) ** 1.3 * 900, R.random(130), R.random(130), R.random(130)], -1)
        self.snow_far = Loop(120, 5102, cycles=(1, 1))
        self.snow_mid = Loop(170, 5103, cycles=(2, 2))
        self.near = Loop(140, 5104, cycles=(3, 3))
        self.flake = {r: soft_dot(r) for r in (1.6, 3.0, 6.5)}
        self.steam = Loop(8, 5105, cycles=(1, 1))
        self.dust = Loop(50, 5106, cycles=(1, 2))
        self.glitter = Loop(115, 5109, cycles=(1, 2))
        self.bok = Loop(22, 5107, cycles=(2, 2))
        self.sparkles = np.stack([30 + R.random(22) * 660, 30 + R.random(22) * 600, R.random(22), R.random(22)], -1)

    # ---------------- カメラ（2D）: 登場はゴンドラを箱の真ん中に 2.45 倍。観覧車・ゴンドラは p=1、空・屋台は動かない
    def cam(self, c):
        k = ease(ramp(c.Ti, *SETTLE))
        return lerp(START_ZOOM, 1.0, k), lerp(START_X, HX, k), lerp(START_Y, HY, k)

    def at(self, c, x, y, p=1.0):
        z, sx, sy = self.cam(c)
        s = 1 + (z - 1) * p
        px, py = HX + (sx - HX) * p, HY + (sy - HY) * p
        return px + (x - HX) * s, py + (y - HY) * s, s

    def hero(self, c):
        """返す: (絵, ゴンドラの揺れ（度）, sy)"""
        T, u = c.T, c.u
        swing = 4.0 * math.sin(2 * math.pi * 2 * (T - self.INTRO) / self.STAY)
        if c.clip == "intro":
            if T < 0.4:
                return None
            # 揺れながら止まる（0.4〜1.0）。そのあとは滞在と同じ式のゆれへ
            settle = 12 * math.exp(-(T - 0.4) * 3.0) * math.sin((T - 0.4) * 9)
            sw = settle + swing * ease(ramp(T, 1.0, 1.6))
            pop = math.exp(-((T - CHEERS) / 0.06) ** 2)
            if 1.55 <= T < 2.45:
                q = (T - 1.55) / 0.9
                return self.wave, sw + 5 * math.sin(2 * math.pi * 3 * q), 1.0
            return self.mug, sw, 1 + 0.05 * pop
        s = (c.ph * self.STAY) % self.STAY if c.clip == "stay" else 0.0
        if c.clip == "stay" and 1.5 <= s < 3.0:
            q = (s - 1.5) / 1.5
            return self.wave, swing + 4 * math.sin(2 * math.pi * 3 * q), 1.0
        return self.mug, swing, 1.0

    def draw(self, c):
        Ti, T, u = c.Ti, c.T, c.u
        intro = c.clip == "intro"
        out_k = 1 - ease(ramp(u, 0.3, 1.0))
        back, front, heroc = Canvas(), Canvas(), Canvas()
        sp_b, sp_f = Splat(), Splat()
        lit = ease(ramp(Ti, 0.3, 1.0))
        sky_k = ease(ramp(Ti, 0.0, 0.6)) * out_k

        # ---- 夜空と星
        drop = np.clip((Ti * 2000 - np.arange(H, dtype=np.float32)) / 500, 0, 1)[:, None]
        a_ = (np.full((H, W), 0.93, np.float32) * drop * sky_k).astype(np.float32)
        back.over((self.sky_col * a_[..., None]).astype(np.float32), a_)
        st = self.stars
        tw = (0.5 + 0.5 * np.sin(2 * np.pi * (c.ph * (1 + (st[:, 2] * 3).astype(int)) + st[:, 3]))) ** 3
        sp_b.add_screen(st[:, 0], st[:, 1], (WHITE * 1.1)[None] * ((0.15 + 0.7 * tw * st[:, 4]) * sky_k)[:, None])
        for j, (x, y, r0, r1) in enumerate(self.sparkles):
            tw1 = max(0.0, math.sin(6.283 * (c.ph * (1 + int(r0 * 2)) + r1))) ** 3
            fxv.stamp(back.L, self.kit.star["white" if j % 3 else "gold"], x, y, (0.2 + 0.6 * tw1) * sky_k)

        # ---- マーケットの屋台（下の端）とメリーゴーランド（右下）。動かない
        mk = ease(ramp(Ti, 0.2, 0.8)) * out_k
        dst = sprite(back, self.carousel, 590.0, 1150.0, 330.0, k=mk, grade=np.float32([0.95, 0.93, 1.0]) * (0.75 + 0.25 * lit))
        emit_masked(back, self.car_win, dst, lambda yy, xx: 0.65 + 0.35 * np.sin(6.283 * (c.ph * 3 - xx * 4 + yy * 2)), 0.9 * mk)
        dst = sprite(back, self.market, 360.0, 1282.0, 900.0 * self.market.h / self.market.w, k=mk,
                     grade=np.float32([0.92, 0.92, 1.0]) * (0.75 + 0.25 * lit))
        emit_masked(back, self.market_win, dst, lambda yy, xx: 0.75 + 0.25 * np.sin(6.283 * (c.ph * 2 + xx * 9 + yy * 3)), 0.7 * mk)

        # ---- 観覧車（輪とほかのゴンドラ）。電球の灯りが輪を回る
        wk = ease(ramp(Ti, 0.25, 0.7)) * out_k
        wx, wy, ws = self.at(c, WCX, WCY, 1.0)
        wh = 2 * WR * ws / (self.wheel.w / self.wheel.h)
        # 寄っているあいだは、観覧車を奥のぼけにする（大きく引き伸ばした絵の粗さを見せず、主役のゴンドラを立たせる）
        dof = 3.2 * (ws - 1)
        dst = sprite(back, self.wheel, wx, wy - WHEEL_C[1] * wh, wh, anchor=(0.5, 0.0), k=wk, blur=dof,
                     grade=np.float32([1.0, 0.96, 0.92]) * (0.75 + 0.25 * lit))
        ang = self.wheel_ang
        on_t = ease(ramp(Ti, 0.3, 0.9))
        emit_masked(back, self.wheel_win, dst, lambda yy, xx: np.clip(on_t * 1.6 - ((ang + 0.25) % 1.0), 0, 1)
                    * (0.45 + 0.55 * np.sin(np.pi * ((ang * 12 - c.ph * 6) % 1.0)) ** 4), 1.1 * wk)
        for j in range(1, 6):
            th = -math.pi / 2 + j * math.pi / 3
            gx, gy, gs = self.at(c, WCX + WR * math.cos(th), WCY + WR * math.sin(th), 1.0)
            sprite(back, self.gond, gx, gy, H_GOND * gs, anchor=(0.5, 0.02), rot=5 * math.sin(2 * math.pi * (c.ph * 2 + j * 0.17)), k=wk, blur=dof,
                   grade=np.float32([0.95, 0.92, 0.95]) * (0.7 + 0.3 * lit))

        # ---- あやとのゴンドラ（主役だけの層。てっぺんの吊り輪から下がる）
        hp = self.hero(c)
        hx, hy, hs = self.at(c, HX, HY, 1.0)
        if hp is not None:
            art, sw, sy = hp
            hk = ease(ramp(T, 0.4, 0.55)) if intro else (out_k if c.clip == "outro" else 1.0)
            sprite(heroc, art, hx, hy, H_HERO * hs * sy, anchor=(0.5, 0.02), rot=sw, k=hk, rim=0.4, light_dir=(-0.3, -1.0))
            # マグの口（ゴンドラの揺れで回る）
            mx_ = hx + (MUG[0] - 0.5) * H_HERO * hs * self.mug.w / self.mug.h
            my_ = hy + (MUG[1] - 0.02) * H_HERO * hs
            ca, sa = math.cos(math.radians(sw)), math.sin(math.radians(sw))
            dx, dy = mx_ - hx, my_ - hy
            mx_, my_ = hx + ca * dx - sa * dy, hy + sa * dx + ca * dy
            self.steam_puffs(c, back, mx_, my_, hs, hk)
            if intro:
                burst(back, self.kit, mx_, my_, (T - CHEERS) / 0.6, 5108, n=18, spread=60 * hs, cols=("gold", "white"))
                fxv.stamp(back.L, self.kit.flare_s, mx_, my_, 0.6 * math.exp(-((T - CHEERS) / 0.08) ** 2))

        # ---- 金の光の筋: 観覧車の輪の上を2本が走る（1.5秒で1周。登場の 1.0 から）
        sk = ease(ramp(Ti, CHEERS, CHEERS + 0.3)) * out_k
        if sk > 0.003:
            tau = np.linspace(0, 0.32, 600)
            for j in range(4):
                th = -math.pi / 2 + 2 * math.pi * ((T - self.INTRO) / 1.5 + j * 0.25 - tau)
                rr = WR * 1.03
                x = wx + np.cos(th) * rr * ws
                y = wy + np.sin(th) * rr * ws
                trail(self.kit, back, sp_b, x, y, (1 - tau / 0.32) ** 1.4, sk, head="white" if j else "gold")

        # ---- 雪（箱ぜんぶに。奥・中は back、手前は front）
        amb = ease(ramp(Ti, 0.1, 0.8)) * out_k
        snowfall(c, ((self.snow_far, self.flake[1.6], 0.5, 1300, 14, back, -30), (self.snow_mid, self.flake[3.0], 0.65, 1340, 24, back, -30),
                     (self.near, self.flake[6.5], 0.5, 1420, 40, front, -30)), amb)
        sp_b.into(back)

        # ---- キャラ絵が出る瞬間: 真ん中の後ろから金の輪
        rv = (T - self.REVEAL) / 0.7 if intro else 9
        if 0 <= rv < 1:
            yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
            rr_ = 110 + 300 * ease_out(rv)
            d = np.hypot(xx - 360, (yy - 760) * 1.12) - rr_
            band = np.exp(-(d / (8 + 26 * rv)) ** 2) * (1 - rv) ** 1.4
            back.emit(band[..., None] * (GOLD * 1.1 + WHITE * 0.5 + AMBER * 0.3) * 1.2)
            glow(back, 360, 760, 220, GOLD * 0.7 + WHITE * 0.2, 0.6 * (1 - rv) ** 2)
        out_b = back.finish(bloom=0.8, edge=self.edge)
        out_b = over_rgba(self.finish_hero(heroc, bloom=0.4), out_b)

        # ---- front（光と粒だけ）: 手前の雪（snowfall で足した）・金の粉・ぼけ玉・キャラ絵のふちの星
        dd = self.dust
        a3 = dd.age(c)
        x = 60 + dd.r[:, 0] * 600 + 30 * np.sin(6.283 * (a3 + dd.r[:, 1]))
        y = 1250 - a3 * 1150
        tw = (0.5 + 0.5 * np.sin(6.283 * (a3 * 3 + dd.r[:, 2]))) ** 2
        sp_f.add_screen(x, y, GOLD[None] * (np.sin(np.pi * a3) ** 1.5 * (0.2 + 0.6 * dd.r[:, 3] ** 2) * tw * sk)[:, None])
        sp_f.into(front)
        # かんぱいの金と白の紙吹雪（きらきらの星が、箱ぜんぶにゆらゆら降る）
        g = self.glitter
        a4 = g.age(c)
        for j in range(g.n):
            rr = g.r[j]
            x = rr[0] * W + 36 * math.sin(6.283 * (a4[j] * 1.5 + rr[1]))
            y = -30 + a4[j] * 1330
            tw_ = (0.5 + 0.5 * math.sin(6.283 * (a4[j] * 4 + rr[2]))) ** 2
            kk = math.sin(math.pi * a4[j]) ** 0.6 * (0.3 + 0.5 * tw_) * sk
            if kk > 0.02:
                fxv.stamp(front.L, self.kit.star[("gold", "white", "pink")[j % 3]], x, y, kk)
        for j in range(self.bok.n):
            rr = self.bok.r[j]
            a1 = self.bok.age(c)[j]
            x = (rr[0] * 1.1 - 0.05) * W + 30 * math.sin(6.283 * (a1 + rr[1]))
            y = H * (0.95 - 0.8 * a1) - rr[2] * 120
            kk = math.sin(math.pi * a1) ** 2 * (0.07 + 0.07 * rr[3]) * amb
            spr = self.kit.bokeh_spr(26 + rr[4] * 40, j % 3, [GOLD, AMBER * 0.8 + WHITE * 0.3, GOLD * 0.7 + WHITE * 0.4][j % 3], 6 + rr[5] * 6)
            fxv.stamp(front.L, spr, x, y, kk)
        if intro:
            rv = T - self.REVEAL
            if 0 <= rv < 0.9:
                R = np.random.default_rng(78)
                for k in range(24):
                    ang_ = R.random() * 6.283
                    dist = 170 + 220 * ease_out(rv / 0.9) * (0.6 + 0.4 * R.random())
                    fxv.stamp(front.L, self.kit.star["gold" if k % 3 else "white"], 360 + math.cos(ang_) * dist * 0.9,
                              760 + math.sin(ang_) * dist * 1.05, 0.85 * (1 - rv / 0.9) ** 1.5 * (0.5 + 0.5 * R.random()))
        return out_b, self.finish_front(front, bloom=0.7)

    def steam_puffs(self, c, cv, x0, y0, hs, k):
        """マグから昇る湯気（物の層。白くやわらかい丸がゆらゆら昇って消える）"""
        if k <= 0.003:
            return
        g = self.steam
        a = g.age(c)
        for j in range(g.n):
            aj = a[j]
            x = x0 + (6 * math.sin(6.283 * (aj * 1.4 + g.r[j, 0])) + 10 * aj) * hs
            y = y0 - (6 + aj * 90) * hs
            rad = (5 + 12 * aj) * hs
            al = 0.45 * math.sin(math.pi * aj) * (1 - 0.3 * aj) * k
            if al <= 0.004:
                continue
            x0_, x1_ = max(0, int(x - 3 * rad)), min(W, int(x + 3 * rad))
            y0_, y1_ = max(0, int(y - 3 * rad)), min(H, int(y + 3 * rad))
            if x1_ <= x0_ or y1_ <= y0_:
                continue
            yy, xx = np.mgrid[y0_:y1_, x0_:x1_].astype(np.float32)
            aa = (np.exp(-((xx - x) ** 2 + (yy - y) ** 2) / (rad * rad)) * al).astype(np.float32)
            cv.over((aa[..., None] * np.float32([0.95, 0.95, 1.0])).astype(np.float32), aa, x0_, y0_)
