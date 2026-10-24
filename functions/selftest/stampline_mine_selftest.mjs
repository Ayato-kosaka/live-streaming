/**
 * `/stampline/mine` が**閉じていること**の確かめ(#716 → #860)。
 * **偽のチャンネルと偽の字だけで回す。**
 *
 * ## 何を見ているか
 *
 * LINE スタンプは 2026-10-13 に申請し、もう書き直しても入らない。
 * あやとの決定(#860)で `/me` の欄を全員から消し、口も閉じた。
 * ここが見るのは、**口に直接送っても書けないこと**。
 *
 *   1. `GET` も `POST` も 410 を返す。**誰が送っても同じ返事**
 *      （選ばれた人・外した人・選ばれていない人・チャンネルの無い人・未ログイン）
 *   2. **入れ物（`islandStampLine`）に1バイトも書かない。読みもしない。**
 *      書類は記録として残すので、消してもいけない
 *   3. 閉じた返事も中間に置かせない（`Cache-Control: no-store`）
 *   4. ほかのパス・ほかの動詞は扱わない（下の口へ落ちる）
 *
 * 返事が人によって変わると、閉じたあとも「誰が選ばれたか」が
 * 口から割れる（選ばれかたは投げ銭の順位そのもの。`docs/island-money.md`）。
 * だから 1 は「410 であること」だけでなく、**返事が全員ぶん同じ字であること**を見る。
 *
 * ## なぜ口（`islandApi.ts`）から叩かないか
 *
 * `islandApi.ts` を読み込むと `onRequest` の登録まで走るし、本番の資格情報は
 * この箱に無い。かわりに `tsc` が書き出した `lib/stampLine.js` を、**偽の
 * firebase-admin を渡して**読み込む。写しは持たない（写しを置くと、本体を
 * 直したのに確かめが古いまま通る）。
 *
 * ## 対照（`docs/island-standards.md` §13）
 *
 * 「書かなかった」は、**書いたことを数える仕掛けが壊れていても0件**になる。
 * だから先に、偽の Firestore に**わざと1件書いて、数に出ること**を見てから
 * 本体を叩く。「410 を返した」も、**何にでも 410 を返す口**なら通るので、
 * 4 で「扱わない道」を両側から当てる。
 *
 * 回しかた:
 *
 * ```bash
 * node functions/selftest/stampline_mine_selftest.mjs
 * ```
 *
 * 終了コード: 0=通った / 1=食い違った / 2=数えるものが無い
 */

import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FUNCTIONS = join(HERE, "..");

/** 合否。1つでも落ちたら終了コード1で出る */
let bad = 0;
/** 見た件数。0 のまま終わったら 2 */
let seen = 0;

/**
 * 1件の確かめ。
 * @param {string} name 何を見ているか
 * @param {boolean} ok 通ったか
 * @param {string} [why] 落ちたときに出す中身（**偽の字だけ**）
 */
function check(name, ok, why = "") {
  seen += 1;
  if (ok) {
    console.log(`  ok   ${name}`);
    return;
  }
  bad += 1;
  console.log(`  NG   ${name}${why ? ` — ${why}` : ""}`);
}

/* ---------------- 偽の Firestore ---------------- */

/** 入れ物の中身。コレクション名 → 書類ID → 中身。**ぜんぶ偽の字。** */
const STORE = {
  islandStampLine: {
    // 選ばれた人（まだ決めていない）
    chara_me_000001: {
      channelId: "UC_me_0000001",
      suggested: ["いいねぇ", "そうきたか", "ねむい"],
      lines: [],
    },
    // 候補から外した人（`stamp_line_arrange` の `drop`）
    chara_drop_0001: {
      channelId: "UC_drop_000001",
      suggested: ["たべたい"],
      lines: ["たべたい"],
      dropped: true,
    },
  },
};
const BEFORE = JSON.stringify(STORE);

/** 書いた跡と、触った回数。**本体が Firestore に触れたら、ここに出る** */
const writes = [];
const hits = {db: 0, read: 0};

/**
 * 偽の Firestore。`collection().doc()` の読み書きだけ。
 * @return {object} db
 */
function fakeDb() {
  return {
    collection: (name) => ({
      doc: (id) => ({
        get: async () => {
          hits.read += 1;
          const v = STORE[name]?.[id];
          return {exists: !!v, data: () => v};
        },
        set: async (patch) => {
          writes.push({collection: name, id});
          STORE[name][id] = {...(STORE[name][id] ?? {}), ...patch};
        },
        delete: async () => {
          writes.push({collection: name, id, deleted: true});
          delete STORE[name][id];
        },
      }),
      where: () => {
        hits.read += 1;
        throw new Error("偽の Firestore は問い合わせを持たない");
      },
    }),
  };
}

const DB = fakeDb();
const admin = {
  apps: [],
  initializeApp: () => {
    admin.apps.push({});
  },
  firestore: Object.assign(
    () => {
      hits.db += 1;
      return DB;
    },
    {FieldValue: {serverTimestamp: () => 0}},
  ),
  auth: () => {
    throw new Error("閉じた口が合言葉を確かめに行った");
  },
};

/* ---------------- lib/stampLine.js を、偽の admin で読み込む ---------------- */

console.log("# tsc を回して、いまの src から読み込む");
// -b: src が lib より新しいときだけ書き出す（src を変えれば作り直し、型の誤りでは今までどおり落ちる）。
// Selftests では functions/selftest の見張りが同じ src から同じ lib を1本ずつ作り直していて、1本 10秒がほぼそれだった
execFileSync(join(FUNCTIONS, "node_modules/.bin/tsc"), ["-b"], {cwd: FUNCTIONS});

const nodeRequire = createRequire(import.meta.url);
/**
 * `lib/<名前>.js` を、偽の admin を渡して読み込む。
 * @param {string} name 拡張子なしの名前
 * @return {object} その module.exports
 */
function load(name) {
  const file = join(FUNCTIONS, "lib", `${name}.js`);
  const src = readFileSync(file, "utf8");
  const mod = {exports: {}};
  const req = (id) => {
    if (id === "firebase-admin") return admin;
    if (id.startsWith("./")) return load(id.slice(2));
    return nodeRequire(id);
  };
  new Function("require", "exports", "module", "__filename", "__dirname", src)(
    req, mod.exports, mod, file, dirname(file),
  );
  return mod.exports;
}

const {handleStampLine} = load("stampLine");
if (typeof handleStampLine !== "function") {
  console.error("lib/stampLine.js から handleStampLine を取り出せなかった");
  process.exit(2);
}

/**
 * 口を1回叩く。
 * @param {string} method GET / POST
 * @param {string} path パス
 * @param {string} [auth] Authorization ヘッダ
 * @param {object} [body] 送る中身
 * @return {Promise<object>} 扱ったか・状態・ヘッダ・返り
 */
async function call(method, path, auth, body = {}) {
  const out = {handled: false, status: 200, head: {}, body: undefined};
  const res = {
    set: (k, v) => {
      out.head[k] = v;
    },
    status: (n) => {
      out.status = n;
      return res;
    },
    json: (b) => {
      out.body = b;
    },
  };
  /* 開いていた頃と同じものを渡す（合言葉・中身）。**閉じた口は見ない**が、
     渡さずに試すと「渡されたら書く」形に戻っても気づかない */
  out.handled = await handleStampLine(
    {method, path, auth, body},
    res,
    {
      whoIs: async () => ({uid: "uid-me", name: "さくら"}),
      takeQuota: async () => true,
    },
  );
  return out;
}

/* ---------------- 0. 対照（先に見る） ---------------- */

console.log("\n# 0. 対照: 書いたら、数に出る");
{
  await DB.collection("islandStampLine").doc("chara_me_000001")
    .set({lines: ["わざと"]});
  check("わざと1件書くと、書いた跡に1件出る", writes.length === 1,
    `writes=${writes.length}`);
  check("わざと書いたものが入れ物に入る",
    STORE.islandStampLine.chara_me_000001.lines[0] === "わざと");
  // 戻す。**本体を叩く前の姿にそろえる**
  writes.length = 0;
  hits.db = 0;
  hits.read = 0;
  Object.assign(STORE, JSON.parse(BEFORE));
  check("戻した", JSON.stringify(STORE) === BEFORE);
}

/* ---------------- 1. 誰が送っても 410・同じ返事 ---------------- */

console.log("\n# 1. 誰が送っても 410。返事は全員ぶん同じ字");
const callers = [
  ["選ばれた人", "Bearer me"],
  ["外した人", "Bearer drop"],
  ["選ばれていない人", "Bearer not"],
  ["チャンネルの無い人", "Bearer nochan"],
  ["未ログイン", undefined],
];
const answers = new Set();
for (const method of ["GET", "POST"]) {
  for (const [who, auth] of callers) {
    const r = await call(method, "/stampline/mine", auth, {
      lines: ["かきかえ", "もういっこ"],
    });
    check(`${method} ${who} → 扱う`, r.handled === true, `handled=${r.handled}`);
    check(`${method} ${who} → 410`, r.status === 410, `status=${r.status}`);
    answers.add(`${r.status} ${JSON.stringify(r.body)}`);
  }
}
check("返事が1通りだけ（人によって変わらない）", answers.size === 1,
  [...answers].join(" / "));

/* ---------------- 2. 入れ物に触らない ---------------- */

console.log("\n# 2. 入れ物に1バイトも書かない。読みもしない");
check("書いた跡が0件", writes.length === 0, JSON.stringify(writes));
check("入れ物の中身が叩く前と同じ（消えていない・書き換わっていない）",
  JSON.stringify(STORE) === BEFORE);
check("Firestore を開きもしない", hits.db === 0 && hits.read === 0,
  `db=${hits.db} read=${hits.read}`);

/* ---------------- 3. 中間に置かせない ---------------- */

console.log("\n# 3. 閉じた返事も中間に置かせない");
{
  const r = await call("POST", "/stampline/mine", "Bearer me");
  check("Cache-Control: no-store", r.head["Cache-Control"] === "no-store",
    JSON.stringify(r.head));
}

/* ---------------- 4. ほかの道は扱わない ---------------- */

console.log("\n# 4. ほかのパス・ほかの動詞は扱わない（下の口へ落ちる）");
for (const [method, path] of [
  ["GET", "/stampline"],
  ["GET", "/stampline/mine/"],
  ["GET", "/stampline/chara_me_000001"],
  ["POST", "/stampline/chara_me_000001"],
  ["GET", "/stamplines/mine"],
  ["DELETE", "/stampline/mine"],
  ["GET", "/cards/mine"],
]) {
  const r = await call(method, path, "Bearer me");
  check(`${method} ${path} → 扱わない`, r.handled === false,
    `handled=${r.handled}`);
  check(`${method} ${path} → 何も返さない`,
    r.body === undefined && r.status === 200);
}

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
