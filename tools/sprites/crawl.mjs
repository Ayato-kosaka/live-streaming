/**
 * すべてのページを開いて、コンソールのエラーと 404 を洗い出す。
 *   node tools/sprites/crawl.mjs [ベースURL]
 */
import { chromium } from "playwright-core";

const base = process.argv[2] ?? "http://localhost:3111";
const b = await chromium.launch({
  executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
// 外向きの画像は、この環境だと落ちるので数えない
await p.route(/lh3\.googleusercontent\.com|i\.ytimg\.com|fonts\.g/, (r) => r.abort());

const seen = new Set(["/"]);
const queue = ["/"];
const problems = [];
while (queue.length) {
  const path = queue.shift();
  const errs = [];
  // ブラウザの「404でした」だけの行は、どのURLか分からないので数えない。
  // 実際の 404 は onRes のほうで URL 付きで拾う。
  const onErr = (m) => {
    const t = m.text();
    if (m.type() === "error" && !/Failed to load resource/.test(t)) errs.push(t.slice(0, 160));
  };
  const onPage = (e) => errs.push("PAGEERROR " + String(e).slice(0, 160));
  // /island-api はローカルには無いので数えない(本番では Hosting が中継する)
  const onRes = (r) => {
    const u = r.url();
    if (r.status() >= 400 && u.startsWith(base) && !u.includes("/island-api/")) {
      errs.push(`${r.status()} ${u.slice(base.length)}`);
    }
  };
  p.on("console", onErr); p.on("pageerror", onPage); p.on("response", onRes);
  await p.goto(base + path, { waitUntil: "load", timeout: 60000 });
  await p.waitForTimeout(1500);
  p.off("console", onErr); p.off("pageerror", onPage); p.off("response", onRes);
  const real = errs.filter((e) => !/net::ERR_FAILED|ERR_ABORTED|island-api/.test(e));
  if (real.length) problems.push([path, [...new Set(real)]]);
  for (const href of await p.$$eval("a[href^='/']", (as) => as.map((a) => a.getAttribute("href")))) {
    if (href && !seen.has(href)) { seen.add(href); queue.push(href); }
  }
}
console.log(`見たページ: ${seen.size}`);
if (!problems.length) console.log("エラーなし");
for (const [path, errs] of problems) console.log("\n##", path, "\n  " + errs.join("\n  "));
await b.close();
