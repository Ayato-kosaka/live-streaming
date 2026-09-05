import { chromium } from "playwright-core";
const SPORT = process.env.SPORT || "4915";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await ctx.route(/googleusercontent\.com/, r => r.fulfill({ path: "/home/user/live-streaming/site/public/characters/ayato.png" }));
const p = await ctx.newPage();
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
await p.goto(`http://localhost:${SPORT}/index.html`, { waitUntil: "load", timeout: 180000 });
await p.waitForTimeout(5000);
async function probe(label) {
  const v = await p.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const st = document.querySelector(".stage");
    const be = getComputedStyle(st, "::before"), af = getComputedStyle(st, "::after");
    return { tint: cs.getPropertyValue("--tint").trim(), glow: cs.getPropertyValue("--glow").trim(),
             beBg: be.backgroundColor, beBlend: be.mixBlendMode, afBg: af.backgroundColor, afBlend: af.mixBlendMode };
  });
  const buf = await p.screenshot({ clip: { x: 40, y: 420, width: 6, height: 6 } });
  console.log(label, JSON.stringify(v));
  return buf;
}
const px = async (buf) => {
  const { execSync } = await import("child_process");
  const fs = await import("fs");
  fs.writeFileSync("/tmp/px.png", buf);
  return execSync(`python3 -c "from PIL import Image; im=Image.open('/tmp/px.png').convert('RGB'); print(im.getpixel((3,3)))"`).toString().trim();
};
await p.evaluate(() => { document.documentElement.dataset.time = "day"; });
await p.waitForTimeout(800); console.log("昼   の地面", await px(await probe("day ")));
await p.evaluate(() => { document.documentElement.dataset.time = "night"; });
await p.waitForTimeout(1500); console.log("夜いま の地面", await px(await probe("night")));
await p.evaluate(() => {
  const s = document.createElement("style"); s.id="nt";
  s.textContent = `[data-time="night"]{--tint:rgba(30,32,96,0.62)!important;--glow:rgba(60,70,255,0.34)!important;}`;
  document.head.appendChild(s);
});
await p.waitForTimeout(1200); console.log("夜案  の地面", await px(await probe("cand ")));
await b.close();
