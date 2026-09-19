/**
 * **「歩いた国」の数が、面によって食い違っていないか。** 日をずらして何日ぶんも見る。
 *
 *   tools/build.sh 3170
 *   python3 -m http.server 4170 --directory site/.next-3170 &
 *   SPORT=4170 DIST=site/.next-3170 node tools/sprites/walkedcount.mjs
 *
 *   node tools/sprites/walkedcount.mjs --selftest   # 対照だけ（サーバ不要・6秒）
 *   BREAK=band       名指しの1か所だけ見る（2026-09-19 まではこれだった）
 *   BREAK=innertext  `innerText` で読む（畳まれた棚が空で返る）
 *
 * 終了コード 0=そろっていた / 1=食い違った / **2=数えるものが無い**。
 *
 * ## なぜ要るか
 *
 * 2026-09-17 の本番で、表紙と `/now` が「20カ国」、`/map` の章の合計が「21カ国」
 * だった。原因は2つあって、**どちらも1日では見えない。**
 *
 *   1. `/map` の章の見出しが、国ではない「イラン（国境まで）」を1カ国と数えていた
 *   2. 数が焼き込み（`COUNTRIES_WALKED`）で、**国境を越えた日の朝は1つ少ない**
 *
 * 2 は「今日たまたま揃った」で通ってしまうので、**日をずらして測る。**
 * 国境を越える日（旅程の `entered`）をまたいで見ると、焼いた数と画面の数が割れる。
 *
 * ## 2026-09-19 に、この道具がすり抜けたもの（`docs/island-misses.md` #165）
 *
 * 本番の表紙が、名刺の帯で「23カ国」、すぐ下の棚の札で「22カ国」と出していた。
 * **同じ面・同じもの・同じ `/map` 行き**で数が2つ。この道具は緑だった。
 * 外していたのは2つある。
 *
 *   1. **見る場所を手で並べていた。** `/index.html` は `.mei-num` だけを読む、と
 *      書いてあった。棚（`.shelf-box`）はその名簿に載っていないので、
 *      **何を出していても永久に見えない。** 名簿を手で作ってはいけない
 *      （`docs/island-standards.md` 8章）。いまは面を書き出しから拾い、
 *      **`/map` へ行くリンクに書いてある「◯カ国」を全部**拾う。
 *      増えた札は、名簿を直さなくても次の回から見える。
 *   2. **`innerText` で読んでいた。** 棚は `content-visibility: auto` の中に
 *      いるので、画面の外にいるあいだ `innerText` が**空文字を返す**。
 *      送っても、送り戻すとまた空になる。**`textContent` で読む。**
 *
 * ## 何を「名乗り」と呼ぶか
 *
 * **`/map` へ行くリンクの中に書いてある「◯カ国」。** 押した先が並べている数と
 * 違ってはいけない、というのがこの道具の言い分なので、行き先で決める。
 * `/map/france` のような国のページは別物なので入れない。
 *
 * それ以外の「◯カ国」（`/all` の「行った順に18カ国」、`/island/*` の
 * 「この島で歩いた国 3カ国」、`/nordic/*` の「4カ国目」、`/kitchen` の
 * 「5カ国の宿のキッチン」）は**別の集合を数えている。** 落とすと嘘になるので、
 * **判定はしないが、見た数として全部並べる**（`docs/island-standards.md` §15）。
 * 新しい札が増えたら、この一覧に出る。
 *
 * ## 何を正とするか
 *
 * **`/map` に並んでいて、数えられる国**（`site/content/walked.ts`）。
 * 住人が「『歩いた国』から、これまで歩いた◯カ国をたどれるよー」と言う以上、
 * 行った先で数えられる数と違ってはいけない。
 *
 * ほしい数はこの道具が**自分で**組み立てる（`site/content/countries.ts` を読む）。
 * 画面の数をそのまま正解にすると、3面そろって間違っていても通る。
 */
import { chromium } from "playwright-core";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { repoPath, fromRoot } from "./repo.mjs";

const SPORT = process.env.SPORT || "4170";
const DIST = fromRoot(process.env.DIST || "site/.next-3170");
const BREAK = process.env.BREAK || "";
const SELFTEST = process.argv.includes("--selftest");

/** 見る日。**国境を越える日の前後を必ず入れる**（そこで焼き込みと画面が割れる） */
const DAYS = (process.env.DAYS || "2026-09-13,2026-09-17,2026-09-18,2026-09-19,2026-09-26").split(",");

// ---------------------------------------------------------------- ほしい数

const src = readFileSync(repoPath("site/content/countries.ts"), "utf8");

/** 歩き終わった国。**`-border` は国ではない**（`python/stays.py` の `is_country`） */
const DONE = [...src.matchAll(/^    slug: "([^"]+)",$/gm)].map((m) => m[1]).filter((s) => !s.endsWith("-border"));
/** いま歩いている旅の国と、入った日 */
const AHEAD = [...src.matchAll(/\{ slug: "([^"]+)", name: "[^"]+", entered: "(\d{4}-\d{2}-\d{2})" \}/g)].map(
  (m) => ({ slug: m[1], entered: m[2] }),
);

/** 旅程（`content/nordic.ts`）の入国日と、上の写しが合っているか。**合わなければ数えない。** */
function itineraryMatches() {
  const n = readFileSync(repoPath("site/content/nordic.ts"), "utf8");
  const want = new Map();
  let date = "";
  for (const line of n.split("\n")) {
    const d = line.match(/^\s*date: "(\d{4}-\d{2}-\d{2})",/);
    if (d) date = d[1];
    const e = line.match(/^\s*enters: "([a-z-]+)",/);
    if (e && !want.has(e[1])) want.set(e[1], date);
  }
  const bad = [];
  for (const [slug, day] of want) {
    const got = AHEAD.find((a) => a.slug === slug);
    if (!got) bad.push(`${slug} が AHEAD_COUNTRIES にない`);
    else if (got.entered !== day) bad.push(`${slug} の入国日 ${got.entered} ≠ 旅程 ${day}`);
  }
  for (const a of AHEAD) if (!want.has(a.slug)) bad.push(`${a.slug} が旅程にない`);
  return bad;
}

/** 旅の土地の暦（UTC+2）で、その瞬間の日付 */
const tripDate = (iso) => new Date(Date.parse(iso) + 2 * 3600_000).toISOString().slice(0, 10);

const want = (iso) => DONE.length + AHEAD.filter((a) => a.entered <= tripDate(iso)).length;

// ------------------------------------------------------------- 面の一覧

/**
 * 見る面は**書き出したものから拾う。手で並べない**（`docs/island-standards.md` 8章）。
 * 名簿を手で持つと、新しく置いた札がそこに載るまで見えない（#165）。
 */
function everyPage(dir = DIST, base = "") {
  const out = [];
  for (const f of readdirSync(dir)) {
    if (f === "_next" || f === "cache" || f.startsWith(".")) continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...everyPage(p, base + "/" + f));
    else if (f.endsWith(".html")) out.push(base + "/" + f);
  }
  return out.sort();
}

// ------------------------------------------------------- 面から名乗りを拾う

/**
 * ブラウザの中で走る。返すのは
 *   claims   … `/map` へ行くリンクに書いてある「◯カ国」（**判定する**）
 *   others   … それ以外の「◯カ国」（**並べるだけ**。別の集合を数えている）
 *
 * `read` は `textContent` か `innerText`。**既定は `textContent`。**
 * `innerText` は `content-visibility: auto` の外にいる棚で空文字を返す（#165）。
 */
function harvest({ read, only }) {
  const text = (el) => ((read === "innerText" ? el.innerText : el.textContent) || "").replace(/\s+/g, "");
  const claims = [];
  const sel = only || 'a[href]';
  for (const a of document.querySelectorAll(sel)) {
    const href = a.getAttribute("href") || "";
    // `/map` そのものだけ。`/map/france` は別の面
    if (!/^\/map\/?(?:[?#]|$)/.test(href)) continue;
    const m = text(a).match(/(\d+)\s*カ国/);
    if (!m) continue;
    const cls = (a.className || "").toString().trim().split(/\s+/)[0] || a.tagName.toLowerCase();
    claims.push({ where: `a.${cls}`, n: +m[1], t: text(a).slice(0, 32) });
  }
  // 並べるだけのほう。`<script>` の中の焼き込み JSON は字ではないので落とす
  const body = document.body.cloneNode(true);
  for (const s of body.querySelectorAll("script,style,template")) s.remove();
  const flat = (body.textContent || "").replace(/\s+/g, "");
  const others = [...new Set([...flat.matchAll(/.{0,10}\d+\s*カ国.{0,10}/g)].map((m) => m[0]))];
  return { claims, others };
}

// ------------------------------------------------------------------ 対照
/**
 * **植えた食い違いを拾えること**と、**拾ってはいけないものを拾わないこと**を、
 * 本物の面に当てる前に見る。落ちない対照は、通っても何も言っていない。
 *
 * 4件目が今回の本体。**畳まれた棚**（`content-visibility: auto` の中で画面の外）を
 * 置いてある。`innerText` で読むと空で返るので拾えない。
 */
async function selftest(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 400 } });
  const p = await ctx.newPage();
  const ok = [];
  const ng = [];
  const check = (label, got, exp) =>
    (JSON.stringify(got) === JSON.stringify(exp) ? ok : ng).push(`${label}: 出た=${JSON.stringify(got)} ほしい=${JSON.stringify(exp)}`);

  const run = async (html) => {
    await p.setContent(`<!doctype html><meta charset=utf-8>${html}`);
    await p.waitForTimeout(30);
    return await p.evaluate(harvest, { read: BREAK === "innertext" ? "innerText" : "textContent", only: BREAK === "band" ? ".mei-num" : null });
  };

  // 1. 2026-09-19 の表紙そのもの。帯 23 / 棚 22 の**2件とも**拾えること
  let r = await run(
    `<a class="mei-num" href="/map"><em>23</em><span>カ国を歩いた</span></a>` +
      `<a class="shelf-box" href="/map"><span class="shelf-n"><em>22</em><i>カ国</i></span><b>歩いた国</b></a>`,
  );
  check("表紙の名乗りを2件とも拾う", r.claims.map((c) => c.n).sort(), [22, 23]);

  // 2. そろっている面は、1件も食い違わない
  r = await run(
    `<a class="mei-num" href="/map"><em>23</em><span>カ国を歩いた</span></a>` +
      `<a class="shelf-box" href="/map"><em>23</em><i>カ国</i></a>`,
  );
  check("そろっていれば食い違い0", r.claims.filter((c) => c.n !== 23).length, 0);

  // 3. 別の集合を数えている「◯カ国」を、名乗りとして拾わない
  r = await run(
    `<a href="/nordic">この旅のこと 6カ国、17日</a>` +
      `<a href="/map/france">フランス</a>` +
      `<div>この島で歩いた国 3カ国</div><p>5カ国の宿のキッチンで作った。</p>`,
  );
  check("旅の6カ国・島の3カ国・国のページは名乗りにしない", r.claims.length, 0);
  const joined = r.others.join("／");
  check("それでも見たものとしては並べる", ["6カ国", "3カ国", "5カ国"].every((x) => joined.includes(x)), true);

  // 4. **畳まれた棚**。`content-visibility: auto` の外にいても拾えること（#165 の本体）
  r = await run(
    `<style>.mat{content-visibility:auto;contain-intrinsic-size:600px}</style>` +
      `<div style="height:1200px"></div>` +
      `<div class="mat"><a class="shelf-box" href="/map"><em>22</em><i>カ国</i></a></div>`,
  );
  check("畳まれた棚（画面の外）も読める", r.claims.map((c) => c.n), [22]);

  await ctx.close();
  console.log(`対照 ${ok.length + ng.length}件中 ${ok.length}件通った${BREAK ? `（BREAK=${BREAK}）` : ""}`);
  for (const line of ng) console.log(`::error::対照が落ちました — ${line}`);
  if (!ok.length) {
    console.log("::error::対照が0件です");
    return 2;
  }
  return ng.length ? 2 : 0;
}

// ------------------------------------------------------------------ 本番

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

const control = await selftest(b);
if (control) {
  await b.close();
  console.log("対照が通らないので、面は1枚も見ていません");
  process.exit(2);
}
if (SELFTEST) {
  await b.close();
  process.exit(0);
}

const bad = itineraryMatches();
if (bad.length) {
  for (const x of bad) console.log(`::error::旅程と AHEAD_COUNTRIES が食い違っています: ${x}`);
  console.log("数えるものがありません（写した入国日が旅程と合っていない）");
  await b.close();
  process.exit(2);
}
if (!DONE.length || !AHEAD.length) {
  console.log(`数えるものがありません（歩き終わった国 ${DONE.length} / 旅の国 ${AHEAD.length}）`);
  await b.close();
  process.exit(2);
}

const PAGES = everyPage();
if (!PAGES.length) {
  console.log(`::error::${DIST} に面がありません。先に書き出してください（tools/build.sh）`);
  await b.close();
  process.exit(2);
}

/** 1つの文脈を、日を差し替えて作る */
async function contextAt(iso) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.route(/googleusercontent\.com|upload\.wikimedia\.org|instagram\.com|ytimg\.com|youtube\.com|storage\.googleapis\.com/, (r) =>
    r.fulfill({ path: repoPath("site/public/og.png") }),
  );
  await ctx.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  // 島の口は落とす。**暦だけで決まる数**を見たいので、押された事実は入れない
  await ctx.route(/\/island-api\//, (r) => r.abort());
  await ctx.addInitScript(`(() => {
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
  })();`);
  return ctx;
}

const READ_ARGS = { read: BREAK === "innertext" ? "innerText" : "textContent", only: BREAK === "band" ? ".mei-num" : null };

/** 1面ぶん開いて、名乗りとそれ以外を拾う */
async function look(p, page) {
  await p.goto(`http://localhost:${SPORT}${page}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  // 畳みの中の数は開かないと読めない（`CLAUDE.md`「畳んだ中の絵を数えない」）
  await p.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
  await p.waitForTimeout(700);
  return await p.evaluate(harvest, READ_ARGS);
}

/**
 * `/map` は自分自身へのリンクを持たないので、ここだけ面ごとの読みかたを足す。
 * 章の合計が上の札と合っているかは、2026-09-17 にずれていたところ。
 */
const EXTRA = {
  "/map.html": [
    ["/map の札", () => {
      const el = [...document.querySelectorAll(".stat")].find((x) => (x.textContent || "").includes("歩いた国"));
      const m = (el?.textContent || "").match(/(\d+)/);
      return m ? +m[1] : null;
    }],
    ["/map の年表（章の合計）", () => {
      const notes = [...document.querySelectorAll(".hlist .fold-note, .hlist .f-note, .hlist summary")]
        .map((x) => (x.textContent || "").match(/(\d+)カ国/))
        .filter(Boolean)
        .map((m) => +m[1]);
      return notes.length ? notes.reduce((a, c) => a + c, 0) : null;
    }],
  ],
};

// ---- 1周目。**どの面に名乗りがあるか**を、書き出しぜんぶから拾う

const today = new Date().toISOString().slice(0, 19) + "Z";
let ctx = await contextAt(today);
let p = await ctx.newPage();
const found = new Map(); // page -> claims
const mentions = new Map(); // page -> others
const unopened = [];
for (const page of PAGES) {
  let r;
  try {
    r = await look(p, page);
  } catch (e) {
    unopened.push(`${page}（${String(e).slice(0, 60)}）`);
    continue;
  }
  if (r.claims.length) found.set(page, r.claims);
  if (r.others.length) mentions.set(page, r.others);
}
await ctx.close();

console.log(`歩き終わった国 ${DONE.length}（国境の区間は数えない）／旅の国 ${AHEAD.length}`);
console.log(`書き出した面 ${PAGES.length}枚を1周して、\`/map\` へ行くリンクの「◯カ国」を拾いました\n`);

if (unopened.length) {
  console.log(`開けなかった面が ${unopened.length} 枚あります。**下の数字は当てになりません**:`);
  for (const u of unopened) console.log("  - " + u);
  console.log("");
}

console.log("── 名乗り（**判定する**。押した先が `/map` なので、あちらの数と同じでなければならない）");
for (const [page, cs] of found) for (const c of cs) console.log(`  ${page.padEnd(22)} ${c.where.padEnd(14)} ${String(c.n).padStart(3)}  「${c.t}」`);
console.log(`  ${found.size}枚 / ${[...found.values()].reduce((a, c) => a + c.length, 0)}件`);

const otherLines = [...mentions].flatMap(([page, os]) => os.filter((o) => !/^\s*$/.test(o)).map((o) => [page, o]));
console.log(`\n── そのほかの「◯カ国」（**判定しない**。別の集合を数えている。${otherLines.length}件）`);
for (const [page, o] of otherLines) console.log(`  ${page.padEnd(22)} 「${o}」`);

if (!found.size) {
  console.log("\n::error::`/map` へ行くリンクに「◯カ国」が1件もありません。読み方が外れています");
  await b.close();
  process.exit(2);
}

// ---- 2周目。名乗りのある面と `/map` を、**日をずらして**見る

const WATCH = [...new Set([...found.keys(), ...Object.keys(EXTRA)])].sort();
const COLS = [];
for (const page of WATCH) {
  for (const c of found.get(page) || []) COLS.push({ page, label: `${page.replace(/\.html$/, "")} ${c.where}`, where: c.where });
  for (const [label] of EXTRA[page] || []) COLS.push({ page, label, extra: label });
}

console.log(`\n── 日をずらして（${DAYS.length}日 × ${COLS.length}か所）`);
const W = Math.max(14, ...COLS.map((c) => c.label.length + 2));
console.log(`  ${"日".padEnd(12)} ${"ほしい".padStart(6)}  ${COLS.map((c) => c.label.padStart(W)).join("")}`);

let ng = 0;
let cells = 0;
for (const day of DAYS) {
  const iso = `${day}T10:00:00Z`;
  ctx = await contextAt(iso);
  p = await ctx.newPage();
  const got = new Map();
  for (const page of WATCH) {
    const r = await look(p, page);
    for (const c of r.claims) got.set(`${page}|${c.where}`, c.n);
    for (const [label, fn] of EXTRA[page] || []) got.set(`${page}|${label}`, await p.evaluate(fn));
  }
  await ctx.close();
  const w = want(iso);
  const vals = COLS.map((c) => got.get(`${c.page}|${c.extra || c.where}`) ?? null);
  cells += vals.length;
  const okRow = vals.every((v) => v === w);
  if (!okRow) ng++;
  console.log(
    `  ${day.padEnd(12)} ${String(w).padStart(6)}  ${vals.map((v) => String(v ?? "読めず").padStart(W)).join("")}${okRow ? "" : "   ← 食い違い"}`,
  );
}

await b.close();
console.log(`\n見た ${DAYS.length}日 / ${cells}件（${COLS.length}か所）。食い違った日 ${ng}日`);
if (!cells) {
  console.log("::error::1件も読めませんでした");
  process.exit(2);
}
process.exit(ng ? 1 : 0);
