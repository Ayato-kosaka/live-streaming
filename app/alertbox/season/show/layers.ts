/**
 * 段の演出が描く層（`TierShow.tsx` が組んで、振付け `run*` に渡す）。
 *
 * どの層も 1080×1920 の舞台の px で書く（舞台は今の箱へ cover で拡げてある）。奥から:
 *
 *   dark   暗転・前兆の光（揺らさない）
 *   back   主役の奥（満月・魔法陣・光の筋・こうもりの渦）        ┐
 *   actor  主役（ドラキュラ・魔法使いのあやと・行進）            ├ 揺らしてよい
 *   mid    主役の手前の小道具（棺など）                            ┘
 *   ── その人のキャラ絵（index.tsx）──
 *   front  粒（canvas）・きらめき・閃光（キャラ絵が出たら、キャラ絵の後ろへ下がる）
 *   ── 字（RichText。キャラ絵の上下中央）──
 *   top    札を運ぶもの・締めの群れ・札より手前に出る主役
 */
export type ShowLayers = {
  /** アラートの面（札の位置を測るのに使う） */
  root: HTMLElement;
  dark: HTMLDivElement;
  back: HTMLDivElement;
  actor: HTMLDivElement;
  mid: HTMLDivElement;
  front: HTMLDivElement;
  canvas: HTMLCanvasElement;
  top: HTMLDivElement;
  /** 主役の層の外の箱（重なりはここで決まる。札より手前に出すときに上げる） */
  actorBox: HTMLDivElement;
  /** 粒の層の外の箱。キャラ絵が出たら、キャラ絵の後ろへ下げる（滞在中は粒を顔の前に通さない） */
  frontBox: HTMLDivElement;
};

/**
 * 左から広がる字のブロック（段4: 杖の光で書く）の、閉じた形。`RichText` が最初にこの形で置き、
 * 振付けが右の切り取りを 100% → -6% へ動かして広げる（左右の縁取りのぶんまで見せる）
 */
export const UNROLL_CLOSED = "inset(-40% 100% -40% 0%)";

/** 振付けの中で使う小さな div（指の当たらない絶対配置の箱） */
export function div(parent: HTMLElement, style: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const d = document.createElement("div");
  Object.assign(d.style, { pointerEvents: "none", ...style });
  parent.appendChild(d);
  return d;
}

/**
 * 主役が滞在中にいる帯（面の上の端）の下の辺 = その人のキャラ絵の四角の上の辺（舞台の px）。
 * 台本のある段は index.tsx がこの帯を空けてキャラ絵を置くので、主役は帯の中にいればキャラ絵の
 * 顔の前を通らない。ふくらんで出てくる途中でも、置き場の位置を返す（offset で測る）
 */
export function bandBottomOf(L: ShowLayers, W: number, H: number): number {
  const el = L.root.querySelector<HTMLElement>('[data-char="box"]');
  const sr = L.dark.getBoundingClientRect();
  const k = sr.width / W || 1;
  if (!el) return H * 0.2;
  const parent = el.offsetParent as HTMLElement | null;
  const top = (parent ? parent.getBoundingClientRect().top : 0) + el.offsetTop;
  return (top - sr.top) / k;
}

/**
 * 字のブロックの位置（舞台の px）。札は舞台の外（React）にあるので、画面の位置を測って直す。
 *
 * **札が動いている途中でも、止まったときの位置を返す。** 札は運ばれてくる途中（上へ 42vh
 * ずれている）や、ぽんっと膨らむ途中でも、置き場は決まっている。transform を含む
 * getBoundingClientRect で測ると、出る前の札は画面の上の外にいることになり、
 * 字のまわりに置くきらめきの位置を読み違える。札の枠（`data-plate="slot"`）からの
 * offset の和で、transform を含まない位置を出す
 */
export function plateBoxOf(L: ShowLayers, W: number, H: number) {
  const el = L.root.querySelector<HTMLElement>('[data-plate="box"]');
  const sr = L.dark.getBoundingClientRect();
  const k = sr.width / W || 1;
  if (!el) return { l: W * 0.12, t: H * 0.3, r: W * 0.88, b: H * 0.46 };
  const slot = el.closest<HTMLElement>('[data-plate="slot"]');
  let x = 0;
  let y = 0;
  let p: HTMLElement | null = el;
  while (p && p !== slot) {
    x += p.offsetLeft;
    y += p.offsetTop;
    p = p.offsetParent as HTMLElement | null;
  }
  // 枠まで辿れなかった（並びが変わった）ときは、見えている位置で
  const r = el.getBoundingClientRect();
  const at = slot && p === slot ? slot.getBoundingClientRect() : null;
  const left = at ? at.left + x : r.left;
  const top = at ? at.top + y : r.top;
  return {
    l: (left - sr.left) / k,
    t: (top - sr.top) / k,
    r: (left + el.offsetWidth - sr.left) / k,
    b: (top + el.offsetHeight - sr.top) / k,
  };
}
