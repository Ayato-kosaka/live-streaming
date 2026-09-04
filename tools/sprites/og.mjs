/**
 * 共有カード(og.png)を、島そのものから作る。
 *   node tools/sprites/og.mjs [URL]
 * 島の絵を変えたら、これを流し直して site/public/og.png を更新する。
 */
import { chromium } from "playwright-core";
import fs from "node:fs";

const url = process.argv[2] ?? "http://localhost:3111/";
const b = await chromium.launch({
  executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await p.goto(url, { waitUntil: "load", timeout: 60000 });
// 演出とUIを止めて、島と見出しだけにする
await p.addStyleTag({
  content: `
    .arrive, .walk-hint, .zoom-toggle, .scroll-cue, .labels { display: none !important; }
    nextjs-portal { display: none !important; }
    .stage { height: 630px !important; min-height: 0 !important; }
    * { animation-play-state: paused !important; }
  `,
});
await p.waitForTimeout(4000);
const cdp = await p.context().newCDPSession(p);
const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
fs.writeFileSync("../../site/public/og.png", Buffer.from(data, "base64"));
console.log("site/public/og.png を作り直しました");
await b.close();
