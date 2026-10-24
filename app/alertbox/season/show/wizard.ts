/**
 * 段4（1,000〜1,999円）の振付け: 魔法使いのあやと（設計書 v3）。
 *
 * あやとは部品の切り絵ではなく、**ポーズ絵（1枚まるごと）を絵ごと動かす**（`poses.ts`）。
 * 飛ぶ（fly）・杖を振り上げる（cast）・待機（idle）の3枚を、顔の中心を合わせて差し替える。
 *
 *   金のきらめきが走る → 魔法陣が開く → ほうきで弧を描いて飛び込む（速さで傾き・止まり際に
 *   行き過ぎて戻る・星の尾）→ 杖を振り上げる（一瞬つぶして弾ける）→ 杖の先から光が飛んで
 *   札を書く → ドン → 右上の角へはけて小さくなり、待機の姿でふわふわ浮く。**魔法陣は残り**、
 *   その人のキャラ絵は**魔法陣から召喚**されて出る → 滞在中は定期的に杖を振って**星を振りかける**
 *   → 締めはキャラ絵が**魔法陣へ帰り**、あやとが真ん中へ戻って消える（`common.ts` の curtainCall）
 *
 * 魔法陣・あやとの着地の横の位置・字・キャラ絵は同じ中心（`centerOf`。オーナーのレビュー 2版目）。
 *
 * その人のキャラ絵が出たあとは、あやとも星もキャラ絵の顔の前を通らない（オーナーの決まり）:
 * 待機は札の上の余白（`headroom`）の中、粒の層はキャラ絵の後ろ、締めの弧は札より上だけを通る。
 *
 * 層（`layers.ts`）: 魔法陣は back、あやとは actor（札の上に着いたら外の箱を 4 へ）、
 * きらめき・星の尾・光の粒は front（キャラ絵が出たら後ろへ）か top。
 */
import { EASE, range, type Motion } from "../rig/motion";
import type { TimedCue } from "./script";
import { pathFrames, sparkle } from "./fx";
import { bandBottomOf, div, plateBoxOf, type ShowLayers } from "./layers";
import type { LoadedPoses } from "./poses";
import { heroFaceMark } from "./poseActor";
import { centerOf, curtainCall, every, stayAura } from "./common";

export type WizardAssets = { poses: LoadedPoses };

/** 登場のあいだの大きさ（飛ぶ姿の高さが面の 4 割） */
const BIG_H = 0.4;
/**
 * 待つときの大きさ（面の幅に対する、ほうきとクロまで入れた幅）。面の上の右の角に浮く。
 * 上の帯（`headroom` 0.2）に浮く高さまで収まる
 */
const STAY_W = 0.3;
/** 魔法陣の直径（面の幅に対する割合）。中心はキャラ絵の真ん中 */
const RING_D = 0.88;
/** 杖の星の中心（絵の px。左右反転する前） */
const WAND: Record<string, [number, number]> = { fly: [1000, 315], cast: [1015, 75], idle: [360, 657] };
/** ほうきの穂の真ん中（星の尾を出す所。絵の px） */
const BRISTLE: Record<string, [number, number]> = { fly: [160, 735], cast: [160, 778], idle: [964, 744] };
const GOLD = "255,226,120";
const VIOLET = "214,170,255";

export function runWizard(
  m: Motion,
  L: ShowLayers,
  a: WizardAssets,
  cues: TimedCue[],
  W: number,
  H: number
): () => void {
  const X = (f: number) => f * W;
  const Y = (f: number) => f * H;
  const plateBox = () => plateBoxOf(L, W, H);
  const P = a.poses.poses;
  const fly = P.get("fly")!;
  // 顔の幅がそろえてあるので、どのポーズも同じ倍率
  const s0 = Y(BIG_H) / fly.size[1];

  // ---------------------------------------------------------------- あやと（3枚を重ねて、見せる1枚を切り替える）
  /** 位置（顔の中心）・傾き・大きさ */
  const aPos = div(L.actor, { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px", willChange: "transform", opacity: "0" });
  /** 待機の浮き・手を振る揺れ */
  const aBob = div(aPos, { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px" });
  /** つぶし・伸ばし（切り替えの弾み・速さ） */
  const aSquash = div(aBob, { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px" });
  const imgs = new Map<string, HTMLElement[]>();
  /** 右向きにそろえたときの、顔の中心から見た点（倍率 1 の舞台 px） */
  const rel = (name: string, pt: [number, number]): [number, number] => {
    const p = P.get(name)!;
    const flip = p.facing === "left";
    const x = flip ? p.size[0] - pt[0] : pt[0];
    const fx = flip ? p.size[0] - p.faceCenter[0] : p.faceCenter[0];
    return [(x - fx) * s0, (pt[1] - p.faceCenter[1]) * s0];
  };
  for (const [name, p] of P) {
    const im = document.createElement("img");
    im.src = p.img.url;
    im.alt = "";
    im.draggable = false;
    const flip = p.facing === "left";
    const fx = flip ? p.size[0] - p.faceCenter[0] : p.faceCenter[0];
    Object.assign(im.style, {
      position: "absolute",
      left: `${-fx * s0}px`,
      top: `${-p.faceCenter[1] * s0}px`,
      width: `${p.size[0] * s0}px`,
      height: `${p.size[1] * s0}px`,
      transform: flip ? "scaleX(-1)" : "",
      visibility: name === "fly" ? "visible" : "hidden",
      userSelect: "none",
      pointerEvents: "none",
    } satisfies Partial<CSSStyleDeclaration>);
    aSquash.appendChild(im);
    imgs.set(name, [im, heroFaceMark(aSquash, p, s0, fx, p.faceCenter[1], flip, name === "fly")]);
  }
  let pose = "fly";
  const show = (name: string) => {
    if (!imgs.has(name)) return;
    imgs.forEach((els, k) => els.forEach((el) => (el.style.visibility = k === name ? "visible" : "hidden")));
    pose = name;
  };
  let now = { x: -X(0.5), y: Y(1.1), k: 1, r: 0 };
  const T = (x: number, y: number, k: number, r = 0) =>
    `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${r.toFixed(1)}deg) scale(${k.toFixed(4)})`;
  aPos.style.transform = T(now.x, now.y, now.k);
  /** 画面の上での、いまのポーズの点（杖の星・ほうきの穂） */
  const at = (pt: Record<string, [number, number]>, p = now) => {
    const [dx, dy] = rel(pose, pt[pose] ?? pt.fly);
    const c = Math.cos((p.r * Math.PI) / 180);
    const s = Math.sin((p.r * Math.PI) / 180);
    return { x: p.x + (dx * c - dy * s) * p.k, y: p.y + (dx * s + dy * c) * p.k };
  };
  /** ポーズを切り替える。一瞬つぶして、いちばんつぶれたところで差し替え、弾けて戻る。きらめきで継ぎ目を隠す */
  const popTo = (name: string, ms = 360) => {
    m.play(aSquash, [
      { transform: "scale(1, 1)", easing: EASE.in },
      { transform: "scale(0.9, 0.9)", offset: 0.3, easing: EASE.out },
      { transform: "scale(1.08, 1.08)", offset: 0.65, easing: EASE.inOut },
      { transform: "scale(1, 1)" },
    ], { duration: ms });
    m.after(ms * 0.3, () => {
      show(name);
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2;
        const rr = X(0.12) * now.k;
        sparkle(m, L.top, now.x + Math.cos(ang) * rr, now.y + Math.sin(ang) * rr * 0.8, X(0.09) * Math.max(0.5, now.k), i * 25, i % 2 ? VIOLET : GOLD);
      }
    });
  };

  /** 曲線（2次）に沿った点。`u` は 0..1 */
  const quad = (p0: number[], c: number[], p1: number[], u: number): [number, number] => [
    (1 - u) * (1 - u) * p0[0] + 2 * (1 - u) * u * c[0] + u * u * p1[0],
    (1 - u) * (1 - u) * p0[1] + 2 * (1 - u) * u * c[1] + u * u * p1[1],
  ];
  /**
   * 弧を描いて飛ぶ。速さに合わせて傾け（`pathFrames` の tilt）、止まり際は行き過ぎて戻る。
   * 星の尾を、ほうきの穂から少しずつ出す（`trail` の層へ）
   */
  const flyArc = (
    to: { x: number; y: number; k: number },
    ctrl: [number, number],
    ms: number,
    opts: { overshoot?: number; ease?: (t: number) => number; trail?: HTMLElement; fill?: FillMode } = {}
  ) => {
    const N = 22;
    const ease = opts.ease ?? ((t: number) => 1 - Math.pow(1 - t, 2.2));
    const from = { ...now };
    const pts: [number, number][] = [];
    const ks: number[] = [];
    for (let i = 0; i <= N; i++) {
      const u = ease(i / N);
      pts.push(quad([from.x, from.y], ctrl, [to.x, to.y], u));
      ks.push(from.k + (to.k - from.k) * u);
    }
    const ov = opts.overshoot ?? 0;
    if (ov) {
      // 進んできた向きへ少し行き過ぎて、戻る
      const [ax, ay] = pts[N - 1];
      const dx = to.x - ax;
      const dy = to.y - ay;
      const d = Math.hypot(dx, dy) || 1;
      pts.push([to.x + (dx / d) * ov, to.y + (dy / d) * ov]);
      ks.push(to.k);
      pts.push([to.x, to.y]);
      ks.push(to.k);
    }
    const frames = pathFrames(pts, { tilt: 18 });
    // 大きさ（倍率）を差し込む
    frames.forEach((f, i) => (f.transform = `${f.transform} scale(${ks[i].toFixed(4)})`));
    const offsets = ov ? [...Array.from({ length: N + 1 }, (_, i) => (i / N) * 0.86), 0.93, 1] : undefined;
    if (offsets) frames.forEach((f, i) => (f.offset = offsets[i]));
    const anim = m.play(aPos, frames, { duration: ms, fill: opts.fill ?? "forwards", easing: "linear" });
    // 速いあいだは進む向きに伸ばし、止まり際につぶれて戻る
    m.play(aSquash, [
      { transform: "scale(1, 1)" },
      { transform: "scale(1.05, 0.95)", offset: 0.3 },
      { transform: "scale(1.02, 0.98)", offset: 0.75 },
      { transform: "scale(0.95, 1.05)", offset: 0.9, easing: EASE.out },
      { transform: "scale(1, 1)" },
    ], { duration: ms });
    if (opts.trail) {
      const tr = opts.trail;
      const n = Math.round(ms / 70);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const u = ease(Math.min(1, t / 0.86));
        const [x, y] = quad([from.x, from.y], ctrl, [to.x, to.y], u);
        const k = from.k + (to.k - from.k) * u;
        const b = at(BRISTLE, { x, y, k, r: 0 });
        m.after(t * ms, () => sparkle(m, tr, b.x + (Math.random() - 0.5) * X(0.04) * k, b.y + (Math.random() - 0.5) * X(0.04) * k, X(0.07) * Math.max(0.5, k), 0, i % 3 ? GOLD : VIOLET));
      }
    }
    now = { x: to.x, y: to.y, k: to.k, r: 0 };
    return anim;
  };

  /**
   * 飛び込んで止まる所（顔の中心）。**字のブロック（キャラ絵の上下中央）より上**に、杖を振り上げた
   * 姿まで体ごと収まる高さ。体ごと収まらなければ、少なくとも顔の枠が字の上の端より上
   * （オーナーの決まり: 主役の顔は字で隠さない。前は顔が面の真ん中にいて、書いた額が顔に乗った）。
   * 杖の先の光が下の字の場所へ飛んで書く
   */
  const hoverSpot = () => {
    const pb = plateBox();
    const ps = ["fly", "cast"].map((n) => P.get(n) ?? fly);
    const below = Math.max(...ps.map((p) => (p.content[3] - p.faceCenter[1]) * s0));
    const above = Math.max(...ps.map((p) => (p.faceCenter[1] - p.content[1]) * s0));
    const faceBelow = Math.max(...ps.map((p) => (p.face[3] - p.faceCenter[1]) * s0));
    const whole = pb.t - X(0.02) - below;
    const faceOnly = pb.t - X(0.03) - faceBelow;
    const top = Y(0.012) + above;
    // 横はキャラ絵・字・魔法陣と同じ中心
    return { x: centerOf(L, W, H).x, y: Math.min(faceOnly, Math.max(top, whole)) };
  };

  // ---------------------------------------------------------------- 魔法陣（back。キャラ絵の真ん中。滞在中も残る）
  const ring = div(L.back, {
    position: "absolute",
    left: `${X(0.5 - RING_D / 2)}px`,
    top: `${Y(0.6) - X(RING_D / 2)}px`,
    width: `${X(RING_D)}px`,
    height: `${X(RING_D)}px`,
    opacity: "0",
  });
  ring.innerHTML = magicCircleSvg();
  const ringSpin = ring.firstElementChild as SVGElement | null;
  // 回すのは合成のスレッドで（滞在中ずっと回るので、描き直させない）
  if (ringSpin) ringSpin.style.willChange = "transform";
  const placeRing = () => {
    const c = centerOf(L, W, H);
    ring.style.left = `${c.x - X(RING_D / 2)}px`;
    ring.style.top = `${c.y - X(RING_D / 2)}px`;
    return c;
  };
  /** 魔法陣の上に重ねる光（明るくするのは opacity で。filter は毎回描き直しになる） */
  const ringGlow = div(ring, {
    position: "absolute",
    inset: "0px",
    borderRadius: "50%",
    background: `radial-gradient(circle, rgba(255,246,210,0.7) 0%, rgba(${GOLD},0.45) 35%, rgba(${VIOLET},0.25) 62%, rgba(${VIOLET},0) 72%)`,
    opacity: "0",
  });
  /** 魔法陣がふっと明るくなる（召喚・星が届いたとき） */
  const ringFlare = (k = 1.06, ms = 520) => {
    m.play(ring, [{ transform: "scale(1)" }, { transform: `scale(${k})`, offset: 0.35 }, { transform: "scale(1)" }], { duration: ms, easing: "ease-out" });
    m.play(ringGlow, [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], { duration: ms, easing: "ease-out" });
  };
  let aura: ReturnType<typeof stayAura> | null = null;
  let stopStay: (() => void) | null = null;

  // ---------------------------------------------------------------- 札を光で書く
  const plateEl = () => L.root.querySelector<HTMLElement>('[data-plate="box"]');
  const clip = (open: number) => `inset(-40% ${(100 - open * 106).toFixed(2)}% -40% ${(-open * 6).toFixed(2)}%)`;

  let stayTimer = 0;
  const on: Partial<Record<TimedCue["do"], (c: TimedCue) => void>> = {
    // 前兆: 金の光の帯が斜めに走り、きらめきが散る
    glimmer: (c) => {
      const ms = (c.dur ?? 0.5) * 1000;
      const band = div(L.front, {
        position: "absolute",
        left: `${-X(0.35)}px`,
        top: `${-Y(0.2)}px`,
        width: `${X(0.32)}px`,
        height: `${Y(1.4)}px`,
        background: "linear-gradient(90deg, rgba(255,226,120,0) 0%, rgba(255,236,160,0.75) 50%, rgba(255,226,120,0) 100%)",
        transform: "rotate(22deg)",
        opacity: "0",
      });
      const ba = m.play(band, [
        { transform: "translateX(0px) rotate(22deg)", opacity: 0 },
        { opacity: 1, offset: 0.25 },
        { opacity: 1, offset: 0.7 },
        { transform: `translateX(${X(1.5)}px) rotate(22deg)`, opacity: 0 },
      ], { duration: ms, easing: "ease-in-out" });
      const rm = () => band.remove();
      if (ba) ba.finished.then(rm, rm);
      else rm();
      for (let i = 0; i < 9; i++) {
        const t = i / 9;
        sparkle(m, L.front, X(0.05 + t * 0.9), Y(0.15 + t * 0.6) + (Math.random() - 0.5) * Y(0.1), X(0.08), t * ms, GOLD);
      }
    },

    // 魔法陣が開いて、ゆっくり回り出す
    circle: (c) => {
      const ms = (c.dur ?? 0.5) * 1000;
      placeRing();
      m.play(ring, [
        { opacity: 0, transform: "scale(0.2)" },
        { opacity: 1, transform: "scale(1.06)", offset: 0.7, easing: EASE.inOut },
        { opacity: 1, transform: "scale(1)" },
      ], { duration: ms, fill: "forwards", easing: EASE.out });
      if (ringSpin) m.play(ringSpin, [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], { duration: 14000, iterations: Infinity });
    },

    // 左下の外から、弧を描いて魔法陣の上へ。星の尾を引く
    flyIn: (c) => {
      const ms = (c.dur ?? 1.5) * 1000;
      show("fly");
      now = { x: -X(0.45), y: Y(0.95), k: 0.85, r: 0 };
      aPos.style.opacity = "1";
      aPos.style.transform = T(now.x, now.y, now.k);
      const h = hoverSpot();
      flyArc({ x: h.x, y: h.y, k: 1 }, [X(0.05), Math.min(Y(0.28), h.y - Y(0.1))], ms, { overshoot: X(0.05), trail: L.front });
    },

    // 杖を振り上げる
    cast: () => popTo("cast"),

    // 杖の先から光が飛んで、札を左から書いていく。書く端に光の筋
    write: (c) => {
      const ms = (c.dur ?? 0.9) * 1000;
      const el = plateEl();
      if (!el) return;
      const pb = plateBox();
      const wa = m.play(el, [{ clipPath: clip(0) }, { clipPath: clip(1) }], { duration: ms, fill: "forwards", easing: "cubic-bezier(0.35, 0.1, 0.3, 1)" });
      /* 書き終えたら切り口を外す。左右 6% しか開けていないので、このあとの「ドン」（額が 1.3 倍に
         弾む）で額の左右が欠けた（段5の担当の知らせ） */
      m.after(ms + 40, () => {
        el.style.clipPath = "none";
        wa?.cancel();
      });
      const tip = at(WAND);
      // 杖の先が光る
      const glow = div(L.top, {
        position: "absolute",
        left: `${tip.x - X(0.09)}px`,
        top: `${tip.y - X(0.09)}px`,
        width: `${X(0.18)}px`,
        height: `${X(0.18)}px`,
        borderRadius: "50%",
        background: `radial-gradient(circle, rgba(${GOLD},0.95) 0%, rgba(${GOLD},0.35) 40%, rgba(${GOLD},0) 70%)`,
        opacity: "0",
      });
      const ga = m.play(glow, [
        { opacity: 0, transform: "scale(0.5)" },
        { opacity: 1, transform: "scale(1.1)", offset: 0.2 },
        { opacity: 0.8, transform: "scale(0.9)", offset: 0.6 },
        { opacity: 0, transform: "scale(1.3)" },
      ], { duration: ms + 300 });
      const rmg = () => glow.remove();
      if (ga) ga.finished.then(rmg, rmg);
      else rmg();
      // 光の粒: 杖の先から、札の書く端へ（端が通る時刻に着く）
      const n = 14;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const tx = pb.l + (pb.r - pb.l) * t;
        const ty = pb.t + (pb.b - pb.t) * (0.3 + 0.4 * Math.random());
        const mote = div(L.top, {
          position: "absolute",
          left: `${-X(0.02)}px`,
          top: `${-X(0.02)}px`,
          width: `${X(0.04)}px`,
          height: `${X(0.04)}px`,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(255,255,240,1) 0%, rgba(${i % 3 ? GOLD : VIOLET},0.8) 45%, rgba(${GOLD},0) 72%)`,
          opacity: "0",
        });
        const flyMs = 260;
        const ma = m.play(mote, [
          { transform: `translate(${tip.x}px, ${tip.y}px) scale(0.6)`, opacity: 1 },
          { transform: `translate(${(tip.x + tx) / 2}px, ${Math.min(tip.y, ty) - X(0.06)}px) scale(1)`, opacity: 1, offset: 0.5 },
          { transform: `translate(${tx}px, ${ty}px) scale(0.4)`, opacity: 0 },
        ], { duration: flyMs, delay: Math.max(0, t * ms - flyMs * 0.8), easing: "ease-in", fill: "backwards" });
        const rm = () => mote.remove();
        if (ma) ma.finished.then(rm, rm);
        else rm();
      }
      // 書く端の光の筋
      const bar = div(L.top, {
        position: "absolute",
        left: `${pb.l - X(0.01)}px`,
        top: `${pb.t - X(0.02)}px`,
        width: `${X(0.02)}px`,
        height: `${pb.b - pb.t + X(0.04)}px`,
        borderRadius: `${X(0.01)}px`,
        background: `linear-gradient(180deg, rgba(${GOLD},0) 0%, rgba(255,250,220,1) 50%, rgba(${GOLD},0) 100%)`,
        boxShadow: `0 0 ${X(0.03)}px rgba(${GOLD},0.9)`,
        opacity: "0",
      });
      const bb = m.play(bar, [
        { transform: "translateX(0px)", opacity: 1 },
        { transform: `translateX(${pb.r - pb.l}px)`, opacity: 1, offset: 0.92 },
        { transform: `translateX(${pb.r - pb.l}px)`, opacity: 0 },
      ], { duration: ms, easing: "cubic-bezier(0.35, 0.1, 0.3, 1)" });
      const rmb = () => bar.remove();
      if (bb) bb.finished.then(rmb, rmb);
      else rmb();
    },

    // 額が止まって「ドン」（札の弾みは NamePlate）。札のまわりに金のきらめき
    don: () => {
      const pb = plateBox();
      for (let i = 0; i < 6; i++) {
        const left = i % 2 === 0;
        sparkle(m, L.top, left ? pb.l : pb.r, pb.t + (pb.b - pb.t) * Math.random() * 0.7, X(0.1), i * 60, GOLD);
      }
    },

    /* 右上の角へはけて小さくなる。魔法陣は残る（キャラ絵はここから召喚される）。着いたら待機の姿に
       切り替え、札より手前へ。キャラ絵が出るのはこの途中（あやとは着くまでキャラ絵の後ろ） */
    retreat: (c) => {
      const ms = (c.dur ?? 0.8) * 1000;
      const to = staySpot();
      flyArc(to, [now.x + X(0.15), Math.min(now.y, to.y) - Y(0.08)], ms, { overshoot: X(0.02) });
      m.after(ms, () => {
        L.actorBox.style.zIndex = "4";
        popTo("idle", 320);
      });
    },

    /* その人の絵が魔法陣から召喚される: 魔法陣が明るくなり、光の柱が立ち、キャラ絵が真ん中から
       ふくらむ（index.tsx）。粒の層はキャラ絵の後ろへ。段の光をキャラ絵の後ろに残す */
    reveal: () => {
      L.frontBox.style.zIndex = "0";
      const c = placeRing();
      ringFlare(1.1, 700);
      aura = stayAura(m, L.back, c, X(0.5), "179,136,255", 0.42, 200);
      L.back.insertBefore(aura.el, ring);
      const pillar = div(L.back, {
        position: "absolute",
        left: `${c.x - X(0.2)}px`,
        top: `${c.top}px`,
        width: `${X(0.4)}px`,
        height: `${c.y - c.top + X(0.2)}px`,
        background: `linear-gradient(0deg, rgba(${GOLD},0) 0%, rgba(255,240,200,0.75) 40%, rgba(${VIOLET},0.35) 80%, rgba(${VIOLET},0) 100%)`,
        borderRadius: `${X(0.2)}px`,
        transformOrigin: "50% 100%",
        opacity: "0",
      });
      const pa = m.play(pillar, [
        { opacity: 0, transform: "scaleY(0.2)" },
        { opacity: 1, transform: "scaleY(1)", offset: 0.35 },
        { opacity: 0, transform: "scaleY(1.1)" },
      ], { duration: 1100, easing: "ease-out" });
      const rmp = () => pillar.remove();
      if (pa) pa.finished.then(rmp, rmp);
      else rmp();
      for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * Math.PI * 2;
        sparkle(m, L.front, c.x + Math.cos(ang) * X(0.36), c.y + Math.sin(ang) * X(0.36) * 0.5, X(0.08), 120 + i * 40, i % 2 ? VIOLET : GOLD);
      }
    },

    stay: () => {
      // ふわふわ浮く（上下と、ほんの少しの傾き）
      m.play(aBob, [
        { transform: "translateY(0px) rotate(0deg)" },
        { transform: `translateY(${-X(0.012)}px) rotate(-1.5deg)`, offset: 0.5 },
        { transform: "translateY(0px) rotate(0deg)" },
      ], { duration: 2600, iterations: Infinity, easing: "ease-in-out" });
      // 魔法陣はゆっくり回り続ける（キャラ絵の後ろ）。6〜8秒おきに杖を振って、キャラ絵へ星を振りかける
      stopStay = every(m, 6000, 8000, (i) => {
        if (i % 3 === 2) {
          wave();
          twinkle();
        } else sprinkle();
      }, 2200);
    },

    /* 締め: キャラ絵が魔法陣へ帰る（真ん中へ縮んで消える）→ あやとが飛ぶ姿で真ん中へ戻る →
       魔法陣と光が消え、あやとも消える */
    finale: (c) => {
      const ms = (c.dur ?? 2.6) * 1000;
      if (stayTimer) m.clear(stayTimer);
      stopStay?.();
      const cc = centerOf(L, W, H);
      ringFlare(1.08, 600);
      curtainCall(m, L, {
        ms,
        hero: aPos,
        exitScale: 0.15,
        afterExit: () => {
          aura?.fadeOut(600);
          for (let i = 0; i < 6; i++) sparkle(m, L.top, cc.x + (Math.random() - 0.5) * X(0.2), cc.y + (Math.random() - 0.5) * X(0.1), X(0.08), i * 40, i % 2 ? VIOLET : GOLD);
        },
        toCenter: (mv) => {
          aBob.getAnimations().forEach((x) => x.cancel());
          popTo("fly", 280);
          // 角から、上へふくらむ弧で真ん中へ。大きさは登場のときに戻す
          flyArc({ x: cc.x, y: cc.y - Y(0.04), k: 1 }, [now.x - X(0.1), Math.min(now.y, cc.y) - Y(0.12)], mv, { overshoot: X(0.03), trail: L.top });
          m.after(mv, () => {
            m.play(ring, [{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(1.15)" }], { duration: ms * 0.3, fill: "forwards", easing: EASE.in });
          });
        },
      });
    },
  };

  /**
   * 待機の場所（顔の中心と倍率）。面の上の右の角。靴が帯の下の辺（キャラ絵の四角の上の辺）に
   * 乗るように。字のブロック（キャラ絵の上下中央）とキャラ絵の顔には掛からない
   */
  function staySpot() {
    const idle = P.get("idle") ?? fly;
    const k = X(STAY_W) / Math.max(1, (idle.content[2] - idle.content[0]) * s0);
    // 右向きにそろえた待機の絵の、顔の中心から見た右の端と下の端
    const flip = idle.facing === "left";
    const right = flip ? idle.size[0] - idle.content[0] : idle.content[2];
    const fx = flip ? idle.size[0] - idle.faceCenter[0] : idle.faceCenter[0];
    const toRight = (right - fx) * s0 * k;
    const toBottom = (idle.content[3] - idle.faceCenter[1]) * s0 * k;
    return { x: W - X(0.02) - toRight, y: bandBottomOf(L, W, H) - X(0.004) - toBottom, k };
  }

  // 小芸（滞在中）。どれも札の上の余白の中
  function wave() {
    m.play(aSquash, [
      { transform: "rotate(0deg)" },
      { transform: "rotate(-4deg)", offset: 0.2 },
      { transform: "rotate(3deg)", offset: 0.45 },
      { transform: "rotate(-3deg)", offset: 0.7 },
      { transform: "rotate(0deg)" },
    ], { duration: 900, easing: "ease-in-out" });
  }
  /** 杖の先から星が飛んで、キャラ絵のまわりへ降りる（キャラ絵の後ろの層。顔の前は通らない）。届くと魔法陣が光る */
  function sprinkle() {
    wave();
    const tip = at(WAND);
    const c = centerOf(L, W, H);
    const n = 12;
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1;
      const tx = c.x + side * X(0.22 + Math.random() * 0.2);
      const ty = c.top + (c.y - c.top) * (0.2 + Math.random() * 0.9);
      const mote = div(L.front, {
        position: "absolute",
        left: `${-X(0.025)}px`,
        top: `${-X(0.025)}px`,
        width: `${X(0.05)}px`,
        height: `${X(0.05)}px`,
        borderRadius: "50%",
        background: `radial-gradient(circle, rgba(255,255,240,1) 0%, rgba(${i % 3 ? GOLD : VIOLET},0.85) 45%, rgba(${GOLD},0) 72%)`,
        opacity: "0",
      });
      const d = 120 + i * 55;
      const fa = m.play(mote, [
        { transform: `translate(${tip.x}px, ${tip.y}px) scale(0.5)`, opacity: 1 },
        { transform: `translate(${(tip.x + tx) / 2}px, ${Math.min(tip.y, ty) - X(0.05)}px) scale(1)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${tx}px, ${ty}px) scale(0.5)`, opacity: 0 },
      ], { duration: 900, delay: d, easing: "ease-in", fill: "backwards" });
      const rm = () => mote.remove();
      if (fa) fa.finished.then(rm, rm);
      else rm();
      sparkle(m, L.front, tx, ty, X(0.07), d + 850, i % 2 ? VIOLET : GOLD);
    }
    m.after(120 + n * 55 + 850, () => ringFlare());
  }
  function twinkle() {
    const tip = at(WAND);
    sparkle(m, L.top, tip.x, tip.y, X(0.07), 0, GOLD);
    sparkle(m, L.top, tip.x + X(0.03), tip.y - X(0.03), X(0.05), 160, VIOLET);
  }

  for (const c of cues) {
    const fn = on[c.do];
    if (fn) m.at(c.t * 1000, () => fn(c));
  }
  return () => {};
}

/** 魔法陣の絵（SVG）。外の輪・内の輪・六芒星・まわりの小さな印。回すのは一番外の g */
function magicCircleSvg(): string {
  const dots = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    const r = 86;
    const x = 100 + Math.cos(a) * r;
    const y = 100 + Math.sin(a) * r;
    return i % 2
      ? `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2.2" fill="#FFE082"/>`
      : `<path d="M${x.toFixed(2)} ${(y - 3.4).toFixed(2)}l1 2.4 2.4 1-2.4 1-1 2.4-1-2.4-2.4-1 2.4-1z" fill="#E1BEE7"/>`;
  }).join("");
  const tri = (rot: number) => {
    const p = [0, 1, 2].map((i) => {
      const a = rot + (i / 3) * Math.PI * 2 - Math.PI / 2;
      return `${(100 + Math.cos(a) * 66).toFixed(2)},${(100 + Math.sin(a) * 66).toFixed(2)}`;
    });
    return `<polygon points="${p.join(" ")}" fill="none" stroke="#FFE082" stroke-width="2.4" stroke-linejoin="round"/>`;
  };
  return `<svg viewBox="0 0 200 200" width="100%" height="100%" style="position:absolute;inset:0;overflow:visible;transform-origin:50% 50%">
<defs><radialGradient id="mcg"><stop offset="0" stop-color="#B388FF" stop-opacity="0.38"/><stop offset="0.7" stop-color="#7C4DFF" stop-opacity="0.16"/><stop offset="1" stop-color="#7C4DFF" stop-opacity="0"/></radialGradient></defs>
<circle cx="100" cy="100" r="98" fill="url(#mcg)"/>
<circle cx="100" cy="100" r="94" fill="none" stroke="#FFD54F" stroke-width="3.2" opacity="0.95"/>
<circle cx="100" cy="100" r="88" fill="none" stroke="#FFE082" stroke-width="1.2" opacity="0.8"/>
<circle cx="100" cy="100" r="68" fill="none" stroke="#CE93D8" stroke-width="2.2" opacity="0.9"/>
${tri(0)}${tri(Math.PI)}
<circle cx="100" cy="100" r="22" fill="none" stroke="#FFE082" stroke-width="2"/>
${dots}
</svg>`;
}
