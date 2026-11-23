"""段6（5,000〜9,999円・マゼンタ）: 雪の王子のあやとが、白いトナカイの銀のソリでオーロラの夜空を横切り、
光の尾を引くプレゼントをまく（#1034）。

流れ（秒は登場の動画の時刻）:
- 前兆 0〜1.0: 背景の1枚（オーロラの夜空と雪の町・丘の上の白いお城）が降りてきて、描いたオーロラの上に光のカーテンが
  ゆらめき、星が瞬く。町の窓が左から灯る。雪が降り始める
- 先触れ 0.3〜2.5: ソリより先に、左の外から光の尾を引くプレゼントが4つ、夜空を横切って降る
- 登場 0.8〜1.8: 左から、ソリが箱の幅いっぱい（約 90%）の大きさで駆け込んでくる。ソリの後ろに金の星くずの尾
- 山場 1.4〜3.1: あやとがプレゼントをぽーんと放る（1.4 に3つ、2.05 に2つを高く）。プレゼントは光の尾を引いて降っていく。真ん中で手を振り、
  金の粒がはじける。2.6〜3.1 にソリが右上へ弧を描いて昇り、上の帯で止まる（大きさは箱の幅の 79%）
- キャラ絵が出たら（3.2）: 金の輪がはじける。滞在も全面の景色のまま（縁のぼかしは11月の城と同じ。内側は不透明）
- 滞在（3秒の輪）: 上の帯でソリが浮かんでゆれ、あやとが手を振り、2回プレゼントを放る（光の尾を引いて降る）。
  ソリの後ろから星くずがこぼれ続け、オーロラがゆらめき、流れ星が3つ流れ、町の窓がまたたき、雪が箱ぜんぶに降る
- 締め 1.2秒: ソリが右へ駆け去り、景色が溶ける

あやとが決めた中身（#1034）: 雪の王子のあやとが白いトナカイの銀のソリでオーロラの夜空を横切り、光の尾を引く
プレゼントをまく。月1の額なので、段5 よりはっきり豪華に。
段3・段4 で決めたこと: 登場でいちばん大きく（主役の組が箱の幅の 55% 以上）→ キャラ絵が出る前に上の帯へ退く。
光の筋・粒は録画の 1.0／2.5 秒ではっきり見える明るさと太さ。
あやとの見立て（2026-11-23）: 2,000円からはキャラ絵の後ろをもっと豪華に。11月の城の段6 と同じく、滞在のあいだも
全面の景色を残す（背景の1枚 `plate.webp`）。上の帯のソリは帯いっぱいに。いまの `plate.webp` は、ChatGPT が描いた
段6 の静止画から、上のソリとプレゼントを抜いたもの（その下のオーロラの空を上下に返して埋めた。ChatGPT の絵の上限で
人の居ない背景を描いてもらえなかった日 2026-11-23 のつなぎ）。

描いたオーロラの上に重ねる光のカーテンは、波打つ光を 1/8 の細かさで描いて拡げる（滞在の輪の周期で動くので、継ぎ目でつながる）。
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
from xmas_t67 import load_plate, plate_lights, put_plate, shooting_star  # noqa: E402

ART = os.path.join(ME, "..", "..", "fx_art", "christmas", "t6")

# 上の帯で止まる所（ソリの絵の真ん中）と幅（箱の幅の 79%）。11月の城の段6 のあやと（全身 215px）に見劣りしないよう、
# 上の帯（キャラ絵が出たら隠れない 231 より上）いっぱいに。ゆれ 3px・傾き 1° でも下の端が 228 に収まる
REST, W_REST = (360.0, 114.0), 570.0
HOVER, W_BIG = (360.0, 560.0), 660.0    # 登場で真ん中に浮かぶ所と幅（箱の幅の 92%）
ENTER = (0.8, 1.8)
SWOOP = (2.6, 3.1)
TOSS_INTRO = (1.4, 2.05)                # 登場で放る秒（1.4 に3つ、2.05 に2つ。録画の 2.5 秒で尾が新しい）
# ソリが来る前に、左の外から投げ込まれて夜空を横切るプレゼント（放った秒, x, y, 横の速さ, 縦の速さ）。
# ソリは 0.8〜1.8 で入ってくるので、録画の 1.0 秒にはまだ放る所が画面の外。光の尾が 1.0 秒で読めるように先に飛ばす
HERALD = ((0.30, -40.0, 430.0, 430.0, -320.0), (0.48, -40.0, 560.0, 380.0, -280.0),
          (0.66, -40.0, 330.0, 400.0, -220.0), (0.84, -40.0, 640.0, 350.0, -300.0))
TOSS_STAY = (0.25, 1.4)                 # 滞在の輪の中で放る秒（降り終わりが輪の終わり 3.0 をまたがないように）
BACK_PT = (0.2, 0.18)                   # ソリの絵の中の、プレゼントを放る所（あやとの後ろ・左上）
TAIL_PT = (0.06, 0.78)                  # ソリの絵の中の、星くずがこぼれる所（ソリの後ろの下）
# 流れ星（滞在の輪の中の秒・頭の出る所・向き（度）・長さ）。登場の 1.0 秒からも同じ輪で流れる
SHOOT = ((0.2, 640.0, 300.0, 158.0, 430.0), (0.75, 420.0, 520.0, 152.0, 360.0), (1.25, 560.0, 150.0, 150.0, 380.0),
         (1.75, 690.0, 610.0, 160.0, 420.0), (2.2, 700.0, 430.0, 165.0, 470.0))
AURORA = (  # (下の端の y, 波の高さ, 波長, 1周で何回うねるか, 位相, 下の色, 上の色, 上へのびる長さ)
    (430.0, 60.0, 520.0, 1, 0.1, (0.15, 1.0, 0.55), (0.55, 0.3, 1.0), 170.0),
    (300.0, 45.0, 380.0, 2, 0.6, (0.2, 0.95, 0.85), (0.95, 0.3, 0.8), 130.0),
    (560.0, 35.0, 640.0, 1, 0.35, (0.3, 1.0, 0.6), (0.4, 0.5, 1.0), 110.0),
)


class Scene(Stage):
    TIER = 6
    INTRO, STAY, OUTRO, REVEAL = 4.0, 3.0, 1.2, 3.2
    VARIANTS = ("full",)
    FRONT = {"full": True}

    def setup(self):
        a = lambda n: Art.load(os.path.join(ART, n + ".webp"))
        self.wave, self.toss = a("sleigh_wave"), a("sleigh_toss")
        self.gifts = [a("gift_gold"), a("gift_red"), a("gift_blue")]
        # 背景の1枚（オーロラの夜空と雪の町。滞在もキャラ絵の後ろに全面で残す）
        self.plate = load_plate(os.path.join(ART, "plate.webp"))
        self.lights = plate_lights(self.plate)
        R = np.random.default_rng(6101)
        self.stars = np.stack([R.random(160) * W, R.random(160) ** 1.2 * 950, R.random(160), R.random(160), R.random(160)], -1)
        self.sparkles = np.stack([30 + R.random(44) * 660, 30 + R.random(44) * 900, R.random(44), R.random(44)], -1)
        # 全面の景色の上では、雪の粒の動きが透明の地より小さく数えられる（色だけが変わる）。粒を増やして城の段6 の動きに届かせる
        self.snow_far = Loop(190, 6102, cycles=(1, 1))
        self.snow_mid = Loop(210, 6103, cycles=(2, 2))
        self.near = Loop(30, 6104, cycles=(3, 3))
        self.flake = {r: soft_dot(r) for r in (1.6, 3.0, 6.5)}
        self.dust = Loop(30, 6105, cycles=(2, 2))
        self.bok = Loop(10, 6106, cycles=(2, 2))
        self.glitter = Loop(80, 6107, cycles=(1, 2))
        # オーロラの縦の筋（1/8 の細かさの格子）
        self.au_h, self.au_w = 170, 90
        self.au_y = np.linspace(0, H, self.au_h, dtype=np.float32)[:, None]
        self.au_x = np.linspace(0, W, self.au_w, dtype=np.float32)[None, :]

    # ---------------- ソリ（主役）: 返す (絵, 真ん中の x, y, 幅, 傾き)
    def sleigh(self, c):
        T, Ti, u = c.T, c.Ti, c.u
        bob = 3 * math.sin(2 * math.pi * 2 * (T - self.INTRO) / self.STAY)
        pitch = 1 * math.sin(2 * math.pi * (T - self.INTRO) / self.STAY + 0.6)
        s = (T - self.INTRO) % self.STAY
        toss = any(t0 <= s < t0 + 0.4 for t0 in TOSS_STAY)
        if c.clip == "intro":
            if T < ENTER[0]:
                return None
            if T < ENTER[1]:
                p = ease_out(ramp(T, *ENTER))
                x = lerp(-380, HOVER[0], p)
                y = lerp(650, HOVER[1], p) - 30 * math.sin(math.pi * p)
                return self.wave, x, y, W_BIG, -6 * (1 - p) + 2 * math.sin(T * 9)
            if T < SWOOP[0]:
                art = self.toss if any(t0 <= T < t0 + 0.45 for t0 in TOSS_INTRO) else self.wave
                return art, HOVER[0], HOVER[1] + 8 * math.sin(T * 6), W_BIG, 2 * math.sin(T * 5)
            if T < SWOOP[1]:
                p = ease(ramp(T, *SWOOP))
                # 右上へ弧を描いて昇り、上の帯へ
                x = (1 - p) ** 2 * HOVER[0] + 2 * (1 - p) * p * 600 + p * p * REST[0]
                y = (1 - p) ** 2 * HOVER[1] + 2 * (1 - p) * p * 300 + p * p * (REST[1] + bob)
                return self.wave, x, y, lerp(W_BIG, W_REST, p), -10 * math.sin(math.pi * p) + pitch * p
            return (self.toss if toss else self.wave), REST[0], REST[1] + bob, W_REST, pitch
        if c.clip == "outro":
            w = ease_in(ramp(u, 0.05, 0.75))
            return self.wave, REST[0] + w * 820, REST[1] + bob - w * 60, W_REST, pitch - 6 * w
        return (self.toss if toss else self.wave), REST[0], REST[1] + bob, W_REST, pitch

    def pt(self, x, y, wd, rot, f):
        """ソリの絵の中の点 f（割合）の画面の位置"""
        h = wd * self.wave.h / self.wave.w
        dx, dy = (f[0] - 0.5) * wd, (f[1] - 0.5) * h
        ca, sa = math.cos(math.radians(rot)), math.sin(math.radians(rot))
        return x + ca * dx - sa * dy, y + sa * dx + ca * dy

    def aurora(self, c, cv, k):
        if k <= 0.003:
            return
        ys, xs = self.au_y, self.au_x
        out = np.zeros((self.au_h, self.au_w, 3), np.float32)
        grow = ease(ramp(c.Ti, 0.0, 1.0))
        for j, (y0, amp, lam, cyc, ph, cb, ct, up) in enumerate(AURORA):
            yb = y0 + amp * np.sin(2 * np.pi * (xs / lam + c.ph * cyc + ph)) + 0.4 * amp * np.sin(2 * np.pi * (xs / (lam * 0.43) - c.ph * (cyc + 1) + ph * 2))
            d = ys - yb
            upl = up * (0.3 + 0.7 * grow)
            inten = np.where(d > 0, np.exp(-(d / 14) ** 2), np.exp(-(d / upl) ** 2))
            streak = 0.72 + 0.28 * np.sin(2 * np.pi * (xs / 23 + c.ph * (cyc + 1) + ph)) ** 2
            t_ = np.clip(-d / upl, 0, 1)[..., None]
            col = (1 - t_) * np.float32(cb) + t_ * np.float32(ct)
            out += (inten * streak)[..., None] * col * (0.42 if j < 2 else 0.3)
        up_ = cv2.resize(out, (W, H), interpolation=cv2.INTER_CUBIC)
        cv.emit((np.clip(up_, 0, None) * k).astype(np.float32))

    def gift_flight(self, cv, sp, x0, y0, age, j, k, big=1.0, v=None, g=520.0, life=1.4):
        """放ったプレゼント1つ: 後ろへ飛んで、回りながら光の尾を引いて降る（age 秒）。
        尾は 0.5 秒ぶん・芯 2.0・にじみ 11（芯 1.2・にじみ 7・0.35 秒では、録画の縮んだ絵で尾が読めなかった）"""
        if not (0 <= age < life) or k <= 0.003:
            return
        vx, vy = v if v is not None else (-(140 + 40 * j), -(120 - 30 * j))
        x = x0 + vx * age
        y = y0 + vy * age + 0.5 * g * age * age
        fade = 1 - ease(ramp(age, life - 0.4, life))
        tau = np.linspace(0, 0.5, 360)
        ta = np.clip(age - tau, 0, None)
        tx = x0 + vx * ta
        ty = y0 + vy * ta + 0.5 * g * ta * ta
        trail(self.kit, cv, sp, tx, ty, (1 - tau / 0.5) ** 1.2 * (age - tau > 0), k * fade, head="gold", core=2.0, halo=11.0)
        sprite(cv, self.gifts[j % 3], x, y, 50 * big, anchor=(0.5, 0.5), rot=360 * age * (0.8 + 0.3 * j), k=k * fade)
        glow(cv, x, y, 26, GOLD * 0.6 + WHITE * 0.3, 0.4 * k * fade)

    def draw(self, c):
        Ti, T, u = c.Ti, c.T, c.u
        intro = c.clip == "intro"
        out_k = 1 - ease(ramp(u, 0.3, 1.0))
        back, front, heroc = Canvas(), Canvas(), Canvas()
        sp_b, sp_f = Splat(), Splat()
        sky_k = ease(ramp(Ti, 0.0, 0.6)) * out_k

        # ---- 背景の1枚（オーロラの夜空と雪の町）が上から降りてくる。滞在も全面（縁のぼかしの内側は不透明）。
        # 描かれたオーロラの上に、波打つ光のカーテンを薄く重ねてゆらめかせる
        yy_ = np.arange(H, dtype=np.float32)[:, None]
        drop = np.clip((Ti * 2000 - yy_) / 500, 0, 1)
        put_plate(back, self.plate, drop * out_k)
        self.aurora(c, back, 0.8 * ease(ramp(Ti, 0.1, 1.0)) * out_k)
        st = self.stars
        tw = (0.5 + 0.5 * np.sin(2 * np.pi * (c.ph * (1 + (st[:, 2] * 3).astype(int)) + st[:, 3]))) ** 3
        sp_b.add_screen(st[:, 0], st[:, 1], (WHITE * 1.1)[None] * ((0.15 + 0.7 * tw * st[:, 4]) * sky_k)[:, None])
        for j, (x, y, r0, r1) in enumerate(self.sparkles):
            tw1 = max(0.0, math.sin(6.283 * (c.ph * (1 + int(r0 * 2)) + r1))) ** 3
            fxv.stamp(back.L, self.kit.star["white" if j % 3 else "magenta"], x, y, (0.2 + 0.6 * tw1) * sky_k)

        # ---- 町の窓の灯り（背景の1枚の灯りが、左から灯ってまたたく）
        lk = ease(ramp(Ti, 0.4, 1.2)) * out_k
        if lk > 0.003:
            xx_ = np.arange(W, dtype=np.float32)[None, :]
            fl = np.clip((Ti - 0.4 - xx_ / W * 0.5) / 0.2, 0, 1) * (0.6 + 0.4 * np.sin(2 * np.pi * (c.ph * 2 + xx_ / 37 + yy_ / 23)))
            back.emit((self.lights * fl)[..., None] * (GOLD * 0.9 + AMBER * 0.3 + WHITE * 0.2) * 0.8 * lk)

        # ---- 流れ星（滞在の輪で5つ。登場の 1.0 秒から）
        for j, (t0, x0, y0, ang, ln) in enumerate(SHOOT):
            for age, _ in c.events(self.INTRO + t0, self.STAY, first=1.0, dur=0.7):
                shooting_star(self.kit, back, sp_b, x0, y0, ang, ln, age, sky_k)

        # ---- ソリ（主役だけの層）と、ソリの後ろからこぼれる金の星くず
        sl = self.sleigh(c)
        hk = 1.0 if c.clip != "outro" else out_k
        if sl is not None:
            art, x, y, wd, rot = sl
            h = wd * art.h / art.w
            sprite(heroc, art, x, y, h, anchor=(0.5, 0.5), rot=rot, k=hk, rim=0.5, light_dir=(0.3, -1.0))
            # 星くずの尾（ソリが来た道に沿って。いまの位置から少し前の位置へ）
            tau = np.linspace(0, 0.5, 420)
            tx, ty = [], []
            for tt in tau:
                c2 = Ctx(c.clip, c.i, c.INTRO, c.STAY, c.OUTRO, c.variant)
                c2.T, c2.Ti = c.T - tt, (c.Ti - tt if intro else c.Ti)
                c2.u = max(0.0, c.u - tt / max(c.OUTRO, 1e-6)) if c.clip == "outro" else c.u
                c2.ph = ((c2.T - c.INTRO) / c.STAY) % 1.0
                s2 = self.sleigh(c2)
                if s2 is None:
                    break
                px, py = self.pt(s2[1], s2[2], s2[3], s2[4], TAIL_PT)
                # 止まっているあいだも、尾は後ろ（左）へ流れる
                tx.append(px - tt * 260)
                ty.append(py + 10 * math.sin(tt * 18) + tt * 40)
            if len(tx) > 2:
                tx, ty = np.array(tx), np.array(ty)
                fade = (1 - np.linspace(0, 1, len(tx))) ** 1.3
                trail(self.kit, back, sp_b, tx, ty, fade, 0.9 * hk, head="gold", core=1.4, halo=8.0)
            # 放ったプレゼント（登場の 1.4 に3つ・2.05 に2つ、滞在は 0.25 と 1.4 に1つずつ）
            if intro and T < SWOOP[0] + 1.4:
                bx, by = self.pt(HOVER[0], HOVER[1], W_BIG, 0.0, BACK_PT)
                for j in range(3):
                    self.gift_flight(back, sp_b, bx, by, T - TOSS_INTRO[0] - 0.12 * j, j, 1.0, big=1.3)
                # 2回目は高く放り上げる（左の端のぼかしに沿わず、ソリの左上の暗い空に尾が立つ）
                for j in range(2):
                    self.gift_flight(back, sp_b, bx, by, T - TOSS_INTRO[1] - 0.12 * j, j + 1, 1.0, big=1.3,
                                     v=(-120 - 30 * j, -360 + 50 * j))
            if not intro or T >= SWOOP[1]:
                bx, by = self.pt(REST[0], REST[1], W_REST, 0.0, BACK_PT)
                # 1回に2つずつ放る（全面の景色の上では動きが小さく数えられるので、光の尾を増やす）
                for j, t0 in enumerate(TOSS_STAY):
                    for m in range(2):
                        age = ((T - self.INTRO) - t0 - 0.15 - 0.12 * m) % self.STAY
                        self.gift_flight(back, sp_b, bx, by, age, j + 1 + m, out_k, v=(-(150 + 50 * m + 30 * j), -(140 - 40 * m)))
            # 手を振ると金の粒がはじける（登場の真ん中で）
            if intro:
                hx_, hy_ = self.pt(HOVER[0], HOVER[1], W_BIG, 0.0, (0.25, 0.1))
                burst(back, self.kit, hx_, hy_, (T - 2.0) / 0.6, 6108, n=20, spread=110, cols=("gold", "white", "magenta"))

        # ---- ソリより先に、左の外から投げ込まれて夜空を横切るプレゼント
        if intro and T < 3.0:
            for j, (t0, x0, y0, vx, vy) in enumerate(HERALD):
                self.gift_flight(back, sp_b, x0, y0, T - t0, j, 1.0, big=1.2, v=(vx, vy), g=420.0, life=1.7)

        # ---- 雪（箱ぜんぶに。奥・中は back、手前は front）
        amb = ease(ramp(Ti, 0.1, 0.8)) * out_k
        snowfall(c, ((self.snow_far, self.flake[1.6], 0.5, 1300, 14, back, -30), (self.snow_mid, self.flake[3.0], 0.65, 1340, 24, back, -30),
                     (self.near, self.flake[6.5], 0.5, 1420, 40, front, -30)), amb)
        sp_b.into(back)

        # ---- キャラ絵が出る瞬間: 真ん中の後ろから金とマゼンタの輪
        rv = (T - self.REVEAL) / 0.7 if intro else 9
        if 0 <= rv < 1:
            yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
            rr_ = 110 + 300 * ease_out(rv)
            d = np.hypot(xx - 360, (yy - 760) * 1.12) - rr_
            band = np.exp(-(d / (8 + 26 * rv)) ** 2) * (1 - rv) ** 1.4
            back.emit(band[..., None] * (GOLD * 1.0 + WHITE * 0.5 + MAGENTA * 0.4) * 1.2)
            glow(back, 360, 760, 220, GOLD * 0.6 + MAGENTA * 0.2, 0.6 * (1 - rv) ** 2)
        out_b = back.finish(bloom=0.8, edge=self.edge)
        out_b = over_rgba(self.finish_hero(heroc, bloom=0.45), out_b)
        back_glitter = Canvas()  # 紙吹雪は back に（front は焼くと重い。front の予算は1通りの 15%）

        # ---- front（光と粒だけ）: 手前の雪（snowfall で足した）・金の粉・きらめく紙吹雪・ぼけ玉・キャラ絵のふちの星
        sk = ease(ramp(Ti, 0.8, 1.4)) * out_k
        dd = self.dust
        a3 = dd.age(c)
        x = 40 + dd.r[:, 0] * 640 + 30 * np.sin(6.283 * (a3 + dd.r[:, 1]))
        y = 1250 - a3 * 1200
        tw = (0.5 + 0.5 * np.sin(6.283 * (a3 * 3 + dd.r[:, 2]))) ** 2
        sp_f.add_screen(x, y, (GOLD * 0.8 + MAGENTA * 0.3)[None] * (np.sin(np.pi * a3) ** 1.5 * (0.3 + 0.7 * dd.r[:, 3] ** 2) * tw * sk)[:, None])
        sp_f.into(front)
        g = self.glitter
        a4 = g.age(c)
        for j in range(g.n):
            rr = g.r[j]
            xg = rr[0] * W + 36 * math.sin(6.283 * (a4[j] * 1.5 + rr[1]))
            yg = -30 + a4[j] * 1330
            tw_ = (0.5 + 0.5 * math.sin(6.283 * (a4[j] * 4 + rr[2]))) ** 2
            kk = math.sin(math.pi * a4[j]) ** 0.6 * (0.3 + 0.5 * tw_) * sk
            if kk > 0.02:
                fxv.stamp(back_glitter.L, self.kit.star[("gold", "white", "magenta", "cyan")[j % 4]], xg, yg, kk)
        for j in range(self.bok.n):
            rr = self.bok.r[j]
            a1 = self.bok.age(c)[j]
            xb = (rr[0] * 1.1 - 0.05) * W + 30 * math.sin(6.283 * (a1 + rr[1]))
            yb = H * (0.95 - 0.8 * a1) - rr[2] * 120
            kk = math.sin(math.pi * a1) ** 2 * (0.07 + 0.07 * rr[3]) * amb
            spr = self.kit.bokeh_spr(26 + rr[4] * 40, j % 3, [GOLD, MAGENTA * 0.7 + WHITE * 0.3, CYAN * 0.6 + WHITE * 0.4][j % 3], 6 + rr[5] * 6)
            fxv.stamp(front.L, spr, xb, yb, kk)
        if intro:
            rv = T - self.REVEAL
            if 0 <= rv < 0.9:
                R = np.random.default_rng(78)
                for k in range(28):
                    ang_ = R.random() * 6.283
                    dist = 170 + 230 * ease_out(rv / 0.9) * (0.6 + 0.4 * R.random())
                    fxv.stamp(front.L, self.kit.star[("gold", "white", "magenta")[k % 3]], 360 + math.cos(ang_) * dist * 0.9,
                              760 + math.sin(ang_) * dist * 1.05, 0.9 * (1 - rv / 0.9) ** 1.5 * (0.5 + 0.5 * R.random()))
        out_b = over_rgba(back_glitter.finish(bloom=0.3, edge=self.edge), out_b)
        return out_b, self.finish_front(front, bloom=0.7)
