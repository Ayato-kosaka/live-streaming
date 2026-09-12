/**
 * 「Doneru のぶんが、いつまで入っているか」の一行を、**3つの状態で撮る**（#294）。
 *
 *   SPORT=4150 OUT=/tmp/asof node tools/sprites/asofshot.mjs
 *
 * 撮るのは `/nordic` の応援の区画。口（`GET /island-api/fund`）だけを差し替える。
 *
 *   a-ok        元気なとき（`doneruAsOf` が無い）………… **1文字も足さない**
 *   b-stale     6日ぶん止まっているとき ……………………… その一行が出る
 *   c-nohealth  取り込みの記録が読めないとき ……………… **何も出ない**
 *   d-junk      記録が壊れた形で返ったとき ………………… **何も出ない**
 *   e-down      額そのものが読めないとき ……………………… 区画ごと数字が出ない
 *
 * c と d は、口が返すものとしては a と同じ（欄が無い／使えない）。
 * **同じ絵になることが合格**で、そこを見るために別々に撮る。
 * a と c を並べて1バイトも違わなければ、「記録が読めない日は黙る」が絵で言える。
 *
 * 差し込む額は**本番の `GET /island-api/fund`**（2026-09-12）。
 * 本番と違う値で撮ると、直っていないものが直って見える
 * （`docs/island-misses.md` 決めごと2）。
 */
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { chromium } from "playwright-core";

const ORIGIN = `http://127.0.0.1:${process.env.SPORT || 4150}`;
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const OUT = process.env.OUT || "/tmp/asof";
mkdirSync(OUT, { recursive: true });

/** 本番の `GET /island-api/fund`。**この4欄は、どの状態でも変えない。** */
const PROD = { total: 46980, given: 296626, goal: 50000, people: 53, updatedAt: null };

/** 6日ぶん止まった日。出発は 9/11 なので、旅の途中で切れた形。
    `ASOF=2025-12-28` を渡すと、年をまたいだときの出かた（年が付く）を撮れる。 */
const STALE_DAY = process.env.ASOF || "2026-09-06";

const CASES = [
  ["a-ok", PROD],
  ["b-stale", { ...PROD, doneruAsOf: STALE_DAY }],
  ["c-nohealth", PROD],
  // 札が壊れて日付の形になっていない回。画面が弾く（口も返さないが、二重に）
  ["d-junk", { ...PROD, doneruAsOf: "きのう" }],
  ["e-down", null],
];

const b = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });

async function shot(tag, body) {
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    hasTouch: true,
    isMobile: true,
  });
  // この箱から出られない先は、島の絵に差し替える（本番では出る）
  await ctx.route(
    /googleusercontent\.com|upload\.wikimedia\.org|instagram\.com|ytimg\.com|youtube\.com/,
    (r) => r.fulfill({ path: "/home/user/live-streaming/site/public/og.png" }),
  );
  await ctx.route(/fonts\.googleapis\.com/, (r) =>
    r.fulfill({ status: 200, contentType: "text/css", body: "" }),
  );
  /* **あとに登録したものから当たる**（`asme.mjs` と同じ）。
     受け皿を先に置いて、足代の口はそのあとに置く。逆にすると
     足代まで `{}` になって、額が1円も出ない絵ばかり撮ることになる。 */
  // 残りの口は空で返す。撮るのは足代の区画だけ
  await ctx.route(/\/island-api\//, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  await ctx.route(/\/island-api\/fund(\?|$)/, (r) =>
    body === null ?
      /* 額が1円も読めない日。口は 200 で 0 を返さず 503 を返す。
         **0円は「誰も出していない」に見える**（`island-standards.md` 10）。 */
      r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "no fund data" }) }) :
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) }),
  );

  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(`${ORIGIN}/nordic.html`, { waitUntil: "networkidle" });
  await p.waitForTimeout(1200);

  const box = await p.locator("#back").first();
  await box.scrollIntoViewIfNeeded();
  await p.waitForTimeout(400);

  const read = await p.evaluate(() => {
    const t = (s) => [...document.querySelectorAll(s)].map((e) => e.textContent.trim());
    const doc = document.documentElement;
    const el = document.querySelector("p.nback-asof");
    const r = el ? el.getBoundingClientRect() : null;
    return {
      額: t("p.nback-now"),
      一行: t("p.nback-asof"),
      札の数: document.querySelectorAll("p.nback-asof").length,
      札の幅: r ? Math.round(r.width) : 0,
      区画の高さ: Math.round(document.querySelector("#back")?.getBoundingClientRect().height ?? 0),
      横あふれ: doc.scrollWidth - doc.clientWidth,
    };
  });

  await box.screenshot({ path: `${OUT}/${tag}.png` });
  await p.screenshot({ path: `${OUT}/${tag}-full.png`, fullPage: false });
  console.log(tag.padEnd(12), JSON.stringify(read, null, 0), errs.length ? `JSエラー ${errs.length}` : "");
  await ctx.close();
  return read;
}

const got = {};
for (const [tag, body] of CASES) got[tag] = await shot(tag, body);
await b.close();

/* a（元気）と c（記録が読めない）が **1バイトも違わない**ことを見る。
   字で「黙る」と言っておいて絵が違えば、そこは直っていない
   （`docs/island-standards.md` 10）。 */
const same = (x, y) =>
  existsSync(`${OUT}/${x}.png`) && existsSync(`${OUT}/${y}.png`) &&
  Buffer.compare(readFileSync(`${OUT}/${x}.png`), readFileSync(`${OUT}/${y}.png`)) === 0;

console.log("");
console.log("元気 と 記録が読めない が同じ絵:", same("a-ok", "c-nohealth") ? "はい" : "★いいえ★");
console.log("元気 と 壊れた記録 が同じ絵:", same("a-ok", "d-junk") ? "はい" : "★いいえ★");
console.log("止まっているときだけ一行が出た:",
  got["b-stale"].札の数 === 1 &&
  got["a-ok"].札の数 === 0 && got["c-nohealth"].札の数 === 0 &&
  got["d-junk"].札の数 === 0 && got["e-down"].札の数 === 0 ? "はい" : "★いいえ★");
console.log("絵は", OUT);
