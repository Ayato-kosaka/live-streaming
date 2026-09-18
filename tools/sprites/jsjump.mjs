/**
 * **画面が出た瞬間に、札が何px伸びるかを測る。**
 *
 *   node tools/sprites/jsjump.mjs                          # 本番の /nordic /now /nordic/day/*
 *   PAGES=/nordic ORIGIN=http://127.0.0.1:4960 node tools/sprites/jsjump.mjs
 *
 * 焼いた HTML には「まだ分からない」ときの字が入っていて（#143）、数が届くと
 * そこが入れ替わる。**入れ替わったときに背が伸びると、下にあるものが全部ずれる。**
 * 読み始めたところで画面が飛ぶので、これは字の嘘とは別の不具合。
 *
 * 測り方は #143 と同じで、**同じ面を JS 切り／JS 入りの2回開いて引き算する。**
 * 引くのは字だけでなく、要素1つずつの背も引く。
 *
 * ## `open()` を使わない理由
 *
 * `prod.mjs` の `open()` は **`js` を受け取らない**（`{ nochara, path }` だけ）。
 * `open(b, { js: false })` と書いても JS は入ったままで、**前後の差はいつも
 * 0.00px になる。** 何を測っても「直っている」と出る。2026-09-18 に1回やった。
 * だから context は自分で作って `javaScriptEnabled: false` を渡す。
 *
 * ## 切れている印
 *
 * Next は焼いた HTML の中のインライン script で `self.__next_f` に押し込む。
 * **JS が切れていれば、この箱は存在しない。** 毎回これを見て、
 * 「切った側に在る」「入れた側に無い」のどちらかが起きたら**数字を出さずに落ちる**
 * （終了コード 2）。印の取れない回の数字は嘘なので、出さない。
 *
 * 終了コード: 0=しきい値を超える跳ねなし / 1=跳ねあり / 2=印が取れない
 */
import { chromium } from "playwright-core";
import { ORIGIN as PROD, viaCurl } from "./prod.mjs";
import { existsSync, readFileSync } from "node:fs";

const ORIGIN = process.env.ORIGIN || PROD;
const LOCAL = !/^https:/.test(ORIGIN);
const PAGES = (process.env.PAGES || "/nordic,/now,/nordic/day/2026-09-18").split(",").filter(Boolean);
/** 跳ねとして数える下限(px)。にじみと丸めで 1px 前後は動く */
const MIN = Number(process.env.MIN || 4);
const WAIT = Number(process.env.WAIT || (LOCAL ? 4000 : 8000));
const TOP = Number(process.env.TOP || 12);
const W = Number(process.env.W || 390);
const H = Number(process.env.H || 844);

/* 本番の `/island-api/state`。**手元の書き出しを測るときは、これが要る。**
   居どころ（`current.place`）で字が変わる面があるので、口の返らない手元で
   測ると、本番と違う枝の背を測ることになる。`asme_trip.mjs` と同じ置き場。 */
const STATE = "/tmp/prodstate.json";

/** 要素1つずつの背を、DOM の形から作った鍵で拾う */
const PROBE = `(() => {
  const h = {};
  const t = {};
  const seen = {};
  for (const el of document.querySelectorAll("*")) {
    const cls = (el.getAttribute("class") || "").trim().split(/\\s+/).filter(Boolean).slice(0, 3).join(".");
    if (!cls) continue;
    const key = el.tagName.toLowerCase() + "." + cls;
    seen[key] = (seen[key] || 0) + 1;
    const k = seen[key] > 1 ? key + "#" + seen[key] : key;
    h[k] = Math.round(el.getBoundingClientRect().height * 100) / 100;
    t[k] = (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 34);
  }
  return {
    h, t,
    body: Math.round(document.body.scrollHeight * 100) / 100,
    // **切れている印。** Next のインライン script が動いたときだけ生える
    nextf: typeof self.__next_f !== "undefined",
    lines: (document.body.innerText || "").split("\\n").map((s) => s.trim()).filter(Boolean),
  };
})()`;

async function shot(b, path, js) {
  const ctx = await b.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 2,
    javaScriptEnabled: js,
  });
  if (!LOCAL) await viaCurl(ctx);
  else if (js && existsSync(STATE)) {
    const body = readFileSync(STATE, "utf8");
    await ctx.route(/\/island-api\/state(\?|$)/, (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body }));
  }
  const p = await ctx.newPage();
  /* 手元の書き出しは `python3 -m http.server` で配るので、`/nordic` のままだと
     ディレクトリの一覧に落ちる。`.html` を足す（`crawl.mjs` と同じ綴り直し）。 */
  const href = LOCAL && !/\.html$|\/$/.test(path) ? `${path}.html` : path;
  await p.goto(`${ORIGIN}${href}`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(WAIT);
  const r = await p.evaluate(PROBE);
  if (process.env.SHOT) {
    await p.screenshot({ path: `${process.env.SHOT}${path.replace(/\W+/g, "_")}-${js ? "on" : "off"}.png`, fullPage: process.env.FULL === "1" });
  }
  await ctx.close();
  return r;
}

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"],
});
let jump = 0;
let nomark = 0;
for (const path of PAGES) {
  const off = await shot(b, path, false);
  const on = await shot(b, path, true);
  console.log(`\n=== ${ORIGIN}${path} ===`);
  /* **印を先に出す。** 取れていない回は、下の数字を読ませない */
  const mark = !off.nextf && on.nextf;
  console.log(`印 __next_f: JS切=${off.nextf ? "在る ← だめ" : "無い"} / JS入=${on.nextf ? "在る" : "無い ← だめ"}`);
  const gone = off.lines.filter((s) => !on.lines.includes(s));
  console.log(`JS前にしか無い行 ${gone.length}件${gone.length ? ": " + gone.slice(0, 6).map((s) => `「${s.slice(0, 28)}」`).join(" ") : ""}`);
  if (!mark) {
    console.log("印が取れないので、この面の数字は出さない");
    nomark++;
    continue;
  }
  const keys = Object.keys(on.h).filter((k) => k in off.h);
  const rows = keys
    .map((k) => ({ k, a: off.h[k], b: on.h[k], d: Math.round((on.h[k] - off.h[k]) * 100) / 100 }))
    .filter((r) => Math.abs(r.d) >= MIN)
    .sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
  console.log(`body ${off.body} → ${on.body}  (${(on.body - off.body).toFixed(2)}px)`);
  if (!rows.length) console.log(`背の動いた要素なし（${MIN}px 未満）`);
  for (const r of rows.slice(0, TOP)) {
    console.log(`  ${r.d > 0 ? "+" : ""}${r.d.toFixed(2).padStart(8)}px  ${r.a.toFixed(2)} → ${r.b.toFixed(2)}  ${r.k}  「${on.t[r.k] || ""}」`);
  }
  if (rows.length > TOP) console.log(`  … ほか ${rows.length - TOP}件`);
  if (rows.length) jump++;
}
await b.close();
console.log(nomark ? `\n印の取れない面 ${nomark}件` : "");
process.exit(nomark ? 2 : jump ? 1 : 0);
