/**
 * **旅のあいだ、薄いほうの島（`/island/nordic`）への入口が残っていないか。**
 *
 *   PORT=4630 node foldnordic.mjs
 *
 * いまいる島はトップそのもの（`docs/island-atlas.md` 7章）。
 * `/atlas` はそうしているのに、`/all` だけが `/island/<いまいる島>` を案内していた。
 * 時計を進めて、両方の面の `a[href]` を数える。
 */
import { mkdirSync } from "fs";
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";

const PORT = process.env.PORT || 4630;
const OUT = process.env.OUT || "/tmp/foldnordic";
mkdirSync(OUT, { recursive: true });
const WHENS = [
  ["before", "2026-09-10T12:00:00Z"],
  ["dep30", "2026-09-11T20:00:00Z"],
  ["week", "2026-09-18T20:00:00Z"],
];
const clockOf = (when) => `(() => {
  const F = ${Date.parse(when)}, R = Date, s = R.now();
  class D extends R {
    constructor(...a) { a.length ? super(...a) : super(F + (R.now() - s)); }
    static now() { return F + (R.now() - s); }
  }
  D.parse = R.parse; D.UTC = R.UTC; globalThis.Date = D;
})();`;

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

for (const [name, when] of WHENS) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(clockOf(when));
  await offline(ctx);
  const p = await ctx.newPage();
  for (const path of ["/all.html", "/atlas.html"]) {
    await p.goto(`http://localhost:${PORT}${path}`, { waitUntil: "networkidle" });
    await p.waitForTimeout(2200);
    const got = await p.evaluate(() => ({
      章の島: [...document.querySelectorAll("a[href^='/island/']")]
        .map((a) => `${a.getAttribute("href")} 「${a.textContent.trim().replace(/\s+/g, " ")}」`),
      トップへ: [...document.querySelectorAll("a[href='/']")].map((a) =>
        a.textContent.trim().replace(/\s+/g, " ").slice(0, 40),
      ),
    }));
    console.log(`${name.padEnd(7)} ${path}`);
    for (const s of got.章の島) console.log(`    ${s}`);
    if (path === "/atlas.html") console.log(`    → / : ${got.トップへ.join(" / ")}`);
  }
  // 島の地図の「いまここ」の札
  await p.goto(`http://localhost:${PORT}/atlas.html`, { waitUntil: "networkidle" });
  await p.waitForTimeout(2200);
  const card = await p.$(".atl-card");
  await card?.screenshot({ path: `${OUT}/card-${name}.png` });
  const nums = await p.evaluate(
    () => document.querySelector(".atl-nums")?.textContent?.replace(/\s+/g, " ").trim() ?? "(数字なし)",
  );
  console.log(`    いまここの札: ${nums}\n`);
  await ctx.close();
}
await b.close();
console.log(`絵 -> ${OUT}`);
