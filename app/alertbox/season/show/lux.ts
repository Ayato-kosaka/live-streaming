/**
 * 光の絵（`fx=lux` の試作。#1079）の置き場と読み込み・置き方。
 *
 * 絵は `tools/alert-theme/lux_art.py` が焼く（にじみまで焼いてある）。アラートの面では
 * transform と opacity だけで動かす（合成のスレッドで回る）。WebGL も透明つきの動画も使わない:
 * この箱で、面いっぱいの WebGL を毎コマ出すだけで GPU 140〜210 ms/秒、透明つきの動画を WebGL で
 * 重ねると 1,000〜1,390 ms/秒（CPU も 600）だった（2026-11-02）。iPhone の WebView は `<video>` を
 * 配信の画面に写さない（PR #438）ので、動画にするなら WebGL を通す必要があり、そこが重い。
 *
 * **旗（`?fx=lux`）が無いときは、1枚も読まない。** 旗があるときだけ、このファイルが読まれた時点で
 * 絵を落として展開しておく（試し表示は開いて 1 秒ほどで投げ銭が出るので、段の頭では間に合わない）。
 */

/** 試作の名前（URL の `?fx=`）。旗が無ければ null */
export function fxFlag(): string | null {
  try {
    if (typeof location === "undefined") return null;
    const v = new URLSearchParams(location.search).get("fx");
    return v ? v.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * 段の演出に使う振付けの名前。旗（`?fx=<名前>`）があって、段がその名前の試作を持っているときだけ試作に
 * 差し替える。**旗が無い・知らない名前なら、いまの振付けのまま**（本番の URL に `fx` は無い）
 */
export function showKind<K extends string>(show: { kind: K; fx?: Record<string, K> }, flag: string | null = fxFlag()): K {
  return (flag ? show.fx?.[flag] : undefined) ?? show.kind;
}

/** 絵の名前と、元の大きさ（px） */
export const LUX_SIZE = {
  circle: [1152, 1152],
  pillar: [256, 1024],
  rays: [1024, 1024],
  "orb-gold": [128, 128],
  "orb-violet": [128, 128],
  "orb-pink": [128, 128],
  "sparkle-gold": [128, 128],
  "sparkle-violet": [128, 128],
  streak: [512, 128],
  shock: [512, 512],
  flare: [256, 256],
  mist: [1024, 384],
} as const;
export type LuxName = keyof typeof LUX_SIZE;

const BASE = "/alert/themes/halloween/lux";
export const luxUrl = (n: LuxName) => `${BASE}/${n}.webp`;

let loading: Promise<boolean> | null = null;
/** 握っておく（展開した絵を、ブラウザが捨てないように） */
const held: HTMLImageElement[] = [];

/** 全部を落として展開する。1枚でも読めなければ false（そのぶんは出ないだけで、演出は止めない） */
export function preloadLux(): Promise<boolean> {
  if (loading) return loading;
  if (typeof window === "undefined" || typeof Image === "undefined") return (loading = Promise.resolve(false));
  loading = Promise.all(
    (Object.keys(LUX_SIZE) as LuxName[]).map(
      (n) =>
        new Promise<boolean>((resolve) => {
          const im = new Image();
          im.decoding = "async";
          im.onload = () => {
            held.push(im);
            const d = typeof im.decode === "function" ? im.decode() : Promise.resolve();
            d.then(
              () => resolve(true),
              () => resolve(true)
            );
          };
          im.onerror = () => resolve(false);
          im.src = luxUrl(n);
        })
    )
  ).then((xs) => xs.every(Boolean));
  return loading;
}

// 旗のあるページだけ、開いた時点で落とし始める
if (fxFlag() === "lux") void preloadLux();

/**
 * 光の絵を1枚置く（中心 (cx, cy)・幅 w。高さは絵の縦横比）。最初は見えない（opacity 0）。
 * 置くのは舞台の px（1080×1920 の舞台の上）
 */
export function luxImg(
  parent: HTMLElement,
  name: LuxName,
  cx: number,
  cy: number,
  w: number,
  style: Partial<CSSStyleDeclaration> = {}
): HTMLImageElement {
  const [nw, nh] = LUX_SIZE[name];
  const h = (w * nh) / nw;
  const im = document.createElement("img");
  im.src = luxUrl(name);
  im.alt = "";
  im.draggable = false;
  // 部品の名前（重さを割るとき、これで1つずつ外す。`tools/sprites/alert-gpu.mjs --tcss`）
  im.dataset.lux = name;
  Object.assign(im.style, {
    position: "absolute",
    left: `${(cx - w / 2).toFixed(1)}px`,
    top: `${(cy - h / 2).toFixed(1)}px`,
    width: `${w.toFixed(1)}px`,
    height: `${h.toFixed(1)}px`,
    pointerEvents: "none",
    userSelect: "none",
    opacity: "0",
    ...style,
  } satisfies Partial<CSSStyleDeclaration>);
  parent.appendChild(im);
  return im;
}
