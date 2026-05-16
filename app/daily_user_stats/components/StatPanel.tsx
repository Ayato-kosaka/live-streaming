import React from 'react';
import { View, StyleSheet } from 'react-native';
import StatCard from './StatCard';
import type { Aggregates } from '../lib/aggregate';

type Props = {
  loading: boolean;
  aggregates: Aggregates | null;
};

export default function StatPanel({ loading, aggregates }: Props) {
  return (
    <View style={styles.grid}>
      <View style={styles.row}>
        <StatCard label="今日の新規" value={aggregates?.todayNew ?? null} loading={loading} />
        <View style={styles.colGap} />
        <StatCard label="今日の累計" value={aggregates?.todayTotal ?? null} loading={loading} />
      </View>
      <View style={styles.rowGap} />
      <View style={styles.row}>
        <StatCard label="月間累計(MAU)" value={aggregates?.mau ?? null} loading={loading} />
        <View style={styles.colGap} />
        <StatCard label="全期間累計" value={aggregates?.allTime ?? null} loading={loading} />
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
