import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertBox: {
    width: '100%',
    height: '100%',
  },
  alertContainer: {
    display: 'flex',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  image: {
    height: '100%',
    width: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 1,
  },
  textContainer: {
    zIndex: 3,
    textAlign: 'center',
    padding: 10,
  },
  fireworkExplosion: {
    zIndex: 2,
  },
  message: {
    margin: 0,
    padding: 0,
    textAlign: 'center',
    textShadowColor: 'black',
    textShadowOffset: { width: 2, height: 3 }, // Y 軸方向の影のオフセット
    textShadowRadius: 2, // 影の広がり（適切に調整）
    flexWrap: 'wrap', // `word-wrap: break-word;` に対応
  },
  piggyGaugeContainer: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});