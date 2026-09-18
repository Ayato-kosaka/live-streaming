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
 *  4. 落ちる条件（下）。セリフの中に手で書いた数が無いかも、ここで見る
 *
 * **名前は出さない。** 出すのは `icon` と数字だけ（`chatter.ts` の決まり5、
 * `docs/island-concept.md` 6章）。このリポジトリは公開で、Actions のログも
 * 誰でも読める。`residents.ts` の `channel`（YouTube のチャンネルid）には
 * **触らない。**
 *
 * ## 落ちる条件は、しきい値を持つものが1つだけ
 *
 * しきい値を持って落とすのは **「よく歩く順の上位10人に、共通のセリフの人が
 * いる」** だけ。ほかは数を出すだけ。**いまの実測値を写して
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
 * ## セリフの中の数も見る（`docs/island-misses.md` #104 #109）
 *
 * あと2つ、**書いたままの字**を読んで落とす。上の確かめが `linesOf()` の
 * 返り値を見るのに対して、こちらは `chatter.ts` の書きぶりを見る。
 * 組み立てたあとでは `${COUNTRIES_WALKED}` も手で書いた `20` も同じ字になり、
 * **返り値からは永遠に見分けられない**から。
 *
 *  - **まだ動く数が手で書かれていないか。** 毎晩焼き直る数
 *    （歩いた国・名簿の人数）を、**その数の単位が付いている形**で拾う。
 *    `22カ国` は落とす。`22時` は落とさない——同じ「22」でも、
 *    うしろの単位が「これは国の数ではない」と言っている。
 *    国の単位は**値を見ずに**落とす。#104 で4ヶ月出ていたのは `17カ国`、
 *    つまり**もう合っていない数**のほうで、値くらべだけでは拾えない。
 *    動かない数（22時・1日12時間・イランの12日380km・100万再生・年越し24時間・
 *    年月日）は落とさない。線引きの根拠と、**単位で当てるようにした経緯**
 *    （`docs/island-misses.md` #162）は `MOVING` のところに書いた。
 *  - **「伝説の企画が8つ」が `legends.ts` の件数と合っているか。**
 *    いま5本のセリフが字で「8つ」と言っている。9件目を足した日、5本とも
 *    黙って嘘になる。件数は毎晩は動かない（人が企画を足したときだけ動く）ので
 *    手で書いてよいが、食い違ったら落とす。
 *
 * どちらも**いまの数を写したしきい値ではない。** 比べる相手は毎回
 * `countryStats.ts` / `residents.ts` / `legends.ts` から読み直している。
 * 写しは `COUNTRY_STATS_TS` / `RESIDENTS_TS` / `LEGENDS_TS` で差し替えられる。
 * **上流の値だけをずらした写しで回せる**ようにしてあるのは、
 * 「いまの値と一致したから拾った」のか「その数を指しているから拾ったのか」を
 * 分けて見るため（下の「壊した写しで落ちることまで見る」）。
 *
 * **「名簿から消えた人のセリフ」では落とさない。** 名簿は直近90日なので、
 * しばらく来られなかった人は名簿から外れる。そのとき落とすと、
 * **来られなかったことを赤で責める**ことになるし、セリフを消せという圧にもなる。
 * 数だけ出す。
 *
 * ## 読む人への呼びかけは、**形だけ**を見る（`docs/island-misses.md` #110）
 *
 * セリフは島の案内であって、読んでいる人への注文ではない。
 * 「潜って見てるだけの人も、たまには書いたって」が1年近く本番で喋られていた。
 * 島に来た人が、住人から**どういう人かを決めつけられて、行動を促されていた。**
 *
 * ここで落とせるのは**言い回しの形**だけ。3つ見る。どれも件数のしきい値を
 * 持たない（1本でもあれば落とす）ので、**いまの数を写したものではない**
 * （`docs/island-misses.md` #102）。
 *
 *   1. 読む人を**種別で名指す**形（「〜てる人も」「〜ないだけの人は」）
 *   2. **集団への勧誘**の形（「みんなで〜しよう」「一緒に〜ましょう」）
 *   3. **頻度・やり方を是正する**形（「もっと」「たまには」「ちゃんと」＋
 *      「〜ないと」「〜なきゃ」「〜しろ」）
 *
 * **禁止語の一覧にしない。** 並べても、次に別の言い方で書かれたら素通りする。
 * 見ているのは語ではなく、**読む人を主語に置いた文の形**。
 *
 * ### ここで見られないこと（＝機械にはできないこと）
 *
 * **その一文が誰に向いているかは、字から決まらない。** 同じ「ちゃんと食べてね」が、
 * あやと宛てなら気づかいで、読む人宛てなら注文になる。島のセリフは主語を
 * 書かないので、区別できるのは**書いた人だけ**。
 * 「強く生きろよ」のような裸の命令形も同じで、**島の案内（「見てみ」「書いとけ」）と
 * 字の形が変わらない。** 形で落とすと、やわらかい誘いまで巻き込んで赤くなり、
 * そのうち誰も読まなくなる（`docs/island-standards.md` §13）。
 *
 * だから**意味の側は `content/chatter.ts` の決まり8**に置いてある。
 * ここは形だけを止める門で、**通ったことは「呼びかけていない」の証明ではない。**
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
 * 数の2つも、同じように写しで落ちることを見る。**拾うほうと、拾わないほうの
 * 両方**を見る。片方だけ見ても「緩めただけ」と見分けが付かない。
 *
 * ```bash
 * # セリフを1本だけ書き替えた写しを作って回す（どれか1本の字を置き換えるだけ）
 * CHATTER_TS=/tmp/c-22koku.ts node site/selftest/chatter_selftest.mjs   # 「22カ国」→ 1 で落ちる
 * CHATTER_TS=/tmp/c-22nin.ts  node site/selftest/chatter_selftest.mjs   # 「22人」  → 0 で通る
 * CHATTER_TS=/tmp/c-103hi.ts  node site/selftest/chatter_selftest.mjs   # 「103日」 → 0 で通る
 *
 * # 上流の値だけずらす。**それでも「22カ国」が落ちるか**——落ちれば、
 * # 見ているのは「いまの値との一致」ではなく「その数を指しているか」
 * sed 's/COUNTRIES_WALKED = 22;/COUNTRIES_WALKED = 21;/' \
 *   site/content/countryStats.ts > /tmp/cs-21.ts
 * CHATTER_TS=/tmp/c-22koku.ts COUNTRY_STATS_TS=/tmp/cs-21.ts \
 *   node site/selftest/chatter_selftest.mjs                            # 1 で落ちる
 *
 * # legends.ts を9件に見せかけた写し（`];` の手前に1件足すだけ）
 * LEGENDS_TS=/tmp/legends-9.ts node site/selftest/chatter_selftest.mjs  # 1 で落ちる
 * ```
 *
 * **守りを外したら対照が落ちるところまで見る。** この見張り自身の写しを作って、
 * (1) 単位を見ない当て方（`mv.unit` を外す）に戻すと、**手を入れていない
 * `chatter.ts` が 289件で赤くなる**（そのうち77本が `22時`）。
 * (2) 国の `by` を `"named"` にすると、上を 21 でずらした日の `22カ国` が
 * **素通りする**（#104 が再発する形）。外して落ちないなら、その守りは無い。
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
const LEGENDS_SRC = process.env.LEGENDS_TS || join(CONTENT, "legends.ts");
/* 歩いた国の数。**ここも差し替えられるようにしてある。**
   「いまの値と一致したから拾った」のか「その数を指しているから拾ったのか」は、
   本物の値のままでは区別が付かない。値だけずらした写しで回して、
   それでも同じ字が拾えることを見るための口（`docs/island-misses.md` #162）。 */
const COUNTRY_STATS_SRC = process.env.COUNTRY_STATS_TS || join(CONTENT, "countryStats.ts");

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
bring(LEGENDS_SRC, "legends.ts");
// chatter.ts が連れてくるぶん
bring(COUNTRY_STATS_SRC, "countryStats.ts");
bring(join(CONTENT, "chapters.ts"), "chapters.ts");
// 歩いた国の数（`${WALKED}` の印を替えるところ）と、その元になる国の表
bring(join(CONTENT, "walked.ts"), "walked.ts");
bring(join(CONTENT, "countries.ts"), "countries.ts");
copyFileSync(join(SITE, "lib", "builtAt.ts"), join(WORK, "builtAt.ts"));

try {
  execFileSync(join(SITE, "node_modules", ".bin", "tsc"), [
    join(WORK, "chatter.ts"),
    join(WORK, "residents.ts"),
    join(WORK, "legends.ts"),
    /* **名指しで渡す。** `chatter.ts` はもう `countryStats.ts` を直に読まない
       （歩いた国の数は `walked.ts` が数える）ので、渡さないと書き出されず、
       下の `COUNTRIES_WALKED` を読むところで落ちる */
    join(WORK, "countryStats.ts"),
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
const {LEGENDS} = req(join(OUT, "legends.js"));
/* 「まだ動く数」の側の値。**セリフの字と突き合わせる相手**なので、
   焼き込みから直に読む（下の MOVING）。 */
const {COUNTRIES_WALKED} = req(join(OUT, "countryStats.js"));

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
if (!Array.isArray(LEGENDS) || LEGENDS.length === 0) empty.push("伝説の企画（LEGENDS）が0件");
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

/* ---------------------------------------------------------------------------
   ここから下の2つだけは、**組み立てたあとの値ではなく、書いたままの字**を見る。

   理由は1つ。`${COUNTRIES_WALKED}` は組み立てた時点で `20` になるので、
   **差し込みで書いた 20 と、手で書いた 20 が、返り値では一字も違わない。**
   `linesOf()` を呼んでいるかぎり、この2つは永遠に見分けられない。
   `#108` の「数えるだけの写しを作らない」は、**落とし方（誰が共通に落ちるか）を
   写すな**という話で、ここは落とし方ではなく `chatter.ts` の書きぶりそのものが
   見るものなので、字を読むのが本物。上の 1〜4 は今までどおり `linesOf` /
   `hasVoice` を呼んでいる。 */

/**
 * `chatter.ts` の中で**セリフとして書いてある文字列**を、書いたままの字で拾う。
 *
 * コメントの中の字は拾わない（このファイルの頭にも `17カ国` の話が書いてあり、
 * 拾うと注意書きを書いた日に赤くなる）。`icon:` と `note:` も拾わない——
 * `icon` は Drive の ID なので数字の並びが必ず入るし、`note` は視聴者さんに
 * 見えない覚え書きで、島の案内ではない。
 *
 * 差し込み（`${…}`）は**中身ごと1文字に潰す。** 潰さないと、差し込んだ数と
 * 手で書いた数が同じ見た目になって、見分けるためにここを書いた意味が消える。
 *
 * 受けるのは `chatter.ts` の中身。返すのは1本ずつの
 * `{line: 行番号, raw: 書いたままの字, masked: 差し込みを潰した字}`。
 */
function spokenLiterals(text) {
  const out = [];
  const lineOf = (at) => text.slice(0, at).split("\n").length;
  /** その文字列が `icon:` `note:` `from` の右隣か（＝セリフではないか） */
  const notSpoken = (at) => {
    const head = text.slice(text.lastIndexOf("\n", at) + 1, at);
    return /(?:\bicon|\bnote)\s*:\s*$/.test(head) || /\bfrom\s*$/.test(head);
  };
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === "/" && text[i + 1] === "/") {
      i = text.indexOf("\n", i);
      if (i < 0) break;
      continue;
    }
    if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end < 0 ? text.length : end + 2;
      continue;
    }
    if (c !== '"' && c !== "'" && c !== "`") { i++; continue; }
    const at = i;
    let j = i + 1;
    let raw = "";
    while (j < text.length) {
      const d = text[j];
      if (d === "\\") { raw += d + (text[j + 1] ?? ""); j += 2; continue; }
      if (d === c) break;
      /* テンプレートの差し込みは、入れ子の `{}` ぶんだけ数えて飛ばす。
         `${…}` の中に文字列を書いている行はこのファイルに無い。 */
      if (c === "`" && d === "$" && text[j + 1] === "{") {
        let depth = 1;
        j += 2;
        while (j < text.length && depth > 0) {
          if (text[j] === "{") depth++;
          else if (text[j] === "}") depth--;
          j++;
        }
        raw += "${}";
        continue;
      }
      raw += d;
      j++;
    }
    if (!notSpoken(at)) out.push({line: lineOf(at), raw, masked: raw.replace(/\$\{\}/g, "")});
    i = j + 1;
  }
  return out;
}

const SPOKEN = spokenLiterals(readFileSync(CHATTER, "utf8"));

/* §15。**拾えなかったのは「違反0」ではない。** 字を読む側が空振りしていたら、
   下の2つは何を見ても通ってしまう。 */
if (SPOKEN.length === 0) {
  console.log("");
  console.log("セリフの文字列を1つも拾えませんでした。合否は出していません。");
  console.log(`  セリフ帳: ${CHATTER}`);
  process.exit(2);
}

/**
 * **まだ動く数**——毎晩ひとりでに焼き直る数と、**その数を名指す単位**。
 *
 * 動く／動かないの線は「いつ変わるか」で引いている。ここに入れたのは
 * `python/…` が**毎晩焼く**もので、こちらが書いた翌日には違う値になりうる。
 *
 *   歩いた国   `content/countryStats.ts` ← `build_country_stats.py`（毎晩）
 *   名簿の人数 `content/residents.ts`    ← `build_residents.py`（毎晩）
 *
 * **入れていないもの**（手で書いてよい。赤くしない）:
 *
 *   配信の22時 / 旅のあいだの1日12時間 … 決めごと。人が決め直すまで動かない
 *   イランまで12日・380km            … 済んだ旅。二度と動かない（`chatter.ts` 決まり7）
 *   ショート100万再生・年越し24時間    … 起きた出来事。動かない
 *   伝説の企画の年月日                … 起きた日
 *   親指1本・1品ずつ・3日がかり        … 数え上げではなく言い回し
 *
 * 伝説の企画の**件数**はここに入れない。あれは機械が焼くものではなく、
 * 人が企画を1つ書き足したときだけ動く。だから「手で書くな」ではなく
 * 「件数と食い違ったら落とす」で見る（下の2つめ）。
 *
 * ## `unit` が要る理由（`docs/island-misses.md` #162）
 *
 * **前は値だけを見ていた。** セリフの中の裸の数を全部拾って、`value` と
 * 一致したら手書きとみなしていた。これは**「値が一致した」を「それを
 * 指している」と読んでいた**だけで、2026-09-18 に歩いた国が 21 → 22 に
 * 焼き直った晩、「毎晩22時からやってるよ」という**配信の始まる時刻**77本が
 * 「歩いた国の数を手で書いている」として赤くなった。
 *
 * 悪いのは赤くなったことより、**国が23になった翌晩にひとりでに緑へ戻る**
 * ことのほう。セリフを1文字も直していないのに色が行き来する見張りは、
 * 落ちていないのと同じくらい読めない。
 *
 * だから**単位で当てる。** 数だけでは何の数か決まらないが、うしろの単位は
 * 何を数えたかを言っている。`22カ国` は国の数で、`22時` は時刻。
 * 単位の付いていない数と、別の単位が付いている数は**拾わない。**
 *
 * `by` が当て方:
 *
 *   `"unit"`  単位だけで何の数か決まる（`カ国`）。**値は見ない。**
 *             #104 で4ヶ月出ていたのは `17カ国`＝**もう合っていない数**の
 *             ほうで、値くらべでは永遠に拾えない
 *   `"named"` 単位だけでは決まらない（`人` は「1人で」のように数え上げでない
 *             使い方がある）。**いまの値と一致した**か、**数えているものを
 *             同じセリフで名指している**ときだけ拾う。後者は下の
 *             「伝説の企画が8つ」と同じ当て方——単位（`つ`）に加えて
 *             `伝説の企画` という言葉が同じ文にあることを見ている
 *
 * ## 拾わなくなったもの（守りを緩めた自覚）
 *
 * **単位の無い裸の数は、値が一致していても素通りする。**
 * 「歩いたのは22」「住人は103」のように単位を書かない書きぶりは、
 * ここでは止まらない。前は（理由まで合っているかはともかく）止まっていた。
 *
 * 承知のうえで外した。単位の無い数は**何の数かが字から決まらない**ので、
 * 拾えば必ず 22時 を巻き込む。巻き込む見張りは、そのうち誰も読まなくなる
 * （`docs/island-standards.md` §13）。代わりに `chatter.ts` の決まり7が
 * 「どうしても数で言いたいときは焼き込みを差し込む」と書いてあり、
 * 差し込みで書けば単位も自然に付く（`${WALKED}カ国`）。
 * **単位を書かずに数だけ言うセリフは、そもそも島の言い方ではない。**
 */
const MOVING = [
  {
    what: "歩いた国の数（焼き込みの COUNTRIES_WALKED）",
    value: COUNTRIES_WALKED,
    /* 国を数える単位。`国` 単体も入れてある（「22国」）。長いものを先に並べて、
       `カ国` が `国` に先取りされないようにしてある。 */
    unit: /カ国|ヵ国|か国|ヶ国|ケ国|箇国|国|countries|country/,
    by: "unit",
    names: null,
  },
  {
    what: "名簿の人数（RESIDENTS.length）",
    value: RESIDENTS.length,
    unit: /人|people|residents/,
    by: "named",
    /** 名簿そのものを名指している言葉。`島` は何にでも付くので入れない。 */
    names: /住人|名簿|島のみんな|島のメンバー|residents/,
  },
];

/** 差し込みの跡。数にも単位にもならない字に替えて、両者がまたがらないようにする。 */
const HOLE = "〓";

const handWritten = [];
for (const lit of SPOKEN) {
  /* 差し込みは `raw` では `${}` のまま残っている（`masked` では消えている）。
     消すと前後がくっついて、書かれていない「数＋単位」ができてしまう
     （`1${N}カ国` → `1カ国`）。だから消さずに印へ替える。 */
  const text = lit.raw.split("${}").join(HOLE);
  for (const mv of MOVING) {
    const re = new RegExp(`([0-9][0-9,]*)\\s*(?:${mv.unit.source})`, "g");
    for (const m of text.matchAll(re)) {
      const n = Number(m[1].replace(/,/g, ""));
      const why = mv.by === "unit" ? "単位がその数だと言っている"
        : n === mv.value ? "いまの値と一致している"
          : mv.names && mv.names.test(text) ? "数えているものを同じセリフで名指している"
            : null;
      if (why) handWritten.push(`${lit.line}行目 「${m[0]}」= ${mv.what}（${why}）`);
    }
  }
}
check(`セリフの中に、まだ動く数が手で書かれていない`
  + `（文字列 ${SPOKEN.length} 本 × 数 ${MOVING.length} 通りを見た）`,
  handWritten.length === 0,
  `手で書いてある数が ${handWritten.length} 件: ${handWritten.join(" / ")}`
    + "。差し込み（${WALKED}）で書く。数は `content/walked.ts` が画面の出たあとに数える");

/* 伝説の企画の件数。**5本のセリフが「8つ」と字で言っている。**
   `legends.ts` に9件目を足した日、5本とも黙って嘘になる。赤くならない。
   件数は毎晩は動かないので手で書いてよいが、食い違ったらここで落とす。 */
const LEGEND_COUNT = /([0-9]+)\s*(つ|件|本|projects|stories)/g;
const legendClaims = [];
for (const lit of SPOKEN) {
  if (!lit.masked.includes("伝説の企画")) continue;
  for (const m of lit.masked.matchAll(LEGEND_COUNT)) {
    legendClaims.push({line: lit.line, said: Number(m[1]), text: m[0]});
  }
}
const legendWrong = legendClaims.filter((c) => c.said !== LEGENDS.length);
check(`「伝説の企画」の件数を言うセリフが、legends.ts の ${LEGENDS.length} 件と合っている`
  + `（${legendClaims.length} 本を見た）`,
  legendWrong.length === 0,
  `食い違いが ${legendWrong.length} 件: `
    + legendWrong.map((c) => `${c.line}行目 「${c.text}」`).join(" / ")
    + `。legends.ts はいま ${LEGENDS.length} 件`);
if (legendClaims.length === 0) {
  console.log("       ※ 件数を言うセリフが1本も無かったので、上の ok は"
    + "「合っていた」ではなく「言っていない」。");
}

/**
 * 読む人への呼びかけ。**形だけを見る**（このファイルの頭）。
 *
 * `what` は落ちたときに出す言い方の名前、`re` はその形。
 * **語の一覧ではなく、読む人を主語に置いた文の形**を書く。
 */
const CALLOUT = [
  {
    what: "読む人を種別で名指している",
    /* 「〜てる人も」「〜ないだけの人は」。**述語の付いた「人」を「も」「は」で
       受ける形**だけを見る。「見てる人が自分で作ったキャラクター」のように
       事実を言うだけの「人が」は取らない。 */
    re: /[ぁ-んァ-ヶー一-龥]{2,12}(?:てる|ている|とる|ない|てない)\s*(?:だけ)?の?\s*(?:人|方|勢|層)\s*(?:も|は|でも)/,
  },
  {
    what: "集団への勧誘になっている",
    /* 「みんなで〜しよう」「一緒に〜ましょう」。**集団の印＋勧誘形**の2つが
       揃ったときだけ。「みんなで作り方を言い合う配信」は島の案内なので取らない。 */
    re: /(?:みんなで|みんなも|一緒に|ともに)[^。！？]{0,14}(?:よう|ましょ|おう)(?:ぜ|や|よ|ね|か)?/,
  },
  {
    what: "読む人の頻度・やり方を是正している",
    /* 「もっと」「たまには」「ちゃんと」＋**義務・命令の形**。
       「ちゃんと水分とってほしい」のような願いは取らない——あちらは
       宛先があやとのことが多く、字では見分けられない（頭の「見られないこと」）。 */
    re: /(?:もっと|たまには|ちゃんと|きちんと)[^。！？]{0,20}(?:ないと|なきゃ|なあかん|んと|べき|ダメ|駄目|しろ|しなさい|たって)/,
  },
];

const callouts = [];
for (const lit of SPOKEN) {
  for (const c of CALLOUT) {
    if (c.re.test(lit.masked)) callouts.push(`${lit.line}行目 「${lit.raw}」= ${c.what}`);
  }
}
check("セリフが、読む人を決めつけたり行動を促したりしていない"
  + `（文字列 ${SPOKEN.length} 本 × 形 ${CALLOUT.length} 通りを見た）`,
  callouts.length === 0,
  `呼びかけの形が ${callouts.length} 件: ${callouts.join(" / ")}`
    + "。島にある物事を「こうなっているよ」と言う形に直す（chatter.ts の決まり8）");

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
