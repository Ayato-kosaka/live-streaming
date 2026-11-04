"""1万円の段（段7）の振付け。**どの物が、どの秒に、どこに居るか**を1つの関数（`pose`）から出す。

Blender は要らない（素の Python）。`castle_t7.py` がこれを読んで、コマごとの値を Blender のキーにする。
継ぎ目が出ないことは `python3 tools/alert-theme/blender/t7_motion.py check` が確かめる
（intro の 7.0 秒と stay の 0 秒、stay の 3.0 秒と 0 秒、outro の頭と stay の 0 秒が同じ姿か・outro の最後に何も残らないか・
あやとの顔が字の帯に乗らないか）。描くワークフロー（`alert_blender.yml`）が、描く前に毎回回す。

終了コード: 0 = つながる / 1 = つながらない所が在る

## 決まり
- stay の動きは全部 3.0 秒で1周する（`per()`）。金貨・葉・粒は 1.5 / 1.0 秒の周期も使う（3.0 の約数）
- intro の後半は、stay と同じ式に `τ = t - 7.0` を入れて動かす。だから intro の終わりがそのまま stay の頭になる
- 画面の外へ出て頭に戻る物（金貨・葉）は、戻るコマの前後で大きさを 0 にする（動きのぶれで画面を縦に横切る筋が出ないように）
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
# 金貨が吸い込まれる先（貯金箱の城の窓のあたり）
COIN_SINK = screen(BANK_X + BANK_W * 0.5, BANK_Y + BANK_H * 0.45, 22.0)

# あやと（板）。画面のどこに居るか（絵の真ん中）
AYATO_DEPTH = 17.0
AYATO_FROM = (-160, -300)
AYATO_HOVER = (185, 300)
AYATO_STAY = (168, 276)
AYATO_W_PX = 270  # 広げたマントの絵（1239px）の幅が、ふつうの大きさで画面の何 px か
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


# ピポ（城の露台）
PIPO_FOOT = (3.35, -0.05, B + 8.6 + 0.35)
PIPO_H = 3.0

# 高い塔（こうもりの渦の軸）
TOWER = (3.6, 2.4)


def _coin_spec():
    burst = []
    for i in range(150):
        burst.append(dict(
            name=f"coin_b{i:03d}", sx=R.uniform(-30, 750), depth=R.choice([R.uniform(7, 14), R.uniform(12, 32), R.uniform(12, 32)]),
            ts=R.uniform(4.35, 5.05), dur=R.uniform(1.05, 1.6), drift=R.uniform(-60, 60),
            axis=(R.uniform(-1, 1), R.uniform(-1, 1), R.uniform(-1, 1)), spin=R.uniform(2.0, 5.0) * R.choice([-1, 1]),
            rot0=(R.uniform(0, TAU), R.uniform(0, TAU), R.uniform(0, TAU)), size=R.uniform(0.8, 1.2)))
    fountain = []
    for i in range(36):
        fountain.append(dict(
            name=f"coin_f{i:03d}", ts=R.uniform(3.0, 3.5), v=(R.uniform(-5.5, 5.5), R.uniform(-13, -7), R.uniform(8.5, 13.5)),
            spin=(R.uniform(-14, 14), R.uniform(-14, 14), R.uniform(-14, 14)), size=R.uniform(0.85, 1.15)))
    stay = []
    for i in range(64):
        Pd = R.choice([1.5, 1.5, 1.0])
        stay.append(dict(
            name=f"coin_s{i:03d}", sx=R.uniform(-30, 750), depth=R.choice([R.uniform(8, 14), R.uniform(12, 32), R.uniform(14, 32)]),
            period=Pd, phase=R.random(), drift=R.uniform(-40, 40),
            # 3.0 秒で整数回まわる（輪が継ぎ目なくつながる）
            turns=(R.choice([-2, -1, 1, 2]), R.choice([-3, -2, 2, 3]), R.choice([-1, 1])),
            rot0=(R.uniform(0, TAU), R.uniform(0, TAU), R.uniform(0, TAU)), size=R.uniform(0.8, 1.15),
            sink_delay=R.uniform(0.0, 0.18)))
    return burst, fountain, stay


COIN_BURST, COIN_FOUNTAIN, COIN_STAY = _coin_spec()
COINS = COIN_BURST + COIN_FOUNTAIN + COIN_STAY


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
    bank = []  # 前の層: 締めで貯金箱に金貨が入りきったとき
    for i in range(14):
        a = R.uniform(-math.pi, 0)
        bank.append(dict(name=f"spk_k{i:02d}", a=a, dist=R.uniform(60, 150), size=R.uniform(0.6, 1.1), delay=R.uniform(0, 0.08)))
    return gate, cape, front, burst, bank


SPK_GATE, SPK_CAPE, SPK_FRONT, SPK_BURST, SPK_BANK = _spark_spec()
SPARKS_BACK = SPK_GATE + SPK_CAPE
SPARKS_FRONT = SPK_FRONT + SPK_BURST + SPK_BANK

# 城の子（castle_root の座標で動かすもの）
ROOT_KIDS = {b["name"] for b in BAT_CASTLE} | {s["name"] for s in SPK_GATE} | {"pipo"}

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
        mop = 1 - f
        rise = 0.3 * f
    tau = per(clip, t)
    out["val:sky_op"] = op
    out["val:sky_det"] = det
    out["val:sky_ph"] = tau / 1.5
    out["val:moon_op"] = mop
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
    out["cam:lens"] = lens
    out["obj:cam:loc"] = (lx + shake * 0.6, ly, lz + bob + shake)


def pipo(clip, t, out):
    tau = per(clip, t)
    wave = math.radians(7) * math.sin(TAU * tau / 0.75)
    hop = 0.10 * abs(math.sin(TAU * tau / 0.75))
    if clip == "intro":
        x = ramp(t, 3.3, 3.75)
        dz = lerp(-1.7, 0.0, back_out(x, 1.6))
        s = lerp(0.85, 1.0, ease_out(x))
        op = 1.0 if t >= 3.3 else 0.0
        env = ramp(t, 3.6, 4.0)
        wave *= env
        hop *= env
    else:
        dz, s, op = 0.0, 1.0, 1.0
    fx, fy, fz = PIPO_FOOT
    out["obj:pipo:loc"] = (fx, fy, fz + dz + hop)
    out["obj:pipo:rot"] = (math.radians(90 + P.CAM["pitch_deg"]), wave, 0.0)
    out["obj:pipo:scale"] = s if op > 0 else HIDE
    out["val:pipo_op"] = op


def ayato(clip, t, out):
    tau = per(clip, t)
    bob = (0.0, 0.0, 0.10 * math.sin(TAU * tau / 3.0))
    sway = math.radians(1.6) * math.sin(TAU * tau / 3.0 + 1.0)
    if clip == "intro":
        if t < 4.4:
            x = ramp(t, 3.45, 4.3)
            sxy = (lerp(AYATO_FROM[0], AYATO_HOVER[0], ease_out(x)), lerp(AYATO_FROM[1], AYATO_HOVER[1], ease_out(x, 2.4)))
            tilt = math.radians(-14) * (1 - ease_out(x))
            s = lerp(0.88, 1.0, ease_out(x))
        else:
            x = ease_io(ramp(t, 5.6, 6.6))
            sxy = (lerp(AYATO_HOVER[0], AYATO_STAY[0], x), lerp(AYATO_HOVER[1], AYATO_STAY[1], x))
            tilt = 0.0
            s = lerp(1.0, 0.9, x)
        s *= 1 + 0.10 * pulse(t, 4.44, 0.07)
        env = ramp(t, 4.4, 5.0)
        p = vadd(screen(sxy[0], sxy[1], AYATO_DEPTH), tuple(v * env for v in bob))
        rot_y = tilt + sway * env
        rise_op = 1.0 if 3.45 <= t < 4.36 else 0.0
        spread_op = 1.0 if t >= 4.34 else 0.0
        if 4.34 <= t < 4.36:
            rise_op, spread_op = 0.5, 0.5
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
    rot = (math.radians(90 + P.CAM["pitch_deg"]), rot_y, 0.0)
    for name, op in (("ayato_rise", rise_op), ("ayato_spread", spread_op)):
        out[f"obj:{name}:loc"] = p
        out[f"obj:{name}:rot"] = rot
        out[f"obj:{name}:scale"] = s if op > 0 else HIDE
        out[f"val:{name}_op"] = op
    out["obj:ayato_flash:loc"] = vadd(p, (0.4, 2.0, 0.6))


def _fall_pos(sx, sy, depth):
    return screen(sx, sy, depth)


def coins(clip, t, out):
    tau = per(clip, t)
    # 降り始め（-120）から下の外（1400）まで
    Y0, Y1 = -140.0, 1420.0
    for c in COIN_BURST:
        n = c["name"]
        if clip != "intro":
            out[f"obj:{n}:scale"] = HIDE
            out[f"obj:{n}:loc"] = _fall_pos(c["sx"], Y1, c["depth"])
            out[f"obj:{n}:rot"] = c["rot0"]
            continue
        u = (t - c["ts"]) / c["dur"]
        uc = clamp(u)
        sy = Y0 + (Y1 - Y0) * (0.45 * uc + 0.55 * uc * uc)
        sx = c["sx"] + c["drift"] * uc
        out[f"obj:{n}:loc"] = _fall_pos(sx, sy, c["depth"])
        a = c["spin"] * (t - c["ts"])
        ax = c["axis"]
        out[f"obj:{n}:rot"] = (c["rot0"][0] + a * ax[0] * 2.2, c["rot0"][1] + a * ax[1] * 2.2, c["rot0"][2] + a * ax[2])
        out[f"obj:{n}:scale"] = c["size"] if 0.0 <= u <= 1.0 else HIDE
    g = 18.0
    for c in COIN_FOUNTAIN:
        n = c["name"]
        start = (0.0, P.GATE["y"] - 0.6, 2.0)
        if clip != "intro":
            out[f"obj:{n}:scale"] = HIDE
            out[f"obj:{n}:loc"] = start
            out[f"obj:{n}:rot"] = (0.0, 0.0, 0.0)
            continue
        dt = max(0.0, t - c["ts"])
        vx, vy, vz = c["v"]
        p = (start[0] + vx * dt, start[1] + vy * dt, start[2] + vz * dt - 0.5 * g * dt * dt)
        alive = t >= c["ts"] and p[2] > -0.5 and dt < 1.8
        out[f"obj:{n}:loc"] = p if alive or t < c["ts"] else out.get(f"obj:{n}:loc", p)
        out[f"obj:{n}:rot"] = tuple(s * dt for s in c["spin"])
        out[f"obj:{n}:scale"] = c["size"] if alive else HIDE
    for c in COIN_STAY:
        n = c["name"]
        Pd = c["period"]
        if clip == "outro":
            # 周期で頭に戻さず、そのまま貯金箱へ吸い込む
            ph = c["phase"] + t / Pd
            k = ease_in(ramp(t, 0.05 + c["sink_delay"], 0.85 + c["sink_delay"] * 0.5), 2.4)
            sy = Y0 + (Y1 - Y0) * ph
            sx = c["sx"] + c["drift"] * math.sin(TAU * ph)
            p0 = _fall_pos(sx, sy, c["depth"])
            # 渦を巻いて吸い込まれる
            sw = 1.6 * (1 - k) * k
            p = vlerp(p0, COIN_SINK, k)
            p = (p[0] + sw * math.cos(TAU * (k * 1.5 + c["phase"])), p[1], p[2] + sw * math.sin(TAU * (k * 1.5 + c["phase"])))
            edge = 1.0 / (P.FPS * Pd) + 1e-6
            # 頭は stay の 0 秒と同じ見え方。下の外へ出きる前か、吸い込まれ始めたら見せる
            vis = (edge < c["phase"] and ph < 1 - edge) or k > 0.02
            s = c["size"] * (1 - ramp(k, 0.82, 1.0)) if vis else HIDE
            if s <= 1e-3:
                s = HIDE
        else:
            ph = frac(tau / Pd + c["phase"])
            sy = Y0 + (Y1 - Y0) * ph
            sx = c["sx"] + c["drift"] * math.sin(TAU * ph)
            p = _fall_pos(sx, sy, c["depth"])
            # 頭に戻るコマの前後は消す（ぶれで縦の筋が出ないように）
            edge = 1.0 / (P.FPS * Pd) + 1e-6
            vis = edge < ph < 1 - edge
            if clip == "intro":
                start_abs = t - ph * Pd
                vis = vis and start_abs >= 4.5
            s = c["size"] if vis else HIDE
        a = TAU * tau / STAY
        out[f"obj:{n}:loc"] = p
        out[f"obj:{n}:rot"] = tuple(c["rot0"][i] + a * c["turns"][i] for i in range(3))
        out[f"obj:{n}:scale"] = s


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
        out[f"obj:{n}:loc"] = screen(s["sx"] + 12 * math.sin(TAU * ph), s["sy"] - s["rise"] * ph, s["depth"])
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


PARTS = (castle_root, sticker, sky, castle_lights, camera, pipo, ayato, coins, bats, leaves, sparks, sway)


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
    sx, sy, depth = P.project(loc)
    lens = p["cam:lens"]
    k = (lens / 12.0) * (P.H / 2) / depth * AYATO_M_PER_PX * s
    # 顔の四角は spread の絵の座標（rise は顔の真ん中をそろえてある）
    fx0, fy0, fx1, fy1 = (463, 129, 802, 421)
    cx, cy = 619.5, 591.5
    # 画面の (sx, sy) は板の真ん中（project は lens を CAM のまま。ずれは小さいので lens の比で直す）
    zoom = lens / P.CAM["lens"]
    sx = P.W / 2 + (sx - P.W / 2) * zoom
    sy = P.H / 2 + (sy - P.H / 2 - P.CAM["shift_y"] * P.H) * zoom + P.CAM["shift_y"] * P.H
    return (sx + (fx0 - cx) * k, sy + (fy0 - cy) * k, sx + (fx1 - cx) * k, sy + (fy1 - cy) * k)


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
    # outro の最後は、城もあやとも金貨も消えている
    last = pose("outro", (P.CLIPS["outro"] - 1) / P.FPS)
    root_gone = _hidden(last, "castle_root")
    left = [k for k, v in last.items() if k.endswith(":scale") and (v if not isinstance(v, tuple) else max(v)) > 2e-4
            and not k.startswith("obj:sticker") and not (root_gone and k.split(":")[1] in ROOT_KIDS)]
    ops = {k: v for k, v in last.items() if k.endswith("_op") and v > 1e-3 and not (root_gone and k == "val:pipo_op")}
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
    return 1 if bad else 0


if __name__ == "__main__":
    if sys.argv[1:] == ["check"]:
        sys.exit(check())
    print(__doc__)
