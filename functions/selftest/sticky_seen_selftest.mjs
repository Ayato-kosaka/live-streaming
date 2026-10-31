/**
 * **既読の印が、視聴者さんから見えないか。数が同じ物差しで出ているか。**
 *
 *   node functions/selftest/sticky_seen_selftest.mjs
 *
 * 終了コード 0=通った / 1=抜けたものがある / 2=確かめられなかった。
 *
 * ## なぜ要るか
 *
 * 既読（`seen`）は「読んだが、返さないと決めた」の印で、**机の側の覚書**。
 * 貼った人に見えると「読まれたが、返事はされない」が本人に伝わる。
 *
 * 閉じるところは2つある。`firestore.rules`（入れ物ごと）と、**口の返事**。
 * **片方だけだと漏れる**——2026-10-12 に、付箋の締め切りで
 * 「画面だけ閉じてサーバーが開いていた」をやったばかり
 * （`docs/island-misses.md` #225）。あちらと同じやり方で、ここも機械で押さえる。
 *
 * `firestore.rules` の側は字で読んで見る（下の 6）。口の側はここで動かす。
 *
 * ## 見ているもの
 *
 *  0. **通るものが通る**（あやとなら数が出る）。ここが外れたら、
 *     「断った」は口がそこまで届いていなくても出るので、2 で落ちる
 *  1. **合言葉なし・視聴者さんの合言葉**では、3つとも断られる
 *     （数の口・既読の棚・既読にする）
 *  2. **公開の一覧に `seen` が1文字も出ない**（既読にした1枚も含めて）
 *  3. **既読にすると数が減り、既読の棚に出る。戻すと数が戻る**
 *     （**両側**を見る。片側だけだと、何でも減らす作りでも緑になる）
 *  4. **返事のあるもの・運営者が立てたもの・あやと自身のぶん**は、
 *     はじめから数に入っていない
 *  5. **数と id が食い違わない**（札の数と、机に並ぶものが同じ物差し）
 *  6. **`firestore.rules` が `islandNotes` を閉じている**
 *
 * ## わざと壊して、赤くなるかを見る
 *
 * `STICKY_LIB_DIR` に壊した `lib` を渡すと、そちらで回る（`tsc` は通さない）。
 *
 * ```bash
 * cd functions && npx tsc && cp -r lib /tmp/seenbroken
 * # 1) 口の関所を外す（誰でも既読の棚を読める形）
 * sed -i 's|if (!(await ownerUid(req.headers.authorization))) {\n|if (false) {|' \
 *   /tmp/seenbroken/islandApi.js
 * # 2) 返事に seen を混ぜる（貼った人に見える形）
 * sed -i 's|archived: v.archived === true ? true : undefined,|seen: v.seen, archived: v.archived === true ? true : undefined,|' \
 *   /tmp/seenbroken/islandApi.js
 * STICKY_LIB_DIR=/tmp/seenbroken node functions/selftest/sticky_seen_selftest.mjs
 * ```
 *
 * ## 視聴者さんの素性は1文字も出てこない
 *
 * 出てくるのは仕込んだ `uid-hito` `uid-boss` と、こちらが書いた宛先の字だけ。
 */

import {execFileSync} from "node:child_process";
import {existsSync, readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FUNCTIONS = join(HERE, "..");
const REPO = join(FUNCTIONS, "..");
const LIB = process.env.STICKY_LIB_DIR || join(FUNCTIONS, "lib");
const BUILD = !process.env.STICKY_LIB_DIR;

/** 確かめられない。**本物の数字を1つも出さずに落ちる**（§15）。 */
function nothing(why) {
  console.error(`確かめられません: ${why}`);
  process.exit(2);
}

let bad = 0;
let ok = 0;

/**
 * 1件の確かめ。
 * @param {string} name 何を見ているか
 * @param {boolean} good 通ったか
 * @param {string} [why] 落ちたときに出す中身
 */
function check(name, good, why = "") {
  if (good) {
    ok += 1;
    console.log(`  ok   ${name}`);
    return;
  }
  bad += 1;
  console.log(`  NG   ${name}${why ? ` — ${why}` : ""}`);
}

/* ---------------- 偽の Firestore ----------------
   **引く側も動かす。** `sticky_shut_selftest.mjs` の写しは一覧を空で
   返すが、こちらは「数える」ところを見るので、入れたものが出てこないと
   何も確かめられない。 */

/** 書類の中身。`<コレクション>/<書類ID>` -> object */
const STORE = new Map();
let seq = 0;

const merge = (cur, data) => {
  const out = {...(cur ?? {})};
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === "object" && v.__delete) delete out[k];
    else out[k] = v;
  }
  return out;
};

function snapOf(key, id) {
  const v = STORE.get(key);
  return {
    id,
    exists: v !== undefined,
    data: () => v,
    get: (f) => (v ?? {})[f],
  };
}

function refOf(col, id) {
  const key = `${col}/${id}`;
  return {
    id,
    _key: key,
    get: async () => snapOf(key, id),
    set: async (data, opts) => {
      STORE.set(key, opts?.merge ? merge(STORE.get(key), data) : data);
    },
    update: async (data) => {
      STORE.set(key, merge(STORE.get(key), data));
    },
    delete: async () => {
      STORE.delete(key);
    },
  };
}

/**
 * 引く側。**`orderBy("createdAt","desc")` と `limit` と `where` を本当に効かせる。**
 * @param {string} name コレクション名
 * @param {object} [plan] いまの絞り・並び
 * @return {object} query のふり
 */
function query(name, plan = {wheres: [], desc: false, cap: 1000}) {
  const q = {
    _name: name,
    where: (f, op, v) => query(name, {...plan, wheres: [...plan.wheres, [f, op, v]]}),
    orderBy: (f, dir) => query(name, {...plan, desc: f === "createdAt" && dir === "desc"}),
    limit: (n) => query(name, {...plan, cap: n}),
    startAfter: () => q,
    get: async () => {
      let docs = [...STORE.keys()]
        .filter((k) => k.startsWith(`${name}/`))
        .map((k) => snapOf(k, k.slice(name.length + 1)));
      for (const [f, op, v] of plan.wheres) {
        if (op !== "==") nothing(`偽の Firestore が知らない比べかた: ${op}`);
        docs = docs.filter((d) => d.get(f) === v);
      }
      docs.sort((a, b) => (Number(b.get("createdAt")) || 0) - (Number(a.get("createdAt")) || 0));
      if (!plan.desc) docs.reverse();
      docs = docs.slice(0, plan.cap);
      return {empty: docs.length === 0, size: docs.length, docs, forEach: (f) => docs.forEach(f)};
    },
  };
  return q;
}

function collection(name) {
  return {
    _name: name,
    doc: (id) => refOf(name, id ?? `d${String(++seq).padStart(19, "0")}`),
    add: async (data) => {
      const ref = refOf(name, `d${String(++seq).padStart(19, "0")}`);
      await ref.set(data);
      return ref;
    },
    where: (...a) => query(name).where(...a),
    orderBy: (...a) => query(name).orderBy(...a),
    limit: (...a) => query(name).limit(...a),
    get: async () => query(name).get(),
  };
}

const DB = {
  collection,
  runTransaction: async (fn) =>
    fn({
      get: async (ref) => snapOf(ref._key, ref.id),
      set: (ref, data, opts) =>
        STORE.set(ref._key, opts?.merge ? merge(STORE.get(ref._key), data) : data),
      update: (ref, data) => STORE.set(ref._key, merge(STORE.get(ref._key), data)),
      delete: (ref) => STORE.delete(ref._key),
    }),
  getAll: async (...refs) => refs.map((r) => snapOf(r._key, r.id)),
};

/* ---------------- 偽の合言葉 ----------------
   `Bearer hito` が視聴者さん、`Bearer boss` があやと。 */

const TOKENS = {hito: "uid-hito", boss: "uid-boss"};
const auth = () => ({
  verifyIdToken: async (t) => {
    const uid = TOKENS[t];
    if (!uid) throw new Error("bad token");
    return {uid, name: ""};
  },
});

const admin = {
  apps: [],
  initializeApp: () => admin.apps.push({}),
  firestore: Object.assign(() => DB, {
    FieldValue: {delete: () => ({__delete: true}), serverTimestamp: () => 0},
    FieldPath: {documentId: () => "__name__"},
    Timestamp: {now: () => ({toMillis: () => 0})},
  }),
  storage: () => ({bucket: () => ({file: () => ({save: async () => {}, delete: async () => {}})})}),
  auth,
};

const functions = {logger: {warn: () => {}, info: () => {}, error: () => {}}};

/* ---------------- lib/*.js を、偽の admin で読み込む ---------------- */

if (BUILD) {
  console.log("# tsc を回して、いまの src から読み込む");
  // -b: src が lib より新しいときだけ書き出す（src を変えれば作り直し、型の誤りでは今までどおり落ちる）。
  // Selftests では functions/selftest の見張りが同じ src から同じ lib を1本ずつ作り直していて、1本 10秒がほぼそれだった
  execFileSync(join(FUNCTIONS, "node_modules/.bin/tsc"), ["-b"], {cwd: FUNCTIONS});
} else {
  console.log(`# 差し替えた lib で回す: ${LIB}`);
}
if (!existsSync(join(LIB, "islandApi.js"))) {
  nothing(`${join(LIB, "islandApi.js")} が無い`);
}

const nodeRequire = createRequire(import.meta.url);
const loaded = new Map();

function load(name) {
  if (loaded.has(name)) return loaded.get(name);
  const file = join(LIB, `${name}.js`);
  const src = readFileSync(file, "utf8");
  const mod = {exports: {}};
  loaded.set(name, mod.exports);
  const req = (id) => {
    if (id === "firebase-admin") return admin;
    if (id === "firebase-functions") return functions;
    if (id.startsWith("./")) return load(id.slice(2));
    return nodeRequire(id);
  };
  new Function("require", "exports", "module", "__filename", "__dirname", src)(
    req, mod.exports, mod, file, dirname(file),
  );
  loaded.set(name, mod.exports);
  return mod.exports;
}

const api = load("islandApi");
if (typeof api.islandApi !== "function") {
  nothing("lib/islandApi.js から islandApi を取り出せなかった");
}

/**
 * 口を1回叩く。
 * @param {string} method GET / POST
 * @param {string} path パス（`?` 付きでよい）
 * @param {object} [body] 送る中身
 * @param {string} [token] `hito` か `boss`
 * @return {Promise<object>} 状態と返り
 */
function call(method, path, body, token) {
  const [p, qs] = path.split("?");
  const query = Object.fromEntries(new URLSearchParams(qs ?? ""));
  return new Promise((done) => {
    let code = 200;
    const res = {
      on: () => res,
      status: (c) => {
        code = c;
        return res;
      },
      set: () => res,
      setHeader: () => res,
      getHeader: () => undefined,
      json: (o) => done({code, body: o}),
      send: (o) => done({code, body: o}),
      end: () => done({code, body: null}),
    };
    api.islandApi(
      {
        method,
        path: `/island-api${p}`,
        query,
        headers: token ? {authorization: `Bearer ${token}`} : {},
        body: body ?? {},
      },
      res,
    );
  });
}

/** あやとを admin にしておく（`ownerUid` が見る場所） */
STORE.set("islandUsers/uid-boss", {admin: true});

/** 表に無い＝いつでも書ける宛先。島の表のどれでもない字にする */
const DEST = "selftest-seen-dest";

/**
 * 付箋を1枚、入れ物に直に置く。
 *
 * **口から貼らない。** `byOwner` や `reply` の付いた1枚は口からは作れない
 * （返信はあやとしか書けないし、1日の枠もある）。見たいのは**数えかた**なので、
 * 入れ物の形だけをこしらえる。
 * @param {string} id 書類ID（20字）
 * @param {object} v 中身
 */
function put(id, v) {
  STORE.set(`islandNotes/${id}`, {
    theme: DEST,
    text: "ここに来てほしい",
    hearts: 0,
    byOwner: false,
    hidden: false,
    archived: false,
    cid: "11111111-2222-4333-8444-555555555555",
    uid: "uid-hito",
    createdAt: 1_760_000_000_000 + (Number(id.slice(-3)) || 0),
    ...v,
  });
}

put("dseen00000000000001", {});                       // ふつうの1枚
put("dseen00000000000002", {});                       // ふつうの1枚
put("dseen00000000000003", {reply: "ありがとう"});      // 返した
put("dseen00000000000004", {byOwner: true});          // 運営者が立てた
put("dseen00000000000005", {uid: "uid-boss"});        // あやと自身のぶん
put("dseen00000000000006", {archived: true});         // しまった
put("dseen00000000000007", {hidden: true});           // 伏せた

/** 数えてほしい2枚 */
const WAIT2 = ["dseen00000000000001", "dseen00000000000002"];

/* ---- 0. 通るものが通る（外れたら、断ったことは何も言えない） ---- */

console.log("\n## 0. あやとなら、数が出る");
{
  const r = await call("GET", "/stickies/waiting", null, "boss");
  if (r.code !== 200 || typeof r.body?.waiting !== "number") {
    nothing(`あやとでも数が出ない（code=${r.code} ${JSON.stringify(r.body)}）`);
  }
  check("数が出る", r.body.waiting === 2, `waiting=${r.body.waiting}`);
  check("id も返る（机の絞り込みが同じ物差しで引ける）",
    JSON.stringify([...r.body.ids].sort()) === JSON.stringify(WAIT2),
    JSON.stringify(r.body.ids));
}

/* ---- 1. 断る側 ---- */

console.log("\n## 1. あやとでなければ、3つとも断られる");
for (const [name, token] of [["合言葉なし", undefined], ["視聴者さんの合言葉", "hito"]]) {
  for (const [what, method, path, body] of [
    ["数の口", "GET", "/stickies/waiting", null],
    ["既読の棚", "GET", "/stickies?seen=1", null],
    ["既読にする", "POST", "/stickies/dseen00000000000001/seen", {on: true}],
  ]) {
    const r = await call(method, path, body, token);
    check(`${name}で${what} → 403`, r.code === 403, `code=${r.code}`);
  }
}

/* ---- 2. 公開の一覧に、既読の印が出ない ---- */

console.log("\n## 2. 公開の一覧に `seen` が1文字も出ない");
{
  await call("POST", "/stickies/dseen00000000000001/seen", {on: true}, "boss");
  const r = await call("GET", `/stickies?theme=${DEST}&limit=200`);
  if (r.code !== 200 || !Array.isArray(r.body?.notes) || r.body.notes.length === 0) {
    nothing(`公開の一覧が引けない（code=${r.code}）`);
  }
  const keys = new Set(r.body.notes.flatMap((n) => Object.keys(n)));
  check(`一覧が引けている（${r.body.notes.length}枚・欄 ${[...keys].sort().join(" ")}）`,
    r.body.notes.length >= 4, `${r.body.notes.length}枚`);
  check("返事に `seen` 系の欄が1つも無い",
    ![...keys].some((k) => k.startsWith("seen")), [...keys].join(" "));
  check("既読にした1枚も、今までどおり板に並ぶ（隠していない）",
    r.body.notes.some((n) => n.id === "dseen00000000000001"), "並ぶ");
  /* **入れ物には在る。** 「返っていない」が「書いていない」になっていたら、
     この見張りは何も守っていない（§15 の分母） */
  check("入れ物の側には印が立っている（返していないだけ）",
    STORE.get("islandNotes/dseen00000000000001")?.seen === true, "立っている");
}

/* ---- 3. 数が減る／戻る（両側） ---- */

console.log("\n## 3. 既読で減り、戻すと戻る");
{
  const after = await call("GET", "/stickies/waiting", null, "boss");
  check("既読にすると数が1つ減る", after.body.waiting === 1, `waiting=${after.body.waiting}`);
  check("減ったのは既読にした1枚",
    !after.body.ids.includes("dseen00000000000001"), JSON.stringify(after.body.ids));

  const shelf = await call("GET", "/stickies?seen=1", null, "boss");
  check("既読の棚から見返せる",
    shelf.code === 200 && shelf.body.notes.length === 1 &&
      shelf.body.notes[0].id === "dseen00000000000001",
    `${shelf.code} / ${shelf.body?.notes?.length}枚`);

  const back = await call("POST", "/stickies/dseen00000000000001/seen", {on: false}, "boss");
  check("戻せる（押し間違いが直せる）", back.code === 200 && back.body.seen === false,
    `${back.code} / ${JSON.stringify(back.body)}`);
  const again = await call("GET", "/stickies/waiting", null, "boss");
  check("戻すと数も戻る", again.body.waiting === 2, `waiting=${again.body.waiting}`);
  check("印は書類から消える（`false` を置き去りにしない）",
    !("seen" in (STORE.get("islandNotes/dseen00000000000001") ?? {})), "消える");
  const empty = await call("GET", "/stickies?seen=1", null, "boss");
  check("既読の棚が空になる", empty.body.notes.length === 0, `${empty.body.notes.length}枚`);
}

/* ---- 4. はじめから数えないもの ---- */

console.log("\n## 4. はじめから数に入っていないもの");
{
  const r = await call("GET", "/stickies/waiting", null, "boss");
  const got = new Set(r.body.ids);
  for (const [why, id] of [
    ["返したもの", "dseen00000000000003"],
    ["運営者が立てたもの", "dseen00000000000004"],
    ["あやと自身が貼ったもの", "dseen00000000000005"],
    ["しまったもの", "dseen00000000000006"],
    ["伏せたもの", "dseen00000000000007"],
  ]) {
    check(`${why}は数えない`, !got.has(id), id);
  }
  check("数と id の数が合っている", r.body.waiting === r.body.ids.length,
    `${r.body.waiting} / ${r.body.ids.length}`);
}

/* ---- 5. 宛先の無い古いぶんは、この数に入らない ---- */

console.log("\n## 5. 宛先の無い古いぶん（企画に貼られたもの）は数えない");
{
  STORE.set("islandNotes/dseen00000000000008", {
    planId: "old-plan", text: "むかしの1枚", hidden: false, uid: "uid-hito",
    createdAt: 1_760_000_000_900,
  });
  const r = await call("GET", "/stickies/waiting", null, "boss");
  check("宛先の無い1枚は入らない", !r.body.ids.includes("dseen00000000000008"),
    JSON.stringify(r.body.ids));
}

/* ---- 6. firestore.rules が入れ物ごと閉じている ---- */

console.log("\n## 6. `firestore.rules` が `islandNotes` を閉じている");
{
  const rules = readFileSync(join(REPO, "firestore.rules"), "utf8");
  const line = rules
    .split("\n")
    .find((l) => l.includes("match /islandNotes/"));
  if (!line) nothing("firestore.rules に `islandNotes` の行が無い");
  check("ブラウザからは読めない・書けない",
    /allow\s+read,\s*write:\s*if\s+false/.test(line), line.trim());
}

/* ---------------- まとめ ---------------- */

console.log(`\n見た数: ${ok + bad}（ok ${ok} / NG ${bad}）`);
if (bad > 0) {
  console.error(`\n${bad}件、通っていない。`);
  process.exit(1);
}
console.log("ぜんぶ通った。");
