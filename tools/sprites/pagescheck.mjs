/**
 * 集めた面と、手で書いた一覧を**突き合わせる**。
 *
 *   SPORT=4160 node pagescheck.mjs                       # 書き出し ⇔ pcpages.txt
 *   LISTB=…/other.txt node pagescheck.mjs                # 相手を変える
 *
 * 片側だけ見ると「足りない」しか出ない。**消えた面が一覧に残っている**ほうも
 * 同じだけ困る（測れずに落ちて、それが数に出ない）。両側を出す。
 *
 * `SPORT` を渡すと、集めた面を**配っているものに当てて確かめる。**
 * 歩いた置き場（`DIST`）と配っている置き場が違っていても、面の数だけ見ていると
 * 気づけない。当たらない面が出たらそこで分かる。
 */
import { collect, banner } from "./pages.mjs";
import { readFileSync } from "fs";
import { fromRoot } from "./repo.mjs";

const LISTB = fromRoot(process.env.LISTB || "tools/sprites/pcpages.txt");
const SPORT = process.env.SPORT;

const c = collect({ pages: null, list: null });
console.log(banner(c));

const b = readFileSync(LISTB, "utf8")
  .split("\n").map((s) => s.trim()).filter((s) => s && !s.startsWith("#"));

const A = new Set(c.all), B = new Set(b);
const onlyA = [...A].filter((x) => !B.has(x)).sort();
const onlyB = [...B].filter((x) => !A.has(x)).sort();

console.log(`\n突き合わせ: 書き出し ${A.size}面 ⇔ ${LISTB} ${B.size}面`);
console.log(`\n| どちら | 面 | 測る/除く |`);
console.log(`| --- | --- | --- |`);
const why = (p) => {
  const s = c.skipped.find((x) => x.path === p);
  if (s) return "除く";
  return c.partial.find((x) => x.path === p) ? "測る（中身はそろわない）" : "測る";
};
for (const p of onlyA) console.log(`| 書き出しにしか無い | \`${p}\` | ${why(p)} |`);
for (const p of onlyB) console.log(`| 一覧にしか無い | \`${p}\` | **書き出しに無い（測れない）** |`);
if (!onlyA.length && !onlyB.length) console.log(`| — | 差は無い | — |`);

/* **差0 が「揃っている」なのか「突き合わせが壊れている」なのかを、
   同じ出力の中で分かるようにする**（`docs/island-misses.md` #79）。
   重なりの数を出しておけば、両方0なのに重なりも0、が読める。 */
console.log(`\n重なり ${[...A].filter((x) => B.has(x)).length}面 / 書き出しにしか無い ${onlyA.length}面 / 一覧にしか無い ${onlyB.length}面`);

if (SPORT) {
  let ng = 0;
  for (const p of c.all) {
    const url = `http://localhost:${SPORT}${p === "/" ? "/index" : p}.html`;
    let st = 0;
    try { st = (await fetch(url, { method: "GET" })).status; } catch { st = -1; }
    if (st !== 200) { ng++; console.log(`  当たらない ${p} [${st}]`); }
  }
  console.log(`配っているものに当ててみた: ${c.all.length - ng}/${c.all.length} が 200${ng ? "  ** 置き場がずれている **" : ""}`);
}
