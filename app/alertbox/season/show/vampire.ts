/**
 * 段4（10,000円〜）の振付け: お金持ちの吸血鬼「ヴラド伯爵」（設計書 §3.5）。
 *
 * 何がいつ起きるかは台本（`themes.ts` の `VAMPIRE`）が持つ。ここは出来事1つずつの
 * 「どう見せるか」だけを持つ。時計は `Motion`（ヒットストップで止まる）。
 *
 * 層（奥から。どれもアラートの面いっぱい）:
 *
 *   dark   暗転・赤い鼓動（揺らさない）
 *   moon   満月・後光・こうもりの渦         ┐
 *   vlad   伯爵（登場中は棺の後ろ。退いたら札の上へ） ├ 揺れる（演出の層だけ）
 *   coffin 棺                              ┘
 *   ── その人のキャラ絵（index.tsx）──
 *   front  金貨・きらめき・閃光（canvas と DOM）
 *   ── 名前の札（NamePlate）──
 *   top    札を運ぶこうもり・ぶら下がるこうもり・締めの群れ
 *
 * 動かすのは transform と opacity だけ。画面いっぱいの層で動くのは、暗転（opacity）・
 * 後光（rotate）・閃光（opacity）の3つまで（設計書 §3.8）。
 */
import { EASE, range, type Motion } from "../rig/motion";
import { buildRig, type LoadedRig, type RigHandle } from "../rig/RigView";
import { restOrigin } from "../rig/rig";
import type { TimedCue } from "./script";
import { Coins, dustPuffs, makeBat, partImage, pathFrames, rigBounds, sparkle } from "./fx";

export type VampireLayers = {
  /** アラートの面（札の位置を測るのに使う） */
  root: HTMLElement;
  dark: HTMLDivElement;
  moon: HTMLDivElement;
  vlad: HTMLDivElement;
  coffin: HTMLDivElement;
  front: HTMLDivElement;
  canvas: HTMLCanvasElement;
  top: HTMLDivElement;
};

export type VampireRigs = { vlad: LoadedRig; bat: LoadedRig; props: LoadedRig };

/** 置き場所（画面に対する割合） */
const MOON = { x: 0.5, y: 0.3, d: 0.6 };
const COFFIN = { x: 0.5, bottom: 0.76, w: 0.64 };
/** 伯爵が棺の上に浮いて止まる足の高さと、そのときの背丈 */
const VLAD = { x: 0.5, feet: 0.6, h: 0.44 };
/** 退いたあと（札の左上に立つ）の背丈 */
const VLAD_STAY_H = 0.13;
/** 小さくなった満月の置き場所（右上の角） */
const MOON_STAY = { x: 0.86, y: 0.075, k: 0.24 };

export function runVampire(
  m: Motion,
  L: VampireLayers,
  rigs: VampireRigs,
  cues: TimedCue[],
  W: number,
  H: number
): () => void {
  const X = (f: number) => f * W;
  const Y = (f: number) => f * H;

  // ---------------------------------------------------------------- 暗転・鼓動・閃光
  const dark = div(L.dark, {
    position: "absolute",
    inset: "0px",
    background: "radial-gradient(ellipse at 50% 40%, rgba(14,2,22,0.86) 0%, rgba(4,0,8,1) 78%)",
    opacity: "0",
  });
  const pulse = div(L.dark, {
    position: "absolute",
    inset: "0px",
    background: "radial-gradient(ellipse at 50% 45%, rgba(170,0,26,0) 38%, rgba(210,0,34,0.95) 100%)",
    opacity: "0",
  });
  const flash = div(L.front, { position: "absolute", inset: "0px", background: "#FFFFFF", opacity: "0" });
  const goldFlash = div(L.front, {
    position: "absolute",
    inset: "0px",
    background: "radial-gradient(ellipse at 50% 38%, rgba(255,236,160,0.95) 0%, rgba(255,196,60,0.45) 35%, rgba(255,196,60,0) 70%)",
    opacity: "0",
  });
  let darkNow = 0;
  const darkTo = (to: number, ms: number, easing: string = EASE.out) => {
    m.play(dark, [{ opacity: darkNow }, { opacity: to }], { duration: ms, easing, fill: "forwards" });
    darkNow = to;
  };

  // ---------------------------------------------------------------- 満月と後光
  const moonD = X(MOON.d);
  const moonG = div(L.moon, {
    position: "absolute",
    left: `${X(MOON.x) - moonD / 2}px`,
    top: `${Y(MOON.y) - moonD / 2}px`,
    width: `${moonD}px`,
    height: `${moonD}px`,
    opacity: "0",
    willChange: "transform, opacity",
  });
  const haloD = moonD * 1.9;
  const halo = div(moonG, {
    position: "absolute",
    left: `${(moonD - haloD) / 2}px`,
    top: `${(moonD - haloD) / 2}px`,
    width: `${haloD}px`,
    height: `${haloD}px`,
    borderRadius: "50%",
    background:
      "repeating-conic-gradient(from 0deg, rgba(255,214,120,0.42) 0deg 5deg, rgba(255,214,120,0) 5deg 15deg)",
    willChange: "transform",
  });
  // 後光の外側を薄くする（止まった覆い。回すのは中身だけ）
  halo.style.setProperty("mask-image", "radial-gradient(circle, #000 28%, rgba(0,0,0,0) 70%)");
  halo.style.setProperty("-webkit-mask-image", "radial-gradient(circle, #000 28%, rgba(0,0,0,0) 70%)");
  div(moonG, {
    position: "absolute",
    left: `${-moonD * 0.25}px`,
    top: `${-moonD * 0.25}px`,
    width: `${moonD * 1.5}px`,
    height: `${moonD * 1.5}px`,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(255,240,200,0.55) 30%, rgba(255,200,120,0.18) 48%, rgba(255,200,120,0) 68%)",
  });
  const moonImg = partImage(rigs.props, "moon");
  if (moonImg) {
    const im = document.createElement("img");
    im.src = moonImg.src;
    im.alt = "";
    Object.assign(im.style, { position: "absolute", left: "0px", top: "0px", width: "100%", height: "100%" });
    moonG.appendChild(im);
  } else {
    div(moonG, {
      position: "absolute",
      inset: "0px",
      borderRadius: "50%",
      background: "radial-gradient(circle at 40% 38%, #FFFBEA 0%, #FFF0C8 55%, #EBD39C 100%)",
    });
  }

  // ---------------------------------------------------------------- 棺
  const pb = rigs.props.def;
  const coffinPart = pb.parts.find((p) => p.id === "coffin");
  const coffinImg = coffinPart ? rigs.props.images.get(coffinPart.file ?? "") : null;
  let coffin: RigHandle | null = null;
  const coffinG = div(L.coffin, { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px", opacity: "0" });
  let coffinTop = Y(COFFIN.bottom) - X(COFFIN.w) * 0.5;
  if (coffinPart && coffinImg) {
    const s = X(COFFIN.w) / coffinImg.width;
    coffin = buildRig(rigs.props, s, { only: ["coffin"] });
    const o = restOrigin(pb, "coffin")!;
    // 棺の下辺の真ん中が (0,0)
    coffin.root.style.left = `${-(o[0] + coffinImg.width / 2) * s}px`;
    coffin.root.style.top = `${-(o[1] + coffinImg.height) * s}px`;
    coffinG.appendChild(coffin.root);
    coffinTop = Y(COFFIN.bottom) - coffinImg.height * s;
  }
  coffinG.style.transform = `translate(${X(COFFIN.x)}px, ${Y(COFFIN.bottom)}px)`;
  coffinG.style.transformOrigin = "0 0";
  const coffinTopY = coffinTop;

  // ---------------------------------------------------------------- 伯爵
  const vb = rigBounds(rigs.vlad);
  const s0 = Y(VLAD.h) / vb.h;
  const vlad = buildRig(rigs.vlad, s0);
  const vPos = div(L.vlad, { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px", willChange: "transform" });
  const vPose = div(vPos, { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px" });
  vlad.root.style.left = `${-(vb.l + vb.w / 2) * s0}px`;
  vlad.root.style.top = `${-vb.b * s0}px`;
  vPose.appendChild(vlad.root);
  const vAt = (x: number, y: number, k = 1) => `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${k.toFixed(4)})`;
  let vNow = { x: X(VLAD.x), y: Y(VLAD.feet) + Y(VLAD.h) * 1.05, k: 1 };
  vPos.style.transform = vAt(vNow.x, vNow.y, vNow.k);
  vPos.style.opacity = "0";
  // 登場のあいだは、棺の下辺より下を切る（棺の中から出てくるように）
  L.vlad.style.clipPath = `inset(0px 0px ${Math.max(0, H - Y(COFFIN.bottom))}px 0px)`;
  // 眠っている（目を閉じ、マントは閉じ、裏地は畳んである）
  vlad.swap("eyes", "smile");
  const capeIn = vlad.part("cape_in");
  if (capeIn) capeIn.style.transform = "scaleX(0.25)";
  const moveVlad = (x: number, y: number, k: number, ms: number, easing: string) => {
    const a = m.play(vPos, [{ transform: vAt(vNow.x, vNow.y, vNow.k) }, { transform: vAt(x, y, k) }], {
      duration: ms,
      easing,
      fill: "forwards",
    });
    vNow = { x, y, k };
    return a;
  };

  // ---------------------------------------------------------------- 金貨
  const coins = new Coins(L.canvas, W, H, partImage(rigs.props, "coin"), () => m.time() / 1000);

  // ---------------------------------------------------------------- 揺れ（演出の層だけ）
  const shake = (ms: number, amp: number) => {
    const f: Keyframe[] = [];
    const n = 7;
    for (let i = 0; i <= n; i++) {
      const k = 1 - i / n;
      const a = amp * k * k;
      const dx = i === n ? 0 : (i % 2 === 0 ? 1 : -1) * a;
      const dy = i === n ? 0 : (i % 2 === 0 ? -0.6 : 0.5) * a;
      f.push({ transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)` });
    }
    for (const el of [L.moon, L.vlad, L.coffin]) m.play(el, f, { duration: ms, easing: "linear" });
  };

  // ---------------------------------------------------------------- 札の位置
  const plateBox = () => {
    const el = L.root.querySelector<HTMLElement>('[data-plate="box"]');
    const rr = L.root.getBoundingClientRect();
    if (!el) return { l: X(0.12), t: Y(0.3), r: X(0.88), b: Y(0.46) };
    const r = el.getBoundingClientRect();
    return { l: r.left - rr.left, t: r.top - rr.top, r: r.right - rr.left, b: r.bottom - rr.top };
  };

  // ---------------------------------------------------------------- 出来事ごと
  const hanging: HTMLDivElement[] = [];
  let stayTimer = 0;

  const on: Partial<Record<TimedCue["do"], (c: TimedCue) => void>> = {
    darken: (c) => darkTo(c.to ?? 0.8, (c.dur ?? 0.4) * 1000, EASE.inOut),

    pulse: (c) => {
      const n = c.n ?? 1;
      m.play(pulse, [
        { opacity: 0, transform: "scale(1.08)" },
        { opacity: 0.55 + 0.45 * n, transform: `scale(${1 - 0.03 * n})`, offset: 0.25, easing: EASE.out },
        { opacity: 0, transform: "scale(1)" },
      ], { duration: 380 });
    },

    batVortex: (c) => {
      const n = c.n ?? 20;
      const ms = 950;
      const cx = X(0.5);
      const cy = Y(0.36);
      const R0 = Math.hypot(W, H) * 0.62;
      for (let i = 0; i < n; i++) {
        const bat = makeBat(m, rigs.bat, L.moon, X(0.07 + Math.random() * 0.04), 110);
        const a0 = (i / n) * Math.PI * 2 + Math.random() * 0.3;
        const pts: [number, number][] = [];
        const offs: number[] = [];
        const SPIN = 13;
        for (let j = 0; j <= SPIN; j++) {
          const k = j / SPIN;
          const a = a0 + k * Math.PI * 1.7;
          const r = R0 * Math.pow(1 - k, 1.25) + X(0.05) + Math.random() * X(0.03);
          pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.75]);
          offs.push(k * 0.63);
        }
        // はじける（閃光で外へ飛び散る）
        const aEnd = a0 + Math.PI * 1.7;
        for (let j = 1; j <= 3; j++) {
          const r = X(0.08) + (j / 3) * Math.hypot(W, H) * 0.7;
          pts.push([cx + Math.cos(aEnd + j * 0.2) * r, cy + Math.sin(aEnd + j * 0.2) * r]);
          offs.push(0.63 + (j / 3) * 0.37);
        }
        const a = m.play(bat.el, pathFrames(pts, { tilt: 25, offsets: offs, opacity: (k) => (k < 0.85 ? 1 : 0) }), {
          duration: ms + Math.random() * 60,
          delay: Math.random() * 80,
          fill: "backwards",
        });
        const rm = () => bat.el.remove();
        if (a) a.finished.then(rm, rm);
        else rm();
      }
    },

    flash: () => {
      m.play(flash, [{ opacity: 0 }, { opacity: 0.92, offset: 0.18 }, { opacity: 0 }], { duration: 160, easing: "ease-out" });
    },

    moonRise: (c) => {
      const ms = (c.dur ?? 0.7) * 1000;
      m.play(moonG, [
        { opacity: 0, transform: `translateY(${Y(0.12)}px) scale(0.86)`, easing: EASE.out },
        { opacity: 1, transform: "translateY(0px) scale(1)" },
      ], { duration: ms, fill: "forwards" });
      m.play(halo, [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], {
        duration: 24000,
        iterations: Infinity,
      });
    },

    coffinDrop: (c) => {
      const ms = (c.dur ?? 0.3) * 1000;
      coffinG.style.opacity = "1";
      const base = `translate(${X(COFFIN.x)}px, ${Y(COFFIN.bottom)}px)`;
      m.play(coffinG, [
        { transform: `${base} translateY(${-Y(1)}px) scale(0.92, 1.1)`, easing: "cubic-bezier(0.5, 0, 0.9, 0.6)" },
        { transform: `${base} translateY(0px) scale(0.92, 1.1)`, offset: 0.999 },
        { transform: `${base} translateY(0px) scale(1, 1)` },
      ], { duration: ms });
      // 着地: つぶれて、行き過ぎて、戻る。土ぼこり
      m.after(ms, () => {
        m.play(coffinG, [
          { transform: `${base} scale(1.16, 0.8)`, easing: EASE.out },
          { transform: `${base} scale(0.95, 1.06)`, offset: 0.45, easing: "ease-in-out" },
          { transform: `${base} scale(1.02, 0.98)`, offset: 0.75, easing: "ease-in-out" },
          { transform: `${base} scale(1, 1)` },
        ], { duration: 380 });
        dustPuffs(m, L.coffin, X(COFFIN.x - COFFIN.w * 0.45), Y(COFFIN.bottom) - X(0.02), X(0.12), 3);
        dustPuffs(m, L.coffin, X(COFFIN.x + COFFIN.w * 0.45), Y(COFFIN.bottom) - X(0.02), X(0.12), 3);
      });
    },

    shake: (c) => shake((c.dur ?? 0.25) * 1000, X(0.03)),

    hitstop: (c) => m.hitstop((c.dur ?? 0.08) * 1000),

    lidRattle: (c) => {
      const lid = coffin?.part("lid");
      const ms = (c.dur ?? 0.36) * 1000;
      m.play(lid, [
        { transform: "translate(0px, 0px) rotate(0deg)" },
        { transform: "translate(0px, -10px) rotate(-5deg)", offset: 0.12 },
        { transform: "translate(0px, 0px) rotate(1deg)", offset: 0.25 },
        { transform: "translate(0px, -6px) rotate(-3deg)", offset: 0.35 },
        { transform: "translate(0px, 0px) rotate(0deg)", offset: 0.5 },
        { transform: "translate(0px, -16px) rotate(-8deg)", offset: 0.66 },
        { transform: "translate(0px, 0px) rotate(2deg)", offset: 0.8 },
        { transform: "translate(0px, -8px) rotate(-4deg)", offset: 0.9 },
        { transform: "translate(0px, 0px) rotate(0deg)" },
      ], { duration: ms });
      m.play(coffinG, [
        { transform: `translate(${X(COFFIN.x)}px, ${Y(COFFIN.bottom)}px) scale(1, 1)` },
        { transform: `translate(${X(COFFIN.x)}px, ${Y(COFFIN.bottom)}px) scale(1.02, 0.98)`, offset: 0.66 },
        { transform: `translate(${X(COFFIN.x)}px, ${Y(COFFIN.bottom)}px) scale(1, 1)` },
      ], { duration: ms });
    },

    lidOpen: () => {
      // ふたが弾け飛んで、回りながら左上へ消える
      const lid = coffin?.part("lid");
      if (lid) {
        const sc = coffin!.scale;
        m.play(lid, [
          { transform: "translate(0px, 0px) rotate(0deg)", easing: "cubic-bezier(0.2, 0.7, 0.4, 1)" },
          { transform: `translate(${-X(0.55) / sc}px, ${-Y(0.42) / sc}px) rotate(-260deg)` },
        ], { duration: 800, fill: "forwards" });
      }
      // 金の光が噴き出す
      const beam = div(L.coffin, {
        position: "absolute",
        left: `${X(0.5) - X(0.3)}px`,
        top: `${coffinTopY - Y(0.5)}px`,
        width: `${X(0.6)}px`,
        height: `${Y(0.5) + X(0.04)}px`,
        background: "linear-gradient(to top, rgba(255,226,130,0.95) 0%, rgba(255,214,110,0.55) 35%, rgba(255,214,110,0) 100%)",
        clipPath: "polygon(30% 100%, 70% 100%, 100% 0%, 0% 0%)",
        transformOrigin: "50% 100%",
        opacity: "0",
        zIndex: "-1",
      });
      m.play(beam, [
        { opacity: 0, transform: "scaleY(0.1)", easing: EASE.out },
        { opacity: 1, transform: "scaleY(1)", offset: 0.25 },
        { opacity: 0.7, transform: "scaleY(1.05)", offset: 0.6 },
        { opacity: 0, transform: "scaleY(1.1)" },
      ], { duration: 1600, fill: "forwards" });
      for (let i = 0; i < 5; i++) sparkle(m, L.front, X(0.3 + Math.random() * 0.4), coffinTopY - Y(Math.random() * 0.2), X(0.1), i * 90);
    },

    coinFountain: (c) => coins.fountain(X(0.5), coffinTopY + X(0.03), c.n ?? 120, c.dur ?? 0.7, X(0.36)),

    rise: (c) => {
      const ms = (c.dur ?? 0.6) * 1000;
      vPos.style.opacity = "1";
      moveVlad(X(VLAD.x), Y(VLAD.feet), 1, ms, "cubic-bezier(0.25, 0.1, 0.25, 1.15)");
      // 起き上がりきる手前で目が開く
      m.after(ms * 0.7, () => {
        vlad.swap("eyes", "normal");
        vlad.swap("mouth", "grin");
      });
    },

    capeOpen: (c) => {
      const ms = (c.dur ?? 0.35) * 1000;
      const open = (id: string, a: number) =>
        m.play(vlad.part(id), [
          { transform: "rotate(0deg)", easing: EASE.out },
          { transform: `rotate(${a * 1.22}deg)`, offset: 0.55, easing: "ease-in-out" },
          { transform: `rotate(${a}deg)` },
        ], { duration: ms * 1.6, fill: "forwards" });
      open("cape_l", 62);
      open("cape_r", -62);
      m.play(capeIn, [
        { transform: "scaleX(0.25)", easing: EASE.out },
        { transform: "scaleX(1.15)", offset: 0.55, easing: "ease-in-out" },
        { transform: "scaleX(1)" },
      ], { duration: ms * 1.6, fill: "forwards" });
      m.play(vPose, [
        { transform: "scale(1, 1)" },
        { transform: "scale(1.06, 0.95)", offset: 0.25 },
        { transform: "scale(0.98, 1.03)", offset: 0.6 },
        { transform: "scale(1, 1)" },
      ], { duration: ms * 1.6 });
      m.play(vlad.part("arm_cup"), [
        { transform: "rotate(0deg)", easing: EASE.back },
        { transform: "rotate(-150deg)" },
      ], { duration: ms * 1.4, fill: "forwards" });
      m.play(vlad.part("arm_pose"), [
        { transform: "rotate(0deg)", easing: EASE.back },
        { transform: "rotate(35deg)" },
      ], { duration: ms * 1.4, fill: "forwards" });
      // マントの風で、金の粉が舞う
      coins.dust(30, 0.4, X(0.15), X(0.85), Y(0.25), Y(0.55));
    },

    glint: () => {
      const add = (id: string, fx: number, fy: number, size: number, delay: number) => {
        const lp = vlad.loop(id);
        const p = rigs.vlad.def.parts.find((q) => q.id === id);
        const im = p ? rigs.vlad.images.get(p.file ?? Object.values(p.swaps ?? {})[0]) : null;
        if (!lp || !im) return;
        sparkle(m, lp, im.width * fx, im.height * fy, size / vlad.scale, delay);
      };
      add("mouth", 0.68, 0.7, X(0.13), 0);
      add("arm_pose", 0.65, 0.8, X(0.16), 120);
      add("arm_cup", 0.6, 0.62, X(0.18), 60);
      vlad.swap("eyes", "wink");
      m.after(380, () => vlad.swap("eyes", "normal"));
    },

    plateIn: () => {
      // こうもり2匹が、札の上の両端をつかんで運んでくる（札そのものは NamePlate が動かす）
      const ms = 600;
      for (const side of [-1, 1]) {
        const bat = makeBat(m, rigs.bat, L.top, X(0.13), 90);
        const x = X(0.5 + side * 0.3);
        const y = Y(0.3) - X(0.02);
        const a = m.play(bat.el, [
          { transform: `translate(${x}px, ${y - Y(0.42)}px)`, easing: "cubic-bezier(0.3, 0, 0.6, 1)" },
          { transform: `translate(${x}px, ${y}px)`, offset: 0.45 },
          { transform: `translate(${x}px, ${y}px)`, offset: 0.62, easing: EASE.in },
          { transform: `translate(${x + side * X(0.4)}px, ${y - Y(0.35)}px)` },
        ], { duration: ms * 2.3, fill: "backwards" });
        const rm = () => bat.el.remove();
        if (a) a.finished.then(rm, rm);
        else rm();
      }
    },

    coinRain: (c) => coins.rain(c.n ?? 60, c.dur ?? 1.2),

    don: () => {
      m.play(goldFlash, [{ opacity: 0 }, { opacity: 0.9, offset: 0.15 }, { opacity: 0 }], { duration: 500, easing: "ease-out" });
      const pb2 = plateBox();
      coins.fountain((pb2.l + pb2.r) / 2, (pb2.t + pb2.b) / 2, 26, 0.12, (pb2.r - pb2.l) * 0.6);
      for (let i = 0; i < 4; i++) sparkle(m, L.front, pb2.l + Math.random() * (pb2.r - pb2.l), pb2.t + Math.random() * (pb2.b - pb2.t), X(0.12), i * 70);
      shake(160, X(0.012));
    },

    bow: (c) => {
      const ms = (c.dur ?? 0.7) * 1000;
      vlad.swap("eyes", "smile");
      m.play(vlad.part("arm_cup"), [{ transform: "rotate(-150deg)" }, { transform: "rotate(-20deg)" }], {
        duration: ms * 0.5, fill: "forwards", easing: EASE.inOut,
      });
      m.play(vlad.part("arm_pose"), [{ transform: "rotate(35deg)" }, { transform: "rotate(-75deg)" }], {
        duration: ms * 0.5, fill: "forwards", easing: EASE.inOut,
      });
      m.play(vlad.part("head"), [
        { transform: "translateY(0px) rotate(0deg)", easing: EASE.inOut },
        { transform: "translateY(36px) rotate(-4deg)", offset: 0.45 },
        { transform: "translateY(36px) rotate(-4deg)", offset: 0.7, easing: EASE.inOut },
        { transform: "translateY(0px) rotate(0deg)" },
      ], { duration: ms });
      m.play(vPose, [
        { transform: "scale(1, 1)", easing: EASE.inOut },
        { transform: "scale(1.02, 0.93)", offset: 0.45 },
        { transform: "scale(1.02, 0.93)", offset: 0.7, easing: EASE.inOut },
        { transform: "scale(1, 1)" },
      ], { duration: ms });
      m.after(ms, () => vlad.swap("eyes", "normal"));
    },

    reveal: () => {
      // その人の絵が満月の光の中から出る（絵そのものは index.tsx）。光がふくらんで消える
      const glow = div(L.moon, {
        position: "absolute",
        left: `${X(MOON.x) - moonD}px`,
        top: `${Y(MOON.y) - moonD}px`,
        width: `${moonD * 2}px`,
        height: `${moonD * 2}px`,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(255,250,230,0.95) 0%, rgba(255,240,200,0.5) 35%, rgba(255,240,200,0) 65%)",
        opacity: "0",
      });
      m.play(glow, [
        { opacity: 0, transform: "scale(0.4)" },
        { opacity: 1, transform: "scale(1)", offset: 0.3 },
        { opacity: 0, transform: "scale(1.6)" },
      ], { duration: 1100, easing: "ease-out", fill: "forwards" });
    },

    retreat: (c) => {
      const ms = (c.dur ?? 2.5) * 1000;
      darkTo(c.to ?? 0.2, ms * 0.6, EASE.inOut);
      // 月は小さくなって右上の角へ。後光は消す（重さの予算で最初に削るもの）
      m.play(moonG, [
        { opacity: 1, transform: "translate(0px, 0px) scale(1)" },
        {
          opacity: 1,
          transform: `translate(${X(MOON_STAY.x - MOON.x)}px, ${Y(MOON_STAY.y - MOON.y)}px) scale(${MOON_STAY.k})`,
        },
      ], { duration: ms * 0.6, easing: EASE.inOut, fill: "forwards" });
      m.play(halo, [{ opacity: 1 }, { opacity: 0 }], { duration: ms * 0.3, fill: "forwards" });
      m.after(ms * 0.3, () => {
        halo.getAnimations().forEach((a) => a.cancel());
        halo.style.display = "none";
      });
      // 棺は沈んで消える
      m.play(coffinG, [{ opacity: 1 }, { opacity: 0 }], { duration: ms * 0.25, fill: "forwards" });
      // 伯爵は札の左上へ。札の裏を通って、着いてから手前に出る
      const pb2 = plateBox();
      const k = VLAD_STAY_H / VLAD.h;
      const tx = pb2.l + X(0.07);
      const ty = pb2.t + X(0.012);
      L.vlad.style.clipPath = "";
      const a = moveVlad(tx, ty, k, ms * 0.48, EASE.inOut);
      const land = () => {
        L.vlad.style.zIndex = "4";
        m.play(vPose, [
          { transform: "scale(1.12, 0.86)", easing: EASE.out },
          { transform: "scale(0.96, 1.05)", offset: 0.5 },
          { transform: "scale(1, 1)" },
        ], { duration: 260 });
      };
      if (a) a.finished.then(land, () => {});
      else land();
    },

    stay: () => {
      // 呼吸（ずっと）
      m.play(vlad.loop("body"), [
        { transform: "scale(1, 1)" },
        { transform: "scale(1.01, 1.025)", offset: 0.6 },
        { transform: "scale(1, 1)" },
      ], { duration: 2600, iterations: Infinity, easing: "ease-in-out" });
      m.play(vlad.loop("cape_l"), [{ transform: "rotate(-3deg)" }, { transform: "rotate(3deg)" }], {
        duration: 2800, iterations: Infinity, direction: "alternate", easing: "ease-in-out",
      });
      m.play(vlad.loop("cape_r"), [{ transform: "rotate(3deg)" }, { transform: "rotate(-3deg)" }], {
        duration: 3100, iterations: Infinity, direction: "alternate", easing: "ease-in-out",
      });
      // 上の角にぶら下がるこうもり（逆さま。ときどき羽をのばす）
      for (const [fx, fy] of [[0.06, 0.035], [0.15, 0.02]] as const) {
        const bat = makeBat(m, rigs.bat, L.top, X(0.09), 2400);
        bat.el.style.transform = `translate(${X(fx)}px, ${Y(fy)}px) rotate(180deg) scale(0.9)`;
        m.play(bat.el, [{ opacity: 0 }, { opacity: 1 }], { duration: 500 });
        hanging.push(bat.el);
        m.play(bat.el, [
          { transform: `translate(${X(fx)}px, ${Y(fy)}px) rotate(176deg) scale(0.9)` },
          { transform: `translate(${X(fx)}px, ${Y(fy)}px) rotate(184deg) scale(0.9)` },
        ], { duration: 2200 + fx * 4000, iterations: Infinity, direction: "alternate", easing: "ease-in-out" });
      }
      // 8秒おきに小芸。杯を回す → 金貨を弾いて受け取る → ウインク、の順でくじ
      const tricks = [cupSwirl, coinFlick, wink];
      let last = -1;
      const next = () => {
        stayTimer = m.after(range(Math.random, 6500, 9000), () => {
          let i = Math.floor(Math.random() * tricks.length);
          if (i === last) i = (i + 1) % tricks.length;
          last = i;
          tricks[i]();
          next();
        });
      };
      next();
      // 札の縁で、ときどき金のきらめき
      const glints = () => {
        m.after(range(Math.random, 2200, 4200), () => {
          const b = plateBox();
          const edge = Math.random() < 0.5;
          const x = edge ? (Math.random() < 0.5 ? b.l : b.r) : b.l + Math.random() * (b.r - b.l);
          const y = edge ? b.t + Math.random() * (b.b - b.t) : Math.random() < 0.5 ? b.t : b.b;
          sparkle(m, L.front, x, y, X(0.08));
          glints();
        });
      };
      glints();
    },

    finale: (c) => {
      const ms = (c.dur ?? 4) * 1000;
      if (stayTimer) m.clear(stayTimer);
      // マントで体を包む
      const close = (id: string, from: number) =>
        m.play(vlad.part(id), [{ transform: `rotate(${from}deg)` }, { transform: "rotate(0deg)" }], {
          duration: 380, easing: EASE.in, fill: "forwards",
        });
      close("cape_l", 62);
      close("cape_r", -62);
      m.play(capeIn, [{ transform: "scaleX(1)" }, { transform: "scaleX(0.25)" }], { duration: 380, fill: "forwards" });
      vlad.swap("eyes", "smile");
      // ぽんっと消えて、こうもりの群れになる
      m.after(450, () => {
        const ox = vNow.x;
        const oy = vNow.y - Y(VLAD_STAY_H) * 0.5;
        m.play(vPos, [
          { transform: vAt(vNow.x, vNow.y, vNow.k), opacity: 1 },
          { transform: vAt(vNow.x, vNow.y, vNow.k * 0.2), opacity: 0 },
        ], { duration: 260, easing: EASE.in, fill: "forwards" });
        dustPuffs(m, L.top, ox, oy, X(0.1), 4);
        for (let i = 0; i < 6; i++) sparkle(m, L.top, ox + (Math.random() - 0.5) * X(0.15), oy + (Math.random() - 0.5) * X(0.15), X(0.09), i * 50);
        const wave = (delay: number, fromX: number, fromY: number, band: [number, number], n: number) => {
          for (let i = 0; i < n; i++) {
            const bat = makeBat(m, rigs.bat, L.top, X(0.08 + Math.random() * 0.05), 120);
            const yEnd = Y(band[0] + Math.random() * (band[1] - band[0]));
            const pts: [number, number][] = [];
            const SEG = 10;
            const sway = X(0.02 + Math.random() * 0.03);
            for (let j = 0; j <= SEG; j++) {
              const k = j / SEG;
              const x = fromX + (W * 1.15 - fromX) * k + Math.random() * 4;
              const y = fromY + (yEnd - fromY) * Math.min(1, k * 1.6) + Math.sin(k * Math.PI * 3 + i) * sway;
              pts.push([x, y]);
            }
            const a = m.play(bat.el, pathFrames(pts, { tilt: 20, scale: (k) => 0.4 + Math.min(1, k * 3) * 0.6 }), {
              duration: 1500 + Math.random() * 500,
              delay: delay + i * 45 + Math.random() * 80,
              fill: "backwards",
            });
            const rm = () => bat.el.remove();
            if (a) a.finished.then(rm, rm);
            else rm();
          }
        };
        wave(0, ox, oy, [0.05, 0.3], 11);
        wave(800, -X(0.15), Y(0.5), [0.32, 0.62], 11);
        // ぶら下がっていたこうもりも飛び立つ
        hanging.forEach((h) => m.play(h, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: "forwards" }));
        coins.dust(70, 1.6, 0, W, 0, Y(0.45));
      });
      // 月が消え、暗さも引く
      m.play(moonG, [{ opacity: 1 }, { opacity: 0 }], { duration: ms * 0.5, delay: 500, fill: "forwards" });
      m.after(500, () => darkTo(0, ms * 0.7, EASE.inOut));
    },
  };

  // 小芸（滞在中）
  function cupSwirl() {
    m.play(vlad.part("arm_cup"), [
      { transform: "rotate(-20deg)" },
      { transform: "rotate(-48deg)", offset: 0.25 },
      { transform: "rotate(-32deg)", offset: 0.45 },
      { transform: "rotate(-48deg)", offset: 0.65 },
      { transform: "rotate(-32deg)", offset: 0.85 },
      { transform: "rotate(-20deg)" },
    ], { duration: 1600, easing: "ease-in-out" });
    vlad.swap("mouth", "omega");
    m.after(1600, () => vlad.swap("mouth", "grin"));
  }
  function coinFlick() {
    const arm = vlad.loop("arm_pose");
    const p = rigs.vlad.def.parts.find((q) => q.id === "arm_pose");
    const im = p ? rigs.vlad.images.get(p.file ?? "") : null;
    if (!arm || !im) return;
    const size = X(0.035) / vlad.scale;
    const coin = document.createElement("div");
    Object.assign(coin.style, {
      position: "absolute",
      left: `${im.width * 0.55 - size / 2}px`,
      top: `${im.height * 0.75 - size / 2}px`,
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: "50%",
      background: "radial-gradient(circle at 38% 34%, #FFF6C8, #FFC93C 50%, #B8740A)",
      border: `${Math.max(1, size * 0.06)}px solid #7A4A04`,
      zIndex: "100",
    } satisfies Partial<CSSStyleDeclaration>);
    arm.appendChild(coin);
    const up = -size * 6;
    const a = m.play(coin, [
      { transform: "translateY(0px) scaleX(1)", easing: EASE.up },
      { transform: `translateY(${up}px) scaleX(-1)`, offset: 0.5, easing: EASE.down },
      { transform: "translateY(0px) scaleX(1)" },
    ], { duration: 900 });
    m.play(vlad.part("arm_pose"), [
      { transform: "rotate(-75deg)" },
      { transform: "rotate(-95deg)", offset: 0.12 },
      { transform: "rotate(-75deg)", offset: 0.3 },
      { transform: "rotate(-75deg)", offset: 0.9 },
      { transform: "rotate(-88deg)", offset: 0.97 },
      { transform: "rotate(-75deg)" },
    ], { duration: 900 });
    vlad.swap("eyes", "normal");
    const rm = () => coin.remove();
    if (a) a.finished.then(rm, rm);
    else rm();
  }
  function wink() {
    vlad.swap("eyes", "wink");
    vlad.swap("mouth", "grin");
    m.play(vlad.part("head"), [
      { transform: "rotate(0deg)" },
      { transform: "rotate(-7deg)", offset: 0.3 },
      { transform: "rotate(-7deg)", offset: 0.7 },
      { transform: "rotate(0deg)" },
    ], { duration: 700, easing: "ease-in-out" });
    m.after(420, () => vlad.swap("eyes", "normal"));
    sparkle(m, L.top, vNow.x + X(0.04), vNow.y - Y(VLAD_STAY_H) * 0.75, X(0.06), 120);
  }

  for (const c of cues) {
    const fn = on[c.do];
    if (fn) m.at(c.t * 1000, () => fn(c));
  }

  return () => coins.dispose();
}

function div(parent: HTMLElement, style: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const d = document.createElement("div");
  Object.assign(d.style, { pointerEvents: "none", ...style });
  parent.appendChild(d);
  return d;
}
