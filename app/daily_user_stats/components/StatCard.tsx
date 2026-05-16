import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../styles/colors';

type Props = {
  label: string;
  value: number | null;
  loading: boolean;
};

export default function StatCard({ label, value, loading }: Props) {
  const [slotNum, setSlotNum] = useState(() => Math.floor(Math.random() * 90) + 10);

  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => {
      setSlotNum(Math.floor(Math.random() * 90) + 10);
    }, 80);
    return () => clearInterval(id);
  }, [loading]);

  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      {loading ? (
        <Text style={[styles.value, styles.slot]}>{slotNum}</Text>
      ) : (
        <Text style={styles.value}>{value?.toLocaleString() ?? '-'}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flex: 1,
    minHeight: 52,
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 10,
    color: colors.textSub,
    fontWeight: '500',
    letterSpacing: 0.2,
    marginBottom: 3,
  },
  value: {
    fontSize: 22,
    fontWeight: '500',
    color: colors.main,
    fontVariant: ['tabular-nums'],
    lineHeight: 26,
  },
  slot: {
    color: colors.sub,
  },
});
