/**
 * **机（`/me/desk`）の札に出る「まだ返していない数」を、押して確かめる。**
 *
 *   tools/build.sh 3160
 *   python3 -m http.server 4160 --directory site/.next-3160 &
 *   SPORT=4160 UNANS=32 node tools/sprites/deskbadge.mjs
 *
 * 終了コード 0=通った / 1=食い違いがある / 2=数えるものが無い。
 *
 * ## 見ているもの
 *
 *  0. **数えるものが在る**（口が 1枚以上を返していて、札に数字が出ている）
 *  1. **札の数字＝口の数**（`UNANS=` に本番の数を入れて回す）
 *  2. **「見た」を押すと、札も一覧も1つ減る**
 *  3. **「見たもの」の山から戻すと、元に戻る**（押し間違えの道）
 *  4. **0枚になったら、札から数字が消える**（用事が無いのに印を残さない）
 *  5. **押しどころが札に残っている**（数の丸が指を受け取っていない）
 *  6. 390px と 1280px で**横にあふれない**
 *
 * 絵は `/tmp/claude-0/me/` に置く。**自分の目で見るのはそちら**——
 * この道具が言えるのは数と当たり判定までで、読めるかどうかは言えない。
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { apply } from "./asme.mjs";
import { offline } from "./route.mjs";

const PORT = process.env.SPORT || 4160;
const OUT = "/tmp/claude-0/me";
mkdirSync(OUT, { recursive: true });

let bad = 0;
let ok = 0;
const check = (name, good, why = "") => {
  if (good) {
    ok += 1;
    console.log(`  ok   ${name}`);
  } else {
    bad += 1;
    console.log(`  NG   ${name}${why ? ` — ${why}` : ""}`);
  }
};
const nothing = (why) => {
  console.error(`確かめられません: ${why}`);
  process.exit(2);
};

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

/** 札の数字（出ていなければ null） */
const badge = (p) =>
  p.$eval(".mp-tab-b", (e) => e.textContent.trim()).catch(() => null);
/** 並んでいる付箋の枚数 */
const rows = (p) => p.$$eval(".mp-care > li", (l) => l.length);
/** 1行目が名乗る枚数 */
const says = (p) =>
  p.$eval(".mp-now", (e) => e.textContent.trim()).catch(() => null);

/**
 * 1つの幅で開いて、机の付箋の道具まで出す。
 * @param {number} w 幅
 * @return {Promise<object>} ページ
 */
async function open(w) {
  const ctx = await b.newContext({
    viewport: { width: w, height: w < 500 ? 844 : 900 },
    deviceScaleFactor: 2,
  });
  await apply(ctx, { admin: true });
  await offline(ctx).catch(() => {});
  const p = await ctx.newPage();
  p.on("pageerror", (e) => check(`JSエラー（${w}px）`, false, String(e)));
  await p.goto(`http://localhost:${PORT}/me/desk.html`, {
    waitUntil: "networkidle",
  });
  await p.waitForTimeout(900);
  return p;
}

/* ---- 390px。押して確かめるのはこちら ---- */

console.log(`## 390px（口が返す枚数: UNANS=${process.env.UNANS || "既定"}）`);

const p = await open(390);

const want = await p.evaluate(async () => {
  const r = await fetch("/island-api/stickies/unanswered?n=1");
  return (await r.json()).n;
});
if (!want) nothing(`口が ${want} 枚しか返していない（数えるものが無い）`);

const first = await badge(p);
if (first === null) nothing("札に数字が1つも出ていない（撮る相手が居ない）");
check(`札の数字が、口の数と同じ（${want}）`, first === String(want), `札=${first}`);

await p.screenshot({ path: `${OUT}/deskbadge-390.png`, fullPage: false });

/* 付箋の道具を開く */
const tabs = await p.$$(".mp-tabs.is-3 .mp-tab");
let sticky = null;
for (const t of tabs) {
  if ((await t.innerText()).includes("付箋")) sticky = t;
}
if (!sticky) nothing("付箋の札が見つからない");
await sticky.click();
await p.waitForTimeout(1200);

check("道具の1行目も同じ数", (await says(p))?.includes(String(want)), await says(p));
const shown = await rows(p);
if (shown === 0) nothing("付箋が1枚も並んでいない");
console.log(`  並んでいるのは ${shown}枚（はじめは4枚ずつ出す）`);

await p.screenshot({ path: `${OUT}/deskbadge-390-sticky.png`, fullPage: true });
await p.evaluate(() => window.scrollTo(0, 0));

/* ---- 「見た」を押す ---- */

console.log("\n## 「見た」を押す");

const seeBtn = await p.$(".mp-care > li button:has-text('見た')");
if (!seeBtn) nothing("「見た」の押しどころが出ていない");
/* **押しどころの大きさ**（`island-design.md` 3-2。48px を割らせない） */
const box = await seeBtn.boundingBox();
check("「見た」が 48px 以上", box.height >= 48, `${Math.round(box.height)}px`);
/* 山の札4つも、指で押すもの。**`hitbox.mjs` では測れない**（道具を
   開かないと出てこない）ので、ここで高さだけ見る。 */
{
  const tall = await p.$$eval(".mp-care-tab", (l) =>
    l.map((e) => Math.round(e.getBoundingClientRect().height)),
  );
  check(
    `山の札4つが 48px 以上（${tall.join(" / ")}）`,
    tall.length === 4 && tall.every((h) => h >= 48),
    tall.join(" / "),
  );
}
await seeBtn.click();
await p.waitForTimeout(1200);

check(`札が1つ減る（${want - 1}）`, (await badge(p)) === String(want - 1), await badge(p));
/* **並んでいる枚数では見ない。** はじめの4枚は、1枚下りると次の1枚が
   繰り上がって**また4枚**になる（`Longer`）。見るのは1行目が名乗る数。 */
check(
  `道具の1行目も1つ減る（${want - 1}）`,
  (await says(p))?.includes(String(want - 1)),
  await says(p),
);

/* ---- 戻す ---- */

console.log("\n## 押し間違えを戻す");

const seenTab = await p.$(".mp-care-tabs button:has-text('見たもの')");
if (!seenTab) nothing("「見たもの」の札が無い");
await seenTab.click();
await p.waitForTimeout(1200);
check("「見たもの」の山に1枚ある", (await rows(p)) === 1, String(await rows(p)));
await p.screenshot({ path: `${OUT}/deskbadge-390-seen.png`, fullPage: true });

const back = await p.$(".mp-care > li button:has-text('もどす')");
if (!back) nothing("「もどす」の押しどころが無い");
await back.click();
await p.waitForTimeout(1200);
check(`札が元に戻る（${want}）`, (await badge(p)) === String(want), await badge(p));
check("「見たもの」の山が空になる", (await rows(p)) === 0, String(await rows(p)));

/* ---- 0枚になったら、札から数字が消える ---- */

console.log("\n## ぜんぶ片づいたら、札から数字が消える");

{
  const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 } });
  await apply(ctx2, { admin: true });
  await offline(ctx2).catch(() => {});
  /* 口が0枚を返す形にする（返事を全部に付けたのと同じ） */
  await ctx2.route(/\/island-api\/stickies\/unanswered/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ n: 0, notes: [] }),
    }),
  );
  const q = await ctx2.newPage();
  await q.goto(`http://localhost:${PORT}/me/desk.html`, { waitUntil: "networkidle" });
  await q.waitForTimeout(1200);
  check("0枚のとき、札に数字が無い", (await badge(q)) === null, await badge(q));
  await ctx2.close();
}

/* ---- 当たり判定と、横あふれ ---- */

console.log("\n## 押しどころと、横あふれ");

{
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(200);
  const hit = await p.evaluate(() => {
    const tab = [...document.querySelectorAll(".mp-tab")].find((t) =>
      t.textContent.includes("付箋"),
    );
    const b = tab.querySelector(".mp-tab-b");
    if (!b) return { why: "札に数字が無い" };
    const r = b.getBoundingClientRect();
    const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return {
      mine: !!at && tab.contains(at) && at !== b,
      tag: at ? `${at.tagName} ${String(at.className?.baseVal ?? at.className ?? "")}` : "なし",
      at: [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)],
    };
  });
  check(
    "数の丸を押しても、札が受け取る（指に穴をあけていない）",
    hit.mine === true,
    hit.why ?? `${hit.tag} @${hit.at}`,
  );
}

for (const [w, page] of [[390, p], [1280, await open(1280)]]) {
  if (w === 1280) {
    const t = await page.$(".mp-tabs.is-3 .mp-tab:has-text('付箋')");
    if (t) await t.click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/deskbadge-1280.png`, fullPage: true });
  }
  const o = await page.evaluate(() => ({
    w: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  check(`${w}px で横にあふれない`, o.w <= o.cw, `${o.w} / ${o.cw}`);
}

console.log(`\n通った ${ok} / 落ちた ${bad}`);
console.log(`絵: ${OUT}/deskbadge-*.png`);
await b.close();
if (bad > 0) process.exit(1);
if (ok < 10) nothing(`数えた件数が少なすぎる（${ok}件）`);
