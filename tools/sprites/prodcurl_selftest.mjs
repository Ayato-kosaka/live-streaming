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
 * **失うのは「route に繋がっているか」。** `resourceType()==="document"` を
 * 渡しているか、溜めた先を表に出しているかは、ここでは見えない。そこは
 * `node tools/sprites/prod.mjs` を本番に当てて見る（`/nordic/photos` を撮って
 * h1 が1つ出ること）。**ここが見るのは、腐ると「0件」になる側**だけ。
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
 *
 * **足は3本とも別々に折る**（`docs/island-standards.md` §15 の
 * 「対照は、足の数だけ用意する」）。`nofollow` は追うのを外す足、
 * `nothin` は小ささの見張りを外す足、`allthin` は小ささを**面以外にも**
 * 鳴らす足（うるさくして誰も読まなくなる側の壊れ）。
 */
import { createServer } from "node:http";

import { fetchProd, judge, THIN_BYTES } from "./prod.mjs";

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

const srv = createServer((req, res) => {
  if (req.url === "/nordic/photos") {
    res.writeHead(301, { Location: "/cards", "Content-Type": "text/html" });
    return res.end(STUB);
  }
  if (req.url === "/cards") {
    res.writeHead(200, { "Content-Type": "text/html" });
    return res.end(PAGE);
  }
  if (req.url === "/empty") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end(""); }
  if (req.url === "/tiny.css") { res.writeHead(200, { "Content-Type": "text/css" }); return res.end("body{}"); }
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

/* ------------------------------------------------------------------ まとめ -- */

srv.close();
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
