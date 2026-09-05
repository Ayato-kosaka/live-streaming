/**
 * 性能を数字で出す。
 *
 * 「速くなった気がする」で終わらせないために作った。書き出したものを静的に配って、
 * スマホ幅で開き、次の3つを測る。
 *
 *   1. 出るまで  … FCP / LCP / DOMContentLoaded。開いてから絵が出るまで
 *   2. 重さ      … 転送バイト数、DOMノード数、SVG要素数、画像枚数
 *   3. 動き      … 最初の3秒（島の到着演出）と、そのあとのスクロール中のフレーム時間
 *
 * 動きは requestAnimationFrame の間隔をそのまま集める。16.7ms を超えた回数と
 * 最悪値（p95）を見れば、カクついているかどうかは数字で分かる。
 *
 * 使い方:
 *   cd site && NEXT_DIST_DIR=.next-verify npx next build
 *   python3 -m http.server 4321 --directory .next-verify &
 *   cd ../tools/sprites && node perf.mjs            # 全ページの要約
 *   node perf.mjs / /nordic                          # ページを絞る
 *   node perf.mjs --save before                      # 記録して、あとで比べる
 *   node perf.mjs --diff before                      # 記録と比べる
 */
import { chromium } from "playwright-core";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";

const SPORT = process.env.SPORT || "4321";
const BASE = `http://localhost:${SPORT}`;
const STORE = "/home/user/live-streaming/tools/sprites/.perf";

const argv = process.argv.slice(2);
const saveAs = pick("--save");
const diffWith = pick("--diff");
function pick(flag) {
  const i = argv.indexOf(flag);
  if (i < 0) return null;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
}

/** 既定は「重いはずの面」だけ。島は演出があるので必ず入れる。 */
const pages = argv.length ? argv : ["/", "/nordic", "/map", "/kitchen", "/streams", "/next", "/board", "/friends"];

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
// 実機のスマホに寄せる。ここを速い設定にすると、カクつきが見えなくなって意味がない。
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
});
// このサンドボックスからは外の画像に出られないので差し替える（本番では出る）
await ctx.route(/googleusercontent\.com|upload\.wikimedia\.org|instagram\.com|ytimg\.com|youtube\.com/, (r) =>
  r.fulfill({ path: "/home/user/live-streaming/site/public/og.png" }),
);
await ctx.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));

const out = {};
for (const path of pages) {
  const p = await ctx.newPage();
  // CPU を4倍遅くする。手元の速いマシンで測ると、スマホのカクつきが出ない。
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  let bytes = 0;
  p.on("response", async (r) => {
    const len = Number(r.headers()["content-length"] || 0);
    if (len) bytes += len;
  });

  // 画面が出る前から rAF を仕掛けておかないと、いちばんカクつく最初の数フレームを取り逃す
  await p.addInitScript(() => {
    window.__f = [];
    let last = 0;
    const tick = (t) => {
      if (last) window.__f.push(t - last);
      last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  // 書き出したものを python の http.server で配ると、cleanUrls が効かない。
  // 本番の Firebase Hosting は /nordic で nordic.html を返すので、ここでも同じに寄せる。
  const url = BASE + (path === "/" ? "/index.html" : path.replace(/\/$/, "") + ".html");
  const t0 = Date.now();
  await p.goto(url, { waitUntil: "load", timeout: 60000 });
  // 到着演出は3.4秒。終わりきるまで待って、その間のフレームを演出ぶんとして切り出す
  await p.waitForTimeout(3600);
  const open = await p.evaluate(() => window.__f.splice(0));

  // スクロールしながらのフレーム。指で送ったときの重さはここに出る
  await p.evaluate(() => window.scrollTo(0, 0));
  for (let i = 0; i < 12; i++) {
    await p.mouse.wheel(0, 420);
    await p.waitForTimeout(120);
  }
  const scroll = await p.evaluate(() => window.__f.splice(0));

  const m = await p.evaluate(() => {
    const paint = performance.getEntriesByType("paint");
    const nav = performance.getEntriesByType("navigation")[0] || {};
    const lcp = window.__lcp || 0;
    return {
      fcp: Math.round(paint.find((e) => e.name === "first-contentful-paint")?.startTime ?? 0),
      dcl: Math.round(nav.domContentLoadedEventEnd ?? 0),
      load: Math.round(nav.loadEventEnd ?? 0),
      lcp: Math.round(lcp),
      nodes: document.querySelectorAll("*").length,
      svg: document.querySelectorAll("svg *").length,
      imgs: document.querySelectorAll("img").length,
      listeners: 0,
    };
  });

  out[path] = {
    ...m,
    kb: Math.round(bytes / 1024),
    wall: Date.now() - t0,
    open: stat(open),
    scroll: stat(scroll),
  };
  await p.close();
}
await b.close();

/** フレーム間隔の要約。長い1本より、16.7ms 超えの本数のほうが体感に近い。 */
function stat(fr) {
  const f = fr.filter((x) => x > 0 && x < 400).sort((a, b) => a - b);
  if (!f.length) return { n: 0, p50: 0, p95: 0, jank: 0, worst: 0 };
  const at = (q) => Math.round(f[Math.min(f.length - 1, Math.floor(f.length * q))] * 10) / 10;
  return {
    n: f.length,
    p50: at(0.5),
    p95: at(0.95),
    jank: f.filter((x) => x > 20).length,
    worst: Math.round(f[f.length - 1]),
  };
}

const pad = (s, n) => String(s).padEnd(n);
const num = (s, n) => String(s).padStart(n);
console.log(
  pad("page", 12) + num("FCP", 6) + num("LCP", 6) + num("KB", 6) + num("nodes", 7) + num("svg", 6) +
    num("開p50", 7) + num("開p95", 7) + num("開落ち", 7) + num("巻p95", 7) + num("巻落ち", 7),
);
for (const [k, v] of Object.entries(out)) {
  console.log(
    pad(k, 12) + num(v.fcp, 6) + num(v.lcp, 6) + num(v.kb, 6) + num(v.nodes, 7) + num(v.svg, 6) +
      num(v.open.p50, 7) + num(v.open.p95, 7) + num(v.open.jank, 7) + num(v.scroll.p95, 7) + num(v.scroll.jank, 7),
  );
}

if (saveAs) {
  if (!existsSync(STORE)) mkdirSync(STORE, { recursive: true });
  writeFileSync(`${STORE}/${saveAs}.json`, JSON.stringify(out, null, 2));
  console.log(`\n記録した: ${STORE}/${saveAs}.json`);
}
if (diffWith) {
  const old = JSON.parse(readFileSync(`${STORE}/${diffWith}.json`, "utf8"));
  console.log(`\n${diffWith} との差（マイナスが改善）`);
  for (const [k, v] of Object.entries(out)) {
    const o = old[k];
    if (!o) continue;
    const d = (a, b) => (a - b >= 0 ? "+" : "") + Math.round((a - b) * 10) / 10;
    console.log(
      pad(k, 12) +
        num("FCP " + d(v.fcp, o.fcp), 12) +
        num("KB " + d(v.kb, o.kb), 11) +
        num("nodes " + d(v.nodes, o.nodes), 13) +
        num("開落ち " + d(v.open.jank, o.open.jank), 12) +
        num("巻p95 " + d(v.scroll.p95, o.scroll.p95), 13),
    );
  }
}
