"""段7（10,000円〜・赤）: 黒と赤の王子のあやとが、わたあめの雲の上で杖を振ると、赤いじゅうたんが手前から奥へ
転がり出て、お菓子の世界が順に立ち上がる（#1034）。

流れ（秒は登場の動画の時刻）:
- 前兆 0〜0.9: 赤い夜空（背景の1枚の空）が降りてきて、星が瞬く。金の光のリボンが2本、上の角から渦を巻いて流れ込む。
  花火が上がり始める
- 登場 0.15〜0.9: わたあめの雲に乗ったあやとが、上から箱の真ん中へ大きく（あやとの幅が箱の 52%・雲の幅が 80%）降りてくる。1.0 で杖の星が光る
- 0.6〜1.3: 背景の1枚の砂糖の雪原が、手前から地平線まで広がる。奥の真ん中に金の門の光
- 1.42 杖を振り下ろす → 1.5〜2.6 赤いじゅうたんの筒が手前から奥へ転がって、じゅうたんが敷かれていく
- 2.62 杖を振る → キャンディケインの列が手前から奥へ順に立ち上がり、ペロペロキャンディ・マカロン・グミ・いちごが出る
- 3.28 杖を振る → ジンジャーブレッドの兵隊さんが左右に立ち上がって敬礼
- 3.86 杖を振る → 左にケーキのツリー、右にお菓子のお城が立ち上がる（飾りと窓が灯る）
- 3.95〜4.65: あやとが上の帯へ退き、雲が腰までふくらむ（滞在は雲から上だけを、上の帯に大きく）
- キャラ絵が出たら（4.7）: 金の輪がはじける（登場の終わり 5.4 までに消えきる）
- 滞在（3秒の輪）: 背景の1枚とお菓子の世界は全面のまま。あやとが雲の中でゆれて、杖の星から2回光が飛ぶ。花火が3発、リボンの光が流れ、
  キャンディケインがゆれ、兵隊さんが交代で敬礼し、お城の窓とツリーの飾りがまたたき、じゅうたんの縁を金の光が奥へ走る
- 締め 1.2秒: あやとが上へ飛び去り、景色が溶ける（輪で動くものは滞在の頭の姿で止める）

あやとが決めた中身（#1034）: 1万円〜は、黒と赤の王子のあやと・敷かれる赤いじゅうたん・豪華なお菓子の世界が
魔法で現れる。部品は分けて描いてある（`fx_art/christmas/t7/`）ので、直しは部品の差し替えで済む。
段3〜6 で決めたこと: 登場でいちばん大きく（主役の組が箱の幅の 55% 以上）→ キャラ絵が出る前に上の帯へ退く。
光の筋・粒は録画の 1.0／2.5 秒ではっきり見える明るさと太さ。お城・ツリー・マントは箱の縁で切らない。
あやとの見立て（2026-11-23）: 2,000円からはキャラ絵の後ろをもっと豪華に。11月の城の段7 と同じく、滞在のあいだも
全面の景色を残す（背景の1枚 `plate.webp`。縁のぼかしは城と同じ）。いまの `plate.webp` は、ChatGPT の絵の上限で
人の居ない舞台を描いてもらえなかった日（2026-11-23）のつなぎで、この台本の遠近（地平線 690・真ん中の奥に門）に合わせて
手元で塗った空と雪原。ChatGPT に描いてもらった絵に差し替えるときは、地平線と門の位置を HZ に合わせる。
滞在のあやとは城の段7 のあやと（全身 250px ほど）より大きく、しかもキャラ絵に隠れない上の帯に収めるので、
腰から下を手前の雲に沈める（雲より下は主役の層に描かない）。

奥行きは、地平線 HZ と「奥行き d の物の足もとの y = HZ + (Y1 - HZ) / d」だけの簡単な遠近。
じゅうたんは平らな帯の絵を台形へ写す（遠いほど模様が詰まる）。
"""
import math
import os
import sys

import cv2
import numpy as np

ME = os.path.dirname(os.path.abspath(__file__))  # fx_stage も HERE を持つので、別の名前に
sys.path.insert(0, os.path.join(ME, "..", ".."))
sys.path.insert(0, ME)
from fx_stage import *  # noqa: E402,F401,F403
import fx_stage as fs  # noqa: E402
from xmas_kit import burst, emit_masked, soft_dot, trail  # noqa: E402
from xmas_t67 import firework as firework67, load_plate, put_plate  # noqa: E402

ART = os.path.join(ME, "..", "..", "fx_art", "christmas", "t7")
RED = np.float32([1.0, 0.25, 0.3])

# ---- 遠近（地平線・奥行き 1 の足もと・じゅうたんの半分の幅）
HZ, Y1, CW = 690.0, 1190.0, 200.0
D_NEAR, D_FAR = 0.84, 9.0


def gy(d):
    """奥行き d の地面の y"""
    return HZ + (Y1 - HZ) / d


def gx(lat, d):
    """奥行き d・横 lat（奥行き 1 での px）の x"""
    return 360.0 + lat / d


# ---- あやと（わたあめの雲に乗る）。雲はあやとの手前に置く。登場は雲の上に立ち、滞在は腰まで雲に沈む
# 滞在のあやとを11月の城の段7（全身 250px ほど）より大きく、しかも上の帯（キャラ絵が出たら隠れない 231 より上）に
# 収めるため。雲より下のあやとは描かない（主役の層に、キャラ絵の後ろへ回る画素を残さない）
A_BIG, TOP_BIG = 470.0, 30.0            # 登場（あやとの高さ・上の端。あやとの幅が箱の 52%・雲の幅が 80%。静止画のあやとの 9割より大きく）
A_REST, TOP_REST = 310.0, 8.0           # 滞在（顔の幅 84px）
CLOUD_W, CLOUD_SY = 1.55, 0.55          # 登場の雲（あやとの絵の幅に対する幅・縦のつぶし）
BANK = (190.0, 520.0, 160.0)            # 滞在の雲の土手（上の端・幅・高さ）
CLIP_IN = 0.19                          # 雲の上の端から、あやとを切る線まで（雲の高さに対する割合。雲の中身が詰まっている所）
DESCEND = (0.15, 0.85)
RETREAT = (3.95, 4.65)                  # ツリーとお城が立ち上がるのと一緒に退く（大きな雲が、立ち上がるところを隠さない）
STAR_UP = (0.19, 0.12)                  # あやとの絵の中の、杖の星（掲げた／振り下ろした）
STAR_SWING = (0.54, 0.79)
FACE = (0.36, 0.70, 0.21, 0.435)        # あやとの絵の中の顔（x0, x1, y0, y1。割合）
SWAY = 2.5                              # 滞在で雲の中で左右にゆれる（度）
# 登場で杖を振る秒と、光が飛ぶ先（そのあとにじゅうたん・ケインの列・兵隊さん・ツリーとお城が出る）
SWINGS = ((1.42, ((360.0, 1120.0),)), (2.62, ((175.0, 1000.0), (545.0, 1000.0))),
          (3.28, ((215.0, 920.0), (505.0, 920.0))), (3.86, ((190.0, 600.0), (530.0, 640.0))))
SWING_LEN = 0.42
STAY_CAST = (0.7, 1.95)                 # 滞在の輪の中で杖の星から光を飛ばす秒（はじけ終わるのが輪の終わり 3.0 をまたがないように）
ROLL = (1.5, 2.6)

# ---- お菓子の世界（奥行き d・横 lat・高さ（奥行き 1 での px）・立ち上がる秒）
# ケインと兵隊さんは、じゅうたんの両の縁に1列に並ぶ（兵隊さんはケインの列の2か所に立つ衛兵）
CANE_D = (1.12, 2.05, 3.4, 4.5, 6.0)
CANE_LAT, CANE_H, CANE_T = CW + 46.0, 250.0, 2.70
SOLDIER_D, SOLDIER_H, SOLDIER_T = (1.55, 2.7), 285.0, 3.34
LOLLI = (1.0, 265.0, 130.0, 2.70)
# ツリーとお城は、じゅうたんの奥の両わき（箱の縁 60px のぼかしにかからず、じゅうたんにも乗らない奥行き）。
# 静止画（あやとの見本）のツリーとお城に負けない大きさ
TREE = (4.0, 190.0, 377.0, 3.92)        # (d, 画面の x, 画面の高さ, 秒)
CASTLE = (4.2, 530.0, 333.0, 3.98)
RISE = 0.32

# ---- 金の光のリボン（3次ベジェの4点・太さ・流れ込む秒）
# 上の端の 120px は箱の縁のぼかしなので、リボンはその下から入れる（録画の縮んだ絵で、細い筋は消える。太く明るく）
RIBBONS = (((-60.0, 250.0), (250.0, 120.0), (40.0, 520.0), (300.0, 660.0), 40.0, 0.25),
           ((780.0, 210.0), (470.0, 110.0), (700.0, 470.0), (440.0, 650.0), 38.0, 0.40),
           ((-40.0, 640.0), (200.0, 450.0), (520.0, 560.0), (760.0, 380.0), 24.0, 0.95))
# ---- 花火（1秒ごとに1発。3か所を順に。滞在の輪で3発）
FW_SPOTS = ((115.0, 440.0, GOLD * 1.1 + WHITE * 0.2), (605.0, 410.0, PINK * 0.9 + WHITE * 0.4),
            (360.0, 560.0, WHITE * 0.7 + GOLD * 0.5))


def bez(P, s):
    (x0, y0), (x1, y1), (x2, y2), (x3, y3) = P
    m = 1 - s
    x = m ** 3 * x0 + 3 * m * m * s * x1 + 3 * m * s * s * x2 + s ** 3 * x3
    y = m ** 3 * y0 + 3 * m * m * s * y1 + 3 * m * s * s * y2 + s ** 3 * y3
    dx = 3 * m * m * (x1 - x0) + 6 * m * s * (x2 - x1) + 3 * s * s * (x3 - x2)
    dy = 3 * m * m * (y1 - y0) + 6 * m * s * (y2 - y1) + 3 * s * s * (y3 - y2)
    n = np.hypot(dx, dy) + 1e-6
    return x, y, -dy / n, dx / n


class Scene(Stage):
    TIER = 7
    # 登場 6.0・締め 1.5 では Actions の焼きが 2回続けて途中で止まった（2026-11-23。段6 の長さに近づける）
    INTRO, STAY, OUTRO, REVEAL = 5.4, 3.0, 1.2, 4.7
    VARIANTS = ("full",)
    FRONT = {"full": True}

    def setup(self):
        a = lambda n: Art.load(os.path.join(ART, n + ".webp"))
        self.up, self.sw = a("ayato_up"), a("ayato_swing")
        self.cloud = a("cloud")
        # 背景の1枚（空と雪原。滞在もキャラ絵の後ろに全面で残す）
        self.plate = load_plate(os.path.join(ART, "plate.webp"))
        self.cane, self.lolli = a("cane"), a("lolli")
        self.candy = [a(n) for n in ("mac_pink", "gum_yellow", "berry", "mac_green", "gum_orange")]
        self.sold, self.salute = a("soldier"), a("soldier_salute")
        self.tree, self.castle = a("caketree"), a("castle")
        self.tree_win = fs.gold_mask(self.tree.levels[0])
        self.castle_win = fs.window_mask(self.castle.levels[0])
        self.roll = a("roll")
        self.build_carpet(Art.load(os.path.join(ART, "carpet.webp")).levels[0])
        self.build_items()
        R = np.random.default_rng(7101)
        self.stars = np.stack([R.random(120) * W, R.random(120) ** 1.2 * 660, R.random(120), R.random(120), R.random(120)], -1)
        self.sparkles = np.stack([30 + R.random(20) * 660, 40 + R.random(20) * 600, R.random(20), R.random(20)], -1)
        self.rib = []
        for P0, P1, P2, P3, wd, t0 in RIBBONS:
            n = 480
            self.rib.append(dict(P=(P0, P1, P2, P3), w=wd, t0=t0, s=np.linspace(0, 1, n),
                                 o=np.clip(R.normal(0, 0.4, n), -1, 1), ph=R.random(n), m=R.integers(1, 3, n)))
        # 降る紙吹雪は焼くと重い（44粒で back が 1秒 90KB）。16粒に
        self.glitter = Loop(16, 7102, cycles=(1, 1))
        self.dust = Loop(26, 7103, cycles=(1, 2))
        self.bok = Loop(10, 7104, cycles=(1, 1))
        self.fluff = Loop(16, 7105, cycles=(1, 2))
        self.glint = Loop(14, 7106, cycles=(1, 1))
        self.sugar = np.stack([R.random(30), R.random(30), R.random(30)], -1)
        self.dot = {r: soft_dot(r, GOLD * 1.1 + WHITE * 0.3) for r in (1.4, 2.4)}

    # ---------------- 組み立て
    def build_carpet(self, tex):
        """平らな赤いじゅうたんの帯（横長）を2枚つないで、手前 D_NEAR から奥 D_FAR までの台形へ写す"""
        tex = np.concatenate([tex, tex[:, ::-1]], axis=1)
        th, tw = tex.shape[:2]
        src = np.float32([[0, 0], [tw, 0], [tw, th], [0, th]])
        dst = np.float32([[360 - CW / D_NEAR, gy(D_NEAR)], [360 - CW / D_FAR, gy(D_FAR)],
                          [360 + CW / D_FAR, gy(D_FAR)], [360 + CW / D_NEAR, gy(D_NEAR)]])
        self.carpet = warp_into(tex, src, dst)

    def build_items(self):
        """お菓子の世界の物（遠いものから描く）。背景の1枚の手前の隅にもお菓子はあるので、ばらまく粒は少なめ"""
        R = np.random.default_rng(7111)
        items = []
        for i, d in enumerate(CANE_D):
            for side_ in (-1, 1):
                items.append(dict(kind="cane", d=d, lat=side_ * CANE_LAT, h=CANE_H, t=CANE_T + 0.07 * i, side=side_, i=i))
        for side_ in (-1, 1):
            d, lat, hh, t = LOLLI
            items.append(dict(kind="lolli", d=d, lat=side_ * lat, h=hh, t=t + (0.05 if side_ > 0 else 0), side=side_, i=0))
            for i, d in enumerate(SOLDIER_D):
                items.append(dict(kind="soldier", d=d, lat=side_ * CANE_LAT, h=SOLDIER_H, t=SOLDIER_T + 0.12 * i + (0.06 if side_ > 0 else 0),
                                  side=side_, i=i))
        for j in range(12):
            side_ = -1 if j % 2 == 0 else 1
            d = 1.0 + R.random() ** 1.3 * 1.8
            lat = side_ * (CW + 30 + R.random() * 270)
            if abs(gx(lat, d) - 360) > 268:
                lat = side_ * 268 * d
            items.append(dict(kind="candy", d=d, lat=lat, h=62.0 + 18 * R.random(), t=2.74 + 0.1 * (d - 1) + 0.05 * R.random(),
                              side=side_, i=j % len(self.candy)))
        d, x, hh, t = TREE
        items.append(dict(kind="tree", d=d, lat=(x - 360) * d, h=hh * d, t=t, side=-1, i=0))
        d, x, hh, t = CASTLE
        items.append(dict(kind="castle", d=d, lat=(x - 360) * d, h=hh * d, t=t, side=1, i=0))
        self.items = sorted(items, key=lambda it: -it["d"])

    # ---------------- あやと
    def hero(self, c):
        """あやとと雲の置き場。返す dict: 絵・x・あやとの上の端と高さ・ゆれ・雲（上の端・幅・高さ）・あやとを切る線"""
        T, u = c.T, c.u
        bob = 3 * math.sin(2 * math.pi * (T - self.INTRO) / self.STAY)
        swing = False
        if c.clip == "intro":
            if T < DESCEND[0]:
                return None
            top_b = lerp(-700.0, TOP_BIG, back_out(ramp(T, *DESCEND), 1.2))
            r = ease(ramp(T, *RETREAT))
            swing = any(t0 <= T < t0 + SWING_LEN for t0, _ in SWINGS)
        else:
            top_b, r = TOP_BIG, 1.0
        A = lerp(A_BIG, A_REST, r)
        top = lerp(top_b, TOP_REST + bob, r)
        ar = self.up.w / self.up.h
        cw_b = CLOUD_W * A_BIG * ar
        ch_b = cw_b / (self.cloud.w / self.cloud.h) * CLOUD_SY
        cy_b = top_b + 0.985 * A_BIG - 0.30 * ch_b
        cw, ch = lerp(cw_b, BANK[1], r), lerp(ch_b, BANK[2], r)
        cy = lerp(cy_b, BANK[0] + bob, r)
        # 滞在のゆれ（登場の終わりで 0。退くあいだに入ってくる）
        rot = SWAY * r * math.sin(2 * math.pi * (T - self.INTRO) / self.STAY)
        if c.clip == "outro":
            up_ = 460 * ease_in(ramp(u, 0.05, 0.7))
            top, cy = top - up_, cy - up_
        return dict(art=self.sw if swing else self.up, x=360.0, top=top, A=A, rot=rot, cw=cw, ch=ch, cy=cy,
                    clip=cy + CLIP_IN * ch, swing=swing)

    def star_at(self, hp, swing=None):
        swing = hp["swing"] if swing is None else swing
        fx_, fy_ = STAR_SWING if swing else STAR_UP
        pw = hp["A"] * self.up.w / self.up.h
        return hp["x"] + (fx_ - 0.5) * pw, hp["top"] + fy_ * hp["A"]

    def face_box(self, c):
        """顔の箱（画面の px: x0, y0, x1, y1）。manifest の顔の線を引く道具が読む"""
        hp = self.hero(c)
        if hp is None:
            return None
        pw = hp["A"] * self.up.w / self.up.h
        x, top, A = hp["x"], hp["top"], hp["A"]
        return x + (FACE[0] - 0.5) * pw, top + FACE[2] * A, x + (FACE[1] - 0.5) * pw, top + FACE[3] * A

    # ---------------- 1コマ
    def draw(self, c):
        Ti, T, u = c.Ti, c.T, c.u
        intro = c.clip == "intro"
        if c.clip == "outro":
            # 締めは輪で動くもの（花火・リボン・粒・ゆれ）を滞在の頭の姿で止めて、消えるだけにする（段5 と同じ。画質の予算）
            c.ph = 0.0
        Tp = self.INTRO if c.clip == "outro" else T      # 輪の出来事（花火）を数える時計
        out_k = 1 - ease(ramp(u, 0.15, 0.85))
        back, front, heroc = Canvas(), Canvas(), Canvas()
        sp_b, sp_f = Splat(), Splat()
        sky_k = ease(ramp(Ti, 0.0, 0.6)) * out_k
        lit = ease(ramp(Ti, 0.6, 1.4))

        # ---- 背景の1枚: 空は上から降りてきて、地面は手前から地平線へ広がる。滞在は全面（縁のぼかしの内側は不透明）
        yy = np.arange(H, dtype=np.float32)[:, None]
        drop = np.clip((Ti * 2200 - yy) / 500, 0, 1)
        yg = lerp(H + 40, HZ - 60, ease_out(ramp(Ti, 0.6, 1.3)))
        rev = np.clip((yy - yg) / 70, 0, 1)
        gnd = np.clip((yy - (HZ - 80)) / 60, 0, 1)
        put_plate(back, self.plate, drop * (1 - gnd + gnd * rev) * out_k)
        st = self.stars
        tw = (0.5 + 0.5 * np.sin(2 * np.pi * (c.ph * (1 + (st[:, 2] * 3).astype(int)) + st[:, 3]))) ** 3
        sp_b.add_screen(st[:, 0], st[:, 1], (WHITE * 1.1)[None] * ((0.15 + 0.7 * tw * st[:, 4]) * sky_k)[:, None])
        for j, (x, y, r0, r1) in enumerate(self.sparkles):
            tw1 = max(0.0, math.sin(6.283 * (c.ph * (1 + int(r0 * 2)) + r1))) ** 3
            fxv.stamp(back.L, self.kit.star[("white", "gold", "pink")[j % 3]], x, y, (0.2 + 0.6 * tw1) * sky_k)

        # ---- 地平線の金の門の光（奥の真ん中から、扇の光がゆっくり首を振る）
        gk = ease(ramp(Ti, 0.6, 1.3)) * out_k
        self.gate_rays(c, back, gk)

        # ---- 花火（1秒ごと。登場の 0.55 から）
        for age, k in c.events(self.INTRO + 0.1, 1.0, first=0.55, dur=1.1) if c.clip != "outro" else []:
            x, y, col = FW_SPOTS[k % 3]
            self.firework(sp_b, back, x, y, age, 7200 + (k % 3), col, sky_k)
        if c.clip == "outro":
            for age, k in self._events_at(Tp):
                x, y, col = FW_SPOTS[k % 3]
                self.firework(sp_b, back, x, y, age, 7200 + (k % 3), col, sky_k)

        # ---- 金の光のリボン
        for j, rb in enumerate(self.rib):
            self.ribbon(c, back, sp_b, rb, j, sky_k)

        # ---- 地平線の門の光と、雪の上の砂糖のきらめき
        wk = out_k
        glow(back, 360, HZ + 30, 100, GOLD * 0.8 + WHITE * 0.3, (0.32 + 0.06 * c.osc(2)) * gk)
        for j, (r0, r1, r2) in enumerate(self.sugar):
            d = 1.0 + r0 * 3
            side = -1 if j % 2 else 1
            x, y = gx(side * (CW + 20 + r1 * 300), d), gy(d)
            tw1 = max(0.0, math.sin(6.283 * (c.ph * (1 + j % 2) + r2))) ** 4
            if y > yg + 30:
                fxv.stamp(back.L, self.kit.star["white"], x, y, 0.7 * tw1 * wk)

        # ---- 赤いじゅうたん（筒が手前から奥へ転がる）
        # 筒は画面の上をなめらかに進める（奥行きで等速にすると、遠近で動きの大半が最初の 0.3 秒に詰まる）
        rp = ease(ramp(Ti, *ROLL))
        y_roll = lerp(gy(D_NEAR), gy(D_FAR), rp) if rp > 0 else H + 10
        d_roll = (Y1 - HZ) / max(y_roll - HZ, 1e-3)
        if rp > 0:
            im, x0, y0 = self.carpet
            ys = np.arange(y0, y0 + im.shape[0], dtype=np.float32)[:, None]
            m = np.clip((ys - y_roll) / 2.0, 0, 1) * wk
            back.over((im[..., :3] * m[..., None]).astype(np.float32), (im[..., 3] * m).astype(np.float32), x0, y0)
            self.carpet_glints(c, back, y_roll, wk)
        if 0 < rp < 1:
            wd = 2 * CW / d_roll * 1.1
            hh = wd / (self.roll.w / self.roll.h) * (1 - 0.45 * rp)
            sprite(back, self.roll, 360, y_roll + 0.12 * hh, hh, anchor=(0.5, 1.0), sx=(wd / hh) / (self.roll.w / self.roll.h) * 1.0,
                   k=1.0 - ease(ramp(rp, 0.9, 1.0)), rim=0.3)
            # 筒の両端からこぼれる金の粉
            R = np.random.default_rng(int(T * 30))
            for side in (-1, 1):
                xe = 360 + side * wd * 0.5
                xs_ = xe + R.normal(0, 6, 8)
                ys_ = y_roll + R.random(8) * 60 / d_roll
                sp_b.add_screen(xs_, ys_, (GOLD * 2.0 + WHITE * 0.6)[None] * np.full((8, 1), 0.9, np.float32), coc=np.full(8, 1.0))
        if intro:
            burst(back, self.kit, 360, gy(D_FAR) - 4, (T - ROLL[1] + 0.05) / 0.7, 7120, n=18, spread=70, cols=("gold", "white"))

        # ---- お菓子の世界（遠いものから）
        for it in self.items:
            self.put_item(c, back, it, wk)

        # ---- あやと（主役だけの層）と、手前の雲（別の層。あやとより手前）。杖の星・振ったときの光
        hp = self.hero(c)
        hk = 1.0 if c.clip != "outro" else 1 - ease(ramp(u, 0.3, 0.75))
        cloudc = Canvas()
        if hp is not None:
            x, A = hp["x"], hp["A"]
            ay = (hp["clip"] - hp["top"]) / A
            sprite(heroc, hp["art"], x, hp["clip"], A, anchor=(0.5, ay), rot=hp["rot"], k=hk, rim=0.45, light_dir=(-0.3, -1.0),
                   clip_below=hp["clip"])
            sprite(cloudc, self.cloud, x, hp["cy"], hp["ch"], anchor=(0.5, 0.0), sx=(hp["cw"] / hp["ch"]) / (self.cloud.w / self.cloud.h),
                   k=hk, rim=0.25, light_dir=(-0.3, -1.0))
            sx_, sy_ = self.star_at(hp)
            z = A / A_REST
            self.cloud_fluff(c, back, x, hp["cy"] + hp["ch"] * 0.8, hp["cw"], z, hk)
            if intro:
                # 1.0 で杖を掲げて星が光る
                fl = math.exp(-((T - 1.0) / 0.12) ** 2)
                fxv.stamp(back.L, self.kit.flare_s, sx_, sy_, 0.8 * fl)
                burst(back, self.kit, sx_, sy_, (T - 0.95) / 0.6, 7130, n=16, spread=50 * z, cols=("gold", "white", "pink"))
                for j, (t0, tg) in enumerate(SWINGS):
                    self.beam(back, sp_b, hp, t0, tg, T, 7140 + j, swing=True)
            elif c.clip == "stay":
                s = (c.ph * self.STAY) % self.STAY
                for j, t0 in enumerate(STAY_CAST):
                    tg = ((TREE[1], 640.0),) if j == 0 else ((CASTLE[1], 660.0),)
                    fl = math.exp(-((s - t0) / 0.1) ** 2)
                    fxv.stamp(back.L, self.kit.flare_s, sx_, sy_, 0.7 * fl)
                    self.beam(back, sp_b, hp, t0, tg, s, 7150 + j, swing=False)
            # 星は いつも かすかに光る
            glow(back, sx_, sy_, 16 * z, GOLD * 0.8 + WHITE * 0.4, 0.35 * hk)
            if intro and T < DESCEND[1] + 0.2:
                # 降りてくる雲のうしろの、ピンクと金のきらきらの尾
                tau = np.linspace(0, 0.45, 200)
                ty = np.array([lerp(-700.0, TOP_BIG, back_out(ramp(T - tt, *DESCEND), 1.2)) for tt in tau]) + A * 0.95
                fade = (1 - tau / 0.45) ** 1.3 * (T - tau > DESCEND[0])
                for side in (-1, 1):
                    trail(self.kit, back, sp_b, x + side * hp["cw"] * 0.3 + 0 * ty, ty, fade, 0.8 * (1 - ramp(T, 0.8, 1.05)),
                          head="pink" if side < 0 else "gold", core=1.6, halo=9.0)

        # ---- 金の紙吹雪（back。箱ぜんぶにゆらゆら降る）
        sk = ease(ramp(Ti, 0.5, 1.0)) * out_k
        g = self.glitter
        a4 = g.age(c)
        for j in range(g.n):
            rr = g.r[j]
            x = rr[0] * W + 36 * math.sin(6.283 * (a4[j] * 1.5 + rr[1]))
            y = -30 + a4[j] * 1330
            tw_ = (0.5 + 0.5 * math.sin(6.283 * (a4[j] * 4 + rr[2]))) ** 2
            kk = math.sin(math.pi * a4[j]) ** 0.6 * (0.3 + 0.5 * tw_) * sk
            if kk > 0.02:
                fxv.stamp(back.L, self.kit.star[("gold", "white", "pink")[j % 3]], x, y, kk)
        sp_b.into(back)

        # ---- キャラ絵が出る瞬間: 真ん中の後ろから金の輪
        rv = (T - self.REVEAL) / 0.6 if intro else 9
        if 0 <= rv < 1:
            yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
            rr_ = 110 + 300 * ease_out(rv)
            d = np.hypot(xx - 360, (yy - 760) * 1.12) - rr_
            band = np.exp(-(d / (8 + 26 * rv)) ** 2) * (1 - rv) ** 1.4
            back.emit(band[..., None] * (GOLD * 1.1 + WHITE * 0.5 + RED * 0.3) * 1.2)
            glow(back, 360, 760, 220, GOLD * 0.7 + WHITE * 0.2, 0.6 * (1 - rv) ** 2)
        out_b = back.finish(bloom=0.8, edge=self.edge)
        out_b = over_rgba(self.finish_hero(heroc, bloom=0.4), out_b)
        out_b = over_rgba(cloudc.finish(bloom=0.0, edge=self.hero_edge), out_b)

        # ---- front（光と粒だけ）: 金の粉が昇る・ぼけ玉・キャラ絵が出る瞬間の星
        dd = self.dust
        a3 = dd.age(c)
        x = 60 + dd.r[:, 0] * 600 + 30 * np.sin(6.283 * (a3 + dd.r[:, 1]))
        y = 1250 - a3 * 1150
        tw = (0.5 + 0.5 * np.sin(6.283 * (a3 * 3 + dd.r[:, 2]))) ** 2
        sp_f.add_screen(x, y, GOLD[None] * (np.sin(np.pi * a3) ** 1.5 * (0.25 + 0.6 * dd.r[:, 3] ** 2) * tw * sk)[:, None])
        sp_f.into(front)
        for j in range(self.bok.n):
            rr = self.bok.r[j]
            a1 = self.bok.age(c)[j]
            x = (rr[0] * 1.1 - 0.05) * W + 30 * math.sin(6.283 * (a1 + rr[1]))
            y = H * (0.95 - 0.8 * a1) - rr[2] * 120
            kk = math.sin(math.pi * a1) ** 2 * (0.07 + 0.07 * rr[3]) * sk
            spr = self.kit.bokeh_spr(26 + rr[4] * 40, j % 3, [GOLD, RED * 0.6 + GOLD * 0.4, GOLD * 0.7 + WHITE * 0.4][j % 3], 6 + rr[5] * 6)
            fxv.stamp(front.L, spr, x, y, kk)
        if intro:
            rv = T - self.REVEAL
            if 0 <= rv < 0.65:
                R = np.random.default_rng(79)
                for k in range(26):
                    ang_ = R.random() * 6.283
                    dist = 170 + 220 * ease_out(rv / 0.65) * (0.6 + 0.4 * R.random())
                    fxv.stamp(front.L, self.kit.star["gold" if k % 3 else "white"], 360 + math.cos(ang_) * dist * 0.9,
                              760 + math.sin(ang_) * dist * 1.05, 0.85 * (1 - rv / 0.65) ** 1.5 * (0.5 + 0.5 * R.random()))
        return out_b, self.finish_front(front, bloom=0.7)

    def _events_at(self, Tp):
        c2 = Ctx("stay", 0, self.INTRO, self.STAY, self.OUTRO, self.variant)
        c2.T = Tp
        return c2.events(self.INTRO + 0.1, 1.0, first=0.55, dur=1.1)

    # ---------------- 部品
    def put_item(self, c, cv, it, wk):
        T = c.T
        intro = c.clip == "intro"
        if intro and T < it["t"]:
            return
        d = it["d"]
        r = back_out(ramp(T, it["t"], it["t"] + RISE), 1.6) if intro else 1.0
        base = gy(d)
        x = gx(it["lat"], d)
        h = it["h"] / d
        kind = it["kind"]
        fog = 1 - 0.22 * (1 - 1 / d)
        grade = np.float32([fog, fog * 0.97, fog]) * (0.82 + 0.18 * wk)
        ph = c.ph
        rot, sx, art, lift = 0.0, 1.0, None, 0.0
        if kind == "cane":
            art = self.cane
            sx = -1.0 if it["side"] < 0 else 1.0      # 曲がった頭を、じゅうたんの側へ
            # ケインはゆらさない（10本の縁が毎コマ動くと、焼いて 1秒 40KB 重い。動きは城の段7 の 2倍あるので要らない）
        elif kind == "lolli":
            art = self.lolli
            rot = 3.0 * math.sin(2 * math.pi * (ph + (0.25 if it["side"] > 0 else 0.0)))
        elif kind == "candy":
            art = self.candy[it["i"]]
        elif kind == "soldier":
            s = (ph * self.STAY) % self.STAY
            on = ((0.3, 1.1) if it["side"] < 0 else (1.8, 2.6)) if it["i"] == 0 else ((1.8, 2.6) if it["side"] < 0 else (0.3, 1.1))
            sal = (on[0] <= s < on[1]) if not intro else (it["t"] + 0.25 <= T < it["t"] + 1.0)
            art = self.salute if sal else self.sold
            sx = 1.0 if it["side"] < 0 else -1.0       # 敬礼の手が、外側に来る向き
            if not intro:
                lift, _ = hops(s, on[0] - 0.12, on[0] + 0.12, 1, 7)
        elif kind == "tree":
            art = self.tree
        elif kind == "castle":
            art = self.castle
        y = base + (1 - r) * h * 1.04 - lift
        dst = sprite(cv, art, x, y, h, anchor=(0.5, 1.0), rot=rot, sx=sx, k=wk, grade=grade, rim=0.3,
                     light_dir=(0.0, -1.0), clip_below=base + 3 if r < 1.0 else None)
        if intro:
            burst(cv, self.kit, x, base - 4, (T - it["t"]) / 0.55, 7300 + int(it["d"] * 100) + (it["side"] > 0),
                  n=8 if kind in ("candy", "cane") else 16, spread=(26 if kind in ("candy", "cane") else 70) / max(d * 0.7, 1.0),
                  cols=("gold", "white", "pink"), k=wk)
        lk = ease(ramp(T, it["t"] + 0.15, it["t"] + 0.6)) * wk if intro else wk
        if kind == "tree" and dst is not None:
            emit_masked(cv, self.tree_win, dst, lambda yy, xx: 0.45 + 0.55 * np.sin(6.283 * (ph * 3 + xx * 5 - yy * 7)) ** 2, 0.9 * lk)
            fxv.stamp(cv.L, self.kit.star_big["gold"], x, y - h * 0.94, (0.6 + 0.3 * c.osc(2)) * lk)
        if kind == "castle" and dst is not None:
            emit_masked(cv, self.castle_win, dst, lambda yy, xx: 0.75 + 0.25 * np.sin(6.283 * (ph * 2 + xx * 9 + yy * 3)),
                        0.9 * lk, col=GOLD * 0.9 + AMBER * 0.4 + WHITE * 0.2)

    def carpet_glints(self, c, cv, y_roll, wk):
        """じゅうたんの金の縁を、光が手前から奥へ走る（滞在の輪で1周）"""
        g = self.glint
        a_ = g.age(c)
        for j in range(g.n):
            f = a_[j]
            d = 1 / lerp(1 / 0.95, 1 / 8.0, f)
            side = -1 if j % 2 else 1
            x, y = gx(side * 158, d), gy(d)
            if y < y_roll + 4:
                continue
            kk = math.sin(math.pi * f) ** 0.8 * (1.1 / d) * wk
            fxv.stamp(cv.L, self.kit.star["gold" if j % 3 else "white"], x, y, min(1.0, kk))

    def cloud_fluff(self, c, cv, x, y, gw, z, k):
        """わたあめの雲からこぼれる、ピンクと白の甘いきらきら"""
        g = self.fluff
        a_ = g.age(c)
        for j in range(g.n):
            rr = g.r[j]
            xx = x + (rr[0] - 0.5) * gw * 0.8 + 10 * z * math.sin(6.283 * (a_[j] + rr[1]))
            yy = y + a_[j] * 90 * z
            kk = math.sin(math.pi * a_[j]) * (0.35 + 0.4 * rr[2]) * k
            fxv.stamp(cv.L, self.kit.star["pink" if j % 2 else "white"], xx, yy, kk)

    def beam(self, cv, sp, hp, t0, targets, t, seed, swing=True):
        """杖を振ると（滞在は掲げた杖の星から）、光が弧を描いて飛び、着いた所ではじける"""
        age = t - t0 - 0.08
        if not (0 <= age < 0.95):
            return
        sx_, sy_ = self.star_at(hp, swing=swing)
        for j, (tx, ty) in enumerate(targets):
            cx, cy = (sx_ + tx) / 2 + (j - 0.5) * 120, min(sy_, ty) - 120
            fly = 0.32
            p = min(age / fly, 1.0)
            tau = np.linspace(0, 0.3, 200)
            q = np.clip(p - tau / fly * 1.0, 0, 1)
            bx = (1 - q) ** 2 * sx_ + 2 * (1 - q) * q * cx + q * q * tx
            by = (1 - q) ** 2 * sy_ + 2 * (1 - q) * q * cy + q * q * ty
            fade = (1 - tau / 0.3) ** 1.2 * (p - tau / fly > 0) * (1 - ease(ramp(age, 0.35, 0.6)))
            trail(self.kit, cv, sp, bx, by, fade, 1.0, head="gold" if j == 0 else "pink", core=2.0, halo=11.0)
            burst(cv, self.kit, tx, ty, (age - fly) / 0.6, seed + j, n=18, spread=70, cols=("gold", "white", "pink"))

    def firework(self, sp, cv, x, y, age, seed, col, k):
        firework67(sp, cv, x, y, age, seed, col, k)

    def ribbon(self, c, cv, sp, rb, j, k):
        """金の光のリボン: 道のまわりに光の粒を撒き、明るさの波が流れる（滞在の輪の周期）"""
        if c.clip == "intro":
            prog = ease_out(ramp(c.Ti, rb["t0"], rb["t0"] + 0.75))
        else:
            prog = 1.0
        if prog <= 0.001 or k <= 0.003:
            return
        s = rb["s"]
        x, y, nx, ny = bez(rb["P"], s)
        wob = 10 * np.sin(2 * np.pi * (s * 1.5 - c.ph + 0.3 * j))
        wdt = rb["w"] * (0.35 + 0.65 * (1 - s)) * rb["o"] + wob
        px_, py_ = x + nx * wdt, y + ny * wdt
        vis = np.clip((prog - s) / 0.04, 0, 1)
        flow = (0.5 + 0.5 * np.sin(2 * np.pi * (s * 3 - c.ph * 2 + 0.3 * j))) ** 2
        tw = 0.5 + 0.5 * np.sin(2 * np.pi * (c.ph * rb["m"] + rb["ph"]))
        b = (0.25 + 0.75 * flow) * (0.4 + 0.6 * tw) * vis * k
        col = GOLD * 1.4 + WHITE * 0.4
        # 芯（道の真ん中を途切れずに）・撒いた粒・にじみ
        x0_, y0_ = x + nx * wob, y + ny * wob
        sp.add_screen(x0_, y0_, col[None] * (b * 2.2)[:, None], coc=np.full(len(s), 1.0))
        sp.add_screen(px_, py_, col[None] * (b * 1.3)[:, None], coc=np.full(len(s), 1.0))
        sp.add_screen(x0_[::2], y0_[::2], (GOLD * 1.2)[None] * (b[::2] * 6.5)[:, None], coc=np.full(len(s[::2]), 3.5))
        sp.add_screen(x0_[::4], y0_[::4], (GOLD * 0.9 + RED * 0.3)[None] * (b[::4] * 14.0)[:, None], coc=np.full(len(s[::4]), 7.0))
        for i in range(0, len(s), 32):
            fxv.stamp(cv.L, self.kit.star["gold" if i % 64 else "white"], float(px_[i]), float(py_[i]), 0.7 * float(b[i]))
        if prog < 1.0:
            hx, hy, _, _ = bez(rb["P"], np.float64(prog))
            fxv.stamp(cv.L, self.kit.star_big["gold"], float(hx), float(hy), 1.0 * k)
            glow(cv, float(hx), float(hy), 26, GOLD * 0.8 + WHITE * 0.4, 0.6 * k)

    def gate_rays(self, c, cv, k):
        """地平線の門から昇る扇の光（やわらかい光なので焼いても軽い。滞在の輪の周期）"""
        if k <= 0.003:
            return
        if not hasattr(self, "_rg"):
            h, w = 160, 90
            ys = np.linspace(0, H, h, dtype=np.float32)[:, None]
            xs = np.linspace(0, W, w, dtype=np.float32)[None, :]
            self._rg = (ys, xs)
        ys, xs = self._rg
        dx, dy = xs - 360, (HZ + 50) - ys
        ang = np.arctan2(dx, np.maximum(dy, 1e-3))
        dist = np.hypot(dx, dy)
        out = np.zeros((ys.shape[0], xs.shape[1], 3), np.float32)
        for j, (cyc, ph, wdt) in enumerate(((1, 0.0, 0.09), (2, 0.35, 0.07), (1, 0.6, 0.08), (2, 0.8, 0.06), (1, 0.2, 0.05))):
            a0 = 0.95 * math.sin(2 * math.pi * (c.ph * cyc + ph))
            beam = np.exp(-((ang - a0) / wdt) ** 2) * np.clip(dist / 80, 0, 1) * np.exp(-dist / 700) * (dy > 0)
            out += beam[..., None] * (GOLD * 0.7 + WHITE * 0.25 + RED * 0.1) * 0.5
        up = cv2.resize(out, (W, H), interpolation=cv2.INTER_CUBIC)
        cv.emit((np.clip(up, 0, None) * k).astype(np.float32))
