import React, { useEffect, useRef } from "react";
import { Platform, View, StyleSheet } from "react-native";

// 既存SVG（そのまま使う）
import PiggyGaugeFill from "../../assets/PiggyGaugeFill.svg";
import PiggyGaugeBase from "../../assets/PiggyGaugeBase.svg";

type Props = {
  width: number;
  height: number;
  progress: number; // 0..1
};

// 波の設定（“描画”ではなく“切り抜き境界”用）
const AMP = 8; // 波の高さ(px)
const WAVE_SPEED = 0.032; // 1フレームあたりの位相増分（大きいほど速い）
const SEGMENTS = 12; // 波の分割数（多いほど滑らか）
const WAVES = 2; // 波の山数

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

// CSS clip-path 用の path を作る（要素のローカル座標 px）
function makeWaveClipPath(
  w: number,
  h: number,
  progress01: number,
  phase: number
) {
  // 水面の基準Y（上から）
  const waterY = h * (1 - progress01);

  // 水面がほぼ0の時は“何も見せない”クリップに
  if (progress01 <= 0.0001) {
    // 面積0に近い形（下端の線だけ）にしておく
    return `M 0 ${h} L ${w} ${h} L ${w} ${h} L 0 ${h} Z`;
  }

  // 上端が波の面（左→右）
  const step = w / SEGMENTS;

  let d = `M 0 ${waterY}`;
  for (let i = 0; i <= SEGMENTS; i++) {
    const x = i * step;
    // 端が暴れないように少し抑えるなら i を使ってフェードも可能（今回はシンプルに）
    const y =
      waterY + Math.sin((i / SEGMENTS) * Math.PI * 2 * WAVES + phase) * AMP;
    d += ` L ${x} ${y}`;
  }

  // 波線から下を全部見せるために下側で閉じる
  d += ` L ${w} ${h} L 0 ${h} Z`;
  return d;
}

export const PiggyBank: React.FC<Props> = ({ width, height, progress }) => {
  // Web以外はこの方式は使えない（必要なら別実装にする）
  const isWeb = Platform.OS === "web";

  const fillLayerRef = useRef<HTMLDivElement | null>(null);

  // アニメーション用（DOMに直接書き込み、再レンダーを避ける）
  const rafRef = useRef<number | null>(null);
  const phaseRef = useRef(0);
  const curProgressRef = useRef(0);
  const targetProgressRef = useRef(clamp01(progress));

  // progressが変わったらターゲット更新（毎回0→pで演出したいなら、ここでcur=0に戻す）
  useEffect(() => {
    targetProgressRef.current = clamp01(progress);

    // 「毎回0から溜まる」演出にしたい場合はこの1行を有効化
    curProgressRef.current = 0;
  }, [progress]);

  useEffect(() => {
    if (!isWeb) return;

    const el = fillLayerRef.current;
    if (!el) return;

    const DURATION = 2200; // ms（溜まる時間）
    let startTs: number | null = null;

    const loop = (ts: number) => {
      if (startTs == null) startTs = ts;

      // 1) 進捗（0→target）をイージング付きで補間
      const t = Math.min(1, (ts - startTs) / DURATION);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      const p = targetProgressRef.current * eased;
      curProgressRef.current = p;

      // 2) 波位相を進める
      phaseRef.current += WAVE_SPEED;

      // 3) clip-path 更新
      const pathD = makeWaveClipPath(width, height, p, phaseRef.current);
      const clipValue = `path("${pathD}")`;

      // React style更新ではなくDOM直書き（軽い）
      el.style.clipPath = clipValue;
      // Safari/一部環境用
      // @ts-ignore
      el.style.webkitClipPath = clipValue;

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [isWeb, width, height]);

  return (
    <View style={[styles.wrap, { width, height }]}>
      {/* ベース（グレー） */}
      <PiggyGaugeBase width={width} height={height} />

      {/* Fill（青）を“波形の上端”で切り抜くレイヤー */}
      {/* Webだけ div を使う（RN Webなら View が div になるが、ref型が弱いので素直にdiv） */}
      {isWeb ? (
        <div
          ref={fillLayerRef}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width,
            height,
            // 初期状態（見えない）
            clipPath: `path("M 0 ${height} L ${width} ${height} L ${width} ${height} L 0 ${height} Z")`,
            WebkitClipPath: `path("M 0 ${height} L ${width} ${height} L ${width} ${height} L 0 ${height} Z")`,
          }}
        >
          <PiggyGaugeFill width={width} height={height} />
        </div>
      ) : (
        // Web以外は一旦そのまま表示（必要ならここにネイティブ用実装を入れる）
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <PiggyGaugeFill width={width} height={height} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { position: "relative" },
});
