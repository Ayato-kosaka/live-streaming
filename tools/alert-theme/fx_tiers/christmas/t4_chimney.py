"""段4（1,000〜1,999円・黄）: 雪の屋根の煙突から、サンタのあやとがすぽんと飛び出して手を振る（#1034）。

流れ（秒は登場の動画の時刻）:
- 前兆 0〜0.9: 夜空が降りてきて星が瞬き、満月が金の光の筋を落とす。雪が舞い始める
- 登場 0.5〜1.45: 画面の真ん中に雪の屋根と煙突。軒の電球が左から点き、煙突がかたかた揺れて雪をふく（1.0・1.25）
- 山場 1.45〜2.6: すぽん！とあやとが飛び出し（ばんざい）、雪がはじけて金の輪が閃く。金の光の筋が2本、
  あやとのまわりを回りながら昇る。あやとは手を振る。1.95〜2.55 にカメラが引いて、屋根と煙突が上の帯へ
- キャラ絵が出たら（2.6〜3.3）: 金の輪がはじけ、景色がすっと引いて、縁（上の帯の屋根と煙突と満月・下の隅の町）だけが残る
- 滞在（3秒の輪）: あやとは手を振り続け、金の光の筋が2本、まわりを回る。月が瞬き、雪が降る
- 締め 1.0秒: あやとが煙突にすぽっと戻り、雪がふいて、景色が消える

あやとが決めた中身（#1034）: サンタあやとが煙突からすぽんと飛び出して手を振る。雪の屋根、満月と金の光の筋。
1,000円の段は「全面で出て、revealAt で景色が引いて縁だけ残る」（11月の段4 と同じ。`fx_check.py` の THIN が数える）。
あやとは、キャラ絵が出る前に上の帯（headroom 0.2 = 256px より上）へ。煙突の口を y 212 に置き、あやとは口から上だけを
描く（腰から下は煙突の中。口の手前の雪を、あやとの上に重ねる）。`fx_hero.py` はあやとだけの層で、キャラ絵に隠れないかを数える。

絵は一次確認を描いた会話の続きで描いた（`fx_art/christmas/t4/`）。あやとのポーズ絵3枚（ばんざい・手を振る2枚）は、
同じ大きさの透明の地に、顔の位置をそろえて置いてある（切り替えても顔が跳ねない）。手を振る2枚は手のひらの傾きだけが違う。
カメラは 2D の視差（近い屋根ほど大きく動く）で、景色の板を拡げて・ずらして写す。
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
from fx_stage import *  # noqa: E402,F401,F403
import fx_stage as fs  # noqa: E402

ART = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "fx_art", "christmas", "t4")

CX, MOUTH = 232.0, 212.0          # 煙突の口（手前の縁）の、落ち着いたあとの画面の位置
H_AYATO = 299.0                   # あやとのポーズ絵（透明の地ごと）の高さ。顔の幅が 85px 前後
A_CUT = 430 / 665                 # ポーズ絵の中で、煙突の口に来る高さ（ベルトのすぐ下）
H_CHIM = 188.0                    # 煙突。口の幅が、あやとの腰より広くなる大きさ
CHIM_MOUTH = 108 / 418            # 煙突の絵の中で、口の手前の縁の高さ
RX, R_TOP, W_ROOF = 326.0, 272.0, 470.0    # 屋根（真ん中の x・絵の上の端の y・幅）。雪の上の面が煙突の下の 1/4 を隠す
MOON = (560.0, 170.0, 170.0)      # 満月（x・y・直径）
VW, VBOT = 900.0, 1278.0          # 町（幅・下の端）
POP = 1.45                        # すぽん！
SETTLE = (1.95, 2.55)             # カメラが引いて、屋根と煙突が上の帯へ
START_DY, START_ZOOM = 290.0, 1.22
WAVE = 0.1875                     # 手を振る絵を切り替える間（滞在 3秒で 16回＝偶数回なので、継ぎ目でつながる）


class Scene(Stage):
    TIER = 4
    INTRO, STAY, OUTRO, REVEAL = 3.4, 3.0, 1.0, 2.6
    VARIANTS = ("full",)
    FRONT = {"full": True}
    # キャラ絵が出たら、景色が薄く引く秒（一度きりの動きなので、登場の終わり 3.4 までに引ききる）
    THIN = (2.62, 3.3)

    def setup(self):
        a = lambda n: Art.load(os.path.join(ART, n + ".webp"))
        self.pop = a("ayato_pop")
        self.wave = [a("ayato_wave0"), a("ayato_wave1")]
        self.chim, self.roof, self.moon, self.village = a("chimney"), a("roof"), a("moon"), a("village")
        # 煙突の口の手前の雪だけ（あやとの腰の上に重ねる）。口は楕円なので、楕円の下の縁より下、雪のかさの下の端
        # （絵の 0.51）より上を残す。れんがまで含めると、屋根が隠しているはずの煙突の根もとが屋根の上に出た
        ch = self.chim.levels[0].copy()
        hh, ww = ch.shape[:2]
        xs = np.arange(ww, dtype=np.float32)
        cx_, rx_, cy_, ry_ = 0.457 * ww, 0.268 * ww, 0.225 * hh, 0.043 * hh
        edge = cy_ + ry_ * np.sqrt(np.clip(1 - ((xs - cx_) / rx_) ** 2, 0, 1))
        ys = np.arange(hh, dtype=np.float32)[:, None]
        keep = np.clip((ys - edge[None, :]) / 2.0, 0, 1) * np.clip((0.52 * hh - ys) / (0.03 * hh), 0, 1)
        self.lip = Art(np.ascontiguousarray(ch * keep[..., None]))
        self.roof_win = fs.window_mask(self.roof.levels[0])
        self.village_win = fs.window_mask(self.village.levels[0])
        # 夜空（上は深い紺、下ほど町の灯りで少し明るい）
        yy = np.arange(H, dtype=np.float32)[:, None] / H
        top, bot = np.float32([0.035, 0.05, 0.16]), np.float32([0.10, 0.13, 0.30])
        self.sky_col = np.broadcast_to(((1 - yy) * top + yy * bot)[:, None, :], (H, W, 3)).astype(np.float32).copy()
        self.sky_a = np.full((H, W), 0.93, np.float32)
        R = np.random.default_rng(4101)
        n = 150
        self.stars = np.stack([R.random(n) * W, R.random(n) ** 1.3 * 1000, R.random(n), R.random(n), R.random(n)], -1)
        self.keep = self.thin_keep()
        self.snow = Loop(170, 4102, cycles=(1, 2))
        self.near = Loop(40, 4103, cycles=(1, 1))
        self.dust = Loop(60, 4104, cycles=(1, 2))
        R = np.random.default_rng(4105)
        m = 90
        self.burst_v = np.stack([(R.random(m) - 0.5) * 520, -(180 + R.random(m) * 420), R.random(m)], -1)
        R = np.random.default_rng(4106)
        self.edge_pts = []
        while len(self.edge_pts) < 18:
            x, y = R.random() * W, 40 + R.random() * 1220
            if self.keep[int(y), int(x)] > 0.25:
                self.edge_pts.append((x, y, R.random(), R.random()))

    # ---------------- カメラ（2D の視差）。屋根・煙突・あやとは p=1、月 0.3、町と星はほぼ動かない
    def cam(self, c):
        k = ease(ramp(c.Ti, *SETTLE))
        return lerp(START_ZOOM, 1.0, k), lerp(START_DY, 0.0, k)

    def at(self, c, x, y, p=1.0):
        z, dy = self.cam(c)
        s = 1 + (z - 1) * p
        return CX + (x - CX) * s, MOUTH + (y - MOUTH) * s + dy * p, s

    def thin_keep(self):
        """景色が薄く引いたあとに残す縁（0〜1。画面の濃さに掛ける）。真ん中（キャラ絵と字の所）は 0。
        - 上の帯: 煙突・屋根の雪の上の端・満月は、その絵の形のまま残す（形で残さないと、まわりの夜空が四角や丸の
          暗い板になって浮いた）。夜空は上の端に薄く
        - 下の隅: 町の家々"""
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        sm = lambda v: v * v * (3 - 2 * v)
        top = sm(np.clip((240 - yy) / 150, 0, 1)) * 0.32
        cv = Canvas()  # 落ち着いたあと（カメラ 1 倍・ずれ 0）の形
        sprite(cv, self.chim, CX, MOUTH - CHIM_MOUTH * H_CHIM, H_CHIM, anchor=(0.5, 0.0))
        chim = cv.A.copy()
        cv = Canvas()
        sprite(cv, self.roof, RX, R_TOP, W_ROOF * self.roof.h / self.roof.w, anchor=(0.5, 0.0))
        roof = cv.A * sm(np.clip((330 - yy) / 50, 0, 1))
        cv = Canvas()
        sprite(cv, self.moon, MOON[0], MOON[1], MOON[2], anchor=(0.5, 0.5))
        moon = cv.A
        shape = cv2.GaussianBlur(np.maximum(np.maximum(chim, roof), moon), (0, 0), 1.0)
        corner = np.maximum(*(sm(np.clip((300 - np.hypot(xx - cx, yy - H)) / 170, 0, 1)) for cx in (0.0, float(W)))) * 0.8
        return np.maximum(np.maximum(top, shape), corner).astype(np.float32)

    def thin_at(self, c):
        return ease(ramp(c.Ti, *self.THIN))

    # ---------------- あやと: 口から上へ。返す (絵, 口の画面の y, 持ち上がり 0〜1.1, sx, sy)
    def ayato(self, c):
        T, Ti, u = c.T, c.Ti, c.u
        if c.clip == "intro" and T < POP:
            return None
        if c.clip == "intro":
            r = back_out(ramp(T, POP, 1.72), 2.2)
            st = math.exp(-((T - 1.56) / 0.09) ** 2)
            sq = math.exp(-((T - 1.8) / 0.06) ** 2)
            sx, sy = 1 - 0.08 * st + 0.06 * sq, 1 + 0.12 * st - 0.08 * sq
        else:
            r, sx, sy = 1.0, 1.0, 1.0
        if c.clip == "outro":
            # すぽっと戻る（少し伸び上がってから）
            r = 1.0 + 0.06 * math.sin(math.pi * clamp01(u / 0.12)) * (u < 0.12) - ease_in(ramp(u, 0.1, 0.38)) * 1.05
        if c.clip == "intro" and T < 1.88:
            art = self.pop
        else:
            art = self.wave[int(math.floor((T - self.INTRO) / WAVE + 1e-6)) % 2]
        return art, r, sx, sy

    def draw(self, c):
        Ti, T, u = c.Ti, c.T, c.u
        intro = c.clip == "intro"
        out_k = 1 - ease(ramp(u, 0.25, 1.0))
        back, front, hero, lipc = Canvas(), Canvas(), Canvas(), Canvas()
        sp_b, sp_f = Splat(), Splat()
        thin = self.thin_at(c)
        lit = ease(ramp(Ti, 0.2, 1.2))

        # ---- 夜空（前兆で上から降りてくる）
        sky_k = ease(ramp(Ti, 0.0, 0.7)) * out_k
        drop = np.clip((Ti * 1800 - np.arange(H, dtype=np.float32)) / 500, 0, 1)[:, None]
        a_ = (self.sky_a * drop * sky_k).astype(np.float32)
        back.over((self.sky_col * a_[..., None]).astype(np.float32), a_)
        # 星（滞在の輪で瞬く）
        st = self.stars
        tw = (0.5 + 0.5 * np.sin(2 * np.pi * (c.ph * (1 + (st[:, 2] * 3).astype(int)) + st[:, 3]))) ** 3
        on = np.clip((Ti - 0.1 - st[:, 1] / 1400) / 0.3, 0, 1)
        sp_b.add_screen(st[:, 0], st[:, 1], (WHITE * 1.1)[None] * (0.15 + 0.7 * tw * st[:, 4])[:, None]
                        * (on * sky_k)[:, None])

        # ---- 満月（前兆で明るくなり、光の筋を落とす）
        mx, my, ms = self.at(c, MOON[0], MOON[1], 0.3)
        mk = ease(ramp(Ti, 0.1, 0.8)) * out_k
        sprite(back, self.moon, mx, my, MOON[2] * ms, anchor=(0.5, 0.5), k=mk,
               grade=np.float32([1.0, 0.97, 0.9]) * (0.75 + 0.25 * lit))
        mg = (0.35 + 0.25 * lit + 0.12 * c.osc(1)) * mk
        glow(back, mx, my, MOON[2] * 0.62, GOLD * 0.55 + WHITE * 0.25, 0.55 * mg)
        glow(back, mx, my, MOON[2] * 1.3, GOLD * 0.25, 0.35 * mg)

        # ---- 町（下の端。窓は前兆の終わりから灯る）
        vk = ease(ramp(Ti, 0.2, 0.9)) * out_k
        vx, vy, vs = self.at(c, 360.0, VBOT, 0.06)
        dst = sprite(back, self.village, vx, vy, VW * self.village.h / self.village.w * vs, k=vk,
                     grade=np.float32([0.9, 0.92, 1.0]) * (0.7 + 0.3 * lit))
        self.emit_on(back, self.village_win, dst, lambda yy, xx: np.clip((Ti - 0.5 - xx * 0.4) / 0.2, 0, 1)
                     * (0.8 + 0.2 * np.sin(6.283 * (c.ph * 2 + xx * 9 + yy * 3))), 0.6 * vk)

        # ---- 屋根と煙突（真ん中から、カメラが引くと上の帯へ）
        rk = ease(ramp(Ti, 0.3, 0.75)) * out_k
        shake = 0.0
        if intro and 0.85 < T < POP + 0.05:
            shake = 2.6 * ease(ramp(T, 0.85, POP)) * math.sin(T * 95)
        hx, hy, hs = self.at(c, CX + shake, MOUTH, 1.0)
        chim_h = H_CHIM * hs
        sprite(back, self.chim, hx, hy - CHIM_MOUTH * chim_h, chim_h, anchor=(0.5, 0.0), k=rk,
               grade=np.float32([1.0, 0.95, 0.92]) * (0.75 + 0.25 * lit), rim=0.4 * lit, light_dir=(0.6, -1.0))
        px_, py_, ps = self.at(c, RX, R_TOP, 1.0)
        rh = W_ROOF * self.roof.h / self.roof.w * ps
        dst = sprite(back, self.roof, px_, py_, rh, anchor=(0.5, 0.0), k=rk,
                     grade=np.float32([0.95, 0.95, 1.0]) * (0.72 + 0.28 * lit), rim=0.35 * lit, light_dir=(0.6, -1.0))
        self.emit_on(back, self.roof_win, dst, lambda yy, xx: np.clip((Ti - 0.6 - xx * 0.4) / 0.1, 0, 1)
                     * (0.75 + 0.25 * np.sin(6.283 * (c.ph * 3 + xx * 6)))
                     * (1 + 1.2 * np.exp(-((T - POP - 0.05 - xx * 0.2) / 0.08) ** 2) * intro), 0.8 * rk)

        # ---- 煙突が雪をふく（すぽん！の前に2回）
        for t0, nn in ((1.0, 14), (1.25, 18)):
            self.puff(c, sp_b, hx, hy, hs, T - t0, nn, seed=int(t0 * 100), k=rk * intro)

        # ---- あやと（主役だけの層）。口の手前の縁より下は描かない（煙突の中）
        ay = self.ayato(c)
        if ay is not None:
            art, r, sx, sy = ay
            h = H_AYATO * hs
            bob = 3.0 * math.sin(2 * math.pi * 2 * (T - self.INTRO) / self.STAY) * ease(ramp(T, 1.9, 2.4))
            rot = 2.0 * math.sin(2 * math.pi * (T - self.INTRO) / self.STAY) * ease(ramp(T, 1.9, 2.4))
            y_anchor = hy + (1 - r) * h * 0.72 - bob
            sprite(hero, art, hx, y_anchor, h * sy, anchor=(0.5, A_CUT), rot=rot, sx=sx, k=1.0, rim=0.5,
                   light_dir=(0.6, -1.0), clip_below=hy + 5 * hs)
            # 口の手前の雪を、あやとの腰の上に重ねる
            sprite(lipc, self.lip, hx, hy - CHIM_MOUTH * chim_h, chim_h, anchor=(0.5, 0.0), k=rk,
                   grade=np.float32([1.0, 0.95, 0.92]) * (0.75 + 0.25 * lit), rim=0.4 * lit, light_dir=(0.6, -1.0))

        # ---- すぽん！: 雪がはじけ、金の輪が閃く
        self.pop_burst(c, back, sp_b, sp_f, front, hx, hy, hs)

        # ---- 金の光の筋（2本。あやとのまわりを回りながら昇る）
        self.streaks(c, back, front, sp_b, sp_f, hx, hy, hs, out_k)

        # ---- 雪（前兆から。滞在の輪で降り続ける）
        amb = ease(ramp(Ti, 0.2, 1.0)) * out_k
        g = self.snow
        a1 = g.age(c)
        x = g.r[:, 0] * W + 26 * np.sin(6.283 * (a1 * 2 + g.r[:, 1]))
        y = -20 + a1 * 1320
        kd = np.sin(np.pi * a1) ** 0.5 * (0.25 + 0.35 * (g.r[:, 2] < 0.3)) * amb * (1 - 0.5 * thin)
        sp_b.add_screen(x, y, (WHITE * 1.3)[None] * kd[:, None], coc=np.where(g.r[:, 2] < 0.3, 2.0, 0.0))
        sp_b.into(back)

        # ---- キャラ絵が出たら、景色を縁だけに引く（前掛けなので、色・覆い・光を同じ濃さで掛ければ層ごと薄くなる）
        if thin > 0.002:
            m = 1 - thin * (1 - self.keep)
            back.P *= m[..., None]
            back.A *= m
            back.L *= m[..., None]
            lipc.P *= m[..., None]
            lipc.A *= m
            # 月のまわりの光は、形で残した月の外にも少し（光だけ）
            glow(back, mx, my, MOON[2] * 0.62, GOLD * 0.55 + WHITE * 0.25, 0.3 * mg * thin)
        # ---- 引いたあとの縁のきらめき
        ek = thin * out_k
        if ek > 0.003:
            for j, (x, y, r0, r1) in enumerate(self.edge_pts):
                tw = max(0.0, math.sin(6.283 * (c.ph * (1 + int(r0 * 2)) + r1))) ** 4
                fxv.stamp(back.L, self.kit.star["gold" if j % 3 else "white"], x, y + 5 * c.osc(1, r0), (0.3 + 0.3 * r0) * tw * ek)
        # ---- キャラ絵が出る瞬間: 真ん中の後ろから金の輪
        rv = (T - self.REVEAL) / 0.7 if intro else 9
        if 0 <= rv < 1:
            yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
            rr = 110 + 300 * ease_out(rv)
            d = np.hypot(xx - 360, (yy - 760) * 1.12) - rr
            band = np.exp(-(d / (8 + 26 * rv)) ** 2) * (1 - rv) ** 1.4
            back.emit(band[..., None] * (GOLD * 1.1 + WHITE * 0.5 + np.float32([1.0, 0.3, 0.25]) * 0.25) * 1.2)
            glow(back, 360, 760, 220, GOLD * 0.7 + WHITE * 0.2, 0.6 * (1 - rv) ** 2)

        rays = (mx, my, (0.3 + 0.25 * lit + 0.1 * c.osc(1)) * mk * (1 - 0.7 * thin), 0.9)
        out_b = back.finish(bloom=0.8, edge=self.edge, rays=rays)
        out_b = over_rgba(self.finish_hero(hero, bloom=0.45), out_b)
        out_b = over_rgba(lipc.finish(bloom=0.0, edge=self.edge), out_b)

        # ---- front（光と粒だけ）: 手前の大きな雪・金の粉・キャラ絵のふちの星
        calm = 1 - 0.55 * thin
        n = self.near
        a2 = n.age(c)
        x = n.r[:, 0] * W + 40 * np.sin(6.283 * (a2 + n.r[:, 1]))
        y = -40 + a2 * 1380
        kd = np.sin(np.pi * a2) ** 1.5 * (0.18 + 0.25 * n.r[:, 2]) * amb * calm
        sp_f.add_screen(x, y, (WHITE * 1.2)[None] * kd[:, None], coc=4.0 + 4.0 * n.r[:, 3])
        dd = self.dust
        a3 = dd.age(c)
        x = 60 + dd.r[:, 0] * 600 + 30 * np.sin(6.283 * (a3 + dd.r[:, 1]))
        y = 1250 - a3 * 1150
        tw = (0.5 + 0.5 * np.sin(6.283 * (a3 * 3 + dd.r[:, 2]))) ** 2
        kd = np.sin(np.pi * a3) ** 1.5 * (0.2 + 0.6 * dd.r[:, 3] ** 2) * tw * ease(ramp(Ti, 1.4, 2.4)) * out_k * calm
        sp_f.add_screen(x, y, GOLD[None] * kd[:, None])
        sp_f.into(front)
        if intro:
            rv = T - self.REVEAL
            if 0 <= rv < 0.9:
                R = np.random.default_rng(78)
                for k in range(24):
                    ang = R.random() * 6.283
                    dist = 170 + 220 * ease_out(rv / 0.9) * (0.6 + 0.4 * R.random())
                    fxv.stamp(front.L, self.kit.star["gold" if k % 3 else "white"], 360 + math.cos(ang) * dist * 0.9,
                              760 + math.sin(ang) * dist * 1.05, 0.85 * (1 - rv / 0.9) ** 1.5 * (0.5 + 0.5 * R.random()))
        return out_b, self.finish_front(front, bloom=0.7)

    # ---------------- 描かれた灯り（窓・電球）を、on(yy, xx) の濃さで光らせる
    def emit_on(self, cv, win, dst, on, k):
        if dst is None or k <= 0.003:
            return
        ih, iw = win.shape
        yy = np.linspace(0, 1, ih, dtype=np.float32)[:, None]
        xx = np.linspace(0, 1, iw, dtype=np.float32)[None, :]
        em = (win * on(yy, xx))[..., None] * (GOLD * 0.9 + WHITE * 0.45) * 0.75 * k
        r = fs.warp_into(em.astype(np.float32), np.float32([[0, 0], [iw, 0], [iw, ih], [0, ih]]), dst)
        if r is not None:
            im, ox, oy = r
            cv.emit(im[..., :3], ox, oy)

    def puff(self, c, sp, hx, hy, hs, age, n, seed, k):
        """煙突の口から、雪がぽふっとふく"""
        if not (0 <= age < 0.7) or k <= 0.003:
            return
        R = np.random.default_rng(seed)
        vx = (R.random(n) - 0.5) * 160
        vy = -(60 + R.random(n) * 120)
        x = hx + (R.random(n) - 0.5) * 50 * hs + vx * age
        y = hy - 6 + vy * age + 260 * age * age
        kd = (1 - age / 0.7) ** 1.2 * k * (0.6 + 0.4 * R.random(n))
        sp.add_screen(x, y, (WHITE * 1.2)[None] * kd[:, None], coc=2.0 + 3.0 * R.random(n))

    def pop_burst(self, c, back, sp_b, sp_f, front, hx, hy, hs):
        """すぽん！（1.45）: 口から雪のかたまりが四方へはじけ、金の閃きと輪"""
        if c.clip != "intro":
            return
        age = c.T - POP
        if 0 <= age < 1.1:
            v = self.burst_v
            x = hx + v[:, 0] * age * hs
            y = hy - 8 + v[:, 1] * age * hs + 700 * age * age
            kd = (1 - age / 1.1) ** 1.4 * (0.7 + 0.6 * v[:, 2])
            near = v[:, 2] > 0.7
            sp_b.add_screen(x[~near], y[~near], (WHITE * 1.3)[None] * kd[~near, None], coc=2.0 + 2.0 * v[~near, 2])
            sp_f.add_screen(x[near], y[near], (WHITE * 1.1)[None] * kd[near, None] * 0.6, coc=4.0)
        if 0 <= age < 0.6:
            fl = math.exp(-((age - 0.04) / 0.07) ** 2)
            fxv.stamp(back.L, self.kit.flare, hx, hy - 30 * hs, 0.9 * fl)
            streak(back, hx, hy - 30 * hs, 0.6 * fl, col=GOLD * 0.6 + WHITE * 0.5)
            q = age / 0.6
            R = np.random.default_rng(4107)
            for j in range(18):
                ang = 2 * math.pi * j / 18 + R.random() * 0.2
                d = (30 + 150 * ease_out(q)) * hs
                fxv.stamp(back.L, self.kit.star["gold" if j % 3 else "white"], hx + math.cos(ang) * d,
                          hy - 40 * hs + math.sin(ang) * d * 0.55, 0.9 * (1 - q) ** 1.3)

    def streaks(self, c, back, front, sp_b, sp_f, hx, hy, hs, out_k):
        """金の光の筋（彗星のような頭と尾）。すぽん！のあと口から渦を巻いて昇り、滞在では 1.5秒で1周（3秒で2周）"""
        T = c.T
        grow = ease_out(ramp(c.Ti, POP + 0.05, 2.3))
        if grow <= 0.002:
            return
        k = grow * out_k
        cy = hy - 110 * hs
        for j in range(2):
            n = 260
            tt = np.linspace(0, 0.42, n)
            ang = 2 * math.pi * ((T - self.INTRO) / 1.5 + j * 0.5) - 2 * math.pi * tt
            rad = lerp(0.2, 1.0, grow)
            ex, ey = 150 * hs * rad, 52 * hs * rad
            tilt = math.radians(-14 if j == 0 else 12)
            lx, ly = np.cos(ang) * ex, np.sin(ang) * ey
            x = hx + lx * math.cos(tilt) - ly * math.sin(tilt)
            y = cy + lx * math.sin(tilt) + ly * math.cos(tilt) - (1 - grow) * 60 * hs
            fade = (1 - tt / 0.42) ** 1.6
            col = (GOLD * 1.3 + WHITE * 0.5)[None] * (fade * 0.3 * k)[:, None]
            far = np.sin(ang) < 0   # 奥（あやとの後ろ）は back、手前は front
            sp_b.add_screen(x[far], y[far], col[far], coc=np.full(far.sum(), 1.2))
            sp_f.add_screen(x[~far], y[~far], col[~far] * 0.8, coc=np.full((~far).sum(), 1.2))
            fxv.stamp((back if far[0] else front).L, self.kit.star["gold"], float(x[0]), float(y[0]), 0.9 * k)
