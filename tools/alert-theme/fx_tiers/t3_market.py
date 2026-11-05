"""段3（500〜999円・緑）: 家族で、クリスマスマーケットをおさんぽ（画面の下の帯。暗くしない）。

叩き台ペラ一の流れ（秒は登場の動画の時刻）:
- 前兆 0〜0.4: 下の帯に、マーケットの灯りがひとつずつ点く
- 登場 0.4〜1.4: ラブブ母さんが灯りの中を歩いてくる。ピポとオレオは母さんのまわりをぐるぐる駆け回りながらついてくる。
  ジモモは少しうしろから（1.4 で投げた人のキャラ絵）
- 山場 1.4〜2.2: 母さんが止まると、灯りがいっせいにきらめき、雪が舞い始める
- 滞在（4秒の輪）: ピポとオレオは母さんのまわりを追いかけっこ（1周 2秒。ピポは跳ねて、2周目は大きく跳ぶ。
  オレオは跳びかかる・ばんざいで跳ねる）。ジモモは左で、降ってくる大きな雪の結晶を跳び上がってつかまえる（2回）。
  母さんは子どもたちを見てゆれ、ピポが大きく跳ぶと一緒に小さく跳ねる
- 締め 1.0秒: 右の奥へ歩いて行き（子どもたちは回りながら）、灯りが順に消える

あやと 2026-11-05「200,500は動きがもうちょいほしい」（#1095）で、子どもたちが跳ねて・回って・雪をつかまえる形に
作り直した。前は 3秒の輪で、子どもたちが 9px ずつ交互に跳ねるだけだった。輪を 4秒にした
（アラートの長さは再生の側が決めるので、輪を長くしても演出の秒は変わらない）。

ピポの絵は、11月の城の貯金箱のポーズ絵（`public/alert/themes/castle/pipo-*.png`。同じケープのピポ）から、
走る2枚と跳ぶ絵を `fx_art/t3/pipo_*.webp` に写した。顔の幅は全部 100px で描かれているので、同じ倍率で縮める。
ジモモのばんざいは段2 の絵（`fx_art/t2/jimomo_banzai.webp`）を、顔の幅をそろえて使う。

屋台は帯の左右の端、灯りの紐はその間にかかる。家族は下の 28% の帯（キャラ絵の箱の下の端 0.72 より下。
CONTRACT.md の追記 2026-11-04）の中を動く。跳ねる・伸びると絵の上の端が動くので、`put_pose` で帯の天井
（`ceiling`）からはみ出す分だけ下げる。光と粒（雪・結晶・ぼけ玉）は帯の上に出てよいが、箱の真ん中より上には出さない。
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from fx_stage import *  # noqa: E402,F401,F403
import fx_stage as fs  # noqa: E402

ART = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "fx_art", "t3")
ART2 = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "fx_art", "t2")

# 顔の幅（px）をそろえた高さ。ピポ（末っ子）は少し小さく
FACE_KID, FACE_PIPO = 62.0, 54.0
MX, RX = 372.0, 136.0   # 母さんの立つ所と、子どもたちが回る輪の横の半径（左右の屋台のあいだ）
LAP = 2.0               # 1周の秒（滞在 4秒で 2周。輪の継ぎ目でつながる）
JX = 112.0              # ジモモの立つ所（左の屋台の前）
# ジモモが結晶をつかまえる2回（滞在の秒・跳び上がる x）
CATCH = ((0.95, 146.0), (2.95, 80.0))


def snowflake_sprite(r=20):
    """光の雪の結晶（6本の腕に小枝。前掛けの RGB の光）"""
    n = int(r * 2 + 10)
    img = np.zeros((n, n), np.float32)
    c = n / 2
    for k in range(6):
        a = math.pi / 3 * k + math.pi / 2
        dx, dy = math.cos(a), math.sin(a)
        cv2.line(img, (int(c * 4), int(c * 4)), (int((c + dx * r) * 4), int((c + dy * r) * 4)), 1.0, 4, cv2.LINE_AA, shift=2)
        for f, ln in ((0.55, 0.35), (0.8, 0.22)):
            px, py = c + dx * r * f, c + dy * r * f
            for sgn in (-1, 1):
                b = a + sgn * math.pi / 3
                cv2.line(img, (int(px * 4), int(py * 4)), (int((px + math.cos(b) * r * ln) * 4), int((py + math.sin(b) * r * ln) * 4)),
                         0.9, 3, cv2.LINE_AA, shift=2)
    core = img[..., None] * (WHITE * 1.3 + CYAN * 0.3)
    halo = cv2.GaussianBlur(img, (0, 0), 3.0)[..., None] * (CYAN * 0.5 + WHITE * 0.4)
    return (core + halo * 0.6).astype(np.float32)


class Scene(Stage):
    TIER = 3
    INTRO, STAY, OUTRO, REVEAL = 2.2, 4.0, 1.0, 1.4
    VARIANTS = ("full",)
    # 〜999円の段は帯の中の小さな絵なので、予算は小さく（画質の段が QBEST に当たって、たいていこれより小さく焼ける）
    BUDGET_KB = {"full": 1500}
    FRONT = {"full": False}

    BOTTOM = SAFE_BOTTOM
    # 投げた人のキャラ絵の箱の下の端。下の 28%（y 922〜）が猫の帯（CONTRACT.md の追記 2026-11-04）
    CHAR_BOTTOM = 0.72
    # 屋台は前の 188px から少し低く（子どもたちが回る間を、屋台のあいだに取る）
    STALL_H = 168.0

    def setup(self):
        a = lambda n: Art.load(os.path.join(ART, n + ".webp"))
        stalls = a("stalls").levels[0]
        h_, w_ = stalls.shape[:2]
        # 屋台の絵（左右の屋台と、間の灯りの紐）を左右の屋台に分けて、帯の両端に置く。
        # 1枚のまま帯の高さに縮めると、屋台が真ん中に寄って家族の後ろに隠れた
        r0, r1 = int(0.10 * h_), int(0.95 * h_)
        self.stall_l = Art(np.ascontiguousarray(stalls[r0:r1, :int(0.40 * w_)]))
        self.stall_r = Art(np.ascontiguousarray(stalls[r0:r1, int(0.61 * w_):]))
        self.st_scale = self.STALL_H / self.stall_l.h
        self.st_lx1 = self.stall_l.w * self.st_scale            # 左の屋台の右の端
        self.st_rx0 = W - self.stall_r.w * self.st_scale        # 右の屋台の左の端
        # 家族の絵と、顔の幅をそろえた高さ（ジモモ・オレオは頭の幅 280〜300px の絵、ピポの城の絵は顔の幅 100px）
        b = lambda n: Art.load(os.path.join(ART2, n + ".webp"))
        self.lovebu = (a("lovebu_walk"), 190.0)
        self.j_walk = (a("jimomo_walk"), 474 * FACE_KID / 280)
        self.j_banzai = (b("jimomo_banzai"), 508 * FACE_KID / 260)
        self.o_walk = (a("oreo_walk"), 475 * FACE_KID / 285)
        self.o_push = (b("oreo_push"), 460 * FACE_KID / 290)
        self.o_banzai = (b("oreo_banzai"), 508 * FACE_KID / 295)
        k = FACE_PIPO / 100
        self.p_run = [(a("pipo_run0"), 162 * k), (a("pipo_run1"), 162 * k)]
        self.p_leap = (a("pipo_leap"), 150 * k)
        self.flake = snowflake_sprite(20)
        # 灯り（屋台の電球・ランタン）: 描かれた明るい暖色の小さな塊
        self.win_l = fs.window_mask(self.stall_l.levels[0])
        self.win_r = fs.window_mask(self.stall_r.levels[0])
        R = np.random.default_rng(303)
        bl = []
        for side, win in (("l", self.win_l), ("r", self.win_r)):
            ys, xs = np.nonzero(win > 0.6)
            pick = R.choice(len(ys), size=min(28, len(ys)), replace=False)
            for yy_, xx_ in zip(ys[pick], xs[pick]):
                sx = xx_ * self.st_scale + (0 if side == "l" else self.st_rx0)
                sy = self.BOTTOM - self.STALL_H + yy_ * self.st_scale
                bl.append((sx, sy))
        self.bulbs = np.array(bl, np.float64)
        self.bulb_ph = R.random(len(bl))
        # 屋台の間にかかる灯りの紐（光だけ。帯の上の端にたわむ）
        n = 13
        xs_ = np.linspace(self.st_lx1 - 18, self.st_rx0 + 18, n)
        t_ = np.linspace(0, 1, n)
        ys_ = self.BOTTOM - self.STALL_H + 22 + 34 * 4 * t_ * (1 - t_)
        self.garland = np.stack([xs_, ys_], -1)
        self.snow = Loop(150, 304, cycles=(1, 2))
        # 奥のマーケットの灯り（ぼけ玉）。左右の帯に多く、真ん中は薄く
        self.bok = Loop(16, 305, cycles=(1, 1))

    def stall_light(self, cv, art, win, x0, Ti, c, u, sk):
        """屋台の灯り（描かれた電球）を、前兆で左から順に点ける。締めは右から順に消える"""
        xx = (x0 + np.arange(art.w, dtype=np.float32)[None, :] * self.st_scale) / W
        on = np.clip((Ti - 0.05 - xx * 0.35) / 0.08, 0, 1)
        if c.clip == "outro":
            on = on * np.clip((xx - u * 1.3 + 0.2) / 0.1, 0, 1)
        spark = 1 + 1.3 * math.exp(-((Ti - 1.55) / 0.12) ** 2) * (c.clip == "intro")
        fl = 0.8 + 0.2 * np.sin(6.283 * (c.ph * 3 + xx * 9))
        em = (win * on * fl * spark)[..., None] * (GOLD * 0.9 + WHITE * 0.4) * 0.6 * sk
        sw, sh = art.w * self.st_scale, art.h * self.st_scale
        src = np.float32([[0, 0], [art.w, 0], [art.w, art.h], [0, art.h]])
        dst = np.float32([[x0, self.BOTTOM - sh], [x0 + sw, self.BOTTOM - sh], [x0 + sw, self.BOTTOM], [x0, self.BOTTOM]])
        r = fs.warp_into(em.astype(np.float32), src, dst)
        if r is not None:
            im, ox, oy = r
            cv.emit(im[..., :3], ox, oy)

    def draw(self, c):
        Ti, T, u = c.Ti, c.T, c.u
        cv = Canvas()
        hero = Canvas()  # 猫の家族だけ（fx_hero.py が、キャラ絵に隠れていないかを数える。重ねはしない）
        out_k = 1 - ease(ramp(u, 0.4, 1.0))
        top = H * 0.5 + 8  # これより上に出さない（光と粒も）
        # 屋台（帯の左右の端。灯りは前兆で左から順に点く）
        sk = ease(ramp(Ti, 0.0, 0.35)) * (1 - ease(ramp(u, 0.5, 1.0)))
        lit = ease(ramp(Ti, 0.05, 0.45))
        grade = np.array([0.95, 0.92, 0.95], np.float32) * (0.55 + 0.45 * lit)
        sprite(cv, self.stall_l, 0, self.BOTTOM, self.STALL_H, anchor=(0.0, 1.0), k=sk, grade=grade)
        sprite(cv, self.stall_r, W, self.BOTTOM, self.STALL_H, anchor=(1.0, 1.0), k=sk, grade=grade)
        self.stall_light(cv, self.stall_l, self.win_l, 0.0, Ti, c, u, sk)
        self.stall_light(cv, self.stall_r, self.win_r, self.st_rx0, Ti, c, u, sk)
        # 屋台の間の灯りの紐（前兆で左から順に点く。山場でいっせいにきらめく。滞在は順に瞬く）
        sp = Splat()
        xs_ = np.linspace(self.garland[0, 0], self.garland[-1, 0], 160)
        t_ = (xs_ - xs_[0]) / (xs_[-1] - xs_[0])
        ys_ = self.BOTTOM - self.STALL_H + 22 + 34 * 4 * t_ * (1 - t_)
        sp.add_screen(xs_, ys_, np.tile(AMBER * 0.12 + GOLD * 0.05, (160, 1)) * sk)
        sp.into(cv)
        for j, (bx, by) in enumerate(self.garland):
            on = clamp01((Ti - 0.1 - (bx / W) * 0.3) / 0.08)
            if c.clip == "outro":
                on *= clamp01((bx / W - u * 1.3 + 0.2) / 0.1)
            tw = 0.7 + 0.3 * math.sin(6.283 * (c.ph * 2 + j / 4))
            tw += 1.2 * math.exp(-((Ti - 1.55 - (bx / W) * 0.2) / 0.1) ** 2) * (c.clip == "intro")
            col = [GOLD, np.float32([1.0, 0.4, 0.35]), np.float32([0.5, 1.0, 0.6])][j % 3]
            glow(cv, bx, by, 7, col * 0.9 + WHITE * 0.2, 0.9 * on * tw * sk)
            glow(cv, bx, by, 22, col * 0.25, 0.5 * on * tw * sk)
        # 灯りの星（滞在の輪で瞬く。山場でいっせいに）
        for j, (bx, by) in enumerate(self.bulbs):
            tw = max(0.0, math.sin(6.283 * (c.ph * (1 + j % 3) + self.bulb_ph[j]))) ** 6
            tw = max(tw, math.exp(-((Ti - 1.55 - (bx / W) * 0.2) / 0.1) ** 2) * (c.clip == "intro"))
            on = clamp01((Ti - 0.05 - (bx / W) * 0.35) / 0.08)
            if c.clip == "outro":
                on *= clamp01((bx / W - u * 1.3 + 0.2) / 0.1)
            if by > top and tw > 0.03:
                fxv.stamp(cv.L, self.kit.star["gold" if j % 4 else "white"], bx, by, 0.55 * tw * sk * on)
        # 奥の灯りのぼけ玉（前兆で点き、滞在の輪でゆっくり漂う。箱の下半分の中だけ）
        bk = ease(ramp(Ti, 0.1, 0.6)) * (1 - ease(ramp(u, 0.3, 0.9)))
        if bk > 0.003:
            cols = (GOLD * 0.9 + AMBER * 0.3, np.float32([1.0, 0.35, 0.3]), np.float32([0.45, 1.0, 0.55]), WHITE * 0.7 + GOLD * 0.4)
            for j in range(self.bok.n):
                rr = self.bok.r[j]
                a1 = self.bok.age(c)[j]
                side = rr[0] < 0.75
                x = (rr[1] * 150 + 10) if (side and j % 2) else ((W - 10 - rr[1] * 150) if side else 200 + rr[1] * 320)
                x += 16 * math.sin(6.283 * (a1 + rr[2]))
                y = 830 + rr[3] * 200 - 40 * a1
                kk = (0.09 + 0.1 * rr[4]) * (0.55 + 0.45 * math.sin(math.pi * a1) ** 2) * bk * (1.0 if side else 0.55)
                kk *= 1 + 1.2 * math.exp(-((Ti - 1.55) / 0.15) ** 2) * (c.clip == "intro")
                spr = self.kit.bokeh_spr(16 + rr[5] * 20, j % 4, cols[j % 4], 4 + rr[6] * 4)
                fxv.stamp(cv.L, spr, x, y, kk)
        # 家族: 母さんのまわりを、ピポとオレオが追いかけっこ。奥を回るときは母さんの後ろに描く
        fk = ease(ramp(Ti, 0.4, 0.55)) * out_k
        mx = self.mom_x(c)
        kids = [self.pipo(c, mx), self.oreo(c, mx)]
        tg = (cv, hero)
        ceil = self.ceiling(c)
        for pose, depth in kids:
            if depth < 0:
                contact_shadow(cv, pose.x, self.BOTTOM - 2 - pose.ground, pose.h * 0.36, 0.22 * fk * pose.k)
                put_pose(tg, pose, self.BOTTOM - 2, ceil, k=fk, rim=0.35, light_dir=(-0.5, -1.0))
        mom = self.mom(c, mx)
        contact_shadow(cv, mom.x, self.BOTTOM - 2, 80, 0.3 * fk)
        put_pose(tg, mom, self.BOTTOM - 2, ceil, k=fk, rim=0.35, light_dir=(-0.5, -1.0))
        for pose, depth in kids:
            if depth >= 0:
                contact_shadow(cv, pose.x, self.BOTTOM - 2 - pose.ground, pose.h * 0.4 * (1 - min(0.6, pose.lift / 120)), 0.28 * fk * pose.k)
                put_pose(tg, pose, self.BOTTOM - 2, ceil, k=fk, rim=0.35, light_dir=(-0.5, -1.0))
        jp = self.jimomo(c, mx)
        contact_shadow(cv, jp.x, self.BOTTOM - 2, 44 * (1 - min(0.6, jp.lift / 120)), 0.28 * fk * jp.k)
        put_pose(tg, jp, self.BOTTOM - 2, ceil, k=fk, rim=0.35, light_dir=(-0.5, -1.0))
        # 雪（山場から。滞在の輪で降り続ける）
        amb = ease(ramp(Ti, 1.45, 2.0)) * out_k
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
        # ジモモがつかまえる大きな雪の結晶（つかまえたら、手の中で光の粒にはじける）
        self.draw_flakes(c, cv, top, out_k)
        self.finish_hero(hero, bloom=0.0)
        return cv.finish(bloom=0.55, edge=self.edge), None

    # ---------------- 帯の天井（猫の絵の上の端をここより下に）
    def ceiling(self, c):
        """キャラ絵の箱の下の端は 0.72（922px）。出る瞬間は 1.05 倍にふくらむ（938px）ので、出てから 0.9 秒は少し低く。
        出る前は、箱の真ん中より下（fx_check の〜999円の場所）まで"""
        if c.clip == "intro" and c.T < self.REVEAL:
            return H * 0.5 + 30
        if c.clip == "intro" and c.T < self.REVEAL + 0.9:
            return 942.0
        return 926.0

    def s_of(self, c):
        """滞在の輪の中の秒（0〜4）。登場のうちは負（登場の終わりで 0）、締めは滞在の頭から進む"""
        if c.clip == "stay":
            return (c.ph * self.STAY) % self.STAY
        return c.T - self.INTRO

    # ---------------- 母さん（輪の真ん中）。登場で左から歩いてきて止まり、締めで右へ歩いて行く
    def mom_x(self, c):
        x = lerp(MX - 760, MX, ease_out(ramp(c.Ti, 0.4, 1.4)))
        if c.clip == "outro":
            x += ease_in(c.u) * 700
        return x

    def mom(self, c, mx):
        art, h = self.lovebu
        T, u = c.T, c.u
        stride = (1 - ease(ramp(c.Ti, 1.25, 1.45))) if c.clip == "intro" else (ease(u) if c.clip == "outro" else 0.0)
        bob = abs(math.sin(T * 2.6 * math.pi * 2)) * 3 * stride
        s = self.s_of(c)
        # 滞在: 子どもたちを目で追って、ゆっくりゆれる。ピポが大きく跳ぶと（2.4〜2.7）一緒に小さく跳ねる
        calm = ease(ramp(c.Ti, 1.45, 1.9)) if c.clip == "intro" else 1.0
        sway = 3.0 * math.sin(2 * math.pi * s / LAP) * calm
        sm = s % self.STAY
        joy = arc((sm - 2.4) / 0.3, 7) if c.clip != "intro" and 2.4 <= sm < 2.7 else 0.0
        return Pose(art, h, mx, bob + joy, rot=sway, sy=1 + 0.02 * math.sin(2 * math.pi * s / LAP) * calm)

    # ---------------- 母さんのまわりを回る子（ピポとオレオ）
    def circle(self, c, mx, off):
        """輪の上の位置: (x, 奥行き -1〜1（1 が手前）, 進む向き（+1 右・-1 左）, 周の位相 0〜1, 何周目か)"""
        s = self.s_of(c)
        th = off + 2 * math.pi * s / LAP
        x = mx + RX * math.cos(th)
        d = math.sin(th)
        # 進む向きは、輪を回る速さと母さんの歩く速さの和（登場と締めは母さんが動く）
        dt = 1 / 60
        c2 = Ctx(c.clip, c.i, c.INTRO, c.STAY, c.OUTRO, c.variant)
        c2.T = c.T + dt
        c2.Ti = c.Ti + dt if c.clip == "intro" else c.Ti
        c2.u = min(1.0, c.u + dt / max(c.OUTRO, 1e-6)) if c.clip == "outro" else c.u
        vx = (self.mom_x(c2) + RX * math.cos(th + 2 * math.pi * dt / LAP)) - x
        lap = (th - off) / (2 * math.pi)
        return x, d, (1 if vx >= 0 else -1), lap % 1.0, math.floor(lap)

    def depth_pose(self, pose, d):
        """奥（d<0）を回るときは、少し上に・少し小さく"""
        w = (d + 1) / 2
        pose.ground = 18 * (1 - w)
        pose.h *= 0.86 + 0.14 * w
        return pose

    def pipo(self, c, mx):
        x, d, dirn, p, n = self.circle(c, mx, 0.0)
        run_art, run_h = self.p_run[int(math.floor(c.T * 8)) % 2]
        # 2周目の手前（輪の 0.08〜0.42）は、ケープをなびかせて大きく跳ぶ（滞在の 2.16〜2.84）
        if c.clip != "intro" and n % 2 == 1 and 0.08 < p < 0.42:
            q = (p - 0.08) / 0.34
            art, h = self.p_leap
            pose = Pose(art, h, x, arc(q, 62), rot=dirn * lerp(-12, 14, q), flip=dirn < 0)
        else:
            lift, land = hops(p, 0.0, 1.0, 4, 20)
            pose = Pose(run_art, run_h, x, lift, flip=dirn < 0, sx=1 + 0.08 * land, sy=1 - 0.1 * land,
                        rot=dirn * 6 * math.sin(2 * math.pi * 8 * p))
        if c.clip == "intro" and c.Ti < 0.45:
            pose.k = 0.0
        return self.depth_pose(pose, d), d

    def oreo(self, c, mx):
        # ピポを半周すこし遅れて追いかける
        x, d, dirn, p, n = self.circle(c, mx, -2.4)
        walk_art, walk_h = self.o_walk
        if c.clip != "intro" and n % 2 == 0 and 0.12 < p < 0.4:
            # 1周目の手前: ピポに跳びかかる（押す絵は左向き）
            q = (p - 0.12) / 0.28
            art, h = self.o_push
            pose = Pose(art, h, x, arc(q, 46), rot=-dirn * lerp(10, -8, q), flip=dirn > 0)
        elif c.clip != "intro" and n % 2 == 1 and 0.55 < p < 0.8:
            # 2周目の奥の左で、ばんざいで跳ねて雪をはたく
            q = (p - 0.55) / 0.25
            art, h = self.o_banzai
            pose = Pose(art, h, x, arc(q, 40), sy=1 + 0.06 * math.sin(math.pi * q))
        else:
            lift, land = hops(p, 0.0, 1.0, 5, 14)
            pose = Pose(walk_art, walk_h, x, lift, flip=dirn < 0, sx=1 + 0.08 * land, sy=1 - 0.1 * land,
                        rot=dirn * 5 * math.sin(2 * math.pi * 10 * p))
        if c.clip == "intro" and c.Ti < 0.45:
            pose.k = 0.0
        return self.depth_pose(pose, d), d

    # ---------------- ジモモ（左）。降ってくる大きな雪の結晶を、跳び上がってつかまえる（滞在の 1周に2回）
    def jimomo(self, c, mx):
        wa, wh = self.j_walk
        ba, bh = self.j_banzai
        if c.clip == "intro" and c.Ti < 1.4:
            # 母さんの少しうしろを、小走りについてくる
            run = 1 - ease(ramp(c.Ti, 1.2, 1.4))
            return Pose(wa, wh, mx - (MX - JX), 6 * abs(math.sin(c.T * 16)) * run, rot=4 * math.sin(c.T * 16) * run,
                        k=0.0 if c.Ti < 0.45 else 1.0)
        if c.clip == "intro":
            # 止まって、滞在の頭と同じ姿（立って見上げる前）で待つ
            return Pose(wa, wh, JX, 0.0)
        if c.clip == "outro":
            # 締め: 滞在の頭（立っている）から、みんなを追って右へ
            x = JX + ease_in(ramp(c.u, 0.1, 1.0)) * 820
            return Pose(wa, wh, x, 6 * abs(math.sin(c.T * 16)) * ease(ramp(c.u, 0.1, 0.25)))
        s = self.s_of(c)
        q, cx = 0.0, CATCH[0][1]
        for t_c, x_c in CATCH:
            if 0 <= s - (t_c - 0.95) < 2.0:
                q, cx = s - (t_c - 0.95), x_c
                break
        flip = cx < JX
        if q < 0.45:
            # 見上げて待つ（のけぞる）
            return Pose(wa, wh, JX, 0.0, rot=-7 * ease(ramp(q, 0.0, 0.25)) * (-1 if flip else 1), flip=flip)
        if q < 0.7:
            # 落ちてくる所へ、とことこ
            p = (q - 0.45) / 0.25
            return Pose(wa, wh, lerp(JX, cx, ease(p)), 5 * abs(math.sin(2 * math.pi * 2 * p)), rot=-7 * (-1 if flip else 1), flip=flip)
        if q < 0.8:
            k = math.sin(math.pi * (q - 0.7) / 0.1)
            return Pose(wa, wh, cx, 0.0, sx=1 + 0.1 * k, sy=1 - 0.16 * k, flip=flip)
        if q < 1.1:
            # 跳び上がって、ばんざいでつかまえる（頂が 0.95）
            p = (q - 0.8) / 0.3
            return Pose(ba, bh, cx, arc(p, 66), sx=1 - 0.05 * math.sin(math.pi * p), sy=1 + 0.08 * math.sin(math.pi * p))
        if q < 1.3:
            # 着地してつぶれ、うれしくて体をふる
            r = (q - 1.1) / 0.2
            land = math.exp(-(r / 0.35) ** 2)
            return Pose(ba, bh, cx, 0.0, rot=10 * math.sin(2 * math.pi * 2 * r), sx=1 + 0.18 * land, sy=1 - 0.22 * land)
        # 元の場所へ、跳ねながら戻る
        p = (q - 1.3) / 0.7
        lift, land = hops(q, 1.3, 2.0, 2, 18)
        return Pose(ba, bh, lerp(cx, JX, ease(p)), lift, sx=1 + 0.1 * land, sy=1 - 0.12 * land)

    def draw_flakes(self, c, cv, top, out_k):
        """ジモモがつかまえる大きな雪の結晶。滞在のうちだけ（輪の頭で 0 から点くので、継ぎ目でつながる）"""
        if c.clip == "intro":
            return
        s = self.s_of(c)
        _, bh = self.j_banzai
        hand_y = self.BOTTOM - 2 - 66 - bh * 0.92  # 跳んだ頂の、ばんざいの手の高さ
        for t_c, cx in CATCH:
            q = (s - (t_c - 0.95)) % self.STAY
            if q < 0.95:
                # 箱の真ん中より下から、ゆらゆら落ちてくる
                p = q / 0.95
                x = cx + 34 * math.sin(2 * math.pi * 1.2 * p) * (1 - p)
                y = lerp(top + 40, hand_y, ease(p) * 0.6 + p * 0.4)
                k = ease(ramp(q, 0.0, 0.2)) * out_k
                spr = sprite_rot(np.dstack([self.flake, self.flake[..., :1]]), 2 * math.pi * 0.35 * p, 1.0)[..., :3]
                fxv.stamp(cv.L, np.ascontiguousarray(spr), x, y, 0.95 * k)
                glow(cv, x, y, 14, CYAN * 0.4 + WHITE * 0.2, 0.12 * k)
            elif q < 1.45:
                # つかまえた: 手の中で光の粒にはじける
                age = (q - 0.95) / 0.5
                R = np.random.default_rng(int(t_c * 100))
                for j in range(12):
                    ang = 2 * math.pi * R.random()
                    d = (14 + 46 * R.random()) * ease_out(age)
                    fxv.stamp(cv.L, self.kit.star["white" if j % 3 else "cyan"], cx + math.cos(ang) * d, hand_y + 6 + math.sin(ang) * d * 0.8,
                              0.85 * (1 - age) ** 1.3 * out_k)
                glow(cv, cx, hand_y + 6, 30, CYAN * 0.5 + WHITE * 0.5, 0.7 * (1 - age) ** 2 * out_k)
