/**
 * 季節の貯金箱（切り絵版）。かぼちゃのお菓子バケツのまわりを、黒猫のクロが走り回る。
 *
 * - **大きさは全部、ウィジェットの幅に比例する**（PRISM は貯金箱のウィジェットを幅 248 前後の
 *   css px で描いて 1.25 倍に拡げている。配信によって箱の大きさが違う）。場面は幅を 1000 と
 *   した単位で組み、最後に幅へ掛ける
 * - 溜まり具合は、空のバケツの絵の上に満タンの絵を重ね、波の形で下から切り抜く
 *   （豚と同じ `wave.ts`）。**波を動かすのは溜まるあいだだけ**で、溜まり終わったら止める。
 *   何時間も出ているので、待機中に rAF を回さない
 * - 100% を超えたら、お菓子があふれた山を出し、クロがその上で踊る
 * - 字は上から 目標（小）・いまの額（大）・ラベル（小）。いまの額はバケツの胴に置く。
 *   クロがバケツに乗っても、額と重ならない高さ
 * - 貯金箱はアラートのあいだ消えて、明けると出直す。出直すたびに、クロがバケツに飛び乗って
 *   喜び、そのあいだに中身が前の額から今の額まで上がる（数字も数え上げる）
 */
import React, { useEffect, useRef } from "react";
import { useWindowDimensions } from "react-native";
import type { SeasonTheme, TextTone } from "../../themes";
import { makeWaveClipPath } from "../../components/PiggyGauge/wave";
import { buildRig, type LoadedRig } from "../rig/RigView";
import { Motion, range } from "../rig/motion";
import { restOrigin, type RigDef } from "../rig/rig";
import { Kuro, type KuroGeo, type KuroFrame } from "./kuro";
import { initialBrain, nextAction } from "./kuroBrain";
import { outline } from "../ThemedGauge";
import { loadedElement } from "../useSeason";

type Props = {
  theme: SeasonTheme;
  mascot: LoadedRig;
  bucket: LoadedRig;
  visitor: LoadedRig | null;
  currentAmount: number;
  targetAmount: number;
  label: string;
};

/** 場面の縦横比。本物のウィジェット（248×145 前後）に合わせる */
export const SCENE_RATIO = 0.585;

/**
 * 場面の単位（幅 1000、高さ 585）での置き場所。
 *
 * 下の 2 割は字の帯（いまの額・目標）で、クロはそこへ降りない。上の 8 割が舞台。
 * 額をバケツの胴に載せると、幅 248px の箱では字がバケツとクロを覆ってしまい、
 * クロが字の陰に隠れるか、字がクロに隠れるかのどちらかになった（録画で確かめた）
 */
const GROUND_Y = 470;
const BUCKET_W = 330;
const KURO_H = 240;

/**
 * 出直しをまたいで、前に見せていた額と溜まり具合を覚えておく
 * （アラート明けに、前の額から数え上げるため）。ページに1つ
 */
const shown = { amount: 0, level: 0 };

const fmt = (n: number) => `${Math.round(n).toLocaleString("ja-JP")}円`;

/** 絵の中で、色の付いている四角（絵の px）。一度測ったら覚える */
const boxCache = new Map<string, { x: number; y: number; w: number; h: number }>();
function alphaBox(url: string, fallback: { width: number; height: number }): { x: number; y: number; w: number; h: number } {
  const hit = boxCache.get(url);
  if (hit) return hit;
  const el = loadedElement(url);
  const w = el?.naturalWidth || fallback.width;
  const h = el?.naturalHeight || fallback.height;
  let out = { x: 0, y: 0, w, h };
  try {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (ctx && el) {
      ctx.drawImage(el, 0, 0);
      const d = ctx.getImageData(0, 0, w, h).data;
      let x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let y = 0; y < h; y += 2) {
        for (let x = 0; x < w; x += 2) {
          if (d[(y * w + x) * 4 + 3] > 40) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      if (x1 >= x0 && y1 >= y0) out = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    }
  } catch {
    // 測れなければ絵の全体
  }
  boxCache.set(url, out);
  return out;
}

/** クロの足もと・背丈を、部品の絵の外形から決める */
function kuroFrame(rig: LoadedRig): KuroFrame {
  const def = rig.def;
  let top = Infinity;
  let bottom = -Infinity;
  let backX = Infinity;
  for (const p of def.parts) {
    const o = restOrigin(def, p.id)!;
    const im = rig.images.get(p.file ?? Object.values(p.swaps ?? {})[0]);
    if (!im) continue;
    top = Math.min(top, o[1]);
    if (/^leg/.test(p.id)) {
      bottom = Math.max(bottom, o[1] + im.height);
      if (/_b_/.test(p.id)) backX = Math.min(backX, o[0] + im.width / 2);
    }
  }
  const body = def.parts.find((p) => p.id === "body");
  const bo = body ? restOrigin(def, "body")! : [def.size[0] / 2, def.size[1]];
  const feetX = body ? bo[0] + body.pivot[0] : def.size[0] / 2;
  if (!Number.isFinite(bottom)) bottom = def.size[1];
  if (!Number.isFinite(top)) top = 0;
  return { feetX, feetY: bottom, height: bottom - top, backFeetX: Number.isFinite(backX) ? backX : feetX - 60 };
}

const partOf = (def: RigDef, id: string) => def.parts.find((p) => p.id === id) ?? null;

export const KuroBank: React.FC<Props> = ({
  theme,
  mascot,
  bucket,
  visitor,
  currentAmount,
  targetAmount,
  label,
}) => {
  const { width: W } = useWindowDimensions();
  const sceneW = Math.max(1, Math.round(W));
  const sceneH = Math.round(sceneW * SCENE_RATIO);
  const U = sceneW / 1000;

  const hostRef = useRef<HTMLDivElement | null>(null);
  const amountRef = useRef<HTMLSpanElement | null>(null);
  const labelRef = useRef<HTMLDivElement | null>(null);
  /* 字の大きさ。**幅に比例**（PRISM の箱の大きさは配信ごとに違う）。
     幅 248 で いまの額 27px・目標 14px・ラベル 13px。本物の配信では 1.25 倍に拡げて出る */
  const fsAmount = sceneW * 0.11;
  const fsTarget = sceneW * 0.058;
  const fsLabel = sceneW * 0.052;
  const ratio = targetAmount > 0 ? currentAmount / targetAmount : 0;
  const level = Math.max(0, Math.min(1, ratio));
  const overflow = ratio >= 1;

  /** 場面の外から、いまの溜まり具合を渡す口（場面を組み直さずに） */
  const live = useRef({ level, overflow, amount: currentAmount });
  const api = useRef<{ setLevel: (p: number, overflow: boolean, amount: number) => void } | null>(null);

  useEffect(() => {
    live.current = { level, overflow, amount: currentAmount };
    api.current?.setLevel(level, overflow, currentAmount);
  }, [level, overflow, currentAmount]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const m = new Motion();
    const r = Math.random;
    host.innerHTML = "";
    let started = false;
    let alive = true;

    // ---- バケツ ----------------------------------------------------------
    /* 絵の担当の形: 根の部品 `bucket` が {empty, full, over} の差し替えを持つ（胴は3枚とも
       画素一致で、中身と顔の灯りだけ違う）。取っ手 `handle` は胴の奥。
       目印 `rimBack`（奥の縁の上の辺）・`rimFront`（口の手前の辺）・`label`（字を置ける四角） */
    const bdef = bucket.def;
    const bp = partOf(bdef, "bucket");
    const swaps = bp?.swaps ?? {};
    const swapImg = (name: string) => (swaps[name] ? bucket.images.get(swaps[name]) ?? null : null);
    const eImg = swapImg("empty") ?? (bp?.file ? bucket.images.get(bp.file) ?? null : null);
    const fImg = swapImg("full");
    if (!bp || !eImg || !fImg) return;
    const oImg = swapImg("over");
    const handleP = partOf(bdef, "handle");
    const hImg = handleP?.file ? bucket.images.get(handleP.file) ?? null : null;
    const eBox = alphaBox(eImg.url, eImg);
    const bO = restOrigin(bdef, "bucket")!;
    // 空のバケツの「色の付いた幅」を BUCKET_W に合わせる
    const sB = (BUCKET_W * U) / eBox.w;
    // 台紙の (0,0) を場面のどこに置くか（px）
    const bx = 500 * U - (bO[0] + eBox.x + eBox.w / 2) * sB;
    const by = GROUND_Y * U - (bO[1] + eBox.y + eBox.h) * sB;
    const [BW, BH] = bdef.size;
    /** 台紙の高さ → 場面の単位 */
    const toU = (y: number) => (by + y * sB) / U;
    const anc = bdef.anchors;
    const rimBackY = anc.rimBack?.[1] ?? bO[1] + eBox.y;
    const rimFrontY = anc.rimFront?.[1] ?? bO[1] + eBox.y + eBox.h * 0.22;

    const layer = (z: number) => {
      const d = document.createElement("div");
      Object.assign(d.style, { position: "absolute", left: "0px", top: "0px", width: "100%", height: "100%", zIndex: String(z), pointerEvents: "none" });
      host.appendChild(d);
      return d;
    };
    /* 重なり（奥から）: バケツ → [バケツの中のクロ] → バケツの口の手前 → 土ぼこり →
       [地面のクロ] → こうもり。クロはバケツに入るとき（跳んだ頂点）だけ奥の段へ回る。
       口の手前の段は、同じバケツを「口の手前の辺より下」だけ切り出したもの。
       これがあるので、クロは口の中に立って見える（体の下が縁に隠れる） */
    const backBox = layer(2);
    const kuroBox = layer(6);
    const frontBox = layer(4);
    const puffBox = layer(5);
    const batBox = layer(7);

    const imgEl = (url: string, x: number, y: number, w: number, h: number) => {
      const el = document.createElement("img");
      el.src = url;
      el.alt = "";
      el.draggable = false;
      Object.assign(el.style, {
        position: "absolute",
        left: `${x}px`,
        top: `${y}px`,
        width: `${w}px`,
        height: `${h}px`,
        pointerEvents: "none",
        userSelect: "none",
      });
      return el;
    };
    /** バケツ1組（取っ手・空・中身・あふれ）。`cutAbove` を渡すと、その高さより上を切る */
    const stack = (into: HTMLElement, cutAbove: number | null) => {
      const st = document.createElement("div");
      Object.assign(st.style, {
        position: "absolute",
        left: `${bx}px`,
        top: `${by}px`,
        width: `${BW}px`,
        height: `${BH}px`,
        transformOrigin: "0 0",
        transform: `scale(${sB})`,
        overflow: "visible",
      });
      if (cutAbove != null) {
        // 絵は台紙からはみ出すので、四角は台紙より広く取る（inset の負の値は効かない環境がある）
        const c = `polygon(-1000px ${cutAbove}px, 2000px ${cutAbove}px, 2000px 2000px, -1000px 2000px)`;
        st.style.clipPath = c;
        (st.style as unknown as Record<string, string>).webkitClipPath = c;
      }
      into.appendChild(st);
      let handle: HTMLImageElement | null = null;
      if (handleP && hImg && cutAbove == null) {
        const ho = restOrigin(bdef, "handle")!;
        handle = imgEl(hImg.url, ho[0], ho[1], hImg.width, hImg.height);
        handle.style.transformOrigin = `${handleP.pivot[0]}px ${handleP.pivot[1]}px`;
        st.appendChild(handle);
      }
      st.appendChild(imgEl(eImg.url, bO[0], bO[1], eImg.width, eImg.height));
      const fill = document.createElement("div");
      Object.assign(fill.style, { position: "absolute", left: "0px", top: "0px", width: `${BW}px`, height: `${BH}px`, overflow: "visible" });
      fill.appendChild(imgEl(fImg.url, bO[0], bO[1], fImg.width, fImg.height));
      st.appendChild(fill);
      let over: HTMLImageElement | null = null;
      if (oImg) {
        over = imgEl(oImg.url, bO[0], bO[1], oImg.width, oImg.height);
        over.style.visibility = "hidden";
        st.appendChild(over);
      }
      return { fill, over, handle };
    };
    const back = stack(backBox, null);
    const front = stack(frontBox, rimFrontY);

    /* 溜まりの 0% と 100%。0% は顔の灯りのすぐ下（`label` の上の辺）、100% は満タンの絵の
       お菓子の山の天辺。胴は空と満タンで画素一致なので、そこを切り抜いても何も変わらない。
       見えるところ（顔が灯り、口にお菓子が増える）だけに割り当てる */
    const fBox = alphaBox(fImg.url, fImg);
    const fillTop = bO[1] + fBox.y;
    const fillBottom = anc.label?.[1] ?? bO[1] + eBox.y + eBox.h * 0.75;
    let lvl = shown.level;
    let phase = 0;
    const clip = () => {
      // 波の高さ（`wave.ts` の AMP=8px）は台紙の px なので、絵の縮尺に合わせて小さくなる
      const d = makeWaveClipPath(BW, BH, lvl, phase, fillTop - 9, fillBottom);
      for (const f of [back.fill, front.fill]) {
        f.style.clipPath = `path("${d}")`;
        (f.style as unknown as Record<string, string>).webkitClipPath = `path("${d}")`;
      }
    };
    clip();
    /* 溜まる。**rAF はこのあいだだけ**回す（終われば止める） */
    let raf = 0;
    const tween = (to: number, ms: number) => {
      cancelAnimationFrame(raf);
      const from = lvl;
      const t0 = performance.now();
      const step = (t: number) => {
        const k = Math.min(1, (t - t0) / ms);
        const e = 1 - Math.pow(1 - k, 3);
        lvl = from + (to - from) * e;
        phase += 0.05;
        clip();
        if (k < 1) raf = requestAnimationFrame(step);
        else shown.level = to;
      };
      raf = requestAnimationFrame(step);
    };

    // 100% を超えたら、あふれた山（over）に差し替える
    const oBox = oImg ? alphaBox(oImg.url, oImg) : null;
    const pileTopY = oBox ? toU(bO[1] + oBox.y) : null;
    const pileOrigin = oBox ? `${bO[0] + oBox.x + oBox.w / 2}px ${bO[1] + oBox.y + oBox.h * 0.55}px` : "50% 50%";
    const showPile = (on: boolean) => {
      for (const o of [back.over, front.over]) {
        if (!o) continue;
        const was = o.style.visibility === "visible";
        o.style.visibility = on ? "visible" : "hidden";
        o.style.transformOrigin = pileOrigin;
        if (on && !was)
          m.play(o, [
            { transform: "scale(0.7, 0.5)", opacity: 0, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
            { transform: "scale(1.04, 1.1)", opacity: 1, offset: 0.6 },
            { transform: "scale(1, 1)", opacity: 1 },
          ], { duration: 520 });
      }
    };
    if (live.current.overflow && shown.level >= 1) showPile(true);

    /** 取っ手が揺れる（クロが乗り降りしたとき）。倒すのは scaleY（絵の担当の指定） */
    const bump = (k: number) =>
      m.play(back.handle, [
        { transform: "scaleY(1)", easing: "ease-out" },
        { transform: `scaleY(${1 - 0.22 * k})`, offset: 0.25, easing: "ease-in-out" },
        { transform: `scaleY(${1 + 0.08 * k})`, offset: 0.55, easing: "ease-in-out" },
        { transform: `scaleY(${1 - 0.04 * k})`, offset: 0.8 },
        { transform: "scaleY(1)" },
      ], { duration: 520 });

    // ---- 場面の寸法（クロに渡す） --------------------------------------
    const bLeft = (bx + (bO[0] + eBox.x) * sB) / U;
    const bRight = bLeft + BUCKET_W;
    const frame = kuroFrame(mascot);
    const sK = (KURO_H * U) / frame.height;
    const geo: KuroGeo = {
      U,
      groundY: GROUND_Y,
      minX: 95,
      maxX: 905,
      bucket: {
        left: bLeft,
        right: bRight,
        cx: (bLeft + bRight) / 2,
        topY: toU(rimBackY),
        // 口の手前の辺より少し下に足を置く（体の下が縁に隠れる）。帽子の先が場面の上で切れない高さまで
        inY: Math.max(KURO_H + 6, toU(rimFrontY) + KURO_H * 0.06),
      },
      pileY: null,
      kuroH: KURO_H,
    };
    const pileFeet = pileTopY != null ? Math.max(KURO_H + 4, pileTopY + KURO_H * 0.14) : null;
    if (live.current.overflow) geo.pileY = pileFeet;
    // ラベルはバケツの胴の、字を置ける四角（`label`）の真ん中に
    const labelMidY = anc.label ? toU((anc.label[1] + anc.label[3]) / 2) : toU(rimFrontY) + (GROUND_Y - toU(rimFrontY)) * 0.62;

    // ---- 土ぼこり -------------------------------------------------------
    const puff = (x: number, y: number, dir: number, n: number) => {
      for (let i = 0; i < n; i++) {
        const d = document.createElement("div");
        const s = (14 + r() * 10) * U;
        Object.assign(d.style, {
          position: "absolute",
          left: `${x * U - s / 2}px`,
          top: `${y * U - s * 0.8}px`,
          width: `${s}px`,
          height: `${s}px`,
          borderRadius: "50%",
          background: "rgba(255,248,236,0.75)",
          pointerEvents: "none",
        });
        puffBox.appendChild(d);
        const dx = (dir === 0 ? (i - (n - 1) / 2) * 1.6 : dir * (0.8 + i * 0.5)) * 22 * U;
        const a = m.play(d, [
          { transform: "translate(0px, 0px) scale(0.4)", opacity: 0.85 },
          { transform: `translate(${dx}px, ${-10 * U - r() * 8 * U}px) scale(1.25)`, opacity: 0 },
        ], { duration: 380 + i * 60, easing: "cubic-bezier(0.2, 0.7, 0.4, 1)" });
        const rm = () => d.remove();
        if (a) a.finished.then(rm, rm);
        else rm();
      }
    };

    // ---- クロ -------------------------------------------------------------
    const kRig = buildRig(mascot, sK);
    const setFront = (front: boolean) => {
      kuroBox.style.zIndex = front ? "6" : "3";
    };
    const candyFile = bdef.items.wrapped ?? Object.values(bdef.items)[0];
    const candy = candyFile ? bucket.images.get(candyFile) ?? null : null;
    const kuro = new Kuro(m, kRig, kuroBox, geo, frame, r, setFront, puff, candy);
    kuro.onBucket = (k) => bump(k === "in" ? 1 : 0.6);
    kuro.startLoops();

    // ---- 横切るこうもり ---------------------------------------------------
    const flyBy = (fromLeft: boolean, ms: number) => {
      if (!visitor) return;
      const vf = visitor.def.size;
      const bat = buildRig(visitor, (KURO_H * 0.62 * U) / vf[0]);
      const wrap = document.createElement("div");
      Object.assign(wrap.style, { position: "absolute", left: "0px", top: "0px", willChange: "transform" });
      wrap.appendChild(bat.root);
      batBox.appendChild(wrap);
      const bw = vf[0] * bat.scale;
      const x0 = fromLeft ? -bw : sceneW + 4;
      const x1 = fromLeft ? sceneW + 4 : -bw;
      const y = sceneH * 0.18;
      const frames: Keyframe[] = [];
      for (let i = 0; i <= 10; i++) {
        const k = i / 10;
        frames.push({
          transform: `translate(${x0 + (x1 - x0) * k}px, ${y + Math.sin(k * Math.PI * 3) * sceneH * 0.08 - k * sceneH * 0.1}px)`,
        });
      }
      const a = m.play(wrap, frames, { duration: ms, easing: "linear" });
      m.play(bat.part("wing_l"), [{ transform: "rotate(-34deg)" }, { transform: "rotate(30deg)" }], {
        duration: 110, iterations: Infinity, direction: "alternate", easing: "ease-in-out",
      });
      m.play(bat.part("wing_r"), [{ transform: "rotate(34deg)" }, { transform: "rotate(-30deg)" }], {
        duration: 110, iterations: Infinity, direction: "alternate", easing: "ease-in-out",
      });
      const rm = () => wrap.remove();
      if (a) a.finished.then(rm, rm);
      else rm();
    };

    // ---- 数え上げ ---------------------------------------------------------
    let countRaf = 0;
    const countUp = (from: number, to: number, ms: number) => {
      const el = amountRef.current;
      if (!el) return;
      cancelAnimationFrame(countRaf);
      const t0 = performance.now();
      const step = (t: number) => {
        const k = Math.min(1, (t - t0) / ms);
        el.textContent = fmt(from + (to - from) * (1 - Math.pow(1 - k, 3)));
        if (k < 1) countRaf = requestAnimationFrame(step);
        else shown.amount = to;
      };
      countRaf = requestAnimationFrame(step);
    };
    if (amountRef.current) amountRef.current.textContent = fmt(shown.amount);
    if (labelRef.current) labelRef.current.style.top = `${labelMidY * U - fsLabel * 0.55}px`;

    // 外から溜まり具合が変わったとき（試し表示の rise など）
    api.current = {
      setLevel(p, of, amount) {
        if (!started) return;
        tween(p, 420);
        if (amountRef.current) amountRef.current.textContent = fmt(amount);
        shown.amount = amount;
        if (of && geo.pileY == null) {
          geo.pileY = pileFeet;
          m.after(420, () => showPile(true));
        } else if (!of) {
          geo.pileY = null;
          showPile(false);
        }
      },
    };

    // ---- 段取り -----------------------------------------------------------
    // 出直したらすぐ飛び乗れるように、バケツの脇から始める
    kuro.place(geo.bucket.left - 70, geo.groundY);
    const brain = initialBrain(r, kuro.x, geo.minX, geo.maxX, live.current.overflow, null);
    (async () => {
      await new Promise<void>((res) => m.after(200, res));
      // アラート明け: バケツ（山）に飛び乗って喜ぶ。そのあいだに中身が上がる
      await kuro.cheer(() => {
        started = true;
        const { level: p, amount } = live.current;
        tween(p, 1500);
        countUp(shown.amount, amount, 1500);
        if (live.current.overflow) m.after(1300, () => showPile(true));
      });
      if (live.current.overflow) await kuro.dance(range(r, 1800, 2600));
      await kuro.hopOut();
      while (alive) {
        brain.t = m.time();
        brain.x = kuro.x;
        brain.overflow = geo.pileY != null;
        const a = nextAction(brain, r);
        if (a.kind === "run") await kuro.run(a.to);
        else if (a.kind === "pause") await kuro.pause(a.ms, a.look);
        else if (a.kind === "trick") await kuro.trick(a.trick);
        else if (a.kind === "chase") await kuro.chase(flyBy);
        else if (a.kind === "nap") await kuro.nap();
        else if (a.kind === "dance") {
          await kuro.dance(a.ms);
          await kuro.hopOut();
        }
        // 念のため：何もせずに戻ってきても空回りしない
        await new Promise<void>((res) => m.after(16, res));
      }
    })();

    return () => {
      alive = false;
      api.current = null;
      cancelAnimationFrame(raf);
      cancelAnimationFrame(countRaf);
      kuro.dispose();
      m.dispose();
      host.innerHTML = "";
    };
    // 場面は幅と絵で組む。額の変化は api 経由で渡す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneW, mascot, bucket, visitor]);

  const tone = (t: TextTone, w: number): React.CSSProperties => ({
    color: t.color,
    textShadow: outline(t.shadow, w),
  });
  const textBase: React.CSSProperties = {
    position: "absolute",
    left: 0,
    width: "100%",
    textAlign: "center",
    fontFamily: "'Kosugi Maru', sans-serif",
    whiteSpace: "nowrap",
    pointerEvents: "none",
  };

  return (
    <div style={{ position: "relative", width: sceneW, height: sceneH }}>
      <div ref={hostRef} style={{ position: "absolute", inset: 0 }} />
      <div style={{ position: "absolute", inset: 0, zIndex: 10, pointerEvents: "none" }}>
        <div
          ref={labelRef}
          style={{
            ...textBase,
            top: sceneH * 0.6,
            fontSize: fsLabel,
            lineHeight: 1.1,
            fontWeight: 800,
            ...tone(theme.text.bottom, Math.max(1.5, sceneW * 0.007)),
          }}
        >
          {label}
        </div>
        {/* 字の帯。いまの額（大）と目標（小）を1行に。クロはこの帯へ降りない */}
        <div style={{ ...textBase, bottom: 0, lineHeight: 1, fontWeight: 900 }}>
          <span
            ref={amountRef}
            style={{ fontSize: fsAmount, ...tone(theme.text.center, Math.max(2, sceneW * 0.01)) }}
          >
            {fmt(currentAmount)}
          </span>
          <span style={{ fontSize: fsTarget, fontWeight: 800, ...tone(theme.text.top, Math.max(1.5, sceneW * 0.007)) }}>
            {` / ${fmt(targetAmount)}`}
          </span>
        </div>
      </div>
    </div>
  );
};
