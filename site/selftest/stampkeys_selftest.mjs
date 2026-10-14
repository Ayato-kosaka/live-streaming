/**
 * **LINEスタンプのいいねの鍵**の確かめ（`content/goods.ts`。2026-10-11）
 *
 *     node site/selftest/stampkeys_selftest.mjs
 *
 * 前は `/me` の「スタンプのことば」（`components/me/stampShow.ts`。#716）と
 * 2本立てだった。あちらは欄ごと消したので（#860）、この1本だけ残っている。
 *
 * ---
 *
 * # いいねの鍵（`LINE_STAMPS` の `line` と `also`）
 *
 * いいねは**付箋の字**に当たっている（`components/goods/wordVotes.tsx`）。
 * 字が鍵なので、**言い方が変わると、すでに付いているいいねが迷子になる。**
 * 2026-10-11 に届いた3枚のうち2枚が、提案のときの言い方と絵の中の字で
 * 食い違っていた（「サプラ〜イズ！！」→「サプラーイズ！」、
 * 「にわかには信じられへん」→「にわかに信じられへん」）。
 * 前の言い方は `also` に残してあって、**数は `line` と `also` を足して出す。**
 *
 * 鍵が増えると、目では見分けられない事故が2つ起きる。
 *
 *  1. **1つの字が2枚のスタンプを指す** → 別の枠のいいねを数える
 *  2. **`LINE_WORDS` から鍵が抜ける** → `Notes` の `omitTexts` が
 *     その字を落とさないので、**同じ言葉が一覧にもう一度並ぶ**
 *
 * この2つを見る。**`art` が焼いたものかは見ない**——
 * `python/goods_stamp_selftest.py` が帳面（`tools/goods/stamped.json`）と
 * 指紋で見ているので、ここに写すと**同じ判定が2か所で腐る。**
 *
 * ## わざと壊して、赤くなることを見る
 *
 * ```bash
 * # 1. 1つの字が2枚を指す（`also` を、ほかの枚のセリフと同じにする）
 * sed 's/also: \["サプラ〜イズ！！"\]/also: ["ほな"]/' \
 *   site/content/goods.ts > /tmp/stamp-clash.ts
 * STAMP_GOODS_TS=/tmp/stamp-clash.ts node site/selftest/stampkeys_selftest.mjs   # → 1
 *
 * # 2. `LINE_WORDS` から `also` を落とす（一覧に二重に出る側）
 * sed 's/^export const LINE_WORDS = LINE_VOTES.flat();/export const LINE_WORDS = LINE_STAMPS.map((s) => s.line);/' \
 *   site/content/goods.ts > /tmp/stamp-drop.ts
 * STAMP_GOODS_TS=/tmp/stamp-drop.ts node site/selftest/stampkeys_selftest.mjs   # → 1
 *
 * # 3. 鍵の前後に空白（付箋の字と永久に一致しない。いいねが 0 のまま動かない）
 * sed 's/line: "悲報なんやけど"/line: "悲報なんやけど "/' \
 *   site/content/goods.ts > /tmp/stamp-space.ts
 * STAMP_GOODS_TS=/tmp/stamp-space.ts node site/selftest/stampkeys_selftest.mjs   # → 1
 * ```
 *
 * **読めなかった写しは 1 ではなく 2。** 1 で落とすと「鍵が食い違った」に
 * 見えるが、鍵は1つも読めていない。
 *
 * 終了コード: 0=通った / 1=食い違った / 2=数えるものが無い
 */
import { createRequire } from "module";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ts = require("typescript");

/**
 * TS を1枚、**組み立てずに読む**（型は見ない。見たいのは中身の値）。
 *
 * @param {string} file 読むファイル
 * @param {(p: string) => unknown} [req] `import` の行き先。
 *   別名（`@/lib/…`）は tsc が道に直してくれないので、呼ぶ側が渡す
 */
function loadTs(file, req) {
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  new Function("exports", "require", "module", code)(
    mod.exports, req ?? require, mod,
  );
  return mod.exports;
}

let bad = 0;
let seen = 0;

/**
 * 1件の確かめ（○×のほう）。
 * @param {string} name 何を見ているか
 * @param {boolean} good 通ったか
 * @param {string} [why] 落ちたときに出す1行
 */
function yes(name, good, why = "") {
  seen += 1;
  if (good) {
    console.log(`  ok   ${name}`);
    return;
  }
  bad += 1;
  console.log(`  NG   ${name}${why ? ` — ${why}` : ""}`);
}

/** 数えるものが無い。**本物の数字を1つも出さずに帰る** */
function give(why) {
  console.log(why);
  process.exit(2);
}

/**
 * 鍵の食い違いを並べる。**空なら通った。**
 *
 * 見るのは2つで、どちらも**両方向から**当てる——
 * 鍵が `LINE_WORDS` に在るかと、`LINE_WORDS` の字を指すスタンプが在るか。
 * 片側だけだと、`LINE_WORDS` に余計な字を足した日に黙る。
 *
 * @param {{id: string, line: string, also?: string[]}[]} stamps
 * @param {string[]} words `LINE_WORDS`（`Notes` の `omitTexts` に渡す一覧）
 * @returns {string[]} 見つかった食い違い
 */
function keyTrouble(stamps, words) {
  const out = [];
  /** 字 → それを鍵にしているスタンプの id */
  const owner = new Map();
  for (const s of stamps) {
    for (const k of [s.line, ...(s.also ?? [])]) {
      if (typeof k !== "string" || k.trim() === "" || k.trim() !== k) {
        /* 付箋は `text.trim()` で突き合わせる。前後に空白のある鍵は
           **どの付箋とも永久に一致しない**（いいねが 0 のまま動かない） */
        out.push(`${s.id}: 鍵が空か、前後に空白がある（${JSON.stringify(k)}）`);
        continue;
      }
      const who = owner.get(k);
      if (who !== undefined) {
        out.push(`「${k}」を ${who} と ${s.id} の2枚が指している（いいねが混ざる）`);
        continue;
      }
      owner.set(k, s.id);
    }
  }
  for (const [k, id] of owner) {
    if (!words.includes(k)) {
      out.push(`「${k}」（${id}）が LINE_WORDS に無い（一覧に同じ言葉が二重に出る）`);
    }
  }
  for (const w of words) {
    if (!owner.has(w)) out.push(`LINE_WORDS の「${w}」を指すスタンプが1枚も無い`);
  }
  if (new Set(words).size !== words.length) {
    out.push("LINE_WORDS に同じ字が2回ある");
  }
  return out;
}

/* ---- 対照。**本物を1枚も見る前に、両側から当てる** ---- */
{
  const fine = [
    { id: "a", line: "あ" },
    { id: "b", line: "い", also: ["う"] },
  ];
  const drill = [];
  if (keyTrouble(fine, ["あ", "い", "う"]).length) {
    drill.push("対照1: 合っているのに落ちた");
  }
  if (!keyTrouble(
    [{ id: "a", line: "あ" }, { id: "b", line: "い", also: ["あ"] }],
    ["あ", "い"],
  ).length) {
    drill.push("対照2: 1つの字が2枚を指しているのに通った");
  }
  if (!keyTrouble(fine, ["あ", "い"]).length) {
    drill.push("対照3: LINE_WORDS から鍵が抜けているのに通った");
  }
  if (!keyTrouble(fine, ["あ", "い", "う", "え"]).length) {
    drill.push("対照4: LINE_WORDS の余計な字を見逃した");
  }
  if (!keyTrouble([{ id: "a", line: " あ" }], [" あ"]).length) {
    drill.push("対照5: 前後に空白のある鍵が通った");
  }
  if (!keyTrouble(fine, ["あ", "い", "う", "う"]).length) {
    drill.push("対照6: LINE_WORDS の重複を見逃した");
  }
  if (drill.length) give(`対照が外れた。鍵は1つも見ていない\n  ${drill.join("\n  ")}`);
  console.log("\n# 対照 通った（合う1 / かぶり / 抜け / 余り / 空白 / 重複 の6通り）");
}

/* ---- 本物 ---- */
/** 見るもの。**落ちることを確かめる写しだけ、ここを差し替える。** */
const GOODS_TS = process.env.STAMP_GOODS_TS ||
  join(here, "..", "content", "goods.ts");
let goods;
try {
  /* 別名（`@/lib/ayatoArt`）は tsc が道に直してくれないので、自分で渡す */
  const art = loadTs(join(here, "..", "lib", "ayatoArt.ts"));
  goods = loadTs(GOODS_TS, (p) => (p.includes("ayatoArt") ? art : require(p)));
} catch (e) {
  give(`${GOODS_TS} を読めなかった: ${e}`);
}
const { LINE_STAMPS, LINE_WORDS, LINE_VOTES } = goods;
if (!Array.isArray(LINE_STAMPS) || LINE_STAMPS.length === 0) {
  give(`${GOODS_TS} から LINE_STAMPS を読めなかった`);
}
if (!Array.isArray(LINE_WORDS) || LINE_WORDS.length === 0) {
  give(`${GOODS_TS} から LINE_WORDS を読めなかった`);
}

console.log(
  `\n# 1. いいねの鍵（スタンプ ${LINE_STAMPS.length}枚 / 鍵 ${LINE_WORDS.length}本。` +
  `うち ${LINE_WORDS.length - LINE_STAMPS.length}本が「同じスタンプを指すほかの字」）`,
);
const trouble = keyTrouble(LINE_STAMPS, LINE_WORDS);
yes(
  `鍵がぜんぶ違う字で、LINE_WORDS と過不足なく合う`,
  trouble.length === 0,
  trouble.join(" / "),
);
/* 枠に出て、押すと立つのは**先頭**。導出を手で並べ直していないことも見る——
   写すと、1枚足した日に `StampVotes` に渡す側だけ古くなる */
yes(
  "LINE_VOTES が LINE_STAMPS から出ていて、先頭が line",
  Array.isArray(LINE_VOTES) &&
    LINE_VOTES.length === LINE_STAMPS.length &&
    LINE_VOTES.every((v, i) =>
      Array.isArray(v) &&
      v[0] === LINE_STAMPS[i].line &&
      v.slice(1).join("\u0000") === (LINE_STAMPS[i].also ?? []).join("\u0000")),
  JSON.stringify(LINE_VOTES),
);
/* `art` が焼いたものかは**ここでは見ない。**
   `python/goods_stamp_selftest.py` が帳面と指紋で見ている（写すと2か所で腐る）。
   ここで見るのは、**面が絵を出す側の形**だけ */
yes(
  "id がぜんぶ違う（焼いた絵のファイル名になる）",
  new Set(LINE_STAMPS.map((s) => s.id)).size === LINE_STAMPS.length,
);

console.log("");
if (seen === 0) {
  console.log("数えるものがありませんでした。");
  process.exit(2);
}
if (bad > 0) {
  console.log(`NG が ${bad} 件 / 見た ${seen} 件。`);
  process.exit(1);
}
console.log(`ぜんぶ通った（${seen} 件）。`);
