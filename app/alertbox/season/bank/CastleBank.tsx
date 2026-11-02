/**
 * 季節の貯金箱（11月、ルーマニアのブラン城。#1078 の D 案）。丘の上の小さな城と、小さな城主ピポ。
 *
 * - **溜まるほど下の階から窓に灯りがともる。** 0% の絵（窓が暗い）の上に、同じ構図の 100% の絵（全部の窓が光る）を
 *   重ね、**下から切り抜いて**見せる（境目は壁の下の端 → いちばん上の壁の上の端）
 * - 横の旗竿のルーマニアの旗も、溜まり具合だけ上がる（0% で竿の下、100% でてっぺん）
 * - 字は、城の足もとの細い刺繍のリボンに載せる。**目立たせるのは いまの額だけ**（目標と旅の名前は小さく控えめに）
 *
 * ## ピポ（2版目。あやと 2026-11-02「ピポもうちょっと大きくしないと見えない」「ピポの動きもっと加えたい（前回可愛かった）」）
 *
 * ハロウィンのクロ（`KuroBank.tsx`）と同じく、**決まった順ではなく、くじで次の動きを決める**（`castleBrain.ts`）。
 * 居場所は場面の下の両隅と門の前。両隅を歩いて行き来し、止まって座り、小芸（あくび・旗を振る・跳ねる・見回す）をし、
 * ときどき門から城に入って**屋根ごしに顔を出し**、門の脇の**岩山に跳び乗り**、隅で**丸くなって眠る**。
 * 空のときは座るとランタンを持ち、100% を超えたらバンザイで跳ねるのを混ぜる。
 *
 * 顔の大きさは場面の幅の 13.5%（`castle.json` の `pipo.face`）。どのポーズの絵も顔の幅で大きさをそろえてある
 * （ポーズを替えても顔が跳ねない）。どこへ動いても豚の 1.6 倍の四角から出ない（`castle.ts` の `pipoStage`）。
 *
 * ## アラート明けに、金貨が城に入る（あやと 2026-11-02「投げ銭アラート終わりに、貯金箱にお金が入るのがアニメーションで表したい」）
 *
 * 貯金箱はアラートのあいだ消えて、明けると出直す（`index.tsx` が出し直す）。**前に出ていたときより額が増えて出直したら**、
 * ピポが門の前で巾着袋を差し出し、アラートの面の真ん中（額の字が出ていた所）から金貨が 6 枚、くるくる回りながら弧を描いて
 * 袋に飛び込む → バンザイ → 窓の灯りが前の額から今の額まで上がる（数字も数え上げる）。約 2.3 秒。
 * 金貨が飛んでいるあいだだけは、豚の 1.6 倍の外を通る（アラートの面から城へ。`alert-banksize.mjs` は、試し表示の
 * 貯金箱だけ（アラート無し）を撮るので数えない）。初めて開いたときは、0 から今の額まで灯りが上がるだけ（金貨は出さない）。
 *
 * ## 大きさは豚と同じ物差し
 *
 * 場面の大きさは **Dimensions の幅（`useStableWindow`）だけ**から決める（`castle.ts` の `castleBox`。豚の 1.6 倍）。
 * `<html>` の幅（`useBoxSize`）で決めると、PRISM の % によって豚との比が変わる（`docs/island-misses.md` #311）。
 *
 * ## 重さ（`.claude/skills/alert-season/SKILL.md` 4「重さの決まり」）
 *
 * - 動かすのは transform と opacity だけ（Web Animations。合成のスレッドが回す）。JS が起きるのは次の動きを決めるときだけ
 * - rAF を回すのは、灯りが上がるあいだ（1.1〜1.5 秒）と数え上げのあいだだけ
 * - 絵は出す大きさの2〜3倍に縮めて置いてある（ピポは顔の幅 100px、金貨 64px）。金貨は 6 枚まで
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { SeasonTheme, TextTone } from "../../themes";
import { loadImage, type LoadedImage, type SeasonBank } from "../useSeason";
import { useStableWindow } from "../useBoxSize";
import { EASE, Motion, type Rand } from "../rig/motion";
import { seededRandom } from "../plan";
import { outline } from "../ThemedGauge";
import {
  BREATH,
  arcPoints,
  castleBox,
  castleFiles,
  castleLayout,
  fitPipoX,
  flagY,
  lightY,
  pipoSize,
  pipoStage,
  readCastleDef,
  PIPO_POSES,
  type CastleDef,
  type PipoPose,
} from "./castle";
import { initialBrain, nextAction, type PipoAction, type Spot, type Trick } from "./castleBrain";

type Props = {
  theme: SeasonTheme;
  bank: SeasonBank;
  currentAmount: number;
  targetAmount: number;
  label: string;
  /**
   * 出す前のアラートがあるか。投げ銭は額を足してからアラートを出すので、そのすきまに額の増えを受け取ると、
   * アラート明けに出直したとき「前の額」が残っておらず、金貨が入らない。あるあいだは額の増えを取っておく
   */
  alertPending: boolean;
  /** 城の部品が読めなかったときに出すもの（コマ送りの貯金箱） */
  fallback: React.ReactNode;
};

type Loaded = { def: CastleDef; imgs: Map<string, LoadedImage> };

/** 城の部品はページに1つずつ読む（アラートのたびに出直すので、毎回読み直さない） */
const cache = new Map<string, Promise<Loaded | null>>();

function loadCastle(dir: string): Promise<Loaded | null> {
  const hit = cache.get(dir);
  if (hit) return hit;
  const p = (async () => {
    try {
      const res = await fetch(`${dir}/castle.json`);
      if (!res.ok) return null;
      const def = readCastleDef(await res.json());
      if (!def) return null;
      const files = castleFiles(def);
      const imgs = await Promise.all(files.map((f) => loadImage(`${dir}/${f}`)));
      if (!imgs.every(Boolean)) return null;
      return { def, imgs: new Map(files.map((f, i) => [f, imgs[i]!])) };
    } catch {
      return null;
    }
  })();
  cache.set(dir, p);
  // 読めなかったものは控えない（次に出直したとき、もう一度試す）
  p.then((v) => {
    if (!v) cache.delete(dir);
  });
  return p;
}

/**
 * 試し表示（`?preview=`）のときだけ効く、ピポの動きの決め方。配信（`preview` 無し）では効かない。
 * - `pipoSeed=<数>`: くじの並びを決める（同じ数なら同じ動き。録画と見張りを撮り直せるように）
 * - `pipoAct=peek:0,climb:1,nap,flag,…`: 最初にこの順で動く（静止画で1つずつ確かめるため）。そのあとはくじ
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

/** 出直しをまたいで、前に見せていた額と溜まり具合を覚えておく（アラート明けに、前の額から上げるため） */
const shown = { amount: 0, level: 0, seen: false };

const fmt = (n: number) => `${Math.round(n).toLocaleString("ja-JP")}円`;

/** 豚と同じ字体（react-native-web の既定。スマホでは英数字が Roboto、日本語がゴシック） */
const FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';

/** 金貨の枚数。多いほど豪華だが、スマホで重くならないよう絞る（SKILL.md 4「重さの決まり」） */
const COINS = 6;

/** 動きが止められた（場面を組み直す・片づける）ことを伝える印 */
const STOP = Symbol("stop");

export const CastleBank: React.FC<Props> = (props) => {
  const [parts, setParts] = useState<Loaded | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    loadCastle(props.theme.dir).then((p) => {
      if (alive) setParts(p);
    });
    return () => {
      alive = false;
    };
  }, [props.theme.dir]);
  // 読んでいる途中は何も出さない（豚やコマ送りを一瞬出してから差し替えると、ちらつく）
  if (parts === undefined) return null;
  if (parts === null) return <>{props.fallback}</>;
  return <CastleScene {...props} parts={parts} />;
};

/** 地面に立つポーズの絵（前の層。城より手前・リボンより奥） */
const FRONT_POSES: PipoPose[] = PIPO_POSES.filter((p) => p !== "peek" && p !== "peekWave");

const CastleScene: React.FC<Props & { parts: Loaded }> = ({ theme, bank, currentAmount, targetAmount, label, alertPending, parts }) => {
  const { width: dimW } = useStableWindow();
  const box = castleBox(dimW);
  const { def, imgs } = parts;
  const base = bank.base[0];
  const lit = bank.fill[0];
  const ribbonIm = imgs.get(def.ribbon.file)!;
  const L = castleLayout(box, def, ribbonIm.width / ribbonIm.height);
  const stage = pipoStage(def, box, L);
  const { s, ox, oy } = L;
  // 読んだ絵の大きさが castle.json と違えば、比で合わせる（縮め直した絵を置いたとき）
  const k = base.width / def.size[0];

  const ratio = targetAmount > 0 ? currentAmount / targetAmount : 0;
  const level = Math.max(0, Math.min(1, ratio));
  const overflow = targetAmount > 0 && currentAmount >= targetAmount;
  /** 場面を組むときに読む、いまの溜まり具合と額（組み直さずに渡すため ref に持つ） */
  const live = useRef({ level, amount: currentAmount, overflow });
  const pending = useRef(alertPending);
  pending.current = alertPending;

  const hostRef = useRef<HTMLDivElement | null>(null);
  const litRef = useRef<HTMLDivElement | null>(null);
  const flagRef = useRef<HTMLDivElement | null>(null);
  const amountRef = useRef<HTMLSpanElement | null>(null);
  // ピポ（前の層）: 位置 → 左右 → 体（跳ねる・縮む）→ 息 → 絵
  const actorRef = useRef<HTMLDivElement | null>(null);
  const flipRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const breathRef = useRef<HTMLDivElement | null>(null);
  const poseRefs = useRef<Partial<Record<PipoPose, HTMLImageElement | null>>>({});
  // ピポ（後ろの層）: 屋根ごしに顔を出す。屋根の線より下は切って隠す
  const peekClipRef = useRef<HTMLDivElement | null>(null);
  const peekInRef = useRef<HTMLDivElement | null>(null);
  const peekFlipRef = useRef<HTMLDivElement | null>(null);
  const zzzRef = useRef<HTMLDivElement | null>(null);
  const coinRefs = useRef<(HTMLDivElement | null)[]>([]);
  const sparkRef = useRef<HTMLDivElement | null>(null);

  /** 場面の外から、溜まり具合と額を渡す口（場面を組み直さずに。試し表示の rise や、出ているあいだに額が変わったとき） */
  const api = useRef<{ setLevel: (lv: number, amount: number, over: boolean) => void } | null>(null);

  useEffect(() => {
    const m = new Motion();
    let raf = 0;
    let countRaf = 0;
    let dead = false;
    /** いま見せている溜まり具合 */
    let cur = shown.seen ? shown.level : 0;
    let started = false;
    const fromAmount = shown.seen ? shown.amount : 0;
    const { level: lv0, amount: am0 } = live.current;
    /** アラート明け（前に出ていたときより額が増えて出直した）。金貨を入れる */
    const coinsIn = shown.seen && am0 > shown.amount;
    const fresh = !shown.seen || shown.amount !== am0;
    shown.seen = true;
    const host = hostRef.current;
    const setPhase = (p: string) => host?.setAttribute("data-castle-phase", p);

    /** 灯りの境目を溜まり具合 `lv` に置く（切り抜きと旗） */
    const place = (lv: number) => {
      cur = lv;
      const y = lightY(def, lv) * s;
      const litEl = litRef.current;
      if (litEl) {
        const c = `inset(${Math.max(0, y)}px 0px 0px 0px)`;
        litEl.style.clipPath = c;
        (litEl.style as unknown as Record<string, string>).webkitClipPath = c;
      }
      const f = flagRef.current;
      if (f) f.style.transform = `translate(0px, ${(flagY(def, lv) - flagY(def, 0)) * s}px)`;
    };
    /** 溜まり具合を `to` まで動かす。**rAF はこのあいだだけ**回す */
    const tween = (to: number, ms: number) => {
      cancelAnimationFrame(raf);
      const a = cur;
      const t0 = performance.now();
      const step = (t: number) => {
        const q = Math.min(1, (t - t0) / ms);
        place(a + (to - a) * (1 - Math.pow(1 - q, 3)));
        if (q < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
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

    /* ---- ずっと続く小さな動き（小さな絵の transform だけ） ---- */
    // 旗がはためく（竿側の辺を軸に）
    m.play(flagRef.current?.firstElementChild, [
      { transform: "skewY(0deg) scaleX(1)" },
      { transform: "skewY(-5deg) scaleX(0.94)" },
      { transform: "skewY(2deg) scaleX(0.98)" },
      { transform: "skewY(0deg) scaleX(1)" },
    ], { duration: 1600, iterations: Infinity, easing: "ease-in-out" });
    // ピポの息（ゆっくり。足もとを軸に）
    m.play(breathRef.current, [
      { transform: "scale(1, 1)" },
      { transform: "scale(1.012, 0.986)" },
      { transform: "scale(1, 1)" },
    ], { duration: 2600, iterations: Infinity, easing: "ease-in-out" });

    /* ---- ピポを動かす道具 ---- */
    const actor = actorRef.current!;
    const flip = flipRef.current!;
    const body = bodyRef.current!;
    const A = { x: 0, y: 0 };
    const tr = (x: number, y: number) => `translate(${x}px, ${y}px)`;
    const put = (x: number, y: number) => {
      A.x = x;
      A.y = y;
      actor.style.transform = tr(x, y);
    };
    let dir: 1 | -1 = 1;
    const face = (d: 1 | -1) => {
      dir = d;
      flip.style.transform = `scaleX(${d})`;
    };
    const show = (p: PipoPose | "walk" | null, sway = 0, scale = BREATH) => {
      for (const name of FRONT_POSES) {
        const el = poseRefs.current[name];
        if (!el) continue;
        const on = p === "walk" ? name === "walk0" || name === "walk1" : name === p;
        el.style.visibility = on ? "visible" : "hidden";
      }
      actor.style.visibility = p ? "visible" : "hidden";
      // 隅は座ったピポが場面の端に来る所。旗を振る・バンザイのように幅の広いポーズや、これから傾ける（sway 度）・
      // 広げる（scale 倍）ポーズは、場面から出ないぶん内へ寄せる
      if (p) {
        const x = fitPipoX(def, box, p === "walk" ? "walk0" : p, A.x, dir, sway, scale);
        if (x !== A.x) put(x, A.y);
      }
    };
    /** 動きを1つ流して、終わるまで待つ。片づけられたら STOP で抜ける */
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
    const moveTo = (x: number, y: number, ms: number, easing = "linear") => {
      const from = tr(A.x, A.y);
      put(x, y);
      return anim(actor, [{ transform: from }, { transform: tr(x, y) }], { duration: ms, easing });
    };
    const arcTo = (x: number, y: number, ms: number, lift: number) => {
      const pts = arcPoints({ x: A.x, y: A.y }, { x, y }, lift);
      put(x, y);
      return anim(actor, pts.map((p) => ({ transform: tr(p.x, p.y) })), { duration: ms, easing: "linear" });
    };
    /** 着地・受け取りの「ぽよん」 */
    const squash = (ms = 260, amt = 1) =>
      anim(body, [
        { transform: `scale(${1 + 0.08 * amt}, ${1 - 0.1 * amt})` },
        { transform: `scale(${1 - 0.03 * amt}, ${1 + 0.04 * amt})`, offset: 0.55 },
        { transform: "scale(1, 1)" },
      ], { duration: ms, easing: "ease-out" });
    const sitPose = (): PipoPose => (live.current.amount <= 0 ? "wait" : "sit");
    /** 歩く速さ（場面の px / 秒） */
    const speed = box.width / 3;
    const STEP = 170;
    const walkSeg = async (x: number, y: number) => {
      const d = Math.hypot(x - A.x, y - A.y);
      if (d < 1) return;
      if (Math.abs(x - A.x) > 1) face(x > A.x ? 1 : -1);
      show("walk");
      const opt = { duration: STEP * 2, iterations: Infinity };
      const w0 = m.play(poseRefs.current.walk0, [{ opacity: 1 }, { opacity: 1, offset: 0.5 }, { opacity: 0, offset: 0.5 }, { opacity: 0 }], opt);
      const w1 = m.play(poseRefs.current.walk1, [{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1, offset: 0.5 }, { opacity: 1 }], opt);
      const bob = m.play(body, [
        { transform: "translateY(0px)" },
        { transform: `translateY(${-box.height * 0.014}px)` },
        { transform: "translateY(0px)" },
      ], { duration: STEP, iterations: Infinity, easing: "ease-in-out" });
      try {
        await moveTo(x, y, (d / speed) * 1000);
      } finally {
        w0?.cancel();
        w1?.cancel();
        bob?.cancel();
      }
    };
    /** 隅・門の足もと */
    const spotXY = (sp: Spot) =>
      sp === "gate" ? stage.gate : { x: sp === "left" ? stage.left : stage.right, y: stage.ground };
    /** リボンの後ろの道（門の前の高さ）。隅から隅へは、いったんこの道へ上がって渡る（リボンの陰に隠れない） */
    const laneY = stage.gate.y;
    const laneX = (side: "left" | "right") => (side === "left" ? stage.left + box.width * 0.1 : stage.right - box.width * 0.1);
    const walkTo = async (to: Spot) => {
      const p = spotXY(to);
      const onLane = Math.abs(A.y - laneY) < 2;
      if (to === "gate") {
        if (!onLane) await walkSeg(laneX(A.x < box.width / 2 ? "left" : "right"), laneY);
        await walkSeg(p.x, p.y);
      } else {
        if (!onLane) await walkSeg(laneX(A.x < box.width / 2 ? "left" : "right"), laneY);
        await walkSeg(laneX(to), laneY);
        // 歩く絵は座る絵より幅が広いので、場面から出ない所まで歩いて、座るときに隅へ収まる
        await walkSeg(fitPipoX(def, box, "walk0", p.x, p.x > A.x ? 1 : -1), p.y);
        put(p.x, p.y);
      }
      show(sitPose());
    };
    const faceCenter = () => face(A.x < box.width / 2 ? 1 : -1);

    /* ---- 動き1つずつ ---- */
    const sit = async (ms: number, look: boolean) => {
      faceCenter();
      show(sitPose());
      if (!look) return wait(ms);
      await wait(ms * 0.3);
      face(A.x < box.width / 2 ? -1 : 1);
      show(sitPose(), 5);
      await anim(body, [{ transform: "rotate(0deg)" }, { transform: "rotate(-5deg)" }, { transform: "rotate(0deg)" }], { duration: ms * 0.4, easing: "ease-in-out" });
      faceCenter();
      await wait(ms * 0.3);
    };
    const trick = async (t: Trick) => {
      faceCenter();
      if (t === "yawn") {
        show("yawn", 0, BREATH * 1.01);
        await anim(body, [
          { transform: "scale(1, 1)" },
          { transform: "scale(0.97, 1.05)", offset: 0.45 },
          { transform: "scale(1.01, 0.99)", offset: 0.8 },
          { transform: "scale(1, 1)" },
        ], { duration: 1500, easing: "ease-in-out" });
        show(sitPose());
        await wait(300);
      } else if (t === "flag") {
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
        show("cheer", 0, BREATH * 1.07);
        await anim(body, [
          { transform: "translateY(0px) scale(1, 1)" },
          { transform: "translateY(0px) scale(1.07, 0.9)", offset: 0.15 },
          { transform: `translateY(${-box.height * 0.09}px) scale(0.96, 1.05)`, offset: 0.5 },
          { transform: "translateY(0px) scale(1.06, 0.92)", offset: 0.85 },
          { transform: "translateY(0px) scale(1, 1)" },
        ], { duration: 560, iterations: 2, easing: "ease-in-out" });
        show(sitPose());
      } else {
        // 見回す: 座って、首をかしげて反対を向き、また戻る
        show(sitPose(), 6);
        await wait(250);
        face(A.x < box.width / 2 ? -1 : 1);
        show(sitPose(), 6);
        await anim(body, [{ transform: "rotate(0deg)" }, { transform: "rotate(6deg)" }, { transform: "rotate(0deg)" }], { duration: 700, easing: "ease-in-out" });
        faceCenter();
        await anim(body, [{ transform: "rotate(0deg)" }, { transform: "rotate(-6deg)" }, { transform: "rotate(0deg)" }], { duration: 700, easing: "ease-in-out" });
        show(sitPose());
      }
    };
    /** 門から入る（暗い門の中へ、小さくなって消える）・出てくる */
    const goIn = async () => {
      show("walk0");
      body.style.opacity = "0";
      await anim(body, [
        { opacity: 1, transform: "translateY(0px) scale(1)" },
        { opacity: 0, transform: `translateY(${-box.height * 0.03}px) scale(0.72)` },
      ], { duration: 420, easing: EASE.in });
      show(null);
      body.style.opacity = "1";
    };
    const comeOut = async () => {
      put(stage.gate.x, stage.gate.y);
      show("walk0");
      await anim(body, [
        { opacity: 0, transform: `translateY(${-box.height * 0.03}px) scale(0.72)` },
        { opacity: 1, transform: "translateY(0px) scale(1)" },
      ], { duration: 420, easing: EASE.out });
      show(sitPose());
    };
    const peekSize = pipoSize(def, box, "peek");
    const waveSize = pipoSize(def, box, "peekWave");
    const peekH = Math.max(peekSize.h, waveSize.h);
    const peekImg = (p: "peek" | "peekWave") => {
      const a = peekFlipRef.current?.children;
      if (!a) return;
      (a[0] as HTMLElement).style.visibility = p === "peek" ? "visible" : "hidden";
      (a[1] as HTMLElement).style.visibility = p === "peekWave" ? "visible" : "hidden";
    };
    const peek = async (i: number) => {
      if (Math.abs(A.x - stage.gate.x) > 1 || Math.abs(A.y - stage.gate.y) > 1) await walkTo("gate");
      await goIn();
      await wait(380);
      const P = stage.peeks[Math.max(0, Math.min(stage.peeks.length - 1, i))];
      const clip = peekClipRef.current!;
      const inner = peekInRef.current!;
      const pf = peekFlipRef.current!;
      const cw = Math.max(peekSize.w, waveSize.w) * 2;
      clip.style.left = `${P.x - cw / 2}px`;
      clip.style.width = `${cw}px`;
      clip.style.height = `${P.y}px`;
      inner.style.left = `${cw / 2}px`;
      inner.style.top = `${P.y}px`;
      peekImg("peek");
      pf.style.transform = "scaleX(1)";
      inner.style.transform = "translateY(0px)";
      clip.style.visibility = "visible";
      setPhase("peek");
      await anim(inner, [{ transform: `translateY(${peekH}px)` }, { transform: "translateY(-4%)", offset: 0.75 }, { transform: "translateY(0px)" }], { duration: 520, easing: "ease-out" });
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
      clip.style.visibility = "hidden";
      setPhase("idle");
      await wait(450);
      await comeOut();
    };
    const climb = async (i: number, to: Spot) => {
      const G = stage.ledges[Math.max(0, Math.min(stage.ledges.length - 1, i))];
      // 地面からでも門の前からでも跳べる
      face(G.x > A.x ? 1 : -1);
      show("sit", 0, BREATH * 1.06);
      await anim(body, [{ transform: "scale(1, 1)" }, { transform: "scale(1.06, 0.9)" }], { duration: 160, easing: "ease-in" });
      show("jump");
      await arcTo(G.x, G.y, 620, box.height * 0.16);
      show(sitPose());
      await squash();
      await wait(450);
      face(A.x < box.width / 2 ? -1 : 1);
      await wait(650);
      faceCenter();
      show("cheer");
      await anim(body, [
        { transform: "translateY(0px)" },
        { transform: `translateY(${-box.height * 0.05}px)`, offset: 0.5 },
        { transform: "translateY(0px)" },
      ], { duration: 420, iterations: 2, easing: "ease-in-out" });
      show(sitPose());
      await wait(500);
      const p = spotXY(to);
      const d: 1 | -1 = p.x > A.x ? 1 : -1;
      face(d);
      show("jump");
      // 跳ぶ絵は幅が広いので、場面から出ない所に下りて、座るときに隅へ収まる
      await arcTo(fitPipoX(def, box, "jump", p.x, d), p.y, 620, box.height * 0.1);
      put(p.x, p.y);
      show(sitPose(), 0, BREATH * 1.08);
      await squash();
    };
    const zzz = () => {
      const z = zzzRef.current;
      if (!z) return [];
      const sz = pipoSize(def, box, "sleep");
      const sp = def.pipo.poses.sleep;
      // 頭の上（眠りの絵は頭が左。左右を返していれば右）
      const hx = ((sp.face[0] + sp.face[2]) / 2 - sp.foot[0] * sp.size[0]) * sz.k;
      const dir = A.x < box.width / 2 ? 1 : -1;
      z.style.transform = tr(A.x + hx * dir, A.y - sz.h * 0.9);
      z.style.visibility = "visible";
      return [...z.children].map((c, n) =>
        m.play(c, [
          { opacity: 0, transform: "translate(0px, 0px) scale(0.6)" },
          { opacity: 1, transform: `translate(${box.width * 0.02}px, ${-box.height * 0.06}px) scale(0.9)`, offset: 0.3 },
          { opacity: 0, transform: `translate(${box.width * 0.05}px, ${-box.height * 0.16}px) scale(1.1)` },
        ], { duration: 2000, delay: n * 1000, iterations: Infinity, easing: "ease-out" })
      );
    };
    const nap = async (ms: number) => {
      faceCenter();
      show("yawn");
      await anim(body, [{ transform: "scale(1, 1)" }, { transform: "scale(0.97, 1.05)" }, { transform: "scale(1, 1)" }], { duration: 1200, easing: "ease-in-out" });
      show("sleep", 0, BREATH * 1.05 * 1.025);
      await squash(320, 0.6);
      const deep = m.play(body, [
        { transform: "scale(1, 1)" },
        { transform: "scale(1.025, 0.955)" },
        { transform: "scale(1, 1)" },
      ], { duration: 2400, iterations: Infinity, easing: "ease-in-out" });
      const zs = zzz();
      setPhase("nap");
      try {
        await wait(ms);
      } finally {
        deep?.cancel();
        zs.forEach((a) => a?.cancel());
        if (zzzRef.current) zzzRef.current.style.visibility = "hidden";
        setPhase("idle");
      }
      show("yawn");
      await anim(body, [{ transform: "scale(1, 1)" }, { transform: "scale(0.96, 1.06)" }, { transform: "scale(1, 1)" }], { duration: 1100, easing: "ease-in-out" });
      show(sitPose());
    };
    const dance = async (ms: number) => {
      faceCenter();
      show("cheer", 6);
      const n = Math.max(1, Math.round(ms / 600));
      await anim(body, [
        { transform: "translateY(0px) rotate(0deg)" },
        { transform: `translateY(${-box.height * 0.07}px) rotate(-6deg)`, offset: 0.5 },
        { transform: "translateY(0px) rotate(0deg)" },
      ], { duration: 600, iterations: n, easing: "ease-in-out" });
      show(sitPose());
    };

    /* ---- アラート明け: 金貨が袋に飛び込む → バンザイ → 灯りが上がる ---- */
    const coins = async () => {
      setPhase("coins");
      put(stage.gate.x, stage.gate.y);
      face(1);
      show("catch");
      await anim(body, [
        { opacity: 0, transform: `translateY(${box.height * 0.03}px) scale(0.85)` },
        { opacity: 1, transform: "translateY(0px) scale(1)" },
      ], { duration: 220, easing: EASE.out });
      const cs = pipoSize(def, box, "catch");
      const sp = def.pipo.poses.catch;
      const pouch = { x: A.x + (def.pipo.coinIn[0] - sp.foot[0]) * cs.w, y: A.y + (def.pipo.coinIn[1] - sp.foot[1]) * cs.h };
      // アラートの面の真ん中（額の字が出ていた所）。場面の左上からの px
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
        const pts = arcPoints(a, pouch, box.height * 0.28, 11);
        const turns = 1.5 + rnd();
        const frames = pts.map((p, j) => {
          const t = j / (pts.length - 1);
          const sz = 1 - 0.5 * t;
          // くるくる回る（横幅だけ縮める）。真横（幅 0）にはしない
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
        // 袋に入った瞬間: ピポがぽよん、袋の口がきらっ
        m.after(i * GAP + FLIGHT - 30, () => {
          m.play(body, [
            { transform: "scale(1, 1)" },
            { transform: "scale(1.04, 0.95)", offset: 0.4 },
            { transform: "scale(1, 1)" },
          ], { duration: 200, easing: "ease-out" });
          const sk = sparkRef.current;
          if (sk) {
            sk.style.transform = tr(pouch.x, pouch.y);
            m.play(sk.firstElementChild, [
              { opacity: 0, transform: "scale(0.2) rotate(0deg)" },
              { opacity: 1, transform: "scale(1.15) rotate(45deg)", offset: 0.4 },
              { opacity: 0, transform: "scale(0.5) rotate(90deg)" },
            ], { duration: 320, easing: "ease-out" });
          }
        });
      }
      await wait((n - 1) * GAP + FLIGHT + 120);
      // 入った！ → バンザイ。そのあいだに窓の灯りが前の額から今の額まで上がる
      setPhase("rise");
      show("cheer");
      started = true;
      const { level: lv, amount: am } = live.current;
      shown.level = lv;
      shown.amount = am;
      countUp(fromAmount, am, 1100);
      tween(lv, 1100);
      await anim(body, [
        { transform: "translateY(0px) scale(1, 1)" },
        { transform: "translateY(0px) scale(1.07, 0.9)", offset: 0.15 },
        { transform: `translateY(${-box.height * 0.08}px) scale(0.96, 1.05)`, offset: 0.5 },
        { transform: "translateY(0px) scale(1.06, 0.92)", offset: 0.85 },
        { transform: "translateY(0px) scale(1, 1)" },
      ], { duration: 550, iterations: 2, easing: "ease-in-out" });
      show(sitPose());
      setPhase("idle");
    };

    // 外から溜まり具合が変わったとき（場面は組み直さない）
    api.current = {
      setLevel(lv, amount, over) {
        live.current = { level: lv, amount, overflow: over };
        // アラートを出す前の増えは、アラート明けに金貨と一緒に見せる（ここでは「前の額」を書き換えない）
        if (!started || (pending.current && amount > shown.amount)) return;
        shown.level = lv;
        shown.amount = amount;
        if (amountRef.current) amountRef.current.textContent = fmt(amount);
        tween(lv, 420);
      },
    };

    const pv = previewPipo();
    const rand: Rand = pv.seed != null ? seededRandom(`pipo-${pv.seed}`) : Math.random;
    const loop = async () => {
      let startAt: Spot | undefined;
      if (coinsIn) {
        if (amountRef.current) amountRef.current.textContent = fmt(fromAmount);
        place(cur);
        await coins();
        startAt = "gate";
      } else if (fresh && cur !== lv0) {
        /* 初めて開いたとき: 0 から今の額まで灯りを上げる（金貨は出さない） */
        if (amountRef.current) amountRef.current.textContent = fmt(fromAmount);
        place(cur);
        await wait(300);
        started = true;
        countUp(fromAmount, am0, 1500);
        shown.level = lv0;
        shown.amount = am0;
        tween(lv0, 1500);
      } else {
        // 箱の大きさが変わって組み直したときは、続きから何事もなく
        started = true;
        if (amountRef.current) amountRef.current.textContent = fmt(am0);
        place(lv0);
        shown.level = lv0;
        shown.amount = am0;
      }
      const brain = initialBrain(rand, live.current.overflow, stage.peeks.length, stage.ledges.length, startAt);
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
        brain.overflow = live.current.overflow;
        const act = forced.shift() ?? nextAction(brain, rand);
        if (act.kind === "walk") await walkTo(act.to);
        else if (act.kind === "sit") await sit(act.ms, act.look);
        else if (act.kind === "trick") await trick(act.trick);
        else if (act.kind === "peek") await peek(act.spot);
        else if (act.kind === "climb") await climb(act.ledge, brain.at === "gate" ? "left" : brain.at);
        else if (act.kind === "nap") await nap(act.ms);
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
      api.current = null;
      cancelAnimationFrame(raf);
      cancelAnimationFrame(countRaf);
      m.dispose();
    };
    // 場面は大きさと絵で組む。額の変化は api 経由で渡す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box.width, box.height, parts]);

  useEffect(() => {
    live.current = { level, amount: currentAmount, overflow };
    api.current?.setLevel(level, currentAmount, overflow);
  }, [level, currentAmount, overflow]);

  /* 額の桁が増えても、1行目（いまの額と目標）がリボンの帯からはみ出さないように縮める。描いた字の幅で測る
     （字体が読み終わってから測り直す。canvas で字体を決め打ちして測ると、この箱とスマホで字の幅が違う） */
  const lineRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const el = lineRef.current;
    if (!el) return;
    const fit = () => {
      const w = el.offsetWidth;
      const max = L.text.w * 0.98;
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
  }, [currentAmount, targetAmount, L.text.w]);

  const img = (im: LoadedImage, x: number, y: number, w: number, h: number, extra?: React.CSSProperties) => (
    <img
      src={im.url}
      alt=""
      draggable={false}
      style={{ position: "absolute", left: x, top: y, width: w, height: h, pointerEvents: "none", userSelect: "none", ...extra }}
    />
  );
  /** ピポの絵1枚（足もとが (0,0)） */
  const pose = (p: PipoPose, ref?: (el: HTMLImageElement | null) => void) => {
    const sp = def.pipo.poses[p];
    const { w, h } = pipoSize(def, box, p);
    const im = imgs.get(sp.file)!;
    return (
      <img
        key={p}
        ref={ref}
        src={im.url}
        alt=""
        draggable={false}
        style={{
          position: "absolute",
          left: -w * sp.foot[0],
          top: -h * sp.foot[1],
          width: w,
          height: h,
          visibility: "hidden",
          pointerEvents: "none",
          userSelect: "none",
        }}
      />
    );
  };
  const flagIm = imgs.get(def.flag.file)!;
  const fh = def.flag.h * s;
  const fw = (flagIm.width / flagIm.height) * fh;
  const coinIm = imgs.get(def.coin.file)!;
  const coinW = box.width * 0.1;

  const tone = (t: TextTone, w: number): React.CSSProperties => ({ color: t.color, textShadow: outline(t.shadow, w) });
  const P = box.width;
  const fAmount = L.font.amount;
  const fTarget = L.font.target;
  const abs: React.CSSProperties = { position: "absolute", left: 0, top: 0 };

  return (
    <div ref={hostRef} data-castle-phase="idle" style={{ position: "relative", width: box.width, height: box.height }}>
      {/* 後ろの層: 屋根ごしに顔を出すピポ。屋根の線より下は切る（城の絵が手前に来るので、屋根の上だけ見える） */}
      <div ref={peekClipRef} style={{ position: "absolute", top: 0, overflow: "hidden", visibility: "hidden", pointerEvents: "none" }}>
        <div ref={peekInRef} style={{ position: "absolute", width: 0, height: 0 }}>
          {/* 首をかしげる・反対を向くのは、下の辺の真ん中（顔の真ん中の下）を軸に */}
          <div ref={peekFlipRef} style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0, transformOrigin: "0px 0px" }}>
            {(["peek", "peekWave"] as const).map((p) => {
              const sp = def.pipo.poses[p];
              const { w, h } = pipoSize(def, box, p);
              return (
                <img
                  key={p}
                  src={imgs.get(sp.file)!.url}
                  alt=""
                  draggable={false}
                  style={{ position: "absolute", left: -w * sp.foot[0], top: -h * sp.foot[1], width: w, height: h, pointerEvents: "none" }}
                />
              );
            })}
          </div>
        </div>
      </div>
      {/* 城（0% の絵）と、下から灯る 100% の絵 */}
      {img(base, ox, oy, (base.width / k) * s, (base.height / k) * s)}
      <div ref={litRef} style={{ position: "absolute", left: ox, top: oy, width: (lit.width / k) * s, height: (lit.height / k) * s }}>
        {img(lit, 0, 0, (lit.width / k) * s, (lit.height / k) * s)}
      </div>
      {/* 旗（竿側の辺を軸にはためく）。上下は溜まり具合で */}
      <div ref={flagRef} style={{ position: "absolute", left: ox + def.pole.x * s, top: oy + flagY(def, 0) * s, width: fw, height: fh }}>
        <div style={{ position: "absolute", inset: 0, transformOrigin: "0% 50%" }}>{img(flagIm, 0, 0, fw, fh)}</div>
      </div>
      {/* 前の層: ピポ（城より手前、リボンより奥） */}
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
      {/* 眠っているときの z（小さな字 2 つ。上へ浮かんで消える） */}
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

      {/* 字の台（リボン） */}
      {img(ribbonIm, L.plate.x, L.plate.y, L.plate.w, L.plate.h)}
      {/* 字。いまの額（大）と目標（小）を1行に、その下に旅の名前（小）。目立たせるのは いまの額だけ */}
      <div
        style={{
          position: "absolute",
          left: L.text.x,
          top: L.text.y,
          width: L.text.w,
          height: L.text.h,
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
          {/* data-ink は字の濃さを測る道具の目印（tools/sprites/alert-bankink.mjs）。名前で いまの額 / 控えめな字 を分ける */}
          <span ref={amountRef} data-ink="fill" data-ink-role="amount" style={{ fontSize: fAmount, ...tone(theme.text.center, Math.max(1.4, P * 0.0065)) }}>
            {fmt(currentAmount)}
          </span>
          <span data-ink="fill" data-ink-role="target" style={{ fontSize: fTarget, fontWeight: 700, ...quiet(theme.text.top) }}>
            {` / ${fmt(targetAmount)}`}
          </span>
        </div>
        <div data-ink="fill" data-ink-role="label" style={{ fontSize: L.font.label, fontWeight: 700, ...quiet(theme.text.bottom) }}>
          {label}
        </div>
      </div>

      {/* 金貨（アラート明けだけ）と、袋の口のきらっ */}
      {Array.from({ length: COINS }, (_, i) => (
        <div
          key={i}
          ref={(el) => {
            coinRefs.current[i] = el;
          }}
          style={{ ...abs, width: 0, height: 0, visibility: "hidden", pointerEvents: "none" }}
        >
          {img(coinIm, -coinW / 2, -coinW / 2, coinW, (coinIm.height / coinIm.width) * coinW)}
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

/**
 * 控えめな字（目標・旅の名前）。あやと「今の金額以外の文字は、よく見たら見えるくらいで良い」。
 * 縁取りを付けず、リボンの地に近い色で、少し透かす（いまの額は太い縁取りと灯りの黄色で目立たせる）
 */
function quiet(t: TextTone): React.CSSProperties {
  return { color: t.color, opacity: 0.62, textShadow: `0 1px 1px ${t.shadow}` };
}
