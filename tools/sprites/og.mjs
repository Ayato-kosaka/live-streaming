/**
 * 共有画像（`site/public/og.png`、**1200×630**）の下絵を、いまの島から撮る。
 *
 *   PORT=4160 node tools/sprites/og.mjs
 *   PORT=4160 OUT=/tmp/og-new.png node tools/sprites/og.mjs
 *
 * **ここは下絵を撮るだけで、`site/public/og.png` は置き換えない。**
 * 差し替えるかどうかは、撮ったものを見てから人が決める（表紙の島は章で
 * 入れ替わるので、撮れた絵が「いまの島」でも「配りたい絵」とは限らない）。
 *
 * **1200×630 は必ず出す。** 島の高さは `86svh`（`chain.css`）で画面の高さに
 * 従うので、窓の高さを決め打ちすると島が変わったとたんに寸法がずれる。
 * 実際 `.stage` 時代の 1200×716 は `88svh` から 630 を出していて、
 * `.isle`（86svh）に入れ替わったあとは 616 にしかならなかった。
 * だから**比を測ってから窓を決め、最後に 1200×630 で切る。**
 *
 * **終了コード**: 0＝撮れた / 2＝撮れなかった（島が出ない・1200×630 に届かない）。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
import { findStage } from "./stage.mjs";

/** 並列で作業するとき、エージェントごとに別のポートを使う。既定は 3000。 */
const PORT = process.env.PORT || "3000";
const OUT = process.env.OUT || "/tmp/og-new.png";
const W = 1200, H = 630;

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
const ctx = await b.newContext({ viewport: { width: W, height: 716 }, deviceScaleFactor: 1 });
/* 住人の絵は外から来る。**全員を ayato.webp に差し替えると島の全員が同じ顔で写る**ので、
   落としてあれば1人ずつ本物を返す差し替えを使う（`route.mjs`。先に
   `python3 tools/sprites/avatars.py`）。何枚を本物で返したかは route.mjs が終わりに言う。 */
await offline(ctx);
const p = await ctx.newPage();
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
await p.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForTimeout(4500);

let S;
try {
  S = await findStage(p);
} catch (e) {
  console.error(String(e.message || e));
  await b.close();
  process.exit(2);
}

/* **引きで撮る。** 共有画像は島ぜんぶが写っていないと何の島か分からない。
   PC の既定は「島に降り立った視点」（寄り）に変わったので、明示的に引く
   （前はPCの既定が引きだったので、何もしなくても島ぜんぶが写っていた）。 */
const z = await p.$(S.zoom);
if (!z) {
  console.error(`引きに切り替える札（${S.zoom}）がありません`);
  await b.close();
  process.exit(2);
}
if ((await p.getAttribute(S.root, "data-cam")) !== "wide") {
  await z.click();
  await p.waitForTimeout(2500);
}

// 昼の色で撮る。時間帯で色が変わるので固定する。
await p.evaluate(() => document.documentElement.setAttribute("data-time", "day"));
// 隅の道具・案内・吹き出しは共有画像には要らない（島ごとに名前が違う。`stage.mjs`）
await p.addStyleTag({ content: `${S.chrome}{display:none!important}` });
await p.waitForTimeout(400);

const box = async () => p.$eval(S.root, n => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
let r = await box();
// 島の高さは画面の高さに比例する（svh）。**いまの比から、630 に届く窓を出す。**
const vh = Math.ceil(716 * (H / r.h)) + 1;
await p.setViewportSize({ width: W, height: vh });
await p.waitForTimeout(1200);
r = await box();
console.log(`島 ${S.kind}（${S.root}）  cam ${await p.getAttribute(S.root, "data-cam")}  窓 ${W}x${vh}  島 ${Math.round(r.w)}x${r.h.toFixed(1)}`);
if (r.w < W || r.h < H - 0.5) {
  console.error(`島が ${W}x${H} に足りません（${Math.round(r.w)}x${r.h.toFixed(1)}）。切ると足りないぶんが白く出る`);
  await b.close();
  process.exit(2);
}
// 島の左上から 1200x630 ちょうどを切る。**要素まるごと撮ると端数が寸法に出る**
await p.screenshot({ path: OUT, clip: { x: r.x, y: r.y, width: W, height: H } });
console.log(`書いた ${OUT}  ${W}x${H}`);
await b.close();
process.exit(0);
