/**
 * 歩ける島を5つ、スマホと PC で撮る。
 *
 *   SPORT=4140 node isleshot.mjs
 *   SPORT=4140 WALK=1 node isleshot.mjs   歩かせて、建物の札を開いてから撮る
 *
 * 住人の絵はブラウザから取れないので、先に `python3 avatars.py` で落として
 * `route.mjs` の offline() が1人ずつ返す。落とさずに撮ると全員同じ絵になる。
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";
import { offline } from "./route.mjs";

const SPORT = process.env.SPORT || "4140";
const BASE = `http://localhost:${SPORT}`;
const OUT = process.env.OUT || "/tmp/isle";
const WALK = process.env.WALK === "1";
const SHEET = process.env.SHEET === "1";
const PAGES = (process.env.PAGES || "/island/europe,/island/middle-east,/island/iran-walk,/island/nordic,/").split(",");

mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

for (const wide of [false, true]) {
  const ctx = await b.newContext(
    wide
      ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }
      : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
  );
  await offline(ctx, { photo: "/home/user/live-streaming/tools/sprites/photo-480.jpg" });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("ayato-island-arrived", "2026-09-04");
      localStorage.setItem("ayato-island-walked", "1");
      localStorage.setItem("ayato-island-today", "2026-09-05");
    } catch {}
  });
  for (const path of PAGES) {
    const p = await ctx.newPage();
    const errs = [];
    p.on("pageerror", (e) => errs.push(String(e)));
    const url = BASE + (path === "/" ? "/index.html" : `${path}.html`);
    await p.goto(url, { waitUntil: "load", timeout: 60000 });
    await p.waitForTimeout(2600);
    if (WALK) {
      // 島のまん中あたりを2回押して歩かせる。カメラが動いているところを見る
      const st = await p.$(".isle, .stage");
      const bb = st && (await st.boundingBox());
      if (bb) {
        await p.mouse.click(bb.x + bb.width * 0.3, bb.y + bb.height * 0.42);
        await p.waitForTimeout(1400);
        await p.mouse.click(bb.x + bb.width * 0.68, bb.y + bb.height * 0.6);
        await p.waitForTimeout(2200);
      }
    }
    if (SHEET) {
      const mark = await p.$(".isle-mark");
      if (mark) {
        await mark.click({ force: true }).catch(() => {});
        await p.waitForTimeout(900);
      }
    }
    const name = `${path.replace(/[^a-z-]/gi, "") || "top"}-${wide ? "pc" : "sp"}${WALK ? "-walk" : ""}${SHEET ? "-sheet" : ""}`;
    await p.screenshot({ path: `${OUT}/${name}.png` });
    const info = await p.evaluate(() => ({
      svg: document.querySelectorAll(".isle-svg *, .stage-svg *").length,
      places: document.querySelectorAll(".isle-spot, .spot").length,
      folk: document.querySelectorAll(".isle-who-hit, .who-hit").length,
      h1: document.querySelector("h1")?.textContent?.trim().slice(0, 24) ?? "",
    }));
    console.log(
      `${name.padEnd(28)} svg${String(info.svg).padStart(5)}  建物${info.places}  住人${info.folk}  ${errs.length ? "JSエラー " + errs[0].slice(0, 90) : ""}`,
    );
    await p.close();
  }
  await ctx.close();
}
await b.close();
