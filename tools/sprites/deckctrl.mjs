// 進行の画面（?role=ctrl）に、クイズの問い・選択肢・答えが出ていないことを数える。
//   node tools/sprites/deckctrl.mjs
// あやとは視聴者さんと一緒に答えたいので、**手元のスマホにだけは答えを出さない。**
// <script> の中身は「本文」ではないので外す。**見えている字だけ**を見る。
// （ページのソースを開けば読める。そこまでは塞いでいない）
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const FILE = path.join(ROOT, "public", "nordic_review.html");
const PAGE = pathToFileURL(FILE).href + "?role=ctrl";

// クイズの語は資料そのものから取る。手で並べると、問題を足した日に黙って漏れる
const src = fs.readFileSync(FILE, "utf8");
const words = [];
for (const m of src.matchAll(/\{ lv: "[^"]+", q: "([^"]+)", choices: \[([^\]]+)\]/g)) {
  words.push(m[1]);
  for (const c of m[2].matchAll(/"([^"]+)"/g)) words.push(c[1]);
}
if (!words.length) { console.error("クイズが1問も読めない。資料の書き方が変わった？"); process.exit(2); }

const b = await chromium.launch({ executablePath: EXE });
const page = await b.newPage({ viewport: { width: 420, height: 900 } });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
await page.goto(PAGE, { waitUntil: "load" });
await page.waitForTimeout(1000);

const r = await page.evaluate(async (words) => {
  const shown = () => {
    const c = document.body.cloneNode(true);
    c.querySelectorAll("script,style").forEach((e) => e.remove());
    return c.innerHTML + "\n" + (document.body.innerText || "");
  };
  let html = shown();
  for (let i = 0; i < window.__sceneCount; i++) {
    window.__jump(i, window.__totals[i]);
    await new Promise((r) => setTimeout(r, 10));
    html += shown();
  }
  const hit = words.filter((w) => html.includes(w));
  return { words: words.length, hit: hit.slice(0, 5), hitCount: hit.length };
}, words);
await b.close();

console.log(`クイズの語 ${r.words} 語のうち、進行の画面に出た語 ${r.hitCount} 語`, r.hit);
console.log("JSエラー", errs.length, errs.slice(0, 3));
process.exit(r.hitCount || errs.length ? 1 : 0);
