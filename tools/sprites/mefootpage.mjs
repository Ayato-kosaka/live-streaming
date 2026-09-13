/**
 * `/me`（じぶんのこと）の一覧の**足元**だけを見るための見本を組む。
 *
 * `/me` はログインした人にしか中身が出ないので、本番をそのまま開けない。
 * そこで **書き出した `me.html` の器をそのまま使い**、中の `panel` だけを
 * 足元を持つ3つの部品（投げ銭・島の手入れ・じぶんのもの）に差し替える。
 * 頭の `<link rel=stylesheet>` は触らないので、**本番と同じ CSS が同じ順で当たる。**
 *
 *   tools/build.sh 3200
 *   node tools/sprites/mefootpage.mjs 3200     # → site/.next-3200/mefoot.html
 *   python3 -m http.server 4200 --directory site/.next-3200
 *
 * DOM は3つの部品の JSX から**そのまま写した**もの。クラス名を1つ落とすと
 * 別のものを見ることになるので、直すときは JSX と見比べて写す。
 * 値は本番に合わせてある。とくに投げ銭の行は **札が4つ出る人**
 * （状態・チャンネル名・あやと本人・「◯月◯日に来た」）を必ず1件入れる。
 * 「◯月◯日に来た」は 2026-09-13 の直しで 30人中28人に出るようになった欄で、
 * ここが増えたぶんの折り返しを見ないと、この面を見たことにならない。
 *
 * 企画の行の `<select>` は、**いちばん長い段の名前（「これから」）を選んだ
 * 状態**を必ず1件入れる。選ぶ欄の幅は中の字で決まるので、いちばん短い
 * 「提案」だけで撮ると、横あふれの出る幅を撮らずに合格にしてしまう。
 */
import { readFileSync, writeFileSync } from "fs";

const PORT = process.argv[2] || process.env.PORT || "3200";
/* `CHIP=1` で、足元の字を `.chip` にして組む。**JSX の写しではない。**
   入れ物（`.mp-note-foot > span.chip`）の側に置いた決めごとが効いているかを
   確かめるためだけのもの。効いていれば、付けても付けなくても同じ絵になる。 */
const CHIP = process.env.CHIP ? ' class="chip"' : "";
const root = new URL("../../site/", import.meta.url).pathname;
const html = readFileSync(`${root}.next-${PORT}/me.html`, "utf8");

/* 操作の印（`components/ui/IconCore.tsx` + `icons/nav.tsx`）。
   nav の印は単色なので、光の膜も抜き型も付かない枝を通る。 */
const icRight = (size) =>
  `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true" focusable="false">` +
  `<path d="M26 15 45 32 26 49" fill="none" stroke="currentColor" stroke-width="9.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;

/* 画びょう（`components/live/art.tsx` の Pin。既定の size は 20 だが
   MyStuff は既定のまま呼んでいる） */
const pin = (tone) =>
  `<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true" focusable="false">` +
  `<ellipse cx="25" cy="40" rx="9" ry="2.6" fill="#7d9268" opacity="0.3"></ellipse>` +
  `<rect x="21.5" y="22" width="5" height="17" rx="2.5" fill="#b58a55"></rect>` +
  `<circle cx="24" cy="19" r="14" fill="${tone}"></circle>` +
  `<circle cx="24" cy="17.6" r="11.6" fill="#fff" opacity="0.16"></circle>` +
  `<circle cx="19" cy="13.5" r="4.4" fill="#fff" opacity="0.55"></circle></svg>`;

/* ハートの数（MyStuff の中に直に書いてある SVG） */
const hearts = (n) =>
  `<span class="mp-hearts"><svg viewBox="0 0 24 22" aria-hidden="true">` +
  `<path d="M12 20.6C6.2 16.6 2 13 2 8.6 2 5.5 4.4 3 7.5 3c1.8 0 3.5.9 4.5 2.3C13 3.9 14.7 3 16.5 3 19.6 3 22 5.5 22 8.6c0 4.4-4.2 8-10 12z" fill="currentColor"></path></svg>${n}</span>`;

/* ------------------------------------------------------------------ */
/* 足元の3つ。**ここだけを見に来ている。** 中身は JSX の並びどおり。      */
/* ------------------------------------------------------------------ */

/** DonorLinks.tsx 440行。STATE_NAME → 紐付け待ち / 分からない / つないである */
const donorFoot = (state, channel, owner, came) =>
  `<p class="mp-note-foot">` +
  `<span${CHIP}>${state}</span>` +
  (channel ? `<span${CHIP}>${channel}</span>` : "") +
  (owner ? `<span${CHIP}>あやと本人</span>` : "") +
  (came ? `<span${CHIP}>${came}に来た</span>` : "") +
  `</p>`;

/** OwnerCare.tsx 307行（付箋） */
const careNoteFoot = (theme, day, by) =>
  `<p class="mp-note-foot">` +
  `<span${CHIP}>${theme}</span>` +
  `<span${CHIP}>${day}</span>` +
  (by ? `<span${CHIP}>${by}</span>` : "") +
  `</p>`;

/** OwnerCare.tsx 458行（企画） */
const carePlanFoot = (status, by, h) =>
  `<p class="mp-note-foot">` +
  `<span${CHIP}>いま ${status}</span>` +
  (by ? `<span${CHIP}>${by}</span>` : "") +
  (h ? `<span${CHIP}>さんせい ${h}</span>` : "") +
  `</p>`;

/** MyStuff.tsx 157行（付箋） */
const myNoteFoot = (theme, day, h) =>
  `<p class="mp-note-foot"><span>${theme}</span><span>${day}</span>${h ? hearts(h) : ""}</p>`;

/** MyStuff.tsx 219行（企画） */
const myPlanFoot = (status, day, h) =>
  `<i><span>${status}</span><span>${day}</span>${h ? `<span>さんせい ${h}</span>` : ""}</i>`;

/* ------------------------------------------------------------------ */
/* 1件ぶんの行。足元の上下に何が来るかで折り返しの見え方が変わるので、    */
/* JSX どおりに書く欄・押しどころまで置く。                              */
/* ------------------------------------------------------------------ */

const donorRow = (name, foot, hints) => `<li>
<p class="mp-care-text">${name}</p>
${foot}
<div class="dform mp-donor-form">
<label class="nph-post-row"><span>どねID</span><input type="text" class="mp-donor-fixed" value="v_8f3c21e4" readonly/></label>
<label class="nph-post-row"><span>YouTube の名前</span><input type="text" value="" maxlength="80" placeholder="@ひめひめ-r9z / UC…"/></label>
</div>
${hints}
<div class="mp-care-acts">
<button class="mp-send is-small">つなぐ</button>
<button class="mp-send is-small is-quiet">この人は分からない</button>
</div>
</li>`;

const careNote = (text, foot) => `<li>
<p class="mp-care-text">${text}</p>
${foot}
<textarea class="bin" rows="2" maxlength="300" placeholder="ここに返す。空にすると取り消し"></textarea>
<div class="mp-care-acts">
<button class="mp-send is-small">返す</button>
<button class="mp-send is-small is-quiet">しまう</button>
</div>
</li>`;

const carePlan = (title, foot, pick) => `<li>
<p class="mp-care-text">${title}</p>
${foot}
<div class="dform mp-care-form">
<label class="nph-post-row"><span>どの段へ</span><select>${
  ["提案", "これから", "やった"]
    .map((o) => `<option${o === pick ? " selected" : ""}>${o}</option>`)
    .join("")
}</select></label>
<label class="nph-post-row"><span>ページの id</span><input type="text" maxlength="40" placeholder="nordic / iran-walk。空で外す"/></label>
</div>
<div class="mp-care-acts">
<button class="mp-send is-small">動かす</button>
<button class="mp-send is-small is-quiet">しまう</button>
</div>
</li>`;

const myNote = (tone, text, foot) => `<li>
${pin(tone)}
<p class="mp-note-text">${text}</p>
${foot}
</li>`;

const myPlan = (title, foot, go) => `<li>
<span class="mp-plan-t"><b>${title}</b>${foot}</span>
${go ? `<a class="mp-go" href="#">そだてる${icRight(13)}</a>` : ""}
</li>`;

/* ------------------------------------------------------------------ */

const panels = `
<section class="panel paper" id="s-donor">
<h2>投げ銭の紐付け</h2>
<div class="mp-donor-group">
<p class="mp-donor-h"><b>まだ繋がっていない人</b></p>
<ul class="mp-care">
${donorRow("あやと", donorFoot("つないである", "あやと / Ayato", true, "9月13日"), "")}
${donorRow("ひめひめ", donorFoot("紐付け待ち", "@ひめひめ-r9z", false, "9月13日"), "")}
${donorRow("ゆずたつ", donorFoot("分からない", "", false, "9月13日"), `<div class="mp-donor-hints"><p class="mp-donor-hint-h">近い名前の人</p><button class="mp-donor-hint"><b>ゆずたつ</b><i>一緒にいた 42日</i></button></div>`)}
${donorRow("たいpi", donorFoot("紐付け待ち", "@taipi-3kd", false, ""), "")}
</ul>
</div>
</section>

<section class="panel paper" id="s-care">
<h2>島の手入れ</h2>
<ul class="mp-care" id="u-carenote">
${careNote("北欧のごはん、現地のスーパーで買ったものが見たいです", careNoteFoot("リトアニア", "9月13日", "ひめひめ"))}
${careNote("バスの中の景色をもっと流してほしい", careNoteFoot("北欧旅ぜんぶ", "9月12日", "ゆずたつ"))}
</ul>
<div class="mp-care-acts" id="a-carenote">
<button class="nt-obtn">ぜんぶ見る</button>
<button class="nt-obtn">しまったものを見る</button>
</div>
<ul class="mp-care" id="u-careplan">
${carePlan("フード＆ワイン祭りに行く", carePlanFoot("これから", "ひめひめ", 12), "これから")}
${carePlan("ヘルシンキでサウナ配信", carePlanFoot("提案", "たいpi", 0), "提案")}
</ul>
<div class="mp-care-acts" id="a-careplan">
<button class="nt-obtn">しまったものを見る</button>
</div>
</section>

<section class="panel paper" id="s-mine">
<h2>じぶんのもの</h2>
<ul class="mp-notes" id="u-mynote">
${myNote("#e8879a", "北欧のごはん、現地のスーパーで買ったものが見たいです", myNoteFoot("リトアニア", "9月13日", 12))}
${myNote("#5fbde0", "バスの中の景色をもっと流してほしい", myNoteFoot("北欧旅ぜんぶ", "9月12日", 0))}
</ul>
<ul class="mp-plans" id="u-myplan">
${myPlan("フード＆ワイン祭りに行く", myPlanFoot("これから", "9月13日", 12), true)}
${myPlan("ヘルシンキでサウナ配信", myPlanFoot("提案", "9月12日", 0), false)}
</ul>
</section>`;

const open = '<section class="panel paper">';
const i = html.indexOf(open);
if (i < 0) throw new Error("me.html に panel が見つからない");
const j = html.indexOf("</section>", i) + "</section>".length;
/* **Next の束は外す。** 残したままだと水あわせが走って、置いた見本を
   「ログインしていない人の /me」に丸ごと描き替えてしまう（最初これで
   足元が1本も測れず、紙が1枚だけの絵が撮れた）。
   CSS は `<link>` なので残る。見ているのは足元の見た目だけで、
   ここに動くものは1つも無い。 */
const page = (html.slice(0, i) + panels + html.slice(j))
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "")
  .replace(/<link[^>]*rel="preload"[^>]*>/g, "");
writeFileSync(`${root}.next-${PORT}/mefoot.html`, page);
console.log(`site/.next-${PORT}/mefoot.html`);
