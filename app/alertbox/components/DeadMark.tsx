import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

/**
 * アラートボックスが死んでいることを、**あやとにだけ**伝える印。
 *
 * ## なぜ字をやめて、点にしたか
 *
 * 前は「初期化に失敗しました。Goals / doneruAmount の取得を確認して
 * ください。」を**画面いっぱい**に出していた。これは2つの意味でまずい。
 *
 * 1. **配信に映る。** 視聴者さんから見れば中の話で、読んでも何もできない。
 *    しかも中の名前（表の名前・変数の名前）がそのまま画に出る
 * 2. **アラートまで消えていた。** 字を出すために画面ごと差し替えていたので、
 *    ひとつの口が落ちた日は投げ銭が来てもお礼が1つも出なかった
 *
 * ## それでも黙らせない
 *
 * ここが死ぬと、投げてくれた人が無視されたことになる。あやとが気づけない
 * のがいちばん悪い。だから**消す**のではなく、**小さくする。**
 *
 * - 隅（右上）に 10px の点1つ。絵の邪魔にならない大きさと位置
 * - 2.4秒でゆっくり明滅する。**知らない人には気づかれず、
 *   探している人には必ず見える**明るさの動き
 * - 字を持たない。読めるものが無いので、エラーの吐き出しには見えない
 *
 * **なぜ死んだかはここに書かない。** ログ（`sendLog`）にだけ残す。
 * 画面に理由を出せば、それは結局「中の話を配信に出す」ことになる。
 */
export function DeadMark() {
  const blink = useRef(new Animated.Value(0.14)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, {
          toValue: 0.85,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          // web には native driver が無い。付けると警告だけ出て動かない
          useNativeDriver: false,
        }),
        Animated.timing(blink, {
          toValue: 0.14,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [blink]);

  return (
    // 押しどころを奪わない。OBS のブラウザソースは触られないが、念のため
    <View pointerEvents="none" style={styles.slot}>
      <Animated.View style={[styles.dot, { opacity: blink }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 10,
    height: 10,
    zIndex: 10,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#e5484d",
    /* 白い画にも暗い画にも乗るように、細い縁を1本。
       縁が無いと、明るい絵の上で点が消える */
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.35)",
  },
});
