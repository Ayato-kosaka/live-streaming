/**
 * 段6（5,000〜9,999円・マゼンタ）の振付け: ゾンビのあやと（構成 v3）。
 *
 * あやとはポーズ絵（墓から上半身を出す rise・踊る dance・待機 idle）を絵ごと動かす。
 *
 *   前兆 1.2秒: 画面の端が暗く＋紫の稲光2回＋地鳴り（演出の層だけ震える）
 *   → 墓石3つが次々せり上がる（土のかけらが飛ぶ）→ まんなかの墓の前で、土を割って手が出る
 *   → 墓から上半身を出して這い出す（土が飛び散る・一瞬止める）
 *   → 跳び出して決めポーズ（稲光）、左右に跳ねて踊る。かぼちゃ坊やとちびおばけが出てきて並んで弾む
 *   → 字が1字ずつ弾んで出る → 「ドン」 → ゾンビは上の帯の右の角へ跳ぶ（その人のキャラ絵が出る）。
 *   小さな墓の横でゆらゆら、ときどき決めポーズ
 *   → 滞在（2版目、オーナーのレビュー）: 墓石・かぼちゃ坊や・ちびおばけは**その人のキャラ絵の背景に残る**
 *     （キャラ絵の後ろの層）。マゼンタのオーラも後ろに残る。ときどきゾンビが決めポーズをすると、
 *     墓石の1つが**掘り直される**（沈んで土が飛び、また生えてくる。となりの坊やが跳ねる）
 *   → 締め（`curtainCall`）: キャラ絵と字が消える → ゾンビが真ん中へ戻る → 土へずぼっと潜って消える
 *
 * 段5（死神）より一段リッチに: 前兆が長く強い（稲光・地鳴り）・画面の幅いっぱいの墓場（面の 8 割）・
 * 主役のほかに仲間4人・土の粒・踊り。
 *
 * その人のキャラ絵が出たあとは、ゾンビも墓も土もキャラ絵の顔の前を通らない（オーナーの決まり）:
 * 滞在は上の帯（`headroom`）の中だけ。帯に着いたら主役の層を帯の下の辺で切る（墓へ沈むのもこの切り口）。
 *
 * 層（`layers.ts`）: 端の暗さは dark、稲光の筋と墓石は back、ゾンビは actor、坊や・おばけ・手・地面の霧は mid、
 * 土のかけら・閃光は front、待つあいだのきらめきは top。
 */
import { EASE, range, type Motion } from "../rig/motion";
import { attachItem, buildRig, type LoadedRig, type RigHandle } from "../rig/RigView";
import { restPivot } from "../rig/rig";
import type { TimedCue } from "./script";
import { dustPuffs, rigBounds, sparkle } from "./fx";
import { bandBottomOf, div, edgeFade, outerBoxOf, plateBoxOf, type ShowLayers } from "./layers";
import type { LoadedPoses } from "./poses";
import type { LoadedItems } from "./items";
import { makePoseActor } from "./poseActor";
import { centerOf, curtainCall, every } from "./common";
import {
  Items,
  arcMove,
  atTf,
  batsAcross,
  edgeDark,
  fadeSides,
  fadeOut,
  flashOnce,
  gate,
  jolt,
  popPose,
  rumble,
  sparkRing,
  type At,
} from "./undead";

export type ZombieAssets = { poses: LoadedPoses; kid: LoadedRig; ghost: LoadedRig; bat: LoadedRig; items: LoadedItems | undefined };

/**
 * 地面の高さの上下の限り（面に対する割合）。実際の地面は字のブロックの上端のすぐ上（`groundY`）。
 * 墓場は面の上半分に収まり、字はその下（キャラ絵の上下中央）に出る。上は面の上の端から 3% を空ける
 */
const GROUND = { min: 0.4, max: 0.62, top: 0.01 };
/** 踊る姿が弾んだ・跳び出したときに縦へ伸びるぶん（この背でも頭が面の上の端から出ないように） */
const TALLEST = 1.12;
/**
 * 踊る姿（dance）の高さの上限。面の高さの 0.46（段5の死神 0.44 より大きい）。地面の上に入りきらなければ
 * 縮める
 */
const DANCE_H = 0.46;
/** 墓石（中身の高さ。面の高さに対する割合）。左・右・まんなか（ゾンビの墓）の順にせり上がる */
const GRAVES = [
  { name: "tombstone_a", x: 0.19, h: 0.165 },
  { name: "tombstone_b", x: 0.81, h: 0.175 },
  { name: "tombstone_c", x: 0.5, h: 0.2 },
];
const HAND_W = 0.3;
/**
 * かぼちゃ坊や（地面から跳び出す）と、ちびおばけ（坊やの上に浮かぶ。`dy` は坊やの頭の上からの高さ）。
 * 段3・段1 の仲間より大きく（坊や 1.6 倍・おばけ 1.5 倍）、画面の端で切れないように内へ詰める。
 * 仲間はゾンビの後ろに立つ（主役の体の前を塞がない）
 */
const KIDS = [
  { x: 0.17, hat: "hat_pointy" },
  { x: 0.83, hat: "hat_ribbon" },
];
const KID_H = 0.18;
const GHOSTS = [
  { x: 0.165, dy: 0.075 },
  { x: 0.835, dy: 0.055 },
];
const GHOST_W = 0.3;
/** 滞在のオーラ（キャラ絵の後ろに残るマゼンタの光）の色・半径（面の幅に対する割合）・濃さ */
const AURA = { rgb: "220,50,150", r: 0.55, alpha: 0.42 };
/** 踊りの1拍（ms） */
const BEAT = 430;
/** 待つときの高さと、右の端からのすき間。小さな墓は左どなり */
const STAY_H = 0.16;
/** 帯の中でポーズを替えるときの弾みの強さと、決めポーズで弾む高さ（伸びた頭が面の上の端で切れない） */
const STAY_POP = 0.5;
const STAY_HOP = 0.012;
const STAY_RIGHT = 0.04;
const STAY_GRAVE_H = 0.1;
const MAG = "255,64,129";
const VIO = "200,130,255";
const PALE = "255,220,244";

export function runZombie(
  m: Motion,
  L: ShowLayers,
  a: ZombieAssets,
  cues: TimedCue[],
  W: number,
  H: number
): () => void {
  const X = (f: number) => f * W;
  const Y = (f: number) => f * H;
  /* 地面（足元の線）。字（名前・額。キャラ絵の上下中央）が出る瞬間に、ゾンビは顔も体も字の
     ブロックより上にいる（オーナーの決まり: 主役を字で隠さない。字が脚に乗っていたのを直した）。
     字のブロックの上端のすぐ上を地面にし、ゾンビが入りきらなければ縮める。字のブロックは長い名前・
     3行のメッセージで背が伸びるので、ここで測る（札の置き場は振付けより先に組まれている） */
  const pb0 = plateBoxOf(L, W, H);
  /* 横の位置は、字とその人のキャラ絵の真ん中にそろえる（2版目の決まり）。墓場もここを中心に並べる */
  const center = centerOf(L, W, H);
  const cx = center.x;
  /** 面の幅に対する割合の横の位置を、真ん中（cx）基準に直す */
  const XC = (f: number) => cx + (f - 0.5) * W;
  const groundY = Math.max(Y(GROUND.min), Math.min(Y(GROUND.max), pb0.t - X(0.015)));
  /** 登場のあいだのゾンビの倍率（1 で踊る姿が面の DANCE_H） */
  const k0 = Math.min(1, (groundY - Y(GROUND.top)) / (Y(DANCE_H) * TALLEST));
  /**
   * 跳ぶ・弾む高さの上限。踊る姿の頭のてっぺんが面の上の端から出ない高さ（跳び出したとき、
   * 頭が面の上で切れていた）
   */
  const headroom = Math.max(Y(0.015), groundY - Y(DANCE_H) * k0 * TALLEST - Y(GROUND.top));
  // 小物（墓石・手・土）は土台が展開し終えている（show.items）
  const items = new Items(a.items);

  // ---------------------------------------------------------------- 端の暗さ・閃光
  fadeSides(L);
  const dark = edgeDark(L.dark, "rgba(26,0,32,0.92)");
  let darkNow = 0;
  const darkTo = (to: number, ms: number) => {
    m.play(dark, [{ opacity: darkNow }, { opacity: to }], { duration: ms, easing: EASE.inOut, fill: "forwards" });
    darkNow = to;
  };
  // 稲光の閃光も箱の縁で 0 に溶かす（縁まで光ると、ウィジェットの四角が浮く）
  const flash = div(outerBoxOf(L.front), {
    position: "absolute",
    inset: "0px",
    background: edgeFade([[0, "rgba(250,230,255,1)"], [45, "rgba(214,140,255,0.8)"], [80, "rgba(160,60,220,0.45)"], [100, "rgba(160,60,220,0)"]], "50% 35%"),
    opacity: "0",
  });
  const shakeEls = [L.back, L.actor, L.mid];

  // ---------------------------------------------------------------- 地面（墓石と坊やはこの線から下を描かない）
  const groundClip = (parent: HTMLElement) =>
    div(parent, { position: "absolute", left: "0px", top: "0px", width: `${W}px`, height: `${(groundY + 2).toFixed(1)}px`, overflow: "hidden" });
  const graveClip = groundClip(L.back);
  const graves: { box: HTMLDivElement; h: number; x: number }[] = [];

  // ---------------------------------------------------------------- ゾンビ（解読が済むまで出さない）
  const gateBox = div(L.actor, { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px" });
  const actor = makePoseActor(gateBox, a.poses, { ref: "dance", height: Y(DANCE_H), anchor: "feet" });
  actor.show("rise");
  gate(gateBox);
  /** 墓から出るときの足元（rise の絵の土の盛り上がりの下の辺）。地面より少し下 */
  const moundY = groundY + Y(0.02) * k0;
  let now: At = { x: cx, y: moundY, k: k0 };
  actor.pos.style.opacity = "0";
  actor.pos.style.transform = atTf(now);
  const pt = (name: string, p: [number, number]) => {
    const [dx, dy] = actor.offset(name, p);
    return { x: now.x + dx * now.k, y: now.y + dy * now.k };
  };
  const pop = (name: string, ms = 340, hard = 1, parent: HTMLElement = L.top) =>
    popPose(m, actor, name, ms, hard, () => {
      const c = pt(name, [330, 450]);
      sparkRing(m, parent, c.x, c.y, X(0.15) * now.k, 6, X(0.08) * Math.max(0.5, now.k), [MAG, VIO, PALE]);
    });

  // ---------------------------------------------------------------- 仲間（解読が済むまで出さない）
  type Kid = { pos: HTMLDivElement; pose: HTMLDivElement; h: RigHandle };
  type Ghost = { pos: HTMLDivElement; bob: HTMLDivElement; h: RigHandle };
  // 仲間は墓石の手前・ゾンビの後ろ（同じ奥の層に、墓石のあとに置く）
  const kidClip = groundClip(L.back);
  const kidGate = div(kidClip, { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px" });
  const ghostGate = div(L.back, { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px" });
  const kb = rigBounds(a.kid);
  const ks = Y(KID_H) / kb.h;
  const hip = restPivot(a.kid.def, "body") ?? [kb.l + kb.w / 2, kb.b];
  const kids: Kid[] = KIDS.map((d) => {
    const h = buildRig(a.kid, ks);
    attachItem(h, a.kid, d.hat, "hatOn", 25);
    const spot = div(kidGate, { position: "absolute", left: `${XC(d.x).toFixed(1)}px`, top: `${groundY.toFixed(1)}px`, width: "0px", height: "0px" });
    const pos = div(spot, { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px", willChange: "transform" });
    const pose = div(pos, { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px" });
    h.root.style.left = `${(-hip[0] * ks).toFixed(1)}px`;
    h.root.style.top = `${(-kb.b * ks).toFixed(1)}px`;
    pose.appendChild(h.root);
    // 地面の下で待つ
    pos.style.transform = `translateY(${(Y(KID_H) * 1.4).toFixed(1)}px)`;
    // 右の子は内側（左）を向く
    if (d.x > 0.5) pose.style.transform = "scaleX(-1)";
    return { pos, pose, h };
  });
  const gb = rigBounds(a.ghost);
  const gs = X(GHOST_W) / gb.w;
  const ghosts: Ghost[] = GHOSTS.map((d) => {
    const h = buildRig(a.ghost, gs);
    h.swap("face", "boo");
    const gy = groundY - Y(KID_H) - Y(d.dy) - (gb.h * gs) / 2;
    const pos = div(ghostGate, { position: "absolute", left: `${XC(d.x).toFixed(1)}px`, top: `${gy.toFixed(1)}px`, width: "0px", height: "0px", willChange: "transform", opacity: "0" });
    const bob = div(pos, { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px" });
    h.root.style.left = `${(-(gb.l + gb.w / 2) * gs).toFixed(1)}px`;
    h.root.style.top = `${(-(gb.t + gb.h / 2) * gs).toFixed(1)}px`;
    bob.appendChild(h.root);
    if (d.x > 0.5) h.root.style.transform = "scaleX(-1)";
    return { pos, bob, h };
  });
  gate(kidGate);
  gate(ghostGate);

  // ---------------------------------------------------------------- 地面の霧（墓石と仲間の足元の継ぎ目を隠す）
  const fog: HTMLDivElement[] = [];
  const fogBlob = (parent: HTMLElement, cx: number, cy: number, w: number, h: number) =>
    div(parent, {
      position: "absolute",
      left: `${(cx - w / 2).toFixed(1)}px`,
      top: `${(cy - h / 2).toFixed(1)}px`,
      width: `${w.toFixed(1)}px`,
      height: `${h.toFixed(1)}px`,
      background: "radial-gradient(ellipse at 50% 50%, rgba(226,196,240,0.7) 0%, rgba(190,140,220,0.4) 40%, rgba(160,100,200,0) 70%)",
      opacity: "0",
    });

  // ---------------------------------------------------------------- 土のかけら
  const DIRT = ["dirt_l", "dirt_m", "dirt_s"];
  /** (x, y) から土のかけらを `n` 個、放物線で飛ばす。`power` は勢い（1 で面の高さの半分ほど跳ぶ） */
  const dirt = (parent: HTMLElement, x: number, y: number, n: number, power = 1, spread = 0.9) => {
    for (let i = 0; i < n; i++) {
      const name = DIRT[i % 3 === 0 ? 0 : i % 3 === 1 ? 1 : 2];
      const size = X(name === "dirt_l" ? 0.055 : name === "dirt_m" ? 0.04 : 0.026) * (0.8 + Math.random() * 0.4);
      const p = items.place(name, parent, size, "center");
      if (!p) continue;
      const vx = (Math.random() - 0.5) * X(spread) * Math.sqrt(power);
      const vy = -Y(0.55 + Math.random() * 0.45) * Math.sqrt(power);
      const g = Y(2.8);
      const T = 0.75 + Math.random() * 0.3;
      const spin = (Math.random() - 0.5) * 900;
      const frames: Keyframe[] = [];
      for (let j = 0; j <= 8; j++) {
        const t = (j / 8) * T;
        frames.push({
          transform: `translate(${(x + vx * t).toFixed(1)}px, ${(y + vy * t + 0.5 * g * t * t).toFixed(1)}px) rotate(${(spin * t).toFixed(0)}deg)`,
          opacity: j === 8 ? 0 : 1,
        });
      }
      p.box.style.transform = frames[0].transform as string;
      const an = m.play(p.box, frames, { duration: T * 1000, easing: "linear", delay: Math.random() * 60, fill: "backwards" });
      const rm = () => p.box.remove();
      if (an) an.finished.then(rm, rm);
      else rm();
    }
  };

  // ---------------------------------------------------------------- 稲光
  const bolt = (cx: number, w: number, h: number, mirror: boolean) => {
    const el = div(L.back, {
      position: "absolute",
      left: `${(cx - w / 2).toFixed(1)}px`,
      top: `${(-Y(0.02)).toFixed(1)}px`,
      width: `${w.toFixed(1)}px`,
      height: `${h.toFixed(1)}px`,
      transform: mirror ? "scaleX(-1)" : "",
      opacity: "0",
    });
    el.innerHTML = boltSvg();
    const an = m.play(el, [
      { opacity: 0 },
      { opacity: 1, offset: 0.08 },
      { opacity: 0.15, offset: 0.22 },
      { opacity: 1, offset: 0.36 },
      { opacity: 0.35, offset: 0.62 },
      { opacity: 0 },
    ], { duration: 460, easing: "linear" });
    const rm = () => el.remove();
    if (an) an.finished.then(rm, rm);
    else rm();
  };

  // ---------------------------------------------------------------- 踊り
  /** 跳ねて、着くたびに左右を入れ替える（2拍で1周）。足元が原点の箱に掛ける */
  const danceFrames = (hop: number): Keyframe[] => [
    { transform: "translateY(0px) scale(1, 1)", easing: EASE.up },
    { transform: `translateY(${-hop}px) scale(0.96, 1.05)`, offset: 0.22, easing: EASE.down },
    { transform: "translateY(0px) scale(1.06, 0.94)", offset: 0.46 },
    { transform: "translateY(0px) scale(-1.06, 0.94)", offset: 0.5, easing: EASE.up },
    { transform: `translateY(${-hop}px) scale(-0.96, 1.05)`, offset: 0.72, easing: EASE.down },
    { transform: "translateY(0px) scale(-1.06, 0.94)", offset: 0.96 },
    { transform: "translateY(0px) scale(1, 1)" },
  ];
  const kidHop = (k: Kid, hi: number, iterations = 1, delay = 0) =>
    m.play(k.pose, [
      { transform: `${k.pose.style.transform} translateY(0px) scale(1, 1)`, easing: EASE.out },
      { transform: `${k.pose.style.transform} translateY(0px) scale(1.1, 0.88)`, offset: 0.14, easing: EASE.up },
      { transform: `${k.pose.style.transform} translateY(${-hi}px) scale(0.94, 1.08)`, offset: 0.5, easing: EASE.down },
      { transform: `${k.pose.style.transform} translateY(0px) scale(1.12, 0.86)`, offset: 0.86, easing: EASE.out },
      { transform: `${k.pose.style.transform} translateY(0px) scale(1, 1)` },
    ], { duration: BEAT, iterations, delay });

  let stayTimer = 0;
  let aura: HTMLDivElement | null = null;
  let stopDig: (() => void) | null = null;
  /** 土から出た手（這い出すときに引っ込める） */
  let handEl: HTMLDivElement | null = null;
  let stayGrave: HTMLDivElement | null = null;

  const on: Partial<Record<TimedCue["do"], (c: TimedCue) => void>> = {
    // 前兆: 端が暗くなる（マゼンタがかった闇）
    darken: (c) => darkTo(c.to ?? 0.92, (c.dur ?? 0.5) * 1000),

    // 前兆: 地鳴り。演出の層だけ細かく震える
    rumble: (c) => rumble(m, shakeEls, (c.dur ?? 1) * 1000, X(0.009)),

    // 紫の稲光。筋が走って、画面が2回瞬く
    lightning: (c) => {
      const n = c.n ?? 0;
      if (n === 0 || n === 2) bolt(X(n === 2 ? 0.14 : 0.24), X(0.22), Y(n === 2 ? 0.42 : 0.55), false);
      if (n === 1 || n === 2) bolt(X(n === 2 ? 0.86 : 0.76), X(0.22), Y(n === 2 ? 0.42 : 0.55), true);
      m.play(flash, [
        { opacity: 0 },
        { opacity: 0.5, offset: 0.08 },
        { opacity: 0.05, offset: 0.22 },
        { opacity: 0.38, offset: 0.36 },
        { opacity: 0 },
      ], { duration: 420, easing: "linear" });
    },

    // 墓石が左・右・まんなかの順にせり上がる。地面を割るところで土が飛ぶ
    graves: (c) => {
      const ms = (c.dur ?? 0.9) * 1000;
      for (let i = 0; i < GRAVES.length; i++) {
        const d = GRAVES[i];
        const it = items.get(d.name);
        if (!it) continue;
        const [x0, y0, x1, y1] = it.content;
        const hh = Y(d.h) * k0;
        const ww = (hh * (x1 - x0)) / Math.max(1, y1 - y0);
        const p = items.place(d.name, graveClip, ww, "bottom");
        if (!p) continue;
        p.box.style.left = `${XC(d.x).toFixed(1)}px`;
        p.box.style.top = `${groundY.toFixed(1)}px`;
        p.box.style.transform = `translateY(${(hh + 8).toFixed(1)}px)`;
        graves.push({ box: p.box, h: hh, x: XC(d.x) });
        const delay = (i * ms) / GRAVES.length;
        m.play(p.box, [
          { transform: `translateY(${(hh + 8).toFixed(1)}px)`, easing: EASE.out },
          { transform: `translateY(${(-hh * 0.07).toFixed(1)}px)`, offset: 0.72, easing: EASE.inOut },
          { transform: "translateY(0px)" },
        ], { duration: 420, delay, fill: "both" });
        m.after(delay + 60, () => {
          dirt(L.front, XC(d.x), groundY - Y(0.01), 5, 0.45, 0.6);
          dustPuffs(m, L.mid, XC(d.x) - ww * 0.4, groundY - Y(0.005), X(0.09), 2);
          dustPuffs(m, L.mid, XC(d.x) + ww * 0.4, groundY - Y(0.005), X(0.09), 2);
          jolt(m, shakeEls, 180, X(0.01));
        });
      }
      // 地面の霧（墓石の根元の継ぎ目を隠す）
      for (const [fx, fw] of [[0.2, 0.62], [0.5, 0.7], [0.8, 0.62]] as const) {
        const f = fogBlob(L.mid, XC(fx), groundY + Y(0.005), X(fw), Y(0.075));
        m.play(f, [{ opacity: 0 }, { opacity: 1 }], { duration: 600, fill: "forwards" });
        fog.push(f);
      }
    },

    // まんなかの墓の前で、土を割って手が出る。指をわきわき
    hand: (c) => {
      const ms = (c.dur ?? 0.65) * 1000;
      const p = items.place("hand_from_soil", L.mid, X(HAND_W) * k0, "bottom");
      if (!p) return;
      p.box.style.left = `${cx.toFixed(1)}px`;
      p.box.style.top = `${moundY.toFixed(1)}px`;
      m.play(p.box, [
        { transform: "scale(0.5, 0)", easing: EASE.out },
        { transform: "scale(1.08, 1.18)", offset: 0.4, easing: EASE.inOut },
        { transform: "scale(0.97, 0.95)", offset: 0.6, easing: EASE.inOut },
        { transform: "rotate(-7deg)", offset: 0.72 },
        { transform: "rotate(6deg)", offset: 0.84 },
        { transform: "rotate(-4deg)", offset: 0.93 },
        { transform: "rotate(0deg)" },
      ], { duration: ms, fill: "both" });
      dirt(L.front, cx, moundY - p.h * 0.3, 6, 0.5, 0.7);
      dustPuffs(m, L.mid, cx, moundY - Y(0.01), X(0.1), 3);
      handEl = p.box;
    },

    // 墓から上半身を出して這い出す（手は引っ込み、土が飛び散る）
    rise: (c) => {
      const ms = (c.dur ?? 0.45) * 1000;
      if (handEl) {
        const h = handEl;
        const an = m.play(h, [{ transform: "scale(1)", opacity: 1 }, { transform: "scale(0.9, 0.3)", opacity: 0 }], { duration: 110, fill: "forwards" });
        const rm = () => h.remove();
        if (an) an.finished.then(rm, rm);
        else rm();
      }
      actor.pos.style.opacity = "1";
      m.play(actor.squash, [
        { transform: "scale(0.7, 0.15)", easing: EASE.out },
        { transform: "scale(0.92, 1.16)", offset: 0.45, easing: EASE.inOut },
        { transform: "scale(1.05, 0.95)", offset: 0.75, easing: EASE.inOut },
        { transform: "scale(1, 1)" },
      ], { duration: ms });
      dirt(L.front, cx, moundY - Y(0.06), 14, 1, 1.1);
      dustPuffs(m, L.mid, cx - X(0.18), moundY - Y(0.01), X(0.12), 3);
      dustPuffs(m, L.mid, cx + X(0.18), moundY - Y(0.01), X(0.12), 3);
      const c0 = pt("rise", [340, 255]);
      sparkRing(m, L.front, c0.x, c0.y, X(0.2), 7, X(0.09), [MAG, VIO, PALE]);
    },

    shake: (c) => jolt(m, shakeEls, (c.dur ?? 0.25) * 1000, X(0.025)),

    hitstop: (c) => m.hitstop((c.dur ?? 0.06) * 1000),

    // 跳び出して決めポーズ。着いたら左右に跳ねて踊る
    dance: () => {
      const up = { ...now, y: groundY - Math.min(Y(0.11) * k0, headroom) };
      const land: At = { ...now, y: groundY };
      m.play(actor.pos, [
        { transform: atTf(now), easing: EASE.up },
        { transform: atTf(up), offset: 0.45, easing: EASE.down },
        { transform: atTf(land) },
      ], { duration: 520, fill: "forwards" });
      m.play(actor.squash, [
        { transform: "scale(1.1, 0.85)", easing: EASE.out },
        { transform: "scale(0.93, 1.07)", offset: 0.25 },
        { transform: "scale(1, 1)", offset: 0.5 },
        { transform: "scale(0.96, 1.04)", offset: 0.9, easing: EASE.out },
        { transform: "scale(1.14, 0.86)", offset: 0.97 },
        { transform: "scale(1, 1)" },
      ], { duration: 640 });
      now = land;
      m.after(120, () => {
        actor.show("dance");
        dirt(L.front, cx, moundY - Y(0.03), 10, 0.8, 1);
        dustPuffs(m, L.mid, cx, moundY - Y(0.01), X(0.14), 4);
      });
      m.after(520, () => {
        const c = pt("dance", [330, 450]);
        sparkRing(m, L.front, c.x, c.y, X(0.26), 8, X(0.1), [MAG, PALE, VIO]);
        dustPuffs(m, L.mid, cx, groundY - Y(0.005), X(0.1), 3);
        m.play(actor.bob, danceFrames(Math.min(Y(0.03), headroom) / k0), { duration: BEAT * 2, iterations: Infinity });
      });
    },

    // 仲間が出てきて並んで弾む: 坊やは地面から跳び出し、おばけは墓の上に「ばあ！」
    friends: (c) => {
      const ms = (c.dur ?? 0.5) * 1000;
      kids.forEach((k, i) => {
        m.play(k.pos, [
          { transform: `translateY(${(Y(KID_H) * 1.4).toFixed(1)}px)`, easing: EASE.out },
          { transform: `translateY(${(-Y(0.03)).toFixed(1)}px)`, offset: 0.7, easing: EASE.inOut },
          { transform: "translateY(0px)" },
        ], { duration: ms * 0.8, delay: i * 90, fill: "both" });
        k.h.swap("head", "open");
        m.after(ms + i * 90, () => {
          k.h.swap("head", "smile");
          kidHop(k, Y(0.035), Infinity, (i * BEAT) / 2);
          const o = { duration: BEAT, iterations: Infinity, direction: "alternate" as const, easing: "ease-in-out", delay: (i * BEAT) / 2 };
          m.play(k.h.part("arm_l"), [{ transform: "rotate(0deg)" }, { transform: "rotate(42deg)" }], o);
          m.play(k.h.part("arm_r"), [{ transform: "rotate(0deg)" }, { transform: "rotate(-42deg)" }], o);
        });
        dirt(L.front, XC(KIDS[i].x), groundY - Y(0.01), 4, 0.35, 0.5);
      });
      ghosts.forEach((g, i) => {
        m.play(g.pos, [
          { transform: "scale(0)", opacity: 0, easing: EASE.back },
          { transform: "scale(1)", opacity: 1 },
        ], { duration: ms * 0.7, delay: 150 + i * 120, fill: "both" });
        m.after(ms + 500 + i * 120, () => g.h.swap("face", "smile"));
        m.play(g.bob, [{ transform: `translateY(${(-Y(0.012)).toFixed(1)}px)` }, { transform: `translateY(${Y(0.012).toFixed(1)}px)` }], {
          duration: BEAT, iterations: Infinity, direction: "alternate", easing: "ease-in-out", delay: i * BEAT,
        });
        m.play(g.h.part("hand_l"), [{ transform: "rotate(-14deg)" }, { transform: "rotate(16deg)" }], {
          duration: BEAT, iterations: Infinity, direction: "alternate", easing: "ease-in-out",
        });
        m.play(g.h.part("hand_r"), [{ transform: "rotate(14deg)" }, { transform: "rotate(-16deg)" }], {
          duration: BEAT, iterations: Infinity, direction: "alternate", easing: "ease-in-out",
        });
      });
    },

    // 字が弾んで出る（字そのものは RichText）。字のまわりにマゼンタのきらめき
    textIn: () => {
      const pb = plateBoxOf(L, W, H);
      for (let i = 0; i < 6; i++) {
        sparkle(m, L.top, pb.l + Math.random() * (pb.r - pb.l), pb.t + Math.random() * (pb.b - pb.t) * 0.6, X(0.08), i * 90, i % 2 ? MAG : PALE);
      }
    },

    // 「ドン」: 紫の光が瞬き、字の後ろでマゼンタの輪が広がる
    don: () => {
      const pb = plateBoxOf(L, W, H);
      const cx = (pb.l + pb.r) / 2;
      const cy = (pb.t + pb.b) / 2;
      const d = X(1.05);
      const ringEl = div(L.front, {
        position: "absolute",
        left: `${(cx - d / 2).toFixed(1)}px`,
        top: `${(cy - d / 2).toFixed(1)}px`,
        width: `${d.toFixed(1)}px`,
        height: `${d.toFixed(1)}px`,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(255,64,129,0) 48%, rgba(255,150,210,0.9) 58%, rgba(200,90,255,0.5) 63%, rgba(200,90,255,0) 71%)",
        opacity: "0",
      });
      const ra = m.play(ringEl, [
        { opacity: 1, transform: "scale(0.3)", easing: EASE.out },
        { opacity: 0, transform: "scale(1.2)" },
      ], { duration: 600 });
      const rmr = () => ringEl.remove();
      if (ra) ra.finished.then(rmr, rmr);
      else rmr();
      flashOnce(m, flash, 0.3, 260);
      for (let i = 0; i < 8; i++) {
        const left = i % 2 === 0;
        sparkle(m, L.top, left ? pb.l : pb.r, pb.t + (pb.b - pb.t) * Math.random() * 0.7, X(0.1), i * 50, i % 3 ? MAG : PALE);
      }
    },

    /* 仲間は土へ・おばけは消え、墓は沈む。ゾンビは上の帯の右の角へ跳ぶ。着いたら待機の姿に切り替え、
       字より手前へ。キャラ絵が出るのはこの途中（ゾンビは着くまでキャラ絵の後ろ） */
    retreat: (c) => {
      const ms = (c.dur ?? 0.8) * 1000;
      darkTo(0, ms);
      /* 墓石・坊や・おばけ・地面の霧は、その人のキャラ絵の背景として残す（2版目。キャラ絵の後ろの層）。
         踊りはやめて、ゆっくりの息だけにする（滞在は何十秒も続くので軽く） */
      kids.forEach((k, i) => {
        k.pose.getAnimations().forEach((x) => x.cancel());
        k.h.part("arm_l")?.getAnimations().forEach((x) => x.cancel());
        k.h.part("arm_r")?.getAnimations().forEach((x) => x.cancel());
        k.h.swap("head", "wink");
        m.after(600 + i * 200, () => k.h.swap("head", "smile"));
      });
      ghosts.forEach((g) => {
        g.h.part("hand_l")?.getAnimations().forEach((x) => x.cancel());
        g.h.part("hand_r")?.getAnimations().forEach((x) => x.cancel());
        /* おばけも止める（背景は止め絵にして、動くのはオーラの息と墓の掘り直しだけ。キャラ絵の後ろで
           回し続けると、滞在のコマの速さが半分まで落ちた） */
        g.bob.getAnimations().forEach((x) => x.cancel());
      });
      // 踊りをやめて、右上の角へ跳ぶ
      actor.bob.getAnimations().forEach((x) => x.cancel());
      const to = staySpot();
      const go = ms * 0.8;
      /* 傾けない（跳び立つ瞬間に体を傾けると、足元の角が字のブロックに掛かった）。先に横へ跳んでから
         上がる道にする（上へ弧を描くと、小さくなりきる前に頭が面の上の端から出た） */
      arcMove(m, actor.pos, now, to, [to.x - X(0.04), now.y - Y(0.03)], go, 0);
      m.play(actor.squash, [
        { transform: "scale(1.1, 0.88)", easing: EASE.out },
        { transform: "scale(0.92, 1.1)", offset: 0.3 },
        { transform: "scale(1, 1)", offset: 0.85 },
        { transform: "scale(1.12, 0.88)", offset: 0.94 },
        { transform: "scale(1, 1)" },
      ], { duration: go + 120 });
      now = to;
      m.after(go, () => {
        L.actorBox.style.zIndex = "4";
        /* 帯の下の辺から下は描かない（キャラ絵の顔の前を通さない。墓へ沈むのもこの切り口）。
           切り口ちょうどだと、縁のにじみの1行がキャラ絵の頭に掛かった（重なりの見張りで 59 画素）
           ので、少し上で切る */
        L.actor.style.clipPath = `inset(0px 0px ${Math.max(0, H - bandBottomOf(L, W, H) + X(0.006)).toFixed(1)}px 0px)`;
        pop("idle", 320, STAY_POP);
        raiseStayGrave();
      });
    },

    // その人の絵が出る。粒の層をキャラ絵の後ろへ
    reveal: () => {
      L.frontBox.style.zIndex = "0";
      /* オーラは息をさせない止め絵（stayAura の息を墓場の後ろで回すと、たくさんの部品の層と重なって
         滞在のコマの速さが半分まで落ちた。止めれば 60fps に戻る） */
      const c = centerOf(L, W, H);
      const r = X(AURA.r);
      aura = div(L.back, {
        position: "absolute",
        left: `${(c.x - r).toFixed(1)}px`,
        top: `${(c.y - r).toFixed(1)}px`,
        width: `${(r * 2).toFixed(1)}px`,
        height: `${(r * 2).toFixed(1)}px`,
        borderRadius: "50%",
        background: edgeFade([[0, `rgba(${AURA.rgb},${AURA.alpha})`], [45, `rgba(${AURA.rgb},${(AURA.alpha * 0.55).toFixed(3)})`], [75, `rgba(${AURA.rgb},${(AURA.alpha * 0.18).toFixed(3)})`], [100, `rgba(${AURA.rgb},0)`]], "50% 50%"),
        opacity: "0",
      });
      L.back.insertBefore(aura, L.back.firstChild);
      m.play(aura, [{ opacity: 0 }, { opacity: 1 }], { duration: 700, delay: 300, fill: "forwards", easing: EASE.out });
    },

    stay: () => {
      // ゆらゆら（足元を中心に左右に傾く）
      m.play(actor.bob, [
        { transform: "rotate(-3.5deg)" },
        { transform: "rotate(3.5deg)" },
      ], { duration: 2200, iterations: Infinity, direction: "alternate", easing: "ease-in-out" });
      // 5〜8秒おきに小芸。決めポーズが多め
      const tricks = [strike, strike, peek, graveWobble];
      let last = -1;
      const next = () => {
        stayTimer = m.after(range(Math.random, 5000, 8000), () => {
          let i = Math.floor(Math.random() * tricks.length);
          if (tricks[i] === tricks[last]) i = (i + 2) % tricks.length;
          last = i;
          tricks[i]();
          next();
        });
      };
      next();
      // 墓を掘り直す（6.5〜9.5秒おき。最初は滞在に入って少ししてから）
      stopDig = every(m, 6500, 9500, (i) => dig(i), 2500);
    },

    /* 締め（curtainCall）: キャラ絵と字と背景の墓場が消える → ゾンビが真ん中へ戻る →
       しゃがんで、土へずぼっと潜って消える */
    finale: (cue) => {
      const ms = (cue.dur ?? 2.6) * 1000;
      if (stayTimer) m.clear(stayTimer);
      stopDig?.();
      actor.bob.getAnimations().forEach((x) => x.cancel());
      batsAcross(m, a.bat, L.back, 8, W, [Y(0.03), Y(0.15)], 200);
      const fadeMs = Math.max(250, ms * 0.24);
      /* 墓場はキャラ絵と一緒に、締めの頭から消す。キャラ絵が消えたあと（afterExit）に消し始めると、
         墓場が消えきらないうちにゾンビが真ん中へ動き出した */
      const exitMs = Math.min(600, ms * 0.22);
      if (aura) fadeOut(m, aura, exitMs);
      for (const el of [graveClip, kidClip, ghostGate, ...fog]) fadeOut(m, el, exitMs);
      if (stayGrave) fadeOut(m, stayGrave, exitMs * 0.8);
      curtainCall(m, L, {
        ms,
        hero: gateBox,
        exitMs,
        toCenter: (moveMs) => {
          // 帯の切り口を外す（真ん中へ戻る）。姿の真ん中がキャラ絵の真ん中に来る位置
          L.actor.style.clipPath = "";
          const k = k0 * 0.85;
          const dn = a.poses.poses.get("dance");
          const midFromFeet = dn ? (dn.bottom[1] - (dn.content[1] + dn.content[3]) / 2) * actor.s0 * k : Y(0.2);
          const to: At = { x: cx, y: center.y + midFromFeet, k };
          pop("dance", 300, STAY_POP);
          arcMove(m, actor.pos, now, to, [now.x - X(0.15), now.y + Y(0.15)], moveMs, 0);
          now = to;
        },
      });
      m.after(ms - fadeMs, () => dive(fadeMs));
    },
  };

  /** 締めの最後: しゃがんで、ちょっと跳んで、土へずぼっと潜る。土が飛ぶ */
  function dive(ms: number) {
    // 姿の高さ（倍率 1 の px）。ずぼっと沈む深さ（半分ほど沈みながら消える）
    const dance = a.poses.poses.get("dance");
    const depth = dance ? (dance.content[3] - dance.content[1]) * actor.s0 * 0.6 : Y(0.3);
    m.play(actor.squash, [
      { transform: "translateY(0px) scale(1, 1)", easing: EASE.out },
      { transform: "translateY(0px) scale(1.16, 0.82)", offset: 0.25, easing: EASE.up },
      // 小さく跳んでから潜る（大きく跳ぶと、頭が面の上の端で切れた）
      { transform: `translateY(${(-depth * 0.03).toFixed(1)}px) scale(0.94, 1.04)`, offset: 0.48, easing: EASE.in },
      { transform: `translateY(${depth.toFixed(1)}px) scale(0.86, 1.2)` },
    ], { duration: Math.max(ms, 500), fill: "forwards" });
    m.after(ms * 0.45, () => {
      dirt(L.top, now.x, now.y - Y(0.01), 10, 0.3, 0.6);
      dustPuffs(m, L.top, now.x, now.y - Y(0.012), X(0.1), 4);
      sparkle(m, L.top, now.x, now.y - Y(0.04), X(0.08), 80, MAG);
    });
  }


  /** 待機の場所（足元と倍率）。面の上の右の角。足を帯の下の辺に乗せる */
  function staySpot(): At {
    const idle = a.poses.poses.get("idle") ?? a.poses.poses.get("dance")!;
    const k = Y(STAY_H) / Math.max(1, (idle.content[3] - idle.content[1]) * actor.s0);
    const right = (idle.content[2] - idle.bottom[0]) * actor.s0 * k;
    return { x: W - X(STAY_RIGHT) - right, y: bandBottomOf(L, W, H) - X(0.004), k };
  }

  /** 待つあいだの小さな墓（ゾンビの左どなり）。帯の下の辺からせり上がる（主役の層は帯で切ってある） */
  function raiseStayGrave() {
    const it = items.get("tombstone_c");
    if (!it) return;
    const [x0, y0, x1, y1] = it.content;
    const hh = Y(STAY_GRAVE_H);
    const ww = (hh * (x1 - x0)) / Math.max(1, y1 - y0);
    const p = items.place("tombstone_c", L.actor, ww, "bottom");
    if (!p) return;
    L.actor.insertBefore(p.box, gateBox);
    const idle = a.poses.poses.get("idle");
    const half = idle ? (idle.bottom[0] - idle.content[0]) * actor.s0 * now.k : X(0.1);
    p.box.style.left = `${(now.x - half - ww * 0.42).toFixed(1)}px`;
    p.box.style.top = `${(now.y + X(0.004)).toFixed(1)}px`;
    m.play(p.box, [
      { transform: `translateY(${(hh + 6).toFixed(1)}px)`, easing: EASE.out },
      { transform: `translateY(${(-hh * 0.06).toFixed(1)}px)`, offset: 0.7 },
      { transform: "translateY(0px)" },
    ], { duration: 420, delay: 120, fill: "both" });
    stayGrave = p.box;
  }

  /**
   * 墓を掘り直す（滞在）: ゾンビが角で決めポーズ → 墓石の1つが沈み（土が飛ぶ）、少しして
   * また生えてくる（土ぼこり・となりの坊やが跳ねる）。墓石も土もキャラ絵の後ろの層
   */
  function dig(i: number) {
    if (!graves.length) return;
    const g = graves[(i + Math.floor(Math.random() * graves.length)) % graves.length];
    strike();
    const sink = 380;
    m.play(g.box, [
      { transform: "translateY(0px)", easing: EASE.in },
      { transform: `translateY(${(g.h + 8).toFixed(1)}px)` },
    ], { duration: sink, delay: 250, fill: "forwards" });
    m.after(250 + sink * 0.5, () => {
      dirt(L.back, g.x, groundY - Y(0.01), 5, 0.35, 0.5);
      dustPuffs(m, L.back, g.x, groundY - Y(0.005), X(0.08), 3);
    });
    const up = 250 + sink + 650;
    m.play(g.box, [
      { transform: `translateY(${(g.h + 8).toFixed(1)}px)`, easing: EASE.out },
      { transform: `translateY(${(-g.h * 0.08).toFixed(1)}px)`, offset: 0.7, easing: EASE.inOut },
      { transform: "translateY(0px)" },
    ], { duration: 460, delay: up, fill: "forwards" });
    m.after(up + 80, () => {
      dirt(L.back, g.x, groundY - Y(0.01), 6, 0.45, 0.6);
      dustPuffs(m, L.back, g.x - X(0.08), groundY - Y(0.005), X(0.08), 2);
      dustPuffs(m, L.back, g.x + X(0.08), groundY - Y(0.005), X(0.08), 2);
      // となりの坊や（墓に近いほう）が跳ねる
      const near = kids.reduce((best, k, j) => (Math.abs(XC(KIDS[j].x) - g.x) < Math.abs(XC(KIDS[best].x) - g.x) ? j : best), 0);
      if (kids[near]) kidHop(kids[near], Y(0.03));
    });
  }

  // 小芸（滞在中）。どれも上の帯の中
  function strike() {
    pop("dance", 300, STAY_POP);
    m.after(320, () => m.play(actor.squash, danceFrames(Y(STAY_HOP) / Math.max(0.01, now.k)), { duration: BEAT * 2 }));
    m.after(1250, () => pop("idle", 300, STAY_POP));
  }
  function peek() {
    const idle = a.poses.poses.get("idle");
    const half = idle ? (idle.content[3] - idle.content[1]) * actor.s0 * 0.55 : Y(0.2);
    m.play(actor.squash, [
      { transform: "translateY(0px) scale(1, 1)", easing: EASE.in },
      { transform: `translateY(${half.toFixed(1)}px) scale(1, 1)`, offset: 0.3 },
      { transform: `translateY(${half.toFixed(1)}px) scale(1, 1)`, offset: 0.6, easing: EASE.up },
      { transform: `translateY(${(-half * 0.08).toFixed(1)}px) scale(0.94, 1.08)`, offset: 0.82, easing: EASE.down },
      { transform: "translateY(0px) scale(1, 1)" },
    ], { duration: 1400 });
    m.after(1150, () => {
      dustPuffs(m, L.actor, now.x, now.y - Y(0.01), X(0.06), 3);
      sparkle(m, L.top, now.x + X(0.04), now.y - Y(STAY_H) * 0.85, X(0.06), 0, MAG);
    });
  }
  function graveWobble() {
    if (!stayGrave) return strike();
    m.play(stayGrave, [
      { transform: "rotate(0deg)" },
      { transform: "rotate(-5deg)", offset: 0.25 },
      { transform: "rotate(4deg)", offset: 0.5 },
      { transform: "rotate(-2deg)", offset: 0.75 },
      { transform: "rotate(0deg)" },
    ], { duration: 700, easing: "ease-in-out" });
    // 墓のほうを見て、戻る
    m.play(actor.squash, [
      { transform: "scale(1, 1)" },
      { transform: "scale(-1, 1)", offset: 0.15 },
      { transform: "scale(-1, 1)", offset: 0.75 },
      { transform: "scale(1, 1)" },
    ], { duration: 1400, easing: "ease-in-out" });
  }

  for (const c of cues) {
    const fn = on[c.do];
    if (fn) m.at(c.t * 1000, () => fn(c));
  }
  return () => {};
}

/** 稲光の筋（SVG。1度描いて opacity だけ動かす）。太い紫の光・淡い紫・白い芯の3重 */
function boltSvg(): string {
  const main = "50,0 42,40 58,70 36,120 54,150 30,205 46,235 34,300";
  const br1 = "58,70 76,95 70,118 84,150";
  const br2 = "54,150 70,172 64,195";
  const line = (pts: string, color: string, w: number) =>
    `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;
  const all = (color: string, w: number) => line(main, color, w) + line(br1, color, w * 0.6) + line(br2, color, w * 0.5);
  return `<svg viewBox="0 0 100 300" preserveAspectRatio="none" width="100%" height="100%" style="position:absolute;inset:0;overflow:visible">${all("rgba(200,80,255,0.5)", 22)}${all("#E3B0FF", 9)}${all("#FFFFFF", 3.5)}</svg>`;
}
