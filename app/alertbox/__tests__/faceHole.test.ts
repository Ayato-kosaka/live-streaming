/**
 * @jest-environment jsdom
 */

/**
 * 段の演出の動画の front に、その人のキャラ絵の顔の穴を開ける（`season/show/faceHole.ts`。#1095）。
 *
 *   npx jest app/alertbox/__tests__/faceHole.test.ts
 *
 * 守りたいのは3つ。
 *   1. 顔（中身の外接矩形の上 45%。alert-overlap と同じ決め）の4つの角まで、穴の内側（透明）に入る。
 *      顔より下（字の下・体）は穴の外（front はそのまま見える）
 *   2. 穴を開けるのはキャラ絵の箱が置かれてから。**置かれたその場で**開ける（測り直しの間隔を待たない。
 *      待つと、箱が出てから最大 1/4 秒は顔の上に front が乗る。#1141）
 *   3. キャラ絵の置き場が変わったら（箱を手で広げた）穴も動く。止めたら動かない。
 *      中身を測れない人（動画の人）は、キャラ絵の箱を中身とみなす
 *
 * jsdom は置き場を持たないので、offset* を差し替えて置く。
 */
import { FACE_RECHECK_MS, FACE_SHARE, faceOf, holdFaceHole, holeOf, type Hole, type Rect } from "../season/show/faceHole";

/** 楕円の中心からの距離（1 で楕円の上） */
const reach = (h: Hole, x: number, y: number) => Math.hypot((x - h.cx) / h.rx, (y - h.cy) / h.ry);
/** `holeCss` の文字から楕円を読み戻す */
const parse = (css: string): Hole => {
  const m = css.match(/ellipse (\d+)px (\d+)px at (-?\d+)px (-?\d+)px/)!;
  return { rx: +m[1], ry: +m[2], cx: +m[3], cy: +m[4] };
};

function place(el: HTMLElement, r: Rect, parent: HTMLElement | null = null) {
  Object.defineProperty(el, "offsetLeft", { configurable: true, get: () => r.x });
  Object.defineProperty(el, "offsetTop", { configurable: true, get: () => r.y });
  Object.defineProperty(el, "offsetWidth", { configurable: true, get: () => r.w });
  Object.defineProperty(el, "offsetHeight", { configurable: true, get: () => r.h });
  Object.defineProperty(el, "offsetParent", { configurable: true, get: () => parent });
}

/** アラートの面: front の層と、キャラ絵の箱（その中に中身の印）。index.tsx と同じ並び */
function face(opts: { box: Rect; content: Rect | null }) {
  const root = document.createElement("div");
  const front = document.createElement("div");
  const box = document.createElement("div");
  box.setAttribute("data-char", "box");
  root.append(front, box);
  place(root, { x: 0, y: 0, w: 436, h: 776 });
  place(front, { x: 0, y: 0, w: 436, h: 776 }, root);
  place(box, opts.box, root);
  let content: HTMLElement | null = null;
  if (opts.content) {
    content = document.createElement("div");
    content.setAttribute("data-char", "content");
    box.append(content);
    place(content, opts.content, box);
  }
  document.body.append(root);
  return { root, front, box, content };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.useRealTimers();
  document.body.innerHTML = "";
});

describe("1. 顔の4つの角まで穴の内側。顔より下は穴の外", () => {
  it.each<[string, Rect]>([
    ["縦長いっぱい", { x: 60, y: 160, w: 316, h: 600 }],
    ["横長", { x: 0, y: 400, w: 436, h: 180 }],
    ["細い縦長", { x: 190, y: 160, w: 56, h: 600 }],
    ["小さい真四角", { x: 168, y: 380, w: 100, h: 100 }],
  ])("%s", (_, c) => {
    const f = faceOf(c);
    expect(f).toEqual({ x: c.x, y: c.y, w: c.w, h: c.h * FACE_SHARE });
    const h = holeOf(f);
    for (const [x, y] of [
      [f.x, f.y],
      [f.x + f.w, f.y],
      [f.x, f.y + f.h],
      [f.x + f.w, f.y + f.h],
    ])
      expect(reach(h, x, y)).toBeLessThanOrEqual(1);
    // 中身のいちばん下の真ん中（体の下）は、穴の外（戻りきった 125% より外）
    expect(reach(h, c.x + c.w / 2, c.y + c.h)).toBeGreaterThan(1.25);
  });
});

/** 書き換えの知らせ（MutationObserver）は、いまの処理が終わった直後（microtask）に回る。描画はそのあと */
const settle = () => Promise.resolve();

/** 箱の無い面（動画の段は、動画が revealAt に来るまで箱を組まない） */
function bare() {
  const root = document.createElement("div");
  const front = document.createElement("div");
  root.append(front);
  document.body.append(root);
  place(front, { x: 0, y: 0, w: 436, h: 776 }, root);
  return { root, front };
}

/** 箱（と中身の印）を組む。index.tsx が revealAt に組むのと同じ並び */
function addBox(root: HTMLElement, box: Rect, content: Rect | null) {
  const b = document.createElement("div");
  b.setAttribute("data-char", "box");
  place(b, box, root);
  if (content) {
    const c = document.createElement("div");
    c.setAttribute("data-char", "content");
    place(c, content, b);
    b.append(c);
  }
  root.append(b);
  return b;
}

describe("2. 穴はキャラ絵の箱が置かれたその場で", () => {
  it("箱が無いあいだは開けない（front は画面を使ってよい）。置かれたら、測り直しを待たずに開ける", async () => {
    const { root, front } = bare();
    const stop = holdFaceHole(front);
    jest.advanceTimersByTime(FACE_RECHECK_MS * 20);
    expect(front.dataset.faceHole).toBeUndefined();
    addBox(root, { x: 0, y: 155, w: 436, h: 605 }, { x: 60, y: 5, w: 316, h: 600 });
    await settle();
    // 時計は1ms も進めていない（測り直しの間隔ではなく、箱が置かれた知らせで開いた）
    const h = parse(front.dataset.faceHole!);
    // 中身は面の (60, 160) から 316×600。顔はその上 45%
    expect(reach(h, 60, 160)).toBeLessThanOrEqual(1);
    expect(reach(h, 376, 160 + 600 * FACE_SHARE)).toBeLessThanOrEqual(1);
    expect(front.style.cssText).toContain("radial-gradient");
    stop();
  });

  it("中身の印があとから置かれたら（絵を測り終えた）、その場で中身の顔へ開け直す", async () => {
    const { root, front } = bare();
    const stop = holdFaceHole(front);
    const box = addBox(root, { x: 0, y: 155, w: 436, h: 605 }, null);
    await settle();
    const first = front.dataset.faceHole;
    expect(first).toBeDefined();
    // 箱の下寄りに小さく置かれた中身。箱の上 45% の穴では、中身の顔の下の角が穴の外に出る
    const c = document.createElement("div");
    c.setAttribute("data-char", "content");
    place(c, { x: 118, y: 300, w: 200, h: 300 }, box);
    box.append(c);
    await settle();
    const h = parse(front.dataset.faceHole!);
    expect(front.dataset.faceHole).not.toBe(first);
    expect(reach(h, 118, 455)).toBeLessThanOrEqual(1);
    expect(reach(h, 318, 455 + 300 * FACE_SHARE)).toBeLessThanOrEqual(1);
    stop();
  });

  it("対照: 動画の層の中の書き換え（コマの替わり目）では測り直さない", async () => {
    const { root, front } = bare();
    const stop = holdFaceHole(front);
    front.setAttribute("data-fx-video", "front");
    const box = addBox(root, { x: 0, y: 155, w: 436, h: 605 }, null);
    await settle();
    const first = front.dataset.faceHole;
    // 置き場だけ動かして（DOM は書き換えない）、動画の層の中だけ書き換える
    place(box, { x: 0, y: 300, w: 436, h: 400 }, root);
    const v = document.createElement("video");
    front.append(v);
    v.style.opacity = "1";
    await settle();
    expect(front.dataset.faceHole).toBe(first);
    // 測り直しの間隔では動く
    jest.advanceTimersByTime(FACE_RECHECK_MS);
    expect(front.dataset.faceHole).not.toBe(first);
    stop();
  });
});

describe("3. 置き場が変わったら穴も動く・止めたら動かない・中身を測れない人は箱", () => {
  it("箱を広げてキャラ絵が動いたら、次の測り直しで穴が動く。止めたら動かない", () => {
    const { front, content } = face({ box: { x: 0, y: 155, w: 436, h: 605 }, content: { x: 60, y: 5, w: 316, h: 600 } });
    const stop = holdFaceHole(front);
    const first = front.dataset.faceHole;
    place(content!, { x: 100, y: 40, w: 236, h: 450 }, content!.offsetParent as HTMLElement);
    jest.advanceTimersByTime(FACE_RECHECK_MS);
    const moved = front.dataset.faceHole;
    expect(moved).not.toBe(first);
    expect(reach(parse(moved!), 100, 155 + 40)).toBeLessThanOrEqual(1);
    stop();
    place(content!, { x: 0, y: 0, w: 10, h: 10 }, content!.offsetParent as HTMLElement);
    jest.advanceTimersByTime(FACE_RECHECK_MS * 4);
    expect(front.dataset.faceHole).toBe(moved);
  });

  it("中身の印が無い人（動画の人）は、キャラ絵の箱を中身とみなす", () => {
    const { front } = face({ box: { x: 0, y: 155, w: 436, h: 605 }, content: null });
    const stop = holdFaceHole(front);
    const h = parse(front.dataset.faceHole!);
    expect(reach(h, 0, 155)).toBeLessThanOrEqual(1);
    expect(reach(h, 436, 155 + 605 * FACE_SHARE)).toBeLessThanOrEqual(1);
    stop();
  });

  it("止めたら、箱が置かれても開けない（書き換えの知らせも外す）", async () => {
    const { root, front } = bare();
    const stop = holdFaceHole(front);
    stop();
    addBox(root, { x: 0, y: 155, w: 436, h: 605 }, null);
    await settle();
    jest.advanceTimersByTime(FACE_RECHECK_MS * 4);
    expect(front.dataset.faceHole).toBeUndefined();
  });
});
