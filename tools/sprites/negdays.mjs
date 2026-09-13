/**
 * 全ページを、旅の先の日付で開いて「嘘になりうる字」だけを拾う。調査用（読むだけ）。
 *
 *   DIST=... SPORT=4220 ISO=2026-09-30T10:00:00Z node negdays.mjs
 */
import { chromium } from "playwright-core";
import { readdirSync, statSync } from "fs";
import { join } from "path";

const SPORT = process.env.SPORT || "4220";
const root = process.env.DIST || "/home/user/live-streaming/site/.next-3220";
const ISO = process.env.ISO || "2026-09-30T10:00:00Z";

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

/** 見つけたら報告する言い回し */
const PATTERNS = [
  /あと\s*-\s*\d+/,        // 負のカウントダウン
  /あと\s*−\s*\d+/,
  /-\d+\s*日/,
  /まであと/,               // 過ぎた日を「これから」と言っていないか、目で見る
];

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.route(/googleusercontent\.com|upload\.wikimedia\.org|instagram\.com|ytimg\.com|youtube\.com/,
  r => r.fulfill({ path: "/home/user/live-streaming/site/public/og.png" }));
await ctx.route(/fonts\.googleapis\.com/, r => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
await ctx.addInitScript(`(() => {
  const FAKE = ${Date.parse(ISO)};
  const RealDate = Date;
  const start = RealDate.now();
  function shift() { return FAKE + (RealDate.now() - start); }
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(shift()); else super(...a); }
    static now() { return shift(); }
    static parse(...a) { return RealDate.parse(...a); }
    static UTC(...a) { return RealDate.UTC(...a); }
  }
  Object.defineProperty(FakeDate, "name", { value: "Date" });
  globalThis.Date = FakeDate;
})();`);
const p = await ctx.newPage();
console.log(`ISO=${ISO} pages=${pages.length}`);
for (const page of pages) {
  await p.goto(`http://localhost:${SPORT}` + page, { waitUntil: "domcontentloaded", timeout: 45000 });
  await p.waitForTimeout(1100);
  const txt = await p.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
  for (const re of PATTERNS) {
    const m = txt.match(new RegExp(`.{0,50}${re.source}.{0,50}`));
    if (m) console.log(`  ${page} :: ${m[0].trim()}`);
  }
}
await b.close();
