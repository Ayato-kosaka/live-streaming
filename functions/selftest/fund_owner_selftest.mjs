/**
 * **貯金箱の出し入れが、あやと以外に1バイトも開いていないこと。**
 *
 * ## `fund_desk_selftest.mjs` と何が違うか
 *
 * あちらは `handleFundDesk` を**直に**呼んで、`ownerUid` は偽物を渡す。
 * つまり「口が `ownerUid` を通る」ことしか見ていない。
 * **`ownerUid` そのものが正しいかは見ていない。**
 *
 * ここは `lib/islandApi.js` を**丸ごと起こして**、本物の `ownerUid`
 * （`admin.auth().verifyIdToken` → `islandUsers/{uid}.admin`）を通す。
 * 差し替えるのは、外に出ていく2つ（合言葉の検算・Firestore）だけ。
 * 手本は `tools/fund/ownercheck.cjs`（`GET /fund/history` のぶん）で、
 * あれと同じことを**書ける8本**に当てる。
 *
 * 見るのは5とおり × 9本。
 *
 * | 合言葉 | 通ってよいか |
 * | --- | --- |
 * | 無し | ✕ |
 * | `Basic …`（Bearer でない） | ✕ |
 * | にせの合言葉（検算に落ちる） | ✕ |
 * | **本物だが admin でない**（他人の札） | ✕ |
 * | **あやと（admin）** | ○ |
 *
 * 通ってよくない4とおりでは、
 *
 *   - 403 が返ること
 *   - **Firestore に1回も書いていないこと**（`set` も `delete` も）
 *   - 台帳の中身（仕込んだ偽の名前）が1文字も返っていないこと
 *
 * まで見る。**403 だけ見ると、書いてから断る作りが素通りする。**
 *
 * そして**あやとでは通ること**まで見る（片側だけは対照ではない）。
 *
 * ## 本番には触らない
 *
 * Firestore は prototype ごと差し替えてあるので、**1バイトも外に出ない。**
 * 出てくる名前も額も、ここで仕込んだ偽の字だけ。
 *
 * ```bash
 * node functions/selftest/fund_owner_selftest.mjs
 * ```
 *
 * 0＝通った / 1＝開いていた / 2＝数えるものが無い
 */

import {execFileSync, spawnSync} from "node:child_process";
import {cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync}
  from "node:fs";
import {tmpdir} from "node:os";
import {createRequire} from "node:module";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FUNCTIONS = join(HERE, "..");
const LIB = process.env.FUND_LIB_DIR || join(FUNCTIONS, "lib");
const BUILD = !process.env.FUND_LIB_DIR;
const CONTROL = !process.env.FUND_LIB_DIR;

process.env.GCLOUD_PROJECT = "live-streaming-d3cac";
process.env.FIREBASE_CONFIG = JSON.stringify({
  projectId: "live-streaming-d3cac",
});

let ok = 0;
let bad = 0;

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

if (BUILD) {
  console.log("# tsc を回して、いまの src から読み込む");
  execFileSync(join(FUNCTIONS, "node_modules/.bin/tsc"), {cwd: FUNCTIONS});
} else {
  console.log(`# 差し替えた lib で回す: ${LIB}`);
}

const nodeRequire = createRequire(join(FUNCTIONS, "package.json"));
const admin = nodeRequire("firebase-admin");
const {DocumentReference, Query, CollectionReference} =
  nodeRequire("@google-cloud/firestore");

/* ---------------- 仕込む中身（ぜんぶ偽の字） ---------------- */

/** 台帳に入っている「投げ銭してくれた人の名前」。**403 の道で出たら漏れ** */
const SECRET = "ひみつの名前";
/** 出費の題。**これも人には見せない** */
const SECRET_TITLE = "ひみつの宿";

/** 誰の合言葉か。`null` は「検算に落ちる（にせもの）」 */
let TOKEN_UID = null;
/** その uid が `islandUsers` で admin か */
let IS_ADMIN = false;
/** 書いた回数（`set` と `delete`）。**403 の道で1でも増えたら漏れ** */
let WRITES = 0;
/** 引いた回数。403 の道で台帳を引いていたら、そこも見る */
let READS = 0;

DocumentReference.prototype.get = async function() {
  READS++;
  const col = this.parent.id;
  if (col === "islandUsers") {
    return {exists: true, data: () => ({admin: IS_ADMIN}), get: () => undefined};
  }
  if (col === "islandFundSpends") {
    const v = {day: "2026-09-01", title: SECRET_TITLE, yen: 400};
    return {exists: true, data: () => v, get: (k) => v[k]};
  }
  if (col === "islandFundGoals") {
    const v = {from: "2026-07-27", label: "きたへいきたい", yen: 50000};
    return {exists: true, data: () => v, get: (k) => v[k]};
  }
  if (col === "islandFundSuperChats") {
    const v = {day: "2026-09-10", yen: 1000, who: SECRET};
    return {exists: true, data: () => v, get: (k) => v[k]};
  }
  // island/state（焼き直しの置き場）ほか
  return {exists: false, data: () => ({}), get: () => undefined};
};
DocumentReference.prototype.set = async function() {
  WRITES++;
};
DocumentReference.prototype.delete = async function() {
  WRITES++;
};

/** 台帳の1ページぶん。**403 の道でここに来たら、そこで落とす。** */
const ROWS = [
  {id: "2026-09-01-deadbeef", day: "2026-09-01", title: SECRET_TITLE, yen: 400},
];
const snap = {
  size: ROWS.length,
  empty: false,
  docs: ROWS.map((v) => ({id: v.id, data: () => v, get: (k) => v[k]})),
  forEach: (f) => snap.docs.forEach(f),
};
Query.prototype.get = async function() {
  READS++;
  return snap;
};
CollectionReference.prototype.get = Query.prototype.get;
Query.prototype.aggregate = function() {
  return {
    get: async () => {
      READS++;
      return {data: () => ({count: 1, yen: 400})};
    },
  };
};
CollectionReference.prototype.aggregate = Query.prototype.aggregate;

const {islandApi} = nodeRequire(join(LIB, "islandApi.js"));

/* **合言葉の検算を差し替える。** TypeScript の `import * as admin` は
   名前空間の**写し**になるので、`admin.auth` に代入しても向こうには
   届かない。クラスの prototype は1つしかないので、そちらを差し替える
   （`tools/fund/ownercheck.cjs` と同じ手）。 */
Object.getPrototypeOf(admin.auth()).constructor.prototype.verifyIdToken =
  async function() {
    if (!TOKEN_UID) throw new Error("bad token");
    return {uid: TOKEN_UID};
  };

/**
 * 口を1回叩く。
 * @param {string} method GET / POST / DELETE
 * @param {string} path `/island-api/…`
 * @param {object} headers ヘッダ
 * @param {object} body 本文
 * @return {Promise<object>} 状態・本文
 */
function call(method, path, headers, body) {
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
      query: {},
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

/** 叩く先。**書ける口を1本も落とさない**（落とすとそこだけ開いていても緑） */
const WAYS = [
  ["GET", "/island-api/fund/desk", {}, false],
  ["GET", "/island-api/fund/spends", {}, false],
  ["POST", "/island-api/fund/spends",
    {day: "2026-09-12", title: "宿代", yen: 400}, true],
  ["DELETE", "/island-api/fund/spends/2026-09-01-deadbeef", {}, true],
  ["POST", "/island-api/fund/goals",
    {from: "2026-10-01", label: "つぎのたび", yen: 300}, true],
  ["POST", "/island-api/fund/goals/2026-07-27/close", {to: "2026-09-27"}, true],
  ["DELETE", "/island-api/fund/goals/2026-07-27", {}, true],
  ["POST", "/island-api/fund/chats", {day: "2026-09-12", yen: 500}, true],
  ["DELETE", "/island-api/fund/chats/AAAAAAAAAAAAAAAAAAAAAAAAAA", {}, true],
];

/** [名前, ヘッダ, 合言葉の中の uid, その人は admin か] */
const WHO = [
  ["合言葉なし", {}, null, false],
  ["Bearer でない", {authorization: "Basic zzz"}, null, false],
  ["にせの合言葉", {authorization: "Bearer nope"}, null, false],
  ["本物だが admin でない", {authorization: "Bearer ok"}, "viewer-uid", false],
  ["あやと（admin）", {authorization: "Bearer ok"}, "ayato-uid", true],
];

console.log(`\n# ${WHO.length}とおり × ${WAYS.length}本`);
for (const [tag, headers, uid, isAdmin] of WHO) {
  TOKEN_UID = uid;
  IS_ADMIN = isAdmin;
  const wrong = [];
  const leaked = [];
  const wrote = [];
  let reads = 0;
  for (const [method, path, body, writes] of WAYS) {
    WRITES = 0;
    READS = 0;
    const r = await call(method, path, headers, body);
    reads += READS;
    const text = JSON.stringify(r.body ?? "");
    if (isAdmin) {
      // あやとは通る。**消しに行った書類は在る**ので 200 が返ってよい
      if (r.status !== 200) wrong.push(`${method} ${path}=${r.status}`);
      if (writes && WRITES === 0) wrote.push(`${method} ${path}`);
    } else {
      if (r.status !== 403) wrong.push(`${method} ${path}=${r.status}`);
      if (WRITES !== 0) wrote.push(`${method} ${path}`);
      if (text.includes(SECRET) || text.includes(SECRET_TITLE)) {
        leaked.push(`${method} ${path}`);
      }
    }
  }
  if (isAdmin) {
    check(`${tag}: ${WAYS.length}本とも 200`, wrong.length === 0,
      wrong.join(" / "));
    check(`${tag}: 書く口が本当に書いている`, wrote.length === 0,
      wrote.join(" / "));
  } else {
    check(`${tag}: ${WAYS.length}本とも 403`, wrong.length === 0,
      wrong.join(" / "));
    check(`${tag}: 1バイトも書いていない`, wrote.length === 0,
      wrote.join(" / "));
    check(`${tag}: 台帳の中身が返っていない`, leaked.length === 0,
      leaked.join(" / "));
    /* 断るのに要る読みは `islandUsers` の1回だけ（合言葉がほどけない回は
       0回）。**台帳まで引いてから断っていたら、そこは通ってから閉めている。**
       1回でも多ければ落とす——`<=` で見ると、1本につき1回ずつ余計に
       引く壊し方が素通りする（実際にその対照で1度そうなった）。 */
    check(`${tag}: 断るのに台帳を引いていない`,
      reads === (uid ? WAYS.length : 0),
      `引いた回数 ${reads}（要るのは ${uid ? WAYS.length : 0}）`);
  }
}

/* ---------------- 対照 ---------------- */

/** [名前, 探す字, 置き換える字, 落ちてほしい確かめ] */
const BREAKS = [
  [
    "あやとかを見るのをやめる",
    "if (!(await deps.ownerUid(q.auth))) {",
    "if (false) {",
    "合言葉なし: 9本とも 403",
  ],
  [
    "断る前に書いてしまう",
    "if (!(await deps.ownerUid(q.auth))) {",
    "await SPENDS.doc(\"x\").set({}, {merge: true});\n    if (!(await deps.ownerUid(q.auth))) {",
    "合言葉なし: 1バイトも書いていない",
  ],
  [
    "断る前に台帳を引いてしまう",
    "if (!(await deps.ownerUid(q.auth))) {",
    "await SPENDS.doc(\"x\").get();\n    if (!(await deps.ownerUid(q.auth))) {",
    "合言葉なし: 断るのに台帳を引いていない",
  ],
];

if (CONTROL) {
  console.log("\n# 対照（壊した写しで回して、狙った行が赤くなるか）");
  const src = readFileSync(join(LIB, "fundDesk.js"), "utf8");
  /**
   * `lib` の写しを作る。**`node_modules` を隣に置く**（写しの中の
   * `require("firebase-admin")` が上へ登って見つけられるように）。
   * @param {string|null} broken 壊した `fundDesk.js`。null ならそのまま
   * @return {string} 写しの置き場
   */
  const copyLib = (broken) => {
    const box = mkdtempSync(join(tmpdir(), "fundowner-"));
    cpSync(LIB, box, {recursive: true});
    try {
      symlinkSync(join(FUNCTIONS, "node_modules"), join(box, "node_modules"));
    } catch {
      /* 既に在るなら、そのまま */
    }
    if (broken !== null) writeFileSync(join(box, "fundDesk.js"), broken, "utf8");
    return box;
  };
  {
    const box = copyLib(null);
    const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      env: {...process.env, FUND_LIB_DIR: box},
      encoding: "utf8",
    });
    rmSync(box, {recursive: true, force: true});
    check("壊していない写しは緑のまま", run.status === 0,
      `終了コード ${run.status} / ${(run.stdout ?? "").slice(-300)}`);
  }
  for (const [what, from, to, want] of BREAKS) {
    if (!src.includes(from)) {
      check(`${what}: 壊す字が当たる`, false,
        `lib/fundDesk.js に「${from}」が無い`);
      continue;
    }
    const box = copyLib(src.replace(from, to));
    const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      env: {...process.env, FUND_LIB_DIR: box},
      encoding: "utf8",
    });
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
