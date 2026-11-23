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
 * 時計を何日か進めて、表紙と掲示板を開く。
 *
 *  1〜2. （畳んだ）`/next` を指す札の字。**企画の面 `/next` は #1277 で畳んで `/board` へ 301 にした**ので、
 *     いまは**どの面にも `/next` を指す札が1つも無い**ことを数える（戻ってきたら、時制を名乗る札も一緒に戻る）
 *  3. **企画の在る日と、0件の日の両方を通る**（対照）。企画の在る日は表紙の「これから」に回の札が立つ
 *  4. 0件の日に、表紙の「これから」の段に**［いまここ］が立っている**（日にちの決まった回が0件でも、
 *     段は空にならない。#1276）。`docs/island-standards.md` §10 §15——黙って消えるのは、読めていない
 *     のと同じ絵になる
 *  5〜10. （畳んだ）`/now` の島だより。過ぎた行・見出しの時制・焼いた日付・0件の字の折れ方を見ていたが、
 *     島だよりは `/now` ごと畳んだ（#1278。`/` へ 301）。守る相手が無いので外した
 *
 * ## 表紙の［いまここ］は日付で消えない（2026-11-18 に足し、11-23 に滞在の表へ付け替えた。#1282・#1276）
 *
 * 11. **いちばん先の日でも、表紙に［いまここ］が立っている**——国は滞在の表のいちばん新しい行。
 *     前は「`endsWhen` だけを持つ企画の札が立っている」を見ていたが、移動は企画ではなくなった
 *     （告知の札の表 `content/plans.ts` ごと畳んだ。#1277）。守るもの（あやと「いる国は日付で消えない」）は同じ。
 * 12. 滞在の表のいちばん新しい2行で、**着いた日に［いまここ］が入れ替わり、その前の日は前の国**。
 *
 * 撮った絵は `OUT` に置く。**数が通っても、目で見る。**
 *
 */
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { offline } from "./route.mjs";
import { repoPath } from "./repo.mjs";
import { must, readArray } from "./tsread.mjs";

const SPORT = process.env.SPORT || "4150";
const BASE = `http://127.0.0.1:${SPORT}`;
const OUT = process.env.OUT || "/tmp/nextempty";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

/* 「これから」の元は企画の表と日を持つお題（`lib/leadPlan.ts` の `AHEAD`）。字で読む（`tsread.mjs` の1本） */
const PROJECTS_SRC = readFileSync(repoPath("site/content/projects.ts"), "utf8");
const THEMES_SRC = readFileSync(repoPath("site/content/themes.ts"), "utf8");
const at = (iso) => `${iso}T11:00:00+09:00`;
const plus = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** 企画の表の行（始まる日と期間）と、日を持つお題の日。**字で読む手は `tsread.mjs` の1本**（`tsread_selftest.mjs`） */
const PROJECT_ROWS = must(
  readArray(PROJECTS_SRC, "PROJECTS", { keys: ["date"], lists: ["range"], idKey: "slug" }),
  "projects.ts の PROJECTS",
);
const THEME_DAYS = must(readArray(THEMES_SRC, "THEMES", { keys: ["date"], idKey: "id" }), "themes.ts の THEMES")
  .map((r) => r.date)
  .filter(Boolean);

/**
 * 表に在るいちばん遅い日（企画の期間の終わりも入れる）。**この翌日からは、どう数えても 0件。**
 * 日を持つお題は `date` の欄だけ（締め切りの `closesOn` は「これから」に出ない）。
 */
const LAST = PROJECT_ROWS.flatMap((r) => [r.date, ...(r.range ?? [])])
  .concat(THEME_DAYS)
  .filter(Boolean)
  .sort()
  .at(-1);

/**
 * 進める日。**企画の在る日と、ぜんぶ終わったあとの日を必ず両方入れる。**
 *
 * **日を焼かない。** ここに `2026-10-12` と書くと、次に企画が1件足された日に
 * 「企画の在る日」が片側へ寄って、対照が黙って崩れる
 * （`site/selftest/leadplan_selftest.mjs` が同じところで一度落ちている）。
 * 企画の表からその場で出す——いちばん先の `date:` がその企画の当日で、
 * `LAST` の翌日からは 0件。
 */
function daysFromPlans() {
  /* 企画の当日は、企画1件の**いちばん外側の `date`**（`tsread.mjs` の1本。#694） */
  const starts = PROJECT_ROWS.map((r) => r.date)
    .concat(THEME_DAYS)
    .filter(Boolean)
    .sort();
  if (!starts.length || !LAST) throw new Error("site/content/projects.ts・themes.ts から日付を1つも拾えませんでした");
  return [at(starts[starts.length - 1]), at(plus(LAST, 1)), at(plus(LAST, 40)), at(plus(LAST, 400))];
}

const DAYS = (process.env.DAYS || daysFromPlans().join(","))
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
console.log(`進める日: ${DAYS.join(" / ")}`);

/** 見る面。前に `/next` を指す札が立っていたところ（表紙と掲示板） */
const PAGES = [
  ["top", "/index.html"],
  ["board", "/board.html"],
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
  let none = null; // 表紙に［いまここ］が立ったか（0件の日も段が空にならない）

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
      /* 印は部品が持っている（`components/live/NextUp.tsx`。企画の札は `data-plan`、滞在の札は `data-role`） */
      lead = (await p.$$(".nextup-card[data-plan]")).length > 0;
      none = (await p.$$('.nextup-stay[data-role="here"]')).length > 0;
    }
    /* **その区画だけを撮る。** */
    const shots = { top: ".nextup", board: ".nb-board" };
    const el = await p.$(shots[name]);
    if (el) {
      await el.scrollIntoViewIfNeeded();
      await p.waitForTimeout(300);
      await el.screenshot({ path: `${OUT}/${day}-${name}.png` });
    } else {
      await p.screenshot({ path: `${OUT}/${day}-${name}.png` });
    }
  }

  seen.set(day, { labels, lead, none });
  await ctx.close();
}

// -------------------- 11. 表紙の［いまここ］は、日が過ぎても立っている（滞在の表のいちばん新しい行）

/* **仮の終わった日を入れない本物で**、いちばん先の日を1回だけ開く。表紙の「これから」は
   滞在の表から居場所を引く（`lib/leadPlan.ts` の `stayHere`。#1276）。日付で消えない、を
   守る足（あやと 2026-11-18）。国は表から読む（字で探さない。札の `data-stay`）。 */
const STAYS_ROWS = must(
  readArray(readFileSync(repoPath("site/content/stays.ts"), "utf8"), "STAYS", {
    keys: ["country", "from", "to"],
    idKey: "country",
  }),
  "stays.ts の STAYS",
).sort((a, b) => a.from.localeCompare(b.from));
const [STAY_PREV, STAY_LAST] = STAYS_ROWS.slice(-2);
const openBad = [];
let openRead = 0;

/** その日の表紙の［いまここ］と［つぎ］の国（`components/live/NextUp.tsx` の `data-stay`） */
async function stayOn(day) {
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    locale: "ja-JP", timezoneId: "Asia/Tokyo", isMobile: true, hasTouch: true,
  });
  await offline(ctx);
  await ctx.route(/fonts\.googleapis\.com/, (r) =>
    r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.addInitScript(clock(at(day)));
  const p = await ctx.newPage();
  const res = await p.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
  let got = null;
  if (res && res.status() < 400) {
    await p.waitForTimeout(1500);
    got = await p.evaluate(() => ({
      here: document.querySelector('.nextup-stay[data-role="here"]')?.getAttribute("data-stay") ?? null,
      next: document.querySelector('.nextup-stay[data-role="next"]')?.getAttribute("data-stay") ?? null,
    }));
    const el = await p.$(".nextup");
    await (el ?? p).screenshot({ path: `${OUT}/${day}-top-stay.png` });
  }
  await ctx.close();
  return got;
}

{
  const far = plus(LAST > STAY_LAST.from ? LAST : STAY_LAST.from, 400);
  console.log(`\n■ 表紙の［いまここ］を、${far} に開く`);
  const got = await stayOn(far);
  if (got) {
    openRead++;
    const ok = got.here === STAY_LAST.country;
    console.log(`  ${ok ? "○" : "×"} ${far} ［いまここ］=${got.here ?? "（無し）"}（表のいちばん新しい行は ${STAY_LAST.country}）`);
    if (!ok) openBad.push(`${far}: 表紙の［いまここ］が ${got.here ?? "無い"}（${STAY_LAST.country} のはず。日付で消えない）`);
  }
}

// -------------------- 12. 着いた日に［いまここ］が入れ替わる（その前の日は前の国で、［つぎ］に着く国）

let handRead = 0;
for (const [day, wantHere, wantNext] of [
  [plus(STAY_LAST.from, -1), STAY_PREV.country, STAY_LAST.country],
  [STAY_LAST.from, STAY_LAST.country, null],
]) {
  const got = await stayOn(day);
  if (!got) continue;
  handRead++;
  const ok = got.here === wantHere && got.next === wantNext;
  console.log(`  ${ok ? "○" : "×"} ${day} ［いまここ］=${got.here ?? "（無し）"} ［つぎ］=${got.next ?? "（無し）"}`);
  if (!ok) {
    openBad.push(`${day}: ［いまここ］=${got.here ?? "無し"} ［つぎ］=${got.next ?? "無し"}（${wantHere} と ${wantNext ?? "無し"} のはず）`);
  }
}
await b.close();

// ------------------------------------------------------------------ 読む

/** 分母を先に出す（`docs/island-standards.md` §15）。 */
console.log(`\n見た面 ${pagesRead} / ${DAYS.length * PAGES.length}（${DAYS.length}日 × ${PAGES.length}面）`);
if (pagesRead < DAYS.length * PAGES.length) {
  console.error("開けなかった面があります。数える前に止めます");
  process.exit(2);
}

const bad = [...openBad];
if (!openRead) {
  console.error("表紙を、いちばん先の日で1度も開けませんでした（11）");
  process.exit(2);
}
if (handRead < 2) {
  console.error(`滞在の入れ替わりを、着いた日とその前の日で ${handRead}/2 しか開けませんでした（12）`);
  process.exit(2);
}
// 3. 対照——企画の在る日と、0件の日を両方通ったか
const withLead = [...seen.entries()].filter(([, v]) => v.lead);
const without = [...seen.entries()].filter(([, v]) => !v.lead);
console.log(`\n■ 対照  企画の在る日 ${withLead.length}日 / 0件の日 ${without.length}日`);
if (!withLead.length || !without.length) {
  console.error("片側しか見ていません。DAYS に企画の在る日と、ぜんぶ終わった日の両方を入れてください");
  process.exit(2);
}

// 1 と 2. 畳んだ `/next` を指す札が、どの面にも無い
const all = new Map();
for (const [day, v] of seen) {
  for (const [t, where] of v.labels) {
    if (!all.has(t)) all.set(t, { days: new Set(), where: new Set() });
    all.get(t).days.add(day);
    for (const w of where) all.get(t).where.add(w);
  }
}
console.log(`\n■ /next を指す札 ${all.size}種類（畳んだ面なので 0 のはず）`);
for (const [t, v] of all) {
  console.log(`  × 「${t}」 ${[...v.where].join("・")} ${v.days.size}/${seen.size}日`);
  bad.push(`「${t}」が畳んだ /next を指している（${[...v.where].join("・")}）`);
}

// 4. 0件の日に、黙って消えていないか
console.log(`\n■ 0件の日に黙って消えていないか（表紙は［いまここ］）`);
for (const [day, v] of without) {
  console.log(`  ${v.none ? "○" : "×"} ${day}  表紙=${v.none ? "いまここが立つ" : "空"}`);
  if (!v.none) bad.push(`${day}: 表紙の「これから」に、企画の札も［いまここ］も無い`);
}
for (const [day, v] of withLead) {
  if (!v.none) bad.push(`${day}: 企画が在る日に、表紙の［いまここ］が無い`);
}

writeFileSync(
  `${OUT}/labels.json`,
  JSON.stringify(
    [...seen].map(([day, v]) => ({ day, lead: v.lead, none: v.none, labels: [...v.labels.keys()] })),
    null,
    2,
  ),
);
console.log(`\n撮ったもの: ${OUT}`);
console.log(bad.length ? `\n${bad.map((s) => "  × " + s).join("\n")}` : "\n（見つかりませんでした）");
process.exit(bad.length ? 1 : 0);
