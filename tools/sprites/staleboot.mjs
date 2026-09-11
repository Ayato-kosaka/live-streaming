/**
 * **古い HTML を持っている端末を作って、本番で何が起きるかを見る。**
 *
 * 焼き直して配ると束のファイル名（内容ハッシュ）が変わり、前の名前は消える。
 * HTML が `max-age=3600` で端末に残っていると、消えた束を取りにいく。
 * 総取りの rewrite があるので **404 ではなく 200 + index.html** が返り、
 * ブラウザはそれを JavaScript として読んで落ちる。
 *
 * ここでは、いまの本番の HTML の束の名前を1文字だけ変えて
 * 「もう無い束を指している古い HTML」を作り、それを `/` の返事として返す。
 * **束の取りにいく先は本番そのもの。** 何が返ってくるかは横取りしない。
 *
 *   node tools/sprites/staleboot.mjs
 *
 * 見るもの:
 *   - 消えた束に本番が何を返したか（**状態番号ではなく中身**。#53）
 *   - ページが投げた例外（`SyntaxError: Unexpected token '<'` が出るか）
 *   - 画面に `Application error` が出たか
 */
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { readFileSync, unlinkSync } from "node:fs";

const ORIGIN = process.env.ORIGIN || "https://live-streaming-d3cac.web.app";
const PASS = /live-streaming-d3cac\.web\.app|yt3\.ggpht\.com|googleusercontent\.com|firebasestorage\.googleapis\.com/;
const TYPE = { js: "application/javascript", css: "text/css", json: "application/json",
  svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", webp: "image/webp",
  ico: "image/x-icon", woff2: "font/woff2", txt: "text/plain" };
let seq = 0;
const pull = (u) => {
  const tmp = `/tmp/staleboot-${process.pid}-${seq++}`;
  try {
    const o = execFileSync("curl", ["-sS", "-o", tmp, "-w", "%{http_code}\n%{content_type}",
      "--retry", "2", "--max-time", "40", u], { maxBuffer: 1 << 20 }).toString().split("\n");
    return { status: Number(o[0]) || 200, ct: (o[1] || "").trim(), body: readFileSync(tmp) };
  } finally { try { unlinkSync(tmp); } catch {} }
};

/* いまの本番の HTML を取って、**束を1本だけ「もう無い名前」に差し替える。**
   これが「配る前に開いた人が持っている HTML」にあたる。 */
const live = pull(`${ORIGIN}/`).body.toString();
/* **束は1本ずつではなく、まとめて名前が変わる。** 1本だけ壊すと、焼いた
   HTML はそのまま出るので画面は生きて見える（水あわせだけが死ぬ）。
   実際のデプロイでは触った束が全部変わるので、既定は「全部」。
   `ONE=webpack` のように渡すと1本だけ壊せる。 */
const one = process.env.ONE || "";
const names = [...new Set([...live.matchAll(/\/_next\/static\/chunks\/((?:app\/)?[\w./-]*?-[a-f0-9]{16})\.js/g)].map((m) => m[1]))]
  .filter((n) => !one || n.includes(one));
if (!names.length) throw new Error("束が HTML に見つからない");
const bend = (n) => n.replace(/.$/, (c) => (c === "0" ? "1" : "0"));
let stale = live;
for (const n of names) stale = stale.split(n).join(bend(n));
const gone = bend(names[0]);
console.log(`古い HTML を作った: 束 ${names.length} 本の名前を、もう無い名前に差し替え（例 ${names[0]}.js → ${gone}.js）`);

/* まず、消えた束に本番が何を返すかを**中身で**見る。状態番号は当てにならない
   （この置き場は存在しない道にも 200 を返す）。 */
const probe = pull(`${ORIGIN}/_next/static/chunks/${gone}.js`);
const isHtml = /^\s*<(!doctype|html)/i.test(probe.body.slice(0, 40).toString());
console.log(`消えた束の返事: ${probe.status} ${probe.ct} ${probe.body.length}バイト` +
  ` 先頭「${probe.body.slice(0, 16).toString().replace(/\n/g, "")}」` +
  ` → ${isHtml ? "**HTML が返っている（死んでいる）**" : "HTML ではない"}`);

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
await ctx.route("**/*", (r) => {
  const u = r.request().url();
  // 古い HTML を持っている端末なので、島の入口だけ手元のものを返す
  if (u === `${ORIGIN}/` || u === ORIGIN) {
    return r.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: stale });
  }
  if (!PASS.test(u)) return r.abort();
  try {
    const p = pull(u);
    const ext = (u.split("?")[0].match(/\.([a-z0-9]+)$/i)?.[1] || "html").toLowerCase();
    r.fulfill({ status: p.status, contentType: p.ct || TYPE[ext] || "text/html",
      headers: { "access-control-allow-origin": "*" }, body: p.body });
  } catch { r.abort(); }
});
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push((e.stack || e.message).split("\n")[0]));
await p.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded" }).catch((e) => errs.push("goto: " + e.message));
await p.waitForTimeout(9000);
const fell = (x) => /Application error|client-side exception/.test(x);
let t = await p.evaluate(() => (document.body.innerText || "").slice(0, 120).replace(/\s+/g, " "));
let dead = fell(t);
console.log("開いた直後の画面:", t || "(空)");

/* **焼いた HTML はそのまま出るので、開いただけでは絵は生きて見える。**
   落ちるのは、島の中を押して移った先。Next はそこで面の束を取りにいき、
   返ってきた HTML を JavaScript として読んで、受け皿ごと落ちる。
   あやとが見た字（`Application error`）はこれ。 */
const to = process.env.GO || "/cards";
await p.evaluate((href) => {
  const a = [...document.querySelectorAll("a[href]")].find((x) => x.getAttribute("href") === href);
  if (a) a.click();
  else location.href = href;
}, to);
await p.waitForTimeout(6000);
t = await p.evaluate(() => (document.body.innerText || "").slice(0, 120).replace(/\s+/g, " "));
dead = dead || fell(t);
console.log(`島の中で ${to} へ押したあと:`, t || "(空)");
errs.slice(0, 6).forEach((e) => console.log("例外:", e.slice(0, 200)));
if (!errs.length) console.log("例外: なし");
console.log(dead ? "→ 古い HTML の端末は落ちる" : "→ 古い HTML でも落ちない");
await b.close();
process.exit(dead ? 1 : 0);
