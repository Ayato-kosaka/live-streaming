/**
 * `lib/youtubeChat.ts` の確かめ。**読めなかった回を、黙って飲み込んでいないか。**
 *
 *     node site/selftest/chatdown_selftest.mjs
 *
 * ## なぜ要るか
 *
 * ルーレットのコントローラー（`/me/roulette`）は、**ログインしないと
 * 1行も描かない。** だからこの箱のブラウザでは開けず、「コメントが
 * 読めなかったとき、画面は何と言うか」を誰も見ないまま出せてしまう。
 *
 * 落ちたときに黙って次の周期を張り直すと、配信の最中に
 * **「まだ来ていません」＝「今夜は誰も注文していない」**と読める字が出る
 * （`docs/island-misses.md` #117、`docs/island-standards.md` 10）。
 * 画面まで届く合図は `onDown` の1本しかないので、ここが**その1本が
 * 本当に鳴るか**を見る。
 *
 * ## 何を見ているか
 *
 * 6通りの返事を YouTube の代わりに返して、`onDown` / `onLive` の鳴りかたを
 * 突き合わせる。**とくに 403 の割れかた**——チャットが閉じた 403 は
 * 「配信が終わった」、割り当てが尽きた 403 は「読めていない」。
 * ひとまとめにすると、こちらが読めない晩を「配信していません」と
 * 言い換えることになる。
 *
 * 終了コード: 0=通った / 1=食い違った / 2=数えるものが無い
 */
import { createRequire } from "module";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ts = require("typescript");

const src = join(here, "..", "lib", "youtubeChat.ts");
const code = ts.transpileModule(readFileSync(src, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

/* 島の口は呼ばない。**寿命の短いトークンを1つ返すだけの役** */
const stub = {
  getRouletteYtToken: async () => ({
    at: "fake", channel: "c", expiresAt: Date.now() + 3600_000,
  }),
};
const mod = { exports: {} };
new Function("exports", "require", "module", code)(
  mod.exports,
  (name) => (name === "@/lib/api" ? stub : require(name)),
  mod,
);
const { readLiveChatDirect } = mod.exports;
if (typeof readLiveChatDirect !== "function") {
  console.error("読むものが無い: lib/youtubeChat.ts から readLiveChatDirect が取れない");
  process.exit(2);
}

const res = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});
/* 配信を探すところは通す。見たいのは**メッセージを読む1回**の落ちかた */
const byUrl = (u, msg) =>
  u.includes("liveBroadcasts") ? res(200, { items: [{ id: "v1" }] }) :
  u.includes("videos") ?
    res(200, { items: [{ liveStreamingDetails: { activeLiveChatId: "c1" } }] }) :
    msg;

function run(answer) {
  return new Promise((done) => {
    const got = { down: [], live: [] };
    globalThis.fetch = async (url) => answer(String(url));
    const r = readLiveChatDirect({
      token: async () => "id-token",
      onLines: () => {},
      onLive: (v) => got.live.push(v),
      onDown: (v) => got.down.push(v),
      onGiveUp: (w) => got.down.push("giveup:" + w),
    });
    setTimeout(() => { r.stop(); done(got); }, 250);
  });
}

const CASES = [
  ["ふつうに読めた", (u) => byUrl(u, res(200, { items: [] })), [false], [true]],
  ["電波が切れた", () => { throw new TypeError("Failed to fetch"); }, [true], []],
  ["500 が返った", (u) => byUrl(u, res(500, { error: "boom" })), [true], []],
  ["403 チャットが閉じた",
    (u) => byUrl(u, res(403, { error: { errors: [{ reason: "liveChatEnded" }] } })),
    [false], [false]],
  ["403 割り当てが尽きた",
    (u) => byUrl(u, res(403, { error: { errors: [{ reason: "quotaExceeded" }] } })),
    [true], []],
  ["配信していない",
    (u) => (u.includes("liveBroadcasts") ? res(200, { items: [] }) : res(200, {})),
    [false], [false]],
];

let bad = 0;
for (const [name, answer, wantDown, wantLive] of CASES) {
  const got = await run(answer);
  const ok =
    JSON.stringify(got.down) === JSON.stringify(wantDown) &&
    JSON.stringify(got.live) === JSON.stringify(wantLive);
  if (!ok) bad += 1;
  console.log(
    `${ok ? "ok  " : "NG  "}${name.padEnd(12)} onDown=[${got.down}] onLive=[${got.live}]` +
      (ok ? "" : `  ← ほしいのは onDown=[${wantDown}] onLive=[${wantLive}]`),
  );
}
console.log(`\n${CASES.length}通りみて、食い違い ${bad}`);
process.exit(bad ? 1 : 0);
