/**
 * **島の板が、もう書けない宛先へ案内していないか。**
 *
 *     node site/selftest/isleboard_selftest.mjs
 *     # 0=通った / 1=嘘をついている板があった / 2=数えるものが無い
 *
 * ## なぜ別の1本なのか
 *
 * 隣に2本ある見張りは、どちらもここを見ていない。
 *
 * | 見張り | 見ているもの | ここを見ない理由 |
 * | --- | --- | --- |
 * | `themes_selftest.mjs` | 宛先の表そのもの（`content/themes.ts`） | **島を1枚も組み立てない。** 表が正しくても、島の字が表を読んでいなければ嘘は残る |
 * | `isleplace_selftest.mjs` | 島に建つ**絵**の見分け（`icons.ts`） | 壊し方を `ICONS_TS` 1つで当てる作りなので、別の足を足すと**どの足が折れたか**が読めなくなる |
 *
 * 見るものが「表と島のあいだ」なので、どちらにも寄せずに1本立てる。
 *
 * ## 何が起きたのか（2026-10-11）
 *
 * あやとの指示で、付箋の宛先「アルバニアでこれやって」と「北欧の旅」を
 * 畳んだ（`content/themes.ts` の `closed: true`）。畳んだ宛先は `/board` の
 * 「どこへ」から消える。
 *
 * ところが**島の板の字は手で書いてあった。** 札は「アルバニアでこれやって／
 * やってほしいことを貼る」、「ぜんぶ見る」は「島の掲示板へ・**ここから貼れる**」。
 * **押して `/board` へ行っても、アルバニアあては選べない。**
 *
 * **赤くならない。** 札は出るし、面も開くし、型も巡回も通る。
 * 押した人だけが、貼る先が無いことに気づく（`docs/island-design.md` 3-1 の親戚）。
 * 旅が変わるたびに同じ形で起きるので、機械で数える。
 *
 * ## 見ているもの
 *
 *  1. **島の板を1枚でも見つけた**（章ぜんぶ＋表紙を組み立てて数える）。
 *     0枚なら**数字を出さずに 2**——「違反0」は見ていないから0なのと区別がつかない
 *     （`docs/island-standards.md` 15章）
 *  2. **誘う字（貼れる・貼る・これやって・いちばん乗り）が出ている板は、
 *     並べている宛先に `openThemes` のものが1つ以上ある**
 *  3. **その逆。** 書ける宛先を並べている板が、1文字も誘っていないなら落とす
 *     （貼れるのに言っていない。判定の向きを両側から縛る）
 *  4. **「ここから貼れる」と言う板の `more.href` が、本当に書ける面**
 *     （`/board`。しかもその日に `openThemes` が1つ以上ある）
 *  5. **板に並べた宛先が、表（`THEMES`）に実在して、1つ以上ある**
 *  6. **島の側（`spec.ts` / `cover.ts`）のコードに、誘う字が手で書かれていない。**
 *     字の出どころを `components/isle/board.ts` 1本に保つ——
 *     **2か所に字があれば、必ずいつか片方だけ古くなる**（`docs/island-standards.md` 8章）
 *
 * ## わざと壊して、赤くなることを見る
 *
 * **先に「壊していない写しが通ること」を見る**（`docs/island-misses.md` #99）。
 * 壊し方は `--hint` で出る。
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import Module, { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, "..");
const ISLE = join(SITE, "components", "isle");

/** 組み立てる本体。**落ちることを確かめる写しだけ、ここを差し替える。** */
const BOARD_SRC = process.env.BOARD_TS || join(ISLE, "board.ts");
const SPEC_SRC = process.env.SPEC_TS || join(ISLE, "spec.ts");
const COVER_SRC = process.env.COVER_TS || join(ISLE, "cover.ts");

const HINT = `わざと壊して、ここが落ちることを見るには（足を1本ずつ）:

  # 0) まず、壊していない写しが通ることを見る
  cp site/components/isle/board.ts /tmp/board-ok.ts
  BOARD_TS=/tmp/board-ok.ts node site/selftest/isleboard_selftest.mjs   # -> 0

  # 1) 畳んだ宛先を「まだ書ける」と読ませる（字が誘いに戻る）-> 「誘い先の名乗り」が落ちる
  sed 's|themes.find((t) => isOpenTheme(t, now))|themes[0]|' \\
    site/components/isle/board.ts > /tmp/board-open.ts
  BOARD_TS=/tmp/board-open.ts node site/selftest/isleboard_selftest.mjs   # -> 1

  # 2) 逆に、書ける宛先でも誘わなくする -> 「書ける見出しで組むと here」が落ちる
  sed 's|const here = themes.find|const here = undefined \\&\\& themes.find|' \\
    site/components/isle/board.ts > /tmp/board-mute.ts
  BOARD_TS=/tmp/board-mute.ts node site/selftest/isleboard_selftest.mjs   # -> 1

  # 3) 島の側に手で字を書き足す（直す前の形）-> 「字が作り直しと同じ」と「手で書かれていない」が落ちる
  sed 's|^    sign: true,$|    sign: true,\\n    more: { label: "島の掲示板へ", sub: "ここから貼れる", href: "/board" },|' \\
    site/components/isle/spec.ts > /tmp/spec-say.ts
  SPEC_TS=/tmp/spec-say.ts node site/selftest/isleboard_selftest.mjs   # -> 1

  # 4) 表紙にも手で字を書き足す -> 「手で書かれていない」が落ちる
  sed 's|^    icon: "statue",$|    icon: "statue",\\n    blurb: "やってほしいことを貼る",|' \\
    site/components/isle/cover.ts > /tmp/cover-say.ts
  COVER_TS=/tmp/cover-say.ts node site/selftest/isleboard_selftest.mjs   # -> 1`;

if (process.argv.includes("--hint")) {
  console.log(HINT);
  process.exit(0);
}

// ------------------------------------------------------------------ 組み立て

const OUT = mkdtempSync(join(tmpdir(), "isleboard-out-"));
const WORK = mkdtempSync(join(tmpdir(), "isleboard-src-"));
const TSC = join(SITE, "node_modules", ".bin", "tsc");

writeFileSync(
  join(WORK, "tsconfig.json"),
  JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      lib: ["ES2022", "DOM"],
      module: "commonjs",
      moduleResolution: "node",
      esModuleInterop: true,
      resolveJsonModule: true,
      skipLibCheck: true,
      /* 型の粗さはここで見るものではない（`npx tsc --noEmit` が見る）。
         欲しいのは**動く JS** だけなので、型では止めない */
      strict: false,
      noEmitOnError: false,
      outDir: OUT,
      rootDir: SITE,
      baseUrl: SITE,
      paths: { "@/*": ["./*"] },
    },
    files: [join(ISLE, "spec.ts"), join(ISLE, "cover.ts")],
  }),
);

try {
  execFileSync(TSC, ["-p", join(WORK, "tsconfig.json")], { stdio: "pipe" });
} catch {
  /* 型の文句で 1 を返すが、JS は書き出されている（`isleplace_selftest.mjs` と同じ） */
}

/**
 * 写しで回すときだけ、その1本を組み立て直して差し替える。
 * **本体はそのまま通す**——ここに偽の島を置くと、直したのに確かめが古いまま通る。
 */
function swap(src, rel) {
  if (src === join(ISLE, `${rel}.ts`)) return;
  const tmp = join(WORK, `${rel}.ts`);
  copyFileSync(src, tmp);
  try {
    execFileSync(
      TSC,
      [tmp, "--outDir", WORK, "--module", "commonjs", "--target", "es2022", "--skipLibCheck"],
      { stdio: "pipe" },
    );
  } catch {
    /* `@/…` の型は引けないが、JS は出る */
  }
  copyFileSync(join(WORK, `${rel}.js`), join(OUT, "components", "isle", `${rel}.js`));
  console.log(`# 差し替え: ${rel}.ts <- ${src}`);
}
swap(BOARD_SRC, "board");
swap(SPEC_SRC, "spec");
swap(COVER_SRC, "cover");

/* `@/…` は tsc が道に直してくれないので、require のときに差し替える */
const orig = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request.startsWith("@/")) return orig.call(this, join(OUT, request.slice(2)), ...rest);
  return orig.call(this, request, ...rest);
};

const req = createRequire(import.meta.url);
const { isleSpec, albaniaSpec, macedoniaSpec, nordicSpec } = req(join(OUT, "components", "isle", "spec.js"));
const { coverSpec } = req(join(OUT, "components", "isle", "cover.js"));
const { CHAPTERS } = req(join(OUT, "content", "chapters.js"));
const { THEMES, openThemes, isOpenTheme } = req(join(OUT, "content", "themes.js"));
const { boardPlate } = req(join(OUT, "components", "isle", "board.js"));

// ------------------------------------------------------------------ 数える

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
function stop(why) {
  console.log(`\n数えるものが無い: ${why}`);
  process.exit(2);
}

/** 今日。**島は焼き込みなので、字は日付で変わらない**が、表のほうは日で動く */
const TODAY = new Date();

/* 本番の面と同じ建てかた（`app/island/[chapter]/page.tsx`）。
   旅の spec を持っている章は、建つものの多いほうで建つ。
   表紙（`app/page.tsx`）も1つ組む——あそこがいちばん人の目に触れる島 */
const TRIP = { nordic: nordicSpec, albania: albaniaSpec, "north-macedonia": macedoniaSpec };
const NEAR = { name: "となりの島", href: "/island/x" };
const isles = [];
for (const c of CHAPTERS) {
  const base = isleSpec(c, NEAR, NEAR);
  const trip = TRIP[c.slug]?.(c, NEAR, NEAR);
  isles.push({ where: `/island/${c.slug}`, places: (trip && base.places.length < trip.places.length ? trip : base).places });
  /* **建たなかったほうの旅の島も見る。** 素材が追い越して隠れているだけで、
     配信が1本減れば明日また建つ（`albaniaSpec` の注）。隠れているあいだに
     嘘になった字は、建った日にそのまま出る */
  if (trip) isles.push({ where: `/island/${c.slug}（旅の島）`, places: trip.places });
  isles.push({ where: `表紙（章=${c.slug}）`, places: coverSpec(c, TODAY).places });
}

const boards = [];
for (const i of isles) for (const p of i.places) if (p.board) boards.push({ ...p, where: i.where });

if (!CHAPTERS.length) stop("章の表が読めなかった");
if (!boards.length) stop(`島の板が1枚も見つからなかった（${isles.length}島を組み立てた）`);

console.log(`# 組み立てた島 ${isles.length}／板 ${boards.length}枚`);
for (const b of boards) {
  console.log(
    `  - ${b.where} ${b.id}「${b.label}」/${b.blurb}/ 棚${b.board.themes.length}` +
      ` ぜんぶ見る「${b.more?.sub ?? ""}」`,
  );
}

/** 誘いの字。**「貼れる／貼る」だけでは足りない**——札の名前のほうが誘っている */
const INVITE = /貼れ|貼る|これやって|いちばん乗り|いちばんに貼/;

/** その板が字を出す場所、ぜんぶ */
const words = (b) =>
  [b.label, b.blurb, b.note, b.more?.label, b.more?.sub, b.board.blank?.title, b.board.blank?.lead, b.board.blank?.go?.label]
    .filter(Boolean);

/** そのうち、誘っている字 */
const says = (b) => words(b).filter((s) => INVITE.test(s));

const open = openThemes(TODAY);
console.log(`# いま書ける宛先 ${open.length}（${open.map((t) => t.id).join(" ")}）`);
if (!open.length) stop("書ける宛先が1つも無い（表のほうが壊れている。themes_selftest を見る）");

// ---- 5 板に並べた宛先が、表に実在して1つ以上ある

for (const b of boards) {
  const ids = b.board.themes.map((t) => t.id);
  const ghost = ids.filter((id) => !THEMES.some((t) => t.id === id));
  check(
    `${b.where} ${b.id}: 並べた宛先が表にある（${ids.length}件）`,
    ids.length > 0 && ghost.length === 0,
    ids.length === 0 ? "0件の板" : `表に無い: ${ghost.join(" ")}`,
  );
}

// ---- 1の裏 島に出ている字が、表から作ったものと1文字も違わないか

/* **いちばん効く足。** 島の側で `label` や `more` を手で書き足すと、
   その1行だけが宛先の表を読まずに残る——直す前がまさにそれだった。
   板は材料（`name` / `group`）を持っているので、ここで**もう一度作り直して
   突き合わせる。** 上書きが1文字でもあれば合わない。 */
const FIELDS = ["label", "blurb", "note", "more", "board"];
for (const b of boards) {
  const again = boardPlate({ name: b.board.name, group: b.board.group });
  const got = JSON.stringify(FIELDS.map((f) => b[f] ?? null));
  const want = JSON.stringify(FIELDS.map((f) => again[f] ?? null));
  check(
    `${b.where} ${b.id}: 字が、表から作り直したものと同じ`,
    got === want,
    `島に出ているのは ${got.slice(0, 220)}`,
  );
}

// ---- 2,3 誘い先の印（`aim`）が、宛先の表といま合っているか

/* **字を読んで「どこへ誘っているか」を当てにいかない。**
   「アルバニア以外あての付箋も、ここから貼れる」は、字としては誘っているが
   誘い先はこの旅ではない。字で見分けると、次に別の言い回しが入った日に黙る
   （`docs/island-standards.md` 15章の「並べたものしか拾えない」）。
   板は `aim` を自分で名乗るので、**その名乗りが本当かだけ**を数える。 */
for (const b of boards) {
  const here = b.board.themes.filter((t) => isOpenTheme(t, TODAY));
  const away = THEMES.filter((t) => !b.board.themes.some((x) => x.id === t.id) && isOpenTheme(t, TODAY));
  const aim = b.board.aim;
  const want = here.length ? "here" : away.length ? "away" : "none";
  check(
    `${b.where} ${b.id}: 誘い先の名乗り（${aim}）が、宛先の表と合っている`,
    aim === want,
    `この旅あてに書けるのが${here.length}件・よそが${away.length}件なので ${want} のはず`,
  );
  /* 誘いの字が出てよいのは、貼れる先があるときだけ。
     **`aim` の計算が正しくても、字が別の枝から来ていたら捕まる** */
  const invites = says(b);
  check(
    `${b.where} ${b.id}: 貼れる先が1つも無いなら、誘いの字も無い`,
    aim !== "none" || invites.length === 0,
    `誘い「${invites.join("」「")}」`,
  );
  check(
    `${b.where} ${b.id}: この旅あてに貼れるなら、そう言っている`,
    aim !== "here" || invites.length > 0,
    `${here.map((t) => t.id).join(" ")} に貼れるのに、誘いの字が1つも無い`,
  );
}

// ---- 4 「ぜんぶ見る」の行き先が、本当に書ける面か

for (const b of boards) {
  check(
    `${b.where} ${b.id}: 「${b.more?.sub ?? ""}」の行き先が掲示板`,
    b.more?.href === "/board",
    `行き先が ${b.more?.href}`,
  );
}

// ---- 3の裏 開いている見出しで1枚組む（**「誘う」側の枝を、空回りさせない**）

/* いまの島の板は3枚とも畳んだ旅あてなので、上の「貼れるならそう言っている」は
   **当たり判定が1つも無いまま緑になる**（`docs/island-standards.md` 15章）。
   だから、**いま書ける見出し**で1枚その場で組んで、誘う枝を通す。
   次に旅が始まってそこに板を建てた日、この枝は本物の島で使われる。 */
const liveGroup = open[0].group;
const liveName = liveGroup.replace(/の旅$/, "");
const live = boardPlate({ name: liveName, group: liveGroup });
const liveOpen = live.board.themes.filter((t) => isOpenTheme(t, TODAY));
check(
  `書ける見出し「${liveGroup}」で組むと、誘い先が here（棚${live.board.themes.length}・書ける${liveOpen.length}）`,
  live.board.aim === "here",
  `名乗りは ${live.board.aim}`,
);
check(
  `その板が、ちゃんと誘っている（「${live.label}」「${live.more.sub}」）`,
  says({ ...live, id: "x" }).length > 0,
  "誘いの字が1つも無い",
);
check(
  "1枚も無いときの送り先が、その話をしている面",
  live.board.blank.go?.href === (liveOpen[0]?.href ?? "/board"),
  `${live.board.blank.go?.href}（欲しいのは ${liveOpen[0]?.href ?? "/board"}）`,
);

// ---- 6 島の側に、手で字が書かれていない

/** コメントを落とす。**手引きの中の「貼れる」を数えないため** */
const code = (f) =>
  readFileSync(f, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

for (const [name, src] of [["spec.ts", SPEC_SRC], ["cover.ts", COVER_SRC]]) {
  const hit = code(src)
    .split("\n")
    .map((l, i) => [i + 1, l])
    .filter(([, l]) => INVITE.test(l));
  check(
    `components/isle/${name} に、誘いの字が手で書かれていない`,
    hit.length === 0,
    hit.map(([n, l]) => `${n}行目: ${l.trim().slice(0, 60)}`).join(" / "),
  );
}

// ------------------------------------------------------------------ しめ

console.log(`\n島 ${isles.length} / 板 ${boards.length}枚 / 宛先 ${THEMES.length}（書ける ${open.length}）`);
console.log(`通った ${OK} / 落ちた ${BAD}`);
if (BAD) console.log(`\n${HINT}`);
process.exit(BAD ? 1 : 0);
