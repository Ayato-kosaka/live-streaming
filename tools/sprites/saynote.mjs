/**
 * 付箋（`components/live/Notes.tsx`）と企画（`components/live/Board.tsx`）を、
 * **本番の中身**＋**改行と長い1語の混ざった1枚**で撮る。
 *
 *   SPORT=5001 OUT=/tmp/say/before node tools/sprites/saynote.mjs   # 直す前
 *   SPORT=5000 OUT=/tmp/say/after  node tools/sprites/saynote.mjs   # 直したあと
 *
 * 付箋も企画も口から来るので、書き出したものを開いただけでは1枚も出ない。
 * 本番から引いたものを差し込む（`docs/island-misses.md` #1「差し込みに
 * 本番と違う値を置かない」）。足すのは1枚だけで、置き換えはしない。
 */
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "fs";
import { offline } from "./route.mjs";

const SPORT = process.env.SPORT || "5000";
const OUT = process.env.OUT || "/tmp/say/shot";
const BASE = `http://127.0.0.1:${SPORT}`;
const PROD = "https://live-streaming-d3cac.web.app/island-api";
const CACHE = "/tmp/say/api";

/** 切れ目を1つも持たない80字。折れなければ紙の外へ出る。 */
const LONG = "https://example.com/" + "abcdefghij".repeat(6);

mkdirSync(OUT, { recursive: true });
mkdirSync(CACHE, { recursive: true });

function prod(path, file) {
  const at = `${CACHE}/${file}`;
  if (!existsSync(at)) {
    writeFileSync(at, execFileSync("curl", ["-s", "--max-time", "60", PROD + path], { maxBuffer: 1 << 26 }));
  }
  return JSON.parse(readFileSync(at, "utf-8"));
}

const state = prod("/state", "state.json");
const stickies = prod("/stickies", "stickies.json");
const plans = prod("/nextplans?limit=60&events=1", "plans.json");

stickies.notes = [
  {
    id: "say-stress",
    theme: "lithuania",
    text: `ここを見てほしい\n${LONG}\n改行のあとも続きます`,
    by: "ながいことば",
    hearts: 9,
    byOwner: false,
    reply: `ありがとう\n${LONG}`,
    createdAt: new Date().toISOString(),
  },
  ...stickies.notes,
];
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

const SHOTS = [
  { name: "notes", path: "/nordic/lithuania.html", sel: ".nx-notes li" },
  { name: "plan", path: "/board.html", sel: ".idea-body" },
];

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

for (const w of [360, 390]) {
  const ctx = await b.newContext({
    viewport: { width: w, height: 900 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await offline(ctx);
  const json = (r, v) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(v) });
  /* **受け皿を先に。** Playwright はあとから登録した route を先に当てる */
  await ctx.route(/\/island-api\//, (r) => r.fulfill({ status: 404, contentType: "application/json", body: "{}" }));
  await ctx.route(/\/island-api\/state/, (r) => json(r, state));
  await ctx.route(/\/island-api\/stickies/, (r) => json(r, stickies));
  await ctx.route(/\/island-api\/nextplans/, (r) => json(r, plans));

  const page = await ctx.newPage();
  for (const t of SHOTS) {
    await page.goto(BASE + t.path, { waitUntil: "networkidle" });
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 500) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
    });
    await page.waitForTimeout(1500);
    const o = await page.evaluate(() => ({
      s: document.documentElement.scrollWidth,
      c: document.documentElement.clientWidth,
    }));
    const box = page.locator(t.sel).first();
    const n = await box.count();
    console.log(`${t.name} ${w}px  箱 ${n} 個  scrollWidth=${o.s} clientWidth=${o.c} over=${o.s - o.c}`);
    if (n) {
      await box.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await box.screenshot({ path: `${OUT}/${t.name}-${w}-box.png` });
    }
  }
  await ctx.close();
}
await b.close();
console.log("→", OUT);
