import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { fetchDailyStats } from './lib/api';
import {
  computeAggregates,
  getLast30Days,
  getLast12Months,
  type Aggregates,
  type BarDatum,
} from './lib/aggregate';
import type { DailyStat } from './lib/types';
import { colors } from './styles/colors';
import Header from './components/Header';
import StatPanel from './components/StatPanel';
import BarChart from './components/BarChart';

export default function DailyUserStatsScreen() {
  const [loading, setLoading] = useState(true);
  const [aggregates, setAggregates] = useState<Aggregates | null>(null);
  const [last30, setLast30] = useState<BarDatum[]>([]);
  const [last12months, setLast12months] = useState<BarDatum[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data: DailyStat[] = await fetchDailyStats();
      setAggregates(computeAggregates(data));
      setLast30(getLast30Days(data));
      setLast12months(getLast12Months(data));
    } catch (e) {
      console.error('Failed to fetch daily stats:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <View style={styles.root}>
      <View style={styles.container}>
        <Header />
        <View style={styles.gap} />
        <StatPanel loading={loading} aggregates={aggregates} />
        <View style={styles.gap} />
        <BarChart title="直近30日" data={last30} loading={loading} />
        <View style={styles.gap} />
        <BarChart title="月別 12ヶ月" data={last12months} loading={loading} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 18,
    padding: 14,
    flexDirection: 'column',
  },
  gap: {
    height: 10,
  },
});
