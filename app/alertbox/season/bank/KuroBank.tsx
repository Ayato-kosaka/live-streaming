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
const KURO_H = 225;

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
    const bdef = bucket.def;
    const emptyP = partOf(bdef, "empty");
    const fullP = partOf(bdef, "full");
    const imgOf = (id: string) => {
      const p = partOf(bdef, id);
      return p ? bucket.images.get(p.file ?? Object.values(p.swaps ?? {})[0]) ?? null : null;
    };
    const eImg = imgOf("empty");
    if (!emptyP || !fullP || !eImg) return;
    const eBox = alphaBox(eImg.url, eImg);
    const eOrigin = restOrigin(bdef, "empty")!;
    // 空のバケツの「色の付いた幅」を BUCKET_W に合わせる
    const sB = (BUCKET_W * U) / eBox.w;
    // 台紙の (0,0) を場面のどこに置くか（px）
    const bx = 500 * U - (eOrigin[0] + eBox.x + eBox.w / 2) * sB;
    const by = GROUND_Y * U - (eOrigin[1] + eBox.y + eBox.h) * sB;
    const [BW, BH] = bdef.size;

    const layer = (z: number) => {
      const d = document.createElement("div");
      Object.assign(d.style, { position: "absolute", left: "0px", top: "0px", width: "100%", height: "100%", zIndex: String(z), pointerEvents: "none" });
      host.appendChild(d);
      return d;
    };
    /* クロはふだんバケツの手前。バケツに入るとき（跳んだ頂点）だけ奥へ回る */
    const kuroBox = layer(3);
    const bucketBox = layer(2);
    const puffBox = layer(3);
    const batBox = layer(4);

    const stage = document.createElement("div");
    Object.assign(stage.style, {
      position: "absolute",
      left: `${bx}px`,
      top: `${by}px`,
      width: `${BW}px`,
      height: `${BH}px`,
      transformOrigin: "0 0",
      transform: `scale(${sB})`,
    });
    bucketBox.appendChild(stage);
    const place = (id: string, into: HTMLElement) => {
      const p = partOf(bdef, id);
      const im = imgOf(id);
      if (!p || !im) return null;
      const o = restOrigin(bdef, id)!;
      const el = document.createElement("img");
      el.src = im.url;
      el.alt = "";
      el.draggable = false;
      Object.assign(el.style, {
        position: "absolute",
        left: `${o[0]}px`,
        top: `${o[1]}px`,
        width: `${im.width}px`,
        height: `${im.height}px`,
        zIndex: String(Math.round(p.z * 10)),
        pointerEvents: "none",
        userSelect: "none",
      });
      into.appendChild(el);
      return el;
    };
    const ordered = [...bdef.parts].sort((a, b) => a.z - b.z);
    const fillBox = document.createElement("div");
    Object.assign(fillBox.style, {
      position: "absolute",
      left: "0px",
      top: "0px",
      width: `${BW}px`,
      height: `${BH}px`,
      zIndex: String(Math.round(fullP.z * 10)),
    });
    let pileEl: HTMLImageElement | null = null;
    let glowEl: HTMLImageElement | null = null;
    for (const p of ordered) {
      if (p.id === "full") {
        stage.appendChild(fillBox);
        place("full", fillBox);
      } else if (p.id === "glow") {
        glowEl = place("glow", fillBox);
      } else if (p.id === "overflow") {
        pileEl = place("overflow", stage);
      } else place(p.id, stage);
    }

    // 満タンの絵の、中身の上下（0% と 100% の水面）
    const fImg = imgOf("full")!;
    const fBox = alphaBox(fImg.url, fImg);
    const fO = restOrigin(bdef, "full")!;
    const fillTop = fO[1] + fBox.y;
    const fillBottom = fO[1] + fBox.y + fBox.h;
    let lvl = shown.level;
    let phase = 0;
    const clip = () => {
      const d = makeWaveClipPath(BW, BH, lvl, phase, fillTop - 9, fillBottom);
      fillBox.style.clipPath = `path("${d}")`;
      (fillBox.style as unknown as Record<string, string>).webkitClipPath = `path("${d}")`;
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
    if (glowEl) {
      m.play(glowEl, [
        { opacity: 1 },
        { opacity: 0.7, offset: 0.18 },
        { opacity: 0.95, offset: 0.3 },
        { opacity: 0.78, offset: 0.62 },
        { opacity: 1 },
      ], { duration: 2600, iterations: Infinity });
    }

    // 満タンの山
    const pileImg = imgOf("overflow");
    let pileTopY: number | null = null;
    if (pileEl && pileImg) {
      const pBox = alphaBox(pileImg.url, pileImg);
      const pO = restOrigin(bdef, "overflow")!;
      pileTopY = (by + (pO[1] + pBox.y) * sB) / U;
      pileEl.style.transformOrigin = `${pBox.x + pBox.w / 2}px ${pBox.y + pBox.h}px`;
      pileEl.style.visibility = live.current.overflow && shown.level >= 1 ? "visible" : "hidden";
    }
    const showPile = (on: boolean) => {
      if (!pileEl) return;
      const was = pileEl.style.visibility === "visible";
      pileEl.style.visibility = on ? "visible" : "hidden";
      if (on && !was)
        m.play(pileEl, [
          { transform: "scale(0.4, 0.2)", opacity: 0, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
          { transform: "scale(1.06, 1.12)", opacity: 1, offset: 0.6 },
          { transform: "scale(1, 1)", opacity: 1 },
        ], { duration: 520 });
    };

    // ---- 場面の寸法（クロに渡す） --------------------------------------
    const bTop = (by + (eOrigin[1] + eBox.y) * sB) / U;
    const bLeft = (bx + (eOrigin[0] + eBox.x) * sB) / U;
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
        topY: bTop,
        // 口の中へ少し沈む。帽子の先が場面の上で切れない高さまで
        inY: Math.max(KURO_H + 6, bTop + (eBox.h * sB) / U * 0.1),
      },
      pileY: null,
      kuroH: KURO_H,
    };
    const pileFeet = pileTopY != null ? Math.max(KURO_H + 4, pileTopY + KURO_H * 0.1) : null;
    if (live.current.overflow) geo.pileY = pileFeet;

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
      kuroBox.style.zIndex = front ? "3" : "1";
    };
    const kuro = new Kuro(m, kRig, kuroBox, geo, frame, r, setFront, puff);
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
    // ラベルはバケツの胴（下から 4 割の高さ）に貼る
    if (labelRef.current) {
      const bBottom = GROUND_Y;
      labelRef.current.style.top = `${(bTop + (bBottom - bTop) * 0.58) * U - fsLabel * 0.55}px`;
    }

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
      <div style={{ position: "absolute", inset: 0, zIndex: 5, pointerEvents: "none" }}>
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
