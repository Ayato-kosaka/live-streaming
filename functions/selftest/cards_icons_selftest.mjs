/**
 * `iconsOf()` の確かめ。**偽の名簿と偽の字だけで回す。**
 *
 * ## 何を見ているか
 *
 * カードに乗る絵は、**投げてくれたときに名乗っていた名前**
 * (`islandTips.displayNameSnapshot` を書類に焼いた `nameSnapshot`)から引く。
 * 配信中のアラートボックスと同じ引き方（名簿の `lookupKeys`）。
 *
 * 前は「どねID → `islandDonors` → チャンネルID → いま名乗っている名前」で
 * 引いていたので、**Doneru に別名で投げた人の絵が公開の `/cards` に出ていた。**
 * 名前も `channelId` も null にしてあったが、絵は図鑑(`/friends`)に同じものが
 * 並んでいるので、照らせば誰か分かる。あやとの決め(2026-09-15):
 *
 * > 内部ロジックとして、かこさんが投げてくれた紐付けはしてもいいけど、
 * > みんなが見える場所では匿名性を守りたい
 *
 * ここで見るのは6つ。
 *
 * 1. 名乗りが `lookupKeys` に当たれば、絵が出る（**先に、当たることを見る**）
 * 2. **当たらない名乗り（＝匿名の別名）では、絵が出ない**（これが本命）
 * 3. **呼び名(aliases)でも当たる**——`lookupKeys` を引いている証拠。
 *    `channelKeys` しか持たない人には当たらないことも、対にして見る
 * 4. 同じ鍵が2人に付いていたら、**どちらの絵も出さない**（どちらか選べない）
 * 5. **`islandChannels` を1回も読まない**（読みに行ったら偽の Firestore が落ちる）
 * 6. 名簿が読めなかったら `null`（0人と同じ顔で返さない）
 *
 * ## なぜ本番のデータを引かないか
 *
 * このリポジトリは公開で、Actions のログも誰でも読める。**視聴者さんの
 * 名乗りもチャンネルIDも出さない。** 出てくるのは仕込んだ `さくら`
 * `ななしのごんべえ` だけ。
 *
 * ## なぜ写しを置かないか
 *
 * `tsc` が書き出した `lib/cards.js` を、**偽の firebase-admin を渡して**
 * そのまま動かす。写しを持つと、本体を直したのに確かめが古いまま通る。
 * `lib/islandCharacter.js`（`normKey` / `keysOf`）と `lib/streamEvents.js` は
 * **本物をそのまま**通す。
 *
 * ## 壊した写しで落ちることまで見る（`docs/island-misses.md` #99 #100）
 *
 * `CARDS_LIB_DIR` に壊した `lib` を渡すと、そちらで回る（`tsc` は通らない）。
 *
 * ```bash
 * node functions/selftest/cards_icons_selftest.mjs
 * cp -r functions/lib /tmp/brokenlib && vi /tmp/brokenlib/cards.js
 * CARDS_LIB_DIR=/tmp/brokenlib node functions/selftest/cards_icons_selftest.mjs
 * ```
 */

import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FUNCTIONS = join(HERE, "..");
/** `lib` の置き場。**落ちることを確かめる写しだけ、ここを差し替えて回す。** */
const LIB = process.env.CARDS_LIB_DIR || join(FUNCTIONS, "lib");
/** 写しで回すときは `tsc` を通さない（差し替えた `lib` を焼き直してしまう） */
const BUILD = !process.env.CARDS_LIB_DIR;

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

/* ---------------- 本体を読み込む土台 ---------------- */

if (BUILD) {
  console.log("# tsc を回して、いまの src から読み込む");
  execFileSync(join(FUNCTIONS, "node_modules/.bin/tsc"), {cwd: FUNCTIONS});
} else {
  console.log(`# 差し替えた lib で回す: ${LIB}`);
}

const cardsSrc = readFileSync(join(LIB, "cards.js"), "utf8");
const nodeRequire = createRequire(import.meta.url);
console.log(`  読み込んだ長さ: ${cardsSrc.length} 字\n`);

/**
 * 1つの筋書き。**入れ物も控えも、筋書きごとに作り直す**
 * （`lib/cards.js` は温かいインスタンスに控えを持つので、使い回すと
 * 前の筋書きの控えを見てしまう）。
 * @param {object} store コレクション名 → 書類ID → 中身（**ぜんぶ偽の字**）
 * @param {object} [opts] `fail` に入れたコレクションは読むと落ちる
 * @return {object} `iconsOf` と、叩いた回数と、出たログ
 */
function scenario(store, opts = {}) {
  /** 何回・どこを読んだか。余計に往復していないかを見る */
  const hits = {};
  const bump = (k) => {
    hits[k] = (hits[k] ?? 0) + 1;
  };
  const snapOf = (id, v) => ({
    id,
    exists: !!v,
    data: () => v,
    get: (k) => (v ? v[k] : undefined),
  });

  const query = (name, q) => ({
    select: (...f) => query(name, {...q, select: f}),
    where: (f, op, v) =>
      query(name, {...q, where: [...(q.where ?? []), [f, op, v]]}),
    orderBy: (f, dir) => query(name, {...q, order: [f, dir ?? "asc"]}),
    limit: (n) => query(name, {...q, limit: n}),
    get: async () => {
      bump(`${name}:scan`);
      if ((opts.fail ?? []).includes(name)) {
        throw new Error(`偽の Firestore: ${name} は読めない`);
      }
      let rows = Object.entries(store[name] ?? {})
        .map(([id, v]) => snapOf(id, v));
      for (const [f, op, v] of q.where ?? []) {
        if (op !== "==") throw new Error("偽の Firestore は == しか持たない");
        rows = rows.filter((d) => d.data()[f] === v);
      }
      if (q.limit !== undefined) rows = rows.slice(0, q.limit);
      return {
        size: rows.length,
        empty: rows.length === 0,
        docs: rows,
        forEach: (f) => rows.forEach(f),
      };
    },
  });

  const db = {
    collection: (name) => {
      /* **`islandChannels` は、触った瞬間に落とす。** 「読まない」を
         件数で数えると、`db.collection(…)` を持っているだけで読まない形
         （控えが温まっている回など）と見分けがつかない。**掴んだら落ちる**
         にしておけば、読み直した日に必ず赤くなる。 */
      if ((opts.banned ?? []).includes(name)) {
        bump(`${name}:touch`);
        throw new Error(`偽の Firestore: ${name} には触れない`);
      }
      return {
        ...query(name, {}),
        doc: (id) => ({
          id,
          _c: name,
          get: async () => {
            bump(`${name}:get`);
            return snapOf(id, store[name]?.[id]);
          },
        }),
      };
    },
    getAll: async (...refs) => {
      bump(`${refs[0]?._c}:getAll`);
      return refs.map((r) => snapOf(r.id, store[r._c]?.[r.id]));
    },
  };

  const admin = {
    apps: [],
    initializeApp: () => {
      admin.apps.push({});
    },
    firestore: Object.assign(() => db, {
      Timestamp: {now: () => ({toMillis: () => 0})},
      FieldValue: {serverTimestamp: () => 0},
    }),
    storage: () => {
      throw new Error("偽の admin は置き場を持たない");
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

  const loaded = new Map();
  const load = (name) => {
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
    new Function(
      "require", "exports", "module", "__filename", "__dirname", src,
    )(req, mod.exports, mod, file, dirname(file));
    loaded.set(name, mod.exports);
    return mod.exports;
  };

  const {iconsOf} = load("cards");
  if (typeof iconsOf !== "function") {
    console.error("lib/cards.js から iconsOf を取り出せなかった");
    process.exit(1);
  }
  return {iconsOf, hits, logs};
}

/* ---------------- 仕込む名簿 ----------------

   `lookupKeys` は保存のときに `keysOf` が作る形（`normKey` 済み・`@` なしも
   一緒に入る）で置く（`islandCharacter.ts` の `saveCharacter`）。本物の保存と
   同じものを置かないと、当たる当たらないが本番と食い違う。 */

const CHARACTERS = {
  /** チャンネル名「さくら」と、呼び名「さくらんぼ」を持つ人 */
  char_sakura: {
    channelKeys: ["さくら"],
    lookupKeys: ["さくら", "さくらんぼ"],
    aliases: ["さくらんぼ"],
  },
  /** `@` 付きで登録した人。`keysOf` が `@` なしも入れてある */
  char_abc: {channelKeys: ["@abc", "abc"], lookupKeys: ["@abc", "abc"]},
  // 同じ鍵が2人に付いている（どちらか選べない。どちらにも当てない）
  char_futatsu: {lookupKeys: ["ふたつ"]},
  char_futatsu2: {lookupKeys: ["ふたつ"]},
  /* **`channelKeys` しか持たない人。** 引いているのが `lookupKeys` だと
     いう証拠になる。ここに当たったら、引く欄を取り違えている */
  char_ch_only: {channelKeys: ["ちゃんねるだけ"]},
};

console.log("# 0. 名乗りで絵が当たるか（先に見る・#19）");
{
  const s = scenario({islandCharacter: CHARACTERS}, {banned: ["islandChannels"]});
  const raw = await s.iconsOf([
    "さくら", "ＡＢＣ", "さくらんぼ", "ななしのごんべえ", "ちゃんねるだけ",
  ]);
  /* **`null` は「読めなかった」。** ここは読める筋書きなので、`null` が
     返ったら引き方のどこかが落ちている。先に言ってから中身を見る
     （黙って落ちると、下の「当たらない」が全部その道連れになる）。 */
  check("読めている（`null` で返っていない）", raw !== null, String(raw));
  const got = raw ?? new Map();
  check(
    "名乗りが `lookupKeys` に当たれば、絵が出る",
    got.get("さくら") === "char_sakura",
    String(got.get("さくら")),
  );
  check(
    "全角・大文字ちがいも `normKey` で当たる（引き方が生きている）",
    got.get("ＡＢＣ") === "char_abc",
    String(got.get("ＡＢＣ")),
  );
  check(
    "**呼び名(aliases)でも当たる**（`lookupKeys` を引いている証拠）",
    got.get("さくらんぼ") === "char_sakura",
    String(got.get("さくらんぼ")),
  );
  check(
    "**当たらない名乗り（＝匿名の別名）には、絵を出さない**",
    !got.has("ななしのごんべえ"),
    String(got.get("ななしのごんべえ")),
  );
  check(
    "`channelKeys` しか持たない人には当たらない（引く欄を取り違えていない）",
    !got.has("ちゃんねるだけ"),
    String(got.get("ちゃんねるだけ")),
  );
  check("当たったのは3つ", got.size === 3, `${got.size} つ`);
}

console.log("\n# 1. 匿名（別名）で投げた人は、絵に結び付かない");
{
  /* **本命。** かこさんが「かこ」の名で投げれば当たり、別名で投げれば
     当たらない。**同じ名簿・同じ呼び方で、名乗りだけを変えて見る**ので、
     「当たらない」が守りのせいだと言える（`island-standards.md` 13）。 */
  const s = scenario({islandCharacter: CHARACTERS}, {banned: ["islandChannels"]});
  const named = (await s.iconsOf(["さくら"])) ?? new Map();
  const anon = (await s.iconsOf(["匿名のだれか"])) ?? new Map();
  check(
    "自分の名で投げたら、絵が出る（対照）",
    named.get("さくら") === "char_sakura",
    String(named.get("さくら")),
  );
  check("別名で投げたら、絵が出ない", anon.size === 0, `${anon.size} つ`);
  check(
    "空の名乗り（写しを持たない書類）でも落ちず、0つで返る",
    ((await s.iconsOf(["", ""])) ?? new Map()).size === 0,
  );
}

console.log("\n# 2. 同じ鍵が2人に付いていたら、どちらの絵も出さない");
{
  const s = scenario({islandCharacter: CHARACTERS}, {banned: ["islandChannels"]});
  const got = (await s.iconsOf(["ふたつ", "さくら"])) ?? new Map();
  check("どちらの絵も出ない", !got.has("ふたつ"), String(got.get("ふたつ")));
  check(
    "巻き込まれていない人の絵は消えない（全部落としていない）",
    got.get("さくら") === "char_sakura",
    String(got.get("さくら")),
  );
  // 対照。かぶっている片方を抜けば、同じ呼び方で当たる
  const alone = {...CHARACTERS};
  delete alone.char_futatsu2;
  const one = scenario({islandCharacter: alone}, {banned: ["islandChannels"]});
  check(
    "かぶりを抜くと、同じ呼び方で当たる（守りが落としている証拠）",
    ((await one.iconsOf(["ふたつ"])) ?? new Map()).get("ふたつ") ===
      "char_futatsu",
  );
}

console.log("\n# 3. `islandChannels` を1回も読まない");
{
  /* チャンネルの辞書（本番で 2,272件）を、まったく通らなくなった。
     **掴んだだけで落ちる偽の Firestore**で回して、それでも絵が出ることを見る。
     ここが赤くなったら、名前を引き直す道が戻っている。 */
  const s = scenario({
    islandCharacter: CHARACTERS,
    // 読みに行けば当たってしまう中身を、わざと置いておく
    islandChannels: {UC_a_000000001: {name: "さくら"}},
  }, {banned: ["islandChannels"]});
  let threw = "";
  let got = null;
  try {
    got = await s.iconsOf(["さくら", "ななしのごんべえ"]);
  } catch (e) {
    threw = String(e);
  }
  check("投げない（辞書に触っていない）", threw === "", threw);
  check("読めている（`null` で返っていない）", got !== null, String(got));
  check(
    "それでも絵は出る（空振りでない）",
    got?.get("さくら") === "char_sakura",
    String(got?.get("さくら")),
  );
  check(
    "`islandChannels` を1度も掴んでいない",
    (s.hits["islandChannels:touch"] ?? 0) === 0,
    `${s.hits["islandChannels:touch"] ?? 0} 回`,
  );
  check(
    "読んだのは名簿だけ",
    Object.keys(s.hits).join(",") === "islandCharacter:scan",
    Object.keys(s.hits).join(","),
  );
}

console.log("\n# 4. 名簿が読めなかったら、投げずに・当てない");
{
  const s = scenario(
    {islandCharacter: CHARACTERS},
    {fail: ["islandCharacter"], banned: ["islandChannels"]},
  );
  let threw = "";
  let got = null;
  try {
    got = await s.iconsOf(["さくら"]);
  } catch (e) {
    threw = String(e);
  }
  check("投げない", threw === "", threw);
  /* **「1人も当たらなかった」と「読めなかった」を同じ顔で返さない。**
     空の表を返すと、呼んだ側から見分けがつかず、公開の面が
     「その日は誰も投げ銭していない」と言い切る
     （`docs/island-standards.md` 10）。読めなかったら `null`。 */
  check("`null`（0つと見分けがつく）", got === null, String(got));
  check(
    "ログに素性が出ていない",
    !s.logs.join("\n").includes("さくら"),
    s.logs.join(" / ").slice(0, 120),
  );
}

console.log("\n# 5. 控えが効いている（呼び出しごとに名簿を読み直さない）");
{
  const s = scenario({islandCharacter: CHARACTERS}, {banned: ["islandChannels"]});
  await s.iconsOf(["さくら"]);
  const after1 = s.hits["islandCharacter:scan"];

  await s.iconsOf(["さくらんぼ"]);
  await s.iconsOf(["さくら", "ＡＢＣ"]);
  check(
    "1回目で名簿を読んでいる（0回のまま素通りしていない）",
    after1 === 1,
    `${after1} 回`,
  );
  check(
    "名簿の読み直しは、3回呼んでも1回だけ",
    s.hits["islandCharacter:scan"] === 1,
    `${s.hits["islandCharacter:scan"]} 回`,
  );
  check(
    "書類を1件ずつ引きに行っていない",
    (s.hits["islandCharacter:get"] ?? 0) === 0,
    `${s.hits["islandCharacter:get"] ?? 0} 件`,
  );
}

console.log("");
if (bad > 0) {
  console.log(`NG が ${bad} 件（通ったのは ${ok} 件）。`);
  process.exit(1);
}
console.log(`${ok} 件ぜんぶ通った。`);
