/**
 * 視聴者さんの字を出しているところに、**切れ目の無い長い1語**を入れて、
 * 横にあふれないかを見る。
 *
 *   SPORT=5000 OUT=/tmp/say/long node tools/sprites/saylong.mjs
 *
 * 改行を残す（`white-space: pre-wrap`）と、**長い1語で紙の外へ出る。**
 * URL を1本貼られただけで面が横に動く。`overflow-wrap: anywhere` を
 * 併せてあるので出ないはずで、それをここで確かめる。
 *
 * 本番から引いた付箋と企画をそのまま差し込み、**そこへ1枚だけ**長い1語の
 * 混ざった付箋を足す。0から作った見本で確かめると、本番に無い形で通る
 * （`docs/island-misses.md` #1）。
 */
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "fs";
import { offline } from "./route.mjs";

const SPORT = process.env.SPORT || "5000";
const OUT = process.env.OUT || "/tmp/say/long";
const BASE = `http://127.0.0.1:${SPORT}`;
const PROD = "https://live-streaming-d3cac.web.app/island-api";
const CACHE = process.env.CACHE || "/tmp/say/api";

/** 切れ目を1つも持たない80字。ここで折れなければ、紙の外へ出ていく。 */
const LONG = "https://example.com/" + "abcdefghij".repeat(6);

mkdirSync(OUT, { recursive: true });
mkdirSync(CACHE, { recursive: true });

/** 本番から1回だけ引いて、手元に置く（ブラウザは本番に出られないので curl） */
function prod(path, file) {
  const at = `${CACHE}/${file}`;
  if (!existsSync(at)) {
    const body = execFileSync("curl", ["-s", "--max-time", "60", PROD + path], { maxBuffer: 1 << 26 });
    writeFileSync(at, body);
  }
  return JSON.parse(readFileSync(at, "utf-8"));
}

const state = prod("/state", "state.json");
const stickies = prod("/stickies", "stickies.json");
const plans = prod("/nextplans?limit=60&events=1", "plans.json");

/** 長い1語と、改行の入った1枚。**本番のぶんに足すだけで、置き換えない。** */
const stress = {
  id: "say-stress",
  theme: "island",
  text: `ここを見てほしい\n${LONG}\n改行のあとも続きます`,
  by: "ながいことば",
  hearts: 0,
  byOwner: false,
  reply: `ありがとう\n${LONG}`,
  createdAt: new Date().toISOString(),
};
stickies.notes = [stress, ...stickies.notes];
state.notes = [stress, ...(state.notes ?? [])];
plans.plans = [
  {
    ...plans.plans[0],
    id: "say-stress-plan",
    title: "長い1語の混ざった企画",
    note: `ひとことの中にも入る\n${LONG}`,
    about: [`段落の中にも入る\n${LONG}\nそのあとも続く`],
    status: "proposed",
    hearts: 0,
  },
  ...plans.plans,
];

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

let bad = 0;
for (const w of [360, 390]) {
  const ctx = await b.newContext({
    viewport: { width: w, height: 900 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await offline(ctx);
  const json = (r, v) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(v) });
  /* **受け皿を先に登録する。** Playwright は**あとから登録した route を先に**
     当てるので、受け皿を最後に書くと、その下の3本が1つも当たらない。
     知らない口は 404 にする。空の `{}` を返すと、受け取る側が
     `options.length` を読んで面ごと落ちる（返ってこないときの道はある） */
  await ctx.route(/\/island-api\//, (r) => r.fulfill({ status: 404, contentType: "application/json", body: "{}" }));
  await ctx.route(/\/island-api\/state/, (r) => json(r, state));
  await ctx.route(/\/island-api\/stickies/, (r) => json(r, stickies));
  await ctx.route(/\/island-api\/nextplans/, (r) => json(r, plans));

  const page = await ctx.newPage();
  for (const [name, path] of [["board", "/board.html"], ["day3", "/nordic/day/3.html"], ["day4", "/nordic/day/4.html"]]) {
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    // 口から来るぶん（付箋・企画）が描かれるのを待つ。**待たずに数えると、
    // 焼いてあるぶんしか数えない**（day の付箋が0個と出た）
    await page.waitForTimeout(1500);
    // 面の中の「視聴者さんの字」ぜんぶに、長い1語を入れて測る
    const n = await page.evaluate((long) => {
      const els = document.querySelectorAll('[style*="pre-wrap"], .np-word');
      for (const el of els) el.textContent = `ここに長い1語\n${long}\nそのあと`;
      return els.length;
    }, LONG);
    await page.waitForTimeout(500);
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 30));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(300);
    const o = await page.evaluate(() => ({
      s: document.documentElement.scrollWidth,
      c: document.documentElement.clientWidth,
    }));
    const over = o.s - o.c;
    if (over > 0) bad++;
    console.log(`${name} ${w}px  字の箱 ${n} 個  scrollWidth=${o.s} clientWidth=${o.c} over=${over}`);
    await page.screenshot({ path: `${OUT}/${name}-${w}.png`, fullPage: true });
  }
  await ctx.close();
}
await b.close();
console.log(bad === 0 ? "横あふれ 0px" : `横あふれ ${bad} 件`);
