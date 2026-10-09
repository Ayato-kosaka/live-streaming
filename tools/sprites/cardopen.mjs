/**
 * 図鑑（`/friends`）とじぶんのこと（`/me`）から、カードを**押して落とせるか**。
 *
 *   PORT=4250 node tools/sprites/cardopen.mjs
 *   PORT=4252 OUT=/tmp/open-base.json node tools/sprites/cardopen.mjs   # 前の版を測る
 *   PORT=4250 BASE=/tmp/open-base.json node tools/sprites/cardopen.mjs  # 突き合わせる
 *
 * 0＝通った / 1＝食い違った / 2＝数えるものが無い。
 *
 * ## 何を見ているか
 *
 * あやと（2026-10-08）「このページからあやとじまカードダウンロード
 * できないとダメ」。1枚を押して `/cards` と同じ紙が開き、その人が入った
 * 状態で、落とすところまで出ているかを数える。
 *
 * そしてもう1つ——**カードの絵そのものは1ドットも動いていないこと。**
 * 押せるようにしたぶんで足してよいのは厚みと影だけなので、
 * 写真の箱（`.akd-shot`）とキャラクターの箱（`.akd-chr`）を
 * **カードの左上からの相対**で測って、前の版と突き合わせる。
 * 絶対の座標で測ると、上の欄が1pxでも動いたら全部ずれて読めない。
 *
 * ## 対照（落ちたら、本物の数字を1つも出さずに 2）
 *
 *  1. **押す前に紙が出ていない。** はじめから `.akd-modal` が在るなら、
 *     押せたことを数えていない
 *  2. **`/cards` の紙は、いままでどおり素の写真で開く。** 1人ぶんの紙だけ
 *     その人が入って開く、という作りなので、**両方を同じ回で見る。**
 *     片方だけ見ると「ぜんぶ入って開く」に変えても通る
 */
import { chromium } from "playwright-core";
import { readFileSync, writeFileSync } from "node:fs";
import { apply } from "./asme.mjs";
import { offline } from "./route.mjs";

const PORT = process.env.PORT || "4250";
const BASE = process.env.BASE || "";
const OUT = process.env.OUT || "";
const SHOTS = process.env.SHOTS || "";
const W = Number(process.env.W || 390);

/** 見つからなかったもの。**空でなければ 2 で落ちる。** */
const missing = [];
const need = (what, ok, saw) => {
  if (!ok) missing.push(`${what}（見たもの: ${saw}）`);
  return ok;
};
/** 食い違ったもの。**空でなければ 1 で落ちる。** */
const wrong = [];

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({
  viewport: { width: W, height: 900 },
  deviceScaleFactor: 2,
  isMobile: W < 700,
  hasTouch: W < 700,
  reducedMotion: "reduce",
});
await offline(ctx);
await apply(ctx, {});
const p = await ctx.newPage();
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));

const stop = async (code, msg) => {
  console.error(msg);
  await b.close();
  process.exit(code);
};

/** カードの絵の置きぐあい。**カードの左上からの相対**で測る */
const geo = () =>
  p.evaluate(() =>
    [...document.querySelectorAll(".akd")].slice(0, 8).map((card) => {
      const c = card.getBoundingClientRect();
      const r = (sel) => {
        const e = card.querySelector(sel);
        if (!e) return null;
        const x = e.getBoundingClientRect();
        return [
          Math.round((x.left - c.left) * 100) / 100,
          Math.round((x.top - c.top) * 100) / 100,
          Math.round(x.width * 100) / 100,
          Math.round(x.height * 100) / 100,
        ];
      };
      return { 絵: r(".akd-shot"), 人: r(".akd-chr"), 写真: r(".akd-photo") };
    }),
  );

/** その面のカードを数えて、絵の置きぐあいを返す */
async function look(path, open) {
  await p.goto(`http://localhost:${PORT}${path}`, { waitUntil: "networkidle" });
  await p.waitForTimeout(600);
  if (open) await open();
  await p.waitForSelector(".akd", { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(900);
  const n = await p.locator(".akd").count();
  need(`${path} にカードが並ぶ`, n >= 1, `.akd=${n}`);
  return { 枚: n, 置き: await geo() };
}

/* ---- 図鑑。人を1人えらばないとカードが出ない ---- */
const friends = await look("/friends.html", async () => {
  /* カードを持っている人を探す。**最初の1人とはかぎらない**ので、
     カードの欄（`.rzk-cards`）が出るまで住人の升目を押していく */
  const who = p.locator(".rzk-grid .rzk-cell");
  const 人 = await who.count();
  need("図鑑に住人が並ぶ", 人 >= 1, `.rzk-cell=${人}`);
  for (let i = 0; i < 人; i++) {
    await who.nth(i).click().catch(() => {});
    await p.waitForTimeout(400);
    if ((await p.locator(".akd").count()) > 0) return;
  }
});

/* ---- じぶんのこと。カードの札へ ---- */
const me = await look("/me.html", async () => {
  const tab = p.locator("button", { hasText: "カード" });
  if ((await tab.count()) > 0) await tab.first().click().catch(() => {});
  await p.waitForTimeout(500);
});

const got = { "/friends": friends, "/me": me };
console.log(JSON.stringify({ 枚: { "/friends": friends.枚, "/me": me.枚 } }));

/* ---- 押して開く（じぶんのことの1枚） ---- */
const 押す所 = p.locator(".akd-shot.is-tap");
const 押せる = await 押す所.count();
/* `BEFORE=1` は**押せるようにする前の版**を測るとき。置きぐあいだけ取って、
   押すところは飛ばす（あちらにはまだ押しどころが無い）。 */
const BEFORE = process.env.BEFORE === "1";
if (!BEFORE) {
  need("押せるカードが在る", 押せる >= 1, `.akd-shot.is-tap=${押せる}`);
  /* 対照1: 押す前に紙が出ていないこと */
  need("押す前に紙は出ていない", (await p.locator(".akd-modal").count()) === 0, "いきなり出ていた");
} else {
  need("前の版には押しどころが無い", 押せる === 0, `.akd-shot.is-tap=${押せる}`);
}

/** 開いた紙の中身 */
let sheet = null;
if (押せる >= 1 && !BEFORE) {
  /** 押したカードの人。開いた紙に入っているはずの1人 */
  const だれ = await p.evaluate(() => {
    const chr = document.querySelector(".akd .akd-chr");
    return chr ? decodeURIComponent(chr.getAttribute("src") || "") : "";
  });
  await 押す所.first().click();
  await p.waitForSelector(".akd-modal", { timeout: 8000 }).catch(() => {});
  await p
    .waitForSelector(".akd-modal .akd-stage > img, .akd-modal .nstudio-off", { timeout: 20000 })
    .catch(() => {});
  await p.waitForTimeout(900);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/me-${W}-ひらいた.png` });
  sheet = await p.evaluate(() => ({
    紙: document.querySelectorAll(".akd-modal").length,
    焼き上がり: document.querySelectorAll(".akd-modal .akd-stage > img").length,
    止めた字: document.querySelector(".akd-modal .nstudio-off")?.textContent?.trim() ?? null,
    はじめから入っている: !!document.querySelector(".akd-modal .npick.is-on img"),
    入っている人: decodeURIComponent(
      document.querySelector(".akd-modal .npick.is-on img")?.getAttribute("src") || "",
    ),
    候補: document.querySelectorAll(".akd-modal .npick").length,
    あやとの札: document.querySelectorAll(".akd-modal .akd-mate").length,
    なぞれる: document.querySelectorAll(".akd-modal .akd-stage > img.is-movable").length,
    ほぞんする: document.querySelector(".nstudio-go")?.disabled === false,
    横あふれ: document.documentElement.scrollWidth > window.innerWidth + 1,
  }));
  console.log("ひらいた紙:", JSON.stringify(sheet, null, 1));
  need("紙が1つ開く", sheet.紙 === 1, `.akd-modal=${sheet.紙}`);
  need("焼き上がりが出る", sheet.焼き上がり === 1, `${sheet.止めた字 ?? sheet.焼き上がり}`);
  need("はじめからその人が入っている", sheet.はじめから入っている, "素の写真で開いた");
  need("なぞって動かせる", sheet.なぞれる === 1, `is-movable=${sheet.なぞれる}`);
  need("あやとの札が出る", sheet.あやとの札 >= 2, `.akd-mate=${sheet.あやとの札}`);
  need("ほぞんするが押せる", sheet.ほぞんする, "押せない");
  need("横あふれなし", !sheet.横あふれ, "横に流れた");
  /* 押した絵と、開いた紙に入っている人が同じか。
     **「入っている」だけでは足りない**——別の人が入っても通ってしまう */
  if (だれ && sheet.入っている人) {
    const id = (u) => (u.match(/\/([A-Za-z0-9_-]{10,})/g) || []).slice(-1)[0] ?? u;
    need(
      "入っているのは、押したカードの人",
      id(だれ) === id(sheet.入っている人),
      `${id(だれ)} を押して ${id(sheet.入っている人)} が入った`,
    );
  }
  await p.keyboard.press("Escape");
  await p.waitForTimeout(400);
  need("Escape で閉じる", (await p.locator(".akd-modal").count()) === 0, "閉じない");
}

/* ---- 対照2: `/cards` の紙は、いままでどおり素の写真で開く ---- */
await p.goto(`http://localhost:${PORT}/cards.html`, { waitUntil: "networkidle" });
await p.waitForTimeout(900);
const マス = await p.locator(".akd-tile").count();
need("/cards にマスが在る", マス >= 1, `.akd-tile=${マス}`);
let cards = null;
if (マス >= 1) {
  await p.locator(".akd-tile").first().click();
  await p.waitForSelector(".akd-modal", { timeout: 8000 }).catch(() => {});
  await p
    .waitForSelector(".akd-modal .akd-stage > img, .akd-modal .nstudio-off", { timeout: 20000 })
    .catch(() => {});
  await p.waitForTimeout(800);
  cards = await p.evaluate(() => ({
    候補: document.querySelectorAll(".akd-modal .npick").length,
    入っている: !!document.querySelector(".akd-modal .npick.is-on img"),
    入れないが選ばれている: !!document.querySelector(".akd-modal .npick.is-on .npick-none"),
  }));
  console.log("/cards の紙:", JSON.stringify(cards));
  need(
    "対照2: /cards はいままでどおり素の写真で開く",
    !cards.入っている && cards.入れないが選ばれている,
    JSON.stringify(cards),
  );
}

await b.close();

if (missing.length) {
  console.error(`\n見つからなかった: ${missing.join(" / ")}`);
  process.exit(2);
}

const out = { ...got, 紙: sheet, cards };
console.log(`\n${JSON.stringify(got, null, 1)}`);
console.log(`\n数えたもの: 面 2 / カード ${friends.枚 + me.枚}枚 / 押せたカード ${押せる}`);
if (OUT) {
  writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(`書いた: ${OUT}`);
}
if (!BASE) {
  console.log("前の版と突き合わせるには BASE= に、前の版で OUT= した JSON を渡してください。");
  process.exit(0);
}

/* ---- 絵が1ドットも動いていないか ---- */
const was = JSON.parse(readFileSync(BASE, "utf8"));
let 見た = 0;
for (const 面 of ["/friends", "/me"]) {
  const a = was[面]?.置き ?? [];
  const c = got[面].置き;
  if (a.length === 0) {
    missing.push(`${面}: 前の版に置きぐあいが無い`);
    continue;
  }
  if (a.length !== c.length) wrong.push(`${面}: カードの数が ${a.length} → ${c.length}`);
  for (let i = 0; i < Math.min(a.length, c.length); i++) {
    for (const k of ["絵", "人", "写真"]) {
      見た += 1;
      if (JSON.stringify(a[i][k]) !== JSON.stringify(c[i][k])) {
        wrong.push(`${面} ${i + 1}枚目の${k}: ${JSON.stringify(a[i][k])} → ${JSON.stringify(c[i][k])}`);
      }
    }
  }
}
if (missing.length) {
  console.error(`\n見つからなかった: ${missing.join(" / ")}`);
  process.exit(2);
}
console.log(`\n絵の置きぐあい: ${見た}か所を突き合わせた`);
if (wrong.length) {
  console.error(`\n動いた: ${wrong.join(" / ")}`);
  process.exit(1);
}
console.log("カードの絵は、前の版と1ドットも変わっていません。");
