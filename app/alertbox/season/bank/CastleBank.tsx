/**
 * 季節の貯金箱（11月、ルーマニアのブラン城。#1078 の D 案）。丘の上の小さな城の、小さな城主ピポ。
 *
 * - **溜まるほど下の階から窓に灯りがともる。** 0% の絵（窓が暗い）の上に、同じ構図の 100% の絵（全部の窓が光る）を
 *   重ね、**下から切り抜いて**見せる（ハロウィンのバケツと同じ考え方。境目は壁の下の端 → いちばん上の壁の上の端）
 * - 横の旗竿のルーマニアの旗も、溜まり具合だけ上がる（0% で竿の下、100% でてっぺん）
 * - ピポは、空なら門の前でランタンを持って待つ・溜まっているあいだは灯りの境目の窓から顔を出して手を振る・
 *   満タンなら門の前でバンザイ（`castle.ts` の `pipoPose`）
 * - 字（いまの額・目標・旅の名前）は、城の足もとを横切るリボンの旗に載せる（`themes.ts` の `castleBank.text`）
 * - 貯金箱はアラートのあいだ消えて、明けると出直す。出直すたびに、前の額から今の額まで灯りが上がる（数字も数え上げる）
 *
 * ## 大きさは豚と同じ物差し
 *
 * 場面の大きさは **Dimensions の幅（`useStableWindow`）だけ**から決める（`castle.ts` の `castleBox`。豚の 1.6 倍）。
 * `<html>` の幅（`useBoxSize`）で決めると、PRISM の % によって豚との比が変わる（`docs/island-misses.md` #311）。
 *
 * ## 重さ
 *
 * - 待機中に rAF を回さない。灯りが上がるあいだ（1.5 秒）だけ回す
 * - ずっと動くのは小さな絵（旗・ピポ）の transform だけ（Web Animations。合成のスレッドが回す）
 * - 絵は出す大きさの2〜3倍に縮めて置いてある（`public/alert/themes/castle/`）
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { CastleBankDef, SeasonTheme, TextTone } from "../../themes";
import { loadImage, type LoadedImage, type SeasonBank } from "../useSeason";
import { useStableWindow } from "../useBoxSize";
import { Motion } from "../rig/motion";
import { outline } from "../ThemedGauge";
import {
  castleBox,
  castleFiles,
  castleLayout,
  flagY,
  lightY,
  peekTop,
  pipoPose,
  readCastleDef,
  type CastleDef,
  type CastleText,
} from "./castle";

type Props = {
  theme: SeasonTheme;
  def: CastleBankDef;
  bank: SeasonBank;
  currentAmount: number;
  targetAmount: number;
  label: string;
  /** 城の部品が読めなかったときに出すもの（コマ送りの貯金箱） */
  fallback: React.ReactNode;
};

type Loaded = { def: CastleDef; imgs: Map<string, LoadedImage> };

/** 城の部品はページに1つずつ読む（アラートのたびに出直すので、毎回読み直さない） */
const cache = new Map<string, Promise<Loaded | null>>();

function loadCastle(dir: string, text: CastleText): Promise<Loaded | null> {
  const key = `${dir}|${text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = (async () => {
    try {
      const res = await fetch(`${dir}/castle.json`);
      if (!res.ok) return null;
      const def = readCastleDef(await res.json());
      if (!def) return null;
      const files = castleFiles(def, text);
      const imgs = await Promise.all(files.map((f) => loadImage(`${dir}/${f}`)));
      if (!imgs.every(Boolean)) return null;
      return { def, imgs: new Map(files.map((f, i) => [f, imgs[i]!])) };
    } catch {
      return null;
    }
  })();
  cache.set(key, p);
  // 読めなかったものは控えない（次に出直したとき、もう一度試す）
  p.then((v) => {
    if (!v) cache.delete(key);
  });
  return p;
}

/**
 * 試し表示（`?preview=bank`）のときだけ、字の載せ方を URL で替えられる（`&bankText=plaque` など）。
 * 字の形を選ぶための静止画を、同じ部品で撮るため。配信（`preview` 無し）では効かない
 */
function previewText(fallback: CastleText): CastleText {
  if (typeof window === "undefined" || !window.location) return fallback;
  const q = new URLSearchParams(window.location.search);
  if (!q.get("preview")) return fallback;
  const v = q.get("bankText");
  return v === "ribbon" || v === "plaque" || v === "sky" ? v : fallback;
}

/** 出直しをまたいで、前に見せていた額と溜まり具合を覚えておく（アラート明けに、前の額から上げるため） */
const shown = { amount: 0, level: 0, seen: false };

const fmt = (n: number) => `${Math.round(n).toLocaleString("ja-JP")}円`;

/** 豚と同じ字体（react-native-web の既定。スマホでは英数字が Roboto、日本語がゴシック） */
const FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';

export const CastleBank: React.FC<Props> = (props) => {
  const text = useMemo(() => previewText(props.def.text), [props.def.text]);
  const [parts, setParts] = useState<Loaded | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    loadCastle(props.theme.dir, text).then((p) => {
      if (alive) setParts(p);
    });
    return () => {
      alive = false;
    };
  }, [props.theme.dir, text]);
  // 読んでいる途中は何も出さない（豚やコマ送りを一瞬出してから差し替えると、ちらつく）
  if (parts === undefined) return null;
  if (parts === null) return <>{props.fallback}</>;
  return <CastleScene {...props} text={text} parts={parts} />;
};

const CastleScene: React.FC<Props & { text: CastleText; parts: Loaded }> = ({
  theme,
  bank,
  currentAmount,
  targetAmount,
  label,
  text,
  parts,
}) => {
  const { width: dimW } = useStableWindow();
  const box = castleBox(dimW);
  const { def, imgs } = parts;
  const base = bank.base[0];
  const lit = bank.fill[0];
  const plateDef = text === "sky" ? null : def.plates[text] ?? null;
  const plateImg = plateDef ? imgs.get(plateDef.file) ?? null : null;
  const L = castleLayout(text, box, def, plateImg ? plateImg.width / plateImg.height : null);
  /** 城の絵の px → 場面の px */
  const s = L.castle.w / def.content[2];
  /** 城の絵の (0,0) を場面のどこに置くか */
  const ox = L.castle.x - def.content[0] * s;
  const oy = L.castle.y - def.content[1] * s;
  // 読んだ絵の大きさが castle.json と違えば、比で合わせる（縮め直した絵を置いたとき）
  const k = base.width / def.size[0];

  const ratio = targetAmount > 0 ? currentAmount / targetAmount : 0;
  const level = Math.max(0, Math.min(1, ratio));
  /** 場面を組むときに読む、いまの溜まり具合と額（組み直さずに渡すため ref に持つ） */
  const live = useRef({ level, amount: currentAmount });

  const hostRef = useRef<HTMLDivElement | null>(null);
  const litRef = useRef<HTMLDivElement | null>(null);
  const flagRef = useRef<HTMLDivElement | null>(null);
  const amountRef = useRef<HTMLSpanElement | null>(null);
  const pipoRefs = {
    wait: useRef<HTMLDivElement | null>(null),
    peek: useRef<HTMLDivElement | null>(null),
    peekIn: useRef<HTMLDivElement | null>(null),
    cheer: useRef<HTMLDivElement | null>(null),
  };

  /** 場面の外から、溜まり具合と額を渡す口（場面を組み直さずに。試し表示の rise や、出ているあいだに額が変わったとき） */
  const api = useRef<{ setLevel: (lv: number, amount: number) => void } | null>(null);

  useEffect(() => {
    const m = new Motion();
    /** ピポの動き（居場所が替わったら丸ごと捨てて組み直す） */
    let pm = new Motion();
    let raf = 0;
    let countRaf = 0;
    /** いま見せている溜まり具合 */
    let cur = shown.seen ? shown.level : 0;
    let curPose: "wait" | "peek" | "cheer" | null = null;
    let started = false;
    const fromAmount = shown.seen ? shown.amount : 0;
    const fresh = !shown.seen || shown.amount !== live.current.amount;
    shown.seen = true;

    /** 灯りの境目を溜まり具合 `lv` に置く（切り抜きと、顔を出すピポと、旗） */
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
      const pk = pipoRefs.peek.current;
      if (pk) pk.style.transform = `translate(0px, ${(peekTop(def, lv) - peekTop(def, 0)) * s}px)`;
    };

    /** 溜まり具合を `to` まで動かす。**rAF はこのあいだだけ**回す */
    const tween = (to: number, ms: number, done?: () => void) => {
      cancelAnimationFrame(raf);
      const a = cur;
      const t0 = performance.now();
      const step = (t: number) => {
        const q = Math.min(1, (t - t0) / ms);
        place(a + (to - a) * (1 - Math.pow(1 - q, 3)));
        if (q < 1) raf = requestAnimationFrame(step);
        else done?.();
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

    /* ---- ずっと続く小さな動き（どれも小さな絵の transform だけ） ---- */
    // 旗がはためく（竿側の辺を軸に）
    m.play(flagRef.current?.firstElementChild, [
      { transform: "skewY(0deg) scaleX(1)" },
      { transform: "skewY(-5deg) scaleX(0.94)" },
      { transform: "skewY(2deg) scaleX(0.98)" },
      { transform: "skewY(0deg) scaleX(1)" },
    ], { duration: 1600, iterations: Infinity, easing: "ease-in-out" });

    /** 要素の transform を、動きのあと（fill を使わずに）その形に置く。fill: forwards を積むと何時間も残る */
    const settle = (a: Animation | null, el: Element | null | undefined, tf: string) => {
      const put = () => {
        if (el) (el as HTMLElement).style.transform = tf;
      };
      if (a) a.finished.then(put, () => {});
      else put();
    };

    /** ピポの居場所を `lv` に合わせる。替わったときだけ組み直す */
    const pose = (lv: number) => {
      const want = pipoPose(lv);
      if (want === curPose) return;
      curPose = want;
      pm.dispose();
      pm = new Motion();
      for (const name of ["wait", "peek", "cheer"] as const) {
        const el = pipoRefs[name].current;
        if (el) el.style.visibility = name === want ? "visible" : "hidden";
      }
      if (want === "wait") {
        // 門の前で待つ: ゆっくり息をする（足もとを軸に）
        pm.play(pipoRefs.wait.current?.firstElementChild, [
          { transform: "scale(1, 1)" },
          { transform: "scale(1.015, 0.975)" },
          { transform: "scale(1, 1)" },
        ], { duration: 2600, iterations: Infinity, easing: "ease-in-out" });
      } else if (want === "peek") {
        // 灯った窓から顔を出して手を振る → しばらくして引っ込む → また出る
        const inner = pipoRefs.peekIn.current;
        const body = inner?.firstElementChild;
        const loop = () => {
          settle(pm.play(inner, [
            { transform: "translate(0px, 100%)" },
            { transform: "translate(0px, -6%)", offset: 0.7 },
            { transform: "translate(0px, 0px)" },
          ], { duration: 520, easing: "ease-out" }), inner, "translate(0px, 0px)");
          pm.after(560, () =>
            pm.play(body, [
              { transform: "rotate(0deg)" },
              { transform: "rotate(-6deg)" },
              { transform: "rotate(5deg)" },
              { transform: "rotate(-4deg)" },
              { transform: "rotate(0deg)" },
            ], { duration: 1500, easing: "ease-in-out" })
          );
          pm.after(6500, () =>
            settle(pm.play(inner, [{ transform: "translate(0px, 0px)" }, { transform: "translate(0px, 100%)" }], {
              duration: 380,
              easing: "ease-in",
            }), inner, "translate(0px, 100%)")
          );
          pm.after(9500, loop);
        };
        if (inner) inner.style.transform = "translate(0px, 100%)";
        loop();
      } else {
        // 満タン: バンザイで3回跳ねて、少し休む
        const el = pipoRefs.cheer.current?.firstElementChild;
        const hop = () => {
          pm.play(el, [
            { transform: "translate(0px, 0px) scale(1, 1)" },
            { transform: "translate(0px, 0px) scale(1.06, 0.92)", offset: 0.15 },
            { transform: "translate(0px, -14%) scale(0.97, 1.04)", offset: 0.5 },
            { transform: "translate(0px, 0px) scale(1.05, 0.94)", offset: 0.85 },
            { transform: "translate(0px, 0px) scale(1, 1)" },
          ], { duration: 520, iterations: 3, easing: "ease-in-out" });
          pm.after(4200, hop);
        };
        hop();
      }
    };

    // 外から溜まり具合が変わったとき（場面は組み直さない）
    api.current = {
      setLevel(lv, amount) {
        if (!started) return;
        shown.level = lv;
        shown.amount = amount;
        if (amountRef.current) amountRef.current.textContent = fmt(amount);
        // 居場所はすぐ替える（続けて額が来ると、灯りの動きが終わるのを待っていては替わらない）
        pose(lv);
        tween(lv, 420);
      },
    };

    /* 出直したら（アラート明け・初めて開いたとき）、前の額から今の額まで灯りを上げる。
       箱の大きさが変わって組み直したときは、続きから何事もなく */
    const { level: lv0, amount: am0 } = live.current;
    if (fresh && cur !== lv0) {
      if (amountRef.current) amountRef.current.textContent = fmt(fromAmount);
      place(cur);
      pose(cur);
      m.after(300, () => {
        started = true;
        countUp(fromAmount, am0, 1500);
        shown.level = lv0;
        shown.amount = am0;
        tween(lv0, 1500, () => pose(lv0));
      });
    } else {
      started = true;
      if (amountRef.current) amountRef.current.textContent = fmt(am0);
      place(lv0);
      shown.level = lv0;
      shown.amount = am0;
      pose(lv0);
    }

    return () => {
      api.current = null;
      cancelAnimationFrame(raf);
      cancelAnimationFrame(countRaf);
      pm.dispose();
      m.dispose();
    };
    // 場面は大きさと絵で組む。額の変化は api 経由で渡す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box.width, box.height, parts, text]);

  useEffect(() => {
    live.current = { level, amount: currentAmount };
    api.current?.setLevel(level, currentAmount);
  }, [level, currentAmount]);

  const img = (im: LoadedImage, x: number, y: number, w: number, h: number, extra?: React.CSSProperties) => (
    <img
      src={im.url}
      alt=""
      draggable={false}
      style={{ position: "absolute", left: x, top: y, width: w, height: h, pointerEvents: "none", userSelect: "none", ...extra }}
    />
  );
  /** ピポ1枚。`sp.x, sp.y` が足もと（下の辺の真ん中）、`sp.h` が高さ（城の絵の px） */
  const sprite = (sp: CastleDef["pipo"]["wait"]) => {
    const im = imgs.get(sp.file)!;
    const h = sp.h * s;
    const w = (im.width / im.height) * h;
    return { im, w, h, x: ox + sp.x * s - w / 2, y: oy + sp.y * s - h };
  };
  const wait = sprite(def.pipo.wait);
  // 顔を出す窓は、溜まり具合 0 の位置に置いておき、place() が境目まで transform で動かす
  const peek = sprite({ ...def.pipo.peek, y: peekTop(def, 0) + def.pipo.peek.h });
  const cheer = sprite(def.pipo.cheer);
  const flagIm = imgs.get(def.flag.file)!;
  const fh = def.flag.h * s;
  const fw = (flagIm.width / flagIm.height) * fh;

  const tone = (t: TextTone, w: number): React.CSSProperties => ({ color: t.color, textShadow: outline(t.shadow, w) });
  const P = box.width;

  return (
    <div ref={hostRef} style={{ position: "relative", width: box.width, height: box.height }}>
      {/* 夜空（字の載せ方が "sky" のときだけ）。城の後ろの丸い窓 */}
      {L.sky && (
        <div
          style={{
            position: "absolute",
            left: L.sky.x,
            top: L.sky.y,
            width: L.sky.w,
            height: L.sky.h,
            borderRadius: `${L.sky.w / 2}px ${L.sky.w / 2}px ${L.sky.w * 0.08}px ${L.sky.w * 0.08}px`,
            background: "radial-gradient(120% 90% at 50% 0%, #2B2A6B 0%, #17163F 55%, #0E0D2A 100%)",
            boxShadow: "0 0 0 3px #F6D9A8, 0 2px 6px rgba(0,0,0,0.35)",
          }}
        />
      )}
      {/* 城（0% の絵）と、下から灯る 100% の絵 */}
      {img(base, ox, oy, base.width / k * s, base.height / k * s)}
      <div ref={litRef} style={{ position: "absolute", left: ox, top: oy, width: (lit.width / k) * s, height: (lit.height / k) * s }}>
        {img(lit, 0, 0, (lit.width / k) * s, (lit.height / k) * s)}
      </div>
      {/* 旗（竿側の辺を軸にはためく）。上下は溜まり具合で */}
      <div ref={flagRef} style={{ position: "absolute", left: ox + def.pole.x * s, top: oy + flagY(def, 0) * s, width: fw, height: fh }}>
        <div style={{ position: "absolute", inset: 0, transformOrigin: "0% 50%" }}>{img(flagIm, 0, 0, fw, fh)}</div>
      </div>
      {/* ピポ: 待つ（門の前）・顔を出す（灯りの境目の窓）・バンザイ（門の前） */}
      <div ref={pipoRefs.wait} style={{ position: "absolute", left: wait.x, top: wait.y, width: wait.w, height: wait.h, visibility: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, transformOrigin: "50% 100%" }}>{img(wait.im, 0, 0, wait.w, wait.h)}</div>
      </div>
      <div
        ref={pipoRefs.peek}
        style={{ position: "absolute", left: peek.x, top: peek.y, width: peek.w, height: peek.h, overflow: "hidden", visibility: "hidden" }}
      >
        <div ref={pipoRefs.peekIn} style={{ position: "absolute", inset: 0 }}>
          <div style={{ position: "absolute", inset: 0, transformOrigin: "50% 95%" }}>{img(peek.im, 0, 0, peek.w, peek.h)}</div>
        </div>
      </div>
      <div ref={pipoRefs.cheer} style={{ position: "absolute", left: cheer.x, top: cheer.y, width: cheer.w, height: cheer.h, visibility: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, transformOrigin: "50% 100%" }}>{img(cheer.im, 0, 0, cheer.w, cheer.h)}</div>
      </div>

      {/* 字の台（リボン・銘板） */}
      {plateImg && L.plate && img(plateImg, L.plate.x, L.plate.y, L.plate.w, L.plate.h)}
      {/* 字。いまの額（大）と目標（小）を1行に、その下に旅の名前 */}
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
          lineHeight: 1.08,
          whiteSpace: "nowrap",
          pointerEvents: "none",
          ...(L.labelFirst ? { flexDirection: "column-reverse" } : {}),
        }}
      >
        <div style={{ fontWeight: 900 }}>
          {/* data-ink は字の濃さを測る道具の目印（tools/sprites/alert-bankink.mjs） */}
          <span
            ref={amountRef}
            data-ink="fill"
            style={{ fontSize: P * L.font.amount, ...tone(theme.text.center, Math.max(1.5, P * 0.0075)) }}
          >
            {fmt(currentAmount)}
          </span>
          <span data-ink="fill" style={{ fontSize: P * L.font.target, fontWeight: 800, ...tone(theme.text.top, Math.max(1.2, P * 0.006)) }}>
            {` / ${fmt(targetAmount)}`}
          </span>
        </div>
        <div data-ink="fill" style={{ fontSize: P * L.font.label, fontWeight: 800, ...tone(theme.text.bottom, Math.max(1.2, P * 0.006)) }}>
          {label}
        </div>
      </div>
    </div>
  );
};
