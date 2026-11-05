"""1万円の段（段7「ドラキュラ城が本気を出す」）の場面を Blender（bpy）で組んで、連番の絵を描く。

**この箱では動かさない**（Blender は入れない）。GitHub Actions の runner で回す
（`.github/workflows/alert_blender.yml`）。

    blender -b --factory-startup -noaudio --python tools/alert-theme/blender/castle_t7.py -- \
        --out <置き場> --quality final --frames "intro:0 intro:20 stay:3"

- 振付け（どの物がどの秒にどこに居るか）は `t7_motion.py`、秒・カメラ・並びは `t7_plan.py`。ここは**形・材質・光**と、
  振付けの値を Blender のキーにするところ
- 描くのは Cycles（CPU）。runner には GPU が無いので EEVEE は当てにしない
- 物の組（collection）は4つ。描く層（view layer）は2つ（`setup_render`）: back（空・城・あやと）と front（前の粒）。
  書き出し（`t7_pack.py`）が重ねて透明つきの動画にする
  - `sky` … 夜空・星・満月・雲・満月の光の筋
  - `scene` … 城・岩・門・木・こうもり（群れも）・月の光の粒・門の火の粉・ピポ・門の光・霧（空は入れない）
  - `ayato` … 伯爵のあやと
  - `front` … 投げた人のキャラ絵の前に置く光の粒だけ
- **お金の形の物は置かない**（2026-11-05 にあやと「投げ銭してコイン撒くのはイメージ悪い」。金貨は月の光の粒・こうもりの群れ・
  門の火の粉に替えた。振付けは `t7_motion.py` の「月の光の粒」）
- 1コマにつき層ごとに2枚: `<層>/c_<コマ>.png`（黒の上に重ねた色。光のにじみ込み）と `<層>/a_<コマ>.png`（物の透明。16bit）。
  光のにじみは透明の外にも広がるので、透明は書き出しの側で「色の明るさ」と合わせて決める
- コマの番号は Blender の時間軸（`t7_plan.BASE`）: intro は 1〜、stay は 1001〜、outro は 2001〜
- 形は全部ここで作る（外の素材は使わない）。絵は `public/alert/themes/` の本物（貯金箱の城・ピポ・ドラキュラのあやと）と、
  `assets/` の下ごしらえ（`t7_prep.py` が作る）だけ
"""
import argparse
import json
import math
import os
import random
import sys
import time

import bmesh
import bpy
from mathutils import Euler, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import t7_motion as MO  # noqa: E402
import t7_plan as P  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
THEMES = os.path.join(ROOT, "public", "alert", "themes")
ASSETS = os.path.join(HERE, "assets")
TAU = 2 * math.pi
B = P.ROCK_TOP
HW = P.GATE["half_w"]
SPRING = P.GATE["spring"]
GY = P.GATE["y"]

QUALITY = {
    # 書けるか・壊れていないかだけ（plan の job が最初に回す）
    "smoke": dict(pct=12, scene=2, other=1, denoise=False, blur=False, thr=0.1),
    # 目線合わせ（半分の大きさ）
    "preview": dict(pct=50, scene=16, other=8, denoise=True, blur=True, thr=0.05),
    # 本番
    "final": dict(pct=100, scene=48, other=16, denoise=True, blur=True, thr=0.03),
}

RND = random.Random(1_0000)


# ================================================================ 小道具
def log(*a):
    print("[t7]", *a, flush=True)


def ccw(pts):
    """(x, z) の多角形を、正面（-y から見て）反時計回りにそろえる"""
    a = 0.0
    for i in range(len(pts)):
        x0, z0 = pts[i]
        x1, z1 = pts[(i + 1) % len(pts)]
        a += x0 * z1 - x1 * z0
    return pts if a > 0 else list(reversed(pts))


class Geo:
    """UV つきの形を1つの mesh に積む。UV は m（材質の模様の大きさを、物の大きさに依らずそろえる）。
    `rnd` の UV は、物ごとの乱数（葉の色・窓のちらつき）を材質へ渡すための札"""

    def __init__(self):
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.rnd = self.bm.loops.layers.uv.new("rnd")
        self.tag = (0.0, 0.0)
        self.smooth = False

    def face(self, pts, uvs=None, verts=None):
        vs = verts or [self.bm.verts.new(p) for p in pts]
        f = self.bm.faces.new(vs)
        f.normal_update()
        f.smooth = self.smooth
        n = f.normal
        for i, lp in enumerate(f.loops):
            c = lp.vert.co
            if uvs is not None:
                lp[self.uv].uv = uvs[i]
            elif abs(n.z) >= max(abs(n.x), abs(n.y)):
                lp[self.uv].uv = (c.x, c.y)
            elif abs(n.x) >= abs(n.y):
                lp[self.uv].uv = (c.y, c.z)
            else:
                lp[self.uv].uv = (c.x, c.z)
            lp[self.rnd].uv = self.tag
        return f

    def box(self, x0, x1, y0, y1, z0, z1, xf=None):
        P8 = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        if xf:
            P8 = [xf(p) for p in P8]
        for idx in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (2, 3, 7, 6), (3, 0, 4, 7), (1, 2, 6, 5)):
            self.face([P8[i] for i in idx])

    def prism(self, pts2d, y0, y1, xf=None, uv01=False):
        """(x, z) の多角形を y0〜y1 に押し出す。xf は点の移し替え（回す・ずらす）"""
        pts2d = ccw(pts2d)
        f3 = [(x, y0, z) for x, z in pts2d]
        b3 = [(x, y1, z) for x, z in pts2d]
        if xf:
            f3 = [xf(p) for p in f3]
            b3 = [xf(p) for p in b3]
        uvs = None
        if uv01:
            xs = [p[0] for p in pts2d]
            zs = [p[1] for p in pts2d]
            w = max(xs) - min(xs) or 1
            h = max(zs) - min(zs) or 1
            uvs = [((x - min(xs)) / w, (z - min(zs)) / h) for x, z in pts2d]
        self.face(f3, uvs)
        self.face(list(reversed(b3)), list(reversed(uvs)) if uvs else None)
        n = len(pts2d)
        for i in range(n):
            j = (i + 1) % n
            self.face([f3[i], b3[i], b3[j], f3[j]])

    def lathe(self, cx, cy, profile, seg=32, a0=0.0, a1=TAU, smooth=True, z0=0.0):
        """(半径, 高さ) の並びを z の軸で回す。角度 0 がカメラの側（-y）"""
        full = abs(a1 - a0 - TAU) < 1e-6
        n_a = seg if full else seg + 1
        rings = []
        for r, z in profile:
            ring = []
            for k in range(n_a):
                a = a0 + (a1 - a0) * k / seg
                ring.append(self.bm.verts.new((cx + r * math.sin(a), cy - r * math.cos(a), z0 + z)))
            rings.append(ring)
        vs = [0.0]
        for i in range(1, len(profile)):
            (r0, zz0), (r1, zz1) = profile[i - 1], profile[i]
            vs.append(vs[-1] + math.hypot(r1 - r0, zz1 - zz0))
        old = self.smooth
        self.smooth = smooth
        for i in range(len(rings) - 1):
            rr = max(0.25, 0.5 * (profile[i][0] + profile[i + 1][0]))
            for k in range(seg):
                k2 = (k + 1) % n_a if full else k + 1
                ua = (a0 + (a1 - a0) * k / seg) * rr
                ub = (a0 + (a1 - a0) * (k + 1) / seg) * rr
                vert = [rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]]
                if len(set(vert)) < 4:
                    continue
                self.face(None, [(ua, vs[i]), (ub, vs[i]), (ub, vs[i + 1]), (ua, vs[i + 1])], verts=vert)
        self.smooth = old

    def finish(self, name):
        me = bpy.data.meshes.new(name)
        self.bm.to_mesh(me)
        self.bm.free()
        return me


def place(me, name, col, mat=None, parent=None, loc=(0, 0, 0)):
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    if mat is not None:
        if isinstance(mat, (list, tuple)):
            for m in mat:
                me.materials.append(m)
        else:
            me.materials.append(mat)
    ob.location = loc
    if parent is not None:
        ob.parent = parent
    return ob


def empty(name, col, parent=None, loc=(0, 0, 0)):
    ob = bpy.data.objects.new(name, None)
    col.objects.link(ob)
    ob.location = loc
    if parent is not None:
        ob.parent = parent
    return ob


# ================================================================ 材質の部品
class Nodes:
    def __init__(self, nt):
        self.nt = nt

    def n(self, kind, **props):
        node = self.nt.nodes.new(kind)
        for k, v in props.items():
            setattr(node, k, v)
        return node

    @staticmethod
    def sock(node, key, out=False, kind=None):
        coll = node.outputs if out else node.inputs
        if isinstance(key, int):
            return coll[key]
        cands = [s for s in coll if s.name == key and (kind is None or s.type == kind)]
        live = [s for s in cands if getattr(s, "enabled", True)]
        if live:
            return live[0]
        if cands:
            return cands[0]
        raise KeyError(f"{node.bl_idname} に {key} が無い: {[s.name for s in coll]}")

    def put(self, node, key, v, kind=None):
        s = self.sock(node, key, kind=kind)
        if hasattr(v, "is_output"):
            self.nt.links.new(v, s)
        else:
            if isinstance(v, (tuple, list)) and len(v) == 3 and s.type == "RGBA":
                v = (*v, 1.0)
            s.default_value = v

    def set(self, node, **kw):
        for k, v in kw.items():
            try:
                self.put(node, k.replace("_", " "), v)
            except KeyError as e:
                log("!! 入口が無い", e)
        return node

    def math(self, op, a, b=None, clamp=False):
        m = self.n("ShaderNodeMath", operation=op, use_clamp=clamp)
        self.put(m, 0, a)
        if b is not None:
            self.put(m, 1, b)
        return m.outputs[0]

    def vmath(self, op, a, b=None):
        m = self.n("ShaderNodeVectorMath", operation=op)
        self.put(m, 0, a)
        if b is not None:
            self.put(m, 1, b)
        return m.outputs[0] if op not in ("DOT_PRODUCT", "LENGTH", "DISTANCE") else m.outputs["Value"]

    def mix(self, fac, a, b, blend="MIX"):
        m = self.n("ShaderNodeMix", data_type="RGBA", blend_type=blend)
        self.put(m, "Factor", fac, kind="VALUE")
        self.put(m, "A", a, kind="RGBA")
        self.put(m, "B", b, kind="RGBA")
        return self.sock(m, "Result", out=True, kind="RGBA")

    def ramp(self, fac, stops):
        r = self.n("ShaderNodeValToRGB")
        self.put(r, "Fac", fac)
        els = r.color_ramp.elements
        while len(els) > 1:
            els.remove(els[-1])
        els[0].position = stops[0][0]
        els[0].color = (*stops[0][1], 1.0)
        for pos, col in stops[1:]:
            e = els.new(pos)
            e.color = (*col, 1.0)
        return r.outputs["Color"]

    def maprange(self, v, a, b, c=0.0, d=1.0, clamp=True):
        m = self.n("ShaderNodeMapRange", clamp=clamp)
        self.put(m, "Value", v)
        self.put(m, "From Min", a)
        self.put(m, "From Max", b)
        self.put(m, "To Min", c)
        self.put(m, "To Max", d)
        return m.outputs["Result"]

    def uv(self, name="UVMap"):
        return self.n("ShaderNodeUVMap", uv_map=name).outputs["UV"]

    def xyz(self, v):
        s = self.n("ShaderNodeSeparateXYZ")
        self.put(s, 0, v)
        return s.outputs[0], s.outputs[1], s.outputs[2]

    def comb(self, x, y, z):
        c = self.n("ShaderNodeCombineXYZ")
        self.put(c, 0, x)
        self.put(c, 1, y)
        self.put(c, 2, z)
        return c.outputs[0]

    def value(self, name, v=0.0):
        n = self.n("ShaderNodeValue", name=name, label=name)
        n.outputs[0].default_value = v
        return n.outputs[0]


def new_mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    out.target = "ALL"
    return m, Nodes(nt), out


def principled(N, **kw):
    b = N.n("ShaderNodeBsdfPrincipled")
    N.set(b, **kw)
    return b


# 動かす値（材質の ctl・光の強さ・カメラ）の宛先: 名前 → [(id, path, index, 倍率, 足し)]
CTL = {}


def ctl(name, idd, path, index=-1, k=1.0, add=0.0):
    CTL.setdefault(name, []).append((idd, path, index, k, add))


def ctl_node(name, mat, N, start=0.0):
    """材質の中に、外から動かす値の口（Value ノード）を作る"""
    out = N.value(name, start)
    ctl(name, mat.node_tree, f'nodes["{name}"].outputs[0].default_value')
    return out


# ================================================================ 材質
def mat_wall(name="wall", c1=(0.74, 0.72, 0.7), c2=(0.63, 0.61, 0.62), mortar=(0.36, 0.35, 0.37), scale=1.7):
    """白い石積みの壁（大きな石の目地・汚れ・凹凸）"""
    m, N, out = new_mat(name)
    uv = N.uv()
    brick = N.n("ShaderNodeTexBrick", offset=0.5, squash=1.0)
    N.set(brick, Vector=uv, Color1=c1, Color2=c2, Mortar=mortar,
          Scale=scale, Mortar_Size=0.018, Mortar_Smooth=0.3, Bias=0.0, Brick_Width=0.62, Row_Height=0.3)
    noise = N.n("ShaderNodeTexNoise")
    N.set(noise, Vector=uv, Scale=1.6, Detail=8.0, Roughness=0.6)
    dirt = N.ramp(N.sock(noise, "Fac", out=True), [(0.35, (0.55, 0.53, 0.55)), (0.7, (1.0, 1.0, 1.0))])
    base = N.mix(0.85, N.sock(brick, "Color", out=True), dirt, "MULTIPLY")
    h = N.math("ADD", N.math("MULTIPLY", N.sock(brick, "Fac", out=True), -1.0), N.math("MULTIPLY", N.sock(noise, "Fac", out=True), 0.35))
    bump = N.n("ShaderNodeBump")
    N.set(bump, Strength=0.35, Distance=0.04, Height=h)
    bs = principled(N, Base_Color=base, Roughness=0.86, Normal=bump.outputs[0])
    N.nt.links.new(bs.outputs[0], out.inputs["Surface"])
    return m


def mat_stone(name="stone", c0=(0.58, 0.55, 0.5), c1=(0.74, 0.70, 0.64)):
    m, N, out = new_mat(name)
    uv = N.uv()
    noise = N.n("ShaderNodeTexNoise")
    N.set(noise, Vector=uv, Scale=3.0, Detail=8.0, Roughness=0.65)
    vor = N.n("ShaderNodeTexVoronoi", feature="F1")
    N.set(vor, Vector=uv, Scale=6.0)
    col = N.ramp(N.sock(noise, "Fac", out=True), [(0.3, c0), (0.7, c1)])
    h = N.math("ADD", N.sock(noise, "Fac", out=True), N.math("MULTIPLY", N.sock(vor, "Distance", out=True), 0.4))
    bump = N.n("ShaderNodeBump")
    N.set(bump, Strength=0.45, Distance=0.05, Height=h)
    bs = principled(N, Base_Color=col, Roughness=0.84, Normal=bump.outputs[0])
    N.nt.links.new(bs.outputs[0], out.inputs["Surface"])
    return m


def mat_roof():
    m, N, out = new_mat("roof")
    uv = N.uv()
    brick = N.n("ShaderNodeTexBrick", offset=0.5)
    N.set(brick, Vector=uv, Color1=(0.40, 0.045, 0.03), Color2=(0.58, 0.10, 0.05), Mortar=(0.08, 0.012, 0.01),
          Scale=3.2, Mortar_Size=0.03, Mortar_Smooth=0.6, Brick_Width=0.42, Row_Height=0.24)
    noise = N.n("ShaderNodeTexNoise")
    N.set(noise, Vector=uv, Scale=2.0, Detail=6.0)
    col = N.mix(0.45, N.sock(brick, "Color", out=True), N.ramp(N.sock(noise, "Fac", out=True), [(0.3, (0.6, 0.55, 0.55)), (0.7, (1, 1, 1))]), "MULTIPLY")
    # 瓦の段: 1段ごとに下の縁を明るく（重なりの厚み）
    _, v, _ = N.xyz(uv)
    row = N.math("FRACT", N.math("MULTIPLY", v, 3.2 / 0.24))
    shade = N.maprange(row, 0.0, 1.0, 1.15, 0.7)
    col = N.mix(1.0, col, N.comb(shade, shade, shade), "MULTIPLY")
    bump = N.n("ShaderNodeBump")
    N.set(bump, Strength=0.6, Distance=0.05, Height=N.math("ADD", N.math("MULTIPLY", row, -0.6), N.sock(brick, "Fac", out=True)))
    bs = principled(N, Base_Color=col, Roughness=0.42, Normal=bump.outputs[0])
    N.set(bs, Specular_IOR_Level=0.6)
    N.nt.links.new(bs.outputs[0], out.inputs["Surface"])
    return m


def mat_rock():
    m, N, out = new_mat("rock")
    tc = N.n("ShaderNodeTexCoord")
    obj = tc.outputs["Object"]
    noise = N.n("ShaderNodeTexNoise")
    N.set(noise, Vector=obj, Scale=0.9, Detail=10.0, Roughness=0.62)
    vor = N.n("ShaderNodeTexVoronoi", feature="DISTANCE_TO_EDGE")
    N.set(vor, Vector=obj, Scale=1.4)
    nf = N.sock(noise, "Fac", out=True)
    col = N.ramp(nf, [(0.3, (0.16, 0.155, 0.16)), (0.55, (0.32, 0.31, 0.3)), (0.75, (0.46, 0.44, 0.41))])
    geo = N.n("ShaderNodeNewGeometry")
    _, _, nz = N.xyz(geo.outputs["Normal"])
    moss = N.math("MULTIPLY", N.maprange(nz, 0.45, 0.8), N.maprange(nf, 0.42, 0.62))
    col = N.mix(moss, col, (0.07, 0.13, 0.04))
    # 割れ目は細く、黒くしすぎない（太く黒いと、岩が石畳の目地のように見えた。2026-11-04 の試し）
    crack = N.maprange(N.sock(vor, "Distance", out=True), 0.0, 0.03, 0.0, 1.0)
    col = N.mix(N.math("MULTIPLY", N.math("SUBTRACT", 1.0, crack), 0.55), col, (0.06, 0.06, 0.065))
    bump = N.n("ShaderNodeBump")
    N.set(bump, Strength=0.7, Distance=0.12, Height=N.math("ADD", nf, N.math("MULTIPLY", crack, 0.5)))
    bs = principled(N, Base_Color=col, Roughness=0.9, Normal=bump.outputs[0])
    N.nt.links.new(bs.outputs[0], out.inputs["Surface"])
    return m


def mat_wood():
    m, N, out = new_mat("wood")
    uv = N.uv()
    wave = N.n("ShaderNodeTexWave", wave_type="BANDS", bands_direction="X", wave_profile="SAW")
    N.set(wave, Vector=uv, Scale=2.6, Distortion=1.5, Detail=4.0, Detail_Scale=2.0)
    noise = N.n("ShaderNodeTexNoise")
    N.set(noise, Vector=N.vmath("MULTIPLY", uv, (1.0, 12.0, 1.0)), Scale=3.0, Detail=6.0)
    wf = N.sock(wave, "Fac", out=True)
    col = N.ramp(N.math("ADD", N.math("MULTIPLY", wf, 0.5), N.math("MULTIPLY", N.sock(noise, "Fac", out=True), 0.5)),
                 [(0.2, (0.10, 0.045, 0.02)), (0.6, (0.32, 0.15, 0.06)), (0.9, (0.46, 0.24, 0.10))])
    bump = N.n("ShaderNodeBump")
    N.set(bump, Strength=0.5, Distance=0.03, Height=wf)
    bs = principled(N, Base_Color=col, Roughness=0.55, Normal=bump.outputs[0])
    N.nt.links.new(bs.outputs[0], out.inputs["Surface"])
    return m


def mat_metal(name, base, rough, metal=1.0, emit=0.0):
    m, N, out = new_mat(name)
    bs = principled(N, Base_Color=base, Metallic=metal, Roughness=rough)
    if emit:
        N.set(bs, Emission_Color=base, Emission_Strength=emit)
    N.nt.links.new(bs.outputs[0], out.inputs["Surface"])
    return m


def mat_window():
    """窓。灯りの色・枠の十字・窓ごとのちらつき（rnd の UV で窓ごとに位相をずらす）"""
    m, N, out = new_mat("window")
    win = ctl_node("win", m, N)
    ph = ctl_node("win_ph", m, N)
    u, v, _ = N.xyz(N.uv())
    r0, r1, _ = N.xyz(N.uv("rnd"))
    mull = N.math("MAXIMUM", N.math("LESS_THAN", N.math("ABSOLUTE", N.math("SUBTRACT", u, 0.5)), 0.05),
                  N.math("LESS_THAN", N.math("ABSOLUTE", N.math("SUBTRACT", v, 0.55)), 0.035))
    flick = N.math("ADD", 0.86, N.math("MULTIPLY", 0.14, N.math("SINE", N.math("MULTIPLY", TAU, N.math("ADD", N.math("MULTIPLY", r0, 5.0), ph)))))
    glow = N.math("MULTIPLY", N.math("MULTIPLY", win, flick), N.maprange(v, 0.0, 1.0, 1.4, 0.7))
    glow = N.math("MULTIPLY", glow, N.math("ADD", 0.7, N.math("MULTIPLY", r1, 0.6)))
    em = N.n("ShaderNodeEmission")
    N.set(em, Color=(1.0, 0.6, 0.22), Strength=N.math("MULTIPLY", glow, 5.5))
    frame = principled(N, Base_Color=(0.05, 0.03, 0.02), Roughness=0.7)
    mx = N.n("ShaderNodeMixShader")
    N.put(mx, 0, mull)
    N.nt.links.new(em.outputs[0], mx.inputs[1])
    N.nt.links.new(frame.outputs[0], mx.inputs[2])
    N.nt.links.new(mx.outputs[0], out.inputs["Surface"])
    return m


def mat_path():
    m, N, out = new_mat("path")
    tc = N.n("ShaderNodeTexCoord")
    obj = tc.outputs["Object"]
    vor = N.n("ShaderNodeTexVoronoi", feature="DISTANCE_TO_EDGE")
    N.set(vor, Vector=obj, Scale=1.9, Randomness=0.85)
    vc = N.n("ShaderNodeTexVoronoi", feature="F1")
    N.set(vc, Vector=obj, Scale=1.9, Randomness=0.85)
    edge = N.maprange(N.sock(vor, "Distance", out=True), 0.02, 0.09)
    stone = N.ramp(N.sock(vc, "Color", out=True), [(0.0, (0.10, 0.095, 0.1)), (0.5, (0.2, 0.19, 0.19)), (1.0, (0.3, 0.28, 0.26))])
    col = N.mix(edge, (0.03, 0.028, 0.03), stone)
    rough = N.maprange(edge, 0.0, 1.0, 0.85, 0.2)
    noise = N.n("ShaderNodeTexNoise")
    N.set(noise, Vector=obj, Scale=6.0, Detail=6.0)
    bump = N.n("ShaderNodeBump")
    N.set(bump, Strength=0.55, Distance=0.05, Height=N.math("ADD", edge, N.math("MULTIPLY", N.sock(noise, "Fac", out=True), 0.25)))
    bs = principled(N, Base_Color=col, Roughness=rough, Normal=bump.outputs[0])
    N.nt.links.new(bs.outputs[0], out.inputs["Surface"])
    return m


def mat_ground():
    m, N, out = new_mat("ground")
    tc = N.n("ShaderNodeTexCoord")
    noise = N.n("ShaderNodeTexNoise")
    N.set(noise, Vector=tc.outputs["Object"], Scale=0.5, Detail=8.0)
    col = N.ramp(N.sock(noise, "Fac", out=True), [(0.35, (0.012, 0.016, 0.01)), (0.7, (0.05, 0.05, 0.03))])
    bs = principled(N, Base_Color=col, Roughness=0.95)
    # 地面は城のまわりだけ。外へ行くほど透明に（城が貯金箱の大きさに縮んだとき、四角い暗い板が浮かないように）
    x, y, _ = N.xyz(tc.outputs["Object"])
    d = N.math("SQRT", N.math("ADD", N.math("MULTIPLY", x, x), N.math("MULTIPLY", N.math("MULTIPLY", y, y), 1.8)))
    alpha = N.maprange(d, 26.0, 15.0)
    tr = N.n("ShaderNodeBsdfTransparent")
    N.nt.links.new(mix_shader(N, alpha, tr.outputs[0], bs.outputs[0]), out.inputs["Surface"])
    return m


def mat_leaf(name="leaf", stops=None):
    m, N, out = new_mat(name)
    r0, r1, _ = N.xyz(N.uv("rnd"))
    stops = stops or [(0.0, (0.32, 0.015, 0.01)), (0.3, (0.62, 0.04, 0.015)), (0.55, (0.82, 0.18, 0.02)),
                      (0.78, (0.9, 0.42, 0.04)), (0.93, (0.85, 0.62, 0.08)), (1.0, (0.42, 0.42, 0.06))]
    col = N.ramp(r0, stops)
    bs = principled(N, Base_Color=col, Roughness=0.55)
    N.set(bs, Sheen_Weight=0.3)
    tr = N.n("ShaderNodeBsdfTranslucent")
    N.set(tr, Color=col)
    mx = N.n("ShaderNodeMixShader")
    N.put(mx, 0, 0.35)
    N.nt.links.new(bs.outputs[0], mx.inputs[1])
    N.nt.links.new(tr.outputs[0], mx.inputs[2])
    N.nt.links.new(mx.outputs[0], out.inputs["Surface"])
    return m


def mat_bat():
    """こうもり。黒いままだと門の光の前で黒い影（汚れ）に見えた（2026-11-04 の採点）。縁を薄紫に光らせ、体も少しだけ自分で光る"""
    m, N, out = new_mat("bat")
    bs = principled(N, Base_Color=(0.035, 0.02, 0.05), Roughness=0.5)
    N.set(bs, Sheen_Weight=0.8, Sheen_Tint=(0.55, 0.4, 0.9))
    lw = N.n("ShaderNodeLayerWeight")
    N.set(lw, Blend=0.4)
    rim = N.math("POWER", N.sock(lw, "Facing", out=True), 2.2)
    em = N.n("ShaderNodeEmission")
    N.set(em, Color=(0.78, 0.6, 1.0), Strength=N.math("ADD", N.math("MULTIPLY", rim, 1.6), 0.05))
    N.nt.links.new(add_shader(N, bs.outputs[0], em.outputs[0]), out.inputs["Surface"])
    return m


def mat_emit(name, color, strength, ctl_name=None, ctl_k=1.0):
    m, N, out = new_mat(name)
    em = N.n("ShaderNodeEmission")
    s = strength
    if ctl_name:
        s = N.math("MULTIPLY", ctl_node(ctl_name, m, N), strength * ctl_k)
    N.set(em, Color=color, Strength=s)
    N.nt.links.new(em.outputs[0], out.inputs["Surface"])
    return m


def add_shader(N, a, b):
    s = N.n("ShaderNodeAddShader")
    N.nt.links.new(a, s.inputs[0])
    N.nt.links.new(b, s.inputs[1])
    return s.outputs[0]


def mix_shader(N, fac, a, b):
    s = N.n("ShaderNodeMixShader")
    N.put(s, 0, fac)
    N.nt.links.new(a, s.inputs[1])
    N.nt.links.new(b, s.inputs[2])
    return s.outputs[0]


def mat_gate_glow():
    """門の奥の光。下の真ん中が白く飛び、放射の筋がゆっくり揺れる"""
    m, N, out = new_mat("gate_glow")
    G = ctl_node("gate", m, N)
    ph = ctl_node("ray_ph", m, N)
    u, v, _ = N.xyz(N.uv())
    du = N.math("SUBTRACT", u, 0.5)
    dv = N.math("MULTIPLY", N.math("SUBTRACT", v, 0.12), 0.8)
    d = N.math("SQRT", N.math("ADD", N.math("MULTIPLY", du, du), N.math("MULTIPLY", dv, dv)))
    core = N.math("EXPONENT", N.math("MULTIPLY", d, -3.2))
    ang = N.math("ARCTAN2", dv, du)
    nz = N.n("ShaderNodeTexNoise", noise_dimensions="2D")
    N.set(nz, Vector=N.comb(N.math("MULTIPLY", ang, 4.0), N.math("MULTIPLY", N.math("SINE", N.math("MULTIPLY", ph, TAU)), 0.4), 0.0), Scale=2.2, Detail=2.0)
    rays = N.maprange(N.sock(nz, "Fac", out=True), 0.35, 0.7, 0.55, 1.25)
    col = N.mix(core, (1.0, 0.5, 0.15), (1.0, 0.88, 0.66))
    st = N.math("MULTIPLY", G, N.math("MULTIPLY", rays, N.math("ADD", 2.2, N.math("MULTIPLY", core, 14.0))))
    em = N.n("ShaderNodeEmission")
    N.set(em, Color=col, Strength=st)
    N.nt.links.new(em.outputs[0], out.inputs["Surface"])
    return m


def mat_additive(name, color, strength, kind, ctl_name="gate"):
    """足し算の光（透明＋光）。kind: rays（光の帯）/ pool（床の光だまり）/ halo（月の暈）"""
    m, N, out = new_mat(name)
    G = ctl_node(ctl_name, m, N)
    if kind == "rays":
        ph = ctl_node("ray_ph", m, N)
        u, v, _ = N.xyz(N.uv())
        r0, r1, _ = N.xyz(N.uv("rnd"))
        along = N.math("POWER", N.math("SUBTRACT", 1.0, v, clamp=True), 1.8)
        across = N.math("POWER", N.math("SUBTRACT", 1.0, N.math("ABSOLUTE", N.math("SUBTRACT", N.math("MULTIPLY", u, 2.0), 1.0)), clamp=True), 2.0)
        fl = N.math("ADD", 0.7, N.math("MULTIPLY", 0.3, N.math("SINE", N.math("MULTIPLY", TAU, N.math("ADD", ph, r0)))))
        k = N.math("MULTIPLY", N.math("MULTIPLY", along, across), fl)
    elif kind == "pool":
        tc = N.n("ShaderNodeTexCoord")
        x, y, _ = N.xyz(tc.outputs["Object"])
        d = N.math("SQRT", N.math("ADD", N.math("MULTIPLY", N.math("MULTIPLY", x, x), 1.4), N.math("MULTIPLY", y, y)))
        k = N.math("EXPONENT", N.math("MULTIPLY", d, -0.32))
    else:  # halo
        tc = N.n("ShaderNodeTexCoord")
        d = N.vmath("LENGTH", tc.outputs["Object"])
        k = N.math("MULTIPLY", N.math("EXPONENT", N.math("MULTIPLY", d, -3.2)), N.math("SUBTRACT", 1.0, d, clamp=True))
    em = N.n("ShaderNodeEmission")
    N.set(em, Color=color, Strength=N.math("MULTIPLY", N.math("MULTIPLY", G, k), strength))
    tr = N.n("ShaderNodeBsdfTransparent")
    N.nt.links.new(add_shader(N, tr.outputs[0], em.outputs[0]), out.inputs["Surface"])
    return m


def mat_fog(name, warm=1.0):
    """霧の板。4次元の雑音の W を円の上で回すので、3.0 秒で同じ形に戻る"""
    m, N, out = new_mat(name)
    fog = ctl_node("fog", m, N)
    ph = ctl_node("fog_ph", m, N)
    G = ctl_node("gate", m, N)
    tc = N.n("ShaderNodeTexCoord")
    x, _, z = N.xyz(tc.outputs["Object"])
    a = N.math("MULTIPLY", ph, TAU)
    vec = N.comb(N.math("MULTIPLY", x, 0.16), N.math("MULTIPLY", z, 0.42), N.math("MULTIPLY", N.math("COSINE", a), 0.55))
    nz = N.n("ShaderNodeTexNoise", noise_dimensions="4D")
    N.set(nz, Vector=vec, W=N.math("MULTIPLY", N.math("SINE", a), 0.55), Scale=1.6, Detail=5.0, Roughness=0.55)
    dens = N.maprange(N.sock(nz, "Fac", out=True), 0.42, 0.78)
    u, v, _ = N.xyz(N.uv())
    vfade = N.math("MULTIPLY", N.maprange(v, 0.0, 0.25), N.maprange(v, 1.0, 0.4))
    hfade = N.math("MULTIPLY", N.maprange(u, 0.0, 0.15), N.maprange(u, 1.0, 0.85))
    alpha = N.math("MULTIPLY", N.math("MULTIPLY", dens, N.math("MULTIPLY", vfade, hfade)), N.math("MULTIPLY", fog, 0.38))
    near = N.math("EXPONENT", N.math("MULTIPLY", N.math("ABSOLUTE", x), -0.28))
    warmk = N.math("MULTIPLY", N.math("MULTIPLY", near, G), warm)
    col = N.mix(N.math("MINIMUM", warmk, 1.0), (0.16, 0.16, 0.32), (1.0, 0.6, 0.28))
    em = N.n("ShaderNodeEmission")
    N.set(em, Color=col, Strength=N.math("ADD", 0.18, N.math("MULTIPLY", warmk, 0.9)))
    tr = N.n("ShaderNodeBsdfTransparent")
    N.nt.links.new(mix_shader(N, alpha, tr.outputs[0], em.outputs[0]), out.inputs["Surface"])
    return m


def mat_sky():
    """夜空の板（UV は画面の位置）。星は 1.5 秒の周期でまたたく"""
    m, N, out = new_mat("sky")
    op = ctl_node("sky_op", m, N)
    det = ctl_node("sky_det", m, N)
    ph = ctl_node("sky_ph", m, N)
    u, v, _ = N.xyz(N.uv())
    grad = N.ramp(v, [(0.0, (0.06, 0.028, 0.085)), (0.38, (0.03, 0.022, 0.075)), (0.7, (0.012, 0.014, 0.05)), (1.0, (0.004, 0.006, 0.03))])
    st = N.comb(N.math("MULTIPLY", u, 0.5625), v, 0.0)
    vor = N.n("ShaderNodeTexVoronoi", feature="F1", voronoi_dimensions="2D")
    N.set(vor, Vector=st, Scale=70.0, Randomness=1.0)
    d = N.sock(vor, "Distance", out=True)
    cr, cg, cb = N.xyz(N.sock(vor, "Color", out=True))
    star = N.math("MULTIPLY", N.maprange(d, 0.07, 0.0), N.math("GREATER_THAN", cr, 0.62))
    tw = N.math("ADD", 0.55, N.math("MULTIPLY", 0.45, N.math("SINE", N.math("MULTIPLY", TAU, N.math("ADD", N.math("MULTIPLY", cb, 7.0), ph)))))
    star = N.math("MULTIPLY", N.math("MULTIPLY", star, tw), N.math("MULTIPLY", N.math("ADD", 0.4, cg), det))
    star = N.math("MULTIPLY", star, N.maprange(v, 0.25, 0.55))
    col = N.mix(N.math("MULTIPLY", star, 3.0), grad, (0.95, 0.92, 1.0), "ADD")
    em = N.n("ShaderNodeEmission")
    N.set(em, Color=col, Strength=1.0)
    tr = N.n("ShaderNodeBsdfTransparent")
    N.nt.links.new(mix_shader(N, op, tr.outputs[0], em.outputs[0]), out.inputs["Surface"])
    return m


def mat_clouds(moon_uv):
    m, N, out = new_mat("clouds")
    op = ctl_node("sky_op", m, N)
    det = ctl_node("sky_det", m, N)
    ph = ctl_node("fog_ph", m, N)
    u, v, _ = N.xyz(N.uv())
    a = N.math("MULTIPLY", ph, TAU)
    vec = N.comb(N.math("MULTIPLY", u, 1.3 * 0.5625), N.math("MULTIPLY", v, 1.3), N.math("MULTIPLY", N.math("COSINE", a), 0.25))
    nz = N.n("ShaderNodeTexNoise", noise_dimensions="4D")
    N.set(nz, Vector=vec, W=N.math("MULTIPLY", N.math("SINE", a), 0.25), Scale=2.4, Detail=7.0, Roughness=0.6)
    dens = N.maprange(N.sock(nz, "Fac", out=True), 0.5, 0.72)
    dens = N.math("MULTIPLY", dens, N.math("MULTIPLY", N.maprange(v, 0.28, 0.5), N.maprange(v, 1.0, 0.82)))
    du = N.math("MULTIPLY", N.math("SUBTRACT", u, moon_uv[0]), 0.5625)
    dv = N.math("SUBTRACT", v, moon_uv[1])
    dm = N.math("SQRT", N.math("ADD", N.math("MULTIPLY", du, du), N.math("MULTIPLY", dv, dv)))
    lit = N.math("EXPONENT", N.math("MULTIPLY", dm, -7.0))
    col = N.mix(lit, (0.05, 0.045, 0.11), (0.75, 0.68, 0.78))
    em = N.n("ShaderNodeEmission")
    N.set(em, Color=col, Strength=N.math("ADD", 0.6, N.math("MULTIPLY", lit, 2.5)))
    tr = N.n("ShaderNodeBsdfTransparent")
    alpha = N.math("MULTIPLY", N.math("MULTIPLY", dens, 0.85), N.math("MULTIPLY", op, det))
    N.nt.links.new(mix_shader(N, alpha, tr.outputs[0], em.outputs[0]), out.inputs["Surface"])
    return m


def mat_moon():
    m, N, out = new_mat("moon")
    op = ctl_node("moon_op", m, N)
    tc = N.n("ShaderNodeTexCoord")
    obj = tc.outputs["Object"]
    n1 = N.n("ShaderNodeTexNoise")
    N.set(n1, Vector=obj, Scale=1.6, Detail=6.0, Roughness=0.6)
    vor = N.n("ShaderNodeTexVoronoi", feature="F1")
    N.set(vor, Vector=obj, Scale=5.0)
    maria = N.maprange(N.sock(n1, "Fac", out=True), 0.45, 0.65)
    crat = N.maprange(N.sock(vor, "Distance", out=True), 0.0, 0.25, 0.85, 1.0)
    col = N.mix(maria, (1.0, 0.95, 0.84), (0.74, 0.66, 0.54))
    col = N.mix(1.0, col, N.comb(crat, crat, crat), "MULTIPLY")
    r = N.vmath("LENGTH", obj)
    limb = N.maprange(r, 0.55, 1.0, 1.0, 0.78)
    em = N.n("ShaderNodeEmission")
    N.set(em, Color=col, Strength=N.math("MULTIPLY", limb, 3.2))
    tr = N.n("ShaderNodeBsdfTransparent")
    N.nt.links.new(mix_shader(N, op, tr.outputs[0], em.outputs[0]), out.inputs["Surface"])
    return m


# 満月の光の筋の板の大きさ（月の半径の何倍か。半分の幅で）。月（512, 196・半径 150px）から画面の下の端まで届く
RAYS_SCALE = 8.0


def mat_moon_rays(inner):
    """満月の光の筋（足し算の光）。雑音を「月の真ん中からの向き」だけで引くので、筋は月から放射に伸びる。
    向きは単位の円の上の点で渡す（角度で渡すと、左の真横で模様が切れて線が出る）。
    3.0 秒の周期（ray_ph）で筋がゆっくり揺れる（4次元の雑音の W を円の上で回す。輪がつながる）。inner は月の縁（板の座標で）"""
    m, N, out = new_mat("moon_rays")
    G = ctl_node("moon_rays", m, N)
    ph = ctl_node("ray_ph", m, N)
    tc = N.n("ShaderNodeTexCoord")
    x, y, _ = N.xyz(tc.outputs["Object"])
    d = N.math("SQRT", N.math("ADD", N.math("MULTIPLY", x, x), N.math("MULTIPLY", y, y)))
    inv = N.math("DIVIDE", 1.0, N.math("MAXIMUM", d, 1e-3))
    a = N.math("MULTIPLY", ph, TAU)
    nz = N.n("ShaderNodeTexNoise", noise_dimensions="4D")
    N.set(nz, Vector=N.comb(N.math("MULTIPLY", N.math("MULTIPLY", x, inv), 2.6), N.math("MULTIPLY", N.math("MULTIPLY", y, inv), 2.6),
                            N.math("MULTIPLY", N.math("COSINE", a), 0.35)),
          W=N.math("MULTIPLY", N.math("SINE", a), 0.35), Scale=2.0, Detail=3.0, Roughness=0.55)
    streak = N.math("POWER", N.maprange(N.sock(nz, "Fac", out=True), 0.42, 0.72), 2.0)
    # 月の縁から外へだんだん弱く、板の縁では 0（四角い板の形を見せない）
    fall = N.math("EXPONENT", N.math("MULTIPLY", d, -3.0))
    edge = N.math("MULTIPLY", N.maprange(d, inner, inner * 1.6), N.maprange(d, 0.95, 0.6))
    k = N.math("MULTIPLY", N.math("MULTIPLY", streak, fall), edge)
    em = N.n("ShaderNodeEmission")
    N.set(em, Color=(0.75, 0.8, 1.0), Strength=N.math("MULTIPLY", N.math("MULTIPLY", G, k), 1.4))
    tr = N.n("ShaderNodeBsdfTransparent")
    N.nt.links.new(add_shader(N, tr.outputs[0], em.outputs[0]), out.inputs["Surface"])
    return m


def load_image(path, non_color=False):
    im = bpy.data.images.load(path, check_existing=True)
    im.alpha_mode = "STRAIGHT"
    if non_color:
        im.colorspace_settings.name = "Non-Color"
    return im


def mat_card(name, img_path, rim_path=None, emit=0.8, diffuse=0.35, rim_col=(0.78, 0.84, 1.0), rim_k=2.2,
             windows_path=None, normal_path=None, lit=0.0):
    """ステッカーの絵の板。絵の色を光らせたまま（絵柄を崩さない）、場面の光を少し受け、縁に月の光を乗せる。

    normal_path を渡すと、場面の光を「縁の厚み」の法線で受ける（lit が受ける強さ）。門の光・灯り・前からの月の光が、
    縁の向きごとに当たって、板が立体に見える（2026-11-04 の採点「主役が動かない板」の続き）"""
    m, N, out = new_mat(name)
    op = ctl_node(f"{name}_op", m, N, 1.0)
    tex = N.n("ShaderNodeTexImage", image=load_image(img_path), interpolation="Cubic", extension="CLIP")
    N.put(tex, "Vector", N.uv())
    col = N.sock(tex, "Color", out=True)
    al = N.sock(tex, "Alpha", out=True)
    ecol = N.mix(1.0, col, (emit, emit, emit), "MULTIPLY")
    if rim_path:
        rim = N.n("ShaderNodeTexImage", image=load_image(rim_path, True), interpolation="Linear", extension="CLIP")
        N.put(rim, "Vector", N.uv())
        key = ctl_node("key", m, N, 1.0)
        rk = N.math("MULTIPLY", N.math("MULTIPLY", N.sock(rim, "Color", out=True), key), rim_k)
        ecol = N.mix(rk, ecol, rim_col, "ADD")
    if windows_path:
        wt = N.n("ShaderNodeTexImage", image=load_image(windows_path, True), interpolation="Linear", extension="CLIP")
        N.put(wt, "Vector", N.uv())
        sweep = ctl_node("sticker_sweep", m, N)
        winv = ctl_node("sticker_win", m, N, 1.0)
        u, _, _ = N.xyz(N.uv())
        lit = N.math("MULTIPLY", N.math("SUBTRACT", N.math("MULTIPLY", sweep, 1.25), u), 8.0, clamp=True)
        wk = N.math("MULTIPLY", N.math("MULTIPLY", N.sock(wt, "Color", out=True), lit), N.math("MULTIPLY", winv, 9.0))
        ecol = N.mix(wk, ecol, (1.0, 0.62, 0.22), "ADD")
    em = N.n("ShaderNodeEmission")
    N.set(em, Color=ecol, Strength=1.0)
    sh = em.outputs[0]
    if diffuse > 0:
        df = N.n("ShaderNodeBsdfDiffuse")
        N.set(df, Color=N.mix(1.0, col, (diffuse, diffuse, diffuse), "MULTIPLY"))
        sh = add_shader(N, sh, df.outputs[0])
    if normal_path and lit > 0:
        nt_ = N.n("ShaderNodeTexImage", image=load_image(normal_path, True), interpolation="Linear", extension="CLIP")
        N.put(nt_, "Vector", N.uv())
        nm = N.n("ShaderNodeNormalMap", space="TANGENT", uv_map="UVMap")
        N.put(nm, "Color", N.sock(nt_, "Color", out=True))
        N.put(nm, "Strength", 1.0)
        bs = principled(N, Base_Color=N.mix(1.0, col, (lit, lit, lit), "MULTIPLY"), Roughness=0.5)
        N.set(bs, Specular_IOR_Level=0.35)
        N.put(bs, "Normal", nm.outputs["Normal"])
        sh = add_shader(N, sh, bs.outputs[0])
    tr = N.n("ShaderNodeBsdfTransparent")
    N.nt.links.new(mix_shader(N, N.math("MULTIPLY", al, op), tr.outputs[0], sh), out.inputs["Surface"])
    return m


def mat_world():
    """世界の光。ふだんは暗い紺。金の飾りに映る光（つやの光線だけが見る）は、暖かい地平の帯"""
    w = bpy.data.worlds.new("night")
    bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    N = Nodes(nt)
    out = nt.nodes.new("ShaderNodeOutputWorld")
    lp = N.n("ShaderNodeLightPath")
    tc = N.n("ShaderNodeTexCoord")
    # 世界の Generated は向き（-1〜1）。0〜1 に直して、0.5 が地平
    _, _, z = N.xyz(tc.outputs["Generated"])
    zz = N.maprange(z, -1.0, 1.0)
    refl = N.ramp(zz, [(0.0, (0.11, 0.05, 0.02)), (0.48, (1.0, 0.62, 0.25)), (0.56, (0.55, 0.36, 0.22)), (1.0, (0.08, 0.09, 0.19))])
    bg1 = N.n("ShaderNodeBackground")
    N.set(bg1, Color=(0.010, 0.012, 0.03), Strength=1.0)
    bg2 = N.n("ShaderNodeBackground")
    N.set(bg2, Color=refl, Strength=2.2)
    N.nt.links.new(mix_shader(N, N.sock(lp, "Is Glossy Ray", out=True), bg1.outputs[0], bg2.outputs[0]), out.inputs["Surface"])


# ================================================================ 形
def plane_mesh(name, w, h, ox=0.0, oz=0.0):
    """縦の板（x, z）。(ox, oz) が原点に来る。UV は 0〜1"""
    g = Geo()
    pts = [(-ox, 0, -oz), (w - ox, 0, -oz), (w - ox, 0, h - oz), (-ox, 0, h - oz)]
    # 原点の板は xz 平面で、+y に向く。物の回転（x を 90°+）で -y を向かせる前提なので、ここは xy に置く
    pts = [(x, z, 0.0) for x, _, z in pts]
    g.face(pts, [(0, 0), (1, 0), (1, 1), (0, 1)])
    return g.finish(name)


def board_mesh(name, w, h, ox, oz, nx, ny):
    """キャラの板。絵の形を少し動かす（シェイプキー）ので格子に割る。原点 (ox, oz)・UV は 0〜1（plane_mesh と同じ向き）"""
    verts = [(i / nx * w - ox, j / ny * h - oz, 0.0) for j in range(ny + 1) for i in range(nx + 1)]
    faces = []
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
            faces.append((a, a + 1, a + nx + 2, a + nx + 1))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    uvl = me.uv_layers.new(name="UVMap")
    for poly in me.polygons:
        for li in poly.loop_indices:
            x, y, _ = verts[me.loops[li].vertex_index]
            uvl.data[li].uv = ((x + ox) / w, (y + oz) / h)
    me.update()
    return me


def board_keys(ob, name, size_px, ox, oz, mpp):
    """t7_motion.deform_px の形を、板のシェイプキーにする。値は振付けの `key:<板>:<形>` が動かす"""
    keys = MO.BOARD_KEYS.get(name)
    if not keys:
        return
    ob.shape_key_add(name="Basis", from_mix=False)
    me = ob.data
    for key in keys:
        kb = ob.shape_key_add(name=key, from_mix=False)
        kb.slider_min, kb.slider_max = -4.0, 4.0
        for i, v in enumerate(me.vertices):
            x, y, z = v.co
            px, py = (x + ox) / mpp, size_px[1] - (y + oz) / mpp
            dx, dy, dn = MO.deform_px(name, key, px, py)
            kb.data[i].co = (x + dx * mpp, y - dy * mpp, z + dn * mpp)
        ctl(f"key_{name}_{key}", me.shape_keys, f'key_blocks["{key}"].value')


def arch_pts(hw, spring, n=18, a0=math.pi, a1=0.0):
    return [(hw * math.cos(a0 + (a1 - a0) * i / n), spring + hw * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]


def window_shape(w, h):
    """上が半円の窓（x, z）。下の左 → 下の右 → 右の付け根から左へ半円"""
    r = w / 2
    return [(-r, 0.0), (r, 0.0)] + [(r * math.cos(math.pi * i / 10), h - r + r * math.sin(math.pi * i / 10)) for i in range(11)]


class Builder:
    def __init__(self, cols, mats):
        self.c = cols
        self.m = mats
        self.root = empty("castle_root", cols["scene"])
        self.win = Geo()
        self.surround = Geo()
        self.wid = 0

    # ---- 窓
    def window(self, x, y, z, w=0.55, h=1.05, ang=0.0, cx=0.0, cy=0.0, r=None):
        """壁の窓（正面 -y 向き）。r を渡すと、(cx, cy) の丸い塔の ang の向きの面に貼る"""
        self.wid += 1
        self.win.tag = (RND.random(), RND.random())
        pts = ccw(window_shape(w, h))
        xs = [p[0] for p in pts]
        zs = [p[1] for p in pts]

        def xf(p):
            return _window_xf(p, x, y, z, ang, cx, cy, r)
        # 窓の灯り（壁から 8cm 手前）と、そのまわりの石の枠（壁から 5cm 出て、12cm 埋まる）
        self.win.face([xf((px, -0.08, pz)) for px, pz in pts],
                      [((px - min(xs)) / (max(xs) - min(xs)), (pz - min(zs)) / (max(zs) - min(zs))) for px, pz in pts])
        spts = window_shape(w * 1.38, h * 1.2)
        self.surround.prism([(px, pz - 0.08) for px, pz in spts], -0.05, 0.12, xf=xf)

    def finish_windows(self):
        place(self.win.finish("windows"), "windows", self.c["scene"], self.m["window"], self.root)
        place(self.surround.finish("window_frames"), "window_frames", self.c["scene"], self.m["stone_light"], self.root)

    # ---- 建物
    def tower(self, cx, cy, z0, z1, r, roof_h, roof_r=None, merlons=False, win_rows=(), win_angles=(-0.5, 0.0, 0.5), finial=True):
        g = Geo()
        g.lathe(cx, cy, [(r * 1.04, z0), (r, z0 + 0.4), (r, z1 - 0.35), (r * 1.06, z1 - 0.3), (r * 1.06, z1)], seg=40)
        place(g.finish("tower"), f"tower_{cx:.1f}", self.c["scene"], self.m["wall"], self.root)
        if roof_h > 0:
            rr = roof_r or r * 1.22
            g = Geo()
            g.lathe(cx, cy, [(rr * 1.02, z1 - 0.05), (rr, z1 + 0.12), (rr * 0.78, z1 + roof_h * 0.25), (rr * 0.45, z1 + roof_h * 0.6),
                             (rr * 0.12, z1 + roof_h * 0.92), (0.02, z1 + roof_h)], seg=40)
            place(g.finish("roof"), f"roof_{cx:.1f}", self.c["scene"], self.m["roof"], self.root)
            # 軒の下の影の帯（石の縁）
            g = Geo()
            g.lathe(cx, cy, [(rr * 0.96, z1 - 0.25), (rr * 1.0, z1 - 0.05)], seg=40)
            place(g.finish("eave"), f"eave_{cx:.1f}", self.c["scene"], self.m["stone_dark"], self.root)
            if finial:
                g = Geo()
                tz = z1 + roof_h
                g.lathe(cx, cy, [(0.01, tz - 0.05), (0.09, tz + 0.05), (0.16, tz + 0.25), (0.09, tz + 0.42), (0.03, tz + 0.48),
                                 (0.03, tz + 0.9), (0.005, tz + 1.15)], seg=16)
                place(g.finish("finial"), f"finial_{cx:.1f}", self.c["scene"], self.m["gold"], self.root)
        if merlons:
            g = Geo()
            n = int(TAU * r / 0.9)
            for k in range(n):
                if k % 2:
                    continue
                a0 = TAU * k / n
                a1 = TAU * (k + 0.9) / n
                g.lathe(cx, cy, [(r * 1.06, z1), (r * 1.06, z1 + 0.6)], seg=3, a0=a0, a1=a1, smooth=False)
            place(g.finish("merlon"), f"merlons_{cx:.1f}", self.c["scene"], self.m["wall"], self.root)
        for zr in win_rows:
            for a in win_angles:
                self.window(0, 0, zr, ang=a, cx=cx, cy=cy, r=r)

    def keep(self, x0, x1, y0, y1, z0, z1, merlon=True, win=()):
        g = Geo()
        g.box(x0, x1, y0, y1, z0, z1)
        # 上の縁の帯
        g.box(x0 - 0.12, x1 + 0.12, y0 - 0.12, y1 + 0.12, z1 - 0.35, z1)
        place(g.finish("keep"), f"keep_{x0:.1f}", self.c["scene"], self.m["wall"], self.root)
        if merlon:
            g = Geo()
            w = 0.55
            n = max(2, int((x1 - x0) / (w * 2)))
            for k in range(n + 1):
                xx = x0 - 0.12 + (x1 - x0 + 0.24 - w) * k / n
                g.box(xx, xx + w, y0 - 0.12, y0 + 0.25, z1, z1 + 0.6)
                g.box(xx, xx + w, y1 - 0.25, y1 + 0.12, z1, z1 + 0.6)
            m = max(2, int((y1 - y0) / (w * 2)))
            for k in range(m + 1):
                yy = y0 - 0.12 + (y1 - y0 + 0.24 - w) * k / m
                g.box(x0 - 0.12, x0 + 0.25, yy, yy + w, z1, z1 + 0.6)
                g.box(x1 - 0.25, x1 + 0.12, yy, yy + w, z1, z1 + 0.6)
            place(g.finish("merlons"), f"merlons_{x0:.1f}", self.c["scene"], self.m["wall"], self.root)
        for (wx, wz) in win:
            self.window(wx, y0, wz)

    def gable(self, x0, x1, y0, y1, z0, h, over=0.35):
        """切妻の屋根（棟は x の向き）"""
        g = Geo()
        ym = (y0 + y1) / 2
        e0 = (x0 - over, y0 - over, z0 - 0.15)
        e1 = (x1 + over, y0 - over, z0 - 0.15)
        r0 = (x0 - over, ym, z0 + h)
        r1 = (x1 + over, ym, z0 + h)
        b0 = (x0 - over, y1 + over, z0 - 0.15)
        b1 = (x1 + over, y1 + over, z0 - 0.15)
        slope = math.hypot(ym - (y0 - over), h + 0.15)
        g.face([e0, e1, r1, r0], [(x0, 0), (x1, 0), (x1, slope), (x0, slope)])
        g.face([b1, b0, r0, r1], [(x1, 0), (x0, 0), (x0, slope), (x1, slope)])
        place(g.finish("gable"), f"gable_{x0:.1f}", self.c["scene"], self.m["roof"], self.root)
        # 妻の壁
        g = Geo()
        for xx, s in ((x0, -1), (x1, 1)):
            pts = [(xx, y0, z0), (xx, ym, z0 + h - 0.1), (xx, y1, z0)]
            g.face(pts if s < 0 else list(reversed(pts)))
        place(g.finish("gable_wall"), f"gablewall_{x0:.1f}", self.c["scene"], self.m["wall"], self.root)

    # ---- 門
    def gate(self):
        c, m, root = self.c["scene"], self.m, self.root
        W, Ht = 5.8, B + 0.4
        # 門のある壁（アーチの口を開けた石積み）
        inner = [(-HW, SPRING * i / 4) for i in range(5)] + arch_pts(HW, SPRING, 24)[1:-1] + [(HW, SPRING * i / 4) for i in range(4, -1, -1)]
        cxz = (0.0, SPRING)

        def to_outer(p, idx):
            x, z = p
            if idx <= 4:
                return (-W, z)
            if idx >= len(inner) - 5:
                return (W, z)
            dx, dz = x - cxz[0], z - cxz[1]
            ts = []
            if dx < -1e-6:
                ts.append((-W - cxz[0]) / dx)
            if dx > 1e-6:
                ts.append((W - cxz[0]) / dx)
            if dz > 1e-6:
                ts.append((Ht - cxz[1]) / dz)
            t = min(ts)
            return (cxz[0] + dx * t, cxz[1] + dz * t)
        outer = [to_outer(p, i) for i, p in enumerate(inner)]
        g = Geo()
        y0, y1 = GY, GY + 0.9
        for i in range(len(inner) - 1):
            a, b2, cc, d = inner[i], inner[i + 1], outer[i + 1], outer[i]
            g.face([(a[0], y0, a[1]), (b2[0], y0, b2[1]), (cc[0], y0, cc[1]), (d[0], y0, d[1])])
            g.face([(d[0], y1, d[1]), (cc[0], y1, cc[1]), (b2[0], y1, b2[1]), (a[0], y1, a[1])])
            g.face([(a[0], y1, a[1]), (b2[0], y1, b2[1]), (b2[0], y0, b2[1]), (a[0], y0, a[1])])
        g.face([(-W, y0, Ht), (W, y0, Ht), (W, y1, Ht), (-W, y1, Ht)])
        place(g.finish("gatewall"), "gatewall", c, m["masonry"], root)
        # アーチの迫石（大きな石を半円に）
        g = Geo()
        nv = 13
        for i in range(nv):
            a0 = math.pi - math.pi * i / nv - 0.012
            a1 = math.pi - math.pi * (i + 1) / nv + 0.012
            ri, ro = HW + 0.02, HW + (1.05 if i == nv // 2 else 0.85)
            pts = [(ri * math.cos(a0), SPRING + ri * math.sin(a0)), (ro * math.cos(a0), SPRING + ro * math.sin(a0)),
                   (ro * math.cos(a1), SPRING + ro * math.sin(a1)), (ri * math.cos(a1), SPRING + ri * math.sin(a1))]
            g.prism(pts, GY - 0.32, GY + 0.2)
        # 側の柱の石（互い違い）
        for side in (-1, 1):
            z = 0.0
            k = 0
            while z < SPRING - 0.05:
                hgt = 0.66
                wd = 0.85 if k % 2 == 0 else 1.15
                x0 = side * HW
                x1 = side * (HW + wd)
                g.box(min(x0, x1), max(x0, x1), GY - 0.26, GY + 0.2, z + 0.02, min(SPRING, z + hgt) - 0.02)
                z += hgt
                k += 1
        place(g.finish("voussoirs"), "voussoirs", c, m["stone_light"], root)
        # 扉（左右。蝶番の所が原点。外へ＝カメラの側へ開く）
        # 内へ開くと、扉が奥の岩に刺さる。外へ開くと、開いた扉が光の口を左右から縁取る（叩き台の絵と同じ）
        for side, name in ((-1, "door_l"), (1, "door_r")):
            piv = empty(name, c, root, loc=(side * HW, GY + 0.12, 0.0))
            angs = [math.pi / 2 + (math.pi / 2) * i / 12 for i in range(13)] if side < 0 else [math.pi / 2 - (math.pi / 2) * i / 12 for i in range(13)]
            arc = [(HW * math.cos(a) - side * HW, SPRING + HW * math.sin(a)) for a in angs]
            pts = [(0.0, 0.0), (-side * (HW - 0.015), 0.0)] + arc[1:]
            g = Geo()
            g.prism(pts, 0.0, 0.16)
            place(g.finish(name + "_wood"), name + "_wood", c, m["wood"], piv)
            g = Geo()
            for zb in (0.9, 2.4, 3.9, 5.4):
                for yy0, yy1, sy in ((-0.05, 0.0, -1), (0.16, 0.21, 1)):
                    g.box(min(0, -side * (HW - 0.12)), max(0, -side * (HW - 0.12)), yy0, yy1, zb, zb + 0.16)
                    for k in range(6):
                        xx = -side * (0.25 + (HW - 0.55) * k / 5)
                        y_a, y_b = (-0.09, -0.04) if sy < 0 else (0.2, 0.25)
                        g.box(xx - 0.05, xx + 0.05, y_a, y_b, zb + 0.03, zb + 0.13)
            place(g.finish(name + "_iron"), name + "_iron", c, m["iron"], piv)
            # 叩き金の輪（縦の輪）
            g2 = Geo()
            kx = -side * (HW - 0.55)
            for i in range(24):
                a = TAU * i / 24
                b2 = TAU * (i + 1) / 24
                rr = 0.24
                p0 = (kx + rr * math.cos(a), 2.7 + rr * math.sin(a))
                p1 = (kx + rr * math.cos(b2), 2.7 + rr * math.sin(b2))
                g2.box(min(p0[0], p1[0]) - 0.02, max(p0[0], p1[0]) + 0.02, -0.15, -0.09, min(p0[1], p1[1]) - 0.02, max(p0[1], p1[1]) + 0.02)
            g2.box(kx - 0.09, kx + 0.09, -0.12, -0.03, 2.86, 3.04)
            place(g2.finish(name + "_ring"), name + "_ring", c, m["gold"], piv)
        # 口の奥の光の板（壁の厚みの中。奥の岩より手前）
        g = Geo()
        shape = [(-HW - 0.2, -0.05), (HW + 0.2, -0.05)] + arch_pts(HW + 0.2, SPRING, 20, 0.0, math.pi)[1:-1] + [(-HW - 0.2, SPRING)]
        shape = ccw(shape)
        xs = [p[0] for p in shape]
        zs = [p[1] for p in shape]
        g.face([(x, GY + 0.62, z) for x, z in shape],
               [((x - min(xs)) / (max(xs) - min(xs)), (z - min(zs)) / (max(zs) - min(zs))) for x, z in shape])
        place(g.finish("gate_glow"), "gate_glow", c, m["gate_glow"], root)

    def rays(self):
        """門から溢れる光の帯（足し算）。門の口からカメラの側へ扇に広がる"""
        g = Geo()
        o = Vector((0.0, GY - 0.2, 2.2))
        for i in range(9):
            g.tag = (RND.random(), RND.random())
            yaw = math.radians(-34 + 68 * i / 8 + RND.uniform(-4, 4))
            pitch = math.radians(RND.uniform(2, 24))
            L = RND.uniform(11, 16)
            d = Vector((math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch)))
            side = d.cross(Vector((0, 0, 1))).normalized()
            w0, w1 = RND.uniform(0.25, 0.5), RND.uniform(1.6, 3.2)
            up = side.cross(d).normalized()
            for s in (side, up):
                pts = [o - s * w0, o + s * w0, o + d * L + s * w1, o + d * L - s * w1]
                g.face([tuple(p) for p in pts], [(0, 0), (1, 0), (1, 1), (0, 1)])
        place(g.finish("rays"), "rays", self.c["scene"], self.m["rays"], self.root)
        g = Geo()
        g.face([(-6.0, GY - 13.0, 0.012), (6.0, GY - 13.0, 0.012), (6.0, GY, 0.012), (-6.0, GY, 0.012)], [(0, 0), (1, 0), (1, 1), (0, 1)])
        ob = place(g.finish("pool"), "light_pool", self.c["scene"], self.m["pool"], self.root)
        ob.location = (0, 0, 0)

    # ---- 岩・地面
    def rock(self, k, mesh_fn, loc, strength=(0.55, 0.22), size=(2.0, 0.8), levels=2, simple=False):
        """形を作って、雑音で2回押し出す。大きさは頂点に焼く（雑音の粒の大きさを、岩の大きさに依らず m でそろえる）"""
        bm = bmesh.new()
        mesh_fn(bm)
        me = bpy.data.meshes.new(f"rock{k}")
        bm.to_mesh(me)
        bm.free()
        for p in me.polygons:
            p.use_smooth = True
        ob = place(me, f"rock{k}", self.c["scene"], self.m["rock"], self.root, loc=loc)
        sub = ob.modifiers.new("sub", "SUBSURF")
        if simple:
            sub.subdivision_type = "SIMPLE"
        sub.levels = max(1, levels - 1)
        sub.render_levels = levels
        for j, (kind, sz, st) in enumerate((("CLOUDS", size[0], strength[0]), ("VORONOI", size[1], strength[1]))):
            tex = bpy.data.textures.new(f"rock{k}_{j}", kind)
            tex.noise_scale = sz
            if kind == "VORONOI":
                tex.distance_metric = "DISTANCE"
                tex.noise_intensity = 1.0
            d = ob.modifiers.new(f"d{j}", "DISPLACE")
            d.texture = tex
            d.texture_coords = "LOCAL"
            d.strength = st
            d.mid_level = 0.5
        return ob

    def rocks(self):
        # 城の乗る岩の台（門の壁の後ろ。前の面は壁の厚みの奥 GY+0.9）
        y0, y1 = GY + 0.9, 15.0

        def slab(bm):
            r = bmesh.ops.create_cube(bm, size=1.0)
            for v in r["verts"]:
                v.co = Vector(((v.co.x) * 23.0, y0 + (v.co.y + 0.5) * (y1 - y0), -0.6 + (v.co.z + 0.5) * (B + 0.9)))
        self.rock("slab", slab, (0, 0, 0), strength=(1.2, 0.45), size=(2.6, 1.0), levels=6, simple=True)
        # まわりの岩（大きさを頂点に焼いた丸い岩）
        specs = [
            ((-7.8, 0.4, 2.6), (4.8, 3.4, 6.0)), ((8.0, 0.6, 2.6), (4.8, 3.4, 6.2)),
            ((-10.8, 3.6, 1.2), (3.6, 3.8, 4.0)), ((11.0, 4.2, 1.2), (3.8, 3.8, 4.2)),
            ((-5.0, GY - 1.0, 0.6), (1.5, 1.2, 1.3)), ((5.2, GY - 0.9, 0.5), (1.3, 1.1, 1.1)),
            ((-6.4, GY - 3.0, 0.3), (1.0, 0.9, 0.8)), ((6.8, GY - 3.4, 0.3), (1.1, 1.0, 0.8)),
            ((-6.4, 0.2, B - 0.6), (2.4, 1.6, 1.6)), ((6.6, 0.0, B - 0.7), (2.2, 1.5, 1.5)),
            ((-2.0, 0.0, B - 0.2), (2.0, 1.0, 0.8)), ((2.6, -0.2, B - 0.3), (1.8, 1.0, 0.7)),
        ]
        for k, (loc, scl) in enumerate(specs):
            def ball(bm, scl=scl):
                r = bmesh.ops.create_icosphere(bm, subdivisions=4, radius=1.0)
                for v in r["verts"]:
                    v.co = Vector((v.co.x * scl[0], v.co.y * scl[1], v.co.z * scl[2]))
            self.rock(k, ball, loc, strength=(0.7, 0.3), size=(1.8, 0.7), levels=2)
        # 地面・石畳
        g = Geo()
        g.face([(-34, -32, -0.02), (34, -32, -0.02), (34, 22, -0.02), (-34, 22, -0.02)])
        place(g.finish("ground"), "ground", self.c["scene"], self.m["ground"], self.root)
        g = Geo()
        # カメラの近くで広げる（ふだんの画角は ±3.5m で、外は写らない）。カメラが回り込むと（t7_motion.orbit_yaw）、
        # 画面の左下に地面の外（夜空の板）が出た（2026-11-04 の試し）
        g.face([(-13.0, -31, 0.0), (13.0, -31, 0.0), (9.0, -16, 0.0), (HW + 0.6, GY + 0.9, 0.0), (-HW - 0.6, GY + 0.9, 0.0),
                (-9.0, -16, 0.0)])
        place(g.finish("path"), "path", self.c["scene"], self.m["path"], self.root)
        # 灯籠（門の両脇）
        for side in (-1, 1):
            x = side * (HW + 1.3)
            y = GY - 2.6
            g = Geo()
            g.box(x - 0.22, x + 0.22, y - 0.22, y + 0.22, 0, 1.5)
            g.box(x - 0.36, x + 0.36, y - 0.36, y + 0.36, 1.5, 1.6)
            g.box(x - 0.36, x + 0.36, y - 0.36, y + 0.36, 2.3, 2.42)
            for dx in (-0.3, 0.3):
                for dy in (-0.3, 0.3):
                    g.box(x + dx - 0.04, x + dx + 0.04, y + dy - 0.04, y + dy + 0.04, 1.6, 2.3)
            g.lathe(x, y, [(0.42, 2.42), (0.05, 2.8)], seg=4, smooth=False)
            place(g.finish("lantern"), f"lantern{side}", self.c["scene"], self.m["stone_light"], self.root)
            g = Geo()
            g.box(x - 0.26, x + 0.26, y - 0.26, y + 0.26, 1.62, 2.28)
            place(g.finish("lantern_glass"), f"lantern_glass{side}", self.c["scene"], self.m["lamp"], self.root)
            L = bpy.data.lights.new(f"lantern_light{side}", "POINT")
            L.energy = 180
            L.color = (1.0, 0.62, 0.3)
            L.shadow_soft_size = 0.25
            lo = bpy.data.objects.new(f"lantern_light{side}", L)
            self.c["scene"].objects.link(lo)
            lo.parent = self.root
            lo.location = (x, y, 1.95)

    # ---- 木
    def tree(self, i, base, h, crown_r, n_leaves, trunk=True, bush=False, stops_mat=None):
        x, y, z = base
        if trunk:
            g = Geo()
            g.lathe(x, y, [(0.34, 0), (0.26, 0.8), (0.2, h * 0.55), (0.12, h * 0.85), (0.05, h)], seg=12, z0=z)
            for k in range(3):
                a = RND.uniform(0, TAU)
                L = RND.uniform(1.2, 2.0)
                bz = z + h * RND.uniform(0.45, 0.7)
                d = Vector((math.cos(a), math.sin(a), 0.9)).normalized()
                p0 = Vector((x, y, bz))
                p1 = p0 + d * L
                side = d.cross(Vector((0, 0, 1))).normalized() * 0.08
                g.face([tuple(p0 - side), tuple(p0 + side), tuple(p1 + side * 0.4), tuple(p1 - side * 0.4)])
            place(g.finish("trunk"), f"tree{i}_trunk", self.c["scene"], self.m["bark"], self.root)
        crown = empty(f"tree{i}_crown", self.c["scene"], self.root, loc=(x, y, z + (h * 0.88 if trunk else 0.0)))
        g = Geo()
        g.smooth = True
        clusters = [(Vector((0, 0, 0)), crown_r)]
        for k in range(5 if not bush else 2):
            a = RND.uniform(0, TAU)
            clusters.append((Vector((math.cos(a) * crown_r * 0.6, math.sin(a) * crown_r * 0.45, RND.uniform(-0.3, 0.5) * crown_r)),
                             crown_r * RND.uniform(0.5, 0.75)))
        for k in range(n_leaves):
            cc, rr = clusters[RND.randrange(len(clusters))]
            d = Vector((RND.gauss(0, 1), RND.gauss(0, 1), RND.gauss(0, 1))).normalized()
            p = cc + d * rr * (RND.uniform(0.72, 1.0) ** 0.5)
            outer = max(0.0, d.dot(Vector((0.2, -0.75, 0.6)).normalized()))
            g.tag = (clamp01(RND.random() * 0.85 + outer * 0.25), RND.random())
            s = RND.uniform(0.32, 0.5) * (0.8 if bush else 1.0)
            rot = Euler((RND.uniform(0, TAU), RND.uniform(0, TAU), RND.uniform(0, TAU))).to_matrix()
            pts = [tuple(p + rot @ Vector((lx * s, ly * s, lz * s))) for lx, ly, lz in LEAF]
            g.face(pts, [((lx + 0.6) / 1.2, (ly + 0.6) / 1.2) for lx, ly, _ in LEAF])
        place(g.finish("leaves"), f"tree{i}_leaves", self.c["scene"], stops_mat or self.m["leaf"], crown)
        return crown


def clamp01(x):
    return 0.0 if x < 0 else 1.0 if x > 1 else x


def _window_xf(p, x, y, z, ang, cx, cy, r):
    """窓の局所の座標（px 横・py 奥（負が手前）・pz 縦）を世界へ。r があれば丸い塔の ang の向きの面"""
    px, py, pz = p
    if r is None:
        return (x + px, y + py, z + pz)
    ca, sa = math.cos(ang), math.sin(ang)
    lx, ly = px, -r + py
    return (cx + lx * ca - ly * sa, cy + lx * sa + ly * ca, z + pz)


def _leaf_outline():
    """もみじの葉（5つの切れ込み）。半径 0.5 の中に、(x, y, z)"""
    pts = []
    n = 45
    for i in range(n):
        a = TAU * i / n
        # 尖った5つの葉先と、深い切れ込み・細かいぎざぎざ（丸い指数だと星の形に見えた）
        lobe = abs(math.cos(2.5 * (a - math.pi / 2))) ** 2.2
        r = 0.16 + 0.34 * lobe + 0.025 * abs(math.cos(12.5 * (a - math.pi / 2)))
        if math.sin(a) < -0.85:
            r *= 0.6
        pts.append((r * math.cos(a), r * math.sin(a), 0.03 * math.cos(3 * a)))
    return pts


LEAF = _leaf_outline()


# ================================================================ 場面を組む
def build(quality):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    cols = {}
    for name in ("sky", "scene", "ayato", "front"):
        c = bpy.data.collections.new(name)
        sc.collection.children.link(c)
        cols[name] = c

    mats = {
        "wall": mat_wall(), "roof": mat_roof(), "rock": mat_rock(), "wood": mat_wood(),
        "masonry": mat_wall("masonry", (0.62, 0.6, 0.56), (0.5, 0.48, 0.46), (0.22, 0.21, 0.22), 1.1),
        "stone_light": mat_stone("stone_light", (0.62, 0.58, 0.52), (0.8, 0.76, 0.7)),
        "stone_dark": mat_stone("stone_dark", (0.06, 0.055, 0.055), (0.14, 0.13, 0.12)),
        "iron": mat_metal("iron", (0.05, 0.05, 0.055), 0.45, 0.9),
        "gold": mat_metal("gold", (1.0, 0.72, 0.28), 0.18, 1.0),
        "bark": mat_stone("bark", (0.04, 0.025, 0.018), (0.1, 0.06, 0.035)),
        "window": mat_window(), "path": mat_path(), "ground": mat_ground(),
        "leaf": mat_leaf(), "bat": mat_bat(),
        "lamp": mat_emit("lamp", (1.0, 0.62, 0.28), 4.0, "uplight"),
        "gate_glow": mat_gate_glow(),
        "rays": mat_additive("rays", (1.0, 0.68, 0.3), 0.45, "rays"),
        "pool": mat_additive("pool", (1.0, 0.62, 0.26), 0.4, "pool"),
        "spark": mat_emit("spark", (1.0, 0.8, 0.46), 40.0),
        "spark_front": mat_emit("spark_front", (1.0, 0.84, 0.55), 26.0),
        # 月の光の粒。銀（淡い紫を少し）と、シャンパンの金。光るだけの粒で、形はただの球
        "mote_moon": mat_emit("mote_moon", (0.8, 0.85, 1.0), 30.0),
        "mote_gold": mat_emit("mote_gold", (1.0, 0.86, 0.6), 28.0),
        "fog_near": mat_fog("fog_near", 1.0), "fog_far": mat_fog("fog_far", 0.4),
    }
    mats["leaf_bush"] = mat_leaf("leaf_bush", [(0.0, (0.05, 0.09, 0.02)), (0.4, (0.09, 0.16, 0.03)), (0.7, (0.6, 0.12, 0.02)),
                                               (0.9, (0.85, 0.4, 0.04)), (1.0, (0.85, 0.6, 0.08))])
    mat_world()

    bld = Builder(cols, mats)
    root = bld.root
    s = cols["scene"]

    # ---- 岩と門
    bld.rocks()
    bld.gate()
    bld.rays()

    # ---- 城（岩の上 B）
    # 前の胸壁
    g = Geo()
    g.box(-6.2, 6.4, 0.2, 1.2, B - 0.6, B + 2.4)
    g.box(-6.3, 6.5, 0.1, 1.3, B + 2.2, B + 2.5)
    place(g.finish("curtain"), "curtain", s, mats["wall"], root)
    g = Geo()
    for k in range(13):
        xx = -6.2 + k * 1.0
        g.box(xx, xx + 0.55, 0.1, 0.55, B + 2.5, B + 3.1)
    place(g.finish("curtain_merlons"), "curtain_merlons", s, mats["wall"], root)
    # 窓の高さは、下から見上げて手前の壁に隠れない所（門の壁の上 B+0.4・胸壁の上 B+3.1 の陰より上）
    for wx in (-4.6, -2.4, 1.0):
        bld.window(wx, 0.2, B + 1.1, w=0.5, h=0.9)
    # 広間
    bld.keep(-3.4, 3.0, 2.6, 8.0, B, B + 5.6, merlon=False,
             win=[(-2.5, B + 4.2), (-1.2, B + 4.2), (0.1, B + 4.2), (1.3, B + 4.2)])
    bld.gable(-3.4, 3.0, 2.6, 8.0, B + 5.6, 3.2)
    # 左の四角い塔（煙突のような小塔つき）
    bld.keep(-5.8, -2.8, 1.3, 5.3, B - 0.5, B + 8.6, merlon=True, win=[(-4.3, B + 4.6), (-4.3, B + 6.8)])
    for tx in (-5.25, -3.35):
        bld.keep(tx - 0.42, tx + 0.42, 1.7, 2.55, B + 8.6, B + 10.4, merlon=False)
        g = Geo()
        g.box(tx - 0.56, tx + 0.56, 1.56, 2.69, B + 10.4, B + 10.75)
        for dx in (-0.4, 0.15):
            g.box(tx + dx, tx + dx + 0.25, 1.56, 2.69, B + 10.75, B + 11.05)
        place(g.finish("turret_cap"), f"turret_cap{tx:.1f}", s, mats["wall"], root)
    # 左の丸い塔
    bld.tower(-7.1, 2.6, B - 3.0, B + 6.8, 1.6, 3.9, win_rows=(B + 1.4, B + 4.4), win_angles=(-0.35, 0.25))
    # 高い塔（ピポの露台）
    tx, ty = MO.TOWER
    bld.tower(tx, ty, B - 0.3, B + 12.6, 2.05, 5.6, roof_r=2.55, win_rows=(B + 4.4, B + 6.6), win_angles=(-0.45, 0.0, 0.45))
    for a in (-0.4, 0.4):
        bld.window(0, 0, B + 10.6, ang=a, cx=tx, cy=ty, r=2.05)
    # 露台: 床の輪・手すりの柱・上の手すり・露台の戸（ピポの後ろに灯り）
    g = Geo()
    bz = B + 8.6
    g.lathe(tx, ty, [(2.05, bz - 0.5), (2.85, bz - 0.12), (2.85, bz + 0.35), (2.0, bz + 0.35)], seg=48, smooth=False)
    place(g.finish("balcony"), "balcony", s, mats["stone_light"], root)
    g = Geo()
    for k in range(40):
        a = TAU * k / 40
        px, py = tx + 2.72 * math.sin(a), ty - 2.72 * math.cos(a)
        g.lathe(px, py, [(0.07, bz + 0.35), (0.1, bz + 0.5), (0.06, bz + 0.75), (0.09, bz + 0.95)], seg=6)
    g.lathe(tx, ty, [(2.62, bz + 0.95), (2.86, bz + 0.95), (2.86, bz + 1.08), (2.62, bz + 1.08)], seg=48, smooth=False)
    place(g.finish("balusters"), "balusters", s, mats["stone_light"], root)
    bld.window(0, 0, bz + 0.35, w=1.15, h=2.1, ang=0.18, cx=tx, cy=ty, r=2.05)
    # 右の丸い塔・右の端の小さい塔・右の棟
    bld.tower(7.2, 3.3, B - 2.4, B + 7.2, 1.45, 3.6, win_rows=(B + 2.0, B + 4.8), win_angles=(-0.3, 0.3))
    bld.tower(9.0, 5.6, B - 1.6, B + 5.2, 1.05, 2.8, win_rows=(B + 2.8,), win_angles=(-0.4,))
    bld.keep(4.8, 8.4, 4.0, 7.4, B - 0.5, B + 4.4, merlon=False, win=[(6.0, B + 2.6), (7.3, B + 2.6)])
    bld.gable(4.8, 8.4, 4.0, 7.4, B + 4.4, 2.4)
    # 奥の塔（奥行き）
    bld.tower(-1.8, 8.6, B, B + 10.2, 1.25, 3.3, win_rows=(B + 7.2,), win_angles=(-0.2, 0.3))
    bld.tower(1.6, 9.6, B, B + 8.8, 1.0, 2.9, win_rows=(B + 6.4,), win_angles=(0.0,))
    bld.tower(-9.2, 5.2, B - 2.0, B + 4.6, 0.95, 2.6, win_rows=(B + 2.4,), win_angles=(0.3,))
    bld.finish_windows()

    # ---- 木と茂み
    bld.tree(0, (-8.6, -5.6, 0.0), 5.2, 3.3, 1500)
    bld.tree(1, (8.8, -6.2, 0.0), 4.8, 3.0, 1300)
    bld.tree(2, (-6.4, 1.2, B - 1.6), 2.6, 1.9, 500)
    bld.tree(3, (7.0, 0.8, B - 1.4), 2.4, 1.7, 450)
    bld.tree(4, (-5.2, -15.0, 0.0), 2.0, 1.6, 420)
    bld.tree(5, (5.6, -16.0, 0.0), 1.8, 1.5, 380)
    bld.tree(6, (-11.5, -1.5, 0.0), 4.0, 2.6, 800)
    bld.tree(7, (11.8, -0.8, 0.0), 4.2, 2.7, 800)
    for k, (bx, by, bz2, br) in enumerate(((-2.8, 0.0, B - 0.2, 1.1), (1.4, -0.2, B - 0.3, 1.0), (-0.6, 0.1, B - 0.4, 0.8),
                                           (4.6, -0.4, B - 0.6, 1.0), (-4.6, -1.6, 2.6, 1.0), (4.9, -1.5, 2.3, 1.0),
                                           (-3.2, GY - 0.6, 0.4, 0.8), (3.4, GY - 0.6, 0.4, 0.8))):
        bld.tree(10 + k, (bx, by, bz2), 0.0, br, 260, trunk=False, bush=True, stops_mat=mats["leaf_bush"])

    # ---- 霧の板（手前・岩の足もと・城の奥）
    for k, (y, z0, w, h, mat) in enumerate(((GY - 7.0, -0.2, 22, 3.2, "fog_near"), (GY - 2.6, 0.0, 26, 4.5, "fog_near"),
                                            (9.0, B - 1.0, 34, 6.0, "fog_far"))):
        g = Geo()
        g.face([(-w / 2, y, z0), (w / 2, y, z0), (w / 2, y, z0 + h), (-w / 2, y, z0 + h)], [(0, 0), (1, 0), (1, 1), (0, 1)])
        place(g.finish(f"fog{k}"), f"fog{k}", s, mats[mat], root)

    # ---- ピポ（露台。足が原点）。旗の板は形が動く（旗を振る）。cheer の板は、あやとが降り立った瞬間に跳ねるときだけ
    for name, asset, (nx, ny) in (("pipo", "pipo-flag", (34, 42)), ("pipo_cheer", "pipo-cheer", (2, 2))):
        w, h, ox, oz = MO.pipo_plane(name)
        mats[name] = mat_card(name, os.path.join(ROOT, MO.PIPO_BOARDS[name]["file"]), os.path.join(ASSETS, f"{asset}-rim.png"),
                              emit=0.55, diffuse=0.0, normal_path=os.path.join(ASSETS, f"{asset}-normal.png"), lit=0.75)
        ob = place(board_mesh(name, w, h, ox, oz, nx, ny), name, s, mats[name], root)
        board_keys(ob, name, MO.PIPO_BOARDS[name]["size"], ox, oz, MO.PIPO_M_PER_PX)
        # 落ち影: ぼかした形の暗い板を、塔の壁の手前に右下へずらして置く（形の動きも同じ値でなぞる）。
        # 前からの光の本物の影は、ピポの板が塔の幅をほぼ覆うので板の陰に隠れて見えなかった（2026-11-04 の試し）
        m, N, out = new_mat(f"{name}_shadow")
        op = ctl_node(f"{name}_op", m, N, 0.0)
        st = N.n("ShaderNodeTexImage", image=load_image(os.path.join(ASSETS, f"{asset}-shadow.png"), True),
                 interpolation="Linear", extension="CLIP")
        N.put(st, "Vector", N.uv())
        em = N.n("ShaderNodeEmission")
        N.set(em, Color=(0.0, 0.0, 0.0), Strength=0.0)
        tr = N.n("ShaderNodeBsdfTransparent")
        fac = N.math("MULTIPLY", N.math("MULTIPLY", N.sock(st, "Color", out=True), op), 0.55)
        N.nt.links.new(mix_shader(N, fac, tr.outputs[0], em.outputs[0]), out.inputs["Surface"])
        so = place(board_mesh(f"{name}_shadow", w, h, ox, oz, nx, ny), f"{name}_shadow", s, m, root)
        so.visible_shadow = False
        board_keys(so, name, MO.PIPO_BOARDS[name]["size"], ox, oz, MO.PIPO_M_PER_PX)

    # ---- 貯金箱の城（前兆の絵）
    bx, by, bw, bh = P.BANK_RECT
    depth = MO.STICKER_DEPTH
    k = (P.LENS_FROM / 12.0) * (P.H / 2) / depth
    sw, sh = bw / k, bh / k
    sm = plane_mesh("sticker", sw, sh, ox=sw / 2, oz=sh / 2)
    mats["sticker"] = mat_card("sticker", os.path.join(THEMES, "castle", "bank-base-0.png"), None, emit=0.95, diffuse=0.0,
                               windows_path=os.path.join(ASSETS, "bank-windows.png"))
    place(sm, "sticker", s, mats["sticker"])

    # ---- あやと（2枚の板。顔の真ん中をそろえる）
    # 板の寸法と原点は t7_motion.ayato_plane
    # マントがはためくので格子に割る（spread は裾の波が見える細かさ。rise は裾だけ）
    for name, (nx, ny) in (("ayato_spread", (48, 46)), ("ayato_rise", (32, 44))):
        w, h, ox, oz = MO.ayato_plane(name)
        pose = "spread" if name.endswith("spread") else "rise"
        mats[name] = mat_card(name, os.path.join(ROOT, MO.AYATO_POSES[name]["file"]),
                              os.path.join(ASSETS, f"ayato-{pose}-rim.png"), emit=0.6, diffuse=0.0, rim_col=(0.85, 0.82, 1.0),
                              normal_path=os.path.join(ASSETS, f"ayato-{pose}-normal.png"), lit=0.7)
        ob = place(board_mesh(name, w, h, ox, oz, nx, ny), name, cols["ayato"], mats[name])
        board_keys(ob, name, MO.AYATO_POSES[name]["size"], ox, oz, MO.AYATO_M_PER_PX)

    # ---- あやとの接地の影（足の下の胸壁に乗る薄い楕円。t7_motion の ayato の最後）
    m, N, out = new_mat("ayato_shadow")
    op = ctl_node("ayato_shadow_op", m, N, 0.0)
    u, v, _ = N.xyz(N.uv())
    du = N.math("MULTIPLY", N.math("SUBTRACT", u, 0.5), 2.0)
    dv = N.math("MULTIPLY", N.math("SUBTRACT", v, 0.5), 2.0)
    r = N.math("SQRT", N.math("ADD", N.math("MULTIPLY", du, du), N.math("MULTIPLY", dv, dv)))
    fall = N.maprange(r, 1.0, 0.15)
    em = N.n("ShaderNodeEmission")
    N.set(em, Color=(0.0, 0.0, 0.0), Strength=0.0)
    tr = N.n("ShaderNodeBsdfTransparent")
    N.nt.links.new(mix_shader(N, N.math("MULTIPLY", N.math("MULTIPLY", fall, fall), op), tr.outputs[0], em.outputs[0]),
                   out.inputs["Surface"])
    sh_ob = place(plane_mesh("ayato_shadow", 1.0, 1.0, 0.5, 0.5), "ayato_shadow", s, m)
    sh_ob.visible_shadow = False

    # ---- 夜空・月・雲
    sky_depth = 220.0
    corners = [P.unproject(sx, sy, sky_depth, P.LENS_FROM - 1.0) for sx, sy in ((-60, 1340), (780, 1340), (780, -60), (-60, -60))]
    g = Geo()
    g.face(corners, [(-60 / 720, 1 - 1340 / 1280), (780 / 720, 1 - 1340 / 1280), (780 / 720, 1 + 60 / 1280), (-60 / 720, 1 + 60 / 1280)])
    place(g.finish("sky"), "sky", cols["sky"], mat_sky())
    moon_sx, moon_sy, moon_rpx = 512, 196, 150
    md = 190.0
    kk = (P.CAM["lens"] / 12.0) * (P.H / 2) / md
    mr = moon_rpx / kk
    mpos = P.unproject(moon_sx, moon_sy, md)
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, segments=96, radius=1.0)
    me = bpy.data.meshes.new("moon")
    bm.to_mesh(me)
    bm.free()
    moon = place(me, "moon", cols["sky"], mat_moon(), loc=mpos)
    moon.rotation_euler = (math.radians(90 + P.CAM["pitch_deg"]), 0, 0)
    moon.scale = (mr, mr, mr)
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, segments=64, radius=1.0)
    me = bpy.data.meshes.new("halo")
    bm.to_mesh(me)
    bm.free()
    # 暈は、こうもりの群れが月を横切るとき、ひときわ光る（moon_halo）
    halo = place(me, "halo", cols["sky"], mat_additive("halo", (0.85, 0.82, 0.95), 1.6, "halo", "moon_halo"), moon, loc=(0, 0, -0.02))
    halo.scale = (3.2, 3.2, 3.2)
    # 満月の光の筋。月を真ん中にした四角い板（一辺は月の半径の 2×RAYS_SCALE）。雲より奥なので、筋は雲の切れ間から差す
    g = Geo()
    g.face([(-1, -1, 0), (1, -1, 0), (1, 1, 0), (-1, 1, 0)], [(0, 0), (1, 0), (1, 1), (0, 1)])
    rays = place(g.finish("moon_rays"), "moon_rays", cols["sky"], mat_moon_rays(1.0 / RAYS_SCALE), moon, loc=(0, 0, -0.04))
    rays.scale = (RAYS_SCALE, RAYS_SCALE, RAYS_SCALE)
    cd = 150.0
    corners = [P.unproject(sx, sy, cd, P.LENS_FROM - 1.0) for sx, sy in ((-60, 900), (780, 900), (780, -60), (-60, -60))]
    g = Geo()
    g.face(corners, [(-60 / 720, 1 - 900 / 1280), (780 / 720, 1 - 900 / 1280), (780 / 720, 1 + 60 / 1280), (-60 / 720, 1 + 60 / 1280)])
    place(g.finish("clouds"), "clouds", cols["sky"], mat_clouds((moon_sx / 720, 1 - moon_sy / 1280)))
    ctl("moon_rise", moon, "location", 2, k=-60.0, add=mpos[2])

    # ---- 月の光の粒（雨・滞在）と、門の火の粉。光るだけの小さな球（物の形は持たせない）
    mote_me = {}
    for key, r in (("mote_moon", 0.065), ("mote_gold", 0.065), ("spark", 0.075)):
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r)
        me = bpy.data.meshes.new(f"{key}_ball")
        bm.to_mesh(me)
        bm.free()
        me.materials.append(mats[key])
        mote_me[key] = me
    for m in MO.MOTES:
        ob = bpy.data.objects.new(m["name"], mote_me["mote_gold" if m["gold"] else "mote_moon"])
        s.objects.link(ob)
    for e in MO.EMBERS:
        ob = bpy.data.objects.new(e["name"], mote_me["spark"])
        s.objects.link(ob)

    # ---- こうもり（体と、羽2枚。羽は y の軸で羽ばたく）
    def bat_meshes():
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=2, radius=0.1)
        for v in bm.verts:
            v.co = Vector((v.co.x * 0.75, v.co.y * 1.35, v.co.z * 0.85))
        r2 = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=0.065)
        for v in r2["verts"]:
            v.co += Vector((0, 0.13, 0.03))
        for sx in (-1, 1):
            a = bm.verts.new((sx * 0.025, 0.15, 0.07))
            b2 = bm.verts.new((sx * 0.06, 0.13, 0.07))
            c = bm.verts.new((sx * 0.05, 0.15, 0.15))
            bm.faces.new((a, b2, c))
        body = bpy.data.meshes.new("bat_body")
        bm.to_mesh(body)
        bm.free()
        wing = [(0.0, 0.05), (0.1, 0.11), (0.22, 0.14), (0.36, 0.13), (0.46, 0.06), (0.4, 0.0), (0.35, -0.06), (0.3, -0.01),
                (0.24, -0.08), (0.18, -0.02), (0.11, -0.07), (0.05, -0.02), (0.0, -0.05)]
        mes = {}
        for side in (-1, 1):
            gg = Geo()
            pts = [(side * x, y, 0.0) for x, y in wing]
            if side < 0:
                pts = list(reversed(pts))
            gg.face(pts)
            mes[side] = gg.finish(f"bat_wing{side}")
        return body, mes
    body_me, wing_me = bat_meshes()
    body_me.materials.append(mats["bat"])
    for side in (-1, 1):
        wing_me[side].materials.append(mats["bat"])
    for b in MO.BATS:
        parent = root if b["name"] in MO.ROOT_KIDS else None
        ob = bpy.data.objects.new(b["name"], None)
        s.objects.link(ob)
        ob.parent = parent
        holder = bpy.data.objects.new(b["name"] + "_body", body_me)
        s.objects.link(holder)
        holder.parent = ob
        k = 0.6 if b["name"].startswith("bat_o") else 1.0
        ob.empty_display_size = 0.2
        holder.scale = (k, k, k)
        for side in (-1, 1):
            w = bpy.data.objects.new(f"{b['name']}_w{side}", wing_me[side])
            s.objects.link(w)
            w.parent = holder
            w.location = (side * 0.05, 0.0, 0.02)
            ctl(f"{b['name']}_flap", w, "rotation_euler", 1, k=side * 0.95)

    # ---- 落ち葉（舞う）。色は rnd の UV で決まるので、色違いの形を3つ作って順に使う
    leaf_mes = []
    for k, tag in enumerate(((0.35, 0.5), (0.62, 0.5), (0.86, 0.5))):
        g = Geo()
        g.tag = tag
        g.face([(x * 0.42, y * 0.42, z * 0.42) for x, y, z in LEAF], [((x + 0.6) / 1.2, (y + 0.6) / 1.2) for x, y, _ in LEAF])
        me = g.finish(f"leaf_one{k}")
        me.materials.append(mats["leaf"])
        leaf_mes.append(me)
    for k, lf in enumerate(MO.LEAVES):
        ob = bpy.data.objects.new(lf["name"], leaf_mes[k % 3])
        s.objects.link(ob)

    # ---- 光の粒
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.06)
    spk_me = bpy.data.meshes.new("spark")
    bm.to_mesh(spk_me)
    bm.free()
    spk_me.materials.append(mats["spark"])
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.05)
    spkf_me = bpy.data.meshes.new("spark_front")
    bm.to_mesh(spkf_me)
    bm.free()
    spkf_me.materials.append(mats["spark_front"])
    for sp in MO.SPARKS_BACK:
        ob = bpy.data.objects.new(sp["name"], spk_me)
        s.objects.link(ob)
        if sp["name"] in MO.ROOT_KIDS:
            ob.parent = root
    for sp in MO.SPARKS_FRONT:
        ob = bpy.data.objects.new(sp["name"], spkf_me)
        cols["front"].objects.link(ob)

    # ---- 光
    def light(name, kind, energy, color, loc, rot=None, parent=None, **kw):
        L = bpy.data.lights.new(name, kind)
        L.energy = energy
        L.color = color
        for k2, v in kw.items():
            setattr(L, k2, v)
        ob = bpy.data.objects.new(name, L)
        s.objects.link(ob)
        ob.location = loc
        if rot is not None:
            ob.rotation_euler = rot
        if parent is not None:
            ob.parent = parent
        return L, ob

    def aim(d):
        return Vector(d).normalized().to_track_quat("-Z", "Y").to_euler()
    L, _ = light("moon_key", "SUN", 2.6, (0.7, 0.78, 1.0), (0, 0, 0), aim((-0.45, -0.75, -0.55)), angle=math.radians(0.6))
    ctl("key", L, "energy", k=2.6)
    L, _ = light("fill", "SUN", 0.9, (0.58, 0.6, 1.0), (0, 0, 0), aim((0.4, 0.85, -0.45)), angle=math.radians(3))
    ctl("key", L, "energy", k=0.9)
    L, _ = light("gate_area", "AREA", 0.0, (1.0, 0.66, 0.3), (0, GY + 2.0, 3.2), Euler((math.radians(-90), 0, 0)), root,
                 shape="RECTANGLE", size=2 * HW, size_y=SPRING + HW)
    ctl("gate", L, "energy", k=7000.0)
    L, _ = light("gate_point", "POINT", 0.0, (1.0, 0.68, 0.34), (0, GY - 3.2, 1.3), None, root, shadow_soft_size=1.2)
    ctl("gate", L, "energy", k=1400.0)
    for k2, (lx, ly, lz) in enumerate(((-3.2, 0.1, B + 0.3), (2.2, -0.1, B + 0.3), (-7.0, 0.0, B - 2.0), (7.0, 0.6, B - 1.8), (-4.3, 0.4, B + 0.2))):
        L, _ = light(f"uplight{k2}", "SPOT", 0.0, (1.0, 0.72, 0.42), (lx, ly - 1.4, lz), aim((0.0, 0.45, 1.0)), root,
                     spot_size=math.radians(80), spot_blend=0.9, shadow_soft_size=0.5)
        ctl("uplight", L, "energy", k=1500.0)
    L, ob = light("ayato_flash", "POINT", 0.0, (1.0, 0.75, 0.4), (0, 0, 0), None, None, shadow_soft_size=1.0)
    ctl("flash", L, "energy", k=9000.0)
    # 前の上（カメラの左上）からの月の光。ピポとあやとの板に当たって縁の厚み（法線の絵）で陰ができ、
    # ピポの影が露台の戸と塔の壁に落ちる。城の上のほうも少し明るくなる
    L, _ = light("char_key", "SPOT", 0.0, (0.75, 0.8, 1.0), (-10.0, -34.0, 30.0), aim((10.0, 27.0, -15.0)), None,
                 spot_size=math.radians(62), spot_blend=0.6, shadow_soft_size=0.4)
    ctl("key", L, "energy", k=14000.0)

    # ---- カメラ
    cd_ = bpy.data.cameras.new("cam")
    cd_.lens = P.CAM["lens"]
    cd_.sensor_fit = "VERTICAL"
    cd_.sensor_height = P.CAM["sensor_h"]
    cd_.shift_y = P.CAM["shift_y"]
    cd_.clip_start = 0.5
    cd_.clip_end = 600
    cd_.dof.use_dof = True
    fx, fy, fz = P.CAM["focus"]
    cd_.dof.focus_distance = P.project((fx, fy, fz))[2]
    cd_.dof.aperture_fstop = P.CAM["fstop"]
    cam = bpy.data.objects.new("cam", cd_)
    s.objects.link(cam)
    cam.location = P.CAM["loc"]
    cam.rotation_euler = (math.radians(90 + P.CAM["pitch_deg"]), 0, 0)
    sc.camera = cam
    ctl("cam_lens", cd_, "lens")
    # 夜空・雲・満月はカメラの子にする。カメラが城のまわりを回り込んでも（t7_motion.orbit_yaw）、空の板の縁が画面に入らない
    from mathutils import Matrix
    base = Matrix.Translation(cam.location) @ cam.rotation_euler.to_matrix().to_4x4()
    for nm in ("sky", "clouds", "moon"):  # 光の筋と暈は月の子なので、月といっしょに付いてくる
        ob = bpy.data.objects[nm]
        ob.parent = cam
        ob.matrix_parent_inverse = base.inverted()

    setup_render(sc, cols, quality)
    return sc, cols


# ================================================================ 描く設定・合成
def setup_render(sc, cols, q):
    Q = QUALITY[q]
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = Q["scene"]
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.adaptive_threshold = Q["thr"]
    sc.cycles.adaptive_min_samples = max(4, Q["scene"] // 4)
    sc.cycles.use_denoising = Q["denoise"]
    try:
        sc.cycles.denoiser = "OPENIMAGEDENOISE"
    except TypeError:
        pass
    # 夜の場面で、光は門・窓・月からしか来ない。跳ね返りは少なくてよい（1コマの秒をいちばん食うのは透明の重なり）
    sc.cycles.max_bounces = 4
    sc.cycles.diffuse_bounces = 1
    sc.cycles.glossy_bounces = 2
    sc.cycles.transmission_bounces = 1
    sc.cycles.transparent_max_bounces = 24
    sc.cycles.volume_bounces = 0
    sc.cycles.caustics_reflective = False
    sc.cycles.caustics_refractive = False
    sc.cycles.blur_glossy = 1.0
    sc.cycles.sample_clamp_indirect = 4.0
    sc.render.film_transparent = True
    sc.render.use_motion_blur = Q["blur"]
    # 0.4 だと落ちる物がぶれて、ぼけ玉に見えた（2026-11-04 の採点。前の版の金貨）。羽ばたく群れも、羽が溶けないように短く
    sc.render.motion_blur_shutter = 0.25
    sc.render.resolution_x = P.W
    sc.render.resolution_y = P.H
    sc.render.resolution_percentage = Q["pct"]
    sc.render.fps = P.FPS
    sc.render.use_persistent_data = True
    sc.render.use_compositing = True
    sc.render.use_sequencer = False
    view = "Standard"
    for cand in ("Khronos PBR Neutral", "Standard"):
        try:
            sc.view_settings.view_transform = cand
            view = cand
            break
        except TypeError:
            continue
    sc.view_settings.look = "None"
    sc.view_settings.exposure = 0.0
    sc.display_settings.display_device = "sRGB"
    META["view_transform"] = view

    # 層は2つ。back（空・城・あやと）を1回で描き、front（前の粒だけ）は粒のほかを読み込まない。
    # 2026-11-04 の試し（4層: 空・城・あやと・前）は、あやとの層が城を holdout で読み込むぶん、城を2回組み立てていた
    vl0 = sc.view_layers[0]
    vl0.name = "back"
    layers = {"back": vl0, "front": sc.view_layers.new("front")}
    for name, vl in layers.items():
        for cname, lc in vl.layer_collection.children.items():
            lc.exclude = (cname == "front") if name == "back" else (cname != "front")
        if name == "front":
            vl.samples = Q["other"]
    compositor(sc, Q)


def compositor(sc, Q):
    sc.use_nodes = True
    nt = sc.node_tree
    nt.nodes.clear()
    comp = nt.nodes.new("CompositorNodeComposite")
    fo = nt.nodes.new("CompositorNodeOutputFile")
    fo.base_path = OUT
    fo.format.file_format = "PNG"
    fo.format.color_mode = "RGB"
    fo.format.color_depth = "8"
    fo.format.compression = 30
    fo.file_slots.clear()
    # (にじみの閾値, 大きさ, 足す量, 十字の光の閾値, 足す量)。にじみは半分の大きさで作る（MEDIUM。光のにじみには細かさが要らない）
    glow = {"back": (1.6, 8, 0.4, 5.0, 0.25), "front": (0.9, 7, 0.8, 2.5, 0.35)}
    alpha_mode = "raw"
    for name in ("back", "front"):
        rl = nt.nodes.new("CompositorNodeRLayers")
        rl.scene = sc
        rl.layer = name
        img = rl.outputs["Image"]
        thr, size, k, streak_thr, sk = glow[name]
        fg = nt.nodes.new("CompositorNodeGlare")
        fg.glare_type = "FOG_GLOW"
        fg.quality = "MEDIUM"
        fg.threshold = thr
        fg.size = size
        fg.mix = 1.0
        nt.links.new(img, fg.inputs["Image"])
        add = nt.nodes.new("CompositorNodeMixRGB")
        add.blend_type = "ADD"
        add.inputs[0].default_value = k
        nt.links.new(img, add.inputs[1])
        nt.links.new(fg.outputs["Image"], add.inputs[2])
        img = add.outputs["Image"]
        st = nt.nodes.new("CompositorNodeGlare")
        st.glare_type = "STREAKS"
        st.quality = "MEDIUM"
        st.threshold = streak_thr
        st.streaks = 4
        st.angle_offset = math.radians(45)
        st.fade = 0.88
        st.mix = 1.0
        nt.links.new(rl.outputs["Image"], st.inputs["Image"])
        add2 = nt.nodes.new("CompositorNodeMixRGB")
        add2.blend_type = "ADD"
        add2.inputs[0].default_value = sk
        nt.links.new(img, add2.inputs[1])
        nt.links.new(st.outputs["Image"], add2.inputs[2])
        img = add2.outputs["Image"]
        ao = nt.nodes.new("CompositorNodeAlphaOver")
        ao.inputs[1].default_value = (0.0, 0.0, 0.0, 1.0)
        nt.links.new(img, ao.inputs[2])
        fo.file_slots.new(f"{name}/c_")
        nt.links.new(ao.outputs["Image"], fo.inputs[len(fo.inputs) - 1])
        fo.file_slots.new(f"{name}/a_")
        slot = fo.file_slots[len(fo.file_slots) - 1]
        slot.use_node_format = False
        slot.format.file_format = "PNG"
        slot.format.color_mode = "BW"
        slot.format.color_depth = "16"
        slot.format.compression = 30
        try:
            slot.format.color_management = "OVERRIDE"
            slot.format.view_settings.view_transform = "Raw"
        except (AttributeError, TypeError) as e:
            log("!! 透明の書き出しを Raw にできなかった", e)
            alpha_mode = "view"
        nt.links.new(rl.outputs["Alpha"], fo.inputs[len(fo.inputs) - 1])
        if name == "back":
            nt.links.new(ao.outputs["Image"], comp.inputs["Image"])
    META["alpha_encoding"] = alpha_mode
    META["layers"] = ["back", "front"]


# ================================================================ 動きをキーにする
def bake():
    chans = {}

    def put(idd, path, index, f, v):
        chans.setdefault((idd, path, index), {})[f] = v
    objs = bpy.data.objects
    t0 = time.time()
    for clip, n in P.CLIPS.items():
        base = P.BASE[clip]
        for f in range(base - 1, base + n + 1):
            u = (f - base) / P.FPS
            if clip == "intro":
                p = MO.pose("intro", max(0.0, u))
            elif clip == "outro" and u < 0:
                p = MO.pose("stay", P.STAY + u)
            else:
                p = MO.pose(clip, min(u, P.OUTRO) if clip == "outro" else u)
            for key, v in p.items():
                if key.startswith("obj:"):
                    _, name, what = key.split(":")
                    ob = objs.get(name)
                    if ob is None:
                        continue
                    path = {"loc": "location", "rot": "rotation_euler", "scale": "scale"}[what]
                    vv = v if isinstance(v, tuple) else (v, v, v)
                    for i in range(3):
                        put(ob, path, i, f, vv[i])
                else:
                    name = key.split(":", 1)[1] if key.startswith("val:") else key.replace(":", "_")
                    for idd, path, index, k, add in CTL.get(name, ()):
                        put(idd, path, index, f, v * k + add)
    n_key = 0
    for (idd, path, index), kv in chans.items():
        frames = sorted(kv)
        vals = [kv[f] for f in frames]
        if max(vals) - min(vals) < 1e-9:
            target = idd.path_resolve(path) if "[" in path or "." in path else getattr(idd, path)
            if index >= 0:
                target[index] = vals[0]
            else:
                _assign(idd, path, vals[0])
            continue
        ad = idd.animation_data or idd.animation_data_create()
        if ad.action is None:
            ad.action = bpy.data.actions.new(f"{idd.name}_act")
        fc = ad.action.fcurves.new(path, index=max(index, 0)) if index >= 0 else ad.action.fcurves.new(path)
        fc.keyframe_points.add(len(frames))
        co = []
        for f in frames:
            co += [float(f), float(kv[f])]
        fc.keyframe_points.foreach_set("co", co)
        try:
            fc.keyframe_points.foreach_set("interpolation", [1] * len(frames))
        except (TypeError, AttributeError):
            for kp in fc.keyframe_points:
                kp.interpolation = "LINEAR"
        fc.update()
        n_key += len(frames)
    sent = {k.split(":", 1)[1] if k.startswith("val:") else k.replace(":", "_") for k in MO.pose("stay", 0.0)}
    unused = sorted(set(CTL) - sent)
    log(f"キー {n_key} 個・曲線 {len(chans)} 本・{time.time() - t0:.1f} 秒。振付けの来ない口: {unused}")


def _assign(idd, path, v):
    # `nodes["x"].outputs[0].default_value`・`key_blocks["flap_s"].value` のような道も、最後の名前の手前まで辿って入れる
    if "." in path:
        head, attr = path.rsplit(".", 1)
        setattr(idd.path_resolve(head), attr, v)
    else:
        setattr(idd, path, v)


# ================================================================ 描く
META = {}
OUT = ""


def main():
    global OUT
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--quality", choices=list(QUALITY), default="preview")
    ap.add_argument("--frames", default="", help='"intro:0 intro:30 stay:5"。空なら全部')
    ap.add_argument("--threads", type=int, default=0)
    args = ap.parse_args(argv)
    OUT = os.path.abspath(args.out)
    os.makedirs(OUT, exist_ok=True)
    t0 = time.time()
    sc, cols = build(args.quality)
    bake()
    if args.threads:
        sc.render.threads_mode = "FIXED"
        sc.render.threads = args.threads
    todo = P.parse_only(args.frames.split()) if args.frames.strip() else P.frames()
    META.update(quality=args.quality, blender=bpy.app.version_string, frames=[], build_sec=round(time.time() - t0, 1),
                samples=QUALITY[args.quality], fps=P.FPS)
    log(f"組み立て {META['build_sec']} 秒（{bpy.app.version_string}・{META.get('view_transform')}・透明 {META.get('alpha_encoding')}）")
    for clip, i in todo:
        f = P.BASE[clip] + i
        sc.frame_set(f)
        t1 = time.time()
        bpy.ops.render.render(write_still=False)
        dt = time.time() - t1
        META["frames"].append({"clip": clip, "i": i, "frame": f, "sec": round(dt, 2)})
        log(f"{clip}:{i:03d}（{f}） {dt:.1f} 秒")
        with open(os.path.join(OUT, "meta.json"), "w") as fh:
            json.dump(META, fh, ensure_ascii=False, indent=1)
    log(f"ぜんぶで {time.time() - t0:.1f} 秒・{len(todo)} コマ")


if __name__ == "__main__":
    main()
