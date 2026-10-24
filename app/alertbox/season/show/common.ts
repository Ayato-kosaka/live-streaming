/**
 * 1,000円以上の段（段4〜7）に共通の決まり（オーナーのレビュー 2026-10-24、2版目）。
 *
 * 1. **同じ中心**: 魔法陣・オブジェ（古城・墓標…）・あやとの着地の横の位置・字・その人のキャラ絵は、
 *    全部キャラ絵の四角の真ん中（`centerOf`）にそろえる。字は index.tsx がもうキャラ絵の上下中央に
 *    置いているので、振付けはここから位置を取る。キャラ絵がふくらんで出る中心もここ（index.tsx）
 * 2. **オーラとオブジェを残す**: その人のキャラ絵が出たあとも、段の光（`stayAura`）とオブジェを
 *    キャラ絵の**後ろ**（back・mid の層）に残す。顔の前には置かない。滞在中は、あやと側から
 *    キャラ絵へ定期的に働きかける（`every`。星を振りかける・こうもりを飛ばす…）
 * 3. **締め**（`curtainCall`）: その人のキャラ絵と字が先に消え → あやとが面の真ん中（前面）へ戻り →
 *    あやとが消える。キャラ絵が出ているあいだにあやとを前へ出すと、その人の顔に掛かる
 *
 * どれも transform と opacity だけを動かす（合成のスレッドで回る）。
 */
import { EASE, range, type Motion } from "../rig/motion";
import { div, edgeFade, type ShowLayers } from "./layers";

export type Center = {
  /** キャラ絵の四角の真ん中（舞台の px） */
  x: number;
  y: number;
  /** キャラ絵の四角の上の辺・下の辺・幅（舞台の px） */
  top: number;
  bottom: number;
  w: number;
};

/**
 * その人のキャラ絵の四角の真ん中（舞台の px）。ふくらんで出てくる途中でも、置き場の位置を返す
 * （transform を含まない offset で測る）。字のブロックの真ん中もここ（index.tsx の textCenterY）
 */
export function centerOf(L: ShowLayers, W: number, H: number): Center {
  const el = L.root.querySelector<HTMLElement>('[data-char="box"]');
  const sr = L.dark.getBoundingClientRect();
  const k = sr.width / W || 1;
  if (!el) return { x: W / 2, y: H * 0.6, top: H * 0.2, bottom: H * 0.98, w: W };
  const parent = el.offsetParent as HTMLElement | null;
  const pr = parent ? parent.getBoundingClientRect() : { left: 0, top: 0 };
  const left = (pr.left + el.offsetLeft - sr.left) / k;
  const top = (pr.top + el.offsetTop - sr.top) / k;
  const w = el.offsetWidth / k;
  const h = el.offsetHeight / k;
  return { x: left + w / 2, y: top + h / 2, top, bottom: top + h, w };
}

/**
 * 段の光をキャラ絵の後ろに残す（中心はキャラ絵の真ん中。縁で溶ける円）。ゆっくり息をする。
 * 置くのは `parent`（ふつうは L.back。キャラ絵より奥）。`fadeOut` で消す
 */
export function stayAura(
  m: Motion,
  parent: HTMLElement,
  c: { x: number; y: number },
  r: number,
  rgb: string,
  alpha = 0.55,
  delayMs = 0
): { el: HTMLDivElement; fadeOut(ms: number): void } {
  const el = div(parent, {
    position: "absolute",
    left: `${(c.x - r).toFixed(1)}px`,
    top: `${(c.y - r).toFixed(1)}px`,
    width: `${(r * 2).toFixed(1)}px`,
    height: `${(r * 2).toFixed(1)}px`,
    borderRadius: "50%",
    background: edgeFade([[0, `rgba(${rgb},${alpha})`], [45, `rgba(${rgb},${(alpha * 0.55).toFixed(3)})`], [75, `rgba(${rgb},${(alpha * 0.18).toFixed(3)})`], [100, `rgba(${rgb},0)`]], "50% 50%"),
    opacity: "0",
    willChange: "opacity, transform",
  });
  m.play(el, [{ opacity: 0, transform: "scale(0.6)" }, { opacity: 1, transform: "scale(1)" }], { duration: 700, delay: delayMs, fill: "forwards", easing: EASE.out });
  let breath: Animation | null = null;
  m.after(delayMs + 700, () => {
    breath = m.play(el, [
      { opacity: 1, transform: "scale(1)" },
      { opacity: 0.65, transform: "scale(0.94)", offset: 0.5 },
      { opacity: 1, transform: "scale(1)" },
    ], { duration: 3200, iterations: Infinity, easing: "ease-in-out" });
  });
  return {
    el,
    fadeOut(ms) {
      breath?.cancel();
      m.play(el, [{ opacity: Number(getComputedStyle(el).opacity) || 1 }, { opacity: 0 }], { duration: ms, fill: "forwards" });
    },
  };
}

/**
 * 滞在中、`min`〜`max` ms おきに `fn` を呼ぶ（交流・小芸）。最初の1回は `first` ms 後（無ければ同じ幅）。
 * 止める関数を返す（締めの前に止める）
 */
export function every(m: Motion, min: number, max: number, fn: (i: number) => void, first?: number): () => void {
  let id = 0;
  let i = 0;
  let stopped = false;
  const next = (ms: number) => {
    id = m.after(ms, () => {
      if (stopped) return;
      fn(i++);
      next(range(Math.random, min, max));
    });
  };
  next(first ?? range(Math.random, min, max));
  return () => {
    stopped = true;
    if (id) m.clear(id);
  };
}

/** 締めでキャラ絵と字を消す（`ms` かけて）。index.tsx の要素を、アニメ（WAAPI）で薄くするだけ */
export function viewerExit(m: Motion, L: ShowLayers, ms: number, extra: { scale?: number } = {}) {
  const box = L.root.querySelector<HTMLElement>('[data-char="box"]');
  const slot = L.root.querySelector<HTMLElement>('[data-plate="slot"]');
  const k = extra.scale ?? 0.92;
  if (box) {
    const from = getComputedStyle(box).transform;
    m.play(box, [
      { opacity: 1, transform: from === "none" ? "scale(1)" : from },
      { opacity: 0, transform: `scale(${k})` },
    ], { duration: ms, fill: "forwards", easing: EASE.in });
  }
  if (slot) m.play(slot, [{ opacity: 1 }, { opacity: 0 }], { duration: ms * 0.8, fill: "forwards", easing: EASE.in });
}

/**
 * 締め: キャラ絵と字が消える（0〜`exitMs`）→ あやとが面の真ん中・前面へ戻る（`toCenter` を
 * 呼ぶ。動かし方は段ごと）→ ひと呼吸おいて、あやとが消える（`hero` を薄くする）。
 * `ms` は締め全体の長さ。あやとを前面に出すのはキャラ絵が消えきってから（顔に掛けない）
 */
export function curtainCall(
  m: Motion,
  L: ShowLayers,
  o: {
    ms: number;
    hero: HTMLElement;
    toCenter: (ms: number) => void;
    exitMs?: number;
    /** キャラ絵が消えるときの縮み（段4は魔法陣へ帰るので小さく） */
    exitScale?: number;
    /** キャラ絵が消えたあとに呼ぶ（オーラ・オブジェを消すなど） */
    afterExit?: () => void;
  }
) {
  const exitMs = o.exitMs ?? Math.min(600, o.ms * 0.22);
  viewerExit(m, L, exitMs, { scale: o.exitScale });
  const moveMs = Math.max(300, o.ms * 0.38);
  const fadeMs = Math.max(250, o.ms * 0.24);
  m.after(exitMs, () => {
    o.afterExit?.();
    L.actorBox.style.zIndex = "4";
    o.toCenter(moveMs);
  });
  m.after(o.ms - fadeMs, () => {
    // opacity だけ（あやとの箱の transform は振付けが動かしているので触らない）
    m.play(o.hero, [{ opacity: 1 }, { opacity: 0 }], { duration: fadeMs, fill: "forwards", easing: EASE.in });
  });
}
