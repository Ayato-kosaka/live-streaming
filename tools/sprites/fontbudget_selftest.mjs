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
 *   6. **表の記録が、書き出した面より古くないか**（下の「記録の古さ」。書き出しがあるときだけ）
 *   7. **面ひとりぶんの1本（`subset.py` の `SOLO`）が、その面で本当に効くか**（下の「ひとりぶん」）
 *
 * ## 記録の古さ——表が古いと、1〜3 は古い表の上で緑になる（2026-11-19）
 *
 * 1〜3 は表に書いてある字で払う量を見積もる。**面の字が増えても、表を測り直さなければ
 * 見積もりは動かない。** 2026-11-19 にそれが起きていた——この見張りは
 * `/travel/bulgaria/sofia` を 906.8KB（上限の中）と言い、表を測り直して同じ式で
 * 数えると **1,206.6KB** だった。増えた字は焼いたとき表に無かったので、どの面も
 * 取りに行かないはずの冷たい束（400 と 900 で 127KB ずつ）に入っていて、面はそれを引いていた。
 * そのとき表と測り直しを突き合わせると、**155面のうち148面**の記録が古かった。
 *
 * だから**書き出した HTML の地の字**（`<script>` などの中身は除く。`subset.py` の
 * `from_export()` と同じ剥がしかた）を表の記録と突き合わせる。記録に無い字が
 * あれば、それが**その面で、まだ払っていない1本**を引くかを見る:
 *
 *   - その面が描く太さのどれかで、すでに払っている1本に入っている字 … 0KB
 *     （日付や曜日の字はたいていこれ。毎晩の焼き直しで動く字で赤くしない）
 *   - どの太さでも、払っていない1本に入っている字 … いちばん安い太さのその1本
 *
 * 足したものが `STALE_KB` 以上、または見積もりに足して上限を超えたら赤。
 * **太さは HTML から分からない**ので、いちばん安い太さを選ぶ（＝少なく見積もる）。
 * 少なく見積もっても赤なら、測り直しは要る。
 *
 * **書き出しが無い場（CI の `selftest` job）では見ない**——HTML が無いので。
 * 書き出しを持つ `reachkeys` job（`selftest.yml`）がここを `DIST=` つきで回す。
 *
 * ## ひとりぶん——効かない1本は、見積もりの上でだけ軽い（2026-11-19）
 *
 * 字の多い面は、その面が描く字だけの1本を太さごとに持つ（`subset.py` の `SOLO`）。
 * 見積もりは「その面ではまずその1本から引く」として数えるが、ブラウザがそうするのは
 * `fonts.css` の当たり判定（`<link rel="canonical">` の末尾）がその面に当たったときだけ。
 * 当たらなければ面はふだんの束を引いて、**実際は重いまま、ここは軽いと言う。**
 * だから書き出しで当たり判定を当てる。もう1つ、家族の中に 400/700/900 が
 * 揃っているか——欠けると、ブラウザは近い太さの1本で描く（900 の見出しが 700 になる）。
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
 *   unscoped … ひとりぶんの当たり判定を無かったことにする。ひとりぶんの面がふだんの束を
 *           引いて上限を超えなければ、ひとりぶんを数える足は効いていない
 *   noweight … ひとりぶんの家族から 900 の1本を抜く（太さ合わせで 700 に化ける日の姿）
 *   stale … 面の HTML に、その面がまだ払っていない1本の字を1つ足す（記録が古い日の姿）。
 *           書き出しがあるときだけ
 *   unbaked … 面の HTML に、どの1本にも焼いていない漢字を1つ足す（払う量は0なので、払う量だけ
 *           見ていると素通りする）。書き出しがあるときだけ
 *   nocanon … ひとりぶんの面の HTML から canonical を抜く。書き出しがあるときだけ
 *   glyphless … ふだんの束の範囲に、書体に字形の無い字を1つ足す
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
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { COLLECT, NEAR, pageKeys } from "./fontweigh.mjs";
import { DIST } from "./islepages.mjs";
import { FAMILY, faces, picker, soloRules } from "./fontfaces.mjs";
import { loadRedirects, redirectOf } from "./routemoves.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SEEN = join(ROOT, "tools", "fonts", "weights.json");
/* 面が島の書体で描くのに、Zen Maru Gothic が字形を持たない字（`subset.py` の `glyphs()` が書く）。
   どの1本の `unicode-range` にも入れていない——入れるとブラウザは取りに行ってから字形が無いと知る
   （ソフィアの面が 🇧🇬 のために字形の無い束を2本・90KB 引いていた）。はじめから端末の書体で出る字なので、
   **落ちる字には数えない** */
const ABSENT = join(ROOT, "tools", "fonts", "absent.json");

/* ── 上限。**測った値に1割の余裕**を足したもの ───────────────────────
   余裕を広く取ると、太ったことに気づけない。足した字が束をまたいだ日は
   ここが赤くなるので、`subset.py` を回し直して、出た数字でここを書き直す。 */
const MAX_KB = 980;   // いちばん重い面（2026-11-06・153面で 931KB = /nordic/guide）
/* 2026-11-19（155面）: 表を測り直すと /travel/north-macedonia/skopje 1,252.2KB・/travel/bulgaria/sofia 1,206.6KB で
   超えていた。**上限は上げずに**、2面を面ひとりぶんの1本（`subset.py` の `SOLO`）にして 312.5 / 332.2KB。
   いまいちばん重いのは /island/nordic/guide 845.4KB、1面あたり 383.7KB */

/* ## なぜ 900 から上げたか（2026-11-06）
 *
 * `/bulgaria` を足したら、**触っていない `/nordic/guide` が 850 → 931KB に太った。**
 * 束は「どの面で使われるか」が同じ字どうしをまとめて作るので、字の多い面が
 * 1枚増えると**まとめかたが変わって、ほかの面が巻き添えで払う。**
 *
 * 束の数を変えて逃げられないかを見積もりで当たった（`subset.py --dry`）:
 *
 *     束12  最大 808KB（実測 931）   束16  834   束20  791   束24  814   束28  804
 *
 * **どれも実測で 900 を割らない。** 下限は `/nordic/guide` と `/bulgaria` が
 * 実際に描いている字そのもので、切り分けかたでは消せない。
 * 束を増やすと1面あたりの中央値は下がる（320 → 271KB）が、取りに行く本数が増える。
 * **12 のまま置いて、上限のほうを測った値に直す。**
 *
 * 次に赤くなったら、また同じ順で見る——まず `subset.py --dry --buckets N` を
 * いくつか当てて、**切り分けで直るのかを確かめてから**ここを動かす。 */

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

/* 記録に無い字が、まだ払っていない1本をこれだけ引いたら赤（「記録の古さ」）。
   束のいちばん小さいもの（数KB）を引く字は、測り直すほどの嘘ではない。
   いちばん小さい冷たい束（2026-11-19 の焼き直しで 700 の 46KB）を1本でも引けば鳴る高さに置く */
const STALE_KB = 20;

const WEIGHTS = [400, 700, 900];

/**
 * 面ごとに、払うバイト数と落ちる字を数える。
 * @param rules ひとりぶんの1本の当たり判定（`soloRules()`）
 * @param break_ "share"（太さの切り分けを共有する） / "drop"（束を1つ無かったことに）
 */
function measure(seen, all, rules, break_) {
  // drop … ふだんの 700 の束を1つ無かったことにする（焼きそこねた日の姿）
  const gone = break_ === "drop" ? all.findIndex((x) => x.w === 700 && x.family === FAMILY) : -1;
  const use = all.filter((_, i) => i !== gone);
  const pick = picker(use, rules);
  const rows = [];
  for (const [page, rec] of Object.entries(seen)) {
    const union = Object.values(rec).join("");
    let missing = 0;
    const hit = new Set();
    for (const w of WEIGHTS) {
      const chars = break_ === "share" ? union : rec[String(w)] || "";
      if (!chars) continue;
      for (const c of chars) {
        const at = pick(page, w, c.codePointAt(0));
        if (at < 0) { if (!INVISIBLE.test(c) && !absent[w].has(c)) missing++; }
        else hit.add(at);
      }
    }
    let bytes = 0;
    for (const i of hit) bytes += use[i].bytes;
    rows.push({ page, bytes, missing, hit, pick, use });
  }
  return rows;
}

/* ── ひとりぶんの1本（`subset.py` の `SOLO`） ──────────────────────── */

/**
 * ひとりぶんの家族が、太さ3つを揃えて焼かれているか・表に載っている面か。
 * @param break_ "noweight"（家族から 900 を抜く）
 */
function soloShape(seen, all, rules, break_) {
  const bad = [];
  for (const [page, fam] of rules) {
    if (!seen[page]) bad.push(`ひとりぶんの1本 ${fam} の面が表に無い`);
    const ws = new Set(all.filter((f) => f.family === fam && !(break_ === "noweight" && f.w === 900)).map((f) => f.w));
    const lack = WEIGHTS.filter((w) => !ws.has(w));
    if (lack.length) bad.push(`${fam} に太さ ${lack.join("/")} が無い（ブラウザは近い太さの1本で描く＝見た目が変わる）`);
    if (all.some((f) => f.family === fam && f.bytes === null)) bad.push(`${fam} の1本が焼かれていない`);
  }
  /* 家族はあるのに当たり判定が無い（＝どの面でも引かれない）1本 */
  const used = new Set(rules.values());
  const orphan = [...new Set(all.map((f) => f.family))].filter((f) => f !== FAMILY && !used.has(f));
  if (orphan.length) bad.push(`当たり判定の無い1本 ${orphan.join(" / ")}（どの面でも引かれない）`);
  return bad;
}

/**
 * 字形の無い字が、どれかの1本の `unicode-range` に入っていないか（入っていると、ブラウザは
 * 字形の無い1本を取りに行ってから端末の書体へ進む）。
 * @param break_ "glyphless"（ふだんの 700 の1本目に、字形の無い字を1つ足す）
 */
function glyphless(all, break_) {
  const bad = [];
  const use = break_ === "glyphless"
    ? all.map((f, i) => (i === all.findIndex((x) => x.w === 700 && x.family === FAMILY) && absent[700].size
      ? { ...f, ranges: f.ranges.concat([[[...absent[700]][0].codePointAt(0), [...absent[700]][0].codePointAt(0)]]) }
      : f))
    : all;
  for (const f of use) {
    const hit = [...absent[f.w] ?? []].filter((c) => f.ranges.some(([lo, hi]) => lo <= c.codePointAt(0) && c.codePointAt(0) <= hi));
    if (hit.length) bad.push(`${f.url.split("/").pop()} の範囲に、書体に字形の無い字 ${hit.length}字（${hit.slice(0, 8).join("")}）`);
  }
  return bad;
}

/* ── 書き出しの地の字（「記録の古さ」） ─────────────────────────────── */

/**
 * 書き出した面の、地の字。`subset.py` の `from_export()` と同じ剥がしかたに、
 * `<title>` `<noscript>` `<template>` を足す（`COLLECT` が数えないもの）。
 */
function htmlText(html) {
  return html
    .replace(/<(script|style|title|noscript|template)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d));
}

/** 書き出しの中の、その面の HTML。無ければ null */
function readPage(dist, page) {
  const p = join(dist, `${page}.html`);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
}

/**
 * 記録に無い字が、まだ払っていない1本をいくら引くかを、面ごとに少なく見積もる。
 *
 * @param rows `measure()` の答え（払っている1本 `hit` と、引く順 `pick`）
 * @param html 面 → HTML（無い面は数えない）
 * @returns {{page:string, unknown:string, extra:number, est:number}[]} 記録に無い字がある面だけ
 */
function staleness(seen, rows, html) {
  const out = [];
  for (const r of rows) {
    const h = html.get(r.page);
    if (h == null) continue;
    const rec = seen[r.page];
    /* 島の書体で1字も描かない面（`/roulette` はゲームの書体）。HTML の地の字は
       別の書体で出ているので、記録に無くても古いとは言えない */
    if (!Object.values(rec).join("")) continue;
    const have = new Set(Object.values(rec).join(""));
    const unknown = [...new Set(htmlText(h))].filter((c) => !have.has(c) && !INVISIBLE.test(c) && c.codePointAt(0) > 0x1f);
    if (!unknown.length) continue;
    /* その面が描く太さ。1字も記録が無い面は、ふだんの字（400）で描くものとする */
    const ws = WEIGHTS.filter((w) => (rec[String(w)] || "").length);
    /* 少なく見積もる（いちばん安い太さ）ものと、多く見積もる（いちばん高い太さ）ものの2つ */
    const pull = new Set();
    const pullHi = new Set();
    /* どの太さでも、どの1本にも入っていない字（書体には字形がある）。**表にも束にも無い**＝
       その面の字を数え直さないまま焼いた。払う量は0だが、画面では端末の書体で出ている */
    const unbaked = [];
    for (const c of unknown) {
      let lo = null;
      let hi = null;
      let baked = false;
      for (const w of ws.length ? ws : [400]) {
        const i = r.pick(r.page, w, c.codePointAt(0));
        if (i >= 0) baked = true;
        const cost = i < 0 || r.hit.has(i) ? 0 : r.use[i].bytes;
        if (lo === null || cost < lo.cost) lo = { cost, i };
        if (hi === null || cost > hi.cost) hi = { cost, i };
      }
      if (lo.cost) pull.add(lo.i);
      if (hi.cost) pullHi.add(hi.i);
      if (!baked && !WEIGHTS.some((w) => absent[w].has(c))) unbaked.push(c);
    }
    const sum = (set) => [...set].reduce((a, i) => a + r.use[i].bytes, 0);
    out.push({ page: r.page, unknown: unknown.join(""), unbaked: unbaked.join(""), extra: sum(pull), extraHi: sum(pullHi), est: r.bytes });
  }
  return out;
}

/** 記録の古さで落ちる理由を返す（空なら通った） */
function judgeStale(found) {
  const bad = [];
  for (const s of found) {
    const kb = s.extra / 1024;
    const hi = (s.est + s.extraHi) / 1024;
    const head = `${s.page} の記録が古い: 表に無い字 ${[...s.unknown].length}字（${[...s.unknown].slice(0, 12).join("")}）が、`;
    if (s.unbaked) {
      bad.push(head + `うち ${[...s.unbaked].length}字（${[...s.unbaked].slice(0, 12).join("")}）はどの1本にも焼いていない（画面では端末の書体で出る）`);
    } else if (kb >= STALE_KB) {
      bad.push(head + `まだ払っていない1本を少なくとも ${kb.toFixed(1)}KB 引く（見積もり ${(s.est / 1024).toFixed(1)} → ${((s.est + s.extra) / 1024).toFixed(1)}KB 以上）`);
    } else if (s.extraHi && hi > MAX_KB) {
      /* いちばん安い太さなら0でも、いちばん高い太さで描いていれば上限を超える。
         どちらで描いているかは HTML から言えない＝**上限の中だとは言えない** */
      bad.push(head + `描く太さしだいで ${(s.est / 1024).toFixed(1)} → ${hi.toFixed(1)}KB（上限 ${MAX_KB}KB）。上限の中だとは言えない`);
    }
  }
  return bad;
}

/**
 * ひとりぶんの面の書き出しに、当たり判定（canonical の末尾）が当たるか。
 * @param break_ "nocanon"（面の HTML から canonical を抜く）
 */
function soloScope(rules, html, break_) {
  const bad = [];
  for (const page of rules.keys()) {
    let h = html.get(page);
    if (h == null) { bad.push(`ひとりぶんの面 ${page} が書き出しに無い`); continue; }
    if (break_ === "nocanon") h = h.replace(/<link rel="canonical"[^>]*>/g, "");
    const href = (h.match(/<link rel="canonical" href="([^"]*)"/) || [])[1];
    if (!href || !href.endsWith(`/${page}`)) {
      bad.push(`${page} の書き出しの canonical が ${href ?? "無い"}（fonts.css の当たり判定 \`href$="/${page}"\` が当たらず、面はふだんの束を引く）`);
    }
  }
  return bad;
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
const rules = soloRules();
/* 字形の無い字の表。**無ければ数えない**——無いまま回すと、絵文字の出る面がぜんぶ「落ちる字」で赤くなり、
   本物の落ちが埋もれる */
let absent;
try {
  const raw = JSON.parse(readFileSync(ABSENT, "utf8"));
  absent = Object.fromEntries(WEIGHTS.map((w) => [w, new Set(raw[String(w)] ?? "")]));
} catch (e) {
  console.log(`✕ ${ABSENT} が読めない: ${e.message}（\`tools/fonts/subset.py\` が書く）`);
  process.exit(2);
}
if (!all.length || Object.keys(seen).length < 50) {
  console.log(`✕ 数えるものが無い（束 ${all.length}本 / 面 ${Object.keys(seen).length}枚）`);
  process.exit(2);
}
/* 書き出しの HTML（記録の古さ・ひとりぶんの当たり判定）。**無ければ空**——その2つは見ない */
const html = new Map();
/* Hosting が 301 で余所へ送る面（`/next/new` → `/board` など）は、読む人に HTML が
   届かない。焼いてあるのは中身の無い殻で、`fontweigh.mjs` は送り先の字を記録している
   ——突き合わせると、送り先と殻の違いを「古い」と言ってしまう */
const moves = loadRedirects();
const moved = [];
if (pageKeys(DIST).length) {
  for (const page of Object.keys(seen)) {
    if (redirectOf(page === "index" ? "/" : `/${page}`, moves)) { moved.push(page); continue; }
    const h = readPage(DIST, page);
    if (h != null) html.set(page, h);
  }
}

/**
 * 記録の古さの対照に使う「その面がまだ払っていない、高い1本の字」を探す。
 * その面が描く**どの太さでも**、払っていない STALE_KB 以上の1本から出る字でないと、
 * 少なく見積もる式（いちばん安い太さを選ぶ）では0に化けて、対照にならない。
 */
function costlyChar(row) {
  const rec = seen[row.page];
  const have = new Set(Object.values(rec).join(""));
  const ws = WEIGHTS.filter((w) => (rec[String(w)] || "").length);
  for (const [i, f] of row.use.entries()) {
    if (row.hit.has(i) || f.bytes < STALE_KB * 1024) continue;
    for (const [lo, hi] of f.ranges) {
      for (let cp = lo; cp <= hi; cp++) {
        const c = String.fromCodePoint(cp);
        if (have.has(c) || INVISIBLE.test(c) || WEIGHTS.some((w) => absent[w].has(c))) continue;
        const dear = (ws.length ? ws : [400]).every((w) => {
          const j = row.pick(row.page, w, cp);
          return j >= 0 && !row.hit.has(j) && row.use[j].bytes >= STALE_KB * 1024;
        });
        if (dear) return c;
      }
    }
  }
  return null;
}

console.log("[対照] わざと壊した入力で、この見張りが落ちるか");
let ok = true;
for (const [name, why] of [["share", "太さごとの切り分けをやめる"], ["drop", "束を1つ無かったことに"]]) {
  // share は「太さごとに切るのをやめた日」の姿。その太さで焼いていない字が
  // 落ちるのは当たり前なので、**大きさだけ**で落ちることを見る
  const bad = judge(measure(seen, all, rules, name), `${name}（${why}）`, name === "share" ? "size" : null);
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
/* ひとりぶんの対照。**ひとりぶんの面が無い日は当てるものが無い**ので飛ばす
   （焼いたのに当たり判定を読めなかった日は、本物の `soloShape` が「当たり判定の無い1本」で落とす） */
if (rules.size) {
  {
    /* 当たり判定を無かったことにする。ひとりぶんの面がふだんの束を引いて重くならなければ、
       ひとりぶんを数える足は、何も見ていない */
    const rows = measure(seen, all, new Map(), null).filter((r) => rules.has(r.page));
    const bad = judge(rows, `unscoped（ひとりぶんの ${rows.length}面をふだんの束で）`, "size");
    console.log(`  ${bad.length ? "○" : "✕"} unscoped → ${bad.length ? bad[0] : "**素通りした。ひとりぶんの足は効いていない**"}`);
    if (!bad.length) ok = false;
  }
  {
    const bad = soloShape(seen, all, rules, "noweight");
    console.log(`  ${bad.length ? "○" : "✕"} noweight（ひとりぶんの家族から 900 を抜く）→ ${bad.length ? bad[0] : "**素通りした。太さの揃いを見ていない**"}`);
    if (!bad.length) ok = false;
  }
}
{
  const bad = glyphless(all, "glyphless");
  console.log(`  ${bad.length ? "○" : "✕"} glyphless（字形の無い字を束の範囲に1つ足す）→ ${bad.length ? bad[0] : absent[700].size ? "**素通りした。字形の無い字の範囲を見ていない**" : "足す字が無い（700 に字形の無い字が1つも無い）"}`);
  if (!bad.length && absent[700].size) ok = false;
}
if (html.size) {
  {
    /* 面の HTML に、その面がまだ払っていない高い1本の字を1つ足す。記録の古さの足が
       効いていなければ素通りする。足す面は、ひとりぶんの面があればそこ（いちばん守りたい面） */
    // 島の書体で1字も描かない面は、記録の古さを見ない面（`staleness()`）なので、足しても当たらない
    const rows = measure(seen, all, rules, null).filter((r) => html.has(r.page) && Object.values(seen[r.page]).join(""));
    /* ひとりぶんの面を先に、次に軽い面から（払っていない1本が多いので、足す字が見つかりやすい）。
       その面が束を広く引いていると、どの太さでも高い字が残っていないことがある */
    const order = rows.filter((r) => rules.has(r.page)).concat(rows.filter((r) => !rules.has(r.page)).sort((a, b) => a.bytes - b.bytes));
    let row = order[0];
    let c = null;
    for (const r of order) {
      c = costlyChar(r);
      if (c) { row = r; break; }
    }
    let bad = [];
    if (c) {
      const fake = new Map(html);
      fake.set(row.page, html.get(row.page) + `<p>${c}</p>`);
      bad = judgeStale(staleness(seen, [row], fake));
    }
    console.log(`  ${bad.length ? "○" : "✕"} stale（${row.page} に「${c ?? "？"}」を1字足す）→ ${bad.length ? bad[0] : c ? "**素通りした。記録の古さの足は効いていない**" : "足す字を作れなかった"}`);
    if (!bad.length) ok = false;
  }
  {
    /* 面の HTML に、どの1本にも焼いていない漢字を1つ足す（字を足したのに、表も束も直さなかった日の姿）。
       払う量は0なので、払う量だけを見ていると素通りする */
    const rows = measure(seen, all, rules, null).filter((r) => html.has(r.page) && Object.values(seen[r.page]).join(""));
    const row = rows.find((r) => rules.has(r.page)) ?? rows[0];
    let c = null;
    for (let cp = 0x4e00; cp <= 0x9fff && !c; cp++) {
      const x = String.fromCodePoint(cp);
      if (WEIGHTS.every((w) => row.pick(row.page, w, cp) < 0 && !absent[w].has(x))) c = x;
    }
    const fake = new Map(html);
    if (c) fake.set(row.page, html.get(row.page) + `<p>${c}</p>`);
    const bad = c ? judgeStale(staleness(seen, [row], fake)) : [];
    console.log(`  ${bad.length ? "○" : "✕"} unbaked（${row.page} に焼いていない「${c ?? "？"}」を1字足す）→ ${bad.length ? bad[0] : "**素通りした。焼いていない字を見ていない**"}`);
    if (!bad.length) ok = false;
  }
  if (rules.size) {
    const bad = soloScope(rules, html, "nocanon");
    console.log(`  ${bad.length ? "○" : "✕"} nocanon（ひとりぶんの面から canonical を抜く）→ ${bad.length ? bad[0] : "**素通りした。当たり判定を書き出しで見ていない**"}`);
    if (!bad.length) ok = false;
  }
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
const rows = measure(seen, all, rules, null);
const size = judge(rows, "いま", null);
for (const r of rows.filter((x) => rules.has(x.page))) {
  console.log(`  ひとりぶん  ${r.page} ${(r.bytes / 1024).toFixed(1)}KB（${r.hit.size}本）`);
}
const shape = soloShape(seen, all, rules, null).concat(glyphless(all, null));
let stale = [];
if (html.size) {
  const found = staleness(seen, rows, html);
  stale = judgeStale(found).concat(soloScope(rules, html, null));
  console.log(
    `  記録の古さ  書き出しの ${html.size}面と突き合わせ（301 で余所へ送る ${moved.length}面は除く）  表に無い字がある面 ${found.length}枚` +
    `（うち焼いていない字がある面 ${found.filter((s) => s.unbaked).length}枚・払っていない1本を引く面 ${found.filter((s) => s.extra).length}枚・${STALE_KB}KB 以上 ${found.filter((s) => s.extra >= STALE_KB * 1024).length}枚）`
  );
} else {
  console.log("  記録の古さ  書き出しが無いので見ない（書き出しを持つ `selftest.yml` の reachkeys job が見る）");
}
const bad = cover.concat(size, shape, stale);
if (bad.length) {
  for (const b of bad) console.log(`  ✕ ${b}`);
  if (cover.length || stale.length) {
    console.log("\n表（`tools/fonts/weights.json`）が島の面に追いついていない。**数え直してから焼く:**");
    console.log("  tools/build.sh 3250");
    console.log("  python3 -m http.server 4250 --directory site/.next-3250 &");
    console.log("  DIST=site/.next-3250 SPORT=4250 node tools/sprites/fontweigh.mjs   # offline() を通すこと（#266）");
    console.log("  python3 tools/fonts/subset.py --export site/.next-3250");
  }
  if (size.length) {
    console.log("\n書体が太った。`tools/fonts/subset.py` を回し直す。それでも超える面は、上限を上げる前に");
    console.log("`subset.py` の `SOLO`（その面の字だけの1本）に足せないかを見る");
  }
  process.exit(1);
}
console.log("○ 書体は上限の中にあり、表は島の面ぜんぶを持っていて、書き出しより古くない");
