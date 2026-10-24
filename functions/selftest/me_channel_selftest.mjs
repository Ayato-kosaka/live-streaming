/**
 * **`islandUsers.channelId` に、名乗っただけの値が入らないこと。**
 *
 * ## 何を守っているか
 *
 * チャンネルIDは公開の値で、島は `islandUsers/{uid}.channelId` を鍵にして
 * 「その人のもの」を決めている。鍵が言い値だと、ログインできる人は誰でも:
 *
 *   - `GET /cards/mine` … 他人のカードが全部読める
 *   - `POST /stampline/mine` … **他人の「戻らないことば」を上書きできる**
 *     （2026-10-14 に口ごと閉じた。#860）
 *   - `listResidents()` … 他人のキャラクターの絵で島に立てる
 *
 * 3つとも「送られた値を信じず `islandUsers` から引き直す」正しい形で
 * 書いてあった。**引き直した先が言い値だった**ので空回りしていた。
 *
 * ## 2つを別々に見る
 *
 * | | 何を見るか | どう見るか |
 * | --- | --- | --- |
 * | A | `ownedChannel()` が、**合言葉の持ち主のチャンネルしか返さない** | `lib/youtubeOwner.js` に偽の `fetch` を渡して動かす |
 * | B | `POST /me` が、**body から chanelId を読む道を1本も持たない** | `src/islandApi.ts` の字を読む |
 *
 * **B を字で見るのは、`islandApi.ts` を読み込めないから。**
 * あちらは読み込んだ時点で `onRequest` の登録まで走るし、本番の資格情報が
 * この箱に無い（`stampline_mine_selftest.mjs` も同じ理由で `lib/` から読んでいる）。
 * 字で見る確かめは「無いこと」しか言えないので、**A で「在るべき道が
 * 1本だけ在ること」を動かして確かめてから**、B で「ほかの道が無いこと」を見る。
 *
 * ## 対照（`docs/island-standards.md` §13）
 *
 * **毎回いっしょに、わざと緩めた写しで回して、狙った行が赤くなるか**を見る。
 * 緩めるのは6つ:
 *
 *   1. チャンネルIDの形を見なくする → 空の返事が「確かめの取れた値」になる
 *   2. `mine=true` を外す → 他人を引ける URL になる
 *   3. 形の違う合言葉を落とさなくする → ヘッダに何でも入る
 *   4. 合言葉が空でも叩きに行く → 島を開くたびに YouTube の割り当てを削る
 *   5. `POST /me` に `body.channelId` を読む行を戻す → B が赤くなる
 *   6. 言い値を断らず黙って無視する → 本番で塞がりを確かめる手がかりが消える
 *
 * 回しかた:
 *
 * ```bash
 * node functions/selftest/me_channel_selftest.mjs
 * ```
 */

import {execFileSync} from "node:child_process";
import {cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync}
  from "node:fs";
import {createRequire} from "node:module";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FUNCTIONS = join(HERE, "..");
/** 対照は、壊した写しを指すためにここを差し替える */
const LIB = process.env.ME_LIB_DIR || join(FUNCTIONS, "lib");
const SRC = process.env.ME_SRC_FILE || join(FUNCTIONS, "src", "islandApi.ts");
/* **対照は、毎回いっしょに回す。** 別の合言葉を付けたときだけ回る形に
   すると、CI では一生回らない（`fund_docid_selftest.mjs` と同じ決め）。
   写しの中から自分を呼ぶときは `ME_LIB_DIR` が立つので、そこで止まる。 */
const CONTROL = !process.env.ME_LIB_DIR;

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

/* ---------------- lib を、偽の admin で読み込む ---------------- */

if (!process.env.ME_LIB_DIR) {
  console.log("# tsc を回して、いまの src から読み込む");
  // -b: src が lib より新しいときだけ書き出す（src を変えれば作り直し、型の誤りでは今までどおり落ちる）。
  // Selftests では functions/selftest の見張りが同じ src から同じ lib を1本ずつ作り直していて、1本 10秒がほぼそれだった
  execFileSync(join(FUNCTIONS, "node_modules/.bin/tsc"), ["-b"], {cwd: FUNCTIONS});
}

/** 出たログ。**合言葉が1文字も出ていないかを、あとで数える** */
const logs = [];
const fakeFunctions = {
  logger: {
    warn: (...a) => logs.push(a.join(" ")),
    info: (...a) => logs.push(a.join(" ")),
    error: (...a) => logs.push(a.join(" ")),
  },
};
const fakeAdmin = {
  apps: [],
  initializeApp: () => {
    fakeAdmin.apps.push({});
  },
  firestore: Object.assign(() => ({collection: () => ({doc: () => ({})})}), {
    FieldValue: {serverTimestamp: () => 0},
  }),
  storage: () => {
    throw new Error("偽の admin は置き場を持たない");
  },
  auth: () => {
    throw new Error("偽の admin は合言葉を確かめない");
  },
};

const nodeRequire = createRequire(import.meta.url);
const loaded = new Map();

/**
 * `lib/<名前>.js` を、偽の admin を渡して読み込む。**写しは持たない。**
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
    if (id.startsWith("./")) return load(id.slice(2));
    return nodeRequire(id);
  };
  new Function("require", "exports", "module", "__filename", "__dirname", src)(
    req, mod.exports, mod, file, dirname(file),
  );
  loaded.set(name, mod.exports);
  return mod.exports;
}

const {ownedChannel, MINE_URL} = load("youtubeOwner");
if (typeof ownedChannel !== "function") {
  console.error("lib/youtubeOwner.js から ownedChannel を取り出せなかった");
  process.exit(2);
}

/* ---------------- 偽の YouTube ---------------- */

/** 本物のチャンネル1つ。**ぜんぶ偽の字。** */
const MINE = {
  id: "UCaaaaaaaaaaaaaaaaaaaaaa",
  snippet: {
    customUrl: "@mine-selftest",
    title: "にせもののチャンネル",
    thumbnails: {default: {url: "https://x.invalid/d.png"},
      medium: {url: "https://x.invalid/m.png"}},
  },
};
/** 他人のチャンネル。**合言葉では絶対に出てこない相手** */
const OTHER_ID = "UCbbbbbbbbbbbbbbbbbbbbbb";

/** 叩いた記録。URL とヘッダ */
let calls = [];

/**
 * 偽の `fetch`。**合言葉ごとに違う返事をする。**
 * @param {string} token どの合言葉で叩かれたとき、どう返すか
 * @return {Function} fetch のかわり
 */
const fakeFetch = (token) => async (url, init) => {
  calls.push({url, auth: init?.headers?.authorization ?? ""});
  if (token === "down") throw new Error("getaddrinfo ENOTFOUND");
  if (token === "401") return {ok: false, status: 401, json: async () => ({})};
  if (token === "empty") return {ok: true, status: 200, json: async () => ({items: []})};
  if (token === "noid") {
    return {ok: true, status: 200,
      json: async () => ({items: [{snippet: {title: "からっぽ"}}]})};
  }
  if (token === "badid") {
    return {ok: true, status: 200,
      json: async () => ({items: [{id: "notachannel", snippet: {}}]})};
  }
  return {ok: true, status: 200, json: async () => ({items: [MINE]})};
};

/* ---------------- A. `ownedChannel()` を動かす ---------------- */

console.log("\n# A. 合言葉の持ち主のチャンネルしか返さない");
{
  calls = [];
  const got = await ownedChannel("good-token", fakeFetch("good"));
  check("合言葉が通れば、そのチャンネルが返る",
    got?.channelId === MINE.id, JSON.stringify(got));
  check("ハンドルも、YouTube が言ったほうを使う",
    got?.handle === "@mine-selftest", String(got?.handle));
  check("顔も、YouTube が言ったほうを使う",
    got?.thumbnail === "https://x.invalid/m.png", String(got?.thumbnail));
  check("他人のチャンネルは、どうやっても返らない",
    got?.channelId !== OTHER_ID, String(got?.channelId));
}

console.log("\n# A2. 叩く先に、他人を指す手がかりが1つも無い");
{
  check("`mine=true` が付いている", MINE_URL.includes("mine=true"), MINE_URL);
  check("`id=` が付いていない", !/[?&]id=/.test(MINE_URL), MINE_URL);
  check("`forHandle=` が付いていない", !MINE_URL.includes("forHandle"), MINE_URL);
  check("叩いたのは1回だけ", calls.length === 1, `${calls.length} 回`);
  check("叩いた URL が `MINE_URL` そのもの",
    calls[0]?.url === MINE_URL, String(calls[0]?.url));
  check("合言葉は Authorization に載せる（URL に出さない）",
    !String(calls[0]?.url).includes("good-token"), String(calls[0]?.url));
}

console.log("\n# A3. 確かめが取れなかったら、必ず null");
for (const [name, token] of [
  ["合言葉が空", ""],
  ["合言葉が文字列でない", null],
  ["YouTube が 401", "401"],
  ["YouTube が落ちている", "down"],
  ["チャンネルが1つも無い", "empty"],
  ["id の欄が無い", "noid"],
  ["id が UC+22字の形でない", "badid"],
  ["合言葉に改行が混ざっている", "aaa\nbbb"],
  ["合言葉に空白が混ざっている", "aaa bbb"],
]) {
  const got = await ownedChannel(token, fakeFetch(token));
  check(`${name} → null`, got === null, JSON.stringify(got));
}

console.log("\n# A4. 叩かなくてよい回は、叩かない（割り当てを削らない）");
for (const [name, token] of [
  ["合言葉が空", ""],
  ["合言葉が undefined", undefined],
  ["形の違う合言葉", "aaa bbb"],
]) {
  calls = [];
  await ownedChannel(token, fakeFetch("good"));
  check(`${name} → YouTube を1回も叩かない`, calls.length === 0,
    `${calls.length} 回`);
}

console.log("\n# A5. ログに合言葉が1文字も出ない");
{
  const all = logs.join("\n");
  check("合言葉が出ていない",
    !all.includes("good-token") && !all.includes("Bearer"), all.slice(0, 120));
  check("チャンネルIDが出ていない", !all.includes("UC"), all.slice(0, 120));
  console.log(`  出たログ: ${logs.length} 行`);
}

/* ---------------- B. `POST /me` に、言い値を読む道が無い ---------------- */

console.log("\n# B. `POST /me` が、body からチャンネルを読まない");
{
  const src = readFileSync(SRC, "utf8");
  /* **コメントを落としてから数える**（`docs/island-audit.md` の決まり。
     「前はこうしていた」と書いた注を、直っていない証拠として数えない）。 */
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  /* `body.channelId` に触れてよいのは**断る行の1本だけ。**
     値として使う行（`clean(body.channelId, …)` など）は1本も無い。 */
  const chLines = (code.match(/.*body\.channelId.*/g) ?? []).map((x) => x.trim());
  check("`body.channelId` に触るのは、断る行の1本だけ",
    chLines.length === 1 && chLines[0].includes("!== undefined"),
    chLines.join(" / "));
  check("`body.handle` を読む行が1本も無い",
    !/body\.handle/.test(code),
    (code.match(/.*body\.handle.*/) ?? [""])[0].trim());
  check("`body.thumbnail` を読む行が1本も無い",
    !/body\.thumbnail/.test(code),
    (code.match(/.*body\.thumbnail.*/) ?? [""])[0].trim());
  check("`body.title` を読む行が1本も無い",
    !/body\.title/.test(code),
    (code.match(/.*body\.title.*/) ?? [""])[0].trim());
  check("`ownedChannel(` を通っている",
    /ownedChannel\(body\.ytToken\)/.test(code));
  /* **言い値を送られたら断る。** 黙って無視するだけだと、塞がったことを
     本番で確かめる手がかりが1つも残らない（`docs/island-api.md` 7章）。 */
  check("`body.channelId` が在ったら 400 で断る",
    /body\.channelId !== undefined/.test(code) &&
      /channelId not accepted/.test(code));
  /* **断るのは、合言葉を見るより前。** あとに置くと、確かめるのに本物の
     ログインが要る＝書く側を叩かないと確かめられない。 */
  const meHead = code.slice(code.indexOf('path === "/me"')).slice(0, 1200);
  check("断る判定が、合言葉を見るより前に在る",
    meHead.indexOf("channelId not accepted") <
      meHead.indexOf("^Bearer (.+)$"),
    `断り ${meHead.indexOf("channelId not accepted")} / ` +
      `合言葉 ${meHead.indexOf("^Bearer (.+)$")}`);
  check("`channelId` に入るのは `owned` から来た値だけ",
    /const channelId = owned\?\.channelId \?\? "";/.test(code));
  /* **言い値を別の名前で受け直していないか。** 上の4つを avoid しても、
     `clean(body.ch, 64)` のような行が1本在れば穴は戻る。だから
     「どの欄を body から読んでいるか」を数えて、**本人が決めるもの
     （`nickname` / `showName` / `showPhoto`）以外が1つも無い**ことを見る。
     `ytToken` は合言葉で、チャンネルを指す値ではない。 */
  /* 断る行（`body.channelId !== undefined`）は**値を読んでいない**ので、
     数える前に外す。上で「その行が1本だけ在ること」は別に見てある。 */
  const inMe = code
    .slice(code.indexOf('path === "/me"'))
    .slice(0, 3000)
    .replace(/body\.channelId !== undefined/g, "");
  const MINE_OK = new Set(["nickname", "showName", "showPhoto", "ytToken"]);
  const read = [...inMe.matchAll(/body\.([A-Za-z]+)/g)]
    .map((m) => m[1])
    .filter((k) => !MINE_OK.has(k));
  check("`/me` が body から読むのは、本人が決める欄だけ",
    read.length === 0, [...new Set(read)].join(" / "));
}

/* ---------------- 対照 ---------------- */

/** [名前, どのファイル, 探す字, 置き換える字, 落ちてほしい行] */
const BREAKS = [
  [
    "チャンネルIDの形を見なくする",
    "lib",
    "/^UC[A-Za-z0-9_-]{22}$/.test(channelId)",
    "true",
    "id の欄が無い → null",
  ],
  [
    "`mine=true` を外す",
    "lib",
    "?part=snippet&mine=true&maxResults=1",
    "?part=snippet&maxResults=1",
    "`mine=true` が付いている",
  ],
  [
    "形の違う合言葉を落とさなくする",
    "lib",
    "/^[A-Za-z0-9._~+/=-]+$/.test(token)",
    "true",
    "合言葉に改行が混ざっている → null",
  ],
  [
    "合言葉が空でも叩きに行く",
    "lib",
    ["if (!token)\n        return null;", "if (false)\n        return null;"],
    ["/^[A-Za-z0-9._~+/=-]+$/.test(token)", "true"],
    "合言葉が空 → YouTube を1回も叩かない",
  ],
  [
    "`POST /me` に言い値を読む行を戻す",
    "src",
    'const channelId = owned?.channelId ?? "";',
    'const channelId = clean(body.channelId, 64);',
    "`body.channelId` に触るのは、断る行の1本だけ",
  ],
  [
    "言い値を断らず、黙って無視する",
    "src",
    "if (body.channelId !== undefined) {",
    "if (false) {",
    "`body.channelId` が在ったら 400 で断る",
  ],
];

if (CONTROL) {
  console.log("\n# 対照（わざと緩めた写しで回して、狙った行が赤くなるか）");
  const libSrc = readFileSync(join(LIB, "youtubeOwner.js"), "utf8");
  const srcSrc = readFileSync(SRC, "utf8");

  /**
   * 壊した写しで、自分をもう一度回す。
   * @param {string|null} brokenLib 壊した `youtubeOwner.js`。null ならそのまま
   * @param {string|null} brokenSrc 壊した `islandApi.ts`。null ならそのまま
   * @return {object} spawnSync の返り
   */
  const runCopy = (brokenLib, brokenSrc) => {
    const box = mkdtempSync(join(tmpdir(), "mechan-"));
    cpSync(LIB, join(box, "lib"), {recursive: true});
    try {
      symlinkSync(join(FUNCTIONS, "node_modules"), join(box, "node_modules"));
    } catch {
      /* 既に在るなら、そのまま */
    }
    if (brokenLib !== null) {
      writeFileSync(join(box, "lib", "youtubeOwner.js"), brokenLib, "utf8");
    }
    let srcPath = SRC;
    if (brokenSrc !== null) {
      srcPath = join(box, "islandApi.ts");
      writeFileSync(srcPath, brokenSrc, "utf8");
    }
    const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      env: {...process.env, ME_LIB_DIR: join(box, "lib"), ME_SRC_FILE: srcPath},
      encoding: "utf8",
    });
    rmSync(box, {recursive: true, force: true});
    return run;
  };

  {
    const run = runCopy(null, null);
    check("壊していない写しは緑のまま", run.status === 0,
      `終了コード ${run.status} / ${(run.stdout ?? "").slice(-300)}`);
  }
  for (const [what, which, from, to, wantRow] of BREAKS) {
    const base = which === "lib" ? libSrc : srcSrc;
    /* 2か所いっぺんに緩めないと表に出ないものがある（空の合言葉は、
       形の見張りにも引っかかるので、片方だけ外しても落ちない）。
       **だから「何を緩めたか」を配列でも書けるようにしてある。** */
    const pairs = Array.isArray(from) ? [from, to] : [[from, to]];
    let broken = base;
    let missing = "";
    for (const [f, t] of pairs) {
      if (!broken.includes(f)) {
        missing = f;
        break;
      }
      broken = broken.replace(f, t);
    }
    if (missing) {
      check(`${what}: 緩める字が当たる`, false, `「${missing}」が ${which} に無い`);
      continue;
    }
    const run = which === "lib" ? runCopy(broken, null) : runCopy(null, broken);
    const hit = (run.stdout ?? "").includes(`NG   ${wantRow}`);
    check(`${what}: 「${wantRow}」が赤くなる`, run.status === 1 && hit,
      `終了コード ${run.status} / その行が赤い: ${hit}`);
  }
}

console.log(`\n通った ${ok}件 / 落ちた ${bad}件`);
if (ok === 0) {
  console.log("数えるものが1件も無かった。");
  process.exit(2);
}
process.exit(bad ? 1 : 0);
