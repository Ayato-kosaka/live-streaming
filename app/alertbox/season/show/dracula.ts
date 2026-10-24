/**
 * 段7（10,000円〜）の振付け: ドラキュラのあやと（いちばん上の段。「超絶リッチ」）。
 *
 * 何がいつ起きるかは台本（`themes.ts` の `DRACULA`）が持つ。ここは出来事1つずつの「どう見せるか」。
 * 時計は `Motion`（ヒットストップで止まる）。
 *
 * 流れ: 紫の前兆（暗転・鼓動・こうもりの渦・閃光）→ 古城と満月が昇る → 赤じゅうたんが城門から
 * 転がって手前へ伸びる → 棺が落ちる → ふたが開いて金の光 → あやとが起き上がる（rise。マントを
 * 巻いて口元を隠す）→ **マントばさっ**（spread へ。横にばねのように弾み、金の閃光、紫が赤へ
 * 「昇格」、紙吹雪と花火）→ 字はこうもりに吊られて上の帯で数え上げ「ドン」→ その人の番:
 * 字がキャラ絵の上下中央へ落ち、あやとは idle で左上の角へ。**古城と赤じゅうたんはキャラ絵の後ろに
 * 残り**、滞在中は定期的に古城からこうもりが飛ぶ。締めはキャラ絵と字が消えてから、あやとが真ん中へ
 * 戻ってマントを広げ、こうもりの群れになって消える（`common.ts`。オーナーのレビュー 2版目）。
 *
 * あやとはポーズ絵（`poses/dracula`）を**絵ごと**動かす。3枚とも顔の幅がそろえてあるので、
 * 倍率は1つ（spread がいちばん横に広く、面の幅の 0.96 に収まる大きさ）。基準点は足元。
 *
 * 層（`layers.ts`。奥から）:
 *
 *   dark   暗転（紫 → 赤）・鼓動
 *   back   後光・古城と満月・赤じゅうたん・花火・こうもりの渦
 *   actor  あやと（登場中は棺の中ほどより下を切る。退いたあとは 4 に上がる）
 *   mid    棺
 *   ── その人のキャラ絵（index.tsx）──
 *   front  金貨（canvas）・紙吹雪・きらめき・閃光（キャラ絵が出たら後ろへ下がる）
 *   ── 字（RichText）──
 *   top    字を吊るすこうもり・ぶら下がるこうもり・締めの群れ
 *
 * 滞在のあいだ、あやと・古城・こうもりは面の上の帯（キャラ絵の四角の上）の中だけにいる。
 * 粒と紙吹雪の層はキャラ絵の後ろへ下がるので、その人の顔の前を通らない。
 */
import { EASE, range, type Motion } from "../rig/motion";
import { buildRig, type LoadedRig, type RigHandle } from "../rig/RigView";
import { restOrigin } from "../rig/rig";
import type { TimedCue } from "./script";
import { Coins, dustPuffs, makeBat, pathFrames, partImage, sparkle } from "./fx";
import { bandBottomOf, div, edgeFade, outerBoxOf, plateBoxOf, softDark, type ShowLayers } from "./layers";
import { makePoseActor } from "./poseActor";
import { centerOf, curtainCall, every, stayAura } from "./common";
import type { LoadedPoses } from "./poses";
import type { LoadedItems } from "./items";

export type DraculaAssets = { pose: LoadedPoses; items: LoadedItems; bat: LoadedRig; props: LoadedRig };

/** 古城と満月（登場中）。城門（絵の下の辺）が面の高さの 0.4 に来る */
const CASTLE = { x: 0.5, bottom: 0.4, w: 0.94 };
/** 古城の絵の中の満月の中心と半径・城門（castle_moon.png の px） */
const MOON_IN = { x: 430, y: 227, r: 250 };
/**
 * 赤じゅうたん: 床に寝かせた板（CSS の遠近）。手前の幅は面の 0.4、奥は城門まで。
 * 遠近の強さ（見る距離 P・倒す角 θ）は、城門で幅が 3 割まで細くなる組み合わせ
 */
const CARPET = { nearW: 0.4, P: 1400, tilt: 40 };
const COFFIN = { x: 0.5, bottom: 0.88, w: 0.66 };
/** spread（いちばん横に広い）が面の幅のこれだけに収まる倍率で、3枚とも描く */
const SPREAD_W = 0.9;
/** 滞在の背丈（idle の中身の高さ。面の高さに対する割合）。帯（headroom 0.2）に収まる */
const STAY_H = 0.18;
/** ポーズ絵の中の、光らせる点（絵の px） */
const GLINT = {
  spread: { goblet: [275, 95], fang: [612, 318], brooch: [624, 474], ring: [1096, 456] },
  idle: { goblet: [210, 300], fang: [530, 336], phone: [858, 430], brooch: [470, 465] },
} as const;
/**
 * 吊られている字の真ん中の高さ（面の高さに対する割合）。字の上の端は面の上から 0.04 より下
 * （上の両端をつかむこうもりが、面の上で切れないように）
 */
const HANG_Y = 0.14;
const HANG_TOP = 0.04;
/** その人の番になってから字を落とすまで（ms）。あやとがこうもりに化けて消えてから落とす */
const DROP_AFTER_MS = 440;

export function runDracula(m: Motion, L: ShowLayers, A: DraculaAssets, cues: TimedCue[], W: number, H: number): () => void {
  const X = (f: number) => f * W;
  const Y = (f: number) => f * H;
  const T = (x: number, y: number, k = 1) => `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${k.toFixed(4)})`;

  // ---------------------------------------------------------------- 小物を置く
  /** 小物を `parent` に置く。原点は中身の下の辺の真ん中（`at: "bottom"`）か真ん中。中身の幅が `width` */
  const place = (name: string, parent: HTMLElement, width: number, at: "bottom" | "center" = "bottom") => {
    const it = A.items.items.get(name);
    if (!it) return null;
    const [x0, y0, x1, y1] = it.content;
    const s = width / Math.max(1, x1 - x0);
    const box = div(parent, { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px" });
    const im = document.createElement("img");
    im.src = it.img.url;
    im.alt = "";
    im.draggable = false;
    const ax = (x0 + x1) / 2;
    const ay = at === "bottom" ? y1 : (y0 + y1) / 2;
    Object.assign(im.style, {
      position: "absolute",
      left: `${(-ax * s).toFixed(1)}px`,
      top: `${(-ay * s).toFixed(1)}px`,
      width: `${(it.size[0] * s).toFixed(1)}px`,
      height: `${(it.size[1] * s).toFixed(1)}px`,
      userSelect: "none",
    } satisfies Partial<CSSStyleDeclaration>);
    box.appendChild(im);
    return { box, im, s, w: (x1 - x0) * s, h: (y1 - y0) * s, it };
  };

  // ---------------------------------------------------------------- 暗転（紫 → 赤）・鼓動・閃光
  /* 暗さ・鼓動・白い閃光は、舞台ではなく箱いっぱいの外の箱に置き、箱の縁へ向かって 0 に溶かす
     （`edgeFade`）。縁まで暗いと、画面いっぱいでないウィジェットの形が暗い四角になって浮いた */
  const darkBoxEl = outerBoxOf(L.dark);
  const frontBoxEl = outerBoxOf(L.front);
  const darkPurple = div(darkBoxEl, {
    position: "absolute",
    inset: "0px",
    background: softDark("16,3,30", 0.94),
    opacity: "0",
  });
  /* 「昇格」の赤。マントばさっで紫と入れ替わる（いちばん上の段に来た合図） */
  const darkRed = div(darkBoxEl, {
    position: "absolute",
    inset: "0px",
    background: softDark("92,0,18", 0.92),
    opacity: "0",
  });
  const pulseEl = (rgb: string) =>
    div(darkBoxEl, {
      position: "absolute",
      inset: "0px",
      // 鼓動は真ん中から広がる色のにじみ（輪にすると、箱の中に色の楕円の縁が浮いた）
      background: edgeFade([[0, `rgba(${rgb},0.5)`], [55, `rgba(${rgb},0.38)`], [82, `rgba(${rgb},0.16)`], [100, `rgba(${rgb},0)`]]),
      opacity: "0",
    });
  const pulsePurple = pulseEl("150,40,230");
  const pulseRed = pulseEl("220,10,40");
  let red = false;
  const flash = div(frontBoxEl, {
    position: "absolute",
    inset: "0px",
    background: edgeFade([[0, "rgba(255,255,255,1)"], [55, "rgba(255,255,255,0.95)"], [100, "rgba(255,255,255,0)"]]),
    opacity: "0",
  });
  const goldFlash = div(L.front, {
    position: "absolute",
    inset: "0px",
    background: "radial-gradient(ellipse at 50% 52%, rgba(255,236,160,0.95) 0%, rgba(255,196,60,0.5) 32%, rgba(255,196,60,0) 68%)",
    opacity: "0",
  });
  /* マントばさっの後光。あやとの**後ろ**で弾けさせる（手前の閃光だけだと、いちばんの見せ場で
     あやとが光に埋もれて消えて見えた） */
  const aura = div(L.back, {
    position: "absolute",
    left: `${X(0.5) - X(0.75)}px`,
    top: `${Y(0.5) - X(0.75)}px`,
    width: `${X(1.5)}px`,
    height: `${X(1.5)}px`,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(255,244,200,1) 0%, rgba(255,206,90,0.75) 28%, rgba(255,170,40,0) 66%)",
    opacity: "0",
  });
  let darkNow = 0;
  const darkTo = (to: number, ms: number, easing: string = EASE.out) => {
    m.play(red ? darkRed : darkPurple, [{ opacity: darkNow }, { opacity: to }], { duration: ms, easing, fill: "forwards" });
    darkNow = to;
  };

  // ---------------------------------------------------------------- 後光・古城と満月
  const castle = place("castle_moon", L.back, X(CASTLE.w));
  const castleS = castle?.s ?? 1;
  const moonAt = castle
    ? { x: X(CASTLE.x) + (MOON_IN.x - (castle.it.content[0] + castle.it.content[2]) / 2) * castleS, y: Y(CASTLE.bottom) + (MOON_IN.y - castle.it.content[3]) * castleS }
    : { x: X(0.5), y: Y(0.2) };
  const haloD = MOON_IN.r * castleS * 2 * 2.1;
  const halo = div(L.back, {
    position: "absolute",
    left: `${moonAt.x - haloD / 2}px`,
    top: `${moonAt.y - haloD / 2}px`,
    width: `${haloD}px`,
    height: `${haloD}px`,
    borderRadius: "50%",
    background: "repeating-conic-gradient(from 0deg, rgba(255,214,120,0.4) 0deg 5deg, rgba(255,214,120,0) 5deg 15deg)",
    opacity: "0",
    willChange: "transform",
  });
  halo.style.setProperty("mask-image", "radial-gradient(circle, #000 26%, rgba(0,0,0,0) 70%)");
  halo.style.setProperty("-webkit-mask-image", "radial-gradient(circle, #000 26%, rgba(0,0,0,0) 70%)");
  // 古城は後光より手前
  if (castle) {
    L.back.appendChild(castle.box);
    castle.box.style.opacity = "0";
    castle.box.style.transform = T(X(CASTLE.x), Y(CASTLE.bottom));
  }

  // ---------------------------------------------------------------- 赤じゅうたん（床に寝かせた板）
  const P = CARPET.P;
  const th = (CARPET.tilt * Math.PI) / 180;
  const nearW = X(CARPET.nearW);
  /** 板の手前の端から奥へ `y` の点が、画面でどれだけ上に見えるか（px）と、そこでの縮み */
  const proj = (y: number) => {
    const f = P / (P + y * Math.sin(th));
    return { up: y * Math.cos(th) * f, f };
  };
  /* 板の長さ: 奥の端が城門（古城の下の辺）に見える長さ */
  const reach = H - Y(CASTLE.bottom);
  const planeL = (reach * P) / (P * Math.cos(th) - reach * Math.sin(th));
  const strip = A.items.items.get("carpet_strip");
  const end = A.items.items.get("carpet_end");
  const sx = strip ? nearW / Math.max(1, strip.content[2] - strip.content[0]) : 1;
  const endH = end ? (end.content[3] - end.content[1]) * sx : 0;
  const plane = div(L.back, {
    position: "absolute",
    left: `${X(0.5) - nearW / 2}px`,
    top: `${H - planeL}px`,
    width: `${nearW}px`,
    height: `${planeL}px`,
    transformOrigin: "50% 100%",
    transform: `perspective(${P}px) rotateX(${CARPET.tilt}deg)`,
  });
  /** 見せるぶんだけ切る（奥から手前へ伸びる）。手前の端は帯より広がるので、左右は切らない */
  const planeIn = div(plane, { position: "absolute", inset: "0px", clipPath: `inset(0px -60% ${planeL}px -60%)` });
  if (strip) {
    // 帯は縦につなげる。絵の上下の透明な縁は、隣の絵の中身に重ねて隠す
    const tileH = (strip.content[3] - strip.content[1]) * sx;
    const crop = div(planeIn, { position: "absolute", left: "0px", top: "0px", width: `${nearW}px`, height: `${planeL - endH + 2}px`, overflow: "hidden" });
    for (let y = planeL - endH; y > -tileH; y -= tileH) {
      const im = document.createElement("img");
      im.src = strip.img.url;
      im.alt = "";
      Object.assign(im.style, {
        position: "absolute",
        left: `${(-strip.content[0] * sx).toFixed(1)}px`,
        top: `${(y - tileH - strip.content[1] * sx).toFixed(1)}px`,
        width: `${(strip.size[0] * sx).toFixed(1)}px`,
        height: `${(strip.size[1] * sx).toFixed(1)}px`,
      } satisfies Partial<CSSStyleDeclaration>);
      crop.appendChild(im);
    }
  }
  let endBox: HTMLDivElement | null = null;
  if (end) {
    // 手前の端（金のふさ）。上の辺の幅が帯と同じに焼いてあるので、同じ倍率で上の辺を合わせる
    endBox = div(planeIn, { position: "absolute", left: `${nearW / 2}px`, top: `${planeL - endH}px`, width: "0px", height: "0px", transformOrigin: "0 0" });
    const im = document.createElement("img");
    im.src = end.img.url;
    im.alt = "";
    const cx = (end.content[0] + end.content[2]) / 2;
    Object.assign(im.style, {
      position: "absolute",
      left: `${(-cx * sx).toFixed(1)}px`,
      top: `${(-end.content[1] * sx).toFixed(1)}px`,
      width: `${(end.size[0] * sx).toFixed(1)}px`,
      height: `${(end.size[1] * sx).toFixed(1)}px`,
    } satisfies Partial<CSSStyleDeclaration>);
    endBox.appendChild(im);
  }
  /** 転がる巻き（画面の上に平らに置く。板の上の位置に合わせて縮める） */
  const roll = place("carpet_roll", L.back, nearW * 1.32, "center");
  if (roll) roll.box.style.opacity = "0";

  // ---------------------------------------------------------------- 棺
  const pb = A.props.def;
  const coffinPart = pb.parts.find((p) => p.id === "coffin");
  const coffinImg = coffinPart ? A.props.images.get(coffinPart.file ?? "") : null;
  let coffin: RigHandle | null = null;
  const coffinG = div(L.mid, { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px", opacity: "0" });
  let coffinTop = Y(COFFIN.bottom) - X(COFFIN.w) * 0.5;
  if (coffinPart && coffinImg) {
    const s = X(COFFIN.w) / coffinImg.width;
    coffin = buildRig(A.props, s, { only: ["coffin"] });
    const pile = coffin.part("coins");
    if (pile) pile.style.opacity = "0";
    const o = restOrigin(pb, "coffin")!;
    coffin.root.style.left = `${-(o[0] + coffinImg.width / 2) * s}px`;
    coffin.root.style.top = `${-(o[1] + coffinImg.height) * s}px`;
    coffinG.appendChild(coffin.root);
    coffinTop = Y(COFFIN.bottom) - coffinImg.height * s;
  }
  const coffinAt = `translate(${X(COFFIN.x)}px, ${Y(COFFIN.bottom)}px)`;
  coffinG.style.transform = coffinAt;
  coffinG.style.transformOrigin = "0 0";

  // ---------------------------------------------------------------- あやと（ポーズ絵）
  const spread = A.pose.poses.get("spread");
  const idlePose = A.pose.poses.get("idle");
  const s0 = spread ? (X(SPREAD_W) / Math.max(1, spread.content[2] - spread.content[0])) : 1;
  const act = makePoseActor(L.actor, A.pose, {
    ref: "rise",
    height: s0 * Math.max(1, (A.pose.poses.get("rise") ?? spread)!.content[3] - (A.pose.poses.get("rise") ?? spread)!.content[1]),
    anchor: "feet",
  });
  /* 棺の中ほどより下を切る（棺の中から出てくるように）。足は、膝が棺の上の縁に来る高さ
     （中ほどに膝を置くと、中の金貨の山と手前の壁に腰まで隠れて、マントを広げても見えなかった） */
  const clipY = coffinTop + (Y(COFFIN.bottom) - coffinTop) * 0.5;
  const spreadH = spread ? (spread.content[3] - spread.content[1]) * s0 : Y(0.5);
  const feetY = coffinTop + spreadH * 0.23;
  const riseH = (() => {
    const r = A.pose.poses.get("rise");
    return r ? (r.content[3] - r.content[1]) * s0 : spreadH;
  })();
  let now = { x: X(0.5), y: clipY + riseH * 1.05, k: 1 };
  act.pos.style.transform = T(now.x, now.y, now.k);
  act.pos.style.opacity = "0";
  L.actor.style.clipPath = `inset(0px 0px ${Math.max(0, H - clipY)}px 0px)`;
  const moveTo = (x: number, y: number, k: number, ms: number, easing: string) => {
    const a = m.play(act.pos, [{ transform: T(now.x, now.y, now.k) }, { transform: T(x, y, k) }], { duration: ms, easing, fill: "forwards" });
    now = { x, y, k };
    return a;
  };
  /** ポーズ絵の中の点（絵の px）が、いま舞台のどこにあるか */
  const at = (pose: string, pt: readonly [number, number]) => {
    const [dx, dy] = act.offset(pose, [pt[0], pt[1]]);
    return { x: now.x + dx * now.k, y: now.y + dy * now.k };
  };
  /** 弾み（足元を中心に）。`f` は [横, 縦] の倍率の並び */
  const squash = (f: [number, number][], ms: number) =>
    m.play(act.squash, f.map(([a, b]) => ({ transform: `scale(${a}, ${b})` })), { duration: ms, easing: "ease-in-out" });

  // ---------------------------------------------------------------- 金貨・紙吹雪・花火
  const coins = new Coins(L.canvas, W, H, partImage(A.props, "coin"), () => m.time() / 1000, () => {
    const k = L.canvas.getBoundingClientRect().width / W || 1;
    return Math.min(2, k * (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1));
  });
  const CONFETTI = ["confetti_star", "confetti_heart", "confetti_ribbon", "confetti_sparkle"].filter((n) => A.items.items.has(n));
  /** 紙吹雪1枚。上の外から、揺れて回りながら下の外へ */
  const confettiOne = (delay: number) => {
    const name = CONFETTI[Math.floor(Math.random() * CONFETTI.length)];
    const p = place(name, L.front, X(0.035 + Math.random() * 0.03), "center");
    if (!p) return;
    const x0 = Math.random() * W;
    const sway = X(0.03 + Math.random() * 0.05);
    const ms = 2400 + Math.random() * 1400;
    const spin = (Math.random() < 0.5 ? -1 : 1) * (240 + Math.random() * 360);
    const flipAxis = Math.random() < 0.5 ? "rotateX" : "rotateY";
    const f: Keyframe[] = [];
    for (let i = 0; i <= 8; i++) {
      const k = i / 8;
      const x = x0 + Math.sin(k * Math.PI * 2.2 + x0) * sway;
      const y = -Y(0.05) + (H + Y(0.1)) * k;
      f.push({ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${(spin * k).toFixed(0)}deg) ${flipAxis}(${(k * 720).toFixed(0)}deg)` });
    }
    const a = m.play(p.box, f, { duration: ms, delay, easing: "linear", fill: "backwards" });
    const rm = () => p.box.remove();
    if (a) a.finished.then(rm, rm);
    else rm();
  };
  /** 金の花火1発。下から光が昇って、ぱっと開いて、少し垂れて消える */
  const firework = (x: number, y: number, r: number, delay: number) => {
    const g = div(L.back, { position: "absolute", left: `${x}px`, top: `${y}px`, width: "0px", height: "0px" });
    const dot = (size: number, color: string) =>
      div(g, {
        position: "absolute",
        left: `${-size / 2}px`,
        top: `${-size / 2}px`,
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${color} 0%, ${color} 35%, rgba(255,200,80,0) 70%)`,
        opacity: "0",
      });
    const trail = dot(r * 0.12, "rgba(255,240,190,1)");
    m.play(trail, [
      { transform: `translateY(${Y(0.22)}px) scale(0.7)`, opacity: 0, easing: EASE.out },
      { transform: `translateY(${Y(0.12)}px) scale(1)`, opacity: 1, offset: 0.3 },
      { transform: "translateY(0px) scale(0.6)", opacity: 1, offset: 0.95 },
      { transform: "translateY(0px) scale(0)", opacity: 0 },
    ], { duration: 380, delay, fill: "backwards", easing: EASE.out });
    const glow = dot(r * 1.4, "rgba(255,226,140,0.55)");
    m.play(glow, [
      { transform: "scale(0.2)", opacity: 0 },
      { transform: "scale(1)", opacity: 1, offset: 0.2 },
      { transform: "scale(1.15)", opacity: 0 },
    ], { duration: 700, delay: delay + 360, fill: "backwards", easing: "ease-out" });
    const N = 18;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + Math.random() * 0.2;
      const rr = r * (0.8 + Math.random() * 0.25);
      const dx = Math.cos(a) * rr;
      const dy = Math.sin(a) * rr;
      const s = dot(r * (0.09 + Math.random() * 0.05), i % 3 === 0 ? "rgba(255,255,235,1)" : "rgba(255,206,84,1)");
      m.play(s, [
        { transform: "translate(0px, 0px) scale(1.2)", opacity: 1, easing: EASE.out },
        { transform: `translate(${(dx * 0.86).toFixed(1)}px, ${(dy * 0.86).toFixed(1)}px) scale(1)`, opacity: 1, offset: 0.45, easing: "ease-in" },
        { transform: `translate(${dx.toFixed(1)}px, ${(dy + r * 0.3).toFixed(1)}px) scale(0.3)`, opacity: 0 },
      ], { duration: 1100 + Math.random() * 300, delay: delay + 360, fill: "backwards" });
    }
    m.after(delay + 2000, () => g.remove());
  };
  /** 花火を `n` 発。上の帯の左右（字の後ろ・古城の手前） */
  const fireworks = (n: number) => {
    const spots: [number, number][] = [[0.2, 0.13], [0.8, 0.1], [0.5, 0.06], [0.32, 0.2], [0.7, 0.21]];
    for (let i = 0; i < n; i++) {
      const [fx, fy] = spots[(i + Math.floor(Math.random() * spots.length)) % spots.length];
      firework(X(fx + (Math.random() - 0.5) * 0.06), Y(fy + (Math.random() - 0.5) * 0.03), X(0.17 + Math.random() * 0.06), i * 220);
    }
  };

  // ---------------------------------------------------------------- 揺れ（演出の層だけ）
  const shake = (ms: number, amp: number) => {
    const f: Keyframe[] = [];
    const n = 7;
    for (let i = 0; i <= n; i++) {
      const k = 1 - i / n;
      const a = amp * k * k;
      const dx = i === n ? 0 : (i % 2 === 0 ? 1 : -1) * a;
      const dy = i === n ? 0 : (i % 2 === 0 ? -0.6 : 0.5) * a;
      f.push({ transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)` });
    }
    for (const el of [L.back, L.actor, L.mid]) m.play(el, f, { duration: ms, easing: "linear" });
  };

  // ---------------------------------------------------------------- 字を吊るす・落とす
  /* 登場のあいだ、字はキャラ絵の上下中央ではなく上の帯に吊るす（あやとの体に字を重ねない）。
     その人の番になったら、キャラ絵の上下中央へ落とす。字の枠（index.tsx）を縦にずらすだけ */
  const slot = L.root.querySelector<HTMLElement>('[data-plate="slot"]');
  const screenK = () => L.dark.getBoundingClientRect().width / W || 1;
  let hangDy = 0;
  const hang = () => {
    if (!slot) return;
    const k = screenK();
    const b = plateBoxOf(L, W, H);
    const natural = (b.t + b.b) / 2 - hangDy / k;
    const target = Math.max(Y(HANG_Y), (b.b - b.t) / 2 + Y(HANG_TOP));
    hangDy = (target - natural) * k;
    slot.style.transform = `translateY(calc(-50% + ${hangDy.toFixed(1)}px))`;
  };
  m.after(30, hang);
  const carriers: { el: HTMLDivElement; side: number }[] = [];

  // ---------------------------------------------------------------- 出来事ごと
  const hanging: HTMLDivElement[] = [];
  let stayTimer = 0;
  let glintTimer = 0;
  let stopStay: (() => void) | null = null;
  let keepGlow: ReturnType<typeof stayAura> | null = null;

  const on: Partial<Record<TimedCue["do"], (c: TimedCue) => void>> = {
    darken: (c) => darkTo(c.to ?? 0.8, (c.dur ?? 0.4) * 1000, EASE.inOut),

    pulse: (c) => {
      const n = c.n ?? 1;
      m.play(red ? pulseRed : pulsePurple, [
        { opacity: 0, transform: "scale(1.08)" },
        { opacity: 0.55 + 0.45 * n, transform: `scale(${1 - 0.03 * n})`, offset: 0.25, easing: EASE.out },
        { opacity: 0, transform: "scale(1)" },
      ], { duration: 380 });
    },

    batVortex: (c) => {
      const n = c.n ?? 20;
      const ms = 950;
      const cx = X(0.5);
      const cy = Y(0.36);
      const R0 = Math.hypot(W, H) * 0.62;
      for (let i = 0; i < n; i++) {
        const bat = makeBat(m, A.bat, L.back, X(0.11 + Math.random() * 0.06), 110);
        const a0 = (i / n) * Math.PI * 2 + Math.random() * 0.3;
        const pts: [number, number][] = [];
        const offs: number[] = [];
        const SPIN = 13;
        for (let j = 0; j <= SPIN; j++) {
          const k = j / SPIN;
          const a = a0 + k * Math.PI * 1.7;
          const r = R0 * Math.pow(1 - k, 1.25) + X(0.05) + Math.random() * X(0.03);
          pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.75]);
          offs.push(k * 0.63);
        }
        const aEnd = a0 + Math.PI * 1.7;
        for (let j = 1; j <= 3; j++) {
          const r = X(0.08) + (j / 3) * Math.hypot(W, H) * 0.7;
          pts.push([cx + Math.cos(aEnd + j * 0.2) * r, cy + Math.sin(aEnd + j * 0.2) * r]);
          offs.push(0.63 + (j / 3) * 0.37);
        }
        const a = m.play(bat.el, pathFrames(pts, { tilt: 25, offsets: offs, opacity: (k) => (k < 0.85 ? 1 : 0) }), {
          duration: ms + Math.random() * 60,
          delay: Math.random() * 80,
          fill: "backwards",
        });
        const rm = () => bat.el.remove();
        if (a) a.finished.then(rm, rm);
        else rm();
      }
    },

    flash: () => {
      m.play(flash, [{ opacity: 0 }, { opacity: 0.92, offset: 0.18 }, { opacity: 0 }], { duration: 160, easing: "ease-out" });
    },

    castleRise: (c) => {
      const ms = (c.dur ?? 0.7) * 1000;
      if (castle) {
        m.play(castle.box, [
          { opacity: 0, transform: `${T(X(CASTLE.x), Y(CASTLE.bottom) + Y(0.1))} scale(0.9)`, easing: EASE.out },
          { opacity: 1, transform: `${T(X(CASTLE.x), Y(CASTLE.bottom))} scale(1)` },
        ], { duration: ms, fill: "forwards" });
      }
      m.play(halo, [{ opacity: 0 }, { opacity: 1 }], { duration: ms, fill: "forwards" });
      m.play(halo, [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], { duration: 24000, iterations: Infinity });
      // 窓がぽつぽつ灯る代わりに、満月のまわりにきらめき
      for (let i = 0; i < 4; i++) {
        const a = Math.random() * Math.PI * 2;
        sparkle(m, L.back, moonAt.x + Math.cos(a) * MOON_IN.r * castleS * 1.05, moonAt.y + Math.sin(a) * MOON_IN.r * castleS * 1.05, X(0.08), ms * 0.5 + i * 110);
      }
    },

    carpetRoll: (c) => {
      const ms = (c.dur ?? 0.7) * 1000;
      // 板の奥の端（城門）から手前へ。板の上を同じ速さで転がる（画面では手前ほど速く、大きく見える）
      const N = 14;
      const stops: Keyframe[] = [];
      const rollF: Keyframe[] = [];
      const stripLen = planeL - endH;
      for (let i = 0; i <= N; i++) {
        const k = i / N;
        const v = stripLen * k; // 奥の端から
        stops.push({ clipPath: `inset(0px -60% ${(planeL - v).toFixed(1)}px -60%)` });
        const { up, f } = proj(planeL - v);
        const y = H - up;
        rollF.push({ transform: `translate(${X(0.5).toFixed(1)}px, ${(y - (roll?.h ?? 0) * f * 0.45).toFixed(1)}px) scale(${f.toFixed(3)}) rotate(${(k * 8 - 4).toFixed(1)}deg)` });
      }
      m.play(planeIn, stops, { duration: ms, easing: "linear", fill: "forwards" });
      if (roll) {
        roll.box.style.opacity = "1";
        m.play(roll.box, rollF, { duration: ms, easing: "linear", fill: "forwards" });
      }
      // 手前の端に着いたら、巻きがほどけて金のふさが弾む
      m.after(ms, () => {
        m.play(planeIn, [
          { clipPath: `inset(0px -60% ${endH.toFixed(1)}px -60%)`, easing: EASE.out },
          { clipPath: "inset(0px -60% 0px -60%)" },
        ], { duration: 260, fill: "forwards" });
        if (endBox) {
          m.play(endBox, [
            { transform: "scaleY(0.2)", easing: EASE.out },
            { transform: "scaleY(1.08)", offset: 0.6, easing: "ease-in-out" },
            { transform: "scaleY(1)" },
          ], { duration: 420 });
        }
        if (roll) {
          const { up } = proj(endH);
          m.play(roll.box, [
            { opacity: 1, transform: `translate(${X(0.5)}px, ${H - up - roll.h * 0.45}px) scale(1)` },
            { opacity: 0, transform: `translate(${X(0.5)}px, ${H - roll.h * 0.2}px) scale(1.25, 0.4)` },
          ], { duration: 260, easing: EASE.in, fill: "forwards" });
        }
        for (let i = 0; i < 5; i++) sparkle(m, L.back, X(0.5) + (Math.random() - 0.5) * nearW * 1.4, H - Y(0.05) - Math.random() * Y(0.12), X(0.08), i * 60);
      });
    },

    coffinDrop: (c) => {
      const ms = (c.dur ?? 0.3) * 1000;
      coffinG.style.opacity = "1";
      m.play(coffinG, [
        { transform: `${coffinAt} translateY(${-Y(1)}px) scale(0.92, 1.1)`, easing: "cubic-bezier(0.5, 0, 0.9, 0.6)" },
        { transform: `${coffinAt} translateY(0px) scale(0.92, 1.1)`, offset: 0.999 },
        { transform: `${coffinAt} translateY(0px) scale(1, 1)` },
      ], { duration: ms });
      m.after(ms, () => {
        m.play(coffinG, [
          { transform: `${coffinAt} scale(1.16, 0.8)`, easing: EASE.out },
          { transform: `${coffinAt} scale(0.95, 1.06)`, offset: 0.45, easing: "ease-in-out" },
          { transform: `${coffinAt} scale(1.02, 0.98)`, offset: 0.75, easing: "ease-in-out" },
          { transform: `${coffinAt} scale(1, 1)` },
        ], { duration: 380 });
        dustPuffs(m, L.mid, X(COFFIN.x - COFFIN.w * 0.45), Y(COFFIN.bottom) - X(0.02), X(0.12), 3);
        dustPuffs(m, L.mid, X(COFFIN.x + COFFIN.w * 0.45), Y(COFFIN.bottom) - X(0.02), X(0.12), 3);
      });
    },

    shake: (c) => shake((c.dur ?? 0.25) * 1000, X(0.03)),

    hitstop: (c) => m.hitstop((c.dur ?? 0.08) * 1000),

    lidRattle: (c) => {
      const lid = coffin?.part("lid");
      const ms = (c.dur ?? 0.36) * 1000;
      m.play(lid, [
        { transform: "rotate(0deg)" },
        { transform: "rotate(-4deg)", offset: 0.12 },
        { transform: "rotate(0.5deg)", offset: 0.25 },
        { transform: "rotate(-2.5deg)", offset: 0.35 },
        { transform: "rotate(0deg)", offset: 0.5 },
        { transform: "rotate(-7deg)", offset: 0.66 },
        { transform: "rotate(0.8deg)", offset: 0.8 },
        { transform: "rotate(-3deg)", offset: 0.9 },
        { transform: "rotate(0deg)" },
      ], { duration: ms });
      m.play(coffinG, [
        { transform: `${coffinAt} scale(1, 1)` },
        { transform: `${coffinAt} scale(1.02, 0.98)`, offset: 0.66 },
        { transform: `${coffinAt} scale(1, 1)` },
      ], { duration: ms });
    },

    lidOpen: () => {
      const lid = coffin?.part("lid");
      m.play(lid, [
        { transform: "rotate(0deg)", easing: "cubic-bezier(0.2, 0.8, 0.3, 1)" },
        { transform: "rotate(-96deg)", offset: 0.45, easing: "ease-in-out" },
        { transform: "rotate(-75deg)", offset: 0.75, easing: "ease-in-out" },
        { transform: "rotate(-82deg)" },
      ], { duration: 700, fill: "forwards" });
      m.play(coffin?.part("coins") ?? null, [
        { opacity: 0, transform: "translateY(6%) scale(0.9, 0.7)", easing: EASE.out },
        { opacity: 1, transform: "translateY(0%) scale(1.03, 1.08)", offset: 0.6 },
        { opacity: 1, transform: "translateY(0%) scale(1, 1)" },
      ], { duration: 380, fill: "forwards" });
      // 金の光が噴き出す（あやとより奥）
      const beam = div(L.back, {
        position: "absolute",
        left: `${X(0.5) - X(0.3)}px`,
        top: `${coffinTop - Y(0.5)}px`,
        width: `${X(0.6)}px`,
        height: `${Y(0.5) + X(0.04)}px`,
        background: "linear-gradient(to top, rgba(255,226,130,0.95) 0%, rgba(255,214,110,0.55) 35%, rgba(255,214,110,0) 100%)",
        clipPath: "polygon(30% 100%, 70% 100%, 100% 0%, 0% 0%)",
        transformOrigin: "50% 100%",
        opacity: "0",
      });
      m.play(beam, [
        { opacity: 0, transform: "scaleY(0.1)", easing: EASE.out },
        { opacity: 1, transform: "scaleY(1)", offset: 0.25 },
        { opacity: 0.7, transform: "scaleY(1.05)", offset: 0.6 },
        { opacity: 0, transform: "scaleY(1.1)" },
      ], { duration: 1600, fill: "forwards" });
      for (let i = 0; i < 5; i++) sparkle(m, L.front, X(0.3 + Math.random() * 0.4), coffinTop - Y(Math.random() * 0.2), X(0.1), i * 90);
    },

    // 棺の左右の端から外へ（真ん中はあやとが起き上がるところなので通さない）
    coinFountain: (c) => {
      const n = c.n ?? 60;
      for (const side of [-1, 1]) coins.fountain(X(0.5 + side * COFFIN.w * 0.4), coffinTop + X(0.03), Math.round(n / 2), c.dur ?? 0.6, X(0.08), side);
    },

    rise: (c) => {
      const ms = (c.dur ?? 0.6) * 1000;
      act.pos.style.opacity = "1";
      act.show("rise");
      moveTo(X(0.5), feetY, 1, ms, "cubic-bezier(0.25, 0.1, 0.25, 1.15)");
      // 出きる手前で、ぐっと縮む（ばさっの溜め）
      m.after(ms * 0.75, () => squash([[1, 1], [1.04, 0.95], [0.94, 1.06]], ms * 0.6 + 120));
    },

    // マントばさっ: 一瞬つぶれて、横へばねのように弾む。金の閃光。紫が赤へ
    capeOpen: (c) => {
      const ms = (c.dur ?? 0.35) * 1000;
      /* 起き上がりきっていなければ、ここで起き上がりきらせる（重い晩は、起き上がりの始まりが
         遅れて、まだ棺に沈んだままマントを広げることがあった） */
      act.pos.getAnimations().forEach((a) => a.finish());
      act.show("spread");
      m.play(act.squash, [
        { transform: "scale(0.94, 1.06)", easing: EASE.out },
        { transform: "scale(1.2, 0.86)", offset: 0.18, easing: "ease-in-out" },
        { transform: "scale(0.92, 1.06)", offset: 0.42, easing: "ease-in-out" },
        { transform: "scale(1.05, 0.97)", offset: 0.64, easing: "ease-in-out" },
        { transform: "scale(0.99, 1.01)", offset: 0.82, easing: "ease-in-out" },
        { transform: "scale(1, 1)" },
      ], { duration: ms * 2.6 });
      m.play(aura, [
        { opacity: 0, transform: "scale(0.3)" },
        { opacity: 1, transform: "scale(1)", offset: 0.15 },
        { opacity: 0, transform: "scale(1.35)" },
      ], { duration: 900, easing: "ease-out" });
      m.play(goldFlash, [{ opacity: 0 }, { opacity: 0.4, offset: 0.12 }, { opacity: 0 }], { duration: 500, easing: "ease-out" });
      // 昇格: 紫の暗さを赤へ入れ替える。縁が赤く脈打つ
      red = true;
      m.play(darkRed, [{ opacity: 0 }, { opacity: darkNow }], { duration: 320, fill: "forwards", easing: EASE.out });
      m.play(darkPurple, [{ opacity: darkNow }, { opacity: 0 }], { duration: 320, fill: "forwards", easing: EASE.out });
      m.play(pulseRed, [
        { opacity: 0, transform: "scale(1.1)" },
        { opacity: 1, transform: "scale(0.96)", offset: 0.25, easing: EASE.out },
        { opacity: 0, transform: "scale(1)" },
      ], { duration: 520 });
      // マントの風で金の粉
      coins.dust(34, 0.4, X(0.08), X(0.92), Y(0.32), Y(0.62));
      shake(220, X(0.014));
    },

    confetti: (c) => {
      const n = c.n ?? 40;
      const ms = (c.dur ?? 2) * 1000;
      for (let i = 0; i < n; i++) confettiOne((i / n) * ms + Math.random() * 120);
    },

    fireworks: (c) => fireworks(c.n ?? 2),

    glint: () => {
      const g = GLINT.spread;
      const p1 = at("spread", g.goblet);
      const p2 = at("spread", g.fang);
      const p3 = at("spread", g.brooch);
      const p4 = at("spread", g.ring);
      sparkle(m, L.front, p1.x, p1.y, X(0.16), 0);
      sparkle(m, L.front, p2.x, p2.y, X(0.1), 120);
      sparkle(m, L.front, p3.x, p3.y, X(0.12), 60);
      sparkle(m, L.front, p4.x, p4.y, X(0.1), 180);
    },

    // こうもり2匹が字の上の両端をつかんで、上の帯まで運んで吊るす（字そのものは RichText が動かす）
    plateIn: () => {
      hang();
      const b = plateBoxOf(L, W, H);
      const ms = 560;
      for (const side of [-1, 1]) {
        const bat = makeBat(m, A.bat, L.top, X(0.13), 90);
        const x = side < 0 ? b.l + (b.r - b.l) * 0.16 : b.r - (b.r - b.l) * 0.16;
        const y = b.t - X(0.012);
        m.play(bat.el, [
          { transform: `translate(${x}px, ${y - Y(0.42)}px)`, easing: "cubic-bezier(0.3, 0, 0.6, 1)" },
          { transform: `translate(${x}px, ${y}px)` },
        ], { duration: ms, fill: "forwards" });
        // 吊っているあいだ、ふわふわ
        m.after(ms, () => {
          m.play(bat.rig.root, [
            { transform: "translateY(0px)" },
            { transform: `translateY(${-X(0.008)}px)`, offset: 0.5 },
            { transform: "translateY(0px)" },
          ], { duration: 900, iterations: Infinity, easing: "ease-in-out", delay: side * 200 });
        });
        carriers.push({ el: bat.el, side });
      }
    },

    // 額は振付けでなく RichText が数える。ここは金貨の雨（あやとの顔の前、真ん中の縦の帯には降らせない）
    coinRain: (c) => coins.rain(c.n ?? 50, c.dur ?? 1, [0.3, 0.7]),

    don: () => {
      m.play(goldFlash, [{ opacity: 0 }, { opacity: 0.5, offset: 0.15 }, { opacity: 0 }], { duration: 500, easing: "ease-out" });
      const b = plateBoxOf(L, W, H);
      coins.fountain((b.l + b.r) / 2, (b.t + b.b) / 2, 26, 0.12, (b.r - b.l) * 0.6);
      for (let i = 0; i < 4; i++) sparkle(m, L.front, b.l + Math.random() * (b.r - b.l), b.t + Math.random() * (b.b - b.t), X(0.12), i * 70);
      m.play(pulseRed, [
        { opacity: 0, transform: "scale(1.08)" },
        { opacity: 0.8, transform: "scale(0.97)", offset: 0.25, easing: EASE.out },
        { opacity: 0, transform: "scale(1)" },
      ], { duration: 420 });
      shake(160, X(0.012));
      // あやとは杯をぐいっと（つぶして伸びる）
      squash([[1, 1], [1.06, 0.94], [0.97, 1.04], [1, 1]], 420);
    },

    reveal: () => {
      // ここから先はその人のキャラ絵が出ている。粒・紙吹雪・閃光の層はキャラ絵の後ろへ
      L.frontBox.style.zIndex = "0";
      /* 字がキャラ絵の上下中央へ落ちる（ドスン）。運んでいたこうもりは左右へ飛び去る。
         落とすのは、あやとがこうもりに化けて消えてから（落ちる字があやとの顔の前を通らない。
         オーナーの決まり: 主役の顔は字で隠さない） */
      if (slot) {
        const from = hangDy;
        const k = screenK();
        m.after(DROP_AFTER_MS, () => {
          hangDy = 0;
          slot.style.transform = "translateY(-50%)";
          m.play(slot, [
            { transform: `translateY(calc(-50% + ${from.toFixed(1)}px))`, easing: EASE.down },
            { transform: "translateY(calc(-50% + 0px))", offset: 0.6, easing: EASE.out },
            { transform: `translateY(calc(-50% - ${(X(0.03) * k).toFixed(1)}px))`, offset: 0.8, easing: EASE.in },
            { transform: "translateY(calc(-50% + 0px))" },
          ], { duration: 640 });
        });
      }
      for (const cb of carriers) {
        const t = cb.el.style.transform || getComputedStyle(cb.el).transform;
        const a = m.play(cb.el, [
          { transform: t === "none" ? "translate(0px, 0px)" : t },
          { transform: `translate(${cb.side < 0 ? -X(0.3) : W + X(0.3)}px, ${-Y(0.1)}px)` },
        ], { duration: 700, easing: EASE.in, fill: "forwards" });
        const rm = () => cb.el.remove();
        if (a) a.finished.then(rm, rm);
        else rm();
      }
      // その人の絵の後ろから光がふくらんで消える
      const gd = X(1.1);
      const cc = centerOf(L, W, H);
      const glow = div(L.back, {
        position: "absolute",
        left: `${cc.x - gd / 2}px`,
        top: `${cc.y - gd / 2}px`,
        width: `${gd}px`,
        height: `${gd}px`,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(255,250,230,0.95) 0%, rgba(255,240,200,0.5) 35%, rgba(255,240,200,0) 65%)",
        opacity: "0",
      });
      m.play(glow, [
        { opacity: 0, transform: "scale(0.4)" },
        { opacity: 1, transform: "scale(1)", offset: 0.3 },
        { opacity: 0, transform: "scale(1.6)" },
      ], { duration: 1100, easing: "ease-out", fill: "forwards" });
      // 赤い段の光を、キャラ絵の後ろに残す（古城とじゅうたんの手前、キャラ絵の奥）
      keepGlow = stayAura(m, L.back, cc, X(0.52), "200,30,60", 0.4, 600);
    },

    retreat: (c) => {
      const ms = (c.dur ?? 2.5) * 1000;
      darkTo(c.to ?? 0.16, ms * 0.6, EASE.inOut);
      // 棺・光の輪は消える。じゅうたんと古城はキャラ絵の後ろに残す
      m.play(coffinG, [{ opacity: 1 }, { opacity: 0 }], { duration: ms * 0.25, fill: "forwards" });
      m.play(halo, [{ opacity: 1 }, { opacity: 0 }], { duration: ms * 0.3, fill: "forwards" });
      m.after(ms * 0.3, () => {
        halo.getAnimations().forEach((a) => a.cancel());
        halo.style.display = "none";
      });
      const band = bandBottomOf(L, W, H);
      /* あやとはマントで体を包み、こうもりの群れに化けて帯の左上の角へ飛び、そこで待機の形（idle）に
         戻る。飛んで移ると、上下中央へ落ちてくる字とあやとの顔が途中で重なった。群れはキャラ絵の後ろを
         飛ぶ（その人の顔の前を通らない） */
      act.show("rise");
      squash([[0.9, 1.08], [1.05, 0.95]], 160);
      const idleH = idlePose ? (idlePose.content[3] - idlePose.content[1]) * s0 : spreadH;
      const k = Y(STAY_H) / idleH;
      const idleW = idlePose ? (idlePose.content[2] - idlePose.content[0]) * s0 * k : X(0.3);
      const tx = X(0.02) + idleW / 2;
      const ty = band - X(0.004);
      const from = { ...now };
      const fromC = { x: from.x, y: from.y - riseH * from.k * 0.55 };
      const toC = { x: tx, y: ty - Y(STAY_H) * 0.5 };
      m.after(160, () => {
        m.play(act.pos, [
          { transform: T(from.x, from.y, from.k), opacity: 1 },
          { transform: T(from.x, from.y, from.k * 0.3), opacity: 0 },
        ], { duration: 180, easing: EASE.in, fill: "forwards" });
        dustPuffs(m, L.back, fromC.x, fromC.y, X(0.14), 5);
        for (let i = 0; i < 6; i++) sparkle(m, L.back, fromC.x + (Math.random() - 0.5) * X(0.25), fromC.y + (Math.random() - 0.5) * X(0.25), X(0.1), i * 40);
        const hop = ms * 0.32;
        for (let i = 0; i < 9; i++) {
          const bat = makeBat(m, A.bat, L.back, X(0.07 + Math.random() * 0.04), 100);
          const pts: [number, number][] = [];
          const sway = X(0.03 + Math.random() * 0.04) * (i % 2 ? 1 : -1);
          for (let j = 0; j <= 10; j++) {
            const u = j / 10;
            const e = u * u * (3 - 2 * u);
            pts.push([
              fromC.x + (toC.x - fromC.x) * e + Math.sin(u * Math.PI) * sway + (Math.random() - 0.5) * X(0.02),
              fromC.y + (toC.y - fromC.y) * e - Math.sin(u * Math.PI) * Y(0.06),
            ]);
          }
          const a = m.play(bat.el, pathFrames(pts, { tilt: 22, scale: (u) => 0.6 + Math.sin(u * Math.PI) * 0.5, opacity: (u) => (u < 0.9 ? 1 : 0) }), {
            duration: hop,
            delay: i * 30,
            fill: "backwards",
          });
          const rm = () => bat.el.remove();
          if (a) a.finished.then(rm, rm);
          else rm();
        }
        // 角でぽんっと戻る（帯の中。キャラ絵の手前へ）
        m.after(hop + 240, () => {
          // 棺の中ほどで切っていたのを外す（消えているあいだに。脚が棺の下からのぞかない）
          L.actor.style.clipPath = "";
          L.actorBox.style.zIndex = "4";
          act.show("idle");
          now = { x: tx, y: ty, k };
          m.play(act.pos, [
            { transform: T(tx, ty, k * 0.3), opacity: 0 },
            { transform: T(tx, ty, k), opacity: 1 },
          ], { duration: 220, easing: EASE.out, fill: "forwards" });
          squash([[1.15, 0.85], [0.95, 1.06], [1, 1]], 320);
          dustPuffs(m, L.top, toC.x, toC.y, X(0.08), 4);
          for (let i = 0; i < 5; i++) sparkle(m, L.top, toC.x + (Math.random() - 0.5) * idleW, toC.y + (Math.random() - 0.5) * Y(STAY_H) * 0.6, X(0.07), i * 50);
        });
      });
    },

    stay: () => {
      // 浮き沈み（ずっと）
      m.play(act.bob, [
        { transform: "translateY(0px)" },
        { transform: `translateY(${-X(0.006)}px)`, offset: 0.5 },
        { transform: "translateY(0px)" },
      ], { duration: 2600, iterations: Infinity, easing: "ease-in-out" });
      // 上の端の真ん中寄りに、ぶら下がるこうもり（左上の角にあやと、右上の角に古城）
      for (const [fx, fy] of [[0.4, 0.016], [0.52, 0.028]] as const) {
        const bat = makeBat(m, A.bat, L.top, X(0.1), 2400);
        bat.el.style.transform = `translate(${X(fx)}px, ${Y(fy)}px) rotate(180deg) scale(0.9)`;
        m.play(bat.el, [{ opacity: 0 }, { opacity: 1 }], { duration: 500 });
        hanging.push(bat.el);
        m.play(bat.el, [
          { transform: `translate(${X(fx)}px, ${Y(fy)}px) rotate(176deg) scale(0.9)` },
          { transform: `translate(${X(fx)}px, ${Y(fy)}px) rotate(184deg) scale(0.9)` },
        ], { duration: 2200 + fx * 4000, iterations: Infinity, direction: "alternate", easing: "ease-in-out" });
      }
      /* 5〜7秒おきに、あやとが合図して古城からこうもりが飛ぶ（キャラ絵の後ろをぐるりと回る）。
         ときどき、あやとの小芸もはさむ */
      const tricks = [cupSwirl, phonePing, fangGlint, hop];
      stopStay = every(m, 5000, 7000, (i) => {
        if (i % 2 === 0) {
          hop();
          batFlight(i);
        } else tricks[(i >> 1) % tricks.length]();
      }, 1500);
      /* 字のまわりで、ときどき金のきらめき。顔（キャラ絵の上 45%）に掛からないように、字のブロックの
         真ん中より下（左右の端と下の端）だけに置く */
      const glints = () => {
        glintTimer = m.after(range(Math.random, 1600, 3200), () => {
          const b = plateBoxOf(L, W, H);
          const mid = (b.t + b.b) / 2 + X(0.045);
          const side = Math.random() < 0.65;
          const x = side ? (Math.random() < 0.5 ? b.l : b.r) : b.l + Math.random() * (b.r - b.l);
          const y = side ? mid + Math.random() * Math.max(0, b.b - mid) : Math.max(mid, b.b);
          sparkle(m, L.top, x, y, X(0.07));
          glints();
        });
      };
      glints();
    },

    /* 締め: キャラ絵と字が消える → あやとが真ん中（前面）へ戻ってマントを広げる → こうもりの群れに
       なって消える。古城・じゅうたん・暗さも消える */
    finale: (c) => {
      const ms = (c.dur ?? 4) * 1000;
      if (stayTimer) m.clear(stayTimer);
      if (glintTimer) m.clear(glintTimer);
      stopStay?.();
      const cc = centerOf(L, W, H);
      const spreadK = 0.78;
      curtainCall(m, L, {
        ms: ms * 0.7,
        hero: act.pos,
        afterExit: () => {
          keepGlow?.fadeOut(500);
          hanging.forEach((h) => m.play(h, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: "forwards" }));
        },
        toCenter: (mv) => {
          act.bob.getAnimations().forEach((a) => a.cancel());
          // こうもりの群れで左上から真ん中へ（idle のまま縮んで消え、真ん中で spread になって現れる）
          const from = { ...now };
          m.play(act.pos, [
            { transform: T(from.x, from.y, from.k), opacity: 1 },
            { transform: T(from.x, from.y, from.k * 0.3), opacity: 0 },
          ], { duration: 180, easing: EASE.in, fill: "forwards" });
          const fy = cc.y + Y(0.2);
          swarm({ x: from.x, y: from.y - Y(STAY_H) * 0.5 }, { x: cc.x, y: cc.y - Y(0.05) }, mv * 0.6, L.top, 8);
          m.after(mv * 0.6, () => {
            act.show("spread");
            now = { x: cc.x, y: fy, k: spreadK };
            m.play(act.pos, [
              { transform: T(cc.x, fy, spreadK * 0.4), opacity: 0 },
              { transform: T(cc.x, fy, spreadK * 1.05), opacity: 1, offset: 0.6 },
              { transform: T(cc.x, fy, spreadK), opacity: 1 },
            ], { duration: mv * 0.4, easing: EASE.out, fill: "forwards" });
            squash([[1.12, 0.9], [0.96, 1.05], [1, 1]], 360);
            for (let i = 0; i < 8; i++) sparkle(m, L.top, cc.x + (Math.random() - 0.5) * X(0.6), cc.y + (Math.random() - 0.4) * Y(0.25), X(0.09), i * 40);
          });
        },
      });
      // あやとが消えるところで、こうもりの群れになって右へ飛び去る。古城・じゅうたん・暗さも消える
      m.after(ms * 0.7 - 260, () => {
        swarm({ x: cc.x, y: cc.y }, { x: W * 1.15, y: Y(0.12) }, 1300, L.top, 14);
        coins.dust(50, 1.2, 0, W, 0, H * 0.6);
      });
      const fadeAt = ms * 0.55;
      if (castle) m.play(castle.box, [{ opacity: 1 }, { opacity: 0 }], { duration: ms * 0.4, delay: fadeAt, fill: "forwards" });
      m.play(plane, [{ opacity: 1 }, { opacity: 0 }], { duration: ms * 0.4, delay: fadeAt, fill: "forwards" });
      m.after(fadeAt, () => darkTo(0, ms * 0.4, EASE.inOut));
    },
  };

  /** こうもりの群れ: `from` から `to` へ、揺れながら（出たり消えたり） */
  function swarm(from: { x: number; y: number }, to: { x: number; y: number }, ms: number, parent: HTMLElement, n: number) {
    for (let i = 0; i < n; i++) {
      const bat = makeBat(m, A.bat, parent, X(0.07 + Math.random() * 0.04), 100);
      const pts: [number, number][] = [];
      const sway = X(0.03 + Math.random() * 0.05) * (i % 2 ? 1 : -1);
      for (let j = 0; j <= 10; j++) {
        const u = j / 10;
        const e = u * u * (3 - 2 * u);
        pts.push([
          from.x + (to.x - from.x) * e + Math.sin(u * Math.PI) * sway + (Math.random() - 0.5) * X(0.02),
          from.y + (to.y - from.y) * e - Math.sin(u * Math.PI) * Y(0.05),
        ]);
      }
      const a = m.play(bat.el, pathFrames(pts, { tilt: 22, scale: (u) => 0.6 + Math.sin(u * Math.PI) * 0.5, opacity: (u) => (u < 0.9 ? 1 : 0) }), {
        duration: ms,
        delay: i * 30,
        fill: "backwards",
      });
      const rm = () => bat.el.remove();
      if (a) a.finished.then(rm, rm);
      else rm();
    }
  }

  /**
   * 滞在中のこうもり: 古城の満月のあたりから飛び出し、キャラ絵の後ろをぐるりと回って、反対の端へ抜ける
   * （back の層。キャラ絵の顔の前は通らない）
   */
  function batFlight(i: number) {
    const cc = centerOf(L, W, H);
    const dir = i % 4 === 0 ? 1 : -1;
    const n = 5;
    for (let j = 0; j < n; j++) {
      const bat = makeBat(m, A.bat, L.back, X(0.08 + Math.random() * 0.04), 110);
      const pts: [number, number][] = [];
      const rx = X(0.42 + Math.random() * 0.06);
      const ry = (cc.y - cc.top) * (0.55 + Math.random() * 0.2);
      for (let k = 0; k <= 14; k++) {
        const u = k / 14;
        // 月 → キャラ絵のまわりを半周 → 外へ
        const ang = -Math.PI / 2 + dir * u * Math.PI * 1.3;
        pts.push([cc.x + Math.cos(ang) * rx * Math.min(1, u * 3) + (u > 0.85 ? dir * (u - 0.85) * X(2) : 0), moonAt.y + (cc.y + Math.sin(ang) * ry - moonAt.y) * Math.min(1, u * 2.2)]);
      }
      const a = m.play(bat.el, pathFrames(pts, { tilt: 20, scale: (u) => 0.5 + Math.min(1, u * 4) * 0.5, opacity: (u) => (u < 0.05 ? u * 20 : u > 0.92 ? (1 - u) * 12 : 1) }), {
        duration: 2600 + Math.random() * 500,
        delay: j * 140,
        fill: "backwards",
      });
      const rm = () => bat.el.remove();
      if (a) a.finished.then(rm, rm);
      else rm();
    }
  }

  // ---------------------------------------------------------------- 小芸（滞在中。どれも帯の中で終わる）
  function cupSwirl() {
    // 杯を回す: 絵ごと少し傾けて戻す。杯のまわりに金の渦
    m.play(act.squash, [
      { transform: "rotate(0deg)" },
      { transform: "rotate(-4deg)", offset: 0.3 },
      { transform: "rotate(2deg)", offset: 0.65 },
      { transform: "rotate(0deg)" },
    ], { duration: 1200, easing: "ease-in-out" });
    const p = at("idle", GLINT.idle.goblet);
    for (let i = 0; i < 3; i++) sparkle(m, L.top, p.x + Math.cos(i * 2.1) * X(0.03), p.y + Math.sin(i * 2.1) * X(0.02), X(0.06), i * 160);
  }
  function phonePing() {
    // スマホに通知が来て「ピコン」。金貨が1枚ぽんっと出て消える
    const p = at("idle", GLINT.idle.phone);
    squash([[1, 1], [1.03, 0.97], [1, 1]], 300);
    const size = X(0.045);
    const coin = div(L.top, {
      position: "absolute",
      left: `${p.x - size / 2}px`,
      top: `${p.y - size / 2}px`,
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: "50%",
      background: "radial-gradient(circle at 38% 34%, #FFF6C8, #FFC93C 50%, #B8740A)",
      border: `${Math.max(1, size * 0.06)}px solid #7A4A04`,
      opacity: "0",
    });
    const a = m.play(coin, [
      { transform: "translateY(0px) scale(0.3)", opacity: 0, easing: EASE.out },
      { transform: `translateY(${-size * 1.6}px) scale(1.1)`, opacity: 1, offset: 0.35 },
      { transform: `translateY(${-size * 2.2}px) scale(1) scaleX(-1)`, opacity: 1, offset: 0.7 },
      { transform: `translateY(${-size * 2.6}px) scale(0.6)`, opacity: 0 },
    ], { duration: 1000 });
    sparkle(m, L.top, p.x, p.y - size * 1.6, X(0.06), 300);
    const rm = () => coin.remove();
    if (a) a.finished.then(rm, rm);
    else rm();
  }
  function fangGlint() {
    const p = at("idle", GLINT.idle.fang);
    sparkle(m, L.top, p.x, p.y, X(0.06), 0);
    const q = at("idle", GLINT.idle.brooch);
    sparkle(m, L.top, q.x, q.y, X(0.05), 220);
  }
  function hop() {
    m.play(act.squash, [
      { transform: "translateY(0px) scale(1, 1)", easing: EASE.out },
      { transform: "translateY(0px) scale(1.08, 0.92)", offset: 0.15, easing: EASE.up },
      { transform: `translateY(${-X(0.04) / Math.max(0.01, now.k)}px) scale(0.96, 1.05)`, offset: 0.5, easing: EASE.down },
      { transform: "translateY(0px) scale(1.1, 0.9)", offset: 0.82, easing: EASE.out },
      { transform: "translateY(0px) scale(1, 1)" },
    ], { duration: 620 });
  }

  for (const c of cues) {
    const fn = on[c.do];
    if (fn) m.at(c.t * 1000, () => fn(c));
  }

  return () => {
    coins.dispose();
    // 字の枠を元に戻す（次の通知に持ち越さない）
    if (slot) slot.style.transform = "translateY(-50%)";
  };
}
