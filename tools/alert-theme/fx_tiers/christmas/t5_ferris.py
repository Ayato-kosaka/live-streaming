"""段5（2,000〜4,999円・橙）: 冬服のあやとが、夜の観覧車のてっぺんのゴンドラでマグを掲げる（#1034）。

流れ（秒は登場の動画の時刻）:
- 前兆 0〜0.7: 紫の夜空が降りてきて星が瞬き、雪が降り始める。観覧車の電球がてっぺんから順に灯る
- 登場 0.4〜1.0: 箱の真ん中に、あやとのゴンドラを大きく（箱の幅の 56%）。ゴンドラが揺れながら止まる
- 山場 1.0〜2.95: あやとがマグを高く掲げて「かんぱい！」。金の粒がはじけ、湯気がふわっと昇る。金の光の筋が2本、
  観覧車の輪をぐるりと走る。あやとは手を振る。2.6〜2.95 にカメラが引いて、観覧車の全体と、下のメリーゴーランドと
  マーケットの屋台が見えてくる。ゴンドラは上の帯（観覧車のてっぺん）
- キャラ絵が出たら（3.0）: 金の輪がはじける。2,000円からは全面の景色のまま
- 滞在（3秒の輪）: マグを掲げる → 手を振る。ゴンドラがゆっくり揺れ、マグから湯気が昇る。観覧車の電球が輪を回り、
  金の光の筋が輪を走る。屋台とメリーゴーランドの灯りが瞬き、雪が箱ぜんぶに降り続ける
- 締め 1.2秒: 電球が消えて、景色が溶ける

あやとが決めた中身（#1034）: 冬服のあやと（マフラー・耳あて・湯気の立つマグ）が夜の観覧車のてっぺんでマグを掲げる。
下にメリーゴーランドとマーケットの屋台。2,000円からは画面を大きく使う。
段3・段4 で決めたこと: 登場でいちばん大きく（主役の組が箱の幅の 55% 以上）→ キャラ絵が出る前に上の帯へ退く。
光の筋・粒は録画の 1.0／2.5 秒ではっきり見える明るさと太さ。キャラ絵が出る秒は 11月の 2.2 から 3.0 に遅らせた
（大きく見せる時間を取るため。登場の長さ 3.2 は同じ）。

観覧車は輪を回さない（脚ごと描いた絵なので）。かわりに電球の灯りが輪を回り、金の光の筋が輪の上を走る。

3回目（2026-11-23。あやと「2,000以上のキャラ出てからの背景もっと派手にしたい」）: 11月の段5 は、キャラ絵が出たあとも
大聖堂と夕日の湖の描いた全面の景色が残る。12月は紫の夜空の色の板に、観覧車・屋台・メリーゴーランドの切り抜きを貼っただけで、
平たく暗い板に見えた。
- 背景を ChatGPT で描いた1枚の板（`plate.webp`: 灯りの観覧車・クリスマスマーケット・メリーゴーランド・星空。人は無し。
  一次確認の絵の世界で、落ち着いたときの置き場に合わせた構図）にする。てっぺんの吊り金具に、あやとのゴンドラを下げる
- 滞在は、電球が輪を回り、屋台とメリーゴーランドの灯りが瞬き、サーチライトが首を振り、夜空に花火が上がり、雪と紙吹雪が降る
- 滞在のあやとを 11月の段5 の主役より小さくしない（高さ 210 → 216）
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
from xmas_kit import burst, snowfall, soft_dot, trail  # noqa: E402
from xmas_t345 import plate_emit, plate_layer  # noqa: E402

ART = os.path.join(ME, "..", "..", "fx_art", "christmas", "t5")

# 世界（落ち着いたあとの画面）の置き場
HX, H_HERO = 360.0, 216.0               # あやとのゴンドラ（吊り輪の x・高さ）。揺れても下の端が 256 より上（上の帯）
MUG = (112 / 566, 150 / 800)            # あやとの絵の中のマグの口
# 背景の板（ChatGPT で描いた 1024×1536）。板の中の観覧車の輪（真ん中の x・y の割合・半径の幅に対する割合）と、
# いちばん上の吊り金具（x・y の割合）。描いた絵を測って入れる
PW, PH = 1024, 1536
P_WHEEL = (0.5, 0.27, 0.39)
P_HANG = (0.5, 0.012)
# 落ち着いたときの板の倍率と居場所: 板の吊り金具を (HX, 14) に。板は箱を覆う（幅 891・高さ 1336）
PLATE_S = 0.87
PLATE_X0 = HX - P_HANG[0] * PW * PLATE_S
PLATE_Y0 = 14.0 - P_HANG[1] * PH * PLATE_S
HY = PLATE_Y0 + P_HANG[1] * PH * PLATE_S
WCX, WCY, WR = PLATE_X0 + P_WHEEL[0] * PW * PLATE_S, PLATE_Y0 + P_WHEEL[1] * PH * PLATE_S, P_WHEEL[2] * PW * PLATE_S
# 花火（上がる秒・x・y・色）。夜空の上の隅と、観覧車の輪の外。滞在の 3秒ごとにくり返す
FIREWORKS = ((3.35, 110.0, 150.0, "gold"), (4.15, 615.0, 110.0, "pink"), (4.95, 640.0, 470.0, "cyan"), (5.7, 85.0, 430.0, "gold"))
SETTLE = (2.6, 2.95)
START_ZOOM, START_X, START_Y = 2.7, 360.0, 330.0    # 登場のあいだ、ゴンドラを箱の真ん中に大きく（幅 56%。吊り輪が y 330）
CHEERS = 1.0
VIOLET_SKY = (np.float32([0.05, 0.04, 0.17]), np.float32([0.20, 0.12, 0.33]))


class Scene(Stage):
    TIER = 5
    INTRO, STAY, OUTRO, REVEAL = 3.2, 3.0, 1.2, 3.0
    VARIANTS = ("full",)
    FRONT = {"full": True}

    def setup(self):
        a = lambda n: Art.load(os.path.join(ART, n + ".webp"))
        self.mug, self.wave = a("ayato_mug"), a("ayato_wave")
        # 背景の板（前掛けの RGBA）。上の端は溶かす（登場で寄ると板の上の端が箱の中へ入るので、その上の夜空とつなぐ）
        self.plate = load_rgba(os.path.join(ART, "plate.webp"))
        assert self.plate.shape[:2] == (PH, PW), self.plate.shape
        fade = np.clip(np.arange(PH, dtype=np.float32) / 60.0, 0, 1)[:, None, None]
        self.plate = np.ascontiguousarray(self.plate * fade)
        self.plate_win = fs.window_mask(self.plate)
        # 灯りの瞬き方を決める、板の中の観覧車からの角度と距離（2分の1の格子。plate_emit の small=2 と同じ）
        ih, iw = self.plate_win[::2, ::2].shape
        yy, xx = np.mgrid[0:ih, 0:iw].astype(np.float32)
        dx, dy = (xx / iw - P_WHEEL[0]) * PW, (yy / ih - P_WHEEL[1]) * PH
        self.p_ang = ((np.arctan2(dy, dx) / (2 * np.pi)) % 1.0).astype(np.float32)
        self.p_rad = (np.hypot(dx, dy) / (P_WHEEL[2] * PW)).astype(np.float32)
        self.fw = {name: np.random.default_rng(5110 + k).random((40, 3)) for k, (_, _, _, name) in enumerate(FIREWORKS)}
        yy = np.arange(H, dtype=np.float32)[:, None] / H
        top, bot = VIOLET_SKY
        self.sky_col = np.broadcast_to(((1 - yy) * top + yy * bot)[:, None, :], (H, W, 3)).astype(np.float32).copy()
        R = np.random.default_rng(5101)
        self.stars = np.stack([R.random(130) * W, R.random(130) ** 1.3 * 900, R.random(130), R.random(130), R.random(130)], -1)
        self.snow_far = Loop(120, 5102, cycles=(1, 1))
        self.snow_mid = Loop(100, 5103, cycles=(2, 2))
        self.near = Loop(28, 5104, cycles=(3, 3))
        self.flake = {r: soft_dot(r) for r in (1.6, 3.0, 6.5)}
        self.steam = Loop(8, 5105, cycles=(1, 1))
        self.dust = Loop(24, 5106, cycles=(1, 2))
        self.glitter = Loop(36, 5109, cycles=(1, 2))
        self.bok = Loop(12, 5107, cycles=(2, 2))
        self.sparkles = np.stack([30 + R.random(22) * 660, 30 + R.random(22) * 600, R.random(22), R.random(22)], -1)

    # ---------------- カメラ（2D）: 登場はゴンドラを箱の真ん中に 2.45 倍。観覧車・ゴンドラは p=1、空・屋台は動かない
    def cam(self, c):
        """落ち着いたあとも、滞在の輪でゆっくり漂う（左右 6px・上下 3px）。11月の段5 のカメラの漂いと同じ考えで、
        描いた景色ぜんぶが少しずつ動く（動かさないと、灯りと粒だけが動く平たい板に見え、動きの量も 11月の 0.86倍だった）。
        漂いは滞在の位相の周期（bump は滞在の頭で 0・速さも 0）なので、登場の終わりから滞在へ跳ねずにつながる"""
        k = ease(ramp(c.Ti, *SETTLE))
        d = ease(ramp(c.Ti, SETTLE[1], self.INTRO)) if c.clip == "intro" else 1.0
        dz = 0.0  # 寄り引きは焼くと重い（VP8 は平行移動のほうが得意）。左右と上下だけ漂う
        dx = 6.0 * (c.bump(1, 0.25) - 0.5) * d
        dy = 3.0 * c.bump(2) * d
        return lerp(START_ZOOM, 1.0, k) + dz, lerp(START_X, HX, k) + dx, lerp(START_Y, HY, k) + dy

    def at(self, c, x, y, p=1.0):
        z, sx, sy = self.cam(c)
        s = 1 + (z - 1) * p
        px, py = HX + (sx - HX) * p, HY + (sy - HY) * p
        return px + (x - HX) * s, py + (y - HY) * s, s

    def hero(self, c):
        """返す: (絵, ゴンドラの揺れ（度）, sy)"""
        T, u = c.T, c.u
        swing = 2.5 * math.sin(2 * math.pi * 2 * (T - self.INTRO) / self.STAY)
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
            return self.wave, swing + 2.5 * math.sin(2 * math.pi * 3 * q), 1.0
        return self.mug, swing, 1.0

    def draw(self, c):
        Ti, T, u = c.Ti, c.T, c.u
        intro = c.clip == "intro"
        if c.clip == "outro":
            # 締めは、輪で動くもの（雪・紙吹雪・灯り・サーチライト）を滞在の頭の姿で止めて、消えるだけにする。
            # 動きながら消えると、締めの短い予算では画質が 28dB に届かなかった（2026-11-23 の焼き: 27.0dB）
            c.ph = 0.0
        out_k = 1 - ease(ramp(u, 0.15, 0.85))
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

        # ---- 背景の板（灯りの観覧車・マーケット・メリーゴーランド・星空）。観覧車とあやとのゴンドラと一緒に寄る（視差 1）。
        # 寄っているあいだは、板を奥のぼけにする（大きく引き伸ばした絵の粗さを見せず、主役のゴンドラを立たせる）
        pk = ease(ramp(Ti, 0.2, 0.75)) * out_k
        X0, Y0, ps = self.at(c, PLATE_X0, PLATE_Y0, 1.0)
        S_ = PLATE_S * ps
        dof = 3.0 * (ps - 1)
        pr, pa = plate_layer(self.plate, X0, Y0, S_, blur=dof)
        grade = np.float32([0.95, 0.94, 1.0]) * (0.72 + 0.28 * lit)
        back.over((pr * grade * pk).astype(np.float32), (pa * pk).astype(np.float32))
        # 描かれた灯り: 観覧車の電球は輪を回り（てっぺんから順に灯る）、屋台とメリーゴーランドの灯りは瞬く
        on_t = ease(ramp(Ti, 0.3, 0.9))
        ang, rad = self.p_ang, self.p_rad
        wheel = np.clip((1.12 - rad) / 0.06, 0, 1)
        chase = np.clip(on_t * 1.6 - ((ang + 0.25) % 1.0), 0, 1) * (0.4 + 0.6 * np.sin(np.pi * ((ang * 14 - c.ph * 6) % 1.0)) ** 4)
        plate_emit(back, self.plate_win, X0, Y0, S_, lambda yy, xx: wheel * chase * 1.3
                   + (1 - wheel) * on_t * (0.55 + 0.45 * np.sin(6.283 * (c.ph * 3 + xx * 9 - yy * 4)) ** 2), 1.0 * pk)
        wx, wy, ws = self.at(c, WCX, WCY, 1.0)

        # ---- 遊園地のサーチライト（下から夜空を5本が首を振る。やわらかい光なので、焼いても軽い。滞在の輪の周期）。
        # 板より後に足す（先に足すと、板の不透明な絵に覆われて消える）
        self.searchlights(c, back, sky_k * ease(ramp(Ti, 0.5, 1.2)))

        # ---- 夜空のきらめく星（板より後に。滞在の輪で瞬く）
        for j, (x, y, r0, r1) in enumerate(self.sparkles):
            tw1 = max(0.0, math.sin(6.283 * (c.ph * (1 + int(r0 * 2)) + r1))) ** 3
            fxv.stamp(back.L, self.kit.star["white" if j % 3 else "gold"], x, y, (0.2 + 0.6 * tw1) * sky_k)

        # ---- 花火（夜空の上の隅と、観覧車の輪の外。滞在の輪でくり返す）
        self.fireworks(c, back, sp_b, sky_k * ease(ramp(Ti, 1.0, 1.4)))

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
        back_glitter = Canvas()

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
                # 紙吹雪は back に（front は焼くと重い。front の予算は1通りの 15%）
                fxv.stamp(back_glitter.L, self.kit.star[("gold", "white", "pink")[j % 3]], x, y, kk)
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
        out_b = over_rgba(back_glitter.finish(bloom=0.3, edge=self.edge), out_b)
        return out_b, self.finish_front(front, bloom=0.7)

    def fireworks(self, c, cv, sp, k):
        """花火（上がって、はじけて、金の粒が垂れて消える。1つ 1.3秒）"""
        if k <= 0.003:
            return
        cols = {"gold": GOLD * 1.3 + WHITE * 0.3, "pink": PINK * 1.2 + WHITE * 0.3, "cyan": CYAN * 1.1 + WHITE * 0.4}
        # 締めは滞在の頭の姿で止める（動きながら消えると、締めの短い予算で画質が落ちる。draw の頭の c.ph = 0 と同じ）
        T = self.INTRO if c.clip == "outro" else c.T
        for t0, x, y, name in FIREWORKS:
            ages = [T - (t0 + n * self.STAY) for n in range(-2, 3) if t0 + n * self.STAY >= t0 - self.STAY]
            for age in [a for a in ages if 0 <= a < 1.6]:
                R = self.fw[name]
                if age < 0.3:
                    # 昇る光
                    q = age / 0.3
                    fxv.stamp(cv.L, self.kit.star["gold"], x, y + 160 * (1 - ease_out(q)), 0.6 * k)
                    continue
                a = age - 0.3
                q = a / 1.3
                ang = R[:, 0] * 2 * np.pi
                d = (70 + 50 * R[:, 1]) * (1 - np.exp(-a * 4.0))
                px, py = x + np.cos(ang) * d, y + np.sin(ang) * d * 0.9 + 60 * a * a
                tw = 0.55 + 0.45 * np.sin(2 * np.pi * (a * 5 + R[:, 2]))
                kd = (1 - q) ** 1.4 * tw * k
                sp.add_screen(px, py, cols[name][None] * kd[:, None] * 1.4, coc=np.full(len(px), 1.4))
                if a < 0.12:
                    glow(cv, x, y, 34, cols[name] * 0.6, 0.8 * (1 - a / 0.12) * k)

    def searchlights(self, c, cv, k):
        """下の屋台のあたりから昇る光の柱が5本、首を振る（1本ずつ周期をずらす）"""
        if k <= 0.003:
            return
        if not hasattr(self, "_sl_grid"):
            h, w = 160, 90
            ys = np.linspace(0, H, h, dtype=np.float32)[:, None]
            xs = np.linspace(0, W, w, dtype=np.float32)[None, :]
            self._sl_grid = (ys, xs)
        ys, xs = self._sl_grid
        out = np.zeros((ys.shape[0], xs.shape[1], 3), np.float32)
        beams = ((80.0, 2, 0.0, GOLD), (230.0, 3, 0.5, WHITE * 0.7 + PINK * 0.3), (380.0, 2, 0.15, WHITE * 0.8 + CYAN * 0.2),
                 (520.0, 3, 0.7, GOLD * 0.8 + WHITE * 0.2), (660.0, 2, 0.4, AMBER * 0.6 + GOLD * 0.4))
        for j, (bx, cyc, ph, col) in enumerate(beams):
            ang = math.radians(32 * math.sin(2 * math.pi * (c.ph * cyc + ph)))
            by = 1080.0
            dx, dy = xs - bx, by - ys
            along = dx * math.sin(ang) + dy * math.cos(ang)
            across = dx * math.cos(ang) - dy * math.sin(ang)
            wdt = 22 + 0.2 * np.clip(along, 0, None)
            beam = np.exp(-(across / wdt) ** 2) * np.clip(along / 120, 0, 1) * np.exp(-np.clip(along, 0, None) / 900)
            # 板（不透明の絵）の上に足すので弱く（前は空と観覧車のあいだに挟まって半分隠れていた。0.58 のままだと真ん中が白く飛んだ。0.2 だと動きが 11月の 0.86倍）
            out += beam[..., None] * col * 0.3
        up = cv2.resize(out, (W, H), interpolation=cv2.INTER_CUBIC)
        cv.emit((np.clip(up, 0, None) * k).astype(np.float32))

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
