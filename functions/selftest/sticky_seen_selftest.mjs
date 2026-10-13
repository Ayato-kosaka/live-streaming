/**
 * **「まだ返していない」の数と、「見た」で片づける道。**
 *
 *   node functions/selftest/sticky_seen_selftest.mjs
 *
 * 終了コード 0=通った / 1=抜けたものがある / 2=確かめられなかった。
 *
 * ## なぜ要るか
 *
 * 2026-10-13 に2つ足した。机（`/me/desk`）の付箋の札に出る**まだ返して
 * いない数**（`GET /stickies/unanswered`）と、返さずに片づける
 * **「見た」**（`POST /stickies/:id/seen`）。
 *
 * ここが壊れるときは、**赤くならない形で壊れる。**
 *
 *   - 数えかたを1つ外すと、札の数字が**静かに**合わなくなる。
 *     口は 200 を返すし、画面も出る。気づけるのは数え直した人だけ
 *   - 「見た」の印が公開の口に1文字でも漏れると、**自分の付箋が
 *     「返事なしで既読にされた」と貼った人に分かる。** 書く気が失せる。
 *     これも 200 で、絵も壊れない
 *
 * ## 見ているもの
 *
 *  0. **数えるものが在る**（仕込みの山に、数える1枚と数えない6種が揃って
 *     いる）。ここが外れたら、本物の数字を1つも出さずに 2 で落ちる
 *  1. **誰が叩けるか。** 合言葉なし・視聴者さんは 403、あやとだけ 200
 *  2. **数えかた。** 返事つき・立て札・あやと自身・しまった・隠した・
 *     企画あて（旧）を1つずつ外して数える。**6種を1件ずつ持つ**ので、
 *     どれか1つを数えに入れた日に落ちる
 *  3. **「見た」で減る。** 押すと数が1つ減り、`?seen=1` の山に移る
 *  4. **押し間違えを戻せる。** `{on: false}` で数が戻り、山から消え、
 *     **書類からは欄ごと消える**
 *  5. **山の並びは押した順**（`seenAt` の新しい順）。古い付箋を見たにして
 *     も、戻すときはいちばん上にいる
 *  6. **視聴者さんに1バイトも漏れていない。** 印を立てた状態で、公開の
 *     `GET /stickies` と `GET /stickies?mine=1` の答えを**字にして**、
 *     `seen` `seenAt` `seenBy` `repliedBy` `uid` `cid` と、uid の値そのものが
 *     1つも入っていないことを見る
 *  7. **あやと以外は1バイトも書けない。** 403 のときに、書類の中身が
 *     押す前とまったく同じであること（403 を返しながら書く作りを捕まえる）
 *
 * ## 写しを持たない
 *
 * 数えかたをこのファイルに書き写すと、**本体を直した日に、ここだけ古い
 * 規則で緑になる。** 口は本物（`tsc` が書き出した `lib/islandApi.js` を
 * 偽の firebase-admin で動かす。`sticky_shut_selftest.mjs` と同じやり方）。
 * **本番の Functions は叩かない。ネットにも鍵にも触らない。**
 *
 * ## わざと壊して、赤くなるかを見る
 *
 * `BREAK=` を渡すと、読み込む前の本体を1か所だけ書き換えて回す。
 * **当てた字が見つからなければ、緑を返さずに 2 で落ちる**（壊し忘れが
 * 「対照が通った」に化けるのを止める）。
 *
 * ```bash
 * BREAK=leak   node functions/selftest/sticky_seen_selftest.mjs  # 印を公開の口に乗せる
 * BREAK=anyone node functions/selftest/sticky_seen_selftest.mjs  # 誰でも「見た」を押せる
 * BREAK=self   node functions/selftest/sticky_seen_selftest.mjs  # あやと自身の付箋も数える
 * BREAK=keep   node functions/selftest/sticky_seen_selftest.mjs  # 戻しても欄が残る
 * ```
 *
 * ## 視聴者さんの素性は1文字も出てこない
 *
 * このリポジトリは公開で、Actions のログも誰でも読める。出てくるのは
 * 仕込んだ `uid-hito` `uid-boss` と、こちらが書いた宛先の字だけ。
 */

import {execFileSync} from "node:child_process";
import {existsSync, readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FUNCTIONS = join(HERE, "..");
const LIB = join(FUNCTIONS, "lib");

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
   引く側も持つ（数えるところが `orderBy().limit().get()` を使う）。 */

/** 書類の中身。`<コレクション>/<書類ID>` -> object */
const STORE = new Map();
let seq = 0;

/**
 * 書類1つに、送られた中身を重ねる。**`__delete` は欄ごと落とす。**
 * @param {object} cur いまの中身
 * @param {object} data 送られた中身
 * @return {object} 重ねたもの
 */
function merge(cur, data) {
  const out = {...(cur ?? {})};
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === "object" && v.__delete) delete out[k];
    else out[k] = v;
  }
  return out;
}

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
    get: (f) => (f === "__name__" ? id : (v ?? {})[f]),
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

/** そのコレクションの書類ぜんぶ（写し） */
const allOf = (col) =>
  [...STORE.keys()]
    .filter((k) => k.startsWith(`${col}/`))
    .map((k) => snapOf(k, k.slice(col.length + 1)));

/**
 * 引く側。`where` / `orderBy` / `limit` / `startAfter` を持つ。
 *
 * **Firestore と同じく、`orderBy` の欄を持たない書類は出さない。**
 * ここを揃えておかないと、欄の無い古い書類の扱いが本番と違ってしまう。
 * @param {string} col コレクション名
 * @param {object} st いまの絞り
 * @return {object} query のふり
 */
function query(col, st = {wh: [], ord: [], lim: Infinity, after: null}) {
  const q = {
    _name: col,
    where: (f, op, v) => query(col, {...st, wh: [...st.wh, [f, op, v]]}),
    orderBy: (f, dir) => query(col, {...st, ord: [...st.ord, [f, dir ?? "asc"]]}),
    limit: (n) => query(col, {...st, lim: n}),
    startAfter: (...vals) => query(col, {...st, after: vals}),
    get: async () => {
      let rows = allOf(col);
      for (const [f, op, v] of st.wh) {
        if (op !== "==") nothing(`偽の Firestore が知らない引きかた: ${op}`);
        rows = rows.filter((d) => d.get(f) === v);
      }
      for (const [f] of st.ord) rows = rows.filter((d) => d.get(f) !== undefined);
      rows.sort((a, b) => {
        for (const [f, dir] of st.ord) {
          const x = a.get(f);
          const y = b.get(f);
          if (x === y) continue;
          return (x > y ? 1 : -1) * (dir === "desc" ? -1 : 1);
        }
        return 0;
      });
      if (st.after) {
        /* 書類そのものでも、値の並びでも受ける（本体は両方使う） */
        const vals =
          st.after.length === 1 && typeof st.after[0]?.get === "function" ?
            st.ord.map(([f]) => st.after[0].get(f)) :
            st.after;
        const at = rows.findIndex((d) =>
          st.ord.every(([f], i) => d.get(f) === vals[i]),
        );
        if (at >= 0) rows = rows.slice(at + 1);
      }
      const docs = rows.slice(0, st.lim === Infinity ? rows.length : st.lim);
      return {
        empty: docs.length === 0,
        size: docs.length,
        docs,
        forEach: (f) => docs.forEach(f),
      };
    },
  };
  return q;
}

/**
 * コレクション。
 * @param {string} name コレクション名
 * @return {object} collection のふり
 */
function collection(name) {
  const q = query(name);
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
    where: q.where,
    orderBy: q.orderBy,
    limit: q.limit,
    get: q.get,
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

/** 蓋に当たったときの `logger.error` を数える（本体が鳴らす先） */
let yelled = 0;
const functions = {
  logger: {warn: () => {}, info: () => {}, error: () => (yelled += 1)},
};

/* ---------------- lib/*.js を、偽の admin で読み込む ---------------- */

/** わざと壊す1か所。**当て先が見つからなければ 2 で落ちる。** */
const BREAKS = {
  /* 印を公開の口に乗せる（`stickyShape` が返す形に足す） */
  leak: [
    "archived: v.archived === true ? true : undefined,",
    "archived: v.archived === true ? true : undefined, seen: v.seen, seenBy: v.seenBy,",
  ],
  /* 「見た」の関所を外す（視聴者さんも押せる） */
  anyone: [
    'const seenMatch = path.match(/^\\/stickies\\/([A-Za-z0-9_-]{6,})\\/seen$/);',
    'const seenMatch = path.match(/^\\/stickies\\/([A-Za-z0-9_-]{6,})\\/seen$/);\n' +
      "      if (method === \"POST\" && seenMatch) { const w = await whoIs(req.headers.authorization); " +
      "await NOTES.doc(seenMatch[1]).set({seen: body.on !== false, seenBy: w && w.uid}, {merge: true}); " +
      'res.json({id: seenMatch[1], seen: body.on !== false}); return; }',
  ],
  /* あやと自身の付箋も数に入れる */
  self: ['if (d.get("uid") === owner)', "if (false)"],
  /* 「見たもの」の山を、押した順ではなく貼られた順に並べる */
  order: [
    '(Number(b.get("seenAt")) || 0) - (Number(a.get("seenAt")) || 0)',
    "0",
  ],
  /* 戻しても欄が残る（`false` を置いて消さない） */
  keep: [
    "seen: admin.firestore.FieldValue.delete(),",
    "seen: false,",
  ],
};

const BREAK = process.env.BREAK || "";
if (BREAK && !BREAKS[BREAK]) nothing(`知らない壊しかた: ${BREAK}`);

console.log("# tsc を回して、いまの src から読み込む");
execFileSync(join(FUNCTIONS, "node_modules/.bin/tsc"), {cwd: FUNCTIONS});

if (!existsSync(join(LIB, "islandApi.js"))) {
  nothing(`${join(LIB, "islandApi.js")} が無い`);
}

const nodeRequire = createRequire(import.meta.url);
const loaded = new Map();
let broke = false;

/**
 * 書き出した js を1つ読み込む。
 * @param {string} name 拡張子なしの名前
 * @return {object} その module.exports
 */
function load(name) {
  if (loaded.has(name)) return loaded.get(name);
  const file = join(LIB, `${name}.js`);
  let src = readFileSync(file, "utf8");
  if (BREAK) {
    const [from, to] = BREAKS[BREAK];
    if (src.includes(from)) {
      src = src.replace(from, to);
      broke = true;
    }
  }
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
if (BREAK && !broke) {
  /* **壊し忘れを「対照が通った」に化けさせない。** */
  nothing(`壊す当て先が見つからない: ${BREAK}`);
}
if (BREAK) console.log(`# わざと壊して回す: ${BREAK}\n`);

/* ---------------- 口を叩く ---------------- */

/**
 * 口を1回叩く。
 * @param {string} method GET / POST / DELETE
 * @param {string} path パス
 * @param {object} query 引きかた
 * @param {object} body 送る中身
 * @param {string} [token] `hito` か `boss`
 * @return {Promise<object>} 状態と返り
 */
function call(method, path, query, body, token) {
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
        query: query ?? {},
        headers: token ? {authorization: `Bearer ${token}`} : {},
        body: body ?? {},
      },
      res,
    );
  });
}

/* ---------------- 仕込み ----------------
   **数える1枚と、数えない6種を1件ずつ。** 1種でも欠けたら 2 で落ちる
   （「数えない」は、数えないものが在って初めて言える）。 */

STORE.set("islandUsers/uid-boss", {admin: true});
STORE.set("islandUsers/uid-hito", {});

const DAY = 86400000;
const T0 = Date.UTC(2026, 9, 1);

/**
 * 付箋を1枚仕込む。
 * @param {string} id 書類ID（20字）
 * @param {object} v 中身
 * @param {number} age 何日前か
 */
function put(id, v, age) {
  STORE.set(`islandNotes/${id}`, {
    theme: "selftest-dest",
    text: "ここに来てほしい",
    uid: "uid-hito",
    cid: "11111111-2222-4333-8444-555555555555",
    hearts: 0,
    createdAt: T0 - age * DAY,
    ...v,
  });
}

/** 数える4枚（新しい順に n-new → n-old） */
put("note-new-0000000001", {}, 1);
put("note-mid-0000000002", {}, 5);
put("note-old-0000000003", {}, 30);
/** 返事の欄が在るが、空白だけ。**`stickyShape` は無いものとして返す**ので数える */
put("note-blank-000000004", {reply: "   "}, 7);

/** 数えない6種 */
put("skip-reply-000000005", {reply: "ありがとう！"}, 2);
put("skip-owner-000000006", {byOwner: true}, 3);
put("skip-self-0000000007", {uid: "uid-boss"}, 4);
put("skip-stow-0000000008", {archived: true}, 6);
put("skip-hide-0000000009", {hidden: true}, 8);
put("skip-plan-0000000010", {theme: undefined, planId: "nordic"}, 9);

/** 仕込みで数えるつもりの枚数。**本体の答えと突き合わせる相手** */
const WANT = 4;

/* ---------------- 0. 数えるものが在る ---------------- */

console.log("## 0. 数えるものが在る（対照）");

{
  const r = await call("GET", "/stickies/unanswered", {}, null, "boss");
  if (r.code !== 200 || typeof r.body?.n !== "number") {
    nothing(
      `口が数を返さない（code=${r.code} ` +
        `${JSON.stringify(r.body).slice(0, 160)}）`,
    );
  }
  if (!Array.isArray(r.body.notes) || r.body.notes.length === 0) {
    nothing("数える1枚も出てこない（仕込みが口に届いていない）");
  }
  console.log(
    `  仕込み ${[...STORE.keys()].filter((k) => k.startsWith("islandNotes/")).length}枚` +
      ` / 口が数えた ${r.body.n}枚（数えないつもりのもの 6種）`,
  );
  check("数えかた（6種を外して4枚）", r.body.n === WANT, `n=${r.body.n}`);
  check(
    "数と、返ってきた一覧の枚数が同じ",
    r.body.notes.length === r.body.n,
    `${r.body.notes.length} / ${r.body.n}`,
  );
  check(
    "並びは新しい順",
    r.body.notes[0]?.id === "note-new-0000000001",
    String(r.body.notes[0]?.id),
  );
  check("蓋（3000枚）に当たっていない", yelled === 0, `error ${yelled}回`);
}

/* ---------------- 1. 誰が叩けるか ---------------- */

console.log("\n## 1. 数を聞けるのは、あやとだけ");

for (const [who, token, want] of [
  ["合言葉なし", undefined, 403],
  ["視聴者さん", "hito", 403],
  ["あやと", "boss", 200],
]) {
  const r = await call("GET", "/stickies/unanswered", {}, null, token);
  check(`${who} → ${want}`, r.code === want, `code=${r.code}`);
}

{
  const r = await call("GET", "/stickies/unanswered", {n: "1"}, null, "boss");
  check("`?n=1` は数だけ返す（一覧を付けない）", r.body?.notes === undefined);
  check("`?n=1` の数は、一覧つきと同じ", r.body?.n === WANT, `n=${r.body?.n}`);
}

/* ---------------- 2. 「見た」を押せるのも、あやとだけ ---------------- */

console.log("\n## 2. 「見た」を押せるのは、あやとだけ（1バイトも書かせない）");

const TARGET = "note-old-0000000003";
/** 押す前の書類。**403 のときは、ここから1文字も動いていないこと** */
const before = JSON.stringify(STORE.get(`islandNotes/${TARGET}`));

for (const [who, token] of [
  ["合言葉なし", undefined],
  ["視聴者さん", "hito"],
]) {
  const r = await call("POST", `/stickies/${TARGET}/seen`, {}, {on: true}, token);
  check(`${who} → 403`, r.code === 403, `code=${r.code}`);
  check(
    `${who}が押しても、書類が1バイトも変わっていない`,
    JSON.stringify(STORE.get(`islandNotes/${TARGET}`)) === before,
  );
}

{
  const r = await call(
    "POST",
    "/stickies/note-nothing-00000/seen",
    {},
    {on: true},
    "boss",
  );
  check("無い付箋 → 404", r.code === 404, `code=${r.code}`);
}

/* ---------------- 3. 押すと減って、山が移る ---------------- */

console.log("\n## 3. 「見た」を押すと、返す山から下りる");

/** いちばん新しい1枚。**先に押す**（押した順を見るため） */
const FIRST = "note-new-0000000001";

{
  const r = await call("POST", `/stickies/${FIRST}/seen`, {}, {on: true}, "boss");
  check("あやとが押せる（200）", r.code === 200 && r.body?.seen === true);

  const a = await call("GET", "/stickies/unanswered", {}, null, "boss");
  check("数が1つ減る", a.body?.n === WANT - 1, `n=${a.body?.n}`);
  check(
    "返す山から消えている",
    !(a.body?.notes ?? []).some((x) => x.id === FIRST),
  );

  const s = await call("GET", "/stickies/unanswered", {seen: "1"}, null, "boss");
  check("「見たもの」の山に居る", s.body?.n === 1 && s.body?.notes?.[0]?.id === FIRST);
}

/* ---------------- 4. 山の並びは、押した順 ---------------- */

console.log("\n## 4. 「見たもの」の山は、押した順（戻しに行ける）");

{
  /* **いちばん古い1枚**をあとから押す。貼られた順なら上の `FIRST`（30日
     新しい）が上に来るので、**押した順でないと通らない。**
     1ミリ秒も離れないと `seenAt` が並ぶので、少しだけ待つ。 */
  await new Promise((done) => setTimeout(done, 8));
  await call("POST", `/stickies/${TARGET}/seen`, {}, {on: true}, "boss");

  const s = await call("GET", "/stickies/unanswered", {seen: "1"}, null, "boss");
  check("2枚になっている", s.body?.n === 2, `n=${s.body?.n}`);
  check(
    "いま押した1枚（貼られたのは30日ぶん古い）が、いちばん上",
    s.body?.notes?.[0]?.id === TARGET,
    `${s.body?.notes?.[0]?.id}（貼られた順なら ${FIRST}）`,
  );
  check("数が2つ減っている", (await call("GET", "/stickies/unanswered", {}, null, "boss")).body?.n === WANT - 2);
}

/* ---------------- 5. 押し間違えを戻せる ---------------- */

console.log("\n## 5. 押し間違えたら、戻せる");

{
  const r = await call("POST", `/stickies/${TARGET}/seen`, {}, {on: false}, "boss");
  check("戻せる（200）", r.code === 200 && r.body?.seen === false);

  const doc = STORE.get(`islandNotes/${TARGET}`) ?? {};
  check(
    "書類から欄ごと消えている（`seen` / `seenAt` / `seenBy`）",
    !("seen" in doc) && !("seenAt" in doc) && !("seenBy" in doc),
    Object.keys(doc).filter((k) => k.startsWith("seen")).join(",") || "—",
  );

  const a = await call("GET", "/stickies/unanswered", {}, null, "boss");
  check("返す山に戻ってくる", (a.body?.notes ?? []).some((x) => x.id === TARGET));
  const s = await call("GET", "/stickies/unanswered", {seen: "1"}, null, "boss");
  check(
    "「見たもの」の山から消える（押したもう1枚は残る）",
    s.body?.n === 1 && s.body?.notes?.[0]?.id === FIRST,
    `n=${s.body?.n}`,
  );
}

/* ---------------- 6. 視聴者さんに漏れていない ----------------
   **印が立っている状態で見る。** 立てる前に見ると、無くて当たり前。 */

console.log("\n## 6. 貼った人には、1バイトも見せない");

/** 公開の口に1文字も出てはいけない字 */
const NEVER = [
  "seen",
  "seenAt",
  "seenBy",
  "repliedBy",
  "uid",
  "cid",
  "hidden",
  "archivedBy",
  "uid-boss",
  "uid-hito",
];

{
  const seenNow = await call("GET", "/stickies/unanswered", {seen: "1"}, null, "boss");
  if ((seenNow.body?.n ?? 0) < 1) {
    nothing("印の立った付箋が1枚も無い（漏れを見るための前提が崩れている）");
  }

  for (const [what, q, token] of [
    ["公開の一覧（合言葉なし）", {limit: "300"}, undefined],
    ["じぶんのぶん（視聴者さん）", {mine: "1"}, "hito"],
  ]) {
    const r = await call("GET", "/stickies", q, null, token);
    if (r.code !== 200 || !Array.isArray(r.body?.notes)) {
      nothing(`${what} が引けない（code=${r.code}）`);
    }
    if (r.body.notes.length === 0) {
      nothing(`${what} が0枚（漏れを見る相手が居ない）`);
    }
    const text = JSON.stringify(r.body);
    const found = NEVER.filter((w) => text.includes(w));
    check(
      `${what} ${r.body.notes.length}枚に、印も素性も1つも無い`,
      found.length === 0,
      found.join(" / "),
    );
    /* **印の立った付箋が、その一覧に実際に居ること。** 居なければ
       「無い」は何も言っていない（`docs/island-standards.md` §15）。 */
    if (q.limit) {
      check(
        "その一覧に、印の立った1枚が並んでいる",
        r.body.notes.some((x) => x.id === "note-new-0000000001"),
      );
    }
  }
}

/* ---------------- 7. 掲示板での見え方が変わっていない ---------------- */

console.log("\n## 7. 印を立てても、掲示板での見え方は変わらない");

{
  const r = await call("GET", "/stickies", {limit: "300"}, null, undefined);
  const ids = (r.body?.notes ?? []).map((x) => x.id);
  check(
    "印の立った付箋も、いままでどおり並ぶ",
    ids.includes("note-new-0000000001"),
  );
  check(
    "しまったもの・隠したものは、いままでどおり出ない",
    !ids.includes("skip-stow-0000000008") && !ids.includes("skip-hide-0000000009"),
  );
  const h = await call(
    "POST",
    "/stickies/note-new-0000000001/heart",
    {},
    {cid: "22222222-2222-4333-8444-555555555555"},
    undefined,
  );
  check("印の立った付箋にも、ハートは押せる", h.code === 200, `code=${h.code}`);
}

/* ---------------- まとめ ---------------- */

console.log(`\n通った ${ok} / 落ちた ${bad}`);
if (bad > 0) {
  console.error("見張り: 付箋の「見た」と未返信の数に、抜けがあります");
  process.exit(1);
}
if (ok < 25) nothing(`数えた件数が少なすぎる（${ok}件）`);
console.log("見張り: 通りました");
