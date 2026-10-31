/**
 * その人のキャラ絵を、決められた四角（名前の札の下の残り）に**絵の中身で**収める。
 *
 * 絵ごとに余白が違う（真四角に小さく描いた人・縦長いっぱいの人・横長の人）。絵の外枠で
 * 「contain」すると、余白の多い絵は小さく、余白の少ない絵は札にぶつかる。ここでは
 * 透明でない範囲（中身の外接矩形）を測って、その矩形が四角に収まるいちばん大きな倍率で、
 * 四角の真ん中に置く。
 *
 * - 中身は縮めた絵で一度だけ測り、URL ごとに覚える
 * - 測れない絵（よそから来て canvas が汚れる・透明の無い絵）は、絵の外枠を中身とみなす。
 *   それでも四角からははみ出さない
 * - 置いた中身の矩形は `data-char="content"` の印で読める（重なりを数える道具が使う）
 * - 絵そのものは今までどおり `<Image>` で出す（名簿の当たり・動画の待ちの試験がこれを数える）
 */
import React, { useEffect, useState } from "react";
import { Image } from "react-native";

type Box = { x: number; y: number; w: number; h: number };
type Fit = { natW: number; natH: number; box: Box };

const cache = new Map<string, Fit | null>();
const pending = new Map<string, Promise<Fit | null>>();

/** 絵を読んで、中身の外接矩形（0〜1 の割合）を測る */
function measure(url: string): Promise<Fit | null> {
  const hit = cache.get(url);
  if (hit !== undefined) return Promise.resolve(hit);
  const p0 = pending.get(url);
  if (p0) return p0;
  const p = new Promise<Fit | null>((resolve) => {
    if (typeof document === "undefined") return resolve(null);
    const img = new window.Image();
    // よそ（Firebase Storage）の絵でも、許されていれば画素を読める
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const natW = img.naturalWidth || 1;
      const natH = img.naturalHeight || 1;
      let box: Box = { x: 0, y: 0, w: 1, h: 1 };
      try {
        const k = Math.min(1, 256 / Math.max(natW, natH));
        const w = Math.max(1, Math.round(natW * k));
        const h = Math.max(1, Math.round(natH * k));
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          const d = ctx.getImageData(0, 0, w, h).data;
          let x0 = w, y0 = h, x1 = -1, y1 = -1;
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              if (d[(y * w + x) * 4 + 3] > 24) {
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
              }
            }
          }
          // 縮めたぶんの1画素を外へ（中身を削らない側に丸める）
          if (x1 >= x0 && y1 >= y0) {
            box = {
              x: Math.max(0, (x0 - 1) / w),
              y: Math.max(0, (y0 - 1) / h),
              w: Math.min(1, (x1 + 2) / w) - Math.max(0, (x0 - 1) / w),
              h: Math.min(1, (y1 + 2) / h) - Math.max(0, (y0 - 1) / h),
            };
          }
        }
      } catch {
        // 画素を読ませてもらえない絵は、外枠を中身とみなす
      }
      const fit = { natW, natH, box };
      cache.set(url, fit);
      resolve(fit);
    };
    img.onerror = () => {
      // 画素を読む許しの無い置き場は、許し無しで読み直して外枠だけ使う
      const plain = new window.Image();
      plain.onload = () => {
        const fit = { natW: plain.naturalWidth || 1, natH: plain.naturalHeight || 1, box: { x: 0, y: 0, w: 1, h: 1 } };
        cache.set(url, fit);
        resolve(fit);
      };
      plain.onerror = () => {
        cache.set(url, null);
        resolve(null);
      };
      plain.src = url;
    };
    img.src = url;
  });
  pending.set(url, p);
  return p.finally(() => pending.delete(url));
}

/** 中身の矩形が (aw × ah) に収まる置き方（px）。縦も横も真ん中（字は中身の上下中央に重なる） */
export function fitContent(fit: Fit, aw: number, ah: number) {
  const cw = fit.box.w * fit.natW;
  const ch = fit.box.h * fit.natH;
  const s = Math.max(0, Math.min(aw / cw, ah / ch));
  const cl = (aw - cw * s) / 2;
  const ct = (ah - ch * s) / 2;
  return {
    s,
    img: { left: cl - fit.box.x * fit.natW * s, top: ct - fit.box.y * fit.natH * s, width: fit.natW * s, height: fit.natH * s },
    content: { left: cl, top: ct, width: cw * s, height: ch * s },
  };
}

type Props = {
  url: string;
  /** 置く四角の大きさ（px）。四角そのものは親（CharBox）が持つ */
  width: number;
  height: number;
  /** 置いた中身の高さ（px）を知らせる。測れなかったら null */
  onContent?: (h: number | null) => void;
};

/** 測っている途中は undefined、測れなかった（読めない・画面が無い）ときは null */
const initial = (url: string): Fit | null | undefined =>
  cache.has(url) ? cache.get(url) : typeof document === "undefined" ? null : undefined;

export const CharFit: React.FC<Props> = ({ url, width, height, onContent }) => {
  const [fit, setFit] = useState<Fit | null | undefined>(() => initial(url));
  useEffect(() => {
    let alive = true;
    setFit(initial(url));
    measure(url).then((f) => {
      if (alive) setFit(f);
    });
    return () => {
      alive = false;
    };
  }, [url]);
  const contentH = fit && width > 0 && height > 0 ? fitContent(fit, width, height).content.height : null;
  useEffect(() => {
    onContent?.(contentH);
    // 高さが変わったときだけ知らせる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentH]);
  // 面の大きさがまだ分からない（画面の外で描いている）ときは、今までどおり箱いっぱいに収める
  if (width <= 0 || height <= 0) {
    return (
      <Image
        source={{ uri: url }}
        resizeMode="contain"
        style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%" }}
      />
    );
  }
  // 測り終わるまで出さない（先に外枠で出すと、測れた瞬間に絵が跳ぶ）。温めてあるので一瞬
  if (fit === undefined) return null;
  /* 測れなかった絵は外枠で収める（上の辺を四角の上に）。中身は外枠いっぱいとみなす */
  const at = fit
    ? fitContent(fit, width, height)
    : { img: { left: 0, top: 0, width, height }, content: { left: 0, top: 0, width, height } };
  return (
    <>
      <Image
        source={{ uri: url }}
        resizeMode={fit ? "stretch" : "contain"}
        style={{ position: "absolute", ...at.img }}
      />
      <div data-char="content" aria-hidden style={{ position: "absolute", ...at.content, pointerEvents: "none" }} />
    </>
  );
};
