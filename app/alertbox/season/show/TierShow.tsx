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
 *
 * ## 箱の大きさが途中で変わっても崩れない
 *
 * オーナーは投げ銭が来てから手で箱を大きくし、終わったら戻す。振付けは**決まった大きさの
 * 舞台（1080×1920）**の上で書き、層ごとにその舞台を今の箱へ拡げる（はみ出す側を切る
 * 「cover」）。大きさが変わったら拡げ方だけを変える。動きの keyframes は舞台の px なので、
 * 古い寸法を握らない。
 *
 * 層は3重: 重なりを決める外の箱 → 拡げる舞台（scale）→ 振付けが触る中の箱。揺れ（shake）は
 * 中の箱の transform を動かすので、舞台の scale と同じ要素に置くと、揺れているあいだ
 * scale が外れて満月が画面いっぱいに出た（録画で見つけた）
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

/** 振付けを書く舞台の大きさ（縦の配信 1080×1920） */
export const STAGE_W = 1080;
export const STAGE_H = 1920;

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
  /** 暗転の層の外の箱（その親がアラートの面。札を探すのに使う）・伯爵の層の外の箱（重なりを上げる） */
  const darkBox = useRef<HTMLDivElement | null>(null);
  const vladBox = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const L = {
      dark: dark.current,
      moon: moon.current,
      vlad: vlad.current,
      coffin: coffin.current,
      front: front.current,
      canvas: canvas.current,
      top: top.current,
      vladBox: vladBox.current,
    };
    if (Object.values(L).some((v) => !v)) return;
    const root = darkBox.current?.parentElement ?? L.dark!;
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
          STAGE_W,
          STAGE_H
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

  // 舞台を今の箱へ拡げる（cover）。真ん中合わせ
  const k = Math.max(W / STAGE_W, H / STAGE_H);
  const stage: React.CSSProperties = {
    position: "absolute",
    left: (W - STAGE_W * k) / 2,
    top: (H - STAGE_H * k) / 2,
    width: STAGE_W,
    height: STAGE_H,
    transformOrigin: "0 0",
    transform: `scale(${k})`,
    pointerEvents: "none",
  };
  const inner: React.CSSProperties = { position: "absolute", left: 0, top: 0, width: STAGE_W, height: STAGE_H };
  return (
    <>
      <div ref={darkBox} aria-hidden style={{ ...full, zIndex: 0 }}>
        <div style={stage}>
          <div ref={dark} style={inner} />
        </div>
      </div>
      <div aria-hidden style={{ ...full, zIndex: 0 }}>
        <div style={stage}>
          <div ref={moon} style={inner} />
        </div>
      </div>
      {/* 伯爵は退いたあと札の上へ出る（この外側の箱の重なりを上げる） */}
      <div ref={vladBox} aria-hidden style={{ ...full, zIndex: 0 }}>
        <div style={stage}>
          <div ref={vlad} style={inner} />
        </div>
      </div>
      <div aria-hidden style={{ ...full, zIndex: 0 }}>
        <div style={stage}>
          <div ref={coffin} style={inner} />
        </div>
      </div>
      <div aria-hidden style={{ ...full, zIndex: 2 }}>
        <div style={stage}>
          <div ref={front} style={inner}>
            <canvas ref={canvas} style={{ position: "absolute", left: 0, top: 0, width: STAGE_W, height: STAGE_H }} />
          </div>
        </div>
      </div>
      <div aria-hidden style={{ ...full, zIndex: 4 }}>
        <div style={stage}>
          <div ref={top} style={inner} />
        </div>
      </div>
    </>
  );
};
