/**
 * 本番に近い形（`/island-api/state` が返る）で、旅のあとの面を見る。調査用（読むだけ）。
 *
 * 旅の終わりの2つの日（`nordic.arrivedOn` / `nordic.endedOn`）を押した場合と
 * 押さなかった場合で、面の字がどう変わるかを並べて出す。
 */
import { chromium } from "playwright-core";

const SPORT = process.env.SPORT || "4220";
const ISO = process.env.ISO || "2026-09-30T10:00:00Z";

const CASES = [
  {
    name: "旅の終わりを誰も押していない（場所も古いまま）",
    state: {
      current: { place: "ジョージア・トビリシ", theme: "georgia", word: "", updatedAt: "2026-09-04", week: [] },
      nordic: {},
      stats: {},
    },
  },
  {
    name: "旅の終わりを押した（着いた 9/20・発った 9/27）＋ 場所はティラナ",
    state: {
      current: { place: "アルバニア・ティラナ", theme: "georgia", word: "ティラナに来ました", updatedAt: "2026-09-28", week: [] },
      nordic: { arrivedOn: "2026-09-20", endedOn: "2026-09-27" },
      stats: {},
    },
  },
];

const SEL = {
  "/now.html": {
    "いまどこ 大文字": ".now-place",
    "札ぜんぶ": ".now-hero .tiles",
    "チップ": ".now-hero .chips",
  },
  "/nordic.html": {
    "大きい数字": ".tnow-counts",
    "いま／つぎ": ".tnow-pair",
    "着いた行": ".nday.is-goal:not(.is-end)",
    "旅のおわり行": ".nday.is-goal.is-end",
  },
  "/index.html": {
    "いちばん近い企画": ".nextup-card",
    "名刺 いまどこ": ".mei-go[href='/now'] b",
  },
};

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
console.log(`ISO=${ISO}`);
for (const c of CASES) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.route(/googleusercontent\.com|upload\.wikimedia\.org|instagram\.com|ytimg\.com|youtube\.com/,
    r => r.fulfill({ path: "/home/user/live-streaming/site/public/og.png" }));
  await ctx.route(/fonts\.googleapis\.com/, r => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  /* Playwright は**あとに足した route が先に当たる**ので、広いほうを先に足す */
  await ctx.route(/\/island-api\//, r =>
    r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await ctx.route(/\/island-api\/state/, r =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(c.state) }));
  await ctx.addInitScript(`(() => {
    const FAKE = ${Date.parse(ISO)};
    const RealDate = Date;
    const start = RealDate.now();
    function shift() { return FAKE + (RealDate.now() - start); }
    class FakeDate extends RealDate {
      constructor(...a) { if (a.length === 0) super(shift()); else super(...a); }
      static now() { return shift(); }
      static parse(...a) { return RealDate.parse(...a); }
      static UTC(...a) { return RealDate.UTC(...a); }
    }
    Object.defineProperty(FakeDate, "name", { value: "Date" });
    globalThis.Date = FakeDate;
  })();`);
  const p = await ctx.newPage();
  console.log(`\n===== ${c.name}`);
  for (const [page, sel] of Object.entries(SEL)) {
    await p.goto(`http://localhost:${SPORT}${page}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await p.waitForTimeout(2200);
    console.log(`  --- ${page}`);
    const out = await p.evaluate((s) => {
      const r = {};
      for (const [k, q] of Object.entries(s)) {
        const els = [...document.querySelectorAll(q)];
        r[k] = els.length ? els.map((e) => e.innerText || e.textContent || "") : null;
      }
      return r;
    }, sel);
    for (const [k, v] of Object.entries(out)) {
      if (!v) { console.log(`    ${k}: （出ていない）`); continue; }
      v.forEach((x) => console.log(`    ${k}: ${x.replace(/\s+/g, " ").trim().slice(0, 500)}`));
    }
  }
  await ctx.close();
}
await b.close();
