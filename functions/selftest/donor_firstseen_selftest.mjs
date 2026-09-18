/**
 * **入口（`POST /donors/{どねID}`）が「初めて投げてくれた日」を書かないこと（#158）。**
 *
 * ## なぜ「書かない」を見張るのか
 *
 * ふつうの見張りは「入るか」を見る。ここは逆で、**入らないこと**を見る。
 * 理由は `functions/src/donors.ts` の `!cur.exists` のところに書いてあるが、
 * 要点はこれ。
 *
 * - `addedAt`（登録した日）と `firstSeenAt`（初めて投げてくれた日）は別物。
 *   この口は**まだ来ていない人を先に入れておく**ための口なので、
 *   ここで `now` を入れたら「今日はじめて投げてくれた」という嘘になる
 * - しかも毎晩のほう（`python/doneru_supporters.py`）は
 *   **入っている値を絶対に上書きしない。** ここで置いた嘘は
 *   **誰にも直されずに永久に残る。** 空のほうが直せる
 *
 * つまり「うっかり親切で `patch.firstSeenAt = now` を足す」のが、この口で
 * いちばんやってはいけない直しかた。**赤くならないので、見張りで止める。**
 *
 * ## 見るのは4つ
 *
 * 1. **書類がまだ無い人**を足しても、`firstSeenAt` が1文字も入らない
 * 2. **すでに入っている値**は、何度押しても変わらない（`merge: true`）
 * 3. `clear: true`（この人は分からない）でも、入っている値は消えない
 * 4. 入っている値は、返事にそのまま出る（画面の「◯月◯日に来た」の素）
 *
 * ## 引き先は偽物
 *
 * `UC` で始まる24文字を渡すので、口は YouTube に1度も聞かない
 * （`findChannel` の1本目の枝）。この箱に鍵は無いし、本物を叩くと
 * 向こうの機嫌で結果が変わる。Firestore も偽物で、**書いたものを
 * そのまま読み返して**見る（返事だけ見ると、返事の組み立てが
 * 正しいだけで入れ物が汚れていても緑になる）。
 *
 * ## 対照（足を1本ずつ壊す）
 *
 * 「入らないこと」を見る診断は、**何も呼んでいなくても緑**になる。
 * だから `lib/donors.js` の写しを4通りに壊して、
 * **そのたびに、狙った確かめが名指しで NG になる**ところまで見る。
 * 終了コードだけを見ると「どこか赤くなった」しか分からないので、
 * 子の出力から**その行**を探す。
 *
 * 回しかた:
 *
 * ```bash
 * node functions/selftest/donor_firstseen_selftest.mjs
 * ```
 *
 * 0＝通った / 1＝見つかった / 2＝数えるものが無い
 */

import {execFileSync, spawnSync} from "node:child_process";
import {cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {createRequire} from "node:module";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FUNCTIONS = join(HERE, "..");
/** `lib` の置き場。**壊した写しで回すときだけ、ここを差し替える。** */
const LIB = process.env.DONOR_LIB_DIR || join(FUNCTIONS, "lib");
/** 写しで回すときは `tsc` を通さない（差し替えた `lib` を焼き直してしまう） */
const BUILD = !process.env.DONOR_LIB_DIR;
/** 対照を回すのは本物のときだけ（写しの中で写しを作らない） */
const CONTROL = BUILD;

/** 落ちた数。1つでもあれば終了コード1 */
let bad = 0;
/** 通った数。**分母として出す**（`docs/island-standards.md` §15） */
let ok = 0;

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
  console.log(`  NG   ${name}${why ? ` — ${why}` : ""}`);
}

/* ---------------- 偽の Firestore ---------------- */

/** 本当の初回。**この字が変わっていないこと**を、ずっと見る */
const TRUE_FIRST = "2026-06-02T11:20:00+00:00";
/** 偽のチャンネルID（`UC` + 22文字）。本番と同じ形にする */
const CID = "UCzzFAKE0000000000000000";
/** 偽の どねID（10桁）。本番と同じ形 */
const PK_NEW = "3000000001";
const PK_HAS = "3000000002";

/** 入れ物。コレクション名 → 書類ID → 中身。**ぜんぶ偽の字。** */
const STORE = {
  islandDonors: {
    // すでに毎晩のほうが「初めて投げてくれた日」を入れてある人
    [PK_HAS]: {
      viewerPk: PK_HAS,
      label: "ふしぎな視聴者さん",
      firstSeenAt: TRUE_FIRST,
      state: "new",
    },
  },
  islandChannels: {
    [CID]: {name: "ふしぎな視聴者さん", days: 3, lastAt: "2026-09-10"},
  },
};

/**
 * 書類1件の姿。
 * @param {string} id 書類ID
 * @param {object|undefined} v 中身
 * @return {object} 書類の姿
 */
const snapOf = (id, v) => ({id, exists: !!v, data: () => v});

/**
 * 問い合わせ。`where`（`==` と範囲）と `limit` だけ。
 * @param {string} name コレクション名
 * @param {Array} where 積んだ条件
 * @param {number|undefined} lim 何件まで
 * @return {object} 問い合わせ
 */
function query(name, where, lim) {
  return {
    where: (f, op, v) => query(name, [...where, [f, op, v]], lim),
    limit: (n) => query(name, where, n),
    get: async () => {
      let rows = Object.entries(STORE[name] ?? {}).map(([id, v]) => snapOf(id, v));
      for (const [f, op, v] of where) {
        rows = rows.filter((d) => {
          const x = d.data()[f];
          if (op === "==") return x === v;
          if (op === ">=") return typeof x === "string" && x >= v;
          if (op === "<") return typeof x === "string" && x < v;
          throw new Error(`偽の Firestore は ${op} を持たない`);
        });
      }
      if (lim !== undefined) rows = rows.slice(0, lim);
      return {
        size: rows.length,
        empty: rows.length === 0,
        docs: rows,
        forEach: (f) => rows.forEach(f),
      };
    },
  };
}

/**
 * 偽の Firestore。**書いたものは残る**（読み返して見るため）。
 * @return {object} db
 */
function fakeDb() {
  return {
    collection: (name) => ({
      ...query(name, [], undefined),
      doc: (id) => ({
        id,
        get: async () => snapOf(id, STORE[name]?.[id]),
        set: async (v, opt) => {
          STORE[name] ??= {};
          /* **`merge` を本物と同じに効かせる。** ここを「いつも足す」に
             すると、`set()` を裸にした日に気づけない */
          STORE[name][id] = opt?.merge ?
            {...(STORE[name][id] ?? {}), ...v} :
            {...v};
        },
        delete: async () => {
          delete STORE[name]?.[id];
        },
      }),
    }),
  };
}

/* ---------------- lib/*.js を、偽の admin で読み込む ---------------- */

if (BUILD) {
  console.log("# tsc を回して、いまの src から読み込む");
  execFileSync(join(FUNCTIONS, "node_modules/.bin/tsc"), {cwd: FUNCTIONS});
}

const DB = fakeDb();
const admin = {
  apps: [],
  initializeApp: () => {
    admin.apps.push({});
  },
  firestore: Object.assign(() => DB, {
    Timestamp: {now: () => ({toMillis: () => 0})},
    FieldValue: {serverTimestamp: () => 0},
  }),
  storage: () => {
    throw new Error("偽の admin は置き場を持たない");
  },
  auth: () => {
    throw new Error("偽の admin は合言葉を確かめない（ownerUid は差し替え）");
  },
};

/** 出たログ。**素性が出ていないかを、あとで数える** */
const logs = [];
const functions = {
  logger: {
    warn: (...a) => logs.push(a.join(" ")),
    info: (...a) => logs.push(a.join(" ")),
    error: (...a) => logs.push(a.join(" ")),
  },
};

const nodeRequire = createRequire(import.meta.url);
/** 読み込んだ `lib/*.js`。同じものを2度読み込まない（中の db が2つになる） */
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

const {handleDonors} = load("donors");
if (typeof handleDonors !== "function") {
  // **数えるものが無い。** 0件で緑にしない（§15）
  console.error("lib/donors.js から handleDonors を取り出せなかった");
  process.exit(2);
}

const deps = {ownerUid: async (h) => (h === "Bearer owner" ? "uid-ayato" : null)};

/**
 * 口を1回叩く。
 * @param {string} method GET / POST
 * @param {string} path パス
 * @param {object} body 送る中身
 * @return {Promise<object>} 扱ったか・状態・返り
 */
async function call(method, path, body = {}) {
  const out = {handled: false, status: 200, body: undefined};
  const res = {
    set: () => {},
    status: (n) => {
      out.status = n;
      return res;
    },
    json: (b) => {
      out.body = b;
    },
    send: () => {},
  };
  out.handled = await handleDonors(
    {method, path, auth: "Bearer owner", query: {}, body},
    res,
    deps,
  );
  return out;
}

/* ---- 先に「口が本当に書いている」ことを見る（#19。何も起きていない
       ときも「firstSeenAt は入らなかった」は通ってしまう） ---- */

console.log("\n# まず、この口がちゃんと1行を書くことを見る");
{
  const r = await call("POST", `/donors/${PK_NEW}`, {channelId: CID});
  const v = STORE.islandDonors[PK_NEW];
  check("作成が通る", r.handled && r.status === 200, `status=${r.status}`);
  check("入れ物に1行できている", !!v, JSON.stringify(v ?? null));
  check("紐付いている（linked）", v?.state === "linked", String(v?.state));
  check("登録した日（addedAt）は入る", typeof v?.addedAt === "string",
    String(v?.addedAt));
}

/* ---- 1. 書類がまだ無い人に、firstSeenAt は1文字も入らない ---- */

console.log("\n# 1. 新しく足した行に「初めて投げてくれた日」が入らない");
{
  const v = STORE.islandDonors[PK_NEW] ?? {};
  check(
    "新しい行に firstSeenAt の欄が無い",
    !("firstSeenAt" in v),
    JSON.stringify(v.firstSeenAt ?? null),
  );
  const r = await call("GET", "/donors");
  const row = (r.body?.donors ?? []).find((d) => d.viewerPk === PK_NEW);
  check(
    "画面に返る値も null（「◯月◯日に来た」を出さない）",
    row?.firstSeenAt === null,
    JSON.stringify(row?.firstSeenAt),
  );
}

/* ---- 2. すでに入っている値は、何度押しても変わらない ---- */

console.log("\n# 2. すでに入っている「初めて投げてくれた日」を踏まない");
{
  await call("POST", `/donors/${PK_HAS}`, {channelId: CID});
  await call("POST", `/donors/${PK_HAS}`, {channelId: CID});
  const v = STORE.islandDonors[PK_HAS] ?? {};
  check("2回押しても値が変わらない", v.firstSeenAt === TRUE_FIRST,
    JSON.stringify(v.firstSeenAt ?? null));
  check("呼び名も消えていない", v.label === "ふしぎな視聴者さん",
    JSON.stringify(v.label ?? null));
}

/* ---- 3. clear（この人は分からない）でも消えない ---- */

console.log("\n# 3. 「この人は分からない」にしても、来た日は消えない");
{
  const r = await call("POST", `/donors/${PK_HAS}`, {clear: true});
  const v = STORE.islandDonors[PK_HAS] ?? {};
  check("clear が通る", r.status === 200, `status=${r.status}`);
  check("紐付けは外れる", v.channelId === null, JSON.stringify(v.channelId));
  check("来た日は残っている", v.firstSeenAt === TRUE_FIRST,
    JSON.stringify(v.firstSeenAt ?? null));
}

/* ---- 4. 入っている値は、返事にそのまま出る ---- */

console.log("\n# 4. 入っている値は、画面へそのまま返る");
{
  const r = await call("POST", `/donors/${PK_HAS}`, {channelId: CID});
  check("返事の firstSeenAt が、入れ物の値と同じ",
    r.body?.donor?.firstSeenAt === TRUE_FIRST,
    JSON.stringify(r.body?.donor?.firstSeenAt ?? null));
}

/* ---- ログに素性を出していない ---- */

console.log("\n# ログに素性が出ていない");
{
  const text = logs.join("\n");
  for (const [what, pat] of [
    ["チャンネルID（UC + 22文字）", /UC[0-9A-Za-z_-]{22}/g],
    ["どねID（10桁）", /\b\d{10}\b/g],
  ]) {
    const n = (text.match(pat) ?? []).length;
    check(`${what} の出現回数`, n === 0, String(n));
  }
  console.log(`  （読んだログは ${text.length} 字 / ${logs.length} 行）`);
}

/* ---------------- 対照 ---------------- */

/**
 * 壊しかた。[名前, 探す字, 置き換える字, 落ちてほしい確かめ]。
 *
 * **狙った行が名指しで NG になる**ところまで見る。終了コードだけだと
 * 「どこか赤くなった」しか言えないので、壊したのと関係ない行が落ちても
 * 対照が通ってしまう。
 */
const BREAKS = [
  [
    "入口で now を入れる（新しい行）",
    "patch.addedAt = now;",
    "patch.addedAt = now; patch.firstSeenAt = now;",
    "新しい行に firstSeenAt の欄が無い",
  ],
  [
    "入口で now を入れる（毎回）",
    "await ref.set(patch, { merge: true });",
    "patch.firstSeenAt = now; await ref.set(patch, { merge: true });",
    "2回押しても値が変わらない",
  ],
  [
    "set を裸にする（merge を外す）",
    "await ref.set(patch, { merge: true });",
    "await ref.set(patch);",
    "来た日は残っている",
  ],
  [
    "画面へ返すのをやめる",
    "firstSeenAt: typeof v.firstSeenAt === \"string\" ? v.firstSeenAt : null,",
    "firstSeenAt: null,",
    "返事の firstSeenAt が、入れ物の値と同じ",
  ],
];

if (CONTROL) {
  console.log("\n# 対照（壊した写しで回して、狙った行が赤くなるか）");
  const src = readFileSync(join(LIB, "donors.js"), "utf8");

  /* **まず「壊していない写し」が緑であること。** 写しを作る途中で壊れても
     終了コードは同じなので、ここを見ないと対照にならない（#99） */
  {
    const box = mkdtempSync(join(tmpdir(), "donorlib-"));
    cpSync(LIB, box, {recursive: true});
    const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      env: {...process.env, DONOR_LIB_DIR: box},
      encoding: "utf8",
    });
    rmSync(box, {recursive: true, force: true});
    check("壊していない写しは緑のまま", run.status === 0,
      `終了コード ${run.status}`);
  }

  for (const [what, from, to, want] of BREAKS) {
    if (!src.includes(from)) {
      // **壊す字が当たらない＝何も測っていない。** 緑で通さない
      check(`${what}: 壊す字が当たる`, false, `lib/donors.js に「${from}」が無い`);
      continue;
    }
    const box = mkdtempSync(join(tmpdir(), "donorlib-"));
    cpSync(LIB, box, {recursive: true});
    writeFileSync(join(box, "donors.js"), src.replace(from, to), "utf8");
    const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      env: {...process.env, DONOR_LIB_DIR: box},
      encoding: "utf8",
    });
    rmSync(box, {recursive: true, force: true});
    const hit = (run.stdout ?? "").includes(`NG   ${want}`);
    check(`${what}: 「${want}」が赤くなる`, run.status === 1 && hit,
      `終了コード ${run.status} / その行が赤い: ${hit}`);
  }
}

console.log(`\n通った ${ok}件 / 落ちた ${bad}件`);
process.exit(bad ? 1 : 0);
