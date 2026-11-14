/**
 * **写真の取り込みの口（`/cardimport/*`）が、約束どおりに守られていること。**
 * 仕様は `docs/card-import.md` の2章（状態の決まり）と3章（口）。
 *
 * `lib/islandApi.js` を**丸ごと**、偽の Firestore・偽の置き場で起こす。
 * 登録は本物の `saveEventImage` → `mintForImage` を通るので、
 * 「手で貼るのと同じ道を通っているか」もここで見える。
 *
 * ## 見るもの
 *
 * | | |
 * | --- | --- |
 * | 1 | **あやと以外は 7本とも 403**（合言葉なし・Bearer でない・にせ・本物だが admin でない）。そのとき1バイトも書かず、置き場も読まない |
 * | 2 | あやとでは 7本とも 200 |
 * | 3 | **sha の形**: 16進64桁でないもの（短い・大文字・字が違う）は 400 で、置き場を1回も読まない |
 * | 4 | **下見（dryRun）は1バイトも書かない。** 何枚・どの日・その日に何人を返す（人数は `tipsForImage` で、同じ人の2回は1人） |
 * | 5 | 登録すると写真が1枚ずつでき、`importSha` が付き、カードがその日の人数ぶんできる |
 * | 6 | **同じ候補を2回登録しても写真は1枚**（写真を置いたあと札を書く前に落ちた回を、作らずに `registered` に直す） |
 * | 7 | `registering` は**10分たったものだけ**拾い直す。`failed` は `retryFailed: true` のときだけ |
 * | 8 | **取り込みは1日の枠を使わない**。手で貼る口は今までどおり枠を使い、`importSha` の欄を作らない |
 * | 9 | 外す／戻すは candidate ⇄ excluded だけ。登録済み・認識合わせは動かない |
 * | 10 | 認識合わせの答えは、`calib` の書類にだけ書く |
 * | 11 | **外したもの（excluded）は登録が拾わない** |
 *
 * 対照: `lib` の写しを1か所ずつ壊して回し、狙った行が赤くなることを見る。
 *
 * ## 本番には触らない
 *
 * `firebase-admin` を丸ごと偽物にしてから読み込む。ネットにも出ない。
 * 出てくる名前は仕込んだ偽の字だけ。
 *
 * ```bash
 * node functions/selftest/card_import_selftest.mjs
 * ```
 *
 * 0＝通った / 1＝落ちた / 2＝数えるものが無い
 */

import {execFileSync, spawnSync} from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import {createRequire} from "node:module";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FUNCTIONS = join(HERE, "..");
/** `lib` の置き場。**対照の写しだけ、ここを差し替える。** */
const LIB = process.env.CARDIMPORT_LIB_DIR || join(FUNCTIONS, "lib");
const BUILD = !process.env.CARDIMPORT_LIB_DIR;

let ok = 0;
let bad = 0;

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

/**
 * 数えるものが無い。本物の数字を1つも出さずに落ちる。
 * @param {string} why 理由
 */
function nothing(why) {
  console.error(`確かめられません: ${why}`);
  process.exit(2);
}

/* ---------------- 偽の Firestore（中身を持って、問い合わせにも答える） ---------------- */

/** `<コレクション>/<書類ID>` -> 中身 */
const STORE = new Map();
/** 書いた回数・読んだ回数（断る道で増えたら漏れ） */
const COUNT = {writes: 0, reads: 0, objReads: 0, objWrites: 0};
let seq = 0;
const DEL = {__delete: true};

/**
 * 書類を混ぜる。`FieldValue.delete()` をここで効かせる。
 * @param {object | undefined} cur いまの中身
 * @param {object} data 足すもの
 * @return {object} 混ぜたもの
 */
function merge(cur, data) {
  const next = {...(cur ?? {})};
  for (const [k, v] of Object.entries(data)) {
    if (v === DEL) delete next[k];
    else next[k] = v;
  }
  return next;
}

/**
 * 書類の写し。
 * @param {object} ref 書類
 * @return {object} snapshot
 */
function snapOf(ref) {
  const v = STORE.get(ref._key);
  return {
    id: ref.id,
    ref,
    exists: v !== undefined,
    data: () => (v === undefined ? undefined : {...v}),
    get: (f) => (v ?? {})[f],
  };
}

/**
 * 書く（数える）。
 * @param {object} ref 書類
 * @param {object} data 中身
 * @param {object} [opts] {merge}
 */
function put(ref, data, opts) {
  COUNT.writes += 1;
  STORE.set(ref._key, opts?.merge ? merge(STORE.get(ref._key), data) : data);
}

/**
 * 書類1つ。
 * @param {string} col コレクション
 * @param {string} id 書類ID
 * @return {object} ref
 */
function refOf(col, id) {
  const ref = {
    id,
    _key: `${col}/${id}`,
    parent: {id: col},
    get: async () => {
      COUNT.reads += 1;
      return snapOf(ref);
    },
    set: async (data, opts) => put(ref, data, opts),
    update: async (data) => {
      if (!STORE.has(ref._key)) throw new Error("NOT_FOUND");
      put(ref, data, {merge: true});
    },
    delete: async () => {
      COUNT.writes += 1;
      STORE.delete(ref._key);
    },
  };
  return ref;
}

/**
 * 問い合わせ。等価と `in` と並べ替えと上限だけ（島の口が使うのはそれだけ）。
 * @param {string} col コレクション
 * @param {Array} filters [欄, 演算, 値]
 * @param {number} lim 上限
 * @param {Array | null} order [欄, 向き]
 * @return {object} query
 */
function query(col, filters = [], lim = Infinity, order = null) {
  const q = {
    where: (f, op, v) => query(col, [...filters, [f, op, v]], lim, order),
    limit: (n) => query(col, filters, n, order),
    orderBy: (f, dir = "asc") => query(col, filters, lim, [f, dir]),
    startAfter: () => q,
    get: async () => {
      COUNT.reads += 1;
      let rows = [...STORE.keys()]
        .filter((k) => k.startsWith(`${col}/`))
        .map((k) => refOf(col, k.slice(col.length + 1)));
      rows = rows.filter((r) => {
        const v = STORE.get(r._key);
        return filters.every(([f, op, want]) => {
          if (op === "==") return v[f] === want;
          if (op === "in") return want.includes(v[f]);
          throw new Error(`この偽物は ${op} を知らない`);
        });
      });
      if (order) {
        const [f, dir] = order;
        rows = rows.filter((r) => STORE.get(r._key)[f] !== undefined);
        rows.sort((a, b) => {
          const x = STORE.get(a._key)[f];
          const y = STORE.get(b._key)[f];
          return (x < y ? -1 : x > y ? 1 : 0) * (dir === "desc" ? -1 : 1);
        });
      }
      const docs = rows.slice(0, lim).map(snapOf);
      return {
        size: docs.length,
        empty: docs.length === 0,
        docs,
        forEach: (f) => docs.forEach(f),
      };
    },
  };
  return q;
}

const DB = {
  collection: (name) => ({
    id: name,
    doc: (id) => refOf(name, id ?? `d${String(++seq).padStart(19, "0")}`),
    where: (f, op, v) => query(name).where(f, op, v),
    orderBy: (f, d) => query(name).orderBy(f, d),
    limit: (n) => query(name).limit(n),
    get: () => query(name).get(),
  }),
  getAll: async (...refs) => {
    COUNT.reads += 1;
    return refs.filter((r) => r && r._key).map(snapOf);
  },
  batch: () => {
    const ops = [];
    const b = {
      set: (ref, data, opts) => {
        ops.push(() => put(ref, data, opts));
        return b;
      },
      update: (ref, data) => {
        ops.push(() => put(ref, data, {merge: true}));
        return b;
      },
      delete: (ref) => {
        ops.push(() => STORE.delete(ref._key));
        return b;
      },
      commit: async () => {
        ops.forEach((f) => f());
        return [];
      },
    };
    return b;
  },
  runTransaction: async (fn) => {
    const ops = [];
    const tx = {
      get: async (ref) => {
        COUNT.reads += 1;
        return ref._key ? snapOf(ref) : ref.get();
      },
      getAll: async (...refs) => {
        COUNT.reads += 1;
        return refs.map(snapOf);
      },
      set: (ref, data, opts) => {
        ops.push(() => put(ref, data, opts));
        return tx;
      },
      update: (ref, data) => {
        ops.push(() => {
          if (!STORE.has(ref._key)) throw new Error("NOT_FOUND");
          put(ref, data, {merge: true});
        });
        return tx;
      },
      delete: (ref) => {
        ops.push(() => STORE.delete(ref._key));
        return tx;
      },
    };
    const out = await fn(tx);
    ops.forEach((f) => f());
    return out;
  },
};

/* ---------------- 偽の置き場 ---------------- */

/** 道 -> {buf, opts} */
const OBJ = new Map();

const storage = () => ({
  bucket: () => ({
    file: (path) => ({
      name: path,
      save: async (buf, opts) => {
        COUNT.objWrites += 1;
        OBJ.set(path, {buf: Buffer.from(buf), opts});
      },
      download: async () => {
        COUNT.objReads += 1;
        const o = OBJ.get(path);
        if (!o) {
          const e = new Error("No such object");
          e.code = 404;
          throw e;
        }
        return [o.buf];
      },
      delete: async () => {
        COUNT.objWrites += 1;
        OBJ.delete(path);
      },
      getFiles: async () => [[]],
    }),
  }),
});

/* ---------------- 偽の合言葉 ---------------- */

/** `Bearer boss` があやと、`Bearer hito` が視聴者さん、ほかはにせ */
const TOKENS = {boss: "uid-boss", hito: "uid-hito"};
const auth = () => ({
  verifyIdToken: async (t) => {
    const uid = TOKENS[t];
    if (!uid) throw new Error("bad token");
    return {uid, name: ""};
  },
});

/** `tipRef` が `instanceof` で見るので、関数（クラス）にしておく */
class Timestamp {
  /** @return {object} いま */
  static now() {
    return {toMillis: () => Date.now()};
  }
}

const admin = {
  apps: [],
  initializeApp: () => admin.apps.push({}),
  firestore: Object.assign(() => DB, {
    FieldValue: {
      delete: () => DEL,
      serverTimestamp: () => Date.now(),
      increment: (n) => n,
      arrayUnion: (...a) => a,
    },
    FieldPath: {documentId: () => "__name__"},
    Timestamp,
    AggregateField: {sum: () => ({})},
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
    log: (...a) => logs.push(`log ${a.join(" ")}`),
  },
};

/* ---------------- lib/*.js を、偽の admin で読み込む ---------------- */

if (BUILD) {
  console.log("# tsc を回して、いまの src から読み込む");
  // -b: src が lib より新しいときだけ書き出す（ほかの見張りと同じ）
  execFileSync(join(FUNCTIONS, "node_modules/.bin/tsc"), ["-b"], {
    cwd: FUNCTIONS,
  });
} else {
  console.log(`# 差し替えた lib で回す: ${LIB}`);
}
if (!existsSync(join(LIB, "cardImport.js"))) {
  nothing(`${join(LIB, "cardImport.js")} が無い`);
}

const nodeRequire = createRequire(join(FUNCTIONS, "package.json"));
const loaded = new Map();

/**
 * lib の1本を、偽の admin を渡して読み込む。
 * @param {string} name `lib/<name>.js`
 * @return {object} exports
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

const {islandApi} = load("islandApi");
if (typeof islandApi !== "function") nothing("islandApi を取り出せなかった");

/**
 * 口を1回叩く。
 * @param {string} method GET / POST
 * @param {string} path `/island-api/…`
 * @param {string | null} token Bearer の中身。null なら付けない
 * @param {object} [body] 本文
 * @param {object} [q] クエリ
 * @param {string} [rawAuth] Authorization をそのまま渡すとき
 * @return {Promise<object>} {status, body, headers}
 */
function call(method, path, token, body = {}, q = {}, rawAuth) {
  const headers = {};
  if (rawAuth) headers.authorization = rawAuth;
  else if (token) headers.authorization = `Bearer ${token}`;
  return new Promise((done) => {
    const out = {status: 200, body: null, headers: {}};
    let sent = false;
    const finish = () => {
      if (sent) return;
      sent = true;
      done(out);
    };
    const res = {
      set: (k, v) => {
        out.headers[String(k).toLowerCase()] = v;
        return res;
      },
      status: (s) => {
        out.status = s;
        return res;
      },
      json: (b) => {
        out.body = b;
        finish();
        return res;
      },
      send: (b) => {
        out.body = b;
        finish();
        return res;
      },
      end: () => finish(),
      setHeader: (k, v) => {
        out.headers[String(k).toLowerCase()] = v;
      },
      getHeader: () => undefined,
      removeHeader: () => {},
      on: () => {},
      once: () => {},
      emit: () => {},
    };
    const req = {
      method,
      path,
      url: path,
      originalUrl: path,
      query: q,
      headers,
      get: (k) => headers[String(k).toLowerCase()],
      body,
      rawBody: Buffer.from(""),
      on: () => {},
      socket: {},
    };
    islandApi(req, res);
  });
}

/* ---------------- 仕込む中身（ぜんぶ偽の字） ---------------- */

/**
 * webp の頭を持った中身。`saveEventImage` の下限（1KB）を越える大きさ。
 * @param {number} n 大きさ
 * @param {number} fill 詰める字
 * @return {Buffer} 中身
 */
function webp(n, fill) {
  const b = Buffer.alloc(n, fill);
  b.write("RIFF", 0, "ascii");
  b.writeUInt32LE(n - 8, 4);
  b.write("WEBP", 8, "ascii");
  return b;
}

const sha = (c) => c.repeat(64);
const S = {
  c1: sha("1"),
  c2: sha("2"),
  ex: sha("3"),
  reg: sha("4"),
  cal: sha("5"),
  fresh: sha("6"),
  stale: sha("7"),
  c8: sha("8"),
};
const DAY = "2026-09-12";
const BATCH = "b1";
const CAND = webp(2048, 7);
const THUMB = webp(256, 9);

/** 書類と置き場を、毎回同じ形に戻す。 */
function seed() {
  STORE.clear();
  OBJ.clear();
  seq = 0;
  const now = Date.now();
  STORE.set("islandUsers/uid-boss", {admin: true});
  STORE.set("islandUsers/uid-hito", {admin: false});
  STORE.set("islandStreamEvent/ev1", {
    title: "偽の企画", date: DAY, status: "done", createdAt: 1,
  });
  // 同じ人が2回投げても1人。翌日の別の人は入らない
  const tip = (id, ch, day, at) =>
    STORE.set(`islandTips/${id}`, {
      channelId: ch, displayNameSnapshot: `偽の名前${id}`, day,
      donatedAt: at,
    });
  tip("t1", "UCfakeAAAAAAAAAAAAAAAAAA", DAY, Date.parse(`${DAY}T12:00:00Z`));
  tip("t2", "UCfakeAAAAAAAAAAAAAAAAAA", DAY, Date.parse(`${DAY}T12:30:00Z`));
  tip("t3", "UCfakeBBBBBBBBBBBBBBBBBB", DAY, Date.parse(`${DAY}T13:00:00Z`));
  const it = (s, status, extra = {}) =>
    STORE.set(`islandCardImport/${s}`, {
      batch: BATCH, day: DAY, takenAt: `${DAY}T10:00:00+02:00`,
      w: 1600, h: 1200, tw: 400, th: 300, category: "food", score: 0.7,
      group: "g1", reasons: [], status, updatedAt: now - 60 * 1000,
      ...extra,
    });
  it(S.c1, "candidate");
  it(S.c2, "candidate");
  it(S.ex, "excluded");
  it(S.reg, "registered", {imageId: "img-old"});
  it(S.cal, "calib");
  it(S.fresh, "registering", {updatedAt: now - 60 * 1000});
  it(S.stale, "registering", {updatedAt: now - 11 * 60 * 1000});
  it(S.c8, "candidate", {batch: "b0"});
  STORE.set(`islandCardImportRuns/${BATCH}`, {createdAt: now, items: 7});
  for (const s of Object.values(S)) {
    OBJ.set(`cardImport/cand/${s}.webp`, {buf: CAND, opts: {}});
    OBJ.set(`cardImport/thumb/${s}.webp`, {buf: THUMB, opts: {}});
  }
}

const count = (prefix, pred = () => true) =>
  [...STORE.entries()].filter(([k, v]) => k.startsWith(prefix) && pred(v))
    .length;
const doc = (col, id) => STORE.get(`${col}/${id}`);
const zero = () => {
  COUNT.writes = 0;
  COUNT.reads = 0;
  COUNT.objReads = 0;
  COUNT.objWrites = 0;
};

/* ---------------- 1・2 口の守り ---------------- */

/** [method, path, body, query] 7本。**1本も落とさない**（落とすとそこだけ開いていても緑） */
const WAYS = [
  ["GET", "/island-api/cardimport", {}, {}],
  ["GET", `/island-api/cardimport/img/${S.c1}`, {}, {s: "t"}],
  ["POST", "/island-api/cardimport/decide", {shas: [S.c1], exclude: true}],
  ["POST", "/island-api/cardimport/calib",
    {answers: [{sha: S.cal, answer: "yes"}]}],
  ["POST", "/island-api/cardimport/register", {batch: BATCH, max: 1}],
  ["POST", "/island-api/cardimport/register", {batch: BATCH, dryRun: true}],
  ["POST", "/island-api/cardimport/put",
    {sha: S.c8, cand: CAND.toString("base64"),
      thumb: THUMB.toString("base64")}],
];

/** [名前, token, rawAuth, あやとか] */
const WHO = [
  ["合言葉なし", null, null, false],
  ["Bearer でない", null, "Basic zzz", false],
  ["にせの合言葉", "nope", null, false],
  ["本物だが admin でない", "hito", null, false],
  ["あやと（admin）", "boss", null, true],
];

console.log(`\n# 口の守り（${WHO.length}とおり × ${WAYS.length}本）`);
for (const [tag, token, rawAuth, isOwner] of WHO) {
  const wrong = [];
  const wrote = [];
  const peeked = [];
  for (const [method, path, body, q] of WAYS) {
    seed();
    zero();
    const r = await call(method, path, token, body ?? {}, q ?? {}, rawAuth);
    if (isOwner) {
      if (r.status !== 200) wrong.push(`${method} ${path.slice(11, 40)}=${r.status}`);
      continue;
    }
    if (r.status !== 403) wrong.push(`${method} ${path.slice(11, 40)}=${r.status}`);
    if (COUNT.writes || COUNT.objWrites) wrote.push(path.slice(11, 40));
    // 断るのに引いてよいのは `islandUsers` の1回だけ（合言葉がほどけなければ0回）
    if (COUNT.reads > (token === "hito" ? 1 : 0) || COUNT.objReads) {
      peeked.push(`${path.slice(11, 40)}(読み ${COUNT.reads}・置き場 ${COUNT.objReads})`);
    }
  }
  if (isOwner) {
    check(`${tag}: ${WAYS.length}本とも 200`, wrong.length === 0,
      wrong.join(" / "));
  } else {
    check(`${tag}: ${WAYS.length}本とも 403`, wrong.length === 0,
      wrong.join(" / "));
    check(`${tag}: 1バイトも書いていない`, wrote.length === 0,
      wrote.join(" / "));
    check(`${tag}: 断るのに候補も置き場も読んでいない`, peeked.length === 0,
      peeked.join(" / "));
  }
}

/* ---------------- 3 sha の形 ---------------- */

console.log("\n# sha の形");
seed();
{
  const bads = [
    "z".repeat(64),
    "a".repeat(63),
    "A".repeat(64),
    `${"a".repeat(63)}%2F`,
    "",
  ];
  const wrong = [];
  for (const b of bads) {
    zero();
    const r = await call("GET", `/island-api/cardimport/img/${b}`, "boss");
    if (r.status !== 400 || COUNT.objReads) {
      wrong.push(`${JSON.stringify(b.slice(0, 8))}…=${r.status}/読み${COUNT.objReads}`);
    }
  }
  check("形の違う sha は 400 で、置き場を読まない", wrong.length === 0,
    wrong.join(" / "));
  zero();
  const t = await call("GET", `/island-api/cardimport/img/${S.c1}`, "boss",
    {}, {s: "t"});
  check("一覧用（?s=t）は thumb を返す・private",
    t.status === 200 && Buffer.isBuffer(t.body) && t.body.equals(THUMB) &&
      String(t.headers["cache-control"]).startsWith("private") &&
      t.headers["content-type"] === "image/webp",
    `${t.status} ${t.headers["cache-control"]}`);
  const c = await call("GET", `/island-api/cardimport/img/${S.c1}`, "boss");
  check("s が無ければ本体を返す",
    c.status === 200 && Buffer.isBuffer(c.body) && c.body.equals(CAND));
  const n = await call("GET", `/island-api/cardimport/img/${sha("9")}`, "boss");
  check("無いものは 404", n.status === 404, String(n.status));
  zero();
  const d = await call("POST", "/island-api/cardimport/decide", "boss",
    {shas: [S.c1, "nope"], exclude: true});
  check("外す口も、形の違う sha が混ざれば 400 で何も書かない",
    d.status === 400 && COUNT.writes === 0, `${d.status} 書き${COUNT.writes}`);
  zero();
  const p = await call("POST", "/island-api/cardimport/put", "boss",
    {sha: "../../x", cand: CAND.toString("base64"),
      thumb: THUMB.toString("base64")});
  const p2 = await call("POST", "/island-api/cardimport/put", "boss",
    {sha: S.c8, cand: Buffer.alloc(4096, 1).toString("base64"),
      thumb: THUMB.toString("base64")});
  check("置く口: 形の違う sha・webp でない中身は 400 で、置き場に書かない",
    p.status === 400 && p2.status === 400 && COUNT.objWrites === 0,
    `${p.status} ${p2.status} 書き${COUNT.objWrites}`);
}

/* ---------------- 4 下見 ---------------- */

console.log("\n# 下見（dryRun）");
seed();
zero();
{
  const r = await call("POST", "/island-api/cardimport/register", "boss",
    {batch: BATCH, dryRun: true});
  check("下見は1バイトも書かない",
    r.status === 200 && COUNT.writes === 0 && COUNT.objWrites === 0,
    `${r.status} 書き${COUNT.writes} 置き場${COUNT.objWrites}`);
  const b = r.body ?? {};
  // 拾うのは c1・c2・10分たった registering の3枚。外した・登録済み・認識合わせ・別の回は拾わない
  check("下見: 3枚・その日に2人（同じ人の2回は1人）",
    b.total === 3 && b.days?.length === 1 && b.days[0].day === DAY &&
      b.days[0].count === 3 && b.days[0].people === 2 && b.people === 2,
    JSON.stringify(b));
  const text = JSON.stringify(b);
  check("下見: 名前もチャンネルIDも返さない",
    !text.includes("偽の名前") && !text.includes("UCfake"));
}

/* ---------------- 5〜8・11 登録 ---------------- */

console.log("\n# 登録");
seed();
zero();
{
  const r = await call("POST", "/island-api/cardimport/register", "boss",
    {batch: BATCH, max: 20});
  const b = r.body ?? {};
  check("登録: 3枚が registered・残り0",
    r.status === 200 && b.registered === 3 && b.remaining === 0 &&
      Array.isArray(b.failed) && b.failed.length === 0 &&
      b.failedTotal === 0 && b.results?.length === 3 &&
      b.results.every((x) => x.status === "registered"),
    JSON.stringify(b));
  const imgs = [...STORE.entries()].filter(([k]) =>
    k.startsWith("islandStreamEventImage/"));
  check("写真が3枚でき、どれも importSha を持つ",
    imgs.length === 3 && imgs.every(([, v]) => /^[0-9a-f]{64}$/.test(v.importSha)),
    `${imgs.length}枚`);
  check("写真は手で貼るのと同じ形（role card・その日・置き場は nordic/photos）",
    imgs.every(([, v]) => v.role === "card" && v.day === DAY &&
      v.streamEventId === "ev1" &&
      String(v.storagePath).startsWith(`nordic/photos/${DAY}/`)));
  check("カードがその日の人数ぶん（3枚 × 2人）",
    count("islandCards/") === 6, `${count("islandCards/")}枚`);
  check("候補の札は registered と imageId",
    [S.c1, S.c2, S.stale].every((s) =>
      doc("islandCardImport", s).status === "registered" &&
      imgs.some(([k]) => k.endsWith(`/${doc("islandCardImport", s).imageId}`))));
  check("10分たっていない registering は拾わない",
    doc("islandCardImport", S.fresh).status === "registering");
  check("外したもの（excluded）は登録が拾わない",
    doc("islandCardImport", S.ex).status === "excluded" &&
      !imgs.some(([, v]) => v.importSha === S.ex));
  check("登録済み・認識合わせ・別の回の候補には触らない",
    doc("islandCardImport", S.reg).imageId === "img-old" &&
      doc("islandCardImport", S.cal).status === "calib" &&
      doc("islandCardImport", S.c8).status === "candidate");
  check("取り込みは1日の枠を使わない", count("islandRate/") === 0,
    `${count("islandRate/")}件`);
  check("回の記録に登録数が入る",
    doc("islandCardImportRuns", BATCH).registered === 4 &&
      doc("islandCardImportRuns", BATCH).registeredAt > 0,
    JSON.stringify(doc("islandCardImportRuns", BATCH)));

  // 写真を置いたあと、札を registered に書く前に落ちた回
  const before = doc("islandCardImport", S.c1).imageId;
  STORE.set(`islandCardImport/${S.c1}`, {
    ...doc("islandCardImport", S.c1), status: "candidate",
  });
  const again = await call("POST", "/island-api/cardimport/register", "boss",
    {batch: BATCH, max: 20});
  const imgs2 = count("islandStreamEventImage/", (v) => v.importSha === S.c1);
  check("同じ候補を2回登録しても写真は1枚",
    imgs2 === 1 && again.body?.already === 1 && again.body?.registered === 1 &&
      doc("islandCardImport", S.c1).status === "registered" &&
      doc("islandCardImport", S.c1).imageId === before,
    `${imgs2}枚 ${JSON.stringify(again.body)}`);
  check("2回目でカードも増えない", count("islandCards/") === 6,
    `${count("islandCards/")}枚`);
  const third = await call("POST", "/island-api/cardimport/register", "boss",
    {batch: BATCH});
  check("3回目は何もしない", third.body?.registered === 0 &&
    third.body?.already === 0 && third.body?.remaining === 0,
  JSON.stringify(third.body));

  // 本体が無い1枚は failed。画面が0まで呼び続けないよう、残りに数えない
  seed();
  OBJ.delete(`cardImport/cand/${S.c2}.webp`);
  const f = await call("POST", "/island-api/cardimport/register", "boss",
    {batch: BATCH, max: 20});
  check("本体が無い1枚は failed・残りに数えない",
    f.body?.failed?.length === 1 && f.body.failed[0].sha === S.c2 &&
      f.body.failed[0].error === "no file" && f.body?.failedTotal === 1 &&
      f.body?.remaining === 0 &&
      doc("islandCardImport", S.c2).status === "failed" &&
      doc("islandCardImport", S.c2).error === "no file",
    JSON.stringify(f.body));
  OBJ.set(`cardImport/cand/${S.c2}.webp`, {buf: CAND, opts: {}});
  const f2 = await call("POST", "/island-api/cardimport/register", "boss",
    {batch: BATCH, max: 20});
  const f3 = await call("POST", "/island-api/cardimport/register", "boss",
    {batch: BATCH, max: 20, retryFailed: true});
  check("failed は retryFailed のときだけ拾い直す",
    f2.body?.registered === 0 && f3.body?.registered === 1 &&
      doc("islandCardImport", S.c2).status === "registered",
    `${JSON.stringify(f2.body)} ${JSON.stringify(f3.body)}`);
}

/* ---------------- 8 手で貼る口は今までどおり ---------------- */

console.log("\n# 手で貼る口（/nordic/photos）");
seed();
{
  const r = await call("POST", "/island-api/nordic/photos", "boss",
    {day: DAY, image: CAND.toString("base64"), w: 10, h: 10});
  const v = r.body?.photo ?? {};
  check("手で貼る口は今までどおり200で、枠を1つ使う",
    r.status === 200 && count("islandRate/") === 1,
    `${r.status} 枠${count("islandRate/")}`);
  check("手で貼った書類には importSha の欄が無い", !("importSha" in v) &&
    count("islandStreamEventImage/", (x) => "importSha" in x) === 0);
}

/* ---------------- 9・10 外す／戻す・認識合わせ ---------------- */

console.log("\n# 外す／戻す・認識合わせ");
seed();
{
  STORE.set(`islandCardImport/${S.c2}`, {
    ...doc("islandCardImport", S.c2), status: "registered", imageId: "img-x",
  });
  const r = await call("POST", "/island-api/cardimport/decide", "boss",
    {shas: [S.c1, S.c2, S.cal, S.stale, sha("9")], exclude: true});
  check("外せるのは candidate だけ",
    r.body?.changed === 1 && r.body?.skipped === 4 &&
      doc("islandCardImport", S.c1).status === "excluded" &&
      doc("islandCardImport", S.c2).status === "registered" &&
      doc("islandCardImport", S.cal).status === "calib" &&
      doc("islandCardImport", S.stale).status === "registering",
    JSON.stringify(r.body));
  const back = await call("POST", "/island-api/cardimport/decide", "boss",
    {shas: [S.c1, S.ex, S.c2], exclude: false});
  check("戻せるのは excluded だけ",
    back.body?.changed === 2 &&
      doc("islandCardImport", S.c1).status === "candidate" &&
      doc("islandCardImport", S.ex).status === "candidate" &&
      doc("islandCardImport", S.c2).status === "registered",
    JSON.stringify(back.body));
  const bad = await call("POST", "/island-api/cardimport/decide", "boss",
    {shas: [S.c1], exclude: "yes"});
  check("exclude は true / false だけ", bad.status === 400);

  const c = await call("POST", "/island-api/cardimport/calib", "boss",
    {answers: [{sha: S.cal, answer: "yes"}, {sha: S.c1, answer: "no"}]});
  check("認識合わせの答えは calib の書類にだけ書く",
    c.body?.saved === 1 && doc("islandCardImport", S.cal).calibAnswer === "yes" &&
      !("calibAnswer" in doc("islandCardImport", S.c1)),
    JSON.stringify(c.body));
  const c2 = await call("POST", "/island-api/cardimport/calib", "boss",
    {answers: [{sha: S.cal, answer: "maybe"}]});
  check("答えは yes / no / null だけ", c2.status === 400);

  const list = await call("GET", "/island-api/cardimport", "boss");
  const items = list.body?.items ?? [];
  check("一覧はいちばん新しい回の候補を返す（別の回は混ぜない）",
    list.body?.batch === BATCH && items.length === 7 &&
      !items.some((x) => x.sha === S.c8),
    `${list.body?.batch} ${items.length}`);
  check("一覧に置き場の道を出さない",
    !JSON.stringify(list.body).includes("cardImport/"));
}

/* ---------------- 対照 ---------------- */

/** [名前, ファイル, 探す字, 置き換える字, 落ちてほしい確かめ] */
const BREAKS = [
  ["あやとかを見るのをやめる", "cardImport.js",
    "if (!uid) {", "if (false) {",
    "合言葉なし: 7本とも 403"],
  ["sha の形を見るのをやめる", "cardImport.js",
    "if (!exports.SHA.test(sha)) {", "if (false) {",
    "形の違う sha は 400 で、置き場を読まない"],
  ["同じ importSha を引くのをやめる", "cardImport.js",
    "if (!had.empty) {", "if (false) {",
    "同じ候補を2回登録しても写真は1枚"],
  ["registering を10分待たずに拾う", "cardImport.js",
    ">= exports.STALE_MS", ">= 0",
    "10分たっていない registering は拾わない"],
  ["取り込みでも1日の枠を数える", "islandApi.js",
    "opts.quota !== false &&", "true &&",
    "取り込みは1日の枠を使わない"],
  ["外す口が何でも動かす", "cardImport.js",
    "if (exclude && now === \"candidate\")", "if (exclude)",
    "外せるのは candidate だけ"],
  ["下見でも登録してしまう", "cardImport.js",
    "if (q.body.dryRun === true) {", "if (false) {",
    "下見は1バイトも書かない"],
  ["外したものも登録が拾う", "cardImport.js",
    "if (st === \"candidate\")", "if (st === \"candidate\" || st === \"excluded\")",
    "外したもの（excluded）は登録が拾わない"],
];

if (BUILD) {
  console.log("\n# 対照（壊した写しで回して、狙った行が赤くなるか）");
  /**
   * lib の写しを作る。
   * @param {string | null} file 壊すファイル
   * @param {string | null} broken 壊した中身
   * @return {string} 写しの置き場
   */
  const copyLib = (file, broken) => {
    const box = mkdtempSync(join(tmpdir(), "cardimport-"));
    cpSync(LIB, box, {recursive: true});
    try {
      symlinkSync(join(FUNCTIONS, "node_modules"), join(box, "node_modules"));
    } catch {
      /* 既に在るなら、そのまま */
    }
    if (file) writeFileSync(join(box, file), broken, "utf8");
    return box;
  };
  const runWith = (box) =>
    spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      env: {...process.env, CARDIMPORT_LIB_DIR: box},
      encoding: "utf8",
    });
  {
    const box = copyLib(null, null);
    const run = runWith(box);
    rmSync(box, {recursive: true, force: true});
    check("壊していない写しは緑のまま", run.status === 0,
      `終了コード ${run.status} / ${(run.stdout ?? "").slice(-400)}`);
  }
  for (const [what, file, from, to, want] of BREAKS) {
    const src = readFileSync(join(LIB, file), "utf8");
    if (!src.includes(from)) {
      check(`${what}: 壊す字が当たる`, false, `lib/${file} に「${from}」が無い`);
      continue;
    }
    const box = copyLib(file, src.replace(from, to));
    const run = runWith(box);
    rmSync(box, {recursive: true, force: true});
    const hit = (run.stdout ?? "").includes(`NG   ${want}`);
    check(`${what}: 「${want}」が赤くなる`, run.status === 1 && hit,
      `終了コード ${run.status} / その行が赤い: ${hit}`);
  }
}

console.log(`\n通った ${ok}件 / 落ちた ${bad}件`);
if (ok === 0) {
  console.log("数えるものが1件も無かった。");
  process.exit(2);
}
process.exit(bad ? 1 : 0);
