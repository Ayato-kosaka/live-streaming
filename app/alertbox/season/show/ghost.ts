/**
 * 段1（〜199円）の振付け: ちびおばけ（2版目。オーナーのレビュー 2026-10-24「しょぼい・距離感が
 * 違和感・画像が不自然に重なって素人臭い。足元・左下にかぼちゃを置いて、2回くらい閉まって開いてで、
 * お化けが右上に飛び出す」）。
 *
 * 面の**左下（キャラ絵の足元の高さ）**に、かぼちゃのランタンがぽんっと出る。ふたが2回カタカタ
 * 持ち上がっては閉まり（中の灯りがもれる。溜め）、3回目に跳ね上がって、ちびおばけが「ばあ！」と
 * 飛び出し、**右上へ弧を描いて**面の上の端の帯へ。ふたはランタンの口に斜めに乗って落ち着く。
 * 滞在のあいだ、おばけは帯の中でふわふわ（くるっと回る・びっくり顔・キャラ絵へ「ばあ！」）。
 * 締めは手を振って右上の外へ飛び去り、ふたが閉まってランタンがしぼむ。
 *
 * 前後: ランタンはキャラ絵の手前（足元）。おばけは口から出るまではランタンの絵の奥（下は切る）、
 * 飛び立ったら**キャラ絵の奥**を通って帯へ（その人の顔の前を通らない）。ふたはいつもランタンの手前。
 *
 * 層（`layers.ts`）: ランタンとふた・出てくるおばけは actor（外の箱を最初から 4 に）、飛び立った
 * おばけは back、きらめきは top。
 */
import { EASE, range, type Motion } from "../rig/motion";
import { buildRig, type LoadedRig } from "../rig/RigView";
import type { TimedCue } from "./script";
import { makeBat, partImage, pathFrames, rigBounds, sparkle } from "./fx";
import { bandBottomOf, div, type ShowLayers } from "./layers";
import { centerOf } from "./common";

export type GhostRigs = { ghost: LoadedRig; bat: LoadedRig };

/** ランタンの幅（面の幅に対する割合）と、左の端からの真ん中の位置。下の辺はキャラ絵の足元 */
const LANTERN = { w: 0.34, x: 0.2 };
/** おばけが帯の中で浮く横の位置（面の幅に対する割合。右上） */
const PERCH_X = 0.8;
/** おばけの背丈（面の高さに対する割合） */
const GHOST_H = 0.125;
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

  /* 置き場（ランタンの下の辺の真ん中）。キャラ絵の四角の下の辺 = その人の足元 */
  const base = () => ({ x: X(LANTERN.x), y: centerOf(L, W, H).bottom - X(0.004) });
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
  /** 開いたあとのふた: ランタンの口の右の縁に斜めに乗る（口は空いて、灯りが見える） */
  const LID_AJAR = `translate(${(lw * 0.26).toFixed(1)}px, ${(-lh * 0.05).toFixed(1)}px) rotate(24deg)`;

  // ---------------------------------------------------------------- 飛び立ったおばけの置き場（キャラ絵の奥）
  const sky = div(L.back, { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px" });
  /** 帯の中の浮く所（足元。おばけの絵の原点は足元） */
  const perch = () => ({ x: X(PERCH_X), y: bandBottomOf(L, W, H) - X(0.012) });
  let flown = false;
  let settled = false;

  // 箱の大きさが変わるとキャラ絵の四角も動くので、ランタンとおばけを付け直す
  const sync = () => {
    const p = base();
    lantern.style.transform = `translate(${p.x}px, ${p.y}px)`;
    if (flown && settled) {
      const q = perch();
      gPos.style.transform = `translate(${q.x.toFixed(1)}px, ${q.y.toFixed(1)}px)`;
    }
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
    /* ふたがカタカタ持ち上がって、すぐ閉まる（中の灯りがもれる）。2回やって溜める。閉まるたびに
       ランタンがつぶれて弾む */
    lidRattle: (c) => {
      const ms = (c.dur ?? 0.3) * 1000;
      m.play(lid, [
        { transform: "translateY(0px) rotate(0deg)", easing: EASE.up },
        { transform: `translateY(${-lh * 0.28}px) rotate(-12deg)`, offset: 0.35, easing: EASE.down },
        { transform: `translateY(${-lh * 0.2}px) rotate(9deg)`, offset: 0.55, easing: EASE.down },
        { transform: "translateY(0px) rotate(0deg)" },
      ], { duration: ms });
      // 持ち上がったすき間から灯りがもれる
      const peek = div(pop, {
        position: "absolute",
        left: `${-lw * 0.3}px`,
        top: `${-lh * 1.25}px`,
        width: `${lw * 0.6}px`,
        height: `${lh * 0.5}px`,
        borderRadius: "50%",
        background: "radial-gradient(ellipse, rgba(255,226,120,0.85) 0%, rgba(255,170,60,0.35) 45%, rgba(255,150,40,0) 72%)",
        opacity: "0",
      });
      pop.insertBefore(peek, lid);
      const pa = m.play(peek, [{ opacity: 0 }, { opacity: 1, offset: 0.4 }, { opacity: 0 }], { duration: ms });
      const rmp = () => peek.remove();
      if (pa) pa.finished.then(rmp, rmp);
      else rmp();
      m.play(pop, [
        { transform: "scale(1, 1)" },
        { transform: "scale(0.97, 1.05)", offset: 0.35 },
        { transform: "scale(1.08, 0.9)", offset: 0.85 },
        { transform: "scale(1, 1)" },
      ], { duration: ms });
    },
    // 3回目: ふたが高く跳ね上がり、おばけが「ばあ！」と飛び出す。ふたは口の縁に斜めに落ちて乗る
    boo: () => {
      const ms = 640;
      m.play(lid, [
        { transform: "translate(0px, 0px) rotate(0deg)", easing: EASE.up },
        { transform: `translate(${lw * 0.12}px, ${-lh * 1.0}px) rotate(-30deg)`, offset: 0.4, easing: EASE.down },
        { transform: `translate(${lw * 0.24}px, ${-lh * 0.02}px) rotate(30deg)`, offset: 0.82, easing: EASE.out },
        { transform: LID_AJAR },
      ], { duration: ms, fill: "forwards" });
      jumpOut(true);
    },
    /* 口から出たおばけが、右上へ弧を描いて帯へ飛ぶ。飛び立ったらキャラ絵の奥（その人の顔の前を
       通らない）。着いたらにっこり */
    settle: (c) => {
      const ms = (c.dur ?? 0.9) * 1000;
      const p = base();
      const from = { x: p.x, y: p.y - OUT };
      gPos.getAnimations().forEach((a) => a.cancel());
      sky.appendChild(gPos);
      Object.assign(gPos.style, { left: "0px", top: "0px", transform: `translate(${from.x.toFixed(1)}px, ${from.y.toFixed(1)}px)` });
      flown = true;
      const to = perch();
      const ctrl = [X(0.3), Math.min(to.y, from.y) - Y(0.12)];
      const pts: [number, number][] = [];
      for (let i = 0; i <= 16; i++) {
        const u = i / 16;
        pts.push([
          (1 - u) * (1 - u) * from.x + 2 * (1 - u) * u * ctrl[0] + u * u * to.x,
          (1 - u) * (1 - u) * from.y + 2 * (1 - u) * u * ctrl[1] + u * u * to.y,
        ]);
      }
      m.play(gPos, pathFrames(pts, { tilt: 14 }), { duration: ms, fill: "forwards", easing: "cubic-bezier(0.3, 0.1, 0.3, 1)" });
      for (let i = 0; i < 6; i++) {
        const u = (i + 1) / 7;
        const [x, y] = pts[Math.round(u * 16)];
        sparkle(m, L.back, x, y, X(0.05), u * ms, i % 2 ? "214,170,255" : undefined);
      }
      m.after(ms, () => {
        settled = true;
        gPos.style.transform = `translate(${to.x.toFixed(1)}px, ${to.y.toFixed(1)}px)`;
        gPos.getAnimations().forEach((a) => a.cancel());
        g.swap("face", "smile");
        handsDown();
        m.play(gPose, [{ transform: "scale(1.15, 0.85)" }, { transform: "scale(0.95, 1.06)", offset: 0.5 }, { transform: "scale(1, 1)" }], { duration: 360 });
      });
    },
    stay: () => {
      m.play(gBob, [
        { transform: "translateY(0px) rotate(-3deg)" },
        { transform: `translateY(${-Y(0.008)}px) rotate(3deg)`, offset: 0.5 },
        { transform: "translateY(0px) rotate(-3deg)" },
      ], { duration: 2200, iterations: Infinity, easing: "ease-in-out" });
      const tricks = [booAt, twirl, surprised];
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
    // 締め: 手を振って右上の外へ飛び去る。ふたが閉まり、灯りが消えて、ランタンがしぼむ
    finale: (c) => {
      const ms = (c.dur ?? 2.6) * 1000;
      if (stayTimer) m.clear(stayTimer);
      settled = false;
      g.swap("face", "smile");
      m.play(g.part("hand_r"), [{ transform: "rotate(0deg)" }, { transform: "rotate(-35deg)" }, { transform: "rotate(-10deg)" }, { transform: "rotate(-35deg)" }, { transform: "rotate(0deg)" }], {
        duration: 900, easing: "ease-in-out",
      });
      m.after(900, () => {
        const q = perch();
        const pts: [number, number][] = [];
        for (let i = 0; i <= 10; i++) {
          const u = i / 10;
          pts.push([q.x + (W + X(0.2) - q.x) * u * u, q.y - (q.y + Y(0.1)) * u - Math.sin(u * Math.PI) * Y(0.02)]);
        }
        m.play(gPos, pathFrames(pts, { tilt: 12 }), { duration: 700, fill: "forwards", easing: EASE.in });
      });
      m.after(ms * 0.45, () => {
        m.play(lid, [
          { transform: LID_AJAR, easing: EASE.up },
          { transform: `translate(${lw * 0.12}px, ${-lh * 0.35}px) rotate(-8deg)`, offset: 0.5, easing: EASE.down },
          { transform: "translate(0px, 0px) rotate(0deg)" },
        ], { duration: 420, fill: "forwards" });
        glow.getAnimations().forEach((a) => a.cancel());
        m.play(glow, [{ opacity: 0.8 }, { opacity: 0 }], { duration: 400, delay: 420, fill: "forwards" });
        m.play(pop, [
          { transform: "scale(1, 1)" },
          { transform: "scale(1.12, 0.86)", offset: 0.25 },
          { transform: "scale(1, 1)", offset: 0.5 },
          { transform: "scale(0, 0)" },
        ], { duration: 900, delay: 420, fill: "forwards", easing: EASE.in });
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

  // 小芸（滞在中）。どれも帯の中で終わる
  /** キャラ絵のほうへ身を乗り出して「ばあ！」（帯の中で。顔の前までは行かない） */
  function booAt() {
    g.swap("face", "boo");
    m.play(gPose, [
      { transform: "translate(0px, 0px) scale(1)" },
      { transform: `translate(${-X(0.04)}px, ${Y(0.006)}px) scale(1.12)`, offset: 0.3, easing: EASE.out },
      { transform: `translate(${-X(0.04)}px, ${Y(0.006)}px) scale(1.1)`, offset: 0.7 },
      { transform: "translate(0px, 0px) scale(1)" },
    ], { duration: 1100 });
    m.play(g.part("hand_l"), [{ transform: "rotate(0deg)" }, { transform: "rotate(40deg)", offset: 0.3 }, { transform: "rotate(40deg)", offset: 0.7 }, { transform: "rotate(0deg)" }], { duration: 1100 });
    m.play(g.part("hand_r"), [{ transform: "rotate(0deg)" }, { transform: "rotate(-40deg)", offset: 0.3 }, { transform: "rotate(-40deg)", offset: 0.7 }, { transform: "rotate(0deg)" }], { duration: 1100 });
    const q = perch();
    sparkle(m, L.back, q.x - X(0.08), q.y - Y(GHOST_H) * 0.5, X(0.06), 250);
    m.after(1150, () => g.swap("face", "smile"));
  }
  function twirl() {
    m.play(gPose, [{ transform: "rotate(0deg) scale(1)" }, { transform: "rotate(180deg) scale(0.9)", offset: 0.5 }, { transform: "rotate(360deg) scale(1)" }], {
      duration: 700, easing: EASE.inOut,
    });
    const q = perch();
    sparkle(m, L.back, q.x + X(0.06), q.y - Y(GHOST_H) * 0.6, X(0.06), 200);
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
