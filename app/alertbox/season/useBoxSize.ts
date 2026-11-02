/**
 * アラートの面の大きさ（CSS px）を、**本当に変わったときだけ** React に知らせる。
 *
 * PRISM はウィジェットの大きさが変わっていなくても resize を絶えず送ってくる（オーナーの
 * プローブで、ふだんの状態のまま window と visualViewport の resize が 486 回）。
 * react-native-web の `useWindowDimensions` は、知らせのたびに新しい寸法の物（中身は同じ）を
 * state に入れるので、使っている部品がそのたびに描き直される。アラートの面のいちばん上で
 * 使うと、豚も含めて全部が描き直される。
 *
 * ここでは知らせを rAF で1コマ1回にまとめ、1px 未満の違いは捨てる。
 *
 * - `useBoxSize` … 面の箱（`<html>` の clientWidth / clientHeight。CSS の vw・vh と同じ物差し）。
 *   季節の貯金箱はこちらで測る
 * - `useSettledBoxSize` … 同じ箱を、**箱を広げているあいだは並べ直さずに**返す（アラートの面。
 *   段の演出・札・その人の絵は index.tsx からこの大きさをもらう。下の説明）
 * - `useStableWindow` … react-native-web の `Dimensions` と同じ数（visualViewport × scale）。
 *   豚はこちら（数を変えると、豚の大きさが今と変わる）
 */
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Dimensions } from "react-native";

export type BoxSize = { width: number; height: number };

const ZERO: BoxSize = { width: 0, height: 0 };

function useBatchedSize(read: () => BoxSize, subscribe: (fire: () => void) => () => void): BoxSize {
  const [size, setSize] = useState<BoxSize>(read);
  useEffect(() => {
    let raf = 0;
    const fire = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const n = read();
        setSize((p) => (Math.abs(p.width - n.width) < 1 && Math.abs(p.height - n.height) < 1 ? p : n));
      });
    };
    const off = subscribe(fire);
    // 読んでから知らせを待つまでのあいだに変わっていたら拾う
    fire();
    return () => {
      off();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [read, subscribe]);
  return size;
}

const readBox = (): BoxSize => {
  if (typeof document === "undefined") return ZERO;
  const el = document.documentElement;
  return { width: el.clientWidth, height: el.clientHeight };
};

const subscribeBox = (fire: () => void) => {
  // 試験の画面（react-test-renderer）には window はあっても addEventListener が無い
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") return () => {};
  const vv = window.visualViewport;
  window.addEventListener("resize", fire);
  vv?.addEventListener("resize", fire);
  return () => {
    window.removeEventListener("resize", fire);
    vv?.removeEventListener("resize", fire);
  };
};

const readWindow = (): BoxSize => {
  const w = Dimensions.get("window");
  return { width: w.width, height: w.height };
};

const subscribeWindow = (fire: () => void) => {
  const sub = Dimensions.addEventListener("change", fire);
  return () => sub?.remove();
};

/** 面の箱の大きさ（CSS px）。変わったときだけ描き直す */
export function useBoxSize(): BoxSize {
  return useBatchedSize(readBox, subscribeBox);
}

/** 大きさが止まってから並べ直すまで（ms） */
export const SETTLE_MS = 200;

const same = (a: BoxSize, b: BoxSize) => Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1;

/** 拡大を外す。並べ直したコマと同じコマで外す（先に外すと、1コマだけ古い並びが原寸で出る） */
function clearScale(el: HTMLElement | null) {
  if (!el?.style?.transform) return;
  for (const k of ["transform", "transformOrigin", "willChange", "position", "left", "top", "width", "height"] as const) {
    el.style[k] = "";
  }
}

/** 落ち着いた大きさ `s` で並べた `el` を、いまの大きさ `n` まで拡げる（左上を原点に） */
function applyScale(el: HTMLElement, s: BoxSize, n: BoxSize) {
  Object.assign(el.style, {
    position: "absolute",
    left: "0px",
    top: "0px",
    width: `${s.width}px`,
    height: `${s.height}px`,
    transformOrigin: "0 0",
    transform: `scale(${n.width / s.width}, ${n.height / s.height})`,
    // 合成の層に載せる。載せないと、拡大を変えるたびに中身（字）を描き直す
    willChange: "transform",
  });
}

/**
 * アラートの面の大きさ。**箱を広げているあいだは並べ直さない。**
 *
 * PRISM では投げ銭のときに箱を手で広げる。アラートの字（`plate/RichText.tsx`）は箱の幅に比例するので、
 * 大きさが変わるたびに並べ直すと、太い縁取りと影の付いた字を毎コマ描き直すことになる。この箱で測ると、
 * 1秒に30回変えたときの CPU がハロウィン前の約5倍（1,000円で 150 → 710 ms/秒。#1079）。
 *
 * ここでは大きさが動いているあいだ、最後に落ち着いた大きさで並べたまま、`el`（アラートの面）を
 * transform で今の大きさまで拡げる（合成の層で拡げるので、中身は描き直さない）。止まって
 * `SETTLE_MS` 経ったら、その大きさで並べ直して拡大を外す。止まったあとは今までと同じ並び
 * （オーナー判断 2026-11-02: 途中の字のぼけは広げている一瞬だけ。なめらかさのほうが大事）。
 *
 * 拡げるのは React を通さず DOM に直に書く（広げているあいだ、アラート全体を描き直さない）。
 * アラートが出ていない（`el` が無い）ときは、今までどおりすぐ大きさを返す。
 */
export function useSettledBoxSize(ref: RefObject<HTMLElement | null>, settleMs = SETTLE_MS): BoxSize {
  const [size, setSize] = useState<BoxSize>(readBox);
  const sizeRef = useRef(size);
  sizeRef.current = size;
  // 並べ直した（大きさが変わった）コマで、拡大を外す
  useLayoutEffect(() => {
    clearScale(ref.current);
  }, [size, ref]);
  useEffect(() => {
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const settle = () => {
      timer = null;
      const n = readBox();
      if (same(n, sizeRef.current)) clearScale(ref.current);
      else setSize(n);
    };
    const apply = () => {
      raf = 0;
      const n = readBox();
      const s = sizeRef.current;
      // 試験の画面（react-test-renderer）の ref は DOM ではない（style が無い）
      const el = ref.current?.style ? ref.current : null;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (same(n, s)) {
        clearScale(el);
        return;
      }
      // アラートが出ていない、または大きさがまだ無い（描く前）ときは、すぐ並べ直す
      if (!el || s.width <= 0 || s.height <= 0) {
        setSize(n);
        return;
      }
      applyScale(el, s, n);
      timer = setTimeout(settle, settleMs);
    };
    const fire = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const off = subscribeBox(fire);
    fire();
    return () => {
      off();
      if (raf) cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
    };
  }, [ref, settleMs]);
  return size;
}

/** `useWindowDimensions` と同じ数。変わったときだけ描き直す */
export function useStableWindow(): BoxSize {
  return useBatchedSize(readWindow, subscribeWindow);
}
