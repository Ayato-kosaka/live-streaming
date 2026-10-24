/**
 * 段の演出（台本・名前の札・その人の絵を出す秒）と、切り絵の部品・クロの動きの決め方。
 *
 *   npx jest app/alertbox/__tests__/stage.test.ts
 *
 * 守りたいのは5つ。
 *   1. 額 → 段 → 出し方。境目（999/1000・4999/5000・9999/10000）で札と台本を取り違えない。
 *      部品が読めなければ台本に乗らず、**その人の絵も遅らせない**
 *   2. 台本の時刻の並び（前兆 → 登場 → 札 → 数え上げ → ドン → その人の番 → 締め）と、
 *      ヒットストップのぶんのずらし
 *   3. 札の文面の割り方（いまの型を2行に）
 *   4. rig.json の読み方（壊れた組で組まない）と、入れ子で組んだときの描く順
 *   5. クロは 60秒のあいだに同じことを繰り返さない（芸が 5〜9秒おき・続けて同じ芸をしない）
 */
import { THEMES, themeItems, themePoses, themeRigs, tierFor } from "../themes";
import { stageFor, plateTiming } from "../season/show/stage";
import { cueOf, resolveScript, scriptProblems, type Cue } from "../season/show/script";
import { splitPlateText, plainLine } from "../season/plate/plateText";
import { drawOrder, parseRig, restPivot, rigFiles, zConflicts } from "../season/rig/rig";
import { initialBrain, nextAction, pickRunTarget, TRICK_GAP, type KuroAction } from "../season/bank/kuroBrain";
import { settings } from "../config";

const halloween = THEMES.find((t) => t.id === "halloween")!;
/** アラートの長さ（`index.tsx` と同じ式） */
const durationFor = (yen: number) => 30 + (yen >= 10000 ? 30 : yen >= 1000 ? 15 : 0);
const allRigs = () => true;
const noRigs = () => false;

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

describe("額 → 段 → 出し方", () => {
  it.each([
    [0, "round", true],
    [199, "round", true],
    [200, "round", true],
    [499, "round", true],
    [500, "round", true],
    [999, "round", true],
    [1000, "round", true],
    [1999, "round", true],
    [2000, "round", true],
    [4999, "round", true],
    [5000, "round", true],
    [9999, "round", true],
    [10000, "gold", true],
    [300000, "gold", true],
  ])("%d円 → 札 %s / 台本 %s", (yen, frame, show) => {
    const st = stageFor(halloween, yen, durationFor(yen), allRigs)!;
    expect(st.plate?.frame).toBe(frame);
    expect(!!st.show).toBe(show);
  });

  /* 字の大きさは段で変えない（2版目。オーナー「大きいので下げて」）。段で強くなるのは縁の太さと光 */
  it("段ごとに字の縁が太く・光が強くなる", () => {
    const ps = [100, 300, 700, 1500, 3000, 7000].map((y) => tierFor(halloween, y).plate!);
    for (let i = 1; i < ps.length; i++) {
      expect(ps[i].stroke).toBeGreaterThanOrEqual(ps[i - 1].stroke);
      expect(ps[i].glow).toBeGreaterThanOrEqual(ps[i - 1].glow);
    }
  });

  it("段4は台本どおりなら、その人の絵と読み上げを 6.5秒（＋止めたぶん）遅らせる", () => {
    const st = stageFor(halloween, 20000, 60, allRigs)!;
    expect(st.revealSec).toBeGreaterThanOrEqual(6.5);
    expect(st.revealSec).toBeLessThan(6.7);
  });


  it("部品が1つでも読めなければ台本に乗らず、その人の絵も遅らせない（前の小物の演出に落ちる）", () => {
    const st = stageFor(halloween, 20000, 60, (n) => n !== "props")!;
    expect(st.show).toBeNull();
    expect(st.revealSec).toBe(0);
    // 札は出す（金の額縁）。運ばれてこずに、その場で出る
    expect(st.plate?.frame).toBe("gold");
    expect(plateTiming(st).carried).toBe(false);
    expect(plateTiming(st).count).toBeNull();
  });

  it("revealSec を 0 にすれば、台本どおりでも今どおり（すぐ）出る", () => {
    const th = {
      ...halloween,
      tiers: halloween.tiers.map((t) => (t.show ? { ...t, show: { ...t.show, revealSec: 0 } } : t)),
    };
    expect(stageFor(th, 20000, 60, allRigs)!.revealSec).toBe(0);
  });

  it("季節の外（テーマ無し）は何も決めない（今までどおりの字と絵）", () => {
    expect(stageFor(null, 20000, 60, allRigs)).toBeNull();
  });

  /* 段はどれも台本を持つ（2026-10-24 に段5・段6も入った）。台本に乗れないのは、絵が読めなかった日 */
  it("台本に乗れない日（絵が読めない）は、札はすぐ（0.8秒）ぽんっと出て、絵も遅らせない", () => {
    for (const yen of [3000, 7000]) {
      const st = stageFor(halloween, yen, durationFor(yen), noRigs)!;
      expect(st.revealSec).toBe(0);
      expect(plateTiming(st)).toEqual({ appearAt: 0.8, carried: false, wipe: null, count: null, donAt: null });
    }
  });

  it("段3（行進）は、その人の絵をすぐ出し、字は「ジャン！」で1字ずつ弾んで出る", () => {
    const st = stageFor(halloween, 700, durationFor(700), allRigs)!;
    expect(st.show?.kind).toBe("march");
    expect(st.revealSec).toBe(0);
    expect(plateTiming(st)).toEqual({ appearAt: 1.9, carried: false, wipe: null, count: null, donAt: null });
    expect(scriptProblems(st.show!.script, durationFor(700), 0)).toEqual([]);
  });

  it("段4（魔法使い）は、あやとが札の上へ退いてからその人の絵を出し、札は杖の光で書く", () => {
    const st = stageFor(halloween, 1500, durationFor(1500), allRigs)!;
    expect(st.show?.kind).toBe("wizard");
    expect(st.revealSec).toBeCloseTo(4.3);
    expect(plateTiming(st)).toEqual({ appearAt: 2.6, carried: false, wipe: "write", count: null, donAt: 3.6 });
    expect(scriptProblems(st.show!.script, durationFor(1500), st.show!.revealSec)).toEqual([]);
  });

  it("段4のポーズ絵が読めなければ、台本に乗らずその人の絵も遅らせない", () => {
    const st = stageFor(halloween, 1500, durationFor(1500), (n) => n !== "wizard")!;
    expect(st.show).toBeNull();
    expect(st.revealSec).toBe(0);
  });

  it("段1・2（おばけ・こうもりの子）は、その人の絵をすぐ出し、字は1字ずつ弾んで出る", () => {
    for (const [yen, kind, at] of [[100, "ghost", 1.6], [300, "broom", 1.5]] as const) {
      const st = stageFor(halloween, yen, durationFor(yen), allRigs)!;
      expect(st.show?.kind).toBe(kind);
      expect(st.revealSec).toBe(0);
      expect(plateTiming(st)).toEqual({ appearAt: at, carried: false, wipe: null, count: null, donAt: null });
      expect(scriptProblems(st.show!.script, durationFor(yen), 0)).toEqual([]);
    }
  });

  it("段3の坊やの部品が読めなければ、今までどおり札がぽんっと出る", () => {
    const st = stageFor(halloween, 700, durationFor(700), (n) => n !== "pumpkin_kid")!;
    expect(st.show).toBeNull();
    expect(plateTiming(st).wipe).toBeNull();
  });

  it("テーマが読む切り絵は、貯金箱と台本のある段のぶん", () => {
    expect(new Set(themeRigs(halloween))).toEqual(new Set(["kuro", "bucket", "bat", "props", "pumpkin_kid", "ghost", "broom"]));
  });

  it("段5〜7はポーズ絵と小物も要る。ポーズ絵と小物は同じ名前（dracula）でも、種類ごとに見分ける", () => {
    expect(themePoses(halloween)).toEqual(expect.arrayContaining(["wizard", "reaper", "zombie", "dracula"]));
    expect(new Set(themeItems(halloween))).toEqual(new Set(["reaper", "zombie", "dracula"]));
    // 段5・段6も、小物の組が読めていなければ台本に乗らない
    expect(stageFor(halloween, 3000, 45, (n, kind) => !(kind === "item" && n === "reaper"))!.show).toBeNull();
    expect(stageFor(halloween, 7000, 45, (n, kind) => !(kind === "item" && n === "zombie"))!.show).toBeNull();
    // 小物の組だけ読めていない → 台本に乗らない（ポーズ絵の dracula が読めていても取り違えない）
    const noItems = stageFor(halloween, 10000, 60, (n, kind) => !(kind === "item" && n === "dracula"))!;
    expect(noItems.show).toBeNull();
    const noPose = stageFor(halloween, 10000, 60, (n, kind) => !(kind === "pose" && n === "dracula"))!;
    expect(noPose.show).toBeNull();
    expect(stageFor(halloween, 10000, 60, allRigs)!.show?.kind).toBe("dracula");
  });

  it("作り直したハロウィンは配信に出ている（下ろしていない）", () => {
    expect(halloween.live).not.toBe(false);
  });
});

describe("台本の時刻の並び", () => {
  const show = tierFor(halloween, 20000).show!;
  const cues = resolveScript(show.script, 60);
  const t = (k: Cue["do"]) => cueOf(cues, k)!.t;

  it("決まりを破っていない（アラートの中に収まる・札→数え上げ→ドン・その人の絵は revealSec）", () => {
    expect(scriptProblems(show.script, 60, show.revealSec)).toEqual([]);
  });

  it("時刻の順に並んでいて、前兆 → 登場 → 札 → ドン → その人の番 → 滞在 → 締め", () => {
    for (let i = 1; i < cues.length; i++) expect(cues[i].t).toBeGreaterThanOrEqual(cues[i - 1].t);
    const order: Cue["do"][] = ["darken", "pulse", "batVortex", "flash", "castleRise", "carpetRoll", "coffinDrop", "lidOpen", "rise", "capeOpen", "plateIn", "count", "don", "reveal", "retreat", "stay", "finale"];
    const times = order.map(t);
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
  });

  it("前兆のあいだ（暗転から閃光まで）は、主役も札も出ていない", () => {
    expect(t("darken")).toBe(0);
    expect(t("flash")).toBeLessThan(t("castleRise"));
    expect(t("flash")).toBeLessThan(t("plateIn"));
    expect(t("flash") - t("darken")).toBeGreaterThanOrEqual(1.2);
  });

  it("登場の山場は 5秒に収まる（閃光から「ドン」まで。設計書 §3.8）", () => {
    expect(t("don") - t("flash")).toBeLessThanOrEqual(5);
  });

  it("ヒットストップは、それより後をその長さだけずらす", () => {
    const raw = resolveScript(show.script, 60, false);
    const rawLid = cueOf(raw, "lidOpen")!.t;
    expect(t("lidOpen") - rawLid).toBeCloseTo(0.08, 5);
    // それより前はずれない
    expect(t("coffinDrop")).toBeCloseTo(cueOf(raw, "coffinDrop")!.t, 5);
  });

  it("締めは終わりから数える（アラートの長さが変わっても付いてくる）", () => {
    const c45 = cueOf(resolveScript(show.script, 45), "finale")!;
    expect(c45.t + (c45.dur ?? 0)).toBeCloseTo(45, 5);
    expect(t("finale")).toBeCloseTo(56, 5);
    // 止めたぶん遅れる時計で見るときは、その合計だけ手前（壁の時計で同じ所に来る）
    const stopped = show.script.reduce((a, c) => a + (c.do === "hitstop" ? c.dur ?? 0 : 0), 0);
    expect(stopped).toBeGreaterThan(0);
    expect(cueOf(resolveScript(show.script, 60, false), "finale")!.t).toBeCloseTo(56 - stopped, 5);
  });

  it("対照: 数え終わりとドンがずれた台本は、決まり破りとして挙がる", () => {
    const bad: Cue[] = show.script.map((c) => (c.do === "don" ? { ...c, at: c.at + 0.4 } : c));
    expect(scriptProblems(bad, 60, show.revealSec).join()).toMatch(/ドン/);
  });

  it("対照: 終わりを越える出来事は挙がる", () => {
    const bad: Cue[] = [...show.script, { at: 59, do: "flash", dur: 2 }];
    expect(scriptProblems(bad, 60, show.revealSec).length).toBeGreaterThan(0);
  });
});

describe("札の文面の割り方", () => {
  const tpl = settings.donation.messageTemplate;

  it("いまの型を「名前 様」と「額 単位 ありやとう！！」に割る", () => {
    const l = splitPlateText(tpl, { name: "もっと豆はけ", amount: 20000, unit: "円" });
    expect(plainLine(l.name)).toBe("もっと豆はけ 様");
    expect(plainLine(l.amount)).toBe("20,000円 ありやとう！！");
    expect(l.amount[0]).toEqual({ kind: "amount", text: "20,000", value: 20000 });
  });

  it("スパチャの単位（通貨）もそのまま", () => {
    const l = splitPlateText(tpl, { name: "a", amount: 5, unit: "$" });
    expect(plainLine(l.amount)).toBe("5$ ありやとう！！");
  });

  it("名前の中の {} や空白は、型として読まない", () => {
    const l = splitPlateText(tpl, { name: "{金額} さん ", amount: 1000, unit: "円" });
    expect(plainLine(l.name)).toBe("{金額} さん  様");
    expect(plainLine(l.amount)).toBe("1,000円 ありやとう！！");
  });

  it("{金額} の無い型は1行のまま", () => {
    const l = splitPlateText("{名前} さんがチャンネル登録しました", { name: "x", amount: 0, unit: "円" });
    expect(plainLine(l.name)).toBe("x さんがチャンネル登録しました");
    expect(l.amount).toEqual([]);
  });
});

describe("rig.json の読み方", () => {
  const good = {
    name: "t",
    size: [100, 100],
    parts: [
      { id: "body", file: "b.png", parent: null, pivot: [10, 10], at: [50, 60], z: 10 },
      { id: "leg", file: "l.png", parent: "body", pivot: [5, 2], at: [20, 30], z: 5 },
      { id: "head", file: "h.png", parent: "body", pivot: [8, 20], at: [40, 0], z: 20 },
      { id: "eyes", swaps: { open: "e1.png", closed: "e2.png" }, parent: "head", pivot: [3, 3], at: [10, 8], z: 25 },
    ],
  };

  it("約束どおりの形を読み、使う絵を全部挙げる", () => {
    const r = parseRig(good)!;
    expect(r.parts).toHaveLength(4);
    expect(new Set(rigFiles(r))).toEqual(new Set(["b.png", "l.png", "h.png", "e1.png", "e2.png"]));
    // 関節の点（台紙）: body の左上 (40,50)、head の左上 = (40,50)+(40,0)-(8,20) = (72,30)、目の点 = (72,30)+(10,8)
    expect(restPivot(r, "eyes")).toEqual([82, 38]);
  });

  it("入れ子で組んだ描く順は、約束の z と食い違わない（この組では）", () => {
    const r = parseRig(good)!;
    expect(drawOrder(r)).toEqual(["leg", "body", "head", "eyes"]);
    expect(zConflicts(r)).toEqual([]);
  });

  it("入れ子では描けない z の並びは、食い違いとして挙げる（絵の担当に返すため）", () => {
    const bad = parseRig({
      ...good,
      parts: [
        ...good.parts,
        // 頭の子なのに、胴より奥（z 3）にしたい部品
        { id: "ear", file: "ear.png", parent: "head", pivot: [0, 0], at: [0, 0], z: 3 },
      ],
    })!;
    expect(zConflicts(bad)).toContainEqual(["body", "ear"]);
  });

  it.each([
    ["形が違う", { size: [1], parts: [] }],
    ["親が無い", { ...good, parts: [{ ...good.parts[1], parent: "nope" }] }],
    ["親子が輪", { size: [1, 1], parts: [
      { id: "a", file: "a.png", parent: "b", pivot: [0, 0], at: [0, 0], z: 0 },
      { id: "b", file: "b.png", parent: "a", pivot: [0, 0], at: [0, 0], z: 0 },
    ] }],
    ["絵が無い", { ...good, parts: [{ id: "x", parent: null, pivot: [0, 0], at: [0, 0], z: 0 }] }],
    ["id が重なる", { ...good, parts: [good.parts[0], good.parts[0]] }],
  ])("%s → 読まない（null）", (_, json) => {
    expect(parseRig(json)).toBeNull();
  });

  it("額縁の数（frame）は数だけ拾う", () => {
    const r = parseRig({ ...good, frame: { cornerArmX: 31.5, barCenterY: 68.5, bad: "x" } })!;
    expect(r.frame).toEqual({ cornerArmX: 31.5, barCenterY: 68.5 });
    expect(parseRig(good)!.frame).toEqual({});
  });
});

/* 振付けが名指しする部品・差し替え・小物が、絵の担当の rig.json に揃っているか。
   名前が食い違うと、その動きは黙って飛ばされる（壊れないが、主役が動かない） */
describe("ハロウィンの部品の名前（振付けとの約束）", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("fs") as typeof import("fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("path") as typeof import("path");
  const dir = path.join(__dirname, "../../../public/alert/themes/halloween/rig");
  const read = (name: string) => parseRig(JSON.parse(fs.readFileSync(path.join(dir, name, "rig.json"), "utf8")))!;
  const ids = (name: string) => new Set(read(name).parts.map((p) => p.id));
  const swaps = (name: string, id: string) => Object.keys(read(name).parts.find((p) => p.id === id)?.swaps ?? {});

  it.each(["kuro", "bucket", "bat", "props", "ghost", "pumpkin_kid", "broom"])("%s は読めて、絵が全部ある", (name) => {
    const r = read(name);
    expect(r).not.toBeNull();
    for (const f of rigFiles(r)) expect(fs.existsSync(path.join(dir, name, f))).toBe(true);
  });

  /* クロは耳と脚の z が入れ子と全体で食い違うが、耳と脚は重ならないので描いた絵は同じ
     （入れ子と全体の順で組んで、画素の差 0 を確かめた）。重なる組だけを見る */
  it.each(["bucket", "bat", "props"])("%s は入れ子で組んでも描く順が変わらない", (name) => {
    expect(zConflicts(read(name))).toEqual([]);
  });

  it("棺と金貨", () => {
    const p = read("props");
    for (const id of ["coffin", "coins", "coffin_front", "lid"]) expect(ids("props").has(id)).toBe(true);
    expect(p.items.coin).toBeTruthy();
  });

  it("こうもり・クロ・バケツ", () => {
    for (const id of ["body", "wing_l", "wing_r"]) expect(ids("bat").has(id)).toBe(true);
    for (const id of ["body", "head", "eye", "mouth", "hat", "tail_root", "leg_f_near", "leg_b_near"]) expect(ids("kuro").has(id)).toBe(true);
    expect(swaps("bucket", "bucket")).toEqual(expect.arrayContaining(["empty", "full", "over", "gray"]));
  });
});

describe("クロの動きの決め方（60秒ぶんを机の上で回す）", () => {
  /** 動きの長さの目安（ms）。本物は振付けが決めるが、並びを見るには足りる */
  const dur = (a: KuroAction, x: number) =>
    a.kind === "run" ? Math.abs(a.to - x) / 0.62 + 500
      : a.kind === "pause" ? a.ms
        : a.kind === "trick" ? 2000
          : a.kind === "chase" ? 3000
            : a.kind === "nap" ? 4500
              : a.ms;

  const simulate = (seed: number, ms: number, overflow = false) => {
    const r = rng(seed);
    const st = initialBrain(r, 300, 95, 905, overflow);
    const log: { t: number; a: KuroAction }[] = [];
    while (st.t < ms) {
      const a = nextAction(st, r);
      log.push({ t: st.t, a });
      st.t += dur(a, st.x);
      if (a.kind === "run") st.x = a.to;
    }
    return log;
  };

  it.each([1, 2, 3, 4, 5])("芸は 5〜9秒おきで、同じ芸を2回続けない（seed %d）", (seed) => {
    const all = simulate(seed, 60000);
    const log = all.filter((l) => l.a.kind === "trick");
    expect(log.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < log.length; i++) {
      const gap = log[i].t - log[i - 1].t;
      expect(gap).toBeGreaterThanOrEqual(TRICK_GAP[0]);
      /* 芸の長さ（2秒）と、走りの途中で時刻が来るぶん少しはみ出す。
         あいだにこうもり追い・昼寝が入ったときは、その長さだけ空く（わざと） */
      const between = all.some(
        (l) => l.t > log[i - 1].t && l.t < log[i].t && (l.a.kind === "chase" || l.a.kind === "nap")
      );
      if (!between) expect(gap).toBeLessThanOrEqual(TRICK_GAP[1] + 4000);
      const a = log[i].a as Extract<KuroAction, { kind: "trick" }>;
      const b = log[i - 1].a as Extract<KuroAction, { kind: "trick" }>;
      expect(a.trick).not.toBe(b.trick);
    }
  });

  it.each([1, 2, 3])("60秒で、4つの芸とこうもり追いが全部出る（seed %d）", (seed) => {
    const log = simulate(seed, 60000);
    const tricks = new Set(log.flatMap((l) => (l.a.kind === "trick" ? [l.a.trick] : [])));
    expect(tricks.size).toBeGreaterThanOrEqual(3);
    expect(log.some((l) => l.a.kind === "chase")).toBe(true);
  });

  it("走りが時間の半分前後を占め、止まりも入る（止まりがあるから刻みが見える）", () => {
    const log = simulate(7, 120000);
    let run = 0;
    let total = 0;
    let pauses = 0;
    for (let i = 0; i < log.length - 1; i++) {
      const d = log[i + 1].t - log[i].t;
      total += d;
      if (log[i].a.kind === "run") run += d;
      if (log[i].a.kind === "pause") pauses++;
    }
    expect(run / total).toBeGreaterThan(0.35);
    expect(pauses).toBeGreaterThan(5);
  });

  it("寝るのは 1〜2分に1回", () => {
    const naps = simulate(9, 180000).filter((l) => l.a.kind === "nap");
    expect(naps.length).toBeGreaterThanOrEqual(1);
    expect(naps.length).toBeLessThanOrEqual(3);
  });

  it("100% を超えていれば、あふれた山で踊るのが混ざる。超えていなければ踊らない", () => {
    expect(simulate(11, 60000, true).some((l) => l.a.kind === "dance")).toBe(true);
    expect(simulate(11, 60000, false).some((l) => l.a.kind === "dance")).toBe(false);
  });

  it("同じ乱数からは同じ並び・違う乱数からは違う並び（次に何をするか分からない）", () => {
    const sig = (seed: number) => simulate(seed, 30000).map((l) => l.a.kind).join(",");
    expect(sig(1)).toBe(sig(1));
    expect(sig(1)).not.toBe(sig(2));
  });

  it("走る先は端からはみ出さず、180 以上離れる", () => {
    const r = rng(3);
    const st = initialBrain(r, 100, 95, 905, false);
    for (let i = 0; i < 200; i++) {
      const to = pickRunTarget(st, r);
      expect(to).toBeGreaterThanOrEqual(95);
      expect(to).toBeLessThanOrEqual(905);
      expect(Math.abs(to - st.x)).toBeGreaterThanOrEqual(179);
      st.x = to;
    }
  });
});
