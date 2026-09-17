/**
 * 次の島の建ちぐあい（更地→鉄筋→壁と屋根→完成）を4枚撮る。
 *
 *   SPORT=4340 node atlasfund.mjs
 *
 * 足代は `/island-api/fund` から読む。この箱からは出られないので、
 * **本番と同じ形の答えを差し込む**（`docs/island-misses.md` 決めごと2）。
 *
 * ## 「ok」としか言っていなかったのを直した（#416 と同じ形）
 *
 * 2026-09-15 に回したら、建ちぐあいが1枚も写っていないのに `ok` と出た。
 *
 * - 差し替える写真が `/home/user/atlas-wt/…`（**消えた worktree**。直書き点検: 記録）だった。
 *   `offline()` は `fulfill({path})` に直で渡すので外の絵が全部落ちる。既定に戻した
 * - 建設中の模型が出るのは**次の島**だけ（`Isles.tsx`: `c === nextCh && planned`）。
 *   北欧はもう次の島ではなく、次のアルバニアには `opensAt` も `plannedDays` も
 *   無いので、**いまはどの島にも家が出ない**。5段階の差が絵に出ない
 *
 * 撮っただけで `ok` と言わない。**建ちぐあいが DOM に在るか**を1枚ごとに見て、
 * 無ければ終了コード2で落ちる（`cardshot.mjs` と同じ。0=通った/1=途中で落ちた/2=撮るものが無い）。
 * 絵の指紋で見分けるのは試してやめた。模型は毎回ちらばり方が変わるので、
 * 同じ条件でも指紋が揺れて判定にならない（`docs/island-standards.md` 13）。
 *
 *   ISLE=アルバニア  押す島を名前で指定する（既定: 北欧周遊）
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";
import { offline } from "./route.mjs";
const SPORT = process.env.SPORT || "4340";
const ISLE = process.env.ISLE || "北欧周遊";
const OUT = "/tmp/atlas";
mkdirSync(OUT, { recursive: true });
/** 段階ごとに、建ちぐあいが何個描かれていたか */
const shots = [];
/** 撮れなかったもの。**空でなければ 2 で落ちる。** */
const missing = [];
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
/* **「読めない」を必ず1枚撮る。** 更地（0円）と見分けがつくかは、
   並べて見ないと分からない（`docs/island-atlas.md` 5章）。 */
for (const [tag, yen] of [["unknown", -1], ["bare", 1500], ["frame", 6000], ["walls", 30000], ["done", 52000]]) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  // 外の絵は `route.mjs` の既定（`site/public/og.png`）に任せる。
  // 自前のパスを指すと、そのファイルが消えたときに黙って絵が落ちる
  await offline(ctx);
  /* **0円は差し込めない。** `useFund` は 0以下を「読めなかった」と同じ null に
     するので（0円と出すのがいちばん悪い、という決まり）、更地が出るのは
     1〜4,999円のあいだ。だから更地の絵は 1,500円で撮る。 */
  if (yen < 0) {
    // 電波の弱いところで API に届かない日。**落ちたときの絵**を撮る
    await ctx.route(/\/island-api\/fund/, (r) => r.fulfill({ status: 500, body: "" }));
  } else if (yen > 0) {
    await ctx.route(/\/island-api\/fund/, (r) =>
      r.fulfill({ contentType: "application/json", body: JSON.stringify({ total: yen, given: yen, targetAmount: 50000, people: 12 }) }),
    );
  }
  const p = await ctx.newPage();
  await p.goto(`http://localhost:${SPORT}/atlas.html`, { waitUntil: "load" });
  await p.waitForTimeout(1500);
  /* 押す島。**押せたかどうかを見る。** `el?.click()` は見つからなくても
     黙って進むので、焼き込んだ名前が古くなっても同じ顔で 5枚撮れてしまう */
  const hit = await p.evaluate((l) => {
    const el = [...document.querySelectorAll(".atl-pin")].find((x) => x.getAttribute("aria-label") === l);
    el?.click();
    return !!el;
  }, `${ISLE}を見る`);
  if (!hit) missing.push(`${tag}: 「${ISLE}を見る」という島の印が無い`);
  await p.waitForTimeout(1200);
  /* **撮る前に、建ちぐあいが描かれているかを DOM で見る。**
     絵の指紋で見分けようとしたが、模型は毎回ちらばり方が変わるので
     同じ条件でも指紋が揺れて判定にならなかった
     （`docs/island-standards.md` 13「当座の判定は、まずその判定を疑う」）。 */
  const drawn = await p.evaluate(() => {
    const svg = document.querySelector(".atl-isle.is-at .dio");
    if (!svg) return { dio: false, house: 0, hut: 0 };
    return {
      dio: true,
      house: svg.querySelectorAll(".dio-house").length,
      hut: svg.querySelectorAll("image[href*='hut-home']").length,
    };
  });
  if (!drawn.dio) missing.push(`${tag}: 出ている島の模型（.atl-isle.is-at .dio）が無い`);
  else if (!drawn.house && !drawn.hut) missing.push(`${tag}: 建ちぐあい（.dio-house / hut-home）が描かれていない`);
  const file = `${OUT}/fund-${tag}.png`;
  await p.screenshot({ path: file });
  shots.push([tag, drawn]);
  await ctx.close();
}
await b.close();

/* **5枚撮れたことは、5段階が写ったことの証拠にならない。** */
if (missing.length) {
  console.error("撮れていません:");
  for (const m of missing) console.error("  - " + m);
  console.error(
    "\n建設中の模型が出るのは**次の島**だけです（`Isles.tsx`: c === nextCh && planned）。\n" +
    "いまの次の島に `opensAt` も `plannedDays` も無いと、どの島にも家は出ません。",
  );
  process.exitCode = 2;
} else {
  const n = shots.map(([t, d]) => `${t}:家${d.house + d.hut}`).join(" ");
  console.log(`ok  ${shots.length}枚 -> ${OUT}  ${n}`);
}
