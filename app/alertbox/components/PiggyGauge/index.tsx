import React, { useMemo } from "react";
import { View, Text, StyleSheet, useWindowDimensions } from "react-native";
import { PiggyBank } from "./PiggyBank";

export type PiggyGaugeProps = {
  currentAmount: number; // 現在（例: 65000）
  targetAmount: number; // 目標金額
  label: string; // ラベル（例: "なに食べよの広告費"）
};

export const PiggyGauge: React.FC<PiggyGaugeProps> = ({
  currentAmount,
  targetAmount,
  label,
}) => {
  // 進捗計算（0〜1にクランプ）
  const progress = useMemo(() => {
    if (targetAmount <= 0) return 0;
    const p = currentAmount / targetAmount;
    return Math.max(0, Math.min(1, p));
  }, [currentAmount]);

  // パーセント表示（切り捨て）
  const percentage = Math.floor(progress * 100);

  // 金額フォーマット
  const formatAmount = (amount: number) => {
    return amount.toLocaleString("ja-JP") + "円";
  };

  // 画面幅の120%を使用
  const { width: screenWidth } = useWindowDimensions();
  const gaugeWidth = screenWidth * 1.2;
  const gaugeHeight = (gaugeWidth * 260) / 600; // viewBoxのアスペクト比を維持

  return (
    <View style={styles.container}>
      <View style={styles.gaugeContainer}>
        <View
          style={[
            styles.pigAndTextBox,
            { width: gaugeWidth, height: gaugeHeight },
          ]}
        >
          {/* 豚の貯金箱SVG */}
          <View
            style={[
              styles.pigContainer,
              { width: gaugeWidth, height: gaugeHeight },
            ]}
          >
            <PiggyBank
              width={gaugeWidth}
              height={gaugeHeight}
              progress={progress}
            />

            {/* テキストオーバーレイ */}
            <View style={styles.textOverlay}>
              {/* 上部：目標金額 */}
              <Text style={styles.topText}>{formatAmount(targetAmount)}</Text>

              {/* 中央：現在金額（境界付近） */}
              <Text style={styles.centerText}>
                {formatAmount(currentAmount)}
              </Text>

              {/* 下部：ラベル */}
              <Text style={styles.bottomText}>{label}</Text>
            </View>
          </View>
        </View>

        {/* 右側外：パーセント表示 */}
        {/* <View style={styles.percentageContainer}>
          <Text style={styles.percentageText}>{percentage}%</Text>
        </View> */}
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
    justifyContent: "center",
  },
  pigAndTextBox: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
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
    pointerEvents: "none",
  },
  topText: {
    fontSize: 16,
    fontWeight: "800",
    color: "rgba(255,255,255,0.95)",
    textAlign: "center",
    textShadowColor: "#000000",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  centerText: {
    fontSize: 20,
    fontWeight: "900",
    color: "#FF4FA3",
    textAlign: "center",
    textShadowColor: "rgba(255,255,255,0.98)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  bottomText: {
    fontSize: 14,
    fontWeight: "800",
    color: "rgba(255,255,255,0.95)",
    textAlign: "center",
    textShadowColor: "#000000",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  percentageContainer: {
    position: "absolute",
    right: -10,
    top: "50%",
    transform: [{ translateY: -6 }],
  },
  percentageText: {
    fontSize: 26,
    fontWeight: "900",
    color: "#FF4FA3",
    textShadowColor: "rgba(255,255,255,0.95)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
});
