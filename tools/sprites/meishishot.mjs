/**
 * 表紙の名刺と `/now` の1画面目が、**同じ日に同じことを言っているか**を数える。
 *
 * 表紙の名刺は `current.place`（あやとが手で打つ1本の文字列）をそのまま出して
 * いて、本番の値は「ジョージア・トビリシ」・書かれたのは出発の1週間前
 * （2026-09-04）。**旅の17日間ずっと「いま ジョージア・トビリシ」**と出ていた。
 * 押した先の `/now` は同じ日に「北欧周遊のとちゅう」と言うので、
 * **1タップで言うことが変わる。**
 *
 * だから撮るだけでは足りない。2つの面から**同じ字**を読んで、突き合わせる。
 *
 *   cd tools/sprites
 *   SPORT=4780 DATE=2026-09-13T12:00:00+09:00 node meishishot.mjs
 *
 *   DATE     時計をここに合わせる（ISO）
 *   PLACE    島の「いまどこ」。**既定は本番の値**
 *   PLACE_AT `current.updatedAt`。**既定は本番の値**（2026-09-04）
 *   TAG      撮ったものの名前（出す先の名前になる）
 *   SPORT    書き出したものを配っているポート
 *
 * 差し込みの既定を「直っている前提の値」にすると、直っていないものが直って
 * 見える（`docs/island-misses.md` #1）。だから既定は本番のまま。
 *
 * ## 送る前と送ったあとの両方で読む
 *
 * `content-visibility: auto` の畳みは、画面の外にいるあいだ中身を持たない。
 * `innerText` で数えると、**下まで送ってから測ると出て、送らずに測ると出ない**
 * という食い違いが起きる（`docs/island-standards.md` 13）。
 * ここは名刺の字を「送らずに」「送ってから」の2回読んで、
 * **どちらでも同じ答えになること**まで見る。
 */
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { offline } from "./route.mjs";

const SPORT = process.env.SPORT || "4780";
const OUT = process.env.OUT || "/tmp/meishi";
const DATE = process.env.DATE || "2026-09-13T12:00:00+09:00";
const PLACE = process.env.PLACE ?? "ジョージア・トビリシ";
const PLACE_AT = process.env.PLACE_AT ?? "2026-09-04";
const TAG = process.env.TAG || DATE.slice(0, 10);

/** 時計を差し替える。`new Date()` も `Date.now()` も、そこから進む。 */
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
const dir = `${OUT}/${TAG}`;
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
      current: { place: PLACE, updatedAt: PLACE_AT, theme: "georgia", word: "きょうも22時から配信してます。", week: ["北欧までヒッチハイクで向かう"] },
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

const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));

/** 名刺の「いま ◯◯」と、そこに嘘が残っていないか。 */
const readTop = () =>
  p.evaluate(() => {
    const t = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : null);
    const go = [...document.querySelectorAll("a.mei-go")].find((a) =>
      (a.getAttribute("href") || "").replace(/\.html$/, "").endsWith("/now"),
    );
    return {
      名刺の札: t(go?.querySelector("b")),
      名刺の下の行: t(go?.querySelector("i")),
      "日本を出て": t(document.querySelector(".mei-since")),
      /* **`innerText` は畳んだところを持たない。** `.hchap-mat` は
         `content-visibility: auto` なので、名刺は送るまで本文に出てこない。
         ここは字そのもの（`textContent`）と本文（`innerText`）の両方を読んで、
         送る前と送ったあとで同じ答えになるかまで見る */
      "本文にいまジョージア": document.body.innerText
        .replace(/\s+/g, " ")
        .includes("いま ジョージア・トビリシ"),
      "本文にジョージア": document.body.innerText.includes("ジョージア"),
      横あふれ:
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  });

const shots = {};
for (const [name, path] of [["top", "/"], ["now", "/now.html"]]) {
  await p.goto(`http://localhost:${SPORT}${path}`, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await p.waitForTimeout(2200);
  // 島は rAF で動く。止めてから撮る（`CLAUDE.md`）
  await p.evaluate(() => {
    window.requestAnimationFrame = () => 0;
  });

  if (name === "top") {
    // 畳みの中身は、送る前と送ったあとで変わりうる。**両方で読む**
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
    /* **`innerText` は送った位置で変わる。** いちばん下まで送ると名刺の章は
       画面の上に外れて、`content-visibility: auto` がまた中身を捨てる。
       実測（2026-09-10・直す前）: 送る前は本文に「いま ジョージア・トビリシ」が
       出ていて、送ったあとは出ない。**本文の有無だけで合否を出すと、
       送りかたひとつでどちらにも読める。**
       だから合否は字そのもの（`textContent`）で決めて、本文の出入りは
       別に出す（`docs/island-standards.md` 13）。 */
    const word = (x) => `${x.名刺の札}｜${x.名刺の下の行}`;
    shots.top = {
      送る前: before,
      送ったあと: after,
      "名刺の字が同じ": word(before) === word(after),
      "本文の出入り":
        before["本文にいまジョージア"] === after["本文にいまジョージア"]
          ? "同じ"
          : "送りかたで変わる（畳みのせい。字は上を見る）",
    };
    // 名刺そのものを撮る
    const mei = await p.$(".mei");
    await mei?.scrollIntoViewIfNeeded();
    await p.waitForTimeout(400);
    await mei?.screenshot({ path: `${dir}/top-meishi.png` });
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.waitForTimeout(300);
    await p.screenshot({ path: `${dir}/top.png` });
    writeFileSync(
      `${dir}/top.txt`,
      await p.evaluate(() => document.body.innerText.replace(/\n{2,}/g, "\n").slice(0, 2000)),
    );
  } else {
    shots.now = await p.evaluate(() => {
      const t = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : null);
      return {
        "1画面目": t(document.querySelector(".now-place")),
        ひとこと: t(document.querySelector(".np-word")),
        札: [...document.querySelectorAll(".chip")].map(t),
        "本文にジョージア": document.body.innerText.includes("ジョージア"),
      };
    });
    const hero = await p.$(".now-hero");
    await hero?.screenshot({ path: `${dir}/now-hero.png` });
    await p.screenshot({ path: `${dir}/now.png` });
    writeFileSync(
      `${dir}/now.txt`,
      await p.evaluate(() => document.body.innerText.replace(/\n{2,}/g, "\n").slice(0, 2000)),
    );
  }
}

/* 表紙と `/now` を**並べて1枚**にする。別々に撮ると、食い違っていても
   2枚を見比べるまで気づかない。 */
const pair = await ctx.newPage();
await pair.setViewportSize({ width: 900, height: 700 });
/* **`file://` では貼れない。** `setContent` の中身は about:blank なので、
   file の絵は黙って壊れた絵の印になる（1度そのまま撮って、両方とも
   空っぽの枠が並んだ絵を出しかけた）。base64 で本文に埋める。 */
const png = (f) => `data:image/png;base64,${readFileSync(`${dir}/${f}`).toString("base64")}`;
await pair.setContent(
  `<body style="margin:0;background:#f3ece0;font:13px/1.6 sans-serif">
     <div style="display:flex;gap:14px;padding:14px;align-items:flex-start">
       <div><b>表紙の名刺（${TAG}）</b><br><img src="${png("top-meishi.png")}" style="width:430px;border:2px solid #7a6a58"></div>
       <div><b>/now の1画面目（${TAG}）</b><br><img src="${png("now-hero.png")}" style="width:430px;border:2px solid #7a6a58"></div>
     </div>
   </body>`,
);
await pair.waitForTimeout(600);
await pair.screenshot({ path: `${dir}/pair.png`, fullPage: true });

const same =
  shots.top?.送ったあと?.名刺の札?.replace(/^いま\s*/, "") === shots.now?.["1画面目"];
console.log(`--- ${TAG}（place=${PLACE} / updatedAt=${PLACE_AT}）`);
console.log(JSON.stringify({ ...shots, 表紙と今が同じ: same }, null, 1));
if (errs.length) console.log("JSエラー", errs);
await ctx.close();
await b.close();
console.log("out", dir);
