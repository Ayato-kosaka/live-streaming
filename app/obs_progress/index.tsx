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
        <TitleSection />

        <View style={styles.descriptionWrapper}>
          <Text style={styles.description}>ユーザーログから</Text>
          <Text style={styles.description}>
            「選ばれやすい / 選ばれにくい料理」を再集計して、
          </Text>
          <Text style={styles.description}>おすすめランキングに反映します！</Text>
        </View>

        <ProgressBar percent={progressPercent} />

        <View style={styles.countWrapper}>
          <Text style={styles.countText}>
            {doneCount.toLocaleString()} / {TOTAL_COUNT.toLocaleString()} 件
          </Text>
          <Text style={styles.percentText}>進捗 {progressPercent.toFixed(1)}%</Text>
        </View>

        <Text style={styles.deadline}>26:00 強制終了 → アプリ反映予定</Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundTop,
    paddingHorizontal: 80,
    paddingVertical: 60,
    justifyContent: "space-between",
    gap: 28,
  },
  descriptionWrapper: {
    alignItems: "center",
    gap: 8,
  },
  description: {
    color: colors.text,
    fontSize: 36,
    lineHeight: 48,
    fontWeight: "700",
    textAlign: "center",
  },
  countWrapper: {
    alignItems: "center",
    gap: 10,
  },
  countText: {
    color: colors.title,
    fontSize: 54,
    lineHeight: 64,
    fontWeight: "900",
  },
  percentText: {
    color: colors.accentSuccess,
    fontSize: 42,
    lineHeight: 50,
    fontWeight: "900",
  },
  deadline: {
    color: colors.accentSecondary,
    fontSize: 40,
    lineHeight: 50,
    fontWeight: "900",
    textAlign: "center",
  },
});
