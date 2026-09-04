import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
await p.goto("http://localhost:3000/", { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForTimeout(3000);
const r = await p.evaluate(() => new Promise(res => {
  const i = new Image();
  i.onload = () => res("load " + i.naturalWidth);
  i.onerror = (e) => res("error");
  i.src = "https://lh3.googleusercontent.com/d/18okO58dwMaci-9R1go0Rj1dTqliSWlz3=s160";
  setTimeout(() => res("timeout"), 8000);
}));
console.log("manual image:", r);
await b.close();
