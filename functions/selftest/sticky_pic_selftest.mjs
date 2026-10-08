/**
 * **付箋に貼る絵の関所が、ぜんぶ効いているか。**
 *
 *   node functions/selftest/sticky_pic_selftest.mjs
 *
 * 終了コード 0=通った / 1=抜けたものがある / 2=確かめられなかった。
 *
 * ## なぜ要るか
 *
 * 付箋は**ログイン不要で誰でも貼れる**口で、貼られたものは
 * あやとのチャンネルに紐づく公開の面に即出る。字は1日20枚の枠があって
 * 「しまう」で下ろせるが、**絵は置き場（Storage）に実体が残る。**
 * だから絵だけは
 *
 *   1. ログインした人だけ
 *   2. 4MB まで
 *   3. jpeg・png・webp だけ。**中身のバイトで決める**（名乗りを信じない）
 *   4. 1枚だけ
 *   5. 1日6枚まで
 *
 * を満たしたものしか置かない。**どれかに外れたら、置き場に1バイトも
 * 書かずに断る**——ここが抜けると、置き場が誰でも書ける倉庫になる。
 *
 * ## どう確かめるか
 *
 * **`tsc` が書き出した `lib/islandApi.js` を、偽の firebase-admin を渡して
 * そのまま動かす。** 判定の写しを置くと、本体を直した日にここだけ古い
 * 規則で緑になる（`sticky_link_selftest.mjs` と同じ考え）。
 *
 * 口そのものを叩くので、見ているのは `picBytes` 単体ではなく
 * **ログインの関所・枠・置き場への書き込み**まで通した道。
 * 本番の Functions は叩かない（ネットにも鍵にも触らない）。
 *
 * ## いちばん大事なのは「通るものが通る」
 *
 * 「断った」は、**口がそこまで届いていなくても出る。** だから本物の絵
 * （リポジトリに在る png / webp / jpeg の3枚）で1枚貼れること・
 * **置き場に2枚（大きいほうと板に並ぶほう）置かれること**を先に見て、
 * それが外れたら本物の数字を1つも出さずに 2 で落ちる。
 *
 * ## わざと壊して、赤くなるかを見る
 *
 * `STICKY_LIB_DIR` に壊した `lib` を渡すと、そちらで回る（`tsc` は通さない）。
 *
 * ```bash
 * cp -r functions/lib /tmp/picbroken
 * # 中身を見ずに名乗りで通す（＝直す前によくある抜け）
 * sed -i 's/const kind = picKind(buf);/const kind = "png";/' /tmp/picbroken/islandApi.js
 * STICKY_LIB_DIR=/tmp/picbroken node functions/selftest/sticky_pic_selftest.mjs
 * ```
 *
 * **足は1本ずつ抜く**（`docs/island-standards.md` §15）。実測（2026-10-08）:
 *
 * | 抜いた足 | どうなったか |
 * | --- | --- |
 * | 中身を見ずに名乗りで通す（上の sed） | **2** で落ちる（貼れるほうが外れるので、断った数を出さない） |
 * | ログインの関所（`if (!who)` を `if (false)` に） | **1**。「ログインしていない人の絵 → 401」と「置き場に1バイトも置かない」の2件が名指しで出る |
 *
 * ## 視聴者さんの素性は1文字も出てこない
 *
 * このリポジトリは公開で、Actions のログも誰でも読める。出てくる名前は
 * 仕込んだ `uid-hito` `uid-boss` だけ。
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

/** 数えるものが無い。**本物の数字を1つも出さずに落ちる。** */
function nothing(why) {
  console.error(`確かめられません: ${why}`);
  process.exit(2);
}

let bad = 0;
let ok = 0;

function check(name, good, why = "") {
  if (good) {
    ok += 1;
    console.log(`  ok   ${name}`);
    return;
  }
  bad += 1;
  console.log(`  NG   ${name}${why ? ` — ${why}` : ""}`);
}

/* ---------------- 本物の絵を3枚、リポジトリから取る ----------------

   **作り物のバイト列だけで済ませない。** 魔法の字（先頭の数バイト）を
   並べただけのものは、本物の絵が通ることを1つも言わない。 */

const REAL = [
  ["png", join(REPO, "site/public/og.png")],
  ["webp", join(REPO, "site/public/sprites/barrel.webp")],
  ["jpeg", join(REPO, "tools/sprites/photo-480.jpg")],
];
const pics = new Map();
for (const [kind, file] of REAL) {
  if (!existsSync(file)) continue;
  pics.set(kind, readFileSync(file));
}
if (pics.size < 3) {
  nothing(
    `本物の絵が足りない（${pics.size}/3）: ` +
      REAL.filter(([k]) => !pics.has(k)).map(([, f]) => f).join(" "),
  );
}
/** 板に並ぶほう（600KB まで）に使える1枚。og.png は 500KB で、これは通る */
const SMALL = pics.get("webp");
if (SMALL.length > 600 * 1024) nothing("webp が 600KB を超えている");

const b64 = (buf) => buf.toString("base64");

/* ---------------- 偽の Firestore ---------------- */

/** 書類の中身。`<コレクション>/<書類ID>` -> object */
const STORE = new Map();
/** 連番の書類ID（`doc()` が返すもの） */
let seq = 0;

const DEL = {__delete: true};

/** 書類1つの写し。`FieldValue.delete()` をここで効かせる */
function merge(cur, data) {
  const next = {...(cur ?? {})};
  for (const [k, v] of Object.entries(data)) {
    if (v === DEL) delete next[k];
    else next[k] = v;
  }
  return next;
}

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

function collection(name) {
  return {
    _name: name,
    /* **Firestore と同じ 20字の書類ID。** 短い id にすると、口の照合式
       （`[A-Za-z0-9_-]{6,}`）に当たらず、**消す口が 404 になる**のを
       「消せない」と読み違える（2026-10-08 に1度やった） */
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

/** 引く側は、この見張りでは使わない（空を返す） */
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

/* ---------------- 偽の置き場（Storage） ----------------
   **何が置かれたかを数える。** 断った回に1バイトも書かれていないことが、
   この見張りのいちばん大事な数字。 */

/** 置かれたもの。置き場の名前 -> {bytes, type} */
const PUT = new Map();
/** 消されたもの */
const GONE = [];

const storage = () => ({
  bucket: () => ({
    file: (path) => ({
      save: async (buf, opts) => {
        PUT.set(path, {bytes: buf.length, type: opts?.contentType ?? ""});
      },
      delete: async () => {
        GONE.push(path);
        PUT.delete(path);
      },
    }),
  }),
});

/* ---------------- 偽の合言葉 ----------------
   **本物の verifyIdToken は呼ばない**（ネットに出る）。
   `Bearer hito` が視聴者さん、`Bearer boss` があやと。 */

const TOKENS = {hito: "uid-hito", boss: "uid-boss"};
const auth = () => ({
  verifyIdToken: async (t) => {
    const uid = TOKENS[t];
    if (!uid) throw new Error("bad token");
    return {uid, name: ""};
  },
});

const FieldValue = {delete: () => DEL, serverTimestamp: () => 0};
const admin = {
  apps: [],
  initializeApp: () => admin.apps.push({}),
  firestore: Object.assign(() => DB, {
    FieldValue,
    FieldPath: {documentId: () => "__name__"},
    Timestamp: {now: () => ({toMillis: () => 0})},
  }),
  storage,
  auth,
};

const logs = [];
const functions = {
  logger: {
    warn: (...a) => logs.push(`warn ${a.join(" ")}`),
    info: (...a) => logs.push(`info ${a.join(" ")}`),
    error: (...a) => logs.push(`error ${a.join(" ")}`),
  },
};

/* ---------------- lib/*.js を、偽の admin で読み込む ---------------- */

if (BUILD) {
  console.log("# tsc を回して、いまの src から読み込む");
  execFileSync(join(FUNCTIONS, "node_modules/.bin/tsc"), {cwd: FUNCTIONS});
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

/**
 * 1日の枠の書類ID。本体の `takeQuota` が使う `today()` は **UTC**。
 *
 * **置き場の道とは別の日付。** あちらは `jstDay`（日本時間）で、
 * あやとが「何日に貼られた絵か」で見るのはそちら。
 * 2026-10-08 の UTC 15時台に、ここを1つで済ませていて落ちた
 * （本物は `notes/2026-10-09/…`、こちらは 10-08 を待っていた）。
 */
const DAY = new Date().toISOString().slice(0, 10);
/** 置き場の道の日付。**写しを作らず、本体の `jstDay` をそのまま呼ぶ。** */
const PIC_DAY = load("streamEvents").jstDay(Date.now());

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

/** いまの端末ID。`isCid` を通る長さ */
const CID = "11111111-2222-4333-8444-555555555555";

/** 貼る中身を1つ作る */
const post = (extra) => ({
  theme: "goods-art",
  text: "カレンダーほしい",
  cid: CID,
  ...extra,
});

/** 正しい2枚（本物の絵） */
const goodPair = (kind) => ({
  image: b64(pics.get(kind)),
  thumb: b64(SMALL),
  w: 1200,
  h: 800,
  tw: 480,
  th: 320,
});

/* ---------------- 1. まず「通るものが通る」 ---------------- */

console.log("\n## 貼れること（これが外れたら、断ったことは何も言えない）");

/** 置き場に置かれた1枚の名前（`notes/<日>/<id>…`） */
let putPaths = [];
let madeNoteId = "";

for (const kind of ["png", "webp", "jpeg"]) {
  freeQuota();
  PUT.clear();
  const r = await call("POST", "/stickies", post(goodPair(kind)), "hito");
  const pic = r.body?.note?.pic;
  check(
    `${kind} の絵つきで貼れる（200・絵が返る）`,
    r.code === 200 && !!pic?.url && !!pic?.thumb,
    `code=${r.code} ${JSON.stringify(r.body).slice(0, 120)}`,
  );
  check(
    `${kind} は置き場に2枚（開くほうと、板に並ぶほう）`,
    PUT.size === 2,
    `置かれた=${PUT.size} ${[...PUT.keys()].join(" ")}`,
  );
  const types = [...PUT.values()].map((v) => v.type).sort();
  check(
    `${kind} の置き場の型が image/${kind} と image/webp`,
    types.join(",") === [`image/${kind}`, "image/webp"].sort().join(","),
    types.join(","),
  );
  if (kind === "png") {
    putPaths = [...PUT.keys()];
    madeNoteId = r.body?.note?.id ?? "";
  }
}

check(
  "置き場の名前が notes/<日>/ の下",
  putPaths.length === 2 &&
    putPaths.every((p) => p.startsWith(`notes/${PIC_DAY}/`)),
  putPaths.join(" "),
);

/* 1枚貼れたことが言えないなら、以下の「断った」は意味を持たない */
if (bad) {
  console.error(
    "\n貼れるはずのものが貼れていない。断った数は出さずに落ちる（§15）",
  );
  process.exit(2);
}

/* ---------------- 2. 字だけの付箋は、今までどおり ---------------- */

console.log("\n## 字だけの付箋（ログイン不要のまま）");
freeQuota();
PUT.clear();
{
  const r = await call("POST", "/stickies", post({}));
  check(
    "ログインなしで、字だけなら貼れる",
    r.code === 200 && !r.body?.note?.pic,
    `code=${r.code} ${JSON.stringify(r.body).slice(0, 120)}`,
  );
  check("字だけなら置き場に1バイトも置かない", PUT.size === 0, `${PUT.size}`);
}

/* ---------------- 3. 断るもの ---------------- */

console.log("\n## 断るもの（**置き場に1バイトも書かずに**断る）");

/** 4MB＋1バイトの「png」。魔法の字だけ本物 */
const tooBig = Buffer.concat([
  Buffer.from("89504e470d0a1a0a", "hex"),
  Buffer.alloc(4 * 1024 * 1024 + 1 - 8),
]);

/** 600KB を超える「png」。大きいほうの 4MB には収まる */
const tooFatThumb = Buffer.concat([
  Buffer.from("89504e470d0a1a0a", "hex"),
  Buffer.alloc(700 * 1024),
]);

const CASES = [
  {
    name: "ログインしていない人の絵",
    token: null,
    body: goodPair("png"),
    code: 401,
  },
  {
    name: "4MB を超える絵",
    body: {...goodPair("png"), image: b64(tooBig)},
    code: 400,
    error: "bad size",
  },
  {
    name: "gif（拡張子は png と名乗る）",
    body: {
      ...goodPair("png"),
      image: `data:image/png;base64,${b64(
        Buffer.concat([
          Buffer.from("GIF89a"),
          Buffer.alloc(1024, 0x21),
        ]),
      )}`,
    },
    code: 400,
    error: "not an image",
  },
  {
    name: "svg の字（拡張子は png と名乗る）",
    body: {
      ...goodPair("png"),
      image: `data:image/png;base64,${b64(
        Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg">${"<g/>".repeat(200)}</svg>`,
        ),
      )}`,
    },
    code: 400,
    error: "not an image",
  },
  {
    name: "html の字（拡張子は webp と名乗る）",
    body: {
      ...goodPair("png"),
      image: `data:image/webp;base64,${b64(
        Buffer.from(`<html><script>alert(1)</script>${"<p>x</p>".repeat(100)}`),
      )}`,
    },
    code: 400,
    error: "not an image",
  },
  {
    name: "頭だけ本物の webp（RIFF だが WEBP ではない）",
    body: {
      ...goodPair("png"),
      image: b64(
        Buffer.concat([Buffer.from("RIFF0000AVI "), Buffer.alloc(1024)]),
      ),
    },
    code: 400,
    error: "not an image",
  },
  {
    name: "512バイト未満の絵",
    body: {...goodPair("png"), image: b64(pics.get("png").subarray(0, 300))},
    code: 400,
    error: "bad size",
  },
  {
    name: "base64 ではない字",
    body: {...goodPair("png"), image: "####これは絵ではない####"},
    code: 400,
    error: "bad image",
  },
  {
    name: "絵を2枚（配列で送る）",
    body: {...goodPair("png"), image: [b64(pics.get("png")), b64(SMALL)]},
    code: 400,
    error: "one picture only",
  },
  {
    name: "板に並ぶほうが無い",
    body: {...goodPair("png"), thumb: undefined},
    code: 400,
    error: "thumb one picture only",
  },
  {
    /* 大きいほうの上限（4MB）には収まるが、**板に並ぶほうの上限は別**。
       同じ絵を2回送るだけで通ってしまうと、板が重くなる道が開く */
    name: "板に並ぶほうが 600KB を超える",
    body: {...goodPair("png"), thumb: b64(tooFatThumb)},
    code: 400,
    error: "thumb bad size",
  },
];

for (const c of CASES) {
  freeQuota();
  PUT.clear();
  const r = await call(
    "POST",
    "/stickies",
    post(c.body),
    c.token === null ? undefined : (c.token ?? "hito"),
  );
  check(
    `${c.name} → ${c.code}`,
    r.code === c.code && (!c.error || r.body?.error === c.error),
    `code=${r.code} error=${JSON.stringify(r.body?.error)}`,
  );
  check(
    `${c.name} → 置き場に1バイトも置かない`,
    PUT.size === 0,
    `置かれた=${PUT.size}`,
  );
}

/* ---------------- 4. 1日の枠 ---------------- */

console.log("\n## 1日の枠（絵は字より少ない）");
{
  const m = /const PICS_PER_DAY = (\d+);/.exec(
    readFileSync(join(LIB, "islandApi.js"), "utf8"),
  );
  if (!m) nothing("PICS_PER_DAY が読めない");
  const limit = Number(m[1]);
  freeQuota();
  PUT.clear();
  // 枠を使い切った状態にする（`takeQuota` の書類IDと同じ形）
  STORE.set(`islandRate/stickypic_${DAY}_uid-hito`, {n: limit});
  const r = await call("POST", "/stickies", post(goodPair("png")), "hito");
  check(
    `絵を ${limit} 枚貼った人の ${limit + 1} 枚目 → 429`,
    r.code === 429 && r.body?.error === "too many pictures today",
    `code=${r.code} error=${JSON.stringify(r.body?.error)}`,
  );
  check("枠で断った回も、置き場に書かない", PUT.size === 0, `${PUT.size}`);
  // 絵の枠が切れていても、字だけなら貼れる
  freeQuota();
  STORE.set(`islandRate/stickypic_${DAY}_uid-hito`, {n: limit});
  const t = await call("POST", "/stickies", post({}), "hito");
  check("絵の枠が切れても、字だけなら貼れる", t.code === 200, `code=${t.code}`);
}

/* ---------------- 5. 消す口 ---------------- */

console.log("\n## 絵をはずす（あやとだけ・1タップ）");
{
  STORE.set("islandUsers/uid-boss", {admin: true});
  freeQuota();
  PUT.clear();
  const made = await call("POST", "/stickies", post(goodPair("png")), "hito");
  const id = made.body?.note?.id;
  if (!id) nothing("貼れなかったので、消す口を確かめられない");
  const before = PUT.size;

  const no = await call("DELETE", `/stickies/${id}/pic`, {}, "hito");
  check(
    "持ち主でない人は外せない（403）",
    no.code === 403,
    `code=${no.code} ${JSON.stringify(no.body)}`,
  );
  check("外せなかった回は、置き場が減らない", PUT.size === before, `${PUT.size}`);

  const yes = await call("DELETE", `/stickies/${id}/pic`, {}, "boss");
  check(
    "持ち主は1タップで外せる（200）",
    yes.code === 200 && yes.body?.pic === null,
    `code=${yes.code} ${JSON.stringify(yes.body)}`,
  );
  check("置き場の実体も2枚とも消える", PUT.size === 0, `のこり=${PUT.size}`);
  check(
    "付箋の字は残る（絵の欄だけ消える）",
    (STORE.get(`islandNotes/${id}`) ?? {}).text === "カレンダーほしい" &&
      (STORE.get(`islandNotes/${id}`) ?? {}).pic === undefined,
    JSON.stringify(STORE.get(`islandNotes/${id}`) ?? {}).slice(0, 160),
  );

  const gone = await call("DELETE", "/stickies/notthere123/pic", {}, "boss");
  check("無い付箋の絵は 404", gone.code === 404, `code=${gone.code}`);
}

/* ---------------- 6. ログに素性が出ていないか ---------------- */

const leaked = logs.filter((l) => l.includes("uid-") || l.includes(CID));
check("ログに uid も端末IDも出ていない", leaked.length === 0, leaked.join(" | "));

console.log(
  `\n見た絵 ${pics.size}枚（本物）/ 通った ${ok} / 抜けた ${bad}` +
    `\n貼った付箋 ${madeNoteId ? 1 : 0}枚ぶんの置き場の名前: ${putPaths.join(" ")}`,
);
process.exit(bad ? 1 : 0);
