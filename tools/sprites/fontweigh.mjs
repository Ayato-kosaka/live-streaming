/**
 * 書き出した面を1枚ずつ開いて、**書体に何バイト払っているか**と
 * **どの字をどの太さで描いているか**を数える。
 *
 *   tools/build.sh 3250
 *   python3 -m http.server 4250 --directory site/.next-3250 &
 *   DIST=site/.next-3250 SPORT=4250 node tools/sprites/fontweigh.mjs
 *
 * 出るもの:
 *   tools/fonts/weights.json  … 面ごと・太さごとに「画面に出る字」。subset.py が読む
 *   BYTES=… を渡すと、面ごとに払ったバイト数も別のファイルに書く（前後の突き合わせ用）
 *
 * ## なぜ太さごとに数えるのか
 *
 * 焼いた束は3太さで**同じ切り分け**を共有していた。ところが1枚の面が
 * 400 で描いている字は数十しかないのに、700・900 の切り分け（＝島じゅうの漢字）を
 * そのまま背負って、400 だけで 200KB 取りにいっていた（#692）。
 * 「その面のその太さで、実際に描かれる字」が分かれば、太さごとに切り分けられる。
 *
 * ## 面ごとに context を作り直す
 *
 * 使い回すと2枚目から書体がキャッシュに当たって、**要求が0本に見える。**
 * 遅いが、1枚ずつ捨てる。
 *
 * ## 太さの丸め
 *
 * 実ファイルは 400 / 700 / 900 の3本。CSS の 500 や 600 や 800 は
 * ブラウザが近い順に探して、このうちどれかに落ちる（CSS Fonts 4 の規則）。
 *   w <= 500  -> 400     （400 も 500 も 300 も 400 に落ちる）
 *   w <= 700  -> 700     （600 は 700）
 *   それ以上  -> 900     （800 は 900）
 * ここを間違えると、焼かない字が出て**端末の書体に落ちる**（見た目が変わる）。
 */
import { existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { fromRoot } from "./repo.mjs";
/* 絵の差し替え。`playwright-core` を連れてこないので、`NEAR` を1つ読みたい
   だけの対照（`fontbudget_selftest.mjs`）から import されても落ちない */
import { offline } from "./route.mjs";

const SPORT = process.env.SPORT || "4250";
const BASE = `http://localhost:${SPORT}`;
const DIST = fromRoot(process.env.DIST || "site/.next-verify");
const OUT = fromRoot(process.env.OUT || "tools/fonts/weights.json");
/* 払ったバイト数の控え。前後を突き合わせるときだけ渡す（weights.json には入れない。
   焼き直した翌日には嘘になる数字を、焼く側の入力に混ぜない） */
const BYTES = process.env.BYTES ? fromRoot(process.env.BYTES) : null;
const ONLY = (process.env.ONLY || "").split(",").filter(Boolean);
/* 幅。既定はスマホ（390）。PC で数えたいときだけ渡す */
const W = +(process.env.W || 390);
/* FAST=1 … 字だけ数える（払ったバイト数は見ない）。面ごとに context を作り直さず、
   送りも粗くする。**書体を焼き直すだけなら、これで足りる。**
   バイト数を測るときは外すこと（キャッシュに当たって 0 本に見える） */
const FAST = !!process.env.FAST;
/* 何枚ずつ並べて開くか。1枚あたりの待ち（読み込み＋送り）が長いので、
   箱が混んでいるときは並べたほうが早い。**バイト数は混み具合で変わらない**
   （`CLAUDE.md`「転送量は壁の時計で測ってよい」）ので、並べても数字は動かない。 */
const CONC = +(process.env.CONC || 1);

function walk(d, base = "") {
  let out = [];
  for (const f of readdirSync(d)) {
    if (["_next", "cache", "server", "static"].includes(f)) continue;
    const p = join(d, f);
    if (statSync(p).isDirectory()) out = out.concat(walk(p, base + "/" + f));
    else if (f.endsWith(".html")) out.push(base + "/" + f);
  }
  return out;
}

/** 書き出した面の綴り（`/legends/nordic.html`）から、表の見出し（`legends/nordic`）へ。 */
export const keyOf = (p) => p.replace(/\.html$/, "").replace(/^\//, "") || "index";

/**
 * **その書き出しに在る面ぜんぶ**を、表（`weights.json`）と同じ見出しで並べる。
 * 書き出しが無ければ**空**（投げない。呼ぶ側が「0面を数えて合格」にしないこと）。
 *
 * `fontbudget_selftest.mjs` が「表に無い面が在るか」を見るのに使う。
 * **あちらに歩き方を写さない**——写すと、こちらの飛ばし方を直した日に
 * 向こうだけ古くなって、**新しい面を数えないまま緑**になる
 * （`islepages.mjs` の26面と同じ形）。表を書くのはここなので、
 * 「表に何が載るはずか」もここが答える。
 *
 * @param {string} [dist] 書き出したものの置き場
 * @returns {string[]} `legends/nordic` のような見出し、並べ替え済み
 */
export function pageKeys(dist = DIST) {
  if (!existsSync(dist)) return [];
  return walk(dist).map(keyOf).sort();
}

/* その面に出る字を、太さごとに集める。
   隠れているもの（閉じた畳みの中・画面の外）も数える。**読む人は下まで送るし、
   畳みも開く。** いま描かれているものだけを数えると、束の切り分けが
   「一度に見える1画面ぶん」に寄って、送ったとたんに別の束を取りに行くことになる。
   数えないのは `<script>` の中身（RSC の受け渡しに島の文章がそのまま入っている）と、
   **島の書体で出していない段**。 */
/* ブラウザの中へ持ち込む丸め。`p.evaluate` は閉じ込めた変数を連れていけないので、
   字のまま渡して向こうで組み立てる。**定義が1つなら、対照はこれを見ればよい。** */
export const NEAR = "(w) => (w <= 500 ? 400 : w <= 700 ? 700 : 900)";

/* `fontwaste.mjs` も同じ数え方で「描いた字」を拾う。**数え方を写すと、
   片方を直した日にもう片方が黙って古くなる**（`islepages.mjs` の26面と同じ形）。
   だからここから出して、向こうは読むだけにする。 */
export const COLLECT = (nearSrc) => {
  const bucket = { 400: new Set(), 700: new Set(), 900: new Set() };
  const near = eval(nearSrc);
  const add = (w, s) => {
    const b = bucket[near(w)];
    for (const c of s) if (c.codePointAt(0) > 0x1f) b.add(c);
  };
  const skip = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "TITLE"]);
  const walkNode = (root) => {
    const it = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    for (let el = root; el; el = it.nextNode()) {
      if (el.nodeType !== 1 || skip.has(el.tagName)) continue;
      const cs = getComputedStyle(el);
      // **島の書体で出る字だけ**を数える。同じ面の中に、わざと端末の書体で
      // 出している段がある（`tokens.css` の2本目以降だけを並べた font-family）。
      // そこの字まで焼くと、誰も取りに行かない字で束が太る
      if (!/^"?Maru Island/.test(cs.fontFamily)) continue;
      const w = parseInt(cs.fontWeight, 10) || 400;
      for (const n of el.childNodes) if (n.nodeType === 3) add(w, n.nodeValue);
      for (const pseudo of ["::before", "::after"]) {
        const c = getComputedStyle(el, pseudo).content;
        if (c && c !== "none" && c[0] === '"') add(w, c.slice(1, -1));
      }
      // 入力欄の下書き文字も画面に出る
      if (el.placeholder) add(w, el.placeholder);
      if (el.value && el.tagName === "INPUT") add(w, el.value);
      if (el.shadowRoot) walkNode(el.shadowRoot);
    }
  };
  walkNode(document.body);
  return Object.fromEntries(Object.entries(bucket).map(([k, v]) => [k, [...v].sort().join("")]));
};

/* 対照（`fontbudget_selftest.mjs`）はこのファイルから `NEAR` だけを読む。
   名指しで起こされたときだけ、ブラウザを立てて数えにいく。

   **`playwright-core` は、ここで初めて読む。** 上で `import` すると、
   読み込まれただけでも解決しにいく。見張りを回す側（`selftest.yml`）は
   `tools/sprites/node_modules` を入れていないので、`NEAR` を1つ読みたい
   だけの対照が `ERR_MODULE_NOT_FOUND` で落ちていた。**赤いのは書体ではなく、
   道具の立てかた**で、しかも落ちかたが「書体が太った」と見分けにくい。 */
if (!process.argv[1] || import.meta.url !== pathToFileURL(process.argv[1]).href) {
  // 読み込まれただけ。何もしない
} else {

/* **書き出しが無いときは、例外ではなく終了コード 2 で止める。**
   すぐ下に「面が無い」の案内があるのに、`walk()` のほうが先に
   `ENOENT` を投げていたので、読む人には Node のスタックしか出ていなかった。 */
if (!existsSync(DIST)) {
  console.error(`${DIST} が無い。先に書き出してください（tools/build.sh）。`);
  process.exit(2);
}
const pages = walk(DIST).sort().filter((p) => !ONLY.length || ONLY.includes(p));
if (!pages.length) {
  console.error(`${DIST} に面が無い。先に書き出してください（tools/build.sh）。`);
  process.exit(2);
}

const { chromium } = await import("playwright-core");
const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

const out = {};
const paid = {};
let reuse = null;
let total = 0;
let done = 0;

async function one(path, slot) {
  // 面ごとに作り直さないと、2枚目から書体がキャッシュに当たって 0 本に見える
  const ctx = (FAST && reuse) || await b.newContext({ viewport: { width: W, height: 844 }, isMobile: W < 640 });
  /* **絵を出してから測る。** この箱からは `i.ytimg.com` にも
     `lh3.googleusercontent.com` にも出られない。絵が落ちると Chrome は
     `alt` の字を**自分の影の中**に組んで描く——その影は JS から読めないので、
     下の `COLLECT` には1字も出ないのに、**書体だけは取りに行く。**
     実測 `/island/iran-walk` で 400 の束を 11本・370KB 余計に引いていた
     （#848）。差し替えずに測ると、面ごとの払う量がその分だけ嘘になる。 */
  if (!(FAST && reuse)) await offline(ctx);
  if (FAST && !reuse) reuse = ctx;
  const p = await ctx.newPage();
  const got = new Map();
  p.on("response", async (r) => {
    const u = new URL(r.url()).pathname;
    if (!/\.woff2?$/.test(u)) return;
    try { got.set(u, (await r.body()).length); } catch { /* 捨てられた */ }
  });
  await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
  try {
    await p.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 });
    await p.waitForTimeout(FAST ? 600 : 1200);
    // **一気に下まで飛ばさない。** `content-visibility: auto` の段は、画面に
    // 入ったときだけ描かれる。飛ばすと途中の段は一度も描かれず、その束を
    // 取りに行かないので、**読む人が実際に払う量より少なく出る**
    // （実測 /nordic/finland で 847.6KB と 955.7KB）
    await p.evaluate(async ({ STEP, WAIT }) => {
      for (let y = 0; y < document.body.scrollHeight; y += STEP) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, WAIT));
      }
    }, { STEP: FAST ? 1500 : 700, WAIT: FAST ? 20 : 60 });
    await p.waitForTimeout(FAST ? 500 : 1200);
    const chars = await p.evaluate(COLLECT, NEAR);
    const bytes = [...got.values()].reduce((a, v) => a + v, 0);
    const key = keyOf(path);
    out[key] = chars;
    paid[key] = { bytes, files: got.size };
    total += bytes;
    console.log(
      `${String(++done).padStart(3)}/${pages.length}  ${(bytes / 1024).toFixed(1).padStart(7)}KB ${String(got.size).padStart(2)}本  ` +
      `400:${chars["400"].length} 700:${chars["700"].length} 900:${chars["900"].length}  ${path}`
    );
  } catch (e) {
    console.log(`     ${path}  開けなかった: ${e.message.split("\n")[0]}`);
  }
  if (FAST) await p.close(); else await ctx.close();
}

const queue = pages.slice();
await Promise.all(
  Array.from({ length: Math.max(1, CONC) }, async (_, slot) => {
    for (let next = queue.shift(); next; next = queue.shift()) await one(next, slot);
  })
);
await b.close();
writeFileSync(OUT, JSON.stringify(out, null, 1), "utf8");
if (BYTES) writeFileSync(BYTES, JSON.stringify(paid, null, 1), "utf8");
console.log(`\n${pages.length}面  合計 ${(total / 1024 / 1024).toFixed(2)}MB  中央 ${
  (() => { const v = Object.values(paid).map((x) => x.bytes).sort((a, c) => a - c); return (v[v.length >> 1] / 1024).toFixed(1); })()
}KB  -> ${OUT}`);

}
