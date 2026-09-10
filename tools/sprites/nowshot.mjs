/**
 * 直したところを、**出発前・旅の2日目・旅のあと**の3時点で撮って並べる。
 *
 *   python3 -m http.server 4740 --directory site/.next-lead &
 *   SPORT=4740 node tools/sprites/nowshot.mjs
 *
 * 撮るのは、砂浜（`.ifoot`）・週の帯（`.wk`）・「歩いた国」の前置き（`.phead`）・
 * 表紙のいちばん下の章（`#watch`）。**本番の `/state` を差し込む**（決めごと2）。
 */
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const PORT = process.env.SPORT || 4740;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const OUT = process.env.OUT || "/tmp/now";
mkdirSync(OUT, { recursive: true });
const STATE = readFileSync(process.env.STATE || "/tmp/state.json", "utf8");

const clockOf = (iso) => `(() => {
  const F = ${Date.parse(iso)}, R = Date, s = R.now();
  class D extends R {
    constructor(...a) { a.length ? super(...a) : super(F + (R.now() - s)); }
    static now() { return F + (R.now() - s); }
  }
  D.parse = R.parse; D.UTC = R.UTC; globalThis.Date = D;
})();`;

const WHENS = [
  ["01-before", "2026-09-10T12:00:00Z"],
  ["02-trip", "2026-09-13T12:00:00Z"],
  ["03-after", "2026-09-30T12:00:00Z"],
];

/** 面 → 撮る場所 */
const SHOTS = [
  ["/streams.html", "streams-wk", ".wk"],
  ["/streams.html", "streams-foot", ".ifoot"],
  ["/map.html", "map-head", ".phead"],
  ["/index.html", "home-watch", "[data-chap=watch]"],
  ["/index.html", "home-foot", ".ifoot"],
];

const b = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
for (const [tag, iso] of WHENS) {
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
  });
  await ctx.addInitScript(clockOf(iso));
  await ctx.route(/\/island-api\//, (r) =>
    new URL(r.request().url()).pathname.endsWith("/state")
      ? r.fulfill({ status: 200, contentType: "application/json", body: STATE })
      : r.abort("failed"),
  );
  for (const [path, name, sel] of SHOTS) {
    const p = await ctx.newPage();
    await p.goto(`${ORIGIN}${path}`, { waitUntil: "domcontentloaded" }).catch(() => {});
    await p.waitForTimeout(4000);
    // いちばん下まで送ってから撮る。畳みは画面の外にいるあいだ中身を持たない
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await p.waitForTimeout(900);
    const el = await p.$(sel);
    if (el) await el.screenshot({ path: `${OUT}/${tag}-${name}.png` });
    else console.log(`${tag} ${name}: ${sel} が無い`);
    await p.close();
  }
  await ctx.close();
}
await b.close();
console.log(`撮った: ${OUT}`);
