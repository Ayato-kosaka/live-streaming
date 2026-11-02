/**
 * 投げ銭アラートの**貯金箱の大きさ**を、季節テーマと豚で並べて数で出す。
 *
 *   cd tools/sprites
 *   node alert-banksize.mjs --base http://127.0.0.1:4587                      # halloween を豚と比べる
 *   node alert-banksize.mjs --base ... --themes halloween,xmas --out /tmp/bank # 重ねた絵も残す
 *   node alert-banksize.mjs --base ... --max 3                                # 上限を広げて数だけ見る
 *   node alert-banksize.mjs --base ... --no-prism                             # 対照: 豚が 82% 前後（PRISM の2倍）に写る
 *
 * ## 決まり（#1078、あやと 2026-11-02）
 *
 * 季節の貯金箱は、**動く範囲も含めて、幅・高さとも豚の 1.2 倍まで**。
 * この道具で数えて通すまで、オーナーに見せない。
 *
 * ## なぜ PRISM の条件で測るか（`docs/island-misses.md` #311）
 *
 * 豚は react-native-web の `Dimensions`（`useStableWindow`）で大きさを決め、季節の貯金箱は
 * `<html>` の幅（`useBoxSize`）で決める。PRISM では `visualViewport.scale` が 0.5 なので、
 * **豚だけが半分に描かれる。** ふつうの Chromium で撮ると豚が2倍に写り、2026-11-02 にそれで
 * 「ハロウィンの貯金箱は豚より小さい」と報告した（実際は面積で約4.6倍）。
 * なので `prism.mjs` の縮み方を既定で入れる。`--no-prism` は「外すと外す」を見せる対照だけ。
 *
 * ## 測り方
 *
 * - `/alertbox/?preview=bank&fill=60&theme=<id>` を開く（豚は `theme=none`）。地を透明にして撮る
 * - **描かれ始めたコマから** 0.5 秒おきに 30 コマ（`--frames` `--every`）。開いた直後に
 *   マスコットがバケツへ飛び乗るところも入る
 * - 透明でない画素（alpha > 8）を全コマで重ね、**外接矩形の幅・高さ**と、**塗られた面積**
 *   （どれかのコマで塗られた画素の数）を、箱に対する割合で出す。字（額・目標・ラベル）も入る
 * - 箱は 436×776（ふだん）と 664×1180（投げ銭のとき手で広げた）。どちらも 9:16
 * - 季節の絵を1枚も読んでいない・重ねた形が豚と同じ（豚に落ちた）なら、測れていない（2）
 *
 * 走る先と芸はくじなので、同じ条件でも回ごとに数が揺れる（ハロウィンを箱 436×776 で9回:
 * 幅 87〜94%・高さ 32〜36%。2026-11-02）。境目に近いときは `--runs 3` で開き直して重ね、
 * いちばん広い範囲で見る。
 *
 * 30 コマ（15 秒）には、ときどき横切る客（ハロウィンのこうもり。約 45 秒に1回、最初は
 * 20〜32 秒後）は入らない。入れて測るなら `--frames 120 --every 500` のように延ばす。
 *
 * 終了コード: 0 = 全部上限内 / 1 = 上限を超えた季節の貯金箱がある / 2 = 測れなかった
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { PNG } from "pngjs";
import { chromePath } from "./chrome.mjs";
import { prism, prismNote, prismOff, prismProbe, PRISM_SCALE } from "./prism.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] != null ? process.argv[i + 1] : fallback;
}
function die(msg) {
  console.error(msg);
  process.exit(2);
}

const base = arg("base", "http://127.0.0.1:4338").replace(/\/$/, "");
const themes = arg("themes", "halloween").split(",").map((s) => s.trim()).filter(Boolean);
if (!themes.length) die("--themes が空");
if (themes.includes("none")) die("豚（none）は毎回測って比べる相手なので、--themes に入れない");
const sizes = arg("sizes", "436x776,664x1180").split(",").map((s) => s.split("x").map(Number));
if (!sizes.every(([w, h]) => w > 0 && h > 0)) die(`--sizes は 幅x高さ をカンマで（${arg("sizes")}）`);
const fill = arg("fill", "60");
const frames = Math.max(2, Math.round(Number(arg("frames", "30"))));
const every = Number(arg("every", "500"));
const runs = Math.max(1, Math.round(Number(arg("runs", "1"))));
const MAX = Number(arg("max", "1.2"));
if (!(MAX > 0)) die(`--max は正の数で（${arg("max")}）`);
const ALPHA = Number(arg("alpha", "8"));
const outArg = arg("out", null);
const out = outArg ? resolve(outArg) : null;
const off = prismOff();

const exe = chromePath() ?? "/opt/pw-browsers/chromium";

/** 1コマを重ねる: どれかのコマで塗られた画素（印）と、いちばん濃く塗られたときの色（絵に残す） */
function makeAcc(W, H) {
  return { W, H, hit: new Uint8Array(W * H), top: new PNG({ width: W, height: H }) };
}
function add(acc, img) {
  if (img.width !== acc.W || img.height !== acc.H) throw new Error(`撮れた絵が ${img.width}x${img.height}（${acc.W}x${acc.H} のはず）`);
  let n = 0;
  for (let p = 0, i = 0; p < acc.W * acc.H; p++, i += 4) {
    const a = img.data[i + 3];
    if (a > ALPHA) {
      acc.hit[p] = 1;
      n++;
    }
    // 絵に残すのは、塗られていたうちの最後のコマの色（溜まり終えた豚・いまの額が見える）
    if (a > ALPHA && a >= acc.top.data[i + 3]) img.data.copy(acc.top.data, i, i, i + 4);
  }
  return n;
}
function stats(acc) {
  let l = acc.W;
  let t = acc.H;
  let r = -1;
  let b = -1;
  let n = 0;
  for (let y = 0; y < acc.H; y++)
    for (let x = 0; x < acc.W; x++) {
      if (!acc.hit[y * acc.W + x]) continue;
      n++;
      if (x < l) l = x;
      if (x > r) r = x;
      if (y < t) t = y;
      if (y > b) b = y;
    }
  if (r < 0) return null;
  return { l, t, r: r + 1, b: b + 1, w: r + 1 - l, h: b + 1 - t, painted: n };
}

/** 重ねた絵に外接矩形を水色で描いて残す（人が見て、何を数えたかを追えるように） */
function savePng(acc, s, path) {
  const img = new PNG({ width: acc.W, height: acc.H });
  for (let i = 0; i < img.data.length; i += 4) {
    // 透明な所は市松の灰色にする（白い字・黒い体のどちらも見える）
    const p = i / 4;
    const x = p % acc.W;
    const y = Math.floor(p / acc.W);
    const g = ((x >> 3) + (y >> 3)) % 2 ? 70 : 52;
    const a = acc.top.data[i + 3] / 255;
    for (let c = 0; c < 3; c++) img.data[i + c] = Math.round(acc.top.data[i + c] * a + g * (1 - a));
    img.data[i + 3] = 255;
  }
  const put = (x, y) => {
    if (x < 0 || y < 0 || x >= acc.W || y >= acc.H) return;
    const j = (y * acc.W + x) * 4;
    img.data[j] = 0;
    img.data[j + 1] = 229;
    img.data[j + 2] = 255;
  };
  for (let k = 0; k < 2; k++) {
    for (let x = s.l; x < s.r; x++) {
      put(x, s.t + k);
      put(x, s.b - 1 - k);
    }
    for (let y = s.t; y < s.b; y++) {
      put(s.l + k, y);
      put(s.r - 1 - k, y);
    }
  }
  writeFileSync(path, PNG.sync.write(img));
}

async function measureOnce(browser, theme, [W, H], acc) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  try {
    // ページを開く前に入れる（Dimensions は読み込みの最初に読まれる）
    await prism(ctx, { off });
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      return u.startsWith(base) || u.startsWith("data:") || u.startsWith("blob:") ? r.continue() : r.abort();
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
    const q = new URLSearchParams({ preview: "bank", fill, theme });
    await page.goto(`${base}/alertbox/?${q}`, { waitUntil: "load", timeout: 30000 });
    const probe = await prismProbe(page);
    const want = off ? 1 : PRISM_SCALE;
    if (probe.scale !== want) throw new Error(`visualViewport.scale が ${probe.scale}（${want} のはず。PRISM の縮み方が効いていない）`);

    const shoot = async () => PNG.sync.read(await page.screenshot({ omitBackground: true, animations: "allow" }));
    // 描かれ始めるまで待つ（季節の貯金箱は絵を読み終えるまで何も出さない）
    const waitFrom = Date.now();
    let first = null;
    while (Date.now() - waitFrom < 20000) {
      const img = await shoot();
      if (img.data.some((v, i) => i % 4 === 3 && v > ALPHA)) {
        first = img;
        break;
      }
      await page.waitForTimeout(200);
    }
    if (!first) throw new Error(`20 秒待っても何も描かれない${errors.length ? `（JS の例外: ${errors[0]}）` : ""}`);
    add(acc, first);
    const t0 = Date.now();
    for (let i = 1; i < frames; i++) {
      const wait = t0 + i * every - Date.now();
      if (wait > 0) await page.waitForTimeout(wait);
      add(acc, await shoot());
    }
    const span = (Date.now() - t0) / 1000;
    const themeFiles = await page.evaluate(
      (id) => performance.getEntriesByType("resource").filter((r) => r.name.includes(`/alert/themes/${id}/`)).length,
      theme
    );
    return { themeFiles, span, probe };
  } finally {
    await ctx.close();
  }
}

/** `runs` 回開き直して（走る先と芸はくじなので、回ごとに道が違う）、全部を1枚に重ねる */
async function measure(browser, theme, size) {
  const [W, H] = size;
  const acc = makeAcc(W, H);
  let one;
  let themeFiles = 0;
  let span = 0;
  for (let k = 0; k < runs; k++) {
    one = await measureOnce(browser, theme, size, acc);
    themeFiles = Math.min(k === 0 ? Infinity : themeFiles, one.themeFiles);
    span += one.span;
  }
  const s = stats(acc);
  if (!s) throw new Error("重ねても塗られた画素が無い");
  if (s.w >= W && s.h >= H) throw new Error("箱いっぱいが塗られている（地が透明になっていない）");
  let png = null;
  if (out) {
    png = join(out, `${W}x${H}-${theme}${off ? "-noprism" : ""}.png`);
    savePng(acc, s, png);
  }
  return { theme, W, H, ...s, themeFiles, span, probe: one.probe, png };
}

const pct = (v, total) => `${((v / total) * 100).toFixed(1)}%`;
const times = (x) => `${x.toFixed(2)}倍`;

async function main() {
  if (out) mkdirSync(out, { recursive: true });
  console.log(prismNote(off));
  console.log(`上限: 動く範囲も含めて、幅・高さとも豚の ${MAX} 倍まで（fill ${fill}%、${every / 1000} 秒おき ${frames} コマ${runs > 1 ? ` × 開き直し ${runs} 回` : ""}を重ねる）`);
  const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox", "--no-proxy-server"] });
  const over = [];
  const broken = [];
  try {
    for (const size of sizes) {
      const [W, H] = size;
      let pig;
      try {
        pig = await measure(browser, "none", size);
      } catch (e) {
        broken.push(`${W}x${H} 豚: ${String(e.message ?? e).slice(0, 200)}`);
        continue;
      }
      console.log(`\n■ 箱 ${W}×${H}（Dimensions の幅 ${pig.probe.dimW} / <html> の幅 ${pig.probe.boxW}。${pig.span.toFixed(1)} 秒ぶん重ねた）`);
      const row = (r) =>
        `幅 ${String(r.w).padStart(4)}px（${pct(r.w, W).padStart(6)}）  高さ ${String(r.h).padStart(4)}px（${pct(r.h, H).padStart(6)}）  面積 ${pct(r.painted, W * H).padStart(6)}`;
      console.log(`  ${"豚".padEnd(10)} ${row(pig)}${pig.png ? `  ${pig.png}` : ""}`);
      for (const theme of themes) {
        let r;
        try {
          r = await measure(browser, theme, size);
        } catch (e) {
          broken.push(`${W}x${H} ${theme}: ${String(e.message ?? e).slice(0, 200)}`);
          console.log(`  ${theme.padEnd(10)} 測れない: ${String(e.message ?? e).slice(0, 200)}`);
          continue;
        }
        if (!r.themeFiles) {
          broken.push(`${W}x${H} ${theme}: 季節の絵を1枚も読んでいない（テーマの名前が違う？）`);
          console.log(`  ${theme.padEnd(10)} 測れない: 季節の絵を1枚も読んでいない`);
          continue;
        }
        if (r.l === pig.l && r.t === pig.t && r.r === pig.r && r.b === pig.b && r.painted === pig.painted) {
          broken.push(`${W}x${H} ${theme}: 重ねた形が豚と同じ（季節の貯金箱が出ずに豚に落ちた）`);
          console.log(`  ${theme.padEnd(10)} 測れない: 豚に落ちた`);
          continue;
        }
        const kw = r.w / pig.w;
        const kh = r.h / pig.h;
        const ka = r.painted / pig.painted;
        const bad = kw > MAX || kh > MAX;
        console.log(
          `  ${theme.padEnd(10)} ${row(r)}  豚に対して 幅 ${times(kw)} / 高さ ${times(kh)} / 面積 ${times(ka)}` +
            (bad ? `  ← 上限 ${MAX} 倍を超えた（幅 ${Math.floor(pig.w * MAX)}px・高さ ${Math.floor(pig.h * MAX)}px まで）` : "") +
            (r.png ? `  ${r.png}` : "")
        );
        if (bad) over.push(`${W}x${H} ${theme}: 幅 ${times(kw)} / 高さ ${times(kh)}`);
      }
    }
  } finally {
    await browser.close();
  }
  console.log("");
  if (off) console.log("（対照）PRISM の縮み方を外した数。豚が PRISM の2倍に写っている。これで判断しない");
  if (over.length) {
    console.log(`上限 ${MAX} 倍を超えた ${over.length}:`);
    for (const o of over) console.log(`  ${o}`);
  }
  if (broken.length) {
    console.log(`測れなかった ${broken.length}:`);
    for (const b of broken) console.log(`  ${b}`);
    process.exit(2);
  }
  if (!over.length) console.log(`全部、豚の ${MAX} 倍まで`);
  process.exit(over.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
