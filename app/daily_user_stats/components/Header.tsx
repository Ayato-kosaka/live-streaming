import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { colors } from '../styles/colors';

const LOGO_URI = 'https://app.nanitabeyo.net/favicon-64x64.20260207.png';

export default function Header() {
  return (
    <View style={styles.container}>
      <Image source={{ uri: LOGO_URI }} style={styles.logo} />
      <Text style={styles.title}>
        {'  '}なに食べよ{'  '}
        <Text style={styles.subtitle}>📈 ユーザー数</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  logo: {
    width: 28,
    height: 28,
    borderRadius: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textStrong,
  },
  subtitle: {
    fontSize: 10,
    color: colors.textSub,
  },
});
