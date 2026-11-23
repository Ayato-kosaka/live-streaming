/**
 * 12月の貯金箱（クリスマス、#1034）。案3「ソリのプレゼント袋」（`sleigh`）と案4「スノードーム」（`globe`）を、
 * 試し表示の `?bank=sleigh|globe` で切り替えて見比べる（あやと 2026-11-23「案3か案4で迷っている。100%までの段階を
 * どう表示するか、100%を超えたあとどうなるかまで、出来上がったものを見せてほしい」）。
 *
 * ## 段が目で分かるように（25% ごと）
 *
 * - ソリ: 袋は溜まるほど**続けて**ふくらむ（3枚の絵を外形をそろえて継ぐ。`xmas.ts` の `bagMorph`）。それに加えて 25/50/75% で
 *   袋の口からプレゼントが 1→3→5 個ぽんと顔を出し、ソリのランタンが 25% ごとに1つずつ灯る。100% で袋の首に金のリボン、
 *   袋のまわりに金のほのかな光。**超えたら**プレゼントの山がソリにあふれ、ピポがその上に跳び乗ってバンザイ
 * - スノードーム: 0% は町が暗く、雪がちらつく。溜まるほど窓とツリーの電球が下から灯る（0% の絵に 100% の絵を下から切り抜いて
 *   重ねる。11月の城と同じ作り）。100% でツリーの星が光り、台座の金の帯に光が走る。**超えたら**ドームの中に金の雪が渦を巻き、
 *   ピポが台座の上に跳び乗ってバンザイ
 *
 * ## アラート明けに、お金が入る（SKILL.md 0「アラート明け」）
 *
 * 貯金箱はアラートのあいだ消えて、明けると出直す（`index.tsx`）。前に出ていたときより額が増えて出直したら、
 * アラートの面の真ん中から金貨 6 枚が弧を描いて、ソリなら袋の口へ、スノードームならドームのてっぺんへ飛び込む。
 * スノードームはそこでひと揺れして雪が舞う。そのあと前の額から今の額まで上がる（数字も数え上げる）。約 2.3 秒（城と同じ）。
 * 金貨が飛ぶあいだだけは豚の 1.6 倍の外を通る（一瞬だけ。`alert-banksize.mjs` は `?preview=bank` で開くので数えない）。
 *
 * ## 大きさは豚と同じ物差し
 *
 * 場面の大きさは **Dimensions の幅（`useStableWindow`）だけ**から決める（`castleBox`。豚の 1.6 倍）。
 * ピポの顔の幅は場面の幅の 13.5%（城と同じ。`<variant>.json` の `pipo.face`）。
 *
 * ## 重さ（SKILL.md 4「重さの決まり」）
 *
 * 動かすのは transform と opacity だけ（Web Animations）。rAF を回すのは溜まり具合が動くあいだ（1.1〜1.5 秒）と数え上げだけ。
 * ずっと動いているのは、ピポの息・ドームの雪（小さな点 10 個）・満タンの光・あふれの金の雪（14 個）だけ。
 *
 * ## ピポ（選ぶための録画では 座る・手を振る・バンザイ・受け取る だけ）
 *
 * くじで動く全部の動き（歩く・眠る・小芸）は、選ばれたほうにあとで入れる（#1034）。
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { SeasonTheme, TextTone, XmasBankDef } from "../../themes";
import { loadImage, type LoadedImage } from "../useSeason";
import { useStableWindow } from "../useBoxSize";
import { EASE, Motion } from "../rig/motion";
import { seededRandom } from "../plan";
import { outline } from "../ThemedGauge";
import { arcPoints } from "./castle";
import {
  HOP,
  XMAS_FONT,
  XMAS_POSES,
  bagMorph,
  giftsAt,
  globeLightY,
  isFull,
  isOver,
  lanternsAt,
  nextXmasAct,
  pickVariant,
  pipoSpot,
  readXmasDef,
  xmasBox,
  xmasFiles,
  xmasLayout,
  xmasPipoSize,
  type GlobeDef,
  type SleighDef,
  type XmasAct,
  type XmasDef,
  type XmasPose,
  type XmasVariant,
} from "./xmas";

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

type Loaded = { variant: XmasVariant; dir: string; def: XmasDef; imgs: Map<string, LoadedImage> };

/** 部品はページに1つずつ読む（アラートのたびに出直すので、毎回読み直さない） */
const cache = new Map<string, Promise<Loaded | null>>();

function loadParts(dir: string, variant: XmasVariant): Promise<Loaded | null> {
  const key = `${dir}/${variant}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = (async () => {
    try {
      const res = await fetch(`${dir}/${variant}.json`);
      if (!res.ok) return null;
      const def = readXmasDef(await res.json());
      if (!def || def.kind !== variant) return null;
      const files = xmasFiles(def);
      const imgs = await Promise.all(files.map((f) => loadImage(`${dir}/${f}`)));
      if (!imgs.every(Boolean)) return null;
      return { variant, dir, def, imgs: new Map(files.map((f, i) => [f, imgs[i]!])) };
    } catch {
      return null;
    }
  })();
  cache.set(key, p);
  p.then((v) => {
    if (!v) cache.delete(key);
  });
  return p;
}

/** URL の旗（`?bank=` は試し表示でなくても効く。テーマが `live: false` のあいだは試し表示でしか出ないので） */
function urlParam(name: string): string | null {
  if (typeof window === "undefined" || !window.location) return null;
  return new URLSearchParams(window.location.search).get(name);
}

export const XmasBank: React.FC<Props> = (props) => {
  const variant = pickVariant(urlParam("bank"), props.def.variant);
  const [parts, setParts] = useState<Loaded | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    loadParts(props.def.dir, variant).then((p) => {
      if (alive) setParts(p);
    });
    return () => {
      alive = false;
    };
  }, [props.def.dir, variant]);
  // 読んでいる途中は何も出さない（豚やコマ送りを一瞬出してから差し替えると、ちらつく）
  if (parts === undefined) return null;
  if (parts === null) return <>{props.fallback}</>;
  return <XmasScene {...props} parts={parts} />;
};

/** 出直しをまたいで、前に見せていた額・溜まり具合・あふれを覚えておく（アラート明けに、前の額から上げるため） */
const shown = { amount: 0, level: 0, over: false, seen: false };

const fmt = (n: number) => `${Math.round(n).toLocaleString("ja-JP")}円`;

/** 豚と同じ字体（react-native-web の既定） */
const FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';

/** 金貨の枚数（城と同じ。スマホで重くならないよう絞る） */
const COINS = 6;
/** ドームの雪（ふだん）・舞う雪（アラート明け）・金の雪（あふれ）の数 */
const SNOW = 10;
const FLURRY = 16;
const SWIRL = 24;
/** あふれる瞬間に、袋の口から山へ転がり落ちるプレゼントの数 */
const TUMBLE = 3;

/** 動きが止められた（場面を組み直す・片づける）ことを伝える印 */
const STOP = Symbol("stop");

const XmasScene: React.FC<Props & { parts: Loaded }> = ({ theme, parts, currentAmount, targetAmount, label, alertPending }) => {
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
  // ピポ: 位置 → 体（跳ねる・傾く）→ 息 → 絵
  const actorRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const breathRef = useRef<HTMLDivElement | null>(null);
  const poseRefs = useRef<Partial<Record<XmasPose, HTMLImageElement | null>>>({});
  const coinRefs = useRef<(HTMLDivElement | null)[]>([]);
  const sparkRef = useRef<HTMLDivElement | null>(null);
  // ソリ
  const bagRefs = useRef<(HTMLDivElement | null)[]>([]);
  const bagBoxRef = useRef<HTMLDivElement | null>(null);
  const giftClipRef = useRef<HTMLDivElement | null>(null);
  const giftRefs = useRef<(HTMLDivElement | null)[]>([]);
  const bowRef = useRef<HTMLDivElement | null>(null);
  const glowRef = useRef<HTMLDivElement | null>(null);
  const lanternRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pileRef = useRef<HTMLDivElement | null>(null);
  const tumbleRefs = useRef<(HTMLDivElement | null)[]>([]);
  // スノードーム
  const domeRef = useRef<HTMLDivElement | null>(null);
  const litRef = useRef<HTMLDivElement | null>(null);
  const snowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const flurryRefs = useRef<(HTMLDivElement | null)[]>([]);
  const swirlRef = useRef<HTMLDivElement | null>(null);
  const auraRef = useRef<HTMLDivElement | null>(null);
  const swirlRefs = useRef<(HTMLDivElement | null)[]>([]);
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
    /** ぽん と出る。待つあいだは最初のコマ（透明）で止めておく（先に見えてから跳ねない） */
    const pop = (el: Element | null | undefined, ms = 420, delay = 0) =>
      m.play(el, [
        { opacity: 0, transform: "translateY(35%) scale(0.4)" },
        { opacity: 1, transform: "translateY(-8%) scale(1.15)", offset: 0.6 },
        { opacity: 1, transform: "translateY(0%) scale(1)" },
      ], { duration: ms, delay, fill: "backwards", easing: "ease-out" });

    /* ---- ピポ ---- */
    const actor = actorRef.current!;
    const body = bodyRef.current!;
    const A = { x: 0, y: 0 };
    const put = (x: number, y: number) => {
      A.x = x;
      A.y = y;
      actor.style.transform = tr(X(x), Y(y));
    };
    let breath: Animation | null = null;
    const show = (p: XmasPose | null) => {
      for (const name of XMAS_POSES) {
        const el = poseRefs.current[name];
        if (el) el.style.visibility = name === p ? "visible" : "hidden";
      }
      actor.style.visibility = p ? "visible" : "hidden";
      if (p && !breath) {
        breath = m.play(breathRef.current, [
          { transform: "scale(1, 1)" },
          { transform: "scale(1.012, 0.986)" },
          { transform: "scale(1, 1)" },
        ], { duration: 2600, iterations: Infinity, easing: "ease-in-out" });
      }
    };
    /** そのポーズを取る所（あふれているときのバンザイだけ、山の上・台座の上） */
    const home = (pose: XmasPose) => pipoSpot(def, curOver, pose);

    /* ---- 溜まり具合を見せる（案ごと） ---- */
    let giftsShown = 0;
    let lanternsShown = 0;
    let fullShown = false;
    let fullLoops: (Animation | null)[] = [];
    const sl = def.kind === "sleigh" ? (def as SleighDef) : null;
    const gl = def.kind === "globe" ? (def as GlobeDef) : null;

    /** 満タンの光（ソリは袋の首のリボンと金の光・スノードームは星と台座の帯に走る光）。満タンのあいだだけ回す */
    const setFull = (on: boolean, animate: boolean) => {
      if (on === fullShown) return;
      fullShown = on;
      fullLoops.forEach((a) => a?.cancel());
      fullLoops = [];
      if (sl) {
        const bow = bowRef.current;
        const glow = glowRef.current;
        if (bow) bow.style.visibility = on ? "visible" : "hidden";
        if (glow) glow.style.visibility = on ? "visible" : "hidden";
        if (!on) return;
        if (animate) pop(bow?.firstElementChild, 520);
        fullLoops.push(
          m.play(glow, [{ opacity: 0.55, transform: "scale(0.94)" }, { opacity: 0.95, transform: "scale(1)" }, { opacity: 0.55, transform: "scale(0.94)" }], {
            duration: 2600,
            iterations: Infinity,
            easing: "ease-in-out",
          })
        );
      } else {
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
      }
    };

    /** 溜まり具合 `lv` に置く。`animate` なら、またいだ段の分だけ ぽん と出す（プレゼント・ランタン・満タン） */
    const place = (lv: number, animate: boolean) => {
      cur = lv;
      if (sl) {
        const mo = bagMorph(sl, lv);
        mo.sprites.forEach((sp, i) => {
          const el = bagRefs.current[i];
          if (!el) return;
          el.style.opacity = String(sp.opacity);
          el.style.transform = `scale(${sp.sx}, ${sp.sy})`;
        });
        const clip = giftClipRef.current;
        if (clip) clip.style.height = `${Math.max(0, Y(mo.mouth.y))}px`;
        const want = giftsAt(lv);
        sl.gifts.spots.slice(0, 5).forEach(([dx, dy], i) => {
          const el = giftRefs.current[i];
          if (!el) return;
          el.style.transform = tr(X(mo.mouth.x + dx), Y(mo.mouth.y + dy));
          el.style.visibility = i < want ? "visible" : "hidden";
          if (animate && i >= giftsShown && i < want) pop(el.firstElementChild, 460, (i - giftsShown) * 110);
        });
        giftsShown = want;
        const bow = bowRef.current;
        if (bow) bow.style.transform = tr(X(mo.neck.x), Y(mo.neck.y));
        const lit = lanternsAt(lv, sl.sleigh.lanterns.length);
        lanternRefs.current.forEach((el, i) => {
          if (!el) return;
          el.style.visibility = i < lit ? "visible" : "hidden";
          if (animate && i >= lanternsShown && i < lit) {
            // 灯る瞬間: まわりの光がふわっと広がって、灯った絵がすっと出る（絵そのものは動かさない。ランタンからずれない）
            m.play(el.firstElementChild, [
              { opacity: 0, transform: "scale(0.4)" },
              { opacity: 1, transform: "scale(1.5)", offset: 0.35 },
              { opacity: 1, transform: "scale(1)" },
            ], { duration: 620, easing: "ease-out" });
            m.play(el.lastElementChild, [{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: "ease-out" });
          }
        });
        lanternsShown = lit;
      } else if (gl) {
        const el = litRef.current;
        if (el) {
          // 灯りの境目をぼかす（窓が1列ずつ ふっと灯るように。くっきりした線で切ると、町が横に割れて見える）
          const y = globeLightY(gl, lv) * 100;
          const feather = 5;
          const mk = `linear-gradient(to bottom, transparent ${(y - feather).toFixed(2)}%, #000 ${(y + feather * 0.2).toFixed(2)}%)`;
          const st = el.style as unknown as Record<string, string>;
          st.maskImage = mk;
          st.webkitMaskImage = mk;
        }
      }
      setFull(isFull(lv), animate);
    };

    /** あふれ（100% を超えた）を出す・引っ込める。ソリはプレゼントの山、スノードームは金の雪の渦 */
    let swirlLoops: (Animation | null)[] = [];
    const setOverflow = (on: boolean, animate: boolean) => {
      if (on === curOver) return;
      curOver = on;
      if (sl) {
        const pile = pileRef.current;
        if (pile) pile.style.visibility = on ? "visible" : "hidden";
        if (on && animate) {
          // 袋の口からプレゼントが3つ、弧を描いて前へ転がり落ちる → 山がぽんと積み上がる
          const mo = bagMorph(sl, cur).mouth;
          const [px0, py0, pw0, ph0] = sl.pile.rect;
          const TUMBLE_MS = 620;
          tumbleRefs.current.forEach((el, i) => {
            if (!el) return;
            const to = { x: px0 + pw0 * (0.25 + 0.25 * i), y: py0 + ph0 * 0.55 };
            const pts = arcPoints({ x: mo.x + (i - 1) * 30, y: mo.y }, to, def.canvas[1] * 0.12, 9);
            el.style.visibility = "visible";
            const a = m.play(
              el,
              pts.map((q, j) => ({ transform: `${tr(X(q.x), Y(q.y))} rotate(${(j / (pts.length - 1)) * (i % 2 ? -300 : 320)}deg)` })),
              { duration: TUMBLE_MS, delay: i * 120, fill: "backwards", easing: "linear" }
            );
            const done = () => {
              el.style.visibility = "hidden";
            };
            if (a) a.finished.then(done, done);
            else done();
          });
          m.play(pile, [
            { opacity: 0, transform: "translateY(18%) scale(0.7, 0.5)" },
            { opacity: 1, transform: "translateY(-4%) scale(1.04, 1.1)", offset: 0.55 },
            { opacity: 1, transform: "translateY(0%) scale(1, 1)" },
          ], { duration: 560, delay: 380, fill: "backwards", easing: "ease-out" });
        }
      } else {
        const sw = swirlRef.current;
        if (sw) sw.style.visibility = on ? "visible" : "hidden";
        const aura = auraRef.current;
        if (aura) aura.style.visibility = on ? "visible" : "hidden";
        swirlLoops.forEach((a) => a?.cancel());
        swirlLoops = [];
        if (on) {
          swirlRefs.current.forEach((el, i) => {
            if (!el) return;
            const rnd = seededRandom(`swirl-${i}`);
            const dur = 3200 + rnd() * 2600;
            const dir = i % 3 === 0 ? -1 : 1;
            // 外の輪（回る）→ 内の点（輪の半径ぶん外にずらして、上下にゆっくり揺れる）
            swirlLoops.push(
              m.play(el, [{ transform: "rotate(0deg)" }, { transform: `rotate(${360 * dir}deg)` }], {
                duration: dur,
                iterations: Infinity,
                delay: -rnd() * dur,
              }),
              m.play(el.firstElementChild, [
                { opacity: 0.35, transform: "translateY(0px) scale(0.7)" },
                { opacity: 1, transform: `translateY(${-6 * S * (1 + rnd())}px) scale(1.15)` },
                { opacity: 0.35, transform: "translateY(0px) scale(0.7)" },
              ], { duration: 900 + rnd() * 900, iterations: Infinity, delay: -rnd() * 900, easing: "ease-in-out" })
            );
          });
          swirlLoops.push(
            m.play(aura, [{ opacity: 0.6 }, { opacity: 1 }, { opacity: 0.6 }], { duration: 2400, iterations: Infinity, easing: "ease-in-out" })
          );
          if (animate)
            m.play(sw, [{ opacity: 0, transform: "scale(0.6)" }, { opacity: 1, transform: "scale(1)" }], { duration: 700, easing: "ease-out" });
        }
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

    /* ---- ずっと続く小さな動き: 雪がちらつく（ソリは場面の上から、スノードームはドームの中で） ---- */
    {
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
    }

    /* ---- ピポの動き ---- */
    const hop = (n: number, lift: number = HOP.lift) =>
      anim(body, [
        { transform: "translateY(0px) scale(1, 1)" },
        { transform: "translateY(0px) scale(1.07, 0.9)", offset: 0.15 },
        { transform: `translateY(${-def.canvas[1] * lift * S}px) scale(0.96, 1.05)`, offset: 0.5 },
        { transform: "translateY(0px) scale(1.06, 0.92)", offset: 0.85 },
        { transform: "translateY(0px) scale(1, 1)" },
      ], { duration: 560, iterations: n, easing: "ease-in-out" });
    const act = async (a: XmasAct) => {
      if (a.pose === "sit") {
        show("sit");
        if (!a.look) return wait(a.ms);
        await wait(a.ms * 0.35);
        await anim(body, [{ transform: "rotate(0deg)" }, { transform: "rotate(-6deg)" }, { transform: "rotate(0deg)" }], { duration: a.ms * 0.3, easing: "ease-in-out" });
        return wait(a.ms * 0.35);
      }
      if (a.pose === "wave") {
        show("wave");
        await anim(body, [
          { transform: "rotate(0deg)" },
          { transform: "rotate(4deg)", offset: 0.25 },
          { transform: "rotate(-3deg)", offset: 0.5 },
          { transform: "rotate(3deg)", offset: 0.75 },
          { transform: "rotate(0deg)" },
        ], { duration: a.ms, easing: "ease-in-out" });
        show("sit");
        return;
      }
      show("cheer");
      await hop(a.hops);
      show("sit");
    };
    /** そのポーズを取る所へ跳び移る（あふれているときは、バンザイの前に山・台座の上へ、ほかは いつもの所へ） */
    const jumpTo = async (pose: XmasPose) => {
      const p = home(pose);
      if (Math.abs(p.x - A.x) < 0.5 && Math.abs(p.y - A.y) < 0.5) return;
      show("sit");
      await anim(body, [{ transform: "scale(1, 1)" }, { transform: "scale(1.06, 0.9)" }], { duration: 150, easing: "ease-in" });
      show("cheer");
      // 高い所へは高く、低い所へは低く跳ぶ（いちばん高い所が場面の上の端を越えない）
      const lift = Math.min(def.canvas[1] * 0.12, Math.max(0, Math.min(A.y, p.y) - xmasPipoSize(def, "cheer").h * 1.1));
      const pts = arcPoints({ x: A.x, y: A.y }, p, lift, 9);
      put(p.x, p.y);
      await anim(actor, pts.map((q) => ({ transform: tr(X(q.x), Y(q.y)) })), { duration: 560, easing: "linear" });
      await anim(body, [
        { transform: "scale(1.08, 0.9)" },
        { transform: "scale(0.97, 1.04)", offset: 0.55 },
        { transform: "scale(1, 1)" },
      ], { duration: 260, easing: "ease-out" });
    };

    /* ---- アラート明け: 金貨が飛び込む → （ドームはひと揺れして雪が舞う）→ 前の額から今の額まで ---- */
    const coins = async () => {
      setPhase("coins");
      const p0 = home("catch");
      put(p0.x, p0.y);
      show("catch");
      await anim(body, [
        { opacity: 0, transform: `translateY(${box.height * 0.03}px) scale(0.85)` },
        { opacity: 1, transform: "translateY(0px) scale(1)" },
      ], { duration: 220, easing: EASE.out });
      // 飛び込む先（場面の px）: ソリは袋の口、スノードームはドームのてっぺんの少し内側
      let goal: { x: number; y: number };
      if (sl) {
        const mo = bagMorph(sl, cur).mouth;
        goal = { x: X(mo.x), y: Y(mo.y) };
      } else {
        const g = gl!.globe;
        const [cx, cy, , ry] = g.dome;
        goal = { x: X(g.rect[0] + cx * g.rect[2]), y: Y(g.rect[1] + (cy - ry * 0.86) * g.rect[3]) };
      }
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
        // 入った瞬間: きらっ。ソリは袋がぽよん
        m.after(i * GAP + FLIGHT - 30, () => {
          if (sl)
            m.play(bagBoxRef.current, [
              { transform: "scale(1, 1)" },
              { transform: "scale(1.04, 0.95)", offset: 0.4 },
              { transform: "scale(1, 1)" },
            ], { duration: 200, easing: "ease-out" });
          const sk = sparkRef.current;
          if (sk) {
            sk.style.transform = tr(goal.x, goal.y);
            m.play(sk.firstElementChild, [
              { opacity: 0, transform: "scale(0.2) rotate(0deg)" },
              { opacity: 1, transform: "scale(1.15) rotate(45deg)", offset: 0.4 },
              { opacity: 0, transform: "scale(0.5) rotate(90deg)" },
            ], { duration: 320, easing: "ease-out" });
          }
        });
      }
      await wait((n - 1) * GAP + FLIGHT + 120);
      if (gl) {
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
      }
      // 入った！ → バンザイ。そのあいだに前の額から今の額まで上がる
      setPhase("rise");
      show("cheer");
      started = true;
      const { level: lv, amount: am, over: ov } = live.current;
      shown.level = lv;
      shown.amount = am;
      shown.over = ov;
      countUp(fromAmount, am, 1100);
      const rise = tween(lv, 1100, ov);
      await hop(2, 0.08);
      await rise;
      show("sit");
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

    const q = typeof window !== "undefined" && window.location ? new URLSearchParams(window.location.search) : null;
    const seed = q?.get("preview") ? q.get("pipoSeed") : null;
    const rand = seed != null ? seededRandom(`xmas-pipo-${seed}`) : Math.random;
    const loop = async () => {
      /** あふれたのを、まだピポが祝っていないか（あふれた直後の最初の動きは、必ず山・台座の上でバンザイ）。
          出直す前からあふれていたら、もう祝ってある */
      let cheered = curOver;
      // まず前の状態で場面を置く（段の ぽん は出さない）
      place(cur, false);
      setOverflow(curOver, false);
      const p = home("sit");
      put(p.x, p.y);
      show("sit");
      if (coinsIn) {
        if (amountRef.current) amountRef.current.textContent = fmt(fromAmount);
        await coins();
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
      let last: XmasAct | null = null;
      let streak = 0;
      for (;;) {
        if (!curOver) cheered = false;
        let a = nextXmasAct(rand, curOver, last, streak);
        if (curOver && !cheered) a = { pose: "cheer", ms: 0, look: false, hops: 3 };
        if (a.pose === "cheer") cheered = true;
        streak = last && last.pose === a.pose ? streak + 1 : 1;
        last = a;
        await jumpTo(a.pose);
        await act(a);
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
  const coinIm = imgs.get(def.coin)!;
  const coinW = P * 0.11;
  const tone = (t: TextTone, w: number): React.CSSProperties => ({ color: t.color, textShadow: outline(t.shadow, w) });

  /** ちらつく雪（`h` は雪が降る箱の高さ。そのうち上から `fall` の割合まで降りて消える） */
  const flake = Math.max(2, P * 0.012);
  const snow = (h: number, fall: number) =>
    Array.from({ length: SNOW }, (_, i) => {
      const r = seededRandom(`snowpos-${i}`);
      return (
        <div
          key={`s${i}`}
          ref={(el) => {
            snowRefs.current[i] = el;
          }}
          style={{ position: "absolute", left: `${8 + r() * 84}%`, top: 0, width: 1, height: (h * fall) / 3, opacity: 0, pointerEvents: "none" }}
        >
          <div
            style={{
              position: "absolute",
              left: -flake / 2,
              top: 0,
              width: flake,
              height: flake,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.95)",
              boxShadow: "0 0 1px rgba(60,80,140,0.6)",
            }}
          />
        </div>
      );
    });

  /* ---- 案ごとの層 ---- */
  let scene: React.ReactNode = null;
  if (def.kind === "sleigh") {
    const d = def;
    const [sx, sy, sw, sh] = d.sleigh.rect;
    const sleighBox = { x: X(sx), y: Y(sy), w: sw * S, h: sh * S };
    const front = d.sleigh.front.map(([fx, fy]) => `${(fx * 100).toFixed(2)}% ${(fy * 100).toFixed(2)}%`).join(", ");
    const full = bagMorph(d, 1).rect;
    // 光の縦は、ふくらんでも場面の上の端を越えない高さまで（豚の 1.6 倍の四角の外に光をにじませない）
    const glowH = Math.min(full.h * 1.7, (full.y + full.h / 2) * 2 * 0.96) * S;
    const [bx, by] = d.bag.base;
    const giftW = d.gifts.w * S;
    const bowW = d.bow.w * S;
    const bowIm = imgs.get(d.bow.file)!;
    const [px, py, pw, ph] = d.pile.rect;
    scene = (
      <>
        {/* 満タンの金のほのかな光（袋の後ろ） */}
        <div
          ref={glowRef}
          style={{
            position: "absolute",
            left: X(full.x + full.w / 2) - full.w * S * 0.85,
            top: Y(full.y + full.h / 2) - glowH / 2,
            width: full.w * S * 1.7,
            height: glowH,
            borderRadius: "50%",
            visibility: "hidden",
            pointerEvents: "none",
            background: "radial-gradient(closest-side, rgba(255,226,130,0.85), rgba(255,200,80,0.35) 55%, rgba(255,190,60,0) 100%)",
          }}
        />
        {/* ソリ（後ろ）。袋はこの上に載り、ソリの側面（下の front）が袋の下を隠す */}
        {img(d.sleigh.file, sleighBox.x, sleighBox.y, sleighBox.w, sleighBox.h)}
        {/* 袋（3枚を外形をそろえて継ぐ）。底の真ん中を軸に伸び縮み */}
        <div ref={bagBoxRef} style={{ ...abs, width: box.width, height: box.height, transformOrigin: `${X(bx)}px ${Y(by)}px` }}>
          {d.bag.files.map((f, i) => {
            const w = d.bag.w[i] * S;
            const h = (w * d.bag.sizes[i][1]) / d.bag.sizes[i][0];
            return (
              <div
                key={f}
                ref={(el) => {
                  bagRefs.current[i] = el;
                }}
                style={{ position: "absolute", left: X(bx) - w / 2, top: Y(by) - h, width: w, height: h, opacity: i === 0 ? 1 : 0, transformOrigin: "50% 100%" }}
              >
                {img(f, 0, 0, w, h)}
              </div>
            );
          })}
        </div>
        {/* 袋の口からのぞくプレゼント。口の線より下は切る（袋の中に入っているように見える） */}
        <div ref={giftClipRef} style={{ ...abs, width: box.width, height: 0, overflow: "hidden", pointerEvents: "none" }}>
          {d.gifts.spots.slice(0, 5).map(([, , rot], i) => {
            const f = d.gifts.files[i];
            const im = imgs.get(f)!;
            const h = (giftW * im.height) / im.width;
            return (
              <div
                key={i}
                ref={(el) => {
                  giftRefs.current[i] = el;
                }}
                style={{ ...abs, width: 0, height: 0, visibility: "hidden" }}
              >
                <div style={{ position: "absolute", left: -giftW / 2, top: -h, width: giftW, height: h, transformOrigin: "50% 100%" }}>
                  {img(f, 0, 0, giftW, h, { transform: `rotate(${rot}deg)`, transformOrigin: "50% 100%" })}
                </div>
              </div>
            );
          })}
        </div>
        {/* 首の金のリボン（満タン） */}
        <div ref={bowRef} style={{ ...abs, width: 0, height: 0, visibility: "hidden" }}>
          <div style={{ position: "absolute", left: -bowW / 2, top: -bowW * (bowIm.height / bowIm.width) * 0.5, width: bowW, height: (bowW * bowIm.height) / bowIm.width }}>
            {img(d.bow.file, 0, 0, bowW, (bowW * bowIm.height) / bowIm.width)}
          </div>
        </div>
        {/* ソリの側面（袋より手前） */}
        {img(d.sleigh.file, sleighBox.x, sleighBox.y, sleighBox.w, sleighBox.h, { clipPath: `polygon(${front})`, WebkitClipPath: `polygon(${front})` } as React.CSSProperties)}
        {/* ランタン（灯った絵を丸く切り抜いて重ねる。25% ごとに左から1つずつ） */}
        {d.sleigh.lanterns.map(([cx, cy, rx0, ry0], i) => {
          // 灯った絵を楕円で切り抜いて重ねる（消えた絵は、この楕円の外は灯った絵と同じ）。まわりに光のにじみ
          const rx = rx0 * sleighBox.w;
          const ry = ry0 * sleighBox.h;
          const lx = sleighBox.x + cx * sleighBox.w;
          const ly = sleighBox.y + cy * sleighBox.h;
          const g = rx * 2.2;
          return (
            <div
              key={i}
              ref={(el) => {
                lanternRefs.current[i] = el;
              }}
              style={{ ...abs, width: box.width, height: box.height, visibility: "hidden", pointerEvents: "none" }}
            >
              <div
                style={{
                  position: "absolute",
                  left: lx - g,
                  top: ly - g,
                  width: g * 2,
                  height: g * 2,
                  borderRadius: "50%",
                  background: "radial-gradient(closest-side, rgba(255,236,160,0.75), rgba(255,196,80,0.3) 45%, rgba(255,180,60,0) 100%)",
                }}
              />
              <div style={{ position: "absolute", left: lx - rx, top: ly - ry, width: rx * 2, height: ry * 2, borderRadius: "50%", overflow: "hidden" }}>
                {img(d.sleigh.lit, sleighBox.x - (lx - rx), sleighBox.y - (ly - ry), sleighBox.w, sleighBox.h)}
              </div>
            </div>
          );
        })}
        {/* あふれる瞬間に転がり落ちるプレゼント */}
        {Array.from({ length: TUMBLE }, (_, i) => {
          const f = d.gifts.files[(i * 2) % d.gifts.files.length];
          const im = imgs.get(f)!;
          const h = (giftW * im.height) / im.width;
          return (
            <div
              key={`t${i}`}
              ref={(el) => {
                tumbleRefs.current[i] = el;
              }}
              style={{ ...abs, width: 0, height: 0, visibility: "hidden", pointerEvents: "none" }}
            >
              {img(f, -giftW / 2, -h / 2, giftW, h)}
            </div>
          );
        })}
        {/* あふれたプレゼントの山（100% を超えたら） */}
        <div ref={pileRef} style={{ position: "absolute", left: X(px), top: Y(py), width: pw * S, height: ph * S, visibility: "hidden", transformOrigin: "50% 100%" }}>
          {img(d.pile.file, 0, 0, pw * S, ph * S)}
        </div>
        {/* ちらつく雪（場面の上から、ソリの縁のあたりまで） */}
        <div style={{ ...abs, width: box.width, height: box.height, pointerEvents: "none" }}>{snow(box.height, 0.66)}</div>
      </>
    );
  } else {
    const g = def.globe;
    const [gx, gy, gw, gh] = g.rect;
    const gb = { x: X(gx), y: Y(gy), w: gw * S, h: gh * S };
    const [dcx, dcy, drx, dry] = g.dome;
    const dome = { x: gb.x + (dcx - drx) * gb.w, y: gb.y + (dcy - dry) * gb.h, w: drx * 2 * gb.w, h: dry * 2 * gb.h };
    const [scx, scy, sr] = g.star;
    const star = { x: gb.x + scx * gb.w, y: gb.y + scy * gb.h, r: sr * gb.w };
    scene = (
      <>
      <div ref={domeRef} style={{ ...abs, width: box.width, height: box.height, transformOrigin: `${gb.x + gb.w / 2}px ${gb.y + gb.h}px` }}>
        {img(g.base, gb.x, gb.y, gb.w, gb.h)}
        <div ref={litRef} style={{ position: "absolute", left: gb.x, top: gb.y, width: gb.w, height: gb.h }}>
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
            background: "radial-gradient(closest-side, rgba(255,222,110,0.5), rgba(255,200,70,0.22) 65%, rgba(255,200,70,0) 100%)",
          }}
        />
        {/* ドームの中: ちらつく雪・アラート明けに舞う雪・あふれの金の雪（楕円で切る） */}
        <div style={{ position: "absolute", left: dome.x, top: dome.y, width: dome.w, height: dome.h, borderRadius: "50%", overflow: "hidden", pointerEvents: "none" }}>
          {snow(dome.h, 0.9)}
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
            <div style={{ position: "absolute", left: "50%", top: "52%", width: 0, height: 0, transform: `scale(1, ${(dome.h / dome.w).toFixed(3)})` }}>
              {Array.from({ length: SWIRL }, (_, i) => {
                const r = seededRandom(`swirlpos-${i}`);
                const rad = dome.w * (0.1 + r() * 0.32);
                const sz = flake * (2.6 + r() * 2.2);
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
        {/* ドームの横の小物（ピポの後ろ。ドームと一緒には揺れない） */}
        {def.deco.map((dc, i) => {
          const [dx, dy, dw, dh] = dc.rect;
          return <React.Fragment key={`d${i}`}>{img(dc.file, X(dx), Y(dy), dw * S, dh * S, { transform: `rotate(${dc.rot}deg)` })}</React.Fragment>;
        })}
      </>
    );
  }

  return (
    <div ref={hostRef} data-xmas-bank={parts.variant} data-xmas-phase="idle" style={{ position: "relative", width: box.width, height: box.height }}>
      {scene}
      {/* 字の帯 */}
      {img(def.band.file, band.x, band.y, band.w, band.h)}
      {/* 帯に走る光（スノードームの満タン。台座の帯が光る） */}
      {def.kind === "globe" ? (
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
      ) : null}
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
      {/* ピポ（いちばん手前。足もとが (0,0)） */}
      <div ref={actorRef} style={{ ...abs, width: 0, height: 0, visibility: "hidden" }}>
        <div ref={bodyRef} style={{ ...abs, width: 0, height: 0, transformOrigin: "0px 0px" }}>
          <div ref={breathRef} style={{ ...abs, width: 0, height: 0, transformOrigin: "0px 0px" }}>
            {XMAS_POSES.map((p) => {
              const sp = def.pipo.poses[p];
              const { w, h } = xmasPipoSize(def, p);
              return (
                <img
                  key={p}
                  ref={(el) => {
                    poseRefs.current[p] = el;
                  }}
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
                    visibility: "hidden",
                    pointerEvents: "none",
                    userSelect: "none",
                  }}
                />
              );
            })}
          </div>
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

