/**
 * 卓上カレンダーの試作「イラスト」型の**背景**を、本番のあやと島から撮る。
 *
 *   node tools/goods/calisle.mjs
 *   SHOT=01 node tools/goods/calisle.mjs       # 片方だけ撮り直す
 *
 * 焼くのは `tools/goods/calbake.py`。ここは**背景を作るところまで**で、
 * 主役のあやと（`site/public/characters/ayato.webp`）を大きく重ねるのはあちら。
 * 書き出し先は `tools/goods/cal-src/illust-01.png` と `illust-02.png`。
 *
 * ## なぜ別の道具にしてあるか
 *
 * 焼くほうは PIL だけで動く（ブラウザも網も要らない）。島を撮るほうは
 * ブラウザと本番への道が要る。**同じ道具にすると、字を1つ直すたびに
 * 本番を開くことになる**し、ブラウザの無い箱では焼くことすらできなくなる。
 * 撮った絵は `cal-src/` に残るので、焼き直しは何度でもブラウザ無しで回る。
 *
 * ## この箱のブラウザは本番に届かない
 *
 * proxy が `ERR_CONNECTION_RESET` を返すので、`tools/sprites/prod.mjs` の
 * `viaCurl` を通して curl の答えをブラウザに流し込む（`docs/island-standards.md` 4章）。
 *
 * ## 紙に刷るものに、ウェブの見出しを焼かない（2026-10-10）
 *
 * 1回目は看板（「あやと島」のロゴ）と帯（「毎晩22時、世界のどこかから生放送」
 * 「旅して、食べて、グルメアプリを作る、夜の居場所」）が入ったまま撮っていた。
 * **あれはウェブの見出しであって、紙に刷るものではない。** 12ヶ月ぜんぶの絵の上に
 * 同じ宣伝文が乗ることになる。`.hero-ui`（ロゴと帯）と `.isle-sign` を消してから撮る。
 *
 * ## 住人も、島のあやとも消す
 *
 * **誰のキャラクターがグッズになるかは、まだ決まっていない。** 顔の分かる
 * 大きさで島に立っていると「もう決まった人」に見えるので、住人の `<g>` は
 * 撮る前に取り除く。住人の絵は `/island-api/characters/<icon>/plain-128.webp`
 * から来るので、**その道で見分ける**——class が付いていないので名前では拾えない。
 *
 * **島のあやとも取り除く。** 引きの島では 20px ほどの点にしかならず、
 * 主役にならない。主役は焼くほうで `characters/ayato.webp` を大きく重ねて作る。
 * 同じ人が2人になる心配は、島の側から消しているので起きない。
 *
 * ついでに、この箱のブラウザは住人の顔の置き場に届かない（`CLAUDE.md`）。
 * 取り除いてから撮るので、**落ちた絵が空の四角として写り込むこともなくなる。**
 *
 * ## 2枚は、島の別の場所（2026-10-10）
 *
 * 1回目は「同じ島の引きと寄り」で、切り方しか違わなかった。
 * `scene` は別の街、`archive` は別の配信なので、ここだけ同じ絵では
 * **12ヶ月ぶんの見当がつかない。** いまは1回の引きから2か所を切り出す。
 *
 * - `01` … **浜と海**。島の下ふち。水ぎわが枠の下のほうに来るように取る
 * - `02` … **建物の並び**。建物の当たり（`.isle-hit`）の重心に寄せる
 *
 * ## 3:4 に切るのは、ここ
 *
 * 焼くほうは「渡された絵を、縦横比を変えずに枠へ収める」だけにしてある
 * （縦横比を変えたら対照が赤くなる）。どこを切り取るかは島の形で変わるので、
 * **陸（`.ig-sand`）の外接矩形と建物の位置をブラウザで測ってから**切る。
 * 座標を書かない——島は章で入れ替わる。
 *
 * **終了コード**: 0＝2枚とも撮れた / 1＝撮れたが使えない（建物が1つも取れない・
 * 紙の上で引き伸ばすことになる） / 2＝撮れなかった（本番に届かない・
 * 陸が見つからない・ブラウザが無い）
 */
import { existsSync, mkdirSync } from "fs";
import { pathToFileURL } from "url";
import { fromRoot } from "../sprites/repo.mjs";
import { viaCurl, ORIGIN, blocked } from "../sprites/prod.mjs";
import { findStage } from "../sprites/stage.mjs";

/** 焼くほうが読む置き場。**配らない元の絵**（`site/public/` には置かない） */
const SRC = fromRoot("tools/goods/cal-src");

/** 出来上がりの左の欄と同じ縦横比。ここを変えたら焼くほうの `PHOTO` も変える */
const ASPECT = 476 / 635;

/** 撮る窓。引きの島は**窓の高さ**に合わせて置かれるので、縦が大きいほど島が大きく写る */
const VIEW = { width: 1100, height: 1500 };

/** 2倍で撮る。切り出す帯は 400〜500px なので、焼くときは縮めるだけで済む */
const DPR = 2;

const BOX = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

/**
 * **`playwright-core` は `tools/sprites/node_modules` にしか入っていない。**
 * node は読んだファイルの場所から上へ登って `node_modules` を探すので、
 * `tools/goods/` から素直に import すると見つからない。リポジトリの根から
 * 道を組んで、そこを直に読む（根の求めかたは `repo.mjs`。場所を直に書かない）。
 */
const { chromium } = await import(
  pathToFileURL(fromRoot("tools/sprites/node_modules/playwright-core/index.mjs")).href
);

/**
 * 撮る2枚。**同じ引きの島から、別の場所を1枚ずつ。**
 *
 * `h` は切り出す帯の高さ（陸の縦幅に対する割合）。
 * `at` は切り出しのまんなかを返す——**島の座標を書かず、測った値から出す。**
 */
const SHOTS = [
  {
    id: "01",
    what: "浜と海",
    h: 0.46,
    /* 水ぎわが枠の下のほうに来るところ。下に海、上に浜と草と木が残る */
    at: (land) => ({ x: land.x + land.width * 0.44, y: land.y + land.height * 0.80 }),
  },
  {
    id: "02",
    what: "建物の並び",
    h: 0.42,
    /* 建物の重心。どこに建っているかは章で変わるので、測ってから決める */
    at: (land, spots) => {
      if (!spots.length) return { x: land.x + land.width / 2, y: land.y + land.height * 0.45 };
      const cx = spots.reduce((s, b) => s + b.x + b.w / 2, 0) / spots.length;
      const cy = spots.reduce((s, b) => s + b.y + b.h / 2, 0) / spots.length;
      return { x: cx, y: cy };
    },
  },
];

/**
 * ブラウザの中で走る。**住人とあやとを取り除く。** 返すのは `[住人, あやと, 影]`。
 *
 * class が付いていないので名前では拾えない。住人は
 * `/island-api/characters/<icon>/plain-128.webp`、あやとは `/characters/ayato.webp`
 * から来るので、**絵の出どころで見分ける。**
 */
const dropPeople = () => {
  let folk = 0;
  let me = 0;
  for (const im of document.querySelectorAll("svg image")) {
    const href = im.getAttribute("href") || im.getAttribute("xlink:href") || "";
    if (!/\/characters\//.test(href)) continue;
    const g = im.closest("g");
    if (!g) continue;
    if (/\/characters\/ayato\./.test(href)) { me += 1; } else { folk += 1; }
    g.remove();
  }
  /* あやとは足もとの影（`rx=22` の `<ellipse>`）を別に持っている。絵だけ消すと、
     誰も立っていないところに黒い楕円が落ちる */
  let shade = 0;
  for (const e of document.querySelectorAll("svg ellipse[rx='22']")) { e.remove(); shade += 1; }
  return [folk, me, shade];
};

const bye = async (b, code, msg) => {
  if (msg) console.error(msg);
  if (b) await b.close();
  process.exit(code);
};

if (!existsSync(BOX)) {
  console.error(`ブラウザが ${BOX} にありません`);
  process.exit(2);
}
mkdirSync(SRC, { recursive: true });

const only = process.env.SHOT || "";
const browser = await chromium.launch({ executablePath: BOX, args: ["--no-sandbox"] });

/* **1回だけ開く。** 2枚は同じ島の別の場所なので、開き直す理由が無い
   （開き直すと木の揺れや波の位相が変わって、2枚で島の見え方がずれる） */
const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: DPR });
await viaCurl(ctx);
const page = await ctx.newPage();
await page.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded" });

let stage;
try {
  stage = await findStage(page);
} catch (e) {
  await bye(browser, 2, `島が出ません: ${String(e.message || e)}`);
}
/* curl 経由なので1本ずつ順に取る。**短くすると絵が間に合わず「落ちた」と出る** */
await page.waitForTimeout(12000);

await page.click(stage.zoom).catch(() => {});
await page.waitForTimeout(4000);

/* **建物の位置は、札を消す前に測る。** 当たり（`.isle-hit`）は `.isle-labels` の中 */
const spots = await page.evaluate(() => [...document.querySelectorAll(".isle-hit")]
  .map((e) => e.getBoundingClientRect())
  .filter((r) => r.width > 0 && r.height > 0)
  .map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height })));

const [folk, me, shade] = await page.evaluate(dropPeople);
/* 島の上の字・道具・札と、**ウェブの見出し（ロゴと帯）**を消す */
await page.addStyleTag({
  content: `${stage.chrome},.isle-labels,.isle-sign,.hero-ui,.island-bar,[data-ui]{display:none!important}`,
});
/* 止めてから撮る。島は rAF で動くので、CSS を止めるだけでは足りない
   （`CLAUDE.md`「文字の濃さ」の項と同じ理由） */
await page.evaluate(() => {
  window.requestAnimationFrame = () => 0;
  document.getAnimations().forEach((a) => a.pause());
});
await page.waitForTimeout(600);

const land = await page.evaluate((sel) => {
  const hero = document.querySelector(".hero");
  const el = sel.map((s) => document.querySelector(s)).find(Boolean);
  if (!hero || !el) return null;
  const H = hero.getBoundingClientRect(), L = el.getBoundingClientRect();
  return {
    hero: { x: H.x, y: H.y, w: H.width, h: H.height },
    x: L.x, y: L.y, width: L.width, height: L.height,
  };
}, stage.land);
if (!land) await bye(browser, 2, `陸（${stage.land.join(" / ")}）が見つかりません`);

let thin = 0;
for (const shot of SHOTS) {
  if (only && only !== shot.id) continue;
  const c = shot.at(land, spots);
  const H = land.hero;
  let h = land.height * shot.h;
  let w = h * ASPECT;
  if (h > H.h) { h = H.h; w = h * ASPECT; }
  if (w > H.w) { w = H.w; h = w / ASPECT; }
  const x = Math.min(Math.max(c.x - w / 2, H.x), H.x + H.w - w);
  const y = Math.min(Math.max(c.y - h / 2, H.y), H.y + H.h - h);

  const out = `${SRC}/illust-${shot.id}.png`;
  await page.screenshot({ path: out, clip: { x, y, width: w, height: h } });
  console.log(
    `撮った: ${out.replace(fromRoot(""), "")}  ${shot.what}`
    + `  枠 ${w.toFixed(0)}×${h.toFixed(0)}（${(w / h).toFixed(4)}）`
    + `  まんなか ${c.x.toFixed(0)},${c.y.toFixed(0)}`
  );
  /* 焼く先は 476×635。撮った帯がそれより小さいと、紙の上で引き伸ばすことになる */
  if (h * DPR < 635) thin += 1;
}

console.log(
  `陸 ${land.width.toFixed(0)}×${land.height.toFixed(0)}  建物 ${spots.length}軒`
  + `  外した 住人 ${folk}人 ／ あやと ${me}体 ／ 足もとの影 ${shade}個`
);
/* **止めた先を数える。** 通していない先があると、面は壊れているのではなく飢えている */
const stop = [...blocked(ctx).entries()].map(([h, n]) => `${h}×${n}`).join(" ");
if (stop) console.log(`止めた先: ${stop}`);

await browser.close();
if (!spots.length) { console.error("建物の当たりが1つも取れなかった"); process.exit(1); }
if (thin) { console.error(`焼くときに引き伸ばすことになる面が ${thin} 枚`); process.exit(1); }
process.exit(0);
