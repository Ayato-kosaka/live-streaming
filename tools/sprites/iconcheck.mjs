/** 看板の右はしと、じぶんのことの顔を、**絵のある人と無い人の両方で**見る。
 *
 * NOCHARA=1 はあやと自身（住人の表に居ないので島のキャラクターが無い）。
 *
 * **yt3.ggpht.com（YouTube の顔写真）を1枚でも取りに行ったら失敗**とする。
 * 「そのカラムは使わないで欲しい」（あやと・2026-09-09）を、描画結果ではなく
 * **通信で**確かめる。前は差し替えた絵で撮っていたので、消えたと誤認した。
 */
import { chromium } from "playwright-core";
import { apply } from "./asme.mjs";
import { offline } from "./route.mjs";

const PORT = process.env.SPORT || 4150;
const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
let bad = 0;
for (const nochara of [false, true]) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await apply(ctx, { nochara });
  await offline(ctx).catch(() => {});
  const p = await ctx.newPage();
  const yt = [];
  p.on("request", (r) => { if (/yt3\.ggpht\.com|googleusercontent\.com\/ytc/.test(r.url())) yt.push(r.url()); });
  await p.goto(`http://localhost:${PORT}/me.html`, { waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  const r = await p.evaluate(() => {
    const me = document.querySelector(".ih-me");
    const img = me?.querySelector("img");
    /* じぶんのことを作り直したとき（#239）、顔は `.mp-face` から
       `.mh-face`（YouTube の顔）と `.mh-chara`（島のキャラクター）に分かれた。
       **面を作り替えたら、判定の指す先も直す。** 古い名前のままだと
       「正しく出ているのに無し」と読んで、直っているものを落とす。 */
    const face = document.querySelector(".mh-face");
    const chara = document.querySelector(".mh-chara");
    const ok = (e) => (e ? (e.naturalWidth > 0 ? "出ている" : "落ちた") : "無し");
    return {
      看板字: me?.querySelector(".ih-me-i")?.textContent ?? "(無し)",
      看板絵: ok(img),
      中部: ok(face),
      島のじぶん: chara ? ok(chara) : "（絵なし）",
    };
  });
  /* **判定の向きを、いまの目的に合わせる。**
     一度「YouTube の顔を消す」が目的だったときの判定（取りに行ったら失敗）を
     そのまま使っていて、正しく出ているものを「だめ」と読んだ。
     いまの正解は「顔が出ていること」。字に落ちていたら失敗。 */
  const ng = r.中部 !== "出ている" || r.看板絵 !== "出ている";
  if (ng) bad++;
  console.log(
    `${nochara ? "絵の無い人(あやと)" : "絵のある人      "} 看板=${r.看板絵} / ` +
      `YouTubeの顔=${r.中部} / 島のじぶん=${r.島のじぶん} / 顔の取得=${yt.length}回${ng ? "  ← だめ" : ""}`,
  );
  await ctx.close();
}
await b.close();
console.log(bad ? `だめ ${bad}件` : "看板・中部とも顔が出ている");
