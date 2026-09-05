/** 住人に話しかける。合図(invite)が絵に出ているか、セリフの中身は何か。 */
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";
import { offline } from "./route.mjs";
const PORT = process.env.PORT || "3041";
mkdirSync("/tmp/r3/talk", { recursive: true });
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await offline(ctx);
await ctx.addInitScript(() => { try {
  localStorage.setItem("ayato-island-arrived", new Date(Date.now() - 12 * 86400000).toISOString().slice(0, 10));
  localStorage.setItem("ayato-island-walked", "1");
} catch (e) {} });
const p = await ctx.newPage();
await p.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 120000 });
await p.waitForTimeout(4000);
// 画面の中にいる住人を押していく
const hits = await p.$$(".who-hit");
console.log("住人の当たり:", hits.length);
const said = [];
for (let i = 0; i < hits.length; i++) {
  const bb = await hits[i].boundingBox();
  if (!bb || bb.x < 0 || bb.y < 0 || bb.x + bb.width > 390 || bb.y + bb.height > 726) { continue; }
  await hits[i].click({ force: true }).catch(() => {});
  await p.waitForTimeout(2200);
  const t = await p.evaluate(() => (document.querySelector(".talkbox p")?.textContent || "").trim());
  if (t) { said.push([Math.round(bb.width) + "x" + Math.round(bb.height), t]); await p.screenshot({ path: `/tmp/r3/talk/w${i}.png`, animations: "disabled" }); }
  await p.mouse.click(195, 700);
  await p.waitForTimeout(600);
}
for (const [sz, t] of said) console.log(sz, "|", t);
await b.close();
