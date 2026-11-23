/**
 * 島で受ける投げ銭（#1405。決定の記録 0017）。
 *
 * 口は2本。`islandApi.ts` からは振り分けだけで、中身はここに置く
 * （`fundDesk.ts` `cards.ts` と同じ形。あのファイルはもう長い）。
 *
 * - `POST /tip/checkout` … ログイン済みで、YouTube のチャンネルを結んだ人だけ。
 *   Stripe の支払い画面を作って URL を返す
 * - `POST /stripe/webhook` … Stripe だけ（署名で見分ける）。払い終わった知らせを
 *   `islandSiteTips` と `islandAlertFeed` に書く。本番の支払いで、**そのとき配信して
 *   いれば**、配信のチャットにチャンネル「あやと島案内鳥」として1行書く
 *   （決定の記録 0019）
 *
 * ## 信じるもの・信じないもの
 *
 * - **名前もチャンネルも送らせない。** チャンネルは `islandUsers/{uid}.channelId`、
 *   名前はそこに並んでいるハンドル（無ければチャンネル名）を、口が引く
 *   （`docs/island-api.md` 7章「チャンネルを名乗らせない」）。読むのは `whoIs` で、
 *   `islandChannels`（配信で喋った人だけの名簿）は見ない——喋ったことのない人が
 *   名無しになるから。`islandUsers.name` は `POST /me` が YouTube の
 *   `channels?mine=true` から書いたもの（ハンドル > チャンネル名）
 * - **額は Stripe が知らせてきた額だけ。** 支払い画面を作るときに来た `yen` は
 *   Stripe に渡すだけで、どこにも控えない。払った額は Stripe が決める
 * - **知らせは生の本文で確かめる。** JSON にしてから確かめると、空白1つの違いで
 *   署名が合わなくなる（＝確かめを外したくなる）。だから `req.rawBody` を渡す
 *
 * ## テストの支払い（`livemode` が偽）
 *
 * **台帳にも豚にも、配信に出ている本番のアラートにも入れない**（`docs/island-money.md` 1章）。
 * 書くのは `islandSiteTips`（`livemode: false` の印つき）と、テスト用の合言葉の
 * `islandAlertFeed` だけ。テスト用の合言葉は `islandFundConfig/tip.testAlertboxId`。
 *
 * ## ログに素性を出さない
 *
 * 名前・額・メッセージ・uid・チャンネルID・Stripe の ID を1文字も出さない。
 * 出すのは「何の知らせを、どう扱ったか」だけ（`fundDesk.ts` と同じ決め）。
 * 配信のチャットに書いた1行も出さない（名前・額・メッセージがそのまま入っている）。
 */

import {logger} from "firebase-functions";
import * as admin from "firebase-admin";
import Stripe from "stripe";
import {GuideSaid, sayOnLiveAsGuide} from "./liveChat";

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

/* ---------------------------------------------------------------- 決まった数 */

/**
 * 1回の最小額（円）。あやとの決め（2026-11-23。決定の記録 0017 の4）。
 * 入力欄の初期値も同じ数（画面は `GET /state` の `limits.tipYenMin` から受ける）。
 * 刻みは置かない（整数ならよい）。
 */
export const TIP_YEN_MIN = 100;
/**
 * 1回の上限（円）。**あやとの決めた上限ではなく、Stripe の上限**（JPY の1回の支払いは
 * ¥99,999,999 まで）。あやとは「上限はなくていい」（Doneru も上限なし。#1405）。
 * ここで断るのは、Stripe に断られる額を支払い画面の手前で 400 にするためだけ。
 */
export const TIP_YEN_MAX = 99_999_999;
/**
 * メッセージの字数。**Doneru のあやとの設定（`msg_max_length=70`）に合わせた**（#1405）。
 * 数え方は画面の `maxLength` と同じ UTF-16 の長さ（`String.length`）。
 * 別の数え方にすると、画面で打てた字がここで 400 になる。
 */
export const TIP_MESSAGE_MAX = 70;
/**
 * 禁止ワードの数と1語の長さの線。**置き場に際限のない字を入れない**ための線で、
 * 語を選ぶ線ではない（Doneru のあやとの設定は 191語）。
 */
const NG_WORDS_MAX = 2000;
const NG_WORD_LEN = 100;
/**
 * 1人1日に作れる支払い画面の数。**投げ銭の額の上限ではない**（1人1日の上限は
 * 置かない、とあやとが決めた）。口を叩きすぎないための栓。
 */
const CHECKOUT_PER_DAY = 100;
/** アラートの1枚に残す件数。アラート画面が要るのは、出していない数件だけ。 */
const FEED_MAX = 20;
/** 支払い画面の品名。**「寄付」「ドネーション」と書かない**（決定の記録 0017「寄付と呼ばない」）。 */
const PRODUCT_NAME = "メッセージをあやとの配信のアラートに出す";
/**
 * 支払い画面の `metadata.src`。**この口が作った支払いだけを数える**ための印。
 * 同じ Stripe のアカウントで別の支払い（ダッシュボードの支払いリンクなど）が
 * 作られても、印が無ければ台帳に入れない。
 */
const TIP_SRC = "island-tip";
/** アラートの合言葉の形。`islandApi.ts` の `ALERTBOX_ID` と同じ。 */
const ALERTBOX_ID = /^[0-9a-f]{32}$/;
/** Checkout Session の ID の形。書類IDに使うので、`/` を含むものを通さない。 */
const SESSION_ID = /^cs_[A-Za-z0-9_]{1,250}$/;
/**
 * 支払いのあとに戻る先として受けるホスト。**来たホストをそのまま信じない。**
 * 関数を直に叩けば `Host` は好きに書けるので、払った人をよその場所へ
 * 送る支払い画面が作れてしまう。プレビューのチャンネル（`--` つき）も通す。
 */
const RETURN_HOST = new RegExp(
  "^(?:(?:www\\.)?ayato-arigato\\.com|" +
    "live-streaming-d3cac(?:--[a-z0-9-]+)?\\.(?:web\\.app|firebaseapp\\.com))$",
);
/** 手元で `firebase serve` を使うとき。http で戻す。 */
const LOCAL_HOST = /^(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/;
/** 当てはまらないときの戻り先。**正の URL**（`site/content/site.ts` の `SITE.url`）。 */
const HOME = "https://ayato-arigato.com";
/**
 * 配信のチャットに書くのを待つ上限（ms）。**知らせへの返事を、これより長く遅らせない。**
 *
 * 書くのは取引が済んだあと（台帳・豚・アラートはもう入っている）。チャットは
 * 添え物なので、YouTube が遅い晩に Stripe への返事を道連れにしない。
 * ふだんは配信を探す1回と書く1回で1〜2秒。上限で返ったあとに YouTube が
 * 書き終えても、それは1回目の書き込みで、2回目は起きない（再送は `already`）。
 */
export const TIP_CHAT_WAIT_MS = 4000;

/* ---------------------------------------------------------------- 入れ物 */

/** 島で受けた投げ銭。書類IDは Checkout Session の ID（**同じ知らせが2回来ても1件**）。 */
const SITE_TIPS = db.collection("islandSiteTips");
/** アラート画面がリアルタイムで購読する1枚。書類IDはアラートの合言葉。 */
const ALERT_FEED = db.collection("islandAlertFeed");
/** ログインした人。あやと（`admin`）の合言葉もここ。 */
const USERS = db.collection("islandUsers");
/** テスト用の合言葉の置き場。Doneru の鍵（`islandFundConfig/doneru`）の隣。 */
const TIP_CONFIG = db.collection("islandFundConfig").doc("tip");
/** 豚の焼き直し（`island/state.fund.box`）。 */
const STATE = db.collection("island").doc("state");

type Json = Record<string, unknown>;

/* ---------------------------------------------------------- 呼ぶ側から借りる */

/** 呼ぶ側から借りる。「誰か」と「1日の枠」を見るところを2か所に増やさないため。 */
export type TipDeps = {
  /** ログインしている人（`islandApi.ts` の `whoIs`） */
  whoIs: (
    header?: string,
  ) => Promise<{uid: string; name: string; channelId?: string} | null>;
  /** 1日の枠を1つ使う（`islandApi.ts` の `takeQuota`） */
  takeQuota: (cid: string, kind: string, limit: number) => Promise<boolean>;
  /** 制御文字を落として前後の空白を切る（`islandApi.ts` の `clean`） */
  clean: (v: unknown, max: number) => string;
};

/** 受け取るもの。Express の req から要るものだけ。 */
export type TipReq = {
  method: string;
  path: string;
  auth?: string;
  body: Json;
  /** **生の本文。** 署名はこれで確かめる */
  rawBody?: unknown;
  /** `Stripe-Signature` */
  signature?: string;
  /** 来たホスト（`X-Forwarded-Host` か `Host`） */
  host?: string;
};

/** 返す側。Express の res のうち、ここで使うものだけ。 */
export type TipRes = {
  set(k: string, v: string): unknown;
  status(n: number): TipRes;
  json(b: unknown): unknown;
};

/* ---------------------------------------------------------------- Stripe */

/** 鍵ごとに1つ。温かいインスタンスで毎回作り直さない。 */
let client: {key: string; stripe: Stripe} | null = null;

/**
 * Stripe の窓口。**鍵は呼ばれたときに読む**（入れ替えたあとの1回目から効く）。
 * @return {Stripe | null} 窓口。鍵が無ければ null
 */
function stripeOrNull(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (!key) return null;
  if (!client || client.key !== key) {
    client = {
      key,
      /* 待ちは10秒まで。支払い画面を作る人を、Stripe の遅れで1分待たせない。 */
      stripe: new Stripe(key, {timeout: 10000, maxNetworkRetries: 1}),
    };
  }
  return client.stripe;
}

/**
 * 知らせの署名を確かめて、中身を返す。**合わなければ投げる。**
 *
 * **生の本文で確かめる。** 確かめる前に JSON にしない。
 * 鍵（`STRIPE_SECRET_KEY`）は要らない——署名の鍵（`whsec_…`）だけで足りる。
 * @param {Buffer} raw 生の本文
 * @param {string} sig `Stripe-Signature`
 * @param {string} secret 署名の鍵
 * @return {Stripe.Event} 確かめた知らせ
 */
function verifiedEvent(raw: Buffer, sig: string, secret: string): Stripe.Event {
  return Stripe.webhooks.constructEvent(raw, sig, secret);
}

/* ---------------------------------------------------------------- 小さな道具 */

/**
 * 支払いのあとに戻る先。**知っているホストだけ。** 知らなければ正の URL。
 * @param {string | undefined} host 来たホスト
 * @return {string} `https://ayato-arigato.com` の形（末尾の `/` なし）
 */
const originOf = (host?: string): string => {
  const h = String(host ?? "").split(",")[0].trim().toLowerCase();
  if (RETURN_HOST.test(h)) return `https://${h}`;
  if (LOCAL_HOST.test(h)) return `http://${h}`;
  return HOME;
};

/**
 * Stripe のしくじりの種類だけ（`StripeCardError` など）。**中身は出さない**
 * （Stripe の返事には、こちらが送った字が混ざることがある）。
 * @param {unknown} e 投げられたもの
 * @return {string} 種類。分からなければ空文字
 */
const errType = (e: unknown): string =>
  String((e as {type?: unknown} | null)?.type ?? "");

/**
 * Stripe の ID を字にする。展開されて物で来ても、ID だけ取る。
 * @param {unknown} v `"pi_…"` か `{id: "pi_…"}`
 * @return {string} ID。取れなければ空文字
 */
const idOf = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && typeof (v as Json).id === "string") {
    return (v as Json).id as string;
  }
  return "";
};

/**
 * あやとのアラートの合言葉。**ちょうど1人に当たったときだけ返す。**
 *
 * `admin` が立っている人の `alertboxId`。0人なら出す先が無い（OBS を1度も
 * 開いていない）。2人以上なら、どちらが配信しているか分からないので出さない
 * （`docs/island-money.md` 3章と同じ「当てずっぽうで1人選ばない」）。
 * @return {Promise<string>} 32桁の合言葉。決まらなければ空文字
 */
async function ownerAlertbox(): Promise<string> {
  const q = await USERS.where("admin", "==", true).limit(5).get();
  const keys = q.docs
    .map((d) => String(d.data()?.alertboxId ?? ""))
    .filter((k) => ALERTBOX_ID.test(k));
  return keys.length === 1 ? keys[0] : "";
}

/** `islandFundConfig/tip` の中身。 */
type TipConfig = {
  /** テスト用の合言葉。形が違えば空文字 */
  testAlertboxId: string;
  /** 禁止ワード。**揃えたあと**（`fold`）の字で持つ */
  ngWords: string[];
};

/**
 * 比べる前に揃える。全角と半角・大文字と小文字を同じ字にする。
 * **語の側とメッセージの側に、同じ1本を当てる**（片方だけ揃えると当たらない）。
 * @param {string} s 字
 * @return {string} 揃えた字
 */
const fold = (s: string): string => s.normalize("NFKC").toLowerCase();

/**
 * `islandFundConfig/tip` を読む。**読めなくても止めない。**
 *
 * 禁止ワードの一覧は**リポジトリに置かない**（公開なので、語の一覧そのものが
 * 載ってしまう）。Doneru の配信者側の設定から写したものが、ここに入る。
 * 読めなかったときは「語が無い」として通す——ここで投げ銭ごと止めると、
 * 置き場の1回のしくじりで払う人が払えなくなる。warn には残す。
 * @return {Promise<TipConfig>} 中身。読めなければ空
 */
async function tipConfig(): Promise<TipConfig> {
  try {
    const v = (await TIP_CONFIG.get()).data() ?? {};
    const key = String(v.testAlertboxId ?? "");
    const raw = Array.isArray(v.ngWords) ? v.ngWords : [];
    const ngWords = raw
      .slice(0, NG_WORDS_MAX)
      .filter((w): w is string => typeof w === "string")
      .map((w) => fold(w).trim().slice(0, NG_WORD_LEN))
      .filter((w) => w.length > 0);
    return {testAlertboxId: ALERTBOX_ID.test(key) ? key : "", ngWords};
  } catch (e) {
    logger.warn("tip config: not read", String(e));
    return {testAlertboxId: "", ngWords: []};
  }
}

/**
 * メッセージに禁止ワードが1語でも入っているか。
 * @param {string} message メッセージ
 * @param {string[]} words 揃えたあとの語
 * @return {boolean} 入っていれば true
 */
const hasNgWord = (message: string, words: string[]): boolean => {
  if (!message || !words.length) return false;
  const m = fold(message);
  return words.some((w) => m.includes(w));
};

/**
 * 額を3桁で区切る（`1000` → `1,000`）。**`toLocaleString` を使わない**
 * （区切りが実行する場所の言語の設定で変わる）。
 * @param {number} yen 円（整数）
 * @return {string} 区切った字
 */
const yenText = (yen: number): string =>
  String(yen).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/**
 * 配信のチャットに書く1行。**形はあやとの決め**（2026-11-23。決定の記録 0019）。
 *
 *     〇〇さん ¥1,000 島の投げ銭ありやと！「メッセージ」
 *
 * Doneru が書いている `〇〇 1000 円、投げ銭ありやと！` に、メッセージを足した形。
 * メッセージが無い・禁止ワードに当たった（`text` が空）ときは「」ごと出さない。
 * 名前が無いときは「名無しさん」（「さん」を重ねない）。
 *
 * 長さは最長でも 161字（名前 64・額 ¥99,999,999・メッセージ 70）で、
 * YouTube のチャットの1行の上限（200字）に収まる。だから切らない。
 * @param {string} name アラートに出す名前。無ければ空文字
 * @param {number} yen Stripe が知らせてきた額
 * @param {string} text アラートに出すメッセージ（禁止ワードで空にしたあと）
 * @return {string} 1行
 */
export const tipChatLine = (
  name: string,
  yen: number,
  text: string,
): string =>
  `${name ? `${name}さん` : "名無しさん"} ¥${yenText(yen)} ` +
  `島の投げ銭ありやと！${text ? `「${text}」` : ""}`;

/**
 * テスト用の合言葉（`islandFundConfig/tip.testAlertboxId`）。
 *
 * **本番の合言葉と同じなら返さない。** 同じものが入っていると、テストの支払いが
 * 配信に出ている本番のアラートに出る（決定の記録 0017 の7）。
 * @param {TipConfig} conf 読んだ設定
 * @return {Promise<string>} 32桁の合言葉。無い・形が違う・本番と同じなら空文字
 */
async function testAlertbox(conf: TipConfig): Promise<string> {
  const key = conf.testAlertboxId;
  if (!key) return "";
  if (key === (await ownerAlertbox())) return "";
  return key;
}

/**
 * 手数料を引いた額（Stripe の `balance_transaction.net`）。**引けなければ null。**
 *
 * 引けなくても投げ銭は受ける（台帳の書き手が欠けた欄を null で持つ。
 * `docs/island-db.md` の `islandSiteTips`）。鍵が無い・本番とテストの鍵が
 * 食い違う・Stripe が遅い、のどれでも null。
 * @param {string} pi 支払いの ID
 * @return {Promise<number | null>} 円。引けなければ null
 */
async function settlementOf(pi: string): Promise<number | null> {
  const stripe = stripeOrNull();
  if (!stripe || !pi) return null;
  try {
    const p = await stripe.paymentIntents.retrieve(pi, {
      expand: ["latest_charge.balance_transaction"],
    });
    const charge = p.latest_charge;
    const bt = charge && typeof charge === "object" ?
      charge.balance_transaction : null;
    const net = bt && typeof bt === "object" ? Number(bt.net) : NaN;
    return Number.isInteger(net) ? net : null;
  } catch (e) {
    logger.warn("stripe settlement: not read", errType(e));
    return null;
  }
}

/* ---------------------------------------------------------------- 豚 */

/**
 * 豚に足す「島の投げ銭」の額。**焼き直しに欄が無いときに、0 を作らない。**
 *
 * `island/state.fund.box.island` は、本番の支払いを受けた口（下）が伸ばし、
 * 毎晩 `python/fund_daily.py` が `islandSiteTips` から焼き直す。
 *
 * **欄が無いのは「まだ焼いていない」で、「0円」ではない。** 欠けた欄を 0 で
 * 埋めない、は `boxOf`（`islandApi.ts`）の決めごと。ただし起点（`start`）が
 * 「0 も正しい値」なのと同じで、**本番の支払いが1件も無いと確かめられたら
 * 0 が正しい。** 本番の支払いを受けた口は必ず欄を作る（同じ取引で伸ばす）ので、
 * 欄が無いのに本番の支払いが在るのは、焼き直しが欄を落としたときだけ。
 * そのときは null を返して、豚は 503 にする（`docs/island-standards.md` 10章）。
 *
 * 欄を足した口を配った日から、毎晩の焼き直しが欄を書くまでのあいだ、
 * **豚を 503 にしない**ためにこう決めた（欄が無いだけで落とすと、その晩の配信の豚が止まる）。
 * @param {number | null} baked 焼き直しの `island`。欄が無ければ null
 * @return {Promise<number | null>} 円。決められなければ null
 */
export async function islandYenOf(
  baked: number | null,
): Promise<number | null> {
  if (baked !== null) return baked;
  try {
    const live = await SITE_TIPS.where("livemode", "==", true).limit(1).get();
    return live.empty ? 0 : null;
  } catch (e) {
    logger.warn("island tips: not read", String(e));
    return null;
  }
}

/* ---------------------------------------------------------------- 知らせ */

/** 知らせを扱った結果。**ログにはこの名前だけ出す。** */
type Outcome =
  | "written"
  | "already"
  | "unpaid"
  | "not-ours"
  | "status"
  | "no-tip"
  | "ignored";

/** 払い終わった知らせを扱った結果と、**書けたときに**配信のチャットへ書く1行。 */
type Paid = {
  outcome: Outcome;
  /** 書く1行。本番の支払いだけ。テストの支払い・この口のものでない知らせは空 */
  chat: string;
};

/**
 * 払い終わった知らせ（`checkout.session.completed`）を書く。
 *
 * **1つの取引で3つ書く。** 台帳の元（`islandSiteTips`）・アラートの1枚・豚。
 * どれか1つだけ入ると、豚とアラートと台帳が別のことを言う。
 *
 * **同じ知らせが何度来ても1件。** 書類IDが Session の ID で、取引の中で
 * 「もう在るか」を見る。在れば何も書かない（`seq` も豚も動かない）。
 * Stripe は 2xx を受け取るまで何度でも送り直してくるので、ここが要る。
 *
 * **配信のチャットには、ここでは書かない。** 書く1行を返すだけで、書くのは
 * 呼ぶ側が取引のあとに、`written` のときだけ（同じ知らせで2回書かない）。
 * @param {Stripe.Event} event 確かめた知らせ
 * @param {Function} clean 字を整える道具
 * @return {Promise<Paid>} どう扱ったかと、チャットに書く1行
 */
async function onPaid(
  event: Stripe.Event,
  clean: TipDeps["clean"],
): Promise<Paid> {
  const s = event.data.object as Stripe.Checkout.Session;
  /* カードだけを受けているので、払い終わった知らせはいつも `paid`。
     そうでないものが来たら、お金が動いていないので書かない。 */
  if (s.payment_status !== "paid") return {outcome: "unpaid", chat: ""};
  const md = (s.metadata ?? {}) as Record<string, string>;
  const yen = Number(s.amount_total);
  if (
    md.src !== TIP_SRC || !md.uid || !md.channelId ||
    !SESSION_ID.test(String(s.id)) ||
    s.currency !== "jpy" || !Number.isInteger(yen) || yen <= 0
  ) {
    return {outcome: "not-ours", chat: ""};
  }
  /* **本番かどうかは、署名を確かめた知らせの印で決める。** */
  const livemode = event.livemode === true;
  const tipRef = SITE_TIPS.doc(String(s.id));

  /* 2回目の知らせなら、Stripe を叩かずに返す（手数料を引きに行かない）。
     **守りは下の取引の中にもある。** ここは安く返すためだけ。 */
  const before = await tipRef.get();
  if (before.exists) return {outcome: "already", chat: ""};

  const conf = await tipConfig();
  const [key, settlement] = await Promise.all([
    livemode ? ownerAlertbox() : testAlertbox(conf),
    settlementOf(idOf(s.payment_intent)),
  ]);
  if (!key) {
    /* 台帳の元には書く（払われたお金は残す）。アラートに出す先が無いだけ。 */
    logger.warn(`stripe webhook: no alertbox (${livemode ? "live" : "test"})`);
  }

  /* **時刻は Stripe の値**（払い終わった知らせが作られた時刻）。 */
  const paidAt = Number(event.created) * 1000;
  const name = clean(md.name, 64);
  const who = name || "名無しさん";
  const text = clean(md.message, TIP_MESSAGE_MAX);
  /* **支払い画面を作ったあとで禁止ワードが足されたとき**のための2つめの門。
     払われたお金は受ける（台帳の元にはメッセージも残す）が、配信には
     名前と額だけを出す。**チャットの1行も同じ字から作る**（アラートと
     チャットで出す字を変えない）。 */
  const shown = hasNgWord(text, conf.ngWords) ? "" : text;
  /* **テストの支払いはチャットに書かない**（あやとの決め。決定の記録 0019）。 */
  const chat = livemode ? tipChatLine(name, yen, shown) : "";
  const iso = new Date().toISOString();
  const feedRef = key ? ALERT_FEED.doc(key) : null;

  const outcome = await db.runTransaction(async (tx) => {
    const cur = await tx.get(tipRef);
    const feed = feedRef ? await tx.get(feedRef) : null;
    if (cur.exists) return "already" as Outcome;
    tx.set(tipRef, {
      livemode,
      uid: String(md.uid),
      channelId: String(md.channelId),
      displayNameSnapshot: who,
      amount: yen,
      currency: "JPY",
      message: text,
      paidAt,
      paymentIntentId: idOf(s.payment_intent),
      settlementAmount: settlement,
      status: "paid",
      createdAt: iso,
      updatedAt: iso,
    });
    if (feedRef && feed) {
      const was = feed.exists ? feed.data() ?? {} : {};
      const seq = (Number(was.seq) || 0) + 1;
      const items = Array.isArray(was.items) ? (was.items as Json[]) : [];
      /* **1件に入れるのは、配信のアラートに出すものだけ。**
         `channelId`・`uid`・Stripe の ID は入れない（合言葉を知っていれば読める1枚）。 */
      const next = [...items, {seq, who, yen, text: shown, at: paidAt}]
        .slice(-FEED_MAX);
      tx.set(feedRef, {seq, items: next, updatedAt: iso});
    }
    /* **豚を伸ばすのは本番の支払いだけ。** スパチャが台帳に1件入るのと同じ
       「受けた口が伸ばす」形。毎晩の焼き直し（`python/fund_daily.py`）が
       `islandSiteTips` から同じ欄を数え直すので、ずれても翌朝そろう。 */
    if (livemode) {
      tx.set(
        STATE,
        {fund: {box: {island: admin.firestore.FieldValue.increment(yen)}}},
        {merge: true},
      );
    }
    return "written" as Outcome;
  });
  return {outcome, chat};
}

/** 配信のチャットに書いた結果。**ログにはこの名前と、断られた理由の札だけ。** */
type Chat = {said: GuideSaid | "failed" | "timeout"; why: string};

/**
 * YouTube が断った理由の札（`403 liveChatEnded` など）。**本文は出さない**
 * （断りの返事に、送った1行が混ざることがある）。英数字の札だけを残す。
 * @param {unknown} e 投げられたもの
 * @return {string} 札。分からなければ空文字
 */
const whyOf = (e: unknown): string => {
  const g = (e ?? {}) as {
    status?: unknown;
    code?: unknown;
    errors?: Array<{reason?: unknown}>;
  };
  const tag = (v: unknown): string =>
    String(v ?? "").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 40);
  return [tag(g.status ?? g.code), tag(g.errors?.[0]?.reason)]
    .filter(Boolean).join(" ");
};

/**
 * 配信のチャットに、案内鳥として1行書く。**投げない・上限より待たない。**
 *
 * 呼ぶのは取引が済んだあとで、知らせには 200 を返す（チャットは添え物）。
 * だから YouTube がしくじっても投げずに `failed`、遅ければ `TIP_CHAT_WAIT_MS` で
 * `timeout` を返す。**書き直しに行かない**（2回書くより、1回欠けるほうがよい）。
 * @param {string} line 書く1行
 * @return {Promise<Chat>} どうなったか
 */
async function chatTip(line: string): Promise<Chat> {
  /* **投げたものは、ここで飲む。** 上限で先に返ったあとで YouTube が
     断ってきても、拾い手のいない reject（インスタンスごと落ちる）にしない。 */
  const said: Promise<Chat> = sayOnLiveAsGuide(line).then(
    (s): Chat => ({said: s, why: ""}),
    (e): Chat => ({said: "failed", why: whyOf(e)}),
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<Chat>((done) => {
    timer = setTimeout(
      () => done({said: "timeout", why: ""}),
      TIP_CHAT_WAIT_MS,
    );
  });
  try {
    return await Promise.race([said, late]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 返金・払い戻し請求の知らせ。**`status` を直すだけ。** アラートには出さない。
 *
 * 豚と台帳から抜くかは、毎晩の焼き直しが `status` を見て決める
 * （ここで豚を減らすと、焼き直しと2か所で同じ引き算をすることになる）。
 * @param {Stripe.Event} event 確かめた知らせ
 * @return {Promise<Outcome>} どう扱ったか
 */
async function onChargeTrouble(event: Stripe.Event): Promise<Outcome> {
  let pi = "";
  let status = "";
  if (event.type === "charge.refunded") {
    const c = event.data.object as Stripe.Charge;
    /* **全額を返したときだけ。** 一部の返金は、払った額が残っている。 */
    if (!(c.amount_refunded >= c.amount)) return "ignored";
    pi = idOf(c.payment_intent);
    status = "refunded";
  } else {
    const d = event.data.object as Stripe.Dispute;
    pi = idOf(d.payment_intent);
    status = "disputed";
  }
  if (!pi) return "no-tip";
  /* 単一フィールドの `where` だけ（複合索引は作れない。#168）。 */
  const q = await SITE_TIPS.where("paymentIntentId", "==", pi).limit(2).get();
  if (q.empty) return "no-tip";
  const iso = new Date().toISOString();
  await Promise.all(
    q.docs.map((d) => d.ref.set({status, updatedAt: iso}, {merge: true})),
  );
  return "status";
}

/* ---------------------------------------------------------------- 口 */

/**
 * `/tip/checkout` と `/stripe/webhook`。扱ったら true。
 * @param {TipReq} q 受け取ったもの
 * @param {TipRes} res 返す先
 * @param {TipDeps} deps 呼ぶ側から借りるもの
 * @return {Promise<boolean>} ここで扱ったかどうか
 */
export async function handleTip(
  q: TipReq,
  res: TipRes,
  deps: TipDeps,
): Promise<boolean> {
  /* ---- 支払い画面を作る ---- */
  if (q.method === "POST" && q.path === "/tip/checkout") {
    res.set("Cache-Control", "no-store");
    /* **鍵が無いあいだは、誰が叩いても 503。** Stripe のアカウントを作る前に
       口だけ配っても、画面は「いまは投げられません」を出せる。 */
    const stripe = stripeOrNull();
    if (!stripe) {
      res.status(503).json({error: "tip not configured"});
      return true;
    }
    const who = await deps.whoIs(q.auth);
    if (!who) {
      res.status(401).json({error: "login required"});
      return true;
    }
    /* **チャンネルは口が引いたもの**（`whoIs` が `islandUsers/{uid}` から読む）。
       `body.channelId` は1度も読まない。 */
    const channelId = who.channelId ?? "";
    if (!channelId) {
      res.status(403).json({error: "channel required"});
      return true;
    }
    /* `body` から読むのは `yen` と `message` の2つだけ。 */
    const yen = q.body.yen;
    if (
      typeof yen !== "number" || !Number.isInteger(yen) ||
      yen < TIP_YEN_MIN || yen > TIP_YEN_MAX
    ) {
      res.status(400).json({error: "bad yen"});
      return true;
    }
    const rawMessage = q.body.message ?? "";
    if (typeof rawMessage !== "string") {
      res.status(400).json({error: "bad message"});
      return true;
    }
    /* **長すぎたら切らずに断る。** 黙って切ると、打った人の言葉の終わりが
       配信で消える。1字多く受けて、超えたかどうかだけを見る。 */
    const message = deps.clean(rawMessage, TIP_MESSAGE_MAX + 1);
    if (message.length > TIP_MESSAGE_MAX) {
      res.status(400).json({error: "message too long"});
      return true;
    }
    /* **払う前に断る。** 払ったあとで消すと、払った人は自分の言葉が
       なぜ出なかったか分からない。ここで 400 なら、打ち直してから払える。 */
    if (hasNgWord(message, (await tipConfig()).ngWords)) {
      res.status(400).json({error: "ng word"});
      return true;
    }
    if (!(await deps.takeQuota(who.uid, "tip", CHECKOUT_PER_DAY))) {
      res.status(429).json({error: "too many"});
      return true;
    }
    const origin = originOf(q.host);
    /* 知らせを受けた口が読むもの。**作るのはこの口だけ**なので、知らせの署名が
       合えば、ここに入れた字はこの口が入れたものだと言える。 */
    const metadata = {
      src: TIP_SRC,
      uid: who.uid,
      channelId,
      name: who.name,
      message,
    };
    try {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        /* **カードだけ**（Apple Pay・Google Pay もここに入る）。後払い
           （コンビニなど）を通すと、払い終わる前に完了の知らせが来る。
           この版（API 2026-10-28）では `payment_method_types` が無く、
           Stripe が選んだ中から絞る `allowed_payment_method_types` になった。
           知らせのほうでも `payment_status` を見るので、絞りが緩んでも
           払われていないものは書かない。 */
        allowed_payment_method_types: ["card"],
        line_items: [{
          quantity: 1,
          price_data: {
            currency: "jpy",
            unit_amount: yen,
            product_data: {name: PRODUCT_NAME},
          },
        }],
        metadata,
        /* 返金・払い戻し請求の知らせは支払いの側に付いてくるので、同じ字を写す
           （メッセージが Stripe にも残る。`docs/island-db.md` の責務の表）。 */
        payment_intent_data: {metadata},
        locale: "ja",
        success_url: `${origin}/tip?done=1`,
        cancel_url: `${origin}/tip`,
      });
      if (!session.url) throw new Error("no url");
      res.json({url: session.url});
    } catch (e) {
      /* **Stripe の返事をそのまま出さない**（送った字が混ざることがある）。 */
      logger.warn("tip checkout: stripe failed", errType(e));
      res.status(502).json({error: "stripe unavailable"});
    }
    return true;
  }

  /* ---- Stripe からの知らせ ---- */
  if (q.method === "POST" && q.path === "/stripe/webhook") {
    res.set("Cache-Control", "no-store");
    const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
    if (!secret) {
      /* 503 を返すと、Stripe は時間をおいて送り直してくる（3日）。
         鍵を入れ忘れた晩の知らせも、入れたあとに受け取れる。 */
      res.status(503).json({error: "tip not configured"});
      return true;
    }
    /* **署名が合わなければ、1バイトも書かない。** 確かめる前に何も読まない。 */
    let event: Stripe.Event;
    try {
      if (!Buffer.isBuffer(q.rawBody)) throw new Error("no raw body");
      event = verifiedEvent(q.rawBody, String(q.signature ?? ""), secret);
    } catch (e) {
      logger.warn("stripe webhook: bad signature");
      res.status(400).json({error: "bad signature"});
      return true;
    }
    let outcome: Outcome = "ignored";
    let chat = "";
    if (event.type === "checkout.session.completed") {
      const paid = await onPaid(event, deps.clean);
      outcome = paid.outcome;
      chat = paid.chat;
    } else if (
      event.type === "charge.refunded" ||
      event.type === "charge.dispute.created"
    ) {
      outcome = await onChargeTrouble(event);
    }
    /* 出すのは知らせの種類と扱いだけ。名前も額も ID も出さない。 */
    if (outcome === "not-ours" || outcome === "no-tip") {
      logger.warn(`stripe webhook: ${event.type} ${outcome}`);
    } else {
      logger.info(`stripe webhook: ${event.type} ${outcome}`);
    }
    /* **配信のチャットは、書けたときだけ。** Stripe の再送（`already`）では
       書かない。同じ知らせが同時に2通来て、両方が手前の安い門をすり抜けても、
       取引の中で `written` になるのは1通だけ。 */
    if (outcome === "written" && chat) {
      const {said, why} = await chatTip(chat);
      /* 出すのは結果の名前と札だけ。1行そのものは出さない。 */
      const note = `tip chat: ${said}${why ? ` (${why})` : ""}`;
      if (said === "said" || said === "not-live") logger.info(note);
      else logger.warn(note);
    }
    res.json({received: true, outcome});
    return true;
  }

  return false;
}
