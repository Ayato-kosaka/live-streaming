/**
 * 演出の質の試作（`?fx=lux`。#1079）の旗。
 *
 *   npx jest app/alertbox/__tests__/lux.test.ts
 *
 * 守りたいのは2つ。
 *   1. **旗が無ければ、今の段のまま**（本番の URL に `fx` は無いので、出しても何も変わらない）
 *   2. 旗があっても、試作を持っている段（ハロウィンの段4 = 1,000〜1,999円）しか変わらない。
 *      試作は物語と時間割を変えない（使う絵の組・台本は今の段4と同じ）
 */
import { THEMES, tierFor } from "../themes";
import { fxFlag, LUX_SIZE, luxUrl, showKind } from "../season/show/lux";

const halloween = THEMES.find((t) => t.id === "halloween")!;

/** TierShow.tsx が使う振付けの名前（旗と段から。TierShow と同じ関数） */
const kindFor = (yen: number, flag: string | null) => showKind(tierFor(halloween, yen).show!, flag);

describe("試作の旗（?fx=lux）", () => {
  it("旗が無ければ、どの段も今の振付け", () => {
    for (const yen of [100, 300, 700, 1500, 3000, 7000, 10000]) {
      expect(kindFor(yen, null)).toBe(tierFor(halloween, yen).show!.kind);
    }
    expect(kindFor(1500, null)).toBe("wizard");
  });

  it("旗があると、段4（1,000〜1,999円）だけが試作に替わる", () => {
    expect(kindFor(1000, "lux")).toBe("wizardLux");
    expect(kindFor(1999, "lux")).toBe("wizardLux");
    for (const yen of [100, 300, 700, 999, 2000, 3000, 7000, 10000]) {
      expect(kindFor(yen, "lux")).toBe(tierFor(halloween, yen).show!.kind);
    }
  });

  it("知らない旗では替わらない（打ち間違えで演出が消えない）", () => {
    expect(kindFor(1500, "luxx")).toBe("wizard");
    expect(kindFor(1500, "")).toBe("wizard");
  });

  it("試作は物語と時間割を変えない（絵の組と台本は今の段4のまま）", () => {
    const s = tierFor(halloween, 1500).show!;
    expect(s.poses).toEqual(["wizard"]);
    expect(s.script.map((c) => c.do)).toEqual(["glimmer", "circle", "flyIn", "cast", "write", "don", "retreat", "reveal", "stay", "finale"]);
  });

  it("URL の旗を読む（大文字・前後の空白を許す）。画面の無い所（location が無い）では null", () => {
    const g = globalThis as { location?: unknown };
    const had = "location" in g;
    const saved = g.location;
    try {
      g.location = { search: "?preview=1&fx=LUX%20" };
      expect(fxFlag()).toBe("lux");
      g.location = { search: "?preview=1" };
      expect(fxFlag()).toBeNull();
      delete g.location;
      expect(fxFlag()).toBeNull();
    } finally {
      if (had) g.location = saved;
      else delete g.location;
    }
  });

  it("光の絵はハロウィンの置き場の下（旗が無ければ読まない）", () => {
    for (const n of Object.keys(LUX_SIZE) as (keyof typeof LUX_SIZE)[]) {
      expect(luxUrl(n)).toBe(`/alert/themes/halloween/lux/${n}.webp`);
    }
  });
});
