/**
 * **先読みを頼んでいる `<Link>` が残っていないか**を、ソースから数える。
 *
 *   node tools/sprites/prefetch_selftest.mjs
 *   終了コード 0＝残っていない / 1＝残っている / 2＝数えるものが無い
 *
 * ## なぜ要るか
 *
 * この島は静的書き出しなので、`next/link` の先読みは**その面の RSC を1本
 * まるごと**取りに行く。島の面はどれも大きいので、1本が 100KB〜800KB ある。
 * 画面に入っただけで始まるから、**押されなくても必ず払う。**
 *
 * 実測（2026-10-07 / 幅390 / 書き出したものを静的に配って）:
 *
 * | 面 | 先読みで落ちていた量 |
 * | --- | --- |
 * | `/nordic` | **3,022KB / 20本** |
 * | `/nordic/finland` | **1,661KB / 3本**（隣の国2つ＋島） |
 * | `/`（島） | 747KB / 11本 |
 * | ほとんどの面 | 110KB（頭の「あやと島」が島の RSC を取る） |
 *
 * だからこのリポジトリは**`prefetch={false}` を既定にしている。** ところが
 * 既定は「書き忘れたら先読みする」側なので、面を1枚足すたびに静かに戻る。
 * 実際、44ファイル・77か所が書き忘れのまま残っていた。
 * **人が気をつけて守れる決まりではない**ので、数で止める。
 *
 * 先読みしたい1枚があるときは、`prefetch={true}` と**明示して**書く
 * （`components/ui/Bits.tsx` の `StreamCard` がその形）。ここは
 * 「`prefetch` と書いていない `<Link>`」だけを挙げるので、明示は通る。
 *
 * ## 対照
 *
 * 見つける側が壊れていたら、**いつも「0件」で緑になる**
 * （`docs/island-standards.md` の「満たしようのない見張り」）。
 * なので、書き忘れた `<Link>` と明示した `<Link>` を1つずつ持った偽のソースを
 * その場で作って、**前者だけを挙げられること**を先に見る。
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { repoRoot } from "./repo.mjs";

/** そのファイルの中の「`prefetch` と書いていない `<Link>`」の行番号。 */
export function missing(src) {
  const out = [];
  const re = /<Link\b/g;
  let m;
  while ((m = re.exec(src))) {
    // タグの終わりを探す。`{...}` の中の `>` はタグの終わりではない
    let depth = 0;
    let j = m.index + m[0].length;
    for (; j < src.length; j++) {
      const ch = src[j];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === ">" && depth === 0) break;
    }
    const tag = src.slice(m.index, j + 1);
    if (!/\bprefetch\b/.test(tag)) out.push(src.slice(0, m.index).split("\n").length);
  }
  return out;
}

/** 覚え書きの中の `<Link ...>` は実物ではない。コメントを落としてから数える。 */
export function strip(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (s) => s.replace(/</g, "〈")).replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function walk(dir, hit = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, hit);
    else if (p.endsWith(".tsx")) hit.push(p);
  }
  return hit;
}

function control() {
  const box = mkdtempSync(join(tmpdir(), "prefetchcheck-"));
  const file = join(box, "a.tsx");
  writeFileSync(
    file,
    [
      'import Link from "next/link";',
      "/* 覚え書きの中の <Link href=\"/x\"> は実物ではない */",
      'export const A = () => <Link href="/x">わすれた</Link>;',
      'export const B = () => <Link prefetch={false} href="/y">書いた</Link>;',
      'export const C = () => (',
      '  <Link',
      '    href={`/z/${k}`}',
      '    className="t"',
      "  >ここもわすれた</Link>",
      ");",
    ].join("\n"),
  );
  const got = missing(strip(readFileSync(file, "utf8")));
  rmSync(box, { recursive: true, force: true });
  // 3行目と6行目の2つだけが挙がるのが正しい
  return { ok: got.length === 2 && got[0] === 3 && got[1] === 6, got };
}

const root = repoRoot(fileURLToPath(import.meta.url));
const ctl = control();
console.log(`対照 ${ctl.ok ? "一致" : `外れた（挙がった行 ${JSON.stringify(ctl.got)}）`}`);
if (!ctl.ok) {
  console.log("::error::対照が外れた。**本物の数は出さない。**");
  process.exit(2);
}

const files = [join(root, "site", "components"), join(root, "site", "app")].flatMap((d) => walk(d));
let found = 0;
let links = 0;
for (const f of files.sort()) {
  const src = readFileSync(f, "utf8");
  links += (src.match(/<Link\b/g) || []).length;
  for (const line of missing(strip(src))) {
    found++;
    console.log(`::error::${relative(root, f)}:${line} 先読みを止めていない <Link>（prefetch={false} を書く）`);
  }
}
console.log(`見た ${files.length}ファイル / <Link> ${links}か所 / 先読みが残っている ${found}か所`);
if (links === 0) {
  console.log("::error::<Link> が1つも見つからない。置き場所が変わっていないか");
  process.exit(2);
}
process.exit(found ? 1 : 0);
