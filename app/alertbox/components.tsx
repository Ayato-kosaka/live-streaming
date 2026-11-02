import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { View, Text, ViewStyle, Dimensions } from "react-native";
import { styles } from "./styles";

/*
 * 名簿で絵文字を持つ人の、花火と雨。
 *
 * **粒は Web Animations（`element.animate`）で動かす。動かすのは transform・translate・opacity だけ。**
 * 前は react-native-web の `Animated` で動かしていた。web では `useNativeDriver` が効かず
 * （黙って JS の動きに落ちる）、値が変わるたびに、その粒の部品を React で描き直していた。
 * 1コマごとに粒の数だけ（1万円の花火は 16粒を 8 秒、雨は落ちているあいだの粒ぜんぶ）。
 * あやとのスマホ（PRISM）で、1万円＋絵文字が 31 コマ/秒・カクつき 48 回まで落ちた（#1079）。
 * Web Animations の transform・opacity は合成の側で進むので、出したあと JS は1コマも走らない。
 *
 * 粒の数・落ちる速さ・広がり・曲線・出る時刻・止まる所は前と同じ（曲線は下の EASE。前の Easing と同じ形）。
 * 乱数を引く順と時刻も前と同じにしてある（雨の速さと風は、その粒が降り始める時刻に引く）。
 */

/** 前の `Easing` を CSS の曲線に直したもの。形は同じ（`__tests__/emoji.test.tsx` で突き合わせている） */
export const EASE = {
  /** `Easing.out(Easing.quad)`（1-(1-t)²）。2次の曲線は3次のベジェでそのまま書ける */
  outQuad: "cubic-bezier(0.333333, 0.666667, 0.666667, 1)",
  /** `Easing.ease`（react-native では bezier(0.42, 0, 1, 1)。CSS の ease とは別物） */
  ease: "cubic-bezier(0.42, 0, 1, 1)",
  /** `Easing.out(Easing.ease)` */
  outEase: "cubic-bezier(0, 0, 0.58, 1)",
} as const;

/** 風の揺れ（`Easing.inOut(Easing.ease)` で 0 → wind px）。inOut は前半を ease、後半を out(ease) で半分ずつ進むので、真ん中で切って2本の曲線にすると同じ形になる */
export const windKeyframes = (wind: number): Keyframe[] => [
  { transform: "translateX(0px)", easing: EASE.ease },
  { transform: `translateX(${px(wind / 2)})`, offset: 0.5, easing: EASE.outEase },
  { transform: `translateX(${px(wind)})` },
];

/** 花火の粒が飛ぶ先（16方向に均等、1500px） */
export const fireworkVector = (index: number) => {
  const angle = (index / 16) * (2 * Math.PI);
  const distance = 1500;
  return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
};

/* 1e-13 のような指数の書き方を CSS に渡さない（cos(π/2) が 0 にならない） */
const px = (v: number) => `${Math.round(v * 1000) / 1000}px`;

/** 動かせる DOM の要素（react-native-web の ref は DOM の要素そのもの）。web 以外・jsdom では null */
const animatable = (node: unknown): HTMLElement | null =>
  node && typeof (node as HTMLElement).animate === "function" ? (node as HTMLElement) : null;

/** 個別の `translate` が使えるか。雨は「落ちる」と「風」を周期の違う2本で動かすので、
 *  落ちるほうを translate、風を transform に分けて同じ1粒に掛ける（足し算になる） */
const canTranslate = () =>
  typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("translate", "0px 1px");

export const RainEffect: React.FC<{
  index: number;
  emoji: string;
  delay: number;
}> = ({ emoji, delay }) => {
  const ref = useRef<Text>(null);
  /* 横の位置と落ちる先は、描き直しても作り直さない（useRef）。面の大きさが変わると
     アラート全体が描き直される（index.tsx の useSettledBoxSize）ので、作り直すと
     投げ銭のあいだに箱を広げたときに雨が消える（#1079・#1083） */
  const left = useRef(Math.floor(Math.random() * (90 - 10 + 1)) + 10).current;
  /* 落ちる先は react-native-web の窓の高さ。PRISM では visualViewport.scale ぶん縮んで、
     箱の半分の高さで止まる（キャラ絵の後ろに隠れて、消えたように見える）。
     **ここでは直さない**（演出の作り直しのときに決める） */
  const windowHeight = useRef(Dimensions.get("window").height).current;

  useEffect(() => {
    /* **1粒は1回だけ落ちて、落ちた先で止まる。** 前のコードは Animated.loop で繰り返すつもり
       だったが、web では繰り返していなかった（useNativeDriver: true だと loop がネイティブの
       繰り返しに回り、JS に落ちた動きはその回数を読まない）。見た目を変えないので、ここも1回にする */
    const anims: Animation[] = [];
    const timer = setTimeout(() => {
      // 引く順は前と同じ（落ちる速さ → 風）
      const duration = Math.random() * 2000 + 5000; // 5秒～7秒で落ちる
      const wind = Math.random() * 200 - 100; // 左右に揺れる（風の影響）
      const el = animatable(ref.current);
      if (!el) return;
      const fall = { duration, easing: "linear", fill: "forwards" } as const;
      if (canTranslate()) {
        anims.push(
          el.animate([{ translate: "0px -50px" }, { translate: `0px ${px(windowHeight + 50)}` }], fall),
          el.animate(windKeyframes(wind), { duration: 3000, fill: "forwards" })
        );
      } else {
        // translate の無い古いブラウザでは、風を付けずに落とすだけ
        anims.push(
          el.animate([{ transform: "translateY(-50px)" }, { transform: `translateY(${px(windowHeight + 50)})` }], fall)
        );
      }
    }, delay);
    return () => {
      clearTimeout(timer);
      anims.forEach((a) => a.cancel());
    };
  }, [delay, windowHeight]);

  return (
    <Text
      ref={ref}
      style={{
        position: "absolute",
        fontSize: 36,
        left: `${left}%`,
        top: -50, // 画面外から落とす
        // 降り始める前の位置（前の Animated の初めの値と同じ）。降り始めたら animate が上書きする
        transform: [{ translateY: -50 }, { translateX: 0 }],
      }}
    >
      {emoji}
    </Text>
  );
};

export const FireworkEffect: React.FC<{ index: number; emoji: string }> = ({
  index,
  emoji,
}) => {
  const ref = useRef<Text>(null);

  useEffect(() => {
    const el = animatable(ref.current);
    if (!el) return;
    const { x, y } = fireworkVector(index);
    const a = el.animate(
      [{ transform: "translateX(0px) translateY(0px)" }, { transform: `translateX(${px(x)}) translateY(${px(y)})` }],
      { duration: 15000, easing: EASE.outEase, fill: "forwards" }
    );
    return () => a.cancel();
  }, [index]);

  return (
    <Text
      ref={ref}
      style={{
        position: "absolute",
        fontSize: 60,
        left: "50%",
        top: "50%",
        transform: [{ translateX: 0 }, { translateY: 0 }],
      }}
    >
      {emoji}
    </Text>
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

  const ref = useRef<View>(null);
  const rise = useRef<Animation | null>(null);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const anims: Animation[] = [];
    let frame = 0;
    const startAnimation = () => {
      const el = animatable(ref.current);
      /* 打ち上げ（1秒）。下から -10% → maxBottom% を、箱の高さを px にして transform で上げる。
         `bottom` を毎コマ変えると、そのたびに並べ直しと描き直しが走る */
      const h = el?.parentElement?.clientHeight ?? 0;
      if (el && h > 0) {
        rise.current = el.animate(
          [{ transform: "translateY(0px)" }, { transform: `translateY(${px((-(maxBottom + 10) / 100) * h)})` }],
          { duration: 1000, easing: EASE.outQuad, fill: "forwards" }
        );
        anims.push(rise.current);
      }
      // 上昇後に花火が弾ける。前と同じく「1秒経った次のコマ」で弾く（時計だけで弾くと1コマ早い）
      timers.push(setTimeout(() => (frame = requestAnimationFrame(() => setTriggerFireworks(true))), 1000));
      // 8秒後に1秒かけて消して、消えきったら外す
      timers.push(
        setTimeout(() => {
          if (el)
            anims.push(el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 1000, easing: EASE.outQuad, fill: "forwards" }));
        }, 8000),
        setTimeout(() => setIsVisible(false), 9000)
      );
    };

    // `delay` ミリ秒後に開始
    timers.push(setTimeout(startAnimation, delay));

    return () => {
      timers.forEach(clearTimeout);
      cancelAnimationFrame(frame);
      anims.forEach((a) => a.cancel());
    };
  }, [delay, maxBottom]);

  /* 弾けたら、置き方を % （bottom: maxBottom%）に戻して打ち上げの移動を外す。
     同じ描き直しの中なので、位置は1コマも跳ばない。% に戻しておけば、そのあと箱を広げても付いていく */
  useLayoutEffect(() => {
    if (!triggerFireworks || !rise.current) return;
    rise.current.cancel();
    rise.current = null;
  }, [triggerFireworks]);

  if (!isVisible) return null;
  return (
    <View
      ref={ref}
      style={{
        position: "absolute",
        left: `${left}%`,
        bottom: triggerFireworks ? `${maxBottom}%` : "-10%",
        opacity: 1,
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
    </View>
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
 * 描き直す理由が無い。PRISM で投げ銭のときに箱を手で広げると、止まるたびにアラート全体が
 * 並べ直される（index.tsx の useSettledBoxSize）。前はそのたびに粒の数だけ Animated を
 * 繋ぎ直していた（#1079・#1083）
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
