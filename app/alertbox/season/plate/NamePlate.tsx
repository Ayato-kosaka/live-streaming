/**
 * 名前の札。いまの小さな字（画面の真ん中、キャラ絵の顔の上）の置き換え。
 *
 * - 置き場所は面のいちばん上の札の枠（index.tsx）。札は流れの中に置き（高さは字で決まる）、
 *   その人のキャラ絵は札の下の残りに収める（`CharBox`）。**字とキャラ絵は1画素も重ねない**
 *   （オーナーの決まり。字が顔に乗るのは厳禁）
 * - 1行目「◯◯ 様」、2行目「¥20,000 ありやとう！！」（いまの文面の型を2行に割る。`plateText.ts`）、
 *   その下にメッセージ（小さく、最大3行）
 * - 段7は金の額縁。絵の担当の切れ端（角・辺の飾り・伸ばす棒。小物の組の `items` と `frame`）で
 *   組む。読めなければ線と菱形の飾りで代える。額は 0 から**回る数字**で数え上がり、止まった瞬間に「ドン」
 * - 字の大きさは画面の幅 1080 のときの px（`PlateStyle`）を、幅に比例させる
 *
 * 時刻（出る・数え始める・ドン）は台本から受け取る。動きは Web Animations（transform と
 * opacity だけ）で、出たあとは何も動かない。
 */
import React, { useEffect, useMemo, useRef } from "react";
import type { PlateStyle } from "../../themes";
import type { PlateLines, PlateSeg } from "./plateText";
import type { LoadedRig } from "../rig/RigView";

type KitImg = { url: string; w: number; h: number };
/** 金の額縁の切れ端（絵の px）。角は左上の形で、ほかの角は反転して使う */
export type FrameKit = {
  corner: KitImg;
  edgeH: KitImg;
  barH: KitImg;
  barV: KitImg;
  /** 角の絵の中の、縦の腕・横の腕の中心線 */
  armX: number;
  armY: number;
  /** 横の棒・縦の棒の絵の中の、棒の中心線 */
  barCY: number;
  barCX: number;
};

/** 小物の組から額縁の切れ端を拾う。どれか欠けていれば null（線の額縁で代える） */
export function frameKitOf(rig: LoadedRig | null | undefined): FrameKit | null {
  if (!rig) return null;
  const { items, frame } = rig.def;
  const img = (name: string): KitImg | null => {
    const f = items[name];
    const im = f ? rig.images.get(f) : undefined;
    return im ? { url: im.url, w: im.width, h: im.height } : null;
  };
  const corner = img("frameCorner");
  const edgeH = img("frameEdgeH");
  const barH = img("frameBarH");
  const barV = img("frameBarV");
  const n = (k: string) => (Number.isFinite(frame[k]) ? frame[k] : null);
  const armX = n("cornerArmX");
  const armY = n("cornerArmY");
  const barCY = n("barCenterY");
  const barCX = n("barCenterX");
  if (!corner || !edgeH || !barH || !barV || armX == null || armY == null || barCY == null || barCX == null) return null;
  return { corner, edgeH, barH, barV, armX, armY, barCY, barCX };
}

/** 額縁の切れ端を、画面の幅 1080 のとき何倍で置くか（絵は幅 900 の札に組む大きさで描いてある） */
const KIT_SCALE = 0.8;

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
  /** 金の額縁の切れ端（段7）。無ければ線と菱形の飾り */
  kit?: FrameKit | null;
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
  kit,
}) => {
  const k = W / 1080;
  const boxRef = useRef<HTMLDivElement | null>(null);
  const amountRowRef = useRef<HTMLDivElement | null>(null);
  const flashRef = useRef<HTMLDivElement | null>(null);
  const stripRefs = useRef<(HTMLDivElement | null)[]>([]);

  // 切れ端の額縁は左右の余白を広く取る（下の padding と同じ数）
  const innerW = W * 0.84 - (plate.frame === "gold" && kit ? 128 : 64) * k;
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
  const useKit = gold && !!kit;
  const ks = KIT_SCALE * k;
  /* 額縁の切れ端は札の縁からはみ出す（棒の中心線が縁に来る・角は外へ張り出す）。はみ出すぶんを
     札の枠の高さに入れておく。入れないと、枠のすぐ下に置くキャラ絵の頭に下の棒と角が乗る */
  const over = useKit && kit ? kitOverhang(kit, ks) : { top: 0, bottom: 0 };
  const ink = plate.ink;
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
        // 画面の高さに対する割合（vh）で書く。途中で箱の大きさが変わっても、古い高さを握らない
        { transform: "translateY(-42vh) rotate(-4deg)", opacity: 0, offset: 0 },
        { transform: "translateY(-40vh) rotate(-4deg)", opacity: 1, offset: 0.03, easing: "cubic-bezier(0.3, 0, 0.6, 1)" },
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

  const frameStyle: React.CSSProperties = useKit
    ? {
        // 縁は切れ端の棒が受け持つ（棒の中心線が札の縁に来る）。角と飾りがぶつからない幅を取る
        borderRadius: 6 * k,
        minWidth: Math.min(W * 0.84, 780 * ks),
        boxShadow: `0 ${6 * k}px ${18 * k}px rgba(0,0,0,0.45)`,
      }
    : gold
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
        position: "relative",
        width: W * 0.84,
        maxWidth: "100%",
        pointerEvents: "none",
        display: "flex",
        justifyContent: "center",
        paddingTop: over.top,
        paddingBottom: over.bottom,
        boxSizing: "content-box",
      }}
    >
      <div
        ref={boxRef}
        data-plate="box"
        style={{
          position: "relative",
          boxSizing: "border-box",
          maxWidth: "100%",
          // 切れ端の額縁は角の飾りが内側へ張り出すので、字を内へ寄せる
          padding: useKit ? `${30 * k}px ${64 * k}px ${30 * k}px` : `${16 * k}px ${32 * k}px ${18 * k}px`,
          background: plate.bg,
          textAlign: "center",
          fontFamily: "'Kosugi Maru', sans-serif",
          fontWeight: 800,
          /* ぽんっと出るときは下の辺を据えて膨らませる（真ん中から膨らむと、下の辺がすぐ下の
             キャラ絵の頭へはみ出す）。運ばれてくる札は上の辺から吊るす */
          transformOrigin: carried ? "50% 0%" : "50% 100%",
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
              <span key={i} style={{ fontSize: "0.8em", marginLeft: "0.2em" }}>
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
        {useKit && kit ? <KitFrame kit={kit} s={ks} /> : gold && <GoldCorners k={k} color={plate.edge} />}
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

/** 額縁の切れ端が札の上下の縁から外へはみ出す量（px）。棒・辺の飾り・角のうちいちばん大きいもの */
export function kitOverhang(kit: FrameKit, s: number): { top: number; bottom: number } {
  const { edgeH, barH, armY, barCY } = kit;
  return {
    top: Math.max(barCY, armY) * s,
    bottom: Math.max(barH.h - barCY, edgeH.h - barCY, armY) * s,
  };
}

/**
 * 絵の担当の切れ端で組む金の額縁。棒（伸ばす）→ 辺の飾り → 角 の順に重ねる。
 * 札の大きさは字で決まるので、置き場所は % と calc で書き、札が変わってもついて行く
 */
const KitFrame: React.FC<{ kit: FrameKit; s: number }> = ({ kit, s }) => {
  const { corner, edgeH, barH, barV, armX, armY, barCY, barCX } = kit;
  const base: React.CSSProperties = { position: "absolute", pointerEvents: "none" };
  const bg = (im: KitImg): React.CSSProperties => ({
    backgroundImage: `url(${im.url})`,
    backgroundSize: "100% 100%",
    backgroundRepeat: "no-repeat",
  });
  const flip = (x: boolean, y: boolean) => `scale(${x ? -1 : 1}, ${y ? -1 : 1})`;
  return (
    <>
      {/* 上下の棒・左右の棒 */}
      <div style={{ ...base, ...bg(barH), left: 0, right: 0, top: -barCY * s, height: barH.h * s }} />
      <div style={{ ...base, ...bg(barH), left: 0, right: 0, top: `calc(100% - ${barCY * s}px)`, height: barH.h * s }} />
      <div style={{ ...base, ...bg(barV), top: 0, bottom: 0, left: -barCX * s, width: barV.w * s }} />
      <div style={{ ...base, ...bg(barV), top: 0, bottom: 0, left: `calc(100% - ${barCX * s}px)`, width: barV.w * s }} />
      {/* 上下の真ん中の飾り */}
      {[false, true].map((down) => (
        <img
          key={`e${down}`}
          src={edgeH.url}
          alt=""
          style={{
            ...base,
            left: "50%",
            marginLeft: (-edgeH.w * s) / 2,
            top: down ? `calc(100% - ${barCY * s}px)` : -barCY * s,
            width: edgeH.w * s,
            height: edgeH.h * s,
            transform: flip(false, down),
          }}
        />
      ))}
      {/* 四隅。左上の形を反転して使う */}
      {([
        [false, false],
        [true, false],
        [false, true],
        [true, true],
      ] as const).map(([right, down]) => (
        <img
          key={`c${right}${down}`}
          src={corner.url}
          alt=""
          style={{
            ...base,
            left: right ? `calc(100% - ${(corner.w - armX) * s}px)` : -armX * s,
            top: down ? `calc(100% - ${(corner.h - armY) * s}px)` : -armY * s,
            width: corner.w * s,
            height: corner.h * s,
            transform: flip(right, down),
          }}
        />
      ))}
    </>
  );
};

/** 金の額縁の四隅の飾り（菱形）と、上の真ん中の飾り（切れ端が読めないとき） */
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
