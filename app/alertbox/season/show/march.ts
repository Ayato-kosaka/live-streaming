/**
 * 段3（500〜999円）の振付け: かぼちゃ坊や3人組の行進（設計書 v3）。
 *
 * 3人は名前の札の**上の縁を舞台にして**歩く。先頭の子が札（横断幕）の端を持って
 * 左から行進してきて、歩いたぶんだけ札が巻物のように広がる。止まったら3人で「ジャン！」と
 * 跳ね、まんなかの子がお菓子を放る。滞在のあいだは札の上で足踏みと小芸、締めは右へ行進して去る。
 *
 * **その人のキャラ絵は最初から出ている**（段1〜3は主役のあとに出さない）。だから坊やも
 * お菓子も、登場のあいだからキャラ絵の顔の前を通らない（オーナーの決まり）:
 * - 坊やは札の上の縁より上だけを歩く（足は縁に乗る。キャラ絵は札の下）
 * - お菓子の粒の層（front）は最初からキャラ絵の後ろ（zIndex 0）に下げる
 * - 締めのこうもりも奥（back）を飛ぶ
 *
 * 層（`layers.ts`）: 坊やは actor（外の箱を最初から札より手前の 4 に上げる）、お菓子は front の
 * canvas、こうもりは back。
 */
import { EASE, range, type Motion } from "../rig/motion";
import { attachItem, buildRig, type LoadedRig, type RigHandle } from "../rig/RigView";
import { restPivot } from "../rig/rig";
import type { TimedCue } from "./script";
import { Coins, makeBat, pathFrames, rigBounds, sparkle } from "./fx";
import { div, plateBoxOf, type ShowLayers } from "./layers";

export type MarchRigs = { kid: LoadedRig; bat: LoadedRig };

/**
 * 坊やの背丈（帽子を除く。舞台の高さに対する割合）。札の上の余白（`headroom` 0.2）に、
 * いちばん高い三角帽子と跳ねる高さまで収まる大きさ（帽子込みで 0.155）
 */
const KID_H = 0.12;
/** 行進の1歩（ms） */
const STEP = 260;
/** 3人の並び（札の幅に対する、左端からの位置）と帽子・竿。左から しんがり・まんなか・先頭 */
const TROOP = [
  { at: 0.14, hat: "hat_leaf", pole: "gripL" as const },
  { at: 0.5, hat: "hat_ribbon", pole: null },
  { at: 0.86, hat: "hat_pointy", pole: "grip" as const },
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
  const plateBox = () => plateBoxOf(L, W, H);

  // キャラ絵は最初から出ている。粒の層はキャラ絵の後ろ、坊やは札より手前
  L.frontBox.style.zIndex = "0";
  L.actorBox.style.zIndex = "4";

  // ---------------------------------------------------------------- 坊や
  const kb = rigBounds(rigs.kid);
  const s = Y(KID_H) / kb.h;
  const hip = restPivot(rigs.kid.def, "body") ?? [kb.l + kb.w / 2, kb.b];
  const tx = (x: number) => `translateX(${x.toFixed(1)}px)`;

  /* 隊の箱: 札の上の縁に、札と同じ幅で置く。坊やの立ち位置は札の幅に対する %。
     **札は出たあとも動く**（キャラ絵の中身を測り終えると、札とキャラ絵の組が真ん中へ下がる・
     字の書体が読み終わると札の幅が変わる）ので、札が動いたら隊の箱だけを付け直す */
  const troop = div(L.actor, { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px" });
  const sync = () => {
    const pb = plateBox();
    troop.style.transform = `translate(${pb.l.toFixed(1)}px, ${(pb.t + X(0.006)).toFixed(1)}px)`;
    troop.style.width = `${Math.max(0, pb.r - pb.l).toFixed(1)}px`;
  };
  sync();
  const slot = L.root.querySelector<HTMLElement>('[data-plate="slot"]');
  const box = L.root.querySelector<HTMLElement>('[data-plate="box"]');
  const mo = typeof MutationObserver === "function" && slot ? new MutationObserver(sync) : null;
  mo?.observe(slot!, { attributes: true, attributeFilter: ["style"] });
  const ro = typeof ResizeObserver === "function" && box ? new ResizeObserver(sync) : null;
  ro?.observe(box!);

  const kids: Kid[] = TROOP.map((t) => {
    const h = buildRig(rigs.kid, s);
    // 帽子は頭より手前、竿は握る手の絵より奥（拳が竿を握って見える）
    attachItem(h, rigs.kid, t.hat, "hatOn", 25);
    const pole = t.pole ? attachItem(h, rigs.kid, "pole", t.pole, 17) : null;
    const spot = div(troop, { position: "absolute", left: `${t.at * 100}%`, top: "0px", width: "0px", height: "0px" });
    const pos = div(spot, { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px", willChange: "transform" });
    // 姿勢（跳ね・つぶし）は足元を中心に
    const pose = div(pos, { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px" });
    h.root.style.left = `${-hip[0] * s}px`;
    h.root.style.top = `${-kb.b * s}px`;
    pose.appendChild(h.root);
    pos.style.opacity = "0";
    return { spot, pos, pose, h, pole, poleArm: t.pole === "gripL" ? "arm_l" : t.pole === "grip" ? "arm_r" : null, at: t.at };
  });
  /** いまの立ち位置（舞台の px。足元） */
  const where = (k: Kid) => {
    const pb = plateBox();
    return { x: pb.l + (pb.r - pb.l) * k.at, y: pb.t + X(0.006) };
  };

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

  // ---------------------------------------------------------------- 札を巻物のように広げる
  const plateEl = () => L.root.querySelector<HTMLElement>('[data-plate="box"]');
  // 閉じた形は右を 100% 切る。開いたら左右の影の分（6%）まで見せる
  const clip = (open: number) => `inset(-40% ${(100 - open * 106).toFixed(2)}% -40% ${(-open * 6).toFixed(2)}%)`;

  let stayTimer = 0;
  const on: Partial<Record<TimedCue["do"], (c: TimedCue) => void>> = {
    /* 左から行進してくる。3人とも同じ速さで、最後の 1 割で止まって少し行き過ぎて戻る。
       先頭の子の竿の先が、札の広がる端 */
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
      // 札: 先頭の竿の先（子の中心から幅の 5%）までが広がる。止まったら残りがぱっと開く
      const el = plateEl();
      if (!el) return;
      const pb = plateBox();
      const pw = Math.max(1, pb.r - pb.l);
      const edgeAt = (x: number) => Math.max(0, Math.min(1, (x + X(0.05) - pb.l) / pw));
      // 先頭の竿の先が札の左の端に着く時刻（行進の割合。先頭は 0.9 で lead.x + 0.014 に着く）
      const tIn = Math.max(0, Math.min(0.9, (0.9 * (pb.l - X(0.05) - (lead.x - dx))) / (dx + X(0.014))));
      const open9 = edgeAt(lead.x + X(0.014));
      m.play(el, [
        { clipPath: clip(0), offset: 0 },
        { clipPath: clip(0), offset: tIn * (ms / (ms + 240)) },
        { clipPath: clip(open9), offset: 0.9 * (ms / (ms + 240)), easing: EASE.back },
        { clipPath: clip(1), offset: 1 },
      ], { duration: ms + 240, fill: "forwards", easing: "linear" });
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

    // まんなかの子がお菓子を放る（上へ噴き上げて、札とキャラ絵の後ろへ降る）
    candyBurst: (c) => {
      const p = where(kids[1]);
      candy.fountain(p.x, p.y - Y(KID_H) * 0.8, c.n ?? 34, c.dur ?? 0.3, X(0.06), 0, 0.55);
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
    if (k.pole) m.play(k.pole, [{ transform: "rotate(0deg)" }, { transform: `rotate(${k === kids[2] ? 360 : -360}deg)` }], { duration: 760, easing: EASE.inOut });
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
  function toss() {
    const k = kids[1];
    k.h.swap("head", "open");
    hop(k, X(0.03));
    const p = where(k);
    candy.fountain(p.x, p.y - Y(KID_H) * 0.9, 4, 0.1, X(0.02), 0, 0.12);
    m.after(700, () => k.h.swap("head", "smile"));
  }

  for (const c of cues) {
    const fn = on[c.do];
    if (fn) m.at(c.t * 1000, () => fn(c));
  }
  return () => {
    mo?.disconnect();
    ro?.disconnect();
    candy.dispose();
  };
}
