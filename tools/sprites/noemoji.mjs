import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { fromRoot } from "./repo.mjs";

/**
 * 書き出した HTML に絵文字が残っていないか調べる。
 *
 *   node tools/sprites/noemoji.mjs                 # site/.next-verify を見る
 *   DIST=site/.next-3140 node tools/sprites/noemoji.mjs
 *   BREAK=1 node tools/sprites/noemoji.mjs         # わざと免除の外に1つ置く（落ちるはず）
 *
 * 終了コード: 0＝1文字も無い / 1＝見つかった。
 *
 * 絵文字は1文字も使わないと決めてある（`docs/island-design.md` 1章）。
 * **例外は1つだけ**——配信の題名と、視聴者さんが書いた文章は引用なので、
 * そのまま出す。ここではその2つを除いて数える。
 *
 * ## 免除は「引用の印」で決める（2026-09-22 に直した）
 *
 * 前はここが **`<a class="scard|vid|lgd-row" …>` で始まるか**を見ていた。
 * 判定が「引用かどうか」ではなく「**たまたまその class か**」になっていて、
 * **同じ引用が、置かれた場所によって通ったり落ちたりする。**
 *
 * 実際に食い違っていたもの:
 *
 * | 出どころ | どうなっていたか |
 * | --- | --- |
 * | `components/streams/Vid.tsx` の `Vid` | `<a class="vid">` なので通る |
 * | 同じファイルの `VidGone`（録画の残っていない回） | `<span class="vid is-gone">` なので**落ちる**。同じ題名なのに |
 * | `components/isle/IsleLists.tsx` の `ShortGrid` | `<a>` に class が無いので**落ちる** |
 *
 * だから免除は、**出す側が明示の印を付けたところだけ**にした。
 * 印は `data-quote`（`="title"` など中身は何でもよい。付いていることだけを見る）。
 *
 * 決めごと:
 *
 * - **印は引用の塊そのものに付ける。** 親要素に付けて配下ぜんぶを免除にしない。
 *   題名が自分たちの字と同じ箱に入っているときは、題名だけを `<span>` で包む
 * - **class 接頭辞での免除はもう無い。** 両方残すと、印を付け忘れても通ってしまう
 *   （緩む向きになる）ので、`scard` / `vid` / `lgd-row` の側にも印を付けて回った
 * - **`<img alt>` も引用になる。** 空要素なので、印が付いていればタグごと落とす
 *
 * ## この道具が見張りとして生きているか
 *
 * `BREAK=1` で、**免除の外に絵文字を1つ置いた版**を測る。落ちなければ
 * この道具は見張りではないので、`bad` を数えずに 2 で止まる。
 */

/** 見にいく書き出し先。並列で作業するとき、担当ごとに別の dist を持つので env で受ける。 */
const ROOT = fromRoot(process.env.DIST || "site/.next-verify");
// 絵文字・地域表示記号（国旗）・異体字セレクタ
const RE = /[\u{1F000}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{2600}-\u{27BF}]/gu;
/** 引用の印。これが付いた要素の中だけ数えない（`docs/island-design.md` 1章の例外）。 */
const MARK = /\bdata-quote(=|\s|$)/;
/** 閉じタグを持たない要素。印が付いていたらタグごと落とす（`alt` の中の題名を落とすため）。 */
const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

/** `<tag …>` の対になる `</tag>` の終わりの位置。同じ名前の入れ子を数える。 */
function closeOf(s, tag, from) {
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
  re.lastIndex = from;
  let depth = 1;
  let m;
  while ((m = re.exec(s))) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return re.lastIndex;
  }
  // 閉じていない（壊れた HTML）。そこから先を丸ごと落とすと数えるものが消えるので、
  // **開きタグ1つぶんだけ**落として先へ進む。黙って全部免除にしない。
  return from;
}

/** 印の付いた要素を、中身ごと落とす。 */
function stripQuoted(s) {
  const open = /<([a-zA-Z][\w-]*)\b([^>]*)>/g;
  let out = "";
  let cut = 0;
  let m;
  while ((m = open.exec(s))) {
    const [full, tag, attrs] = m;
    if (!MARK.test(attrs)) continue;
    out += s.slice(cut, m.index);
    const after = m.index + full.length;
    cut =
      VOID.has(tag.toLowerCase()) || /\/\s*$/.test(attrs) ? after : closeOf(s, tag, after);
    open.lastIndex = cut;
  }
  return out + s.slice(cut);
}

function walk(d) {
  let out = [];
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (f === "_next" || f === "cache" || f === "server") continue;
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (f.endsWith(".html")) out.push(p);
  }
  return out;
}

/** その1面を数える。`extra` は対照で足す字（`BREAK=1` のときだけ入る）。 */
function count(html, extra = "") {
  // 画面に出ない塊を先に落とす。RSC の積荷（`self.__next_f`）は焼いた本文の写しで、
  // ここを数えると同じ字を2度数える
  let s = html.replace(/<script[^>]*>[\s\S]*?<\/script>/g, "");
  s = stripQuoted(s) + extra;
  return [...s.matchAll(RE)].map((m) => m[0]);
}

const files = walk(ROOT);
if (files.length === 0) {
  console.error(`面が1枚もありません: ${ROOT}（先にビルドする）`);
  process.exit(2);
}

/* 見張りとして生きているか。**免除の外に絵文字を1つ置いて、挙がるかを見る。**
   落ちない道具は見張りではないので、本物の数を出さずに止める。 */
const probe = count(readFileSync(files[0], "utf8"), "🥕");
const base = count(readFileSync(files[0], "utf8"));
if (probe.length !== base.length + 1) {
  console.error("対照が落ちた: 免除の外に置いた1文字を数えられていない。数えるのをやめる");
  process.exit(2);
}
/* 印の中は数えないことも、同じだけ確かめる。片方だけだと
   「何も数えない道具」が対照を通ってしまう。 */
const inside = count(readFileSync(files[0], "utf8") + '<b data-quote="probe">🥕</b>');
if (inside.length !== base.length) {
  console.error("対照が落ちた: 引用の印の中を数えてしまっている。数えるのをやめる");
  process.exit(2);
}

let bad = 0;
const seen = new Map();
for (const f of files) {
  for (const k of count(readFileSync(f, "utf8"), process.env.BREAK ? "🥕" : "")) {
    if (!seen.has(k)) seen.set(k, { n: 0, at: f.replace(ROOT + "/", "") });
    seen.get(k).n++;
    bad++;
  }
}
console.log(`見た面 ${files.length}枚 / 引用の印（data-quote）の中は数えていない`);
if (bad) {
  console.log("絵文字が残っている:");
  for (const [ch, v] of [...seen].sort((a, b) => b[1].n - a[1].n)) {
    console.log(`  ${ch}  U+${ch.codePointAt(0).toString(16).toUpperCase()}  ${v.n}回  例: ${v.at}`);
  }
} else {
  console.log("絵文字なし");
}
process.exit(bad ? 1 : 0);
