/**
 * 12月の貯金箱（クリスマスのスノードーム、#1034。あやとが案4 を選んだ 2026-11-23）。
 *
 * ## 段が目で分かるように
 *
 * - 0% はドームの中の町の灯りが**全部消えて**いる（灯った絵の層を出さない）。雪だけがちらつく
 * - 貯まるほど、窓とツリーの電球が下から灯る（0% の絵に 100% の絵を下から切り抜いて重ねる。11月の城と同じ作り。境目はぼかす）
 * - 100% でツリーの星が光り、台座の帯に光が走る
 * - **100% を超えたら**ドームの中じゅうに金の雪が渦を巻き、ちらつく雪も金色になり、ドームのまわりが金色に光る。
 *   ピポはくじで踊る（城と同じ。あふれていると踊る）。100% ちょうどと、ひと目で違って見えるように
 *
 * ## ピポ（11月の城と同じ決まり。`castleBrain.ts` がくじで次の動きを決める）
 *
 * 動きの一覧はここに持たない。城の場所をスノードームの場所に置き換えて動かす（`xmas.ts` の `GlobeStage`）。
 * 隅（ドームの左の雪の上・台座の右の端）を行き来し、止まって座り、小芸（あくび・手を振る・跳ねる・見回す）をし、ときどき
 * 台座の真ん中から帯の陰に入って**帯ごしに顔を出し**、積んだプレゼントに**跳び乗り**、**帯の陰で耳だけ出して眠る**。
 * 城の「旗を振る」は手を振る絵で、「あくび」はバンザイの絵の「のび」で振る（12月のピポは旗を持たず、あくびの絵と
 * 丸くなって眠る絵はまだ無い。描けたら `globe.json` の `yawn`・`sleep` の絵を差し替える）。
 *
 * ## アラート明けに、お金が入る（SKILL.md 0「アラート明け」）
 *
 * 前に出ていたときより額が増えて出直したら、ピポが台座の真ん中で見上げ、アラートの面の真ん中から金貨 6 枚が弧を描いて
 * ドームのてっぺんへ飛び込む → ドームがひと揺れして雪が舞う → 灯りが前の額から今の額まで上がる（約 2.3 秒。城と同じ）。
 *
 * ## 大きさは豚と同じ物差し
 *
 * 場面の大きさは **Dimensions の幅（`useStableWindow`）だけ**から決める（`castleBox`。豚の 1.6 倍）。
 * ピポの顔の幅は場面の幅の 13.5%（城と同じ）。どこへ動いても場面から出ない（`castle.ts` の `fitPipoX` を同じに使う）。
 *
 * ## 重さ（SKILL.md 4「重さの決まり」）
 *
 * 動かすのは transform と opacity だけ（Web Animations）。rAF を回すのは灯りが上がるあいだと数え上げだけ。
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { SeasonTheme, TextTone, XmasBankDef } from "../../themes";
import { loadImage, type LoadedImage } from "../useSeason";
import { useStableWindow } from "../useBoxSize";
import { EASE, Motion, type Rand } from "../rig/motion";
import { seededRandom } from "../plan";
import { outline } from "../ThemedGauge";
import { BREATH, PIPO_POSES, arcPoints, fitPipoX, pipoSize, type PipoPose } from "./castle";
import { initialBrain, nextAction, type PipoAction, type Spot, type Trick } from "./castleBrain";
import { HOP, XMAS_FONT, canvasBox, globeFiles, globeLightY, isFull, isOver, readGlobeDef, xmasBox, xmasLayout, type GlobeDef } from "./xmas";

type Props = {
  theme: SeasonTheme;
  def: XmasBankDef;
  currentAmount: number;
  targetAmount: number;
  label: string;
  /** 出す前のアラートがあるか（あるあいだは額の増えを取っておき、アラート明けに金貨と一緒に見せる。城と同じ） */
  alertPending: boolean;
  /** 部品が読めなかったときに出すもの（コマ送りの貯金箱） */
  fallback: React.ReactNode;
};

type Loaded = { def: GlobeDef; imgs: Map<string, LoadedImage> };

/** 部品はページに1つずつ読む（アラートのたびに出直すので、毎回読み直さない） */
const cache = new Map<string, Promise<Loaded | null>>();

function loadParts(dir: string): Promise<Loaded | null> {
  const hit = cache.get(dir);
  if (hit) return hit;
  const p = (async () => {
    try {
      const res = await fetch(`${dir}/globe.json`);
      if (!res.ok) return null;
      const def = readGlobeDef(await res.json());
      if (!def) return null;
      const files = globeFiles(def);
      const imgs = await Promise.all(files.map((f) => loadImage(`${dir}/${f}`)));
      if (!imgs.every(Boolean)) return null;
      return { def, imgs: new Map(files.map((f, i) => [f, imgs[i]!])) };
    } catch {
      return null;
    }
  })();
  cache.set(dir, p);
  p.then((v) => {
    if (!v) cache.delete(dir);
  });
  return p;
}

export const XmasBank: React.FC<Props> = (props) => {
  const [parts, setParts] = useState<Loaded | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    loadParts(props.def.dir).then((p) => {
      if (alive) setParts(p);
    });
    return () => {
      alive = false;
    };
  }, [props.def.dir]);
  // 読んでいる途中は何も出さない（豚やコマ送りを一瞬出してから差し替えると、ちらつく）
  if (parts === undefined) return null;
  if (parts === null) return <>{props.fallback}</>;
  return <GlobeScene {...props} parts={parts} />;
};

/**
 * 試し表示（`?preview=`）のときだけ効く、ピポの動きの決め方（城の `previewPipo` と同じ書き方）。
 * - `pipoSeed=<数>`: くじの並び（同じ数なら同じ動き）
 * - `pipoAct=peek:0,climb:0,nap,flag,…`: 最初にこの順で動く。そのあとはくじ
 */
function previewPipo(): { seed: string | null; acts: PipoAction[] } {
  if (typeof window === "undefined" || !window.location) return { seed: null, acts: [] };
  const q = new URLSearchParams(window.location.search);
  if (!q.get("preview")) return { seed: null, acts: [] };
  const acts: PipoAction[] = [];
  for (const raw of (q.get("pipoAct") ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    const [k, v] = raw.split(":");
    const n = Number(v ?? 0);
    if (k === "peek") acts.push({ kind: "peek", spot: n });
    else if (k === "climb") acts.push({ kind: "climb", ledge: n });
    else if (k === "nap") acts.push({ kind: "nap", ms: Number(v ?? 5000) || 5000 });
    else if (k === "dance") acts.push({ kind: "dance", ms: 3000 });
    else if (k === "sit") acts.push({ kind: "sit", ms: Number(v ?? 2000) || 2000, look: false });
    else if (k === "walk" && (v === "left" || v === "right" || v === "gate")) acts.push({ kind: "walk", to: v });
    else if (k === "yawn" || k === "flag" || k === "hop" || k === "look") acts.push({ kind: "trick", trick: k as Trick });
  }
  return { seed: q.get("pipoSeed"), acts };
}

/** 出直しをまたいで、前に見せていた額・溜まり具合・あふれを覚えておく（アラート明けに、前の額から上げるため） */
const shown = { amount: 0, level: 0, over: false, seen: false };

const fmt = (n: number) => `${Math.round(n).toLocaleString("ja-JP")}円`;

/** 豚と同じ字体（react-native-web の既定） */
const FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';

/** 金貨の枚数（城と同じ。スマホで重くならないよう絞る） */
const COINS = 6;
/** ドームの雪（ふだん）・舞う雪（アラート明け）・金の雪（あふれ）の数 */
const SNOW = 12;
const FLURRY = 16;
const SWIRL = 34;

/** 動きが止められた（場面を組み直す・片づける）ことを伝える印 */
const STOP = Symbol("stop");

/** 前の層に出すポーズ（顔を出す2枚は、帯の陰の層） */
const FRONT_POSES: PipoPose[] = PIPO_POSES.filter((p) => p !== "peek" && p !== "peekWave");

const GlobeScene: React.FC<Props & { parts: Loaded }> = ({ theme, parts, currentAmount, targetAmount, label, alertPending }) => {
  const { width: dimW } = useStableWindow();
  const box = xmasBox(dimW);
  const { def, imgs } = parts;
  const L = xmasLayout(box, def);
  const S = L.s;
  const X = (u: number) => L.ox + u * S;
  const Y = (u: number) => L.oy + u * S;

  const ratio = targetAmount > 0 ? currentAmount / targetAmount : 0;
  const level = Math.max(0, Math.min(1, ratio));
  const over = isOver(currentAmount, targetAmount);
  const live = useRef({ level, amount: currentAmount, over });
  const pending = useRef(alertPending);
  pending.current = alertPending;

  const hostRef = useRef<HTMLDivElement | null>(null);
  const amountRef = useRef<HTMLSpanElement | null>(null);
  // ピポ（前の層）: 位置 → 左右 → 体（跳ねる・縮む）→ 息 → 絵
  const actorRef = useRef<HTMLDivElement | null>(null);
  const flipRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const breathRef = useRef<HTMLDivElement | null>(null);
  const poseRefs = useRef<Partial<Record<PipoPose, HTMLImageElement | null>>>({});
  // ピポ（帯の陰の層）: 帯ごしに顔を出す。帯の上のふちより下は切って隠す
  const peekClipRef = useRef<HTMLDivElement | null>(null);
  const peekInRef = useRef<HTMLDivElement | null>(null);
  const peekFlipRef = useRef<HTMLDivElement | null>(null);
  const zzzRef = useRef<HTMLDivElement | null>(null);
  const coinRefs = useRef<(HTMLDivElement | null)[]>([]);
  const sparkRef = useRef<HTMLDivElement | null>(null);
  // スノードーム
  const domeRef = useRef<HTMLDivElement | null>(null);
  const litRef = useRef<HTMLDivElement | null>(null);
  const snowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const flurryRefs = useRef<(HTMLDivElement | null)[]>([]);
  const swirlRef = useRef<HTMLDivElement | null>(null);
  const swirlRefs = useRef<(HTMLDivElement | null)[]>([]);
  const auraRef = useRef<HTMLDivElement | null>(null);
  const haloRef = useRef<HTMLDivElement | null>(null);
  const starRef = useRef<HTMLDivElement | null>(null);
  const shineRef = useRef<HTMLDivElement | null>(null);

  /** 場面の外から、溜まり具合と額を渡す口（場面を組み直さずに） */
  const api = useRef<{ setLevel: (lv: number, amount: number, ov: boolean) => void } | null>(null);

  useEffect(() => {
    const m = new Motion();
    let raf = 0;
    let countRaf = 0;
    let dead = false;
    let cur = shown.seen ? shown.level : 0;
    let curOver = shown.seen ? shown.over : false;
    let started = false;
    const fromAmount = shown.seen ? shown.amount : 0;
    const { level: lv0, amount: am0, over: ov0 } = live.current;
    /** アラート明け（前に出ていたときより額が増えて出直した）。金貨を入れる */
    const coinsIn = shown.seen && am0 > shown.amount;
    const fresh = !shown.seen || shown.amount !== am0;
    shown.seen = true;
    const host = hostRef.current;
    const setPhase = (p: string) => host?.setAttribute("data-xmas-phase", p);
    const tr = (x: number, y: number) => `translate(${x}px, ${y}px)`;
    const CB = canvasBox(def);
    const g = def.globe;
    const st = def.stage;

    const anim = (el: Element | null | undefined, frames: Keyframe[], opts: KeyframeAnimationOptions) =>
      new Promise<void>((res, rej) => {
        if (dead) return rej(STOP);
        const a = m.play(el, frames, opts);
        if (!a) return res();
        a.finished.then(() => res(), () => rej(STOP));
      });
    const wait = (ms: number) =>
      new Promise<void>((res, rej) => {
        if (dead) return rej(STOP);
        m.after(ms, res);
      });

    /* ---- 溜まり具合を見せる ---- */
    let fullShown = false;
    let fullLoops: (Animation | null)[] = [];
    /** 満タンの光（星と帯に走る光）。満タンのあいだだけ回す */
    const setFull = (on: boolean, animate: boolean) => {
      if (on === fullShown) return;
      fullShown = on;
      fullLoops.forEach((a) => a?.cancel());
      fullLoops = [];
      const star = starRef.current;
      const shine = shineRef.current;
      if (star) star.style.visibility = on ? "visible" : "hidden";
      if (shine) shine.style.visibility = on ? "visible" : "hidden";
      if (!on) return;
      if (animate)
        m.play(star?.firstElementChild, [
          { opacity: 0, transform: "scale(0.3)" },
          { opacity: 1, transform: "scale(1.6)", offset: 0.35 },
          { opacity: 1, transform: "scale(1)" },
        ], { duration: 700, easing: "ease-out" });
      fullLoops.push(
        m.play(star, [{ opacity: 0.7, transform: "scale(0.92) rotate(0deg)" }, { opacity: 1, transform: "scale(1.08) rotate(8deg)" }, { opacity: 0.7, transform: "scale(0.92) rotate(0deg)" }], {
          duration: 2200,
          iterations: Infinity,
          easing: "ease-in-out",
        }),
        // 台座の帯に光が走る（2.6 秒のうち前の 1 秒だけ走って、あとは休む）
        m.play(shine?.firstElementChild, [
          { transform: "translateX(-110%) skewX(-20deg)", offset: 0 },
          { transform: "translateX(480%) skewX(-20deg)", offset: 0.4 },
          { transform: "translateX(480%) skewX(-20deg)", offset: 1 },
        ], { duration: 2600, iterations: Infinity, easing: "ease-in-out" })
      );
    };

    /** 溜まり具合 `lv` に置く */
    const place = (lv: number, animate: boolean) => {
      cur = lv;
      const el = litRef.current;
      if (el) {
        // 0% は灯った層を出さない（境目のぼかしが、いちばん下の窓をうっすら灯さないように）
        el.style.visibility = lv > 0.001 ? "visible" : "hidden";
        // 灯りの境目をぼかす（窓が1列ずつ ふっと灯るように。くっきりした線で切ると、町が横に割れて見える）
        const y = globeLightY(def, lv) * 100;
        const feather = 4;
        const mk = `linear-gradient(to bottom, transparent ${(y - feather).toFixed(2)}%, #000 ${(y + feather * 0.25).toFixed(2)}%)`;
        const s2 = el.style as unknown as Record<string, string>;
        s2.maskImage = mk;
        s2.webkitMaskImage = mk;
      }
      setFull(isFull(lv), animate);
    };

    /** あふれ（100% を超えた）を出す・引っ込める: 金の雪の渦・ドームの中とまわりの金の光・ちらつく雪が金色に */
    let swirlLoops: (Animation | null)[] = [];
    const setOverflow = (on: boolean, animate: boolean) => {
      if (on === curOver) return;
      curOver = on;
      const sw = swirlRef.current;
      const aura = auraRef.current;
      const halo = haloRef.current;
      for (const e of [sw, aura, halo]) if (e) e.style.visibility = on ? "visible" : "hidden";
      snowRefs.current.forEach((e) => {
        const dot = e?.firstElementChild as HTMLElement | null;
        if (dot) dot.style.background = on ? "radial-gradient(closest-side, #FFFBE0, #FFD54A 60%, rgba(255,200,60,0))" : "rgba(255,255,255,0.95)";
      });
      swirlLoops.forEach((a) => a?.cancel());
      swirlLoops = [];
      if (!on) return;
      swirlRefs.current.forEach((el, i) => {
        if (!el) return;
        const rnd = seededRandom(`swirl-${i}`);
        const dur = 2600 + rnd() * 2400;
        const dir = i % 4 === 0 ? -1 : 1;
        // 外の輪（回る）→ 内の点（輪の半径ぶん外にずらして、上下にゆっくり揺れる）
        swirlLoops.push(
          m.play(el, [{ transform: "rotate(0deg)" }, { transform: `rotate(${360 * dir}deg)` }], { duration: dur, iterations: Infinity, delay: -rnd() * dur }),
          m.play(el.firstElementChild, [
            { opacity: 0.45, transform: "translateY(0px) scale(0.7)" },
            { opacity: 1, transform: `translateY(${-8 * S * (1 + rnd())}px) scale(1.2)` },
            { opacity: 0.45, transform: "translateY(0px) scale(0.7)" },
          ], { duration: 800 + rnd() * 900, iterations: Infinity, delay: -rnd() * 900, easing: "ease-in-out" })
        );
      });
      swirlLoops.push(
        m.play(aura, [{ opacity: 0.65 }, { opacity: 1 }, { opacity: 0.65 }], { duration: 1800, iterations: Infinity, easing: "ease-in-out" }),
        m.play(halo, [{ opacity: 0.55, transform: "scale(0.98)" }, { opacity: 1, transform: "scale(1.01)" }, { opacity: 0.55, transform: "scale(0.98)" }], {
          duration: 2000,
          iterations: Infinity,
          easing: "ease-in-out",
        })
      );
      if (animate) {
        // あふれた瞬間: 金の雪がドームの真ん中からぶわっと広がる
        m.play(sw, [{ opacity: 0, transform: "scale(0.2)" }, { opacity: 1, transform: "scale(1.12)", offset: 0.6 }, { opacity: 1, transform: "scale(1)" }], {
          duration: 900,
          easing: "ease-out",
        });
        m.play(halo, [{ opacity: 0 }, { opacity: 1 }], { duration: 600, easing: "ease-out" });
      }
    };

    /** 溜まり具合を `to` まで動かす。**rAF はこのあいだだけ**回す。終わったらあふれを合わせる。
        途中で次が来たら、前のは待っている側を放してから止める（待ったまま動きが止まらないように） */
    let tweenDone: (() => void) | null = null;
    const tween = (to: number, ms: number, ov: boolean) =>
      new Promise<void>((res0) => {
        cancelAnimationFrame(raf);
        tweenDone?.();
        tweenDone = res0;
        const res = () => {
          if (tweenDone === res0) tweenDone = null;
          res0();
        };
        const a = cur;
        const t0 = performance.now();
        const step = (t: number) => {
          if (dead) return res();
          const q = Math.min(1, (t - t0) / ms);
          place(a + (to - a) * (1 - Math.pow(1 - q, 3)), true);
          if (q < 1) raf = requestAnimationFrame(step);
          else {
            setOverflow(ov, true);
            res();
          }
        };
        if (Math.abs(to - a) < 1e-4) {
          place(to, true);
          setOverflow(ov, true);
          return res();
        }
        raf = requestAnimationFrame(step);
      });
    const countUp = (a: number, b: number, ms: number) => {
      const el = amountRef.current;
      if (!el) return;
      cancelAnimationFrame(countRaf);
      const t0 = performance.now();
      const step = (t: number) => {
        const q = Math.min(1, (t - t0) / ms);
        el.textContent = fmt(a + (b - a) * (1 - Math.pow(1 - q, 3)));
        if (q < 1) countRaf = requestAnimationFrame(step);
      };
      countRaf = requestAnimationFrame(step);
    };

    /* ---- ずっと続く小さな動き: ドームの雪がちらつく ---- */
    snowRefs.current.forEach((el, i) => {
      if (!el) return;
      const rnd = seededRandom(`snow-${i}`);
      const dur = 4200 + rnd() * 3200;
      const sway = (rnd() - 0.5) * 14 * S;
      m.play(el, [
        { transform: "translate(0px, 0%)", opacity: 0 },
        { transform: `translate(${sway}px, 30%)`, opacity: 0.9, offset: 0.15 },
        { transform: `translate(${-sway}px, 220%)`, opacity: 0.9, offset: 0.75 },
        { transform: `translate(${sway * 0.5}px, 300%)`, opacity: 0 },
      ], { duration: dur, iterations: Infinity, delay: -rnd() * dur, easing: "linear" });
    });

    /* ---- ピポを動かす道具（城の `CastleBank` と同じ組み立て。座標は場面の座標） ---- */
    const actor = actorRef.current!;
    const flip = flipRef.current!;
    const body = bodyRef.current!;
    const A = { x: 0, y: 0 };
    const put = (x: number, y: number) => {
      A.x = x;
      A.y = y;
      actor.style.transform = tr(X(x), Y(y));
    };
    let dir: 1 | -1 = 1;
    const face = (d: 1 | -1) => {
      dir = d;
      flip.style.transform = `scaleX(${d})`;
    };
    /* 息は、ピポが見えているあいだだけ回す（帯の陰に入っているあいだは止める。#1178） */
    let breath: Animation | null = null;
    const breathe = (on: boolean) => {
      if (!on) {
        breath?.cancel();
        breath = null;
      } else if (!breath) {
        breath = m.play(breathRef.current, [{ transform: "scale(1, 1)" }, { transform: "scale(1.012, 0.986)" }, { transform: "scale(1, 1)" }], {
          duration: 2600,
          iterations: Infinity,
          easing: "ease-in-out",
        });
      }
    };
    const show = (p: PipoPose | "walk" | null, sway = 0, scale: number = BREATH) => {
      for (const name of FRONT_POSES) {
        const el = poseRefs.current[name];
        if (!el) continue;
        const on = p === "walk" ? name === "walk0" || name === "walk1" : name === p;
        el.style.visibility = on ? "visible" : "hidden";
      }
      actor.style.visibility = p ? "visible" : "hidden";
      breathe(!!p);
      // 幅の広いポーズ・傾ける・広げるポーズは、場面から出ないぶん内へ寄せる（城と同じ）
      if (p) {
        const x = fitPipoX(def, CB, p === "walk" ? "walk0" : p, A.x, dir, sway, scale);
        if (x !== A.x) put(x, A.y);
      }
    };
    const moveTo = (x: number, y: number, ms: number, easing = "linear") => {
      const from = tr(X(A.x), Y(A.y));
      put(x, y);
      return anim(actor, [{ transform: from }, { transform: tr(X(x), Y(y)) }], { duration: ms, easing });
    };
    const arcTo = (x: number, y: number, ms: number, lift: number) => {
      const pts = arcPoints({ x: A.x, y: A.y }, { x, y }, lift);
      put(x, y);
      return anim(actor, pts.map((p) => ({ transform: tr(X(p.x), Y(p.y)) })), { duration: ms, easing: "linear" });
    };
    /** 着地・受け取りの「ぽよん」 */
    const squash = (ms = 260, amt = 1) =>
      anim(body, [
        { transform: `scale(${1 + 0.08 * amt}, ${1 - 0.1 * amt})` },
        { transform: `scale(${1 - 0.03 * amt}, ${1 + 0.04 * amt})`, offset: 0.55 },
        { transform: "scale(1, 1)" },
      ], { duration: ms, easing: "ease-out" });
    /** 空のとき（0 円）は、灯りの消えたランタンを抱えて座る */
    const sitPose = (): PipoPose => (live.current.amount <= 0 ? "wait" : "sit");
    /** 歩く速さ（場面の座標 / 秒。城と同じ 1 秒に場面の幅の 1/3） */
    const speed = CB.width / 3;
    const STEP = 170;
    const hopH = (p: number) => -CB.height * p * S;
    const walkSeg = async (x: number, y: number) => {
      const d = Math.hypot(x - A.x, y - A.y);
      if (d < 1) return;
      if (Math.abs(x - A.x) > 1) face(x > A.x ? 1 : -1);
      show("walk");
      const opt = { duration: STEP * 2, iterations: Infinity };
      const w0 = m.play(poseRefs.current.walk0, [{ opacity: 1 }, { opacity: 1, offset: 0.5 }, { opacity: 0, offset: 0.5 }, { opacity: 0 }], opt);
      const w1 = m.play(poseRefs.current.walk1, [{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1, offset: 0.5 }, { opacity: 1 }], opt);
      const bob = m.play(body, [{ transform: "translateY(0px)" }, { transform: `translateY(${hopH(0.014)}px)` }, { transform: "translateY(0px)" }], {
        duration: STEP,
        iterations: Infinity,
        easing: "ease-in-out",
      });
      try {
        await moveTo(x, y, (d / speed) * 1000);
      } finally {
        w0?.cancel();
        w1?.cancel();
        bob?.cancel();
      }
    };
    /** 高さの違う所（雪の上 ↔ 台座）へは、歩かずに跳んで移る */
    const hopTo = async (x: number, y: number) => {
      if (Math.abs(x - A.x) > 1) face(x > A.x ? 1 : -1);
      show("sit", 0, BREATH * 1.06);
      await anim(body, [{ transform: "scale(1, 1)" }, { transform: "scale(1.06, 0.9)" }], { duration: 160, easing: "ease-in" });
      show("jump");
      const d = dir;
      // 跳ぶ絵は幅が広いので、場面から出ない所に下りる
      await arcTo(fitPipoX(def, CB, "jump", x, d), y, 620, CB.height * 0.12);
      put(x, y);
      show(sitPose(), 0, BREATH * 1.08);
      await squash();
    };
    const go = async (x: number, y: number) => {
      if (Math.abs(y - A.y) > 30) await hopTo(x, y);
      else await walkSeg(x, y);
    };
    const spotXY = (sp: Spot) => {
      const p = sp === "gate" ? st.gate : sp === "left" ? st.left : st.right;
      return { x: p[0], y: p[1] };
    };
    const onLane = () => Math.abs(A.y - st.lane.y) < 2 && A.x >= st.lane.x[0] - 1 && A.x <= st.lane.x[1] + 1;
    const laneX = (x: number) => Math.max(st.lane.x[0], Math.min(st.lane.x[1], x));
    /** 隅・門へ歩く。隅から隅へは、台座の上の道を通る（城の「リボンの後ろの道」と同じ） */
    const walkTo = async (to: Spot) => {
      const p = spotXY(to);
      if (!onLane()) await go(laneX(A.x), st.lane.y);
      await walkSeg(laneX(p.x), st.lane.y);
      if (Math.abs(p.x - A.x) > 1 || Math.abs(p.y - A.y) > 1) {
        // 座る・歩く絵が場面から出ない所へ
        await go(fitPipoX(def, CB, "walk0", p.x, p.x > A.x ? 1 : -1), p.y);
        put(p.x, p.y);
      }
      show(sitPose());
    };
    const faceCenter = () => face(A.x < CB.width / 2 ? 1 : -1);

    /* ---- 動き1つずつ（城と同じ。場所だけスノードームの場所） ---- */
    const sit = async (ms: number, look: boolean) => {
      faceCenter();
      show(sitPose());
      if (!look) return wait(ms);
      await wait(ms * 0.3);
      face(A.x < CB.width / 2 ? -1 : 1);
      show(sitPose(), 5);
      await anim(body, [{ transform: "rotate(0deg)" }, { transform: "rotate(-5deg)" }, { transform: "rotate(0deg)" }], { duration: ms * 0.4, easing: "ease-in-out" });
      faceCenter();
      await wait(ms * 0.3);
    };
    const trick = async (t: Trick) => {
      faceCenter();
      if (t === "yawn") {
        show("yawn", 0, HOP.scale);
        await anim(body, [
          { transform: "scale(1, 1)" },
          { transform: "scale(0.97, 1.05)", offset: 0.45 },
          { transform: "scale(1.01, 0.99)", offset: 0.8 },
          { transform: "scale(1, 1)" },
        ], { duration: 1500, easing: "ease-in-out" });
        show(sitPose());
        await wait(300);
      } else if (t === "flag") {
        // 城の「旗を振る」。12月のピポは旗を持たないので、手を振る絵で同じ振りをする
        show("flag", 7);
        await anim(body, [
          { transform: "rotate(0deg)" },
          { transform: "rotate(-7deg)", offset: 0.15 },
          { transform: "rotate(6deg)", offset: 0.35 },
          { transform: "rotate(-6deg)", offset: 0.55 },
          { transform: "rotate(5deg)", offset: 0.75 },
          { transform: "rotate(0deg)" },
        ], { duration: 2400, easing: "ease-in-out" });
        show(sitPose());
      } else if (t === "hop") {
        show("cheer", 0, HOP.scale);
        await anim(body, [
          { transform: "translateY(0px) scale(1, 1)" },
          { transform: "translateY(0px) scale(1.07, 0.9)", offset: 0.15 },
          { transform: `translateY(${hopH(HOP.lift)}px) scale(0.96, 1.05)`, offset: 0.5 },
          { transform: "translateY(0px) scale(1.06, 0.92)", offset: 0.85 },
          { transform: "translateY(0px) scale(1, 1)" },
        ], { duration: 560, iterations: 2, easing: "ease-in-out" });
        show(sitPose());
      } else {
        // 見回す: 座って、首をかしげて反対を向き、また戻る
        show(sitPose(), 6);
        await wait(250);
        face(A.x < CB.width / 2 ? -1 : 1);
        show(sitPose(), 6);
        await anim(body, [{ transform: "rotate(0deg)" }, { transform: "rotate(6deg)" }, { transform: "rotate(0deg)" }], { duration: 700, easing: "ease-in-out" });
        faceCenter();
        await anim(body, [{ transform: "rotate(0deg)" }, { transform: "rotate(-6deg)" }, { transform: "rotate(0deg)" }], { duration: 700, easing: "ease-in-out" });
        show(sitPose());
      }
    };
    /** 門（台座の真ん中）から帯の陰へ沈む・出てくる（城の「門から入る・出てくる」） */
    const sink = (p: PipoPose) => pipoSize(def, CB, p).h * S;
    const goIn = async () => {
      show("walk0");
      await anim(body, [
        { opacity: 1, transform: "translateY(0px) scale(1)" },
        { opacity: 0, transform: `translateY(${sink("walk0") * 0.6}px) scale(0.86)` },
      ], { duration: 420, easing: EASE.in });
      show(null);
    };
    const comeOut = async () => {
      put(st.gate[0], st.gate[1]);
      show("walk0");
      await anim(body, [
        { opacity: 0, transform: `translateY(${sink("walk0") * 0.6}px) scale(0.86)` },
        { opacity: 1, transform: "translateY(0px) scale(1)" },
      ], { duration: 420, easing: EASE.out });
      show(sitPose());
    };
    const peekSize = pipoSize(def, CB, "peek");
    const waveSize = pipoSize(def, CB, "peekWave");
    const peekH = Math.max(peekSize.h, waveSize.h) * S;
    const peekImg = (p: "peek" | "peekWave") => {
      const a = peekFlipRef.current?.children;
      if (!a) return;
      (a[0] as HTMLElement).style.visibility = p === "peek" ? "visible" : "hidden";
      (a[1] as HTMLElement).style.visibility = p === "peekWave" ? "visible" : "hidden";
    };
    /** 帯の陰の層を、帯ごしの所 `P`（顔の真ん中・帯の上のふち）に開く。絵は帯の上のふちの下に隠れた所から */
    const peekOpen = (P: [number, number]) => {
      const clip = peekClipRef.current!;
      const inner = peekInRef.current!;
      const pf = peekFlipRef.current!;
      const cw = Math.max(peekSize.w, waveSize.w) * 2 * S;
      clip.style.left = `${X(P[0]) - cw / 2}px`;
      clip.style.width = `${cw}px`;
      clip.style.height = `${Y(P[1])}px`;
      inner.style.left = `${cw / 2}px`;
      inner.style.top = `${Y(P[1])}px`;
      inner.style.transform = `translateY(${peekH}px)`;
      clip.style.visibility = "visible";
      return { clip, inner, pf };
    };
    /** 閉じる。絵は `visibility: visible` を持つので、箱を隠すだけでは消えない。帯の陰へ下げてから絵ごと隠す */
    const peekClose = () => {
      peekInRef.current!.style.transform = `translateY(${peekH}px)`;
      for (const c of [...(peekFlipRef.current?.children ?? [])]) (c as HTMLElement).style.visibility = "hidden";
      peekClipRef.current!.style.visibility = "hidden";
    };
    /** 帯ごしに顔を出す（城の「屋根ごしに顔を出す」。帯の上のふちより下は切る） */
    const peek = async (i: number) => {
      const G = spotXY("gate");
      if (Math.abs(A.x - G.x) > 1 || Math.abs(A.y - G.y) > 1) await walkTo("gate");
      await goIn();
      await wait(380);
      const P = st.peeks[Math.max(0, Math.min(st.peeks.length - 1, i))];
      const { inner, pf } = peekOpen(P);
      peekImg("peek");
      pf.style.transform = "scaleX(1)";
      inner.style.transform = "translateY(0px)";
      setPhase("peek");
      await anim(inner, [{ transform: `translateY(${peekH}px)` }, { transform: "translateY(-4%)", offset: 0.75 }, { transform: "translateY(0px)" }], {
        duration: 520,
        easing: "ease-out",
      });
      await wait(500);
      await anim(pf, [{ transform: "rotate(0deg)" }, { transform: "rotate(-9deg)" }, { transform: "rotate(0deg)" }], { duration: 900, easing: "ease-in-out" });
      for (let n = 0; n < 5; n++) {
        peekImg(n % 2 ? "peek" : "peekWave");
        await wait(240);
      }
      peekImg("peek");
      pf.style.transform = "scaleX(-1)";
      await wait(700);
      pf.style.transform = "scaleX(1)";
      await wait(450);
      inner.style.transform = `translateY(${peekH}px)`;
      await anim(inner, [{ transform: "translateY(0px)" }, { transform: `translateY(${peekH}px)` }], { duration: 360, easing: EASE.in });
      peekClose();
      setPhase("idle");
      await wait(450);
      await comeOut();
    };
    /** 積んだプレゼントのてっぺんに跳び乗り、座って見回し、バンザイして跳び下りる（城の「岩山に跳び乗る」） */
    const climb = async (i: number, to: Spot) => {
      const Gp = st.ledges[Math.max(0, Math.min(st.ledges.length - 1, i))];
      face(Gp[0] > A.x ? 1 : -1);
      show("sit", 0, BREATH * 1.06);
      await anim(body, [{ transform: "scale(1, 1)" }, { transform: "scale(1.06, 0.9)" }], { duration: 160, easing: "ease-in" });
      show("jump");
      await arcTo(fitPipoX(def, CB, "jump", Gp[0], dir), Gp[1], 620, CB.height * 0.14);
      put(Gp[0], Gp[1]);
      show(sitPose());
      await squash();
      await wait(450);
      face(A.x < CB.width / 2 ? -1 : 1);
      await wait(650);
      faceCenter();
      show("cheer");
      await anim(body, [{ transform: "translateY(0px)" }, { transform: `translateY(${hopH(0.05)}px)`, offset: 0.5 }, { transform: "translateY(0px)" }], {
        duration: 420,
        iterations: 2,
        easing: "ease-in-out",
      });
      show(sitPose());
      await wait(500);
      const p = spotXY(to);
      await hopTo(p.x, p.y);
    };
    /** 眠っているときの z（帯の陰で眠るピポの耳の上に、小さな字 2 つが浮かんで消える） */
    const zzz = (x: number, y: number) => {
      const z = zzzRef.current;
      if (!z) return [];
      z.style.transform = tr(x, y);
      z.style.visibility = "visible";
      return [...z.children].map((c, n) =>
        m.play(c, [
          { opacity: 0, transform: "translate(0px, 0px) scale(0.6)" },
          { opacity: 1, transform: `translate(${box.width * 0.02}px, ${-box.height * 0.06}px) scale(0.9)`, offset: 0.3 },
          { opacity: 0, transform: `translate(${box.width * 0.05}px, ${-box.height * 0.16}px) scale(1.1)` },
        ], { duration: 2000, delay: n * 1000, iterations: Infinity, easing: "ease-out" })
      );
    };
    /**
     * 眠る（城の「隅で丸くなって眠る」）。12月のピポは、のびをしてから台座の真ん中から帯の陰に入り、
     * **帯の上に耳だけ出して**眠る（z が浮かぶ）。起きたら顔を出して見回し、出てきて元の隅へ戻る
     */
    const nap = async (ms: number, back: Spot) => {
      faceCenter();
      show("yawn", 0, HOP.scale);
      await anim(body, [{ transform: "scale(1, 1)" }, { transform: "scale(0.97, 1.05)" }, { transform: "scale(1, 1)" }], { duration: 1200, easing: "ease-in-out" });
      const G = spotXY("gate");
      if (Math.abs(A.x - G.x) > 1 || Math.abs(A.y - G.y) > 1) await walkTo("gate");
      await goIn();
      // 台座の真ん中にいちばん近い、帯の陰
      const P = st.peeks.reduce((a, b) => (Math.abs(b[0] - G.x) < Math.abs(a[0] - G.x) ? b : a));
      const { inner, pf } = peekOpen(P);
      peekImg("peek");
      pf.style.transform = "scaleX(1)";
      // 耳とずきんだけが帯の上に出るところまで沈める（目は帯の陰）
      const low = peekH * 0.56;
      setPhase("nap");
      await anim(inner, [{ transform: `translateY(${peekH}px)` }, { transform: `translateY(${low}px)` }], { duration: 600, easing: "ease-out" });
      inner.style.transform = `translateY(${low}px)`;
      const deep = m.play(inner, [
        { transform: `translateY(${low}px)` },
        { transform: `translateY(${low + peekH * 0.035}px)` },
        { transform: `translateY(${low}px)` },
      ], { duration: 2400, iterations: Infinity, easing: "ease-in-out" });
      const zs = zzz(X(P[0]) + peekSize.w * S * 0.2, Y(P[1]) - (peekH - low) * 0.9);
      try {
        await wait(ms);
      } finally {
        deep?.cancel();
        zs.forEach((a) => a?.cancel());
        if (zzzRef.current) zzzRef.current.style.visibility = "hidden";
      }
      // 起きる: ひょいと顔を出して見回し、また沈んで、出てくる
      await anim(inner, [{ transform: `translateY(${low}px)` }, { transform: "translateY(0px)" }], { duration: 380, easing: EASE.out });
      inner.style.transform = "translateY(0px)";
      pf.style.transform = "scaleX(-1)";
      await wait(500);
      pf.style.transform = "scaleX(1)";
      await wait(400);
      await anim(inner, [{ transform: "translateY(0px)" }, { transform: `translateY(${peekH}px)` }], { duration: 360, easing: EASE.in });
      peekClose();
      setPhase("idle");
      await wait(300);
      await comeOut();
      await walkTo(back);
    };
    const dance = async (ms: number) => {
      faceCenter();
      show("cheer", 6);
      const n = Math.max(1, Math.round(ms / 600));
      await anim(body, [
        { transform: "translateY(0px) rotate(0deg)" },
        { transform: `translateY(${hopH(0.07)}px) rotate(-6deg)`, offset: 0.5 },
        { transform: "translateY(0px) rotate(0deg)" },
      ], { duration: 600, iterations: n, easing: "ease-in-out" });
      show(sitPose());
    };

    /* ---- アラート明け: 金貨がドームに飛び込む → ドームがひと揺れして雪が舞う → 灯りが上がる ---- */
    const coins = async () => {
      setPhase("coins");
      put(st.gate[0], st.gate[1]);
      face(1);
      show("catch");
      await anim(body, [
        { opacity: 0, transform: `translateY(${box.height * 0.03}px) scale(0.85)` },
        { opacity: 1, transform: "translateY(0px) scale(1)" },
      ], { duration: 220, easing: EASE.out });
      const [cx, cy, , ry] = g.dome;
      const goal = { x: X(g.rect[0] + cx * g.rect[2]), y: Y(g.rect[1] + (cy - ry * 0.86) * g.rect[3]) };
      const hr = host?.getBoundingClientRect();
      const de = typeof document !== "undefined" ? document.documentElement : null;
      const start = hr && de ? { x: de.clientWidth / 2 - hr.left, y: de.clientHeight / 2 - hr.top } : { x: box.width / 2, y: -box.height };
      const rnd = seededRandom(`coins-${am0}`);
      const FLIGHT = 720;
      const GAP = 90;
      const n = coinRefs.current.length;
      for (let i = 0; i < n; i++) {
        const el = coinRefs.current[i];
        if (!el) continue;
        const a = { x: start.x + (rnd() - 0.5) * box.width * 0.36, y: start.y + (rnd() - 0.5) * box.height * 0.2 };
        const pts = arcPoints(a, goal, box.height * 0.28, 11);
        const turns = 1.5 + rnd();
        const frames = pts.map((p, j) => {
          const t = j / (pts.length - 1);
          const sz = 1 - 0.55 * t;
          const spin = Math.max(0.18, Math.abs(Math.cos(t * Math.PI * turns)));
          return { transform: `${tr(p.x, p.y)} scale(${sz * spin}, ${sz})`, opacity: j === pts.length - 1 ? 0 : 1 };
        });
        m.after(i * GAP, () => {
          el.style.visibility = "visible";
          const fly = m.play(el, frames, { duration: FLIGHT, easing: "cubic-bezier(0.35, 0, 0.8, 0.7)" });
          const done = () => {
            el.style.visibility = "hidden";
          };
          if (fly) fly.finished.then(done, done);
          else done();
        });
        // 入った瞬間: きらっ
        m.after(i * GAP + FLIGHT - 30, () => {
          const sk = sparkRef.current;
          if (!sk) return;
          sk.style.transform = tr(goal.x, goal.y);
          m.play(sk.firstElementChild, [
            { opacity: 0, transform: "scale(0.2) rotate(0deg)" },
            { opacity: 1, transform: "scale(1.15) rotate(45deg)", offset: 0.4 },
            { opacity: 0, transform: "scale(0.5) rotate(90deg)" },
          ], { duration: 320, easing: "ease-out" });
        });
      }
      await wait((n - 1) * GAP + FLIGHT + 120);
      // ドームがひと揺れして、雪が舞う
      setPhase("shake");
      m.play(domeRef.current, [
        { transform: "rotate(0deg)" },
        { transform: "rotate(-2.4deg)", offset: 0.2 },
        { transform: "rotate(1.8deg)", offset: 0.45 },
        { transform: "rotate(-0.9deg)", offset: 0.7 },
        { transform: "rotate(0deg)" },
      ], { duration: 700, easing: "ease-in-out" });
      flurryRefs.current.forEach((el, i) => {
        if (!el) return;
        const r = seededRandom(`flurry-${am0}-${i}`);
        const up = -(0.25 + r() * 0.45);
        const dx = (r() - 0.5) * 0.5;
        el.style.visibility = "visible";
        const f = m.play(el, [
          { opacity: 0, transform: "translate(0%, 0%) scale(0.6)" },
          { opacity: 1, transform: `translate(${dx * 100}%, ${up * 100}%) scale(1)`, offset: 0.35 },
          { opacity: 0.9, transform: `translate(${dx * 160}%, ${(up + 0.25) * 100}%) scale(0.9)`, offset: 0.75 },
          { opacity: 0, transform: `translate(${dx * 190}%, ${(up + 0.5) * 100}%) scale(0.8)` },
        ], { duration: 1500 + r() * 500, delay: r() * 160, easing: "ease-out" });
        const done = () => {
          el.style.visibility = "hidden";
        };
        if (f) f.finished.then(done, done);
        else done();
      });
      await wait(380);
      // 入った！ → バンザイ。そのあいだに前の額から今の額まで上がる
      setPhase("rise");
      show("cheer", 0, HOP.scale);
      started = true;
      const { level: lv, amount: am, over: ov } = live.current;
      shown.level = lv;
      shown.amount = am;
      shown.over = ov;
      countUp(fromAmount, am, 1100);
      const rise = tween(lv, 1100, ov);
      await anim(body, [
        { transform: "translateY(0px) scale(1, 1)" },
        { transform: "translateY(0px) scale(1.07, 0.9)", offset: 0.15 },
        { transform: `translateY(${hopH(0.08)}px) scale(0.96, 1.05)`, offset: 0.5 },
        { transform: "translateY(0px) scale(1.06, 0.92)", offset: 0.85 },
        { transform: "translateY(0px) scale(1, 1)" },
      ], { duration: 550, iterations: 2, easing: "ease-in-out" });
      await rise;
      show(sitPose());
      setPhase("idle");
    };

    // 外から溜まり具合が変わったとき（場面は組み直さない）
    api.current = {
      setLevel(lv, amount, ov) {
        live.current = { level: lv, amount, over: ov };
        // アラートを出す前の増えは、アラート明けに金貨と一緒に見せる（ここでは「前の額」を書き換えない）
        if (!started || (pending.current && amount > shown.amount)) return;
        cancelAnimationFrame(countRaf);
        shown.level = lv;
        shown.amount = amount;
        shown.over = ov;
        if (amountRef.current) amountRef.current.textContent = fmt(amount);
        void tween(lv, 420, ov);
      },
    };

    const pv = previewPipo();
    const rand: Rand = pv.seed != null ? seededRandom(`xmas-pipo-${pv.seed}`) : Math.random;
    const loop = async () => {
      // まず前の状態で場面を置く
      place(cur, false);
      setOverflow(curOver, false);
      let startAt: Spot | undefined;
      if (coinsIn) {
        if (amountRef.current) amountRef.current.textContent = fmt(fromAmount);
        await coins();
        startAt = "gate";
      } else if (fresh && (cur !== lv0 || curOver !== ov0)) {
        /* 初めて開いたとき: 0 から今の額まで上げる（金貨は出さない） */
        if (amountRef.current) amountRef.current.textContent = fmt(fromAmount);
        await wait(300);
        started = true;
        countUp(fromAmount, am0, 1500);
        shown.level = lv0;
        shown.amount = am0;
        shown.over = ov0;
        await tween(lv0, 1500, ov0);
      } else {
        // 箱の大きさが変わって組み直したときは、続きから何事もなく
        started = true;
        if (amountRef.current) amountRef.current.textContent = fmt(am0);
        place(lv0, false);
        setOverflow(ov0, false);
        shown.level = lv0;
        shown.amount = am0;
        shown.over = ov0;
      }
      const brain = initialBrain(rand, curOver, st.peeks.length, st.ledges.length, startAt);
      if (!startAt) {
        const p = spotXY(brain.at);
        put(p.x, p.y);
        faceCenter();
        show(sitPose());
      }
      const t0 = m.time();
      const forced = [...pv.acts];
      for (;;) {
        brain.t = m.time() - t0;
        brain.overflow = curOver;
        const act = forced.shift() ?? nextAction(brain, rand);
        if (act.kind === "walk") await walkTo(act.to);
        else if (act.kind === "sit") await sit(act.ms, act.look);
        else if (act.kind === "trick") await trick(act.trick);
        else if (act.kind === "peek") await peek(act.spot);
        else if (act.kind === "climb") await climb(act.ledge, brain.at === "gate" ? "left" : brain.at);
        else if (act.kind === "nap") await nap(act.ms, brain.at === "gate" ? "left" : brain.at);
        else await dance(act.ms);
        // 動きの合間に一息（同じ瞬間に次を決め続けない）
        await wait(120);
      }
    };
    loop().catch((e) => {
      if (e !== STOP) console.error(e);
    });

    return () => {
      dead = true;
      tweenDone?.();
      api.current = null;
      cancelAnimationFrame(raf);
      cancelAnimationFrame(countRaf);
      m.dispose();
    };
    // 場面は大きさと部品で組む。額の変化は api 経由で渡す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box.width, box.height, parts]);

  useEffect(() => {
    live.current = { level, amount: currentAmount, over };
    api.current?.setLevel(level, currentAmount, over);
  }, [level, currentAmount, over]);

  /* 額の桁が増えても、1行目（いまの額と目標）が帯からはみ出さないように縮める（城と同じ。描いた字の幅で測る） */
  const lineRef = useRef<HTMLDivElement | null>(null);
  const [tl, tt, tr2, tb] = def.band.text;
  const band = { x: X(def.band.rect[0]), y: Y(def.band.rect[1]), w: def.band.rect[2] * S, h: def.band.rect[3] * S };
  const text = { x: band.x + band.w * tl, y: band.y + band.h * tt, w: band.w * (tr2 - tl), h: band.h * (tb - tt) };
  useLayoutEffect(() => {
    const el = lineRef.current;
    if (!el) return;
    const fit = () => {
      const w = el.offsetWidth;
      const max = text.w * 0.98;
      el.style.transform = w > max ? `scale(${max / w})` : "";
    };
    fit();
    let alive = true;
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (alive) fit();
      });
    }
    return () => {
      alive = false;
    };
  }, [currentAmount, targetAmount, text.w]);

  const abs: React.CSSProperties = { position: "absolute", left: 0, top: 0 };
  const url = (f: string) => imgs.get(f)!.url;
  const img = (f: string, x: number, y: number, w: number, h: number, extra?: React.CSSProperties) => (
    <img
      src={url(f)}
      alt=""
      draggable={false}
      style={{ position: "absolute", left: x, top: y, width: w, height: h, pointerEvents: "none", userSelect: "none", ...extra }}
    />
  );
  const P = box.width;
  const CBr = canvasBox(def);
  const coinIm = imgs.get(def.coin)!;
  const coinW = P * 0.11;
  const tone = (t: TextTone, w: number): React.CSSProperties => ({ color: t.color, textShadow: outline(t.shadow, w) });
  /** ピポの絵1枚（足もとが (0,0)） */
  const pose = (p: PipoPose, ref?: (el: HTMLImageElement | null) => void, visible = false) => {
    const sp = def.pipo.poses[p];
    const { w, h } = pipoSize(def, CBr, p);
    return (
      <img
        key={p}
        ref={ref}
        src={url(sp.file)}
        alt=""
        draggable={false}
        // 顔の幅 ÷ 絵の幅（`tools/sprites/alert-pipoface.mjs` が配信の実寸の顔の幅を数える）
        data-pipo-face={((sp.face[2] - sp.face[0]) / sp.size[0]).toFixed(4)}
        style={{
          position: "absolute",
          left: -w * S * sp.foot[0],
          top: -h * S * sp.foot[1],
          width: w * S,
          height: h * S,
          visibility: visible ? "visible" : "hidden",
          pointerEvents: "none",
          userSelect: "none",
        }}
      />
    );
  };

  const g = def.globe;
  const [gx, gy, gw, gh] = g.rect;
  const gb = { x: X(gx), y: Y(gy), w: gw * S, h: gh * S };
  const [dcx, dcy, drx, dry] = g.dome;
  const dome = { x: gb.x + (dcx - drx) * gb.w, y: gb.y + (dcy - dry) * gb.h, w: drx * 2 * gb.w, h: dry * 2 * gb.h };
  const [scx, scy, sr] = g.star;
  const star = { x: gb.x + scx * gb.w, y: gb.y + scy * gb.h, r: sr * gb.w };
  const flake = Math.max(2, P * 0.012);
  // ドームのまわりの金の光（あふれ）。場面の上の端を越えない高さまで（豚の 1.6 倍の四角の外に光をにじませない）
  const haloPad = Math.min(dome.y, dome.w * 0.08);

  return (
    <div ref={hostRef} data-xmas-bank="globe" data-xmas-phase="idle" style={{ position: "relative", width: box.width, height: box.height }}>
      {/* あふれの金の光（ドームの後ろ。ガラスのまわりがほんのり金色に光る） */}
      <div
        ref={haloRef}
        style={{
          position: "absolute",
          left: dome.x - haloPad,
          top: dome.y - haloPad,
          width: dome.w + haloPad * 2,
          height: dome.h + haloPad * 2,
          borderRadius: "50%",
          visibility: "hidden",
          pointerEvents: "none",
          background: "radial-gradient(closest-side, rgba(255,214,90,0) 82%, rgba(255,214,90,0.75) 92%, rgba(255,214,90,0) 100%)",
        }}
      />
      {/* スノードーム（アラート明けにひと揺れする） */}
      <div ref={domeRef} style={{ ...abs, width: box.width, height: box.height, transformOrigin: `${gb.x + gb.w / 2}px ${gb.y + gb.h}px` }}>
        {img(g.base, gb.x, gb.y, gb.w, gb.h)}
        <div ref={litRef} style={{ position: "absolute", left: gb.x, top: gb.y, width: gb.w, height: gb.h, visibility: "hidden" }}>
          {img(g.lit, 0, 0, gb.w, gb.h)}
        </div>
        {/* 星の光（満タン） */}
        <div ref={starRef} style={{ position: "absolute", left: star.x - star.r * 3, top: star.y - star.r * 3, width: star.r * 6, height: star.r * 6, visibility: "hidden", pointerEvents: "none" }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              background: "radial-gradient(closest-side, rgba(255,255,255,0.95), rgba(255,230,140,0.75) 25%, rgba(255,200,80,0.25) 60%, rgba(255,200,80,0) 100%)",
            }}
          />
        </div>
        {/* あふれの金の光（ドームの中がほんのり金色に） */}
        <div
          ref={auraRef}
          style={{
            position: "absolute",
            left: dome.x,
            top: dome.y,
            width: dome.w,
            height: dome.h,
            borderRadius: "50%",
            visibility: "hidden",
            pointerEvents: "none",
            background: "radial-gradient(closest-side, rgba(255,226,120,0.62), rgba(255,205,80,0.36) 70%, rgba(255,200,70,0.12) 100%)",
          }}
        />
        {/* ドームの中: ちらつく雪・アラート明けに舞う雪・あふれの金の雪（楕円で切る） */}
        <div style={{ position: "absolute", left: dome.x, top: dome.y, width: dome.w, height: dome.h, borderRadius: "50%", overflow: "hidden", pointerEvents: "none" }}>
          {Array.from({ length: SNOW }, (_, i) => {
            const r = seededRandom(`snowpos-${i}`);
            return (
              <div
                key={`s${i}`}
                ref={(el) => {
                  snowRefs.current[i] = el;
                }}
                style={{ position: "absolute", left: `${8 + r() * 84}%`, top: 0, width: 1, height: (dome.h * 0.9) / 3, opacity: 0, pointerEvents: "none" }}
              >
                <div style={{ position: "absolute", left: -flake, top: 0, width: flake * 2, height: flake * 2, borderRadius: "50%", background: "rgba(255,255,255,0.95)" }} />
              </div>
            );
          })}
          {Array.from({ length: FLURRY }, (_, i) => {
            const r = seededRandom(`flurrypos-${i}`);
            const sz = flake * (0.9 + r() * 0.8);
            return (
              <div
                key={`f${i}`}
                ref={(el) => {
                  flurryRefs.current[i] = el;
                }}
                style={{ position: "absolute", left: `${20 + r() * 60}%`, top: `${55 + r() * 30}%`, width: dome.w * 0.3, height: dome.h * 0.6, visibility: "hidden" }}
              >
                <div style={{ position: "absolute", left: 0, top: 0, width: sz, height: sz, borderRadius: "50%", background: "rgba(255,255,255,0.95)" }} />
              </div>
            );
          })}
          <div ref={swirlRef} style={{ position: "absolute", inset: 0, visibility: "hidden" }}>
            {/* 楕円の渦: 縦を縮めた箱の中で、真ん中を軸に回る */}
            <div style={{ position: "absolute", left: "50%", top: "50%", width: 0, height: 0, transform: `scale(1, ${(dome.h / dome.w).toFixed(3)})` }}>
              {Array.from({ length: SWIRL }, (_, i) => {
                const r = seededRandom(`swirlpos-${i}`);
                const rad = dome.w * (0.06 + r() * 0.38);
                const sz = flake * (2.6 + r() * 2.8);
                return (
                  <div
                    key={i}
                    ref={(el) => {
                      swirlRefs.current[i] = el;
                    }}
                    style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0 }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: rad - sz / 2,
                        top: -sz / 2,
                        width: sz,
                        height: sz,
                        borderRadius: "50%",
                        background: "radial-gradient(closest-side, #FFFFFF, #FFE37A 35%, #FFC83A 60%, rgba(255,190,40,0))",
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      {/* ドームの左に積んだプレゼント（ピポが跳び乗る。ドームと一緒には揺れない） */}
      {def.deco.map((dc, i) => {
        const [dx, dy, dw, dh] = dc.rect;
        return <React.Fragment key={`d${i}`}>{img(dc.file, X(dx), Y(dy), dw * S, dh * S, { transform: `rotate(${dc.rot}deg)` })}</React.Fragment>;
      })}
      {/* ピポの層ぜんぶ（帯の陰・前の層・z）を、豚の 1.6 倍の四角で切る。跳ぶ・踊る・傾けるの組み合わせで
          寄せきれない一瞬があっても、四角の外にはみ出さない（城の決まり「どこへ動いても四角から出さない」） */}
      <div style={{ ...abs, width: box.width, height: box.height, overflow: "hidden", pointerEvents: "none" }}>
      {/* 帯の陰の層: 帯ごしに顔を出すピポ。帯の上のふちより下は切る */}
      <div ref={peekClipRef} style={{ position: "absolute", top: 0, overflow: "hidden", visibility: "hidden", pointerEvents: "none" }}>
        <div ref={peekInRef} style={{ position: "absolute", width: 0, height: 0 }}>
          <div ref={peekFlipRef} style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0, transformOrigin: "0px 0px" }}>
            {(["peek", "peekWave"] as const).map((p) => pose(p, undefined, true))}
          </div>
        </div>
      </div>
      {/* 前の層: ピポ（ドームとプレゼントより手前、帯より奥） */}
      <div ref={actorRef} style={{ ...abs, width: 0, height: 0, visibility: "hidden" }}>
        <div ref={flipRef} style={{ ...abs, width: 0, height: 0 }}>
          <div ref={bodyRef} style={{ ...abs, width: 0, height: 0, transformOrigin: "0px 0px" }}>
            <div ref={breathRef} style={{ ...abs, width: 0, height: 0, transformOrigin: "0px 0px" }}>
              {FRONT_POSES.map((p) =>
                pose(p, (el) => {
                  poseRefs.current[p] = el;
                })
              )}
            </div>
          </div>
        </div>
      </div>
      {/* 眠っているときの z */}
      <div ref={zzzRef} style={{ ...abs, width: 0, height: 0, visibility: "hidden", pointerEvents: "none" }}>
        {[0, 1].map((n) => (
          <span
            key={n}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              fontFamily: FONT,
              fontWeight: 900,
              fontSize: P * (n ? 0.045 : 0.055),
              lineHeight: 1,
              opacity: 0,
              ...tone(theme.text.top, Math.max(1, P * 0.004)),
            }}
          >
            z
          </span>
        ))}
      </div>
      </div>
      {/* 字の帯 */}
      {img(def.band.file, band.x, band.y, band.w, band.h)}
      {/* 帯に走る光（満タン。台座の帯が光る） */}
      <div
        ref={shineRef}
        style={{
          position: "absolute",
          left: band.x + band.w * 0.14,
          top: band.y + band.h * 0.1,
          width: band.w * 0.72,
          height: band.h * 0.74,
          overflow: "hidden",
          borderRadius: band.h * 0.12,
          visibility: "hidden",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: "22%",
            height: "100%",
            background: "linear-gradient(90deg, rgba(255,240,190,0), rgba(255,240,190,0.55) 50%, rgba(255,240,190,0))",
          }}
        />
      </div>
      {/* 字。いまの額（大）と目標（小）を1行に、その下に旅の名前（小）。目立たせるのは いまの額だけ（城と同じ） */}
      <div
        style={{
          position: "absolute",
          left: text.x,
          top: text.y,
          width: text.w,
          height: text.h,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: FONT,
          lineHeight: 1,
          whiteSpace: "nowrap",
          pointerEvents: "none",
        }}
      >
        <div ref={lineRef} style={{ fontWeight: 900, transformOrigin: "50% 50%" }}>
          <span ref={amountRef} data-ink="fill" data-ink-role="amount" style={{ fontSize: P * XMAS_FONT.amount, ...tone(theme.text.center, Math.max(1.4, P * 0.0065)) }}>
            {fmt(currentAmount)}
          </span>
          <span data-ink="fill" data-ink-role="target" style={{ fontSize: P * XMAS_FONT.target, fontWeight: 700, ...quiet(theme.text.top) }}>
            {` / ${fmt(targetAmount)}`}
          </span>
        </div>
        <div data-ink="fill" data-ink-role="label" style={{ fontSize: P * XMAS_FONT.label, fontWeight: 700, marginTop: P * 0.006, ...quiet(theme.text.bottom) }}>
          {label}
        </div>
      </div>
      {/* 金貨（アラート明けだけ）と、入った所のきらっ */}
      {Array.from({ length: COINS }, (_, i) => (
        <div
          key={i}
          ref={(el) => {
            coinRefs.current[i] = el;
          }}
          style={{ ...abs, width: 0, height: 0, visibility: "hidden", pointerEvents: "none" }}
        >
          {img(def.coin, -coinW / 2, -coinW / 2, coinW, (coinIm.height / coinIm.width) * coinW)}
        </div>
      ))}
      <div ref={sparkRef} style={{ ...abs, width: 0, height: 0, pointerEvents: "none" }}>
        <div
          style={{
            position: "absolute",
            left: -P * 0.05,
            top: -P * 0.05,
            width: P * 0.1,
            height: P * 0.1,
            opacity: 0,
            borderRadius: "50%",
            background: "radial-gradient(circle, #FFFFFF 0 18%, rgba(255,232,140,0.95) 32%, rgba(255,200,60,0) 68%)",
          }}
        />
      </div>
    </div>
  );
};

/** 控えめな字（目標・旅の名前）。縁取りを付けず、少し透かす（城と同じ） */
function quiet(t: TextTone): React.CSSProperties {
  return { color: t.color, opacity: 0.62, textShadow: `0 1px 1px ${t.shadow}` };
}
