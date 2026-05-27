import React from "react";
import { View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../styles/colors";

type ProgressBarProps = {
  percent: number;
};

export function ProgressBar({ percent }: ProgressBarProps) {
  const safePercent = Math.min(Math.max(percent, 0), 100);

  return (
    <View style={styles.glowOuter}>
      <View style={styles.track}>
        <View style={[styles.fillGlow, { width: `${safePercent}%` }]} />

        <LinearGradient
          colors={[
            "#FF6A00",
            colors.barFillStart,
            "#FFD000",
            colors.barFillEnd,
          ]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[styles.fill, { width: `${safePercent}%` }]}
        >
          <LinearGradient
            colors={[
              "rgba(255, 255, 255, 0.35)",
              "rgba(255, 255, 255, 0.08)",
              "rgba(255, 92, 0, 0.18)",
            ]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.highlightLayer}
          />
        </LinearGradient>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  glowOuter: {
    width: "100%",
    borderRadius: 999,
    padding: 2,
    backgroundColor: "rgba(255, 190, 0, 0.18)",
    shadowColor: colors.barFillEnd,
    shadowOpacity: 0.95,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
  track: {
    width: "100%",
    height: 64,
    borderRadius: 999,
    backgroundColor: "rgba(12, 17, 30, 0.88)",
    overflow: "hidden",
    borderWidth: 3,
    borderColor: colors.barFillEnd,
  },
  fillGlow: {
    position: "absolute",
    top: -12,
    bottom: -12,
    left: 0,
    borderRadius: 999,
    backgroundColor: colors.barFillEnd,
    opacity: 0.28,
    shadowColor: colors.barFillEnd,
    shadowOpacity: 1,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 0 },
  },
  fill: {
    height: "100%",
    borderRadius: 999,
    overflow: "hidden",
    shadowColor: colors.barFillEnd,
    shadowOpacity: 1,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
  },
  highlightLayer: {
    ...StyleSheet.absoluteFillObject,
  },
});
