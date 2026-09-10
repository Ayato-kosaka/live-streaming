/**
 * **日付で変わる面を、時計を進めて撮る。**
 *
 *   PORT=4620 DIST=/home/user/day-wt/site/.next-3210 OUT=/tmp/jstday node jstday.mjs
 *
 * 島の日付は日本時間で切る（`site/lib/nightly.ts` の `jstNow`）。
 * ところが「今日」を UTC で切っている場所が残っていて、**毎日 00:00〜09:00 JST の
 * あいだ「今日」が前の日を指していた。** 北欧への出発は 04:30 JST なので、
 * 出発の瞬間から4時間半まるごとその窓に入る。表紙が過ぎた企画を「今日」と出し、
 * 旅そのものが一覧から落ちていた。
 *
 * ## 時計を差し込むときは、時差も一緒に差し込む
 *
 * `Date` だけ差し替えて時差を既定（UTC）のままにすると、**JST と UTC の
 * 食い違いそのものが消える。** 直っていないものが直って見えるので、
 * `timezoneId: "Asia/Tokyo"` を必ず一緒に置く（`docs/island-misses.md` 決めごと2）。
 *
 * ## 本番の値で確かめる
 *
 * 島の様子（`/island-api/state`）と掲示板（`/island-api/nextplans`）は
 * 本番から落としたものを返す。掲示板の段は Firestore にしか無いので、
 * 空の応答で撮ると「これから」と出ている札が1枚も写らない。
 *
 * ## 水あわせ（hydration）は `pageerror` と `console` の両方で拾う
 *
 * React の水あわせ失敗（`Minified React error #418` / `#423`）は、
 * ブラウザによって console だけに出ることがある。片方だけ見ると 0件に見える。
 */
import { chromium } from "playwright-core";
import { mkdirSync, existsSync, readFileSync } from "fs";
import { offline } from "./route.mjs";

const PORT = process.env.PORT || 4620;
const OUT = process.env.OUT || "/tmp/jstday";
const TAG = process.env.TAG || "";
/** 見る時点。差し込まないときは `WHEN=real` */
const WHENS = (process.env.WHENS ||
  "2026-09-10T12:00:00Z,2026-09-11T19:25:00Z,2026-09-11T19:35:00Z,2026-09-11T20:00:00Z,2026-09-18T12:00:00Z"
).split(",");
const PAGES = (process.env.PAGES || "/,/next,/board,/atlas").split(",");

const STATE = existsSync("/tmp/state.json") ? readFileSync("/tmp/state.json", "utf8") : null;
const NEXTPLANS = existsSync("/tmp/nextplans.json") ? readFileSync("/tmp/nextplans.json", "utf8") : null;

const clockFor = (when) =>
  when === "real"
    ? ""
    : `(() => {
  const F = ${Date.parse(when)}, R = Date, s = R.now();
  class D extends R {
    constructor(...a) { a.length ? super(...a) : super(F + (R.now() - s)); }
    static now() { return F + (R.now() - s); }
  }
  D.parse = R.parse; D.UTC = R.UTC; globalThis.Date = D;
})();`;

mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

/** 面ごとに「何が見えていれば通るか」を DOM から読む */
const READ = {
  "/": () => {
    const cards = [...document.querySelectorAll(".nextup-card")].map((e) => ({
      count: e.querySelector(".nextup-count")?.textContent?.trim() ?? "",
      title: e.querySelector(".nextup-title")?.textContent?.trim() ?? "",
    }));
    const body = document.body.innerText;
    const nums = [...document.querySelectorAll(".mei-num")].map((e) => e.innerText.replace(/\s+/g, ""));
    const shelf = [...document.querySelectorAll(".shelf-n, .shf-n, .sh-n")].map((e) => e.innerText);
    return {
      札: cards,
      北欧: (body.match(/ヒッチハイクで北欧へ/g) || []).length,
      ジョージアバイバイ: (body.match(/ジョージアバイバイ/g) || []).length,
      料理の数: [...body.matchAll(/(\d+)\s*品/g)].map((m) => m[0].replace(/\s+/g, "")),
      名刺: nums,
      棚: shelf,
    };
  },
  "/next": () => {
    const main = document.querySelector("main") ?? document.body;
    /* 先頭の札は `PlanCard`（`h2` と `.nx-clock`）。一覧の札は `.count` を持つ。
       クラス名を決め打ちにすると、形の違う実装を「無い」と読む
       （`docs/island-standards.md` 13）ので、見出しと札の両方を並べて出す。 */
    return {
      あたま: main.innerText.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 8),
      見出し: [...main.querySelectorAll("h2, h3")].map((e) => e.textContent.trim()).slice(0, 12),
      日数の札: [...main.querySelectorAll(".count, .nx-clock")].map((e) =>
        e.innerText.replace(/\s+/g, " ").trim(),
      ).slice(0, 12),
    };
  },
  "/board": () => {
    const items = [...document.querySelectorAll(".bd-list li")].map((e) => {
      const t = e.querySelector(".idea-body p")?.textContent?.trim() ?? "";
      const chips = [...e.querySelectorAll(".idea-meta em, .idea-meta span")].map((x) =>
        x.textContent.trim(),
      );
      return `${t} 【${chips.join(" / ")}】`;
    });
    const tile = [...document.querySelectorAll(".tile")]
      .map((e) => e.innerText.replace(/\s+/g, " ").trim())
      .filter((s) => s.includes("立っています"));
    return { 札: items, これから: tile };
  },
  "/atlas": () => ({
    島: [...document.querySelectorAll(".isle-card, .chain-isle, [class*='isle']")].length,
    日数: [...document.body.innerText.matchAll(/(\d+)日/g)].slice(0, 6).map((m) => m[0]),
  }),
};

const rows = [];
for (const when of WHENS) {
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    timezoneId: "Asia/Tokyo",
    locale: "ja-JP",
  });
  // 本番の値を返す。**空で撮ると、出ているはずの札が写らない**
  if (STATE) await ctx.route(/island-api\/state/, (r) => r.fulfill({ contentType: "application/json", body: STATE }));
  if (NEXTPLANS)
    await ctx.route(/island-api\/nextplans/, (r) =>
      r.fulfill({ contentType: "application/json", body: NEXTPLANS }),
    );
  await offline(ctx);
  const clock = clockFor(when);
  if (clock) await ctx.addInitScript(clock);

  for (const path of PAGES) {
    const p = await ctx.newPage();
    const errs = [];
    p.on("pageerror", (e) => errs.push(`pageerror: ${String(e.message).split("\n")[0]}`));
    p.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") errs.push(`${m.type()}: ${m.text().split("\n")[0]}`);
    });
    const file = path === "/" ? "index.html" : `${path.slice(1)}.html`;
    await p.goto(`http://localhost:${PORT}/${file}`, { waitUntil: "networkidle" });
    await p.waitForTimeout(2500);
    // 面の高さは、いちばん下まで送ってから測る（畳みは畳んだまま測れない）
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await p.waitForTimeout(600);
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.waitForTimeout(300);
    const seen = await p.evaluate(READ[path] ?? (() => ({})));
    const hydration = errs.filter((e) => /#418|#423|#425|Hydration|hydrat/i.test(e));
    const wide = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const name = `${TAG}${when.replace(/[:.]/g, "")}${path.replace(/\//g, "_") || "_"}.png`;
    await p.screenshot({ path: `${OUT}/${name}`, fullPage: false });
    rows.push({ when, path, seen, hydration, errs: errs.length, wide, shot: name });
    await p.close();
  }
  await ctx.close();
}
await b.close();

for (const r of rows) {
  console.log(`\n=== ${r.when}  ${r.path}   横あふれ ${r.wide}px   水あわせ ${r.hydration.length}件 ===`);
  console.log("   " + JSON.stringify(r.seen, null, 1).replace(/\n/g, "\n   "));
  if (r.hydration.length) console.log("   ★ " + r.hydration.join("\n   ★ "));
}
const bad = rows.filter((r) => r.hydration.length).length;
console.log(`\n水あわせが落ちた面: ${bad} / ${rows.length}   絵は ${OUT}`);
