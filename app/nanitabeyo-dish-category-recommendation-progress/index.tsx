import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Stack } from "expo-router";
import { View, Text, StyleSheet } from "react-native";
import { ProgressBar } from "./components/ProgressBar";
import { TitleSection } from "./components/TitleSection";
import { TOTAL_COUNT, fetchProgressCount } from "./lib/progress";
import { colors } from "./styles/colors";

const POLLING_INTERVAL_MS = 10_000;

export default function ObsProgressScreen() {
  const [doneCount, setDoneCount] = useState(0);

  const progressPercent = useMemo(() => {
    if (TOTAL_COUNT <= 0) return 0;
    return (doneCount / TOTAL_COUNT) * 100;
  }, [doneCount]);

  const updateProgress = useCallback(async () => {
    try {
      const latestDone = await fetchProgressCount();
      setDoneCount(latestDone);
    } catch (error) {
      console.warn("進捗取得に失敗しました", error);
    }
  }, []);

  useEffect(() => {
    updateProgress();
    const intervalId = setInterval(updateProgress, POLLING_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [updateProgress]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.container}>
        {/* <TitleSection />

        <View style={styles.descriptionWrapper}>
          <Text style={styles.description}>ユーザーログから</Text>
          <Text style={styles.description}>
            「選ばれやすい / 選ばれにくい料理」を再集計して、
          </Text>
          <Text style={styles.description}>
            おすすめランキングに反映します！
          </Text>
        </View> */}

        <ProgressBar percent={progressPercent} />

        <View style={styles.countWrapper}>
          <View style={styles.countRow}>
            <Text style={styles.countNumber}>{doneCount.toLocaleString()}</Text>
            <Text style={styles.countSlash}> / </Text>
            <Text style={styles.countNumber}>
              {TOTAL_COUNT.toLocaleString()}
            </Text>
            <Text style={styles.countUnit}> 件</Text>
          </View>

          <View style={styles.percentRow}>
            <Text style={styles.percentLabel}>進捗 </Text>
            <Text style={styles.percentValue}>
              {progressPercent.toFixed(1)}%
            </Text>
          </View>
        </View>

        {/* <View style={styles.deadlineRow}>
          <Text style={styles.deadlineTime}>26:00</Text>
          <Text style={styles.deadlineText}> 強制終了 </Text>
          <Text style={styles.deadlineArrow}>→</Text>
          <Text style={styles.deadlineText}> アプリ反映予定</Text>
        </View> */}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundTop,
    paddingHorizontal: 10,
    paddingVertical: 0,
    justifyContent: "space-between",
    gap: 8,
  },
  descriptionWrapper: {
    alignItems: "center",
    gap: 8,
  },
  description: {
    color: colors.text,
    fontSize: 36,
    lineHeight: 48,
    fontWeight: "800",
    textAlign: "center",
    textShadowColor: "rgba(255, 255, 255, 0.28)",
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 0 },
  },
  countWrapper: {
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 0,
  },
  countRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
  },
  countNumber: {
    color: colors.title,
    fontSize: 64,
    lineHeight: 40,
    fontWeight: "900",
    letterSpacing: 2,
    textShadowColor: "rgba(255, 255, 255, 0.45)",
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 0 },
  },
  countSlash: {
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: 58,
    lineHeight: 40,
    fontWeight: "900",
    marginHorizontal: 14,
  },
  countUnit: {
    color: "rgba(255, 255, 255, 0.82)",
    fontSize: 34,
    lineHeight: 44,
    fontWeight: "900",
    marginLeft: 12,
  },
  percentRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
  },
  percentLabel: {
    color: colors.title,
    fontSize: 38,
    lineHeight: 40,
    fontWeight: "900",
    textShadowColor: "rgba(255, 255, 255, 0.32)",
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 0 },
  },
  percentValue: {
    color: colors.barFillEnd,
    fontSize: 54,
    lineHeight: 40,
    fontWeight: "900",
    textShadowColor: "rgba(255, 184, 0, 0.85)",
    textShadowRadius: 12,
    textShadowOffset: { width: 0, height: 0 },
  },
  deadlineRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
  },
  deadlineTime: {
    color: colors.barFillEnd,
    fontSize: 68,
    lineHeight: 68,
    fontWeight: "900",
    textShadowColor: "rgba(255, 184, 0, 0.9)",
    textShadowRadius: 14,
    textShadowOffset: { width: 0, height: 0 },
  },
  deadlineText: {
    color: colors.title,
    fontSize: 42,
    lineHeight: 54,
    fontWeight: "900",
  },
  deadlineArrow: {
    color: colors.accentSecondary,
    fontSize: 52,
    lineHeight: 60,
    fontWeight: "900",
    marginHorizontal: 16,
    textShadowColor: "rgba(251, 133, 0, 0.85)",
    textShadowRadius: 12,
    textShadowOffset: { width: 0, height: 0 },
  },
});
