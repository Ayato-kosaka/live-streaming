import { chromium } from "playwright-core";

/** 並列で作業するとき、エージェントごとに別のポートを使う。既定は 3000。 */
const PORT = process.env.PORT || "3000";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
p.on("pageerror", e => console.log("[pageerror]", String(e).slice(0,400)));
p.on("console", m => { if (m.type()==="error") console.log("[err]", m.text().slice(0,200)); });
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
await p.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForTimeout(5000);
console.log(await p.evaluate(() => {
  const st = document.querySelector(".stage");
  return JSON.stringify({ mode: st.dataset.mode, view: st.dataset.view, labels: document.querySelectorAll(".labels").length, imgs: document.querySelectorAll(".stage-svg image").length });
}));
await b.close();
