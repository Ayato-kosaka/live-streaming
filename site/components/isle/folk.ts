/**
 * 島の住人のふるまい。**どの島でも同じように動く。**
 *
 * いまの島の `components/island/villagers.ts` は、持ち場の表が
 * 「たき火・やぐら・掲示板…」と1つの島に焼き付いていて、章ごとに
 * 建物の違う島では使えない。あちらは触らずに、**持ち場を引数で受け取る形**に
 * 作り直したのがここ。ふるまい（歩く→立ちどまる→悩む→また歩く、立ち話、
 * 話しかけると足を止める）は同じものを写している。
 *
 * ## 島にいるのは、その章に来てくれていた人
 *
 * `docs/island-atlas.md` 3章。**同じ人が複数の島に出てよい。**
 * ずっと来てくれている人は、どの島にもいる。
 *
 * ## 何をしゃべるか
 *
 * その人のセリフ帳（`content/chatter.ts`）をそのまま使う。
 * **口調はその人のもの**（`docs/island-design.md` 5章）で、中身は
 * 「初めて来た人に意味のあること」。島が変わっても、その2つは変わらない。
 * 章ごとにセリフを書き分けない——書き分けると、口調のほうが崩れる。
 */

import { rng } from "@/components/island/geometry";
import { clampTo, type Placed } from "./world";

export type Mood = "walk" | "stand" | "think" | "wave" | "gaze" | "chat";

export type Folk = {
  says: string | null;
  queue: number[];
  qi: number;
  invite: boolean;
  x: number;
  y: number;
  tx: number;
  ty: number;
  /** 持ち場 */
  hx: number;
  hy: number;
  hr: number;
  facing: 1 | -1;
  mood: Mood;
  mate: Folk | null;
  chatCool: number;
  left: number;
  speed: number;
  phase: number;
  icon: string;
  /** 本人が「出す」と決めたときだけ入る表示名 */
  name?: string;
  photo?: string;
};

/** 島の草地の中に引き戻すための、島まるごとの控え */
export type Ground = {
  cx: number;
  cy: number;
  squash: number;
  radii: number[];
  places: Placed[];
};

/**
 * 一度に島を歩く人数。
 *
 * **島の広さで決める。** どの島も12人にすると、小さい島（イラン10日）が
 * 人でいっぱいになって、島ではなく人だかりに見える。
 * 逆に広い島に4人だと、歩いても誰にも会わない。
 */
export const outToday = (r: number) => Math.min(12, Math.max(4, Math.round(r / 36)));

/** 名前から決まる、その人だけの番号。持ち場の割りあての鍵にする */
function keyOf(icon: string): number {
  let h = 2166136261;
  for (let k = 0; k < icon.length; k++) h = Math.imul(h ^ icon.charCodeAt(k), 16777619) >>> 0;
  return h;
}

/** 日本時間で数えた通算日数。日替わりの種にする */
function jstDay(now: Date): number {
  return Math.floor((now.getTime() + 9 * 3600000) / 86400000);
}

/**
 * 今日、島に出ている人。
 *
 * 全員をいつも歩かせると島が人で埋まるし、上位から固定で選ぶと
 * **昨日と今日で島がまったく同じ**になる（`docs/island-play.md` 2章）。
 * 日替わりにして、**よく来てくれている人ほど島にいる日が多い**ようにする。
 * 配信に来ている頻度がそのまま島に出るので、嘘をついていない。
 */
function rosterOf<T extends { days: number }>(all: T[], max: number, day: number): T[] {
  if (all.length <= max) return all;
  const r = rng((day * 2654435761) >>> 0);
  return all
    .map((who) => ({ who, key: Math.pow(Math.max(r(), 1e-9), 1 / Math.max(1, who.days)) }))
    .sort((a, b) => b.key - a.key)
    .slice(0, max)
    .map((x) => x.who);
}

/**
 * 島に人を置く。
 *
 * **持ち場は建物のまわり。** 持ち場が空くと、その建物のまわりに誰もいない
 * 一角ができて、島が広いだけの場所になる。建物より人が多ければ、
 * 2周目からは同じ建物の外側の輪に立つ。
 */
export function createFolk(
  people: { icon: string; days: number }[],
  g: Ground,
  r: number,
  /** 降り立つところ。**ここには必ず1人いる**（下） */
  landing: { x: number; y: number },
  today = new Date(),
): Folk[] {
  const max = outToday(r);
  const living = rosterOf(people.filter((p) => p.icon), max, jstDay(today));
  const rand = rng(20260905);
  const shuffle = (n: number) => {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  // 同じ人が同じ建物のそばに立つように、持ち場は本人の番号順で配る。
  // 「あの人はやぐらのところの人」が育つ
  const order = living
    .map((who, i) => ({ i, k: keyOf(who.icon) }))
    .sort((a, b) => a.k - b.k);
  const post: number[] = new Array(living.length);
  order.forEach((o, n) => {
    post[o.i] = n;
  });

  return living.map((who, i) => {
    const n = post[i];
    const sp = g.places[n % g.places.length];
    const lap = Math.floor(n / g.places.length);
    /* **1人は、降り立つところで過ごしている。**
       島に降りた1画面に誰もいないと、島が空き地に見える（撮って分かった）。
       持ち場を建物だけに配ると、上陸した浜のまわりが必ず無人になる。
       港のそばにいる人がいるのは、島として自然でもある。 */
    const atDock = n === 0;
    const hr = atDock ? 72 : Math.max(48, r * (0.14 + lap * 0.08));
    const hx = atDock ? landing.x : sp.x;
    const hy = atDock ? landing.y : sp.y + 22;
    const a = (i / Math.max(1, living.length)) * Math.PI * 2;
    const [x, y] = clampTo(g, g.radii, hx + Math.cos(a) * hr * 0.6, hy + Math.sin(a) * hr * 0.4, 12);
    return {
      says: null,
      queue: shuffle(12),
      qi: 0,
      invite: false,
      x,
      y,
      tx: x,
      ty: y,
      hx,
      hy,
      hr,
      facing: (rand() < 0.5 ? -1 : 1) as 1 | -1,
      mood: "stand" as Mood,
      mate: null,
      chatCool: 6000 + rand() * 20000,
      left: 400 + rand() * 2600,
      speed: 0.34 + rand() * 0.16,
      phase: rand() * Math.PI * 2,
      icon: who.icon,
    };
  });
}

/** 次の行き先。建物の真上には立たない。たまに、近くの人のとなりを目指す */
function wander(v: Folk, vs: Folk[], g: Ground, r: () => number): [number, number] {
  if (r() < 0.14) {
    const near = vs.filter(
      (o) => o !== v && !o.says && o.mood !== "walk" && Math.hypot(o.x - v.x, (o.y - v.y) * 1.4) < 190,
    );
    const o = near[Math.floor(r() * near.length)];
    if (o) {
      const side = r() < 0.5 ? -1 : 1;
      const [x, y] = clampTo(g, g.radii, o.x + side * 26, o.y + (r() - 0.5) * 10, 12);
      if (!g.places.some((s) => Math.hypot(s.x - x, (s.y - y) * 1.4) < 42)) return [x, y];
    }
  }
  for (let i = 0; i < 12; i++) {
    const a = r() * Math.PI * 2;
    const d = 18 + r() * v.hr;
    const [x, y] = clampTo(g, g.radii, v.hx + Math.cos(a) * d, v.hy + Math.sin(a) * d * 0.7, 12);
    if (g.places.some((s) => Math.hypot(s.x - x, (s.y - y) * 1.4) < 42)) continue;
    return [x, y];
  }
  return [v.x, v.y];
}

function unpair(v: Folk) {
  const o = v.mate;
  v.mate = null;
  if (!o) return;
  // 話しおわった2人は、しばらく別のことをする。すぐ話し直すと、
  // 同じ2人が固まっている絵になって島が動いて見えない
  v.chatCool = 24000;
  if (o.mate === v) {
    o.mate = null;
    o.chatCool = 24000;
    if (o.mood === "chat") {
      o.mood = "think";
      o.left = 300;
    }
  }
}

/** 近くに立っている人どうしを、立ち話にする */
function pairUp(vs: Folk[], r: () => number) {
  for (const v of vs) {
    if (v.says || v.mate || v.mood === "walk" || v.chatCool > 0) continue;
    for (const o of vs) {
      if (o === v || o.says || o.mate || o.mood === "walk" || o.chatCool > 0) continue;
      if (Math.hypot(v.x - o.x, (v.y - o.y) * 1.6) > 34) continue;
      v.mate = o;
      o.mate = v;
      v.facing = o.x > v.x ? 1 : -1;
      o.facing = v.facing === 1 ? -1 : 1;
      v.mood = "chat";
      o.mood = "chat";
      const span = 4000 + r() * 4000;
      v.left = span;
      o.left = span;
      break;
    }
  }
}

/** 立ち話の見まわりは毎フレーム要らない。島は1フレームでやる仕事が少ないほどいい */
let pairLeft = 0;

/** 1フレームぶん進める */
export function stepFolk(vs: Folk[], dtMs: number, g: Ground, r: () => number) {
  const dt = dtMs / 16.67;
  pairLeft -= dtMs;
  if (pairLeft <= 0) {
    pairLeft = 700;
    pairUp(vs, r);
  }
  for (const v of vs) {
    v.left -= dtMs;
    if (v.chatCool > 0) v.chatCool -= dtMs;
    // 話している間は足を止めて、閉じられるまで待つ
    if (v.says) continue;
    if (v.mood === "walk") {
      const dx = v.tx - v.x;
      const dy = v.ty - v.y;
      const d = Math.hypot(dx, dy);
      if (d < 3 || v.left <= 0) {
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
    if (v.mood === "chat") {
      unpair(v);
      v.mood = "think";
      v.left = 300 + r() * 700;
      continue;
    }
    if (v.mood === "think") {
      const dice = r();
      if (dice < 0.22) {
        v.mood = "wave";
        v.left = 900 + r() * 700;
      } else if (dice < 0.36) {
        // じっと動かない時間。動いていないことが「何かを見ている」に見える
        v.mood = "gaze";
        v.left = 3000 + r() * 3600;
      } else {
        const [tx, ty] = wander(v, vs, g, r);
        v.tx = tx;
        v.ty = ty;
        v.mood = "walk";
        v.left = 9000;
      }
      continue;
    }
    v.mood = r() < 0.65 ? "think" : "stand";
    v.left = v.mood === "think" ? 500 + r() * 900 : 1200 + r() * 2600;
  }
}

/** そのページで、もう挨拶したか。挨拶は1回でいい */
let greeted = false;

/**
 * 話しかける。
 * 吹き出しは自分で閉じるまで出したまま。読みかけで消えるのがいちばん困る。
 * セリフはシャッフルした順に1つずつ。一周するまで同じ話はしない。
 */
export function talkTo(v: Folk, lines: string[], greet?: string) {
  if (!lines.length && !greet) return;
  unpair(v);
  v.mood = "wave";
  v.left = 1400;
  v.invite = false;
  if (greet && !greeted) {
    greeted = true;
    v.says = greet;
    return;
  }
  greeted = true;
  const idx = v.queue.filter((i) => i < lines.length);
  const pick = idx.length ? idx[v.qi % idx.length] : 0;
  v.qi = (v.qi + 1) % Math.max(1, idx.length);
  v.says = lines[pick] ?? greet ?? null;
}

export function hush(v: Folk) {
  v.says = null;
  v.mood = "think";
  v.left = 400;
}

/**
 * 「話しかけて」の合図を出す人を入れ替える。
 * 全員がいつも合図していると島がうるさいので、数人ずつ順番に回す。
 */
export function rotateInvites(vs: Folk[], tick: number, canTalk: (v: Folk) => boolean, at = 3) {
  const able = vs.filter((v) => canTalk(v));
  able.forEach((v) => {
    v.invite = false;
  });
  if (!able.length) return;
  // まだ話していない人を先に回す。同じ人ばかり合図していると、
  // 島を一周しても聞ける話が増えない
  const fresh = able.filter((v) => v.qi === 0);
  const pool = fresh.length >= at ? fresh : able;
  for (let k = 0; k < at; k++) {
    const v = pool[(tick * at + k) % pool.length];
    if (v && !v.says) v.invite = true;
  }
}

/** そのページで、もう向こうから声をかけたか */
let called = false;
/** 島に降りてから、声をかけるまでの間（ミリ秒） */
const CALL_AFTER = 9000;
/** どれだけ近づいたら声をかけるか（ワールド単位） */
const CALL_NEAR = 96;

/**
 * すぐそばまで来た人に、向こうから声をかけたい住人。いなければ null。
 *
 * 「参加してください」と呼びかけても誰も押さない。**こちらから声をかけて、
 * 応じてもらう**（`docs/island-play.md` 3つの原理の3番）。1来訪に1回だけ。
 */
export function callOut(vs: Folk[], me: { x: number; y: number }, sinceMs: number): Folk | null {
  if (called || greeted || sinceMs < CALL_AFTER) return null;
  for (const v of vs) {
    if (!v.invite || v.says) continue;
    if (Math.hypot(v.x - me.x, (v.y - me.y) * 1.3) > CALL_NEAR) continue;
    called = true;
    return v;
  }
  return null;
}

/** 島を移ったら、挨拶と声かけの控えをまっさらにする */
export function resetTalk() {
  greeted = false;
  called = false;
  pairLeft = 0;
}

/** その位置にいちばん近い住人。押した所から離れていれば null */
export function folkAt(vs: Folk[], x: number, y: number, reach = 34): Folk | null {
  let best: Folk | null = null;
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

/** その瞬間の見た目のゆれ。歩きは上下に、悩みは首をかしげる */
export function folkPose(v: Folk, t: number) {
  if (v.mood === "walk") return { dy: -Math.abs(Math.sin(t * 0.011 + v.phase)) * 3.2, rot: 0 };
  if (v.mood === "think") return { dy: 0, rot: Math.sin(t * 0.0026 + v.phase) * 7 };
  if (v.mood === "wave")
    return { dy: -Math.abs(Math.sin(t * 0.014 + v.phase)) * 2.2, rot: Math.sin(t * 0.014 + v.phase) * 5 };
  if (v.mood === "chat")
    return { dy: -Math.abs(Math.sin(t * 0.0042 + v.phase)) * 1.6, rot: Math.sin(t * 0.0042 + v.phase) * 3 };
  if (v.mood === "gaze") return { dy: 0, rot: 0 };
  return { dy: 0, rot: Math.sin(t * 0.0012 + v.phase) * 1.5 };
}
