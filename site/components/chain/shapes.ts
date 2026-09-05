/**
 * 島の連なりに出す、章ごとの島の姿。
 *
 * **事実（期間・国・人数）は `content/chapters.ts` と `content/chapterStats.ts` が持つ。**
 * ここが持つのは、その事実をどう絵にするかだけ（`docs/island-atlas.md` 3章）。
 *
 * - **大きさは持たない。** 滞在日数から計算する（`islandRadius`）。
 *   面積が日数に比例するので、半径は日数の平方根。手で「この島は大きめ」と決めない
 * - **かたち**は 16方位の比。1.0 が真円で、その章で回った土地を思わせる形に崩す
 * - **草木**はその土地のもの。中東に針葉樹を生やさない
 *
 * いまの島（`components/island/`）の輪郭は 1200 四方の世界に置いた実寸だが、
 * こちらは大きさが日数で変わるので、比だけ持って毎回かけ算する。
 */

import { rng } from "@/components/island/geometry";

export type IslandArt = {
  /** 16方位の半径の比。上(北)から時計回り。平均が 1.0 くらいになるように */
  radii: number[];
  /** 縦の潰し。連なりの画面は地図に近い見え方なので、島のステージ(0.9)より平たい */
  squash: number;
  /** 草木。名前は `content/sprites.json` にあるもの。手前から順に多く出る */
  props: { n: string; s: number }[];
  /** 高台を持つ島か。山のある土地だけ */
  plateau?: boolean;
  /** 配置を決める種。変えると草木の並びが変わる */
  seed: number;
};

/**
 * かたちは、その章で回った土地から。
 *
 * - ヨーロッパ … 西へ広がって、北に半島が2つ。9カ国を横に渡った章
 * - 中東 … 東西に長く、南が砂へ落ちていく。海沿いを縫った章
 * - コーカサス … まるく大きい。真ん中に山（高台）。腰を据えた章
 * - イラン … 南へ細く突き出た小島。歩いて国境へ行って戻ってきた
 * - 北欧 … 南北に長く、西側がフィヨルドで刻まれている
 */
export const ISLAND_ART: Record<string, IslandArt> = {
  europe: {
    radii: [1.14, 1.02, 0.92, 0.96, 1.06, 1.12, 1.04, 0.94, 0.9, 0.98, 1.12, 1.22, 1.16, 1.02, 0.96, 1.06],
    squash: 0.62,
    props: [
      { n: "tree-round", s: 0.3 },
      { n: "tree-default", s: 0.28 },
      { n: "tree-tall", s: 0.34 },
      { n: "bush", s: 0.16 },
      { n: "flower-red", s: 0.1 },
      { n: "flower-yellow", s: 0.1 },
    ],
    seed: 1028,
  },
  "middle-east": {
    radii: [0.86, 0.9, 1.06, 1.24, 1.3, 1.2, 1.0, 0.86, 0.82, 0.9, 1.08, 1.22, 1.26, 1.12, 0.96, 0.86],
    squash: 0.58,
    props: [
      // ナツメヤシは焼けていないので、いまはヤシで代える（報告に挙げてある）
      { n: "tree-palm", s: 0.34 },
      { n: "tree-palm-short", s: 0.24 },
      { n: "cactus", s: 0.18 },
      { n: "rock-flat", s: 0.12 },
      { n: "stone-small", s: 0.1 },
    ],
    seed: 330,
  },
  caucasus: {
    radii: [1.04, 1.1, 1.14, 1.08, 1.0, 0.98, 1.06, 1.12, 1.1, 1.02, 0.96, 0.98, 1.06, 1.12, 1.1, 1.04],
    squash: 0.64,
    props: [
      { n: "tree-fat", s: 0.24 },
      { n: "tree-round", s: 0.22 },
      { n: "tree-pine-round", s: 0.26 },
      { n: "crop-row", s: 0.1 },
      { n: "bush-large", s: 0.14 },
      { n: "flower-purple", s: 0.08 },
    ],
    plateau: true,
    seed: 629,
  },
  "iran-walk": {
    radii: [0.72, 0.78, 0.9, 0.96, 1.0, 1.12, 1.3, 1.42, 1.34, 1.14, 1.0, 0.94, 0.88, 0.8, 0.72, 0.7],
    squash: 0.56,
    props: [
      { n: "rock-tall", s: 0.4 },
      { n: "stone-large", s: 0.3 },
      { n: "cactus-short", s: 0.24 },
    ],
    seed: 429,
  },
  nordic: {
    radii: [1.3, 1.16, 0.9, 0.72, 0.66, 0.74, 0.92, 1.12, 1.28, 1.1, 0.82, 0.62, 0.7, 0.86, 1.06, 1.24],
    squash: 0.7,
    props: [
      { n: "tree-pine-tall", s: 0.36 },
      { n: "tree-pine", s: 0.3 },
      { n: "tree-snow", s: 0.28 },
      { n: "rocks-snow", s: 0.16 },
      { n: "rock-large", s: 0.14 },
    ],
    seed: 911,
  },
};

/**
 * 島の半径（絵の単位）。
 *
 * **面積が滞在日数に比例する**（`docs/island-atlas.md` 3章）ので、半径は平方根。
 * 係数は、いちばん長いコーカサス周遊（434日）が 118 になるところから決めた。
 *
 * ただし平方根そのままだと、10日のイランが半径 18 にしかならない。
 * その大きさでは草木も浜も1px を切って、**島に見えない**（撮って確かめた）。
 * なので「どの島にも、日数と関係のない浜のぶんの面積がある」ことにして、
 * 面積 = 浜（一定）＋ 日数ぶん、で足す。
 *
 *   r = √(BASE² + K²・日数)
 *
 * 大きい島はほとんど変わらず（コーカサス 118 → 121）、小さい島だけ
 * 島に見える大きさまで持ち上がる。**大小の順は崩れない**（イラン 32 < 北欧 35）。
 */
export const ISLE_K = 118 / Math.sqrt(434);
/** 日数がゼロでも残る浜のぶん。ここを下回ると島に見えない */
export const ISLE_BASE = 26;
export const islandRadius = (days: number) =>
  Math.sqrt(ISLE_BASE ** 2 + ISLE_K ** 2 * Math.max(0, days));

/** 草木ひとつ。足元の座標は島の中心を (0,0) とした絵の単位 */
export type Plant = { n: string; x: number; y: number; s: number; flip: boolean };

/**
 * 草木を撒く。
 *
 * 数は島の大きさから決める。小さい島に同じ数を撒くと草木で埋まるし、
 * 大きい島が更地に見えるのも困る。**面積あたりの密度をそろえる。**
 * 上限を付けてあるのは、連なりの画面に島が5つ並ぶから
 * （1枚あたり14個なら、全部で70枚。島のステージ1枚ぶんより軽い）。
 */
export function plants(art: IslandArt, r: number): Plant[] {
  // 半径が小さい島は、草木が1px未満になって粒にしか見えない。撒かない
  if (r < 25) return [];
  const n = Math.min(14, Math.max(4, Math.round(r / 9)));
  const rand = rng(art.seed);
  const out: Plant[] = [];
  let guard = 0;
  while (out.length < n && guard++ < n * 20) {
    // 円の中で一様に散らす。極座標のまま一様乱数を振ると中心に寄る
    const t = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * 0.78;
    const rr = radiusAtUnit(art.radii, t) * r;
    const x = Math.cos(t) * rr * d;
    const y = Math.sin(t) * rr * d * art.squash;
    // 同じところに重ねない
    if (out.some((p) => Math.hypot(p.x - x, (p.y - y) / art.squash) < r * 0.18)) continue;
    const kind = art.props[Math.floor(rand() * art.props.length)];
    out.push({ n: kind.n, x, y, s: kind.s * r, flip: rand() < 0.5 });
  }
  return out.sort((a, b) => a.y - b.y);
}

/** 角度(ラジアン、0=東)における半径の比。北を 0 番にそろえてから補間する */
function radiusAtUnit(radii: number[], angle: number): number {
  const n = radii.length;
  const t = (((angle + Math.PI / 2) / (Math.PI * 2)) % 1 + 1) % 1;
  const i = Math.floor(t * n) % n;
  const f = t * n - Math.floor(t * n);
  return radii[i] * (1 - f) + radii[(i + 1) % n] * f;
}
