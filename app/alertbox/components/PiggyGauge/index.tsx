import React, { useMemo } from "react";
import { View, Text, StyleSheet, useWindowDimensions } from "react-native";
import { PiggyBank } from "./PiggyBank";

export type PiggyGaugeProps = {
  targetAmount: number; // 目標（例: 100000）
  currentAmount: number; // 現在（例: 65000）
  label: string; // なに食べよの広告費
};

export const PiggyGauge: React.FC<PiggyGaugeProps> = ({
  targetAmount,
  currentAmount,
  label,
}) => {
  // 進捗計算（0〜1にクランプ）
  const progress = useMemo(() => {
    if (targetAmount <= 0) return 0;
    const p = currentAmount / targetAmount;
    return Math.max(0, Math.min(1, p));
  }, [currentAmount, targetAmount]);

  // パーセント表示（切り捨て）
  const percentage = Math.floor(progress * 100);

  // 金額フォーマット
  const formatAmount = (amount: number) => {
    return amount.toLocaleString("ja-JP") + "円";
  };

  // 画面幅の80-90%を使用
  const { width: screenWidth } = useWindowDimensions();
  const gaugeWidth = screenWidth * 0.85;
  const gaugeHeight = (gaugeWidth * 260) / 600; // viewBoxのアスペクト比を維持

  return (
    <View style={styles.container}>
      <View style={styles.gaugeContainer}>
        {/* 豚の貯金箱SVG */}
        <View style={styles.pigContainer}>
          <PiggyBank width={gaugeWidth} height={gaugeHeight} progress={progress} />
        </View>

        {/* テキストオーバーレイ */}
        <View style={styles.textOverlay}>
          {/* 上部：目標金額 */}
          <Text style={styles.topText}>{formatAmount(targetAmount)}</Text>

          {/* 中央：現在金額（境界付近） */}
          <Text style={styles.centerText}>{formatAmount(currentAmount)}</Text>

          {/* 下部：ラベル */}
          <Text style={styles.bottomText}>{label}</Text>
        </View>

        {/* 右側外：パーセント表示 */}
        <View style={styles.percentageContainer}>
          <Text style={styles.percentageText}>{percentage}%</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  gaugeContainer: {
    position: "relative",
    alignItems: "center",
    flexDirection: "row",
  },
  pigContainer: {
    position: "relative",
  },
  textOverlay: {
    position: "absolute",
    width: "100%",
    height: "100%",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 15,
    pointerEvents: "none",
  },
  topText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
    textAlign: "center",
    textShadowColor: "rgba(255, 255, 255, 0.8)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
  },
  centerText: {
    fontSize: 22,
    fontWeight: "800",
    color: "#37a9fd",
    textAlign: "center",
    textShadowColor: "rgba(255, 255, 255, 0.9)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  bottomText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    textAlign: "center",
    textShadowColor: "rgba(255, 255, 255, 0.8)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
  },
  percentageContainer: {
    marginLeft: 16,
    justifyContent: "center",
  },
  percentageText: {
    fontSize: 24,
    fontWeight: "700",
    color: "#37a9fd",
    textShadowColor: "rgba(0, 0, 0, 0.2)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
});
