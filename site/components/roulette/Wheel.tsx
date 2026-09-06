"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  SHELL_COLORS,
  WHEEL_COLORS,
  type WheelTheme,
  ease,
  labelSize,
  labelText,
  polar,
  resultSize,
  spinTo,
  wedgePath,
} from "./wheel";

type Props = {
  /** 輪に載せる字。空なら回らない */
  labels: string[];
  theme: WheelTheme;
  /** 回っている秒数 */
  duration: number;
  /** 何周するか */
  turns: number;
  sound: boolean;
  /**
   * 回し始めの時刻（この端末の時計で）。null なら止まっている。
   *
   * **サーバーから来た号令は、ここに時刻で入る。** 表示側は
   * 「いつ回り始めたか」だけを見て動くので、OBS を読み込み直しても
   * 同じところで止まる（`spinTo` を見る）。
   */
  spinAt: number | null;
  /** 当たりの番号。サーバーが決めたもの */
  spinIndex: number | null;
  /** 結果を何秒出すか。0 は出しっぱなし */
  resultDuration?: number;
  /** 押して回せるようにするか（URL だけで使うとき） */
  onTap?: () => void;
  /** 結果の札の下に添えるもの（誰のコメントだったか） */
  resultFoot?: React.ReactNode;
};

/**
 * ルーレットの輪。**いま配信で使っているものを写したもの**（#164）。
 *
 * 色も角度もイーズも `wheel.ts` に写してある。ここは動かすところだけ。
 *
 * ## 毎フレーム setState を呼ばない
 *
 * 写した元は、角度を state に持って毎フレーム描き直していた。
 * 島の決まりは「動くものは React の外」（`docs/island-design.md` 3章）で、
 * ここは扇・字・釘で 100 個を超える要素があるので、そのまま持ってくると
 * 1フレームごとに全部を作り直すことになる。**角度と針の刻みは ref から
 * DOM に直接書く。** React が描き直すのは、回り始めと止まったときだけ。
 */
export default function Wheel({
  labels,
  theme,
  duration,
  turns,
  sound,
  spinAt,
  spinIndex,
  resultDuration = 0,
  onTap,
  resultFoot,
}: Props) {
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const wheelRef = useRef<SVGSVGElement | null>(null);
  const pointRef = useRef<HTMLDivElement | null>(null);
  const rot = useRef(0);
  const raf = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audio = useRef<AudioContext | null>(null);
  /** もう回した号令。同じ号令で二度回さないための目印 */
  const done = useRef<number | null>(null);

  const n = labels.length;
  const step = n ? 360 / n : 360;
  const colors = WHEEL_COLORS[theme];

  /** 刻みの音。写した元と同じ矩形波。 */
  const beep = useCallback(
    (v: number) => {
      if (!sound || typeof window === "undefined") return;
      try {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!Ctor) return;
        const ac = audio.current ?? new Ctor();
        audio.current = ac;
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = "square";
        osc.frequency.setValueAtTime(260 + v * 170, ac.currentTime);
        gain.gain.setValueAtTime(0.026 + v * 0.02, ac.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.035);
        osc.connect(gain).connect(ac.destination);
        osc.start();
        osc.stop(ac.currentTime + 0.04);
      } catch {
        /* 音が出せない端末では黙って回る */
      }
    },
    [sound],
  );

  useEffect(() => {
    // 号令が下りていない、または取り消された
    if (spinAt === null || spinIndex === null || !n) {
      if (spinAt === null) {
        done.current = null;
        setResult(null);
      }
      return;
    }
    if (done.current === spinAt) return;
    done.current = spinAt;

    if (raf.current) cancelAnimationFrame(raf.current);
    if (timer.current) clearTimeout(timer.current);
    setResult(null);
    setSpinning(true);

    const base = rot.current;
    const end = spinTo(base, spinIndex, n, turns);
    const total = end - base;
    const slow = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ms = slow ? Math.min(1100, duration * 1000) : duration * 1000;
    /* もう終わっている号令（OBS を回り終わったあとに開いた）。
       そのときは音を鳴らさない。結果だけを出す。 */
    const silent = Date.now() - spinAt > ms;
    let last = -1;

    const frame = () => {
      const i = Math.min(1, (Date.now() - spinAt) / ms);
      const deg = base + total * ease(i);
      rot.current = deg;
      if (wheelRef.current) {
        wheelRef.current.style.transform = `rotate(${deg}deg)`;
      }
      const k = Math.floor((deg - base) / Math.max(8, step));
      if (k !== last) {
        last = k;
        if (pointRef.current) {
          pointRef.current.dataset.tick = k % 2 ? "a" : "b";
        }
        if (!silent) beep(Math.max(0.15, 1 - i));
      }
      if (i < 1) {
        raf.current = requestAnimationFrame(frame);
        return;
      }
      rot.current = end;
      setSpinning(false);
      setResult(spinIndex);
      if (!silent) beep(1);
      if (resultDuration > 0) {
        timer.current = setTimeout(
          () => setResult(null),
          resultDuration * 1000,
        );
      }
    };
    raf.current = requestAnimationFrame(frame);
  }, [spinAt, spinIndex, n, step, turns, duration, resultDuration, beep]);

  useEffect(
    () => () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      if (timer.current) clearTimeout(timer.current);
      audio.current?.close();
    },
    [],
  );

  const tap = onTap && !spinning ? onTap : undefined;

  return (
    <section
      className={`rl-stage${spinning ? " is-spinning" : ""}${
        result === null ? "" : " has-result"
      }`}
      style={{ ["--shell" as string]: SHELL_COLORS[theme] }}
      role={onTap ? "button" : undefined}
      tabIndex={onTap ? 0 : undefined}
      aria-label={onTap ? (spinning ? "回っています" : "ルーレットを回す") : undefined}
      aria-busy={spinning}
      onClick={tap}
      onKeyDown={
        onTap
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                tap?.();
              }
            }
          : undefined
      }
    >
      <div className="rl-pointer" ref={pointRef} data-tick="b" aria-hidden>
        <div className="rl-pointer-cap" />
        <div className="rl-pointer-tip" />
      </div>
      <div className="rl-housing">
        <div className="rl-highlight" aria-hidden />
        <div className="rl-well">
          <div className="rl-well-shadow" aria-hidden />
          <svg className="rl-wheel" viewBox="0 0 600 600" ref={wheelRef} aria-hidden>
            <defs>
              <filter id="rl-inner" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow
                  dx="0"
                  dy="5"
                  stdDeviation="5"
                  floodColor="#111"
                  floodOpacity=".28"
                />
              </filter>
              <filter id="rl-glow" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow
                  dx="0"
                  dy="0"
                  stdDeviation="13"
                  floodColor="#fff7a6"
                  floodOpacity="1"
                />
              </filter>
            </defs>
            <circle cx="300" cy="300" r="283" fill="#f7f5e9" stroke="#174628" strokeWidth="12" />
            <circle cx="300" cy="300" r="258" fill="#fff" stroke="#d7d5c9" strokeWidth="8" />
            {n === 1 ? (
              <circle
                className={result === 0 ? "rl-won" : undefined}
                cx="300"
                cy="300"
                r="246"
                fill={colors[0]}
              />
            ) : (
              labels.map((_, i) => (
                <path
                  key={`w${i}`}
                  d={wedgePath(i, n)}
                  fill={colors[i % colors.length]}
                  stroke="#ffffff"
                  strokeOpacity=".38"
                  strokeWidth="3"
                  className={result === i ? "rl-won" : undefined}
                />
              ))
            )}
            {labels.map((label, i) => {
              const deg = -90 + i * step;
              const at = polar(178, deg);
              return (
                <text
                  key={`t${i}`}
                  className="rl-label"
                  x={at.x}
                  y={at.y}
                  fontSize={labelSize(label, n)}
                  transform={`rotate(${deg + 90} ${at.x} ${at.y})`}
                >
                  {labelText(label)}
                </text>
              );
            })}
            <circle
              cx="300"
              cy="300"
              r="105"
              fill="#fbfbf6"
              stroke="#1b4b2a"
              strokeWidth="8"
              filter="url(#rl-inner)"
            />
            {colors.slice(0, Math.min(colors.length, 10)).map((c, i, arr) => {
              const deg = i * (360 / arr.length) - 90;
              const a = polar(63, deg);
              const b = polar(92, deg);
              return (
                <line
                  key={`r${i}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={c}
                  strokeWidth="4"
                  strokeLinecap="round"
                />
              );
            })}
            <circle cx="300" cy="300" r="58" fill="#f8f6ee" stroke="#cecac0" strokeWidth="10" />
            <circle cx="300" cy="300" r="8" fill="#bbb8b0" />
            {labels.map((_, i) => {
              const deg = -90 + i * step;
              const at = polar(270, deg);
              return (
                <g key={`p${i}`} transform={`rotate(${deg + 90} ${at.x} ${at.y})`}>
                  <rect
                    x={at.x - 9}
                    y={at.y - 20}
                    width="18"
                    height="40"
                    rx="9"
                    fill="#f8faf8"
                    stroke="#d6d9d7"
                    strokeWidth="3"
                  />
                </g>
              );
            })}
          </svg>
        </div>
        <div className="rl-hub" aria-hidden>
          <span>{spinning ? "•••" : "まわす"}</span>
        </div>
        <div className="rl-lever" aria-hidden>
          <span />
        </div>
      </div>
      <div className="rl-result" aria-live="polite" aria-atomic="true">
        {result !== null && labels[result] !== undefined && (
          <div
            className="rl-card"
            style={{ ["--result-size" as string]: resultSize(labels[result]) }}
          >
            <span className="rl-kicker">けってい!</span>
            <strong>{labels[result]}</strong>
            {resultFoot}
          </div>
        )}
      </div>
    </section>
  );
}
