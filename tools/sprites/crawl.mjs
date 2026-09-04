import { chromium } from "playwright-core";
import { readdirSync, statSync } from "fs";
import { join } from "path";

const root = "/home/user/live-streaming/site/.next-verify";
function walk(d, base = "") {
  let out = [];
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (f === "_next" || f === "cache" || f === "server" || f === "static") continue;
    if (statSync(p).isDirectory()) out = out.concat(walk(p, base + "/" + f));
    else if (f.endsWith(".html")) out.push(base + "/" + f);
  }
  return out;
}
const pages = walk(root).sort();

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
// このサンドボックスからは外の画像に出られないので差し替える
await ctx.route(/googleusercontent\.com|upload\.wikimedia\.org|instagram\.com|ytimg\.com|youtube\.com/,
  r => r.fulfill({ path: "/home/user/live-streaming/site/public/og.png" }));
await ctx.route(/fonts\.googleapis\.com/, r => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
const p = await ctx.newPage();
let bad = 0;
for (const page of pages) {
  const errs = [];
  const onErr = e => errs.push("JS: " + String(e).slice(0, 200));
  const onCon = m => { if (m.type() === "error" && !/island-api|Failed to load resource/.test(m.text())) errs.push("console: " + m.text().slice(0, 160)); };
  p.on("pageerror", onErr); p.on("console", onCon);
  const res = await p.goto("http://localhost:4321" + page, { waitUntil: "domcontentloaded", timeout: 45000 });
  await p.waitForTimeout(900);
  const info = await p.evaluate(() => ({
    h1: document.querySelector("h1")?.textContent?.trim().slice(0, 40) ?? null,
    links: [...document.querySelectorAll("a[href^='/']")].map(a => a.getAttribute("href")),
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
  }));
  p.off("pageerror", onErr); p.off("console", onCon);
  const flag = errs.length || !info.h1 || info.overflow || res.status() !== 200;
  if (flag) bad++;
  console.log(`${flag ? "NG" : "ok"} ${page} [${res.status()}] h1=${info.h1}${info.overflow ? " OVERFLOW" : ""}${errs.length ? " " + errs.join(" | ") : ""}`);
}
// リンク切れ確認
const all = new Set(pages.map(x => x.replace(/\.html$/, "").replace(/\/index$/, "") || "/"));
const seen = new Set();
for (const page of pages) {
  await p.goto("http://localhost:4321" + page, { waitUntil: "domcontentloaded" });
  const links = await p.$$eval("a[href^='/']", as => as.map(a => a.getAttribute("href")));
  links.forEach(l => seen.add(l.split("#")[0].replace(/\/$/, "") || "/"));
}
const missing = [...seen].filter(l => !all.has(l) && l !== "/");
console.log("\npages:", pages.length, "bad:", bad);
console.log("broken internal links:", missing.length ? missing : "none");
await b.close();
