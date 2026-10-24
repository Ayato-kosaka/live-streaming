/**
 * 段3（500〜999円）の振付け: かぼちゃ坊や3人組の行進（設計書 v3）。
 *
 * 3人は面の上の端の帯（キャラ絵の四角の上）を、竿の先の小旗を振りながら左から行進してくる。
 * 止まったら3人で「ジャン！」と跳ね、**3人いっしょにお菓子のバケツを頭の上でひっくり返す**。
 * そのあと**1人ずつ2回ずつ**、短い間隔で撒く（2版目。オーナーのレビュー「テンポが遅い。それぞれ
 * 2回ずつくらい。落とす予定のかぼちゃが袋持ってジタバタするとか」）。撒く番の子は、バケツを胸に抱えて
 * **ジタバタ**（足をばたつかせ、体とバケツを揺する）してから、ひっくり返す。
 * 滞在のあいだは帯の上で足踏みと小芸、締めは右へ行進して去る。字（名前・額）は持たない。
 *
 * **その人のキャラ絵は最初から出ている**（段1〜3は主役のあとに出さない）。だから坊やも
 * お菓子も、登場のあいだからキャラ絵の顔の前を通らない（オーナーの決まり）:
 * - 坊やは帯の中だけを歩く（足は帯の下の辺。キャラ絵はその下）
 * - お菓子の粒の層（front）は最初からキャラ絵の後ろ（zIndex 0）に下げる
 * - 締めのこうもりは帯の高さの奥（back）を飛ぶ
 *
 * 層（`layers.ts`）: 坊やは actor（外の箱を最初から 4 に上げる）、お菓子は front の canvas、
 * こうもりは back。
 */
import { EASE, range, type Motion } from "../rig/motion";
import { attachItem, buildRig, type LoadedRig, type RigHandle } from "../rig/RigView";
import { restPivot } from "../rig/rig";
import type { TimedCue } from "./script";
import { Coins, makeBat, pathFrames, rigBounds, sparkle } from "./fx";
import { bandBottomOf, div, type ShowLayers } from "./layers";

export type MarchRigs = { kid: LoadedRig; bat: LoadedRig; bucket?: LoadedRig };

/**
 * 坊やの背丈（部品の外形。舞台の高さに対する割合）。見える背丈は帽子込みで面の高さの 14〜15%、
 * 3人の並びは面の幅の 75% 前後（段3は面の 3 割を使う設計）。上の帯（`headroom` 0.2）に
 * 跳ねる高さまで収まる
 */
const KID_H = 0.15;
/** 行進の1歩（ms） */
const STEP = 260;
/** お菓子のバケツの幅（坊やの幅に対する割合） */
const PAIL_W = 0.44;
/** 1人ずつ撒く番の間隔（ms）と、1回の長さ（掲げる → ジタバタ → ひっくり返す → 下ろす） */
const TURN_GAP = 720;
const TURN_MS = 1150;
/** 3人の並び（面の幅に対する、左端からの位置）と帽子・竿・小旗の色。左から しんがり・まんなか・先頭 */
const TROOP = [
  { at: 0.21, hat: "hat_leaf", pole: "gripL" as const, flag: "#8E44FF" },
  { at: 0.5, hat: "hat_ribbon", pole: null, flag: "" },
  { at: 0.79, hat: "hat_pointy", pole: "grip" as const, flag: "#FF8A1F" },
];

type Kid = {
  /** 立ち位置の箱（隊の箱の中で、札の幅に対する % で置く） */
  spot: HTMLDivElement;
  /** 行進の横の動き（立ち位置からのずれ） */
  pos: HTMLDivElement;
  pose: HTMLDivElement;
  h: RigHandle;
  pole: HTMLImageElement | null;
  /** 竿を持つ腕（左右） */
  poleArm: "arm_l" | "arm_r" | null;
  /** 札の幅に対する立ち位置 */
  at: number;
  /** 胸に抱えるお菓子のバケツ（足元から見た位置の箱。撒く番だけ出す）。顔より下に持つ（顔を隠さない・帯の上で切れない） */
  pail: HTMLDivElement | null;
  pailRig: RigHandle | null;
};

export function runMarch(
  m: Motion,
  L: ShowLayers,
  rigs: MarchRigs,
  cues: TimedCue[],
  W: number,
  H: number
): () => void {
  const X = (f: number) => f * W;
  const Y = (f: number) => f * H;

  // キャラ絵は最初から出ている。粒の層はキャラ絵の後ろ、坊やは字より手前（帯の中なので重ならない）
  L.frontBox.style.zIndex = "0";
  L.actorBox.style.zIndex = "4";

  // ---------------------------------------------------------------- 坊や
  const kb = rigBounds(rigs.kid);
  const s = Y(KID_H) / kb.h;
  const hip = restPivot(rigs.kid.def, "body") ?? [kb.l + kb.w / 2, kb.b];
  const tx = (x: number) => `translateX(${x.toFixed(1)}px)`;

  /* 隊の箱: 帯の下の辺（キャラ絵の四角の上の辺）に、面の幅で置く。坊やの立ち位置は幅に対する %。
     箱の大きさが変わると帯の高さも変わるので、キャラ絵の四角が動いたら隊の箱だけを付け直す */
  const troop = div(L.actor, { position: "absolute", left: "0px", top: "0px", width: `${W}px`, height: "0px" });
  const footY = () => bandBottomOf(L, W, H) - X(0.004);
  const sync = () => {
    troop.style.transform = `translateY(${footY().toFixed(1)}px)`;
  };
  sync();
  const cbox = L.root.querySelector<HTMLElement>('[data-char="box"]');
  const mo = typeof MutationObserver === "function" && cbox ? new MutationObserver(sync) : null;
  mo?.observe(cbox!, { attributes: true, attributeFilter: ["style"] });

  const kids: Kid[] = TROOP.map((t) => {
    const h = buildRig(rigs.kid, s);
    // 帽子は頭より手前、竿は握る手の絵より奥（拳が竿を握って見える）
    attachItem(h, rigs.kid, t.hat, "hatOn", 25);
    const pole = t.pole ? attachItem(h, rigs.kid, "pole", t.pole, 17) : null;
    // 竿の先の小旗（三角の旗。竿と一緒に回る）
    if (pole && t.flag) addFlag(pole, t.flag, t.pole === "gripL" ? -1 : 1);
    const spot = div(troop, { position: "absolute", left: `${t.at * 100}%`, top: "0px", width: "0px", height: "0px" });
    const pos = div(spot, { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px", willChange: "transform" });
    // 姿勢（跳ね・つぶし）は足元を中心に
    const pose = div(pos, { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px" });
    h.root.style.left = `${-hip[0] * s}px`;
    h.root.style.top = `${-kb.b * s}px`;
    pose.appendChild(h.root);
    pos.style.opacity = "0";
    // お菓子のバケツ（頭の上。原点はバケツの底の真ん中）。バンクのマスコットと同じ絵なので、もう読めている
    let pail: HTMLDivElement | null = null;
    let pailRig: RigHandle | null = null;
    if (rigs.bucket) {
      const bb = rigBounds(rigs.bucket);
      const sb = (kb.w * s * PAIL_W) / bb.w;
      pailRig = buildRig(rigs.bucket, sb);
      pailRig.swap("bucket", "full");
      pail = div(pose, {
        position: "absolute",
        left: "0px",
        top: `${-Y(KID_H) * 0.04}px`,
        width: "0px",
        height: "0px",
        opacity: "0",
        // 回すのはバケツの真ん中で（底で回すと、ひっくり返したときに顔へかぶさった）
        transformOrigin: "0px 0px",
      });
      pailRig.root.style.left = `${-(bb.l + bb.w / 2) * sb}px`;
      pailRig.root.style.top = `${-bb.b * sb}px`;
      pail.appendChild(pailRig.root);
    }
    return { spot, pos, pose, h, pole, poleArm: t.pole === "gripL" ? "arm_l" : t.pole === "grip" ? "arm_r" : null, at: t.at, pail, pailRig };
  });
  const pailH = rigs.bucket ? (() => {
    const bb = rigBounds(rigs.bucket!);
    return bb.h * ((kb.w * s * PAIL_W) / bb.w);
  })() : 0;
  /** いまの立ち位置（舞台の px。足元） */
  const where = (k: Kid) => ({ x: W * k.at, y: footY() });

  // ---------------------------------------------------------------- 歩き方
  /** 足踏み（`n` 歩）。脚を交互に振り、体は1歩ごとに弾む。腕は脚と逆に振る */
  const walk = (k: Kid, n: number, step = STEP) => {
    const o = { duration: step, iterations: n, direction: "alternate" as const, easing: "ease-in-out" };
    m.play(k.h.part("leg_l"), [{ transform: "rotate(-22deg)" }, { transform: "rotate(18deg)" }], o);
    m.play(k.h.part("leg_r"), [{ transform: "rotate(18deg)" }, { transform: "rotate(-22deg)" }], o);
    if (k.poleArm !== "arm_l") m.play(k.h.part("arm_l"), [{ transform: "rotate(14deg)" }, { transform: "rotate(-14deg)" }], o);
    if (k.poleArm !== "arm_r") m.play(k.h.part("arm_r"), [{ transform: "rotate(-14deg)" }, { transform: "rotate(14deg)" }], o);
    m.play(k.h.part("head"), [{ transform: "rotate(-3deg)" }, { transform: "rotate(3deg)" }], o);
    m.play(k.pose, [
      { transform: "translateY(0px)", easing: EASE.up },
      { transform: `translateY(${-X(0.012)}px)`, offset: 0.5, easing: EASE.down },
      { transform: "translateY(0px)" },
    ], { duration: step, iterations: n, easing: "linear" });
  };
  /** 跳ねる（足元を中心につぶして伸びて着地）。`hi` は跳ぶ高さ（px） */
  const hop = (k: Kid, hi: number, delay = 0) => {
    m.play(k.pose, [
      { transform: "translateY(0px) scale(1, 1)", easing: EASE.out },
      { transform: "translateY(0px) scale(1.1, 0.88)", offset: 0.14, easing: EASE.up },
      { transform: `translateY(${-hi}px) scale(0.94, 1.08)`, offset: 0.5, easing: EASE.down },
      { transform: "translateY(0px) scale(1.12, 0.86)", offset: 0.82, easing: EASE.out },
      { transform: "translateY(0px) scale(1, 1)" },
    ], { duration: 620, delay });
  };
  /** 竿を振り上げる（竿を持つ腕を外へ上げる） */
  const raisePole = (k: Kid, ms: number, delay = 0) => {
    if (!k.poleArm) return;
    const d = k.poleArm === "arm_r" ? -1 : 1;
    m.play(k.h.part(k.poleArm), [
      { transform: "rotate(0deg)", easing: EASE.out },
      { transform: `rotate(${d * 38}deg)`, offset: 0.35 },
      { transform: `rotate(${d * 38}deg)`, offset: 0.7, easing: EASE.inOut },
      { transform: "rotate(0deg)" },
    ], { duration: ms, delay });
  };

  // ---------------------------------------------------------------- お菓子（キャラ絵の後ろ）
  const candy = new Coins(
    L.canvas,
    W,
    H,
    null,
    () => m.time() / 1000,
    () => {
      const k = L.canvas.getBoundingClientRect().width / W || 1;
      return Math.min(2, k * (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1));
    },
    "candy"
  );

  /**
   * お菓子を撒く番（`delay` ms 後から）。バケツを抱えて → ジタバタ（足をばたつかせ、体とバケツを
   * 揺する）→ 外へひっくり返して撒く（お菓子はキャラ絵の後ろへ降る）→ 空になったバケツをしまう。
   * `jitter` が false なら、ジタバタせずにすぐ撒く（3人いっしょの1回目）
   */
  const dropTurn = (k: Kid, delay: number, jitter = true, n = 12) => {
    const pail = k.pail;
    if (!pail || !k.pailRig) {
      m.after(delay, () => {
        const p = where(k);
        candy.fountain(p.x, p.y - Y(KID_H) * 0.9, n, 0.15, X(0.03), 0, 0.3);
      });
      return;
    }
    const idx = kids.indexOf(k);
    // 外側へ撒く（まんなかの子は、交互に左右）
    const dir = idx === 0 ? -1 : idx === 2 ? 1 : (turnCount++ % 2 ? 1 : -1);
    const shake = jitter ? 560 : 0;
    const tipAt = 180 + shake;
    m.after(delay, () => {
      k.pailRig!.swap("bucket", "full");
      // 撒く側（外）の手元に抱える。回す中心はバケツの真ん中
      pail.style.left = `${dir * kb.w * s * 0.34}px`;
      pail.style.transformOrigin = `0px ${(-pailH / 2).toFixed(1)}px`;
      // 掲げる（ぽんっと出る）。竿を持っていない手を上げる
      m.play(pail, [
        { opacity: 0, transform: "scale(0.3)" },
        { opacity: 1, transform: "scale(1.12)", offset: 0.6 },
        { opacity: 1, transform: "scale(1)" },
      ], { duration: 180, fill: "forwards", easing: EASE.out });
      const arms: ["arm_l" | "arm_r", number][] = [];
      if (k.poleArm !== "arm_l") arms.push(["arm_l", 1]);
      if (k.poleArm !== "arm_r") arms.push(["arm_r", -1]);
      for (const [a, d] of arms) {
        m.play(k.h.part(a), [
          { transform: "rotate(0deg)" },
          { transform: `rotate(${d * 22}deg)`, offset: 0.15 },
          { transform: `rotate(${d * 22}deg)`, offset: 0.85 },
          { transform: "rotate(0deg)" },
        ], { duration: TURN_MS, easing: "ease-in-out" });
      }
      if (jitter) {
        // ジタバタ: 足を速くばたつかせ、体を左右に揺すり、バケツもガサガサ
        const o = { duration: 90, iterations: Math.round(shake / 90), direction: "alternate" as const, delay: 160, easing: "ease-in-out" };
        m.play(k.h.part("leg_l"), [{ transform: "rotate(-28deg)" }, { transform: "rotate(22deg)" }], o);
        m.play(k.h.part("leg_r"), [{ transform: "rotate(22deg)" }, { transform: "rotate(-28deg)" }], o);
        m.play(k.h.part("body"), [{ transform: "rotate(-6deg)" }, { transform: "rotate(6deg)" }], { ...o, duration: 110, iterations: Math.round(shake / 110) });
        m.play(k.pose, [
          { transform: "translateY(0px) scale(1, 1)" },
          { transform: `translateY(${-X(0.012)}px) scale(0.97, 1.04)` },
        ], { ...o, duration: 140, iterations: Math.round(shake / 140) });
        k.h.swap("head", "open");
      }
      // ひっくり返す（外へ傾けて）→ お菓子が噴き出して、キャラ絵の後ろへ降る
      m.play(pail, [
        { transform: "scale(1) rotate(0deg)" },
        ...(jitter ? [
          { transform: "scale(1) rotate(-9deg)", offset: 0.12 },
          { transform: "scale(1) rotate(9deg)", offset: 0.24 },
          { transform: "scale(1) rotate(-9deg)", offset: 0.36 },
          { transform: "scale(1) rotate(8deg)", offset: 0.48 },
        ] : []),
        { transform: "scale(1) rotate(0deg)", offset: tipAt / (tipAt + 420) },
        { transform: `scale(1) rotate(${dir * 95}deg)`, offset: (tipAt + 180) / (tipAt + 420), easing: EASE.out },
        { transform: `scale(1) rotate(${dir * 82}deg)` },
      ], { duration: tipAt + 420, delay: 180, fill: "forwards" });
      m.after(180 + tipAt + 140, () => {
        const p = where(k);
        candy.fountain(p.x + dir * (kb.w * s * 0.34 + pailH * 0.5), p.y - Y(KID_H) * 0.04 - pailH * 0.5, n, 0.18, X(0.03), dir, 0.4);
        k.pailRig!.swap("bucket", "empty");
        k.h.swap("head", "smile");
      });
      // 空のバケツをしまう
      m.after(TURN_MS - 220, () => {
        m.play(pail, [
          { opacity: 1, transform: `scale(1) rotate(${dir * 82}deg)` },
          { opacity: 0, transform: `scale(0.4) rotate(${dir * 30}deg)` },
        ], { duration: 220, fill: "forwards", easing: EASE.in });
      });
    });
  };
  let turnCount = 0;
  /** 撒く番が全部終わる時刻（この時計の ms）。滞在の小芸はそのあとから */
  let roundEnd = 0;

  let stayTimer = 0;
  const on: Partial<Record<TimedCue["do"], (c: TimedCue) => void>> = {
    /* 左から行進してくる。3人とも同じ速さで、最後の 1 割で止まって少し行き過ぎて戻る */
    marchIn: (c) => {
      const ms = (c.dur ?? 1.7) * 1000;
      sync();
      const lead = where(kids[2]);
      const from = -X(0.16);
      const dx = lead.x - from;
      const steps = Math.max(2, Math.round((ms * 0.9) / STEP));
      kids.forEach((k) => {
        k.pos.style.opacity = "1";
        m.play(k.pos, [
          { transform: tx(-dx), easing: "linear" },
          { transform: tx(X(0.014)), offset: 0.9, easing: EASE.out },
          { transform: tx(0) },
        ], { duration: ms, fill: "forwards" });
        walk(k, steps);
        // 止まるとき、のけぞって戻る
        m.play(k.h.part("body"), [
          { transform: "rotate(0deg)" },
          { transform: "rotate(0deg)", offset: 0.88 },
          { transform: "rotate(-7deg)", offset: 0.94, easing: EASE.out },
          { transform: "rotate(0deg)" },
        ], { duration: ms + 220 });
      });
    },

    // 3人で「ジャン！」。竿を振り上げ、まんなかの子は両手を上げて口を開ける、先頭はウインク
    tada: () => {
      kids.forEach((k, i) => hop(k, X(0.05), i * 70));
      raisePole(kids[0], 900, 0);
      raisePole(kids[2], 900, 140);
      const mid = kids[1];
      mid.h.swap("head", "open");
      m.play(mid.h.part("arm_l"), [{ transform: "rotate(0deg)" }, { transform: "rotate(40deg)", offset: 0.4 }, { transform: "rotate(0deg)" }], { duration: 900, easing: EASE.inOut });
      m.play(mid.h.part("arm_r"), [{ transform: "rotate(0deg)" }, { transform: "rotate(-40deg)", offset: 0.4 }, { transform: "rotate(0deg)" }], { duration: 900, easing: EASE.inOut });
      m.after(900, () => mid.h.swap("head", "smile"));
      kids[2].h.swap("head", "wink");
      m.after(700, () => kids[2].h.swap("head", "smile"));
      for (const k of [kids[0], kids[2]]) {
        const p = where(k);
        sparkle(m, L.top, p.x, p.y - Y(KID_H) * 1.25, X(0.07), 120);
      }
    },

    /* 3人いっしょにバケツをひっくり返す → 1人ずつ2回ずつ（左・まんなか・右・左・まんなか・右）、
       前の子が撒き終える前に次の子がジタバタを始める速さで */
    candyBurst: (c) => {
      const n = Math.max(8, Math.round((c.n ?? 34) / 3));
      kids.forEach((k, i) => dropTurn(k, i * 60, false, n));
      const first = TURN_MS - 300;
      for (let r = 0; r < 6; r++) dropTurn(kids[r % 3], first + r * TURN_GAP, true, 10);
      roundEnd = m.time() + first + 5 * TURN_GAP + TURN_MS;
    },

    stay: () => {
      // ずっと: 呼吸（足元から伸び縮み）と帽子のヘタの揺れ。3人で少しずつずらす
      kids.forEach((k, i) => {
        m.play(k.h.loop("body"), [{ transform: "scale(1, 1)" }, { transform: "scale(1.015, 1.03)", offset: 0.55 }, { transform: "scale(1, 1)" }], {
          duration: 2300 + i * 260, iterations: Infinity, easing: "ease-in-out", delay: -i * 500,
        });
        m.play(k.h.loop("hat_stem"), [{ transform: "rotate(-6deg)" }, { transform: "rotate(6deg)" }], {
          duration: 1500 + i * 180, iterations: Infinity, direction: "alternate", easing: "ease-in-out",
        });
        m.play(k.h.loop("head"), [{ transform: "rotate(-2deg)" }, { transform: "rotate(2deg)" }], {
          duration: 1900 + i * 230, iterations: Infinity, direction: "alternate", easing: "ease-in-out", delay: -i * 400,
        });
      });
      // 5〜8秒おきに小芸。だれか1人が、竿を回す・ウインク・足踏み・お菓子を放って受ける
      const tricks = [twirl, wink, stomp, toss];
      let last = -1;
      const next = (first = false) => {
        const wait = range(Math.random, 5000, 8000);
        stayTimer = m.after(first ? Math.max(0, roundEnd - m.time()) + wait * 0.4 : wait, () => {
          let i = Math.floor(Math.random() * tricks.length);
          if (i === last) i = (i + 1) % tricks.length;
          last = i;
          tricks[i]();
          next();
        });
      };
      next(true);
    },

    // 締め: 3人で右へ行進して去る。こうもりが奥を横切る
    finale: (c) => {
      const ms = (c.dur ?? 2.6) * 1000;
      if (stayTimer) m.clear(stayTimer);
      const go = ms * 0.8;
      kids.forEach((k, i) => {
        const delay = (2 - i) * 120;
        const p = where(k);
        m.play(k.pos, [
          { transform: tx(0), easing: EASE.in },
          { transform: tx(X(0.12)), offset: 0.25, easing: "linear" },
          { transform: tx(W + X(0.25) + (2 - i) * X(0.05) - p.x) },
        ], { duration: go, delay, fill: "forwards" });
        walk(k, Math.round(go / STEP), STEP);
      });
      // こうもりは札より上の帯を横切る（奥の層。キャラ絵の後ろなので、顔の前は通らない）
      for (let i = 0; i < 3; i++) {
        const bat = makeBat(m, rigs.bat, L.back, X(0.15), 120);
        const y0 = Y(0.04 + Math.random() * 0.12);
        const pts: [number, number][] = [];
        for (let j = 0; j <= 8; j++) {
          const kk = j / 8;
          pts.push([-X(0.15) + (W * 1.3) * kk, y0 + Math.sin(kk * Math.PI * 2 + i) * X(0.04)]);
        }
        const a = m.play(bat.el, pathFrames(pts, { tilt: 16 }), { duration: 1700, delay: 300 + i * 260, fill: "backwards" });
        const rm = () => bat.el.remove();
        if (a) a.finished.then(rm, rm);
        else rm();
      }
    },
  };

  // 小芸（滞在中）。どれも札の上の縁より上で終わる
  function twirl() {
    const k = Math.random() < 0.5 ? kids[0] : kids[2];
    if (k.pole) m.play(k.pole.parentElement, [{ transform: "rotate(0deg)" }, { transform: `rotate(${k === kids[2] ? 360 : -360}deg)` }], { duration: 760, easing: EASE.inOut });
    const p = where(k);
    sparkle(m, L.top, p.x, p.y - Y(KID_H) * 1.3, X(0.06), 380);
  }
  function wink() {
    const k = kids[Math.floor(Math.random() * 3)];
    k.h.swap("head", "wink");
    m.play(k.h.part("head"), [{ transform: "rotate(0deg)" }, { transform: "rotate(-8deg)", offset: 0.3 }, { transform: "rotate(-8deg)", offset: 0.7 }, { transform: "rotate(0deg)" }], {
      duration: 800, easing: "ease-in-out",
    });
    m.after(560, () => k.h.swap("head", "smile"));
  }
  function stomp() {
    kids.forEach((k, i) => m.after(i * 110, () => walk(k, 4, 240)));
  }
  /** だれか1人が、もう一度バケツを抱えてジタバタして撒く */
  function toss() {
    dropTurn(kids[Math.floor(Math.random() * 3)], 0, true, 8);
  }

  /**
   * 竿の先に三角の小旗を付ける。竿の絵と旗を1つの箱に入れ直し、握る点を中心に一緒に回す
   * （竿を回す小芸で、旗も付いてくる）。`side` は旗のなびく向き（外側）
   */
  function addFlag(pole: HTMLImageElement, color: string, side: number) {
    const host = pole.parentElement;
    if (!host) return;
    const wrap = document.createElement("div");
    Object.assign(wrap.style, {
      position: "absolute",
      left: pole.style.left,
      top: pole.style.top,
      width: pole.style.width,
      height: pole.style.height,
      transformOrigin: pole.style.transformOrigin,
      zIndex: pole.style.zIndex,
    } satisfies Partial<CSSStyleDeclaration>);
    host.insertBefore(wrap, pole);
    wrap.appendChild(pole);
    Object.assign(pole.style, { left: "0px", top: "0px", transformOrigin: "" });
    const w = parseFloat(pole.style.width) || 149;
    const fw = w * 1.9;
    const fh = w * 1.3;
    const flag = document.createElement("div");
    Object.assign(flag.style, {
      position: "absolute",
      left: side > 0 ? `${w * 0.55}px` : `${w * 0.45 - fw}px`,
      top: `${w * 0.55}px`,
      width: `${fw}px`,
      height: `${fh}px`,
      background: `linear-gradient(180deg, ${color}, ${color} 60%, rgba(0,0,0,0.25))`,
      clipPath: side > 0 ? "polygon(0% 0%, 100% 50%, 0% 100%)" : "polygon(100% 0%, 0% 50%, 100% 100%)",
      transformOrigin: side > 0 ? "0% 50%" : "100% 50%",
    } satisfies Partial<CSSStyleDeclaration>);
    wrap.appendChild(flag);
    // 旗はずっと風になびく
    m.play(flag, [{ transform: "skewY(-6deg) scaleX(0.92)" }, { transform: "skewY(6deg) scaleX(1.04)" }], {
      duration: 520 + Math.random() * 120, iterations: Infinity, direction: "alternate", easing: "ease-in-out",
    });
  }

  for (const c of cues) {
    const fn = on[c.do];
    if (fn) m.at(c.t * 1000, () => fn(c));
  }
  return () => {
    mo?.disconnect();
    candy.dispose();
  };
}
