/**
 * **その選択子が、どの面の何か所に当たるかを数える。**
 *
 *   SPORT=4210 SEL='a[href^="mailto:"]' node tools/sprites/selcount.mjs
 *   SPORT=4210 SEL='.panel p' node tools/sprites/selcount.mjs
 *
 * ## なぜ作ったか
 *
 * CSS を1行足すとき、**その1行がどこまで当たるかを数えずに書くと、測っていない
 * 面の行が動く。** `.panel p` のような選択子は129面ぜんぶに効く。
 *
 * そして「1か所でした」が出たとき、それが**数えて1か所**なのか
 * **数え方が壊れて1か所**なのかは、読む側に区別がつかない
 * （`docs/island-misses.md` #79）。だからこの道具は必ず
 *
 *   - 何面を歩いたか
 *   - 開けなかった面はどれか
 *   - **仕込みを当てたか**（`PROBE=1`。自分で1つ足して、それが数に出るか）
 *
 * を毎回いっしょに出す。**0 や 1 は、歩いた面の数と並べないと読めない。**
 *
 * ## 書き出した HTML を grep するだけでは足りない
 *
 * 島の面は画面が出てから中身を読む（掲示板・付箋・カード）。焼いた HTML に
 * 無くても、ブラウザで開けば出てくる要素がある。だから**開いて数える。**
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
import { collect, banner, tally } from "./pages.mjs";

const SPORT = process.env.SPORT || "4210";
const SEL = process.env.SEL || 'a[href^="mailto:"]';
const W = Number(process.env.W || 390);
const H = Number(process.env.H || 844);
/** 仕込み（`PROBE=1`）。**当たるはずの形を1つ足して、それが数に出るかを見る。**
 *
 *  既定は「紙の中の段落に流れている mailto」で、`a[href^="mailto:"]` /
 *  `p > a[href^="mailto:"]` / `.panel p` / `.panel p a` のどれにも当たる形。
 *  **別の形の選択子を数えるときは `PROBE=<HTML>` で自分で渡す。**
 *  仕込みが当たらない形のまま回すと「数え方が届いていない」と出るが、
 *  それは数え方ではなく**仕込みのほうが選択子と合っていない**という意味。
 *  どちらなのかは、渡した HTML を見れば分かるようにここに出す。 */
const PROBE_HTML =
  process.env.PROBE && process.env.PROBE !== "1"
    ? process.env.PROBE
    : '<div class="panel"><p><a class="selcountprobe" href="mailto:probe@example.com">仕込み</a></p></div>';

const C = collect();
console.log(banner(C));
console.log(`\n数える選択子: ${SEL}`);
if (process.env.PROBE) console.log(`仕込み: ${PROBE_HTML}`);
console.log();

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 1,
  isMobile: W < 900, hasTouch: W < 900,
  reducedMotion: "reduce",
});
await offline(ctx);
/* ログインした人にしか出ない面（じぶんのこと）も数えるための差し込み口。
   `SEED=tools/sprites/asme.mjs` を渡すと、入っている人として開く。
   **これを渡さないと `/me*` は器と見出しだけ**で、そこの 0 は
   「中身を見て 0」ではない（`pages.mjs` の PARTIAL に書いてあるとおり）。 */
if (process.env.SEED) await (await import(process.env.SEED)).apply(ctx);
await ctx.addInitScript(() => {
  try {
    localStorage.setItem("ayato-island-arrived", "2026-09-04");
    localStorage.setItem("ayato-island-walked", "1");
  } catch {}
});
const p = await ctx.newPage();

let measured = 0, total = 0;
const hits = [], failed = [];
for (const path of C.pages) {
  try {
    await p.goto(`http://localhost:${SPORT}${path === "/" ? "/index" : path}.html`,
      { waitUntil: "domcontentloaded", timeout: 60000 });
  } catch (e) {
    failed.push({ path, why: String(e).slice(0, 90) });
    continue;
  }
  await p.waitForTimeout(500);
  /* **仕込み。** 自分で1つ当たるものを足して、それが数に出るかを見る。
     出なければ、0 は「無い」ではなく「数えられていない」（#19・#79）。 */
  if (process.env.PROBE)
    await p.evaluate((html) => {
      const d = document.createElement("div");
      d.innerHTML = html;
      document.body.appendChild(d);
    }, PROBE_HTML);
  const got = await p.evaluate((sel) =>
    [...document.querySelectorAll(sel)].map((el) => ({
      t: (el.textContent || "").trim().slice(0, 24),
      tag: el.tagName,
      c: typeof el.className === "string" ? el.className : "",
      href: el.getAttribute?.("href") || "",
    })), SEL);
  measured++;
  if (got.length) {
    total += got.length;
    hits.push({ path, n: got.length, got });
  }
}
await b.close();

console.log("当たった面:");
if (!hits.length) console.log("  なし");
for (const h of hits) {
  console.log(`  ${h.path}  ${h.n}か所`);
  for (const g of h.got) console.log(`      ${g.tag}${g.c ? "." + g.c.split(/\s+/)[0] : ""}  「${g.t}」  ${g.href}`);
}
if (failed.length) {
  console.log("\n開けなかった面（**0に混ぜない**）:");
  for (const f of failed) console.log(`  ${f.path}  ${f.why}`);
}
console.log(`\n${tally(C, measured, "歩いた")}  →  当たった ${hits.length}面 / ${total}か所`);
if (process.env.PROBE) {
  const n = hits.filter((h) => h.got.some((g) => g.c.includes("selcountprobe"))).length;
  console.log(`仕込みの確認: 足した ${measured}面 / 数に出た ${n}面  ${n === measured ? "数え方は届いている" : "!! 数え方が届いていない"}`);
}
