"""1万円の段（段7）の振付け。**どの物が、どの秒に、どこに居るか**を1つの関数（`pose`）から出す。

Blender は要らない（素の Python）。`castle_t7.py` がこれを読んで、コマごとの値を Blender のキーにする。
継ぎ目が出ないことは `python3 tools/alert-theme/blender/t7_motion.py check` が確かめる
（intro の 7.0 秒と stay の 0 秒、stay の 3.0 秒と 0 秒、outro の頭と stay の 0 秒が同じ姿か・outro の最後に何も残らないか・
あやとの顔が字の帯に乗らないか）。描くワークフロー（`alert_blender.yml`）が、描く前に毎回回す。

終了コード: 0 = つながる / 1 = つながらない所が在る

## 決まり
- stay の動きは全部 3.0 秒で1周する（`per()`）。月の光の粒・葉・粒は 1.5 / 1.0 秒の周期も使う（3.0 の約数）
- intro の後半は、stay と同じ式に `τ = t - 7.0` を入れて動かす。だから intro の終わりがそのまま stay の頭になる
- 頭に戻る物（月の光の粒・葉）は、戻るコマの前後で大きさを 0 にする（動きのぶれで画面を縦に横切る筋が出ないように）
- 値の名前:
  `obj:<名前>:loc` / `:rot`（度ではなくラジアン）/ `:scale`（数1つか3つ）、`val:<名前>`（材質・光の強さ）、`cam:lens`

座標は m。門の真ん中の床が原点、城は +y の奥、カメラは -y。城の物（`ROOT_KIDS`）は `castle_root` の子の座標。
"""
import math
import random
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import t7_plan as P  # noqa: E402

TAU = 2 * math.pi
INTRO, STAY, OUTRO, REVEAL = P.INTRO, P.STAY, P.OUTRO, P.REVEAL
B = P.ROCK_TOP
HW = P.GATE["half_w"]


# ---------------------------------------------------------------- なめらかさ
def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def ramp(t, a, b):
    if b <= a:
        return 1.0 if t >= b else 0.0
    return clamp((t - a) / (b - a))


def ease_io(x):
    x = clamp(x)
    return 0.5 - 0.5 * math.cos(math.pi * x)


def ease_out(x, p=3.0):
    x = clamp(x)
    return 1 - (1 - x) ** p


def ease_in(x, p=3.0):
    x = clamp(x)
    return x ** p


def back_out(x, s=1.4):
    x = clamp(x) - 1
    return x * x * ((s + 1) * x + s) + 1


def pulse(t, c, w):
    return math.exp(-((t - c) / w) ** 2)


def lerp(a, b, x):
    return a + (b - a) * x


def vlerp(a, b, x):
    return tuple(a[i] + (b[i] - a[i]) * x for i in range(3))


def vadd(a, b):
    return tuple(a[i] + b[i] for i in range(3))


def frac(x):
    return x - math.floor(x)


def per(clip, t):
    """stay の周期の中の秒（τ）。intro は t - 7.0、outro は t（outro の頭 = stay の 3.0 秒 = 0 秒）"""
    if clip == "intro":
        return t - INTRO
    return t


def screen(sx, sy, depth, lens=None):
    return P.unproject(sx, sy, depth, lens)


# ---------------------------------------------------------------- 決まった並び（種を決めた乱数）
R = random.Random(7_0000)

# 貯金箱の城（前兆）を置く四角と、そこに城を縮めたときの姿
BANK_X, BANK_Y, BANK_W, BANK_H = P.BANK_RECT
STICKER_DEPTH = 20.0
# 絵の 560×470 のうち、門の下の端
STICKER_GATE = (288 / 560, 440 / 470)
BANK_GATE_SCREEN = (BANK_X + STICKER_GATE[0] * BANK_W, BANK_Y + STICKER_GATE[1] * BANK_H)
GATE_DEPTH = 29.6
# 城（地面から高い塔の先まで 27.4m）を、貯金箱の絵の城の高さに縮める倍率
CASTLE_H = B + 18.2
S_BANK = (STICKER_GATE[1] * BANK_H) / ((P.LENS_FROM / 12.0) * (P.H / 2) / GATE_DEPTH) / CASTLE_H
Q_BANK = screen(BANK_GATE_SCREEN[0], BANK_GATE_SCREEN[1], GATE_DEPTH, P.LENS_FROM)
# 締めで、月の光の粒が吸い込まれる先（貯金箱の城の窓のあたり）
LIGHT_SINK = screen(BANK_X + BANK_W * 0.5, BANK_Y + BANK_H * 0.45, 22.0)

# あやと（板）。画面のどこに居るか（絵の真ん中）
AYATO_DEPTH = 17.0
AYATO_FROM = (-160, -300)
# 城の左の塔の上（画面の y 330 あたり）より上に足が来るように（2026-11-04 の試しで、塔の上に立って見えた）
# 2026-11-04: 名前の札が上から降りてくる瞬間（5.63〜5.68 秒）に、あやとの顔の下の端に掛かった（長い名前・3行のとき）。
# 降り立つ所を 14px 上げて（足の裏が小塔の頂に乗る）、降り立ってからは顔の下の端が箱の上 15% より上にあるようにする
AYATO_HOVER = (190, 194)
AYATO_STAY = (176, 198)
AYATO_W_PX = 300  # 広げたマントの絵（1239px）の幅が、ふつうの大きさで画面の何 px か
AYATO_M_PER_PX = AYATO_W_PX / ((P.CAM["lens"] / 12.0) * (P.H / 2) / AYATO_DEPTH) / 1239

# あやとの2枚の絵（ドラキュラ。顔の幅は2枚でそろえてある）。顔の真ん中が同じ所に来るように板の原点を決める
AYATO_POSES = {
    "ayato_spread": {"file": "public/alert/themes/halloween/poses/dracula/spread.webp", "size": (1239, 1183), "face": (632.5, 275.0)},
    "ayato_rise": {"file": "public/alert/themes/halloween/poses/dracula/rise.webp", "size": (820, 1102), "face": (395.5, 227.0)},
}


def ayato_plane(name):
    """板の (幅, 高さ, 原点の x, 原点の z)（m）。spread は絵の真ん中が原点、rise は顔が spread の顔と重なる所が原点"""
    mpp = AYATO_M_PER_PX
    pz = AYATO_POSES[name]
    size, face = pz["size"], pz["face"]
    w, h = size[0] * mpp, size[1] * mpp
    sp = AYATO_POSES["ayato_spread"]
    sfx = (sp["face"][0] - sp["size"][0] / 2) * mpp
    sfy = (sp["size"][1] / 2 - sp["face"][1]) * mpp
    fx = (face[0] - size[0] / 2) * mpp
    fy = (size[1] / 2 - face[1]) * mpp
    return w, h, w / 2 + (fx - sfx), h / 2 + (fy - sfy)


# ピポ（城の露台）。旗の絵（pipo-flag.png・164×204）の高さが PIPO_H。cheer の絵（178×192）も同じ px の大きさで立てる
PIPO_FOOT = (3.35, -0.05, B + 8.6 + 0.85)
PIPO_H = 4.4
PIPO_M_PER_PX = PIPO_H / 204
# キャラ絵が出る前に跳び乗る、塔の屋根の高さ（露台から m。屋根の裾 B+12.6 より上の、円錐の前）
PIPO_PERCH = 4.0
# 板の原点（足の真ん中）が絵のどこか（px）。足の x は、下の端 8px の不透明の真ん中を測った（2026-11-04）
PIPO_BOARDS = {
    "pipo": {"file": "public/alert/themes/castle/pipo-flag.png", "size": (164, 204), "foot": (75.0, 198.9)},
    "pipo_cheer": {"file": "public/alert/themes/castle/pipo-cheer.png", "size": (178, 192), "foot": (92.2, 186.9)},
}


def pipo_plane(name):
    """ピポの板の (幅, 高さ, 原点の x, 原点の z)（m）"""
    b = PIPO_BOARDS[name]
    (w, h), (fx, fy) = b["size"], b["foot"]
    return w * PIPO_M_PER_PX, h * PIPO_M_PER_PX, fx * PIPO_M_PER_PX, (h - fy) * PIPO_M_PER_PX


# ---------------------------------------------------------------- 板の形の変わり方（シェイプキー）
# 板は絵のまま（描き直さない）。形を少し動かして生きて見せる: あやとのマントがはためく・ピポが旗を振る。
# 形は絵の画素の座標で書く（x は右、y は下が正）。値 1 のときの動き (dx, dy, dn) を返す（絵の px。dn はカメラへ向かう向き）。
# Blender（castle_t7.py）はこれでシェイプキーを作る
BOARD_KEYS = {
    "ayato_spread": ("flap_s", "flap_c", "open"),
    "ayato_rise": ("flut_s", "flut_c"),
    "pipo": ("swing", "wave_s", "wave_c"),
}
# 旗を振る軸（竿を握る手。pipo-flag.png の px）
PIPO_GRIP = (113.0, 80.0)


def _ss(a, b, x):
    u = clamp((x - a) / (b - a))
    return u * u * (3 - 2 * u)


def deform_px(name, key, x, y):
    """絵の画素 (x, y) が、形 key の値 1 で動く量 (dx, dy, dn)（px）"""
    if name == "ayato_spread":
        # マントの外側の裾ほど大きく動く。体・顔・杯を掲げた腕（左上）・マントを持つ手（右上）は動かさない
        d = abs(x - 620.0)
        w = _ss(200, 520, d) * _ss(280, 920, y)
        if w <= 0:
            return 0.0, 0.0, 0.0
        sgn = 1.0 if x >= 620 else -1.0
        if key == "open":
            # 降り立った瞬間に、ばさっと外へ開いて持ち上がる
            return sgn * 70 * w, -45 * w, 40 * w
        # 体から裾へ走る波（flap_s と flap_c を cos・sin で混ぜると、波が外へ走る）
        ph = math.pi * 1.6 * ((d - 200) / 420 + (y - 280) / 1000)
        f = math.sin(ph) if key == "flap_s" else math.cos(ph)
        return 0.25 * sgn * 60 * w * f, 60 * w * f, 90 * w * f
    if name == "ayato_rise":
        # 体に巻いたマントの裾が、飛んでくる風でなびく
        w = _ss(640, 1080, y) * (0.35 + 0.65 * _ss(40, 330, abs(x - 410)))
        if w <= 0:
            return 0.0, 0.0, 0.0
        ph = math.pi * 1.8 * ((x - 410) / 380 + (y - 640) / 460)
        f = math.sin(ph) if key == "flut_s" else math.cos(ph)
        return 30 * w * f, 22 * w * f, 50 * w * f
    if name == "pipo":
        # 竿と旗（手より上・竿より右）だけ。耳（x 106 まで）と手（y 80 より下）は動かさない
        reg = _ss(106, 114, x) * (1 - _ss(72, 84, y))
        if reg <= 0:
            return 0.0, 0.0, 0.0
        if key == "swing":
            # 手のまわりの回転（1 rad あたり。小さい角度の近似）。画面で時計回りが +
            gx, gy = PIPO_GRIP
            return -(y - gy) * reg, (x - gx) * reg, 0.0
        # 布に、竿から先へ走る波
        wf = _ss(117, 160, x) * (1 - _ss(64, 72, y)) * reg
        ph = math.pi * 1.5 * (x - 116) / 44
        f = math.sin(ph) if key == "wave_s" else math.cos(ph)
        return 0.0, 5 * wf * f, 6 * wf * f
    return 0.0, 0.0, 0.0


def board_offset_px(name, vals, x, y):
    """そのコマの形の値（{key: 値}）を足した、画素 (x, y) の動き（px）"""
    dx = dy = dn = 0.0
    for key in BOARD_KEYS.get(name, ()):
        v = vals.get(key, 0.0)
        if v:
            a, b, c = deform_px(name, key, x, y)
            dx += v * a
            dy += v * b
            dn += v * c
    return dx, dy, dn


def board_vals(p, name):
    """pose の出力から、その板の形の値を拾う"""
    return {k: p.get(f"key:{name}:{k}", 0.0) for k in BOARD_KEYS.get(name, ())}


# カメラが回り込む軸（城の真ん中の縦の線）と、いちばん回ったときの角度
ORBIT_PIVOT = (0.0, 4.0)
ORBIT_YAW = math.radians(-10.0)


def orbit_yaw(clip, t):
    """カメラの回り込み（rad）。城がふくらむ 1.5 秒から、あやとが降り立つ前の 4.3 秒までに、回って戻る。
    前兆の貯金箱（画面の決まった所に描く）と、キャラ絵が門の光から出る 5.6 秒（字の場所が決まっている）は回さない"""
    if clip != "intro":
        return 0.0
    return ORBIT_YAW * math.sin(math.pi * ease_io(ramp(t, 1.5, 4.3)))


def orbit(p, yaw):
    """世界の点を、ORBIT_PIVOT の縦の軸のまわりに yaw 回す（カメラといっしょに回すと、画面の同じ所に写る）"""
    cx, cy = ORBIT_PIVOT
    c, s = math.cos(yaw), math.sin(yaw)
    x, y = p[0] - cx, p[1] - cy
    return (cx + c * x - s * y, cy + s * x + c * y, p[2])

# 高い塔（こうもりの渦の軸）
TOWER = (3.6, 2.4)


# ---------------------------------------------------------------- 月の光の粒（金貨の代わり）
# 2026-11-05 にあやとから「投げ銭してコイン撒くのはイメージ悪いので変えてほしい」（#1095）。
# 金貨の雨・門から噴き上がる金貨・滞在中に降り続ける金貨・締めで貯金箱へ吸い込まれる金貨を、全部お金でないものに替えた:
#   - 伯爵が降り立ってマントを広げると、マントの陰から**こうもりの群れ**が満月へ飛び立つ（`_swarm_spec`）
#   - 群れが満月を横切ると、月がひときわ光って**光の筋**が走り、**月の光の粒**が城へ降りそそぐ（`MOTE_RAIN`）
#   - 門が開く瞬間に噴き上がるのは、門の灯りの**火の粉**（`EMBERS`。上へ昇って消える。地面に落ちない）
#   - 滞在中は月の光の粒がまたたきながら舞い降り（`MOTE_STAY`）、締めでは城が貯金箱へ縮むのといっしょに、
#     その光が城の窓へ吸い込まれる（窓が灯る）
# バラの花びらは段5（ソフィアのバラの祭り）が使っているので、段を被らせないために選ばなかった。
# 金の粉も段5が昇らせている。月の光（銀と淡い紫に、少しだけシャンパンの金）は、この段の主役の満月から来る
#
# **乱数を引く回数と順は、前の版（金貨）のまま変えない。** あとに引くこうもり・葉・粒の並び（顔の線・顔の穴・
# あやとの後ろを通す葉で確かめ済み）を崩さないため。金貨の並びの数を、そのまま粒の並びに読み替える
def _mote_spec():
    rain = []
    for i in range(110):
        rain.append(dict(
            name=f"mote_r{i:03d}", sx=R.uniform(-30, 750), depth=R.choice([R.uniform(11, 16), R.uniform(14, 32), R.uniform(14, 32)]),
            ts=R.uniform(4.35, 5.05), dur=R.uniform(1.4, 1.9), drift=R.uniform(-60, 60),
            axis=(R.uniform(-1, 1), R.uniform(-1, 1), R.uniform(-1, 1)), spin=R.uniform(1.2, 2.8) * R.choice([-1, 1]),
            rot0=(R.uniform(0, TAU), R.uniform(0, TAU), R.uniform(0, TAU)), size=R.uniform(1.0, 1.4)))
    embers = []
    for i in range(36):
        embers.append(dict(
            name=f"ember_{i:02d}", ts=R.uniform(3.0, 3.5), v=(R.uniform(-5.5, 5.5), R.uniform(-13, -7), R.uniform(8.5, 13.5)),
            spin=(R.uniform(-14, 14), R.uniform(-14, 14), R.uniform(-14, 14)), size=R.uniform(0.85, 1.15)))
    stay = []
    for i in range(54):
        Pd = R.choice([3.0, 1.5, 1.5])
        stay.append(dict(
            name=f"mote_s{i:03d}", sx=R.uniform(-30, 750), depth=R.choice([R.uniform(11, 16), R.uniform(14, 32), R.uniform(16, 32)]),
            period=Pd, phase=R.random(), drift=R.uniform(-40, 40),
            turns=(R.choice([-2, -1, 1, 2]), R.choice([-3, -2, 2, 3]), R.choice([-1, 1])),
            rot0=(R.uniform(0, TAU), R.uniform(0, TAU), R.uniform(0, TAU)), size=R.uniform(1.0, 1.35),
            sink_delay=R.uniform(0.0, 0.18)))
    # 読み替え（乱数は引かない）
    for k, m in enumerate(rain + stay):
        # 粒はあやとの後ろを通す（顔の前でまたたかない）。手前の粒は、あやとのすぐ後ろへ寄せる
        if m["depth"] < AYATO_DEPTH + 1.5:
            m["depth"] = AYATO_DEPTH + 1.5 + 0.5 * (m["depth"] - 11)
        # 銀（月の光）2 に、シャンパンの金 1
        m["gold"] = k % 3 == 2
    for m in rain:
        u0, u1, _ = (a / TAU for a in m["rot0"])
        # 大きさをばらす（2割ほどが大きく光り、3割ほどが小さな点）。そろった点が並ぶと、雪か画面の汚れに見えた
        # （試しの絵 run 41951972137）
        m["size"] *= 1.8 if m["axis"][2] > 0.6 else (0.7 if m["axis"][2] < -0.4 else 1.0)
        # 満月のあたり（画面の上 1/3）で生まれて、ゆっくり舞い降りる。群れが月を横切るころ（4.75 秒）から
        m["sy0"] = -30 + 470 * u0 ** 1.4
        m["fall"] = 300 + 260 * u1
        m["tb"] = 4.75 + 0.85 * (m["ts"] - 4.35) / 0.7
        # intro の終わり（6.95 秒）までに消えきる（stay の頭には居ない）
        m["life"] = min(m["dur"], 6.93 - m["tb"])
        m["tw"] = 1.5 + abs(m["spin"])
    for m in stay:
        u0, u1, _ = (a / TAU for a in m["rot0"])
        m["size"] *= 1.8 if m["sink_delay"] > 0.144 else (0.7 if m["sink_delay"] < 0.054 else 1.0)
        m["sy0"] = -40 + 1100 * u0
        # 1周で舞い降りる量（px）。3.0 秒の粒は 1.5 秒の粒の倍の距離をゆっくり
        m["fall"] = 90 * m["period"] * (0.7 + 0.6 * u1)
    return rain, embers, stay


MOTE_RAIN, EMBERS, MOTE_STAY = _mote_spec()
MOTES = MOTE_RAIN + MOTE_STAY


def _bat_spec():
    omen = []
    for i in range(10):
        omen.append(dict(name=f"bat_o{i:02d}", r=R.uniform(1.6, 3.4), h=R.uniform(0.6, 3.6), a0=R.uniform(0, TAU),
                         w=R.uniform(0.8, 1.2) * R.choice([1, 1, -1]), flap=R.choice([7, 8, 9]), ph=R.random(),
                         t0=R.uniform(0.42, 0.75), size=R.uniform(0.85, 1.15)))
    castle = []
    for i in range(26):
        k = R.choice([1, 1, 2])
        castle.append(dict(name=f"bat_c{i:02d}", r=R.uniform(4.5, 11.5), z=B + R.uniform(9, 21), a0=R.uniform(0, TAU),
                           k=k * R.choice([1, -1]), flap=R.choice([6, 7, 8]), ph=R.random(), bob=R.uniform(0.3, 1.0),
                           t0=R.uniform(1.75, 2.25), size=R.uniform(0.85, 1.3)))
    near = []
    for i in range(4):
        near.append(dict(name=f"bat_n{i:02d}", depth=R.uniform(10, 15), y0=R.uniform(150, 520), y1=R.uniform(100, 560),
                         start=i * 0.75 + R.uniform(0, 0.3), dur=R.uniform(1.0, 1.3), dirx=R.choice([1, -1]),
                         flap=R.choice([6, 7]), ph=R.random(), size=R.uniform(1.0, 1.3)))
    return omen, castle, near


BAT_OMEN, BAT_CASTLE, BAT_NEAR = _bat_spec()
BATS = BAT_OMEN + BAT_CASTLE + BAT_NEAR


def _leaf_spec():
    out = []
    for i in range(18):
        Pd = R.choice([3.0, 3.0, 1.5])
        out.append(dict(name=f"leaf_{i:02d}", sx=R.uniform(-20, 740), depth=R.uniform(5, 22), period=Pd, phase=R.random(),
                        sway=R.uniform(30, 90), turns=(R.choice([-2, -1, 1, 2]), R.choice([-2, -1, 1, 2]), R.choice([-1, 1])),
                        rot0=(R.uniform(0, TAU), R.uniform(0, TAU), R.uniform(0, TAU)), size=R.uniform(0.8, 1.3)))
    return out


LEAVES = _leaf_spec()


def _leaves_behind_ayato():
    """伯爵あやとの顔の列（画面の x 60〜340）を通る手前の葉は、あやとの後ろへ下げる（画面の上の通り道は変わらない）。
    2026-11-04 の試しで、降り立つ山場と滞在の両方で、紅葉があやとの顔を横切った"""
    for lf in LEAVES:
        if lf["depth"] < AYATO_DEPTH + 1.0 and lf["sx"] - lf["sway"] < 340 and lf["sx"] + lf["sway"] > 60:
            lf["depth"] = AYATO_DEPTH + 1.5 + 0.25 * (lf["depth"] - 5)


_leaves_behind_ayato()


def _spark_spec():
    gate = []  # 門の光から立ちのぼる（城の子）
    for i in range(40):
        gate.append(dict(name=f"spk_g{i:02d}", p=(R.uniform(-4.2, 4.2), R.uniform(-7.5, -1.4), R.uniform(0.2, 6.5)),
                         rise=R.uniform(0.8, 2.2), period=R.choice([1.5, 3.0]), phase=R.random(), size=R.uniform(0.6, 1.4)))
    cape = []  # マントが開いたとき、あやとの後ろから
    for i in range(18):
        a = TAU * i / 18 + R.uniform(-0.15, 0.15)
        cape.append(dict(name=f"spk_a{i:02d}", a=a, dist=R.uniform(1.4, 3.0), size=R.uniform(0.7, 1.3), delay=R.uniform(0, 0.08)))
    front = []  # 前の層: 縁とした下のあたり（キャラ絵の顔のあたりは避ける）
    for i in range(28):
        while True:
            sx, sy = R.uniform(-10, 730), R.uniform(80, 1270)
            if not (130 < sx < 590 and 380 < sy < 860):
                break
        front.append(dict(name=f"spk_f{i:02d}", sx=sx, sy=sy, depth=R.uniform(4.5, 10), rise=R.uniform(60, 160),
                          period=R.choice([1.5, 3.0]), phase=R.random(), size=R.uniform(0.6, 1.4)))
    burst = []  # 前の層: 門の光からキャラ絵が出る瞬間に、外へ（上の向きは避ける）
    for i in range(20):
        while True:
            a = R.uniform(-math.pi, math.pi)
            # 画面の上（-y）から ±55° は避ける
            if abs(((a + math.pi / 2 + math.pi) % TAU) - math.pi) > math.radians(55):
                break
        burst.append(dict(name=f"spk_r{i:02d}", a=a, dist=R.uniform(230, 430), depth=R.uniform(7, 11), size=R.uniform(0.7, 1.3),
                          delay=R.uniform(0, 0.12)))
    bank = []  # 前の層: 締めで月の光が貯金箱の城に入りきったとき
    for i in range(14):
        a = R.uniform(-math.pi, 0)
        bank.append(dict(name=f"spk_k{i:02d}", a=a, dist=R.uniform(60, 150), size=R.uniform(0.6, 1.1), delay=R.uniform(0, 0.08)))
    return gate, cape, front, burst, bank


SPK_GATE, SPK_CAPE, SPK_FRONT, SPK_BURST, SPK_BANK = _spark_spec()
SPARKS_BACK = SPK_GATE + SPK_CAPE
SPARKS_FRONT = SPK_FRONT + SPK_BURST + SPK_BANK

# 城の子（castle_root の座標で動かすもの）
ROOT_KIDS = {b["name"] for b in BAT_CASTLE} | {s["name"] for s in SPK_GATE} | {"pipo", "pipo_cheer", "pipo_shadow",
                                                                                "pipo_cheer_shadow"}
# ピポの落ち影を、板からどれだけずらすか（m。光は左上の前から。奥へ 0.25m・右へ・下へ）
PIPO_SHADOW_OFF = (0.24, 0.25, -0.18)

HIDE = 1e-4  # 大きさ 0 の代わり（0 だと行列が潰れる）


# ---------------------------------------------------------------- 部品ごとの動き
def castle_root(clip, t, out):
    if clip == "intro":
        if t < 1.45:
            s, loc = HIDE, Q_BANK
        else:
            x = ramp(t, 1.5, 2.75)
            s = lerp(S_BANK, 1.0, back_out(x, 1.1))
            loc = vlerp(Q_BANK, (0, 0, 0), ease_out(x, 2.6))
        # ふくらむあいだの地鳴り（減っていく）
        shake = (1 - ramp(t, 1.5, 2.9)) * (t >= 1.45)
        rz = 0.012 * shake * math.sin(TAU * 9.0 * t)
        rx = 0.006 * shake * math.sin(TAU * 7.0 * t + 1.0)
    elif clip == "stay":
        s, loc, rx, rz = 1.0, (0, 0, 0), 0.0, 0.0
    else:
        x = ramp(t, 0.05, 0.92)
        e = ease_in(x, 2.2)
        s = lerp(1.0, S_BANK, e)
        loc = vlerp((0, 0, 0), Q_BANK, e)
        if t >= 0.97:
            s = HIDE
        rx = rz = 0.0
    out["obj:castle_root:loc"] = loc
    out["obj:castle_root:rot"] = (rx, 0.0, rz)
    out["obj:castle_root:scale"] = s


def sticker(clip, t, out):
    cx = BANK_X + BANK_W / 2
    cy = BANK_Y + BANK_H / 2
    base = screen(cx, cy, STICKER_DEPTH, P.LENS_FROM)
    rx = rz = 0.0
    sx = sz = 1.0
    off = (0.0, 0.0, 0.0)
    if clip == "intro":
        op = ramp(t, 0.0, 0.15) * (1 - ramp(t, 1.36, 1.5))
        a = 0.25 + 0.75 * ease_in(ramp(t, 0.15, 1.3), 2.0)
        a *= op > 0
        ry = math.radians(2.4) * a * math.sin(TAU * 11 * t) + math.radians(1.3) * a * math.sin(TAU * 17 * t + 1)
        off = (0.06 * a * math.sin(TAU * 13 * t), 0.0, 0.05 * a * abs(math.sin(TAU * 9 * t)))
        swell = 1 + 0.08 * ease_out(ramp(t, 1.22, 1.45)) * (t < 1.5)
        sx = swell * (1 + 0.02 * a * math.sin(TAU * 9 * t))
        sz = swell * (1 - 0.02 * a * math.sin(TAU * 9 * t))
        sweep = ramp(t, 0.2, 0.95)
        win = 1 + 2.5 * pulse(t, 1.3, 0.09)
    elif clip == "stay":
        op, ry, sweep, win = 0.0, 0.0, 1.0, 1.0
    else:
        op = ramp(t, 0.93, 0.98) * (1 - ease_io(ramp(t, 1.05, 1.42)))
        ry = 0.0
        sweep = 1.0
        win = 1 + 1.5 * pulse(t, 1.0, 0.06)
        sx = sz = 1 + 0.06 * pulse(t, 1.0, 0.07)
    out["obj:sticker:loc"] = vadd(base, off)
    out["obj:sticker:rot"] = (math.radians(90 + P.CAM["pitch_deg"]) + rx, ry, rz)
    out["obj:sticker:scale"] = (sx, 1.0, sz)
    out["val:sticker_op"] = op
    out["val:sticker_sweep"] = sweep
    out["val:sticker_win"] = win


# 滞在中に残す、満月の光の筋の強さ（山の 1 に対して）
MOON_RAYS_STAY = 0.35


def sky(clip, t, out):
    if clip == "intro":
        op = 0.55 * ease_io(ramp(t, 0.25, 1.2)) + 0.38 * ease_io(ramp(t, 1.15, 1.45)) - 0.05 * ramp(t, 1.6, 2.6)
        det = ease_io(ramp(t, 1.6, 2.8))
        mop = ease_io(ramp(t, 1.55, 2.4))
        rise = 1 - ease_out(ramp(t, 1.55, 2.9), 2.5)
    elif clip == "stay":
        op, det, mop, rise = 0.88, 1.0, 1.0, 0.0
    else:
        f = ease_io(ramp(t, 0.15, 1.2))
        op = 0.88 * (1 - f)
        det = 1 - ramp(t, 0.1, 0.8)
        # 満月は空より先に 0.5 秒で消す。空といっしょに 1.2 秒かけると、明るい月が薄く残って、
        # 配信の上に灰色の円として見えた（2026-11-04 の縦の録画。顔の映った画面で、配信者の顔の横に）
        mop = 1 - ease_io(ramp(t, 0.0, 0.5))
        rise = 0.3 * f
    # こうもりの群れが満月を横切ると、月がひときわ光って光の筋が走り（4.95 秒が山）、滞在中は筋がうっすら残る
    if clip == "intro":
        rays = ease_out(ramp(t, 4.62, 4.95)) * (1 - (1 - MOON_RAYS_STAY) * ease_io(ramp(t, 5.0, 5.9)))
        halo = mop * (1 + 0.8 * pulse(t, 4.98, 0.25))
    elif clip == "stay":
        rays, halo = MOON_RAYS_STAY, mop
    else:
        rays, halo = MOON_RAYS_STAY * mop, mop
    tau = per(clip, t)
    out["val:sky_op"] = op
    out["val:sky_det"] = det
    out["val:sky_ph"] = tau / 1.5
    out["val:moon_op"] = mop
    out["val:moon_halo"] = halo
    out["val:moon_rays"] = rays
    out["val:moon_rise"] = rise


def castle_lights(clip, t, out):
    tau = per(clip, t)
    if clip == "intro":
        key = ease_io(ramp(t, 1.6, 2.6))
        up = ease_io(ramp(t, 2.1, 3.0))
        win = ramp(t, 1.45, 1.7) * (1 + 0.8 * pulse(t, 2.0, 0.25))
        G = (ease_out(ramp(t, 2.62, 3.05)) + 0.9 * pulse(t, 3.08, 0.13)
             + 1.1 * ease_out(ramp(t, 5.25, 5.6)) * (1 - ease_io(ramp(t, 5.6, 6.5)))
             + 0.1 * math.sin(TAU * tau / 1.5) * ramp(t, 3.2, 4.0))
        G *= t >= 2.62
        door = math.radians(86) * back_out(ramp(t, 2.62, 3.35), 0.8)
        fog = ease_io(ramp(t, 1.6, 2.8))
        flash = 1.0 * pulse(t, 4.42, 0.09) + 0.6 * pulse(t, 3.08, 0.1)
    elif clip == "stay":
        key, up, win = 1.0, 1.0, 1.0
        G = 1 + 0.1 * math.sin(TAU * tau / 1.5)
        door = math.radians(86)
        fog = 1.0
        flash = 0.0
    else:
        key = 1 - 0.7 * ramp(t, 0.1, 0.9)
        up = 1 - ease_io(ramp(t, 0.1, 0.6))
        win = 1.0
        G = (1 + 0.1 * math.sin(TAU * tau / 1.5)) * (1 - ease_io(ramp(t, 0.0, 0.55)))
        door = math.radians(86) * (1 - ease_io(ramp(t, 0.05, 0.55)))
        fog = 1 - ramp(t, 0.0, 0.7)
        flash = 0.0
    out["val:key"] = key
    out["val:uplight"] = up
    out["val:win"] = win
    out["val:win_ph"] = tau / 1.5
    out["val:gate"] = G
    out["val:ray_ph"] = tau / 3.0
    out["val:fog"] = fog
    out["val:fog_ph"] = tau / 3.0
    out["val:flash"] = flash
    out["obj:door_l:rot"] = (0.0, 0.0, -door)
    out["obj:door_r:rot"] = (0.0, 0.0, door)


def camera(clip, t, out):
    lx, ly, lz = P.CAM["loc"]
    tau = per(clip, t)
    bob = 0.05 * math.sin(TAU * tau / 3.0)
    if clip == "intro":
        lens = lerp(P.LENS_FROM, P.CAM["lens"], ease_io(ramp(t, 1.5, 6.4)))
        shake = (0.07 * pulse(t, 3.08, 0.12) * math.sin(TAU * 23 * t)
                 + 0.05 * pulse(t, 4.42, 0.1) * math.sin(TAU * 19 * t)
                 + 0.03 * (1 - ramp(t, 1.5, 2.8)) * (t > 1.45) * math.sin(TAU * 15 * t))
        bob *= ramp(t, 4.5, 6.4)
    else:
        lens = P.CAM["lens"]
        shake = 0.0
    yaw = orbit_yaw(clip, t)
    out["cam:lens"] = lens
    out["val:cam_yaw"] = yaw
    out["obj:cam:loc"] = orbit((lx + shake * 0.6, ly, lz + bob + shake), yaw)
    out["obj:cam:rot"] = (math.radians(90 + P.CAM["pitch_deg"]), 0.0, yaw)


def pipo(clip, t, out):
    """城主ピポ。露台で旗を振る（竿を手のまわりに振り、布に波を走らせる）。あやとが降り立つと、cheer の絵で跳ねる"""
    tau = per(clip, t)
    rock = math.radians(4) * math.sin(TAU * tau / 0.75)
    hop = 0.10 * abs(math.sin(TAU * tau / 0.75))
    swing = 0.24 * math.sin(TAU * tau / 0.75 - 0.6)
    wave_a = 1.0
    cheer = 0.0
    cheer_dz = 0.0
    csx = csy = 1.0
    if clip == "intro":
        x = ramp(t, 3.3, 3.75)
        dz = lerp(-1.7, 0.0, back_out(x, 1.6))
        s = lerp(0.85, 1.0, ease_out(x))
        op = 1.0 if t >= 3.3 else 0.0
        env = ramp(t, 3.6, 4.0)
        rock *= env
        hop *= env
        swing *= env
        wave_a = ramp(t, 3.5, 3.9)
        # あやとが降り立った（4.34 秒）すぐあと、両手を上げて跳ねる（cheer の絵）
        if 4.40 <= t < 4.95:
            cheer = 1.0
            u = ramp(t, 4.40, 4.95)
            cheer_dz = 0.55 * math.sin(math.pi * u)
            # 跳ぶときに伸び、降りるときにつぶれる
            csy = 1 + 0.08 * math.cos(math.pi * u) * (u < 0.85) - 0.10 * pulse(t, 4.93, 0.025)
            csx = 1 / csy
        # キャラ絵が門の光から出る前に、塔の屋根へ跳び乗って、満月の前で万歳する。名前の札が上から降りてくる
        # あいだ（5.4〜6.0 秒。読み込みで動画が遅れると札は早めに出る）、顔の下の端を箱の上 10.5% より上に保ち、
        # 6.0 秒に露台へ跳び戻る（2026-11-04。札がピポの顔にも掛かった）
        elif 4.95 <= t < 6.32:
            cheer = 1.0
            up = ease_out(ramp(t, 5.0, 5.22), 2.2) + 0.06 * math.sin(math.pi * ramp(t, 5.0, 5.22)) ** 2
            down = ease_in(ramp(t, 6.0, 6.28), 2.0)
            bounce = 0.08 * abs(math.sin(TAU * (t - 5.22) / 0.4)) * (5.22 <= t < 6.0)
            cheer_dz = PIPO_PERCH * up * (1 - down) + bounce + 0.5 * math.sin(math.pi * ramp(t, 6.0, 6.28))
            csy = (1 - 0.12 * pulse(t, 4.99, 0.03) + 0.07 * pulse(t, 5.08, 0.05) - 0.08 * pulse(t, 5.23, 0.03)
                   - 0.12 * pulse(t, 6.30, 0.03))
            csx = 1 / csy
    else:
        dz, s, op = 0.0, 1.0, 1.0
    fx, fy, fz = PIPO_FOOT
    yaw = orbit_yaw(clip, t)
    rot = (math.radians(90 + P.CAM["pitch_deg"]), rock, yaw)
    flag_on = op > 0 and cheer == 0.0
    out["obj:pipo:loc"] = (fx, fy, fz + dz + hop)
    out["obj:pipo:rot"] = rot
    out["obj:pipo:scale"] = s if flag_on else HIDE
    out["val:pipo_op"] = op if flag_on else 0.0
    out["obj:pipo_cheer:loc"] = (fx, fy, fz + cheer_dz)
    out["obj:pipo_cheer:rot"] = (rot[0], 0.0, yaw)
    out["obj:pipo_cheer:scale"] = (csx, csy, 1.0) if cheer else HIDE
    out["val:pipo_cheer_op"] = cheer
    for nm in ("pipo", "pipo_cheer"):
        out[f"obj:{nm}_shadow:loc"] = vadd(out[f"obj:{nm}:loc"], PIPO_SHADOW_OFF)
        out[f"obj:{nm}_shadow:rot"] = out[f"obj:{nm}:rot"]
        out[f"obj:{nm}_shadow:scale"] = out[f"obj:{nm}:scale"]
    out["key:pipo:swing"] = swing
    # 布の波は 0.5 秒で1回（3.0 秒に6回。輪がつながる）
    w = TAU * tau / 0.5
    out["key:pipo:wave_s"] = wave_a * math.cos(w)
    out["key:pipo:wave_c"] = wave_a * math.sin(w)


# あやとの足（板の下の端）から板の原点まで（m・ふつうの大きさ）。降り立つときのつぶれは、足の所を動かさずに縦を縮める
def _ayato_foot(name):
    return ayato_plane(name)[3]


# 接地の影を置く奥行き（左の四角い塔の前の面・小塔のあたり。カメラから前へ m）と、画面の高さ（小塔の頂。px）
SHADOW_DEPTH = 32.6
SHADOW_Y = 318
# 札が降りてくるあいだ、あやとが浮かび上がる高さ（px）
AYATO_LIFT = 40
# 顔の四角（絵の px）。あやとは poses.json の face、ピポは目と口を囲む（2026-11-04 に測った）
PIPO_FACE = {"pipo": (30, 35, 112, 92), "pipo_cheer": (53, 40, 135, 85)}
# 顔の下の端の線（箱の高さに対する割合）。いつも 15% より上・札が降りてくるあいだは 10.5% より上
FACE_LINE = 0.15
FACE_LINE_PLATE = 0.105
PLATE_WINDOW = (5.4, 6.0)


def ayato(clip, t, out):
    """伯爵あやと。飛んできて（rise。マントの裾がなびく）、塔の上に降り立つ（spread に替わってマントがばさっと開き、
    沈んでつぶれ、伸びて戻る）。滞在中はマントが風にはためき、ゆっくり浮き沈みする"""
    tau = per(clip, t)
    bob = (0.0, 0.0, 0.10 * math.sin(TAU * tau / 3.0))
    sway = math.radians(1.6) * math.sin(TAU * tau / 3.0 + 1.0)
    # マントのはためき（3.0 秒に2回。輪がつながる）
    flap_a = 0.35
    flut_a = 0.0
    open_v = 0.0
    sq_x = sq_y = 1.0
    if clip == "intro":
        if t < 4.30:
            # 左上の外から、降り立つ所の少し上へ（最後は下へ降りてくる）
            x = ramp(t, 3.45, 4.30)
            hx, hy = AYATO_HOVER[0], AYATO_HOVER[1] - 46
            sxy = (lerp(AYATO_FROM[0], hx, ease_out(x)), lerp(AYATO_FROM[1], hy, ease_out(x, 1.7)))
            tilt = math.radians(-14) * (1 - ease_out(x))
            s = lerp(0.88, 1.0, ease_out(x))
        elif t < 5.6:
            # 降り立つ: 46px 上から、8px 沈んで（つぶれ）、戻る（伸び）
            u = ramp(t, 4.30, 4.46)
            v = ramp(t, 4.46, 4.80)
            dy = lerp(-46, 8, ease_in(u, 1.6)) if t < 4.46 else lerp(8, 0, ease_io(v))
            sxy = (AYATO_HOVER[0], AYATO_HOVER[1] + dy)
            tilt = 0.0
            s = 1.0
        else:
            x = ease_io(ramp(t, 5.6, 6.6))
            sxy = (lerp(AYATO_HOVER[0], AYATO_STAY[0], x), lerp(AYATO_HOVER[1], AYATO_STAY[1], x))
            tilt = 0.0
            s = lerp(1.0, 0.9, x)
        # キャラ絵が門の光から出る前に、杯を掲げて浮かび上がる。名前の札が上から降りてくるあいだ（5.4〜6.0 秒）、
        # 顔の下の端を箱の上 10.5% より上に保つ（札の上の端は、長い名前・3行で 11.5% から降りてくる）
        sxy = (sxy[0], sxy[1] - AYATO_LIFT * (ease_io(ramp(t, 5.0, 5.35)) - ease_io(ramp(t, 6.0, 6.6))))
        # つぶれ（足が着いた 4.46 秒）と、伸び（跳ね返り 4.62 秒）
        sq_y = 1 - 0.08 * pulse(t, 4.47, 0.045) + 0.05 * pulse(t, 4.63, 0.06)
        sq_x = 1 + 0.06 * pulse(t, 4.47, 0.045) - 0.03 * pulse(t, 4.63, 0.06)
        env = ramp(t, 4.4, 5.0)
        p = vadd(screen(sxy[0], sxy[1], AYATO_DEPTH), tuple(v_ * env for v_ in bob))
        rot_y = tilt + sway * env
        rise_op = 1.0 if 3.45 <= t < 4.36 else 0.0
        spread_op = 1.0 if t >= 4.34 else 0.0
        if 4.34 <= t < 4.36:
            rise_op, spread_op = 0.5, 0.5
        # 飛んでくるあいだは裾が速くなびき、降り立つとマントがばさっと開いて、大きくはためいてから落ち着く
        flut_a = 1.0 * (3.45 <= t < 4.36)
        open_v = ease_out(ramp(t, 4.30, 4.42)) * (1 - ease_io(ramp(t, 4.42, 5.2))) - 0.18 * pulse(t, 4.85, 0.12)
        flap_a = 0.35 + 0.9 * (1 - ease_io(ramp(t, 4.34, 5.9))) ** 2 * (t >= 4.34)
    elif clip == "stay":
        p = vadd(screen(AYATO_STAY[0], AYATO_STAY[1], AYATO_DEPTH), bob)
        rot_y, s = sway, 0.9
        rise_op, spread_op = 0.0, 1.0
    else:
        x = ease_in(ramp(t, 0.0, 0.7), 2.0)
        sxy = (lerp(AYATO_STAY[0], -260, x), lerp(AYATO_STAY[1], -180, x))
        p = vadd(screen(sxy[0], sxy[1], AYATO_DEPTH), bob)
        rot_y = sway + math.radians(-18) * x
        s = lerp(0.9, 0.62, x)
        rise_op = 0.0
        spread_op = 1 - ramp(t, 0.55, 0.7)
        # 飛び去るときは裾が大きくなびく
        flap_a = 0.35 + 0.6 * x
    yaw = orbit_yaw(clip, t)
    rot = (math.radians(90 + P.CAM["pitch_deg"]), rot_y, yaw)
    # 縦を縮めても足の所が動かないよう、板の上向き（ほぼ +z）に沿って下げる
    a = math.radians(P.CAM["pitch_deg"])
    up = (0.0, -math.sin(a), math.cos(a))
    for name, op in (("ayato_rise", rise_op), ("ayato_spread", spread_op)):
        drop = (1 - sq_y) * _ayato_foot(name) * s
        out[f"obj:{name}:loc"] = tuple(p[i] - up[i] * drop for i in range(3))
        out[f"obj:{name}:rot"] = rot
        out[f"obj:{name}:scale"] = (s * sq_x, s * sq_y, s) if op > 0 else HIDE
        out[f"val:{name}_op"] = op
    out["obj:ayato_flash:loc"] = vadd(p, (0.4, 2.0, 0.6))
    # 接地の影: 足が画面で乗っている左の四角い塔の胸壁に、薄い楕円を置く（あやとは城より 16m 手前の空に浮いていて、
    # 本物の影の落ちる面が無い。画面で「塔の上に立つ」を見せるための影）。降り立つ瞬間に濃くなり、飛び去ると消える
    sp = "ayato_spread"
    w_m, _, _, oz_m = ayato_plane(sp)
    feet = tuple(p[i] - up[i] * oz_m * s for i in range(3))
    fsx, fsy, fd = P.project(feet)
    sh_op = 0.0
    if clip == "intro":
        sh_op = 0.75 * ease_out(ramp(t, 4.40, 4.48)) + 0.2 * pulse(t, 4.47, 0.05)
    elif clip == "stay":
        sh_op = 0.75
    else:
        sh_op = 0.75 * (1 - ramp(t, 0.0, 0.3))
    k = SHADOW_DEPTH / fd
    # 光は左上から来るので、影は足から少し右へ。幅は足の幅ほど（塔の左の縁から空へはみ出さない）
    # 影は小塔の頂（画面の y SHADOW_Y）に置き、足の裏（板の下の端より 12px 上）が離れるほど薄く・小さくする
    gap = max(0.0, SHADOW_Y - (fsy - 12))
    near = clamp(1 - gap / 55)
    sh_op *= 0.25 + 0.75 * near
    out["obj:ayato_shadow:loc"] = screen(fsx + 10, SHADOW_Y, SHADOW_DEPTH)
    out["obj:ayato_shadow:rot"] = (math.radians(90 + P.CAM["pitch_deg"]), 0.0, yaw)
    sw = 0.46 * w_m * s * sq_x * k * (0.7 + 0.3 * near)
    out["obj:ayato_shadow:scale"] = (sw, 0.085 * w_m * s * k, 1.0) if sh_op > 0 else HIDE
    out["val:ayato_shadow_op"] = sh_op
    w = TAU * tau / 1.5
    out["key:ayato_spread:flap_s"] = flap_a * math.cos(w)
    out["key:ayato_spread:flap_c"] = flap_a * math.sin(w)
    out["key:ayato_spread:open"] = open_v
    wf = TAU * 3.0 * t
    out["key:ayato_rise:flut_s"] = flut_a * math.cos(wf)
    out["key:ayato_rise:flut_c"] = flut_a * math.sin(wf)


def _mote_stay_pos(m, ph):
    """滞在の粒の、周期の中の位置（ph は 0〜1。締めでは 1 を越えてそのまま舞い降り続ける）"""
    sy = m["sy0"] + m["fall"] * ph
    sx = m["sx"] + m["drift"] * math.sin(TAU * ph + m["rot0"][2])
    return screen(sx, sy, m["depth"])


def _mote_stay_env(m, ph):
    """またたき（周期の頭と尻で 0。1周に整数回またたくので、輪がつながる）"""
    return math.sin(math.pi * ph) ** 1.3 * (0.7 + 0.3 * math.sin(TAU * m["turns"][1] * ph + m["rot0"][1]))


def motes(clip, t, out):
    """月の光の粒（雨・滞在）と、門の火の粉。どれも光るだけの粒で、お金に見える形を持たない"""
    tau = per(clip, t)
    # ---- 月の光の粒の雨: 群れが満月を横切るころ、月のあたりで生まれて、またたきながらゆっくり舞い降りる（intro だけ）
    for m in MOTE_RAIN:
        n = m["name"]
        u = (t - m["tb"]) / m["life"] if clip == "intro" else -1.0
        if not 0.0 <= u <= 1.0:
            out[f"obj:{n}:loc"] = screen(m["sx"], m["sy0"], m["depth"])
            out[f"obj:{n}:scale"] = HIDE
            continue
        sy = m["sy0"] + m["fall"] * (0.55 * u + 0.45 * u * u)
        sx = m["sx"] + m["drift"] * u + 14 * math.sin(TAU * (0.8 * u + m["axis"][0]))
        # 生まれる瞬間にぽっと光り（1.6 倍）、またたいて、終わりの 4 割で消えていく
        bloom = ease_out(ramp(u, 0.0, 0.07)) * (1 + 0.6 * pulse(u, 0.07, 0.05))
        tw = 0.72 + 0.28 * math.sin(TAU * (m["tw"] * u * m["life"] + m["axis"][1]))
        k = m["size"] * bloom * tw * (1 - ease_in(ramp(u, 0.6, 1.0), 2.0))
        out[f"obj:{n}:loc"] = screen(sx, sy, m["depth"])
        out[f"obj:{n}:scale"] = k if k > 1e-3 else HIDE
    # ---- 門の火の粉: 扉が開く瞬間に噴き上がり、空気に速さを奪われてふわりと漂い、昇りながら消える（地面に落ちない）
    start = (0.0, P.GATE["y"] - 0.6, 2.0)
    for e in EMBERS:
        n = e["name"]
        life = 1.2 + 0.5 * abs(e["spin"][0]) / 14
        dt = t - e["ts"] if clip == "intro" else -1.0
        if not 0.0 <= dt <= life:
            out[f"obj:{n}:loc"] = start
            out[f"obj:{n}:scale"] = HIDE
            continue
        kd = 1.7
        f = (1 - math.exp(-kd * dt)) / kd
        vx, vy, vz = e["v"]
        out[f"obj:{n}:loc"] = (start[0] + vx * f, start[1] + vy * f, start[2] + vz * f + 0.6 * dt * dt)
        u = dt / life
        k = (e["size"] * ease_out(ramp(u, 0.0, 0.06)) * (0.75 + 0.25 * math.sin(TAU * abs(e["spin"][1]) / 3 * dt))
             * (1 - ease_in(ramp(u, 0.5, 1.0), 1.6)))
        out[f"obj:{n}:scale"] = k if k > 1e-3 else HIDE
    # ---- 滞在の粒: 画面じゅうで、またたきながら舞い降りる（3.0 秒 / 1.5 秒の周期）。
    # intro では、雨が降り始めるころ（4.75 秒）から 5.6 秒までに出そろう（7.0 秒で stay の頭と同じ姿）
    fade_in = ease_io(ramp(t, 4.75, 5.6)) if clip == "intro" else 1.0
    for m in MOTE_STAY:
        n = m["name"]
        Pd = m["period"]
        edge = 1.0 / (P.FPS * Pd) + 1e-6
        if clip == "outro":
            # 周期で頭に戻さず、城が貯金箱へ縮むのといっしょに、渦を巻いて城の窓へ吸い込まれる（光が城に収まる）
            ph = m["phase"] + t / Pd
            k = ease_in(ramp(t, 0.05 + m["sink_delay"], 0.85 + m["sink_delay"] * 0.5), 2.4)
            p0 = _mote_stay_pos(m, ph)
            sw = 1.6 * (1 - k) * k
            p = vlerp(p0, LIGHT_SINK, k)
            p = (p[0] + sw * math.cos(TAU * (k * 1.5 + m["phase"])), p[1], p[2] + sw * math.sin(TAU * (k * 1.5 + m["phase"])))
            # 頭は stay の 0 秒と同じ見え方。吸い込まれ始めたら、またたきをやめて光りきる
            vis = (edge < m["phase"] and ph < 1 - edge) or k > 0.02
            s = m["size"] * max(_mote_stay_env(m, frac(ph)), ease_io(k)) * (1 - ramp(k, 0.82, 1.0)) if vis else 0.0
        else:
            ph = frac(tau / Pd + m["phase"])
            p = _mote_stay_pos(m, ph)
            # 頭に戻るコマの前後は消す（ぶれで縦の筋が出ないように）
            vis = edge < ph < 1 - edge
            s = m["size"] * _mote_stay_env(m, ph) * fade_in if vis else 0.0
        out[f"obj:{n}:loc"] = p
        out[f"obj:{n}:scale"] = s if s > 1e-3 else HIDE


def _bat_heading(p0, p1):
    dx, dy, dz = (p1[i] - p0[i] for i in range(3))
    yaw = math.atan2(-dx, dy)  # 体の前（+y）を進む向きへ
    pitch = math.atan2(dz, math.hypot(dx, dy))
    return pitch, yaw


def _bat_omen_pos(b, t, base):
    a = b["a0"] + TAU * b["w"] * 1.1 * t
    grow = ease_out(ramp(t, b["t0"], b["t0"] + 0.45))
    away = ease_in(ramp(t, 1.22, 1.62), 2.0)
    r = b["r"] * (0.3 + 0.7 * grow) * (1 + 3.5 * away)
    return (base[0] + r * math.cos(a), base[1] + 0.6 * r * math.sin(a), base[2] - 1.0 + b["h"] * grow + 4.0 * away)


def _bat_castle_pos(b, clip, t):
    tau = per(clip, t)
    a = b["a0"] + TAU * b["k"] * tau / STAY
    r = b["r"]
    z = b["z"] + b["bob"] * math.sin(TAU * tau / STAY * 2 + b["a0"])
    if clip == "intro":
        g = ease_out(ramp(t, b["t0"], b["t0"] + 0.9), 2.2)
        r = lerp(0.6, r, g)
        z = lerp(B + 17.5, z, g)
    elif clip == "outro":
        x = ease_in(ramp(t, 0.0, 0.9), 2.0)
        r *= 1 + 2.5 * x
        z += 5.0 * x
    return (TOWER[0] + r * math.cos(a), TOWER[1] + r * math.sin(a), z)


def _bat_near_pos(b, clip, t):
    tau = per(clip, t) % STAY
    u = (tau - b["start"]) % STAY / b["dur"]
    vis = 0.0 < u < 1.0
    uc = clamp(u)
    x0, x1 = (-160, 880) if b["dirx"] > 0 else (880, -160)
    sx = lerp(x0, x1, uc)
    sy = lerp(b["y0"], b["y1"], uc) - 60 * math.sin(math.pi * uc)
    return screen(sx, sy, b["depth"]), vis


# ---- こうもりの群れ（伯爵がマントを広げると、マントの陰から満月へ飛び立つ）
# あやとのすぐ後ろ（奥行き +0.8m）から出るので、あやとの顔の前は通らない。ピポの顔の前も通さない
# （顔の四角に掛かる所では、ピポより奥＝塔の陰に居る。並びを引くときに当てて、当たったら引き直す）
SWARM_DEPTH0 = AYATO_DEPTH + 0.8
RW = random.Random(7_0011)  # 足した物は別の種で引く（R の並びを崩さない）


def _bat_swarm_pos(b, clip, t):
    """群れの1匹の (世界の位置, 大きさ, 画面の x, 画面の y, 奥行き)"""
    if clip != "intro":
        return screen(b["ex"], b["ey"], b["d1"]), 0.0, b["ex"], b["ey"], b["d1"]
    u = ramp(t, b["t0"], b["t0"] + b["dur"])
    e = ease_out(u, 1.7)
    # 2次のベジェ。なかほどを持ち上げて、弧を描いて昇る
    x0, y0, x1, y1 = b["x0"], b["y0"], b["ex"], b["ey"]
    dx, dy = x1 - x0, y1 - y0
    ln = math.hypot(dx, dy) or 1.0
    cx = (x0 + x1) / 2 - dy / ln * b["bend"]
    cy = (y0 + y1) / 2 + dx / ln * b["bend"] - b["lift"]
    sx = (1 - e) ** 2 * x0 + 2 * (1 - e) * e * cx + e * e * x1
    sy = (1 - e) ** 2 * y0 + 2 * (1 - e) * e * cy + e * e * y1
    d = lerp(SWARM_DEPTH0, b["d1"], ease_in(u, 1.5))
    # 遠ざかるほど小さく写るが、物の大きさも少し上げて、遠くの群れが点にならないように
    s = b["size"] * (d / SWARM_DEPTH0) ** 0.5 * ease_out(ramp(u, 0.0, 0.1)) * (1 - ease_in(ramp(u, 0.8, 1.0)))
    if not 0.0 < u < 1.0:
        s = 0.0
    return screen(sx, sy, d), s, sx, sy, d


def _pipo_face_from(p):
    """振付けの値（カメラとピポがあればよい）から、ピポの顔の四角（画面の px）"""
    name = "pipo_cheer" if p["val:pipo_cheer_op"] > 0 else "pipo"
    if p[f"val:{name}_op"] <= 0:
        return None
    sv = p[f"obj:{name}:scale"]
    sv = sv if isinstance(sv, tuple) else (sv, sv, sv)
    foot = p[f"obj:{name}:loc"]
    fsx, fsy, depth = P.project(foot)
    k0 = (p["cam:lens"] / 12.0) * (P.H / 2) / depth * PIPO_M_PER_PX
    fx, fy = PIPO_BOARDS[name]["foot"]
    x0, y0, x1, y1 = PIPO_FACE[name]
    return (fsx + (x0 - fx) * k0 * sv[0], fsy + (y0 - fy) * k0 * sv[1], fsx + (x1 - fx) * k0 * sv[0], fsy + (y1 - fy) * k0 * sv[1])


def _pipo_face_now(t):
    """intro の t 秒のピポの顔の四角（画面の px）と奥行き。振付けの全部は回さず、カメラとピポだけ"""
    p = {}
    camera("intro", t, p)
    pipo("intro", t, p)
    box = _pipo_face_from(p)
    return box, P.project(PIPO_FOOT)[2]


BAT_SPAN_M = 0.92  # 羽を広げた幅（castle_t7.py の bat_meshes）


def swarm_hits(b, pipo_at):
    """群れの1匹が、ピポの顔の前を横切るコマ（intro のコマの番号）。顔の四角を、こうもりの半分の幅だけ広げて見る"""
    hits = []
    for i in range(int(b["t0"] * P.FPS), int((b["t0"] + b["dur"]) * P.FPS) + 2):
        t = i / P.FPS
        _, s, sx, sy, d = _bat_swarm_pos(b, "intro", t)
        if s <= 1e-3 or i not in pipo_at:
            continue
        box, pd = pipo_at[i]
        if box is None or d >= pd + 0.5:
            continue
        r = 0.5 * BAT_SPAN_M * s * (P.CAM["lens"] / 12.0) * (P.H / 2) / d
        if box[0] - r < sx < box[2] + r and box[1] - r < sy < box[3] + r:
            hits.append(i)
    return hits


def _swarm_spec(n=36):
    pipo_at = {i: _pipo_face_now(i / P.FPS) for i in range(int(4.3 * P.FPS), int(6.2 * P.FPS))}
    out = []
    redraw = 0
    for i in range(n):
        while True:
            r = RW.random()
            if r < 0.6:
                # 満月の前を横切って、右の外へ（月の上の半分を、影絵になって渡る）
                ex, ey, d1, dur, lift = RW.uniform(760, 900), RW.uniform(-60, 170), RW.uniform(24, 40), RW.uniform(0.9, 1.2), RW.uniform(20, 90)
            elif r < 0.8:
                # 満月へ向かって、奥へ小さく消える（塔の陰を通る）
                ex, ey, d1, dur, lift = RW.uniform(400, 660), RW.uniform(70, 300), RW.uniform(70, 130), RW.uniform(0.8, 1.05), RW.uniform(10, 60)
            else:
                # 左上の外へ
                ex, ey, d1, dur, lift = RW.uniform(-170, 120), RW.uniform(-190, -40), RW.uniform(22, 34), RW.uniform(0.75, 0.95), RW.uniform(20, 80)
            b = dict(name=f"bat_w{i:02d}", x0=RW.uniform(130, 250), y0=RW.uniform(150, 290), ex=ex, ey=ey, d1=d1,
                     t0=4.38 + 0.24 * i / n + RW.uniform(0.0, 0.05), dur=dur,
                     bend=RW.uniform(-50, 50), lift=lift, flap=RW.choice([6, 7]), ph=RW.random(),
                     size=RW.uniform(1.0, 1.45))
            if not swarm_hits(b, pipo_at):
                break
            redraw += 1
        out.append(b)
    return out, redraw


BAT_SWARM, SWARM_REDRAWN = _swarm_spec()
BATS = BATS + BAT_SWARM


def bats(clip, t, out):
    tau = per(clip, t)
    sbase = screen(BANK_X + BANK_W / 2, BANK_Y + BANK_H * 0.35, STICKER_DEPTH - 1.0, P.LENS_FROM)
    dt = 1.0 / 120
    for b in BAT_OMEN:
        n = b["name"]
        if clip == "intro" and t < 1.62:
            p = _bat_omen_pos(b, t, sbase)
            q = _bat_omen_pos(b, t + dt, sbase)
            s = b["size"] * ease_out(ramp(t, b["t0"], b["t0"] + 0.25)) * (1 - ramp(t, 1.45, 1.62))
        else:
            p = q = _bat_omen_pos(b, 1.62, sbase)
            s = 0.0
        pitch, yaw = _bat_heading(p, q)
        out[f"obj:{n}:loc"] = p
        out[f"obj:{n}:rot"] = (pitch, 0.0, yaw)
        out[f"obj:{n}:scale"] = s if s > 1e-3 else HIDE
        out[f"val:{n}_flap"] = math.sin(TAU * (b["flap"] * t + b["ph"]))
    for b in BAT_CASTLE:
        n = b["name"]
        p = _bat_castle_pos(b, clip, t)
        q = _bat_castle_pos(b, clip, t + dt)
        if clip == "intro":
            s = b["size"] * ease_out(ramp(t, b["t0"], b["t0"] + 0.3))
        elif clip == "outro":
            s = b["size"] * (1 - ramp(t, 0.55, 0.9))
        else:
            s = b["size"]
        pitch, yaw = _bat_heading(p, q)
        roll = -0.5 * math.copysign(1, b["k"])
        out[f"obj:{n}:loc"] = p
        out[f"obj:{n}:rot"] = (pitch, roll, yaw)
        out[f"obj:{n}:scale"] = s if s > 1e-3 else HIDE
        out[f"val:{n}_flap"] = math.sin(TAU * (b["flap"] * tau + b["ph"]))
    for b in BAT_NEAR:
        n = b["name"]
        p, vis = _bat_near_pos(b, clip, t)
        q, _ = _bat_near_pos(b, clip, t + dt)
        if clip == "intro":
            vis = vis and (t - ((tau % STAY - b["start"]) % STAY)) >= 3.0
        elif clip == "outro":
            vis = vis and t < 0.6
        pitch, yaw = _bat_heading(p, q)
        out[f"obj:{n}:loc"] = p
        out[f"obj:{n}:rot"] = (pitch, 0.0, yaw)
        out[f"obj:{n}:scale"] = b["size"] if vis else HIDE
        out[f"val:{n}_flap"] = math.sin(TAU * (b["flap"] * tau + b["ph"]))
    for b in BAT_SWARM:
        n = b["name"]
        p, s, _, _, _ = _bat_swarm_pos(b, clip, t)
        q = _bat_swarm_pos(b, clip, t + dt)[0]
        pitch, yaw = _bat_heading(p, q)
        out[f"obj:{n}:loc"] = p
        # 飛び立つ向きへ少し体を傾ける
        out[f"obj:{n}:rot"] = (pitch, 0.35 * math.copysign(1, b["bend"]), yaw)
        out[f"obj:{n}:scale"] = s if s > 1e-3 else HIDE
        # 羽ばたきは整数の Hz × 3.0 秒（輪がつながる）。9〜11 Hz だと1コマに羽の向きが大きく変わり、
        # 試しの絵で紫のにじみに見えた（run 41951972137）。お城のこうもりと同じ 6〜7 Hz
        out[f"val:{n}_flap"] = math.sin(TAU * (b["flap"] * tau + b["ph"]))


def leaves(clip, t, out):
    tau = per(clip, t)
    Y0, Y1 = -100.0, 1380.0
    for lf in LEAVES:
        n = lf["name"]
        Pd = lf["period"]
        ph = frac(tau / Pd + lf["phase"])
        sy = Y0 + (Y1 - Y0) * ph
        sx = lf["sx"] + lf["sway"] * math.sin(TAU * 2 * ph + lf["phase"] * TAU)
        p = screen(sx, sy, lf["depth"])
        edge = 1.0 / (P.FPS * Pd) + 1e-6
        vis = edge < ph < 1 - edge
        if clip == "intro":
            vis = vis and (t - ph * Pd) >= 2.0
        elif clip == "outro":
            vis = vis and (ph + t / Pd) < math.floor(tau / Pd + lf["phase"]) + 1 and t < 1.2
        a = TAU * tau / STAY
        out[f"obj:{n}:loc"] = p
        out[f"obj:{n}:rot"] = tuple(lf["rot0"][i] + a * lf["turns"][i] for i in range(3))
        out[f"obj:{n}:scale"] = lf["size"] if vis else HIDE


def sparks(clip, t, out):
    tau = per(clip, t)
    on_gate = {"intro": ramp(t, 3.0, 3.4), "stay": 1.0, "outro": 1 - ramp(t, 0.0, 0.5)}[clip]
    for s in SPK_GATE:
        n = s["name"]
        Pd = s["period"]
        ph = frac(tau / Pd + s["phase"])
        tw = math.sin(math.pi * ph) ** 2
        x, y, z = s["p"]
        out[f"obj:{n}:loc"] = (x + 0.3 * math.sin(TAU * ph + x), y, z + s["rise"] * ph)
        k = s["size"] * tw * on_gate
        out[f"obj:{n}:scale"] = k if k > 1e-3 else HIDE
    # マントが開いた瞬間（あやとの後ろ。世界の座標）
    pa = screen(AYATO_HOVER[0], AYATO_HOVER[1], AYATO_DEPTH + 0.6)
    for s in SPK_CAPE:
        n = s["name"]
        if clip == "intro":
            u = ramp(t, 4.38 + s["delay"], 5.25 + s["delay"])
            d = s["dist"] * ease_out(u, 2.5)
            k = s["size"] * (1 - u) * (u > 0)
        else:
            d, k = s["dist"], 0.0
        out[f"obj:{n}:loc"] = (pa[0] + d * math.cos(s["a"]), pa[1], pa[2] + d * math.sin(s["a"]))
        out[f"obj:{n}:scale"] = k if k > 1e-3 else HIDE
    on_front = {"intro": ramp(t, 3.0, 3.6), "stay": 1.0, "outro": 1 - ramp(t, 0.2, 0.8)}[clip]
    for s in SPK_FRONT:
        n = s["name"]
        Pd = s["period"]
        ph = frac(tau / Pd + s["phase"])
        tw = math.sin(math.pi * ph) ** 2
        # 前の閃きは、画面の上で顔の場所（キャラ絵）を避けて置いてある。カメラが回り込んでもその場所を保つよう、
        # カメラといっしょに回す（2026-11-04 の final で、回り込みのあいだ顔の穴に透明 0.051 が漏れた）
        out[f"obj:{n}:loc"] = orbit(screen(s["sx"] + 12 * math.sin(TAU * ph), s["sy"] - s["rise"] * ph, s["depth"]),
                                    orbit_yaw(clip, t))
        k = s["size"] * tw * on_front
        out[f"obj:{n}:scale"] = k if k > 1e-3 else HIDE
    gx, gy = 360.0, 880.0
    for s in SPK_BURST:
        n = s["name"]
        if clip == "intro":
            u = ramp(t, REVEAL - 0.05 + s["delay"], REVEAL + 0.85 + s["delay"])
            d = s["dist"] * ease_out(u, 2.2)
            k = s["size"] * math.sin(math.pi * u) ** 0.7 * (u > 0) * (u < 1)
        else:
            d, k = s["dist"], 0.0
        out[f"obj:{n}:loc"] = screen(gx + d * math.cos(s["a"]), gy + d * math.sin(s["a"]), s["depth"])
        out[f"obj:{n}:scale"] = k if k > 1e-3 else HIDE
    bx, by = BANK_X + BANK_W * 0.5, BANK_Y + BANK_H * 0.45
    for s in SPK_BANK:
        n = s["name"]
        if clip == "outro":
            u = ramp(t, 0.88 + s["delay"], 1.3 + s["delay"])
            d = s["dist"] * ease_out(u, 2.0)
            k = s["size"] * math.sin(math.pi * u) * (u > 0) * (u < 1)
        else:
            d, k = 0.0, 0.0
        out[f"obj:{n}:loc"] = screen(bx + d * math.cos(s["a"]), by + d * math.sin(s["a"]), 18.0)
        out[f"obj:{n}:scale"] = k if k > 1e-3 else HIDE


def sway(clip, t, out):
    """木の揺れ（3.0 秒で1周）"""
    tau = per(clip, t)
    for i in range(8):
        out[f"obj:tree{i}_crown:rot"] = (0.012 * math.sin(TAU * tau / STAY + i), 0.0, 0.015 * math.sin(TAU * tau / STAY * 2 + i * 0.7))


PARTS = (castle_root, sticker, sky, castle_lights, camera, pipo, ayato, motes, bats, leaves, sparks, sway)


def pose(clip, t):
    out = {}
    for f in PARTS:
        f(clip, t, out)
    return out


def ayato_face_box(clip, t):
    """そのコマの、あやとの顔の四角（画面の px）。投げた人のキャラ絵の字と重ならないかを数えるため"""
    p = pose(clip, t)
    name = "ayato_spread" if p["val:ayato_spread_op"] >= 0.5 else "ayato_rise"
    if p[f"val:{name}_op"] <= 0:
        return None
    loc = p[f"obj:{name}:loc"]
    s = p[f"obj:{name}:scale"]
    s = s if isinstance(s, tuple) else (s, s, s)
    sx, sy, depth = P.project(loc)
    lens = p["cam:lens"]
    k0 = (lens / 12.0) * (P.H / 2) / depth * AYATO_M_PER_PX
    kx, ky = k0 * s[0], k0 * s[1]
    # 縦と横の大きさは別（降り立つときのつぶれ・伸び）
    # 顔の四角は spread の絵の座標（rise は顔の真ん中をそろえてある）
    fx0, fy0, fx1, fy1 = (463, 129, 802, 421)
    cx, cy = 619.5, 591.5
    # 画面の (sx, sy) は板の真ん中（project は lens を CAM のまま。ずれは小さいので lens の比で直す）
    zoom = lens / P.CAM["lens"]
    sx = P.W / 2 + (sx - P.W / 2) * zoom
    sy = P.H / 2 + (sy - P.H / 2 - P.CAM["shift_y"] * P.H) * zoom + P.CAM["shift_y"] * P.H
    return (sx + (fx0 - cx) * kx, sy + (fy0 - cy) * ky, sx + (fx1 - cx) * kx, sy + (fy1 - cy) * ky)


def pipo_face_box(clip, t):
    """そのコマの、ピポの顔の四角（画面の px）。見えている方の板（旗 / cheer）で"""
    return _pipo_face_from(pose(clip, t))


def face_lines():
    """intro・stay で、あやととピポの顔の下の端（箱の高さに対する割合）がいちばん低い所。全部と、札が降りてくるあいだ"""
    worst = {}
    for who, fn in (("あやと", ayato_face_box), ("ピポ", pipo_face_box)):
        allw, plate = (0.0, None), (0.0, None)
        for clip in ("intro", "stay"):
            for i in range(P.CLIPS[clip]):
                t = i / P.FPS
                if clip == "intro" and t < 4.34:
                    continue  # 飛んでくるあいだ・露台に出る前（札はまだ無い）
                b = fn(clip, t)
                if not b:
                    continue
                v = b[3] / P.H
                if v > allw[0]:
                    allw = (v, (clip, i))
                if clip == "intro" and PLATE_WINDOW[0] <= t <= PLATE_WINDOW[1] and v > plate[0]:
                    plate = (v, (clip, i))
        worst[who] = (allw, plate)
    return worst


# ---------------------------------------------------------------- 確かめる（この箱で）
def _hidden(p, name):
    s = p.get(f"obj:{name}:scale")
    if s is None:
        return False
    s = max(s) if isinstance(s, tuple) else s
    return s <= 2e-4


def _diff(a, b):
    """2つの姿のいちばん違う所。両方で消えている物の位置は見ない（見えないので継ぎ目にならない）"""
    worst = (0.0, "")
    for k in a:
        va, vb = a[k], b[k]
        if k.startswith("obj:"):
            name = k.split(":")[1]
            if _hidden(a, name) and _hidden(b, name) and not k.endswith(":scale"):
                continue
        if k.endswith(":rot"):
            d = max(abs((x - y + math.pi) % TAU - math.pi) for x, y in zip(va, vb))
            # こうもりの向きは進む向きから出すので、0.02 rad（1°）まではつながっていると見る
            d = 0.0 if d < 0.02 else d
        elif k.endswith("_ph"):
            # 位相は整数ずれても同じ（材質の側で sin(2π・位相) に使う）
            d = abs((va - vb + 0.5) % 1.0 - 0.5)
        elif isinstance(va, tuple):
            d = max(abs(x - y) for x, y in zip(va, vb))
        else:
            d = abs(va - vb)
        if d > worst[0]:
            worst = (d, k)
    return worst


def check():
    """継ぎ目の確かめ。0 = つながる / 1 = つながらない所が在る"""
    bad = 0
    pairs = [
        ("intro の 7.0 秒 と stay の 0 秒", pose("intro", INTRO), pose("stay", 0.0)),
        ("stay の 3.0 秒 と stay の 0 秒", pose("stay", STAY), pose("stay", 0.0)),
        ("outro の 0 秒 と stay の 0 秒", pose("outro", 0.0), pose("stay", 0.0)),
    ]
    for label, a, b in pairs:
        d, k = _diff(a, b)
        ok = d < 1e-6
        bad += not ok
        print(f"{'OK ' if ok else 'NG '} {label}: いちばん違う所 {d:.2e}（{k}）")
    # outro の最後は、城もあやとも光の粒も消えている
    last = pose("outro", (P.CLIPS["outro"] - 1) / P.FPS)
    root_gone = _hidden(last, "castle_root")
    left = [k for k, v in last.items() if k.endswith(":scale") and (v if not isinstance(v, tuple) else max(v)) > 2e-4
            and not k.startswith("obj:sticker") and not (root_gone and k.split(":")[1] in ROOT_KIDS)]
    ops = {k: v for k, v in last.items() if k.endswith("_op") and v > 1e-3
           and not (root_gone and k in ("val:pipo_op", "val:pipo_cheer_op"))}
    print(f"{'OK ' if not left and not ops else 'NG '} outro の最後のコマに残っている物: {left[:6]} {ops}")
    bad += bool(left or ops)
    # あやとの顔が、投げた人のキャラ絵の字（y 640〜880）とキャラの顔（360,590 r74）に乗らないか
    worst = None
    for clip, n in P.CLIPS.items():
        for i in range(n):
            box = ayato_face_box(clip, i / P.FPS)
            if not box:
                continue
            x0, y0, x1, y1 = box
            if y1 > 640 and y0 < 880 and x1 > 44 and x0 < 676:
                worst = (clip, i, box)
    print(f"{'OK ' if not worst else 'NG '} あやとの顔 × 字の帯: {worst}")
    bad += bool(worst)
    # こうもりの群れが、ピポの顔の前を横切らないか・あやとより手前に出ないか（あやとの後ろから出て、奥へ飛ぶ）
    pipo_at = {i: _pipo_face_now(i / P.FPS) for i in range(P.CLIPS["intro"])}
    hits = [(b["name"], swarm_hits(b, pipo_at)[:3]) for b in BAT_SWARM]
    hits = [h for h in hits if h[1]]
    near = [b["name"] for b in BAT_SWARM
            if min(_bat_swarm_pos(b, "intro", i / P.FPS)[4] for i in range(P.CLIPS["intro"])) < AYATO_DEPTH + 0.5]
    print(f"{'OK ' if not hits and not near else 'NG '} こうもりの群れ {len(BAT_SWARM)} 匹 × ピポの顔: {hits}・"
          f"あやとより手前: {near}（並びを引くときに引き直した {SWARM_REDRAWN} 回）")
    bad += bool(hits or near)
    # 名前の札（上から降りてくる）と、あやと・ピポの顔。ピポは露台で旗を振るあいだ 15% より下に居るので、
    # いつもの線はあやとだけで見る。札が降りてくるあいだは、2人とも 10.5% の線で見る
    for who, ((v_all, at_all), (v_pl, at_pl)) in face_lines().items():
        ok_all = who != "あやと" or v_all <= FACE_LINE
        ok_pl = v_pl <= FACE_LINE_PLATE
        print(f"{'OK ' if ok_all and ok_pl else 'NG '} {who}の顔の下の端: いちばん低い所 {v_all * 100:.1f}%（{at_all}）・"
              f"札が降りてくるあいだ {v_pl * 100:.1f}%（{at_pl}。線 {FACE_LINE_PLATE * 100:.1f}%）")
        bad += not (ok_all and ok_pl)
    return 1 if bad else 0


if __name__ == "__main__":
    if sys.argv[1:] == ["check"]:
        sys.exit(check())
    print(__doc__)
