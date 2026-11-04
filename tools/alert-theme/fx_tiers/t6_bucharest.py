"""段6（5,000〜9,999円・マゼンタ）: ブカレスト。夜の議事堂（国民の館）に光が走り、花火が上がる。

叩き台ペラ一の流れ（秒は登場の動画の時刻）:
- 前兆 0〜1.2: 画面がすっと暗くなり、議事堂の屋根の線を光が端から端までなぞる
- 登場 1.2〜2.6: 窓が下から順に灯り、大通りを光の筋が駆け上がる。あやとが手持ち花火を掲げて跳び込む
- 山場 2.6〜4.0: マゼンタと金の大きな花火が3つ、続けざまに開く（2.6・2.75・2.9）。3.2 で投げた人のキャラ絵
- 滞在（3秒の輪）: 降る火の粉の中で、次の花火が2つ開く（1周に2つ。登場の2つと同じ玉が3秒ごとに）
- 締め 1.2秒: 最後の大輪が開いて、光が雪のように降りて消える

full は叩き台どおりの全面（夜空・議事堂・大通り。縁を暗く）。light は議事堂を光の線で描き、花火は光だけ。
キャラが出たら線と大きな花火を消し、滞在は上の角の小さな花火と縁のきらめき、角のあやとだけにする。

花火は「粒が少し前にいた所」を何点もたどって尾にする（`Shell`）。点の丸を散らすだけだと、
開いた花火が「ぼやけた玉」に見えた（2026-11-04 の下書き）。尾は点の間が 2px を超えないように
明るさを割り振るので、速く飛ぶ開きはじめも、止まりかけて垂れる終わりも、同じ太さの光の筋に見える。
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from fx_stage import *  # noqa: E402,F401,F403
import fx_stage as fs  # noqa: E402

ART = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "fx_art")
GOLD_HOT = GOLD * 1.5 + WHITE * 0.3


def art(*p, **kw):
    return Art.load(os.path.join(ART, *p), **kw)


class Shell:
    """花火の玉1つ。打ち上げ（launch 秒、下から昇る光）→ 開く（粒が尾を引いて広がる）→ 垂れて消える。

    head・tail は頭と尾の色。core=(半径の割合, 頭の色, 尾の色, 粒の数) で内側にもう一重。
    glitter は寿命の終わりの何割で、粒がちかちか瞬くか（金の冠菊）。px は世界の1が画面で何 px か（尾の明るさの割り振り）"""

    S = 30

    def __init__(self, seed, center, radius, head, tail, n=150, life=1.8, launch=0.45, trail=0.16, drag=3.4,
                 gravity=2.0, glitter=0.0, core=None, px=15.0, rise=9.0):
        R = np.random.default_rng(seed)
        self.c = np.asarray(center, np.float64)
        self.life, self.launch, self.trail, self.drag, self.g = life, launch, trail, drag, gravity
        self.glitter, self.px, self.rise = glitter, px, rise
        vs, hs, ts = [], [], []
        for (rk, hc, tc, m) in [(1.0, head, tail, n)] + ([core] if core else []):
            i = np.arange(m) + 0.5
            phi = np.arccos(1 - 2 * i / m)
            th = math.pi * (1 + 5 ** 0.5) * i + R.random() * 6.283
            d = np.stack([np.cos(th) * np.sin(phi), np.sin(th) * np.sin(phi), np.cos(phi)], -1)
            d = d + R.normal(scale=0.07, size=d.shape)
            d /= np.linalg.norm(d, axis=1, keepdims=True)
            vs.append(d * (radius * rk * (0.9 + 0.1 * R.random(m)))[:, None])
            hs.append(np.tile(np.asarray(hc, np.float32), (m, 1)) * (0.8 + 0.4 * R.random((m, 1))).astype(np.float32))
            ts.append(np.tile(np.asarray(tc, np.float32), (m, 1)))
        self.v = np.concatenate(vs)
        self.head = np.concatenate(hs)
        self.tail = np.concatenate(ts)
        self.tw = R.random(len(self.v))
        self.wob = R.random(3)

    def burst_point(self):
        return self.c

    def light(self, age, k):
        """age（打ち上げからの秒）の光る点 → (P, rgb) か None"""
        if k <= 0.003 or age < 0:
            return None
        if age < self.launch:
            u = age / self.launch
            ss = np.linspace(0, 1, 18)
            uu = np.clip(u - ss * 0.28, 0, 1)
            z = self.c[2] - self.rise * (1 - uu) ** 2
            x = self.c[0] + 0.25 * np.sin(6.283 * (uu * 1.5 + self.wob[0])) * (1 - uu)
            P = np.stack([x, np.full(18, self.c[1]), z], -1)
            w = (1 - ss) ** 2 * (uu > 0) * (0.35 + 0.65 * (ss == 0))
            return P, (GOLD_HOT[None] * (w * 2.4 * k)[:, None]).astype(np.float32)
        t = age - self.launch
        if t > self.life:
            return None
        S = self.S
        s = np.linspace(0, 1, S)[None, :]
        L = min(self.trail, t + 1e-3)
        ts = np.maximum(t - s * L, 0.0)
        e = 1 - np.exp(-self.drag * ts)
        P = self.c[None, None, :] + self.v[:, None, :] * e[..., None]
        P[..., 2] -= 0.5 * self.g * ts ** 2
        # 尾の点の間（画面の px）。2px より詰まった所は暗くして、止まりかけた粒が点の塊に光らないように
        gap = np.linalg.norm(np.diff(P, axis=1), axis=-1) * self.px
        gap = np.concatenate([gap[:, :1], gap], 1)
        dens = np.clip(gap / 2.0, 0.06, 1.0)
        # 明るさは寿命の半ばまで保ち、そこから消える（すぐ暗くなると、開いた形が目に残らない）
        life_k = 1 - ease(ramp(t, self.life * 0.4, self.life))
        flash = 1 + 0.8 * math.exp(-t / 0.06)
        hot = math.exp(-t / 0.07)
        w = (1 - s) ** 1.6 * dens
        w[:, 0] = np.maximum(w[:, 0], 1.4)  # 頭はいつも明るい
        if self.glitter and t > self.life * (1 - self.glitter):
            on = (np.sin(6.283 * (self.tw * 9 + t * 13)) > 0.1) * 1.7 + 0.12
            w = w * on[:, None]
        head = self.head * (1 - hot) + (WHITE * 1.4)[None] * hot
        sk = s[..., None] ** 0.6
        col = head[:, None, :] * (1 - sk) + self.tail[:, None, :] * sk
        # 開いた最初の数コマは粒が1点に重なるので、光を抑える（閃きは別に足す。抑えないと白い玉が残る）
        open_k = 0.3 + 0.7 * ramp(t, 0.0, 0.1)
        rgb = col * (w * life_k * flash * k * open_k)[..., None]
        return P.reshape(-1, 3), rgb.reshape(-1, 3).astype(np.float32)


def eglow(cv, x, y, rx, ry, col, k, y_min=None):
    """縦長・横長の光（大通りの水たまりに映る花火）。y_min より上には出さない"""
    if k <= 0.003:
        return
    x0, x1 = max(0, int(x - 3 * rx)), min(W, int(x + 3 * rx))
    y0, y1 = max(0, int(y - 3 * ry)), min(H, int(y + 3 * ry))
    if y_min is not None:
        y0 = max(y0, int(y_min))
    if x1 <= x0 or y1 <= y0:
        return
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    g = np.exp(-((xx - x) / rx) ** 2 - ((yy - y) / ry) ** 2)
    if y_min is not None:
        g *= np.clip((yy - y_min) / 30, 0, 1)
    cv.L[y0:y1, x0:x1] += g[..., None] * np.asarray(col, np.float32) * k


class Scene(Stage):
    TIER = 6
    INTRO, STAY, OUTRO, REVEAL = 4.0, 3.0, 1.2, 3.2
    VARIANTS = ("full", "light")
    FRONT = {"full": True, "light": False}
    KBPS = {"full-back": 2600, "full-front": 420, "light-back": 1100}

    def setup(self):
        full = self.variant == "full"
        # 議事堂の絵の下の帯（歩道の縁）は切る。帯のぶん、足もとに横一直線の線が出た（2026-11-04 の下書き）
        hard = load_rgba(os.path.join(ART, "t6", "palace.webp"))[:512].copy()
        fade = np.clip((511 - np.arange(512, dtype=np.float32)) / 8.0, 0, 1)[:, None]
        self.pal = Art(hard * fade[..., None])
        # 光の線は切り口を溶かさない絵から取る（溶かした下の端が、外形の線として横一直線に光る）
        hard = cv2.resize(hard, (self.pal.w, self.pal.h), interpolation=cv2.INTER_AREA) if hard.shape[1] != self.pal.w else hard
        self.aya = art("ayato", "spark.webp")
        ref = self.cam_at(self.INTRO)
        self.ref = ref
        self.pal_depth = 60.0
        self.pal_h = 245 * self.pal_depth / ref.foc
        p = unproject(ref, 360, 0, depth=self.pal_depth)
        self.pal_pos = np.array([p[0], self.pal_depth, 0.0])
        _, by, _ = ref.project(self.pal_pos[None])
        self.base_y = float(by[0])
        lvl = self.pal.levels[0]
        self.win = fs.window_mask(lvl)
        if full:
            self.sky = art("t6", "sky.webp")
            self.road = art("t6", "road.webp")
            self.sky_depth = 220.0
            self.sky_h = 1500 * self.sky_depth / ref.foc
            self.sky_pos = unproject(ref, 360, 600, depth=self.sky_depth)
            self.road_depth = 14.0
            sc = 840 / self.road.w
            self.road_h = self.road.h * sc * self.road_depth / ref.foc
            self.road_pos = unproject(ref, 360, self.base_y + 4, depth=self.road_depth)
            yy = np.arange(H, dtype=np.float32)[:, None]
            self.sky_mul = (np.clip(0.72 + 0.28 * (yy / 300), 0.72, 0.95) * np.ones((1, W), np.float32)) * self.edge
        else:
            yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
            g = np.exp(-(((xx - 360) / 380) ** 2 + ((yy - 430) / 420) ** 2))
            self.shade_map = (g * self.edge).astype(np.float32)
            R = np.random.default_rng(66)
            pts = []
            while len(pts) < 22:
                x, y = R.random() * W, 60 + R.random() * 1040
                if (x < 105 or x > W - 105 or y < 170) and not (x < 330 and y < 430):
                    pts.append((x, y))
            self.edge_pts = np.array(pts)
            self.edge_tw = R.random((len(pts), 3))
            self.lines = LineArt(hard, start=(0.5, 1.0), lo=70, hi=160, min_len=24, work_w=900, blur=1.6)
        # 屋根の線（前兆）: 外形だけ。左下の端から屋根をなぞって右下の端へ
        self.outline = LineArt(hard, start=(0.0, 1.0), lo=250, hi=255, min_len=10, work_w=900, blur=1.0,
                               inner=np.zeros(hard.shape[:2], np.float32), outer_blur=2.0)
        self.shells, self.when = self.make_shells(full)
        self.rain = Loop(300, 6061, cycles=(1, 2))
        self.near = Loop(80, 6062, cycles=(1, 1))
        self.bok = Loop(10, 6063, cycles=(1, 1))
        self.mist = Mist(606)
        R = np.random.default_rng(6064)
        self.streaks = [(R.random() * 520 + 100, R.random(), [MAGENTA, GOLD][i % 2]) for i in range(9)]

    def at(self, sx, sy, depth):
        return unproject(self.ref, sx, sy, depth=depth)

    def make_shells(self, full):
        """花火の玉と、打ち上げの時刻。('once', t) は登場だけ、('loop', t) は滞在の周期でくり返す"""
        f = self.ref.foc
        mk = lambda seed, sx, sy, r, d, **kw: Shell(seed, self.at(sx, sy, d), r * d / f, px=f / d, **kw)
        S, when = {}, {}
        lp = "loop" if full else "once"
        # A: マゼンタの牡丹（内に金）。右上
        S["A"] = mk(61, 560, 255, 210, 85, head=MAGENTA * 1.5, tail=MAGENTA * 0.45 + VIOLET * 0.3, n=160,
                    life=1.35, core=(0.45, GOLD_HOT, AMBER * 0.6, 64), trail=0.17)
        when["A"] = ("once", 2.15)
        # B: 金の柳（いちばん大きい）。真ん中の上。長く垂れる
        S["B"] = mk(62, 385, 180, 245, 95, head=GOLD_HOT, tail=AMBER * 0.55 + MAGENTA * 0.1, n=170,
                    life=2.2 if full else 1.2, trail=0.45, drag=4.2, gravity=3.6, glitter=0.45)
        when["B"] = (lp, 2.3)
        # C: 紫がかったマゼンタに金の瞬き。右の翼の屋根の向こう（下半分は議事堂に隠れる）
        S["C"] = mk(63, 610, 440, 170, 80, head=MAGENTA * 1.1 + VIOLET * 0.5, tail=VIOLET * 0.5, n=130,
                    life=1.9 if full else 1.05, core=(0.6, GOLD_HOT, GOLD * 0.5, 50), glitter=0.4, trail=0.15)
        when["C"] = (lp, 2.45)
        if not full:
            # light の滞在: 上の角の小さな花火（1周に2つ。どちらも滞在の中で開いて消える）
            S["D"] = mk(64, 585, 205, 100, 85, head=GOLD_HOT, tail=AMBER * 0.5, n=90, life=1.4, glitter=0.4, trail=0.15)
            when["D"] = ("loop", 4.15)
            S["E"] = mk(65, 430, 125, 85, 85, head=MAGENTA * 1.4, tail=VIOLET * 0.4, n=80, life=1.4,
                        core=(0.5, GOLD_HOT, AMBER * 0.5, 30), trail=0.15)
            when["E"] = ("loop", 5.0)
        # 締めの大輪（締めの 0.08 秒に開く）
        if full:
            S["F"] = mk(66, 360, 260, 280, 90, head=GOLD_HOT, tail=MAGENTA * 0.6, n=200, life=1.15, launch=0.0,
                        core=(0.5, MAGENTA * 1.5, VIOLET * 0.5, 80), glitter=0.6, trail=0.3, drag=4.0, gravity=3.5)
        else:
            S["F"] = mk(66, 470, 175, 150, 90, head=GOLD_HOT, tail=MAGENTA * 0.5, n=130, life=1.15, launch=0.0,
                        core=(0.5, MAGENTA * 1.4, VIOLET * 0.4, 50), glitter=0.6, trail=0.25, drag=4.0, gravity=3.0)
        when["F"] = ("outro", 0.08)
        return S, when

    def ages(self, c, key):
        """いまこの玉が何秒め（打ち上げから）か。複数あり得る"""
        kind, t0 = self.when[key]
        sh = self.shells[key]
        dur = sh.launch + sh.life
        if kind == "once":
            return [c.T - t0] if c.clip == "intro" and 0 <= c.T - t0 < dur else []
        if kind == "outro":
            if c.clip != "outro":
                return []
            a = c.u * (self.OUTRO) - t0
            return [a] if a >= 0 else []
        return [a for a, _ in c.events(t0, self.STAY, first=t0, dur=dur)]

    def cam_at(self, Ti, c=None):
        u = ease_out(ramp(Ti, 0.0, 3.9))
        p0, t0 = np.array([-1.2, -5.0, 3.6]), np.array([0.0, 60.0, 6.5])
        p1, t1 = np.array([0.0, 0.0, 2.0]), np.array([0.0, 60.0, 6.5])
        pos = p0 + (p1 - p0) * u
        tgt = t0 + (t1 - t0) * u
        if c is not None:
            pos = pos + np.array([0.4 * c.bump(1), 0.0, 0.1 * c.bump(1, 0.5)])
            if c.clip == "outro":
                pos = pos + np.array([0.0, -1.0, 0.6]) * ease(c.u)
        return Cam(pos, tgt, foc=1250, cy=H * 0.45, focus=60.0, dof=20.0)

    def flashes(self, c, cam):
        """開いたばかりの花火 → [(画面の x, y, 光りの強さ 0〜1, 色)]（空・霧・大通りを照らす）"""
        out = []
        for key, sh in self.shells.items():
            for age in self.ages(c, key):
                tb = age - sh.launch
                if 0 <= tb < sh.life:
                    x, y, _ = cam.project(sh.c[None])
                    f = math.exp(-tb / 0.45) * (1 - tb / sh.life)
                    col = sh.head[0] / max(float(sh.head[0].max()), 1e-3)
                    out.append((float(x[0]), float(y[0]), f, col, key, tb))
        return out

    def draw(self, c):
        full = self.variant == "full"
        cam = self.cam_at(c.Ti, c)
        Ti, T, u = c.Ti, c.T, c.u
        out_k = 1 - ease(u)
        back, front = Canvas(), Canvas()
        sp_b, sp_f = Splat(), Splat()
        amb = ease(ramp(Ti, 2.4, 3.4)) * out_k
        lit = ease(ramp(Ti, 1.2, 2.5))
        fl = self.flashes(c, cam)
        # light は、キャラが出たら大きなものを消す
        calm = 1 - ease(ramp(T, self.REVEAL + 0.1, self.REVEAL + 0.75)) if c.clip == "intro" else 0.0
        if full:
            calm = 1.0

        # 暗転（箱の縁で 0 に溶かす）
        dark = (0.5 if full else 0.3) * ease(ramp(Ti, 0.0, 0.6)) * out_k * (1.0 if full else calm)
        if dark > 0.003:
            back.shade((self.edge if full else self.shade_map) * dark, col=(0.03, 0.01, 0.06))

        M, dst, _ = board_map(cam, self.pal.w, self.pal.h, self.pal_pos, self.pal_h)
        if full:
            self.draw_full_world(c, cam, back, M, dst, lit, out_k, fl)
        else:
            self.draw_light_world(c, cam, back, M, dst, lit, calm)

        # 屋根の線を光がなぞる（前兆。full も light も）
        lap = ease(ramp(Ti, 0.2, 1.3))
        lk = env(Ti, 0.15, 0.3, 2.2, 3.1) * (c.clip == "intro")
        if lk > 0.003:
            w = self.pal_h * self.outline.w / self.outline.h
            odst, _ = board_quad(cam, self.pal_pos, w, self.pal_h, (0.5, 1.0), True)
            img = self.outline.image(lap, core=WHITE * 0.9 + MAGENTA * 0.5, glow=MAGENTA * 0.8 + GOLD * 0.4, tail=0.12) * lk * 1.2
            src = np.float32([[0, 0], [self.outline.w, 0], [self.outline.w, self.outline.h], [0, self.outline.h]])
            r = fs.warp_into(img, src, odst)
            if r is not None:
                im, x0, y0 = r
                back.emit(im[..., :3], x0, y0)
                if 0 < lap < 1:
                    Mo = cv2.getPerspectiveTransform(src, odst.astype(np.float32))
                    for hx, hy in self.outline.heads(lap, n=2, band=0.006):
                        px, py = map_point(Mo, hx, hy)
                        fxv.stamp(back.L, self.kit.flare, px, py, 0.5 * lk)

        # ---- 花火（全部の点を1つの Splat に）
        Ps, Cs = [], []
        for key, sh in self.shells.items():
            big = key in ("A", "B", "C")
            k_sh = out_k if key != "F" else (1 - ease(ramp(u, 0.55, 1.0)))
            if not full and big:
                k_sh *= calm
            for age in self.ages(c, key):
                r = sh.light(age, k_sh * (1.0 if full else 1.15))
                if r is not None:
                    Ps.append(r[0])
                    Cs.append(r[1])
                tb = age - sh.launch
                if 0 <= tb < 0.2:
                    x, y, _ = cam.project(sh.c[None])
                    f = math.exp(-tb / 0.06)
                    glow(back, float(x[0]), float(y[0]), 30 if big or key == "F" else 18, WHITE * 1.0 + GOLD * 0.5, 0.7 * f * k_sh)
                    fxv.stamp(back.L, self.kit.flare if big or key == "F" else self.kit.flare_s, float(x[0]), float(y[0]), 0.4 * f * k_sh)
        if Ps:
            P_, C_ = np.concatenate(Ps), np.concatenate(Cs)
            zb = back.Z if full else None
            # くっきりした筋と、その筋をくるむ柔らかい光（太さが出る）
            sp_b.add(cam, P_, C_ * 3.6, zb, sharp=True, max_gain=2.0)
            sp_b.add(cam, P_, C_ * 1.4, zb, soft=True, max_gain=2.0)

        # ---- 光の雪（火の粉が降る）
        g = self.rain
        a_ = g.age(c)
        r = g.r
        P = np.stack([(r[:, 0] - 0.5) * 44, 70 + r[:, 1] * 25, 34 - a_ * 30 + r[:, 2] * 4], -1)
        P[:, 0] += 0.8 * np.sin(6.283 * (a_ * 2 + r[:, 3]))
        tw = (0.5 + 0.5 * np.sin(6.283 * (a_ * (4 + 5 * r[:, 4]) + r[:, 5]))) ** 3
        kd = np.sin(np.pi * a_) * (0.3 + 1.2 * tw) * (0.4 + 1.4 * r[:, 6] ** 2)
        col = np.where(r[:, 7:8] < 0.5, GOLD, np.where(r[:, 7:8] < 0.8, MAGENTA, WHITE))
        rain_k = amb * (1.0 if full else 0.3)
        if c.clip == "outro":
            # 締め: 大輪のあと、光が雪のように降りる
            rain_k = rain_k + 1.2 * ease(ramp(u, 0.15, 0.45)) * (1 - ease(ramp(u, 0.6, 1.0)))
        sp_b.add(cam, P, col * (kd * rain_k)[:, None], back.Z if full else None)
        sp_b.into(back)

        # ---- あやと（手持ち花火）。花火より手前なので、花火の光を足したあとに重ねる
        self.draw_ayato(c, cam, back, full)

        # light の滞在の縁のきらめき
        if not full:
            ek = ease(ramp(Ti, 2.8, 3.6)) * out_k
            if ek > 0.003:
                for j, (x, y) in enumerate(self.edge_pts):
                    rr = self.edge_tw[j]
                    tw_ = max(0.0, math.sin(6.283 * (c.ph * (1 + int(rr[0] * 2)) + rr[1]))) ** 4
                    fxv.stamp(back.L, self.kit.star["magenta" if j % 3 == 0 else "gold"], x, y + 6 * c.osc(1, rr[2]), (0.35 + 0.4 * rr[2]) * tw_ * ek)

        # ---- キャラ絵が出る瞬間: 後ろから光の輪
        rv = (T - self.REVEAL) / 0.7 if c.clip == "intro" else 9
        if 0 <= rv < 1:
            yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
            rr = 110 + 300 * ease_out(rv)
            d = np.hypot(xx - 360, (yy - 760) * 1.12) - rr
            band = np.exp(-(d / (8 + 26 * rv)) ** 2) * (1 - rv) ** 1.4
            back.emit(band[..., None] * (MAGENTA * 0.8 + GOLD * 0.7 + WHITE * 0.4) * 1.2)
            glow(back, 360, 760, 220, MAGENTA * 0.5 + GOLD * 0.4, 0.6 * (1 - rv) ** 2)

        out_b = back.finish(bloom=0.95 if full else 0.6, edge=self.edge)
        if not self.has_front():
            return out_b, None
        # ---- front（光と粒だけ）: 手前を降る火の粉・ぼけ玉・キャラ絵のふちの星
        n = self.near
        a_ = n.age(c)
        r = n.r
        P = np.stack([(r[:, 0] - 0.5) * 7.0 + 0.4 * np.sin(6.283 * (a_ + r[:, 1])), 3.0 + r[:, 2] * 5.0, 5.0 - a_ * 7.0 + r[:, 3]], -1)
        kd = np.sin(np.pi * a_) ** 2 * (0.4 + 1.5 * r[:, 4] ** 2)
        col = np.where(r[:, 5:6] < 0.5, GOLD, np.where(r[:, 5:6] < 0.8, MAGENTA, WHITE))
        sp_f.add(cam, P, col * (kd * amb * 0.45)[:, None], max_gain=3.0)
        sp_f.into(front)
        for j in range(self.bok.n):
            rr_ = self.bok.r[j]
            a1 = self.bok.age(c)[j]
            x = (rr_[0] * 1.2 - 0.1) * W + 26 * math.sin(6.283 * (a1 + rr_[1]))
            y = H * (0.1 + 0.8 * a1) + rr_[2] * 100
            kk = math.sin(math.pi * a1) ** 2 * (0.05 + 0.06 * rr_[3]) * amb
            spr = self.kit.bokeh_spr(28 + rr_[4] * 44, j % 3, [MAGENTA, GOLD, WHITE][j % 3] * 0.8 + WHITE * 0.2, 6 + rr_[5] * 6)
            fxv.stamp(front.L, spr, x, y, kk)
        # 花火が開いた瞬間、画面の手前がふわっと照らされる（縁のぼけ玉が色づく）
        for (x, y, f, col_, key, tb) in fl:
            if key in ("A", "B", "C", "F") and tb < 0.6:
                glow(front, x, y, 260, col_ * 0.08, 0.6 * f * out_k)
        if c.clip == "intro":
            rv = T - self.REVEAL
            if 0 <= rv < 0.9:
                R = np.random.default_rng(79)
                for k in range(26):
                    ang = R.random() * 6.283
                    dist = 170 + 230 * ease_out(rv / 0.9) * (0.6 + 0.4 * R.random())
                    x = 360 + math.cos(ang) * dist * 0.9
                    y = 760 + math.sin(ang) * dist * 1.05
                    fxv.stamp(front.L, self.kit.star["magenta" if k % 3 == 0 else "gold"], x, y, 0.85 * (1 - rv / 0.9) ** 1.5 * (0.5 + 0.5 * R.random()))
        return out_b, self.finish_front(front, bloom=0.7)

    # ---------------- full: 夜空・霧・議事堂・大通り
    def draw_full_world(self, c, cam, cv, M, dst, lit, out_k, fl):
        Ti = c.Ti
        sky_k = ease(ramp(Ti, 0.0, 0.7)) * out_k
        draw_board(cv, cam, self.sky, self.sky_pos, self.sky_h, anchor=(0.5, 0.5), k=sky_k, blur=0.0, mul=self.sky_mul,
                   grade=np.array([0.9, 0.85, 1.0], np.float32) * (0.62 + 0.25 * lit))
        # 花火の照り返し: 空に色が差し、漂う煙が下から照らされる
        smoke = np.zeros(3, np.float32)
        for (x, y, f, col, key, tb) in fl:
            glow(cv, x, y, 340, col * 0.22 + VIOLET * 0.05, 0.42 * f * out_k)
            smoke += col * f
        sk = float(smoke.max())
        if sk > 0.01:
            m = self.mist.layer(c, 60, self.base_y - 40, 1.0, smoke / max(sk, 1e-3) * min(sk, 1.6) * 0.32,
                                laps=1, scale=1.6, soft_top=160, soft_bot=200, edge=self.edge)
            if m:
                cv.emit(m[0] * out_k)
        pal_k = ease(ramp(Ti, 0.1, 0.8)) * out_k
        flash_pal = min(1.0, sum(f for (_, _, f, _, k_, _) in fl if k_ != "D" and k_ != "E"))
        draw_board(cv, cam, self.pal, self.pal_pos, self.pal_h, k=pal_k, blur=0.0,
                   grade=np.array([0.95, 0.9, 1.0], np.float32) * (0.22 + 0.68 * lit + 0.12 * flash_pal),
                   rim=0.8 * flash_pal, light_dir=(0.0, -1.0))
        # 窓が下から順に灯る（1.2〜2.4）。滞在は少し瞬く
        vv = np.linspace(1, 0, self.pal.h, dtype=np.float32)[:, None]
        on = np.clip((Ti - 1.2 - vv * 1.0) / 0.25, 0, 1)
        fli = 0.85 + 0.15 * np.sin(6.283 * (c.ph * 2 + np.linspace(0, 6, self.pal.w, dtype=np.float32)[None, :]))
        emis = (self.win * on * fli)[..., None] * (GOLD * 0.9 + WHITE * 0.4) * 0.55 * pal_k
        emit_mapped(cv, emis.astype(np.float32), M, dst)
        road_k = ease(ramp(Ti, 0.3, 1.2)) * out_k
        draw_board(cv, cam, self.road, self.road_pos, self.road_h, anchor=(0.5, 0.39), k=road_k, blur=0.0,
                   grade=np.array([1.0, 0.9, 1.0], np.float32) * (0.32 + 0.33 * lit + 0.15 * flash_pal))
        # 大通りの水たまりに映る花火
        for (x, y, f, col, key, tb) in fl:
            yr = self.base_y + 90 + (self.base_y - y) * 0.35
            eglow(cv, 360 + (x - 360) * 0.8, yr, 46, 230, col * 0.5 + WHITE * 0.1, 0.55 * f * road_k, y_min=self.base_y + 8)
        self.road_streaks(c, cv, road_k)

    # ---------------- light: 光の線で描く議事堂。キャラが出たら消える
    def draw_light_world(self, c, cam, cv, M, dst, lit, calm):
        Ti = c.Ti
        prog = ease(ramp(Ti, 1.2, 2.55))
        fade = calm
        if fade <= 0.003:
            return
        w = self.pal_h * self.lines.w / self.lines.h
        ldst, _ = board_quad(cam, self.pal_pos, w, self.pal_h, (0.5, 1.0), True)
        img = self.lines.image(prog, core=WHITE * 0.85 + GOLD * 0.6, glow=GOLD * 0.7 + MAGENTA * 0.5) * fade * 1.25
        src = np.float32([[0, 0], [self.lines.w, 0], [self.lines.w, self.lines.h], [0, self.lines.h]])
        r = fs.warp_into(img, src, ldst)
        if r is not None:
            im, x0, y0 = r
            cv.emit(im[..., :3], x0, y0)
            if 0 < prog < 1:
                Mm = cv2.getPerspectiveTransform(src, ldst.astype(np.float32))
                for hx, hy in self.lines.heads(prog, n=10):
                    px, py = map_point(Mm, hx, hy)
                    fxv.stamp(cv.L, self.kit.flare_s, px, py, 0.22 * fade)
        # 描き終わった線の中で、窓が下から灯る
        vv = np.linspace(1, 0, self.pal.h, dtype=np.float32)[:, None]
        on = np.clip((Ti - 1.6 - vv * 0.9) / 0.25, 0, 1)
        emis = (self.win * on)[..., None] * (GOLD * 0.9 + WHITE * 0.3) * 0.5 * fade
        emit_mapped(cv, emis.astype(np.float32), M, dst)

    def road_streaks(self, c, cv, k):
        """大通りを駆け上がる光の筋（1.3〜2.3。滞在は1周に2本）"""
        if k <= 0.003:
            return
        vx, vy = 360.0, self.base_y + 4
        runs = []
        for j, (x0, ph, col) in enumerate(self.streaks):
            if c.clip == "intro":
                runs.append((c.Ti - (1.3 + ph * 0.9), col, x0))
            for age, _ in c.events(3.6 + j * 0.13, self.STAY, first=3.6, dur=0.8):
                if j % 4 == 0:
                    runs.append((age, col, x0))
        for age, col, x0 in runs:
            if not (0 <= age < 0.8):
                continue
            s = ease_out(age / 0.6)
            n = 90
            tt = np.linspace(max(0, s - 0.35), s, n)
            xs = lerp(x0 + (x0 - 360) * 0.8, vx, tt)
            ys = lerp(float(H) + 40, vy, tt)
            kk = (np.linspace(0, 1, n) ** 2) * (1 - max(0, age - 0.5) / 0.3) * k
            sp = Splat()
            sp.add_screen(xs, ys, (np.asarray(col) * 1.6 + WHITE * 0.5)[None] * kk[:, None] * 2.2, soft=True)
            sp.into(cv)

    def draw_ayato(self, c, cam, cv, full):
        Ti, u = c.Ti, c.u
        a = ease(ramp(Ti, 1.5, 2.2))
        arrive = back_out(ramp(Ti, 1.5, 2.4), 1.3)
        x = lerp(-180, 190, ease_out(ramp(Ti, 1.5, 2.3)))
        y = lerp(-300, 260, arrive)
        hgt = 380.0
        if not full:
            back_k = ease(ramp(Ti, self.REVEAL + 0.1, self.REVEAL + 0.75))
            x = lerp(x, 100, back_k)
            y = lerp(y, 150, back_k)
            hgt = lerp(hgt, 220, back_k)
        y += 10 * c.osc(1) * ease(ramp(Ti, 2.3, 3.0))
        if c.clip == "outro":
            y -= 520 * ease_in(ramp(u, 0.0, 0.85))
        if a <= 0.002:
            return
        depth = 9.0
        pos = unproject(self.ref, x, y + hgt / 2, depth=depth)
        h = hgt * depth / self.ref.foc
        draw_board(cv, cam, self.aya, pos, h, k=a * (1 - ease(ramp(u, 0.6, 1.0))), sharp=True, rim=0.9, light_dir=(0.4, -1.0))
        # 手持ち花火の火花（滞在の輪でずっと）
        M, dst, _ = board_map(cam, self.aya.w, self.aya.h, pos, h)
        tx, ty = map_point(M, 0.17 * self.aya.w, 0.04 * self.aya.h)
        R = np.random.default_rng(6065)
        n = 60
        ang = R.random(n) * 6.283
        ph = R.random(n)
        age = (c.ph * 6 + ph) % 1.0
        dist = age * (18 + 30 * R.random(n)) * (hgt / 380)
        xs = tx + np.cos(ang) * dist
        ys = ty + np.sin(ang) * dist + age * age * 12
        kk = (1 - age) ** 1.5 * a * (1 - ease(ramp(u, 0.5, 1.0)))
        col = np.where(R.random(n)[:, None] < 0.6, GOLD * 2.0, WHITE * 1.6)
        sp2 = Splat()
        sp2.add_screen(xs, ys, col * kk[:, None])
        sp2.into(cv)
        glow(cv, tx, ty, 10 * hgt / 380, WHITE * 1.2 + GOLD * 0.6, 0.9 * a)
