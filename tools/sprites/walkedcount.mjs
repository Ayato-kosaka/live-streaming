/**
 * **「歩いた国」の数が、面によって食い違っていないか。** 日をずらして何日ぶんも見る。
 *
 *   tools/build.sh 3170
 *   python3 -m http.server 4170 --directory site/.next-3170 &
 *   SPORT=4170 DIST=site/.next-3170 node tools/sprites/walkedcount.mjs
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
import { readFileSync } from "fs";
import { repoPath, fromRoot } from "./repo.mjs";

const SPORT = process.env.SPORT || "4170";
const DIST = fromRoot(process.env.DIST || "site/.next-3170");

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

// ---------------------------------------------------------------- 画面から読む

/** 面ごとの読みかた。**数だけを返す。** 読めなければ null（0 と分ける） */
const READ = {
  "/index.html": () => {
    const el = [...document.querySelectorAll(".mei-num")].find((x) => x.innerText.includes("カ国を歩いた"));
    const m = el?.innerText.match(/(\d+)/);
    return m ? +m[1] : null;
  },
  "/now.html": () => {
    const m = document.body.innerText.match(/(\d+)カ国ぜんぶ/);
    return m ? +m[1] : null;
  },
  "/map.html": () => {
    const el = [...document.querySelectorAll(".stat")].find((x) => x.innerText.includes("歩いた国"));
    const m = el?.innerText.match(/(\d+)/);
    return m ? +m[1] : null;
  },
  // `/map` の年表の章。**合計が上の札と合っているか**が、今回ずれていたところ
  "/map.html#年表": () => {
    const notes = [...document.querySelectorAll(".hlist .fold-note, .hlist .f-note, .hlist summary")]
      .map((x) => x.innerText.match(/(\d+)カ国/))
      .filter(Boolean)
      .map((m) => +m[1]);
    return notes.length ? notes.reduce((a, b) => a + b, 0) : null;
  },
};

const bad = itineraryMatches();
if (bad.length) {
  for (const b of bad) console.log(`::error::旅程と AHEAD_COUNTRIES が食い違っています: ${b}`);
  console.log("数えるものがありません（写した入国日が旅程と合っていない）");
  process.exit(2);
}
if (!DONE.length || !AHEAD.length) {
  console.log(`数えるものがありません（歩き終わった国 ${DONE.length} / 旅の国 ${AHEAD.length}）`);
  process.exit(2);
}

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

let rows = 0;
let ng = 0;
console.log(`歩き終わった国 ${DONE.length}（国境の区間は数えない）／旅の国 ${AHEAD.length}`);
console.log(`見る日 ${DAYS.length}日 × 面 ${Object.keys(READ).length}\n`);
console.log(`  ${"日".padEnd(12)} ${"ほしい".padStart(6)}  ${Object.keys(READ).map((k) => k.padStart(16)).join("")}`);

for (const day of DAYS) {
  const iso = `${day}T10:00:00Z`;
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.route(/googleusercontent\.com|upload\.wikimedia\.org|instagram\.com|ytimg\.com|youtube\.com/, (r) =>
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
  const p = await ctx.newPage();
  const got = [];
  for (const [key, fn] of Object.entries(READ)) {
    const page = key.split("#")[0];
    await p.goto(`http://localhost:${SPORT}${page}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    // 畳みの中の数は開かないと読めない（`CLAUDE.md`「畳んだ中の絵を数えない」）
    await p.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
    await p.waitForTimeout(900);
    got.push(await p.evaluate(fn));
    rows++;
  }
  await ctx.close();
  const w = want(iso);
  const line = got.map((g) => String(g ?? "読めず").padStart(16)).join("");
  const okRow = got.every((g) => g === w);
  if (!okRow) ng++;
  console.log(`  ${day.padEnd(12)} ${String(w).padStart(6)}  ${line}${okRow ? "" : "   ← 食い違い"}`);
}

await b.close();
console.log(`\n見た ${DAYS.length}日 / ${rows}件。食い違った日 ${ng}日`);
if (!rows) {
  console.log("::error::1件も読めませんでした");
  process.exit(2);
}
process.exit(ng ? 1 : 0);
