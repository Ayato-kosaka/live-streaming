/**
 * **巡回が、嘘の NG を出していないか／黙らせてもいないか**を毎 PR で確かめる。
 *
 *     node tools/sprites/crawl_selftest.mjs
 *
 * 終了コード 0=ぜんぶ通った / 1=落ちた / 2=数えるものが無い。
 *
 * ## なぜ要るのか
 *
 * `crawl.mjs` は `/nordic` → `/nordic/review` を**毎回リンク切れとして
 * 挙げていた。** 本番は 200——行き先は Next の外（`public/nordic/review.html`）
 * に在って、Firebase Hosting が `dist/` で重ねている。書き出したもの
 * （`site/.next-*`）だけを配る巡回には、**存在しないだけ**だった。
 *
 * 2026-10-07 に、**担当5人が全員これを「既存の偽陽性です」と報告してきた。**
 * 毎回1件の嘘が出ていると、**本物の赤がそこに埋もれる。**
 *
 * 直し方には穴が2つある。どちらも「通る」側に転ぶので、ここで両方見る。
 *
 *   1. **名指しで黙らせる**——`public/` のファイルが本当に消えても黙る
 *   2. **段ごと見ない**（`/nordic/…` は見ない）——その段の本物の赤も消える
 *
 * だから**在るかどうかを見る**（`crawltargets.mjs`）。ここはその判定に
 * 直に当てる。`crawl.mjs` 本体はブラウザが要るので毎 PR では回せない
 * （`tools/sprites/node_modules` は CI に入らない）。
 *
 * ## 壊した写しで落ちること
 *
 *     BREAK=blind    node tools/sprites/crawl_selftest.mjs   # 1 で落ちる
 *     BREAK=nopublic node tools/sprites/crawl_selftest.mjs   # 1 で落ちる
 *
 *   blind     行き先を見ずに素通りさせる（「見ない」で黙らせた形）
 *   nopublic  `public/` の行き先を足さない（直す前の姿。嘘の NG が出る）
 *   nofiles   落とせるファイルを足さない（直す前の姿。`/goods` の「おとす」が挙がる）
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { brokenLinks, fileTargets, htmlFiles, norm, publicTargets, targetSet } from "./crawltargets.mjs";
import { repoPath } from "./repo.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const BREAK = process.env.BREAK || "";

/** わざと壊した判定。**本物と同じ名前で呼べる形**にして差し替える */
const G = {
  // 行き先を見ない＝何を指していても赤くならない（「見ない」で黙らせた形）
  brokenLinks: BREAK === "blind" ? () => [] : brokenLinks,
  // `public/` を足さない＝直す前の姿（嘘の NG が1件出る）
  publicTargets: BREAK === "nopublic" ? () => [] : publicTargets,
  // 落とせるファイルを足さない＝直す前の姿（`/goods` の「おとす」が毎回挙がる）
  fileTargets: BREAK === "nofiles" ? () => [] : fileTargets,
};

let SEEN = 0, BAD = 0;
const fails = [];
function check(name, cond, note = "") {
  SEEN++;
  if (!cond) { BAD++; fails.push(name); }
  console.log(`  ${cond ? "○" : "✕"} ${name}${note ? `  ${note}` : ""}`);
}

const src = readFileSync(join(HERE, "crawl.mjs"), "utf8");

console.log("=== 巡回のリンク判定（嘘の NG を出さない／黙らせてもいない） ===");

console.log("\n[1] 綴りの揃え");
check("/about.html も /about/ も /about", norm("/about.html") === "/about" && norm("/about/") === "/about");
check("/index は段そのもの", norm("/donut-progress/index.html") === "/donut-progress");
check("印と問いは落とす", norm("/board?x=1#y") === "/board");
check("根は /", norm("/") === "/" && norm("/index.html") === "/");

console.log("\n[2] public/ の面を、行き先に数えているか（本物の木）");
const real = G.publicTargets(repoPath("public"));
check("`public/` を歩けている（.html が1枚以上ある）", real.length > 0, `${real.length}件`);
check("`/nordic/review` が行き先に入っている（**毎回の嘘の正体**）",
  real.includes("/nordic/review"), real.join(", "));

console.log("\n[3] 行き先が消えたら赤くなるか（**本丸。「見ない」で黙らせていない証明**）");
const base = mkdtempSync(join(tmpdir(), "crawltargets-"));
const pub = join(base, "public");
mkdirSync(join(pub, "nordic"), { recursive: true });
writeFileSync(join(pub, "nordic", "review.html"), "<!doctype html><title>x</title>");
const DIST = ["/nordic.html", "/index.html"];
const links = ["/nordic/review", "/nordic", "/"];

const withFile = G.brokenLinks(links, targetSet(DIST, G.publicTargets(pub)));
check("在るあいだは、挙げない（嘘の NG を出さない）", withFile.length === 0, `挙げた: ${withFile.join(", ") || "なし"}`);

rmSync(join(pub, "nordic", "review.html"));
const without = G.brokenLinks(links, targetSet(DIST, G.publicTargets(pub)));
check("**消えたら挙げる**（名指しで黙らせていない）",
  without.length === 1 && without[0] === "/nordic/review", `挙げた: ${without.join(", ") || "なし"}`);

// 置き場ごと無くなった場合も、黙らずに赤くなる
rmSync(pub, { recursive: true, force: true });
const noDir = G.brokenLinks(links, targetSet(DIST, G.publicTargets(pub)));
check("置き場ごと無くても挙げる（投げずに、赤で言う）",
  noDir.length === 1 && noDir[0] === "/nordic/review");
check("無い置き場は空で返る（例外で止めない）", htmlFiles(join(base, "ない置き場")).length === 0);
rmSync(base, { recursive: true, force: true });

console.log("\n[4] 段ごと黙らせていないか（同じ段に在りそうで無い先）");
const sameDir = G.brokenLinks(["/nordic/not-there"], targetSet(DIST, real));
check("`public/` に在る面と同じ段でも、無い先は挙げる",
  sameDir.length === 1 && sameDir[0] === "/nordic/not-there");
check("島の中に無い先は挙げる（元からの判定を壊していない）",
  G.brokenLinks(["/no-such-page-in-the-island"], targetSet(DIST, real)).length === 1);

console.log("\n[4b] 落とせるファイルへの行き先（面ではないが、配り先に在る）");
/* `/goods` の「おとす」は `/goods/ayato-sticker.jpg` を渡す。**面ではない**ので
   `.html` だけを数えていたころは毎回「島の中に無い先」として挙がっていた。
   **両側から当てる**——在るものが通ること、無いものが挙がること。 */
const fbox = mkdtempSync(join(tmpdir(), "crawlfiles-"));
mkdirSync(join(fbox, "goods"), { recursive: true });
writeFileSync(join(fbox, "goods", "ayato-sticker.jpg"), "jpeg");
writeFileSync(join(fbox, "index.html"), "<!doctype html><title>x</title>");
const dlLinks = ["/goods/ayato-sticker.jpg", "/goods/no-such.jpg"];
const withDl = G.brokenLinks(dlLinks, targetSet(DIST, G.fileTargets(fbox)));
check("在る落としものは挙げない（嘘の NG を出さない）",
  withDl.length === 1 && withDl[0] === "/goods/no-such.jpg", `挙げた: ${withDl.join(", ") || "なし"}`);
check("面（.html）は数に混ぜない（面の一覧の担当）",
  !G.fileTargets(fbox).includes("/index.html"), G.fileTargets(fbox).join(", "));
rmSync(join(fbox, "goods", "ayato-sticker.jpg"));
const goneDl = G.brokenLinks(dlLinks, targetSet(DIST, G.fileTargets(fbox)));
check("**消えたら挙げる**（拡張子だけで黙らせていない）", goneDl.length === 2);
rmSync(fbox, { recursive: true, force: true });
check("無い置き場は空で返る（例外で止めない）", fileTargets(join(fbox, "ない")).length === 0);

console.log("\n[5] crawl.mjs が、その判定をほんとうに呼んでいるか");
check("判定は crawltargets.mjs から呼ぶ（道具の中で書き直さない）",
  /from "\.\/crawltargets\.mjs"/.test(src));
check("本番の面を歩くときに `public/` を渡している", /pubDir: PUBDIR/.test(src));
check("対照には**台の `public/`** を渡している（本物を渡さない）",
  /pubDir: join\(dir, "pub"\)/.test(src));
check("対照に、挙げてはいけない1枚と挙げてほしい1枚がある",
  /\["\/publiclink\.html", \[\]\]/.test(src) && /\["\/deadpublic\.html", \["リンク切れ"\]\]/.test(src));
check("何件足したかを報告に出す（0件なら見られていないと分かる）",
  /うち public\/ の面/.test(src));
check("BREAK=nopublic がある（足す足を折れる）", /nopublic/.test(src));
check("本番の面を歩くときに、配り先そのものを渡している（落としもののため）",
  /fileDir: DIST/.test(src));
check("対照には**台そのもの**を渡している（本物の書き出しを渡さない）",
  /fileDir: dir/.test(src));
check("対照に、落としもので挙げてはいけない1枚と挙げてほしい1枚がある",
  /\["\/filelink\.html", \[\]\]/.test(src) && /\["\/deadfile\.html", \["リンク切れ"\]\]/.test(src));
check("BREAK=nofiles がある（足す足を折れる）", /nofiles/.test(src));

console.log("\n[6] 本物の木で、リンクと行き先が繋がっているか");
const nordicPage = readFileSync(repoPath("site", "app", "nordic", "page.tsx"), "utf8");
check("`/nordic` は `/nordic/review` へ `<a>` で送っている（`<Link>` ではない）",
  /<a className="tile" href="\/nordic\/review"/.test(nordicPage));
check("その行き先のファイルが `public/` に在る", real.includes("/nordic/review"));

console.log();
if (SEEN === 0) { console.log("✕ 1件も見ていません（数えるものが無い）"); process.exit(2); }
if (BAD) {
  console.log(`✕ ${SEEN}件中 ${BAD}件 落ちました${BREAK ? `（BREAK=${BREAK}）` : ""}: ${fails.join(" / ")}`);
  process.exit(1);
}
console.log(`○ ${SEEN}件ぜんぶ通りました（綴り・public/ の行き先・落としもの・消えたら赤・段ごと黙らせない・呼び出し）`);
process.exit(0);
