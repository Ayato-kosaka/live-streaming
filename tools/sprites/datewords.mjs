/**
 * 旅の17日間ぶん、時計を進めて「面が何と書いてあるか」を実際の字で拾う。
 * 調査用。読むだけで、何も直さない。
 *
 *   DIST=... SPORT=4220 node datewords.mjs
 */
import { chromium } from "playwright-core";

const SPORT = process.env.SPORT || "4220";
const ISOS = (process.env.ISOS || [
  "2026-09-11T20:00:00Z",
  "2026-09-13T09:00:00Z",
  "2026-09-20T10:00:00Z",
  "2026-09-27T10:00:00Z",
  "2026-09-30T10:00:00Z",
].join(",")).split(",");

/** 面ごとに、拾う場所 */
const TARGETS = [
  {
    page: "/index.html",
    label: "/（表紙）",
    sel: {
      "看板の一行": ".hero-say",
      "いちばん近い企画": ".nextup",
      "名刺 いまどこ": ".mei-go[href='/now'] b",
      "名刺 添え字": ".mei-go[href='/now'] i",
      "名刺 日本を出て": ".mei-since",
      "今夜の配信 札": ".mei-go.is-live i",
      "見にいく 見出し": "#watch .ch-title, #watch h2",
    },
  },
  {
    page: "/now.html",
    label: "/now（いまどこ）",
    sel: {
      "いまどこ 大文字": ".now-place",
      "ひとこと": ".np-word",
      "札ぜんぶ": ".now-hero .tiles",
      "チップ": ".now-hero .chips",
      "島だより スタンプ": ".np-stamp",
      "今週やること": ".pap-sec:has(.pap-rows)",
      "いま歩いているところ / いまいる国": ".pap-sec:has(.nowc-head)",
    },
  },
  {
    page: "/nordic.html",
    label: "/nordic（北欧ヒッチハイク）",
    sel: {
      "大きい数字": ".tnow-counts",
      "いま／つぎ": ".tnow-pair",
      "今日のところへ": ".tnow-act.is-main",
      "旅程表 いまの行": ".nday[data-now], .ndayc[data-now]",
      "着いた行": ".nday.is-goal:not(.is-end)",
      "旅のおわり行": ".nday.is-goal.is-end",
    },
  },
  {
    page: "/nordic/day/16.html",
    label: "/nordic/day/16（旅の最終日）",
    sel: { h1: "h1", "面の頭": ".ndh, .nd-head, main > *:nth-child(1)" },
  },
  {
    page: "/about.html",
    label: "/about（あやとのこと）",
    sel: {
      "いまどこ 札": ".tile[href='/now']",
      "毎日配信の日数": ".astats .stat:nth-child(1)",
      "旅した日数": ".astats .stat:nth-child(3)",
    },
  },
  {
    page: "/next.html",
    label: "/next（これから）",
    sel: { "企画ぜんぶ": ".plans, main" },
  },
];

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

function tidy(s) {
  return s.replace(/\s+/g, " ").trim();
}

for (const ISO of ISOS) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.route(/googleusercontent\.com|upload\.wikimedia\.org|instagram\.com|ytimg\.com|youtube\.com/,
    r => r.fulfill({ path: "/home/user/live-streaming/site/public/og.png" }));
  await ctx.route(/fonts\.googleapis\.com/, r => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
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
  console.log(`\n\n================ ${ISO} ================`);
  for (const t of TARGETS) {
    await p.goto(`http://localhost:${SPORT}${t.page}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    // いちばん下まで送ってから測る（畳みの中も出す）
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await p.waitForTimeout(2200);
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.waitForTimeout(400);
    console.log(`\n--- ${t.label}`);
    const out = await p.evaluate((sel) => {
      const r = {};
      for (const [k, s] of Object.entries(sel)) {
        try {
          const els = [...document.querySelectorAll(s)];
          r[k] = els.length ? els.map((e) => e.innerText || e.textContent || "") : null;
        } catch (e) { r[k] = ["(選べない: " + String(e).slice(0, 60) + ")"]; }
      }
      return r;
    }, t.sel);
    for (const [k, v] of Object.entries(out)) {
      if (!v) { console.log(`  ${k}: （出ていない）`); continue; }
      v.forEach((x, i) => console.log(`  ${k}${v.length > 1 ? `[${i}]` : ""}: ${tidy(x).slice(0, 900)}`));
    }
  }
  await ctx.close();
}
await b.close();
