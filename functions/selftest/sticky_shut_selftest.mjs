/**
 * **締め切った宛先が、サーバーでも断られているか。**
 *
 *   node functions/selftest/sticky_shut_selftest.mjs
 *
 * 終了コード 0=通った / 1=抜けたものがある / 2=確かめられなかった。
 *
 * ## なぜ要るか
 *
 * 2026-10-11 に宛先を2つ畳んだ（`site/content/themes.ts` の `closed`）。
 * 画面からは消えたが、**サーバーは宛先の表を知らなかった**ので、
 * slug を直に投げれば今までどおり貼れていた。画面だけ閉じるのは
 * 半分しか閉じていない（`docs/island-misses.md` #225）。
 *
 * **赤くならない壊れ方。** 画面は正しく、口も 200 を返す。
 * 気づけるのは、締め切ったはずの棚に新しい付箋が増えているのを
 * 見た人だけ。だから機械で押さえる（`docs/island-standards.md` §15）。
 *
 * ## 見ているもの
 *
 *  0. **通るものが通る**（いま書ける宛先に貼れる）。ここが外れたら、
 *     「断った」は口がそこまで届いていなくても出るので、
 *     本物の数字を1つも出さずに 2 で落ちる
 *  1. 畳んだ宛先（`closed`）に貼ると **409**
 *  2. **日で締まる宛先**（企画あて）は、終わる日までは貼れて、
 *     次の日から 409。**両側を見る**——片側だけだと、いつでも断る作りでも
 *     いつでも通す作りでも緑になる
 *  3. **表に無い宛先は通る**（島の表に1行足した日に、Functions を
 *     配り直さなくても貼れる。`islandApi.ts` の `THEME_ID` の決め）
 *  4. **あやと（`byOwner`）も断られる**。ただし開いている宛先には立てられる
 *  5. **ハートは、締め切ったあとも押せる**（締め切ったのは「新しく書く」
 *     ことで、貼ってある付箋に反応することではない）。
 *     しまった付箋・隠した付箋が押せないことも、同じやり方で見る
 *     ——押せない側が1つも無いと、「押せた」が何も言わない
 *  6. **島の表と、サーバーの写し（`src/shutThemes.ts`）がずれていない**
 *     （`functions/tools/shutthemes.mjs --check`）
 *
 * ## 写しを持たない
 *
 * 「どれが締め切られているか」をこのファイルに書き並べると、宛先を1つ
 * 畳んだ日に**ここだけ古い表で緑になる。** 食わせる宛先は、`tsc` が
 * 書き出した `lib/shutThemes.js` から取る。口も本物
 * （`lib/islandApi.js` を偽の firebase-admin で動かす。
 * `sticky_pic_selftest.mjs` と同じやり方）。本番の Functions は叩かない。
 *
 * ## わざと壊して、赤くなるかを見る
 *
 * `STICKY_LIB_DIR` に壊した `lib` を渡すと、そちらで回る（`tsc` は通さない）。
 *
 * ```bash
 * cd functions && npx tsc
 * cp -r functions/lib /tmp/shutbroken
 * # 1) 関所を外す（＝直す前の姿）
 * sed -i 's/if (shutTheme(theme, Date.now()))/if (false)/' \
 *   /tmp/shutbroken/islandApi.js
 * STICKY_LIB_DIR=/tmp/shutbroken node functions/selftest/sticky_shut_selftest.mjs
 * # 2) ハートまで締める（締め切りを広げすぎた形）
 * ```
 *
 * ## 視聴者さんの素性は1文字も出てこない
 *
 * このリポジトリは公開で、Actions のログも誰でも読める。出てくるのは
 * 仕込んだ `uid-hito` `uid-boss` と、宛先の id（こちらが書いた字）だけ。
 */

import {execFileSync} from "node:child_process";
import {existsSync, readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FUNCTIONS = join(HERE, "..");
const REPO = join(FUNCTIONS, "..");
/** `lib` の置き場。**落ちることを確かめる写しだけ、ここを差し替える。** */
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
   引く側（一覧）はこの見張りでは使わないので、空を返す。 */

/** 書類の中身。`<コレクション>/<書類ID>` -> object */
const STORE = new Map();
let seq = 0;

/**
 * 書類1つに、送られた中身を重ねる。
 * @param {object} cur いまの中身
 * @param {object} data 送られた中身
 * @return {object} 重ねたもの
 */
const merge = (cur, data) => ({...(cur ?? {}), ...data});

/**
 * 書類1つの写し。
 * @param {string} key `<コレクション>/<書類ID>`
 * @param {string} id 書類ID
 * @return {object} snapshot のふり
 */
function snapOf(key, id) {
  const v = STORE.get(key);
  return {
    id,
    exists: v !== undefined,
    data: () => v,
    get: (f) => (v ?? {})[f],
  };
}

/**
 * 書類への道。
 * @param {string} col コレクション名
 * @param {string} id 書類ID
 * @return {object} reference のふり
 */
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
 * 引く側（この見張りでは空）。
 * @param {string} name コレクション名
 * @return {object} query のふり
 */
function query(name) {
  const q = {
    where: () => q,
    orderBy: () => q,
    limit: () => q,
    startAfter: () => q,
    get: async () => ({empty: true, size: 0, docs: [], forEach: () => {}}),
    _name: name,
  };
  return q;
}

/**
 * コレクション。
 * @param {string} name コレクション名
 * @return {object} collection のふり
 */
function collection(name) {
  return {
    _name: name,
    /* **Firestore と同じ 20字の書類ID。** 短いと、口の照合式
       （`[A-Za-z0-9_-]{6,}`）に当たらない */
    doc: (id) => refOf(name, id ?? `d${String(++seq).padStart(19, "0")}`),
    add: async (data) => {
      const ref = refOf(name, `d${String(++seq).padStart(19, "0")}`);
      await ref.set(data);
      return ref;
    },
    where: () => query(name),
    orderBy: () => query(name),
    limit: () => query(name),
    get: async () => ({empty: true, size: 0, docs: [], forEach: () => {}}),
  };
}

const DB = {
  collection,
  runTransaction: async (fn) => {
    const tx = {
      get: async (ref) => snapOf(ref._key, ref.id),
      set: (ref, data, opts) => {
        STORE.set(
          ref._key,
          opts?.merge ? merge(STORE.get(ref._key), data) : data,
        );
      },
      update: (ref, data) => {
        STORE.set(ref._key, merge(STORE.get(ref._key), data));
      },
      delete: (ref) => STORE.delete(ref._key),
    };
    return fn(tx);
  },
  getAll: async (...refs) => refs.map((r) => snapOf(r._key, r.id)),
};

/* ---------------- 偽の合言葉 ----------------
   `Bearer hito` が視聴者さん、`Bearer boss` があやと。
   **本物の verifyIdToken は呼ばない**（ネットに出る）。 */

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
  storage: () => ({
    bucket: () => ({
      file: () => ({save: async () => {}, delete: async () => {}}),
    }),
  }),
  auth,
};

const functions = {
  logger: {warn: () => {}, info: () => {}, error: () => {}},
};

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

/**
 * 書き出した js を1つ読み込む。
 * @param {string} name 拡張子なしの名前
 * @return {object} その module.exports
 */
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
    req,
    mod.exports,
    mod,
    file,
    dirname(file),
  );
  loaded.set(name, mod.exports);
  return mod.exports;
}

const api = load("islandApi");
if (typeof api.islandApi !== "function") {
  nothing("lib/islandApi.js から islandApi を取り出せなかった");
}

/** 締め切りの表。**写しを置かず、本体が読むものをそのまま読む。** */
const {SHUT_THEMES} = load("shutThemes");
if (!SHUT_THEMES || typeof SHUT_THEMES !== "object") {
  nothing("lib/shutThemes.js から SHUT_THEMES を取り出せなかった");
}

/** ずっと書けない宛先（`closed: true`）。値が 0 のもの */
const ALWAYS = Object.keys(SHUT_THEMES).filter((k) => SHUT_THEMES[k] === 0);
/** 日で締まる宛先（企画あて）。値が時刻のもの */
const BY_DAY = Object.keys(SHUT_THEMES).filter((k) => SHUT_THEMES[k] > 0);

if (ALWAYS.length === 0) nothing("畳んだ宛先（値が 0）が1つも無い");
if (BY_DAY.length === 0) nothing("日で締まる宛先（値が時刻）が1つも無い");

console.log(
  `# 締め切りの表: ${Object.keys(SHUT_THEMES).length}件` +
    `（ずっと ${ALWAYS.length} / 日で ${BY_DAY.length}）`,
);

/* ---------------- 口を叩く ---------------- */

/**
 * 口を1回叩く。
 * @param {string} method GET / POST / DELETE
 * @param {string} path パス
 * @param {object} body 送る中身
 * @param {string} [token] `hito` か `boss`
 * @return {Promise<object>} 状態と返り
 */
function call(method, path, body, token) {
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
        path: `/island-api${path}`,
        query: {},
        headers: token ? {authorization: `Bearer ${token}`} : {},
        body: body ?? {},
      },
      res,
    );
  });
}

/** 連投の枠を空に戻す（1件ずつ見るので、枠で落ちないように） */
function freeQuota() {
  for (const k of [...STORE.keys()]) {
    if (k.startsWith("islandRate/")) STORE.delete(k);
  }
}

/** 端末ID（`isCid` を通る長さ） */
const CID = "11111111-2222-4333-8444-555555555555";

/**
 * 付箋を1枚投げる。
 * @param {string} theme 宛先
 * @param {object} [extra] 足す中身
 * @param {string} [token] 合言葉
 * @return {Promise<object>} 状態と返り
 */
function postTo(theme, extra, token) {
  freeQuota();
  return call(
    "POST",
    "/stickies",
    {theme, text: "ここに来てほしい", cid: CID, ...extra},
    token,
  );
}

/** あやとを admin にしておく（`ownerUid` が見る場所） */
STORE.set("islandUsers/uid-boss", {admin: true});

/* ---- 0. 通るものが通る（これが外れたら、断ったことは何も言えない） ---- */

console.log("\n## 0. いま書ける宛先には貼れる");

/** 表に無い＝いつでも書ける宛先。島の表のどれでもない字にする */
const OPEN = "selftest-open-dest";
{
  const r = await postTo(OPEN);
  if (r.code !== 200 || !r.body?.note?.id) {
    nothing(
      `開いている宛先に貼れない（code=${r.code} ` +
        `${JSON.stringify(r.body).slice(0, 120)}）`,
    );
  }
  check("開いている宛先に貼れる（200・付箋が返る）", true);
  check(
    "貼ったものが置き場に入っている",
    [...STORE.keys()].some((k) => k.startsWith("islandNotes/")),
  );
}

/* ---- 1. 畳んだ宛先は 409 ---- */

console.log("\n## 1. 畳んだ宛先（closed）に貼ると断られる");

for (const id of ALWAYS) {
  const before = [...STORE.keys()].filter((k) =>
    k.startsWith("islandNotes/"),
  ).length;
  const r = await postTo(id);
  const after = [...STORE.keys()].filter((k) =>
    k.startsWith("islandNotes/"),
  ).length;
  check(
    `${id} → 409`,
    r.code === 409,
    `code=${r.code} ${JSON.stringify(r.body).slice(0, 80)}`,
  );
  /* **断ったなら、1枚も書かれていない。** 409 を返しつつ書いていたら、
     棚は増え続ける（画面には出ないので、誰も気づかない） */
  check(`${id} で、置き場に1枚も増えていない`, after === before);
}

/* ---- 2. 日で締まる宛先は、その日を境に ---- */

console.log("\n## 2. 日で締まる宛先（企画あて）は、境の前後で変わる");

/* **`Date.now` を差し替えて、境の両側を見る。**
   本体は `shutTheme(theme, Date.now())` で今を取るので、ここを動かすのが
   いちばん本物に近い。戻し忘れないように、呼び出しを1つの関数に閉じる。 */
const realNow = Date.now;

/**
 * 時刻をずらして、付箋を1枚投げる。
 * @param {number} ms そのときの epoch ms
 * @param {string} theme 宛先
 * @return {Promise<object>} 状態と返り
 */
async function postAt(ms, theme) {
  Date.now = () => ms;
  try {
    return await postTo(theme);
  } finally {
    Date.now = realNow;
  }
}

check("時刻の差し替えが効く（当たり前のことを先に見る）", (() => {
  Date.now = () => 12345;
  const got = Date.now();
  Date.now = realNow;
  return got === 12345 && Date.now() > 12345;
})());

for (const id of BY_DAY) {
  const at = SHUT_THEMES[id];
  const before = await postAt(at - 1000, id);
  const after = await postAt(at, id);
  check(
    `${id} は、締まる1秒前までは貼れる（200）`,
    before.code === 200,
    `code=${before.code}`,
  );
  check(
    `${id} は、締まった瞬間から 409`,
    after.code === 409,
    `code=${after.code}`,
  );
}

/* ---- 3. 表に無い宛先は通る ---- */

console.log("\n## 3. 表に無い宛先は、今までどおり通る");

{
  /* 島の表に1行足した日、Functions を配り直すまでのあいだに貼られたものを
     400 で捨てない、という決め（`islandApi.ts` の `THEME_ID` の注）。 */
  const r = await postTo("brand-new-destination");
  check("知らない宛先 → 200", r.code === 200, `code=${r.code}`);
  const bad1 = await postTo("Bad Theme");
  check("形が違う宛先 → 400（こちらは今までどおり）", bad1.code === 400,
    `code=${bad1.code}`);
}

/* ---- 4. あやと（byOwner）の扱い ---- */

console.log("\n## 4. あやとの立て札も、締め切った宛先には立たない");

{
  const okOwner = await postTo(OPEN, {byOwner: true}, "boss");
  check(
    "開いている宛先には、あやとの立て札が立つ（200・byOwner）",
    okOwner.code === 200 && okOwner.body?.note?.byOwner === true,
    `code=${okOwner.code}`,
  );
  const shutOwner = await postTo(ALWAYS[0], {byOwner: true}, "boss");
  check(
    `畳んだ宛先には、あやとでも立たない（${ALWAYS[0]} → 409）`,
    shutOwner.code === 409,
    `code=${shutOwner.code} ${JSON.stringify(shutOwner.body).slice(0, 80)}`,
  );
}

/* ---- 5. ハートは、締め切ったあとも押せる ---- */

console.log("\n## 5. 締め切った宛先の付箋にも、ハートは押せる");

{
  /** 畳んだ宛先に、締め切る前から貼ってある付箋 */
  const id = "shutnote000000000001";
  const put = (over) =>
    STORE.set(`islandNotes/${id}`, {
      theme: ALWAYS[0],
      text: "むかし貼った付箋",
      hearts: 0,
      byOwner: false,
      hidden: false,
      archived: false,
      cid: CID,
      uid: null,
      createdAt: 1,
      ...over,
    });

  put({});
  freeQuota();
  const on = await call("POST", `/stickies/${id}/heart`, {cid: CID});
  check(
    "畳んだ宛先の付箋に、ハートが押せる（200・1）",
    on.code === 200 && on.body?.hearts === 1 && on.body?.on === true,
    `code=${on.code} ${JSON.stringify(on.body)}`,
  );
  freeQuota();
  const off = await call("POST", `/stickies/${id}/heart`, {cid: CID});
  check(
    "もう一度押すと外れる（200・0）",
    off.code === 200 && off.body?.hearts === 0 && off.body?.on === false,
    `code=${off.code} ${JSON.stringify(off.body)}`,
  );

  /* **押せない側が1つも無いと、「押せた」は何も言わない。**
     しまった付箋・隠した付箋は、宛先が開いていても押せない。 */
  put({archived: true});
  freeQuota();
  const arch = await call("POST", `/stickies/${id}/heart`, {cid: CID});
  check(
    "しまった付箋は押せない（400）",
    arch.code === 400,
    `code=${arch.code} ${JSON.stringify(arch.body)}`,
  );
  put({hidden: true});
  freeQuota();
  const hid = await call("POST", `/stickies/${id}/heart`, {cid: CID});
  check("隠した付箋は押せない（400）", hid.code === 400, `code=${hid.code}`);
}

/* ---- 6. 島の表と、写しがずれていないか ---- */

console.log("\n## 6. 島の表（site/content/themes.ts）と、写しが同じか");

{
  const tool = join(REPO, "functions", "tools", "shutthemes.mjs");
  let code = 0;
  let out = "";
  try {
    out = execFileSync(process.execPath, [tool, "--check"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    code = e.status ?? 1;
    out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
  /* **写せなかった（2）は、緑でも赤でもない。** site の道具が無い箱で
     「ずれていない」と言わせない（§15） */
  if (code === 2) {
    console.log(out.trim());
    nothing("島の表を写せなかった（site の tsc が無い？）");
  }
  console.log(out.trim().split("\n").map((l) => `  ${l}`).join("\n"));
  check("src/shutThemes.ts が島の表と同じ", code === 0, `exit=${code}`);
}

/* ---------------- まとめ ---------------- */

console.log(`\n見た数: ${ok + bad}（ok ${ok} / NG ${bad}）`);
if (bad > 0) {
  console.error(`\n${bad}件、通っていない。`);
  process.exit(1);
}
console.log("ぜんぶ通った。");
