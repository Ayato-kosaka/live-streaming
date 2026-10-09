/**
 * `components/me/stampShow.ts` の確かめ（#716）。
 *
 *     node site/selftest/stampshow_selftest.mjs
 *
 * ## なぜ要るか
 *
 * `/me` は**ログインしないと1行も描かない。** だからこの箱のブラウザでは
 * 「選ばれていない人の画面」を開けず、**余計なものが出ていても誰も見ない
 * まま出せてしまう。**
 *
 * そして出てしまったら取り返しがつかない。25人は投げ銭の順位そのもので
 * （`docs/island-money.md`）、「あなたは選ばれていません」を1度見せたら、
 * その人はもう知っている。
 *
 * ## 何を見ているか
 *
 * 出すか出さないかの判断を、**起こりうる組み合わせぜんぶ**に当てる。
 *
 *   1. **選ばれていない人には、どの段でも何も出ない**（待ち・読めた・落ちた）
 *   2. 読み込み中は、選ばれている人にも出さない（灰色の骨も出さない）
 *   3. 読めなかったとき、**一度も見えたことのない端末には何も出さない**
 *   4. 一度でも見えた端末だけ「もう一度よみこむ」が出る（§10）
 *   5. 欄には必ず1つ以上入る（提案が0本でも、空の欄1つ）
 *
 * ## 探し方が当たることを、先に見る（`docs/island-misses.md` #19）
 *
 * 「何も出ない」は、**判断がいつも `nothing` を返しても通る。**
 * だから先に「選ばれた人には出る」ことを見てから、出ないほうを見る。
 *
 * 終了コード: 0=通った / 1=食い違った / 2=数えるものが無い
 */
import { createRequire } from "module";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ts = require("typescript");

const src = join(here, "..", "components", "me", "stampShow.ts");
const code = ts.transpileModule(readFileSync(src, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = { exports: {} };
new Function("exports", "require", "module", code)(
  mod.exports, require, mod,
);
const { phase, startLines } = mod.exports;

if (typeof phase !== "function" || typeof startLines !== "function") {
  console.error("stampShow.ts から phase / startLines を取り出せなかった");
  process.exit(2);
}

let bad = 0;
let seen = 0;

/**
 * 1件の確かめ。
 * @param {string} name 何を見ているか
 * @param {unknown} got 出たもの
 * @param {unknown} want ほしいもの
 */
function eq(name, got, want) {
  seen += 1;
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a === b) {
    console.log(`  ok   ${name}`);
    return;
  }
  bad += 1;
  console.log(`  NG   ${name} — ${a} ≠ ${b}`);
}

/* ---------------- 0. 探し方が当たるか（先に見る） ---------------- */

console.log("# 0. 選ばれた人には、ちゃんと出る（0件が空振りでない）");
eq("読めて、入っている → 1枚出る", phase("ok", true, false), "panel");
eq("控えが在っても、読めていれば1枚", phase("ok", true, true), "panel");

/* ---------------- 1. 選ばれていない人 ---------------- */

console.log("\n# 1. 選ばれていない人には、どの段でも何も出ない");
for (const st of ["wait", "ok", "down"]) {
  for (const seenHere of [false, true]) {
    /* **`seen` が立っていても出さない。** 控えは「自分が入っている」と
       分かった端末にしか立たないので、立っていてここが `ok` で
       `picked: false` なら、入れ物から外れたということ。
       そのときに札を出すと「外された」と言うことになる */
    const want = st === "down" && seenHere ? "readagain" : "nothing";
    eq(`${st} / 控え ${seenHere} → ${want}`, phase(st, false, seenHere), want);
  }
}
eq("読めて、入っていない → 何も出さない", phase("ok", false, false), "nothing");
eq("読めて、入っていない（控えあり）→ 何も出さない",
  phase("ok", false, true), "nothing");

/* ---------------- 2. 読み込み中 ---------------- */

console.log("\n# 2. 読み込み中は、誰の画面にも出さない");
eq("待ち / 入っている", phase("wait", true, false), "nothing");
eq("待ち / 入っている（控えあり）", phase("wait", true, true), "nothing");
eq("待ち / 入っていない", phase("wait", false, true), "nothing");

/* ---------------- 3. 読めなかったとき ---------------- */

console.log("\n# 3. 読めなかったとき");
eq("一度も見えていない端末 → 何も出さない",
  phase("down", true, false), "nothing");
eq("一度でも見えた端末 → もう一度よみこむ",
  phase("down", true, true), "readagain");
/* **`picked` は見ていない。** 落ちた回は入れ物を引けていないので、
   そこで `picked` を当てにすると「読めていない値」で画面を決めることになる */
eq("落ちた回は picked を見ない（控えだけで決まる）",
  phase("down", false, true), phase("down", true, true));

/* ---------------- 4. 欄に入れることば ---------------- */

console.log("\n# 4. 欄には必ず1つ以上入る");
eq("決めてあるものが勝つ",
  startLines(["きめた"], ["ていあん"]), ["きめた"]);
eq("決めていなければ、提案の1本目",
  startLines([], ["ていあん1", "ていあん2"]), ["ていあん1"]);
eq("提案が0本でも、空の欄が1つ", startLines([], []), [""]);
eq("空白だけの提案は飛ばす", startLines([], ["  ", "ほんもの"]), ["ほんもの"]);
eq("提案が空白だけなら、空の欄が1つ", startLines([], ["   "]), [""]);
eq("決めてあるものは何本でもそのまま",
  startLines(["あ", "い", "う", "え"], ["ていあん"]),
  ["あ", "い", "う", "え"]);

console.log("");
if (seen === 0) {
  console.log("数えるものがありませんでした。");
  process.exit(2);
}
if (bad > 0) {
  console.log(`NG が ${bad} 件 / 見た ${seen} 件。`);
  process.exit(1);
}
console.log(`ぜんぶ通った（${seen} 件）。`);
