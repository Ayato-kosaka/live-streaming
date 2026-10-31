/**
 * 季節の貯金箱（切り絵版）。かぼちゃのお菓子バケツのまわりを、黒猫のクロが走り回る。
 *
 * - **箱の下の真ん中に、バケツが箱の幅の半分**（オーナーが PRISM で測った豚は箱の幅の約 4 割。
 *   「小さすぎる」と言われたので、豚を下回らない）。クロはバケツのまわりを、箱の幅いっぱいに走る。
 *   場面は箱の幅を 1000 とした単位で組み、最後に幅へ掛ける。幅が変わったら（オーナーが手で
 *   箱を広げる・戻す）その場で組み直す。古い寸法は握らない。幅は `useBoxSize`（PRISM が
 *   絶えず送ってくる resize では描き直さない）
 * - 溜まり具合は**豚と同じ読み方**: 灰色のかぼちゃに、下からオレンジが溜まる（いまの波の
 *   切り抜き、`wave.ts`）。オレンジは縁まで含めたかぼちゃの外形ぜんぶで、灰色の残りが
 *   そのまま「あと何割」になる。あわせて口のお菓子も増える（0% 空 → 半分で少し →
 *   100% 山盛り → 超えたらあふれる）。お菓子は満タンの絵から**お菓子の画素だけ**を抜いて
 *   重ねる（縁ごと重ねると、灰色のはずの縁がお菓子と一緒に色づいて、残りが少なく見える）。
 *   少ないときは、山の形のまま**バケツの中へ沈める**（口の中と縁より上でだけ見せる）。
 *   下から切って増やすと、山の天辺が横一直線に切れて「見切れ」に見えた（オーナーの指摘）。
 *   **波を動かすのは溜まるあいだだけ**で、溜まり終わったら止める。
 *   何時間も出ているので、待機中に rAF を回さない
 * - 100% を超えたら、お菓子があふれた山を出し、クロがその上で踊る
 * - 字は いまの額（大）と目標（小）をいちばん下に1行で、ラベルは取っ手の上に
 * - 貯金箱はアラートのあいだ消えて、明けると出直す。出直すたびに、クロがバケツに飛び乗って
 *   喜び、そのあいだに中身が前の額から今の額まで上がる（数字も数え上げる）
 */
import React, { useEffect, useRef } from "react";
import type { SeasonTheme, TextTone } from "../../themes";
import { makeWaveClipPath } from "../../components/PiggyGauge/wave";
import { buildRig, type LoadedRig } from "../rig/RigView";
import { Motion, range } from "../rig/motion";
import { restOrigin, type RigDef } from "../rig/rig";
import { Kuro, type KuroGeo, type KuroFrame } from "./kuro";
import { initialBrain, nextAction } from "./kuroBrain";
import { outline } from "../ThemedGauge";
import { loadedElement } from "../useSeason";
import { useBoxSize } from "../useBoxSize";

type Props = {
  theme: SeasonTheme;
  mascot: LoadedRig;
  bucket: LoadedRig;
  visitor: LoadedRig | null;
  currentAmount: number;
  targetAmount: number;
  label: string;
};

/**
 * 場面の単位（箱の幅を 1000）での置き場所。場面の高さは 480（箱の下の端から上へ）。
 *
 * バケツ（色の付いた幅）は 500 = 箱の幅の半分。取っ手の先から底までは 440。
 * 字は豚と同じく絵に重ねる: いまの額と目標はいちばん下（かぼちゃの底の 2 割に掛かる）、ラベルは
 * 取っ手の上。額をかぼちゃの胴の真ん中に置くと、1〜3 割の溜まりが字の裏に隠れて読めなかった。
 *
 * `KURO_H` は部品の台紙で測った背丈（帽子の箱の上〜足の箱の下）で、描かれている
 * 背丈はその 85%。250 で描かれた背丈が 214 になり、かぼちゃ（取っ手を除く、354）の
 * 60%（オーナーの指摘「クロだと分かるだけで小さすぎる。バケツの高さの 55〜65%」）
 */
const SCENE_H = 480;
const GROUND_Y = 468;
const BUCKET_W = 500;
const KURO_H = 250;

/**
 * 出直しをまたいで、前に見せていた額と溜まり具合を覚えておく
 * （アラート明けに、前の額から数え上げるため）。ページに1つ
 */
const shown = { amount: 0, level: 0, seen: false };

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

/**
 * 満タンの絵から、お菓子だけを抜いた絵。空の絵と色が違う画素を残し、`cutY`（絵の px）より
 * 下は捨てる。一度作ったら覚える（作れなければ null → 満タンの絵をそのまま使う）。
 *
 * 色の差だけで抜くと、空の絵の縁とたまたま同じ色のお菓子（棒つきキャンディのオレンジ）に
 * 横すじの穴が開く。抜いた形を 6px 太らせてから 6px 痩せさせて（閉じる）、穴だけ埋める
 */
const candyCache = new Map<string, HTMLCanvasElement | null>();
function candyOnly(fullUrl: string, emptyUrl: string, cutY: number): HTMLCanvasElement | null {
  const key = `${fullUrl}|${emptyUrl}|${Math.round(cutY)}`;
  if (candyCache.has(key)) return candyCache.get(key) ?? null;
  let out: HTMLCanvasElement | null = null;
  try {
    const f = loadedElement(fullUrl);
    const e = loadedElement(emptyUrl);
    if (f && e && f.naturalWidth === e.naturalWidth && f.naturalHeight === e.naturalHeight) {
      const w = f.naturalWidth;
      const h = Math.max(1, Math.min(f.naturalHeight, Math.round(cutY)));
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      if (ctx) {
        ctx.drawImage(e, 0, 0);
        const ed = ctx.getImageData(0, 0, w, h).data;
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(f, 0, 0);
        const img = ctx.getImageData(0, 0, w, h);
        const fd = img.data;
        const n = w * h;
        let k = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          const j = i * 4;
          const d = Math.max(
            Math.abs(fd[j] - ed[j]),
            Math.abs(fd[j + 1] - ed[j + 1]),
            Math.abs(fd[j + 2] - ed[j + 2]),
            Math.abs(fd[j + 3] - ed[j + 3])
          );
          k[i] = Math.min(1, Math.max(0, (d - 24) / 40));
        }
        const R = 6;
        const pass = (src: Float32Array, horiz: boolean, grow: boolean) => {
          const dst = new Float32Array(n);
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              let v = src[y * w + x];
              for (let s = 1; s <= R; s++) {
                const a = horiz ? (x - s >= 0 ? src[y * w + x - s] : 0) : y - s >= 0 ? src[(y - s) * w + x] : 0;
                const b = horiz ? (x + s < w ? src[y * w + x + s] : 0) : y + s < h ? src[(y + s) * w + x] : 0;
                v = grow ? Math.max(v, a, b) : Math.min(v, a, b);
              }
              dst[y * w + x] = v;
            }
          }
          return dst;
        };
        k = pass(pass(k, true, true), false, true);
        k = pass(pass(k, true, false), false, false);
        for (let i = 0; i < n; i++) fd[i * 4 + 3] = Math.round(fd[i * 4 + 3] * k[i]);
        ctx.putImageData(img, 0, 0);
        out = c;
      }
    }
  } catch {
    out = null;
  }
  candyCache.set(key, out);
  return out;
}

/**
 * お菓子を見せてよいところ（絵の px）。奥の縁の上の辺より上は全部、そこから口の手前の辺までは
 * 口の中（縁の楕円の内側で、暗いところ）だけ。沈めたお菓子は、縁と胴の裏に隠れる。
 * 作れなければ null
 */
const mouthCache = new Map<string, HTMLCanvasElement | null>();
function mouthMask(
  emptyUrl: string,
  w: number,
  h: number,
  ring: { cx: number; cy: number; a: number; b: number; top: number }
): HTMLCanvasElement | null {
  const key = `${emptyUrl}|${w}x${h}|${ring.cx},${ring.cy},${ring.a},${ring.b},${ring.top}`;
  if (mouthCache.has(key)) return mouthCache.get(key) ?? null;
  let out: HTMLCanvasElement | null = null;
  try {
    const e = loadedElement(emptyUrl);
    if (e) {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      if (ctx) {
        ctx.drawImage(e, 0, 0);
        const img = ctx.getImageData(0, 0, w, h);
        const d = img.data;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const j = (y * w + x) * 4;
            let on = y < ring.top;
            if (!on && d[j + 3] > 0) {
              const ex = (x - ring.cx) / ring.a;
              const ey = (y - ring.cy) / ring.b;
              const luma = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
              on = ex * ex + ey * ey <= 1 && luma < 90;
            }
            d[j] = d[j + 1] = d[j + 2] = 0;
            d[j + 3] = on ? 255 : 0;
          }
        }
        ctx.putImageData(img, 0, 0);
        out = c;
      }
    }
  } catch {
    out = null;
  }
  mouthCache.set(key, out);
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
  const { width: W, height: H } = useBoxSize();
  const sceneW = Math.max(1, Math.round(W));
  const sceneH = Math.round((sceneW * SCENE_H) / 1000);
  const U = sceneW / 1000;
  /* 場面の上に空いている高さ（場面の単位）。箱は縦長なので、バケツの上に乗ったクロの
     帽子が場面の上へはみ出してもよい。横長の箱で開かれたときだけ、ここで抑える */
  const headroom = Math.max(0, Math.round((H - sceneH) / U));

  const hostRef = useRef<HTMLDivElement | null>(null);
  const amountRef = useRef<HTMLSpanElement | null>(null);
  const labelRef = useRef<HTMLDivElement | null>(null);
  /* 字の大きさ。**幅に比例**（PRISM の箱の大きさは配信ごとに違う）。いまの額がいちばん大きい */
  const fsAmount = sceneW * 0.085;
  const fsTarget = sceneW * 0.05;
  const fsLabel = sceneW * 0.045;
  const ratio = targetAmount > 0 ? currentAmount / targetAmount : 0;
  const level = Math.max(0, Math.min(1, ratio));
  // ちょうど 100% は山盛り、超えたらあふれ（オーナーの指定）
  const overflow = ratio > 1;

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
    // 灰色（溜まっていない分）。無ければ空のバケツで代える
    const gImg = swapImg("gray") ?? eImg;
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
    const bodyTop = bO[1] + eBox.y;
    const bodyBottom = bO[1] + eBox.y + eBox.h;
    const fBox = alphaBox(fImg.url, fImg);
    const candyTop = bO[1] + fBox.y;
    /* お菓子だけの絵（絵の px で、口の手前の辺より少し下まで）。絵の大きさは台紙の上の
       大きさと同じ（fImg.width は絵の px）。作れなければ、前どおり満タンの絵を重ねる */
    const fEl = loadedElement(fImg.url);
    const candyArt = candyOnly(fImg.url, eImg.url, ((rimFrontY - bO[1]) * (fEl?.naturalHeight || fImg.height)) / fImg.height + 6);
    /* 口の中の形（絵の px）。目印が無ければ作らない（前どおり下から切って増やす） */
    const ringOf = () => {
      const rb = anc.rimBack;
      const rf = anc.rimFront;
      if (!rb || !rf || rf.length < 3) return null;
      return {
        cx: (rf[0] + rf[2]) / 2 - bO[0],
        cy: (rb[1] + rf[1]) / 2 - bO[1],
        a: (rf[2] - rf[0]) / 2,
        b: (rf[1] - rb[1]) / 2,
        top: rb[1] - bO[1],
      };
    };
    const ring = ringOf();
    const mask = candyArt && ring ? mouthMask(eImg.url, candyArt.width, candyArt.height, ring) : null;
    /** 山を沈める深さ（絵の px）: 天辺が口の手前の辺まで下がれば、全部隠れる */
    const sinkDepth = rimFrontY - candyTop;

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
    /** 横に十分広い四角で、y0〜y1 の帯だけを残す切り抜き（絵は台紙からはみ出すので広めに） */
    const band = (y0: number, y1: number) =>
      `polygon(-1000px ${y0}px, 2000px ${y0}px, 2000px ${y1}px, -1000px ${y1}px)`;
    const setClip = (el: HTMLElement, c: string) => {
      el.style.clipPath = c;
      (el.style as unknown as Record<string, string>).webkitClipPath = c;
    };
    const box = () => {
      const d = document.createElement("div");
      Object.assign(d.style, { position: "absolute", left: "0px", top: "0px", width: `${BW}px`, height: `${BH}px`, overflow: "visible" });
      return d;
    };
    /**
     * バケツ1組。灰色のかぼちゃ → 下から溜まるオレンジ（口の手前の辺より下は満タンの絵＝顔が
     * 灯る、上は空の絵＝縁と口の中。どちらもお菓子は無い）→ 口のお菓子（お菓子だけの絵。
     * 溜まりに合わせて下から増える）→ あふれ。
     * `cutAbove` を渡すと、その高さより上を切る（口の手前の段）
     */
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
      if (cutAbove != null) setClip(st, band(cutAbove, 4000));
      into.appendChild(st);
      let handle: HTMLImageElement | null = null;
      if (handleP && hImg && cutAbove == null) {
        const ho = restOrigin(bdef, "handle")!;
        handle = imgEl(hImg.url, ho[0], ho[1], hImg.width, hImg.height);
        handle.style.transformOrigin = `${handleP.pivot[0]}px ${handleP.pivot[1]}px`;
        st.appendChild(handle);
      }
      st.appendChild(imgEl(gImg.url, bO[0], bO[1], gImg.width, gImg.height));
      // オレンジ（縁まで含めたかぼちゃ。お菓子は下の段が受け持つ）
      const bodyOuter = box();
      setClip(bodyOuter, band(bodyTop - 2, 4000));
      const body = box();
      const lit = imgEl(fImg.url, bO[0], bO[1], fImg.width, fImg.height);
      setClip(lit, band(rimFrontY - bO[1], 4000));
      body.appendChild(lit);
      const rim = imgEl(eImg.url, bO[0], bO[1], eImg.width, eImg.height);
      setClip(rim, band(-4000, rimFrontY - bO[1]));
      body.appendChild(rim);
      bodyOuter.appendChild(body);
      st.appendChild(bodyOuter);
      // 口のお菓子（口の手前の辺より上だけ）
      let candy: HTMLDivElement | null = null;
      let candyCanvas: HTMLCanvasElement | null = null;
      if (cutAbove == null) {
        const candyOuter = box();
        setClip(candyOuter, band(-4000, rimFrontY));
        candy = box();
        if (candyArt) {
          const cv = document.createElement("canvas");
          cv.width = candyArt.width;
          cv.height = candyArt.height;
          cv.getContext("2d")?.drawImage(candyArt, 0, 0);
          candyCanvas = cv;
          Object.assign(cv.style, {
            position: "absolute",
            left: `${bO[0]}px`,
            top: `${bO[1]}px`,
            width: `${fImg.width}px`,
            height: `${(candyArt.height * fImg.width) / candyArt.width}px`,
            pointerEvents: "none",
          });
          candy.appendChild(cv);
        } else {
          candy.appendChild(imgEl(fImg.url, bO[0], bO[1], fImg.width, fImg.height));
        }
        candyOuter.appendChild(candy);
        st.appendChild(candyOuter);
      }
      let over: HTMLImageElement | null = null;
      if (oImg) {
        over = imgEl(oImg.url, bO[0], bO[1], oImg.width, oImg.height);
        over.style.visibility = "hidden";
        st.appendChild(over);
      }
      return { body, candy, candyCanvas, over, handle };
    };
    const back = stack(backBox, null);
    const front = stack(frontBox, rimFrontY);

    /* 溜まりの 0% と 100%。オレンジは胴の底から縁の上まで、お菓子は口の手前の辺から山の
       天辺まで。お菓子は少し遅れて増やす（半分でまだ「少し」に見えるように） */
    let lvl = shown.level;
    let phase = 0;
    /** お菓子の山を、溜まり具合 c（0〜1）だけ出す。山の形のまま沈め、口の中と縁より上でだけ見せる */
    let candyAt = -1;
    const drawCandy = (c: number) => {
      const cv = back.candyCanvas;
      const ctx = cv?.getContext("2d");
      if (!cv || !ctx || !candyArt || !mask) return false;
      if (Math.abs(c - candyAt) < 0.003) return true;
      candyAt = c;
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(candyArt, 0, (1 - c) * sinkDepth);
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(mask, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      return true;
    };
    const clip = () => {
      const d = makeWaveClipPath(BW, BH, lvl, phase, bodyTop - 9, bodyBottom);
      for (const f of [back.body, front.body]) setClip(f, `path("${d}")`);
      // 半分でまだ「少し」に見えるように、お菓子は少し遅れて増やす
      const c = Math.pow(lvl, 1.4);
      if (back.candy && !drawCandy(c)) {
        // 口の形が分からないときは、前どおり下から切って増やす
        const w = makeWaveClipPath(BW, BH, c, phase + 1.7, candyTop - 9, rimFrontY + 6);
        setClip(back.candy, `path("${w}")`);
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
      // 足もとの動ける幅。クロは足もとから左右に 114 ずつ、くわえたお菓子でさらに 30 はみ出すので、
      // 面の縁で切れない幅（110〜890 だと走り込んだときに尻尾が、135〜865 だとくわえたお菓子が
      // 右の縁に触れた。縁の画素を数えて確かめた）
      minX: 150,
      maxX: 850,
      bucket: {
        left: bLeft,
        right: bRight,
        cx: (bLeft + bRight) / 2,
        topY: toU(rimBackY),
        // 口の手前の辺より少し下に足を置く（体の下が縁に隠れる）。帽子の先が箱の上で切れない高さまで
        inY: Math.max(KURO_H + 6 - headroom, toU(rimFrontY) + KURO_H * 0.06),
      },
      pileY: null,
      kuroH: KURO_H,
    };
    const pileFeet = pileTopY != null ? Math.max(KURO_H + 4 - headroom, pileTopY + KURO_H * 0.14) : null;
    if (live.current.overflow) geo.pileY = pileFeet;
    // ラベルは取っ手の上（バケツのいちばん上の少し上）に
    const topU = handleP && hImg ? toU(restOrigin(bdef, "handle")![1] + alphaBox(hImg.url, hImg).y) : toU(rimBackY);

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
    if (amountRef.current)
      amountRef.current.textContent = fmt(
        !shown.seen || shown.amount !== live.current.amount ? shown.amount : live.current.amount
      );
    if (labelRef.current) labelRef.current.style.top = `${(topU - 6) * U - fsLabel * 1.1}px`;

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
    /* 喜ぶのは「額が増えて出直したとき」と「初めて開いたとき」だけ。箱の大きさが
       変わって組み直したとき（オーナーが手で広げる・戻す）は、続きから何事もなく動く */
    const fresh = !shown.seen || shown.amount !== live.current.amount;
    shown.seen = true;
    const brain = initialBrain(r, kuro.x, geo.minX, geo.maxX, live.current.overflow, null);
    (async () => {
      if (fresh) {
        // 出直したらすぐ飛び乗れるように、バケツの脇から始める
        kuro.place(geo.bucket.left - 70, geo.groundY);
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
      } else {
        started = true;
        lvl = live.current.level;
        shown.level = lvl;
        clip();
        if (live.current.overflow) showPile(true);
        kuro.place(range(r, geo.minX, geo.maxX), geo.groundY);
        brain.x = kuro.x;
      }
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
  }, [sceneW, headroom, mascot, bucket, visitor]);

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
        {/* いまの額（大）と目標（小）を1行に。いちばん下（かぼちゃの底に掛かる） */}
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
        <div
          ref={labelRef}
          style={{
            ...textBase,
            top: -fsLabel * 1.2,
            fontSize: fsLabel,
            lineHeight: 1.1,
            fontWeight: 800,
            ...tone(theme.text.bottom, Math.max(1.5, sceneW * 0.007)),
          }}
        >
          {label}
        </div>
      </div>
    </div>
  );
};
