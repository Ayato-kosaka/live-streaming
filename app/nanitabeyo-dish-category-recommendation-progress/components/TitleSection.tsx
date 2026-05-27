import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../styles/colors";

export function TitleSection() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>『なに食べよ』料理提案アップデート</Text>
      <Text style={styles.knock}>2,000本ノック中！</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: 8,
  },
  title: {
    color: colors.title,
    fontSize: 52,
    lineHeight: 62,
    fontWeight: "900",
    textAlign: "center",
  },
  knock: {
    color: colors.accentPrimary,
    fontSize: 58,
    lineHeight: 66,
    fontWeight: "900",
    textAlign: "center",
  },
});
