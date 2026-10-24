/**
 * その人のキャラ絵（と動画）を入れる箱。**名前の札のすぐ下から、面の下の端まで。**
 *
 * 札・額・メッセージの字は、その人のキャラ絵と1画素も重ねない（オーナーの決まり。字が顔に
 * 乗るのは厳禁）。札は上、キャラ絵はそのすぐ下、を1つの組として面に収める。札が長い名前や
 * 3行のメッセージで高くなったら、キャラ絵の側が縮む（`top` が下がる）。季節の有無に
 * かかわらず、投げ銭のアラートは全部この並べ方。
 *
 * - 台本が「どうぞ」と見せる秒（`revealAt`）まで出さない。出るときは光の中から
 *   ふくらんで出る（`originY` が光の中心の高さ）
 * - 箱の中の置き方（絵の中身で収める）は `CharFit`
 */
import React, { useEffect, useRef } from "react";

type Props = {
  /** 箱の上の辺（面の上から px）。札の下の辺＋すき間 */
  top: number;
  /** 下の余白（px） */
  bottom: number;
  /** 出す秒。0 ならすぐ */
  revealAt: number;
  /** 出てくる光の中心の高さ（面の上から px） */
  originY?: number;
  children: React.ReactNode;
};

export const CharBox: React.FC<Props> = ({ top, bottom, revealAt, originY, children }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || revealAt <= 0 || typeof el.animate !== "function") return;
    const a = el.animate(
      [
        { opacity: 0, transform: "scale(0.18)", offset: 0 },
        { opacity: 1, transform: "scale(1.05)", offset: 0.6, easing: "ease-in-out" },
        { opacity: 1, transform: "scale(1)" },
      ],
      { duration: 850, delay: revealAt * 1000, easing: "cubic-bezier(0.2, 0.8, 0.3, 1)", fill: "backwards" }
    );
    return () => a.cancel();
    // 通知1件につき1回
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      ref={ref}
      data-char="box"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top,
        bottom,
        zIndex: 1,
        transformOrigin: originY != null ? `50% ${(originY - top).toFixed(1)}px` : "50% 0%",
      }}
    >
      {children}
    </div>
  );
};
