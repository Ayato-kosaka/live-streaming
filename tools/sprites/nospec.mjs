/**
 * **画面に、システムの仕様を説明している字が無いか**を数える。
 *
 *   tools/build.sh 3204
 *   DIST=site/.next-3204 node tools/sprites/nospec.mjs
 *
 *   ONLY=/now.html …       # 面を1枚だけ
 *   SHOWALL=1 …            # 当たらなかった字も、族ごとの数だけ出す
 *   BREAK=nopat …          # わざと壊す（対照が落ちて 2 になる）
 *
 * 終了コード 0=無い / 1=在った / 2=数えられなかった。
 *
 * ## なぜ要るか
 *
 * `CLAUDE.md`（と `docs/island-misses.md` の決めごと7）:
 *
 * > 画面で、システムの仕様を説明しない。書いてよいのは**その人がこれから
 * > 何をするか／何が起きるか**だけ。「どういう条件でこう出しているか」は
 * > 中の話で、読む人には要らない。
 *
 * あやとに言われたのは1件（「名前が出ているのは、島に名前を出してよいと
 * 言ってくれた人です」）だが、**同じ形はあとから何度でも生える。**
 * 面を足すたびに「これだけ出しています」「毎晩入れ直ります」を書きたくなるので、
 * **人が覚えている決めごとではなく、機械が数える決めごとにする。**
 *
 * ## ブラウザを使わない
 *
 * 見るのは**焼いた HTML そのもの**（`site/.next-*` の中の `.html`）。
 * 書き出しさえ在れば 1秒かからない（141面で 0.4秒。2026-10-14 実測）ので、
 * 毎 PR で回せる。`preclaim.mjs` が「JS が動く前の字」を見るのと同じ山を、
 * 別の目で読んでいる。
 *
 * **JS が入ってから出る字（保存おわり・0件の紙・読めなかった顔）は、ここには
 * 出ない。** 焼いた HTML に無いものは、どう歩いても読めない。そこは人が読んで直す
 * （2026-10-14 にそうした。`docs/island-misses.md` #230）。ここが見るのは
 * **焼いた字**で、そこに生えたものを止めるのが仕事。
 *
 * ## 何を「仕様の説明」とみなすか
 *
 * **「こちらがどういう決めごとで出しているか」を書いている字**を拾う。
 * 4つの族で見る。族の名前が、そのまま「なぜ拾ったか」。
 *
 * 1. **入れ直しの話** … 毎晩／自動で／反映されます。いつ何が入れ替わるかは中の話
 * 2. **切り方の決めごと** … ◯件まで／上限／◯日以内。どこで切っているかは中の話
 * 3. **出す条件** … 「〜した人だけが出ます」「〜の場合のみ」。あやとに言われた形そのもの
 * 4. **並べ方の決めごと** … 「新しい順に並べました」。何順かは中の話
 *
 * **拾わないもの**（どれも「その人が何をするか／何が起きるか」）:
 *
 * - 押したら何が起きるか（「ピンを押すと、その国のことが出てくる」）
 * - その人の持ちものに何が起きるか（「あなたの絵ができた日に、まとめて出てきます」）
 * - 旅先の話（「夏季のみ営業」「毎日ツアー」）。**主語がこちらの画面ではない**
 *
 * 3つめが効くので、族の当たりは**主語がこちら側**であることを条件にしてある
 * （「ここに」「この面」「島に」「出る／並ぶ／載る／表示」と同じ文の中）。
 *
 * ## 測った数（2026-10-14。`site/.next-3204` / 137面 / 拾った字 23,679）
 *
 * | 族 | 当たり | 中身 |
 * | --- | ---: | --- |
 * | 入れ直しの話 | 0 | — |
 * | 切り方の決めごと | 0 | — |
 * | 出す条件 | 1 | `/privacy` の「〜場合のみ、島の上に…表示する」（外してある。下の `SKIP`） |
 * | 並べ方の決めごと | 1 | `/goods` の「作った順に並んでいる」 |
 * | 自分の面を名指しして出す | 3 | `/now`・`/next`・`/atlas` |
 *
 * **ここに今日の数を書き足さない**（`docs/island-standards.md` §15）。
 * 上の表は「作った日に、この表が何に当たったか」の記録。
 *
 * ## 数える前に対照を通す（`docs/island-standards.md` §15）
 *
 * 作り物の面を3枚その場で組んで、6つを見てから本物へ行く。
 *
 * | 対照 | 見るもの | 外すと |
 * | --- | --- | --- |
 * | 仕込み | わざと仕様の説明を置いた面を**拾える** | `BREAK=nopat` |
 * | ふつう | 説明の無い面を**拾わずにいられる** | `BREAK=greedy` |
 * | 台本 | `<script>` の中の字を**数えない**（Next は焼いた字を全部そこへ積む） | `BREAK=noscript` |
 * | 空 | **1面も読めなかったら 0 ではなく 2** | `BREAK=zerook` |
 * | 分母 | **sitemap より面が少なかったら 2**（歩き方が壊れている） | `BREAK=nomap` |
 * | 突き合わせ | 面がそろっていれば通り、足りなければ止まる（**両側から**） | `BREAK=nomap` |
 *
 * **1つでも外れたら、本物の面の数字を1つも出さずに 2 で落ちる。**
 *
 * 判定（`judge` / `textOf` / `verdict` / `mapGuard` / `controls`）は
 * `tools/sprites/nospec_selftest.mjs` が import して**毎 PR で**確かめる
 * （`python/selftest_runner.py` が `tools/sprites/*_selftest.mjs` を拾う）。
 * 道具そのものは書き出しが要るので、`.github/workflows/selftest.yml` の
 * `browserwatch`（すでに `next build` を通っている job）から回している。
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { htmlFiles, norm } from "./crawltargets.mjs";
import { fromRoot } from "./repo.mjs";

const DIST = fromRoot(process.env.DIST || "site/.next-verify");
const ONLY = (process.env.ONLY || "").split(",").filter(Boolean);
const SHOWALL = !!process.env.SHOWALL;
/** わざと壊す。`nopat` / `greedy` / `noscript` / `zerook` / `nomap` */
const BREAK = process.env.BREAK || "";

/* ------------------------------------------------------------ 外すもの -- */

/**
 * 数えない面と、その理由。**理由は12文字以上**（`islepages.mjs` の `SKIP` と同じ決め）。
 * 道具がこれを**印字する**ので、黙って落ちる面を作れない。
 */
export const SKIP = [
  {
    path: "/privacy",
    why:
      "プライバシーポリシー。Google の OAuth が「何を取得してどう使うか」を"
      + "書けと求めている面で、**仕組みを書くのが中身そのもの**。ここだけは"
      + "説明を消すと面が成り立たない（site/app/privacy/page.tsx）",
  },
  {
    path: "/design",
    why:
      "島のデザインの見本帳。どの印をどこで使うかを並べるための面で、"
      + "読むのは作る側だけ（sitemap にも出していない）。ここの説明は"
      + "視聴者さんに向けた字ではない",
  },
  {
    path: "/me/desk",
    why:
      "あやとの机。配信中に自分で押す道具が並んでいて、"
      + "どう動くかを知っているのが前提の面（視聴者さんは入れない）",
  },
  { path: "/me/remote", why: "同じくあやとの机の道具。配信に映す島を手元から動かす面" },
  { path: "/me/roulette", why: "同じくあやとの机の道具。配信のルーレットを回す面" },
  {
    path: "/roulette",
    why:
      "OBS に映す画面をそのまま写した面。読む人は居ない"
      + "（islepages.mjs も同じ理由で外している）",
  },
];

const SKIPPED = new Set(SKIP.map((s) => s.path));

/* ------------------------------------------------------------ 判定 -- */

/**
 * **主語がこちらの画面であること。**
 *
 * これが無いと、旅の話（「夏季のみ営業」「5-9月は毎日ツアー」）を全部拾う。
 * 実測で、これを外すと 137面で **300件以上**出た（ほとんどが北欧のしおり）。
 */
const MINE =
  "(?:ここ|この(?:面|紙|欄|一覧|並び|ページ)|島(?:に|の上に)|図鑑|付箋|カード|スタンプ|名札|一覧)";
/** こちらが「出している」ことを言う動詞 */
const SHOW = "(?:出(?:る|ます|します|てくる|てきます|ています)|並(?:ぶ|び|べ|ん)|載(?:る|せ|り)|表示|立ち|入り)";

/**
 * 1. **入れ直しの話。** いつ何が入れ替わるかは中の話。
 *
 * 「毎晩22時（＝配信の時刻）」と当たらないよう、**入れ直しを言う動詞と組で**拾う。
 */
const REFRESH = [
  `(?:毎(?:晩|日|週|月)|自動(?:で|的に)|ひとりでに|定期的に)[^。]{0,16}(?:更新|入れ直|焼き直|取り込|反映|集計|同期|数え直|作り直|配ら)`,
  `(?:反映|更新|集計|同期|再計算)(?:され|しま)(?:ます|る|ています|した)`,
  /* **中の名前をそのまま出している字。** 「キャッシュレス」（旅のしおりの現金の話）と
     当たらないよう、`キャッシュ` は単体で並べない——外した日に4件拾った */
  `(?:キャッシュ(?:され|に入|から読)|localStorage|Firebase|Firestore|BigQuery|エンドポイント|データベースに)`,
];

/** 2. **切り方の決めごと。** どこで切っているかは中の話 */
const LIMIT = [
  /* **`だけ` を入れない。** 地図の凡例（「飛行機 クタイシ発の1本だけ」）を拾う。
     切っているのはこちら、と読める `まで` だけにする */
  `[0-9０-９]+\\s*(?:件|枚|人|個|本|行)まで(?:です|。|$|、)`,
  /* **`最大` を単体で並べない。** 「ヨーロッパ最大級の中世の広場 6件」を拾う
     （外した日に3件）。言い切っている形だけ取る */
  `(?:最大で|上限は|上限が|いちどに|一度に)[^。]{0,8}[0-9０-９]+\\s*(?:件|枚|人|個|本|行)`,
  `[0-9０-９]+\\s*(?:日|週間|ヶ月|か月|年)以内(?:の|に[^。]{0,8}(?:もの|ぶん))`,
  `直近(?:の)?[0-9０-９]+`,
  `(?:新しいもの|古いもの)から[0-9０-９]+`,
];

/**
 * 3. **出す条件。** あやとに言われた形そのもの
 * （「名前が出ているのは、島に名前を出してよいと言ってくれた人です」）。
 */
const WHEN = [
  `(?:出ている|並んでいる|載っている|立っている)のは[^。]{0,30}(?:人|もの|ぶん|だけ)です`,
  `(?:人|もの|ぶん)(?:だけ|のみ)が[^。]{0,8}${SHOW}`,
  `場合(?:のみ|だけ)[^。]{0,16}${SHOW}`,
  `(?:ときだけ|場合だけ|ときのみ)[^。]{0,12}${SHOW}`,
  `(?:でないと|しないと|なければ)[^。]{0,10}${SHOW}(?:ませ|な[いく])`,
];

/** 4. **並べ方の決めごと。** 何順かは中の話 */
const ORDER = [
  `(?:新しい|古い|多い|少ない|作った|出した|押された|来た|日付|名前|五十音)順に[^。]{0,8}(?:並べ|並ん|並ぶ|出|載)`,
  `並び順`,
  `順に並べました`,
  /* **「◯な人ほど、〜が多い」も並べ方の決めごと。** 「よく来てくれた人ほど、
     島にいる日が多い」が島の「この島にいた人」に出ていた。順位とは書いていないが、
     **何で大小が決まるかを言っている**ので同じもの。旅先の話を拾わないよう、
     うしろにこちらの面（`MINE`）が来る形だけ取る */
  `ほど[^。]{0,8}${MINE}[^。]{0,12}(?:多い|長い|大きい|上|先)`,
];

/**
 * 5. **自分の面を名指しして、何がどういうときに出るかを言う。**
 *
 * 上の4つに当たらない言い方でも、**「こういう日は、ここにこれが出る」**は
 * 全部これ。`/now`・`/next`・`/atlas` で実際に出ていたのがこの形だった。
 */
const SELF = [
  // 「…のある日は、22時までの残りもここに出る」「…が決まったらこの面のいちばん上に出る」
  `(?:日は|ときは|たら|すると|になると)[^。]{0,24}${MINE}[^。]{0,12}${SHOW}`,
  // 「旅の章ごとに、島が1つ建っています」「1件につき1枚ずつ並びます」
  `(?:ごとに|につき|あたり)[^。]{0,16}[0-9０-９一二三四五六七八九十]+\\s*(?:つ|枚|件|人|本|個)[^。]{0,8}(?:建(?:ち|っ)|${SHOW})`,
];

/** 上から当てて、最初に当たった族の名前を付ける */
export const FAMILIES = [
  { name: "入れ直しの話", re: new RegExp(REFRESH.join("|")) },
  { name: "切り方の決めごと", re: new RegExp(LIMIT.join("|")) },
  { name: "出す条件", re: new RegExp(WHEN.join("|")) },
  { name: "並べ方の決めごと", re: new RegExp(ORDER.join("|")) },
  { name: "自分の面を名指しして出す", re: new RegExp(SELF.join("|")) },
];

/**
 * 1つの字のかたまりを判定する。
 *
 * @param {string} text 画面に出ている字（空白を1つに畳んだもの）
 * @returns {{hit: boolean, why: string}} `why` は当たった族の名前
 */
export function judge(text) {
  const t = String(text || "").trim();
  if (!t) return { hit: false, why: "" };
  // 壊しかた `nopat`: 判定を外す。**仕込みを拾えなくなる**
  if (BREAK === "nopat") return { hit: false, why: "" };
  // 壊しかた `greedy`: 何でも拾う。**ふつうの面まで拾うようになる**
  if (BREAK === "greedy") return { hit: true, why: "（壊しかた greedy）" };
  for (const f of FAMILIES) if (f.re.test(t)) return { hit: true, why: f.name };
  return { hit: false, why: "" };
}

/* ------------------------------------------------- 焼いた HTML を読む -- */

const ENT = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'",
  "&apos;": "'", "&nbsp;": " ", "&#x27;": "'", "&#x2F;": "/",
};

const unent = (s) =>
  String(s)
    .replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp|#x27|#x2F);/g, (m) => ENT[m] ?? m)
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));

/**
 * 焼いた HTML から、**画面に出ている字**を取り出す。
 *
 * **`<script>` を必ず落とす。** Next は焼いた字を `self.__next_f.push(...)` に
 * まるごと積むので、落とさないと**同じ字を2回数えるうえ、`\n` 入りの塊**になって
 * どの族にも当たらなくなる（`preclaim.mjs` が同じところで踏んでいる）。
 *
 * 読み上げにしか出ない字（`aria-label` / `title` / `alt` / `placeholder`）と、
 * **分かち合ったときに出る字**（`<meta name="description">` と og / twitter）も足す。
 * **目に見えない字でも、仕様の説明は仕様の説明。**
 *
 * @param {string} html
 * @returns {string[]} 字のかたまり
 */
export function textOf(html) {
  let s = String(html);
  // 壊しかた `noscript`: 台本を落とさない。**焼いた字を二度数える**
  if (BREAK !== "noscript") {
    s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ");
  }
  s = s
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const out = [];
  /* 読み上げ用の字。**タグを落とす前に**拾う */
  for (const m of s.matchAll(/\s(?:aria-label|title|alt|placeholder)="([^"]*)"/gi)) {
    const v = unent(m[1]).replace(/[\s　]+/g, " ").trim();
    if (v) out.push(v);
  }
  /* **分かち合ったときに出る字**（`<meta name="description">` と og / twitter）。
     面の中には出ないが、検索の結果にも LINE の吹き出しにも**そのまま出る。**
     実際に `/updates` の description が「新しい順に並べました」と言っていた。 */
  for (const m of s.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/(?:name|property)="[^"]*description"/i.test(tag)) continue;
    const c = /content="([^"]*)"/i.exec(tag);
    if (!c) continue;
    const v = unent(c[1]).replace(/[\s　]+/g, " ").trim();
    if (v) out.push(v);
  }
  /* 段の切れ目で割る。割らないと、隣の段の字が1文につながって
     「〜すると、ここに出る」が勝手にできあがる */
  s = s.replace(/<\/?(?:p|div|li|br|h[1-6]|section|tr|td|th|ul|ol|dl|dt|dd|main|header|footer|nav|article|aside|figure|figcaption|label|button|a|option)\b[^>]*>/gi, "\n");
  s = s.replace(/<[^>]+>/g, "");
  for (const line of unent(s).split("\n")) {
    const v = line.replace(/[\s　]+/g, " ").trim();
    if (v) out.push(v);
  }
  return out;
}

/* ---------------------------------------------------------- 対照 -- */

/** わざと仕様の説明を置いた面。**全部拾えないといけない** */
const PLANT = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>仕込み</title><meta name="description" content="島のできごとを、新しい順に並べました。"/></head>
<body><main><h1>仕込みの面</h1>
<p>毎晩ひとりでに数え直しています。</p>
<p>保存しました。島に反映されます。</p>
<p>付箋は10件までです。</p>
<p>30日以内のものだけ並びます。</p>
<p>名前が出ているのは、島に名前を出してよいと言ってくれた人です</p>
<p>ログインした場合のみ、島の上に名札が出ます</p>
<p>新しい順に並べました。</p>
<p>配信のある日は、22時までの残りもここに出る。</p>
<p>旅の章ごとに、島が1つ建っています。</p>
<img src="x.png" alt="直近5件だけ出している図">
</main></body></html>`;

/** 仕込みのうち、**拾えなければいけない**字 */
const PLANT_WANT = [
  "毎晩ひとりでに数え直しています。",
  "保存しました。島に反映されます。",
  "付箋は10件までです。",
  "30日以内のものだけ並びます。",
  "名前が出ているのは、島に名前を出してよいと言ってくれた人です",
  "ログインした場合のみ、島の上に名札が出ます",
  "新しい順に並べました。",
  "配信のある日は、22時までの残りもここに出る。",
  "旅の章ごとに、島が1つ建っています。",
  "直近5件だけ出している図",
  "島のできごとを、新しい順に並べました。",
];

/**
 * ふつうの面。**1件も拾ってはいけない。**
 *
 * 囮は、この島で実際に書いてある字から取ってある——押したら何が起きるか、
 * その人の持ちものに何が起きるか、そして**旅先の話**（主語がこちらではない）。
 */
const PLAIN = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>ふつう</title></head>
<body><main><h1>ふつうの面</h1>
<p>ピンを押すと、その国のことが出てくる。</p>
<p>あやとが、ひとりずつ描いています。あなたの絵ができた日に、それまでのカードもまとめて出てきます。</p>
<p>毎晩22時、世界のどこかから生放送。</p>
<p>5-9月は毎日ツアー、冬季は要予約。ファールンからバス</p>
<p>カフェは毎日9〜20時ごろ、エスプラナーディ公園から徒歩3分。</p>
<p>劇場内部は夏のガイドツアーのみ入場可</p>
<p>任意の180日間のうち滞在は合計90日までで、国ごとではなく領域全体で合算されます。</p>
<p>まだ1枚もありません。配信のあった日の写真が、ここに並びます。</p>
<p>むちゃなものほど、だいたい通る。書いたことが、ほんとうに配信になる。</p>
<p>18万を超える湖が散らばるフィンランド。最大のサイマー湖は水の迷路。</p>
<img src="x.png" alt="北欧最大級の遊園地">
</main></body></html>`;

/** 台本の中に字を積んだ面。**`<script>` を落とさないと、ここから拾ってしまう** */
const SCRIPTY = `<!doctype html><html lang="ja"><head><meta charset="utf-8"></head>
<body><main><h1>台本の面</h1><p>ふつうの字。</p></main>
<script>self.__next_f.push([1,"付箋は10件までです。新しい順に並べました。"])</script>
</body></html>`;

/**
 * 終了コードを決める1か所。**0件と「見ていない」を混ぜない**（§15）。
 *
 * @param {{seen: number, texts: number, hits: number, mapShort: boolean}} n
 */
export function verdict(n) {
  // 壊しかた `zerook`: 1面も読めなくても 0 を返す。**「見ていないから0件」が合格に化ける**
  if (BREAK === "zerook") return n.hits ? 1 : 0;
  if (n.seen === 0) return 2;
  if (n.texts === 0) return 2;
  if (n.mapShort) return 2;
  return n.hits ? 1 : 0;
}

/**
 * **歩いた面が、sitemap の名乗りに足りているか。**
 *
 * 足りていなければ歩き方が壊れている（置き場違い・書き出し途中）。
 * そのまま数えると「0件」が出て、それが合格に見える（§15）。
 *
 * @returns {{short: boolean, locs: number, why: string}}
 */
export function mapGuard(dist, pages) {
  // 壊しかた `nomap`: 分母を見ない。**半分しか書き出せていなくても素通りする**
  if (BREAK === "nomap") return { short: false, locs: 0, why: "" };
  let xml;
  try {
    xml = readFileSync(join(dist, "sitemap.xml"), "utf8");
  } catch {
    return { short: true, locs: 0, why: "sitemap.xml が読めない（書き出せていない）" };
  }
  const locs = new Set(
    [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) =>
      norm(m[1].replace(/^https?:\/\/[^/]+/, "") || "/"),
    ),
  );
  const here = new Set(pages.map(norm));
  const missing = [...locs].filter((l) => !here.has(l) && !SKIPPED.has(l));
  return {
    short: missing.length > 0,
    locs: locs.size,
    why: missing.length ? `sitemap に在って歩けなかった面: ${missing.slice(0, 5).join(" ")}` : "",
  };
}

/** 対照を6つ通す。**1つでも外れたら本物の面を1枚も数えない。** */
export function controls() {
  const rows = [];
  const add = (name, want, got) => rows.push({ name, want, got, ok: want === got });

  {
    const got = textOf(PLANT).filter((t) => judge(t).hit);
    const missed = PLANT_WANT.filter((w) => !got.some((g) => g === w));
    add(
      "仕込み（わざと仕様の説明を置いた面）",
      `${PLANT_WANT.length}件とも拾う`,
      missed.length ? `拾えなかった: ${missed.join(" / ")}` : `${PLANT_WANT.length}件とも拾う`,
    );
  }
  {
    const got = textOf(PLAIN).filter((t) => judge(t).hit);
    add("ふつう（説明の無い面）", "0件", got.length ? `${got.length}件 拾った: ${got.join(" / ")}` : "0件");
  }
  {
    const got = textOf(SCRIPTY).filter((t) => judge(t).hit);
    add("台本（script の中に字が積んである面）", "0件", got.length ? `${got.length}件 拾った: ${got.join(" / ")}` : "0件");
  }
  add(
    "1面も読めなかったとき",
    "2",
    String(verdict({ seen: 0, texts: 0, hits: 0, mapShort: false })),
  );
  add(
    "sitemap より面が少ないとき",
    "2",
    String(verdict({ seen: 9, texts: 99, hits: 0, mapShort: true })),
  );
  /* **分母の見張りそのものを、両側から当てる。**
     「足りなければ落ちる」だけでは対照にならない（足りているときに
     落ちないことも要る）。その場で偽の書き出しを1つ作って見る */
  {
    const dir = mkdtempSync(join(tmpdir(), "nospec-"));
    writeFileSync(
      join(dir, "sitemap.xml"),
      "<urlset><url><loc>https://x/a</loc></url><url><loc>https://x/b</loc></url></urlset>",
    );
    const full = mapGuard(dir, ["/a.html", "/b.html"]).short;
    const half = mapGuard(dir, ["/a.html"]).short;
    rmSync(dir, { recursive: true, force: true });
    add("sitemap と突き合わせる", "そろう=false / 足りない=true", `そろう=${full} / 足りない=${half}`);
  }

  return { ok: rows.every((r) => r.ok), rows };
}

/* ---------------------------------------------------------- 本体 -- */

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  if (!existsSync(DIST)) {
    console.log(`${DIST} が無い。先に \`tools/build.sh <ポート>\` で書き出してください。`);
    process.exit(2);
  }

  {
    const { ok, rows } = controls();
    console.log(`── 対照（${rows.length}つ）${BREAK ? `  BREAK=${BREAK}` : ""}`);
    for (const r of rows) {
      console.log(`  ${r.ok ? "○" : "×"} ${r.name}`);
      console.log(`      ほしい: ${r.want}`);
      console.log(`      出た  : ${r.got}`);
    }
    if (!ok) {
      console.log(`\n対照が ${rows.filter((x) => !x.ok).length}件 外れた。**面の数字は出さない。**`);
      process.exit(2);
    }
    console.log(`  対照 ${rows.length}件とも一致\n`);
  }

  const all = htmlFiles(DIST).sort();
  const pages = all.filter((p) => !SKIPPED.has(norm(p))).filter((p) => !ONLY.length || ONLY.includes(p));

  console.log(`── 数えない面（${SKIP.length}つ。理由つきで外してある）`);
  for (const s of SKIP) console.log(`  ${s.path} … ${s.why}`);
  console.log("");

  const map = mapGuard(DIST, all);
  if (map.short) {
    console.log(`── 分母が足りない: ${map.why}`);
    console.log("**数字は出さない。** 歩き方か書き出しが壊れている。");
    process.exit(2);
  }

  const byFamily = new Map(FAMILIES.map((f) => [f.name, 0]));
  const hits = [];
  let texts = 0;
  let seen = 0;
  for (const page of pages) {
    let html;
    try {
      html = readFileSync(join(DIST, page.replace(/^\//, "")), "utf8");
    } catch (e) {
      console.log(`  ${page}: 読めなかった（${String(e).slice(0, 50)}）`);
      continue;
    }
    seen += 1;
    const seenHere = new Set();
    for (const t of textOf(html)) {
      texts += 1;
      const j = judge(t);
      if (!j.hit) continue;
      byFamily.set(j.why, (byFamily.get(j.why) ?? 0) + 1);
      if (seenHere.has(t)) continue;
      seenHere.add(t);
      hits.push({ page: norm(page), why: j.why, text: t });
    }
  }

  console.log(`── 見た面 ${seen} / ${all.length}（sitemap の名乗り ${map.locs}）・拾った字 ${texts.toLocaleString()}`);
  if (SHOWALL || hits.length) {
    console.log("── 族ごとの当たり");
    for (const f of FAMILIES) console.log(`  ${String(byFamily.get(f.name) ?? 0).padStart(4)}  ${f.name}`);
  }

  if (hits.length) {
    console.log(`\n── 仕様の説明に見える字: ${hits.length}件`);
    for (const h of hits) {
      console.log(`  ${h.page}`);
      console.log(`      なぜ: ${h.why}`);
      console.log(`      字  : ${h.text.length > 120 ? `${h.text.slice(0, 120)}…` : h.text}`);
    }
    console.log(
      "\n直しかたは3つ。**消す**（たいていこれ）／**その人の言葉に書き直す**／"
      + "**画面のほうを直す**（説明しないと使えない画面は、画面が間違っている）。",
    );
  } else {
    console.log("\n仕様の説明に見える字は 0件。");
  }

  process.exit(verdict({ seen, texts, hits: hits.length, mapShort: map.short }));
}
