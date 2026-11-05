"""段2（200〜499円・水色）: 兄たち（ジモモとオレオ）が、焼き栗を転がしてくる（画面の下の帯。暗くしない）。

叩き台ペラ一の流れ（秒は登場の動画の時刻）:
- 前兆 0〜0.3: 火の粉がひとつ、ぱちっと跳ねる
- 登場 0.3〜1.0: ジモモが左の端から焼き栗をころころ押してくる。オレオは右の端から宙返りで跳び込んでくる
- 山場 1.0〜1.8: 栗がぱかっと割れて、湯気と金の火の粉。ジモモはびっくりして後ろへ跳び、ふたりでばんざい（1.0 で投げた人のキャラ絵）
- 滞在（4秒の輪）: ふたりが代わりばんこに栗に跳び乗る。乗ると栗が転がって、足をばたばた → 後ろへ宙返りして転ぶ →
  目を回す。そのあいだ、もうひとりは跳ねて大笑い。転んだほうは元の場所へ戻る
- 締め 1.0秒: ジモモが栗を押して、ふたりで右の端へ駆けて行く

あやと 2026-11-05「200,500は動きがもうちょいほしい」（#1095）で、跳ねて・転がって・転ぶ形に作り直した。
前は 2秒の輪で、ふたりが 10px ずつ交互に跳ねるだけだった。輪を 4秒にして、ひとりずつの見せ場を入れた
（アラートの長さは再生の側が決めるので、輪を長くしても演出の秒は変わらない）。

ふたりと栗は、下の 28% の帯（キャラ絵の箱の下の端 0.72 より下。CONTRACT.md の追記 2026-11-04）の中。
跳ねる・回る・伸びると絵の上の端が動くので、1コマずつ `sprite_top` で測って、帯（`ceiling`）からはみ出す分だけ下げる。
帯に収めるため、ふたりは前の 178px から 140px に、栗は 106px から 92px にした（跳ねる高さを取るため）。
湯気と火の粉は帯の上に出てよい。
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from fx_stage import *  # noqa: E402,F401,F403

ART = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "fx_art", "t2")

CAT_H = 140.0
NUT_H = 92.0
NUT_R = NUT_H * 0.5          # 転がるときの半径（転がった道のり ÷ 半径 = 回った角度）
ON_NUT = NUT_H * 0.74        # 栗の上に乗ったときの足もとの高さ（栗の丸い頂に足が少し沈む）
JX, OX, NX = 150.0, 570.0, 360.0   # ふたりと栗の、滞在の頭（輪の継ぎ目）の位置


def P(art, x, lift=0.0, **kw):
    """ふたりは同じ高さ（CAT_H）で描く"""
    return Pose(art, CAT_H, x, lift, **kw)


class Scene(Stage):
    TIER = 2
    INTRO, STAY, OUTRO, REVEAL = 1.8, 4.0, 1.0, 1.0
    VARIANTS = ("full",)
    # 〜999円の段は帯の中の小さな絵なので、予算は小さく（画質の段が QBEST に当たって、たいていこれより小さく焼ける）
    BUDGET_KB = {"full": 1500}
    FRONT = {"full": False}
    CHAR_BOTTOM = 0.72

    BOTTOM = SAFE_BOTTOM

    def setup(self):
        a = lambda n: Art.load(os.path.join(ART, n + ".webp"))
        self.jp, self.op, self.jb, self.ob = a("jimomo_push"), a("oreo_push"), a("jimomo_banzai"), a("oreo_banzai")
        self.nut, self.nut_open = a("chestnut"), a("chestnut_open")
        self.mist = Mist(202)
        self.sparks = Loop(40, 203, cycles=(1, 2))
        R = np.random.default_rng(204)
        n = 60
        ang = -math.pi / 2 + (R.random(n) - 0.5) * 2.2
        sp = 180 + R.random(n) * 280
        self.burst = dict(vx=np.cos(ang) * sp, vy=np.sin(ang) * sp, life=0.5 + R.random(n) * 0.5, col=np.where(R.random(n)[:, None] < 0.7, GOLD, WHITE))

    # ---------------- 帯の天井（猫の絵の上の端をここより下に）
    def ceiling(self, c):
        """キャラ絵の箱の下の端は 0.72（922px）。出る瞬間は 1.05 倍にふくらむ（938px）ので、出てから 0.9 秒は少し低く。
        出る前は、帯の上（箱の下 1/3 = 853px。fx_check の〜999円の場所）までは跳んでよい"""
        if c.clip == "intro" and c.T < self.REVEAL:
            return 872.0
        if c.clip == "intro" and c.T < self.REVEAL + 0.9:
            return 942.0
        return 926.0

    # ---------------- 栗（x・回転・割れたか）
    def nut_at(self, c):
        Ti, u = c.Ti, c.u
        if c.clip == "intro":
            x = lerp(-70, NX, ease_out(ramp(Ti, 0.25, 0.95)))
            opened = Ti >= 1.0
        else:
            s = c.ph * self.STAY
            # 乗られると転がり、降りると揺れ戻る（ジモモは右へ、オレオは左へ）
            x = NX + 40 * (ease(ramp(s, 0.65, 1.0)) - ease(ramp(s, 1.05, 1.65))) \
                - 40 * (ease(ramp(s, 2.65, 3.0)) - ease(ramp(s, 3.05, 3.65)))
            opened = True
            if c.clip == "outro":
                x = x + ease_in(ramp(u, 0.12, 1.0)) * 800
        rot = math.degrees((x - NX) / NUT_R)
        return x, rot, opened

    # ---------------- ジモモ（左）。滞在の見せ場は 0.3〜1.95 秒
    def jimomo(self, c, nx):
        Ti, u = c.Ti, c.u
        behind = NUT_R + 54  # 栗を押すときの、栗の真ん中からの間
        if c.clip == "intro":
            if Ti < 0.95:
                # 栗のうしろから押してくる（小走りに弾む）
                x = lerp(-70, NX, ease_out(ramp(Ti, 0.25, 0.95))) - behind
                return P(self.jp, x, 6 * abs(math.sin(Ti * 19)), rot=-4 * math.sin(Ti * 19), sy=1 + 0.04 * math.sin(Ti * 38))
            if Ti < 1.0:
                return P(self.jp, NX - behind, 0.0)
            # 1.0: 栗が割れて、びっくりして後ろへ跳ぶ → ばんざいで2回跳ねる
            if Ti < 1.38:
                p = (Ti - 1.0) / 0.38
                k = math.sin(math.pi * p)
                return P(self.jb, lerp(NX - behind, JX, ease_out(p)), arc(p, 34), rot=-10 * k, sx=1 - 0.06 * k, sy=1 + 0.08 * k)
            lift, land = hops(Ti, 1.42, 1.8, 2, 22)
            return P(self.jb, JX, lift, sx=1 + 0.1 * land, sy=1 - 0.12 * land)
        if c.clip == "outro":
            # 締めの頭は滞在の頭と同じ（ばんざいのひと跳ね）から。そこから栗を押して右へ駆けて行く
            if u < 0.15:
                return self.gag(c.ph * self.STAY, self.jp, self.jb, JX, +1, nx)
            x = lerp(JX, nx - behind, ease(ramp(u, 0.15, 0.45))) if u < 0.45 else nx - behind
            return P(self.jp, x, 6 * abs(math.sin(u * 30)) * ease(ramp(u, 0.15, 0.3)), rot=-6)
        return self.gag(c.ph * self.STAY, self.jp, self.jb, JX, +1, nx)

    # ---------------- オレオ（右）。見せ場はジモモの 2 秒あと（左右を返す）
    def oreo(self, c, nx):
        Ti, u = c.Ti, c.u
        if c.clip == "intro":
            if Ti < 0.3:
                return None
            if Ti < 0.82:
                # 右の端から宙返りで跳び込む（キャラ絵が出る前なので、帯の上まで跳んでよい）
                p = (Ti - 0.3) / 0.52
                curl = 0.9 + 0.1 * abs(math.cos(math.pi * p))
                return P(self.op, lerp(830, OX, ease_out(p)), arc(p, 120), rot=-360 * ease(ramp(p, 0.15, 0.85)), spin=True, sx=curl, sy=curl)
            if Ti < 1.0:
                land = math.exp(-((Ti - 0.82) / 0.07) ** 2)
                return P(self.op, OX, 0.0, sx=1 + 0.16 * land, sy=1 - 0.2 * land)
            if Ti < 1.3:
                p = (Ti - 1.0) / 0.3
                return P(self.ob, OX, arc(p, 30), sy=1 + 0.06 * math.sin(math.pi * p))
            lift, land = hops(Ti, 1.4, 1.8, 2, 20)
            return P(self.ob, OX, lift, sx=1 + 0.1 * land, sy=1 - 0.12 * land)
        s = (c.ph * self.STAY - 2.0) % self.STAY
        if c.clip == "outro" and u >= 0.12:
            # 締め: 滞在の頭と同じ姿から、跳ねながら右へ
            p = ease_in(ramp(u, 0.12, 1.0))
            return P(self.op, lerp(OX, 1020, p), arc((u * 3) % 1.0, 26), flip=True)
        return self.gag(s, self.op, self.ob, OX, -1, nx)

    def gag(self, s, push, banzai, home, side, nx):
        """見せ場の1周（s は 0〜4秒）。side は +1（左から右へ跳び乗る＝ジモモ）か -1（右から＝オレオ）。
        0〜0.3 ひと跳ね → 0.3〜0.4 かがむ → 0.4〜0.65 栗へ跳び乗る → 0.65〜1.0 栗が転がって足をばたばた →
        1.0〜1.42 後ろへ宙返りして転ぶ → 1.42〜1.7 目を回す → 1.7〜1.95 元の場所へ駆け戻る → 1.95〜4.0 相手の見せ場で大笑い。
        相手は 2 秒ずらして同じことをするので、出かけているのは 2 秒より短くする（輪の頭で、ふたりとも元の場所にいる）"""
        top_x = NX - side * 14           # 栗の頂（乗ったときの足もと）
        fall_x = home + side * 80        # 転んで落ちる所
        if s < 0.3:
            lift, land = hops(s, 0.0, 0.3, 1, 18)
            return P(banzai, home, lift, sx=1 + 0.1 * land, sy=1 - 0.12 * land)
        if s < 0.4:
            k = math.sin(math.pi * (s - 0.3) / 0.1)
            return P(push, home, 0.0, sx=1 + 0.1 * k, sy=1 - 0.16 * k, rot=side * 6 * k)
        if s < 0.65:
            p = (s - 0.4) / 0.25
            k = math.sin(math.pi * p)
            return P(push, lerp(home, top_x, ease(p)), lerp(0, ON_NUT, ease_out(p)) + arc(p, 14),
                        rot=side * lerp(-14, 0, p), sx=1 - 0.06 * k, sy=1 + 0.1 * k)
        if s < 1.0:
            # 栗の頂で、転がる栗の上を足ぶみ（ぐらぐら揺れが大きくなる）
            q = (s - 0.65) / 0.35
            land = math.exp(-(q / 0.15) ** 2)
            wob = side * 17 * math.sin(2 * math.pi * 5 * (s - 0.65)) * ease(ramp(q, 0.05, 0.9))
            step = 5 * abs(math.sin(2 * math.pi * 6 * (s - 0.65)))
            return P(push, nx - side * 14, ON_NUT + step, rot=wob, sx=1 + 0.14 * land, sy=1 - 0.18 * land)
        if s < 1.42:
            # 後ろへ宙返りして転ぶ（体を丸めて回る）
            p = (s - 1.0) / 0.42
            curl = 1 - 0.14 * math.sin(math.pi * p)
            return P(banzai, lerp(nx - side * 14, fall_x, ease_out(p)), lerp(ON_NUT, 0, ease_in(p)) + arc(p, 26),
                        rot=-side * 360 * ease(p), spin=True, sx=curl, sy=curl)
        if s < 1.7:
            # 尻もちをついて、目を回す（ゆらゆら）
            q = (s - 1.42) / 0.28
            land = math.exp(-(q / 0.22) ** 2)
            sway = 8 * math.sin(2 * math.pi * 3 * (s - 1.42)) * (1 - q)
            return P(banzai, fall_x, 0.0, rot=sway, sx=1 + 0.2 * land, sy=1 - 0.24 * land)
        if s < 1.95:
            # 元の場所へ駆け戻る（押す絵を返して、戻る向きに）
            p = (s - 1.7) / 0.25
            w = math.sin(2 * math.pi * 2 * p)
            return P(push, lerp(fall_x, home, ease(p)), 6 * abs(w), flip=True, rot=side * 5 * w)
        # 相手が跳び乗って転ぶのを見て、跳ねて大笑い（のけぞる）
        if s < 2.3 or s >= 3.95:
            return P(banzai, home, 0.0)
        lift, land = hops(s, 2.3, 3.95, 4, 20)
        lean = -side * 8 * math.sin(math.pi * clamp01((s - 2.3) / 1.65))
        return P(banzai, home, lift, rot=lean, sx=1 + 0.1 * land, sy=1 - 0.12 * land)

    def put(self, c, tgts, pose, k):
        """帯の天井からはみ出さないよう下げて、両方の面（back と主役だけの層）に描く。返す: 絵の上の端の y"""
        return put_pose(tgts, pose, self.BOTTOM - 2, self.ceiling(c), k=k)

    def draw(self, c):
        Ti, T, u = c.Ti, c.T, c.u
        cv = Canvas()
        hero = Canvas()  # ふたりと栗だけ（fx_hero.py が、キャラ絵に隠れていないかを数える。重ねはしない）
        out_k = 1 - ease(ramp(u, 0.6, 1.0))
        nx, nrot, opened = self.nut_at(c)
        pop = math.exp(-((Ti - 1.02) / 0.08) ** 2) * (c.clip == "intro")
        nut = self.nut_open if opened else self.nut
        nh = NUT_H * (1 + 0.12 * pop)
        sq = 1 + 0.18 * pop
        # 滞在: 栗の上の湯気（ゆらゆら昇る）
        steam_k = ease(ramp(Ti, 1.05, 1.5)) * out_k
        if steam_k > 0.003:
            for j in range(3):
                m = self.mist.layer(c, self.BOTTOM - 270, self.BOTTOM - 85, 0.55 * steam_k, (0.98, 0.96, 0.94), laps=0, scale=0.25,
                                    soft_top=120, soft_bot=60, drift_y=c.ph * 2 + j / 3)
                if m:
                    p, a = m
                    xx = np.arange(W, dtype=np.float32)[None, :]
                    col = np.exp(-((xx - (nx + (j - 1) * 28 + 10 * c.osc(2, j / 3))) / 28) ** 2)
                    cv.over(p * col[..., None] * 0.85, a * col * 0.85)
        contact_shadow(cv, nx, self.BOTTOM - 4, 62, 0.3 * ease(ramp(Ti, 0.3, 0.5)) * out_k)
        nk = ease(ramp(Ti, 0.25, 0.37)) * out_k
        tg = (cv, hero)
        # 転がる栗は真ん中のまわりに回す。割れた瞬間だけ、足もとでつぶれて弾む
        for tgt in tg:
            if pop > 0.01:
                sprite(tgt, nut, nx, self.BOTTOM - 2, nh, anchor=(0.5, 1.0), sx=sq, sy=2 - sq, k=nk, rim=0.3)
            else:
                sprite(tgt, nut, nx, self.BOTTOM - 2 - nh / 2, nh, anchor=(0.5, 0.5), rot=nrot, k=nk, rim=0.3)
        glow(cv, nx, self.BOTTOM - 55, 64, GOLD * 0.6 + AMBER * 0.3, (0.6 * pop + 0.25 * steam_k))
        # ふたり
        kj = ease(ramp(Ti, 0.25, 0.4)) * out_k
        ko = ease(ramp(Ti, 0.3, 0.4)) * out_k
        tops = {}
        for name, pose, k in (("j", self.jimomo(c, nx), kj), ("o", self.oreo(c, nx), ko)):
            if pose is None:
                continue
            contact_shadow(cv, pose.x, self.BOTTOM - 2, 76 * (1 - min(0.6, pose.lift / 120)), 0.28 * k * (1 if pose.lift < 1 else 0.6))
            tops[name] = (pose, self.put(c, tg, pose, k))
        if c.clip != "intro":
            s = c.ph * self.STAY
            # 着地の金の粒（跳び乗った所・転んだ所で、地面に沿ってぱっと散る）
            for t0, x0, yy in ((0.65, NX - 14, self.BOTTOM - ON_NUT), (1.42, JX + 80, self.BOTTOM - 4),
                               (2.65, NX + 14, self.BOTTOM - ON_NUT), (3.42, OX - 80, self.BOTTOM - 4)):
                age = (s - t0) % self.STAY
                if age < 0.45:
                    R = np.random.default_rng(int(t0 * 100))
                    for j in range(9):
                        ang = math.pi * (0.05 + 0.9 * R.random())
                        d = (24 + 60 * R.random()) * ease_out(age / 0.45)
                        fxv.stamp(cv.L, self.kit.star["gold" if j % 3 else "white"], x0 + math.cos(ang) * d * (1 if j % 2 else -1),
                                  yy - math.sin(ang) * d * 0.45, 0.8 * (1 - age / 0.45) ** 1.4 * out_k)
            # 目を回す星（転んだほうの頭の上をくるくる）
            for name, t0 in (("j", 1.42), ("o", 3.42)):
                age = (s - t0) % self.STAY
                if age < 0.6 and tops.get(name, (None, None))[1] is not None:
                    pose, top = tops[name]
                    for j in range(3):
                        a_ = 2 * math.pi * (age * 2.2 + j / 3)
                        fxv.stamp(cv.L, self.kit.star["gold"], pose.x + 30 * math.cos(a_), top + 6 + 9 * math.sin(a_),
                                  0.75 * math.sin(math.pi * age / 0.6) * out_k)
        # 火の粉: 前兆の1つ・割れた瞬間のはじけ・滞在で昇る
        if c.clip == "intro" and 0.05 < Ti < 0.45:
            a = (Ti - 0.05) / 0.4
            fxv.stamp(cv.L, self.kit.star["gold"], 360 + 30 * a, self.BOTTOM - 40 - 120 * math.sin(math.pi * a), 0.9 * math.sin(math.pi * a))
        tau = T - 1.0
        if c.clip == "intro" and 0 < tau < 1.0:
            b = self.burst
            sp = Splat()
            live = tau < b["life"]
            for s in range(3):
                ts = max(0.0, tau - s * 0.02)
                x = nx + b["vx"][live] * ts
                y = self.BOTTOM - 80 + b["vy"][live] * ts + 380 * ts * ts
                y = np.maximum(y, H * 2 / 3 + 10)
                fade = (1 - tau / b["life"][live]) ** 1.2
                sp.add_screen(x, y, b["col"][live] * (fade * 5.5)[:, None])
            sp.into(cv)
            # 割れた瞬間の星（大きめ）と、あたたかい閃き
            R = np.random.default_rng(205)
            for j in range(12):
                ang = -math.pi / 2 + (R.random() - 0.5) * 2.6
                d = (60 + 120 * R.random()) * ease_out(min(1.0, tau / 0.5))
                x = nx + math.cos(ang) * d
                y = max(self.BOTTOM - 70 + math.sin(ang) * d * 0.8, H * 2 / 3 + 16)
                fxv.stamp(cv.L, self.kit.star["gold" if j % 3 else "white"], x, y, 0.9 * (1 - min(1.0, tau / 0.7)) ** 1.3)
            glow(cv, nx, self.BOTTOM - 60, 110, GOLD * 0.9 + WHITE * 0.3, 0.8 * math.exp(-tau / 0.15))
        g = self.sparks
        a_ = g.age(c)
        amb = ease(ramp(Ti, 1.1, 1.6)) * out_k
        if amb > 0.003:
            sp = Splat()
            x = nx + (g.r[:, 0] - 0.5) * 140 + 18 * np.sin(6.283 * (a_ + g.r[:, 1]))
            y = self.BOTTOM - 70 - a_ * 300
            ok = y > H * 2 / 3 + 10
            kd = np.sin(np.pi * a_) ** 2 * (0.6 + 1.6 * g.r[:, 2]) * amb
            sp.add_screen(x[ok], y[ok], (np.where(g.r[:, 3:4] < 0.7, GOLD, AMBER) * kd[:, None] * 3.6)[ok])
            sp.into(cv)
        self.finish_hero(hero, bloom=0.0)
        return cv.finish(bloom=0.55, edge=self.edge), None
