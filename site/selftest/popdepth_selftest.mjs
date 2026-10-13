/**
 * **「押せる」の合図の深さが、段から選ばれているか。**
 *
 *     node site/selftest/popdepth_selftest.mjs
 *
 * 0＝通った / 1＝見つかった / 2＝数えるものが無い
 *
 * ## なぜ要るか（2026-10-13）
 *
 * `docs/island-design.md` 3-3 は、この島で**唯一の「押せる」合図**を決めている——
 * 「押せるものには下に厚みがある。押せないものは完全に平ら。光らせない。
 * きらめかせない。色を変えない。**厚みだけ。**」
 *
 * 同じ章が「48px のボタンで 6px、30px の札で 4px」と、**深さは部品の高さで選べ**
 * とも言っている。つまり決まっているのは「合図の**種類**は1つ」で、
 * 深さが1つという意味ではない。
 *
 * ところが名前が付いていたのは 4px・6px・8px の3段だけだった。実測（直す前）:
 *
 *     box-shadow の宣言 396 ／ うち var(--pop*) を使うもの 49（12%）
 *     手で書いた厚み 149 ／ 平常の深さ 7段（1・2・3・4・5・6・8px）
 *
 * **段が7つあること自体は悪くない。** 悪いのは、名前が3つしか無いので
 * **次に書く人が新しい数字を選べる**こと。1px まで下りると、
 * 落ち影（`--shadow-1` ＝ `1px 3px 3px`）と見分けがつかなくなる——
 * 合図が2つあるのと同じで、`docs/island-world.md` 7.8 で一度
 * **21面に53個**出たのと同じ形。
 *
 * `popcheck.mjs` は「**押せないのに厚み**」（逆向き）だけを見ていて、ずっと 0件・緑。
 * **「厚みが何段あるか」を数える道具は1本も無かった。**
 *
 * ## 見ているもの
 *
 * `site/app/css/*.css` の `box-shadow` を1つずつ割って、**厚み**の形
 * （`0 <深さ> 0 <色>`。`inset` は内側のハイライトなので別もの）を拾う。
 *
 *  1. **平常の深さが、ぜんぶ `--pop-d*` で書かれている。** 数字の直書きは落とす
 *  2. **段（`--pop-d*`）が `tokens.css` に在って、順に増えている**
 *  3. **段の数が増えすぎていない。** 増やすのは「部品の高さが要る」ときだけ
 *
 * ## 見ていないもの（理由つき）
 *
 * - **`:hover` と `:active` の深さ。** あれは平常の深さから引き算・足し算した
 *   「沈んだ/浮いた」値で、段とは別の決まり（沈む量と厚みの減る量を揃える、
 *   `tokens.css`）。平常の段に当てはめると、押した瞬間の見え方のほうが壊れる
 * - **白い `0 1px 0 rgba(255,255,255,…)`。** あれは面取りのハイライトで、
 *   厚みの合図ではない（`.panel > h2::after` の留め具がそれ）。色で分ける
 * - **`text-shadow` と `drop-shadow()`。** 字と絵の縁取りで、板の側面ではない
 *
 * ## わざと壊すと赤くなる（3とおり）
 *
 * **先に「壊していない写しが通ること」を見る**（`docs/island-standards.md` §15）。
 *
 * ```bash
 * node site/selftest/popdepth_selftest.mjs          # (0) 素のまま → 0
 * BREAK=a node site/selftest/popdepth_selftest.mjs  # 平常の厚みを数字で直書き → 1
 * BREAK=b node site/selftest/popdepth_selftest.mjs  # 段を1つ消す → 1
 * BREAK=c node site/selftest/popdepth_selftest.mjs  # 段の並びを狂わせる → 1
 * ```
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = join(HERE, "..", "app", "css");
const BREAK = process.env.BREAK || "";

/** 段をいくつまで許すか。増やすときは、ここと `tokens.css` の両方に理由を書く */
const MAX_RUNGS = 8;

let BAD = 0;
const ok = (s) => console.log(`  ok   ${s}`);
const ng = (s, why) => {
  BAD++;
  console.log(`  NG   ${s}${why ? ` — ${why}` : ""}`);
};
const stop = (why) => {
  console.log(`\n数えるものが無い: ${why}`);
  process.exit(2);
};

let files;
try {
  files = readdirSync(CSS).filter((f) => f.endsWith(".css")).sort();
} catch (e) {
  stop(`CSS を読めなかった: ${e.message}`);
}
if (files.length < 5) stop(`CSS が ${files.length} 枚しかない`);

const src = new Map();
for (const f of files) src.set(f, readFileSync(join(CSS, f), "utf8"));

/* 壊す写しは、読んだ中身のほうへ足す（本体のファイルは触らない） */
if (BREAK === "a") src.set("pages.css", src.get("pages.css") + "\n.ghost { box-shadow: 0 7px 0 var(--frame-dark); }\n");
if (BREAK === "b") src.set("tokens.css", src.get("tokens.css").replace(/\n\s*--pop-d3:\s*5px;/, ""));
if (BREAK === "c") src.set("tokens.css", src.get("tokens.css").replace(/--pop-d3:\s*5px;/, "--pop-d3: 1px;"));

// ---------------------------------------------------------------- 段

console.log("1. 段（--pop-d*）が tokens.css に在って、順に増えているか");
const rungs = [...src.get("tokens.css").matchAll(/--pop-d(\d+):\s*([0-9.]+)px;/g)].map((m) => ({
  n: Number(m[1]),
  px: Number(m[2]),
}));
if (!rungs.length) stop("tokens.css に --pop-d* が1つも無い（数え方が届いていない）");
rungs.sort((a, b) => a.n - b.n);
console.log(`   段 ${rungs.length}つ: ${rungs.map((r) => `--pop-d${r.n}=${r.px}px`).join(" / ")}`);

const names = new Set(rungs.map((r) => `--pop-d${r.n}`));
const climbing = rungs.every((r, i) => i === 0 || r.px > rungs[i - 1].px);
climbing ? ok("段は順に増えている") : ng("段の並びが狂っている", "高さで選ぶ段なので、名前の順と深さの順は揃っていないといけない");

rungs.length <= MAX_RUNGS
  ? ok(`段は ${rungs.length}つ（上限 ${MAX_RUNGS}）`)
  : ng(`段が ${rungs.length}つに増えている`, `増やすのは部品の高さが要るときだけ。上限は ${MAX_RUNGS}`);

/* いちばん浅い段が、落ち影と見分けられるか。`--shadow-1` は `1px 3px 3px` */
const shallow = rungs[0]?.px ?? 0;
shallow >= 2
  ? ok(`いちばん浅い段は ${shallow}px（落ち影 --shadow-1 の 1px より深い）`)
  : ng(
      `いちばん浅い段が ${shallow}px`,
      "落ち影（--shadow-1 = 1px 3px 3px）と向きもぼかしも近く、合図が2つあるのと同じになる（island-world.md 7.8）",
    );

// ---------------------------------------------------------------- 直書き

console.log("\n2. 平常の厚みが、ぜんぶ段で書かれているか");
{
  /** その宣言が状態（押した・乗せた）のものか */
  const isState = (sel) => /:active|:hover|:focus/.test(sel);
  /** 白っぽい色は面取りのハイライトで、厚みではない */
  const isWhite = (c) => /rgba\(\s*255\s*,\s*255\s*,\s*255|#fff/i.test(c);

  let seen = 0;
  const raw = [];
  for (const [f, text] of src) {
    if (f === "tokens.css") continue;
    for (const m of text.matchAll(/([^{};]*)\{([^{}]*)\}/g)) {
      const sel = m[1].trim().split("\n").pop().trim();
      for (const d of m[2].matchAll(/box-shadow:\s*([^;]+);/g)) {
        /* カンマで割る。`rgba(…)` の中のカンマでは割らない */
        const parts = [];
        let depth = 0;
        let cur = "";
        for (const ch of d[1]) {
          if (ch === "(") depth++;
          if (ch === ")") depth--;
          if (ch === "," && depth === 0) {
            parts.push(cur);
            cur = "";
          } else cur += ch;
        }
        parts.push(cur);
        for (const p of parts) {
          const s = p.trim();
          if (s.includes("inset")) continue;
          const hit = /^0\s+([0-9.]+px|var\(--pop-d\d+\))\s+0\s+(.+)$/.exec(s);
          if (!hit) continue;
          if (isWhite(hit[2])) continue;
          if (isState(sel)) continue;
          seen++;
          if (!hit[1].startsWith("var(")) raw.push(`${f}  ${sel.slice(0, 48)}  → ${hit[1]}`);
          else if (!names.has(hit[1].slice(4, -1))) raw.push(`${f}  ${sel.slice(0, 48)}  → ${hit[1]}（段に無い）`);
        }
      }
    }
  }
  if (seen < 20) stop(`平常の厚みを ${seen} か所しか拾えなかった（数え方が届いていない）`);
  console.log(`   平常の厚み ${seen}か所 / 直書き ${raw.length}か所`);
  for (const r of raw.slice(0, 20)) console.log(`     × ${r}`);
  raw.length === 0
    ? ok(`${seen}か所ぜんぶが段で書かれている`)
    : ng(
        `${raw.length}か所が数字の直書き`,
        "深さは `--pop-d*` から選ぶ。直に書くと、次の人がまた新しい数字を選ぶ（tokens.css の段の注）",
      );
}

console.log();
if (BAD) {
  console.log(`${BAD}件 見つかりました。`);
  process.exitCode = 1;
} else {
  console.log("段から外れた厚みは、見つかりませんでした。");
}
