/**
 * `collectLiveChat` が「どれを溜めて、どれを捨てるか」を確かめる。
 *
 *   cd functions && npm run build && node tools/keepcheck.mjs
 *
 * ## なぜ要るか
 *
 * この判定は**配信中にしか通らない道**の中にある。YouTube の
 * `liveChat/messages` は配信していないと1件も返さないので、本番で
 * 「無言のスパチャが溜まるか」を見られるのは、次にあやとが配信して、
 * しかも誰かが無言で投げてくれたときだけ。**待っていると、直したかどうかが
 * 分からないまま次の配信を迎える。**
 *
 * だから判定だけを取り出して（`keep` / `body` / `money`）、ここで回す。
 *
 * ## 中身は作り話ではない
 *
 * 並べてある1件1件は、**BigQuery の `youtube_chat.chat_messages` に実際に
 * 入っている行から起こしてある**（`kind` は yt-dlp の renderer 名を
 * Data API の `snippet.type` に読み替えたもの。1対1で対応する）。
 * 額も、本文の有無も、実際に起きたとおり。
 */

import {body, keep, money} from "../lib/chatCapture.js";

/** [名前, snippet.type, 本文, 溜めるか] */
const CASES = [
  // 2026-09-11 lzJshROVAl4 / 2026-09-12 hrXYXcu9IDE・Mzf_LgF6Cxc の3件。
  // どれも ¥500 だけで、本人は何も書いていない。
  // **いまは YouTube が金額入りの1文を組み立てて返すので落ちていない。**
  // その1文を取らなくなった以上（`body`）、ここが残す側でないと消える
  ["無言のスパチャ", "superChatEvent", "", true],
  // 2026-09-11 kyzCpe5Znyk の4件はどれも本文つき
  ["本文つきのスパチャ", "superChatEvent", "ありがとう", true],
  // BigQuery では UNKNOWN に落ちている 15件（liveChatPaidStickerRenderer）。
  // 絵を投げるものなので、本文は**最初から**無い
  ["スーパーステッカー", "superStickerEvent", "", true],
  // メンバーシップも本文を持たないことがある
  ["メンバーシップ", "newSponsorEvent", "", true],
  ["メンバーシップ（何ヶ月）", "memberMilestoneChatEvent", "", true],
  // ふつうのコメント。空は今までどおり捨てる（出すものが何も無い）
  ["ふつうのコメント", "textMessageEvent", "こんばんは", true],
  ["ふつうのコメント（空）", "textMessageEvent", "", false],
  // 空白だけのコメントは**前から溜まっていた。** 直すのは投げ銭の話なので、
  // ここを一緒に変えない（変えると前後の件数が突き合わせられなくなる）
  ["ふつうのコメント（空白だけ）", "textMessageEvent", "   ", true],
  // 種別を名乗らないうえに本文も無い。残しても誰の何なのか分からない
  ["種別も本文も無い", "", "", false],
  // 人の応援ではないもの
  ["配信の終わり", "chatEndedEvent", "", false],
  ["消された発言", "messageDeletedEvent", "", false],
  // 知らない種別は**残す側へ倒す**（一覧で拾うと、増えたとき黙って落ちる）
  ["まだ知らない種別", "somethingNewEvent", "", true],
];

let bad = 0;
for (const [name, kind, text, want] of CASES) {
  const got = keep(kind, text);
  const ok = got === want;
  if (!ok) bad++;
  console.log(
    `${ok ? "  " : "NG"} ${got ? "溜める" : "捨てる"}  ${name}`,
  );
}

/* 額。**本文が空のときは、これがその人の残したものの全部。** */
const MONEY = [
  [
    "スパチャ ¥500（無言）",
    {superChatDetails: {
      amountDisplayString: "¥500", amountMicros: "500000000", currency: "JPY",
    }},
    {amount: "¥500", amountMicros: 500000000, currency: "JPY"},
  ],
  [
    "ステッカー ¥200",
    {superStickerDetails: {
      amountDisplayString: "¥200", amountMicros: "200000000", currency: "JPY",
    }},
    {amount: "¥200", amountMicros: 200000000, currency: "JPY"},
  ],
  // 額の無いものに空の欄を作らない（Firestore に undefined は書けない）
  ["ふつうのコメント", {}, {}],
];

for (const [name, snippet, want] of MONEY) {
  const got = money(snippet);
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`${ok ? "  " : "NG"} ${JSON.stringify(got)}  ${name}`);
}

/* 溜める本文。**投げ銭は、YouTube が組み立てた1文ではなく本人の言葉。**
   本番の3件は、BigQuery 側 0文字・Firestore 側 15文字（金額入り）だった。 */
const BODY = [
  [
    "無言のスパチャ（組み立てた1文が来る）",
    {displayMessage: "¥500 のスーパーチャット", superChatDetails: {
      amountDisplayString: "¥500", userComment: "",
    }},
    "",
  ],
  [
    "本文つきのスパチャ",
    {displayMessage: "¥320 のスーパーチャット: ありがとう", superChatDetails: {
      amountDisplayString: "¥320", userComment: "ありがとう",
    }},
    "ありがとう",
  ],
  ["ふつうのコメント", {displayMessage: "こんばんは"}, "こんばんは"],
];

for (const [name, snippet, want] of BODY) {
  const got = body(snippet, String(snippet.displayMessage ?? ""));
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? "  " : "NG"} ${got.length}文字  ${name}`);
}

if (bad) {
  console.error(`\n${bad}件 合っていない`);
  process.exit(1);
}
console.log(`\n${CASES.length + MONEY.length + BODY.length}件とも合っている`);
