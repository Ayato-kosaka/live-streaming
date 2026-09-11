/**
 * アラートボックスに、**本物の名簿で、投げ銭を1件流して撮る。**
 *
 *   npx expo export --platform web --output-dir /tmp/webx
 *   node tools/sprites/shot-alertbox.mjs
 *
 * ## なぜ要るか
 *
 * 名簿の出どころをスプレッドシートから島の口へ替えた（#284）。
 * 「口を叩いているか」までは書き出しを読めば分かるが、**投げ銭が来たときに
 * その人の絵が本当に出るか**は、出してみないと分からない。
 * 配信中に壊れていても直せない（あやとは配信している）。
 *
 * ## どうやって流すか
 *
 * Doneru の通知は WebSocket で来る（`connectors/DoneruConnector.ts`）。
 * 繋ぎ先は `GET /island-api/alertbox/{k}/wss` が教えてくれるので、
 * そこを**この箱の中の WebSocket**に差し替えて、1件送る。
 *
 * 名簿は `/tmp/ch.json`（本番の返り）から作る。**名前は作り物**にして、
 * 絵と絵文字だけ本物を使う（本番の名前をこの箱に落とさない）。
 * 絵は `/tmp/chars` に落としてあるものを返す（`tools/sprites/chars.py`）。
 */
import { chromium } from "playwright-core";
import { WebSocketServer } from "ws";
import { existsSync, readFileSync } from "fs";
import { createServer } from "http";
import { createServer as createTls } from "https";

const K = "0123456789abcdef0123456789abcdef";
const PORT = Number(process.env.PORT || 4142);
const WSPORT = Number(process.env.WSPORT || 4143);
const ROOT = process.env.WEBX || "/tmp/webx";

/** 本番の返りから、名前だけ作り物にした名簿を作る。 */
const real = JSON.parse(readFileSync("/tmp/ch.json", "utf8")).characters;
/** 絵と背景ありの両方を持っている人を主役にする（片方しか無い人だと弱い） */
const star = real.find((c) => c.plain?.sizes?.["640"] && c.scene) ?? real[0];
const roster = real.map((c, i) => ({
  id: c.id,
  emoji: c.emoji,
  channelName: c === star ? "@テスト太郎" : `@tester${i}`,
  aliases: c === star ? ["てすとたろう"] : [],
  plain: c.plain,
  scene: c.scene,
}));

/* 静的に配る。Expo の書き出しをそのまま出す */
const mime = { html: "text/html", js: "application/javascript", css: "text/css",
  json: "application/json", png: "image/png", webp: "image/webp", svg: "image/svg+xml",
  jpg: "image/jpeg", ttf: "font/ttf", woff2: "font/woff2" };
const http = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/alertbox" || p === "/") p = "/alertbox/index.html";
  const f = `${ROOT}${p}`;
  if (!existsSync(f)) { res.writeHead(404); return res.end("no"); }
  res.writeHead(200, { "content-type": mime[f.split(".").pop()] || "text/plain" });
  res.end(readFileSync(f));
}).listen(PORT);

/* Doneru のふりをする WebSocket。**繋がったら1件だけ送る。**
   **`wss://` でないと繋がらない。** `getAlertboxWss` が `wss://` で
   始まらない返りを断るため（そういう作りにしてある）。この箱の中だけの
   自己署名で立てて、ブラウザ側は `ignoreHTTPSErrors` で通す。
     openssl req -x509 -newkey rsa:2048 -keyout /tmp/wskey.pem \
       -out /tmp/wscert.pem -days 2 -nodes -subj "/CN=127.0.0.1" \
       -addext "subjectAltName=IP:127.0.0.1" */
const tls = createTls({
  key: readFileSync("/tmp/wskey.pem"), cert: readFileSync("/tmp/wscert.pem"),
}).listen(WSPORT);
const wss = new WebSocketServer({ server: tls });
let sent = false;
wss.on("connection", (s) => {
  console.log("つながった → 投げ銭を1件流します");
  setTimeout(() => {
    s.send(JSON.stringify({
      id: "test-1", type: "donation", amount: 1000, assetID: null,
      message: "旅、気をつけてね。ストックホルムの写真たのしみ。",
      messageType: 1, nickname: "@テスト太郎", test: false,
    }));
    sent = true;
  }, 1200);
});

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox", "--ignore-certificate-errors"],
});
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, ignoreHTTPSErrors: true });
const seen = [];
await ctx.route(/\/island-api\/alertbox\/[0-9a-f]{32}\/characters/, (r) => {
  seen.push("名簿");
  r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ characters: roster }) });
});
await ctx.route(/\/island-api\/alertbox\/[0-9a-f]{32}\/wss/, (r) => {
  seen.push("wss");
  r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ wss: `wss://127.0.0.1:${WSPORT}/x` }) });
});
/* 置き場の絵。落としてあるものを1枚ずつ返す（1枚に潰さない）。
   縮める前のもの（`-full.png`）は落としていないので、640 で代える。

   `BREAK=1` を付けると**わざと 404 を返す。** 絵が取れない日に、
   アラートそのものが止まらないかを見るため（止まると、そのあとの
   投げ銭も全部詰まって、配信のあいだ二度と出なくなる）。 */
const BREAK = process.env.BREAK === "1";
await ctx.route(/firebasestorage\.googleapis\.com/, (r) => {
  if (BREAK) return r.fulfill({ status: 404, body: "" });
  const m = /\/o\/([^?]+)/.exec(r.request().url());
  const name = m ? decodeURIComponent(m[1]).replaceAll("/", "__") : "";
  const local = `/tmp/chars/${name}`;
  const alt = local.replace(/-full\.\w+$/, "-640.webp");
  const use = existsSync(local) ? local : existsSync(alt) ? alt : null;
  r.fulfill(use ? { path: use } : { status: 404, body: "" });
});
/* 貯金箱まわり。**アラートの絵とは関係ないので固定値。**
   ただし**形は合わせる。** 目標の表と投げ銭の合計を同じ形で返すと
   `Number(data.amount)` が NaN になって「初期化に失敗しました」が出る
   （それだけで面が赤くなって、絵が出たかどうかを見られなくなる）。 */
await ctx.route(/doneruamount/i, (r) =>
  r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ amount: 12000 }) }));
await ctx.route(/script\.google\.com|macros|undefined\?table=/, (r) =>
  r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, table: "Goals",
    data: { id: "x", startAmount: 0, superChatAmount: 0, doneruGoalKey: "k", targetAmount: 100000, label: "テスト" } }) }));
await ctx.route(/cloudfront\.net/, (r) => r.fulfill({ path: "/home/user/live-streaming/site/public/og.png" }));

const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(String(e).slice(0, 100)));
const logs = [];
p.on("console", (m) => { const t = m.text(); if (/Doneru|WebSocket|alertbox/i.test(t)) { const m = /"event":"([^"]+)"/.exec(t); logs.push(m ? m[1] : t.slice(0, 90)); } });
await p.goto(`http://127.0.0.1:${PORT}/alertbox?k=${K}&source=doneru`, { waitUntil: "networkidle" });

/* **出ているあいだに撮る。** アラートは数秒で消えるので、待ちを長くすると
   「絵が出なかった」と読んでしまう（消えたあとを見ているだけ）。
   0.4 秒ごとに覗いて、いちばん中身のあったところで撮る。 */
let best = { n: 0, at: 0 };
for (let i = 0; i < 60; i++) {
  const st = await p.evaluate(() => ({
    n: document.querySelectorAll("img").length,
    t: document.body.innerText.length,
    ストックホルム: document.body.innerText.includes("ストックホルム"),
  }));
  if (st.n > best.n || st.ストックホルム) {
    best = { n: st.n, at: i * 0.4, 字数: st.t, 本文: st.ストックホルム };
    await p.screenshot({ path: "/tmp/shots/alertbox-donation.png" });
  }
  if (st.ストックホルム && st.n > 0) break;
  await p.waitForTimeout(400);
}
console.log("いちばん出ていたところ:", JSON.stringify(best));

const r = await p.evaluate(() => {
  const imgs = [...document.querySelectorAll("img")].map((i) => ({
    src: (i.currentSrc || i.src).slice(0, 70), 出ている: i.naturalWidth > 0, w: i.naturalWidth,
  }));
  return { 字: document.body.innerText.replace(/\n+/g, " / ").slice(0, 160), 絵: imgs };
});
console.log("叩いた口:", JSON.stringify(seen));
console.log("流した:", sent);
console.log("出ている字:", r.字);
console.log("出ている絵:", JSON.stringify(r.絵, null, 1));
if (errs.length) console.log("JSエラー:", errs.slice(0, 3));
console.log("つなぎのログ:", logs.join(" → "));
await p.screenshot({ path: "/tmp/shots/alertbox-donation.png" });
await b.close();
wss.close();
tls.close();
http.close();
