/**
 * 動きの時計。Web Animations を束ねて、まとめて止める・消す・「一瞬止める」をする。
 *
 * ## なぜ自前の時計を持つか
 *
 * - **待機中に rAF を回さない**（貯金箱は何時間も出ている）。動きは全部 Web Animations に
 *   渡し、JS が起きるのは「次の動きを決める」ときだけ（数百 ms〜数秒に1回）。
 *   合成のスレッドが transform と opacity を回すので、メインはほぼ寝ている
 * - **ヒットストップ**（重い一撃の瞬間に 50〜100ms 止める。設計書 §2.4）。動いている
 *   アニメを全部止め、まだ来ていない出来事の時刻も同じだけ後ろへずらす。そのために
 *   出来事は setTimeout を直に使わず、この時計の時刻（止めていたぶんを引いた時刻）で持つ
 */

/** 止めていた時間を引いた、この時計の時刻（ms） */
type Job = { at: number; fn: () => void; id: number };

export class Motion {
  private live = new Set<Animation>();
  private queue: Job[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private t0 = now();
  private paused = 0;
  private pausedSince: number | null = null;
  private seq = 0;
  private dead = false;

  /** この時計の時刻（ms）。止めていたあいだは進まない */
  time(): number {
    const t = now();
    const p = this.pausedSince != null ? t - this.pausedSince : 0;
    return t - this.t0 - this.paused - p;
  }

  /** 要素を動かす。動いているあいだは束に入り、止める・消すの対象になる */
  play(
    el: Element | null | undefined,
    frames: Keyframe[] | PropertyIndexedKeyframes,
    opts: KeyframeAnimationOptions
  ): Animation | null {
    if (!el || this.dead || typeof (el as HTMLElement).animate !== "function") return null;
    const a = (el as HTMLElement).animate(frames, opts);
    this.live.add(a);
    const drop = () => this.live.delete(a);
    a.addEventListener("finish", drop);
    a.addEventListener("cancel", drop);
    if (this.pausedSince != null) a.pause();
    return a;
  }

  /** `ms` 後（この時計で）に呼ぶ */
  after(ms: number, fn: () => void): number {
    return this.at(this.time() + Math.max(0, ms), fn);
  }

  /** この時計の時刻 `t`（ms）に呼ぶ */
  at(t: number, fn: () => void): number {
    if (this.dead) return 0;
    const id = ++this.seq;
    this.queue.push({ at: t, fn, id });
    this.queue.sort((a, b) => a.at - b.at || a.id - b.id);
    this.arm();
    return id;
  }

  /** 予約を取り消す */
  clear(id: number) {
    this.queue = this.queue.filter((j) => j.id !== id);
    this.arm();
  }

  /** 予約を全部取り消す（動いているアニメはそのまま） */
  clearAll() {
    this.queue = [];
    this.arm();
  }

  /** 一瞬止める（ヒットストップ）。動いているもの全部と、これからの出来事を `ms` だけ遅らせる */
  hitstop(ms: number) {
    if (this.dead || this.pausedSince != null) return;
    this.pausedSince = now();
    this.live.forEach((a) => a.pause());
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    setTimeout(() => {
      if (this.dead || this.pausedSince == null) return;
      this.paused += now() - this.pausedSince;
      this.pausedSince = null;
      this.live.forEach((a) => a.play());
      this.arm();
    }, ms);
  }

  /** 止めているか（ヒットストップの最中か） */
  get stopped() {
    return this.pausedSince != null;
  }

  /** 束にあるアニメを全部消す（元の形に戻る） */
  cancelAll() {
    this.live.forEach((a) => a.cancel());
    this.live.clear();
  }

  /** 片づけ。以後は何も動かさない */
  dispose() {
    this.dead = true;
    this.clearAll();
    this.cancelAll();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private arm() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.dead || this.pausedSince != null || !this.queue.length) return;
    const wait = Math.max(0, this.queue[0].at - this.time());
    this.timer = setTimeout(() => this.fire(), wait);
  }

  private fire() {
    this.timer = null;
    const t = this.time();
    // 時刻が来たものを順に。途中で予約が増えても拾えるように1つずつ取る
    while (this.queue.length && this.queue[0].at <= t + 1 && this.pausedSince == null && !this.dead) {
      const j = this.queue.shift()!;
      try {
        j.fn();
      } catch (e) {
        // 動きの1つがこけても、ほかの出来事は止めない（配信に映っているので）
        console.error(e);
      }
    }
    this.arm();
  }
}

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** よく使う緩急。名前で呼べるように */
export const EASE = {
  out: "cubic-bezier(0.22, 1, 0.36, 1)",
  in: "cubic-bezier(0.55, 0, 1, 0.45)",
  inOut: "cubic-bezier(0.65, 0, 0.35, 1)",
  /** 行き過ぎて戻る（止まり際にぽよん） */
  back: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  /** 跳ね上がり（上り） */
  up: "cubic-bezier(0.2, 0.7, 0.4, 1)",
  /** 落ちる（下り） */
  down: "cubic-bezier(0.6, 0, 0.8, 0.4)",
  linear: "linear",
} as const;

/** 0..1 の乱数を返す関数 */
export type Rand = () => number;

/** `[a, b)` の乱数 */
export const range = (r: Rand, a: number, b: number) => a + (b - a) * r();

/** 重み付きのくじ。`skip` に当たるものは引かない（全部当たるなら skip を無視） */
export function weighted<T extends string>(
  r: Rand,
  weights: Partial<Record<T, number>>,
  skip?: T | null
): T {
  let entries = (Object.entries(weights) as [T, number][]).filter(([, w]) => w > 0);
  const kept = entries.filter(([k]) => k !== skip);
  if (kept.length) entries = kept;
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [k, w] of entries) {
    x -= w;
    if (x < 0) return k;
  }
  return entries[entries.length - 1][0];
}
