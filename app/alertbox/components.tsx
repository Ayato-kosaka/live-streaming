import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  Animated,
  Easing,
  ViewStyle,
  Dimensions,
} from "react-native";

export const RainEffect: React.FC<{
  index: number;
  emoji: string;
  delay: number;
}> = ({ index, emoji, delay }) => {
  const fallAnimation = new Animated.Value(-50);
  const windAnimation = new Animated.Value(0);
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
        left: `${Math.floor(Math.random() * (90 - 10 + 1)) + 10}%`,
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
  const animation = new Animated.Value(0);

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
