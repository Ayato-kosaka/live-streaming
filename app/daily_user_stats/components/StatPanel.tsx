import React from 'react';
import { View, StyleSheet } from 'react-native';
import StatCard from './StatCard';
import type { Summary } from '../lib/types';

type Props = {
  loading: boolean;
  summary: Summary | null;
};

export default function StatPanel({ loading, summary }: Props) {
  return (
    <View style={styles.grid}>
      <View style={styles.row}>
        <StatCard label="今日の新規" value={summary?.today_new ?? null} loading={loading} />
        <View style={styles.colGap} />
        <StatCard label="今日の累計" value={summary?.today_total ?? null} loading={loading} />
      </View>
      <View style={styles.rowGap} />
      <View style={styles.row}>
        <StatCard label="月間累計(MAU)" value={summary?.mau ?? null} loading={loading} />
        <View style={styles.colGap} />
        <StatCard label="全期間累計" value={summary?.all_time ?? null} loading={loading} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {},
  row: {
    flexDirection: 'row',
  },
  rowGap: { height: 7 },
  colGap: { width: 7 },
});
