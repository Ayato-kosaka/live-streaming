/**
 * 投げ銭アラートの段の絵を、**投げ銭が来た瞬間に展開する**のに何 ms かかるかを、CPU を絞って測る。
 *
 *   cd tools/sprites
 *   node alert-decode.mjs --dist /path/to/dist --amounts 100,300,700,1500 --rates 1,4,6 --runs 3
 *
 * 本番と同じ順で測る（`app/alertbox/season/useSeason.ts`）:
 *   面を開く → 貯金箱の絵だけ展開 → 4 秒後に段の絵を**落とすだけ** → `--at` 秒で投げ銭 → その段の絵だけ展開
 * 配り方も本番（firebase.json の headers）に合わせる: 絵は `max-age=3600`、それ以外は `no-cache`。
 * こうしないと、落としておいた絵が控えに乗らず、展開の時間に読み込みが混ざる。
 *
 * 読むのは index.tsx が残す User Timing の `season:ensure`（展開にかかった ms と、そろったか）。
 * あわせて、投げ銭のあとに段の絵を**もう一度読みに行った量**（Resource Timing の transferSize）と、
 * 台本の層（`[data-show]`）が出たかを見る。
 *
 * 合格: 展開が 1.5 秒（`--limit`）より短く、台本の層が出ていること。アラートの頭が待つ上限は 8 秒
 * （index.tsx の `HEAD_WAIT_MS`。試し表示も本物の通知も同じ）だが、段の絵は1段ぶん・動画は手元（Blob）から読むので、
 * 投げ銭が来る前に持ち終えていれば数百 ms で済む。1.5 秒を超えたら、手元に持てていないか展開が重い。
 * 本物の通知の道・遅い回線・控えなしで演出が出るかは `alert-live.mjs`。
 *
 * CPU の絞りはそれ自体が CPU を食う（CLAUDE.md）。ここで見るのは「読み込み・展開の速さ」なので、
 * 絞ったまま測ってよい。描画の重さはこの道具では見ない。
 *
 * PRISM の縮み方（`visualViewport.scale = 0.5`。豚だけが半分に描かれ、雨の落ちる先も半分の高さ）を
 * **既定で入れて撮る**（`prism.mjs`。`docs/island-misses.md` #311）。`--no-prism` で外すのは、
 * 外したときの数を見る対照だけ。外した数で判断しない。
 *
 * テーマは `--theme`（既定: 期間がいま効いているテーマのいちばん先。`alertseason.mjs`）。動画の段は `--fx full` で、
 * そのときは動画の用意（`season:ensure` の detail.video）がそろったかも合否に入れる。
 *
 * `--json <置き場>` で、同じ数を機械向けに書き出す（`tools/alert-theme/ci/` が読む。合否は終了コードと同じ）。
 *
 * 終了コード: 0 = 全部上限内 / 1 = 超えた・台本が出なかった / 2 = 測れなかった
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync, writeFileSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright-core";
import { chromePath } from "./chrome.mjs";
import { prism, prismNote } from "./prism.mjs";
import { seasonThemes } from "./alertseason.mjs";

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
const amounts = arg("amounts", "100,300,700,1500").split(",").map(Number);
const rates = arg("rates", "1,4,6").split(",").map(Number);
const runs = Math.max(1, Number(arg("runs", "3")));
const at = Number(arg("at", "12"));
const LIMIT = Number(arg("limit", "1500"));
const [W, H] = arg("size", "436x776").split("x").map(Number);
const theme = arg("theme", null) ?? seasonThemes()[0]?.theme ?? "none";
const fx = arg("fx", "");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".json": "application/json",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".mp3": "audio/mpeg",
  ".ico": "image/x-icon",
};
/* firebase.json の headers と同じ。絵は 1 時間持つ、それ以外は毎回たずねる */
const cacheOf = (p) =>
  /\.(png|jpg|jpeg|gif|webp|avif|svg|ico|woff|woff2|ttf|otf|mp4|webm|mp3)$/i.test(p)
    ? "public, max-age=3600"
    : p.startsWith("/_expo/static/")
      ? "public, max-age=31536000, immutable"
      : "no-cache";

async function serve() {
  const srv = createServer(async (req, res) => {
    const path = decodeURIComponent(req.url.split("?")[0]);
    // 面は外へ繋がない（試し表示）が、念のため口の偽物を返す
    if (path.startsWith("/island-api/")) {
      res.writeHead(404).end();
      return;
    }
    for (const c of [path, `${path}.html`, join(path, "index.html")]) {
      const f = normalize(join(dist, c));
      if (!f.startsWith(dist)) break;
      try {
        if (!(await stat(f)).isFile()) continue;
        const body = await readFile(f);
        res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream", "cache-control": cacheOf(path) });
        res.end(body);
        return;
      } catch {
        // 次の候補
      }
    }
    res.writeHead(404).end();
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  return { base: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() };
}

const exe = chromePath() ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : null);
if (!exe) die("ブラウザが見つからない（chrome.mjs）");

async function one(browser, base, amount, rate) {
  // 段ごとに新しい箱（控えを持ち越さない。毎回「面を開いたばかり」から）
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  try {
    await prism(ctx);
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate });
    const q = new URLSearchParams({ preview: "1", theme, amount: String(amount), at: String(at), name: "aoi", msg: "ありがとう！" });
    if (fx) q.set("fx", fx);
    // "load" は待たない（試し表示の既定のキャラ絵は外の CDN にあり、この箱からは届かずに止まる）
    await page.goto(`${base}/alertbox/?${q}`, { waitUntil: "domcontentloaded" });
    const got = await page
      .waitForFunction(() => performance.getEntriesByName("season:ensure").length > 0, null, { timeout: (at + 30) * 1000, polling: 200 })
      .then(() => true)
      .catch(() => false);
    if (!got) return { err: "season:ensure が出なかった" };
    await page.waitForTimeout(800);
    return await page.evaluate(() => {
      const m = performance.getEntriesByName("season:ensure")[0];
      const t0 = m.startTime;
      // 投げ銭のあとに読みに行った段の絵（控えから出たものは transferSize 0）
      const res = performance
        .getEntriesByType("resource")
        .filter((r) => r.startTime >= t0 && /\/alert\/themes\//.test(r.name) && !/\.json$/.test(r.name));
      const prefetched = performance
        .getEntriesByType("resource")
        .filter((r) => r.startTime < t0 && /\/alert\/themes\/.*\/(rig|poses)\//.test(r.name) && !/\.json$/.test(r.name)).length;
      return {
        ms: m.duration,
        ok: m.detail?.ok ?? null,
        video: m.detail?.video ?? null,
        firedAt: t0,
        refetchKB: res.reduce((s, r) => s + (r.transferSize || 0), 0) / 1024,
        refetchN: res.filter((r) => r.transferSize > 0).length,
        prefetched,
        show: document.querySelectorAll("[data-show]").length,
      };
    });
  } finally {
    await ctx.close();
  }
}

async function main() {
  console.log(prismNote());
  const srv = await serve();
  const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox", "--no-proxy-server"] });
  const rows = [];
  let bad = 0;
  let errs = 0;
  /** `--json` に書く、だめだった回と測れなかった回 */
  const jbad = [];
  const jerr = [];
  let seen = 0;
  console.log(`テーマ ${theme}${fx ? `（旗 fx=${fx}）` : ""}`);
  console.log(`段 ${amounts.join("・")}円 × CPU ${rates.map((r) => `${r}倍`).join("・")} × ${runs} 回（投げ銭は ${at} 秒後。上限 ${LIMIT}ms）`);
  for (const rate of rates)
    for (const a of amounts) {
      const ms = [];
      for (let i = 0; i < runs; i++) {
        const r = await one(browser, srv.base, a, rate);
        if (r.err) {
          errs++;
          jerr.push({ a, rate, i: i + 1, err: r.err });
          console.log(`  ${a}円 CPU${rate}倍 #${i + 1}: 測れない（${r.err}）`);
          continue;
        }
        ms.push(r.ms);
        // 動画の段は、動画の用意がそろったことも見る（そろわなければ、その段は動画なしで出る）
        const over = r.ms > LIMIT || r.ok !== true || r.show === 0 || (fx && r.video !== true);
        if (over) bad++;
        seen++;
        if (over) jbad.push({ a, rate, i: i + 1, ms: r.ms, ok: r.ok, video: r.video, show: r.show });
        console.log(
          `  ${a}円 CPU${rate}倍 #${i + 1}: 展開 ${r.ms.toFixed(0)}ms  そろった ${r.ok}${fx ? `  動画 ${r.video}` : ""}  台本の層 ${r.show}  ` +
            `先に落とした絵 ${r.prefetched}  投げ銭のあと読み直し ${r.refetchN}本 ${r.refetchKB.toFixed(0)}KB${over ? "  ← だめ" : ""}`
        );
      }
      if (ms.length) {
        ms.sort((x, y) => x - y);
        rows.push({ a, rate, med: ms[Math.floor(ms.length / 2)], max: ms.at(-1) });
      }
    }
  await browser.close();
  srv.close();
  console.log("\n段  CPU  中央値  いちばん遅い");
  for (const r of rows) console.log(`${String(r.a).padStart(6)}円 ${r.rate}倍  ${r.med.toFixed(0).padStart(5)}ms  ${r.max.toFixed(0).padStart(5)}ms`);
  const json = arg("json", "");
  if (json)
    writeFileSync(
      resolve(json),
      JSON.stringify(
        { tool: "alert-decode", exit: errs ? 2 : bad ? 1 : 0, theme, fx, tiers: amounts.length, limit: LIMIT, runs: seen, max: rows.length ? Math.max(...rows.map((r) => r.max)) : null, rows, bad: jbad, errs: jerr },
        null,
        1
      )
    );
  process.exit(errs ? 2 : bad ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
