/**
 * 表紙の「いま、いちばん近い企画」と、`/now` の「今週、なにをするんだろう」を撮る。
 *
 *   python3 -m http.server 4171 --directory site/.next-3171 &
 *   STATE=/tmp/claude-0/next/state-prod.json SPORT=4171 OUT=/tmp/claude-0/next/after \
 *     node tools/sprites/nextshot.mjs
 *
 * ## なぜ本番の `state` を差し込むか
 *
 * 「今週、なにをするんだろう」は `/island-api/state` が返ったときだけ本番の字になる。
 * 静的に配ると口が無いので、焼き込みの受け皿（`content/site.ts` の `NOW_FALLBACK`）が
 * 出る。あれは日付を1つも持たない2行なので、**過ぎた日の行が落ちるかどうかを
 * 1行も確かめられない。** 差し込む値は `STATE` に渡した**本番そのもの**
 * （`curl .../island-api/state`）で、こちらで作った値は1つも置かない
 * （`docs/island-misses.md` #1・`docs/island-standards.md` §13）。
 */
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync } from "fs";
import { offline } from "./route.mjs";

const SPORT = process.env.SPORT || "4171";
const OUT = process.env.OUT || "/tmp/claude-0/next";
const STATE = process.env.STATE;
if (!STATE) throw new Error("STATE に本番の state の json を渡してください");
const state = readFileSync(STATE, "utf8");
JSON.parse(state); // 読めないものを黙って差し込まない
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
await offline(ctx);
await ctx.route(/fonts\.googleapis\.com/, (r) =>
  r.fulfill({ status: 200, contentType: "text/css", body: "" }),
);
await ctx.route(/\/island-api\/state/, (r) =>
  r.fulfill({ status: 200, contentType: "application/json", body: state }),
);

const p = await ctx.newPage();

/** その1枚だけを撮る。**無ければ「無い」と言う**（黙って別の枠を撮らない）。 */
async function shot(url, sel, name, waitFor) {
  const res = await p.goto(`http://localhost:${SPORT}${url}`, { waitUntil: "domcontentloaded" });
  if (!res || res.status() >= 400) throw new Error(`${url} が ${res?.status()} で返りました`);
  await p.waitForTimeout(3000);
  if (waitFor) {
    try {
      await p.waitForSelector(waitFor, { timeout: 5000 });
    } catch {
      /* 出ないことを撮るための待ちなので、来なくても進む */
    }
  }
  const el = await p.$(sel);
  if (!el) {
    console.log(`${name}: ${sel} は出ていません（撮っていません）`);
    return;
  }
  await el.scrollIntoViewIfNeeded();
  await p.waitForTimeout(400);
  await el.screenshot({ path: `${OUT}/${name}.png` });
  const txt = (await el.innerText()).replace(/\n+/g, " / ");
  console.log(`${name}: ${txt}`);
}

await shot("/index.html", ".nextup", "home-nextup", ".nextup-card, .nextup-none");
await shot("/now.html", ".pap", "now-week", ".pap-sec");
await shot("/now.html", ".now-hero", "now-hero", ".tile");

await b.close();
