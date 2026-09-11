/**
 * あやとの机の「キャラ」を、**本番のバイト列で**開いて撮る。
 *
 *   node tools/sprites/shot-desk-chara.mjs
 *
 * 旅のあいだ、スマホからここだけで絵を足したり落としたりする面。
 * **この箱では本物のログインができない**ので、`asme.mjs` であやととして開く。
 *
 * ## 数える前に、いちばん下まで送る
 *
 * 一覧は 5,459px あって、絵は `loading="lazy"`。送らずに数えると
 * **画面のぶんしか読み込まれていない**（実測 39/95）ので、
 * 「56枚落ちた」と読んでしまう。送ってから数えると 95/95。
 */
import { chromium } from "playwright-core";
import { viaCurl, ORIGIN } from "./prod.mjs";
import { apply } from "./asme.mjs";

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await viaCurl(ctx);
await apply(ctx, { admin: true });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(String(e).slice(0, 90)));
await p.goto(`${ORIGIN}/me/desk`, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(12000);
// 「キャラ」の札を押す
const tab = await p.$$("button, a");
let hit = false;
for (const t of tab) {
  const s = (await t.textContent())?.trim();
  if (s === "キャラ") { await t.click(); hit = true; break; }
}
console.log("「キャラ」の札:", hit ? "押した" : "**見つからない**");
await p.waitForTimeout(8000);
/* **いちばん下まで送ってから数える。** 一覧は 5,459px あって、絵は
   `loading="lazy"`。送らずに数えると画面のぶんしか読み込まれていない
   （実測 39/95）ので「56枚落ちた」と読んでしまう。 */
await p.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 500) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 120));
  }
  window.scrollTo(0, 0);
});
await p.waitForTimeout(25000);
const r = await p.evaluate(() => {
  const imgs = [...document.querySelectorAll("img")].filter((i) => /island-api\/characters\/|firebasestorage/.test(i.currentSrc || i.src));
  return {
    行: document.querySelectorAll(".ch-row, .ch-list li, [class*=ch-]").length,
    絵: `${imgs.filter((i) => i.naturalWidth > 0).length}/${imgs.length}`,
    さがす欄: !!document.querySelector(".ch-find"),
    字: document.body.innerText.replace(/\n+/g, " / ").slice(0, 200),
    高さ: document.body.scrollHeight,
    よこあふれ: document.documentElement.scrollWidth > window.innerWidth,
  };
});
console.log(JSON.stringify(r, null, 1));
if (errs.length) console.log("JSエラー:", errs.slice(0, 3));
await p.screenshot({ path: "/tmp/shots/desk-chara.png" });
await b.close();
