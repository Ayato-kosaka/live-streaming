/**
 * **焼いた書体が、島の文章に追いついているかを見張る。**
 *
 *   node tools/sprites/fontstale_selftest.mjs
 *
 * `site/app/css/fonts.css` の `unicode-range` と、島のソースに出てくる字を
 * 突き合わせて、**焼かれていない字が何字あるか**を数える。
 * ブラウザも書き出しも要らない（`selftest_runner.py` から毎回走る）。
 *
 * ## なぜ要るか
 *
 * 書体は `tools/fonts/subset.py` を**手で**回して焼く。文章を増やした人が
 * 回し忘れても**何も壊れない**——足した字が端末の書体で出るだけなので、
 * iPhone と Mac では丸ゴシックのまま、Android だけ普通のゴシックになる。
 * **つまり誰も気づかない。** `fontbudget_selftest.mjs` は「太ったか」は見るが、
 * **数えた表（`tools/fonts/weights.json`）そのものが古い**ことは見られない。
 * 焼き込みは配り直しても動かないので、気づけない形がいちばん先に腐る。
 *
 * ## しきい値の決めかた（2026-10-13 の実測）
 *
 * 絵文字と異体字セレクタ（Zen Maru Gothic が字を持っていないもの）と ASCII は
 * 数から外したうえで、いまこうなっている:
 *
 * | 見るところ | いま焼かれていない字 | しきい値 | なぜ |
 * | --- | ---: | ---: | --- |
 * | `site/app` ＋ `site/components` | **4**（恵 履 簿 紐） | **40** | **必ず画面に出るところ。** ほぼ 0 なので、しきい値は低く置ける。面を1枚足すと漢字は 50〜200 字増えるので、40 なら1枚ぶんで鳴る |
 * | `site/content` | **50** | **160** | **もともと焼かない方針のデータが混ざる**（今日は何の日・おしゃべり・7か国の紹介文。1回に1件しか出ないので足すと全面が太る。`subset.py` の `EXTRA_DIRS`）。ここは「増えたら鳴る」ドリフト監視。毎晩の焼き直しが足すのは1日に数字なので、110 の余裕は数か月ぶん |
 *
 * **分母から外していない。** 焼かない方針のものも数に入れたまま、しきい値を
 * その内側に置いてある。外すと「外したものが増えた」ときに気づけない。
 *
 * 鳴ったらやることは1つ。**焼き直して、出た数字でここを書き直す:**
 *
 *   tools/build.sh 3250
 *   python3 -m http.server 4250 --directory site/.next-3250 &
 *   DIST=site/.next-3250 SPORT=4250 node tools/sprites/fontweigh.mjs
 *   python3 tools/fonts/subset.py --export site/.next-3250
 *
 * ## 対照
 *
 * 数えるだけの見張りは、数え方が壊れると静かに通る。**わざと壊した入力を
 * 3つ通して、落ちることを先に見てから**本物を数える。
 *
 * 終了コード 0=追いついている / 1=焼き直しが要る / 2=数えるものが無い・対照が外れた。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CSS = join(ROOT, "site", "app", "css", "fonts.css");

/* 見るところと、しきい値（上の表のとおり。実測 4 と 50） */
const WATCH = [
  { name: "site/app ＋ site/components", dirs: ["site/app", "site/components"], limit: 40 },
  { name: "site/content", dirs: ["site/content"], limit: 160 },
];

/** 書体が字を持っていないもの。数えても焼けないので外す。 */
function outside(cp) {
  return (
    cp < 0x80 || // 英数と記号は必ず焼いてある
    cp >= 0x1f000 || // 絵文字（Zen Maru Gothic に字が無い）
    (cp >= 0xfe00 && cp <= 0xfe0f) || // 異体字セレクタ
    cp === 0x20e3 || cp === 0x200d || // 囲み・くっつけるだけの字
    cp === 0x3000 || cp === 0xa0 || // 目に見えない空白（`subset.py` が焼く前に落とす）
    (cp >= 0x2600 && cp <= 0x27bf) || // ピクトグラム
    (cp >= 0x2b00 && cp <= 0x2bff)
  );
}

const RE_BLOCK = /\/\*[\s\S]*?\*\//g;
const RE_LINE = /(?<!:)\/\/[^\n]*/g;

function covered(css) {
  const set = new Set();
  for (const m of css.matchAll(/unicode-range:\s*([^;]+);/g)) {
    for (const r of m[1].split(",")) {
      const [a, b] = r.trim().replace(/^U\+/i, "").split("-");
      const lo = parseInt(a, 16);
      const hi = parseInt(b ?? a, 16);
      for (let c = lo; c <= hi; c++) set.add(c);
    }
  }
  return set;
}

function walk(dir, out = []) {
  let names;
  try { names = readdirSync(dir); } catch { return out; }
  for (const n of names) {
    if (n === "node_modules") continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if ([".ts", ".tsx", ".json"].includes(extname(n))) out.push(p);
  }
  return out;
}

/** その置き場に出てくる字（コメントは落とす）。 */
function charsOf(dirs) {
  const set = new Set();
  let files = 0;
  for (const d of dirs) for (const p of walk(join(ROOT, d))) {
    files++;
    let t = readFileSync(p, "utf8");
    if (extname(p) !== ".json") t = t.replace(RE_BLOCK, " ").replace(RE_LINE, " ");
    for (const c of t) { const cp = c.codePointAt(0); if (cp > 0x1f) set.add(cp); }
  }
  return { set, files };
}

/** @param break_ "blind"（焼いたものを読めていない） / "flood"（焼かれていない字を混ぜる） */
function count(cov, break_) {
  const rows = [];
  for (const w of WATCH) {
    const { set, files } = charsOf(w.dirs);
    const use = break_ === "blind" ? new Set() : cov;
    let miss = [...set].filter((cp) => !use.has(cp) && !outside(cp));
    if (break_ === "flood") miss = miss.concat(Array.from({ length: 300 }, (_, i) => 0x9000 + i));
    rows.push({ ...w, files, miss: miss.length, 例: miss.slice(0, 12).map((c) => String.fromCodePoint(c)).join("") });
  }
  return rows;
}

function judge(rows, label) {
  const bad = rows.filter((r) => r.miss > r.limit);
  for (const r of rows) {
    console.log(`  ${label}  ${r.name}  ${r.files}本のファイル  焼かれていない ${r.miss}字（上限 ${r.limit}）  ${r.例}`);
  }
  return bad;
}

const css = readFileSync(CSS, "utf8");
const cov = covered(css);
if (cov.size < 500) {
  console.log(`✕ ${CSS} から字の範囲を ${cov.size} しか読めなかった。数えるものが無い`);
  process.exit(2);
}

console.log("[対照] わざと壊した入力で、この見張りが落ちるか");
let ok = true;
for (const [name, why] of [
  ["blind", "焼いたものを1字も読めていない"],
  ["flood", "焼かれていない字を 300 字ぶん混ぜる"],
]) {
  const bad = judge(count(cov, name), `${name}（${why}）`);
  console.log(`  ${bad.length ? "○" : "✕"} ${name} → ${bad.length ? `${bad.length}か所で上限を超えた` : "**素通りした。この見張りは効いていない**"}`);
  if (!bad.length) ok = false;
}
/* 空の置き場を見に行ったら、0字ではなく「数えるものが無い」 */
{
  const { files } = charsOf(["site/no-such-place"]);
  console.log(`  ${files === 0 ? "○" : "✕"} 無い置き場 → ファイル ${files}本（0本なら、下の判定で 2 になる）`);
  if (files !== 0) ok = false;
}
if (!ok) {
  console.log("\n✕ 対照が外れた。**本物の数字は1つも出さない**");
  process.exit(2);
}

console.log("\n[本物]");
const rows = count(cov, null);
if (rows.some((r) => r.files === 0)) {
  console.log("✕ 1本も読めなかった置き場がある。**「追いついています」とは言わない**");
  process.exit(2);
}
const bad = judge(rows, "いま");
if (bad.length) {
  console.log("\n✕ 焼いた書体が、島の文章に追いついていない。`tools/fonts/subset.py` を回し直して、");
  console.log("  出た数字でこのファイルの頭の表としきい値を書き直す（手順は上）");
  process.exit(1);
}
console.log("○ 焼いた書体は、島の文章に追いついている");
