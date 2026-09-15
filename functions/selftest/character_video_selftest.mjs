/**
 * 投げ銭のアラートで流す**動画**の確かめ。**偽の Firestore と偽の置き場で回す。**
 *
 * ## 何を見ているか
 *
 * 動画は絵と同じ形（役どころで鍵を切る）に寄せた。
 *
 *     islandCharacter.videos.{役どころ} = {url, bytes, seconds, w, h, at}
 *
 * いまの役どころは `alert` ひとつ。2本目は `VIDEO_ROLES` に足すだけで済む。
 *
 * **移行の途中でも配信が止まらないこと**が、ここでいちばん見たいもの。
 * 本番では1人が旧い `videoUrl`（文字列1本）を持っていて、それが毎晩の
 * 配信で実際に使われている。OBS（`app/alertbox/`）はまだ `videoUrl` しか
 * 見ていないので、**新しい欄に移した日に旧い欄が消えると、その晩の
 * アラートが絵に戻る。**
 *
 * 1. `videos.alert` があれば、`videos` と `videoUrl` の**両方**が返る
 * 2. **旧い `videoUrl` しか無い人でも、`videoUrl` が返る**（これが本命）
 * 3. 両方ある人は、新しいほう（`videos.alert`）が勝つ
 * 4. 目次（`moov`）が末尾の mp4 を**断る**（投げ銭の直後に出せない）
 * 5. mp4 でないもの（頭が `ftyp` でない）を**断る**
 * 6. 上限を超えるものを**断る**
 * 7. **あやと以外は置けない**（置き場にも書類にも1バイトも入らない）
 * 8. 動画だけを送った POST が、**名前と鍵を消さない**
 *
 * ## なぜ本番のデータを引かないか
 *
 * このリポジトリは公開で、Actions のログも誰でも読める。**視聴者さんの
 * 名乗りも動画も出さない。** 出てくるのは、ここで組み立てた偽の mp4
 * （映像の中身は 0 埋め）と、仕込んだ `さくら` だけ。
 *
 * ## なぜ写しを置かないか
 *
 * `tsc` が書き出した `lib/islandCharacter.js` を、**偽の firebase-admin を
 * 渡して**そのまま動かす。写しを持つと、本体を直したのに確かめが古いまま通る。
 *
 * ## 壊した写しで落ちることまで見る（`docs/island-misses.md` #99 #100）
 *
 * `CHARACTER_LIB_DIR` に壊した `lib` を渡すと、そちらで回る（`tsc` は通さない）。
 *
 * ```bash
 * node functions/selftest/character_video_selftest.mjs
 * cp -r functions/lib /tmp/brokenlib && vi /tmp/brokenlib/islandCharacter.js
 * CHARACTER_LIB_DIR=/tmp/brokenlib node functions/selftest/character_video_selftest.mjs
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
const LIB = process.env.CHARACTER_LIB_DIR || join(FUNCTIONS, "lib");
/** 写しで回すときは `tsc` を通さない（差し替えた `lib` を焼き直してしまう） */
const BUILD = !process.env.CHARACTER_LIB_DIR;

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

/* ---------------- 偽の mp4 を組み立てる ----------------

   本物を1本もリポジトリに置かないため、ここで組む。**見るのは箱の並びと
   `mvhd` / `tkhd` の数字だけ**なので、映像の中身（`mdat`）は 0 でよい。
   箱の形は本番の1本と同じ（実測: ftyp 0 / moov 32 / free 10553 /
   mdat 10561。`moov` の名前が36バイト目に出るのはこの並び）。 */

/**
 * 箱を1つ作る。`[大きさ4][名前4][中身]`。
 * @param {string} type 4字の名前
 * @param {Buffer} payload 中身
 * @return {Buffer} 箱
 */
function box(type, payload) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(payload.length + 8, 0);
  head.write(type, 4, "latin1");
  return Buffer.concat([head, payload]);
}

/**
 * `mvhd`（時計）。長さは「刻み ÷ 1秒あたりの刻み」で出る。
 * @param {number} scale 1秒あたりの刻み
 * @param {number} ticks 刻みの数
 * @return {Buffer} 箱
 */
function mvhd(scale, ticks) {
  const p = Buffer.alloc(100);
  // 版0・旗0 → 作った時刻(4) 直した時刻(4) 刻み(4) 長さ(4) …
  p.writeUInt32BE(scale, 12);
  p.writeUInt32BE(ticks, 16);
  return box("mvhd", p);
}

/**
 * `tkhd`（筋1本）。**画の大きさは、いちばん後ろの8バイト**（16.16 の固定小数）。
 * @param {number} w 幅
 * @param {number} h 高さ
 * @return {Buffer} 箱
 */
function tkhd(w, h) {
  const p = Buffer.alloc(84);
  p.writeUInt32BE(w * 65536, 76);
  p.writeUInt32BE(h * 65536, 80);
  return box("tkhd", p);
}

const FTYP = box("ftyp", Buffer.from("isom\x00\x00\x02\x00isomiso2avc1mp41"));
const MOOV = Buffer.concat([
  box("moov", Buffer.concat([mvhd(1000, 8200), box("trak", tkhd(540, 960))])),
]);
/**
 * 映像の中身。**0 埋め。** 大きさだけが要る。
 * @param {number} bytes 中身のバイト数
 * @return {Buffer} 箱
 */
const mdat = (bytes) => box("mdat", Buffer.alloc(bytes));

/** 投げ銭の直後に出せる形（目次が先。`ffmpeg -movflags +faststart`） */
const FAST = Buffer.concat([FTYP, MOOV, mdat(4096)]);
/** **目次が末尾。** 最後まで落とし終わるまで再生が始まらない */
const SLOW = Buffer.concat([FTYP, mdat(4096), MOOV]);
/** 目次がどこにも無い */
const NO_MOOV = Buffer.concat([FTYP, mdat(4096)]);
/** mp4 ではない（頭が `ftyp` でない。png の頭を持たせてある） */
const NOT_MP4 = Buffer.concat([
  Buffer.from("\x89PNG\r\n\x1a\n", "latin1"),
  Buffer.alloc(4096),
]);

/** base64 にして送る形にする。`data:` 付きでも受けることは別に見る */
const b64 = (buf) => buf.toString("base64");

/* ---------------- 本体を読み込む土台 ---------------- */

if (BUILD) {
  console.log("# tsc を回して、いまの src から読み込む");
  execFileSync(join(FUNCTIONS, "node_modules/.bin/tsc"), {cwd: FUNCTIONS});
} else {
  console.log(`# 差し替えた lib で回す: ${LIB}`);
}

const nodeRequire = createRequire(import.meta.url);
console.log(
  `  偽の mp4: 目次が先 ${FAST.length} バイト / 末尾 ${SLOW.length} バイト\n`,
);

/**
 * 深く混ぜる（Firestore の `set(…, {merge: true})` と同じ振る舞い）。
 * 入れ子の地図は**丸ごと置き換えずに、鍵ごとに混ぜる。**
 * @param {object} into 元
 * @param {object} from 足すもの
 * @return {object} 混ざったもの
 */
function merge(into, from) {
  const out = {...into};
  for (const [k, v] of Object.entries(from)) {
    out[k] = v && typeof v === "object" && !Array.isArray(v) &&
      out[k] && typeof out[k] === "object" && !Array.isArray(out[k]) ?
      merge(out[k], v) :
      v;
  }
  return out;
}

/**
 * 1つの筋書き。**入れ物は筋書きごとに作り直す。**
 * @param {object} docs 書類ID → 中身（**ぜんぶ偽の字**）
 * @return {object} 口を叩く関数と、置かれたもの・書かれたもの
 */
function scenario(docs) {
  /** 偽の置き場に置かれたもの。パス → {bytes, type} */
  const saved = new Map();
  /** Firestore に書かれた patch。**1件も書いていないことを見るのに使う** */
  const writes = [];
  const store = JSON.parse(JSON.stringify(docs));

  const snapOf = (id) => ({
    id,
    exists: !!store[id],
    data: () => store[id],
  });

  const col = {
    doc: (id) => ({
      id,
      get: async () => snapOf(id),
      set: async (patch, opts) => {
        writes.push({id, patch});
        store[id] = opts?.merge ? merge(store[id] ?? {}, patch) : patch;
      },
      delete: async () => {
        delete store[id];
      },
    }),
    limit: () => ({
      get: async () => {
        const rows = Object.keys(store).map(snapOf);
        return {size: rows.length, docs: rows, forEach: (f) => rows.forEach(f)};
      },
    }),
  };

  const admin = {
    apps: [],
    initializeApp: () => {
      admin.apps.push({});
    },
    firestore: Object.assign(() => ({collection: () => col}), {
      FieldValue: {serverTimestamp: () => 0},
    }),
    storage: () => ({
      bucket: () => ({
        file: (name) => ({
          name,
          save: async (buf, o) => {
            saved.set(name, {
              bytes: buf.length,
              type: o?.contentType,
              cache: o?.metadata?.cacheControl,
            });
          },
        }),
        getFiles: async () => [[]],
        deleteFiles: async () => undefined,
      }),
    }),
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

  const {handleCharacters} = load("islandCharacter");
  if (typeof handleCharacters !== "function") {
    console.error("lib/islandCharacter.js から handleCharacters が取れない");
    process.exit(1);
  }

  /**
   * 口を1回叩く。
   * @param {string} method GET / POST / DELETE
   * @param {string} path 道
   * @param {object} [o] `auth`（`"ayato"` であやと）と `body`
   * @return {Promise<object>} {status, body, handled}
   */
  const hit = async (method, path, o = {}) => {
    let status = 200;
    let body = null;
    const res = {
      set: () => undefined,
      status: (n) => {
        status = n;
        return res;
      },
      json: (b) => {
        body = b;
      },
      send: (b) => {
        body = b;
      },
    };
    const handled = await handleCharacters(
      {method, path, auth: o.auth, query: o.query ?? {}, body: o.body ?? {}},
      res,
      {
        /* **あやとだけ。** 合言葉が違えば null（＝口が 403 を返す） */
        ownerUid: async (h) => (h === "Bearer ayato" ? "uid-ayato" : null),
        alertboxKey: async (k) => (k === "a".repeat(32) ? "key-ok" : ""),
      },
    );
    return {status, body, handled};
  };

  return {hit, store, saved, writes, logs};
}

/* ---------------- 仕込む名簿 ----------------

   本番と同じ形で置く。**`char_old_1` が、いま本番にいる1人と同じ形**
   （`videos` を持たず、旧い `videoUrl` に文字列が1本だけ入っている）。 */

const URL_NEW = "https://firebasestorage.example/v0/b/x/o/new.mp4?alt=media";
const URL_OLD = "/alert/aoi-test.mp4";

const DOCS = {
  /** 新しい形だけを持つ人 */
  char_new_1: {
    channelName: "さくら",
    emoji: "🌸",
    channelKeys: ["さくら"],
    lookupKeys: ["さくら"],
    videos: {
      alert: {
        url: URL_NEW, bytes: 1053735, seconds: 8.2, w: 540, h: 960,
        at: "2026-09-15T00:00:00.000Z",
      },
      /* **知らない役どころ。** `VIDEO_ROLES` に無いものは返さない
         （増やすときに足し忘れたら、黙って出ないほうがよい） */
      hero: {url: "https://example/hero.mp4"},
    },
  },
  /** **いま本番にいる1人と同じ形。** 旧い欄しか持っていない */
  char_old_1: {
    channelName: "あお",
    emoji: "🐟",
    channelKeys: ["あお"],
    lookupKeys: ["あお", "あおい"],
    aliases: ["あおい"],
    videoUrl: URL_OLD,
  },
  /** 両方持っている人（移行の途中） */
  char_both_1: {videos: {alert: {url: URL_NEW}}, videoUrl: URL_OLD},
  /** 動画を持っていない人（ほとんどはこれ） */
  char_none_1: {channelName: "みどり", emoji: "🍀"},
  /** **URL の無い跡だけが残っている人。** 動画があると言ってはいけない */
  char_wreck_1: {videos: {alert: {bytes: 100, seconds: 3}}},
};

const KEY = "a".repeat(32);

console.log("# 0. 返し方 — `videos` と `videoUrl` の両方が返る");
{
  const s = scenario(DOCS);
  /* OBS が配信の頭に引く名簿（`shapeFull`）。**ここが本番で使われている道。** */
  const r = await s.hit("GET", `/alertbox/${KEY}/characters`);
  const by = new Map(
    (r.body?.characters ?? []).map((c) => [c.id, c]),
  );
  check("名簿が返っている", r.status === 200 && by.size === 5, String(by.size));

  const nw = by.get("char_new_1") ?? {};
  check(
    "`videos.alert` があれば `videos` に出る",
    nw.videos?.alert?.url === URL_NEW,
    JSON.stringify(nw.videos),
  );
  check(
    "**同じ値が `videoUrl` にも出る**（古い画面がそのまま動く）",
    nw.videoUrl === URL_NEW,
    String(nw.videoUrl),
  );
  check(
    "長さと大きさも返る（温めが間に合うかを画面から見られる）",
    nw.videos?.alert?.seconds === 8.2 && nw.videos?.alert?.h === 960,
    JSON.stringify(nw.videos?.alert),
  );
  check(
    "知らない役どころ（`hero`）は返さない",
    !nw.videos?.hero,
    JSON.stringify(nw.videos),
  );

  const old = by.get("char_old_1") ?? {};
  /* **本命。** 移行の途中で止めても、配信が動き続けることの根拠。 */
  check(
    "**旧い `videoUrl` しか無い人でも、`videoUrl` が返る**",
    old.videoUrl === URL_OLD,
    String(old.videoUrl),
  );
  check(
    "その人の `videos` は空（無いものを作らない）",
    Object.keys(old.videos ?? {}).length === 0,
    JSON.stringify(old.videos),
  );

  const both = by.get("char_both_1") ?? {};
  check(
    "両方ある人は、新しいほうが勝つ",
    both.videoUrl === URL_NEW && both.videos?.alert?.url === URL_NEW,
    String(both.videoUrl),
  );

  const none = by.get("char_none_1") ?? {};
  check(
    "持っていない人は `videoUrl` が null で、`videos` が空",
    none.videoUrl === null && Object.keys(none.videos ?? {}).length === 0,
    JSON.stringify([none.videoUrl, none.videos]),
  );

  const wreck = by.get("char_wreck_1") ?? {};
  check(
    "URL の無い跡だけの人は、動画なし扱い（空の `<video>` を開かせない）",
    wreck.videoUrl === null && !wreck.videos?.alert,
    JSON.stringify([wreck.videoUrl, wreck.videos]),
  );
}

console.log("\n# 1. あやとが1本置ける（置き場にも書類にも入る）");
{
  const s = scenario(DOCS);
  const r = await s.hit("POST", "/characters/char_old_1", {
    auth: "Bearer ayato",
    /* **動画だけを送る。** 名前は1つも送らない（道具がこう呼ぶ）。
       `seconds` と `w` はわざと嘘を入れてある。**名乗りは使わない** */
    body: {videos: {alert: {data: b64(FAST), seconds: 999, w: 12345}}},
  });
  check("200 で返る", r.status === 200, String(r.status));
  check(
    "置き場に1本だけ置かれた",
    s.saved.size === 1 &&
      s.saved.has("island/characters/char_old_1/video-alert.mp4"),
    [...s.saved.keys()].join(","),
  );
  const put = s.saved.get("island/characters/char_old_1/video-alert.mp4") ?? {};
  check(
    "`video/mp4` として置かれた",
    put.type === "video/mp4" && put.bytes === FAST.length,
    JSON.stringify(put),
  );

  const v = s.store.char_old_1?.videos?.alert ?? {};
  check("書類の `videos.alert` に URL が入った", !!v.url, JSON.stringify(v));
  check("バイト数が入った", v.bytes === FAST.length, String(v.bytes));
  check(
    "**長さは中身（`mvhd`）から読む**（送られてきた 999 ではない）",
    v.seconds === 8.2,
    String(v.seconds),
  );
  check(
    "**大きさも中身（`tkhd`）から読む**（送られてきた 12345 ではない）",
    v.w === 540 && v.h === 960,
    JSON.stringify([v.w, v.h]),
  );
  check("入れた時刻が入った", typeof v.at === "string", String(v.at));
  check(
    "**旧い `videoUrl` にも同じ値が入る**（戻せる・古い画面が動く）",
    s.store.char_old_1.videoUrl === v.url,
    String(s.store.char_old_1.videoUrl),
  );
  check(
    "返事でも両方が同じ値",
    r.body?.character?.videoUrl === v.url &&
      r.body?.character?.videos?.alert?.url === v.url,
    String(r.body?.character?.videoUrl),
  );

  /* **名前を送らない POST で、名前と鍵が消えないこと。** ここが消えると
     絵は残るのに投げ銭で誰にも当たらない人ができる。 */
  check(
    "名前を送らなくても `channelName` が残る",
    s.store.char_old_1.channelName === "あお",
    String(s.store.char_old_1.channelName),
  );
  check(
    "呼び名と引く鍵も残る",
    (s.store.char_old_1.lookupKeys ?? []).join(",") === "あお,あおい",
    JSON.stringify(s.store.char_old_1.lookupKeys),
  );
  check(
    "絵（`images`）を送っていないので、絵の欄は増えも減りもしない",
    !s.store.char_old_1.images?.plain,
    JSON.stringify(Object.keys(s.store.char_old_1.images ?? {})),
  );
}

console.log("\n# 2. 断るもの（置き場にも書類にも1バイトも入らない）");
{
  /**
   * 1つ断らせてみる。**置き場と書類が汚れていないことまで見る。**
   * @param {string} name 何を送ったか
   * @param {Buffer|string} data 送る中身
   * @param {string} want 返ってほしい理由
   */
  const deny = async (name, data, want) => {
    const s = scenario(DOCS);
    const body = {videos: {alert: {data: typeof data === "string" ?
      data :
      b64(data)}}};
    const r = await s.hit("POST", "/characters/char_none_1", {
      auth: "Bearer ayato", body,
    });
    check(
      `${name}: 400 で断る（理由 ${want}）`,
      r.status === 400 && r.body?.error === want,
      `${r.status} ${JSON.stringify(r.body)}`,
    );
    check(
      `${name}: 置き場に1本も置かれていない`,
      s.saved.size === 0,
      [...s.saved.keys()].join(","),
    );
    check(
      `${name}: 書類も1件も書かれていない`,
      s.writes.length === 0,
      String(s.writes.length),
    );
  };

  /* **目次が末尾。** 投げ銭の直後に出るものとして使えない
     （最後まで落とし終わるまで再生が始まらない）。 */
  await deny("目次が末尾の mp4", SLOW, "moov last");
  await deny("目次の無い mp4", NO_MOOV, "no moov");
  /* **頭で見る。** 拡張子や Content-Type の名乗りでは決めない。 */
  await deny("mp4 でないもの（png の頭）", NOT_MP4, "not a video");
  await deny(
    "上限（4MB）を超えるもの",
    Buffer.concat([FTYP, MOOV, mdat(4 * 1024 * 1024)]),
    "bad size",
  );
  await deny("小さすぎるもの", Buffer.from("ftyp"), "bad size");
  await deny("空", "", "bad size");

  /* **対照。** 同じ道に、同じ呼び方で、正しい1本を通す。
     これが通るから、上の「断った」が守りのせいだと言える
     （`docs/island-standards.md` 13）。 */
  const s = scenario(DOCS);
  const r = await s.hit("POST", "/characters/char_none_1", {
    auth: "Bearer ayato", body: {videos: {alert: {data: b64(FAST)}}},
  });
  check(
    "対照: 目次が先の同じ長さの mp4 は通る",
    r.status === 200 && s.saved.size === 1,
    `${r.status} / ${s.saved.size}本`,
  );
  check(
    "対照: `data:` 付きで送っても通る（画面と同じ送り方）",
    (await (async () => {
      const t = scenario(DOCS);
      const o = await t.hit("POST", "/characters/char_none_1", {
        auth: "Bearer ayato",
        body: {videos: {alert: {data: `data:video/mp4;base64,${b64(FAST)}`}}},
      });
      return o.status === 200 && t.saved.size === 1;
    })()),
  );
}

console.log("\n# 3. あやと以外は置けない");
{
  const s = scenario(DOCS);
  const body = {videos: {alert: {data: b64(FAST)}}};
  const no = await s.hit("POST", "/characters/char_none_1", {body});
  check("札なしは 403", no.status === 403, String(no.status));
  const fake = await s.hit("POST", "/characters/char_none_1", {
    auth: "Bearer someone", body,
  });
  check("よその札も 403", fake.status === 403, String(fake.status));
  check(
    "置き場に1本も置かれていない",
    s.saved.size === 0,
    [...s.saved.keys()].join(","),
  );
  check("書類も1件も書かれていない", s.writes.length === 0,
    String(s.writes.length));
  // 対照。同じ本文を、あやとの札で送れば通る
  const yes = await s.hit("POST", "/characters/char_none_1", {
    auth: "Bearer ayato", body,
  });
  check(
    "対照: あやとの札なら通る（断っているのは札の違いだけ）",
    yes.status === 200 && s.saved.size === 1,
    `${yes.status} / ${s.saved.size}本`,
  );
}

console.log("\n# 4. 役どころで鍵が切れている（2本目を足せる形か）");
{
  const s = scenario(DOCS);
  /* 知らない役どころは、置き場にも書類にも入らない。**足すのは
     `VIDEO_ROLES` に1語足す仕事**で、口の書き換えは要らない。 */
  const r = await s.hit("POST", "/characters/char_new_1", {
    auth: "Bearer ayato",
    body: {videos: {hero: {data: b64(FAST)}}},
  });
  check("200 で返る（断りではない）", r.status === 200, String(r.status));
  check(
    "知らない役どころは置き場に置かれない",
    s.saved.size === 0,
    [...s.saved.keys()].join(","),
  );
  check(
    "前から入っている `alert` は触られない",
    s.store.char_new_1.videos.alert.url === URL_NEW,
    String(s.store.char_new_1.videos.alert.url),
  );
  check(
    "`videoUrl` も前のまま（`videos.alert` から埋まる）",
    s.store.char_new_1.videoUrl === URL_NEW,
    String(s.store.char_new_1.videoUrl),
  );
}

console.log("\n# 5. 動画を送らない POST は、動画に触らない");
{
  const s = scenario(DOCS);
  const r = await s.hit("POST", "/characters/char_new_1", {
    auth: "Bearer ayato",
    // 画面（`/me` の図鑑）が名前を直すときの呼び方
    body: {channelName: "さくら", emoji: "🌸", aliases: ["さくらんぼ"]},
  });
  check("200 で返る", r.status === 200, String(r.status));
  check(
    "動画は前のまま",
    s.store.char_new_1.videos.alert.url === URL_NEW,
    String(s.store.char_new_1.videos.alert?.url),
  );
  check(
    "名前を送れば、鍵は作り直される（前のままではない）",
    (s.store.char_new_1.lookupKeys ?? []).join(",") === "さくら,さくらんぼ",
    JSON.stringify(s.store.char_new_1.lookupKeys),
  );
  check(
    "ログに素性が出ていない",
    !s.logs.join("\n").includes("さくら"),
    s.logs.join(" / ").slice(0, 120),
  );
}

console.log("\n# 6. **いま本番で使っている1本**を、そのまま通してみる");
{
  /* 偽の mp4 は、こちらが作った形しか試せない。**本物の ffmpeg が書いた
     並び**（ftyp / moov / free / mdat）で通ることは、実物で見る。

     この1本は仮置きのなごりで `public/alert/` に置いてある。**置き場に
     移したら消える**ので、無ければここは飛ばす（確かめ全体は落とさない）。 */
  const real = join(FUNCTIONS, "..", "public", "alert", "aoi-test.mp4");
  let buf = null;
  try {
    buf = readFileSync(real);
  } catch {
    console.log("  --   public/alert/aoi-test.mp4 が無いので飛ばす");
  }
  if (buf) {
    const s = scenario(DOCS);
    const r = await s.hit("POST", "/characters/char_old_1", {
      auth: "Bearer ayato", body: {videos: {alert: {data: b64(buf)}}},
    });
    const v = s.store.char_old_1?.videos?.alert ?? {};
    check(
      `本番の1本（${buf.length} バイト）が通る`,
      r.status === 200 && v.bytes === buf.length,
      `${r.status} / ${v.bytes}`,
    );
    check(
      "長さと大きさが読めている（実測 8.6秒・528x960）",
      v.seconds === 8.6 && v.w === 528 && v.h === 960,
      JSON.stringify([v.seconds, v.w, v.h]),
    );
    check(
      "旧い欄も同じ値になる",
      s.store.char_old_1.videoUrl === v.url,
      String(s.store.char_old_1.videoUrl),
    );
  }
}

console.log("");
if (bad > 0) {
  console.log(`NG が ${bad} 件（通ったのは ${ok} 件）。`);
  process.exit(1);
}
console.log(`${ok} 件ぜんぶ通った。`);
