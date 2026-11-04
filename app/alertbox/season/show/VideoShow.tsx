/**
 * 段の演出の動画（11月から。#1095）を、アラートの面に2層で重ねる。流す順番は `fxVideo.ts` の `runFxShow`。
 *
 * 重なりはアラートの面の中で、その人のキャラ絵（zIndex 1）と字（zIndex 3）を挟む:
 *
 *   0  back（キャラ絵の後ろ。景色・主役）
 *   1  その人のキャラ絵（index.tsx）
 *   2  front（キャラ絵の前。光と粒だけ。キャラ絵の顔の場所には何も描かない約束）
 *   3  字（index.tsx）
 *
 * 動画は面いっぱいに cover で置く（720×1280。面も 9:16）。箱を手で広げているあいだは、面ごと transform で
 * 拡がるので、ここは何もしない。出ているあいだに組み直さない（通知1件につき1回）
 */
import React, { useEffect, useRef } from "react";
import { runFxShow, type VideoPlan } from "./fxVideo";

type Props = {
  plan: VideoPlan;
  /** アラートが出ている秒数（フェードアウトの手前まで） */
  durationSec: number;
  /** 動画が1つも動かなかった（その秒）。index.tsx が、いまの段の見せ方に落とす */
  onFail: (sec: number) => void;
};

const layer: React.CSSProperties = {
  position: "absolute",
  left: 0,
  top: 0,
  width: "100%",
  height: "100%",
  overflow: "hidden",
  pointerEvents: "none",
};

export const VideoShow: React.FC<Props> = ({ plan, durationSec, onFail }) => {
  const back = useRef<HTMLDivElement | null>(null);
  const front = useRef<HTMLDivElement | null>(null);
  const failRef = useRef(onFail);
  failRef.current = onFail;

  useEffect(() => {
    if (!back.current || !front.current) return;
    return runFxShow(plan.kit, { back: back.current, front: front.current }, durationSec, (s) => failRef.current(s));
    // 通知1件につき1回
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div ref={back} data-show="layer" data-fx-video="back" data-fx-key={plan.key} aria-hidden style={{ ...layer, zIndex: 0 }} />
      <div ref={front} data-show="layer" data-fx-video="front" data-fx-key={plan.key} aria-hidden style={{ ...layer, zIndex: 2 }} />
    </>
  );
};
