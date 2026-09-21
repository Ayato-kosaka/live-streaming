// 振り返り資料（public/nordic_review.html）を全区画・全ステップ歩く。
//   node tools/sprites/deckwalk.mjs
// 見るもの: はみ出し（横・下・上）/ JSエラー / 絵文字 / 各区画の最後の1枚
// **終了コードで判定する**（0=見つからなかった / 1=見つかった）。行の見た目で判断しない。
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
// **本番と同じ条件で見たいときは http で配って URL を渡す。**
//   python3 -m http.server 4711 --directory public &
//   URL=http://localhost:4711/nordic_review.html node tools/sprites/deckwalk.mjs
// file:// で開くと丸ゴシックの @font-face が効かない（資料側で切ってある）。
// 字の形が本番と変わるので、**明るさや字の濃さを測るときは必ず http にする。**
const PAGE = process.env.URL || pathToFileURL(path.join(ROOT, "public", "nordic_review.html")).href;
const OUT = process.env.SHOTS || "/tmp/deckshots";
fs.mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({ executablePath: EXE });
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
/* ブラウザが勝手に取りに行く /favicon.ico は資料の持ち物ではない。
   本番（dist/）には島のものが置いてあるので出ない。数に入れると
   「JSエラー1件」がいつまでも消えず、本物の1件を見落とす。 */
page.on("requestfailed", (r) => { if (!/favicon\.ico$/.test(r.url())) errs.push("取れなかった: " + r.url()); });
page.on("response", (r) => {
  if (r.status() >= 400 && !/favicon\.ico$/.test(r.url())) errs.push(`${r.status()} ${r.url()}`);
});
page.on("console", (m) => {
  if (m.type() !== "error") return;
  // 上の response で URL つきに数えているので、中身の無い言い回しは落とす
  if (/Failed to load resource/.test(m.text())) return;
  errs.push("console: " + m.text());
});
await page.goto(PAGE, { waitUntil: "load" });
await page.waitForTimeout(600);

const count = await page.evaluate(() => window.__sceneCount);
const totals = await page.evaluate(() => window.__totals);
console.log("区画", count, "ステップ", JSON.stringify(totals));

// 切り替えの見た目（0.32秒）を待つと 3 分かかる。**測るのは位置だけ**なので
// 出方の transition を止めて、1フレームだけ待って測る。
const res = await page.evaluate(async () => {
  // **位置を測るためだけに止める。** 撮影はこのあと、止めずにやり直す
  document.querySelectorAll("*").forEach((e) => (e.style.transition = "none"));
  const bad = [], emoji = [];
  const re = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F900}-\u{1F9FF}]/u;
  for (let s = 0; s < window.__sceneCount; s++) {
    for (let st = 0; st <= window.__totals[s]; st++) {
      window.__jump(s, st);
      await new Promise((r) => requestAnimationFrame(r));
      const stage = document.getElementById("stage");
      let R = 0, B = 0, T = 0;
      for (const el of stage.querySelectorAll("*")) {
        const r = el.getBoundingClientRect();
        if (!r.width && !r.height) continue;
        R = Math.max(R, r.right - innerWidth);
        B = Math.max(B, r.bottom - innerHeight);
        T = Math.max(T, -r.top);
      }
      if (R > 1 || B > 1 || T > 1) bad.push({ s, st, R: Math.round(R), B: Math.round(B), T: Math.round(T) });
      const t = stage.textContent || "";
      if (re.test(t)) emoji.push({ s, st, c: t.match(re)[0] });
    }
  }
  return {
    bad, emoji,
    scrollX: document.documentElement.scrollWidth - innerWidth,
    scrollY: document.documentElement.scrollHeight - innerHeight,
  };
});

// 1枚ずつ撮るのは、数が通ったあと。**撮った絵は必ず自分で見る**（island-design 7章）
//
// **撮るときは切り替えを待つ。** 区画を移すと舞台が 0.32 秒かけて消えて出る
// （`#stage.fading`）。90ms で撮ると **46枚とも地だけの真っ白**が写り、
// 明るさを測れば「全部 L*94 で揃っている」という、通っているように見える
// 嘘の数字が出る（実際に一度出した）。位置を測るときは transition を
// 止めてよいが、**絵に撮るときは止めない。止めたら本番と違うものを見る。**
// 位置を測るあいだに紙吹雪の区画を通っているので、**撮る前に片づける。**
// 残っていると、関係のない面に紙が降っている絵が撮れる（実際に撮れた）
await page.evaluate(() => {
  const l = document.getElementById("confetti-layer");
  if (l) l.innerHTML = "";
});
for (let s = 0; s < count; s++) {
  await page.evaluate(([a, b]) => window.__jump(a, b), [s, totals[s]]);
  await page.waitForFunction(() => !document.getElementById("stage").classList.contains("fading"));
  await page.waitForTimeout(620);   // 出方（0.45s）ぶん。ここを削ると薄い絵が撮れる
  await page.screenshot({ path: `${OUT}/s${String(s).padStart(2, "0")}.png` });
}
await b.close();

console.log("はみ出し", res.bad.length, JSON.stringify(res.bad.slice(0, 8)));
console.log("絵文字", res.emoji.length, JSON.stringify(res.emoji.slice(0, 5)));
console.log("横スクロール", res.scrollX, "縦スクロール", res.scrollY);
console.log("JSエラー", errs.length, errs.slice(0, 5));
console.log("絵は", OUT);
const ng = res.bad.length || res.emoji.length || errs.length || res.scrollX > 0 || res.scrollY > 0;
process.exit(ng ? 1 : 0);
