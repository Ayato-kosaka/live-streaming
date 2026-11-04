"""段4（1,000〜1,999円・黄）: マトカ渓谷（北マケドニア・スコピエ）。エメラルドの湖を、あやとが舟で迎えに来る。

叩き台ペラ一の流れ（秒は登場の動画の時刻）:
- 前兆 0〜0.8: 縁が少し暗くなり、霧が湧いて、崖の上から光の筋が差す
- 登場 0.8〜2.2: 霧の奥から、あやとが小舟でエメラルドの湖を漕いでくる（カメラがゆっくり寄る）
- 山場 2.2〜3.4: あやとが櫂を掲げると、湖面に光の道が走り、しぶきが金の粒になる。2.6 で投げた人のキャラ絵
- 滞在（3秒の輪）: 舟は湖の上でゆれ、湖面がきらめき、霧が流れ、紅葉が舞う
- 締め 1.0秒: 霧が閉じて、舟の灯りが小さくなって消える

full は叩き台どおりの全面（空と遠い山・崖と修道院・湖・手前の紅葉）。light は崖と修道院を光の線で描き、湖面は光のさざ波だけ。
キャラが出たら線を消し、あやとの舟は左の奥へ小さく退いて、縁のきらめきだけを残す。
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from fx_stage import *  # noqa: E402,F401,F403
import fx_stage as fs  # noqa: E402

ART = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "fx_art")


def art(*p, **kw):
    return Art.load(os.path.join(ART, *p), **kw)


class Scene(Stage):
    TIER = 4
    INTRO, STAY, OUTRO, REVEAL = 3.4, 3.0, 1.0, 2.6
    VARIANTS = ("full", "light")
    FRONT = {"full": True, "light": False}
    KBPS = {"full-back": 2600, "full-front": 380, "light-back": 1000}

    CAM_END = ((0.0, 0.0, 2.3), (0.0, 40.0, 2.5))

    def setup(self):
        full = self.variant == "full"
        self.boat = art("ayato", "boat.webp")
        self.cliffs = art("t4", "cliffs.webp")
        ref = self.cam_at(self.INTRO)
        self.ref = ref
        # 崖の板: 絵の 0.68 の高さが湖面。奥行き 34 に、画面の幅より少し広く
        self.cliff_depth = 34.0
        self.cliff_h = 1640 * self.cliff_depth / ref.foc
        p = unproject(ref, 360, 0, depth=self.cliff_depth)
        self.cliff_pos = np.array([p[0], self.cliff_depth, 0.0])
        _, wy, _ = ref.project(self.cliff_pos[None])
        self.water_y = float(wy[0])
        if full:
            self.sky = art("t4", "sky.webp")
            self.lake = art("t4", "lake.webp")
            self.fg = art("t4", "branches.webp")
            self.sky_depth = 220.0
            self.sky_h = 1500 * self.sky_depth / ref.foc
            self.sky_pos = unproject(ref, 360, 250, depth=self.sky_depth)  # 絵の光の筋の元（上の真ん中）が、谷の上に
            self.lake_quad = floor_rect(ref, -420, self.water_y - 3, W + 420, H + 450)
            self.fg_pos = unproject(ref, 360, H - 70, depth=5.0)
            self.fg_h = 1380 * 5.0 / ref.foc
            lk = self.lake.levels[0]
            c = lk[..., :3]
            lum = c.max(-1)
            self.lake_hi = np.clip((lum - 0.72) / 0.25, 0, 1).astype(np.float32)  # 湖の光の道（描かれた明るいきらめき）
            cl = self.cliffs.levels[0]
            cut = int(0.68 * cl.shape[0])
            self.cliff_flip = Art(np.ascontiguousarray(cl[:cut][::-1][: int(cut * 0.32 / 0.68 * 1.0) + 1]))
            yy = np.arange(H, dtype=np.float32)[:, None]
            self.sky_mul = (np.clip(0.62 + 0.3 * (yy / 400), 0.62, 0.94) * np.ones((1, W), np.float32)) * self.edge
        else:
            self.cliff_flip = None
            lvl = self.cliffs.levels[0]
            # 湖面より下（透明）を切った崖の絵から線を取る
            # 崖は外形だけ（なめらかに）。中の線は修道院のまわりだけ取る
            # 崖は外形と大きな割れ目だけ（なめらかに）。修道院は細かく取る（別の線にして、あとから描く）
            self.lines = LineArt(lvl, start=(0.5, 0.68), lo=80, hi=180, min_len=50, work_w=700, blur=2.0, outer_blur=4.0)
            inner = np.zeros(lvl.shape[:2], np.float32)
            h_, w_ = inner.shape
            inner[int(0.2 * h_):int(0.42 * h_), int(0.66 * w_):int(0.99 * w_)] = 1
            mon = lvl * inner[..., None]
            self.lines_mon = LineArt(mon, start=(0.82, 0.42), lo=50, hi=130, min_len=12, work_w=700, blur=1.2)
            yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
            g = np.exp(-(((xx - 360) / 360) ** 2 + ((yy - 430) / 360) ** 2))
            self.shade_map = (g * self.edge).astype(np.float32)
            R = np.random.default_rng(44)
            pts = []
            while len(pts) < 20:
                x, y = R.random() * W, 60 + R.random() * 1040
                if (x < 105 or x > W - 105 or y < 170) and not (x < 300 and 300 < y < 520):
                    pts.append((x, y))
            self.edge_pts = np.array(pts)
            self.edge_tw = R.random((len(pts), 3))
        self.leaves = [load_rgba(os.path.join(ART, "t1", f"leaf{i}.webp"), 96) for i in range(6)]
        self.mist = Mist(404)
        self.spark = Loop(500, 4041, cycles=(1, 2))
        self.near = Loop(60, 4042, cycles=(1, 1))
        self.fall = Loop(16 if full else 8, 4043, cycles=(1, 1))
        self.bok = Loop(10, 4044, cycles=(1, 1))
        self.ripple = Loop(160, 4045, cycles=(1, 3))
        R = np.random.default_rng(4046)
        self.splash = dict(v=np.stack([(R.random(400) - 0.5) * 3.0, -R.random(400) * 1.5, 1.0 + R.random(400) * 2.6], -1),
                           life=0.6 + R.random(400) * 0.8, col=np.where(R.random(400)[:, None] < 0.7, GOLD, WHITE))

    # ---------------- カメラ: 湖の上を低く、ゆっくり寄る。滞在は小さく漂う
    def cam_at(self, Ti, c=None):
        u = ease_out(ramp(Ti, 0.0, 3.3))
        p0, t0 = np.array([0.9, -1.5, 3.1]), np.array([0.4, 40.0, 2.4])
        p1, t1 = np.array(self.CAM_END[0]), np.array(self.CAM_END[1])
        pos = p0 + (p1 - p0) * u
        tgt = t0 + (t1 - t0) * u
        if c is not None:
            pos = pos + np.array([0.35 * c.bump(1), 0.0, 0.10 * c.bump(1, 0.5)])
            if c.clip == "outro":
                pos = pos + np.array([0.0, 1.5, 0.3]) * ease(c.u)
        return Cam(pos, tgt, foc=1250, cy=H * 0.27, focus=float(np.linalg.norm(tgt - pos)), dof=24.0)

    # 舟（あやと）の世界の位置。霧の奥（y=70）から、湖の手前（y=16）へ。滞在は湖の上でゆれる
    def boat_at(self, c):
        Ti = c.Ti
        a = ease_out(ramp(Ti, 0.7, 2.3))
        y = lerp(75.0, 19.0, a)
        x = lerp(2.4, -1.0, a)
        if self.variant == "light":
            k = ease(ramp(Ti, self.REVEAL + 0.1, self.REVEAL + 0.8))
            x = lerp(x, -5.2, k)
            y = lerp(y, 30.0, k)
        bob = 0.06 * c.osc(1) + 0.03 * c.osc(2, 0.3)
        if c.clip == "outro":
            y += 26 * ease_in(c.u)
        return np.array([x, y, bob])

    def draw(self, c):
        full = self.variant == "full"
        cam = self.cam_at(c.Ti, c)
        Ti, T, u = c.Ti, c.T, c.u
        out_k = 1 - ease(u)
        back, front = Canvas(), Canvas()
        sp_b, sp_f = Splat(), Splat()
        amb = ease(ramp(Ti, 1.4, 2.6)) * out_k

        if full:
            self.draw_full_scene(c, cam, back, out_k)
        else:
            self.draw_light_scene(c, cam, back, out_k)

        # ---- 舟とあやと
        bp = self.boat_at(c)
        bh = 3.9  # 世界の高さ（櫂の先まで）
        boat_k = ease(ramp(Ti, 0.75, 1.3)) * (1 - ease(ramp(u, 0.3, 1.0)))
        if boat_k > 0.002:
            # 舟の足もと（絵の下 14% はしぶき）は湖面より少し下に沈める
            pos = bp + np.array([0, 0, -bh * 0.1])
            raise_ = pulse(Ti, 2.25, 0.18) * (c.clip == "intro")
            pos = pos + np.array([0, 0, 0.25 * raise_])
            _, fy, _ = cam.project((bp + np.array([0, 0, 0.0]))[None])
            draw_board(back, cam, self.boat, pos, bh, k=boat_k, sharp=True, rim=0.8 if full else 0.6, light_dir=(0.1, -1.0),
                       floor_fade=(float(fy[0]) + 10, 16))
            # 舟のまわりの波紋（光）
            self.draw_wake(c, cam, back, bp, boat_k * (1.0 if full else 0.7))
            # 櫂の先の閃き（山場）
            if c.clip == "intro" and 2.0 < Ti < 2.7:
                M, dst, _ = board_map(cam, self.boat.w, self.boat.h, pos, bh)
                ox, oy = map_point(M, 0.14 * self.boat.w, 0.06 * self.boat.h)
                fl = pulse(Ti, 2.25, 0.12)
                fxv.stamp(back.L, self.kit.flare, ox, oy, 0.75 * fl)
                streak(back, ox, oy, 0.7 * fl)

        # ---- 光の道（2.2〜2.6 に舟から手前へ走る）。full は湖の描かれたきらめきを光らせ、light は光のさざ波
        self.draw_path(c, cam, back, sp_b, bp, full, out_k)

        # ---- しぶきが金の粒に（2.25）
        tau = T - 2.25
        if c.clip == "intro" and 0 < tau < 1.4:
            s = self.splash
            live = tau < s["life"]
            P0 = bp + np.array([0.0, -0.6, 0.15])
            for sub in range(3):
                ts = max(0.0, tau - sub / FPS / 3)
                P = P0 + s["v"][live] * ((1 - math.exp(-1.6 * ts)) / 1.6)
                P[:, 2] -= 1.4 * ts * ts
                P[:, 2] = np.maximum(P[:, 2], 0.02)
                fade = (1 - tau / s["life"][live]) ** 1.3
                sp_b.add(cam, P, s["col"][live] * (fade * 1.3)[:, None], back.Z)

        # ---- 舞う光の粒（崖のあいだ、谷を昇る）
        g = self.spark
        a_ = g.age(c)
        r = g.r
        P = np.stack([(r[:, 0] - 0.5) * 16, 14 + r[:, 1] * 30, a_ * 9 + r[:, 2] * 1.5 - 0.5], -1)
        P[:, 0] += 0.6 * np.sin(6.283 * (a_ * 2 + r[:, 3]))
        tw = (0.5 + 0.5 * np.sin(6.283 * (a_ * (3 + 4 * r[:, 4]) + r[:, 5]))) ** 2
        kd = np.sin(np.pi * a_) ** 1.5 * (0.3 + 0.9 * tw) * (0.3 + 1.6 * r[:, 6] ** 3)
        col = np.where(r[:, 7:8] < 0.6, GOLD, np.where(r[:, 7:8] < 0.85, WHITE, EMERALD))
        sp_b.add(cam, P, col * (kd * amb * (0.9 if full else 0.45))[:, None], back.Z)

        # ---- 紅葉が舞う
        self.draw_leaves(c, back, amb, full)
        sp_b.into(back)

        # ---- キャラ絵が出る瞬間: 光の道の先（キャラ絵の後ろ）から光の輪
        rv = (T - self.REVEAL) / 0.7 if c.clip == "intro" else 9
        if 0 <= rv < 1:
            yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
            rr = 110 + 300 * ease_out(rv)
            d = np.hypot(xx - 360, (yy - 760) * 1.12) - rr
            band = np.exp(-(d / (8 + 26 * rv)) ** 2) * (1 - rv) ** 1.4
            back.emit(band[..., None] * (GOLD * 1.1 + EMERALD * 0.35 + WHITE * 0.5) * 1.2)
            glow(back, 360, 760, 220, GOLD * 0.7 + EMERALD * 0.2, 0.6 * (1 - rv) ** 2)

        rays = None
        if full:
            sx, sy, _ = cam.project(self.sky_pos[None])
            gk = (0.35 + 0.55 * pulse(Ti, 2.3, 0.6) + 0.1 * c.osc(1)) * ease(ramp(Ti, 0.2, 1.0)) * out_k
            rays = (float(sx[0]), float(sy[0]) - 220, gk, 0.95)
        out_b = back.finish(bloom=0.85 if full else 0.5, edge=self.edge, rays=rays)
        if not self.has_front():
            return out_b, None

        # ---- front（光と粒だけ）: 手前の光の粒・ぼけ玉・キャラ絵のふちの星
        n = self.near
        a_ = n.age(c)
        r = n.r
        P = np.stack([(r[:, 0] - 0.5) * 6.5 + 0.5 * np.sin(6.283 * (a_ + r[:, 1])), 3.0 + r[:, 2] * 4.5, 0.4 + a_ * 3.5 + r[:, 3]], -1)
        kd = np.sin(np.pi * a_) ** 2 * (0.4 + 1.5 * r[:, 4] ** 2)
        col = np.where(r[:, 5:6] < 0.6, GOLD, np.where(r[:, 5:6] < 0.85, WHITE, EMERALD))
        sp_f.add(cam, P, col * (kd * amb * 0.45)[:, None], max_gain=3.0)
        sp_f.into(front)
        for j in range(self.bok.n):
            rr_ = self.bok.r[j]
            a1 = self.bok.age(c)[j]
            x = (rr_[0] * 1.2 - 0.1) * W + 26 * math.sin(6.283 * (a1 + rr_[1]))
            y = H * (0.92 - 0.75 * a1) - rr_[2] * 180
            kk = math.sin(math.pi * a1) ** 2 * (0.05 + 0.06 * rr_[3]) * amb
            spr = self.kit.bokeh_spr(28 + rr_[4] * 44, j % 3, [GOLD, EMERALD * 0.7 + WHITE * 0.3, WHITE][j % 3] * 0.8 + WHITE * 0.2, 6 + rr_[5] * 6)
            fxv.stamp(front.L, spr, x, y, kk)
        if c.clip == "intro":
            rv = T - self.REVEAL
            if 0 <= rv < 0.9:
                R = np.random.default_rng(78)
                for k in range(24):
                    ang = R.random() * 6.283
                    dist = 170 + 220 * ease_out(rv / 0.9) * (0.6 + 0.4 * R.random())
                    x = 360 + math.cos(ang) * dist * 0.9
                    y = 760 + math.sin(ang) * dist * 1.05
                    fxv.stamp(front.L, self.kit.star["gold" if k % 3 else "white"], x, y, 0.85 * (1 - rv / 0.9) ** 1.5 * (0.5 + 0.5 * R.random()))
        return out_b, self.finish_front(front, bloom=0.7)

    # ---------------- full: 空と遠い山 → 奥の霧 → 湖 → 崖 → 手前の霧 → 手前の紅葉
    def draw_full_scene(self, c, cam, cv, out_k):
        Ti, u = c.Ti, c.u
        lit = ease(ramp(Ti, 0.5, 2.0))
        sky_k = ease(ramp(Ti, 0.0, 0.8)) * out_k
        draw_board(cv, cam, self.sky, self.sky_pos, self.sky_h, anchor=(0.5, 0.18), k=sky_k, blur=0.0,
                   grade=np.array([0.95, 0.97, 1.0], np.float32) * (0.62 + 0.38 * lit), mul=self.sky_mul)
        mist_k = (0.35 + 0.4 * env(Ti, 0.0, 0.6, 1.4, 2.4)) * out_k + 0.6 * env(u, 0.0, 0.5, 0.8, 1.0)
        col = np.array([0.86, 0.94, 0.98], np.float32) * (0.6 + 0.45 * lit)
        _, wy, _ = cam.project(np.array([[0, self.cliff_depth, 0.0]]))
        wy = float(wy[0])
        lake_k = ease(ramp(Ti, 0.1, 0.9)) * out_k
        draw_quad(cv, cam, self.lake, self.lake_quad, k=lake_k, mul=self.edge, horizon_fade=0.16,
                  grade=np.array([0.95, 1.0, 1.0], np.float32) * (0.62 + 0.38 * lit))
        # 湖の奥の端は霧に溶かす（空との境に、まっすぐな線を見せない）
        m = self.mist.layer(c, wy - 150, wy + 60, 0.7 * mist_k + 0.3 * out_k, col, laps=1, edge=self.edge, soft_top=120, soft_bot=70)
        if m:
            cv.over(*m)
        # 湖のきらめき（描かれた明るい所が、滞在の輪で瞬く）
        self.lake_glints(c, cam, cv, lake_k * (0.35 + 0.65 * lit))
        cliff_k = ease(ramp(Ti, 0.0, 0.7)) * out_k
        # 湖面の映り込み: 崖の絵を水面で上下に返し、ぼかして薄く敷く（水の材質。崖の足もとが水に溶ける）
        if self.cliff_flip is not None:
            draw_board(cv, cam, self.cliff_flip, self.cliff_pos, self.cliff_h * 0.32 / 0.68 * 0.68, anchor=(0.5, 0.0),
                       k=cliff_k * 0.6, blur=1.6, grade=np.array([0.7, 0.95, 0.9], np.float32) * (0.6 + 0.4 * lit),
                       floor_fade=(wy + 170, 150))
        draw_board(cv, cam, self.cliffs, self.cliff_pos, self.cliff_h, anchor=(0.5, 0.68), k=cliff_k, blur=0.0,
                   grade=np.array([1.0, 0.98, 0.95], np.float32) * (0.55 + 0.45 * lit), rim=0.5 * lit, light_dir=(0.0, -1.0))
        m = self.mist.layer(c, wy - 90, wy + 200, 0.62 * mist_k, col, laps=2, edge=self.edge, drift_y=0.4)
        if m:
            cv.over(*m)
        fg_k = ease(ramp(Ti, 0.3, 1.2)) * out_k
        sway = np.array([0.04 * c.osc(1), 0, 0.025 * c.osc(1, 0.3)])
        draw_board(cv, cam, self.fg, self.fg_pos + sway, self.fg_h, k=fg_k, blur=1.4, rim=0.5 * lit, light_dir=(0.2, -1.0),
                   grade=np.array([1.0, 0.95, 0.9], np.float32) * (0.65 + 0.35 * lit))

    # ---------------- light: 崖と修道院の光の線。キャラが出たら消えて、縁のきらめきだけ
    def draw_light_scene(self, c, cam, cv, out_k):
        Ti = c.Ti
        sh = 0.2 * env(Ti, 0.0, 0.5, self.REVEAL, self.REVEAL + 0.7) * (c.clip == "intro")
        if sh > 0.003:
            cv.shade(self.shade_map * sh)
        prog = ease(ramp(Ti, 0.1, 1.9))
        fade = 1 - ease(ramp(Ti, self.REVEAL + 0.05, self.REVEAL + 0.75))
        k = fade * (0.85 + 0.35 * pulse(Ti, 2.25, 0.2))
        if k > 0.003:
            col_c = WHITE * 0.75 + GOLD * 0.45 + EMERALD * 0.25
            col_g = GOLD * 0.55 + EMERALD * 0.45
            w = self.cliff_h * self.lines.w / self.lines.h
            dst, _ = board_quad(cam, self.cliff_pos, w, self.cliff_h, (0.5, 0.68), True)
            img = self.lines.image(prog, core=col_c, glow=col_g) * k
            img = img + self.lines_mon.image(ease(ramp(Ti, 0.9, 2.0)), core=WHITE * 0.8 + GOLD * 0.6, glow=GOLD * 0.8 + AMBER * 0.2) * k
            src = np.float32([[0, 0], [self.lines.w, 0], [self.lines.w, self.lines.h], [0, self.lines.h]])
            r = fs.warp_into(img, src, dst)
            if r is not None:
                im, x0, y0 = r
                cv.emit(im[..., :3], x0, y0)
                if 0 < prog < 1:
                    M = cv2.getPerspectiveTransform(src, dst.astype(np.float32))
                    for hx, hy in self.lines.heads(prog):
                        px, py = map_point(M, hx, hy)
                        fxv.stamp(cv.L, self.kit.flare_s, px, py, 0.22 * k)
        # 湖面のさざ波を光の線で（奥から手前へ順に現れる）
        if k > 0.003:
            sp = Splat()
            R = np.random.default_rng(4049)
            for j in range(16):
                depth = 26 - j * 1.45
                show = ease(ramp(Ti, 0.6 + j * 0.07, 0.9 + j * 0.07))
                if show <= 0:
                    continue
                cx_ = (R.random() - 0.5) * 6
                half = 1.0 + R.random() * 2.4 + j * 0.15
                n = 260
                xs = np.linspace(cx_ - half, cx_ + half, n)
                wob = 0.08 * np.sin(xs * 2.3 + 6.283 * (c.ph + R.random()))
                P = np.stack([xs, np.full(n, depth) + wob, np.full(n, 0.02)], -1)
                env_ = np.sin(np.linspace(0, math.pi, n)) ** 1.5
                col = (EMERALD * 0.5 + WHITE * 0.35 + GOLD * 0.25)
                sp.add(cam, P, np.tile(col, (n, 1)) * (env_ * 0.9 * show * k)[:, None], soft=True)
            sp.into(cv)
        ek = ease(ramp(Ti, 2.1, 3.0)) * out_k
        if ek > 0.003:
            for j, (x, y) in enumerate(self.edge_pts):
                r = self.edge_tw[j]
                tw = max(0.0, math.sin(6.283 * (c.ph * (1 + int(r[0] * 2)) + r[1]))) ** 4
                fxv.stamp(cv.L, self.kit.star["gold" if j % 3 else "cyan"], x, y + 6 * c.osc(1, r[2]), (0.35 + 0.4 * r[2]) * tw * ek)

    def draw_wake(self, c, cam, cv, bp, k):
        """舟のまわりの光の波紋（湖面に広がる楕円）。滞在の輪で一定の間隔で生まれる"""
        sp = Splat()
        for age, _ in c.events(0.0, self.STAY / 3, first=0.9, dur=1.6):
            tau = age / 1.6
            r = 0.5 + 2.6 * ease_out(tau)
            n = 700
            a = np.arange(n) / n * 2 * math.pi
            P = np.stack([bp[0] + np.cos(a) * r * 1.3, bp[1] + np.sin(a) * r * 0.9, np.full(n, 0.02)], -1)
            sp.add(cam, P, np.tile(WHITE * 0.5 + EMERALD * 0.5, (n, 1)) * (0.22 * (1 - tau) ** 1.5 * k), soft=True)
        sp.into(cv)

    def draw_path(self, c, cam, cv, sp, bp, full, out_k):
        Ti = c.Ti
        run = ease_out(ramp(Ti, 2.2, 2.65))
        if run <= 0:
            return
        hold = (0.55 + 0.25 * c.osc(1)) if c.clip != "intro" or Ti > 2.9 else 1.0
        k = run * out_k * (1.0 if full else 0.0 if c.clip != "intro" else 1 - ease(ramp(Ti, self.REVEAL + 0.1, self.REVEAL + 0.8)))
        if k <= 0.003:
            return
        # 舟から手前（y=2）へ伸びる光の帯。きらめきは滞在の輪で流れる
        n = 900
        rr = self.ripple
        R = np.random.default_rng(4047)
        s = R.random(n)
        y = lerp(bp[1] - 0.8, 2.5, s)
        reach = s < run
        width = 0.25 + 1.3 * (1 - (y - 2.5) / max(bp[1] - 3.3, 1))
        x = bp[0] * (y - 2.5) / max(bp[1] - 2.5, 1) + (R.random(n) - 0.5) * width
        ph = (c.ph * 2 + R.random(n)) % 1.0
        tw = np.sin(np.pi * ph) ** 6
        P = np.stack([x, y, np.full(n, 0.03)], -1)[reach]
        kk = (tw[reach] * 1.4 + 0.15) * k * hold
        col = np.where(R.random(n)[reach, None] < 0.75, GOLD * 1.2 + WHITE * 0.4, WHITE)
        sp.add(cam, P, col * kk[:, None], cv.Z)
        # 帯（光の道そのもの）: 舟の足もとから画面の下の真ん中へ。走る先まで、手前ほど広い
        _, wy0, _ = cam.project(np.array([[0, self.cliff_depth, 0.0]]))
        bx, by, _ = cam.project(np.array([[bp[0], bp[1] - 0.5, 0.0]]))
        bx, by = float(bx[0]), float(by[0])
        y0, y1 = int(max(0, by)), H
        if y1 > y0:
            ys = np.arange(y0, y1, dtype=np.float32)[:, None]
            t_ = (ys - by) / max(H - by, 1)
            cxs = lerp(bx, 360.0, t_)
            wdt = 18 + 150 * t_
            xs = np.arange(W, dtype=np.float32)[None, :]
            band = np.exp(-((xs - cxs) / wdt) ** 2) * np.clip((run * 1.15 - t_) / 0.12, 0, 1)
            nz = self.mist.m[((ys * 0.9 + c.ph * 512 * 2) % 512).astype(int), ((xs * 0.7) % 512).astype(int)]
            shimmer = np.clip(nz - 0.8, 0, None) * 2.4 + 0.08
            em = (band * shimmer)[..., None] * (GOLD * 1.0 + WHITE * 0.35) * (k * hold * 0.55)
            cv.emit(em.astype(np.float32), 0, y0)
        if c.clip == "intro" and Ti < 2.75:
            # 走る先（いちばん手前）の閃き
            hy = lerp(bp[1] - 0.8, 2.5, run)
            hx, hyy, _ = cam.project(np.array([[bp[0] * (hy - 2.5) / max(bp[1] - 2.5, 1), hy, 0.05]]))
            fxv.stamp(cv.L, self.kit.flare_s, float(hx[0]), float(hyy[0]), 0.35 * (1 - run * 0.7))

    def lake_glints(self, c, cam, cv, k):
        if k <= 0.003:
            return
        R = np.random.default_rng(4048)
        n = 70
        xs = 360 + (R.random(n) - 0.5) * R.random(n) * 420
        ys = self.water_y + 30 + R.random(n) ** 1.5 * 600
        ph = R.random(n)
        for j in range(n):
            tw = max(0.0, math.sin(6.283 * (c.ph * (1 + j % 3) + ph[j]))) ** 8
            if tw > 0.05:
                fxv.stamp(cv.L, self.kit.star["white" if j % 2 else "gold"], xs[j], ys[j], 0.5 * tw * k)

    def draw_leaves(self, c, cv, amb, full):
        f = self.fall
        ages = f.age(c)
        for j in range(f.n):
            r = f.r[j]
            a = ages[j]
            if full:
                x = (r[0] * 0.25 if j % 2 else 0.75 + r[0] * 0.25) * W
            else:
                x = (40 + r[0] * 60) if j % 2 else (W - 40 - r[0] * 60)
            x += 50 * math.sin(6.283 * (a * 1.5 + r[1]))
            y = -40 + a * (1150 + 200 * r[2])
            k = math.sin(math.pi * a) ** 0.5 * amb
            if k <= 0.01:
                continue
            sc = (0.32 + 0.3 * r[3]) * (1.0 if full else 0.8)
            spr = sprite_rot(self.leaves[j % 6], 6.283 * (a * (0.6 + r[4]) + r[5]), sc)
            put_sprite(cv, spr, x, y, k, blur=1.5 if r[6] < 0.3 else 0.0)
