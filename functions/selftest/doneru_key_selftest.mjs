/**
 * Doneru の鍵の読みかたと、**引けなかったときに黙って 0円 を出さないこと**の
 * 確かめ（#639）。**偽の値だけで回す。**
 *
 * ## 何を守っているか
 *
 * 豚の貯金箱の合計には、Doneru の累計（いま 194,820円）が丸ごと入っている。
 * **鍵が1つ引けないだけで、そのぶんが合計から落ちる。** 落ちたあとの合計は
 * 負の数（起点がマイナスなので）になるので、**そこで止めないと**
 *
 *   - 島の足代が「0円」に見える（`docs/island-standards.md` 10章。
 *     読めていないことを、値0と同じ絵にしない）
 *   - 配信の豚が 0円 から数え直す
 *
 * のどちらかが起きる。ここで見るのは3つ。
 *
 *   1. **新しい置き場（`islandFundConfig/doneru`）から鍵が読める**
 *   2. **鍵が読めないときに、黙って 0円 を返さない**（`GET /fund` も
 *      `GET /alertbox/{合言葉}/fund` も 503）
 *   3. **32桁の16進でないものは通さない**（書類の側も、環境変数の側も）
 *
 * ## なぜ `islandApi.ts` から直に読まないか
 *
 * `import` すると読み込んだだけで `admin.initializeApp()` まで走る。
 * 本番の資格情報はこの箱に無いので、**確かめたいのは判定だけなのに落ちる。**
 * かわりに `tsc` が書き出した `lib/islandApi.js` から区画を切り出して動かす
 * （`fund_superchat_selftest.mjs` と同じ手）。**写しを持たない**——
 * 写しを置くと、本体を直したのに確かめが古いまま通る。
 *
 * ## 対照（`docs/island-standards.md` §15）
 *
 * **守りを1本ずつ外して、その足だけが落ちることまで見る。**
 * 外したのに何も落ちなければ、**その守りは最初から効いていない。**
 *
 * | `BREAK=` | 何を外すか | 落ちるはずのもの |
 * | --- | --- | --- |
 * | `noshape` | 書類に入っている鍵の形を見ない | 32桁の16進でない鍵は通さない |
 * | `noenvshape` | 環境変数の鍵の形を見ない | 環境変数の半端な鍵は通さない |
 * | `nokey` | 鍵が空でも Doneru を叩きに行く | 鍵が無ければ Doneru を叩かない |
 * | `zero` | Doneru が読めない回に 0 を返す | `/fund` は 503・豚の口も 503 |
 * | `oldgoal` | `/fund` のバーの高さを旧い書類へ落とす | 台帳の目標だけがバーの高さになる |
 * | `oldgoalab` | 豚の高さを旧い書類へ落とす | 同上（豚の口） |
 *
 * 終了コード 0=通った / 1=落ちた / **2=数えるものが無い**（切り出せなかった・
 * 対照が効かなかった）。
 *
 * 回しかた:
 *
 * ```bash
 * node functions/selftest/doneru_key_selftest.mjs
 * ```
 */

import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FUNCTIONS = join(HERE, "..");

/** 数えるものが無い（切り出せない・対照が効かない）で出るときの終了コード */
const NOTHING = 2;

/**
 * 数えるものが無いまま終わる。**数字を1つも出さずに落ちる。**
 * @param {string} why 何が無かったか
 */
function nothing(why) {
  console.error(`数えるものが無い: ${why}`);
  process.exit(NOTHING);
}

/* ---------------- 本体を切り出す ---------------- */

console.log("# tsc を回して、いまの src から切り出す");
execFileSync(join(FUNCTIONS, "node_modules/.bin/tsc"), {cwd: FUNCTIONS});
const js = readFileSync(join(FUNCTIONS, "lib/islandApi.js"), "utf8");

/**
 * 書き出した JS から、2つの目印にはさまれたところを切り出す。
 * @param {string} from 始まりの目印
 * @param {string} to 終わりの目印
 * @return {string} 切り出した字
 */
function slice(from, to) {
  const a = js.indexOf(from);
  const b = js.indexOf(to, a + 1);
  /* 切り出しが空振りしたら、**中身を見ずに通してはいけない。**
     関数の名前を変えた日に「0件だから合格」と出るのがいちばん危ない。 */
  if (a < 0 || b < 0 || b <= a) nothing(`lib/islandApi.js に ${from} … ${to} が無い`);
  return js.slice(a, b);
}

// 鍵を読むところ。**`db` と `logger` を外から渡す**
const KEY = slice("const DONERU_KEY_DOC = ", "const MAX_NOTE_LEN = 120;");
// Doneru を叩くところ
const NOW = slice("async function doneruNow() {", "function doneruStaleDay(");
// 台帳の焼き直しを読むところ（`/fund` と豚の口の両方が使う）
const BOX = slice("const boxOf = (v) => {", "async function fetchHandle(");
// `GET /fund`
const FUND = slice(
  'if (method === "GET" && path === "/fund") {',
  'if (method === "GET" && path === "/fund/history") {',
);
// `GET /alertbox/{合言葉}/fund`
const ABFUND = slice("const abFund = path.match(", "const rlOne = path.match(");

for (const [name, src, wants] of [
  ["KEY", KEY, ["DONERU_KEY_DOC", "DONERU_KEY", "doneruKeyOnly", "keyCache"]],
  ["NOW", NOW, ["doneruKeyOnly", "DONERU_GOAL", "fundCache"]],
  ["BOX", BOX, ["goalYen", "goalLabel"]],
  ["FUND", FUND, ["boxOf", "doneruNow", "503"]],
  ["ABFUND", ABFUND, ["boxOf", "targetAmount", "503"]],
]) {
  for (const want of wants) {
    if (!src.includes(want)) nothing(`切り出した ${name} に ${want} が無い`);
  }
}
/* **旧い書類を、もうどこも読んでいないこと。** ここが残っていると
   「鍵を移した」と言いながら、片方で古い書類を読み続ける形になる。 */
if (js.includes('collection("islandGoal")')) {
  nothing("lib/islandApi.js がまだ islandGoal を読んでいる");
}
console.log(
  `  切り出した長さ: key ${KEY.length} / now ${NOW.length} / box ${BOX.length}` +
  ` / fund ${FUND.length} / abfund ${ABFUND.length} 字\n`,
);

/* ---------------- 守りを外す（対照） ---------------- */

/* `BREAK=` の名前 → どこをどう外すか。**当たらなければ 2 で落ちる。**

   **書き出したあとの字に当てる。** tsc は `??` をほどくので、
   src の見た目でそのまま書くと当たらない。 */
const BREAKS = {
  noshape: ["KEY", /if \(!DONERU_KEY\.test\(k\)\) \{/, "if (false) {"],
  noenvshape: ["KEY", /if \(DONERU_KEY\.test\(env\)\)\s*\n?\s*return env;/, "return env;"],
  nokey: ["NOW", /if \(!key\)\s*\n?\s*return null;/, ""],
  /* **昔ここで踏んだ形の裏返し。** 読めなかったぶんを 0 で埋めると、
     合計は起点のマイナスぶんだけ減った数で 200 を返す。 */
  zero: ["NOW", /return \(_a = fundCache[\s\S]*?: null;/, "return 0;"],
  /* **旧い書類（`islandGoal` の `targetAmount`）へ落ちていたころの形。**
     凍った数字を控えとして持つと、台帳の目標が空いた日にそれが勝つ。 */
  oldgoal: [
    "FUND",
    /goal: b \? b\.goalYen : 0,/,
    "goal: b && b.goalYen > 0 ? b.goalYen : 999999,",
  ],
  oldgoalab: [
    "ABFUND",
    /targetAmount: b\.goalYen,/,
    "targetAmount: b.goalYen > 0 ? b.goalYen : 999999,",
  ],
};

/**
 * 切り出した字に、守りを外す細工を当てる。
 * @param {Set<string>} breaks 外すものの名前
 * @return {{key: string; now: string; fund: string; abfund: string}} 当てたあとの字
 */
function damaged(breaks) {
  const out = {key: KEY, now: NOW, fund: FUND, abfund: ABFUND};
  const slot = {KEY: "key", NOW: "now", FUND: "fund", ABFUND: "abfund"};
  for (const name of breaks) {
    const [where, re, to] = BREAKS[name];
    const k = slot[where];
    const after = out[k].replace(re, to);
    /* **当たらなかった細工を、黙って見逃さない。** 当たらなければ対照は
       「壊していない字」を測ることになり、何を外しても通ってしまう。 */
    if (after === out[k]) nothing(`BREAK=${name} が当たらなかった（${where}）`);
    out[k] = after;
  }
  return out;
}

/* ---------------- 偽の値 ---------------- */

/** 32桁の16進。**本物ではない。** 形だけ本物に寄せてある */
const GOOD_KEY = "0123456789abcdef0123456789abcdef";
/** 形の違う鍵。**4通りとも別の外れ方**（短い・大文字・長い・空白） */
const BAD_KEYS = [
  "0123456789abcdef0123456789abcde",
  "0123456789ABCDEF0123456789ABCDEF",
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "0123456789abcdef 123456789abcdef",
];
/** Doneru の累計（本番の 194,820円 にあたるところ） */
const DONERU = 194820;
/** 台帳の焼き直し。**本番と同じ形**（起点は負の数） */
const BOX_VALUE = {
  superchat: 147096,
  start: -255406,
  goal: {yen: 50000, label: "北欧周りたい"},
};
/** 本番の合計。`DONERU + superchat + start` */
const TOTAL = DONERU + BOX_VALUE.superchat + BOX_VALUE.start;

/** ログに出たものを全部ためる。**鍵が混ざっていないか**を最後に見る */
let logged = [];
const logger = {
  warn: (...a) => logged.push(a.join(" ")),
  info: (...a) => logged.push(a.join(" ")),
  error: (...a) => logged.push(a.join(" ")),
};

/**
 * `islandFundConfig/doneru` の代わり。**何回引かれたかを数える。**
 * @param {string | null} key 入っている鍵。null なら書類が無い
 * @param {boolean} boom 引くと落ちるか
 * @return {{db: object; hits: () => number}} 偽の db と、引かれた回数
 */
function fakeDb(key, boom = false) {
  let hits = 0;
  const db = {
    collection: (name) => ({
      doc: () => ({
        get: async () => {
          if (name === "islandFundConfig") {
            hits += 1;
            if (boom) throw new Error("にせもの: 引けない");
            return {
              exists: key !== null,
              data: () => (key === null ? {} : {goalKey: key}),
            };
          }
          // islandDoneruHealth。**止まっていない日の姿**
          return {exists: false, data: () => ({})};
        },
      }),
    }),
  };
  return {db, hits: () => hits};
}

/**
 * Doneru の口の代わり。**何回叩かれたかを数える。**
 * @param {number | null} amount 返す額。null なら落ちる
 * @return {{fetch: Function; hits: () => number}} 偽の fetch と、叩かれた回数
 */
function fakeFetch(amount) {
  let hits = 0;
  const f = async () => {
    hits += 1;
    if (amount === null) throw new Error("にせもの: 届かない");
    return {ok: true, json: async () => ({amount})};
  };
  return {fetch: f, hits: () => hits};
}

/** `res` の代わり。**最後に何を返したか**だけ覚える */
function fakeRes() {
  const seen = {status: 200, body: null};
  const res = {
    set: () => res,
    status: (n) => {
      seen.status = n;
      return res;
    },
    json: (v) => {
      seen.body = v;
      return res;
    },
  };
  return {res, seen};
}

/* ---------------- 1回ぶん回す ---------------- */

/**
 * 守りを外した／外していない字を組み立てて、確かめを全部回す。
 * @param {Set<string>} breaks 外すものの名前
 * @return {Promise<Map<string, boolean>>} 確かめの名前 → 通ったか
 */
async function run(breaks) {
  const {key, now, fund, abfund} = damaged(breaks);
  const out = new Map();
  /**
   * 1件の確かめ。
   * @param {string} name 何を見ているか
   * @param {boolean} ok 通ったか
   */
  const check = (name, ok) => out.set(name, ok);

  /**
   * 鍵まわりを1式こしらえる。**呼ぶたびに真っさらな入れ物**
   * （キャッシュが前の場面から漏れると、何を測っているか分からなくなる）。
   * @param {string | null} stored 書類に入っている鍵
   * @param {number | null} amount Doneru が返す額
   * @param {string} env 環境変数の鍵
   * @param {boolean} boom 書類を引くと落ちるか
   * @return {object} 動かせる関数と、叩かれた回数
   */
  const build = (stored, amount, env = "", boom = false) => {
    const d = fakeDb(stored, boom);
    const n = fakeFetch(amount);
    const box = new Function(
      "db", "firebase_functions_1", "process", "fetch", "AbortController",
      "setTimeout", "DONERU_GOAL",
      `${key}\n${now}\n${BOX}\nreturn {doneruKeyOnly, doneruNow, boxOf,` +
      ` DONERU_KEY, doneruAsOf: async () => null, STATE_DOC: null};`,
    )(
      d.db, {logger}, {env: {DONERU_GOAL_KEY: env}}, n.fetch,
      AbortController, setTimeout, "https://example.invalid/goal",
    );
    return {...box, dbHits: d.hits, netHits: n.hits};
  };

  /**
   * `GET /fund` を1回ぶん動かす。
   * @param {object} b 組み立てたもの
   * @param {unknown} boxValue `island/state.fund.box` に入っている値
   * @return {Promise<object>} 返ってきた status と body
   */
  const getFund = async (b, boxValue) => {
    const {res, seen} = fakeRes();
    const snap = {
      exists: true,
      data: () => ({fund: {box: boxValue, people: 58}}),
    };
    await new Function(
      "doneruNow", "STATE_DOC", "doneruAsOf", "boxOf", "res", "method", "path",
      `return (async () => { ${fund} })();`,
    )(
      b.doneruNow, {get: async () => snap}, b.doneruAsOf, b.boxOf,
      res, "GET", "/fund",
    );
    return seen;
  };

  /* --- 1. 新しい置き場から鍵が読める --- */
  {
    const b = build(GOOD_KEY, DONERU);
    check("新しい置き場から鍵が読める", (await b.doneruKeyOnly()) === GOOD_KEY);
    check("その鍵で Doneru の額が引ける", (await b.doneruNow()) === DONERU);
  }

  /* --- 2. 形の違うものは通さない（書類の側） --- */
  {
    let allBad = true;
    for (const bad of BAD_KEYS) {
      const b = build(bad, DONERU);
      if ((await b.doneruKeyOnly()) !== "") allBad = false;
      // 形が違えば Doneru を1回も叩かない
      if (b.netHits() !== 0) allBad = false;
    }
    check("32桁の16進でない鍵は通さない", allBad);
  }

  /* --- 3. 形の違うものは通さない（環境変数の側） --- */
  {
    let allBad = true;
    for (const bad of BAD_KEYS) {
      const b = build(null, DONERU, bad);
      if ((await b.doneruKeyOnly()) !== "") allBad = false;
    }
    check("環境変数の半端な鍵は通さない", allBad);
    const b = build(null, DONERU, GOOD_KEY);
    check("環境変数の正しい鍵は通る", (await b.doneruKeyOnly()) === GOOD_KEY);
  }

  /* --- 4. 鍵が無ければ Doneru を叩かない --- */
  {
    const b = build(null, DONERU);
    check("鍵が無ければ Doneru の額は null", (await b.doneruNow()) === null);
    check("鍵が無ければ Doneru を叩かない", b.netHits() === 0);
  }

  /* --- 5. 引けなかったときに、黙って 0円 を返さない --- */
  {
    const ok = await getFund(build(GOOD_KEY, DONERU), BOX_VALUE);
    check("ふだんは 200 で本番と同じ合計", ok.status === 200 && ok.body.total === TOTAL);

    // 鍵が無い（書類が消えた）
    const gone = await getFund(build(null, DONERU), BOX_VALUE);
    check("鍵が引けない回は 503（0円で 200 を返さない）", gone.status === 503);
    // 書類そのものが読めない
    const boom = await getFund(build(null, DONERU, "", true), BOX_VALUE);
    check("書類が読めない回も 503", boom.status === 503);
    // 形の違う鍵が入っていた
    const bad = await getFund(build(BAD_KEYS[0], DONERU), BOX_VALUE);
    check("形の違う鍵が入っていた回も 503", bad.status === 503);
    // Doneru そのものが落ちている
    const down = await getFund(build(GOOD_KEY, null), BOX_VALUE);
    check("Doneru が落ちている回も 503", down.status === 503);
  }

  /* --- 6. バーの高さは台帳の目標だけから来る（旧い書類へ落ちない） --- */
  {
    const has = await getFund(build(GOOD_KEY, DONERU), BOX_VALUE);
    check("バーの高さは台帳の目標", has.body && has.body.goal === 50000);
    const none = await getFund(
      build(GOOD_KEY, DONERU),
      {...BOX_VALUE, goal: null},
    );
    check(
      "台帳に目標が無ければ 0（旧い書類へ落ちない）",
      none.status === 200 && none.body.goal === 0,
    );
  }

  /* --- 7. 豚の口（`GET /alertbox/{合言葉}/fund`） --- */
  {
    /**
     * 豚の口を1回ぶん動かす。
     * @param {object} b 組み立てたもの
     * @param {unknown} boxValue `island/state.fund.box` に入っている値
     * @return {Promise<object>} 返ってきた status と body
     */
    const getAb = async (b, boxValue) => {
      const {res, seen} = fakeRes();
      const snap = {exists: true, data: () => ({fund: {box: boxValue}})};
      await new Function(
        "doneruNow", "STATE_DOC", "boxOf", "alertboxExists",
        "firebase_functions_1", "res", "method", "path",
        `return (async () => { ${abfund} })();`,
      )(
        b.doneruNow, {get: async () => snap}, b.boxOf, async () => true,
        {logger}, res, "GET", "/alertbox/0123456789abcdef0123456789abcdef/fund",
      );
      return seen;
    };
    const ok = await getAb(build(GOOD_KEY, DONERU), BOX_VALUE);
    check(
      "豚は本番と同じ額と高さを受け取る",
      ok.status === 200 && ok.body.currentAmount === TOTAL &&
        ok.body.targetAmount === 50000,
    );
    const gone = await getAb(build(null, DONERU), BOX_VALUE);
    check("鍵が引けない回、豚の口も 503", gone.status === 503);
    /* **Doneru が落ちている回。** ここが `/fund` と違う。あちらは合計が
       負になるので「0円」に落ちても結局 503 になるが、**豚の口は
       `doneru === null` しか見ていない。** 0 を作ると 200 で負の額を返す。 */
    const down = await getAb(build(GOOD_KEY, null), BOX_VALUE);
    check("Doneru が落ちている回、豚の口も 503", down.status === 503);
    const nogoal = await getAb(
      build(GOOD_KEY, DONERU),
      {...BOX_VALUE, goal: null},
    );
    check(
      "台帳に目標が無ければ豚の高さも 0（旧い書類へ落ちない）",
      nogoal.status === 200 && nogoal.body.targetAmount === 0,
    );
  }

  return out;
}

/* ---------------- 回す ---------------- */

/** 落ちたものの数。1つでもあれば終了コード1 */
let bad = 0;

console.log("# 1. 壊していない字が、全部通ること（先に見る）");
logged = [];
const base = await run(new Set());
for (const [name, ok] of base) {
  console.log(`  ${ok ? "ok  " : "NG  "} ${name}`);
  if (!ok) bad += 1;
}
/* **鍵がログに1文字も出ないこと。** このリポジトリは公開で、
   Actions のログも誰でも読める（`CLAUDE.md`）。 */
const leaked = [GOOD_KEY, ...BAD_KEYS].filter((k) => logged.join("\n").includes(k));
console.log(`  ${leaked.length === 0 ? "ok  " : "NG  "} 鍵の値が1文字もログに出ない`);
if (leaked.length) bad += 1;
console.log(`  見た確かめ: ${base.size + 1}件（ログの行 ${logged.length}）`);
if (base.size < 17) nothing(`確かめが ${base.size}件しか無い`);
if (bad) {
  console.error("\n壊していない字が落ちた。対照はここで止める");
  process.exit(1);
}

/** どの細工が、どの足を折るか。**1つの細工が折ってよいのはここに書いた足だけ。** */
const EXPECT = {
  noshape: ["32桁の16進でない鍵は通さない", "形の違う鍵が入っていた回も 503"],
  noenvshape: ["環境変数の半端な鍵は通さない"],
  /* 鍵が空のまま叩きに行くと、**鍵の要らない先から額が返ってきたことに
     なる。** 鍵が引けない場面が全部 200 に化けるので、折れる足も全部。 */
  nokey: [
    "鍵が無ければ Doneru の額は null",
    "鍵が無ければ Doneru を叩かない",
    "鍵が引けない回は 503（0円で 200 を返さない）",
    "書類が読めない回も 503",
    "形の違う鍵が入っていた回も 503",
    "鍵が引けない回、豚の口も 503",
  ],
  /* **`/fund` はここでは落ちない。** 0 を作っても合計が負になって
     結局 503 を返すから。落ちるのは豚の口だけ——あちらは
     `doneru === null` しか見ていないので、0 が 200 で通ってしまう。 */
  zero: ["Doneru が落ちている回、豚の口も 503"],
  oldgoal: ["台帳に目標が無ければ 0（旧い書類へ落ちない）"],
  oldgoalab: ["台帳に目標が無ければ豚の高さも 0（旧い書類へ落ちない）"],
};

console.log("\n# 2. 守りを1本ずつ外すと、その足だけが落ちること");
for (const [name, want] of Object.entries(EXPECT)) {
  logged = [];
  const got = [...(await run(new Set([name])))]
    .filter(([, ok]) => !ok)
    .map(([k]) => k)
    .sort();
  /* **外したのに1本も落ちなければ、その守りは最初から効いていない。**
     それは「落ちた」ではなく**数えるものが無い**（`docs/island-standards.md` §15）。 */
  if (got.length === 0) nothing(`BREAK=${name} を当てても1本も落ちない`);
  const ok = JSON.stringify(got) === JSON.stringify([...want].sort());
  console.log(
    `  ${ok ? "ok  " : "NG  "} BREAK=${name} → 落ちたのは [${got.join(" / ")}]`,
  );
  if (!ok) bad += 1;
}

console.log(bad ? `\nNG ${bad}件` : "\nぜんぶ通った");
process.exit(bad ? 1 : 0);
