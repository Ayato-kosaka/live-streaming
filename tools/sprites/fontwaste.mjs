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
 * 止められないので、`tools/fonts/subset.py` は U+0020（と、同じく DOM に
 * 無いままブラウザが足す `text-overflow` の「…」）だけの小さな束を太さごとに
 * 1本焼いて、ほかの束から抜いてある。ここでは**その束を空振りに数えない**
 * （`fontfaces.mjs` の `isStrut`）。代わりに `fontstrut_selftest.mjs` が
 * 「その束が小さいままか」を毎 PR で見張る。
 *
 * ## 絵を落としたまま測らない
 *
 * `route.mjs` の `offline()` を通す。通さないと上の 370KB が混ざって、
 * **本番では起きていないものを不具合として報告する**ことになる
 * （`CLAUDE.md`「このサンドボックスから出られない先」）。
 * `BREAK=alt` でわざと通さずに測れる——そのとき赤くならなければ、
 * この道具は何も見ていない。
 *
 * ## 対照（足の数だけ。**本物の面を1枚も数える前に**回る）
 *
 * | | 当てるもの | 落ちかた |
 * | --- | --- | --- |
 * | `alt` | 絵を落としたまま測る（#848 を作った測りかた） | 空振りが上限を超えて 1 |
 * | `blind` | 描いた字を1字も数えない | 引いた束が全部空振りになって 1 |
 * | `deaf` | 取りに行った束を見ない | 数えるものが無いので 2 |
 * | `reject` | ブラウザに蹴られた束を1本こしらえる | 蹴られた束で 1 |
 *
 * 4つとも1枚の面に当てて、**そのたび落ちることを見てから**本物を数える。
 * 1つでも素通りしたら、数字を出さずに 2 で落ちる。
 * `BREAK=alt` のように自分で渡すと、その1通りだけを全部の面に当てて帰る。
 */
import { chromium } from "playwright-core";
import { COLLECT, NEAR } from "./fontweigh.mjs";
import { discover, DIST } from "./islepages.mjs";
import { offline } from "./route.mjs";
import { CSS, faces, isStrut } from "./fontfaces.mjs";

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



/**
 * 面を1枚測って、1行ぶんを返す。
 * @param {import("playwright-core").Browser} b
 * @param {string} page `/board` のような綴り
 * @param {string} how `BREAK` の名前（空なら素のまま）
 * @param {ReturnType<typeof faces>} all
 */
async function one(b, page, how, all) {
  {
    const ctx = await b.newContext({ viewport: { width: W, height: 844 }, isMobile: W < 640 });
    /* BREAK=alt … 絵を落としたまま測る（#848 を作った測りかた） */
    if (how !== "alt") await offline(ctx);
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
      }, how);
      /* BREAK=blind … 描いた字を数えない。**空振りが全部に見える**ので、
         ここで赤くならなければ、空振りの数え方そのものが効いていない */
      const drawn = how === "blind" ? { 400: "", 700: "", 900: "" } : chars;
      /* BREAK=deaf … 取りに行った束を見ない。数えるものが無いので 2 */
      const fetched = how === "deaf" ? new Set() : new Set(got.keys());

      const need = new Set();
      for (const w of [400, 700, 900]) {
        for (const c of drawn[String(w)] || "") {
          const cp = c.codePointAt(0);
          const i = all.findIndex((f) => f.w === w && f.ranges.some(([lo, hi]) => lo <= cp && cp <= hi));
          if (i >= 0) need.add(all[i].url);
        }
      }
      const whiff = [...fetched].filter((u) => !need.has(u));
      const strut = whiff.filter((u) => isStrut(all.find((f) => f.url === u) || { ranges: [] }));
      const real = whiff.filter((u) => !strut.includes(u));
      const bytes = real.reduce((a, u) => a + (got.get(u) || 0), 0);
      await ctx.close();
      return { page, fetched: fetched.size, paid: [...got.values()].reduce((a, v) => a + v, 0), whiff: real, bytes, strut: strut.length, errs };
    } catch (e) {
      await ctx.close();
      return { page, fetched: 0, paid: 0, whiff: [], bytes: 0, strut: 0, errs: [], why: e.message.split("\n")[0] };
    }
  }
}

/**
 * 行の束から、落ちた理由を並べる（空なら通った）。
 * @returns {{bad: string[], code: number, total: number, worst: object}}
 */
function judge(rows) {
  const bad = [];
  const total = rows.reduce((a, r) => a + r.bytes, 0);
  const worst = rows.reduce((a, r) => (r.bytes > a.bytes ? r : a), rows[0] || { page: "-", bytes: 0 });
  if (!rows.length || rows.every((r) => r.fetched === 0)) {
    return { bad: ["書体を1本も取りに行っていない。配っている置き場が違う（PORT / DIST）"], code: 2, total, worst };
  }
  const rejected = rows.filter((r) => r.errs && r.errs.length);
  if (rejected.length) {
    bad.push(`ブラウザに蹴られた束がある面 ${rejected.length}枚（例: ${rejected[0].page} で ${rejected[0].errs.join(" / ")}）`);
  }
  if (total / 1024 > MAX_KB) {
    bad.push(`1字も描かない書体を ${(total / 1024).toFixed(1)}KB 引いている（上限 ${MAX_KB}KB）`);
  }
  return { bad, code: bad.length ? 1 : 0, total, worst };
}

const say = (r, i, n) =>
  `${String(i).padStart(3)}/${n}  ${String(r.fetched).padStart(2)}本 ` +
  `${(r.paid / 1024).toFixed(1).padStart(7)}KB  ` +
  `空振り ${String(r.whiff.length).padStart(2)}本 ${(r.bytes / 1024).toFixed(1).padStart(7)}KB  ${r.page}` +
  (r.whiff.length ? `  [${r.whiff.map((u) => u.split("/").pop().replace(".woff2", "")).join(" ")}]` : "") +
  (r.errs.length ? `  ✕蹴られた束 ${r.errs.length}本` : "") +
  (r.why ? `  開けなかった: ${r.why}` : "");

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

  /* ── 対照 ──────────────────────────────────────────────────────
     **本物の面を1枚も数える前に**、足を1本ずつ折って落ちることを見る。
     1つでも素通りしたら、数字は出さずに 2（`docs/island-standards.md` §15）。
     `BREAK=` を自分で渡したときは、その1通りだけを回して帰る。 */
  if (BREAK) {
    const rows = [];
    for (const [i, page] of pages.entries()) {
      const r = await one(b, page, BREAK, all);
      rows.push(r);
      console.log(say(r, i + 1, pages.length));
    }
    await b.close();
    const v = judge(rows);
    console.log(`\n[BREAK=${BREAK}] ${rows.length}面  空振り ${(v.total / 1024).toFixed(1)}KB`);
    for (const x of v.bad) console.log(`  ✕ ${x}`);
    process.exit(v.code);
  }

  console.log("[対照] 足を1本ずつ折って、この道具が落ちるか");
  const probe = pages.includes("/island/iran-walk") ? "/island/iran-walk" : pages[0];
  let ok = true;
  for (const [how, why, want] of [
    ["alt", "絵を落としたまま測る（#848 を作った測りかた）", 1],
    ["blind", "描いた字を1字も数えない", 1],
    ["deaf", "取りに行った束を見ない", 2],
    ["reject", "ブラウザに蹴られた束を1本こしらえる", 1],
  ]) {
    const v = judge([await one(b, probe, how, all)]);
    const mark = v.code === want ? "○" : "✕";
    if (v.code !== want) ok = false;
    console.log(`  ${mark} ${how}（${why}） → 終了コード ${v.code}（欲しいのは ${want}）${v.bad[0] ? ` … ${v.bad[0]}` : " … **素通りした**"}`);
  }
  if (!ok) {
    await b.close();
    console.log("\n✕ 対照が外れた。**本物の面の数字は1つも出さない**");
    process.exit(2);
  }

  console.log("\n[本物]");
  const rows = [];
  for (const [i, page] of pages.entries()) {
    const r = await one(b, page, "", all);
    rows.push(r);
    console.log(say(r, i + 1, pages.length));
  }
  await b.close();

  const v = judge(rows);
  console.log(
    `\n${rows.length}面  空振り ${rows.filter((r) => r.whiff.length).length}面 / 合計 ${(v.total / 1024).toFixed(1)}KB  ` +
    `いちばん多い面 ${v.worst.page} ${(v.worst.bytes / 1024).toFixed(1)}KB  ` +
    `（行の高さのための1本は ${rows.filter((r) => r.strut).length}面で数えていない）`
  );
  if (v.bad.length) {
    for (const x of v.bad) console.log(`  ✕ ${x}`);
    console.log("  描いていない太さの束を引く面が増えた。weights.json を取り直して subset.py を回す");
    process.exit(v.code);
  }
  console.log(`○ 空振りは上限（${MAX_KB}KB）の中`);
}

await main();
