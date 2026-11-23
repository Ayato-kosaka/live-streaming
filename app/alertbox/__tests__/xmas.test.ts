/**
 * 12月の貯金箱（クリスマス、#1034）。案3 ソリのプレゼント袋（sleigh）と 案4 スノードーム（globe）。
 *
 *   npx jest app/alertbox/__tests__/xmas.test.ts
 *
 * 守りたいのは7つ。
 *   1. 期間は 12/1 0:00〜1/1 0:00（JST）。いまは配信に出ない（live: false）。11月の城と豚の切り替えは変わらない
 *   2. 置いてある sleigh.json / globe.json が読めて、呼ぶ絵が全部置いてある
 *   3. 大きさは豚と同じ物差し（Dimensions の幅）。場面は豚の 1.6 倍の四角に収まる
 *   4. 段が目で分かる: 25/50/75% でプレゼントが 1→3→5、ランタンが 25% ごとに1つ。袋は続けてふくらむ
 *   5. 100% ちょうどは満タン、超えたらあふれ（100% と 120% が違って見える）
 *   6. ピポの顔の幅は場面の幅の 13.5%。どの居場所・どのポーズ（跳ねても）でも場面から出ない
 *   7. 字はいまの額だけを目立たせる（城と同じ）。ピポのくじは 座る・手を振る を混ぜ、あふれたらバンザイ
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { THEMES, themeAt, themeFromParam, bankFrameUrl } from "../themes";
import { castleBox, PIG_BOX, CASTLE_TIMES, BREATH } from "../season/bank/castle";
import {
  HOP,
  XMAS_FONT,
  XMAS_POSES,
  bagMorph,
  giftsAt,
  globeLightY,
  isFull,
  isOver,
  lanternsAt,
  nextXmasAct,
  pickVariant,
  pipoSpot,
  readXmasDef,
  xmasBox,
  xmasFiles,
  xmasLayout,
  xmasPipoFace,
  xmasPipoRect,
  type GlobeDef,
  type SleighDef,
  type XmasAct,
  type XmasDef,
} from "../season/bank/xmas";
import { seededRandom } from "../season/plan";

const jst = (s: string) => new Date(`${s}+09:00`);
const xmas = THEMES.find((t) => t.id === "christmas")!;
const PUB = join(__dirname, "../../../public");
const BANK = join(PUB, xmas.xmasBank!.dir);

const read = (v: "sleigh" | "globe"): XmasDef => {
  const def = readXmasDef(JSON.parse(readFileSync(join(BANK, `${v}.json`), "utf-8")));
  if (!def) throw new Error(`${v}.json が読めない`);
  return def;
};
const sleigh = read("sleigh") as SleighDef;
const globe = read("globe") as GlobeDef;
const BOTH: XmasDef[] = [sleigh, globe];

describe("1. 期間と、配信に出すか", () => {
  it("12/1 0:00〜1/1 0:00（JST）。いまは live: false で配信に出ない（試し表示 ?theme=christmas だけ）", () => {
    expect(xmas.from).toBe("2026-12-01T00:00");
    expect(xmas.until).toBe("2027-01-01T00:00");
    expect(xmas.live).toBe(false);
    expect(themeAt(jst("2026-12-15T12:00:00"))).toBeNull();
    expect(themeFromParam("christmas")?.id).toBe("christmas");
  });
  it("出すと決めたら（live を外したら）12/1 0:00 から 12/31 23:59 まで", () => {
    const on = THEMES.map((t) => ({ ...t, live: true }));
    expect(themeAt(jst("2026-11-30T23:59:00"), on)?.id).toBe("castle");
    expect(themeAt(jst("2026-12-01T00:00:00"), on)?.id).toBe("christmas");
    expect(themeAt(jst("2026-12-31T23:59:00"), on)?.id).toBe("christmas");
    expect(themeAt(jst("2027-01-01T00:00:00"), on)).toBeNull();
  });
  it("演出7段は動画（字・切れ目は11月と同じ）。段7 は11月の城の段7 の写しの仮（manifest に段1〜7 と主役の帯がある）", () => {
    const castle = THEMES.find((t) => t.id === "castle")!;
    expect(xmas.fxVideo?.dir).toBe("/alert/themes/christmas/fx");
    expect(xmas.fxVideo?.tiers).toBe(castle.fxVideo!.tiers);
    const man = JSON.parse(readFileSync(join(PUB, xmas.fxVideo!.dir, "manifest.json"), "utf-8"));
    expect(Object.keys(man.tiers).sort()).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
    expect(Object.keys(man.heroBands).sort()).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
    for (const e of Object.values(man.tiers) as { variants: { full: Record<string, Record<string, string> | null> } }[])
      for (const layer of Object.values(e.variants.full))
        for (const f of Object.values(layer ?? {})) expect(existsSync(join(PUB, xmas.fxVideo!.dir, f))).toBe(true);
    const castleMan = JSON.parse(readFileSync(join(PUB, castle.fxVideo!.dir, "manifest.json"), "utf-8"));
    expect(man.tiers["7"]).toEqual(castleMan.tiers["7"]);
  });
  it("コマ送り（部品が読めない日）は bank/ のスノードームの 0%・100%。ほかのテーマのコマの置き場は変わらない", () => {
    expect(bankFrameUrl(xmas, "base", 0)).toBe("/alert/themes/christmas/bank/bank-base-0.png");
    expect(existsSync(join(PUB, bankFrameUrl(xmas, "base", 0)))).toBe(true);
    expect(existsSync(join(PUB, bankFrameUrl(xmas, "fill", 0)))).toBe(true);
    const castle = THEMES.find((t) => t.id === "castle")!;
    expect(bankFrameUrl(castle, "base", 0)).toBe("/alert/themes/castle/bank-base-0.png");
  });
});

describe("2. 置いてある部品", () => {
  it.each(["sleigh", "globe"] as const)("%s.json が読めて、呼ぶ絵が全部ある", (v) => {
    const def = read(v);
    expect(def.kind).toBe(v);
    for (const f of xmasFiles(def)) expect(existsSync(join(BANK, f))).toBe(true);
  });
  it("スノードームの 0% と 100% の絵は、コマ送りの絵と同じもの（同じ構図を2回読まない）", () => {
    expect(globe.globe.base).toBe("bank-base-0.png");
    expect(globe.globe.lit).toBe("bank-fill-0.png");
  });
  it("欠けていれば読まない（片方の部品だけで出さない）", () => {
    const raw = JSON.parse(readFileSync(join(BANK, "sleigh.json"), "utf-8"));
    expect(readXmasDef(null)).toBeNull();
    expect(readXmasDef({ ...raw, bag: { ...raw.bag, files: raw.bag.files.slice(0, 2) } })).toBeNull();
    expect(readXmasDef({ ...raw, pipo: { ...raw.pipo, poses: { sit: raw.pipo.poses.sit } } })).toBeNull();
    expect(readXmasDef({ ...raw, kind: "castle" })).toBeNull();
  });
  it("?bank= で案を切り替える。知らない名前は既定", () => {
    expect(pickVariant("globe", "sleigh")).toBe("globe");
    expect(pickVariant("SLEIGH", "globe")).toBe("sleigh");
    expect(pickVariant("castle", "sleigh")).toBe("sleigh");
    expect(pickVariant(null, "globe")).toBe("globe");
  });
});

describe("3. 大きさは豚と同じ物差し", () => {
  it("場面は豚の 1.6 倍（11月の城と同じ式）", () => {
    for (const w of [150, 218, 332]) expect(xmasBox(w)).toEqual(castleBox(w));
    const b = xmasBox(218);
    expect(b.width / (218 * PIG_BOX.w)).toBeCloseTo(CASTLE_TIMES, 1);
  });
  it.each(BOTH.map((d) => [d.kind, d] as const))("%s: 場面の座標が四角いっぱいに収まる（幅か高さの 98% 以上を使う）", (_, d) => {
    for (const w of [150, 218, 332]) {
      const box = xmasBox(w);
      const L = xmasLayout(box, d);
      const [cw, ch] = d.canvas;
      expect(L.ox).toBeGreaterThanOrEqual(-0.01);
      expect(L.oy).toBeGreaterThanOrEqual(-0.01);
      expect(L.ox + cw * L.s).toBeLessThanOrEqual(box.width + 0.01);
      expect(Math.max((cw * L.s) / box.width, (ch * L.s) / box.height)).toBeGreaterThan(0.98);
    }
  });
});

/** 四角が場面の中か */
const inside = (d: XmasDef, r: { x: number; y: number; w: number; h: number }, pad = 0) => {
  const [W, H] = d.canvas;
  return r.x >= -pad && r.y >= -pad && r.x + r.w <= W + pad && r.y + r.h <= H + pad;
};
const box4 = ([x, y, w, h]: number[]) => ({ x, y, w, h });

describe("4. 段が目で分かる", () => {
  it("プレゼントは 25/50/75% で 1→3→5、ランタンは 25% ごとに1つ（100% で4つ）", () => {
    expect([0, 0.24, 0.25, 0.49, 0.5, 0.74, 0.75, 1].map(giftsAt)).toEqual([0, 0, 1, 1, 3, 3, 5, 5]);
    expect([0, 0.24, 0.25, 0.5, 0.75, 0.99, 1].map((l) => lanternsAt(l))).toEqual([0, 0, 1, 2, 3, 3, 4]);
    expect(sleigh.sleigh.lanterns).toHaveLength(4);
    expect(sleigh.gifts.spots.length).toBeGreaterThanOrEqual(5);
  });
  it("袋は 0→100% で続けてふくらむ（高さが一度も縮まず、継ぎ目で跳ばない）。両端はしぼんだ絵・ぱんぱんの絵そのもの", () => {
    let prev = bagMorph(sleigh, 0);
    expect(prev.sprites[0]).toEqual({ opacity: 1, sx: 1, sy: 1 });
    for (let i = 1; i <= 200; i++) {
      const m = bagMorph(sleigh, i / 200);
      expect(m.rect.h).toBeGreaterThanOrEqual(prev.rect.h - 1e-9);
      expect(Math.abs(m.rect.h - prev.rect.h)).toBeLessThan(sleigh.canvas[1] * 0.02);
      expect(Math.abs(m.mouth.y - prev.mouth.y)).toBeLessThan(sleigh.canvas[1] * 0.02);
      prev = m;
    }
    const end = bagMorph(sleigh, 1);
    expect(end.sprites[2].opacity).toBeCloseTo(1);
    expect(end.sprites[2].sx).toBeCloseTo(1);
    expect(end.sprites[2].sy).toBeCloseTo(1);
    expect(end.rect.h).toBeGreaterThan(bagMorph(sleigh, 0).rect.h * 1.4);
  });
  it("スノードームの灯りは下から上へ（0% で灯りの範囲の下の端、100% で上の端）", () => {
    expect(globeLightY(globe, 0)).toBeCloseTo(globe.globe.light[0]);
    expect(globeLightY(globe, 1)).toBeCloseTo(globe.globe.light[1]);
    expect(globeLightY(globe, 0.5)).toBeLessThan(globeLightY(globe, 0.25));
  });
  it("ソリ・ぱんぱんの袋・のぞいたプレゼント・あふれの山・字の帯が、場面の中に収まる", () => {
    expect(inside(sleigh, box4(sleigh.sleigh.rect))).toBe(true);
    const full = bagMorph(sleigh, 1);
    expect(inside(sleigh, full.rect)).toBe(true);
    for (const [dx, dy] of sleigh.gifts.spots.slice(0, 5)) {
      // プレゼントの絵は正方形より縦長にはしない（上の端は口から w ぶんまで）
      expect(full.mouth.y + dy - sleigh.gifts.w).toBeGreaterThanOrEqual(0);
      expect(full.mouth.x + dx - sleigh.gifts.w / 2).toBeGreaterThanOrEqual(0);
      expect(full.mouth.x + dx + sleigh.gifts.w / 2).toBeLessThanOrEqual(sleigh.canvas[0]);
    }
    expect(inside(sleigh, box4(sleigh.pile.rect))).toBe(true);
    for (const d of BOTH) expect(inside(d, box4(d.band.rect))).toBe(true);
    expect(inside(globe, box4(globe.globe.rect))).toBe(true);
  });
});

describe("5. 100% と 120% が違って見える", () => {
  it("100% ちょうどは満タン（リボン・光）で、あふれではない。超えたらあふれ", () => {
    expect(isFull(1)).toBe(true);
    expect(isFull(0.999)).toBe(false);
    expect(isOver(50000, 50000)).toBe(false);
    expect(isOver(60000, 50000)).toBe(true);
    expect(isOver(10, 0)).toBe(false);
  });
  it("あふれたら、バンザイは別の所で（ソリは山の上・スノードームは台座の上）。座る・手を振るは いつもの所", () => {
    for (const d of BOTH) {
      const a = pipoSpot(d, false, "cheer");
      const b = pipoSpot(d, true, "cheer");
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(d.canvas[0] * 0.05);
      expect(pipoSpot(d, true, "sit")).toEqual(pipoSpot(d, false, "sit"));
    }
  });
});

describe("6. ピポ", () => {
  it("顔の幅は場面の幅の 13.5%（どのポーズも同じ。11月の城と同じ大きさ）", () => {
    for (const d of BOTH) {
      expect(d.pipo.face).toBeCloseTo(0.135, 3);
      for (const p of XMAS_POSES) expect(xmasPipoFace(d, p, 500, 300).w / d.canvas[0]).toBeCloseTo(0.135, 3);
    }
  });
  it("どの居場所・どのポーズでも場面から出ない（息の広がり・バンザイで跳ねる高さ込み）", () => {
    for (const d of BOTH) {
      for (const over of [false, true])
        for (const p of XMAS_POSES) {
          const s = pipoSpot(d, over, p);
          const r = xmasPipoRect(d, p, s.x, s.y);
          const k = p === "cheer" ? HOP.scale : BREATH;
          const grow = { x: r.x - (r.w * (k - 1)) / 2, y: r.y - r.h * (k - 1), w: r.w * k, h: r.h * k };
          if (p === "cheer") grow.y -= d.canvas[1] * HOP.lift;
          expect({ kind: d.kind, pose: p, spot: s, inside: inside(d, grow, 0.5) }).toEqual({ kind: d.kind, pose: p, spot: s, inside: true });
        }
    }
  });
});

describe("7. 字とピポのくじ", () => {
  it("目立たせるのは いまの額だけ（目標と旅の名前は半分ほど）", () => {
    expect(XMAS_FONT.target / XMAS_FONT.amount).toBeLessThan(0.6);
    expect(XMAS_FONT.label / XMAS_FONT.amount).toBeLessThan(0.6);
  });
  const run = (over: boolean, seed: string) => {
    const r = seededRandom(seed);
    const out: XmasAct[] = [];
    let last: XmasAct | null = null;
    let streak = 0;
    let t = 0;
    while (t < 90000) {
      const a = nextXmasAct(r, over, last, streak);
      streak = last && last.pose === a.pose ? streak + 1 : 1;
      last = a;
      out.push(a);
      t += a.ms || 560 * a.hops;
    }
    return out;
  };
  it("ふだん: 90 秒のうちに 座る と 手を振る が入り、手を振るを2回続けない。バンザイはしない", () => {
    for (const seed of ["a", "b", "c", "d"]) {
      const acts = run(false, seed);
      expect(acts.some((a) => a.pose === "sit")).toBe(true);
      expect(acts.some((a) => a.pose === "wave")).toBe(true);
      expect(acts.some((a) => a.pose === "cheer")).toBe(false);
      for (let i = 1; i < acts.length; i++) expect(acts[i - 1].pose === "wave" && acts[i].pose === "wave").toBe(false);
    }
  });
  it("あふれたら: バンザイが入り、3回より続けない", () => {
    for (const seed of ["a", "b", "c", "d"]) {
      const acts = run(true, seed);
      expect(acts.filter((a) => a.pose === "cheer").length).toBeGreaterThan(acts.length * 0.3);
      for (let i = 3; i < acts.length; i++) expect(acts.slice(i - 3, i + 1).every((a) => a.pose === "cheer")).toBe(false);
    }
  });
});
