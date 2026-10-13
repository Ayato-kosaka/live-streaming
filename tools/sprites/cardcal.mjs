/**
 * あやと島カードを**カレンダーで選ぶ**ところを測って撮る。
 *
 *   PORT=4260 node tools/sprites/cardcal.mjs
 *   PORT=4260 SHOTS=/tmp/cal node tools/sprites/cardcal.mjs
 *
 * 0＝通った / 1＝合格に届かなかった / 2＝数えるものが無い。
 *
 * ## 何を見るか
 *
 *  1. **マスが重ならない。** 7列の月は、狭い画面でいちばん壊れる。
 *     `aspect-ratio` は背（`min-height: 48px`）から横を決めてしまうので、
 *     列が 48px 取れない幅では **38.6px の列に 48px のマスが載って隣に
 *     重なる**（320px で実際にそうなった）。箱どうしの重なりを数える
 *  2. **押しどころの大きさ。** 390px から上は 48px。それより狭い画面は
 *     7列 × 48px（＋すきま）が物理的に入らないので、**背だけ**を見る
 *  3. **カードの無い日が、押せる形に見えていない。** 厚み（`box-shadow`）も
 *     枠も持たないこと（`docs/island-design.md` 3章の3）
 *  4. **押した日の紙が出る。** 押すと、その日の写真が下に並ぶ
 *  5. **月の送りは、カードのある月だけ。** 送った先に必ず写真がある
 */
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { apply } from "./asme.mjs";
import { offline } from "./route.mjs";

const PORT = process.env.PORT || "4260";
const WIDTHS = (process.env.WIDTHS || "320,390,430,768,1280").split(",").map(Number);
const SHOTS = process.env.SHOTS || "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const missing = [];
const bad = [];

/* ---- 本番の写真を落として、マスに敷く ----
   **差し込み（`asme.mjs`）の写真は、写真IDを白字で描いた1色の板。**
   寸法と枚数は測れるが、**撮った絵を人が見て判断できない**
   （2026-10-13 に「マスに知らない文字列が出ている」と報告が上がった。
   出ていたのは差し込みが自分で描いた写真IDで、本番では本物の写真）。
   カレンダーは**小さなマスに写真が写るか**が見どころなので、ここだけは
   `cardwall.mjs` と同じく本番の写真を curl で落として敷く。
   **本番には1バイトも書かない**（読むのは公開の `GET /cards` だけ）。
   落とせなければ差し込みのままで続ける——測るぶんには困らない。 */
const CACHE = process.env.CACHE || "/tmp/cardwall-photos";
const PROD = "https://live-streaming-d3cac.web.app/island-api/cards";
const pool = (() => {
  try {
    mkdirSync(CACHE, { recursive: true });
    const jar = join(CACHE, "cards.json");
    if (!existsSync(jar)) {
      execFileSync("curl", ["-sS", "-o", jar, PROD], { stdio: ["ignore", "ignore", "inherit"] });
    }
    const got = JSON.parse(readFileSync(jar, "utf8")).cards ?? [];
    const per = new Map();
    for (const c of got) {
      if (c.h <= c.w) continue;
      if (!per.has(c.photoId)) per.set(c.photoId, c);
    }
    const out = [];
    for (const c of [...per.values()].slice(0, 6)) {
      const file = join(CACHE, `${c.photoId}.jpeg`);
      if (!existsSync(file)) {
        try {
          execFileSync("curl", ["-sS", "-o", file, c.url], { stdio: ["ignore", "ignore", "inherit"] });
        } catch {
          continue;
        }
      }
      if (existsSync(file)) out.push(file);
    }
    return out;
  } catch {
    return [];
  }
})();
console.log(`本番の写真: ${pool.length}枚${pool.length ? "" : "（落とせず。差し込みの板のまま測ります）"}`);

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

for (const W of WIDTHS) {
  const ctx = await b.newContext({
    viewport: { width: W, height: 1100 },
    deviceScaleFactor: 2,
    isMobile: W < 700,
    hasTouch: W < 700,
    reducedMotion: "reduce",
  });
  await offline(ctx);
  await apply(ctx, {});
  /* **`apply` のあとに登録する**（あとから登録した route が先に効く） */
  if (pool.length) {
    await ctx.route(/firebasestorage\.googleapis\.com/, async (r) => {
      const m = /photos%2F([^.]+)\.jpe?g/.exec(r.request().url());
      if (!m) return r.fallback();
      let h = 0;
      for (const ch of m[1]) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      return r.fulfill({
        path: pool[h % pool.length],
        headers: { "access-control-allow-origin": "*", "content-type": "image/jpeg" },
      });
    });
  }
  const p = await ctx.newPage();
  await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
  await p.goto(`http://localhost:${PORT}/cards.html`, { waitUntil: "networkidle" });
  await p.waitForTimeout(700);

  const 札 = p.locator(".akd-view");
  if ((await 札.count()) < 2) {
    missing.push(`${W}px: 見かたの札（.akd-view）が ${await 札.count()} 枚`);
    await ctx.close();
    continue;
  }
  await 札.nth(1).click();
  await p.waitForTimeout(600);

  const got = await p.evaluate(() => {
    const cells = [...document.querySelectorAll(".akd-cal-day")];
    if (!cells.length) return null;
    const r = (e) => e.getBoundingClientRect();
    /** 箱どうしの重なり（面積 px²）。隣り合うものだけ見れば足りる */
    let 重なり = 0;
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const a = r(cells[i]);
        const c = r(cells[j]);
        const w = Math.min(a.right, c.right) - Math.max(a.left, c.left);
        const h = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
        if (w > 1 && h > 1) 重なり += Math.round(w * h);
      }
    }
    /** カードの無い日の字が、薄められていないか。**地はクリームの紙** */
    const 薄め = (() => {
      const e = cells.find((c) => c.tagName !== "BUTTON");
      if (!e) return null;
      const c = getComputedStyle(e).color;
      const n = (c.match(/[\d.]+/g) || []).map(Number);
      /* `rgb()` は3つ、`rgba()` / `color(srgb …)` は4つ目が濃さ */
      return { 色: c, 濃さ: n.length > 3 ? n[3] : 1 };
    })();
    const 押せる = cells.filter((e) => e.tagName === "BUTTON");
    const 押せない = cells.filter((e) => e.tagName !== "BUTTON");
    const 厚み = 押せない.filter((e) => {
      const s = getComputedStyle(e);
      return s.boxShadow !== "none" || parseFloat(s.borderTopWidth || "0") > 0;
    }).length;
    const box = 押せる.length ? r(押せる[0]) : null;
    const grid = document.querySelector(".akd-cal-grid").getBoundingClientRect();
    return {
      マス: cells.length,
      写真のある日: 押せる.length,
      重なり,
      押せないのに厚み: 厚み,
      大きさ: box ? [Math.round(box.width * 10) / 10, Math.round(box.height * 10) / 10] : null,
      はみ出し: Math.round(Math.max(0, grid.right - innerWidth) + Math.max(0, -grid.left)),
      薄め,
      /* 月の送りの札。**`hitbox.mjs` はここまで来られない**（カレンダーは
         札を押して開く面なので、面を開いただけでは出ていない） */
      送りの札: [...document.querySelectorAll(".akd-cal-go")].map((e) => {
        const b = e.getBoundingClientRect();
        return [e.textContent.trim(), Math.round(b.width), Math.round(b.height)];
      }),
      月: document.querySelector(".akd-cal-now")?.textContent ?? "",
      紙: document.querySelector(".akd-day h2")?.textContent ?? "",
    };
  });

  if (!got) {
    missing.push(`${W}px: カレンダーのマス（.akd-cal-day）が1つも無い`);
    await ctx.close();
    continue;
  }
  console.log(`\n--- ${W}px --- ${JSON.stringify(got)}`);
  if (got.写真のある日 < 1) missing.push(`${W}px: 写真のある日が0`);
  if (!got.紙) bad.push(`${W}px: 押している日の紙（.akd-day）が出ていない`);
  if (got.重なり > 0) bad.push(`${W}px: マスどうしが重なっている（${got.重なり}px²）`);
  if (got.はみ出し > 1) bad.push(`${W}px: カレンダーが窓から ${got.はみ出し}px はみ出している`);
  if (got.押せないのに厚み) {
    bad.push(`${W}px: カードの無い日 ${got.押せないのに厚み} 個に、押せる合図（厚み・枠）が付いている`);
  }
  /* 390px から上は 48px。それより狭いと 7列 × 48px が入らないので背だけ見る */
  const [w, h] = got.大きさ ?? [0, 0];
  if (h < 48) bad.push(`${W}px: マスの背が ${h}px（48px 要る）`);
  if (W >= 390 && w < 48) bad.push(`${W}px: マスの横が ${w}px（48px 要る）`);

  for (const [字, w, h] of got.送りの札 ?? []) {
    if (w < 48 || h < 48) bad.push(`${W}px: 月の送り「${字}」が ${w}x${h}（48px 要る）`);
  }

  /* **カードの無い日の字を薄めない。** 52% に薄めてあったとき、紙の
     クリーム（233,220,168）に対して 2.14 しか無かった（下限は 4.5）。
     地が紙の gradient なので `getComputedStyle` からは地が取れない
     ——**濃さ（alpha）だけを見る**。素の `--ink-2` で 5.2。 */
  if (got.薄め && got.薄め.濃さ < 0.99) {
    bad.push(`${W}px: カードの無い日の字が薄められている（${got.薄め.色}）`);
  }

  /* 月を送る。**送った先にも写真がある**（カードのある月だけを行き来する） */
  const 送り = p.locator(".akd-cal-go");
  if (await 送り.count()) {
    await 送り.first().click();
    await p.waitForTimeout(600);
    const 先 = await p.evaluate(() => ({
      月: document.querySelector(".akd-cal-now")?.textContent ?? "",
      写真のある日: document.querySelectorAll(".akd-cal-day.is-has").length,
    }));
    console.log(`  送った先: ${JSON.stringify(先)}`);
    if (先.月 === got.月) bad.push(`${W}px: 月を送っても ${先.月} のまま`);
    if (先.写真のある日 < 1) bad.push(`${W}px: 送った先（${先.月}）に写真のある日が無い`);
  }
  if (SHOTS) {
    const el = p.locator(".akd-cal");
    if (await el.count()) await el.screenshot({ path: join(SHOTS, `cal-${W}.png`) });
  }
  await ctx.close();
}

await b.close();

if (missing.length) {
  console.error(`\n見つからなかった: ${missing.join(" / ")}`);
  process.exit(2);
}
if (bad.length) {
  console.error(`\n届かなかった:\n  ${bad.join("\n  ")}`);
  process.exit(1);
}
console.log(`\n${WIDTHS.join(" / ")}px: カレンダー、ぜんぶ通りました。`);
