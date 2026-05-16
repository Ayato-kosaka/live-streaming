import React, { useRef, useEffect } from 'react';
import { View, Text, Animated, Easing, StyleSheet } from 'react-native';
import { colors } from '../styles/colors';

type Props = {
  label: string;
  value: number | null;
  loading: boolean;
};

export default function StatCard({ label, value, loading }: Props) {
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 800,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [spinAnim]);

  const rotate = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      {loading ? (
        <Animated.View style={[styles.spinner, { transform: [{ rotate }] }]} />
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
  spinner: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.sub,
    borderTopColor: colors.main,
  },
});
