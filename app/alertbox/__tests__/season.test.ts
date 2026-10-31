/**
 * 季節テーマの選び方と、アラートの後ろに出す小物の段取り。
 *
 *   npx jest app/alertbox
 *
 * 守りたいのは4つ。
 *   1. 日付 → テーマ。境目（10/31 23:59 と 11/1 0:00 の JST）で、豚に戻る側を外さない
 *   2. 金額 → 段。999/1000・4999/5000・9999/10000 の両側
 *   3. 小物は画面の真ん中に来ない・締めの群れはアラートが消える前に抜ける
 *   4. 読めなかった絵は段取りに入らない（壊れた絵を出さない）
 */
import {
  THEMES,
  readManifest,
  themeAt,
  themeFromParam,
  tierFor,
} from "../themes";
import { planEffects } from "../season/plan";
import { makeWaveClipPath } from "../components/PiggyGauge/wave";

const halloween = THEMES.find((t) => t.id === "halloween")!;
/** 期間の境目は、下ろしてあるかと関係なく確かめる（出しているものとして） */
const ON = THEMES.map((t) => ({ ...t, live: true }));

/** JST の時刻から Date を作る（箱の時間帯に左右されないように +09:00 を書く） */
const jst = (s: string) => new Date(`${s}+09:00`);

describe("日付 → テーマ", () => {
  it("ハロウィンの期間の中", () => {
    expect(themeAt(jst("2026-10-23T12:00:00"), ON)?.id).toBe("halloween");
  });

  it("10/31 23:59（JST）はまだハロウィン", () => {
    expect(themeAt(jst("2026-10-31T23:59:00"), ON)?.id).toBe("halloween");
    expect(themeAt(jst("2026-10-31T23:59:59.999"), ON)?.id).toBe("halloween");
  });

  it("11/1 0:00（JST）からは豚に戻る", () => {
    expect(themeAt(jst("2026-11-01T00:00:00"), ON)).toBeNull();
    expect(themeAt(jst("2026-11-15T12:00:00"), ON)).toBeNull();
  });

  it("UTC で見ると 10/31 15:00 が境目（JST の 0 時）", () => {
    expect(themeAt(new Date("2026-10-31T14:59:59Z"), ON)?.id).toBe("halloween");
    expect(themeAt(new Date("2026-10-31T15:00:00Z"), ON)).toBeNull();
  });

  it("下ろしてあるテーマは、期間中でも配信に出ない（豚のまま）", () => {
    expect(themeAt(jst("2026-10-23T12:00:00"), [{ ...halloween, live: false }])).toBeNull();
  });

  it("始まる前も豚", () => {
    expect(themeAt(jst("2026-09-30T23:59:00"), ON)).toBeNull();
    expect(themeAt(jst("2026-10-01T00:00:00"), ON)?.id).toBe("halloween");
  });
});

describe("URL の theme=", () => {
  it("付いていなければ日付で決める（undefined）", () => {
    expect(themeFromParam(undefined)).toBeUndefined();
    expect(themeFromParam("")).toBeUndefined();
  });
  it("none は豚に固定（null）", () => {
    expect(themeFromParam("none")).toBeNull();
    expect(themeFromParam(["NONE"])).toBeNull();
  });
  it("名前で固定。知らない名前は付いていないのと同じ", () => {
    expect(themeFromParam("halloween")?.id).toBe("halloween");
    expect(themeFromParam("Halloween ")?.id).toBe("halloween");
    expect(themeFromParam("halowen")).toBeUndefined();
  });
});

describe("金額 → 段", () => {
  const slots = (yen: number) => tierFor(halloween, yen).slots;
  it.each([
    [0, 2],
    [199, 2],
    [200, 3],
    [499, 3],
    [500, 4],
    [999, 4],
    [1000, 5],
    [1999, 5],
    [2000, 6],
    [4999, 6],
    [5000, 8],
    [9999, 8],
    [10000, 10],
    [300000, 10],
  ])("%d円 → 枠 %d", (yen, n) => {
    expect(slots(yen)).toBe(n);
  });

  it("段は7つで、切れ目と色は YouTube のスパチャに揃える", () => {
    expect(halloween.tiers.map((t) => t.min)).toEqual([0, 200, 500, 1000, 2000, 5000, 10000]);
    expect(halloween.tiers.map((t) => t.accent.toUpperCase())).toEqual([
      "#1565C0",
      "#00B8D4",
      "#00C853",
      "#FFCA28",
      "#FF9100",
      "#E91E63",
      "#D50000",
    ]);
  });

  it("段が上がるほど、群れも小物の種類も減らない", () => {
    const ts = halloween.tiers;
    for (let i = 1; i < ts.length; i++) {
      expect(ts[i].min).toBeGreaterThan(ts[i - 1].min);
      expect(ts[i].bats * ts[i].waves).toBeGreaterThan(ts[i - 1].bats * ts[i - 1].waves);
      expect(ts[i].files.length).toBeGreaterThanOrEqual(ts[i - 1].files.length);
    }
  });

  it("おばけは 1,000円から、墓は 2,000円から、ゾンビは 5,000円から", () => {
    expect(tierFor(halloween, 999).files).not.toContain("fx-ghost.png");
    expect(tierFor(halloween, 1000).files).toContain("fx-ghost.png");
    expect(tierFor(halloween, 1999).files).not.toContain("fx-grave.png");
    expect(tierFor(halloween, 2000).files).toContain("fx-grave.png");
    expect(tierFor(halloween, 4999).files).not.toContain("fx-zombie.png");
    expect(tierFor(halloween, 5000).files).toContain("fx-zombie.png");
  });

  it("数でない額はいちばん下の段", () => {
    expect(tierFor(halloween, NaN).slots).toBe(2);
  });
});

/** 全部読めた、とする */
const ALL = new Set([
  ...halloween.fx.map((f) => f.file),
  ...(halloween.finale?.files ?? []),
]);

/** アラートの長さは金額で変わる（`index.tsx`）。同じ式で段取りを組む */
const durationFor = (yen: number) => 30 + (yen >= 10000 ? 30 : yen >= 1000 ? 15 : 0);

describe("段取り", () => {
  const cases = [500, 3000, 7000, 20000];

  it.each(cases)("%d円: 小物は真ん中に来ない", (yen) => {
    const plan = planEffects(halloween, durationFor(yen), yen, `t${yen}`, ALL);
    expect(plan.items.length).toBeGreaterThan(0);
    for (const it of plan.items) {
      if (it.place === "bottom") {
        // 中心の x が画面の 1/3〜2/3 に入らない
        expect(it.x < 0.34 || it.x > 0.66).toBe(true);
      } else {
        expect(it.x === 0 || it.x === 1).toBe(true);
      }
      expect(it.size).toBeLessThanOrEqual(0.2);
    }
  });

  it.each(cases)("%d円: 同時に出ている数は段の枠を超えない", (yen) => {
    const d = durationFor(yen);
    const plan = planEffects(halloween, d, yen, `t${yen}`, ALL);
    const cap = tierFor(halloween, yen).slots;
    for (let t = 0; t < d; t += 0.1) {
      const live = plan.items.filter((i) => i.delay <= t && t < i.delay + i.life);
      expect(live.length).toBeLessThanOrEqual(cap);
    }
  });

  it("段が上がると、同時に出る数がはっきり増える", () => {
    const peak = (yen: number) => {
      const d = durationFor(yen);
      const plan = planEffects(halloween, d, yen, "peak", ALL);
      let m = 0;
      for (let t = 0; t < d; t += 0.1) {
        m = Math.max(
          m,
          plan.items.filter((i) => i.delay <= t && t < i.delay + i.life).length
        );
      }
      return m;
    };
    const peaks = cases.map(peak);
    for (let i = 1; i < peaks.length; i++) {
      expect(peaks[i]).toBeGreaterThan(peaks[i - 1]);
    }
  });

  it.each(cases)("%d円: 群れは最後に来て、アラートが消える前に抜ける", (yen) => {
    const d = durationFor(yen);
    const plan = planEffects(halloween, d, yen, `t${yen}`, ALL);
    const tier = tierFor(halloween, yen);
    expect(plan.bats).toHaveLength(tier.bats * tier.waves);
    for (const b of plan.bats) {
      expect(b.delay).toBeGreaterThanOrEqual(d - 4);
      expect(b.delay + b.fly).toBeLessThanOrEqual(d + 0.01);
    }
    // 小物は群れが来るころに引っ込み終わっている
    const firstBat = Math.min(...plan.bats.map((b) => b.delay));
    for (const it of plan.items) {
      expect(it.delay + it.life).toBeLessThanOrEqual(firstBat + 0.5);
    }
  });

  it.each(["a", "b", "c", "d", "e"])("いちばん上の段でも、同じ絵が同時に3つ並ばない（seed %s）", (seed) => {
    const plan = planEffects(halloween, 60, 20000, seed, ALL);
    for (let t = 0; t < 60; t += 0.1) {
      const live = plan.items.filter((i) => i.delay <= t && t < i.delay + i.life);
      const count = new Map<string, number>();
      for (const i of live) count.set(i.file, (count.get(i.file) ?? 0) + 1);
      expect(Math.max(0, ...count.values())).toBeLessThan(3);
    }
  });

  it("同じ通知からは同じ段取り（撮って比べられる）", () => {
    const a = planEffects(halloween, 45, 3000, "same", ALL);
    const b = planEffects(halloween, 45, 3000, "same", ALL);
    expect(a).toEqual(b);
  });

  it("読めなかった絵は出さない", () => {
    const some = new Set(["fx-pumpkin.png"]);
    const plan = planEffects(halloween, 60, 20000, "missing", some);
    expect(plan.items.length).toBeGreaterThan(0);
    expect(new Set(plan.items.map((i) => i.file))).toEqual(new Set(["fx-pumpkin.png"]));
    // コウモリの絵が無ければ群れも出ない
    expect(plan.bats).toHaveLength(0);
  });

  it("対照: 何も読めなければ何も出ない", () => {
    const plan = planEffects(halloween, 30, 500, "none", new Set());
    expect(plan.items).toHaveLength(0);
    expect(plan.bats).toHaveLength(0);
  });
});

describe("manifest.json の読み方", () => {
  it("files で包んだ形と、外接矩形の名前の揺れを拾う", () => {
    const m = readManifest({
      files: {
        "bank-base-0.png": { width: 1200, height: 600, bbox: { x: 10, y: 20, width: 1100, height: 540 } },
        "fx-web.png": { width: 400, height: 400 },
      },
    });
    expect(m["bank-base-0.png"].bbox).toEqual({ x: 10, y: 20, width: 1100, height: 540 });
    expect(m["fx-web.png"]).toEqual({ width: 400, height: 400 });

    const flat = readManifest({
      "bank-base-0.png": { w: 1200, h: 600, content: { left: 5, top: 6, right: 105, bottom: 66 } },
    });
    expect(flat["bank-base-0.png"].bbox).toEqual({ x: 5, y: 6, width: 100, height: 60 });
  });

  it("置いてある本物の manifest から、貯金箱の中身の四角とコマの大きさが取れる", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const real = require("../../../public/alert/themes/halloween/manifest.json");
    const m = readManifest(real);
    expect(m.bank?.bbox?.width).toBeGreaterThan(0);
    for (let i = 0; i < halloween.bank.frames; i++) {
      expect(m[`bank-base-${i}.png`]?.width).toBeGreaterThan(0);
      expect(m[`bank-fill-${i}.png`]?.width).toBeGreaterThan(0);
    }
    // テーマが呼ぶ絵が、全部置いてある
    for (const f of [...halloween.fx.map((x) => x.file), ...(halloween.finale?.files ?? [])]) {
      expect(m[f]?.width).toBeGreaterThan(0);
    }
  });

  it("コマの並びは、全部のコマを使い、ふだんの顔（0）でいちばん長く休む", () => {
    const seq = halloween.bank.sequence;
    const used = new Set(seq.map(([f]) => f));
    expect(used.size).toBe(halloween.bank.frames);
    const rest = seq.filter(([f]) => f === 0).reduce((a, [, ms]) => a + ms, 0);
    const total = seq.reduce((a, [, ms]) => a + ms, 0);
    expect(rest / total).toBeGreaterThan(0.6);
  });

  it("壊れた中身でも投げない（空で返す）", () => {
    expect(readManifest(null)).toEqual({});
    expect(readManifest("x")).toEqual({});
    expect(readManifest({ files: { "a.png": { bbox: { x: -1 } } } })["a.png"].bbox).toBeUndefined();
  });
});

describe("溜まる形（豚と共通）", () => {
  it("豚の呼び方（上下を渡さない）は、前の式と同じ形を出す", () => {
    const w = 600;
    const h = 260;
    const p = 0.37;
    const phase = 1.234;
    // 前の式: waterY = h * (1 - p)
    const old = (() => {
      const waterY = h * (1 - p);
      let d = `M 0 ${waterY}`;
      for (let i = 0; i <= 12; i++) {
        const y = waterY + Math.sin((i / 12) * Math.PI * 2 * 2 + phase) * 8;
        d += ` L ${i * (w / 12)} ${y}`;
      }
      return d + ` L ${w} ${h} L 0 ${h} Z`;
    })();
    expect(makeWaveClipPath(w, h, p, phase)).toBe(old);
  });
});
