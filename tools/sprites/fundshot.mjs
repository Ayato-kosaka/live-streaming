/**
 * スパチャの控え（`/me/desk` の「スパチャ」）を撮る。使い捨て。
 *
 *   SPORT=4170 OUT=/tmp/fund node tools/sprites/_fundshot.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import { apply } from "./asme.mjs";
import { offline } from "./route.mjs";

const ORIGIN = `http://127.0.0.1:${process.env.SPORT || 4170}`;
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const OUT = process.env.OUT || "/tmp/fund";
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });

async function ctxOf(opts = {}) {
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 " +
      "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    hasTouch: true,
    isMobile: true,
  });
  await offline(ctx);
  await apply(ctx, { admin: true, ...opts });
  await ctx.addInitScript(() => {
    window.__scFetches = 0;
    const f = window.fetch;
    window.fetch = (...a) => {
      if (String(a[0]).includes("/fund/history")) window.__scFetches++;
      return f(...a);
    };
  });
  // 机が前に開いていた道具を覚えている。スパチャから始める
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("ayato-desk-tool", "fund");
      localStorage.setItem("ayato-island-owner", JSON.stringify({ uid: "fakeuid0001", admin: true }));
    } catch {}
  });
  if (opts.down) {
    await ctx.route(/\/island-api\//, (r) => {
      const path = new URL(r.request().url()).pathname;
      if (/\/characters\/[^/]+\/(plain|scene)-\d+\.webp$/.test(path)) return r.fallback();
      return r.abort("connectionfailed");
    });
  }
  const warm = await ctx.newPage();
  await warm.goto(`${ORIGIN}/index.html`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await warm.waitForTimeout(2500);
  await warm.close();
  return ctx;
}

const look = (p) =>
  p.evaluate(() => {
    const txt = (s) => [...document.querySelectorAll(s)].map((e) => e.textContent.trim());
    const doc = document.documentElement;
    return {
      札: document.querySelectorAll(".mp-tab").length,
      合計: txt(".mp-sc-sum"),
      日の見出し: txt(".mp-sc-dayh").slice(0, 3),
      日の組: document.querySelectorAll(".mp-sc-day").length,
      行: document.querySelectorAll(".mp-sc-list > li").length,
      もっと: txt(".mp-sc-more"),
      いちばん下の組: txt(".mp-sc-day:last-of-type .mp-sc-dayh"),
      机の見出し: txt(".mp-tool-body h2, .panel > h2").slice(0, 2),
      スパチャを引いた回数: window.__scFetches ?? 0,
      よみなおし: txt(".blank.is-off > b"),
      からっぽ: txt(".blank:not(.is-off) > b"),
      骨: document.querySelectorAll(".wait").length,
      高さ: Math.round(document.body.scrollHeight),
      横あふれ: doc.scrollWidth - doc.clientWidth,
    };
  });

async function shot(tag, opts = {}, after) {
  const ctx = await ctxOf(opts);
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  p.on("console", (m) => {
    if (m.type() === "error") errs.push("console: " + m.text().slice(0, 160));
  });
  await p.goto(`${ORIGIN}/me/desk.html`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await p.waitForTimeout(16000);
  if (after) await after(p);
  console.log(tag.padEnd(16), JSON.stringify(await look(p)));
  if (errs.length) console.log(" ".repeat(16), "JSエラー:", errs.join(" / "));
  await p.screenshot({ path: `${OUT}/${tag}.png`, fullPage: true });
  await p.screenshot({ path: `${OUT}/${tag}-1画面.png` });
  await p.close();
  await ctx.close();
}

await shot("ふつう");
/* **視聴者さんとして開く。** 道具そのものが出ないこと、口を1度も
   引かないことを、同じ道具で数える。 */
await shot("視聴者", { admin: false });
await shot("もっと押した", {}, async (p) => {
  await p.click(".mp-sc-more");
  await p.waitForTimeout(2500);
  await p.click(".mp-sc-more");
  await p.waitForTimeout(2500);
});
/* **いちばん下まで開く。** 日付の分からない手入力13件（本番にある）が、
   いちばん後ろでどう出るかは、そこまで送らないと見えない。 */
await shot("ぜんぶ開いた", {}, async (p) => {
  for (let i = 0; i < 14; i++) {
    const b = await p.$(".mp-sc-more");
    if (!b) break;
    await b.click();
    await p.waitForTimeout(1600);
  }
});
await shot("落ちた", { down: true });
await shot("合計が読めない", { fundnosum: true });
await shot("0件", { fundempty: true });

await b.close();
