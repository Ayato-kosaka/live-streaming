/**
 * **作った瞬間に、YouTube の表示名が呼び名に入るか（#155）。**
 *
 * ## 何を見ているか
 *
 * 画面から人を足すとき、`channelName` に入るのはたいてい**ハンドル**
 * （`@えびっち-m7r`）。ところが**ドネルは名乗りの初期値に「表示名」を
 * 入れてくる**ので、ハンドルしか持っていない人はドネルから引けない
 * （#147 #148）。毎晩の繋ぎは翌朝には追いつくが、**作った日のあいだ、
 * その人は引けないまま。** だから口（`POST /characters/{id}`）が、
 * 書く前に引いて呼び名へ入れる。
 *
 * ここで確かめるのは6つ。
 *
 * 1. **ハンドルを渡したら**、表示名が `aliases` と `lookupKeys` に入る
 * 2. **表示名を渡したら**、引きに行かない・余計なものが入らない
 * 3. **引けなかったら**、作成は通って、返事に理由が入る
 * 4. **手で入れた呼び名が消えない**（足すだけ）
 * 5. `channelKeys` は広がらない（取り違えを減らすためのわざと狭い欄・#539）
 * 6. **その名乗りがもう無い（404）ときに、書類へ印が残る**（#158）。
 *    押した回のログに1行出るだけでは、図鑑を開いた人に見えない。
 *    印は**次に開いたとき**（`GET /characters`）にも出ていないといけない
 *
 * ## 引き先は偽物を当てる
 *
 * 本物の YouTube を叩くと、この箱の電波と向こうの機嫌で結果が変わる。
 * `YT_BASE` に**その場で立てた HTTP の口**を当てて、**本物の
 * `fetch` と本物の題の拾い方**を通す（拾い方だけ写して回すと、本体を
 * 直したのに確かめが古いまま通る）。
 *
 * ハンドルの頁は本番で 1.69MB あって `og:title` は 757KB 目に居るので、
 * 偽物も**題の前に詰め物を置く。** 途中で切り上げているかまで見る。
 *
 * ## 対照（足を1本ずつ壊す）
 *
 * 通ることだけ見ても、**何も見ていない診断**は緑になる。だから
 * `lib/islandCharacter.js` の写しを6通りに壊して、**そのたびに
 * この診断が赤くなる**ことまで見る。壊す字が当たらなくなったら
 * （本体を直して形が変わったら）、そこで赤くする。
 *
 * 回しかた:
 *
 * ```bash
 * node functions/selftest/character_alias_selftest.mjs
 * ```
 */

import {execFileSync, spawnSync} from "node:child_process";
import {createServer} from "node:http";
import {cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {createRequire} from "node:module";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FUNCTIONS = join(HERE, "..");
/** `lib` の置き場。**壊した写しで回すときだけ、ここを差し替える。** */
const LIB = process.env.CHAR_LIB_DIR || join(FUNCTIONS, "lib");
/** 写しで回すときは `tsc` を通さない（差し替えた `lib` を焼き直してしまう） */
const BUILD = !process.env.CHAR_LIB_DIR;
/** 対照を回すのは本物のときだけ（写しの中で写しを作らない） */
const CONTROL = BUILD;

/** 合否。1つでも落ちたら終了コード1で出る */
let bad = 0;
/** 通った数。報告に出すので数えておく */
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

/* ---------------- 偽の YouTube ---------------- */

/** 本物のハンドル頁は 1.69MB で、題は 757KB 目。**詰め物で同じ形にする** */
const PAD = "<!-- " + "x".repeat(200_000) + " -->";

/** 何回引きに来たか。**表示名を打ったときに0であること**を見る */
const hits = [];

/**
 * **あとから取れるようになる**ハンドル（#158）。
 *
 * 印が「付く」だけ見ても足りない。**取れるようになった日に消える**ところまで
 * 見ないと、一度 404 を返した人に永久に札が貼られる。
 * 名乗りを変えずに向こうだけ変わる形にしてあるのは、**名前の書き換えと
 * 混ざらないようにする**ため（あちらは別の足で測る）。
 */
const REVIVED = new Set();

/**
 * **急に届かなくなる**ハンドル（#158）。
 *
 * 404 の印が付いている人に、次は**出口**の事故（切断）が起きたとき。
 * ここで印を落とすと、次に開いた人には直っているように見える。
 */
const BLIND = new Set();

/**
 * 偽の引き先。ハンドルごとに返すものを変える。
 * @param {string} title `og:title` に入れる字
 * @return {string} 頁の中身
 */
const page = (title, id = "") =>
  `<!doctype html><html><head>${PAD}` +
  (id ?
    `<link rel="canonical" href="https://www.youtube.com/channel/${id}">` :
    "") +
  `<meta property="og:title" content="${title}">` +
  `<meta property="og:description" content="つづき">` +
  `</head><body>${PAD}</body></html>`;

/**
 * feed。**`<entry>` の中にも `<title>` を置く**（動画の題を拾わないか）。
 * @param {string} title チャンネルの題
 * @return {string} Atom
 */
const feed = (title) =>
  "<?xml version=\"1.0\"?><feed><title>" + title + "</title>" +
  "<entry><title>はじめての配信</title></entry></feed>";

const YT = createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  hits.push(url.pathname + url.search);
  if (url.pathname === "/feeds/videos.xml") {
    const id = url.searchParams.get("channel_id") ?? "";
    if (id === "UCgone000000000000000000") {
      res.writeHead(404).end("no");
      return;
    }
    res.writeHead(200, {"Content-Type": "application/xml"});
    res.end(feed("しろくま ていえん"));
    return;
  }
  const h = decodeURIComponent(url.pathname.slice(1));
  if (BLIND.has(h)) {
    // 出口の事故。**名乗りの話ではない**
    res.writeHead(200, {"Content-Type": "text/html"});
    res.write("<!doctype html><head>");
    res.socket.destroy();
    return;
  }
  if (h === "@fukkatsu-0000") {
    if (!REVIVED.has(h)) {
      res.writeHead(404).end("no");
      return;
    }
    res.writeHead(200, {"Content-Type": "text/html"})
      .end(page("ふっかつ", "UCfukkatsu00000000000000"));
    return;
  }
  if (h === "@nakunatta-000") {
    res.writeHead(404).end("no");
    return;
  }
  if (h === "@kesareta-0000") {
    res.writeHead(404).end("no");
    return;
  }
  if (h === "@shimedasare-00") {
    // 締め出されると題が YouTube そのものになる。**名前として受け取らない**
    res.writeHead(200, {"Content-Type": "text/html"}).end(page("YouTube"));
    return;
  }
  if (h === "@kireru-000000") {
    // 途中で切れる。**「届かなかった」に落ちる**
    res.writeHead(200, {"Content-Type": "text/html"});
    res.write("<!doctype html><head>");
    res.socket.destroy();
    return;
  }
  if (h === "@onajiji-00000") {
    res.writeHead(200, {"Content-Type": "text/html"})
      .end(page("onajiji-00000", "UConajiji000000000000000"));
    return;
  }
  if (h === "@aoi-0000000") {
    res.writeHead(200, {"Content-Type": "text/html"})
      .end(page("あお", "UCaoi0000000000000000000"));
    return;
  }
  if (h === "@uwagaki-0000") {
    res.writeHead(200, {"Content-Type": "text/html"})
      .end(page("うわがき", "UCuwagaki000000000000000"));
    return;
  }
  if (h === "@kaburu-00000") {
    res.writeHead(200, {"Content-Type": "text/html"})
      .end(page("かぶる", "UCkaburu0000000000000000"));
    return;
  }
  if (h === "@id-no-nai-000") {
    // **題は読めるが、IDが読めない頁。** 作りが変わったときがこれ
    res.writeHead(200, {"Content-Type": "text/html"}).end(page("いどなし"));
    return;
  }
  res.writeHead(200, {"Content-Type": "text/html"})
    .end(page("えびっち", "UCebicchi000000000000000"));
});

await new Promise((r) => YT.listen(0, "127.0.0.1", r));
const PORT = YT.address().port;
process.env.YT_BASE = `http://127.0.0.1:${PORT}`;

/* ---------------- 偽の Firestore ---------------- */

/** 入れ物。書類ID → 中身。**ぜんぶ偽の字。** */
const STORE = {};

/**
 * `admin.firestore.FieldValue.delete()` の代わり。
 *
 * **本物と同じく「欄を落とす」印**として扱う。ここを素の値にすると、
 * 印を消したはずの欄が `{}` のまま残って、**消えていないのに緑**になる。
 */
const DELETE = Symbol("delete");

/**
 * 書類1件の姿。
 * @param {string} id 書類ID
 * @param {object|undefined} v 中身
 * @return {object} 書類の姿
 */
const snapOf = (id, v) => ({id, exists: !!v, data: () => v});

/**
 * 問い合わせ。**`where("channelId", "==", …)` だけ。**
 * @param {Array} where 積んだ条件
 * @param {number} lim 何件まで
 * @return {object} 問い合わせ
 */
function query(where, lim) {
  return {
    where: (f, op, v) => {
      if (op !== "==") throw new Error(`偽の Firestore は == しか持たない`);
      return query([...where, [f, v]], lim);
    },
    limit: (n) => query(where, n),
    get: async () => {
      let rows = Object.entries(STORE).map(([id, v]) => snapOf(id, v));
      for (const [f, v] of where) rows = rows.filter((d) => d.data()[f] === v);
      if (lim !== undefined) rows = rows.slice(0, lim);
      return {size: rows.length, docs: rows, forEach: (f) => rows.forEach(f)};
    },
  };
}

/**
 * 偽の Firestore。`collection().doc()` の読み書きと、`where` 1つだけ。
 * @return {object} db
 */
function fakeDb() {
  return {
    collection: () => ({
      ...query([], undefined),
      doc: (id) => ({
        id,
        get: async () => snapOf(id, STORE[id]),
        set: async (v) => {
          /* **`FieldValue.delete()` を、本当に消す。** 単に上書きすると
             「印を消した」を測れない（欄が残ったまま緑になる） */
          const now = {...(STORE[id] ?? {})};
          for (const [k, val] of Object.entries(v)) {
            if (val === DELETE) delete now[k];
            else now[k] = val;
          }
          STORE[id] = now;
        },
        delete: async () => {
          delete STORE[id];
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
    FieldValue: {serverTimestamp: () => 0, delete: () => DELETE},
  }),
  storage: () => {
    throw new Error("偽の admin は置き場を持たない（絵は送らない）");
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

const {handleCharacters} = load("islandCharacter");
if (typeof handleCharacters !== "function") {
  console.error("lib/islandCharacter.js から handleCharacters を取り出せなかった");
  process.exit(1);
}

const deps = {
  ownerUid: async (h) => (h === "Bearer owner" ? "uid-ayato" : null),
  alertboxKey: async () => "",
};

/**
 * 1人を足す／直す。
 * @param {string} id 書類ID
 * @param {object} body 送る中身
 * @return {Promise<object>} 状態と返り
 */
async function put(id, body) {
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
  out.handled = await handleCharacters(
    {
      method: "POST",
      path: `/characters/${id}`,
      auth: "Bearer owner",
      query: {},
      body,
    },
    res,
    deps,
  );
  return out;
}

/* ---------------- 1. ハンドルを渡したら、表示名が入る ---------------- */

console.log("\n# ハンドルで作る（@ebicchi-0000 → 表示名「えびっち」）");
{
  const before = hits.length;
  const r = await put("aaaaaaaaaa0000000001", {
    channelName: "@ebicchi-0000",
    emoji: "🦐",
    aliases: [],
  });
  const c = r.body?.character ?? {};
  check("作成が通る", r.handled && r.status === 200, `status=${r.status}`);
  check("引きに行っている", hits.length > before, `${hits.length - before}回`);
  check(
    "表示名が呼び名に入る",
    (c.aliases ?? []).includes("えびっち"),
    JSON.stringify(c.aliases),
  );
  check(
    "ドネルが引く鍵に入る（lookupKeys）",
    (c.lookupKeys ?? []).includes("えびっち"),
    JSON.stringify(c.lookupKeys),
  );
  check(
    "スパチャの鍵は広がらない（channelKeys はハンドルぶんだけ）",
    JSON.stringify(c.channelKeys ?? []) ===
      JSON.stringify(["@ebicchi-0000", "ebicchi-0000"]),
    JSON.stringify(c.channelKeys),
  );
  check("返事が「入れた」と言う", r.body?.named?.state === "added",
    JSON.stringify(r.body?.named));
  check("入れた字が返事に出る", r.body?.named?.name === "えびっち",
    JSON.stringify(r.body?.named));
  check(
    "入れ物にも入っている（返事だけではない）",
    (STORE["aaaaaaaaaa0000000001"]?.lookupKeys ?? []).includes("えびっち"),
    JSON.stringify(STORE["aaaaaaaaaa0000000001"]?.lookupKeys),
  );
  /* **チャンネルIDも同じ1回で入る（#441）。** 画面から作った人は
     IDを持たないので、毎晩の繋ぎ（IDから引く）の対象にすら入らなかった */
  check(
    "チャンネルIDも入る",
    c.channelId === "UCebicchi000000000000000",
    JSON.stringify(c.channelId),
  );
  check(
    "入れ物にもIDが入っている",
    STORE["aaaaaaaaaa0000000001"]?.channelId === "UCebicchi000000000000000",
    JSON.stringify(STORE["aaaaaaaaaa0000000001"]?.channelId),
  );
  check(
    "取りに行ったのは1回だけ（表示名とIDを同じ頁から読む）",
    hits.length - before === 1,
    `${hits.length - before}回`,
  );
}

/* ---------------- 2. 手で入れた呼び名は消えない ---------------- */

console.log("\n# 手で入れた呼び名を持たせて作る");
{
  const r = await put("aaaaaaaaaa0000000002", {
    channelName: "@ebicchi-0000",
    emoji: "🦐",
    aliases: ["えび", "えびちゃん"],
  });
  const c = r.body?.character ?? {};
  check(
    "手で入れた2つが残る",
    (c.aliases ?? []).includes("えび") && (c.aliases ?? []).includes("えびちゃん"),
    JSON.stringify(c.aliases),
  );
  check(
    "足すだけ（末尾に1つ増えただけ）",
    JSON.stringify(c.aliases ?? []) ===
      JSON.stringify(["えび", "えびちゃん", "えびっち"]),
    JSON.stringify(c.aliases),
  );
  check(
    "手で入れたぶんも鍵になっている",
    ["えび", "えびちゃん", "えびっち"].every((a) =>
      (c.lookupKeys ?? []).includes(a)),
    JSON.stringify(c.lookupKeys),
  );
}

console.log("\n# 引けた表示名が、手で入れた呼び名と同じだったとき");
{
  const r = await put("aaaaaaaaaa0000000003", {
    channelName: "@aoi-0000000",
    emoji: "🔵",
    aliases: ["あお"],
  });
  const c = r.body?.character ?? {};
  check(
    "同じ字を2つ入れない",
    JSON.stringify(c.aliases ?? []) === JSON.stringify(["あお"]),
    JSON.stringify(c.aliases),
  );
  check("返事は「もう入っていた」", r.body?.named?.state === "already",
    JSON.stringify(r.body?.named));
}

console.log("\n# ハンドルと表示名が同じ人（@onajiji-00000 → onajiji-00000）");
{
  const r = await put("aaaaaaaaaa0000000004", {
    channelName: "@onajiji-00000",
    emoji: "🟡",
    aliases: [],
  });
  const c = r.body?.character ?? {};
  check(
    "@ を落とした形と同じなら足さない",
    JSON.stringify(c.aliases ?? []) === JSON.stringify([]),
    JSON.stringify(c.aliases),
  );
}

/* ---------------- 3. 表示名を渡したら、引きに行かない ---------------- */

console.log("\n# ふつうの表示名で作る（もう入っている）");
{
  const before = hits.length;
  const r = await put("aaaaaaaaaa0000000005", {
    channelName: "さくら ひめ",
    emoji: "🌸",
    aliases: ["さくら"],
  });
  const c = r.body?.character ?? {};
  check("引きに行かない", hits.length === before, `${hits.length - before}回`);
  check(
    "余計なものが入らない",
    JSON.stringify(c.aliases ?? []) === JSON.stringify(["さくら"]),
    JSON.stringify(c.aliases),
  );
  check("返事は「引いていない」", r.body?.named?.state === "skipped",
    JSON.stringify(r.body?.named));
  check(
    "鍵は打たれた字ぶんだけ",
    JSON.stringify(c.lookupKeys ?? []) ===
      JSON.stringify(["さくら ひめ", "さくら"]),
    JSON.stringify(c.lookupKeys),
  );
}

/* ---------------- 4. チャンネルID なら feed から ---------------- */

console.log("\n# チャンネルIDで作る（UC… → feed の 668バイト）");
{
  const before = hits.length;
  const r = await put("aaaaaaaaaa0000000006", {
    channelName: "UCshirokuma0000000000000",
    emoji: "🐻‍❄️",
    aliases: [],
  });
  const c = r.body?.character ?? {};
  check(
    "feed を引きに行く（頁ではない）",
    hits.slice(before).some((u) => u.startsWith("/feeds/videos.xml")),
    JSON.stringify(hits.slice(before)),
  );
  check(
    "チャンネルの題が入る（1本目の動画の題ではない）",
    JSON.stringify(c.aliases ?? []) === JSON.stringify(["しろくま ていえん"]),
    JSON.stringify(c.aliases),
  );
  check(
    "打たれたIDが、そのまま channelId に入る",
    c.channelId === "UCshirokuma0000000000000",
    JSON.stringify(c.channelId),
  );
}

/* ---------------- 5. 引けなかったら、作成は通って理由が出る ---------------- */

console.log("\n# 引けない3通り（消えている・締め出された・途中で切れた）");
for (const [id, name, what] of [
  ["aaaaaaaaaa0000000007", "@kesareta-0000", "消えている（404）"],
  ["aaaaaaaaaa0000000008", "@shimedasare-00", "締め出された（題が YouTube）"],
  ["aaaaaaaaaa0000000009", "@kireru-000000", "途中で切れた"],
  ["aaaaaaaaaa0000000010", "UCgone000000000000000000", "feed が 404"],
]) {
  const r = await put(id, {channelName: name, emoji: "❓", aliases: ["手で"]});
  const c = r.body?.character ?? {};
  check(`${what}: 作成は通る`, r.status === 200 && !!r.body?.character,
    `status=${r.status}`);
  check(`${what}: 入れ物に入っている`, !!STORE[id], "書かれていない");
  check(`${what}: 返事に「引けなかった」が入る`,
    r.body?.named?.state === "failed", JSON.stringify(r.body?.named));
  check(`${what}: 理由が1行ある`, !!(r.body?.named?.why ?? "").trim(),
    JSON.stringify(r.body?.named));
  /* **404 と「届かなかった」を、同じ字にしない。**
     404 はその名乗りがもう無い＝人が直す話、届かないのは出口の話で
     こちらが直す話。畳むと、押した人がどちらを直すか決められない
     （2026-09-18 に実際に決められなかった）。 */
  if (what.includes("404")) {
    check(`${what}: **404 とそう言う**`,
      r.body?.named?.why === "見つからない（404）",
      JSON.stringify(r.body?.named?.why));
  } else if (what.includes("切れた")) {
    check(`${what}: 届かなかったとそう言う`,
      r.body?.named?.why === "届かなかった",
      JSON.stringify(r.body?.named?.why));
  }
  check(`${what}: 手で入れた呼び名は残る`,
    JSON.stringify(c.aliases ?? []) === JSON.stringify(["手で"]),
    JSON.stringify(c.aliases));
  check(`${what}: 空の字を呼び名に入れない`,
    !(c.aliases ?? []).some((a) => !a.trim()), JSON.stringify(c.aliases));
}

/* ---------------- 6. 呼び名がいっぱいのとき ---------------- */

console.log("\n# 呼び名が上限（20）まで埋まっているとき");
{
  const many = Array.from({length: 20}, (_, i) => `よびな${i}`);
  const r = await put("aaaaaaaaaa0000000011", {
    channelName: "@ebicchi-0000",
    emoji: "🦐",
    aliases: many,
  });
  const c = r.body?.character ?? {};
  check(
    "手で入れた20個をそのまま残す",
    JSON.stringify(c.aliases ?? []) === JSON.stringify(many),
    `${(c.aliases ?? []).length}個`,
  );
  check("返事が「入らなかった」と言う", r.body?.named?.state === "failed",
    JSON.stringify(r.body?.named));
}

/* ---------------- 6.5 チャンネルID（#441） ---------------- */

console.log("\n# すでにIDが入っている人は、上書きしない");
{
  STORE["aaaaaaaaaa0000000012"] = {
    channelName: "ふるい なまえ",
    channelId: "UCsudeni0000000000000000",
    aliases: [],
  };
  /* **引ける先のIDは、まだ誰も持っていない字にする。** 誰かが持って
     いる字だと「かぶるから入れなかった」のか「上書きしなかった」のかが
     見分けられず、上書きを足しても赤くならない（1度それで通した） */
  const r = await put("aaaaaaaaaa0000000012", {
    channelName: "@uwagaki-0000",
    emoji: "🖊",
    aliases: [],
  });
  const c = r.body?.character ?? {};
  check("入っていたIDのまま",
    c.channelId === "UCsudeni0000000000000000", JSON.stringify(c.channelId));
  check("誰も UCuwagaki… を持っていない（見分けがつく仕込みか）",
    !Object.values(STORE).some(
      (v) => v.channelId === "UCuwagaki000000000000000"),
    "誰かが持っている");
  check("表示名は入る（IDと呼び名は別の話）",
    (c.aliases ?? []).includes("うわがき"), JSON.stringify(c.aliases));
}

console.log("\n# そのIDを他の人が持っていたら、入れない");
{
  STORE["aaaaaaaaaa0000000013"] = {
    channelName: "さきに いたひと",
    channelId: "UCkaburu0000000000000000",
    aliases: [],
  };
  const r = await put("aaaaaaaaaa0000000014", {
    channelName: "@kaburu-00000",
    emoji: "🟣",
    aliases: [],
  });
  const c = r.body?.character ?? {};
  check("IDは空のまま（2人に同じIDを付けない）",
    !c.channelId, JSON.stringify(c.channelId));
  check("先に持っていた人のIDは動かない",
    STORE["aaaaaaaaaa0000000013"].channelId === "UCkaburu0000000000000000",
    JSON.stringify(STORE["aaaaaaaaaa0000000013"].channelId));
  check("作成そのものは通る", r.status === 200 && !!STORE["aaaaaaaaaa0000000014"],
    `status=${r.status}`);
}

console.log("\n# IDが読めない頁でも、作成は通って表示名は入る");
{
  const r = await put("aaaaaaaaaa0000000015", {
    channelName: "@id-no-nai-000",
    emoji: "🕳",
    aliases: [],
  });
  const c = r.body?.character ?? {};
  check("表示名は入る",
    JSON.stringify(c.aliases ?? []) === JSON.stringify(["いどなし"]),
    JSON.stringify(c.aliases));
  check("IDは空のまま", !c.channelId, JSON.stringify(c.channelId));
  check("返事は「入れた」", r.body?.named?.state === "added",
    JSON.stringify(r.body?.named));
}

/* ---------------- 7. 二度引きに行かない ---------------- */

console.log("\n# 同じ人をもう一度保存する（画面は絵を1枚ずつ送ってくる）");
{
  const before = hits.length;
  const r = await put("aaaaaaaaaa0000000001", {
    channelName: "@ebicchi-0000",
    emoji: "🦐",
    aliases: ["えびっち"],
  });
  check("もう引きに行かない", hits.length === before, `${hits.length - before}回`);
  check("呼び名はそのまま",
    JSON.stringify(r.body?.character?.aliases ?? []) ===
      JSON.stringify(["えびっち"]),
    JSON.stringify(r.body?.character?.aliases));
}

console.log("\n# 手で呼び名を消したら、足し直さない（消したのは消したいから）");
{
  const r = await put("aaaaaaaaaa0000000001", {
    channelName: "@ebicchi-0000",
    emoji: "🦐",
    aliases: [],
  });
  check("足し直さない",
    JSON.stringify(r.body?.character?.aliases ?? []) === JSON.stringify([]),
    JSON.stringify(r.body?.character?.aliases));
}

console.log("\n# ハンドルを変えたら、引き直す");
{
  const before = hits.length;
  const r = await put("aaaaaaaaaa0000000001", {
    channelName: "@aoi-0000000",
    emoji: "🔵",
    aliases: [],
  });
  check("引きに行く", hits.length > before, `${hits.length - before}回`);
  check("新しい表示名が入る",
    JSON.stringify(r.body?.character?.aliases ?? []) === JSON.stringify(["あお"]),
    JSON.stringify(r.body?.character?.aliases));
}

console.log("\n# 引けなかった人は、次の保存で引き直す");
{
  const before = hits.length;
  const r = await put("aaaaaaaaaa0000000007", {
    channelName: "@kesareta-0000",
    emoji: "❓",
    aliases: ["手で"],
  });
  check("もう一度引きに行く", hits.length > before, `${hits.length - before}回`);
  check("返事はやはり「引けなかった」", r.body?.named?.state === "failed",
    JSON.stringify(r.body?.named));
}

/* ---------------- 8. もう無い名乗りの印（#158） ----------------

   本番で3人が 404 だった。押した回のログに1行出るだけで、**Firestore にも
   画面にも何も残らなかった。** `channelId` が空なので毎晩の繋ぎ
   （IDから引く）の対象にも入らず、**誰も拾わない・赤くもならない。**

   ここで見るのは4つ。**1つずつ、別の足で測る。**

   | 何が起きたか | 印 |
   | --- | --- |
   | 404 を返す引き先 | **付く** |
   | そのあと取れるようになった | **消える** |
   | 引けない（切断・時間切れ） | **付けない・消しもしない** |
   | 名乗りを別のハンドルに書き換えた | **古い印が残らない** */

/**
 * 図鑑をもう一度開く（`GET /characters`、あやとの札つき）。
 *
 * **保存した直後の返事だけ見ても足りない。** 次に開いたときに出ているか
 * ——書類に残っているか——が肝なので、読む側の口を通して測る。
 * @param {string} id 見たい人
 * @return {Promise<object|undefined>} その1人（居なければ undefined）
 */
async function list(id) {
  const out = {body: undefined};
  const res = {
    set: () => {},
    status: () => res,
    json: (b) => {
      out.body = b;
    },
    send: () => {},
  };
  await handleCharacters(
    {method: "GET", path: "/characters", auth: "Bearer owner",
      query: {}, body: {}},
    res,
    deps,
  );
  return (out.body?.characters ?? []).find((c) => c.id === id);
}

console.log("\n# 404 を返す引き先 → 印が付く");
{
  const id = "aaaaaaaaaa0000000020";
  const r = await put(id, {
    channelName: "@fukkatsu-0000", emoji: "🍰", aliases: ["手で"],
  });
  check("作成は通る", r.status === 200 && !!r.body?.character,
    `status=${r.status}`);
  check("返事が「引けなかった（404）」",
    r.body?.named?.why === "見つからない（404）",
    JSON.stringify(r.body?.named));
  check("書類に印が残る（打たれた名乗りごと）",
    STORE[id]?.channelGoneFor === "@fukkatsu-0000",
    JSON.stringify(STORE[id]?.channelGoneFor));
  check("保存の返事にも出る", r.body?.character?.channelGone === true,
    JSON.stringify(r.body?.character?.channelGone));
  check("**次に図鑑を開いても出ている**", (await list(id))?.channelGone === true,
    JSON.stringify((await list(id))?.channelGone));
  check("印の付いていない人には出ない",
    (await list("aaaaaaaaaa0000000001"))?.channelGone === false,
    JSON.stringify((await list("aaaaaaaaaa0000000001"))?.channelGone));
  check("手で入れた呼び名は残る",
    JSON.stringify(r.body?.character?.aliases ?? []) === JSON.stringify(["手で"]),
    JSON.stringify(r.body?.character?.aliases));
}

console.log("\n# 印が付いた人が、次は届かなかった → 印は消えない（出口の話）");
{
  const id = "aaaaaaaaaa0000000020";
  BLIND.add("@fukkatsu-0000");
  const r = await put(id, {
    channelName: "@fukkatsu-0000", emoji: "🍰", aliases: ["手で"],
  });
  BLIND.delete("@fukkatsu-0000");
  check("返事は「届かなかった」（404 とは別の字）",
    r.body?.named?.why === "届かなかった", JSON.stringify(r.body?.named));
  check("印はそのまま", STORE[id]?.channelGoneFor === "@fukkatsu-0000",
    JSON.stringify(STORE[id]?.channelGoneFor));
  check("図鑑にもそのまま出る", (await list(id))?.channelGone === true,
    JSON.stringify((await list(id))?.channelGone));
}

console.log("\n# そのあと取れる引き先に変わった → 印が消える");
{
  const id = "aaaaaaaaaa0000000020";
  REVIVED.add("@fukkatsu-0000");
  const r = await put(id, {
    channelName: "@fukkatsu-0000", emoji: "🍰", aliases: ["手で"],
  });
  check("引けた", r.body?.named?.state === "added",
    JSON.stringify(r.body?.named));
  check("**書類から印が落ちる**（欄ごと消える）",
    !("channelGoneFor" in (STORE[id] ?? {})),
    JSON.stringify(STORE[id]?.channelGoneFor));
  check("保存の返事にも出ない", r.body?.character?.channelGone === false,
    JSON.stringify(r.body?.character?.channelGone));
  check("次に図鑑を開いても出ない", (await list(id))?.channelGone === false,
    JSON.stringify((await list(id))?.channelGone));
}

console.log("\n# 引けない（切断）だけでは、印を付けない");
{
  const id = "aaaaaaaaaa0000000021";
  const r = await put(id, {
    channelName: "@kireru-000000", emoji: "✂️", aliases: [],
  });
  check("返事は「届かなかった」", r.body?.named?.why === "届かなかった",
    JSON.stringify(r.body?.named));
  /* **ここを混ぜると、Functions が塞がれた日に全員の名乗りが死ぬ**
     （#157 の決めごと1。「測れなかった」を相手の答えにしない） */
  check("印を付けない", !("channelGoneFor" in (STORE[id] ?? {})),
    JSON.stringify(STORE[id]?.channelGoneFor));
  check("図鑑にも出ない", (await list(id))?.channelGone === false,
    JSON.stringify((await list(id))?.channelGone));
}

console.log("\n# 名乗りを別のハンドルに書き換えた → 古い印が残らない");
{
  const id = "aaaaaaaaaa0000000022";
  const first = await put(id, {
    channelName: "@nakunatta-000", emoji: "🐶", aliases: [],
  });
  check("まず印が付く（仕込みが効いているか）",
    first.body?.character?.channelGone === true &&
      STORE[id]?.channelGoneFor === "@nakunatta-000",
    JSON.stringify(STORE[id]?.channelGoneFor));
  /* **書き換えた先が引けないときが、いちばん危ない。** 引けた回だけ
     消していると、こちら側で落ちた回に古い名乗りの印が残り続ける */
  const r = await put(id, {
    channelName: "@kireru-000000", emoji: "🐶", aliases: [],
  });
  check("書き換えた先が引けなくても、古い印は落ちる",
    !("channelGoneFor" in (STORE[id] ?? {})),
    JSON.stringify(STORE[id]?.channelGoneFor));
  check("保存の返事に古い印が出ない",
    r.body?.character?.channelGone === false,
    JSON.stringify(r.body?.character?.channelGone));
  check("図鑑にも出ない", (await list(id))?.channelGone === false,
    JSON.stringify((await list(id))?.channelGone));
}

console.log("\n# 書類に古い印が居座っていても、画面には出さない");
{
  /* **書類の掃除が1回遅れたとき**の保険。口が印を落とし損ねても、
     いまの名乗りと食い違う印は画面に出さない */
  const id = "aaaaaaaaaa0000000023";
  STORE[id] = {
    channelName: "@いまの-なまえ",
    channelGoneFor: "@むかしの-なまえ",
    aliases: [],
  };
  check("食い違う印は出ない", (await list(id))?.channelGone === false,
    JSON.stringify((await list(id))?.channelGone));
  STORE[id].channelGoneFor = "@いまの-なまえ";
  check("そろっている印は出る", (await list(id))?.channelGone === true,
    JSON.stringify((await list(id))?.channelGone));
}

console.log("\n# 印は、どの名乗りだったかを画面へ返さない（素性）");
{
  const one = await list("aaaaaaaaaa0000000023");
  check("返るのは真偽だけ", typeof one?.channelGone === "boolean",
    typeof one?.channelGone);
  check("名乗りそのものは返らない", !("channelGoneFor" in (one ?? {})),
    JSON.stringify(Object.keys(one ?? {})));
}

/* ---------------- 9. 素性を出していないか ---------------- */

console.log("\n# ログ");
check(
  "ログに引き先の字が出ていない",
  !logs.some((l) => l.includes("@") || l.includes("UC")),
  logs.join(" / "),
);

/* ---------------- 対照。足を1本ずつ壊す ---------------- */

/**
 * 壊しかた。`lib/islandCharacter.js` の中の字を置き換える。
 *
 * **当たらなくなったら、そこで赤くする。** 本体を直して形が変わったとき、
 * 「壊したつもりで壊れていない写し」が緑で通ると、対照の意味が無くなる。
 */
const BREAKS = [
  ["引きに行かない",
    "if (!handle && !cid)",
    "if (true)"],
  ["引いた名前を足さない",
    "return { aliases: [...aliases, got.name], named: got };",
    "return { aliases, named: got };"],
  ["手で入れた呼び名を消す",
    "return { aliases: [...aliases, got.name], named: got };",
    "return { aliases: [got.name], named: got };"],
  ["スパチャの鍵まで広げる",
    "channelKeys: keysOf(channelName ? [channelName] : []),",
    "channelKeys: keysOf([channelName, ...aliases].filter((s) => s)),"],
  ["引けなかったら作成ごと落とす",
    "return Object.assign(Object.assign({}, no(\"failed\", why)), " +
    "{ channelId: cid ? v : \"\", gone });",
    "throw e;"],
  ["黙って通す（理由を返さない）",
    "patch)), named });",
    "patch)) });"],
  ["チャンネルIDを入れない",
    "patch.channelId = got.channelId;",
    "void got.channelId;"],
  ["入っているチャンネルIDを上書きする",
    "const hadId = typeof had.channelId === \"string\" && had.channelId;",
    "const hadId = false;"],
  ["他の人が持っているIDでも入れる",
    "return q.docs.some((d) => d.id !== self);",
    "return false;"],
  /* ---- もう無い名乗りの印（#158）。**4つの足を1本ずつ抜く** ---- */
  ["404 でも印を付けない",
    "patch.channelGoneFor = channelName;",
    "void channelName;"],
  ["引けても印を消さない",
    "patch.channelGoneFor = admin.firestore.FieldValue.delete();",
    "void 0;"],
  ["届かなかったのも「名乗りが無い」にする",
    "const gone = e instanceof HttpStatus && e.status === 404;",
    "const gone = true;"],
  ["出口の事故でも印を落とす",
    "!(goneFor === channelName && got.named.state === \"failed\")",
    "true"],
  ["印を画面に返さない",
    "!!v.channelGoneFor && v.channelGoneFor === v.channelName",
    "false"],
  ["いまの名乗りと食い違う印まで画面に出す",
    "v.channelGoneFor === v.channelName",
    "true"],
];

if (CONTROL) {
  console.log("\n# 対照（壊した写しで回して、赤くなるか）");
  const src = readFileSync(join(LIB, "islandCharacter.js"), "utf8");
  for (const [what, from, to] of BREAKS) {
    if (!src.includes(from)) {
      check(`${what}: 壊す字が当たる`, false, `本体に「${from}」が無い`);
      continue;
    }
    const box = mkdtempSync(join(tmpdir(), "charlib-"));
    cpSync(LIB, box, {recursive: true});
    writeFileSync(
      join(box, "islandCharacter.js"), src.replace(from, to), "utf8");
    const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      env: {...process.env, CHAR_LIB_DIR: box},
      encoding: "utf8",
    });
    rmSync(box, {recursive: true, force: true});
    check(`${what}: 壊すと赤くなる`, run.status !== 0,
      `終了コード ${run.status}`);
  }

  // **対照の対照。** 写して回すこと自体では赤くならない
  const box = mkdtempSync(join(tmpdir(), "charlib-"));
  cpSync(LIB, box, {recursive: true});
  const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    env: {...process.env, CHAR_LIB_DIR: box},
    encoding: "utf8",
  });
  rmSync(box, {recursive: true, force: true});
  check("壊していない写しは緑のまま", run.status === 0,
    `終了コード ${run.status}`);
}

YT.close();
console.log(`\n通った ${ok}件 / 落ちた ${bad}件`);
process.exit(bad ? 1 : 0);
