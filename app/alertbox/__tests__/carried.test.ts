/**
 * @jest-environment jsdom
 */

/**
 * 段7 の運ばれてくる札が、主役の顔の箱の下＋2%（manifest の段の `plateTop`）より上を通らない（#1141）。
 *
 *   npx jest app/alertbox/__tests__/carried.test.ts
 *
 * 664x1180・長い名前・3行で 40vh 上から落とすと、字の上の端が 8.5% まで上がり、あやとの顔の下の端（9.2〜9.5%）に掛かった。
 * 守りたいのは3つ。
 *   1. manifest の `plateTop` を読み、動画の段の札の段取り（plateTiming）まで渡る。書いていない段・おかしな値は渡らない
 *   2. 落ち始めの高さは、札の上の端が傾きと最初のコマの 5% 増しを含めて線より上に出ないところ。いつもの 40vh より上からは落とさない
 *   3. 線が無ければ、いつもの 40vh 上から（対照）
 *
 * jsdom は置き場を持たないので、offset* と client* を差し替えて置く。
 */
import { carriedFrom } from "../season/plate/RichText";
import { parseFxManifest, type VideoPlan } from "../season/show/fxVideo";
import { plateTiming, videoCues, type AlertStage } from "../season/show/stage";

function place(el: HTMLElement, r: { top?: number; h?: number; w?: number; cw?: number; ch?: number }) {
  const def = (k: string, v: number | undefined) => v != null && Object.defineProperty(el, k, { configurable: true, get: () => v });
  def("offsetTop", r.top);
  def("offsetHeight", r.h);
  def("offsetWidth", r.w);
  def("clientWidth", r.cw);
  def("clientHeight", r.ch);
}

/** アラートの面（664x1180）・札の置き場（textCenterY を中心に translateY(-50%)）・札の箱 */
function plate(slotH: number, boxW: number) {
  const host = document.createElement("div");
  const slot = document.createElement("div");
  const box = document.createElement("div");
  host.append(slot);
  slot.append(box);
  document.body.append(host);
  place(host, { cw: 664, ch: 1180 });
  place(slot, { top: 590, h: slotH });
  place(box, { top: 0, w: boxW });
  return box;
}

const px = (s: string) => Number(s.replace("px", ""));
const tilt = (w: number) => (w / 2) * Math.sin((4 * Math.PI) / 180);

afterEach(() => {
  document.body.innerHTML = "";
});

describe("1. manifest の plateTop が、札の段取りまで渡る", () => {
  const one = (extra: Record<string, unknown>) =>
    parseFxManifest({ tiers: { "7": { revealAt: 5.6, introDur: 7, stayDur: 3, outroDur: 1.5, variants: { full: { back: { intro: "i.webm", stay: "s.webm", outro: "o.webm" } } }, ...extra } } })["7"];

  it("書いてあれば読む・書いていなければ無い・おかしな値は受けない", () => {
    expect(one({ plateTop: 0.125 })?.plateTop).toBe(0.125);
    expect(one({})).not.toHaveProperty("plateTop");
    for (const v of [0, -0.1, 0.5, 2, "0.1", null]) expect(one({ plateTop: v })).not.toHaveProperty("plateTop");
  });

  it("動画の段の運ばれてくる札（count）にだけ carriedTop が付く", () => {
    const video = { key: "7-full", revealAt: 5.6, headroom: 0.3, charBottom: null, plateTop: 0.125, text: "count" } as unknown as VideoPlan;
    const st = { video, cues: videoCues(video), revealSec: 5.6 } as unknown as AlertStage;
    expect(plateTiming(st).carried).toBe(true);
    expect(plateTiming(st).carriedTop).toBe(0.125);
    const pop = { ...video, text: "pop" } as VideoPlan;
    expect(plateTiming({ ...st, video: pop, cues: videoCues(pop) } as AlertStage)).not.toHaveProperty("carriedTop");
  });
});

describe("2. 落ち始めの高さ: 札の上の端は線より上に出ない", () => {
  it.each([
    ["長い名前・3行（背の高い札）", 700, 600],
    ["短い名前・メッセージ無し（低い札）", 160, 200],
  ])("%s", (_, slotH, boxW) => {
    const box = plate(slotH, boxW);
    const f = carriedFrom(box, 0.125);
    const rest = 590 - slotH / 2;
    // 動画は 720×1280 を cover。線は動画の枠の高さの 12.5%
    const vh = 1280 * Math.max(664 / 720, 1180 / 1280);
    const line = (1180 - vh) / 2 + 0.125 * vh;
    // 透明の最初のコマ（start）でも、傾いた端が線にちょうど届くところまで
    expect(rest + px(f.start) - tilt(boxW)).toBeGreaterThanOrEqual(line - 0.1);
    expect(px(f.top)).toBeLessThanOrEqual(0);
    // いつもの 40vh より上からは落とさない
    expect(-px(f.top)).toBeLessThanOrEqual(0.4 * window.innerHeight + 0.1);
  });

  it("札がもう線の近くに止まるなら、落とさない（揺れるだけ）", () => {
    const box = plate(2000, 600);
    expect(px(carriedFrom(box, 0.125).top)).toBe(0);
  });
});

describe("3. 対照: 線が無ければいつもの 40vh 上から", () => {
  it("plateTop が無い段", () => {
    const box = plate(700, 600);
    expect(carriedFrom(box, undefined)).toEqual({ start: "-42vh", top: "-40vh" });
  });
});
