/**
 * 図鑑を、**溜まり具合と、読めなかったときで撮り分ける。**
 *
 *   node tools/sprites/shot-friends-states.mjs [ポート]
 *
 * `docs/island-standards.md` の出す前のチェック2つ:
 *
 *   - 増えるものを 0件・数件・数十件・数百件で撮った。どれも同じ背で収まる
 *   - 外から取ってくるものを、落とした状態でも撮った（**0のときと見分けがつく**）
 *
 * 図鑑は口から引いているので、**落ちる。** 旅の最中は電波の弱いところを通る。
 * 「読みに行けなかった」と「まだ誰もいません」が同じ絵になっていると、
 * 届かなかっただけの日に「0人でした」と言い切ることになる（standards 10）。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
import { mkdirSync, existsSync, readFileSync } from "fs";

const PORT = process.argv[2] || "4130";
const BASE = `http://127.0.0.1:${PORT}`;
mkdirSync("/tmp/shots", { recursive: true });
const all = JSON.parse(readFileSync("/tmp/ch.json", "utf8")).characters;

/** 撮る場面。人数か、落とすか。 */
const CASES = [
  ["ochita", "読めなかった", null],
  ["zero", "0人", 0],
  ["few", "3人", 3],
  ["some", "30人", 30],
  ["all", "95人", all.length],
];

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"],
});
for (const [tag, label, n] of CASES) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await offline(ctx);
  const json = (r, path) => r.fulfill({ status: 200, contentType: "application/json",
    body: existsSync(path) ? readFileSync(path, "utf8") : "{}" });
  await ctx.route(/\/island-api\/state/, (r) => json(r, "/tmp/state.json"));
  await ctx.route(/\/island-api\/cards/, (r) => json(r, "/tmp/cards.json"));
  await ctx.route(/\/island-api\/characters(\?|$)/, (r) =>
    n === null
      ? r.fulfill({ status: 503, contentType: "application/json", body: '{"error":"unavailable"}' })
      : r.fulfill({ status: 200, contentType: "application/json",
          body: JSON.stringify({ characters: all.slice(0, n), total: n }) }));

  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e).slice(0, 80)));
  await p.goto(`${BASE}/friends.html`, { waitUntil: "networkidle" });
  await p.waitForTimeout(n === null ? 15000 : 2500);
  await p.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 700) {
      window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 70));
    }
    window.scrollTo(0, 0);
  });
  await p.waitForTimeout(1200);
  const r = await p.evaluate(() => {
    const el = document.querySelector(".pap-sec");
    return {
      マス: document.querySelectorAll(".rzk-cell:not(.is-wait)").length,
      骨: document.querySelectorAll(".rzk-cell.is-wait").length,
      読み直す札: !!document.querySelector(".blank.is-off"),
      章の字: el?.innerText.replace(/\n+/g, " / ").slice(0, 70),
      面の高さ: document.body.scrollHeight,
      よこあふれ: document.documentElement.scrollWidth > window.innerWidth,
    };
  });
  console.log(label.padEnd(8), JSON.stringify(r), errs.length ? errs.slice(0, 2) : "");
  await p.screenshot({ path: `/tmp/shots/friends-${tag}.png` });
  await ctx.close();
}
await b.close();
