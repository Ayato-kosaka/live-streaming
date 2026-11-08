/**
 * 投げ銭アラートを**本物の通知の道**で流して、段の演出（動画）が出たかを数える（2026-11-08 の配信。PRISM で7段が出なかった）。
 *
 *   cd tools/sprites
 *   node alert-live.mjs --dist <書き出し> --net mobile --cache clear --runs 2 --json <結果.json>
 *   node alert-live.mjs --dist <書き出し> --js <対照の書き出し> ...   # 対照: JS だけ差し替えて配る（元の形に戻した書き出し）
 *
 * ## なぜ要るか
 *
 * ほかの道具は、どれも試し表示（`?preview=1`）で開く。試し表示は外へ繋がず、偽の投げ銭を面の中で作る。
 * 2026-11-08 まで、試し表示だけ**動画の用意を 8 秒待ち**、本物の通知は 1.5 秒で諦めていた。CI はずっと 8 秒の道を
 * 測っていて、配信で通る 1.5 秒の道は一度も測っていなかった（`docs/island-misses.md`）。
 *
 * ここは `?preview=` を付けずに開く（OBS・PRISM に貼る URL と同じ。`?k=<合言葉>&source=doneru`）。外の口は手元で受ける:
 * - `/island-api/alertbox/<k>/…`（名簿・額・もう一度出して・どねるの宛先）はこの道具の配り口が返す
 * - どねるの WebSocket は Playwright の `routeWebSocket` で受け、投げ銭をそこから1件ずつ送る（`DoneruConnector` が受ける）
 * - キャラ絵の CDN（cloudfront）は手元の絵を返す。ほかの外は全部止める
 *
 * ## 条件
 *
 * - `--net mobile`: 下り 1.5Mbps・上り 0.75Mbps・往復 300ms（山の上のモバイル回線。開いてから閉じるまでずっと）。`off` はそのまま
 * - 開いて長く置く: 開いてから、動画への要求が 5 秒止むまで（温めが終わるまで。最低 `--open` 秒・最長 `--open-max` 秒）待つ
 * - `--cache clear`: 投げ銭の前に毎回、HTTP の控えを空にする（`Network.clearBrowserCache`）。配りは `max-age=3600` なので、
 *   開いて1時間たてば控えは使えない（11/8 の最初の投げ銭は、開いてから 66 分後）。Android の WebView は控えを捨てもする
 * - 1回開くごとに、`--amounts` を1件ずつ順に送る（前のアラートが明けてから次）。`--runs` 回開く（`--jobs` 本並べて）
 *
 * 配り方は本番（firebase.json の headers）に合わせる: 絵と動画は `max-age=3600`、`/_expo/static/` は immutable、ほかは no-cache。
 * 動画は Range に答える（Firebase Hosting と同じ。`<video>` が読みに来る形を変えない）。
 *
 * ## 数えるもの（1件ごと）
 *
 * - 演出が出たか: 動画の層（`[data-fx-video] video`）が見えていて（opacity が 0 でない）、流れていて、時計が進んだコマが 5 つ以上
 * - 出るまでの秒: アプリが通知を受けた瞬間（ログの `notificationReceived`）から、動画の最初のコマが見えた瞬間まで
 * - アプリの演出の判断のログ（`fxPlan`。段・用意できたか・何 ms・手元か取り寄せか・外した理由）があれば、そのまま添える
 *
 * 合格: どの件も演出が出た。**出なかった件が1つでもあれば 1。** 1件も測れなければ 2。
 *
 * PRISM の縮み方（`prism.mjs`）を既定で入れる。
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright-core";
import { chromePath } from "./chrome.mjs";
import { prism, prismNote } from "./prism.mjs";
import { seasonThemes, tierOf } from "./alertseason.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] != null ? process.argv[i + 1] : fallback;
}
function die(msg) {
  console.error(msg);
  process.exit(2);
}

const dist = resolve(arg("dist", ""));
if (!existsSync(join(dist, "alertbox"))) die(`書き出しが無い（alertbox が見当たらない）: ${dist}`);
const jsDir = arg("js", "") ? resolve(arg("js", "")) : null;
if (jsDir && !existsSync(join(jsDir, "alertbox"))) die(`対照の書き出しが無い: ${jsDir}`);
const theme = arg("theme", null) ?? seasonThemes().find((t) => t.fx)?.theme ?? die("動画の段を持つテーマが無い（--theme で名指しする）");
// 旗は既定で付けない（配信の URL と同じ。配信に出すと決めたテーマは旗なしで動画の段になる）
const fx = arg("fx", "");
const amounts = arg("amounts", "100,300,700,1500,3000,7000,10000").split(",").map(Number);
const runs = Math.max(1, Number(arg("runs", "1")));
const jobs = Math.max(1, Number(arg("jobs", "2")));
const netName = arg("net", "mobile");
const cache = arg("cache", "clear");
const openMin = Number(arg("open", "20"));
const openMax = Number(arg("open-max", "420"));
const [W, H] = arg("size", "436x776").split("x").map(Number);
const label = arg("label", "");
const NET = {
  off: null,
  mobile: { offline: false, latency: 300, downloadThroughput: 187_500, uploadThroughput: 93_750 },
};
if (!(netName in NET)) die(`--net は ${Object.keys(NET).join("・")}（${netName}）`);
if (!["clear", "keep"].includes(cache)) die(`--cache は clear・keep（${cache}）`);
const charFile = arg("char", "../../site/public/goods/ayato-walk.png");
if (!existsSync(resolve(charFile))) die(`キャラ絵が無い: ${charFile}`);
const charBody = readFileSync(resolve(charFile));

/** OBS の URL の合言葉（32 桁）。口はこの道具が受けるので、何でもよい */
const K = "0123456789abcdef0123456789abcdef";
const WSS = "wss://doneru.invalid/alertbox";
const MSG = "ありがとう！これは確かめの投げ銭です";
const alertSec = (a) => 30 + (a >= 10000 ? 30 : a >= 1000 ? 15 : 0);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".json": "application/json",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".mp3": "audio/mpeg",
  ".ico": "image/x-icon",
};
/* firebase.json の headers と同じ */
const cacheOf = (p) =>
  /\.(png|jpg|jpeg|gif|webp|avif|svg|ico|woff|woff2|ttf|otf|mp4|webm|mp3)$/i.test(p)
    ? "public, max-age=3600"
    : p.startsWith("/_expo/static/")
      ? "public, max-age=31536000, immutable"
      : "no-cache";

function island(path, res) {
  const m = path.match(/^\/island-api\/alertbox\/([0-9a-f]{32})\/([a-z-]+)$/);
  const send = (code, body) => {
    res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(body == null ? "" : JSON.stringify(body));
  };
  if (!m || m[1] !== K) return send(404);
  if (m[2] === "fund") return send(200, { currentAmount: 30000, targetAmount: 50000, label: "確かめ" });
  if (m[2] === "characters") return send(200, { characters: [] });
  if (m[2] === "replay") return send(200, { seq: 0 });
  if (m[2] === "wss") return send(200, { wss: WSS });
  return send(404);
}

async function serve() {
  const roots = jsDir ? [jsDir, dist] : [dist];
  const srv = createServer(async (req, res) => {
    const path = decodeURIComponent(req.url.split("?")[0]);
    if (path.startsWith("/island-api/")) return island(path, res);
    // 対照の書き出しは、面（alertbox の html）と JS だけをそちらから配る（動画と絵は同じものを使う）
    const fromJs = jsDir && (path.startsWith("/alertbox") || path.startsWith("/_expo/static/"));
    for (const root of fromJs ? roots : [dist]) {
      for (const c of [path, `${path}.html`, join(path, "index.html")]) {
        const f = normalize(join(root, c));
        if (!f.startsWith(root)) break;
        try {
          const st = await stat(f);
          if (!st.isFile()) continue;
          // 印（etag・last-modified）も Firebase Hosting と同じく付ける。控えから Range で読むとき・古い控えを問い合わせるときに使われる
          const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
          const head = {
            "content-type": TYPES[extname(f)] || "application/octet-stream",
            "cache-control": cacheOf(path),
            "accept-ranges": "bytes",
            etag,
            "last-modified": st.mtime.toUTCString(),
          };
          if (req.headers["if-none-match"] === etag) {
            res.writeHead(304, head).end();
            return;
          }
          const body = await readFile(f);
          const r = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
          if (r && (r[1] || r[2])) {
            const start = r[1] ? Number(r[1]) : Math.max(0, body.length - Number(r[2]));
            const end = r[1] && r[2] ? Math.min(Number(r[2]), body.length - 1) : body.length - 1;
            if (start >= body.length) {
              res.writeHead(416, { "content-range": `bytes */${body.length}` }).end();
              return;
            }
            res.writeHead(206, { ...head, "content-range": `bytes ${start}-${end}/${body.length}`, "content-length": end - start + 1 });
            res.end(body.subarray(start, end + 1));
            return;
          }
          res.writeHead(200, { ...head, "content-length": body.length });
          res.end(body);
          return;
        } catch {
          // 次の候補
        }
      }
    }
    res.writeHead(404).end();
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  return { base: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() };
}

/* 面の中の見本。アプリのログ（console.log の JSON）を受けた瞬間と、動画の層が見えているコマを数える。
   1件ごとに `__lv.seg()` で区切る */
const SAMPLER = `(() => {
  const R = (window.__lv = { logs: [], segs: [], cur: null });
  R.seg = (id) => { R.cur = { id, t0: performance.now(), fx: 0, firstFx: null, lastCt: -1, parts: {}, plate: null, gone: null }; R.segs.push(R.cur); };
  const L = console.log;
  console.log = function (...a) {
    try {
      const s = a[0];
      if (typeof s === "string" && s.charAt(0) === "{" && s.indexOf('"AlertBox"') > 0) {
        const j = JSON.parse(s);
        if (j.screen === "AlertBox") R.logs.push({ t: performance.now(), event: j.event, data: j.data });
      }
    } catch (e) {}
    return L.apply(this, a);
  };
  const loop = () => {
    const S = R.cur;
    if (S) {
      const vids = [...document.querySelectorAll('[data-fx-video] video')];
      const shown = vids.filter((v) => v.style.opacity !== "0" && !v.paused && v.currentTime > 0.04);
      if (shown.length) {
        const ct = shown[0].currentTime;
        if (ct !== S.lastCt) {
          S.fx++;
          S.lastCt = ct;
          if (S.firstFx == null) S.firstFx = performance.now();
        }
        for (const v of shown) {
          const p = v.dataset.fxPart || "?";
          S.parts[p] = (S.parts[p] || 0) + 1;
        }
      }
      const plate = document.querySelector('[data-plate="box"]');
      if (plate && S.plate == null) S.plate = performance.now();
      if (!plate && S.plate != null && S.gone == null) S.gone = performance.now();
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
})();`;

const exe = chromePath() ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : null);
if (!exe) die("ブラウザが見つからない（chrome.mjs）");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function session(browser, base, run) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const out = { run, open: null, alerts: [], errs: [] };
  try {
    await prism(ctx);
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.includes("cloudfront.net")) return r.fulfill({ contentType: "image/png", body: charBody, headers: { "access-control-allow-origin": "*" } });
      return u.startsWith(base) || u.startsWith("data:") || u.startsWith("blob:") ? r.continue() : r.abort();
    });
    let sock = null;
    await ctx.routeWebSocket(/doneru\.invalid/, (ws) => {
      sock = ws;
      // ping は聞き流す（DoneruConnector が 30 秒ごとに送る）
      ws.onMessage(() => {});
    });
    await ctx.addInitScript(SAMPLER);
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    if (NET[netName]) await cdp.send("Network.emulateNetworkConditions", NET[netName]);
    /* 動画への要求（温め・用意）を見張る。止んだら「開いて長く置いた」とみなす */
    const inflight = new Set();
    let lastFx = Date.now();
    let fxReq = 0;
    const isFx = (r) => /\/fx\/[^/]+\.webm(\?|$)/.test(r.url());
    page.on("request", (r) => {
      if (!isFx(r)) return;
      inflight.add(r);
      fxReq++;
      lastFx = Date.now();
    });
    const done = (r) => {
      if (!inflight.delete(r)) return;
      lastFx = Date.now();
    };
    page.on("requestfinished", done);
    page.on("requestfailed", done);
    const q = new URLSearchParams({ k: K, source: "doneru", theme });
    if (fx) q.set("fx", fx);
    const t0 = Date.now();
    await page.goto(`${base}/alertbox/?${q}`, { waitUntil: "domcontentloaded", timeout: 180000 });
    for (; !sock && Date.now() - t0 < 120000; ) await sleep(200);
    if (!sock) throw new Error("どねるの WebSocket に繋がらなかった");
    for (;;) {
      const el = (Date.now() - t0) / 1000;
      const idle = inflight.size === 0 && Date.now() - lastFx > 5000;
      if ((el >= openMin && idle && el > 10) || el > openMax) break;
      await sleep(500);
    }
    out.open = { sec: Math.round((Date.now() - t0) / 1000), fxRequests: fxReq, inflight: inflight.size };
    for (const a of amounts) {
      if (cache === "clear") await cdp.send("Network.clearBrowserCache");
      const id = `live-${run}-${a}`;
      await page.evaluate((x) => window.__lv.seg(x), id);
      sock.send(JSON.stringify({ id, type: "donation", amount: a, assetID: null, message: MSG, messageType: 1, nickname: "aoi", test: false }));
      const limit = Date.now() + (alertSec(a) + 30) * 1000;
      let seg = null;
      for (;;) {
        seg = await page.evaluate((x) => window.__lv.segs.find((s) => s.id === x), id);
        if (seg?.gone != null || Date.now() > limit) break;
        await sleep(500);
      }
      // 貯金箱が出直すまで
      await sleep(1200);
      if (!seg) throw new Error(`${a}円の区切りが面に無い`);
      const logs = await page.evaluate((s0) => window.__lv.logs.filter((l) => l.t >= s0), seg.t0);
      const recv = logs.find((l) => l.event === "notificationReceived");
      const plan = logs.find((l) => l.event === "fxPlan");
      const failed = logs.find((l) => l.event === "fxVideoFailed");
      const video = seg.fx >= 5;
      const from = recv ? recv.t : seg.t0;
      out.alerts.push({
        amount: a,
        tier: tierOf(a),
        video,
        frames: seg.fx,
        sec: video ? +((seg.firstFx - from) / 1000).toFixed(2) : null,
        plateSec: seg.plate != null ? +((seg.plate - from) / 1000).toFixed(2) : null,
        ended: seg.gone != null,
        parts: Object.keys(seg.parts).sort(),
        plan: plan ? plan.data : null,
        failed: failed ? failed.data : null,
      });
    }
  } catch (e) {
    out.errs.push(String(e).slice(0, 300));
  } finally {
    await ctx.close();
  }
  return out;
}

async function main() {
  console.log(prismNote());
  const srv = await serve();
  const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox", "--no-proxy-server", "--autoplay-policy=no-user-gesture-required"] });
  console.log(
    `本物の通知の道（?preview なし・どねるの WebSocket）${label ? `・${label}` : ""}・テーマ ${theme}${fx ? `・旗 fx=${fx}` : "・旗なし"}・回線 ${netName}` +
      `・控え ${cache === "clear" ? "毎回空に" : "そのまま"}・${amounts.join("/")}円 × ${runs}回${jsDir ? "・対照の JS" : ""}`
  );
  const queue = Array.from({ length: runs }, (_, i) => i + 1);
  const sessions = [];
  await Promise.all(
    Array.from({ length: Math.min(jobs, runs) }, async () => {
      for (let r = queue.shift(); r; r = queue.shift()) {
        const s = await session(browser, srv.base, r);
        sessions.push(s);
        const line = s.alerts.map((x) => `${x.amount}円 ${x.video ? `○${x.sec}s` : "×"}${x.plan ? `(${x.plan.from ?? "-"}${x.plan.why ? `:${x.plan.why}` : ""} ${x.plan.ms}ms)` : ""}`).join("  ");
        console.log(`#${s.run} 開いて ${s.open?.sec ?? "-"}秒（動画の要求 ${s.open?.fxRequests ?? "-"}本）: ${line}${s.errs.length ? `  測れない: ${s.errs[0]}` : ""}`);
      }
    })
  );
  await browser.close();
  srv.close();
  const all = sessions.flatMap((s) => s.alerts);
  const shown = all.filter((x) => x.video);
  const missed = all.filter((x) => !x.video);
  const errs = sessions.flatMap((s) => s.errs.map((e) => `#${s.run}: ${e}`));
  const secs = shown.map((x) => x.sec).sort((a, b) => a - b);
  const byTier = {};
  for (const x of all) {
    const b = (byTier[x.tier] ??= { amount: x.amount, runs: 0, video: 0, secs: [] });
    b.runs++;
    if (x.video) {
      b.video++;
      b.secs.push(x.sec);
    }
  }
  for (const b of Object.values(byTier)) {
    b.secs.sort((a, c) => a - c);
    b.median = b.secs.length ? b.secs[Math.floor(b.secs.length / 2)] : null;
    b.max = b.secs.length ? b.secs.at(-1) : null;
    delete b.secs;
  }
  console.log(`\n${all.length} 件。演出が出た ${shown.length}・出なかった ${missed.length}${errs.length ? `・測れなかった開き方 ${errs.length}` : ""}`);
  console.log("段  額      出た/件  中央値  いちばん遅い（通知を受けてから動画の最初のコマまで、秒）");
  for (const [t, b] of Object.entries(byTier)) console.log(`  ${t}  ${String(b.amount).padStart(6)}円  ${b.video}/${b.runs}  ${b.median ?? "-"}  ${b.max ?? "-"}`);
  for (const x of missed.slice(0, 8)) console.log(`  出なかった: ${x.amount}円 段${x.tier}・札 ${x.plateSec ?? "-"}s・判断 ${x.plan ? JSON.stringify(x.plan) : "（ログに無い）"}${x.failed ? `・fxVideoFailed ${JSON.stringify(x.failed)}` : ""}`);
  if (errs.length) console.log("測れなかった:", errs.slice(0, 4));
  const code = !all.length ? 2 : missed.length ? 1 : 0;
  const json = arg("json", "");
  if (json)
    writeFileSync(
      resolve(json),
      JSON.stringify(
        {
          tool: "alert-live", exit: code, label, theme, fx, net: netName, cache, control: !!jsDir, runs: sessions.length, alerts: all.length,
          video: shown.length, missed: missed.length, median: secs.length ? secs[Math.floor(secs.length / 2)] : null, max: secs.length ? secs.at(-1) : null,
          byTier, open: sessions.map((s) => s.open), bad: missed.slice(0, 20), errs,
        },
        null,
        1
      )
    );
  process.exit(code);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
