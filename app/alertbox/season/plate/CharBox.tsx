/**
 * その人のキャラ絵（と動画）を入れる箱。季節の札があるときだけ使う。
 *
 * - **札（上から 30%〜）と顔が重ならないように、絵を画面の下 64% に収める**
 *   （本物の配信でもキャラ絵は下 2/3 に出ている。設計書 §1.1）
 * - 台本が「どうぞ」と見せる秒（`revealAt`）まで出さない。出るときは満月の光の中から
 *   ふくらんで出る（`originY` が光の中心の高さ）
 *
 * 札が無いとき（季節の外・豚の日）は、箱を作らずに中身をそのまま返す（今と同じ形）。
 */
import React, { useEffect, useRef } from "react";

type Props = {
  /** 札があるか（絵を下へ寄せるか） */
  themed: boolean;
  /** 出す秒。0 ならすぐ */
  revealAt: number;
  /** 出てくる光の中心の高さ（画面に対する割合） */
  originY?: number;
  /** 面の高さ（px） */
  H: number;
  children: React.ReactNode;
};

/** 絵を置く範囲（画面の上からの割合） */
export const CHAR_TOP = 0.36;

export const CharBox: React.FC<Props> = ({ themed, revealAt, originY = 0.3, H, children }) => {
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
  if (!themed && revealAt <= 0) return <>{children}</>;
  const top = themed ? CHAR_TOP : 0;
  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        left: 0,
        width: "100%",
        top: `${top * 100}%`,
        height: `${(1 - top) * 100}%`,
        zIndex: 1,
        transformOrigin: `50% ${((originY - top) * H).toFixed(1)}px`,
      }}
    >
      {children}
    </div>
  );
};
