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
 *  7. **島の輪郭が、島ごとに違う**（どの2章も一致率 80% 未満・平均 65% 未満・24方位以上）。
 *     2026-10-07 まで、6島は「どれも同じじゃがいも」で平均 74.5% / 最大 94.5% だった
 *  8. **刻みを深くしすぎて輪郭が壊れていない**（自己交差・裏返り。浜と草地の両方）
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
 *
 * # 3. 北欧を 16方位のじゃがいもに戻す（直す前の値）
 * #    → 一致率 86.5%（アルバニアと）で赤・24方位の条件でも赤
 *
 * # 4. アルバニアの東の入り江を中心まで届くほど深くする（0.62 → 0.04）
 * #    → 「裏返っていない」が赤
 *
 * # 5. 折れ角の弱め（`geometry.ts` の `kinkScale`）を外して引っぱりを強くする
 * #    `geometry.ts` の `kinkScale` の戻り値を 5 に置き換えた写しを作って
 * #    GEOMETRY_TS=/tmp/broken-geo.ts node site/selftest/isleart_selftest.mjs
 * #    → 12本ぜんぶで「自己交差していない」が赤
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
/** 輪郭を描く道具。**折れ角の弱めを外すと赤くなる**ことを見るために差し替えられる */
const GEOMETRY = process.env.GEOMETRY_TS || join(ISLAND, "geometry.ts");
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
copyFileSync(GEOMETRY, join(WORK, "geometry.ts"));
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
/* `shapes.ts` が読んでいるので、`geometry.js` も同じ置き場に出ている。
   **描くのと同じ道具で数える**（別に書き写すと、画面の形と見張りが別物になる） */
const { resample, wobble, radiiToPoints, flattenClosed } = req(join(OUT, "geometry.js"));
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

// ---- 7. 島の輪郭が、島ごとに違うか ----------------------------------------
/* 2026-10-07 に測ったとき、**6島は「どれも同じじゃがいも」だった。**
   浜のふち（`path.ig-sand`）を大きさと位置だけそろえて重ねると、
   一致率は平均 74.5% / 最大 94.5%（コーカサスとイランが 94.5%）。
   湾も岬もフィヨルドも、1つも絵に出ていなかった。

   ## 測りかた（`tools/sprites/isleshape.mjs` と同じ）

   `radii` から、島と同じ順で浜のふちを組む（resample → wobble →
   Catmull-Rom）。**面積を1にそろえ、重心を原点に置いてから**重ねて、
   重なり ÷ 合わせ（IoU）。向きは直さない——島は地図と同じで北が上なので、
   回して合わせると「東西に長い島」と「南北に長い島」が同じ形になる。

   半径は**どの章も 300 で揃える**。大小は滞在日数で決まる別の話だし、
   章の日付が動くたびに見張りの数字が動くのも困る。

   ## しきい値

   直したあとの実測が**平均 55.9% / 最大 75.8%**（北欧とアルバニア。
   どちらも南北に長いので、ここがいちばん似る）。余白を残して

     どの2章も …… 80% 未満
     平均 ………… 65% 未満

   現状ぎりぎりに置くと、章を1つ足しただけで赤くなって見張りが捨てられる。
   **緩めるときは、先に `tools/sprites/isleshape.mjs` で絵を見ること。**
   数字が通っても「どれがどの島か当てられる」が本当の合格条件。 */
const R_FIX = 300;
const COAST_N = 64; // `components/isle/world.ts` と同じ
const BEACH = 40;
const SQ = 0.9;
/** 章ひとつぶんの、浜のふちと草地のふち（描かれるのと同じ曲線を折ったもの） */
function coastOf(slug) {
  const art = ISLAND_ART[slug] ?? artOf(slug, []);
  const base = resample(art.radii.map((v) => v * R_FIX), COAST_N);
  const sand = wobble(base, art.seed + 11, Math.max(4, R_FIX * 0.022), [3, 7, 13]);
  const grass = wobble(sand.map((v) => v - BEACH), art.seed + 23, Math.max(3, R_FIX * 0.014), [4, 9, 17]);
  const line = (radii) => flattenClosed(radiiToPoints(0, 0, radii, SQ), 8);
  return { art, sand, grass, sandLine: line(sand), grassLine: line(grass) };
}
const COAST = Object.fromEntries(slugs.map((s) => [s, coastOf(s)]));

/** 面積を1に、重心を原点に置いてから、升目で塗る */
const GRID = 256;
function mask(P) {
  let A = 0, cx = 0, cy = 0;
  for (let i = 0; i < P.length; i++) {
    const [ax, ay] = P[i], [bx, by] = P[(i + 1) % P.length];
    const c = ax * by - bx * ay;
    A += c; cx += (ax + bx) * c; cy += (ay + by) * c;
  }
  A /= 2; cx /= 6 * A; cy /= 6 * A;
  const k = (GRID * 0.42) / Math.sqrt(Math.abs(A));
  const q = P.map(([x, y]) => [(x - cx) * k + GRID / 2, (y - cy) * k + GRID / 2]);
  const m = new Uint8Array(GRID * GRID);
  for (let gy = 0; gy < GRID; gy++) {
    const y = gy + 0.5, xs = [];
    for (let i = 0; i < q.length; i++) {
      const [ax, ay] = q[i], [bx, by] = q[(i + 1) % q.length];
      if ((ay <= y && by > y) || (by <= y && ay > y)) xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let t = 0; t + 1 < xs.length; t += 2)
      for (let gx = Math.ceil(xs[t]); gx < xs[t + 1]; gx++) if (gx >= 0 && gx < GRID) m[gy * GRID + gx] = 1;
  }
  return m;
}
const MASK = Object.fromEntries(slugs.map((s) => [s, mask(COAST[s].sandLine)]));
let sum = 0, pairs = 0, worst = [0, "", ""];
for (let i = 0; i < slugs.length; i++)
  for (let j = i + 1; j < slugs.length; j++) {
    const a = MASK[slugs[i]], b = MASK[slugs[j]];
    let inter = 0, uni = 0;
    for (let k = 0; k < GRID * GRID; k++) { if (a[k] & b[k]) inter++; if (a[k] | b[k]) uni++; }
    const v = inter / uni;
    sum += v; pairs++;
    if (v > worst[0]) worst = [v, slugs[i], slugs[j]];
  }
check(
  `輪郭が、どの2章でも一致率 80% 未満（${pairs}組）`,
  worst[0] < 0.8,
  `いちばん似ているのが ${(worst[0] * 100).toFixed(1)}%（${worst[1]} と ${worst[2]}）`,
);
check(
  `輪郭の一致率の平均が 65% 未満`,
  sum / pairs < 0.65,
  `平均 ${((sum / pairs) * 100).toFixed(1)}%`,
);
if (worst[0] < 0.8)
  console.log(`       平均 ${((sum / pairs) * 100).toFixed(1)}% / いちばん似ている2島 ${(worst[0] * 100).toFixed(1)}%（${worst[1]} と ${worst[2]}）`);

/* **方位の数。** 16方位では、いちばん狭い刻みでも 22.5度ぶんの幅を持つので
   湾も岬も入らない。ここを戻されると、数字（上の一致率）より先に意図が消える */
const coarse = slugs.filter((s) => (ISLAND_ART[s]?.radii.length ?? 0) < 24);
check("輪郭が24方位以上（16方位では湾も岬も入らない）", coarse.length === 0, coarse.join(" "));

// ---- 8. 刻みを深くしすぎて、輪郭が壊れていないか ---------------------------
/* 刻みを深くすると、Catmull-Rom の制御点が伸びて**曲線が自分をまたぐ**。
   またいでも絵は出る（塗りが裏返って穴があくだけ）ので、見ただけでは気づけない。
   浜だけでなく**草地も**見る。草地は浜から 40 内側なので、入り江の底では
   浜より深く切れていて、先に壊れるのはこちら。 */
function crossings(P) {
  const n = P.length;
  const side = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  let hits = 0;
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const a = P[i], b = P[(i + 1) % n], c = P[j], d = P[(j + 1) % n];
      if (side(a, b, c) !== side(a, b, d) && side(c, d, a) !== side(c, d, b)) hits++;
    }
  return hits;
}
const tangled = [];
const flipped = [];
for (const s of slugs) {
  for (const [label, line] of [["浜", COAST[s].sandLine], ["草地", COAST[s].grassLine]]) {
    if (crossings(line)) tangled.push(`${s}の${label}`);
    /* **裏返り。** 島は中心から見て一周ぶんの形なので、どの点も中心より外に
       あって、一周したときの向きが変わらない。制御点が伸びて中心を跨ぐと
       ここが崩れる（符号つき面積の向きが逆になるか、中心にめり込む） */
    let A = 0;
    for (let i = 0; i < line.length; i++) {
      const [ax, ay] = line[i], [bx, by] = line[(i + 1) % line.length];
      A += ax * by - bx * ay;
    }
    const near = Math.min(...line.map(([x, y]) => Math.hypot(x, y / SQ)));
    if (A <= 0 || near < 10) flipped.push(`${s}の${label}`);
  }
}
check("輪郭が自己交差していない（浜と草地。刻みを深くしすぎると壊れる）", tangled.length === 0, tangled.join(" "));
check("輪郭が裏返っていない（中心を跨いでいない）", flipped.length === 0, flipped.join(" "));

console.log(`\n通った ${OK} / 落ちた ${BAD}`);
process.exit(BAD ? 1 : 0);
