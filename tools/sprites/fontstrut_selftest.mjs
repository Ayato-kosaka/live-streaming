/**
 * **行の高さのために引かれる1本が、小さいままかを見張る。**
 *
 *   node tools/sprites/fontstrut_selftest.mjs
 *
 * 終了コード 0=通った / 1=太っている・見当たらない / 2=数えるものが無い。
 *
 * ## 何を見ているか（#848）
 *
 * ブラウザは、**字を1つも描かない段でも**行の高さを決めるためにその段の
 * 書体を要る。Chrome はその代表として **U+0020（空白）**を引く。だから
 * 「太さ 400 で描く字が1つも無い面」でも、U+0020 を持つ 400 の束が必ず
 * 1本落ちてくる。**止められない。**
 *
 * 2026-10-15 まで、その1本が「かな・英数の束」（`maru-400-0`・26.6KB）
 * だった。実測で `/island/iran-walk` は**1字も描かないまま 26.6KB** 払って
 * いた。いまは `tools/fonts/subset.py` が U+0020 と U+2026 だけの束を太さごとに
 * 1本焼いて、ほかの束からその2字を抜いてある（`STRUT`）。
 *
 * ここが見るのは3つ。**焼いたもの（`fonts.css` と `site/public/fonts/`）
 * だけを読む。** ブラウザも書き出しも要らないので、どこからでも回る。
 *
 *   1. 太さごとに、U+0020 を持つ束が**ちょうど1本**あるか
 *      （0本 … 空白が端末の書体に落ちて、行の詰まりが変わる
 *        2本以上 … どれが引かれるかが焼き直しごとに変わる）
 *   2. その束が **U+0020 と U+2026 しか持っていない**か（ほかの字を持つと、
 *      その字のぶんまで「1字も描かない面」が払う）。U+2026 を入れてあるのは、
 *      `text-overflow: ellipsis` の「…」も DOM に無いまま**この束から**出るから
 *      （入れないと切り詰めの三点だけ端末の書体になる。実測 296画素）
 *   3. その束の実ファイルが**小さすぎず・大きすぎない**か（`MIN_B` 〜 `MAX_B`）
 *
 * 3つめに下限があるのは、**空白1字だけで焼くとブラウザがその woff2 を蹴る**から。
 * `.notdef` と `space` はどちらも輪郭を持たないので `glyf` が空になり、
 * Chrome の検査（OTS）が通さない。実測（2026-10-15）:
 *
 *   空白1字で焼いた 612B … `document.fonts` が **status=error**。空白は端末の
 *     書体に落ちて、送り幅が 4.4844px → 4.4531px（16px のとき）に変わる。
 *     わずかだが**行の折れ方が変わる**（`/kitchen/karaage` の背が 2px 縮んだ）
 *   空白＋「…」＋詰め物「0」で焼いた 792〜800B … status=loaded・送り幅は元のまま
 *
 * **落ちかたが「赤くならずに、行だけ変わる」**なので、ここで下限を見る。
 * `subset.py` の `STRUT_FILL` を抜くと、ここが落ちる。
 *
 * ## なぜ「空振りを数える道具」と別にするか
 *
 * 空振りそのものを数えるのは `tools/sprites/fontwaste.mjs` で、あちらは
 * **面の数だけブラウザの context を作り直す**（147面で30分）。毎 PR では回らない。
 * ここは**この直しが外れたことだけ**を、読むだけで見つける。
 *
 * ## 対照（`docs/island-standards.md` §15）
 *
 * 足は4本（1本・1本だけ・下限・上限）あるので、対照も4つ
 * （`merge` / `twin` / `gone` / `thin`）。1本ずつ当てて、**そのたび落ちること**を
 * 見てから本物を読む。1つでも素通りしたら、本物の数字は出さずに 2 で落ちる。
 */
import { readFileSync } from "node:fs";
import { CSS, faces, holdsSpace, isStrut } from "./fontfaces.mjs";

/* 行の高さのための1本の上限。実測 792〜800B（空白＋「…」＋詰め物1字）。
   表のぶんを見込んで 3KB まで。ここを超えたら、空白の束にほかの字が
   混ざっている＝1字も描かない面がそのぶんまで払っている。 */
const MAX_B = 3 * 1024;
/* 下限。**詰め物が抜けると輪郭を持つ字が無くなり、ブラウザがその woff2 を蹴る**
   （上の見出し。空白1字だけのときの実測が 612B）。792B と 612B のあいだに置く。 */
const MIN_B = 650;

/* ブラウザが DOM に無いまま描く字（`fontfaces.mjs` の `STRUT_CPS`）。
   **空白**＝行の高さの代表、**…**＝`text-overflow: ellipsis` の三点。 */
const SPACE = 0x20;
const onlyOwn = isStrut;

/**
 * 見張りの本体。落ちた理由を並べて返す（空なら通った）。
 * @param {ReturnType<typeof faces>} all
 */
function judge(all) {
  const bad = [];
  const weights = [...new Set(all.map((f) => f.w))].sort((a, b) => a - b);
  for (const w of weights) {
    const mine = all.filter((f) => f.w === w);
    const strut = mine.filter(holdsSpace);
    if (strut.length !== 1) {
      bad.push(
        strut.length === 0
          ? `太さ ${w} に U+0020 を持つ束が無い（空白が端末の書体に落ちる）`
          : `太さ ${w} で U+0020 を持つ束が ${strut.length}本（${strut.map((f) => f.url.split("/").pop()).join(" ")}）`
      );
      continue;
    }
    const f = strut[0];
    const name = f.url.split("/").pop();
    if (!onlyOwn(f)) {
      const n = f.ranges.reduce((a, [lo, hi]) => a + (hi - lo + 1), 0);
      bad.push(`太さ ${w}: 行の高さのための束 ${name} が ${n}字ぶん持っている（U+0020 と U+2026 だけにする）`);
    }
    if (f.bytes === null) bad.push(`太さ ${w}: ${name} が焼かれていない`);
    else if (f.bytes > MAX_B) bad.push(`太さ ${w}: ${name} が ${(f.bytes / 1024).toFixed(1)}KB（上限 ${(MAX_B / 1024).toFixed(1)}KB）`);
    else if (f.bytes < MIN_B) bad.push(`太さ ${w}: ${name} が ${f.bytes}B しかない（下限 ${MIN_B}B。詰め物が抜けると ブラウザが蹴って、空白が端末の書体に落ちる）`);
  }
  return bad;
}

/* ── 対照 ───────────────────────────────────────────────────────── */
/**
 * わざと壊した束の並びをこしらえる。足を1本ずつ折る。
 *   merge … U+0020 を、かな・英数の大きな束に戻す（直す前の姿）
 *   twin  … U+0020 を持つ束を2本にする（どちらが引かれるか決まらない）
 *   gone  … U+0020 を持つ束を無くす（空白が端末の書体に落ちる）
 */
function bend(all, how) {
  const copy = all.map((f) => ({ ...f, ranges: f.ranges.map((r) => [...r]) }));
  const strut = copy.find((f) => f.w === 400 && onlyOwn(f));
  const big = copy.find((f) => f.w === 400 && !onlyOwn(f));
  if (!strut || !big) return null;
  if (how === "merge") {
    big.ranges.push([SPACE, SPACE]);
    return copy.filter((f) => f !== strut);
  }
  if (how === "twin") {
    big.ranges.push([SPACE, SPACE]);
    return copy;
  }
  if (how === "gone") return copy.filter((f) => f !== strut);
  /* thin … 詰め物を抜いた日の姿（空白1字だけで焼くと 612B になり、
     ブラウザが蹴る）。大きさでしか見分けられないので、ここで当てる */
  if (how === "thin") { strut.bytes = 612; return copy; }
  return null;
}

let css;
try {
  css = readFileSync(CSS, "utf8");
} catch (e) {
  console.log(`✕ ${CSS} が読めない: ${e.message}`);
  process.exit(2);
}
const all = faces(css);
if (all.length < 3) {
  console.log(`✕ 数えるものが無い（束 ${all.length}本）`);
  process.exit(2);
}

console.log("[対照] わざと壊した並びで、この見張りが落ちるか");
let ok = true;
for (const [how, why] of [
  ["merge", "U+0020 を大きな束に戻す"],
  ["twin", "U+0020 を持つ束を2本に"],
  ["gone", "U+0020 を持つ束を無くす"],
  ["thin", "詰め物を抜く（ブラウザが蹴る大きさ）"],
]) {
  const bent = bend(all, how);
  if (!bent) {
    console.log(`  ✕ ${how} … 壊した並びを作れなかった（いまの束の形が前提と違う）`);
    ok = false;
    continue;
  }
  const bad = judge(bent);
  console.log(`  ${bad.length ? "○" : "✕"} ${how}（${why}） → ${bad.length ? bad[0] : "**素通りした。この見張りは効いていない**"}`);
  if (!bad.length) ok = false;
}
if (!ok) {
  console.log("\n✕ 対照が外れた。**本物の数字は1つも出さない**");
  process.exit(2);
}

console.log("\n[本物]");
const bad = judge(all);
for (const w of [...new Set(all.map((f) => f.w))].sort((a, b) => a - b)) {
  const f = all.filter((x) => x.w === w).find(holdsSpace);
  console.log(
    `  太さ ${w}  ${all.filter((x) => x.w === w).length}本  行の高さの1本: ` +
    (f ? `${f.url.split("/").pop()} ${(f.bytes === null ? NaN : f.bytes / 1024).toFixed(1)}KB` : "無い")
  );
}
if (bad.length) {
  for (const b of bad) console.log(`  ✕ ${b}`);
  console.log("\n1字も描かない面が、行の高さのためだけに大きな束を引く形に戻っている（#848）。");
  console.log("`tools/fonts/subset.py` の STRUT を見て、焼き直す");
  process.exit(1);
}
console.log("○ ブラウザ自身が描く字の1本は、太さごとに1本・U+0020 と U+2026 だけ・小さいまま");
