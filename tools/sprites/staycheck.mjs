/** 「終わっていない滞在」を閉じたかを、**時計を進めて撮って**確かめる。
 *
 *   PORT=4610 node staycheck.mjs
 *
 * 出発前（2026-09-10）と、旅の1週間後（2026-09-18）を交互に撮る。
 * 日付で変わるものは、その日を過ぎた形で見ないと分からない
 * （`docs/island-misses.md` #23）。
 *
 * 撮るだけでなく、**画面から字を読んで**合否を出す。
 * 「ジョージアに来て◯日目」「いまもここにいる」「いまはコーカサスにいます」
 * 「いまここ」「NaN」が、旅に出たあとの面に1つでも残っていたら不合格。
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { offline } from "./route.mjs";

const PORT = process.env.PORT || 4610;
const OUT = process.env.OUT || "/tmp/stay";
mkdirSync(OUT, { recursive: true });

const clockOf = (when) => `(() => {
  const F = ${Date.parse(when)}, R = Date, s = R.now();
  class D extends R {
    constructor(...a) { a.length ? super(...a) : super(F + (R.now() - s)); }
    static now() { return F + (R.now() - s); }
  }
  D.parse = R.parse; D.UTC = R.UTC; globalThis.Date = D;
})();`;

/** 撮る面。名前は出来上がりのファイル名になる */
const PAGES = [
  ["now", "/now.html"],
  ["map", "/map.html"],
  ["caucasus", "/island/caucasus.html"],
  ["nordic", "/island/nordic.html"],
];

/** 旅に出たあとに残っていたら不合格の字 */
const BAD = ["に来て", "いまもここにいる", "いまはコーカサスにいます", "いまここ", "NaN"];

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

let bad = 0;
for (const [tag, when] of [
  ["A-before", "2026-09-10T09:00:00Z"],
  ["B-day7", "2026-09-18T09:00:00Z"],
]) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(clockOf(when));
  await offline(ctx);
  const p = await ctx.newPage();
  console.log(`\n=== ${tag}  時計 ${when} ===`);
  for (const [name, path] of PAGES) {
    await p.goto(`http://localhost:${PORT}${path}`, { waitUntil: "networkidle" });
    // 島は rAF で動く。撮る前に、引き直した字が出るまで待つ
    await p.waitForTimeout(2500);
    await p.screenshot({ path: `${OUT}/${tag}-${name}.png`, fullPage: true });
    const text = await p.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
    const hit = BAD.filter((w) => text.includes(w));
    if (tag.startsWith("B") && hit.length) {
      bad++;
      console.log(`  ✗ ${name}  残っている字: ${hit.join(" / ")}`);
    } else {
      console.log(`  ${name}  ${hit.length ? `（出発前なので可）${hit.join(" / ")}` : "きれい"}`);
    }
    // 面のいちばん上の言い分だけ、字で残す
    const lead = await p.evaluate(() => {
      const q = (s) => document.querySelector(s)?.textContent?.trim() ?? "";
      return [q(".phead-lead"), q(".isle-lead"), q(".stats .stat:last-child"), q(".nowc-head"), q(".zk-hr")]
        .filter(Boolean)
        .join(" ｜ ");
    });
    if (lead) console.log(`      ${lead}`);
  }
  await ctx.close();
}
await b.close();
console.log(`\n撮ったもの: ${OUT}　不合格 ${bad} 件`);
process.exit(bad ? 1 : 0);
