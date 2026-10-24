/**
 * 季節の貯金箱。豚と同じ場所・同じ字の並びで、絵だけを季節の4コマに替える。
 *
 * - 下地（base）と中身（fill）をそれぞれ4コマ重ねて、JS の時計でコマ送りする
 *   （島のあやとの歩きと同じ、ささやかな動き）。**CSS の animation では送らない。**
 *   opacity を CSS で動かすとコマ1枚ずつが合成レイヤーになり、Chrome は見えていない
 *   （opacity 0 の）レイヤーを描いておかない。負荷が高いと、出た瞬間のコマが
 *   タイル（256px）の一部しか描けていないまま画面に出て、中身が欠けて下地の灰が
 *   見えた（実測。下地と中身のコマ替わりもずれた）。JS で `visibility` を切り替えれば
 *   ふつうの描き直しになり、描き終わるまで前の絵が出たままになる
 * - 溜まり方は豚と同じ（`components/PiggyGauge/wave.ts`）。中身の層を、波打つ
 *   水面で下から切り抜く。**色は絵に任せる**
 * - 字（目標・いまの額・ラベル）の色はテーマが持つ
 *
 * 大きさは豚の占めていた範囲（幅は画面の 95% まで、高さは豚と同じ）に、
 * 絵の**中身の四角**（manifest の外接矩形）が収まるように決める。
 * 透明な余白の分だけ小さく見える、を避けるため。
 */
import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, type TextStyle } from "react-native";
import type { SeasonTheme, TextTone } from "../themes";
import type { SeasonBank } from "./useSeason";
import { useStableWindow } from "./useBoxSize";

import { emptyClip, useWaveClip } from "../components/PiggyGauge/wave";

type Props = {
  theme: SeasonTheme;
  bank: SeasonBank;
  progress: number;
  currentText: string;
  targetText: string;
  label: string;
};

/**
 * 字の縁取り。**ぼかした影1枚では、絵の色と字の色が近いと字が消える**
 * （橙の中身の上の橙の額が、実際に読めなくなった）。8方向にずらした影で縁を描く。
 * `-webkit-text-stroke` + `paint-order` は OBS の古い Chromium で字の内側を削るので使わない。
 */
export function outline(c: string, w: number): string {
  const d = w * 0.72;
  return [
    `${w}px 0 0 ${c}`,
    `-${w}px 0 0 ${c}`,
    `0 ${w}px 0 ${c}`,
    `0 -${w}px 0 ${c}`,
    `${d}px ${d}px 0 ${c}`,
    `-${d}px ${d}px 0 ${c}`,
    `${d}px -${d}px 0 ${c}`,
    `-${d}px -${d}px 0 ${c}`,
    `0 ${w + 1}px ${w * 2}px rgba(0,0,0,0.45)`,
  ].join(", ");
}

/** 100% のとき、波の谷が中身の天辺より下に来ないように、水面を少し上まで上げる */
const OVERFILL_PX = 9;

export const ThemedGauge: React.FC<Props> = ({
  theme,
  bank,
  progress,
  currentText,
  targetText,
  label,
}) => {
  const baseRefs = useRef<(HTMLImageElement | null)[]>([]);
  const fillRefs = useRef<(HTMLImageElement | null)[]>([]);

  /* コマ送り。`sequence` の `[コマ, ms]` を順に出す。下地と中身は同じ時に替える。
     1周 4秒ほどで8回しか起きないので、時計の負担は無いに等しい */
  useEffect(() => {
    const seq = theme.bank.sequence;
    let step = 0;
    let timer: ReturnType<typeof setTimeout>;
    const show = () => {
      const [k, ms] = seq[step % seq.length];
      for (const refs of [baseRefs.current, fillRefs.current]) {
        refs.forEach((el, i) => {
          if (el) el.style.visibility = i === k ? "visible" : "hidden";
        });
      }
      step += 1;
      timer = setTimeout(show, ms);
    };
    show();
    return () => clearTimeout(timer);
  }, [theme, bank]);

  const { width: screenWidth } = useStableWindow();
  // 豚の占めていた高さ（PiggyGauge と同じ式）。幅は画面からはみ出さない
  const availH = (screenWidth * 1.2 * 260) / 600;
  const availW = screenWidth * 0.95;
  const b = bank.bbox;
  const s = Math.min(availW / b.width, availH / b.height);
  const boxW = Math.round(b.width * s);
  const boxH = Math.round(b.height * s);

  const fillRef = useRef<HTMLDivElement | null>(null);
  useWaveClip(fillRef, true, boxW, boxH, progress, -OVERFILL_PX, boxH);

  const frames = (
    imgs: SeasonBank["base"],
    refs: React.MutableRefObject<(HTMLImageElement | null)[]>
  ) =>
    imgs.map((img, i) => (
      <img
        key={img.url}
        ref={(el) => {
          refs.current[i] = el;
        }}
        src={img.url}
        alt=""
        draggable={false}
        style={{
          position: "absolute",
          left: -b.x * s,
          top: -b.y * s,
          width: img.width * s,
          height: img.height * s,
          visibility: i === 0 ? "visible" : "hidden",
          pointerEvents: "none",
          userSelect: "none",
        }}
      />
    ));

  const tone = (t: TextTone, w: number) =>
    ({ color: t.color, textShadow: outline(t.shadow, w) }) as TextStyle;

  return (
    <View style={{ width: boxW, height: boxH, position: "relative" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: boxW, height: boxH }}>
        {frames(bank.base, baseRefs)}
      </div>
      <div
        ref={fillRef}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: boxW,
          height: boxH,
          clipPath: emptyClip(boxW, boxH),
          WebkitClipPath: emptyClip(boxW, boxH),
        }}
      >
        {frames(bank.fill, fillRefs)}
      </div>

      <View style={styles.textOverlay}>
        <Text style={[styles.topText, tone(theme.text.top, 2)]}>{targetText}</Text>
        <Text style={[styles.centerText, tone(theme.text.center, 2.5)]}>{currentText}</Text>
        <Text style={[styles.bottomText, tone(theme.text.bottom, 2)]}>{label}</Text>
      </View>
    </View>
  );
};

/* 字の大きさと並びは豚（`PiggyGauge/index.tsx`）と同じ。色だけテーマから */
const styles = StyleSheet.create({
  textOverlay: {
    position: "absolute",
    width: "100%",
    height: "100%",
    justifyContent: "space-between",
    alignItems: "center",
    pointerEvents: "none",
  },
  topText: {
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },
  centerText: {
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center",
  },
  bottomText: {
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },
});
