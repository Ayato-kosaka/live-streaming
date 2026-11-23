/**
 * 豚の貯金箱を、画面から出し入れする口（#292 の「オーナー画面」のぶん）。
 *
 * ## なぜ要るか
 *
 * 台帳（`islandFundSuperChats` / `islandFundSpends` / `islandFundGoals`）に
 * 書ける道が、2026-09-24 の時点で**2つしか無かった。**
 *
 * | | 入る道 |
 * | --- | --- |
 * | 配信中のスパチャ | OBS が `POST /alertbox/{合言葉}/superchat`。翌晩 BigQuery が拾い直す |
 * | **出費** | GitHub Actions（`python/admin/fund_add.py`）**だけ** |
 * | **目標** | 同上 |
 *
 * 出費と目標は機械が知りようがないので、**人が入れないと永久に入らない。**
 * そして入れる道が Actions しか無いということは、**あやとが旅先のスマホで
 * 「今日の宿代」を入れられない**ということでもある。#292 に
 * 「オーナー画面は別担当」と書いてから、誰も作っていなかった。
 *
 * 見る道も同じで、**出費と目標はどこからも見られなかった。**
 * `/me/desk` の「スパチャ」はスパチャの控えしか出さない。
 *
 * ## いちばん大事なのは出費の一覧（#639）
 *
 * あやとの決め（2026-09-24）:
 *
 * > 財布は1つ。目標は「いつから・名前・目標額」のラベルでしかなく、
 * > 「0から貯め直す」は日付で切るのではなく、**前の目標のぶんを支出として
 * > 書くことで起きる。** じゃないと、もらったお金を何に使ったか管理が漏れる。
 *
 * つまり `islandFundSpends` は「もらったお金の行き先」の台帳そのもので、
 * 目標の切り替えもここに1行足すことで起きる。**貯め直すたびに行が増える。**
 *
 * ## 2回入れても増えない
 *
 * 書類IDが中身から決まる。**式は `python/fund_box.py` と同じもので、
 * ここはその写し。** 写しであることを黙って持たない——
 * `functions/selftest/fund_docid_selftest.mjs` が、同じ入力を両方に
 * 食わせて**1文字でも違えば落ちる。** 片方だけ直した日に額が変わる、
 * という事故はそこで止まる。
 *
 * | | 書類ID |
 * | --- | --- |
 * | 出費 | `<日付>-<日付\|題\|額 の sha1 の頭8桁>` |
 * | 目標 | 開始日そのもの |
 * | 手入れのスパチャ | `manual-<日付>-<日付\|額\|名前 の sha1 の頭8桁>` |
 *
 * ## 焼き直しは、この口がやる
 *
 * `GET /fund`（島の豚）も `GET /alertbox/{合言葉}/fund`（配信の豚）も、
 * #305 から **`island/state.fund.box`（毎晩の焼き直し）を読んでいる。**
 * 台帳に1行足しても、焼き直さなければ**次の晩まで額はびた一文動かない。**
 *
 * 入れた本人にとって、それは「入ったのか分からない」と同じ。
 * もう一度入れ直すことになるし（書類IDのおかげで増えはしないが、
 * **入っていないと思われたこと自体が不具合**）、配信の直前に
 * 宿代を入れて豚を合わせる、という使い方ができない。
 *
 * だから**書いたあとに毎回、台帳を数え直して焼き直す。**
 * 焼き直しは台帳を読んで足すだけなので、**新しい正を作らない。**
 * 数え方は `python/fund_daily.py` と1つずつ突き合わせてある
 * （`functions/selftest/fund_desk_selftest.mjs` の「焼き直し」の組）。
 *
 * **焼き直しがこけても、書いたことは取り消さない。** 台帳は正しく入って
 * いて、額の表示が次の晩まで古いだけ。返事の `box` を `null` にして、
 * 画面はそこだけ出さない（`docs/island-standards.md` 10章）。
 *
 * ## ログに何も出さない
 *
 * このリポジトリは公開で、Actions のログも誰でも読める。
 * 台帳に並ぶのは**投げ銭してくれた人の名前と額**で、あやとの持ちものでは
 * ない。**名前・額・日付・書類ID・題を1文字も出さない。**
 * 出すのは `POST /alertbox/…/superchat` と同じく「入れたか、断ったか」だけ。
 *
 * ## 索引を作らない（#168）
 *
 * サービスアカウントに複合索引を作る権限が無いので、`where` と `orderBy` を
 * 組み合わせない。並べ替えは **`day` の単一フィールド**だけで、続きは
 * `day` と書類IDの2本立て（`GET /fund/history` と同じ形）。
 */

import {logger} from "firebase-functions";
import * as admin from "firebase-admin";
import {createHash} from "crypto";
/* 島の投げ銭（#1405）。「いま」の額を `GET /fund` と同じ1本で出すために借りる。 */
import {islandYenOf} from "./tip";

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

/** スパチャの控え。**`islandApi.ts` の `FUND_CHATS` と同じ入れ物。** */
const CHATS = db.collection("islandFundSuperChats");
/* Doneru の1件ずつ（2026-09-25）。**Doneru の API は累計1つしか返さない。**
   1件ずつは BigQuery（`doneru_donations`）にしか無く、Functions から
   BigQuery は引けない（クライアントを足していない）ので、
   `python/doneru_ledger.py` が毎晩ここへ写す。`doneru_health.py` が
   「いつまで入っているか」を1枚写しているのと同じ形。

   **額の正はここではない。** 豚に出る Doneru のぶんは、いまも向こうの
   ウィジェットの累計（`doneruNow()`）。ここは**履歴と、期間で切った内訳**の
   ために持つ写しで、合計の計算には1バイトも使わない（内訳の「開始時点」が
   残差なので、写しがずれても豚の額は動かない）。 */
const DONATIONS = db.collection("islandFundDonations");
/** あやとの控え。**アラートボックスの合言葉**（`alertboxId`）をここから引く。 */
const USERS = db.collection("islandUsers");
/** 出費の台帳。**「もらったお金の行き先」はここが正**（#639）。 */
const SPENDS = db.collection("islandFundSpends");
/** 目標。開始日が書類ID。`to` が空いている1件が「いまの目標」。 */
const GOALS = db.collection("islandFundGoals");
/* 島で受けた投げ銭（Stripe。決定の記録 0017・#1405）。**書くのは Stripe の
   知らせを受ける口（`tip.ts`）だけで、ここは読むだけ。** 書類IDは Checkout
   Session の ID。机の履歴・もう一度出す・内訳の5行目がここを読む。
   **テストの支払い（`livemode` が偽）と、返金・払い戻しの請求になったものは
   どこにも出さない**（`islandTipYen`）。 */
const SITE_TIPS = db.collection("islandSiteTips");
/** 焼き直しの置き場。`island/state.fund.box`。 */
const STATE = db.collection("island").doc("state");
/** Doneru の写しが、いつまで入っているか（`python/doneru_ledger.py` が書く）。 */
const DON_HEALTH = db.collection("islandFundHealth").doc("donations");
/* もう一度アラートを出す指示（2026-09-25）。書類IDは**アラートボックスの
   合言葉そのもの**（`islandUsers/{uid}.alertboxId` の32桁）。
   `functions/src/remote.ts` と同じ形——**書くのはあやとだけ、読むのは
   合言葉を知っている人だけ。`where` も `orderBy` も使わない**（#168）。 */
const REPLAY = db.collection("islandFundReplay");
/** 合言葉の形。`islandApi.ts` の `ALERTBOX_ID` と同じ。 */
const ALERTBOX_ID = /^[0-9a-f]{32}$/;

/** スパチャのうち貯金箱に入る割合。**仕様**（`python/fund_box.py` と同じ）。 */
const SUPERCHAT_RATE = 2;

/** 1ページぶん。1件が1行なので、390px の1画面に10行ちょっと。
    **隣の「スパチャ」の控え（`FundHistory.tsx` の `FIRST`）と同じ数。**
    同じ背の行を並べる道具で数が違うと、送る距離だけが札で変わる。 */
const PAGE = 12;
/** 上限。旅先の電波で受けきれない数を1回で返さない。 */
const PAGE_MAX = 120;
/** 目標は年に数件しか増えない。全部返してよい数。 */
const GOALS_MAX = 60;

/**
 * 内訳を組むときに、1つの入れ物から読んでよい行数（2026-09-25）。
 *
 * **`sum()` が使えないので、行を読んで足す**（`yenWhere` の頭）。
 * 読む数は「目標が始まる前ぶん」なので、**歴史ぶんだけ増える。**
 * いまは 377行（スパチャ 516件のうち 2026-07-27 より前）・出費 7行・
 * ドネは期間内 88行（2026-09-25 の実測）。
 *
 * **超えたら内訳を出さない。** 足りない数で組むと、差は「開始時点」が
 * 黙って飲み込んで、**5行は足し引きが合ったまま嘘をつく。**
 * この数に届くころには、焼き直し側に持たせるほうが正しい。
 */
const SPLIT_CAP = 20000;

/**
 * 1件の額の上限（円）。
 *
 * **押し間違いの桁ずれを止めるためだけの線。** 0円以下を弾くのと同じ性質で、
 * 「これ以上は台帳に入らない額だ」と決めているわけではない。
 * 1,000万円を超える1行が本当に要る日が来たら、ここを上げる
 * （いちばん大きい実績は 156,056円 の「ドネルこれまでの退避」）。
 *
 * **外に出してあるのは、同じ台帳へ書く口がもう1つあるから。**
 * `POST /alertbox/{合言葉}/superchat`（`islandApi.ts` の `fundChatOf`）は
 * 同じ `islandFundSuperChats` へ1件ずつ足すのに、**上限を1つも見ていなかった。**
 * 机（ここ）から 1,000万円超は入らないのに、配信の口からは入る——
 * つまり**この線は、口を1つ替えるだけで素通りできた。**
 * `MAX_FUND_TEXT` を貸しているのと同じ理由で、**2か所に別の数を置かない。**
 *
 * **`export const` にはしない。** そう書くと tsc が中の参照まで
 * `exports.YEN_MAX` に書き換えるので、書き出した字に当てている見張り
 * （`fund_desk_selftest.mjs` の対照）が黙って当たらなくなる。
 * 下の `export {YEN_MAX}` なら、中の参照は `YEN_MAX` のまま。
 */
const YEN_MAX = 10_000_000;
export {YEN_MAX};

/** 出費の題。1行に収まる長さ。 */
const TITLE_MAX = 60;
/** 目標の名前。配信の豚のバーの上に出るので、短く。 */
const LABEL_MAX = 40;
/** 出した人の名前。YouTube のハンドルがこれを超えることはない。 */
const WHO_MAX = 31;
/**
 * 投げ銭に添えられた本文の長さ（2026-09-25）。
 *
 * YouTube のスーパーチャットは 200文字まで、Doneru も同じくらい。
 * **切るために置いているのではなく、際限のない字を置き場に入れない**
 * ためだけの線（`WHO_MAX` と同じ性質）。`islandApi.ts` の `fundChatOf` が
 * ここを借りる——**2か所に別の数を置かない。**
 */
export const MAX_FUND_TEXT = 300;

/* ---- もう一度アラートを出す（2026-09-25） ----
   あやとの言葉「たまに配信中見逃すので。…本当は即時で再アラートできる
   機能ほしい」。 */

/**
 * 同じ1件を、この時間のうちに2回頼まれたら**2回目は書かない。**
 *
 * **二度押しで二度出さない**ための線。押しどころを disabled にするのは
 * 画面側の話で、電波が細いときは返事が来る前にもう一度押される。
 * 口のほうで潰さないと、配信に同じお礼が2回出る。
 */
const REPLAY_SAME_MS = 60_000;

/**
 * 出してよい鮮度。これより古い指示は、配信側が拾っても**出さない。**
 *
 * **古いものが勝手に出ないため。** OBS を開き直した瞬間に、1時間前に
 * 押された指示が流れる、というのがいちばん困る事故。
 * 配信側は起き上がった1回目を**印を控えるだけ**にして出さない
 * （`app/alertbox/index.tsx`）ので、守りは2重になっている。
 */
const REPLAY_FRESH_MS = 120_000;

type Json = Record<string, unknown>;

/** 呼ぶ側から借りるもの。「誰か」を見るところを2か所に増やさないため。 */
export type FundDeskDeps = {
  /** あやとなら uid、違えば null */
  ownerUid: (header?: string) => Promise<string | null>;
  /** Doneru の累計（円）。読めなければ null */
  doneruNow: () => Promise<number | null>;
};

/** 受け取るもの。Express の req から要るものだけ。 */
export type FundDeskReq = {
  method: string;
  path: string;
  auth?: string;
  query: Json;
  body: Json;
};

/** 返す側。Express の res のうち、ここで使うものだけ。 */
export type FundDeskRes = {
  set(k: string, v: string): unknown;
  status(n: number): FundDeskRes;
  json(b: unknown): unknown;
};

/** 出費1件。 */
type Spend = {id: string; day: string; title: string; yen: number};
/** 目標1件。`to` が入っていれば終わったもの。 */
type Goal = {
  id: string;
  from: string;
  to: string | null;
  label: string;
  yen: number;
};

/** 焼き直した合計。`island/state.fund.box` にそのまま入る形。 */
type Box = {
  /** 貯金箱に入るぶん（**÷2 済み**） */
  superchat: number;
  /** 人が出した額（÷2 する前） */
  superchatFull: number;
  count: number;
  spend: number;
  spendCount: number;
  /** 豚の `startAmount` にあたる負の数 */
  start: number;
  goal: Json | null;
  /** 焼き直した日（UTC の `YYYY-MM-DD`） */
  updatedAt: string;
};

/* ---------------------------------------------------------------- 書類ID */

/**
 * sha1 の頭8桁。**`python/fund_box.py` と同じ潰し方。**
 * @param {string} s 種
 * @return {string} 16進8文字
 */
const sha8 = (s: string): string =>
  createHash("sha1").update(s, "utf8").digest("hex").slice(0, 8);

/**
 * 出費の書類ID。**同じ支出を2回入れても増えない。**
 *
 * `python/fund_box.py` の `spend_id` と**同じ式**。
 * 揃っているかは `functions/selftest/fund_docid_selftest.mjs` が見る。
 * @param {string} day JST の日付（`2026-05-21`）
 * @param {string} title 何に使ったか
 * @param {number} yen 円
 * @return {string} `2026-05-21-xxxxxxxx`
 */
export const spendId = (day: string, title: string, yen: number): string =>
  `${day}-${sha8(`${day}|${title}|${yen}`)}`;

/**
 * 手で入れるスパチャの書類ID。`python/fund_box.py` の `manual_id` と同じ式。
 *
 * **同じ日・同じ額・同じ人を2回入れても、同じIDになる。**
 * 別人が同じ額を同じ日に出したときは `who` が違うので分かれる。
 * @param {string} day JST の日付
 * @param {number} yen 円
 * @param {string} who 出した人の名前（空でもよい）
 * @return {string} `manual-20260910-xxxxxxxx`
 */
export const manualId = (day: string, yen: number, who: string): string =>
  `manual-${day.replace(/-/g, "")}-${sha8(`${day}|${yen}|${who}`)}`;

/**
 * 手で入れた1件が「あとで BigQuery から出てくる同じもの」を待つ札。
 *
 * `python/fund_box.py` の `claim_key` と同じ式。**これを付けずに書くと、
 * 翌晩の掃除が BigQuery から同じスパチャを拾って2件になる**
 * （書類IDでは重ならない。`manual-…` と26文字の item id）。
 * @param {string} day JST の日付
 * @param {number} yen 円
 * @return {string} `2026-08-26|1000`。日付が無ければ空文字
 */
export const claimKey = (day: string, yen: number): string =>
  day ? `${day}|${yen}` : "";

/* ---------------------------------------------------------------- 島の投げ銭 */

/**
 * 島の投げ銭1件（`islandSiteTips` の中身）から、**机に出してよい円**を取り出す。
 *
 * `python/fund_box.py` の `island_counts()`（数に入れてよいか）と
 * `island_yen_of()`（足す円）を**続けて通したものの写し。** 豚の焼き直し
 * （`python/fund_daily.py`）と台帳（`python/island_tips.py`）が通す1本と
 * 同じ条件にしないと、机の内訳と豚が別の額を言う。写しであることを黙って
 * 持たない——`functions/selftest/fund_docid_selftest.mjs` が同じ入力を両方に
 * 食わせて、**1件でも違えば落ちる。**
 *
 * - `livemode` が**真そのもの**（本番の支払い）で、`status` が `paid` のものだけ。
 *   テストの支払い・返金・払い戻しの請求は出さない（決定の記録 0017 の7）
 * - 額が読めないものは **0 にしない。** null を返して、出さない
 * @param {Json} v `islandSiteTips/{checkoutSessionId}` の中身
 * @return {number | null} 円。出さないもの・額が読めないものは null
 */
export const islandTipYen = (v: Json): number | null => {
  if (v.livemode !== true || v.status !== "paid") return null;
  const amount = v.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount)) return null;
  if (String(v.currency || "JPY").toUpperCase() !== "JPY") return null;
  if (amount <= 0 || amount !== Math.trunc(amount)) return null;
  return amount;
};

/**
 * ミリ秒を、台帳の `at` と同じ形（`2026-09-23T20:05:03+09:00`）にする。
 *
 * **履歴は `at` の字で並べる**（`listFeed`）。スパチャとドネの `at` は
 * この形で入っている（`islandApi.ts` の `fundJst`・`python/fund_box.py` の
 * `FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%S%Ez')`）。島の投げ銭は時刻を
 * ミリ秒（`paidAt`）で持つので、ここで同じ形に直す。形が違うと、
 * 同じ晩の3つの並びが字の比べ方で崩れる。
 * @param {number} ms ミリ秒
 * @return {string} 日本時間の ISO8601
 */
const jstAt = (ms: number): string =>
  `${new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 19)}+09:00`;

/** 島の投げ銭1件を、ほかの2つの台帳と同じ欄に読み替えたもの。 */
type IslandGot = {yen: number; who: string; text: string; at: string};

/**
 * 島の投げ銭1件を、スパチャ・ドネの控えと同じ欄（`yen` / `who` / `text` /
 * `at`）に読み替える。**机に出さないものは null。**
 *
 * 履歴（`listFeed`）ともう一度出す（`POST /fund/replay`）が**同じ1本を通す。**
 * 片方だけ直すと、履歴で見た名前・額と、配信に出る名前・額が割れる。
 * 名前はアラートに出した名前（`displayNameSnapshot`）、本文は
 * 払った人が書いたメッセージ（`message`）。
 * @param {Json} v `islandSiteTips/{checkoutSessionId}` の中身
 * @return {IslandGot | null} 読み替えたもの。出さないものは null
 */
const islandGot = (v: Json): IslandGot | null => {
  const yen = islandTipYen(v);
  const paidAt = Number(v.paidAt);
  if (yen === null || !Number.isFinite(paidAt) || paidAt <= 0) return null;
  return {
    yen,
    who: typeof v.displayNameSnapshot === "string" ? v.displayNameSnapshot : "",
    text: typeof v.message === "string" ? v.message : "",
    at: jstAt(paidAt),
  };
};

/* ---------------------------------------------------------------- 入力の検め */

/**
 * `2026-09-12` の形で、**暦に実在する日か。**
 *
 * 形だけ見ると `2026-02-31` が通る。書類IDは日付から決まるので、
 * 通すと**二度と人の目で見つけられない行**が台帳に残る。
 * @param {unknown} v 入力
 * @return {boolean} 実在する日なら true
 */
const isDay = (v: unknown): v is string => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const t = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === v;
};

/**
 * その日の**前の日**。目標を閉じる日に使う。
 *
 * 新しい目標と同じ日で閉じると、**どちらの期間にも入る1日**ができて、
 * 内訳の足し引きが2通りになる。`isDay` を通った字しか渡さない。
 * @param {string} day `2026-09-28`
 * @return {string} `2026-09-27`
 */
const dayBefore = (day: string): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) - 86400000)
    .toISOString().slice(0, 10);

/**
 * 円。**0円以下は入れない。** 小数も桁あふれも入れない。
 * @param {unknown} v 入力
 * @return {number} 円。入れてはいけない値なら 0
 */
const yenOf = (v: unknown): number => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0 || n > YEN_MAX) return 0;
  return n;
};

/**
 * 文字列にして、前後の空白を落として、長さで切る。
 * @param {unknown} v 受け取った値
 * @param {number} max 残す長さ
 * @return {string} 整えた文字列
 */
const clean = (v: unknown, max: number): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

/**
 * URL の末尾から書類IDを取り出す。
 *
 * **`/` を含むものは書類IDではない。** Firestore は `a/b` を渡されると
 * 「コレクションの下のコレクション」と読んで投げるので、502 に化けて
 * 「置き場が落ちた」と読める。無い書類として 404 を返すほうが正しい。
 * @param {string} seg URL の1区画（エンコードされたまま）
 * @return {string} 書類ID。書類IDでないなら空文字
 */
const docIdOf = (seg: string): string => {
  const id = decodeURIComponent(seg);
  return id && !id.includes("/") && id.length <= 200 ? id : "";
};

/* ---------------------------------------------------------------- 焼き直し */

/**
 * 台帳を数え直して `island/state.fund.box` を焼き直す。
 *
 * **数え方は `python/fund_daily.py` と同じ。** 向こうが毎晩同じ数を書くので、
 * 違う数え方をすると**毎晩ここと向こうで額が行き来する。**
 *
 *   - スパチャ … `islandFundSuperChats` の `yen` の総和と件数
 *   - 出費     … `islandFundSpends` の `yen` の総和と件数
 *   - 目標     … `from` の降順で1件。それが閉じていれば「無し」
 *
 * 総和は Firestore の集計（`aggregate`）で取る。**509件を1件ずつ読まない。**
 *
 * **投げない。** ここが落ちても、台帳への書き込みは正しく済んでいる。
 * @return {Promise<Box | null>} 焼き直した値。焼き直せなければ null
 */
async function rebake(): Promise<Box | null> {
  try {
    const [chat, spent, goalSnap] = await Promise.all([
      CHATS.aggregate({
        count: admin.firestore.AggregateField.count(),
        yen: admin.firestore.AggregateField.sum("yen"),
      }).get(),
      SPENDS.aggregate({
        count: admin.firestore.AggregateField.count(),
        yen: admin.firestore.AggregateField.sum("yen"),
      }).get(),
      GOALS.orderBy("from", "desc").limit(1).get(),
    ]);
    const full = Number(chat.data().yen) || 0;
    const spend = Number(spent.data().yen) || 0;
    const top = goalSnap.docs[0];
    const topRec = top ? top.data() ?? {} : {};
    /* **`to` が空いているものが、いまの目標**（`python/fund_box.py` の
       `read_goal`）。閉じていたら「いまは目標が無い」で、1つ前へは遡らない
       ——目標は同時に1つしか置かない決まりなので。 */
    const goal = top && !topRec.to ? (topRec as Json) : null;
    const box: Box = {
      superchat: Math.floor(full / SUPERCHAT_RATE),
      superchatFull: full,
      count: Number(chat.data().count) || 0,
      spend,
      spendCount: Number(spent.data().count) || 0,
      /* 豚の `startAmount`。支出の合計の符号を反転した負の数。
         **0 も正しい値**（支出が1件も無ければ 0）。 */
      start: -spend,
      goal,
      updatedAt: new Date().toISOString().slice(0, 10),
    };
    /* **`fund` の下の `box` だけを書く。** `fund.superchat` `fund.people`
       `fund.days` は `python/island_daily_stats.py` の持ちもので、
       同じ欄を2人が書くと額が書いた順で決まる。 */
    await STATE.set({fund: {box}}, {merge: true});
    return box;
  } catch (e) {
    /* **額も件数も出さない。** 焼き直せなかったことだけ残す。
       台帳は入っているので、次の晩の掃除が同じ数を書く。 */
    logger.warn("fund desk rebake failed", String(e));
    return null;
  }
}

/* ---------------------------------------------------------------- 読み */

/* ---------------------------------------------------------------- 内訳 */

/**
 * いまの目標に対する内訳（2026-09-25）。あやとの言葉:
 *
 * > 今の目標に対する総金額（豚にでてるやつ）も内訳付きで出したい。
 * > （開始時点、スパチャ、ドネ、期間内出費とか見れたらわかりやすいかも。）
 *
 * ## 「開始時点」は測るものではなく、**残り**
 *
 * 財布は1つで、日付では切らない（#639。あやとの決め）。**切るのは表示だけ。**
 * `GET /fund` の計算には1バイトも触らない。
 *
 *     開始時点 ＝ いま − スパチャ（期間内） − ドネ（期間内）
 *                     − 島の投げ銭（期間内） ＋ 出費（期間内）
 *
 * こう組むと、5行の足し引きは**必ず**「いま」に戻る。
 * **合わない内訳を出さないための作り**で、数字を合わせにいったのではない。
 * 意味のほうも正しい——目標が始まった時点で財布に入っていた額そのもの。
 *
 * ## スパチャの「期間内」は、引き算で出す
 *
 * 貯金箱に入るのは半分で、**足してから半分にする**（`python/fund_box.py`）。
 * 期間ごとに半分にすると、両方が奇数の月に1円ずれる。だから
 * **全体の半分から、始まる前のぶんの半分を引く。** これなら必ず足して戻る。
 *
 * ## 島の投げ銭は5行目（#1405）
 *
 * 3つ目の出どころ（決定の記録 0017）。**行を分けないと、期間内に島で受けた
 * ぶんが「開始時点」（残差）に入って、目標が始まる前からあったお金に見える。**
 * 足し引きは合ったまま意味だけがずれる、いちばん見つけにくい形なので、
 * 行を持たせる。期間内はスパチャと同じく**全体（焼き直し）から始まる前のぶん
 * （いま読む）を引く。** 払った額のまま足す（割らない。`docs/island-money.md` 1章）。
 *
 * ## 写しが読めないときは、**内訳を出さない**
 *
 * ドネの1件ずつは Firestore の写し（`python/doneru_ledger.py`）から数える。
 * 写しが無い・止まっているときに 0 と読むと、その日の「ドネ 0円」が
 * まるごと「開始時点」へ流れ込んで、**5行は足し引きが合ったまま嘘をつく。**
 * 読めないときは `null` を返して、画面は内訳を1行も出さない
 * （`docs/island-standards.md` 10章）。
 */
type FundSplit = {
  /** 目標が始まった時点で、財布に入っていた額 */
  start: number;
  /** 期間内のスパチャ（**÷2 後**） */
  superchat: number;
  /** 期間内の Doneru */
  doneru: number;
  /** 期間内の島の投げ銭（**払った額のまま。割らない**） */
  island: number;
  /** 期間内の出費（**引く額。正の数で返す**） */
  spend: number;
  /** 5行の足し引き。**`GET /fund` の `total` と1円まで同じ** */
  total: number;
  /** ドネの写しが、いつまで入っているか（`YYYY-MM-DD`） */
  donationsAsOf: string;
};

/**
 * 内訳が組めなかった理由。**画面には出さない。** 本番で1回通す道具
 * （`python/admin/fund_desk_probe.py`）が、止まった門を名指しするのに使う。
 *
 * 2026-09-25 に、配ったあと内訳が出ない不具合が出た。画面からは
 * 「内訳は、いま出せません。」としか見えず、**門が6つあるのでどこで
 * 止まったのか分からなかった。** 本番の Functions のログを読んで初めて
 * 理由が出るまで13分かかっている。**口のほうに名前を言わせる。**
 */
type SplitWhy =
  /** いま走っている目標が無い */
  | "goal"
  /** 焼き直しか Doneru が読めず、「いま」の額が出せない */
  | "total"
  /** 焼き直しに欄が足りない（`superchatFull` / `spend`） */
  | "box"
  /** ドネの写しの札が無い・空（`islandFundHealth/donations`） */
  | "health"
  /** 読みがこけた、または多すぎて数えきれない */
  | "read"
  /** 焼き直しが台帳より古くて、期間内が負になる */
  | "stale";

/** 内訳と、組めなかったときの理由。**どちらか片方だけが入る。** */
type SplitOut = {split: FundSplit | null; why: SplitWhy | null};

/**
 * 内訳の材料を1つ読む。**`sum()` を使わない。**
 *
 * ## なぜ `sum()` を使えないか（2026-09-25。本番で踏んだ）
 *
 * `where("day", ...)` と `sum("yen")` を組み合わせると、Firestore は
 * **複合索引を要求する**——単一フィールドの自動索引には足す欄（`yen`）が
 * 入っていないから。うちは複合索引を作れない（#168）ので、本番で
 * こうなっていた。
 *
 *     WARNING fund desk split failed
 *       Error: 9 FAILED_PRECONDITION: The query requires an index.
 *
 * **絞り込みだけなら索引は要らない。** 欄を `yen` に絞って読んで、
 * 足すのはこちらでやる（本番で両方叩いて確かめた。
 * `python/admin/fund_split_probe.py`）。
 *
 * **数えきれない数が返ったら、投げる。** 足りない数で内訳を作ると、
 * 差は「開始時点」が黙って飲み込んで、**5行は足し引きが合ったまま嘘をつく。**
 * @param {FirebaseFirestore.CollectionReference} col 入れ物
 * @param {"<" | ">="} op 境目の向き
 * @param {string} day 境目の日
 * @return {Promise<number>} 円の合計
 */
async function yenWhere(
  col: FirebaseFirestore.CollectionReference,
  op: "<" | ">=",
  day: string,
): Promise<number> {
  const snap = await col.where("day", op, day).select("yen")
    .limit(SPLIT_CAP + 1).get();
  if (snap.size > SPLIT_CAP) throw new Error("too many rows to add up");
  let yen = 0;
  snap.forEach((d) => {
    const n = Number(d.get("yen"));
    if (Number.isFinite(n)) yen += n;
  });
  return yen;
}

/**
 * 目標が始まる前に島で受けた投げ銭の合計（`islandSiteTips`。#1405）。
 *
 * 島の投げ銭は `day` を持たない（時刻はミリ秒の `paidAt`）。境目は
 * **目標の始まった日の日本時間の0時**——スパチャの `day`（日本時間の日）で
 * `< from` と切るのと同じ線になる。
 *
 * 読み方は `yenWhere` と同じ（**`paidAt` の単一フィールドだけ**で絞って、
 * 足すのはこちら）。数に入れてよいか・足す円は `islandTipYen` の1本
 * （テストの支払い・返金・払い戻しの請求は足さない）。
 * @param {string} from 目標の始まった日（`2026-07-27`）
 * @return {Promise<number>} 円の合計
 */
async function islandBeforeOf(from: string): Promise<number> {
  const edge = Date.parse(`${from}T00:00:00+09:00`);
  if (!Number.isFinite(edge)) throw new Error("bad goal day");
  const snap = await SITE_TIPS.where("paidAt", "<", edge)
    .select("livemode", "status", "amount", "currency")
    .limit(SPLIT_CAP + 1).get();
  if (snap.size > SPLIT_CAP) throw new Error("too many rows to add up");
  let yen = 0;
  snap.forEach((d) => {
    const n = islandTipYen(d.data() as Json);
    if (n !== null) yen += n;
  });
  return yen;
}

/**
 * 内訳を組む。**1つでも読めなければ、理由の名前を返す。**
 *
 * ## 焼き直しに合わせる側と、いまを読む側
 *
 * 「いま」の額（`total`）は **焼き直し（`island/state.fund.box`）＋ Doneru の
 * いまの累計** でできている。だから内訳の各行も、**同じ古さのもの**から
 * 出さないと、行だけが新しくなって開始時点が差を飲み込む。
 *
 * | 行 | どこから |
 * | --- | --- |
 * | スパチャ | **焼き直しの合計 − 始まる前ぶん（いま読む）** |
 * | 出費 | **焼き直しの合計 − 始まる前ぶん（いま読む）** |
 * | ドネ | **いま読む**（`total` の Doneru がいまの累計なので） |
 * | 島の投げ銭 | **焼き直しの合計 − 始まる前ぶん（いま読む）**（`total` の島の投げ銭が焼き直しなので） |
 * | 開始時点 | 残差（5行の足し引きが必ず「いま」に戻る） |
 *
 * 焼き直したあとに来たスパチャは `total` にも入っていないが、
 * **「始まる前ぶん」はそれに動かされない**ので、ずれは期間内の行に
 * 収まったまま——`total` と同じ古さで揃う。出費も同じ理由
 * （`fund_add` から入れたぶんは焼き直されていない）。
 *
 * **期間内を直に読んで引き算しない。** そうすると焼き直しの古さが
 * 期間内の行に乗って、開始時点が同じだけ逆にずれる。
 * @param {string} from 目標の始まった日（`2026-07-27`）
 * @param {number} total いま貯金箱にいくら入っているか
 * @param {number} superchatAll 貯金箱に入っているスパチャぶん（÷2 後）
 * @param {number} spendAll 焼き直しの出費の合計
 * @param {number} islandAll 「いま」に入っている島の投げ銭（`total` を組んだのと同じ値）
 * @return {Promise<SplitOut>} 内訳。組めなければ理由
 */
async function splitOf(
  from: string,
  total: number,
  superchatAll: number,
  spendAll: number,
  islandAll: number,
): Promise<SplitOut> {
  if (!Number.isFinite(spendAll)) return {split: null, why: "box"};
  try {
    const [health, fullBefore, spendBefore, doneru, islandBefore] =
      await Promise.all([
        DON_HEALTH.get(),
        /* 始まる前のスパチャと出費。**`day` の単一フィールドだけ**で絞って、
           足すのはこちら（`yenWhere` の頭。`sum()` は索引が要る）。 */
        yenWhere(CHATS, "<", from),
        yenWhere(SPENDS, "<", from),
        // ドネだけは期間内を読む（`total` の Doneru がいまの累計なので）
        yenWhere(DONATIONS, ">=", from),
        islandBeforeOf(from),
      ]);
    /* 写しが1度も来ていない／札が無いときは、内訳を組まない。
       **0 を作らない**（`docs/island-standards.md` 10章）。 */
    const h = health.exists ? health.data() ?? {} : {};
    const asOf = typeof h.okDay === "string" ? h.okDay : "";
    if (!asOf || !(Number(h.count) > 0)) {
      return {split: null, why: "health"};
    }

    /* **全体の半分から、始まる前のぶんの半分を引く。** 期間ごとに
       半分にすると、両方が奇数のときに1円ずれる。 */
    const superchat = superchatAll - Math.floor(fullBefore / SUPERCHAT_RATE);
    const spend = spendAll - spendBefore;
    /* 島の投げ銭は割らない（払った額のまま）。焼き直しから始まる前を引く */
    const island = islandAll - islandBefore;
    /* 焼き直しが台帳より古いと、引き算が負になることがある。
       **負の「期間内」を出さない**——足し引きは合っても、読む人には
       意味の通らない数になる。 */
    if (superchat < 0 || spend < 0 || island < 0) {
      return {split: null, why: "stale"};
    }
    const start = total - superchat - doneru - island + spend;
    return {
      split: {
        start,
        superchat,
        doneru,
        island,
        spend,
        total: start + superchat + doneru + island - spend,
        donationsAsOf: asOf,
      },
      why: null,
    };
  } catch (e) {
    // **額を1つも出さない。** 組めなかったことだけ残す
    logger.warn("fund desk split failed", String(e));
    return {split: null, why: "read"};
  }
}

/* ---------------------------------------------------------------- 履歴 */

/** もらった1件の出どころ。`island` は島で受けた投げ銭（#1405） */
type GotKind = "superchat" | "donation" | "island";

/** 履歴の1件。スパチャも Doneru も島の投げ銭も、画面から見れば同じ「もらった1件」。 */
type FundGot = {
  /** 書類ID（島の投げ銭は Checkout Session の ID） */
  id: string;
  kind: GotKind;
  /** ISO8601（日本時間）。**並べ替えの鍵** */
  at: string;
  day: string;
  yen: number;
  who: string;
  /** 添えられた本文。**あやとだけが読む** */
  text: string;
};

/**
 * スパチャと Doneru と島の投げ銭を**まぜて時系列**で返す（2026-09-25。島は #1405）。
 *
 * あやとの言葉「スパチャ・ドネの履歴が見れたい」。前は2つが別の場所に
 * あって、**同じ晩に来た2件がどちらが先か分からなかった。**
 *
 * ## 3つの入れ物を1回のクエリでは読めない
 *
 * Firestore にコレクションをまたぐ並べ替えは無いので、**どれからも N+1 件
 * 引いて、手元で混ぜて切る。**
 *
 * ## 島の投げ銭は、読んでから絞る
 *
 * `islandSiteTips` にはテストの支払いと返金ぶんも入っている。`livemode` と
 * `status` で絞りながら `paidAt` で並べると複合索引が要る（#168 で作れない）
 * ので、**`paidAt` の単一フィールドで並べて読み、手元で絞る**
 * （`islandTipYen`）。絞って N+1 件に足りなければ、続きを読み足す——
 * 足りないまま混ぜると、ページの境目より新しい島の1件が、次のページの
 * 「これより古いもの」からも外れて**二度と出てこない。**
 * 読み足すのは `SPLIT_CAP` 件まで。届いたら、読んだところより古いものを
 * このページに入れない（`more` を立てて、続きをそこから読ませる）。
 *
 * ## 並べるのは `at`
 *
 * `day` だと、同じ晩の中で順が決まらない（配信中はそこがいちばん見たい）。
 * **`at` を持たない控えは、この並びに出てこない**——GAS の表から移した
 * 13件がそれで、日付そのものが分かっていない。黙って落とさず、
 * 件数と額を `noTime` で返して画面の最後に1行出す。
 *
 * ## 新着だけ取る
 *
 * `since` を渡すと**それより後の1件ずつ**だけ返す。配信中に2秒おきに
 * 聞くのはこちらで、ふだんは0件（数百バイト）で返る。
 * `at` の**同じ単一フィールド**に範囲と並べ替えを掛けるので、
 * 自動でできる索引の範囲に収まる（複合索引は作れない。#168）。
 * @param {object} q `limit` / `before`（続き）/ `since`（新着だけ）
 * @return {Promise<object>} 1ページぶんと、続きの位置
 */
async function listFeed(q: {
  limit?: unknown; before?: unknown; since?: unknown;
}): Promise<{
  got: FundGot[]; more: boolean; next: string | null;
  noTime: {count: number; yen: number} | null;
}> {
  const want = Number(q.limit ?? PAGE);
  const n = Number.isFinite(want) ?
    Math.min(Math.max(Math.trunc(want), 1), PAGE_MAX) :
    PAGE;
  const before = String(q.before ?? "");
  const since = String(q.since ?? "");

  /**
   * 片方の入れ物から、新しい順に n+1 件。
   * @param {FirebaseFirestore.CollectionReference} col 入れ物
   * @param {"superchat" | "donation"} kind どちら
   * @return {Promise<FundGot[]>} 1件ずつ
   */
  const side = async (
    col: FirebaseFirestore.CollectionReference,
    kind: "superchat" | "donation",
  ): Promise<FundGot[]> => {
    let r = col.orderBy("at", "desc");
    if (since) r = r.where("at", ">", since);
    if (before) r = r.startAfter(before);
    const snap = await r.limit(n + 1).get();
    return snap.docs.map((d) => {
      const v = d.data();
      return {
        id: d.id,
        kind,
        at: typeof v.at === "string" ? v.at : "",
        day: typeof v.day === "string" ? v.day : "",
        yen: Number(v.yen) || 0,
        who: typeof v.who === "string" ? v.who : "",
        text: typeof v.text === "string" ? v.text : "",
      };
    });
  };

  /**
   * 島の投げ銭から、新しい順に n+1 件（本番で、いまも `paid` のものだけ）。
   * `since` と `before` は `at` の字で来るので、ミリ秒に直して `paidAt` に掛ける。
   * @return {Promise<object>} 1件ずつと、読み切れなかったときの境目（`at`）
   */
  const island = async (): Promise<{rows: FundGot[]; floor: string | null}> => {
    const sinceMs = since ? Date.parse(since) : null;
    const beforeMs = before ? Date.parse(before) : null;
    // 読めない位置は、ほかの2つと同じ線が引けないので何も返さない
    if (Number.isNaN(sinceMs) || Number.isNaN(beforeMs)) {
      return {rows: [], floor: null};
    }
    let base = SITE_TIPS.orderBy("paidAt", "desc")
      .orderBy(admin.firestore.FieldPath.documentId(), "desc");
    if (sinceMs !== null) base = base.where("paidAt", ">", sinceMs);
    /* 1回に読む数。テストの支払いが前に並んでいても、ふつうは1回で足りる数 */
    const step = Math.max(n + 1, 100);
    const rows: FundGot[] = [];
    let cur: unknown[] | null = beforeMs !== null ? [beforeMs] : null;
    let read = 0;
    for (;;) {
      const snap = await (cur ? base.startAfter(...cur) : base)
        .limit(step).get();
      read += snap.size;
      for (const d of snap.docs) {
        const g = islandGot(d.data() as Json);
        if (!g) continue;
        rows.push({id: d.id, kind: "island", day: g.at.slice(0, 10), ...g});
      }
      // 読み切った・足りた
      if (snap.size < step || rows.length > n) return {rows, floor: null};
      const last = snap.docs[snap.size - 1];
      if (read >= SPLIT_CAP) {
        // 読み足す上限。**読んだところより古いものは、このページに入れない**
        return {rows, floor: jstAt(Number(last.get("paidAt")))};
      }
      cur = [last.get("paidAt"), last.id];
    }
  };

  const [a, b, c] = await Promise.all([
    side(CHATS, "superchat"),
    side(DONATIONS, "donation"),
    island(),
  ]);
  let all = [...a, ...b, ...c.rows].sort((x, y) => y.at.localeCompare(x.at));
  /* 島の投げ銭を読み切れなかった回は、読んだところより古いものを落とす。
     落としたものは次のページ（`before` ＝ このページのいちばん古い1件）で出る */
  const floor = c.floor;
  const cut = floor !== null && all.some((g) => g.at < floor);
  if (floor !== null) all = all.filter((g) => g.at >= floor);
  const got = all.slice(0, n);
  const more = all.length > n || cut;
  const last = got[got.length - 1];

  /* 時刻の分からない控え。**いちばん後ろまで来たときだけ数える**
     （毎回数えると、2秒おきの新着取りでも集計が1回走る）。 */
  let noTime: {count: number; yen: number} | null = null;
  if (!since && !more) {
    try {
      /* **`sum()` を使わない。** 絞り込みと足し算を一緒に頼むと
         複合索引が要る（2026-09-25 に本番で踏んだ。`yenWhere` の頭）。
         ここは13件しか無いので、読んで数える。 */
      const snap = await CHATS.where("at", "==", null).select("yen")
        .limit(SPLIT_CAP + 1).get();
      if (snap.size > 0 && snap.size <= SPLIT_CAP) {
        let yen = 0;
        snap.forEach((d) => {
          const n = Number(d.get("yen"));
          if (Number.isFinite(n)) yen += n;
        });
        noTime = {count: snap.size, yen};
      }
    } catch (e) {
      // 数えられなかっただけ。**0 と書かない**（`island-standards.md` 10章）
      logger.warn("fund feed notime failed", String(e));
    }
  }
  /* 続きの位置は、このページのいちばん古い1件。**1件も無いのに続きがある**
     のは島の投げ銭を読み切れなかった回だけで、そのときは読んだところから */
  const next = !more ? null : last ? last.at : floor;
  return {got, more, next, noTime};
}

/**
 * 出費を新しい順に1ページぶん。
 *
 * 続きの位置は `<日付>_<書類ID>`（`GET /fund/history` と同じ形）。
 * **`day` の単一フィールド**と書類IDだけで並べるので、複合索引は要らない。
 * @param {unknown} limit 何件返すか
 * @param {unknown} before 続きの位置
 * @return {Promise<object>} 1ページぶんと、続きの位置
 */
async function listSpends(
  limit: unknown,
  before: unknown,
): Promise<{spends: Spend[]; more: boolean; next: string | null}> {
  const want = Number(limit ?? PAGE);
  const n = Number.isFinite(want) ?
    Math.min(Math.max(Math.trunc(want), 1), PAGE_MAX) :
    PAGE;
  let q = SPENDS
    .orderBy("day", "desc")
    .orderBy(admin.firestore.FieldPath.documentId(), "desc");
  const cur = /^([0-9-]{0,10})_(.+)$/.exec(String(before ?? ""));
  if (cur) q = q.startAfter(cur[1], cur[2]);
  const snap = await q.limit(n + 1).get();
  const docs = snap.docs.slice(0, n);
  const more = snap.size > n;
  const last = docs[docs.length - 1];
  return {
    spends: docs.map((d) => {
      const v = d.data();
      return {
        id: d.id,
        day: typeof v.day === "string" ? v.day : "",
        title: typeof v.title === "string" ? v.title : "",
        yen: Number(v.yen) || 0,
      };
    }),
    more,
    next: more && last ? `${last.get("day") ?? ""}_${last.id}` : null,
  };
}

/**
 * 目標をぜんぶ、新しい順に。年に数件しか増えないので畳まない。
 * @return {Promise<Goal[]>} 目標の並び
 */
async function listGoals(): Promise<Goal[]> {
  const snap = await GOALS.orderBy("from", "desc").limit(GOALS_MAX).get();
  return snap.docs.map((d) => {
    const v = d.data();
    return {
      id: d.id,
      from: typeof v.from === "string" ? v.from : d.id,
      to: typeof v.to === "string" && v.to ? v.to : null,
      label: typeof v.label === "string" ? v.label : "",
      yen: Number(v.yen) || 0,
    };
  });
}

/**
 * 配信側（OBS）が拾う、もう一度出す指示（2026-09-25）。
 *
 * **ログインは要らない。** OBS のブラウザソースは合言葉を持てないので、
 * 32桁の合言葉を知っていることが合言葉になっている（`GET /roulette/{id}` と
 * `GET /alertbox/{合言葉}/fund` と同じ形）。取り付けは `islandApi.ts`。
 *
 * ## 古いものを出さない
 *
 * **鮮度で切る。** `REPLAY_FRESH_MS` より古い指示は `seq: 0` を返して、
 * 配信側には何も届かない。いちばん困る事故は「OBS を開き直した瞬間に、
 * 1時間前に押された指示が流れる」ことで、ここで止まる。
 *
 * 配信側にも守りがある——**起き上がって最初に受け取った印は、控えるだけで
 * 出さない**（`app/alertbox/index.tsx`）。**2重にしてあるのは、片方が
 * 外れても配信に変なものが出ないようにするため。**
 *
 * ## 出す中身は、口が組んだもの
 *
 * ここが返すのは台帳から組んだ名前・額・本文だけ。押した人が
 * 送った字は1文字も通っていない（`POST /fund/replay`）。
 * @param {string} key アラートボックスの合言葉（32桁）
 * @param {number} now いまの時刻（ミリ秒）
 * @return {Promise<object>} `seq` と、出すもの。無ければ `seq: 0`
 */
export async function replayFor(key: string, now: number): Promise<Json> {
  if (!ALERTBOX_ID.test(key)) return {seq: 0};
  const snap = await REPLAY.doc(key).get();
  if (!snap.exists) return {seq: 0};
  const v = snap.data() ?? {};
  const seq = Number(v.seq) || 0;
  if (!seq || now - seq > REPLAY_FRESH_MS) return {seq: 0};
  return {
    seq,
    show: {
      /* 島の投げ銭は、配信では **Doneru の donation と同じ形**で出す
         （`app/alertbox/connectors/IslandTipConnector.ts` の
         `toIslandNotification`。あやとの決め「同じ描きかた・同じ7段」）。
         もう一度出すときも同じ形にしないと、2回目だけスパチャの絵で出る */
      kind: v.kind === "donation" || v.kind === "island" ?
        "donation" :
        "superchat",
      yen: Number(v.yen) || 0,
      who: typeof v.who === "string" ? v.who : "",
      text: typeof v.text === "string" ? v.text : "",
    },
  };
}

/* ---------------------------------------------------------------- 口 */

/**
 * 貯金箱の出し入れの口。**扱った URL なら true を返す。**
 *
 * 呼ぶ側（`islandApi.ts`）は true が返ったらそこで終わる。
 * false のときは1バイトも書いていないので、そのまま次の口へ落ちてよい。
 * @param {FundDeskReq} q 受け取ったもの
 * @param {FundDeskRes} res 返す先
 * @param {FundDeskDeps} deps 呼ぶ側から借りるもの
 * @return {Promise<boolean>} ここで扱ったかどうか
 */
export async function handleFundDesk(
  q: FundDeskReq,
  res: FundDeskRes,
  deps: FundDeskDeps,
): Promise<boolean> {
  /* **合計（`/fund`）と控え（`/fund/history`）は向こうの持ちもの。**
     ここが先に手を出すと、誰でも読める合計まであやと限定になる。 */
  if (!q.path.startsWith("/fund/")) return false;
  if (q.path === "/fund/history") return false;

  const spendOne = /^\/fund\/spends\/(.+)$/.exec(q.path);
  const goalOne = /^\/fund\/goals\/(.+)$/.exec(q.path);
  const chatOne = /^\/fund\/chats\/(.+)$/.exec(q.path);
  const known =
    q.path === "/fund/desk" ||
    q.path === "/fund/feed" ||
    q.path === "/fund/replay" ||
    q.path === "/fund/spends" ||
    q.path === "/fund/goals" ||
    q.path === "/fund/chats" ||
    !!spendOne || !!goalOne || !!chatOne;
  if (!known) return false;

  /* **どの枝より先に、あやとかを見る。** 台帳には投げ銭してくれた人の
     名前と額が並ぶ（`GET /fund/history` と同じ扱い）。書くほうはもちろん、
     読むほうも人のものなので、ここを通らない道を作らない。 */
  if (!(await deps.ownerUid(q.auth))) {
    res.status(403).json({error: "not allowed"});
    return true;
  }
  /** 誰の手元にも焼き付けない（`GET /fund/history` と同じ）。 */
  res.set("Cache-Control", "no-store");

  try {
    /* ---- 机を1枚ぶん読む ---- */
    if (q.method === "GET" && q.path === "/fund/desk") {
      const [state, page, goals, doneru] = await Promise.all([
        STATE.get(),
        listSpends(q.query.limit, null),
        listGoals(),
        deps.doneruNow(),
      ]);
      const f = ((state.exists ? state.data() ?? {} : {}).fund ?? {}) as Json;
      const box =
        (typeof f.box === "object" && f.box ? f.box : null) as Json | null;
      /* いま貯金箱にいくら入っているか。**式は `GET /fund` の `total` と
         同じ1本**（起点 ＋ スパチャの半分 ＋ 島の投げ銭 ＋ Doneru）。ここで別の式を
         組まない——2か所にあると、いつか2つが違う額を言う。

         島の投げ銭（#1405）は、欄が無いときに 0 を作らない（`tip.ts` の
         `islandYenOf`。`GET /fund` と同じ1本）。決められなければ `total` も null。
         内訳（`splitOf`）には**同じ値**を渡して、期間内のぶんを5行目に分ける
         （分けないと「開始時点」（残差）に入って、目標の前からあったお金に見える）。 */
      const start = Number(box?.start);
      const superchat = Number(box?.superchat);
      const islandRaw = box?.island;
      const baked = islandRaw === undefined || islandRaw === null ?
        null :
        Number(islandRaw);
      const island =
        baked !== null && (!Number.isFinite(baked) || baked < 0) ?
          null :
          box ? await islandYenOf(baked) : null;
      const total =
        box && doneru !== null && island !== null &&
        Number.isFinite(start) && Number.isFinite(superchat) ?
          start + superchat + island + doneru :
          null;
      /* いまの目標（`to` の空いているいちばん新しい1件）。
         **目標は同時に1つ**（`python/fund_box.py` の `read_goal`）。 */
      const now = goals.find((g) => !g.to) ?? null;
      /* 内訳。**組めなかったときは、どの門で止まったかを名前で返す。**
         画面には出さないが、本番で1回通す道具がこれを読む
         （2026-09-25。理由が分からず13分よけいにかかったので）。 */
      const sp: SplitOut = !now ?
        {split: null, why: "goal"} :
        total === null || island === null ?
          {split: null, why: "total"} :
          await splitOf(
            now.from, total, superchat, Number(box?.spend), island,
          );
      res.json({
        /* 焼き直しの値そのもの。**画面の額はここから出す**ので、
           島の豚が出している額と1円も違わない。読めなければ null。 */
        box,
        /* Doneru は向こうの API が持っている累計で、控えを持たない。
           **読めなかったら null。0 にしない**（`island-standards.md` 10）。 */
        doneru,
        total,
        /* いまの目標に対する内訳。**1つでも読めなければ null**（下の
           `splitOf` の頭。合わない内訳は、無いほうがマシ）。 */
        split: sp.split,
        /** 組めなかった門の名前。**画面は出さない。** 道具が読む */
        splitWhy: sp.why,
        ...page,
        goals,
      });
      return true;
    }

    /* ---- スパチャ・ドネの履歴（まぜて時系列） ----
       `?since=` を渡すと**それより後の1件ずつ**だけ返る。配信中に
       2秒おきに聞くのはこちらで、ふだんは0件で返る。 */
    if (q.method === "GET" && q.path === "/fund/feed") {
      res.json(await listFeed(q.query));
      return true;
    }

    /* ---- もう一度アラートを出す ----
       **出す中身は、こちらが台帳から組む。** 送られてくるのは
       「どの1件か」だけで、名前も額も本文も本文から読まない。
       ここを素通しにすると、**押した人が配信に好きな字を出せる**
       （`functions/src/remote.ts` の `PLACES` と同じ考え）。 */
    if (q.method === "POST" && q.path === "/fund/replay") {
      const uid = await deps.ownerUid(q.auth);
      const kind = String(q.body.kind ?? "");
      const id = docIdOf(String(q.body.id ?? ""));
      if (kind !== "superchat" && kind !== "donation" && kind !== "island") {
        res.status(400).json({error: "kind"});
        return true;
      }
      if (!id) {
        res.status(400).json({error: "id"});
        return true;
      }
      /* 出し先は**あやとのアラートボックスの合言葉**。無いなら、出す先が
         そもそも無い（OBS を1度も開いていない）。 */
      const me = uid ? (await USERS.doc(uid).get()).data() ?? {} : {};
      const key = String(me.alertboxId ?? "");
      if (!ALERTBOX_ID.test(key)) {
        res.status(409).json({error: "noalertbox"});
        return true;
      }
      const src = kind === "superchat" ? CHATS :
        kind === "donation" ? DONATIONS :
          SITE_TIPS;
      const row = await src.doc(id).get();
      /* 島の投げ銭は、**履歴に出るものだけ**（本番で、いまも `paid`）。
         テストの支払いを本番の配信に出さない（決定の記録 0017 の7）。
         欄の名前が違うので、ほかの2つと同じ欄に読み替えてから組む */
      const v: Json | null = !row.exists ? null :
        kind === "island" ? islandGot(row.data() ?? {}) : row.data() ?? {};
      if (!v) {
        res.status(404).json({error: "notfound"});
        return true;
      }
      const ref = REPLAY.doc(key);
      const cur = (await ref.get()).data() ?? {};
      /* 印はサーバーの時刻。**ただし必ず前より大きくする**——同じミリ秒に
         2件頼まれると、配信側の「前に見た印より大きいか」で2件めが
         見送られる（**押したのに出ない**）。 */
      const at = Math.max(Date.now(), (Number(cur.seq) || 0) + 1);
      /* **二度押しで二度出さない。** 同じ1件を1分のうちにもう一度
         頼まれたら、印（`seq`）を進めずにそう返す。進めなければ
         配信側は「もう出したもの」として見送る。 */
      if (cur.id === id && cur.kind === kind &&
          at - (Number(cur.seq) || 0) < REPLAY_SAME_MS) {
        res.json({already: true, seq: Number(cur.seq) || 0});
        return true;
      }
      const shown = {
        kind,
        id,
        yen: Number(v.yen) || 0,
        who: typeof v.who === "string" ? v.who : "",
        text: typeof v.text === "string" ? v.text : "",
      };
      /* **`seq` はサーバーの時刻。** 配信側は「前に見た印より大きい」
         ことと「新しいこと」の両方を見て出す（`REPLAY_FRESH_MS`）。 */
      await ref.set({...shown, seq: at, by: uid}, {merge: false});
      // **額も名前も本文も書類IDも出さない。** 出したことだけ
      logger.info("fund desk: replay queued");
      res.json({already: false, seq: at, shown});
      return true;
    }

    /* ---- 出費の続き ---- */
    if (q.method === "GET" && q.path === "/fund/spends") {
      res.json(await listSpends(q.query.limit, q.query.before));
      return true;
    }

    /* ---- 出費を1行足す ----
       **同じ日・同じ題・同じ額を2回入れても増えない**（書類IDが中身から
       決まって、`merge: true` で上書きになる）。 */
    if (q.method === "POST" && q.path === "/fund/spends") {
      const day = q.body.day;
      const title = clean(q.body.title, TITLE_MAX);
      const yen = yenOf(q.body.yen);
      if (!isDay(day)) {
        res.status(400).json({error: "day"});
        return true;
      }
      if (!title) {
        res.status(400).json({error: "title"});
        return true;
      }
      if (!yen) {
        res.status(400).json({error: "yen"});
        return true;
      }
      const id = spendId(day, title, yen);
      const had = (await SPENDS.doc(id).get()).exists;
      await SPENDS.doc(id).set({day, title, yen}, {merge: true});
      // **題も額も日付も出さない。** 増えたか、上書きだったかだけ
      logger.info(`fund desk: spend ${had ? "same" : "new"}`);
      res.json({
        spend: {id, day, title, yen},
        /** 既にあった行か。**画面は「増えていない」と言えるようになる。** */
        already: had,
        box: await rebake(),
      });
      return true;
    }

    /* ---- 出費を1行消す。**書類IDを指したときだけ。** ----
       まとめて消す道は作らない。額が動く口で「全部」を受けると、
       押し間違いが台帳ごと消す。 */
    if (q.method === "DELETE" && spendOne) {
      const id = docIdOf(spendOne[1]);
      if (!id || !(await SPENDS.doc(id).get()).exists) {
        res.status(404).json({error: "notfound"});
        return true;
      }
      await SPENDS.doc(id).delete();
      logger.info("fund desk: spend gone");
      res.json({deleted: id, box: await rebake()});
      return true;
    }

    /* ---- 目標を作る。書類IDは開始日そのもの ----
       **同時に1つ**（あやと 2026-09-24「目標は最大1です」）。

       **閉じる口は置かない。** 単独のボタンがあると、押したあと
       「目標が無い」状態ができる。目標は次のが始まったときに終わるので、
       **新しいのを作ったら、前のはここが閉じる。** 最大1が、人の手順では
       なく仕組みで守られる。

       閉じる日は**新しい目標の前の日**にする。同じ日にすると、どちらの
       期間にも入る1日ができて、内訳の足し引きが2通りになる。 */
    if (q.method === "POST" && q.path === "/fund/goals") {
      const from = q.body.from;
      const label = clean(q.body.label, LABEL_MAX);
      const yen = yenOf(q.body.yen);
      if (!isDay(from)) {
        res.status(400).json({error: "from"});
        return true;
      }
      if (!label) {
        res.status(400).json({error: "label"});
        return true;
      }
      if (!yen) {
        res.status(400).json({error: "yen"});
        return true;
      }
      const had = (await GOALS.doc(from).get()).exists;
      /* いま開いている目標を、まとめて閉じる。**`to` を書くのはここだけ。**
         ふつうは1件だが、過去に2件開いたままになっていても畳まれる。 */
      const open = (await listGoals()).filter((g) => !g.to && g.from !== from);
      const to = dayBefore(from);
      const batch = db.batch();
      for (const g of open) batch.set(GOALS.doc(g.id), {to}, {merge: true});
      /* **`to` は書かない。** 閉じてある目標を同じ日でもう一度作ったときに、
         開き直すのか中身だけ直すのかは、ここでは決められない。
         `merge: true` なので、前に入っていた `to` はそのまま残る。 */
      batch.set(GOALS.doc(from), {from, label, yen}, {merge: true});
      await batch.commit();
      logger.info(
        `fund desk: goal ${had ? "same" : "new"} (closed ${open.length})`,
      );
      res.json({
        goal: {id: from, from, to: null, label, yen},
        /** 機械が閉じた数。**画面はこれを見て「前のを終わりにした」と言う** */
        closed: open.length,
        already: had,
        box: await rebake(),
      });
      return true;
    }

    /* ---- 目標を消す。**書類IDを指したときだけ** ----
       開始日が書類IDなので、日付を打ち間違えると直せない。しかも
       **閉じるだけでは済まない**——`read_goal` はいちばん新しい `from` を
       1件見て、それが閉じていたら「目標は無し」と答える。つまり
       未来の日付で立った空の目標を閉じると、**いま走っている目標が
       島から消える。** だから消す道が要る。 */
    if (q.method === "DELETE" && goalOne) {
      const from = docIdOf(goalOne[1]);
      if (!from || !(await GOALS.doc(from).get()).exists) {
        res.status(404).json({error: "notfound"});
        return true;
      }
      await GOALS.doc(from).delete();
      logger.info("fund desk: goal gone");
      res.json({deleted: from, box: await rebake()});
      return true;
    }

    /* ---- スパチャを手で1件足す（取りこぼした晩のぶん） ----
       入る道は2本（OBS のアラートボックス・翌晩の BigQuery）あるが、
       **どちらも取りこぼす。** 両方落ちた晩のぶんはここからしか入らない。 */
    if (q.method === "POST" && q.path === "/fund/chats") {
      const day = q.body.day;
      const yen = yenOf(q.body.yen);
      const who = clean(q.body.who, WHO_MAX);
      if (!isDay(day)) {
        res.status(400).json({error: "day"});
        return true;
      }
      if (!yen) {
        res.status(400).json({error: "yen"});
        return true;
      }
      const id = manualId(day, yen, who);
      const had = (await CHATS.doc(id).get()).exists;
      await CHATS.doc(id).set(
        {
          yen,
          /* **日の始まりに置く。** 何時のスパチャかは分からないことが
             多く、分からないものに嘘の時刻を入れると、あとで並べたときに
             騙される（`python/admin/fund_add.py` と同じ）。 */
          at: `${day}T00:00:00+09:00`,
          day,
          who,
          currency: "円",
          src: "manual",
          /* **この札が無いと、翌晩の掃除が BigQuery から同じスパチャを
             拾って2件になる**（書類IDでは重ならない）。 */
          claim: claimKey(day, yen),
          claimedBy: null,
        },
        {merge: true},
      );
      logger.info(`fund desk: chat ${had ? "same" : "new"}`);
      res.json({chat: {id, day, yen, who}, already: had, box: await rebake()});
      return true;
    }

    /* ---- スパチャを1件消す。**書類IDを指したときだけ** ---- */
    if (q.method === "DELETE" && chatOne) {
      const id = docIdOf(chatOne[1]);
      if (!id || !(await CHATS.doc(id).get()).exists) {
        res.status(404).json({error: "notfound"});
        return true;
      }
      await CHATS.doc(id).delete();
      logger.info("fund desk: chat gone");
      res.json({deleted: id, box: await rebake()});
      return true;
    }
  } catch (e) {
    /* **何が落ちても、中身を出さない。** 額も名前も書類IDもログに残さない */
    logger.warn("fund desk failed", String(e));
    res.status(502).json({error: "unavailable"});
    return true;
  }

  /* 知っている頭で、知らない組み合わせ（`PUT /fund/spends` など）。
     **ここまで来たら扱いきっている**ので、次の口へは落とさない。 */
  res.status(405).json({error: "no such way"});
  return true;
}
