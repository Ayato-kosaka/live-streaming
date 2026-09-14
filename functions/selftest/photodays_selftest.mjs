/**
 * 「その日の写真に、だれを入れますか」の候補の確かめ。**偽の Firestore で回す。**
 *
 * 見るのは2つ。
 *
 * 1. `channelsOfDay`（`src/streamEvents.ts`）— 台帳（`islandTips`）に
 *    名簿（`islandDayPeople`）を足したこと。**名簿の無い日が1人も
 *    変わらないこと**が、いちばん落としてはいけないところ（過去の
 *    ほとんどの日にまだ名簿が無い）
 * 2. `listPhotoDays`（`src/islandApi.ts`）— 絵の無い人を返さないことと、
 *    **絵で絞ってから60人で切っている**こと。逆にすると、絵のある人が
 *    60人の外へ押し出されて消える
 *
 * ## なぜ本番のデータを引かないか
 *
 * このリポジトリは公開で、Actions のログも誰でも読める。視聴者さんの
 * チャンネルIDを出力に出さない。仕込んだ `UC-t000…` しか出さない。
 *
 * ## なぜ `require` せずに切り出すか
 *
 * `lib/streamEvents.js` も `lib/islandApi.js` も、読み込んだだけで
 * `admin.initializeApp()` と `db.collection()` まで走る。本番の資格情報は
 * この箱に無いので、**確かめたいのは集め方だけなのに落ちる。**
 *
 * かわりに `tsc` が書き出した `lib/*.js` から、見たい関数**だけ**を
 * 切り出して、Firestore のふりをするものを差し込んで動かす。
 * **写しを持たない**（写しを置くと、本体を直したのに確かめが古いまま通る）。
 * 切り出す前に `tsc` を回すので、いま `src/` にある字がそのまま対象になる。
 *
 * ## 探し方が当たることを、先に見る（`docs/island-misses.md` #19）
 *
 * 切り出しが空振りしたら「0件だから合格」に見える。**切り出せたことと、
 * 切り出した中に見たい字があることを先に確かめてから**中身を見る。
 *
 * 回しかた:
 *
 * ```bash
 * node functions/selftest/photodays_selftest.mjs
 * ```
 */

import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
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
 * @param {string} [why] 落ちたときに出す中身（**仕込んだ値だけ**）
 */
function check(name, ok, why = "") {
  if (ok) {
    console.log(`  ok   ${name}`);
    return;
  }
  bad += 1;
  console.log(`  NG   ${name}${why ? ` — ${why}` : ""}`);
}

/** 仕込むチャンネルID。本番と同じ長さ・同じ形（24字、`UC` ではじまる）。 */
const ch = (n) => `UC-t${String(n).padStart(20, "0")}`;

/* ---------------- 本体を切り出す ---------------- */

console.log("# tsc を回して、いまの src から切り出す");
execFileSync(join(FUNCTIONS, "node_modules/.bin/tsc"), {cwd: FUNCTIONS});

/**
 * `lib/*.js` から関数を1つ切り出す。
 * @param {string} file lib の中のファイル名
 * @param {string} head 切り出しの始まり
 * @param {string} tail 切り出しの終わり（この手前まで）
 * @param {string[]} must 切り出した中に無ければならない字
 * @return {string} 切り出した字
 */
function cut(file, head, tail, must) {
  const js = readFileSync(join(FUNCTIONS, "lib", file), "utf8");
  const from = js.indexOf(head);
  const to = js.indexOf(tail, from + 1);
  if (from < 0 || to < 0 || to <= from) {
    console.error(`切り出せなかった。${file} に ${head} / ${tail} が無い`);
    process.exit(1);
  }
  const src = js.slice(from, to);
  for (const m of must) {
    if (!src.includes(m)) {
      console.error(`切り出した ${head} の中に ${m} が無い`);
      process.exit(1);
    }
  }
  return src;
}

const daySrc = cut(
  "streamEvents.js",
  "async function channelsOfDay(",
  "exports.channelsOfDay =",
  ["exports.TIPS.where(\"day\", \"==\", day)", "exports.DAY_PEOPLE.doc(day)"],
);
const photoSrc = cut(
  "islandApi.js",
  "async function listPhotoDays(",
  "\nexports.islandApi =",
  ["icons.has(c)", ".slice(0, 60)", "NPHOTOS.orderBy("],
);
console.log(
  `  切り出した長さ: channelsOfDay ${daySrc.length} 字 / ` +
    `listPhotoDays ${photoSrc.length} 字\n`,
);

console.log("# 0. 探し方が当たるか（先に見る）");
check("channelsOfDay に名簿を引く字がある", daySrc.includes("DAY_PEOPLE"));
check("listPhotoDays に絵で絞る字がある", photoSrc.includes("filter"));
check(
  "60人で切る字がある",
  photoSrc.includes("slice(0, 60)"),
  "無ければ上限の確かめが素通りする",
);

/* ---------------- 偽の Firestore ---------------- */

/** 問い合わせ1つぶんの答え。`forEach` しか使われていない。 */
const snapOf = (rows) => ({
  forEach: (f) => rows.forEach((r) => f({id: r.id, get: (k) => r[k]})),
});

/**
 * 台帳のふりをするもの。`where(...).get()` だけ。
 * @param {object[]} rows 仕込む行
 * @return {object} `TIPS` の代わり
 */
function fakeTips(rows) {
  const q = (f, op, v) => ({
    get: async () =>
      snapOf(
        rows.filter((r) =>
          op === "in" ? v.includes(r[f]) : r[f] === v,
        ),
      ),
  });
  return {where: q};
}

/**
 * 名簿のふりをするもの。**書類の無い日は `exists: false`。**
 * @param {Record<string, string[]>} table 日 → チャンネルID
 * @return {object} `DAY_PEOPLE` の代わり
 */
function fakeDayPeople(table) {
  return {
    doc: (day) => ({
      get: async () => {
        const has = Object.prototype.hasOwnProperty.call(table, day);
        return {
          exists: has,
          get: (k) => (has && k === "channels" ? table[day] : undefined),
        };
      },
    }),
  };
}

/**
 * 切り出した `channelsOfDay` を、差し込んだ Firestore で動かす。
 * @param {object[]} tips 台帳の行
 * @param {Record<string, string[]>} roster 名簿
 * @return {Function} `(events, day) => Promise<string[]>`
 */
function makeChannelsOfDay(tips, roster) {
  const exportsObj = {
    isDay: (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v),
    TIPS: fakeTips(tips),
    DAY_PEOPLE: fakeDayPeople(roster),
  };
  const clean = (v, max) =>
    typeof v === "string" ? v.trim().slice(0, max) : "";
  return new Function(
    "exports",
    "clean",
    "IN_CHUNK",
    `${daySrc}\nreturn channelsOfDay;`,
  )(exportsObj, clean, 30);
}

/* ---------------- 1. channelsOfDay ---------------- */

/* 仕込み。**2026-09-13 の実物と同じ形**で、投げてくれた人が3人、
   その日コメントしてくれた人が5人（うち2人は投げた人と同じ）。 */
const TIPS_ROWS = [
  {id: "t1", day: "2026-09-13", videoId: "vvvvvvvvvvv", channelId: ch(1)},
  {id: "t2", day: "2026-09-13", videoId: "vvvvvvvvvvv", channelId: ch(2)},
  {id: "t3", day: "2026-09-13", videoId: "vvvvvvvvvvv", channelId: ch(3)},
  // 別の日。混ざってはいけない
  {id: "t9", day: "2026-09-12", videoId: "wwwwwwwwwww", channelId: ch(9)},
];
const ROSTER = {
  // 早く来てくれた順。投げた ch(2) ch(1) も入っている（名簿は全員ぶん）
  "2026-09-13": [ch(5), ch(2), ch(6), ch(1), ch(7)],
};
const EVENTS = [
  {id: "e1", date: "2026-09-13", videoIds: ["vvvvvvvvvvv"]},
];

console.log("\n# 1. 名簿の**無い**日は、いままでと1人も変わらない");
{
  /* 名簿を1件も置かない。**過去のほとんどの日がこれ。** */
  const f = makeChannelsOfDay(TIPS_ROWS, {});
  const got = await f(EVENTS, "2026-09-13");
  check(
    "台帳の3人だけが、台帳の順で返る",
    JSON.stringify(got) === JSON.stringify([ch(1), ch(2), ch(3)]),
    `${got.length}人 ${JSON.stringify(got)}`,
  );
  const other = await f(EVENTS, "2026-09-12");
  check(
    "別の日も台帳のまま（日をまたいで混ざらない）",
    JSON.stringify(other) === JSON.stringify([ch(9)]),
    JSON.stringify(other),
  );
  const none = await f(EVENTS, "2026-01-01");
  check("台帳も名簿も無い日は空", none.length === 0, JSON.stringify(none));
  check("日付の形でなければ空", (await f(EVENTS, "きょう")).length === 0);
}

console.log("\n# 2. 名簿の**ある**日は、台帳の人が先頭で、そのあと名簿の順");
{
  const f = makeChannelsOfDay(TIPS_ROWS, ROSTER);
  const got = await f(EVENTS, "2026-09-13");
  /* 台帳 ch1 ch2 ch3 → 名簿のうちまだ出ていない ch5 ch6 ch7。
     ch2 ch1 は名簿にもいるが、台帳で出た位置のまま（2度出さない）。 */
  const want = [ch(1), ch(2), ch(3), ch(5), ch(6), ch(7)];
  check(
    "台帳3人＋名簿3人の6人",
    got.length === 6,
    `${got.length}人 ${JSON.stringify(got)}`,
  );
  check(
    "並びは 投げた人 → 名簿の順",
    JSON.stringify(got) === JSON.stringify(want),
    JSON.stringify(got),
  );
  check(
    "台帳の3人が1人も減っていない",
    [ch(1), ch(2), ch(3)].every((c) => got.includes(c)),
  );
  check("重複が無い", new Set(got).size === got.length);
  const again = await f(EVENTS, "2026-09-13");
  check(
    "2回回しても並びが同じ（読む側がそのまま出すので）",
    JSON.stringify(again) === JSON.stringify(got),
  );
}

console.log("\n# 3. 名簿がこわれていても落ちない");
{
  const f = makeChannelsOfDay(TIPS_ROWS, {
    "2026-09-13": [ch(5), "", null, 42, {a: 1}, ch(5)],
  });
  const got = await f(EVENTS, "2026-09-13");
  check(
    "空・数・物は落ちて、台帳＋ch5 の4人",
    JSON.stringify(got) === JSON.stringify([ch(1), ch(2), ch(3), ch(5)]),
    JSON.stringify(got),
  );
}

/* ---------------- 4. listPhotoDays ---------------- */

/**
 * 切り出した `listPhotoDays` を、差し込んだもので動かす。
 * @param {object} o 差し込むもの
 * @return {Promise<object[]>} 返ってきた日ごとの中身
 */
function makeListPhotoDays(o) {
  const NPHOTOS = {
    orderBy: () => ({
      limit: () => ({get: async () => snapOfDocs(o.photos)}),
    }),
  };
  const snapOfDocs = (rows) => ({
    forEach: (f) => rows.forEach((r) => f({id: r.id, data: () => r})),
  });
  const isDay = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  return new Function(
    "NPHOTOS",
    "isDay",
    "streamEvents_1",
    "listResidents",
    "cards_1",
    `${photoSrc}\nreturn listPhotoDays;`,
  )(
    NPHOTOS,
    isDay,
    {loadEvents: async () => [], channelsOfDay: o.channelsOfDay},
    async () => o.residents ?? [],
    {iconsOf: o.iconsOf},
  );
}

console.log("\n# 4. 絵の無い人は候補に出ない");
{
  /* その日いた6人のうち、絵があるのは2人だけ（9月13日の実物に近い形）。 */
  const have = [ch(1), ch(4)];
  const all = [ch(1), ch(2), ch(3), ch(4), ch(5), ch(6)];
  let asked = null;
  const f = makeListPhotoDays({
    photos: [
      {id: "p1", day: "2026-09-13", url: "https://x/p1.webp", w: 1, h: 1, at: 1},
    ],
    channelsOfDay: async () => all,
    iconsOf: async (ids) => {
      asked = ids;
      return new Map(have.map((c) => [c, `chr-${c.slice(-1)}`]));
    },
    residents: [],
  });
  const days = await f();
  const people = days[0].people;
  check("日は1つ", days.length === 1, `${days.length}`);
  check(
    "絵のある2人だけが返る",
    people.length === 2,
    `${people.length}人 ${JSON.stringify(people.map((p) => p.channelId))}`,
  );
  check(
    "並びは元の順のまま",
    JSON.stringify(people.map((p) => p.channelId)) === JSON.stringify(have),
    JSON.stringify(people.map((p) => p.channelId)),
  );
  check(
    "icon が null の人が1人もいない",
    people.every((p) => typeof p.icon === "string" && p.icon),
    JSON.stringify(people),
  );
  check(
    "絵を引くのは1回だけ（日が何日あっても2往復）",
    Array.isArray(asked) && asked.length === all.length,
    `${asked && asked.length}`,
  );
}

console.log("\n# 5. 絵で絞ってから60人で切る（切ってから絞らない）");
{
  /* **絵のある人を、わざと61人目以降に置く。** 先に60人で切ってから
     絵で絞る形だと、ここで0人になる（それが直す前の振る舞い）。 */
  const all = [];
  for (let i = 0; i < 200; i++) all.push(ch(i));
  const have = all.slice(100, 161); // 61人。どれも60番より後ろにいる
  let asked = null;
  const f = makeListPhotoDays({
    photos: [
      {id: "p1", day: "2026-09-13", url: "https://x/p1.webp", w: 1, h: 1, at: 1},
    ],
    channelsOfDay: async () => all,
    iconsOf: async (ids) => {
      asked = ids;
      return new Map(have.map((c, i) => [c, `chr-${i}`]));
    },
  });
  const people = (await f())[0].people;
  check(
    "60人で止まる",
    people.length === 60,
    `${people.length}人`,
  );
  check(
    "出ているのは絵のある人（60番より後ろにいた人）",
    JSON.stringify(people.map((p) => p.channelId)) ===
      JSON.stringify(have.slice(0, 60)),
    JSON.stringify(people.slice(0, 3).map((p) => p.channelId)),
  );
  check(
    "61人目は切られている",
    !people.some((p) => p.channelId === have[60]),
  );
  check(
    "絵を引きに行くのは、切る前の200人ぶん",
    asked.length === 200,
    `${asked.length}人`,
  );
}

console.log("\n# 6. 日が何日あっても、絵を引くのは1回・重複なし");
{
  let calls = 0;
  let asked = null;
  const f = makeListPhotoDays({
    photos: [
      {id: "p1", day: "2026-09-13", url: "https://x/1.webp", w: 1, h: 1, at: 3},
      {id: "p2", day: "2026-09-12", url: "https://x/2.webp", w: 1, h: 1, at: 2},
      {id: "p3", day: "2026-09-11", url: "https://x/3.webp", w: 1, h: 1, at: 1},
    ],
    // 3日とも同じ2人（常連）。重複を落として渡していれば2人で足りる
    channelsOfDay: async () => [ch(1), ch(2)],
    iconsOf: async (ids) => {
      calls += 1;
      asked = ids;
      return new Map([[ch(1), "chr-1"], [ch(2), "chr-2"]]);
    },
  });
  const days = await f();
  check("新しい日が先", days.map((d) => d.day).join(),
    "2026-09-13,2026-09-12,2026-09-11");
  check("絵を引いたのは1回", calls === 1, `${calls}回`);
  check(
    "渡したのは重複を落とした2人（6人ぶん渡していない）",
    asked.length === 2,
    `${asked.length}人`,
  );
  check("3日とも2人ずつ出る", days.every((d) => d.people.length === 2));
}

console.log("\n# 7. 名前は、出してよいと言った人だけ（変えていないこと）");
{
  const f = makeListPhotoDays({
    photos: [
      {id: "p1", day: "2026-09-13", url: "https://x/1.webp", w: 1, h: 1, at: 1},
    ],
    channelsOfDay: async () => [ch(1), ch(2)],
    iconsOf: async () => new Map([[ch(1), "chr-1"], [ch(2), "chr-2"]]),
    residents: [{channelId: ch(1), name: "さくら"}],
  });
  const people = (await f())[0].people;
  check("名乗った人には名前が付く", people[0].name === "さくら", people[0].name);
  check("名乗っていない人は null", people[1].name === null, `${people[1].name}`);
  check("絵はどちらにも出る", people.every((p) => p.icon));
}

/* ---------------- 8〜11. 日数が増えても、どの日も候補を出せる ----------------

   `iconsOf` は渡された候補を**前から**上限で切る。前は日ごとの候補を全部
   つないで渡していたので、**前の日が上限を使い切ると後ろの日が0人**になった。
   絵の無い人は返さない作りなので、出方は「絵が出ない」ではなく「日が消える」。

   ここの確かめは、**切るところを写さずに本物から借りる。** 写しを置くと、
   `cards.ts` を直しても確かめが古いまま通る（#19）。 */

/** 本物の `iconsOf` の、候補を切るところだけを借りる。 */
const capSrc = cut(
  "cards.js",
  "async function iconsOf(",
  "    const out = new Map();",
  ["new Set(channelIds"],
);
const cardsJs = readFileSync(join(FUNCTIONS, "lib/cards.js"), "utf8");
const MAX_CARDS = Number((/const MAX_CARDS = (\d+)/.exec(cardsJs) ?? [])[1]);
/** `(channelIds, limit) => 実際に引きに行く ID` 。本物と同じ切り方。 */
const iconIds = new Function(
  "MAX_CARDS",
  `${capSrc}\n  return ids;\n}\nreturn iconsOf;`,
)(MAX_CARDS);

/**
 * 本物と同じ切り方をする `iconsOf` の代わり。
 * @param {Set<string>} have 絵を持っている人
 * @param {object} spy 呼ばれた回数と、渡された候補を控える先
 * @return {Function} `iconsOf` の代わり
 */
function fakeIconsOf(have, spy) {
  return async (channelIds, limit) => {
    const ids = await iconIds(channelIds, limit);
    spy.calls += 1;
    spy.asked = ids;
    return new Map(
      ids.filter((c) => have.has(c)).map((c) => [c, `chr-${c.slice(-6)}`]),
    );
  };
}

/** 2026-08-01 から数えた日。30日まで使う。 */
const dayOf = (i) => `2026-08-${String(i + 1).padStart(2, "0")}`;

/**
 * 「n日 × m人（全員ちがう人・全員に絵がある）」を仕込んで回す。
 * @param {number[]} sizes 日ごとの人数（先頭が新しい日）
 * @param {object} spy 控える先
 * @return {Promise<object[]>} 返ってきた日ごとの中身
 */
async function runDays(sizes, spy) {
  const byDay = new Map();
  let n = 0;
  sizes.forEach((size, i) => {
    const list = [];
    for (let k = 0; k < size; k++) list.push(ch(1000 + n++));
    byDay.set(dayOf(sizes.length - 1 - i), list);
  });
  const have = new Set([...byDay.values()].flat());
  const f = makeListPhotoDays({
    photos: sizes.map((_, i) => ({
      id: `p${i}`,
      day: dayOf(sizes.length - 1 - i),
      url: `https://x/${i}.webp`,
      w: 1,
      h: 1,
      at: sizes.length - i,
    })),
    channelsOfDay: async (_events, day) => byDay.get(day) ?? [],
    iconsOf: fakeIconsOf(have, spy),
  });
  return f();
}

console.log("\n# 8. 本物の iconsOf が、呼ぶ側の上限を受け取る");
{
  const many = [];
  for (let i = 0; i < MAX_CARDS + 100; i++) many.push(ch(i));
  check(`lib の MAX_CARDS が読めた`, MAX_CARDS > 0, `${MAX_CARDS}`);
  check(
    "上限を渡さなければ MAX_CARDS で切る（/cards はそのまま）",
    (await iconIds(many)).length === MAX_CARDS,
    `${(await iconIds(many)).length}人`,
  );
  check(
    "渡した上限で切る（受け取れないと、後ろの日が押し出される）",
    (await iconIds(many, MAX_CARDS + 100)).length === MAX_CARDS + 100,
    `${(await iconIds(many, MAX_CARDS + 100)).length}人`,
  );
}

console.log("\n# 9. 20日 × 40人（のべ800人）— **0人になる日が無い**");
{
  const spy = {calls: 0, asked: null};
  const days = await runDays(Array(20).fill(40), spy);
  check("日は20日", days.length === 20, `${days.length}日`);
  const empty = days.filter((d) => d.people.length === 0).map((d) => d.day);
  check(
    "0人の日が1日も無い",
    empty.length === 0,
    `空の日 ${empty.length}日: ${JSON.stringify(empty)}`,
  );
  check(
    "どの日も40人そろっている",
    days.every((d) => d.people.length === 40),
    JSON.stringify(days.map((d) => d.people.length)),
  );
  check(
    "いちばん古い日も、いちばん新しい日と同じ人数",
    days[0].people.length === days[19].people.length,
    `${days[0].people.length} / ${days[19].people.length}`,
  );
}

console.log("\n# 10. 混んでいる日が、ほかの日の枠を食わない");
{
  /* **上限が効く大きさで比べる。** 30日 × 60人（のべ1800人）は
     `ICON_LOOKUP` を超えるので、ここで日ごとの配り方の違いが出る。 */
  const flat = await runDays(Array(30).fill(60), {calls: 0});
  const busy = await runDays([100, ...Array(29).fill(60)], {calls: 0});
  const rest = (x) => x.slice(1).map((d) => d.people.length);
  const at = rest(flat).findIndex((n, i) => n !== rest(busy)[i]);
  check(
    "1日目が100人でも、2日目以降の人数が1人も変わらない",
    at < 0,
    `${at + 2}日目で ${rest(flat)[at]}人 → ${rest(busy)[at]}人 に変わった`,
  );
  check(
    "どちらも0人の日が無い",
    flat.every((d) => d.people.length > 0) &&
      busy.every((d) => d.people.length > 0),
    `${flat.filter((d) => !d.people.length).length} / ` +
      `${busy.filter((d) => !d.people.length).length}日が空`,
  );
}

console.log("\n# 11. 引きに行く回数は、日数に比例しない");
{
  const four = {calls: 0, asked: null};
  await runDays(Array(4).fill(40), four);
  const twenty = {calls: 0, asked: null};
  await runDays(Array(20).fill(40), twenty);
  check(
    "4日でも20日でも、iconsOf は1回だけ",
    four.calls === 1 && twenty.calls === 1,
    `4日 ${four.calls}回 / 20日 ${twenty.calls}回`,
  );
  check(
    "渡す候補に重複が無い",
    new Set(twenty.asked).size === twenty.asked.length,
    `${twenty.asked.length}人 / 重複を落として ${new Set(twenty.asked).size}人`,
  );
}

console.log("\n# 12. 日が増えても、既存の決めは変わっていない");
{
  /* 1日だけ。**絵のある人を60人より後ろに置く**（#5 と同じ形だが、
     こちらは本物の切り方を通す）。 */
  const all = [];
  for (let i = 0; i < 300; i++) all.push(ch(5000 + i));
  const have = new Set(all.slice(100, 200)); // 100人。どれも60番より後ろ
  const spy = {calls: 0, asked: null};
  const f = makeListPhotoDays({
    photos: [
      {id: "p1", day: "2026-09-13", url: "https://x/p.webp", w: 1, h: 1, at: 1},
    ],
    channelsOfDay: async () => all,
    iconsOf: fakeIconsOf(have, spy),
  });
  const people = (await f())[0].people;
  check("絵で絞ってから60人で切っている", people.length === 60, `${people.length}人`);
  check(
    "出ているのは絵のある人だけ（絵の無い人は1人も返らない）",
    people.every((p) => have.has(p.channelId) && p.icon),
    JSON.stringify(people.slice(0, 2)),
  );
  check(
    "並びは元の順のまま",
    JSON.stringify(people.map((p) => p.channelId)) ===
      JSON.stringify(all.slice(100, 160)),
    JSON.stringify(people.slice(0, 2).map((p) => p.channelId)),
  );
}

console.log("");
if (bad > 0) {
  console.log(`NG が ${bad} 件。`);
  process.exit(1);
}
console.log("ぜんぶ通った。");
