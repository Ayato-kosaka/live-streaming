/**
 * 投げ銭アラートの字（名前・額・メッセージ）が、**箱の縁で切れていないか**を、描かれた画素で数える。
 *
 *   cd tools/sprites
 *   node alert-textfit.mjs --base http://localhost:4349 --out /tmp/alert-textfit
 *
 * オーナーの決まり（2026-10-24）: 本文（メッセージ）は見切れないこと。行数で切らず、… も使わず、
 * 全文を折り返して出す。長いメッセージ（200字前後・改行・絵文字）でも箱の左右・上下で切れない。
 *
 * 字の層（`data-plate="slot"`）だけを残して、ほかを全部見えなくし、地を透明にして撮る。
 * **箱の縁から 2px の帯に、字の画素（不透明）が1つでもあれば「切れた」**。あわせて、字の
 * 行の矩形が箱の中にあるか（DOM）と、メッセージの全文が描かれているか（textContent）も見る。
 * 撮る秒は、字が出そろって止まったあと（段7の数え上げ・段4の書き終わりのあと）。
 *
 * 終了コード: 0 = 全部収まった / 1 = 切れた組がある / 2 = 測れなかった
 */
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { chromePath } from "./chrome.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] != null ? process.argv[i + 1] : fallback;
}
const base = arg("base", "http://localhost:4338").replace(/\/$/, "");
const out = resolve(arg("out", "/tmp/alert-textfit"));
const amounts = arg("amounts", "100,300,700,1500,3000,7000,10000").split(",").map(Number);
const sizes = arg("sizes", "436x776,664x1180").split(",").map((s) => s.split("x").map(Number));
const DPR = Number(arg("dpr", "2"));
const jobs = Math.max(1, Number(arg("jobs", "3")));
const BAND = 2;
mkdirSync(out, { recursive: true });

/* 長い名前と、長いメッセージ（約200字・改行・絵文字）。短い組も1つ（ふだんの形が壊れていないか） */
const LONG_NAME = "もっと豆挽けコーヒー商店の店長さんいつもありがとう";
const LONG_MSG =
  "今日はマジ緊急の緊急で疲れてしもたな！🎃パンパンでパンと豆挽こうぜ！！\n" +
  "ハロウィンの配信、毎年たのしみにしてます👻 去年のかぼちゃのランタンの回がほんとに好きで、" +
  "あれから毎晩ちょっとずつ見返してました。今年もお菓子いっぱい用意してるので、" +
  "最後まで見届けます！🍬🍭🍫 体だけは気をつけて、無理せず続けてくださいね。" +
  "\nあ、それと来週の企画もめちゃくちゃ気になってます✨✨";
const TEXTS = [
  { key: "long", name: LONG_NAME, msg: LONG_MSG },
  { key: "short", name: "おためし", msg: "ありがと〜！" },
];
/* 字が出そろって止まる秒 */
const settleAt = (theme, a) => (theme !== "halloween" ? 3 : a >= 10000 ? 12 : a >= 5000 ? 10 : a >= 1000 ? 9 : 4);

async function one(browser, { theme, a, size: [W, H], text }) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
  try {
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      return u.startsWith(base) || u.startsWith("data:") ? r.continue() : r.abort();
    });
    const p = await ctx.newPage();
    const q = new URLSearchParams({ preview: "1", theme, amount: String(a), name: text.name, msg: text.msg });
    await p.goto(`${base}/alertbox/?${q}`, { waitUntil: "load" });
    await p.waitForSelector('[data-plate="slot"]', { state: "attached", timeout: 30000 });
    await p.waitForTimeout(settleAt(theme, a) * 1000);
    await p.evaluate(() => {
      document.getAnimations().forEach((x) => x.pause());
      window.requestAnimationFrame = () => 0;
    });
    // 字の層だけ残す（祖先は見せる、ほかは隠す）。地は透明
    const dom = await p.evaluate(() => {
      const slot = document.querySelector('[data-plate="slot"]');
      const keep = new Set();
      for (let e = slot; e; e = e.parentElement) keep.add(e);
      for (const el of document.body.querySelectorAll("*")) {
        if (keep.has(el) || slot.contains(el)) continue;
        el.style.setProperty("visibility", "hidden", "important");
      }
      document.documentElement.style.background = "transparent";
      document.body.style.background = "transparent";
      for (const e of keep) if (e instanceof HTMLElement) e.style.setProperty("background", "transparent", "important");
      const fill = slot.querySelectorAll('[data-ink="fill"]');
      const msgEl = [...fill].find((e) => e.tagName === "DIV");
      const rects = [];
      const range = document.createRange();
      const walk = document.createTreeWalker(slot, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (!n.textContent.trim()) continue;
        range.selectNodeContents(n);
        for (const r of range.getClientRects()) rects.push([r.left, r.top, r.right, r.bottom]);
      }
      return {
        msgText: msgEl ? msgEl.textContent : null,
        msgFont: msgEl ? getComputedStyle(msgEl.parentElement).fontSize : null,
        outside: rects.filter(([l, t, r, b]) => l < 0 || t < 0 || r > innerWidth || b > innerHeight).length,
        rects: rects.length,
      };
    });
    const nm = `${theme}-${a}-${W}x${H}-${text.key}`;
    const buf = await p.screenshot({ path: join(out, `${nm}.png`), omitBackground: true });
    // 縁の帯の不透明な画素を数える（ブラウザの中で PNG を読む）
    const edge = await p.evaluate(
      async ({ b64, band }) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const g = c.getContext("2d");
        g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        let any = 0;
        for (let y = 0; y < c.height; y++)
          for (let x = 0; x < c.width; x++) {
            const al = d[(y * c.width + x) * 4 + 3];
            if (al > 24) {
              any++;
              if (x < band || y < band || x >= c.width - band || y >= c.height - band) n++;
            }
          }
        return { n, any };
      },
      { b64: buf.toString("base64"), band: BAND * DPR }
    );
    const full = dom.msgText === text.msg;
    return { nm, theme, a, W, H, text: text.key, edge: edge.n, ink: edge.any, outside: dom.outside, full, msgFont: dom.msgFont };
  } finally {
    await ctx.close();
  }
}

async function main() {
  const browser = await chromium.launch({ executablePath: chromePath() ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--no-proxy-server"] });
  const queue = [];
  for (const theme of ["halloween", "none"])
    for (const a of theme === "none" ? [1500] : amounts) for (const size of sizes) for (const text of TEXTS) queue.push({ theme, a, size, text });
  const rows = [];
  const errs = [];
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      try {
        const r = await one(browser, job);
        rows.push(r);
        console.log(`${r.nm}: 縁の字の画素 ${r.edge} / 箱の外の行 ${r.outside} / 全文 ${r.full ? "○" : "×"} / メッセージ ${r.msgFont}`);
      } catch (e) {
        errs.push(`${job.theme} ${job.a} ${job.size.join("x")} ${job.text.key}: ${String(e).slice(0, 160)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: jobs }, worker));
  await browser.close();
  const bad = rows.filter((r) => r.edge > 0 || r.outside > 0 || !r.full || r.ink === 0);
  console.log(`\n${rows.length} 組。切れた・欠けた組 ${bad.length}`);
  for (const r of bad) console.log(`  ${r.nm}: 縁 ${r.edge} / 外 ${r.outside} / 全文 ${r.full} / 字の画素 ${r.ink}`);
  if (errs.length) {
    console.log(`測れなかった ${errs.length}:`);
    for (const e of errs) console.log("  " + e);
  }
  process.exit(errs.length || !rows.length ? 2 : bad.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
