import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { PiggyBank } from "./PiggyBank";
import type { Season } from "../../season/useSeason";
import { ThemedGauge } from "../../season/ThemedGauge";
import { KuroBank } from "../../season/bank/KuroBank";
import { useStableWindow } from "../../season/useBoxSize";

export type PiggyGaugeProps = {
  currentAmount: number; // 現在（例: 65000）
  targetAmount: number; // 目標金額
  label: string; // ラベル（例: "なに食べよの広告費"）
  /** 季節テーマ。無い日・絵が読めなかった日は豚のまま */
  season?: Season;
};

export const PiggyGauge: React.FC<PiggyGaugeProps> = ({
  currentAmount,
  targetAmount,
  label,
  season,
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

  // 画面幅の120%を使用。数は useWindowDimensions と同じで、変わったときだけ描き直す
  // （PRISM は大きさが変わらなくても resize を絶えず送ってくる。`useBoxSize.ts`）
  const { width: screenWidth } = useStableWindow();
  const gaugeWidth = screenWidth * 1.2;
  const gaugeHeight = (gaugeWidth * 260) / 600; // viewBoxのアスペクト比を維持

  /* 季節の貯金箱。絵を読んでいる途中は何も出さない（豚を一瞬出してから
     差し替えると、OBS を開いた直後に豚がちらつく）。読めなかったら豚 */
  if (season?.theme && season.bank === "loading") return null;
  /* 切り絵の貯金箱（クロとバケツ）。部品を読み終えるまで待ち、読めた組があれば
     こちらを出す。読めなければ下のコマ送り（→ 豚）に落ちる */
  const rb = season?.theme?.rigBank;
  if (season?.theme && rb) {
    if (!season.rigsSettled) return null;
    const mascot = season.rigs.get(rb.mascot);
    const bucket = season.rigs.get(rb.bucket);
    if (mascot && bucket) {
      return (
        <View style={styles.container}>
          <KuroBank
            theme={season.theme}
            mascot={mascot}
            bucket={bucket}
            visitor={rb.visitor ? season.rigs.get(rb.visitor) ?? null : null}
            currentAmount={currentAmount}
            targetAmount={targetAmount}
            label={label}
          />
        </View>
      );
    }
  }
  if (season?.theme && season.bank && season.bank !== "loading") {
    return (
      <View style={styles.container}>
        <ThemedGauge
          theme={season.theme}
          bank={season.bank}
          progress={progress}
          currentText={formatAmount(currentAmount)}
          targetText={formatAmount(targetAmount)}
          label={label}
        />
      </View>
    );
  }

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
