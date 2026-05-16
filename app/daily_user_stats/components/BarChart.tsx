import React, { useRef, useEffect } from 'react';
import { View, Text, Animated, Easing, StyleSheet } from 'react-native';
import { Svg, Rect, Line, Text as SvgText, G } from 'react-native-svg';
import { colors } from '../styles/colors';
import type { BarDatum } from '../lib/aggregate';

type Props = {
  title: string;
  data: BarDatum[];
  loading: boolean;
};

// SVG coordinate constants
const VW = 200;
const VH = 100;
const LEFT = 22;   // space for Y axis labels
const RIGHT = 2;
const TOP = 8;
const BOTTOM = 12; // space for X axis labels
const CHART_W = VW - LEFT - RIGHT;  // 176
const CHART_H = VH - TOP - BOTTOM; // 80
const BASELINE = TOP + CHART_H;    // 88

function computeYAxis(data: BarDatum[]): { max: number; ticks: number[] } {
  const maxTotal = Math.max(...data.map((d) => d.new_users + d.returning_users), 0);
  if (maxTotal === 0) return { max: 10, ticks: [10, 8, 5, 3] };

  // Find a nice step so that 4 steps >= maxTotal
  const candidates = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  const step = candidates.find((s) => s * 4 >= maxTotal) ?? 5000;
  const max = step * 4;
  return {
    max,
    ticks: [max, step * 3, step * 2, step],
  };
}

function barX(i: number, barWidth: number): number {
  return LEFT + i * (barWidth + 1);
}

export default function BarChart({ title, data, loading }: Props) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(4)).current;

  useEffect(() => {
    if (!loading) {
      fadeAnim.setValue(0);
      slideAnim.setValue(4);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 600,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [loading]);

  const { max, ticks } = computeYAxis(data);

  // Y gridlines at 4 equidistant positions from top
  const gridYs = [TOP, TOP + CHART_H / 4, TOP + CHART_H / 2, TOP + (CHART_H * 3) / 4];

  const barCount = data.length;
  // barWidth * N + 1 * (N-1) = CHART_W  =>  barWidth = (CHART_W - (N-1)) / N
  const barWidth = barCount > 0 ? Math.max(2, (CHART_W - Math.max(barCount - 1, 0)) / barCount) : 5;

  // 3 X axis labels: first, middle, last
  const xLabelIndices: number[] =
    barCount === 0
      ? []
      : barCount === 1
      ? [0]
      : [0, Math.floor((barCount - 1) / 2), barCount - 1];

  return (
    <Animated.View
      style={[
        styles.card,
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
      ]}
    >
      {/* Header row */}
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.main }]} />
            <Text style={styles.legendText}>新規</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.sub }]} />
            <Text style={styles.legendText}>既存</Text>
          </View>
        </View>
      </View>

      {/* Chart */}
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${VW} ${VH}`}
        style={styles.svg}
        preserveAspectRatio="none"
      >
        {/* Gridlines */}
        {gridYs.map((y, i) => (
          <Line
            key={i}
            x1={LEFT}
            y1={y}
            x2={VW - RIGHT}
            y2={y}
            stroke={colors.grid}
            strokeWidth={0.4}
          />
        ))}

        {/* Y axis tick labels */}
        {ticks.map((val, i) => (
          <SvgText
            key={i}
            x={LEFT - 2}
            y={gridYs[i] + 2.5}
            textAnchor="end"
            fontSize={6}
            fill={colors.textSub}
          >
            {val >= 1000 ? `${val / 1000}k` : String(val)}
          </SvgText>
        ))}

        {/* Bars */}
        {data.map((d, i) => {
          const returningH = max > 0 ? (d.returning_users / max) * CHART_H : 0;
          const newH = max > 0 ? (d.new_users / max) * CHART_H : 0;
          const totalH = returningH + newH;
          const x = barX(i, barWidth);

          return (
            <G key={i}>
              {returningH > 0.1 && (
                <Rect
                  x={x}
                  y={BASELINE - returningH}
                  width={barWidth}
                  height={returningH}
                  fill={colors.sub}
                />
              )}
              {newH > 0.1 && (
                <Rect
                  x={x}
                  y={BASELINE - totalH}
                  width={barWidth}
                  height={newH}
                  fill={colors.main}
                />
              )}
            </G>
          );
        })}

        {/* X axis labels */}
        {xLabelIndices.map((idx) => {
          const cx = barX(idx, barWidth) + barWidth / 2;
          const anchor =
            idx === 0 ? 'start' : idx === barCount - 1 ? 'end' : 'middle';
          return (
            <SvgText
              key={idx}
              x={cx}
              y={VH - 1}
              textAnchor={anchor}
              fontSize={6}
              fill={colors.textSub}
            >
              {data[idx].label}
            </SvgText>
          );
        })}
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingTop: 8,
    paddingHorizontal: 10,
    paddingBottom: 6,
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.textStrong,
  },
  legend: {
    flexDirection: 'row',
    gap: 6,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 2,
  },
  legendText: {
    fontSize: 8,
    color: colors.textSub,
  },
  svg: {
    flex: 1,
  },
});
