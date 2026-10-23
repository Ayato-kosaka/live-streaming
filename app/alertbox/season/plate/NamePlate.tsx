/**
 * 名前の札。いまの小さな字（画面の真ん中、キャラ絵の顔の上）の置き換え。
 *
 * - 置き場所は画面の**上から 30%** から下へ。その人のキャラ絵（下 2/3）の頭の上で、
 *   顔に字を重ねない（設計書 §3.0）
 * - 1行目「◯◯ 様」、2行目「¥20,000 ありやとう！！」（いまの文面の型を2行に割る。`plateText.ts`）、
 *   その下にメッセージ（小さく、最大3行）
 * - 段4は金の額縁。額は 0 から**回る数字**で数え上がり、止まった瞬間に「ドン」
 * - 字の大きさは画面の幅 1080 のときの px（`PlateStyle`）を、幅に比例させる
 *
 * 時刻（出る・数え始める・ドン）は台本から受け取る。動きは Web Animations（transform と
 * opacity だけ）で、出たあとは何も動かない。
 */
import React, { useEffect, useMemo, useRef } from "react";
import type { PlateStyle } from "../../themes";
import type { PlateLines, PlateSeg } from "./plateText";

type Props = {
  plate: PlateStyle;
  lines: PlateLines;
  message: string;
  /** アラートの面の大きさ（px） */
  W: number;
  H: number;
  /** 札が出る秒 */
  appearAt: number;
  /** こうもりが運んでくる（上から落ちてきて揺れる）か、その場でぽんっと出るか */
  carried?: boolean;
  /** 数え上げ（秒）。無ければ額は最初から出ている */
  count?: { at: number; dur: number } | null;
  /** 「ドン」の秒 */
  donAt?: number | null;
};

/** 字の幅のざっくりした見積もり（em）。全角 1、数字・記号・英字 0.6 */
const emWidth = (s: string) =>
  [...s].reduce((w, ch) => w + (/[\x20-\x7e]/.test(ch) ? 0.6 : 1), 0);

/** 2行目の中の、額以外の字の大きさ（額に対する比） */
const UNIT_K = 0.72;
const TAIL_K = 0.46;

export const NamePlate: React.FC<Props> = ({
  plate,
  lines,
  message,
  W,
  H,
  appearAt,
  carried,
  count,
  donAt,
}) => {
  const k = W / 1080;
  const boxRef = useRef<HTMLDivElement | null>(null);
  const amountRowRef = useRef<HTMLDivElement | null>(null);
  const flashRef = useRef<HTMLDivElement | null>(null);
  const stripRefs = useRef<(HTMLDivElement | null)[]>([]);

  const innerW = W * 0.84 - 64 * k;
  /* 名前が長いと札からはみ出すので、入る大きさまで縮める（下限は 6 割） */
  const nameText = lines.name.map((s) => s.text).join("");
  const nameSize = Math.max(
    plate.nameSize * k * 0.6,
    Math.min(plate.nameSize * k, innerW / Math.max(1, emWidth(nameText) * 1.02))
  );
  const amountSize = useMemo(() => {
    let em = 0;
    for (const s of lines.amount) {
      const f = s.kind === "amount" ? 1 : s.kind === "unit" ? UNIT_K : TAIL_K;
      em += emWidth(s.text) * f;
    }
    return Math.max(plate.amountSize * k * 0.55, Math.min(plate.amountSize * k, innerW / Math.max(1, em * 1.04)));
  }, [lines.amount, plate.amountSize, k, innerW]);

  const gold = plate.frame === "gold";
  const ink = gold ? "#2A0208" : "#08060E";
  const outline = (w: number) =>
    [
      `${w}px 0 0 ${ink}`,
      `-${w}px 0 0 ${ink}`,
      `0 ${w}px 0 ${ink}`,
      `0 -${w}px 0 ${ink}`,
      `${w * 0.72}px ${w * 0.72}px 0 ${ink}`,
      `-${w * 0.72}px ${w * 0.72}px 0 ${ink}`,
      `${w * 0.72}px -${w * 0.72}px 0 ${ink}`,
      `-${w * 0.72}px -${w * 0.72}px 0 ${ink}`,
    ].join(", ");

  // 額の桁。回る数字の列ごとに、何周してから止まるか（右ほど多く回る）
  const amountSeg = lines.amount.find((s): s is Extract<PlateSeg, { kind: "amount" }> => s.kind === "amount");
  const digits = amountSeg ? [...amountSeg.text] : [];
  const digitCols = digits.filter((c) => /\d/.test(c)).length;

  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof box.animate !== "function") return;
    const anims: Animation[] = [];
    const play = (el: Element | null, f: Keyframe[], o: KeyframeAnimationOptions) => {
      if (el) anims.push((el as HTMLElement).animate(f, o));
    };
    const ms = (s: number) => s * 1000;
    if (carried) {
      // 上から運ばれてきて、掛かったところで振り子のように揺れて止まる
      play(box, [
        { transform: `translateY(${-H * 0.42}px) rotate(-4deg)`, opacity: 0, offset: 0 },
        { transform: `translateY(${-H * 0.4}px) rotate(-4deg)`, opacity: 1, offset: 0.03, easing: "cubic-bezier(0.3, 0, 0.6, 1)" },
        { transform: "translateY(0px) rotate(3deg)", offset: 0.5, easing: "ease-in-out" },
        { transform: "translateY(0px) rotate(-2deg)", offset: 0.7, easing: "ease-in-out" },
        { transform: "translateY(0px) rotate(1deg)", offset: 0.85, easing: "ease-in-out" },
        { transform: "translateY(0px) rotate(0deg)" },
      ], { duration: 1100, delay: ms(appearAt), fill: "backwards" });
    } else {
      play(box, [
        { transform: "scale(0.6)", opacity: 0, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
        { transform: "scale(1.08)", opacity: 1, offset: 0.65, easing: "ease-out" },
        { transform: "scale(1)", opacity: 1 },
      ], { duration: 450, delay: ms(appearAt), fill: "backwards" });
    }
    // 回る数字。0 から回り始めて、右の桁ほど多く回って、同時に止まる
    if (count) {
      stripRefs.current.forEach((el, i) => {
        if (!el) return;
        const d = Number(el.dataset.d);
        const turns = 1 + (digitCols - 1 - i);
        const idx = turns * 10 + d;
        play(el, [
          { transform: "translateY(0em)" },
          { transform: `translateY(${-idx}em)` },
        ], {
          duration: ms(count.dur),
          delay: ms(count.at),
          easing: "cubic-bezier(0.12, 0.55, 0.2, 1)",
          fill: "both",
        });
      });
    }
    if (donAt != null) {
      play(amountRowRef.current, [
        { transform: "scale(1)", easing: "cubic-bezier(0.2, 0.9, 0.3, 1)" },
        { transform: "scale(1.32)", offset: 0.22, easing: "ease-in-out" },
        { transform: "scale(0.95)", offset: 0.5, easing: "ease-in-out" },
        { transform: "scale(1.03)", offset: 0.75, easing: "ease-in-out" },
        { transform: "scale(1)" },
      ], { duration: 520, delay: ms(donAt) });
      play(flashRef.current, [
        { opacity: 0 },
        { opacity: 0.85, offset: 0.15 },
        { opacity: 0 },
      ], { duration: 520, delay: ms(donAt) });
    }
    return () => anims.forEach((a) => a.cancel());
    // 通知1件につき1回
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const frameStyle: React.CSSProperties = gold
    ? {
        border: `${7 * k}px solid ${plate.edge}`,
        borderRadius: 16 * k,
        boxShadow: `inset 0 0 0 ${3 * k}px #7A4A08, inset 0 0 0 ${7 * k}px rgba(255,228,140,0.55), 0 ${6 * k}px ${18 * k}px rgba(0,0,0,0.45)`,
      }
    : {
        border: `${5 * k}px solid ${plate.edge}`,
        borderRadius: 44 * k,
        boxShadow: `0 ${5 * k}px ${14 * k}px rgba(0,0,0,0.4)`,
      };

  let col = 0;
  const amountNodes = lines.amount.map((s, i) => {
    if (s.kind === "amount") {
      return (
        <span key={i} style={{ color: plate.amountColor, display: "inline-flex", alignItems: "flex-end" }}>
          {digits.map((ch, j) => {
            if (!/\d/.test(ch) || !count) {
              return (
                <span key={j} style={{ display: "inline-block" }}>
                  {ch}
                </span>
              );
            }
            const ci = col++;
            const turns = 1 + (digitCols - 1 - ci);
            return (
              <span
                key={j}
                style={{ display: "inline-block", height: "1em", overflow: "hidden", lineHeight: 1, verticalAlign: "bottom" }}
              >
                <div
                  ref={(el) => {
                    stripRefs.current[ci] = el;
                  }}
                  data-d={ch}
                  style={{ display: "flex", flexDirection: "column", willChange: "transform" }}
                >
                  {Array.from({ length: turns * 10 + Number(ch) + 1 }, (_, n) => (
                    <span key={n} style={{ height: "1em", lineHeight: 1, display: "block", textAlign: "center" }}>
                      {n % 10}
                    </span>
                  ))}
                </div>
              </span>
            );
          })}
        </span>
      );
    }
    const f = s.kind === "unit" ? UNIT_K : TAIL_K;
    return (
      <span
        key={i}
        style={{
          fontSize: `${f}em`,
          color: s.kind === "unit" ? plate.amountColor : "#FFFFFF",
          marginLeft: s.kind === "text" ? "0.25em" : undefined,
        }}
      >
        {s.text}
      </span>
    );
  });

  return (
    <div
      style={{
        position: "absolute",
        left: W * 0.08,
        width: W * 0.84,
        top: H * 0.3,
        pointerEvents: "none",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        ref={boxRef}
        data-plate="box"
        style={{
          position: "relative",
          boxSizing: "border-box",
          maxWidth: "100%",
          padding: `${16 * k}px ${32 * k}px ${18 * k}px`,
          background: plate.bg,
          textAlign: "center",
          fontFamily: "'Kosugi Maru', sans-serif",
          fontWeight: 800,
          transformOrigin: carried ? "50% 0%" : "50% 50%",
          willChange: "transform",
          ...frameStyle,
        }}
      >
        <div
          style={{
            fontSize: nameSize,
            lineHeight: 1.15,
            color: plate.nameColor,
            whiteSpace: "nowrap",
            textShadow: outline(Math.max(2, 4 * k)),
          }}
        >
          {lines.name.map((s, i) =>
            s.kind === "name" ? (
              <span key={i}>{s.text}</span>
            ) : (
              <span key={i} style={{ fontSize: "0.72em", marginLeft: "0.2em" }}>
                {s.text}
              </span>
            )
          )}
        </div>
        {lines.amount.length > 0 && (
          <div
            ref={amountRowRef}
            style={{
              fontSize: amountSize,
              lineHeight: 1.12,
              whiteSpace: "nowrap",
              textShadow: outline(Math.max(2, 5 * k)),
              display: "flex",
              justifyContent: "center",
              alignItems: "baseline",
              transformOrigin: "50% 60%",
            }}
          >
            {amountNodes}
          </div>
        )}
        {!!message && (
          <div
            style={{
              marginTop: 6 * k,
              fontSize: 36 * k,
              lineHeight: 1.3,
              color: "#FFFFFF",
              fontWeight: 400,
              textShadow: outline(Math.max(1.5, 3 * k)),
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              wordBreak: "break-all",
            }}
          >
            {message}
          </div>
        )}
        {gold && <GoldCorners k={k} color={plate.edge} />}
        <div
          ref={flashRef}
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "inherit",
            background: "radial-gradient(ellipse at 50% 60%, rgba(255,240,170,0.95), rgba(255,200,60,0.3) 60%, rgba(255,200,60,0) 80%)",
            opacity: 0,
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
};

/** 金の額縁の四隅の飾り（菱形）と、上の真ん中の飾り */
const GoldCorners: React.FC<{ k: number; color: string }> = ({ k, color }) => {
  const s = 26 * k;
  const gem = (style: React.CSSProperties, key: string) => (
    <div
      key={key}
      style={{
        position: "absolute",
        width: s,
        height: s,
        background: `linear-gradient(135deg, #FFF3BF, ${color} 45%, #9A5A06)`,
        border: `${2 * k}px solid #5A2A00`,
        transform: "rotate(45deg)",
        ...style,
      }}
    />
  );
  const o = -s * 0.62;
  return (
    <>
      {gem({ left: o, top: o }, "tl")}
      {gem({ right: o, top: o }, "tr")}
      {gem({ left: o, bottom: o }, "bl")}
      {gem({ right: o, bottom: o }, "br")}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: -s * 1.05,
          width: s * 1.6,
          height: s * 1.6,
          marginLeft: -s * 0.8,
          borderRadius: "50%",
          background: `radial-gradient(circle at 35% 35%, #FFF6CC, ${color} 55%, #8A4A00)`,
          border: `${2 * k}px solid #5A2A00`,
        }}
      />
    </>
  );
};
