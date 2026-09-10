/**
 * 島じゅうの「22時」を、日をまたいで数える。
 *
 * 静的書き出しなので、時刻の言い方は**焼いた HTML**と**画面が出たあとの DOM**の
 * 2つに出る。片方だけ見ると見落とす（板は画面が出てから差し込む）。
 * だから両方を数えて、当たった文の前後も出す。**grep でふるい落とさない。**
 *
 *   cd tools/sprites
 *   SPORT=4140 DIST=../../site/.next-3140 DATES=2026-09-10T03:00:00Z node nightcount.mjs
 *
 *   DATES  進める日（ISO、カンマ区切り）
 *   SPORT  書き出したものを配っている静的サーバのポート
 *   ONLY   見る面をしぼる（前方一致、カンマ区切り）
 */
import { chromium } from "playwright-core";
import { readdirSync, statSync, readFileSync } from "fs";
import { join } from "path";

const SPORT = process.env.SPORT || "4140";
const root = process.env.DIST || "/home/user/night-wt/site/.next-3140";
const DATES = (process.env.DATES || "2026-09-10T03:00:00Z").split(",");
const ONLY = (process.env.ONLY || "").split(",").filter(Boolean);
const NEEDLE = "22時";

function walk(d, base = "") {
  let out = [];
  for (const f of readdirSync(d)) {
    if (f === "_next" || f === "cache" || f === "server" || f === "static") continue;
    const p = join(d, f);
    if (statSync(p).isDirectory()) out = out.concat(walk(p, base + "/" + f));
    else if (f.endsWith(".html")) out.push(base + "/" + f);
  }
  return out;
}
let pages = walk(root).sort();
if (ONLY.length) pages = pages.filter((p) => ONLY.some((o) => p.startsWith(o)));

function hits(text) {
  const out = [];
  let i = 0;
  for (;;) {
    const at = text.indexOf(NEEDLE, i);
    if (at < 0) break;
    out.push(text.slice(Math.max(0, at - 45), at + 45).replace(/\s+/g, " "));
    i = at + NEEDLE.length;
  }
  return out;
}

// 1) 焼いた HTML（日付によらない）
let baked = 0;
const bakedWhere = [];
for (const page of pages) {
  const h = hits(readFileSync(join(root, page), "utf8"));
  if (h.length) {
    baked += h.length;
    bakedWhere.push([page, h]);
  }
}
console.log(`=== 焼いた HTML: ${baked}件 / ${pages.length}面 ===`);
for (const [page, h] of bakedWhere) for (const s of h) console.log(`  ${page}  …${s}…`);

function clockScript(iso) {
  return `(() => {
    const FAKE = ${Date.parse(iso)};
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
  })();`;
}

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
for (const iso of DATES) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.route(/googleusercontent\.com|upload\.wikimedia\.org|instagram\.com|ytimg\.com|youtube\.com/,
    (r) => r.fulfill({ path: "/home/user/live-streaming/site/public/og.png" }));
  await ctx.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.addInitScript(clockScript(iso));
  const p = await ctx.newPage();
  let dom = 0;
  const where = [];
  const hyd = [];
  p.on("console", (m) => {
    const t = m.text();
    if (/#418|#423|#425|Hydration|hydrat/i.test(t)) hyd.push(t.slice(0, 120));
  });
  for (const page of pages) {
    await p.goto(`http://localhost:${SPORT}` + page, { waitUntil: "domcontentloaded", timeout: 45000 });
    await p.waitForTimeout(700);
    /* **畳んだまま数えない。** `content-visibility: auto` の中は、画面の外にいる
       あいだ innerText に出ない。いちばん下まで送ってから数える（`CLAUDE.md`）。 */
    await p.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 30));
      }
      window.scrollTo(0, 0);
    });
    await p.waitForTimeout(300);
    /* 字は文字ノードから拾う。script / style は画面に出ないので外す
       （RSC の受け渡しデータまで数えると、出ていないものを数えることになる）。 */
    const text = await p.evaluate(() => {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) =>
          /^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT)$/.test(n.parentElement?.tagName ?? "")
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT,
      });
      const out = [];
      for (let n = w.nextNode(); n; n = w.nextNode()) out.push(n.nodeValue);
      for (const el of document.querySelectorAll("img[alt]")) out.push(el.getAttribute("alt"));
      return out.join(" \u0001 ");
    });
    const h = hits(text);
    if (h.length) {
      dom += h.length;
      where.push([page, h]);
    }
  }
  console.log(`\n=== ${iso} の DOM: ${dom}件 / ${pages.length}面（水あわせの警告 ${hyd.length}件）===`);
  for (const [page, h] of where) for (const s of h) console.log(`  ${page}  …${s}…`);
  for (const s of hyd.slice(0, 5)) console.log("  hydration:", s);
  await ctx.close();
}
await b.close();
