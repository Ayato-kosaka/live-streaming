/**
 * 島の住人のふるまい。
 *
 * 島に住んでいるのは、キャラクターを作ってくれた視聴者さん本人たち。
 * 借り物のキャラを立たせるのではなく、その人の絵がそのまま島にいる。
 *
 * どうぶつの森の住人は、ただ往復しているのではなく
 *   歩く → 立ちどまる → ちょっと悩む → また歩きだす
 * という間があるから生きて見える。ここではその「間」を状態として持つ。
 * 住人ごとに持ち場(仕事のある場所)があって、その周りをうろうろする。
 */

import { GRASS_INSET, ISLAND, SPOTS, type SpotId } from "./layout";
import { inset, insideRadii, rng } from "./geometry";

const HOME_R = inset(ISLAND.radii, GRASS_INSET + 12);

/** どの場所に住みついているか。持ち場によって何をしている人かが変わる。 */
const POSTS: { spot: SpotId; r: number }[] = [
  { spot: "kitchen", r: 74 },
  { spot: "apps", r: 74 },
  { spot: "streams", r: 86 },
  { spot: "board", r: 66 },
  { spot: "friends", r: 70 },
  { spot: "map", r: 66 },
  { spot: "now", r: 62 },
  { spot: "legends", r: 62 },
  { spot: "next", r: 62 },
  { spot: "kitchen", r: 100 },
  { spot: "streams", r: 118 },
  { spot: "friends", r: 96 },
];

export type Mood = "walk" | "stand" | "think" | "wave";

export type Villager = {
  /** 持ち場の場所ID。何をしゃべるかがこれで決まる */
  post: SpotId;
  /** いま出している吹き出し。null なら黙っている */
  says: string | null;
  /** 吹き出しが消えるまでのミリ秒 */
  saysLeft: number;
  /** いま居る場所 */
  x: number;
  y: number;
  /** 向かっている場所 */
  tx: number;
  ty: number;
  /** 持ち場 */
  hx: number;
  hy: number;
  hr: number;
  facing: 1 | -1;
  mood: Mood;
  /** いまの状態があと何ミリ秒つづくか */
  left: number;
  /** 歩く速さ(1フレーム=16.7ms あたりのワールド単位) */
  speed: number;
  /** 上下の揺れの位相。全員がそろって跳ねないようにずらす */
  phase: number;
  /** 見ている人のアイコン */
  icon?: string;
  emoji?: string;
};

const SPOT = Object.fromEntries(SPOTS.map((s) => [s.id, s])) as Record<SpotId, (typeof SPOTS)[number]>;

/** 島の草地からはみ出さないところまで引き戻す。 */
export function clampToGrass(x: number, y: number): [number, number] {
  if (insideRadii(ISLAND.cx, ISLAND.cy, HOME_R, x, y, ISLAND.squash, 8)) return [x, y];
  const dx = x - ISLAND.cx;
  const dy = y - ISLAND.cy;
  for (let t = 0.96; t > 0; t -= 0.04) {
    const nx = ISLAND.cx + dx * t;
    const ny = ISLAND.cy + dy * t;
    if (insideRadii(ISLAND.cx, ISLAND.cy, HOME_R, nx, ny, ISLAND.squash, 8)) return [nx, ny];
  }
  return [ISLAND.cx, ISLAND.cy];
}

/** 持ち場のまわりに次の行き先を決める。建物の真上には立たない。 */
function wander(v: Villager, r: () => number): [number, number] {
  for (let i = 0; i < 12; i++) {
    const a = r() * Math.PI * 2;
    const d = 18 + r() * v.hr;
    const [x, y] = clampToGrass(v.hx + Math.cos(a) * d, v.hy + Math.sin(a) * d * 0.7);
    if (SPOTS.some((s) => Math.hypot(s.x - x, (s.y - y) * 1.4) < 42)) continue;
    return [x, y];
  }
  return [v.hx, v.hy];
}

export type Resident = { icon?: string; emoji?: string; days: number };

/**
 * 島に住んでいる人をつくる。
 * キャラクターを作ってくれた人（絵がある人）だけが島を歩く。
 * SSR と CSR で同じ並びになるよう、乱数は種を固定する。
 */
export function createVillagers(residents: Resident[], max = 12): Villager[] {
  const r = rng(20260904);
  const living = residents.filter((x) => x.icon).slice(0, max);
  return living.map((who, i) => {
    const post = POSTS[i % POSTS.length];
    const s = SPOT[post.spot];
    const a = (i / Math.max(1, living.length)) * Math.PI * 2;
    const [x, y] = clampToGrass(s.x + Math.cos(a) * post.r * 0.6, s.y + 26 + Math.sin(a) * post.r * 0.4);
    return {
      post: post.spot,
      says: null,
      saysLeft: 0,
      x, y, tx: x, ty: y,
      hx: s.x, hy: s.y + 24, hr: post.r,
      facing: r() < 0.5 ? -1 : 1,
      mood: "stand" as Mood,
      left: 400 + r() * 2600,
      speed: 0.34 + r() * 0.16,
      phase: r() * Math.PI * 2,
      icon: who.icon,
      emoji: who.emoji,
    };
  });
}

/**
 * 1フレームぶん進める。
 * @param {Villager[]} vs 住人
 * @param {number} dtMs 経過ミリ秒
 * @param {() => number} r 乱数
 */
export function stepVillagers(vs: Villager[], dtMs: number, r: () => number) {
  const dt = dtMs / 16.67;
  for (const v of vs) {
    v.left -= dtMs;
    if (v.says) {
      v.saysLeft -= dtMs;
      if (v.saysLeft <= 0) v.says = null;
    }
    if (v.mood === "walk") {
      const dx = v.tx - v.x;
      const dy = v.ty - v.y;
      const d = Math.hypot(dx, dy);
      if (d < 3 || v.left <= 0) {
        // 着いた。次にどこへ行くか、少し悩む
        v.mood = "think";
        v.left = 500 + r() * 1100;
      } else {
        const sp = v.speed * dt;
        v.x += (dx / d) * sp;
        v.y += (dy / d) * sp;
        if (Math.abs(dx) > 0.4) v.facing = dx > 0 ? 1 : -1;
      }
      continue;
    }
    if (v.left > 0) continue;
    if (v.mood === "think") {
      // 悩みおわった。たまに手を振ってから歩きだす
      if (r() < 0.28) {
        v.mood = "wave";
        v.left = 900 + r() * 700;
      } else {
        const [tx, ty] = wander(v, r);
        v.tx = tx;
        v.ty = ty;
        v.mood = "walk";
        v.left = 9000;
      }
      continue;
    }
    // stand / wave のあとは、しばらく立ちどまってから悩みはじめる
    v.mood = r() < 0.65 ? "think" : "stand";
    v.left = v.mood === "think" ? 500 + r() * 900 : 1200 + r() * 2600;
  }
}

/** 押された住人にひとこと言わせる。話しているあいだは足を止める。 */
export function talkTo(v: Villager, lines: string[], r: () => number) {
  if (!lines.length) return;
  v.says = lines[Math.floor(r() * lines.length) % lines.length];
  v.saysLeft = 4200;
  v.mood = "wave";
  v.left = 1200;
}

/** その位置にいちばん近い住人。押した所から離れていれば null。 */
export function villagerAt(vs: Villager[], x: number, y: number, reach = 34): Villager | null {
  let best: Villager | null = null;
  let bd = reach;
  for (const v of vs) {
    const d = Math.hypot(v.x - x, (v.y - y - 16) * 0.8);
    if (d < bd) {
      bd = d;
      best = v;
    }
  }
  return best;
}

/** その瞬間の見た目のゆれ。歩きは上下に、悩みは首をかしげる。 */
export function villagerPose(v: Villager, t: number) {
  if (v.mood === "walk") {
    return { dy: -Math.abs(Math.sin(t * 0.011 + v.phase)) * 3.2, rot: 0 };
  }
  if (v.mood === "think") {
    return { dy: 0, rot: Math.sin(t * 0.0026 + v.phase) * 7 };
  }
  if (v.mood === "wave") {
    return { dy: -Math.abs(Math.sin(t * 0.014 + v.phase)) * 2.2, rot: Math.sin(t * 0.014 + v.phase) * 5 };
  }
  return { dy: 0, rot: Math.sin(t * 0.0012 + v.phase) * 1.5 };
}
