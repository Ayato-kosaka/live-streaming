/**
 * `ogmeta.mjs` の**判定だけ**を、焼き出しもブラウザも無しで確かめる。
 *
 *     node tools/sprites/ogmeta_selftest.mjs
 *
 * 終了コード 0=ぜんぶ通った / 1=落ちた / 2=数えるものが無い。
 * **回し役（`python/selftest_runner.py`）が拾うので、毎 PR で走る。**
 *
 * ## なぜ要るか
 *
 * 本体は焼き出し（`site/.next-*`）が要るので、回せるのは CI の
 * `browserwatch`（書き出す job）だけ。あちらが落ちている日に、判定そのものが
 * 腐っていても誰も気づかない。**腐ったときに出るのは「違反 0」**
 * （`docs/island-standards.md` §15）なので、判定だけはここで毎回当てる。
 *
 * ## 足を1本ずつ抜く
 *
 * `BREAK=` で足を1本抜くと、**その足が捕まえていた台だけ**が通ってしまう。
 * 6本の足それぞれについて、抜いたら通る台が1つ以上あることまで見る。
 * 「壊し方を6通り当てた」が、同じ1本の足を折っているだけ、を防ぐため
 * （`docs/island-misses.md` #128 の決めごと1）。
 *
 * ## 名簿（`site/lib/ogCards.json`）も見る
 *
 * 焼いた絵と名簿が食い違うと、本体は 1 ではなく「絵が無い」で落ちる。
 * 名簿に在る札の絵が `site/public/og/` に置いてあることは、ここで数える
 * （ブラウザも焼き出しも要らない）。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CARDS_C, CONTROLS, LOOK_C, cardsOf, headOf, judge, pixelsOf, runControls } from "./ogmeta.mjs";
import { repoPath } from "./repo.mjs";

const ok = [];
const ng = [];
const check = (label, got, want) =>
  (String(got) === String(want) ? ok : ng).push(`${label}: 出た=${got} ほしい=${want}`);

/* 1. 足を全部つけた状態で、台が全部思ったとおりに落ちる */
check("足を全部つけた対照", runControls().length, 0);

/* 2. 足を1本ずつ抜く。**抜いた足が捕まえていた台が、通ってしまうこと**を見る */
const LEGS = ["empty", "abs", "size", "same", "dup", "self", "label"];
for (const leg of LEGS) {
  const caught = CONTROLS.filter((c) => c.leg === leg);
  check(`足「${leg}」が捕まえている台の数`, caught.length > 0, true);
  // runControls は「抜いた足の台は 0件でよい」と読むので、ここは落ちない。
  // 抜いても落ちるなら、その台は別の足でも捕まっている＝足が独立していない
  const off = runControls([leg]);
  check(`足「${leg}」を抜いた回`, off.length, 0);
}

/* 3. 足を抜かないまま、台を1つずつ素で当てる（runControls の読み方そのものを疑う） */
for (const c of CONTROLS) {
  const n = judge(c.pages, CARDS_C, c.look || LOOK_C).length;
  check(`台「${c.name}」`, c.leg === null ? n === 0 : n >= 1, true);
}

/* 4. `<head>` の抜きかた。**題と一文が入れ替わっても気づけるように、別々に見る** */
const html =
  '<html><head><title>台所｜あやと島</title>'
  + '<meta name="description" content="一文"/>'
  + '<meta property="og:title" content="台所｜あやと島"/>'
  + '<meta property="og:description" content="一文"/>'
  + '<meta property="og:image" content="https://x/og/kitchen.png"/>'
  + '<meta property="og:url" content="https://x/kitchen"/>'
  + '<meta name="twitter:card" content="summary_large_image"/>'
  + '<meta name="twitter:image" content="https://x/og/kitchen.png"/>'
  + "</head><body>本文</body></html>";
const h = headOf(html);
check("題", h.title, "台所｜あやと島");
check("og:title", h.ogTitle, "台所｜あやと島");
check("og:image", h.ogImage, "https://x/og/kitchen.png");
check("og:url", h.ogUrl, "https://x/kitchen");
check("twitter:card", h.twCard, "summary_large_image");
// `<body>` に同じ字があっても拾わない（`<head>` までで切っている）
check("本文の og:image は拾わない", headOf('<html><head><title>あ</title></head><body><meta property="og:image" content="https://x/y.png"></body></html>').ogImage, "null");

/* 5. 絵の寸法の読みかた。**ここが外れると「1200×630 でない」を永久に見逃す** */
const png = Buffer.alloc(24);
png.write("\x89PNG", 0, "latin1");
png.writeUInt32BE(1200, 16);
png.writeUInt32BE(630, 20);
check("PNG の寸法", JSON.stringify(pixelsOf(png)), JSON.stringify({ w: 1200, h: 630 }));
check("PNG でないもの", pixelsOf(Buffer.from("これは絵ではない")), "null");

/* 6. 名簿の札の絵が、置いてあるか */
const cards = cardsOf();
check("名簿が空でない", Object.keys(cards).length > 0, true);
const lost = Object.entries(cards)
  .filter(([, c]) => !existsSync(join(repoPath("site/public"), c.file)))
  .map(([k]) => k);
check("絵の無い札", lost.join(" ") || "なし", "なし");
// 焼いた札は 1200×630。**器の 1枚（/og.png）も同じ決まりで見る**
// **無い絵はここで投げない。** 投げると「絵の無い札」の行が出る前に落ちて、
// 何が足りないのかが出ないまま終わる（実際にそうなった）
const wrong = Object.entries(cards)
  .filter(([, c]) => existsSync(join(repoPath("site/public"), c.file)))
  .map(([k, c]) => [k, pixelsOf(readFileSync(join(repoPath("site/public"), c.file)))])
  .filter(([, px]) => !px || px.w !== 1200 || px.h !== 630)
  .map(([k]) => k);
check("寸法の違う札", wrong.join(" ") || "なし", "なし");

/* 7. 名簿の呼び名が、`site/lib/share.ts` から読まれていること
      （どちらかが自分の写しを持ち直すと、片方だけ古くなる） */
const share = readFileSync(repoPath("site/lib/share.ts"), "utf8");
check("share.ts が名簿を読んでいる", /from "\.\/ogCards\.json"/.test(share), true);
const gen = readFileSync(repoPath("tools/sprites/ogcards.mjs"), "utf8");
check("焼く道具が名簿を読んでいる", /site\/lib\/ogCards\.json/.test(gen), true);

console.log(`対照 ${ok.length + ng.length}件中 ${ok.length}件通った`);
for (const line of ng) console.log(`::error::${line}`);
if (ok.length === 0) {
  console.log("::error::対照が0件です");
  process.exit(2);
}
process.exit(ng.length ? 1 : 0);
