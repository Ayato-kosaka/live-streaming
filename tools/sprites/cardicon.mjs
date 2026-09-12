/**
 * あやと島カードに、**キャラクターが乗るところまで**を撮る。
 *
 *   PORT=4160 node cardicon.mjs
 *
 * 配るのは書き出したもの（`site/.next-<port>`）。開くのは `/cards.html`。
 *
 * **差し込みは本番の値そのもの**（#1 の轍を踏まないため）。
 *   - `/island-api/cards`          … 本番の返事（`/tmp/cards-after.json`）。
 *     `icon` だけを、直した口が入れるはずの値で埋めてある
 *   - `/island-api/nordic/photos`  … 本番の返事をそのまま
 *   - 写真とキャラクターの絵         … **curl で本番から取る。**
 *     この箱のブラウザは置き場に出られないが curl では取れる。
 *     `access-control-allow-origin` を付けて返す（canvas で焼くので、
 *     付けないと絵が汚れて「読めません」になる）
 *
 * 見るもの: 候補が何人出るか・絵が落ちていないか・**押したあと写真の上に
 * 乗るか**。乗った1枚（canvas から焼いたもの）が、そのまま持って帰る絵。
 */
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";

const PORT = process.env.PORT || "4160";
const OUT = process.env.OUT || "/tmp/cardicon";
mkdirSync(OUT, { recursive: true });

const CARDS = readFileSync("/tmp/cards-after.json", "utf8");
const PHOTOS = readFileSync("/tmp/photos.json", "utf8");

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

const json = (r, body) =>
  r.fulfill({ status: 200, contentType: "application/json", body });

/** 本番。キャラクターの絵は口ごしに来るので、ここへ付け替えて取りに行く */
const PROD = "https://live-streaming-d3cac.web.app";

/** 外の絵は curl で取る。**canvas で焼くので CORS を付けて返す。** */
const viaCurl = (r, type) => {
  /* **手元の口（`http://localhost:4160/island-api/...`）を、そのまま curl に
     渡さない。** 配っているのは書き出した HTML だけなので 404 が返り、絵が
     全部「落ちた」と出る。本番の口へ付け替えてから取りに行く。
     **付け替えるのは手元の口だけ。** 写真は置き場の絶対 URL なので、
     一緒に付け替えると今度は写真が落ちる（1回やった）。 */
  const was = r.request().url();
  const url = was.startsWith("http://localhost") ?
    was.replace(/^https?:\/\/[^/]+/, PROD) :
    was;
  try {
    const body = execFileSync(
      "curl", ["-sS", "--retry", "2", "--max-time", "40", url],
      { maxBuffer: 1 << 28 },
    );
    r.fulfill({
      status: 200, contentType: type, body,
      headers: { "access-control-allow-origin": "*" },
    });
  } catch {
    r.abort();
  }
};

/* **広いほうを先に登録する。** Playwright はあとから登録した route を
   先に当てるので、逆に書くと受け皿が全部さらっていく（1回やった）。 */
await ctx.route(/\/island-api\//, (r) => json(r, "{}"));
await ctx.route(/\/island-api\/cards$/, (r) => json(r, CARDS));
await ctx.route(/\/island-api\/nordic\/photos$/, (r) => json(r, PHOTOS));
await ctx.route(/\/island-api\/characters\/[^/]+\/(plain|scene)-\d+\./, (r) =>
  viaCurl(r, "image/webp"));
await ctx.route(/firebasestorage\.googleapis\.com/, (r) => viaCurl(r, "image/jpeg"));

const p = await ctx.newPage();
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
await p.goto(`http://localhost:${PORT}/cards.html`, { waitUntil: "networkidle" });
await p.waitForTimeout(1500);
await p.screenshot({ path: `${OUT}/1-一覧.png`, fullPage: true });

const day = process.env.DAY || "9月11日";
await p.locator(".akd-day", { hasText: day }).locator(".akd-tile").first().click();
await p.waitForTimeout(2500);
await p.screenshot({ path: `${OUT}/2-ひらいた.png`, fullPage: true });

const picks = await p.evaluate(() => ({
  候補: [...document.querySelectorAll(".npick")].length - 1,
  絵: [...document.querySelectorAll(".npick img")].map((e) =>
    (e.naturalWidth > 0 ? "出" : "落")),
}));
console.log(day, JSON.stringify(picks));

/** 何人目を入れるか。既定は**いちばん最後**（手の表に無かった人） */
const n = Number(process.env.PICK || picks.候補);
await p.locator(".npick").nth(n).click();
await p.waitForTimeout(3500);
const on = await p.evaluate(() => {
  const im = document.querySelector(".nstudio-shot img");
  return {
    焼けた: !!im && im.naturalWidth > 0,
    大きさ: im ? `${im.naturalWidth}x${im.naturalHeight}` : "",
    文: document.querySelector(".nstudio-off")?.textContent?.trim() || "",
    横あふれ: document.documentElement.scrollWidth > window.innerWidth + 1,
  };
});
console.log(`${n}人目を入れた:`, JSON.stringify(on));
await p.screenshot({ path: `${OUT}/3-入れた.png`, fullPage: true });
await p.locator(".nstudio-shot").screenshot({ path: `${OUT}/4-カード.png` });

await ctx.close();
await b.close();
console.log("撮ったもの:", OUT);
process.exit(on.焼けた && !on.横あふれ ? 0 : 1);
