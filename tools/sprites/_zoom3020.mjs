// 自分が描いた絵だけを大きく撮って、線の作りを目で確かめるための道具（担当ぶんの一時ファイル）。
import { chromium } from "playwright-core";

// 開発サーバに向けるときは DEVPORT を渡す（書き出したものは末尾に / が要る）
const dev = !!process.env.DEVPORT;
const PORT = process.env.DEVPORT || process.env.SPORT || "8920";
const base = `http://localhost:${PORT}`;
const s = dev ? "" : "/";
const shots = [
  [`/friends${s}`, ".phead-mark", "/tmp/shots3020/z_friendsmark.png"],
  [`/next${s}`, ".nx-notice", "/tmp/shots3020/z_notice.png"],
  [`/next${s}`, ".nx-road > li", "/tmp/shots3020/z_stone.png"],
  [`/board${s}`, ".bd-flow", "/tmp/shots3020/z_flow.png"],
  [`/friends${s}`, ".rz-card", "/tmp/shots3020/z_rzcard.png"],
];

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 4, isMobile: true });
await ctx.route(/googleusercontent\.com/, (r) =>
  r.fulfill({ path: "/home/user/live-streaming/site/public/characters/ayato.png" }),
);
await ctx.route(/upload\.wikimedia\.org/, (r) => r.fulfill({ path: "/home/user/live-streaming/site/public/og.png" }));
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));

for (const [url, sel, out] of shots) {
  await p.goto(base + url, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1200);
  const el = await p.$(sel);
  if (!el) {
    console.log("not found", sel, "on", url);
    continue;
  }
  await el.screenshot({ path: out });
  console.log("ok", out);
}
await b.close();
