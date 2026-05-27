import React from "react";
import { View, StyleSheet } from "react-native";
import { colors } from "../styles/colors";

type ProgressBarProps = {
  percent: number;
};

export function ProgressBar({ percent }: ProgressBarProps) {
  const safePercent = Math.min(Math.max(percent, 0), 100);

  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${safePercent}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: "100%",
    height: 44,
    borderRadius: 999,
    backgroundColor: colors.barTrack,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.2)",
  },
  fill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: colors.barFillStart,
    shadowColor: colors.barFillEnd,
    shadowOpacity: 0.7,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
});
