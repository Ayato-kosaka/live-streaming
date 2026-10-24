/**
 * 切り絵の部品を、入れ子の要素で組む（描く側）。
 *
 * 部品1つは2枚の箱でできている。
 *
 *   .part（動き: 走り・小芸。関節の点が transform-origin）
 *     .loop（ずっと続く揺れ: 呼吸・しっぽ。同じ関節の点）
 *       img（自分の絵。z = 自分の z）
 *       .part（子の部品。z = 子の z）…
 *
 * 箱を2枚にしたのは、**同じ要素に transform のアニメを2本当てると後のほうが勝つ**から。
 * 走りの上下と呼吸の伸び縮みを同時に出すために、層を分けて掛け合わせる。
 * `composite: "add"` を使えば1枚で済むが、スマホの WebView の古いものが持っていない。
 *
 * 動かすのは transform と opacity だけ（`Motion.play`）。部品は `will-change: transform`
 * で最初から自分の層にしておく。動き出すたびに層を作り直すと、そのたびに描き直しが走る。
 */
import type { LoadedImage } from "../useSeason";
import { restPivot, type RigDef, type Vec } from "./rig";

/** 読み終わった部品の組（絵はみな `decode()` まで済んでいる） */
export type LoadedRig = {
  def: RigDef;
  /** 置き場（`…/rig/kuro`）。絵の URL はここ + ファイル名 */
  base: string;
  /** ファイル名 → 絵 */
  images: ReadonlyMap<string, LoadedImage>;
};

export type RigHandle = {
  /** 台紙ぶんの箱（css px = 台紙 px × scale）。好きな所に置く */
  root: HTMLDivElement;
  scale: number;
  /** 動き用の箱。無い部品は null（絵の担当が描かなかった部品は、動きを飛ばすだけ） */
  part(id: string): HTMLDivElement | null;
  /** ずっと続く揺れ用の箱 */
  loop(id: string): HTMLDivElement | null;
  /** 差し替える。知らない名前は何もしない */
  swap(id: string, name: string): void;
  /** いま出している差し替えの名前 */
  swapped(id: string): string | null;
  /** 部品の関節の点（台紙 px、回していないとき） */
  pivot(id: string): Vec | null;
  has(id: string): boolean;
};

/**
 * 組む。`only` を渡すと、その根の部品（と子孫）だけを組む（小物の組から棺だけを出す、など）。
 * `layers: false` で部品を自分の層にしない（動かさない部品だけの組）。
 */
export function buildRig(
  rig: LoadedRig,
  scale: number,
  opts: { only?: string[]; layers?: boolean } = {}
): RigHandle {
  const { def } = rig;
  const [W, H] = def.size;
  const root = document.createElement("div");
  root.setAttribute("aria-hidden", "true");
  Object.assign(root.style, {
    position: "absolute",
    left: "0px",
    top: "0px",
    width: `${W * scale}px`,
    height: `${H * scale}px`,
    pointerEvents: "none",
  } satisfies Partial<CSSStyleDeclaration>);
  const inner = document.createElement("div");
  Object.assign(inner.style, {
    position: "absolute",
    left: "0px",
    top: "0px",
    width: `${W}px`,
    height: `${H}px`,
    transformOrigin: "0 0",
    transform: `scale(${scale})`,
  } satisfies Partial<CSSStyleDeclaration>);
  root.appendChild(inner);

  const parts = new Map<string, HTMLDivElement>();
  const loops = new Map<string, HTMLDivElement>();
  const swapEls = new Map<string, Map<string, HTMLImageElement>>();
  const current = new Map<string, string>();

  const kids = new Map<string | null, RigDef["parts"]>();
  for (const p of def.parts) {
    const k = kids.get(p.parent) ?? [];
    k.push(p);
    kids.set(p.parent, k);
  }

  const imgEl = (file: string, mirror: boolean, z: number) => {
    const im = rig.images.get(file);
    const el = document.createElement("img");
    el.src = im ? im.url : `${rig.base}/${file}`;
    el.alt = "";
    el.draggable = false;
    Object.assign(el.style, {
      position: "absolute",
      left: "0px",
      top: "0px",
      width: `${im?.width ?? 0}px`,
      height: `${im?.height ?? 0}px`,
      zIndex: String(Math.round(z * 10)),
      transform: mirror ? "scaleX(-1)" : "",
      userSelect: "none",
      pointerEvents: "none",
    } satisfies Partial<CSSStyleDeclaration>);
    return el;
  };

  const make = (p: RigDef["parts"][number], into: HTMLElement) => {
    const files = p.swaps ? Object.values(p.swaps) : [p.file!];
    const first = rig.images.get(files[0]);
    const w = first?.width ?? 0;
    const h = first?.height ?? 0;
    const origin = `${p.pivot[0]}px ${p.pivot[1]}px`;

    const el = document.createElement("div");
    Object.assign(el.style, {
      position: "absolute",
      left: `${p.at[0] - p.pivot[0]}px`,
      top: `${p.at[1] - p.pivot[1]}px`,
      width: `${w}px`,
      height: `${h}px`,
      transformOrigin: origin,
      zIndex: String(Math.round(p.z * 10)),
      willChange: opts.layers === false ? "auto" : "transform",
    } satisfies Partial<CSSStyleDeclaration>);
    el.dataset.part = p.id;
    const loop = document.createElement("div");
    Object.assign(loop.style, {
      position: "absolute",
      left: "0px",
      top: "0px",
      width: `${w}px`,
      height: `${h}px`,
      transformOrigin: origin,
    } satisfies Partial<CSSStyleDeclaration>);
    el.appendChild(loop);

    if (p.swaps) {
      const m = new Map<string, HTMLImageElement>();
      Object.entries(p.swaps).forEach(([name, file], i) => {
        const im = imgEl(file, !!p.mirror, p.z);
        /* 差し替えは visibility で。opacity 0 の層は描かれずに置かれて、出した瞬間に
           欠けることがある（`ThemedGauge.tsx` の頭と同じ理由） */
        im.style.visibility = i === 0 ? "visible" : "hidden";
        loop.appendChild(im);
        m.set(name, im);
      });
      swapEls.set(p.id, m);
      current.set(p.id, Object.keys(p.swaps)[0]);
    } else {
      loop.appendChild(imgEl(p.file!, !!p.mirror, p.z));
    }
    for (const c of [...(kids.get(p.id) ?? [])].sort((a, b) => a.z - b.z)) make(c, loop);
    into.appendChild(el);
    parts.set(p.id, el);
    loops.set(p.id, loop);
  };
  for (const p of [...(kids.get(null) ?? [])].sort((a, b) => a.z - b.z)) {
    if (opts.only && !opts.only.includes(p.id)) continue;
    make(p, inner);
  }

  return {
    root,
    scale,
    part: (id) => parts.get(id) ?? null,
    loop: (id) => loops.get(id) ?? null,
    has: (id) => parts.has(id),
    swap(id, name) {
      const m = swapEls.get(id);
      if (!m || !m.has(name) || current.get(id) === name) return;
      m.forEach((el, k) => {
        el.style.visibility = k === name ? "visible" : "hidden";
      });
      current.set(id, name);
    },
    swapped: (id) => current.get(id) ?? null,
    pivot: (id) => restPivot(def, id),
  };
}

/**
 * 部品の目印（`partAnchors`）に、`items` の小さな絵を付ける（帽子をかぶせる・竿を握らせる）。
 * 絵の中の点（`itemAnchors`）が目印に重なるように置き、その点を回すときの中心にする。
 * `z` は付ける部品の中での重なり（部品の z と同じ物差し。部品の絵より奥なら小さく）。
 * 目印か絵が無ければ何もしない（null）
 */
export function attachItem(h: RigHandle, rig: LoadedRig, item: string, anchor: string, z: number): HTMLImageElement | null {
  const a = rig.def.partAnchors[anchor];
  const file = rig.def.items[item];
  const host = a ? h.loop(a.part) : null;
  const im = file ? rig.images.get(file) : undefined;
  if (!a || !host || !im) return null;
  const [ax, ay] = rig.def.itemAnchors[item] ?? [0, 0];
  const el = document.createElement("img");
  el.src = im.url;
  el.alt = "";
  el.draggable = false;
  Object.assign(el.style, {
    position: "absolute",
    left: `${a.at[0] - ax}px`,
    top: `${a.at[1] - ay}px`,
    width: `${im.width}px`,
    height: `${im.height}px`,
    transformOrigin: `${ax}px ${ay}px`,
    zIndex: String(Math.round(z * 10)),
    userSelect: "none",
    pointerEvents: "none",
  } satisfies Partial<CSSStyleDeclaration>);
  host.appendChild(el);
  return el;
}

/** 部品の絵の URL（置き場 + ファイル名） */
export const rigFileUrl = (base: string, file: string) => `${base}/${file}`;
