/**
 * 形を作る小道具。車体の塊（角の丸い箱。運転席は前を寝かせる）と、小物を材質ごとに1つへ束ねる桶。
 *
 * - 塊の面は格子に割って丸い角へ押し出す。UV は押し出す前の平らな位置から引く（`uv.ts`）
 * - 陰は頂点の色で足す（下ほど暗く・縦の角に寄るほど暗く・上の帯を少し明るく）。数は sRGB の倍率で書き、
 *   頂点の色（リニア）に直して掛ける。法線は角の丸みより広い半径で回り込ませ、面の縁へなだらかに暗くする
 * - 小物は白い区画を指す UV と頂点の色で塗り、絵と同じ材質で1回に描く（描く回数を減らす）
 */
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  Matrix4,
  Quaternion,
  SphereGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Face } from "./uv";

/** sRGB の明るさの倍率 → 頂点の色（リニア）の倍率 */
export const lin = (f: number): number => Math.pow(f, 2.2);
export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const smooth = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

export type Shear = { x0: number; x1: number; at: (y: number) => number; slope: (y: number) => number };
export type Lump = {
  x: number[];
  y: number[];
  hw: number;
  r: number;
  rn: number;
  shear?: Shear;
  holes?: Partial<Record<Face, number[][]>>;
  cuts?: Partial<Record<Face, { a?: number[]; b?: number[] }>>;
};
export type UVFn = (face: Face, x: number, y: number, z: number) => [number, number];
export type ShadeFn = (face: Face, p: number[], lump: Lump) => number;

const AXES: Record<Face, { n: number; sg: number; a: number; b: number }> = {
  right: { n: 2, sg: 1, a: 0, b: 1 },
  left: { n: 2, sg: -1, a: 0, b: 1 },
  front: { n: 0, sg: 1, a: 2, b: 1 },
  back: { n: 0, sg: -1, a: 2, b: 1 },
  roof: { n: 1, sg: 1, a: 0, b: 2 },
  bottom: { n: 1, sg: -1, a: 0, b: 2 },
};

function coords(lo: number, hi: number, r: number, n: number, extra: number[]): number[] {
  const k = 6;
  const a = [...extra];
  for (let i = 0; i <= k; i++) a.push(lo + (r * i) / k, hi - r + (r * i) / k);
  for (let i = 1; i < n; i++) a.push(lo + r + ((hi - lo - 2 * r) * i) / n);
  const kept = a.filter((v) => v >= lo - 1e-9 && v <= hi + 1e-9).map((v) => Math.round(v * 1e5) / 1e5);
  return [...new Set(kept)].sort((p, q) => p - q);
}

/** 運転席の前を寝かせる: 前の端ほど、高さに応じて後ろへ下げる */
function sheared(s: Shear | undefined, p: number[]): number[] {
  if (!s) return p;
  const g = clamp((p[0] - s.x0) / (s.x1 - s.x0), 0, 1);
  return [p[0] - s.at(p[1]) * g, p[1], p[2]];
}

/** 塊の1面。返す形は位置・法線・UV・頂点の色を持つ（索引つき） */
export function lumpFace(L: Lump, face: Face, uvf: UVFn, shade: ShadeFn): BufferGeometry {
  const F = AXES[face];
  const C = [(L.x[0] + L.x[1]) / 2, (L.y[0] + L.y[1]) / 2, 0];
  const H = [(L.x[1] - L.x[0]) / 2, (L.y[1] - L.y[0]) / 2, L.hw];
  const R = L.r;
  const Rn = Math.min(L.rn, H[0], H[1], H[2]);
  const holes = L.holes?.[face] ?? [];
  const cut = L.cuts?.[face] ?? {};
  const nA = F.a === 0 ? 16 : 8;
  const nB = F.b === 1 ? 8 : 8;
  const ca = coords(C[F.a] - H[F.a], C[F.a] + H[F.a], R, nA, [...holes.flatMap((h) => [h[0], h[1]]), ...(cut.a ?? [])]);
  const cb = coords(C[F.b] - H[F.b], C[F.b] + H[F.b], R, nB, [...holes.flatMap((h) => [h[2], h[3]]), ...(cut.b ?? [])]);
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const P = [0, 0, 0];
  for (const vb of cb) {
    for (const va of ca) {
      P[F.n] = C[F.n] + F.sg * H[F.n];
      P[F.a] = va;
      P[F.b] = vb;
      const loc = [P[0] - C[0], P[1] - C[1], P[2] - C[2]];
      const q = [0, 0, 0];
      const n = [0, 0, 0];
      let dl = 0;
      let nl = 0;
      for (let i = 0; i < 3; i++) {
        const m = H[i] - R;
        const inner = clamp(loc[i], -m, m);
        q[i] = loc[i] - inner;
        dl += q[i] * q[i];
        const mn = H[i] - Rn;
        n[i] = loc[i] - clamp(loc[i], -mn, mn);
        nl += n[i] * n[i];
        q[i] = inner;
      }
      dl = Math.sqrt(dl);
      nl = Math.sqrt(nl);
      const surf = [0, 0, 0];
      for (let i = 0; i < 3; i++) {
        const d = loc[i] - q[i];
        surf[i] = C[i] + q[i] + (d / dl) * R;
        n[i] /= nl;
      }
      const sp = sheared(L.shear, surf);
      if (L.shear) {
        const s = L.shear;
        const inside = surf[0] > s.x0 && surf[0] < s.x1;
        const g = clamp((surf[0] - s.x0) / (s.x1 - s.x0), 0, 1);
        const a = 1 - s.at(surf[1]) * (inside ? 1 / (s.x1 - s.x0) : 0);
        const b = -s.slope(surf[1]) * g;
        const nx = n[0] / a;
        const ny = n[1] - (b / a) * n[0];
        const l = Math.hypot(nx, ny, n[2]);
        n[0] = nx / l;
        n[1] = ny / l;
        n[2] = n[2] / l;
      }
      const flat = sheared(L.shear, P);
      pos.push(sp[0], sp[1], sp[2]);
      nor.push(n[0], n[1], n[2]);
      uv.push(...uvf(face, flat[0], flat[1], flat[2]));
      const f = lin(shade(face, flat, L));
      col.push(f, f, f);
    }
  }
  const na = ca.length;
  const ea = [0, 0, 0];
  const eb = [0, 0, 0];
  ea[F.a] = 1;
  eb[F.b] = 1;
  const cr = [ea[1] * eb[2] - ea[2] * eb[1], ea[2] * eb[0] - ea[0] * eb[2], ea[0] * eb[1] - ea[1] * eb[0]];
  const flip = cr[F.n] * F.sg < 0;
  for (let j = 0; j < cb.length - 1; j++) {
    for (let i = 0; i < na - 1; i++) {
      const ma = (ca[i] + ca[i + 1]) / 2;
      const mb = (cb[j] + cb[j + 1]) / 2;
      if (holes.some((h) => ma > h[0] && ma < h[1] && mb > h[2] && mb < h[3])) continue;
      const v00 = j * na + i;
      const v10 = v00 + 1;
      const v01 = v00 + na;
      const v11 = v01 + 1;
      if (flip) idx.push(v00, v01, v10, v10, v01, v11);
      else idx.push(v00, v10, v01, v10, v11, v01);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

/* ---------------- 小物の桶 ---------------- */

const _c = new Color();
const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _s = new Vector3();
const _p = new Vector3();

export type T9 = [number?, number?, number?, number?, number?, number?, number?, number?, number?];

/** 位置・回転（ラジアン）・大きさ を掛ける */
export function place(g: BufferGeometry, ...t: T9): BufferGeometry {
  const [x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1] = t;
  _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
  return g.applyMatrix4(_m);
}

/** 形を1色に塗り、白い区画を指す UV を付ける（索引を外し、属性をそろえる） */
export function paint(g: BufferGeometry, hex: string | number, uv: [number, number], f = 1): BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(ng.attributes)) if (k !== "position" && k !== "normal") ng.deleteAttribute(k);
  if (!ng.attributes.normal) ng.computeVertexNormals();
  const n = ng.attributes.position.count;
  _c.set(hex as never);
  const c = new Float32Array(n * 3);
  const u = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    c[i * 3] = _c.r * f;
    c[i * 3 + 1] = _c.g * f;
    c[i * 3 + 2] = _c.b * f;
    u[i * 2] = uv[0];
    u[i * 2 + 1] = uv[1];
  }
  ng.setAttribute("color", new BufferAttribute(c, 3));
  ng.setAttribute("uv", new BufferAttribute(u, 2));
  ng.clearGroups();
  return ng;
}

/** 属性をそろえて索引を外す（塊の面など、もう色と UV を持つもの） */
export function flatten(g: BufferGeometry): BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  ng.clearGroups();
  return ng;
}

export class Bucket {
  parts: BufferGeometry[] = [];
  constructor(readonly uv: [number, number]) {}
  /** 小物を1つ足す（色・位置） */
  add(g: BufferGeometry, hex: string | number, ...t: T9): BufferGeometry {
    const p = place(paint(g, hex, this.uv), ...t);
    this.parts.push(p);
    return p;
  }
  /** 色と UV を持つ形をそのまま足す */
  put(g: BufferGeometry): void {
    this.parts.push(flatten(g));
  }
  merge(): BufferGeometry {
    if (!this.parts.length) return new BufferGeometry();
    const g = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    return g;
  }
}

export const rbox = (w: number, h: number, d: number, r = 0.05, seg = 1): BufferGeometry =>
  new RoundedBoxGeometry(w, h, d, seg, Math.max(0.001, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3)));
export const box = (w: number, h: number, d: number): BufferGeometry => new BoxGeometry(w, h, d);
export const cyl = (r1: number, r2: number, h: number, n = 16): BufferGeometry => new CylinderGeometry(r1, r2, h, n);
export const sph = (r: number, a = 12, b = 8): BufferGeometry => new SphereGeometry(r, a, b);
