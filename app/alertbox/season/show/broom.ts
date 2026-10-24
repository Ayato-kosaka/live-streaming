/**
 * 段2（200〜499円）の振付け: ほうきに乗ったクロを、こうもりの子たちが追いかける（2版目）。
 *
 * オーナーのレビュー（2026-10-24）「謎の紙持ってるの違和感。動きがないので、もうちょいリッチに。
 * 猫キャラがほうきに乗って上部を左右にウロウロするのをコウモリが追いかける。左右に追いかけながら
 * 上下に揺れる」。木の札はやめた。
 *
 *   左の外からクロがほうきで飛び込む（こうもり3匹があとを追う）→ 面の上の端の帯を左右に往復。
 *   進みながら上下に波打ち（サイン波）、端で宙返りぎみに跳ねて向きを変える（ふり返って目を丸くする）。
 *   こうもりは同じ道を少し遅れてついてくる → 締めは右上の外へ逃げ切り、こうもりも追って消える
 *
 * **その人のキャラ絵は最初から出ている**（段1〜3）ので、クロとこうもりは帯（`headroom`。キャラ絵の
 * 四角の上）の中だけを飛ぶ。波の高さは、帯の上下に収まるぶんだけ。
 *
 * クロは貯金箱のマスコットの切り絵（先に読めている）。絵は右向きなので、ほうきの絵（柄が左）を
 * 裏返して柄を前にする。左へ飛ぶときは組ごと裏返す。
 *
 * 層（`layers.ts`）: クロとこうもりは actor（外の箱を最初から 4 に）、きらめきは top。
 */
import { EASE, type Motion } from "../rig/motion";
import { buildRig, type LoadedRig } from "../rig/RigView";
import { restOrigin } from "../rig/rig";
import type { TimedCue } from "./script";
import { makeBat, pathFrames, rigBounds, sparkle, type Bat } from "./fx";
import { bandBottomOf, div, type ShowLayers } from "./layers";

export type BroomRigs = { kuro: LoadedRig; broom: LoadedRig; bat: LoadedRig };

/** ほうきの長さ（面の幅に対する割合） */
const BROOM_W = 0.36;
/** クロの背丈（面の高さに対する割合） */
const KURO_H = 0.12;
/** 往復の端（面の幅に対する割合。乗り手の真ん中） */
const ENDS: [number, number] = [0.24, 0.76];
/** 片道の長さ（ms）と、端で向きを変える長さ（ms） */
const LEG_MS = 2300;
const TURN_MS = 420;
/** 片道で波打つ回数（端で波の高さが 0 に戻るよう、半周の奇数倍） */
const WAVES = 1.5;
/** こうもりが遅れてついてくる間（ms） */
const CHASE = [380, 640, 900];

export function runBroom(m: Motion, L: ShowLayers, rigs: BroomRigs, cues: TimedCue[], W: number, H: number): () => void {
  const X = (f: number) => f * W;
  const Y = (f: number) => f * H;
  L.frontBox.style.zIndex = "0";
  L.actorBox.style.zIndex = "4";

  // ---------------------------------------------------------------- 乗り手（ほうき＋クロ）。原点は腰かける所
  const rider = div(L.actor, { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px", willChange: "transform" });
  /** 向き（scaleX ±1）と、向きを変えるときの跳ね */
  const face = div(rider, { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px" });
  const bb = rigBounds(rigs.broom);
  const sb = X(BROOM_W) / bb.w;
  const broom = buildRig(rigs.broom, sb);
  const seatPart = rigs.broom.def.partAnchors.seat;
  const so = restOrigin(rigs.broom.def, "broom") ?? [0, 0];
  const seat: [number, number] = seatPart ? [so[0] + seatPart.at[0], so[1] + seatPart.at[1]] : [bb.l + bb.w * 0.36, bb.t + bb.h * 0.4];
  // ほうきの絵は柄が左。裏返して柄を右（クロの前）へ
  const broomBox = div(face, { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px", transform: "scaleX(-1)" });
  broom.root.style.left = `${-seat[0] * sb}px`;
  broom.root.style.top = `${-seat[1] * sb}px`;
  broomBox.appendChild(broom.root);
  const kb = rigBounds(rigs.kuro);
  const sk = Y(KURO_H) / kb.h;
  const kuro = buildRig(rigs.kuro, sk);
  /** クロの姿勢（乗ったまま弾む・ふり返る） */
  const kPose = div(face, { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px" });
  // 足元をほうきの柄の上（腰かける所の少し後ろ）に
  kuro.root.style.left = `${-(kb.l + kb.w * 0.5) * sk - X(0.03)}px`;
  kuro.root.style.top = `${-kb.b * sk + X(0.006)}px`;
  kPose.appendChild(kuro.root);
  kuro.swap("eye", "smile");
  kuro.swap("mouth", "omega");
  // しっぽはずっと揺れる。ほうきの穂も少し
  m.play(kuro.part("tail_root"), [{ transform: "rotate(-10deg)" }, { transform: "rotate(14deg)" }], { duration: 700, iterations: Infinity, direction: "alternate", easing: "ease-in-out" });
  m.play(kuro.part("tail_tip"), [{ transform: "rotate(-14deg)" }, { transform: "rotate(18deg)" }], { duration: 560, iterations: Infinity, direction: "alternate", easing: "ease-in-out" });
  m.play(kuro.part("hat_tip"), [{ transform: "rotate(-8deg)" }, { transform: "rotate(10deg)" }], { duration: 480, iterations: Infinity, direction: "alternate", easing: "ease-in-out" });

  /** 乗り手の上下の広がり（腰かける所から。舞台の px） */
  const above = (seat[1] - bb.t) * sb + Y(KURO_H);
  const below = (bb.b - seat[1]) * sb;

  // ---------------------------------------------------------------- こうもり（同じ道を遅れて）
  const bats: Bat[] = CHASE.map((_, i) => makeBat(m, rigs.bat, L.actor, X(0.17 - i * 0.015), 110 + i * 14));
  bats.forEach((b) => (b.el.style.opacity = "0"));

  /** 帯の中の、波の真ん中の高さと振れ幅。帯の上下に、傾いても収まるぶんだけ */
  const lane = () => {
    const band = bandBottomOf(L, W, H);
    const top = X(0.012) + above;
    const bottom = band - X(0.012) - below;
    const mid = (top + bottom) / 2;
    const amp = Math.max(0, Math.min(Y(0.02), (bottom - top) / 2 - X(0.008)));
    return { mid, amp };
  };

  /** `from` から `to` へ、波打ちながら飛ぶ道（舞台の px） */
  const legPath = (from: number, to: number, waves = WAVES, n = 28): [number, number][] => {
    const { mid, amp } = lane();
    const pts: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      pts.push([from + (to - from) * u, mid - Math.sin(u * waves * 2 * Math.PI) * amp]);
    }
    return pts;
  };
  let dir: 1 | -1 = 1;
  let x = -X(0.35);
  let legTimer = 0;
  let flying = true;

  /** 乗り手とこうもりを、同じ道で飛ばす（こうもりは遅れて、少し上下にずれて） */
  const fly = (pts: [number, number][], ms: number, easing = "linear") => {
    m.play(rider, pathFrames(pts, { tilt: 9 }), { duration: ms, fill: "forwards", easing });
    bats.forEach((b, i) => {
      const off = (i % 2 ? 1 : -1) * X(0.02) - X(0.03);
      const bp = pts.map(([px, py], j) => [px, py + off + Math.sin(j * 0.9 + i) * X(0.008)] as [number, number]);
      m.play(b.el, pathFrames(bp, { tilt: 16 }), { duration: ms, delay: CHASE[i], fill: "both", easing });
    });
  };

  /** 端で向きを変える: ぴょんと跳ねて裏返り、ふり返ってこうもりに目を丸くする */
  const turn = () => {
    const d = dir;
    dir = (d === 1 ? -1 : 1) as 1 | -1;
    m.play(face, [
      { transform: `translateY(0px) scaleX(${d})`, easing: EASE.up },
      { transform: `translateY(${-X(0.03)}px) scaleX(${d * 0.2})`, offset: 0.45, easing: EASE.down },
      { transform: `translateY(${-X(0.02)}px) scaleX(${-d * 0.4})`, offset: 0.6 },
      { transform: `translateY(0px) scaleX(${-d})` },
    ], { duration: TURN_MS, fill: "forwards" });
    kuro.swap("eye", "surprised");
    kuro.swap("mouth", "open");
    m.after(TURN_MS + 500, () => {
      kuro.swap("eye", "smile");
      kuro.swap("mouth", "omega");
    });
    const { mid } = lane();
    sparkle(m, L.top, x, mid - above * 0.6, X(0.06), TURN_MS * 0.4);
  };

  /** 片道ぶん飛んで、端で向きを変えて、次の片道 */
  const leg = () => {
    if (!flying) return;
    const to = X(dir === 1 ? ENDS[1] : ENDS[0]);
    fly(legPath(x, to), LEG_MS, "ease-in-out");
    x = to;
    legTimer = m.after(LEG_MS, () => {
      if (!flying) return;
      turn();
      legTimer = m.after(TURN_MS, leg);
    });
  };

  const on: Partial<Record<TimedCue["do"], (c: TimedCue) => void>> = {
    // 左の外から飛び込んで、右の端まで（こうもりが追いかけて入ってくる）
    batsIn: (c) => {
      const ms = (c.dur ?? 1.6) * 1000;
      face.style.transform = "scaleX(1)";
      bats.forEach((b) => (b.el.style.opacity = "1"));
      const to = X(ENDS[1]);
      fly(legPath(x, to, 2.5, 34), ms, "cubic-bezier(0.25, 0.6, 0.4, 1)");
      x = to;
      legTimer = m.after(ms, () => {
        turn();
        legTimer = m.after(TURN_MS, leg);
      });
    },
    // 締め: いまの向きのまま、右上の外へ逃げ切る（左向きなら、ぴょんと向きを変えてから）
    finale: (c) => {
      const ms = (c.dur ?? 2.6) * 1000;
      flying = false;
      if (legTimer) m.clear(legTimer);
      const go = () => {
        const { mid } = lane();
        const pts: [number, number][] = [];
        for (let i = 0; i <= 14; i++) {
          const u = i / 14;
          pts.push([x + (W + X(0.4) - x) * u, mid - Math.sin(u * 2 * Math.PI) * Y(0.012) - u * u * (mid + Y(0.05))]);
        }
        fly(pts, ms * 0.6, EASE.in);
      };
      // いまの片道を止めて、そこから
      const r = rider.getBoundingClientRect();
      const sr = L.dark.getBoundingClientRect();
      const k = sr.width / W || 1;
      x = (r.left - sr.left) / k;
      if (dir === -1) {
        turn();
        m.after(TURN_MS, go);
      } else go();
    },
  };

  for (const c of cues) {
    const fn = on[c.do];
    if (fn) m.at(c.t * 1000, () => fn(c));
  }
  return () => {
    flying = false;
  };
}
