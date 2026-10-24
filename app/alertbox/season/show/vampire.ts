/**
 * 段7（10,000円〜）の振付け: お金持ちの吸血鬼「ヴラド伯爵」（設計書 §3.5）。
 *
 * 何がいつ起きるかは台本（`themes.ts` の `VAMPIRE`）が持つ。ここは出来事1つずつの
 * 「どう見せるか」だけを持つ。時計は `Motion`（ヒットストップで止まる）。
 *
 * 層（`layers.ts`。奥から）:
 *
 *   dark   暗転・赤い鼓動（揺らさない）
 *   back   満月・後光・こうもりの渦         ┐
 *   actor  伯爵（登場中は棺の後ろ。退いたら札の上へ） ├ 揺れる（演出の層だけ）
 *   mid    棺                              ┘
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
import { bandBottomOf, div, plateBoxOf, type ShowLayers } from "./layers";

/** 層は `layers.ts`。満月・後光・こうもりの渦は back、伯爵は actor、棺は mid */
export type VampireLayers = ShowLayers;

export type VampireRigs = { vlad: LoadedRig; bat: LoadedRig; props: LoadedRig };

/**
 * 置き場所（画面に対する割合）。満月は直径 720px で描いてあるので、幅 1080 の 6 割（648px）は
 * 縮めて使っている（拡げない）
 */
const MOON = { x: 0.5, y: 0.3, d: 0.6 };
const COFFIN = { x: 0.5, bottom: 0.8, w: 0.72 };
/**
 * 伯爵が棺の中に立って止まる足の高さと、そのときの背丈（台紙の高さ。膝から下は棺に隠れる）。
 * 見せ場のあいだ札は上から 6〜24% に掛かるので、頭のてっぺんがその下（0.26）に来る大きさ
 * （札が伯爵の顔を隠していた）
 */
const VLAD = { x: 0.52, feet: 0.72, h: 0.46 };
/**
 * 退いたあと（札の左上の角に立つ）の背丈。札の上の余白（index.tsx、面の高さの 1 割）に収まる大きさ。
 * キャラ絵は札のすぐ下なので、伯爵は札より下へ行かない
 */
const VLAD_STAY_H = 0.1;
/**
 * 姿勢（度。関節まわりの回転）。絵の休みの形が 0。
 * マントは開くほど横に広がる。この背丈で 34° のとき幅 0.95 画面（絵の担当の注意:
 * 「高さ 55% で 40° だと 1128px で画面を超える」）。行き過ぎは 1.15 倍まで
 */
const POSE = {
  capeClosed: 14,
  capeOpen: 34,
  /** 杯を掲げる（乾杯）・おじぎのあとに持つ */
  gobletUp: -24,
  gobletHold: -8,
  /** 指輪の手を広げる・おじぎで胸に当てる */
  ringOut: 22,
  ringChest: -28,
  /** ふたが開いて止まる角度（蝶番は左） */
  lidOpen: -82,
};
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
  const moonG = div(L.back, {
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
  const coffinG = div(L.mid, { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px", opacity: "0" });
  let coffinTop = Y(COFFIN.bottom) - X(COFFIN.w) * 0.5;
  if (coffinPart && coffinImg) {
    const s = X(COFFIN.w) / coffinImg.width;
    coffin = buildRig(rigs.props, s, { only: ["coffin"] });
    // 中の金貨の山は、ふたが開いてから出す（閉じているあいだも、山の頂がふたの奥からのぞく）
    const pile = coffin.part("coins");
    if (pile) pile.style.opacity = "0";
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
  const vPos = div(L.actor, { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px", willChange: "transform" });
  const vPose = div(vPos, { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px" });
  vlad.root.style.left = `${-(vb.l + vb.w / 2) * s0}px`;
  vlad.root.style.top = `${-vb.b * s0}px`;
  vPose.appendChild(vlad.root);
  const vAt = (x: number, y: number, k = 1) => `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${k.toFixed(4)})`;
  /* 登場のあいだは、棺の中ほど（金貨の山の高さ）より下を切る。棺の中から出てくるように。
     棺の下辺で切ると、棺の細くなった両端の外から伯爵の頭がのぞいた */
  const riseClipY = coffinTopY + (Y(COFFIN.bottom) - coffinTopY) * 0.5;
  let vNow = { x: X(VLAD.x), y: riseClipY + Y(VLAD.h) * 1.02, k: 1 };
  vPos.style.transform = vAt(vNow.x, vNow.y, vNow.k);
  vPos.style.opacity = "0";
  L.actor.style.clipPath = `inset(0px 0px ${Math.max(0, H - riseClipY)}px 0px)`;
  // 眠っている（目を閉じ、マントは体に巻き、裏地は畳んである）
  vlad.swap("eyes", "smile");
  const capeIn = vlad.part("cape_inner");
  if (capeIn) capeIn.style.transform = "scaleX(0.25)";
  const capeL = vlad.part("cape_l");
  const capeR = vlad.part("cape_r");
  if (capeL) capeL.style.transform = `rotate(${-POSE.capeClosed}deg)`;
  if (capeR) capeR.style.transform = `rotate(${POSE.capeClosed}deg)`;
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
  /* canvas は舞台の大きさ。描く画素の数は「いま画面で何 px に拡げられているか」で決める
     （1080×1920 をそのまま dpr で描くと、スマホで 3,000 万画素を超える） */
  const coins = new Coins(L.canvas, W, H, partImage(rigs.props, "coin"), () => m.time() / 1000, () => {
    const k = L.canvas.getBoundingClientRect().width / W || 1;
    return Math.min(2, k * (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1));
  });

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
    for (const el of [L.back, L.actor, L.mid]) m.play(el, f, { duration: ms, easing: "linear" });
  };

  // ---------------------------------------------------------------- 札の位置
  /* 札の位置（舞台の px）。`settled` なら、上寄りから定位置へ下ろす途中でも、下ろし終えた位置 */
  const plateBox = () => plateBoxOf(L, W, H);

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
        const bat = makeBat(m, rigs.bat, L.back, X(0.11 + Math.random() * 0.06), 110);
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
        dustPuffs(m, L.mid, X(COFFIN.x - COFFIN.w * 0.45), Y(COFFIN.bottom) - X(0.02), X(0.12), 3);
        dustPuffs(m, L.mid, X(COFFIN.x + COFFIN.w * 0.45), Y(COFFIN.bottom) - X(0.02), X(0.12), 3);
      });
    },

    shake: (c) => shake((c.dur ?? 0.25) * 1000, X(0.03)),

    hitstop: (c) => m.hitstop((c.dur ?? 0.08) * 1000),

    lidRattle: (c) => {
      // 蝶番（左）を軸に、右の端が中から押されて持ち上がる
      const lid = coffin?.part("lid");
      const ms = (c.dur ?? 0.36) * 1000;
      m.play(lid, [
        { transform: "rotate(0deg)" },
        { transform: "rotate(-4deg)", offset: 0.12 },
        { transform: "rotate(0.5deg)", offset: 0.25 },
        { transform: "rotate(-2.5deg)", offset: 0.35 },
        { transform: "rotate(0deg)", offset: 0.5 },
        { transform: "rotate(-7deg)", offset: 0.66 },
        { transform: "rotate(0.8deg)", offset: 0.8 },
        { transform: "rotate(-3deg)", offset: 0.9 },
        { transform: "rotate(0deg)" },
      ], { duration: ms });
      m.play(coffinG, [
        { transform: `translate(${X(COFFIN.x)}px, ${Y(COFFIN.bottom)}px) scale(1, 1)` },
        { transform: `translate(${X(COFFIN.x)}px, ${Y(COFFIN.bottom)}px) scale(1.02, 0.98)`, offset: 0.66 },
        { transform: `translate(${X(COFFIN.x)}px, ${Y(COFFIN.bottom)}px) scale(1, 1)` },
      ], { duration: ms });
    },

    lidOpen: () => {
      // ふたが蝶番（左）で跳ね上がり、行き過ぎて戻って止まる。中の金貨の山が現れる
      const lid = coffin?.part("lid");
      m.play(lid, [
        { transform: "rotate(0deg)", easing: "cubic-bezier(0.2, 0.8, 0.3, 1)" },
        { transform: `rotate(${POSE.lidOpen * 1.17}deg)`, offset: 0.45, easing: "ease-in-out" },
        { transform: `rotate(${POSE.lidOpen * 0.92}deg)`, offset: 0.75, easing: "ease-in-out" },
        { transform: `rotate(${POSE.lidOpen}deg)` },
      ], { duration: 700, fill: "forwards" });
      m.play(coffin?.part("coins") ?? null, [
        { opacity: 0, transform: "translateY(6%) scale(0.9, 0.7)", easing: EASE.out },
        { opacity: 1, transform: "translateY(0%) scale(1.03, 1.08)", offset: 0.6 },
        { opacity: 1, transform: "translateY(0%) scale(1, 1)" },
      ], { duration: 380, fill: "forwards" });
      // 金の光が噴き出す（伯爵より奥。起き上がる伯爵の前を塞がない）
      const beam = div(L.back, {
        position: "absolute",
        left: `${X(0.5) - X(0.3)}px`,
        top: `${coffinTopY - Y(0.5)}px`,
        width: `${X(0.6)}px`,
        height: `${Y(0.5) + X(0.04)}px`,
        background: "linear-gradient(to top, rgba(255,226,130,0.95) 0%, rgba(255,214,110,0.55) 35%, rgba(255,214,110,0) 100%)",
        clipPath: "polygon(30% 100%, 70% 100%, 100% 0%, 0% 0%)",
        transformOrigin: "50% 100%",
        opacity: "0",
      });
      m.play(beam, [
        { opacity: 0, transform: "scaleY(0.1)", easing: EASE.out },
        { opacity: 1, transform: "scaleY(1)", offset: 0.25 },
        { opacity: 0.7, transform: "scaleY(1.05)", offset: 0.6 },
        { opacity: 0, transform: "scaleY(1.1)" },
      ], { duration: 1600, fill: "forwards" });
      for (let i = 0; i < 5; i++) sparkle(m, L.front, X(0.3 + Math.random() * 0.4), coffinTopY - Y(Math.random() * 0.2), X(0.1), i * 90);
    },

    /* 棺の左右の端から外へ向けて噴く。真ん中は伯爵が起き上がるところなので通さない
       （真ん中から噴くと、主役の起き上がりが金貨に隠れた。こちらの録画を見ての指摘） */
    coinFountain: (c) => {
      const n = c.n ?? 70;
      for (const side of [-1, 1]) {
        coins.fountain(X(0.5 + side * COFFIN.w * 0.4), coffinTopY + X(0.03), Math.round(n / 2), c.dur ?? 0.7, X(0.08), side);
      }
    },

    rise: (c) => {
      const ms = (c.dur ?? 0.6) * 1000;
      vPos.style.opacity = "1";
      moveVlad(X(VLAD.x), Y(VLAD.feet), 1, ms, "cubic-bezier(0.25, 0.1, 0.25, 1.15)");
      // 起き上がりきる手前で目が開く
      m.after(ms * 0.7, () => {
        vlad.swap("eyes", "normal");
        vlad.swap("mouth", "smirk");
      });
    },

    capeOpen: (c) => {
      const ms = (c.dur ?? 0.35) * 1000;
      // 体に巻いた形（∓capeClosed）から開く
      const open = (id: string, from: number, to: number) =>
        m.play(vlad.part(id), [
          { transform: `rotate(${from}deg)`, easing: EASE.out },
          { transform: `rotate(${to * 1.15}deg)`, offset: 0.55, easing: "ease-in-out" },
          { transform: `rotate(${to}deg)` },
        ], { duration: ms * 1.6, fill: "forwards" });
      open("cape_l", -POSE.capeClosed, POSE.capeOpen);
      open("cape_r", POSE.capeClosed, -POSE.capeOpen);
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
      // 杯を掲げ、指輪の手を広げる
      m.play(vlad.part("arm_goblet"), [
        { transform: "rotate(0deg)", easing: EASE.back },
        { transform: `rotate(${POSE.gobletUp}deg)` },
      ], { duration: ms * 1.4, fill: "forwards" });
      m.play(vlad.part("arm_ring"), [
        { transform: "rotate(0deg)", easing: EASE.back },
        { transform: `rotate(${POSE.ringOut}deg)` },
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
      // 牙・指輪・杯の縁（どれも絵の中の割合）
      add("mouth", 0.3, 0.75, X(0.13), 0);
      add("arm_ring", 0.3, 0.82, X(0.16), 120);
      add("arm_goblet", 0.8, 0.2, X(0.18), 60);
      vlad.swap("eyes", "wink");
      m.after(380, () => vlad.swap("eyes", "normal"));
    },

    plateIn: () => {
      // こうもり2匹が、札の上の両端をつかんで運んでくる（札そのものは NamePlate が動かす）
      const ms = 600;
      for (const side of [-1, 1]) {
        const bat = makeBat(m, rigs.bat, L.top, X(0.13), 90);
        const x = X(0.5 + side * 0.3);
        // 札の上の辺をつかむ（札の置き場は面のいちばん上の枠。index.tsx）
        const y = plateBox().t - X(0.02);
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

    // 伯爵の顔の前（真ん中の縦の帯）には降らせない
    coinRain: (c) => coins.rain(c.n ?? 60, c.dur ?? 1.2, [0.3, 0.7]),

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
      // 杯を下ろして持ち、指輪の手を胸に当てる（このあとの滞在の形）
      m.play(vlad.part("arm_goblet"), [{ transform: `rotate(${POSE.gobletUp}deg)` }, { transform: `rotate(${POSE.gobletHold}deg)` }], {
        duration: ms * 0.5, fill: "forwards", easing: EASE.inOut,
      });
      m.play(vlad.part("arm_ring"), [{ transform: `rotate(${POSE.ringOut}deg)` }, { transform: `rotate(${POSE.ringChest}deg)` }], {
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
      /* ここから先はその人のキャラ絵が出ている。降っている金貨・きらめき・閃光の層を
         キャラ絵の後ろへ下げる（滞在中は粒を顔の前に通さない。オーナーの決まり） */
      L.frontBox.style.zIndex = "0";
      // その人の絵が満月の光の中から出る（絵そのものは index.tsx）。光がふくらんで消える
      const glow = div(L.back, {
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
      // 伯爵は面の上の左の角へ（上の帯。字のブロックとキャラ絵の顔を避ける）。
      // キャラ絵の裏を通って、着いてから手前に出る
      const k = VLAD_STAY_H / VLAD.h;
      // 足を帯の下の辺（キャラ絵の四角の上の辺）に乗せる
      const tx = X(0.13);
      const ty = bandBottomOf(L, W, H) - X(0.004);
      L.actor.style.clipPath = "";
      const a = moveVlad(tx, ty, k, ms * 0.48, EASE.inOut);
      const land = () => {
        L.actorBox.style.zIndex = "4";
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
      m.play(vlad.loop("torso"), [
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
      // 上の端の真ん中寄り（左上の角には伯爵、右上の角には満月がいる）
      for (const [fx, fy] of [[0.32, 0.02], [0.44, 0.032]] as const) {
        const bat = makeBat(m, rigs.bat, L.top, X(0.12), 2400);
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
      /* 字のまわりで、ときどき金のきらめき。字はキャラ絵の上下中央なので、顔（キャラ絵の上 45%）に
         掛からないように、字のブロックの真ん中より下（左右の端と下の端）だけに置く */
      const glints = () => {
        m.after(range(Math.random, 1600, 3200), () => {
          const b = plateBox();
          const mid = (b.t + b.b) / 2 + X(0.045);
          const side = Math.random() < 0.65;
          const x = side ? (Math.random() < 0.5 ? b.l : b.r) : b.l + Math.random() * (b.r - b.l);
          const y = side ? mid + Math.random() * Math.max(0, b.b - mid) : Math.max(mid, b.b);
          sparkle(m, L.top, x, y, X(0.07));
          glints();
        });
      };
      glints();
    },

    finale: (c) => {
      const ms = (c.dur ?? 4) * 1000;
      if (stayTimer) m.clear(stayTimer);
      // マントで体を包む
      const close = (id: string, from: number, to: number) =>
        m.play(vlad.part(id), [{ transform: `rotate(${from}deg)` }, { transform: `rotate(${to}deg)` }], {
          duration: 380, easing: EASE.in, fill: "forwards",
        });
      close("cape_l", POSE.capeOpen, -POSE.capeClosed);
      close("cape_r", -POSE.capeOpen, POSE.capeClosed);
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
            // 群れはキャラ絵の後ろを飛ぶ（滞在中は顔の前を通さない）
            const bat = makeBat(m, rigs.bat, L.back, X(0.08 + Math.random() * 0.05), 120);
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
        // 金の粉は札より上（キャラ絵の顔に掛けない）
        coins.dust(70, 1.6, 0, W, 0, bandBottomOf(L, W, H));
      });
      // 月が消え、暗さも引く
      m.play(moonG, [{ opacity: 1 }, { opacity: 0 }], { duration: ms * 0.5, delay: 500, fill: "forwards" });
      m.after(500, () => darkTo(0, ms * 0.7, EASE.inOut));
    },
  };

  // 小芸（滞在中）
  function cupSwirl() {
    const h = POSE.gobletHold;
    m.play(vlad.part("arm_goblet"), [
      { transform: `rotate(${h}deg)` },
      { transform: `rotate(${h - 16}deg)`, offset: 0.25 },
      { transform: `rotate(${h - 6}deg)`, offset: 0.45 },
      { transform: `rotate(${h - 16}deg)`, offset: 0.65 },
      { transform: `rotate(${h - 6}deg)`, offset: 0.85 },
      { transform: `rotate(${h}deg)` },
    ], { duration: 1600, easing: "ease-in-out" });
    vlad.swap("mouth", "omega");
    m.after(1600, () => vlad.swap("mouth", "smirk"));
  }
  function coinFlick() {
    const arm = vlad.loop("arm_ring");
    const p = rigs.vlad.def.parts.find((q) => q.id === "arm_ring");
    const im = p ? rigs.vlad.images.get(p.file ?? "") : null;
    if (!arm || !im) return;
    const size = X(0.035) / vlad.scale;
    const coin = document.createElement("div");
    Object.assign(coin.style, {
      position: "absolute",
      // 指輪の手（腕の絵の左下）から弾く
      left: `${im.width * 0.3 - size / 2}px`,
      top: `${im.height * 0.8 - size / 2}px`,
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
    const c0 = POSE.ringChest;
    m.play(vlad.part("arm_ring"), [
      { transform: `rotate(${c0}deg)` },
      { transform: `rotate(${c0 + 14}deg)`, offset: 0.12 },
      { transform: `rotate(${c0}deg)`, offset: 0.3 },
      { transform: `rotate(${c0}deg)`, offset: 0.9 },
      { transform: `rotate(${c0 + 9}deg)`, offset: 0.97 },
      { transform: `rotate(${c0}deg)` },
    ], { duration: 900 });
    vlad.swap("eyes", "normal");
    const rm = () => coin.remove();
    if (a) a.finished.then(rm, rm);
    else rm();
  }
  function wink() {
    vlad.swap("eyes", "wink");
    vlad.swap("mouth", "smirk");
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

