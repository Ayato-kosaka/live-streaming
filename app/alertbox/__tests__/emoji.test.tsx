/**
 * 名簿で絵文字を持つ人の花火と雨（`components.tsx`）。
 *
 * 粒を react-native-web の `Animated`（web では1コマごとに React で描き直す）から
 * Web Animations（合成の側で進む）に移した（#1079）。守りたいのは「見た目は前と同じ」。
 *
 *   1. 曲線が前の `Easing` と同じ形（CSS の cubic-bezier を解いて、Easing と突き合わせる）
 *   2. 粒の数・時間・飛ぶ先・出る時刻が前と同じ
 *   3. 描き直しても（箱を広げても）粒を作り直さない・止めない（#1083）
 *   4. 外したら止める（後ろで動き続けない）
 *
 *   npx jest app/alertbox
 *
 * **対照を先に置く**（`island-misses.md` #99）。曲線を突き合わせる道具が「違う曲線は違う」と
 * 言えることを先に見る。そうしないと、道具が壊れていても全部通ってしまう。
 */
import React from "react";
import renderer, { act } from "react-test-renderer";
import { Easing } from "react-native";
import { EASE, EmojiEffects, fireworkVector, windKeyframes } from "../components";

/* jest-expo の Text・View は部品の偽物で、ref に DOM の代わり（createNodeMock）が届かない。
   web と同じく ref が要素そのものを指すように、ここだけ素の要素に差し替える。
   **差し替えないと animate が1回も呼ばれず、下の「作り直さない」は何も見ないで通る** */
jest.mock("react-native", () => {
  const RN = jest.requireActual("react-native");
  const R = jest.requireActual("react");
  const host = (name: string) =>
    R.forwardRef((props: object, ref: unknown) => R.createElement(name, { ...props, ref }));
  return Object.setPrototypeOf({ Text: host("Text"), View: host("View") }, RN);
});

/** CSS の cubic-bezier(x1, y1, x2, y2) を、時刻 t（0〜1）で解く（x(s) = t を二分法で） */
const cssBezier = (spec: string) => {
  const m = spec.match(/cubic-bezier\(([^)]+)\)/);
  if (!m) throw new Error(`cubic-bezier ではない: ${spec}`);
  const [x1, y1, x2, y2] = m[1].split(",").map(Number);
  const b = (p1: number, p2: number, s: number) => 3 * (1 - s) * (1 - s) * s * p1 + 3 * (1 - s) * s * s * p2 + s * s * s;
  return (t: number) => {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (b(x1, x2, mid) < t) lo = mid;
      else hi = mid;
    }
    return b(y1, y2, (lo + hi) / 2);
  };
};

/** 0〜1 を 1000 等分して、2つの曲線のいちばん大きな差 */
const maxGap = (f: (t: number) => number, g: (t: number) => number) => {
  let gap = 0;
  for (let i = 0; i <= 1000; i++) gap = Math.max(gap, Math.abs(f(i / 1000) - g(i / 1000)));
  return gap;
};

/** 風のキーフレーム（真ん中で切った2本）の値を、時刻 t（0〜1）で */
const windAt = (wind: number, t: number) => {
  const [k0, k1, k2] = windKeyframes(wind);
  const x = (k: Keyframe) => Number(String(k.transform).match(/translateX\(([-\d.]+)px\)/)![1]);
  if (t < 0.5) return x(k0) + (x(k1) - x(k0)) * cssBezier(String(k0.easing))(t / 0.5);
  return x(k1) + (x(k2) - x(k1)) * cssBezier(String(k1.easing))((t - 0.5) / 0.5);
};

describe("曲線が前の Easing と同じ形", () => {
  it("対照: 違う曲線は違うと言える（CSS の ease と react-native の Easing.ease は別物）", () => {
    expect(maxGap(cssBezier("cubic-bezier(0.25, 0.1, 0.25, 1)"), Easing.ease)).toBeGreaterThan(0.05);
    expect(maxGap(cssBezier(EASE.outQuad), Easing.out(Easing.ease))).toBeGreaterThan(0.05);
  });

  it("打ち上げと消え方: Easing.out(Easing.quad)", () => {
    expect(maxGap(cssBezier(EASE.outQuad), Easing.out(Easing.quad))).toBeLessThan(1e-3);
  });

  it("花火の粒: Easing.out(Easing.ease)", () => {
    expect(maxGap(cssBezier(EASE.outEase), Easing.out(Easing.ease))).toBeLessThan(1e-3);
  });

  it("雨の風: Easing.inOut(Easing.ease) を真ん中で切った2本", () => {
    for (const wind of [-100, -37.5, 64, 100]) {
      const inOut = Easing.inOut(Easing.ease);
      expect(maxGap((t) => windAt(wind, t), (t) => wind * inOut(t))).toBeLessThan(0.1); // px
    }
  });

  it("花火の粒は 16 方向に均等、1500px", () => {
    expect(fireworkVector(0)).toEqual({ x: 1500, y: 0 });
    expect(fireworkVector(4).x).toBeCloseTo(0);
    expect(fireworkVector(4).y).toBeCloseTo(1500);
    expect(fireworkVector(8).x).toBeCloseTo(-1500);
  });
});

/* ---- 動かし方（element.animate を偽物にして、何をいつ頼んだかを数える） ---- */

type Call = { frames: Keyframe[]; opts: KeyframeAnimationOptions; cancel: jest.Mock; at: number };
let calls: Call[] = [];
const fakeNode = () => ({
  parentElement: { clientHeight: 776 },
  animate: (frames: Keyframe[], opts: KeyframeAnimationOptions) => {
    const c: Call = { frames, opts, cancel: jest.fn(), at: Date.now() };
    calls.push(c);
    return { cancel: c.cancel };
  },
});
const mount = (el: React.ReactElement) => {
  let r!: renderer.ReactTestRenderer;
  act(() => {
    r = renderer.create(el, { createNodeMock: fakeNode });
  });
  return r;
};
const tick = (ms: number) => act(() => void jest.advanceTimersByTime(ms));

beforeEach(() => {
  calls = [];
  jest.useFakeTimers();
  // 個別の translate が使えるブラウザ（PRISM の WebView・Chrome）
  (global as { CSS?: unknown }).CSS = { supports: () => true };
});
afterEach(() => {
  jest.useRealTimers();
  delete (global as { CSS?: unknown }).CSS;
});

describe("花火（1万円ごとに1発）", () => {
  const fx = <EmojiEffects emoji="🌸" fireworksCount={1} rainsCount={0} alertDuration={60} />;

  it("1秒で打ち上げ、弾けて 16粒が 15 秒かけて飛び、8秒目から1秒で消えて外れる", () => {
    const r = mount(fx);
    tick(0);
    const rise = calls.filter((c) => c.opts.duration === 1000 && String(c.frames[1].transform).startsWith("translateY"));
    expect(rise).toHaveLength(1);
    expect(rise[0].opts.easing).toBe(EASE.outQuad);
    // -10% から maxBottom%（40〜90%）まで。箱 776px の 50〜100% を上がる
    const up = -Number(String(rise[0].frames[1].transform).match(/translateY\(([-\d.]+)px\)/)![1]);
    expect(up).toBeGreaterThanOrEqual(776 * 0.5 - 0.01);
    expect(up).toBeLessThanOrEqual(776 * 1.0 + 0.01);

    tick(999);
    expect(calls.filter((c) => c.opts.duration === 15000)).toHaveLength(0); // まだ弾けない
    tick(100); // 1秒経った次のコマ
    const parts = calls.filter((c) => c.opts.duration === 15000);
    expect(parts).toHaveLength(16);
    parts.forEach((c, j) => {
      expect(c.opts.easing).toBe(EASE.outEase);
      const { x, y } = fireworkVector(j);
      expect(String(c.frames[1].transform)).toBe(`translateX(${Math.round(x * 1000) / 1000}px) translateY(${Math.round(y * 1000) / 1000}px)`);
    });
    // 弾けたら打ち上げの移動は外す（% の置き方に戻る）
    expect(rise[0].cancel).toHaveBeenCalled();

    tick(8000 - 1099); // 打ち上げの始まりから8秒
    const fade = calls.filter((c) => c.frames[0].opacity === 1);
    expect(fade).toHaveLength(1);
    expect(fade[0].opts).toMatchObject({ duration: 1000, easing: EASE.outQuad, fill: "forwards" });
    expect(JSON.stringify(r.toJSON())).toContain("🌸");
    tick(1000);
    expect(r.toJSON() && JSON.stringify(r.toJSON()).includes("🌸")).toBe(false);
  });

  it("描き直しても（箱を広げても）作り直さない・止めない", () => {
    const r = mount(fx);
    tick(1200);
    const n = calls.length;
    expect(n).toBe(17); // 打ち上げ1 + 粒16（数える前に、本当に頼んでいることを見る）
    act(() => r.update(<EmojiEffects emoji="🌸" fireworksCount={1} rainsCount={0} alertDuration={60} />));
    tick(500);
    expect(calls.length).toBe(n);
    expect(calls.filter((c) => c.cancel.mock.calls.length && c.opts.duration === 15000)).toHaveLength(0);
  });

  it("外したら止める（あとから頼まない）", () => {
    const r = mount(fx);
    tick(1200);
    const parts = calls.filter((c) => c.opts.duration === 15000);
    expect(parts).toHaveLength(16); // 止める相手が本当にいることを先に見る
    act(() => r.unmount());
    expect(parts.every((c) => c.cancel.mock.calls.length === 1)).toBe(true);
    const n = calls.length;
    tick(20000);
    expect(calls.length).toBe(n);
  });
});

describe("雨（100円ごとに1粒）", () => {
  // 1,000円: 10粒を、出ている 18 秒（3 + 15）から 2 秒引いた間に均等に降らせる
  const rain = <EmojiEffects emoji="🌸" fireworksCount={0} rainsCount={10} alertDuration={18} />;

  it("粒は降り始める時刻に動き出し、落ちる（translate）と風（transform）の2本を1回ずつ掛けて、落ちた先で止まる", () => {
    mount(rain);
    tick(0);
    expect(calls).toHaveLength(2); // 1粒目だけ
    const [fall, wind] = calls;
    expect(fall.frames.map((f) => f.translate)).toEqual(["0px -50px", expect.stringMatching(/^0px [\d.]+px$/)]);
    /* 繰り返さない。前の Animated.loop は web では1回で止まっていた（useNativeDriver: true で
       ネイティブの繰り返しに回り、JS に落ちた動きは回数を読まない）。見た目を変えないので同じにする */
    expect(fall.opts.iterations).toBeUndefined();
    expect(fall.opts.fill).toBe("forwards");
    expect(fall.opts.easing).toBe("linear");
    expect(fall.opts.duration).toBeGreaterThanOrEqual(5000);
    expect(fall.opts.duration).toBeLessThan(7000);
    expect(wind.opts).toEqual({ duration: 3000, fill: "forwards" });
    expect(wind.frames).toHaveLength(3);

    tick(1600 - 1);
    expect(calls).toHaveLength(2);
    tick(1);
    expect(calls).toHaveLength(4); // 2粒目（(18000 - 2000) / 10 = 1600ms ごと）
    tick(1600 * 8);
    expect(calls).toHaveLength(20); // 10粒
    tick(60000);
    expect(calls).toHaveLength(20); // 増えない
  });

  it("translate の無いブラウザでは、風を付けずに落とすだけ", () => {
    delete (global as { CSS?: unknown }).CSS;
    mount(rain);
    tick(0);
    expect(calls).toHaveLength(1);
    expect(String(calls[0].frames[1].transform)).toMatch(/^translateY\([\d.]+px\)$/);
  });

  it("描き直しても作り直さない・外したら止める", () => {
    const r = mount(rain);
    tick(5000);
    const n = calls.length;
    expect(n).toBe(8); // 4粒 × 2本（0・1.6・3.2・4.8 秒）
    act(() => r.update(<EmojiEffects emoji="🌸" fireworksCount={0} rainsCount={10} alertDuration={18} />));
    expect(calls.length).toBe(n);
    expect(calls.some((c) => c.cancel.mock.calls.length)).toBe(false);
    act(() => r.unmount());
    expect(calls.every((c) => c.cancel.mock.calls.length === 1)).toBe(true);
    tick(60000);
    expect(calls.length).toBe(n);
  });
});
