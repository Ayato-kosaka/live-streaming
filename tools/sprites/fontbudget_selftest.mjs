/**
 * **書体が、面ごとにいくら取りに行くかを見張る。**
 *
 *   node tools/sprites/fontbudget_selftest.mjs
 *
 * 焼いたもの（`site/app/css/fonts.css` と `site/public/fonts/`）と、
 * 面ごと・太さごとに画面へ出る字（`tools/fonts/weights.json`）を突き合わせて、
 * **ブラウザを立てずに**「この面はどの束を取りに行って、何バイト払うか」を出す。
 *
 * 見るのは3つ。
 *
 *   1. 落ちる字が無いか … 画面に出る字が、どの束にも入っていなければ
 *      **端末の書体に落ちる**（Android では丸ゴシックでなくなる＝見た目が変わる）
 *   2. いちばん重い面が上限を超えていないか
 *   3. 全面の合計が上限を超えていないか（1面だけ軽くして他を太らせる切り方よけ）
 *
 * ## なぜ要るか（#692）
 *
 * 3つの太さが**同じ切り分けを共有していた**ので、400 で37字しか描かない面が
 * 700 の切り分け（島じゅうの漢字）を背負って、400 だけで 214KB 取りに行っていた。
 * 太さごとに切り直して直したが、**次に `subset.py` を触った人が共有に戻すと、
 * 赤くならないまま太る。** 数字はビルドにも画面にも出ないので誰も気づかない。
 *
 * ## 対照
 *
 * 数えるだけの見張りは、**数え方が壊れると静かに通る。** わざと壊した入力を
 * 2つ通して、**落ちることを先に見てから**本物を数える。
 *
 *   share … 太さごとの切り分けをやめ、3太さとも「その面が使う字ぜんぶ」で
 *           引く（#692 当時の姿）。上限を超えなければ、この見張りは効いていない
 *   drop  … 束を1つ無かったことにする。落ちる字を数えられなければ同じ
 *
 * 終了コード 0=通った / 1=超えた・落ちる字がある / 2=数えるものが無い。
 */
import { readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { NEAR } from "./fontweigh.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CSS = join(ROOT, "site", "app", "css", "fonts.css");
const FONTS = join(ROOT, "site", "public", "fonts");
const SEEN = join(ROOT, "tools", "fonts", "weights.json");

/* ── 上限。**測った値に1割の余裕**を足したもの ───────────────────────
   余裕を広く取ると、太ったことに気づけない。足した字が束をまたいだ日は
   ここが赤くなるので、`subset.py` を回し直して、出た数字でここを書き直す。 */
const MAX_KB = 900;     // いちばん重い面（この式で 829KB = /nordic/guide）
const TOTAL_MB = 55.0;  // 141面の合計（この式で 50.8MB）

/* 目に見えない字は数えない。全角の空白（U+3000）・改行なし空白（U+A0）・
   くっつけるだけの字（U+200D）は、`subset.py` が焼く前に落としている
   （Python の `isprintable()` が False）。落ちても見た目は変わらないが、
   ここで数えると**ずっと赤いまま**になって、本物の落ちが埋もれる。 */
const INVISIBLE = /[\s\u200B-\u200F\u2028\u2029\u3000\uFEFF]/;

const near = eval(NEAR);

/* ── 焼いたものを読む ───────────────────────────────────────────── */
function faces() {
  const css = readFileSync(CSS, "utf8");
  const out = [];
  for (const m of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const body = m[1];
    const w = +(body.match(/font-weight:\s*(\d+)/) || [])[1];
    const url = (body.match(/url\("([^"]+)"\)/) || [])[1];
    const ur = (body.match(/unicode-range:\s*([^;]+);/) || [])[1];
    if (!w || !url || !ur) continue;
    const ranges = ur.split(",").map((r) => {
      const [a, b] = r.trim().replace(/^U\+/i, "").split("-");
      return [parseInt(a, 16), parseInt(b ?? a, 16)];
    });
    out.push({ w, url, ranges, bytes: statSync(join(FONTS, url.replace("/fonts/", ""))).size });
  }
  return out;
}

/** 太さごとに「この字はどの束か」の早見表を作る。 */
function index(all) {
  const by = new Map();
  for (const [i, f] of all.entries()) {
    if (!by.has(f.w)) by.set(f.w, new Map());
    const m = by.get(f.w);
    for (const [lo, hi] of f.ranges) for (let c = lo; c <= hi; c++) if (!m.has(c)) m.set(c, i);
  }
  return by;
}

/**
 * 面ごとに、払うバイト数と落ちる字を数える。
 * @param break_ "share"（太さの切り分けを共有する） / "drop"（束を1つ無かったことに）
 */
function measure(seen, all, break_) {
  // drop … 700 の束を1つ無かったことにする（焼きそこねた日の姿）
  const gone = break_ === "drop" ? all.findIndex((x) => x.w === 700) : -1;
  const use = all.filter((_, i) => i !== gone);
  const by = index(use);
  const rows = [];
  for (const [page, rec] of Object.entries(seen)) {
    const union = Object.values(rec).join("");
    let bytes = 0;
    let missing = 0;
    const hit = new Set();
    for (const w of [400, 700, 900]) {
      const chars = break_ === "share" ? union : rec[String(w)] || "";
      if (!chars) continue;
      for (const c of chars) {
        const cp = c.codePointAt(0);
        const at = by.get(w)?.get(cp);
        if (at === undefined) { if (!INVISIBLE.test(c)) missing++; }
        else hit.add(at);
      }
    }
    for (const i of hit) bytes += use[i].bytes;
    rows.push({ page, bytes, missing });
  }
  return rows;
}

/** @param only "size"（大きさだけ見る） / null（落ちる字も見る） */
function judge(rows, label, only) {
  const miss = rows.filter((r) => r.missing);
  const worst = rows.reduce((a, r) => (r.bytes > a.bytes ? r : a), rows[0]);
  const total = rows.reduce((a, r) => a + r.bytes, 0);
  const bad = [];
  if (miss.length && only !== "size") bad.push(`落ちる字がある面 ${miss.length}枚（例: ${miss[0].page} で ${miss[0].missing}字）`);
  if (worst.bytes / 1024 > MAX_KB) bad.push(`いちばん重い面 ${worst.page} が ${(worst.bytes / 1024).toFixed(1)}KB（上限 ${MAX_KB}KB）`);
  if (total / 1024 / 1024 > TOTAL_MB) bad.push(`合計 ${(total / 1024 / 1024).toFixed(2)}MB（上限 ${TOTAL_MB}MB）`);
  console.log(
    `  ${label}  ${rows.length}面  いちばん重い ${worst.page} ${(worst.bytes / 1024).toFixed(1)}KB  ` +
    `合計 ${(total / 1024 / 1024).toFixed(2)}MB  落ちる字 ${miss.reduce((a, r) => a + r.missing, 0)}字`
  );
  return bad;
}

let seen;
try {
  seen = JSON.parse(readFileSync(SEEN, "utf8"));
} catch (e) {
  console.log(`✕ ${SEEN} が読めない: ${e.message}`);
  process.exit(2);
}
const all = faces();
if (!all.length || Object.keys(seen).length < 50) {
  console.log(`✕ 数えるものが無い（束 ${all.length}本 / 面 ${Object.keys(seen).length}枚）`);
  process.exit(2);
}

console.log("[対照] わざと壊した入力で、この見張りが落ちるか");
let ok = true;
for (const [name, why] of [["share", "太さごとの切り分けをやめる"], ["drop", "束を1つ無かったことに"]]) {
  // share は「太さごとに切るのをやめた日」の姿。その太さで焼いていない字が
  // 落ちるのは当たり前なので、**大きさだけ**で落ちることを見る
  const bad = judge(measure(seen, all, name), `${name}（${why}）`, name === "share" ? "size" : null);
  const mark = bad.length ? "○" : "✕";
  if (!bad.length) ok = false;
  console.log(`  ${mark} ${name} → ${bad.length ? bad[0] : "**素通りした。この見張りは効いていない**"}`);
}
/* 丸めの表。ここが狂うと、焼かない字が出て端末の書体に落ちる */
for (const [w, want] of [[300, 400], [400, 400], [500, 400], [600, 700], [700, 700], [800, 900], [900, 900]]) {
  if (near(w) !== want) {
    console.log(`  ✕ 太さの丸め ${w} → ${near(w)}（欲しいのは ${want}）`);
    ok = false;
  }
}
if (!ok) {
  console.log("\n✕ 対照が外れた。**本物の数字は1つも出さない**");
  process.exit(2);
}

console.log("\n[本物]");
const bad = judge(measure(seen, all, null), "いま", null);
if (bad.length) {
  for (const b of bad) console.log(`  ✕ ${b}`);
  console.log("\n書体が太った。`tools/fonts/subset.py` を回し直して、出た数字でこの上限を書き直す");
  process.exit(1);
}
console.log("○ 書体は上限の中にある");
