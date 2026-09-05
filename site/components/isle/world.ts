/**
 * 島ひとつぶんの地形と、その上に置くものの座標。
 *
 * **章のデータだけから作る。** 手で置いた座標は1つも無い
 * （`docs/island-atlas.md` 3章「島の見た目は、事実から決める」）。
 * `content/chapters.ts` に章を1行足すと、ここが勝手に島を1つ作る。
 *
 * いまの島（`components/island/layout.ts` + `IslandScene.tsx`）は、1200四方に
 * 300要素を手で置いた1枚もので、章ごとに輪郭も草木も変えられない。
 * **あちらは触っていない。** 借りたのは輪郭を描く道具（`geometry.ts`）だけ。
 */

import { radiusAt, resample, rng, wobble } from "@/components/island/geometry";
import { islandRadius, type IslandArt } from "@/components/chain/shapes";
import { bakeDeco, bakeFlowers, bakeSoil, type Deco, type DecoPaths } from "./deco";
import type { IslePlaceSpec, IsleSpec } from "./spec";

/**
 * 歩ける島の半径（ワールド単位）。
 *
 * 連なりの絵（`shapes.ts` の `islandRadius`）は「島まるごとを何 px で描くか」
 * なので、島が小さければ中の草木も一緒に小さくなる。
 * **歩ける島はそうはいかない。** 建物も住人もあやとも、どの島でも同じ背丈で
 * 立っている（そこが揃っていないと「島によって品質が違う」になる）。
 * だから小さい島には、**建物が並ぶぶんの下駄**が要る。
 *
 *   R = BASE + K・（連なりでの半径）
 *
 * 実際の値: コーカサス 434 / ヨーロッパ 316 / 中東 279 / イラン 207 / 北欧 205。
 * **大小の順は連なりと同じまま。** 下駄のぶん、小さい島だけが持ち上がる。
 * 連なりの `ISLE_BASE` と同じ考えで、理由も同じ（小さすぎると島に見えない。
 * ここでは「建物5軒と住人が入らない」）。
 */
export const ISLE_BASE = 126;
export const ISLE_K = 2.55;
export const isleRadius = (days: number) => Math.round(ISLE_BASE + ISLE_K * islandRadius(days));

/**
 * 縦の潰し。
 *
 * 連なりの島は 0.56〜0.7 で、地図のように上から見ている。
 * 歩ける島は**降り立って見ている**ので、いまの島と同じ 0.9 に寄せる。
 * ここだけ連なりと違うが、輪郭の比（`art.radii`）は同じものを使うので、
 * 連なりで見た島とここの島は同じ形に読める。
 */
export const SQUASH = 0.9;

/** 浜の幅（ワールド単位）。島の大きさに関わらず、歩けるだけの幅を残す */
const BEACH = 40;
/** 輪郭を何点で持つか。16方位のままだと起伏を足しても角が丸まって消える */
const COAST_N = 64;

/** 島に置いた建物。`t` は北から時計回りの割合（道を隣どうしで結ぶのに使う） */
export type Placed = IslePlaceSpec & { x: number; y: number; t: number };
export type Plant = { n: string; x: number; y: number; s: number; flip: boolean; sway?: number };

export type IsleWorld = {
  slug: string;
  /** 世界の一辺。カメラも当たり判定もこの座標系 */
  size: number;
  cx: number;
  cy: number;
  squash: number;
  /** 島の平均半径 */
  r: number;
  /** 浜の輪郭 */
  sand: number[];
  /** 草地の輪郭。ここから外へは歩かない */
  grass: number[];
  places: Placed[];
  plants: Plant[];
  /** 道。1本のパスにまとめてある（別々に置くと要素が道の数だけ増える） */
  trail: string;
  /** 海の模様。濃さの違う3本のパスにまとめてある */
  sea: string[];
  /** 舟をつなぐところ */
  dock: { x: number; y: number };
  /** あやとが降り立つところ。舟から一歩あがった草地 */
  start: { x: number; y: number };
  /** 地面の細かい飾り。**色ごとに1本のパスにまとまっている** */
  deco: DecoPaths;
  sandDeco: DecoPaths;
  flowers: ReturnType<typeof bakeFlowers>;
  soil: string;
  /** 夜にともる灯り。[x, y, 半径] */
  lamps: [number, number, number][];
  art: IslandArt;
};

/** 角度の割合(0=北, 時計回り) t における島の上の点 */
function at(w: { cx: number; cy: number; squash: number }, radii: number[], t: number, inset = 0) {
  const a = t * Math.PI * 2 - Math.PI / 2;
  const r = radiusAt(radii, t) - inset;
  return { x: w.cx + Math.cos(a) * r, y: w.cy + Math.sin(a) * r * w.squash };
}

/**
 * 島をひとつ組む。
 *
 * 建物の置き場は「島のふちに沿って一周」。まん中に固めると、島が広いのに
 * 歩く用が無い一角ができる。ふちに配ると、どこへ行くにも島を横切ることになって、
 * 途中で住人に会う。**歩く意味は、建物どうしの距離が作る。**
 */
export function buildWorld(spec: IsleSpec): IsleWorld {
  const art = spec.art;
  const r = isleRadius(spec.days);
  const maxR = r * Math.max(...art.radii);
  // 画面の外にも海が要る。カメラは島のふちまで寄るので、その先が切れていると
  // 「世界の端」が見えてしまう
  const size = Math.round((maxR + 220) * 2);
  const cx = size / 2;
  const cy = size / 2;
  const w = { cx, cy, squash: SQUASH };

  /* 輪郭。連なりと同じ比を使って、そこに細かい起伏を足す。
     16方位のままだと、浜のふちが機械で切ったような弧になる */
  const base = resample(
    art.radii.map((v) => v * r),
    COAST_N,
  );
  const sand = wobble(base, art.seed + 11, Math.max(4, r * 0.022), [3, 7, 13]);
  const grass = wobble(
    sand.map((v) => v - BEACH),
    art.seed + 23,
    Math.max(3, r * 0.014),
    [4, 9, 17],
  );

  /* --- 建物 ---
     船着き場だけは浜（砂の上）。ほかは草地に一周ぶん配る。

     **中心からの距離は、その向きの島の幅に対する割合で決める。**
     「ふちから何単位」で置くと、細くなっている向き（北欧の西側は
     いちばん広いところの半分しかない）で建物が中心まで寄ってきて固まる。

     **そして、ふちに寄せない。** 一度 0.6〜0.78 で置いたら、降り立った寄りの
     1画面に建物が1つも入らなかった（撮って分かった）。スマホの寄りは
     340単位なので、半径 150 より外に建てると画面から出る。
     0.34〜0.48 に詰めて、**どの島でも降り立った1画面に3つ以上入る**ようにした。 */
  const rand = rng(art.seed * 7 + 3);
  const dockT = 0.5 + (rand() - 0.5) * 0.08; // だいたい南。船は手前から着く
  const dockAt = at(w, sand, dockT, BEACH * 0.42);

  const ring = spec.places.filter((p) => p.id !== "pier");
  const start = rand();
  const placed: Placed[] = ring.map((p, i) => {
    const t = (start + (i + 0.5) / ring.length) % 1;
    const rr = radiusAt(sand, t);
    const d = Math.min(rr - BEACH - 20, rr * (0.34 + rand() * 0.14));
    const a = t * Math.PI * 2 - Math.PI / 2;
    return {
      ...p,
      t,
      x: Math.round(cx + Math.cos(a) * d),
      y: Math.round(cy + Math.sin(a) * d * SQUASH),
    };
  });
  const pier = spec.places.find((p) => p.id === "pier");
  if (pier) placed.push({ ...pier, t: dockT, x: Math.round(dockAt.x), y: Math.round(dockAt.y) });

  /* あやとが降り立つところ。舟から一歩あがった草地。
     **浜に立たせたままにしない。** 浜は島のいちばん外なので、そこから見ると
     画面の半分が海になって、建物が1つも入らない。 */
  const landing = (() => {
    const a = dockT * Math.PI * 2 - Math.PI / 2;
    const d = Math.max(0, radiusAt(grass, dockT) - 26);
    return { x: Math.round(cx + Math.cos(a) * d), y: Math.round(cy + Math.sin(a) * d * SQUASH) };
  })();

  /* --- 道 ---
     **建物と建物をつなぐ。** 前は島のまん中の広場から放射に引いていたが、
     まん中には何も建っていないので「何も無いところに5本が集まっている」絵に
     なっていた。道は行き来の跡なので、隣り合う建物どうしを結ぶ。
     船着き場からは、いちばん近い建物へ1本だけ。 */
  const round = [...placed].filter((p) => p.id !== "pier").sort((a, b) => a.t - b.t);
  const seg: [number, number, number, number][] = [];
  for (let i = 0; i < round.length; i++) {
    const a = round[i];
    const b = round[(i + 1) % round.length];
    if (round.length < 2) break;
    seg.push([a.x, a.y + 12, b.x, b.y + 12]);
  }
  if (pier && round.length) {
    // いちばん近い建物へ。上陸してすぐ道に乗れる
    const near = round.reduce((m, p) =>
      Math.hypot(p.x - dockAt.x, p.y - dockAt.y) < Math.hypot(m.x - dockAt.x, m.y - dockAt.y) ? p : m,
    );
    seg.push([dockAt.x, dockAt.y, near.x, near.y + 12]);
  }
  const trail = seg
    .map(([ax, ay, bx, by]) => {
      // 中心へ少しだけたわませる。まっすぐ結ぶと多角形になって、島が公園に見える
      const mx = (ax + bx) / 2 + (cx - (ax + bx) / 2) * 0.16;
      const my = (ay + by) / 2 + (cy - (ay + by) / 2) * 0.16;
      return `M${ax.toFixed(0)},${ay.toFixed(0)}Q${mx.toFixed(0)},${my.toFixed(0)} ${bx.toFixed(0)},${by.toFixed(0)}`;
    })
    .join("");

  // 奥から手前へ。名札が重なったとき、手前のものが上に来る
  placed.sort((a, b) => a.y - b.y);

  /* --- 地面 ---
     密度は**いまの島と同じ数え方で合わせてある**（下の DENSITY）。 */
  const area = (Math.PI * r * r * SQUASH * (grass[0] / Math.max(1, sand[0])) ** 2) / 1000;
  const ctx = { w, grass, sand, r, places: placed, seg };
  const plants = scatter(art, ctx, Math.round(area * DENSITY.tree));
  plants.push({ n: "canoe", x: Math.round(dockAt.x) + 24, y: Math.round(dockAt.y) + 8, s: 18, flip: false });
  /* 灯り。建物のそばに1つずつ。**夜だけ光る**（`[data-time="night"]`）。
     昼は絵として立っているだけのランタン */
  const lampSeed = rng(art.seed + 77);
  for (const p of placed) {
    if (p.id === "pier") continue;
    const side = lampSeed() < 0.5 ? -1 : 1;
    plants.push({ n: "lantern", x: p.x + side * 34, y: p.y + 6, s: 22, flip: side < 0 });
  }
  plants.sort((a, b) => a.y - b.y);

  const deco = bakeDeco(
    [
      ...pick(ctx, Math.round(area * DENSITY.bush), art.seed + 201, 26, (rr) => bushOf(art, rr)),
    ],
    art.seed + 5502,
  );
  const sandDeco = bakeDeco(beachDeco(ctx, art.seed + 303), art.seed + 5501);
  const flowers = bakeFlowers(
    pick(ctx, Math.round(area * DENSITY.flower), art.seed + 401, 22, () => ({ k: "tuft" as const, x: 0, y: 0, s: 1 })),
    art.seed + 909,
  );
  const soil = bakeSoil(
    pick(ctx, Math.round(area * DENSITY.soil), art.seed + 501, 62, () => ({ k: "tuft" as const, x: 0, y: 0, s: 1 })),
    art.seed + 3177,
  );

  return {
    sea: seaPatches(art.seed, w, sand, r),
    slug: spec.slug,
    size,
    cx,
    cy,
    squash: SQUASH,
    r,
    sand,
    grass,
    places: placed,
    plants,
    trail,
    dock: { x: Math.round(dockAt.x), y: Math.round(dockAt.y) },
    start: landing,
    deco,
    sandDeco,
    flowers,
    soil,
    lamps: placed
      .filter((p) => p.id !== "pier")
      /* 灯りの大きさ。**建物の背に比べて小さく。**
         いまの島（1200四方）と同じ半径をこの島（620〜870四方）に置くと、
         島の面積に対して倍以上になって、夜が「白く飛んだ島」になった。 */
      .map((p) => [p.x, p.y - 12, Math.max(38, p.size * 0.56)] as [number, number, number]),
    art,
  };
}

/**
 * 1000平方単位あたり、何個置くか。
 *
 * **いまの島を数えて合わせた値。** 目で見て「増やした」と言わない。
 * `components/island/IslandScene.tsx` の草地（半径 365・面積 376,700）に
 * 置いてあるものを数えると:
 *
 *   木（浜のふち26＋内側15＋高台14）      55 → 0.15 /1000
 *   低木・石・切株・草むら（30+22+54）    106 → 0.28 /1000
 *   花                                     46 → 0.12 /1000
 *   土のしみ                               26 → 0.07 /1000
 *   浜の石・流木                           34 → 0.09 /1000
 *   ---------------------------------------------------
 *   あわせて 267 → **0.71 /1000**
 *
 * 直す前のこの島は 0.27 /1000（ヨーロッパ島で 58個）で、**4割**しかなかった。
 * 「歩ける空き地」に見えていた理由がこれ。
 */
const DENSITY = { tree: 0.15, bush: 0.28, flower: 0.12, soil: 0.07 };

/**
 * 木の背丈の基準（ワールド単位）。`art.props` の比に掛ける。
 * いまの島の木が 80〜114 なので、いちばん背の高いキット（0.4）が 104 になる値。
 */
const TREE_H = 260;

type Ctx = {
  w: { cx: number; cy: number; squash: number };
  grass: number[];
  sand: number[];
  r: number;
  places: Placed[];
  seg: [number, number, number, number][];
};

/** 低木・石・切株・草むらの取り合わせ。土地によって中身が変わる */
function bushOf(art: IslandArt, r: () => number): DecoKindPick {
  const dry = art.theme === "desert";
  const cold = art.theme === "nordic";
  const k = r();
  if (dry) {
    if (k < 0.52) return { k: "rock", s: 15 + r() * 10 };
    if (k < 0.8) return { k: "tuft", s: 13 + r() * 6 };
    return { k: "stump", s: 15 };
  }
  if (cold) {
    if (k < 0.44) return { k: "rock", s: 15 + r() * 10 };
    if (k < 0.78) return { k: "tuft", s: 13 + r() * 6 };
    return { k: "bush", s: 17 + r() * 7 };
  }
  if (k < 0.3) return { k: "bush", s: 19 + r() * 8 };
  if (k < 0.5) return { k: "tuft", s: 14 + r() * 7 };
  if (k < 0.74) return { k: "rock", s: 13 + r() * 8 };
  if (k < 0.88) return { k: "shroom", s: 11 + r() * 5 };
  return { k: "stump", s: 15 };
}
type DecoKindPick = { k: Deco["k"]; s: number };

/**
 * 草地の上に、重ならない場所を選ぶ。
 * 建物のまわりと道の上には置かない。**押す場所を飾りで隠さないため。**
 */
function pick(
  ctx: Ctx,
  count: number,
  seed: number,
  gap: number,
  what: (r: () => number) => DecoKindPick,
): Deco[] {
  const rand = rng(seed);
  const out: Deco[] = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 60) {
    const t = rand();
    const d = Math.sqrt(rand()) * 0.96;
    const rr = radiusAt(ctx.grass, t) * d;
    const a = t * Math.PI * 2 - Math.PI / 2;
    const x = ctx.w.cx + Math.cos(a) * rr;
    const y = ctx.w.cy + Math.sin(a) * rr * ctx.w.squash;
    if (ctx.places.some((p) => Math.hypot(p.x - x, (p.y - y) * 1.3) < p.size * 0.72 + 18)) continue;
    if (onTrail(ctx.seg, x, y, 20)) continue;
    if (out.some((p) => Math.hypot(p.x - x, p.y - y) < gap)) continue;
    const kind = what(rand);
    out.push({ k: kind.k, x: Math.round(x), y: Math.round(y), s: kind.s });
  }
  return out;
}

/**
 * 浜に打ち上がるもの。
 * 砂の帯だけが無地だと、岸が板に見える（いまの島の beachDetail と同じ）。
 */
function beachDeco(ctx: Ctx, seed: number): Deco[] {
  const rand = rng(seed);
  const n = Math.max(8, Math.round((ctx.r / 18) | 0));
  const out: Deco[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i + rand() * 0.8) / n;
    const a = t * Math.PI * 2 - Math.PI / 2;
    const d = radiusAt(ctx.sand, t) - (12 + rand() * 14);
    const x = ctx.w.cx + Math.cos(a) * d;
    const y = ctx.w.cy + Math.sin(a) * d * ctx.w.squash;
    if (ctx.places.some((p) => Math.hypot(p.x - x, p.y - y) < 60)) continue;
    out.push({ k: rand() < 0.7 ? "rock" : "tuft", x: Math.round(x), y: Math.round(y), s: 9 + rand() * 7 });
  }
  return out;
}

/**
 * 木を撒く。
 *
 * **数は面積から決める**（`DENSITY`）。島ごとに手で決めると、大きい島が
 * 更地に見えたり、小さい島が草木で埋まったりする。
 *
 * ここに来るのは**背の高いものだけ**。小さい飾り（低木・石・草むら・花）は
 * ベクターで描いて色ごとにまとめる（`deco.ts`）。1枚ずつスプライトで置くと、
 * 密度を上げたぶんだけ `<image>` が増えて、カメラを焼き直すたびに払うことになる。
 */
function scatter(art: IslandArt, ctx: Ctx, n: number): Plant[] {
  const rand = rng(art.seed + 101);
  /* 種類を引く乱数は、置き場所の乱数と別の流れにする。
     1本の流れから交互に引くと、`props` に1種足しただけで置き場所まで動く
     （`shapes.ts` の plants と同じ理由。中東にナツメヤシを足して岩が消えた） */
  const kindOf = rng((art.seed * 2654435761) >>> 0);
  const out: Plant[] = [];
  let guard = 0;
  while (out.length < n && guard++ < n * 40) {
    const t = rand();
    const d = Math.sqrt(rand()) * 0.96;
    const rr = radiusAt(ctx.grass, t) * d;
    const a = t * Math.PI * 2 - Math.PI / 2;
    const x = ctx.w.cx + Math.cos(a) * rr;
    const y = ctx.w.cy + Math.sin(a) * rr * ctx.w.squash;
    // 建物の上と、道の上には置かない
    if (ctx.places.some((p) => Math.hypot(p.x - x, (p.y - y) * 1.3) < p.size * 0.82 + 20)) continue;
    if (onTrail(ctx.seg, x, y, 26)) continue;
    if (out.some((p) => Math.hypot(p.x - x, (p.y - y) / ctx.w.squash) < Math.max(54, ctx.r * 0.12)))
      continue;
    const kind = art.props[Math.floor(kindOf() * art.props.length)];
    out.push({
      n: kind.n,
      x: Math.round(x),
      y: Math.round(y),
      /* **背丈は島の大きさで変えない。**
         `art.props` の値は連なりの絵（島まるごとを 1枚の絵として描く）の比なので、
         そのまま掛けると小さい島の木が小さくなる。歩ける島では、建物も住人も
         あやともどの島でも同じ背丈なのに、木だけ縮んでいた
         （ヨーロッパ島で 42単位。いまの島の木は 80〜114単位で、**半分以下**）。
         並べて撮ったら、右の島だけ低木の原っぱに見えた。 */
      s: Math.round(kind.s * TREE_H),
      flip: kindOf() < 0.5,
      /* そよ風。**3本に1本だけ揺らす。** 風はまだらに吹くものだし、
         揺れる要素はそのぶん毎フレーム描き直される（いまの島と同じ決め方） */
      sway:
        out.length % 3 === 0 && /^(tree|bush|grass|flower|cactus|crop|fern)/.test(kind.n)
          ? Math.round(kindOf() * 40) / 10
          : undefined,
    });
  }
  return out;
}

/** 道のそばか。道の上に木を生やさないための判定 */
function onTrail(seg: [number, number, number, number][], x: number, y: number, near: number): boolean {
  for (const [ax, ay, bx, by] of seg) {
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((x - ax) * dx + (y - ay) * dy) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    if (Math.hypot(ax + dx * t - x, ay + dy * t - y) < near) return true;
  }
  return false;
}

/** 点が輪郭の内側か。半径配列を角度で線形に読む（`geometry.ts` の insideRadii と同じ） */
export function inside(
  w: { cx: number; cy: number; squash: number },
  radii: number[],
  x: number,
  y: number,
  margin = 0,
): boolean {
  const dx = x - w.cx;
  const dy = (y - w.cy) / w.squash;
  const dist = Math.hypot(dx, dy);
  let a = Math.atan2(dy, dx) + Math.PI / 2;
  while (a < 0) a += Math.PI * 2;
  return dist < radiusAt(radii, a / (Math.PI * 2)) - margin;
}

/** 草地からはみ出した点を、中へ引き戻す */
export function clampTo(
  w: { cx: number; cy: number; squash: number },
  radii: number[],
  x: number,
  y: number,
  margin = 10,
): [number, number] {
  if (inside(w, radii, x, y, margin)) return [x, y];
  const dx = x - w.cx;
  const dy = y - w.cy;
  for (let t = 0.96; t > 0; t -= 0.04) {
    const nx = w.cx + dx * t;
    const ny = w.cy + dy * t;
    if (inside(w, radii, nx, ny, margin)) return [nx, ny];
  }
  return [w.cx, w.cy];
}


/**
 * 海の模様。
 *
 * 一色に塗ると、島のまわりが「青い紙」になる。かといって、きらめきを
 * **動かしてはいけない**——島をぐるりと囲む形の外接矩形は画面ぜんぶになるので、
 * 海が画面の1割しか写っていなくても10割ぶんの代金を払う
 * （`CLAUDE.md`。いまの島はこれを止めるだけで PC が 12.2 → 33.8 fps になった）。
 * ここは**静止**。カメラを焼き直すときにしか塗り直されない。
 *
 * 濃さの違う3本のパスにまとめる。1つずつ置くと要素がその数だけ増えるし、
 * 濃さがそろっていると「点を撒いた」ように見える。
 */
function seaPatches(seed: number, w: { cx: number; cy: number; squash: number }, sand: number[], r: number): string[] {
  const rand = rng(seed + 313);
  const out = ["", "", ""];
  for (let i = 0; i < 112; i++) {
    const t = rand();
    // 島のすぐ外の帯にだけ撒く。遠くの沖は画面に入らないので、置くだけ無駄になる
    const d = radiusAt(sand, t) + r * (0.06 + rand() * 0.9);
    const a = t * Math.PI * 2 - Math.PI / 2;
    const x = w.cx + Math.cos(a) * d;
    const y = w.cy + Math.sin(a) * d * w.squash;
    const rx = r * (0.03 + rand() * 0.08);
    const ry = rx * (0.2 + rand() * 0.2);
    out[i % 3] +=
      `M${(x - rx).toFixed(0)},${y.toFixed(0)}a${rx.toFixed(0)},${ry.toFixed(0)} 0 1,0 ${(rx * 2).toFixed(0)},0` +
      `a${rx.toFixed(0)},${ry.toFixed(0)} 0 1,0 ${(-rx * 2).toFixed(0)},0Z`;
  }
  return out;
}
