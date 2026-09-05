/**
 * 島の住人のふるまい。
 *
 * 島に住んでいるのは、キャラクターを作ってくれた視聴者さん本人たち。
 * 借り物のキャラを立たせるのではなく、その人の絵がそのまま島にいる。
 *
 * どうぶつの森の住人は、ただ往復しているのではなく
 *   歩く → 立ちどまる → ちょっと悩む → また歩きだす
 * という間があるから生きて見える。ここではその「間」を状態として持つ。
 *
 * それに加えて、この島では3つのことをしている（`docs/island-play.md` E）。
 *   1. **島に出ている人が日によって変わる。** 昨日と今日で島の顔ぶれが違う
 *   2. **住人どうしが立ち話をする。** 自分がいなくても世界が回っていることを、絵で見せる
 *   3. **配信の時間は、みんなやぐらのほうへ寄る。** 島の絵が現実と同期する
 *
 * 「久しぶり」の1言目もここで出す（仕掛け6）。
 * ただし **空けた日数は数えない。来なかった日を責める仕掛けは作らない。**
 */

import { greetOf } from "@/content/chatter";
import { GRASS_INSET, ISLAND, PLACES, type SpotId } from "./layout";
import { inset, insideRadii, rng } from "./geometry";

const HOME_R = inset(ISLAND.radii, GRASS_INSET + 12);

/** 一度に島を歩く人数。全員出すと島が人で埋まって、1人ずつの顔が見えない。 */
export const OUT_TODAY = 12;

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

/**
 * walk  歩いている
 * stand 立っている
 * think 次にどこへ行くか悩んでいる
 * wave  手を振っている
 * gaze  持ち場のものをじっと見ている（たき火・掲示板・やぐら）
 * chat  近くの住人と立ち話をしている
 */
export type Mood = "walk" | "stand" | "think" | "wave" | "gaze" | "chat";

export type Villager = {
  /** 持ち場の場所ID。何をしゃべるかがこれで決まる */
  post: SpotId;
  /** いま出している吹き出し。null なら黙っている。
      勝手には消えない。読み終わったら自分で閉じてもらう。 */
  says: string | null;
  /** セリフ帳をシャッフルした順番。同じ話ばかりにならないように回す。 */
  queue: number[];
  /** いま queue の何番目か */
  qi: number;
  /** 話しかけて、と合図を出している最中か。数人ずつ順番に回す。 */
  invite: boolean;
  /** いま居る場所 */
  x: number;
  y: number;
  /** 向かっている場所 */
  tx: number;
  ty: number;
  /** いまの持ち場。配信の時間だけ、やぐらのほうへ寄る */
  hx: number;
  hy: number;
  hr: number;
  /** 本来の持ち場。寄ったあと、ここへ戻す */
  px: number;
  py: number;
  pr: number;
  facing: 1 | -1;
  mood: Mood;
  /** 立ち話の相手。いなければ null */
  mate: Villager | null;
  /** 次に立ち話していいまで、あと何ミリ秒か */
  chatCool: number;
  /** いまの状態があと何ミリ秒つづくか */
  left: number;
  /** 歩く速さ(1フレーム=16.7ms あたりのワールド単位) */
  speed: number;
  /** 上下の揺れの位相。全員がそろって跳ねないようにずらす */
  phase: number;
  /** 見ている人のアイコン(キャラクター画像) */
  icon?: string;
  emoji?: string;
  /** 表示してよい名前。本人が出すと決めたときだけ入る。 */
  name?: string;
  /** 表示してよい YouTube のアイコン。本人が出すと決めたときだけ入る。 */
  photo?: string;
};

const SPOT = Object.fromEntries(PLACES.map((s) => [s.id, s])) as Record<SpotId, (typeof PLACES)[number]>;

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

/**
 * 次の行き先を決める。建物の真上には立たない。
 *
 * たまに、近くに立っている人のとなりを目指す。
 * これがあると立ち話が生まれる。持ち場のまわりを回るだけだと、
 * 12人が12か所でばらばらに動いているだけの島になる。
 */
function wander(v: Villager, vs: Villager[], r: () => number): [number, number] {
  if (r() < 0.14) {
    const near = vs.filter(
      (o) => o !== v && !o.says && o.mood !== "walk" && Math.hypot(o.x - v.x, (o.y - v.y) * 1.4) < 190,
    );
    const o = near[Math.floor(r() * near.length)];
    if (o) {
      const side = r() < 0.5 ? -1 : 1;
      const [x, y] = clampToGrass(o.x + side * 26, o.y + (r() - 0.5) * 10);
      if (!PLACES.some((s) => Math.hypot(s.x - x, (s.y - y) * 1.4) < 42)) return [x, y];
    }
  }
  for (let i = 0; i < 12; i++) {
    const a = r() * Math.PI * 2;
    const d = 18 + r() * v.hr;
    const [x, y] = clampToGrass(v.hx + Math.cos(a) * d, v.hy + Math.sin(a) * d * 0.7);
    if (PLACES.some((s) => Math.hypot(s.x - x, (s.y - y) * 1.4) < 42)) continue;
    return [x, y];
  }
  // どこも空いていなければ、その場にとどまる。持ち場へ戻すと建物の上に立つことがある
  return [v.x, v.y];
}

export type Resident = {
  icon?: string;
  emoji?: string;
  days: number;
  /** 本人が「出す」と決めたときだけ入る表示名（ニックネーム可） */
  name?: string;
  /** 本人が「出す」と決めたときだけ入る YouTube のアイコン */
  photo?: string;
};

/** 日本時間で数えた通算日数。日替わりの種にする。 */
function jstDay(now: Date): number {
  return Math.floor((now.getTime() + 9 * 3600000) / 86400000);
}

/**
 * 今日、島に出ている人。
 *
 * 22人を毎日ぜんぶ歩かせると島が人で埋まるし、上位12人で固定すると
 * **昨日と今日で島がまったく同じ**になる（`docs/island-play.md` 2章）。
 * なので日替わりにする。**よく来てくれている人ほど、島にいる日が多い。**
 * 配信に来る頻度がそのまま島に出るので、嘘をついていない。
 * そして「今日は誰がいるかな」が、そのまま毎日もう一度開く理由になる（同 G）。
 *
 * @param {Resident[]} residents キャラクターを作ってくれた人
 * @param {number} max 一度に島を歩く人数
 * @param {number} day 日本時間の通算日数
 */
function rosterOf(residents: Resident[], max: number, day: number): Resident[] {
  if (residents.length <= max) return residents;
  const r = rng((day * 2654435761) >>> 0);
  // 重み付きの抽選。days が大きい人ほど 1 に近い値が出て、前に並ぶ
  return residents
    .map((who) => ({ who, key: Math.pow(Math.max(r(), 1e-9), 1 / Math.max(1, who.days)) }))
    .sort((a, b) => b.key - a.key)
    .slice(0, max)
    .map((x) => x.who);
}

/** 名前から決まる、その人だけの番号。並べ替えの鍵にする。 */
function keyOf(icon: string | undefined, i: number): number {
  const s = icon ?? `n${i}`;
  let h = 2166136261;
  for (let k = 0; k < s.length; k++) h = Math.imul(h ^ s.charCodeAt(k), 16777619) >>> 0;
  return h;
}

/**
 * 持ち場の配りかた。
 *
 * **12の持ち場に1人ずつ**。ここは崩さない。持ち場が空くと、その入口のまわりに
 * 誰もいない一角ができて、島が広いだけの場所になる。
 *
 * そのうえで、並べる順はその人ごとの番号で決める。顔ぶれが変わらないかぎり
 * 同じ人が同じ持ち場に立つので、「あの人はたき火のところの人」が育つ。
 */
function assignPosts(living: Resident[]): { spot: SpotId; r: number }[] {
  const order = living.map((who, i) => ({ i, k: keyOf(who.icon, i) })).sort((a, b) => a.k - b.k);
  const out: { spot: SpotId; r: number }[] = new Array(living.length);
  order.forEach((o, n) => {
    out[o.i] = POSTS[n % POSTS.length];
  });
  return out;
}

/**
 * 島に住んでいる人をつくる。
 * キャラクターを作ってくれた人（絵がある人）だけが島を歩く。
 *
 * 顔ぶれは日替わりだが、**書き出す DOM の数は変わらない**（いつも max 人）。
 * 住人の絵は画像が読めてから出すので、静的書き出しの HTML には1枚も入っていない。
 * だから日をまたいでも、焼き込みと画面のあいだで食い違いは起きない。
 *
 * @param {Resident[]} residents キャラクターを作ってくれた人
 * @param {number} max 一度に島を歩く人数
 * @param {Date} today 今日（日替わりの顔ぶれを決めるのに使う）
 */
export function createVillagers(residents: Resident[], max = OUT_TODAY, today = new Date()): Villager[] {
  const r = rng(20260904);
  /** セリフ帳の並びを人ごとにシャッフルしておく。話す順番が毎回変わる。 */
  const shuffle = (n: number) => {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const living = rosterOf(residents.filter((x) => x.icon), max, jstDay(today));
  const posts = assignPosts(living);
  return living.map((who, i) => {
    const post = posts[i];
    const s = SPOT[post.spot];
    const a = (i / Math.max(1, living.length)) * Math.PI * 2;
    const [x, y] = clampToGrass(s.x + Math.cos(a) * post.r * 0.6, s.y + 26 + Math.sin(a) * post.r * 0.4);
    const hx = s.x;
    const hy = s.y + 24;
    return {
      post: post.spot,
      says: null,
      queue: shuffle(12),
      qi: 0,
      invite: false,
      x, y, tx: x, ty: y,
      hx, hy, hr: post.r,
      px: hx, py: hy, pr: post.r,
      facing: r() < 0.5 ? -1 : 1,
      mood: "stand" as Mood,
      mate: null,
      chatCool: 6000 + r() * 20000,
      left: 400 + r() * 2600,
      speed: 0.34 + r() * 0.16,
      phase: r() * Math.PI * 2,
      icon: who.icon,
      emoji: who.emoji,
      name: who.name,
      photo: who.photo,
    };
  });
}

/** 立ち話をやめる。相手のほうも忘れさせる。 */
function unpair(v: Villager) {
  const o = v.mate;
  v.mate = null;
  if (!o) return;
  // 話しおわった2人は、しばらく別のことをする。すぐ話し直すと、
  // 同じ2人がずっと固まっている絵になって、島が動いて見えない
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

/**
 * 近くに立っている人どうしを、立ち話にする。
 * 総当たりだが12人なので軽い。それでも毎フレームは要らないので間引いて呼ぶ。
 */
function pairUp(vs: Villager[], r: () => number) {
  for (const v of vs) {
    if (v.says || v.mate || v.mood === "walk" || v.chatCool > 0) continue;
    for (const o of vs) {
      if (o === v || o.says || o.mate || o.mood === "walk" || o.chatCool > 0) continue;
      if (Math.hypot(v.x - o.x, (v.y - o.y) * 1.6) > 34) continue;
      v.mate = o;
      o.mate = v;
      // 向かい合う。住人の絵は左右を反転していないので見た目には出ないが、
      // 話が終わって歩きだすときの向きがそろう
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

/** 配信の時間か（日本時間 22:00〜25:00）。`lib/nightly.ts` と同じ決まり。 */
function onAirNow(now: Date): boolean {
  const h = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 9 * 3600000).getHours();
  return h >= 22 || h < 1;
}

/**
 * 配信の時間だけ、みんなやぐらのほうへ寄る。
 *
 * 島の絵が、現実にいま配信があるかどうかを表す（`docs/island-play.md` A）。
 * 寄せるのは半分くらいにとどめる。やぐらの上に全員が立つと、絵として壊れる。
 */
function setGather(vs: Villager[], on: boolean) {
  const y = SPOT.streams;
  for (const v of vs) {
    if (on) {
      v.hx = v.px + (y.x - v.px) * 0.45;
      v.hy = v.py + (y.y + 54 - v.py) * 0.45;
      v.hr = Math.max(56, v.pr * 0.8);
    } else {
      v.hx = v.px;
      v.hy = v.py;
      v.hr = v.pr;
    }
  }
}

/* 時計と立ち話の見まわりは、毎フレームやる必要がない。
   島には 160 枚以上のスプライトがあるので、1フレームでやる仕事は少ないほどいい。 */
let gathered: boolean | null = null;
let clockLeft = 0;
let pairLeft = 0;

/**
 * 1フレームぶん進める。
 * @param {Villager[]} vs 住人
 * @param {number} dtMs 経過ミリ秒
 * @param {() => number} r 乱数
 */
export function stepVillagers(vs: Villager[], dtMs: number, r: () => number) {
  const dt = dtMs / 16.67;

  // 20秒に1回だけ時計を見る。配信が始まった／終わったら、持ち場を寄せ直す
  clockLeft -= dtMs;
  if (clockLeft <= 0) {
    clockLeft = 20000;
    const on = onAirNow(new Date());
    if (on !== gathered) {
      gathered = on;
      setGather(vs, on);
    }
  }

  // 立ち話の相手を探すのは 700ms に1回で足りる
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
    if (v.mood === "chat") {
      // 話が終わった。少し間を置いてから、それぞれ歩きだす
      unpair(v);
      v.mood = "think";
      v.left = 300 + r() * 700;
      continue;
    }
    if (v.mood === "think") {
      // 悩みおわった。手を振るか、持ち場のものを見にいくか、歩きだすか
      const dice = r();
      if (dice < 0.22) {
        v.mood = "wave";
        v.left = 900 + r() * 700;
      } else if (dice < 0.36) {
        // じっと動かない時間。何かを見ている、として読ませる。
        // 長すぎると「止まっている」に見えるので、10秒は超えさせない
        v.mood = "gaze";
        v.left = 3000 + r() * 3600;
      } else {
        const [tx, ty] = wander(v, vs, r);
        v.tx = tx;
        v.ty = ty;
        v.mood = "walk";
        v.left = 9000;
      }
      continue;
    }
    // stand / wave / gaze のあとは、しばらく立ちどまってから悩みはじめる
    v.mood = r() < 0.65 ? "think" : "stand";
    v.left = v.mood === "think" ? 500 + r() * 900 : 1200 + r() * 2600;
  }
}

/* ---- 1言目 --------------------------------------------------------------
   はじめて来た人には「はじめまして」、しばらく空いた人には「久しぶり」から始める
   （`docs/island-play.md` 仕掛け6）。前回を参照した文が1つあるだけで、
   関係が途切れていないと感じる。実装量と体感の差がいちばん大きいところ。

   **連続日数は数えない。空けた日数も出さない。**
   「久しぶり」は歓迎であって督促ではない。来なかった日を責める仕掛けを、
   配信者のサイトに置いてはいけない（同 4章）。
   ------------------------------------------------------------------------ */

/** 最後に島の誰かと話した日（YYYY-MM-DD）。これ1つしか持たない。 */
const MET = "ayato-island-met";
/** これだけ空いたら「久しぶり」（日） */
const AGAIN = 7;
/** このページを開いてから、もう挨拶したか。挨拶は1回でいい。 */
let greeted = false;

/** 日本時間の今日（YYYY-MM-DD）。 */
function jstDate(now = new Date()): string {
  return new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 9 * 3600000)
    .toISOString()
    .slice(0, 10);
}

/** 1言目を「はじめまして」にするか「久しぶり」にするか。ふだんは null。 */
function greetingNow(): "first" | "back" | null {
  let last: string | null;
  try {
    last = localStorage.getItem(MET);
    localStorage.setItem(MET, jstDate());
  } catch {
    // 読み書きできない端末では、いつもどおりのセリフから始める。
    // 出しすぎるより出さないほうが害が小さい
    return null;
  }
  if (!last) return "first";
  const gap = (Date.parse(`${jstDate()}T00:00:00Z`) - Date.parse(`${last}T00:00:00Z`)) / 86400000;
  return Number.isFinite(gap) && gap >= AGAIN ? "back" : null;
}

/**
 * 話しかける。
 * 吹き出しは自分で閉じるまで出したまま。読みかけで消えるのがいちばん困る。
 * セリフはシャッフルした順に1つずつ。一周するまで同じ話はしない。
 */
export function talkTo(v: Villager, lines: string[]) {
  if (!lines.length) return;
  unpair(v);
  v.mood = "wave";
  v.left = 1400;
  v.invite = false;
  if (!greeted) {
    greeted = true;
    const kind = greetingNow();
    if (kind) {
      // 1言目だけ差し替える。2言目からはいつもどおり
      v.says = greetOf(v.icon, kind);
      return;
    }
  }
  const idx = v.queue.filter((i) => i < lines.length);
  const pick = idx.length ? idx[v.qi % idx.length] : 0;
  v.qi = (v.qi + 1) % Math.max(1, idx.length);
  v.says = lines[pick];
}

/* ---- 向こうから口を開く --------------------------------------------------
   「参加してください」と呼びかけても、誰も押さない。
   **こちらから声をかけて、応じてもらう。** 応じたことが、あとから能動に見える
   （`docs/island-play.md` 3つの原理の3番）。

   ただし、押していないのに喋りだすのは、やりすぎると邪魔になる。
   かける条件は3つ全部そろったときだけ。
     - 島に降りてしばらく経っている（降りた直後に喋られると島を見る時間が無い）
     - 合図（!）を出している人が、すぐそばにいる
     - まだ誰とも話していない
   そして **1回だけ**。2回目からは、こちらから押してもらう。

   使うのは `IslandStage` 側。毎フレーム呼んでよい（ほとんどの回は null を返す）。

     const who = callOut(villagers, avatar.current, t - landedAt.current);
     if (who) openTalkRef.current?.(villagers.indexOf(who));

   声をかけた1言目は talkTo が greet に差し替えるので、
   **島のほうから「はじめまして」「久しぶり」と言ってくる**形になる。
   -------------------------------------------------------------------------- */

/** 島に降りてから、声をかけるまでの間（ミリ秒） */
const CALL_AFTER = 9000;
/** どれだけ近づいたら声をかけるか（ワールド単位） */
const CALL_NEAR = 96;
/** このページで、もう声をかけたか */
let called = false;

/**
 * すぐそばまで来た人に、向こうから声をかけたい住人。いなければ null。
 * 1度返したら、そのページではもう返さない。
 * @param {Villager[]} vs 住人
 * @param {{ x: number; y: number }} me あやとの居場所
 * @param {number} sinceMs 島に降りてからの経過ミリ秒
 */
export function callOut(vs: Villager[], me: { x: number; y: number }, sinceMs: number): Villager | null {
  if (called || greeted || sinceMs < CALL_AFTER) return null;
  for (const v of vs) {
    if (!v.invite || v.says || !v.icon) continue;
    if (Math.hypot(v.x - me.x, (v.y - me.y) * 1.3) > CALL_NEAR) continue;
    called = true;
    return v;
  }
  return null;
}

/** 吹き出しを閉じて、また歩きだしてもらう。 */
export function hush(v: Villager) {
  v.says = null;
  v.mood = "think";
  v.left = 400;
}

/**
 * 「話しかけて」の合図を出す人を入れ替える。
 * 全員がいつも合図していると島がうるさいので、数人ずつ順番に回す。
 * **まだ話していない人を先に回す。** 同じ人ばかり合図していると、
 * 島を一周しても聞ける話が増えない。
 * @param {Villager[]} vs 住人
 * @param {number} tick いま何回目の入れ替えか
 * @param {(v: Villager) => boolean} canTalk セリフを持っている人か
 * @param {number} at 一度に合図する人数
 */
export function rotateInvites(
  vs: Villager[],
  tick: number,
  canTalk: (v: Villager) => boolean,
  at = 3,
) {
  const able = vs.filter((v) => v.icon && canTalk(v));
  able.forEach((v) => {
    v.invite = false;
  });
  if (!able.length) return;
  const fresh = able.filter((v) => v.qi === 0);
  const pool = fresh.length >= at ? fresh : able;
  for (let k = 0; k < at; k++) {
    const v = pool[(tick * at + k) % pool.length];
    if (v && !v.says) v.invite = true;
  }
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
  if (v.mood === "chat") {
    // ゆっくり相づちを打つ。速さで「話している」と「悩んでいる」を分ける
    return { dy: -Math.abs(Math.sin(t * 0.0042 + v.phase)) * 1.6, rot: Math.sin(t * 0.0042 + v.phase) * 3 };
  }
  if (v.mood === "gaze") {
    // まったく動かない。動いていないことが「見ている」に見える
    return { dy: 0, rot: 0 };
  }
  return { dy: 0, rot: Math.sin(t * 0.0012 + v.phase) * 1.5 };
}
