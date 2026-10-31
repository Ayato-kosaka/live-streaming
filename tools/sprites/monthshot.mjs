/**
 * 月ごとのふりかえり（`/months`）を、スマホ幅と PC で撮る。
 *
 *   tools/build.sh 3320
 *   python3 -m http.server 4320 --directory site/.next-3320 &
 *   python3 tools/sprites/avatars.py          # 顔を先に落とす
 *   SPORT=4320 OUT=/tmp/mshot node tools/sprites/monthshot.mjs
 *
 * **顔は先に落としてから撮る。** 落とさずに撮ると全員が頭文字の丸になって、
 * 並びを見ても何も分からない（`CLAUDE.md`）。
 *
 * 出すのは絵だけではない。撮るついでに数える:
 *   - 横あふれ（`scrollWidth > innerWidth`）
 *   - 画面に出ている「円」の字（額を出してよい面かどうかの突き合わせ用）
 *   - 面の高さ（**いちばん下まで送ってから**測る。畳みは開いてから）
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";
import { offline, offlineTally } from "./route.mjs";

const PORT = process.env.SPORT || "4320";
const OUT = process.env.OUT || "/tmp/mshot";
const KEYS = ["2026-09", "2026-08", "2026-07", "2026-06", "2026-05", "2026-04", "2026-03", "2026-02", "2026-01"];
const PAGES = ["/months.html", ...KEYS.map((k) => `/months/${k}.html`)];

mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({
  executablePath: process.env.PW_CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

let bad = 0;
for (const [label, size, dpr] of [["sp", { width: 390, height: 844 }, 2], ["pc", { width: 1280, height: 900 }, 1]]) {
  // PC は dpr1。長い面を dpr2 で全ページ撮ると、1枚が 30秒を超えて落ちる
  const ctx = await b.newContext({ viewport: size, deviceScaleFactor: dpr });
  await offline(ctx);
  const p = await ctx.newPage();
  for (const path of PAGES) {
    const r = await p.goto(`http://127.0.0.1:${PORT}${path}`, { waitUntil: "networkidle" });
    if (!r || r.status() !== 200) {
      console.log(`NG ${path} [${r ? r.status() : "no response"}]`);
      bad += 1;
      continue;
    }
    // **いちばん下まで送ってから測る。** 畳みは閉じたまま 68px で報告される
    await p.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => requestAnimationFrame(() => r()));
      }
      window.scrollTo(0, 0);
    });
    await p.waitForTimeout(400);
    const m = await p.evaluate(() => ({
      h: document.documentElement.scrollHeight,
      over: document.documentElement.scrollWidth - window.innerWidth,
      h1: document.querySelector("h1")?.textContent || "",
      yen: (document.body.innerText.match(/円/g) || []).length,
      err: [...document.querySelectorAll("img")].filter((i) => i.complete && i.naturalWidth === 0).length,
    }));
    const name = path.replace(/\//g, "_").replace(".html", "");
    await p.screenshot({ path: `${OUT}/${label}${name}.png`, fullPage: true, timeout: 90000 });
    const flag = m.over > 0 || m.err > 0 ? "NG" : "ok";
    if (flag === "NG") bad += 1;
    console.log(`${flag} ${label} ${path} h1=${m.h1} 高さ=${m.h} はみ出し=${m.over} 円=${m.yen} 描けない絵=${m.err}`);
  }
  await ctx.close();
}
await b.close();
console.error("route:", JSON.stringify(offlineTally()));
console.log(bad ? `NG ${bad}件` : `${PAGES.length * 2}枚、問題なし`);
process.exit(bad ? 1 : 0);
