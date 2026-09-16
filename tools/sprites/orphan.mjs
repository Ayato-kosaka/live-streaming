/**
 * 表紙の看板の一言が、**最後の1文字だけを次の行に落としていないか**を測る。
 *
 *   node tools/sprites/orphan.mjs                    # 本番を測る（既定）
 *   SPORT=4150 node tools/sprites/orphan.mjs         # 手元の書き出しを測る
 *   WIDTHS=360,390 MIN=30 node tools/sprites/orphan.mjs
 *
 * 島に降りた人が最初に読む1文（`content/nights.ts` の `eyebrow`）は、
 * `.hero-say` の中で折り返す。幅がほんの少し足りないと **最後の1文字だけ**が
 * 次の行に落ちて、右寄せなのでぽつんと浮く（390px で「送」1文字＝13px が実際に出た）。
 *
 * ## 測り方の決めごと
 *
 * - **行の幅は `Range` で1文字ずつ拾う。** 要素の `getBoundingClientRect` は
 *   箱の幅（＝いちばん長い行の幅）しか返さないので、最終行が短いことは出ない。
 * - **隠れているものを数えない。** 表紙には読み上げ用の `h1`（`.sr-only`）が
 *   いて、1px の箱の中で字が1文字ずつ折り返している。弾かないと
 *   「最終行 6px」を拾って、直っているものを壊れていると読む。
 * - **文言は2つある**（`content/nights.ts` の `FIXED` と `TRIP`）。
 *   画面に出るのは旅かどうかで決まる1つだけなので、出ていないほうは
 *   同じ字の上に置き換えて測る。**そちらを壊しても画面には出ないので、
 *   目で見ても気づけない。**
 * - **文言は `content/nights.ts` から読む。** ここに書き写すと、向こうを
 *   直した日から嘘になる（`docs/island-misses.md` #102）。
 * - **島を止めてから測る。** 島は rAF で動く。札が看板に寄ると
 *   `data-logo="away"` が付いて `.hero-say` が `opacity: 0` になるので、
 *   測る回によって「見えている／隠れている」が入れ替わる。
 * - **何件見たかを出す。** 0件を「違反なし」と読まないため
 *   （`docs/island-standards.md` 15）。終了コードは 0=通った / 1=落ちた /
 *   2=数えるものが無かった。
 */
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { viaCurl, blocked, ORIGIN } from "./prod.mjs";

const SPORT = process.env.SPORT || "";
const BASE = SPORT ? `http://localhost:${SPORT}` : ORIGIN;
const WIDTHS = (process.env.WIDTHS || "360,390,414,430").split(",").map((s) => +s.trim());
/** 孤立とみなす下限。2文字ぶん（約30px）を割ったら落とす。 */
const MIN = +(process.env.MIN || 30);
const NIGHTS = process.env.NIGHTS || new URL("../../site/content/nights.ts", import.meta.url).pathname;
/** 静的に配ったものは `/index.html`、本番と開発サーバーは `/`。 */
const PATHS = SPORT ? ["/index.html", "/"] : ["/"];

/** `content/nights.ts` から `eyebrow` を2つとも拾う（平常時・旅のあいだ）。 */
const words = [...readFileSync(NIGHTS, "utf8").matchAll(/^\s*eyebrow:\s*"([^"]+)"/gm)].map((m) => m[1]);
if (words.length !== 2) {
  console.error(`nights.ts の eyebrow が ${words.length} 件でした（2件のはず）。測る文言が決まりません。`);
  process.exit(2);
}

/** その字の「行ごとの幅と中身」。隠れていたら測らない。 */
function measure(el) {
  const box = el.getBoundingClientRect();
  for (let e = el; e; e = e.parentElement) {
    const s = getComputedStyle(e);
    if (s.display === "none" || s.visibility === "hidden" || +s.opacity === 0) return { hidden: true };
  }
  if (box.width < 4 || box.height < 4) return { hidden: true };
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const cs = [];
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const t = n.textContent || "";
    for (let i = 0; i < t.length; i++) {
      if (/\s/.test(t[i])) continue;
      const r = document.createRange();
      r.setStart(n, i);
      r.setEnd(n, i + 1);
      const b = r.getBoundingClientRect();
      if (!b.width && !b.height) continue;
      cs.push({ ch: t[i], top: Math.round(b.top), left: b.left, right: b.right });
    }
  }
  const lines = [];
  for (const c of cs) {
    const last = lines[lines.length - 1];
    /* 同じ行かどうかは上端で見る。字の高さより小さい幅で丸めると、
       にじみ1pxで行が割れる */
    if (last && Math.abs(last.top - c.top) <= 2) {
      last.text += c.ch;
      last.left = Math.min(last.left, c.left);
      last.right = Math.max(last.right, c.right);
    } else lines.push({ top: c.top, text: c.ch, left: c.left, right: c.right });
  }
  return { hidden: false, lines: lines.map((l) => ({ text: l.text, w: Math.round(l.right - l.left) })) };
}

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

const rows = [];
const missing = [];
let bad = 0;
let seen = 0;

for (const width of WIDTHS) {
  const ctx = await b.newContext({
    viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  });
  if (!SPORT) await viaCurl(ctx);
  /* 島を止める。CSS の animation を切るだけでは足りない（島は rAF で動く） */
  await ctx.addInitScript("window.requestAnimationFrame = () => 0;");
  const p = await ctx.newPage();
  let opened = "";
  for (const path of PATHS) {
    try {
      const res = await p.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 45000 });
      if (res && res.status() === 200) { opened = path; break; }
    } catch { /* 次の綴りを試す */ }
  }
  if (!opened) { missing.push(`幅${width}: 表紙が開けなかった`); await ctx.close(); continue; }
  /* 印（`§eyebrow`）が本文に差し替わるのを待つ。焼いた HTML には時刻が無い */
  await p.waitForTimeout(SPORT ? 2500 : 8000);

  for (const [wi, word] of words.entries()) {
    /* 出ていないほうの文言は、同じ字の上に置き換えて測る。
       差し替えたのは `<b>` の中身だけで、字の大きさも箱も本番のまま。 */
    await p.evaluate((t) => {
      const el = document.querySelector(".hero-say b");
      if (el) el.textContent = t;
    }, word);
    await p.waitForTimeout(150);
    for (const [sel, name] of [[".hero-say b", "見出し"], [".hero-say i", "副題"]]) {
      const el = await p.$(sel);
      if (!el) { missing.push(`幅${width}/${sel}: 字が無い`); continue; }
      const r = await el.evaluate(measure);
      if (r.hidden) { missing.push(`幅${width}/${sel}: 隠れていた`); continue; }
      if (!r.lines.length) { missing.push(`幅${width}/${sel}: 字が空`); continue; }
      seen++;
      const last = r.lines[r.lines.length - 1];
      const ng = r.lines.length > 1 && last.w < MIN;
      if (ng) bad++;
      rows.push({ width, word: wi, name, n: r.lines.length, ws: r.lines.map((l) => l.w), last: last.w, text: last.text, ng });
    }
    /* 帯の高さ（島をどれだけ隠しているか）。文言ごとに変わるので文言ごとに測る */
    const plate = await p.evaluate(() => {
      const el = document.querySelector(".hero-say");
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { h: Math.round(r.height), w: Math.round(r.width), bottom: Math.round(r.bottom) };
    });
    if (plate) rows.push({ width, word: wi, plate });
  }
  if (!SPORT) {
    const bl = [...blocked(ctx).entries()];
    console.log(`  幅${width} 止めた先: ${bl.length ? bl.map(([h, n]) => `${h}×${n}`).join(", ") : "なし"}`);
  }
  await ctx.close();
}
await b.close();

console.log(`\n${SPORT ? "手元の書き出し" : "本番"} ${BASE}  孤立の下限 ${MIN}px`);
console.log(`文言: [0] ${words[0]}\n      [1] ${words[1]}\n`);
console.log("幅    文言 どこ   行数 行の幅             最終行 中身");
for (const r of rows) {
  if (r.plate) {
    console.log(`${String(r.width).padEnd(5)} [${r.word}]  ── 板 ${r.plate.w}x${r.plate.h}px（下ふち y=${r.plate.bottom}）`);
    continue;
  }
  console.log(
    `${String(r.width).padEnd(5)} [${r.word}]  ${r.name.padEnd(3)}  ${r.n}    ` +
    `${r.ws.join(" / ").padEnd(18)} ${String(r.last).padEnd(6)} 「${r.text}」${r.ng ? "  ← 孤立" : ""}`,
  );
}
console.log(`\n測った字 ${seen} か所（${WIDTHS.length}幅 × 文言${words.length} × 2か所 = ${WIDTHS.length * words.length * 2}）`);
if (missing.length) {
  console.error(`\n見ていないものが ${missing.length} 件あります。出した数は当てになりません:`);
  for (const m of missing) console.error("  - " + m);
  process.exit(2);
}
if (!seen) { console.error("1か所も測れませんでした。"); process.exit(2); }
console.log(bad ? `孤立 ${bad} 件` : `孤立 0 件（${seen} か所を見て0）`);
process.exit(bad ? 1 : 0);
