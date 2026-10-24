/**
 * 段2（200〜499円）の振付け: こうもりの子3匹（設計書 v3。前兆なし、登場 1.8 秒）。
 *
 * 2匹が木の札の左右の金具をつかんで、右上から弧を描いて飛んでくる。止まると札が振り子のように
 * 揺れて落ち着き、3匹目が飛んできて札の上にとまる。滞在のあいだは札を吊るしてふわふわ、
 * ときどき3匹目がくるっと宙返り・2匹そろって弾む。締めは札ごと左上へ飛び去る。
 *
 * 札は**字を入れない小物**（字はキャラ絵の上下中央。背景の箱をやめた決めに合わせる）。
 * **その人のキャラ絵は最初から出ている**（段1〜3）ので、こうもりと札は面の上の端の帯
 * （`headroom`。キャラ絵の四角の上）の中だけを飛ぶ。字にも顔にも掛からない。
 *
 * 層（`layers.ts`）: こうもりと札は actor（外の箱を最初から 4 に）、きらめきは top。
 */
import { EASE, range, type Motion } from "../rig/motion";
import type { LoadedRig } from "../rig/RigView";
import type { TimedCue } from "./script";
import { makeBat, partImage, pathFrames, sparkle, type Bat } from "./fx";
import { bandBottomOf, div, type ShowLayers } from "./layers";

export type BatSignRigs = { bat: LoadedRig };

/** 札の幅（面の幅に対する割合） */
const SIGN_W = 0.46;
/** こうもりの翼の幅（面の幅に対する割合） */
const BAT_W = 0.25;

export function runBatSign(m: Motion, L: ShowLayers, rigs: BatSignRigs, cues: TimedCue[], W: number, H: number): () => void {
  const X = (f: number) => f * W;
  const Y = (f: number) => f * H;
  L.frontBox.style.zIndex = "0";
  L.actorBox.style.zIndex = "4";

  const signImg = partImage(rigs.bat, "name_sign");
  const sw = X(SIGN_W);
  const sh = signImg ? (sw * signImg.naturalHeight) / Math.max(1, signImg.naturalWidth) : sw * 0.45;
  const k = signImg ? sw / Math.max(1, signImg.naturalWidth) : 1;
  const pts = rigs.bat.def.itemPoints.name_sign ?? {};
  const ringL: [number, number] = pts.ringL ? [pts.ringL[0] * k, pts.ringL[1] * k] : [sw * 0.15, sh * 0.2];
  const ringR: [number, number] = pts.ringR ? [pts.ringR[0] * k, pts.ringR[1] * k] : [sw * 0.85, sh * 0.2];
  /** 金具の真ん中（札を吊るす点。揺れの中心） */
  const hang: [number, number] = [(ringL[0] + ringR[0]) / 2, (ringL[1] + ringR[1]) / 2];

  /* 隊の箱の基準点 = 金具の真ん中。札の下の辺が帯の下の辺（キャラ絵の四角の上の辺）に来る高さ */
  const home = () => ({ x: X(0.5), y: bandBottomOf(L, W, H) - X(0.006) - (sh - hang[1]) });
  const h0 = home();

  const group = div(L.actor, { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px", willChange: "transform" });
  const bob = div(group, { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px" });
  // 札（金具の真ん中を中心に揺れる）
  const sign = div(bob, {
    position: "absolute",
    left: `${-hang[0]}px`,
    top: `${-hang[1]}px`,
    width: `${sw}px`,
    height: `${sh}px`,
    transformOrigin: `${hang[0]}px ${hang[1]}px`,
  });
  if (signImg) {
    const im = document.createElement("img");
    im.src = signImg.src;
    im.alt = "";
    Object.assign(im.style, { position: "absolute", inset: "0px", width: "100%", height: "100%" });
    sign.appendChild(im);
  }
  /** 金具をつかむ2匹（足元が金具に来るように、体の真ん中を少し上へ） */
  const carriers: Bat[] = [ringL, ringR].map((r, i) => {
    const b = makeBat(m, rigs.bat, sign, X(BAT_W), 150 + i * 12);
    b.el.style.transform = `translate(${r[0]}px, ${r[1] - b.h * 0.32}px)`;
    return b;
  });
  /** 3匹目（札の上にとまる） */
  const third = makeBat(m, rigs.bat, L.actor, X(BAT_W * 0.85), 140);
  const perch = () => {
    const p = home();
    return { x: p.x + X(0.02), y: p.y - third.h * 0.42 };
  };
  third.el.style.opacity = "0";
  const T = (x: number, y: number, r = 0, s = 1) => `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${r.toFixed(1)}deg) scale(${s})`;
  group.style.transform = T(W + X(0.4), -Y(0.08));

  const sync = () => {
    const p = home();
    group.style.transform = T(p.x, p.y);
  };
  const cbox = L.root.querySelector<HTMLElement>('[data-char="box"]');

  let stayTimer = 0;
  let settled = false;
  const mo = typeof MutationObserver === "function" && cbox ? new MutationObserver(() => settled && sync()) : null;
  mo?.observe(cbox!, { attributes: true, attributeFilter: ["style"] });

  const on: Partial<Record<TimedCue["do"], (c: TimedCue) => void>> = {
    // 右上の外から、弧を描いて帯の真ん中へ。止まると札が振り子のように揺れて落ち着く
    batsIn: (c) => {
      const ms = (c.dur ?? 1.4) * 1000;
      const to = home();
      const path: [number, number][] = [];
      const N = 14;
      for (let i = 0; i <= N; i++) {
        const u = 1 - Math.pow(1 - i / N, 2);
        // 帯の中で、少し上にふくらむ弧
        const x = W + X(0.4) + (to.x - W - X(0.4)) * u;
        const y = -Y(0.08) + (to.y + Y(0.08)) * u - Math.sin(u * Math.PI) * Y(0.03);
        path.push([x, Math.min(y, to.y)]);
      }
      m.play(group, pathFrames(path, { tilt: 10 }), { duration: ms, fill: "forwards", easing: "linear" });
      // 札は遅れて振れる（引っぱられて後ろへ → 止まって前へ → 戻る）
      m.play(sign, [
        { transform: "rotate(14deg)" },
        { transform: "rotate(10deg)", offset: 0.75 },
        { transform: "rotate(-12deg)", offset: 0.86, easing: "ease-in-out" },
        { transform: "rotate(7deg)", offset: 0.93, easing: "ease-in-out" },
        { transform: "rotate(-3deg)", offset: 0.97 },
        { transform: "rotate(0deg)" },
      ], { duration: ms + 600, fill: "forwards" });
      m.after(ms, () => {
        settled = true;
        sync();
      });
    },
    // 3匹目が左から飛んできて、札の上にとまる
    perch: (c) => {
      const ms = (c.dur ?? 0.6) * 1000;
      const p = perch();
      third.el.style.opacity = "1";
      const path: [number, number][] = [];
      for (let i = 0; i <= 10; i++) {
        const u = i / 10;
        path.push([-X(0.2) + (p.x + X(0.2)) * u, Y(0.02) + (p.y - Y(0.02)) * u - Math.sin(u * Math.PI) * Y(0.03)]);
      }
      m.play(third.el, pathFrames(path, { tilt: 12 }), { duration: ms, fill: "forwards", easing: EASE.out });
      m.after(ms, () => {
        m.play(third.el, [
          { transform: T(p.x, p.y, 0, 1) },
          { transform: `${T(p.x, p.y + third.h * 0.08)} scale(1.1, 0.85)`, offset: 0.4 },
          { transform: T(p.x, p.y, 0, 1) },
        ], { duration: 280, fill: "forwards" });
        sparkle(m, L.top, p.x, p.y - third.h * 0.3, X(0.06), 0);
      });
    },
    stay: () => {
      // 札を吊るしたまま、ふわふわ。札もわずかに揺れる
      m.play(bob, [
        { transform: "translateY(0px)" },
        { transform: `translateY(${-Y(0.007)}px)`, offset: 0.5 },
        { transform: "translateY(0px)" },
      ], { duration: 1800, iterations: Infinity, easing: "ease-in-out" });
      m.play(sign, [{ transform: "rotate(-2.5deg)" }, { transform: "rotate(2.5deg)" }], {
        duration: 2400, iterations: Infinity, direction: "alternate", easing: "ease-in-out",
      });
      const tricks = [loop, hopBoth];
      let last = -1;
      const next = () => {
        stayTimer = m.after(range(Math.random, 5500, 8500), () => {
          let i = Math.floor(Math.random() * tricks.length);
          if (i === last) i = (i + 1) % tricks.length;
          last = i;
          tricks[i]();
          next();
        });
      };
      next();
    },
    // 締め: 札ごと左上へ飛び去る。3匹目もついていく
    finale: (c) => {
      const ms = (c.dur ?? 2.6) * 1000;
      if (stayTimer) m.clear(stayTimer);
      settled = false;
      const from = home();
      const go = ms * 0.75;
      const path: [number, number][] = [];
      for (let i = 0; i <= 12; i++) {
        const u = Math.pow(i / 12, 1.6);
        path.push([from.x - (from.x + X(0.6)) * u, from.y - (from.y + Y(0.15)) * u + Math.sin(u * Math.PI) * Y(0.02)]);
      }
      m.play(group, pathFrames(path, { tilt: 10 }), { duration: go, delay: 200, fill: "forwards", easing: "linear" });
      m.play(sign, [{ transform: "rotate(0deg)" }, { transform: "rotate(-14deg)", offset: 0.3 }, { transform: "rotate(-8deg)" }], { duration: go, delay: 200, fill: "forwards" });
      const p = perch();
      const tp: [number, number][] = [];
      for (let i = 0; i <= 10; i++) {
        const u = Math.pow(i / 10, 1.4);
        tp.push([p.x - (p.x + X(0.5)) * u, p.y - (p.y + Y(0.2)) * u - Math.sin(u * Math.PI) * Y(0.04)]);
      }
      m.play(third.el, pathFrames(tp, { tilt: 14 }), { duration: go, fill: "forwards", easing: "linear" });
    },
  };

  // 小芸（滞在中）。どれも帯の中で終わる
  function loop() {
    const p = perch();
    const r = third.h * 0.9;
    const path: [number, number][] = [];
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      path.push([p.x + Math.sin(a) * r, p.y - (1 - Math.cos(a)) * r * 0.6]);
    }
    m.play(third.el, pathFrames(path, { tilt: 25 }), { duration: 900, easing: "ease-in-out", fill: "forwards" });
    sparkle(m, L.top, p.x, p.y - r * 1.2, X(0.06), 450);
  }
  function hopBoth() {
    carriers.forEach((b, i) =>
      m.play(b.rig.root, [
        { transform: "translateY(0px)" },
        { transform: `translateY(${-b.h * 0.18}px)`, offset: 0.4, easing: EASE.down },
        { transform: "translateY(0px)" },
      ], { duration: 520, delay: i * 120 })
    );
  }

  for (const c of cues) {
    const fn = on[c.do];
    if (fn) m.at(c.t * 1000, () => fn(c));
  }
  return () => mo?.disconnect();
}
