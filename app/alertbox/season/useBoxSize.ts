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
 *   季節の演出（貯金箱・段の演出・札）はこちらで測る
 * - `useStableWindow` … react-native-web の `Dimensions` と同じ数（visualViewport × scale）。
 *   豚はこちら（数を変えると、豚の大きさが今と変わる）
 */
import { useEffect, useState } from "react";
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

/** `useWindowDimensions` と同じ数。変わったときだけ描き直す */
export function useStableWindow(): BoxSize {
  return useBatchedSize(readWindow, subscribeWindow);
}
