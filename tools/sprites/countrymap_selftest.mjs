/**
 * **国の寄り地図の焼いた絵が、いまの地図に追いついているかを見張る。**（#1262・#332）
 *
 *     node tools/sprites/countrymap_selftest.mjs
 *
 * 0＝ぜんぶ通った / 1＝見つかった / 2＝数えるものが無い。ブラウザも書き出しも要らない
 * （`python/selftest_runner.py` が `tools/sprites/*_selftest.mjs` を拾うので、毎 PR で走る）。
 *
 * ## なぜ要るか
 *
 * 国の面の地図は、焼いた1枚の絵（`site/public/travel/<国>/<国名>の地図-<幅>.webp`）を出している。
 * 地図のデータ（`python/build_world_route.py`）か絵の組みかた（`countryArt.ts`）を変えて**焼き直し忘れると**、
 * 面は黙って SVG を直に描くほうへ戻る（`components/atlas/mapArt.ts`）。**見た目は壊れないので誰も気づかない。**
 * 落ちるのは検索の点（地図の絵・alt・画像のサイトマップ・ImageObject）だけ。だからここで赤くする。
 *
 * ## 見るもの
 *
 * 1. 面を持つ国（国の表に在って、地図の JSON が在る国）の全部に、焼いた控え（`content/atlas/mapArt.json`）があり、
 *    **いまの絵の字の指紋と名前が控えと同じ**
 * 2. 控えの幅ぶんの絵のファイルが在り、WebP で、中身が空でない
 * 3. 絵の色の表（`countryArt.ts` の `ART_COLORS`）が、面の CSS（`atlas.css` `tokens.css` の `:root`）と同じ値
 *    （色を変えたら絵も焼き直す。CSS だけ変えると、地図だけ前の色で残る）
 *
 * 鳴ったら: `cd tools/sprites && node countrymap_bake.mjs`（古い国だけ焼き直す）。
 *
 * ## 対照（見張りが落ちられること）
 *
 * 本物を見る前に、写しを1本ずつ折って、**それぞれで落ちる**のを確かめる（指紋を1字変える・名前を変える・
 * ファイルを消す・色を1つ変える）。どれかで落ちなければ、本物の数を1つも出さずに 2 で抜ける。
 */
import { existsSync, readFileSync, statSync } from "node:fs";

import { art, files, maps, names, readBaked, sha1 } from "./countryart.mjs";
import { repoPath } from "./repo.mjs";

/** CSS の `:root { … }` に書いてある変数（最初に出た値）。`:root` の外（部品ごとの上書き）は見ない */
function rootVars(css) {
  const out = {};
  for (const [, body] of css.matchAll(/(?:^|\n):root\s*\{([\s\S]*?)\n\}/g)) {
    for (const [, k, v] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[k] ??= v.trim().toLowerCase();
  }
  return out;
}

/**
 * 見る。`o` で写しを差し替えられる（対照用）。見つけたものの字の並びを返す
 * @returns {{ng: string[], seen: number}}
 */
function check(o = {}) {
  const all = o.maps ?? maps();
  const nm = o.names ?? names();
  const baked = o.baked ?? readBaked();
  const exists = o.exists ?? existsSync;
  const colors = o.colors ?? art.ART_COLORS;
  const css = o.css ?? { ...rootVars(readFileSync(repoPath("site/app/css/tokens.css"), "utf8")), ...rootVars(readFileSync(repoPath("site/app/css/atlas.css"), "utf8")) };
  const ng = [];
  let seen = 0;
  for (const [slug, m] of Object.entries(all)) {
    seen += 1;
    const name = nm[slug];
    const b = baked[slug];
    if (!name) {
      ng.push(`${slug}: 名前が content/countries.ts から引けない`);
      continue;
    }
    if (!b) {
      ng.push(`${slug}（${name}）: 地図の絵を焼いていない`);
      continue;
    }
    if (b.name !== name) ng.push(`${slug}: 焼いた名前「${b.name}」がいまの名前「${name}」と違う（ファイル名が「〈国〉の地図」でなくなる）`);
    else if (b.hash !== sha1(art.countryArtSvg(m, slug))) ng.push(`${slug}（${name}）: 焼いた絵が古い（地図のデータか countryArt.ts が変わった）`);
    for (const f of files(slug, name)) {
      if (!exists(f.path)) {
        ng.push(`${slug}（${name}）: 絵のファイルが無い（${f.path.split("/site/public")[1]}）`);
        continue;
      }
      if (o.exists) continue; // 対照の写し（ファイルを読まない）
      const head = readFileSync(f.path).subarray(0, 12);
      if (head.subarray(0, 4).toString() !== "RIFF" || head.subarray(8, 12).toString() !== "WEBP" || statSync(f.path).size < 2048) {
        ng.push(`${slug}（${name}）: ${f.w}px の絵が WebP でないか、空に近い`);
      }
    }
  }
  for (const [k, v] of Object.entries(colors)) {
    if (!css[k]) ng.push(`色 ${k}: CSS の :root に無い`);
    else if (css[k] !== v.toLowerCase()) ng.push(`色 ${k}: 絵は ${v}、CSS は ${css[k]}（どちらかに揃えて、焼き直す）`);
  }
  return { ng, seen };
}

/* ---- 対照: 写しを1本ずつ折って、落ちることを見る ---- */
const real = { maps: maps(), names: names(), baked: readBaked() };
const one = Object.keys(real.maps)[0];
const controls = {
  "指紋を1字変える": () => ({ baked: { ...real.baked, [one]: { ...real.baked[one], hash: `0${(real.baked[one]?.hash ?? "").slice(1)}` } } }),
  "名前を変える": () => ({ names: { ...real.names, [one]: `${real.names[one]}X` } }),
  "控えから1国消す": () => {
    const b = { ...real.baked };
    delete b[one];
    return { baked: b };
  },
  "ファイルを消す": () => ({ exists: (p) => !p.endsWith(`-${art.ART_WIDTHS[0]}.webp`) }),
  "色を1つ変える": () => ({ colors: { ...art.ART_COLORS, "--am-sea-deep": "#000000" } }),
};
if (!one) {
  console.error("数えるものが無い（国の表（content/countries.ts）と地図の JSON から、国が1つも引けない）");
  process.exit(2);
}
const deaf = Object.entries(controls).filter(([, mk]) => check({ ...real, exists: undefined, ...mk() }).ng.length === 0);
// 「ファイルを消す」は exists を差し替える。ほかは本物のファイルを見る
if (deaf.length) {
  console.error(`対照で落ちなかった: ${deaf.map(([k]) => k).join("・")}（見張りが何も見ていない）`);
  process.exit(2);
}

/* ---- 本物 ---- */
const { ng, seen } = check();
if (!seen) {
  console.error("数えるものが無い");
  process.exit(2);
}
if (ng.length) {
  console.error(`国の地図の絵: ${ng.length}件（面を持つ国 ${seen}）`);
  for (const s of ng) console.error(`  - ${s}`);
  console.error("直しかた: cd tools/sprites && node countrymap_bake.mjs");
  process.exit(1);
}
console.log(`国の地図の絵: 面を持つ国 ${seen} ぜんぶ焼けていて、いまの地図と同じ（対照 ${Object.keys(controls).length}本も落ちた）`);
