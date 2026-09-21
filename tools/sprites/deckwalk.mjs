// 振り返り資料（public/nordic_review.html）を全区画・全ステップ歩く。
//   node tools/sprites/deckwalk.mjs
// 見るもの: はみ出し（横・下・上）/ JSエラー / 絵文字 / 各区画の最後の1枚
// **終了コードで判定する**（0=見つからなかった / 1=見つかった）。行の見た目で判断しない。
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const PAGE = pathToFileURL(path.join(ROOT, "public", "nordic_review.html")).href;
const OUT = process.env.SHOTS || "/tmp/deckshots";
fs.mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({ executablePath: EXE });
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });
await page.goto(PAGE, { waitUntil: "load" });
await page.waitForTimeout(600);

const count = await page.evaluate(() => window.__sceneCount);
const totals = await page.evaluate(() => window.__totals);
console.log("区画", count, "ステップ", JSON.stringify(totals));

// 切り替えの見た目（0.32秒）を待つと 3 分かかる。**測るのは位置だけ**なので
// 出方の transition を止めて、1フレームだけ待って測る。
const res = await page.evaluate(async () => {
  document.querySelectorAll("*").forEach((e) => (e.style.transition = "none"));
  const bad = [], emoji = [];
  const re = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F900}-\u{1F9FF}]/u;
  for (let s = 0; s < window.__sceneCount; s++) {
    for (let st = 0; st <= window.__totals[s]; st++) {
      window.__jump(s, st);
      await new Promise((r) => requestAnimationFrame(r));
      const stage = document.getElementById("stage");
      let R = 0, B = 0, T = 0;
      for (const el of stage.querySelectorAll("*")) {
        const r = el.getBoundingClientRect();
        if (!r.width && !r.height) continue;
        R = Math.max(R, r.right - innerWidth);
        B = Math.max(B, r.bottom - innerHeight);
        T = Math.max(T, -r.top);
      }
      if (R > 1 || B > 1 || T > 1) bad.push({ s, st, R: Math.round(R), B: Math.round(B), T: Math.round(T) });
      const t = stage.textContent || "";
      if (re.test(t)) emoji.push({ s, st, c: t.match(re)[0] });
    }
  }
  return {
    bad, emoji,
    scrollX: document.documentElement.scrollWidth - innerWidth,
    scrollY: document.documentElement.scrollHeight - innerHeight,
  };
});

// 1枚ずつ撮るのは、数が通ったあと。**撮った絵は必ず自分で見る**（island-design 7章）
for (let s = 0; s < count; s++) {
  await page.evaluate(([a, b]) => window.__jump(a, b), [s, totals[s]]);
  await page.waitForTimeout(90);
  await page.screenshot({ path: `${OUT}/s${String(s).padStart(2, "0")}.png` });
}
await b.close();

console.log("はみ出し", res.bad.length, JSON.stringify(res.bad.slice(0, 8)));
console.log("絵文字", res.emoji.length, JSON.stringify(res.emoji.slice(0, 5)));
console.log("横スクロール", res.scrollX, "縦スクロール", res.scrollY);
console.log("JSエラー", errs.length, errs.slice(0, 5));
console.log("絵は", OUT);
const ng = res.bad.length || res.emoji.length || errs.length || res.scrollX > 0 || res.scrollY > 0;
process.exit(ng ? 1 : 0);
