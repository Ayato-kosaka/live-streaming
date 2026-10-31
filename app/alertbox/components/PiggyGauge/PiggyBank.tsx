import React, { useRef } from "react";
import { Platform, View, StyleSheet } from "react-native";

// 既存SVG（そのまま使う）
import PiggyGaugeFill from "../../assets/PiggyGaugeFill.svg";
import PiggyGaugeBase from "../../assets/PiggyGaugeBase.svg";
import { emptyClip, useWaveClip } from "./wave";

type Props = {
  width: number;
  height: number;
  progress: number; // 0..1
};

export const PiggyBank: React.FC<Props> = ({ width, height, progress }) => {
  // Web以外はこの方式は使えない（必要なら別実装にする）
  const isWeb = Platform.OS === "web";

  const fillLayerRef = useRef<HTMLDivElement | null>(null);

  // 溜まり方（波の切り抜き）は季節の貯金箱と共通。`wave.ts`
  useWaveClip(fillLayerRef, isWeb, width, height, progress);

  return (
    <View style={[styles.wrap, { width, height }]}>
      {/* ベース（グレー） */}
      <PiggyGaugeBase width={width} height={height} />

      {/* Fill（青）を“波形の上端”で切り抜くレイヤー */}
      {/* Webだけ div を使う（RN Webなら View が div になるが、ref型が弱いので素直にdiv） */}
      {isWeb ? (
        <div
          ref={fillLayerRef}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width,
            height,
            // 初期状態（見えない）
            clipPath: emptyClip(width, height),
            WebkitClipPath: emptyClip(width, height),
          }}
        >
          <PiggyGaugeFill width={width} height={height} />
        </div>
      ) : (
        // Web以外は一旦そのまま表示（必要ならここにネイティブ用実装を入れる）
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <PiggyGaugeFill width={width} height={height} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { position: "relative" },
});
