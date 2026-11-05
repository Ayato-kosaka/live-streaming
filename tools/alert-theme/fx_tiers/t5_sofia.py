"""段5（2,000〜4,999円・橙）: ソフィア。アレクサンドル・ネフスキー大聖堂の金のドームが、鐘のように光る。

叩き台ペラ一の流れ（秒は登場の動画の時刻）:
- 前兆 0〜1.0: 夕暮れの霧が湧き、大聖堂の影が立ち上がる
- 登場 1.0〜2.0: 金のドームが霧から現れ、あやと（バラの祭り）が花びらを撒きながら舞い降りる
- 山場 2.0〜3.2: 光がドームを走って閃き、鐘の音のような光の輪が3回広がる。2.2 で投げた人のキャラ絵
- 滞在（3秒の輪）: あやとが上から花びらを降らせ、窓が瞬き、金の粉が昇る。鐘の輪が1回
- 締め 1.2秒: 窓が順に灯り、大聖堂ごと霧へ沈む

通りは full（叩き台どおりの全面。空・大聖堂・広場・バラ）だけ。前は「光の線で描く light」と見比べたが、
あやとが「光の線の案は見ごたえない」「2,000以上は全面背景ありで良い」と決めた（2026-11-05、#1095）。

あやとは、投げた人のキャラ絵が出る直前に左上の角（キャラ絵の箱より上の帯）へ舞い上がる。キャラ絵は再生の側で
箱の上 20%〜下 2% に幅いっぱいで置かれ、出て 0.2 秒でほぼ出きるので、真ん中の高さに残ると後ろに隠れる
（段4 で再生の担当が見つけた。2026-11-04）。隠れていないかは `fx_hero.py` で数える。
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
    TIER = 5
    INTRO, STAY, OUTRO, REVEAL = 3.2, 3.0, 1.2, 2.2
    VARIANTS = ("full",)
    FRONT = {"full": True}

    # 落ち着いたときのカメラ（大聖堂の真ん中を見る）
    CAM_END = ((0.0, 0.0, 2.6), (0.0, 24.0, 5.6))

    def setup(self):
        self.cat = art("t5", "cathedral.webp")
        self.aya = art("ayato", "rose_fly.webp")  # バラの祭りの仮装の、舞い降りる全身（設定画と同じ顔で描き直したもの）
        self.sky = art("t5", "sky.webp")
        self.plaza = art("t5", "plaza.webp")
        self.roses = art("t5", "roses.webp")
        self.petals = [load_rgba(os.path.join(ART, "t5", f"petal{i}.webp"), 120) for i in (0, 1)]
        ref = self.cam_at(self.INTRO)
        self.ref = ref
        # 大聖堂（板）: 世界の (0.3, 24) に、高さ 7.2 で立てる
        self.cat_pos = np.array([0.3, 24.0, 0.0])
        self.cat_h = 10.4
        lvl = self.cat.levels[0]
        self.gold = fs.gold_mask(lvl)
        self.win = fs.window_mask(lvl)
        # 中央の金のドームの真ん中（絵の座標の割合）。光の輪はここを中心に広がる
        self.dome_uv = (0.405, 0.16)
        hw = self.cat_h * self.cat.w / self.cat.h
        self.dome_world = self.cat_pos + np.array([(self.dome_uv[0] - 0.5) * hw, 0, (1 - self.dome_uv[1]) * self.cat_h])
        # 空: 夕日の点（絵の 0.5, 0.43）が、ドームのすぐ後ろに来るように
        self.sky_h = 200.0
        self.sky_pos = unproject(ref, 330, 250, depth=170.0)
        # 広場: 基準のカメラで「大聖堂の足もとから下」に見える矩形を床へ戻す
        bx, by, _ = ref.project(self.cat_pos[None])
        self.base_y = float(by[0])
        self.plaza_quad = floor_rect(ref, -90, self.base_y - 6, W + 90, H + 40)
        self.rose_pos = unproject(ref, 360, H - 90, depth=6.5)
        self.rose_h = 1360 * 6.5 / ref.foc
        yy = np.arange(H, dtype=np.float32)[:, None]
        # 空の濃さ: 上ほど薄く（配信の上のほうが少し透ける）。箱の縁では 0
        self.sky_mul = (np.clip(0.62 + 0.4 * (yy / 300), 0.62, 0.95) * np.ones((1, W), np.float32)) * self.edge
        self.mist = Mist(505)
        self.dust = Loop(900, 5051, cycles=(1, 2))
        self.near = Loop(70, 5052, cycles=(1, 1))
        self.fall = Loop(26, 5053, cycles=(1, 2))
        self.bok = Loop(12, 5054, cycles=(1, 1))
        R = np.random.default_rng(5055)
        gy, gx = np.nonzero(self.gold > 0.6)
        pick = R.choice(len(gy), size=min(40, len(gy)), replace=False)
        self.glints = np.stack([gx[pick], gy[pick]], -1).astype(np.float64)
        self.glint_ph = R.random(len(pick))

    # ---------------- カメラ: 低く遠い所から、寄りながら持ち上がり、少し回り込む。滞在は小さく漂う
    def cam_at(self, Ti, c=None):
        u = ease_out(ramp(Ti, 0.0, 3.1))
        p0, t0 = np.array([-1.3, -3.2, 1.2]), np.array([0.6, 24.0, 4.4])
        p1, t1 = np.array(self.CAM_END[0]), np.array(self.CAM_END[1])
        pos = p0 + (p1 - p0) * u
        tgt = t0 + (t1 - t0) * u
        if c is not None:
            pos = pos + np.array([0.45 * c.bump(1), 0.35 * c.bump(1, 0.25), 0.12 * c.bump(2)])
            if c.clip == "outro":
                pos = pos + np.array([0.0, -0.6, 0.5]) * ease(c.u)
        return Cam(pos, tgt, foc=1250, cy=H * 0.31, focus=float(np.linalg.norm(tgt - pos)), dof=26.0)

    # ---------------- 1コマ
    def draw(self, c):
        cam = self.cam_at(c.Ti, c)
        Ti, T, u = c.Ti, c.T, c.u
        out_k = 1 - ease(u)  # 締めで全部が消える
        back, front = Canvas(), Canvas()
        sp_b, sp_f = Splat(), Splat()

        # 大聖堂の出かた
        rise = ease_out(ramp(Ti, 0.25, 1.7))
        sink = ease_in(ramp(u, 0.15, 1.0))
        z_off = -4.2 * (1 - rise) - 3.6 * sink
        lit = ease(ramp(Ti, 0.9, 2.3))  # 夕日が当たる（影 → 金）
        cat_pos = self.cat_pos + np.array([0, 0, z_off])
        M, dst, zc = board_map(cam, self.cat.w, self.cat.h, cat_pos, self.cat_h)
        dx, dy, _ = cam.project(cat_pos[None])
        foot_y = float(dy[0])

        self.draw_full_back(c, cam, back, sp_b, M, dst, cat_pos, lit, out_k, foot_y)

        # ---- あやと（バラの祭り）: 左上から舞い降り、キャラ絵が出る前に左上の角へ。主役だけの層に描く
        hero = Canvas()
        self.draw_ayato(c, cam, hero, sp_b)

        # ---- 鐘の光の輪（2.1・2.35、そして滞在の輪で 1回ずつ）
        rings = [(T - 2.1, 1.0, 0.85), (T - 2.35, 0.75, 0.85)] if c.clip == "intro" else []
        # 3つ目は滞在の輪でくり返す出来事（登場の山場から、そのまま滞在へ続く）
        rings += [(age, 0.62, 1.3) for age, _ in c.events(2.62, self.STAY, first=2.62, dur=1.3)]
        for age, kk, dur in rings:
            if 0 <= age < dur:
                tau = age / dur
                r = 1.25 + 5.0 * ease_out(tau)
                kk2 = kk * (1 - tau) ** 1.3 * out_k
                ring3d(sp_b, cam, self.dome_world + np.array([0, 0, z_off - 0.9]), r, kk2, WHITE * 0.8 + GOLD * 0.8 + MAGENTA * 0.15,
                       zbuf=back.Z, seed=int(age * 7))

        # ---- 金の粉（大聖堂のまわりを渦を巻いて昇る）
        amb = ease(ramp(Ti, 1.6, 2.6)) * out_k
        g = self.dust
        a_ = g.age(c)
        r = g.r
        ang = r[:, 0] * 6.283 + (r[:, 1] - 0.5) * 2.0 * a_ * 6.283 * 0.25
        rad = 2.0 + r[:, 2] ** 0.7 * 6.0
        P = np.stack([np.cos(ang) * rad + 0.3, 24 + np.sin(ang) * rad * 0.6, -0.5 + a_ * 8.5 + r[:, 3] * 0.6], -1)
        P[:, 2] += z_off * 0.3
        tw = (0.5 + 0.5 * np.sin(6.283 * (a_ * (3 + 5 * r[:, 4]) + r[:, 5]))) ** 2
        kd = np.sin(np.pi * a_) ** 1.5 * (0.35 + 0.9 * tw) * (0.4 + 2.2 * r[:, 6] ** 3)
        col = np.where(r[:, 7:8] < 0.7, GOLD, np.where(r[:, 7:8] < 0.88, WHITE, PINK))
        sp_b.add(cam, P, col * (kd * amb)[:, None], back.Z)

        # ---- 花びら（滞在の輪で降り続ける。奥は小さくぼけ、手前は大きく）
        self.draw_petals(c, cam, back, amb)

        sp_b.into(back)

        # ---- 閃き（光がドームを走りきった瞬間）と横の筋
        fl = pulse(Ti, 2.08, 0.11) if c.clip == "intro" else 0.0
        fxp, fyp = map_point(M, self.dome_uv[0] * self.cat.w, (self.dome_uv[1] - 0.12) * self.cat.h)
        if fl > 0.01:
            fxv.stamp(front.L, self.kit.flare, fxp, fyp, 0.8 * fl)
            streak(front, fxp, fyp, 0.9 * fl)
            glow(back, fxp, fyp, 60, WHITE * 1.0 + GOLD * 0.6, 0.55 * fl)

        # ---- キャラ絵が出る瞬間: 後ろから光の輪が広がる（キャラ絵の後ろ＝back）
        cx_, cy_ = 360.0, 760.0
        rv = (T - self.REVEAL) / 0.75 if c.clip == "intro" else 9
        if 0 <= rv < 1:
            rr = 120 + 330 * ease_out(rv)
            yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
            d = np.hypot(xx - cx_, (yy - cy_) * 1.12) - rr
            band = np.exp(-(d / (8 + 30 * rv)) ** 2) * (1 - rv) ** 1.4
            back.emit(band[..., None] * (GOLD * 1.3 + WHITE * 0.6) * 1.3)
            glow(back, cx_, cy_, 230, GOLD * 0.8 + PINK * 0.3, 0.7 * (1 - rv) ** 2)

        sx, sy, _ = cam.project(self.sky_pos[None])
        gk = (0.25 + 0.75 * pulse(Ti, 2.15, 0.5) + 0.12 * c.osc(1)) * ease(ramp(Ti, 0.6, 1.6)) * out_k
        rays = (float(sx[0]), float(sy[0]), gk, 0.95)
        out_b = over_rgba(self.finish_hero(hero, bloom=0.5), back.finish(bloom=0.9, edge=self.edge, rays=rays))

        if not self.has_front():
            return out_b, None
        # ---- front（光と粒だけ）: 手前の金の粉・ぼけ玉・キャラ絵のまわりのきらめき
        n = self.near
        a_ = n.age(c)
        r = n.r
        P = np.stack([(r[:, 0] - 0.5) * 7.0 + 0.6 * np.sin(6.283 * (a_ + r[:, 1])), 3.2 + r[:, 2] * 5.0, 0.2 + a_ * 4.6 + r[:, 3] * 1.0], -1)
        kd = np.sin(np.pi * a_) ** 2 * (0.4 + 1.6 * r[:, 4] ** 2)
        col = np.where(r[:, 5:6] < 0.6, GOLD, np.where(r[:, 5:6] < 0.8, WHITE, PINK))
        sp_f.add(cam, P, col * (kd * amb * 0.5)[:, None], max_gain=3.0)
        sp_f.into(front)
        for j in range(self.bok.n):
            rr_ = self.bok.r[j]
            a1 = self.bok.age(c)[j]
            x = (rr_[0] * 1.2 - 0.1) * W + 30 * math.sin(6.283 * (a1 + rr_[1]))
            y = H * (0.95 - 0.8 * a1) - rr_[2] * 200
            kk = math.sin(math.pi * a1) ** 2 * (0.05 + 0.07 * rr_[3]) * amb
            spr = self.kit.bokeh_spr(30 + rr_[4] * 46, j % 3, [GOLD, PINK, WHITE][j % 3] * 0.8 + WHITE * 0.2, 6 + rr_[5] * 6)
            fxv.stamp(front.L, spr, x, y, kk)
        if c.clip == "intro":
            # キャラ絵が出る瞬間、キャラ絵のふちから星が散る（顔の丸は front の穴で抜ける）
            rv = (T - self.REVEAL)
            if 0 <= rv < 0.9:
                R = np.random.default_rng(77)
                for k in range(26):
                    ang = R.random() * 6.283
                    dist = 170 + 230 * ease_out(rv / 0.9) * (0.6 + 0.4 * R.random())
                    x = 360 + math.cos(ang) * dist * 0.9
                    y = 760 + math.sin(ang) * dist * 1.05
                    kk = (1 - rv / 0.9) ** 1.5 * (0.5 + 0.5 * R.random())
                    fxv.stamp(front.L, self.kit.star["gold" if k % 3 else "white"], x, y, 0.9 * kk)
        out_f = self.finish_front(front, bloom=0.7)
        return out_b, out_f

    # ---------------- full の後ろ: 空・広場・大聖堂（金の映り込み・窓）・霧・バラ
    def draw_full_back(self, c, cam, cv, sp, M, dst, cat_pos, lit, out_k, foot_y):
        Ti, u = c.Ti, c.u
        sky_k = ease(ramp(Ti, 0.05, 0.9)) * out_k
        g_sky = np.array([1.0, 0.92, 0.9], np.float32) * (0.55 + 0.45 * lit)
        draw_board(cv, cam, self.sky, self.sky_pos, self.sky_h, anchor=(0.5, 0.43), k=sky_k, blur=0.0, grade=g_sky, mul=self.sky_mul)
        # 夕日の芯（空の絵の太陽に重ねて、脈打つ）
        sx, sy, _ = cam.project(self.sky_pos[None])
        sun = (0.6 + 0.25 * c.osc(1)) * ease(ramp(Ti, 0.5, 1.6)) * out_k + 0.9 * pulse(Ti, 2.1, 0.25) * (c.clip == "intro")
        glow(cv, float(sx[0]), float(sy[0]), 46, WHITE * 0.7 + GOLD * 0.5, sun)
        glow(cv, float(sx[0]), float(sy[0]), 170, AMBER * 0.12 + PINK * 0.06, sun * 0.8)

        # 奥の霧（大聖堂の後ろ）
        mist_k = (0.35 + 0.35 * env(Ti, 0.0, 0.7, 1.6, 2.6)) * out_k + 0.5 * ease(ramp(u, 0.0, 0.6)) * (1 - ease(ramp(u, 0.6, 1.0)))
        col = np.array([0.95, 0.66, 0.62], np.float32) * (0.45 + 0.6 * lit)
        m = self.mist.layer(c, foot_y - 330, foot_y + 60, 0.55 * mist_k, col, laps=1, edge=self.edge)
        if m:
            cv.over(*m)

        # 広場（床）
        pl_k = ease(ramp(Ti, 0.4, 1.4)) * out_k
        draw_quad(cv, cam, self.plaza, self.plaza_quad, k=pl_k, mul=self.edge, horizon_fade=0.1,
                  grade=np.array([1.0, 0.9, 0.88], np.float32) * (0.5 + 0.5 * lit))
        # 広場の光の道のきらめき（足し算。滞在の輪で瞬く）
        self.floor_glints(c, cam, cv, pl_k * (0.4 + 0.6 * lit))

        # 大聖堂（影から立ち上がり、夕日で金になる）
        grade = np.array([1.0, 0.86, 0.8], np.float32) * (0.3 + 0.66 * lit)
        cat_k = ease(ramp(Ti, 0.2, 0.9)) * out_k
        # 足もとは世界に固定した高さ（地面）で霧に溶かす。沈めると霧へ消える
        fade_y = float(cam.project(np.array([[0, 24, 0.0]]))[1][0]) + 2
        draw_board(cv, cam, self.cat, cat_pos, self.cat_h, k=cat_k, blur=0.0, grade=grade,
                   rim=0.8 * lit, light_dir=(0.0, -1.0), floor_fade=(fade_y, 70))
        # 金の映り込みが走る（1.7〜2.25）。滞在は、ゆっくり行き来する弱い映り込み
        if c.clip == "intro":
            s = ease(ramp(Ti, 1.7, 2.25))
            sw = fs.sweep(self.gold, s, -0.25, 1.25, width=0.10) * (1.7 * env(Ti, 1.65, 1.8, 2.2, 2.45))
        else:
            sw = 0
        sw = sw + fs.sweep(self.gold, 0.5 + 0.5 * c.osc(1, 0.75), 0.15, 0.85, width=0.22) * 0.35 * lit
        emis = (self.gold * (0.15 + 0.35 * pulse(Ti, 2.1, 0.3) * (c.clip == "intro")) * lit + sw)[..., None] * (GOLD * 1.0 + WHITE * 0.5)
        # 窓が灯る（左から順に 1.9〜2.6）。滞在は少しずつ瞬く
        xx = np.linspace(0, 1, self.cat.w, dtype=np.float32)[None, :]
        on = np.clip((Ti - 1.9 - xx * 0.6) / 0.2, 0, 1)
        flick = 0.85 + 0.15 * np.sin(6.283 * (c.ph * 2 + xx * 5.0))
        if c.clip == "outro":
            on = on * (1 + 1.2 * np.clip((u * 1.4 - xx) / 0.2, 0, 1))
        emis = emis + (self.win * on * flick)[..., None] * (WHITE * 0.5 + GOLD * 0.8) * 0.5
        bottom = np.clip((fade_y - np.arange(H, dtype=np.float32)) / 70, 0, 1)[:, None] * np.ones((1, W), np.float32)
        emit_mapped(cv, (emis * cat_k).astype(np.float32), M, dst, mul=bottom)
        # ドームの金のきらめき（星）
        for j, (gx, gy) in enumerate(self.glints):
            tw = max(0.0, math.sin(6.283 * (c.ph * 2 + self.glint_ph[j]))) ** 6
            x, y = map_point(M, gx, gy)
            if y < fade_y - 10:
                fxv.stamp(cv.L, self.kit.star["white" if j % 3 == 0 else "gold"], x, y, 0.5 * tw * lit * cat_k)

        # 手前の霧（大聖堂の足もと）
        m = self.mist.layer(c, foot_y - 120, foot_y + 260, 0.62 * mist_k, col * 1.05, laps=2, edge=self.edge, drift_y=0.3)
        if m:
            cv.over(*m)

        # バラの茂み（手前。ぼけて、ゆれる）
        ro_k = ease(ramp(Ti, 0.7, 1.5)) * out_k
        sway = np.array([0.05 * c.osc(1), 0, 0.03 * c.osc(1, 0.3)])
        draw_board(cv, cam, self.roses, self.rose_pos + sway, self.rose_h, k=ro_k, blur=1.6,
                   grade=np.array([1.0, 0.9, 0.9], np.float32) * (0.6 + 0.4 * lit), rim=0.6 * lit, light_dir=(0.3, -1.0))

    # ---------------- あやと
    def draw_ayato(self, c, cam, cv, sp):
        Ti, u = c.Ti, c.u
        a = ease(ramp(Ti, 1.0, 1.95))
        arrive = back_out(ramp(Ti, 1.0, 1.95), 1.2)
        # 画面の道: 左上の外から弧を描いて (180, 270) へ
        x = lerp(-160, 205, ease_out(ramp(Ti, 1.0, 1.85)))
        y = lerp(-260, 270, arrive)
        hgt = 430.0
        # キャラ絵が出る前（1.9〜2.35）に、左上の角へ小さく舞い上がる（キャラ絵の箱より上の帯）
        back_k = ease(ramp(Ti, 1.9, 2.35))
        x = lerp(x, 118, back_k)
        y = lerp(y, 130, back_k)
        hgt = lerp(hgt, 232, back_k)
        y += 5 * c.osc(1) * ease(ramp(Ti, 1.9, 2.6))
        x += 4 * c.osc(1, 0.25) * ease(ramp(Ti, 1.9, 2.6))
        # 花びらを撒く手（絵の真ん中から左上へ。大きさに合わせて）
        s_ = hgt / 430.0
        self.hand = (x - 120 * s_, y - 150 * s_)
        if c.clip == "outro":
            x += 160 * ease_in(u) * 0.4
            y -= 520 * ease_in(ramp(u, 0.0, 0.85))
        if a <= 0.002 or y < -600:
            return
        depth = 9.0
        pos = unproject(self.ref, x, y + hgt / 2, depth=depth)
        h = hgt * depth / self.ref.foc
        tilt_k = 1 - ease(ramp(Ti, 1.6, 2.1))
        draw_board(cv, cam, self.aya, pos, h, anchor=(0.5, 1.0), k=a * (1 - ease(ramp(u, 0.6, 1.0))), sharp=True,
                   rim=0.9, light_dir=(1.0, -0.3))
        # 降りてくる尾（光の粒）
        if 1.0 < Ti < 2.1 and c.clip == "intro":
            for k in range(14):
                tt = Ti - k * 0.035
                xx = lerp(-160, 205, ease_out(ramp(tt, 1.0, 1.85)))
                yy = lerp(-260, 270, back_out(ramp(tt, 1.0, 1.95), 1.2))
                fxv.stamp(cv.L, self.kit.star["pink" if k % 2 else "gold"], xx + 40, yy + hgt * 0.1, 0.5 * (1 - k / 14) * tilt_k)

    # ---------------- 花びら
    def draw_petals(self, c, cam, cv, amb):
        f = self.fall
        ages = f.age(c)
        hx, hy = self.hand  # あやとの手（撒く所）。draw_ayato が決める
        for j in range(f.n):
            r = f.r[j]
            a = ages[j]
            near = r[0] < 0.25
            x0 = hx + (r[1] - 0.3) * 80
            y0 = hy + (r[2] - 0.5) * 40
            vx = 60 + r[3] * 260
            x = x0 + vx * a * 2.2 + 40 * math.sin(6.283 * (a * 2 + r[4]))
            y = y0 + a * (900 + 300 * r[5])
            if near:
                # 手前の大きな花びらは、キャラ絵の枠（真ん中）を避けて左右の縁を落ちる
                x = (40 + r[1] * 110) if j % 2 else (W - 40 - r[1] * 110)
                x += 30 * math.sin(6.283 * (a * 2 + r[4]))
                y = -60 + a * 1250
            k = math.sin(math.pi * a) ** 0.6 * amb
            if k <= 0.01:
                continue
            sc = (0.45 + 0.5 * r[6]) * (1.8 if near else 1.0) * 0.9
            spr = sprite_rot(self.petals[j % 2], 6.283 * (a * (1 + r[7]) + r[7]), sc)
            put_sprite(cv, spr, x, y, k, blur=2.5 if near else 0.0)

    def floor_glints(self, c, cam, cv, k):
        if k <= 0.003:
            return
        R = np.random.default_rng(5056)
        n = 60
        xs = 360 + (R.random(n) - 0.5) * R.random(n) * 360
        ys = self.base_y + 30 + R.random(n) ** 1.6 * 560
        ph = R.random(n)
        for j in range(n):
            tw = max(0.0, math.sin(6.283 * (c.ph * (1 + j % 3) + ph[j]))) ** 8
            if tw > 0.05:
                fxv.stamp(cv.L, self.kit.star["white" if j % 2 else "gold"], xs[j], ys[j], 0.55 * tw * k)
