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
 *  5. 行の折れ方は `/now` の島だよりの0件の字で読む（下の 6〜10。前は `/next` の0件の見出しも読んでいた）
 *
 * ## `/now` の島だより（2026-10-13 に足した。#808）
 *
 * あやと: 「**過去のものが出るのはシステムとしておかしい**」。
 * `island/state.current.week` はあやとが旅先から打つ欄で、何日も打ち直せない。
 * 2026-10-13 の本番は 9/28 に打たれた「9/27 ストックホルムを発つ」を
 * まだ抱えていた（15日前）。
 *
 * ここは `/next` と**同じ形の見張り**なので、道具を分けずにここへ足す。
 * 口（`/island-api/state`）を差し替えて、**その日から見て過ぎた行・今日の行・
 * 先の行・日付の無い行**を1つずつ入れた便りを返す。見るのは4つ。
 *
 *  6. **過ぎた日の `M/D` が、画面の字に1つも出ない。**
 *  7. **今日と先の行は出る**（対照。これが無いと 6 は「何も出ていない」でも通る）。
 *  8. 見出しが**日で1文字も変わらない**。時制も件数も名乗らない。
 *  9. **ぜんぶ過ぎた日に、黙って箱ごと消えない**（#228 の決め3）。
 * 10. **焼いた HTML（`DIST` の `now.html`）に `M/D` が1つも無い。**
 *     焼いた字は動かないので、日付を焼いた時点で負け。
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
 * ## 行の折れ方（2026-10-12 に足した）
 *
 * （`/next` の）0件の見出しは 390px で「日にちの決まった企画／**は、**いまはありません」と
 * 折れていた。行頭に「は、」が来ていて、「企画」で切れているので一瞬べつの文に
 * 見える。表紙の同じ字は 360px で**「ん」1文字だけ**が2行目に落ちていた。
 *
 * **絵を見ないと分からない種類の壊れ方**なので、ここで幅を振って行の頭を読む。
 * 落とすのは2つ——**行頭に来てはいけない字で始まる行**と、
 * **1〜2文字しか乗っていない行**。
 */
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tenseOf } from "./navtruth.mjs";
import { offline } from "./route.mjs";
import { fromRoot, repoPath } from "./repo.mjs";
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
// ------------------------------------------------- 5. 行の折れ方（幅を振る）

/** 行の頭に来てはいけないもの。閉じる約物と、前の文節にくっつく助詞＋読点。 */
const BADHEAD = /^[、。）」』！？]|^[はがをにでとも][、。]/;
/** 幅を振って読む。**1枚ずつ開き直さず、器の幅だけ変える。** */
const SWEEP = [320, 360, 390, 430, 768, 1000, 1280];

/** その器の中の字が、幅ごとにどう折れるか。字ごとの top を行の高さで束ねる。 */
const readLines = (p, sel) =>
  p.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 24;
    const r = document.createRange();
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const lines = [];
    let n;
    while ((n = walk.nextNode())) {
      const s2 = n.textContent;
      for (let i = 0; i < s2.length; i++) {
        r.setStart(n, i);
        r.setEnd(n, i + 1);
        const top = r.getBoundingClientRect().top;
        /* 字ごとの top は書体の差し替えで1〜2px ゆれる。行の高さの半分で束ねる */
        const hit = lines.find((L) => Math.abs(L.top - top) < lh / 2);
        if (hit) hit.s += s2[i];
        else lines.push({ top, s: s2[i] });
      }
    }
    return lines.sort((a, c) => a.top - c.top).map((L) => L.s);
  }, sel);

const wrapBad = [];
// ------------------------------------------- 6〜10. `/now` の島だより（#808）

/**
 * 便りに入れる1行ぶん。**日はその場の「今日」から組む。**
 *
 * **日を焼かない。** ここに `9/27` と書くと、来年の9月にこの対照が
 * ひっくり返る（`daysFromPlans()` と同じ理由）。
 */
const md = (iso, shift) => {
  const d = new Date(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) + shift * 86400000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
};

/** その日の便り。過ぎた行・今日の行・先の行・日付の無い行を1つずつ。 */
const letterFor = (iso) => ({
  past: `${md(iso, -6)} もう過ぎた用事`,
  today: `${md(iso, 0)} 今日の用事`,
  ahead: `${md(iso, 4)} 先の用事`,
  plain: "回る先はこれから",
});

/** 画面の字から `M/D` を拾う。`datesIn` と違い、年を足さずに生のまま見る。 */
const mdIn = (text) => [...text.matchAll(/(?<![\d/])(\d{1,2})\/(\d{1,2})(?![\d/])/g)]
  .map((m) => `${Number(m[1])}/${Number(m[2])}`);

const nowBad = [];
let nowRead = 0;
/** 0件の字の行の折れ方。**1日ぶんだけ測る**（字は日で変わらないので足りる） */
let nowWrapDone = false;
let nowWrapRead = 0;
/** 日 → 見出しの字（日で変わらないことを見るのに使う） */
const nowHeads = new Map();
{
  console.log(`\n■ /now の島だより`);
  /* **両側を通る。** `full` は過ぎた行と先の行が混ざった便り、
     `allpast` は全部過ぎた便り。前者で「先の行は出る」を、後者で
     「0件の日に黙らない」を見る。片方だけでは何も言っていない（§15）。 */
  for (const iso of DAYS) {
    const day = iso.slice(0, 10);
    const L = letterFor(iso);
    for (const [kind, week] of [
      ["full", [L.past, L.today, L.ahead, L.plain]],
      ["allpast", [L.past, `${md(iso, -20)} ずっと前の用事`]],
    ]) {
      const ctx = await b.newContext({
        viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
        locale: "ja-JP", timezoneId: "Asia/Tokyo", isMobile: true, hasTouch: true,
      });
      await offline(ctx);
      await ctx.route(/fonts\.googleapis\.com/, (r) =>
        r.fulfill({ status: 200, contentType: "text/css", body: "" }));
      /* 口を差し替える。**`place` と `updatedAt` は触る側の本題ではない**ので、
         その日に打たれた新しい便り（＝人の字が勝つ日）にして、
         見るものを `week` 1つに絞る。 */
      await ctx.route(/\/island-api\/state/, (r) => r.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          current: { place: "アルバニア・ティラナ", theme: "georgia",
            word: "ティラナにいます。", week, updatedAt: day },
          stats: {}, notes: [], residents: [], nordic: {},
        }),
      }));
      await ctx.addInitScript(clock(iso));
      const p = await ctx.newPage();
      const res = await p.goto(`${BASE}/now.html`, { waitUntil: "domcontentloaded" });
      if (!res || res.status() >= 400) {
        nowBad.push(`${day} ${kind}: /now.html が ${res?.status()} で返った`);
        await ctx.close();
        continue;
      }
      await p.waitForTimeout(1800);
      const got = await p.evaluate(() => {
        const sec = [...document.querySelectorAll(".pap-sec")]
          .find((s) => s.querySelector(".pap-rows, .pap-note"));
        return {
          head: document.querySelector(".pap .pap-h")?.innerText.replace(/\s+/g, "") ?? "",
          /* **紙ぜんぶを読む。** 見出しの下だけ見ると、別の節に漏れた
             日付を見逃す（この面は国の節も日付を持っている） */
          paper: document.querySelector(".pap")?.innerText ?? "",
          rows: [...document.querySelectorAll(".pap-rows > li")].map((li) => li.innerText.trim()),
          note: sec?.querySelector(".pap-note")?.innerText.trim() ?? "",
        };
      });
      nowRead++;
      if (got.head) {
        if (!nowHeads.has(got.head)) nowHeads.set(got.head, new Set());
        nowHeads.get(got.head).add(`${day}/${kind}`);
      }
      const shown = got.rows.join(" / ");
      // 6. 過ぎた行は、どこにも出ない
      const leaked = mdIn(got.paper).filter((x) => x === md(iso, -6) || x === md(iso, -20));
      // 7. 先の行は出る（対照）
      const ahead = kind === "full" && got.rows.some((r) => r.includes(md(iso, 4)));
      const today = kind === "full" && got.rows.some((r) => r.includes(md(iso, 0)));
      // 9. ぜんぶ過ぎた日に黙らない
      const spoke = kind === "allpast" && !!got.note && !!got.head;
      const ok = !leaked.length && (kind === "full" ? ahead && today : spoke);
      console.log(`  ${ok ? "○" : "×"} ${day} ${kind.padEnd(7)} 見出し「${got.head}」 行=${shown || "（無し）"}${got.note ? ` 添え「${got.note}」` : ""}`);
      if (leaked.length) nowBad.push(`${day} ${kind}: 過ぎた日 ${[...new Set(leaked)].join(" ")} が紙に出ている`);
      if (kind === "full" && !ahead) nowBad.push(`${day}: 先の行（${md(iso, 4)}）が出ていない。対照が片側に寄っている`);
      if (kind === "full" && !today) nowBad.push(`${day}: 今日の行（${md(iso, 0)}）が落ちている。今日は過ぎていない`);
      if (kind === "allpast" && !spoke) nowBad.push(`${day}: ぜんぶ過ぎた日に、島だよりが黙って消えた`);
      const el = await p.$(".pap");
      await (el ?? p).screenshot({ path: `${OUT}/${day}-now-${kind}.png` });
      /* **字を替えたら、行の折れ方まで読む**（#228 の最後）。0件の日の字は
         この面でしか出ないので、`/next` の掃き出しとは別にここで幅を振る。
         1日ぶんでよい——字は日で変わらないことを上で見ている。 */
      if (kind === "allpast" && !nowWrapDone) {
        nowWrapDone = true;
        for (const [sel, name] of [
          [".pap .pap-h", "島だよりの0件の見出し"],
          [".pap .pap-note", "島だよりの0件の添え書き"],
        ]) {
          for (const w of SWEEP) {
            await p.setViewportSize({ width: w, height: 900 });
            await p.waitForTimeout(150);
            const lines = await readLines(p, sel);
            if (!lines) { nowBad.push(`${name} が ${w}px で見つからない`); continue; }
            nowWrapRead++;
            const head = lines.slice(1).filter((l) => BADHEAD.test(l));
            const thin = lines.filter((l) => [...l].length <= 3);
            console.log(`  ${!head.length && !thin.length ? "○" : "×"} ${String(w).padStart(4)}px ${name}  ${lines.map((l) => `「${l}」`).join(" / ")}`);
            for (const l of head) nowBad.push(`${name} ${w}px: 行が「${l}」で始まっている`);
            for (const l of thin) nowBad.push(`${name} ${w}px: 「${l}」だけの行が出ている`);
          }
        }
        await p.setViewportSize({ width: 390, height: 844 });
      }
      await ctx.close();
    }
  }

  // 8. 見出しが日で変わらない／時制も件数も名乗らない
  console.log(`\n■ 島だよりの見出し ${nowHeads.size}種類`);
  for (const [t, where] of nowHeads) {
    const tense = tenseOf(t);
    const count = COUNTS.test(t);
    console.log(`  ${!tense && !count ? "○" : "×"} 「${t}」 ${[...where].join("・")}`);
    if (tense) nowBad.push(`島だよりの見出し「${t}」が時制を名乗っている（要る: ${tense}）`);
    if (count) nowBad.push(`島だよりの見出し「${t}」が件数を名乗っている`);
  }
  /* **2種類まで。** 「やること」と「いまはありません」の2つ以外に増えていたら、
     どこかで日によって字が変わっている。 */
  if (nowHeads.size > 2) {
    nowBad.push(`島だよりの見出しが ${nowHeads.size}種類ある（日で変わる字が混ざっている）`);
  }

  // 10. 焼いた HTML に `M/D` が1つも無い
  const DIST = fromRoot(process.env.DIST || "site/.next-verify");
  const baked = join(DIST, "server", "app", "now.html");
  let html = "";
  try {
    html = readFileSync(baked, "utf8");
  } catch {
    try {
      html = readFileSync(join(DIST, "now.html"), "utf8");
    } catch {
      nowBad.push(`焼いた /now.html を ${DIST} から読めません（DIST を渡してください）`);
    }
  }
  if (html) {
    /* 読むのは**紙の中だけ。** 面ぜんぶを見ると、スクリプトの中の
       版の番号やサイズ（`390/844`）まで日付に見える。 */
    const paper = [...html.matchAll(/<div class="pap"[\s\S]*?<\/div>/g)].map((m) => m[0]).join("");
    const txt = (paper || html).replace(/<[^>]*>/g, " ");
    const hit = mdIn(txt);
    console.log(`\n■ 焼いた /now.html の紙に日付 ${hit.length}件 ${hit.length ? `「${hit.join(" ")}」` : ""}`);
    if (hit.length) {
      nowBad.push(`焼いた /now.html に日付 ${hit.join(" ")} が入っている（焼いた字は動かない）`);
    }
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

const bad = [...wrapBad, ...nowBad, ...openBad];
if (!openRead) {
  console.error("表紙を、いちばん先の日で1度も開けませんでした（11）");
  process.exit(2);
}
if (handRead < 2) {
  console.error(`滞在の入れ替わりを、着いた日とその前の日で ${handRead}/2 しか開けませんでした（12）`);
  process.exit(2);
}
console.log(`\n見た島だより ${nowRead} / ${DAYS.length * 2}（${DAYS.length}日 × 2通り）`);
if (nowRead < DAYS.length * 2) {
  console.error("島だよりを開けなかった日があります。数える前に止めます");
  process.exit(2);
}
if (nowWrapRead < SWEEP.length * 2) {
  console.error(`島だよりの0件の字を、幅 ${nowWrapRead}/${SWEEP.length * 2} しか読めませんでした`);
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
