/**
 * **島が、島ごとに違うものでできているか。**
 *
 *     node site/selftest/isleart_selftest.mjs
 *
 * 2026-10-06 に測ったとき、6つの島は**3組の色にしか分かれていなかった**。
 * ヨーロッパ・コーカサス・アルバニアは `--grass` から `--sea-deep` まで
 * 1ビットも違わず、5島が同じ濃紺の海に浮かんでいた。
 * アルバニア（トップページの島）はそもそも `ISLAND_ART` に無くて、
 * 草木がヨーロッパと 100% 同じだった。
 *
 * **どれも、画面を撮らないと気づけない壊れ方だった。** だから数えるほうを置く。
 *
 * ## 見ているもの
 *
 *  1. **章がぜんぶ `ISLAND_ART` に載っている**（1つでも抜けたら赤）。
 *     抜けると、その島は土地から引いた既定の絵に落ちる。落ちても何も言わない
 *  2. **島のテーマが島の数だけある**（2島が同じテーマなら赤）
 *  3. **どのテーマを取っても、草・砂・海が ΔE で離れている**
 *  4. **撒くものが `site/public/sprites/` に実在する**（名前を打ち間違えると、
 *     その絵だけ出ない。ブラウザのコンソールにも何も出ない）
 *  5. **サボテンがどの島にも無い**。アメリカ大陸の植物なので、中東にもイランにも
 *     生えていない（`docs/island-atlas.md` 3章「島が嘘をつかない」）
 *  6. **雪を置いた島が無い**。北欧へ行ったのは9月
 *
 * ## しきい値（ΔE。CIE76）
 *
 * 根拠は 2026-10-06 の実測。**ΔE 3.4**（直す前の desert の砂と既定の砂）は
 * 並べても見分けがつかず、**ΔE 15**（直す前の nordic の草と既定の草）は
 * 「海を見ればどちらか分かる」程度だった。だから
 *
 *   草・海 … 12（単体で見て違う色だと分かる）
 *   砂 ……… 8（**浜はどれも淡い**ので、ここだけ届かない。実測の最小は 10.5）
 *
 * 余白を 2〜4 残してある。ここを現状ぎりぎりに置くと、色を少し動かしただけで
 * 赤くなって、見張りのほうが捨てられる。
 *
 * ## わざと壊して、赤くなることを見る
 *
 * ```bash
 * # 1. アルバニアを表から落とす（今回の件そのもの）
 * python3 - <<'EOF' > /tmp/broken-shapes.ts
 * import re, pathlib
 * s = pathlib.Path("site/components/chain/shapes.ts").read_text()
 * i = s.index("  albania: {"); j = s.index("\n  },\n", i) + 5
 * pathlib.Path("/dev/stdout").write_text(s[:i] + s[j:])
 * EOF
 * SHAPES_TS=/tmp/broken-shapes.ts node site/selftest/isleart_selftest.mjs
 *
 * # 2. 砂漠の砂を既定に戻す（ΔE 3.4 の色づかいへ）
 * sed 's/--sand: #f0c87b/--sand: #fae7b2/' site/app/css/tokens.css > /tmp/broken.css
 * TOKENS_CSS=/tmp/broken.css node site/selftest/isleart_selftest.mjs
 * ```
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, "..");
const ISLAND = join(SITE, "components", "island");

/** 組み立てる本体。**落ちることを確かめる写しだけ、ここを差し替える。** */
const SHAPES = process.env.SHAPES_TS || join(SITE, "components", "chain", "shapes.ts");
const TOKENS = process.env.TOKENS_CSS || join(SITE, "app", "css", "tokens.css");
const CHAPTERS = process.env.CHAPTERS_TS || join(SITE, "content", "chapters.ts");
const SPRITES = join(SITE, "public", "sprites");

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

// ---- 本体を組み立てる ------------------------------------------------------
const OUT = mkdtempSync(join(tmpdir(), "isleart-out-"));
const WORK = mkdtempSync(join(tmpdir(), "isleart-src-"));
copyFileSync(join(ISLAND, "geometry.ts"), join(WORK, "geometry.ts"));
// 別名（`@/components/island/…`）は tsc が道に直してくれない
writeFileSync(
  join(WORK, "shapes.ts"),
  readFileSync(SHAPES, "utf8").replace(/@\/components\/island\//g, "./"),
);
execFileSync(join(SITE, "node_modules", ".bin", "tsc"), [
  join(WORK, "shapes.ts"),
  "--outDir", OUT,
  "--module", "commonjs",
  "--target", "es2022",
  "--strict",
  "--skipLibCheck",
], { stdio: "inherit" });
const req = createRequire(import.meta.url);
const { ISLAND_ART, artOf, plants } = req(join(OUT, "shapes.js"));
console.log(`# 組み立てた本体: ${SHAPES}`);

// ---- 1. 章がぜんぶ表に載っているか ----------------------------------------
/* `content/chapters.ts` の slug を拾う。**書き出しの中にある章の表が正。**
   ここに写しを置くと、章を足した日に見張りだけが古いまま通る。 */
const chapterSrc = readFileSync(CHAPTERS, "utf8");
const slugs = [...chapterSrc.matchAll(/^\s{4}slug: "([a-z0-9-]+)",$/gm)].map((m) => m[1]);
check("章の表を読めている（拾えた章が5つ以上）", slugs.length >= 5, `拾えたのは ${slugs.length}件`);
const missing = slugs.filter((s) => !ISLAND_ART[s]);
check(
  `章がぜんぶ ISLAND_ART に載っている（${slugs.length}章）`,
  missing.length === 0,
  `載っていない: ${missing.join(" ")}（土地から引いた既定の絵に落ちる）`,
);

// ---- 2. 島のテーマが島の数だけあるか ---------------------------------------
const themeOf = Object.fromEntries(slugs.map((s) => [s, ISLAND_ART[s]?.theme ?? "(既定)"]));
const dupes = Object.entries(
  Object.entries(themeOf).reduce((a, [s, t]) => ((a[t] ??= []).push(s), a), {}),
).filter(([, v]) => v.length > 1);
/* **島は、どれも自分の土地を名乗る。** 既定（`:root`）は「表に無い章の受け皿」で、
   どの島のものでもない。ここに落ちている島は、色を決め忘れた島。
   コーカサスが1度これで、表には highland と書いてあるのに既定の緑を出していた。 */
const onFallback = slugs.filter((s) => !ISLAND_ART[s]?.theme);
check(
  "既定の色に落ちている島が無い",
  onFallback.length === 0,
  `${onFallback.join(" ")}（:root は表に無い章の受け皿。島の色ではない）`,
);
check(
  `島のテーマが島の数だけある（${slugs.length}島）`,
  dupes.length === 0,
  dupes.map(([t, v]) => `${t}: ${v.join("・")}`).join(" / "),
);

// ---- 3. 色が離れているか ---------------------------------------------------
/** `#rrggbb` -> CIE L*a*b* */
function lab(hex) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const r = f(((n >> 16) & 255) / 255), g = f(((n >> 8) & 255) / 255), b = f((n & 255) / 255);
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const t = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  const [fx, fy, fz] = [t(X), t(Y), t(Z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
const dE = (a, b) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]));

/** tokens.css から、`:root` と `[data-theme="…"]` の変数を読む */
function palettes(css) {
  const out = {};
  const grab = (block) => {
    const o = {};
    for (const m of block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)) o[m[1]] = m[2];
    return o;
  };
  const root = css.match(/\n:root\s*\{([\s\S]*?)\n\}/);
  if (root) out["(既定)"] = grab(root[1]);
  for (const m of css.matchAll(/\[data-theme="([a-z-]+)"\]\s*\{([\s\S]*?)\n\}/g))
    out[m[1]] = { ...out["(既定)"], ...grab(m[2]) };
  return out;
}
const PAL = palettes(readFileSync(TOKENS, "utf8"));
check(`tokens.css のテーマを読めている（6つ以上）`, Object.keys(PAL).length >= 6, `${Object.keys(PAL).join(" ")}`);

/** 家族ごとのしきい値。根拠は頭のコメント */
const FAMILY = [
  ["草", "grass", 12],
  ["砂", "sand", 8],
  ["海", "sea-mid", 12],
];
for (const [label, key, min] of FAMILY) {
  const names = Object.keys(PAL).filter((t) => PAL[t][key]);
  let worst = [Infinity, "", ""];
  for (let i = 0; i < names.length; i++)
    for (let j = i + 1; j < names.length; j++) {
      const v = dE(PAL[names[i]][key], PAL[names[j]][key]);
      if (v < worst[0]) worst = [v, names[i], names[j]];
    }
  check(
    `${label}が、どの2つのテーマでも ΔE ${min} 以上（${names.length}テーマ）`,
    worst[0] >= min,
    `いちばん近いのが ΔE ${worst[0].toFixed(1)}（${worst[1]} と ${worst[2]}）`,
  );
  if (worst[0] >= min) console.log(`       いちばん近い2つ: ΔE ${worst[0].toFixed(1)}（${worst[1]} と ${worst[2]}）`);
}

// ---- 4〜6. 撒くもの ---------------------------------------------------------
const have = new Set(readdirSync(SPRITES).map((f) => f.replace(/\.[a-z0-9]+$/i, "")));
check("スプライトの置き場を読めている（100枚以上）", have.size >= 100, `${have.size}枚`);

/** 章ごとの、撒くものの名前。表に無い章は土地から引いたほうを見る */
const propsOf = (slug) => (ISLAND_ART[slug] ?? artOf(slug, [])).props.map((p) => p.n);
const unknown = [];
for (const s of slugs) for (const n of propsOf(s)) if (!have.has(n)) unknown.push(`${s}:${n}`);
check("撒くものがぜんぶ sprites/ に実在する", unknown.length === 0, unknown.join(" "));

/* サボテンはアメリカ大陸の植物。中東にもイランにも生えていない。
   **土地から引いたほうの表（`artOf`）も見る。** 章を1行足しただけの島は
   そちらに落ちるので、片方だけ直すと戻ってくる。 */
const fallbacks = ["__dry__", "__cold__", "__temperate__"].map((s, i) =>
  artOf(s, i === 0 ? ["中東・アフリカ", "中東・アフリカ"] : []).props.map((p) => p.n),
);
const allProps = [...slugs.map(propsOf), ...fallbacks].flat();
const cacti = [...new Set(allProps.filter((n) => n.startsWith("cactus")))];
check("サボテンがどの島にも無い", cacti.length === 0, cacti.join(" "));

/* 雪。北欧へ行ったのは9月で、ほかに冬へ行った章も無い。
   置いてあっても撒かれないことがあるので（props の構成比しだい）、
   **置いてあること自体**を見る。 */
const snow = [...new Set(allProps.filter((n) => /snow/.test(n)))];
check("雪のものがどの島にも無い（北欧へ行ったのは9月）", snow.length === 0, snow.join(" "));

/* 目印（`once`）は島に1つだけ。混ぜて引くと、島に風車が6基建つ */
for (const s of slugs) {
  const art = ISLAND_ART[s];
  const solo = (art?.props ?? []).filter((p) => p.once);
  if (!solo.length) continue;
  const got = plants(art, 160, { cap: 40, density: 3 });
  for (const one of solo) {
    const n = got.filter((p) => p.n === one.n).length;
    check(`${s} の ${one.n} が島に1つだけ`, n === 1, `${n}個 出た`);
  }
}

console.log(`\n通った ${OK} / 落ちた ${BAD}`);
process.exit(BAD ? 1 : 0);
