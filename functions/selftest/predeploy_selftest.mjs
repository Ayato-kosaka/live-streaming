/**
 * **本番へ配る前に走るもの**（`firebase.json` の `predeploy`）を、
 * マージする前に同じ順で回す。
 *
 *     node functions/selftest/predeploy_selftest.mjs
 *
 * ## なぜ要るか（2026-10-09 に実際に止まった）
 *
 * `firebase.json` の `functions.predeploy` は2本ある。
 *
 *     npm --prefix "$RESOURCE_DIR" run lint
 *     npm --prefix "$RESOURCE_DIR" run build
 *
 * **配るワークフローは `build` しか回していない**（`🔨 TypeScript ビルド`）。
 * `lint` が回るのは `firebase deploy` の中で、**そこで落ちると
 * 「Deploy to Firebase」1行だけが赤くなる。** しかも Actions のログは
 * 置き場（Azure Blob）から配られていて REST の口からは読めないので、
 * **何が悪いのかがどこにも出ない。**
 *
 * 実際にこれで止まった。`src/stampLine.ts` の1行が 82字（上限 80）で、
 * 型は通る・見張りは全部緑・PR も緑のまま **master に入り、本番の
 * Functions だけが2回続けて配られなかった**（#716）。
 * 口を叩くまで気づけない——画面は配られているので、**半分だけ出た状態**で
 * 残る。
 *
 * ## 何を見ているか
 *
 * **`firebase.json` から読む。写しを持たない。** ここに `lint` と書き写すと、
 * あちらに3本目が足された日にこの見張りが古いまま通る。
 * 読んだコマンドのうち `npm run <名前>` の形のものを、**書いてある順に**回す。
 *
 * ## 探し方が当たることを、先に見る（`docs/island-misses.md` #19）
 *
 * 「落ちなかった」は、**1本も回していなくても落ちない。**
 * だから先に「`predeploy` から2本以上を取り出せたこと」を数えて出す。
 * 取り出せなければ、通さずに 2 で止まる。
 *
 * 終了コード: 0=通った / 1=落ちた / 2=数えるものが無い
 */

import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FUNCTIONS = join(HERE, "..");
const ROOT = join(FUNCTIONS, "..");

/** `firebase.json` の `functions` の節。配列のことも1つのこともある */
const conf = JSON.parse(readFileSync(join(ROOT, "firebase.json"), "utf8"));
const blocks = [].concat(conf.functions ?? []);
const mine = blocks.find((b) => (b.source ?? "functions") === "functions");

if (!mine) {
  console.error("firebase.json に functions の節が見つからない");
  process.exit(2);
}

/** `npm --prefix "$RESOURCE_DIR" run lint` から `lint` を取り出す */
const names = [];
for (const line of mine.predeploy ?? []) {
  const m = /\bnpm\b[^&|;]*\brun\s+([A-Za-z0-9:_-]+)/.exec(String(line));
  if (m) names.push(m[1]);
}

console.log(`# firebase.json の predeploy から取り出したもの: ${names.join(" / ") || "（無い）"}`);

/* **1本も取り出せなかった、または1本しか無いなら通さない。**
   いまは `lint` と `build` の2本。減っていたら、こちらの読み方が
   外れたのか、あちらが変わったのか分からないので、黙って緑にしない。 */
if (names.length < 2) {
  console.error(
    `predeploy から ${names.length} 本しか取り出せなかった。` +
    "firebase.json の形が変わったか、読み方が外れている",
  );
  process.exit(2);
}

/** `functions/package.json` に、その名前の走らせかたが在るか */
const pkg = JSON.parse(readFileSync(join(FUNCTIONS, "package.json"), "utf8"));
const missing = names.filter((n) => !pkg.scripts?.[n]);
if (missing.length) {
  console.error(`package.json に無い: ${missing.join(" / ")}`);
  process.exit(2);
}

let bad = 0;
for (const name of names) {
  process.stdout.write(`  …${name} を回す\n`);
  try {
    execFileSync("npm", ["run", name], {cwd: FUNCTIONS, stdio: "pipe"});
    console.log(`  ok   ${name}`);
  } catch (e) {
    bad += 1;
    /* **落ちた中身はそのまま出す。** ここは視聴者さんの字を1文字も
       扱わない（型と字数の話）ので、公開のログに出してよい。
       むしろ出さないと、配るときと同じ「何が悪いか分からない」に戻る。 */
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    console.log(`  NG   ${name}\n${out.toString().trimEnd()}`);
  }
}

console.log("");
if (bad > 0) {
  console.log(
    `NG が ${bad} 件。**このまま master に入れると、本番の Functions が` +
    "配られない**（画面だけ出て、口が古いまま残る）。",
  );
  process.exit(1);
}
console.log(`ぜんぶ通った（${names.length} 本）。`);
