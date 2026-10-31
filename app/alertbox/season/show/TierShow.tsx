/**
 * 段の演出（台本つき）を、アラートの面に重ねる。
 *
 * 層は React で置き、中身は振付け（`dracula.ts` など）が組む。層の重なりはアラートの面の中で
 * その人のキャラ絵（zIndex 1）と名前の札（zIndex 3）を挟むように決めてある:
 *
 *   0  暗転 / 古城と満月 / 主役 / 棺（同じ 0 は書いた順。主役は退いたあと 4 に上がる）
 *   1  その人のキャラ絵（index.tsx）
 *   2  金貨・きらめき・閃光（キャラ絵が出たら 0 へ下がる。滞在中は粒を顔の前に通さない）
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
import { runDracula } from "./dracula";
import { runMarch } from "./march";
import { runWizard } from "./wizard";
import { runGhost } from "./ghost";
import { runBroom } from "./broom";
import { runReaper } from "./reaper";
import { runZombie } from "./zombie";
import type { LoadedPoses } from "./poses";
import type { LoadedItems } from "./items";
import type { TierShow as TierShowDef } from "../../themes";

type Props = {
  show: TierShowDef;
  rigs: ReadonlyMap<string, LoadedRig>;
  /** あやとの仮装のポーズ絵（段4〜） */
  poses: ReadonlyMap<string, LoadedPoses>;
  /** 段の小物（古城・じゅうたん・紙吹雪…。段7〜） */
  items: ReadonlyMap<string, LoadedItems>;
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

export const TierShow: React.FC<Props> = ({ show, rigs, poses, items, durationSec, W, H }) => {
  const dark = useRef<HTMLDivElement | null>(null);
  const back = useRef<HTMLDivElement | null>(null);
  const actor = useRef<HTMLDivElement | null>(null);
  const mid = useRef<HTMLDivElement | null>(null);
  const front = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const top = useRef<HTMLDivElement | null>(null);
  /** 暗転の層の外の箱（その親がアラートの面。札を探すのに使う）・主役の層の外の箱（重なりを上げる） */
  const darkBox = useRef<HTMLDivElement | null>(null);
  const actorBox = useRef<HTMLDivElement | null>(null);
  const frontBox = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const L = {
      dark: dark.current,
      back: back.current,
      actor: actor.current,
      mid: mid.current,
      front: front.current,
      canvas: canvas.current,
      top: top.current,
      actorBox: actorBox.current,
      frontBox: frontBox.current,
    };
    if (Object.values(L).some((v) => !v)) return;
    const root = darkBox.current?.parentElement ?? L.dark!;
    const m = new Motion();
    let stop: (() => void) | null = null;
    try {
      const LL = { root, ...(L as Required<{ [K in keyof typeof L]: NonNullable<(typeof L)[K]> }>) };
      const script = resolveScript(show.script, durationSec, false);
      if (show.kind === "ghost") {
        stop = runGhost(m, LL, { ghost: rigs.get("ghost")!, bat: rigs.get("bat")! }, script, STAGE_W, STAGE_H);
      } else if (show.kind === "broom") {
        stop = runBroom(m, LL, { kuro: rigs.get("kuro")!, broom: rigs.get("broom")!, bat: rigs.get("bat")! }, script, STAGE_W, STAGE_H);
      } else if (show.kind === "wizard") {
        stop = runWizard(
          m,
          { root, ...(L as Required<{ [K in keyof typeof L]: NonNullable<(typeof L)[K]> }>) },
          { poses: poses.get("wizard")! },
          resolveScript(show.script, durationSec, false),
          STAGE_W,
          STAGE_H
        );
      } else if (show.kind === "march") {
        stop = runMarch(
          m,
          { root, ...(L as Required<{ [K in keyof typeof L]: NonNullable<(typeof L)[K]> }>) },
          { kid: rigs.get("pumpkin_kid")!, bat: rigs.get("bat")!, bucket: rigs.get("bucket") },
          resolveScript(show.script, durationSec, false),
          STAGE_W,
          STAGE_H
        );
      } else if (show.kind === "reaper") {
        stop = runReaper(
          m,
          { root, ...(L as Required<{ [K in keyof typeof L]: NonNullable<(typeof L)[K]> }>) },
          { poses: poses.get("reaper")!, bat: rigs.get("bat")!, items: items.get("reaper") },
          resolveScript(show.script, durationSec, false),
          STAGE_W,
          STAGE_H
        );
      } else if (show.kind === "zombie") {
        stop = runZombie(
          m,
          { root, ...(L as Required<{ [K in keyof typeof L]: NonNullable<(typeof L)[K]> }>) },
          { poses: poses.get("zombie")!, kid: rigs.get("pumpkin_kid")!, ghost: rigs.get("ghost")!, bat: rigs.get("bat")!, items: items.get("zombie") },
          resolveScript(show.script, durationSec, false),
          STAGE_W,
          STAGE_H
        );
      } else if (show.kind === "dracula") {
        stop = runDracula(
          m,
          LL,
          { pose: poses.get("dracula")!, items: items.get("dracula")!, bat: rigs.get("bat")!, props: rigs.get("props")! },
          // 時計がヒットストップで止まるので、ここではずらさない（二重になる）
          script,
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
      <div ref={darkBox} data-show="layer" aria-hidden style={{ ...full, zIndex: 0 }}>
        <div style={stage}>
          <div ref={dark} style={inner} />
        </div>
      </div>
      <div data-show="layer" aria-hidden style={{ ...full, zIndex: 0 }}>
        <div style={stage}>
          <div ref={back} style={inner} />
        </div>
      </div>
      {/* 主役は退いたあと字とキャラ絵より手前へ出る（この外側の箱の重なりを上げる） */}
      <div ref={actorBox} data-show="layer" aria-hidden style={{ ...full, zIndex: 0 }}>
        <div style={stage}>
          <div ref={actor} style={inner} />
        </div>
      </div>
      <div data-show="layer" aria-hidden style={{ ...full, zIndex: 0 }}>
        <div style={stage}>
          <div ref={mid} style={inner} />
        </div>
      </div>
      {/* 粒の層。キャラ絵が出たらキャラ絵の後ろ（0）へ下がる（振付けが下げる） */}
      <div ref={frontBox} data-show="layer" aria-hidden style={{ ...full, zIndex: 2 }}>
        <div style={stage}>
          <div ref={front} style={inner}>
            <canvas ref={canvas} style={{ position: "absolute", left: 0, top: 0, width: STAGE_W, height: STAGE_H }} />
          </div>
        </div>
      </div>
      <div data-show="layer" aria-hidden style={{ ...full, zIndex: 4 }}>
        <div style={stage}>
          <div ref={top} style={inner} />
        </div>
      </div>
    </>
  );
};
