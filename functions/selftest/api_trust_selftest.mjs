/**
 * **口（`/island-api/*`）に、信じてはいけない値を送ったら拒まれること。**
 *
 * `me_channel_selftest.mjs`（2026-10-14）で `POST /me` の1本を塞いだあと、
 * **同じ形が他に無いか**を口ぜんぶで洗うために足した見張り。
 *
 * ## 字を読むのではなく、口を実際に叩く
 *
 * あちらは `islandApi.ts` を**字として**読んでいる（「`body.channelId` を
 * 読む行が無い」）。字で見る確かめは「無いこと」しか言えないし、
 * 欄の名前を変えられたら黙って通る。
 *
 * ここは**本物のルータを動かす。** `firebase-functions/v2/https` の
 * `onRequest` を差し替えて、`islandApi.ts` が登録しようとした関数を
 * そのまま掴む。Firestore も YouTube も偽物に差し替えるので、
 * **本番にも資格情報にも1バイトも触らない。**
 *
 *     onRequest(opts, handler) → handler を持って帰る
 *     admin.firestore()        → 手元の Map
 *     admin.auth()             → 決め打ちの合言葉
 *     globalThis.fetch         → 決め打ちのチャンネル
 *
 * ## 4つを見る
 *
 * | | 何を | どう |
 * | --- | --- | --- |
 * | 1 | **本人のものかを確かめずに、送られた id で書かない／読まない** | 他人の id を名乗って叩き、403/400 と**書き込み0**を見る |
 * | 2 | **長さ・型・値域を、画面ではなくサーバが守っている** | `GET /state` の `limits` を超える字を送り、**置き場に入った字**を測る |
 * | 3 | **窓が埋まったら鳴る** | 窓より1件多く仕込んで、`logger.error` が出るのを見る |
 * | 4 | **人の素性が、返ってはいけない口から返らない** | 公開の口の返りを端まで歩いて、uid・チャンネルID・端末IDを数える |
 *
 * ## 「拒まれた」は、状態だけでは足りない
 *
 * 400 を返しながら先に1件書いていたら、塞がっていない。だから
 * **どの拒否も「4xx」と「書き込み0」の2つで見る**（`sticky_pic_selftest.mjs`
 * の「どれに外れても、置き場には1バイトも書かない」と同じ形）。
 *
 * ## 先に「通る」ことを見る（`docs/island-standards.md` §15）
 *
 * 偽の Firestore が壊れていると、**どの口も 500 で落ちて「全部拒まれた」に
 * 見える。** だから最初に、**正しい値なら通って、ちゃんと書かれる**ことを
 * 数本見てから、断るほうを数える。通る本数が0なら、数字を1つも出さずに
 * 2 で落ちる（`docs/island-misses.md` #19）。
 *
 * ## 対照（`docs/island-standards.md` §13）
 *
 * **毎回いっしょに、わざと検査を外した写しで回して、狙った行が赤くなるか**を
 * 見る。外すのは7つ（下の `BREAKS`）。
 *
 * 回しかた:
 *
 * ```bash
 * node functions/selftest/api_trust_selftest.mjs
 * ```
 *
 * 0=ぜんぶ通った / 1=抜けたものがある / 2=確かめられなかった
 */

import {execFileSync, spawnSync} from "node:child_process";
import {cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync,
  writeFileSync} from "node:fs";
import {createRequire} from "node:module";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FUNCTIONS = join(HERE, "..");
/** 対照は、壊した写しを指すためにここを差し替える */
const LIB = process.env.TRUST_LIB_DIR || join(FUNCTIONS, "lib");
/* **対照は毎回いっしょに回す。** 別の合言葉を付けたときだけ回る形にすると
   CI では一生回らない（`me_channel_selftest.mjs` と同じ決め）。
   写しの中から自分を呼ぶときは `TRUST_LIB_DIR` が立つので、そこで止まる。 */
const CONTROL = !process.env.TRUST_LIB_DIR;

/* ================= 7. 口の一覧を、手で持たない ================= */

/**
 * **照合式そのものから、口の一覧を起こす。**
 *
 * 上の `OWNER_ONLY` と「公開の口」は手で並べた表なので、**口が1本増えた日に
 * 黙って見張りの外に落ちる**（`docs/island-standards.md` §8「名簿・一覧を
 * 手で作らない」）。だからここで、`functions/src/*.ts` の `if (method === …)`
 * を全部数えて、下の表と**1本でも違ったら赤くする。**
 *
 * **これは「全部に関所が在る」の確かめではない。** 「一覧が古くなっていない」
 * の確かめ。増えたら、ここと `OWNER_ONLY` と `docs/island-api.md` の
 * 3つを同じ回に直すことになる。
 */
function scanRoutes() {
  const dir = join(FUNCTIONS, "src");
  const out = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
    /* コメントは落とす。**行は潰さない**（中の `method === "GET"` を
       口として数えないため。`docs/island-audit.md` の決まりと同じ）。 */
    const code = readFileSync(join(dir, f), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
      .replace(/\/\/[^\n]*/g, "");
    const re =
      /if \(\s*((?:q\.)?method === "(?:GET|POST|DELETE|PUT|PATCH)"[^)]*?|[A-Za-z]+ && (?:q\.)?method === "(?:GET|POST|DELETE|PUT|PATCH)")\s*\)\s*\{/g;
    let m;
    while ((m = re.exec(code))) {
      /* 引用符は `'` にそろえる（この一覧を JS の字として持つため） */
      out.push(`${f} ${m[1].replace(/\s+/g, " ").replace(/"/g, "'")}`);
    }
  }
  return out.sort();
}

/**
 * **いま在る口の照合式。** `node functions/selftest/api_trust_selftest.mjs
 * --routes` が、この並びをそのまま書き出す。
 *
 * 口を足した／消した／道を変えたら、ここも同じ回に直す。
 * **直すときは `OWNER_ONLY` と `docs/island-api.md` の表も一緒に。**
 */
const KNOWN_ROUTES = [
  "cards.ts q.method === 'GET' && q.path === '/cards'",
  "cards.ts q.method === 'GET' && q.path === '/cards/mine'",
  "cards.ts q.method === 'POST' && move",
  "donors.ts q.method === 'DELETE'",
  "donors.ts q.method === 'GET' && q.path === '/donors'",
  "donors.ts q.method === 'POST'",
  "fundDesk.ts q.method === 'DELETE' && chatOne",
  "fundDesk.ts q.method === 'DELETE' && goalOne",
  "fundDesk.ts q.method === 'DELETE' && spendOne",
  "fundDesk.ts q.method === 'GET' && q.path === '/fund/desk'",
  "fundDesk.ts q.method === 'GET' && q.path === '/fund/feed'",
  "fundDesk.ts q.method === 'GET' && q.path === '/fund/spends'",
  "fundDesk.ts q.method === 'POST' && q.path === '/fund/chats'",
  "fundDesk.ts q.method === 'POST' && q.path === '/fund/goals'",
  "fundDesk.ts q.method === 'POST' && q.path === '/fund/replay'",
  "fundDesk.ts q.method === 'POST' && q.path === '/fund/spends'",
  "islandApi.ts method === 'DELETE' && imageOne",
  "islandApi.ts method === 'DELETE' && photoMatch",
  "islandApi.ts method === 'DELETE' && picMatch",
  "islandApi.ts method === 'GET' && abFund",
  "islandApi.ts method === 'GET' && abRp",
  "islandApi.ts method === 'GET' && abWss",
  "islandApi.ts method === 'GET' && eventImages",
  "islandApi.ts method === 'GET' && path === '/fork'",
  "islandApi.ts method === 'GET' && path === '/fund'",
  "islandApi.ts method === 'GET' && path === '/fund/history'",
  "islandApi.ts method === 'GET' && path === '/nextplans'",
  "islandApi.ts method === 'GET' && path === '/nordic/photos'",
  "islandApi.ts method === 'GET' && path === '/notes'",
  "islandApi.ts method === 'GET' && path === '/notes/themes'",
  "islandApi.ts method === 'GET' && path === '/poll'",
  "islandApi.ts method === 'GET' && path === '/state'",
  "islandApi.ts method === 'GET' && path === '/stickies'",
  "islandApi.ts method === 'GET' && path === '/stickies/waiting'",
  "islandApi.ts method === 'GET' && path === '/streamevents'",
  "islandApi.ts method === 'GET' && planOne",
  "islandApi.ts method === 'GET' && rlOne",
  "islandApi.ts method === 'POST' && abSc",
  "islandApi.ts method === 'POST' && abTok",
  "islandApi.ts method === 'POST' && archiveMatch",
  "islandApi.ts method === 'POST' && eventImages",
  "islandApi.ts method === 'POST' && factMatch",
  "islandApi.ts method === 'POST' && forkMatch",
  "islandApi.ts method === 'POST' && heartMatch",
  "islandApi.ts method === 'POST' && imageOne",
  "islandApi.ts method === 'POST' && path === '/alertbox/session'",
  "islandApi.ts method === 'POST' && path === '/current'",
  "islandApi.ts method === 'POST' && path === '/me'",
  "islandApi.ts method === 'POST' && path === '/nextplans'",
  "islandApi.ts method === 'POST' && path === '/nordic/photos'",
  "islandApi.ts method === 'POST' && path === '/notes'",
  "islandApi.ts method === 'POST' && path === '/notes/themes'",
  "islandApi.ts method === 'POST' && path === '/roulette/doneru'",
  "islandApi.ts method === 'POST' && path === '/roulette/start'",
  "islandApi.ts method === 'POST' && path === '/roulette/yt-token'",
  "islandApi.ts method === 'POST' && path === '/stickies'",
  "islandApi.ts method === 'POST' && path === '/visit'",
  "islandApi.ts method === 'POST' && planArchive",
  "islandApi.ts method === 'POST' && planHeart",
  "islandApi.ts method === 'POST' && planOne",
  "islandApi.ts method === 'POST' && planStatus",
  "islandApi.ts method === 'POST' && planVideos",
  "islandApi.ts method === 'POST' && pollMatch",
  "islandApi.ts method === 'POST' && replyMatch",
  "islandApi.ts method === 'POST' && rlChat",
  "islandApi.ts method === 'POST' && rlItems",
  "islandApi.ts method === 'POST' && rlPost",
  "islandApi.ts method === 'POST' && rlSet",
  "islandApi.ts method === 'POST' && rlSpin",
  "islandApi.ts method === 'POST' && seenMatch",
  "islandCharacter.ts ab && q.method === 'GET'",
  "islandCharacter.ts img && q.method === 'GET'",
  "islandCharacter.ts q.method === 'DELETE' && one",
  "islandCharacter.ts q.method === 'GET' && q.path === '/characters'",
  "islandCharacter.ts q.method === 'GET' && q.path === '/characters/lookup'",
  "publicPurge.ts q.method === 'GET'",
];

if (process.argv.includes("--routes")) {
  console.log(scanRoutes().map((x) => `  "${x}",`).join("\n"));
  process.exit(0);
}

let ok = 0;
let bad = 0;
/** 落ちた行の名前。**最後の1行に出す**（回し役はそこしか見せない） */
const fell = [];

/**
 * 1件の確かめ。
 * @param {string} name 何を見ているか
 * @param {boolean} good 通ったか
 * @param {string} [why] 落ちたときに出す中身（**偽の字だけ**）
 */
function check(name, good, why = "") {
  if (good) {
    ok += 1;
    console.log(`  ok   ${name}`);
    return;
  }
  bad += 1;
  fell.push(name);
  console.log(`  NG   ${name}${why ? ` — ${why}` : ""}`);
}

/** 確かめようがない。**数字を1つも出さずに落ちる。** */
const blind = (why) => {
  console.error(`確かめられなかった: ${why}`);
  process.exit(2);
};

/* ================= 偽の Firestore ================= */

/** コレクション名 → 書類ID → 中身。**ぜんぶ偽の字。** */
const store = new Map();
/** 起きた書き込み。`{col, id, kind}` だけ。**中身は控えない。** */
let writes = [];
/** true のあいだ、書き込みが落ちる。**500 の道を通すため。** */
let boom = false;
/** 出たログ。**素性が1文字も出ていないかを、あとで数える。** */
let logs = [];

/**
 * 1件置く（仕込み用。`writes` には数えない）。
 * @param {string} col コレクション名
 * @param {string} id 書類ID
 * @param {object} v 中身
 */
function seed(col, id, v) {
  if (!store.has(col)) store.set(col, new Map());
  store.get(col).set(id, v);
}

/** 書類1件の見え方（Firestore の snapshot のかわり）。 */
const snapOf = (col, id, v) => ({
  id,
  exists: v !== undefined,
  data: () => (v === undefined ? undefined : {...v}),
  get: (k) => (v === undefined ? undefined : v[k]),
  ref: refOf(col, id),
  createTime: null,
});

/** 書類への参照。 */
function refOf(col, id) {
  return {
    id,
    path: `${col}/${id}`,
    _col: col,
    get: async () => snapOf(col, id, store.get(col)?.get(id)),
    set: async (v, opt) => {
      if (boom) throw new Error("偽の置き場がこけました");
      writes.push({col, id, kind: "set"});
      const cur = store.get(col)?.get(id);
      seed(col, id, opt?.merge && cur ? {...cur, ...v} : {...v});
    },
    update: async (v) => {
      writes.push({col, id, kind: "update"});
      seed(col, id, {...(store.get(col)?.get(id) ?? {}), ...v});
    },
    delete: async () => {
      writes.push({col, id, kind: "delete"});
      store.get(col)?.delete(id);
    },
    collection: () => query(`${col}/${id}`),
  };
}

/** `where` の照合。Firestore が持っている演算子のうち、使うものだけ。 */
function matches(v, [field, op, want]) {
  const x = v?.[field];
  if (op === "==") return x === want;
  if (op === "!=") return x !== want && x !== undefined;
  if (op === "in") return Array.isArray(want) && want.includes(x);
  if (op === ">=") return x >= want;
  if (op === "<=") return x <= want;
  blind(`偽の Firestore が知らない演算子: ${op}`);
  return false;
}

/**
 * コレクション（と、絞り込みの途中）。
 * @param {string} col コレクション名
 * @param {object} [q] 積んである絞り込み
 * @return {object} Firestore の Query のかわり
 */
function query(col, q = {where: [], order: [], lim: 0, after: null}) {
  const next = (patch) => query(col, {...q, ...patch});
  return {
    _col: col,
    doc: (id) => refOf(col, id ?? `auto-${Math.random().toString(36).slice(2)}`),
    where: (f, op, v) => next({where: [...q.where, [f, op, v]]}),
    orderBy: (f, dir) => next({order: [...q.order, [f, dir ?? "asc"]]}),
    limit: (n) => next({lim: n}),
    startAfter: (...v) => next({after: v}),
    select: () => next({}),
    add: async (v) => {
      const id = `auto-${(store.get(col)?.size ?? 0) + 1}`;
      writes.push({col, id, kind: "add"});
      seed(col, id, {...v});
      return refOf(col, id);
    },
    get: async () => {
      let rows = [...(store.get(col) ?? new Map()).entries()]
        .filter(([, v]) => q.where.every((w) => matches(v, w)));
      for (const [f, dir] of [...q.order].reverse()) {
        rows.sort(([ia, a], [ib, b]) => {
          const [xa, xb] = f === "__name__" ? [ia, ib] : [a?.[f], b?.[f]];
          const c = xa === xb ? 0 : (xa ?? 0) > (xb ?? 0) ? 1 : -1;
          return dir === "desc" ? -c : c;
        });
      }
      if (q.after) {
        /* 続きの位置。**並べ替えの先頭の欄だけ**で足りる（本物も同じ
           並びで切る）。当たらなければ頭から。 */
        const k = q.after[q.after.length - 1];
        const at = rows.findIndex(([id]) => id === k);
        if (at >= 0) rows = rows.slice(at + 1);
      }
      if (q.lim) rows = rows.slice(0, q.lim);
      const docs = rows.map(([id, v]) => snapOf(col, id, v));
      return {empty: !docs.length, size: docs.length, docs,
        forEach: (f) => docs.forEach(f)};
    },
  };
}

const fakeDb = {
  collection: (name) => query(name),
  doc: (p) => {
    const i = p.indexOf("/");
    return refOf(p.slice(0, i), p.slice(i + 1));
  },
  batch: () => {
    const q = [];
    return {
      set: (r, v, o) => q.push(() => r.set(v, o)),
      update: (r, v) => q.push(() => r.update(v)),
      delete: (r) => q.push(() => r.delete()),
      commit: async () => {
        for (const f of q) await f();
      },
    };
  },
  getAll: async (...refs) => Promise.all(refs.map((r) => r.get())),
  runTransaction: async (fn) =>
    fn({
      get: async (x) => (x.get ? x.get() : x),
      set: (r, v, o) => r.set(v, o),
      update: (r, v) => r.update(v),
      delete: (r) => r.delete(),
    }),
};

/** 本物の合言葉。**ぜんぶ偽の字。** */
const TOKENS = {
  "tok-ayato": {uid: "uid-ayato", name: "おーなー"},
  "tok-a": {uid: "uid-a", name: "ひとりめ"},
  "tok-b": {uid: "uid-b", name: "ふたりめ"},
};

const fakeAdmin = {
  apps: [],
  initializeApp: () => {
    fakeAdmin.apps.push({});
  },
  firestore: Object.assign(() => fakeDb, {
    FieldValue: {serverTimestamp: () => 0, delete: () => null},
    FieldPath: {documentId: () => "__name__"},
    Timestamp: {now: () => ({toMillis: () => Date.now()})},
  }),
  storage: () => {
    /* **置き場は持たない。** 絵を置く道へ落ちたら、そこで落ちて
       「拒まれた」に化ける——化けたことが分かるように、言って落ちる。 */
    throw new Error("偽の admin は置き場を持たない");
  },
  auth: () => ({
    verifyIdToken: async (t) => {
      const who = TOKENS[t];
      if (!who) throw new Error("bad token");
      return who;
    },
  }),
};

/* **オブジェクトも字にしてから控える。** `join(" ")` だけだと
   `logger.error("...", {path})` が `[object Object]` に潰れて、
   **道に入っていたチャンネルIDが見えなくなる**（2026-10-14 に、この潰れで
   対照が1本当たらなかった）。 */
const say = (a) =>
  a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ");
const fakeFunctions = {
  logger: {
    warn: (...a) => logs.push(`warn ${say(a)}`),
    info: (...a) => logs.push(`info ${say(a)}`),
    error: (...a) => logs.push(`error ${say(a)}`),
    debug: () => {},
  },
};

/* ================= lib を読み込む ================= */

if (CONTROL) {
  console.log("# tsc を回して、いまの src から読み込む");
  try {
    // -b: src が lib より新しいときだけ書き出す（src を変えれば作り直し、型の誤りでは今までどおり落ちる）。
    // Selftests では functions/selftest の見張りが同じ src から同じ lib を1本ずつ作り直していて、1本 10秒がほぼそれだった
    execFileSync(join(FUNCTIONS, "node_modules/.bin/tsc"), ["-b"], {cwd: FUNCTIONS});
  } catch (e) {
    blind(`tsc が通らない: ${String(e).slice(0, 200)}`);
  }
}

/** `onRequest` が受け取った本体。 */
let handler = null;
const nodeRequire = createRequire(join(FUNCTIONS, "package.json"));
const loaded = new Map();

/**
 * `lib/<名前>.js` を、偽の admin を渡して読み込む。
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
    if (id === "firebase-admin") return fakeAdmin;
    if (id === "firebase-functions") return fakeFunctions;
    if (id === "firebase-functions/v2/https") {
      return {onRequest: (_o, h) => {
        handler = h;
        return h;
      }};
    }
    if (id.startsWith("./")) return load(id.slice(2));
    return nodeRequire(id);
  };
  new Function("require", "exports", "module", "__filename", "__dirname", src)(
    req, mod.exports, mod, file, dirname(file),
  );
  loaded.set(name, mod.exports);
  return mod.exports;
}

/** 偽の YouTube。**本物の鍵も本物のチャンネルも持たない。** */
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes("mine=true")) {
    return {ok: true, status: 200, json: async () => ({items: [{
      id: "UCaaaaaaaaaaaaaaaaaaaaaa",
      snippet: {customUrl: "@mine-selftest", title: "にせもの",
        thumbnails: {medium: {url: "https://x.invalid/m.png"}}},
    }]})};
  }
  return {ok: true, status: 200, json: async () => ({items: []})};
};

try {
  load("islandApi");
} catch (e) {
  blind(`lib/islandApi.js を読み込めなかった: ${String(e).slice(0, 300)}`);
}
if (typeof handler !== "function") {
  blind("onRequest から本体を取り出せなかった");
}

/* ================= 口を叩く ================= */

/**
 * 1回叩く。**起きた書き込みと出たログを、その回ぶんだけ返す。**
 * @param {object} c 叩きかた（method / path / body / query / token）
 * @return {Promise<object>} 返り（code / body / wrote / logs）
 */
async function call(c) {
  writes = [];
  logs = [];
  const res = {
    code: 200, body: null, headers: {},
    status(n) {
      this.code = n;
      return this;
    },
    json(v) {
      this.body = v;
      return this;
    },
    set(k, v) {
      this.headers[String(k).toLowerCase()] = v;
      return this;
    },
    send(v) {
      this.body = v;
      return this;
    },
  };
  const req = {
    path: `/island-api${c.path}`,
    method: c.method,
    headers: c.token ? {authorization: `Bearer ${c.token}`} : {},
    body: c.body ?? {},
    query: c.query ?? {},
  };
  try {
    await handler(req, res);
  } catch (e) {
    return {code: 599, body: {error: String(e).slice(0, 120)},
      wrote: writes.length, logs: [...logs]};
  }
  return {code: res.code, body: res.body, headers: res.headers,
    wrote: writes.length, logs: [...logs]};
}

/** 仕込み。**ぜんぶ偽の字。本番の値は1つも置かない。** */
function setup() {
  store.clear();
  seed("islandUsers", "uid-ayato", {
    admin: true, channelId: "UCzzzzzzzzzzzzzzzzzzzzzz",
    alertboxId: "a".repeat(32), remoteId: "b".repeat(32), name: "おーなー",
  });
  seed("islandUsers", "uid-a", {
    channelId: "UCaaaaaaaaaaaaaaaaaaaaaa", name: "ひとりめ",
    showName: true, showPhoto: true,
  });
  seed("islandUsers", "uid-b", {
    channelId: "UCbbbbbbbbbbbbbbbbbbbbbb", name: "ふたりめ",
  });
  // 付箋1枚（ひとりめのもの）
  seed("islandNotes", "sticky-aaaaaa", {
    theme: "zatsudan", text: "にせの付箋", hearts: 0, byOwner: false,
    hidden: false, archived: false, cid: "c".repeat(36), uid: "uid-a",
    createdAt: Date.now(),
  });
  // 企画1件（ひとりめのもの）
  seed("islandStreamEvent", "plan-aaaaaa", {
    title: "にせの企画", by: "ひとりめ", hearts: 0, status: "proposed",
    hidden: false, archived: false, cid: "c".repeat(36), uid: "uid-a",
    createdAt: Date.now(), updatedAt: Date.now(),
  });
  // カード1枚（ふたりめのもの）
  seed("islandCards", `img-aaaaaa__UCbbbbbbbbbbbbbbbbbbbbbb`, {
    streamEventImageId: "img-aaaaaa", channelId: "UCbbbbbbbbbbbbbbbbbbbbbb",
    day: "2026-01-01", x: 10, y: 10,
  });
  // スタンプのことば（ふたりめのもの）
  seed("islandStampLine", "line-b", {
    channelId: "UCbbbbbbbbbbbbbbbbbbbbbb", lines: ["ふたりめのことば"],
  });
  // 遠隔操作の席（おーなーのもの）
  seed("islandRemote", "b".repeat(32), {owner: "uid-ayato", seq: 1});
  // ルーレットの席（おーなーのもの）
  seed("rouletteSessions", "d".repeat(32), {
    owner: "uid-ayato", items: [{id: "i1", label: "あ"}, {id: "i2", label: "い"}],
    status: "準備中",
  });
}

/* ================= 1. まず「通る」ことを見る ================= */

/** 通った本数。0 なら、断りの数は読めない（§15） */
let passed = 0;

console.log("\n# 0. 正しい値なら通って、ちゃんと書かれる（先にここを見る）");
{
  setup();
  const a = await call({method: "POST", path: "/visit",
    body: {cid: "c".repeat(36)}});
  check("`POST /visit` が通る", a.code === 200 && a.wrote > 0,
    `${a.code} / 書き込み ${a.wrote}`);
  if (a.code === 200) passed += 1;

  const b = await call({method: "POST", path: "/stickies",
    body: {theme: "zatsudan", text: "にせの字", cid: "c".repeat(36)}});
  check("`POST /stickies` が通る", b.code === 200 && b.wrote > 0,
    `${b.code} / 書き込み ${b.wrote}`);
  if (b.code === 200) passed += 1;

  const c = await call({method: "POST", path: "/nextplans",
    body: {title: "にせの企画", cid: "c".repeat(36)}});
  check("`POST /nextplans` が通る", c.code === 200 && c.wrote > 0,
    `${c.code} / 書き込み ${c.wrote}`);
  if (c.code === 200) passed += 1;

  const d = await call({method: "GET", path: "/state"});
  check("`GET /state` が返る", d.code === 200 && !!d.body?.limits,
    `${d.code}`);
  if (d.code === 200) passed += 1;

  const e = await call({method: "POST", path: "/current", token: "tok-ayato",
    body: {place: "にせの場所"}});
  check("`POST /current` が、あやとなら通る", e.code === 200 && e.wrote > 0,
    `${e.code} / 書き込み ${e.wrote}`);
  if (e.code === 200) passed += 1;

  /* **畳んだ口（#860。2026-10-14）。** 開いていたころは「入っている人に
     1件だけ返す」を見ていた。いまは誰が叩いても 410 で、**1バイトも
     読まない。** 「通る」の本数には数えない——ここは断る側。 */
  const f = await call({method: "GET", path: "/stampline/mine", token: "tok-b"});
  check("`GET /stampline/mine` は畳んである（410・書き込み0）",
    f.code === 410 && f.wrote === 0, `${f.code} / 書き込み ${f.wrote}`);

  const g = await call({method: "GET", path: "/cards/mine", token: "tok-b"});
  check("`GET /cards/mine` が、結んである人に返る",
    g.code === 200 && Array.isArray(g.body?.cards), `${g.code}`);
  if (g.code === 200) passed += 1;
}
if (passed < 4) {
  blind(`通った口が ${passed} 本しかない。断りの数は読めない（§15）`);
}

/* ================= 2. 身元を言い値で送る ================= */

/** 他人を名乗る・他人の id を指す。**どれも「4xx」と「書き込み0」。** */
const IMPERSONATE = [
  {
    name: "`POST /me` に channelId を添える",
    c: {method: "POST", path: "/me", token: "tok-a",
      body: {channelId: "UCbbbbbbbbbbbbbbbbbbbbbb"}},
    want: 400,
  },
  {
    name: "`POST /me` に合言葉が無い",
    c: {method: "POST", path: "/me", body: {}},
    want: 401,
  },
  {
    name: "`GET /cards/mine` に合言葉が無い",
    c: {method: "GET", path: "/cards/mine"},
    want: 401,
  },
  {
    name: "`POST /cards/{他人のカード}` を動かす",
    c: {method: "POST", path: "/cards/img-aaaaaa__UCbbbbbbbbbbbbbbbbbbbbbb",
      token: "tok-a", body: {x: 1, y: 1}},
    want: 403,
  },
  {
    /* **畳んだ口**（#860）。合言葉があっても無くても 410。
       **閉じた口は、閉じたことを確かめる。** 開いているつもりの
       行を残すと、開き直した日に誰も気づかない。 */
    name: "`POST /stampline/mine` は畳んである",
    c: {method: "POST", path: "/stampline/mine", token: "tok-a",
      body: {lines: ["よこどり"]}},
    want: 410,
  },
  {
    name: "`POST /stampline/mine` は丸腰でも畳んである",
    c: {method: "POST", path: "/stampline/mine", body: {lines: ["よこどり"]}},
    want: 410,
  },
  {
    name: "`GET /stickies?mine=1` に合言葉が無い",
    c: {method: "GET", path: "/stickies", query: {mine: "1"}},
    want: 401,
  },
  {
    name: "`GET /nextplans?mine=1` に合言葉が無い",
    c: {method: "GET", path: "/nextplans", query: {mine: "1"}},
    want: 401,
  },
  {
    name: "`POST /nextplans/{他人の企画}` を書き換える",
    c: {method: "POST", path: "/nextplans/plan-aaaaaa", token: "tok-b",
      body: {title: "よこどりした題", cid: "z".repeat(36)}},
    want: 403,
  },
  {
    name: "`POST /roulette/{知らない席}/spin`",
    c: {method: "POST", path: `/roulette/${"f".repeat(32)}/spin`,
      token: "tok-ayato", body: {}},
    want: 404,
  },
  {
    name: "`GET /alertbox/{知らない合言葉}/fund`",
    c: {method: "GET", path: `/alertbox/${"9".repeat(32)}/fund`},
    want: 404,
  },
  {
    name: "`POST /alertbox/{知らない合言葉}/superchat`",
    c: {method: "POST", path: `/alertbox/${"9".repeat(32)}/superchat`,
      body: {currency: "円", jpy: 500, id: "LCC.x"}},
    want: 404,
  },
];

console.log("\n# 1. 本人のものかを確かめずに、送られた id で書かない／読まない");
for (const t of IMPERSONATE) {
  setup();
  const r = await call(t.c);
  check(`${t.name} → ${t.want}・書き込み0`,
    r.code === t.want && r.wrote === 0,
    `${r.code} / 書き込み ${r.wrote} / ${JSON.stringify(r.body).slice(0, 90)}`);
}

console.log("\n# 1b. 名乗っても、他人のぶんは1件も出てこない");
{
  setup();
  /* **畳んだ口でも、中身が1文字も出ないことは見る**（#860）。
     410 を返すだけの作りでも、入れ物には他人のことばが入ったままなので、
     「閉じた」と「空を返す」を取り違えていないかを字で確かめる。 */
  const r = await call({method: "GET", path: "/stampline/mine", token: "tok-a"});
  check("畳んだ `/stampline/mine` に、他人のことばが1文字も乗らない",
    r.code === 410 && !JSON.stringify(r.body).includes("ふたりめのことば"),
    `${r.code} / ${JSON.stringify(r.body).slice(0, 90)}`);

  const m = await call({method: "GET", path: "/cards/mine", token: "tok-a"});
  check("`GET /cards/mine` に、他人のカードが乗らない",
    m.code === 200 && !JSON.stringify(m.body).includes("UCbbbb"),
    `${m.code} / ${JSON.stringify(m.body).slice(0, 90)}`);
}

/* ================= 3. 長さ・型・値域 ================= */

console.log("\n# 2. 長さ・型・値域を、画面ではなくサーバが守っている");
{
  setup();
  const st = await call({method: "GET", path: "/state"});
  const limits = st.body?.limits ?? {};
  check("`GET /state` が `limits` を返す",
    Object.keys(limits).length >= 5, JSON.stringify(limits));

  /* **置き場に入った字を測る。** 返りを測ると、返すときだけ切っている
     形（置き場には長いまま入る）を見逃す。 */
  const long = "あ".repeat(4000);

  setup();
  await call({method: "POST", path: "/stickies",
    body: {theme: "zatsudan", text: long, cid: "c".repeat(36)}});
  const sticky = [...(store.get("islandNotes") ?? new Map()).values()]
    .find((v) => v.text?.startsWith("あ"));
  check(`付箋の本文が、置き場で ${limits.note} 字に切られている`,
    (sticky?.text ?? "").length === limits.note,
    `${(sticky?.text ?? "").length} 字`);

  setup();
  await call({method: "POST", path: "/notes",
    body: {planId: "p1", text: long, cid: "c".repeat(36)}});
  const note = [...(store.get("islandNotes") ?? new Map()).values()]
    .find((v) => v.planId === "p1");
  check(`企画の付箋も、置き場で ${limits.note} 字`,
    (note?.text ?? "").length === limits.note,
    `${(note?.text ?? "").length} 字`);

  setup();
  await call({method: "POST", path: "/stickies/sticky-aaaaaa/reply",
    token: "tok-ayato", body: {text: long}});
  check(`返信が、置き場で ${limits.reply} 字`,
    (store.get("islandNotes")?.get("sticky-aaaaaa")?.reply ?? "").length ===
      limits.reply,
    `${(store.get("islandNotes")?.get("sticky-aaaaaa")?.reply ?? "").length} 字`);

  setup();
  await call({method: "POST", path: "/nextplans",
    body: {title: long, cid: "c".repeat(36)}});
  const plan = [...(store.get("islandStreamEvent") ?? new Map()).values()]
    .find((v) => v.title?.startsWith("あ"));
  check(`企画の題が、置き場で ${limits.planTitle} 字`,
    (plan?.title ?? "").length === limits.planTitle,
    `${(plan?.title ?? "").length} 字`);

  setup();
  await call({method: "POST", path: "/me", token: "tok-a",
    body: {nickname: long}});
  check(`島に出す名前が、置き場で ${limits.name} 字`,
    (store.get("islandUsers")?.get("uid-a")?.nickname ?? "").length ===
      limits.name,
    `${(store.get("islandUsers")?.get("uid-a")?.nickname ?? "").length} 字`);

  setup();
  const over = await call({method: "POST", path: "/stickies",
    body: {theme: "zatsudan", text: "ふつうの字", cid: "c".repeat(36),
      link: `https://x.invalid/${"a".repeat(limits.link + 10)}`}});
  check(`${limits.link} 字を超えるリンクは通らない・書き込み0`,
    over.code === 400 && over.wrote === 0,
    `${over.code} / 書き込み ${over.wrote}`);
}

/** 値域・型の断り。**どれも「4xx」と「書き込み0」。** */
const RANGE = [
  {
    name: "宛先の形が違う付箋",
    c: {method: "POST", path: "/stickies",
      body: {theme: "ダメな宛先", text: "ふつうの字", cid: "c".repeat(36)}},
    want: 400,
  },
  {
    name: "締め切った宛先への付箋",
    c: {method: "POST", path: "/stickies",
      body: {theme: "albania", text: "ふつうの字", cid: "c".repeat(36)}},
    want: 409,
  },
  {
    name: "端末IDが短すぎる付箋",
    c: {method: "POST", path: "/stickies",
      body: {theme: "zatsudan", text: "ふつうの字", cid: "ab"}},
    want: 400,
  },
  {
    name: "島に無い景色（`POST /current`）",
    c: {method: "POST", path: "/current", token: "tok-ayato",
      body: {place: "にせの場所", theme: "まほうの国"}},
    want: 400,
  },
  {
    /* `/remote`（島の遠隔操作）を使っていたが、2026-10-14 に口ごと消した
       （あやと「使い物にならなかったのでリバーとして欲しい。完全削除」）。
       **この試しは残す**——「表に無い行き先は断る」は口が1つ減っても要る。
       消えた道だと 404 が返るので、**はじめから存在しない道**に差し替えた。 */
    name: "表に無い行き先（`POST /そんな道はない`）",
    c: {method: "POST", path: "/そんな道はない", token: "tok-ayato", body: {}},
    want: 404,
  },
  {
    name: "題が4字に満たない企画",
    c: {method: "POST", path: "/nextplans",
      body: {title: "あ", cid: "c".repeat(36)}},
    want: 400,
  },
  {
    name: "12,000バイトを超える企画",
    c: {method: "POST", path: "/nextplans",
      body: {title: "にせの企画", cid: "c".repeat(36), note: "x".repeat(13000)}},
    want: 400,
  },
  {
    name: "端末IDが弱い企画（あとで直せる鍵になる）",
    c: {method: "POST", path: "/nextplans",
      body: {title: "にせの企画", cid: "みじかい"}},
    want: 400,
  },
];

for (const t of RANGE) {
  setup();
  const r = await call(t.c);
  check(`${t.name} → ${t.want}・書き込み0`,
    r.code === t.want && r.wrote === 0,
    `${r.code} / 書き込み ${r.wrote} / ${JSON.stringify(r.body).slice(0, 90)}`);
}

/* ---- 台帳に入る額。**口が2つあるので、両方の口で同じ線を見る。** ---- */

console.log("\n# 2b. 台帳に入る額の線は、どちらの口でも同じ");
/** 26文字の item id を `LCC.` の形に包む。**偽の字だけ。** */
const lcc = (tail) =>
  `LCC.${Buffer.from(`xxxxxxxxxxxxxxxxxx${tail}`, "latin1")
    .toString("base64url")}`;
const ITEM = lcc("abcdefghijklmnopqrstuvwxyz");
const ABOX = `/alertbox/${"a".repeat(32)}/superchat`;

for (const [name, body, want] of [
  ["ふつうの額", {currency: "円", jpy: 500, id: ITEM}, 200],
  ["0円", {currency: "円", jpy: 0, id: ITEM}, 400],
  ["負の額", {currency: "円", jpy: -5000, id: ITEM}, 400],
  ["**1,000万円を超える額**", {currency: "円", jpy: 99999999, id: ITEM}, 400],
  ["円以外", {currency: "USD", jpy: 500, id: ITEM}, 400],
  ["通知のテスト", {currency: "円", jpy: 500, id: ITEM, test: true}, 400],
  ["ほどけないID", {currency: "円", jpy: 500, id: "LCC.zzz"}, 400],
  ["数でない額", {currency: "円", jpy: "たくさん", id: ITEM}, 400],
]) {
  setup();
  const r = await call({method: "POST", path: ABOX, body});
  check(`配信の口に ${name} → ${want}` + (want === 200 ? "" : "・書き込み0"),
    r.code === want && (want === 200 ? r.wrote > 0 : r.wrote === 0),
    `${r.code} / 書き込み ${r.wrote}`);
}
for (const [name, body, want] of [
  ["ふつうの額", {day: "2026-01-01", yen: 500, who: "にせ"}, 200],
  ["**1,000万円を超える額**",
    {day: "2026-01-01", yen: 99999999, who: "にせ"}, 400],
]) {
  setup();
  const r = await call({method: "POST", path: "/fund/chats",
    token: "tok-ayato", body});
  check(`机の口に ${name} → ${want}`, r.code === want, `${r.code}`);
}

/* ================= 4. あやとだけの口を、丸腰で叩く ================= */

/**
 * **あやとだけの口。** `docs/island-api.md` の「あやとだけ」の行から起こし、
 * `grep -n 'ownerUid(' functions/src/*.ts` と突き合わせてある。
 * ここに無い口が増えたら、下の「口の数」が合わなくなって気づく。
 */
const OWNER_ONLY = [
  /* 付箋の貼り先（2026-10-14、#880）。足す・消すはあやとだけ。
     **`GET` は誰でも**（付箋を貼る人が貼り先を選ぶため）なのでここには入れない。 */
  ["POST", "/notes/themes"],
  ["DELETE", "/notes/themes/theme-aaaaaa"],
  ["POST", "/current"],
  ["POST", "/nordic/arrived"],
  ["POST", "/nordic/ended"],
  ["POST", "/nordic/photos"],
  ["DELETE", "/nordic/photos/img-aaaaaa"],
  ["POST", "/streamevents/plan-aaaaaa/images"],
  ["POST", "/streamevents/images/img-aaaaaa"],
  ["DELETE", "/streamevents/images/img-aaaaaa"],
  ["POST", "/stickies/sticky-aaaaaa/reply"],
  ["POST", "/stickies/sticky-aaaaaa/seen"],
  ["POST", "/stickies/sticky-aaaaaa/archive"],
  ["DELETE", "/stickies/sticky-aaaaaa/pic"],
  ["POST", "/nextplans/plan-aaaaaa/status"],
  ["POST", "/nextplans/plan-aaaaaa/videos"],
  ["POST", "/nextplans/plan-aaaaaa/archive"],
  ["POST", "/roulette/start"],
  ["POST", "/roulette/doneru"],
  ["POST", "/roulette/yt-token"],
  ["POST", `/roulette/${"d".repeat(32)}/comments`],
  ["POST", `/roulette/${"d".repeat(32)}/items`],
  ["POST", `/roulette/${"d".repeat(32)}/settings`],
  ["POST", `/roulette/${"d".repeat(32)}/spin`],
  ["POST", `/roulette/${"d".repeat(32)}/say`],
  ["POST", "/alertbox/session"],
  ["GET", "/fund/history"],
  ["GET", "/fund/desk"],
  ["GET", "/fund/feed"],
  ["GET", "/fund/spends"],
  ["POST", "/fund/spends"],
  ["DELETE", "/fund/spends/x"],
  ["POST", "/fund/goals"],
  ["DELETE", "/fund/goals/2026-01-01"],
  ["POST", "/fund/chats"],
  ["DELETE", "/fund/chats/x"],
  ["POST", "/fund/replay"],
  ["GET", "/donors"],
  ["POST", "/donors/abc"],
  ["DELETE", "/donors/abc"],
  ["GET", "/public-purge"],
  ["POST", "/public-purge"],
  ["POST", "/characters"],
  ["POST", "/characters/aaaaaaaaaaaa"],
  ["DELETE", "/characters/aaaaaaaaaaaa"],
  ["GET", "/stickies/waiting"],
];

console.log(
  `\n# 3. あやとだけの口（${OWNER_ONLY.length}本）を、丸腰とよその人で叩く`,
);
{
  let loose = [];
  for (const [method, path] of OWNER_ONLY) {
    for (const token of [undefined, "tok-a"]) {
      setup();
      const r = await call({method, path, token,
        body: {place: "にせ", sessionId: "b".repeat(32), names: [],
          text: "にせ", on: true, day: "2026-01-01", yen: 1, title: "にせ",
          label: "にせ", from: "2026-01-01", who: "にせ", kind: "chat",
          id: "x", status: "next", videoIds: [], items: [], lines: [],
          handle: "@にせ", emoji: "🐤", channelName: "にせ"}});
      if (r.code < 400 || r.wrote > 0) {
        loose.push(`${method} ${path} (${token ?? "丸腰"}) → ` +
          `${r.code} / 書き込み ${r.wrote}`);
      }
    }
  }
  check(`${OWNER_ONLY.length}本 × 2（丸腰・よその人）が、ぜんぶ 4xx・書き込み0`,
    loose.length === 0, loose.slice(0, 4).join(" / "));
  console.log(`  見た回数: ${OWNER_ONLY.length * 2}`);
}

/* ================= 5. 窓が埋まったら鳴る ================= */

/**
 * **窓（`.limit(N)`）を持つ読みのうち、埋まったら鳴るべきもの。**
 *
 * 仕込むのは「窓ちょうど」。`capHit` は `>=` で見る——`.limit(N)` に対して
 * 「ちょうど N 件」と「N 件より多い」は区別できないため（`capWatch.ts`）。
 */
const CAPS = [
  {
    name: "`GET /stickies?theme=` の窓（300）",
    fill: () => {
      for (let i = 0; i < 300; i++) {
        seed("islandNotes", `t${i}`, {theme: "zatsudan", text: "に",
          hidden: false, archived: false, createdAt: i});
      }
    },
    c: {method: "GET", path: "/stickies", query: {theme: "zatsudan"}},
  },
  {
    name: "`GET /stickies?mine=1` の窓（300）",
    fill: () => {
      for (let i = 0; i < 300; i++) {
        seed("islandNotes", `m${i}`, {theme: "zatsudan", text: "に",
          uid: "uid-a", hidden: false, archived: false, createdAt: i});
      }
    },
    c: {method: "GET", path: "/stickies", query: {mine: "1"}, token: "tok-a"},
  },
  {
    name: "`GET /nextplans?mine=1` の窓（300）",
    fill: () => {
      for (let i = 0; i < 300; i++) {
        seed("islandStreamEvent", `m${i}`, {title: "にせ", uid: "uid-a",
          hidden: false, archived: false, createdAt: i});
      }
    },
    c: {method: "GET", path: "/nextplans", query: {mine: "1"}, token: "tok-a"},
  },
  {
    name: "`GET /streamevents?day=` の窓（30）",
    fill: () => {
      for (let i = 0; i < 30; i++) {
        seed("islandStreamEvent", `d${i}`, {title: "にせ", date: "2026-01-01",
          hidden: false, archived: false, status: "next", createdAt: i});
      }
    },
    c: {method: "GET", path: "/streamevents", query: {day: "2026-01-01"}},
  },
  {
    name: "`GET /characters` の窓（500）",
    fill: () => {
      for (let i = 0; i < 500; i++) {
        seed("islandCharacter", `c${String(i).padStart(12, "0")}`,
          {emoji: "🐤", images: {}});
      }
    },
    c: {method: "GET", path: "/characters"},
  },
  {
    name: "`GET /donors` の窓（300）",
    fill: () => {
      for (let i = 0; i < 300; i++) {
        seed("islandDonors", `p${i}`, {state: "unknown", addedAt: "x"});
      }
    },
    c: {method: "GET", path: "/donors", token: "tok-ayato"},
  },
  {
    name: "`GET /stickies/waiting` の窓（3000）",
    fill: () => {
      for (let i = 0; i < 3000; i++) {
        seed("islandNotes", `w${i}`, {theme: "zatsudan", text: "に",
          hidden: false, archived: false, createdAt: i});
      }
    },
    c: {method: "GET", path: "/stickies/waiting", token: "tok-ayato"},
  },
  {
    name: "`GET /stickies?seen=1` の窓（3000）",
    fill: () => {
      for (let i = 0; i < 3000; i++) {
        seed("islandNotes", `s${i}`, {theme: "zatsudan", text: "に",
          seen: true, hidden: false, archived: false, createdAt: i});
      }
    },
    c: {method: "GET", path: "/stickies", query: {seen: "1"},
      token: "tok-ayato"},
  },
];

console.log("\n# 4. 窓が埋まったら、黙らずに鳴る");
for (const t of CAPS) {
  setup();
  t.fill();
  const r = await call(t.c);
  const rang = r.logs.some((l) => l.startsWith("error 窓が埋まりました"));
  check(`${t.name} → 鳴る`, rang,
    `${r.code} / ログ ${r.logs.length}行`);
}
{
  /* **埋まっていないときは鳴らない。** 何にでも鳴る見張りは、
     本当に埋まった日に赤の海へ埋もれる（§15 の対照と同じ考え）。 */
  setup();
  const r = await call({method: "GET", path: "/stickies",
    query: {theme: "zatsudan"}});
  check("空いているときは鳴らない",
    !r.logs.some((l) => l.includes("窓が埋まりました")),
    r.logs.join(" / ").slice(0, 120));
}

/* ================= 6. 素性が、公開の口から返らない ================= */

/** 突き合わせの鍵になる字。**値そのものは1文字も印字しない。** */
const SECRET = [
  ["uid", /uid-[ab]|uid-ayato/],
  ["チャンネルID", /UC[A-Za-z0-9_-]{22}/],
  ["端末ID", /c{30,}/],
];
/** 欄の名前そのものが素性を言っているもの。 */
const SECRET_KEYS = ["uid", "byuid", "channelid", "cid", "email", "viewerpk"];

/** JSON を端まで歩いて、(欄の道, 字) を並べる。**鍵も字として見る。** */
function walk(node, path = "", out = []) {
  if (node === null || node === undefined) return out;
  if (Array.isArray(node)) {
    node.forEach((x, i) => walk(x, `${path}[${i}]`, out));
    return out;
  }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      out.push([`${path}.${k}`, k]);
      walk(v, `${path}.${k}`, out);
    }
    return out;
  }
  out.push([path, String(node)]);
  return out;
}

console.log("\n# 5. 誰でも読める口の返りに、突き合わせの鍵が乗らない");
{
  setup();
  // 公開の口に出てきてほしいものを、ひととおり仕込む
  seed("islandCards", "img-aaaaaa__UCaaaaaaaaaaaaaaaaaaaaaa", {
    streamEventImageId: "img-aaaaaa", channelId: "UCaaaaaaaaaaaaaaaaaaaaaa",
    day: "2026-01-01", x: 1, y: 1,
  });
  seed("islandStreamEventImage", "img-aaaaaa", {
    streamEventId: "plan-aaaaaa", url: "https://x.invalid/i.webp",
    role: "card", at: 1, day: "2026-01-01", w: 10, h: 10,
  });
  seed("islandCharacter", "chaaaaaaaaaa", {
    emoji: "🐤", channelId: "UCaaaaaaaaaaaaaaaaaaaaaa",
    channelName: "ひとりめ", images: {}, channelKeys: ["ひとりめ"],
  });

  for (const [name, c] of [
    ["GET /state", {method: "GET", path: "/state"}],
    ["GET /cards", {method: "GET", path: "/cards"}],
    ["GET /stickies", {method: "GET", path: "/stickies"}],
    ["GET /notes", {method: "GET", path: "/notes"}],
    ["GET /nextplans", {method: "GET", path: "/nextplans"}],
    ["GET /nextplans/:id", {method: "GET", path: "/nextplans/plan-aaaaaa"}],
    ["GET /characters", {method: "GET", path: "/characters"}],
    ["GET /streamevents/:id/images",
      {method: "GET", path: "/streamevents/plan-aaaaaa/images"}],
    ["GET /poll", {method: "GET", path: "/poll"}],
    /* **`GET /fund` はここで見ない。** Doneru の鍵を引く口なので、
       偽の置き場では 503 にしかならない——「答えなかったもの」を
       「素性が無かった」と読まないため（§15）。あちらは本番に対して
       `python python/public_ids_selftest.py` が同じ探し方で見ている。 */
  ]) {
    const r = await call(c);
    if (r.code >= 400) {
      check(`${name} が答える`, false, `${r.code}`);
      continue;
    }
    const seen = walk(r.body);
    const hits = [];
    for (const [where, s] of seen) {
      for (const [kind, re] of SECRET) {
        if (re.test(s)) hits.push(`${kind} @ ${where}`);
      }
      if (SECRET_KEYS.includes(String(s).toLowerCase()) &&
          where.endsWith(`.${s}`)) {
        hits.push(`欄の名前「${s}」 @ ${where}`);
      }
    }
    check(`${name} に、突き合わせの鍵が1つも無い（${seen.length}か所を見た）`,
      hits.length === 0, hits.slice(0, 3).join(" / "));
  }
}

console.log("\n# 5b. 作り物で、上の探し方がちゃんと当たる（§15 の対照）");
{
  const fake = {residents: [{uid: "uid-a", name: "にせ"}],
    cards: [{channelId: "UCaaaaaaaaaaaaaaaaaaaaaa"}],
    notes: [{cid: "c".repeat(36)}]};
  const hits = [];
  for (const [where, s] of walk(fake)) {
    for (const [kind, re] of SECRET) if (re.test(s)) hits.push(kind);
    if (SECRET_KEYS.includes(String(s).toLowerCase()) &&
        where.endsWith(`.${s}`)) hits.push(`key:${s}`);
  }
  check("作り物の uid・チャンネルID・端末IDに、3種とも当たる",
    ["uid", "チャンネルID", "端末ID"].every((k) => hits.includes(k)),
    hits.join(" / "));
  const clean = {notes: [{id: "abc", text: "ふつうの字", hearts: 2}]};
  const none = walk(clean).filter(([w, s]) =>
    SECRET.some(([, re]) => re.test(s)) ||
    (SECRET_KEYS.includes(String(s).toLowerCase()) && w.endsWith(`.${s}`)));
  check("人を指さないものでは当たらない", none.length === 0,
    none.map(([w]) => w).join(" / "));
}

/* ================= 7. ログに素性が出ない ================= */

console.log("\n# 6. ここまでに出たログに、素性が1文字も無い");
{
  setup();
  const all = [];
  for (const c of [
    {method: "POST", path: "/me", token: "tok-a", body: {}},
    {method: "GET", path: "/cards/mine", token: "tok-a"},
    {method: "GET", path: "/stampline/mine", token: "tok-a"},
    {method: "POST", path: "/me", token: "だめな合言葉", body: {}},
    /* **落ちた回の「道」も見る。** `POST /cards/{カードID}` の道には
       チャンネルIDが入っている。置き場が落ちると 500 の道がそのまま
       ログへ行く形だった（2026-10-14）。 */
    {method: "POST", path: "/cards/img-aaaaaa__UCaaaaaaaaaaaaaaaaaaaaaa",
      token: "tok-ayato", body: {x: "まがったもの"}},
  ]) {
    const r = await call(c);
    all.push(...r.logs);
  }
  /* **500 の道も見る。** `POST /cards/{カードID}` の道には
     チャンネルIDが入っているので、落ちた回にそれがログへ行かないか。
     置き場をわざとこけさせて、top-level の `catch` まで落とす。 */
  boom = true;
  const fell = await call({method: "POST",
    path: "/cards/img-aaaaaa__UCbbbbbbbbbbbbbbbbbbbbbb",
    token: "tok-ayato", body: {x: 1, y: 1}});
  boom = false;
  check("置き場がこけたら 500 になる（道のログを見る前提）",
    fell.code === 500, `${fell.code}`);
  all.push(...fell.logs);
  const text = all.join("\n");
  const leaked = SECRET.filter(([, re]) => re.test(text)).map(([k]) => k);
  check("合言葉・uid・チャンネルIDが、ログに出ていない",
    leaked.length === 0 && !text.includes("Bearer") &&
      !text.includes("だめな合言葉"),
    leaked.join(" / "));
  console.log(`  出たログ: ${all.length} 行`);
}

console.log("\n# 7. 口の一覧が、古くなっていない");
{
  const now = scanRoutes();
  const added = now.filter((x) => !KNOWN_ROUTES.includes(x));
  const gone = KNOWN_ROUTES.filter((x) => !now.includes(x));
  check(`照合式から起こした口が ${KNOWN_ROUTES.length} 本のまま`,
    added.length === 0 && gone.length === 0,
    `増えた ${added.length}本 [${added.slice(0, 3).join(" / ")}] / ` +
      `消えた ${gone.length}本 [${gone.slice(0, 3).join(" / ")}]`);
  /* **数が0なら、読めていない**（§15）。探し方が壊れても「差分0」は出る。 */
  if (!now.length) blind("照合式を1本も拾えなかった（探し方のほうが壊れている）");
  console.log(`  見た口: ${now.length} 本`);
  /* **あやとだけの口を、取りこぼしていないか。** 上の `OWNER_ONLY` は
     手で並べた表なので、`ownerUid(` を持つ枝の数と突き合わせる。
     枝の入口でまとめて見ている枝ファイル（`fundDesk` `publicPurge`）は
     枝ごとに `ownerUid(` を書かないので、そのぶんを足して数える。 */
  const owned = now.filter((r) => {
    const f = r.split(" ")[0];
    return f === "fundDesk.ts" || f === "publicPurge.ts";
  }).length;
  console.log(`  うち、枝の入口でまとめて関所を通るもの: ${owned} 本`);
}

/* ================= 対照 ================= */

/** [名前, 直すファイル, 探す字, 置き換える字, 落ちてほしい行] */
const BREAKS = [
  [
    "`POST /me` の断りを外す",
    "islandApi.js",
    "if (body.channelId !== undefined) {",
    "if (false) {",
    "`POST /me` に channelId を添える → 400・書き込み0",
  ],
  [
    "カードの持ち主を見なくする",
    "cards.js",
    "if (!owner && (!mine || mine !== myChannel)) {",
    "if (false) {",
    "`POST /cards/{他人のカード}` を動かす → 403・書き込み0",
  ],
  [
    "畳んだ口を、開け直す",
    "stampLine.js",
    'res.status(410).json({ error: "closed" });',
    'res.status(200).json({ picked: false });',
    "`POST /stampline/mine` は畳んである → 410・書き込み0",
  ],
  [
    "台帳の額の上限を外す",
    "islandApi.js",
    "yen <= 0 || yen > fundDesk_1.YEN_MAX",
    "yen <= 0",
    "配信の口に **1,000万円を超える額** → 400・書き込み0",
  ],
  [
    /* `cleanText(body.text, MAX_NOTE_LEN)` は2か所にある（`/notes` と
       `/stickies`）。置き換えが当たるのは**先に出てくる `/notes`** の側。 */
    "企画あての付箋の本文を切らなくする",
    "islandApi.js",
    "const text = cleanText(body.text, MAX_NOTE_LEN);",
    "const text = String(body.text ?? \"\");",
    "企画の付箋も、置き場で 120 字",
  ],
  [
    "窓が埋まっても鳴らさない",
    "capWatch.js",
    "if (size < cap)",
    "if (true)",
    "`GET /stickies?theme=` の窓（300） → 鳴る",
  ],
  [
    "落ちた回の道を、潰さずにログへ出す",
    "islandApi.js",
    'path: path.replace(/UC[A-Za-z0-9_-]{22}/g, "UC…")',
    "path: path",
    "合言葉・uid・チャンネルIDが、ログに出ていない",
  ],
  [
    "ハンドル引きのログに、チャンネルIDを戻す",
    "islandApi.js",
    'logger.warn("handle lookup failed", String(e));',
    'logger.warn("handle lookup failed", channelId, String(e));',
    "合言葉・uid・チャンネルIDが、ログに出ていない",
  ],
  [
    "リンクを、切ったあとの字で見る",
    "islandApi.js",
    "const link = safeLink(body.link);",
    "const link = safeLink(sent);",
    "2048 字を超えるリンクは通らない・書き込み0",
  ],
];

if (CONTROL) {
  console.log("\n# 対照（わざと検査を外した写しで回して、狙った行が赤くなるか）");

  /**
   * 壊した写しで、自分をもう一度回す。
   * @param {string|null} file 壊すファイル名（`lib/` の中）
   * @param {string} broken 壊したあとの中身
   * @return {object} spawnSync の返り
   */
  const runCopy = (file, broken) => {
    const box = mkdtempSync(join(tmpdir(), "apitrust-"));
    cpSync(LIB, join(box, "lib"), {recursive: true});
    try {
      symlinkSync(join(FUNCTIONS, "node_modules"), join(box, "node_modules"));
    } catch {
      /* 既に在るなら、そのまま */
    }
    if (file) writeFileSync(join(box, "lib", file), broken, "utf8");
    const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      env: {...process.env, TRUST_LIB_DIR: join(box, "lib")},
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    rmSync(box, {recursive: true, force: true});
    return run;
  };

  {
    const run = runCopy(null, "");
    check("壊していない写しは緑のまま", run.status === 0,
      `終了コード ${run.status} / ${(run.stdout ?? "").slice(-400)}`);
  }
  for (const [what, file, from, to, wantRow] of BREAKS) {
    const base = readFileSync(join(LIB, file), "utf8");
    if (!base.includes(from)) {
      check(`${what}: 外す字が当たる`, false, `「${from}」が ${file} に無い`);
      continue;
    }
    const run = runCopy(file, base.replace(from, to));
    const out = run.stdout ?? "";
    const hit = out.includes(`NG   ${wantRow}`) ||
      out.split("\n").some((l) => l.startsWith("  NG   ") &&
        l.includes(wantRow));
    check(`${what}: 「${wantRow}」が赤くなる`,
      run.status !== 0 && hit,
      `終了コード ${run.status} / その行が赤い: ${hit}`);
  }
}

/* **落ちた行の名前を、最後の1行に並べる。** 回し役（`selftest_runner.py`）は
   落ちた見張りの**最後の1行だけ**を出すので、件数だけ出していると
   CI のログからは「何が落ちたか」が分からない（2026-10-14 に実際に
   困った。手元では通って CI で6件落ち、そのうち名前が1つも出なかった）。 */
console.log(`\n通った ${ok}件 / 落ちた ${bad}件` +
  (bad ? ` — ${fell.join(" / ")}` : ""));
if (ok === 0) blind("数えるものが1件も無かった");
process.exit(bad ? 1 : 0);
