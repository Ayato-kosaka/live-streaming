/**
 * 段5（死神）と段6（ゾンビ）が分け合う道具。振付けそのものは `reaper.ts` / `zombie.ts`。
 *
 * - 絵の展開（decode）は**段の頭で、その段のぶんだけ**（土台 `useSeason` の決まり）。主役のポーズ絵と
 *   仲間の切り絵は、土台の `ensureFor` がアラートの頭で展開し終えている（間に合わなければ台本に乗らない）。
 *   ここの `gate` は念のための二重の確かめで、済むまで箱ごと出さない（欠けた絵を配信に出さない）
 * - 小物（墓石・鬼火・土のかけら）は `items/<仮装>/items.json` と絵。土台（`useSeason`）が段7の小物と
 *   同じく、貯金箱の数秒後に落としておき、その段の投げ銭が来たら展開する（`show.items`）。
 *   ここの `Items` は、展開し終えた組（`season.items`）を振付けから使う窓口
 * - 暗さ・揺れ・稲光の閃光は、画面いっぱいの層の opacity と、演出の層の translate だけ。暗さは箱の縁で
 *   0 に溶かす（`edgeDark`）
 */
import { EASE, type Motion } from "../rig/motion";
import type { LoadedRig } from "../rig/RigView";
import { makeBat, pathFrames, sparkle } from "./fx";
import { div, outerBoxOf, softDark } from "./layers";
import type { LoadedItems } from "./items";
import type { LoadedPoses } from "./poses";
import type { PoseActor } from "./poseActor";

/** 絵1枚の解読を待つ。読めなければ false（壊れた絵の印を出さない） */
export function decoded(im: HTMLImageElement): Promise<boolean> {
  if (typeof im.decode === "function") return im.decode().then(() => im.naturalWidth > 0, () => false);
  if (im.complete) return Promise.resolve(im.naturalWidth > 0);
  return new Promise((res) => {
    im.addEventListener("load", () => res(im.naturalWidth > 0), { once: true });
    im.addEventListener("error", () => res(false), { once: true });
  });
}

/**
 * 箱の中の絵が全部解読できるまで、箱ごと出さない。済んだら出す。全部済んだかを返す。
 * visibility ではなく display で隠す（ポーズ絵は子の img に visibility: visible を直に書いて
 * 切り替えるので、親の visibility: hidden では隠れない）
 */
export function gate(box: HTMLElement): Promise<boolean> {
  box.style.display = "none";
  const imgs = Array.from(box.querySelectorAll("img"));
  return Promise.all(imgs.map(decoded)).then((ok) => {
    const all = ok.every(Boolean);
    if (all) box.style.display = "";
    return all;
  });
}

type Box4 = [number, number, number, number];
export type Item = { img: HTMLImageElement; w: number; h: number; content: Box4 };

/**
 * 小物の絵（`items/<仮装>/`）。土台が展開し終えた組（`season.items`）を受け取る。台本に乗るのは
 * 組が全部展開できたときだけなので、ふつうは全部そろっている。無いものは `get` が null を返し、
 * 振付けはその小物を飛ばす
 */
export class Items {
  private got = new Map<string, Item>();

  constructor(set: LoadedItems | undefined) {
    if (!set || typeof window === "undefined" || typeof window.Image !== "function") return;
    for (const [name, it] of set.items) {
      const im = new window.Image();
      im.alt = "";
      im.draggable = false;
      im.src = it.img.url;
      this.got.set(name, { img: im, w: it.img.width, h: it.img.height, content: it.content });
    }
  }

  /** 使えるなら true（土台が展開し終えているので、待たずに決まる） */
  when(name: string): Promise<boolean> {
    return Promise.resolve(this.got.has(name));
  }

  /** 展開済みの絵（中身の外接矩形は items.json から） */
  get(name: string): Item | null {
    return this.got.get(name) ?? null;
  }

  /**
   * 小物を1つ置く。返す箱の原点が、中身の「下の辺の真ん中」（`at: "bottom"`）か「真ん中」。
   * 中身の幅が `width` px になる大きさ。絵がまだなら null
   */
  place(name: string, parent: HTMLElement, width: number, at: "bottom" | "center" = "bottom"): { box: HTMLDivElement; w: number; h: number } | null {
    const it = this.get(name);
    if (!it) return null;
    const [x0, y0, x1, y1] = it.content;
    const s = width / Math.max(1, x1 - x0);
    const box = div(parent, { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px" });
    const im = it.img.cloneNode() as HTMLImageElement;
    const ax = (x0 + x1) / 2;
    const ay = at === "bottom" ? y1 : (y0 + y1) / 2;
    Object.assign(im.style, {
      position: "absolute",
      left: `${(-ax * s).toFixed(1)}px`,
      top: `${(-ay * s).toFixed(1)}px`,
      width: `${(it.w * s).toFixed(1)}px`,
      height: `${(it.h * s).toFixed(1)}px`,
      userSelect: "none",
      pointerEvents: "none",
    } satisfies Partial<CSSStyleDeclaration>);
    box.appendChild(im);
    return { box, w: (x1 - x0) * s, h: (y1 - y0) * s };
  }
}

const rgbOf = (c: string) => (/rgba?\(([^)]+)\)/.exec(c)?.[1].split(",").slice(0, 3).join(",") ?? "0,0,0").replace(/\s/g, "");
const alphaOf = (c: string) => Number(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/.exec(c)?.[1] ?? 1);

/**
 * 前兆の暗さの層。opacity だけ動かす。**真ん中が濃く、箱の縁へ向かって 0 に溶ける**楕円
 * （`softDark`。`color` は "rgba(r,g,b,a)"）。舞台ではなく箱いっぱいの外の箱に置く。前は真ん中を
 * 空けて縁をいちばん暗くしていたので、画面いっぱいでないウィジェットの形が、配信の上に暗い四角に
 * なって浮いた（オーナーの指摘 2026-10-24）
 */
export function edgeDark(parent: HTMLElement, color: string): HTMLDivElement {
  return div(outerBoxOf(parent), {
    position: "absolute",
    inset: "0px",
    background: softDark(rgbOf(color), alphaOf(color)),
    opacity: "0",
  });
}

/**
 * 主役の奥と手前の小道具の層（霧・墓石・群れ）を、箱の左右の縁で溶かす。霧は箱より横に広く流れる
 * ので、縁でまっすぐ切れて、画面いっぱいでないウィジェットの形が見えた。主役の層は溶かさない
 * （帯の角で待つ主役が薄くならないように）
 */
export function fadeSides(L: { back: HTMLElement; mid: HTMLElement }) {
  const m = "linear-gradient(90deg, rgba(0,0,0,0) 0%, #000 7%, #000 93%, rgba(0,0,0,0) 100%)";
  for (const el of [outerBoxOf(L.back), outerBoxOf(L.mid)]) {
    el.style.setProperty("mask-image", m);
    el.style.setProperty("-webkit-mask-image", m);
  }
}

/** 画面いっぱいの閃光。`peak` まで上げて消す */
export function flashOnce(m: Motion, el: HTMLElement, peak: number, ms: number) {
  m.play(el, [{ opacity: 0 }, { opacity: peak, offset: 0.18 }, { opacity: 0 }], { duration: ms, easing: "ease-out" });
}

/** 演出の層だけを、一撃で揺らす（減衰）。その人の絵と字は揺らさない */
export function jolt(m: Motion, els: HTMLElement[], ms: number, amp: number) {
  const f: Keyframe[] = [];
  const n = 7;
  for (let i = 0; i <= n; i++) {
    const k = 1 - i / n;
    const a = amp * k * k;
    const dx = i === n ? 0 : (i % 2 === 0 ? 1 : -1) * a;
    const dy = i === n ? 0 : (i % 2 === 0 ? -0.6 : 0.5) * a;
    f.push({ transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)` });
  }
  for (const el of els) m.play(el, f, { duration: ms, easing: "linear" });
}

/** 地鳴り。細かく震えて、強まって、収まる */
export function rumble(m: Motion, els: HTMLElement[], ms: number, amp: number) {
  const n = Math.max(8, Math.round(ms / 45));
  const f: Keyframe[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const a = i === 0 || i === n ? 0 : amp * Math.sin(Math.PI * u) * (0.6 + 0.4 * Math.random());
    const dx = (i % 2 === 0 ? 1 : -1) * a;
    const dy = (i % 3 === 0 ? -0.5 : 0.4) * a;
    f.push({ transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)` });
  }
  for (const el of els) m.play(el, f, { duration: ms, easing: "linear" });
}

/**
 * ポーズを切り替える。一瞬つぶして、いちばんつぶれたところで差し替え、弾けて戻る（段4と同じ手触り）。
 * `onSwap` は差し替えた瞬間に呼ぶ（きらめきで継ぎ目を隠す）
 */
export function popPose(m: Motion, a: PoseActor, name: string, ms = 340, hard = 1, onSwap?: () => void) {
  m.play(a.squash, [
    { transform: "scale(1, 1)", easing: EASE.in },
    { transform: `scale(${1 + 0.06 * hard}, ${1 - 0.12 * hard})`, offset: 0.3, easing: EASE.out },
    { transform: `scale(${1 - 0.04 * hard}, ${1 + 0.1 * hard})`, offset: 0.62, easing: EASE.inOut },
    { transform: "scale(1, 1)" },
  ], { duration: ms });
  m.after(ms * 0.3, () => {
    a.show(name);
    onSwap?.();
  });
}

/** 主役の位置（基準点）と倍率 */
export type At = { x: number; y: number; k: number };
export const atTf = (p: At, r = 0) =>
  `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) rotate(${r.toFixed(1)}deg) scale(${p.k.toFixed(4)})`;

/** 2次の曲線で `from` から `to` へ。大きさも一緒に変える。速さに合わせて少し傾ける */
export function arcMove(m: Motion, el: HTMLElement, from: At, to: At, ctrl: [number, number], ms: number, tilt = 10) {
  const N = 18;
  const pts: [number, number][] = [];
  const ks: number[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const u = t * t * (3 - 2 * t);
    pts.push([
      (1 - u) * (1 - u) * from.x + 2 * (1 - u) * u * ctrl[0] + u * u * to.x,
      (1 - u) * (1 - u) * from.y + 2 * (1 - u) * u * ctrl[1] + u * u * to.y,
    ]);
    ks.push(from.k + (to.k - from.k) * u);
  }
  const frames = pathFrames(pts, { tilt });
  frames.forEach((f, i) => (f.transform = `${f.transform} scale(${ks[i].toFixed(4)})`));
  /* 着いたら傾きを戻す。関数の並びはほかのコマと揃える（並びが違うと行列で補間されて、
     着く直前の1コマだけ姿が 15% ふくらんだ） */
  frames[frames.length - 1].transform = `translate(${to.x.toFixed(1)}px, ${to.y.toFixed(1)}px) rotate(0deg) scale(1.000) scale(${to.k.toFixed(4)})`;
  return m.play(el, frames, { duration: ms, fill: "forwards", easing: "linear" });
}

/**
 * 締めのこうもり。上の帯（キャラ絵の四角より上）を左から右へ横切る。奥の層を飛ぶので、
 * キャラ絵の顔の前は通らない（帯の下に出ても、キャラ絵の後ろ）
 */
export function batsAcross(
  m: Motion,
  rig: LoadedRig,
  parent: HTMLElement,
  n: number,
  W: number,
  band: [number, number],
  delayMs: number
) {
  for (let i = 0; i < n; i++) {
    const bat = makeBat(m, rig, parent, W * (0.1 + Math.random() * 0.05), 120);
    const y0 = band[0] + Math.random() * (band[1] - band[0]);
    const pts: [number, number][] = [];
    const sway = W * (0.015 + Math.random() * 0.02);
    for (let j = 0; j <= 8; j++) {
      const k = j / 8;
      pts.push([-W * 0.15 + W * 1.3 * k, y0 + Math.sin(k * Math.PI * 2 + i) * sway]);
    }
    const a = m.play(bat.el, pathFrames(pts, { tilt: 16 }), {
      duration: 1500 + Math.random() * 400,
      delay: delayMs + i * 150 + Math.random() * 90,
      fill: "backwards",
    });
    const rm = () => bat.el.remove();
    if (a) a.finished.then(rm, rm);
    else rm();
  }
}

/** 輪のきらめき（中心から `r` の輪に `n` 個） */
export function sparkRing(m: Motion, parent: HTMLElement, x: number, y: number, r: number, n: number, size: number, colors: string[]) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    sparkle(m, parent, x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8, size, i * 22, colors[i % colors.length]);
  }
}

/**
 * 片づける: 中で回り続けているアニメ（揺らめき・漂い）を止めて、外す。
 * 見えなくなったものの動きを、滞在の何十秒も回し続けない
 */
export function retire(el: HTMLElement) {
  if (typeof el.getAnimations === "function") el.getAnimations({ subtree: true }).forEach((a) => a.cancel());
  el.remove();
}

/** 要素を消して片づける（アニメの終わりで） */
export function fadeOut(m: Motion, el: HTMLElement, ms: number, delay = 0) {
  const v = parseFloat(getComputedStyle(el).opacity);
  const from = Number.isFinite(v) ? v : 1;
  const a = m.play(el, [{ opacity: from }, { opacity: 0 }], { duration: ms, delay, fill: "forwards", easing: EASE.inOut });
  const rm = () => retire(el);
  if (a) a.finished.then(rm, () => {});
  else rm();
}
