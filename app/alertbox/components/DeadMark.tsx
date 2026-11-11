import React, { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";

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
 *
 * ## 明滅は WAAPI で（2026-11-11）
 *
 * 前は react-native-web の `Animated.loop` だった。web には native driver が無いので **JS が1コマごとに opacity を
 * 書き続け**、しかも 0.19 の `Animated.View` は描き直すたびに props を値に残す（`index.tsx` の `FADE_MS` の頭。
 * 死んでいるあいだも、生きている口からの投げ銭でアラートの面は何度も描き直される）。opacity だけの WAAPI にすれば、
 * 合成だけで回り、値も持たない
 */
export function DeadMark() {
  const dot = useRef<View | null>(null);

  useEffect(() => {
    // 試験の画面（react-test-renderer）の ref は DOM ではないので何もしない（点は 0.14 のまま見える）
    const el = dot.current as unknown as { animate?: HTMLElement["animate"] } | null;
    if (typeof el?.animate !== "function") return;
    let a: Animation | null = null;
    try {
      a = el.animate([{ opacity: 0.14 }, { opacity: 0.85 }], {
        duration: 1200,
        easing: "ease-in-out",
        iterations: Infinity,
        direction: "alternate",
      });
    } catch {
      a = null;
    }
    return () => a?.cancel();
  }, []);

  return (
    // 押しどころを奪わない。OBS のブラウザソースは触られないが、念のため
    <View pointerEvents="none" style={styles.slot}>
      <View ref={dot} style={[styles.dot, { opacity: 0.14 }]} />
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
