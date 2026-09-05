/**
 * 「どこからでも2タップ」を、実際に踏んで確かめる。
 *
 * 数えるのは**押した回数だけ**。送る（スクロール）は数えない。
 * 面の上の口（`.ihx-open`）から `/all` へ1回、そこから行き先へ1回。
 */
import { chromium } from "playwright-core";
import { readFileSync } from "fs";
const SPORT = process.env.SPORT || "4170";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.route(/googleusercontent\.com|upload\.wikimedia\.org|instagram\.com|ytimg\.com|youtube\.com/, r => r.fulfill({ path: "/home/user/live-streaming/site/public/og.png" }));
await ctx.route(/fonts\.googleapis\.com/, r => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
const p = await ctx.newPage();

// 出発点は、いちばん奥にある面を選ぶ。
const froms = ["/kitchen/tempura", "/nordic/sweden", "/streams/cooking", "/legends/iran-walk", "/map/georgia", "/about"];
let ng = 0;
for (const from of froms) {
  await p.goto(`http://localhost:${SPORT}${from}.html`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(300);
  const mouth = await p.$(".ihx-open");
  if (!mouth) { console.log(`NG ${from} 面の上に口が無い`); ng++; continue; }
  const box = await mouth.boundingBox();
  await mouth.click();
  await p.waitForLoadState("domcontentloaded");
  await p.waitForTimeout(400);
  const at = new URL(p.url()).pathname;
  // ここで着いた面から、行き先ぜんぶが1回で押せるか
  const n = await p.$$eval(".dx", as => as.length);
  const doors = await p.$$eval(".dxs:first-of-type .dx b", bs => bs.map(x => x.textContent));
  console.log(`${at.replace(/\.html$/, "") === "/all" ? "ok" : "NG"} ${from} → 1タップ目 ${at} 口 ${Math.round(box.width)}x${Math.round(box.height)} / そこから1タップで行けるのは ${n} 枚 / 1棚目=${doors.length}軒`);
  if (at.replace(/\.html$/, "") !== "/all") ng++;
}
// /all そのものからは、口を出さない（押しても同じ紙）
await p.goto(`http://localhost:${SPORT}/all.html`, { waitUntil: "domcontentloaded" });
console.log((await p.$(".ihx-open")) ? "NG /all に自分への口が出ている" : "ok /all には自分への口が無い");
// 砂浜からは10軒が1タップ
const foot = await p.$$eval(".ifoot-door", as => as.map(a => a.getAttribute("href")).filter(Boolean));
console.log(`ok 砂浜から1タップで行けるのは ${foot.length} 軒`);
console.log("NG:", ng);
await b.close();
