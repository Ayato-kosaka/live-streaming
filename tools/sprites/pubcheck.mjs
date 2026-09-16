/** **`public/` 直下の単体ページを、本番で見て回る。**
 *
 *   cd tools/sprites && node pubcheck.mjs
 *
 * `crawl.mjs` は Next の書き出し（`site/.next-verify`）を歩くので、
 * **`public/*.html` は1枚も見ていない。** けれど Hosting は `dist/` に
 * そのまま混ぜて配るので、本番では生きている。**誰も見ていない面だった。**
 *
 * しかも2枚（授賞式・投げ銭セレモニー）は **OBS のブラウザソース**で、
 * 壊れると配信にそのまま映る。だから本番のバイト列で見る。
 *
 * 見るのは4つ。**どれも「出ているか」ではなく「壊れていないか」。**
 *   - 届くか（http）
 *   - JS が落ちていないか
 *   - 横にあふれていないか（スマホ幅）
 *   - 絵が落ちていないか（**畳みは開いてから数える**。閉じた details の
 *     中の lazy はブラウザが要求しないので、数えると嘘になる）
 */
import { chromium } from "playwright-core";
import { viaCurl, blocked, ORIGIN } from "./prod.mjs";
import { readdirSync } from "node:fs";

const dir = "/home/user/live-streaming/public";
const names = readdirSync(dir).filter((f) => f.endsWith(".html")).sort();

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
let bad = 0, starvedN = 0;
for (const name of names) {
  const slug = encodeURIComponent(name.replace(/\.html$/, ""));
  for (const [w, tag] of [[390, "sp"], [1280, "pc"]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1 });
    await viaCurl(ctx);
    const p = await ctx.newPage();
    const errs = [];
    p.on("pageerror", (e) => errs.push(String(e).split("\n")[0].slice(0, 90)));
    let status = 0;
    try {
      const res = await p.goto(`${ORIGIN}/${slug}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      status = res?.status() ?? 0;
    } catch (e) { status = -1; }
    await p.waitForTimeout(6000);
    // 畳みを開く。開かないと中の lazy を「落ちた」と数えてしまう
    await p.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
    for (let i = 0; i < 25; i++) { await p.evaluate(() => window.scrollBy(0, window.innerHeight)); await p.waitForTimeout(200); }
    await p.waitForTimeout(5000);
    const r = await p.evaluate(() => ({
      over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      imgs: document.images.length,
      dead: [...document.images].filter((i) => i.naturalWidth === 0).length,
      h1: document.querySelectorAll("h1").length,
      text: (document.body.innerText || "").replace(/\s+/g, "").length,
      /* **自分で伏せた面を「壊れている」と読まない。** 授賞式の面は、出す名前が
         0件のとき `is-dead` を付けて丸ごと隠す。前に「合計 0 名 0 円
         ありがとうございました🙏」が配信に出てしまった対策で、**伏せるのが
         正しい姿**（`docs/island-misses.md` の表にある）。字が0なのは結果であって
         不具合ではない。 */
      deadPage: document.documentElement.classList.contains("is-dead"),
    }));
    /* **飢えと壊れを分ける。** 通していない先があると、面は壊れていなくても
       空で写る。そこを混ぜて NG と読むと、**直っているものを不具合として
       報告する**（実際に3回やった）。止めた先が1つでもあれば、判定しない。 */
    const blk = [...blocked(ctx)].map(([h, n]) => `${h}×${n}`);
    const starved = blk.length > 0;
    const ng = !starved && (status !== 200 || errs.length || r.over > 0 || r.dead > 0 ||
                            (!r.deadPage && r.text < 40));
    if (ng) bad++;
    if (starved) starvedN++;
    const mark = starved ? "??" : ng ? "NG" : r.deadPage ? "--" : "ok";
    console.log(`${mark}  ${tag} ${String(w).padStart(4)}px  http ${status}  横あふれ ${r.over}px  JSエラー ${errs.length}  絵 ${r.imgs - r.dead}/${r.imgs}  h1 ${r.h1}  字 ${r.text}  ${name}`);
    if (r.deadPage) console.log(`      ↳ この面は自分で伏せている（is-dead）。出す中身が0件のときの正しい姿。`);
    if (starved) console.log(`      ↳ **見ていない。** 通していない先がある: ${blk.join(" / ")}（prod.mjs の PASS）`);
    if (errs.length) errs.slice(0, 2).forEach((e) => console.log(`      ↳ ${e}`));
    await ctx.close();
  }
}
console.log(
  bad ? `\nNG ${bad} 件` :
  starvedN ? `\n判定できたぶんは通った。**${starvedN} 件は見ていない**（PASS に無い先がある）` :
  "\nぜんぶ通った");
await b.close();
/* 飢えも落とす。**「見ていない」を「通った」と数えない。** */
process.exit(bad || starvedN ? 1 : 0);
