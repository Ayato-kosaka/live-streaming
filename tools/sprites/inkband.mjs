/**
 * 字の濃さを、**画面のぶんずつ送りながら**測る。
 *
 *   PORT=4150 PAGES=/,/nordic/finland node tools/sprites/inkband.mjs
 *
 * 終了コード: 0＝通った / 1＝見つかった（4.5 割れ） / 2＝数えるものが無い
 * （対照が落ちた・開けなかった面がある・字を1つも拾えなかった面がある）。
 *
 * ## `inkpx.mjs` と何が違うか（2026-09-17）
 *
 * **計算は同じ**（どちらも `inkjudge.mjs` を呼ぶ）。**撮りかただけが違う。**
 * あちらは面ぜんぶを1枚に撮る（`fullPage`）。それだと
 * **`content-visibility: auto` の段が描かれない。**
 * 表紙（`/`）の下半分（`.hchap-mat`）がそれで、120か所のうち **58か所**が
 * 「字の画素が足りない」で落ちていた。24面で 284か所。
 * **落ちたぶんは「割れ 0」に化ける**（`docs/island-misses.md` #130、§15）。
 *
 * ここは画面のぶんだけ送って、そのつど画面の大きさで2枚撮る。
 * 描かれていない段は送った時点で描かれるので、そこも測れる。
 * 実測で `/` が 120/120、`/nordic/guide` が 355/355。
 * そうやって初めて出たのが `/nordic/finland` の街の札4件（4.10〜4.50）。
 *
 * 背の高い面を1枚に撮ると**2枚が食い違う**という別の穴（#130 の2）にも、
 * こちらは当たらない。撮る絵が画面1枚ぶんで収まるため。
 *
 * **あちらの代わりではない。** ここは
 * **画面より背の高い字（長い段落の入れ物）を数えない**——帯からはみ出すものは
 * どの帯にも収まらないので落ちる。だから両方回して、両方の分母を読む。
 *
 * ## 対照
 *
 * 台はこの道具のもの（`inkbandfix/fix.html`）。`inkpxfix` の4つの字に、
 * **この道具にしか無い足を2本**足してある:
 *
 *   - 画面3枚ぶんより背が高い（送らないと下まで届かない）
 *   - `content-visibility: auto` の段がある（**1枚に撮る側は描かない**）
 *
 * 見るのは、割れてほしい3つ（うち1つは畳まれた段の中）を挙げること、
 * 割れてはいけない3つ（うち1つは畳まれた段の中）を挙げないこと、
 * 画面に出ていない2つを数に入れないこと、そして
 * **同じ字が帯をまたいで二重に数えられていないこと。**
 * 1つでも外したら 2 で落ちる。
 *
 * `BREAK=` で、その守りが効いているかを確かめられる:
 *
 *   nolim     下限を 0 にする（何も割れにならない＝ゆるめる向き）
 *   nodedupe  同じ字を帯ごとに数え直す（重なった帯で同じ字が2回出る）
 *   noband    送らずに、いちばん上の画面だけ見る（畳まれた段に届かない）
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { offline } from "./route.mjs";
import { openChecked, reportMissing } from "./served.mjs";
import { serveFixtures, serveDirectory, reportControl } from "./fixserve.mjs";
import { judgeInk } from "./inkjudge.mjs";

const PORT = process.env.PORT || "4150";
const PAGES = (process.env.PAGES || "/").split(",");
const W = Number(process.env.W || 390);
const H = Number(process.env.H || 844);
const DPR = Number(process.env.DPR || 2);
const LIM = Number(process.env.LIM || 4.5);
const TAG = process.env.TAG || "band";
const OUT = `/tmp/ink/${TAG}`;
mkdirSync(OUT, { recursive: true });
const BREAK = process.env.BREAK || "";
const lim = BREAK === "nolim" ? 0 : LIM;
/* 対照の字は 4.5 に合わせて選んである（2.85 / 1.84 / 6.93 / 21.0）ので、
   `LIM=` を上げると対照のほうが先に落ちる。ゆるめる向きだけ両方に効かせる
   （`inkpx.mjs` と同じ決まり。`docs/island-misses.md` #128 の決めごと3）。 */
const ctlLim = BREAK === "nolim" ? 0 : 4.5;
/** `noband` … 送らない（`inkpx.mjs` が届かないところに、こちらも届かなくなる） */
const noBand = BREAK === "noband";

/** 画面に出ている字を拾って、印を付ける。**帯からはみ出すものは数えない** */
const COLLECT = () => {
  const out = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const t = (n.textContent || "").trim();
    if (!t) continue;
    const el = n.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    /* **その字そのものの箱を測る。入れ物の箱ではない。**
       入れ物には子が入っていることがあり、子の地まで「この字の地」として
       数えてしまう。`/map` の `.atrip-when` がそれで、中に「いまここ」の
       赤い札（白字）が入っている。入れ物の箱で測ると、茶色い日付の墨を
       赤い札の地と比べることになって 1.42 が出た——**画面のどこにも
       起きていない組み合わせ**（#130）。Range なら字の行だけを囲む。 */
    const rng = document.createRange();
    rng.selectNodeContents(n);
    const rr = rng.getBoundingClientRect();
    const r = rr.width >= 2 && rr.height >= 2 ? rr : el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
    if (el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true, checkOpacity: true, checkVisibilityCSS: true }) === false) continue;
    /* 画面に入りきっているものだけ。半分だけ写っている字を測ると、
       切れたところが「字の画素が足りない」に化ける。またぐものは次の帯で拾う */
    if (r.top < 0 || r.bottom > innerHeight || r.right <= 0 || r.left >= innerWidth) continue;
    const svg = el.ownerSVGElement != null || el.tagName === "text";
    out.push({
      t: t.slice(0, 24),
      c: el.className?.baseVal ?? (typeof el.className === "string" ? el.className : ""),
      tag: el.tagName,
      color: svg ? cs.fill : cs.color,
      opacity: cs.opacity, size: cs.fontSize,
      x: r.x, y: r.y, w: r.width, h: r.height,
      /* 帯が重なっているので、同じ字が2回出てくる。**位置は帯ごとに変わる**ので
         鍵に使えない。字・大きさ・入れ物でまとめる */
      key: `${el.tagName}|${t.slice(0, 24)}|${Math.round(r.width)}x${Math.round(r.height)}`,
    });
    el.setAttribute("data-inkband", "1");
  }
  return out;
};
const HIDE = () => {
  for (const el of document.querySelectorAll("[data-inkband]")) {
    el.style.setProperty("color", "transparent", "important");
    el.style.setProperty("text-shadow", "none", "important");
    el.style.setProperty("-webkit-text-stroke-color", "transparent", "important");
    if (el.ownerSVGElement || el.tagName === "text") {
      el.style.setProperty("fill", "transparent", "important");
      el.style.setProperty("stroke", "transparent", "important");
    }
  }
};
/** 印と差し込みを戻す。戻さないと、次の帯で「字の無い面」を撮ることになる */
const SHOW = () => {
  for (const el of document.querySelectorAll("[data-inkband]")) {
    for (const k of ["color", "text-shadow", "-webkit-text-stroke-color", "fill", "stroke"]) el.style.removeProperty(k);
    el.removeAttribute("data-inkband");
  }
};

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({
  viewport: { width: W, height: H }, deviceScaleFactor: DPR,
  isMobile: W < 700, hasTouch: W < 700, reducedMotion: "reduce",
});
await offline(ctx);
/* 島は rAF で動く。2枚のあいだに住人が歩くと、差分に字と関係ない画素が混ざる
   （`CLAUDE.md`「島を止めてから撮る」）。`SEED=` を渡さないときは止めるだけ。 */
await (await import(process.env.SEED || "./freeze.mjs")).apply(ctx);
await ctx.addInitScript(() => {
  try {
    localStorage.setItem("ayato-island-arrived", "2026-09-04");
    localStorage.setItem("ayato-island-walked", "1");
  } catch {}
});

const shots = await serveDirectory(OUT);
/** 撮った2枚を読ませるためだけの面。島の CSS を持ち込まない */
const judgePage = await (await b.newContext({ viewport: { width: 200, height: 200 } })).newPage();
await judgePage.goto(`${shots.base}/`).catch(() => {});

const bail = async (msg) => { console.log(msg); shots.close(); await b.close(); process.exit(2); };

/**
 * 面を1枚、帯ごとに測る。
 * @returns {Promise<{picked: number, rows: object[], dropped: object} | null>}
 */
async function bandRun(base, path, miss) {
  /* **面ごとに新しいタブ。** 同じタブで撮り続けると、背の高い面で
     描画のプロセスが落ちる（`shotstable.mjs` と同じ理由） */
  const p = await ctx.newPage();
  try {
    const got = await openChecked(p, base, path, { miss, waitUntil: "networkidle", timeout: 60000 });
    if (!got.ok) return null;
    await p.waitForTimeout(1500);
    // 畳んであるものは全部開く。開いた中身も測らないと、面の半分を見ないまま「読める」と言うことになる
    await p.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
    await p.waitForTimeout(1000);
    const docH = await p.evaluate(() => document.documentElement.scrollHeight);
    const seenKeys = new Set();
    const rows = [];
    const dropped = {};
    let picked = 0;
    const name = (path.replace(/\//g, "_").replace(/\.html$/, "") || "_");
    for (let y = 0, i = 0; y < (noBand ? 1 : docH); y += Math.floor(H / 2), i++) {
      await p.evaluate((yy) => window.scrollTo(0, yy), y);
      await p.waitForTimeout(500);
      let boxes = await p.evaluate(COLLECT);
      if (BREAK !== "nodedupe") boxes = boxes.filter((x) => !seenKeys.has(x.key));
      for (const x of boxes) seenKeys.add(x.key);
      if (!boxes.length) { await p.evaluate(SHOW); continue; }
      picked += boxes.length;
      const nm = `${name}-${i}`;
      await p.screenshot({ path: `${OUT}/${nm}.shot.png` });
      await p.evaluate(HIDE);
      await p.waitForTimeout(150);
      await p.screenshot({ path: `${OUT}/${nm}.bg.png` });
      await p.evaluate(SHOW);
      const j = await judgeInk(judgePage, {
        shotUrl: `${shots.base}/${nm}.shot.png`, bgUrl: `${shots.base}/${nm}.bg.png`,
        boxes, dpr: DPR, lim,
      });
      if (j.err) { miss.push(`${path} の帯${i}（撮った2枚が読めない: ${j.err}）`); continue; }
      rows.push(...j.rows);
      for (const [k, v] of Object.entries(j.dropped)) dropped[k] = (dropped[k] || 0) + v;
    }
    return { picked, rows, dropped };
  } catch (e) {
    miss.push(`${path}（撮れなかった: ${String(e).split("\n")[0].slice(0, 80)}）`);
    return null;
  } finally {
    await p.close().catch(() => {});
  }
}

/* ── 対照が先。落ちたら本物の面の数字は出さない ──────────────────── */
{
  /** class ごとに、測ってほしいか（画面に出ているか）と、割れに挙げてほしいか */
  const WANT = [
    ["ik-bad-gray", true, true],       // #999 / 2.85
    ["ik-bad-opacity", true, true],    // #000 を 0.25 で薄めたもの / 1.84
    ["ik-ok-gray", true, false],       // #5a5a5a / 6.93
    ["ik-ok-black", true, false],      // #000 / 21.0
    ["ik-cv-bad", true, true],         // 畳まれた段の中の #999。**この道具の存在理由**
    ["ik-cv-ok", true, false],         // 同じ段の中の #000
    ["ik-hidden-clip", false, false],  // 切られて画面に出ていない
    ["ik-hidden-none", false, false],  // display:none
  ];
  const fx = await serveFixtures("inkbandfix");
  const miss0 = [];
  const r = await bandRun(fx.base, "/fix.html", miss0);
  fx.close();
  if (!r) await bail("対照の台が開けませんでした。");
  const cls = (x) => String(x.c || "").split(/\s+/);
  const checks = [];
  for (const [nm, wantSeen, wantBad] of WANT) {
    const hits = r.rows.filter((x) => cls(x).includes(nm));
    const row = hits[0];
    checks.push({ name: `${nm}（測れた）`, want: wantSeen, got: !!row, note: row ? `中央 ${row.mid.toFixed(2)}` : "" });
    if (wantSeen) {
      checks.push({ name: `${nm}（${ctlLim} 割れ）`, want: wantBad, got: !!row && row.mid < ctlLim });
      /* **帯は重ねてある。** 同じ字を帯ごとに数え直していたら、ここで2回出る。
         数が増える向きの間違いは「薄い字がたくさん見つかった」という
         仕事をしたような形で出るので、数える手前で止める */
      checks.push({ name: `${nm}（1回だけ数えた）`, want: false, got: hits.length > 1, note: `${hits.length}回` });
    }
  }
  console.log("── 対照（濃さの分かっている字を、割れに挙げられるか／挙げずにいられるか）");
  const { miss, total } = reportControl(checks);
  console.log(`  対照 ${total}件中 ${total - miss}件 一致${BREAK ? `（BREAK=${BREAK}）` : ""}`);
  if (miss) await bail(`\n対照が ${miss}件 外れた。**本物の面の数字は出さない。**（docs/island-standards.md §15）`);
}

/* ── 本物の面 ──────────────────────────────────────────────────── */
const miss = [];
let seenPages = 0, nPicked = 0, nRows = 0, nBad = 0;
const nDrop = {};
for (const path of PAGES) {
  const r = await bandRun(`http://localhost:${PORT}`, path, miss);
  if (!r) { console.log(`${path}  開けず`); continue; }
  seenPages++;
  /* **字が1つも無い面は「読める」ではなく「見ていない」。**
     島の面で字の無いものは1枚も無い（`docs/island-standards.md` §15） */
  if (!r.picked) { miss.push(`${path}（字を1つも拾えなかった）`); continue; }
  nPicked += r.picked;
  nRows += r.rows.length;
  for (const [k, v] of Object.entries(r.dropped)) nDrop[k] = (nDrop[k] || 0) + v;
  const bad = r.rows.filter((x) => x.bad).sort((a, c) => a.mid - c.mid);
  nBad += bad.length;
  console.log(`${path}  拾った字 ${r.picked}か所 / 測れた ${r.rows.length}か所 / ${LIM} 割れ ${bad.length}か所`);
  for (const x of bad)
    console.log(
      `  ${x.mid.toFixed(2).padStart(6)} 中央 / ${x.rhi.toFixed(2).padStart(6)} 明地 / ${x.rlo.toFixed(2).padStart(6)} 暗地  ` +
        `${x.size.padStart(6)}  字[${x.ink}] 地[${x.lo}]  ${x.tag}.${String(x.c).slice(0, 20)} «${String(x.t).slice(0, 18)}»`,
    );
}
shots.close();
await b.close();

// **分母から読む。** 「割れ 0」は、測っていないから 0 かもしれない（§15）
console.log(`\n── 数えたもの（幅 ${W}px / dpr ${DPR} / 下限 ${LIM} / 帯 ${Math.floor(H / 2)}px ずつ）`);
console.log(`  見た面       ${seenPages} / ${PAGES.length}`);
console.log(`  拾った字     ${nPicked} か所`);
console.log(`  測れた字     ${nRows} か所`);
console.log(`  測れなかった ${Object.entries(nDrop).map(([k, v]) => `${k} ${v}`).join(" / ") || "なし"}`);
console.log(`  ${LIM} 割れ     ${nBad} か所`);
console.log(`  見ていないもの: **画面（${H}px）より背の高い入れ物の字**（どの帯にも収まらない）/ 欄の中の字`);

if (miss.length) { reportMissing(miss); process.exit(2); }
if (!nRows) { console.log("\n字を1か所も測れませんでした。数えるものがありません。"); process.exit(2); }
if (nBad) { console.log(`\nだめ: ${LIM} を割る字が ${nBad} か所。`); process.exit(1); }
console.log(`\n${seenPages}面、${LIM} 割れは見つかりませんでした。`);
process.exit(0);
