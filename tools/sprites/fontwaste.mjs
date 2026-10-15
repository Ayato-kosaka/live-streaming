/**
 * **1字も描かない書体を、何本・何バイト引いているかを数える。**
 *
 *   tools/build.sh 3170
 *   python3 -m http.server 4170 --directory site/.next-3170 &
 *   DIST=site/.next-3170 PORT=4170 node tools/sprites/fontwaste.mjs
 *
 * 終了コード 0=空振りは上限の中 / 1=上限を超えた / 2=数えるものが無い。
 *
 * ## なぜ要るか（#848）
 *
 * `fontbudget_selftest.mjs` は**焼いたものと weights.json の突き合わせ**で
 * 「この面はいくら払うか」を出す。計算は正しいが、**ブラウザが実際に何を
 * 取りに行くかは見ていない。** 両者は黙ってずれる。
 *
 *   - `/island/iran-walk` は weights.json 上「400 で描く字 0」。ところが
 *     ブラウザは 400 の束を引く。**計算には出ない 26.6KB。**
 *   - 絵が落ちている箱で測ると、Chrome が `alt` の字を自分の影の中に組んで
 *     描くので、**400 の束を 11本・370KB** 引く。JS からは1字も見えない
 *
 * どちらも「払っているのに描いていない」で、**数えなければ増え続ける。**
 * ここはブラウザを立てて、
 *
 *   取りに行った束  −  描いた字が要る束  =  空振り
 *
 * を面ごとに出す。**描いた字の数え方は `fontweigh.mjs` の `COLLECT`**
 * （写すと片方だけ古くなる）。
 *
 * ## 行き場のない 1本（strut）は、空振りではない
 *
 * ブラウザは、字を1つも描かない段でも**行の高さを決めるために**その段の
 * 書体を要る。Chrome はその代表として **U+0020（空白）**を引く。つまり
 * 「太さ400の段があって、そこに 400 で描く字が1つも無い」面でも、
 * U+0020 を持つ 400 の束は必ず1本引かれる。**止められない。**
 *
 * 止められないので、`tools/fonts/subset.py` は U+0020 だけの小さな束を
 * 太さごとに1本焼いて、ほかの束から U+0020 を抜いてある。ここでは
 * **その束を空振りに数えない**（`STRUT`）。代わりに
 * `fontstrut_selftest.mjs` が「その束が小さいままか」を見張る。
 *
 * ## 絵を落としたまま測らない
 *
 * `route.mjs` の `offline()` を通す。通さないと上の 370KB が混ざって、
 * **本番では起きていないものを不具合として報告する**ことになる
 * （`CLAUDE.md`「このサンドボックスから出られない先」）。
 * `BREAK=alt` でわざと通さずに測れる——そのとき赤くならなければ、
 * この道具は何も見ていない。
 *
 * ## 対照（`BREAK=`。足の数だけ用意する）
 *
 * | | 当てるもの | 落ちかた |
 * | --- | --- | --- |
 * | `alt` | 絵を落としたまま測る（#848 を作った測りかた） | 空振りが上限を超えて 1 |
 * | `blind` | 描いた字を1字も数えない | 引いた束が全部空振りになって 1 |
 * | `deaf` | 取りに行った束を見ない | 数えるものが無いので 2 |
 * | `reject` | 蹴られた束を1本こしらえる | 蹴られた束で 1 |
 */
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { COLLECT, NEAR } from "./fontweigh.mjs";
import { discover, DIST } from "./islepages.mjs";
import { offline } from "./route.mjs";
import { fromRoot } from "./repo.mjs";

const PORT = process.env.PORT || "4170";
const BASE = `http://localhost:${PORT}`;
const W = +(process.env.W || 390);
const ONLY = (process.env.ONLY || "").split(",").filter(Boolean);
const BREAK = process.env.BREAK || "";
/* 空振りの上限。**0 にしない。** strut の1本は止められないし、
   焼き直すたびに束の切れ目は動く（`subset.py` の plan() のコメント）。
   いまの実測（141面）に1割の余裕を足した値を置く。超えたら、
   「描かないものを引く面」が増えたということなので、原因から直す。 */
const MAX_KB = +(process.env.MAX_KB || 220);

const CSS = fromRoot("site/app/css/fonts.css");
const FONTS = fromRoot("site/public/fonts");
const near = eval(NEAR);

/** 焼いた束を読む。`fontbudget_selftest.mjs` と同じ読み方。 */
function faces() {
  const css = readFileSync(CSS, "utf8");
  const out = [];
  for (const m of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const body = m[1];
    const w = +(body.match(/font-weight:\s*(\d+)/) || [])[1];
    const url = (body.match(/url\("([^"]+)"\)/) || [])[1];
    const ur = (body.match(/unicode-range:\s*([^;]+);/) || [])[1];
    if (!w || !url || !ur) continue;
    const ranges = ur.split(",").map((r) => {
      const [a, b] = r.trim().replace(/^U\+/i, "").split("-");
      return [parseInt(a, 16), parseInt(b ?? a, 16)];
    });
    let bytes = 0;
    try { bytes = statSync(join(FONTS, url.replace("/fonts/", ""))).size; } catch { /* 焼いていない */ }
    out.push({ w, url, ranges, bytes, has: (cp) => ranges.some(([a, b]) => cp >= a && cp <= b) });
  }
  return out;
}

/**
 * 行の高さのためだけに引かれる束（U+0020 しか持たない束）。
 * **空振りには数えない。** 数えると、止められないものでずっと赤くなる。
 */
const isStrut = (f) => {
  const s = new Set();
  for (const [a, b] of f.ranges || []) for (let c = a; c <= b && s.size < 8; c++) s.add(c);
  return s.size === 2 && s.has(0x20) && s.has(0x2026);
};

async function main() {
  const all = faces();
  if (all.length < 3) {
    console.log(`✕ 焼いた束が ${all.length}本しか読めない（${CSS}）`);
    process.exit(2);
  }
  const pages = ONLY.length ? ONLY : discover();
  if (!pages.length) {
    console.log(`✕ ${DIST} に面が無い。先に書き出してください（tools/build.sh）`);
    process.exit(2);
  }

  const b = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--no-sandbox"],
  });
  const rows = [];
  let n = 0;
  for (const page of pages) {
    const ctx = await b.newContext({ viewport: { width: W, height: 844 }, isMobile: W < 640 });
    /* BREAK=alt … 絵を落としたまま測る（#848 を作った測りかた） */
    if (BREAK !== "alt") await offline(ctx);
    const p = await ctx.newPage();
    const got = new Map();
    p.on("response", async (r) => {
      const u = new URL(r.url()).pathname;
      if (!/\.woff2?$/.test(u)) return;
      try { got.set(u, (await r.body()).length); } catch { /* 捨てられた */ }
    });
    await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
    try {
      await p.goto(`${BASE}${page === "/" ? "/index" : page}.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
      await p.waitForTimeout(1000);
      await p.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 700) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 50));
        }
      });
      await p.waitForTimeout(900);
      const chars = await p.evaluate(COLLECT, NEAR);
      /* **ブラウザに蹴られた束**を数える。蹴られるとその字は端末の書体に
         落ちるので、**送り幅が変わって行の折れ方まで動く**のに、
         requests にも画面にも「落ちた」とは出ない（#848 の詰め物）。
         BREAK=reject で、わざと蹴られる束を1本こしらえて当てる */
      const errs = await p.evaluate((how) => {
        const out = [];
        for (const f of document.fonts) if (f.status === "error") out.push(`${f.family} ${f.weight}`);
        if (how === "reject") out.push("（対照）わざと蹴られた束");
        return out;
      }, BREAK);
      /* BREAK=blind … 描いた字を数えない。**空振りが全部に見える**ので、
         ここで赤くならなければ、空振りの数え方そのものが効いていない */
      const drawn = BREAK === "blind" ? { 400: "", 700: "", 900: "" } : chars;
      /* BREAK=deaf … 取りに行った束を見ない。数えるものが無いので 2 */
      const fetched = BREAK === "deaf" ? new Set() : new Set(got.keys());

      const need = new Set();
      for (const w of [400, 700, 900]) {
        for (const c of drawn[String(w)] || "") {
          const cp = c.codePointAt(0);
          const i = all.findIndex((f) => f.w === w && f.has(cp));
          if (i >= 0) need.add(all[i].url);
        }
      }
      const whiff = [...fetched].filter((u) => !need.has(u));
      const strut = whiff.filter((u) => isStrut(all.find((f) => f.url === u) || { ranges: [] }));
      const real = whiff.filter((u) => !strut.includes(u));
      const bytes = real.reduce((a, u) => a + (got.get(u) || 0), 0);
      rows.push({ page, fetched: fetched.size, paid: [...got.values()].reduce((a, v) => a + v, 0), whiff: real, bytes, strut: strut.length, errs });
      console.log(
        `${String(++n).padStart(3)}/${pages.length}  ${String(fetched.size).padStart(2)}本 ` +
        `${([...got.values()].reduce((a, v) => a + v, 0) / 1024).toFixed(1).padStart(7)}KB  ` +
        `空振り ${String(real.length).padStart(2)}本 ${(bytes / 1024).toFixed(1).padStart(7)}KB  ${page}` +
        (real.length ? `  [${real.map((u) => u.split("/").pop().replace(".woff2", "")).join(" ")}]` : "") +
        (errs.length ? `  ✕蹴られた束 ${errs.length}本` : "")
      );
    } catch (e) {
      console.log(`     ${page}  開けなかった: ${e.message.split("\n")[0]}`);
    }
    await ctx.close();
  }
  await b.close();

  if (!rows.length || rows.every((r) => r.fetched === 0)) {
    console.log("✕ 書体を1本も取りに行っていない。配っている置き場が違う（PORT / DIST）");
    process.exit(2);
  }
  const total = rows.reduce((a, r) => a + r.bytes, 0);
  const worst = rows.reduce((a, r) => (r.bytes > a.bytes ? r : a), rows[0]);
  const hit = rows.filter((r) => r.whiff.length);
  console.log(
    `\n${rows.length}面  空振り ${hit.length}面 / 合計 ${(total / 1024).toFixed(1)}KB  ` +
    `いちばん多い面 ${worst.page} ${(worst.bytes / 1024).toFixed(1)}KB  ` +
    `（行の高さのための1本は ${rows.filter((r) => r.strut).length}面で数えていない）`
  );
  const rejected = rows.filter((r) => r.errs && r.errs.length);
  if (rejected.length) {
    console.log(`✕ ブラウザに蹴られた束がある面 ${rejected.length}枚（例: ${rejected[0].page} で ${rejected[0].errs.join(" / ")}）`);
    console.log("  蹴られた束の字は端末の書体に落ちる。**送り幅が変わって行の折れ方が動く**（#848 の詰め物）");
    process.exit(1);
  }
  if (total / 1024 > MAX_KB) {
    console.log(`✕ 1字も描かない書体を ${(total / 1024).toFixed(1)}KB 引いている（上限 ${MAX_KB}KB）`);
    console.log("  描いていない太さの束を引く面が増えた。weights.json を取り直して subset.py を回す");
    process.exit(1);
  }
  console.log(`○ 空振りは上限（${MAX_KB}KB）の中`);
}

await main();
