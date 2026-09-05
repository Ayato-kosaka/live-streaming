/** はじめて来た人の5分を、実際に1手ずつ歩く。localStorage は空のまま。 */
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";
import { offline } from "./route.mjs";
const PORT = process.env.PORT || "3041";
const B = `http://localhost:${PORT}`;
mkdirSync("/tmp/r3/walk", { recursive: true });
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await offline(ctx);
const p = await ctx.newPage();
const t0 = Date.now();
const el = (s) => `[${s}]`;
const log = (m) => console.log(`${String(((Date.now() - t0) / 1000).toFixed(1)).padStart(5)}s  ${m}`);
await p.goto(B + "/", { waitUntil: "domcontentloaded", timeout: 120000 });
log("島に降りる");
// 0〜12秒、画面に出ている文字を追う
let last = "";
for (let i = 0; i < 24; i++) {
  await p.waitForTimeout(500);
  const seen = await p.evaluate(() => {
    const grab = (s) => [...document.querySelectorAll(s)].map((n) => (n.textContent || "").trim()).filter(Boolean);
    return {
      talk: grab(".talkbox, .talkbox-text, .talk-say"),
      hint: grab(".walk-hint"),
      today: grab(".today-tab, .today-body"),
      bang: document.querySelectorAll(".spot.is-on, .spot-bang").length,
      who: document.querySelectorAll(".who-hi, .who-bang, .who.is-call").length,
      arriving: !!document.querySelector(".arrive, .arriving"),
    };
  });
  const s = JSON.stringify(seen);
  if (s !== last) { log(JSON.stringify(seen, null, 0).slice(0, 420)); last = s; }
  if (i === 2) await p.screenshot({ path: "/tmp/r3/walk/t1.5s.png", animations: "disabled" });
  if (i === 6) await p.screenshot({ path: "/tmp/r3/walk/t3.5s.png", animations: "disabled" });
  if (i === 12) await p.screenshot({ path: "/tmp/r3/walk/t6.5s.png", animations: "disabled" });
  if (i === 23) await p.screenshot({ path: "/tmp/r3/walk/t12s.png", animations: "disabled" });
}
// ステージの占有率を測る
const occ = await p.evaluate(() => {
  const st = document.querySelector(".stage") || document.querySelector(".island-stage");
  if (!st) return null;
  const r = st.getBoundingClientRect();
  const area = r.width * r.height;
  let cov = 0;
  const seen = [];
  for (const n of document.querySelectorAll(".island-bar, .today, .today-tab, .poll, .stage-view, .bar-toggle, .nextup, .walk-hint, .talkbox, .ilogo, .isle-logo, .nextup-card")) {
    const b = n.getBoundingClientRect();
    if (!b.width || !b.height) continue;
    const x = Math.max(0, Math.min(r.right, b.right) - Math.max(r.left, b.left));
    const y = Math.max(0, Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top));
    if (x * y > 0) { cov += x * y; seen.push([n.className.toString().slice(0, 24), Math.round(b.width) + "x" + Math.round(b.height)]); }
  }
  return { stage: Math.round(r.width) + "x" + Math.round(r.height), pct: +(cov / area * 100).toFixed(1), seen };
});
log("ステージ占有 " + JSON.stringify(occ));
// 建物を1つ押して、1タップで入れるか
const spot = await p.$(".spot-hit");
if (spot) {
  const before = p.url();
  await spot.click({ force: true });
  await p.waitForTimeout(2600);
  log(`建物を1回押した → ${p.url() === before ? "島のまま（歩いただけ）" : "入った: " + p.url()}`);
  await p.screenshot({ path: "/tmp/r3/walk/tap1.png", animations: "disabled" });
  if (p.url() === before) {
    const mark = await p.$(".spot.is-on .spot-mark");
    if (mark) {
      const bb = await mark.boundingBox();
      log(`札が開いた ${bb ? Math.round(bb.width) + "x" + Math.round(bb.height) : "?"} → 2回目を押す`);
      await mark.click({ force: true, timeout: 8000 }).catch((e) => log("2回目が押せない: " + String(e).slice(0, 60)));
      await p.waitForTimeout(2500);
      log("2タップ後: " + p.url());
    } else log("札が見つからない");
  }
}
await b.close();
