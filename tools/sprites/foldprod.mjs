/**
 * **本番そのもの**で、畳みを開いてから押しどころを測る。
 *
 *   PAGES=/,/nordic/day/3 node foldprod.mjs
 *   WIDTHS=390x844,1280x800 PAGES=… node foldprod.mjs
 *
 * ローカルの書き出しで挙がったものが、**出したバイト列でも同じ数になるか**を見る。
 * 違えば、そちらのほうが大事な発見（`docs/island-standards.md` 13
 * 「当座の判定は、まずその判定を疑う」）。
 *
 * この箱のブラウザは本番に届かないので `prod.mjs` の `viaCurl` を通す。
 * ログインの差し込み（`asme.mjs`）は**当てない**。ローカル側も入っていない人の
 * 姿で測っているので、当てると比べられなくなる。
 *
 * curl 1本ずつなので遅い。**当たりの出た面だけ**渡して使う。
 */
import { chromium } from "playwright-core";
import { viaCurl, ORIGIN } from "./prod.mjs";
import { openFolds, measure, fmtHit, SEL_ALL } from "./hitbox.mjs";
import { repoPath } from "./repo.mjs";

const PAGES = (process.env.PAGES || "/").split(",").map((s) => s.trim()).filter(Boolean);
const WIDTHS = (process.env.WIDTHS || "390x844,1280x800").split(",").map((s) => s.split("x").map(Number));
const MIN = Number(process.env.MIN || 48);
const SEL = process.env.SEL || SEL_ALL;
/* curl 経由は1本ずつ順に取るので、面によっては素材が間に合わない。
   **足りないと押しどころが少なく出て、「本番には無い」と読めてしまう。**
   数が合わないときは、まずここを伸ばして数が動くかを見る（島の面がそうだった） */
const WAIT = Number(process.env.WAIT || 6000);

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
console.log(`本番 ${ORIGIN} / ${PAGES.length}面 / 幅 ${WIDTHS.map((w) => w[0]).join(",")}`);
const out = {};
for (const [W, H] of WIDTHS) {
  const ctx = await b.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    isMobile: W < 900, hasTouch: W < 900,
    reducedMotion: "reduce",
  });
  await viaCurl(ctx);
  /* **外から借りている写真は、1枚の絵で埋める。**
     `prod.mjs` の `viaCurl` は本番と顔の置き場しか通さないので、北欧の面の
     写真（`upload.wikimedia.org`）が止まる。止まると写真の欄が潰れて、
     **写真に添えた出どころのリンクが 16px の字だけになり、「押しどころが
     48px 未満」と挙がる。** 実際に `/nordic/estonia` で 19件そう出た。
     止めた通信が原因の「割れ」は毎回起きる（`docs/island-standards.md` 13）。
     1枚ずつ curl で取ると19枚で40分たっても終わらないので、**中身は問わず
     箱だけ返す**（測っているのは押しどころの大きさで、写真の中身ではない）。
     **あとに登録した route が先に効く**ので、ここは viaCurl の後に書く。 */
  await ctx.route(/upload\.wikimedia\.org/, (r) =>
    r.fulfill({ path: repoPath("site/public/og.png") }),
  );
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("ayato-island-arrived", "2026-09-04");
      localStorage.setItem("ayato-island-walked", "1");
    } catch {}
  });
  const p = await ctx.newPage();
  for (const path of PAGES) {
    try {
      await p.goto(`${ORIGIN}${path}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    } catch (e) {
      console.log(`${W} ${path}  取れず ${String(e).slice(0, 60)}`);
      continue;
    }
    // curl 経由は1本ずつ順に取るので、待ちを短くすると絵が間に合わない
    await p.waitForTimeout(WAIT);
    await p.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 25));
      }
      window.scrollTo(0, 0);
    });
    await p.waitForTimeout(400);
    const before = await measure(p, { sel: SEL, min: MIN, fold: "skip" });
    const folds = await openFolds(p);
    const after = await measure(p, { sel: SEL, min: MIN, fold: "open" });
    const small = after.rows.filter((r) => r.small);
    out[`${W} ${path}`] = { n0: before.rows.length, n1: after.rows.length, s1: small.length };
    console.log(
      `${W} ${path}  畳み ${folds.opened}開いた${folds.stillClosed ? `（開かず ${folds.stillClosed}）` : ""}` +
        `  押しどころ ${before.rows.length}→${after.rows.length}（畳みの中 ${after.rows.filter((r) => r.fold).length}）` +
        `  ${MIN}px割れ ${before.rows.filter((r) => r.small).length}→${small.length}  測れず ${after.skipped.length}`,
    );
    for (const x of small)
      console.log(
        `    ${x.c}「${x.t || "(字なし)"}」${x.href ? ` → ${x.href}` : ""}` +
          `  見た目 ${x.box[0]}x${x.box[1]}  当たり ${fmtHit(x)}  ${x.fold ? "畳みの中" : "畳みの外"}` +
          (x.rivals.length ? `  かぶり:${x.rivals.map((v) => `${v.dir}=${v.who}${v.inBox ? "(見た目の中まで)" : ""}`).join(",")}` : ""),
      );
  }
  await ctx.close();
}
await b.close();
console.log("\n" + JSON.stringify(out, null, 1));
