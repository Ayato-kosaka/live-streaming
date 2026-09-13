/**
 * 時計を進めて、**日付で変わる字**を面ごとに読む道具。
 *
 * 直したいのは「9/28 から画面が嘘をつく」「旅の最中に◯日目が2つ出る」の2つで、
 * どちらも**その日を過ぎた形で開かないと見えない**（`docs/island-misses.md` #21 #22）。
 * `crawl.mjs` は壊れているか（h1・JSエラー・横あふれ）を見る道具なので、
 * **何と書いてあるか**はこちらで読む。
 *
 *   DIST=… SPORT=4330 ISO=2026-09-30T10:00:00Z node dates.mjs        # 決まった面の字
 *   DIST=… SPORT=4330 ISO=2026-09-30T10:00:00Z node dates.mjs --neg  # 全面から負の日数を探す
 *
 * **`/island-api/*` は落とす。** 押されなかった日に暦で閉じるか、を見たいので、
 * 島から事実（`nordic.arrivedOn` / `endedOn`）が届く道は塞ぐ。
 * 住人の絵などは `r.fallback()` で通す（全部横取りすると島が0人になる）。
 */

import { chromium } from "playwright-core";
import { readdirSync, statSync } from "fs";
import { join } from "path";

const SPORT = process.env.SPORT || "4330";
const root = process.env.DIST || "/tmp/wt-date/site/.next-3330";
const ISO = process.env.ISO || "2026-09-30T10:00:00Z";
const NEG = process.argv.includes("--neg");

function walk(d, base = "") {
  let out = [];
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (f === "_next" || f === "cache" || f === "server" || f === "static") continue;
    if (statSync(p).isDirectory()) out = out.concat(walk(p, base + "/" + f));
    else if (f.endsWith(".html")) out.push(base + "/" + f);
  }
  return out;
}

/** 読みたい面と、読みたいところ。文字で拾う（class は変わりうるので広めに取る） */
const SPOTS = [
  ["/index.html", [".now-place", ".meishi", ".nextup-count", ".chip"]],
  ["/now.html", [".now-place", ".np-word", ".tiles", ".chips", ".nowc-head", ".pap-sec h2"]],
  ["/nordic.html", [".tnow-count", ".tnow-pair", ".tnow-act.is-main", ".ndayr"]],
  ["/about.html", [".now-place", ".np-word"]],
  ["/next.html", [".nextup-count", ".plan-when", ".pc-count"]],
  ["/atlas.html", [".isles-now", ".isle-days"]],
];

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.route(/googleusercontent\.com|upload\.wikimedia\.org|instagram\.com|ytimg\.com|youtube\.com/, (r) =>
  r.fulfill({ path: "/home/user/live-streaming/site/public/og.png" }),
);
await ctx.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
/* 島の口は落とす。暦だけで閉じるかを見る。
   `STATE=1` を渡したときだけ、旅の終わりが**押してある**状態の `/island-api/state`
   を返す。押したときと、押さずに暦で閉じたときで、字が変わらないかを見るため。 */
const STATE = process.env.STATE
  ? {
      current: { place: "ジョージア・トビリシ", theme: "georgia", updatedAt: "2026-09-04" },
      nordic: { arrivedOn: "2026-09-20", endedOn: "2026-09-27" },
    }
  : null;
await ctx.route(/\/island-api\//, (r) => {
  if (STATE && /\/island-api\/state/.test(r.request().url())) {
    return r.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(STATE),
    });
  }
  return r.abort();
});
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
console.log(`# ISO=${ISO}  (island-api は落としてある)`);

if (NEG) {
  /* 負の日数を全面から探す。「あと-19日」「-19日目」「−3日」。
     日付（2026-09-11）や CSS の値は拾わないように、数字の前が字の区切りのものだけ。 */
  const RE = /(?:^|[^0-9-])[-−]\d+\s*(?:日|km|人|件|回|本)/g;
  let hit = 0;
  for (const page of walk(root).sort()) {
    await p.goto(`http://localhost:${SPORT}${page}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await p.waitForTimeout(700);
    const t = await p.evaluate(() => document.body.innerText);
    const m = t.match(RE);
    if (m) {
      hit++;
      console.log(`NEG ${page} ${[...new Set(m)].join(" | ")}`);
    }
  }
  console.log(`\n負の数の出た面: ${hit}`);
} else {
  for (const [page, sels] of SPOTS) {
    await p.goto(`http://localhost:${SPORT}${page}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await p.waitForTimeout(900);
    const out = await p.evaluate((sels) => {
      const lines = [];
      for (const s of sels) {
        for (const el of document.querySelectorAll(s)) {
          const t = el.innerText?.replace(/\s*\n\s*/g, " / ").trim();
          if (t) lines.push(`  [${s}] ${t.slice(0, 220)}`);
        }
      }
      return lines;
    }, sels);
    /* 選んだところが空でも、面の字は読む。**class は面ごとに違う**ので、
       日付で変わる言い回しを本文から拾う（ここが「何と書いてあるか」の本体）。 */
    const lines = await p.evaluate(() =>
      document.body.innerText
        .split("\n")
        .map((x) => x.trim())
        .filter((x) =>
          /とちゅう|日目|あと *[-−]?\d|行ってきた|おわった|おわり|数えています|移動中|めざす|発ちます|発ちました|毎晩|いま、ここ|いま [^、。]|きょうは|進行中|今日/.test(x),
        ),
    );
    console.log(`\n## ${page}`);
    console.log(out.join("\n") || "  (選んだところは なし)");
    console.log([...new Set(lines)].map((x) => `  > ${x.slice(0, 160)}`).join("\n"));
  }
}
await b.close();
