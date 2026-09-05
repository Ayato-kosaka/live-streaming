import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.route(/upload\.wikimedia\.org/, r => r.fulfill({ path: "/home/user/live-streaming/site/public/og.png" }));
// 足代の合計。飛行機13,000 + クラクフ(値段未定でここで止まる) なので、
// 値段が入っている区間だけに流れる。止まる前に届くのは飛行機だけ。
await ctx.route(/\/island-api\/fund/, r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ total: 40000, people: 18 }) }));
// 道しるべ。3区間ぶん貼られていることにする
await ctx.route(/\/island-api\/ideas/, r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ideas: [
  { id: "1", text: "【区間:kutaisi-katowice】空港で朝を待つところを撮ってほしい", name: "たくや", votes: 3, at: 0 },
  { id: "2", text: "【区間:tallinn-helsinki】船の上でごはんを食べてほしい", name: "", votes: 1, at: 0 },
  { id: "3", text: "【区間:vilnius-riga】十字架の丘に寄ってほしい", name: "みか", votes: 7, at: 0 },
] }) }));
await ctx.route(/\/island-api\/state/, r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ current: { place: "ワルシャワ" } }) }));
const p = await ctx.newPage();
p.on("pageerror", e => console.log("[pageerror]", String(e.stack || e).slice(0, 300)));
await p.goto("http://localhost:3015/nordic", { waitUntil: "domcontentloaded", timeout: 90000 });
await p.waitForTimeout(3000);
console.log("is-tied", await p.evaluate(() => [...document.querySelectorAll(".nmap .nm-leg.is-tied")].map(e => e.dataset.leg)));
console.log("is-done", await p.evaluate(() => [...document.querySelectorAll(".nmap .nm-leg.is-done")].map(e => e.dataset.leg)));
console.log("読み上げ", await p.evaluate(() => [...document.querySelectorAll(".rtie")].slice(0,4).map(e => e.textContent.trim())));
console.log("人数", await p.evaluate(() => document.querySelector(".carried")?.textContent.trim()));
console.log("足代", await p.evaluate(() => [...document.querySelectorAll(".fare-got, .fare-full, .fare-todo")].slice(0,4).map(e => e.textContent.trim())));
const box = await p.locator("svg.nmap").boundingBox();
await p.evaluate(y => window.scrollTo(0, y), box.y - 40);
await p.waitForTimeout(500);
await p.screenshot({ path: "/tmp/n2/tie-live.png" });
await b.close();
