/**
 * 「いまどこ」を言う面を**ぜんぶ一度に**読んで、食い違いを数える。
 *
 * `tools/sprites/meishishot.mjs` は表紙の名刺と `/now` の2つを突き合わせる道具。
 * こちらはその横展開で、**同じ日に「いまどこ」を口にする面を全部**読む。
 *
 *   表紙   … 名刺の札 ／ 今日の島の板 ／ 配信中の札 ／ カモメの吹き出し
 *   /about … 「いま、どこで何してる」の札
 *   /now   … 1画面目
 *   /nordic… 主役の箱と、親指でつなぐ距離
 *
 * 4面が同じことを言っているかは、**撮っただけでは分からない。**
 * 実際、表紙の名刺だけ直したあと、`/about` と今日の島の板と島のカモメは
 * 「ジョージア・トビリシ」と言い続けていた（旅の2日目に実測）。
 *
 *   cd tools/sprites
 *   SPORT=4790 DATE=2026-09-13T22:30:00+09:00 node saidshot.mjs
 *
 *   DATE     時計をここに合わせる（ISO）。**時刻も効く**（配信の時間は22〜25時）
 *   PLACE    島の「いまどこ」。**既定は本番の値**（ジョージア・トビリシ）
 *   PLACE_AT `current.updatedAt`。**既定は本番の値**（2026-09-04）
 *   TAG      出す先の名前
 *   SPORT    書き出したものを配っているポート
 *   SLOW=1   **章の島（`IsleStage`）を遅らせる。** 配り直す前の表紙は、焼いた
 *            島（`components/island/IslandStage.tsx`）を出しておいて、章の島を
 *            取ってきてから入れ替える（`components/isle/Cover.tsx`）。
 *            取ってくるまでのあいだ、カモメの吹き出しと「いま配信中」の札は
 *            **焼いた島のもの**が出る。出発の夜そのものがその窓なので、
 *            そこを撮るために章の島の束を遅らせる。
 *
 *            **ただし、この窓は実測でほぼ無い。** その束を20秒遅らせると、
 *            表紙は名刺も今日の板も出ないまま（＝水あわせがそこを待っている）。
 *            つまり「焼いた島が出ていて、しかも動いている」時間はほとんど無く、
 *            章の島は水あわせと同時に入れ替わる。道具のせいではないことは、
 *            同じ仕掛けで別の束を遅らせると表紙がふつうに出ることで確かめた
 *
 * 差し込みの既定を「直っている前提の値」にすると、直っていないものが直って
 * 見える（`docs/island-misses.md` #1）。だから既定は本番のまま。
 *
 * ## 読みかた
 *
 * `innerText` は**送った位置で変わる**（表紙の章は `content-visibility: auto`）。
 * 合否は字そのもの（`textContent`）で決めて、本文の出入りは別に出す。
 * 表紙だけは送る前と送ったあとの2回読んで、同じ答えになるかまで見る。
 */
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "fs";
import { offline } from "./route.mjs";

const SPORT = process.env.SPORT || "4790";
const OUT = process.env.OUT || "/tmp/said";
const DATE = process.env.DATE || "2026-09-13T12:00:00+09:00";
const PLACE = process.env.PLACE ?? "ジョージア・トビリシ";
const PLACE_AT = process.env.PLACE_AT ?? "2026-09-04";
const TAG = process.env.TAG || DATE.slice(0, 16);
/** 前の国の名前。ここが画面に出たら、その面は古い欄を出している */
const OLD = process.env.OLD || "ジョージア";

const clock = `(() => {
  const FAKE = ${Date.parse(DATE)}, R = Date, s = R.now();
  const shift = () => FAKE + (R.now() - s);
  class D extends R {
    constructor(...a) { a.length ? super(...a) : super(shift()); }
    static now() { return shift(); }
    static parse(...a) { return R.parse(...a); }
    static UTC(...a) { return R.UTC(...a); }
  }
  Object.defineProperty(D, "name", { value: "Date" });
  globalThis.Date = D;
})();`;

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const dir = `${OUT}/${TAG.replace(/[:+]/g, "-")}`;
mkdirSync(dir, { recursive: true });
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
  timezoneId: "Asia/Tokyo",
});
await offline(ctx);
await ctx.addInitScript(clock);
await ctx.route(/island-api\/state/, (r) =>
  r.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      current: {
        place: PLACE,
        updatedAt: PLACE_AT,
        theme: "georgia",
        word: "きょうも22時から配信してます。",
        week: ["北欧までヒッチハイクで向かう"],
      },
      stats: null,
      notes: [],
      residents: [],
      nordic: null,
    }),
  }),
);
for (const [re, body] of [
  [/island-api\/nordic\/log/, { log: [] }],
  [/island-api\/nordic\/photos/, { days: [] }],
  [/island-api\/fund/, { total: 21500, people: 12 }],
  [/island-api\/forks/, { forks: {} }],
  [/island-api\/nextplans/, { plans: [] }],
]) {
  await ctx.route(re, (r) =>
    r.fulfill({ contentType: "application/json", body: JSON.stringify(body) }),
  );
}

/* 章の島の束（`isle-sign` を持っているもの）を**遅らせる**。焼いた島のまま撮れる。
   **止めてはいけない。** 一度 abort で試したら、島も今日の板も名刺も出ない
   （＝水あわせごと落ちた）絵が撮れて、「直っていない」と読むところだった
   （`docs/island-standards.md` 13「測るために作った仕掛けが、測る対象を変える」）。
   遅らせるだけなら、あとから入れ替わるところまで本番と同じ。 */
if (process.env.SLOW === "1") {
  await ctx.route(/_next\/static\/chunks\/.*\.js$/, async (r) => {
    const res = await r.fetch().catch(() => null);
    if (!res) return r.continue();
    const body = await res.text().catch(() => "");
    if (body.includes("isle-sign")) await new Promise((x) => setTimeout(x, 20000));
    return r.fulfill({ response: res, body });
  });
}

const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));

/** 表紙で「いまどこ」を口にするところ、全部。 */
const readTop = () =>
  p.evaluate(
    ({ OLD }) => {
      const t = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : null);
      const go = [...document.querySelectorAll("a.mei-go")].find((a) =>
        (a.getAttribute("href") || "").replace(/\.html$/, "").endsWith("/now"),
      );
      return {
        名刺の札: t(go?.querySelector("b")),
        今日の島: t(document.querySelector(".today-line, .today")),
        今日の島の本文: t(document.querySelector(".today-body")),
        カモメ: t(document.querySelector(".talkbox.is-guide p")),
        配信中の札: [...document.querySelectorAll(".spot-text, .isle-sign")]
          .map(t)
          .filter((x) => x && /配信中/.test(x)),
        [`本文に${OLD}`]: [
          ...new Set(
            (document.body.innerText.match(new RegExp(`.{0,16}${OLD}.{0,12}`, "g")) || []).map((x) =>
              x.replace(/\s+/g, " ").trim(),
            ),
          ),
        ],
        本文に1542: document.body.innerText.includes("1,542"),
        横あふれ: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    },
    { OLD },
  );

const seen = {};

/* 1. 表紙。カモメは着地から3秒で口を開くので、そこまで待つ */
await p.goto(`http://localhost:${SPORT}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
await p.waitForTimeout(5200);
await p.evaluate(() => {
  window.requestAnimationFrame = () => 0;
});
const before = await readTop();
await p.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 600) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 40));
  }
  window.scrollTo(0, document.body.scrollHeight);
});
await p.waitForTimeout(700);
const after = await readTop();
const word = (x) => `${x.名刺の札}｜${x.今日の島}｜${x.今日の島の本文}｜${x.カモメ}`;
seen["/"] = {
  送る前: before,
  送ったあと: after,
  "字が同じ": word(before) === word(after),
};
await p.evaluate(() => window.scrollTo(0, 0));
await p.waitForTimeout(300);
await p.screenshot({ path: `${dir}/top.png` });
/* 今日の島の板は畳んである。**開いた絵まで撮る。** 場所を言っているのは
   閉じた1行ではなく、開いた中の本文のほう。 */
const tab = await p.$(".today-tab");
if (tab) {
  // すでに開いている日がある（初めて来た人には向こうから開く）。押して閉じない
  if ((await tab.getAttribute("aria-expanded")) !== "true") await tab.click();
  await p.waitForTimeout(700);
  const fold = await p.$(".today-fold");
  const shot = (await fold?.isVisible()) ? fold : tab;
  await shot.screenshot({ path: `${dir}/top-today.png` });
}
writeFileSync(
  `${dir}/top.txt`,
  await p.evaluate(() => document.body.innerText.replace(/\n{2,}/g, "\n").slice(0, 2200)),
);

/* 2. ほかの面。読むのは「いまどこ」を口にしているところだけ */
for (const [name, path] of [
  ["about", "/about.html"],
  ["now", "/now.html"],
  ["nordic", "/nordic.html"],
]) {
  await p.goto(`http://localhost:${SPORT}${path}`, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await p.waitForTimeout(2400);
  seen[path] = await p.evaluate(
    ({ OLD }) => {
      const t = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : null);
      return {
        いまどこ: [
          t(document.querySelector(".now-place")),
          t([...document.querySelectorAll(".tile-text")].find((x) => /いま、どこで何してる/.test(x.textContent))),
          t(document.querySelector(".tnow-at")),
        ].filter(Boolean),
        距離: t(document.querySelector(".tnow-why, .tnow-count-w")),
        [`本文に${OLD}`]: [
          ...new Set(
            (document.body.innerText.match(new RegExp(`.{0,16}${OLD}.{0,12}`, "g")) || []).map((x) =>
              x.replace(/\s+/g, " ").trim(),
            ),
          ),
        ],
        本文に1542: document.body.innerText.includes("1,542"),
        横あふれ: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    },
    { OLD },
  );
  await p.screenshot({ path: `${dir}/${name}.png` });
  /* 「いまどこ」を言っている札そのものも撮る。全画面の絵では字が小さすぎる */
  const card = await p.$(
    name === "about" ? ".tiles .tile" : name === "now" ? ".now-hero" : ".tnow",
  );
  if (card) await card.screenshot({ path: `${dir}/${name}-say.png` }).catch(() => {});
  writeFileSync(
    `${dir}/${name}.txt`,
    await p.evaluate(() => document.body.innerText.replace(/\n{2,}/g, "\n").slice(0, 2200)),
  );
}

console.log(`--- ${TAG}（place=${PLACE} / updatedAt=${PLACE_AT}）`);
console.log(JSON.stringify(seen, null, 1));
if (errs.length) console.log("JSエラー", errs);
await ctx.close();
await b.close();
console.log("out", dir);
