"""段4（1,000〜1,999円・黄）: 雪の屋根の煙突から、サンタのあやとがすぽんと飛び出して手を振る（#1034）。

流れ（秒は登場の動画の時刻）:
- 前兆 0〜0.8: 夜空が降りてきて星が瞬き、満月が金の光の筋を落とす。箱ぜんぶに雪が降り始める（奥・中・手前の3段）
- 登場 0.3〜1.3: 箱の真ん中に、雪の屋根と煙突を大きく（煙突とあやとの組が箱の幅の 55〜60%）。月から金の光の筋が2本、
  渦を巻いて降りてきて煙突の口へ吸い込まれる。煙突がかたかた揺れて雪をふく（0.85・1.1）
- 山場 1.3〜2.95: すぽん！と口から雪と金の粉が噴き出し、あやとが体ごと宙へ飛び出して（ばんざい）、口に落ちて2回弾む。
  金の光の筋が3本、口から渦を巻いて夜空いっぱいに走り、夜空の星が順にきらめく。あやとは大きく手を振る。
  2.55〜2.95 にカメラが引いて、屋根と煙突とあやとが上の帯へ縮んで退き、下に町が見えてくる
- キャラ絵が出たら（3.0〜3.38）: 金の輪がはじけ、景色がすっと引いて、縁（上の帯の煙突と満月・下の隅の町）だけが残る
- 滞在（3秒の輪）: あやとは手を振り続け、金の光の筋があやとのまわりに2本・月のまわりに細く1本回る。煙突の煙が
  ゆっくり昇り、上の帯の星が瞬き、雪が箱ぜんぶに降り続ける
- 締め 1.0秒: あやとが煙突にすぽっと戻り、雪がふいて、景色が消える

2026-11-23 の見直し: 1回目は動きの量が城の段4 の約0.3倍で、景色が平たかった。2回目は、登場の 1.0・2.5 秒で屋根と煙突と
あやとが箱の真ん中に小さく貼ってあるだけに見え（あやとは箱の幅の 1/8）、光の筋も目に入らなかった。登場は口を箱の真ん中へ
2.3 倍に寄せ（「主役は登場で箱の中央を使い」）、光の筋は芯とにじみの太い線にした。大きく見せる時間を取るため、キャラ絵が出る
秒（revealAt）を 11月の 2.6 から 3.0 にし、景色が引くのも 3.02〜3.38 にずらした（登場の長さ 3.4 は同じ）。

あやとが決めた中身（#1034）: サンタあやとが煙突からすぽんと飛び出して手を振る。雪の屋根、満月と金の光の筋。
1,000円の段は「全面で出て、revealAt で景色が引いて縁だけ残る」（11月の段4 と同じ。`fx_check.py` の THIN が数える）。
あやとは、キャラ絵が出る前に上の帯（headroom 0.2 = 256px より上）へ。煙突の口を y 212 に置き、あやとは口から上だけを
描く（腰から下は煙突の中。口の手前の雪を、あやとの上に重ねる）。`fx_hero.py` はあやとだけの層で、キャラ絵に隠れないかを数える。

3回目（同じ日。あやと「1,000以上の演出も11月に比べてショボくない？」）: 11月の段4 は、登場は湖と崖の描いた全面の景色で、
キャラ絵が出たあとも左右の崖・上の舟のまわり・下の水が厚く残って動く。12月は登場が夜空の色の板に屋根と煙突を貼っただけで、
滞在は月と煙突と下の隅の家だけが薄く残っていた（縁の透明の平均 0.19。11月は 0.22）。
- 背景を ChatGPT で描いた1枚の板（`plate.webp`: 星空・満月・左右の電飾のもみの木・雪の町の屋根。人も屋根の手前も煙突も無し。
  一次確認の絵の構図）にする。登場は板が全面（屋根と煙突とあやとは手前に別の絵で、寄って写す）
- 景色が引いたあとは、真ん中（キャラ絵と字の所）だけを抜いた額のように、上の星空と満月・左右のもみの木・下の町を厚く残す
  （fx_check の THIN: 全体の透明の平均 0.2 以下・真ん中 0.03 以下は守る）。縁では、星が瞬き、流れ星が走り、窓と電飾が瞬き、
  雪が降り、煙突の煙が昇る
- 滞在のあやとを 11月の段4 の主役より小さくしない（煙突の口を 10px 下げ、あやとを 1.04 倍に）

絵は一次確認を描いた会話の続きで描いた（`fx_art/christmas/t4/`）。あやとのポーズ絵3枚（ばんざい・手を振る2枚）は、
同じ大きさの透明の地に、顔の位置をそろえて置いてある（切り替えても顔が跳ねない）。手を振る2枚は手のひらの傾きだけが違う。
カメラは 2D の視差（近い屋根ほど大きく動く）で、景色の板を拡げて・ずらして写す。
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
ME = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ME)
from fx_stage import *  # noqa: E402,F401,F403
import fx_stage as fs  # noqa: E402
from xmas_t345 import StarSky, plate_emit, plate_layer, shooting_stars  # noqa: E402

ART = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "fx_art", "christmas", "t4")

CX, MOUTH = 232.0, 222.0          # 煙突の口（手前の縁）の、落ち着いたあとの画面の位置
H_AYATO = 312.0                   # あやとのポーズ絵（透明の地ごと）の高さ。顔の幅が 89px 前後（11月の段4 の主役より小さくしない）
A_CUT = 430 / 665                 # ポーズ絵の中で、煙突の口に来る高さ（ベルトのすぐ下）
H_CHIM = 188.0                    # 煙突。口の幅が、あやとの腰より広くなる大きさ
CHIM_MOUTH = 108 / 418            # 煙突の絵の中で、口の手前の縁の高さ
RX, R_TOP, W_ROOF = 326.0, 282.0, 470.0    # 屋根（真ん中の x・絵の上の端の y・幅）。雪の上の面が煙突の下の 1/4 を隠す
# 背景の板（ChatGPT で描いた 1024×1536）を落ち着いたあとの画面へ写す倍率と、絵の (0,0) の居場所。
# 板は箱より少し大きく（上 40px・左右 85px はみ出す）: 登場で板も少し寄る（視差 PLATE_P）ので、上の端が箱の中へ入らない
PLATE_S, PLATE_X0, PLATE_Y0, PLATE_P = 0.87, -85.5, -40.0, 0.12
PLATE_MOON = (0.73, 0.13, 0.20)   # 板の中の満月（中心の x・y の割合、直径の幅に対する割合）。描いた絵を測って入れる
PW, PH = 1024, 1536               # 板の絵の寸法
# キャラ絵が出たあとに残す額の、抜く四角（x0, x1, y0, y1, 角の半径, 溶かしの幅, 上・左右・下の濃さ）。thin_keep
FRAME = (80.0, 640.0, 200.0, 1150.0, 90.0, 45.0, 0.95, 0.5, 0.95)
# 流れ星（起きる秒・頭の始まり x, y・向き（度）・長さ・長さの秒）。上の帯（キャラ絵の箱より上）を走り、滞在の 3秒ごとにくり返す
SHOOT = ((3.7, 700.0, 50.0, 168.0, 320.0, 0.6), (5.2, 380.0, 30.0, 160.0, 260.0, 0.55))
MOON = (PLATE_X0 + PLATE_MOON[0] * PW * PLATE_S, PLATE_Y0 + PLATE_MOON[1] * PH * PLATE_S, PLATE_MOON[2] * PW * PLATE_S)
POP = 1.3                         # すぽん！
POP_TOP, POP_LAND = 1.47, 1.66    # 宙の頂と、口に戻って着地する秒
SETTLE = (2.55, 2.95)             # カメラが引いて、屋根と煙突とあやとが上の帯へ縮む（キャラ絵が出る 3.0 の前に終える）
# 登場のあいだのカメラ: 煙突の口を箱の真ん中（360, 780）に、2.3 倍に寄せる。煙突とあやとの組が箱の幅の 55〜60%
START_ZOOM, START_X, START_Y = 2.3, 360.0, 780.0
WAVE = 0.1875                     # 手を振る絵を切り替える間（滞在 3秒で 16回＝偶数回なので、継ぎ目でつながる）


class Scene(Stage):
    TIER = 4
    INTRO, STAY, OUTRO, REVEAL = 3.4, 3.0, 1.0, 3.0
    VARIANTS = ("full",)
    FRONT = {"full": True}
    # キャラ絵が出たら、景色が薄く引く秒（一度きりの動きなので、登場の終わり 3.4 までに引ききる）
    THIN = (3.02, 3.38)

    def setup(self):
        a = lambda n: Art.load(os.path.join(ART, n + ".webp"))
        self.pop = a("ayato_pop")
        self.wave = [a("ayato_wave0"), a("ayato_wave1")]
        self.chim, self.roof = a("chimney"), a("roof")
        # 背景の板（前掛けの RGBA）と、描かれた灯り（窓・電飾・街灯）
        self.plate = load_rgba(os.path.join(ART, "plate.webp"))
        assert self.plate.shape[:2] == (PH, PW), self.plate.shape
        self.plate_win = fs.window_mask(self.plate)
        # 煙突の口の手前の雪だけ（あやとの腰の上に重ねる）。口は楕円なので、楕円の下の縁より下、雪のかさの下の端
        # （絵の 0.51）より上を残す。れんがまで含めると、屋根が隠しているはずの煙突の根もとが屋根の上に出た
        ch = self.chim.levels[0].copy()
        hh, ww = ch.shape[:2]
        xs = np.arange(ww, dtype=np.float32)
        cx_, rx_, cy_, ry_ = 0.457 * ww, 0.268 * ww, 0.225 * hh, 0.043 * hh
        edge = cy_ + ry_ * np.sqrt(np.clip(1 - ((xs - cx_) / rx_) ** 2, 0, 1))
        ys = np.arange(hh, dtype=np.float32)[:, None]
        keep = np.clip((ys - edge[None, :]) / 2.0, 0, 1) * np.clip((0.52 * hh - ys) / (0.03 * hh), 0, 1)
        self.lip = Art(np.ascontiguousarray(ch * keep[..., None]))
        self.roof_win = fs.window_mask(self.roof.levels[0])
        # 夜空（上は深い紺、下ほど町の灯りで少し明るい）
        yy = np.arange(H, dtype=np.float32)[:, None] / H
        top, bot = np.float32([0.035, 0.05, 0.16]), np.float32([0.10, 0.13, 0.30])
        self.sky_col = np.broadcast_to(((1 - yy) * top + yy * bot)[:, None, :], (H, W, 3)).astype(np.float32).copy()
        self.sky_a = np.full((H, W), 0.93, np.float32)
        R = np.random.default_rng(4101)
        n = 150
        self.stars = np.stack([R.random(n) * W, R.random(n) ** 1.3 * 1000, R.random(n), R.random(n), R.random(n)], -1)
        self.keep = self.thin_keep()
        # 雪は奥・中・手前の3段（大きさと速さを変える。手前は front。滞在 3秒で 1・2・3 回めぐる）
        self.snow_far = Loop(140, 4102, cycles=(1, 1))
        self.snow_mid = Loop(150, 4108, cycles=(2, 2))
        self.near = Loop(84, 4103, cycles=(3, 3))
        self.flake = {r: self.soft_dot(r) for r in (1.6, 2.7, 3.0, 6.5)}
        # 手前をゆっくり昇る金と白のぼけ玉（front。滞在の輪で1めぐり）
        self.bok = Loop(12, 4111, cycles=(1, 1))
        self.dust = Loop(60, 4104, cycles=(1, 2))
        # 縁の夜空の星（上の帯と左右。キャラ絵が出たあとも瞬き続ける）
        self.edge_sky = StarSky(4112, n=90, n_big=12, y0=20, y1=300)
        # 夜空のきらめく星（大きな十字の星。夜空の上の 2/3 に）
        R = np.random.default_rng(4109)
        self.sparkles = np.stack([40 + R.random(26) * 640, 30 + R.random(26) ** 1.2 * 820, R.random(26), R.random(26)], -1)
        # 煙突の煙（滞在の輪で、口の右からゆっくり昇る）
        self.smoke = Loop(7, 4110, cycles=(1, 1))
        R = np.random.default_rng(4105)
        m = 90
        self.burst_v = np.stack([(R.random(m) - 0.5) * 520, -(180 + R.random(m) * 420), R.random(m)], -1)
        # すぽん！の金の粉（口から噴水のように）
        m = 110
        self.gold_v = np.stack([(R.random(m) - 0.5) * 380, -(260 + R.random(m) * 520), R.random(m), R.random(m)], -1)
        R = np.random.default_rng(4106)
        self.edge_pts = []
        while len(self.edge_pts) < 18:
            x, y = R.random() * W, 40 + R.random() * 1220
            if self.keep[int(y), int(x)] > 0.25:
                self.edge_pts.append((x, y, R.random(), R.random()))

    # ---------------- カメラ（2D の視差）。屋根・煙突・あやとは p=1、月 0.3、町と星はほぼ動かない
    def cam(self, c):
        """返す: (倍率, 煙突の口が写る画面の x, y)。登場は口を箱の真ん中に大きく、SETTLE で上の帯の居場所へ"""
        k = ease(ramp(c.Ti, *SETTLE))
        return lerp(START_ZOOM, 1.0, k), lerp(START_X, CX, k), lerp(START_Y, MOUTH, k)

    def at(self, c, x, y, p=1.0):
        """世界の (x, y) が画面のどこに来るか。p は視差（1 で屋根と同じに動く・0 で動かない）"""
        z, sx, sy = self.cam(c)
        s = 1 + (z - 1) * p
        px, py = CX + (sx - CX) * p, MOUTH + (sy - MOUTH) * p
        return px + (x - CX) * s, py + (y - MOUTH) * s, s

    def thin_keep(self):
        """景色が薄く引いたあとに残す縁（0〜1。画面の濃さに掛ける）。真ん中（キャラ絵と字の所）を角の丸い四角に抜いた額。
        - 上の帯（星空と満月）・下の帯（雪の町の屋根）は濃く、左右（電飾のもみの木）は半分。煙突と満月はその絵の形のまま残す
        - 額の内側の四角（FRAME）は fx_check の THIN（全体の透明の平均 0.2 以下・真ん中 x 140〜580・y 300〜1100 は 0.03 以下）に
          収まる所で、縁をいちばん厚くした（箱の縁の溶かしを掛けて 全体 0.17・真ん中の外 0.28。11月の段4 は 0.14・0.22）
        前は上の端にごく薄い夜空だけを残した（濃い夜空の帯がぼやけた暗い帯に見えた）。描いた星空と月なら景色として見える"""
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        sm = lambda v: v * v * (3 - 2 * v)
        x0, x1, y0, y1, rad, f, wt, ws, wb = FRAME
        cx_, cy_ = np.clip(xx, x0 + rad, x1 - rad), np.clip(yy, y0 + rad, y1 - rad)
        k = sm(np.clip((np.hypot(xx - cx_, yy - cy_) - rad) / f, 0, 1))
        w = cv2.GaussianBlur(np.where(yy < y0 + rad, wt, np.where(yy > y1 - rad, wb, ws)).astype(np.float32), (0, 0), 40)
        cv = Canvas()  # 落ち着いたあと（カメラ 1 倍・ずれ 0）の形
        sprite(cv, self.chim, CX, MOUTH - CHIM_MOUTH * H_CHIM, H_CHIM, anchor=(0.5, 0.0))
        chim = cv.A * sm(np.clip((MOUTH + 110 - yy) / 34, 0, 1))
        moon = sm(np.clip((MOON[2] * 0.5 + 6 - np.hypot(xx - MOON[0], yy - MOON[1])) / 12, 0, 1))
        shape = cv2.GaussianBlur(np.maximum(chim, moon), (0, 0), 1.0)
        return np.maximum(k * w, shape).astype(np.float32)

    def thin_at(self, c):
        return ease(ramp(c.Ti, *self.THIN))

    # ---------------- あやと: 口から上へ。返す (絵, 口の画面の y, 持ち上がり 0〜1.1, sx, sy)
    def ayato(self, c):
        T, Ti, u = c.T, c.Ti, c.u
        if c.clip == "intro" and T < POP:
            return None
        if c.clip == "intro":
            # すぽん！: 口から体ごと宙へ飛び出し（1.62 で頂）、落ちてきて口に腰まで収まり、2回弾んで止まる
            if T < POP_TOP:
                r = lerp(0.0, 1.6, ease_out(ramp(T, POP, POP_TOP)))
            elif T < POP_LAND:
                r = lerp(1.6, 1.0, ease_in(ramp(T, POP_TOP, POP_LAND)))
            else:
                q = T - POP_LAND
                r = 1.0 + 0.16 * abs(math.sin(math.pi * clamp01(q / 0.16))) * (q < 0.16) \
                    + 0.06 * abs(math.sin(math.pi * clamp01((q - 0.16) / 0.12))) * (0.16 <= q < 0.28)
            st = math.exp(-((T - POP - 0.08) / 0.07) ** 2)
            sq = math.exp(-((T - POP_LAND - 0.01) / 0.045) ** 2) + 0.5 * math.exp(-((T - POP_LAND - 0.17) / 0.04) ** 2)
            sx, sy = 1 - 0.08 * st + 0.08 * sq, 1 + 0.14 * st - 0.11 * sq
        else:
            r, sx, sy = 1.0, 1.0, 1.0
        if c.clip == "outro":
            # すぽっと戻る（少し伸び上がってから）
            r = 1.0 + 0.06 * math.sin(math.pi * clamp01(u / 0.12)) * (u < 0.12) - ease_in(ramp(u, 0.1, 0.38)) * 1.05
        if c.clip == "intro" and T < POP_LAND + 0.2:
            art = self.pop
        else:
            # 切り替わりを滞在の頭（継ぎ目）から半拍ずらす。継ぎ目で絵が替わると、キーフレームの質の段と重なって
            # 継ぎ目の差が中のどのコマ送りより大きくなった（2026-11-23 の1回目の焼き: 1.60 > 1.31）
            art = self.wave[int(math.floor((T - self.INTRO) / WAVE + 0.5)) % 2]
        return art, r, sx, sy

    def draw(self, c):
        Ti, T, u = c.Ti, c.T, c.u
        intro = c.clip == "intro"
        out_k = 1 - ease(ramp(u, 0.25, 1.0))
        back, front, hero, lipc = Canvas(), Canvas(), Canvas(), Canvas()
        sp_sky, sp_b, sp_f = Splat(), Splat(), Splat()
        thin = self.thin_at(c)
        lit = ease(ramp(Ti, 0.2, 1.2))

        # ---- 夜空（前兆で上から降りてくる）
        sky_k = ease(ramp(Ti, 0.0, 0.7)) * out_k
        drop = np.clip((Ti * 1800 - np.arange(H, dtype=np.float32)) / 500, 0, 1)[:, None]
        a_ = (self.sky_a * drop * sky_k).astype(np.float32)
        back.over((self.sky_col * a_[..., None]).astype(np.float32), a_)
        # 星（滞在の輪で瞬く）
        st = self.stars
        tw = (0.5 + 0.5 * np.sin(2 * np.pi * (c.ph * (1 + (st[:, 2] * 3).astype(int)) + st[:, 3]))) ** 3
        on = np.clip((Ti - 0.1 - st[:, 1] / 1400) / 0.3, 0, 1)
        sp_sky.add_screen(st[:, 0], st[:, 1], (WHITE * 1.1)[None] * (0.15 + 0.7 * tw * st[:, 4])[:, None]
                        * (on * sky_k)[:, None])

        # ---- 背景の板（星空・満月・左右の電飾のもみの木・雪の町。前兆で上から降りてくる）。
        # 登場で少しだけ寄る（視差 PLATE_P）。寄っているあいだは少しぼかして、手前の煙突とあやとを立たせる
        z, csx, csy = self.cam(c)
        pz = 1 + (z - 1) * PLATE_P
        ox_, oy_ = CX + (csx - CX) * PLATE_P, MOUTH + (csy - MOUTH) * PLATE_P
        X0, Y0, S_ = ox_ + (PLATE_X0 - CX) * pz, oy_ + (PLATE_Y0 - MOUTH) * pz, PLATE_S * pz
        pr, pa = plate_layer(self.plate, X0, Y0, S_, blur=1.6 * (z - 1) / (START_ZOOM - 1))
        kk = (drop * sky_k).astype(np.float32)
        grade = np.float32([0.92, 0.94, 1.0]) * (0.7 + 0.3 * lit)
        back.over((pr * grade * kk[..., None]).astype(np.float32), (pa * kk).astype(np.float32))
        # 描かれた灯り（窓・軒の電球・もみの木の電飾・街灯）。前兆の終わりから左から順に灯り、滞在は瞬く
        vk = ease(ramp(Ti, 0.2, 0.9)) * out_k
        plate_emit(back, self.plate_win, X0, Y0, S_, lambda yy, xx: np.clip((Ti - 0.5 - xx * 0.4) / 0.2, 0, 1)
                   * (0.6 + 0.4 * np.sin(6.283 * (c.ph * 3 + xx * 11 + yy * 7)) ** 2), 0.75 * vk)

        # ---- 満月（板の月。前兆で明るくなり、光の筋を落とす）
        mx, my = X0 + PLATE_MOON[0] * PW * S_, Y0 + PLATE_MOON[1] * PH * S_
        self.moon_now = (mx, my)
        mk = ease(ramp(Ti, 0.1, 0.8)) * out_k
        mg = (0.35 + 0.25 * lit + 0.12 * c.osc(1)) * mk
        glow(back, mx, my, MOON[2] * 0.62, GOLD * 0.55 + WHITE * 0.25, 0.45 * mg)
        glow(back, mx, my, MOON[2] * 1.3, GOLD * 0.25, 0.3 * mg)

        # ---- 屋根と煙突（真ん中から、カメラが引くと上の帯へ）
        rk = ease(ramp(Ti, 0.3, 0.75)) * out_k
        shake = 0.0
        if intro and 0.75 < T < POP + 0.05:
            shake = 2.6 * ease(ramp(T, 0.75, POP)) * math.sin(T * 95)
        hx, hy, hs = self.at(c, CX + shake, MOUTH, 1.0)
        chim_h = H_CHIM * hs
        sprite(back, self.chim, hx, hy - CHIM_MOUTH * chim_h, chim_h, anchor=(0.5, 0.0), k=rk,
               grade=np.float32([1.0, 0.95, 0.92]) * (0.75 + 0.25 * lit), rim=0.4 * lit, light_dir=(0.6, -1.0))
        px_, py_, ps = self.at(c, RX, R_TOP, 1.0)
        rh = W_ROOF * self.roof.h / self.roof.w * ps
        dst = sprite(back, self.roof, px_, py_, rh, anchor=(0.5, 0.0), k=rk,
                     grade=np.float32([0.95, 0.95, 1.0]) * (0.72 + 0.28 * lit), rim=0.35 * lit, light_dir=(0.6, -1.0))
        self.emit_on(back, self.roof_win, dst, lambda yy, xx: np.clip((Ti - 0.6 - xx * 0.4) / 0.1, 0, 1)
                     * (0.75 + 0.25 * np.sin(6.283 * (c.ph * 3 + xx * 6)))
                     * (1 + 1.2 * np.exp(-((T - POP - 0.05 - xx * 0.2) / 0.08) ** 2) * intro), 0.8 * rk)

        sp_sky.into(back)

        # ---- キャラ絵が出たら、景色を縁だけに引く（前掛けなので、色・覆い・光を同じ濃さで掛ければ層ごと薄くなる）。
        # 粒（雪・光の筋・はじける雪）は引いたあとに足す。先に足すと、縁の外の雪と、上の帯の夜空の外を回る光の筋まで消えた
        m = 1 - thin * (1 - self.keep) if thin > 0.002 else None
        if m is not None:
            back.P *= m[..., None]
            back.A *= m
            back.L *= m[..., None]
            # 月のまわりの光は、形で残した月の外にも少し（光だけ）
            glow(back, mx, my, MOON[2] * 0.62, GOLD * 0.55 + WHITE * 0.25, 0.3 * mg * thin)

        # ---- 縁の夜空: 上の帯の星が瞬き、流れ星が走る（キャラ絵が出たあとも。景色を引いたあとに足すので消えない）
        self.edge_sky.draw(c, self.kit, back, sp_b, 0.8 * sky_k * thin)
        shooting_stars(c, self.kit, back, sp_b, SHOOT, self.STAY, sky_k * (c.clip != "outro"))
        # ---- 夜空のきらめく星（大きな十字の星）。すぽん！のあと順にきらめき、滞在は上の帯の星だけが瞬き続ける
        for j, (x, y, r0, r1) in enumerate(self.sparkles):
            tw = max(0.0, math.sin(6.283 * (c.ph * (1 + int(r0 * 2)) + r1))) ** 3
            wave = math.exp(-((T - 2.2 - (x / W) * 0.45) / 0.09) ** 2) * intro
            keep_ = 1 - thin * (1 - float(np.clip((280 - y) / 120, 0, 1)))
            kk = (0.25 + 0.55 * tw) * sky_k * keep_ + 0.9 * wave
            if kk > 0.02:
                fxv.stamp(back.L, self.kit.star["white" if j % 3 else "gold"], x, y, kk)

        # ---- 煙突が雪をふく（すぽん！の前に2回）
        for t0, nn in ((0.85, 14), (1.1, 18)):
            self.puff(c, sp_b, hx, hy, hs, T - t0, nn, seed=int(t0 * 100), k=rk * intro)

        # ---- あやと（主役だけの層）。口の手前の縁より下は描かない（煙突の中）
        ay = self.ayato(c)
        if ay is not None:
            art, r, sx, sy = ay
            h = H_AYATO * hs
            calm = ease(ramp(T, POP_LAND + 0.25, POP_LAND + 0.75))
            bob = 3.0 * math.sin(2 * math.pi * 2 * (T - self.INTRO) / self.STAY) * calm * hs
            rot = 2.0 * math.sin(2 * math.pi * (T - self.INTRO) / self.STAY) * calm
            y_anchor = hy + (1 - r) * h * 0.72 - bob
            sprite(hero, art, hx, y_anchor, h * sy, anchor=(0.5, A_CUT), rot=rot, sx=sx, k=1.0, rim=0.5,
                   light_dir=(0.6, -1.0), clip_below=hy + 5 * hs)
            # 口の手前の雪を、あやとの腰の上に重ねる
            sprite(lipc, self.lip, hx, hy - CHIM_MOUTH * chim_h, chim_h, anchor=(0.5, 0.0), k=rk,
                   grade=np.float32([1.0, 0.95, 0.92]) * (0.75 + 0.25 * lit), rim=0.4 * lit, light_dir=(0.6, -1.0))

        # ---- すぽん！: 雪がはじけ、金の輪が閃く
        self.pop_burst(c, back, sp_b, sp_f, front, hx, hy, hs)

        # ---- 金の光の筋: すぽん！のあと3本が渦を巻いて夜空を走り、滞在はあやとのまわりに2本・月のまわりに1本
        self.swirl(c, back, sp_b, hx, hy, hs)
        self.streaks(c, back, front, sp_b, sp_f, hx, hy, hs, mx, my, out_k)

        # ---- 煙突の煙（着地のあとから。滞在の輪でゆっくり昇り続ける）
        self.smoke_wisps(c, back, hx, hy, hs, ease(ramp(Ti, 2.6, 3.1)) * out_k)

        # ---- 雪（前兆から、箱ぜんぶに。奥・中・手前の3段。滞在の輪で降り続ける）
        amb = ease(ramp(Ti, 0.2, 1.0)) * out_k
        self.snowfall(c, back, front, amb, thin)
        sp_b.into(back)

        if m is not None:
            lipc.P *= m[..., None]
            lipc.A *= m
        # ---- 引いたあとの縁のきらめき
        ek = thin * out_k
        if ek > 0.003:
            for j, (x, y, r0, r1) in enumerate(self.edge_pts):
                tw = max(0.0, math.sin(6.283 * (c.ph * (1 + int(r0 * 2)) + r1))) ** 4
                fxv.stamp(back.L, self.kit.star["gold" if j % 3 else "white"], x, y + 5 * c.osc(1, r0), (0.3 + 0.3 * r0) * tw * ek)
        # ---- キャラ絵が出る瞬間: 真ん中の後ろから金の輪
        rv = (T - self.REVEAL) / 0.7 if intro else 9
        if 0 <= rv < 1:
            yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
            rr = 110 + 300 * ease_out(rv)
            d = np.hypot(xx - 360, (yy - 760) * 1.12) - rr
            band = np.exp(-(d / (8 + 26 * rv)) ** 2) * (1 - rv) ** 1.4
            back.emit(band[..., None] * (GOLD * 1.1 + WHITE * 0.5 + np.float32([1.0, 0.3, 0.25]) * 0.25) * 1.2)
            glow(back, 360, 760, 220, GOLD * 0.7 + WHITE * 0.2, 0.6 * (1 - rv) ** 2)

        rays = (mx, my, (0.3 + 0.25 * lit + 0.1 * c.osc(1)) * mk * (1 - 0.7 * thin), 0.9)
        out_b = back.finish(bloom=0.8, edge=self.edge, rays=rays)
        out_b = over_rgba(self.finish_hero(hero, bloom=0.45), out_b)
        out_b = over_rgba(lipc.finish(bloom=0.0, edge=self.edge), out_b)

        # ---- front（光と粒だけ）: 手前の大きな雪（snowfall で足した）・金の粉・キャラ絵のふちの星
        calm = 1 - 0.55 * thin
        dd = self.dust
        a3 = dd.age(c)
        x = 60 + dd.r[:, 0] * 600 + 30 * np.sin(6.283 * (a3 + dd.r[:, 1]))
        y = 1250 - a3 * 1150
        tw = (0.5 + 0.5 * np.sin(6.283 * (a3 * 3 + dd.r[:, 2]))) ** 2
        kd = np.sin(np.pi * a3) ** 1.5 * (0.2 + 0.6 * dd.r[:, 3] ** 2) * tw * ease(ramp(Ti, 1.4, 2.4)) * out_k * calm
        sp_f.add_screen(x, y, GOLD[None] * kd[:, None])
        sp_f.into(front)
        bk = ease(ramp(Ti, 1.6, 2.6)) * out_k
        for j in range(self.bok.n):
            rr = self.bok.r[j]
            a1 = self.bok.age(c)[j]
            x = (rr[0] * 1.1 - 0.05) * W + 30 * math.sin(6.283 * (a1 + rr[1]))
            y = H * (0.95 - 0.8 * a1) - rr[2] * 120
            kk = math.sin(math.pi * a1) ** 2 * (0.07 + 0.07 * rr[3]) * bk
            spr = self.kit.bokeh_spr(26 + rr[4] * 40, j % 3, [GOLD, WHITE, GOLD * 0.7 + WHITE * 0.4][j % 3], 6 + rr[5] * 6)
            fxv.stamp(front.L, spr, x, y, kk)
        if intro:
            rv = T - self.REVEAL
            if 0 <= rv < 0.9:
                R = np.random.default_rng(78)
                for k in range(24):
                    ang = R.random() * 6.283
                    dist = 170 + 220 * ease_out(rv / 0.9) * (0.6 + 0.4 * R.random())
                    fxv.stamp(front.L, self.kit.star["gold" if k % 3 else "white"], 360 + math.cos(ang) * dist * 0.9,
                              760 + math.sin(ang) * dist * 1.05, 0.85 * (1 - rv / 0.9) ** 1.5 * (0.5 + 0.5 * R.random()))
        return out_b, self.finish_front(front, bloom=0.7)

    @staticmethod
    def soft_dot(r):
        """雪の粒（やわらかい丸。真ん中が 1 の光の絵）"""
        n = int(r * 6) + 3
        yy, xx = np.mgrid[0:n, 0:n].astype(np.float32) - (n - 1) / 2
        g = np.exp(-(xx * xx + yy * yy) / (r * r))
        return (g[..., None] * WHITE * np.float32([0.95, 0.98, 1.05])).astype(np.float32)

    def snowfall(self, c, back, front, amb, thin):
        """箱ぜんぶに降る雪（奥・中は back、手前は front）。全部 Loop の周期で書くので、滞在の継ぎ目でつながる"""
        for g, r, k_, fall, sway, cv in ((self.snow_far, 1.6, 0.55, 1300, 14, back), (self.snow_mid, 3.0, 0.7, 1340, 24, back),
                                          (self.near, 6.5, 0.5, 1420, 40, front)):
            a = g.age(c)
            x = g.r[:, 0] * W + sway * np.sin(6.283 * (a * 2 + g.r[:, 1]))
            y = -30 + a * fall
            kd = np.sin(np.pi * a) ** 0.4 * (0.6 + 0.4 * g.r[:, 2]) * k_ * amb * (1 - 0.25 * thin)
            spr = self.flake[r]
            for j in range(g.n):
                if kd[j] > 0.01:
                    fxv.stamp(cv.L, spr, float(x[j]), float(y[j]), float(kd[j]))

    def smoke_wisps(self, c, back, hx, hy, hs, k):
        """煙突の煙（口の右から、ゆっくり昇って右へ流れる。物の層なので、あやとの後ろに隠れる）"""
        if k <= 0.003:
            return
        g = self.smoke
        a = g.age(c)
        for j in range(g.n):
            aj = a[j]
            x = hx + (40 + 34 * aj) * hs + 10 * math.sin(6.283 * (aj * 1.3 + g.r[j, 0]))
            y = hy - 8 * hs - aj * 230 * hs
            rad = (9 + 26 * aj) * hs
            al = 0.3 * math.sin(math.pi * aj) ** 1.2 * (1 - 0.4 * aj) * k
            if al <= 0.004 or y < -40:
                continue
            x0, x1 = max(0, int(x - 3 * rad)), min(W, int(x + 3 * rad))
            y0, y1 = max(0, int(y - 3 * rad)), min(H, int(y + 3 * rad))
            if x1 <= x0 or y1 <= y0:
                continue
            yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
            d = np.exp(-((xx - x) ** 2 + (yy - y) ** 2) / (rad * rad))
            aa = (d * al).astype(np.float32)
            back.over((aa[..., None] * np.float32([0.86, 0.88, 0.96])).astype(np.float32), aa, x0, y0)

    def comet(self, back, front, sp_b, sp_f, x, y, far, k, head=0.9, w=None):
        """光の筋1本（x, y は頭から尾へ）。far の所は back、ほかは front。w は点ごとの濃さ（物の後ろに隠す所を 0 に）"""
        n = len(x)
        fade = (1 - np.arange(n) / n) ** 1.6 * (1.0 if w is None else w)
        col = (GOLD * 1.3 + WHITE * 0.5)[None] * (fade * 0.5 * k)[:, None]
        sp_b.add_screen(x[far], y[far], col[far], coc=np.full(far.sum(), 1.2))
        sp_f.add_screen(x[~far], y[~far], col[~far] * 0.8, coc=np.full((~far).sum(), 1.2))
        fxv.stamp((back if far[0] else front).L, self.kit.star["gold"], float(x[0]), float(y[0]), head * k * float(fade[0]))

    def trail(self, back, sp_b, x, y, fade, k, head="gold"):
        """太く明るい光の筋1本（芯・にじみ・頭の星）。x, y は頭から尾へ"""
        if k <= 0.003 or len(x) == 0:
            return
        sp_b.add_screen(x, y, (GOLD * 1.5 + WHITE * 0.8)[None] * (fade * 1.6 * k)[:, None], coc=np.full(len(x), 1.2))
        sp_b.add_screen(x[::2], y[::2], (GOLD * 1.3 + WHITE * 0.2)[None] * (fade[::2] * 9.0 * k)[:, None],
                        coc=np.full(len(x[::2]), 3.0))
        for i in range(0, len(x) // 2, 40):
            fxv.stamp(back.L, self.kit.star["gold" if i else "white"], float(x[i]), float(y[i]), 0.7 * k * float(fade[i]))
        fxv.stamp(back.L, self.kit.star_big[head], float(x[0]), float(y[0]), 1.0 * k)
        glow(back, float(x[0]), float(y[0]), 18, GOLD * 0.8 + WHITE * 0.4, 0.5 * k)

    def swirl(self, c, back, sp_b, hx, hy, hs):
        """金の光の筋（全面のあいだだけ）:
        - 0.5〜1.3: 月から2本が渦を巻いて降りてきて、煙突の口へ吸い込まれる（すぽん！の前ぶれ）
        - 1.35〜2.75: すぽん！のあと3本が、口から渦を巻いて夜空いっぱいに走る"""
        if c.clip != "intro":
            return
        T = c.T
        tau = np.linspace(0, 0.3, 700)
        mx, my = self.moon_now
        for j in range(2):
            t0, dur = 0.5 + 0.12 * j, 0.78
            p = np.clip((T - tau - t0) / dur, 0, 1)
            ok = (T - tau) >= t0
            if not ok.any() or T > t0 + dur + 0.3:
                continue
            q = p ** 3  # ease_in の配列版（ease_in は数1つしか受けない）
            ang = 2 * math.pi * (j * 0.5 + 1.6 * p)
            rad = (1 - q) * 170
            x = lerp(mx, hx, q) + np.cos(ang) * rad
            y = lerp(my, hy - 20 * hs, q) + np.sin(ang) * rad * 0.7
            fade = (1 - tau / 0.3) ** 1.4 * ok * (1 - np.clip((p - 0.96) / 0.04, 0, 1))
            self.trail(back, sp_b, x, y, fade, ease(ramp(T, t0, t0 + 0.1)) * (1 - ease(ramp(T, t0 + dur, t0 + dur + 0.05))))
        env_ = ease(ramp(T, POP + 0.05, POP + 0.15)) * (1 - ease(ramp(T, 2.35, 2.75)))
        if env_ <= 0.003:
            return
        for j in range(3):
            t = T - tau
            p = np.clip((t - POP - 0.05) / 1.15, 0, 1)
            ang = 2 * math.pi * (j / 3 + 1.25 * p) + 0.6
            rad = 40 + 420 * (1 - (1 - p) ** 2)
            x = hx + np.cos(ang) * rad
            y = hy - 60 * hs + np.sin(ang) * rad * 0.9
            ok = t >= POP + 0.05
            fade = (1 - tau / 0.3) ** 1.4 * ok
            self.trail(back, sp_b, x[ok], y[ok], fade[ok], env_, head="white" if j == 0 else "gold")

    # ---------------- 描かれた灯り（窓・電球）を、on(yy, xx) の濃さで光らせる
    def emit_on(self, cv, win, dst, on, k):
        if dst is None or k <= 0.003:
            return
        ih, iw = win.shape
        yy = np.linspace(0, 1, ih, dtype=np.float32)[:, None]
        xx = np.linspace(0, 1, iw, dtype=np.float32)[None, :]
        em = (win * on(yy, xx))[..., None] * (GOLD * 0.9 + WHITE * 0.45) * 0.75 * k
        r = fs.warp_into(em.astype(np.float32), np.float32([[0, 0], [iw, 0], [iw, ih], [0, ih]]), dst)
        if r is not None:
            im, ox, oy = r
            cv.emit(im[..., :3], ox, oy)

    def puff(self, c, sp, hx, hy, hs, age, n, seed, k):
        """煙突の口から、雪がぽふっとふく"""
        if not (0 <= age < 0.7) or k <= 0.003:
            return
        R = np.random.default_rng(seed)
        vx = (R.random(n) - 0.5) * 160
        vy = -(60 + R.random(n) * 120)
        x = hx + (R.random(n) - 0.5) * 50 * hs + vx * age
        y = hy - 6 + vy * age + 260 * age * age
        kd = (1 - age / 0.7) ** 1.2 * k * (0.6 + 0.4 * R.random(n))
        sp.add_screen(x, y, (WHITE * 1.2)[None] * kd[:, None], coc=2.0 + 3.0 * R.random(n))

    def pop_burst(self, c, back, sp_b, sp_f, front, hx, hy, hs):
        """すぽん！（1.45）: 口から雪のかたまりが四方へはじけ、金の閃きと輪"""
        if c.clip != "intro":
            return
        age = c.T - POP
        if 0 <= age < 1.1:
            v = self.burst_v
            x = hx + v[:, 0] * age * hs
            y = hy - 8 + v[:, 1] * age * hs + 700 * age * age
            kd = (1 - age / 1.1) ** 1.4 * (0.7 + 0.6 * v[:, 2])
            near = v[:, 2] > 0.7
            sp_b.add_screen(x[~near], y[~near], (WHITE * 1.3)[None] * kd[~near, None], coc=2.0 + 2.0 * v[~near, 2])
            sp_f.add_screen(x[near], y[near], (WHITE * 1.1)[None] * kd[near, None] * 0.6, coc=4.0)
            for j in range(0, len(x), 3):
                if kd[j] > 0.05:
                    fxv.stamp(back.L, self.flake[2.7 if j % 2 else 6.5], float(x[j]), float(y[j]), float(kd[j]) * 0.7)
        # 金の粉が口から噴水のように噴き出して、きらめきながら落ちる
        if 0 <= age < 1.3:
            g = self.gold_v
            x = hx + g[:, 0] * age * hs
            y = hy - 10 + g[:, 1] * age * hs + 520 * age * age
            tw = (0.55 + 0.45 * np.sin(6.283 * (age * (4 + 4 * g[:, 2]) + g[:, 3]))) ** 2
            kd = (1 - age / 1.3) ** 1.2 * tw * (0.8 + 0.8 * g[:, 2])
            near = g[:, 3] > 0.75
            sp_b.add_screen(x[~near], y[~near], (GOLD * 1.5 + WHITE * 0.4)[None] * kd[~near, None])
            sp_f.add_screen(x[near], y[near], (GOLD * 1.3 + WHITE * 0.3)[None] * kd[near, None] * 0.7)
            for j in range(0, len(x), 6):
                fxv.stamp(back.L, self.kit.star["gold"], float(x[j]), float(y[j]), float(kd[j]) * 0.6)
        if 0 <= age < 0.6:
            fl = math.exp(-((age - 0.04) / 0.07) ** 2)
            fxv.stamp(back.L, self.kit.flare, hx, hy - 30 * hs, 0.9 * fl)
            streak(back, hx, hy - 30 * hs, 0.6 * fl, col=GOLD * 0.6 + WHITE * 0.5)
            q = age / 0.6
            R = np.random.default_rng(4107)
            for j in range(18):
                ang = 2 * math.pi * j / 18 + R.random() * 0.2
                d = (30 + 150 * ease_out(q)) * hs
                fxv.stamp(back.L, self.kit.star["gold" if j % 3 else "white"], hx + math.cos(ang) * d,
                          hy - 40 * hs + math.sin(ang) * d * 0.55, 0.9 * (1 - q) ** 1.3)

    def streaks(self, c, back, front, sp_b, sp_f, hx, hy, hs, mx, my, out_k):
        """金の光の筋（彗星のような頭と尾）。あやとのまわりに2本、月のまわりに細く1本。
        すぽん！のあと渦（swirl）が夜空を走るあいだに育ち、滞在では 1.5秒で1周（3秒で2周）"""
        T = c.T
        grow = ease_out(ramp(c.Ti, 2.55, 3.0))
        if grow <= 0.002:
            return
        k = grow * out_k
        cy = hy - 110 * hs
        tt = np.linspace(0, 0.42, 420)
        for j in range(2):
            ang = 2 * math.pi * ((T - self.INTRO) / 1.5 + j * 0.5) - 2 * math.pi * tt
            rad = lerp(0.2, 1.0, grow)
            ex, ey = 150 * hs * rad, 52 * hs * rad
            tilt = math.radians(-14 if j == 0 else 12)
            lx, ly = np.cos(ang) * ex, np.sin(ang) * ey
            x = hx + lx * math.cos(tilt) - ly * math.sin(tilt)
            y = cy + lx * math.sin(tilt) + ly * math.cos(tilt) - (1 - grow) * 60 * hs
            self.comet(back, front, sp_b, sp_f, x, y, np.sin(ang) < 0, k * 0.8)   # 奥（あやとの後ろ）は back
        # 月のまわりを細く回る1本（向きは逆回り。3秒で2周）
        ang = -2 * math.pi * ((T - self.INTRO) / 1.5 + 0.25) + 2 * math.pi * tt
        rr = MOON[2] * 0.5 + 26
        lx, ly = np.cos(ang) * rr * 1.18, np.sin(ang) * rr * 0.36
        tilt = math.radians(-10)
        x = mx + lx * math.cos(tilt) - ly * math.sin(tilt)
        y = my + lx * math.sin(tilt) + ly * math.cos(tilt)
        far = np.sin(ang) < 0
        # 月の後ろを通る所は、月の丸の中で消す（光は月の板より後に足すので、そのままだと月の上に乗る）
        hid = far & (np.hypot(x - mx, y - my) < MOON[2] * 0.5)
        self.comet(back, front, sp_b, sp_f, x, y, far, k * 0.7, head=0.7, w=(~hid).astype(np.float32))
