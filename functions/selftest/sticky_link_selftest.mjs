/**
 * **付箋に貼れるリンクが、`http(s)` だけに絞られているか。**
 *
 *   node functions/selftest/sticky_link_selftest.mjs
 *
 * 終了コード 0=通った / 1=食い違いあり / 2=切り出せなかった。
 *
 * ## なぜ1回きりの確かめで済ませないか
 *
 * ここを通った字は、画面でそのまま `<a href>` になる。`javascript:` が
 * 通ると、**付箋を読んだ人**のブラウザでその字が走る。付箋はログイン不要で
 * 誰でも貼れるので、**貼る人と読む人が別人であることが前提の口**。
 *
 * 守りは2枚ある（`islandApi.ts` の `safeLink` と、画面の `okLink`）。
 * ただし**本物の壁はサーバー側の1枚**で、画面のほうは「断られる前に言う」
 * ためのもの。だから、ここで見るのはサーバー側。
 *
 * ## 写しを持たない
 *
 * 判定の規則をこのファイルに書き写すと、**本体を直した日に、ここだけ
 * 古い規則で緑になる。** `tsc` が書き出した `functions/lib/islandApi.js`
 * から `safeLink` を切り出して回す（`clean_selftest.mjs` と同じやり方）。
 *
 * 切り出せなかったら**緑を返さない**（終了コード2）。判定が出ないときに
 * 緑を返す道具は、無いより悪い（`docs/island-standards.md` 13章）。
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const built = join(here, "..", "lib", "islandApi.js");

if (!existsSync(built)) {
  console.error(`切り出せません: ${built} がありません（先に functions で tsc を回す）`);
  process.exit(2);
}

const src = readFileSync(built, "utf8");

/* ---------------- 本体を切り出す ----------------

   **1本ずつ名前で抜かない。** `safeLink` は `clean` を呼び、`clean` は
   `dropCtrl` を呼び、`MAX_LINK_LEN` も要る。1本ずつ抜くと、依存が1つ
   増えた日に `ReferenceError` で落ちる（実際に2回落ちた）。
   `clean_selftest.mjs` と同じく、**2つの目印のあいだを丸ごと**取る。 */

const FROM = "const dropCtrl = ";
const i = src.indexOf(FROM);
const j = src.indexOf("function safeLink(");
if (i < 0 || j < 0 || j <= i) {
  console.error(`切り出せません: dropCtrl=${i} safeLink=${j}`);
  process.exit(2);
}
/* `safeLink` の終わりは、中かっこの対応で探す */
let depth = 0; let started = false; let end = -1;
for (let k = j; k < src.length; k++) {
  const c = src[k];
  if (c === "{") { depth++; started = true; }
  else if (c === "}") { depth--; if (started && depth === 0) { end = k + 1; break; } }
}
if (end < 0) { console.error("safeLink の終わりが見つかりません"); process.exit(2); }

const block = src.slice(i, end);
/* **切り出しが空振りしたら、中身を見ずに通してはいけない。**
   名前を変えた日に「0件だから合格」と出るのがいちばん危ない */
for (const need of ["const dropCtrl", "const clean =", "MAX_LINK_LEN", "function safeLink("]) {
  if (!block.includes(need)) {
    console.error(`切り出した中に ${need} が無い`);
    process.exit(2);
  }
}
console.log(`  切り出した長さ: ${block.length} 字\n`);

// eslint-disable-next-line no-new-func
const safeLink = new Function(`${block}\nreturn safeLink;`)();

/**
 * 食わせる字。
 *
 * **前方一致だけでは抜けるもの**を混ぜてある。`clean` が制御文字と
 * 前後の空白を落とすので、`java<TAB>script:` も頭の空白付きも、
 * 落としたあとは `javascript:` になる。**落とす前の字で判定すると通る。**
 */
const CASES = [
  // [字, 通ってよいか]
  ["https://example.com/a", true],
  ["http://example.com", true],
  ["https://example.com/a?b=1#c", true],
  ["javascript:alert(1)", false],
  ["JavaScript:alert(1)", false],
  ["JAVASCRIPT:alert(1)", false],
  ["data:text/html,<script>alert(1)</script>", false],
  ["vbscript:msgbox(1)", false],
  ["file:///etc/passwd", false],
  ["blob:https://example.com/x", false],
  [" javascript:alert(1)", false],
  ["java\tscript:alert(1)", false],
  ["java\nscript:alert(1)", false],
  ["\u0000javascript:alert(1)", false],
  ["/foo", false],
  ["//evil.com", false],
  ["example.com", false],
  ["", false],
  ["   ", false],
];

let bad = 0;
for (const [input, want] of CASES) {
  const got = safeLink(input);
  const passed = got !== "";
  const ok = passed === want;
  if (!ok) bad++;
  const show = JSON.stringify(input);
  console.log(
    `  ${ok ? "○" : "×"} ${want ? "通るはず" : "弾くはず"} / ${passed ? "通った" : "弾いた"}  ${show}`,
  );
}

/* **通ったものが、入れた字と同じであること。** 書き換えて返していたら、
   何に書き換わったのかが分からないまま `<a href>` に入る。 */
for (const [input, want] of CASES) {
  if (!want) continue;
  const got = safeLink(input);
  if (got !== input) {
    console.log(`  × 通ったが字が変わった: ${JSON.stringify(input)} → ${JSON.stringify(got)}`);
    bad++;
  }
}

const yes = CASES.filter(([, w]) => w).length;
console.log(`\n通るはず ${yes} / 弾くはず ${CASES.length - yes} / 食い違い ${bad}`);
process.exit(bad ? 1 : 0);
