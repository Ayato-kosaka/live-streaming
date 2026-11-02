/**
 * 11月の貯金箱（ブラン城、#1078）。
 *
 *   npx jest app/alertbox/__tests__/castle.test.ts
 *
 * 守りたいのは5つ。
 *   1. 期間は 11/1 0:00〜12/1 0:00（JST）。12/1 0:00 に豚へ戻る
 *   2. 投げ銭の演出は今のまま（段は1つで、台本も小物も札も持たない＝季節の外と同じ出し方）
 *   3. 大きさは豚と同じ物差し（Dimensions の幅）だけで決まる。PRISM の % が何でも豚の 1.6 倍
 *   4. 置いてある castle.json が読めて、呼ぶ絵が全部置いてある
 *   5. 灯り・旗・ピポの決め方（溜まるほど上がる。満タンでバンザイ）と、字の台が場面の中に収まる
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { THEMES, themeAt, tierFor } from "../themes";
import { stageFor } from "../season/show/stage";
import {
  CASTLE_TIMES,
  PIG_BOX,
  castleBox,
  castleFiles,
  castleLayout,
  flagY,
  lightY,
  peekTop,
  pipoPose,
  readCastleDef,
} from "../season/bank/castle";

const castle = THEMES.find((t) => t.id === "castle")!;
const DIR = join(__dirname, "../../../public/alert/themes/castle");
const real = readCastleDef(JSON.parse(readFileSync(join(DIR, "castle.json"), "utf8")))!;
const jst = (s: string) => new Date(`${s}+09:00`);

describe("期間", () => {
  it("11月中はブラン城（配信に出す）", () => {
    expect(castle.live).not.toBe(false);
    expect(themeAt(jst("2026-11-01T00:00:00"))?.id).toBe("castle");
    expect(themeAt(jst("2026-11-15T21:00:00"))?.id).toBe("castle");
    expect(themeAt(jst("2026-11-30T23:59:59.999"))?.id).toBe("castle");
  });
  it("12/1 0:00（JST）に豚へ戻る", () => {
    expect(themeAt(jst("2026-12-01T00:00:00"))).toBeNull();
    // UTC では 11/30 15:00 が境目
    expect(themeAt(new Date("2026-11-30T14:59:59Z"))?.id).toBe("castle");
    expect(themeAt(new Date("2026-11-30T15:00:00Z"))).toBeNull();
  });
});

describe("投げ銭の演出は今のまま", () => {
  it("どの額でも、台本・札・小物・締めを持たない", () => {
    for (const yen of [0, 100, 999, 1000, 5000, 10000, 50000]) {
      const t = tierFor(castle, yen);
      expect(t.show).toBeUndefined();
      expect(t.plate).toBeUndefined();
      expect(t.slots).toBe(0);
      expect(t.files).toEqual([]);
      const st = stageFor(castle, yen, 30, () => true)!;
      expect(st.show).toBeNull();
      expect(st.plate).toBeNull();
      // その人の絵と読み上げを遅らせない（季節の外と同じ）
      expect(st.revealSec).toBe(0);
    }
    expect(castle.fx).toEqual([]);
    expect(castle.finale).toBeNull();
  });
});

describe("大きさは豚と同じ物差し", () => {
  // PRISM 140%: 箱 436・scale 0.5 / 100%: 箱 606・scale 0.36（Dimensions の幅はどちらも約 218）
  const dims = [436 * 0.5, 606 * 0.36];
  it("PRISM の % を変えても、豚に対する比が同じ", () => {
    for (const d of dims) {
      const b = castleBox(d);
      const pigW = d * PIG_BOX.w;
      const pigH = d * PIG_BOX.h;
      expect(b.width / pigW).toBeCloseTo(CASTLE_TIMES, 1);
      expect(b.height / pigH).toBeCloseTo(CASTLE_TIMES, 1);
    }
    expect(Math.abs(castleBox(dims[0]).width - castleBox(dims[1]).width)).toBeLessThanOrEqual(1);
  });
  it("豚の外接矩形は alert-banksize で測った 178×113px（Dimensions の幅 218）", () => {
    expect(Math.round(218 * PIG_BOX.w)).toBe(178);
    expect(Math.round(218 * PIG_BOX.h)).toBe(113);
  });
});

describe("castle.json", () => {
  it("置いてあるものが読めて、呼ぶ絵が全部ある", () => {
    expect(real).not.toBeNull();
    for (const text of ["ribbon", "plaque", "sky"] as const) {
      for (const f of castleFiles(real, text)) expect(existsSync(join(DIR, f))).toBe(true);
    }
    expect(castle.castleBank?.text).toBe("ribbon");
    expect(real.plates.ribbon).toBeDefined();
    for (let i = 0; i < castle.bank.frames; i++) {
      expect(existsSync(join(DIR, `bank-base-${i}.png`))).toBe(true);
      expect(existsSync(join(DIR, `bank-fill-${i}.png`))).toBe(true);
    }
  });
  it("欠けたものは読まない（片方の部品だけで城を出さない）", () => {
    expect(readCastleDef(null)).toBeNull();
    expect(readCastleDef({ ...JSON.parse(readFileSync(join(DIR, "castle.json"), "utf8")), pipo: {} })).toBeNull();
    expect(readCastleDef({ ...JSON.parse(readFileSync(join(DIR, "castle.json"), "utf8")), light: { bottom: 10, top: 20 } })).toBeNull();
  });
});

describe("灯り・旗・ピポ", () => {
  it("溜まるほど、灯りの境目と旗が上がる（0% で壁の下・竿の下、100% で壁の上・てっぺん）", () => {
    expect(lightY(real, 0)).toBe(real.light.bottom);
    expect(lightY(real, 1)).toBe(real.light.top);
    expect(lightY(real, 0.5)).toBeCloseTo((real.light.bottom + real.light.top) / 2);
    expect(flagY(real, 0)).toBe(real.pole.bottom);
    expect(flagY(real, 1)).toBe(real.pole.top);
    // 超えても、てっぺんより上へ行かない
    expect(lightY(real, 1.4)).toBe(real.light.top);
    expect(flagY(real, -1)).toBe(real.pole.bottom);
  });
  it("ピポは 空で待つ・溜まるあいだ窓から顔を出す・満タンでバンザイ", () => {
    expect(pipoPose(0)).toBe("wait");
    expect(pipoPose(0.01)).toBe("peek");
    expect(pipoPose(0.99)).toBe("peek");
    expect(pipoPose(1)).toBe("cheer");
  });
  it("顔を出す窓は、城の絵の外へ出ず、壁の下の端より下へも沈まない", () => {
    for (let k = 0; k <= 20; k++) {
      const t = peekTop(real, k / 20);
      expect(t).toBeGreaterThanOrEqual(real.content[1]);
      expect(t + real.pipo.peek.h).toBeLessThanOrEqual(real.light.bottom + 1e-9);
    }
  });
});

describe("並び", () => {
  const box = castleBox(218);
  it.each(["ribbon", "plaque", "sky"] as const)("%s: 城・台・字が、豚の 1.6 倍の四角の中に収まる", (text) => {
    const L = castleLayout(text, box, real, text === "sky" ? null : 711 / 200);
    const inside = (r: { x: number; y: number; w: number; h: number }) => {
      expect(r.x).toBeGreaterThanOrEqual(-0.5);
      expect(r.y).toBeGreaterThanOrEqual(-0.5);
      expect(r.x + r.w).toBeLessThanOrEqual(box.width + 0.5);
      expect(r.y + r.h).toBeLessThanOrEqual(box.height + 0.5);
    };
    inside(L.castle);
    inside(L.text);
    if (L.plate) inside(L.plate);
    // 字の大きさは豚の字（いまの額 20px）を基準に、1.2 倍まで
    expect(L.font.amount * box.width).toBeLessThanOrEqual(24);
    expect(L.font.amount * box.width).toBeGreaterThanOrEqual(18);
  });
});
