/**
 * クロ（貯金箱の黒猫）が**次に何をするか**を決める。ここは決めるだけで、動かさない
 * （動かすのは `kuro.ts`）。純粋な関数なので、60秒ぶんを机の上で回して確かめられる。
 *
 * 決めごと（設計書 §3.1「案Aの待機の内訳」）:
 *
 * - 時間の半分強は**走る**。走ったら、ときどき**止まる**（止まりがあるから刻みが見える）
 * - **5〜9秒おき**に小芸を1つ（重み付きのくじ。**同じ芸を2回続けない**）
 * - **約45秒に1回**こうもりが横切って、追いかける
 * - **約90秒に1回**あくびして丸まって、少し寝る
 * - 100% を超えていたら、あふれた山に戻って**踊る**のを混ぜる
 *
 * 「次に何をするか分からない」が見続けさせる（設計書 §2.5）。走る先・止まる長さ・
 * 芸の順番を毎回くじで決める。
 */
import { range, weighted, type Rand } from "../rig/motion";

export type Trick = "spin" | "peek" | "wash" | "tilt";

export type KuroAction =
  | { kind: "run"; to: number }
  | { kind: "pause"; ms: number; look: boolean }
  | { kind: "trick"; trick: Trick }
  | { kind: "chase" }
  | { kind: "nap" }
  | { kind: "dance"; ms: number };

export type BrainState = {
  /** 動き出してからの時刻（ms） */
  t: number;
  /** 足の位置（場面の単位。幅 1000） */
  x: number;
  minX: number;
  maxX: number;
  /** ここでは止まらない（バケツの真後ろ。止まると隠れて見えない） */
  hide: [number, number] | null;
  /** 100% を超えているか（あふれた山があるか） */
  overflow: boolean;
  nextTrickAt: number;
  nextBatAt: number;
  nextNapAt: number;
  lastTrick: Trick | null;
  /** 直前が走りだったか（走りのあとは止まりやすい） */
  lastWasRun: boolean;
  /** 最後に踊ってからの時刻 */
  lastDanceAt: number;
};

/** 芸の重み。のぞき込み・跳ねは目立つので多め */
const TRICK_WEIGHTS: Record<Trick, number> = { spin: 3, peek: 3, wash: 2, tilt: 2 };

export const TRICK_GAP: [number, number] = [5000, 9000];
export const BAT_GAP: [number, number] = [38000, 52000];
export const NAP_GAP: [number, number] = [80000, 100000];

export function initialBrain(
  r: Rand,
  x: number,
  minX: number,
  maxX: number,
  overflow: boolean,
  hide: [number, number] | null = null
): BrainState {
  return {
    t: 0,
    x,
    minX,
    maxX,
    hide,
    overflow,
    nextTrickAt: range(r, 3500, 6000),
    nextBatAt: range(r, 20000, 32000),
    nextNapAt: range(r, 60000, 80000),
    lastTrick: null,
    lastWasRun: false,
    lastDanceAt: 0,
  };
}

/**
 * 次の動きを1つ決めて、状態を進める（`st` を書き換える）。
 * 動きの長さは決める側では分からないので、呼ぶ側が終わったあとに `st.t` を進める。
 */
export function nextAction(st: BrainState, r: Rand): KuroAction {
  if (st.t >= st.nextBatAt) {
    st.nextBatAt = st.t + range(r, BAT_GAP[0], BAT_GAP[1]);
    // 追いかけっこのすぐあとに芸を出さない（間を空ける）
    st.nextTrickAt = Math.max(st.nextTrickAt, st.t + 4000);
    st.lastWasRun = true;
    return { kind: "chase" };
  }
  if (st.t >= st.nextNapAt) {
    st.nextNapAt = st.t + range(r, NAP_GAP[0], NAP_GAP[1]);
    st.nextTrickAt = Math.max(st.nextTrickAt, st.t + 5000);
    st.lastWasRun = false;
    return { kind: "nap" };
  }
  if (st.t >= st.nextTrickAt) {
    const trick = weighted<Trick>(r, TRICK_WEIGHTS, st.lastTrick);
    st.lastTrick = trick;
    st.nextTrickAt = st.t + range(r, TRICK_GAP[0], TRICK_GAP[1]);
    st.lastWasRun = false;
    return { kind: "trick", trick };
  }
  if (st.overflow && st.lastWasRun && st.t - st.lastDanceAt > 9000 && r() < 0.45) {
    st.lastDanceAt = st.t;
    st.lastWasRun = false;
    return { kind: "dance", ms: range(r, 3200, 5200) };
  }
  if (st.lastWasRun && r() < 0.5) {
    st.lastWasRun = false;
    // 止まる。短い止まり（刻み）と、あたりを見回す長めの止まりを混ぜる
    const look = r() < 0.4;
    return { kind: "pause", ms: look ? range(r, 900, 1600) : range(r, 250, 700), look };
  }
  st.lastWasRun = true;
  return { kind: "run", to: pickRunTarget(st, r) };
}

/**
 * 走る先。**今いる所から 180 以上離れた所**。左右は半々で、端に近ければ反対へ
 * （端まで行くと必ず折り返すので、往復に見える）。
 */
export function pickRunTarget(st: BrainState, r: Rand): number {
  const span = st.maxX - st.minX;
  const minDist = Math.min(180, span * 0.3);
  const leftRoom = st.x - st.minX;
  const rightRoom = st.maxX - st.x;
  let goRight = r() < 0.5;
  if (leftRoom < minDist) goRight = true;
  else if (rightRoom < minDist) goRight = false;
  const room = goRight ? rightRoom : leftRoom;
  const d = Math.min(room, minDist + r() * Math.max(0, room - minDist));
  let to = goRight ? st.x + d : st.x - d;
  // バケツの真後ろで止まらない。通り抜けて向こう側で止まる
  if (st.hide && to > st.hide[0] && to < st.hide[1]) {
    to = goRight ? Math.min(st.maxX, st.hide[1] + 30) : Math.max(st.minX, st.hide[0] - 30);
  }
  return to;
}
