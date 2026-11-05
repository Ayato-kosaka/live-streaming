/**
 * @jest-environment jsdom
 */

/**
 * 11月の7段を日付で配信に出したとき、動画をいつ読み、どの日に読まないか（`season/show/useTierVideo.ts`。#1095）。
 *
 *   npx jest app/alertbox/__tests__/fxliveHook.test.tsx
 *
 * 守りたいのは4つ。
 *   1. 季節の外・ハロウィン・旗 `?fx=off`・出すと決めていないテーマは、**1バイトも落とさない**（manifest も読まない）
 *   2. 11月の本番の URL（旗なし）は、7段 full に差し替えて、貯金箱が出て 4 秒おいてから manifest → full を温める。
 *      12/1 にテーマが外れたら（null）、差し替えも温めも止まる
 *   3. `still=1`（iPhone の日）は、旗が無くても1バイトも落とさない。段は差し替えるが、動画は渡さない
 *   4. 旗 `?fx=light` は、light のある段だけ light。light を外した manifest では全段 full を温めて流す
 *
 * jsdom の `<video>` は読み込まないので、readyState を「最後まで流せる」(4) に差し替えて、用意が済んだことにする。
 * 旗のある日の温め・用意・渡し方そのものは `fxvideoHook.test.tsx`。
 */
import React from "react";
import renderer, { act } from "react-test-renderer";
import { Platform } from "react-native";
import { readFileSync } from "fs";
import { join } from "path";
import { THEMES, type FxTier, type SeasonTheme } from "../themes";
import { useTierVideo, type TierVideoState } from "../season/show/useTierVideo";
import { fxWarmed } from "../season/show/fxVideo";

Object.defineProperty(Platform, "OS", { value: "web", configurable: true, writable: true });
Object.defineProperty(window.HTMLMediaElement.prototype, "readyState", { configurable: true, get: () => 4 });
Object.defineProperty(window.HTMLMediaElement.prototype, "load", { configurable: true, value: jest.fn() });
Object.defineProperty(window.HTMLMediaElement.prototype, "pause", { configurable: true, value: jest.fn() });

const castle = THEMES.find((t) => t.id === "castle")!;
const halloween = THEMES.find((t) => t.id === "halloween")!;
const MANIFEST = readFileSync(join(__dirname, "../../../public/alert/themes/castle/fx/manifest.json"), "utf8");
/* light を外した manifest（描く担当の直しが入ったあとの形） */
const NO_LIGHT = (() => {
  const j = JSON.parse(MANIFEST);
  for (const e of Object.values(j.tiers) as { variants: Record<string, unknown> }[]) delete e.variants.light;
  return JSON.stringify(j);
})();
let manifestText = MANIFEST;

let fetched: string[] = [];
beforeEach(() => {
  fetched = [];
  manifestText = MANIFEST;
  /* 温め終えた URL はページに1つの控え。試験ごとに空にする（前の試験で落とした本を「もう落とした」と数えない） */
  (fxWarmed() as Set<string>).clear();
  (global as { fetch?: unknown }).fetch = jest.fn(async (url: string) => {
    fetched.push(url);
    if (url.endsWith("manifest.json")) return { ok: true, json: async () => JSON.parse(manifestText) };
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(100 * 1024) };
  });
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
  window.history.replaceState({}, "", "/");
});

function mount(theme: SeasonTheme | null, opts: { still: boolean; bankReady: boolean }) {
  const got: { v: TierVideoState | null } = { v: null };
  const Probe = (p: { th: SeasonTheme | null; o: typeof opts }) => {
    got.v = useTierVideo(p.th, p.o);
    return null;
  };
  let tree: renderer.ReactTestRenderer;
  let th = theme;
  let o = opts;
  act(() => {
    tree = renderer.create(<Probe th={th} o={o} />);
  });
  return {
    got,
    update: (next: typeof opts) => {
      o = next;
      act(() => tree.update(<Probe th={th} o={o} />));
    },
    /** テーマを替える（日付で城から外れた、をまねる） */
    setTheme: (next: SeasonTheme | null) => {
      th = next;
      act(() => tree.update(<Probe th={th} o={o} />));
    },
  };
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
/** その manifest で、その通りを頼んだときに温めるはずの本（全段の登場 → 全段の滞在。light の無い段は full） */
const videosOf = (variant: "full" | "light", json: string) => {
  const m = JSON.parse(json).tiers as Record<string, { variants: Record<string, Record<string, unknown>> }>;
  const want = (part: string) =>
    Object.keys(m)
      .sort()
      .flatMap((k) => {
        const flows = m[k].variants[variant] ? variant : "full";
        const l = m[k].variants[flows];
        return ["back", "front"].filter((n) => l[n]).map((n) => `/alert/themes/castle/fx/t${k}-${flows}-${n}-${part}.webm`);
      });
  return [...want("intro"), ...want("stay")];
};

it.each([
  ["季節の外（テーマなし）", null, ""],
  ["ハロウィン", halloween, ""],
  ["11月の城に旗 fx=off", castle, "?fx=off"],
  ["出すと決めていないテーマ（live: false）", { ...castle, id: "castle-draft", fxVideo: { ...castle.fxVideo!, live: false, variant: null } }, ""],
] as const)("対照: %s は、段を差し替えず、1バイトも落とさない", async (_name, theme, search) => {
  window.history.replaceState({}, "", `/${search}`);
  const { got } = mount(theme as SeasonTheme | null, { still: false, bankReady: true });
  expect(got.v!.theme).toBe(theme);
  await advance(10000);
  expect(fetched).toEqual([]);
  expect(await got.v!.ensureFor(3000)).toBe(false);
  expect(got.v!.planFor(tierOf(3000))).toBeNull();
  expect(fetched).toEqual([]);
});

it("11月の本番の URL（旗なし）は、7段 full に差し替え、貯金箱が出て 4 秒おいてから manifest → 全段の登場 → 全段の滞在を full で落とす", async () => {
  const { got, update } = mount(castle, { still: false, bankReady: false });
  expect(got.v!.theme?.fxVariant).toBe("full");
  expect(got.v!.theme?.tiers).toHaveLength(7);
  // 貯金箱がまだ
  await advance(10000);
  expect(fetched).toEqual([]);
  update({ still: false, bankReady: true });
  await advance(3900);
  expect(fetched).toEqual([]);
  await advance(200);
  expect(fetched[0]).toBe("/alert/themes/castle/fx/manifest.json");
  const videos = fetched.slice(1);
  expect(videos).toEqual(videosOf("full", MANIFEST));
  expect(videos.filter((u) => /outro|-light-/.test(u))).toEqual([]);
  // 投げ銭が来たら、その段の full を用意して渡す
  await act(async () => {
    expect(await got.v!.ensureFor(1500)).toBe(true);
  });
  const plan = got.v!.planFor(tierOf(1500))!;
  expect(plan.key).toBe("4-full");
  expect(plan.kit.layers.back!.intro.getAttribute("src")).toBe("/alert/themes/castle/fx/t4-full-back-intro.webm");
});

it("12/1 にテーマが外れたら（null）、差し替えも温めも止まる（豚と季節の外のアラート）", async () => {
  const { got, setTheme } = mount(castle, { still: false, bankReady: true });
  expect(got.v!.theme?.fxVariant).toBe("full");
  setTheme(null);
  expect(got.v!.theme).toBeNull();
  await advance(10000);
  expect(fetched).toEqual([]);
  expect(await got.v!.ensureFor(10000)).toBe(false);
  expect(fetched).toEqual([]);
});

it("still=1 は旗が無くても（本番の URL）1バイトも落とさない（段は差し替える。動画は渡さない）", async () => {
  const { got } = mount(castle, { still: true, bankReady: true });
  expect(got.v!.theme?.fxVariant).toBe("full");
  expect(got.v!.theme?.tiers).toHaveLength(7);
  await advance(10000);
  expect(await got.v!.ensureFor(3000)).toBe(false);
  expect(got.v!.planFor(tierOf(3000))).toBeNull();
  expect(fetched).toEqual([]);
});

it.each([
  ["置いてある manifest", MANIFEST],
  ["light を外した manifest", NO_LIGHT],
])("旗 fx=light（%s）: light のある段だけ light、無い段は full を温めて流す（締めは落とさない）", async (_name, json) => {
  manifestText = json;
  window.history.replaceState({}, "", "/?fx=light");
  const { got } = mount(castle, { still: false, bankReady: true });
  expect(got.v!.theme?.fxVariant).toBe("light");
  await advance(4100);
  expect(fetched[0]).toBe("/alert/themes/castle/fx/manifest.json");
  const videos = fetched.slice(1);
  expect(videos).toEqual(videosOf("light", json));
  expect(videos[0]).toBe("/alert/themes/castle/fx/t1-full-back-intro.webm");
  expect(videos.filter((u) => /outro/.test(u))).toEqual([]);
  expect(new Set(videos).size).toBe(videos.length);
  // 1万円の段は、その manifest で流す通りの動画を用意する
  const t7 = JSON.parse(json).tiers["7"].variants.light ? "light" : "full";
  await act(async () => {
    expect(await got.v!.ensureFor(10000)).toBe(true);
  });
  expect(got.v!.planFor(tierOf(10000))!.kit.layers.back!.intro.getAttribute("src")).toBe(`/alert/themes/castle/fx/t7-${t7}-back-intro.webm`);
});
