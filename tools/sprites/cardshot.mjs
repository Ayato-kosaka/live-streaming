/**
 * あやと島カードの一覧（`/cards`）を、写真が増えた状態で撮る。
 *
 *   PORT=4133 node cardshot.mjs
 *
 * 配るのは書き出したもの（`site/.next-<port>`）なので、開くのは `/cards.html`。
 *
 * 一覧が散らかるのは**カードが増えたとき**なので、`asme.mjs` の差し込み
 * （写真3枚 × 12人 = 36枚）で撮る。素の本番データ（1枚 × 4人）では、
 * まとめた効きも、押して開いた先も見えない。
 *
 * 出すもの: マスの数・カードの枚数・横あふれ・押しどころの高さ。
 *
 * ## 数えているものは変えていない。札の名前だけ #240 に合わせた
 *
 * 旅の写真とカードを1枚の面に寄せたとき（#240）、開いた先が
 * 「カードを1枚ずつめくる」から「素の写真に、入れる人を選ぶ」に変わった。
 * 数えるものは同じなので、名前だけ差し替えてある。
 *
 * | 数えているもの | 前の札 | いまの札 |
 * | --- | --- | --- |
 * | 出ている1枚 | `.akd-modal .akd` | `.akd-modal .nstudio-shot img`（焼き上がり） |
 * | 立てる人の顔 | `.akdp` | `.npick img`（`.npick` には「入れない」も居る） |
 * | 人数 | 一覧のマスの `.akd-tile-n` | 開いた先の候補（マスは素の写真になった） |
 *
 * **「人数の札」はマスから消えた**（あやと「代表でキャラクターを埋めるのは
 * やめて欲しい」→ 一覧のマスは素の写真だけ）。人数そのものは無くなって
 * いないので、開いた先の候補で数える。
 *
 * ## 押すマスは、いちばん人の多い写真にする
 *
 * 差し込みには自分ひとりしか立てない写真（`MY_CARDS` の9枚）も入っていて、
 * 先頭のマスはそれに当たる。そこを開くと顔が1つしか出ず、**入れ替えが
 * 試せない。** 口（`/cards`）を先に読んで、いちばん人の多い写真のマスを押す。
 *
 * ## 0件で黙って終わらない
 *
 * 数えるものが1つも見つからなかったら、**0という数字を報告して終わらない。**
 * 何が見つからなかったかを並べて、**終了コード2**で落ちる
 * （0=通った / 1=途中で落ちた / 2=数えるものが無い。`island-standards.md` 10）。
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { apply } from "./asme.mjs";
import { offline } from "./route.mjs";

const PORT = process.env.PORT || "4133";
const OUT = process.env.OUT || "/tmp/claude-0/-home-user-live-streaming/bf90a11a-e96d-5951-9af6-869c5c9df13c/scratchpad/cards";
mkdirSync(OUT, { recursive: true });

/** 見つからなかったもの。**空でなければ 2 で落ちる。** */
const missing = [];
/**
 * 数えたものが1件以上あるか見る。**0でも進む**（先に全部数えてから落とす）。
 * @param {string} what 何を数えたか。落ちたときにそのまま出る
 * @param {number} n 数えた数
 * @param {number} least これ以上あれば通る
 */
const need = (what, n, least = 1) => {
  if (!(Number(n) >= least)) missing.push(`${what}=${n}（${least}以上を待っていた）`);
  return n;
};

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  reducedMotion: "reduce",
});
// 住人の絵は先に落としてある（`avatars.py`）。1人ずつ返させる
await offline(ctx);
await apply(ctx, { admin: process.env.ADMIN === "1" });
const p = await ctx.newPage();
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));

/** 落ちるときも箱を閉じてから。開けっぱなしにするとブラウザが残る */
const stop = async (code, msg) => {
  console.error(msg);
  await b.close();
  process.exit(code);
};

await p.goto(`http://localhost:${PORT}/cards.html`, { waitUntil: "networkidle" });
await p.waitForTimeout(1200);
await p.screenshot({ path: `${OUT}/cards-一覧.png`, fullPage: true });

/* はじめに出ているところ。**畳みは3日ぶんまで**（`Longer` の `first`）なので、
   ここで数えるのは「開いた直後に見えている量」。 */
const count = await p.evaluate(() => ({
  マス: document.querySelectorAll(".akd-tile").length,
  日: document.querySelectorAll(".akd-day").length,
  面の高さ: document.documentElement.scrollHeight,
  横あふれ: document.documentElement.scrollWidth > window.innerWidth + 1,
  マスの高さ: [...document.querySelectorAll(".akd-tile")].map((x) =>
    Math.round(x.getBoundingClientRect().height),
  ),
}));
console.log("一覧（はじめ）:", JSON.stringify(count, null, 1));
need("一覧のマス", count.マス);
need("一覧の日", count.日);

if (count.マス === 0) {
  /* ここで押しに行くと、出ない札を30秒待って落ちる。**先に言って終わる。** */
  await stop(
    2,
    "見つからなかった: 一覧のマス（.akd-tile）が0。" +
      "\n差し込み（asme.mjs）か、CardWall.tsx の札の名前を見てください。",
  );
}

/* 溜まったところまで出す。**押すマスを探すのにも要る**（人の多い写真は
   だいたい下のほうの日にいる）。「たたむ」に変わったら終わり。 */
for (let i = 0; i < 12; i++) {
  const more = p.locator(".longer", { hasText: "だす" });
  if ((await more.count()) === 0) break;
  await more.first().click();
  await p.waitForTimeout(250);
}
const all = await p.evaluate(() => ({
  マス: document.querySelectorAll(".akd-tile").length,
  日: document.querySelectorAll(".akd-day").length,
  面の高さ: document.documentElement.scrollHeight,
  横あふれ: document.documentElement.scrollWidth > window.innerWidth + 1,
}));
console.log("一覧（ぜんぶ出した）:", JSON.stringify(all));
need("ぜんぶ出したときのマス", all.マス, count.マス);
await p.screenshot({ path: `${OUT}/cards-一覧-ぜんぶ.png`, fullPage: true });

/* いちばん人の多い写真のマスを押す。
   **口が答えで、画面はその答えを写しているかを見るほう。** 先に口から
   「この写真には何人立てるはず」を出しておいて、開いた先の顔と突き合わせる
   （`island-standards.md` 13。数える前に、何を数えているのかを裏で取る）。 */
const pickTile = await p.evaluate(async () => {
  const cards = await fetch("/island-api/cards").then((r) => r.json());
  /** 写真ごとの、立てる人（絵の付いた人）。**同じ絵の人は1人**（`CardSheet`） */
  const per = new Map();
  for (const c of cards.cards ?? []) {
    if (!c.icon) continue;
    const set = per.get(c.photoId) ?? new Set();
    set.add(c.icon);
    per.set(c.photoId, set);
  }
  const tiles = [...document.querySelectorAll(".akd-tile")];
  let best = { at: -1, photoId: "", 人: 0 };
  tiles.forEach((t, at) => {
    const src = decodeURIComponent(t.querySelector("img")?.src ?? "");
    for (const [photoId, who] of per) {
      if (src.includes(photoId) && who.size > best.人) best = { at, photoId, 人: who.size };
    }
  });
  return { ...best, 口のカード: (cards.cards ?? []).length, 写真の数: per.size };
});
console.log("押すマス:", JSON.stringify(pickTile));
need("口から返ったカード", pickTile.口のカード);
need("立てる人のいる写真", pickTile.写真の数);

if (pickTile.at < 0) {
  await stop(
    2,
    "見つからなかった: 口（GET /cards）のカードと、一覧のマスがつながらない。" +
      "\n差し込みの photoId が /nordic/photos の写真と別ものになっていないか見てください。",
  );
}

/* 押して開く。埋め込み版はここにしかない */
await p.locator(".akd-tile").nth(pickTile.at).click();
await p.waitForSelector(".akd-modal", { timeout: 5000 });
/* 焼き上がりを待つ。**待たずに数えると、焼けているのに0と出る。**
   焼けなかったときは `.nstudio-off` が出るので、そちらでも待ちを解く */
await p
  .waitForSelector(".akd-modal .nstudio-shot img, .akd-modal .nstudio-off", { timeout: 15000 })
  .catch(() => {});
await p.waitForTimeout(600);
await p.screenshot({ path: `${OUT}/cards-開いた.png` });
const open = await p.evaluate(() => {
  const h = (sel) => Math.round(document.querySelector(sel)?.getBoundingClientRect().height ?? 0);
  return {
    出ているカード: document.querySelectorAll(".akd-modal .nstudio-shot img").length,
    焼けなかった: document.querySelector(".akd-modal .nstudio-off")?.textContent?.trim() ?? null,
    候補の札: document.querySelectorAll(".npick").length,
    顔: document.querySelectorAll(".npick img").length,
    顔の高さ: h(".npick"),
    閉じるの高さ: h(".akd-close"),
    ほぞんするの高さ: h(".nstudio-go"),
    横あふれ: document.documentElement.scrollWidth > window.innerWidth + 1,
  };
});
console.log("開いた:", JSON.stringify(open, null, 1));
need("出ているカード", open.出ているカード);
need("顔", open.顔);
need("顔の高さ", open.顔の高さ);
need("閉じるの高さ", open.閉じるの高さ);
need("ほぞんするの高さ", open.ほぞんするの高さ);
/* 口の答えと突き合わせる。**画面のほうが少なければ、落ちているものがある** */
if (open.顔 !== pickTile.人) {
  missing.push(`顔=${open.顔} だが、口は ${pickTile.人} 人ぶん返している`);
}

/* 別の人に入れ替える。**「入れない」は顔を持たない**ので、そこは飛ばす。
   焼き直されたかは、出ている絵が別のものに差し替わったかで見る
   （`URL.createObjectURL` なので、焼き直すと毎回ちがう値になる） */
const faces = p.locator(".npick:has(img)");
const 顔の数 = await faces.count();
if (顔の数 >= 2) {
  const before = await p.getAttribute(".akd-modal .nstudio-shot img", "src");
  await faces.nth(Math.min(3, 顔の数 - 1)).click();
  await p
    .waitForFunction(
      (was) => document.querySelector(".akd-modal .nstudio-shot img")?.src !== was,
      before,
      { timeout: 15000 },
    )
    .catch(() => {});
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/cards-別の人.png` });
  const after = await p.getAttribute(".akd-modal .nstudio-shot img", "src");
  console.log("入れ替え:", JSON.stringify({ 押した顔: Math.min(4, 顔の数), 焼き直した: after !== before }));
  if (after === before) missing.push("入れ替えても焼き直されない（出ている絵が同じまま）");
} else {
  missing.push(`入れ替えを試せる顔が無い（顔=${顔の数}）`);
}

await p.keyboard.press("Escape");
await p.waitForTimeout(400);
const 残り = await p.locator(".akd-modal").count();
console.log("閉じた:", 残り);
if (残り !== 0) missing.push(`Escape で閉じない（.akd-modal が ${残り}）`);

await b.close();

if (missing.length) {
  console.error(`\n見つからなかった: ${missing.join(" / ")}`);
  console.error(
    "画面の札の名前が変わっているか、差し込みが古いかのどちらかです。" +
      "\nsite/components/cards/CardWall.tsx と CardSheet.tsx を見てください。",
  );
  process.exit(2);
}
console.log("\nぜんぶ数えられました。");
