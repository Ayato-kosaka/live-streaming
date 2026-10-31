/**
 * 段5（死神のあやと）と段6（ゾンビのあやと）の台本と、振付けが名指しする絵の約束。
 *
 *   npx jest app/alertbox/__tests__/tier56.test.ts
 *
 * 守りたいのは4つ。
 *   1. 額 → 段 → 出し方。境目（1999/2000・4999/5000・9999/10000）で台本を取り違えない。
 *      ポーズ絵か仲間の部品が読めなければ台本に乗らず、その人の絵も遅らせない
 *   2. 台本の時刻の並び（前兆 → 登場 → 一撃 → 字 → ドン → その人の番 → 滞在 → 締め）と、
 *      止めた（ヒットストップ）ぶんの字の時刻のずらし
 *   3. 段が上がるほど、前兆が長く・その人の絵が出るまでが長い（段4 < 段5 < 段6 < 段7）
 *   4. 振付けが名指しするポーズ・小物・部品が、絵の担当の置いたものに揃っている
 *      （名前が食い違うと、その動きは黙って飛ばされる）
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { THEMES, themeRigs, tierFor } from "../themes";
import { stageFor, plateTiming } from "../season/show/stage";
import { cueOf, resolveScript, scriptProblems, type Cue } from "../season/show/script";
import { parsePoses } from "../season/show/poses";
import { parseRig } from "../season/rig/rig";

const halloween = THEMES.find((t) => t.id === "halloween")!;
/** アラートの長さ（`index.tsx` と同じ式） */
const durationFor = (yen: number) => 30 + (yen >= 10000 ? 30 : yen >= 1000 ? 15 : 0);
const allRigs = () => true;
const dir = join(__dirname, "../../../public/alert/themes/halloween");

describe("額 → 段 → 出し方（段5・段6）", () => {
  it.each([
    [1999, "wizard"],
    [2000, "reaper"],
    [4999, "reaper"],
    [5000, "zombie"],
    [9999, "zombie"],
    [10000, "dracula"],
  ])("%d円 → %s", (yen, kind) => {
    expect(stageFor(halloween, yen, durationFor(yen), allRigs)!.show?.kind).toBe(kind);
  });

  it("段5は、死神が上の帯へ退いてからその人の絵を出し、字は斬撃の跡から切り出す", () => {
    const st = stageFor(halloween, 3000, durationFor(3000), allRigs)!;
    expect(st.revealSec).toBeCloseTo(4.97, 5);
    const pt = plateTiming(st);
    expect(pt.wipe).toBe("write");
    expect(pt.carried).toBe(false);
    expect(pt.count).toBeNull();
    // 振り抜いた瞬間に 0.07 秒止めるので、字と「ドン」はそのぶん後ろ
    expect(pt.appearAt).toBeCloseTo(2.37, 5);
    expect(pt.donAt).toBeCloseTo(3.07, 5);
  });

  it("段6は、ゾンビが上の帯へ跳んでからその人の絵を出し、字は1字ずつ弾んで出る", () => {
    const st = stageFor(halloween, 7000, durationFor(7000), allRigs)!;
    expect(st.revealSec).toBeCloseTo(6.36, 5);
    const pt = plateTiming(st);
    expect(pt.wipe).toBeNull();
    expect(pt.carried).toBe(false);
    expect(pt.appearAt).toBeCloseTo(4.41, 5);
    expect(pt.donAt).toBeCloseTo(5.31, 5);
  });

  it.each([
    [3000, "reaper"],
    [3000, "bat"],
    [7000, "zombie"],
    [7000, "pumpkin_kid"],
    [7000, "ghost"],
    [7000, "bat"],
  ])("%d円: %s が読めなければ台本に乗らず、その人の絵も遅らせない", (yen, missing) => {
    const st = stageFor(halloween, yen, durationFor(yen), (n) => n !== missing)!;
    expect(st.show).toBeNull();
    expect(st.revealSec).toBe(0);
    expect(plateTiming(st).wipe).toBeNull();
  });

  it("テーマが読む切り絵に、段6の仲間（ちびおばけ）が入る", () => {
    expect(themeRigs(halloween)).toEqual(expect.arrayContaining(["pumpkin_kid", "ghost", "bat"]));
  });

  it("滞在の帯は段4と同じ高さ（主役は帯の中だけにいる）", () => {
    expect(tierFor(halloween, 3000).show!.headroom).toBe(0.2);
    expect(tierFor(halloween, 7000).show!.headroom).toBe(0.2);
  });
});

describe.each([
  [
    3000,
    ["darken", "wisps", "mist", "appear", "slash", "hitstop", "write", "don", "cast", "retreat", "reveal", "stay", "finale"],
    0.8,
  ],
  [
    7000,
    ["darken", "rumble", "lightning", "graves", "hand", "rise", "hitstop", "dance", "friends", "textIn", "don", "retreat", "reveal", "stay", "finale"],
    1.2,
  ],
] as const)("台本の時刻の並び（%d円）", (yen, order, omen) => {
  const show = tierFor(halloween, yen).show!;
  const D = durationFor(yen);
  const cues = resolveScript(show.script, D);
  const t = (k: Cue["do"]) => cueOf(cues, k)!.t;

  it("決まりを破っていない（アラートの中に収まる・その人の絵は revealSec）", () => {
    expect(scriptProblems(show.script, D, show.revealSec)).toEqual([]);
  });

  /** 並びが守られているか（守られていなければ、最初に崩れた2つ） */
  const broken = (cs: ReturnType<typeof resolveScript>) => {
    const times = order.map((k) => cueOf(cs, k as Cue["do"])!.t);
    for (let i = 1; i < times.length; i++) if (times[i] < times[i - 1]) return `${order[i - 1]} → ${order[i]}`;
    return null;
  };

  it("前兆 → 登場 → 一撃 → 字 → ドン → その人の番 → 滞在 → 締め の順", () => {
    for (let i = 1; i < cues.length; i++) expect(cues[i].t).toBeGreaterThanOrEqual(cues[i - 1].t);
    expect(broken(cues)).toBeNull();
  });

  it("対照: 字が一撃より先に出る台本は、並びが崩れたとして挙がる", () => {
    const bad = show.script.map((c) => (c.do === "write" || c.do === "textIn" ? { ...c, at: 1.0 } : c));
    expect(broken(resolveScript(bad, D))).not.toBeNull();
  });

  it(`前兆（${omen}秒）のあいだは、主役も墓も字も出ていない`, () => {
    const first = Math.min(...cues.filter((c) => !["darken", "wisps", "rumble", "lightning", "mist"].includes(c.do)).map((c) => c.t));
    expect(t("darken")).toBe(0);
    expect(first).toBeGreaterThanOrEqual(omen);
  });

  it("その人の絵は、主役が退き始めてから出る（主役が帯に着く前後）", () => {
    expect(t("reveal")).toBeGreaterThan(t("retreat"));
    const r = cueOf(cues, "retreat")!;
    expect(t("reveal")).toBeLessThanOrEqual(r.t + (r.dur ?? 0) + 0.1);
  });

  it("締めは終わりから数えて、終わりまでに終わる", () => {
    const f = cueOf(cues, "finale")!;
    expect(f.t + (f.dur ?? 0)).toBeLessThanOrEqual(D);
    expect(f.t).toBeGreaterThan(t("stay"));
    const f45 = cueOf(resolveScript(show.script, 45), "finale")!;
    expect(f45.t).toBeCloseTo(42, 5);
  });

  it("止めたぶんは、止めた後の出来事だけをずらす（締めは終わりに付いていく）", () => {
    const raw = resolveScript(show.script, D, false);
    const stop = cueOf(raw, "hitstop")!;
    // 同じ出来事が何度も出る（稲光）ので、台本に書いた時刻で対にする
    const twin = (c: Cue) => cues.find((x) => x.do === c.do && x.at === c.at)!;
    for (const c of raw.filter((x) => x.at >= 0 && x.t > stop.t)) expect(twin(c).t).toBeCloseTo(c.t + (stop.dur ?? 0), 9);
    for (const c of raw.filter((x) => x.at >= 0 && x.t < stop.t)) expect(twin(c).t).toBeCloseTo(c.t, 9);
    expect(twin(cueOf(raw, "finale")!).t).toBeCloseTo(D - 3, 9);
  });
});

describe("段が上がるほどリッチ（長さ）", () => {
  const reveal = (yen: number) => stageFor(halloween, yen, durationFor(yen), allRigs)!.revealSec;
  it("その人の絵が出るまで: 段4 < 段5 < 段6 < 段7", () => {
    const r = [1500, 3000, 7000, 20000].map(reveal);
    for (let i = 1; i < r.length; i++) expect(r[i]).toBeGreaterThan(r[i - 1]);
  });

  it("字が出るまで: 段4 < 段6、段5 は段4 より後", () => {
    const at = (yen: number) => plateTiming(stageFor(halloween, yen, durationFor(yen), allRigs)!).appearAt;
    expect(at(3000)).toBeLessThan(at(7000));
    expect(at(1500)).toBeLessThan(at(7000));
  });
});

describe("段5・段6の絵の約束（振付けが名指しするもの）", () => {
  const poses = (name: string) => parsePoses(JSON.parse(readFileSync(join(dir, "poses", name, "poses.json"), "utf8")))!;
  const items = (name: string) => JSON.parse(readFileSync(join(dir, "items", name, "items.json"), "utf8")).items as Record<string, { file: string }>;
  const rig = (name: string) => parseRig(JSON.parse(readFileSync(join(dir, "rig", name, "rig.json"), "utf8")))!;

  it.each([
    ["reaper", ["appear", "idle", "swing"]],
    ["zombie", ["dance", "idle", "rise"]],
  ])("%s のポーズがそろい、絵が全部ある", (name, want) => {
    const p = poses(name);
    expect(Object.keys(p.poses).sort()).toEqual(want);
    for (const d of Object.values(p.poses)) expect(existsSync(join(dir, "poses", name, d.file))).toBe(true);
  });

  it.each([
    ["reaper", ["wisp"]],
    ["zombie", ["tombstone_a", "tombstone_b", "tombstone_c", "hand_from_soil", "dirt_l", "dirt_m", "dirt_s"]],
  ])("%s の小物がそろい、絵が全部ある（振付けは <名前>.png を読む）", (name, want) => {
    const it = items(name);
    for (const k of want) {
      expect(it[k]?.file).toBe(`${k}.png`);
      expect(existsSync(join(dir, "items", name, it[k].file))).toBe(true);
    }
  });

  it("仲間の部品: ちびおばけの顔（ばあ・にっこり・びっくり）と両手、坊やの帽子と腕", () => {
    const g = rig("ghost");
    const face = g.parts.find((p) => p.id === "face");
    expect(Object.keys(face?.swaps ?? {})).toEqual(expect.arrayContaining(["boo", "smile", "surprised"]));
    for (const id of ["body", "hand_l", "hand_r"]) expect(g.parts.some((p) => p.id === id)).toBe(true);
    const k = rig("pumpkin_kid");
    for (const id of ["body", "head", "arm_l", "arm_r"]) expect(k.parts.some((p) => p.id === id)).toBe(true);
    for (const h of ["hat_pointy", "hat_ribbon"]) expect(k.items[h]).toBeTruthy();
    expect(k.partAnchors.hatOn).toBeTruthy();
    const head = k.parts.find((p) => p.id === "head");
    expect(Object.keys(head?.swaps ?? {})).toEqual(expect.arrayContaining(["smile", "open", "wink"]));
  });
});
