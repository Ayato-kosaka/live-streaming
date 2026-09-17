/**
 * パンくず（`.crumbs`）の寸法を全面ぶん出す。直す前と後で突き合わせるため。
 *
 *   DIST=…/site/.next-3230 SPORT=4230 node tools/sprites/crumbwidth.mjs > before.json
 *   （直してビルドし直してから）                                        > after.json
 *
 * `.crumbs` は 100 面以上に出る共通の部品なので、**余白を 1px 動かすと
 * 面の寸法が動く。** 押しどころが 48px になっても、別の面で折り返して
 * 段が増えていたら不合格。幅・高さ・行の高さ・横あふれを出して見比べる。
 *
 * ページ全体の高さ（docH）は、島や配信の中身が日によって変わるので
 * ±80px ほど揺れる。**そこは揺れとして読む。** 見るのは `w` と `h`。
 */
import { chromium } from "playwright-core";
import { readdirSync, statSync } from "fs";
import { join } from "path";
import { repoPath } from "./repo.mjs";
const SPORT = process.env.SPORT || "4230";
const root = process.env.DIST;
function walk(d, base = "") { let out = []; for (const f of readdirSync(d)) { if (["_next","cache","server","static"].includes(f)) continue; const p = join(d, f); if (statSync(p).isDirectory()) out = out.concat(walk(p, base + "/" + f)); else if (f.endsWith(".html")) out.push(base + "/" + f); } return out; }
const pages = walk(root).sort();
const W = Number(process.env.W || 390);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
const ctx = await b.newContext({ viewport: { width: W, height: 900 }, isMobile: W<700, hasTouch: W<700 });
await ctx.route(/googleusercontent\.com|upload\.wikimedia\.org|instagram\.com|ytimg\.com|youtube\.com/, r => r.fulfill({ path: repoPath("site/public/og.png") }));
await ctx.route(/fonts\.googleapis\.com/, r => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
const p = await ctx.newPage();
const out = {};
for (const path of pages) {
  await p.goto(`http://localhost:${SPORT}${path}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await p.waitForTimeout(150);
  const r = await p.evaluate(() => { const n = document.querySelector(".crumbs"); const wr = document.querySelector(".wayrow"); if (!n) return null; const b = n.getBoundingClientRect(); const m = document.querySelector("main.page"); return { w: Math.round(b.width*10)/10, h: Math.round(b.height*10)/10, avail: m? Math.round(m.getBoundingClientRect().width) : 0, rowh: wr? Math.round(wr.getBoundingClientRect().height*10)/10 : 0, docH: Math.round(document.documentElement.scrollHeight), over: document.documentElement.scrollWidth - innerWidth }; });
  if (r) out[path] = r;
}
console.log(JSON.stringify(out));
await b.close();
