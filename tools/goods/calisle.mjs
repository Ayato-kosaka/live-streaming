/**
 * 卓上カレンダーの試作「イラスト」型のもとになる絵を、**本番のあやと島から撮る。**
 *
 *   node tools/goods/calisle.mjs
 *   SHOT=01 node tools/goods/calisle.mjs       # 片方だけ撮り直す
 *
 * 焼くのは `tools/goods/calbake.py`。ここは**元の絵を作るところまで**で、
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
 * ## 住人は1人も写さない
 *
 * **誰のキャラクターがグッズになるかは、まだ決まっていない。** 顔の分かる
 * 大きさで島に立っていると「もう決まった人」に見えるので、住人の `<g>` は
 * 撮る前に取り除く。残すのは**あやとだけ**（`/characters/ayato.webp`）。
 * 住人の絵は `/island-api/characters/<icon>/plain-128.webp` から来るので、
 * **その道で見分ける**——class が付いていないので名前では拾えない。
 *
 * ついでに、この箱のブラウザは住人の顔の置き場に届かない（`CLAUDE.md`）。
 * 取り除いてから撮るので、**落ちた絵が空の四角として写り込むこともなくなる。**
 *
 * ## 3:4 に切るのは、ここ
 *
 * 焼くほうは「渡された絵を、縦横比を変えずに枠へ収める」だけにしてある
 * （縦横比を変えたら対照が赤くなる）。どこを切り取るかは島の形で変わるので、
 * **陸（`.ig-sand`）の外接矩形をブラウザで測ってから**切る。陸の位置に
 * 座標を書かない——島は章で入れ替わる。
 *
 * **終了コード**: 0＝2枚とも撮れた / 1＝撮れたが島が出ていない /
 * 2＝撮れなかった（本番に届かない・陸が見つからない・ブラウザが無い）
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

/** 撮る窓。島は窓の高さに合わせて引かれるので、**縦を大きく取るほど島が大きく写る** */
const VIEW = { width: 900, height: 1200 };

/** 2倍で撮って、焼くときに半分へ落とす。字も絵も、縮めたほうが締まる */
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
 * 撮る2枚。**同じ島を、引きと寄りで1枚ずつ。**
 *
 * - `01`（1月の面）… 引き。島ぜんぶが海に浮いている絵
 * - `02`（7月の面）… 寄り。降り立ったところ。あやとが大きく写る
 *
 * `pad` は陸の外接矩形に対する余白の割合。引きは海を見せたいので広い。
 */
const SHOTS = [
  { id: "01", wide: true, pad: 1.1 },
  { id: "02", wide: false, pad: 1.0 },
];

/** ブラウザの中で走る。**住人を取り除く。** 返すのは取り除いた人数 */
const dropFolk = () => {
  let n = 0;
  for (const im of document.querySelectorAll("svg image")) {
    const href = im.getAttribute("href") || im.getAttribute("xlink:href") || "";
    if (!/\/characters\//.test(href)) continue;
    if (/\/characters\/ayato\./.test(href)) continue;  // あやとは残す
    const g = im.closest("g");
    if (g) { g.remove(); n += 1; }
  }
  return n;
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
let thin = 0;

for (const shot of SHOTS) {
  if (only && only !== shot.id) continue;
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

  if (shot.wide) {
    await page.click(stage.zoom).catch(() => {});
    await page.waitForTimeout(4000);
  }

  const folk = await page.evaluate(dropFolk);
  /* 島の上の字と道具は、絵の邪魔になるので消す。**札も消す**——
     どの建物に何が入っているかは、カレンダーの絵には要らない */
  await page.addStyleTag({
    content: `${stage.chrome},.isle-labels,.island-bar,[data-ui]{display:none!important}`,
  });
  /* 止めてから撮る。島は rAF で動くので、CSS を止めるだけでは足りない
     （`CLAUDE.md`「文字の濃さ」の項と同じ理由） */
  await page.evaluate(() => {
    window.requestAnimationFrame = () => 0;
    document.getAnimations().forEach((a) => a.pause());
  });
  await page.waitForTimeout(600);

  /* 陸の外接矩形から、3:4 の切り取り枠を出す。**島の座標を書かない** */
  const clip = await page.evaluate(({ sel, aspect, pad }) => {
    const hero = document.querySelector(".hero");
    const land = sel.map((s) => document.querySelector(s)).find(Boolean);
    if (!hero || !land) return null;
    const H = hero.getBoundingClientRect();
    const L = land.getBoundingClientRect();
    let h = Math.min(H.height, L.height * pad);
    let w = h * aspect;
    if (w > H.width) { w = H.width; h = w / aspect; }
    const cx = L.x + L.width / 2, cy = L.y + L.height / 2;
    const x = Math.min(Math.max(cx - w / 2, H.x), H.x + H.width - w);
    const y = Math.min(Math.max(cy - h / 2, H.y), H.y + H.height - h);
    return { x, y, width: w, height: h, land: { w: L.width, h: L.height } };
  }, { sel: stage.land, aspect: ASPECT, pad: shot.pad });

  if (!clip) await bye(browser, 2, `陸（${stage.land.join(" / ")}）が見つかりません`);

  const out = `${SRC}/illust-${shot.id}.png`;
  await page.screenshot({ path: out, clip: { x: clip.x, y: clip.y, width: clip.width, height: clip.height } });

  /* **止めた先を数える。** 通していない先があると、面は壊れているのではなく飢えている */
  const stop = [...blocked(ctx).entries()].map(([h, n]) => `${h}×${n}`).join(" ");
  console.log(
    `撮った: ${out.replace(fromRoot(""), "")}  ${shot.wide ? "引き" : "寄り"}`
    + `  陸 ${clip.land.w.toFixed(0)}×${clip.land.h.toFixed(0)}`
    + `  枠 ${clip.width.toFixed(0)}×${clip.height.toFixed(0)}（${(clip.width / clip.height).toFixed(4)}）`
    + `  住人を外した ${folk}人`
  );
  if (stop) console.log(`  止めた先: ${stop}`);
  /* 島が出ていない（陸が窓の1割も無い）なら、撮れてはいるが使えない */
  if (clip.land.w < VIEW.width * 0.1) thin += 1;
  await ctx.close();
}

await browser.close();
if (thin) { console.error(`島が小さすぎる面が ${thin} 枚`); process.exit(1); }
process.exit(0);
