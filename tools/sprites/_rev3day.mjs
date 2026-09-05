/** 毎日の1周（2回目以降の人）。45秒ながめて、島のほうから何が起きるかを記録する。 */
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";
import { offline } from "./route.mjs";
const PORT = process.env.PORT || "3041";
mkdirSync("/tmp/r3/day", { recursive: true });
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await offline(ctx);
// きのう来た人。到着演出は出さず、名乗りも出ない
await ctx.addInitScript(() => { try {
  const d = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  localStorage.setItem("ayato-island-arrived", d);
  localStorage.setItem("ayato-island-walked", "1");
} catch (e) {} });
const p = await ctx.newPage();
const t0 = Date.now();
const log = (m) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s ${m}`);
await p.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 120000 });
log("降りる");
let last = "";
const seenTalk = new Set();
for (let i = 0; i < 90; i++) {
  await p.waitForTimeout(500);
  const s = await p.evaluate(() => ({
    talk: (document.querySelector(".talkbox p")?.textContent || "").trim(),
    names: document.querySelectorAll(".who-name").length,
    chat: document.querySelectorAll('.who[data-mood="chat"], .who.is-chat').length,
    invite: document.querySelectorAll(".who.is-invite, .who-invite, .who[data-invite]").length,
    marks: [...document.querySelectorAll(".spot-mark")].filter((n) => getComputedStyle(n).visibility === "visible").length,
    today: !!document.querySelector(".today.is-open, .today[open]"),
    poll: (document.querySelector(".poll, .poll-ask")?.textContent || "").trim().slice(0, 50),
    odd: document.querySelectorAll(".find, .drop, .oddity, .today-find").length,
  }));
  if (s.talk && !seenTalk.has(s.talk)) { seenTalk.add(s.talk); log("吹き出し: " + s.talk.slice(0, 70)); }
  const k = `${s.names}|${s.chat}|${s.invite}|${s.marks}|${s.today}|${s.poll}|${s.odd}`;
  if (k !== last) { log(k); last = k; }
}
await p.screenshot({ path: "/tmp/r3/day/end.png", animations: "disabled" });
await b.close();
