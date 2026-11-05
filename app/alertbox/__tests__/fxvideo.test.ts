/**
 * @jest-environment jsdom
 */

/**
 * 11月の投げ銭の演出（透明つきの動画で流す7段。#1095）の再生の土台。
 *
 *   npx jest app/alertbox/__tests__/fxvideo.test.ts
 *
 * 守りたいのは6つ。
 *   1. **配信はいまのまま。** 旗（`?fx=full` / `?fx=light`）が無ければ、11月の城の段は今の1段（札も台本も無い）。
 *      配信に出すと決めるまで（`live: false`・`variant: null`）7段は出ない
 *   2. 7段の切れ目・色・字は、ハロウィン2版目の同じ段と同じ（写しが崩れていない）
 *   3. manifest.json の読み方（約束の名前・置き場の外を指さない・秒の決まり）と、置いてあるひな形が読める
 *   4. 温める順と量: その日に流す通りだけ・全段の登場 → 全段の滞在（それぞれ段の低い順。締めは温めない）・
 *      同じ URL は二度落とさない・上限で止まる
 *   5. キャラ絵と字は `revealAt` に出る（字の出し方はハロウィン2版目の同じ段）。動画が用意できなければ動画なしで、すぐ出る
 *   6. 流す順番: `playing` まで透明・登場 → 滞在 → 締め（滞在の輪の切れ目から・終わりまでに収まる）・
 *      3 秒動かない層は消す・全部消えたら落ちる・止められたら消す（`AbortError` は消さない）・止めたら手放す
 *
 * **対照を先に置く**（`island-misses.md` #99）。「旗が無いと7段にならない」を見てから「旗があると7段になる」を見る。
 */
import { readFileSync } from "fs";
import { join } from "path";
import { THEMES, themeAt, tierFor, type FxTier, type SeasonTheme } from "../themes";
import { stageFor, plateTiming, withoutVideo, PLAIN_HEADROOM, PLAIN_CHAR_BOTTOM } from "../season/show/stage";
import { scriptProblems } from "../season/show/script";
import {
  FX_START_TIMEOUT_MS,
  FX_WARM_BUDGET,
  fxVariantOf,
  fxWarmOrder,
  fxWarmed,
  layersFor,
  parseFxManifest,
  runFxShow,
  warmFxVideos,
  withFxVideo,
  type FxKit,
  type FxLayerKit,
  type FxTierEntry,
  type VideoPlan,
} from "../season/show/fxVideo";

const halloween = THEMES.find((t) => t.id === "halloween")!;
const castle = THEMES.find((t) => t.id === "castle")!;
const durationFor = (yen: number) => 30 + (yen >= 10000 ? 30 : yen >= 1000 ? 15 : 0);
const allRigs = () => true;
const AMOUNTS = [0, 199, 200, 499, 500, 999, 1000, 1999, 2000, 4999, 5000, 9999, 10000, 50000];
const MANIFEST = JSON.parse(
  readFileSync(join(__dirname, "../../../public/alert/themes/castle/fx/manifest.json"), "utf8")
);

describe("1. 配信はいまのまま（旗が無ければ 7段は出ない）", () => {
  it("11月に日付で選ばれるのは城。段は今の1段（札・台本・動画なし）", () => {
    const th = themeAt(new Date("2026-11-15T12:00:00+09:00"))!;
    expect(th.id).toBe("castle");
    expect(th.tiers).toHaveLength(1);
    expect(th.fxVideo?.live).toBe(false);
    expect(th.fxVideo?.variant).toBeNull();
    // 旗が無い（本番の URL）ときは、差し替えずにそのまま
    const eff = withFxVideo(th, fxVariantOf(th, null));
    expect(eff).toBe(th);
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
  });

  it.each([
    [null, null],
    ["lux", null],
    ["off", null],
    ["FULL", null],
    ["full", "full"],
    ["light", "light"],
  ])("旗 %s → 通り %s", (flag, want) => {
    expect(fxVariantOf(castle, flag)).toBe(want);
  });

  it("ハロウィン・季節の外には動画の段が無い（旗があっても差し替えない）", () => {
    expect(fxVariantOf(halloween, "full")).toBeNull();
    expect(fxVariantOf(null, "full")).toBeNull();
    expect(withFxVideo(halloween, "full")).toBe(halloween);
    expect(withFxVideo(null, "full")).toBeNull();
  });

  it("配信に出すと決めたら（live・variant）、旗が無くてもその通り。`fx=off` なら止まる", () => {
    const live: SeasonTheme = { ...castle, id: "castle-live", fxVideo: { ...castle.fxVideo!, live: true, variant: "light" } };
    expect(fxVariantOf(live, null)).toBe("light");
    expect(fxVariantOf(live, "full")).toBe("full");
    expect(fxVariantOf(live, "off")).toBeNull();
    // 出すと決めても通りが無ければ出さない
    expect(fxVariantOf({ ...live, fxVideo: { ...live.fxVideo!, variant: null } }, null)).toBeNull();
  });

  it("差し替えるのは段だけ（貯金箱の絵・字・大きさは同じテーマのもの）。同じテーマは同じ物を返す", () => {
    const a = withFxVideo(castle, "full")!;
    expect(a).not.toBe(castle);
    expect(a.tiers).toBe(castle.fxVideo!.tiers);
    expect(a.fxVariant).toBe("full");
    expect(withFxVideo(castle, "full")).toBe(a);
    expect(withFxVideo(castle, "light")!.fxVariant).toBe("light");
    const { tiers: _a, fxVariant: _b, ...restA } = a;
    const { tiers: _c, ...restC } = castle;
    expect(restA).toEqual(restC);
    expect(a.castleBank).toBe(castle.castleBank);
    expect(a.text).toBe(castle.text);
  });
});

describe("2. 7段はハロウィン2版目の同じ段と同じ切れ目・色・字", () => {
  const nov = castle.fxVideo!.tiers;
  it("切れ目はスパチャの7色", () => {
    expect(nov.map((t) => t.min)).toEqual([0, 200, 500, 1000, 2000, 5000, 10000]);
    expect(nov.map((t) => t.min)).toEqual(halloween.tiers.map((t) => t.min));
  });
  it("色・札（字の色・縁・光）はハロウィン2版目の写し", () => {
    nov.forEach((t, i) => {
      expect(t.accent).toBe(halloween.tiers[i].accent);
      expect(t.plate).toEqual(halloween.tiers[i].plate);
    });
  });
  it("キャラ絵の箱の上の空きもハロウィン2版目の同じ段と同じ", () => {
    nov.forEach((t, i) => expect(t.video!.headroom).toBe(halloween.tiers[i].show!.headroom));
  });
  it("段の名前は manifest の 1〜7。字は 段1〜3 弾む・段4〜6 ドン・段7 数え上げ", () => {
    expect(nov.map((t) => t.video!.tier)).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
    expect(nov.map((t) => t.video!.text)).toEqual(["pop", "pop", "pop", "don", "don", "don", "count"]);
  });
  it("小物も台本も持たない（動画がそろわない日は字とキャラ絵だけ）", () => {
    for (const t of nov) {
      expect(t.show).toBeUndefined();
      expect(t.slots).toBe(0);
      expect(t.files).toEqual([]);
    }
  });
});

describe("3. manifest.json", () => {
  const m = parseFxManifest(MANIFEST);
  /* 光の線（light）の版は 2026-11-05 にやめた（あやと「光の線の案は見ごたえない」「2,000以上は全面背景あり」。#1095）。
     段1〜6 は full だけ。段7 は別の担当が直すので、light があってもなくても通す（どの段にも full はある） */
  it("置いてあるひな形が7段とも読める。段1〜6 は full だけ、どの段にも full がある", () => {
    expect(Object.keys(m).sort()).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
    for (const k of ["1", "2", "3", "4", "5", "6"]) expect(Object.keys(m[k].variants)).toEqual(["full"]);
    for (const k of Object.keys(m)) expect(m[k].variants.full).toBeDefined();
  });
  it("名前は約束どおり t{段}-{通り}-{層}-{本}.webm", () => {
    for (const [k, e] of Object.entries(m))
      for (const [v, layers] of Object.entries(e.variants))
        for (const [l, parts] of Object.entries(layers!))
          for (const [p, f] of Object.entries(parts ?? {})) expect(f).toBe(`t${k}-${v}-${l}-${p}.webm`);
  });
  it("light の無い段（段1〜6）で light を頼まれたら full を使う（旗 ?fx=light の日も full で出る）", () => {
    for (const k of ["1", "2", "3", "4", "5", "6"]) {
      expect(layersFor(m[k], "light")).toBe(m[k].variants.full);
      expect(layersFor(m[k], "light")).not.toBeNull();
    }
  });
  it("対照: light がある段なら light を使う（置いてある manifest に頼らず、作った1段で）", () => {
    const parts = (v: string) => ({ intro: `t1-${v}-back-intro.webm`, stay: `t1-${v}-back-stay.webm`, outro: `t1-${v}-back-outro.webm` });
    const both = parseFxManifest({
      tiers: { "1": { variants: { full: { back: parts("full"), front: null }, light: { back: parts("light"), front: null } }, revealAt: 1, introDur: 2, stayDur: 2, outroDur: 1 } },
    })["1"];
    expect(layersFor(both, "light")).toBe(both.variants.light);
    expect(layersFor(both, "light")).not.toBe(both.variants.full);
    expect(layersFor(both, "full")).toBe(both.variants.full);
  });

  const one =(o: Record<string, unknown>) => parseFxManifest({ tiers: { "1": { variants: { full: { back: { intro: "a.webm", stay: "b.webm", outro: "c.webm" }, front: null } }, revealAt: 1, introDur: 2, stayDur: 2, outroDur: 1, ...o } } });
  it("対照: 正しい1段は読める（front は null でよい）", () => {
    expect(one({})["1"]?.variants.full?.front).toBeNull();
  });
  it.each([
    ["置き場の外を指す名前", { variants: { full: { back: { intro: "../x.webm", stay: "b.webm", outro: "c.webm" } } } }],
    ["webm でない", { variants: { full: { back: { intro: "a.mp4", stay: "b.webm", outro: "c.webm" } } } }],
    ["本が足りない", { variants: { full: { back: { intro: "a.webm", stay: "b.webm" } } } }],
    ["層が1つも無い", { variants: { full: { back: null, front: null } } }],
    ["書いてある front が読めない", { variants: { full: { back: { intro: "a.webm", stay: "b.webm", outro: "c.webm" }, front: { intro: "x" } } } }],
    ["revealAt が登場の外", { revealAt: 2.5 }],
    ["revealAt が負", { revealAt: -0.1 }],
    ["秒が数でない", { stayDur: "3" }],
    ["秒が 0", { outroDur: 0 }],
  ])("読まない: %s", (_why, o) => {
    expect(one(o as Record<string, unknown>)["1"]).toBeUndefined();
  });
  it("キャラ絵の箱の下の端（charBottom）: 書いてあれば読む・書いていなければ null（いつもの並べ方）", () => {
    expect(one({})["1"]?.charBottom).toBeNull();
    expect(one({ charBottom: 0.72 })["1"]?.charBottom).toBe(0.72);
    expect(one({ charBottom: 1 })["1"]?.charBottom).toBe(1);
  });
  it.each([
    ["下の半分より上", 0.3],
    ["面の外", 1.2],
    ["数でない", "0.72"],
    ["NaN", NaN],
  ])("charBottom を受けない（段は読む・並べ方はいつもの）: %s", (_why, v) => {
    const e = one({ charBottom: v })["1"];
    expect(e).toBeDefined();
    expect(e!.charBottom).toBeNull();
  });
  it("形の違うものは空", () => {
    expect(parseFxManifest(null)).toEqual({});
    expect(parseFxManifest({ tiers: [] })).toEqual({});
    expect(parseFxManifest("x")).toEqual({});
  });
});

describe("4. 温める順と量", () => {
  const m = parseFxManifest(MANIFEST);
  const tiers = castle.fxVideo!.tiers;
  /* 置いてある manifest の、その通りの登場と滞在の本数（front の有無は作る担当が決めるので、数は manifest から） */
  const countOf = (variant: "full" | "light") =>
    Object.values(m).reduce((n, e) => {
      const l = layersFor(e, variant)!;
      return n + 2 * ((l.back ? 1 : 0) + (l.front ? 1 : 0));
    }, 0);
  const tierOf = (f: string) => Number(f[1]);
  const partOf = (f: string) => f.match(/-(intro|stay|outro)\.webm$/)![1];
  it.each(["full", "light"] as const)("%s: その日に流す通りだけ・全段の登場 → 全段の滞在（それぞれ段の低い順・奥→手前）。締めは温めない", (variant) => {
    const order = fxWarmOrder(tiers, m, variant);
    expect(order[0]).toBe("t1-full-back-intro.webm");
    expect(order.filter((f) => /outro/.test(f))).toEqual([]);
    expect(order).toHaveLength(countOf(variant));
    expect(new Set(order).size).toBe(order.length);
    // 段ごとに、その通りがあればその通りだけ、無ければ full だけ（もう片方は1本も落とさない）。
    // 段1〜6 は full しか無いので、light の日も full を落とす（light が無くても full で出る）
    const used = (k: string) => (m[k].variants[variant] ? variant : "full");
    for (const k of Object.keys(m)) {
      const unused = used(k) === "full" ? "light" : "full";
      expect(order.filter((f) => f.startsWith(`t${k}-${unused}-`))).toEqual([]);
      expect(order).toContain(`t${k}-${used(k)}-back-intro.webm`);
    }
    for (const k of ["1", "2", "3", "4", "5", "6"]) expect(used(k)).toBe("full");
    // 登場がぜんぶ先（段7 の登場が、段1 の滞在より前）
    const parts = order.map(partOf);
    expect(parts).toEqual([...parts].sort((a, b) => (a === b ? 0 : a === "intro" ? -1 : 1)));
    expect(order.indexOf(`t7-${used("7")}-back-intro.webm`)).toBeLessThan(order.indexOf("t1-full-back-stay.webm"));
    // 登場どうし・滞在どうしは段の低い順
    for (const p of ["intro", "stay"]) {
      const ts = order.filter((f) => partOf(f) === p).map(tierOf);
      expect(ts).toEqual([...ts].sort((a, b) => a - b));
    }
    // 1段の中は奥 → 手前
    for (const f of order.filter((x) => /-front-/.test(x)))
      expect(order.indexOf(f.replace("-front-", "-back-"))).toBeLessThan(order.indexOf(f));
  });

  it("同じ URL は二度落とさない。上限を超えたら止める。しくじったものは次に試す", async () => {
    const calls: string[] = [];
    let failOnce = new Set(["/d/c.webm"]);
    (global as { fetch?: unknown }).fetch = jest.fn(async (url: string) => {
      calls.push(url);
      if (failOnce.has(url)) {
        failOnce.delete(url);
        throw new Error("電波");
      }
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(4 * 1024 * 1024) };
    });
    const before = fxWarmed().size;
    // 4MB ずつ。上限 12MB なので3本で止まる（c はしくじるので数えない）
    let bytes = await warmFxVideos("/d", ["a.webm", "b.webm", "c.webm", "d.webm", "e.webm"], () => true);
    expect(bytes).toBe(12 * 1024 * 1024);
    expect(calls).toEqual(["/d/a.webm", "/d/b.webm", "/d/c.webm", "/d/d.webm"]);
    expect(fxWarmed().size - before).toBe(3);
    // もう一度: a・b・d は落とさない。c（しくじった）は試す
    calls.length = 0;
    bytes = await warmFxVideos("/d", ["a.webm", "b.webm", "c.webm", "d.webm"], () => true);
    expect(calls).toEqual(["/d/c.webm"]);
    // 止めたら落とさない
    calls.length = 0;
    await warmFxVideos("/d", ["z.webm"], () => false);
    expect(calls).toEqual([]);
    expect(FX_WARM_BUDGET).toBe(12 * 1024 * 1024);
  });
});

describe("5. キャラ絵と字は revealAt に出る", () => {
  const nov = withFxVideo(castle, "full")!;
  const m = parseFxManifest(MANIFEST);
  const planOf = (t: FxTier): VideoPlan => {
    const e = m[t.video!.tier];
    return { key: `${t.video!.tier}-full`, revealAt: e.revealAt, headroom: t.video!.headroom, charBottom: e.charBottom, text: t.video!.text, kit: { key: "", layers: { back: null, front: null }, entry: e, used: false } };
  };

  it.each([
    [100, "1"],
    [300, "2"],
    [700, "3"],
    [1500, "4"],
    [3000, "5"],
    [7000, "6"],
    [10000, "7"],
  ])("%d円 → 段%s。キャラ絵と字が同じ秒（revealAt）・札はその段の札", (yen, tier) => {
    const st = stageFor(nov, yen, durationFor(yen), allRigs, planOf)!;
    const e = m[tier];
    expect(st.video?.key).toBe(`${tier}-full`);
    expect(st.revealSec).toBe(e.revealAt);
    expect(plateTiming(st).appearAt).toBe(e.revealAt);
    expect(st.plate).toEqual(tierFor(halloween, yen).plate);
    expect(st.headroom).toBe(tierFor(halloween, yen).show!.headroom);
    // 時刻表の決まり（札より先にキャラ絵が出ない・数え終わりとドンが同じ）
    expect(scriptProblems(st.cues!.map(({ t: _t, ...c }) => c), durationFor(yen), st.revealSec)).toEqual([]);
  });

  it("キャラ絵の箱の下の端は manifest の段の charBottom。書いていない段は今のまま（0.98）", () => {
    // 置いてある manifest のまま: 書いてある段だけがその値
    for (const yen of [100, 300, 700, 1500, 3000, 7000, 10000]) {
      const st = stageFor(nov, yen, durationFor(yen), allRigs, planOf)!;
      expect(st.charBottom).toBe(m[st.tier.video!.tier].charBottom ?? PLAIN_CHAR_BOTTOM);
    }
    // 〜999円の3段に 0.72 を書いた manifest（管理側の決め。描く担当が書く）: 段1〜3 だけ上がり、段4〜7 は 0.98 のまま
    const raised = JSON.parse(JSON.stringify(MANIFEST));
    for (const k of ["1", "2", "3"]) raised.tiers[k].charBottom = 0.72;
    const m2 = parseFxManifest(raised);
    const planOf2 = (t: FxTier): VideoPlan => ({ ...planOf(t), charBottom: m2[t.video!.tier].charBottom });
    for (const yen of [100, 300, 700]) expect(stageFor(nov, yen, durationFor(yen), allRigs, planOf2)!.charBottom).toBe(0.72);
    for (const yen of [1500, 3000, 7000, 10000]) expect(stageFor(nov, yen, durationFor(yen), allRigs, planOf2)!.charBottom).toBe(PLAIN_CHAR_BOTTOM);
    // 途中で動画が動かなくなったら: キャラ絵がまだならいつもの並べ方へ・もう出ていればそのまま（跳ねない）
    const st = stageFor(nov, 300, 30, allRigs, planOf2)!;
    expect(withoutVideo(st, 0.1).charBottom).toBe(PLAIN_CHAR_BOTTOM);
    expect(withoutVideo(st, st.revealSec + 1).charBottom).toBe(0.72);
  });

  it("字の出し方はハロウィン2版目の同じ段: 段1〜3 弾むだけ・段4〜6 0.9 秒あとにドン・段7 札ごと降りて数え上げてドン", () => {
    const pt = (yen: number) => plateTiming(stageFor(nov, yen, durationFor(yen), allRigs, planOf)!);
    for (const yen of [100, 300, 700]) expect(pt(yen)).toMatchObject({ carried: false, wipe: null, count: null, donAt: null });
    for (const yen of [1500, 3000, 7000]) {
      const p = pt(yen);
      expect(p.count).toBeNull();
      expect(p.donAt! - p.appearAt).toBeCloseTo(0.9, 5);
    }
    const p7 = pt(10000);
    /* 段7 は札ごと降りる（数え上げの額は1字ずつ弾む字に入っていないので、弾むだけだと字が出る前から「0」が見える） */
    expect(p7.carried).toBe(true);
    expect(p7.count).toEqual({ at: p7.appearAt + 0.5, dur: 1 });
    expect(p7.donAt).toBeCloseTo(p7.appearAt + 1.5, 5);
    // ハロウィン2版目の段7 と同じ間（札 → 0.5 秒で数え始め → 1 秒で数え終わり＝ドン）
    const h7 = plateTiming(stageFor(halloween, 10000, 60, allRigs)!);
    expect(h7.carried).toBe(true);
    expect(h7.count!.at - h7.appearAt).toBeCloseTo(p7.count!.at - p7.appearAt, 5);
    expect(h7.donAt! - h7.count!.at).toBeCloseTo(p7.donAt! - p7.count!.at, 5);
  });

  it("動画が用意できていなければ: 動画なし・その段の札・キャラ絵と字はすぐ（遅らせない）", () => {
    for (const yen of [100, 1500, 10000]) {
      const st = stageFor(nov, yen, durationFor(yen), allRigs, () => null)!;
      expect(st.video).toBeNull();
      expect(st.revealSec).toBe(0);
      expect(st.cues).toBeNull();
      expect(st.plate).toEqual(tierFor(halloween, yen).plate);
      expect(st.headroom).toBe(PLAIN_HEADROOM);
      expect(st.charBottom).toBe(PLAIN_CHAR_BOTTOM);
    }
  });

  it("ハロウィンは今のまま（台本の段は台本の空き・動画は聞かない）", () => {
    const st = stageFor(halloween, 1500, 45, allRigs, () => {
      throw new Error("聞きに来てはいけない");
    })!;
    expect(st.show?.kind).toBe("wizard");
    expect(st.video).toBeNull();
    expect(st.headroom).toBe(0.2);
  });

  it("途中で動画が動かなくなったら: キャラ絵がまだならすぐ出す・もう出ていれば並べ方はそのまま", () => {
    const st = stageFor(nov, 10000, 60, allRigs, planOf)!;
    const early = withoutVideo(st, 3);
    expect(early.video).toBeNull();
    expect(early.revealSec).toBe(0);
    expect(early.cues).toBeNull();
    expect(early.headroom).toBe(PLAIN_HEADROOM);
    expect(early.charBottom).toBe(PLAIN_CHAR_BOTTOM);
    const late = withoutVideo(st, st.revealSec + 1);
    expect(late.video).toBeNull();
    expect(late.revealSec).toBe(st.revealSec);
    expect(late.headroom).toBe(st.headroom);
    expect(late.cues).toBe(st.cues);
    // 動画の無い段取りはそのまま
    const plain = stageFor(castle, 100, 30, allRigs)!;
    expect(withoutVideo(plain, 1)).toBe(plain);
  });
});

/* ---------------------------------------------------------------- 流す順番 */

/** jsdom の <video> に、再生の出来事を手で起こせる仕掛けを付ける */
type FakeVideo = HTMLVideoElement & { plays: number; reject?: string };
function fakeVideo(duration: number): FakeVideo {
  const v = document.createElement("video") as FakeVideo;
  v.plays = 0;
  let paused = true;
  Object.defineProperty(v, "duration", { configurable: true, get: () => (v.getAttribute("src") ? duration : NaN) });
  Object.defineProperty(v, "paused", { configurable: true, get: () => paused });
  v.play = jest.fn(() => {
    v.plays++;
    paused = false;
    if (v.reject) {
      const e = Object.assign(new Error(v.reject), { name: v.reject });
      return Promise.reject(e);
    }
    return Promise.resolve();
  }) as never;
  v.pause = jest.fn(() => {
    paused = true;
  });
  v.load = jest.fn();
  return v;
}
const fire = (v: HTMLVideoElement, ev: string) => v.dispatchEvent(new Event(ev));
const flush = () => Promise.resolve().then(() => Promise.resolve());

const ENTRY: FxTierEntry = { variants: {}, revealAt: 2, introDur: 3.2, stayDur: 3, outroDur: 1.2, charBottom: null };
type FakeLayer = Record<keyof FxLayerKit, FakeVideo>;
function makeKit(front = true): { kit: FxKit; back: FakeLayer; front: FakeLayer | null } {
  const layer = (): FakeLayer => {
    const outro = fakeVideo(1.2);
    outro.dataset.src = "/fx/outro.webm";
    const L = { intro: fakeVideo(3.2), stay: fakeVideo(3), outro };
    L.intro.setAttribute("src", "/fx/intro.webm");
    L.stay.setAttribute("src", "/fx/stay.webm");
    L.stay.loop = true;
    return L;
  };
  const b = layer();
  const f = front ? layer() : null;
  return { kit: { key: "5-full", layers: { back: b, front: f }, entry: ENTRY, used: false }, back: b, front: f };
}
const hosts = () => ({ back: document.createElement("div"), front: document.createElement("div") });
const op = (v: HTMLVideoElement) => v.style.opacity;

describe("6. 流す順番", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("置いた瞬間は全部透明。登場は両方の層で同時に流し始め、`playing` が来た層だけ見せる", () => {
    const { kit, back, front } = makeKit();
    const h = hosts();
    runFxShow(kit, h, 45, jest.fn());
    expect(kit.used).toBe(true);
    expect(h.back.querySelectorAll("video")).toHaveLength(3);
    expect(h.front.querySelectorAll("video")).toHaveLength(3);
    for (const v of [...Object.values(back), ...Object.values(front!)]) expect(op(v)).toBe("0");
    expect(back.intro.plays).toBe(1);
    expect(front!.intro.plays).toBe(1);
    fire(back.intro, "playing");
    expect(op(back.intro)).toBe("1");
    expect(op(front!.intro)).toBe("0");
  });

  it("登場が終わったら滞在。滞在の `playing` までは登場の最後のコマのまま（すき間を作らない）。締めは滞在に入ってから読み始める", () => {
    const { kit, back } = makeKit(false);
    runFxShow(kit, hosts(), 45, jest.fn());
    fire(back.intro, "playing");
    expect(back.outro.getAttribute("src")).toBeNull();
    fire(back.intro, "ended");
    expect(back.stay.plays).toBe(1);
    expect(op(back.intro)).toBe("1");
    expect(op(back.stay)).toBe("0");
    fire(back.stay, "playing");
    expect(op(back.stay)).toBe("1");
    expect(op(back.intro)).toBe("0");
    expect(back.outro.getAttribute("src")).toBe("/fx/outro.webm");
    // 止めて再開したときの `playing` では何も変わらない
    fire(back.intro, "playing");
    expect(op(back.stay)).toBe("1");
  });

  it("締めは、終わりまでに収まる最後の滞在の輪の切れ目から（くり返しを止め、`ended` で締めへ）", () => {
    const { kit, back } = makeKit(false);
    const dur = 45;
    runFxShow(kit, hosts(), dur, jest.fn());
    fire(back.intro, "playing");
    fire(back.intro, "ended");
    fire(back.stay, "playing");
    // 締めの頭の締め切りは 45 - 1.2 = 43.8 秒。その 3 + 0.15 秒前までは、くり返したまま
    jest.advanceTimersByTime((dur - 1.2 - 3 - 0.15) * 1000 - 50);
    expect(back.stay.loop).toBe(true);
    jest.advanceTimersByTime(100);
    expect(back.stay.loop).toBe(false);
    expect(back.outro.plays).toBe(0);
    fire(back.stay, "ended");
    expect(back.outro.plays).toBe(1);
    expect(op(back.stay)).toBe("1");
    fire(back.outro, "playing");
    expect(op(back.outro)).toBe("1");
    expect(op(back.stay)).toBe("0");
    expect(back.stay.pause).toHaveBeenCalled();
  });

  it("奥と手前は、奥（先導）の切れ目で揃って移る（手前が先に終われば待つ・締めは奥の輪の切れ目で両方）", () => {
    const { kit, back, front } = makeKit();
    runFxShow(kit, hosts(), 45, jest.fn());
    fire(back.intro, "playing");
    fire(front!.intro, "playing");
    // 手前が先に終わった: 最後のコマのまま待つ
    fire(front!.intro, "ended");
    expect(front!.stay.plays).toBe(0);
    expect(op(front!.intro)).toBe("1");
    // 奥が終わった: 両方いっしょに滞在へ
    fire(back.intro, "ended");
    expect(back.stay.plays).toBe(1);
    expect(front!.stay.plays).toBe(1);
    fire(back.stay, "playing");
    fire(front!.stay, "playing");
    jest.advanceTimersByTime((45 - 1.2 - 3 - 0.15) * 1000 + 50);
    // くり返しを止めるのは奥だけ。手前は奥の切れ目で切る
    expect(back.stay.loop).toBe(false);
    expect(front!.stay.loop).toBe(true);
    fire(back.stay, "ended");
    expect(back.outro.plays).toBe(1);
    expect(front!.outro.plays).toBe(1);
  });

  it("奥が消えたら、手前が先導を継ぐ（待っていた登場の終わりから滞在へ）", () => {
    const { kit, back, front } = makeKit();
    const onFail = jest.fn();
    runFxShow(kit, hosts(), 45, onFail);
    fire(front!.intro, "playing");
    fire(front!.intro, "ended");
    expect(front!.stay.plays).toBe(0);
    fire(back.intro, "error");
    expect(onFail).not.toHaveBeenCalled();
    expect(front!.stay.plays).toBe(1);
  });

  it("切れ目が来なければ（止まった）、締め切り（終わりの outroDur 秒前）＋0.3 秒で締めへ切り替える", () => {
    const { kit, back } = makeKit(false);
    runFxShow(kit, hosts(), 45, jest.fn());
    fire(back.intro, "playing");
    fire(back.intro, "ended");
    fire(back.stay, "playing");
    jest.advanceTimersByTime((45 - 1.2 + 0.3) * 1000 - 20);
    expect(back.outro.plays).toBe(0);
    jest.advanceTimersByTime(40);
    expect(back.outro.plays).toBe(1);
  });

  it("3 秒動かない層は消す。全部の層が消えたら落ちる（その秒を渡す）", () => {
    const { kit, back, front } = makeKit();
    const onFail = jest.fn();
    runFxShow(kit, hosts(), 30, onFail);
    fire(back.intro, "playing");
    jest.advanceTimersByTime(FX_START_TIMEOUT_MS + 10);
    // 手前だけ動かなかった: 手前は消える・奥は出たまま・落ちない
    expect(op(front!.intro)).toBe("0");
    expect(front!.intro.pause).toHaveBeenCalled();
    expect(op(back.intro)).toBe("1");
    expect(onFail).not.toHaveBeenCalled();

    const k2 = makeKit();
    const onFail2 = jest.fn();
    runFxShow(k2.kit, hosts(), 30, onFail2);
    jest.advanceTimersByTime(FX_START_TIMEOUT_MS - 10);
    expect(onFail2).not.toHaveBeenCalled();
    jest.advanceTimersByTime(20);
    expect(onFail2).toHaveBeenCalledTimes(1);
  });

  it("止められた（自動再生が許されない）層は消す。`AbortError`（pause が割り込んだ）は消さない", async () => {
    const a = makeKit(false);
    a.back.intro.reject = "NotAllowedError";
    const onFail = jest.fn();
    runFxShow(a.kit, hosts(), 30, onFail);
    await flush();
    expect(onFail).toHaveBeenCalledTimes(1);

    const b = makeKit(false);
    b.back.intro.reject = "AbortError";
    const onFail2 = jest.fn();
    runFxShow(b.kit, hosts(), 30, onFail2);
    await flush();
    expect(onFail2).not.toHaveBeenCalled();
    fire(b.back.intro, "playing");
    expect(op(b.back.intro)).toBe("1");
  });

  it("読めない（error）層は消す", () => {
    const { kit, back } = makeKit(false);
    const onFail = jest.fn();
    runFxShow(kit, hosts(), 30, onFail);
    fire(back.intro, "playing");
    fire(back.stay, "error");
    expect(op(back.intro)).toBe("0");
    expect(onFail).toHaveBeenCalledTimes(1);
  });

  it("締めだけが読めなければ、層は消さずに滞在をくり返したまま終わる", () => {
    const { kit, back } = makeKit(false);
    const onFail = jest.fn();
    runFxShow(kit, hosts(), 45, onFail);
    fire(back.intro, "playing");
    fire(back.intro, "ended");
    fire(back.stay, "playing");
    fire(back.outro, "error");
    jest.advanceTimersByTime(45000);
    expect(onFail).not.toHaveBeenCalled();
    expect(op(back.stay)).toBe("1");
    expect(back.stay.loop).toBe(true);
    expect(back.outro.plays).toBe(0);
  });

  it("止めたら、要素を外して中身を手放す（再生器と読んだ中身を放す）。時計も止まる", () => {
    const { kit, back } = makeKit(false);
    const h = hosts();
    const onFail = jest.fn();
    const stop = runFxShow(kit, h, 30, onFail);
    stop();
    expect(h.back.querySelectorAll("video")).toHaveLength(0);
    expect(back.intro.getAttribute("src")).toBeNull();
    expect(back.intro.load).toHaveBeenCalled();
    jest.advanceTimersByTime(60000);
    expect(onFail).not.toHaveBeenCalled();
    expect(back.outro.plays).toBe(0);
  });
});
