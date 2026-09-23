/**
 * `POST /island-api/alertbox/{合言葉}/superchat` の確かめ。**偽の値だけで回す。**
 *
 * ## 何を守っているか
 *
 * 豚の貯金箱に入るスパチャの、**書き込む側の関所**。ここが緩むと額が狂う。
 * 狂い方は静かで、**画面は 200 を返し続ける。**
 *
 *   - 同じスパチャが2件になる（書類IDが中身から決まらなくなったとき）
 *   - 出ていないお金が入る（通知のテスト）
 *   - 円しか足さない仕組みに外貨が混ざる
 *   - 合言葉を知らない人が、他人の貯金箱に書き足す
 *
 * ## なぜ本番のデータを引かないか
 *
 * このリポジトリは公開で、Actions のログも誰でも読める。仕込んだ値
 * （`にせもの` と、`python/fund_box.py` の頭に既に書いてある item id）しか出さない。
 *
 * ## なぜ `islandApi.ts` から直に読まないか
 *
 * `import` すると読み込んだだけで `admin.initializeApp()` まで走る。
 * 本番の資格情報はこの箱に無いので、**確かめたいのは判定だけなのに落ちる。**
 * かわりに `tsc` が書き出した `lib/islandApi.js` から3つの区画を切り出して動かす
 * （`clean_selftest.mjs` と同じ手）。**写しを持たない**——写しを置くと、
 * 本体を直したのに確かめが古いまま通る。
 *
 * ## 対照（`docs/island-standards.md` §15）
 *
 * **守りを1本ずつ外して、その足だけが落ちることまで見る。**
 * 「壊し方を7通り当てた」が同じ足を折っているだけ、では対照にならない。
 * 外したのに何も落ちなければ、**その守りは最初から効いていない。**
 *
 * | `BREAK=` | 何を外すか | 落ちるはずのもの |
 * | --- | --- | --- |
 * | `notest` | 通知のテストを見ない | test: true は入らない |
 * | `nocurrency` | 通貨を見ない | 円以外は入らない |
 * | `noyen` | 額を見ない | 0円以下は入らない |
 * | `noshape` | 26文字の形を見ない | ほどけないIDは入らない |
 * | `nonce` | 書類IDに時刻を混ぜる | 2回投げても件数／合計が動かない |
 * | `noguard` | 32桁の形を見ずに引きに行く | 32桁でなければ Firestore を引かない |
 * | `noexists` | 登録されているかを見ない | 偽物の合言葉は通らない |
 *
 * 終了コード 0=通った / 1=落ちた / **2=数えるものが無い**（切り出せなかった・
 * 対照が効かなかった）。
 *
 * 回しかた:
 *
 * ```bash
 * node functions/selftest/fund_superchat_selftest.mjs
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
  const b = js.indexOf(to);
  /* 切り出しが空振りしたら、**中身を見ずに通してはいけない。**
     関数の名前を変えた日に「0件だから合格」と出るのがいちばん危ない。 */
  if (a < 0 || b < 0 || b <= a) nothing(`lib/islandApi.js に ${from} … ${to} が無い`);
  return js.slice(a, b);
}

// `clean`（名前を整えるところ）。`fundChatOf` が呼んでいる
const CLEAN = slice("const dropCtrl = ", "const handleOf = ");
// 台帳に入れる側。**あいだに別のものを挟まない**ことが、ここに書いてある前提
const FUND = slice("const handleOf = ", "async function fetchHandle(");
// 合言葉の関所
const GUARD = slice("const ALERTBOX_ID = ", "const photoUrl = ");

const hm = /const MAX_HANDLE_LEN = (\d+);/.exec(js);
if (!hm) nothing("MAX_HANDLE_LEN が見つからない");
const MAX_HANDLE_LEN = Number(hm[1]);

for (const [name, src] of [["FUND", FUND], ["GUARD", GUARD]]) {
  for (const want of name === "FUND" ?
    ["FUND_ITEM_ID", "FUND_YEN", "itemIdFromLcc", "fundChatOf", "boxOf"] :
    ["ALERTBOX_ID", "alertboxExists"]) {
    if (!src.includes(want)) nothing(`切り出した ${name} に ${want} が無い`);
  }
}
console.log(`  切り出した長さ: clean ${CLEAN.length} / fund ${FUND.length} / guard ${GUARD.length} 字\n`);

/* ---------------- 守りを外す（対照） ---------------- */

/* `BREAK=` の名前 → どこをどう外すか。**当たらなければ 2 で落ちる。**

   **書き出したあとの字に当てる。** tsc は `??` をほどく（`b.currency ?? ""` が
   `(_a = b.currency) !== null && _a !== void 0 ? _a : ""` になる）ので、
   src の見た目でそのまま書くと当たらない。当たらなければ 2 で落ちるので、
   黙って素通りはしない——1回目はそれで落ちた。 */
const BREAKS = {
  notest: ["FUND", /if \(b\.test === true\)\s*return null;/, ""],
  nocurrency: [
    "FUND",
    /if \(!FUND_YEN\.has\([\s\S]*?\)\)\s*return null;/,
    "",
  ],
  noyen: [
    "FUND",
    /if \(!Number\.isFinite\(yen\) \|\| yen <= 0\)\s*return null;/,
    "",
  ],
  noshape: [
    "FUND",
    /return FUND_ITEM_ID\.test\(tail\) \? tail : "";/,
    "return tail;",
  ],
  /* **昔ここで踏んだ形。** 書き込み先が表だったころ、IDの取れない通知には
     `unknown-${Date.now()}` を振っていた。同じ通知が2回来れば2件になる。 */
  nonce: ["FUND", /return \{\s*doc,/, "return {\n        doc: doc + String(now),"],
  noguard: [
    "GUARD",
    /if \(!ALERTBOX_ID\.test\(id\)\)\s*return false;/,
    "",
  ],
  noexists: ["GUARD", /return !q\.empty;/, "return true;"],
};

/**
 * 切り出した字に、守りを外す細工を当てる。
 * @param {Set<string>} breaks 外すものの名前
 * @return {{fund: string; guard: string}} 当てたあとの字
 */
function damaged(breaks) {
  let fund = FUND;
  let guard = GUARD;
  for (const name of breaks) {
    const [where, re, to] = BREAKS[name];
    const before = where === "FUND" ? fund : guard;
    const after = before.replace(re, to);
    /* **当たらなかった細工を、黙って見逃さない。** 当たらなければ対照は
       「壊していない字」を測ることになり、何を外しても通ってしまう。 */
    if (after === before) nothing(`BREAK=${name} が当たらなかった（${where}）`);
    if (where === "FUND") fund = after;
    else guard = after;
  }
  return {fund, guard};
}

/* ---------------- 偽の Firestore ---------------- */

/** 名簿に入れてある合言葉。**32桁の形をしているが、これは偽物。** */
const REAL_ID = "0123456789abcdef0123456789abcdef";
/** 32桁だが名簿に無い合言葉 */
const FAKE_ID = "fedcba9876543210fedcba9876543210";

/**
 * `USERS` の代わり。**何回引かれたかを数える。**
 * @return {{coll: object; hits: () => number}} 偽の入れ物と、引かれた回数
 */
function fakeUsers() {
  let hits = 0;
  const coll = {
    where(field, op, value) {
      hits += 1;
      return {
        limit: () => ({
          get: async () => ({
            empty: !(field === "alertboxId" && op === "==" && value === REAL_ID),
            docs: [{data: () => ({doneruKey: "にせもの"})}],
          }),
        }),
      };
    },
  };
  return {coll, hits: () => hits};
}

/* ---------------- 仕込む値 ---------------- */

/* BigQuery の `event_id`（base64）。**`python/fund_box.py` の頭に既に
   書いてあるのと同じ1件**で、そこから 26文字の item id が出る。
   ここに新しく本番の値を持ち込んではいない。 */
const BQ_EVENT_ID = "ChwKGkNLUGpxc1NEOEpFREZjekF3Z1FkT0swNEl3";
/** 上と同じ中身を、アラートボックスの包み方（`LCC.` + base64url）にしたもの */
const LCC_ID =
  "LCC." + Buffer.from(BQ_EVENT_ID, "base64").toString("base64url");

/**
 * BigQuery 側のほどきかた（`python/fund_box.py` の `item_id_from_event`）。
 * **本体とは別に、ここで組む。** 同じ関数を両側から呼ぶと、
 * 片方が壊れても一致してしまう。
 * @param {string} v base64
 * @return {string} 26文字。ほどけなければ空文字
 */
function itemIdFromEvent(v) {
  const tail = Buffer.from(v, "base64").subarray(-26).toString("latin1");
  return /^[A-Za-z0-9_-]{26}$/.test(tail) ? tail : "";
}

/** 円の1件。**これが入る側。** */
const YEN = {
  id: LCC_ID,
  currency: "円",
  jpy: 500,
  nickname: "にせもの",
  test: false,
};

/* ---------------- 1回ぶん回す ---------------- */

/**
 * 守りを外した／外していない字で、確かめを全部回す。
 * @param {Set<string>} breaks 外すものの名前
 * @return {Promise<Map<string, boolean>>} 確かめの名前 → 通ったか
 */
async function run(breaks) {
  const {fund, guard} = damaged(breaks);
  const {fundChatOf, itemIdFromLcc} = new Function(
    "MAX_HANDLE_LEN",
    `${CLEAN}\n${fund}\nreturn {fundChatOf, itemIdFromLcc};`,
  )(MAX_HANDLE_LEN);
  const users = fakeUsers();
  const {alertboxExists} = new Function(
    "USERS",
    `${guard}\nreturn {alertboxExists};`,
  )(users.coll);

  const out = new Map();
  /**
   * 1件の確かめ。
   * @param {string} name 何を見ているか
   * @param {boolean} ok 通ったか
   */
  const check = (name, ok) => out.set(name, ok);

  /* --- 台帳の代わり。**書類IDで上書きする**ところだけ真似る --- */
  const store = new Map();
  /**
   * 1件入れてみる。
   * @param {object} body 本文
   * @param {number} now いまの時刻（ミリ秒）
   * @return {boolean} 入ったか
   */
  const post = (body, now) => {
    const one = fundChatOf(body, now);
    if (!one) return false;
    store.set(one.doc, {...(store.get(one.doc) ?? {}), ...one.rec});
    return true;
  };
  /** いまの件数と合計 */
  const sums = () => [
    store.size,
    [...store.values()].reduce((a, v) => a + Number(v.yen || 0), 0),
  ];

  // 1. 同じ item id を2回投げても増えない（**時刻を変えて投げる**）
  post(YEN, 1_700_000_000_000);
  const [n1, y1] = sums();
  post(YEN, 1_700_000_600_000);
  const [n2, y2] = sums();
  check("同じ item id を2回投げても件数が動かない", n1 === 1 && n2 === 1);
  check("同じ item id を2回投げても合計が動かない", y1 === 500 && y2 === 500);

  // 2. `LCC.` と BigQuery の base64 が、同じ26文字に着く
  const a = itemIdFromLcc(LCC_ID);
  const b = itemIdFromEvent(BQ_EVENT_ID);
  check(
    "LCC. と BigQuery の base64 が同じ26文字に着く",
    a.length === 26 && a === b,
  );

  // 3. 入れてはいけないもの
  check("円以外は入らない", !post({...YEN, currency: "CA$"}, 1));
  check("test: true は入らない", !post({...YEN, test: true}, 1));
  check(
    "0円以下は入らない",
    !post({...YEN, jpy: 0}, 1) && !post({...YEN, jpy: -100}, 1),
  );
  /* ほどけないID。**3通りとも別の落ち方をする。**
       1. `LCC.` で始まらない（表に書いていたころの `unknown-…` がこれ）
       2. ほどけるが 26文字に足りない
       3. 26文字だが、item id に使わない字（空白）が混ざっている
     3 を入れておかないと、26文字の**形**を見ている行を外しても落ちない。 */
  const SHORT = "LCC." + Buffer.from("にせもの").toString("base64url");
  const WIDE =
    "LCC." + Buffer.from("aaaaaaaaaaaaaaaaaaaaaaaaa ").toString("base64url");
  check(
    "ほどけないIDは入らない",
    !post({...YEN, id: "unknown-1"}, 1) &&
      !post({...YEN, id: SHORT}, 1) &&
      !post({...YEN, id: WIDE}, 1),
  );

  // 4. 合言葉。**本物と偽物の両方を走らせる**
  check("本物の合言葉は通る", (await alertboxExists(REAL_ID)) === true);
  check("偽物の合言葉は通らない", (await alertboxExists(FAKE_ID)) === false);
  const before = users.hits();
  await alertboxExists("0123456789abcdef0123456789abcde");
  await alertboxExists("0123456789ABCDEF0123456789ABCDEF");
  check("32桁でない合言葉では Firestore を引かない", users.hits() === before);

  return out;
}

/* ---------------- 回す ---------------- */

/** 落ちたものの数。1つでもあれば終了コード1 */
let bad = 0;

console.log("# 1. 壊していない字が、全部通ること（先に見る）");
const base = await run(new Set());
for (const [name, ok] of base) {
  console.log(`  ${ok ? "ok  " : "NG  "} ${name}`);
  if (!ok) bad += 1;
}
console.log(`  見た確かめ: ${base.size}件`);
if (base.size < 10) nothing(`確かめが ${base.size}件しか無い`);
if (bad) {
  console.error("\n壊していない字が落ちた。対照はここで止める");
  process.exit(1);
}

/** どの細工が、どの足を折るか。**1つの細工が折ってよいのはここに書いた足だけ。** */
const EXPECT = {
  notest: ["test: true は入らない"],
  nocurrency: ["円以外は入らない"],
  noyen: ["0円以下は入らない"],
  noshape: ["ほどけないIDは入らない"],
  nonce: [
    "同じ item id を2回投げても件数が動かない",
    "同じ item id を2回投げても合計が動かない",
  ],
  noguard: ["32桁でない合言葉では Firestore を引かない"],
  noexists: ["偽物の合言葉は通らない"],
};

console.log("\n# 2. 守りを1本ずつ外すと、その足だけが落ちること");
for (const [name, want] of Object.entries(EXPECT)) {
  const got = [...(await run(new Set([name])))]
    .filter(([, ok]) => !ok)
    .map(([k]) => k)
    .sort();
  /* **外したのに1本も落ちなければ、その守りは最初から効いていない。**
     それは「落ちた」ではなく**数えるものが無い**（`docs/island-standards.md` §15）。
     終了コードを分けないと、守りの無い口が「ぜんぶ通った」に化ける。 */
  if (got.length === 0) nothing(`BREAK=${name} を当てても1本も落ちない`);
  const ok = JSON.stringify(got) === JSON.stringify([...want].sort());
  console.log(
    `  ${ok ? "ok  " : "NG  "} BREAK=${name} → 落ちたのは [${got.join(" / ")}]`,
  );
  if (!ok) bad += 1;
}

console.log(bad ? `\nNG ${bad}件` : "\nぜんぶ通った");
process.exit(bad ? 1 : 0);
