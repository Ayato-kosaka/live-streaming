/**
 * 段4（1,000〜1,999円）の**質の試作**（`?fx=lux`。#1079）。物語と時間割は `wizard.ts` と同じで、
 * 見た目の質だけを上げる。旗が無ければ使われない（`TierShow.tsx`）。
 *
 *   流れ星が落ちて魔法陣が開く → ほうきで飛び込む（彗星の尾）→ 杖の光で札を書く → ドン →
 *   右上へはける → 魔法陣から光があふれて、その人のキャラ絵が呼び出される → 注目（滞在）→
 *   キャラ絵が魔法陣の真ん中へ帰る → あやとが真ん中へ戻って消える
 *
 * 何を変えたか（オーナー: 「TikTok レベルのクオリティ」「高級感ない」「ごちゃごちゃさせたいわけではない」）:
 *
 * - **光はにじみまで焼いた絵**（`lux.ts`・`tools/alert-theme/lux_art.py`）。芯が白く、まわりが金、外が紫に
 *   にじむ。CSS の円や線の重ね描き（いまの段4の魔法陣）は使わない
 * - 魔法陣は文字の輪・六芒星と三日月・きらめき・後ろの光だまりを**1枚に焼いた絵**。回りながら開いてすっと
 *   止まり、呼び出しで一回り広がる。星が届くたびに**光の粒が輪の線をなぞって走る**
 * - 魔法陣の絵の下に薄い暗さを焼いてある（絵の縁で 0）。昼の明るい配信の上でも光が白く溶けない
 * - 奥行き: 前兆の紫の霧（下から）と流れ星・魔法陣のまわりで昇るぼけた光の玉・呼び出しの閃きと光の柱と光の筋
 * - あやとのほうきに**彗星の尾**（ポーズ絵に付けて一緒に動く）と、通った跡にこぼれる星
 *
 * 重さの決まり（`.claude/skills/alert-season/SKILL.md`「重さの決まり」）:
 * - **大きな層を動かし続けない。** 動いた層の外接矩形の中は、重なっている層（キャラ絵・字・魔法陣）まで
 *   毎コマ描き直しになる（いまの段4は、回り続ける魔法陣と息をする光の輪で 949 ms/秒）。止まっている大きな層は
 *   ほぼただ（滞在中に何も動かさないと 72 ms/秒。2026-11-02 この箱）
 * - **離れた2か所を同時に動かし続けない。** 描き直す範囲は動いた所を全部含む1つの四角になるので、角のあやとと
 *   輪をなぞる光を同時に動かすと、面いっぱいを描き直す（滞在中に光を走らせ続けた版は 974 ms/秒）
 * - **大きな絵を2枚以上重ねて止めておかない。** 1枚なら、その上であやとが浮いても 36 ms/秒、2枚重ねると
 *   380〜470 ms/秒になった。魔法陣を1枚に焼き、光の筋は呼び出しのあと消す
 * - **遠近（perspective）で回さない。** 傾けて回した魔法陣は、それだけで GPU 884 ms/秒・51 コマだった
 * - **大きな光を同じ瞬間に重ねない。** 呼び出しの閃き・柱・光の筋・魔法陣の広がりを 0 秒に重ねた版は、
 *   50〜83ms のコマが続いた
 * - そこで滞在中に動き続けるのは、角のあやとだけ。魔法陣は止まった絵として残し、星が届いたときだけ光が走る。
 *   霧・ぼけ・光の筋は登場が終わったら消して外す
 *
 * 層（`layers.ts`）: 霧・魔法陣・光の筋・ぼけ・滞在中の星は back、あやとは actor、登場の粒は front
 * （キャラ絵が出たら後ろへ）、字を書く光と呼び出しの閃き（キャラ絵がふくらみきる前に消える）は top。
 * 滞在中は top に何も出さない（杖の閃きの長い光芒が、キャラ絵の頭に届いた。alert-overlap の 664x1180 で 9px）
 */
import { EASE, type Motion } from "../rig/motion";
import type { TimedCue } from "./script";
import { pathFrames } from "./fx";
import { bandBottomOf, div, liveScale, plateBoxOf, type ShowLayers } from "./layers";
import type { LoadedPoses } from "./poses";
import { heroFaceMark } from "./poseActor";
import { centerOf, curtainCall, every } from "./common";
import { LUX_SIZE, luxImg, luxUrl, type LuxName } from "./lux";

export type WizardLuxAssets = { poses: LoadedPoses };

/** 登場のあいだの大きさ（飛ぶ姿の高さが面の 4 割。wizard.ts と同じ） */
const BIG_H = 0.4;
/** 待つときの大きさ（面の幅に対する、ほうきとピポまで入れた幅。wizard.ts と同じ） */
const STAY_W = 0.3;
/** 杖の星の中心・ほうきの穂の真ん中（絵の px。左右反転する前。wizard.ts と同じ） */
const WAND: Record<string, [number, number]> = { fly: [1000, 315], cast: [1015, 75], idle: [360, 657] };
const BRISTLE: Record<string, [number, number]> = { fly: [160, 735], cast: [160, 778], idle: [964, 744] };
/** ほうきの柄の向き（穂 → 柄。度。右向きにそろえたとき）。彗星の尾はこの反対へ伸ばす */
const BROOM_DEG: Record<string, number> = { fly: -5, cast: -4, idle: 4 };

/** 魔法陣の外の輪の直径（面の幅に対する割合。いまの段4は 0.88）。中心はキャラ絵の真ん中 */
const RING_D = 0.88;
/**
 * 呼び出しまでの魔法陣の大きさ（呼び出しで 1 へ広がる）。開いてから呼び出しまでは、あやとと光の粒が
 * 魔法陣の上を動き回るので、魔法陣の四角が毎コマ描き直しになる。そのあいだは小さくしておき（面積 0.64 倍）、
 * 呼び出しの光と一緒に広げる（「力が満ちる」の見せ場にもなる）
 */
const OPEN_K = 0.8;
/** 外の輪の、いちばん明るい線の半径（絵の幅に対する割合。lux_art.py の 498/1024） */
const RIM = 0.486;

export function runWizardLux(
  m: Motion,
  L: ShowLayers,
  a: WizardLuxAssets,
  cues: TimedCue[],
  W: number,
  H: number
): () => void {
  const X = (f: number) => f * W;
  const Y = (f: number) => f * H;
  const plateBox = () => plateBoxOf(L, W, H);
  const P = a.poses.poses;
  const fly = P.get("fly")!;
  const s0 = Y(BIG_H) / fly.size[1];
  const rnd = Math.random;
  /** 終わったら外す（WAAPI が終わったとき）。消し忘れた層が滞在中に残ると、それだけで重い */
  const done = (an: Animation | null, el: Element) => {
    const rm = () => el.remove();
    if (an) an.finished.then(rm, rm);
    else rm();
  };

  // ---------------------------------------------------------------- 小さな光（星・閃き）
  /** 4方向に光る星がぱっと咲いて消える */
  const star = (parent: HTMLElement, x: number, y: number, size: number, delayMs = 0, violet = false, ms = 560) => {
    const el = luxImg(parent, violet ? "sparkle-violet" : "sparkle-gold", x, y, size);
    const r0 = rnd() * 40 - 20;
    done(m.play(el, [
      { transform: `rotate(${r0}deg) scale(0)`, opacity: 0, easing: "cubic-bezier(0.2, 0.9, 0.3, 1)" },
      { transform: `rotate(${r0 + 25}deg) scale(1.15)`, opacity: 1, offset: 0.3, easing: "ease-in" },
      { transform: `rotate(${r0 + 70}deg) scale(0)`, opacity: 0 },
    ], { duration: ms, delay: delayMs, fill: "backwards" }), el);
  };
  /** 閃き（長い光芒）。大きくひらいて消える */
  const flash = (parent: HTMLElement, x: number, y: number, size: number, ms = 520, delayMs = 0, peak = 1) => {
    const el = luxImg(parent, "flare", x, y, size);
    done(m.play(el, [
      { transform: "scale(0.3) rotate(0deg)", opacity: 0 },
      { transform: "scale(1.1) rotate(12deg)", opacity: peak, offset: 0.25, easing: "ease-out" },
      { transform: "scale(0.85) rotate(30deg)", opacity: 0 },
    ], { duration: ms, delay: delayMs, fill: "backwards" }), el);
  };
  /** 光の粒が (x0,y0) から (x1,y1) へ、弧を描いて飛ぶ。着いたところで星が咲く */
  const mote = (parent: HTMLElement, x0: number, y0: number, x1: number, y1: number, ms: number, delayMs: number, violet = false, bloom = true, size = X(0.05)) => {
    const el = luxImg(parent, violet ? "sparkle-violet" : "sparkle-gold", 0, 0, size, { left: `${-size / 2}px`, top: `${-size / 2}px` });
    const mx = (x0 + x1) / 2 + (rnd() - 0.5) * X(0.08);
    const my = Math.min(y0, y1) - X(0.06);
    done(m.play(el, [
      { transform: `translate(${x0}px, ${y0}px) scale(0.5) rotate(0deg)`, opacity: 1 },
      { transform: `translate(${mx}px, ${my}px) scale(0.9) rotate(60deg)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${x1}px, ${y1}px) scale(0.4) rotate(120deg)`, opacity: 0 },
    ], { duration: ms, delay: delayMs, easing: "ease-in", fill: "backwards" }), el);
    if (bloom) star(parent, x1, y1, X(0.07), delayMs + ms * 0.92, violet);
  };

  // ---------------------------------------------------------------- あやと（ポーズ絵。wizard.ts と同じ組み方）
  const aPos = div(L.actor, { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px", willChange: "transform", opacity: "0" });
  const aBob = div(aPos, { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px" });
  const aSquash = div(aBob, { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px" });
  /** 彗星の尾（ほうきの穂から後ろへ）。あやとの箱の中に置くので、傾きも大きさも一緒に動く */
  const tailLen = X(0.75);
  const tailH = (tailLen * LUX_SIZE.streak[1]) / LUX_SIZE.streak[0];
  const tail = document.createElement("img");
  tail.src = luxUrl("streak");
  tail.alt = "";
  tail.draggable = false;
  Object.assign(tail.style, {
    position: "absolute",
    left: "0px",
    top: "0px",
    width: `${tailLen}px`,
    height: `${tailH}px`,
    transformOrigin: "100% 50%",
    opacity: "0",
    // 飛んでいるあいだだけ出す（出したままだと、待機中のあやとの層が尾のぶん大きくなる）
    display: "none",
    pointerEvents: "none",
  } satisfies Partial<CSSStyleDeclaration>);
  aSquash.appendChild(tail);
  const imgs = new Map<string, HTMLElement[]>();
  const rel = (name: string, pt: [number, number]): [number, number] => {
    const p = P.get(name)!;
    const flip = p.facing === "left";
    const x = flip ? p.size[0] - pt[0] : pt[0];
    const fx = flip ? p.size[0] - p.faceCenter[0] : p.faceCenter[0];
    return [(x - fx) * s0, (pt[1] - p.faceCenter[1]) * s0];
  };
  for (const [name, p] of P) {
    const im = document.createElement("img");
    im.src = p.img.url;
    im.alt = "";
    im.draggable = false;
    const flip = p.facing === "left";
    const fx = flip ? p.size[0] - p.faceCenter[0] : p.faceCenter[0];
    Object.assign(im.style, {
      position: "absolute",
      left: `${-fx * s0}px`,
      top: `${-p.faceCenter[1] * s0}px`,
      width: `${p.size[0] * s0}px`,
      height: `${p.size[1] * s0}px`,
      transform: flip ? "scaleX(-1)" : "",
      /* 見せていないポーズは display:none（visibility だと、隠れた絵の大きさまであやとの層に入り、
         浮いているあいだに描き直す四角が大きくなる） */
      display: name === "fly" ? "" : "none",
      userSelect: "none",
      pointerEvents: "none",
    } satisfies Partial<CSSStyleDeclaration>);
    aSquash.appendChild(im);
    imgs.set(name, [im, heroFaceMark(aSquash, p, s0, fx, p.faceCenter[1], flip, name === "fly")]);
  }
  let pose = "fly";
  const show = (name: string) => {
    if (!imgs.has(name)) return;
    imgs.forEach(([im, face], k) => {
      im.style.display = k === name ? "" : "none";
      face.style.visibility = k === name ? "visible" : "hidden";
    });
    pose = name;
  };
  let now = { x: -X(0.5), y: Y(1.1), k: 1, r: 0 };
  const T = (x: number, y: number, k: number, r = 0) =>
    `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${r.toFixed(1)}deg) scale(${k.toFixed(4)})`;
  aPos.style.transform = T(now.x, now.y, now.k);
  const at = (pt: Record<string, [number, number]>, p = now) => {
    const [dx, dy] = rel(pose, pt[pose] ?? pt.fly);
    const c = Math.cos((p.r * Math.PI) / 180);
    const s = Math.sin((p.r * Math.PI) / 180);
    return { x: p.x + (dx * c - dy * s) * p.k, y: p.y + (dx * s + dy * c) * p.k };
  };
  /** 尾をいまのポーズの穂に付け直す（右の端が穂、柄と反対へ伸びる） */
  const placeTail = () => {
    const [bx, by] = rel(pose, BRISTLE[pose] ?? BRISTLE.fly);
    tail.style.left = `${(bx - tailLen + X(0.02)).toFixed(1)}px`;
    tail.style.top = `${(by - tailH / 2).toFixed(1)}px`;
  };
  const popTo = (name: string, ms = 360) => {
    m.play(aSquash, [
      { transform: "scale(1, 1)", easing: EASE.in },
      { transform: "scale(0.9, 0.9)", offset: 0.3, easing: EASE.out },
      { transform: "scale(1.08, 1.08)", offset: 0.65, easing: EASE.inOut },
      { transform: "scale(1, 1)" },
    ], { duration: ms });
    m.after(ms * 0.3, () => {
      show(name);
      placeTail();
      const w = at(WAND);
      flash(L.top, w.x, w.y, X(0.22) * Math.max(0.55, now.k), 480);
      for (let i = 0; i < 4; i++) {
        const ang = (i / 4) * Math.PI * 2 + rnd();
        const rr = X(0.1) * now.k;
        star(L.top, now.x + Math.cos(ang) * rr, now.y + Math.sin(ang) * rr * 0.8, X(0.08) * Math.max(0.5, now.k), i * 30, i % 2 === 1);
      }
    });
  };
  const quad = (p0: number[], c: number[], p1: number[], u: number): [number, number] => [
    (1 - u) * (1 - u) * p0[0] + 2 * (1 - u) * u * c[0] + u * u * p1[0],
    (1 - u) * (1 - u) * p0[1] + 2 * (1 - u) * u * c[1] + u * u * p1[1],
  ];
  /** 弧を描いて飛ぶ（wizard.ts と同じ）。`tail` で彗星の尾を出し、通った跡に星をこぼす（`trail` の層へ） */
  const flyArc = (
    to: { x: number; y: number; k: number },
    ctrl: [number, number],
    ms: number,
    opts: { overshoot?: number; trail?: HTMLElement; tail?: boolean } = {}
  ) => {
    const N = 22;
    const ease = (t: number) => 1 - Math.pow(1 - t, 2.2);
    const from = { ...now };
    const pts: [number, number][] = [];
    const ks: number[] = [];
    for (let i = 0; i <= N; i++) {
      const u = ease(i / N);
      pts.push(quad([from.x, from.y], ctrl, [to.x, to.y], u));
      ks.push(from.k + (to.k - from.k) * u);
    }
    const ov = opts.overshoot ?? 0;
    if (ov) {
      const [ax, ay] = pts[N - 1];
      const dx = to.x - ax;
      const dy = to.y - ay;
      const d = Math.hypot(dx, dy) || 1;
      pts.push([to.x + (dx / d) * ov, to.y + (dy / d) * ov]);
      ks.push(to.k);
      pts.push([to.x, to.y]);
      ks.push(to.k);
    }
    const frames = pathFrames(pts, { tilt: 18 });
    frames.forEach((f, i) => (f.transform = `${f.transform} scale(${ks[i].toFixed(4)})`));
    const offsets = ov ? [...Array.from({ length: N + 1 }, (_, i) => (i / N) * 0.86), 0.93, 1] : undefined;
    if (offsets) frames.forEach((f, i) => (f.offset = offsets[i]));
    const anim = m.play(aPos, frames, { duration: ms, fill: "forwards", easing: "linear" });
    m.play(aSquash, [
      { transform: "scale(1, 1)" },
      { transform: "scale(1.05, 0.95)", offset: 0.3 },
      { transform: "scale(1.02, 0.98)", offset: 0.75 },
      { transform: "scale(0.95, 1.05)", offset: 0.9, easing: EASE.out },
      { transform: "scale(1, 1)" },
    ], { duration: ms });
    if (opts.tail) {
      placeTail();
      tail.style.display = "";
      m.after(ms + 30, () => (tail.style.display = "none"));
      // 速いあいだは長く明るい。止まり際に穂へ縮んで消える
      const rot = `rotate(${BROOM_DEG[pose] ?? 0}deg)`;
      m.play(tail, [
        { transform: `${rot} scaleX(0.3)`, opacity: 0 },
        { transform: `${rot} scaleX(1)`, opacity: 1, offset: 0.12 },
        { transform: `${rot} scaleX(0.95)`, opacity: 1, offset: 0.62 },
        { transform: `${rot} scaleX(0.15)`, opacity: 0 },
      ], { duration: ms, easing: "ease-out" });
    }
    if (opts.trail) {
      const tr = opts.trail;
      // 星は 110ms おき・寿命 0.7〜1 秒（同時に出ている小さな層を 6〜8 枚に抑える。多いと、それだけで重い）
      const n = Math.round(ms / 150);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const u = ease(Math.min(1, t / 0.86));
        const [x, y] = quad([from.x, from.y], ctrl, [to.x, to.y], u);
        const k = from.k + (to.k - from.k) * u;
        const b = at(BRISTLE, { x, y, k, r: 0 });
        const jx = (rnd() - 0.5) * X(0.06) * k;
        const jy = (rnd() - 0.5) * X(0.06) * k;
        // 星は少し下へこぼれながら消える
        m.after(t * ms, () => {
          const size = X(0.05 + rnd() * 0.07) * Math.max(0.5, k);
          const el = luxImg(tr, i % 3 ? "sparkle-gold" : "sparkle-violet", b.x + jx, b.y + jy, size);
          const r0 = rnd() * 60;
          done(m.play(el, [
            { transform: `translateY(0px) rotate(${r0}deg) scale(0.2)`, opacity: 0 },
            { transform: `translateY(${X(0.01)}px) rotate(${r0 + 20}deg) scale(1)`, opacity: 1, offset: 0.15 },
            { transform: `translateY(${X(0.09)}px) rotate(${r0 + 90}deg) scale(0.1)`, opacity: 0 },
          ], { duration: 600 + rnd() * 250, easing: "ease-out" }), el);
        });
        // 通った道に残る光の帯（短い尾を道の向きにそろえて置き、ゆっくり消える）。
        // 尾がほうきに付いているだけだと、画面の外から入ってくるあいだ尾が画面の外にいて見えない
        if (i % 3 === 1) {
          const u0 = ease(Math.min(1, Math.max(0, (t - 0.08) / 0.86)));
          const [px, py] = quad([from.x, from.y], ctrl, [to.x, to.y], u0);
          const p0 = at(BRISTLE, { x: px, y: py, k, r: 0 });
          const ang = (Math.atan2(b.y - p0.y, b.x - p0.x) * 180) / Math.PI;
          const len = Math.max(X(0.12), Math.hypot(b.x - p0.x, b.y - p0.y) * 2.2);
          m.after(t * ms, () => {
            const el = luxImg(tr, "streak", b.x - len / 2, b.y, len, { transformOrigin: "100% 50%" });
            el.style.left = `${(b.x - len).toFixed(1)}px`;
            done(m.play(el, [
              { transform: `rotate(${ang.toFixed(1)}deg) scaleY(1)`, opacity: 0.9 },
              { transform: `rotate(${ang.toFixed(1)}deg) scaleY(0.5)`, opacity: 0 },
            ], { duration: 650, easing: "ease-in" }), el);
          });
        }
      }
    }
    now = { x: to.x, y: to.y, k: to.k, r: 0 };
    return anim;
  };

  const hoverSpot = () => {
    const pb = plateBox();
    const ps = ["fly", "cast"].map((n) => P.get(n) ?? fly);
    const below = Math.max(...ps.map((p) => (p.content[3] - p.faceCenter[1]) * s0));
    const above = Math.max(...ps.map((p) => (p.faceCenter[1] - p.content[1]) * s0));
    const faceBelow = Math.max(...ps.map((p) => (p.face[3] - p.faceCenter[1]) * s0));
    const whole = pb.t - X(0.02) - below;
    const faceOnly = pb.t - X(0.03) - faceBelow;
    const top = Y(0.012) + above;
    return { x: centerOf(L, W, H).x, y: Math.min(faceOnly, Math.max(top, whole)) };
  };

  /** その人のキャラ絵の中身の矩形（舞台の px）。印（CharFit の `data-char="content"`）が無ければ箱 */
  const contentOf = () => {
    const c = centerOf(L, W, H);
    const left = c.x - c.w / 2;
    const box = L.root.querySelector<HTMLElement>('[data-char="box"]');
    const mark = box?.querySelector<HTMLElement>('[data-char="content"]');
    if (!mark || mark.offsetParent !== box) return { l: left, t: c.top, r: left + c.w, b: c.bottom };
    const sr = L.dark.getBoundingClientRect();
    const f = liveScale(L) / (sr.width / W || 1);
    const l = left + mark.offsetLeft * f;
    const t = c.top + mark.offsetTop * f;
    return { l, t, r: l + mark.offsetWidth * f, b: t + mark.offsetHeight * f };
  };

  // ---------------------------------------------------------------- 魔法陣（back。キャラ絵の真ん中）
  const D = X(RING_D);
  const plane = (rot: number, k = 1) => `rotate(${rot.toFixed(2)}deg) scale(${k.toFixed(4)})`;
  /**
   * 魔法陣は**1枚の絵**（外の文字の輪・内の六芒星・後ろの光だまりを焼いて重ねたもの）。3枚に分けて
   * 逆に回すと見栄えはするが、止まったあとも大きな絵が3枚重なり、その上であやとが浮くだけで
   * GPU が 380 ms/秒になった（1枚なら 36。2026-11-02 この箱）
   */
  const CW = D * (LUX_SIZE.circle[0] / 1024);
  const circle = luxImg(L.back, "circle", 0, 0, CW);
  circle.style.transformOrigin = "50% 50%";
  circle.style.transform = plane(0, 0.3);
  let ctr = { x: X(0.5), y: Y(0.6) };
  const placeRing = () => {
    const c = centerOf(L, W, H);
    ctr = { x: c.x, y: c.y };
    circle.style.left = `${(c.x - CW / 2).toFixed(1)}px`;
    circle.style.top = `${(c.y - CW / 2).toFixed(1)}px`;
    return c;
  };
  /** 魔法陣から広がる光の輪 */
  const shock = (k0 = 0.3, k1 = 1.5, ms = 760, peak = 1, x = ctr.x, y = ctr.y, w = D) => {
    const el = luxImg(L.back, "shock", x, y, w);
    done(m.play(el, [
      { transform: plane(0, k0), opacity: peak },
      { transform: plane(0, k1), opacity: 0 },
    ], { duration: ms, easing: EASE.out }), el);
  };
  /** 魔法陣がふっと明るくなる（真ん中に閃き。魔法陣の絵そのものの明るさは動かさない＝大きな層を動かさない） */
  const glow = (size = X(0.55), ms = 600, peak = 0.9) => flash(L.back, ctr.x, ctr.y, size, ms, 0, peak);
  /** 魔法陣の角度（止まったところ）。締めでここからまた回す */
  const REST = 20;
  /**
   * 開いて回り、すっと止まる（`ms` かけて）。回り続けると、魔法陣の四角の中（キャラ絵・字の後ろ）が
   * 毎コマ描き直しになるので、あやとが飛び込んで札を書くころには止めておく
   */
  const openSpin = (ms: number) => {
    m.play(circle, [
      { transform: plane(-170, 0.25), opacity: 0, easing: "cubic-bezier(0.2, 0.7, 0.3, 1)" },
      /* 開いた瞬間は一度 1.06 まで広がってから縮む。いちばん大きい倍率で一度だけ描いておくため（小さく描いて
         おいて呼び出しで広げると、そこで魔法陣を描き直して、この箱で 50ms のコマが続いた） */
      { transform: plane(-60, 1.06), opacity: 1, offset: 0.22, easing: "ease-out" },
      { transform: plane(-25, OPEN_K), opacity: 1, offset: 0.4, easing: "cubic-bezier(0.2, 0.6, 0.3, 1)" },
      { transform: plane(REST, OPEN_K), opacity: 1 },
    ], { duration: ms, fill: "forwards" });
  };
  /**
   * 輪の線をなぞって走る光（星が届いたとき・呼び出し）。小さな絵1枚を、輪の上の点を結んだ道で1周弱走らせて消す
   */
  const glint = (rFrac: number, ms: number, dir: number, phase: number, violet: boolean, delayMs = 0) => {
    const size = X(0.085);
    const el = luxImg(L.back, violet ? "sparkle-violet" : "sparkle-gold", 0, 0, size, { left: `${-size / 2}px`, top: `${-size / 2}px` });
    el.dataset.lux = "glint";
    const r = D * rFrac;
    const N = 36;
    const frames: Keyframe[] = [];
    for (let i = 0; i <= N; i++) {
      const th = phase + dir * (i / N) * Math.PI * 1.6;
      const f = i / N;
      frames.push({
        transform: `translate(${(ctr.x + Math.cos(th) * r).toFixed(1)}px, ${(ctr.y + Math.sin(th) * r).toFixed(1)}px) rotate(${(f * 180).toFixed(0)}deg) scale(${(0.6 + 0.6 * Math.sin(Math.PI * f)).toFixed(3)})`,
        opacity: Math.min(1, Math.sin(Math.PI * f) * 2.2),
      });
    }
    done(m.play(el, frames, { duration: ms, delay: delayMs, easing: "ease-in-out", fill: "backwards" }), el);
  };
  /** 輪をなぞる光を、外の輪に2つ（逆の端から）・内の輪に1つ */
  const sweep = (ms = 1300, delayMs = 0) => {
    const ph = rnd() * Math.PI * 2;
    glint(RIM, ms, 1, ph, false, delayMs);
    glint(RIM, ms, 1, ph + Math.PI, true, delayMs);
    glint(0.8 * 0.367, ms * 0.85, -1, ph + Math.PI / 2, false, delayMs + 120);
  };

  // ---------------------------------------------------------------- 登場のあいだだけの奥行き（霧・ぼけた光の玉）
  /**
   * ぼけた光の玉を1つ、魔法陣のまわりでゆっくり昇らせて消す。大きい玉は手前（ぼけて大きく、速く）、
   * 小さい玉は奥（ゆっくり）に見える。面いっぱいの絵を流すと重いので、1つずつ小さな絵で置く
   * （面いっぱいの「ぼけの絵」を2枚流した版は、それだけで GPU 852 ms/秒・41 コマだった）
   */
  const orb = (delayMs: number) => m.after(delayMs, () => orbNow());
  /* 出る時刻に作る（WAAPI の delay で先に作っておくと、待っているあいだも層が残って重かった） */
  const orbNow = () => {
    const names: LuxName[] = ["orb-gold", "orb-gold", "orb-violet", "orb-pink"];
    const near = rnd() < 0.3;
    const size = near ? X(0.1 + rnd() * 0.07) : X(0.03 + rnd() * 0.05);
    const ang = rnd() * Math.PI * 2;
    const rr = D * (0.25 + rnd() * 0.35);
    const x = ctr.x + Math.cos(ang) * rr;
    const y = ctr.y + Math.sin(ang) * rr * 0.9 + D * 0.1;
    const el = luxImg(L.back, names[Math.floor(rnd() * names.length)], x, y, size);
    const rise = Y(near ? 0.14 + rnd() * 0.06 : 0.06 + rnd() * 0.05);
    const ms = near ? 1500 + rnd() * 400 : 1800 + rnd() * 500;
    const peak = near ? 0.55 : 0.85;
    done(m.play(el, [
      { transform: "translate(0px, 0px) scale(0.6)", opacity: 0 },
      { transform: `translate(${(rnd() - 0.5) * X(0.03)}px, ${-rise * 0.35}px) scale(1)`, opacity: peak, offset: 0.3 },
      { transform: `translate(${(rnd() - 0.5) * X(0.05)}px, ${-rise}px) scale(0.8)`, opacity: 0 },
    ], { duration: ms, easing: "ease-out" }), el);
  };

  // ---------------------------------------------------------------- 札を光で書く（wizard.ts と同じ切り口）
  const plateEl = () => L.root.querySelector<HTMLElement>('[data-plate="box"]');
  const clip = (open: number) => `inset(-40% ${(100 - open * 106).toFixed(2)}% -40% ${(-open * 6).toFixed(2)}%)`;

  let stopStay: (() => void) | null = null;

  const on: Partial<Record<TimedCue["do"], (c: TimedCue) => void>> = {
    /* 前兆: 下から紫の霧が湧き、流れ星が魔法陣の真ん中へ落ちる（着いた所で魔法陣が開く） */
    glimmer: (c) => {
      const ms = (c.dur ?? 0.5) * 1000;
      const cc = placeRing();
      /* 霧は前兆のあいだだけ（湧いて、魔法陣が開ききるころに晴れる）。魔法陣と大きな絵が2枚重なったまま
         あやとが飛ぶと重いので、あやとが着くまでに外す */
      const mw = X(1.1);
      const mh = (mw * LUX_SIZE.mist[1]) / LUX_SIZE.mist[0];
      const mist = luxImg(L.back, "mist", X(0.5), H - mh * 0.4, mw);
      L.back.insertBefore(mist, L.back.firstChild);
      done(m.play(mist, [
        { transform: `translate(0px, ${X(0.1)}px) scale(0.9)`, opacity: 0 },
        { transform: "translate(0px, 0px) scale(1)", opacity: 1, offset: 0.35, easing: "ease-in-out" },
        { transform: `translate(0px, ${-X(0.03)}px) scale(1.04)`, opacity: 1, offset: 0.55 },
        { transform: `translate(0px, ${-X(0.06)}px) scale(1.08)`, opacity: 0 },
      ], { duration: 1200, easing: EASE.out }), mist);
      // 流れ星（彗星の尾と閃き）。右上の外から、魔法陣の真ん中へ
      const sx = X(1.05);
      const sy = Y(0.02);
      const ang = (Math.atan2(cc.y - sy, cc.x - sx) * 180) / Math.PI;
      const head = div(L.front, { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px", opacity: "0" });
      const sl = X(0.6);
      const sh = (sl * LUX_SIZE.streak[1]) / LUX_SIZE.streak[0];
      const st = luxImg(head, "streak", 0, 0, sl, { opacity: "1", transformOrigin: "100% 50%", transform: `rotate(${ang}deg)` });
      st.style.left = `${-sl + X(0.02)}px`;
      st.style.top = `${-sh / 2}px`;
      luxImg(head, "flare", 0, 0, X(0.22), { opacity: "1" });
      done(m.play(head, [
        { transform: `translate(${sx}px, ${sy}px) scale(0.6)`, opacity: 0 },
        { transform: `translate(${sx + (cc.x - sx) * 0.12}px, ${sy + (cc.y - sy) * 0.12}px) scale(0.85)`, opacity: 1, offset: 0.12 },
        { transform: `translate(${cc.x}px, ${cc.y}px) scale(1)`, opacity: 1, offset: 0.9 },
        { transform: `translate(${cc.x}px, ${cc.y}px) scale(1.4)`, opacity: 0 },
      ], { duration: Math.max(200, ms - 60), easing: "cubic-bezier(0.55, 0, 0.85, 0.55)" }), head);
      for (let i = 0; i < 5; i++) {
        const t = (i + 1) / 6;
        star(L.front, sx + (cc.x - sx) * t + (rnd() - 0.5) * X(0.06), sy + (cc.y - sy) * t + (rnd() - 0.5) * X(0.06), X(0.08), t * (ms - 60), i % 2 === 1, 700);
      }
    },

    // 魔法陣が開く（光の輪が走り、外の輪と六芒星が逆に回りながら広がる）。光の粉とぼけが昇り始める
    circle: () => {
      const cc = placeRing();
      shock(0.15, 1.2, 700);
      flash(L.front, cc.x, cc.y, X(0.45), 600, 0, 1);
      // あやとが飛び込んでくるころに止まりきる
      openSpin(1500);
      // ぼけた光の玉: 開いてから、あやとが着くまで（札を書くあいだは出さない。魔法陣の上で動くものが増えると重い）
      for (let i = 0; i < 5; i++) orb(100 + i * 260 + rnd() * 120);
    },

    // 左下の外から、弧を描いて魔法陣の上へ。彗星の尾を引き、星をこぼす
    flyIn: (c) => {
      const ms = (c.dur ?? 1.5) * 1000;
      show("fly");
      now = { x: -X(0.45), y: Y(0.95), k: 0.85, r: 0 };
      aPos.style.opacity = "1";
      aPos.style.transform = T(now.x, now.y, now.k);
      const h = hoverSpot();
      flyArc({ x: h.x, y: h.y, k: 1 }, [X(0.05), Math.min(Y(0.28), h.y - Y(0.1))], ms, { overshoot: X(0.05), trail: L.front, tail: true });
    },

    cast: () => popTo("cast"),

    // 杖の先から光が飛んで、札を左から書いていく。書く端に光の筋と閃き
    write: (c) => {
      const ms = (c.dur ?? 0.9) * 1000;
      const el = plateEl();
      if (!el) return;
      const pb = plateBox();
      const wa = m.play(el, [{ clipPath: clip(0) }, { clipPath: clip(1) }], { duration: ms, fill: "forwards", easing: "cubic-bezier(0.35, 0.1, 0.3, 1)" });
      /* 書き終えたら切り口を外す（wizard.ts と同じ。外さないと「ドン」で額の左右が欠ける） */
      m.after(ms + 40, () => {
        el.style.clipPath = "none";
        wa?.cancel();
      });
      const tip = at(WAND);
      // 杖の先の閃き（書いているあいだ灯り続ける）
      const glow = luxImg(L.top, "flare", tip.x, tip.y, X(0.26));
      done(m.play(glow, [
        { opacity: 0, transform: "scale(0.4) rotate(0deg)" },
        { opacity: 1, transform: "scale(1.1) rotate(10deg)", offset: 0.15 },
        { opacity: 0.85, transform: "scale(0.9) rotate(25deg)", offset: 0.7 },
        { opacity: 0, transform: "scale(1.3) rotate(40deg)" },
      ], { duration: ms + 300 }), glow);
      // 光の粒: 杖の先から、札の書く端へ
      const n = 7;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const tx = pb.l + (pb.r - pb.l) * t;
        const ty = pb.t + (pb.b - pb.t) * (0.25 + 0.5 * rnd());
        mote(L.top, tip.x, tip.y, tx, ty, 300, Math.max(0, t * ms - 240), i % 3 === 0, i % 3 === 1);
      }
      // 書く端の光の筋（縦の細い光）と、その真ん中の閃き
      const barH = pb.b - pb.t + X(0.1);
      const bar = luxImg(L.top, "pillar", pb.l, (pb.t + pb.b) / 2, X(0.07), { height: `${barH}px`, top: `${pb.t - X(0.05)}px` });
      const bf = luxImg(L.top, "flare", pb.l, (pb.t + pb.b) / 2, X(0.17));
      for (const [e, o] of [[bar, 1], [bf, 0.95]] as [HTMLElement, number][]) {
        done(m.play(e, [
          { transform: "translateX(0px)", opacity: o },
          { transform: `translateX(${pb.r - pb.l}px)`, opacity: o, offset: 0.92 },
          { transform: `translateX(${pb.r - pb.l}px)`, opacity: 0 },
        ], { duration: ms, easing: "cubic-bezier(0.35, 0.1, 0.3, 1)" }), e);
      }
    },

    // 額が止まって「ドン」。札の両わきに星
    don: () => {
      const pb = plateBox();
      for (let i = 0; i < 4; i++) {
        const left = i % 2 === 0;
        star(L.top, left ? pb.l - X(0.01) : pb.r + X(0.01), pb.t + (pb.b - pb.t) * (0.15 + rnd() * 0.7), X(0.11), i * 55, i % 3 === 2);
      }
    },

    /* 右上へはけて小さくなる（彗星の尾を引いて）。着いたら待機の姿に切り替え、札より手前へ */
    retreat: (c) => {
      const ms = (c.dur ?? 0.8) * 1000;
      const to = staySpot();
      flyArc(to, [now.x + X(0.15), Math.min(now.y, to.y) - Y(0.08)], ms, { overshoot: X(0.02), tail: true });
      m.after(ms, () => {
        L.actorBox.style.zIndex = "4";
        popTo("idle", 320);
      });
    },

    /* 呼び出し: 魔法陣から光があふれる（光の柱・光の筋・光の輪）。その人のキャラ絵は光の中から
       ふくらむ（index.tsx）。粒の層はキャラ絵の後ろへ */
    reveal: () => {
      L.frontBox.style.zIndex = "0";
      const c = placeRing();
      /* 大きな光を**同じ瞬間に重ねない**。閃き・柱・光の筋・魔法陣の広がり・キャラ絵のふくらみを全部
         0 秒に重ねた版は、この箱で 0.4〜0.85 秒のあいだ 50〜83ms のコマが続いた。閃きと柱（手前）を先に、
         光の筋と星は閃きが引いてから */
      // 手前の閃きと光の柱: キャラ絵がふくらみ始める瞬間だけ、キャラ絵の前に出す（後ろだけだと、ふくらむ
      // キャラ絵にすぐ隠れて「呼び出した」瞬間が見えなかった）。キャラ絵が出きる（0.85 秒）より前に消す
      flash(L.top, c.x, c.y, X(0.62), 440, 0, 1);
      const core = luxImg(L.top, "pillar", c.x, c.y - Y(0.25), X(0.16), { height: `${Y(0.4)}px`, top: `${c.y - Y(0.34)}px`, transformOrigin: "50% 85%" });
      done(m.play(core, [
        { opacity: 0, transform: "scale(0.2, 0.3)" },
        { opacity: 1, transform: "scale(1, 1)", offset: 0.3, easing: "ease-out" },
        { opacity: 0, transform: "scale(0.1, 1.2)" },
      ], { duration: 480, easing: "ease-in" }), core);
      m.after(200, () => shock(0.3, 1.15, 600));
      // 魔法陣が力を得て広がる（小さく開いていたのが、呼び出しの光と一緒に 1 へ）
      m.play(circle, [
        { transform: plane(REST, OPEN_K) },
        { transform: plane(REST + 8, 1.05), offset: 0.5, easing: "ease-out" },
        { transform: plane(REST + 10, 1) },
      ], { duration: 520, fill: "forwards", easing: EASE.out });
      /* 光の筋（キャラ絵の真ん中の後ろ）。閃きが引いてからひらいて消える。薄く残すと、魔法陣と大きな絵が
         2枚重なったままになり、滞在中にあやとが浮くだけで重くなる（残した版は GPU 572 ms/秒） */
      m.after(380, () => {
        const rays = luxImg(L.back, "rays", c.x, c.y, X(1.0));
        L.back.insertBefore(rays, circle);
        done(m.play(rays, [
          { opacity: 0, transform: "rotate(-8deg) scale(0.7)" },
          { opacity: 0.9, transform: "rotate(0deg) scale(1)", offset: 0.25, easing: "ease-out" },
          { opacity: 0.4, transform: "rotate(6deg) scale(1.04)", offset: 0.6 },
          { opacity: 0, transform: "rotate(9deg) scale(1.06)" },
        ], { duration: 1400, easing: "ease-in-out" }), rays);
      });
      // 魔法陣のまわりから光の星が噴き出す（閃きが引いてから）
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2 + rnd() * 0.3;
        const r0 = D * 0.2;
        const r1 = D * (0.5 + rnd() * 0.15);
        mote(L.back, c.x + Math.cos(ang) * r0, c.y + Math.sin(ang) * r0, c.x + Math.cos(ang) * r1, c.y + Math.sin(ang) * r1 * 0.95, 700, 420 + i * 40, i % 2 === 1, false, X(0.06));
      }
      // 輪をなぞる光は、光の筋が引いてから
      sweep(1200, 1500);
    },

    stay: () => {
      m.play(aBob, [
        { transform: "translateY(0px) rotate(0deg)" },
        { transform: `translateY(${-X(0.012)}px) rotate(-1.5deg)`, offset: 0.5 },
        { transform: "translateY(0px) rotate(0deg)" },
      ], { duration: 2600, iterations: Infinity, easing: "ease-in-out" });
      // 6〜8秒おきに杖を振って、キャラ絵のまわりへ星を振りかける（キャラ絵の後ろの層）
      stopStay = every(m, 6000, 8000, (i) => {
        if (i % 3 === 2) {
          wave();
          twinkle();
        } else sprinkle();
      }, 2200);
    },

    /* 締め: 魔法陣が明るくなってまた回り出し、キャラ絵がその真ん中へ吸い込まれて帰る →
       あやとが飛ぶ姿で真ん中へ戻る → 魔法陣が光の輪になって消え、あやとも消える */
    finale: (c) => {
      const ms = (c.dur ?? 2.6) * 1000;
      stopStay?.();
      const cc = placeRing();
      glow(X(0.8), 900, 1);
      m.play(circle, [
        { transform: plane(REST + 10, 1), opacity: 1 },
        { transform: plane(REST + 210, 0.9), opacity: 1, offset: 0.7 },
        { transform: plane(REST + 270, 0.2), opacity: 0 },
      ], { duration: ms, fill: "forwards", easing: "cubic-bezier(0.5, 0, 0.75, 0.4)" });
      // まわりから真ん中へ集まる星
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2;
        mote(L.back, cc.x + Math.cos(ang) * D * 0.48, cc.y + Math.sin(ang) * D * 0.46, cc.x, cc.y, 560, i * 30, i % 2 === 1, false);
      }
      curtainCall(m, L, {
        ms,
        hero: aPos,
        exitScale: 0.05,
        afterExit: () => {
          shock(0.3, 1.2, 700, 0.9);
          flash(L.back, cc.x, cc.y, X(0.6), 600);
        },
        toCenter: (mv) => {
          aBob.getAnimations().forEach((x) => x.cancel());
          popTo("fly", 280);
          flyArc({ x: cc.x, y: cc.y - Y(0.04), k: 1 }, [now.x - X(0.1), Math.min(now.y, cc.y) - Y(0.12)], mv, { overshoot: X(0.03), trail: L.top });
          m.after(mv, () => {
            shock(0.5, 1.6, 900, 1);
            flash(L.top, cc.x, cc.y - Y(0.04), X(0.55), 700);
          });
        },
      });
    },
  };

  /**
   * 待機の場所（顔の中心と倍率）。上の帯（キャラ絵の四角の上）の中で、**キャラ絵の頭の近く**
   * （オーナー: 主役と背景のキャラの間を空けすぎない）。靴はキャラ絵の中身の上の辺（顔の枠の上）に乗せ、
   * 横はキャラ絵の中身の右の端に寄せる（面の端は越えない）。顔の枠・字には掛からない
   */
  function staySpot() {
    const idle = P.get("idle") ?? fly;
    const k = X(STAY_W) / Math.max(1, (idle.content[2] - idle.content[0]) * s0);
    const flip = idle.facing === "left";
    const right = flip ? idle.size[0] - idle.content[0] : idle.content[2];
    const left = flip ? idle.size[0] - idle.content[2] : idle.content[0];
    const fx = flip ? idle.size[0] - idle.faceCenter[0] : idle.faceCenter[0];
    const toRight = (right - fx) * s0 * k;
    const toLeft = (fx - left) * s0 * k;
    const toBottom = (idle.content[3] - idle.faceCenter[1]) * s0 * k;
    const toTop = (idle.faceCenter[1] - idle.content[1]) * s0 * k;
    const ct = contentOf();
    const band = bandBottomOf(L, W, H);
    // 靴はキャラ絵の頭の上（キャラ絵が箱いっぱいなら帯の下の辺）。上の端は越えない
    // 杖を振る（±4°）とほうきの先が下がるので、そのぶん上げる（顔の枠に掛けない）
    const feet = Math.max(band, ct.t) - X(0.025);
    const y = Math.max(Y(0.012) + toTop, feet - toBottom);
    const x = Math.max(X(0.02) + toLeft, Math.min(W - X(0.02) - toRight, ct.r + X(0.04) - toRight));
    return { x, y, k };
  }

  function wave() {
    m.play(aSquash, [
      { transform: "rotate(0deg)" },
      { transform: "rotate(-4deg)", offset: 0.2 },
      { transform: "rotate(3deg)", offset: 0.45 },
      { transform: "rotate(-3deg)", offset: 0.7 },
      { transform: "rotate(0deg)" },
    ], { duration: 900, easing: "ease-in-out" });
  }
  /** 杖の先から星が飛んで、キャラ絵のまわりへ降りる（キャラ絵の後ろの層。顔の前は通らない）。届くと魔法陣が光る */
  function sprinkle() {
    wave();
    const tip = at(WAND);
    /* 杖の閃きはキャラ絵の後ろ（back）。手前（top）に出すと、長い光芒がキャラ絵の頭（顔の枠の上の端）に
       届いた（alert-overlap の 664x1180 で 9px） */
    flash(L.back, tip.x, tip.y, X(0.22), 600);
    const c = centerOf(L, W, H);
    const n = 10;
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1;
      const tx = c.x + side * X(0.24 + rnd() * 0.2);
      const ty = c.top + (c.bottom - c.top) * (0.25 + rnd() * 0.65);
      mote(L.back, tip.x, tip.y, tx, ty, 900, 120 + i * 60, i % 3 === 0);
    }
    m.after(120 + n * 60 + 850, () => {
      glow(X(0.45), 500, 0.8);
      sweep(1300);
    });
  }
  function twinkle() {
    const tip = at(WAND);
    star(L.back, tip.x, tip.y, X(0.08), 0);
    star(L.back, tip.x + X(0.03), tip.y - X(0.03), X(0.06), 160, true);
  }

  for (const c of cues) {
    const fn = on[c.do];
    if (fn) m.at(c.t * 1000, () => fn(c));
  }
  return () => {};
}
