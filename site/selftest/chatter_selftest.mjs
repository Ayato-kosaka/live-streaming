/**
 * `content/chatter.ts` の確かめ。**よく歩く人に、その人の言葉が届いているか。**
 *
 *     node site/selftest/chatter_selftest.mjs
 *
 * ## なぜ要るか
 *
 * 島の住人が喋る言葉のうち、**その人の口調で書いてあるのは `VOICES` に載っている
 * ぶんだけ**で、載っていない人は `COMMON_LINES` / `COMMON_HOURS` / `COMMON_TRIP`
 * に落ちる（`linesOf()` / `greetOf()`）。落ちても**何も起きない。**
 * 型は通るし、画面も出るし、run も緑になる。違うのは、島で話しかけたときに
 * 返ってくるのが「その人の言葉」か「誰でもない言葉」かだけ。
 *
 * そして**片方だけが毎晩動く。**
 *
 * | | 誰が書くか | いつ変わるか |
 * | --- | --- | --- |
 * | `content/residents.ts` | `python/build_residents.py` | **毎晩**（`rebake.yml`） |
 * | `content/chatter.ts` | 人 | 誰かが書いたときだけ |
 *
 * `score` も `days` も毎晩動くので、**昨日まで島にあまり出ていなかった人が、
 * 今夜から常連として歩き出す。** そのとき専用のセリフが無ければ、その人は
 * 共通のセリフを喋る。赤くならない。誰も見ていない。
 *
 * 実際、視聴者さんに「住人の台詞が普通すぎる」と言われるまで、
 * **49日来ていて出席4位の常連が、ずっと共通のセリフのまま**だった。
 * `docs/island-misses.md` #102（隣がいまどれだけ太いかを書き写す）と同じ family で、
 * **隣が動くのに、こちらは動いたことに気づけない形**になっていた。
 *
 * ## 何を見ているか
 *
 *  1. **分母**（名簿が何人・セリフ帳が何件・共通に落ちるのが何人）
 *  2. よく歩く順（`score` 降順）に上位10・20・30・50 のカバー
 *  3. `score` がいくつ以上で未収録が何人か
 *  4. 落ちる条件（下）
 *
 * **名前は出さない。** 出すのは `icon` と数字だけ（`chatter.ts` の決まり5、
 * `docs/island-concept.md` 6章）。このリポジトリは公開で、Actions のログも
 * 誰でも読める。`residents.ts` の `channel`（YouTube のチャンネルid）には
 * **触らない。**
 *
 * ## 落ちる条件は1つだけにしてある
 *
 * ここで落とすのは **「よく歩く順の上位10人に、共通のセリフの人がいる」** だけ。
 * ほかは数を出すだけで、しきい値を持たせていない。**いまの実測値を写して
 * しきい値にすると、それは #102 そのもの**になる——「上位20がいまは15人だから
 * 15で止める」は、15 という数に理由が無い。理由の無いしきい値は、
 * 人が1人セリフを書き足した翌日から**だだ甘い**か、名簿が1人動いた翌日から
 * **狼少年**かのどちらかになる。
 *
 * 上位10人に理由があるのは、そこが**島でいちばん見られる層**だから。
 * 島に同時に立てるのは12人（`components/isle/folk.ts` の `outToday`）で、
 * 出るかどうかは `score` の重みで日替わりに決まる。上位はほぼ毎日立っている。
 * 島に降りて最初に話しかけられる人が共通のセリフなら、**島そのものが
 * 「誰でもない島」に見える。** ここは欠けてはいけない。
 *
 * そのほかに、**測っているものが本当にそれか**を見る構造の確かめを置いてある
 * （重複した `icon`、共通への落ち方）。どれも「0でなければ間違い」が
 * 定義から決まるもので、実測値を写したものではない。
 *
 * **「名簿から消えた人のセリフ」では落とさない。** 名簿は直近90日なので、
 * しばらく来られなかった人は名簿から外れる。そのとき落とすと、
 * **来られなかったことを赤で責める**ことになるし、セリフを消せという圧にもなる。
 * 数だけ出す。
 *
 * ## 壊した写しで落ちることまで見る（`docs/island-misses.md` #99 #100）
 *
 * `CHATTER_TS` / `RESIDENTS_TS` に写しの道を渡すと、そちらを組み立てて回す。
 *
 * ```bash
 * # 上位10人の誰か1人ぶんの Voice を丸ごと抜いた写しを作る。
 * # 閉じ括弧は**字下げ2つの `},` ちょうど**で探す。`greet: {` の中にも `},` が
 * # あるので、含むかどうかで探すと入れ子の途中で切れて、構文エラーで 2 で終わる
 * node -e '
 *   const fs=require("fs"), [s,ic,d]=process.argv.slice(1);
 *   const L=fs.readFileSync(s,"utf8").split("\n");
 *   const at=L.findIndex((l)=>l.includes(`icon: "${ic}"`));
 *   let a=at; while(L[a]!=="  {") a--;
 *   let b=at; while(L[b]!=="  },") b++;
 *   L.splice(a,b-a+1); fs.writeFileSync(d,L.join("\n"));
 * ' site/content/chatter.ts <抜く icon> /tmp/chatter-holed.ts
 *
 * CHATTER_TS=/tmp/chatter-holed.ts node site/selftest/chatter_selftest.mjs   # 1 で落ちる
 * node site/selftest/chatter_selftest.mjs                                    # 0 で通る
 * ```
 *
 * **手を入れていない写しで先に回す**（`docs/island-standards.md` §15 の最後）。
 * 写しを作る途中で壊しても終了コードは同じなので、そこを見ないと対照にならない。
 * 実際いちど、入れ子の `},` で切って構文を壊したまま「落ちた」と読みかけた。
 *
 * ## 終了コード
 *
 * `0` 通った / `1` 落ちた / `2` **数えるものが無かった**（`docs/island-standards.md`
 * §15。「違反0」と「1件も見ていない」を同じ顔にしない）。
 */

import {execFileSync} from "node:child_process";
import {copyFileSync, mkdtempSync, readFileSync, writeFileSync} from "node:fs";
import {createRequire} from "node:module";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, "..");
const CONTENT = join(SITE, "content");

/** 組み立てるもの。**落ちることを確かめる写しだけ、ここを差し替える。** */
const CHATTER = process.env.CHATTER_TS || join(CONTENT, "chatter.ts");
const RESIDENTS_SRC = process.env.RESIDENTS_TS || join(CONTENT, "residents.ts");

// ------------------------------------------------------- 本物を持ち込む

/* 正規表現で数えるだけの写しを作らない。**写しを持つと、`chatter.ts` の
   落とし方を変えた日に、ここだけ黙って古い数え方のまま通る。**
   `hasVoice` も `linesOf` も、画面が呼んでいるものをそのまま呼ぶ。 */
const WORK = mkdtempSync(join(tmpdir(), "chatter-src-"));
const OUT = mkdtempSync(join(tmpdir(), "chatter-out-"));

/**
 * 元のまま持ち込む。別名（`@/lib/…`）だけは tsc が道に直してくれないので、
 * 隣に置いたものを指すように書き替える。
 * @param {string} src 元の道
 * @param {string} as 置く名前
 */
const bring = (src, as) =>
  writeFileSync(join(WORK, as), readFileSync(src, "utf8").replace(/@\/lib\//g, "./"));

bring(CHATTER, "chatter.ts");
bring(RESIDENTS_SRC, "residents.ts");
// chatter.ts が連れてくるぶん
bring(join(CONTENT, "countryStats.ts"), "countryStats.ts");
bring(join(CONTENT, "chapters.ts"), "chapters.ts");
copyFileSync(join(SITE, "lib", "builtAt.ts"), join(WORK, "builtAt.ts"));

try {
  execFileSync(join(SITE, "node_modules", ".bin", "tsc"), [
    join(WORK, "chatter.ts"),
    join(WORK, "residents.ts"),
    "--outDir", OUT,
    "--module", "commonjs",
    "--target", "es2022",
    "--strict",
    "--skipLibCheck",
    /* 型の置き場を**道で名指しする。** 書かないと tsc は「いまいるところ」から
       上へ `node_modules/@types` を探しにいくので、リポジトリの外（`/tmp`）に
       組み立てたこの写しでは見つからず、`builtAt.ts` の `process` で落ちる。
       **どこから呼ばれても同じように通るように**、ここで固定する */
    "--typeRoots", join(SITE, "node_modules", "@types"),
    "--types", "node",
  ], {stdio: "inherit"});
} catch {
  /* **組み立てられなかったのは「違反0」ではない。** 落ちた合図（1）と混ぜると、
     写しを作り損ねた回が「セリフが足りない」に見える（`docs/island-standards.md` §15）。
     tsc の言い分は上に出ているので、ここは1行だけ足して 2 で終わる。 */
  console.log("");
  console.log("組み立てられませんでした。数えていないので、合否は出していません。");
  console.log(`  セリフ帳: ${CHATTER}`);
  console.log(`  名簿    : ${RESIDENTS_SRC}`);
  process.exit(2);
}

const req = createRequire(import.meta.url);
const {VOICES, hasVoice, linesOf, greetOf, COMMON_LINES, COMMON_GREET} = req(join(OUT, "chatter.js"));
const {RESIDENTS} = req(join(OUT, "residents.js"));

console.log("# 島のセリフが、よく歩く人に届いているか");
console.log(`  セリフ帳: ${CHATTER}`);
console.log(`  名簿    : ${RESIDENTS_SRC}`);

// ------------------------------------------------------- 数えるものがあるか

/* §15。**0件を「違反なし」と読まない。** 組み立てに失敗しても require は
   通ってしまう（空の配列が返る）ので、ここで分けて終わる。 */
const empty = [];
if (!Array.isArray(RESIDENTS) || RESIDENTS.length === 0) empty.push("名簿（RESIDENTS）が0人");
if (!Array.isArray(VOICES) || VOICES.length === 0) empty.push("セリフ帳（VOICES）が0件");
if (!Array.isArray(COMMON_LINES) || COMMON_LINES.length === 0) empty.push("共通のセリフ（COMMON_LINES）が0件");
if (empty.length) {
  console.log("");
  console.log("数えるものが見つかりませんでした。合否は出していません:");
  for (const e of empty) console.log(`  - ${e}`);
  process.exit(2);
}

let BAD = 0;
let OK = 0;
/**
 * 1つ見る。
 * @param {string} name 何を見たか
 * @param {boolean} good 通ったか
 * @param {string} why 落ちたときに出すもの
 */
function check(name, good, why = "") {
  if (good) {
    OK++;
    console.log(`  ok   ${name}`);
    return;
  }
  BAD++;
  console.log(`  NG   ${name}${why ? ` — ${why}` : ""}`);
}

// ------------------------------------------------------- 1. 分母

/** 名簿のうち、キャラクターの絵が結べている人（`icon` を持つ人）だけがセリフを持てる */
const WITH_ICON = RESIDENTS.filter((r) => r.icon);
const VOICED = RESIDENTS.filter((r) => hasVoice(r.icon));
const MUTE = RESIDENTS.filter((r) => !hasVoice(r.icon));
/** セリフ帳に在るのに、いまの名簿（直近90日）に居ない人。**これでは落とさない** */
const ORPHAN = VOICES.filter((v) => !RESIDENTS.some((r) => r.icon === v.icon));

console.log("\n# 1. 分母");
console.log(`  名簿（residents.ts）          : ${RESIDENTS.length} 人`
  + `（うち絵が結べている ${WITH_ICON.length} 人）`);
console.log(`  セリフ帳（chatter.ts VOICES） : ${VOICES.length} 件`
  + `（うち名簿の誰かに当たった ${VOICES.length - ORPHAN.length} 件`
  + ` / いまの名簿に居ない ${ORPHAN.length} 件）`);
console.log(`  自分のセリフを持っている人    : ${VOICED.length} 人`);
console.log(`  共通のセリフに落ちる人        : ${MUTE.length} 人`
  + `（${(MUTE.length / RESIDENTS.length * 100).toFixed(0)}%）`);

// ------------------------------------------------------- 2. よく歩く順

/**
 * よく歩く順。**`score` の降順。同じ点の人は、名簿に並んでいる順のまま。**
 *
 * 同着を点以外の何か（出席日数など）で割り直さない。名簿の並びは
 * `python/build_residents.py` が毎回1通りに決めていて、揺れないことを
 * `python/bake_order_selftest.py` が見ている。**すでに決まっている順を
 * ここでもう一度決め直すと、決め方が2つになる**（`docs/island-misses.md` #102）。
 * `Array#sort` は安定なので、これで同じ名簿からは毎回同じ並びが出る。
 */
const BY_SCORE = [...RESIDENTS].sort((a, b) => b.score - a.score);

console.log("\n# 2. よく歩く順（score 降順）のカバー");
const BANDS = [10, 20, 30, 50, RESIDENTS.length];
/** 上位N人ぶんの結果。`{band: その人たち, voiced: そのうちセリフ持ちの数}` */
const cover = {};
for (const n of BANDS) {
  const band = BY_SCORE.slice(0, n);
  const voiced = band.filter((r) => hasVoice(r.icon)).length;
  cover[n] = {band, voiced};
  console.log(`  上位 ${String(n).padStart(3)} 人: セリフあり ${String(voiced).padStart(3)}`
    + ` / なし ${String(band.length - voiced).padStart(3)}`
    + ` → ${(voiced / band.length * 100).toFixed(0)}%`);
}

/* **境目が同着だと、上位N人の顔ぶれは「名簿の並び順」で決まる。**
   決まりはするが、点が同じ人のどちらが入るかに意味は無いので、
   そのときは数字をそのまま読まないように断っておく。
   いちばん下（点0の人）は 59 人が同着なので、上位50 は毎回そこを通る。 */
for (const n of BANDS) {
  if (n >= RESIDENTS.length) continue;
  if (BY_SCORE[n - 1].score !== BY_SCORE[n].score) continue;
  console.log(`  ※ 上位${n}人の境目（score ${BY_SCORE[n - 1].score}）は同着。`
    + `そこに並ぶ ${RESIDENTS.filter((r) => r.score === BY_SCORE[n - 1].score).length} 人の`
    + "どれが入るかは名簿の並び順で決まる");
}

// ------------------------------------------------------- 3. score ごと

console.log("\n# 3. score がいくつ以上で、セリフが無い人が何人か");
for (const th of [0.9, 0.8, 0.7, 0.6, 0.5]) {
  const hit = RESIDENTS.filter((r) => r.score >= th);
  const gap = hit.filter((r) => !hasVoice(r.icon));
  console.log(`  score >= ${th.toFixed(1)}: 未収録 ${String(gap.length).padStart(3)} 人`
    + ` / 該当 ${String(hit.length).padStart(3)} 人`);
}

/* いちばん島に出やすい未収録の人。**ここを埋めれば、いちばん効く。**
   出すのは icon と数字だけ（名前・チャンネルidは出さない）。 */
console.log("\n  いちばん島に出やすい未収録の人（icon と数字だけ）:");
const worst = [...MUTE].sort((a, b) => b.score - a.score).slice(0, 5);
for (const r of worst) {
  const dayRank = 1 + RESIDENTS.filter((x) => x.days > r.days).length;
  console.log(`    icon ${r.icon ?? "（絵が結べていない）"}`
    + ` / score ${r.score.toFixed(3)} / 出席 ${r.days}日`
    + `（出席だけなら ${dayRank}位）`);
}

// ------------------------------------------------------- 4. 落ちる条件

console.log("\n# 4. 落ちる条件");

/* 本丸。**島でいちばん見られる層**が共通のセリフになっていないか。
   なぜ10人かは、このファイルの頭に書いてある（島に同時に立つのは12人で、
   score 上位はほぼ毎日立っている）。**いまの実測値を写したしきい値ではない。** */
const top = cover[10];
check(`よく歩く順の上位10人が、ぜんぶ自分のセリフを持っている`
  + `（${top.voiced}/${top.band.length}）`,
  top.voiced === top.band.length,
  `共通のセリフの人が ${top.band.length - top.voiced} 人: `
    + top.band.filter((r) => !hasVoice(r.icon))
      .map((r) => `icon ${r.icon ?? "?"}（score ${r.score.toFixed(3)}）`).join(" / "));

/* 構造の確かめ。**どれも「0でなければ間違い」が定義から決まる**もので、
   実測値を写したしきい値ではない。 */

/* `BY_ICON` は `new Map(VOICES.map(...))` なので、**同じ icon を2度書くと
   あとの1件が黙って消える。** 型も通るし画面も出る。書いたセリフが
   誰にも届かないので、ここで落とす。 */
const dupVoice = VOICES.map((v) => v.icon)
  .filter((ic, i, a) => a.indexOf(ic) !== i);
check(`セリフ帳に同じ icon が2度出ていない（${VOICES.length} 件を見た）`,
  dupVoice.length === 0, `重複 ${dupVoice.length} 件: ${[...new Set(dupVoice)].join(" / ")}`);

/* 名簿に同じ人が2度並ぶと、カバー率の分母が水増しされる（＝この確かめ自体が嘘になる） */
const dupRes = WITH_ICON.map((r) => r.icon)
  .filter((ic, i, a) => a.indexOf(ic) !== i);
check(`名簿に同じ icon が2度出ていない（${WITH_ICON.length} 人を見た）`,
  dupRes.length === 0, `重複 ${dupRes.length} 件`);

/* **口と画面を突き合わせる**（`docs/island-standards.md` §15）。
   `hasVoice` が false のものを数えるだけでは足りない。**本当に共通のセリフに
   落ちているか**を `linesOf` の返り値そのもので見る。ここが合わなければ、
   上の80人という数字が何を数えたものか分からなくなる。 */
const now = new Date();
const SEP = " ";
const common = linesOf(undefined, now).join(SEP);
const mutedReally = MUTE.filter((r) => linesOf(r.icon, now).join(SEP) === common).length;
check(`共通に落ちる ${MUTE.length} 人が、本当に共通のセリフを返す（${mutedReally}/${MUTE.length}）`,
  mutedReally === MUTE.length, `違ったのが ${MUTE.length - mutedReally} 人`);

const ownReally = VOICED.filter((r) => linesOf(r.icon, now).join(SEP) !== common).length;
check(`セリフ持ち ${VOICED.length} 人が、共通とは違うセリフを返す（${ownReally}/${VOICED.length}）`,
  ownReally === VOICED.length, `共通と同じだったのが ${VOICED.length - ownReally} 人`);

// ------------------------------------------------------- 5. 数えるだけ

/* **1言目が共通と字面まで同じ人は、落とさない。**
   最初これで落とすつもりで書いて、いまの本番で1人引っかかった。見に行ったら
   `chatter.ts` に本人の言葉として書いてある1行が、たまたま共通のものと
   同じ字だっただけだった（口調が素直な人はそうなる）。
   **不具合ではないものを赤にすると、次からは誰も読まない**
   （`docs/island-standards.md` §13。判定のほうを疑う）。数だけ出す。
   書き忘れは `Voice` 型の `greet` が必須なので tsc が先に落とす。 */
const greetSame = VOICED.filter((r) =>
  greetOf(r.icon, "first") === COMMON_GREET.first
  || greetOf(r.icon, "back") === COMMON_GREET.back).length;

console.log("\n# 5. ここは数えるだけ（しきい値を持たせていない）");
console.log(`  上位20 のカバー ${cover[20].voiced}/${cover[20].band.length}`
  + ` / 上位30 ${cover[30].voiced}/${cover[30].band.length}`
  + ` / 上位50 ${cover[50].voiced}/${cover[50].band.length}`);
console.log("  いまの数を写してしきい値にすると、理由が数のほうに無くなる"
  + "（docs/island-misses.md #102）。");
console.log(`  いまの名簿に居ないセリフ ${ORPHAN.length} 件も、ここでは落とさない。`
  + "名簿は直近90日なので、来られなかった人が外れるのは異常ではない。");
console.log(`  1言目が共通と字面まで同じセリフ持ち: ${greetSame} 人`
  + `（${VOICED.length} 人を見た）。口調が素直な人はそうなるので、これも落とさない。`);

console.log("");
if (BAD) {
  console.log(`NG が ${BAD} 件（通ったのは ${OK} 件）。`);
  console.log("セリフを足すのは site/content/chatter.ts。上の icon で引く。");
  process.exit(1);
}
console.log(`${OK} 件ぜんぶ通った。`);
