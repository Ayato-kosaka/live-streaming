/**
 * 12月の貯金箱（クリスマスのスノードーム、#1034。あやとが案4 を選んだ 2026-11-23）。
 *
 *   npx jest app/alertbox/__tests__/xmas.test.ts
 *
 * 守りたいのは7つ。
 *   1. 期間は 12/1 0:00〜1/1 0:00（JST）。いまは配信に出ない（live: false）。11月の城と豚の切り替えは変わらない
 *   2. 置いてある globe.json が読めて、呼ぶ絵が全部置いてある（ピポは城と同じ 12 のポーズ）
 *   3. 大きさは豚と同じ物差し（Dimensions の幅）。場面は豚の 1.6 倍の四角に収まる
 *   4. 0% は灯りが全部消えた絵、100% で全部灯る。灯りは下から上へ
 *   5. 100% ちょうどは満タン、超えたらあふれ（100% と 120% が違って見える）
 *   6. ピポの顔の幅は場面の幅の 13.5%。どの居場所・どのポーズ（跳ねても・傾けても）でも場面から出ない
 *   7. ピポの動きは城のくじ（castleBrain）そのまま。スノードームの場所で、90 秒のうちに全部の動きが入る
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { THEMES, themeAt, themeFromParam, bankFrameUrl } from "../themes";
import { BREATH, CASTLE_TIMES, PIG_BOX, PIPO_POSES, castleBox, fitPipoX, pipoFace, pipoReach, pipoRect, pipoSize, type PipoPose } from "../season/bank/castle";
import { actionMs, initialBrain, nextAction, type PipoAction, type Spot } from "../season/bank/castleBrain";
import { HOP, XMAS_FONT, canvasBox, globeFiles, globeLightY, isFull, isOver, readGlobeDef, xmasBox, xmasLayout } from "../season/bank/xmas";
import { seededRandom } from "../season/plan";

const jst = (s: string) => new Date(`${s}+09:00`);
const xmas = THEMES.find((t) => t.id === "christmas")!;
const PUB = join(__dirname, "../../../public");
const BANK = join(PUB, xmas.xmasBank!.dir);
const RAW = JSON.parse(readFileSync(join(BANK, "globe.json"), "utf-8"));
const def = readGlobeDef(RAW)!;
const CB = canvasBox(def);
const [CW, CH] = def.canvas;

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
  it("globe.json が読めて、呼ぶ絵が全部ある。ピポは城と同じ 12 のポーズを持つ", () => {
    expect(def).not.toBeNull();
    for (const f of globeFiles(def)) expect(existsSync(join(BANK, f))).toBe(true);
    expect(Object.keys(def.pipo.poses).sort()).toEqual([...PIPO_POSES].sort());
  });
  it("0% と 100% の絵は、コマ送りの絵と同じもの（同じ構図を2回読まない）", () => {
    expect(def.globe.base).toBe("bank-base-0.png");
    expect(def.globe.lit).toBe("bank-fill-0.png");
  });
  it("欠けていれば読まない（片方の部品だけで出さない）", () => {
    expect(readGlobeDef(null)).toBeNull();
    expect(readGlobeDef({ ...RAW, pipo: { ...RAW.pipo, poses: { sit: RAW.pipo.poses.sit } } })).toBeNull();
    expect(readGlobeDef({ ...RAW, stage: { ...RAW.stage, peeks: [] } })).toBeNull();
    expect(readGlobeDef({ ...RAW, globe: { ...RAW.globe, light: [0.2, 0.6] } })).toBeNull();
  });
});

describe("3. 大きさは豚と同じ物差し", () => {
  it("場面は豚の 1.6 倍（11月の城と同じ式）", () => {
    for (const w of [150, 218, 332]) expect(xmasBox(w)).toEqual(castleBox(w));
    expect(xmasBox(218).width / (218 * PIG_BOX.w)).toBeCloseTo(CASTLE_TIMES, 1);
  });
  it("場面の座標が四角いっぱいに収まる（幅か高さの 98% 以上を使う）", () => {
    for (const w of [150, 218, 332]) {
      const box = xmasBox(w);
      const L = xmasLayout(box, def);
      expect(L.ox).toBeGreaterThanOrEqual(-0.01);
      expect(L.oy).toBeGreaterThanOrEqual(-0.01);
      expect(L.ox + CW * L.s).toBeLessThanOrEqual(box.width + 0.01);
      expect(Math.max((CW * L.s) / box.width, (CH * L.s) / box.height)).toBeGreaterThan(0.98);
    }
  });
  it("ドーム・帯・積んだプレゼントが場面の中に収まる", () => {
    const inside = ([x, y, w, h]: number[]) => x >= 0 && y >= 0 && x + w <= CW && y + h <= CH;
    expect(inside(def.globe.rect)).toBe(true);
    expect(inside(def.band.rect)).toBe(true);
    for (const d of def.deco) expect(inside(d.rect)).toBe(true);
  });
});

describe("4. 灯り", () => {
  it("下から上へ（0% で灯りの範囲の下の端、100% で上の端）", () => {
    expect(globeLightY(def, 0)).toBeCloseTo(def.globe.light[0]);
    expect(globeLightY(def, 1)).toBeCloseTo(def.globe.light[1]);
    expect(globeLightY(def, 0.5)).toBeLessThan(globeLightY(def, 0.25));
  });
});

describe("5. 100% と 120% が違って見える", () => {
  it("100% ちょうどは満タン（星・帯の光）で、あふれではない。超えたらあふれ（金の雪の渦・金の光・踊る）", () => {
    expect(isFull(1)).toBe(true);
    expect(isFull(0.999)).toBe(false);
    expect(isOver(50000, 50000)).toBe(false);
    expect(isOver(60000, 50000)).toBe(true);
    expect(isOver(10, 0)).toBe(false);
  });
});

/** ピポの居場所（足もと）ぜんぶ。道は両端と真ん中 */
const st = def.stage;
const spots: { name: string; x: number; y: number }[] = [
  { name: "left", x: st.left[0], y: st.left[1] },
  { name: "right", x: st.right[0], y: st.right[1] },
  { name: "gate", x: st.gate[0], y: st.gate[1] },
  ...st.lane.x.map((x, i) => ({ name: `lane${i}`, x, y: st.lane.y })),
  ...st.ledges.map(([x, y], i) => ({ name: `ledge${i}`, x, y })),
];
/** そのポーズで掛ける傾き（度）と広がり（XmasBank の show と同じ） */
const MOVE: Partial<Record<PipoPose, { sway: number; scale: number; lift: number }>> = {
  cheer: { sway: 6, scale: HOP.scale, lift: HOP.lift },
  flag: { sway: 7, scale: BREATH, lift: 0 },
  sit: { sway: 6, scale: BREATH * 1.06, lift: 0 },
  wait: { sway: 6, scale: BREATH * 1.06, lift: 0 },
  yawn: { sway: 0, scale: BREATH * 1.01, lift: 0 },
  sleep: { sway: 0, scale: BREATH * 1.05 * 1.025, lift: 0 },
  jump: { sway: 0, scale: BREATH * 1.08, lift: 0 },
};

describe("6. ピポ", () => {
  it("顔の幅は場面の幅の 13.5%（どのポーズも同じ。11月の城と同じ大きさ）", () => {
    expect(def.pipo.face).toBeCloseTo(0.135, 3);
    for (const p of PIPO_POSES) expect(pipoFace(def, CB, p, 500, 300).w / CW).toBeCloseTo(0.135, 3);
  });
  it("どの居場所・どのポーズでも、場面に収まるよう寄せたあと場面から出ない（跳ねる高さ・傾き・広がり込み）", () => {
    const bad: string[] = [];
    for (const s of spots)
      for (const p of PIPO_POSES) {
        if (p === "peek" || p === "peekWave") continue;
        const mv = MOVE[p] ?? { sway: 0, scale: BREATH, lift: 0 };
        for (const d of [1, -1] as const) {
          const x = fitPipoX(def, CB, p, s.x, d, mv.sway, mv.scale);
          const reach = pipoReach(def, CB, p, mv.sway, mv.scale);
          const l = x - (d === 1 ? reach.l : reach.r);
          const r = x + (d === 1 ? reach.r : reach.l);
          const rect = pipoRect(def, CB, p, x, s.y);
          const top = s.y - (s.y - rect.y) * mv.scale - CH * mv.lift;
          const bottom = rect.y + rect.h;
          if (l < -0.5 || r > CW + 0.5 || top < -0.5 || bottom > CH + 0.5) bad.push(`${s.name}/${p}/${d}: ${l.toFixed(0)}..${r.toFixed(0)} × ${top.toFixed(0)}..${bottom.toFixed(0)}`);
        }
      }
    expect(bad).toEqual([]);
  });
  it("帯ごしに顔を出すとき、帯の上に出る顔と前足が場面から出ない", () => {
    for (const [x, y] of st.peeks)
      for (const p of ["peek", "peekWave"] as const) {
        const r = pipoRect(def, CB, p, x, y);
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(CW);
        expect(r.y).toBeGreaterThanOrEqual(0);
        // 帯の上のふちあたり（帯の四角の中）で切る
        expect(y).toBeGreaterThanOrEqual(def.band.rect[1]);
        expect(y).toBeLessThan(def.band.rect[1] + def.band.rect[3] * 0.4);
      }
  });
  it("左の隅は場面の左の端まで使う（貯金箱の幅が豚の 1.6 倍に届く）。右は台座の上の右の端", () => {
    const l = pipoRect(def, CB, "sit", st.left[0], st.left[1]);
    expect(l.x).toBeLessThan(CW * 0.03);
    expect(st.right[1]).toBe(st.lane.y);
    expect(pipoSize(def, CB, "sit").w).toBeGreaterThan(0);
  });
});

describe("7. ピポの動きは城のくじ（castleBrain）そのまま", () => {
  it("90 秒のうちに、歩く・座る・小芸・帯ごしに顔を出す・プレゼントに跳び乗る・眠るが入る。あふれていると踊る", () => {
    for (const [seed, over] of [
      ["a", false],
      ["b", false],
      ["c", true],
      ["d", true],
    ] as const) {
      const r = seededRandom(seed);
      const b = initialBrain(r, over, st.peeks.length, st.ledges.length);
      const kinds = new Set<PipoAction["kind"]>();
      let at: Spot = b.at;
      while (b.t < 90000) {
        const a = nextAction(b, r);
        kinds.add(a.kind);
        b.t += actionMs(a, at) + 120;
        at = b.at;
      }
      for (const k of ["walk", "trick", "peek", "climb", "nap"] as const) expect({ seed, k, has: kinds.has(k) }).toEqual({ seed, k, has: true });
      if (over) expect(kinds.has("dance")).toBe(true);
    }
  });
  it("目立たせる字は いまの額だけ（目標と旅の名前は半分ほど）", () => {
    expect(XMAS_FONT.target / XMAS_FONT.amount).toBeLessThan(0.6);
    expect(XMAS_FONT.label / XMAS_FONT.amount).toBeLessThan(0.6);
  });
});
