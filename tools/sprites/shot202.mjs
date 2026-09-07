/**
 * #202 の画面を 375×812 で撮る。
 *
 *   PORT=4203 node shot202.mjs
 *
 * 撮るもの:
 *   1. 写真を貼る画面（企画が1本 / 4本 / 0本）
 *   2. その日の配信を足す画面（URL を貼る前・貼ったあと・送ったあと）
 *   3. マイページの顔（キャラクターと混ざっていないか）
 *   4. 9/11 のカード（企画4本）
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { apply } from "./asme202.mjs";

const PORT = process.env.PORT || "4203";
const OUT = "/tmp/claude-0/-home-user-live-streaming/bf90a11a-e96d-5951-9af6-869c5c9df13c/scratchpad/shots";
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  reducedMotion: "reduce",
});
await apply(ctx, { admin: true });
/* 置き場の絵はこの箱から出られない。カードの写真だけ差し替える */
await ctx.route(/firebasestorage\.googleapis\.com|lh3\.googleusercontent\.com/, (r) =>
  // 写真の代わりに、リポジトリの中にある絵を返す。この箱は外に出られない
  r.fulfill({ path: new URL("../../site/public/og.png", import.meta.url).pathname }),
);
const p = await ctx.newPage();
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));

const shot = async (name, el) => {
  await p.waitForTimeout(400);
  await (el ?? p).screenshot({ path: `${OUT}/${name}.png` });
  console.log("撮った", name);
};

/* ---- 1. 写真を貼る ---- */
await p.goto(`http://localhost:${PORT}/me`, { waitUntil: "networkidle" });
await p.waitForTimeout(900);
const trip = p.locator("section.mp-trip");
const setDay = async (d) => {
  await p.locator(".nph-post input[type=date]").fill(d);
  await p.waitForTimeout(700);
};
await setDay("2026-09-06");
await shot("photo-1本", trip);
await setDay("2026-09-11");
await shot("photo-4本", trip);
await p.locator(".nph-ev-pick").nth(3).click();
await shot("photo-4本-選んだ", trip);
await setDay("2026-09-08");
await shot("photo-0本", trip);

/* 押せないのに厚みがあるものが、開いた面に無いか（popcheck と同じ見かた） */
const thickness = async (where) =>
  p.evaluate((sel) => {
    const root = document.querySelector(sel);
    const out = [];
    for (const el of root.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width < 3 || r.height < 3) continue;
      const bs = (cs.boxShadow || "").split(/,(?![^(]*\))/).filter((t) => {
        const n = (t.replace(/\([^)]*\)/g, "").match(/-?[\d.]+px/g) || []).map(parseFloat);
        return !/inset/.test(t) && n[1] > 0 && (n[2] || 0) === 0;
      });
      if (!bs.length) continue;
      let click = false;
      for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
        const t = a.tagName;
        if (["A", "BUTTON", "SUMMARY", "INPUT", "SELECT", "TEXTAREA", "LABEL"].includes(t)) click = true;
        if (a.getAttribute?.("role") === "button" || a.tabIndex >= 0) click = true;
      }
      if (!click) out.push(el.tagName.toLowerCase() + "." + String(el.className).slice(0, 40));
    }
    return out;
  }, where);
console.log("写真の面 押せないのに厚み:", await thickness("section.mp-trip"));

/* ---- 2. その日の配信を足す ---- */
await p.locator(".mp-tab").nth(3).click();
await p.waitForTimeout(900);
await shot("videos-ひらいた", trip);
await p.locator(".mp-tool select").selectOption("food-wine-fest");
await p.waitForTimeout(400);
await shot("videos-2本入っている", trip);
await p.locator(".mp-tool input[type=text]").fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s");
await p.waitForTimeout(300);
await shot("videos-URLを貼った", trip);
await p.locator(".mp-vid-add .mp-send").click();
await p.waitForTimeout(300);
await shot("videos-足した", trip);
await p.locator("button.mp-send").last().click();
await p.waitForTimeout(700);
await shot("videos-送った", trip);
console.log("配信の面 押せないのに厚み:", await thickness("section.mp-trip"));

/* ---- 3. マイページの顔 ---- */
await p.goto(`http://localhost:${PORT}/me`, { waitUntil: "networkidle" });
await p.waitForTimeout(900);
await shot("me-顔", p.locator(".mp-who"));
console.log(
  "顔の出どころ:",
  await p.evaluate(() => document.querySelector(".mp-face")?.getAttribute("src")),
);
const chara = p.locator(".mp-chara");
if (await chara.count()) {
  await chara.scrollIntoViewIfNeeded();
  await shot("me-キャラクター", chara);
  console.log(
    "キャラクターの出どころ:",
    await p.evaluate(() => document.querySelector(".mp-chara img")?.getAttribute("src")),
  );
}

/* ---- 4. 9/11 のカード ---- */
await p.goto(`http://localhost:${PORT}/cards`, { waitUntil: "networkidle" });
await p.waitForTimeout(1200);
const one = p.locator("article.akd").first();
await one.scrollIntoViewIfNeeded();
await shot("card-9-11", one);
console.log(
  "カードの札:",
  await p.evaluate(() =>
    [...document.querySelectorAll("article.akd")].map((a) =>
      [...a.querySelectorAll(".akd-plan")].map((x) => x.textContent),
    ),
  ),
);
await p.screenshot({ path: `${OUT}/cards-面.png`, fullPage: true });
console.log(
  "横あふれ:",
  await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1),
);

await b.close();
