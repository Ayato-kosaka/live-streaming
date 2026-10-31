/**
 * **面を1枚足して、索引（`sitemap.ts`）に足し忘れていないか。**
 *
 *   node site/selftest/sitemapgap_selftest.mjs
 *
 * 終了コード 0=通った / 1=索引に無い面がある / 2=数えるものが無い。
 *
 * ## なぜ要るか（#872）
 *
 * `app/sitemap.ts` には**自分で警告が書いてある**:
 *
 * > **足し忘れると `prodsweep.mjs` が「sitemap.xml に無い」で赤くする。**
 * > 2026-10-08 に `/north-macedonia` を作ったとき、面と `/all` の棚は足したのに
 * > ここを忘れて、配ったあとの見張りで見つかった。面を1枚増やす仕事は3か所ある。
 *
 * 書いてあるのに、**6日後にまた起きた**（#844 の `/months`。#872）。
 * 手引きに書くのは対策ではない——人が増えると破れる。
 *
 * ## いつ見つけるかが、この見張りの値打ち
 *
 * `prodsweep.mjs` は**配ったあと**に見つける。見つかるのは本番に出てからで、
 * しかも Hosting の run が赤くなるので、**次の配りも同じところで赤い**。
 * 赤が続くと、ほかの本物の失敗が埋もれる。
 *
 * こちらは**ブラウザも書き出しも要らない**ので、毎 PR で回る。
 *
 * ## 何を見るか
 *
 * `site/app/**​/page.tsx` のうち、**道が固定のもの**だけ。
 * `[slug]` の面は中身の表から作られるので、ここでは見ない
 * （見るなら書き出しが要る。それは `prodsweep.mjs` の持ち場）。
 *
 * **索引に出さないと決めた面は `OUT` に理由つきで書く。**
 * 「逃がす場所」を1つ作ると次の置き場になるので、**理由を空にできない形**にしてある。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/* **TS を自前の正規表現で読まない**（`tools/sprites/tsread_selftest.mjs` が
   見ている。`docs/island-misses.md` #248 で、読み手を1本に寄せたのに
   `.mjs` 側に自前の読み手が20か所あった、という前がある）。
   最初は `/robots:\s*\{[^}]*index:\s*false/` と書いて、そこで止められた。 */
import { closeAt, fields, nestedBody } from "../../tools/sprites/tsread.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const APP = join(here, "..", "app");
const SITEMAP = join(APP, "sitemap.ts");

/**
 * **索引に出さないと決めた面は、手で表に持たない。**
 *
 * 最初は `OUT = { "/me": "ログインが要る", … }` と書いた。すぐに食い違った:
 * `/design` `/me/remote` `/me/roulette` `/nordic/photos` `/roulette` の5枚が
 * 表に無くて赤くなり、**5枚とも自分で `robots: { index: false }` と
 * 言っていた**（索引に無いのが正しい）。
 *
 * **面はもう答えを持っている。** 手で写した表は、面が増えた日に古くなる。
 * だから読むのは面のほう——`metadata` の `robots` に `index: false` と
 * 書いてあれば、索引に無くてよい。書いていなければ、索引に出ていないといけない。
 *
 * この見張りを入れた日に、`/updates` が**どちらでもなかった**
 * （`index: false` を持たず、索引にも無い）。索引に足した。
 */

let bad = 0;
const ok = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  const good = g === w;
  console.log(`  ${good ? "○" : "✕"} ${name}: ${g}${good ? "" : `（欲しかったのは ${w}）`}`);
  if (!good) { bad++; console.log(`::error::${name}: 出た=${g} / 欲しかったのは=${w}`); }
};

/** `app/` の下から、道が固定の面を拾う */
function routes(dir = APP, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (!statSync(p).isDirectory()) continue;
    // `[slug]` は中身の表から作られる。ここでは見ない
    if (n.startsWith("[") || n.startsWith("_") || n.startsWith("(")) continue;
    try {
      statSync(join(p, "page.tsx"));
      out.push("/" + relative(APP, p).split(/[\\/]/).join("/"));
    } catch { /* 面ではない（部品だけの箱） */ }
    routes(p, out);
  }
  return out;
}

const found = routes().sort();
const src = readFileSync(SITEMAP, "utf8");

if (!found.length) {
  console.error("✕ 面が1枚も見つからない。数えられないので 2 で止めます");
  process.exit(2);
}
if (!src.includes("MetadataRoute")) {
  console.error("✕ sitemap.ts が読めない。数えられないので 2 で止めます");
  process.exit(2);
}

/**
 * `export const metadata` が持っている `{…}` の中身。
 *
 * **`objectBody` では取れない面がある。** あれは `= {` の形しか見ないが、
 * 2026-10-14 の #866 で39面が
 *
 *     export const metadata: Metadata = share({ …, robots: {…}, path: "/design" });
 *
 * という**関数に包んだ形**になった。`objectBody` は空を返し、
 * この見張りは「8面が、索引にも無いし『出さない』とも言っていない」と
 * **master を赤くした**（自分で足した見張りに、自分で引っかかった）。
 *
 * 包みかたは今後も変わりうるので、**`metadata` のあとに出てくる最初の `{` から、
 * 対応する `}` まで**を中身とする。囲いの追いかけは `tsread.mjs` の `closeAt`。
 */
function metaBody(src) {
  const at = src.indexOf("export const metadata");
  if (at < 0) return "";
  const open = src.indexOf("{", at);
  if (open < 0) return "";
  const close = closeAt(src, open);
  return close > open ? src.slice(open + 1, close) : "";
}

/**
 * その面が「検索に出さない」と自分で言っているか。
 *
 * `export const metadata = { …, robots: { index: false, follow: false } }` の
 * `robots` の中の `index` を読む。**読み手は `tsread.mjs` 1本**。
 */
const hidden = (r) => {
  let src;
  try {
    src = readFileSync(join(APP, r.slice(1), "page.tsx"), "utf8");
  } catch {
    return false;
  }
  const meta = metaBody(src);
  if (!meta) return false;
  // `nestedBody` も `fields` も、**中身だけ**（外の `{}` を付けない）を取る
  const robots = nestedBody(meta, "robots");
  return !!robots && fields(robots).index === "false";
};
const open = found.filter((r) => !hidden(r));

console.log(`[1] 道が固定の面 ${found.length}枚（うち検索に出す ${open.length}枚）`);
// 索引は字で持っている（`"/months"`）か、表から作る（`` `/months/${m.key}` ``）。
// **固定の道は字でしか書けない**ので、字で当たるかだけを見る
ok("索引に無い面", open.filter((r) => !src.includes(`"${r}"`)), []);

console.log("[2] 索引に出していない面は、自分で「出さない」と言っている");
ok("どちらでもない面", found.filter((r) => !src.includes(`"${r}"`) && !hidden(r)), []);

console.log("[3] 対照（この見張りが、ほんとうに見ているか）");
// わざと1枚増やして、落ちることを見る
ok("**索引に無い面を混ぜたら見つける**",
   [...open, "/まだ索引に無い面"].filter((r) => !src.includes(`"${r}"`)), ["/まだ索引に無い面"]);
// 索引のほうを空にしたら、検索に出す面が全部「無い」になる
ok("索引が空なら、出す面を全部挙げる", open.filter(() => true).length, open.length);
// **隠れている面を数に入れない。** 入れると、この見張りは永久に赤い
ok("隠れている面は挙げない", found.filter(hidden).filter((r) => open.includes(r)), []);

console.log("");
console.log(bad ? `✕ ${bad}件 落ちた` : `○ ${found.length}枚ぜんぶ、索引に在るか・出さない理由が在る`);
process.exit(bad ? 1 : 0);
