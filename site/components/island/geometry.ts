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

/**
 * Catmull-Rom を三次ベジェに変換して、なめらかな閉曲線パスにする。
 *
 * 島の輪郭は 96 点で持っていて、その形のパスが画面に 20 本以上ある。
 * 小数第2位まで書くと、それだけで HTML が 20KB ほど太る。島は 1200 の
 * 世界に描いてあって、画面では 1 が 0.6px にしかならない。
 * 第1位で足りる。
 *
 * **書き方も短くする。** `301.0` は `301`、`0.5` は `.5`、続く三次ベジェの
 * `C` は最初の1回だけ。値は変えずに、字だけで 2 割落ちる。
 */
/**
 * 数を、いちばん短い書き方にする。**パスの d に出す数は、全部ここを通す。**
 *
 * `toFixed(1)` は「301」を `301.0` と書き、「0.5」を `0.5` と書く。
 * どちらも SVG では余分で、**島の輪郭のパスだけで HTML が 200KB ある**ので、
 * 1つ2文字でも効く。落とすのは書き方だけで、値は 0.1 のまま。
 */
export function n1(v: number): string {
  let t = (Math.round(v * 10) / 10).toString();
  if (t.startsWith("0.")) t = t.slice(1);
  else if (t.startsWith("-0.")) t = "-" + t.slice(2);
  return t;
}

/** 数をつなぐ。次が `-` で始まるなら、そこが切れ目になるので区切りは要らない。 */
function join(a: string, b: string): string {
  return b.startsWith("-") ? a + b : a + " " + b;
}

/**
 * 点ごとの「接線の効き」。**折れているところだけ弱める。**
 *
 * Catmull-Rom は点そのものは必ず通るが、その手前と先を
 * 隣どうしの向き（p2-p0）で引っぱるので、**角が小屋根のようにまるまる。**
 * 島の輪郭でいうと、岬の先が団子になり、入り江の口が広がって
 * 「湾を入れたのに、じゃがいものまま」になる（2026-10-07）。
 *
 * そこで、**入ってくる向きと出ていく向きがどれだけ違うか**で引っぱりを弱める。
 *
 * - まっすぐ（なめらかな浜）… そのまま 1。64点の円で1点あたり 5.6度しか
 *   曲がらないので cos は 0.995。**いまの島の輪郭は1点も弱まらない**
 * - 32度まで曲がる ………… ここまでは 1。起伏（`wobble`）はこの範囲に収まる
 * - 90度以上 …………………… 0.25。岬の先と入り江の口がここに来る
 *
 * 下限を 0 にしないのは、0 にすると区間がまっすぐな線分になって、
 * 浜が多角形に見えるから。0.25 残すと「角は立っているが、辺は曲がっている」になる。
 *
 * **弱める方向にしか動かさない**ので、制御点が伸びて輪が交差することはない。
 */
function kinkScale(points: Pt[]): number[] {
  const n = points.length;
  const at = (i: number) => points[((i % n) + n) % n];
  return points.map((_, i) => {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const ax = p1[0] - p0[0];
    const ay = p1[1] - p0[1];
    const bx = p2[0] - p1[0];
    const by = p2[1] - p1[1];
    const la = Math.hypot(ax, ay) || 1;
    const lb = Math.hypot(bx, by) || 1;
    const cos = (ax * bx + ay * by) / (la * lb);
    // cos 0.85（32度）以上はそのまま、cos 0（90度）で 0.25 まで落とす
    return Math.max(0.25, Math.min(1, 0.25 + (cos / 0.85) * 0.75));
  });
}

/**
 * 閉じた点列 → 三次ベジェの列（`[制御点1, 制御点2, 行き先]`）。
 *
 * **描く（`smoothClosedPath`）のと、数える（`flattenClosed`）のとで、
 * 同じ1本から出す。** 別々に書くと、見張りが「交差していない」と言っている形と
 * 画面に出ている形が、いつのまにか別物になる。
 */
function cubicsOf(points: Pt[], tension: number): [Pt, Pt, Pt][] {
  const n = points.length;
  const at = (i: number) => points[((i % n) + n) % n];
  const k = kinkScale(points);
  const ks = (i: number) => k[((i % n) + n) % n];
  const out: [Pt, Pt, Pt][] = [];
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const t1 = tension * ks(i);
    const t2 = tension * ks(i + 1);
    out.push([
      [p1[0] + ((p2[0] - p0[0]) / 6) * t1, p1[1] + ((p2[1] - p0[1]) / 6) * t1],
      [p2[0] - ((p3[0] - p1[0]) / 6) * t2, p2[1] - ((p3[1] - p1[1]) / 6) * t2],
      p2,
    ]);
  }
  return out;
}

export function smoothClosedPath(points: Pt[], tension = 1): string {
  const n = points.length;
  if (n < 3) return "";
  let d = "M" + join(n1(points[0][0]), n1(points[0][1]));
  /* 三次ベジェが続くあいだ、`C` は最初の1回だけ書けばよい（SVG の決まり）。
     127回ぶんの `C` が消える。 */
  d += "C";
  let first = true;
  for (const [c1, c2, p2] of cubicsOf(points, tension)) {
    for (const v of [c1[0], c1[1], c2[0], c2[1], p2[0], p2[1]]) {
      const t = n1(v);
      d = first ? d + t : join(d, t);
      first = false;
    }
  }
  return d + "Z";
}

/**
 * `smoothClosedPath` が描くのと**同じ曲線**を、細かく折った点列にする。
 *
 * 輪郭が自分と交差していないか、裏返っていないかを**ブラウザを出さずに**
 * 数えるためのもの（`site/selftest/isleart_selftest.mjs`）。
 * 刻みを深くしすぎると、制御点が伸びて曲線が自分をまたぐ——そうなっても
 * 絵は出るので、見ただけでは気づけない。
 */
export function flattenClosed(points: Pt[], per = 8, tension = 1): Pt[] {
  const n = points.length;
  if (n < 3) return [];
  const out: Pt[] = [];
  let p1 = points[0];
  for (const [c1, c2, p2] of cubicsOf(points, tension)) {
    for (let s = 0; s < per; s++) {
      const t = s / per;
      const u = 1 - t;
      out.push([
        u * u * u * p1[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p2[0],
        u * u * u * p1[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p2[1],
      ]);
    }
    p1 = p2;
  }
  return out;
}

export function blob(cx: number, cy: number, radii: number[], squash = 1, tension = 1): string {
  return smoothClosedPath(radiiToPoints(cx, cy, radii, squash), tension);
}

/** 全方向に delta だけ内側/外側へ */
export function inset(radii: number[], delta: number): number[] {
  return radii.map((r) => Math.max(4, r - delta));
}

/**
 * 半径配列を n 点に増やす。**角度で線形に読むだけ**なので、元の方位は
 * そのままの値で残る（n が元の整数倍なら、元の点は1つもずれない）。
 *
 * つまり **n を増やしても刻みは細かくならない。** 細かい湾や岬が欲しければ、
 * 増やすのはここではなく**元の方位の数**（`shapes.ts` の `radii`）のほう。
 * 16方位だと、いちばん狭い刻みでも 22.5度ぶんの幅を持ってしまう。
 */
export function resample(radii: number[], n: number): number[] {
  return Array.from({ length: n }, (_, i) => radiusAt(radii, i / n));
}

/**
 * 輪郭に、なめらかな起伏を足す。
 *
 * 点ごとに乱数を振ると縁がギザギザになって手描きに見えないので、
 * 位相をずらした正弦波を3本重ねる。周期が違うぶん規則性が消えて、
 * それでいて隣り合う点はつながったまま。seed 固定なので SSR と CSR で同じ形。
 */
export function wobble(radii: number[], seed: number, amp: number, waves: [number, number, number] = [3, 7, 13]): number[] {
  const r = rng(seed);
  const ph = [r() * Math.PI * 2, r() * Math.PI * 2, r() * Math.PI * 2];
  const w = [0.55, 0.3, 0.15];
  const n = radii.length;
  return radii.map((v, i) => {
    const a = (i / n) * Math.PI * 2;
    let d = 0;
    for (let k = 0; k < 3; k++) d += Math.sin(a * waves[k] + ph[k]) * w[k];
    return Math.max(4, v + d * amp);
  });
}

/** 外側と内側の輪郭で作る輪。fillRule="evenodd" で塗る前提。 */
export function ring(cx: number, cy: number, outer: number[], inner: number[], squash = 1): string {
  return blob(cx, cy, outer, squash) + blob(cx, cy, inner, squash);
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

/** 角度の割合(0=北, 時計回り)における半径。半径配列を線形補間する。 */
export function radiusAt(radii: number[], t: number): number {
  const n = radii.length;
  const u = ((t % 1) + 1) % 1;
  const i = Math.floor(u * n) % n;
  const f = u * n - Math.floor(u * n);
  return radii[i] * (1 - f) + radii[(i + 1) % n] * f;
}

/** 輪郭の上の点。inset だけ内側へ寄せられる。 */
export function pointAt(
  cx: number,
  cy: number,
  radii: number[],
  squash: number,
  t: number,
  inset = 0,
): Pt {
  const a = t * Math.PI * 2 - Math.PI / 2;
  const r = radiusAt(radii, t) - inset;
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r * squash];
}
