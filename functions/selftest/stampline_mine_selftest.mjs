/**
 * `/stampline/mine` の確かめ(#716)。**偽のチャンネルと偽の字だけで回す。**
 *
 * ## 何を見ているか
 *
 * スタンプのことばの入れ物(`islandStampLine`)に書類があるのは、あやとが
 * 選んだ人だけ。**その名簿は、そのまま投げ銭の順位表になる**
 * (`docs/island-money.md`)。だから口は「自分のぶんだけ」でなければならず、
 * ここはそれが本当に絞れているかを見る。
 *
 * 見るのは5つ。
 *
 *   1. **ログインしていないと、1文字も取れない**（401）
 *   2. **他人のぶんは、口からも取れない**（自分のぶんしか返らない）
 *   3. **入っていない人には `picked: false` だけ**（提案も空の欄も返さない）
 *   4. **書けるのは自分のぶんだけ**（body に他人の id を入れても届かない）
 *   5. **ログに視聴者さんの素性が1文字も出ない**
 *
 * ## なぜ本番のデータを引かないか
 *
 * このリポジトリは公開で、Actions のログも誰でも読める。**この入れ物は
 * 「誰が選ばれたか」そのもの**なので、出力に出さない。出てくるのは
 * 仕込んだ `UC_me_0000001` `UC_other_00001` だけ。
 *
 * ## なぜ口（`islandApi.ts`）から叩かないか
 *
 * `islandApi.ts` を読み込むと `onRequest` の登録まで走るし、本番の資格情報は
 * この箱に無い。かわりに `tsc` が書き出した `lib/stampLine.js` を、**偽の
 * firebase-admin を渡して**読み込む。写しは持たない（写しを置くと、本体を
 * 直したのに確かめが古いまま通る）。`lib/streamEvents.js` は**本物をそのまま**通す。
 *
 * ## 探し方が当たることを、先に見る（`docs/island-misses.md` #19）
 *
 * 「他人のぶんが0件」は、**入れ物が空でも0件**になる。だから先に、同じ偽の
 * Firestore に他人のチャンネルで聞いて**その人の書類がちゃんと出ること**を
 * 確かめてから、口のほうで消えることを見る。
 *
 * 回しかた:
 *
 * ```bash
 * node functions/selftest/stampline_mine_selftest.mjs
 * ```
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

/**
 * 1件の確かめ。
 * @param {string} name 何を見ているか
 * @param {boolean} ok 通ったか
 * @param {string} [why] 落ちたときに出す中身（**偽の字だけ**）
 */
function check(name, ok, why = "") {
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
    // 自分のぶん
    chara_me_000001: {
      channelId: "UC_me_0000001",
      suggested: ["いいねぇ", "そうきたか", "ねむい"],
      lines: [],
      pickedAt: 100,
    },
    // 他人のぶん2件。**これが口から取れないことを見る**
    chara_other_0001: {
      channelId: "UC_other_00001",
      suggested: ["たべたい", "いってら", "おつかれ"],
      lines: ["たべたい"],
      pickedAt: 100,
    },
    chara_other_0002: {
      channelId: "UC_other_00002",
      suggested: ["なるほどね"],
      lines: [],
      pickedAt: 100,
    },
  },
  islandUsers: {
    // ログインした人。**合言葉が言う channelId とはわざと別の値を置く**
    "uid-me": {channelId: "UC_me_0000001"},
    // 選ばれていない人（入れ物に書類が無い）
    "uid-not": {channelId: "UC_none_000001"},
    // チャンネルを結んでいない人
    "uid-nochan": {name: "にせもの"},
  },
};

/** 書いた跡。**どの書類に何を書いたか。** */
const writes = [];

/** 何回 Firestore を叩いたか。余計に往復していないかを見る */
const hits = {get: 0, query: 0};

/**
 * 書類1件の姿。
 * @param {string} name コレクション名
 * @param {string} id 書類ID
 * @param {object|undefined} v 中身
 * @return {object} 書類の姿
 */
const snapOf = (name, id, v) => ({
  id,
  exists: !!v,
  data: () => v,
  get: (k) => (v ? v[k] : undefined),
  ref: {
    id,
    set: async (patch, opt) => {
      writes.push({collection: name, id, patch, opt});
      STORE[name][id] = {...(STORE[name][id] ?? {}), ...patch};
    },
  },
});

/**
 * 問い合わせ。`where` / `limit` だけを繋げられる。
 * @param {string} name コレクション名
 * @param {object} q 積んだ条件
 * @return {object} 問い合わせ
 */
function query(name, q) {
  return {
    where: (f, op, v) => {
      if (op !== "==") throw new Error(`偽の Firestore は == しか持たない: ${op}`);
      return query(name, {...q, where: [...(q.where ?? []), [f, v]]});
    },
    limit: (n) => query(name, {...q, limit: n}),
    get: async () => {
      hits.query += 1;
      let rows = Object.entries(STORE[name] ?? {})
        .map(([id, v]) => snapOf(name, id, v));
      for (const [f, v] of q.where ?? []) {
        rows = rows.filter((d) => d.data()[f] === v);
      }
      if (q.limit !== undefined) rows = rows.slice(0, q.limit);
      return {
        empty: rows.length === 0,
        docs: rows,
        size: rows.length,
        forEach: (f) => rows.forEach(f),
      };
    },
  };
}

/**
 * 偽の Firestore。`collection` だけ。
 * @return {object} db
 */
function fakeDb() {
  return {
    collection: (name) => ({
      ...query(name, {}),
      doc: (id) => ({
        id,
        get: async () => {
          hits.get += 1;
          return snapOf(name, id, STORE[name]?.[id]);
        },
        set: async (patch, opt) => {
          writes.push({collection: name, id, patch, opt});
        },
      }),
    }),
    batch: () => {
      throw new Error("偽の Firestore はまとめ書きを持たない");
    },
  };
}

/* ---------------- lib/*.js を、偽の admin で読み込む ---------------- */

console.log("# tsc を回して、いまの src から読み込む");
execFileSync(join(FUNCTIONS, "node_modules/.bin/tsc"), {cwd: FUNCTIONS});

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
    throw new Error("偽の admin は合言葉を確かめない（whoIs は差し替えてある）");
  },
};

/** 出たログ。**視聴者さんの素性が出ていないかを、あとで数える** */
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
  const file = join(FUNCTIONS, "lib", `${name}.js`);
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

const srcText = readFileSync(join(FUNCTIONS, "src", "stampLine.ts"), "utf8");
const {handleStampLine, shapeLines, MAX_LEN, MAX_LINES, SUGGEST} =
  load("stampLine");
if (typeof handleStampLine !== "function") {
  console.error("lib/stampLine.js から handleStampLine を取り出せなかった");
  process.exit(1);
}
console.log(`  読み込んだ長さ: ${srcText.length} 字\n`);

/* ---------------- 借りるもの（`islandApi.ts` の代役） ---------------- */

/** 使った枠。`<uid>_<種別>` → 回数 */
const quota = new Map();
/** 枠の上限。本体の `PER_DAY` を字から切り出す（写しを持たない） */
const PER_DAY = Number(/const PER_DAY = (\d+);/.exec(srcText)?.[1]);

const deps = {
  /* **合言葉が言う channelId は、わざと嘘にしてある。**
     本物の `whoIs` も `islandUsers` から取るが、ここが「送られてきた値を
     信じていないか」を見る唯一の場所なので、別の値を返させる。 */
  whoIs: async (h) => {
    if (h === "Bearer me") {
      return {uid: "uid-me", name: "さくら", channelId: "UC_liar_000001"};
    }
    if (h === "Bearer not") {
      return {uid: "uid-not", name: "にせもの", channelId: "UC_other_00001"};
    }
    if (h === "Bearer nochan") return {uid: "uid-nochan", name: "にせもの"};
    return null;
  },
  takeQuota: async (key, kind, limit) => {
    const k = `${key}_${kind}`;
    const n = (quota.get(k) ?? 0) + 1;
    quota.set(k, n);
    return n <= limit;
  },
};

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
  out.handled = await handleStampLine({method, path, auth, body}, res, deps);
  return out;
}

/* ---------------- 0. 探し方が当たるか（先に見る・#19） ---------------- */

console.log("# 0. 探し方が当たるか（先に見る）");
{
  const all = Object.keys(STORE.islandStampLine);
  check("偽データに3件ある", all.length === 3, `${all.length} 件`);
  /* **同じ偽の Firestore に、他人のチャンネルで聞く。**
     ここで出なければ、下の「他人のぶんは出ない」は空振り */
  const other = await DB.collection("islandStampLine")
    .where("channelId", "==", "UC_other_00001").limit(2).get();
  check(
    "他人のチャンネルで聞けば、その人の書類が出る（0件が空振りでない）",
    other.docs.length === 1 && other.docs[0].id === "chara_other_0001",
    other.docs.map((d) => d.id).join(","),
  );
  check(
    "他人の書類に、ことばが入っている（空の相手と比べていない）",
    (STORE.islandStampLine.chara_other_0001.lines ?? []).length === 1,
  );
  check("枠の上限を本体から切り出せた", Number.isFinite(PER_DAY), String(PER_DAY));
}

/* ---------------- 1. 未ログイン ---------------- */

console.log("\n# 1. 未ログインは 401");
for (const [name, auth] of [
  ["ヘッダ無し", undefined],
  ["空", ""],
  ["Bearer でない", "Basic さくら"],
  ["知らない合言葉", "Bearer にせもの"],
]) {
  for (const method of ["GET", "POST"]) {
    const r = await call(method, "/stampline/mine", auth, {lines: ["わるい"]});
    check(`${method} ${name} → 扱われる`, r.handled === true);
    check(`${method} ${name} → 401`, r.status === 401, String(r.status));
    check(
      `${method} ${name} → ことばを1文字も返さない`,
      r.body?.suggested === undefined && r.body?.lines === undefined,
      JSON.stringify(r.body),
    );
    check(
      `${method} ${name} → 掛け値は no-store`,
      r.head["Cache-Control"] === "no-store",
      r.head["Cache-Control"],
    );
  }
}
check(
  "未ログインの POST は1件も書いていない",
  writes.length === 0,
  `${writes.length} 件`,
);

/* ---------------- 2. ログイン済みは自分のぶんだけ ---------------- */

console.log("\n# 2. ログイン済みは、自分のぶんだけ");
{
  const r = await call("GET", "/stampline/mine", "Bearer me");
  const js = JSON.stringify(r.body);
  check("扱われる", r.handled === true);
  check("200", r.status === 200, String(r.status));
  check("picked は true", r.body?.picked === true, js);
  check(
    `提案が ${SUGGEST} 本返る`,
    (r.body?.suggested ?? []).length === SUGGEST,
    js,
  );
  check(
    "返ったのは自分の提案",
    (r.body?.suggested ?? []).join(",") === "いいねぇ,そうきたか,ねむい",
    js,
  );
  check("まだ決めていないので lines は空", (r.body?.lines ?? []).length === 0, js);
  check("置ける本数が返る", r.body?.max === MAX_LINES, String(r.body?.max));
  check("字数が返る", r.body?.maxLen === MAX_LEN, String(r.body?.maxLen));
  /* **他人のことばが1文字も混ざっていない。** 仕込んだ他人の提案5本を
     1つずつ当てる（「自分のが返った」だけでは、混ざっていても通る） */
  const theirs = ["たべたい", "いってら", "おつかれ", "なるほどね"];
  check(
    "他人のことばが1文字も混ざっていない",
    theirs.every((t) => !js.includes(t)),
    js,
  );
  check(
    "他人の書類IDが1つも混ざっていない",
    !js.includes("other"),
    js,
  );
  check(
    "合言葉が言う channelId は使わない（islandUsers から取り直す）",
    !js.includes("UC_liar") && !js.includes("UC_"),
    js,
  );
  check(
    "掛け値は no-store（CDN にも中間にも置かせない）",
    r.head["Cache-Control"] === "no-store",
    r.head["Cache-Control"],
  );
  check(
    "公開の口の掛け値を付けていない",
    !String(r.head["Cache-Control"]).includes("s-maxage"),
    r.head["Cache-Control"],
  );
}

/* ---------------- 3. 選ばれていない人 ---------------- */

console.log("\n# 3. 入っていない人には、picked: false だけ");
for (const [name, auth] of [
  ["チャンネルは在るが入れ物に無い人", "Bearer not"],
  ["チャンネルを結んでいない人", "Bearer nochan"],
]) {
  const r = await call("GET", "/stampline/mine", auth);
  const js = JSON.stringify(r.body);
  check(`${name} → 200（500 にしない）`, r.status === 200, String(r.status));
  check(`${name} → picked は false`, r.body?.picked === false, js);
  check(
    `${name} → 欄そのものが無い（空の配列を返さない）`,
    Object.keys(r.body ?? {}).join(",") === "picked",
    js,
  );
  /* **「入っていない人」の合言葉は、他人のチャンネルを名乗っている。**
     口がそれを見ていたら、ここで他人のことばが返る */
  check(
    `${name} → 他人のことばが返らない`,
    !js.includes("たべたい"),
    js,
  );
}
{
  const r = await call("POST", "/stampline/mine", "Bearer not", {
    lines: ["われわれの"],
  });
  check("入っていない人の POST は 403", r.status === 403, String(r.status));
  check(
    "入っていない人の POST は1件も書かない",
    writes.length === 0,
    `${writes.length} 件`,
  );
}

/* ---------------- 4. 書けるのは自分のぶんだけ ---------------- */

console.log("\n# 4. 書けるのは自分のぶんだけ");
{
  const r = await call("POST", "/stampline/mine", "Bearer me", {
    /* **他人を名指しする材料を、ぜんぶ body に入れて送る。**
       どれも見ていないので、自分の書類しか動かない */
    lines: ["ねむい", "いいねぇ", "ねむい", "  ", "あしたも\nがんばる"],
    id: "chara_other_0001",
    characterId: "chara_other_0001",
    channelId: "UC_other_00001",
    uid: "uid-not",
    docId: "chara_other_0002",
  });
  check("200", r.status === 200, String(r.status));
  check("書いたのは1件だけ", writes.length === 1, `${writes.length} 件`);
  check(
    "書いた先は自分の書類",
    writes[0]?.id === "chara_me_000001",
    writes[0]?.id,
  );
  check(
    "他人の書類は1バイトも変わっていない",
    JSON.stringify(STORE.islandStampLine.chara_other_0001.lines) ===
      JSON.stringify(["たべたい"]) &&
      (STORE.islandStampLine.chara_other_0002.lines ?? []).length === 0,
    JSON.stringify(STORE.islandStampLine.chara_other_0001),
  );
  check(
    "触ったのは lines と時刻と uid だけ",
    Object.keys(writes[0]?.patch ?? {}).sort().join(",") ===
      "lines,updatedAt,updatedBy",
    Object.keys(writes[0]?.patch ?? {}).join(","),
  );
  check("まるごと置き換えない（merge）", writes[0]?.opt?.merge === true);
  check(
    "提案は書き換えない",
    writes[0]?.patch?.suggested === undefined,
  );
  const saved = writes[0]?.patch?.lines ?? [];
  check(
    "空と重なりを落とす",
    saved.join("|") === "ねむい|いいねぇ|あしたも がんばる",
    saved.join("|"),
  );
  check(
    "改行は1つも残らない",
    !saved.some((t) => /[\r\n]/.test(t)),
    saved.join("|"),
  );
  check(
    "返りは書いたものと同じ",
    (r.body?.lines ?? []).join("|") === saved.join("|"),
    JSON.stringify(r.body?.lines),
  );
  /* **書いたあとに読み直しても、自分のぶんだけ。** */
  const again = await call("GET", "/stampline/mine", "Bearer me");
  check(
    "読み直すと、書いたことばが返る",
    (again.body?.lines ?? []).join("|") === saved.join("|"),
    JSON.stringify(again.body?.lines),
  );
  check(
    "読み直しても他人のことばは混ざらない",
    !JSON.stringify(again.body).includes("たべたい"),
    JSON.stringify(again.body),
  );
}

/* ---------------- 5. 上限 ---------------- */

console.log("\n# 5. 上限（字数・本数・1日の回数）");
{
  const long = "あ".repeat(MAX_LEN + 9);
  const many = Array.from({length: MAX_LINES + 4}, (_, i) => `こ${i}`);
  check(
    `1本は ${MAX_LEN} 字で切る`,
    shapeLines([long])[0].length === MAX_LEN,
    String(shapeLines([long])[0].length),
  );
  check(
    `${MAX_LINES} 本で切る`,
    shapeLines(many).length === MAX_LINES,
    String(shapeLines(many).length),
  );
  check("配列でないものは空", shapeLines("ねむい").length === 0);
  check("中の数字や null は落ちる", shapeLines([1, null, "よし"]).length === 1);
  /* 枠。**先に「まだ通る」ことを見る**（通らないだけなら、口が壊れていても
     同じ顔になる。#19） */
  const before = writes.length;
  const ok = await call("POST", "/stampline/mine", "Bearer me", {lines: ["よし"]});
  check("枠の内側は 200", ok.status === 200, String(ok.status));
  check("書けている", writes.length === before + 1);
  /* 枠を使い切る。**何回目で切れたかも見る**（上限の値が本体と合っているか） */
  let last = ok;
  let turned = 0;
  for (let i = 0; i < PER_DAY + 3; i += 1) {
    last = await call("POST", "/stampline/mine", "Bearer me", {lines: ["よし"]});
    if (last.status === 429 && !turned) turned = i + 1;
  }
  check("枠を超えると 429", last.status === 429, String(last.status));
  check(
    `切れるのは ${PER_DAY} 回を使い切ったあと`,
    turned === PER_DAY - 1,
    `${turned} 回目で切れた（枠は ${PER_DAY}、先に2回使っている）`,
  );
  /* **429 の回は1バイトも書かない。** 枠を数えたあとに書いていると、
     上限を超えても最後の1回が通る */
  const n0 = writes.length;
  const over = await call("POST", "/stampline/mine", "Bearer me", {
    lines: ["こえた"],
  });
  check("もう一度叩いても 429", over.status === 429, String(over.status));
  check("429 のときは1件も書かない", writes.length === n0, `${writes.length - n0} 件`);
  check(
    "429 のことばは置き場に入っていない",
    !STORE.islandStampLine.chara_me_000001.lines.includes("こえた"),
    STORE.islandStampLine.chara_me_000001.lines.join("|"),
  );
}

/* ---------------- 6. ほかのパスは扱わない ---------------- */

console.log("\n# 6. ほかのパスは扱わない（下の口へ落ちる）");
for (const [method, path] of [
  ["GET", "/stampline"],
  ["GET", "/stampline/mine/"],
  ["GET", "/stampline/chara_other_0001"],
  ["POST", "/stampline/chara_other_0001"],
  ["GET", "/stamplines/mine"],
  ["DELETE", "/stampline/mine"],
]) {
  const r = await call(method, path, "Bearer me");
  check(`${method} ${path} → 扱わない`, r.handled === false, `handled=${r.handled}`);
  check(`${method} ${path} → 何も返さない`, r.body === undefined);
}
check(
  "本体に、パスから id を取る正規表現が1つも無い",
  !/path\.match|exec\(q\.path\)|\\\/stampline\\\//.test(srcText),
);

/* ---------------- 7. ログに素性を出していない ---------------- */

console.log("\n# 7. ログに、視聴者さんの素性が1文字も出ない");
{
  const all = logs.join("\n");
  check("チャンネルIDが出ていない", !all.includes("UC_"), all.slice(0, 120));
  check(
    "名前が出ていない",
    !all.includes("さくら") && !all.includes("にせもの"),
  );
  check("uid が出ていない", !all.includes("uid-"));
  check("書類IDが出ていない", !all.includes("chara_"));
  check(
    "ことばが出ていない",
    !all.includes("ねむい") && !all.includes("たべたい"),
  );
  console.log(`  出たログ: ${logs.length} 行`);
}

console.log("");
if (bad > 0) {
  console.log(`NG が ${bad} 件。`);
  process.exit(1);
}
console.log("ぜんぶ通った。");
