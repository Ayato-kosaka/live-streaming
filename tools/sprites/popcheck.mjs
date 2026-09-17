/**
 * 「押せないのに厚みがある」ものを、21面ぶん数える。
 *
 *   PORT=3130 node tools/sprites/popcheck.mjs
 *   BREAK=noclick node tools/sprites/popcheck.mjs   # わざと盲点を作る（対照が落ちる）
 *
 * 終了コード: 0＝通った / 1＝見つかった / 2＝数えるものが無い
 * （対照が落ちた・開けなかった面がある・厚みが1件も無い）。
 * **印字された「押せないのに厚み: 0」を目で読んで合格と言わない。** `| tail` を
 * 挟むと終了コードが消える（`docs/island-misses.md` #124 と同じ形）。
 *
 * `docs/island-design.md` 3章は、押せる合図を**厚み1種類だけ**と決めている。
 * だから「厚みがあるのに押せない」ものが1つでもあると、合図が嘘になる。
 *
 * 厚み＝**ぼかし0で下へ出る影**（box-shadow でも filter: drop-shadow でも）。
 * 落ち影（`--shadow-*`）は右下へずれて3pxぼけるので、ここには引っかからない。
 * 一度 `--shadow-1` が `1px 3px 0` で、`--pop-sm` の `0 4px 0` と
 * 横1px・縦1pxしか違わなかったことがある（`docs/island-world.md` 7.8）。
 *
 * 押せるかどうかは、自分か祖先が a/button/summary/label/[role=button]/
 * onclick/tabindex か cursor:pointer かで見る。
 * **`<details>` は「押せる」に数える。** 見出し（`summary`）は子なので祖先を
 * たどるやり方では出ないが、指はそこを押して開いている。以前は「読むときに
 * 差し引く」と書いて人に任せていた。**人が差し引く前提の数は、終了コードに
 * できない**ので、道具の側で差し引く（対照 `pf-ok-details` がここを見張る）。
 *
 * **数えるのは「押せないのに厚みがある」の一方向だけ。**
 * 逆（押せるのに厚みが無い）はここでは数えない。そちらには例外があるため
 * （`docs/island-design.md` 3章の3 / `docs/island-world.md` 3.5）:
 * 一面に並ぶマスが全部押せるときは、1枚ずつに厚みを付けない。
 * 料理32マス・企画8マス・住人22マスがこれで、違反ではない。
 * こちらの向きには例外が無いので、出た数はそのまま違反の数。
 *
 * ## 数える前に対照を通す
 *
 * `tools/sprites/popcheckfix/fix.html` に、確かめたいことを1つずつ植てある。
 * **挙げてほしい2つ**（押せない × 厚み）と、**挙げてはいけない8つ**
 * （押せる × 厚み4つ／そもそも厚みではない4つ）を同じ表で見る。
 * 片側だけだと、**しきい値をゆるめた道具も通る**（`docs/island-misses.md` #125）。
 * 1つでも外したら、**本物の面の数字を1つも出さずに** 2 で落ちる。
 *
 * `BREAK=` で、その守りが効いているかを確かめられる:
 *
 *   noclick   押せるかどうかを見ない（厚みがあれば全部違反）
 *   nofilter  `filter: drop-shadow` の厚みを見ない
 *   noblur    ぼけている影も厚みに数える（落ち影と見分けない）
 *   noinset   内側の影も厚みに数える
 *   noup      上へ出る影も厚みに数える
 *   nodetails 畳みを「押せない」に戻す（人が差し引く前提の数え方）
 *
 * 落ち先は /tmp/pop.json。tag と class でまとめて数えるのは読むほうの仕事。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
import { openChecked, reportMissing } from "./served.mjs";
import { serveFixtures, reportControl } from "./fixserve.mjs";
import { writeFileSync } from "node:fs";

const PORT = process.env.PORT || "3130";
/** わざと盲点を作る。何が効いているかを見るためのもの（上の一覧） */
const BREAK = process.env.BREAK || "";
const skip = {
  click: BREAK === "noclick",
  filter: BREAK === "nofilter",
  blur: BREAK === "noblur",
  inset: BREAK === "noinset",
  up: BREAK === "noup",
  details: BREAK === "nodetails",
};

/* 面が増えたら、ここに足すか PAGES=... で渡す。
   足さないと、新しい面だけ数えないまま「0件」と出る。

   **`/roulette`（配信の表示側）はここに入れない。** あれは島ではなく、
   OBS に映すルーレットをそのまま写した面で（`docs/island-world.md` 2章）、
   「準備中」の札に 13px の厚みがある。島の決まりでは違反だが、
   厚みを取ると配信の絵が変わる。数えると毎回1件出て、それを直したくなる。 */
const PAGES = (
  process.env.PAGES ||
  [
    "/", "/about", "/streams", "/streams/cooking", "/kitchen", "/kitchen/egg-sandwich",
    "/legends", "/legends/iran-walk", "/apps", "/apps/nanitabeyo", "/next", "/next/new",
    "/board", "/map", "/map/france", "/nordic", "/nordic/guide", "/nordic/finland",
    "/nordic/photos", "/cards", "/all", "/friends", "/now", "/design",
    // ログインした人にしか出ない面。`SEED=` を渡したときだけ中身が出る
    "/me", "/me/roulette",
  ].join(",")
).split(",");

/**
 * 面ひとつぶんの「厚みのある要素」を集める。**対照にも本物にも同じものを当てる。**
 * 別々に書くと、対照が見ているものと本番が見ているものが食い違う。
 */
async function collect(p, skip) {
  return p.evaluate((skip) => {
    // "0 4px 0 rgb(...)" のような層を拾う。色が先頭に来る形もある。
    const layers = (s) => {
      if (!s || s === "none") return [];
      const parts = [];
      let depth = 0, cur = "";
      for (const ch of s) {
        if (ch === "(") depth++;
        if (ch === ")") depth--;
        if (ch === "," && depth === 0) { parts.push(cur); cur = ""; } else cur += ch;
      }
      parts.push(cur);
      return parts.map((t) => {
        const nums = t.replace(/(rgba?|color|hsla?)\([^)]*\)/g, "").match(/-?[\d.]+px/g) || [];
        const [x, y, blur, spread] = nums.map((n) => parseFloat(n));
        return { raw: t.trim(), x: x || 0, y: y || 0, blur: blur || 0, spread: spread || 0, inset: /inset/.test(t) };
      });
    };
    const clickable = (el) => {
      for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
        const t = a.tagName;
        if (t === "A" || t === "BUTTON" || t === "SUMMARY" || t === "INPUT" || t === "SELECT" || t === "TEXTAREA" || t === "LABEL") return true;
        // 畳みは見出しが**子**なので、祖先をたどるだけでは出ない。指はそこを押す
        if (!skip.details && t === "DETAILS" && a.querySelector(":scope > summary")) return true;
        if (a.getAttribute && (a.getAttribute("role") === "button" || a.hasAttribute("onclick") || a.tabIndex >= 0)) return true;
        try { if (getComputedStyle(a).cursor === "pointer") return true; } catch {}
      }
      return false;
    };
    const out = [];
    const els = document.querySelectorAll("*");
    let looked = 0;
    for (const el of els) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width < 3 || r.height < 3) continue;
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      looked++;
      const bs = layers(cs.boxShadow).filter(
        (l) => (skip.inset || !l.inset) && (skip.blur || l.blur === 0) && (skip.up || l.y > 0),
      );
      /* **色を先に落としてから drop-shadow を切り出す。**
         計算値は `drop-shadow(rgb(187, 0, 0) 0px 4px 0px)` の形で返る。
         `drop-shadow\([^)]*\)` は `rgb(` の閉じ括弧で切れるので、
         **px が1つも入らない切れ端**になり、下へ4px出る厚みが
         「y=0」として毎回こぼれていた（対照 `pf-bad-filter` がここを見張る）。 */
      const noColor = (cs.filter || "").replace(/(rgba?|color|hsla?)\([^)]*\)/g, "");
      const df = skip.filter
        ? []
        : (cs.filter && cs.filter !== "none" ? noColor.match(/drop-shadow\([^)]*\)/g) || [] : [])
            .map((t) => { const n = (t.match(/-?[\d.]+px/g) || []).map(parseFloat); return { raw: t, x: n[0] || 0, y: n[1] || 0, blur: n[2] || 0 }; })
            .filter((l) => (skip.blur || l.blur === 0) && (skip.up || l.y > 0));
      if (!bs.length && !df.length) continue;
      out.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className?.baseVal ?? (typeof el.className === "string" ? el.className : "")).slice(0, 50),
        click: skip.click ? false : clickable(el),
        w: Math.round(r.width), h: Math.round(r.height),
        bs: bs.map((l) => l.raw).join(" | "),
        df: df.map((l) => l.raw).join(" | "),
      });
    }
    // **分母は「画面に出ていた要素の数」。** これを出さないと、
    // 「厚み 0件」が「無い」のか「面を開けていない」のか読む側で決められない
    return { rows: out, looked, total: els.length };
  }, skip);
}

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
await offline(ctx);
/* ログインした人にしか出ない面（じぶんのこと）を測るための差し込み口。
   `SEED=tools/sprites/asme.mjs` を渡すと、入っている人として開く。 */
if (process.env.SEED) await (await import(process.env.SEED)).apply(ctx);
const p = await ctx.newPage();
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));

/** 数字を1つも出さずに落ちる。**対照が外れた回に本番の数を読ませない** */
async function bail(msg) {
  console.log(msg);
  await b.close();
  process.exit(2);
}

/* ── 対照が先。落ちたら本物の面の数字は出さない ──────────────────── */
{
  /** class ごとに、挙げてほしいか（押せないのに厚み）と、厚みの一覧に載ってほしいか */
  const WANT = [
    ["pf-bad-shadow", true, true],
    ["pf-bad-filter", true, true],
    ["pf-ok-link", false, true],
    ["pf-ok-cursor", false, true],
    ["pf-ok-child", false, true],
    ["pf-ok-details", false, true],
    ["pf-no-blur", false, false],
    ["pf-no-inset", false, false],
    ["pf-no-up", false, false],
    ["pf-no-plain", false, false],
  ];
  const fx = await serveFixtures("popcheckfix");
  const miss0 = [];
  const got = await openChecked(p, fx.base, "/fix.html", { miss: miss0, waitUntil: "networkidle", timeout: 20000 });
  if (!got.ok) { fx.close(); await bail(`対照の面が開けませんでした（${got.why}）。`); }
  await p.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
  const c = await collect(p, skip);
  fx.close();
  console.log("── 対照（押せないのに厚みを、挙げられるか／挙げずにいられるか）");
  const has = (cls) => c.rows.some((r) => r.cls.split(/\s+/).includes(cls));
  const bad = (cls) => c.rows.some((r) => r.cls.split(/\s+/).includes(cls) && !r.click);
  const checks = [];
  for (const [cls, wantBad, wantThick] of WANT) {
    checks.push({ name: `${cls}（押せないのに厚み）`, want: wantBad, got: bad(cls) });
    checks.push({ name: `${cls}（厚みの一覧）`, want: wantThick, got: has(cls) });
  }
  const { miss, total } = reportControl(checks);
  console.log(`  対照 ${total}件中 ${total - miss}件 一致${BREAK ? `（BREAK=${BREAK}）` : ""}`);
  if (miss) await bail(`\n対照が ${miss}件 外れた。**本物の面の数字は出さない。**（docs/island-standards.md §15）`);
}

/* ── 本物の面 ──────────────────────────────────────────────────── */
const all = [];
/** 開けなかった面。**空でなければ 2 で落ちる**（`served.mjs`）。 */
const miss = [];
let looked = 0, seenPages = 0;
for (const path of PAGES) {
  /* **素のパスで開かない。** 書き出したものを静的に配ると `/about` は 404、
     `/map` は 301 してディレクトリ一覧を返す。どちらも `goto` は成功するので、
     そのまま数えると26面ぜんぶで0件になり、**「押せないのに厚み: 0」と
     合格が出ていた**（`.html` を付けると 54/42/15/47/18 件出る）。 */
  const got = await openChecked(p, `http://localhost:${PORT}`, path, {
    miss, waitUntil: "networkidle", timeout: 60000, tries: 4,
  });
  if (!got.ok) { console.log(`${path} 取れず（${got.why}）`); continue; }
  seenPages++;
  await p.waitForTimeout(700);
  await p.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
  await p.waitForTimeout(500);
  const c = await collect(p, skip);
  looked += c.looked;
  for (const r of c.rows) all.push({ page: path, ...r });
  console.log(`${path} ${c.rows.length} / 見た要素 ${c.looked}`);
}
await b.close();
writeFileSync("/tmp/pop.json", JSON.stringify(all, null, 1));
const bad = all.filter((r) => !r.click);
const byTag = {};
for (const r of bad) byTag[r.tag] = (byTag[r.tag] || 0) + 1;
console.log(`\n── 数えたもの`);
console.log(`  見た面           ${seenPages} / ${PAGES.length}`);
console.log(`  見た要素         ${looked} 件（画面に出ていたもの）`);
console.log(`  厚みのある要素   ${all.length} 件`);
console.log(`  押せないのに厚み ${bad.length} 件 ${JSON.stringify(byTag)}`);
console.log(`  見ていないもの: 押せるのに厚みが無いほう（例外がある。上の docstring）`);

if (miss.length) { reportMissing(miss); process.exit(2); }
/* **厚みが1件も無いのは「合格」ではなく「見ていない」。**
   `--pop` は `tokens.css` に在って CSS 8ファイルから41回使われているので、
   面を開けていれば必ず出る。0 件で緑を返さない（`island-standards.md` §15）。 */
if (all.length === 0) {
  console.error("\n厚みのある要素が1件も見つかりませんでした。数え方か開いた先を疑ってください。");
  process.exit(2);
}
if (bad.length) {
  console.log(`\nだめ: 押せないのに厚みのあるものが ${bad.length} 件。/tmp/pop.json に並べてあります。`);
  process.exit(1);
}
console.log(`\n${seenPages}面、見つかりませんでした。`);
process.exit(0);
