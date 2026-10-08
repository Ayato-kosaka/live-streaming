/**
 * `components/isle/icons.ts` の確かめ。**6島が、絵で見分けられるか。**
 *
 *     node site/selftest/isleplace_selftest.mjs
 *
 * ## なぜ要るか
 *
 * 2026-10-07、あやと:「あやと島のそれぞれの島が見た目が似すぎてて
 * 全然面白さがない」。同じ日に6島を同じ条件で撮って数えたら、
 * **6島に出ていた建物の絵は9種しかなかった。**
 *
 * | | 直す前 | 直したあと |
 * | --- | --- | --- |
 * | 建物の絵の重なり（Jaccard）の平均 | **62.8%** | **25.0%** |
 * | いちばん似ている2島 | 中東 vs コーカサス **100%** | 中東 vs コーカサス **56%** |
 * | 6島に出る絵の種類 | 9種 | 18種 |
 *
 * `statue`（この島のこと）と `pier`（となりの島へ）が **6島ぜんぶ同じ絵**で、
 * 名前だけが違って絵も置き方も同じだった。**赤くならない。**
 * 似ているだけなので、誰かが見て言うまで誰も気づかない。
 * だから数えて、閾値を割ったら落ちるようにする。
 *
 * ## 何を見ているか
 *
 *  1. **どの2章を取っても、建物の絵の重なりが `MAX_JACCARD` 未満**
 *  2. **重なりの平均が `MAX_MEAN` 未満**（1組だけ下げて平均が戻るのを防ぐ）
 *  3. **使っている絵が全部 `site/public/sprites/` に実在する**
 *  4. **役割（`id`）と札の字（`label`）は、章をまたいで1文字も違わない**
 *     ——絵だけが変わっていること。**ここが崩れたら失敗**なので対照で縛る
 *  5. **章ごとに建つ役割の顔ぶれが、絵の差し替えで増えても減っていない**
 *  6. **同じ島の中で、2つの役割が同じ絵になっていない**
 *     （「この島のこと」と「となりの島へ」が同じ石だと、押す場所が読めない）
 *
 * ## 閾値の根拠
 *
 * `MAX_JACCARD = 0.60`。実測のいちばん似ている組（中東 vs コーカサス）が
 * **0.56** なので、そのすぐ上に置く。中東とコーカサスは歩いた国・配信・
 * ショート・伝説・アプリと**建つ役割が5つまで一致する**（素材がそろっている
 * 章どうしなので、これは中身の話であって絵の手抜きではない）。
 * それでも 0.60 を超えるということは、**どちらかの絵の差し替えが
 * 外れた**ということ。0.5 まで締めるとこの2章は役割の重なりだけで落ちる。
 *
 * `MAX_MEAN = 0.35`。実測 0.250。直す前が 0.628 なので、
 * **半分まで戻ったら落ちる**ところに置く。1組ずつ見ていると、
 * 「全部の島にまた同じ絵を足した」が平均でしか出ない。
 *
 * ## わざと壊すと赤くなる（`docs/island-misses.md` #99 #100）
 *
 * `ICONS_TS` に壊した写しの道を渡すと、そちらを組み立てて回す。
 *
 * ```bash
 * # (1) 差し替えを全部やめる（直す前に戻す）→ 1 と 2 が落ちる
 * printf 'export const ISLE_ICONS: Record<string, Record<string, string>> = {};\n%s\n' \
 *   'export function isleIcon(_s: string | undefined, _r: string, f: string) { return f; }' \
 *   > /tmp/icons-flat.ts
 * ICONS_TS=/tmp/icons-flat.ts node site/selftest/isleplace_selftest.mjs
 *
 * # (2) 無い絵の名前を書く → 3 が落ちる
 * sed 's/"rocks-snow"/"rocks-of-snow"/' site/components/isle/icons.ts > /tmp/icons-ghost.ts
 * ICONS_TS=/tmp/icons-ghost.ts node site/selftest/isleplace_selftest.mjs
 *
 * # (3) 同じ島で2つの役割を同じ絵にする → 6 が落ちる
 * sed 's/    facts: "stone-tall",/    facts: "hut-workshop",/' site/components/isle/icons.ts \
 *   > /tmp/icons-dup.ts
 * ICONS_TS=/tmp/icons-dup.ts node site/selftest/isleplace_selftest.mjs
 * ```
 */

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import Module from "node:module";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, "..");
const ISLE = join(SITE, "components", "isle");

/** いちばん似ている2章の、許せる重なり。根拠は上の「閾値の根拠」 */
const MAX_JACCARD = 0.6;
/** 15組の平均。同 */
const MAX_MEAN = 0.35;

/** 組み立てる `icons.ts`。**落ちることを確かめる写しだけ、ここを差し替える。** */
const SRC = process.env.ICONS_TS || join(ISLE, "icons.ts");

// ------------------------------------------------------------------ 組み立て

const OUT = mkdtempSync(join(tmpdir(), "isleplace-out-"));
const WORK = mkdtempSync(join(tmpdir(), "isleplace-src-"));

writeFileSync(
  join(WORK, "tsconfig.json"),
  JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      lib: ["ES2022", "DOM"],
      module: "commonjs",
      moduleResolution: "node",
      esModuleInterop: true,
      resolveJsonModule: true,
      skipLibCheck: true,
      // 型の粗さはここで見るものではない（`npx tsc --noEmit` が見る）。
      // ここが欲しいのは**動く JS** だけなので、型で止めない
      strict: false,
      noEmitOnError: false,
      outDir: OUT,
      rootDir: SITE,
      baseUrl: SITE,
      paths: { "@/*": ["./*"] },
    },
    files: [join(SITE, "components", "isle", "spec.ts")],
  }),
);

/* tsc は型の文句を言うが（`lib/builtAt.ts` の `process` など。
   @types/node を入れていないだけで、動くほうには関わらない）、
   **JS は書き出される。** 組み立てたものが require できるかで見る。 */
const TSC = join(SITE, "node_modules", ".bin", "tsc");
try {
  execFileSync(TSC, ["-p", join(WORK, "tsconfig.json")], { stdio: "pipe" });
} catch {
  /* 型の文句で 1 を返す。書き出しは済んでいるので、ここでは止めない */
}

/* **絵の表だけ、組み立て直して差し替える。** 島の建てかた（`spec.ts`）は
   本物をそのまま通す。ここに偽の島を置くと、本体を直したのに確かめが古いまま通る。
   `icons.ts` は他を1つも import しないので、1本だけで組み立つ */
copyFileSync(SRC, join(WORK, "icons.ts"));
execFileSync(TSC, [join(WORK, "icons.ts"), "--outDir", WORK, "--module", "commonjs", "--target", "es2022", "--skipLibCheck"], { stdio: "pipe" });
copyFileSync(join(WORK, "icons.js"), join(OUT, "components", "isle", "icons.js"));

/* `@/…` は tsc が道に直してくれないので、require のときに差し替える。
   写しで回すときは、`icons.ts` だけ写しのほうへ向ける */
const orig = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request.startsWith("@/")) return orig.call(this, join(OUT, request.slice(2)), ...rest);
  return orig.call(this, request, ...rest);
};

const req = createRequire(import.meta.url);
const { isleSpec, albaniaSpec, macedoniaSpec, nordicSpec } = req(join(OUT, "components", "isle", "spec.js"));
const { CHAPTERS } = req(join(OUT, "content", "chapters.js"));
console.log(`# 組み立てた絵の表: ${SRC}`);

// ------------------------------------------------------------------ 数える

let BAD = 0;
let OK = 0;
function check(name, good, why = "") {
  if (good) {
    OK++;
    console.log(`  ok   ${name}`);
    return;
  }
  BAD++;
  console.log(`  NG   ${name}${why ? ` — ${why}` : ""}`);
}

/* 島の建てかたは**本番の面と同じ**にする（`app/island/[chapter]/page.tsx`）。
   旅の spec を持っている章は、建つものの多いほうで建つ */
const TRIP = { nordic: nordicSpec, albania: albaniaSpec, "north-macedonia": macedoniaSpec };
const NEAR = { name: "となりの島", href: "/island/x" };
const isles = CHAPTERS.map((c) => {
  const base = isleSpec(c, NEAR, NEAR);
  const trip = TRIP[c.slug]?.(c, NEAR, NEAR);
  const spec = trip && base.places.length < trip.places.length ? trip : base;
  return { slug: c.slug, places: spec.places };
});

/* **数を焼かない。** ここは長く `=== 6` だったので、**章を1つ足した日に
   この見張りが落ちた**（北マケドニアを足して実際に落ちた）。見たいのは
   「章の表を読めているか」であって章の数ではないので、下限だけ見る
   （0章になったら読めていない）。 */
check(`章の表を読めている（${isles.length}章・6章以上）`, isles.length >= 6, `${isles.length}章`);

for (const i of isles) {
  console.log(`  - ${i.slug}: ${i.places.map((p) => `${p.id}=${p.icon}`).join(" ")}`);
}

// ---- 1,2 建物の絵の重なり

const iconSet = (i) => new Set(i.places.map((p) => p.icon));
let sum = 0;
let pairs = 0;
let worst = { j: -1, a: "", b: "" };
for (let a = 0; a < isles.length; a++) {
  for (let b = a + 1; b < isles.length; b++) {
    const A = iconSet(isles[a]);
    const B = iconSet(isles[b]);
    const inter = [...A].filter((x) => B.has(x)).length;
    const j = inter / new Set([...A, ...B]).size;
    sum += j;
    pairs++;
    if (j > worst.j) worst = { j, a: isles[a].slug, b: isles[b].slug };
  }
}
const mean = sum / pairs;
check(
  `どの2章も、建物の絵の重なりが ${Math.round(MAX_JACCARD * 100)}% 未満`,
  worst.j < MAX_JACCARD,
  `いちばん似ているのが ${worst.a} vs ${worst.b} で ${(worst.j * 100).toFixed(0)}%`,
);
check(
  `重なりの平均が ${Math.round(MAX_MEAN * 100)}% 未満`,
  mean < MAX_MEAN,
  `${(mean * 100).toFixed(1)}%`,
);
console.log(
  `  # 平均 ${(mean * 100).toFixed(1)}% / 最大 ${(worst.j * 100).toFixed(0)}%` +
    `（${worst.a} vs ${worst.b}）/ 6島に出る絵 ${new Set(isles.flatMap((i) => [...iconSet(i)])).size}種`,
);

// ---- 3 絵が実在する

const HAVE = new Set(
  readdirSync(join(SITE, "public", "sprites"))
    .filter((f) => f.endsWith(".webp"))
    .map((f) => f.slice(0, -5)),
);
const missing = [
  ...new Set(isles.flatMap((i) => i.places.map((p) => p.icon)).filter((n) => !HAVE.has(n))),
];
check(
  "使っている絵が全部 site/public/sprites/ にある",
  missing.length === 0,
  `無い: ${missing.join(" ")}`,
);

// ---- 4 役割と札の字は、章をまたいで同じ（対照）

const labels = new Map();
const clash = [];
for (const i of isles) {
  for (const p of i.places) {
    const was = labels.get(p.id);
    if (was == null) labels.set(p.id, { label: p.label, slug: i.slug });
    else if (was.label !== p.label)
      clash.push(`${p.id}: ${was.slug}「${was.label}」/ ${i.slug}「${p.label}」`);
  }
}
check("札の字が、章をまたいで1文字も違わない", clash.length === 0, clash.join(" / "));
console.log(`  # 役割 ${[...labels].map(([id, v]) => `${id}「${v.label}」`).join(" ")}`);

// ---- 5 章ごとに建つ役割の顔ぶれ（絵の差し替えで島が痩せていないか）

/* **絵の表を触って島から1軒消えても赤くならない**ので、ここで縛る。
   同じ壊れ方を前にやっている（`app/island/[chapter]/page.tsx` の注。
   機械が焼いた1本で北欧が5日間ショート1軒の島になった）。 */
const WANT = {
  europe: "countries streams shorts legends first facts pier",
  "middle-east": "countries streams shorts legends apps facts pier",
  caucasus: "countries streams shorts legends apps facts pier",
  "iran-walk": "countries streams shorts legends facts pier",
  nordic: "countries streams shorts facts pier",
  albania: "facts wish pier",
  /* 着いていない島。まだ配信も歩いた国も焼かれていないので、建つのは
     足した案内（`macedoniaSpec`）と桟橋だけ。**歩いて素材が焼かれたら
     ここを増やす**——増えたことに気づかないまま減らさないため、
     減っても増えても赤くなる形にしてある。 */
  "north-macedonia": "guidebook pier",
};
for (const i of isles) {
  const got = i.places.map((p) => p.id).join(" ");
  check(`${i.slug} に建つ役割が変わっていない`, got === WANT[i.slug], `${got}（欲しいのは ${WANT[i.slug]}）`);
}

// ---- 6 同じ島の中で、2つの役割が同じ絵になっていない

for (const i of isles) {
  const seen = new Map();
  const dup = [];
  for (const p of i.places) {
    if (seen.has(p.icon)) dup.push(`${seen.get(p.icon)} と ${p.id} が ${p.icon}`);
    else seen.set(p.icon, p.id);
  }
  check(`${i.slug} の中に同じ絵が2つ無い`, dup.length === 0, dup.join(" / "));
}

// ------------------------------------------------------------------ しめ

console.log(`\n通った ${OK} / 落ちた ${BAD}`);
process.exit(BAD ? 1 : 0);
