/**
 * `tools/sprites/fontabsent.mjs` の見張り（ブラウザも書き出しも要らない）。
 *
 *   node tools/sprites/fontabsent_selftest.mjs
 *
 * 終了コード 0=通った / 1=分けかたがずれた / 2=本物の absent.json が読めない。
 *
 * 当てる場面:
 * 1. 書体に字形が無い字母（ș）は数えない。字形が無くても記号（⚠ €）は赤のまま。absent に無い字（丂）も赤
 * 2. `ALLOW` の字は見送り（absent より先）
 * 3. absent.json が読めなければ何も外さない（厳しい側）
 * 4. 本物の absent.json が読める
 */
import { loadAbsent, isLetter, sortMiss } from "./fontabsent.mjs";

let ng = 0;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const absent = new Set(["ș", "ț", "⚠", "€"]);
const allow = new Set(["Ј"]);
const got = sortMiss(["ș", "⚠", "Ј", "丂", "ț", "€"], allow, absent);
if (eq(got, { miss: ["⚠", "丂", "€"], allowed: ["Ј"], absent: ["ș", "ț"] })) {
  console.log("[1] ○ 字形の無い字母は数えない。字形が無くても記号は赤・absent に無い字も赤。ALLOW は見送り");
} else {
  console.log(`[1] ✕ ${JSON.stringify(got)}`);
  ng++;
}

const strict = sortMiss(["ș"], allow, null);
if (eq(strict.miss, ["ș"])) {
  console.log("[2] ○ absent.json が読めなければ何も外さない");
} else {
  console.log(`[2] ✕ 読めないのに ${JSON.stringify(strict)}`);
  ng++;
}

const letters = ["ș", "Ș", "ă", "ǵ", "あ"].every(isLetter) && !["⚠", "€", "⇄", "◎", "7", "😀"].some(isLetter);
if (letters) {
  console.log("[3] ○ 字母と記号の見分け（ș Ș ă ǵ は字母、⚠ € ⇄ ◎ 7 😀 は違う）");
} else {
  console.log("[3] ✕ 字母と記号の見分けがずれた");
  ng++;
}

const real = loadAbsent();
if (!real) {
  console.log("!! 本物の tools/fonts/absent.json が読めない");
  process.exit(2);
}
console.log(`[4] ○ 本物の absent.json ${real.size}字`);
process.exit(ng ? 1 : 0);
