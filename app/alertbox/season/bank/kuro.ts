/**
 * クロ（貯金箱の黒猫）の振付け。走る・すべって止まる・向きを変える・小芸・まばたき・
 * 呼吸・しっぽと耳の遅れ・バケツに飛び乗って喜ぶ・あふれた山で踊る・こうもりを追う・寝る。
 *
 * 数字は設計書 §2.5 / §3.1 から。ただし**小さく映る**（ウィジェットの幅の約3割、
 * クロは高さ 60〜70 CSS px）ので、上下の弾み・傾き・跳ねの高さは大きめに取ってある
 * （§2.5「小さく映るものは、動きの幅が大きいことが要る」）。
 *
 * 層（どれも足もとを原点にした 0×0 の箱。外から順に掛かる）:
 *
 *   pos  … 場面の上の位置（translate）。動き終わったら style に書き戻す
 *   hop  … 跳ねの上下・宙返り
 *   face … 向き（scaleX ±1）。中の動きは全部「右向き」で書けば、左向きでもそのまま合う
 *   tilt … 体ごとの傾き・つぶれ（足もとを支点に）
 *   bob  … 走りの上下
 *   └ 切り絵（`RigView.ts`。部品ごとに 動き / 揺れ の2枚）
 *
 * JS が起きるのは動きの切れ目だけ。動いているあいだは Web Animations に任せる。
 */
import type { RigHandle } from "../rig/RigView";
import { EASE, range, type Motion, type Rand } from "../rig/motion";
import type { Trick } from "./kuroBrain";

/** 場面の寸法（単位は場面の幅を 1000 としたもの） */
export type KuroGeo = {
  /** 1単位が何 px か */
  U: number;
  groundY: number;
  /** 地面の上で足が行ける範囲 */
  minX: number;
  maxX: number;
  /** バケツ。left/right は胴の外側、inY はバケツに立ったときの足の高さ */
  bucket: { left: number; right: number; cx: number; inY: number; topY: number };
  /** あふれた山に立ったときの足の高さ。山が無ければ null */
  pileY: number | null;
  /** クロの背丈（足から帽子の先まで） */
  kuroH: number;
};

/** 足もと（台紙の px）と背丈。部品の絵の外形から決める */
export type KuroFrame = { feetX: number; feetY: number; height: number; backFeetX: number };

type Where = "ground" | "bucket" | "pile";

const done = (a: Animation | null, ms: number, m: Motion) =>
  new Promise<void>((res) => {
    let fin = false;
    const end = () => {
      if (!fin) {
        fin = true;
        res();
      }
    };
    if (a) a.finished.then(end, end);
    // 消されたときも、遅れて終わらないときも、時計で抜ける
    m.after(ms + 120, end);
  });

const wait = (m: Motion, ms: number) => new Promise<void>((res) => m.after(ms, res));
const m0 = (m: Motion, ms: number, fn: () => void) => m.after(ms, fn);

const tr = (x: number, y: number) => `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;

export class Kuro {
  x: number;
  y: number;
  facing: 1 | -1 = 1;
  where: Where = "ground";
  private pos: HTMLDivElement;
  private hop: HTMLDivElement;
  private face: HTMLDivElement;
  private tilt: HTMLDivElement;
  private bob: HTMLDivElement;
  private cycle: Animation[] = [];
  private eyesBusy = false;
  private alive = true;

  constructor(
    private m: Motion,
    private rig: RigHandle,
    private host: HTMLDivElement,
    private g: KuroGeo,
    private f: KuroFrame,
    private r: Rand,
    /** 手前（バケツより前）に出すか。バケツに入るときは奥にする */
    private setFront: (front: boolean) => void,
    /** 足もとに土ぼこりを出す（場面の単位） */
    private puff: (x: number, y: number, dir: number, n: number) => void,
    /** のぞき込んだあとにくわえて出てくるお菓子（バケツの `items` の1つ） */
    candy?: { url: string; width: number; height: number } | null
  ) {
    this.x = g.minX + 40;
    this.y = g.groundY;
    const layer = () => {
      const d = document.createElement("div");
      d.style.position = "absolute";
      d.style.left = "0px";
      d.style.top = "0px";
      d.style.width = "0px";
      d.style.height = "0px";
      return d;
    };
    this.pos = layer();
    this.hop = layer();
    this.face = layer();
    this.tilt = layer();
    this.bob = layer();
    this.pos.style.willChange = "transform";
    this.pos.appendChild(this.hop);
    this.hop.appendChild(this.face);
    this.face.appendChild(this.tilt);
    this.tilt.appendChild(this.bob);
    const s = rig.scale;
    rig.root.style.left = `${-f.feetX * s}px`;
    rig.root.style.top = `${-f.feetY * s}px`;
    this.bob.appendChild(rig.root);
    host.appendChild(this.pos);
    this.commit();
    const mouth = rig.loop("mouth");
    if (candy && mouth) {
      // 口の前にくわえる。大きさは頭の 1/3 ほど（部品の絵の px で）
      const head = rig.part("head");
      const w = (head ? parseFloat(head.style.width) : 380) * 0.36;
      const h = (w * candy.height) / candy.width;
      const el = document.createElement("img");
      el.src = candy.url;
      el.alt = "";
      Object.assign(el.style, {
        position: "absolute",
        left: `${parseFloat(mouth.style.width) * 0.55 - w * 0.25}px`,
        top: `${parseFloat(mouth.style.height) * 0.6 - h / 2}px`,
        width: `${w}px`,
        height: `${h}px`,
        zIndex: "999",
        visibility: "hidden",
        transform: "rotate(-18deg)",
      } satisfies Partial<CSSStyleDeclaration>);
      mouth.appendChild(el);
      this.candyEl = el;
    }
  }

  private candyEl: HTMLImageElement | null = null;
  /** バケツ（山）に乗った・降りたときに呼ぶ（取っ手を揺らす） */
  onBucket: ((kind: "in" | "out") => void) | null = null;

  private px = (u: number) => u * this.g.U;
  /** クロの背丈（px） */
  private get H() {
    return this.px(this.g.kuroH);
  }

  private commit() {
    this.pos.style.transform = tr(this.px(this.x), this.px(this.y));
    this.face.style.transform = `scaleX(${this.facing})`;
  }

  dispose() {
    this.alive = false;
  }

  /** その場に置く（動かさずに） */
  place(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.commit();
  }

  // ------------------------------------------------------------------ ずっと続くもの

  /** 呼吸・しっぽ・帽子の先・まばたき。最初に1回だけ呼ぶ */
  startLoops() {
    const { m, rig } = this;
    // 呼吸。吸うほうを長く（設計書 §2.5）。小さいので 1.00↔1.045
    m.play(rig.loop("body"), [
      { transform: "scale(1, 1)", easing: "ease-in-out" },
      { transform: "scale(0.985, 1.045)", offset: 0.6, easing: "ease-in-out" },
      { transform: "scale(1, 1)" },
    ], { duration: 2400, iterations: Infinity });
    // しっぽは呼吸と周期をずらす。先の節はさらに遅れる（波が伝わる）
    m.play(rig.loop("tail_root"), [{ transform: "rotate(-9deg)" }, { transform: "rotate(9deg)" }], {
      duration: 1600, iterations: Infinity, direction: "alternate", easing: "ease-in-out",
    });
    m.play(rig.loop("tail_tip"), [{ transform: "rotate(-14deg)" }, { transform: "rotate(16deg)" }], {
      duration: 1600, iterations: Infinity, direction: "alternate", easing: "ease-in-out", delay: -1200,
    });
    m.play(rig.loop("hat_tip"), [{ transform: "rotate(-7deg)" }, { transform: "rotate(7deg)" }], {
      duration: 2400, iterations: Infinity, direction: "alternate", easing: "ease-in-out", delay: -600,
    });
    this.blinkLoop();
  }

  private blinkLoop() {
    const next = () => {
      if (!this.alive) return;
      this.m.after(range(this.r, 2000, 5000), () => {
        if (!this.eyesBusy && this.rig.swapped("eye") === "open") {
          const twice = this.r() < 0.25;
          this.rig.swap("eye", "closed");
          this.m.after(120, () => {
            if (this.eyesBusy) return;
            this.rig.swap("eye", "open");
            if (twice)
              this.m.after(130, () => {
                if (this.eyesBusy) return;
                this.rig.swap("eye", "closed");
                this.m.after(110, () => !this.eyesBusy && this.rig.swap("eye", "open"));
              });
          });
        }
        next();
      });
    };
    next();
  }

  /** 表情を決める（まばたきは止める）。null で元に戻す */
  private face_(eyes: string | null, mouth?: string) {
    if (eyes) {
      this.eyesBusy = true;
      this.rig.swap("eye", eyes);
    } else {
      this.eyesBusy = false;
      this.rig.swap("eye", "open");
    }
    this.rig.swap("mouth", mouth ?? "closed");
  }

  // ------------------------------------------------------------------ 走る

  private stopCycle() {
    this.cycle.forEach((a) => a.cancel());
    this.cycle = [];
  }

  /** 走りの足運び（止めるまで回る）。1歩 `step` ms */
  private runCycle(step: number) {
    const { m, rig } = this;
    const P = step * 2;
    const b = this.H * 0.11;
    const loop = (el: Element | null, frames: Keyframe[], delay = 0, dur = P) => {
      const a = m.play(el, frames, { duration: dur, iterations: Infinity, delay });
      if (a) this.cycle.push(a);
    };
    // 胴の上下（1歩ごとに跳ねる）。上りは速く抜け、下りは落ちる
    loop(this.bob, [
      { transform: "translateY(0px)", easing: EASE.up },
      { transform: `translateY(${-b}px)`, offset: 0.25, easing: EASE.down },
      { transform: "translateY(0px)", offset: 0.5, easing: EASE.up },
      { transform: `translateY(${-b}px)`, offset: 0.75, easing: EASE.down },
      { transform: "translateY(0px)" },
    ]);
    // 着地でつぶれて、上で伸びる。つぶれは素早く、伸びはゆっくり（体積は保つ）
    const sq = "scale(1.1, 0.9)";
    const st = "scale(0.94, 1.07)";
    loop(rig.part("body"), [
      { transform: sq, offset: 0 },
      { transform: "scale(1, 1)", offset: 0.08 },
      { transform: st, offset: 0.27 },
      { transform: "scale(1, 1)", offset: 0.42 },
      { transform: sq, offset: 0.5 },
      { transform: "scale(1, 1)", offset: 0.58 },
      { transform: st, offset: 0.77 },
      { transform: "scale(1, 1)", offset: 0.92 },
      { transform: sq, offset: 1 },
    ]);
    // 足は左右交互に ±30°（手前と奥、前と後ろで逆）
    const swing = (a: number) => [
      { transform: `rotate(${a}deg)`, easing: "ease-in-out" },
      { transform: `rotate(${-a}deg)`, offset: 0.5, easing: "ease-in-out" },
      { transform: `rotate(${a}deg)` },
    ];
    loop(rig.part("leg_f_near"), swing(-32));
    loop(rig.part("leg_b_far"), swing(-30));
    loop(rig.part("leg_f_far"), swing(32));
    loop(rig.part("leg_b_near"), swing(30));
    // 頭は胴と逆に小さく揺れる。耳・帽子・しっぽは 60〜120ms 遅れてついてくる
    loop(rig.part("head"), [
      { transform: "rotate(-4deg)", easing: "ease-in-out" },
      { transform: "rotate(3deg)", offset: 0.5, easing: "ease-in-out" },
      { transform: "rotate(-4deg)" },
    ], 30, step);
    const flap = (a: number) => [
      { transform: "rotate(0deg)", easing: EASE.out },
      { transform: `rotate(${a}deg)`, offset: 0.4, easing: "ease-in-out" },
      { transform: "rotate(0deg)" },
    ];
    loop(rig.part("ear_near"), flap(-22), 60, step);
    loop(rig.part("ear_far"), flap(-18), 75, step);
    loop(rig.part("hat"), flap(-7), 50, step);
    loop(rig.part("hat_tip"), flap(-20), 110, step);
    loop(rig.part("tail_root"), flap(16), 60, step);
    loop(rig.part("tail_tip"), flap(26), 120, step);
  }

  /** 向きを変える（ぴょんと跳ねて、裏返る）。0.09秒 + 着地 */
  async turn() {
    const { m } = this;
    const to = (this.facing * -1) as 1 | -1;
    m.play(this.face, [{ transform: `scaleX(${this.facing})` }, { transform: `scaleX(${to})` }], {
      duration: 90, easing: "ease-in-out", fill: "forwards",
    });
    const h = m.play(this.hop, [
      { transform: "translateY(0px)", easing: EASE.up },
      { transform: `translateY(${-this.H * 0.16}px)`, offset: 0.5, easing: EASE.down },
      { transform: "translateY(0px)" },
    ], { duration: 150 });
    await done(h, 150, m);
    this.facing = to;
    this.commit();
    this.face.getAnimations().forEach((a) => a.cancel());
    await this.land(0.7);
  }

  /** 着地のつぶれ（強さ 0..1） */
  private async land(k = 1) {
    const a = this.m.play(this.tilt, [
      { transform: `scale(${1 + 0.2 * k}, ${1 - 0.2 * k})`, easing: EASE.out },
      { transform: `scale(${1 - 0.05 * k}, ${1 + 0.06 * k})`, offset: 0.55, easing: "ease-in-out" },
      { transform: "scale(1, 1)" },
    ], { duration: 90 + 110 * k });
    await done(a, 90 + 110 * k, this.m);
  }

  /** 走って `to` まで行き、すべって止まる */
  async run(to: number, speed = 620) {
    const { m } = this;
    to = Math.max(this.g.minX, Math.min(this.g.maxX, to));
    const dir = to >= this.x ? 1 : -1;
    if (dir !== this.facing) await this.turn();
    const d = Math.abs(to - this.x);
    if (d < 4) return;
    // 止まり際に少し滑るぶん、手前で走りを止める
    const slide = Math.min(26, d * 0.15);
    const runTo = to - dir * slide;
    const ms = Math.max(260, (Math.abs(runTo - this.x) / speed) * 1000);
    const step = speed > 700 ? 150 : 175;
    this.runCycle(step);
    this.face_(null, this.r() < 0.35 ? "open" : "closed");
    const lean = m.play(this.tilt, [
      { transform: "rotate(0deg)", easing: EASE.out },
      { transform: "rotate(7deg)", offset: Math.min(0.5, 140 / ms) },
      { transform: "rotate(7deg)" },
    ], { duration: ms, fill: "forwards" });
    const move = m.play(this.pos, [
      { transform: tr(this.px(this.x), this.px(this.y)), easing: "cubic-bezier(0.45, 0, 1, 1)" },
      { transform: tr(this.px(this.x + dir * Math.min(60, d * 0.15)), this.px(this.y)), offset: Math.min(0.5, 160 / ms), easing: "linear" },
      { transform: tr(this.px(runTo), this.px(this.y)) },
    ], { duration: ms, fill: "forwards" });
    await done(move, ms, m);
    this.x = runTo;
    this.commit();
    move?.cancel();
    this.stopCycle();
    lean?.cancel();
    await this.skid(to);
  }

  /** すべって止まる。後ろへ 10° 傾いてつぶれ（0.12秒）→ 行き過ぎて戻る */
  private async skid(to: number) {
    const { m, rig } = this;
    const from = this.x;
    this.puff(this.x + this.facing * 20, this.y, -this.facing, 3);
    const slide = m.play(this.pos, [
      { transform: tr(this.px(from), this.px(this.y)), easing: EASE.out },
      { transform: tr(this.px(to), this.px(this.y)) },
    ], { duration: 160, fill: "forwards" });
    m.play(this.tilt, [
      { transform: "rotate(7deg) scale(1, 1)", easing: EASE.out },
      { transform: "rotate(-11deg) scale(1.12, 0.88)", offset: 0.35, easing: "ease-in-out" },
      { transform: "rotate(3deg) scale(0.97, 1.04)", offset: 0.7, easing: "ease-in-out" },
      { transform: "rotate(0deg) scale(1, 1)" },
    ], { duration: 330 });
    // 前足を突っぱって止まる
    const brace = (a: number) => [
      { transform: "rotate(0deg)", easing: EASE.out },
      { transform: `rotate(${a}deg)`, offset: 0.35 },
      { transform: "rotate(0deg)" },
    ];
    m.play(rig.part("leg_f_near"), brace(-38), { duration: 330 });
    m.play(rig.part("leg_f_far"), brace(-30), { duration: 330 });
    m.play(rig.part("leg_b_near"), brace(18), { duration: 330 });
    // 耳と帽子としっぽは、止まったあとも前へ流れて戻る
    const follow = (a: number, delay: number) => [
      { transform: "rotate(0deg)", easing: EASE.out },
      { transform: `rotate(${a}deg)`, offset: 0.4, easing: "ease-in-out" },
      { transform: `rotate(${-a * 0.35}deg)`, offset: 0.75, easing: "ease-in-out" },
      { transform: "rotate(0deg)" },
    ];
    m.play(rig.part("ear_near"), follow(16, 0), { duration: 420, delay: 40 });
    m.play(rig.part("hat"), follow(10, 0), { duration: 460, delay: 50 });
    m.play(rig.part("hat_tip"), follow(26, 0), { duration: 520, delay: 90 });
    m.play(rig.part("tail_root"), follow(-22, 0), { duration: 480, delay: 60 });
    await done(slide, 160, m);
    this.x = to;
    this.commit();
    slide?.cancel();
    await wait(m, 170);
  }

  /** その場に立ち止まる。見回すときは頭を左右へ */
  async pause(ms: number, look: boolean) {
    const { m, rig } = this;
    if (look) {
      m.play(rig.part("head"), [
        { transform: "rotate(0deg)", easing: EASE.back },
        { transform: "rotate(-12deg)", offset: 0.25 },
        { transform: "rotate(-12deg)", offset: 0.45, easing: EASE.back },
        { transform: "rotate(6deg)", offset: 0.65 },
        { transform: "rotate(6deg)", offset: 0.85, easing: "ease-in-out" },
        { transform: "rotate(0deg)" },
      ], { duration: ms });
      m.play(rig.part("ear_near"), [
        { transform: "rotate(0deg)" },
        { transform: "rotate(-14deg)", offset: 0.3 },
        { transform: "rotate(4deg)", offset: 0.38 },
        { transform: "rotate(0deg)", offset: 0.5 },
        { transform: "rotate(0deg)" },
      ], { duration: ms });
    }
    await wait(m, ms);
  }

  // ------------------------------------------------------------------ 跳ぶ・乗る

  /** (toX, toY) へ弧を描いて跳ぶ。頂点で `atApex` を呼ぶ（奥と手前の入れ替え） */
  private async leap(toX: number, toY: number, ms: number, peak: number, atApex?: () => void) {
    const { m, rig } = this;
    const dir = toX >= this.x ? 1 : -1;
    if (Math.abs(toX - this.x) > 8 && dir !== this.facing) await this.turn();
    // 溜め（0.15秒）
    await this.crouch(150);
    this.face_(null, "open");
    const move = m.play(this.pos, [
      { transform: tr(this.px(this.x), this.px(this.y)) },
      { transform: tr(this.px(toX), this.px(toY)) },
    ], { duration: ms, fill: "forwards", easing: "linear" });
    const top = -this.px(peak);
    m.play(this.hop, [
      { transform: "translateY(0px)", easing: EASE.up },
      { transform: `translateY(${top}px)`, offset: 0.5, easing: EASE.down },
      { transform: "translateY(0px)" },
    ], { duration: ms });
    // 宙では伸びて、足をたたむ
    m.play(this.tilt, [
      { transform: "rotate(-14deg) scale(0.88, 1.16)", easing: "ease-out" },
      { transform: "rotate(0deg) scale(1, 1)", offset: 0.5, easing: "ease-in" },
      { transform: "rotate(10deg) scale(0.92, 1.1)" },
    ], { duration: ms });
    const tuck = (a: number) => [
      { transform: `rotate(${a}deg)` },
      { transform: `rotate(${-a * 0.6}deg)`, offset: 0.6 },
      { transform: "rotate(0deg)" },
    ];
    m.play(rig.part("leg_f_near"), tuck(-40), { duration: ms });
    m.play(rig.part("leg_f_far"), tuck(-34), { duration: ms });
    m.play(rig.part("leg_b_near"), tuck(40), { duration: ms });
    m.play(rig.part("leg_b_far"), tuck(34), { duration: ms });
    m.play(rig.part("tail_root"), [{ transform: "rotate(-20deg)" }, { transform: "rotate(20deg)" }], { duration: ms });
    if (atApex) m.after(ms * 0.5, atApex);
    await done(move, ms, m);
    this.x = toX;
    this.y = toY;
    this.commit();
    move?.cancel();
    this.puff(this.x, this.y, 0, 2);
    await this.land(1);
  }

  /** 溜め（しゃがむ） */
  private async crouch(ms: number) {
    const a = this.m.play(this.tilt, [
      { transform: "scale(1, 1)", easing: EASE.out },
      { transform: "scale(1.16, 0.82)", offset: 0.6 },
      { transform: "scale(1.16, 0.82)" },
    ], { duration: ms });
    await done(a, ms, this.m);
  }

  /** バケツの中（入れ物の口）へ飛び乗る */
  async hopIn() {
    const { g } = this;
    if (this.where === "bucket") return;
    // バケツの近いほうの縁まで走ってから
    const side = this.x < g.bucket.cx ? -1 : 1;
    const edge = side < 0 ? g.bucket.left - 60 : g.bucket.right + 60;
    if (this.where === "ground" && Math.abs(this.x - edge) > 30) await this.run(edge);
    const tx = g.bucket.cx + side * (g.bucket.right - g.bucket.left) * 0.12;
    const peak = Math.max(40, this.y - g.bucket.topY + this.g.kuroH * 0.35) * 0.5 + 30;
    await this.leap(tx, g.bucket.inY, 430, peak, () => this.setFront(false));
    this.onBucket?.("in");
    this.where = "bucket";
  }

  /** あふれた山の上へ */
  async hopOnPile() {
    const { g } = this;
    if (g.pileY == null || this.where === "pile") return;
    const side = this.x < g.bucket.cx ? -1 : 1;
    const edge = side < 0 ? g.bucket.left - 50 : g.bucket.right + 50;
    if (this.where === "ground" && Math.abs(this.x - edge) > 30) await this.run(edge);
    await this.leap(g.bucket.cx + side * 10, g.pileY, 460, 70, () => this.setFront(false));
    this.onBucket?.("in");
    this.where = "pile";
  }

  /** 地面へ降りる（`side` の側へ） */
  async hopOut(side?: number) {
    const { g } = this;
    if (this.where === "ground") return;
    const s = side ?? (this.r() < 0.5 ? -1 : 1);
    const tx = s < 0 ? g.bucket.left - range(this.r, 70, 150) : g.bucket.right + range(this.r, 70, 150);
    m0(this.m, 150, () => this.onBucket?.("out"));
    await this.leap(
      Math.max(g.minX, Math.min(g.maxX, tx)),
      g.groundY,
      440,
      60,
      () => this.setFront(true)
    );
    this.where = "ground";
  }

  // ------------------------------------------------------------------ 小芸

  async trick(t: Trick) {
    // どれも 0.1〜0.2秒の「止め」から（設計書 §3.1）
    await wait(this.m, range(this.r, 100, 200));
    if (t === "spin") return this.spin();
    if (t === "peek") return this.peek();
    if (t === "wash") return this.wash();
    return this.headTilt();
  }

  /** ① 跳ねてくるっと1回転（溜め 0.15 → 跳び 0.35 → 着地のつぶれ 0.1 → 行き過ぎて戻る 0.15） */
  async spin() {
    const { m, rig } = this;
    await this.crouch(150);
    this.face_("smile", "omega");
    const c = this.H * 0.45;
    const up = this.H * 0.55;
    const ms = 420;
    const spinFrame = (y: number, a: number) =>
      `translateY(${y}px) translateY(${-c}px) rotate(${a}deg) translateY(${c}px)`;
    const a = m.play(this.hop, [
      { transform: spinFrame(0, 0), easing: EASE.up },
      { transform: spinFrame(-up, 200), offset: 0.5, easing: EASE.down },
      { transform: spinFrame(0, 360) },
    ], { duration: ms });
    m.play(this.tilt, [
      { transform: "scale(0.86, 1.18)" },
      { transform: "scale(1.05, 0.95)", offset: 0.5 },
      { transform: "scale(0.9, 1.12)" },
    ], { duration: ms });
    m.play(rig.part("tail_root"), [{ transform: "rotate(30deg)" }, { transform: "rotate(-30deg)" }], { duration: ms });
    m.play(rig.part("hat"), [
      { transform: "translateY(0px) rotate(0deg)" },
      { transform: `translateY(${-14}px) rotate(-14deg)`, offset: 0.55 },
      { transform: "translateY(0px) rotate(0deg)" },
    ], { duration: ms + 120 });
    await done(a, ms, m);
    this.puff(this.x, this.y, 0, 3);
    await this.land(1.1);
    await wait(m, 260);
    this.face_(null);
  }

  /** ② バケツをのぞき込む（頭が入って、しっぽだけ振る。3回に1回あめをくわえて出てくる） */
  async peek() {
    const { m, rig } = this;
    await this.hopIn();
    await wait(m, 160);
    this.face_("surprised");
    await wait(m, 220);
    // 前へ倒れて頭を突っ込む（足もとを支点に）
    const dive = m.play(this.tilt, [
      { transform: "translateY(0px) rotate(0deg)", easing: EASE.in },
      { transform: `translateY(${this.H * 0.12}px) rotate(68deg)` },
    ], { duration: 260, fill: "forwards" });
    await done(dive, 260, m);
    const wag = m.play(rig.part("tail_root"), [
      { transform: "rotate(-28deg)" },
      { transform: "rotate(30deg)" },
    ], { duration: 200, iterations: 8, direction: "alternate", easing: "ease-in-out" });
    m.play(rig.part("leg_b_near"), [{ transform: "rotate(0deg)" }, { transform: "rotate(14deg)" }], {
      duration: 400, iterations: 4, direction: "alternate", easing: "ease-in-out",
    });
    await done(wag, 1600, m);
    const candy = !!this.candyEl && this.r() < 0.34;
    if (candy) this.candyEl!.style.visibility = "visible";
    this.face_(candy ? "smile" : "open", candy ? "closed" : "omega");
    m.play(this.tilt, [
      { transform: `translateY(${this.H * 0.12}px) rotate(68deg)`, easing: EASE.back },
      { transform: "translateY(0px) rotate(-6deg)", offset: 0.7 },
      { transform: "translateY(0px) rotate(0deg)" },
    ], { duration: 360 });
    dive?.cancel();
    await wait(m, 360);
    await wait(m, candy ? 700 : 250);
    await this.hopOut();
    if (candy) m.after(1400, () => this.candyEl && (this.candyEl.style.visibility = "hidden"));
    this.face_(null);
  }

  /** ③ 座って顔を洗う（2.2秒） */
  async wash() {
    const { m, rig } = this;
    const bx = (this.f.backFeetX - this.f.feetX) * this.rig.scale;
    const sitT = (a: number, y: number) => `translateX(${bx}px) rotate(${a}deg) translateX(${-bx}px) translateY(${y}px)`;
    const ms = 2200;
    this.face_("closed", "closed");
    m.play(this.tilt, [
      { transform: sitT(0, 0), easing: EASE.out },
      { transform: sitT(-26, this.H * 0.06), offset: 0.1 },
      { transform: sitT(-26, this.H * 0.06), offset: 0.9, easing: EASE.inOut },
      { transform: sitT(0, 0) },
    ], { duration: ms });
    m.play(rig.part("leg_b_near"), [
      { transform: "rotate(0deg)" },
      { transform: "rotate(-62deg)", offset: 0.1 },
      { transform: "rotate(-62deg)", offset: 0.9 },
      { transform: "rotate(0deg)" },
    ], { duration: ms });
    m.play(rig.part("leg_b_far"), [
      { transform: "rotate(0deg)" },
      { transform: "rotate(-55deg)", offset: 0.1 },
      { transform: "rotate(-55deg)", offset: 0.9 },
      { transform: "rotate(0deg)" },
    ], { duration: ms });
    // 手前の前足で顔をこする（4往復）。頭もつられて傾く
    const rub: Keyframe[] = [{ transform: "rotate(0deg)", offset: 0 }, { transform: "rotate(-128deg)", offset: 0.14 }];
    const head: Keyframe[] = [{ transform: "rotate(0deg)", offset: 0 }, { transform: "rotate(-6deg)", offset: 0.14 }];
    for (let i = 0; i < 4; i++) {
      const o = 0.14 + i * 0.17;
      rub.push({ transform: "rotate(-104deg)", offset: o + 0.085 }, { transform: "rotate(-128deg)", offset: o + 0.17 });
      head.push({ transform: "rotate(8deg)", offset: o + 0.085 }, { transform: "rotate(-6deg)", offset: o + 0.17 });
    }
    rub.push({ transform: "rotate(0deg)", offset: 1 });
    head.push({ transform: "rotate(0deg)", offset: 1 });
    m.play(rig.part("leg_f_near"), rub, { duration: ms, easing: "ease-in-out" });
    m.play(rig.part("head"), head, { duration: ms, easing: "ease-in-out" });
    m.after(ms * 0.55, () => this.rig.swap("mouth", "omega"));
    await wait(m, ms);
    this.face_(null);
  }

  /** ④ こっちを見て首をかしげ、まばたき（1.2秒） */
  async headTilt() {
    const { m, rig } = this;
    this.face_("surprised", "closed");
    m.play(rig.part("head"), [
      { transform: "rotate(0deg)", easing: EASE.back },
      { transform: "rotate(-20deg)", offset: 0.22 },
      { transform: "rotate(-20deg)", offset: 0.78, easing: "ease-in-out" },
      { transform: "rotate(0deg)" },
    ], { duration: 1200 });
    m.play(rig.part("ear_near"), [
      { transform: "rotate(0deg)" },
      { transform: "rotate(-18deg)", offset: 0.18 },
      { transform: "rotate(6deg)", offset: 0.26 },
      { transform: "rotate(0deg)", offset: 0.34 },
      { transform: "rotate(0deg)" },
    ], { duration: 1200 });
    m.play(rig.part("ear_far"), [
      { transform: "rotate(0deg)" },
      { transform: "rotate(12deg)", offset: 0.2 },
      { transform: "rotate(0deg)", offset: 0.36 },
      { transform: "rotate(0deg)" },
    ], { duration: 1200 });
    m.play(rig.part("tail_root"), [{ transform: "rotate(0deg)" }, { transform: "rotate(-18deg)", offset: 0.5 }, { transform: "rotate(0deg)" }], {
      duration: 1200, easing: "ease-in-out",
    });
    await wait(m, 520);
    rig.swap("eye", "closed");
    await wait(m, 130);
    rig.swap("eye", "surprised");
    await wait(m, 550);
    this.face_(null);
  }

  // ------------------------------------------------------------------ 喜ぶ・踊る

  /** アラート明け。バケツ（あふれていれば山）に飛び乗って、両手を上げて喜ぶ（1.5秒） */
  async cheer(onLanded?: () => void) {
    const { m, rig } = this;
    if (this.g.pileY != null) await this.hopOnPile();
    else await this.hopIn();
    onLanded?.();
    this.face_("smile", "open");
    const bx = (this.f.backFeetX - this.f.feetX) * this.rig.scale;
    const upright = (a: number, y: number) => `translateX(${bx}px) rotate(${a}deg) translateX(${-bx}px) translateY(${y}px)`;
    const ms = 1500;
    m.play(this.tilt, [
      /* 口の中で胸を張る（後ろへ少し反る）。大きく立ち上がらせると、真横の絵では
         縁から後ろへ落ちていくように見えた（本物の絵で録って確かめた） */
      { transform: upright(0, 0), easing: EASE.back },
      { transform: upright(-16, -this.H * 0.06), offset: 0.14 },
      { transform: upright(-16, -this.H * 0.06), offset: 0.88, easing: EASE.inOut },
      { transform: upright(0, 0) },
    ], { duration: ms });
    // 3回弾む
    const hops: Keyframe[] = [{ transform: "translateY(0px)", offset: 0 }];
    for (let i = 0; i < 3; i++) {
      const o = 0.16 + i * 0.24;
      hops.push(
        { transform: "translateY(0px)", offset: o, easing: EASE.up },
        { transform: `translateY(${-this.H * 0.2}px)`, offset: o + 0.1, easing: EASE.down },
        { transform: "translateY(0px)", offset: o + 0.2 }
      );
    }
    hops.push({ transform: "translateY(0px)", offset: 1 });
    m.play(this.hop, hops, { duration: ms });
    // 両手を上げて振る
    const wave = (a: number, w: number) => [
      { transform: "rotate(0deg)", offset: 0 },
      { transform: `rotate(${a}deg)`, offset: 0.16 },
      { transform: `rotate(${a + w}deg)`, offset: 0.34 },
      { transform: `rotate(${a}deg)`, offset: 0.52 },
      { transform: `rotate(${a + w}deg)`, offset: 0.7 },
      { transform: `rotate(${a}deg)`, offset: 0.86 },
      { transform: "rotate(0deg)", offset: 1 },
    ];
    m.play(rig.part("leg_f_near"), wave(-128, 30), { duration: ms, easing: "ease-in-out" });
    m.play(rig.part("leg_f_far"), wave(-118, -26), { duration: ms, easing: "ease-in-out" });
    // 見上げて
    m.play(rig.part("head"), [
      { transform: "rotate(0deg)", easing: EASE.back },
      { transform: "rotate(-12deg)", offset: 0.16 },
      { transform: "rotate(-8deg)", offset: 0.5 },
      { transform: "rotate(-12deg)", offset: 0.84, easing: EASE.inOut },
      { transform: "rotate(0deg)" },
    ], { duration: ms });
    m.play(rig.part("tail_root"), [{ transform: "rotate(-24deg)" }, { transform: "rotate(24deg)" }], {
      duration: 180, iterations: 8, direction: "alternate", easing: "ease-in-out",
    });
    m.play(rig.part("hat"), [
      { transform: "rotate(0deg)" },
      { transform: "rotate(-12deg)", offset: 0.3 },
      { transform: "rotate(8deg)", offset: 0.55 },
      { transform: "rotate(-6deg)", offset: 0.8 },
      { transform: "rotate(0deg)" },
    ], { duration: ms });
    await wait(m, ms);
    this.face_(null);
  }

  /** あふれた山の上で踊る（左右に跳ねて、手を交互に上げる） */
  async dance(ms: number) {
    const { m, rig } = this;
    if (this.g.pileY == null) return;
    if (this.where !== "pile") await this.hopOnPile();
    this.face_("smile", "omega");
    const beat = 300;
    const beats = Math.max(4, Math.round(ms / beat));
    for (let i = 0; i < beats; i++) {
      if (!this.alive) return;
      const side = i % 2 === 0 ? 1 : -1;
      m.play(this.hop, [
        { transform: "translate(0px, 0px)", easing: EASE.up },
        { transform: `translate(${side * this.H * 0.12}px, ${-this.H * 0.16}px)`, offset: 0.45, easing: EASE.down },
        { transform: "translate(0px, 0px)" },
      ], { duration: beat });
      m.play(this.tilt, [
        { transform: `rotate(${-side * 10}deg) scale(1.08, 0.92)` },
        { transform: `rotate(${side * 8}deg) scale(0.96, 1.05)`, offset: 0.5 },
        { transform: "rotate(0deg) scale(1, 1)" },
      ], { duration: beat });
      m.play(rig.part(i % 2 === 0 ? "leg_f_near" : "leg_f_far"), [
        { transform: "rotate(0deg)" },
        { transform: "rotate(-140deg)", offset: 0.4 },
        { transform: "rotate(0deg)" },
      ], { duration: beat });
      if (i % 4 === 3) {
        rig.swap("mouth", i % 8 === 3 ? "open" : "omega");
        await this.turn();
      } else await wait(m, beat);
    }
    this.face_(null);
  }

  // ------------------------------------------------------------------ こうもりを追う・寝る

  /** こうもりが横切って、追いかけて1往復（約3秒）。`flyBy` はこうもりを飛ばす */
  async chase(flyBy: (fromLeft: boolean, ms: number) => void) {
    const { m, rig, g } = this;
    if (this.where !== "ground") await this.hopOut();
    const fromLeft = this.x > (g.minX + g.maxX) / 2;
    const flyMs = 2100;
    flyBy(fromLeft, flyMs);
    await wait(m, 380);
    // 気づく（見上げて、びっくり）
    this.face_("surprised", "open");
    m.play(rig.part("head"), [
      { transform: "rotate(0deg)", easing: EASE.back },
      { transform: "rotate(-24deg)", offset: 0.4 },
      { transform: "rotate(-24deg)" },
    ], { duration: 320, fill: "forwards" });
    m.play(rig.part("ear_near"), [{ transform: "rotate(-24deg)" }, { transform: "rotate(0deg)" }], { duration: 300, easing: EASE.back });
    await wait(m, 320);
    rig.part("head")?.getAnimations().forEach((a) => a.cancel());
    // 追いかける
    const end = fromLeft ? g.maxX - 30 : g.minX + 30;
    await this.run(end, 860);
    // 端で跳びつく（手を伸ばす）
    m.play(rig.part("leg_f_near"), [
      { transform: "rotate(0deg)" },
      { transform: "rotate(-130deg)", offset: 0.5 },
      { transform: "rotate(0deg)" },
    ], { duration: 440 });
    await this.leap(this.x, this.y, 440, this.g.kuroH * 0.55);
    this.face_("closed", "omega");
    await wait(m, 300);
    this.face_(null);
    await this.run((g.minX + g.maxX) / 2 + (fromLeft ? 80 : -80));
  }

  /** あくびして丸まり、少し寝る（耳だけぴくぴく）。約4.5秒 */
  async nap() {
    const { m, rig } = this;
    if (this.where !== "ground") await this.hopOut();
    // あくびと伸び
    this.face_("closed", "open");
    m.play(this.tilt, [
      { transform: "rotate(0deg) scale(1, 1)", easing: EASE.inOut },
      { transform: "rotate(10deg) scale(1.08, 0.94)", offset: 0.5 },
      { transform: "rotate(0deg) scale(1, 1)" },
    ], { duration: 900 });
    m.play(rig.part("head"), [{ transform: "rotate(0deg)" }, { transform: "rotate(-26deg)", offset: 0.5 }, { transform: "rotate(0deg)" }], {
      duration: 900, easing: EASE.inOut,
    });
    m.play(rig.part("leg_f_near"), [{ transform: "rotate(0deg)" }, { transform: "rotate(-50deg)", offset: 0.5 }, { transform: "rotate(0deg)" }], { duration: 900 });
    m.play(rig.part("leg_f_far"), [{ transform: "rotate(0deg)" }, { transform: "rotate(-44deg)", offset: 0.5 }, { transform: "rotate(0deg)" }], { duration: 900 });
    await wait(m, 900);
    // 丸まる
    this.face_("closed", "closed");
    const ms = 3000;
    const hold = (a: string, b: string): Keyframe[] => [
      { transform: a, easing: EASE.out },
      { transform: b, offset: 0.12 },
      { transform: b, offset: 0.9, easing: EASE.inOut },
      { transform: a },
    ];
    m.play(this.tilt, hold("translateY(0px) scale(1, 1)", `translateY(${this.H * 0.16}px) scale(1.1, 0.8)`), { duration: ms });
    m.play(rig.part("leg_f_near"), hold("rotate(0deg)", "rotate(-80deg)"), { duration: ms });
    m.play(rig.part("leg_f_far"), hold("rotate(0deg)", "rotate(-74deg)"), { duration: ms });
    m.play(rig.part("leg_b_near"), hold("rotate(0deg)", "rotate(76deg)"), { duration: ms });
    m.play(rig.part("leg_b_far"), hold("rotate(0deg)", "rotate(70deg)"), { duration: ms });
    m.play(rig.part("head"), hold("rotate(0deg)", "rotate(20deg)"), { duration: ms });
    m.play(rig.part("tail_root"), hold("rotate(0deg)", "rotate(-40deg)"), { duration: ms });
    // 耳だけぴくぴく（2回）
    for (const at of [900, 2000]) {
      m.after(at, () =>
        m.play(rig.part("ear_near"), [
          { transform: "rotate(0deg)" },
          { transform: "rotate(-24deg)", offset: 0.3 },
          { transform: "rotate(4deg)", offset: 0.6 },
          { transform: "rotate(0deg)" },
        ], { duration: 260 })
      );
    }
    await wait(m, ms);
    this.face_(null);
    await wait(m, 200);
  }
}
