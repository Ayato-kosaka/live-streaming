/**
 * `prod.mjs` の**取り方と判定だけ**を、本番もブラウザも無しで確かめる。
 *
 *     node tools/sprites/prodcurl_selftest.mjs
 *
 * 終了コード 0=ぜんぶ通った / 1=落ちた / 2=数えるものが無い。
 *
 * ## なぜ要るか
 *
 * `viaCurl()` の curl に **`-L` が無かった。** 本番には Hosting の
 * リダイレクトが在る（`/nordic/photos` → 301 → `/cards`）ので、
 * **301 の本文21バイトを「その面の中身」として掴んでいた。**
 * 全面巡回はそれを読んで「h1 が0個」と赤を出す。**本番は無事**
 * （`-L` を付ければ 200 / 76,701B、`/cards` と md5 が一致する）。
 *
 * **測れていないものを、測れた顔で 0 として出す形**（#157 / #164）。
 * 道具の側に在るので、次に使う人も同じように踏む。だから毎 PR で見る。
 *
 * ## ブラウザを使わない理由と、そのぶん失うもの
 *
 * CI には `tools/sprites/node_modules` が無いので、`playwright-core` を
 * import した時点で見張りは import の行で死ぬ（`preclaim_selftest.mjs` と同じ）。
 * なので `prod.mjs` の側で `playwright-core` を**回すときに読む**ようにして、
 * ここからは `fetchProd()` と `judge()` だけを呼ぶ。
 *
 * ## route に繋がっているかも見る（2026-10-26）
 *
 * 前はここに「**失うのは route に繋がっているか**」と書いて、`viaCurl()` を
 * 見ていなかった。`resourceType() === "document"` を渡しているか、`judge()` の
 * 「たどった」「小さすぎ」をそれぞれの溜め先（`redirects()` / `thin()`）へ
 * 分けているかは、本体の等しさを全部ひっくり返しても緑のままだった
 * （`mutation_drill.py` で当てて分かった）。ひっくり返ると、**小さい css が
 * 「小さすぎ」に数えられて巡回が赤くなる**か、**21B の面が「たどった」に紛れて
 * だめに数えられない**（0件が合格に見える #157 の形）。
 *
 * ブラウザは要らない。`viaCurl(ctx)` が使うのは `ctx.route()` に渡す関数だけで、
 * その関数が触るのも `r.request().url()` / `resourceType()` と `fulfill` / `abort`
 * だけなので、**偽の ctx と偽の route** で足りる（5章）。
 *
 * 宛先は**本番の名前**（`live-streaming-d3cac.web.app`）にする。`PASS` に
 * 当たらない宛先は curl に渡る前に止められるので。curl には `http_proxy` で
 * **偽のサーバを proxy として**渡し、本番の名前の要求も 127.0.0.1 で受ける
 * （本番には出ない。受けた本数を数えて確かめる）。
 *
 * 見えないまま残るのは、本番の `/me` を撮って看板・顔・絵を判じるところ
 * （`prod.mjs` を直に起こしたときだけ走る）。そこは本番に当てて見る。
 *
 * ## 本番へは出ない。偽のサーバを自分で立てる
 *
 * この箱のブラウザは本番に届かないし、CI から本番を叩くと**向こうの都合で
 * 赤が出たり消えたりする**（`upload.wikimedia.org` の 429 と同じ形）。
 * なので 127.0.0.1 に本番と同じ形の応答を並べて、そこへ当てる。
 *
 * ## 守りを外すと落ちること（対照）
 *
 *     BREAK=nofollow node tools/sprites/prodcurl_selftest.mjs   # 1 で落ちる
 *     BREAK=nothin   node tools/sprites/prodcurl_selftest.mjs   # 1 で落ちる
 *     BREAK=allthin  node tools/sprites/prodcurl_selftest.mjs   # 1 で落ちる
 *     BREAK=alldoc   node tools/sprites/prodcurl_selftest.mjs   # 1 で落ちる（5章だけ）
 *     BREAK=allredir node tools/sprites/prodcurl_selftest.mjs   # 1 で落ちる（5章だけ）
 *
 * **足は別々に折る**（`docs/island-standards.md` §15 の
 * 「対照は、足の数だけ用意する」）。`nofollow` は追うのを外す足、
 * `nothin` は小ささの見張りを外す足、`allthin` は小ささを**面以外にも**
 * 鳴らす足（うるさくして誰も読まなくなる側の壊れ）。
 *
 * `alldoc` と `allredir` は 5章の足で、**守りを外した `prod.mjs` の写し**を
 * 使い捨ての置き場に書いて読む（本物のファイルは触らない）。`alldoc` は
 * `resourceType() === "document"` を外して何でも面として数える写し、`allredir` は
 * 「たどった」かどうかを見ずに全部を `redirects()` へ溜める写し。
 */
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { fetchProd, judge, THIN_BYTES } from "./prod.mjs";
import * as PROD from "./prod.mjs";

/* **偽のサーバへは proxy を通さない。** この箱は `https_proxy` を立てているので、
   通すと自分の中の 127.0.0.1 にすら届かないことがある。curl は環境変数を見る。 */
process.env.NO_PROXY = "127.0.0.1,localhost";
process.env.no_proxy = "127.0.0.1,localhost";

const BREAK = process.env.BREAK || "";

let OK = 0;
let BAD = 0;
/** 数えたものの総数。**1つも無ければ 2 で落ちる**（§15） */
let SEEN = 0;

function check(name, ok, got) {
  SEEN++;
  if (ok) { OK++; console.log(`  ok   ${name}`); }
  else { BAD++; console.log(`  NG   ${name}  ← ${got}`); }
}

/* ------------------------------------------------------- 偽の本番を立てる -- */

/** 本番の面と同じくらいの大きさ。いちばん小さい面（`/roulette`）が 35,738B */
const PAGE = `<!doctype html><html><body><h1>カード</h1>${"あ".repeat(20000)}</body></html>`;
/** Firebase Hosting が 301 で返す本文。**実測21バイト** */
const STUB = "Redirecting to /cards";

/** 本番の名前で頼まれた（proxy として受けた）要求。**本番に出ていない**ことの裏付け（5章） */
const PROXIED = [];

const srv = createServer((req, res) => {
  /* proxy として受けた要求は `http://本番の名前/…` の形で来る。道だけを見る */
  if (/^https?:/.test(req.url)) PROXIED.push(req.url);
  const path = new URL(req.url, "http://127.0.0.1").pathname;
  if (path === "/nordic/photos") {
    res.writeHead(301, { Location: "/cards", "Content-Type": "text/html" });
    return res.end(STUB);
  }
  if (path === "/cards") {
    res.writeHead(200, { "Content-Type": "text/html" });
    return res.end(PAGE);
  }
  /* 追わずに 200 で 21B を返す面（壊れた書き出しの姿）。5章で「小さすぎ」に溜まるか */
  if (path === "/thin") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end(STUB); }
  if (path === "/empty") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end(""); }
  if (path === "/tiny.css") { res.writeHead(200, { "Content-Type": "text/css" }); return res.end("body{}"); }
  res.writeHead(404); res.end("no");
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${srv.address().port}`;

/* ------------------------------------------------- 1. リダイレクトを追う -- */

console.log("1. リダイレクトを追う");
{
  /* `BREAK=nofollow` は**この直しを外した状態**そのもの（`-L` が無い） */
  const got = await fetchProd(`${BASE}/nordic/photos`, { follow: BREAK !== "nofollow" });
  check("追った先の中身が返る（21B の本文ではない）",
    got.body.length > 20000, `${got.body.length}B`);
  check("h1 が本文に在る", /<h1>/.test(String(got.body)), String(got.body).slice(0, 40));
  check("追った回数が返る", got.hops === 1, String(got.hops));
  check("行き着いた先が返る", got.final === `${BASE}/cards`, got.final);
}
{
  const direct = await fetchProd(`${BASE}/cards`);
  check("追っていない面は hops=0", direct.hops === 0, String(direct.hops));
  check("追っていない面の中身も返る", direct.body.length > 20000, `${direct.body.length}B`);
}

/* ------------------------------------------ 2. 追ったことが撮った人に届く -- */

console.log("2. 追ったことが撮った人に届く");
{
  const n = judge({ url: `${BASE}/nordic/photos`, hops: 1, final: `${BASE}/cards`,
    size: PAGE.length, doc: true });
  check("追ったら「たどった」が1件出る",
    n.length === 1 && n[0].kind === "たどった", JSON.stringify(n));
  check("どこからどこへ追ったかが字に出る",
    n[0]?.msg.includes("/nordic/photos") && n[0]?.msg.includes("/cards"), n[0]?.msg);
  const q = judge({ url: `${BASE}/cards`, hops: 0, final: `${BASE}/cards`, size: PAGE.length, doc: true });
  check("追っていなければ黙る", q.length === 0, JSON.stringify(q));
}

/* --------------------------------------------- 3. 小さすぎる本文が分かる -- */

console.log("3. 小さすぎる本文が分かる");
{
  /* `BREAK=nothin` は小ささの見張りを外した状態（境目を 0 にする）、
     `allthin` は「面かどうかの区別を外した」状態（小さい css まで鳴る） */
  const opt = BREAK === "nothin" ? { thinLimit: 0 } : {};
  const asDoc = (d) => (BREAK === "allthin" ? true : d);
  const doc = (size) => judge({ url: `${BASE}/nordic/photos`, size, doc: asDoc(true) }, opt);

  const stub = doc(STUB.length);
  check("21B の本文は「小さすぎ」と出る",
    stub.some((x) => x.kind === "小さすぎ"), JSON.stringify(stub));
  check("何バイトだったかが字に出る",
    stub[0]?.msg.includes("21B"), stub[0]?.msg);
  const zero = doc(0);
  check("空の応答も「小さすぎ」と出る", zero.some((x) => x.kind === "小さすぎ"), JSON.stringify(zero));

  /* **本当に小さい正しい面**を鳴らさない境目。本番130面の最小は
     `/roulette` の 35,738B なので、そこは必ず通る */
  check("本番の最小の面（35,738B）は鳴らない", doc(35738).length === 0, JSON.stringify(doc(35738)));
  check("境目のすぐ上は鳴らない", doc(THIN_BYTES).length === 0, JSON.stringify(doc(THIN_BYTES)));
  check("境目のすぐ下は鳴る", doc(THIN_BYTES - 1).length === 1, JSON.stringify(doc(THIN_BYTES - 1)));

  /* 小さい css や png は正しい。そこまで鳴らすと誰も読まない道具になる */
  const css = judge({ url: `${BASE}/tiny.css`, size: 6, doc: asDoc(false) }, opt);
  check("面でない小さい応答（css 6B）は鳴らない", css.length === 0, JSON.stringify(css));
}

/* ------------------------------------ 4. 取れなかったものを 0 に畳まない -- */

console.log("4. 取れなかったものは、掴んだことにしない");
{
  let threw = false;
  try { await fetchProd(`${BASE}/nowhere`); } catch { threw = true; }
  /* `-f` が効いていれば 404 は例外になり、route は「取れず」に数える。
     ここが静かに 200 になると、`no` の3バイトを面として配ることになる */
  check("404 は例外になる（本文を面として配らない）", threw, "落ちなかった");
}

/* ------------------------------------- 5. route に繋がっている（viaCurl） -- */

console.log("5. route に繋がっている（偽の ctx。本番の名前の要求も偽のサーバで受ける）");

/** `PASS` に当たる宛先。curl には偽のサーバを proxy として渡すので、本番には出ない */
const HOST = "http://live-streaming-d3cac.web.app";

/**
 * 守りを外した `prod.mjs` の写しを、使い捨ての置き場に書いて読む。**本物のファイルは触らない。**
 * `./asme.mjs` は本物を指すように書き換える（写しの隣には無いので）。
 */
const SCRATCH = [];
async function brokenProd(from, to) {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, "prod.mjs"), "utf8");
  const cut = src.replace(from, to);
  if (cut === src) throw new Error(`写せなかった（${from} が prod.mjs に無い）`);
  const dir = mkdtempSync(join(tmpdir(), "prodcurl-"));
  SCRATCH.push(dir);
  const file = join(dir, "prod.mjs");
  writeFileSync(file, cut.replace('"./asme.mjs"', JSON.stringify(pathToFileURL(join(here, "asme.mjs")).href)));
  return import(pathToFileURL(file).href);
}

/** `viaCurl()` が `ctx.route()` に渡した関数を、偽の route で1本ずつ呼ぶ */
async function hit(ctx, url, type) {
  const rec = { status: 0, body: null, contentType: "", aborted: false };
  await ctx.handler({
    request: () => ({ url: () => url, resourceType: () => type }),
    fulfill: async (o) => { rec.status = o.status; rec.body = o.body; rec.contentType = o.contentType; },
    abort: async () => { rec.aborted = true; },
  });
  return rec;
}

{
  const P = BREAK === "alldoc" ? await brokenProd(/r\.request\(\)\.resourceType\(\) [!=]== "document"/, "true")
    : BREAK === "allredir" ? await brokenProd(/n\.kind [!=]== "たどった"/, "true")
    : PROD;
  const keep = process.env.http_proxy;
  process.env.http_proxy = BASE;
  try {
    const ctx = { handler: null, async route(_pattern, h) { ctx.handler = h; } };
    await P.viaCurl(ctx);
    check("route に関数を1本渡す", typeof ctx.handler === "function", String(ctx.handler));

    const photos = await hit(ctx, `${HOST}/nordic/photos`, "document");
    check("面を追って、追った先の中身を 200 で流し込む",
      photos.status === 200 && photos.body?.length > 20000 && photos.contentType === "text/html",
      `${photos.status} ${photos.body?.length}B ${photos.contentType}`);
    await hit(ctx, `${HOST}/thin`, "document");
    const css = await hit(ctx, `${HOST}/tiny.css`, "stylesheet");
    check("css は種類を css にして流し込む", css.status === 200 && css.contentType === "text/css",
      `${css.status} ${css.contentType}`);

    const R = P.redirects(ctx);
    const T = P.thin(ctx);
    check("追った面だけが「たどった」に溜まる（元 → 行き着いた先）",
      R.size === 1 && R.get(`${HOST}/nordic/photos`) === `${HOST}/cards`, JSON.stringify([...R]));
    check("21B の面が「小さすぎ」に溜まる（何バイトだったかも）",
      T.get(`${HOST}/thin`) === STUB.length, JSON.stringify([...T]));
    check("面でない小さい css は「小さすぎ」に溜めない",
      !T.has(`${HOST}/tiny.css`), JSON.stringify([...T]));
    check("追って中身の大きい面は「小さすぎ」に溜めない",
      !T.has(`${HOST}/nordic/photos`) && T.size === 1, JSON.stringify([...T]));

    /* 通さない先は curl に渡す前に止め、宛先ごとに数える */
    const out = await hit(ctx, "http://example.invalid/a.png", "image");
    check("通さない先は止めて、宛先を数える",
      out.aborted && P.blocked(ctx).get("example.invalid") === 1, JSON.stringify([...P.blocked(ctx)]));
    const gone = await hit(ctx, `${HOST}/nowhere`, "document");
    check("取れなかった面は止めて「取れず」に数える（404 を面として配らない）",
      gone.aborted && gone.status === 0 && P.blocked(ctx).get("live-streaming-d3cac.web.app(取れず)") === 1,
      JSON.stringify([...P.blocked(ctx)]));
  } finally {
    if (keep === undefined) delete process.env.http_proxy;
    else process.env.http_proxy = keep;
  }
  /* 本番の名前で頼んだ5本（追った先を含む）が、全部ここで受けたものか */
  check("本番の名前の要求は、全部偽のサーバが受けた（本番に出ていない）",
    PROXIED.length === 5 && PROXIED.every((u) => u.startsWith(`${HOST}/`)), JSON.stringify(PROXIED));
}

/* ------------------------------------------------------------------ まとめ -- */

srv.close();
for (const d of SCRATCH) rmSync(d, { recursive: true, force: true });
console.log("");
if (SEEN === 0) {
  console.log("::error::数えるものが1つも無かった。");
  process.exit(2);
}
if (BAD) {
  console.log(`NG が ${BAD} 件（通ったのは ${OK} 件 / 見たのは ${SEEN} 件）。`);
  process.exit(1);
}
console.log(`${SEEN} 件ぜんぶ通った。`);
