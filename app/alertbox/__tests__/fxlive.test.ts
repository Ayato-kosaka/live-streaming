/**
 * @jest-environment jsdom
 */

/**
 * 11月の投げ銭の演出7段（透明つきの動画。#1095）を、**日付で配信に出す**切り替え。
 *
 *   npx jest app/alertbox/__tests__/fxlive.test.ts
 *
 * 守りたいのは3つ。
 *   1. 11月は、旗の無い本番の URL で城の段が7段 full に差し替わる（あやと 2026-11-05「光の線の案はやめて」）
 *   2. 12/1 0:00 からは豚（テーマなし）。ハロウィン・季節の外・旗 `?fx=off`・出すと決めていないテーマは今のまま
 *   3. 旗 `?fx=light` が来ても、light の無い段は full で流す。manifest から light を外したあと（描く担当の直し）は
 *      全段 full を同じ順に温める（落とす量が増えない）
 *
 * **対照を先に置く**（`island-misses.md` #99）。「出すと決めていないと7段にならない」を見てから「11月は旗なしで7段になる」を見る。
 * manifest は、置いてあるものと、light を外したものの両方で見る（直しが master に入っても、この試験は書き直さずに済む）。
 * 再生の土台そのもの（秒・温める順・流す順番）は `fxvideo.test.ts`。
 */
import { readFileSync } from "fs";
import { join } from "path";
import { THEMES, themeAt, tierFor, type FxTier, type SeasonTheme } from "../themes";
import { stageFor, PLAIN_HEADROOM, PLAIN_CHAR_BOTTOM } from "../season/show/stage";
import { fxVariantOf, fxWarmOrder, layersFor, parseFxManifest, withFxVideo, type VideoPlan } from "../season/show/fxVideo";

const halloween = THEMES.find((t) => t.id === "halloween")!;
const castle = THEMES.find((t) => t.id === "castle")!;
const durationFor = (yen: number) => 30 + (yen >= 10000 ? 30 : yen >= 1000 ? 15 : 0);
const allRigs = () => true;
const AMOUNTS = [0, 199, 200, 499, 500, 999, 1000, 1999, 2000, 4999, 5000, 9999, 10000, 50000];
const MANIFEST = JSON.parse(
  readFileSync(join(__dirname, "../../../public/alert/themes/castle/fx/manifest.json"), "utf8")
);
/* light を外した manifest（描く担当の直しが入ったあとの形） */
const NO_LIGHT = (() => {
  const j = JSON.parse(JSON.stringify(MANIFEST));
  for (const e of Object.values(j.tiers) as { variants: Record<string, unknown> }[]) delete e.variants.light;
  return j;
})();

/** 動画の段取り（中身は使わない。聞きに来たかだけを見る） */
const planAll = (t: FxTier): VideoPlan => ({
  key: `${t.video!.tier}-full`,
  revealAt: 1,
  headroom: t.video!.headroom,
  charBottom: null,
  text: t.video!.text,
  kit: { key: "", layers: { back: null, front: null }, entry: { variants: {}, revealAt: 1, introDur: 2, stayDur: 2, outroDur: 1, charBottom: null }, used: false },
});

describe("1. 11月は日付で配信に出る（全段 full）", () => {
  /* 作っているあいだの形（出すと決めていない）。旗が無ければ7段にならない */
  const draft: SeasonTheme = { ...castle, id: "castle-draft", fxVideo: { ...castle.fxVideo!, live: false, variant: null } };

  it("対照: 出すと決めていない（live: false・variant: null）なら、旗が無いと差し替えない（段は今の1段・札も動画も無い）", () => {
    expect(fxVariantOf(draft, null)).toBeNull();
    const eff = withFxVideo(draft, fxVariantOf(draft, null));
    expect(eff).toBe(draft);
    for (const yen of AMOUNTS) {
      const st = stageFor(eff, yen, durationFor(yen), allRigs, () => {
        throw new Error("動画の段取りを聞きに来てはいけない");
      })!;
      expect(st.plate).toBeNull();
      expect(st.show).toBeNull();
      expect(st.video).toBeNull();
      expect(st.revealSec).toBe(0);
      expect(st.headroom).toBe(PLAIN_HEADROOM);
      expect(st.charBottom).toBe(PLAIN_CHAR_BOTTOM);
    }
    // 出すと決めても通りが無ければ出さない
    expect(fxVariantOf({ ...draft, fxVideo: { ...draft.fxVideo!, live: true } }, null)).toBeNull();
  });

  it("11月に日付で選ばれるのは城。旗が無い（本番の URL）と7段 full に差し替わり、どの額も動画の段取りを聞く", () => {
    const th = themeAt(new Date("2026-11-15T12:00:00+09:00"))!;
    expect(th.id).toBe("castle");
    expect(th.fxVideo?.live).toBe(true);
    expect(th.fxVideo?.variant).toBe("full");
    const eff = withFxVideo(th, fxVariantOf(th, null))!;
    expect(eff.fxVariant).toBe("full");
    expect(eff.tiers).toBe(th.fxVideo!.tiers);
    expect(eff.tiers).toHaveLength(7);
    const asked: string[] = [];
    for (const yen of AMOUNTS) {
      const st = stageFor(eff, yen, durationFor(yen), allRigs, (t) => {
        asked.push(t.video!.tier);
        return planAll(t);
      })!;
      expect(st.video?.key).toBe(`${tierFor(eff, yen).video!.tier}-full`);
      // 字はハロウィン2版目の同じ段の札
      expect(st.plate).toEqual(tierFor(halloween, yen).plate);
    }
    expect([...new Set(asked)]).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
  });

  it.each([
    [null, "full"],
    ["lux", "full"],
    ["FULL", "full"],
    ["off", null],
    ["full", "full"],
    ["light", "light"],
  ])("旗 %s → 通り %s（知らない旗は配信と同じ full。止めるのは off だけ）", (flag, want) => {
    expect(fxVariantOf(castle, flag)).toBe(want);
  });
});

describe("2. 12/1 0:00 に豚へ戻る。ハロウィン・季節の外・旗 off は今のまま", () => {
  it("期間の境目: 11/1 0:00 から城の7段、11/30 23:59 まで。12/1 0:00 からは豚（テーマなし＝季節の外のいつものアラート）", () => {
    const at = (s: string) => themeAt(new Date(`${s}+09:00`));
    expect(at("2026-10-31T23:59:59.999")?.id).toBe("halloween");
    expect(fxVariantOf(at("2026-10-31T23:59:59.999"), null)).toBeNull();
    for (const s of ["2026-11-01T00:00:00", "2026-11-05T21:00:00", "2026-11-30T23:59:59.999"]) {
      expect(at(s)?.id).toBe("castle");
      expect(fxVariantOf(at(s), null)).toBe("full");
    }
    for (const s of ["2026-12-01T00:00:00", "2026-12-24T21:00:00"]) {
      expect(at(s)).toBeNull();
      expect(fxVariantOf(at(s), null)).toBeNull();
      expect(withFxVideo(at(s), "full")).toBeNull();
      expect(stageFor(at(s), 10000, 60, allRigs, planAll)).toBeNull();
    }
  });

  it("旗 `fx=off` は7段を止める（城の今の1段＝季節の外と同じアラート。見比べの物差し）", () => {
    const eff = withFxVideo(castle, fxVariantOf(castle, "off"));
    expect(eff).toBe(castle);
    expect(eff!.tiers).toHaveLength(1);
    const st = stageFor(eff, 10000, 60, allRigs, () => {
      throw new Error("聞きに来てはいけない");
    })!;
    expect(st.plate).toBeNull();
    expect(st.video).toBeNull();
  });

  it("ハロウィン・季節の外には動画の段が無い（旗が無くても有っても差し替えない）", () => {
    expect(fxVariantOf(halloween, null)).toBeNull();
    expect(fxVariantOf(halloween, "full")).toBeNull();
    expect(fxVariantOf(null, null)).toBeNull();
    expect(withFxVideo(halloween, "full")).toBe(halloween);
    expect(withFxVideo(null, "full")).toBeNull();
  });
});

describe("3. light の無い段は full で流す", () => {
  const tiers = castle.fxVideo!.tiers;

  it("light を外した manifest では、旗 `fx=light` が来ても全段 full（対照: light のある段は light）", () => {
    const n = parseFxManifest(NO_LIGHT);
    expect(Object.keys(n).sort()).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
    for (const [k, e] of Object.entries(n)) {
      expect(Object.keys(e.variants)).toEqual(["full"]);
      expect(layersFor(e, "light")).toBe(e.variants.full);
      expect(layersFor(e, "light")!.back!.intro).toBe(`t${k}-full-back-intro.webm`);
    }
    // 対照: light のある段は light を返す（落とし先が効いているのか、そもそも light を見ていないのかを分ける）
    const withLight = parseFxManifest({
      tiers: {
        "4": {
          ...NO_LIGHT.tiers["4"],
          variants: {
            full: NO_LIGHT.tiers["4"].variants.full,
            light: { back: { intro: "t4-light-back-intro.webm", stay: "t4-light-back-stay.webm", outro: "t4-light-back-outro.webm" }, front: null },
          },
        },
      },
    });
    expect(layersFor(withLight["4"], "light")!.back!.intro).toBe("t4-light-back-intro.webm");
  });

  it("置いてある manifest でも、どの段も full を持つ（配信で流す通り）", () => {
    const m = parseFxManifest(MANIFEST);
    expect(Object.keys(m).sort()).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
    for (const e of Object.values(m)) expect(e.variants.full?.back).toBeTruthy();
  });

  it("light を外した manifest では、旗 light でも full と同じ本を同じ順に温める（落とす量が増えない）", () => {
    const n = parseFxManifest(NO_LIGHT);
    expect(fxWarmOrder(tiers, n, "light")).toEqual(fxWarmOrder(tiers, n, "full"));
    expect(fxWarmOrder(tiers, n, "light").some((f) => /-light-/.test(f))).toBe(false);
    expect(fxWarmOrder(tiers, n, "full").length).toBeGreaterThan(0);
  });
});
