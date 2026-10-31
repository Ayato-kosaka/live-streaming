/**
 * `nospec.mjs` の**判定そのもの**を、書き出しも無しで確かめる。
 *
 *     node tools/sprites/nospec_selftest.mjs
 *
 * 終了コード 0=ぜんぶ通った / 1=落ちた / 2=数えるものが無い。
 *
 * ## なぜ、道具の中の対照と別に要るのか
 *
 * `nospec.mjs` は回るたびに自分で対照を5つ通すが、**書き出し
 * （`site/.next-*`）が要る**ので、回っているのは `browserwatch` の job だけ。
 * あの job は 10〜35分かかるので、落ちる場所としては遅い。
 *
 * そして腐るのは**判定の側**になる。言い回しの表は1文字直せば黙って穴が開き、
 * 穴が開いても出るのは「0件」で、**0件はいちばん合格に見える**
 * （`docs/island-standards.md` §15）。だから判定だけを切り出して毎 PR で回す。
 *
 * `python/selftest_runner.py` が `tools/sprites/*_selftest.mjs` を拾うので、
 * ここに置いたぶんは**何も書き足さなくても** `pull_request` で走る。
 * **`playwright-core` を import しないこと**が、ここに置ける条件
 * （`nospec.mjs` はブラウザを使わないので、そもそも読まない）。
 *
 * ## 何を見るか
 *
 * 1. **拾わなければいけない字**（2026-10-14 に本番へ出ていた5件を含む）
 * 2. **拾ってはいけない字**（押したら何が起きるか・その人に何が起きるか・旅先の話）
 * 3. **焼いた HTML の読み方**——`<script>` を落とすこと、読み上げ用の字を拾うこと、
 *    段をまたいで1文に繋がないこと
 * 4. **終了コード**——0件と「見ていない」を混ぜないこと（§15）
 * 5. **外してある面に、理由が書いてあること**（黙って落とす面を作れない）
 * 6. **`BREAK=` の足が、ほんとうに1本ずつ折れること**（#128 の決めごと1）。
 *    子として起こして、外した状態で**対照が落ちる**ことまで見る。
 *    ここが無いと、「対照が5つとも通った」は
 *    **`BREAK=` が何も外していないとき**にも出る
 *
 * ## 壊した写しで落ちること
 *
 *     BREAK=nopat node tools/sprites/nospec_selftest.mjs      # 1 で落ちる
 *     BREAK=greedy node tools/sprites/nospec_selftest.mjs     # 1 で落ちる
 *     BREAK=noscript node tools/sprites/nospec_selftest.mjs   # 1 で落ちる
 *     BREAK=zerook node tools/sprites/nospec_selftest.mjs     # 1 で落ちる
 *     BREAK=nomap node tools/sprites/nospec_selftest.mjs      # 1 で落ちる
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { FAMILIES, SKIP, controls, judge, textOf, verdict } from "./nospec.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
let OK = 0;
let BAD = 0;
/** 数えたものの総数。**1つも無ければ 2 で落ちる**（§15） */
let SEEN = 0;

function check(name, ok, got) {
  SEEN++;
  if (ok) {
    OK++;
    return;
  }
  BAD++;
  console.log(`  ✕ ${name}${got === undefined ? "" : `  出た: ${got}`}`);
}

/* ------------------------------------------- 1. 拾わなければいけない字 -- */

/** [字, なぜ仕様の説明なのか]。**理由を言えないものは置かない** */
const MUST = [
  [
    "いまいる国と、あやとの島だより。配信のある日は、22時までの残りもここに出る。",
    "どういう日に何が出るかの決めごと。2026-10-14 まで `/now` に出ていた",
  ],
  [
    "旅の章ごとに、島が1つ建っています。",
    "何を1つの島にまとめているかの決めごと。`/atlas` に出ていた",
  ],
  [
    "島のみんなの絵が、作った順に並んでいる",
    "並べ方の決めごと。`/goods` に出ていた",
  ],
  [
    "日にちが決まったらこの面のいちばん上に出る",
    "並べ方の決めごと。`/next` に出ていた",
  ],
  [
    "島を歩いているのが、この人たち。よく来てくれた人ほど、島にいる日が多い。",
    "何順で日数を出しているかの決めごと。島の「この島にいた人」に出ていた",
  ],
  [
    "名前が出ているのは、島に名前を出してよいと言ってくれた人です",
    "あやとに名指しで言われた字そのもの（`docs/island-misses.md` の決めごと7）",
  ],
  ["保存しました。島に反映されます。", "どこへ入っていくかは中の話"],
  ["毎晩ひとりでに焼き直しています", "いつ入れ替わるかは中の話"],
  ["新しい順に並べました。", "並べ方の決めごと"],
  ["付箋は10件までです。", "どこで切っているかの決めごと"],
  ["30日以内のものだけ並びます。", "どこで切っているかの決めごと"],
  ["ログインした場合のみ、島の上に名札が出ます", "出す条件そのもの"],
  ["直近5件だけ出しています", "どこで切っているかの決めごと"],
  ["いちどに20件まで読みこみます", "どこで切っているかの決めごと"],
  ["この一覧は自動で更新されます", "いつ入れ替わるかは中の話"],
  ["名前は localStorage に覚えています", "中の名前をそのまま出している"],
];

/* ------------------------------------------- 2. 拾ってはいけない字 -- */

/**
 * [字, なぜ出してよいのか]。
 *
 * **ここが緩むと件数だけ増えて、誰にも読まれない道具になる。**
 * 囮はこの島に実際に書いてある字から取ってある。
 */
const MUSTNOT = [
  ["ピンを押すと、その国のことが出てくる。", "押したら何が起きるか。読む人のすること"],
  [
    "あやとが、ひとりずつ描いています。あなたの絵ができた日に、それまでのカードもまとめて出てきます。",
    "その人の持ちものに何が起きるか",
  ],
  ["まだ1枚もありません。配信のあった日の写真が、ここに並びます。", "0枚の紙。何が起きるかだけ言っている"],
  ["毎晩22時、世界のどこかから生放送", "配信の時刻。島の決めごとではなく、人の予定"],
  ["5-9月は毎日ツアー、冬季は要予約。ファールンからバス", "旅先の話。主語がこちらの画面ではない"],
  ["劇場内部は夏のガイドツアーのみ入場可", "旅先の話"],
  ["北欧4カ国はキャッシュレスが徹底していて、現金お断りのバスも珍しくありません。", "旅先の話。「キャッシュ」で拾わない"],
  ["クラクフ ヨーロッパ最大級の中世の広場 6件", "旅先の話。「最大」で拾わない"],
  ["飛行機 クタイシ発の1本だけ", "地図の凡例。「1本だけ」で拾わない"],
  [
    "任意の180日間のうち滞在は合計90日までで、国ごとではなく領域全体で合算されます。",
    "シェンゲンの決まり。こちらの画面の決めごとではない",
  ],
  ["むちゃなものほど、だいたい通る。書いたことが、ほんとうに配信になる。", "これから何が起きるか"],
  ["矢印でとなりの島へ。島を押すと、その島に渡れるよ。", "この画面の遊びかた"],
  ["押したところまで歩いていくよ。建物に近づくと、中が見られる", "この画面の遊びかた"],
  ["絵を貼るのは、ログインしてから。字だけなら、そのまま貼れるよ。", "これから何をするか"],
  ["18万を超える湖が散らばるフィンランド。最大のサイマー湖は水の迷路。", "旅先の話"],
  ["スタンプを押すと、企画会議から食べるまでの3日ぶんが出てくる。", "押したら何が起きるか"],
];

console.log("── 1. 拾わなければいけない字");
for (const [line, why] of MUST) {
  const j = judge(line);
  check(`拾えなかった「${line}」（${why}）`, j.hit, j.hit ? undefined : "拾わなかった");
}

console.log("── 2. 拾ってはいけない字");
for (const [line, why] of MUSTNOT) {
  const j = judge(line);
  check(`拾ってしまった「${line}」（${why}）`, !j.hit, j.hit ? `族「${j.why}」で拾った` : undefined);
}

/* ------------------------------------- 3. 焼いた HTML の読み方 -- */

console.log("── 3. 焼いた HTML の読み方");
{
  /* **`<script>` を落とすこと。** Next は焼いた字をまるごとそこへ積む。
     落とさないと、同じ字を二度数えるうえ、消したはずの字が残って見える */
  const html =
    `<!doctype html><body><p>ふつうの字。</p>`
    + `<script>self.__next_f.push([1,"付箋は10件までです。"])</script></body>`;
  const got = textOf(html);
  check("script の中の字を数えてしまった", !got.some((t) => t.includes("10件まで")), got.join(" | "));
  check("本文の字が取れなかった", got.some((t) => t.includes("ふつうの字")), got.join(" | "));
}
{
  /* 読み上げにしか出ない字も見る。**目に見えなくても、仕様の説明は仕様の説明** */
  const got = textOf(`<!doctype html><body><img src="x.png" alt="直近5件だけ出している図"></body>`);
  check("alt の字を拾えなかった", got.some((t) => t === "直近5件だけ出している図"), got.join(" | "));
}
{
  /* 分かち合ったときに出る字。面の中には出ないが、検索の結果にはそのまま出る */
  const got = textOf(
    `<!doctype html><html><head><meta name="description" content="新しい順に並べました。"/>`
    + `</head><body><p>ふつう</p></body></html>`,
  );
  check("meta の description を拾えなかった", got.some((t) => t === "新しい順に並べました。"), got.join(" | "));
}
{
  /* `content` を持たない meta で落ちないこと */
  const got = textOf(`<!doctype html><html><head><meta charset="utf-8"/></head><body><p>ふつう</p></body></html>`);
  check("meta で落ちた", got.some((t) => t === "ふつう"), got.join(" | "));
}
{
  /* **段をまたいで1文に繋がないこと。** 繋ぐと、隣どうしの無関係な字から
     「〜すると、ここに出る」が勝手にできあがる */
  const got = textOf(`<!doctype html><body><p>日にちが決まったら</p><p>ここに出る</p></body>`);
  check(
    "段をまたいで1文に繋いだ",
    !got.some((t) => t.includes("決まったら") && t.includes("ここに出る")),
    got.join(" | "),
  );
}
{
  /* 逆に、**1つの段の中は繋ぐこと。** `<b>` で割れた数字が落ちると、
     「付箋は10件までです」が「付箋は」「10」「件までです」になって当たらない */
  const got = textOf(`<!doctype html><body><p>付箋は<b>10</b>件までです。</p></body>`);
  check("段の中の `<b>` で割ってしまった", got.some((t) => t === "付箋は10件までです。"), got.join(" | "));
}
{
  /* 実体参照を戻すこと。戻さないと `&nbsp;` 入りの字がどの族にも当たらない */
  const got = textOf(`<!doctype html><body><p>付箋は&nbsp;10&nbsp;件までです。</p></body>`);
  check("実体参照を戻していない", got.some((t) => t === "付箋は 10 件までです。"), got.join(" | "));
}

/* ------------------------------------------- 4. 終了コード -- */

console.log("── 4. 終了コード");
check("1面も読めなかったのに 2 で落ちない", verdict({ seen: 0, texts: 0, hits: 0, mapShort: false }) === 2);
check("字を1つも拾えなかったのに 2 で落ちない", verdict({ seen: 9, texts: 0, hits: 0, mapShort: false }) === 2);
check("分母が足りないのに 2 で落ちない", verdict({ seen: 9, texts: 99, hits: 0, mapShort: true }) === 2);
check("当たりが在るのに 1 にならない", verdict({ seen: 9, texts: 99, hits: 3, mapShort: false }) === 1);
check("ぜんぶ通ったのに 0 にならない", verdict({ seen: 9, texts: 99, hits: 0, mapShort: false }) === 0);

/* --------------------------------- 5. 外す面には、理由が書いてあるか -- */

console.log("── 5. 外してある面");
check("外してある面が1つも無い", SKIP.length > 0, String(SKIP.length));
for (const s of SKIP) {
  check(`${s.path} の理由が短すぎる（12文字以上）`, (s.why || "").length >= 12, `${(s.why || "").length}文字`);
}
check("族が1つも無い", FAMILIES.length > 0, String(FAMILIES.length));

/* ------------------------------------------- 6. 対照と、BREAK= の足 -- */

console.log("── 6. 対照と、わざと壊したとき");
{
  const { ok, rows } = controls();
  check("道具の中の対照が、素のままで通らない", ok, rows.filter((r) => !r.ok).map((r) => r.name).join(" / "));
  check("対照が5つより少ない", rows.length >= 5, String(rows.length));
}

/**
 * `BREAK=` を1本ずつ当てて、**対照が落ちること**を子で確かめる。
 *
 * 子を起こすのは、`BREAK` が**読み込みのときに決まる**から
 * （この走りの中では変えられない）。
 */
function drill(name) {
  const code =
    "import { controls } from './nospec.mjs';"
    + "const { ok } = controls(); process.exit(ok ? 0 : 1);";
  try {
    execFileSync(process.execPath, ["--input-type=module", "-e", code], {
      cwd: HERE,
      env: { ...process.env, BREAK: name },
      stdio: ["ignore", "pipe", "pipe"],
    });
    return "通ってしまった";
  } catch (e) {
    return e.status === 1 ? "落ちた" : `別の終わり方（${e.status}）`;
  }
}
for (const name of ["nopat", "greedy", "noscript"]) {
  check(`BREAK=${name} で対照が落ちない`, drill(name) === "落ちた", drill(name));
}
/* `zerook` と `nomap` は終了コードの足なので、対照の表のほうで見る
   （`controls()` が `verdict` を呼んでいる） */
for (const name of ["zerook", "nomap"]) {
  check(`BREAK=${name} で対照が落ちない`, drill(name) === "落ちた", drill(name));
}

console.log(`\n対照 ${SEEN}件中 ${OK}件通った`);
if (SEEN === 0) {
  console.log("::error::対照が0件です");
  process.exit(2);
}
process.exit(BAD ? 1 : 0);
