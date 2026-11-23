"""段3（500〜999円・緑）: 家族そろって、ツリーに飾りを付ける（画面の下の帯。暗くしない。#1034）。

流れ（秒は登場の動画の時刻）:
- 前兆 0〜0.4: 帯に雪の吹きだまりと、まだ灯りの点いていないツリーが浮かぶ
- 登場 0.3〜1.3: 母のラブブが、金の星を掲げたピポを抱いて左から歩いてくる（星だけが光っている）。兄のジモモ（赤い玉）と
  オレオ（金のリボン）は右から跳ねてくる（1.4 で投げた人のキャラ絵）
- 山場 1.33〜2.2: ラブブがピポを高く抱き上げ、ピポが星をツリーのてっぺんへ。星が付くと（1.75）閃いて光の粒がはじけ、
  ツリーの電球が下から順に灯る。兄たちはばんざいで跳ねる。雪が舞い始める
- 滞在（4秒の輪）: ジモモが赤い玉をツリーへ運んで掛け（光の粒）、跳ねて戻る。1.7秒遅れてオレオが、ジモモの前を跳ねて
  金のリボンを掛けに行く（ジモモは身をかがめて通し、そのあと跳ねて応援する）。掛けた飾りはゆれて、輪の終わりに光の粒に
  なって消える（次の輪がまた同じツリーから始まる）。ラブブはピポを抱き下ろして2回跳ね、また抱き上げる。
  電球は瞬き、帯の上に雪が舞う
- 締め 1.0秒: ラブブは左へ、兄たちは右へ帰り、電球が上から消える。星は最後にきらりとして消える

あやとが決めた中身（#1034）: 家族4匹（ピポ・ジモモ・オレオ・ラブブ）でツリーに飾りを付ける。ラブブがピポを抱き上げて
星を付けさせ、兄たちは飾りを運ぶ。猫は下の 28% の帯（〜999円の決まり）、上は配信画面が透ける。

大きさ（2026-11-23 の見直し）: 1回目は猫が箱の高さの1割ほどで小さすぎた。2回目は一次確認の絵に合わせて下 28% いっぱいに
大きくしたら、箱を手で広げたとき（投げ銭のときはいつもそう）足と体の下が画面の下で切れ、壊れて見えた。
切れないことを先に取り、猫もツリーも全身を、帯の天井（キャラ絵が出る瞬間のふくらみ 942px）〜広げたときに切れる高さ
（1140px）に収める: ツリー 中身 194px（箱の 15.2%）・ラブブ（ピポを抱き上げた絵）中身 185px（14.5%）・兄たち 中身 159〜160px
（12.5%）。帯が低いぶん横に詰め、ラブブはツリーの左の裾に重ねる。一次確認の絵に無い右の端の家は外した。
オレオは箱の縁の溶かし（右 60px）より内に置く。

絵は一次確認を描いた会話の続きで、層に分けて描いた（`fx_art/christmas/t3/`）。猫は顔の大きさをそろえて並べて描かせたので、
並べ絵ごとに同じ倍率で縮める（ラブブの顔が兄たちの 1.25 倍）。掛ける飾りのうち金のリボンはオレオの抱えた絵から切り、
赤い玉は描いた（ジモモの抱えた絵の玉は前足で欠けている）。
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
from fx_stage import *  # noqa: E402,F401,F403
import fx_stage as fs  # noqa: E402

ART = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "fx_art", "christmas", "t3")

# 置き場（x）。ラブブは左（右を向く）、ツリーはその右（ラブブがツリーの左の裾の前に立つ）、兄たちは右。
# プレゼントの箱はツリーの右の根もと
LX, TX, GX, JX, OX = 150.0, 232.0, 318.0, 470.0, 590.0
TRIP_J, TRIP_O = 345.0, 352.0   # 兄たちが飾りを掛けに行く所（ツリーの右の裾の前）
# 足もと（y）。ラブブは手前、兄たちは少し奥。ツリーの根もとは雪の吹きだまりの中
G_MOM, G_KID, G_TREE = 1129.0, 1125.0, 1139.0
# 高さ（px）。並べ絵ごとに同じ倍率で縮めた、元の切り抜きの高さから
H_CARRY, H_LIFT = 167.0, 188.0
H_JW, H_JL, H_OW, H_OJ = 164.0, 148.0, 163.0, 152.0
H_TREE, H_STAR, H_GIFT = 198.0, 40.0, 52.0
H_BALL, H_BOW = 30.0, 34.0
# 絵の中の目印（絵の幅・高さに対する割合。返していない向き。返すのは pose_point がやる）
PAW_CARRY = (0.748, 0.457)   # 抱いて歩く絵の、ピポの上げた前足
PAW_LIFT = (0.061, 0.179)    # 抱き上げた絵の、ピポの伸ばした前足（左上。右向きに返して使う）
BALL_LIFT = (0.782, 0.450)   # ジモモが掲げた赤い玉（右上。左向きに返して使う）
BOW_JUMP = (0.5, 0.47)       # オレオが胸に抱えた金のリボン
LAND = 1.75                  # 星がツリーに付く秒
LIGHT = (1.78, 2.15)         # 電球が下から順に灯る秒
# 掛けた飾りの居場所（ツリーの右の裾）と、掛かる秒（兄それぞれの輪の中の、跳んだ頂）。
# 滞在の輪の終わり（3.7〜3.95）に光の粒になって消え、継ぎ目の前に消えきる
BALL_AT, BOW_AT = (292.0, 1060.0), (278.0, 1006.0)
HANG, GONE = 1.05, (3.7, 3.95)
LAG_O = 1.7                  # オレオはジモモの何秒あとか


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
    # 〜999円の段は帯の中の絵。猫を大きくしたぶん、11月の段3（1500）より多く
    BUDGET_KB = {"full": 2400}
    FRONT = {"full": False}

    BOTTOM = SAFE_BOTTOM
    # 投げた人のキャラ絵の箱の下の端。下の 28%（y 922〜）が猫の帯
    CHAR_BOTTOM = 0.72

    def setup(self):
        a = lambda n: Art.load(os.path.join(ART, n + ".webp"))
        self.carry, self.lift = a("lovebu_carry"), a("lovebu_lift")
        self.j_walk, self.j_lift = a("jimomo_walk"), a("jimomo_lift")
        self.o_walk, self.o_jump = a("oreo_walk"), a("oreo_jump")
        self.tree, self.star, self.gift = a("tree"), a("star"), a("giftbox")
        self.ball, self.bow = a("ball"), a("bow")
        # 描かれた電球（とても明るい暖色の小さな塊）。点け消しと瞬きに使う
        self.tree_win = fs.window_mask(self.tree.levels[0])
        R = np.random.default_rng(3401)
        ys, xs = np.nonzero(self.tree_win > 0.5)
        pick = R.choice(len(ys), size=min(22, len(ys)), replace=False) if len(ys) else []
        th, tw = self.tree.h, self.tree.w
        k = H_TREE / th
        self.bulbs = np.array([(TX + (x - tw / 2) * k, G_TREE - (th - y) * k, y / th) for y, x in zip(ys[pick], xs[pick])]) \
            if len(ys) else np.zeros((0, 3))
        self.bulb_ph = R.random(len(self.bulbs))
        # 星の居場所（ツリーのてっぺん）。ツリーの絵の中身の上の端から
        self.tree_top = G_TREE - sprite_top(self.tree, H_TREE)
        self.star_home = (TX + 1.0, self.tree_top + 6.0)
        self.snow = Loop(190, 3402, cycles=(1, 2))
        self.bok = Loop(20, 3403, cycles=(1, 1))
        self.glint = Loop(30, 3404, cycles=(2, 3))

    # ---------------- 時刻
    def s_of(self, c):
        """滞在の輪の中の秒（0〜4）。登場のうちは負（登場の終わりで 0）、締めは滞在の頭から進む"""
        if c.clip == "stay":
            return (c.ph * self.STAY) % self.STAY
        return c.T - self.INTRO

    def oreo_q(self, c):
        return (self.s_of(c) - LAG_O) % self.STAY

    def ceiling(self, c):
        """キャラ絵の箱の下の端は 0.72（922px）。出る瞬間は 1.05 倍にふくらむ（938px）ので、出てから 0.9 秒は少し低く。
        出る前は、箱の真ん中より下（fx_check の〜999円の場所）まで"""
        if c.clip == "intro" and c.T < self.REVEAL:
            return H * 0.5 + 30
        if c.clip == "intro" and c.T < self.REVEAL + 0.9:
            return 942.0
        return 926.0

    def tree_on(self, c, yy):
        """電球の点き方（yy は 0 が上・1 が下）。星が付くまでは消えていて、付くと下から順に灯る。締めは上から消える"""
        Ti, u = c.Ti, c.u
        on = np.clip((Ti - LIGHT[0] - (1 - yy) * (LIGHT[1] - LIGHT[0] - 0.06)) / 0.06, 0, 1)
        if c.clip == "outro":
            on = on * np.clip((yy - u * 1.6 + 0.15) / 0.12, 0, 1)
        return on

    def draw(self, c):
        Ti, T, u = c.Ti, c.T, c.u
        cv = Canvas()
        hero = Canvas()  # 猫の家族だけ（fx_hero.py が、キャラ絵に隠れていないかを数える。重ねはしない）
        out_k = 1 - ease(ramp(u, 0.4, 1.0))
        top = H * 0.5 + 8  # これより上に出さない（光と粒も）
        sk = ease(ramp(Ti, 0.0, 0.3)) * (1 - ease(ramp(u, 0.45, 1.0)))
        intro = c.clip == "intro"
        lit_all = ease(ramp(Ti, LIGHT[0], LIGHT[1] + 0.1))

        # 奥の灯りのぼけ玉（ツリーのまわりと右。電球が灯ると増え、滞在の輪でゆっくり漂う）
        bk = (0.35 + 0.65 * lit_all) * ease(ramp(Ti, 0.1, 0.6)) * (1 - ease(ramp(u, 0.3, 0.9)))
        if bk > 0.003:
            cols = (GOLD * 0.9 + AMBER * 0.3, np.float32([1.0, 0.35, 0.3]), np.float32([0.45, 1.0, 0.55]), WHITE * 0.7 + GOLD * 0.4)
            for j in range(self.bok.n):
                rr = self.bok.r[j]
                a1 = self.bok.age(c)[j]
                x = (TX + (rr[1] - 0.5) * 300) if j % 2 else (560 + (rr[1] - 0.5) * 200)
                x += 14 * math.sin(6.283 * (a1 + rr[2]))
                y = 870 + rr[3] * 200 - 40 * a1
                kk = (0.08 + 0.09 * rr[4]) * (0.55 + 0.45 * math.sin(math.pi * a1) ** 2) * bk
                kk *= 1 + 1.4 * math.exp(-((Ti - LAND - 0.05) / 0.15) ** 2) * intro
                fxv.stamp(cv.L, self.kit.bokeh_spr(16 + rr[5] * 18, j % 4, cols[j % 4], 4 + rr[6] * 4), x, y, kk)

        # ツリー（電球は星が付いてから下から順に灯る。滞在は順に瞬く）
        grade = np.float32([0.95, 0.95, 1.0]) * (0.72 + 0.28 * lit_all)
        dst = sprite(cv, self.tree, TX, G_TREE, H_TREE, k=sk, grade=grade)
        if dst is not None:
            ih, iw = self.tree_win.shape
            yy = np.linspace(0, 1, ih, dtype=np.float32)[:, None]
            xx = np.linspace(0, 1, iw, dtype=np.float32)[None, :]
            fl = 0.72 + 0.28 * np.sin(6.283 * (c.ph * 4 + xx * 7 + yy * 5))
            pop = 1 + 1.2 * np.exp(-((Ti - LIGHT[0] - (1 - yy) * (LIGHT[1] - LIGHT[0] - 0.06) - 0.03) / 0.05) ** 2) * intro
            em = (self.tree_win * self.tree_on(c, yy) * fl * pop)[..., None] * (GOLD * 0.9 + WHITE * 0.45) * 0.8 * sk
            r = fs.warp_into(em.astype(np.float32), np.float32([[0, 0], [iw, 0], [iw, ih], [0, ih]]), dst)
            if r is not None:
                im, ox, oy = r
                cv.emit(im[..., :3], ox, oy)
        # 電球の星（灯った瞬間にきらりと。滞在の輪で瞬く）
        for j, (bx, by, yf) in enumerate(self.bulbs):
            on = float(self.tree_on(c, np.float32(yf)))
            t_on = LIGHT[0] + (1 - yf) * (LIGHT[1] - LIGHT[0] - 0.06)
            tw = max(0.0, math.sin(6.283 * (c.ph * (1 + j % 3) + self.bulb_ph[j]))) ** 6
            tw = max(tw, 1.4 * math.exp(-((Ti - t_on - 0.04) / 0.06) ** 2) * intro)
            if tw > 0.03 and on > 0.01:
                fxv.stamp(cv.L, self.kit.star["gold" if j % 3 else "white"], bx, by, 0.55 * tw * sk * on)

        # 掛けた飾り（滞在の輪の中だけ。ツリーの右の裾でゆれ、輪の終わりに光の粒になって消える）
        if c.clip == "stay":
            s = self.s_of(c)
            for art, h, (hx, hy), t_h, seed in ((self.ball, H_BALL, BALL_AT, HANG, 3405), (self.bow, H_BOW, BOW_AT, HANG + LAG_O, 3406)):
                if t_h <= s < GONE[1]:
                    age = s - t_h
                    sw = 14 * math.exp(-age * 2.2) * math.sin(2 * math.pi * 1.8 * age)
                    kk = 1 - ease(ramp(s, *GONE))
                    pop = 1 + 0.25 * math.exp(-(age / 0.08) ** 2)
                    sprite(cv, art, hx, hy, h * pop * (0.6 + 0.4 * kk), anchor=(0.5, 0.06), rot=sw, k=kk, rim=0.3,
                           light_dir=(-0.4, -1.0))
                burst(cv, self.kit, hx, hy + h * 0.5, (s - t_h) / 0.5, seed, n=10, spread=38)
                # 消えるときの粒は、継ぎ目（4.0）の前に消えきる
                burst(cv, self.kit, hx, hy + h * 0.5, (s - GONE[0]) / 0.28, seed + 10, n=12, spread=30,
                      cols=("gold", "white", "gold"))
        # プレゼントの箱（ツリーの右の根もと）
        sprite(cv, self.gift, GX, G_TREE + 4, H_GIFT, k=sk, rim=0.25, light_dir=(-0.5, -1.0))
        # 雪の吹きだまり（帯の足もと。猫はこの上に立つ）
        self.snow_bank(cv, sk)

        # 家族: ラブブとピポ → ジモモ → オレオ（オレオはジモモの前を通るので、あとに描く）
        fk = out_k
        tg = (cv, hero)
        ceil = self.ceiling(c)
        mom = self.mom(c)
        if mom is not None:
            contact_shadow(cv, mom.x, G_MOM, 62, 0.28 * fk * mom.k)
            put_pose(tg, mom, G_MOM, ceil, k=fk, rim=0.35, light_dir=(-0.5, -1.0))
        self.draw_star(c, cv, mom, ceil, out_k)
        ox_now = self.oreo_x(c)
        for who, pose in (("j", self.jimomo(c, ox_now)), ("o", self.oreo(c))):
            if pose is None:
                continue
            contact_shadow(cv, pose.x, G_KID - pose.ground, 44 * (1 - min(0.6, pose.lift / 100)), 0.28 * fk * pose.k)
            put_pose(tg, pose, G_KID, ceil, k=fk, rim=0.35, light_dir=(-0.5, -1.0))
            # 掛ける瞬間（それぞれの輪の 1.05）: 抱えた飾りが光ってツリーへ渡る
            if c.clip == "stay":
                q = self.s_of(c) if who == "j" else self.oreo_q(c)
                fl = math.exp(-((q - HANG) / 0.07) ** 2)
                if fl > 0.02:
                    if pose.art is self.j_lift:
                        bx, by = pose_point(pose, *BALL_LIFT, G_KID, ceil)
                    elif pose.art is self.o_jump:
                        bx, by = pose_point(pose, *BOW_JUMP, G_KID, ceil)
                    else:
                        bx, by = pose.x, G_KID - pose.h * 0.5
                    glow(cv, bx, by, 22, GOLD * 0.7 + WHITE * 0.3, 0.45 * fl)
                    fxv.stamp(cv.L, self.kit.star_big["gold"], bx, by, 0.6 * fl)

        # 雪（星が付いてから。滞在の輪で、帯の上に舞い続ける）
        amb = ease(ramp(Ti, LAND - 0.2, 2.15)) * out_k
        if amb > 0.003:
            g = self.snow
            a_ = g.age(c)
            x = g.r[:, 0] * W + 30 * np.sin(6.283 * (a_ * 2 + g.r[:, 1]))
            y = top + 10 + a_ * (1130 - top - 10)
            near = g.r[:, 2] < 0.25
            kd = np.sin(np.pi * a_) ** 0.5 * amb * np.where(near, 0.6, 0.38)
            sp = Splat()
            sp.add_screen(x, y, (WHITE * 1.4)[None] * kd[:, None], coc=np.where(near, 3.0, 0.0))
            sp.into(cv)
        # 吹きだまりのきらめき（滞在の輪で瞬く）
        gl = self.glint
        a_ = gl.age(c)
        for j in range(gl.n):
            tw = math.sin(math.pi * a_[j]) ** 6
            if tw > 0.05:
                fxv.stamp(cv.L, self.kit.star["white" if j % 2 else "cyan"], 40 + gl.r[j, 0] * 640, 1130 + gl.r[j, 1] * 14,
                          0.45 * tw * sk)
        self.finish_hero(hero, bloom=0.0)
        return cv.finish(bloom=0.55, edge=self.edge), None

    def snow_bank(self, cv, k):
        """帯の足もとの雪（波打つ上の端・下は青い陰）。下の端は箱の縁で溶ける"""
        if k <= 0.003:
            return
        y0, y1 = 1100, 1280
        xs = np.arange(W, dtype=np.float32)[None, :]
        ys = np.arange(y0, y1, dtype=np.float32)[:, None]
        top = 1128 + 4 * np.sin(xs / 53.0) + 3 * np.sin(xs / 23.0 + 1.3) - 8 * np.exp(-((xs - TX) / 110) ** 2)
        # 吹きだまりは足もとの細い帯だけ（厚くすると、ふだんの箱の下に淡い青の板が広がって見えた）
        a = np.clip((ys - top) / 5.0, 0, 1) * np.clip((1186 - ys) / 40.0, 0, 1)
        a = a * (0.6 + 0.4 * np.clip(1 - np.abs(xs - 360) / 420, 0, 1)) * 0.95 * k
        shade = np.clip((ys - top) / 26.0, 0, 1)[..., None]
        col = (1 - shade) * np.float32([0.97, 0.98, 1.0]) + shade * np.float32([0.66, 0.76, 0.95])
        cv.over((col * a[..., None]).astype(np.float32), a.astype(np.float32), 0, y0)

    # ---------------- ラブブとピポ
    def mom(self, c):
        Ti, T, u = c.Ti, c.T, c.u
        if c.clip == "intro" and Ti < 0.3:
            return None
        # ゆれ（登場の終わりから滞在へ続く。滞在 4秒で 2回）
        sway = 2.5 * math.sin(2 * math.pi * (T - self.INTRO) / 2.0)
        if c.clip == "intro":
            if Ti < 1.33:
                stride = 1 - ease(ramp(Ti, 1.08, 1.28))
                x = lerp(LX - 300, LX, ease_out(ramp(Ti, 0.3, 1.25)))
                bob = 5 * abs(math.sin(T * 2 * math.pi * 2.2)) * stride
                return Pose(self.carry, H_CARRY, x, bob, rot=3 * math.sin(T * 2 * math.pi * 2.2) * stride)
            pop = math.exp(-((Ti - 1.38) / 0.06) ** 2)
            joy = math.exp(-((Ti - LAND - 0.15) / 0.08) ** 2)
            calm = ease(ramp(Ti, 1.9, 2.2))
            return Pose(self.lift, H_LIFT, LX, 0.0, rot=sway * calm, sx=1 - 0.04 * pop + 0.03 * joy,
                        sy=1 + 0.06 * pop - 0.04 * joy, flip=True)
        if c.clip == "outro":
            # 抱き下ろして（0.12 まで）、左へ歩いて行く
            if u < 0.12:
                return Pose(self.lift, H_LIFT, LX, 0.0, rot=sway, flip=True, sy=1 - 0.05 * math.sin(math.pi * u / 0.12))
            w = ease_in(ramp(u, 0.12, 1.0))
            return Pose(self.carry, H_CARRY, LX - w * 380, 5 * abs(math.sin(T * 2 * math.pi * 2.2)) * min(1, w * 4), flip=True,
                        rot=-3 * math.sin(T * 2 * math.pi * 2.2) * min(1, w * 4))
        s = self.s_of(c)
        sq = math.exp(-((s - 1.62) / 0.06) ** 2) + math.exp(-((s - 3.38) / 0.06) ** 2)
        if 1.6 <= s < 3.4:
            # 抱き下ろして、ピポと一緒に2回跳ねる
            lift, land = hops(s, 1.9, 3.1, 2, 14)
            return Pose(self.carry, H_CARRY, LX, lift, rot=sway, sx=1 + 0.06 * land + 0.04 * sq, sy=1 - 0.08 * land - 0.05 * sq)
        # 抱き上げているあいだは、ピポを星へ届けるように弾ませる（1秒に1回。輪の頭で 0・速さも 0）
        bounce = 9.0 * math.sin(2 * math.pi * s / 1.0) ** 2
        return Pose(self.lift, H_LIFT, LX, bounce, rot=sway * 1.6, sx=1 - 0.03 * sq, sy=1 + 0.05 * sq, flip=True)

    def draw_star(self, c, cv, mom, ceil, out_k):
        """金の星。登場ではピポが掲げて運び、1.45〜1.75 にツリーのてっぺんへ。付いたら閃く。滞在はゆっくり瞬く"""
        Ti, u = c.Ti, c.u
        if c.clip == "intro" and Ti < 0.3:
            return
        hx, hy = self.star_home
        rot, sc = 0.0, 1.0
        if c.clip == "intro" and Ti < LAND and mom is not None:
            if mom.art is self.carry:
                px, py = pose_point(mom, *PAW_CARRY, G_MOM, ceil)
                x, y = px, py - 18
            else:
                px, py = pose_point(mom, *PAW_LIFT, G_MOM, ceil)
                p = ease(ramp(Ti, 1.45, LAND))
                x = lerp(px + 4, hx, p)
                y = lerp(py - 14, hy, p) - arc(p, 26)
                rot = -360 * ease(p)
                sc = 1 + 0.15 * math.sin(math.pi * p)
        else:
            x, y = hx, hy
            sc = 1 + 0.35 * math.exp(-((Ti - LAND - 0.04) / 0.07) ** 2) * (c.clip == "intro")
            sc += 0.04 * math.sin(2 * math.pi * c.ph * 2) * (c.clip != "intro")
        k = ease(ramp(Ti, 0.3, 0.45)) * out_k
        if c.clip == "outro":
            k = 1 - ease(ramp(u, 0.55, 1.0))
        sprite(cv, self.star, x, y, H_STAR * sc, anchor=(0.5, 0.5), rot=rot, k=k, rim=0.3, light_dir=(-0.3, -1.0))
        held = c.clip == "intro" and Ti < LAND
        land = math.exp(-((Ti - LAND - 0.03) / 0.09) ** 2) * (c.clip == "intro")
        # 登場の終わり（2.2）で 1、滞在の頭も 1（継ぎ目で光が跳ねない）
        tw = 0.5 + 0.5 * math.sin(2 * math.pi * (c.ph * 2 + 0.25)) if c.clip != "intro" else ease(ramp(Ti, LAND, 2.2))
        fin = math.exp(-((u - 0.4) / 0.1) ** 2) if c.clip == "outro" else 0.0
        if held:
            # 星が付くまでは、この星だけが光っている
            glow(cv, x, y, 22, GOLD * 0.7 + WHITE * 0.25, 0.45 * k)
            fxv.stamp(cv.L, self.kit.star["gold"], x, y, 0.5 * k)
            return
        glow(cv, x, y, 26, GOLD * 0.8 + WHITE * 0.3, (0.3 + 0.25 * tw + 0.9 * land + 0.7 * fin) * k)
        fxv.stamp(cv.L, self.kit.star_big["gold"], x, y, (0.4 + 0.35 * tw + 1.0 * land + 0.8 * fin) * k)
        if land > 0.01:
            fxv.stamp(cv.L, self.kit.flare_s, x, y, 0.5 * land)
        if c.clip == "intro":
            burst(cv, self.kit, x, y, (Ti - LAND) / 0.4, 3407, n=18, spread=80, cols=("gold", "white", "gold"))

    # ---------------- ジモモ（赤い玉）。滞在の 0.2〜2.0 に、ツリーへ玉を運んで掛け、跳ねて戻る
    def jimomo(self, c, ox_now):
        Ti, T, u = c.Ti, c.T, c.u
        if c.clip == "intro":
            if Ti < 0.4:
                return None
            if Ti < 1.3:
                p = ease_out(ramp(Ti, 0.4, 1.25))
                lift, land = hops(Ti, 0.4, 1.25, 4, 20)
                return Pose(self.j_walk, H_JW, lerp(860, JX, p), lift, flip=True, sx=1 + 0.08 * land, sy=1 - 0.1 * land)
            if 1.8 <= Ti < 2.05:
                q = (Ti - 1.8) / 0.25
                return Pose(self.j_lift, H_JL, JX, arc(q, 30), flip=True, sy=1 + 0.05 * math.sin(math.pi * q))
            # 着地のつぶれは登場の終わり（2.2）までに戻しきる（滞在の頭と同じ姿で終える）
            land = math.exp(-((Ti - 2.07) / 0.04) ** 2) if Ti >= 2.05 else 0.0
            return Pose(self.j_walk, H_JW, JX, 0.0, flip=True, sx=1 + 0.08 * land, sy=1 - 0.1 * land)
        if c.clip == "outro":
            w = ease_in(ramp(u, 0.05, 1.0))
            lift, land = hops(u, 0.05, 1.0, 3, 18)
            return Pose(self.j_walk, H_JW, JX + w * 420, lift, sx=1 + 0.08 * land, sy=1 - 0.1 * land)
        s = self.s_of(c)
        # オレオが前を通るときは、身をかがめて通す
        duck = math.exp(-((ox_now - JX) / 40) ** 2) if ox_now is not None else 0.0
        if s < 0.2 or s >= 2.0:
            # オレオが掛けに行っているあいだは、その場で跳ねて応援する
            br = 0.015 * math.sin(2 * math.pi * s / 1.0)
            lift, land = hops(s, 2.4, 3.6, 4, 14)
            return Pose(self.j_walk, H_JW, JX, lift * (1 - duck), flip=True, sx=1 + 0.06 * duck + 0.07 * land,
                        sy=1 + br - 0.12 * duck - 0.09 * land)
        if s < 0.8:
            p = (s - 0.2) / 0.6
            lift, land = hops(s, 0.2, 0.8, 2, 18)
            return Pose(self.j_walk, H_JW, lerp(JX, TRIP_J, ease(p)), lift, flip=True, sx=1 + 0.08 * land, sy=1 - 0.1 * land)
        if s < 1.3:
            # 跳び上がって、赤い玉をツリーへ掛ける（頂が 1.05）
            q = (s - 0.8) / 0.5
            return Pose(self.j_lift, H_JL, TRIP_J - 8 * math.sin(math.pi * q), arc(q, 30), flip=True,
                        rot=-7 * math.sin(math.pi * q), sy=1 + 0.05 * math.sin(math.pi * q))
        if s < 1.9:
            p = (s - 1.3) / 0.6
            lift, land = hops(s, 1.3, 1.9, 2, 18)
            return Pose(self.j_walk, H_JW, lerp(TRIP_J, JX, ease(p)), lift, sx=1 + 0.08 * land, sy=1 - 0.1 * land)
        k = math.sin(math.pi * (s - 1.9) / 0.1)
        return Pose(self.j_walk, H_JW, JX, 0.0, flip=s >= 1.95, sx=1 + 0.08 * k, sy=1 - 0.1 * k)

    # ---------------- オレオ（金のリボン）。ジモモの 1.7秒あと: ジモモの前を跳ねてツリーへ、リボンを掛けて戻る
    def oreo_x(self, c):
        if c.clip != "stay":
            return None
        q = self.oreo_q(c)
        if 0.2 <= q < 0.8:
            return lerp(OX, TRIP_O, ease((q - 0.2) / 0.6))
        if 0.8 <= q < 1.3:
            return TRIP_O
        if 1.3 <= q < 1.9:
            return lerp(TRIP_O, OX, ease((q - 1.3) / 0.6))
        return OX

    def oreo(self, c):
        Ti, T, u = c.Ti, c.T, c.u
        if c.clip == "intro":
            if Ti < 0.45:
                return None
            if Ti < 1.35:
                p = ease_out(ramp(Ti, 0.45, 1.3))
                lift, land = hops(Ti, 0.45, 1.3, 4, 18)
                return Pose(self.o_walk, H_OW, lerp(900, OX, p), lift, flip=True, sx=1 + 0.08 * land, sy=1 - 0.1 * land)
            if 1.82 <= Ti < 2.07:
                q = (Ti - 1.82) / 0.25
                return Pose(self.o_jump, H_OJ, OX, arc(q, 30), rot=8 * math.sin(2 * math.pi * q), sy=1 + 0.05 * math.sin(math.pi * q))
            land = math.exp(-((Ti - 2.09) / 0.04) ** 2) if Ti >= 2.07 else 0.0
            return Pose(self.o_walk, H_OW, OX, 0.0, flip=True, sx=1 + 0.08 * land, sy=1 - 0.1 * land)
        if c.clip == "outro":
            w = ease_in(ramp(u, 0.0, 0.9))
            lift, land = hops(u, 0.0, 0.9, 3, 18)
            return Pose(self.o_walk, H_OW, OX + w * 320, lift, sx=1 + 0.08 * land, sy=1 - 0.1 * land)
        q = self.oreo_q(c)
        # ジモモの前を通る（手前なので少し下に）
        front = 2.0 * math.exp(-((self.oreo_x(c) - JX) / 60) ** 2)
        if 0.2 <= q < 0.8:
            lift, land = hops(q, 0.2, 0.8, 3, 20)
            p = Pose(self.o_walk, H_OW, self.oreo_x(c), lift, flip=True, sx=1 + 0.08 * land, sy=1 - 0.1 * land)
        elif 0.8 <= q < 1.3:
            r = (q - 0.8) / 0.5
            p = Pose(self.o_jump, H_OJ, TRIP_O, arc(r, 30), rot=-6 * math.sin(math.pi * r), sy=1 + 0.05 * math.sin(math.pi * r))
        elif 1.3 <= q < 1.9:
            lift, land = hops(q, 1.3, 1.9, 3, 18)
            p = Pose(self.o_walk, H_OW, self.oreo_x(c), lift, sx=1 + 0.08 * land, sy=1 - 0.1 * land)
        elif 1.9 <= q < 2.0:
            k = math.sin(math.pi * (q - 1.9) / 0.1)
            p = Pose(self.o_walk, H_OW, OX, 0.0, flip=q >= 1.95, sx=1 + 0.08 * k, sy=1 - 0.1 * k)
        else:
            # ジモモが掛けに行っているあいだは、その場で跳ねて応援する
            br = 0.015 * math.sin(2 * math.pi * q / 1.0)
            lift, land = hops(q, 2.45, 3.65, 4, 14)
            p = Pose(self.o_walk, H_OW, OX, lift, flip=True, sx=1 + 0.07 * land, sy=1 + br - 0.09 * land)
        p.ground = -front
        return p
