/**
 * ポーズ絵（`poses.ts`）を1人ぶん、舞台に立てる。ポーズは同じ箱に重ねて置き、見せる1枚を
 * visibility で切り替える（opacity 0 の層は描かれずに置かれて、出した瞬間に欠けることがある）。
 *
 * 箱は3重: 位置（`pos`。振付けが translate と scale を動かす）→ ずっと続く揺れ（`bob`。呼吸・浮き）
 * → つぶし・伸ばし（`squash`。切り替えの弾み）。同じ要素に transform のアニメを2本当てると
 * 後のほうが勝つので、層を分けて掛け合わせる。
 *
 * どの箱も原点が**基準点**: `feet` なら足元の中央（立つ・起き上がる主役。段7）、`face` なら
 * 顔の中心（飛ぶ主役。段4）。ポーズを替えても基準点は動かないので、足元が地面から浮かない
 * （顔の幅は絵の担当がそろえてあるので、顔の大きさも跳ねない）。
 */
import type { LoadedPoses } from "./poses";
import { div } from "./layers";

export type PoseActor = {
  pos: HTMLDivElement;
  bob: HTMLDivElement;
  squash: HTMLDivElement;
  /** 倍率 1 のときの、絵 1px が舞台の何 px か */
  s0: number;
  show(name: string): void;
  current(): string;
  /** そのポーズの絵の中の点（絵の px）が、基準点からどれだけ離れているか（倍率 1 の舞台 px） */
  offset(name: string, pt: [number, number]): [number, number];
};

export function makePoseActor(
  parent: HTMLElement,
  set: LoadedPoses,
  opts: { ref: string; height: number; anchor: "feet" | "face" }
): PoseActor {
  const ref = set.poses.get(opts.ref) ?? [...set.poses.values()][0];
  const s0 = opts.height / Math.max(1, ref.content[3] - ref.content[1]);
  const pos = div(parent, { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px", willChange: "transform" });
  const bob = div(pos, { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px" });
  const squash = div(bob, { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px" });
  /** 右向きにそろえるか（左向きの絵は左右反転） */
  const flip = (name: string) => set.poses.get(name)?.facing === "left";
  const anchorOf = (name: string): [number, number] => {
    const p = set.poses.get(name)!;
    const a = opts.anchor === "feet" ? p.bottom : p.faceCenter;
    return [flip(name) ? p.size[0] - a[0] : a[0], a[1]];
  };
  const imgs = new Map<string, HTMLElement[]>();
  for (const [name, p] of set.poses) {
    const [ax, ay] = anchorOf(name);
    const im = document.createElement("img");
    im.src = p.img.url;
    im.alt = "";
    im.draggable = false;
    Object.assign(im.style, {
      position: "absolute",
      left: `${-ax * s0}px`,
      top: `${-ay * s0}px`,
      width: `${p.size[0] * s0}px`,
      height: `${p.size[1] * s0}px`,
      transform: flip(name) ? "scaleX(-1)" : "",
      visibility: name === opts.ref ? "visible" : "hidden",
      userSelect: "none",
      pointerEvents: "none",
    } satisfies Partial<CSSStyleDeclaration>);
    squash.appendChild(im);
    imgs.set(name, [im, heroFaceMark(squash, p, s0, ax, ay, flip(name), name === opts.ref)]);
  }
  let cur = opts.ref;
  return {
    pos,
    bob,
    squash,
    s0,
    show(name) {
      if (!imgs.has(name)) return;
      imgs.forEach((els, k) => els.forEach((el) => (el.style.visibility = k === name ? "visible" : "hidden")));
      cur = name;
    },
    current: () => cur,
    offset(name, pt) {
      const p = set.poses.get(name);
      if (!p) return [0, 0];
      const [ax, ay] = anchorOf(name);
      const x = flip(name) ? p.size[0] - pt[0] : pt[0];
      return [(x - ax) * s0, (pt[1] - ay) * s0];
    },
  };
}

/**
 * 主役の顔の枠の印（`data-hero-face`）。見えない箱で、ポーズ絵と同じ箱に同じ位置・同じ反転で置き、
 * ポーズと一緒に出し入れする。**字が主役の顔に乗っていないか**を、見張り（`alert-overlap.mjs`）が
 * この印の画面の矩形と字の矩形の重なりで数える（オーナーの決まり: 主役の顔は字で隠さない）。
 * `(ax, ay)` は絵の中の基準点（絵の px）。印も同じ点を原点にする
 */
export function heroFaceMark(
  parent: HTMLElement,
  p: { face: [number, number, number, number]; size: [number, number] },
  s0: number,
  ax: number,
  ay: number,
  flipped: boolean,
  visible: boolean
): HTMLDivElement {
  const [x0, y0, x1, y1] = p.face;
  const l = flipped ? p.size[0] - x1 : x0;
  const d = document.createElement("div");
  d.setAttribute("data-hero-face", "");
  Object.assign(d.style, {
    position: "absolute",
    left: `${((l - ax) * s0).toFixed(1)}px`,
    top: `${((y0 - ay) * s0).toFixed(1)}px`,
    width: `${((x1 - x0) * s0).toFixed(1)}px`,
    height: `${((y1 - y0) * s0).toFixed(1)}px`,
    visibility: visible ? "visible" : "hidden",
    pointerEvents: "none",
  } satisfies Partial<CSSStyleDeclaration>);
  parent.appendChild(d);
  return d;
}
