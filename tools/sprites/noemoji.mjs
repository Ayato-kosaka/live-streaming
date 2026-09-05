import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * 書き出した HTML に絵文字が残っていないか調べる。
 *
 * 絵文字は1文字も使わないと決めてある（docs/island-design.md）。
 * ただし配信のタイトルと視聴者さんの文章は引用なので、そのまま出す。
 * ここではその2つを除いて数える。
 */
const ROOT = "/home/user/live-streaming/site/.next-verify";
// 絵文字・地域表示記号（国旗）・異体字セレクタ
const RE = /[\u{1F000}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{2600}-\u{27BF}]/gu;
/** 引用としてそのまま出しているもの。ここに当たる行は数えない。 */
const QUOTED = [/class="scard/, /class="chatter/, /class="cidea/, /class="bidea/, /class="note/];

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

let bad = 0;
const seen = new Map();
for (const f of walk(ROOT)) {
  let s = readFileSync(f, "utf8");
  s = s.replace(/<script[^>]*>[\s\S]*?<\/script>/g, "");
  // 配信タイトルなど、引用として出している塊を落とす
  s = s.replace(/<a class="scard[\s\S]*?<\/a>/g, "").replace(/<figcaption[\s\S]*?<\/figcaption>/g, "");
  s = s.replace(/"title":"[^"]*"/g, "");
  for (const m of s.matchAll(RE)) {
    const k = m[0];
    if (!seen.has(k)) seen.set(k, { n: 0, at: f.replace(ROOT + "/", "") });
    seen.get(k).n++;
    bad++;
  }
}
if (bad) {
  console.log("絵文字が残っている:");
  for (const [ch, v] of [...seen].sort((a, b) => b[1].n - a[1].n)) {
    console.log(`  ${ch}  U+${ch.codePointAt(0).toString(16).toUpperCase()}  ${v.n}回  例: ${v.at}`);
  }
} else {
  console.log("絵文字なし");
}
process.exit(bad ? 1 : 0);
