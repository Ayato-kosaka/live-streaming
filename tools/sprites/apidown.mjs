/** **口（island-api）が落ちたとき、島が視聴者さんに何を見せるかを本番で見る。**
 *
 *   node tools/sprites/apidown.mjs
 *   PAGES=/,/nordic node tools/sprites/apidown.mjs
 *
 * ## なぜ誰も見ていないのか
 *
 * 全面の巡回（`crawl.mjs`）は、**`island-api` のエラーをわざと数えていない**:
 *
 *     if (m.type() === "error" && !/island-api|Failed to load resource/.test(m.text()))
 *
 * 手元には口が無いので、そうしないと全面が赤くなる。**その結果、
 * 「口が落ちた島」を一度も見ないまま出し続けている。**
 *
 * 口は Functions で、落ちる理由はいくらでもある（デプロイの最中・上限・
 * 寒い起動でのタイムアウト）。**落ちたときに視聴者さんが何を読むか**は、
 * 落ちる確率と関係なく決めておくべきもの。
 *
 * ## 出すもの
 *
 * 同じ面を2回撮る。1回目は口を通し、2回目は口だけ落とす。
 * **差した字**が「口が落ちたときだけ出るもの」で、そこに
 *
 *   - 中の話（`island-api` / `Failed to fetch` / 500 / undefined / NaN）
 *   - 嘘（本当は分からないのに「0件」「まだ無い」と言い切る）
 *
 * が出ていないかを見る。`CLAUDE.md`「画面で、システムの仕様を説明しない」。
 */
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ORIGIN = process.env.ORIGIN || "https://live-streaming-d3cac.web.app";
/* **どの面も口を叩く。** 本番の 118面を1面ずつ開いて数えたら、
   `/privacy` まで含めて **118/118 が island-api を叩いていた**（2026-09-14）。
   「口に依っているのは島まわりの数面だけ」は思い込みだったので、既定を
   一覧ファイルにした。`PAGELIST` に1行1面で渡す。 */
const PAGES = process.env.PAGELIST
  ? readFileSync(process.env.PAGELIST, "utf8").trim().split("\n").filter(Boolean)
  : (process.env.PAGES || "/,/nordic,/now,/cards,/board,/friends,/me").split(",");
const PASS = /live-streaming-d3cac\.web\.app|yt3\.ggpht\.com|googleusercontent\.com|firebasestorage\.googleapis\.com/;
const TYPE = { js: "application/javascript", css: "text/css", html: "text/html",
  json: "application/json", svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg",
  jpeg: "image/jpeg", webp: "image/webp", ico: "image/x-icon", woff2: "font/woff2", txt: "text/plain" };

/* 中の話。**視聴者さんが読んで意味を取れない、取れても要らない字。** */
const 中の話 = [
  "island-api", "Failed to fetch", "fetch", "undefined", "NaN", "null",
  "500", "503", "エラー", "Error", "error", "取得", "API", "サーバ",
  "リクエスト", "タイムアウト", "通信に失敗", "読み込めませんでした",
];
/* 言い切ってはいけない字。**分からないのに「無い」と言うのは嘘。** */
const 言い切り = ["まだ", "ありません", "ありませんでした", "0件", "0 件", "いません", "無い", "なし"];

/* **静的なものは1回だけ取る。** 118面×2回ぶん毎回 curl すると終わらない。
   口（island-api）は面ごとに答えが変わるので、**絶対に使い回さない。** */
const 蔵 = new Map();

async function 撮る(b, path, 口を落とす) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  let 落とした = 0;
  await ctx.route("**/*", (r) => {
    const u = r.request().url();
    if (口を落とす && /island-api/.test(u)) { 落とした++; return r.abort(); }
    if (!PASS.test(u)) return r.abort();
    if (蔵.has(u)) return r.fulfill(蔵.get(u));
    try {
      const body = execFileSync("curl", ["-sS", "--retry", "2", "--max-time", "40", u], { maxBuffer: 1 << 28 });
      const ext = (u.split("?")[0].match(/\.([a-z0-9]+)$/i)?.[1] || "html").toLowerCase();
      const res = { status: 200, contentType: TYPE[ext] || "text/html", body };
      // 面ごとに中身の変わるもの（HTML と口）は蔵に入れない
      if (/\.(js|css|woff2|png|jpg|jpeg|svg|webp|ico)$/i.test(u.split("?")[0])) 蔵.set(u, res);
      r.fulfill(res);
    } catch { r.abort(); }
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e).slice(0, 120)));
  await p.goto(ORIGIN + path, { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForTimeout(9000);
  /* **島は動くので、字だけを取る。** 見えているものに限る（`hidden` を除く） */
  const 字 = await p.evaluate(() => {
    const out = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const t = (n.textContent || "").trim();
      if (!t) continue;
      const el = n.parentElement;
      if (!el) continue;
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden" || s.opacity === "0") continue;
      out.push(t);
    }
    return out;
  });
  await ctx.close();
  return { 字, errs, 落とした };
}

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
console.log(`${ORIGIN}  口を落としたときに何が出るか\n`);
let 悪い = 0;
for (const path of PAGES) {
  const 通す = await 撮る(b, path, false);
  const 落とす = await 撮る(b, path, true);
  /* **差だけを見る。** 口と関係なく出ている字を混ぜない */
  const 前 = new Set(通す.字);
  const 差 = [...new Set(落とす.字)].filter((t) => !前.has(t));

  const 内 = 差.filter((t) => 中の話.some((k) => t.includes(k)));
  const 嘘 = 差.filter((t) => 言い切り.some((k) => t.includes(k)));
  const 印 = 内.length || 嘘.length ? "★" : "  ";
  if (内.length || 嘘.length) 悪い++;
  console.log(`${印} ${path.padEnd(10)} 口 ${落とす.落とした}本を落とした / ` +
    `差した字 ${差.length}  中の話 ${内.length}  言い切り ${嘘.length}` +
    (落とす.errs.length ? `  JSエラー ${落とす.errs.length}` : ""));
  for (const t of 内) console.log(`      【中の話】${t.slice(0, 90)}`);
  for (const t of 嘘) console.log(`      【言い切り】${t.slice(0, 90)}`);
  if (!内.length && !嘘.length && 差.length) {
    for (const t of 差.slice(0, 4)) console.log(`      （差）${t.slice(0, 80)}`);
  }
}
console.log(`\n口が落ちたときに見せてはいけない字が出た面: ${悪い} / ${PAGES.length}`);
await b.close();
