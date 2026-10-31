/**
 * **スマホ（幅390）で最初の1画面が出るまでに、島が何バイト運ばせているか**を、
 * 面ぜんぶぶん測って表にして、上限を超えた面があれば赤くする。
 *
 *   tools/build.sh 3202
 *   python3 -m http.server 4202 --directory site/.next-3202 &
 *   SPORT=4202 DIST=site/.next-3202 node tools/sprites/firstload.mjs
 *
 * 終了コード: 0＝通った / 1＝上限を超えた面が在った / 2＝数えるものが無い
 * （`docs/island-standards.md` §15 の決め）。
 *
 * ## 何を「最初の1画面」と呼んでいるか
 *
 * **一度も送らずに（スクロールせずに）、読み込みが静まるまでに届いたもの。**
 * 畳みの中の `loading="lazy"` も、画面の下にある絵も、ここには入らない——
 * **入らないのが正しい。** 送って初めて要求されるものは、最初の1画面の代金では
 * ない（`CLAUDE.md`「畳んだ中の絵を数えない」）。
 *
 * 併せて FCP（最初に字か絵が出た時点）までに**届き終わっていた**ぶんも出すが、
 * **判定には使わない。** あちらは時刻の引き算なので、箱が混んでいると動く
 * （`CLAUDE.md`「描画の速さを、壁の時計で測らない」）。
 * 判定に使う「静まるまで」は**届いたファイルの集合**なので、混み具合で動かない。
 *
 * ## 判定するのは、島が自分で配るぶんだけ
 *
 * 住人の絵（lh3）や北欧の写真（upload.wikimedia）は、この箱のブラウザから
 * 届かないので `route.mjs` の `offline()` が手元の絵に差し替えている。
 * **差し替えた絵のバイト数は本番のバイト数ではない**ので、合計には入れず
 * 「外部 N件」として件数だけ出す。本番で何バイトかは、ここでは測れない
 * （`docs/island-standards.md` §13「測るために作った仕掛けが、測る対象を変える」）。
 *
 * **`/island-api/…` も同じ扱い。** あれは Hosting が配る静的なファイルではなく
 * Functions の口で、`offline()` は手元に落とした**元の絵**をそのまま返す。
 * 実測で、`plain-128.webp` は本番が **11,572B**（curl、2026-10-14）に対して
 * 手元の差し替えは **59,480B**。5倍ちがう。**この差を合計に混ぜると、
 * 島の面が「画像で重い」ように見えて、直す順番を間違える。**
 * だから口ごしのぶんは「口 N件」として件数だけ出す。
 * **件数は出す**——上に40枚並べた日に、表から消えてしまわないように。
 *
 * ## 圧したあとで数える
 *
 * 書き出したものは `python3 -m http.server` が**そのまま**配るが、本番の
 * Firebase Hosting は字のファイルを gzip して配る。生のバイト数で並べると
 * JS が3倍に見え、絵が相対的に安く見えて、**直す順番を間違える。**
 * だから字のもの（html / js / css / json / svg / txt）は gzip（level 6、
 * 決め打ちなので何度測っても同じ）したあとの大きさで数える。絵と書体はそのまま。
 *
 * ## 対照（`docs/island-standards.md` §15）
 *
 * 判定の足は3本ある。**本物の面を1枚も測る前に、3本とも自分で折ってみる**
 * （`drill()`。数ミリ秒）。1本でも折れなければ、数字を出さずに 2 で落ちる。
 *
 *   1. 数え方      … 重い面を作って渡したら 1 を返すか／軽いものに 0 を返すか
 *   2. 分母        … 面が0枚のときに 0 ではなく 2 を返すか
 *   3. 圧の数え方  … 字のものは圧してから、絵はそのまま数えているか
 *
 * 端から端まで（ブラウザ込み）の対照は `BREAK=` で当てる:
 *
 *   BREAK=heavy  … 面ぜんぶの `<head>` に、圧しても縮まない 300KB を1本差し込む。
 *                  **全面が上限を超えて 1 で落ちるのが正しい**
 *   BREAK=nopage … 面の一覧を空にする。**2 で落ちるのが正しい**
 *   BREAK=nofcp  … FCP の時刻を拾わない。**参考値が「取れず」になり、
 *                  それでも判定（静まるまで）は出るのが正しい**
 *
 * ## 配り先が、この書き出しを配っているかを先に見る（2026-10-14）
 *
 * **1回これで嘘の数字を出した。** `python3 -m http.server 4203` が
 * `Address already in use` で死んでいて、同じ番号には**別の担当のサーバ**が
 * 居た。`curl` は 200 を返すし、面も開けるし、表も出る——**中身が別の枝の
 * ビルド**だというだけ。しかも手元の `DIST` にそのファイルが無いので、
 * 圧したあとの大きさを出せず、**生のバイト数をそのまま「圧後」として
 * 並べた**（JS が 297KB → 1,024KB に化けた）。
 *
 * 止め方は2つ。どちらも**数字を1つも出す前に**見る。
 *
 *   1. `DIST/index.html` と、配り先の `/index.html` を**バイトで突き合わせる**
 *   2. 島が自分で配ったはずの1件ずつについて、**`DIST` の中に実体が在るか**。
 *      1件でも無ければ 2 で落ちる（`docs/island-standards.md` §15
 *      「測れなかったものを 0 に混ぜない」）
 *
 * ## 上限
 *
 * `MAX=` で差し替えられる。既定の根拠は下の `MAX_DEFAULT` の隣に、
 * **測った日と実測つきで**書いてある（`docs/island-standards.md` §15）。
 */
import { gzipSync } from "node:zlib";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
import { PAGES, SKIP, DIST, checkAgainstSitemap } from "./islepages.mjs";
import { servedForms } from "./served.mjs";

const SPORT = process.env.SPORT || "4321";
const BASE = `http://127.0.0.1:${SPORT}`;
const BREAK = process.env.BREAK || "";
const OUT = process.env.OUT || "";
const ONLY = process.env.ONLY || "";
/** 同時に開く面の数。バイト数は混み具合で動かないので、並べて測ってよい */
const LANES = Number(process.env.LANES || 3);

/**
 * 1面あたりの上限（圧したあと、島が自分で配るぶん。**書体を除く**）。
 *
 * 書体を外しているのは、あれが**別の担当の持ち物**だから（2026-10-14 時点）。
 * 混ぜると、こちらが1バイトも触っていない日に、向こうの増減で赤くも緑にも
 * なる。**どちらが動かしたか分からない関門は、関門ではない。**
 * 書体のぶんは表に別の列で出す（見なくするのではなく、判定から外すだけ）。
 *
 * ## 実測（2026-10-15。`/goods/stickers` の升目を小さい写しに替えたあと）
 *
 * **前と後を同じ日に、同じ道具で、同じ147面ぶん測った。**（前＝master
 * `841ae484` を別に書き出して配ったもの。前の日の表を引き写さない——
 * 面の数が違う表を並べると、合計が何で動いたか読めなくなる）
 *
 * | | 前 | 後 |
 * | --- | ---: | ---: |
 * | いちばん重い面 | 903.3KB（`/goods/stickers`） | **742.7KB**（`/`） |
 * | 中央 | 344.4KB | **345.3KB** |
 * | いちばん軽い面 | 245.9KB（`/privacy`） | **246.8KB**（同じ） |
 * | 147面の合計 | 54,795.0KB | **54,424.9KB** |
 *
 * 後の重い側3面は 742.7（`/`）/ 664.8（`/atlas`）/ 636.8
 * （`/island/caucasus`）KB。その下は 530〜614KB の島の面が並ぶ——
 * **4位から下の並びは回ごとに入れ替わる**（遅れて取りに行く絵が、静まる前に
 * 来る回と来ない回がある。`/island/middle-east` で 560.7 と 613.6 が出た）。
 *
 * **いちばん重い面が替わった。** `/goods/stickers` は 903.3 → **469.5KB**
 * （升目が 40px のマスに長辺480の絵を13枚出していた。その13枚で
 * 623.8 → 130.8KB、面の絵ぜんぶで 632.2 → 197.4KB。
 * `tools/goods/stickerthumb.py` が長辺160の写しを焼く）。
 *
 * 合計の減りが 370.1KB で、1面ぶんの減り（433.8KB）より小さいのは、
 * **全147面が +0.9KB ずつ増えて見えている**から。中身は増えていない——
 * 共有の塊は**生で 28バイト小さく、圧すと 1,015バイト大きい**（モジュールの
 * 番号が振り直されて圧縮の効きが変わっただけ）。絵は1バイトも動いていない。
 *
 * **上限は 810KB。** いまいちばん重い面（742.7KB）の 9.1% 上。
 * 余白を取るのは、面に絵を1枚足した日や焼き込みが数KB伸びた日で
 * 赤くしないため。**1割では済まない増え方をしたら、それは赤でよい。**
 *
 * 測りのブレは ±1KB 弱ある（`/icon.svg` 0.6KB が、静まる前に来る回と
 * 来ない回がある）。9% の余白はそれを飲み込む。
 *
 * **直したら、ここを下げる。** 上限を据え置くと、1面を半分にした翌日から
 * 「増やしてよい量」がそのぶん増える。重い面を軽くした回は、必ず
 * **147面ぜんぶ測り直して**新しいいちばん重い面に線を引き直す
 * （この回がそれ。980 → 810）。
 *
 * **これは「ここまでは軽い」ではなく「ここから先は増やさせない」の線。**
 * 742KB もまだ重い。`/` の 310.2KB は絵で、いちばん大きいのが島の
 * あやと（58.2KB）と粘土のあやと（43.3KB）——**どちらも面に出る実寸で
 * 焼いてある**ので、ここから先は枚数を減らすか、畳むかの話になる。
 */
const MAX_DEFAULT = 810 * 1024;
const MAX = Number(process.env.MAX || MAX_DEFAULT);

/** 字のものは gzip してから数える。絵と書体はそのまま */
const TEXTY = /(^text\/)|javascript|json|\+xml|^image\/svg|^application\/xml/;

const kb = (n) => (n / 1024).toFixed(1);

/* ------------------------------------------------------------- 数える側 -- */

/**
 * 1件ぶんの「本番でだいたい運ぶ大きさ」。
 *
 * @param {{mime:string, wire:number, body:Buffer|null}} r
 * @returns {number}
 */
export function shipped(r) {
  if (r.body && TEXTY.test(r.mime || "")) return gzipSync(r.body, { level: 6 }).length;
  return r.wire;
}

/** 種類の札。CDP の type を、読む人の言葉に寄せる */
export function kindOf(type, mime, url) {
  if (/^image\/svg/.test(mime || "") || /\.svg(\?|$)/.test(url || "")) return "SVG";
  switch (type) {
    case "Document": return "HTML";
    case "Stylesheet": return "CSS";
    case "Script": return "JS";
    case "Image": return "画像";
    case "Font": return "書体";
    case "Fetch": case "XHR": return "データ";
    default: return "その他";
  }
}

/**
 * 面1枚の判定。**ここだけで合否が決まる**ので、対照はここを折る。
 *
 * @param {{path:string, own:number}[]} rows 面ごとの「島が自分で配ったぶん（圧後）」
 * @param {number} max 上限
 * @returns {{code:number, over:{path:string,own:number}[], why:string}}
 */
export function judge(rows, max) {
  if (!rows.length) return { code: 2, over: [], why: "測れた面が0枚（数えるものが無い）" };
  const over = rows.filter((r) => r.own > max).sort((a, b) => b.own - a.own);
  return { code: over.length ? 1 : 0, over, why: "" };
}

/* --------------------------------------------------------------- 対照 ---- */

/**
 * **本物の面を1枚も測る前に、判定の足を1本ずつ折る。**
 * 折れなければ、数字を1つも出さずに 2 で落ちる。
 */
function drill() {
  const ng = [];
  const want = (label, got, exp) => { if (String(got) !== String(exp)) ng.push(`${label}: 出た=${got} ほしい=${exp}`); };

  // 足1: 数え方。上限を超えた面を渡したら 1、超えていなければ 0
  want("重い面を渡したら 1", judge([{ path: "/a", own: MAX + 1 }], MAX).code, 1);
  want("軽い面だけなら 0", judge([{ path: "/a", own: MAX - 1 }], MAX).code, 0);
  want("超えた面が並ぶ", judge([{ path: "/a", own: MAX + 9 }, { path: "/b", own: 1 }], MAX).over.length, 1);
  // ちょうど上限は通す（境目で振らせない）
  want("ちょうど上限は通る", judge([{ path: "/a", own: MAX }], MAX).code, 0);

  // 足2: 分母。0枚なら 0 ではなく 2
  want("0枚なら 2", judge([], MAX).code, 2);

  // 足3: 圧の数え方。字は縮み、絵はそのまま
  const text = Buffer.from("あやと島".repeat(4000), "utf8");
  const gz = shipped({ mime: "text/html", wire: text.length, body: text });
  want("字は圧してから数える", gz < text.length / 2, "true");
  // 既に圧してある（ランダムな）バイト列は縮まない。絵と書体はそもそも圧さない
  const bin = Buffer.alloc(40000);
  for (let i = 0; i < bin.length; i++) bin[i] = (i * 2654435761) & 0xff;
  want("絵は圧さずそのまま", shipped({ mime: "image/webp", wire: bin.length, body: bin }), bin.length);
  want("中身が無ければ届いたバイトで数える", shipped({ mime: "text/css", wire: 123, body: null }), 123);

  // 足3の裏: SVG は image/* だが字なので圧す
  const svg = Buffer.from(`<svg>${"<path d='M0 0L1 1'/>".repeat(2000)}</svg>`, "utf8");
  want("SVG は圧す", shipped({ mime: "image/svg+xml", wire: svg.length, body: svg }) < svg.length / 2, "true");
  want("SVG の札", kindOf("Image", "image/svg+xml", "/a.svg"), "SVG");
  want("JS の札", kindOf("Script", "text/javascript", "/a.js"), "JS");

  if (ng.length) {
    console.error("::error::firstload.mjs の対照が外れました。本物の面は1枚も測っていません");
    for (const n of ng) console.error("  - " + n);
    return false;
  }
  console.log(`対照 ok（判定の足3本を折って、3本とも落ちた）／上限 ${kb(MAX)}KB`);
  return true;
}

/* ------------------------------------------------------------- 測る側 ---- */

/**
 * 圧しても縮まない詰め物（`BREAK=heavy` 用。300KB）。
 *
 * **1度ここで外した。** はじめは `(i * 2654435761 + (i >> 3)) & 0xff` で
 * 埋めていたが、256 で丸めると周期が短くなるので、gzip が 300KB を
 * **5KB** まで潰した。詰め物が効かないと、対照は「重くしたのに緑」になる
 * ——**対照のほうが落ちていた。** いまは xorshift32 で散らして、
 * 圧しても 290KB 以上残ることをここで数える（残らなければ投げる）。
 */
const BALLAST = (() => {
  const b = Buffer.alloc(300 * 1024);
  let x = 0x9e3779b9;
  for (let i = 0; i < b.length; i++) {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    b[i] = x & 0xff;
  }
  // base64 にするのは、`text/javascript` として配るため（字でないと受け取らない）
  const text = `/*${b.toString("base64")}*/`;
  const after = gzipSync(Buffer.from(text, "utf8"), { level: 6 }).length;
  if (after < 200 * 1024) {
    throw new Error(`firstload.mjs: 詰め物が圧して ${after}B まで縮みました。対照になりません`);
  }
  return text;
})();

/** `DIST` の中に実体が無かったもの。1件でもあれば数字を出さずに落ちる */
const MISSING = new Map();

/** 書き出したものの中の実体を引く（gzip を計算するため） */
const DISK = new Map();
function onDisk(pathname) {
  /* `BREAK=heavy` が差し込む詰め物は、わざと置いたものなので手元に在る扱い。
     ここを通さないと、対照が「上限を超えた（1）」ではなく
     「手元に無い（2）」で落ちて、**判定の足を折ったことにならない** */
  if (pathname === "/__ballast.js") return Buffer.from(BALLAST, "utf8");
  if (DISK.has(pathname)) return DISK.get(pathname);
  let buf = null;
  for (const cand of [pathname, pathname.replace(/\/$/, "") + ".html", (pathname.replace(/\/$/, "") || "") + "/index.html"]) {
    const f = join(DIST, cand.replace(/^\//, ""));
    try { if (existsSync(f)) { buf = readFileSync(f); break; } } catch { /* 読めないものは諦める */ }
  }
  DISK.set(pathname, buf);
  return buf;
}

/** 配られている綴りを、ブラウザを使わずに1つに決める（`goto` を2回打たないため） */
async function resolveForm(path) {
  for (const form of servedForms(path)) {
    let res;
    try { res = await fetch(BASE + form); } catch { continue; }
    if (!res.ok) continue;
    const body = await res.text();
    if (/^<!DOCTYPE html>|<html/i.test(body) && !/Directory listing for/.test(body)) return form;
  }
  return null;
}

async function measure(browser, path, form) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await offline(ctx);
  if (BREAK === "heavy") {
    // **あとから登録した route が先に効く**（`CLAUDE.md`）。面の HTML に
    // 読み込みを止める 300KB を1本差し込んで、全面を上限の向こうへ押しやる
    await ctx.route("**/__ballast.js", (r) =>
      r.fulfill({ status: 200, contentType: "text/javascript", body: BALLAST }));
    await ctx.route((u) => u.pathname === form || u.pathname === "/", async (r) => {
      const res = await r.fetch();
      const html = (await res.text()).replace(/<head>/i, '<head><script src="/__ballast.js"></script>');
      r.fulfill({ response: res, body: html, headers: { ...res.headers(), "content-length": String(Buffer.byteLength(html)) } });
    });
  }

  const page = await ctx.newPage();
  await page.addInitScript(() => { try { localStorage.setItem("ayato-island-arrived", "1"); } catch { /* 伏せられている */ } });

  const cdp = await ctx.newCDPSession(page);
  const req = new Map();
  let fcp = null;
  let last = 0;
  cdp.on("Network.requestWillBeSent", (e) => {
    if (!req.has(e.requestId)) req.set(e.requestId, { url: e.request.url, type: e.type || "Other", wire: 0, mime: "" });
  });
  cdp.on("Network.responseReceived", (e) => {
    const r = req.get(e.requestId);
    if (r) { r.type = e.type || r.type; r.mime = e.response.mimeType || ""; r.url = e.response.url || r.url; }
  });
  cdp.on("Network.loadingFinished", (e) => {
    const r = req.get(e.requestId);
    if (r) { r.wire = e.encodedDataLength || 0; r.done = e.timestamp; }
    last = Date.now();
  });
  cdp.on("Network.loadingFailed", (e) => { req.delete(e.requestId); last = Date.now(); });
  cdp.on("Page.lifecycleEvent", (e) => {
    if (BREAK === "nofcp") return;
    if (e.name === "firstContentfulPaint" && fcp === null) fcp = e.timestamp;
  });
  await cdp.send("Network.enable");
  await cdp.send("Page.enable");
  await cdp.send("Page.setLifecycleEventsEnabled", { enabled: true });

  let opened = true;
  try {
    await page.goto(BASE + form, { waitUntil: "load", timeout: 45000 });
  } catch { opened = false; }

  // **送らない。** 送ってから測ると、畳みの中と画面の下が代金に混ざる
  last = Date.now();
  const until = Date.now() + 8000;
  while (Date.now() < until) {
    await page.waitForTimeout(150);
    if (Date.now() - last > 900) break;
  }

  const rows = [];
  for (const r of req.values()) {
    let u;
    try { u = new URL(r.url); } catch { continue; }
    if (u.protocol === "data:" || u.protocol === "blob:") continue;
    /* 口ごし（`/island-api/…`）は、島が配っているものではない。
       手元の差し替えは本番の5倍あるので、バイト数は数えずに件数だけ数える */
    const viaApi = u.pathname.startsWith("/island-api/");
    const own = !viaApi && (u.hostname === "127.0.0.1" || u.hostname === "localhost");
    const body = own ? onDisk(decodeURIComponent(u.pathname)) : null;
    /* **`DIST` に無いものは、圧したあとの大きさを出せない。**
       黙って生のバイト数を「圧後」に混ぜると、配り先を間違えた回が
       いちばんもっともらしい表になって出てくる（この上の但し書き） */
    if (own && !body) MISSING.set(u.pathname, (MISSING.get(u.pathname) || 0) + 1);
    rows.push({
      url: u.pathname, own, kind: kindOf(r.type, r.mime, u.pathname),
      wire: r.wire, ship: shipped({ mime: r.mime, wire: r.wire, body }),
      beforeFcp: fcp !== null && r.done !== undefined && r.done <= fcp,
    });
  }
  await ctx.close();

  const mine = rows.filter((r) => r.own);
  const api = rows.filter((r) => !r.own && r.url.startsWith("/island-api/")).length;
  const by = {};
  for (const r of mine) by[r.kind] = (by[r.kind] || 0) + r.ship;
  const noFont = mine.filter((r) => r.kind !== "書体");
  return {
    path, opened,
    own: noFont.reduce((a, r) => a + r.ship, 0),
    font: mine.reduce((a, r) => a + (r.kind === "書体" ? r.ship : 0), 0),
    ownWire: noFont.reduce((a, r) => a + r.wire, 0),
    fcpOwn: fcp === null ? null : noFont.filter((r) => r.beforeFcp).reduce((a, r) => a + r.ship, 0),
    api,
    ext: rows.length - mine.length - api,
    files: mine.length,
    by,
    top: noFont.sort((a, b) => b.ship - a.ship).slice(0, 6).map((r) => ({ url: r.url, kind: r.kind, ship: r.ship })),
    all: noFont.map((r) => ({ url: r.url, kind: r.kind, ship: r.ship, wire: r.wire })),
  };
}

/* ------------------------------------------------------------- 回す側 ---- */

if (!drill()) process.exit(2);

for (const s of SKIP) console.log(`測らない面: ${s.path} … ${s.why}`);

const sm = checkAgainstSitemap();
if (!sm.ok) {
  console.error(`::error::面の一覧が sitemap より少ない（${sm.why || sm.missing.join(", ")}）。数字は出しません`);
  process.exit(2);
}

let pages = BREAK === "nopage" ? [] : PAGES;
if (ONLY) pages = pages.filter((p) => ONLY.split(",").some((o) => p === o.replace(/\.html$/, "")));
console.log(`見る面 ${pages.length}枚（書き出し ${DIST} / 配り先 ${BASE} / 幅390・dpr2・送らない）`);
if (!pages.length) {
  console.error("::error::測る面が0枚です（DIST と SPORT を両方渡していますか）");
  process.exit(2);
}

/* **配り先が、この書き出しを配っているか。** 同じ番号に別の担当のサーバが
   居ると、面は開けて表も出るが、測っているものが別の枝になる（上の但し書き）。
   突き合わせるのは字ではなくバイト。`index.html` は焼いた時刻が入るので、
   同じ枝の別のビルドとも一致しない——**それでよい。** 見たいのは
   「いま配られているものが、いま `DIST` に在るものか」だけ */
{
  let wire = null;
  try {
    const r = await fetch(`${BASE}/index.html`);
    if (r.ok) wire = Buffer.from(await r.arrayBuffer());
  } catch { /* 下で落とす */ }
  let disk = null;
  try { disk = readFileSync(join(DIST, "index.html")); } catch { /* 下で落とす */ }
  if (!wire || !disk || !disk.equals(wire)) {
    console.error(
      `::error::配り先（${BASE}）が ${DIST} を配っていません。` +
      `配り先 ${wire ? wire.length + "B" : "取れず"} / 手元 ${disk ? disk.length + "B" : "取れず"}。` +
      "番号が他の人と重なっていないか見てください（`python3 -m http.server` は使われている番号だと黙って死にます）",
    );
    process.exit(2);
  }
}

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

const forms = new Map();
const unopened = [];
for (const p of pages) {
  const f = await resolveForm(p);
  if (f) forms.set(p, f); else unopened.push(p);
}

const rows = [];
const queue = [...forms.entries()];
await Promise.all(Array.from({ length: Math.min(LANES, queue.length) }, async () => {
  for (;;) {
    const item = queue.shift();
    if (!item) return;
    const [p, f] = item;
    try { rows.push(await measure(browser, p, f)); }
    catch (e) { unopened.push(`${p}（${String(e).slice(0, 70)}）`); }
  }
}));
await browser.close();

rows.sort((a, b) => b.own - a.own);
const KINDS = ["JS", "HTML", "CSS", "SVG", "画像", "データ", "その他"];
console.log("");
console.log(`判定する量（圧後・書体を除く）  ${"面".padEnd(32)} ${KINDS.map((k) => k.padStart(7)).join("")}   書体   FCPまで  口  外部`);
for (const r of rows) {
  const cells = KINDS.map((k) => (r.by[k] ? kb(r.by[k]) : "-").padStart(7)).join("");
  const flag = r.own > MAX ? " ←上限超" : "";
  console.log(
    `${kb(r.own).padStart(9)}KB  ${r.path.slice(0, 32).padEnd(32)} ${cells} ${kb(r.font).padStart(7)} ${(r.fcpOwn === null ? "取れず" : kb(r.fcpOwn) + "KB").padStart(9)} ${String(r.api).padStart(3)} ${String(r.ext).padStart(4)}${flag}`,
  );
}

const noFcp = rows.filter((r) => r.fcpOwn === null).length;
const sorted = [...rows].map((r) => r.own).sort((a, b) => a - b);
const med = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
console.log("");
console.log(
  `見た面 ${pages.length}枚 / 測れた面 ${rows.length}枚 / 開けなかった面 ${unopened.length}枚 / ` +
  `FCP が取れなかった面 ${noFcp}枚`,
);
console.log(`いちばん重い ${kb(sorted.at(-1) || 0)}KB / 中央 ${kb(med)}KB / いちばん軽い ${kb(sorted[0] || 0)}KB（圧前の合計で言うと いちばん重い ${kb(Math.max(0, ...rows.map((r) => r.ownWire)))}KB）`);
if (rows[0]) {
  console.log(`いちばん重い面（${rows[0].path}）の内訳:`);
  for (const t of rows[0].top) console.log(`   ${kb(t.ship).padStart(8)}KB  ${t.kind}  ${t.url}`);
}
if (OUT) { writeFileSync(OUT, JSON.stringify({ max: MAX, at: new Date().toISOString(), rows }, null, 1)); console.log(`書き出した: ${OUT}`); }

if (MISSING.size) {
  const n = [...MISSING.values()].reduce((a, v) => a + v, 0);
  console.error(
    `::error::島が配ったはずのものが ${MISSING.size} 種類（${n}件）、${DIST} の中にありません。` +
    "圧したあとの大きさを出せないので、数字は当てになりません:",
  );
  for (const [u, c] of [...MISSING].slice(0, 15)) console.error(`  - ${u}（${c}回）`);
  process.exit(2);
}

if (unopened.length) {
  console.error(`::error::開けなかった面が ${unopened.length}枚あります。出した数は当てになりません:`);
  for (const u of unopened.slice(0, 20)) console.error("  - " + u);
  process.exit(2);
}

const v = judge(rows.map((r) => ({ path: r.path, own: r.own })), MAX);
if (v.code === 2) { console.error(`::error::${v.why}`); process.exit(2); }
if (v.code === 1) {
  console.error(`::error::最初の1画面が ${kb(MAX)}KB を超えている面が ${v.over.length}枚あります`);
  for (const o of v.over) console.error(`  - ${o.path}  ${kb(o.own)}KB`);
  process.exit(1);
}
console.log(`上限 ${kb(MAX)}KB を超えた面はありません（${rows.length}面中 0枚）`);
