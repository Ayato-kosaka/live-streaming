/**
 * 城の貯金箱のピポが**次に何をするか**を決める。ここは決めるだけで、動かさない（動かすのは `CastleBank.tsx`）。
 * 純粋な関数なので、90秒ぶんを机の上で回して確かめられる（`__tests__/castle.test.ts`）。
 *
 * 考え方はハロウィンのクロ（`kuroBrain.ts`。あやと「前回可愛かった」）と同じ:
 *
 * - 居場所は 左の隅・右の隅・門の前の3つ。歩いたら、ときどき**止まる**（止まりがあるから刻みが見える）
 * - **4〜7秒おき**に小芸を1つ（重み付きのくじ。**同じ芸を2回続けない**）: あくび・旗を振る・跳ねる・見回す
 * - **14〜20秒おき**に、門から城に入って**屋根ごしに顔を出す**（顔を出す所もくじ。続けて同じ所にしない）
 * - **20〜30秒おき**に、門の脇の**岩山へ跳び乗って**、座って見回してから跳び下りる
 * - **45〜60秒おき**に、隅で**丸くなって眠る**（最初は 22〜32秒後。90秒のうちに必ず1回入る）
 * - 100% を超えていたら、バンザイで跳ねるのを混ぜる
 * - 隅へ歩くときは、**前に居た隅の反対へ**行く（両隅を行き来する）
 *
 * 「次に何をするか分からない」が見続けさせる。歩く先・止まる長さ・芸の順番を毎回くじで決める。
 */
import { range, weighted, type Rand } from "../rig/motion";

export type Spot = "left" | "right" | "gate";
export type Trick = "yawn" | "flag" | "hop" | "look";

export type PipoAction =
  | { kind: "walk"; to: Spot }
  | { kind: "sit"; ms: number; look: boolean }
  | { kind: "trick"; trick: Trick }
  /** 門から入って、屋根ごしに顔を出し、また門から出てくる。`spot` は `castle.json` の `pipo.peeks` の番号 */
  | { kind: "peek"; spot: number }
  /** 門の脇の岩山へ跳び乗り、座って見回して、跳び下りる。`ledge` は `pipo.ledges` の番号 */
  | { kind: "climb"; ledge: number }
  /** 隅で丸くなって眠る。`ms` は眠っている長さ */
  | { kind: "nap"; ms: number }
  | { kind: "dance"; ms: number };

export type PipoBrain = {
  /** 動き出してからの時刻（ms） */
  t: number;
  at: Spot;
  /** 最後に居た隅（次に隅へ行くときは、この反対へ行く） */
  lastCorner: "left" | "right";
  /** 100% を超えているか */
  overflow: boolean;
  /** 顔を出す所・岩山の数 */
  peeks: number;
  ledges: number;
  nextTrickAt: number;
  nextPeekAt: number;
  nextClimbAt: number;
  nextNapAt: number;
  lastTrick: Trick | null;
  lastPeek: number;
  lastLedge: number;
  lastWasWalk: boolean;
  lastDanceAt: number;
};

const TRICK_WEIGHTS: Record<Trick, number> = { hop: 3, flag: 3, yawn: 2, look: 2 };

export const TRICK_GAP: [number, number] = [4000, 7000];
export const PEEK_GAP: [number, number] = [14000, 20000];
export const CLIMB_GAP: [number, number] = [20000, 30000];
export const NAP_GAP: [number, number] = [45000, 60000];

export function initialBrain(r: Rand, overflow: boolean, peeks: number, ledges: number, at?: Spot): PipoBrain {
  const start: Spot = at ?? (r() < 0.5 ? "left" : "right");
  return {
    t: 0,
    at: start,
    lastCorner: start === "right" ? "right" : "left",
    overflow,
    peeks: Math.max(1, peeks),
    ledges: Math.max(1, ledges),
    nextTrickAt: range(r, 2500, 4500),
    nextPeekAt: range(r, 7000, 11000),
    nextClimbAt: range(r, 14000, 20000),
    nextNapAt: range(r, 22000, 32000),
    lastTrick: null,
    lastPeek: -1,
    lastLedge: -1,
    lastWasWalk: false,
    lastDanceAt: -Infinity,
  };
}

const other = (c: "left" | "right"): "left" | "right" => (c === "left" ? "right" : "left");

/** 隅へ歩くときの行き先。隅に居るならもう片方の隅へ、門の前からは前に居た隅の反対へ */
function corner(st: PipoBrain): "left" | "right" {
  if (st.at === "left" || st.at === "right") return other(st.at);
  return other(st.lastCorner);
}

/** くじで1つ選ぶ。続けて同じものにしない */
function pick(r: Rand, n: number, last: number): number {
  let i = Math.floor(r() * n);
  if (n > 1 && i === last) i = (i + 1 + Math.floor(r() * (n - 1))) % n;
  return i;
}

/**
 * 次の動きを1つ決めて、状態を進める（`st` を書き換える）。
 * 動きの長さは決める側では分からないので、呼ぶ側が終わったあとに `st.t` を進める（`actionMs` は目安）。
 */
export function nextAction(st: PipoBrain, r: Rand): PipoAction {
  // 眠るのは隅で（門の前からは、まず隅へ歩く）
  if (st.t >= st.nextNapAt) {
    if (st.at === "gate") return walk(st, corner(st));
    st.nextNapAt = st.t + range(r, NAP_GAP[0], NAP_GAP[1]);
    st.nextTrickAt = Math.max(st.nextTrickAt, st.t + 3000);
    st.nextPeekAt = Math.max(st.nextPeekAt, st.t + 5000);
    st.nextClimbAt = Math.max(st.nextClimbAt, st.t + 8000);
    st.lastWasWalk = false;
    return { kind: "nap", ms: range(r, 4500, 6500) };
  }
  if (st.t >= st.nextPeekAt) {
    st.nextPeekAt = st.t + range(r, PEEK_GAP[0], PEEK_GAP[1]);
    st.nextTrickAt = Math.max(st.nextTrickAt, st.t + 2500);
    st.nextClimbAt = Math.max(st.nextClimbAt, st.t + 5000);
    const spot = pick(r, st.peeks, st.lastPeek);
    st.lastPeek = spot;
    st.lastWasWalk = false;
    st.at = "gate";
    return { kind: "peek", spot };
  }
  if (st.t >= st.nextClimbAt) {
    st.nextClimbAt = st.t + range(r, CLIMB_GAP[0], CLIMB_GAP[1]);
    st.nextTrickAt = Math.max(st.nextTrickAt, st.t + 2500);
    const ledge = pick(r, st.ledges, st.lastLedge);
    st.lastLedge = ledge;
    st.lastWasWalk = false;
    // 跳び下りる先は、前に居た隅の反対
    const to = corner(st);
    st.at = to;
    st.lastCorner = to;
    return { kind: "climb", ledge };
  }
  if (st.t >= st.nextTrickAt) {
    const trick = weighted<Trick>(r, TRICK_WEIGHTS, st.lastTrick);
    st.lastTrick = trick;
    st.nextTrickAt = st.t + range(r, TRICK_GAP[0], TRICK_GAP[1]);
    st.lastWasWalk = false;
    return { kind: "trick", trick };
  }
  if (st.overflow && st.lastWasWalk && st.t - st.lastDanceAt > 8000 && r() < 0.5) {
    st.lastDanceAt = st.t;
    st.lastWasWalk = false;
    return { kind: "dance", ms: range(r, 2400, 3600) };
  }
  if (st.lastWasWalk && r() < 0.6) {
    st.lastWasWalk = false;
    const look = r() < 0.4;
    return { kind: "sit", ms: look ? range(r, 1600, 2600) : range(r, 900, 1600), look };
  }
  // 隅に居れば、たいていもう片方の隅へ。ときどき門の前へ
  if (st.at !== "gate" && r() < 0.25) return walk(st, "gate");
  return walk(st, corner(st));
}

function walk(st: PipoBrain, to: Spot): PipoAction {
  st.lastWasWalk = true;
  st.at = to;
  if (to !== "gate") st.lastCorner = to;
  return { kind: "walk", to };
}

/**
 * 動きの長さの目安（ms）。机の上で回すとき（試験）に使う。`CastleBank` は実際に動き終わった時刻で進める。
 * 歩く速さは 1 秒に場面の幅の 1/3（隅から隅で約 2.4 秒）
 */
export function actionMs(a: PipoAction, from: Spot): number {
  switch (a.kind) {
    case "walk":
      return from === a.to ? 0 : from === "gate" || a.to === "gate" ? 1300 : 2400;
    case "sit":
      return a.ms;
    case "trick":
      return a.trick === "flag" ? 2400 : a.trick === "yawn" ? 1800 : a.trick === "hop" ? 1200 : 1800;
    case "peek":
      return (from === "gate" ? 0 : 1300) + 6200;
    case "climb":
      return 700 + 2600 + 700;
    case "nap":
      return 1400 + a.ms + 1400;
    case "dance":
      return a.ms;
  }
}
