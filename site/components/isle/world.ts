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

export type Placed = IslePlaceSpec & { x: number; y: number };
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
  /** 舟をつなぐところ。あやとはここから歩きはじめる */
  dock: { x: number; y: number };
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
     船着き場だけは浜（砂の上）。ほかは草地のふちに沿って一周。
     角度は種から決まるので、同じ章なら何度描いても同じ島になる。 */
  const rand = rng(art.seed * 7 + 3);
  const dockT = 0.5 + (rand() - 0.5) * 0.08; // だいたい南。船は手前から着く
  const dockAt = at(w, sand, dockT, BEACH * 0.42);

  const ring = spec.places.filter((p) => p.id !== "pier");
  const start = rand();
  const placed: Placed[] = ring.map((p, i) => {
    /* 一周に等間隔で配る。等間隔からずらす量は種から。
       **船着き場のまわりは空けておく**（着いた瞬間に建物が顔の前にあると、
       島がどう広がっているのか分からない）。 */
    const t = (start + (i + 0.5) / ring.length) % 1;
    const away = Math.min(Math.abs(t - dockT), 1 - Math.abs(t - dockT));
    const tt = away < 0.06 ? (t + 0.1) % 1 : t;
    /* **中心からの距離は、その向きの島の幅に対する割合で決める。**
       「ふちから何単位」で置くと、細くなっている向き（北欧の西側は
       いちばん広いところの半分しかない）で建物が中心まで寄ってきて、
       5軒が1か所に固まる。実際そうなった。
       そのうえで、浜からは必ず離す（浜に建てると波打ち際に建物が立つ）。 */
    const rr = radiusAt(sand, tt);
    const d = Math.min(rr - BEACH - 16, rr * (0.6 + rand() * 0.18));
    const a = tt * Math.PI * 2 - Math.PI / 2;
    return {
      ...p,
      x: Math.round(cx + Math.cos(a) * d),
      y: Math.round(cy + Math.sin(a) * d * SQUASH),
    };
  });
  const pier = spec.places.find((p) => p.id === "pier");
  if (pier) placed.push({ ...pier, x: Math.round(dockAt.x), y: Math.round(dockAt.y) });
  // 奥から手前へ。名札が重なったとき、手前のものが上に来る
  placed.sort((a, b) => a.y - b.y);

  /* --- 道 ---
     建物どうしをつなぐのではなく、島のまん中の広場から放射に引く。
     総当たりでつなぐと格子になって、島が公園に見える（いまの島と同じ考え）。 */
  const hub = { x: cx, y: cy + r * 0.06 };
  const trail = placed
    .map((p) => {
      const mx = (hub.x + p.x) / 2 + (p.x - hub.x) * 0.06 - (p.y - hub.y) * 0.12;
      const my = (hub.y + p.y) / 2 + (p.y - hub.y) * 0.06 + (p.x - hub.x) * 0.06;
      return `M${hub.x.toFixed(0)},${hub.y.toFixed(0)}Q${mx.toFixed(0)},${my.toFixed(0)} ${p.x.toFixed(0)},${(p.y + 12).toFixed(0)}`;
    })
    .join("");

  /* 着いた舟。船着き場につないである（`docs/island-atlas.md` 6章「島から島へは船で行く」）。
     草木と同じ列に入れておくと、奥行きの並べ替えに一緒に乗る。
     別に描くと、手前に立ったあやとが舟の裏に隠れる */
  const plants = scatter(art, { cx, cy, squash: SQUASH }, grass, r, placed, hub);
  plants.push({ n: "canoe", x: Math.round(dockAt.x) + 24, y: Math.round(dockAt.y) + 8, s: 18, flip: false });
  plants.sort((a, b) => a.y - b.y);

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
    art,
  };
}

/**
 * 草木を撒く。
 *
 * **数は面積から決める。** 島ごとに手で決めると、大きい島が更地に見えたり、
 * 小さい島が草木で埋まったりする。上限があるのは、島は1つしか見えていないとはいえ
 * スプライトは1枚ずつ描かれるから（いまの島が 160枚で放置1秒 280ms）。
 */
function scatter(
  art: IslandArt,
  w: { cx: number; cy: number; squash: number },
  grass: number[],
  r: number,
  places: Placed[],
  hub: { x: number; y: number },
): Plant[] {
  const n = Math.min(76, Math.max(10, Math.round((r * r) / 1700)));
  const rand = rng(art.seed + 101);
  /* 種類を引く乱数は、置き場所の乱数と別の流れにする。
     1本の流れから交互に引くと、`props` に1種足しただけで置き場所まで動く
     （`shapes.ts` の plants と同じ理由。中東にナツメヤシを足して岩が消えた） */
  const pick = rng((art.seed * 2654435761) >>> 0);
  const out: Plant[] = [];
  let guard = 0;
  while (out.length < n && guard++ < n * 24) {
    const t = rand();
    const d = Math.sqrt(rand()) * 0.94;
    const rr = radiusAt(grass, t) * d;
    const a = t * Math.PI * 2 - Math.PI / 2;
    const x = w.cx + Math.cos(a) * rr;
    const y = w.cy + Math.sin(a) * rr * w.squash;
    // 建物の上と、道の上には置かない
    if (places.some((p) => Math.hypot(p.x - x, (p.y - y) * 1.3) < p.size * 0.9 + 22)) continue;
    if (Math.hypot(hub.x - x, (hub.y - y) * 1.3) < r * 0.16) continue;
    if (onTrail(hub, places, x, y, 20)) continue;
    if (out.some((p) => Math.hypot(p.x - x, (p.y - y) / w.squash) < r * 0.075)) continue;
    const kind = art.props[Math.floor(pick() * art.props.length)];
    out.push({
      n: kind.n,
      x: Math.round(x),
      y: Math.round(y),
      s: Math.round(kind.s * r * 0.44),
      flip: pick() < 0.5,
      // 揺れるのは草木だけ。岩は揺れない。外接矩形が小さいので、揺らしても値段はほぼゼロ
      sway: /^(tree|bush|grass|flower|cactus|crop|fern)/.test(kind.n)
        ? Math.round(pick() * 40) / 10
        : undefined,
    });
  }
  return out.sort((a, b) => a.y - b.y);
}

/** 道のそばか。道の上に木を生やさないための、ざっくりした判定 */
function onTrail(
  hub: { x: number; y: number },
  places: Placed[],
  x: number,
  y: number,
  near: number,
): boolean {
  for (const p of places) {
    // 直線で見る。実際の道は少し曲げてあるが、避ける幅のほうが大きいので足りる
    const dx = p.x - hub.x;
    const dy = p.y + 12 - hub.y;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((x - hub.x) * dx + (y - hub.y) * dy) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    if (Math.hypot(hub.x + dx * t - x, hub.y + dy * t - y) < near) return true;
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
  for (let i = 0; i < 54; i++) {
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
