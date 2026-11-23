/**
 * 外側: 車体（箱と、箱より低い別の塊の運転席）・窓口の扉と台・庇の垂れ・支え棒・車輪・灯り・立て看板・電球。
 *
 * 寸法は `dims.json`。車体の絵は型の区画から引き（`uv.ts`）、小物は白い区画＋頂点の色で、同じ材質の1回に束ねる。
 * 「中をのぞく」で隠すもの（屋根・左の壁とそこに付く小物）は別の束にする。
 */
import {
  BufferGeometry,
  CatmullRomCurve3,
  CircleGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LatheGeometry,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Shape,
  ShapeGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  Color,
} from "three";
import D from "./dims.json";
import { Bucket, box, clamp, cyl, lin, lumpFace, mix, paint, place, rbox, smooth, sph, type Lump, type Shear } from "./geo";
import { extUV, valanceUV, WHITE_UV, type Face } from "./uv";

const SY = D.exterior.span.y;
const HZ = D.box.hw;
const CZ = D.cab.hw;
const HX = [D.hatch.x[0], D.hatch.x[1]];
const HY = [D.hatch.shelf, D.hatch.y[0], D.hatch.y[1]];
const HCX = (HX[0] + HX[1]) / 2;
const HLEN = HX[1] - HX[0];
const AWN = HY[2] - HY[1];
const TAN = Math.tan((D.cab.rake * Math.PI) / 180);

/** 運転席の前を寝かせる量（m）: ボンネットの段 → 15°以上寝かせた前の窓 */
export function setback(y: number): number {
  const [h0, h1] = D.cab.hood;
  const b = D.cab.belt;
  const ramp = smooth(b, b + h0, y) * h1;
  return ramp + Math.max(0, y - (b + h0)) * TAN;
}
function setbackSlope(y: number): number {
  const [h0, h1] = D.cab.hood;
  const b = D.cab.belt;
  const t = clamp((y - b) / h0, 0, 1);
  const ramp = ((6 * t * (1 - t)) / h0) * h1;
  return ramp + (y > b + h0 ? TAN : 0);
}
const SHEAR: Shear = { x0: D.cab.x[0], x1: D.cab.x[1], at: setback, slope: setbackSlope };
/** 運転席の前の面の x（高さ y で） */
export const noseX = (y: number): number => D.cab.x[1] - setback(y);

export const BOX: Lump = {
  x: D.box.x,
  y: D.box.y,
  hw: HZ,
  r: D.box.r,
  rn: D.box.rn,
  holes: { right: [[HX[0], HX[1], HY[0], HY[2]]] },
  cuts: { right: { a: [D.struts.x[0], D.struts.x[1]] } },
};
export const CAB: Lump = { x: D.cab.x, y: D.cab.y, hw: CZ, r: D.cab.r, rn: D.cab.rn, shear: SHEAR, cuts: { front: { b: [D.cab.belt, D.cab.belt + D.cab.hood[0]] } } };

/** 車体の陰（sRGB の倍率）: 下ほど暗く・縦の角に寄るほど暗く・上の帯を少し明るく */
export function extShade(face: Face, p: number[], L: Lump): number {
  if (face === "bottom") return 0.62;
  if (face === "roof") return 1.0;
  const t = (p[1] - SY[0]) / (SY[1] - SY[0]);
  const fb = mix(0.84, 1, smooth(0.04, 0.42, t));
  const ft = mix(1, 1.03, smooth(0.8, 0.95, t));
  const side = face === "left" || face === "right";
  const a = side ? p[0] : p[2];
  const lo = side ? L.x[0] : -L.hw;
  const hi = side ? L.x[1] - (L.shear ? L.shear.at(p[1]) : 0) : L.hw;
  const d = Math.min(a - lo, hi - a);
  const fc = mix(0.93, 1, smooth(0, 0.55, d));
  return fb * ft * fc;
}

export type VanParts = {
  group: Group;
  body: Mesh;
  bodyPeek: Mesh;
  awning: Group;
  awningMesh: Mesh;
  shelf: Group;
  shelfMesh: Mesh;
  valance: Group;
  valanceMesh: Mesh;
  struts: InstancedMesh;
  glow: Mesh;
  menu: Group;
  bulbs: InstancedMesh;
  /** 窓口の開き 0〜1 を形に当てる */
  setOpen(a: number): void;
  /** 庇の垂れの形（縞 / のれん）を替える */
  setValance(kind: string): void;
  /** 扉の縁と内側の色（外装の組の色） */
  setColors(body: string, inner: string): void;
  dispose(): void;
};

const TIRE = [
  [0.25, -0.15],
  [0.39, -0.15],
  [0.44, -0.12],
  [0.46, -0.06],
  [0.46, 0.06],
  [0.44, 0.12],
  [0.39, 0.15],
  [0.25, 0.15],
].map((p) => new Vector2(p[0], p[1]));

function roundedRect(x0: number, x1: number, y0: number, y1: number, r: number): Shape {
  const s = new Shape();
  s.moveTo(x0 + r, y0);
  s.lineTo(x1 - r, y0);
  s.quadraticCurveTo(x1, y0, x1, y0 + r);
  s.lineTo(x1, y1 - r);
  s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1);
  s.quadraticCurveTo(x0, y1, x0, y1 - r);
  s.lineTo(x0, y0 + r);
  s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}

function quadShape(pts: number[][], r: number): Shape {
  // 角を丸めた四角（窓）。pts は左下から反時計回り
  const s = new Shape();
  const n = pts.length;
  const at = (i: number) => pts[(i + n) % n];
  const toward = (a: number[], b: number[], d: number) => {
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return [a[0] + ((b[0] - a[0]) * d) / l, a[1] + ((b[1] - a[1]) * d) / l];
  };
  for (let i = 0; i < n; i++) {
    const p = at(i);
    const a = toward(p, at(i - 1), r);
    const b = toward(p, at(i + 1), r);
    if (i === 0) s.moveTo(a[0], a[1]);
    else s.lineTo(a[0], a[1]);
    s.quadraticCurveTo(p[0], p[1], b[0], b[1]);
  }
  s.closePath();
  return s;
}

/** 平らな形（xy の面）にガラスの縦の階調を塗る */
function glassGeo(shape: Shape, y0: number, y1: number, tone = 1): BufferGeometry {
  const g = paint(new ShapeGeometry(shape, 6), "#ffffff", WHITE_UV);
  const pos = g.attributes.position;
  const col = g.attributes.color;
  const top = new Color("#dff5ff");
  const bot = new Color("#8fcdf2");
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const t = clamp((pos.getY(i) - y0) / (y1 - y0), 0, 1);
    c.copy(bot).lerp(top, t).multiplyScalar(tone);
    col.setXYZ(i, c.r, c.g, c.b);
  }
  return g;
}

/** ガラスの白い筋（斜めの2本）。窓の左下から右上へ */
function shineGeo(x0: number, x1: number, y0: number, y1: number): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  const w = x1 - x0;
  const h = y1 - y0;
  for (const [c, k] of [
    [0.3, 0.16],
    [0.52, 0.06],
  ]) {
    const s = new Shape();
    const xa = x0 + w * c;
    const sl = h * 0.42;
    s.moveTo(xa - sl * 0.5, y0 + h * 0.12);
    s.lineTo(xa - sl * 0.5 + w * k, y0 + h * 0.12);
    s.lineTo(xa + sl * 0.5 + w * k, y1 - h * 0.12);
    s.lineTo(xa + sl * 0.5, y1 - h * 0.12);
    s.closePath();
    out.push(paint(new ShapeGeometry(s), "#f3fbff", WHITE_UV));
  }
  return out;
}

/** 窓口の扉と台: 外の面に、型の「右」の区画の同じところを当てる（閉じると絵がつながる） */
function flapGeo(x0: number, x1: number, y0: number, y1: number, t: number, r: number, inner: string, edge: string): BufferGeometry {
  const g0 = rbox(x1 - x0, y1 - y0, t, r, 3);
  const g = g0.index ? g0.toNonIndexed() : g0;
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const n = pos.count;
  const uv = new Float32Array(n * 2);
  const col = new Float32Array(n * 3);
  const ci = new Color(inner);
  const ce = new Color(edge);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  for (let i = 0; i < n; i += 3) {
    let nz = 0;
    for (let k = 0; k < 3; k++) nz += nor.getZ(i + k);
    const outer = nz / 3 > 0.7;
    const back = nz / 3 < -0.7;
    for (let k = 0; k < 3; k++) {
      const j = i + k;
      if (outer) {
        const x = cx + pos.getX(j);
        const y = cy + pos.getY(j);
        const [u, v] = extUV("right", x, y, HZ);
        uv[j * 2] = u;
        uv[j * 2 + 1] = v;
        const f = lin(extShade("right", [x, y, HZ], BOX));
        col.set([f, f, f], j * 3);
      } else {
        uv[j * 2] = WHITE_UV[0];
        uv[j * 2 + 1] = WHITE_UV[1];
        const c = back ? ci : ce;
        col.set([c.r, c.g, c.b], j * 3);
      }
    }
  }
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new Float32BufferAttribute(col, 3));
  g.clearGroups();
  return g;
}

/** 庇の垂れ。縞（下を丸めた舌）か、のれん（切れ目のある長い布）。UV は型の「垂れ」の区画 */
function valanceGeo(kind: string): BufferGeometry {
  const V = D.valance;
  const parts: BufferGeometry[] = [];
  const noren = kind === "noren";
  const h = noren ? V.noren.h : V.stripes.h;
  const n = noren ? V.noren.n : V.stripes.n;
  const gap = noren ? V.noren.gap : 0;
  const w = (HLEN - gap * (n - 1)) / n;
  for (let i = 0; i < n; i++) {
    const x0 = -HLEN / 2 + i * (w + gap);
    const x1 = x0 + w;
    const s = new Shape();
    if (noren) {
      s.moveTo(x0, 0);
      s.lineTo(x0, -h + 0.02);
      s.quadraticCurveTo(x0, -h, x0 + 0.02, -h);
      s.lineTo(x1 - 0.02, -h);
      s.quadraticCurveTo(x1, -h, x1, -h + 0.02);
      s.lineTo(x1, 0);
    } else {
      const r = w / 2;
      s.moveTo(x0, 0);
      s.lineTo(x0, -h + r);
      s.absarc((x0 + x1) / 2, -h + r, r, Math.PI, 0, false);
      s.lineTo(x1, 0);
    }
    s.closePath();
    const g = new ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: false, curveSegments: 8 });
    const ng = g.index ? g.toNonIndexed() : g;
    const pos = ng.attributes.position;
    const uv = new Float32Array(pos.count * 2);
    const col = new Float32Array(pos.count * 3);
    for (let j = 0; j < pos.count; j++) {
      const [u, v] = valanceUV((pos.getX(j) + HLEN / 2) / HLEN, 1 + pos.getY(j) / h);
      uv[j * 2] = u;
      uv[j * 2 + 1] = v;
      col.set([1, 1, 1], j * 3);
    }
    ng.setAttribute("uv", new Float32BufferAttribute(uv, 2));
    ng.setAttribute("color", new Float32BufferAttribute(col, 3));
    ng.clearGroups();
    parts.push(ng);
  }
  // 垂れを留める細い棒（庇の縁の下）
  const bar = paint(rbox(HLEN + 0.02, 0.03, 0.03, 0.012), "#f4efe4", WHITE_UV);
  place(bar, 0, -0.01, 0.006);
  parts.push(bar);
  const b = new Bucket(WHITE_UV);
  for (const p of parts) b.put(p);
  return b.merge();
}

export function buildVan(skinMat: Material, glowMat: MeshBasicMaterial, bulbMat: MeshBasicMaterial): VanParts {
  const group = new Group();
  const ext = new Bucket(WHITE_UV);
  const peek = new Bucket(WHITE_UV);
  const glow = new Bucket(WHITE_UV);

  // ---- 車体: 箱と運転席の2つの塊 ----
  const peekFaces: Face[] = ["roof", "left"];
  for (const [L, faces] of [
    [BOX, ["right", "left", "front", "back", "roof", "bottom"]],
    [CAB, ["right", "left", "front", "roof", "bottom"]],
  ] as [Lump, Face[]][]) {
    for (const f of faces) {
      const g = lumpFace(L, f, extUV, extShade);
      (peekFaces.includes(f) ? peek : ext).put(g);
    }
  }

  // ---- 車輪と車輪の覆い ----
  const W = D.wheels;
  for (const ax of W.x) {
    const cab = ax > D.box.x[1] - 0.2;
    const sideZ = cab ? CZ : HZ;
    for (const sd of [1, -1]) {
      const b = sd < 0 ? peek : ext;
      const zc = sd * (HZ + W.out - W.w / 2);
      ext.add(new LatheGeometry(TIRE, 24), "#575a6e", ax, W.r, zc, Math.PI / 2);
      ext.add(cyl(0.25, 0.25, 0.03, 24), "#f6f1e6", ax, W.r, sd * (HZ + W.out + 0.004), Math.PI / 2);
      ext.add(sph(0.09, 14, 8), "#ffcf5a", ax, W.r, sd * (HZ + W.out + 0.02), 0, 0, 0, 1, 1, 0.45);
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        ext.add(sph(0.028, 8, 6), "#e3dccb", ax + Math.cos(a) * 0.16, W.r + Math.sin(a) * 0.16, sd * (HZ + W.out + 0.018), 0, 0, 0, 1, 1, 0.5);
      }
      // 覆いの暗い内側と縁。下の端は車体の丸みから浮くので、水平から 0.25rad 上で止める
      b.add(new CircleGeometry(W.arch, 28, 0.25, Math.PI - 0.5), "#4f5168", ax, W.r, sd * (sideZ + 0.004), 0, sd < 0 ? Math.PI : 0, 0);
      b.add(new TorusGeometry(W.arch, 0.05, 8, 24, Math.PI - 0.5), "#f4efe4", ax, W.r, sd * (sideZ + 0.012), 0, 0, 0.25);
    }
  }

  // ---- バンパー・前の顔・灯り ----
  const NOSE = D.cab.x[1];
  const BU = D.bumper;
  ext.add(rbox(0.26, BU.h, 2.18, 0.11, 3), "#f6f2e8", NOSE + BU.front - 0.13, BU.y, 0);
  ext.add(rbox(0.24, BU.h, 2.2, 0.11, 3), "#f6f2e8", D.box.x[0] - BU.back + 0.12, BU.y, 0);
  for (const sd of [1, -1]) {
    ext.add(rbox(0.03, 0.12, 0.34, 0.03), "#ff7a59", NOSE + BU.front + 0.002, BU.y, sd * 0.62);
  }
  const LH = D.lights.head;
  ext.add(rbox(0.05, 0.3, 0.7, 0.08), "#c3ccd6", NOSE + 0.01, LH.y, 0);
  for (const y of [-0.08, 0, 0.08]) ext.add(rbox(0.02, 0.035, 0.56, 0.015), "#97a3b3", NOSE + 0.035, LH.y + y, 0);
  for (const sd of [1, -1]) {
    glow.add(cyl(LH.r, LH.r, 0.05, 28), "#fff6c9", NOSE + 0.01, LH.y, sd * LH.z, 0, 0, Math.PI / 2);
    ext.add(new TorusGeometry(LH.r + 0.012, 0.03, 10, 28), "#efeadf", NOSE + 0.03, LH.y, sd * LH.z, 0, Math.PI / 2);
    glow.add(sph(0.055, 12, 8), "#ffb347", NOSE - 0.01, LH.y - 0.25, sd * (LH.z + 0.1), 0, 0, 0, 0.6, 1, 1);
  }
  // 鏡と取っ手
  for (const sd of [1, -1]) {
    const b = sd < 0 ? peek : ext;
    const mx = noseX(1.5) - 0.12;
    b.add(rbox(0.06, 0.06, 0.2, 0.025), "#e0dbcf", mx, 1.5, sd * (CZ + 0.1));
    b.add(rbox(0.08, 0.26, 0.17, 0.04), "#f6f2e8", mx - 0.02, 1.53, sd * (CZ + 0.22));
    b.add(rbox(0.06, 0.2, 0.012, 0.02), "#a9c9dd", mx + 0.025, 1.53, sd * (CZ + 0.22));
    b.add(rbox(0.18, 0.045, 0.04, 0.018), "#c3ccd6", 1.15, 1.42, sd * (CZ + 0.012));
  }
  // 後ろ: 灯り・取っ手
  const BX = D.box.x[0];
  const TL = D.lights.tail;
  for (const sd of [1, -1]) {
    glow.add(rbox(0.05, TL.y[1] - TL.y[0], 0.16, 0.05), "#ff6a5c", BX - 0.006, (TL.y[0] + TL.y[1]) / 2, sd * TL.z);
    glow.add(rbox(0.05, 0.1, 0.16, 0.04), "#ffb347", BX - 0.006, TL.y[0] - 0.1, sd * TL.z);
  }
  ext.add(rbox(0.04, 0.05, 0.2, 0.02), "#c3ccd6", BX - 0.012, 1.4, 0.18);
  // 屋根の換気口
  peek.add(rbox(0.56, 0.16, 0.56, 0.07, 3), "#eae6dc", -0.95, D.box.y[1] + 0.04, 0);
  peek.add(rbox(0.4, 0.05, 0.4, 0.02), "#d6d1c4", -0.95, D.box.y[1] + 0.13, 0);

  // ---- 窓（ガラスは絵と同じ材質。縦の階調と白い筋） ----
  const WIN = D.windows;
  const frameCol = "#f7f4ec";
  // 前の窓: 寝かせた面に沿わせる（高さ y → x は noseX(y)）
  {
    const [y0, y1] = WIN.shield.y;
    const z = WIN.shield.z;
    const k = 1 / Math.hypot(1, TAN);
    const off = (o: number) => (g: BufferGeometry) => {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const lz = p.getX(i);
        const ly = p.getY(i);
        p.setXYZ(i, noseX(ly) + o * k, ly + o * TAN * k, -lz);
      }
      g.computeVertexNormals();
      return g;
    };
    const frame = paint(new ShapeGeometry(roundedRect(-z - 0.05, z + 0.05, y0 - 0.05, y1 + 0.04, 0.1), 6), frameCol, WHITE_UV);
    ext.put(off(0.006)(frame));
    ext.put(off(0.012)(glassGeo(roundedRect(-z, z, y0, y1, 0.08), y0, y1, 1.02)));
    for (const s of shineGeo(-z, z, y0, y1)) ext.put(off(0.016)(s));
  }
  // 運転席の横の窓（前の辺は前の窓と同じ角度）
  for (const sd of [1, -1]) {
    const b = sd < 0 ? peek : ext;
    const [y0, y1] = WIN.cab.y;
    const x0 = WIN.cab.x0;
    const xa = noseX(y0) - WIN.cab.inset;
    const xb = noseX(y1) - WIN.cab.inset;
    const shape = quadShape(
      [
        [x0, y0],
        [xa, y0],
        [xb, y1],
        [x0, y1],
      ],
      0.07,
    );
    const fr = quadShape(
      [
        [x0 - 0.045, y0 - 0.045],
        [xa + 0.05, y0 - 0.045],
        [xb + 0.05, y1 + 0.04],
        [x0 - 0.045, y1 + 0.04],
      ],
      0.1,
    );
    const toSide = (g: BufferGeometry, o: number) => {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i), p.getY(i), sd * (CZ + o));
      if (sd < 0) {
        // 左の面は外から見て裏返し
        const idx = g.index;
        if (!idx) {
          for (let i = 0; i < p.count; i += 3) {
            const t = [p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1)];
            p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2));
            p.setXYZ(i + 2, t[0], t[1], t[2]);
          }
        }
      }
      g.computeVertexNormals();
      return g;
    };
    b.put(toSide(paint(new ShapeGeometry(fr, 6), frameCol, WHITE_UV), 0.006));
    b.put(toSide(glassGeo(shape, y0, y1), 0.012));
    for (const s of shineGeo(x0, xa, y0, y1)) b.put(toSide(s, 0.016));
  }
  // 左の小窓・後ろの窓
  const sideWin = (b: Bucket, x0: number, x1: number, y0: number, y1: number, z: number, sd: number, axis: "z" | "x") => {
    const put = (g: BufferGeometry, o: number) => {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const a = p.getX(i);
        const yy = p.getY(i);
        if (axis === "z") p.setXYZ(i, a, yy, sd * (z + o));
        else p.setXYZ(i, sd * (z + o), yy, a);
      }
      // 外から見て表になるよう、向きを合わせる
      const flipIt = axis === "z" ? sd < 0 : sd > 0;
      if (flipIt) {
        for (let i = 0; i < p.count; i += 3) {
          const t = [p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1)];
          p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2));
          p.setXYZ(i + 2, t[0], t[1], t[2]);
        }
      }
      g.computeVertexNormals();
      b.put(g);
    };
    put(paint(new ShapeGeometry(roundedRect(x0 - 0.045, x1 + 0.045, y0 - 0.045, y1 + 0.045, 0.11), 6), frameCol, WHITE_UV), 0.006);
    put(glassGeo(roundedRect(x0, x1, y0, y1, 0.08), y0, y1), 0.012);
    for (const s of shineGeo(x0, x1, y0, y1)) put(s, 0.016);
  };
  sideWin(peek, WIN.small.x[0], WIN.small.x[1], WIN.small.y[0], WIN.small.y[1], HZ, -1, "z");
  for (const [z0, z1] of WIN.rear.z) sideWin(ext, z0, z1, WIN.rear.y[0], WIN.rear.y[1], -BX, -1, "x");

  // ---- 窓口の枠（開いたときに見える厚み） ----
  const jz = HZ - 0.045;
  ext.add(box(HLEN + 0.02, 0.012, 0.09), "#fbf8f0", HCX, HY[2] - 0.006, jz);
  ext.add(box(HLEN + 0.02, 0.012, 0.09), "#fbf8f0", HCX, HY[0] + 0.006, jz);
  for (const x of HX) ext.add(box(0.012, HY[2] - HY[0], 0.09), "#fbf8f0", x + (x < HCX ? 0.006 : -0.006), (HY[0] + HY[2]) / 2, jz);

  // ---- 窓口の扉（上に開いて庇になる）と台（下に倒れる） ----
  const awning = new Group();
  awning.position.set(HCX, HY[2], HZ);
  const AT = D.hatch.awning;
  const awningMesh = new Mesh(flapGeo(HX[0], HX[1], HY[1], HY[2], AT, 0.03, "#fff3d6", "#ffffff"), skinMat);
  awningMesh.position.set(0, -AWN / 2, -AT / 2);
  awning.add(awningMesh);
  const shelf = new Group();
  shelf.position.set(HCX, HY[0], HZ);
  const ST = D.hatch.shelfT;
  const shelfGeo = (() => {
    const g = flapGeo(HX[0], HX[1], HY[0], HY[1], ST, 0.02, "#e8bd86", "#f4e2c4");
    place(g, 0, (HY[1] - HY[0]) / 2, -ST / 2);
    // 縁: 閉じると内側に隠れ、開くと台の外の端で上に立つ
    const lip = paint(rbox(HLEN - 0.02, 0.03, D.hatch.lip, 0.012), "#d9a66b", WHITE_UV);
    place(lip, 0, HY[1] - HY[0] - 0.02, -ST - D.hatch.lip / 2 + 0.004);
    const b = new Bucket(WHITE_UV);
    b.put(g);
    b.put(lip);
    return b.merge();
  })();
  const shelfMesh = new Mesh(shelfGeo, skinMat);
  shelf.add(shelfMesh);

  // ---- 庇の垂れ（縁から真下へ垂らす） ----
  const valance = new Group();
  let valanceKind = "stripes";
  const valanceMesh = new Mesh(valanceGeo(valanceKind), skinMat);
  valanceMesh.position.set(0, 0, 0);
  valance.add(valanceMesh);

  // ---- 支え棒2本（壁から庇の裏へ） ----
  const strutGeo = paint(cyl(0.02, 0.02, 1, 10), "#7a8091", WHITE_UV);
  const struts = new InstancedMesh(strutGeo, skinMat, 2);

  // ---- 立て看板（字なし。チョークでたい焼きの絵） ----
  const menu = new Group();
  menu.position.set(1.25, 0, HZ + 1.0);
  menu.rotation.y = -0.45;
  const mb = new Bucket(WHITE_UV);
  for (const s of [1, -1]) mb.add(rbox(0.6, 0.9, 0.045, 0.03), "#c98a4b", 0, 0.45, s * 0.12, -s * 0.27);
  mb.add(box(0.48, 0.7, 0.01), "#3f6b5a", 0, 0.47, 0.152 + 0.004, -0.27);
  const fish = (cx: number, cy: number, s: number, col: string) => {
    const sh = new Shape();
    sh.absellipse(cx, cy, 0.075 * s, 0.045 * s, 0, Math.PI * 2, false, 0);
    const tail = new Shape();
    tail.moveTo(cx - 0.065 * s, cy);
    tail.lineTo(cx - 0.12 * s, cy + 0.045 * s);
    tail.lineTo(cx - 0.12 * s, cy - 0.045 * s);
    tail.closePath();
    for (const g of [new ShapeGeometry(sh, 10), new ShapeGeometry(tail)]) {
      const p = paint(g, col, WHITE_UV);
      place(p, 0, 0, 0);
      const m = new Matrix4().makeRotationX(-0.27);
      p.applyMatrix4(new Matrix4().makeTranslation(0, 0.47, 0.163).multiply(m).multiply(new Matrix4().makeTranslation(0, -0.47, 0)));
      p.translate(0, 0, 0);
      mb.put(p);
    }
  };
  fish(0.02, 0.66, 1.1, "#ffe38a");
  fish(-0.05, 0.47, 1.0, "#ffc2d4");
  fish(0.06, 0.29, 0.9, "#bfe6ff");
  const menuMesh = new Mesh(mb.merge(), skinMat);
  menu.add(menuMesh);

  // ---- 電球（夕方に灯る）と電線: 開いた庇の縁から垂らす ----
  const bulbs = new InstancedMesh(sph(0.045, 12, 8), bulbMat, 9);
  const lights = new Group();
  const wire: Vector3[] = [];
  const BC = ["#fff1b8", "#ffd0a0", "#ffe28a"];
  const _m4 = new Matrix4();
  const _col = new Color();
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    wire.push(new Vector3(-HLEN / 2 + 0.05 + (HLEN - 0.1) * t, -0.12 * 4 * t * (1 - t), 0.0));
  }
  for (let i = 0; i < 9; i++) {
    const t = (i + 0.5) / 9;
    bulbs.setMatrixAt(i, _m4.makeTranslation(-HLEN / 2 + 0.05 + (HLEN - 0.1) * t, -0.06 - 0.12 * 4 * t * (1 - t), 0.0));
    bulbs.setColorAt(i, _col.set(BC[i % 3]));
  }
  const wireGeo = paint(new TubeGeometry(new CatmullRomCurve3(wire), 24, 0.006, 4), "#6a6f80", WHITE_UV);
  const wireMesh = new Mesh(wireGeo, skinMat);
  lights.add(bulbs, wireMesh);
  lights.position.y = -(D.valance.stripes.h + 0.05);
  valance.add(lights);

  // ---- 束ねる ----
  const body = new Mesh(ext.merge(), skinMat);
  const bodyPeek = new Mesh(peek.merge(), skinMat);
  bodyPeek.userData.peek = true;
  const glowMesh = new Mesh(glow.merge(), glowMat);
  group.add(body, bodyPeek, glowMesh, awning, shelf, valance, struts, menu);
  for (const m of [body, bodyPeek, awningMesh, shelfMesh, menuMesh, valanceMesh, struts]) m.castShadow = true;

  const hinge = new Vector3();
  const tip = new Vector3();
  const up = new Vector3(0, 1, 0);
  const dir = new Vector3();
  const mid = new Vector3();
  const quat = new Object3D();
  const rad = (D.hatch.deg * Math.PI) / 180;

  function setOpen(a: number): void {
    const aw = smooth(0, 1, clamp(a * 1.25, 0, 1));
    const sh = smooth(0, 1, clamp(a * 1.25 - 0.25, 0, 1));
    const mn = smooth(0, 1, clamp((a - 0.7) / 0.3, 0, 1));
    awning.rotation.x = -rad * aw;
    shelf.rotation.x = (Math.PI / 2) * sh;
    awning.updateMatrixWorld(true);
    // 庇の縁（開いた庇の外の端の下の角）
    tip.set(0, -AWN, -AT).applyMatrix4(awning.matrix);
    valance.position.copy(tip);
    const vs = smooth(0.35, 0.95, aw);
    valance.visible = vs > 0.001;
    valance.scale.set(1, Math.max(vs, 0.001), 1);
    bulbs.visible = wireMesh.visible = a > 0.98;
    menu.visible = mn > 0.001;
    menu.scale.set(1, Math.max(mn, 0.001), 1);
    // 支え棒: 壁の点 → 庇の裏の点
    struts.visible = aw > 0.12;
    const sx = D.struts.x;
    for (let i = 0; i < 2; i++) {
      hinge.set(sx[i], D.struts.y, HZ + 0.02);
      const ax = clamp(sx[i], HX[0] + 0.08, HX[1] - 0.08) - HCX;
      tip.set(ax, -AWN * D.struts.at, -AT - 0.005).applyMatrix4(awning.matrix);
      dir.subVectors(tip, hinge);
      const len = Math.max(dir.length(), 0.001);
      mid.addVectors(hinge, tip).multiplyScalar(0.5);
      quat.position.copy(mid);
      quat.quaternion.setFromUnitVectors(up, dir.normalize());
      quat.scale.set(1, len, 1);
      quat.updateMatrix();
      struts.setMatrixAt(i, quat.matrix);
    }
    struts.instanceMatrix.needsUpdate = true;
  }

  function setValance(kind: string): void {
    const k = kind === "noren" ? "noren" : "stripes";
    if (k === valanceKind) return;
    valanceKind = k;
    valanceMesh.geometry.dispose();
    valanceMesh.geometry = valanceGeo(k);
    lights.position.y = -((k === "noren" ? D.valance.noren.h : D.valance.stripes.h) + 0.05);
  }

  function setColors(bodyHex: string, innerHex: string): void {
    for (const [mesh, x0, x1, y0, y1, t, r, inner] of [
      [awningMesh, HX[0], HX[1], HY[1], HY[2], AT, 0.03, innerHex],
    ] as [Mesh, number, number, number, number, number, number, string][]) {
      mesh.geometry.dispose();
      mesh.geometry = flapGeo(x0, x1, y0, y1, t, r, inner, bodyHex);
    }
  }

  setOpen(0);
  return {
    group,
    body,
    bodyPeek,
    awning,
    awningMesh,
    shelf,
    shelfMesh,
    valance,
    valanceMesh,
    struts,
    glow: glowMesh,
    menu,
    bulbs,
    setOpen,
    setValance,
    setColors,
    dispose() {
      group.traverse((o) => {
        const m = o as Mesh;
        if (m.geometry) m.geometry.dispose();
      });
    },
  };
}

export const HATCH = { x: HX, y: HY, cx: HCX, len: HLEN, z: HZ };
