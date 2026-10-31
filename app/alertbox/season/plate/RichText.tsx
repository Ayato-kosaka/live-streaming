/**
 * アラートの字（名前・額・メッセージ）。**背景の箱を持たない**。字そのものを太い縁取りと影で
 * 読めるようにし、段が上がるほど縁を太く光らせる（オーナーの指摘 2026-10-24: 字はキャラ絵の
 * 上下中央に重ね、札の箱は使わない。今の字は小さく、明るい地・キャラ絵の柄の上で読みにくい）。
 *
 * - 縁取りは字を2〜3枚重ねて描く（奥ほど太い縁）。いちばん手前が字の色、その下に濃い縁、
 *   段7はさらに外に金の縁と光。`paint-order: stroke fill` に頼らない（古い WebView でも同じ形）
 * - 額は段の色のグラデーション。出るときは1字ずつ弾む。段7は額を数え上げて「ドン」
 * - 大きさは面の幅に比例し、どの段も季節の外も同じ（2版目。オーナー「大きいので下げて。元々の
 *   サイズのちょい上くらい。本文は見切れないこと」）。元は名前・額の行 20px・メッセージ 16px（固定）で、
 *   いまは箱の幅 436 のとき名前・額の行 ≒ 24px・メッセージ ≒ 18px。額だけ行の 1.15 倍
 * - **メッセージは全文を折り返して出す**（行数で切らない・… にしない）。長くて箱に収まらないときだけ、
 *   メッセージの字を収まる大きさまで縮める（`maxH`）。名前も切らない（入らなければ縮めて、さらに折り返す）
 * - 季節の外は `plain`（弾まない・グラデーションなし・光なし）で、色は設定（config.ts）の色
 *
 * 置き場所（キャラ絵の上下中央）は index.tsx。振付けはこの箱（`data-plate="box"`）の位置を測る。
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PlateStyle } from "../../themes";
import type { PlateLines, PlateSeg } from "./plateText";

type Props = {
  plate: PlateStyle;
  lines: PlateLines;
  message: string;
  /** アラートの面の幅（px） */
  W: number;
  /** 字が出る秒 */
  appearAt: number;
  /** こうもりが運んでくる（上から落ちてきて揺れる）。字は弾まない */
  carried?: boolean;
  /** 振付けが左から広げる（段4 は杖の光で書く）。閉じた形で待ち、字は弾まない */
  wipe?: "write" | null;
  /** 数え上げ（秒）。無ければ額は最初から出ている */
  count?: { at: number; dur: number } | null;
  /** 「ドン」の秒 */
  donAt?: number | null;
  /** 飾り無し（季節の外）。弾まず、グラデーションも光も無い */
  plain?: boolean;
  /** 字のブロックが使ってよい高さ（px）。メッセージが長くて超えるときだけ、メッセージの字を縮める */
  maxH?: number;
};

/** 字の幅のざっくりした見積もり（em）。全角 1、数字・記号・英字 0.6 */
export function emWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += /[\u0000-ÿ]/.test(ch) ? 0.6 : 1;
  return w;
}
/** 名前・額の行の字の大きさ（面の幅 1080 のときの px。幅 436 で 24px） */
const LINE_SIZE = 59.5;
/** 額の数字だけ、行の何倍か（強調） */
const AMOUNT_K = 1.15;
/** 単位・語尾の字の大きさ（額の何倍か）。行の大きさに戻す */
const UNIT_K = 1 / AMOUNT_K;
const TAIL_K = 1 / AMOUNT_K;
/** 字の塊の幅（面の幅に対する割合） */
const BLOCK_W = 0.94;
/** メッセージの字の大きさ（面の幅 1080 のときの px。幅 436 で 18px） */
const MSG_SIZE = 44.6;
/** 長いメッセージで縮めるときの下限（元の何倍まで） */
const MSG_MIN_K = 0.55;
const FONT = "'Kosugi Maru', 'M PLUS Rounded 1c', 'Hiragino Maru Gothic ProN', sans-serif";

/** 縁の重ね（外から）。em で太さ、色、光 */
type Rim = { w: number; color: string; glow?: string };

function rimsOf(p: PlateStyle, plain: boolean): Rim[] {
  const dark: Rim = { w: p.stroke, color: p.ink };
  if (plain) return [dark];
  if (p.frame === "gold") {
    // 段7: 金の縁（外）と濃い縁（内）。金の縁は光る
    return [{ w: p.stroke + 0.12, color: "#F4C24E", glow: `0 0 0.28em rgba(255,214,90,${0.6 + 0.4 * p.glow})` }, dark];
  }
  return [{ ...dark, glow: p.glow > 0 ? `0 0 ${(0.12 + 0.2 * p.glow).toFixed(2)}em ${withAlpha(p.edge, 0.35 + 0.5 * p.glow)}` : undefined }];
}

function withAlpha(hex: string, a: number) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(2)})`;
}

/** 影（縁のいちばん外の層にだけ付ける） */
const DROP = "0 0.07em 0.08em rgba(0,0,0,0.55)";

/**
 * 1つの字（か字の並び）を、縁の層を重ねて描く。いちばん下の層だけが場所を取り、ほかは重ねる
 */
const Inked: React.FC<{
  text: string;
  rims: Rim[];
  fill: React.CSSProperties;
  spanRef?: (el: HTMLSpanElement | null) => void;
  textRefs?: (el: HTMLSpanElement | null, i: number) => void;
  style?: React.CSSProperties;
}> = ({ text, rims, fill, spanRef, textRefs, style }) => (
  <span ref={spanRef} style={{ position: "relative", display: "inline-block", ...style }}>
    {rims.map((r, i) => (
      <span
        key={i}
        aria-hidden
        ref={(el) => textRefs?.(el, i)}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          color: r.color,
          WebkitTextStroke: `${r.w}em ${r.color}`,
          textShadow: [i === 0 ? DROP : null, r.glow ?? null].filter(Boolean).join(", ") || undefined,
          pointerEvents: "none",
        }}
      >
        {text}
      </span>
    ))}
    <span data-ink="fill" ref={(el) => textRefs?.(el, rims.length)} style={{ position: "relative", ...fill }}>
      {text}
    </span>
  </span>
);

export const RichText: React.FC<Props> = ({
  plate,
  lines,
  message,
  W,
  appearAt,
  carried,
  wipe,
  count,
  donAt,
  plain = false,
  maxH,
}) => {
  const k = W / 1080;
  const boxRef = useRef<HTMLDivElement | null>(null);
  const charRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const amountRowRef = useRef<HTMLDivElement | null>(null);
  const flashRef = useRef<HTMLDivElement | null>(null);
  const msgRef = useRef<HTMLDivElement | null>(null);
  const amountTextRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const rims = useMemo(() => rimsOf(plate, plain), [plate, plain]);
  const msgRims = useMemo<Rim[]>(() => [{ w: Math.max(0.16, plate.stroke + 0.02), color: plate.ink }], [plate]);

  const innerW = W * BLOCK_W;
  /* 名前・額が長いと面からはみ出すので、入る大きさまで縮める（下限は 6 割） */
  const nameText = lines.name.map((s) => s.text).join("");
  const nameSize = Math.max(LINE_SIZE * k * 0.7, Math.min(LINE_SIZE * k, innerW / Math.max(1, emWidth(nameText) * 1.1)));
  const amountSize = useMemo(() => {
    let em = 0;
    for (const s of lines.amount) em += emWidth(s.text) * (s.kind === "amount" ? 1 : s.kind === "unit" ? UNIT_K : TAIL_K);
    return Math.max(LINE_SIZE * k * 0.6, Math.min(LINE_SIZE * AMOUNT_K * k, innerW / Math.max(1, em * 1.12)));
  }, [lines.amount, k, innerW]);
  /* 長いメッセージ: 置いてみて、使ってよい高さを超えたらメッセージの字だけ縮める（下限 MSG_MIN_K）。
     字の量で見積もると、折り返しの位置と絵文字の幅でずれる */
  const [msgK, setMsgK] = useState(1);
  useLayoutEffect(() => {
    const box = boxRef.current;
    const msg = msgRef.current;
    if (!box || !msg || !maxH || msgK <= MSG_MIN_K) return;
    const over = box.offsetHeight - maxH;
    if (over <= 0) return;
    const mh = msg.offsetHeight || 1;
    // メッセージの高さは字の大きさのほぼ2乗で縮む（行の高さ × 行数）
    const want = Math.max(MSG_MIN_K, msgK * Math.sqrt(Math.max(0.05, (mh - over) / mh)) * 0.98);
    if (want < msgK - 0.01) setMsgK(want);
  }, [msgK, maxH, message, W]);

  const amountSeg = lines.amount.find((s): s is Extract<PlateSeg, { kind: "amount" }> => s.kind === "amount");
  const countUp = !!count && !plain;
  const bounce = !plain && !carried && !wipe;

  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof box.animate !== "function") return;
    const anims: Animation[] = [];
    const play = (el: Element | null, f: Keyframe[], o: KeyframeAnimationOptions) => {
      if (el) anims.push((el as HTMLElement).animate(f, o));
    };
    const ms = (s: number) => s * 1000;
    let lastAt = appearAt;
    if (wipe) {
      // 広げるのは振付け。ここでは動かさない（閉じた形は下の style）
    } else if (carried) {
      // 上から運ばれてきて、掛かったところで振り子のように揺れて止まる
      play(box, [
        { transform: "translateY(-42vh) rotate(-4deg)", opacity: 0, offset: 0 },
        { transform: "translateY(-40vh) rotate(-4deg)", opacity: 1, offset: 0.03, easing: "cubic-bezier(0.3, 0, 0.6, 1)" },
        { transform: "translateY(0px) rotate(3deg)", offset: 0.5, easing: "ease-in-out" },
        { transform: "translateY(0px) rotate(-2deg)", offset: 0.7, easing: "ease-in-out" },
        { transform: "translateY(0px) rotate(1deg)", offset: 0.85, easing: "ease-in-out" },
        { transform: "translateY(0px) rotate(0deg)" },
      ], { duration: 1100, delay: ms(appearAt), fill: "backwards" });
    } else if (bounce) {
      // 1字ずつ、上から落ちて弾む
      charRefs.current.forEach((el, i) => {
        const d = ms(appearAt) + i * 28;
        lastAt = Math.max(lastAt, d / 1000);
        play(el, [
          { transform: "translateY(-0.45em) scale(0.3)", opacity: 0, easing: "cubic-bezier(0.3, 0.9, 0.4, 1)" },
          { transform: "translateY(0.06em) scale(1.12)", opacity: 1, offset: 0.6, easing: "ease-in-out" },
          { transform: "translateY(0em) scale(1)", opacity: 1 },
        ], { duration: 440, delay: d, fill: "backwards" });
      });
    } else {
      play(box, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: ms(appearAt), fill: "backwards" });
    }
    // メッセージは名前と額のあとに、ふわっと
    play(msgRef.current, [
      { opacity: 0, transform: "translateY(0.3em)" },
      { opacity: 1, transform: "translateY(0em)" },
    ], { duration: 360, delay: ms(lastAt) + (bounce ? 260 : 0), fill: "backwards", easing: "ease-out" });
    if (donAt != null && !plain) {
      play(amountRowRef.current, [
        { transform: "scale(1)", easing: "cubic-bezier(0.2, 0.9, 0.3, 1)" },
        { transform: "scale(1.3)", offset: 0.22, easing: "ease-in-out" },
        { transform: "scale(0.95)", offset: 0.5, easing: "ease-in-out" },
        { transform: "scale(1.03)", offset: 0.75, easing: "ease-in-out" },
        { transform: "scale(1)" },
      ], { duration: 520, delay: ms(donAt) });
      play(flashRef.current, [{ opacity: 0 }, { opacity: 0.9, offset: 0.15 }, { opacity: 0 }], { duration: 560, delay: ms(donAt) });
    }
    // 数え上げ: 0 から額まで、止まった瞬間が「ドン」
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (countUp && amountSeg && typeof requestAnimationFrame === "function") {
      const set = (v: number) => {
        const t = Math.round(v).toLocaleString("ja-JP");
        amountTextRefs.current.forEach((el) => {
          if (el) el.textContent = t;
        });
      };
      set(0);
      timer = setTimeout(() => {
        const t0 = performance.now();
        const dur = ms(count!.dur);
        const tick = () => {
          const u = Math.min(1, (performance.now() - t0) / dur);
          set(amountSeg.value * (1 - Math.pow(1 - u, 3)));
          if (u < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      }, ms(count!.at));
    }
    return () => {
      anims.forEach((a) => a.cancel());
      if (raf) cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
    };
    // 通知1件につき1回
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 1字ずつの箱（弾ませる単位）。空白は詰まらないように
  let ci = 0;
  const chars = (text: string, fill: React.CSSProperties, size?: number) =>
    [...text].map((ch, i) => {
      const idx = ci++;
      return (
        <Inked
          key={`${idx}-${i}`}
          text={ch === " " ? " " : ch}
          rims={rims}
          fill={fill}
          style={size ? { fontSize: size } : undefined}
          spanRef={(el) => {
            charRefs.current[idx] = el;
          }}
        />
      );
    });

  const grad: React.CSSProperties = plain
    ? { color: plate.amountColor }
    : {
        color: "transparent",
        backgroundImage: `linear-gradient(180deg, ${plate.amountColor} 18%, ${plate.amountColor2 ?? plate.amountColor} 88%)`,
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
      };

  return (
    <div
      ref={boxRef}
      data-plate="box"
      style={{
        position: "relative",
        boxSizing: "border-box",
        maxWidth: innerW,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        fontFamily: FONT,
        fontWeight: 800,
        lineHeight: 1.12,
        padding: `${6 * k}px ${10 * k}px`,
        transformOrigin: carried ? "50% 0%" : "50% 50%",
        willChange: "transform",
        clipPath: wipe ? "inset(-40% 100% -40% 0%)" : undefined,
        pointerEvents: "none",
      }}
    >
      <div style={{ fontSize: nameSize, maxWidth: innerW, overflowWrap: "anywhere" }}>
        {lines.name.map((s, i) =>
          s.kind === "name"
            ? <React.Fragment key={i}>{chars(s.text, { color: plate.nameColor })}</React.Fragment>
            : <React.Fragment key={i}>{chars(s.text, { color: plate.textColor ?? plate.nameColor }, nameSize * 0.78)}</React.Fragment>
        )}
      </div>
      {lines.amount.length > 0 && (
        <div
          ref={amountRowRef}
          style={{ position: "relative", fontSize: amountSize, whiteSpace: "nowrap", display: "flex", alignItems: "baseline", justifyContent: "center", transformOrigin: "50% 60%" }}
        >
          {/* ドンの光（箱ではなく、額の後ろでふわっと光るだけ） */}
          <div
            ref={flashRef}
            aria-hidden
            style={{
              position: "absolute",
              left: "-20%",
              right: "-20%",
              top: "-40%",
              bottom: "-40%",
              background: `radial-gradient(ellipse at 50% 55%, ${withAlpha(plate.edge, 0.9)}, ${withAlpha(plate.edge, 0.25)} 45%, rgba(0,0,0,0) 72%)`,
              opacity: 0,
              pointerEvents: "none",
            }}
          />
          {lines.amount.map((s, i) => {
            if (s.kind === "amount") {
              return countUp ? (
                <Inked
                  key={i}
                  text={s.text}
                  rims={rims}
                  fill={grad}
                  textRefs={(el, j) => {
                    amountTextRefs.current[j] = el;
                  }}
                />
              ) : (
                <React.Fragment key={i}>{chars(s.text, grad)}</React.Fragment>
              );
            }
            const f = s.kind === "unit" ? UNIT_K : TAIL_K;
            const fill = s.kind === "unit" ? grad : { color: plate.textColor ?? plate.nameColor };
            return (
              <span key={i} style={{ fontSize: `${f}em`, marginLeft: s.kind === "text" ? "0.25em" : undefined }}>
                {chars(s.text, fill)}
              </span>
            );
          })}
        </div>
      )}
      {!!message && (
        <div
          ref={msgRef}
          style={{
            position: "relative",
            marginTop: `${0.25 * MSG_SIZE * k}px`,
            fontSize: MSG_SIZE * k * msgK,
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            lineHeight: 1.28,
            maxWidth: innerW,
            fontWeight: 700,
          }}
        >
          {msgRims.map((r, i) => (
            <div
              key={i}
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                color: r.color,
                WebkitTextStroke: `${r.w}em ${r.color}`,
                textShadow: DROP,
              }}
            >
              {message}
            </div>
          ))}
          <div data-ink="fill" style={{ position: "relative", color: plate.textColor ?? "#FFFFFF" }}>
            {message}
          </div>
        </div>
      )}
    </div>
  );
};

