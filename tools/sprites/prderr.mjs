/**
 * **出したものを開いて、JS が落ちていないかを数える。**
 *
 *   node tools/sprites/prderr.mjs
 *   PAGES=/,/legends,/nordic node tools/sprites/prderr.mjs
 *
 * 全面の巡回（`crawl.mjs`）は**手元の書き出し**を見る。あちらは口を持たないので、
 * 本番でだけ通る道——`/island-api/*` の返りで組み立てる節、旅の日で変わる字——は
 * 一度も動いていない。ここは**本番そのもの**を開く。
 *
 * ## `console` だけでは、投げた例外が拾えない
 *
 * `page.on("console")` に来るのは `console.error(...)` で、**`throw` は来ない。**
 * ChunkLoadError も React の水あわせの失敗も投げるほうなので、`console` だけ
 * 見ていると**何を開いても 0件**になる。実際に1度そうなった——12面ぜんぶ
 * 「JSエラー 0」と出て、**わざと投げてみたら、それも 0 だった。**
 * 拾うのは `pageerror` と両方。
 *
 * ## だから、毎回まず自分で1つ投げてみる
 *
 * 数える前に表紙で `throw` を1つ起こして、**それが拾えたときだけ**本物を見に行く。
 * 拾えなければ数字を1つも出さずに 2 で止まる。「0件」と「測れていない」は別。
 *
 * ## この箱の通信は、たまに落ちる
 *
 * `prod.mjs` は要求を curl で横取りする（ブラウザは本番に届かない）。その途中で
 * `ERR_FAILED` が出ることがあり、**本番は無事なのに ChunkLoadError に見える。**
 * 一度出た面は**もう一度だけ開き直す**。2回とも落ちたものだけを数える。
 *
 * 終了コード: 0＝ぜんぶ静か / 1＝JS が落ちた面がある / 2＝数えられなかった
 */
import { chromium } from "playwright-core";
import { open } from "./prod.mjs";

const PAGES = (process.env.PAGES ||
  "/,/now,/next,/board,/map,/streams,/kitchen,/friends,/nordic,/cards,/legends,/about")
  .split(",").map((s) => s.trim()).filter(Boolean);

/** 1面ぶん開いて、投げた例外とコンソールのエラーと落ちた要求を数える */
async function look(b, path, plant = false) {
  const { ctx, p } = await open(b, { path });
  const errs = [];
  const fails = [];
  p.on("console", (m) => { if (m.type() === "error") errs.push(`console: ${m.text().slice(0, 90)}`); });
  p.on("pageerror", (e) => errs.push(`throw: ${String(e).slice(0, 90)}`));
  p.on("requestfailed", (r) => fails.push(`${r.failure()?.errorText} ${r.url().slice(0, 90)}`));
  /* `open()` の中で1回目の読み込みは終わっているので、聞き耳を立ててから開き直す */
  await p.reload({ waitUntil: "domcontentloaded" });
  if (plant) await p.evaluate(() => { setTimeout(() => { throw new Error("対照: わざと投げた"); }, 50); });
  await p.waitForTimeout(5000);
  const h1 = await p.evaluate(() => document.querySelector("h1")?.textContent?.trim() || "(h1 なし)");
  await ctx.close();
  return { errs, fails, h1 };
}

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"],
});

// --- 対照。拾えないなら、数字を1つも出さない -------------------------------
const ctl = await look(b, PAGES[0], true);
const caught = ctl.errs.some((e) => e.startsWith("throw:"));
console.log(`対照（${PAGES[0]} でわざと1つ投げる）… ${caught ? "拾えた" : "**拾えていない**"}`);
if (!caught) {
  console.error("::error::投げた例外を拾えませんでした。ここから先の 0 は「無い」ではなく「測れていない」です");
  await b.close();
  process.exit(2);
}

let bad = 0;
for (const path of PAGES) {
  let r = await look(b, path);
  /* この箱の横取りがこけただけかもしれない。**1度だけ開き直す** */
  if (r.errs.length) {
    const again = await look(b, path);
    if (!again.errs.length) {
      console.log(`ok ${path.padEnd(10)} h1=${again.h1.slice(0, 18)}  （1回目は落ちたが、2回目は静か＝この箱の通信）`);
      continue;
    }
    r = again;
  }
  const ng = r.errs.length > 0;
  if (ng) bad++;
  console.log(`${ng ? "NG" : "ok"} ${path.padEnd(10)} h1=${r.h1.slice(0, 18)}  JSエラー=${r.errs.length} 落ちた要求=${r.fails.length}`);
  r.errs.slice(0, 3).forEach((e) => console.log(`       ${e}`));
}

console.log(`\n${PAGES.length}面を本番で開いて、JS の落ちた面 ${bad}（対照は効いている）`);
await b.close();
process.exit(bad ? 1 : 0);
