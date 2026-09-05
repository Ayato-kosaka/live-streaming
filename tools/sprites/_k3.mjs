// 3周目・キッチン小屋 / 伝説の丘 / 配信やぐら の検品用。撮って、縦の長さを測る。
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";

const PORT = process.env.PORT || "3021";
const OUT = process.env.OUT || "/tmp/k3";
const W = +(process.env.W || 390);
const H = +(process.env.H || 844);
const FULL = process.env.FULL === "1";
const paths = process.argv.slice(2);

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: W < 640 });
await offline(ctx);
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));

for (const path of paths) {
  const name = (path === "/" ? "top" : path.slice(1).replace(/\//g, "_"));
  try {
    await p.goto(`http://localhost:${PORT}${path}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await p.waitForTimeout(2200);
    const m = await p.evaluate(() => {
      const de = document.documentElement;
      const q = (s) => document.querySelector(s);
      const y = (s) => { const e = q(s); return e ? Math.round(e.getBoundingClientRect().top + window.scrollY) : null; };
      return {
        h: de.scrollHeight,
        screens: +(de.scrollHeight / 844).toFixed(1),
        h1: q("h1")?.textContent?.trim().slice(0, 40) ?? null,
        overflow: de.scrollWidth > de.clientWidth ? de.scrollWidth : 0,
        firstContent: y("main .zk, main .tys, main .panel, main .tile"),
      };
    });
    console.log(`${path}\t${m.h}px\t${m.screens}画面\th1=${m.h1}\tover=${m.overflow}\tcontent@${m.firstContent}`);
    await p.screenshot({ path: `${OUT}/${name}${FULL ? "-full" : ""}.png`, fullPage: FULL });
  } catch (e) {
    console.log(`${path}\tERR ${String(e).slice(0, 120)}`);
  }
}
await b.close();
