/**
 * 段の演出（台本つき）を、アラートの面に重ねる。
 *
 * 層は React で置き、中身は振付け（`vampire.ts`）が組む。層の重なりはアラートの面の中で
 * その人のキャラ絵（zIndex 1）と名前の札（zIndex 3）を挟むように決めてある:
 *
 *   0  暗転 / 満月 / 伯爵 / 棺（同じ 0 は書いた順。伯爵は退いたあと 4 に上がる）
 *   1  その人のキャラ絵（index.tsx）
 *   2  金貨・きらめき・閃光
 *   3  名前の札（index.tsx）
 *   4  こうもり
 *
 * 出ているあいだに台本を組み直さない（通知1件につき1回）。
 */
import React, { useEffect, useRef } from "react";
import { Motion } from "../rig/motion";
import type { LoadedRig } from "../rig/RigView";
import { resolveScript } from "./script";
import { runVampire } from "./vampire";
import type { TierShow as TierShowDef } from "../../themes";

type Props = {
  show: TierShowDef;
  rigs: ReadonlyMap<string, LoadedRig>;
  durationSec: number;
  W: number;
  H: number;
};

const full: React.CSSProperties = {
  position: "absolute",
  left: 0,
  top: 0,
  width: "100%",
  height: "100%",
  pointerEvents: "none",
  overflow: "hidden",
};

/** この段の演出に要る部品の組が、全部読めているか */
export function showReady(show: TierShowDef | undefined, rigs: ReadonlyMap<string, LoadedRig>): boolean {
  return !!show && show.rigs.every((r) => rigs.has(r));
}

export const TierShow: React.FC<Props> = ({ show, rigs, durationSec, W, H }) => {
  const dark = useRef<HTMLDivElement | null>(null);
  const moon = useRef<HTMLDivElement | null>(null);
  const vlad = useRef<HTMLDivElement | null>(null);
  const coffin = useRef<HTMLDivElement | null>(null);
  const front = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const top = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const L = {
      dark: dark.current,
      moon: moon.current,
      vlad: vlad.current,
      coffin: coffin.current,
      front: front.current,
      canvas: canvas.current,
      top: top.current,
    };
    if (Object.values(L).some((v) => !v)) return;
    const root = L.dark!.parentElement ?? L.dark!;
    const m = new Motion();
    let stop: (() => void) | null = null;
    try {
      if (show.kind === "vampire") {
        stop = runVampire(
          m,
          { root, ...(L as Required<{ [K in keyof typeof L]: NonNullable<(typeof L)[K]> }>) },
          { vlad: rigs.get("vlad")!, bat: rigs.get("bat")!, props: rigs.get("props")! },
          // 時計がヒットストップで止まるので、ここではずらさない（二重になる）
          resolveScript(show.script, durationSec, false),
          W,
          H
        );
      }
    } catch (e) {
      // 演出がこけても、アラート（名前・額・その人の絵）は出たままにする
      console.error(e);
    }
    return () => {
      stop?.();
      m.dispose();
    };
    // 通知1件につき1回
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div ref={dark} aria-hidden style={{ ...full, zIndex: 0 }} />
      <div ref={moon} aria-hidden style={{ ...full, zIndex: 0 }} />
      <div ref={vlad} aria-hidden style={{ ...full, zIndex: 0, overflow: "visible" }} />
      <div ref={coffin} aria-hidden style={{ ...full, zIndex: 0 }} />
      <div ref={front} aria-hidden style={{ ...full, zIndex: 2 }}>
        <canvas ref={canvas} style={{ position: "absolute", left: 0, top: 0, width: W, height: H }} />
      </div>
      <div ref={top} aria-hidden style={{ ...full, zIndex: 4 }} />
    </>
  );
};
