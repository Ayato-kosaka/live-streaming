"""段7（10,000円〜・赤）: 黒と赤の王子のあやとが、わたあめの雲の上で杖を振ると、赤いじゅうたんが手前から奥へ
転がり出て、お菓子の世界が順に立ち上がる（#1034）。

流れ（秒は登場の動画の時刻）:
- 前兆 0〜0.9: 赤い夜空が降りてきて、星が瞬く。金の光のリボンが2本、上の角から渦を巻いて流れ込む。花火が上がり始める
- 登場 0.15〜0.9: わたあめの雲に乗ったあやとが、上から箱の真ん中へ大きく（雲の幅が箱の 82%）降りてくる。1.0 で杖の星が光る
- 0.6〜1.3: 砂糖の雪の大地が、手前から地平線まで広がる。奥の真ん中に金の門の光
- 1.42 杖を振り下ろす → 1.5〜2.6 赤いじゅうたんの筒が手前から奥へ転がって、じゅうたんが敷かれていく
- 2.62 杖を振る → キャンディケインの列が手前から奥へ順に立ち上がり、ペロペロキャンディ・マカロン・グミ・いちごが出る
- 3.28 杖を振る → ジンジャーブレッドの兵隊さんが左右に立ち上がって敬礼
- 3.86 杖を振る → 左にケーキのツリー、右にお菓子のお城が立ち上がる（飾りと窓が灯る）
- 4.45〜5.1: あやとの雲が上の帯へ退く（雲の幅が箱の 34%）
- キャラ絵が出たら（5.3）: 金の輪がはじける
- 滞在（3秒の輪）: あやとが雲の上でゆれて、2回杖を振る（光がお菓子へ飛ぶ）。花火が3発、リボンの光が流れ、
  キャンディケインがゆれ、兵隊さんが交代で敬礼し、お城の窓とツリーの飾りがまたたき、じゅうたんの縁を金の光が奥へ走る
- 締め 1.5秒: あやとが上へ飛び去り、景色が溶ける（輪で動くものは滞在の頭の姿で止める）

あやとが決めた中身（#1034）: 1万円〜は、黒と赤の王子のあやと・敷かれる赤いじゅうたん・豪華なお菓子の世界が
魔法で現れる。部品は分けて描いてある（`fx_art/christmas/t7/`）ので、直しは部品の差し替えで済む。
段3〜6 で決めたこと: 登場でいちばん大きく（主役の組が箱の幅の 55% 以上）→ キャラ絵が出る前に上の帯へ退く。
光の筋・粒は録画の 1.0／2.5 秒ではっきり見える明るさと太さ。お城・ツリー・マントは箱の縁で切らない。

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


# ---- あやとと雲の組（1枚の絵に組んで置く）
CLOUD_W = 1.9                           # 雲の幅（あやとの絵の幅に対して）
CLOUD_SY = 0.55                         # 雲を縦につぶす（上の帯に収める）
G_REST, TOP_REST = 210.0, 14.0          # 上の帯での組の高さと上の端。ゆれて 4px 下がっても下の端が 232 より上
Z_BIG, TOP_BIG = 2.4, 44.0             # 登場で真ん中に大きく（雲の幅が箱の 82%・あやとの幅が 43%。下の端 548 でツリーの頭にかからない）
DESCEND = (0.15, 0.85)
RETREAT = (4.45, 5.1)
STAR_UP = (0.19, 0.12)                  # あやとの絵の中の、杖の星（掲げた／振り下ろした）
STAR_SWING = (0.54, 0.79)
FACE = (0.36, 0.70, 0.21, 0.435)        # あやとの絵の中の顔（x0, x1, y0, y1。割合）
# 登場で杖を振る秒と、光が飛ぶ先（そのあとにじゅうたん・ケインの列・兵隊さん・ツリーとお城が出る）
SWINGS = ((1.42, ((360.0, 1120.0),)), (2.62, ((175.0, 1000.0), (545.0, 1000.0))),
          (3.28, ((215.0, 920.0), (505.0, 920.0))), (3.86, ((182.0, 700.0), (543.0, 700.0))))
SWING_LEN = 0.42
STAY_SWINGS = (0.7, 1.95)               # 滞在の輪の中で振る秒（光がはじけ終わるのが輪の終わり 3.0 をまたがないように）
ROLL = (1.5, 2.6)

# ---- お菓子の世界（奥行き d・横 lat・高さ（奥行き 1 での px）・立ち上がる秒）
# ケインと兵隊さんは、じゅうたんの両の縁に1列に並ぶ（兵隊さんはケインの列の2か所に立つ衛兵）
CANE_D = (1.12, 2.05, 3.4, 4.5, 6.0)
CANE_LAT, CANE_H, CANE_T = CW + 46.0, 250.0, 2.70
SOLDIER_D, SOLDIER_H, SOLDIER_T = (1.55, 2.7), 285.0, 3.34
LOLLI = (1.0, 265.0, 130.0, 2.70)
# ツリーとお城は、じゅうたんの奥の両わき（箱の縁 60px のぼかしにかからず、じゅうたんにも乗らない奥行き）
TREE = (3.0, 182.0, 330.0, 3.92)        # (d, 画面の x, 画面の高さ, 秒)
CASTLE = (3.2, 540.0, 310.0, 3.98)
RISE = 0.32

# ---- 金の光のリボン（3次ベジェの4点・太さ・流れ込む秒）
# 上の端の 120px は箱の縁のぼかしなので、リボンはその下から入れる（録画の縮んだ絵で、細い筋は消える。太く明るく）
RIBBONS = (((-60.0, 250.0), (250.0, 120.0), (40.0, 520.0), (300.0, 660.0), 40.0, 0.25),
           ((780.0, 210.0), (470.0, 110.0), (700.0, 470.0), (440.0, 650.0), 38.0, 0.40),
           ((-40.0, 640.0), (200.0, 450.0), (520.0, 560.0), (760.0, 380.0), 24.0, 0.95))
# ---- 花火（1秒ごとに1発。3か所を順に。滞在の輪で3発）
FW_SPOTS = ((140.0, 330.0, GOLD * 1.1 + WHITE * 0.2), (590.0, 290.0, PINK * 0.9 + WHITE * 0.4),
            (380.0, 560.0, WHITE * 0.7 + GOLD * 0.5))
SKY = ((0.0, (0.06, 0.03, 0.12)), (0.45, (0.20, 0.05, 0.16)), (0.54, (0.42, 0.10, 0.15)), (1.0, (0.42, 0.10, 0.15)))


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
    INTRO, STAY, OUTRO, REVEAL = 6.0, 3.0, 1.5, 5.3
    VARIANTS = ("full",)
    FRONT = {"full": True}

    def setup(self):
        a = lambda n: Art.load(os.path.join(ART, n + ".webp"))
        up, sw = a("ayato_up"), a("ayato_swing")
        self.cloud = a("cloud")
        self.g_up, self.g_sw = self.group(up), self.group(sw)
        self.cane, self.lolli = a("cane"), a("lolli")
        self.candy = [a(n) for n in ("mac_pink", "gum_yellow", "berry", "mac_green", "gum_orange")]
        self.sold, self.salute = a("soldier"), a("soldier_salute")
        self.tree, self.castle = a("caketree"), a("castle")
        self.tree_win = fs.gold_mask(self.tree.levels[0])
        self.castle_win = fs.window_mask(self.castle.levels[0])
        self.roll = a("roll")
        self.build_carpet(Art.load(os.path.join(ART, "carpet.webp")).levels[0])
        self.build_world()
        self.build_sky()
        R = np.random.default_rng(7101)
        self.stars = np.stack([R.random(120) * W, R.random(120) ** 1.2 * 660, R.random(120), R.random(120), R.random(120)], -1)
        self.sparkles = np.stack([30 + R.random(20) * 660, 40 + R.random(20) * 600, R.random(20), R.random(20)], -1)
        self.rib = []
        for P0, P1, P2, P3, wd, t0 in RIBBONS:
            n = 640
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
    def group(self, pose):
        """あやとの絵と雲を1枚に組む（雲の上に立つ）。顔と杖の星の位置も、組の絵の割合で持つ"""
        P = pose.levels[0]
        ph_, pw = P.shape[:2]
        cl = self.cloud.levels[0]
        cw = int(CLOUD_W * pw)
        chh = int(cw / cl.shape[1] * cl.shape[0] * CLOUD_SY)
        clr = cv2.resize(cl, (cw, chh), interpolation=cv2.INTER_AREA)
        ctop = int(ph_ - 0.30 * chh)
        gh, gw = ctop + chh, cw
        G = np.zeros((gh, gw, 4), np.float32)
        G[ctop:ctop + chh] = clr
        x0 = (gw - pw) // 2
        sl = G[0:ph_, x0:x0 + pw]
        G[0:ph_, x0:x0 + pw] = P + sl * (1 - P[..., 3:4])
        art = Art(G)
        f = lambda fx, fy: ((x0 + fx * pw) / gw, fy * ph_ / gh)
        art.star_up, art.star_sw = f(*STAR_UP), f(*STAR_SWING)
        art.face = (*f(FACE[0], FACE[2]), *f(FACE[1], FACE[3]))
        return art

    def build_carpet(self, tex):
        """平らな赤いじゅうたんの帯（横長）を2枚つないで、手前 D_NEAR から奥 D_FAR までの台形へ写す"""
        tex = np.concatenate([tex, tex[:, ::-1]], axis=1)
        th, tw = tex.shape[:2]
        src = np.float32([[0, 0], [tw, 0], [tw, th], [0, th]])
        dst = np.float32([[360 - CW / D_NEAR, gy(D_NEAR)], [360 - CW / D_FAR, gy(D_FAR)],
                          [360 + CW / D_FAR, gy(D_FAR)], [360 + CW / D_NEAR, gy(D_NEAR)]])
        self.carpet = warp_into(tex, src, dst)

    def build_world(self):
        """砂糖の雪の大地（動かない1枚）と、地平線の金の門の光"""
        yy = np.arange(H, dtype=np.float32)[:, None]
        xx = np.arange(W, dtype=np.float32)[None, :]
        side = np.abs(xx - 360) / 360
        edge = HZ - 4 - 12 * (0.5 + 0.5 * np.sin(xx / 41 + 1.3)) - 9 * (0.5 + 0.5 * np.sin(xx / 17 + 0.4)) - 46 * side ** 2
        a = np.clip((yy - edge) / 3, 0, 1)
        t = np.clip((yy - HZ) / (H - HZ), 0, 1) ** 0.55
        far, near = np.float32([0.60, 0.36, 0.52]), np.float32([0.97, 0.86, 0.92])
        col = far * (1 - t[..., None]) + near * t[..., None]
        # 雪の吹きだまりのうねり（手前ほど間が広い）
        v = np.clip((yy - HZ) / (Y1 - HZ), 0, 2) ** 0.6
        drift = 0.5 + 0.5 * np.sin(2 * np.pi * v * 6 + 0.9 * np.sin(xx / 70 + v * 3))
        col = col * (0.92 + 0.08 * drift[..., None])
        # 砂糖の粒（ところどころ明るい点）と、門の光が雪に映る暖かさ
        R = np.random.default_rng(7110)
        sp = np.zeros((H, W), np.float32)
        n = 5000
        ys_ = (HZ + R.random(n) ** 0.7 * (H - HZ)).astype(int).clip(0, H - 1)
        xs_ = (R.random(n) * W).astype(int).clip(0, W - 1)
        sp[ys_, xs_] = 0.25 + 0.5 * R.random(n)
        sp = cv2.GaussianBlur(sp, (0, 0), 0.6)
        col = col + sp[..., None] * np.float32([1.0, 0.95, 1.0]) * 0.5
        warm = np.exp(-((xx - 360) / 170) ** 2 - ((yy - HZ - 20) / 70) ** 2)
        col = col + warm[..., None] * (GOLD * 0.22)
        self.ground = (np.clip(col, 0, 1.2) * a[..., None]).astype(np.float32), a.astype(np.float32)
        # お菓子の世界の物（遠いものから描く）
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
        for j in range(34):
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

    def build_sky(self):
        yy = np.arange(H, dtype=np.float32) / H
        col = np.zeros((H, 3), np.float32)
        for (y0, c0), (y1, c1) in zip(SKY[:-1], SKY[1:]):
            m = (yy >= y0) & (yy <= y1)
            k = ((yy[m] - y0) / max(y1 - y0, 1e-6))[:, None]
            col[m] = np.float32(c0) * (1 - k) + np.float32(c1) * k
        self.sky_col = np.broadcast_to(col[:, None, :], (H, W, 3)).astype(np.float32).copy()

    # ---------------- あやと
    def hero(self, c):
        """返す: (組の絵, 真ん中の x, 上の端の y, 組の高さ, 振っている 0/1)"""
        T, u = c.T, c.u
        bob = 4 * math.sin(2 * math.pi * (T - self.INTRO) / self.STAY)
        if c.clip == "intro":
            if T < DESCEND[0]:
                return None
            p = ramp(T, *DESCEND)
            top_big = lerp(-640.0, TOP_BIG, back_out(p, 1.2))
            r = ease(ramp(T, *RETREAT))
            z = lerp(Z_BIG, 1.0, r)
            # 大きいあいだはゆらさない（大きな絵が毎コマ動くと、登場の予算を食う）。上の帯へ退きながら滞在のゆれへ
            top = lerp(top_big, TOP_REST + bob, r)
            swing = any(t0 <= T < t0 + SWING_LEN for t0, _ in SWINGS)
            return (self.g_sw if swing else self.g_up), 360.0, top, G_REST * z, swing
        s = (c.ph * self.STAY) % self.STAY if c.clip == "stay" else 0.0
        swing = c.clip == "stay" and any(t0 <= s < t0 + SWING_LEN for t0 in STAY_SWINGS)
        top = TOP_REST + bob
        if c.clip == "outro":
            top = TOP_REST + bob - 420 * ease_in(ramp(u, 0.05, 0.7))
        return (self.g_sw if swing else self.g_up), 360.0, top, G_REST, swing

    def star_at(self, hp):
        art, x, top, gh, swing = hp
        fx_, fy_ = art.star_sw if swing else art.star_up
        gw = gh * art.w / art.h
        return x + (fx_ - 0.5) * gw, top + fy_ * gh

    def face_box(self, c):
        """顔の箱（画面の px: x0, y0, x1, y1）。manifest の顔の線を引く道具が読む"""
        hp = self.hero(c)
        if hp is None:
            return None
        art, x, top, gh, _ = hp
        gw = gh * art.w / art.h
        fx0, fy0, fx1, fy1 = art.face
        return x + (fx0 - 0.5) * gw, top + fy0 * gh, x + (fx1 - 0.5) * gw, top + fy1 * gh

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

        # ---- 夜空・星
        drop = np.clip((Ti * 2200 - np.arange(H, dtype=np.float32)) / 500, 0, 1)[:, None]
        a_ = (np.full((H, W), 0.94, np.float32) * drop * sky_k).astype(np.float32)
        back.over((self.sky_col * a_[..., None]).astype(np.float32), a_)
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

        # ---- 砂糖の雪の大地（手前から地平線へ広がる）
        wk = out_k
        yg = lerp(H + 40, HZ - 60, ease_out(ramp(Ti, 0.6, 1.3)))
        p, a = self.ground
        rev = np.clip((np.arange(H, dtype=np.float32)[:, None] - yg) / 70, 0, 1)
        back.over((p * (rev * wk)[..., None]).astype(np.float32), (a * rev * wk).astype(np.float32))
        glow(back, 360, HZ + 30, 100, GOLD * 0.8 + WHITE * 0.3, (0.32 + 0.06 * c.osc(2)) * gk)
        # 雪の上の砂糖のきらめき
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

        # ---- あやと（主役だけの層）。杖の星・振ったときの光
        hp = self.hero(c)
        hk = 1.0 if c.clip != "outro" else 1 - ease(ramp(u, 0.3, 0.75))
        if hp is not None:
            art, x, top, gh, swing = hp
            sprite(heroc, art, x, top, gh, anchor=(0.5, 0.0), k=hk, rim=0.45, light_dir=(-0.3, -1.0))
            sx_, sy_ = self.star_at(hp)
            z = gh / G_REST
            self.cloud_fluff(c, back, x, top + gh * 0.9, gh * art.w / art.h, z, hk)
            if intro:
                # 1.0 で杖を掲げて星が光る
                fl = math.exp(-((T - 1.0) / 0.12) ** 2)
                fxv.stamp(back.L, self.kit.flare_s, sx_, sy_, 0.8 * fl)
                burst(back, self.kit, sx_, sy_, (T - 0.95) / 0.6, 7130, n=16, spread=50 * z, cols=("gold", "white", "pink"))
                for j, (t0, tg) in enumerate(SWINGS):
                    self.beam(back, sp_b, hp, t0, tg, T, 7140 + j)
            elif c.clip == "stay":
                s = (c.ph * self.STAY) % self.STAY
                for j, t0 in enumerate(STAY_SWINGS):
                    tg = ((TREE[1], 700.0),) if j == 0 else ((CASTLE[1], 700.0),)
                    self.beam(back, sp_b, hp, t0, tg, s, 7150 + j)
            # 星は いつも かすかに光る
            glow(back, sx_, sy_, 16 * z, GOLD * 0.8 + WHITE * 0.4, 0.35 * hk)
            if intro and T < DESCEND[1] + 0.2:
                # 降りてくる雲のうしろの、ピンクと金のきらきらの尾
                tau = np.linspace(0, 0.45, 200)
                ty = np.array([lerp(-640.0, TOP_BIG, back_out(ramp(T - tt, *DESCEND), 1.2)) for tt in tau]) + gh * 0.9
                fade = (1 - tau / 0.45) ** 1.3 * (T - tau > DESCEND[0])
                for side in (-1, 1):
                    trail(self.kit, back, sp_b, x + side * gh * 0.35 + 0 * ty, ty, fade, 0.8 * (1 - ramp(T, 0.8, 1.05)),
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
        rv = (T - self.REVEAL) / 0.7 if intro else 9
        if 0 <= rv < 1:
            yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
            rr_ = 110 + 300 * ease_out(rv)
            d = np.hypot(xx - 360, (yy - 760) * 1.12) - rr_
            band = np.exp(-(d / (8 + 26 * rv)) ** 2) * (1 - rv) ** 1.4
            back.emit(band[..., None] * (GOLD * 1.1 + WHITE * 0.5 + RED * 0.3) * 1.2)
            glow(back, 360, 760, 220, GOLD * 0.7 + WHITE * 0.2, 0.6 * (1 - rv) ** 2)
        out_b = back.finish(bloom=0.8, edge=self.edge)
        out_b = over_rgba(self.finish_hero(heroc, bloom=0.4), out_b)

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
            if 0 <= rv < 0.9:
                R = np.random.default_rng(79)
                for k in range(26):
                    ang_ = R.random() * 6.283
                    dist = 170 + 220 * ease_out(rv / 0.9) * (0.6 + 0.4 * R.random())
                    fxv.stamp(front.L, self.kit.star["gold" if k % 3 else "white"], 360 + math.cos(ang_) * dist * 0.9,
                              760 + math.sin(ang_) * dist * 1.05, 0.85 * (1 - rv / 0.9) ** 1.5 * (0.5 + 0.5 * R.random()))
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

    def beam(self, cv, sp, hp, t0, targets, t, seed):
        """杖を振ると、星から光が弧を描いて飛び、着いた所ではじける"""
        age = t - t0 - 0.08
        if not (0 <= age < 0.95):
            return
        sx_, sy_ = self.star_at((self.g_sw, hp[1], hp[2], hp[3], True))
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
        if not (0 <= age < 1.1) or k <= 0.003:
            return
        R = np.random.default_rng(seed)
        n = 56
        ang = 2 * np.pi * (np.arange(n) + R.random(n) * 0.5) / n
        spd = 140 + 80 * R.random(n)
        for lag in (0.0, 0.035, 0.07, 0.105, 0.14):
            ag = max(age - lag, 0.0)
            e = 1 - (1 - min(ag / 0.9, 1.0)) ** 3
            xs_ = x + np.cos(ang) * spd * e
            ys_ = y + np.sin(ang) * spd * e * 0.9 + 70 * ag * ag
            b = (1 - age / 1.1) ** 1.5 * (1 - lag / 0.18) * k
            sp.add_screen(xs_, ys_, col[None] * np.full((n, 1), 2.2 * b, np.float32), coc=np.full(n, 1.0))
            if lag == 0.0:
                sp.add_screen(xs_, ys_, col[None] * np.full((n, 1), 5.0 * b, np.float32), coc=np.full(n, 3.0))
        if age < 0.25:
            glow(cv, x, y, 46, col * 0.8 + WHITE * 0.3, 0.9 * (1 - age / 0.25) ** 2 * k)

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
