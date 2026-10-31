/**
 * アラート1件ぶんの、季節の小物の段取り表。**ここは時刻と置き場所を決めるだけで、描かない。**
 *
 * 描くのは `SeasonEffects.tsx`。段取りを先に全部決めてしまうので、描くほうは
 * 「いつ・どこに・何を」を CSS の animation-delay に書くだけで済む。
 * JS の時計を回さないので、出ているあいだも React は描き直さない。
 *
 * 同じ通知（同じ id）からは、何度描いても同じ段取りが出る（撮って比べられるように）。
 */
import {
  tierFor,
  type FxDef,
  type FxMotion,
  type FxPlace,
  type FxSlot,
  type SeasonTheme,
} from "../themes";

export type FxSpawn = {
  key: string;
  file: string;
  place: FxPlace;
  motion: FxMotion;
  side: "l" | "r";
  /** 置き場所（画面に対する割合）。下端は中心の x、横は中心の y */
  x: number;
  y: number;
  /** 短辺に対する大きさ */
  size: number;
  /** 左右反転するか（画面の内側を向かせる） */
  flip: boolean;
  /** 出る時刻と、出ている長さ（秒） */
  delay: number;
  life: number;
};

export type BatSpawn = {
  key: string;
  /** 飛ぶ高さ（画面の高さに対する割合） */
  y: number;
  /** 上下のうねりの幅（短辺に対する割合）と周期（秒） */
  sway: number;
  swayS: number;
  size: number;
  delay: number;
  /** 横切るのにかかる秒数 */
  fly: number;
};

export type FxPlan = { items: FxSpawn[]; bats: BatSpawn[] };

/** 小物1つが出ている長さ（秒）。巣は角でゆっくり揺れるので長め */
const LIFE: Record<FxMotion, number> = {
  unfurl: 6.2,
  pop: 4.4,
  thud: 4.6,
  shamble: 5.2,
  float: 5.6,
  hop: 3.8,
};

/** 枠が1つ空いてから、次が出るまで（秒） */
const GAP_MIN = 0.7;
const GAP_MAX = 1.8;

/** 枠ごとの出だしをずらす間隔（秒）。「ポロポロ」出てくる */
const STAGGER = 0.45;

/** 締めの群れが横切りきるまで（秒）。アラートの終わりの、この手前から飛ばす */
const FINALE_LEAD = 3.6;

/** 下端の枠の、中心の x（画面の幅に対する割合）。外側から */
const BOTTOM_LANES = [0.09, 0.2, 0.3];

/** 文字列から決まる乱数（mulberry32）。同じ通知からは同じ並びが出る */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const placeOf = (f: FxDef) => f.place;

/**
 * 段取りを決める。
 *
 * @param durationSec アラートが出ている秒数（フェードアウトの手前まで）
 * @param yen        段を決める額（JPY）
 * @param available  読めた絵のファイル名。**読めなかった絵は段取りに入れない**
 */
export function planEffects(
  th: SeasonTheme,
  durationSec: number,
  yen: number,
  seed: string,
  available: ReadonlySet<string>
): FxPlan {
  const rnd = seededRandom(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length) % xs.length];
  const tier = tierFor(th, yen);

  const finaleStart = Math.max(0.5, durationSec - FINALE_LEAD);
  // 小物は群れが来るころに引っ込み終わる（群れが主役になるように）
  const itemsEnd = finaleStart + 0.4;

  const usable = th.fx.filter(
    (f) => tier.files.includes(f.file) && available.has(f.file)
  );

  const items: FxSpawn[] = [];
  const slots: FxSlot[] = th.slots.slice(0, tier.slots);

  /* 枠ごとの「次に出す時刻」。**いちばん早い枠から順に1つずつ出す**（時刻の順）。
     枠ごとに最後まで決めてから次の枠、にすると、あとの枠が先の枠の
     「これから」を知らずに選ぶので、下端にかぼちゃが3つ並ぶ、が実際に録画に出た */
  type Lane = { slot: FxSlot; si: number; pool: FxDef[]; t: number; last: FxDef | null; n: number; done: boolean };
  const lanes: Lane[] = slots
    .map((slot, si) => ({
      slot,
      si,
      pool: usable.filter((f) => placeOf(f) === slot.place),
      t: 0.3 + si * STAGGER + rnd() * 0.25,
      last: null,
      n: 0,
      done: false,
    }))
    .filter((l) => l.pool.length > 0);

  while (true) {
    const open = lanes.filter((l) => !l.done);
    if (open.length === 0) break;
    const ln = open.reduce((a, b) => (b.t < a.t ? b : a));
    const { slot, si, pool, t } = ln;

    /* その時刻に、同じ絵がいくつ出ているか。少ない絵を選ぶ。
       並びが同じなら、同じ枠で直前に出した絵は避ける */
    const live = (file: string) =>
      items.filter((o) => o.file === file && o.delay <= t && t < o.delay + o.life).length;
    const score = (c: FxDef) => live(c.file) * 2 + (pool.length > 1 && c === ln.last ? 1 : 0);
    const best = Math.min(...pool.map(score));
    const f: FxDef = pick(pool.filter((c) => score(c) === best));

    let life = LIFE[f.motion] * (0.9 + rnd() * 0.2);
    /* 最後の1つは、群れが来るまでに収まるよう短くして出す（7割まで）。
       入らないからと出さずにおくと、締めの前に何も無い数秒ができる */
    if (t + life > itemsEnd) {
      const fit = itemsEnd - t;
      if (fit < LIFE[f.motion] * 0.7) {
        ln.done = true;
        continue;
      }
      life = fit;
    }
    // 画面の内側を向かせる。角は左上の絵を右上で反転。正面の絵は反転しない
    const facing = f.facing ?? "front";
    const flip =
      slot.place === "corner"
        ? slot.side === "r"
        : facing === "front"
          ? false
          : slot.side === "l"
            ? facing === "left"
            : facing === "right";
    const lane = BOTTOM_LANES[Math.min(slot.lane ?? 0, BOTTOM_LANES.length - 1)];
    const jitter = (rnd() - 0.5) * 0.03;
    const x =
      slot.place === "bottom"
        ? slot.side === "l"
          ? lane + jitter
          : 1 - lane - jitter
        : slot.side === "l"
          ? 0
          : 1;
    const y = slot.place === "side" ? 0.36 + rnd() * 0.12 : slot.place === "corner" ? 0 : 1;
    items.push({
      key: `${si}-${ln.n}`,
      file: f.file,
      place: slot.place,
      motion: f.motion,
      side: slot.side,
      x,
      y,
      size: Math.min(0.2, f.size * (0.92 + rnd() * 0.12)),
      flip,
      delay: t,
      life,
    });
    ln.last = f;
    ln.n += 1;
    ln.t = t + life + GAP_MIN + rnd() * (GAP_MAX - GAP_MIN);
  }

  const bats: BatSpawn[] = [];
  const fin = th.finale;
  if (fin && available.has(fin.files[0])) {
    for (let w = 0; w < tier.waves; w++) {
      // 2波目は少し遅れて、別の高さを通る
      const base = finaleStart + w * 0.8;
      const band = tier.waves > 1 ? (w === 0 ? [0.08, 0.4] : [0.32, 0.66]) : [0.1, 0.6];
      for (let i = 0; i < tier.bats; i++) {
        bats.push({
          key: `${w}-${i}`,
          y: band[0] + rnd() * (band[1] - band[0]),
          sway: 0.02 + rnd() * 0.03,
          swayS: 0.5 + rnd() * 0.35,
          size: fin.size * (0.7 + rnd() * 0.5),
          delay: base + rnd() * Math.min(0.7, 0.12 * tier.bats),
          // 最後の1匹も、アラートが消え始める（durationSec）までに抜けきる
          fly: 1.6 + rnd() * 0.5,
        });
      }
    }
  }

  return { items, bats };
}
