/**
 * **押せるはずのものに、指が届くか**を島の面ぜんぶで数える。
 *
 *   PORT=4203 DIST=site/.next-3203 node tools/sprites/reachwatch.mjs
 *   PORT=4203 WIDTHS=390x844 node tools/sprites/reachwatch.mjs
 *   PORT=4203 BREAK=nocover node tools/sprites/reachwatch.mjs   # わざと盲点を作る
 *   FIXONLY=1 node tools/sprites/reachwatch.mjs   # 対照の台だけ（書き出しも配り先も要らない）
 *
 * 終了コード: 0＝通った / 1＝見つかった / 2＝数えるものが無い
 * （対照が落ちた・開けなかった面がある・押しどころが1つも無い）。
 * **印字された「0件」を目で読んで合格と言わない。** `| tail` を挟むと
 * 終了コードが消える（`docs/island-misses.md` #124 と同じ形）。
 *
 * ## なぜ要るか（2026-10-14）
 *
 * 押しどころを測る道具は在った。**どれも終了コードを持っていなかった。**
 *
 *   `pchit.mjs`      全面・4幅で測るが、**必ず 0 で帰る**。読む人が目で数える
 *   `hitbox.mjs`     終了コードを持つが、`PAGES=` で渡した面しか見ない
 *   `islecover.mjs`  覆いを数えるが、**島の立っている面だけ**（11面）
 *
 * つまり「図鑑の札が隣に食われた」「`/goods` の口が帯の下に入った」は、
 * **人が `pchit` の出力を読んだ回にしか見つからない。** 読まなかった回は
 * 緑に見える——`docs/island-misses.md` #171「道具は在って、繋いでいないだけ」
 * と同じ形。ここは**繋ぐために**、同じ `hitbox.mjs` を呼んで
 * 終了コードだけを足した。
 *
 * ## 2つを数える。どちらも「指が届かない」の形
 *
 *   **覆い**     … 押しどころの真ん中が、別の何かに取られている。
 *                  `measure()` が `skipped` に「◯◯ が上にいる」で返すもの
 *   **48px割れ** … 当たりの実寸が 48px に届かない（`docs/island-design.md` 3-2）。
 *                  隣に食われて削れたものもここに出る（`rivals`）
 *
 * **3つめ（押せないのに厚みがある）は `popcheck.mjs` が数えている。**
 * ここに写さない。写しを作ると、片方だけ直る（#83）。
 *
 * ## `reachkeys.mjs` と名前が近いが、見ているものは重なっていない
 *
 * **こちらは指**（押しどころの覆い・48px割れ）。**あちらはキーボードと
 * 読み上げ**（Tab で届くか・焦点が見えるか・名前が在るか・`alt`・見出しの段・
 * 同じ字のリンク）。同じ面を歩くが、数えている8つと2つに1つも重なりが無い。
 * どちらも `selftest.yml` の自分の job から毎 PR で走る（2026-10-15 / #883）。
 *
 * ## 測り方は自分で書かない。`hitbox.mjs` を呼ぶ
 *
 * **見た目の箱（`getBoundingClientRect`）では測らない。** `::after` で
 * 広げた当たりはそこに出ないし、隣に取られている場所も出ない。
 * 中心から1pxずつ外へ伸ばして `elementFromPoint` がまだ自分を返すかで測る
 * （`hitbox.mjs` の `measure()`）。6本目の写しをここに作らない。
 *
 * ## 畳んだままの中を数えない
 *
 * 閉じた `<details>` と `content-visibility: auto` の中は、**開いて・
 * いちばん下まで送ってから**測る（`openFolds()`）。北欧の面は送らずに
 * 測ると 3,951px、送ると 5,067px で 1,100px 違った（`CLAUDE.md`）。
 * 視聴者さんは開いてから押すので、開いたあとが小さければ押せない。
 *
 * ## 対照（これが通らなければ、本物の数字を1つも出さない）
 *
 * `tools/sprites/reachwatchfix/fix.html` に10件植えてある。
 * **挙げてほしい4件**（覆い2・小さい2）と**挙げてはいけない6件**
 * （足りている2・透ける覆い1・見えていない3）を同じ表で見る。
 * 片側だけだと、しきい値をゆるめた道具も、なんでも赤く言う道具も通る
 * （`docs/island-misses.md` #125）。1つでも外したら 2 で落ちる。
 *
 * ## 島の中（`.isle` の中）は、ここでは数えない——**別の目が見ている**
 *
 * 島はあやとが歩き、カメラが寄る。**止めて1回測ると、その立ち位置1つぶん
 * しか見ない。** 実際、同じ `/` を2回測って、1回目は「となりの島へ」が
 * 49.5x25.8（`.today-tab` に下を食われた）、2回目は 0件だった。
 * **回ごとに違う数を出す見張りは、赤が出ても誰も信じない**（#200
 * 「毎回出る嘘は、本物の赤を埋める」）。
 *
 * 島の入口は専用の3本が見ている。**見ていないのではなく、別の目で見ている:**
 *
 *   `islecover.mjs` … 建物を1軒ずつ押して、**歩いているあいだも**覆いを測る
 *   `islereach.mjs` … 指が届く入口がいくつあるか
 *   `islenav.mjs`   … 引きの札6枚・隅の道具の重なり・南へ歩けるか
 *
 * 断りは `SKIP_SEL` に**理由ごと**置いて、**毎回印字する**（黙って落とさない。
 * `islepages.mjs` の `SKIP` と同じ決め）。
 *
 * ## 1枚で固まったら、その1枚の名前を出して落ちる（2026-10-16。#273）
 *
 * CI の 125回のうち **13回（10%）が、30分の枠で打ち切られていた。**
 * 残り 112回は 4.3〜5.2分に収まっていて、**その間が1回も無い**
 * ——遅いのではなく、**どこかで止まっている。**
 *
 * 止まった回のログは、対照（①）を通したあとの見出しまで出て、そこから
 * **30分ぶん1行も無い。** 本物の面の行は見つかったときしか出ないので、
 * **147面のどこで止まったのかが分からない。** 打ち切られた回を何回読んでも
 * 材料が増えないので、**次に止まった回で分かるようにした:**
 *
 *   - 1枚ごとに `PAGE_MS`（既定 120秒）の砂時計を置く。切れたら、その面と幅を
 *     名指しして `miss` に積み、**その page は捨てて開き直す**（残りは測り切る）
 *   - 幅ごとに「何枚済んだか」を印字する（止まった位置がログに残る）
 *   - 終わったあとの `close()` にも砂時計を置く（**出力はぜんぶ `b.close()` の
 *     あと**なので、ここで止まっても「1行も出ないまま30分」になる）
 *
 * **job の枠を伸ばすのは直しではない**（固まったまま30分待つのが40分になる
 * だけ）。1枚 120秒は、通っている回の1枚あたり 0.9秒の130倍。
 *
 * `BREAK=` で、その守りが効いているかを確かめられる:
 *
 * **本物の面でも、わざと覆って確かめられる。** `LID=1` を付けると、面ごとに
 * 砂浜の口（`.ifoot a`。どの面にもある）を1つ、ぴったり覆う板を置く。
 * **置いたら赤、外したら緑**が出なければ、この道具は本物の面に当たっていない
 * ——対照の面でしか効かない道具は、面を1枚も守っていない（#83）。
 *
 * `BREAK=` で、その守りが効いているかを確かめられる:
 *
 *   nofold    畳みを開かずに測る（畳みの中の2件が挙がらなくなる）
 *   noinline  横の道を引き出さずに測る（押せる「道4」が挙がってしまう）
 *   nocover   覆いを数えない
 *   nosmall   48px 割れを数えない
 *   allsmall  下限を 999 にする（足りているものまで赤くなる）
 *   anycover  `skipped` を全部「覆い」に数える（画面の外まで混ざる）
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
import { openChecked, reportMissing } from "./served.mjs";
import { serveFixtures, reportControl } from "./fixserve.mjs";
import { openFolds, measure, fmtHit, SEL_ALL } from "./hitbox.mjs";
import { PAGES as ISLE_PAGES, DIST } from "./islepages.mjs";
import { writeFileSync } from "node:fs";

const PORT = process.env.PORT || process.env.SPORT || "4203";
const ORIGIN = process.env.ORIGIN || `http://127.0.0.1:${PORT}`;
const MIN = Number(process.env.MIN || 48);
const OUT = process.env.OUT || "/tmp/reachwatch.json";
const BREAK = process.env.BREAK || "";
/** 1枚にかける上限（ミリ秒）。切れたら、その面を名指しして捨てる */
const PAGE_MS = Number(process.env.PAGE_MS || 120000);
/** 入れ物とブラウザを閉じるのにかける上限。**出力はぜんぶこのあと** */
const CLOSE_MS = Number(process.env.CLOSE_MS || 60000);
/** 対照の台だけ回して帰る（書き出しも配り先も要らない。mutation_drill 用） */
const FIXONLY = !!process.env.FIXONLY;

/**
 * 約束に砂時計を付ける。**切れたら投げる。**
 *
 * `page.evaluate()` には時間切れが無い（Playwright の仕様）。中で待っている
 * 約束が解けないと**永久に帰ってこない**ので、呼ぶ側で切る。
 */
function withDeadline(pr, ms, what) {
  let t;
  const bell = new Promise((_, no) => {
    t = setTimeout(() => no(new Error(`${what} が ${Math.round(ms / 1000)}秒で返ってこない`)), ms);
  });
  return Promise.race([Promise.resolve(pr).finally(() => clearTimeout(t)), bell]);
}
const skip = {
  fold: BREAK === "nofold",
  cover: BREAK === "nocover",
  small: BREAK === "nosmall",
};
/** 幅は**スマホとPCの両方**。片方だけだと、もう片方で壊れたことが出ない */
const WIDTHS = (process.env.WIDTHS || "390x844,1280x800")
  .split(",").filter(Boolean).map((s) => s.split("x").map(Number));

/* 面の一覧は**ここに書かない**。書き出したものを歩いて数える
   （`islepages.mjs`）。手で並べると、面が増えた日に一覧は増えず、
   増えたぶんが「測らないまま 0件」に化ける（`docs/island-misses.md` #79） */
const PAGES = (process.env.PAGES || ISLE_PAGES.join(",")).split(",").filter(Boolean);

/**
 * **数えないもの と、その理由。**
 *
 * 名指しで外すと、そこが壊れた日も黙る。だから外すものはここに
 * **理由つきで**並べて、道具が**毎回印字する**（`islepages.mjs` の `SKIP`
 * と同じ決め）。理由は12文字以上。
 */
export const SKIP_SEL = [
  {
    sel: ".isle",
    why:
      "島の中（入口・札・隅の道具）。あやとが歩きカメラが寄るので、止めて1回測ると"
      + "立ち位置1つぶんしか見ない——同じ `/` を2回測って 1件 と 0件 が出た。"
      + "回ごとに揺れる赤は、本物の赤を埋める（docs/island-misses.md #200）。"
      + "島は islecover.mjs（歩きながら覆いを測る）/ islereach.mjs（届く入口の数）/ "
      + "islenav.mjs（引きの札6枚）が見ている。**見ていないのではなく、別の目で見ている**",
  },
];
const SKIP_Q = SKIP_SEL.map((s) => s.sel).join(",");

/** `measure()` の `skipped` のうち、**覆い**だけを拾う。
    「画面の外（送っても入らない）」は覆いではないので混ぜない */
const isCover = (s) => (BREAK === "anycover" ? true : /が上にいる$/.test(s.why || ""));

/**
 * 1面ぶん測る。戻り: { covers, smalls, n, folds, dropped }
 *
 * `SKIP_SEL` に当たるものは、**数える前に印を付けて**落とす。
 * 落とした数は返して、まとめで印字する（0 を「測って 0」と読ませないため）。
 */
/** 本物の面に、わざと覆いを1枚かぶせる（`LID=1`）。置いた先の字を返す */
const LID_JS = `(() => {
  const a = document.querySelector(".ifoot a[href]");
  if (!a) return "";
  const r = a.getBoundingClientRect();
  if (r.width < 8 || r.height < 8) return "";
  /* **板は、相手と同じ重なりの箱の中に置く。** body の直下へ置いて
     z-index を最大にしても、相手の祖先が transform / filter を持っていると
     あちらが別の重なりの箱になり、**板のほうが下に沈む**（実際に沈んで
     「置いたのに 0件」が出た）。親に入れれば、同じ箱の中で後ろに積まれる。 */
  const par = a.parentElement;
  if (getComputedStyle(par).position === "static") par.style.position = "relative";
  const pr = par.getBoundingClientRect();
  const d = document.createElement("div");
  d.id = "rwlid";
  d.setAttribute("style",
    "position:absolute;left:" + (r.left - pr.left - 2) + "px;top:" + (r.top - pr.top - 2) + "px;" +
    "width:" + (r.width + 4) + "px;height:" + (r.height + 4) + "px;" +
    "background:#c33;z-index:99999");
  par.appendChild(d);
  return (a.textContent || "").trim().slice(0, 12);
})()`;

async function look(p, min, { useSkip = true } = {}) {
  const folds = skip.fold ? { opened: 0, stillClosed: 0, folds: 0 } : await openFolds(p);
  /* **横も真ん中まで引き出してから測る**（`inline: "center"`）。
     既定の `nearest` だと、`scroll-snap` の効いた横の道で止まった先が悪く、
     押せる石を「押せない」と数える（`/about` の年表で実際に出た。
     `hitbox.mjs` の `inline` のところに書いてある）。
     **それでも中心が外に落ちるなら、そこは本当に出しきれない**ので挙がる。 */
  const got = await measure(p, {
    sel: SEL_ALL, min, fold: skip.fold ? "skip" : "open",
    inline: BREAK === "noinline" ? "nearest" : "center",
  });
  /* 当たった押しどころが `SKIP_SEL` の中にいるかは、**ブラウザの中で**見る。
     返ってきた行には DOM が無いので、鍵（`k`）で引き直す道が要る——
     `measure()` が付けている `k` は body からの道すじなので、同じ順で
     たどれば同じ要素に着く。 */
  const inSkip = useSkip && SKIP_Q
    ? await p.evaluate((q) => {
        const hit = new Set();
        for (const el of document.querySelectorAll(q))
          for (const t of el.querySelectorAll("*")) hit.add(t);
        for (const el of document.querySelectorAll(q)) hit.add(el);
        const key = (el) => {
          const a = [];
          for (let e = el; e && e !== document.body; e = e.parentElement)
            a.push(e.tagName + ":" + [...(e.parentElement?.children || [])].indexOf(e));
          return a.join("/");
        };
        return [...hit].map(key);
      }, SKIP_Q)
    : [];
  const skipKeys = new Set(inSkip);
  const out = (r) => skipKeys.has(r.k);
  const covers0 = skip.cover ? [] : got.skipped.filter(isCover);
  const smalls0 = skip.small ? [] : got.rows.filter((r) => r.small);
  return {
    n: got.rows.length,
    folds,
    covers: covers0.filter((r) => !out(r)),
    smalls: smalls0.filter((r) => !out(r)),
    dropped: covers0.filter(out).length + smalls0.filter(out).length,
    excluded: got.excluded,
  };
}

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

/** 幅ひとつぶんの入れ物を開く */
async function openCtx(W, H) {
  const ctx = await b.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    isMobile: W < 900, hasTouch: W < 900,
    reducedMotion: "reduce",
  });
  await offline(ctx);
  /* ログインした人にしか中身の出ない面（`/me` `/me/desk`）を測るための差し込み口。
     `SEED=$PWD/tools/sprites/asme.mjs` を渡すと、入っている人として開く
     （`hitbox.mjs` と同じ渡し方）。**CI では渡していない。** 渡さない回に
     測っているのは「入っていない人の姿」で、そこの 0 は「中身を見て 0」では
     ない——中身のある姿は `mesweep.mjs` が見る（`pages.mjs` の断りと同じ）。 */
  if (process.env.SEED) await (await import(process.env.SEED)).apply(ctx);
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("ayato-island-arrived", "2026-09-04");
      localStorage.setItem("ayato-island-walked", "1");
    } catch {}
  });
  return ctx;
}

/* ---- ① 対照。本物を1面も測る前に通す --------------------------------- */

const fx = await serveFixtures("reachwatchfix");
const cctx = await openCtx(390, 844);
const cp = await cctx.newPage();
await cp.goto(fx.base + "/fix.html", { waitUntil: "domcontentloaded" });
await cp.waitForTimeout(200);
const fixMin = BREAK === "allsmall" ? 999 : MIN;
const got = await look(cp, fixMin);
await cctx.close();
fx.close();

const cov = new Set(got.covers.map((s) => s.t));
const sml = new Set(got.smalls.map((r) => r.t));
const checks = [
  { name: "まるごと覆われた 60px「ふた下」", want: true, got: cov.has("ふた下") },
  { name: "畳みの中で覆われた「畳ふた」", want: true, got: cov.has("畳ふた") },
  { name: "覆いの無い 30px「ちび」", want: true, got: sml.has("ちび") },
  { name: "閉じた畳みの中の 30px「畳ちび」", want: true, got: sml.has("畳ちび") },
  { name: "足りている 60px「足大」", want: false, got: cov.has("足大") || sml.has("足大") },
  { name: "畳みの中の 60px「畳大」", want: false, got: cov.has("畳大") || sml.has("畳大") },
  { name: "指の通る覆いの下「透け下」", want: false, got: cov.has("透け下") },
  { name: "display:none の 30px「隠ちび」", want: false, got: cov.has("隠ちび") || sml.has("隠ちび") },
  { name: "1px に畳んだ読み上げ用「読上」", want: false, got: cov.has("読上") || sml.has("読上") },
  { name: "札で押す入力「札つき」", want: false, got: cov.has("札つき") || sml.has("札つき") },
  { name: "横へ送る道の中「道4」", want: false, got: cov.has("道4") || sml.has("道4") },
  { name: "横の道でふたに取られた「道ふた」", want: true, got: cov.has("道ふた") },
  { name: "道より広い札「道広」", want: false, got: cov.has("道広") || sml.has("道広") },
  { name: "画面の外に置いた「外出」", want: false, got: cov.has("外出") || sml.has("外出") },
];
console.log(`===== 対照（仕込んだ${checks.length}件） =====`);
const ctl = reportControl(checks);
/* **足りているものが数に入っていること**まで見る。0 は「全部足りている」では
   なく「その札が1枚も無かった」でも出る（`docs/island-misses.md` #79） */
const seen = got.n;
console.log(`  仕込みの面で数えた押しどころ ${seen}個`);
if (ctl.miss || seen < 6) {
  console.error(
    `\n対照が ${ctl.miss}/${ctl.total} 件外れました` +
      (seen < 6 ? `（数えた押しどころ ${seen}個。仕込みに届いていない）` : "") +
      "。本物の面の数字は出しません。",
  );
  await b.close();
  process.exit(2);
}
console.log(`  ${ctl.total}件ぜんぶ、仕込みはそのとおりに出た\n`);

/* **対照だけで帰る口**（`FIXONLY=1`）。書き出しも配り先も要らないので、
   `python/mutation_drill.py` がここに当てる——測っている実物
   （`hitbox.mjs` の `measure()`）を壊して、上の14件が外れるかを見る。
   本物の面を測らないので、**これが通っても面の合格ではない。** */
if (FIXONLY) {
  await b.close();
  console.log("FIXONLY=1。対照の台だけ見て帰ります（本物の面は測っていません）");
  process.exit(0);
}

/* ---- ② 本物の面 ------------------------------------------------------- */

if (!PAGES.length) {
  console.error(`面が1枚も見つかりません（書き出しの置き場: ${DIST}）。`);
  console.error("`tools/build.sh <ポート>` を回してから、`DIST=` で置き場を渡してください。");
  await b.close();
  process.exit(2);
}

console.log(`書き出しの置き場 ${DIST}`);
console.log(`測る面 ${PAGES.length}面 × 幅 ${WIDTHS.map(([w]) => w).join(" / ")}  下限 ${MIN}px`);
/* **断りは毎回印字する。** 黙って落とすと、そこが壊れた日も 0件 で通る */
console.log("数えないものと、その理由:");
for (const s of SKIP_SEL) console.log(`  ${s.sel} — ${s.why}`);
if (BREAK) console.log(`**わざと盲点を作っています（BREAK=${BREAK}）**`);
if (process.env.LID) console.log("**わざと覆いをかぶせています（LID=1）。1 で落ちなければ、この道具は本物の面に当たっていない**");
console.log("");

const miss = [];
const rows = [];
let taps = 0, opened = 0, stillClosed = 0, dropped = 0, lids = 0;

/* **何枚かを同時に開く。** 136面 × 2幅を1枚ずつ測ると、この箱で2時間かかる
   （北欧の1日ぶりの面は畳みが多く、1枚で30秒を超える）。測っているのは
   `elementFromPoint` ——**版組みの話で、時刻の話ではない**ので、同時に開いても
   答えは変わらない（動くものが混ざる島は `SKIP_SEL` で外してある）。
   コア数より多く開くと取り合って遅くなるだけなので、既定は 3。 */
const JOBS = Number(process.env.JOBS || 3);

/** 1枚測って、見つかったものを `rows` に積む */
async function one(p, W, path) {
  const r = await openChecked(p, ORIGIN, path, { miss });
  if (!r.ok) return;
  await p.waitForTimeout(500);
  if (process.env.LID) {
    const on = await p.evaluate(LID_JS);
    if (on) lids++;
  }
  const g = await look(p, MIN);
  taps += g.n;
  dropped += g.dropped;
  opened += g.folds.opened;
  stillClosed += g.folds.stillClosed;
  for (const s of g.covers)
    rows.push({ W, path, kind: "覆い", t: s.t, c: s.c, box: s.box, fold: s.fold, why: s.why });
  for (const s of g.smalls)
    rows.push({
      W, path, kind: `${MIN}px割れ`, t: s.t, c: s.c, href: s.href,
      box: s.box, hit: fmtHit(s), fold: s.fold,
      rivals: s.rivals.map((v) => `${v.dir}:${v.who}「${v.t}」`),
    });
  if (g.covers.length || g.smalls.length)
    console.log(`${W} ${path}  覆い ${g.covers.length}  ${MIN}px割れ ${g.smalls.length}`);
}

/* **固まった1枚を名指しするための入れ物。** `miss` に積むと
   `reportMissing` が終了コードを 2 にする（0件を出して終わらない） */
const stuck = [];
let done = 0;

for (const [W, H] of WIDTHS) {
  const ctx = await openCtx(W, H);
  const queue = [...PAGES];
  const t0 = Date.now();
  await Promise.all(
    Array.from({ length: Math.max(1, JOBS) }, async () => {
      let p = await ctx.newPage();
      for (let path = queue.shift(); path; path = queue.shift()) {
        try {
          await withDeadline(one(p, W, path), PAGE_MS, `${W} ${path}`);
        } catch (e) {
          /* **止まった1枚で全部を道連れにしない。** その page は
             （中の evaluate が帰ってこないので）捨てて、開き直して続ける */
          const why = String(e.message || e).slice(0, 120);
          console.error(`!! ${W} ${path} で止まりました: ${why}`);
          stuck.push(`${W} ${path}（${why}）`);
          try { await withDeadline(p.close(), 10000, "page.close"); } catch { /* 捨てる */ }
          p = await ctx.newPage();
        }
        done++;
      }
      try { await withDeadline(p.close(), 10000, "page.close"); } catch { /* 捨てる */ }
    }),
  );
  /* **進みをログに残す。** 見つからない回は1行も出ないので、
     止まった回に「どこまで行ったか」の手がかりが無かった */
  console.log(`幅 ${W}: ${PAGES.length}面 を ${((Date.now() - t0) / 1000).toFixed(0)}秒で見た`);
  try {
    await withDeadline(ctx.close(), CLOSE_MS, `幅 ${W} の入れ物を閉じる`);
  } catch (e) {
    console.error(`!! ${String(e.message || e)}（先へ進みます）`);
    stuck.push(`幅 ${W} の入れ物が閉じない`);
  }
}
/* **ここで止まると、下の出力が1行も出ないまま枠を使い切る。**
   打ち切られた13回が全部そう見えていたので、ここにも砂時計を置く */
try {
  await withDeadline(b.close(), CLOSE_MS, "ブラウザを閉じる");
} catch (e) {
  console.error(`!! ${String(e.message || e)}（数えたものは下に出します）`);
  stuck.push("ブラウザが閉じない");
}

/* 並べ替えておく。同時に測ると出る順が回ごとに変わるので、**読み比べられない**
   （前の回と diff を取りたくなるのは必ず起きる） */
rows.sort((a, c) => a.W - c.W || a.path.localeCompare(c.path) || String(a.t).localeCompare(String(c.t)));

writeFileSync(OUT, JSON.stringify(rows, null, 1));

/* **開けなかった面が1枚でもあれば、0 という数字を出して終わらない。**
   `reportMissing` が終了コードを 2 にする */
reportMissing(miss);

console.log("\n===== まとめ =====");
console.log(
  `測った面 ${PAGES.length - new Set(miss.map((m) => m.split("（")[0])).size}/${PAGES.length}面` +
    ` × ${WIDTHS.length}幅  押しどころ ${taps}個  畳み ${opened}個を開いた` +
    `  断ったぶん ${dropped}件（上の理由）` +
    (stillClosed ? `（**開かなかった ${stillClosed}個**）` : ""),
);
const covers = rows.filter((r) => r.kind === "覆い");
const smalls = rows.filter((r) => r.kind !== "覆い");
console.log(`覆い ${covers.length}件 / ${MIN}px割れ ${smalls.length}件  （控え: ${OUT}）`);
if (process.env.LID) console.log(`わざと置いた覆い ${lids}枚（面ごとに1枚）`);
for (const r of covers)
  console.log(`  覆 ${r.W} ${r.path}  ${r.c}「${r.t || "(字なし)"}」 見た目 ${r.box[0]}x${r.box[1]}  ${r.why}${r.fold ? "  畳みの中" : ""}`);
for (const r of smalls)
  console.log(
    `  小 ${r.W} ${r.path}  ${r.c}「${r.t || "(字なし)"}」${r.href ? ` → ${r.href}` : ""}` +
      `  見た目 ${r.box[0]}x${r.box[1]}  当たり ${r.hit}${r.fold ? "  畳みの中" : ""}` +
      (r.rivals.length ? `  隣に食われた: ${r.rivals.join(" ")}` : ""),
  );

/* **止まった面は「見ていない面」。** 0件を出して終わらない */
if (stuck.length) {
  console.error(`\n止まったところが ${stuck.length} 件あります。出した数は当てになりません:`);
  for (const m of stuck) console.error("  - " + m);
  console.error("1枚にかける上限は PAGE_MS（既定 120秒）。**枠を伸ばすのは直しではありません**");
  process.exitCode = 2;
}

if (process.exitCode === 2) process.exit(2);
if (taps < 100) {
  console.error(`\n押しどころが ${taps}個しか見つかりません。数えられていないので 2 で落ちます。`);
  process.exit(2);
}
process.exit(rows.length ? 1 : 0);
