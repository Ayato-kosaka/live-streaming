/**
 * あやと島カードの一覧（`/cards`）を、写真が増えた状態で撮る。
 *
 *   PORT=4133 node cardshot.mjs
 *
 * 配るのは書き出したもの（`site/.next-<port>`）なので、開くのは `/cards.html`。
 *
 * 一覧が散らかるのは**カードが増えたとき**なので、`asme.mjs` の差し込み
 * （写真3枚 × 12人 = 36枚）で撮る。素の本番データ（1枚 × 4人）では、
 * まとめた効きも、押して開いた先も見えない。
 *
 * 出すもの: マスの数・カードの枚数・横あふれ・押しどころの高さ。
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { apply } from "./asme.mjs";
import { offline } from "./route.mjs";

const PORT = process.env.PORT || "4133";
const OUT = process.env.OUT || "/tmp/claude-0/-home-user-live-streaming/bf90a11a-e96d-5951-9af6-869c5c9df13c/scratchpad/cards";
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  reducedMotion: "reduce",
});
// 住人の絵は先に落としてある（`avatars.py`）。1人ずつ返させる
await offline(ctx);
await apply(ctx, { admin: process.env.ADMIN === "1" });
const p = await ctx.newPage();
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));

await p.goto(`http://localhost:${PORT}/cards.html`, { waitUntil: "networkidle" });
await p.waitForTimeout(1200);
await p.screenshot({ path: `${OUT}/cards-一覧.png`, fullPage: true });

const count = await p.evaluate(() => ({
  マス: document.querySelectorAll(".akd-tile").length,
  日: document.querySelectorAll(".akd-day").length,
  人数の札: [...document.querySelectorAll(".akd-tile-n")].map((x) => x.textContent),
  面の高さ: document.documentElement.scrollHeight,
  横あふれ: document.documentElement.scrollWidth > window.innerWidth + 1,
  マスの高さ: [...document.querySelectorAll(".akd-tile")].map((x) =>
    Math.round(x.getBoundingClientRect().height),
  ),
}));
console.log("一覧:", JSON.stringify(count, null, 1));

/* 押して開く。埋め込み版はここにしかない */
await p.locator(".akd-tile").first().click();
await p.waitForTimeout(900);
await p.screenshot({ path: `${OUT}/cards-開いた.png` });
const open = await p.evaluate(() => ({
  出ているカード: document.querySelectorAll(".akd-modal .akd").length,
  顔: document.querySelectorAll(".akdp").length,
  顔の高さ: Math.round(document.querySelector(".akdp")?.getBoundingClientRect().height ?? 0),
  閉じるの高さ: Math.round(document.querySelector(".akd-close")?.getBoundingClientRect().height ?? 0),
  横あふれ: document.documentElement.scrollWidth > window.innerWidth + 1,
}));
console.log("開いた:", JSON.stringify(open));

/* 別の人に入れ替える */
await p.locator(".akdp").nth(3).click();
await p.waitForTimeout(600);
await p.screenshot({ path: `${OUT}/cards-別の人.png` });

await p.keyboard.press("Escape");
await p.waitForTimeout(400);
console.log("閉じた:", await p.locator(".akd-modal").count());

await b.close();
