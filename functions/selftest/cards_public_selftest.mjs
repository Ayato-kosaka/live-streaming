/**
 * **誰でも読める応答に、人を指す値が残っていないか。**
 *
 * ## 何を見ているか
 *
 * カードは投げ銭の台帳(`islandTips`)からしか作られない。だから
 * `GET /cards` が1枚ごとに `channelId` と `day` を返すのは、
 * **「どのチャンネルが、どの日に投げ銭したか」の一覧を、鍵なしで配っている**
 * のと同じことだった(`docs/island-incident-2026-09-14-cards.md` 8-2)。
 * 書類IDも `<画像のID>__<チャンネルID>` なので、**欄を消しても ID から読める。**
 *
 * ここで見るのは4つ。
 *
 * 1. 公開の `/cards` の応答に、**`UC` で始まる字が1つも無い**（欄でも id の中でも）
 * 2. `/cards/mine` には **`channelId` も本当のカードIDも残っている**（自分のもの）
 * 3. 公開の `id` が、**その応答の中で重複しない**（React の key に使う）
 * 4. `/nordic/photos` の `people[]`（`peopleForEveryone`）に `channelId` が無い
 *
 * ## いちばん大事なのは、**写真に入れられる人が変わらないこと**
 *
 * 9月14日の障害は、まさにここを広げたことだった。だから「消えたか」より先に
 * **「誰が候補に出るか」が1人も変わっていないこと**を見る。画面と同じ手
 * （`site/components/cards/CardSheet.tsx` の `picks` = `group.cards` を
 * `icon` で重複落とし）で、落とす前と後の集合を突き合わせる。
 *
 * ## なぜ本番のデータを引かないか
 *
 * このリポジトリは公開で、Actions のログも誰でも読める。**視聴者さんの
 * チャンネルIDは、それ自体が「投げ銭した人の名簿」**なので、出力に出さない。
 * 出てくるのは仕込んだ `UC_me_0000001` `さくら` だけ。
 *
 * ## 写しを持たない
 *
 * `tsc` が書き出した `lib/cards.js` を、**偽の firebase-admin を渡して**
 * そのまま動かす(`cards_mine_selftest.mjs` と同じ土台)。写しを置くと、
 * 本体を直したのに確かめが古いまま通る。
 *
 * ## 落ちない診断を置かない
 *
 * 「`UC` が出てこない」は、**カードが1枚も返っていなくても通る。**
 * だから先に、仕込んだ入れ物に `UC…` が入っていること・公開の口が枚数ぶん
 * 返していること・**絵が当たっていること**を確かめてから、消えたほうを見る。
 *
 * 回しかた:
 *
 * ```bash
 * node functions/selftest/cards_public_selftest.mjs
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

/* ---------------- 仕込む入れ物 ----------------

   **ぜんぶ偽の字。** 本番のチャンネルIDも表示名も1文字も置かない。

   絵が当たるところまで作る。当たっていない入れ物で回すと、「絵が変わって
   いない」が**どちらも空**のまま通ってしまう。 */

const STORE = {
  islandCards: {
    // 同じ写真に4枚。**同じ絵が2枚ある**（通し番号の要るところ）
    "img_0000001__UC_me_0000001": {
      channelId: "UC_me_0000001",
      day: "2026-09-11",
      streamEventImageId: "img_0000001",
      earnedAt: 400,
      // **絵はこの名乗りだけから決まる**（`cards.ts` の `iconsOf`）
      nameSnapshot: "さくら",
    },
    "img_0000001__UC_dupe_000001": {
      channelId: "UC_dupe_000001",
      day: "2026-09-11",
      streamEventImageId: "img_0000001",
      earnedAt: 390,
      nameSnapshot: "さくら2",
    },
    "img_0000001__UC_other_00001": {
      channelId: "UC_other_00001",
      day: "2026-09-11",
      streamEventImageId: "img_0000001",
      earnedAt: 380,
      nameSnapshot: "abc",
    },
    // 絵の当たらない人。**公開の id が `x` に落ちるところ**
    "img_0000001__UC_other_00002": {
      channelId: "UC_other_00002",
      day: "2026-09-11",
      streamEventImageId: "img_0000001",
      earnedAt: 370,
      nameSnapshot: "しらないひと",
    },
    "img_0000002__UC_me_0000001": {
      channelId: "UC_me_0000001",
      day: "2026-09-12",
      streamEventImageId: "img_0000002",
      earnedAt: 200,
      nameSnapshot: "さくら",
    },
  },
  islandStreamEventImage: {
    img_0000001: {
      url: "https://example.invalid/1.jpg",
      w: 4, h: 3, note: "さくら", at: 300, streamEventId: "ev1", role: "card",
    },
    img_0000002: {
      url: "https://example.invalid/2.jpg",
      w: 4, h: 3, note: "さくら", at: 200, streamEventId: "ev1", role: "card",
    },
  },
  islandUsers: {
    "uid-me": {channelId: "UC_me_0000001"},
  },
  /* 同じキャラクターに鍵が2つ。**別々のチャンネルが同じ絵に当たる**形を作る
     （Doneru から手で入った人と YouTube の人が同じ絵、の再現）。
     名前をかぶらせて作ると `sharedNames` に落とされて、絵が消えてしまう。 */
  islandCharacter: {
    char_sakura: {lookupKeys: ["さくら", "さくら2"]},
    char_abc: {lookupKeys: ["abc"]},
  },
  /* **もう読まない入れ物。** 残してあるのは、読みに戻ったときにこの診断が
     素通りしないため——中身は絵の当たる名前なので、読み直す実装なら
     「しらないひと」にも絵が付いてしまい、下の枚数が合わなくなる。 */
  islandChannels: {
    UC_other_00002: {name: "さくら"},
  },
};

/* ---------------- 偽の Firestore ---------------- */

const snapOf = (id, v) => ({
  id,
  exists: !!v,
  data: () => v,
  get: (k) => (v ? v[k] : undefined),
});

/**
 * 問い合わせ。`where` / `orderBy` / `select` / `limit` だけ。
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
    orderBy: (f, dir) => query(name, {...q, order: [f, dir ?? "asc"]}),
    /* `select` の口は残しておく。**無いと、引く側が `select` を足した日に
       例外になり、`iconsOf` がそれを握りつぶして「絵なし」を返す**
       ——絵を見ている診断なので、それでは空振りになる（#99 で実際に踏んだ）。 */
    select: (...f) => query(name, {...q, select: f}),
    limit: (n) => query(name, {...q, limit: n}),
    get: async () => {
      if (breakScan.has(name)) throw new Error(`偽の Firestore：${name} は読めない`);
      let rows = Object.entries(STORE[name] ?? {})
        .map(([id, v]) => snapOf(id, v));
      for (const [f, v] of q.where ?? []) {
        rows = rows.filter((d) => d.data()[f] === v);
      }
      if (q.order) {
        const [f, dir] = q.order;
        rows = rows.filter((d) => d.data()[f] !== undefined);
        const sign = dir === "desc" ? -1 : 1;
        rows.sort((a, b) => {
          const x = a.data()[f];
          const y = b.data()[f];
          return x === y ? 0 : (x < y ? -1 : 1) * sign;
        });
      }
      if (q.limit !== undefined) rows = rows.slice(0, q.limit);
      return {
        size: rows.length,
        empty: rows.length === 0,
        docs: rows,
        forEach: (f) => rows.forEach(f),
      };
    },
  };
}

/* **わざと読めなくする切り替え。** 絵が引けなかった回に、公開の口が
   「0人」ではなく「読めなかった」を返すことを見るために要る。

   引く先は名簿（`islandCharacter`）だけになり、しかも5分の控えに載るので、
   先に成功したあとでは落とせない。**落とすときは `lib` ごと読み込み直す**
   （`reloadCards()`）。控えは温かいインスタンスに持つものなので、
   読み込み直せば冷えた1回目に戻る。 */
const breakScan = new Set();
/** 画像の引き当て（`getAll`）を落とす切り替え。こちらは控えに載らない */
let breakGetAll = false;

const DB = {
  collection: (name) => ({
    ...query(name, {}),
    doc: (id) => ({
      id,
      _c: name,
      get: async () => snapOf(id, STORE[name]?.[id]),
    }),
  }),
  getAll: async (...refs) => {
    if (breakGetAll) throw new Error("偽の Firestore：読めない");
    return refs.map((r) => snapOf(r.id, STORE[r._c]?.[r.id]));
  },
  batch: () => {
    throw new Error("偽の Firestore は書かない");
  },
};

/* ---------------- lib/*.js を、偽の admin で読み込む ---------------- */

if (BUILD) {
  console.log("# tsc を回して、いまの src から読み込む");
  execFileSync(join(FUNCTIONS, "node_modules/.bin/tsc"), {cwd: FUNCTIONS});
} else {
  console.log(`# 差し替えた lib で回す: ${LIB}`);
}

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
    throw new Error("偽の admin は合言葉を確かめない");
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

/** いま使っている `lib/cards.js`。**控えごと入れ替えられるように持つ** */
let cards = load("cards");

/** 控え（`characterBook` の5分）を捨てて、冷えた1回目に戻す */
function reloadCards() {
  loaded.clear();
  cards = load("cards");
}

const {peopleForEveryone} = cards;
for (const [name, f] of [
  ["handleCards", cards.handleCards],
  ["peopleForEveryone", peopleForEveryone],
  /* **空の引き当て表は、本体から借りる。** ここで `{byChannel, byName}` と
     手書きすると、`cards.ts` が欄を増やした日に**この確かめだけが古い形の
     まま通る**（実際に `dupChannel` を足した日に踏んだ）。 */
  ["noIcons", cards.noIcons],
]) {
  if (typeof f !== "function") {
    console.error(`lib/cards.js から ${name} を取り出せなかった`);
    process.exit(1);
  }
}

const deps = {
  whoIs: async (h) =>
    (h === "Bearer me" ? {uid: "uid-me", name: "さくら"} : null),
  ownerUid: async () => null,
  listResidents: async () => [
    {uid: "uid-me", channelId: "UC_me_0000001", name: "さくら"},
  ],
};

/**
 * 口を1回叩く。
 * @param {string} method GET / POST
 * @param {string} path パス
 * @param {string} [auth] Authorization ヘッダ
 * @return {Promise<object>} 状態と返り
 */
async function call(method, path, auth) {
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
  out.handled = await cards.handleCards(
    {method, path, auth, body: {}}, res, deps,
  );
  return out;
}

/**
 * 画面と同じ手（`CardSheet.tsx` の `picks`）。写真ごとに、絵で重複を落とす
 *
 * @param {object[]} cards 公開の `/cards` が返したカード
 * @return {Map<string, string[]>} 写真IDごとの、重複を落とした絵の名前
 */
function picksByPhoto(cards) {
  const out = new Map();
  for (const c of cards) {
    // 絵の無い人は画面に出ない（`cards.ts` の `withIcons`）
    if (!c.icon) continue;
    const had = out.get(c.photoId) ?? [];
    if (had.includes(c.icon)) continue;
    had.push(c.icon);
    out.set(c.photoId, had);
  }
  return out;
}

/* ---------------- 0. 探し方が当たるか（先に見る・#19） ---------------- */

console.log("# 0. 探し方が当たるか（先に見る）");

const mine = await call("GET", "/cards/mine", "Bearer me");
const pub = await call("GET", "/cards");
const pubCards = pub.body?.cards ?? [];

check("公開の /cards は扱われる", pub.handled === true);
check("公開の /cards は 200", pub.status === 200, String(pub.status));
check(
  "公開の /cards が5枚返している（空振りでない）",
  pubCards.length === 5,
  `${pubCards.length} 枚`,
);
check(
  "仕込んだ入れ物には `UC…` が入っている（探す字が実在する）",
  JSON.stringify(STORE).includes("UC_me_0000001"),
);
{
  const withIcon = pubCards.filter((c) => c.icon).length;
  check(
    "絵が当たっている（絵を見ずに通っていない）",
    withIcon === 4,
    `${withIcon} 枚`,
  );
  const kinds = new Set(pubCards.map((c) => c.icon).filter(Boolean));
  check(
    "同じ絵が2枚ある（通し番号の要る形になっている）",
    kinds.size === 2 && withIcon === 4,
    [...kinds].join(","),
  );
}
check(
  "公開の /cards の掛け値（Cache-Control）は今までどおり",
  pub.head["Cache-Control"] ===
    "public, max-age=30, s-maxage=60, stale-while-revalidate=300",
  pub.head["Cache-Control"],
);

/* ---- 1. 公開の応答に `UC` が1文字も無い ---- */

console.log("\n# 1. 公開の /cards に、人を指す値が残っていない");
{
  const blob = JSON.stringify(pub.body);
  check("応答ぜんぶに `UC` が出てこない", !blob.includes("UC"), blob.slice(0, 160));
  check(
    "`channelId` の欄そのものが無い",
    pubCards.every((c) => !("channelId" in c)),
    Object.keys(pubCards[0] ?? {}).join(","),
  );
  check(
    "id に `UC` が入っていない（欄を消しても ID から読めた穴）",
    pubCards.every((c) => !c.id.includes("UC")),
    pubCards.map((c) => c.id).join(","),
  );
  const want = [
    "at", "day", "h", "icon", "id", "moved", "name",
    "note", "photoId", "rot", "scale", "streamEventId", "url", "w", "x", "y",
  ].sort().join(",");
  const got = Object.keys(pubCards[0] ?? {}).sort().join(",");
  check("返す欄は `channelId` を抜いたぶんだけ（他を落としていない）", got === want, got);
}

/* ---- 2. 公開の id が重複しない ---- */

console.log("\n# 2. 公開の id は、その応答の中で一意");
{
  const ids = pubCards.map((c) => c.id);
  check(
    "重複が無い（React の key に使える）",
    new Set(ids).size === ids.length,
    ids.join(","),
  );
  check(
    "同じ写真・同じ絵の2枚も分かれている（通し番号が効いている）",
    ids.filter((i) => i.startsWith("img_0000001__char_sakura__")).length === 2,
    ids.join(","),
  );
  check(
    "絵の無い人は `x` に落ちる",
    ids.includes("img_0000001__x__1"),
    ids.join(","),
  );
  /* **毎回同じもの**が返ること。開くたびに key が変わると、画面が作り直される */
  const again = (await call("GET", "/cards")).body.cards.map((c) => c.id);
  check("2回叩いても同じ id", again.join(",") === ids.join(","), again.join(","));
}

/* ---- 3. 写真に入れられる人が、1人も変わらない ---- */

console.log("\n# 3. 写真に入れられる人が、1人も変わらない（いちばん大事なところ）");
{
  const b = picksByPhoto(pubCards);
  check(
    "写真は2枚ぶん出ている",
    [...b.keys()].sort().join(",") === "img_0000001,img_0000002",
    [...b.keys()].join(","),
  );
  check(
    "img_0000001 の候補は2人（同じ絵は1人に畳む・絵の無い人は出ない）",
    (b.get("img_0000001") ?? []).length === 2,
    (b.get("img_0000001") ?? []).join(","),
  );
  check(
    "img_0000002 の候補は1人",
    (b.get("img_0000002") ?? []).length === 1,
    (b.get("img_0000002") ?? []).join(","),
  );
  /* **落としたのは人を指す値だけで、絵は1つも動かしていない。**
     入れ物から数えた「絵の当たる人」と、公開の応答の絵が同じであること。 */
  const fromStore = new Set(
    Object.values(STORE.islandCards)
      .map((v) => v.nameSnapshot)
      .map((n) => (n === "さくら" || n === "さくら2" ?
        "char_sakura" :
        n === "abc" ? "char_abc" : null))
      .filter(Boolean),
  );
  const fromApi = new Set(pubCards.map((c) => c.icon).filter(Boolean));
  check(
    "入れ物から数えた絵と、公開の応答の絵が同じ",
    [...fromStore].sort().join(",") === [...fromApi].sort().join(","),
    `${[...fromStore].sort().join(",")} / ${[...fromApi].sort().join(",")}`,
  );
}

/* ---- 4. `/cards/mine` は今までどおり ---- */

console.log("\n# 4. /cards/mine には、channelId も本当のカードIDも残っている");
{
  const cards = mine.body?.cards ?? [];
  check("200", mine.status === 200, String(mine.status));
  check("自分のぶん2枚", cards.length === 2, `${cards.length} 枚`);
  check(
    "`channelId` が入っている",
    cards.every((c) => c.channelId === "UC_me_0000001"),
    cards.map((c) => c.channelId).join(","),
  );
  check(
    "本当のカードID（`POST /cards/<id>` に渡せるもの）が入っている",
    cards.every((c) => c.id.includes("__UC_me_0000001")),
    cards.map((c) => c.id).join(","),
  );
  check(
    "公開の形に変わっていない（`__x__1` のような id になっていない）",
    cards.every((c) => !/__\d+$/.test(c.id)),
    cards.map((c) => c.id).join(","),
  );
  check(
    "掛け値は no-store",
    mine.head["Cache-Control"] === "no-store",
    mine.head["Cache-Control"],
  );
}

/* ---- 5. /nordic/photos の people ---- */

console.log("\n# 5. /nordic/photos の people[] に channelId が無い");
{
  /* **渡すのは「投げたときの名乗り」つき。** 絵はそこから引く
     （`channelsOfDay` が台帳から拾ってくる）。3人目は名前を出してよいと
     言っているのに、**その1回を別名で投げた人**（絵も名前も出ない）。 */
  const ids = [
    {channelId: "UC_me_0000001", nameSnapshot: "さくら"},
    {channelId: "UC_other_00002", nameSnapshot: "しらないひと"},
    {channelId: "UC_other_00001", nameSnapshot: "abc"},
    {channelId: "UC_anon_000001", nameSnapshot: "ななしのごんべえ"},
  ];
  /* **`byChannel` は空で回す。** ここは「公開の応答から人を指す値が
     落ちているか」を見る面なので、引き当てが名乗りだけだったころと
     同じ条件で通ることを見る。`channelId` で引く道は
     `cards_byid_selftest.mjs` が見る。 */
  const icons = {
    ...cards.noIcons(),
    byName: new Map([
      ["さくら", "char_sakura"],
      ["abc", "char_abc"],
    ]),
  };
  const named = new Map([
    ["UC_me_0000001", "さくら"],
    ["UC_anon_000001", "かこ"],
  ]);
  const got = peopleForEveryone(ids, icons, named);
  check("人数が変わらない", got.length === 4, `${got.length} 人`);
  check(
    "`channelId` の欄が無い",
    got.every((p) => !("channelId" in p)),
    Object.keys(got[0] ?? {}).join(","),
  );
  check(
    "応答ぜんぶに `UC` が出てこない",
    !JSON.stringify(got).includes("UC"),
    JSON.stringify(got).slice(0, 160),
  );
  check(
    "絵はそのまま出る（絵まで消していない）",
    got[0].icon === "char_sakura" && got[2].icon === "char_abc",
    JSON.stringify(got.map((p) => p.icon)),
  );
  check(
    "絵の当たらない人も、その場に残る（人数を減らしていない）",
    got[1].icon === null,
    JSON.stringify(got[1]),
  );
  check(
    "名前は、出してよいと言った人だけ",
    got[0].name === "さくら" && got[1].name === null && got[2].name === null,
    JSON.stringify(got.map((p) => p.name)),
  );
  check(
    "**別名で投げた人は、絵も名前も出ない**（名前を出してよいと言っていても）",
    got[3].icon === null && got[3].name === null,
    JSON.stringify(got[3]),
  );
  check(
    "並びが変わらない（渡した順のまま）",
    got.length === ids.length,
    `${got.length}`,
  );
}

/* ---- 6. ログに素性が出ていない ---- */

console.log("\n# 6. ログに、視聴者さんの素性が1文字も出ない");
{
  const all = logs.join("\n");
  check("チャンネルIDが出ていない", !all.includes("UC_"), all.slice(0, 120));
  check("名前が出ていない", !all.includes("さくら"));
  console.log(`  出たログ: ${logs.length} 行`);
}

console.log("\n# 7. 絵が引けなかった回は、0人ではなく「読めなかった」を返す");
{
  /* `channelId` を返すのをやめたので、**画面が焼き込みから絵を引き直す
     逃げ道が無くなった。** 絵の無いカードをそのまま並べて返すと、
     公開の面は候補0人＝「その日は誰も投げ銭していない」と同じ絵になる。
     読めなかったことは、読めなかったと言う（`island-standards.md` 10）。

     名簿は5分の控えに載るので、**読み込み直してから**落とす。 */
  for (const [what, before, after] of [
    ["名簿（islandCharacter）", () => breakScan.add("islandCharacter"),
      () => breakScan.delete("islandCharacter")],
    ["画像（getAll）", () => {
      breakGetAll = true;
    }, () => {
      breakGetAll = false;
    }],
  ]) {
    reloadCards();
    before();
    const down = await call("GET", "/cards");
    after();
    check(`${what}が読めない → 扱う`, down.handled === true);
    check(`${what}が読めない → 502`, down.status === 502, String(down.status));
    check(
      `${what}が読めない → カードを1枚も返さない`,
      down.body?.cards === undefined,
    );
    check(
      `${what}が読めない → 0枚の顔をしない（\`{cards: []}\` で返さない）`,
      !Array.isArray(down.body?.cards),
      JSON.stringify(down.body).slice(0, 80),
    );
    // **対照**：切り替えを戻せば、さっきと同じだけ返る
    reloadCards();
    const back = await call("GET", "/cards");
    check(
      `${what} — 戻せば元どおり返る（この診断が空振りでない）`,
      (back.body?.cards ?? []).length === pubCards.length,
      `${(back.body?.cards ?? []).length} / ${pubCards.length}`,
    );
    check(
      `${what} — 戻せば絵も元どおり（絵を見ずに通っていない）`,
      (back.body?.cards ?? []).filter((c) => c.icon).length === 4,
      `${(back.body?.cards ?? []).filter((c) => c.icon).length} 枚`,
    );
  }
}

console.log("");
if (bad > 0) {
  console.log(`NG が ${bad} 件（通ったのは ${ok} 件）。`);
  process.exit(1);
}
console.log(`${ok} 件ぜんぶ通った。`);
