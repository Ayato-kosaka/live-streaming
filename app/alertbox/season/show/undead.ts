/**
 * 段5（死神）と段6（ゾンビ）が分け合う道具。振付けそのものは `reaper.ts` / `zombie.ts`。
 *
 * - 絵の解読は**段の頭で、その段のぶんだけ**行う（`gate` / `Items`）。解読が済むまで、その絵の箱は
 *   出さない（display: none）。前兆のあいだに間に合わなかった主役は、済むまで出ない。
 *   欠けた絵・描きかけの絵を配信に出さない
 * - 小物（墓石・鬼火・土のかけら）は `items/<仮装>/items.json` と絵。テーマを開いたときには読まず、
 *   その段が始まったときに読む（ほかの段の日に、使わない絵を抱えない）
 * - 端の暗さ・揺れ・稲光の閃光は、画面いっぱいの層の opacity と、演出の層の translate だけ
 */
import { EASE, type Motion } from "../rig/motion";
import type { LoadedRig } from "../rig/RigView";
import { makeBat, pathFrames, sparkle } from "./fx";
import { div } from "./layers";
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

/** ポーズ絵の置き場（`…/poses/<仮装>`）から、テーマの置き場を出す */
export const themeDirOf = (p: LoadedPoses) => p.base.replace(/\/poses\/[^/]+\/?$/, "");

type Box4 = [number, number, number, number];
export type Item = { img: HTMLImageElement; w: number; h: number; content: Box4 };

/**
 * 小物の絵（`items/<仮装>/`）。作った瞬間に読みに行き、解読まで済んだものから使える。
 * まだ済んでいないもの・読めなかったものは `get` が null を返すので、振付けはその小物を飛ばす
 */
export class Items {
  private got = new Map<string, Item>();
  private waits = new Map<string, Promise<boolean>>();
  private defs: Record<string, { content?: unknown }> = {};

  constructor(dir: string, files: Record<string, string>) {
    if (typeof window === "undefined" || typeof window.Image !== "function") return;
    if (typeof fetch === "function") {
      fetch(`${dir}/items.json`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (j && typeof j.items === "object" && j.items) this.defs = j.items;
        })
        .catch(() => {});
    }
    for (const [name, file] of Object.entries(files)) {
      const im = new window.Image();
      im.alt = "";
      im.draggable = false;
      im.src = `${dir}/${file}`;
      this.waits.set(
        name,
        decoded(im).then((ok) => {
          if (ok) this.got.set(name, { img: im, w: im.naturalWidth, h: im.naturalHeight, content: [0, 0, im.naturalWidth, im.naturalHeight] });
          return ok;
        })
      );
    }
  }

  /** 解読が済んだら true（読めなければ false） */
  when(name: string): Promise<boolean> {
    return this.waits.get(name) ?? Promise.resolve(false);
  }

  /** 解読まで済んだ絵（中身の外接矩形は items.json から。読めていなければ絵の全体） */
  get(name: string): Item | null {
    const it = this.got.get(name);
    if (!it) return null;
    const c = this.defs[name]?.content;
    if (Array.isArray(c) && c.length === 4 && c.every((n) => typeof n === "number")) {
      return { ...it, content: c as Box4 };
    }
    return it;
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

/** 画面の端だけを暗くする層（真ん中は空ける）。opacity だけ動かす */
export function edgeDark(parent: HTMLElement, mid: string, edge: string): HTMLDivElement {
  return div(parent, {
    position: "absolute",
    inset: "0px",
    background: `radial-gradient(ellipse 78% 62% at 50% 46%, rgba(0,0,0,0) 34%, ${mid} 72%, ${edge} 100%)`,
    opacity: "0",
  });
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
  // 着いたら傾きを戻す
  frames[frames.length - 1].transform = atTf(to);
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
