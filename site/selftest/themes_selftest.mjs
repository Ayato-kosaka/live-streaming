/**
 * **付箋の宛先の表（`site/content/themes.ts`）が、静かに壊れていないか。**
 *
 *     node site/selftest/themes_selftest.mjs
 *     # 0=通った / 1=壊れていた / 2=数えるものが無い
 *
 * ## なぜ要るのか
 *
 * 宛先の表は、**壊れても赤くならない。** 壊れ方が4つとも「画面が静かに
 * 変わるだけ」なので、型も巡回も通る:
 *
 * | 壊し方 | 画面で起きること |
 * | --- | --- |
 * | `id` がかぶる | 貼った付箋が**別の宛先の棚に混ざる**（`islandNotes.theme` は id そのもの） |
 * | `href` の先に面が無い | 押した人が、受け皿の返す別の面に落ちる |
 * | 書ける宛先が0になる | 「どこへ」の札が**1枚も出ない**。書く欄だけが残る |
 * | 見出しが並びの表に無い | その束が、こちらの決めた場所ではないところへ回る |
 *
 * どれも**付箋が消えたように見える**か、**押せる先が1つ減る**だけで、
 * 例外も 404 も出ない。だから機械で数える（`docs/island-standards.md` 15章）。
 *
 * ## 見ているもの
 *
 *  1. **`id` が重複していない**・形が `[a-z][a-z0-9-]{1,39}`
 *     （サーバー側の `THEME_ID` と同じ。`functions/src/islandApi.ts`）
 *  2. **`href` を書いた宛先の行き先が実在する**（`site/app` の下に面が在る）。
 *     裏も見る——**面が在るのに `href` が無い宛先は無い。**
 *     アルバニアに `href` が無いのは `/albania` という面が無いからで、
 *     その決まりが守られていることを機械で見る（面を作った日に赤くなる）
 *  3. **書ける宛先（`openThemes`）が1つ以上あり**、どれも `group` を持っている
 *  4. **束ねたあと、どの宛先も必ずどれかの見出しに入る。**
 *     出てきうる見出しが全部 `ORDER`（`GROUP_ORDER`）に並んでいて、
 *     束ねる前と後で宛先の数が変わらない
 *
 * ## わざと壊して、赤くなることを見る
 *
 * 4つの足を1本ずつ抜く（`docs/island-misses.md` #128 の決めごと1）。
 * **先に「壊していない写しが通ること」を見る**——写しを作る途中で壊れても
 * 終了コードは同じなので、そこを見ないと対照にならない（同 #99）。
 *
 * ```bash
 * cp site/content/themes.ts /tmp/themes-ok.ts
 * THEMES_TS=/tmp/themes-ok.ts node site/selftest/themes_selftest.mjs   # → 0
 * ```
 *
 * 壊し方は `--hint` で出る。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, "..");
const LIB = join(SITE, "lib");
const CONTENT = join(SITE, "content");
const APP = join(SITE, "app");

/** 組み立てる本体。**落ちることを確かめる写しだけ、ここを差し替える。** */
const THEMES_SRC = process.env.THEMES_TS || join(CONTENT, "themes.ts");

const BREAK_HINT = `わざと壊して、ここが落ちることを見るには（4つの足を1本ずつ）:

  # 0) まず、壊していない写しが通ることを見る
  cp site/content/themes.ts /tmp/themes-ok.ts
  THEMES_TS=/tmp/themes-ok.ts node site/selftest/themes_selftest.mjs   # → 0

  # 1) id をかぶらせる（貼った付箋が別の棚に混ざる）
  sed 's|    id: "island",|    id: "hello",|' \\
    site/content/themes.ts > /tmp/themes-dup.ts
  THEMES_TS=/tmp/themes-dup.ts node site/selftest/themes_selftest.mjs   # → 1

  # 2) 行き先の面が無い href を書く
  sed 's|href: "/goods#suzuri"|href: "/goodz#suzuri"|' \\
    site/content/themes.ts > /tmp/themes-href.ts
  THEMES_TS=/tmp/themes-href.ts node site/selftest/themes_selftest.mjs   # → 1

  # 3) 書ける宛先の group を空にする（束ねる先が無い札になる）
  sed 's|    group: GOODS_GROUP,|    group: "",|' \\
    site/content/themes.ts > /tmp/themes-nogroup.ts
  THEMES_TS=/tmp/themes-nogroup.ts node site/selftest/themes_selftest.mjs   # → 1

  # 4) 並びの表から見出しを1つ落とす（札が、決めた場所ではないところへ回る）
  sed 's|^  GOODS_GROUP,$||' \\
    site/content/themes.ts > /tmp/themes-order.ts
  THEMES_TS=/tmp/themes-order.ts node site/selftest/themes_selftest.mjs   # → 1

  # 5) 面が在るのに href を外す（押せる先を1つ捨てている）
  sed 's|^    href: "/island/nordic",$||' \\
    site/content/themes.ts > /tmp/themes-nohref.ts
  THEMES_TS=/tmp/themes-nohref.ts node site/selftest/themes_selftest.mjs   # → 1`;

if (process.argv.includes("--hint")) {
  console.log(BREAK_HINT);
  process.exit(0);
}

/* ------------------------------------------------------------------ 組み立て
   `@/lib/…` `@/content/…` は tsc が道に直してくれないので、隣に並べてから
   組み立てる（`leadplan_selftest.mjs` と同じやり方）。
   **宛先の表以外は写しを置かない**——置くと、本体を直したのに確かめが通る。 */
const WORK = mkdtempSync(join(tmpdir(), "themes-src-"));
const OUT = mkdtempSync(join(tmpdir(), "themes-out-"));

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
/* 企画の表。`plans.ts` は告知の欄を持つ企画をここから札に組む */
bring(join(CONTENT, "projects.ts"), "projects.ts");
bring(THEMES_SRC, "themes.ts");
/* 国の表（出た日を導く。6章）。**字で読まない**——組み立てた表を読む（`tools/sprites/tsread_selftest.mjs`） */
bring(join(CONTENT, "countries.ts"), "countries.ts");
/* 滞在の表（国の表と章が引く。#1275）。案内の面の絵の名前（`IconName`）は部品の側の型なので、
   ここでは字で受ける——確かめるのは宛先で、絵の名前ではない */
bring(join(CONTENT, "stays.ts"), "stays.ts");
/* 滞在の表が読む2枚（街の名簿と種類の表。どちらも何も読まない。#1357） */
bring(join(CONTENT, "cities.ts"), "cities.ts");
bring(join(CONTENT, "kinds.ts"), "kinds.ts");
writeFileSync(
  join(WORK, "stays.ts"),
  readFileSync(join(WORK, "stays.ts"), "utf8").replace(
    /^import type \{ IconName \} from "@\/components\/ui\/icons";$/m,
    "type IconName = string;",
  ),
);

execFileSync(
  join(SITE, "node_modules", ".bin", "tsc"),
  [
    join(WORK, "themes.ts"),
    join(WORK, "countries.ts"),
    "--outDir",
    OUT,
    "--module",
    "commonjs",
    "--target",
    "es2022",
    "--strict",
    "--skipLibCheck",
    /* `lib/builtAt.ts` が `process.env` を読む。型は **`site` のものを使う**
       （組み立て先は /tmp なので、そこから上に登っても見つからない） */
    "--typeRoots",
    join(SITE, "node_modules", "@types"),
    "--types",
    "node",
  ],
  { stdio: "inherit" },
);

const req = createRequire(import.meta.url);
const T = req(join(OUT, "themes.js"));
const { THEMES, GROUP_ORDER, openThemes, shelves, writeShelves, isOpenTheme } = T;

console.log(`# 組み立てた表: ${THEMES_SRC}`);

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

if (!Array.isArray(THEMES) || THEMES.length === 0) nothing("`THEMES` が読めない");
if (!Array.isArray(GROUP_ORDER) || GROUP_ORDER.length === 0) {
  nothing("`GROUP_ORDER`（並びの表）が読めない");
}
for (const f of [openThemes, shelves, writeShelves, isOpenTheme]) {
  if (typeof f !== "function") nothing("`themes.ts` の関数が読めない");
}

/** 日本時間の正午。日をまたぐ境目で数えないため */
const noon = (y, m, d) => new Date(Date.UTC(y, m - 1, d, 3, 0, 0));
const TODAY = new Date();

console.log(`# 宛先 ${THEMES.length}件 / 見出しの並び ${GROUP_ORDER.length}件`);

/* ============================================================== 1. id の形 */

const ids = THEMES.map((t) => t.id);
const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
check(`id が重複していない（${ids.length}件）`, dup.length === 0, `かぶり=${[...new Set(dup)].join(" ")}`);

/** サーバー側の `THEME_ID`（`functions/src/islandApi.ts`）と同じ形 */
const SHAPE = /^[a-z][a-z0-9-]{1,39}$/;
const badShape = THEMES.filter((t) => !SHAPE.test(t.id));
check(
  "id の形が、サーバーの受ける形（`[a-z][a-z0-9-]{1,39}`）に合っている",
  badShape.length === 0,
  badShape.map((t) => t.id).join(" "),
);

/* 札に出る字が空だと、押せるのに何も書いていない丸が並ぶ */
const emptyText = THEMES.filter((t) => !t.name?.trim() || !t.lead?.trim() || !t.placeholder?.trim());
check(
  "どの宛先も、名前・一行・見本の字を持っている",
  emptyText.length === 0,
  emptyText.map((t) => t.id).join(" "),
);

/* ======================================================= 2. href の行き先 */

/**
 * `site/app` を歩いて、面の道を集める。
 *
 * **書き出しを見ない。** この見張りはビルドなしで回る（`selftest_runner.py`）。
 * 動く段（`[country]` `[n]`）はどの字にも当たるものとして持つ。
 */
function routes(dir, path = "", out = []) {
  for (const n of readdirSync(dir)) {
    if (n === "node_modules") continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) {
      /* 束ね（`(group)`）は道に出ない。`_` 始まりは Next が面にしない */
      if (n.startsWith("_") || n.startsWith("@")) continue;
      routes(p, /^\(.*\)$/.test(n) ? path : `${path}/${n}`, out);
    } else if (n === "page.tsx" || n === "page.ts" || n === "page.jsx") {
      out.push(path === "" ? "/" : path);
    }
  }
  return out;
}
const ROUTES = routes(APP);
if (ROUTES.length < 20) nothing(`\`site/app\` の面を数えられなかった（${ROUTES.length}件）`);
console.log(`# \`site/app\` の面 ${ROUTES.length}件`);

/** `/public/*.html` のような、Next の外の面も行き先になりうる */
const PUBLIC = join(SITE, "public");

/** 動く段を当てはめて、その道の面が在るか */
function hasPage(href) {
  // `#` と `?` を落とす。欄まで送るだけなので、面は `#` の前で決まる
  const path = href.replace(/[#?].*$/, "") || "/";
  if (ROUTES.includes(path)) return true;
  const want = path.split("/").filter(Boolean);
  for (const r of ROUTES) {
    const got = r.split("/").filter(Boolean);
    if (got.length !== want.length) continue;
    if (got.every((seg, i) => /^\[.*\]$/.test(seg) || seg === want[i])) return true;
  }
  // Next の外（`public/`）に在る面
  return existsSync(join(PUBLIC, `${path.replace(/^\//, "")}.html`));
}

const withHref = THEMES.filter((t) => t.href);
if (withHref.length === 0) nothing("`href` を書いた宛先が1つも無い");
const deadHref = withHref.filter((t) => !hasPage(t.href));
check(
  `href の行き先が実在する（${withHref.length}件）`,
  deadHref.length === 0,
  deadHref.map((t) => `${t.id}→${t.href}`).join(" "),
);

/* **裏も見る。** 面が在るのに `href` が無い宛先は、押せる先を1つ捨てている。
   アルバニアに `href` が無いのは `/albania` が無いからで、
   **その面を作った日にここが赤くなる**（決まりを人の記憶に預けない）。 */
const noHref = THEMES.filter((t) => !t.href);
const shouldLink = noHref.filter((t) => hasPage(`/${t.id}`));
check(
  `href を書いていない宛先（${noHref.length}件）は、その名前の面も無い`,
  shouldLink.length === 0,
  shouldLink.map((t) => `${t.id}（/${t.id} が在る）`).join(" "),
);

/* ===================================================== 3. 書ける宛先が在る */

/** 画面が出る前（`null`）と、出たあと（本物の今日）の両方で数える */
for (const [when, now] of [["画面が出る前（焼いた日）", null], ["きょう", TODAY]]) {
  const open = openThemes(now);
  check(`${when}、書ける宛先が1つ以上ある`, open.length > 0, `${open.length}件`);
  const noGroup = open.filter((t) => !t.group?.trim());
  check(
    `${when}、書ける宛先はどれも見出しを持っている（${open.length}件）`,
    noGroup.length === 0,
    noGroup.map((t) => t.id).join(" "),
  );
}

/* 畳んだぶんも1つ以上ある（＝畳みが出る）。0件だと、畳みごと出ない形が
   「畳みの中で読める」の根拠にならない */
const closed = THEMES.filter((t) => !isOpenTheme(t, TODAY));
check("畳んだ宛先も1つ以上ある（畳みが出る）", closed.length > 0, `${closed.length}件`);

/* ================================== 4. 束ねたあと、どの宛先も見出しに入る */

/**
 * 出てきうる見出しを全部集める。
 *
 * **`t.group` だけでは足りない。** 企画あては日付で「行ってきた企画」に
 * 移るので、束ねた結果から取る（`groupOf` は外に出ていない）。
 * 日をずらして当てるのは、**今日たまたま出ない見出しを見落とさない**ため。
 */
const DAYS = [null, TODAY, noon(2026, 9, 1), noon(2026, 10, 20), noon(2027, 3, 1)];
const seen = new Set();
for (const d of DAYS) for (const s of shelves(THEMES, d)) seen.add(s.group);
if (seen.size === 0) nothing("見出しを1つも集められなかった");
console.log(`# 出てきうる見出し ${seen.size}件: ${[...seen].join(" / ")}`);

const strayGroup = [...seen].filter((g) => !GROUP_ORDER.includes(g));
check(
  `出てきうる見出しが、全部並びの表に在る（${seen.size}件）`,
  strayGroup.length === 0,
  strayGroup.join(" "),
);

/* 束ねて、宛先が1つも落ちない・増えないこと。読む側と書く側の両方で見る */
for (const d of DAYS) {
  const label = d ? d.toISOString().slice(0, 10) : "焼いた日";
  const read = shelves(THEMES, d);
  const flatRead = read.flatMap((s) => s.themes.map((t) => t.id));
  check(
    `${label}：読む側を束ねても、宛先が落ちない（${THEMES.length}件）`,
    flatRead.length === THEMES.length && new Set(flatRead).size === THEMES.length,
    `束ねた後=${flatRead.length}件`,
  );
  const open = openThemes(d);
  const write = writeShelves(open, d);
  const flatWrite = write.flatMap((s) => s.themes.map((t) => t.id));
  check(
    `${label}：書く側を束ねても、宛先が落ちない（${open.length}件）`,
    flatWrite.length === open.length && new Set(flatWrite).size === open.length,
    `束ねた後=${flatWrite.length}件`,
  );
  /* **並びが表のとおりか。** 表に無い見出しは後ろへ回るだけで赤くならないので、
     ここで順番そのものを見る */
  const rank = (g) => (GROUP_ORDER.indexOf(g) < 0 ? GROUP_ORDER.length : GROUP_ORDER.indexOf(g));
  const sorted = write.map((s) => rank(s.group));
  check(
    `${label}：書く側の見出しが、表の順に出る（${write.map((s) => s.group).join(" → ") || "なし"}）`,
    sorted.every((x, i) => i === 0 || sorted[i - 1] <= x),
  );
}

/* ---- 対照。並びの表が、ほんとうに並びを決めているか ---------------------
   表の順を逆にしたら束の順も逆になる、を見る。ここが動かなければ、
   上の「表の順に出る」は何も測っていない（`docs/island-standards.md` 15章）。 */
const open = openThemes(TODAY);
const front = writeShelves(open, TODAY).map((s) => s.group);
check(
  `対照：書く側の束が2つ以上ある（${front.join(" → ")}）`,
  front.length >= 2,
  "束が1つだと、並びを測れない",
);
/* 宛先の `group` を入れ替えた写しを渡して、束の順が表のとおりに動くこと。
   表そのものは触らない（`ORDER` は外から差し替えられない）ので、
   **いちばん後ろの見出しの宛先を先に渡しても、束は表の順に出る**ことを見る */
const flipped = writeShelves([...open].reverse(), TODAY).map((s) => s.group);
check(
  `対照：渡す順を逆にしても、束は表の順のまま（${flipped.join(" → ")}）`,
  flipped.join("|") === front.join("|"),
);

/* ======================================== 5. 日付で閉じる宛先（`closesOn`）

   あやと 2026-11-20「明日の移動日にはもう閉じるようにしてほしい」。ソフィアあて（`bulgaria`）は
   ルーマニアへ移る 2026-11-21（日本時間）に閉じる。**21日に焼き直さなくても閉じていること**を見る:
   20日に焼いた表（`BUILT_AT` = 20日）を、21日の時計で開く。 */
const withClose = THEMES.filter((t) => t.closesOn);
if (withClose.length === 0) nothing("日付で閉じる宛先（`closesOn`）が1つも無い");
const badDay = withClose.filter((t) => !/^\d{4}-\d{2}-\d{2}$/.test(t.closesOn));
check(`閉じる日は YYYY-MM-DD の形（${withClose.length}件）`, badDay.length === 0, badDay.map((t) => t.id).join(" "));
check("ソフィアあて（bulgaria）は 2026-11-21 に閉じる", T.themeById("bulgaria")?.closesOn === "2026-11-21");

/** 日本時間の時刻（`noon` と同じく UTC で組む。日本時間 = UTC+9） */
const jst = (y, m, d, h, mi = 0) => new Date(Date.UTC(y, m - 1, d, h - 9, mi, 0));
{
  /* 20日に焼いた表を組み直す（`lib/builtAt.ts` は読み込んだときに環境変数を読む） */
  const saved = process.env.NEXT_PUBLIC_BUILT_AT;
  process.env.NEXT_PUBLIC_BUILT_AT = "2026-11-20T03:00:00Z";
  for (const k of Object.keys(req.cache)) if (k.startsWith(OUT)) delete req.cache[k];
  const B20 = req(join(OUT, "themes.js"));
  if (saved === undefined) delete process.env.NEXT_PUBLIC_BUILT_AT;
  else process.env.NEXT_PUBLIC_BUILT_AT = saved;
  const sofia = B20.themeById("bulgaria");
  const romania = B20.themeById("romania");
  if (!sofia || !romania) nothing("ソフィアあて・ブカレストあての宛先が読めない");
  check("20日に焼いた表: 焼いた HTML（画面が出る前）では、ソフィアあてはまだ書ける", B20.isOpenTheme(sofia, null) === true);
  check("20日に焼いた表: 20日 23:59（日本時間）の画面では、ソフィアあてはまだ書ける", B20.isOpenTheme(sofia, jst(2026, 11, 20, 23, 59)) === true);
  check("20日に焼いた表のまま: 21日 0:00（日本時間）の画面では、ソフィアあては閉じる（焼き直さなくても）",
    B20.isOpenTheme(sofia, jst(2026, 11, 21, 0, 0)) === false);
  check("20日に焼いた表のまま: 21日の画面では、ソフィアの面に決め打ちの付箋の窓も閉じる（`shutDest`）",
    B20.shutDest(sofia, jst(2026, 11, 21, 12)) === true);
  const open21 = B20.openThemes(jst(2026, 11, 21, 12)).map((t) => t.id);
  check(`21日の書ける宛先に、ソフィアあては無く、ブカレストあては在る（${open21.join(" ")}）`,
    !open21.includes("bulgaria") && open21.includes("romania"));
  /* 読む側の棚からは消えない（貼られた付箋は読める） */
  const read21 = B20.shelves(B20.THEMES, jst(2026, 11, 21, 12)).flatMap((s) => s.themes.map((t) => t.id));
  check("閉じたあとも、ソフィアあての棚は読む側に残る", read21.includes("bulgaria"));
  /* 対照: 閉じる日を外した写しなら、21日でも書ける（日付で閉じていることを、この欄が担っている） */
  check("対照: 閉じる日を外すと、21日でもソフィアあては書ける", B20.isOpenTheme({ ...sofia, closesOn: undefined }, jst(2026, 11, 21, 12)) === true);

  /* **焼いた HTML（画面が出る前）は、焼いた日に依らない。** 焼いた日で閉じると、先の日に焼いた HTML では
     ソフィアあてが書く側から畳みへ移り、datebake が「焼いたまま」と読んだ（2026-11-20 の master の赤）。
     datebake と同じく 400日先に焼いた表を組み、画面が出る前の書ける宛先が20日に焼いたものと同じかを見る */
  const savedB = process.env.NEXT_PUBLIC_BUILT_AT;
  process.env.NEXT_PUBLIC_BUILT_AT = "2027-12-25T00:00:00Z";
  for (const k of Object.keys(req.cache)) if (k.startsWith(OUT)) delete req.cache[k];
  const BFAR = req(join(OUT, "themes.js"));
  if (savedB === undefined) delete process.env.NEXT_PUBLIC_BUILT_AT;
  else process.env.NEXT_PUBLIC_BUILT_AT = savedB;
  const ids20 = B20.openThemes(null).map((t) => t.id).join(" ");
  const idsFar = BFAR.openThemes(null).map((t) => t.id).join(" ");
  check(`焼いた HTML の書ける宛先は、焼いた日に依らない（20日に焼いても400日先に焼いても「${ids20}」）`, ids20 === idsFar, `先の日=「${idsFar}」`);
  check("先の日に焼いた表でも、その日の時計の画面ではソフィアあては閉じている", BFAR.isOpenTheme(BFAR.themeById("bulgaria"), jst(2027, 12, 25, 12)) === false);
}

/* ==================================== 6. 出た国あての付箋が、書けるまま残っていない

   2026-11-20 に、北マケドニアあて（`north-macedonia`）が出た日（11-12）のあとも書けるままだったのを見つけた。
   **出た日は国の表から導く**——歩いている国はつぎの国に入った日（`content/countries.ts` の `AHEAD_COUNTRIES` の
   `entered`）、歩き終わった国は滞在の終わりの翌日（`COUNTRIES` の `stays` の `to`。境目の日は入った国が取る）。
   ここに日付を書き写さない（国を1つ越えた日に、ここだけ古い表で緑になる）。
   **歩き終わった国も見る。** 2026-11-22 にアルバニア・北マケドニア・ブルガリアを `COUNTRIES` へ移したので、
   `AHEAD_COUNTRIES` だけを見ていると、出た国あての3つが黙って確かめの外へ出る */
const C = req(join(OUT, "countries.js"));
const nextDay = (d) => new Date(Date.parse(`${d}T00:00:00Z`) + 86400_000).toISOString().slice(0, 10);
const ahead = [...(C.AHEAD_COUNTRIES ?? [])]
  .map((c) => ({ slug: c.slug, entered: c.entered }))
  .sort((a, b) => a.entered.localeCompare(b.entered));
const done = (C.COUNTRIES ?? []).flatMap((c) => {
  const last = c.stays.map((s) => s.to).filter(Boolean).sort().at(-1);
  return last ? [{ slug: c.slug, leftOn: nextDay(last) }] : [];
});
if (!done.length) nothing("国の表（`COUNTRIES`）から、閉じた滞在を1つも読めない");
const left = [...done, ...ahead.slice(0, -1).map((c, i) => ({ ...c, leftOn: ahead[i + 1].entered }))].filter((c) => T.themeById(c.slug));
if (left.length === 0) nothing("出た国のうち、付箋の宛先を持つ国が1つも無い");
for (const c of left) {
  const [y, m, d] = c.leftOn.split("-").map(Number);
  const t = T.themeById(c.slug);
  check(`出た国あて（${c.slug}）は、出た日（${c.leftOn}）の 0:00（日本時間）から書けない`, isOpenTheme(t, jst(y, m, d, 0, 0)) === false);
  check(`出た国あて（${c.slug}）は、きょうも書けない`, isOpenTheme(t, TODAY) === false);
}
/* 対照: 閉じる日を外した写しなら、出た日のあとも書ける（上の確かめが、閉じる日を本当に見ている） */
{
  const nm = T.themeById("north-macedonia");
  check("対照: 北マケドニアあてから閉じる日を外すと、出た日のあとも書けてしまう",
    !!nm && isOpenTheme({ ...nm, closesOn: undefined }, jst(2026, 11, 20, 12)) === true);
}

console.log(`\n${OK + BAD}件中 ${OK}件通った`);
if (BAD) {
  console.log(`\n${BREAK_HINT}`);
  process.exit(1);
}
