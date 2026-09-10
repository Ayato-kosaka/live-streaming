/**
 * 表紙の「今夜も22時から」に並ぶ2本を、**本番の値**と**読めなかった3通り**で撮って数える。
 *
 *   curl -s https://live-streaming-d3cac.web.app/island-api/state -o /tmp/state.json
 *   python3 -m http.server 4740 --directory site/.next-lead &
 *   SPORT=4740 node tools/sprites/tonight.mjs
 *
 * 落とし方は `_read.mjs` と同じ3通り。**`abort` だけで判定しない**
 * （`docs/island-standards.md` 13）。
 *
 *   ok    … 本番の `/state` をそのまま返す
 *   abort … 通信そのものが切れる
 *   503   … 口は生きているが返事がエラー
 *   slow  … 45秒返さない（細い電波でいちばん多いのはこれ）
 */
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const PORT = process.env.SPORT || 4740;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const OUT = process.env.OUT || "/tmp/tonight";
mkdirSync(OUT, { recursive: true });

/** **本番から落としてきたバイト列。** 差し込みに自分で作った値を置かない（決めごと2） */
const STATE = readFileSync(process.env.STATE || "/tmp/state.json", "utf8");

const WHEN = process.env.WHEN || "2026-09-13T12:00:00Z";
const clock = `(() => {
  const F = ${Date.parse(WHEN)}, R = Date, s = R.now();
  class D extends R {
    constructor(...a) { a.length ? super(...a) : super(F + (R.now() - s)); }
    static now() { return F + (R.now() - s); }
  }
  D.parse = R.parse; D.UTC = R.UTC; globalThis.Date = D;
})();`;

const b = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });

for (const mode of ["ok", "abort", "503", "slow"]) {
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
  });
  await ctx.addInitScript(clock);
  await ctx.route(/\/island-api\//, async (r) => {
    if (mode === "abort") return r.abort("failed");
    if (mode === "503") return r.fulfill({ status: 503, contentType: "text/plain", body: "x" });
    if (mode === "slow") {
      await new Promise((s) => setTimeout(s, 45000));
      return r.abort("failed");
    }
    if (new URL(r.request().url()).pathname.endsWith("/state"))
      return r.fulfill({ status: 200, contentType: "application/json", body: STATE });
    return r.abort("failed");
  });
  const p = await ctx.newPage();
  await p.goto(`${ORIGIN}/index.html`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await p.waitForTimeout(mode === "slow" ? 16000 : 6000);
  const r = await p.evaluate(() => {
    const cards = [...document.querySelectorAll(".scards .scard")];
    return {
      本数: cards.length,
      日付: cards.map((c) => c.querySelector("time")?.textContent ?? ""),
      題: cards.map((c) => c.querySelector("b")?.textContent?.slice(0, 22) ?? ""),
      動画ID: cards.map((c) => (c.getAttribute("href") || "").split("v=")[1] ?? ""),
      サムネ: cards.map((c) => c.querySelector("img")?.getAttribute("src") ?? ""),
      読めない札: [...document.querySelectorAll(".blank.is-off > b")].map((x) => x.textContent),
      からっぽ: [...document.querySelectorAll(".blank:not(.is-off) > b")].map((x) => x.textContent),
    };
  });
  console.log(`${mode.padEnd(6)} ${JSON.stringify(r, null, 0)}`);
  const el = await p.$("#watch");
  if (el) await el.screenshot({ path: `${OUT}/watch-${mode}.png` });
  await p.close();
  await ctx.close();
}
await b.close();
