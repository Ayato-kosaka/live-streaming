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
 * ## 転送量は「素のバイト数」で見ない
 *
 * Firebase Hosting は文字ものを勝手に縮めて配る。素のバイト数だけを見ていると、
 * ほとんど空気でできている HTML と RSC が上位に並んで、順番を読み違える。
 * ここでは**素**と**縮めたあと（brotli）**の両方を出す。直す順番は縮めたあとで決める。
 *
 *   例: index.html は素 351KB → 縮めて 78KB。書体は 890KB → 縮めても 890KB。
 *       重いのは書体のほうで、HTML ではない。
 *
 * ## 「読み込み」と「巻いたあと」を分けて出す
 *
 * Next の <Link> は画面に入るたび、その行き先の RSC(`*.txt?_rsc=`)と JS を先に取る。
 * これは開いた時点では出ないので、巻いてはじめて増える。**その差が先読みの値段**。
 *
 * ## before.json とは比べられない
 *
 * `.perf/before.json` は測り方が変わる前の記録。当時は外に出られない画像すべてに
 * og.png(470KB)を返していて、住人アイコン12枚だけで 5.6MB を数えていた。
 * DOM ノード数も、そのころとは画面の作りが違う。**転送量とノード数は
 * before と比べないこと。** 新しい基準は `.perf/after.json`。
 *
 * 使い方:
 *   cd site && NEXT_DIST_DIR=.next-verify npx next build
 *   python3 -m http.server 4350 --directory .next-verify &
 *   cd ../tools/sprites && SPORT=4350 node perf.mjs      # 全ページの要約
 *   SPORT=4350 node perf.mjs / /nordic                    # ページを絞る
 *   SPORT=4350 node perf.mjs --top 15                     # 大きい順にファイルを並べる
 *   SPORT=4350 node perf.mjs --save after                 # 記録して、あとで比べる
 *   SPORT=4350 node perf.mjs --diff after                 # 記録と比べる
 */
import { chromium } from "playwright-core";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { brotliCompressSync, constants } from "zlib";
import { offline } from "./route.mjs";

const SPORT = process.env.SPORT || "4321";
const BASE = `http://localhost:${SPORT}`;
const STORE = "/home/user/live-streaming/tools/sprites/.perf";

const argv = process.argv.slice(2);
const saveAs = pick("--save");
const diffWith = pick("--diff");
const topN = Number(pick("--top") || 0);
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
// 外に出られない先の差し替えは route.mjs に任せる。住人は1人ずつ本番と同じ絵
// （`python3 avatars.py` で落としたもの）が返るので、12人ぶんの重さが本物になる。
// 写真は本番の横500前後の JPEG に寄せる。og.png(470KB)を返すと数字が読めない。
await offline(ctx, { photo: "/home/user/live-streaming/tools/sprites/photo-480.jpg" });

/** URL を見て、何の種類のファイルかを決める。直す担当を分けるための粒度。 */
function kindOf(url, type) {
  if (/\.txt\?_rsc=|_rsc=/.test(url)) return "先読み";
  if (/\.woff2?($|\?)/.test(url)) return "書体";
  if (/\.css($|\?)/.test(url)) return "CSS";
  if (/\.js($|\?)/.test(url)) return "JS";
  if (/\.html($|\?)/.test(url)) return "HTML";
  if (/\.(png|jpe?g|webp|avif|gif|svg)($|\?)/.test(url)) return "画像";
  if (type === "image") return "画像";
  if (type === "script") return "JS";
  if (type === "stylesheet") return "CSS";
  if (type === "font") return "書体";
  return "他";
}
const KINDS = ["HTML", "CSS", "JS", "書体", "画像", "先読み", "他"];

/** 縮めたあとの大きさ。Hosting は brotli で配るので、そこに寄せる。 */
const brotli = (buf) =>
  brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }).length;

const out = {};
for (const path of pages) {
  const p = await ctx.newPage();
  // CPU を4倍遅くする。手元の速いマシンで測ると、スマホのカクつきが出ない。
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  // 応答の中身を読むのは await なので、ページを閉じる前に全部そろうまで待つ。
  // 待たずに閉じると body() が空で返ってきて、書体が 890KB → 47KB に化ける。
  const res = [];
  const pending = [];
  p.on("response", (r) => {
    pending.push(
      (async () => {
        let raw = 0;
        try {
          const buf = await r.body();
          raw = buf.length;
          res.push({ url: r.url().replace(BASE, ""), type: r.request().resourceType(), raw, br: brotli(buf), t: Date.now() });
          return;
        } catch {
          // 画像など body が取れないものは content-length で拾う
          raw = Number(r.headers()["content-length"] || 0);
          if (raw) res.push({ url: r.url().replace(BASE, ""), type: r.request().resourceType(), raw, br: raw, t: Date.now() });
        }
      })(),
    );
  });

  // 画面が出る前から rAF を仕掛けておかないと、いちばんカクつく最初の数フレームを取り逃す
  await p.addInitScript(() => {
    // LCP は誰も入れていなくて、ずっと 0 が出ていた。ここで観測して置いておく
    window.__lcp = 0;
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) window.__lcp = e.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch {}
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
  await Promise.all(pending.splice(0));
  const tLoad = Date.now();

  // スクロールしながらのフレーム。指で送ったときの重さはここに出る。
  // **一気に下まで飛ばさないこと。** 飛ばすと途中の <Link> が画面に入らず、
  // 先読みが起きないので「先読みは軽い」という嘘の数字になる。指で送るのと同じに刻む。
  await p.evaluate(() => window.scrollTo(0, 0));
  for (let i = 0; i < 24; i++) {
    await p.mouse.wheel(0, 420);
    await p.waitForTimeout(120);
  }
  await p.waitForTimeout(800);
  const scroll = await p.evaluate(() => window.__f.splice(0));
  await Promise.all(pending.splice(0));

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

  // 同じ URL を2回取っていても、数えるのは1回だけ。
  // python の http.server は Cache-Control を付けないので、同じ絵を何度でも取りに
  // いってしまう。本番の Hosting はキャッシュを付けるので、そのぶんは払わない。
  // （実測: 住人アイコン12枚がちょうど2回ずつ来て、それだけで 250KB 水増しされていた）
  const seen = new Set();
  const uniq = [];
  let refetch = 0;
  for (const r of res) {
    if (seen.has(r.url)) { refetch++; continue; }
    seen.add(r.url);
    uniq.push(r);
  }

  // 読み込みぶんと、巻いてから増えたぶんに分ける
  const sum = (rows, f) => rows.reduce((s, r) => s + r[f], 0);
  const atLoad = uniq.filter((r) => r.t <= tLoad);
  const byKind = {};
  for (const k of KINDS) {
    const rows = uniq.filter((r) => kindOf(r.url, r.type) === k);
    if (rows.length) byKind[k] = { n: rows.length, raw: kb(sum(rows, "raw")), br: kb(sum(rows, "br")) };
  }

  out[path] = {
    ...m,
    reqs: uniq.length,
    refetch,
    kb: kb(sum(uniq, "raw")),
    br: kb(sum(uniq, "br")),
    loadKb: kb(sum(atLoad, "raw")),
    loadBr: kb(sum(atLoad, "br")),
    byKind,
    top: [...uniq].sort((a, x) => x.raw - a.raw).slice(0, 25).map((r) => ({ url: r.url, raw: kb(r.raw), br: kb(r.br) })),
    wall: Date.now() - t0,
    open: stat(open),
    scroll: stat(scroll),
  };
  await p.close();
}
await b.close();

function kb(n) {
  return Math.round(n / 1024);
}

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

console.log("■ 出るまでと、動き");
console.log(
  pad("page", 12) + num("FCP", 6) + num("LCP", 6) + num("nodes", 7) + num("svg", 6) +
    num("開p50", 7) + num("開p95", 7) + num("開落ち", 7) + num("巻p95", 7) + num("巻落ち", 7),
);
for (const [k, v] of Object.entries(out)) {
  console.log(
    pad(k, 12) + num(v.fcp, 6) + num(v.lcp, 6) + num(v.nodes, 7) + num(v.svg, 6) +
      num(v.open.p50, 7) + num(v.open.p95, 7) + num(v.open.jank, 7) + num(v.scroll.p95, 7) + num(v.scroll.jank, 7),
  );
}

console.log("\n■ 転送量（縮めたあとが本番の値段。かっこの中が素のバイト数）");
console.log(
  pad("page", 12) + num("本数", 6) + num("読込br", 9) + num("全部br", 9) + num("先読みbr", 10) +
    KINDS.map((k) => num(k, 8)).join(""),
);
for (const [k, v] of Object.entries(out)) {
  console.log(
    pad(k, 12) + num(v.reqs, 6) + num(v.loadBr, 9) + num(v.br, 9) +
      num(v.byKind["先読み"]?.br ?? 0, 10) +
      KINDS.map((kk) => num(v.byKind[kk]?.br ?? 0, 8)).join("") +
      "   素 " + v.kb + "KB",
  );
}

if (topN) {
  for (const [k, v] of Object.entries(out)) {
    console.log(`\n■ ${k} 大きい順（縮めたあと / 素）`);
    for (const r of v.top.slice(0, topN)) {
      console.log(`  ${num(r.br, 6)}KB ${num("(" + r.raw + ")", 9)}  ${r.url.slice(0, 88)}`);
    }
  }
}

if (saveAs) {
  if (!existsSync(STORE)) mkdirSync(STORE, { recursive: true });
  writeFileSync(`${STORE}/${saveAs}.json`, JSON.stringify(out, null, 2));
  console.log(`\n記録した: ${STORE}/${saveAs}.json`);
}
if (diffWith) {
  const old = JSON.parse(readFileSync(`${STORE}/${diffWith}.json`, "utf8"));
  console.log(`\n${diffWith} との差（マイナスが改善）`);
  if (diffWith === "before") console.log("※ before は測り方が違う。転送量とノード数は比べないこと。");
  for (const [k, v] of Object.entries(out)) {
    const o = old[k];
    if (!o) continue;
    const d = (a, b) => (a - b >= 0 ? "+" : "") + Math.round((a - b) * 10) / 10;
    console.log(
      pad(k, 12) +
        num("FCP " + d(v.fcp, o.fcp), 12) +
        num("br " + d(v.br, o.br ?? o.kb), 11) +
        num("nodes " + d(v.nodes, o.nodes), 13) +
        num("開落ち " + d(v.open.jank, o.open.jank), 12) +
        num("巻p95 " + d(v.scroll.p95, o.scroll.p95), 13),
    );
  }
}
