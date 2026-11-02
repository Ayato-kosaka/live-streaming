import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  Animated,
  Easing,
  ViewStyle,
  Dimensions,
} from "react-native";
import { styles } from "./styles";

export const RainEffect: React.FC<{
  index: number;
  emoji: string;
  delay: number;
}> = ({ index, emoji, delay }) => {
  /* 値と横の位置は、描き直しても作り直さない（useRef）。作り直すと、動いている値から
     新しい止まった値に繋ぎ替わって、粒が画面の上（-50）へ戻ったまま止まる。
     面の大きさが変わるとアラート全体が描き直されるので（index.tsx の useBoxSize）、
     投げ銭のあいだに箱を広げると雨が消えていた（#1079） */
  const fallAnimation = useRef(new Animated.Value(-50)).current;
  const windAnimation = useRef(new Animated.Value(0)).current;
  const left = useRef(Math.floor(Math.random() * (90 - 10 + 1)) + 10).current;
  const windowHeight = useRef(Dimensions.get("window").height).current;

  useEffect(() => {
    const startAnimation = () => {
      Animated.loop(
        Animated.timing(fallAnimation, {
          toValue: windowHeight + 50,
          duration: Math.random() * 2000 + 5000, // 5秒～7秒で落ちる
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();

      Animated.loop(
        Animated.timing(windAnimation, {
          toValue: Math.random() * 200 - 100, // 左右に揺れる（風の影響）
          duration: 3000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        })
      ).start();
    };
    const timeout = setTimeout(startAnimation, delay);
    return () => clearTimeout(timeout);
  }, [delay]);

  return (
    <Animated.Text
      style={{
        position: "absolute",
        fontSize: 36,
        left: `${left}%`,
        top: -50, // 画面外から落とす
        transform: [
          { translateY: fallAnimation },
          { translateX: windAnimation },
        ],
      }}
    >
      {emoji}
    </Animated.Text>
  );
};

export const FireworkEffect: React.FC<{ index: number; emoji: string }> = ({
  index,
  emoji,
}) => {
  // 描き直しても作り直さない（上の RainEffect と同じ。作り直すと粒が真ん中へ戻って止まる）
  const animation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animation, {
      toValue: 1,
      duration: 15000,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, []);

  const angle = (index / 16) * (2 * Math.PI); // 16方向均等配置
  const distance = 1500; // 飛び散る距離

  const translateX = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, Math.cos(angle) * distance],
  });

  const translateY = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, Math.sin(angle) * distance],
  });

  return (
    <Animated.Text
      style={{
        position: "absolute",
        fontSize: 60,
        left: "50%",
        top: "50%",
        transform: [{ translateX }, { translateY }],
      }}
    >
      {emoji}
    </Animated.Text>
  );
};

export const FireworkExplosion: React.FC<{ emoji: string; delay: number }> = ({
  emoji,
  delay,
}) => {
  const [triggerFireworks, setTriggerFireworks] = useState(false);
  const [isVisible, setIsVisible] = useState(true); // 表示状態を管理

  const left = useRef(Math.floor(Math.random() * (90 - 10 + 1)) + 10).current;
  const maxBottom = useRef(
    Math.floor(Math.random() * (90 - 40 + 1)) + 40
  ).current;

  const opacityAnimated = useRef(new Animated.Value(1)).current; // 透明度のアニメーション
  const bottomPercentAnimated = useRef(new Animated.Value(0)).current;
  const bottomPercent = bottomPercentAnimated.interpolate({
    inputRange: [0, maxBottom],
    outputRange: ["-10%", `${maxBottom}%`],
  });

  useEffect(() => {
    const startAnimation = () => {
      Animated.timing(bottomPercentAnimated, {
        toValue: maxBottom,
        duration: 1000,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }).start(() => {
        setTriggerFireworks(true); // 上昇後に花火が弾ける
      });

      // 8秒後に非表示にする
      setTimeout(() => {
        Animated.timing(opacityAnimated, {
          toValue: 0,
          duration: 1000, // 1秒かけてフェードアウト
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start(() => {
          setIsVisible(false); // 完全にフェードアウトしたら削除
        });
      }, 8000);
    };

    // `delay` ミリ秒後に開始
    const timer = setTimeout(startAnimation, delay);

    return () => clearTimeout(timer); // クリーンアップ
  }, [delay]);

  if (!isVisible) return null;
  return (
    <Animated.View
      style={{
        position: "absolute",
        left: `${left}%`,
        bottom: bottomPercent,
        opacity: opacityAnimated,
      }}
    >
      <Text style={{ position: "absolute", fontSize: 60, left: 0, top: 0 }}>
        {emoji}
      </Text>
      {triggerFireworks && (
        <View style={{ position: "absolute", alignItems: "center" }}>
          {Array.from({ length: 16 }).map((_, j) => (
            <FireworkEffect key={j} index={j} emoji={emoji} />
          ))}
          <Text style={{ position: "absolute", fontSize: 60, left: 0, top: 0 }}>
            {emoji}
          </Text>
        </View>
      )}
    </Animated.View>
  );
};

export const FireworkDisplay: React.FC<{
  style?: ViewStyle;
  emoji: string;
  count: number;
  alertDuration: number;
}> = ({ style, emoji, count, alertDuration }) => {
  return (
    <View
      style={{ ...style, position: "absolute", height: "100%", width: "100%" }}
    >
      {Array.from({ length: count }).map((_, index) => (
        <FireworkExplosion
          key={index}
          emoji={emoji}
          delay={index * Math.min(500, (alertDuration * 1000 - 2000) / count)}
        />
      ))}
    </View>
  );
};

/**
 * 名簿で絵文字を持っている人の花火と雨（キャラ絵の後ろ。zIndex 0）。
 *
 * **箱の大きさが変わっても描き直さない**（React.memo）。中身は面の大きさを使わない（% で置く）ので、
 * 描き直す理由が無い。PRISM で投げ銭のときに箱を手で広げると、広げているあいだ毎コマ
 * アラート全体が描き直される（index.tsx の useBoxSize）。そのたびに粒の数だけ Animated を
 * 繋ぎ直していた（#1079）
 */
export const EmojiEffects = React.memo(function EmojiEffects({
  emoji,
  fireworksCount,
  rainsCount,
  alertDuration,
}: {
  emoji: string;
  fireworksCount: number;
  rainsCount: number;
  /** アラートを出している秒（雨は、この間に均等に降らせる） */
  alertDuration: number;
}) {
  return (
    <div
      data-show="emoji"
      aria-hidden
      style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", zIndex: 0, pointerEvents: "none", overflow: "hidden" }}
    >
      <FireworkDisplay
        style={styles.fireworkExplosion}
        emoji={emoji}
        count={fireworksCount}
        alertDuration={alertDuration}
      />
      {Array.from({ length: rainsCount }).map((_, i) => (
        <RainEffect
          key={i}
          index={i}
          emoji={emoji}
          // 表示時間全体に均等配置（最初と最後を少し余白）
          delay={((alertDuration * 1000 - 2000) / (rainsCount || 1)) * i}
        />
      ))}
    </div>
  );
});
