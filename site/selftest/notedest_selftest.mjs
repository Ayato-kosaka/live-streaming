/**
 * **宛先を決め打ちしている面と、付箋の宛先の表が、食い違っていないか。**
 *
 *     node site/selftest/notedest_selftest.mjs
 *     # 0=通った / 1=壊れていた / 2=数えるものが無い
 *
 * ## なぜ別に立てたのか（`themes_selftest.mjs` に足さなかった理由）
 *
 * あちらが見ているのは**表そのもの**（id の形・href の行き先・束ねかた）で、
 * 読むのは `content/themes.ts` 1本だけ。こちらが見るのは
 * **面が決め打ちしている宛先**なので、`site/app` と `site/components` の
 * tsx を歩いて `<Notes theme=…>` を集める。読む相手が違うし、
 * 壊れたときに名指しされるファイルも違う（あちらは表、こちらは面）。
 * 1本に混ぜると、落ちたときに「表が壊れたのか、面が壊れたのか」が
 * 終了コードから分からなくなる。
 *
 * ## 何が静かに壊れるのか
 *
 * | 壊れ方 | 画面で起きること | 赤くなるか |
 * | --- | --- | --- |
 * | 決め打ちの宛先が表に無い | `fixed` が undefined になり、国の面に**掲示板の宛先選びが丸ごと出る** | ならない |
 * | 決め打ちの宛先が畳んである | **書く窓が残る。** 貼れて 200 で入るが、入った先は畳みの中 | ならない |
 * | 宛先を足したのに面に欄が無い | 掲示板の棚から押して来た人が、**書く欄の無い面**に着く | ならない |
 * | `href` の `#` が面に無い | その欄まで送られず、面の頭に落ちる | ならない |
 *
 * 2026-10-11 に実際に出ていたのは2つめ。`isOpenTheme`（畳みの判定）を
 * 見ていたのは掲示板の選び札だけで、**面が決め打ちしている側
 * （`Notes.tsx` の `fixed`）は1度も見ていなかった。** 型も巡回も通る——
 * サーバーは宛先の表を持っていないので、締め切った宛先の付箋も 200 で受ける。
 *
 * ## 見ているもの
 *
 *  1. **決め打ちの宛先が、`THEMES` に実在する**（面を歩いて集める）
 *  2. **畳んだ宛先を決め打ちしている面では、書く段が出ない。**
 *     判定（`shutDest`）を数で当てて、**窓・開く札・空札の誘いの3つが
 *     その判定の下にあること**を `Notes.tsx` の中で見る。
 *     **読む側（付箋・枚数・ハート）は、その判定の下に入っていない**ことも見る
 *  3. **グッズの束の宛先は、`app/goods/` の下のどれかの面が決め打ちしていて
 *     （2つの面が同じ宛先を持たず）、`#` の先の欄が実在する**
 *
 * ## 決め打ちの式を、名簿で持たない
 *
 * `theme={c.slug}` のような式は、字から値が決まらない。**式ごとに
 * 「どこから値が来るか」を1つだけ書いて、値そのものは中身の表から取る**
 * （`content/nordic/index.json` の国、`content/plans.ts` の企画、
 * `THEMES` の区間）。**知らない式が1つ出たら落ちる**ので、
 * 新しい渡しかたを書いた日にここが赤くなる（名簿なら黙る）。
 *
 * 式のうち、ほんとうに「表に無い宛先」になりうるのは
 * **`{c.slug}` と字で書いた分だけ。** 区間と企画は `themeById()` を
 * 通してから渡しているので、無い宛先はそこで落ちて欄ごと出ない。
 *
 * ## わざと壊して、赤くなることを見る
 *
 * 足は4本（宛先の実在・窓の守り・錨・畳みの判定）。`--hint` で出る。
 * **先に「壊していない写しが通ること」を見る**（`docs/island-misses.md` #99）。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, "..");
const LIB = join(SITE, "lib");
const CONTENT = join(SITE, "content");
const APP = join(SITE, "app");
const COMPONENTS = join(SITE, "components");

/** 組み立てる表。**落ちることを確かめる写しだけ、ここを差し替える。** */
const THEMES_SRC = process.env.THEMES_TS || join(CONTENT, "themes.ts");
/**
 * 面の写しの置き場。**在るものだけ、こちらから読む。**
 *
 * `site` を丸ごと写すと node_modules まで付いてくるので、
 * 壊した1枚だけを同じ道（`app/goods/page.tsx`）で置く。
 */
const SRC_OVER = process.env.NOTEDEST_SRC || "";

const BREAK_HINT = `わざと壊して、ここが落ちることを見るには（足は4本）:

  # 0) まず、壊していない写しが通ることを見る
  mkdir -p /tmp/nd0/app/goods
  cp site/app/goods/page.tsx /tmp/nd0/app/goods/page.tsx
  NOTEDEST_SRC=/tmp/nd0 node site/selftest/notedest_selftest.mjs   # → 0

  # 1) 表に無い宛先を決め打ちする（国の面に掲示板の宛先選びが出る）
  mkdir -p /tmp/nd1/app/goods
  sed 's|theme="goods-suzuri"|theme="goods-suzuri-x"|' \\
    site/app/goods/page.tsx > /tmp/nd1/app/goods/page.tsx
  NOTEDEST_SRC=/tmp/nd1 node site/selftest/notedest_selftest.mjs   # → 1

  # 2) 畳んだ宛先に窓を残す（守りを1本抜く）
  mkdir -p /tmp/nd2/components/live
  sed 's|{!bin \\&\\& !shut \\&\\& open \\&\\& (|{!bin \\&\\& open \\&\\& (|' \\
    site/components/live/Notes.tsx > /tmp/nd2/components/live/Notes.tsx
  NOTEDEST_SRC=/tmp/nd2 node site/selftest/notedest_selftest.mjs   # → 1

  # 3) \`#\` の先の欄を消す（押した人が面の頭に落ちる）
  mkdir -p /tmp/nd3/app/goods
  sed 's|id="suzuri"|id="suzurii"|' \\
    site/app/goods/page.tsx > /tmp/nd3/app/goods/page.tsx
  NOTEDEST_SRC=/tmp/nd3 node site/selftest/notedest_selftest.mjs   # → 1

  # 4) 畳みの判定そのものを殺す（どの宛先も締め切られていないことになる）
  sed 's|^  !!fixed && !isOpenTheme(fixed, now);$|  false;|' \\
    site/content/themes.ts > /tmp/themes-shut.ts
  THEMES_TS=/tmp/themes-shut.ts node site/selftest/notedest_selftest.mjs   # → 2

  # 5) 締め切った企画へ降ろす札を戻す（押しても何も起きない札）
  mkdir -p /tmp/nd5/components/live
  sed 's|canNote|!!themeById(plan.id)|g' \
    site/components/live/PlanCard.tsx > /tmp/nd5/components/live/PlanCard.tsx
  NOTEDEST_SRC=/tmp/nd5 node site/selftest/notedest_selftest.mjs   # → 1

  （4) だけ 2 で落ちる。判定が死ぬと「畳んだ宛先を決め打ちしている面」が
  0件になるので、**守りを測る相手そのものが消える**——数字を出さずに止める
  のが正しい（\`docs/island-standards.md\` 15章）。食い違いの件数は先に出る。`;

if (process.argv.includes("--hint")) {
  console.log(BREAK_HINT);
  process.exit(0);
}

let BAD = 0;
let OK = 0;
function check(name, good, why = "") {
  if (good) {
    OK++;
    console.log(`  ok   ${name}`);
    return;
  }
  BAD++;
  console.log(`  NG   ${name}${why ? ` — ${why}` : ""}`);
}

/** 数えるものが無いまま通らない（`docs/island-standards.md` 15章）。 */
function nothing(why) {
  console.log(`\n数えるものが無い: ${why}`);
  process.exit(2);
}

/* ------------------------------------------------------------------ 組み立て
   `@/lib/…` `@/content/…` は tsc が道に直してくれないので、隣に並べてから
   組み立てる（`themes_selftest.mjs` と同じやり方）。 */
const WORK = mkdtempSync(join(tmpdir(), "notedest-src-"));
const OUT = mkdtempSync(join(tmpdir(), "notedest-out-"));

function bring(src, name) {
  const code = readFileSync(src, "utf8")
    .replace(/@\/lib\//g, "./")
    .replace(/@\/content\//g, "./");
  writeFileSync(join(WORK, name), code);
}

bring(join(LIB, "builtAt.ts"), "builtAt.ts");
bring(join(CONTENT, "chapters.ts"), "chapters.ts");
bring(join(LIB, "nightly.ts"), "nightly.ts");
bring(join(CONTENT, "plans.ts"), "plans.ts");
bring(THEMES_SRC, "themes.ts");

execFileSync(
  join(SITE, "node_modules", ".bin", "tsc"),
  [
    join(WORK, "themes.ts"),
    "--outDir",
    OUT,
    "--module",
    "commonjs",
    "--target",
    "es2022",
    "--strict",
    "--skipLibCheck",
    "--typeRoots",
    join(SITE, "node_modules", "@types"),
    "--types",
    "node",
  ],
  { stdio: "inherit" },
);

const req = createRequire(import.meta.url);
const T = req(join(OUT, "themes.js"));
const P = req(join(OUT, "plans.js"));
const { THEMES, GOODS_GROUP, isOpenTheme, shutDest, shelves, themeById } = T;

if (!Array.isArray(THEMES) || THEMES.length === 0) nothing("`THEMES` が読めない");
if (typeof shutDest !== "function") {
  nothing("`content/themes.ts` に `shutDest` が無い（畳みの判定が面に届いていない）");
}
if (typeof isOpenTheme !== "function" || typeof shelves !== "function") {
  nothing("`content/themes.ts` の関数が読めない");
}
if (!GOODS_GROUP) nothing("`GOODS_GROUP`（グッズの束の見出し）が読めない");
if (!Array.isArray(P.PLANS) || P.PLANS.length === 0) nothing("`content/plans.ts` の企画が読めない");

const THEME_IDS = new Set(THEMES.map((t) => t.id));
const PLAN_IDS = new Set(P.PLANS.map((p) => p.id));

console.log(`# 組み立てた表: ${THEMES_SRC}${SRC_OVER ? `\n# 面の写し: ${SRC_OVER}` : ""}`);
console.log(`# 宛先 ${THEMES.length}件 / 企画 ${PLAN_IDS.size}件`);

/* ---------------------------------------------------------- 面を読む道具 */

/** `site` からの相対の道で読む。写しが置いてあればそちらから */
function readSrc(rel) {
  const over = SRC_OVER ? join(SRC_OVER, rel) : "";
  return readFileSync(over && existsSync(over) ? over : join(SITE, rel), "utf8");
}

/** `site/app` と `site/components` の tsx を全部歩く */
function tsxFiles(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (n === "node_modules") continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) tsxFiles(p, out);
    else if (n.endsWith(".tsx")) out.push(relative(SITE, p).split(sep).join("/"));
  }
  return out;
}
const FILES = [...tsxFiles(APP), ...tsxFiles(COMPONENTS)];
if (FILES.length < 50) nothing(`tsx を数えられなかった（${FILES.length}件）`);

/** 面の道（`href` の行き先が実在するかを見るのに使う） */
function routes(dir, path = "", out = []) {
  for (const n of readdirSync(dir)) {
    if (n === "node_modules") continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) {
      if (n.startsWith("_") || n.startsWith("@")) continue;
      routes(p, /^\(.*\)$/.test(n) ? path : `${path}/${n}`, out);
    } else if (/^page\.(tsx|ts|jsx)$/.test(n)) {
      out.push({ path: path === "" ? "/" : path, file: relative(SITE, p).split(sep).join("/") });
    }
  }
  return out;
}
const ROUTES = routes(APP);

/**
 * `<Notes …>` の開き札を1つ読む。**行をまたぐ。**
 *
 * 入れ子の `{}` と、字の中の `>` を数える。素の正規表現だと
 * `theme={cond ? "a" : "b"}` のような渡しかたで切り場所を間違える。
 */
function openTag(src, from) {
  let i = from;
  let depth = 0;
  let quote = "";
  while (i < src.length) {
    const c = src[i];
    if (quote) {
      if (c === quote && src[i - 1] !== "\\") quote = "";
    } else if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return src.slice(from, i);
    i++;
  }
  return null;
}

/** 開き札から `theme` の渡しかたを取る。無ければ null */
function themeAttr(tag) {
  const lit = tag.match(/\btheme=(?:"([^"]*)"|\{"([^"]*)"\})/);
  if (lit) return { kind: "lit", id: lit[1] ?? lit[2] };
  const ex = tag.match(/\btheme=\{([^}]*)\}/);
  if (ex) return { kind: "expr", src: ex[1].trim() };
  return null;
}

/* ------------------------------------- 決め打ちしている面を集める（その1） */

/**
 * 式から値が決まらないものの出どころ。**値は中身の表から取る。**
 *
 * 鍵は「ファイルの道::式のまま」。**ここに無い式が1つ出たら落ちる**ので、
 * 新しい渡しかたを書いた日にここが赤くなる。
 */
const FROM = {
  /* グッズの面は、欄ごとの小さな部品（`Say`）に字で渡して、そこから
     `Notes` へ送っている。**値はこの面の中の字**（同じファイルの
     `theme="…"` を全部拾う）。 */
  "app/goods/page.tsx::theme": (rel) => literalsIn(rel),
  /* 区間あて。`themeById(\`leg-\${l.id}\`)` を通してから渡すので、
     出うるのは `leg-` 始まりの宛先だけ */
  "app/nordic/day/[n]/page.tsx::t.id": () => [...THEME_IDS].filter((id) => id.startsWith("leg-")),
  /* 国あて。**ここだけ `themeById()` を通さない**（国の slug をそのまま
     宛先にしている）。国を1つ足して宛先を足し忘れた日に、上の
     「実在する」が赤くなるのはこの足 */
  "app/nordic/[country]/page.tsx::c.slug": () => nordicSlugs(),
  /* 企画あて。`themeById(plan.id)` を通すので、宛先の在る企画だけ */
  "components/live/NextPlans.tsx::theme.id": () =>
    [...PLAN_IDS].filter((id) => THEME_IDS.has(id)),
};

/** そのファイルの中の `theme="…"` を全部（小さな部品へ字で渡しているぶん） */
function literalsIn(rel) {
  const src = readSrc(rel);
  return [...src.matchAll(/\btheme=(?:"([^"]*)"|\{"([^"]*)"\})/g)].map((m) => m[1] ?? m[2]);
}

/** 北欧の国の slug。**焼いた中身から取る**（手で並べない） */
function nordicSlugs() {
  const j = JSON.parse(readFileSync(join(CONTENT, "nordic", "index.json"), "utf8"));
  return (j.countries ?? []).map((c) => c.slug).filter(Boolean);
}

/** 面ごとの、決め打ちしている宛先 */
const PINNED = new Map();
/** 知らない式（落ちる） */
const UNKNOWN = [];
/** 決め打ちしている札の数（分母） */
let TAGS = 0;

for (const rel of FILES) {
  const src = readSrc(rel);
  /* その面が `Notes` を何という名前で呼んでいるか。**`StickyNotes` のような
     付け替えも拾う**（`app/north-macedonia/page.tsx` が実際にそう呼んでいる）。 */
  const names = [
    ...src.matchAll(/import\s+(\w+)[^;]*?from\s+"(?:@\/components\/live\/Notes|\.\/Notes|\.\.\/live\/Notes)"/g),
  ].map((m) => m[1]);
  if (names.length === 0) continue;
  for (const name of names) {
    const re = new RegExp(`<${name}(?=[\\s/>])`, "g");
    for (const m of re.exec ? [...src.matchAll(re)] : []) {
      const tag = openTag(src, m.index);
      if (tag === null) nothing(`${rel} の \`<${name}>\` の開き札を読めなかった`);
      const got = themeAttr(tag);
      // 宛先を渡していない札は、選ばせる面（掲示板）。ここでは数えない
      if (!got) continue;
      TAGS++;
      const ids =
        got.kind === "lit" ?
          [got.id] :
          FROM[`${rel}::${got.src}`] ?
            FROM[`${rel}::${got.src}`](rel) :
            (UNKNOWN.push(`${rel}: theme={${got.src}}`), null);
      if (!ids) continue;
      const cur = PINNED.get(rel) ?? new Set();
      for (const id of ids) cur.add(id);
      PINNED.set(rel, cur);
    }
  }
}

if (TAGS === 0) nothing("`<Notes theme=…>` が1つも見つからなかった");
check(
  `決め打ちの渡しかたが、全部たどれる（札 ${TAGS}枚 / ${PINNED.size}ファイル）`,
  UNKNOWN.length === 0,
  `出どころの分からない式: ${UNKNOWN.join(" / ")}`,
);

/* ----------------------------------------- 1. 決め打ちの宛先が実在するか */

const missing = [];
for (const [rel, ids] of PINNED) {
  for (const id of ids) if (!THEME_IDS.has(id)) missing.push(`${rel}→${id}`);
}
const pinnedIds = new Set([...PINNED.values()].flatMap((s) => [...s]));
if (pinnedIds.size === 0) nothing("決め打ちされている宛先が1つも無い");
console.log(`# 決め打ちされている宛先 ${pinnedIds.size}件`);
check(
  `決め打ちの宛先が、全部 \`THEMES\` に在る（${pinnedIds.size}件）`,
  missing.length === 0,
  missing.join(" "),
);

/* --------------------------- 2. 畳んだ宛先を決め打ちしている面の書く段 */

/** 日本時間の正午。日をまたぐ境目で数えないため */
const noon = (y, m, d) => new Date(Date.UTC(y, m - 1, d, 3, 0, 0));
const TODAY = new Date();
const DAYS = [null, TODAY, noon(2026, 9, 1), noon(2026, 10, 20), noon(2027, 3, 1)];

/* 判定そのものを数で当てる。**`isOpenTheme` の裏返しであること**と、
   **選ばせる面（`undefined`）では立たないこと**の両方。 */
let flip = 0;
let wrong = 0;
for (const d of DAYS) {
  for (const t of THEMES) {
    if (shutDest(t, d) !== !isOpenTheme(t, d)) wrong++;
    else flip++;
  }
  if (shutDest(undefined, d) !== false) wrong++;
}
check(`\`shutDest\` が畳みの判定の裏返しになっている（${flip}通り当てた）`, wrong === 0, `食い違い ${wrong}件`);

/** いま締め切られている宛先のうち、面が決め打ちしているもの */
const shutPinned = [];
for (const [rel, ids] of PINNED) {
  for (const id of ids) {
    const t = themeById(id);
    if (t && shutDest(t, TODAY)) shutPinned.push(`${rel}→${id}`);
  }
}
if (shutPinned.length === 0) {
  nothing("畳んだ宛先を決め打ちしている面が1つも無い（守りを測れない）");
}
console.log(`# 畳んだ宛先を決め打ちしている面 ${new Set(shutPinned.map((x) => x.split("→")[0])).size}ファイル / ${shutPinned.length}か所`);
for (const x of shutPinned) console.log(`#   ${x}`);

/**
 * 書く段が、畳みの判定の下にあるか。
 *
 * **印から後ろへ `{}` を数えて、その印を包んでいる JSX の `{` を探す。**
 * そこから最初の `(` までが、その段を出すか決めている条件。
 * 字の並びで当てないのは、書き方を変えた日に黙って通るのを避けるため。
 */
const NOTES_REL = "components/live/Notes.tsx";
const NOTES = readSrc(NOTES_REL);

function guardOf(src, marker) {
  const at = src.indexOf(marker);
  return at < 0 ? null : guardAt(src, at);
}

/** 位置から、その印を包んでいる JSX の `{` を探して、条件のところを返す */
function guardAt(src, at) {
  let depth = 0;
  for (let i = at; i >= 0; i--) {
    const c = src[i];
    if (c === "}") depth++;
    else if (c === "{") {
      if (depth === 0) {
        const open = src.indexOf("(", i);
        return src.slice(i, open < 0 ? i + 1 : open);
      }
      depth--;
    }
  }
  return null;
}

/* 書く段。**3つとも**判定の下に居ること（1つでも外れたら、そこから書ける） */
for (const [what, marker] of [
  ["書く窓", 'className="nt-write"'],
  ["開く札", 'className="nt-open"'],
  ["空札の誘い", 'className="blank-go"'],
]) {
  const g = guardOf(NOTES, marker);
  check(
    `${what}（${marker}）が、畳みの判定の下にある`,
    !!g && /!shut\b/.test(g),
    g === null ? "印が見つからない" : `条件=${g.replace(/\s+/g, " ").trim()}`,
  );
  /* 印が1つだけであること。2つ目を足した日に、守りの無いほうができる */
  const n = NOTES.split(marker).length - 1;
  check(`${what}の印が1か所だけ（${n}か所）`, n === 1);
}

/* 締め切りの1行。**黙って消さない**ので、判定の下に字が1つ出ること */
const sayGuard = guardOf(NOTES, 'className="nt-shut"');
check(
  "締め切りの1行が、判定の立ったときだけ出る",
  !!sayGuard && /\bshut\b/.test(sayGuard) && !/!shut\b/.test(sayGuard),
  sayGuard === null ? "`nt-shut` が無い" : `条件=${sayGuard.replace(/\s+/g, " ").trim()}`,
);
check(
  "締め切りの1行に、行き先が1つ添えてある",
  /className="nt-shut-go"/.test(NOTES),
  "`nt-shut-go`（いま書けるところへ）が無い",
);

/* **読む側は、判定の下に入っていない。** 畳んだのは貼ることだけ。
   付箋の一覧とハートが `!shut` に入ると、読めなくなる（#5 の横展開）。
   ハートはサーバーが締め切りを知らないので断らない
   （`functions/src/islandApi.ts` の `POST /stickies/:id/heart` は
   しまった・隠した付箋だけ断る）。押せて消えないものは、押せてよい。 */
for (const [what, marker] of [
  ["ハート", 'className={`nt-heart'],
  ["付箋の一覧", 'className="nx-notes"'],
]) {
  const g = guardOf(NOTES, marker);
  check(
    `${what}（${marker}）は、畳みの判定の下に入っていない`,
    !!g && !/\bshut\b/.test(g),
    g === null ? "印が見つからない" : `条件=${g.replace(/\s+/g, " ").trim()}`,
  );
}

/* **締め切った宛先へ降ろす札を残さない。** 企画の札（`PlanCard.tsx`）には
   「付箋を貼る」「付箋で教える」の2つがあって、どちらも付箋の欄の錨へ降ろす。
   欄が消えたのに札が残ると、**押しても何も起きない札**になる
   （決まりは `PlanCard.tsx` の `useCanNote` に書いてある）。 */
const PLANCARD = readSrc("components/live/PlanCard.tsx");
const JUMP = "-notes`}";
const jumpAt = [];
for (let i = PLANCARD.indexOf(JUMP); i >= 0; i = PLANCARD.indexOf(JUMP, i + 1)) jumpAt.push(i);
check("企画から付箋へ降ろす札が在る（分母）", jumpAt.length >= 2, `${jumpAt.length}本`);
jumpAt.forEach((at, i) => {
  /* 印そのものは `href={`…`}` の中にいるので、**その札（`<a`）の頭から**
     さかのぼる。印から直に数えると、`href={` の `{` で止まる */
  const cond = (guardAt(PLANCARD, PLANCARD.lastIndexOf("<a", at)) ?? "").replace(/\s+/g, " ").trim();
  check(
    `企画から付箋へ降ろす札 ${i + 1}本目が、締め切りの判定の下にある`,
    /canNote\b/.test(cond),
    `条件=${cond}`,
  );
});
check(
  "企画の札が、宛先の在る無しだけで判定していない（`hasNotes` が残っていない）",
  !/\bhasNotes\b/.test(PLANCARD),
);

/* --------------------------------- 3. 新しい宛先（グッズの束）と `#` の先 */

const goods = THEMES.filter((t) => t.group === GOODS_GROUP);
if (goods.length === 0) nothing(`\`${GOODS_GROUP}\` の宛先が1つも無い`);
console.log(`# ${GOODS_GROUP}の宛先 ${goods.length}件: ${goods.map((t) => t.id).join(" ")}`);

const suzuri = themeById("goods-suzuri");
check("`goods-suzuri`（スズリのグッズ）が表に在る", !!suzuri);
if (suzuri) {
  check(`\`goods-suzuri\` がグッズの束に入っている（${suzuri.group}）`, suzuri.group === GOODS_GROUP);
  check(
    `\`goods-suzuri\` の行き先が \`/goods#suzuri\`（${suzuri.href ?? "なし"}）`,
    suzuri.href === "/goods#suzuri",
  );
}

/* **束ねたときも、グッズの束に居ること**（日をずらして当てる） */
for (const d of DAYS) {
  const label = d ? d.toISOString().slice(0, 10) : "焼いた日";
  const shelf = shelves(THEMES, d).find((s) => s.group === GOODS_GROUP);
  check(
    `${label}：グッズの束に ${goods.length}件そろう`,
    !!shelf && shelf.themes.length === goods.length,
    `束=${shelf ? shelf.themes.length : "なし"}件`,
  );
}

/* グッズの宛先は、**グッズの面のどれか**が決め打ちしていること。
   **表に1行足して面に欄を出し忘れる**のがここで赤くなる。

   2026-10-13 まで、ここは `app/goods/page.tsx` 1枚だけを見ていた。
   ステッカーが自分の面（`/goods/stickers`）へ出て、`goods-art` の窓も
   そちらへ移った日に、**正しい実装のほうが落ちた。**
   見たいのは「窓がどこかに在るか」であって、1枚の面の名前ではないので、
   `app/goods/` の下の面をまとめて数える。**下に面を足しても、
   そこへ宛先を移しても、この足は鳴り続ける。**

   **見るのは、いま書ける宛先だけ**（2026-10-14）。カレンダー（`goods-calendar`）は
   出品して欄ごと消し、宛先も畳んだ（あやと「カレンダー検討中の項目は削除して、
   付箋も閉じて」）。畳んだ宛先は書けないので、棚から押して来た人が
   「書く欄の無い面」に着いて困ることが無い。**貼られた付箋は掲示板の
   畳んだ棚から読める**（`Notes.tsx` の `closedThemes`。北欧の国の宛先と同じ）。
   畳んだ宛先を面に置いておくのは構わない（LINEスタンプがそう）——
   置かないことも許す、というだけで、書ける宛先の足は前と同じに鳴る。 */
const GOODS_PAGES = [...PINNED.keys()].filter((rel) => rel.startsWith("app/goods/"));
if (GOODS_PAGES.length === 0) nothing("`app/goods/` の下に、宛先を決め打ちしている面が1つも無い");
const onGoods = new Set(GOODS_PAGES.flatMap((rel) => [...PINNED.get(rel)]));
const openGoods = goods.filter((t) => isOpenTheme(t, new Date()));
const notOnGoods = openGoods.filter((t) => !onGoods.has(t.id));
check(
  `グッズの書ける宛先が全部 \`/goods\` の面に出ている（${openGoods.length}件 / 畳んだ ${goods.length - openGoods.length}件は見ない / 面 ${GOODS_PAGES.length}枚: ${GOODS_PAGES.join(" ")}）`,
  openGoods.length > 0 && notOnGoods.length === 0,
  notOnGoods.map((t) => t.id).join(" ") || (openGoods.length === 0 ? "書ける宛先が0件" : ""),
);

/* **同じ宛先の窓を、2つの面に置かない。** 書いた人が、どちらに貼ったかを
   追えなくなる（宛先は同じなので、付箋は1か所に溜まるのに、読む窓が2つある）。
   2026-10-13 に `goods-art` を移したとき、`/goods` の側から外し忘れると
   ここが赤くなる。 */
const twice = goods
  .map((t) => [t.id, GOODS_PAGES.filter((rel) => PINNED.get(rel).has(t.id))])
  .filter(([, where]) => where.length > 1);
check(
  "同じ宛先の窓が、2つの面に出ていない",
  twice.length === 0,
  twice.map(([id, where]) => `${id}（${where.join(" / ")}）`).join(" "),
);

/**
 * `href` の `#` の先の欄が、その面に在るか。
 *
 * 字で書いた錨（`id="suzuri"`）は面の中から引ける。
 * **企画の錨は `id={plan.id}` なので字では引けない**ので、
 * 企画の id と同じものは別に数えて、そちらは通す
 * （`components/live/PlanCard.tsx` が錨を立てている）。
 */
const frags = THEMES.filter((t) => t.href?.includes("#"));
if (frags.length === 0) nothing("`#` 付きの行き先が1つも無い");
const deadFrag = [];
let byPlan = 0;
for (const t of frags) {
  const [path, frag] = t.href.split("#");
  const route = ROUTES.find((r) => r.path === (path || "/"));
  if (!route) {
    deadFrag.push(`${t.id}→${t.href}（面が無い）`);
    continue;
  }
  if (readSrc(route.file).includes(`id="${frag}"`)) continue;
  if (PLAN_IDS.has(frag)) {
    byPlan++;
    continue;
  }
  deadFrag.push(`${t.id}→${t.href}`);
}
check(
  `\`#\` の先の欄が実在する（${frags.length}件中 ${byPlan}件は企画の錨）`,
  deadFrag.length === 0,
  deadFrag.join(" "),
);

console.log(`\n${OK + BAD}件中 ${OK}件通った`);
if (BAD) {
  console.log(`\n${BREAK_HINT}`);
  process.exit(1);
}
