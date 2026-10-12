/**
 * **日にちの決まった企画が1つも無い日に、島が何と言うか。**
 *
 *   tools/build.sh 3150
 *   python3 -m http.server 4150 --directory site/.next-3150 &
 *   SPORT=4150 OUT=/tmp/nextempty node tools/sprites/nextempty.mjs
 *
 * 終了コード 0=通った / 1=見つかった / 2=数えるものが無い。
 *
 * ## なぜ要るか（#770）
 *
 * `/next` を指す札は長いあいだ「これから／いま 1 つ立っています」と数えていた。
 * 数え直しは画面が出てからなので、**開いている人の目には合っている。**
 * 合っていないのは**焼いた HTML のほう**で、`output: "export"` なので
 * 出した日の字がそのまま配られ続ける。10-12 に焼いた「1 つ立っています」は、
 * その企画が終わった 10-13 以降も配りっぱなしになった。
 * `navtruth.mjs` を `TODAY=2026-10-20` で当てると、そこが赤くなる。
 *
 * **直し方は「0件の日に別の字を出す」ではない。** それは画面が出たあとの話で、
 * 焼いた字は動かない。**札そのものを、日で変わらない字にする**
 * （`docs/island-standards.md` 16章の決めごと1）。
 *
 * ## 何を数えるか
 *
 * 時計を何日か進めて、3面（表紙・掲示板・企画）を開く。
 *
 *  1. **`/next` を指す札の字が、日によって1文字も変わらない。**
 *     変わる字は、焼いた瞬間から古くなっていく字。
 *  2. その札に、**時制の語も件数も入っていない**（時制の見分けは
 *     `navtruth.mjs` の `tenseOf`。語の一覧を2か所に持たない）。
 *  3. **企画が在る日と、0件の日の両方を通る**（対照）。どちらかしか
 *     見ていないなら、1と2は何も言っていない。
 *  4. 0件の日に、**表紙と `/next` が「無い」と言っている**（空にしない）。
 *     `docs/island-standards.md` §10 §15——黙って消えるのは、読めていない
 *     のと同じ絵になる。
 *
 * 撮った絵は `OUT` に置く。**数が通っても、目で見る。**
 */
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tenseOf } from "./navtruth.mjs";
import { offline } from "./route.mjs";
import { repoPath } from "./repo.mjs";

const SPORT = process.env.SPORT || "4150";
const BASE = `http://127.0.0.1:${SPORT}`;
const OUT = process.env.OUT || "/tmp/nextempty";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

/**
 * 進める日。**企画の在る日と、ぜんぶ終わったあとの日を必ず両方入れる。**
 *
 * **日を焼かない。** ここに `2026-10-12` と書くと、次に企画が1件足された日に
 * 「企画の在る日」が片側へ寄って、対照が黙って崩れる
 * （`site/selftest/leadplan_selftest.mjs` が同じところで一度落ちている）。
 * 企画の表からその場で出す——いちばん先の `date:` がその企画の当日で、
 * 表に在るいちばん遅い日の翌日からは、どう数えても 0件。
 */
function daysFromPlans() {
  const src = readFileSync(repoPath("site/content/plans.ts"), "utf8");
  const starts = [...src.matchAll(/^\s*date:\s*"(20\d\d-\d\d-\d\d)"/gm)].map((m) => m[1]).sort();
  const all = [...src.matchAll(/"(20\d\d-\d\d-\d\d)"/g)].map((m) => m[1]).sort();
  if (!starts.length || !all.length) throw new Error("site/content/plans.ts から日付を1つも拾えませんでした");
  const at = (iso) => `${iso}T11:00:00+09:00`;
  const plus = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  const last = all[all.length - 1];
  return [at(starts[starts.length - 1]), at(plus(last, 1)), at(plus(last, 40)), at(plus(last, 400))];
}

const DAYS = (process.env.DAYS || daysFromPlans().join(","))
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
console.log(`進める日: ${DAYS.join(" / ")}`);

/** 見る面。`/next` を指す札が立っているところ。 */
const PAGES = [
  ["top", "/index.html"],
  ["board", "/board.html"],
  ["next", "/next.html"],
];

/** 時計を止める。`Date` だけ差し替えれば島の日付はぜんぶこれを見る。 */
const clock = (iso) => `(() => {
  const FAKE = ${Date.parse(iso)};
  const Real = Date;
  const t0 = Real.now();
  const shift = () => FAKE + (Real.now() - t0);
  class D extends Real {
    constructor(...a) { if (a.length === 0) super(shift()); else super(...a); }
    static now() { return shift(); }
  }
  Object.defineProperty(D, "name", { value: "Date" });
  globalThis.Date = D;
})();`;

/** 件数を名乗っている字か。「1件」「3 つ立っています」「あと2つ」。 */
const COUNTS = /\d+\s*(件|つ)/;

const b = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
mkdirSync(OUT, { recursive: true });

/** 日 → その日に見えたもの */
const seen = new Map();
let pagesRead = 0;

for (const iso of DAYS) {
  const day = iso.slice(0, 10);
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    isMobile: true,
    hasTouch: true,
  });
  await offline(ctx);
  await ctx.route(/fonts\.googleapis\.com/, (r) =>
    r.fulfill({ status: 200, contentType: "text/css", body: "" }),
  );
  await ctx.addInitScript(clock(iso));
  const p = await ctx.newPage();

  /** その日の `/next` を指す札（字 → 出てきた面） */
  const labels = new Map();
  let lead = null; // 表紙に企画の札が出たか
  let none = null; // 表紙が「無い」と言ったか
  let nextNone = null; // `/next` が「無い」と言ったときの、その字

  for (const [name, url] of PAGES) {
    const res = await p.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded" });
    if (!res || res.status() >= 400) {
      console.error(`× ${day} ${url} が ${res?.status()} で返りました`);
      continue;
    }
    // 画面が出てから数え直す作りなので、数え直しが済むまで待つ
    await p.waitForTimeout(1500);
    pagesRead++;

    for (const t of await p.$$eval('a[href^="/next"]', (as) =>
      as.map((a) => a.innerText.replace(/\s+/g, " ").trim()).filter(Boolean),
    )) {
      if (!labels.has(t)) labels.set(t, new Set());
      labels.get(t).add(name);
    }
    if (name === "top") {
      lead = (await p.$$(".nextup-card")).length > 0;
      none = (await p.$$(".nextup-none")).length > 0;
    }
    if (name === "next") {
      /* **字で探さない。** 言い回しを1語直した日に、見張りのほうが黙る。
         印は面が持っている（`components/live/NextPlans.tsx` の `nx-none`）。 */
      const el = await p.$(".nx-none");
      nextNone = el ? (await el.innerText()).replace(/\s+/g, " ").trim() : null;
    }
    /* **その区画だけを撮る。** 画面1枚ぶんだと、`/next` の 0件の札は
       折り返しの下にいて1枚も写らない（撮ったのに見ていない、になる）。 */
    const shots = { top: ".nextup", board: 'a.tile[href="/next"]', next: ".nx-none, .plan-card, .panel" };
    const el = await p.$(shots[name]);
    if (el) {
      await el.scrollIntoViewIfNeeded();
      await p.waitForTimeout(300);
      await el.screenshot({ path: `${OUT}/${day}-${name}.png` });
    } else {
      await p.screenshot({ path: `${OUT}/${day}-${name}.png` });
    }
  }

  seen.set(day, { labels, lead, none, nextNone });
  await ctx.close();
}
await b.close();

// ------------------------------------------------------------------ 読む

/** 分母を先に出す（`docs/island-standards.md` §15）。 */
console.log(`\n見た面 ${pagesRead} / ${DAYS.length * PAGES.length}（${DAYS.length}日 × ${PAGES.length}面）`);
if (pagesRead < DAYS.length * PAGES.length) {
  console.error("開けなかった面があります。数える前に止めます");
  process.exit(2);
}

const bad = [];

// 3. 対照——企画の在る日と、0件の日を両方通ったか
const withLead = [...seen.entries()].filter(([, v]) => v.lead);
const without = [...seen.entries()].filter(([, v]) => !v.lead);
console.log(`\n■ 対照  企画の在る日 ${withLead.length}日 / 0件の日 ${without.length}日`);
if (!withLead.length || !without.length) {
  console.error("片側しか見ていません。DAYS に企画の在る日と、ぜんぶ終わった日の両方を入れてください");
  process.exit(2);
}

// 1 と 2. 札の字
const all = new Map();
for (const [day, v] of seen) {
  for (const [t, where] of v.labels) {
    if (!all.has(t)) all.set(t, { days: new Set(), where: new Set() });
    all.get(t).days.add(day);
    for (const w of where) all.get(t).where.add(w);
  }
}
console.log(`\n■ /next を指す札 ${all.size}種類`);
for (const [t, v] of all) {
  const everyDay = v.days.size === seen.size;
  const tense = tenseOf(t);
  const count = COUNTS.test(t);
  const mark = everyDay && !tense && !count ? "○" : "×";
  console.log(`  ${mark} 「${t}」 ${[...v.where].join("・")} ${v.days.size}/${seen.size}日`);
  if (!everyDay) bad.push(`「${t}」は ${[...v.days].join(" ")} にしか出ない（日で変わる札）`);
  if (tense) bad.push(`「${t}」が時制を名乗っている（要る: ${tense}）`);
  if (count) bad.push(`「${t}」が件数を名乗っている`);
}

// 4. 0件の日に、黙って消えていないか
console.log(`\n■ 0件の日に「無い」と言っているか`);
for (const [day, v] of without) {
  console.log(`  ${v.none && v.nextNone ? "○" : "×"} ${day}  表紙=${v.none ? "言った" : "黙った"} /next=${v.nextNone ?? "黙った"}`);
  if (!v.none) bad.push(`${day}: 表紙が、企画の札も「無い」の字も出していない`);
  if (!v.nextNone) bad.push(`${day}: /next が、0件だと言っていない`);
}
for (const [day, v] of withLead) {
  if (v.none) bad.push(`${day}: 企画が在るのに、表紙が「無い」とも言っている`);
}

writeFileSync(
  `${OUT}/labels.json`,
  JSON.stringify(
    [...seen].map(([day, v]) => ({ day, lead: v.lead, none: v.none, nextNone: v.nextNone, labels: [...v.labels.keys()] })),
    null,
    2,
  ),
);
console.log(`\n撮ったもの: ${OUT}`);
console.log(bad.length ? `\n${bad.map((s) => "  × " + s).join("\n")}` : "\n（見つかりませんでした）");
process.exit(bad.length ? 1 : 0);
