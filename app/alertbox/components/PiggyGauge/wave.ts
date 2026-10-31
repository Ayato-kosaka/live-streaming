/**
 * 貯金箱の「溜まる」表現。中身の絵（fill）を、波打つ水面で下から切り抜く。
 *
 * 豚（`PiggyBank.tsx`）と季節の貯金箱（`season/ThemedBank.tsx`）の両方が使う。
 * **溜まり方を1か所に置く**ため。色は絵に任せて、ここは切り抜く形だけを決める。
 */
import { useEffect, useRef, type RefObject } from "react";

// 波の設定（“描画”ではなく“切り抜き境界”用）
const AMP = 8; // 波の高さ(px)
const WAVE_SPEED = 0.032; // 1フレームあたりの位相増分（大きいほど速い）
const SEGMENTS = 12; // 波の分割数（多いほど滑らか）
const WAVES = 2; // 波の山数

const DURATION = 2200; // ms（溜まる時間）
const PERIOD = 15000; // ms（サイクル時間）

export function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

/**
 * CSS clip-path 用の path を作る（要素のローカル座標 px）。
 *
 * `top` / `bottom` は「空」と「満杯」の水面の高さ。豚は箱いっぱいに描かれて
 * いるので 0 と h（既定）。季節の貯金箱は絵の中身の上下に合わせる
 * （絵の上下に透明な余白があっても、0% と 100% が中身の底と天辺に来るように）。
 */
export function makeWaveClipPath(
  w: number,
  h: number,
  progress01: number,
  phase: number,
  top = 0,
  bottom = h
) {
  // 水面の基準Y（上から）
  const waterY = top + (bottom - top) * (1 - progress01);

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
    const y =
      waterY + Math.sin((i / SEGMENTS) * Math.PI * 2 * WAVES + phase) * AMP;
    d += ` L ${x} ${y}`;
  }

  // 波線から下を全部見せるために下側で閉じる
  d += ` L ${w} ${h} L 0 ${h} Z`;
  return d;
}

/** 何も見せない初期の切り抜き（溜まり始める前） */
export const emptyClip = (w: number, h: number) =>
  `path("M 0 ${h} L ${w} ${h} L ${w} ${h} L 0 ${h} Z")`;

/**
 * `el` の clip-path を毎フレーム書き換えて、0 → progress まで溜め、波を揺らす。
 * 15秒ごとに 0 から溜め直す。**React の state は通さない**（DOM へ直に書く）。
 */
export function useWaveClip(
  ref: RefObject<HTMLDivElement | null>,
  enabled: boolean,
  width: number,
  height: number,
  progress: number,
  top?: number,
  bottom?: number
) {
  // アニメーション用（DOMに直接書き込み、再レンダーを避ける）
  const rafRef = useRef<number | null>(null);
  const phaseRef = useRef(0);
  const targetProgressRef = useRef(clamp01(progress));

  // progressが変わったらターゲット更新
  useEffect(() => {
    targetProgressRef.current = clamp01(progress);
  }, [progress]);

  useEffect(() => {
    if (!enabled) return;

    const el = ref.current;
    if (!el) return;

    let startTs: number | null = null;
    let cycleStartTs: number | null = null;

    const loop = (ts: number) => {
      if (cycleStartTs == null) cycleStartTs = ts;

      // 周期でサイクルを切り替える
      const cycleT = ts - cycleStartTs;
      if (cycleT >= PERIOD) {
        cycleStartTs = ts;
        startTs = ts; // fill開始時刻リセット
      }
      if (startTs == null) startTs = cycleStartTs;

      // 1) 進捗（0→target）をイージング付きで補間（easeOutCubic）
      const t = Math.min(1, (ts - startTs) / DURATION);
      const eased = 1 - Math.pow(1 - t, 3);
      const p = targetProgressRef.current * eased;

      // 2) 波位相を進める
      phaseRef.current += WAVE_SPEED;

      // 3) clip-path 更新（React style更新ではなくDOM直書き）
      const pathD = makeWaveClipPath(width, height, p, phaseRef.current, top, bottom);
      const clipValue = `path("${pathD}")`;
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
  }, [enabled, width, height, top, bottom, ref]);
}
