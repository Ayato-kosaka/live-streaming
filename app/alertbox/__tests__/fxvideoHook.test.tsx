/**
 * @jest-environment jsdom
 */

/**
 * 11月の演出の動画を、いつ読み、どの通知に渡すか（`season/show/useTierVideo.ts`。#1095）。
 *
 *   npx jest app/alertbox/__tests__/fxvideoHook.test.tsx
 *
 * 守りたいのは5つ。
 *   1. 出すと決めていないテーマは、旗が無い（本番の URL）日に**1バイトも落とさない**（manifest も読まない）。段も差し替えない
 *      （11月の城は配信に出したので、旗なしでも温める。その日の決まりは `fxliveHook.test.tsx`）
 *   2. `still=1`（iPhone の日）は、旗があっても1バイトも落とさない。段は差し替えるが、動画は渡さない
 *   3. 旗がある日は、貯金箱が出て 4 秒おいてから manifest → 持つ順に1本ずつ落として手元（Blob）に持つ
 *   4. 投げ銭の段の動画を用意してから渡す。`<video>` に渡すのは手元の URL（元の URL は読ませない）。
 *      持っていなければその場で取り寄せる。渡したら手元に残さない（同じ要素を2件で使い回さない）
 *   5. 段取りに、manifest の段のキャラ絵の箱の下の端（`charBottom`）を載せる（〜999円の3段。書いていない段は null）
 *
 * jsdom の `<video>` は読み込まないので、readyState を「最後まで流せる」(4) に差し替えて、用意が済んだことにする。
 */
import React from "react";
import renderer, { act } from "react-test-renderer";
import { Platform } from "react-native";
import { readFileSync } from "fs";
import { join } from "path";
import { THEMES, type FxTier, type SeasonTheme } from "../themes";
import { useTierVideo, type TierVideoState } from "../season/show/useTierVideo";
import { resetFxHoldForTest } from "../season/show/fxHold";

Object.defineProperty(Platform, "OS", { value: "web", configurable: true, writable: true });
Object.defineProperty(window.HTMLMediaElement.prototype, "readyState", { configurable: true, get: () => 4 });
Object.defineProperty(window.HTMLMediaElement.prototype, "load", { configurable: true, value: jest.fn() });
Object.defineProperty(window.HTMLMediaElement.prototype, "pause", { configurable: true, value: jest.fn() });

const castle = THEMES.find((t) => t.id === "castle")!;
const MANIFEST = readFileSync(join(__dirname, "../../../public/alert/themes/castle/fx/manifest.json"), "utf8");

/* jsdom には URL.createObjectURL が無い。手元の URL は「blob:番号」にする（どの本の URL かは要素の data-src で読む） */
let blobN = 0;
(URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = jest.fn(() => `blob:fx-${++blobN}`);
(URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = jest.fn();
const blobOf = (n: number) => async () => new Blob([new Uint8Array(n)]);

let fetched: string[] = [];
beforeEach(() => {
  fetched = [];
  resetFxHoldForTest();
  (global as { fetch?: unknown }).fetch = jest.fn(async (url: string) => {
    fetched.push(url);
    if (url.endsWith("manifest.json")) return { ok: true, json: async () => JSON.parse(MANIFEST) };
    return { ok: true, blob: blobOf(100 * 1024) };
  });
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
  window.history.replaceState({}, "", "/");
});

function mount(theme: SeasonTheme | null, opts: { still: boolean; bankReady: boolean }) {
  const got: { v: TierVideoState | null } = { v: null };
  const Probe = (p: { o: typeof opts }) => {
    got.v = useTierVideo(theme, p.o);
    return null;
  };
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<Probe o={opts} />);
  });
  return { got, update: (o: typeof opts) => act(() => tree.update(<Probe o={o} />)), tree: tree! };
}
/** 時計を進めて、そのあいだに起きた fetch の続きを流す */
async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
  for (let i = 0; i < 80; i++) await act(async () => {});
}
const tierOf = (yen: number): FxTier => {
  let hit = castle.fxVideo!.tiers[0];
  for (const t of castle.fxVideo!.tiers) if (yen >= t.min) hit = t;
  return hit;
};

it("対照: 出すと決めていないテーマは、旗が無い（本番の URL）日に段を差し替えず、1バイトも落とさない", async () => {
  const draft: SeasonTheme = { ...castle, id: "castle-draft", fxVideo: { ...castle.fxVideo!, live: false, variant: null } };
  const { got } = mount(draft, { still: false, bankReady: true });
  expect(got.v!.theme).toBe(draft);
  await advance(10000);
  expect(fetched).toEqual([]);
  expect((await got.v!.ensureFor(3000)).ok).toBe(false);
  expect(got.v!.planFor(tierOf(3000))).toBeNull();
  expect(fetched).toEqual([]);
});

it("still=1 は旗があっても1バイトも落とさない（段は差し替える。動画は渡さない）", async () => {
  window.history.replaceState({}, "", "/?fx=full");
  const { got } = mount(castle, { still: true, bankReady: true });
  expect(got.v!.theme?.fxVariant).toBe("full");
  expect(got.v!.theme?.tiers).toHaveLength(7);
  await advance(10000);
  expect((await got.v!.ensureFor(3000)).ok).toBe(false);
  expect(got.v!.planFor(tierOf(3000))).toBeNull();
  expect(fetched).toEqual([]);
});

it("旗がある日は、貯金箱が出て 4 秒おいてから manifest → 段の低い順に登場と滞在 → 全段の締めの順に1本ずつ落として持つ", async () => {
  window.history.replaceState({}, "", "/?fx=light");
  const { got, update } = mount(castle, { still: false, bankReady: false });
  expect(got.v!.theme?.fxVariant).toBe("light");
  // 貯金箱がまだ
  await advance(10000);
  expect(fetched).toEqual([]);
  update({ still: false, bankReady: true });
  await advance(3900);
  expect(fetched).toEqual([]);
  await advance(200);
  expect(fetched[0]).toBe("/alert/themes/castle/fx/manifest.json");
  const videos = fetched.slice(1);
  // 置いてある manifest の、light の登場と滞在（light の無い段は full。2026-11-05 から段1〜6 は full だけ）。
  // front の有無は作る担当が決めるので、数は manifest から
  const m = JSON.parse(MANIFEST).tiers as Record<string, { variants: Record<string, Record<string, unknown>> }>;
  const want = (parts: string[]) =>
    Object.keys(m)
      .sort()
      .flatMap((k) => {
        const l = m[k].variants.light ?? m[k].variants.full;
        return ["back", "front"]
          .filter((n) => l[n])
          .flatMap((n) => parts.map((part) => `/alert/themes/castle/fx/t${k}-${m[k].variants.light ? "light" : "full"}-${n}-${part}.webm`));
      });
  expect(videos).toEqual([...want(["intro", "stay"]), ...want(["outro"])]);
  expect(videos[0]).toBe("/alert/themes/castle/fx/t1-full-back-intro.webm");
  expect(videos[1]).toBe("/alert/themes/castle/fx/t1-full-back-stay.webm");
  // 段ごとに、light があれば light だけ、無ければ full だけを落とす（light が無くても full で出る）
  for (const k of Object.keys(m)) {
    const used = m[k].variants.light ? "light" : "full";
    const unused = used === "light" ? "full" : "light";
    expect(videos.filter((u) => u.includes(`/t${k}-${unused}-`))).toEqual([]);
    expect(videos).toContain(`/alert/themes/castle/fx/t${k}-${used}-back-intro.webm`);
  }
  expect(new Set(videos).size).toBe(videos.length);
});

it("投げ銭の段の動画を用意してから渡す。渡したら手元に残さない", async () => {
  window.history.replaceState({}, "", "/?fx=full");
  const { got } = mount(castle, { still: false, bankReady: false });
  // 用意する前は渡さない
  expect(got.v!.planFor(tierOf(10000))).toBeNull();
  let ok: boolean | null = null;
  let from: string | null = null;
  await act(async () => {
    const r = await got.v!.ensureFor(10000);
    ok = r.ok;
    from = r.from;
  });
  expect(ok).toBe(true);
  // まだ手元に無かったので、その場で取り寄せた（登場と滞在の4本だけ。締めは用意のあとから）
  expect(from).toBe("fetched");
  expect(fetched.filter((u) => /t7-/.test(u)).slice(0, 4).sort()).toEqual(
    ["back-intro", "back-stay", "front-intro", "front-stay"].map((x) => `/alert/themes/castle/fx/t7-full-${x}.webm`)
  );
  // 別の段では渡さない
  expect(got.v!.planFor(tierOf(5000))).toBeNull();
  const plan = got.v!.planFor(tierOf(10000))!;
  expect(plan.key).toBe("7-full");
  expect(plan.revealAt).toBe(JSON.parse(MANIFEST).tiers["7"].revealAt);
  expect(plan.text).toBe("count");
  const k = plan.kit.layers;
  // `<video>` には手元の URL を渡す。元の URL は印（data-src）だけ
  expect(k.back!.intro.dataset.src).toBe("/alert/themes/castle/fx/t7-full-back-intro.webm");
  expect(k.back!.intro.getAttribute("src")).toMatch(/^blob:/);
  expect(k.front!.stay.loop).toBe(true);
  // 締めは、流し始めてから読ませる（手元の URL は取り寄せてある）
  expect(k.back!.outro.getAttribute("src")).toBeNull();
  expect(await plan.kit.outro!.back!.p).toMatch(/^blob:/);
  // 渡したら手元に残さない
  expect(got.v!.planFor(tierOf(10000))).toBeNull();
});

it("段取りに、manifest の段のキャラ絵の箱の下の端（charBottom）を載せる。書いていない段は null", async () => {
  const raised = JSON.parse(MANIFEST);
  raised.tiers["1"].charBottom = 0.72;
  delete raised.tiers["7"].charBottom;
  (global as { fetch?: unknown }).fetch = jest.fn(async (url: string) =>
    url.endsWith("manifest.json") ? { ok: true, json: async () => raised } : { ok: true, blob: blobOf(1024) }
  );
  window.history.replaceState({}, "", "/?fx=full");
  const { got } = mount(castle, { still: false, bankReady: false });
  await act(async () => {
    await got.v!.ensureFor(100);
  });
  expect(got.v!.planFor(tierOf(100))!.charBottom).toBe(0.72);
  await act(async () => {
    await got.v!.ensureFor(10000);
  });
  expect(got.v!.planFor(tierOf(10000))!.charBottom).toBeNull();
});
