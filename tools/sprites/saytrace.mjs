/**
 * 書き出したものを機械で見て、**「改行が潰れた跡」**を数える。
 *
 *   DIST=/home/user/live-streaming/site/.next-4000 node tools/sprites/saytrace.mjs
 *
 * 探すのは2つ。どちらも「箇条書きで書かれたものが1行に伸ばされた跡」。
 *
 * | 印 | 何を見ているか |
 * | --- | --- |
 * | 棒つなぎ | **`・` で始まる**かたまりの中に `・` が2つ以上あって、改行が1つも無い |
 * | 空白区切り | `・` の直前が空白（改行のあったところに空白だけが残っている） |
 *
 * **`・` を中黒として使っている文は数えない。** 「動画の投稿・編集・削除」は
 * 箇条書きではない。見分けは**かたまりの頭が `・` かどうか**。書いた人が
 * 箇条書きにしたものは、必ず1つ目の `・` から始まる。
 * 札の中（`<script>` の焼き込み）も見ない。画面に出る字ではない。
 *
 * **`>・` を数えるだけでは0にならない。** 箇条書きは1つ目が札の直後に来るので、
 * 直っていても必ず1件当たる。見るのは「2つ目以降の `・` の前に何があるか」。
 */
import { readdirSync, statSync, readFileSync } from "fs";
import { join } from "path";

const root = process.env.DIST || "/home/user/live-streaming/site/.next-4000";

function walk(d, base = "") {
  let out = [];
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (f === "_next" || f === "cache" || f === "server" || f === "static") continue;
    if (statSync(p).isDirectory()) out = out.concat(walk(p, base + "/" + f));
    else if (f.endsWith(".html")) out.push([base + "/" + f, p]);
  }
  return out;
}

let chain = 0;
let spaced = 0;
for (const [name, path] of walk(root)) {
  // 焼き込み（`<script>` の中）は画面の字ではない。先に落とす
  const html = readFileSync(path, "utf-8").replace(/<script[\s\S]*?<\/script>/g, "");
  // 札のあいだの字だけを見る。属性の中（alt・title）は画面の字ではない
  for (const m of html.matchAll(/>([^<>]+)</g)) {
    const t = m[1].replace(/<!--.*?-->/g, "");
    const dots = (t.match(/・/g) || []).length;
    if (dots >= 2 && t.trimStart().startsWith("・") && !t.includes("\n")) {
      chain++;
      console.log(`棒つなぎ ${name}  ${t.trim().slice(0, 70)}`);
    }
    for (const s of t.matchAll(/[ 　]・/g)) {
      spaced++;
      console.log(`空白区切り ${name}  …${t.slice(Math.max(0, s.index - 12), s.index + 16)}…`);
    }
  }
}
console.log(`\n棒つなぎ ${chain} 件 / 空白区切り ${spaced} 件`);
