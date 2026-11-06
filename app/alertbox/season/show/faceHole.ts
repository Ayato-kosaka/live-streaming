/**
 * 段の演出の動画の front（キャラ絵の前の光と粒。#1095）に、**その人のキャラ絵の顔の穴**を開ける。
 *
 * 顔の場所は人ごとに違う（縦長・横長・余白の多い絵で、上下も幅も変わる）。動画は段ごとに1本で焼くので、
 * 顔の場所を知っているのは再生の側だけ。描く担当が焼いた穴（叩き台の枠の真ん中の丸）だけでは、
 * 絵の大きい人・横長の人の顔を覆いきれない（段4 の本物の front は、alert-overlap で 30組のうち 30組の顔に
 * 光と粒が乗った。いちばん多くて 2,104 画素）。
 *
 * - 顔は alert-overlap と同じ決め: キャラ絵の**中身の外接矩形の上 45%**（`CharFit` の `data-char="content"`）。
 *   中身を測れない人（動画の人）は、キャラ絵の箱そのものを中身とみなす（穴が大きくなる側に倒す）
 * - 穴は、顔の矩形を外から囲む楕円。内側は透明、外へ半径の 25% で元に戻す（四角く切らない）
 * - 開けるのはキャラ絵の箱が置かれてから（動画の段は、動画が revealAt に来た知らせで箱を組む）。
 *   それまでは画面を使ってよい（`/alert-season` 0節）
 * - **箱・中身の印が置かれた・動いたその場で開け直す**（DOM の書き換えの知らせ。次の描画より前に回る）。
 *   前は revealAt の秒に1回と 1/4 秒おきの測り直しだけで、動画の時計で組まれる箱が秒より遅れると、
 *   箱が出てから最大 1/4 秒は穴の無い front が顔に乗っていた。負荷で測り直しが遅れた回に、ふくらみ終わった
 *   顔の上へ光と粒が乗った（1万円で30回に1回。#1141）
 * - 測るのは transform を含まない置き場（ふくらんで出る途中でも、出きった形で測る）。箱を手で広げると
 *   DOM を書き換えずにキャラ絵の置き場が変わるので、出ているあいだは 1/4 秒おきにも測り直す。1px 未満の違いは書かない
 */

export type Rect = { x: number; y: number; w: number; h: number };
export type Hole = { cx: number; cy: number; rx: number; ry: number };

/** 顔は中身の外接矩形の上 45%（alert-overlap の決め。オーナーの決まり 2026-10-24） */
export const FACE_SHARE = 0.45;
/** 測り直す間（ms） */
export const FACE_RECHECK_MS = 250;

export const faceOf = (content: Rect): Rect => ({ x: content.x, y: content.y, w: content.w, h: content.h * FACE_SHARE });

/** 矩形を外から囲む楕円（矩形の4つの角が楕円の上に乗る大きさ）。少しだけ外へ（角のにじみぶん） */
export function holeOf(face: Rect): Hole {
  return {
    cx: Math.round(face.x + face.w / 2),
    cy: Math.round(face.y + face.h / 2),
    rx: Math.ceil((face.w / 2) * Math.SQRT2) + 4,
    ry: Math.ceil((face.h / 2) * Math.SQRT2) + 4,
  };
}

/** 穴の CSS（mask-image）。楕円の内側は透明、半径の 125% で不透明に戻る */
export const holeCss = (h: Hole) =>
  `radial-gradient(ellipse ${h.rx}px ${h.ry}px at ${h.cx}px ${h.cy}px, transparent 100%, #000 125%)`;

/** 要素の置き場（ページの中、px）。offset* は transform を含まない */
export function layoutRect(el: HTMLElement): Rect {
  let x = 0;
  let y = 0;
  for (let e: HTMLElement | null = el; e; e = e.offsetParent as HTMLElement | null) {
    x += e.offsetLeft;
    y += e.offsetTop;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

/** front の層（`host`）から見た、その人のキャラ絵の顔の穴。キャラ絵がまだ置かれていなければ null */
export function holeFor(host: HTMLElement): Hole | null {
  const root = host.parentElement;
  const box = root?.querySelector<HTMLElement>('[data-char="box"]') ?? null;
  const content = box?.querySelector<HTMLElement>('[data-char="content"]') ?? box;
  if (!content) return null;
  const c = layoutRect(content);
  if (c.w <= 0 || c.h <= 0) return null;
  const o = layoutRect(host);
  return holeOf(faceOf({ x: c.x - o.x, y: c.y - o.y, w: c.w, h: c.h }));
}

/** 動画の層の中の書き換え（コマの替わり目の opacity・ここで書いた穴）。顔の場所は変えないので、測り直さない */
const inFxLayer = (n: Node) => typeof (n as Element).closest === "function" && !!(n as Element).closest("[data-fx-video]");

/**
 * front の層に顔の穴を開け続ける。止める関数を返す。
 * キャラ絵の箱が置かれた・中身の印が置かれた・動いたその場（同じ描画の前）と、1/4 秒おきに測り直し、
 * 穴の位置が変わったときだけ書き換える
 */
export function holdFaceHole(host: HTMLElement): () => void {
  let last = "";
  const apply = () => {
    const h = holeFor(host);
    if (!h) return;
    const css = holeCss(h);
    if (css === last) return;
    last = css;
    // 道具と試験が読む印（jsdom は mask-image を持たない）
    host.dataset.faceHole = css;
    host.style.setProperty("-webkit-mask-image", css);
    host.style.setProperty("mask-image", css);
  };
  /* 箱が組まれた知らせ。React が箱を DOM に入れた処理の直後（描画より前）に回るので、箱が見えた最初のコマから
     穴が開いている。測り直しの間隔に任せない */
  const root = host.parentElement;
  const mo =
    root && typeof MutationObserver === "function"
      ? new MutationObserver((recs) => {
          if (recs.some((r) => !inFxLayer(r.target))) apply();
        })
      : null;
  mo?.observe(root!, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class"] });
  apply();
  const iv = setInterval(apply, FACE_RECHECK_MS);
  return () => {
    mo?.disconnect();
    clearInterval(iv);
  };
}
