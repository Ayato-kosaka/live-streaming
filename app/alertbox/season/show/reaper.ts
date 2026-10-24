/**
 * 段5（2,000〜4,999円・橙）の振付け: 死神のあやと（構成 v3）。
 *
 * あやとはポーズ絵（現れる appear・振り抜く swing・待機 idle）を絵ごと動かす（段4と同じ作り）。
 *
 *   前兆 0.8秒: 画面の端が暗くなり、橙の鬼火が四方から集まって渦を巻く
 *   → 足元から霧が湧く → 霧の中から、大鎌をかついだ死神が現れる（鬼火がまわりを回り出す）
 *   → 振り抜く（一瞬つぶして弾ける）＋斬撃の光が画面の幅いっぱいに走る・閃光・一瞬止める
 *   → 斬撃の跡から字が切り出される → 「ドン」 → 笑って大鎌をかつぎ直す
 *   → 上の帯の左の角へ滑って小さくなり、待機の姿に（その人のキャラ絵が出る）
 *   → 滞在: **その人のキャラ絵を呪う**（2版目、オーナーのレビュー）。キャラ絵の後ろに紫の
 *     オーラが残り、鬼火がキャラ絵のまわりを回る。ときどき死神が大鎌を振って呪いの火の玉を送り、
 *     届くとオーラが燃え上がり、キャラ絵がぶるっと震える（顔は隠さない。鬼火もオーラもキャラ絵の後ろ）
 *   → 締め（`curtainCall`）: キャラ絵と字が消える → 死神が真ん中へ戻る → フードをひるがえして霧に消える
 *
 * 段4（魔法使い）より一段リッチに: 前兆（暗さ・鬼火）がある・主役が大きい（面の高さの 4 割強、
 * 霧と斬撃まで入れて面の 6 割）・斬撃の閃光と一瞬の止め・滞在中も鬼火が回る。
 *
 * その人のキャラ絵が出たあとは、死神も鬼火もキャラ絵の顔の前を通らない（オーナーの決まり）:
 * 滞在は上の帯（`headroom`）の中だけ。帯に着いたら主役の層を帯の下の辺で切る。
 *
 * 層（`layers.ts`）: 端の暗さは dark、霧の奥は back、死神は actor、霧の手前は mid、
 * 鬼火（登場）・斬撃・閃光は front、字を切る光・待つあいだの鬼火は top。
 */
import { EASE, range, type Motion } from "../rig/motion";
import type { LoadedRig } from "../rig/RigView";
import type { TimedCue } from "./script";
import { pathFrames, sparkle } from "./fx";
import { bandBottomOf, div, edgeFade, outerBoxOf, plateBoxOf, type ShowLayers } from "./layers";
import type { LoadedPoses } from "./poses";
import type { LoadedItems } from "./items";
import { makePoseActor } from "./poseActor";
import { centerOf, curtainCall, every, stayAura } from "./common";
import {
  Items,
  arcMove,
  atTf,
  batsAcross,
  edgeDark,
  fadeSides,
  fadeOut,
  flashOnce,
  gate,
  jolt,
  popPose,
  sparkRing,
  type At,
} from "./undead";

export type ReaperAssets = { poses: LoadedPoses; bat: LoadedRig; items: LoadedItems | undefined };

/**
 * 現れる姿（appear）の高さの上限。面の高さの 0.44（段4の魔法使いの飛ぶ姿 0.4 より大きい）。
 * 字のブロックの上に入りきらなければ縮める（`stand`）。霧と斬撃まで入れて面の 6 割に広がる
 */
const BIG_H = 0.44;
/**
 * 足元の置き場の上下の限り（面に対する割合）。実際の足元は字のブロックの上端のすぐ上（`stand`）。
 * 上は面の上の端から 3% を空ける
 */
const FEET = { min: 0.4, max: 0.62, top: 0.01 };
/**
 * 現れる姿に対して、いちばん背が高くなるときの倍率。振り抜く姿は 1.06 倍の背があり、振る瞬間に
 * さらに縦へ伸びる。この背でも頭と大鎌が面の上の端から出ないように、現れる姿の大きさを決める
 */
const TALLEST = 1.14;
/** 鬼火が集まって渦を巻く輪の半径（面の幅に対する割合）。輪の中心は死神の胸（現れる所） */
const GATHER_R = 0.1;
/** 鬼火が四方から来る所 */
const FROM: [number, number][] = [
  [-0.12, 0.06], [1.12, 0.12], [-0.14, 0.5], [1.14, 0.46], [0.16, 1.06], [0.86, 1.06],
];
/** 登場のあいだ鬼火が回る楕円（死神の腰の高さ）。半径・傾き（度）と1周の ms */
const ORBIT = { rx: 0.4, ry: 0.07, tilt: -7, ms: 3200 };
const WISP_W = 0.075;
/** 待つときの高さ（面の高さに対する割合）と、左の端からのすき間 */
const STAY_H = 0.17;
/** 帯の中でポーズを替えるときの弾みの強さ（強いと、伸びた頭が面の上の端で切れる） */
const STAY_POP = 0.5;
const STAY_LEFT = 0.05;
/**
 * 呪い（滞在）: キャラ絵のまわりを回る鬼火の楕円（横の半径はキャラ絵の四角の幅に対する割合、
 * 縦は面の高さに対する割合）と1周の ms、鬼火の幅（面の幅に対する割合）。どれもキャラ絵の後ろ
 */
const CURSE_ORBIT = { rx: 0.46, ry: 0.06, tilt: -8, ms: 6400 };
const CURSE_WISP_W = 0.06;
/** 呪いのオーラ（キャラ絵の後ろに残る紫の光）の色・半径（面の幅に対する割合）・濃さ */
const CURSE_AURA = { rgb: "150,60,210", r: 0.56, alpha: 0.5 };
/** 振り抜いた姿の、大鎌を握る両手のあいだ（絵の px）。斬撃の弧の中心 */
const HANDS: [number, number] = [620, 590];
const ORANGE = "255,145,0";
const EMBER = "255,200,120";
const LILAC = "222,200,255";

export function runReaper(
  m: Motion,
  L: ShowLayers,
  a: ReaperAssets,
  cues: TimedCue[],
  W: number,
  H: number
): () => void {
  const X = (f: number) => f * W;
  const Y = (f: number) => f * H;
  // 小物（鬼火）は土台が展開し終えている（show.items）
  const items = new Items(a.items);

  // ---------------------------------------------------------------- 端の暗さ・閃光
  fadeSides(L);
  const dark = edgeDark(L.dark, "rgba(10,3,20,0.92)");
  let darkNow = 0;
  const darkTo = (to: number, ms: number) => {
    m.play(dark, [{ opacity: darkNow }, { opacity: to }], { duration: ms, easing: EASE.inOut, fill: "forwards" });
    darkNow = to;
  };
  // 閃光も箱の縁で 0 に溶かす（縁まで光ると、ウィジェットの四角が浮く）
  const flash = div(outerBoxOf(L.front), {
    position: "absolute",
    inset: "0px",
    background: edgeFade([[0, "rgba(255,246,230,1)"], [45, "rgba(255,180,90,0.85)"], [80, "rgba(255,120,20,0.35)"], [100, "rgba(255,120,20,0)"]], "50% 42%"),
    opacity: "0",
  });

  // ---------------------------------------------------------------- 立つ所
  /* 字（名前・額。キャラ絵の上下中央）が出る瞬間に、死神は顔も体も字のブロックより上にいる
     （オーナーの決まり: 主役を字で隠さない。字が腰〜脚に乗っていたのを直した）。足元を字の
     ブロックの上端のすぐ上に置き、入りきらなければ縮める。字のブロックは長い名前・3行の
     メッセージで背が伸びるので、ここで測る（札の置き場は振付けより先に組まれている） */
  const pb0 = plateBoxOf(L, W, H);
  const feetY = Math.max(Y(FEET.min), Math.min(Y(FEET.max), pb0.t - X(0.015)));
  /* 横の位置は、字とその人のキャラ絵の真ん中にそろえる（2版目の決まり。ずれが気になると言われた） */
  const center = centerOf(L, W, H);
  const stand: At = { x: center.x, y: feetY, k: Math.min(1, (feetY - Y(FEET.top)) / (Y(BIG_H) * TALLEST)) };
  /** 現れる姿の高さ（舞台の px） */
  const standH = Y(BIG_H) * stand.k;

  // ---------------------------------------------------------------- 死神（解読が済むまで出さない）
  const gateBox = div(L.actor, { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px" });
  const actor = makePoseActor(gateBox, a.poses, { ref: "appear", height: Y(BIG_H), anchor: "feet" });
  gate(gateBox);
  let now: At = { ...stand };
  actor.pos.style.opacity = "0";
  actor.pos.style.transform = atTf(now);
  /** いまの姿の、絵の中の点（絵の px）が舞台のどこか */
  const pt = (name: string, p: [number, number]) => {
    const [dx, dy] = actor.offset(name, p);
    return { x: now.x + dx * now.k, y: now.y + dy * now.k };
  };
  const pop = (name: string, ms = 340, hard = 1) =>
    popPose(m, actor, name, ms, hard, () => {
      const c = pt(name, [500, 600]);
      sparkRing(m, L.top, c.x, c.y, X(0.14) * now.k, 6, X(0.08) * Math.max(0.5, now.k), [ORANGE, EMBER, LILAC]);
    });

  // ---------------------------------------------------------------- 鬼火
  type Wisp = { wrap: HTMLDivElement; flick: HTMLDivElement };
  /**
   * 鬼火1つ。原点が火の玉の真ん中。`flickMs` の周期で小さく揺らめく（0 なら揺らめかない）。絵がまだなら null
   */
  const makeWisp = (parent: HTMLElement, w: number, flickMs = 240): Wisp | null => {
    const wrap = div(parent, { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px", willChange: "transform" });
    const flick = div(wrap, { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px", transformOrigin: `0px ${(w * 0.35).toFixed(1)}px` });
    div(flick, {
      position: "absolute",
      left: `${(-w * 0.95).toFixed(1)}px`,
      top: `${(-w * 0.8).toFixed(1)}px`,
      width: `${(w * 1.9).toFixed(1)}px`,
      height: `${(w * 1.9).toFixed(1)}px`,
      borderRadius: "50%",
      background: "radial-gradient(circle, rgba(255,160,50,0.55) 0%, rgba(255,120,20,0.2) 42%, rgba(255,120,20,0) 68%)",
    });
    if (!items.place("wisp", flick, w, "center")) {
      wrap.remove();
      return null;
    }
    if (flickMs > 0) {
      m.play(flick, [
        { transform: "scale(1, 1) rotate(-4deg)" },
        { transform: "scale(0.93, 1.08) rotate(4deg)" },
      ], { duration: flickMs + Math.random() * flickMs * 0.6, iterations: Infinity, direction: "alternate", easing: "ease-in-out" });
    }
    return { wrap, flick };
  };

  /** 傾いた楕円を回る keyframes（原点が楕円の中心）。手前（下の半分）ほど大きく濃く、奥は小さく薄い */
  const orbitFrames = (o: { rx: number; ry: number; tilt: number }, phase: number, n = 24): Keyframe[] => {
    const t = (o.tilt * Math.PI) / 180;
    const out: Keyframe[] = [];
    for (let j = 0; j <= n; j++) {
      const th = (phase + j / n) * Math.PI * 2;
      const x = Math.cos(th) * o.rx;
      const y = Math.sin(th) * o.ry;
      const s = Math.sin(th);
      out.push({
        transform: `translate(${(x * Math.cos(t) - y * Math.sin(t)).toFixed(1)}px, ${(x * Math.sin(t) + y * Math.cos(t)).toFixed(1)}px) scale(${(0.8 + 0.2 * s).toFixed(3)})`,
        opacity: 0.62 + 0.38 * s,
      });
    }
    return out;
  };

  // 登場の鬼火: 集まる輪（ring）の中に置く。輪ごと回して渦にする
  const wispBox = div(L.front, { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px" });
  /** 鬼火が集まる所（死神の胸）と、登場のあいだ回る楕円の中心（腰） */
  const gatherAt = { x: stand.x, y: stand.y - standH * 0.55 };
  const orbitAt = { x: stand.x, y: stand.y - standH * 0.28 };
  const ring = div(wispBox, { position: "absolute", left: `${gatherAt.x.toFixed(1)}px`, top: `${gatherAt.y.toFixed(1)}px`, width: "0px", height: "0px" });
  const SPIN = 220;
  const gathered: { w: Wisp; end: [number, number] }[] = [];

  // ---------------------------------------------------------------- 霧
  const mists: HTMLDivElement[] = [];
  /** 霧の塊。`dy` は足元からの高さ（面の高さに対する割合。上が負） */
  const MIST = [
    { back: true, x: 0.3, dy: -0.045, w: 0.85, h: 0.16 },
    { back: true, x: 0.74, dy: -0.07, w: 0.8, h: 0.15 },
    { back: false, x: 0.5, dy: 0.035, w: 1.0, h: 0.15 },
    { back: false, x: 0.16, dy: 0.065, w: 0.72, h: 0.13 },
    { back: false, x: 0.86, dy: 0.055, w: 0.72, h: 0.13 },
  ];
  /** 霧の塊（放射グラデーションの楕円。ぼかしの filter は使わない）。`alpha` 0 なら色の無い箱 */
  const mistBlob = (parent: HTMLElement, cx: number, cy: number, w: number, h: number, alpha = 0.62) =>
    div(parent, {
      position: "absolute",
      left: `${(cx - w / 2).toFixed(1)}px`,
      top: `${(cy - h / 2).toFixed(1)}px`,
      width: `${w.toFixed(1)}px`,
      height: `${h.toFixed(1)}px`,
      background: alpha
        ? `radial-gradient(ellipse at 50% 50%, rgba(232,220,250,${alpha}) 0%, rgba(206,190,236,${(alpha * 0.6).toFixed(2)}) 38%, rgba(180,160,220,0) 70%)`
        : "none",
      opacity: "0",
    });

  // ---------------------------------------------------------------- 字を切り出す
  const plateEl = () => L.root.querySelector<HTMLElement>('[data-plate="box"]');
  const clip = (open: number) => `inset(-40% ${(100 - open * 106).toFixed(2)}% -40% ${(-open * 6).toFixed(2)}%)`;

  // ---------------------------------------------------------------- 待つあいだの鬼火
  let curseBox: HTMLDivElement | null = null;
  let aura: ReturnType<typeof stayAura> | null = null;
  let stayTimer = 0;
  let stopCurse: (() => void) | null = null;

  /** 鬼火が四方から弧を描いて、輪（ring）の持ち場へ集まる。着いたら輪ごと回って渦になる */
  function gather(ms: number, n: number) {
    for (let i = 0; i < n; i++) {
      const w = makeWisp(ring, X(WISP_W));
      if (!w) continue;
      const th = (i / n) * Math.PI * 2 - Math.PI / 2;
      const end: [number, number] = [Math.cos(th) * X(GATHER_R), Math.sin(th) * X(GATHER_R) * 0.8];
      const f = FROM[i % FROM.length];
      const start: [number, number] = [X(f[0]) - gatherAt.x, Y(f[1]) - gatherAt.y];
      const mx = (start[0] + end[0]) / 2;
      const my = (start[1] + end[1]) / 2;
      const dx = end[0] - start[0];
      const dy = end[1] - start[1];
      const sgn = i % 2 ? 1 : -1;
      const ctrl: [number, number] = [mx - dy * 0.3 * sgn, my + dx * 0.3 * sgn];
      const pts: [number, number][] = [];
      for (let j = 0; j <= 12; j++) {
        const u = j / 12;
        pts.push([
          (1 - u) * (1 - u) * start[0] + 2 * (1 - u) * u * ctrl[0] + u * u * end[0],
          (1 - u) * (1 - u) * start[1] + 2 * (1 - u) * u * ctrl[1] + u * u * end[1],
        ]);
      }
      m.play(w.wrap, pathFrames(pts, { scale: (k) => 0.45 + 0.55 * k, opacity: (k) => Math.min(1, k * 4) }), {
        duration: ms - i * 25,
        delay: i * 25,
        fill: "both",
        easing: "cubic-bezier(0.45, 0, 0.3, 1)",
      });
      gathered.push({ w, end });
    }
    // 着いたら輪ごと回る（渦）
    m.after(ms, () => {
      m.play(ring, [{ transform: "rotate(0deg)" }, { transform: `rotate(${SPIN}deg)` }], { duration: 300, easing: EASE.in, fill: "forwards" });
    });
  }

  const on: Partial<Record<TimedCue["do"], (c: TimedCue) => void>> = {
    // 前兆: 端が暗くなる
    darken: (c) => darkTo(c.to ?? 0.9, (c.dur ?? 0.5) * 1000),

    // 前兆: 鬼火が四方から弧を描いて集まり、輪になって渦を巻く
    wisps: (c) => {
      const ms = (c.dur ?? 0.75) * 1000;
      const n = c.n ?? 6;
      if (items.get("wisp")) {
        gather(ms, n);
        return;
      }
      /* 鬼火の絵の解読が、まだ済んでいない（その日いちばん初めの段5で、読みに行っている途中）。
         済んだら残りの時間で集める。間に合わなければ、この前兆は鬼火なしで進む */
      const end = m.time() + ms;
      items.when("wisp").then((ok) => {
        const left = end - m.time();
        if (ok && left > 250) gather(left, n);
      });
    },

    // 足元から霧が湧いて、横に流れる
    mist: (c) => {
      const ms = (c.dur ?? 0.7) * 1000;
      MIST.forEach((d, i) => {
        // 流す箱は霧の大きさだけ（画面いっぱいの箱を動かさない）
        const outer = mistBlob(d.back ? L.back : L.mid, X(d.x), stand.y + Y(d.dy), X(d.w), Y(d.h), 0);
        outer.style.opacity = "1";
        const blob = mistBlob(outer, X(d.w) / 2, Y(d.h) / 2, X(d.w), Y(d.h));
        m.play(blob, [
          { opacity: 0, transform: `translateY(${Y(0.07).toFixed(1)}px) scale(0.6, 0.5)`, easing: EASE.out },
          { opacity: 1, transform: "translateY(0px) scale(1, 1)" },
        ], { duration: ms, delay: i * 60, fill: "both" });
        const drift = X(0.05 + 0.02 * (i % 2));
        m.play(outer, [{ transform: `translateX(${-drift}px)` }, { transform: `translateX(${drift}px)` }], {
          duration: 2600 + i * 230,
          delay: -Math.random() * 2000,
          iterations: Infinity,
          direction: "alternate",
          easing: "ease-in-out",
        });
        mists.push(outer);
      });
    },

    // 霧の中から、大鎌をかついで現れる。鬼火は輪からはじけて、腰のまわりを回り出す
    appear: (c) => {
      const ms = (c.dur ?? 0.7) * 1000;
      actor.pos.style.opacity = "1";
      m.play(actor.pos, [
        { transform: atTf({ ...now, y: now.y + Y(0.1), k: now.k * 0.9 }), opacity: 0, easing: EASE.out },
        { transform: atTf({ ...now, y: now.y - Y(0.012), k: now.k * 1.02 }), opacity: 1, offset: 0.7, easing: EASE.inOut },
        { transform: atTf(now), opacity: 1 },
      ], { duration: ms });
      m.play(actor.squash, [
        { transform: "scale(0.84, 1.18)", easing: EASE.out },
        { transform: "scale(1.06, 0.94)", offset: 0.75, easing: EASE.inOut },
        { transform: "scale(1, 1)" },
      ], { duration: ms });
      // 足元で霧がふくらむ
      const puff = mistBlob(L.mid, now.x, now.y + Y(0.01), X(0.7), Y(0.1), 0.75);
      const pa = m.play(puff, [
        { opacity: 0, transform: "scale(0.3, 0.4)" },
        { opacity: 1, transform: "scale(1, 1)", offset: 0.35 },
        { opacity: 0, transform: "scale(1.4, 1.2)" },
      ], { duration: ms + 500, easing: "ease-out" });
      const rmp = () => puff.remove();
      if (pa) pa.finished.then(rmp, rmp);
      else rmp();
      // 鬼火: 渦の止まったところから、楕円の上の持ち場へ。そこからずっと回る
      const rot = (SPIN * Math.PI) / 180;
      ring.getAnimations().forEach((x) => x.cancel());
      const off: [number, number] = [orbitAt.x - gatherAt.x, orbitAt.y - gatherAt.y];
      const o = { rx: X(ORBIT.rx), ry: Y(ORBIT.ry) * stand.k, tilt: ORBIT.tilt };
      gathered.forEach(({ w, end }, i) => {
        const sx = end[0] * Math.cos(rot) - end[1] * Math.sin(rot);
        const sy = end[0] * Math.sin(rot) + end[1] * Math.cos(rot);
        const phase = i / Math.max(1, gathered.length);
        const loop = orbitFrames(o, phase).map((f) => ({
          ...f,
          transform: (f.transform as string).replace(/translate\(([-\d.]+)px, ([-\d.]+)px\)/, (_, x, y) => `translate(${(Number(x) + off[0]).toFixed(1)}px, ${(Number(y) + off[1]).toFixed(1)}px)`),
        }));
        const burst = 340;
        m.play(w.wrap, [
          { transform: `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) scale(1)`, opacity: 1 },
          { ...loop[0], offset: 1 },
        ], { duration: burst, easing: EASE.out, fill: "forwards" });
        m.play(w.wrap, loop, { duration: ORBIT.ms, delay: burst, iterations: Infinity, easing: "linear" });
      });
      sparkRing(m, L.front, gatherAt.x, gatherAt.y, X(0.3), 8, X(0.09), [ORANGE, EMBER]);
    },

    // 振り抜く: 一瞬ためて、振り抜いた姿に差し替え、斬撃の光が画面の幅いっぱいに走る。閃光
    slash: () => {
      /* ため（のけぞる）と振り抜き（前へ）。傾きは回さずに skew で付ける（足元の線が動かない。
         回すと絵の下の角が字のブロックの上端に掛かった） */
      m.play(actor.squash, [
        { transform: "skewX(0deg) scale(1, 1)", easing: EASE.in },
        { transform: "skewX(7deg) scale(0.92, 1.06)", offset: 0.3, easing: EASE.out },
        { transform: "skewX(-4deg) scale(1.12, 0.9)", offset: 0.55, easing: EASE.inOut },
        { transform: "skewX(0deg) scale(1, 1)" },
      ], { duration: 340 });
      m.after(100, () => {
        actor.show("swing");
        slashArc();
        flashOnce(m, flash, 0.7, 200);
      });
    },

    shake: (c) => jolt(m, [L.back, L.actor, L.mid], (c.dur ?? 0.22) * 1000, X(0.025)),

    hitstop: (c) => m.hitstop((c.dur ?? 0.07) * 1000),

    // 斬撃の跡から字が切り出される（左から右へ、光の筋が走ったあとに字が出る）
    write: (c) => {
      const ms = (c.dur ?? 0.32) * 1000;
      const el = plateEl();
      if (!el) return;
      const pb = plateBoxOf(L, W, H);
      /* 切り終えたら、切り口を字の外まで大きく開けておく（「ドン」で額が 1.3 倍にふくらんだとき、
         左右の端が切り口に掛かって欠けた。録画で見つけた） */
      m.play(el, [
        { clipPath: clip(0) },
        { clipPath: clip(1), offset: 0.999 },
        { clipPath: "inset(-80% -50% -80% -50%)" },
      ], { duration: ms, fill: "forwards", easing: "cubic-bezier(0.3, 0.6, 0.3, 1)" });
      const y = pb.t + (pb.b - pb.t) * 0.42;
      const line = div(L.top, {
        position: "absolute",
        left: `${(pb.l - X(0.06)).toFixed(1)}px`,
        top: `${(y - X(0.008)).toFixed(1)}px`,
        width: `${(pb.r - pb.l + X(0.12)).toFixed(1)}px`,
        height: `${X(0.016).toFixed(1)}px`,
        borderRadius: `${X(0.008).toFixed(1)}px`,
        background: "linear-gradient(90deg, rgba(255,150,40,0) 0%, rgba(255,214,150,0.9) 55%, #FFFFFF 100%)",
        transformOrigin: "0% 50%",
        opacity: "0",
      });
      const la = m.play(line, [
        { transform: "scaleX(0) scaleY(1)", opacity: 1, easing: EASE.out },
        { transform: "scaleX(1) scaleY(1)", opacity: 1, offset: 0.5 },
        { transform: "scaleX(1) scaleY(2.4)", opacity: 0 },
      ], { duration: ms + 200 });
      const rml = () => line.remove();
      if (la) la.finished.then(rml, rml);
      else rml();
      for (let i = 0; i < 4; i++) {
        sparkle(m, L.top, pb.r + X(0.02), y + (Math.random() - 0.5) * X(0.08), X(0.09), ms * 0.45 + i * 40, i % 2 ? EMBER : ORANGE);
      }
    },

    // 額が止まって「ドン」（字の弾みは RichText）。字の後ろで橙の輪が広がる
    don: () => {
      const pb = plateBoxOf(L, W, H);
      const cx = (pb.l + pb.r) / 2;
      const cy = (pb.t + pb.b) / 2;
      const d = X(0.95);
      const ringEl = div(L.front, {
        position: "absolute",
        left: `${(cx - d / 2).toFixed(1)}px`,
        top: `${(cy - d / 2).toFixed(1)}px`,
        width: `${d.toFixed(1)}px`,
        height: `${d.toFixed(1)}px`,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(255,160,40,0) 50%, rgba(255,196,110,0.9) 60%, rgba(255,140,0,0) 71%)",
        opacity: "0",
      });
      const ra = m.play(ringEl, [
        { opacity: 1, transform: "scale(0.3)", easing: EASE.out },
        { opacity: 0, transform: "scale(1.2)" },
      ], { duration: 560 });
      const rmr = () => ringEl.remove();
      if (ra) ra.finished.then(rmr, rmr);
      else rmr();
      for (let i = 0; i < 6; i++) {
        const left = i % 2 === 0;
        sparkle(m, L.top, left ? pb.l : pb.r, pb.t + (pb.b - pb.t) * Math.random() * 0.7, X(0.1), i * 60, i % 3 ? ORANGE : EMBER);
      }
    },

    // 笑って大鎌をかつぎ直す
    cast: () => pop("appear", 320),

    /* 霧が引き、死神は上の帯の左の角へ滑って小さくなる。着いたら待機の姿に切り替え、字より手前へ。
       キャラ絵が出るのはこの途中（死神は着くまでキャラ絵の後ろ） */
    retreat: (c) => {
      const ms = (c.dur ?? 0.8) * 1000;
      darkTo(0, ms);
      mists.forEach((el) => fadeOut(m, el, ms * 0.75));
      fadeOut(m, wispBox, ms * 0.5);
      const to = staySpot();
      const go = ms * 0.85;
      /* 傾けない（滑り出す瞬間に体を傾けると、足元の角が字のブロックに掛かる）。先に横へ滑ってから
         上がる道にする（上へ弧を描くと、小さくなりきる前に頭が面の上の端から出た） */
      arcMove(m, actor.pos, now, to, [to.x + X(0.04), now.y - Y(0.02)], go, 0);
      m.play(actor.squash, [
        { transform: "scale(1, 1)" },
        { transform: "scale(0.94, 1.08)", offset: 0.4 },
        { transform: "scale(1, 1)" },
      ], { duration: go });
      now = to;
      m.after(go, () => {
        L.actorBox.style.zIndex = "4";
        // 帯の下の辺から下は描かない（キャラ絵の顔の前を、主役も奥の鬼火も通らない）
        L.actor.style.clipPath = `inset(0px 0px ${Math.max(0, H - bandBottomOf(L, W, H)).toFixed(1)}px 0px)`;
        pop("idle", 320, STAY_POP);
      });
    },

    // その人の絵が出る。粒の層をキャラ絵の後ろへ
    reveal: () => {
      L.frontBox.style.zIndex = "0";
      startCurse();
    },

    stay: () => {
      // 呼吸（足元から伸び縮み）
      m.play(actor.bob, [
        { transform: "scale(1, 1)" },
        { transform: "scale(1.012, 1.028)", offset: 0.55 },
        { transform: "scale(1, 1)" },
      ], { duration: 2800, iterations: Infinity, easing: "ease-in-out" });
      // 6〜9秒おきに小芸。続けて同じ芸をしない
      const tricks = [laugh, hop];
      let last = -1;
      const next = () => {
        stayTimer = m.after(range(Math.random, 6000, 9000), () => {
          let i = Math.floor(Math.random() * tricks.length);
          if (i === last) i = (i + 1) % tricks.length;
          last = i;
          tricks[i]();
          next();
        });
      };
      next();
      // 呪い: 6〜9秒おきに、大鎌を振って呪いの火の玉をキャラ絵へ送る（最初は滞在に入ってすぐ）
      stopCurse = every(m, 6000, 9000, () => curse(), 1200);
    },

    /* 締め（curtainCall）: キャラ絵と字が消える → 死神が真ん中へ戻る → フードをひるがえして
       縮みながら回り、霧に消える。呪いの鬼火とオーラはキャラ絵と一緒に消す */
    finale: (cue) => {
      const ms = (cue.dur ?? 2.6) * 1000;
      if (stayTimer) m.clear(stayTimer);
      stopCurse?.();
      actor.bob.getAnimations().forEach((x) => x.cancel());
      batsAcross(m, a.bat, L.back, 6, W, [Y(0.03), Y(0.14)], 200);
      const fadeMs = Math.max(250, ms * 0.24);
      curtainCall(m, L, {
        ms,
        hero: gateBox,
        afterExit: () => {
          aura?.fadeOut(500);
          if (curseBox) fadeOut(m, curseBox, 500);
        },
        toCenter: (moveMs) => {
          // 帯の切り口を外す（真ん中へ戻る）。姿の真ん中がキャラ絵の真ん中に来る大きさ・位置
          L.actor.style.clipPath = "";
          const k = stand.k * 0.85;
          const ap = a.poses.poses.get("appear");
          const midFromFeet = ap ? (ap.bottom[1] - (ap.content[1] + ap.content[3]) / 2) * actor.s0 * k : standH * 0.5;
          const to: At = { x: center.x, y: center.y + midFromFeet, k };
          pop("appear", 300, STAY_POP);
          arcMove(m, actor.pos, now, to, [now.x + X(0.15), now.y + Y(0.15)], moveMs, 0);
          now = to;
        },
      });
      m.after(ms - fadeMs, () => vanish(fadeMs));
    },
  };

  /** 締めの最後: フードをひるがえして、縮みながら回って霧に消える */
  function vanish(ms: number) {
    const idle = a.poses.poses.get("appear");
    // 姿の真ん中の高さ（基準点＝足元から、倍率 1 の px）
    const c = idle ? ((idle.bottom[1] - (idle.content[1] + idle.content[3]) / 2) * actor.s0) : Y(0.2);
    const T = (r: number, s: number) => `translateY(${(-c).toFixed(1)}px) rotateY(${r}deg) scale(${s}) translateY(${c.toFixed(1)}px)`;
    m.play(actor.squash, [
      { transform: T(0, 1), opacity: 1, easing: EASE.in },
      { transform: T(540, 0.8), opacity: 1, offset: 0.55 },
      { transform: T(900, 0.05), opacity: 0 },
    ], { duration: Math.max(ms, 600), fill: "forwards" });
    const cy = now.y - c * now.k;
    const puff = mistBlob(L.top, now.x, cy, X(0.6), Y(0.16), 0.8);
    m.play(puff, [
      { opacity: 0, transform: "scale(0.3)" },
      { opacity: 1, transform: "scale(1)", offset: 0.45 },
      { opacity: 0, transform: "scale(1.25, 1.15)" },
    ], { duration: ms + 300, fill: "both", easing: "ease-out" });
    for (let i = 0; i < 6; i++) sparkle(m, L.top, now.x + (Math.random() - 0.5) * X(0.18), cy + (Math.random() - 0.5) * Y(0.08), X(0.07), i * 70, i % 2 ? LILAC : ORANGE);
  }

  /**
   * 斬撃の光。両手を中心に、左から上を通って右へ、画面の幅いっぱいの三日月。80ms で振り切り
   * （台本はここで一瞬止める）、光の筋が残って揺らめき、火の粉になって外へ散りながら消える。
   * 閃光のあとに橙の残光。合わせて 1.1 秒（0.5 秒では物足りなかった。オーナー側の見立て）
   */
  function slashArc() {
    const hands = pt("swing", HANDS);
    // 弧のてっぺんが面の上の端から出すぎないように（死神は字のブロックより上に立つので、手が高い）
    const R = Math.max(X(0.3), Math.min(X(0.46), hands.y - Y(0.005)));
    const MS = 1100;
    const box = div(L.front, { position: "absolute", left: `${hands.x.toFixed(1)}px`, top: `${hands.y.toFixed(1)}px`, width: "0px", height: "0px", opacity: "0" });
    box.innerHTML = crescentSvg(R);
    const sa = m.play(box, [
      { transform: "rotate(-95deg) scale(0.9)", opacity: 0, easing: EASE.out },
      { transform: "rotate(0deg) scale(1)", opacity: 1, offset: 0.07 },
      { transform: "rotate(1deg) scale(1.005)", opacity: 0.85, offset: 0.25 },
      { transform: "rotate(1.5deg) scale(1.01)", opacity: 1, offset: 0.4 },
      { transform: "rotate(2.5deg) scale(1.02)", opacity: 0.8, offset: 0.58, easing: EASE.in },
      { transform: "rotate(6deg) scale(1.08)", opacity: 0 },
    ], { duration: MS });
    const rm = () => box.remove();
    if (sa) sa.finished.then(rm, rm);
    else rm();
    // 残光（閃光が引いたあと、斬撃のまわりが橙にほんのり光り続けて消える）
    const glowD = R * 2.4;
    const glow = div(L.front, {
      position: "absolute",
      left: `${(hands.x - glowD / 2).toFixed(1)}px`,
      top: `${(hands.y - glowD * 0.62).toFixed(1)}px`,
      width: `${glowD.toFixed(1)}px`,
      height: `${glowD.toFixed(1)}px`,
      borderRadius: "50%",
      background: "radial-gradient(circle, rgba(255,200,120,0.55) 0%, rgba(255,150,40,0.28) 35%, rgba(255,120,20,0) 66%)",
      opacity: "0",
    });
    const ga = m.play(glow, [
      { opacity: 0 },
      { opacity: 1, offset: 0.12 },
      { opacity: 0.7, offset: 0.5 },
      { opacity: 0 },
    ], { duration: MS, easing: "ease-out" });
    const rmg = () => glow.remove();
    if (ga) ga.finished.then(rmg, rmg);
    else rmg();
    // 弧に沿って火の粉。振り切った瞬間にきらめき、光の筋が引くころに外へ散る
    for (let i = 0; i < 7; i++) {
      const ang = ((175 + (i / 6) * 170) * Math.PI) / 180;
      sparkle(m, L.front, hands.x + Math.cos(ang) * R * 0.95, hands.y + Math.sin(ang) * R * 0.95, X(0.1), 60 + i * 24, i % 2 ? EMBER : "255,255,255");
    }
    const N = 16;
    for (let i = 0; i < N; i++) {
      const u = (i + 0.5) / N;
      const ang = ((172 + u * 180) * Math.PI) / 180;
      // 振り終わり（右）ほど太いので、粒も右ほど多く大きく
      const r0 = R * (0.9 + Math.random() * 0.08);
      const out = X(0.05 + Math.random() * 0.08);
      const size = X(0.014 + 0.018 * u + Math.random() * 0.01);
      const x0 = hands.x + Math.cos(ang) * r0;
      const y0 = hands.y + Math.sin(ang) * r0;
      const dot = div(L.front, {
        position: "absolute",
        left: `${(x0 - size / 2).toFixed(1)}px`,
        top: `${(y0 - size / 2).toFixed(1)}px`,
        width: `${size.toFixed(1)}px`,
        height: `${size.toFixed(1)}px`,
        borderRadius: "50%",
        background: `radial-gradient(circle, rgba(255,255,240,1) 0%, rgba(${i % 3 ? ORANGE : EMBER},0.9) 45%, rgba(${ORANGE},0) 72%)`,
        opacity: "0",
      });
      const dx = Math.cos(ang) * out + (Math.random() - 0.5) * X(0.02);
      const dy = Math.sin(ang) * out + Y(0.015);
      const da = m.play(dot, [
        { transform: "translate(0px, 0px) scale(1)", opacity: 1, easing: EASE.out },
        { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(0.3)`, opacity: 0 },
      ], { duration: 520 + Math.random() * 260, delay: MS * 0.45 + Math.random() * 180, fill: "backwards" });
      const rmd = () => dot.remove();
      if (da) da.finished.then(rmd, rmd);
      else rmd();
    }
  }

  /** 待機の場所（足元と倍率）。面の上の左の角。足を帯の下の辺に乗せる */
  function staySpot(): At {
    const idle = a.poses.poses.get("idle") ?? a.poses.poses.get("appear")!;
    const k = Y(STAY_H) / Math.max(1, (idle.content[3] - idle.content[1]) * actor.s0);
    const left = (idle.bottom[0] - idle.content[0]) * actor.s0 * k;
    return { x: X(STAY_LEFT) + left, y: bandBottomOf(L, W, H) - X(0.004), k };
  }

  /**
   * 呪い（滞在のはじめ）: キャラ絵の後ろに紫のオーラを残し、鬼火3つをキャラ絵のまわりで回す。
   * どちらも奥の層（キャラ絵の後ろ）なので、顔の前は通らない。鬼火は3つの箱を回すだけ（揺らめかせない。
   * 滞在は何十秒も続くので軽く）
   */
  function startCurse() {
    const c = centerOf(L, W, H);
    aura = stayAura(m, L.back, c, X(CURSE_AURA.r), CURSE_AURA.rgb, CURSE_AURA.alpha, 300);
    const box = div(L.back, {
      position: "absolute",
      left: `${c.x.toFixed(1)}px`,
      top: `${c.y.toFixed(1)}px`,
      width: "0px",
      height: "0px",
      opacity: "0",
    });
    curseBox = box;
    const o = { rx: c.w * CURSE_ORBIT.rx, ry: Y(CURSE_ORBIT.ry), tilt: CURSE_ORBIT.tilt };
    // 3つ（4つでは滞在の CPU が段7を上回った）
    for (let i = 0; i < 3; i++) {
      const w = makeWisp(box, X(CURSE_WISP_W), 0);
      if (w) m.play(w.wrap, orbitFrames(o, i / 3), { duration: CURSE_ORBIT.ms, iterations: Infinity, easing: "linear" });
    }
    m.play(box, [{ opacity: 0 }, { opacity: 1 }], { duration: 800, delay: 400, fill: "forwards" });
  }

  /**
   * 呪いを掛ける: 死神が大鎌を振り、紫の火の玉が弧を描いてキャラ絵の真ん中へ飛ぶ（奥の層。キャラ絵の
   * 後ろを通る）。届くと紫の輪が広がり、オーラが燃え上がり、鬼火が一瞬速く大きく回り、キャラ絵が
   * ぶるっと震える（キャラ絵の箱を左右に小さく揺らすだけ。顔に何も乗せない）
   */
  function curse() {
    const c = centerOf(L, W, H);
    pop("swing", 260, STAY_POP);
    m.after(900, () => pop("idle", 280, STAY_POP));
    const from = pt("swing", HANDS);
    const fly = 620;
    const d = X(0.12);
    const orb = div(L.back, {
      position: "absolute",
      left: `${(-d / 2).toFixed(1)}px`,
      top: `${(-d / 2).toFixed(1)}px`,
      width: `${d.toFixed(1)}px`,
      height: `${d.toFixed(1)}px`,
      borderRadius: "50%",
      background: "radial-gradient(circle, rgba(255,240,255,1) 0%, rgba(200,120,255,0.9) 30%, rgba(150,60,210,0.45) 55%, rgba(150,60,210,0) 72%)",
      opacity: "0",
    });
    const pts: [number, number][] = [];
    const qx = (from.x + c.x) / 2 + X(0.18);
    const qy = Math.min(from.y, c.y) - Y(0.04);
    for (let j = 0; j <= 10; j++) {
      const u = j / 10;
      pts.push([
        (1 - u) * (1 - u) * from.x + 2 * (1 - u) * u * qx + u * u * c.x,
        (1 - u) * (1 - u) * from.y + 2 * (1 - u) * u * qy + u * u * c.y,
      ]);
    }
    const oa = m.play(orb, pathFrames(pts, { scale: (k) => 0.6 + 0.6 * k, opacity: (k) => (k < 0.9 ? 1 : 0) }), {
      duration: fly,
      delay: 120,
      easing: "cubic-bezier(0.4, 0, 0.6, 1)",
      fill: "backwards",
    });
    const rmo = () => orb.remove();
    if (oa) oa.finished.then(rmo, rmo);
    else rmo();
    m.after(120 + fly, () => {
      // 紫の輪（キャラ絵の後ろ）
      const R = c.w * 0.62;
      const ring = div(L.back, {
        position: "absolute",
        left: `${(c.x - R).toFixed(1)}px`,
        top: `${(c.y - R).toFixed(1)}px`,
        width: `${(2 * R).toFixed(1)}px`,
        height: `${(2 * R).toFixed(1)}px`,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(170,80,240,0) 50%, rgba(200,130,255,0.75) 60%, rgba(150,60,210,0) 71%)",
        opacity: "0",
      });
      const ra = m.play(ring, [
        { opacity: 1, transform: "scale(0.35)", easing: EASE.out },
        { opacity: 0, transform: "scale(1.1)" },
      ], { duration: 700 });
      const rmr = () => ring.remove();
      if (ra) ra.finished.then(rmr, rmr);
      else rmr();
      if (aura) {
        m.play(aura.el, [
          { opacity: 1, transform: "scale(1)" },
          { opacity: 1, transform: "scale(1.18)", offset: 0.25 },
          { opacity: 0.8, transform: "scale(1)" },
        ], { duration: 1100, easing: "ease-out" });
      }
      if (curseBox) {
        m.play(curseBox, [
          { transform: "rotate(0deg) scale(1)" },
          { transform: "rotate(-14deg) scale(1.15)", offset: 0.35 },
          { transform: "rotate(0deg) scale(1)" },
        ], { duration: 1000, easing: "ease-in-out" });
      }
      shudder();
    });
  }

  /** その人のキャラ絵がぶるっと震える（キャラ絵の箱を左右に小さく揺らす。0.5秒） */
  function shudder() {
    const box = L.root.querySelector<HTMLElement>('[data-char="box"]');
    if (!box) return;
    const f: Keyframe[] = [];
    const n = 10;
    for (let i = 0; i <= n; i++) {
      const k = 1 - i / n;
      const a = i === 0 || i === n ? 0 : (i % 2 ? 1 : -1) * 1.2 * k;
      f.push({ transform: `translateX(${a.toFixed(2)}%) rotate(${(a * 0.6).toFixed(2)}deg)` });
    }
    m.play(box, f, { duration: 520, easing: "linear" });
  }

  // 小芸（滞在中）。どれも上の帯の中
  function laugh() {
    pop("appear", 300, STAY_POP);
    m.after(1400, () => pop("idle", 300, STAY_POP));
  }
  function hop() {
    // 帯の中で跳ねる。頭が面の上の端で切れない高さ（上の端まで面の 3% ほどしか空いていない）
    const up = Y(0.012) / Math.max(0.01, now.k);
    m.play(actor.squash, [
      { transform: "translateY(0px) scale(1, 1)", easing: EASE.out },
      { transform: "translateY(0px) scale(1.1, 0.88)", offset: 0.15, easing: EASE.up },
      { transform: `translateY(${-up}px) scale(0.97, 1.03)`, offset: 0.5, easing: EASE.down },
      { transform: "translateY(0px) scale(1.1, 0.9)", offset: 0.82, easing: EASE.out },
      { transform: "translateY(0px) scale(1, 1)" },
    ], { duration: 640 });
  }


  for (const c of cues) {
    const fn = on[c.do];
    if (fn) m.at(c.t * 1000, () => fn(c));
  }
  return () => {};
}

let svgSeq = 0;
/**
 * 斬撃の三日月（SVG。1度描いて、`<svg>` ごと回す。中の図形は動かさない）。原点（両手）を中心に
 * 半径 `R`、左（172°）から上を通って右（352°）まで。振り終わり（右）ほど太く白い
 */
function crescentSvg(R: number): string {
  const id = `rpslash${++svgSeq}`;
  const a0 = 172;
  const a1 = 352;
  const N = 40;
  const band = (T: number) => {
    const outer: string[] = [];
    const inner: string[] = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const a = ((a0 + (a1 - a0) * u) * Math.PI) / 180;
      const t = T * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.04)), 0.6) * (0.2 + 0.8 * u);
      outer.push(`${(R + R * Math.cos(a)).toFixed(1)},${(R + R * Math.sin(a)).toFixed(1)}`);
      inner.push(`${(R + (R - t) * Math.cos(a)).toFixed(1)},${(R + (R - t) * Math.sin(a)).toFixed(1)}`);
    }
    return `M${outer.join(" L")} L${inner.reverse().join(" L")} Z`;
  };
  const D = (2 * R).toFixed(1);
  return `<svg viewBox="0 0 ${D} ${D}" width="${D}" height="${D}" style="position:absolute;left:${(-R).toFixed(1)}px;top:${(-R).toFixed(1)}px;overflow:visible">
<defs>
<linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FF7A00" stop-opacity="0"/><stop offset="0.35" stop-color="#FF8F10" stop-opacity="0.7"/><stop offset="1" stop-color="#FFB040" stop-opacity="1"/></linearGradient>
<linearGradient id="${id}c" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="0.4" stop-color="#FFF1D6" stop-opacity="0.9"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="1"/></linearGradient>
</defs>
<path d="${band(R * 0.34)}" fill="url(#${id}g)"/>
<path d="${band(R * 0.15)}" fill="url(#${id}c)"/>
<path d="${band(R * 0.035)}" fill="#FFFFFF"/>
</svg>`;
}
