import React from "react";
import { View, StyleSheet } from "react-native";

// ここが「添付SVG」と「グレー版SVG」
import PiggyGaugeFill from "../../assets/PiggyGaugeFill.svg";
import PiggyGaugeBase from "../../assets/PiggyGaugeBase.svg";

interface PiggyBankProps {
  width: number;
  height: number;
  progress: number; // 0-1
}

export const PiggyBank: React.FC<PiggyBankProps> = ({
  width,
  height: propsHeight,
  progress,
}) => {
  const marginVertical = 8;
  const height = propsHeight - marginVertical * 2;

  const p = Math.max(0, Math.min(1, progress));
  const clipHeight = height * p;

  return (
    <View style={[styles.wrap, { marginVertical, width, height }]}>
      {/* 奥：グレー版（ベース） */}
      <PiggyGaugeBase width={width} height={height} />

      {/* 塗り：下から progress 分だけ表示 */}
      <View
        style={[
          styles.fillClipVertical,
          {
            width,
            height: clipHeight,
          },
        ]}
      >
        <View style={{ position: "absolute", left: 0, bottom: 0 }}>
          <PiggyGaugeFill width={width} height={height} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { position: "relative" },
  fillClipVertical: {
    position: "absolute",
    left: 0,
    bottom: 0,
    overflow: "hidden",
  },
});
