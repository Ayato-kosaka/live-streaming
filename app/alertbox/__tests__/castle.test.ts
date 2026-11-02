/**
 * 11月の貯金箱（ブラン城、#1078）。
 *
 *   npx jest app/alertbox/__tests__/castle.test.ts
 *
 * 守りたいのは8つ。
 *   1. 期間は 11/1 0:00〜12/1 0:00（JST）。12/1 0:00 に豚へ戻る
 *   2. 投げ銭の演出は今のまま（段は1つで、台本も小物も札も持たない＝季節の外と同じ出し方）
 *   3. 大きさは豚と同じ物差し（Dimensions の幅）だけで決まる。PRISM の % が何でも豚の 1.6 倍
 *   4. 置いてある castle.json が読めて、呼ぶ絵が全部置いてある
 *   5. 灯り・旗の決め方（溜まるほど上がる）と、城・リボン・字が場面の中に収まる
 *   6. 字はいまの額だけを目立たせる（目標と旅の名前は小さく。2版目、あやと 2026-11-02）
 *   7. ピポはどこへ動いても、豚の 1.6 倍の四角から出ない。顔の幅は前の版の 1.5 倍以上
 *   8. ピポの動きの決め方（くじ）: 90 秒のうちに両隅・屋根ごし・岩山・眠るが入り、同じ芸を続けない
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { THEMES, themeAt, tierFor } from "../themes";
import { stageFor } from "../season/show/stage";
import {
  CASTLE_FONT,
  CASTLE_TIMES,
  GROUND_POSES,
  PIG_BOX,
  PIPO_POSES,
  RIBBON_W,
  arcPoints,
  castleBox,
  castleFiles,
  castleLayout,
  fitPipoX,
  pipoReach,
  flagY,
  lightY,
  pipoFace,
  pipoRect,
  pipoSize,
  pipoStage,
  readCastleDef,
  type PipoPose,
} from "../season/bank/castle";
import { actionMs, initialBrain, nextAction, type PipoAction, type Spot } from "../season/bank/castleBrain";

const castle = THEMES.find((t) => t.id === "castle")!;
const DIR = join(__dirname, "../../../public/alert/themes/castle");
const RAW = JSON.parse(readFileSync(join(DIR, "castle.json"), "utf8"));
const real = readCastleDef(RAW)!;
const jst = (s: string) => new Date(`${s}+09:00`);
/** リボンの絵の 幅/高さ（PNG の頭から読む） */
const ribbonAspect = (() => {
  const b = readFileSync(join(DIR, real.ribbon.file));
  return b.readUInt32BE(16) / b.readUInt32BE(20);
})();

/** 決まった並びの乱数（mulberry32） */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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
    for (const f of castleFiles(real)) expect(existsSync(join(DIR, f))).toBe(true);
    for (let i = 0; i < castle.bank.frames; i++) {
      expect(existsSync(join(DIR, `bank-base-${i}.png`))).toBe(true);
      expect(existsSync(join(DIR, `bank-fill-${i}.png`))).toBe(true);
    }
  });
  it("ピポの絵の大きさが、castle.json に書いた大きさと同じ（顔の幅で大きさを決めるので、ずれると顔が跳ねる）", () => {
    for (const p of PIPO_POSES) {
      const sp = real.pipo.poses[p];
      const b = readFileSync(join(DIR, sp.file));
      expect([b.readUInt32BE(16), b.readUInt32BE(20)]).toEqual(sp.size);
    }
  });
  it("欠けたものは読まない（片方の部品だけで城を出さない）", () => {
    expect(readCastleDef(null)).toBeNull();
    expect(readCastleDef({ ...RAW, pipo: {} })).toBeNull();
    expect(readCastleDef({ ...RAW, light: { bottom: 10, top: 20 } })).toBeNull();
    expect(readCastleDef({ ...RAW, coin: undefined })).toBeNull();
    const { yawn: _drop, ...poses } = RAW.pipo.poses;
    expect(readCastleDef({ ...RAW, pipo: { ...RAW.pipo, poses } })).toBeNull();
    expect(readCastleDef({ ...RAW, pipo: { ...RAW.pipo, peeks: [] } })).toBeNull();
  });
});

describe("灯り・旗", () => {
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
});

/** PRISM 140% と 100% の Dimensions の幅、と少し広い・狭い端末 */
const DIMS = [218, 606 * 0.36, 180, 260];

const inside = (box: { width: number; height: number }, r: { x: number; y: number; w: number; h: number }, tag: string) => {
  const ok = r.x >= -0.5 && r.y >= -0.5 && r.x + r.w <= box.width + 0.5 && r.y + r.h <= box.height + 0.5;
  if (!ok) throw new Error(`${tag} が場面の外: ${JSON.stringify(r)} 場面 ${box.width}×${box.height}`);
};

describe("並びと字", () => {
  it.each(DIMS)("Dimensions の幅 %s: 城・リボン・字が、豚の 1.6 倍の四角の中に収まる", (d) => {
    const box = castleBox(d);
    const L = castleLayout(box, real, ribbonAspect);
    inside(box, L.castle, "城");
    inside(box, L.plate, "リボン");
    inside(box, L.text, "字");
  });
  it("リボンは城より狭く、場面の高さの 3 割まで（前の版は場面の幅いっぱい・高さの 44%。#1078「文字が貯金箱より目立ってる」）", () => {
    const box = castleBox(218);
    const L = castleLayout(box, real, ribbonAspect);
    expect(L.plate.w).toBeLessThan(L.castle.w);
    expect(L.plate.w / box.width).toBeCloseTo(RIBBON_W, 5);
    expect(L.plate.h / box.height).toBeLessThanOrEqual(0.3);
    // 城は前の版（高さ 145px）より大きい
    expect(L.castle.h).toBeGreaterThan(145 * 1.14);
  });
  it("いまの額は豚の字（20px）くらい。目標と旅の名前は、いまの額の 6 割まで", () => {
    const box = castleBox(218);
    const L = castleLayout(box, real, ribbonAspect);
    expect(L.font.amount).toBeGreaterThanOrEqual(18);
    expect(L.font.amount).toBeLessThanOrEqual(22);
    expect(L.font.target / L.font.amount).toBeLessThanOrEqual(0.6);
    expect(L.font.label / L.font.amount).toBeLessThanOrEqual(0.6);
    expect(CASTLE_FONT.label / CASTLE_FONT.amount).toBeGreaterThanOrEqual(0.45);
  });
});

describe("ピポの舞台", () => {
  it.each(DIMS)("Dimensions の幅 %s: どこで何のポーズを取っても、絵が豚の 1.6 倍の四角から出ない", (d) => {
    const box = castleBox(d);
    const L = castleLayout(box, real, ribbonAspect);
    const st = pipoStage(real, box, L);
    // 両隅と門の前: 地面のポーズ全部（左右を返しても）
    const spots: [string, number, number][] = [
      ["左の隅", st.left, st.ground],
      ["右の隅", st.right, st.ground],
      ["門の前", st.gate.x, st.gate.y],
      ...st.ledges.map((g, i): [string, number, number] => [`岩山${i}`, g.x, g.y]),
    ];
    for (const [tag, x0, y] of spots) {
      for (const p of [...GROUND_POSES, "sleep" as PipoPose]) {
        for (const dir of [1, -1] as const) {
          // 幅の広いポーズは、場面から出ないぶん内へ寄せてから描く（`CastleBank` の show と同じ）
          const x = fitPipoX(real, box, p, x0, dir);
          const r = pipoRect(real, box, p, x, y);
          inside(box, dir === 1 ? r : { ...r, x: 2 * x - (r.x + r.w) }, `${tag} ${p}${dir === -1 ? "（左右を返す）" : ""}`);
        }
      }
    }
    // 屋根ごしに顔を出す: 上がりきった絵が場面の上へ出ない（下は屋根の線で切る）
    for (const [i, pk] of st.peeks.entries()) {
      for (const p of ["peek", "peekWave"] as const) {
        const r = pipoRect(real, box, p, pk.x, pk.y);
        inside(box, r, `屋根ごし${i} ${p}`);
      }
    }
    // 跳ぶ道: 隅・門 ↔ 岩山。跳んでいる絵（足もとが道の上）が場面から出ない
    const ends = [
      { x: st.left, y: st.ground },
      { x: st.right, y: st.ground },
      st.gate,
    ];
    for (const g of st.ledges) {
      for (const e of ends) {
        // 跳ぶ絵は幅が広いので、跳ぶ前・下りる先は、場面から出ない所へ寄せる（`CastleBank` の climb と同じ）
        const up = e.x < g.x ? 1 : -1;
        const from = { x: fitPipoX(real, box, "jump", e.x, up), y: e.y };
        const to = { x: fitPipoX(real, box, "jump", e.x, up === 1 ? -1 : 1), y: e.y };
        for (const [a, b, lift] of [
          [from, g, box.height * 0.16],
          [g, to, box.height * 0.1],
        ] as const) {
          for (const pt of arcPoints(a, b, lift)) {
            const r = pipoRect(real, box, "jump", pt.x, pt.y);
            inside(box, r, "跳ぶ道");
            inside(box, { ...r, x: 2 * pt.x - (r.x + r.w) }, "跳ぶ道（左右を返す）");
          }
        }
      }
    }
  });
  it("隅で傾けても・広げても場面から出ない（旗を振る ±7 度・首をかしげる・着地の「ぽよん」1.08 倍まで。初版の道具で幅が 1.65 倍に出たのはこれ）", () => {
    for (const d of DIMS) {
      const box = castleBox(d);
      const st = pipoStage(real, box, castleLayout(box, real, ribbonAspect));
      for (const x0 of [st.left, st.right])
        for (const p of [...GROUND_POSES, "sleep" as PipoPose, "jump" as PipoPose])
          for (const dir of [1, -1] as const)
            for (const [sway, scale] of [[0, 1.012], [7, 1.012], [0, 1.012 * 1.08]] as const) {
              const x = fitPipoX(real, box, p, x0, dir, sway, scale);
              const r = pipoReach(real, box, p, sway, scale);
              const l = x - (dir === 1 ? r.l : r.r);
              const rr = x + (dir === 1 ? r.r : r.l);
              expect(l).toBeGreaterThanOrEqual(-0.01);
              expect(rr).toBeLessThanOrEqual(box.width + 0.01);
            }
    }
  });
  it("隅で座るピポは場面の端まで来る（貯金箱の幅をいつも豚の 1.6 倍まで使う。alert-banksize の下限 1.5 倍を、くじに任せない）", () => {
    for (const d of DIMS) {
      const box = castleBox(d);
      const st = pipoStage(real, box, castleLayout(box, real, ribbonAspect));
      const l = Math.min(...(["sit", "wait"] as const).map((p) => pipoRect(real, box, p, st.left, st.ground).x));
      const r = Math.max(...(["sit", "wait"] as const).map((p) => { const q = pipoRect(real, box, p, st.right, st.ground); return q.x + q.w; }));
      expect((r - l) / (d * PIG_BOX.w)).toBeGreaterThanOrEqual(1.5);
    }
  });
  it("両隅はリボンの横の空き（隅で座るピポの顔に、リボンの端が 15% より多く掛からない）", () => {
    const box = castleBox(218);
    const L = castleLayout(box, real, ribbonAspect);
    const st = pipoStage(real, box, L);
    for (const x of [st.left, st.right]) {
      for (const p of ["sit", "wait"] as const) {
        const f = pipoFace(real, box, p, x, st.ground);
        const ow = Math.max(0, Math.min(f.x + f.w, L.plate.x + L.plate.w) - Math.max(f.x, L.plate.x));
        const oh = Math.max(0, Math.min(f.y + f.h, L.plate.y + L.plate.h) - Math.max(f.y, L.plate.y));
        // 顔の四角は首巻きの上の端まで。掛かるのは あごの角（リボンの尾の上の角）だけ
        expect((ow * oh) / (f.w * f.h)).toBeLessThanOrEqual(0.15);
      }
    }
  });
  it("どのポーズも顔の幅が同じ（ポーズを替えても顔が跳ねない）", () => {
    const box = castleBox(218);
    const ws = PIPO_POSES.map((p) => pipoFace(real, box, p, 0, 0).w);
    for (const w of ws) expect(w).toBeCloseTo(ws[0], 6);
  });
  it("顔の幅は、前の版（PR #1090）のピポの 1.5 倍以上", () => {
    // 前の版の顔の幅（Dimensions の幅 218 のときの CSS px）。前の版の絵を `tools/sprites/alert-pipoface.mjs` と
    // 同じ割合（OLD_FACES）で測った: 待つ 25.0・窓から顔を出す 15.5・バンザイ 25.2
    const OLD = { wait: 25.0, peek: 15.5, cheer: 25.2 };
    const face = pipoSize(real, castleBox(218), "sit").k * (real.pipo.poses.sit.face[2] - real.pipo.poses.sit.face[0]);
    for (const v of Object.values(OLD)) expect(face / v).toBeGreaterThanOrEqual(1.5);
  });
});

/** 90 秒ぶん、くじを回す（動きの長さは目安の `actionMs`） */
function run(seed: number, ms = 90000, overflow = false) {
  const r = rng(seed);
  const st = initialBrain(r, overflow, real.pipo.peeks.length, real.pipo.ledges.length);
  const acts: { t: number; a: PipoAction; at: Spot }[] = [];
  const visited = new Set<Spot>([st.at]);
  while (st.t < ms) {
    const from = st.at;
    const a = nextAction(st, r);
    acts.push({ t: st.t, a, at: st.at });
    visited.add(st.at);
    st.t += actionMs(a, from) + 120;
  }
  return { acts, visited };
}

describe("ピポの動きの決め方（くじ）", () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])("seed %s: 90 秒のうちに、両隅・屋根ごし・岩山・眠る が入る", (seed) => {
    const { acts, visited } = run(seed);
    expect(visited.has("left")).toBe(true);
    expect(visited.has("right")).toBe(true);
    const kinds = acts.map((x) => x.a.kind);
    expect(kinds.filter((k) => k === "peek").length).toBeGreaterThanOrEqual(3);
    expect(kinds.filter((k) => k === "climb").length).toBeGreaterThanOrEqual(2);
    expect(kinds).toContain("nap");
    expect(kinds.filter((k) => k === "trick").length).toBeGreaterThanOrEqual(5);
  });
  it("同じ芸・同じ顔を出す所・同じ岩山を、続けて選ばない", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { acts } = run(seed, 300000);
      const seq = <T,>(f: (a: PipoAction) => T | null) => acts.map((x) => f(x.a)).filter((v): v is T => v != null);
      for (const list of [
        seq((a) => (a.kind === "trick" ? a.trick : null)),
        seq((a) => (a.kind === "peek" ? a.spot : null)),
        seq((a) => (a.kind === "climb" ? a.ledge : null)),
      ]) {
        for (let i = 1; i < list.length; i++) expect(list[i]).not.toBe(list[i - 1]);
      }
    }
  });
  it("眠るのは隅で（門の前では眠らない）", () => {
    for (let seed = 1; seed <= 30; seed++) {
      for (const { a, at } of run(seed, 300000).acts) if (a.kind === "nap") expect(at).not.toBe("gate");
    }
  });
  it("100% を超えたら、バンザイで跳ねるのを混ぜる（超えていなければ出さない）", () => {
    const over = [1, 2, 3, 4, 5].flatMap((s) => run(s, 120000, true).acts.map((x) => x.a.kind));
    const under = [1, 2, 3, 4, 5].flatMap((s) => run(s, 120000, false).acts.map((x) => x.a.kind));
    expect(over).toContain("dance");
    expect(under).not.toContain("dance");
  });
});
