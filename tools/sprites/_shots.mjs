// 一時。CSSの周回用に、1本のブラウザで複数ページを撮る。使い終わったら消す。
import { chromium } from "playwright-core";
const PORT = process.env.PORT || "3018";
const OUT = process.argv[2] || "/tmp/u2";
const W = +(process.argv[3] || 390);
const H = +(process.argv[4] || 1500);
const paths = (process.argv[5] || "/about,/streams,/kitchen,/legends,/map,/apps,/friends,/now,/next,/board,/design").split(",");
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: W < 640 });
await ctx.route(/googleusercontent\.com/, r => r.fulfill({ path: "/home/user/live-streaming/site/public/characters/ayato.png" }));
await ctx.route(/upload\.wikimedia\.org/, r => r.fulfill({ path: "/home/user/live-streaming/site/public/og.png" }));
const p = await ctx.newPage();
p.on("pageerror", e => console.log("[pageerror]", String(e).slice(0, 200)));
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
for (const path of paths) {
  const name = path.replace(/^\//, "").replace(/\//g, "_") || "top";
  try {
    await p.goto(`http://localhost:${PORT}${path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.waitForTimeout(2200);
    await p.screenshot({ path: `${OUT}/${name}.png` });
    console.log("ok", path);
  } catch (e) { console.log("NG", path, String(e).slice(0, 120)); }
}
await b.close();
