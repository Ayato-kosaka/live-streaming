"""段3（500〜999円・緑）: 家族そろって、ツリーに飾りを付ける（画面の下の帯。暗くしない。#1034）。

流れ（秒は登場の動画の時刻）:
- 前兆 0〜0.45: 帯の左のツリーの電球が下から順に点き、右の家の窓が灯る
- 登場 0.35〜1.35: 母のラブブが、金の星を掲げたピポを抱いて左から歩いてくる。兄のジモモ（赤い玉）と
  オレオ（金のリボン）は、右の家の前から跳ねてくる（1.4 で投げた人のキャラ絵）
- 山場 1.38〜2.2: ラブブがピポを高く抱き上げ、ピポが星をツリーのてっぺんへ。星が付くと（1.75）閃いて光の粒がはじけ、
  ツリーの灯りが上から波のように光る。兄たちはばんざいで跳ねる。雪が舞い始める
- 滞在（4秒の輪）: 星がゆっくり瞬く。ジモモが赤い玉をツリーへ運んで掲げ（光の粒）、跳ねて戻る。
  2秒遅れてオレオが、ジモモの前を跳ねてリボンを運び、また戻る（ジモモは身をかがめて通す）。
  ラブブはピポを抱き下ろして2回跳ね、また抱き上げる
- 締め 1.0秒: ラブブは左へ、兄たちは右の家へ帰り、灯りが上から消える。星は最後にきらりとして消える

あやとが決めた中身（#1034）: 家族4匹（ピポ・ジモモ・オレオ・ラブブ）でツリーに飾りを付ける。ラブブがピポを抱き上げて
星を付けさせ、兄たちは飾りを運ぶ。猫は下の 28% の帯（〜999円の決まり）、上は配信画面が透ける。
一次確認の1枚絵では、縦に切るとオレオが右の端に触れていたので、オレオの居場所を箱の縁の溶かし（60px）より内に置く。

絵は一次確認を描いた会話の続きで、層に分けて描いた（`fx_art/christmas/t3/`）。猫は顔の大きさをそろえて並べて
描かせたので、並べ絵ごとに同じ倍率で縮める（ラブブの並べ絵は 0.205・兄たちは 0.20。ラブブの顔が兄たちの 1.25 倍）。

置き方は11月の段3（`fx_tiers/t3_market.py`）と同じ決まり: 家族は下の 28% の帯（キャラ絵の箱の下の端 0.72 より下）の
中を動き、跳ねる・抱き上げると絵の上の端が動くので、`put_pose` で帯の天井（`ceiling`）からはみ出す分だけ下げる。
光と粒（雪・星の光・ぼけ玉）は帯の上に出てよいが、箱の真ん中より上には出さない。
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
from fx_stage import *  # noqa: E402,F401,F403
import fx_stage as fs  # noqa: E402

ART = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "fx_art", "christmas", "t3")

# 置き場（x）。ラブブは左、ツリーはその右（ラブブがツリーの左の端の前に立つ）、兄たちは右、家は右の端
LX, TX, GX, JX, OX, HX = 150.0, 245.0, 338.0, 430.0, 560.0, 672.0
TRIP_J, TRIP_O = 392.0, 398.0   # 兄たちが飾りを掲げに行く所（ツリーの右の端の前）
# 高さ（px）。並べ絵ごとに同じ倍率（ラブブ 0.205・兄たち 0.20）で縮めた、元の切り抜きの高さから
H_CARRY, H_LIFT = 163.0, 184.0
H_JW, H_JL, H_OW, H_OJ = 120.0, 108.0, 119.0, 111.0
H_TREE, H_STAR, H_HOUSE, H_GIFT = 178.0, 40.0, 165.0, 52.0
# 絵の中の目印（絵の幅・高さに対する割合。返していない向き）
PAW_CARRY = (0.748, 0.457)   # 抱いて歩く絵の、ピポの上げた前足
PAW_LIFT = (0.061, 0.179)    # 抱き上げた絵の、ピポの伸ばした前足（左上。右向きに返して使うが、返すのは pose_point がやる）
BALL_LIFT = (0.782, 0.450)   # ジモモが掲げた赤い玉（右上。同じく左向きに返して使う）
BOW_JUMP = (0.5, 0.47)       # オレオが胸に抱えた金のリボン
LAND = 1.75                  # 星がツリーに付く秒


def pose_point(pose, fx, fy, bottom, ceiling):
    """put_pose で置いた絵の、絵の中の点（割合）が画面のどこに来るか"""
    art = pose.art
    sx = -pose.sx if pose.flip else pose.sx
    if pose.spin:
        anchor, y = (0.5, 0.5), bottom - pose.ground - pose.lift - pose.h * 0.5 * pose.sy
    else:
        anchor, y = (0.5, 1.0), bottom - pose.ground - pose.lift
    top = sprite_top(art, pose.h, anchor, pose.rot, abs(sx), pose.sy)
    y = max(y, ceiling + top)
    sc = pose.h / art.h
    dx, dy = (fx - anchor[0]) * art.w * sc, (fy - anchor[1]) * art.h * sc
    c_, s_ = math.cos(math.radians(pose.rot)), math.sin(math.radians(pose.rot))
    return pose.x + c_ * sx * dx - s_ * pose.sy * dy, y + s_ * sx * dx + c_ * pose.sy * dy


def burst(cv, kit, x, y, age, seed, n=12, spread=46, cols=("gold", "white")):
    """光の粒がはじける（age 0→1）"""
    if not (0 <= age < 1):
        return
    R = np.random.default_rng(seed)
    for j in range(n):
        ang = 2 * math.pi * (j + R.random() * 0.6) / n
        d = (10 + spread * (0.6 + 0.4 * R.random())) * ease_out(age)
        fxv.stamp(cv.L, kit.star[cols[j % len(cols)]], x + math.cos(ang) * d, y + math.sin(ang) * d * 0.85,
                  0.9 * (1 - age) ** 1.3)
    glow(cv, x, y, 18, GOLD * 0.6 + WHITE * 0.4, 0.3 * (1 - age) ** 2)


class Scene(Stage):
    TIER = 3
    INTRO, STAY, OUTRO, REVEAL = 2.2, 4.0, 1.0, 1.4
    VARIANTS = ("full",)
    # 〜999円の段は帯の中の小さな絵なので、予算は小さく（11月の段3 と同じ）
    BUDGET_KB = {"full": 1500}
    FRONT = {"full": False}

    BOTTOM = SAFE_BOTTOM
    # 投げた人のキャラ絵の箱の下の端。下の 28%（y 922〜）が猫の帯
    CHAR_BOTTOM = 0.72

    def setup(self):
        a = lambda n: Art.load(os.path.join(ART, n + ".webp"))
        self.carry, self.lift = a("lovebu_carry"), a("lovebu_lift")
        self.j_walk, self.j_lift = a("jimomo_walk"), a("jimomo_lift")
        self.o_walk, self.o_jump = a("oreo_walk"), a("oreo_jump")
        self.tree, self.star, self.house, self.gift = a("tree"), a("star"), a("house"), a("giftbox")
        # 描かれた電球・窓（とても明るい暖色の小さな塊）。点け消しと瞬きに使う
        self.tree_win = fs.window_mask(self.tree.levels[0])
        self.house_win = fs.window_mask(self.house.levels[0])
        R = np.random.default_rng(3401)
        ys, xs = np.nonzero(self.tree_win > 0.5)
        pick = R.choice(len(ys), size=min(18, len(ys)), replace=False) if len(ys) else []
        th, tw = self.tree.h, self.tree.w
        k = H_TREE / th
        self.bulbs = np.array([(TX + (x - tw / 2) * k, self.BOTTOM + 2 - (th - y) * k, y / th) for y, x in zip(ys[pick], xs[pick])]) \
            if len(ys) else np.zeros((0, 3))
        self.bulb_ph = R.random(len(self.bulbs))
        # 星の居場所（ツリーのてっぺん）。ツリーの絵の中身の上の端から
        self.tree_top = self.BOTTOM + 2 - sprite_top(self.tree, H_TREE)
        self.star_home = (TX + 1.0, self.tree_top + 4.0)
        self.snow = Loop(150, 3402, cycles=(1, 2))
        self.bok = Loop(20, 3403, cycles=(1, 1))
        self.glint = Loop(26, 3404, cycles=(2, 3))

    # ---------------- 時刻
    def s_of(self, c):
        """滞在の輪の中の秒（0〜4）。登場のうちは負（登場の終わりで 0）、締めは滞在の頭から進む"""
        if c.clip == "stay":
            return (c.ph * self.STAY) % self.STAY
        return c.T - self.INTRO

    def ceiling(self, c):
        """キャラ絵の箱の下の端は 0.72（922px）。出る瞬間は 1.05 倍にふくらむ（938px）ので、出てから 0.9 秒は少し低く。
        出る前は、箱の真ん中より下（fx_check の〜999円の場所）まで"""
        if c.clip == "intro" and c.T < self.REVEAL:
            return H * 0.5 + 30
        if c.clip == "intro" and c.T < self.REVEAL + 0.9:
            return 942.0
        return 926.0

    # ---------------- 灯りのついた絵（ツリー・家）。描かれた電球を、時刻の関数 on(yy, xx) の濃さで光らせる
    def lit(self, cv, art, win, x, h, on, k, anchor=(0.5, 1.0), col=None):
        dst = sprite(cv, art, x, self.BOTTOM + 2, h, anchor=anchor, k=k)
        if dst is None:
            return
        ih, iw = win.shape
        yy = np.linspace(0, 1, ih, dtype=np.float32)[:, None]
        xx = np.linspace(0, 1, iw, dtype=np.float32)[None, :]
        col = GOLD * 0.9 + WHITE * 0.45 if col is None else col
        em = (win * on(yy, xx))[..., None] * col * 0.75 * k
        r = fs.warp_into(em.astype(np.float32), np.float32([[0, 0], [iw, 0], [iw, ih], [0, ih]]), dst)
        if r is not None:
            im, ox, oy = r
            cv.emit(im[..., :3], ox, oy)

    def draw(self, c):
        Ti, T, u = c.Ti, c.T, c.u
        cv = Canvas()
        hero = Canvas()  # 猫の家族だけ（fx_hero.py が、キャラ絵に隠れていないかを数える。重ねはしない）
        out_k = 1 - ease(ramp(u, 0.4, 1.0))
        top = H * 0.5 + 8  # これより上に出さない（光と粒も）
        sk = ease(ramp(Ti, 0.0, 0.3)) * (1 - ease(ramp(u, 0.45, 1.0)))
        intro = c.clip == "intro"

        # 奥の灯りのぼけ玉（ツリーと家のまわり。前兆で点き、滞在の輪でゆっくり漂う）
        bk = ease(ramp(Ti, 0.1, 0.6)) * (1 - ease(ramp(u, 0.3, 0.9)))
        if bk > 0.003:
            cols = (GOLD * 0.9 + AMBER * 0.3, np.float32([1.0, 0.35, 0.3]), np.float32([0.45, 1.0, 0.55]), WHITE * 0.7 + GOLD * 0.4)
            for j in range(self.bok.n):
                rr = self.bok.r[j]
                a1 = self.bok.age(c)[j]
                x = (TX + (rr[1] - 0.5) * 260) if j % 2 else (HX - 40 + (rr[1] - 0.5) * 200)
                x += 14 * math.sin(6.283 * (a1 + rr[2]))
                y = 860 + rr[3] * 200 - 40 * a1
                kk = (0.08 + 0.09 * rr[4]) * (0.55 + 0.45 * math.sin(math.pi * a1) ** 2) * bk
                kk *= 1 + 1.4 * math.exp(-((Ti - LAND - 0.05) / 0.15) ** 2) * intro
                fxv.stamp(cv.L, self.kit.bokeh_spr(16 + rr[5] * 18, j % 4, cols[j % 4], 4 + rr[6] * 4), x, y, kk)

        # 家（右の端）。窓は前兆で灯り、ゆっくりゆらぐ
        hk = sk
        self.lit(cv, self.house, self.house_win, HX, H_HOUSE, k=hk,
                 on=lambda yy, xx: np.clip((Ti - 0.1 - xx * 0.2) / 0.12, 0, 1) * (0.8 + 0.2 * np.sin(6.283 * (c.ph * 2 + xx * 3)))
                 * (np.clip((yy - u * 1.4 + 0.3) / 0.15, 0, 1) if c.clip == "outro" else 1.0))

        # ツリー（左）。電球は前兆で下から順に点き、星が付くと上から波のように光る。滞在は順に瞬く。締めは上から消える
        def tree_on(yy, xx):
            on = np.clip((Ti - 0.05 - (1 - yy) * 0.3) / 0.08, 0, 1)
            wave = 1 + 1.6 * np.exp(-((Ti - LAND - 0.03 - yy * 0.25) / 0.07) ** 2) * intro
            fl = 0.72 + 0.28 * np.sin(6.283 * (c.ph * 4 + xx * 7 + yy * 5))
            if c.clip == "outro":
                on = on * np.clip((yy - u * 1.4 + 0.25) / 0.12, 0, 1)
            return on * wave * fl
        self.lit(cv, self.tree, self.tree_win, TX, H_TREE, tree_on, k=sk)
        # プレゼントの箱（ツリーの根もと）
        sprite(cv, self.gift, GX, self.BOTTOM + 3, H_GIFT, k=sk, rim=0.25, light_dir=(-0.5, -1.0))
        # 電球の星（滞在の輪で瞬く。星が付くと上から順に）
        for j, (bx, by, yf) in enumerate(self.bulbs):
            tw = max(0.0, math.sin(6.283 * (c.ph * (1 + j % 3) + self.bulb_ph[j]))) ** 6
            tw = max(tw, math.exp(-((Ti - LAND - 0.03 - yf * 0.25) / 0.08) ** 2) * intro)
            on = clamp01((Ti - 0.05 - (1 - yf) * 0.3) / 0.08)
            if c.clip == "outro":
                on *= clamp01((yf - u * 1.4 + 0.25) / 0.12)
            if tw > 0.03:
                fxv.stamp(cv.L, self.kit.star["gold" if j % 3 else "white"], bx, by, 0.5 * tw * sk * on)

        # 雪の吹きだまり（帯の足もと。猫はこの上に立つ）
        self.snow_bank(cv, sk)

        # 家族: ラブブとピポ → ジモモ → オレオ（オレオはジモモの前を通るので、あとに描く）
        fk = out_k
        tg = (cv, hero)
        ceil = self.ceiling(c)
        foot = self.BOTTOM - 2
        mom = self.mom(c)
        if mom is not None:
            contact_shadow(cv, mom.x, foot, 62, 0.28 * fk * mom.k)
            put_pose(tg, mom, foot, ceil, k=fk, rim=0.35, light_dir=(-0.5, -1.0))
        self.draw_star(c, cv, mom, foot, ceil, out_k)
        ox_now = self.oreo_x(c)
        for pose in (self.jimomo(c, ox_now), self.oreo(c)):
            if pose is None:
                continue
            contact_shadow(cv, pose.x, foot - pose.ground, 40 * (1 - min(0.6, pose.lift / 100)), 0.28 * fk * pose.k)
            put_pose(tg, pose, foot, ceil, k=fk, rim=0.35, light_dir=(-0.5, -1.0))

        # 飾りを掲げたときの光の粒（滞在の輪の出来事。輪の頭で 0 から始まるので、継ぎ目でつながる）
        # はじける所は、跳んだ頂の姿の玉・リボンの所に決めておく（跳び終わってからも粒は残る）
        if c.clip == "stay":
            s = self.s_of(c)
            jp = Pose(self.j_lift, H_JL, TRIP_J - 6, 30.0, flip=True, rot=-6, sy=1.05)
            bx, by = pose_point(jp, *BALL_LIFT, foot, 926.0)
            burst(cv, self.kit, bx, by, (s - 1.08) / 0.5, 3405, n=10, spread=40, cols=("gold", "white"))
            glow(cv, bx, by, 14, np.float32([1.0, 0.35, 0.3]) * 0.6 + WHITE * 0.2, 0.18 * env(s, 0.9, 1.05, 1.25, 1.4))
            q = self.oreo_q(c)
            op = Pose(self.o_jump, H_OJ, TRIP_O, 32.0, rot=-6, sy=1.05)
            bx, by = pose_point(op, BOW_JUMP[0], BOW_JUMP[1], foot, 926.0)
            burst(cv, self.kit, bx, by, (q - 1.12) / 0.5, 3406, n=10, spread=40, cols=("gold", "white"))
            glow(cv, bx, by, 14, GOLD * 0.7 + WHITE * 0.2, 0.18 * env(q, 0.95, 1.1, 1.3, 1.45))
        # 雪（星が付いてから。滞在の輪で降り続ける）
        amb = ease(ramp(Ti, LAND - 0.2, 2.15)) * out_k
        if amb > 0.003:
            g = self.snow
            a_ = g.age(c)
            x = g.r[:, 0] * W + 30 * np.sin(6.283 * (a_ * 2 + g.r[:, 1]))
            y = top + 10 + a_ * (self.BOTTOM - top - 10)
            near = g.r[:, 2] < 0.25
            kd = np.sin(np.pi * a_) ** 0.5 * amb * np.where(near, 0.55, 0.35)
            sp = Splat()
            sp.add_screen(x, y, (WHITE * 1.4)[None] * kd[:, None], coc=np.where(near, 3.0, 0.0))
            sp.into(cv)
        # 吹きだまりのきらめき（滞在の輪で瞬く）
        gl = self.glint
        a_ = gl.age(c)
        for j in range(gl.n):
            tw = math.sin(math.pi * a_[j]) ** 6
            if tw > 0.05:
                fxv.stamp(cv.L, self.kit.star["white" if j % 2 else "cyan"], 40 + gl.r[j, 0] * 640, 1132 + gl.r[j, 1] * 16,
                          0.45 * tw * sk)
        self.finish_hero(hero, bloom=0.0)
        return cv.finish(bloom=0.55, edge=self.edge), None

    def snow_bank(self, cv, k):
        """帯の足もとの雪（波打つ上の端・下は青い陰）。全面に横長だと固く見えるので、左右の端で薄く"""
        if k <= 0.003:
            return
        y0, y1 = 1100, 1190
        xs = np.arange(W, dtype=np.float32)[None, :]
        ys = np.arange(y0, y1, dtype=np.float32)[:, None]
        top = 1126 + 4 * np.sin(xs / 53.0) + 3 * np.sin(xs / 23.0 + 1.3) - 6 * np.exp(-((xs - TX) / 90) ** 2) \
            - 5 * np.exp(-((xs - HX) / 80) ** 2)
        a = np.clip((ys - top) / 5.0, 0, 1) * np.clip((y1 - ys) / 40.0, 0, 1)
        a = a * (0.55 + 0.45 * np.clip(1 - np.abs(xs - 360) / 420, 0, 1)) * 0.95 * k
        shade = np.clip((ys - top) / 26.0, 0, 1)[..., None]
        col = (1 - shade) * np.float32([0.97, 0.98, 1.0]) + shade * np.float32([0.66, 0.76, 0.95])
        cv.over((col * a[..., None]).astype(np.float32), a.astype(np.float32), 0, y0)

    # ---------------- ラブブとピポ
    def mom(self, c):
        Ti, T, u = c.Ti, c.T, c.u
        if c.clip == "intro" and Ti < 0.35:
            return None
        # ゆれ（登場の終わりから滞在へ続く。滞在 4秒で 2回）
        sway = 2.5 * math.sin(2 * math.pi * (T - self.INTRO) / 2.0)
        if c.clip == "intro":
            if Ti < 1.38:
                stride = 1 - ease(ramp(Ti, 1.12, 1.32))
                x = lerp(LX - 260, LX, ease_out(ramp(Ti, 0.35, 1.3)))
                bob = 4 * abs(math.sin(T * 2 * math.pi * 2.4)) * stride
                return Pose(self.carry, H_CARRY, x, bob, rot=3 * math.sin(T * 2 * math.pi * 2.4) * stride)
            pop = math.exp(-((Ti - 1.43) / 0.06) ** 2)
            joy = arc((Ti - LAND - 0.05) / 0.3, 8) if LAND + 0.05 <= Ti < LAND + 0.35 else 0.0
            calm = ease(ramp(Ti, 1.9, 2.2))
            return Pose(self.lift, H_LIFT, LX, joy, rot=sway * calm, sx=1 - 0.04 * pop, sy=1 + 0.06 * pop, flip=True)
        if c.clip == "outro":
            # 抱き下ろして（0.12 まで）、左へ歩いて行く
            if u < 0.12:
                return Pose(self.lift, H_LIFT, LX, 0.0, rot=sway, flip=True, sy=1 - 0.05 * math.sin(math.pi * u / 0.12))
            w = ease_in(ramp(u, 0.12, 1.0))
            return Pose(self.carry, H_CARRY, LX - w * 330, 4 * abs(math.sin(T * 2 * math.pi * 2.4)) * min(1, w * 4), flip=True,
                        rot=-3 * math.sin(T * 2 * math.pi * 2.4) * min(1, w * 4))
        s = self.s_of(c)
        sq = math.exp(-((s - 1.62) / 0.06) ** 2) + math.exp(-((s - 3.38) / 0.06) ** 2)
        if 1.6 <= s < 3.4:
            # 抱き下ろして、ピポと一緒に2回跳ねる
            lift, land = hops(s, 1.9, 3.1, 2, 10)
            return Pose(self.carry, H_CARRY, LX, lift, rot=sway, sx=1 + 0.06 * land + 0.04 * sq, sy=1 - 0.08 * land - 0.05 * sq)
        # 抱き上げているあいだは、ピポを星へ届けるように弾ませる（1秒に1回。輪の頭で 0・速さも 0）
        bounce = 5.0 * math.sin(2 * math.pi * s / 1.0) ** 2
        return Pose(self.lift, H_LIFT, LX, bounce, rot=sway * 1.6, sx=1 - 0.03 * sq, sy=1 + 0.05 * sq, flip=True)

    def draw_star(self, c, cv, mom, foot, ceil, out_k):
        """金の星。登場ではピポが掲げて運び、1.45〜1.75 にツリーのてっぺんへ。付いたら閃く。滞在はゆっくり瞬く"""
        Ti, u = c.Ti, c.u
        if c.clip == "intro" and Ti < 0.35:
            return
        hx, hy = self.star_home
        rot, sc = 0.0, 1.0
        if c.clip == "intro" and Ti < LAND and mom is not None:
            if mom.art is self.carry:
                px, py = pose_point(mom, *PAW_CARRY, foot, ceil)
                x, y = px, py - 14
            else:
                px, py = pose_point(mom, *PAW_LIFT, foot, ceil)
                p = ease(ramp(Ti, 1.45, LAND))
                x = lerp(px + 4, hx, p)
                y = lerp(py - 12, hy, p) - arc(p, 22)
                rot = -360 * ease(p)
                sc = 1 + 0.15 * math.sin(math.pi * p)
        else:
            x, y = hx, hy
            sc = 1 + 0.35 * math.exp(-((Ti - LAND - 0.04) / 0.07) ** 2) * (c.clip == "intro")
            sc += 0.04 * math.sin(2 * math.pi * c.ph * 2) * (c.clip != "intro")
        k = ease(ramp(Ti, 0.35, 0.5)) * out_k
        if c.clip == "outro":
            k = 1 - ease(ramp(u, 0.55, 1.0))
        sprite(cv, self.star, x, y, H_STAR * sc, anchor=(0.5, 0.5), rot=rot, k=k, rim=0.3, light_dir=(-0.3, -1.0))
        # 光: 運ぶあいだは小さく、付いてからは星の光（十字の光と輪）。滞在は 2秒おきに強く瞬く
        held = c.clip == "intro" and Ti < LAND
        land = math.exp(-((Ti - LAND - 0.03) / 0.09) ** 2) * (c.clip == "intro")
        # 登場の終わり（2.2）で 1、滞在の頭も 1（継ぎ目で光が跳ねない）
        tw = 0.5 + 0.5 * math.sin(2 * math.pi * (c.ph * 2 + 0.25)) if c.clip != "intro" else ease(ramp(Ti, LAND, 2.2))
        fin = math.exp(-((u - 0.4) / 0.1) ** 2) if c.clip == "outro" else 0.0
        if held:
            glow(cv, x, y, 18, GOLD * 0.7 + WHITE * 0.2, 0.35 * k)
            return
        glow(cv, x, y, 22, GOLD * 0.8 + WHITE * 0.3, (0.3 + 0.25 * tw + 0.8 * land + 0.7 * fin) * k)
        fxv.stamp(cv.L, self.kit.star_big["gold"], x, y, (0.35 + 0.35 * tw + 0.9 * land + 0.8 * fin) * k)
        if land > 0.01:
            fxv.stamp(cv.L, self.kit.flare_s, x, y, 0.45 * land)
        if c.clip == "intro":
            burst(cv, self.kit, x, y, (Ti - LAND) / 0.4, 3407, n=16, spread=70, cols=("gold", "white", "gold"))

    # ---------------- ジモモ（赤い玉）。滞在の 0.3〜2.1 に、ツリーへ玉を運んで掲げ、跳ねて戻る
    def jimomo(self, c, ox_now):
        Ti, T, u = c.Ti, c.T, c.u
        if c.clip == "intro":
            if Ti < 0.45:
                return None
            if Ti < 1.3:
                p = ease_out(ramp(Ti, 0.45, 1.25))
                lift, land = hops(Ti, 0.45, 1.25, 4, 16)
                return Pose(self.j_walk, H_JW, lerp(820, JX, p), lift, flip=True, sx=1 + 0.08 * land, sy=1 - 0.1 * land)
            if 1.78 <= Ti < 2.05:
                q = (Ti - 1.78) / 0.27
                return Pose(self.j_lift, H_JL, JX, arc(q, 34), flip=True, sy=1 + 0.05 * math.sin(math.pi * q))
            # 着地のつぶれは登場の終わり（2.2）までに戻しきる（滞在の頭と同じ姿で終える）
            land = math.exp(-((Ti - 2.07) / 0.04) ** 2) if Ti >= 2.05 else 0.0
            return Pose(self.j_walk, H_JW, JX, 0.0, flip=True, sx=1 + 0.08 * land, sy=1 - 0.1 * land)
        if c.clip == "outro":
            w = ease_in(ramp(u, 0.05, 1.0))
            lift, land = hops(u, 0.05, 1.0, 3, 14)
            return Pose(self.j_walk, H_JW, JX + w * 400, lift, sx=1 + 0.08 * land, sy=1 - 0.1 * land)
        s = self.s_of(c)
        # オレオが前を通るときは、身をかがめて通す
        duck = math.exp(-((ox_now - JX) / 34) ** 2) if ox_now is not None else 0.0
        if s < 0.3 or s >= 2.1:
            # オレオが運んでいるあいだは、その場で跳ねて応援する（通るときはかがむ）
            br = 0.015 * math.sin(2 * math.pi * s / 1.0)
            lift, land = hops(s, 2.45, 3.85, 4, 9)
            return Pose(self.j_walk, H_JW, JX, lift * (1 - duck), flip=True, sx=1 + 0.05 * duck + 0.06 * land,
                        sy=1 + br - 0.1 * duck - 0.08 * land)
        if s < 0.9:
            p = (s - 0.3) / 0.6
            lift, land = hops(s, 0.3, 0.9, 2, 14)
            return Pose(self.j_walk, H_JW, lerp(JX, TRIP_J, ease(p)), lift, flip=True, sx=1 + 0.08 * land, sy=1 - 0.1 * land)
        if s < 1.4:
            # 跳び上がって、赤い玉をツリーへ掲げる（頂が 1.12）
            q = (s - 0.9) / 0.5
            return Pose(self.j_lift, H_JL, TRIP_J - 6 * math.sin(math.pi * q), arc(q, 30), flip=True,
                        rot=-6 * math.sin(math.pi * q), sy=1 + 0.05 * math.sin(math.pi * q))
        if s < 2.0:
            p = (s - 1.4) / 0.6
            lift, land = hops(s, 1.4, 2.0, 2, 14)
            return Pose(self.j_walk, H_JW, lerp(TRIP_J, JX, ease(p)), lift, sx=1 + 0.08 * land, sy=1 - 0.1 * land)
        k = math.sin(math.pi * (s - 2.0) / 0.1)
        return Pose(self.j_walk, H_JW, JX, 0.0, flip=s >= 2.05, sx=1 + 0.08 * k, sy=1 - 0.1 * k)

    # ---------------- オレオ（金のリボン）。ジモモの 2秒あと: ジモモの前を跳ねてツリーへ、リボンを掲げて戻る
    def oreo_q(self, c):
        return (self.s_of(c) - 2.0) % self.STAY

    def oreo_x(self, c):
        if c.clip != "stay":
            return None
        q = self.oreo_q(c)
        if 0.3 <= q < 0.95:
            return lerp(OX, TRIP_O, ease((q - 0.3) / 0.65))
        if 0.95 <= q < 1.35:
            return TRIP_O
        if 1.35 <= q < 1.85:
            return lerp(TRIP_O, OX, ease((q - 1.35) / 0.5))
        return OX

    def oreo(self, c):
        Ti, T, u = c.Ti, c.T, c.u
        if c.clip == "intro":
            if Ti < 0.5:
                return None
            if Ti < 1.35:
                p = ease_out(ramp(Ti, 0.5, 1.3))
                lift, land = hops(Ti, 0.5, 1.3, 4, 14)
                return Pose(self.o_walk, H_OW, lerp(860, OX, p), lift, flip=True, sx=1 + 0.08 * land, sy=1 - 0.1 * land)
            if 1.82 <= Ti < 2.07:
                q = (Ti - 1.82) / 0.25
                return Pose(self.o_jump, H_OJ, OX, arc(q, 38), rot=8 * math.sin(2 * math.pi * q), sy=1 + 0.05 * math.sin(math.pi * q))
            land = math.exp(-((Ti - 2.09) / 0.04) ** 2) if Ti >= 2.07 else 0.0
            return Pose(self.o_walk, H_OW, OX, 0.0, flip=True, sx=1 + 0.08 * land, sy=1 - 0.1 * land)
        if c.clip == "outro":
            w = ease_in(ramp(u, 0.0, 0.9))
            lift, land = hops(u, 0.0, 0.9, 3, 14)
            return Pose(self.o_walk, H_OW, OX + w * 300, lift, sx=1 + 0.08 * land, sy=1 - 0.1 * land)
        q = self.oreo_q(c)
        # ジモモの前を通る（手前なので少し下に）
        front = 3.0 * math.exp(-((self.oreo_x(c) - JX) / 50) ** 2)
        if 0.3 <= q < 0.95:
            lift, land = hops(q, 0.3, 0.95, 3, 16)
            p = Pose(self.o_walk, H_OW, self.oreo_x(c), lift, flip=True, sx=1 + 0.08 * land, sy=1 - 0.1 * land)
        elif 0.95 <= q < 1.35:
            r = (q - 0.95) / 0.4
            p = Pose(self.o_jump, H_OJ, TRIP_O, arc(r, 32), rot=-6 * math.sin(math.pi * r), sy=1 + 0.05 * math.sin(math.pi * r))
        elif 1.35 <= q < 1.85:
            lift, land = hops(q, 1.35, 1.85, 3, 14)
            p = Pose(self.o_walk, H_OW, self.oreo_x(c), lift, sx=1 + 0.08 * land, sy=1 - 0.1 * land)
        elif 1.85 <= q < 1.95:
            k = math.sin(math.pi * (q - 1.85) / 0.1)
            p = Pose(self.o_walk, H_OW, OX, 0.0, flip=q >= 1.9, sx=1 + 0.08 * k, sy=1 - 0.1 * k)
        else:
            # ジモモが運んでいるあいだは、その場で跳ねて応援する
            br = 0.015 * math.sin(2 * math.pi * q / 1.0)
            lift, land = hops(q, 2.45, 3.85, 4, 9)
            p = Pose(self.o_walk, H_OW, OX, lift, flip=True, sx=1 + 0.06 * land, sy=1 + br - 0.08 * land)
        p.ground = -front
        return p
