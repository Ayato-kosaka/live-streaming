/**
 * 島の形をつくるための幾何ユーティリティ。
 *
 * 島の輪郭は「中心からの半径の配列」で持つ。こうしておくと
 * 砂浜→草地→高台 を同じ形のまま内側に縮めるだけで作れるので、
 * 手で座標を並べるより形が破綻しにくい。
 */

export type Pt = [number, number];

/** 決定的な擬似乱数。SSR と CSR で同じ配置になるように seed 固定で使う。 */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 半径配列 → 閉じた点列 */
export function radiiToPoints(cx: number, cy: number, radii: number[], squash = 1): Pt[] {
  const n = radii.length;
  return radii.map((r, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r * squash] as Pt;
  });
}

/** Catmull-Rom を三次ベジェに変換して、なめらかな閉曲線パスにする */
export function smoothClosedPath(points: Pt[], tension = 1): string {
  const n = points.length;
  if (n < 3) return "";
  const at = (i: number) => points[((i % n) + n) % n];
  let d = `M${at(0)[0].toFixed(2)},${at(0)[1].toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1: Pt = [p1[0] + ((p2[0] - p0[0]) / 6) * tension, p1[1] + ((p2[1] - p0[1]) / 6) * tension];
    const c2: Pt = [p2[0] - ((p3[0] - p1[0]) / 6) * tension, p2[1] - ((p3[1] - p1[1]) / 6) * tension];
    d += `C${c1[0].toFixed(2)},${c1[1].toFixed(2)} ${c2[0].toFixed(2)},${c2[1].toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  return d + "Z";
}

export function blob(cx: number, cy: number, radii: number[], squash = 1, tension = 1): string {
  return smoothClosedPath(radiiToPoints(cx, cy, radii, squash), tension);
}

/** 全方向に delta だけ内側/外側へ */
export function inset(radii: number[], delta: number): number[] {
  return radii.map((r) => Math.max(4, r - delta));
}

/** 点が輪郭の内側かどうか（半径配列を角度で線形補間して判定） */
export function insideRadii(
  cx: number,
  cy: number,
  radii: number[],
  x: number,
  y: number,
  squash = 1,
  margin = 0,
): boolean {
  const dx = x - cx;
  const dy = (y - cy) / squash;
  const dist = Math.hypot(dx, dy);
  let a = Math.atan2(dy, dx) + Math.PI / 2;
  while (a < 0) a += Math.PI * 2;
  const t = (a / (Math.PI * 2)) * radii.length;
  const i = Math.floor(t) % radii.length;
  const j = (i + 1) % radii.length;
  const f = t - Math.floor(t);
  const r = radii[i] * (1 - f) + radii[j] * f;
  return dist < r - margin;
}

/** 曲線に沿って等間隔に点を打つ（石畳の道に使う） */
export function alongCubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, count: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return out;
}
