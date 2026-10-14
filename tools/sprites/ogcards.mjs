/**
 * **区画ごとの「貼られたときの1枚」を焼く**（`site/public/og/*.png`、1200×630）。
 *
 *   node tools/sprites/ogcards.mjs              # 全部焼く
 *   ONLY=kitchen,nordic node tools/sprites/ogcards.mjs
 *   OUT=/tmp/ogcards node tools/sprites/ogcards.mjs   # 置き場を変えて下見する
 *
 * 終了コード 0=ぜんぶ焼けた / 1=焼けたが絵になっていない / 2=焼けなかった。
 *
 * ## なぜ島の絵を貼り直すのではなく、組んで焼くのか
 *
 * `og.mjs`（表紙の1枚）は**島をそのまま撮る**。あれは島そのものを見せる面だから。
 * 区画の1枚は違う——`/kitchen` を貼った人が伝えたいのは「島のどこか」ではなく
 * **台所**なので、台所の物だけを大きく出す。相手の画面では 300px 前後に縮むので、
 * 置くのは3つだけ（`docs/island-design.md` 8章の決めごと4）——
 * **島の看板・区画の呼び名・その区画の物。**
 *
 * ## 字は呼び名ひとつだけ。出どころは `site/lib/ogCards.json`
 *
 * 面の題（`og:title`）と同じ出どころから引く。手で書くと、呼び名を変えた日に
 * 絵だけ古いまま配られる（`docs/island-misses.md` #134 がそれ）。
 * 食い違ったら `tools/sprites/ogmeta.mjs` が赤くする。
 *
 * ## 字は焼いた woff2 から出す
 *
 * `site/public/fonts/*.woff2` は島で使う字だけを焼いた丸ゴシック。
 * この箱の Chromium には日本語の字が入っていないので、**読まないと豆腐で焼ける。**
 * 焼く前に「呼び名の字が、どれかの束の `unicode-range` に入っているか」を
 * 数えて、1字でも外れていたら**絵を1枚も出さずに 2 で落ちる**
 * （豆腐は絵としては出るので、見ないと気づけない）。
 *
 * ## 絵は実寸より大きい版から縮める
 *
 * 2400×1260 で撮って 1200×630 へ落とす。等倍で撮ると、丸ゴシックの
 * 曲がりと接地影の端がざらつく。縮めるのは `sips` ではなく Python の
 * Pillow（この箱に在る）。
 */
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { chromium } from "playwright-core";
import { fromRoot, repoPath } from "./repo.mjs";

/** 焼いたスプライトの寸法（`site/content/sprites.json`。自動生成） */
const SIZES = JSON.parse(readFileSync(repoPath("site/content/sprites.json"), "utf8"));

/**
 * 置くものの実寸を出す。**背（`h`）と中心（`cx`）で指定して、幅は絵から決める。**
 *
 * 幅で指定すると、絵ごとに縦横の比が違うぶん背がそろわず、並べたときに
 * 大きさの揃っていない絵になる（`docs/island-standards.md` §11）。
 *
 * @returns {{w:number,h:number,left:number}|null} 寸法が分からなければ null
 */
export function box(c, sizes = SIZES) {
  const m = sizes[c.s.replace(/^hero\//, "")];
  if (!m) return null;
  const w = Math.round((c.h * m.w) / m.h);
  return { w, h: c.h, left: Math.round(c.cx - w / 2) };
}

const CARDS = JSON.parse(readFileSync(repoPath("site/lib/ogCards.json"), "utf8")).cards;

/**
 * 区画ごとに置く物。**x は左から、y は下から**（1200×630 の中の px）、w は幅。
 *
 * 置く数は3つまで（4つ目を足したくなったら、相手の画面で 300px に縮むことを思い出す）。
 * 絵は `site/public/sprites/`。`hero/` に大きい版があるものはそちらを使う。
 */
const CAST = {
  streams: [
    { s: "tower-studio", h: 330, cx: 900, y: 150 },
    { s: "bench", h: 190, cx: 718, y: 96 },
    { s: "lantern", h: 230, cx: 1062, y: 104 },
  ],
  kitchen: [
    { s: "hero/hut-kitchen", h: 320, cx: 890, y: 150 },
    { s: "food-pot-stew", h: 170, cx: 713, y: 78 },
    { s: "food-pizza", h: 120, cx: 1029, y: 66 },
  ],
  map: [
    { s: "globe-stand", h: 330, cx: 760, y: 140 },
    { s: "signpost-flags", h: 300, cx: 980, y: 130 },
    { s: "path-stone", h: 110, cx: 870, y: 62 },
  ],
  apps: [
    { s: "hero/hut-workshop", h: 300, cx: 880, y: 150 },
    { s: "barrel", h: 190, cx: 716, y: 80 },
    { s: "bush-large", h: 160, cx: 1030, y: 70 },
  ],
  legends: [
    { s: "hero/stage-award", h: 300, cx: 890, y: 140 },
    { s: "flower-yellow-tall", h: 180, cx: 1057, y: 90 },
    { s: "stone-tall", h: 170, cx: 696, y: 84 },
  ],
  months: [
    { s: "watermill", h: 310, cx: 880, y: 142 },
    { s: "bench-short", h: 200, cx: 700, y: 110 },
    { s: "flower-yellow-tall", h: 170, cx: 1062, y: 98 },
  ],
  friends: [
    { s: "villager-female-a", h: 250, cx: 740, y: 120 },
    { s: "villager-male-d", h: 290, cx: 880, y: 96 },
    { s: "villager-female-c", h: 250, cx: 1042, y: 122 },
  ],
  board: [
    { s: "hero/signboard", h: 330, cx: 860, y: 150 },
    { s: "mailbox", h: 250, cx: 1055, y: 92 },
    { s: "stump-round", h: 150, cx: 698, y: 72 },
  ],
  next: [
    { s: "tent", h: 280, cx: 791, y: 140 },
    { s: "stall-green", h: 280, cx: 990, y: 120 },
    { s: "flower-red-tall", h: 160, cx: 884, y: 76 },
  ],
  now: [
    { s: "tent-small", h: 260, cx: 760, y: 140 },
    { s: "campfire", h: 200, cx: 940, y: 104 },
    { s: "log", h: 130, cx: 1046, y: 72 },
  ],
  cards: [
    { s: "hero/tree-palm", h: 360, cx: 962, y: 160 },
    { s: "villager-female-b", h: 250, cx: 724, y: 110 },
    { s: "bench-short", h: 170, cx: 884, y: 76 },
  ],
  nordic: [
    { s: "tree-snow", h: 330, cx: 744, y: 150 },
    { s: "reindeer", h: 250, cx: 940, y: 104 },
    { s: "sled", h: 160, cx: 1037, y: 74 },
  ],
  atlas: [
    { s: "hall-museum", h: 290, cx: 880, y: 150 },
    { s: "statue-column", h: 230, cx: 684, y: 92 },
    { s: "rock-flat", h: 120, cx: 1041, y: 64 },
  ],
  goods: [
    { s: "stall", h: 260, cx: 784, y: 140 },
    { s: "cart", h: 250, cx: 983, y: 110 },
    { s: "sack", h: 150, cx: 892, y: 70 },
  ],
  about: [
    { s: "hut-ayato", h: 300, cx: 884, y: 150 },
    { s: "bench-short", h: 200, cx: 707, y: 82 },
    { s: "pot-plant", h: 170, cx: 1035, y: 72 },
  ],
  all: [
    { s: "signpost", h: 320, cx: 744, y: 140 },
    { s: "signpost-flags", h: 300, cx: 950, y: 124 },
    { s: "mushroom-tall", h: 150, cx: 1086, y: 68 },
  ],
  updates: [
    { s: "cart", h: 250, cx: 776, y: 130 },
    { s: "firewood-large", h: 170, cx: 952, y: 90 },
    { s: "barrel", h: 190, cx: 1043, y: 74 },
  ],
  northMacedonia: [
    { s: "rock-tall", h: 290, cx: 764, y: 136 },
    { s: "tree-pine-tall", h: 250, cx: 946, y: 112 },
    { s: "lily", h: 130, cx: 1040, y: 60 },
  ],
};

/**
 * 地に撒く草花。**物（3つ）とは別**で、どの札にも同じものを撒く。
 * 緑の板に見えないようにするための地の模様で、見るものではない。
 */
const GARNISH = [
  { s: "grass-large", h: 70, cx: 130, y: 22 },
  { s: "flower-yellow", h: 60, cx: 286, y: 30 },
  { s: "grass", h: 56, cx: 430, y: 24 },
  { s: "flower-red", h: 62, cx: 560, y: 20 },
  { s: "grass-leafs", h: 60, cx: 664, y: 302 },
  { s: "flower-purple", h: 58, cx: 740, y: 256 },
  { s: "grass", h: 56, cx: 914, y: 278 },
  { s: "bush-small", h: 66, cx: 1096, y: 252 },
  { s: "flower-yellow", h: 62, cx: 1140, y: 58 },
  { s: "grass-large", h: 68, cx: 1142, y: 302 },
];

/**
 * 地の模様が枠から切れない広さ。**呼び名の札の下に潜らせない**——
 * 札の後ろから草の足だけが出ると、切れた絵に見える（撮って気づいた）。
 */
const GARNISH_FRAME = { left: 8, right: 1192, bottom: 10, top: 380 };

/**
 * 物が枠から切れない内側の広さ。**ここを外れたら焼かずに落ちる**
 *
 * 右の端は 1144（56px の余白）。上は 566——**海にかぶるのは正しい**
 * （手前に立っている物は、遠くの水平線を隠す）が、枠で切れるのは違う。
 */
const FRAME = { left: 612, right: 1144, bottom: 56, top: 566 };


/**
 * 呼び名を1〜2行に割る。**行の折れ方は機械に任せない**
 * （`docs/island-standards.md` §16。`text-wrap: balance` は行の長さを均すだけで、
 * どこで切るかは選ばない）。`wrap` が無ければ1行。
 */
export function lines(label, wrap) {
  if (!wrap) return [label];
  const cs = [...label];
  return [cs.slice(0, wrap).join("").trim(), cs.slice(wrap).join("").trim()].filter(Boolean);
}

/** いちばん長い行の字数で、札の字の大きさを決める。相手の画面では 1/4 に縮む */
export function labelSize(ls) {
  const n = Math.max(...ls.map((l) => [...l].length));
  if (n <= 2) return 110;
  if (n <= 3) return 102;
  if (n <= 4) return 92;
  if (n <= 5) return 84;
  return 76;
}

/**
 * 焼いた woff2 が、その字を持っているか。
 *
 * **持っていないと豆腐で焼ける。** 絵としては出るので、
 * ここで数えないと「焼けた」と言ってしまう。
 */
export function missingGlyphs(label, fontsCss) {
  const ranges = [];
  for (const m of fontsCss.matchAll(/unicode-range:\s*([^;]+);/g)) {
    for (const part of m[1].split(",")) {
      const t = part.trim();
      const one = /^U\+([0-9A-Fa-f]+)$/.exec(t);
      const two = /^U\+([0-9A-Fa-f]+)-([0-9A-Fa-f]+)$/.exec(t);
      if (one) ranges.push([parseInt(one[1], 16), parseInt(one[1], 16)]);
      else if (two) ranges.push([parseInt(two[1], 16), parseInt(two[2], 16)]);
    }
  }
  const miss = [];
  for (const ch of label) {
    const c = ch.codePointAt(0);
    if (!ranges.some(([a, b]) => c >= a && c <= b)) miss.push(ch);
  }
  return miss;
}

/**
 * 枠から切れる物を探す。**切れた物は「置いた」のに写っていない。**
 *
 * 絵としては出るので、見張りでは捕まらない（`og:image` は在るし、1200×630 もある）。
 * 焼く前にここで数えて、1つでも外れていたら絵を1枚も出さずに落ちる。
 *
 * @returns {string[]} 外れたものの説明。空なら全部おさまっている
 */
export function clipped(cast = CAST, frame = FRAME, sizes = SIZES) {
  const out = [];
  for (const [k, items] of Object.entries(cast)) {
    for (const c of items) {
      const b = box(c, sizes);
      if (!b) { out.push(`${k}/${c.s}: 寸法が sprites.json に無い（大きさが決まらないので置けない）`); continue; }
      if (b.left < frame.left) out.push(`${k}/${c.s}: 左へ ${frame.left - b.left}px はみ出す`);
      if (b.left + b.w > frame.right) out.push(`${k}/${c.s}: 右へ ${b.left + b.w - frame.right}px はみ出す`);
      if (c.y < frame.bottom) out.push(`${k}/${c.s}: 下へ ${frame.bottom - c.y}px はみ出す`);
      if (c.y + b.h > frame.top) out.push(`${k}/${c.s}: 上へ ${c.y + b.h - frame.top}px はみ出す（背 ${b.h}px）`);
    }
  }
  return out;
}

/** 1枚ぶんの HTML。地・島の看板・呼び名の札・その区画の物の4つしか置かない */
function cardHtml(key, card, cssHref) {
  const prop = (c, cls) => {
    const b = box(c);
    return `<img class="${cls}" src="/sprites/${c.s}.webp" style="width:${b.w}px;left:${b.left}px;bottom:${c.y}px">`;
  };
  const ls = lines(card.label, card.wrap);
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<link rel="stylesheet" href="${cssHref}">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:1200px;height:630px;overflow:hidden}
  body{
    position:relative;
    font-family:"Maru Island",system-ui,sans-serif;
    /* 地は島の芝。光は左上から（docs/island-design.md 2章の2・5） */
    background:
      radial-gradient(1020px 700px at 16% 104%, rgba(255,255,255,.26), rgba(255,255,255,0) 66%),
      linear-gradient(176deg,#6fe06f 0%,#54cc5f 46%,#39ae54 100%);
  }
  /* 沖。**海が写っていないと島に見えない**（docs/island-design.md 8章の決めごと3） */
  .sea{
    position:absolute;left:0;right:0;top:0;height:172px;
    background:linear-gradient(180deg,#1286d8 0%,#2ea5ef 44%,#4ddaea 82%,#94f4f0 100%);
  }
  /* 波打ち際。泡 → 濡れた砂 → 砂。四角い切り替わりを作らない（2章の5） */
  .foam{
    position:absolute;left:-70px;right:-70px;top:148px;height:32px;
    background:#ffffff;
    border-radius:50% 50% 50% 50% / 44px 44px 28px 28px;
  }
  .sand{
    position:absolute;left:-70px;right:-70px;top:168px;height:76px;
    background:linear-gradient(180deg,#ecce8d 0%,#f9e4a9 46%,#f2dc9d 100%);
    border-radius:50% 50% 50% 50% / 34px 34px 52px 52px;
  }
  .mark{position:absolute;left:64px;top:36px;width:236px;filter:drop-shadow(2px 7px 3px rgba(32,54,70,.34))}
  /* 呼び名の札。押せるものではないので厚みは付けない。落ち影だけ（3章の3） */
  .plate{
    position:absolute;left:64px;bottom:120px;
    padding:24px 40px 30px;
    background:linear-gradient(180deg,#fffbe8 0%,#fdf1cf 100%);
    border:7px solid #f2b054;border-radius:34px;
    box-shadow:3px 13px 3px rgba(40,54,26,.40);
  }
  .plate b{
    display:block;font-weight:900;color:#5b3f15;
    font-size:${labelSize(ls)}px;line-height:1.14;white-space:nowrap;letter-spacing:.01em;
  }
  .prop{position:absolute}
  /* 地の模様。見るものではないので、薄くして後ろへ下げる */
  .garnish{position:absolute;opacity:.72}
</style></head><body>
<div class="sea"></div>
<div class="foam"></div>
<div class="sand"></div>
${GARNISH.map((c) => prop(c, "garnish")).join("\n")}
${(CAST[key] || []).map((c) => prop(c, "prop")).join("\n")}
<img class="mark" src="/logos/ayato-island-mark.webp" alt="">
<div class="plate">${ls.map((l) => `<b>${l}</b>`).join("")}</div>
</body></html>`;
}

/** `site/public` と、組み立てた HTML を1つの置き場として配る */
function serve(pub, pages, cssText) {
  const TYPES = { ".webp": "image/webp", ".png": "image/png", ".woff2": "font/woff2", ".css": "text/css" };
  const srv = createServer((req, res) => {
    const path = decodeURIComponent(req.url.split("?")[0]);
    if (pages[path]) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(pages[path]);
    }
    if (path === "/__fonts.css") {
      res.writeHead(200, { "content-type": "text/css; charset=utf-8" });
      return res.end(cssText);
    }
    const f = join(pub, path);
    if (!f.startsWith(pub) || !existsSync(f)) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" });
    res.end(readFileSync(f));
  });
  return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok(srv)));
}

async function main() {
  const pub = repoPath("site/public");
  const out = fromRoot(process.env.OUT || "site/public/og");
  const only = (process.env.ONLY || "").split(",").filter(Boolean);
  const keys = Object.keys(CARDS).filter((k) => CARDS[k].made !== false && (!only.length || only.includes(k)));

  if (!keys.length) {
    console.log("::error::焼く札が1枚もありません（ogCards.json が読めていない）");
    return 2;
  }
  const noCast = keys.filter((k) => !CAST[k]);
  if (noCast.length) {
    console.log(`::error::置く物の決まっていない札: ${noCast.join(" ")}（CAST に足す）`);
    return 2;
  }

  // 字が焼いた束に入っているか。入っていなければ豆腐で焼ける
  const cssText = readFileSync(repoPath("site/app/css/fonts.css"), "utf8");
  const bad = keys
    .map((k) => [k, missingGlyphs(CARDS[k].label, cssText)])
    .filter(([, m]) => m.length);
  if (bad.length) {
    for (const [k, m] of bad) console.log(`::error::${k}: 焼いた字に無い文字 ${m.join("")}（tools/fonts/subset.py を回す）`);
    return 2;
  }

  // 置く物が本当に在るか。無い絵は空で写る
  const cut = [
    ...clipped(Object.fromEntries(keys.map((k) => [k, CAST[k]]))),
    ...clipped({ 地の模様: GARNISH }, GARNISH_FRAME),
  ];
  if (cut.length) {
    for (const c of cut) console.log(`::error::枠から切れる ${c}`);
    return 2;
  }

  const lost = [];
  for (const k of keys) for (const c of CAST[k]) {
    if (!existsSync(join(pub, "sprites", `${c.s}.webp`))) lost.push(`${k}: ${c.s}`);
  }
  if (lost.length) {
    for (const l of lost) console.log(`::error::置く絵が無い ${l}`);
    return 2;
  }

  const pages = {};
  for (const k of keys) pages[`/${k}.html`] = cardHtml(k, CARDS[k], "/__fonts.css");
  const srv = await serve(pub, pages, cssText);
  const port = srv.address().port;

  mkdirSync(out, { recursive: true });
  const shots = mkdtempSync(join(tmpdir(), "ogcards-"));
  const chrome = process.env.CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  const b = await chromium.launch(existsSync(chrome) ? { executablePath: chrome } : {});
  const ctx = await b.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
  const made = [];
  for (const k of keys) {
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${port}/${k}.html`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const big = join(shots, `${k}.png`);
    await page.screenshot({ path: big });
    await page.close();
    made.push([k, big, join(out, CARDS[k].file.replace(/^\/og\//, ""))]);
  }
  await b.close();
  srv.close();

  // 2400×1260 → 1200×630。縮めて、色を 256 に畳んでから置く
  //
  // 畳むのは置き場のため（1枚 346KB → 87KB。17枚で 5.9MB → 1.5MB）。
  // 絵はどれも平らな面と緩い階調なので、誤差拡散つきの 256 色で見分けがつかない
  // （並べて比べた）。**写真を置く日が来たら、ここは考え直すこと。**
  const py = made.map(([, big, dest]) => `shrink(${JSON.stringify(big)},${JSON.stringify(dest)})`).join("\n");
  execFileSync("python3", ["-I", "-c",
    "from PIL import Image\n" +
    "def shrink(a,b):\n" +
    "    im=Image.open(a).convert('RGB').resize((1200,630),Image.LANCZOS)\n" +
    "    im.quantize(colors=256,method=Image.MEDIANCUT,dither=Image.FLOYDSTEINBERG).save(b,optimize=True)\n" +
    py]);
  rmSync(shots, { recursive: true, force: true });

  for (const [k, , dest] of made) console.log(`${k}: ${dest}`);
  console.log(`焼いた札 ${made.length}枚 / 置き場 ${out}`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(await main());
