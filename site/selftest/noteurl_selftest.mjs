/**
 * **付箋の本文に打たれた URL が、押せて、危ないものは押せないか。**
 *
 *   node site/selftest/noteurl_selftest.mjs
 *
 * 終了コード 0=通った / 1=食い違いあり / 2=切り出せなかった。
 *
 * ## なぜ見張るか
 *
 * ここを通った字は、**読んだ人のブラウザで `<a href>` になる。**
 * 付箋はログイン不要で誰でも貼れるので、**貼る人と読む人が別人**。
 * `javascript:` が通ると、読んだ人のブラウザでその字が走る。
 *
 * 守りはもう1枚ある（サーバー側の `safeLink`）が、**あれは行き先の欄
 * （`n.link`）の守りで、本文は通っていない。** 本文は120字の自由な字として
 * そのまま保存される。だから**ここが本文側の1枚目で、いまのところ唯一**。
 *
 * ## 写しを持たない
 *
 * 判定の規則をこのファイルに書き写すと、本体を直した日にここだけ古い規則で
 * 緑になる。`site/lib/noteUrl.ts` を **`tsc` で組み立てて**読む
 * （`ayatoart_selftest.mjs` と同じやり方。字を正規表現で剥ぐと、
 * 剥ぎかたのほうが先に壊れる——実際に1度そうなった）。
 * 組み立てられなければ**緑を返さない**（終了コード 2）。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SITE = join(here, "..");
const SRC = join(SITE, "lib", "noteUrl.ts");
if (!existsSync(SRC)) {
  console.error(`切り出せません: ${SRC} がありません`);
  process.exit(2);
}

let cutLinks;
let okHref;
try {
  const out = mkdtempSync(join(tmpdir(), "noteurl-"));
  execFileSync(join(SITE, "node_modules", ".bin", "tsc"), [
    SRC, "--outDir", out, "--module", "commonjs", "--target", "es2022",
    "--strict", "--skipLibCheck",
  ], { stdio: "inherit" });
  const m = createRequire(import.meta.url)(join(out, "noteUrl.js"));
  cutLinks = m.cutLinks;
  okHref = m.okHref;
} catch (e) {
  console.error("組み立てられません:", e.message);
  process.exit(2);
}
for (const [n, f] of [["cutLinks", cutLinks], ["okHref", okHref]]) {
  if (typeof f !== "function") {
    console.error(`切り出せません: ${n} が関数ではありません`);
    process.exit(2);
  }
}

const BREAK = process.env.BREAK || "";
let bad = 0;
const ok = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  const good = g === w;
  console.log(`  ${good ? "○" : "✕"} ${name}: ${g}${good ? "" : `（欲しかったのは ${w}）`}`);
  if (!good) { bad++; console.log(`::error::${name}: 出た=${g} / 欲しかったのは=${w}`); }
};
/** 押せるようになった行き先だけ */
const hrefs = (s) => cutLinks(s).filter((p) => typeof p !== "string").map((p) => p.href);
/** つなぎ直した字 */
const back = (s) => cutLinks(s).map((p) => (typeof p === "string" ? p : p.href)).join("");

console.log("[1] 押せるようになる");
ok("素の https", hrefs("これ見て https://example.com"), ["https://example.com"]);
ok("http も", hrefs("http://example.com/a"), ["http://example.com/a"]);
ok("1枚に2つ", hrefs("https://a.test と https://b.test"), ["https://a.test", "https://b.test"]);
ok("問い合わせの記号は URL の中", hrefs("https://x.test/a?b=1&c=2#d"), ["https://x.test/a?b=1&c=2#d"]);

console.log("[2] **危ないものは押せない**");
for (const s of [
  "javascript:alert(1)",
  "JavaScript:alert(1)",
  " javascript:alert(1)",
  "java\tscript:alert(1)",
  "data:text/html;base64,PHNjcmlwdD4=",
  "vbscript:msgbox(1)",
  "file:///etc/passwd",
]) ok(`押せない: ${s.slice(0, 28)}`, hrefs(s), []);

console.log("[3] 終わりの約物を飲み込まない");
ok("句点", hrefs("見てね https://example.com。"), ["https://example.com"]);
ok("閉じ括弧（全角）", hrefs("（https://example.com）"), ["https://example.com"]);
ok("閉じ括弧（半角）", hrefs("(https://example.com)"), ["https://example.com"]);
ok("読点と感嘆符", hrefs("https://example.com、すごい！"), ["https://example.com"]);
ok("かぎ括弧", hrefs("「https://example.com」"), ["https://example.com"]);

console.log("[4] **字を1文字も変えない**");
for (const s of [
  "これ見て https://example.com。すごい",
  "改行\nも\nそのまま https://a.test",
  "URL のない字",
  "（https://example.com）と（https://b.test）",
  "   前後の空白は Wrote が整える   ",
]) ok(`つなぎ直すと元に戻る: ${s.slice(0, 18).replace(/\n/g, "⏎")}`, back(s), s);

console.log("[5] URL でない字はそのまま");
ok("http とだけ書いた", hrefs("http"), []);
ok("ドメインだけ", hrefs("example.com"), []);
ok("空", hrefs(""), []);

console.log("[6] **2枚目の守りを、直に呼んで確かめる**");
// [2] は `cutLinks` ごしなので、1枚目（`URL_RE` が `https?://` しか拾わない）が
// 先に弾く。**それだと `okHref` を丸ごと消しても緑のまま**になる
// （対照で実際にそうなった）。ここは `okHref` を直に呼ぶ。
for (const s of [
  "javascript:alert(1)", "JavaScript:alert(1)", " javascript:alert(1)",
  "java\tscript:alert(1)", "data:text/html,<script>", "vbscript:msgbox(1)",
  "file:///etc/passwd", "ftp://example.com", "//example.com", "/島の中へ",
]) ok(`2枚目が弾く: ${s.slice(0, 26)}`, okHref(s), false);
ok("2枚目は https を通す", okHref("https://example.com"), true);
ok("2枚目は http を通す", okHref("http://example.com"), true);

console.log("");
console.log(bad ? `✕ ${bad}件 落ちた` : "○ ぜんぶ通った");
process.exit(bad ? 1 : 0);
