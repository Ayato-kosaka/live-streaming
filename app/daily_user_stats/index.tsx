import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { fetchAllStats } from './lib/api';
import { getLast30Days, formatMonthly, type BarDatum } from './lib/aggregate';
import type { Summary } from './lib/types';
import { colors } from './styles/colors';
import Header from './components/Header';
import StatPanel from './components/StatPanel';
import BarChart from './components/BarChart';

export default function DailyUserStatsScreen() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [last30, setLast30] = useState<BarDatum[]>([]);
  const [last12months, setLast12months] = useState<BarDatum[]>([]);
  // 読めなかったか。**「0だった」とは別のもの**として持つ
  const [dead, setDead] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { daily, monthly, summary } = await fetchAllStats();
      /* 200 が返っても、中身が欠けていれば読めていない。
         `summary` が丸ごと落ちていると `-` と空の目盛りだけが残って、
         それが「今日は0人でした」に見える。 */
      if (typeof summary?.all_time !== 'number') {
        throw new Error('summary が読めていない');
      }
      setSummary(summary);
      setLast30(getLast30Days(daily));
      setLast12months(formatMonthly(monthly));
      setDead(false);
    } catch (e) {
      /* 読めなかった理由は console にだけ残す。**画面には何も出さない。**

         ここは OBS のブラウザソースに載る飾りで、出なくても視聴者さんが
         失うものは無い。反対に、抜け殻を出すと害がある。前は落ちても
         クリーム色の板がそのまま残って、「今日の新規 -」と、中身が0本なのに
         「10 / 8 / 5 / 3」という**それらしい目盛りの付いた空のグラフ**が
         配信に出ていた。読めなかった日と、本当に0人だった日が同じ絵になる。

         あやとは**この板が出てこないこと**で気づく。 */
      console.error('なに食べよのユーザー数: 読めなかったので何も出さない —', e);
      setDead(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* 何も出さない。**地の色ごと消す。**
     OBS のブラウザソースは、中身が空でも地が塗ってあればその色の四角を
     配信に乗せる。`root` を返さなければ、この面が塗るものは1枚も無くなる
     （`html` / `body` は Expo の書き出しでも透明のまま）。 */
  if (dead) return null;

  return (
    <View style={styles.root}>
      <View style={styles.container}>
        <Header />
        <View style={styles.gap} />
        <StatPanel loading={loading} summary={summary} />
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
