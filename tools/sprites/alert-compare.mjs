/**
 * 投げ銭アラートの段を、**アラートが出てから同じ秒**で止めて撮り、段ごとに1行で並べる（段1〜7の見比べ）。
 *
 *   cd tools/sprites
 *   node alert-compare.mjs --base http://localhost:4349 --bg /path/to/prism-street.jpg \
 *        --char /path/to/panda.png --out /tmp/compare.png
 *   node alert-compare.mjs ... --amounts 1500,10000 --times 0.5,2,3,4.5,8,20
 *
 * - 時計は `alert-overlap.mjs` の FREEZE で止める（そのまま読んで使う。写さない）。秒は
 *   キャラ絵の箱が置かれた瞬間（アラートの頭）から数える
 * - アラートの面は、ふだんの箱（縦の配信 1080×1920 の上の `--frame 401,722,607,1082`、
 *   `--zoom 1.39`。alert-record.mjs の録画と同じ）の大きさで描き、配信画面のその部分に重ねる
 * - 行の頭に段の額、列の頭に秒を書く
 *
 * PRISM の縮み方（`visualViewport.scale = 0.5`。豚だけが半分に描かれ、雨の落ちる先も半分の高さ）を
 * **既定で入れて撮る**（`prism.mjs`。`docs/island-misses.md` #311）。`--no-prism` で外すのは、
 * 外したときの数を見る対照だけ。外した数で判断しない。
 *
 * 終了コード: 0 = 撮れた / 2 = 撮れなかった
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { chromePath } from "./chrome.mjs";
import { prism, prismNote } from "./prism.mjs";

const here = dirname(fileURLToPath(import.meta.url));
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] != null ? process.argv[i + 1] : fallback;
}
function die(msg) {
  console.error(msg);
  process.exit(2);
}

const base = arg("base", "http://localhost:4338").replace(/\/$/, "");
const amounts = arg("amounts", "100,300,700,1500,3000,7000,10000").split(",").map(Number);
const times = arg("times", "0.5,1.5,3,4.5,6,8,15").split(",").map(Number);
const bgFile = resolve(arg("bg", ""));
if (!existsSync(bgFile)) die(`配信画面が無い: ${bgFile}`);
const charFile = resolve(arg("char", ""));
if (!existsSync(charFile)) die(`キャラ絵が無い: ${charFile}`);
const [fx, fy, fw, fh] = arg("frame", "401,722,607,1082").split(",").map(Number);
const zoom = Number(arg("zoom", "1.39"));
const scale = Number(arg("scale", "0.45"));
const theme = arg("theme", "halloween");
const name = arg("name", "おためし");
const msg = arg("msg", "これは試し表示です");
const out = resolve(arg("out", "/tmp/alert-compare.png"));
const exe = chromePath() ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : null);
if (!exe) die("ブラウザが見つからない（chrome.mjs）");

/* 時計を止める仕掛けは alert-overlap.mjs のものを読む（写しを作ると片方だけ直る） */
const FREEZE = (() => {
  const src = readFileSync(join(here, "alert-overlap.mjs"), "utf8");
  const m = /const FREEZE = `([\s\S]*?)`;\n/.exec(src);
  if (!m) die("alert-overlap.mjs に FREEZE が見つからない");
  return m[1];
})();

const W = Math.round(fw / zoom);
const H = Math.round(fh / zoom);
const b64 = (buf) => buf.toString("base64");

async function shotsFor(browser, amount) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: zoom });
  await prism(ctx);
  await ctx.addInitScript(FREEZE);
  const charBody = readFileSync(charFile);
  await ctx.route("**/*", (r) => {
    const u = r.request().url();
    if (u.includes("cloudfront.net")) return r.fulfill({ contentType: "image/png", body: charBody, headers: { "access-control-allow-origin": "*" } });
    return u.startsWith(base) || u.startsWith("data:") || u.startsWith("blob:") ? r.continue() : r.abort();
  });
  const page = await ctx.newPage();
  const q = new URLSearchParams({ preview: "1", theme, amount: String(amount), name, msg });
  const cells = [];
  try {
    await page.goto(`${base}/alertbox/?${q}`, { waitUntil: "load", timeout: 30000 });
    await page.waitForFunction(() => window.__ovl && window.__ovl.t0 != null, null, { timeout: 20000, polling: 50 });
    for (const t of times) {
      await page.waitForFunction((s) => performance.now() - window.__ovl.t0 >= s * 1000, t, { timeout: (t + 30) * 1000, polling: 30 });
      await page.evaluate(() => window.__ovl.freeze());
      await page.waitForTimeout(80);
      cells.push(await page.screenshot({ omitBackground: true, animations: "allow" }));
      await page.evaluate(() => window.__ovl.unfreeze());
    }
  } finally {
    await ctx.close();
  }
  return cells;
}

async function main() {
  console.log(prismNote());
  const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox", "--no-proxy-server"] });
  const rows = [];
  for (const a of amounts) {
    console.log(`  ${a}円`);
    rows.push({ a, cells: await shotsFor(browser, a) });
  }
  // 並べる: 配信画面の箱の部分を地にして、その上にアラートの面を重ねる
  const cw = Math.round(fw * scale);
  const ch = Math.round(fh * scale);
  const bg = `data:image/jpeg;base64,${b64(readFileSync(bgFile))}`;
  const bgW = 1080 * scale;
  const bgH = 1920 * scale;
  const cell = (png) =>
    `<td><div class="c" style="width:${cw}px;height:${ch}px;background:url(${bg}) ${-fx * scale}px ${-fy * scale}px / ${bgW}px ${bgH}px no-repeat">` +
    `<img src="data:image/png;base64,${b64(png)}" width="${cw}" height="${ch}"></div></td>`;
  const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#15151c;font:600 15px system-ui,sans-serif;color:#fff}
table{border-collapse:separate;border-spacing:6px}td{padding:0;vertical-align:middle}
.c{position:relative;overflow:hidden}.c img{position:absolute;left:0;top:0}
th{font-weight:700;padding:4px}.amt{writing-mode:vertical-rl;padding:0 4px}
</style><table><tr><th></th>${times.map((t) => `<th>${t}秒</th>`).join("")}</tr>
${rows.map((r) => `<tr><th class="amt">${r.a.toLocaleString()}円</th>${r.cells.map(cell).join("")}</tr>`).join("\n")}
</table>`;
  const ctx = await browser.newContext({ viewport: { width: 60 + (cw + 6) * times.length, height: 600 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: "load" });
  writeFileSync(out, await page.screenshot({ fullPage: true }));
  await browser.close();
  console.log(`一覧 ${out}（${amounts.length} 段 × ${times.length} 秒）`);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
