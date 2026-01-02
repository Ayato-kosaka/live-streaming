import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  withRepeat,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

// ここが「添付SVG」と「グレー版SVG」
import PiggyGaugeFill from "../../assets/PiggyGaugeFill.svg";
import PiggyGaugeBase from "../../assets/PiggyGaugeBase.svg";

interface PiggyBankProps {
  width: number;
  height: number;
  progress: number; // 0-1
}

// Wave component constants
const WAVE_HEIGHT = 14;
const WAVE_ANIMATION_DURATION = 1200; // ms for horizontal loop

interface WaveProps {
  width: number;
  height?: number;
}

const Wave: React.FC<WaveProps> = ({ width, height = WAVE_HEIGHT }) => {
  const wavePhase = useSharedValue(0);

  useEffect(() => {
    // Horizontal loop animation
    wavePhase.value = withRepeat(
      withTiming(1, {
        duration: WAVE_ANIMATION_DURATION,
        easing: Easing.linear,
      }),
      -1,
      false
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    // Horizontal movement (loop)
    const translateX = -width * wavePhase.value;
    
    // Vertical oscillation (subtle up/down movement)
    const time = wavePhase.value * Math.PI * 2;
    const translateY = Math.sin(time) * 2;

    return {
      transform: [{ translateX }, { translateY }],
    };
  });

  // Ensure height is always positive
  const safeHeight = Math.max(1, height);
  
  // Create a simple wave path (2x width for seamless looping)
  // Using quadratic bezier curves to simulate wave shape
  const wavePath = `
    M 0 ${safeHeight / 2}
    Q ${width / 4} 0, ${width / 2} ${safeHeight / 2}
    Q ${(width * 3) / 4} ${safeHeight}, ${width} ${safeHeight / 2}
    Q ${(width * 5) / 4} 0, ${width * 1.5} ${safeHeight / 2}
    Q ${(width * 7) / 4} ${safeHeight}, ${width * 2} ${safeHeight / 2}
    L ${width * 2} ${safeHeight}
    L 0 ${safeHeight}
    Z
  `;

  return (
    <Animated.View style={[{ width: width * 2, height: safeHeight }, animatedStyle]}>
      <Svg width={width * 2} height={safeHeight} viewBox={`0 0 ${width * 2} ${safeHeight}`}>
        <Path d={wavePath} fill="rgba(255,255,255,0.22)" />
      </Svg>
    </Animated.View>
  );
};

export const PiggyBank: React.FC<PiggyBankProps> = ({
  width,
  height: propsHeight,
  progress,
}) => {
  const marginVertical = 8;
  const height = Math.max(1, propsHeight - marginVertical * 2); // Ensure height is always positive

  // Animated water level (0-1)
  const level = useSharedValue(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const [shouldShowWave, setShouldShowWave] = useState(false);

  // Clamp progress to 0-1
  const p = Math.max(0, Math.min(1, progress));

  useEffect(() => {
    // Function to trigger water filling animation
    const triggerFillAnimation = () => {
      level.value = 0; // Reset to 0
      setShouldShowWave(false); // Hide wave initially
      
      // Delay showing the wave until water level is high enough (300ms after animation starts)
      setTimeout(() => {
        setShouldShowWave(true);
      }, 300);
      
      level.value = withTiming(p, {
        duration: 2200,
        easing: Easing.out(Easing.cubic),
      });
    };

    // Trigger immediately on mount
    triggerFillAnimation();

    // Set up 10-second interval for subsequent animations
    intervalRef.current = setInterval(() => {
      triggerFillAnimation();
    }, 10000);

    return () => {
      // Clean up interval on unmount
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p]);

  const animatedClipStyle = useAnimatedStyle(() => {
    const clipHeight = height * level.value;
    return {
      height: clipHeight,
    };
  });

  const animatedWaveStyle = useAnimatedStyle(() => {
    // Position wave at the water level (from bottom)
    const clipHeight = height * level.value;
    const waveBottom = clipHeight - WAVE_HEIGHT / 2;
    return {
      bottom: waveBottom,
    };
  });

  return (
    <View style={[styles.wrap, { marginVertical, width, height }]}>
      {/* 奥：グレー版（ベース） */}
      <PiggyGaugeBase width={width} height={height} />

      {/* 塗り：下から progress 分だけ表示 */}
      <Animated.View
        style={[
          styles.fillClipVertical,
          {
            width,
          },
          animatedClipStyle,
        ]}
      >
        <View style={{ position: "absolute", left: 0, bottom: 0 }}>
          <PiggyGaugeFill width={width} height={height} />
        </View>
      </Animated.View>

      {/* Wave at the top of the water level - positioned outside clip container */}
      {p > 0 && shouldShowWave && (
        <Animated.View
          style={[
            {
              position: "absolute",
              left: 0,
              width: width,
              height: WAVE_HEIGHT,
              overflow: "hidden",
            },
            animatedWaveStyle,
          ]}
          pointerEvents="none"
        >
          <Wave width={width} height={WAVE_HEIGHT} />
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { position: "relative" },
  fillClipVertical: {
    position: "absolute",
    left: 0,
    bottom: 0,
    overflow: "hidden",
  },
});
