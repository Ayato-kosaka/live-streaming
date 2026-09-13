"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  LINE,
  solveSize,
  wedgeWidth,
  SHELL_COLORS,
  WHEEL_COLORS,
  type WheelTheme,
  ease,
  polar,
  resultSize,
  spinTo,
  wedgePath,
  wheelPlan,
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
  /**
   * 輪が止まる向き（度）。**札の上下を決めるのに要る。**
   *
   * 輪ぜんぶを `transform: rotate()` で回すので、止まったあとの札は
   * 「作ったときの向き ＋ 回った角」のところにいる。作ったときの向きだけで
   * 上下を決めると、**回り終わったとたんに下半分の札がさかさまになる**
   * （実測で6件中4枚）。回し始めに終わりの角が分かっているので、
   * そこで入れて、回っているあいだに向きを直しておく。
   */
  const [turn, setTurn] = useState(0);
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

  /** 輪に載せるもの。字が読める大きさに収まらなければ番号に落ちる */
  const plan = useMemo(() => wheelPlan(labels), [labels]);
  /** 扇の幅の係数。描いたあとの測り直しで使う */
  const tw = wedgeWidth(n || 1);
  const labelRef = useRef<SVGGElement | null>(null);

  /**
   * 描いたあと、**実際に描かれた長さ**で札の大きさを決め直す。
   *
   * `wheel.ts` の見込みは字1つ 0.94em の当たりで、書体が届く前や
   * 見たことのない字（記号・見慣れない漢字）では外れる。外れたまま出すと、
   * また扇からはみ出す。ここで `getComputedTextLength()` を読んで、
   * 扇に入る大きさを解き直す（式は `sizeOf` と同じもの）。
   *
   * **`setState` を呼ばない。** DOM に直接書く（`docs/island-design.md` 3章）。
   */
  useLayoutEffect(() => {
    const g = labelRef.current;
    if (!g) return;
    const place = g.dataset.place === "along" ? "along" : "across";
    const fit = () => {
      for (const grp of Array.from(g.children) as SVGGElement[]) {
        const base = Number(grp.dataset.fit);
        const tw = Number(grp.dataset.tw);
        const flip = grp.dataset.flip === "1";
        const texts = Array.from(grp.children) as SVGTextElement[];
        const k = texts.length;
        if (!base || !k) continue;
        // いちばん長い行の、字の大きさ1あたりの長さ
        let m = 0;
        for (const t of texts) m = Math.max(m, t.getComputedTextLength() / base);
        if (!(m > 0)) continue;
        /* **縮めるだけ。伸ばさない。** 見込みが実測より小さかったぶんを
           足し戻すと、番号の輪で桁ごとに大きさが変わる（`wheelPlan` が
           わざわざ揃えているものを、ここで崩すことになる）。 */
        const solved = solveSize(m, k, tw, place);
        const size = Math.min(base, solved.size);
        const rOut = size < base ? solved.rOut : Number(grp.dataset.rout);
        if (Math.abs(size - base) < 0.05) continue;
        texts.forEach((t, j) => {
          t.setAttribute("font-size", String(size));
          if (place === "along") {
            t.setAttribute("x", String(flip ? 300 - rOut : 300 + rOut));
            t.setAttribute("y", String(300 + (j - (k - 1) / 2) * LINE * size));
          } else {
            const r = rOut - ((flip ? k - 1 - j : j) + 0.5) * LINE * size;
            t.setAttribute("y", String(flip ? 300 + r : 300 - r));
          }
        });
      }
    };
    fit();
    /* 書体は遅れて届く。届いた時点でもう一度合わせる
       （`page.tsx` は `display: "swap"` なので、初回は控えの字幅で描かれる） */
    document.fonts?.ready.then(fit).catch(() => {});
    // `turn` が変わると札の上下が入れ替わる。y の並びも取り直す
  }, [plan, turn]);

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
    // 終わりの向きは、回り始めにもう決まっている。札の上下をここで合わせる
    setTurn(((end % 360) + 360) % 360);
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
                  className={`rl-wedge${result === i ? " rl-won" : ""}`}
                />
              ))
            )}
            <g ref={labelRef} data-place={plan.place}>
              {plan.labels.map((lab, i) => {
                /* 扇のまん中の向き。3時が 0 度で、12時が -90 度 */
                const a = -90 + i * step;
                /* 字の走る向き。`across` は半径と直角なので a+90、
                   `along` は半径に沿うので a。
                   **見た目の向き（＝これに輪の回った角を足したもの）を
                   ±90度の中に入れる。** 入れれば字が上下さかさまにならない。
                   半周ぶん回した側は `flip` を立てて、行の並びを裏返す */
                const g0 = plan.place === "across" ? a + 90 : a;
                let seen = ((((g0 + turn + 180) % 360) + 360) % 360) - 180;
                let flip = false;
                if (seen > 90) {
                  seen -= 180;
                  flip = true;
                } else if (seen <= -90) {
                  seen += 180;
                  flip = true;
                }
                // 輪ごと回る角を引いて、SVG の中での角に戻す
                const rot = seen - turn;
                const k = lab.lines.length;
                return (
                  <g
                    key={`t${i}`}
                    transform={`rotate(${rot} 300 300)`}
                    data-fit={lab.size}
                    data-rout={lab.rOut}
                    data-tw={tw}
                    data-flip={flip ? 1 : 0}
                  >
                    {lab.lines.map((line, j) => {
                      if (plan.place === "along") {
                        // 輪の縁を起点に、中心へ向けて書く
                        return (
                          <text
                            key={j}
                            className="rl-label"
                            x={flip ? 300 - lab.rOut : 300 + lab.rOut}
                            y={300 + (j - (k - 1) / 2) * LINE * lab.size}
                            fontSize={lab.size}
                            textAnchor={flip ? "start" : "end"}
                          >
                            {line}
                          </text>
                        );
                      }
                      // 半径と直角。行は外から内へ積む（裏返した側は内から外へ）
                      const r = lab.rOut - ((flip ? k - 1 - j : j) + 0.5) * LINE * lab.size;
                      return (
                        <text
                          key={j}
                          className="rl-label"
                          x={300}
                          y={flip ? 300 + r : 300 - r}
                          fontSize={lab.size}
                          textAnchor="middle"
                        >
                          {line}
                        </text>
                      );
                    })}
                  </g>
                );
              })}
            </g>
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
