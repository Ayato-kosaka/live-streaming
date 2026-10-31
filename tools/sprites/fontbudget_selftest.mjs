/**
 * **書体が、面ごとにいくら取りに行くかを見張る。**
 *
 *   node tools/sprites/fontbudget_selftest.mjs
 *
 * 焼いたもの（`site/app/css/fonts.css` と `site/public/fonts/`）と、
 * 面ごと・太さごとに画面へ出る字（`tools/fonts/weights.json`）を突き合わせて、
 * **ブラウザを立てずに**「この面はどの束を取りに行って、何バイト払うか」を出す。
 *
 * 見るのは5つ。
 *
 *   1. 落ちる字が無いか … 画面に出る字が、どの束にも入っていなければ
 *      **端末の書体に落ちる**（Android では丸ゴシックでなくなる＝見た目が変わる）
 *   2. いちばん重い面が上限を超えていないか
 *   3. 1面あたりの平均が上限を超えていないか（1面だけ軽くして他を太らせる切り方よけ）
 *   4. **表（`weights.json`）が、島の面ぜんぶを持っているか**（下の「分母」）
 *   5. **表を作る拾いかた（`fontweigh.mjs` の `COLLECT`）が、字を太さごとに正しく拾うか**（下の「拾いかた」）
 *
 * ## 拾いかた——表そのものが嘘だと、1〜4 は嘘の表の上で緑になる（2026-10-26）
 *
 * 表は `fontweigh.mjs` の `COLLECT` がブラウザの中で拾った字でできている。
 * ここが狂うと——`<script>` の中身を拾う・端末の書体で出している段まで拾う・
 * `::before` の `counter(…)` を字と読む・入力欄でない値を拾う・太さの束を取り違える——
 * 次に表を作り直した日から、**束が太るか、焼かない字が出る。** それでもこの見張りは
 * 表と束を突き合わせるだけなので、緑のまま通っていた（`mutation_drill.py` で
 * `COLLECT` の等しさを全部ひっくり返して緑だった）。
 *
 * **ブラウザは立てない**（CI に `playwright-core` が無い）。`COLLECT` が触るのは
 * `document` / `NodeFilter` / `getComputedStyle` の3つだけなので、それを偽で置き、
 * 作った面1枚（`FAKE_PAGE`）に当てて、太さごとの字が1字違わず出るかを見る。
 *
 * ## 分母——表に無い面は、重くても軽くても出てこない（#902）
 *
 * 1〜3 は**表に載っている面しか見ない。** 表は `fontweigh.mjs` を手で回した
 * ときにしか増えないので、面が増えた日からずれ始める。2026-10-15 に数えたら
 * **表は 141面で、島は 148面**だった（抜けが15面・もう無い面が8つ残っていた）。
 * 抜けていたうち **`/legends/nordic` は 1,088KB** で、上限 900KB を 188KB 超えていた
 * ——が、この見張りは**表に無いものを見られないので緑だった。**
 *
 * 抜けた面は per-page の束を持たないので、**冷たい束**（どの面にも共通の
 * 重いほう）に落ちる。**いちばん重い面が、いちばん見られていない面になる。**
 *
 * だから**面の数そのもの**を見る。足は2本あって、どちらも「増えた側」から出る:
 *
 *   書き出しがあるとき … `fontweigh.mjs` の `pageKeys()`（表を書くのと**同じ
 *     歩き方**）で数えて、**表に無い面が1枚でもあれば落ちる**
 *   書き出しが無いとき（CI はこちら） … `site/app` の下の `page.tsx` から route を数えて、
 *     **静的な route が表に無ければ落ちる**。`[slug]` の面は route だけでは
 *     何枚になるか分からないので、**その形の面が表に1枚もなければ**落ちる
 *
 * 数えるものが無ければ（route が0本）**0 ではなく 2 で落ちる。**
 * 置き場が動いた日に「0面が超過」で緑にしないため。
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
 *   hole  … 表から面を1枚抜く（#902 当時の姿）。分母の足が効いていなければ素通りする
 *   blind … 面を1枚も見つけられない置き場を数えさせる。**0 で緑にならない**か
 *
 * 拾いかたの対照は**守りを外した写し**。`COLLECT` を字のまま写し、守りを1つずつ外して
 * 偽の面に当てる（本物のファイルは触らない）。拾いかたの足が効いていなければ素通りする。
 *
 *   noskip     … `<script>` / `<style>` の中身も拾う
 *   anyvalue   … 入力欄（`INPUT`）でない値も拾う
 *   rawcontent … `::before` / `::after` の中身を、字（`"…"`）でなくても拾う
 *
 * 終了コード 0=通った / 1=超えた・落ちる字がある・表に無い面がある・字の拾いかたが狂った /
 * 2=数えるものが無い。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { COLLECT, NEAR, pageKeys } from "./fontweigh.mjs";
import { DIST } from "./islepages.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CSS = join(ROOT, "site", "app", "css", "fonts.css");
const FONTS = join(ROOT, "site", "public", "fonts");
const SEEN = join(ROOT, "tools", "fonts", "weights.json");

/* ── 上限。**測った値に1割の余裕**を足したもの ───────────────────────
   余裕を広く取ると、太ったことに気づけない。足した字が束をまたいだ日は
   ここが赤くなるので、`subset.py` を回し直して、出た数字でここを書き直す。 */
const MAX_KB = 900;   // いちばん重い面（2026-10-15・148面で 849KB = /nordic/guide）

/* **合計ではなく、1面あたりで見る。**
   ここは 2026-10-15 まで「全面の合計 55.0MB」だった。合計は**面が増えるだけで
   増える**ので、太っていない日にも赤くなる——そして赤くなった人は上限を
   書き直すだけなので、**何も守らないまま数字だけが上がっていく**
   （`CLAUDE.md`「数は手引きに書かない。道具で測る」と同じ形）。実際、141面で
   50.8MB だったものが、面が7枚増えただけで 54.25MB になり、上限まで 0.75MB
   しか残っていなかった。
   見たいのは「1面だけ軽くして、ほかを太らせる切り方」なので、**1面あたりの
   平均**で足りる。いちばん重い面は上の `MAX_KB` が別に見ている。
   2026-10-15・148面の実測は 375.3KB（合計 54.25MB）。1割の余裕で 413KB。 */
const AVG_KB = 413;

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

/* ── 分母。島の面ぜんぶが、表に載っているか（#902） ───────────────── */

const APP = join(ROOT, "site", "app");

/**
 * `site/app` の route を並べる。**手で並べない**（面を足した人が、ここに
 * 書き足さなくても繋がるように）。
 *
 * 返すのは `{ key, dynamic, re }`。`key` は `legends/[slug]` のような綴りで、
 * `re` は動的な段を `[^/]+` にした当たり判定（表の見出しに当てる）。
 *
 * @param {string} [dir] `site/app`
 */
function routes(dir = APP) {
  const out = [];
  const walk = (d, segs) => {
    let names;
    try { names = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of names) {
      if (e.isDirectory()) {
        // (まとめ) は綴りに出ない段、@枠 と _下書き は面にならない段
        const skip = /^[(@_]/.test(e.name);
        walk(join(d, e.name), skip ? segs : segs.concat(e.name));
      } else if (/^page\.(tsx|ts|jsx|js)$/.test(e.name)) {
        const key = segs.join("/") || "index";
        const dynamic = segs.some((s) => s.startsWith("["));
        const re = new RegExp(
          "^" + segs.map((s) => (s.startsWith("[...") ? ".+" : s.startsWith("[") ? "[^/]+" : s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("/") + "$"
        );
        out.push({ key, dynamic, re });
      }
    }
  };
  walk(dir, []);
  return out.sort((a, b) => (a.key < b.key ? -1 : 1));
}

/**
 * 表（`weights.json`）が島の面ぜんぶを持っているかを数える。
 *
 * @param seen 表
 * @param break_ "hole"（表から面を1枚抜く） / "blind"（面を1枚も見つけられない置き場）
 */
function coverage(seen, break_) {
  const rs = routes(break_ === "blind" ? join(ROOT, "site", "app-not-here") : APP);
  const statics = rs.filter((r) => !r.dynamic).map((r) => r.key);
  const table = new Set(Object.keys(seen));
  /* hole … **静的な route の面**を抜く。書き出しがある場でも無い場でも、
     どちらの足にも当たるので、片方だけ効いている状態を見逃さない */
  const hole = break_ === "hole" ? statics.find((k) => table.has(k)) : null;
  if (hole) table.delete(hole);

  const built = pageKeys(break_ === "blind" ? join(ROOT, "site", ".next-not-here") : DIST);
  const keys = [...table];
  /* 書き出しがあるときは、そちらが正。表に無い面は1枚でも赤 */
  const miss = built.filter((k) => !table.has(k));
  /* 逆（表に在って書き出しに無い）は**赤くしない。** 面が消えても
     測り落としは生まれないし、**他人の古い書き出しを拾っただけ**で
     赤くなると、本物の赤がそこに埋もれる（`crawltargets.mjs` の
     `/nordic/review` と同じ形）。数だけ出す */
  const stale = built.length ? keys.filter((k) => !built.includes(k)) : [];
  /* 書き出しが無い場（CI）は route から見る */
  const missRoute = statics.filter((k) => !table.has(k));
  const missFam = rs.filter((r) => r.dynamic && !keys.some((k) => r.re.test(k))).map((r) => r.key);

  const bad = [];
  if (miss.length) bad.push(`書き出しに在って表に無い面 ${miss.length}枚（例: ${miss.slice(0, 3).join(" / ")}）`);
  if (missRoute.length) bad.push(`route が在るのに表に無い面 ${missRoute.length}枚（例: ${missRoute.slice(0, 3).join(" / ")}）`);
  if (missFam.length) bad.push(`その形の面が表に1枚も無い route ${missFam.length}本（例: ${missFam.slice(0, 3).join(" / ")}）`);
  return { rs, statics, built, table, miss, stale, bad, hole };
}

/** 分母を印字して、落ちる理由を返す。**数えるものが無ければ null**（＝2 で落ちる） */
function judgeCoverage(seen, label, break_) {
  const c = coverage(seen, break_);
  const where = c.built.length ? `書き出し ${c.built.length}面` : "書き出しは見つからない";
  console.log(
    `  ${label}  表 ${c.table.size}面 / ${where} / route ${c.statics.length}静的＋${c.rs.length - c.statics.length}動的` +
    `  表に無い面 ${c.miss.length}枚  表に在って書き出しに無い面 ${c.stale.length}枚`
  );
  if (!c.rs.length) return null;
  return c.bad;
}

/** @param only "size"（大きさだけ見る） / null（落ちる字も見る） */
function judge(rows, label, only) {
  const miss = rows.filter((r) => r.missing);
  const worst = rows.reduce((a, r) => (r.bytes > a.bytes ? r : a), rows[0]);
  const total = rows.reduce((a, r) => a + r.bytes, 0);
  const bad = [];
  if (miss.length && only !== "size") bad.push(`落ちる字がある面 ${miss.length}枚（例: ${miss[0].page} で ${miss[0].missing}字）`);
  if (worst.bytes / 1024 > MAX_KB) bad.push(`いちばん重い面 ${worst.page} が ${(worst.bytes / 1024).toFixed(1)}KB（上限 ${MAX_KB}KB）`);
  const avg = total / rows.length / 1024;
  if (avg > AVG_KB) bad.push(`1面あたり ${avg.toFixed(1)}KB（上限 ${AVG_KB}KB・${rows.length}面の合計 ${(total / 1024 / 1024).toFixed(2)}MB）`);
  console.log(
    `  ${label}  ${rows.length}面  いちばん重い ${worst.page} ${(worst.bytes / 1024).toFixed(1)}KB  ` +
    `1面あたり ${avg.toFixed(1)}KB（合計 ${(total / 1024 / 1024).toFixed(2)}MB）  落ちる字 ${miss.reduce((a, r) => a + r.missing, 0)}字`
  );
  return bad;
}

/* ── 拾いかた。`COLLECT` を偽の DOM に当てる ───────────────────────── */

const MARU = '"Maru Island", sans-serif';

/** 偽の要素。`COLLECT` が読むものだけを持つ（字は自分の書体と太さを直に持つ。継ぐのは無し） */
function el(tagName, o = {}, ...kids) {
  return {
    nodeType: 1, nodeValue: null, tagName,
    font: o.font ?? MARU, weight: String(o.weight ?? 400),
    pseudo: { "::before": o.before ?? "none", "::after": o.after ?? "none" },
    placeholder: o.placeholder ?? "", value: o.value ?? "",
    shadowRoot: o.shadow ? { nodeType: 11, nodeValue: null, childNodes: o.shadow } : null,
    childNodes: kids.map((k) => (typeof k === "string" ? { nodeType: 3, nodeValue: k } : k)),
  };
}

/* 作った面1枚。**守りの1つ1つに、外すと字が増えるか減る行を当ててある** */
const FAKE_PAGE = el("BODY", {}, "あ",
  el("H1", { weight: 700 }, "見出"),
  el("P", { weight: 500 }, "丸め"),               // 500 は 400 の束に落ちる
  el("B", { weight: 600 }, "太"),                // 600 は 700
  el("STRONG", { weight: 800 }, "濃"),           // 800 は 900
  el("SCRIPT", {}, "脚本"),                      // 中身は数えない
  el("STYLE", {}, "様式"),
  el("SPAN", { font: "system-ui, sans-serif" }, "端末"),   // 島の書体で出していない段
  el("SPAN", { before: '"★"', after: "counter(n)" }, "星"), // 字の `content` だけ拾う
  el("INPUT", { placeholder: "入力欄", value: "値" }),
  el("TEXTAREA", { value: "下書" }),             // 値を拾うのは INPUT だけ
  el("DIV", { shadow: [el("EM", { weight: 900 }, "影")] }, "箱"),
  el("I", {}, "改\n行"),                         // 改行（0x1f 以下）は数えない
);
const sorted = (s) => [...s].sort().join("");
const FAKE_WANT = { 400: sorted("あ丸め★星入力欄値箱改行"), 700: sorted("見出太"), 900: sorted("濃影") };

/** ブラウザの TreeWalker と同じく、根の下の要素だけを文書の順に返す（影の中へは入らない） */
function walker(root) {
  const order = [];
  const visit = (n) => {
    for (const k of n.childNodes || []) if (k.nodeType === 1) { order.push(k); visit(k); }
  };
  visit(root);
  let i = 0;
  return { nextNode: () => order[i++] || null };
}

function style(n, pseudo) {
  // ブラウザも、要素でないものを渡すと投げる
  if (!n || n.nodeType !== 1) throw new TypeError("getComputedStyle: 要素ではない");
  return pseudo ? { content: n.pseudo[pseudo] ?? "none" } : { fontFamily: n.font, fontWeight: n.weight };
}

/**
 * `fn`（`COLLECT` か、その写し）を偽の面に当てて、外れた太さを返す。外れなければ空。
 * 偽の `document` などは、当てているあいだだけ置く。
 */
function collectBad(fn) {
  const names = ["document", "NodeFilter", "getComputedStyle"];
  const keep = names.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]);
  globalThis.document = { body: FAKE_PAGE, createTreeWalker: walker };
  globalThis.NodeFilter = { SHOW_ELEMENT: 1 };
  globalThis.getComputedStyle = style;
  try {
    const got = fn(NEAR);
    return [400, 700, 900]
      .filter((w) => got[w] !== FAKE_WANT[w])
      .map((w) => `${w} の束に「${got[w]}」（欲しいのは「${FAKE_WANT[w]}」）`);
  } catch (e) {
    return [`投げた: ${e.message}`];
  } finally {
    for (const [k, d] of keep) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete globalThis[k];
    }
  }
}

/* 写しの元。**字のまま写す**（ブラウザへ渡すときも `p.evaluate` が字にして渡している） */
const COLLECT_SRC = COLLECT.toString();
const copyCollect = (src) => (0, eval)(`(${src})`);
/** 守りを1つずつ外した写し。[名前, 何を外すか, 外す字, 代わりの字] */
const COLLECT_BREAKS = [
  ["noskip", "`<script>` / `<style>` の中身も拾う", /skip\.has\(el\.tagName\)/, "false"],
  ["anyvalue", "入力欄でない値も拾う", /el\.tagName [!=]== "INPUT"/, "true"],
  ["rawcontent", "`::before` の中身を、字でなくても拾う", /c\[0\] [!=]== '"'/, "true"],
];

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
/* 分母の対照。**表から面を1枚抜いて、落ちることを見てから**本物を数える（#902） */
{
  const c = coverage(seen, "hole");
  const bad = judgeCoverage(seen, `hole（表から ${c.hole ?? "？"} を抜く）`, "hole");
  console.log(`  ${bad && bad.length ? "○" : "✕"} hole → ${bad && bad.length ? bad[0] : "**素通りした。分母の足は効いていない**"}`);
  if (!bad || !bad.length) ok = false;
}
{
  /* 面を1枚も見つけられない置き場を数えさせる。**0面で緑にならない**こと
     （`docs/island-standards.md` §15。置き場が動いた日に「0面が超過」で
     通すのがいちばん悪い） */
  const bad = judgeCoverage(seen, "blind（面を1枚も見つけられない置き場）", "blind");
  console.log(`  ${bad === null ? "○" : "✕"} blind → ${bad === null ? "数えるものが無い（2 で落ちる）" : "**0面を数えて先へ進んだ**"}`);
  if (bad !== null) ok = false;
}
/* 拾いかたの対照。**守りを外した写しを偽の面に当てて、外れることを見てから**本物を当てる。
   写しが投げたのは「外れた」に数えない（写しかたが壊れているだけかもしれない） */
for (const [name, why, from, to] of COLLECT_BREAKS) {
  const src = COLLECT_SRC.replace(from, to);
  const bad = src === COLLECT_SRC ? ["写せなかった（外す字が `COLLECT` に無い）"] : collectBad(copyCollect(src));
  const caught = src !== COLLECT_SRC && bad.length > 0 && !bad[0].startsWith("投げた");
  console.log(`  ${caught ? "○" : "✕"} ${name}（${why}）→ ${caught ? bad[0] : bad[0] ?? "**素通りした。拾いかたの足は効いていない**"}`);
  if (!caught) ok = false;
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

console.log("\n[拾いかた] 偽の面1枚で、表を作る `COLLECT` が太さごとに字を拾えるか");
{
  /* 本物と、書き換えずに写しただけのもの。後者が外れるなら、対照の写しかたのほうを疑う */
  const real = collectBad(COLLECT);
  const plain = collectBad(copyCollect(COLLECT_SRC));
  for (const [label, bad] of [["本物", real], ["写しただけ", plain]]) {
    console.log(`  ${bad.length ? "✕" : "○"} ${label} → ${bad.length ? bad.join(" / ") : "3太さとも1字違わない"}`);
  }
  if (real.length || plain.length) {
    console.log("\n✕ 字の拾いかたが狂っている。このまま表（`tools/fonts/weights.json`）を作り直すと、束が太るか焼かない字が出る");
    process.exit(1);
  }
}

console.log("\n[本物]");
/* **分母を先に見る。** 表に無い面は、重くても軽くてもこの下に出てこない */
const cover = judgeCoverage(seen, "いま", null);
if (cover === null) {
  console.log("  ✕ route を1本も見つけられなかった（`site/app` の置き場が動いた）");
  console.log("\n✕ 数えるものが無い。**「上限の中にある」とは言わない**");
  process.exit(2);
}
const bad = cover.concat(judge(measure(seen, all, null), "いま", null));
if (bad.length) {
  for (const b of bad) console.log(`  ✕ ${b}`);
  if (cover.length) {
    console.log("\n表（`tools/fonts/weights.json`）が島の面に追いついていない。**数え直してから焼く:**");
    console.log("  tools/build.sh 3250");
    console.log("  python3 -m http.server 4250 --directory site/.next-3250 &");
    console.log("  DIST=site/.next-3250 SPORT=4250 node tools/sprites/fontweigh.mjs   # offline() を通すこと（#266）");
    console.log("  python3 tools/fonts/subset.py --export site/.next-3250");
  }
  if (bad.length > cover.length) {
    console.log("\n書体が太った。`tools/fonts/subset.py` を回し直して、出た数字でこの上限を書き直す");
  }
  process.exit(1);
}
console.log("○ 書体は上限の中にあり、表は島の面ぜんぶを持っている");
