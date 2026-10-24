/**
 * 段1（〜199円）の振付け: ちびおばけ（設計書 v3。ランタンから「ばあ！」、前兆なし、登場 1.2 秒）。
 *
 * 面の上の左の角に、かぼちゃのランタンがぽんっと出る。ふたがガタガタして跳ね飛び、中から
 * ちびおばけが「ばあ！」と飛び出す。滞在のあいだはランタンの上でふわふわ浮き、ときどき中に
 * 隠れてもう一度「ばあ！」・くるっと回る・びっくり顔。締めは手を振ってランタンに戻り、ふたが閉まる。
 *
 * **その人のキャラ絵は最初から出ている**（段1〜3）ので、ランタンとおばけは面の上の端の帯
 * （`headroom`。キャラ絵の四角の上）の中だけにいる。字（キャラ絵の上下中央）にも顔にも掛からない。
 *
 * 層（`layers.ts`）: ランタン・おばけは actor（外の箱を最初から 4 に）、きらめきは top、
 * 締めのこうもりは back。
 */
import { EASE, range, type Motion } from "../rig/motion";
import { buildRig, type LoadedRig } from "../rig/RigView";
import type { TimedCue } from "./script";
import { makeBat, partImage, pathFrames, rigBounds, sparkle } from "./fx";
import { bandBottomOf, div, type ShowLayers } from "./layers";

export type GhostRigs = { ghost: LoadedRig; bat: LoadedRig };

/** ランタンの幅（面の幅に対する割合）と、左の端からの真ん中の位置 */
const LANTERN = { w: 0.28, x: 0.19 };
/** おばけの背丈（面の高さに対する割合） */
const GHOST_H = 0.1;
/** 出たときのおばけの足元の高さ（ランタンの下の辺から上へ。ランタンの高さに対する割合）。
 *  足元はランタンの口より少し下（体の下はランタンの中に残る） */
const RISE = 0.62;

export function runGhost(m: Motion, L: ShowLayers, rigs: GhostRigs, cues: TimedCue[], W: number, H: number): () => void {
  const X = (f: number) => f * W;
  const Y = (f: number) => f * H;
  L.frontBox.style.zIndex = "0";
  L.actorBox.style.zIndex = "4";

  const lanternImg = partImage(rigs.ghost, "lantern");
  const lidImg = partImage(rigs.ghost, "lantern_lid");
  const lw = X(LANTERN.w);
  const lh = lanternImg ? (lw * lanternImg.naturalHeight) / Math.max(1, lanternImg.naturalWidth) : lw * 0.65;
  const lidW = lidImg && lanternImg ? (lw * lidImg.naturalWidth) / Math.max(1, lanternImg.naturalWidth) : lw * 0.76;
  const lidH = lidImg ? (lidW * lidImg.naturalHeight) / Math.max(1, lidImg.naturalWidth) : lidW * 0.58;

  /* 置き場（ランタンの下の辺の真ん中）。帯の下の辺 = キャラ絵の四角の上の辺 */
  const base = () => ({ x: X(LANTERN.x), y: bandBottomOf(L, W, H) - X(0.004) });
  const b0 = base();

  // ---------------------------------------------------------------- ランタン（光・おばけ・本体・ふたの順に重ねる）
  const lantern = div(L.actor, {
    position: "absolute",
    left: "0px",
    top: "0px",
    width: "0px",
    height: "0px",
    transform: `translate(${b0.x}px, ${b0.y}px)`,
    willChange: "transform",
  });
  const pop = div(lantern, { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px", transform: "scale(0)", transformOrigin: "0 0" });
  // 中の灯り（ゆらゆら）
  const glow = div(pop, {
    position: "absolute",
    left: `${-lw * 0.42}px`,
    top: `${-lh * 0.85}px`,
    width: `${lw * 0.84}px`,
    height: `${lh * 0.8}px`,
    borderRadius: "50%",
    background: "radial-gradient(ellipse, rgba(255,214,90,0.9) 0%, rgba(255,150,40,0.45) 40%, rgba(255,140,30,0) 70%)",
    opacity: "0",
  });
  // おばけ（ランタンの中から出る。ランタンの絵より奥、ランタンの下の辺より下は切る）
  const ghostClip = div(pop, {
    position: "absolute",
    left: `${-X(0.5)}px`,
    top: `${-Y(0.5)}px`,
    width: `${X(1)}px`,
    height: `${Y(0.5)}px`,
    overflow: "hidden",
  });
  const kb = rigBounds(rigs.ghost);
  const s = Y(GHOST_H) / kb.h;
  const g = buildRig(rigs.ghost, s);
  const gPos = div(ghostClip, { position: "absolute", left: `${X(0.5)}px`, top: `${Y(0.5)}px`, width: "0px", height: "0px", willChange: "transform" });
  const gBob = div(gPos, { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px" });
  const gPose = div(gBob, { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px" });
  g.root.style.left = `${-(kb.l + kb.w / 2) * s}px`;
  g.root.style.top = `${-kb.b * s}px`;
  gPose.appendChild(g.root);
  /** おばけの足元の高さ（ランタンの下の辺から上へ）: 隠れている / 出ている */
  const HIDE = 0;
  const OUT = lh * RISE;
  const gAt = (up: number) => `translateY(${(-up).toFixed(1)}px)`;
  gPos.style.transform = gAt(HIDE);
  if (lanternImg) {
    const im = document.createElement("img");
    im.src = lanternImg.src;
    im.alt = "";
    Object.assign(im.style, { position: "absolute", left: `${-lw / 2}px`, top: `${-lh}px`, width: `${lw}px`, height: `${lh}px` });
    pop.appendChild(im);
  }
  const lid = div(pop, {
    position: "absolute",
    left: `${-lidW / 2}px`,
    top: `${-lh - lidH * 0.55}px`,
    width: `${lidW}px`,
    height: `${lidH}px`,
    transformOrigin: "50% 80%",
  });
  if (lidImg) {
    const im = document.createElement("img");
    im.src = lidImg.src;
    im.alt = "";
    Object.assign(im.style, { position: "absolute", inset: "0px", width: "100%", height: "100%" });
    lid.appendChild(im);
  }
  // 箱の大きさが変わると帯の高さも変わるので、キャラ絵の四角が動いたらランタンを付け直す
  const sync = () => {
    const p = base();
    lantern.style.transform = `translate(${p.x}px, ${p.y}px)`;
  };
  const cbox = L.root.querySelector<HTMLElement>('[data-char="box"]');
  const mo = typeof MutationObserver === "function" && cbox ? new MutationObserver(sync) : null;
  mo?.observe(cbox!, { attributes: true, attributeFilter: ["style"] });
  const flicker = () =>
    m.play(glow, [{ opacity: 0.55 }, { opacity: 0.95, offset: 0.3 }, { opacity: 0.7, offset: 0.55 }, { opacity: 1, offset: 0.8 }, { opacity: 0.6 }], {
      duration: 1400, iterations: Infinity, easing: "ease-in-out",
    });

  /** おばけを出す（下から飛び出して、行き過ぎて戻る）。`boo` なら「ばあ！」の顔と手 */
  const jumpOut = (boo: boolean, ms = 420) => {
    m.play(gPos, [
      { transform: gAt(HIDE), easing: EASE.up },
      { transform: gAt(OUT + lh * 0.1), offset: 0.6, easing: EASE.inOut },
      { transform: gAt(OUT) },
    ], { duration: ms, fill: "forwards" });
    m.play(gPose, [
      { transform: "scale(0.7, 1.25)" },
      { transform: "scale(1.15, 0.9)", offset: 0.65 },
      { transform: "scale(1, 1)" },
    ], { duration: ms, easing: "ease-out" });
    if (boo) {
      g.swap("face", "boo");
      m.play(g.part("hand_l"), [{ transform: "rotate(0deg)" }, { transform: "rotate(40deg)", offset: 0.35 }, { transform: "rotate(30deg)" }], { duration: ms, fill: "forwards" });
      m.play(g.part("hand_r"), [{ transform: "rotate(0deg)" }, { transform: "rotate(-40deg)", offset: 0.35 }, { transform: "rotate(-30deg)" }], { duration: ms, fill: "forwards" });
      const p = base();
      for (let i = 0; i < 4; i++) sparkle(m, L.top, p.x + (Math.random() - 0.3) * lw, p.y - OUT - Y(GHOST_H) * Math.random(), X(0.06), 80 + i * 60);
    }
  };
  const handsDown = (ms = 300) => {
    m.play(g.part("hand_l"), [{ transform: "rotate(30deg)" }, { transform: "rotate(0deg)" }], { duration: ms, fill: "forwards" });
    m.play(g.part("hand_r"), [{ transform: "rotate(-30deg)" }, { transform: "rotate(0deg)" }], { duration: ms, fill: "forwards" });
  };

  let stayTimer = 0;
  const on: Partial<Record<TimedCue["do"], (c: TimedCue) => void>> = {
    // ランタンが角にぽんっと出る
    lanternIn: (c) => {
      const ms = (c.dur ?? 0.3) * 1000;
      m.play(pop, [
        { transform: "scale(0.2, 0.2)", easing: EASE.out },
        { transform: "scale(1.15, 0.88)", offset: 0.55, easing: EASE.inOut },
        { transform: "scale(0.96, 1.04)", offset: 0.8 },
        { transform: "scale(1, 1)" },
      ], { duration: ms, fill: "forwards" });
      flicker();
    },
    // ふたがガタガタ
    lidRattle: (c) => {
      const ms = (c.dur ?? 0.3) * 1000;
      m.play(lid, [
        { transform: "translateY(0px) rotate(0deg)" },
        { transform: `translateY(${-lh * 0.06}px) rotate(-7deg)`, offset: 0.2 },
        { transform: "translateY(0px) rotate(3deg)", offset: 0.4 },
        { transform: `translateY(${-lh * 0.08}px) rotate(8deg)`, offset: 0.6 },
        { transform: "translateY(0px) rotate(-2deg)", offset: 0.8 },
        { transform: "translateY(0px) rotate(0deg)" },
      ], { duration: ms });
    },
    // ふたが跳ね飛んでランタンの右に落ち、おばけが「ばあ！」
    boo: () => {
      const ms = 560;
      m.play(lid, [
        { transform: "translate(0px, 0px) rotate(0deg)", easing: EASE.up },
        { transform: `translate(${lw * 0.35}px, ${-lh * 0.55}px) rotate(70deg)`, offset: 0.45, easing: EASE.down },
        { transform: `translate(${lw * 0.72}px, ${lh * 0.72}px) rotate(160deg)`, offset: 0.85, easing: EASE.out },
        { transform: `translate(${lw * 0.72}px, ${lh * 0.66}px) rotate(152deg)` },
      ], { duration: ms, fill: "forwards" });
      jumpOut(true);
    },
    // 落ち着いて、にっこり
    settle: () => {
      g.swap("face", "smile");
      handsDown();
    },
    stay: () => {
      m.play(gBob, [
        { transform: "translateY(0px) rotate(-3deg)" },
        { transform: `translateY(${-Y(0.008)}px) rotate(3deg)`, offset: 0.5 },
        { transform: "translateY(0px) rotate(-3deg)" },
      ], { duration: 2200, iterations: Infinity, easing: "ease-in-out" });
      const tricks = [peekaboo, twirl, surprised];
      let last = -1;
      const next = () => {
        stayTimer = m.after(range(Math.random, 5000, 8000), () => {
          let i = Math.floor(Math.random() * tricks.length);
          if (i === last) i = (i + 1) % tricks.length;
          last = i;
          tricks[i]();
          next();
        });
      };
      next();
    },
    // 締め: 手を振ってランタンに戻り、ふたが閉まる。こうもりが帯を横切る
    finale: (c) => {
      const ms = (c.dur ?? 2.6) * 1000;
      if (stayTimer) m.clear(stayTimer);
      g.swap("face", "smile");
      m.play(g.part("hand_r"), [{ transform: "rotate(0deg)" }, { transform: "rotate(-35deg)" }, { transform: "rotate(-10deg)" }, { transform: "rotate(-35deg)" }, { transform: "rotate(0deg)" }], {
        duration: 900, easing: "ease-in-out",
      });
      m.after(950, () => {
        m.play(gPos, [{ transform: gAt(OUT) }, { transform: gAt(OUT + lh * 0.1), offset: 0.25, easing: EASE.down }, { transform: gAt(HIDE) }], {
          duration: 420, fill: "forwards", easing: EASE.in,
        });
        // ふたが戻る（跳ねてランタンの上へ）
        m.play(lid, [
          { transform: `translate(${lw * 0.72}px, ${lh * 0.66}px) rotate(152deg)`, easing: EASE.up },
          { transform: `translate(${lw * 0.3}px, ${-lh * 0.5}px) rotate(40deg)`, offset: 0.5, easing: EASE.down },
          { transform: "translate(0px, 0px) rotate(0deg)" },
        ], { duration: 560, delay: 300, fill: "forwards" });
        m.play(pop, [{ transform: "scale(1, 1)" }, { transform: "scale(1.12, 0.86)", offset: 0.5 }, { transform: "scale(1, 1)" }], { duration: 300, delay: 860 });
      });
      for (let i = 0; i < 2; i++) {
        const bat = makeBat(m, rigs.bat, L.back, X(0.13), 120);
        const y0 = Y(0.03 + Math.random() * 0.08);
        const pts: [number, number][] = [];
        for (let j = 0; j <= 8; j++) pts.push([W * 1.2 - (W * 1.45 * j) / 8, y0 + Math.sin((j / 8) * Math.PI * 2 + i) * X(0.03)]);
        const a = m.play(bat.el, pathFrames(pts, { tilt: 16 }), { duration: 1700, delay: ms * 0.25 + i * 300, fill: "backwards" });
        const rm = () => bat.el.remove();
        if (a) a.finished.then(rm, rm);
        else rm();
      }
    },
  };

  // 小芸（滞在中）。どれもランタンのまわり（帯の中）で終わる
  function peekaboo() {
    g.swap("face", "smile");
    m.play(gPos, [{ transform: gAt(OUT) }, { transform: gAt(HIDE), offset: 1 }], { duration: 300, fill: "forwards", easing: EASE.in });
    m.after(900, () => {
      jumpOut(true, 380);
      m.after(900, () => {
        g.swap("face", "smile");
        handsDown();
      });
    });
  }
  function twirl() {
    m.play(gPose, [{ transform: "rotate(0deg) scale(1)" }, { transform: "rotate(180deg) scale(0.9)", offset: 0.5 }, { transform: "rotate(360deg) scale(1)" }], {
      duration: 700, easing: EASE.inOut,
    });
    const p = base();
    sparkle(m, L.top, p.x + lw * 0.3, p.y - OUT - Y(GHOST_H) * 0.6, X(0.06), 200);
  }
  function surprised() {
    g.swap("face", "surprised");
    m.play(gPose, [{ transform: "translateY(0px) scale(1, 1)" }, { transform: `translateY(${-Y(0.01)}px) scale(0.95, 1.08)`, offset: 0.3 }, { transform: "translateY(0px) scale(1, 1)" }], {
      duration: 420,
    });
    m.after(800, () => g.swap("face", "smile"));
  }

  for (const c of cues) {
    const fn = on[c.do];
    if (fn) m.at(c.t * 1000, () => fn(c));
  }
  return () => mo?.disconnect();
}
