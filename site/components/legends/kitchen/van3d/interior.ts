/**
 * 中: 床・内壁（内装の絵）・運転席・区画（台所・冷蔵庫・タンク・寝床）。
 *
 * 区画の長さと決まりは `dims.json` の `layout`。並べ替えは画面の一覧（↑↓）が決め、ここは映すだけ。
 * 調理（cook）と生活（live）が隣り合う所には仕切りを立てる（Regulation (EC) No 852/2004 Annex II Chapter III）。
 */
import { BufferGeometry, Float32BufferAttribute, Group, Material, Mesh, TorusGeometry, CapsuleGeometry } from "three";
import D from "./dims.json";
import { Bucket, box, cyl, lin, mix, place, rbox, smooth, sph } from "./geo";
import { INNER_WHITE_UV, innerUV, type Face } from "./uv";
import { spans } from "./layout";

export { checkOrder, DEFAULT_ORDER } from "./layout";

const L = D.layout;
const SPAN = D.interior.span;
const [X0, X1] = SPAN.x;
const [Y0, Y1] = SPAN.y;
const [Z0, Z1] = SPAN.z;
const FLOOR = D.floor;
const HX = D.hatch.x;
const HY = [D.hatch.shelf, D.hatch.y[1]];
const TOP = D.hatch.y[0];

/** 内壁の1枚（軸に沿った板。穴あき）。UV は内装の型、陰は下ほど暗く */
function wall(face: Face, holes: number[][] = []): BufferGeometry {
  // 板の面: left/right は x-y（z 一定）、back/front は z-y（x 一定）
  const side = face === "left" || face === "right";
  const a0 = side ? X0 : Z0;
  const a1 = side ? X1 : Z1;
  const fixed = face === "left" ? Z0 : face === "right" ? Z1 : face === "back" ? X0 : X1;
  const cutsA = [a0, a1, ...holes.flatMap((h) => [h[0], h[1]])];
  const cutsB = [Y0, Y1, ...holes.flatMap((h) => [h[2], h[3]])];
  for (let i = 1; i < 8; i++) cutsA.push(a0 + ((a1 - a0) * i) / 8);
  for (let i = 1; i < 6; i++) cutsB.push(Y0 + ((Y1 - Y0) * i) / 6);
  const ca = [...new Set(cutsA.filter((v) => v >= a0 && v <= a1).map((v) => Math.round(v * 1e5) / 1e5))].sort((p, q) => p - q);
  const cb = [...new Set(cutsB.filter((v) => v >= Y0 && v <= Y1).map((v) => Math.round(v * 1e5) / 1e5))].sort((p, q) => p - q);
  const pos: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const n = face === "left" ? [0, 0, 1] : face === "right" ? [0, 0, -1] : face === "back" ? [1, 0, 0] : [-1, 0, 0];
  for (const b of cb) {
    for (const a of ca) {
      const p = side ? [a, b, fixed] : [fixed, b, a];
      pos.push(p[0], p[1], p[2]);
      nor.push(n[0], n[1], n[2]);
      uv.push(...innerUV(face, p[0], p[1], p[2]));
      const t = (b - Y0) / (Y1 - Y0);
      const f = lin(mix(0.86, 1, smooth(0, 0.5, t)) * mix(1, 0.96, smooth(0.85, 1, t)));
      col.push(f, f, f);
    }
  }
  const na = ca.length;
  // 中から見て表（法線の向き）になる巻き
  const flip = face === "left" || face === "front";
  for (let j = 0; j < cb.length - 1; j++) {
    for (let i = 0; i < na - 1; i++) {
      const ma = (ca[i] + ca[i + 1]) / 2;
      const mb = (cb[j] + cb[j + 1]) / 2;
      if (holes.some((h) => ma > h[0] && ma < h[1] && mb > h[2] && mb < h[3])) continue;
      const v00 = j * na + i;
      const v10 = v00 + 1;
      const v01 = v00 + na;
      const v11 = v01 + 1;
      if (flip) idx.push(v00, v10, v01, v10, v11, v01);
      else idx.push(v00, v01, v10, v10, v01, v11);
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

const CREAM = "#fff6e4";
const WOOD = "#e3b37c";
const WOOD_D = "#c98f55";
const MINT = "#9fdcc9";
const STEEL = "#d5dde6";

/** 区画の中身（x1 が前の端）。b に足す */
function zone(b: Bucket, id: string, x0: number, x1: number): void {
  const cx = (x0 + x1) / 2;
  const len = x1 - x0;
  const zR = Z1 - 0.29; // 右の壁ぞいの台の奥行きの真ん中
  if (id === "kitchen") {
    // 右の壁ぞい（窓口の下）: 台と、電気のたい焼き機・流し・まな板
    b.add(rbox(len - 0.04, TOP - FLOOR - 0.04, 0.56, 0.03), MINT, cx, (FLOOR + TOP - 0.04) / 2, zR);
    for (const k of [-0.25, 0.25]) b.add(rbox(len * 0.44, 0.5, 0.01, 0.01), "#c3eee0", cx + k * len, FLOOR + 0.36, zR - 0.285);
    b.add(rbox(len, 0.04, 0.6, 0.015), WOOD, cx, TOP - 0.02, zR - 0.02);
    // たい焼き機（5匹焼き）
    const mx = cx + len * 0.22;
    b.add(rbox(0.5, 0.11, 0.36, 0.04), "#565b6b", mx, TOP + 0.055, zR);
    for (let i = 0; i < 5; i++) {
      const fx = mx - 0.18 + i * 0.09;
      b.add(new CapsuleGeometry(0.022, 0.05, 4, 8), "#f2a65a", fx, TOP + 0.116, zR, Math.PI / 2, 0, 0);
    }
    // 流し
    const sx = cx - len * 0.12;
    b.add(rbox(0.42, 0.03, 0.4, 0.012), STEEL, sx, TOP + 0.006, zR);
    b.add(rbox(0.32, 0.02, 0.28, 0.01), "#9aa7b5", sx, TOP + 0.016, zR - 0.01);
    b.add(cyl(0.014, 0.014, 0.22, 8), "#c9d1db", sx, TOP + 0.12, zR + 0.2);
    b.add(box(0.025, 0.025, 0.12), "#c9d1db", sx, TOP + 0.22, zR + 0.15);
    // まな板と果物
    const px = cx - len * 0.38;
    b.add(rbox(0.3, 0.025, 0.26, 0.01), "#f3cf93", px, TOP + 0.012, zR - 0.04);
    for (const [dx, dz] of [
      [-0.06, -0.06],
      [0.03, 0.02],
      [0.08, -0.08],
    ])
      b.add(sph(0.04, 12, 8), "#ff5a4f", px + dx, TOP + 0.06, zR + dz);
    b.add(sph(0.04, 12, 8), "#ffe14d", px - 0.1, TOP + 0.05, zR + 0.06, 0, 0, 0, 1.4, 1, 1);
    // 左の壁ぞい: 下の棚と、上の瓶の棚
    b.add(rbox(len - 0.06, 0.7, 0.36, 0.03), "#ffd98a", cx, FLOOR + 0.35, Z0 + 0.2);
    b.add(rbox(len - 0.04, 0.035, 0.4, 0.012), WOOD, cx, FLOOR + 0.72, Z0 + 0.21);
    for (const y of [1.78, 2.06]) {
      b.add(box(len - 0.1, 0.03, 0.22), WOOD, cx, y, Z0 + 0.12);
      const cols = ["#ff9aa2", "#ffd27a", "#8fd3c1", "#a0c4ff", "#ffb3c7"];
      const n = Math.max(2, Math.floor(len / 0.24));
      for (let i = 0; i < n; i++) b.add(cyl(0.045, 0.045, 0.12, 10), cols[i % 5], x0 + 0.12 + ((len - 0.24) * i) / (n - 1), y + 0.075, Z0 + 0.12);
    }
  } else if (id === "fridge") {
    // 左に背の高い冷蔵庫、右に細い台
    b.add(rbox(len - 0.06, 1.5, 0.58, 0.07), "#fdfdfb", cx, FLOOR + 0.75, Z0 + 0.31);
    b.add(box(0.03, 0.4, 0.03), "#c9d1db", x1 - 0.1, FLOOR + 1.05, Z0 + 0.62);
    b.add(sph(0.03, 10, 6), "#ff8fab", cx, FLOOR + 1.3, Z0 + 0.61, 0, 0, 0, 1, 1, 0.4);
    b.add(rbox(len - 0.04, TOP - FLOOR - 0.04, 0.56, 0.03), "#ffd27a", cx, (FLOOR + TOP - 0.04) / 2, zR);
    b.add(rbox(len, 0.04, 0.6, 0.015), WOOD, cx, TOP - 0.02, zR - 0.02);
    b.add(sph(0.07, 12, 8), "#ff8f70", cx, TOP + 0.06, zR, 0, 0, 0, 1, 0.85, 1);
  } else if (id === "tank") {
    // 水のタンク（きれいな水・使った水）を床に、上に低い棚
    b.add(rbox(len - 0.1, 0.46, 0.5, 0.07), "#a9dcff", cx, FLOOR + 0.23, zR + 0.02);
    b.add(rbox(len - 0.1, 0.46, 0.5, 0.07), "#c3cad4", cx, FLOOR + 0.23, Z0 + 0.3);
    b.add(cyl(0.05, 0.05, 0.05, 12), "#5a8fd6", cx, FLOOR + 0.48, zR + 0.02);
    b.add(cyl(0.05, 0.05, 0.05, 12), "#8d96a3", cx, FLOOR + 0.48, Z0 + 0.3);
    b.add(box(len - 0.04, 0.03, Z1 - Z0 - 0.06), WOOD, cx, FLOOR + 0.55, 0);
    b.add(rbox(0.24, 0.16, 0.2, 0.04), "#ffb3c7", cx, FLOOR + 0.645, -0.2);
  } else if (id === "bed") {
    // 横向きの寝床（幅いっぱい）
    const h = FLOOR + 0.42;
    b.add(box(len - 0.04, h - FLOOR, Z1 - Z0 - 0.02), WOOD_D, cx, (FLOOR + h) / 2, 0);
    b.add(rbox(len - 0.06, 0.18, Z1 - Z0 - 0.06, 0.07), "#ffffff", cx, h + 0.09, 0);
    b.add(rbox(len * 0.66, 0.06, Z1 - Z0 - 0.04, 0.03), "#ffb3c7", cx - len * 0.12, h + 0.19, 0);
    b.add(box(0.1, 0.062, Z1 - Z0 - 0.035), "#ffe17a", cx + len * 0.1, h + 0.192, 0);
    b.add(rbox(len * 0.5, 0.12, 0.34, 0.06), "#a9dcff", cx + 0.02, h + 0.25, Z0 + 0.25);
    b.add(rbox(len - 0.06, 0.03, 0.18, 0.012), WOOD, cx, 2.0, Z1 - 0.1);
    b.add(sph(0.06, 12, 8), "#ffd27a", cx, 2.06, Z1 - 0.1);
  }
}

/** 調理と生活の境の仕切り（低い板とカーテン） */
function divider(b: Bucket, x: number): void {
  b.add(box(0.05, 1.0, Z1 - Z0 - 0.02), WOOD, x, FLOOR + 0.5, 0);
  b.add(rbox(0.03, 0.85, (Z1 - Z0) * 0.45, 0.015), "#ffd0dc", x, FLOOR + 1.43, Z0 + (Z1 - Z0) * 0.24);
  b.add(cyl(0.012, 0.012, Z1 - Z0, 8), "#c9d1db", x, 2.3, 0, Math.PI / 2);
}

export function buildZones(order: string[]): BufferGeometry {
  const b = new Bucket(INNER_WHITE_UV);
  const s = spans(order);
  for (const z of s) zone(b, z.id, z.x0, z.x1);
  const kinds = new Set(L.divider);
  for (let i = 0; i < s.length - 1; i++) {
    if (s[i].kind !== s[i + 1].kind && kinds.has(s[i].kind) && kinds.has(s[i + 1].kind)) divider(b, s[i].x0);
  }
  return b.merge();
}

export type InteriorParts = {
  group: Group;
  walls: Mesh;
  wallsPeek: Mesh;
  zones: Mesh;
  setOrder(order: string[]): void;
  dispose(): void;
};

export function buildInterior(innerMat: Material, order: string[]): InteriorParts {
  const group = new Group();
  const st = new Bucket(INNER_WHITE_UV);
  const pk = new Bucket(INNER_WHITE_UV);
  // 内壁: 右（窓口の穴）・奥・運転席の後ろの仕切り（通り抜けの穴）。左と天井は「中をのぞく」で隠す
  st.put(wall("right", [[HX[0], HX[1], HY[0], HY[1]]]));
  st.put(wall("back"));
  st.put(wall("front", [[-0.42, 0.42, 1.42, 2.16]]));
  pk.put(wall("left"));
  pk.add(box(X1 - X0 + 0.02, 0.02, Z1 - Z0 + 0.02), CREAM, (X0 + X1) / 2, Y1 + 0.01, 0);
  pk.add(rbox(0.3, 0.04, 0.3, 0.02), "#fff1b8", -0.6, Y1 - 0.02, 0);
  // 床（荷室と運転席）
  st.add(box(D.cab.x[1] - 0.35 - X0, 0.04, Z1 - Z0 + 0.04), "#ecc89b", (X0 + D.cab.x[1] - 0.35) / 2, FLOOR - 0.02, 0);
  st.add(rbox(1.6, 0.012, 0.5, 0.005), "#ffcf5a", -0.6, FLOOR + 0.006, 0);
  // 運転席: 計器の台・ハンドル（左ハンドル）・座席2つ
  const DX = D.cab.x[1] - 0.55;
  st.add(rbox(0.42, 0.36, 1.84, 0.1), "#7d8aa3", DX, 1.3, 0);
  st.add(place(new TorusGeometry(0.17, 0.03, 8, 24), 0, 0, 0, 0, Math.PI / 2), "#4f5566", DX - 0.25, 1.58, -0.48, 0, 0, -0.55);
  st.add(cyl(0.025, 0.025, 0.3, 8), "#4f5566", DX - 0.16, 1.5, -0.48, 0, 0, Math.PI / 2 - 0.55);
  for (const z of [-0.48, 0.48]) {
    const sx = DX - 0.55;
    st.add(box(0.3, 0.36, 0.3), "#a8b0bd", sx, FLOOR + 0.18, z);
    st.add(rbox(0.5, 0.16, 0.5, 0.06), "#ff8f70", sx, FLOOR + 0.44, z);
    st.add(rbox(0.13, 0.64, 0.5, 0.06), "#ff8f70", sx - 0.22, FLOOR + 0.83, z, 0, 0, 0.1);
    st.add(rbox(0.1, 0.16, 0.3, 0.04), "#ffb39f", sx - 0.25, FLOOR + 1.25, z);
  }
  const walls = new Mesh(st.merge(), innerMat);
  const wallsPeek = new Mesh(pk.merge(), innerMat);
  wallsPeek.userData.peek = true;
  const zones = new Mesh(buildZones(order), innerMat);
  group.add(walls, wallsPeek, zones);
  return {
    group,
    walls,
    wallsPeek,
    zones,
    setOrder(o: string[]) {
      zones.geometry.dispose();
      zones.geometry = buildZones(o);
    },
    dispose() {
      for (const m of [walls, wallsPeek, zones]) m.geometry.dispose();
    },
  };
}
