/**
 * `/map/georgia` の「行った街」を、あやとが見たのと同じ 390px で撮る。
 *
 * 札は畳んであるので**閉じたまま1枚**と、**7つとも開いて1枚**の2枚を撮る。
 * 閉じたままだけを見ると「本数が出ている」と言えても、開いた先が空でも気づけない。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";

const PORT = process.env.SPORT || 4790;
const SLUG = process.argv[2] || "georgia";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
await offline(ctx);
const p = await ctx.newPage();
await p.goto(`http://127.0.0.1:${PORT}/map/${SLUG}.html`, { waitUntil: "load" });
await p.waitForTimeout(700);

const panel = p.locator("h2", { hasText: "行った街" }).locator("xpath=..");
await panel.scrollIntoViewIfNeeded();
await p.waitForTimeout(300);
await panel.screenshot({ path: `/tmp/city-${SLUG}-closed.png` });

// 札に出ている本数を、そのまま文字で読み出す（絵と数字を別々に確かめない）
const rows = await p.$$eval(".cities > *", (els) =>
  els.map((e) => [e.querySelector("b")?.textContent, e.querySelector("i")?.textContent])
);
console.log("札の字:");
for (const [c, n] of rows) console.log(`  ${c}\t${n}`);

// 全部開いて、中に配信カードが本当に入っているかを見る
await p.$$eval("details.city", (ds) => ds.forEach((d) => (d.open = true)));
await p.waitForTimeout(500);
const cards = await p.$$eval("details.city", (ds) =>
  ds.map((d) => [d.querySelector("b").textContent, d.querySelectorAll(".scard").length])
);
console.log("開いた中のカード:");
for (const [c, n] of cards) console.log(`  ${c}\t${n}枚`);
await panel.screenshot({ path: `/tmp/city-${SLUG}-open.png` });

// 390px で横にあふれていないか
const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
console.log("横あふれ:", over, "px");
await b.close();
