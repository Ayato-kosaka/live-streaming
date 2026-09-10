/**
 * **出発前の面が、いまと変わっていないか**を、2つの書き出しで撮り比べる。
 *
 *   A=4640 B=4630 node degrade.mjs
 *
 * 島は住人が歩きカメラが寄るので、そのまま撮ると毎回ちがう絵になる。
 * **rAF を止めてから撮る**（`CLAUDE.md`「島を止めてから撮る」）。
 * CSS の animation を止めるだけでは足りない。
 *
 * 出すのは、画素の違う割合と、読める字の違い。
 */
import { mkdirSync, writeFileSync } from "fs";
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";

const A = process.env.A || 4640; // 比べるもと（master）
const B = process.env.B || 4630; // 比べる先（この枝）
const WHEN = process.env.WHEN || "2026-09-10T12:00:00Z";
const OUT = process.env.OUT || "/tmp/degrade";
const PAGES = (process.env.PAGES || "/index.html,/atlas.html,/all.html").split(",");
mkdirSync(OUT, { recursive: true });

const clock = `(() => {
  const F = ${Date.parse(WHEN)}, R = Date, s = R.now();
  class D extends R {
    constructor(...a) { a.length ? super(...a) : super(F + (R.now() - s)); }
    static now() { return F + (R.now() - s); }
  }
  D.parse = R.parse; D.UTC = R.UTC; globalThis.Date = D;
})();`;
/** 島は rAF で動く。**止めないと2枚のあいだで住人が歩く** */
const freeze = `window.requestAnimationFrame = () => 0;`;

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

async function shoot(port, path, w, h, file) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await ctx.addInitScript(clock);
  await ctx.addInitScript(freeze);
  await offline(ctx);
  const p = await ctx.newPage();
  await p.goto(`http://localhost:${port}${path}`, { waitUntil: "networkidle" });
  await p.waitForTimeout(2500);
  await p.addStyleTag({ content: `*,*::before,*::after{animation:none!important;transition:none!important}` });
  await p.waitForTimeout(200);
  const text = await p.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
  const png = await p.screenshot({ path: file, fullPage: true });
  await ctx.close();
  return { text, size: png.length };
}

/** 画素の違う割合。PNG を素で比べず、同じ大きさに揃えてから数える */
import { execFileSync } from "child_process";
function diffPct(a, c) {
  try {
    const out = execFileSync("python3", ["-c", `
import sys
from PIL import Image
a = Image.open(sys.argv[1]).convert("RGB")
b = Image.open(sys.argv[2]).convert("RGB")
if a.size != b.size:
    print(f"大きさ違い {a.size} vs {b.size}")
    sys.exit()
import itertools
pa, pb = a.load(), b.load()
n = 0
for y in range(0, a.size[1]):
    for x in range(0, a.size[0]):
        if pa[x, y] != pb[x, y]:
            n += 1
print(f"{n * 100 / (a.size[0] * a.size[1]):.3f}%  ({n}px / {a.size[0]}x{a.size[1]})")
`, a, c]).toString().trim();
    return out;
  } catch (e) {
    return `比べられず: ${e.message.slice(0, 80)}`;
  }
}

for (const path of PAGES) {
  for (const [w, h, tag] of [[390, 844, "phone"], [1280, 900, "pc"]]) {
    const name = path.replace(/[^a-z]/g, "") || "top";
    const fa = `${OUT}/${name}-${tag}-A.png`;
    const fb = `${OUT}/${name}-${tag}-B.png`;
    const ra = await shoot(A, path, w, h, fa);
    const rb = await shoot(B, path, w, h, fb);
    const same = ra.text === rb.text;
    console.log(`${path.padEnd(14)} ${tag.padEnd(6)} 字=${same ? "同じ" : "★ちがう"}  画素 ${diffPct(fa, fb)}`);
    if (!same) {
      writeFileSync(`${OUT}/${name}-${tag}-A.txt`, ra.text);
      writeFileSync(`${OUT}/${name}-${tag}-B.txt`, rb.text);
    }
  }
}
await b.close();
console.log(`\n絵 -> ${OUT}`);
