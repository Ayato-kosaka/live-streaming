/**
 * あやと島の「動くところ」用 API。
 *
 * ブラウザから Firestore を直接触らせず、この Function を通す。
 *   - Firestore のセキュリティルールを変えずに済む(既存の月末配信ページに影響が出ない)
 *   - 連投制限・文字数制限・非表示などをサーバー側にまとめられる
 *   - 読み取りは CDN にキャッシュさせられるので Firestore の読み取り回数を抑えられる
 *
 * ログインは要求しない。1人1票と連投制限は、ブラウザが持つ端末ID(cid)で行う。
 * 厳密な本人確認ではなく「ボットの連打を止める」ためのもの。
 *
 * YouTube のアカウントでログインしている人は、それに加えて本人が分かる。
 * その場合は端末IDではなく uid を鍵にするので、端末を変えても同じ人として扱える。
 *
 * 管理操作(非表示にする・消す)はここには置かない。
 * GitHub Actions の「管理スクリプトを実行」から、
 * Firebase のサービスアカウントで直接 Firestore を触る。
 */

import {onRequest} from "firebase-functions/v2/https";
import {logger} from "firebase-functions";
import * as admin from "firebase-admin";
import {randomInt, randomUUID} from "crypto";
import {readLiveChat, sayOnLive} from "./liveChat";
import {youtube} from "./youtubeClient";
import {
  doneruYoutubeRefreshToken,
  doneruYoutubeToken,
} from "./doneruYoutube";

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

const STATE_DOC = db.collection("island").doc("state");
const IDEAS = db.collection("islandIdeas");
const NOTES = db.collection("islandNotes");
const VOTES = db.collection("islandVotes");
const RATE = db.collection("islandRate");
const USERS = db.collection("islandUsers");
const DRAFTS = db.collection("islandDrafts");
/* 企画(#161)。**「一言の提案」と「ページ1枚の下書き」を1つにした入れ物。**
   前は islandIdeas(120字・ログイン不要)と islandDrafts(12,000字・ログイン必須)に
   割れていて、一言を出したあと下書きへ進む道が無かった。同じものの粒度違いなので、
   題1つで出して、あとから日付・場所・本文・リンク・写真を足して育てられる形にする。
   名前は `/next` のルーティングに合わせてある(あやとの指定)。 */
const NEXTPLANS = db.collection("islandNextPlans");
/* 今夜のおたずね。選択肢を押すだけで意思表示できる、参加のいちばん下の段。
   作りは islandIdeas + islandVotes とまったく同じ。
   問いの入稿は Firestore を手で書く(python/admin/firestore_write.py)。 */
const POLLS = db.collection("islandPolls");
const PVOTES = db.collection("islandPollVotes");
/* 付箋のハート(#160)。1人1回だけを守るための入れ物で、
   ドキュメントIDが `<付箋のID>_<uid か端末ID>`。
   **消す＝解除。** 票(islandVotes)と違って取り消せるので、
   「押した」を数える側ではなくこちらの有無で持つ。 */
const HEARTS = db.collection("islandHearts");
/* 今日ここに来た人の数(docs/island-play.md 仕掛け16)。
   「いま何人います」は出さない。作れないうえに、たいていの時間帯は
   「1人」と出て島が寂れて見える。日単位なら数十〜数百になる。
   1日1ドキュメントに数を足すだけ。誰が来たかは持たない。 */
const VISITS = db.collection("islandVisits");

/* 北欧旅の、その日の写真(docs/nordic-photos.md)。
   貼れるのはあやとだけ。読むのは誰でも。
   写真そのものは Cloud Storage に置いて、ここには置き場と寸法だけを持つ。 */
const NPHOTOS = db.collection("nordicPhotos");
/* その日の配信でスパチャしてくれた人。BigQuery からは
   python/nordic_supporters.py が置きにくる。Doneru は自動で取れないので
   python/admin/nordic_supporter.py から手で足す。
   **持つのは「その日いた」までで、金額も順位も持たない。** */
const NDAYS = db.collection("nordicDays");
/* 北欧旅の「その日に起きたこと」(docs/nordic-depart.md)。
   `site/content/nordic.ts` の NORDIC_LOG は Git にあって、直すには
   commit して Hosting を手で起動しないと出ない。**ヒッチハイクの途中の
   あやとには、それは回らない。** 旅のあいだはここに書いて、画面が
   出てから読む。旅が終わったら、ここの中身を Git に焼き戻す。
   ドキュメントの id は旅程表の行の id(`day-1` `day-depart`)。 */
const NLOG = db.collection("nordicLog");

/* 配信のルーレット(#164)。コントローラー(あやとの手元)と
   表示(スマホ版 OBS)を繋ぐ、1人1つの入れ物。
   **ドキュメントIDがそのまま表示側の合言葉。** OBS はログインできないので、
   `GET /roulette/{id}` だけは誰でも読める。推測できない長さ(128ビット)にして、
   id を知っている人だけが読める形にする。
   id は `islandUsers/{uid}.rouletteId` に控えて**ずっと変えない**。
   毎回変わると、配信のたびに OBS の URL を貼り替えることになって、
   この機能が無くしたかった手間がそのまま戻る。 */
const ROULETTE = db.collection("rouletteSessions");

/* 写真の置き場。Functions の Admin SDK はルールを迂回するので、
   ブラウザから Storage を直接触らせない(Firestore と同じ形)。
   バケットはこの Function が動いているプロジェクトの既定のもの。 */
const BUCKET =
  process.env.NORDIC_BUCKET ||
  `${process.env.GCLOUD_PROJECT || "live-streaming-d3cac"}.firebasestorage.app`;

/** 1枚あたりの上限。ブラウザ側で長辺1600pxの webp に焼いてから送る。 */
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
/** 写真に添える一言。長い文章の置き場ではない。 */
const MAX_PHOTO_NOTE = 120;
/** 1日に貼れる枚数。「何枚でも」だが、事故で無限には入らないようにする。 */
const PHOTOS_PER_DAY = 120;

/** 島の景色。`docs/island-world.md` 1.3 の表がそのまま入る。ここに無い値は入れない。 */
const ISLAND_THEMES = ["georgia", "nordic", "desert"];

/** その日に起きたこと。**スマホの親指で打つものなので、長さで縛る。**
   長い文章は配信で話すものであって、ここに置くものではない。 */
const MAX_LOG_BODY = 400;
/** 1日に書き直せる回数。書き直しは普通に起きるので、写真より緩くする。 */
const LOGS_PER_DAY = 60;

/* 北欧旅の足代(docs/nordic-fund.md 提案5)。
   doneruAmount は cors: true なのでブラウザから直接叩けるが、叩かせない。
   静的書き出しのページに Doneru の goal key を焼き込むことになるので、
   鍵は Functions の中に置いたまま、こちらから叩いて数字だけ返す。 */
const DONERU_GOAL = "https://api.doneru.jp/widget/goal/data";
/* 鍵の出どころ。**GitHub の Secrets には置かない**（GitHub #110 はそれ待ちで
   止まっていた）。配信の OBS（app/alertbox）が読んでいるのと同じ GAS の表から
   実行時に引く。こうすると鍵を2か所で持たずに済み、あやとが表を書きかえれば
   サイトも配信も同時に追随する。
   **金額そのものは GAS から取らない。** あちらはスパチャを配信の演出上、
   半額で数えている。サイトは満額で数える決まりなので(下の /fund の注)、
   ここから借りるのは鍵だけにする。 */
const GAS_GOALS =
  "https://script.google.com/macros/s/" +
  "AKfycbycK8SzzuTbs6z-DUmju7eFjb4qXQPACCeq3PCWPTmZwtUxwokDgqnVa3uPl0UhBNEj" +
  "/exec?table=Goals&id=2025-10-24";
/** Doneru を叩き直す間隔。1人ずつ叩くと相手先に迷惑なので、しばらく寝かせる。 */
const FUND_TTL_MS = 5 * 60 * 1000;
let fundCache: {at: number; doneru: number} | null = null;
/** 豚の貯金箱の1件ぶん。**サイトはここを配信とそっくり同じに読む。** */
type GoalRec = {key: string; start: number; superchat: number; goal: number};
/* 鍵は変わらないが、スパチャの額は増える。**Doneru と同じ間隔で読み直す。** */
let goalCache: GoalRec | null = null;
let goalAt = 0;

/**
 * Doneru の goal key を取る。環境変数があればそれ、無ければ GAS の表から。
 * @return {Promise<string>} 鍵。取れなければ空文字
 */
async function goalRecord(): Promise<GoalRec | null> {
  if (goalCache && Date.now() - goalAt < FUND_TTL_MS) return goalCache;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(GAS_GOALS, {signal: ctl.signal});
    if (!r.ok) throw new Error(`gas ${r.status}`);
    const j = (await r.json()) as {data?: Json};
    const d = j.data ?? {};
    const k = String(d.doneruGoalKey ?? "");
    if (!/^[0-9a-f]{16,64}$/.test(k)) throw new Error("bad key");
    const n = (v: unknown, def = 0) => {
      const x = Number(v);
      return Number.isFinite(x) ? x : def;
    };
    goalCache = {
      key: k,
      start: n(d.startAmount),
      superchat: n(d.superChatAmount),
      goal: n(d.targetAmount, 50000),
    };
    goalAt = Date.now();
    return goalCache;
  } catch (e) {
    logger.warn("goal record read failed", String(e));
    // 前に読めた値があれば、そちらを使う。数字が消えるより古いほうがまし
    return goalCache;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Doneru の goal key を取る。環境変数があればそれ、無ければ GAS の表から。
 * @return {Promise<string>} 鍵。取れなければ空文字
 */
async function doneruKeyOnly(): Promise<string> {
  const env = process.env.DONERU_GOAL_KEY ?? "";
  if (env) return env;
  return (await goalRecord())?.key ?? "";
}

const MAX_IDEA_LEN = 200;
const MAX_NOTE_LEN = 120;
const MAX_NAME_LEN = 20;
/* YouTube のハンドル(`@あやとグルメアプリ`)。
   ハンドルは最大30文字なので、`@` を足して31。名前(20)より長い。
   **切り詰めると別人の名前になる**ので、覚えておく側はここまで受ける。 */
const MAX_HANDLE_LEN = 31;
const MAX_DRAFT_LEN = 12000;
const DRAFTS_PER_DAY = 12;
const IDEAS_PER_DAY = 8;
const NOTES_PER_DAY = 20;
// 1人1票なので投票そのものは重複しない。ここは連打してくるボットを止めるためだけの数。
const POLL_VOTES_PER_DAY = 30;

/* ---- テーマ付きの付箋(#160) ----
   `【ポーランド】` を人が自分で発明していたのは、入力欄に宛先が無かったから。
   宛先を正式な欄（`theme`）にして、仕分けを本文の推測から外す。

   テーマの表そのものは Git（`site/content/themes.ts`）にある。
   サーバーは形だけを見て、知らないテーマも受け取る。**表と突き合わせない。**
   突き合わせると、表を1行足すたびに Functions のデプロイが要る
   （画面だけ先に出ると、その日ぶんの付箋がまるごと 400 で消える）。 */
const THEME_ID = /^[a-z][a-z0-9-]{1,39}$/;
/** 返信。あやとが旅の途中に親指で打つものなので、付箋より少しだけ長い。 */
const MAX_REPLY_LEN = 300;
/** 1日に貼れる付箋。企画の提案より軽い行為なので、提案(8)より多くしてある。 */
const STICKIES_PER_DAY = 20;
/* 1日に押せるハート。**押し直し（解除）も1回ぶん使う。**
   使わないと、同じ付箋で押す・外すを繰り返して書き込みを無限に起こせる。 */
const HEARTS_PER_DAY = 120;

/* ---- 企画(#161) ----
   題だけで出せて、あとから育てられる。**ログインは要らない。** */

/** 1件ぶんの上限。旧 islandDrafts と同じ。ページ1枚ぶんの字が入る。 */
const MAX_PLAN_LEN = 12000;
/** 題。**これだけあれば出せる。** 1行で出すときはここしか埋まらない。 */
const MAX_PLAN_TITLE = 60;
/** 1日に出せる企画。書くのは付箋より重い行為なので、付箋(20)より少なくする。 */
const PLANS_PER_DAY = 12;
/**
 * ログインしていない人が、自分の出した企画を直せる時間(#161・あやと承認済み)。
 *
 * ログインしていれば `uid` が本人の証になるが、していなければ端末の印(`cid`)しか
 * 無い。印を推測できれば他人の企画を直せてしまうので、**書いた直後の書き直しだけ**
 * を通して、時間が経ったものは書いた本人でも触れないようにする。
 * なりすませる窓を短くするのと引き換えに、「あとから育てる」を24時間ぶん残す。
 */
const PLAN_EDIT_MS = 24 * 60 * 60 * 1000;
/**
 * 企画の段。**提案 → これから → やった が1本**(#159 で決めた形)。
 *
 * 値を日本語にしないのは、画面に出す言い方を変えたときに
 * 入れ物の中身まで書き換えることになるため。表示名は画面側が持つ。
 */
const PLAN_STATUS = ["proposed", "next", "done"] as const;
/**
 * Git 側の企画の id(`site/content/plans.ts` の `PLANS`、
 * `site/content/legends.ts` の `LEGENDS`)。
 *
 * **提案がページとして立ったときだけ、あやとが結び付ける。**
 * これが無いと「これから」に上がった提案と、実際に立っているページが
 * 画面の上で他人のままになる。
 */
const GIT_PLAN_ID = /^[a-z0-9][a-z0-9-]{1,39}$/;

/* ---- 面ごとの「押すだけの問い」----
   北欧のわかれ道（区間ごとの「どっちにしてほしい？」）で作った入れ物。
   islandPolls / islandPollVotes をそのまま借りて、`at` の札で仕分ける。
   新しいコレクションは作らない。

   **島の外の紙の面からも同じ入れ物を使う。** 台所の「次のスタンプ」も
   丘の「もう一度やるなら」も、聞いていることが違うだけで、
   サーバー側の仕事は「id ごとに札の数を数える」で同じ。
   面ごとに口を増やすと、長さ制限も連投制限も面の数だけ書くことになる。
   仕分けの札（`at`）は id の頭から取る。画面が名乗った文字をそのまま
   書かないのは、知らない札が増えるとあとで数えるものが分からなくなるため。

   **問いの字も選択肢の字も、ここには置かない。** 字は Git
   (`site/content/nordic.ts`・各面のページ)にあって、レビューを通ってから出る。
   サーバーが持つのは id と数だけなので、
   ここに人の書いた字が溜まることがない。 */
const FORK_AT = ["nordic", "kitchen", "legends", "streams"] as const;
const FORK_ID = new RegExp(`^(${FORK_AT.join("|")})-[a-z0-9-]{3,40}$`);
const FORK_OPTION = /^[a-z][a-z0-9-]{0,15}$/;
/**
 * 1つの問いに置ける選択肢の数。知らない札が増えていくのを止める。
 *
 * 北欧のわかれ道は2つだが、丘の「もう一度やるなら」は4つ、
 * 台所は種類のぶんだけ増える見込みがあるので、上限は8にしてある。
 */
const FORK_MAX_OPTIONS = 8;
const FORK_VOTES_PER_DAY = 30;

/**
 * id の頭から仕分けの札を取る。`FORK_ID` を通ったものしか渡さない。
 * @param {string} id 問いの id（"kitchen-next-kind" のような形）
 * @return {string} 仕分けの札（"kitchen"）
 */
const forkAt = (id: string): string => id.slice(0, id.indexOf("-"));

type Json = Record<string, unknown>;

/** ログインしている人。していなければ null。 */
type Who = {uid: string; name: string; channelId?: string} | null;

/**
 * Authorization ヘッダの合言葉を確かめて、誰かを返す。
 * 合言葉が無い・古い場合は黙って null を返す(ログインなしでも使えるので)。
 * @param {string | undefined} header Authorization ヘッダ
 * @return {Promise<Who>} ログインしている人
 */
async function whoIs(header?: string): Promise<Who> {
  const m = /^Bearer (.+)$/.exec(header ?? "");
  if (!m) return null;
  try {
    const t = await admin.auth().verifyIdToken(m[1]);
    const snap = await USERS.doc(t.uid).get();
    const saved = snap.exists ? snap.data() ?? {} : {};
    return {
      uid: t.uid,
      /* ハンドルが分かっていれば、それがこの人の名前。
         `name` には古い Google の表示名が残っている人がいるので、
         保存し直すのを待たずにここで追い越す。 */
      name:
        clean(saved.handle ?? "", MAX_HANDLE_LEN) ||
        clean(saved.name ?? t.name ?? "", MAX_NAME_LEN) ||
        "名無しさん",
      channelId: (saved.channelId as string) || undefined,
    };
  } catch (e) {
    logger.warn("token verify failed", String(e));
    return null;
  }
}

/**
 * 島に名前を出してよいと決めた人だけを返す。
 *
 * 名前も YouTube のアイコンも、出すか出さないかは本人が決める。
 * 何もしていない人は、キャラクターだけが島にいて名前は出ない。
 *
 * **キャラクターが誰のものかは、ここでは決めない。** 割り当てはあやとが
 * 表で持っていて、`site/content/residents.ts` に焼いてある。ログインで
 * 分かるのは「この YouTube チャンネルの人が、名前を出してよいと言った」
 * までで、それがどの絵の人かは向こう側で突き合わせる。
 * 本人に絵を選ばせると、他人の絵を自分のものにできてしまう。
 *
 * **uid も返す。** 「いま島にいる人」(docs/island-here.md)は islandHere/{uid} に
 * 居場所だけを書く。名前とアイコンをそちらに書かせると他人を名乗れるので、
 * 誰なのかはここで返したものと uid で突き合わせて、読む側が決める。
 * カスタムクレームにチャンネルIDを入れる手もあるが、そちらは
 * setCustomUserClaims と再ログインが要る。ここに1つ足すほうが軽い。
 * 出るのは「名前かアイコンを出してよい」と本人が言った人だけなので、
 * 何もしていない人の uid はここに出ない。
 * @return {Promise<Json[]>} uid・チャンネルと、出してよい名前・アイコン
 */
async function listResidents(): Promise<Json[]> {
  const snap = await USERS.where("channelId", "!=", null).limit(500).get();
  const out: Json[] = [];
  snap.forEach((d) => {
    const u = d.data() ?? {};
    if (!u.channelId) return;
    if (!u.showName && !u.showPhoto) return;
    out.push({
      uid: d.id,
      channelId: u.channelId,
      name: u.showName ?
        (u.nickname as string) || (u.name as string) || null :
        null,
      photo: u.showPhoto ? (u.photo as string) || null : null,
    });
  });
  return out;
}

/**
 * 企画の日付を「2026-09-11」の形にそろえる。
 *
 * **桁が揃っていないと並び順が壊れる。** 日付は文字のまま比べているので
 * (`site/content/plans.ts` の `localeCompare`)、`2026-9-11` は
 * `2026-10-01` より後ろに並ぶ。画面が日付を選ばせる形になっても、
 * 古い口から来たものと、すでに入っているものが残るので、
 * **入れ物の手前でそろえる。** 日付として読めないものは持たない。
 * @param {unknown} v 送られてきた日付
 * @return {string} YYYY-MM-DD。読めなければ空
 */
const shapeDay = (v: unknown): string => {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(clean(v, 10));
  if (!m) return "";
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return "";
  return `${m[1]}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

/**
 * 企画ページの中身を、保存してよい形に整える。
 *
 * **旧 `islandDrafts` と、新しい `islandNextPlans`(#161)の両方が通る。**
 * 入れ物は分かれているが、切りそろえる形はまったく同じものなので、
 * ここを2つに割らない(割ると、片方だけ上限が変わる日が来る)。
 *
 * 中身の良し悪しは、あやとが仕上げるときに直す。ここでやるのは長さと形だけ。
 * **足りない欄は空で返る。** 題1つで出した企画も、この形で入る。
 * @param {Json} b 送られてきた中身
 * @return {Json} 保存する形
 */
function shapeDraft(b: Json): Json {
  const arr = (v: unknown, n: number, f: (x: Json) => Json) =>
    Array.isArray(v) ? v.slice(0, n).map((x) => f((x ?? {}) as Json)) : [];
  const place = (b.place ?? {}) as Json;
  return {
    title: clean(b.title, MAX_PLAN_TITLE),
    when: clean(b.when, 40),
    date: shapeDay(b.date),
    note: clean(b.note, 200),
    tags: Array.isArray(b.tags) ?
      b.tags.slice(0, 6).map((t) => clean(t, 16)) :
      [],
    place: {
      name: clean(place.name, 60),
      area: clean(place.area, 60),
      map: clean(place.map, 300),
    },
    about: Array.isArray(b.about) ?
      b.about.slice(0, 8).map((p) => clean(p, 600)) :
      [],
    links: arr(b.links, 8, (x) => ({
      label: clean(x.label, 60),
      href: clean(x.href, 300),
    })),
    photos: arr(b.photos, 8, (x) => ({
      src: clean(x.src, 400),
      alt: clean(x.alt, 120),
      credit: clean(x.credit, 120),
      creditHref: clean(x.creditHref, 300),
    })),
    embeds: arr(b.embeds, 4, (x) => ({
      kind: x.kind === "youtube" ? "youtube" : "instagram",
      id: clean(x.id, 40),
      note: clean(x.note, 120),
    })),
  };
}

/**
 * 島の「1日」。UTC で切ってある。
 *
 * 日本時間の朝9時で変わるので、**配信の一晩（22時〜25時）が1日の中に収まる**。
 * JST で切ると 0時をまたいだ配信が2日に割れて、連投制限も訪問者数も夜中に半分になる。
 * 画面に出す日付は JST（`site/lib/nightly.ts`）だが、こちらは数える側の都合で決める。
 * @return {string} YYYY-MM-DD
 */
const today = () => new Date().toISOString().slice(0, 10);

/**
 * 制御文字を落として、長さを切る。
 * @param {unknown} v 入力
 * @param {number} max 最大文字数
 * @return {string} 整えた文字列
 */
const clean = (v: unknown, max: number): string => {
  let out = "";
  for (const ch of String(v ?? "")) {
    const c = ch.codePointAt(0) ?? 0;
    if (c < 0x20 || c === 0x7f) continue;
    out += ch;
  }
  return out.trim().slice(0, max);
};

/* ---- YouTube のハンドル(`@あやとグルメアプリ`) ----
   島に出す名前は、Google アカウントの表示名(`ayato_arigato`)ではなく
   **YouTube のハンドル**にする。配信で見えているのがそちらなので、
   Google の表示名で並んでいると、誰のことなのか本人にも分からない。 */

/**
 * `channels.list` の `customUrl` を、ハンドルの形にそろえる。
 *
 * ハンドルが付く前からあるチャンネルは `@` の無い名前が返ることがある。
 * 名前として出すときに `@` の有無で揺れると、同じ人が2通りに見える。
 * @param {unknown} v `snippet.customUrl`
 * @return {string} `@` から始まるハンドル。取れなければ空
 */
const handleOf = (v: unknown): string => {
  const s = clean(v, MAX_HANDLE_LEN).replace(/^[/@]+/, "");
  return s ? `@${s}`.slice(0, MAX_HANDLE_LEN) : "";
};

/**
 * チャンネルIDから、いまのハンドルを引く。
 *
 * **ログインし直さずに直せるようにするために要る。** ブラウザから
 * `channels.list(mine=true)` を呼べるのはログインを押した瞬間だけで、
 * その場を逃すと古い名前のまま何日も直らない。ハンドルは公開の
 * `snippet` に入っているので、あやとの合言葉で動くこのクライアントから
 * 誰のぶんでも引ける。
 * @param {string} channelId YouTube のチャンネルID
 * @return {Promise<string>} ハンドル。取れなければ空
 */
async function fetchHandle(channelId: string): Promise<string> {
  try {
    const r = await youtube.channels.list({
      part: ["snippet"],
      id: [channelId],
    });
    return handleOf(r.data.items?.[0]?.snippet?.customUrl);
  } catch (e) {
    // 取れなくてもログインは通す。名前が古いままなだけなので
    logger.warn("handle lookup failed", channelId, String(e));
    return "";
  }
}

/**
 * x-forwarded-for から最初のIPだけ取る。
 * @param {unknown} v ヘッダの値
 * @return {string | null} IP か null
 */
const fwd = (v: unknown): string | null =>
  String(v ?? "").split(",")[0]?.trim() || null;

/**
 * 端末IDとして妥当か。
 * @param {unknown} v 入力
 * @return {boolean} 妥当なら true
 */
const isCid = (v: unknown): boolean =>
  typeof v === "string" && v.length >= 8 && v.length <= 64;

/**
 * 「あとから直せる」の鍵として使ってよい端末IDか(#161)。
 *
 * ふつうの `isCid` より厳しくする。あちらは連投を止めるための印なので
 * 8文字でも役に立つが、こちらは**それを知っていれば他人の企画を直せる**鍵になる。
 * ブラウザが作るのは `crypto.randomUUID()`(36文字・122ビット)なので、
 * 長さで縛れば総当たりは成り立たない。localStorage が使えない端末が返す
 * "anon" のような合言葉は、ここで落ちる(全員が同じ鍵を持つことになるため)。
 * @param {unknown} v 入力
 * @return {boolean} 鍵として使えるなら true
 */
const isStrongCid = (v: unknown): boolean =>
  typeof v === "string" &&
  v.length >= 24 &&
  v.length <= 64 &&
  /^[A-Za-z0-9_-]+$/.test(v);

/**
 * cid ごとの1日あたり回数を1つ消費する。
 * @param {string} cid ブラウザが持つ端末ID
 * @param {string} kind 種別(idea / note)
 * @param {number} limit 1日あたりの上限
 * @return {Promise<boolean>} 上限内なら true
 */
async function takeQuota(
  cid: string,
  kind: string,
  limit: number,
): Promise<boolean> {
  const ref = RATE.doc(`${kind}_${today()}_${cid}`);
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const n = (snap.exists ? (snap.data()?.n as number) : 0) ?? 0;
      if (n >= limit) return false;
      const at = Date.now();
      tx.set(ref, {n: n + 1, kind, day: today(), updatedAt: at}, {merge: true});
      return true;
    });
  } catch (e) {
    logger.error("takeQuota failed", e);
    return false;
  }
}

/**
 * 1ページぶんの読み取りの返り。
 *
 * `more` が true なら、**まだ古いものが残っている**。
 * ここを持たせるためだけにこの型がある。前は上限を超えたぶんを黙って
 * 捨てていたので、人が書いた1行が、書いた本人にも分からないまま
 * 読めなくなっていた。「まだ在る」と言えれば、画面はそう言える。
 */
type Page<T> = {items: T[]; more: boolean; next: string | null};

/**
 * 続きの位置。`createdAt` だけだと、同じミリ秒に2件入ったときに
 * ページの境目で1件飛ぶ。書き出すときは書類の id も添える。
 * @param {FirebaseFirestore.QueryDocumentSnapshot} d 最後に返した書類
 * @return {string} 続きの位置を表す文字列
 */
function cursorOf(d: FirebaseFirestore.QueryDocumentSnapshot): string {
  return `${(d.get("createdAt") as number) ?? 0}_${d.id}`;
}

/**
 * `before=...` で受け取った続きの位置を、Firestore の並びに戻す。
 * 読めない値は「頭から」として扱う。外から来る文字列なので落とさない。
 * @param {unknown} v クエリで受け取った値
 * @return {[number, string] | null} createdAt と書類 id の組
 */
function parseCursor(v: unknown): [number, string] | null {
  const m = /^(\d{1,15})_(.+)$/.exec(String(v ?? ""));
  if (!m) return null;
  return [Number(m[1]), m[2]];
}

/**
 * 新しい順に1ページぶん取る。非表示のぶんは飛ばして数を揃える。
 *
 * **`limit * 2` を1回引くだけ、という取り方はしない。** 非表示が半分を
 * 超えると、まだ在るのに「これで全部」と言ってしまう。足りなければ
 * 続きを引き直して、上限に当たったことだけを `more` で返す。
 * @param {FirebaseFirestore.Query} col 読む場所。`where` で絞ったあとでもよい
 * @param {number} limit 1ページの件数
 * @param {unknown} before 続きの位置(`cursorOf` が書いたもの)
 * @param {Function} shape 書類を返す形に直す関数
 * @param {Function} [skip] 飛ばす書類。hidden の判定には足す形で効く
 * @return {Promise<Page<T>>} 1ページぶん
 */
async function pageOf<T>(
  col: FirebaseFirestore.Query,
  limit: number,
  before: unknown,
  shape: (d: FirebaseFirestore.QueryDocumentSnapshot) => T,
  skip?: (d: FirebaseFirestore.QueryDocumentSnapshot) => boolean,
): Promise<Page<T>> {
  // where + orderBy の組み合わせは複合インデックスが要るので、
  // 並べ替えだけ Firestore に任せて、非表示の除外はこちらで行う。
  // 同じ時刻の書類が並んだときのために、id を第2の並び順に足しておく
  // (単一フィールドの索引で足りる。複合索引は増えない)。
  const base = col
    .orderBy("createdAt", "desc")
    .orderBy(admin.firestore.FieldPath.documentId(), "desc");
  const from = parseCursor(before);
  let scan: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  const items: T[] = [];
  let last: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  let more = false;
  // 非表示だらけでも止まるように、引き直す回数に蓋をする。
  for (let round = 0; round < 8 && !more; round++) {
    let q = base;
    if (scan) q = q.startAfter(scan);
    else if (from) q = q.startAfter(from[0], from[1]);
    const snap = await q.limit(limit + 1).get();
    if (snap.empty) break;
    for (const d of snap.docs) {
      scan = d;
      if (d.get("hidden") === true) continue;
      if (skip?.(d)) continue;
      if (items.length >= limit) {
        more = true;
        break;
      }
      items.push(shape(d));
      last = d;
    }
    if (snap.size <= limit) break;
  }
  return {items, more, next: more && last ? cursorOf(last) : null};
}

/**
 * 企画提案1件を、画面に返す形に直す。
 * @param {FirebaseFirestore.QueryDocumentSnapshot} d 書類
 * @return {object} 企画提案
 */
function ideaShape(d: FirebaseFirestore.QueryDocumentSnapshot) {
  const v = d.data();
  return {
    id: d.id,
    text: v.text as string,
    name: (v.name as string) || undefined,
    byUid: (v.uid as string) || undefined,
    votes: (v.votes as number) ?? 0,
    status: (v.status as string) ?? "open",
    createdAt: new Date((v.createdAt as number) ?? Date.now()).toISOString(),
  };
}

/**
 * 付箋1件を、画面に返す形に直す。
 * @param {FirebaseFirestore.QueryDocumentSnapshot} d 書類
 * @return {object} 付箋
 */
function noteShape(d: FirebaseFirestore.QueryDocumentSnapshot) {
  const v = d.data();
  return {
    id: d.id,
    planId: v.planId as string,
    text: v.text as string,
    createdAt: new Date((v.createdAt as number) ?? Date.now()).toISOString(),
  };
}

/**
 * 表示できる企画提案を新しい順に1ページぶん取る。
 * @param {unknown} limit 1ページの件数
 * @param {unknown} before 続きの位置
 * @return {Promise<Page<object>>} 企画提案の1ページ
 */
function listIdeas(limit: unknown = 120, before?: unknown) {
  return pageOf(IDEAS, clampPage(limit), before, ideaShape);
}

/**
 * 表示できる付箋を新しい順に1ページぶん取る。**企画に貼られたぶんだけ。**
 *
 * 同じコレクションに、テーマ付きの付箋(#160)が並んで入っている。
 * あちらは `planId` を持たないので、ここで拾うと画面の側で
 * 「もう表に無い企画」の棚に落ちる。**入れ物が同じでも、口は分ける。**
 * @param {unknown} limit 1ページの件数
 * @param {unknown} before 続きの位置
 * @return {Promise<Page<object>>} 付箋の1ページ
 */
function listNotes(limit: unknown = 200, before?: unknown) {
  return pageOf(
    NOTES,
    clampPage(limit),
    before,
    noteShape,
    (d) => !d.get("planId"),
  );
}

/** テーマ付きの付箋1枚。画面に返す形(#160)。 */
type StickyShape = {
  id: string;
  theme: string;
  text: string;
  /** 名乗った名前。名乗っていなければ無い */
  by?: string;
  hearts: number;
  /** 運営者が立てた付箋か。おたずねの選択肢はこれ */
  byOwner: boolean;
  /** あやとからの返信。1つだけ */
  reply?: string;
  repliedAt?: string;
  /** しまってあるか。**しまっても消えない**ので、戻すときに要る */
  archived?: boolean;
  createdAt: string;
};

/**
 * テーマ付きの付箋を、画面に返す形に直す。
 *
 * **`cid` と `uid` は返さない。** 誰が書いたかは名乗った名前だけで足りる。
 * 端末IDを返すと、同じ人の付箋を並べて数えられる。
 * @param {FirebaseFirestore.QueryDocumentSnapshot} d 書類
 * @return {StickyShape} 付箋
 */
function stickyShape(d: FirebaseFirestore.QueryDocumentSnapshot): StickyShape {
  const v = d.data();
  const reply = clean(v.reply, MAX_REPLY_LEN);
  return {
    id: d.id,
    theme: (v.theme as string) ?? "",
    text: (v.text as string) ?? "",
    by: (v.by as string) || undefined,
    hearts: Math.max(0, Math.floor(Number(v.hearts ?? 0)) || 0),
    byOwner: v.byOwner === true,
    reply: reply || undefined,
    repliedAt: v.repliedAt ?
      new Date(v.repliedAt as number).toISOString() :
      undefined,
    archived: v.archived === true ? true : undefined,
    createdAt: new Date((v.createdAt as number) ?? Date.now()).toISOString(),
  };
}

/**
 * テーマ付きの付箋を1ページぶん取る。
 *
 * **しまったもの(`archived`)は出さない。** 出すのは、あやたが戻すときだけ
 * (`archived=1`)。消さずにしまう決めなので、入れ物には残っている。
 * @param {object} q 引きかた
 * @param {string} [q.theme] テーマの id。無ければテーマ横断の新着
 * @param {boolean} [q.archived] しまったぶんだけを出す
 * @param {boolean} [q.byHearts] ハートの多い順にする
 * @param {unknown} [q.limit] 1ページの件数
 * @param {unknown} [q.before] 続きの位置
 * @return {Promise<Page<StickyShape>>} 付箋の1ページ
 */
async function listStickies(q: {
  theme?: string;
  archived?: boolean;
  byHearts?: boolean;
  limit?: unknown;
  before?: unknown;
}): Promise<Page<StickyShape>> {
  const limit = clampPage(q.limit);
  const want = !!q.archived;
  const base: FirebaseFirestore.Query = q.theme ?
    NOTES.where("theme", "==", q.theme) :
    NOTES;
  /* **テーマで絞るときは、Firestore に並べ替えさせない。**
     where("theme") と orderBy を組むと複合インデックスが要る。
     そのインデックスは本番に配られていない（サービスアカウントに
     インデックスを作る権限が無く、403 で落ちる）。
     並べ替えを頼むと、その場で 500 になって**テーマの付箋が1枚も出ない。**

     1テーマぶんは多くて数百枚なので、引いてから手元で並べれば足りる。
     こうしておくと、権限が付いてインデックスが配られても何も変わらないし、
     付かなくても画面は動く。**画面の生き死にを、権限の有無に賭けない。**

     続きの位置（before）も持たない。位置は createdAt で書いてあるが、
     1テーマを1回で引き切るので送る先が無い。 */
  if (q.theme) {
    const snap = await base.limit(300).get();
    const rows = snap.docs
      .filter((d) => d.get("hidden") !== true)
      .filter((d) => (d.get("archived") === true) === want);
    rows.sort((a, b) =>
      q.byHearts ?
        (Number(b.get("hearts")) || 0) - (Number(a.get("hearts")) || 0) :
        (Number(b.get("createdAt")) || 0) - (Number(a.get("createdAt")) || 0),
    );
    return {
      items: rows.slice(0, limit).map(stickyShape),
      more: false,
      next: null,
    };
  }
  return pageOf(
    base,
    limit,
    q.before,
    stickyShape,
    /* テーマの無い付箋（企画に貼られた旧来のぶん）は、この口からは出さない。
       テーマ横断の新着（`theme` を渡さないとき）で混ざるのを止める。 */
    (d) => !d.get("theme") || (d.get("archived") === true) !== want,
  );
}

/**
 * 1ページの件数を、外から来た値でも安全な範囲に収める。
 * @param {unknown} v 件数
 * @return {number} 1〜300 の整数
 */
function clampPage(v: unknown): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n <= 0) return 60;
  return Math.min(300, n);
}

/* ---- 企画(#161) ---- */

/** 企画1件。画面に返す形。**`cid` は返さない**(付箋と同じ理由)。 */
type PlanShape = {
  id: string;
  title: string;
  when: string;
  date: string;
  note: string;
  tags: string[];
  place: {name: string; area: string; map: string};
  about: string[];
  links: {label: string; href: string}[];
  photos: {src: string; alt: string; credit: string; creditHref: string}[];
  embeds: {kind: string; id: string; note: string}[];
  /** 名乗った名前。名乗っていなければ無い */
  by?: string;
  /**
   * ログインして出した人。**これがあると、端末の印では直せない。**
   * 画面が「じぶんが出したもの」を見分けるのにも使う(付箋と違って直せるので要る)。
   */
  byUid?: string;
  hearts: number;
  /** 提案 → これから → やった */
  status: string;
  /** ページとして立ったときの、Git 側の企画の id */
  planId?: string;
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
};

/**
 * 企画を、画面に返す形に直す。
 * @param {FirebaseFirestore.QueryDocumentSnapshot} d 書類
 * @return {PlanShape} 企画
 */
function planShape(
  d:
    | FirebaseFirestore.QueryDocumentSnapshot
    | FirebaseFirestore.DocumentSnapshot,
): PlanShape {
  const v = d.data() ?? {};
  const arr = <T>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);
  const place = (v.place ?? {}) as Json;
  const created = (v.createdAt as number) ?? Date.now();
  return {
    id: d.id,
    title: (v.title as string) ?? "",
    when: (v.when as string) ?? "",
    /* 読むときもそろえる。**すでに入っている `2026-9-11` を、
       書き直してもらうまで待たない。** 桁が揃わないまま返すと、
       いちばん近い企画も「あと何日」も並び順で狂う。 */
    date: shapeDay(v.date),
    note: (v.note as string) ?? "",
    tags: arr<string>(v.tags),
    place: {
      name: (place.name as string) ?? "",
      area: (place.area as string) ?? "",
      map: (place.map as string) ?? "",
    },
    about: arr<string>(v.about),
    links: arr<{label: string; href: string}>(v.links),
    photos: arr<{src: string; alt: string; credit: string; creditHref: string}>(
      v.photos,
    ),
    embeds: arr<{kind: string; id: string; note: string}>(v.embeds),
    by: (v.by as string) || undefined,
    byUid: (v.uid as string) || undefined,
    hearts: Math.max(0, Math.floor(Number(v.hearts ?? 0)) || 0),
    status: PLAN_STATUS.includes(v.status as typeof PLAN_STATUS[number]) ?
      (v.status as string) :
      "proposed",
    planId: (v.planId as string) || undefined,
    archived: v.archived === true ? true : undefined,
    createdAt: new Date(created).toISOString(),
    updatedAt: new Date((v.updatedAt as number) ?? created).toISOString(),
  };
}

/**
 * 企画を新しい順に1ページぶん取る。
 *
 * **並べ替えを Firestore に頼まない。** `where` と `orderBy` を組むと複合索引が
 * 要るが、その索引はサービスアカウントに作る権限が無くて配れない(#168)。
 * 付箋(`listStickies`)と同じく、しまったぶんの除外は手元でやる。
 * ハートの多い順も画面側で並べ替える(1回で全部引くので、そこで足りる)。
 * @param {object} q 引きかた
 * @param {boolean} [q.archived] しまったぶんだけを出す
 * @param {unknown} [q.limit] 1ページの件数
 * @param {unknown} [q.before] 続きの位置
 * @return {Promise<Page<PlanShape>>} 企画の1ページ
 */
function listPlans(q: {
  archived?: boolean;
  limit?: unknown;
  before?: unknown;
}): Promise<Page<PlanShape>> {
  const want = !!q.archived;
  return pageOf(
    NEXTPLANS,
    clampPage(q.limit),
    q.before,
    planShape,
    (d) => (d.get("archived") === true) !== want,
  );
}

/** 直せるか。直せないときは、なぜ直せないかまで返す。 */
type PlanGuard = "ok" | "expired" | "no";

/**
 * その人が、その企画を直してよいか(#161・あやと承認済み)。
 *
 * > ログインしていれば `uid` で守る。していなければ `cid` で、直せるのは24時間だけ
 *
 * ログインして出したものは、あとで端末の印だけで直せてはいけない。
 * 印は localStorage にあるだけなので、そちらのほうが弱い証だから。
 * @param {Json} cur いまの中身
 * @param {Who} who ログインしている人
 * @param {unknown} cid 送られてきた端末ID
 * @param {boolean} owner あやとか
 * @return {PlanGuard} 直せるか
 */
function canEditPlan(
  cur: Json,
  who: Who,
  cid: unknown,
  owner: boolean,
): PlanGuard {
  if (owner) return "ok";
  const uid = (cur.uid as string) || "";
  if (uid) return who?.uid === uid ? "ok" : "no";
  const mine = isStrongCid(cid) && cur.cid === cid;
  if (!mine) return "no";
  const created = Number(cur.createdAt ?? 0);
  return Date.now() - created <= PLAN_EDIT_MS ? "ok" : "expired";
}

/** 投票の中身。集計そのものはドキュメントの votes に入っている。 */
type PollShape = {
  id: string;
  question: string;
  options: {id: string; label: string; votes: number}[];
  total: number;
  /** 締め切り。過ぎたものは出さない */
  openUntil: string | null;
};

/**
 * 問いを、そのまま画面に出せる形に整える。
 * @param {string} id ドキュメントID
 * @param {Json} v ドキュメントの中身
 * @return {PollShape} 整えた問い
 */
function shapePoll(id: string, v: Json): PollShape {
  const votes = (v.votes ?? {}) as Record<string, number>;
  const raw = Array.isArray(v.options) ? v.options : [];
  const options = raw.slice(0, 4).map((o) => {
    const x = (o ?? {}) as Json;
    const oid = clean(x.id, 24);
    return {id: oid, label: clean(x.label, 40), votes: votes[oid] ?? 0};
  });
  return {
    id,
    question: clean(v.question, 80),
    options,
    total: options.reduce((n, o) => n + o.votes, 0),
    openUntil: (v.openUntil as string) || null,
  };
}

/**
 * いま出ている問い。締め切り前で、隠していないもののうち新しい1つ。
 *
 * where + orderBy を組むと複合インデックスが要るので、
 * 並べ替えだけ Firestore に任せて、締め切りの判定はこちらで行う。
 * @return {Promise<PollShape | null>} 問い、無ければ null
 */
async function openPoll(): Promise<PollShape | null> {
  const snap = await POLLS.orderBy("createdAt", "desc").limit(12).get();
  const now = new Date().toISOString();
  for (const d of snap.docs) {
    const v = d.data() ?? {};
    // at の付いたものは、どこか別の面のわかれ道（いまは北欧のみ）。
    // 島の「今夜のおたずね」はこれを拾わない。同じ入れ物を使っているだけで、
    // 問いの文も選択肢の字も持っていないので、出しても空の問いになる。
    if (v.at) continue;
    if (v.hidden === true) continue;
    if (v.openUntil && String(v.openUntil) < now) continue;
    const p = shapePoll(d.id, v);
    if (p.question && p.options.length >= 2) return p;
  }
  return null;
}

/**
 * わかれ道の票を、数だけの表に直す。
 *
 * ドキュメントの中身は誰でも増やせる形なので、そのまま返さない。
 * 札の形が合っているものの、0より大きい整数だけを通す。
 * @param {unknown} v ドキュメントの votes
 * @return {Record<string, number>} 札ごとの数
 */
function forkCounts(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  const raw = (v ?? {}) as Record<string, unknown>;
  for (const k of Object.keys(raw).slice(0, FORK_MAX_OPTIONS)) {
    if (!FORK_OPTION.test(k)) continue;
    const n = Math.floor(Number(raw[k]));
    if (Number.isFinite(n) && n > 0) out[k] = n;
  }
  return out;
}

/**
 * Doneru に集まっている額。鍵が無い・届かないときは null。
 *
 * 0 を返さない。0円と出すのがいちばん悪くて、誰も出していないように見える
 * (`docs/nordic-fund.md` 提案5)。分からないときは「分からない」で返す。
 * @return {Promise<number | null>} 集まっている額(円)
 */
async function doneruNow(): Promise<number | null> {
  const key = await doneruKeyOnly();
  if (!key) return null;
  if (fundCache && Date.now() - fundCache.at < FUND_TTL_MS) {
    return fundCache.doneru;
  }
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(
      `${DONERU_GOAL}?key=${encodeURIComponent(key)}`,
      {signal: ctl.signal},
    );
    if (!r.ok) throw new Error(`doneru ${r.status}`);
    const j = (await r.json()) as Json;
    const n = Number(j.amount);
    if (!Number.isFinite(n) || n < 0) throw new Error("bad amount");
    fundCache = {at: Date.now(), doneru: n};
    return n;
  } catch (e) {
    logger.warn("doneru goal read failed", String(e));
    // 前に読めた値があれば、そちらを使う。数字が消えるより古いほうがまし
    return fundCache?.doneru ?? null;
  } finally {
    clearTimeout(t);
  }
}

/* ---- 北欧旅の、その日の写真(docs/nordic-photos.md) ---- */

/**
 * 「2026-09-12」の形か。日付がそのまま置き場の名前になるので厳しく見る。
 * @param {unknown} v 入力
 * @return {boolean} 日付の形なら true
 */
const isDay = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * あやとか。写真を貼れるのはこの人だけ。
 *
 * `islandUsers/{uid}.admin` を見る。下書き(`/drafts`)がすでにこの形なので、
 * 判定を増やさずそこに寄せる。`admin` はコンソールからしか立たない。
 * @param {string | undefined} header Authorization ヘッダ
 * @return {Promise<string | null>} あやとなら uid、違えば null
 */
async function ownerUid(header?: string): Promise<string | null> {
  const m = /^Bearer (.+)$/.exec(header ?? "");
  if (!m) return null;
  try {
    const t = await admin.auth().verifyIdToken(m[1]);
    const snap = await USERS.doc(t.uid).get();
    return snap.data()?.admin ? t.uid : null;
  } catch (e) {
    logger.warn("owner token verify failed", String(e));
    return null;
  }
}

/* ---------------- ルーレット(#164) ----------------
   配信のルーレットを、URL を書き換えずにコントローラーから回す。

   **当たりはここで決める。** いままではブラウザの中の
   `Math.floor(Math.random() * n)` で決まっていたので、OBS を
   読み込み直すと結果が変わった。コントローラーから回す形では
   「回した」と「結果が出た」が別の瞬間になるので、サーバーで決めて
   Firestore に書き、表示側は読むだけにする。 */

/** 選択肢の上限。いまのルーレットが 36 で打ち止めなので、それに合わせる。 */
const ROULETTE_MAX = 36;
/** 1つの選択肢の長さ。輪の上では9文字で切れるが、結果のコメントには全文が出る。 */
const ROULETTE_LABEL = 60;
/** 結果を配信にコメントするまでの待ち。配信のラグに合わせてあやとが選ぶ。 */
const ROULETTE_WAITS = [5, 10, 15];
/** 回っている秒数と周の数。あやとがふだん使っている URL の値を既定にする。 */
const ROULETTE_SPIN = {duration: 15, turns: 10};
/** 色。写した4種以外は受けない(`site/components/roulette/wheel.ts` と同じ並び)。 */
const ROULETTE_THEMES = ["classic", "ocean", "berry", "sunset"];
/** 回すと決めてから、表示側が回り始めるまでの猶予。
    表示側は1秒ごとに読みにくるので、いま回すと言うと初めの一瞬を飛ばす。 */
const ROULETTE_LEAD = 1200;
/**
 * 結果のコメントの文面。**決まりの出どころは `site/content/roulette.ts`。**
 * あちらの1行を直せば文面が変わるように、コントローラーから型を送らせる。
 * ここにあるのは、それが届かなかったときの最後の受け皿。
 */
const ROULETTE_SAY = "ルーレットの結果、『{}』に決まりました";

/** ルーレットの選択肢1つ。手で足したものには名前もアイコンも無い。 */
type RouletteItem = {
  id: string;
  label: string;
  name: string;
  icon: string;
  byHand: boolean;
};

/**
 * 送られてきた選択肢を、保存してよい形に整える。
 *
 * **手で足したものは、名前とアイコンを空にする**(#164 のコメント)。
 * あやとが足したものを、誰かが言ったように見せない。
 * @param {unknown} raw 送られてきた1件
 * @return {RouletteItem | null} 整えたもの。中身が無ければ null
 */
function rouletteItem(raw: unknown): RouletteItem | null {
  const v = (typeof raw === "object" && raw ? raw : {}) as Json;
  const label = clean(v.label, ROULETTE_LABEL);
  if (!label) return null;
  const byHand = v.byHand === true;
  return {
    id: clean(v.id, 64) || randomUUID(),
    label,
    name: byHand ? "" : clean(v.name, 40),
    icon: byHand ? "" : clean(v.icon, 300),
    byHand,
  };
}

/**
 * 表示側とコントローラーに返す形。
 *
 * **チャットの栞と持ち主の uid は返さない。** `GET /roulette/{id}` は
 * ログイン無しで読めるので、ここに入れたものは id を知る人全員に見える。
 * @param {string} id セッションの id
 * @param {Json} v 保存してある中身
 * @return {Json} 画面に出すぶん
 */
function rouletteShape(id: string, v: Json): Json {
  return {
    id,
    status: v.status ?? "準備中",
    items: (v.items as RouletteItem[]) ?? [],
    wait: Number(v.wait) || ROULETTE_WAITS[1],
    duration: Number(v.duration) || ROULETTE_SPIN.duration,
    turns: Number(v.turns) || ROULETTE_SPIN.turns,
    theme: (v.theme as string) || "classic",
    sound: v.sound !== false,
    result: (v.result as string) ?? null,
    resultIndex: typeof v.resultIndex === "number" ? v.resultIndex : null,
    spunAt: Number(v.spunAt) || null,
    postAt: Number(v.postAt) || null,
    posted: v.posted === true,
    updatedAt: Number(v.updatedAt) || 0,
  };
}

/**
 * Doneru の鍵が入っているかを、鍵を見せずに伝える。
 *
 * **鍵そのものは返さない。** 入れ直したいときに「いま入っているのは
 * どれか」が分からないと困るので、末尾4文字だけを見せる。
 * @param {unknown} key しまってある鍵
 * @return {Json} 画面に出すぶん
 */
function doneruHint(key: unknown): Json {
  const s = String(key ?? "");
  return {set: !!s, tail: s ? s.slice(-4) : ""};
}

/**
 * 結果のコメント1行を組み立てる。
 * @param {unknown} template `{}` を1つ持つ型
 * @param {string} label 当たった選択肢
 * @return {string} 配信に投げる文
 */
function rouletteText(template: unknown, label: string): string {
  const t = clean(template, 160);
  const form = t.includes("{}") ? t : ROULETTE_SAY;
  return form.replace("{}", label).slice(0, 190);
}

/**
 * 指定の時刻まで待つ。**待つのは結果のコメントを投げる前だけ。**
 * @param {number} ms 待つ長さ
 * @return {Promise<void>} 待ち
 */
const naps = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, Math.max(0, ms)));

/**
 * Storage に置いた写真の、誰でも読める URL。
 *
 * バケットは公開にしない。Firebase の「ダウンロードの合言葉」を
 * ファイルの metadata に付けて、それを知っている人だけが読める形にする。
 * この URL は `access-control-allow-origin: *` を返すので、
 * `<img crossOrigin="anonymous">` で canvas に描いても canvas が汚れない。
 * @param {string} path バケットの中の置き場
 * @param {string} token ダウンロードの合言葉
 * @return {string} 画像の URL
 */
const photoUrl = (path: string, token: string): string =>
  "https://firebasestorage.googleapis.com/v0/b/" +
  `${BUCKET}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;

/** 画面に出す1枚ぶん。 */
type PhotoShape = {
  id: string;
  day: string;
  url: string;
  w: number;
  h: number;
  note: string;
  at: number;
};

/**
 * 貼ってある写真を、日ごとにまとめて返す。
 *
 * **写真のある日しか返さない。** 旅は10日あるが、まだ何も起きていない日に
 * 「まだありません」を並べても読む人には何も無い(docs/nordic-photos.md 7章)。
 * @return {Promise<Json[]>} 新しい日が先の、日ごとの写真と、その日いた人
 */
async function listPhotoDays(): Promise<Json[]> {
  const snap = await NPHOTOS.orderBy("at", "desc").limit(400).get();
  const byDay = new Map<string, PhotoShape[]>();
  snap.forEach((d) => {
    const v = d.data() ?? {};
    if (!isDay(v.day) || typeof v.url !== "string") return;
    const list = byDay.get(v.day) ?? [];
    list.push({
      id: d.id,
      day: v.day,
      url: v.url,
      w: Number(v.w) || 0,
      h: Number(v.h) || 0,
      note: (v.note as string) || "",
      at: Number(v.at) || 0,
    });
    byDay.set(v.day, list);
  });
  if (byDay.size === 0) return [];
  // その日いた人。写真のある日のぶんだけ引く
  const days = [...byDay.keys()].sort().reverse();
  const [people, residents] = await Promise.all([
    db.getAll(...days.map((d) => NDAYS.doc(d))),
    listResidents(),
  ]);
  /* **名前は、出してよいと言った人のぶんだけ返す。**
     BigQuery から来る author_name は、本人が島に名前を出すと決めたかどうかと
     関係なく取れてしまう。ここでそのまま返すと、「その日スパチャした人」の
     一覧が、本人の断りなく名前つきで並ぶことになる。
     出すと決めた人(islandUsers の showName)だけを通す。
     名前が出ない人も、キャラクターの絵は出る。自分の絵は自分で分かる。 */
  const named = new Map<string, string>();
  residents.forEach((r) => {
    const id = r.channelId as string;
    if (id && r.name) named.set(id, r.name as string);
  });
  const peopleOf = new Map<string, Json[]>();
  people.forEach((p) => {
    const arr = (p.data()?.people ?? []) as Json[];
    peopleOf.set(
      p.id,
      arr.slice(0, 60).map((x) => {
        const channelId = clean(x.channelId, 64) || null;
        return {
          channelId,
          icon: clean(x.icon, 80) || null,
          name: (channelId && named.get(channelId)) || null,
        };
      }),
    );
  });
  return days.map((day) => ({
    day,
    // 撮った順に見たいので、その日の中は古いほうから
    photos: (byDay.get(day) ?? []).sort((a, b) => a.at - b.at),
    people: peopleOf.get(day) ?? [],
  }));
}

export const islandApi = onRequest(
  {region: "us-central1", cors: true, maxInstances: 10},
  async (req, res) => {
    // Hosting の rewrite 経由でも直叩きでも動くように、前置きのパスを落とす
    const path = (req.path || "/").replace(/^\/island-api/, "") || "/";
    const method = req.method.toUpperCase();
    const raw = req.body;
    const body: Json =
      typeof raw === "object" && raw ? (raw as Json) : ({} as Json);

    try {
      /* ---------------- ログイン ---------------- */
      // ログインした直後に呼ばれる。誰が来たかを覚えておくだけ。
      if (method === "POST" && path === "/me") {
        const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? "");
        if (!m) {
          res.status(401).json({error: "no token"});
          return;
        }
        let t;
        try {
          t = await admin.auth().verifyIdToken(m[1]);
        } catch {
          res.status(401).json({error: "bad token"});
          return;
        }
        const channelId = clean(body.channelId, 64);
        const now = Date.now();
        const ref = USERS.doc(t.uid);
        const prev = await ref.get();
        const was = prev.data() ?? {};
        const patch: Json = {
          lastSeenAt: now,
          firstSeenAt: prev.exists ? was.firstSeenAt ?? now : now,
        };
        /* すでに入っている人のハンドルを、ログインし直さずに補う。
           ブラウザからハンドルが取れるのはログインを押した瞬間だけなので、
           それを逃した人はここでしか直らない。**1日に1回まで。**
           引けなかったときに毎回叩きにいくと、その人が来るたび
           YouTube の割り当てを削ることになる。 */
        let handle = clean(body.handle, MAX_HANDLE_LEN);
        const known = channelId || (was.channelId as string) || "";
        if (!handle && !was.handle && known && was.handleAt !== today()) {
          patch.handleAt = today();
          handle = await fetchHandle(known);
        }
        /* 名前は **ハンドル > チャンネル名 > Google の表示名** の順。
           **送られてこなかったものでは上書きしない。** ここは空の body でも
           叩かれる口（`loadMe`）なので、無条件に `t.name` へ落とすと、
           画面を開くたびに Google アカウントの表示名で塗り戻していた。 */
        const name =
          handle ||
          clean(body.title, MAX_NAME_LEN) ||
          clean(was.name ?? t.name ?? "", MAX_NAME_LEN);
        if (handle) patch.handle = handle;
        if (name) patch.name = name;
        if (channelId) patch.channelId = channelId;
        if (body.thumbnail !== undefined) {
          patch.photo = clean(body.thumbnail, 300) || null;
        }
        // 島での見え方。出すか出さないかは、本人が決める。
        if (body.nickname !== undefined) {
          patch.nickname = clean(body.nickname, MAX_NAME_LEN) || null;
        }
        if (body.showName !== undefined) patch.showName = !!body.showName;
        if (body.showPhoto !== undefined) patch.showPhoto = !!body.showPhoto;
        await ref.set(patch, {merge: true});
        const saved = {...was, ...patch};
        res.json({
          uid: t.uid,
          /* **保存してあるほうを返す。** 空の body で叩いたときは
             `name`/`channelId` が本文から取れないので、そこだけ返すと
             「ログインし直すまで自分のチャンネルが分からない」画面ができる。
             じぶんのこと(`/me` の面)は、ここでキャラクターを突き合わせる。 */
          name: name || (saved.name as string) || "",
          /** YouTube のハンドル。画面はこれがあれば名前として出す */
          handle: (saved.handle as string) || undefined,
          channelId: (saved.channelId as string) || undefined,
          photo: (saved.photo as string) || undefined,
          nickname: (saved.nickname as string) ?? null,
          showName: !!saved.showName,
          showPhoto: !!saved.showPhoto,
          /* あやとか。**画面に道具を出すかどうかだけに使う。**
             実際に書けるかは、書く先のルート側でもう一度見ている。
             ここを信じて権限を決めているわけではない。 */
          admin: !!saved.admin,
        });
        return;
      }

      /* ---------------- 企画ページの下書き(旧) ----------------
         **役目は `/nextplans` に移った**(#161)。あちらはログインが要らず、
         題1つでも出せて、あとから育てられる。ここは
         「あやとが書いていいよと決めた人だけ・ログイン必須」のままの古い口。

         画面(`/next/new`)はもう新しいほうを見ているが、Functions と Hosting は
         別々に手で起動するので、片方だけ出た日に 404 で止まらないよう残してある。
         畳むのは #171。**本番の `islandDrafts` は0件**なので、移すものは無い。 */
      if (path === "/drafts" || path.startsWith("/drafts/")) {
        const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? "");
        if (!m) {
          res.status(401).json({error: "no token"});
          return;
        }
        let t;
        try {
          t = await admin.auth().verifyIdToken(m[1]);
        } catch {
          res.status(401).json({error: "bad token"});
          return;
        }
        const meSnap = await USERS.doc(t.uid).get();
        const me = meSnap.data() ?? {};
        if (!me.canDraft && !me.admin) {
          res.status(403).json({error: "not allowed"});
          return;
        }

        if (method === "GET" && path === "/drafts") {
          const q = me.admin ?
            DRAFTS.orderBy("updatedAt", "desc").limit(80) :
            DRAFTS.where("uid", "==", t.uid).limit(40);
          const snap = await q.get();
          res.json({
            drafts: snap.docs.map((d) => ({id: d.id, ...(d.data() ?? {})})),
          });
          return;
        }

        if (method === "POST" && path === "/drafts") {
          const body2 = body;
          if (JSON.stringify(body2).length > MAX_DRAFT_LEN) {
            res.status(400).json({error: "too long"});
            return;
          }
          const draft = shapeDraft(body2);
          if (!(draft.title as string)) {
            res.status(400).json({error: "no title"});
            return;
          }
          if (!(await takeQuota(t.uid, "draft", DRAFTS_PER_DAY))) {
            res.status(429).json({error: "too many"});
            return;
          }
          const id = clean(body2.id, 40);
          const now = Date.now();
          const ref = id ? DRAFTS.doc(id) : DRAFTS.doc();
          if (id) {
            const cur = await ref.get();
            if (cur.exists && cur.data()?.uid !== t.uid && !me.admin) {
              res.status(403).json({error: "not yours"});
              return;
            }
          }
          await ref.set(
            {
              ...draft,
              uid: t.uid,
              by: clean(me.nickname ?? me.name ?? t.name ?? "", MAX_NAME_LEN),
              updatedAt: now,
              createdAt: id ? undefined : now,
            },
            {merge: true},
          );
          res.json({id: ref.id, draft});
          return;
        }

        res.status(404).json({error: "not found"});
        return;
      }

      /* ---------------- 北欧旅の、その日の写真 ----------------
         貼れるのはあやとだけ。読むのは誰でも(docs/nordic-photos.md 3章)。

         写真は Storage に置く。ブラウザから Storage を直接触らせないのは
         Firestore と同じ理由で、ルールを増やさずにここ1か所で締められるから。
         縮めて webp に焼くのはブラウザ側でやる。元のままの写真が
         回線に乗ることも、置き場に残ることも無い。 */
      if (method === "GET" && path === "/nordic/photos") {
        res.set(
          "Cache-Control",
          "public, max-age=30, s-maxage=60, stale-while-revalidate=300",
        );
        res.json({days: await listPhotoDays()});
        return;
      }

      if (method === "POST" && path === "/nordic/photos") {
        const uid = await ownerUid(req.headers.authorization);
        if (!uid) {
          res.status(403).json({error: "not allowed"});
          return;
        }
        const day = body.day;
        if (!isDay(day)) {
          res.status(400).json({error: "bad day"});
          return;
        }
        // data URL で来ても、中身だけで来ても受ける
        const b64 = String(body.image ?? "").replace(/^data:[^,]*,/, "");
        let buf: Buffer;
        try {
          buf = Buffer.from(b64, "base64");
        } catch {
          res.status(400).json({error: "bad image"});
          return;
        }
        if (buf.length < 1024 || buf.length > MAX_PHOTO_BYTES) {
          res.status(400).json({error: "bad size"});
          return;
        }
        /* 何の絵かを、送られてきた名前ではなく**中身の頭**で見る。
           ここを名乗りで済ませると、置き場に何でも置けるようになる。

           **webp だけにしない。** iOS の Safari は
           `canvas.toDataURL("image/webp")` を黙って png に落とすことがあり、
           そこを弾いていたので**あやとの iPhone から1枚も貼れなかった**
           （本番で「1枚目でつまずきました。焼けなかった」）。
           旅の途中に貼るのはその iPhone なので、webp が出ない端末を
           締め出すほうが害が大きい。jpeg も受ける。 */
        const kind =
          buf.subarray(0, 4).toString("ascii") === "RIFF" &&
          buf.subarray(8, 12).toString("ascii") === "WEBP" ?
            "webp" :
            buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff ?
              "jpeg" :
              null;
        if (!kind) {
          res.status(400).json({error: "not an image"});
          return;
        }
        if (!(await takeQuota(uid, "nphoto", PHOTOS_PER_DAY))) {
          res.status(429).json({error: "too many today"});
          return;
        }
        const ref = NPHOTOS.doc();
        const path2 = `nordic/photos/${day}/${ref.id}.${kind}`;
        const token = randomUUID();
        await admin
          .storage()
          .bucket(BUCKET)
          .file(path2)
          .save(buf, {
            contentType: `image/${kind}`,
            metadata: {
              // 置き場の名前に id が入っていて中身は変わらないので、
              // ブラウザにも CDN にも長く持たせてよい
              cacheControl: "public, max-age=31536000, immutable",
              metadata: {firebaseStorageDownloadTokens: token},
            },
          });
        const photo = {
          day,
          path: path2,
          url: photoUrl(path2, token),
          w: Math.max(0, Math.min(20000, Number(body.w) || 0)),
          h: Math.max(0, Math.min(20000, Number(body.h) || 0)),
          note: clean(body.note, MAX_PHOTO_NOTE),
          at: Date.now(),
          uid,
        };
        await ref.set(photo);
        res.set("Cache-Control", "no-store");
        res.json({photo: {id: ref.id, ...photo}});
        return;
      }

      const photoMatch = path.match(/^\/nordic\/photos\/([A-Za-z0-9_-]{6,})$/);
      if (method === "DELETE" && photoMatch) {
        const uid = await ownerUid(req.headers.authorization);
        if (!uid) {
          res.status(403).json({error: "not allowed"});
          return;
        }
        const ref = NPHOTOS.doc(photoMatch[1]);
        const snap = await ref.get();
        const p = snap.data();
        if (!snap.exists || typeof p?.path !== "string") {
          res.status(404).json({error: "not found"});
          return;
        }
        /* 先に置き場から消す。Firestore だけ消えて実体が残ると、
           もう誰からも見えないのに URL を知っている人には見え続ける。 */
        await admin
          .storage()
          .bucket(BUCKET)
          .file(p.path)
          .delete({ignoreNotFound: true});
        await ref.delete();
        res.set("Cache-Control", "no-store");
        res.json({id: ref.id});
        return;
      }

      /* ---------------- 北欧旅の、その日に起きたこと ----------------
         書けるのはあやとだけ。読むのは誰でも(docs/nordic-depart.md)。

         **なぜ Git ではなくここか。** `site/content/nordic.ts` の NORDIC_LOG は
         直すのに commit と Hosting の手動起動が要る。旅の最中のあやとは
         ヒッチハイクをしていて、それは回らない。ここなら、その日の宿から
         スマホで1回書けば出る。旅が終わったら Git に焼き戻す。 */
      if (method === "GET" && path === "/nordic/log") {
        const snap = await NLOG.orderBy("at", "asc").limit(60).get();
        res.set(
          "Cache-Control",
          "public, max-age=30, s-maxage=60, stale-while-revalidate=300",
        );
        res.json({
          log: snap.docs.map((d) => {
            const v = d.data() ?? {};
            return {
              day: d.id,
              date: isDay(v.date) ? v.date : undefined,
              body: String(v.body ?? ""),
              video: (v.video as string) || undefined,
              at: Number(v.at) || 0,
            };
          }),
        });
        return;
      }

      if (method === "POST" && path === "/nordic/log") {
        const uid = await ownerUid(req.headers.authorization);
        if (!uid) {
          res.status(403).json({error: "not allowed"});
          return;
        }
        /* 旅程表の行の id。字の形だけを見る。ここに旅程表そのものを
           持ってくると、Git を直すたびに Functions も出し直しになる。 */
        const day = String(body.day ?? "");
        if (!/^day-[a-z0-9-]{1,16}$/.test(day)) {
          res.status(400).json({error: "bad day"});
          return;
        }
        /* 改行だけは残す。2〜3行で書くものなので、全部つながると読めない。
           空行が続くのは事故なので1つに畳む。 */
        const text = String(body.body ?? "")
          .replace(/[^\S\n]+/g, " ")
          .replace(/\n{3,}/g, "\n\n")
          .split("\n")
          .map((ln) => clean(ln, MAX_LOG_BODY))
          .join("\n")
          .trim()
          .slice(0, MAX_LOG_BODY);
        if (!text) {
          res.status(400).json({error: "no body"});
          return;
        }
        const date = isDay(body.date) ? body.date : undefined;
        /* YouTube の videoId。URL を貼られても id だけ拾う。
           取れなければ**入れない**。壊れた見に行き先を出すより、出さないほうがいい。 */
        const vid = /([A-Za-z0-9_-]{11})/.exec(String(body.video ?? ""));
        if (!(await takeQuota(uid, "nlog", LOGS_PER_DAY))) {
          res.status(429).json({error: "too many today"});
          return;
        }
        const ref = NLOG.doc(day);
        const rec: Json = {body: text, uid, updatedAt: Date.now()};
        if (date) rec.date = date;
        rec.video = vid ? vid[1] : null;
        /* `at` は**書いた順**で、並び順に使っている(GET /nordic/log)。
           書き直すたびに入れ替えると、直した日だけが日記のいちばん下に
           落ちる。初めて書いたときだけ入れる。 */
        if (!(await ref.get()).exists) rec.at = Date.now();
        await ref.set(rec, {merge: true});
        res.set("Cache-Control", "no-store");
        res.json({
          log: {day, date, body: text, video: vid ? vid[1] : undefined},
        });
        return;
      }

      const logMatch = path.match(/^\/nordic\/log\/(day-[a-z0-9-]{1,16})$/);
      if (method === "DELETE" && logMatch) {
        const uid = await ownerUid(req.headers.authorization);
        if (!uid) {
          res.status(403).json({error: "not allowed"});
          return;
        }
        await NLOG.doc(logMatch[1]).delete();
        res.set("Cache-Control", "no-store");
        res.json({day: logMatch[1]});
        return;
      }

      /* 北欧旅の、日付で言える2つの事実。**着いた日と、旅が終わった日は別。**
         あやとの言葉(2026-09-06)「ストックホルム出るまでが北欧旅です」。
         9/20 に着いて、そこから7泊して 9/27 に発つ。着いた日で企画を
         終わらせると、いちばん長い滞在がまるごと「もう行ってきた」になる。

         どちらも空の日付で送ると取り消せる。押し間違いは普通に起きるので、
         戻せない口にはしない。 */
      const factMatch = path.match(/^\/nordic\/(arrived|ended)$/);
      if (method === "POST" && factMatch) {
        const uid = await ownerUid(req.headers.authorization);
        if (!uid) {
          res.status(403).json({error: "not allowed"});
          return;
        }
        const raw = String(body.date ?? "");
        if (raw && !isDay(raw)) {
          res.status(400).json({error: "bad date"});
          return;
        }
        const key = factMatch[1] === "ended" ? "endedOn" : "arrivedOn";
        await STATE_DOC.set(
          {nordic: {[key]: raw || null, updatedAt: Date.now()}},
          {merge: true},
        );
        res.set("Cache-Control", "no-store");
        res.json({[key]: raw});
        return;
      }

      /* いま、どこにいるか(#163)。**旅の途中に、あやとがスマホから書きかえる。**

         ここは GitHub Actions の「あやと島の『いま』を更新」と
         `python/admin/firestore_write.py` からしか動かせなかった。
         ヒッチハイクの途中でワークフローを起動するのは回らないので、
         その日のことを書く口(`/nordic/log`)と同じ場所に置く。

         **`week`(今週の予定)には触らない。** あれは何行もある字なので、
         片手で打つものではない。触るのは「いる場所」「一言」「島の景色」の3つ。 */
      if (method === "POST" && path === "/current") {
        const uid = await ownerUid(req.headers.authorization);
        if (!uid) {
          res.status(403).json({error: "not allowed"});
          return;
        }
        const place = clean(body.place, 60);
        const word = clean(body.word, 140);
        const theme = clean(body.theme, 16);
        if (!place) {
          res.status(400).json({error: "no place"});
          return;
        }
        /* 島の景色は3つしかない(`docs/island-world.md` 1.3)。
           知らない値が入ると `data-theme` が当たらず、島が既定の色に戻る。
           打ち間違いを画面の色で気づかせるより、ここで止める。 */
        if (theme && !ISLAND_THEMES.includes(theme)) {
          res.status(400).json({error: "bad theme"});
          return;
        }
        const cur: Json = {place, updatedAt: today()};
        if (word) cur.word = word;
        if (theme) cur.theme = theme;
        await STATE_DOC.set({current: cur}, {merge: true});
        res.set("Cache-Control", "no-store");
        res.json({current: cur});
        return;
      }

      /* ---------------- 読み取り ---------------- */
      if (method === "GET" && path === "/state") {
        const [stateSnap, ideas, notes, residents] = await Promise.all([
          STATE_DOC.get(),
          listIdeas(60),
          listNotes(200),
          listResidents(),
        ]);
        const state = stateSnap.exists ? stateSnap.data() ?? {} : {};
        res.set(
          "Cache-Control",
          "public, max-age=30, s-maxage=60, stale-while-revalidate=300",
        );
        /* `ideas` と `notes` は今までどおり配列で返す。そこに
           「まだ古いものが残っている」を添える。画面はこれを見て
           `/ideas?before=` `/notes?before=` の続きを読める。
           **黙って切らない**ことがこの2つの役目。 */
        res.json({
          current: state.current ?? null,
          stats: state.stats ?? null,
          ideas: ideas.items,
          notes: notes.items,
          residents,
          /* 北欧旅の、日付で言える事実。いまは「着いた日」だけ。
             ここが入ると、企画が「いま行っている」から「行ってきた」に変わる
             (`site/content/plans.ts` の planPhase)。 */
          nordic: state.nordic ?? null,
          more: {
            ideas: ideas.more ? ideas.next : null,
            notes: notes.more ? notes.next : null,
          },
        });
        return;
      }

      /* ---------------- 北欧旅の足代 ----------------
         返すのは合計と人数だけ。**個人の金額も順位も返さない**
         (`docs/nordic-fund.md` の決めごと)。
         スパチャは満額で数える。OBS が半額にしているのは配信の演出上の都合で、
         同じことをサイトでやると、出した人が自分の額を見つけられない。 */
      if (method === "GET" && path === "/fund") {
        const [doneru, snap, goal] = await Promise.all([
          doneruNow(),
          STATE_DOC.get(),
          goalRecord(),
        ]);
        const f = ((snap.exists ? snap.data() ?? {} : {}).fund ?? {}) as Json;
        const num = (v: unknown) => {
          const n = Number(v);
          return Number.isFinite(n) && n > 0 ? n : 0;
        };
        /* **配信の豚の貯金箱と、同じ数字を出す。**（あやとの指示 2026-09-05
           「配信と同じ半額にする。貯金箱と仕様は合わせる」）

           前はスパチャを BigQuery の直近365日から満額で数えていて、起点も
           足していなかったので、**サイトだけが配信の10倍近い額（360,096円）を
           出していた**。`docs/nordic-fund.md` が「サイトは満額で数える」と
           決めていたのを、あやとの指示で取り消してある。

           出どころは GAS の Goals（配信の OBS が読んでいるのと同じ1件）。
             currentAmount = startAmount + superChatAmount + doneruAmount
           startAmount はこの企画の起点で、負の数。 */
        const superchat = goal ? goal.superchat : num(f.superchat);
        const start = goal ? goal.start : num(f.start);
        let total = (doneru ?? 0) + superchat + start;
        /* **人が実際に出した額は、上の合計とは別物。** 合計には起点の
           マイナスが入っているので、「N人があわせて◯円出してくれました」に
           使うと嘘になる。そちらはマイナスを含まない額を渡す。 */
        const given = (doneru ?? 0) + superchat;
        // どれも読めなかったときだけ、集計が置いていった合計に落ちる
        if (total <= 0) total = num(f.total);
        /* 1円も分からないときは、200 で 0 を返さない。
           0円は「誰も出していない」に見えるし、CDN に5分ぶん焼き付く。
           どれも読めなかったときは毎回ここに来る。画面は 200 以外を
           「読めなかった」として黙って足代の数字を消すので、これでいい。 */
        if (total <= 0) {
          res.set("Cache-Control", "no-store");
          res.status(503).json({error: "no fund data"});
          return;
        }
        res.set(
          "Cache-Control",
          "public, max-age=300, s-maxage=600, stale-while-revalidate=1800",
        );
        res.json({
          total,
          given,
          goal: goal ? goal.goal : 0,
          people: num(f.people),
          updatedAt: num(f.updatedAt) || null,
        });
        return;
      }

      /* 企画提案(旧)。**役目は `/nextplans` に移った**(#161)。
         Functions と Hosting は別々に手で起動するので、画面が古い日でも
         止まらないように、ここはまだ動かしてある。畳むのは #171。 */
      if (method === "GET" && path === "/ideas") {
        const page = await listIdeas(
          req.query.limit ?? 120,
          req.query.before,
        );
        res.set(
          "Cache-Control",
          "public, max-age=15, s-maxage=30, stale-while-revalidate=120",
        );
        res.json({ideas: page.items, more: page.more, next: page.next});
        return;
      }

      /* 付箋の続き。`/state` が返すのは新しい 200件までで、
         それより古いぶんはここから `?before=` で順に読む。
         上限を上げるだけにしなかったのは、上げてもいつか同じ日が来て、
         そのときはまた黙って消えるから。 */
      if (method === "GET" && path === "/notes") {
        const page = await listNotes(
          req.query.limit ?? 200,
          req.query.before,
        );
        res.set(
          "Cache-Control",
          "public, max-age=30, s-maxage=60, stale-while-revalidate=300",
        );
        res.json({notes: page.items, more: page.more, next: page.next});
        return;
      }

      /* ---------------- 企画提案 ---------------- */
      if (method === "POST" && path === "/ideas") {
        const who = await whoIs(req.headers.authorization);
        const text = clean(body.text, MAX_IDEA_LEN);
        const name = who?.name ?? clean(body.name, MAX_NAME_LEN);
        const cid = String(body.cid ?? "");
        if (text.length < 4) {
          res.status(400).json({error: "text too short"});
          return;
        }
        if (!isCid(cid)) {
          res.status(400).json({error: "bad cid"});
          return;
        }
        if (!(await takeQuota(who?.uid ?? cid, "idea", IDEAS_PER_DAY))) {
          res.status(429).json({error: "too many today"});
          return;
        }
        const now = Date.now();
        const ref = await IDEAS.add({
          text,
          name: name || null,
          votes: 0,
          hidden: false,
          status: "open",
          cid,
          uid: who?.uid ?? null,
          channelId: who?.channelId ?? null,
          createdAt: now,
          ip: fwd(req.headers["x-forwarded-for"]),
        });
        res.json({
          idea: {
            id: ref.id,
            text,
            name: name || undefined,
            votes: 0,
            status: "open",
            createdAt: new Date(now).toISOString(),
          },
        });
        return;
      }

      const voteMatch = path.match(
        /^\/ideas\/([A-Za-z0-9_-]{6,})\/vote$/,
      );
      if (method === "POST" && voteMatch) {
        const id = voteMatch[1];
        const who = await whoIs(req.headers.authorization);
        const cid = String(body.cid ?? "");
        if (!who && !isCid(cid)) {
          res.status(400).json({error: "bad cid"});
          return;
        }
        // ログインしている人は端末が変わっても1票。していない人は端末ごと。
        const voteRef = VOTES.doc(`${id}_${who?.uid ?? cid}`);
        const ideaRef = IDEAS.doc(id);
        const votes = await db.runTransaction(async (tx) => {
          const [v, i] = await Promise.all([
            tx.get(voteRef),
            tx.get(ideaRef),
          ]);
          if (!i.exists) throw new Error("no idea");
          const cur = (i.data()?.votes as number) ?? 0;
          if (v.exists) return cur;
          tx.set(voteRef, {at: Date.now()});
          tx.update(ideaRef, {votes: cur + 1});
          return cur + 1;
        });
        res.json({votes});
        return;
      }

      /* ---------------- 今夜のおたずね ----------------
         参加の階段のいちばん下の段。文章を書かずに、押すだけで数字が動く。
         「さんせい」は誰かが企画を書かないと押すものが無いが、
         こちらは**こちらから問いを出している**ので、掲示板が空でも押せる。 */
      if (method === "GET" && path === "/poll") {
        // 押した瞬間に数字が動くのが要なので、読みは短めに寝かせる
        res.set(
          "Cache-Control",
          "public, max-age=15, s-maxage=30, stale-while-revalidate=120",
        );
        res.json({poll: await openPoll()});
        return;
      }

      const pollMatch = path.match(/^\/poll\/([A-Za-z0-9_-]{4,})\/vote$/);
      if (method === "POST" && pollMatch) {
        const id = pollMatch[1];
        const who = await whoIs(req.headers.authorization);
        const cid = String(body.cid ?? "");
        const option = clean(body.option, 24);
        if (!who && !isCid(cid)) {
          res.status(400).json({error: "bad cid"});
          return;
        }
        if (!option) {
          res.status(400).json({error: "no option"});
          return;
        }
        if (!(await takeQuota(who?.uid ?? cid, "poll", POLL_VOTES_PER_DAY))) {
          res.status(429).json({error: "too many today"});
          return;
        }
        // ログインしている人は端末が変わっても1票。していない人は端末ごと。
        const voteRef = PVOTES.doc(`${id}_${who?.uid ?? cid}`);
        const pollRef = POLLS.doc(id);
        let out: PollShape | null = null;
        let mine = "";
        try {
          [out, mine] = await db.runTransaction(async (tx) => {
            const [v, p] = await Promise.all([
              tx.get(voteRef),
              tx.get(pollRef),
            ]);
            if (!p.exists) throw new Error("no poll");
            const data = p.data() ?? {};
            // 引っ込めた問いは、IDを知っていても押せない。
            // 一覧に出さないだけだと、前に開いた画面から押し続けられる。
            if (data.hidden === true) throw new Error("closed");
            const shaped = shapePoll(id, data);
            if (!shaped.options.some((o) => o.id === option)) {
              throw new Error("bad option");
            }
            const nowIso = new Date().toISOString();
            if (shaped.openUntil && shaped.openUntil < nowIso) {
              throw new Error("closed");
            }
            // もう押している人は数えない。押し直しもさせない(1人1票)
            if (v.exists) {
              return [shaped, clean(v.data()?.option, 24)] as const;
            }
            const votes = {...((data.votes ?? {}) as Record<string, number>)};
            votes[option] = (votes[option] ?? 0) + 1;
            tx.set(voteRef, {
              at: Date.now(),
              option,
              cid: cid || null,
              uid: who?.uid ?? null,
            });
            tx.update(pollRef, {votes});
            return [shapePoll(id, {...data, votes}), option] as const;
          });
        } catch (e) {
          const why = String(e);
          const code = why.includes("no poll") ? 404 : 400;
          res.status(code).json({error: why.replace("Error: ", "")});
          return;
        }
        res.json({poll: out, mine});
        return;
      }

      /* ---------------- 押すだけの問い ----------------
         「十字架の丘に寄る／先を急ぐ」のような、まだ決まっていない分かれ目を
         押すだけで答えられるようにする(`docs/nordic-fund.md` 提案8)。
         北欧の区間だけでなく、紙の面の問い(台所の「次のスタンプ」、
         丘の「もう一度やるなら」)も同じ口を通る。

         **返すのは、聞かれた id のぶんだけ。** 一覧で返すと、
         端末IDを作り直しながら投げれば知らない id の札を並べられる。
         画面が知っている id しか読まないので、ゴミは表に出ない。 */
      if (method === "GET" && path === "/fork") {
        const ids = String(req.query.ids ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter((s) => FORK_ID.test(s))
          .slice(0, 12);
        // 押した瞬間に数字が動くのが要なので、読みは短めに寝かせる
        res.set(
          "Cache-Control",
          "public, max-age=15, s-maxage=30, stale-while-revalidate=120",
        );
        if (ids.length === 0) {
          res.json({forks: {}});
          return;
        }
        const snaps = await db.getAll(...ids.map((id) => POLLS.doc(id)));
        const forks: Record<string, Record<string, number>> = {};
        for (const s of snaps) {
          const v = s.exists ? s.data() ?? {} : {};
          // 島の「今夜のおたずね」には `at` が無い。あちらは問いの字を
          // 持っているので、数だけを返すこの口からは出さない
          if (!v.at || v.hidden === true) continue;
          forks[s.id] = forkCounts(v.votes);
        }
        res.json({forks});
        return;
      }

      const forkMatch = path.match(/^\/fork\/([A-Za-z0-9_-]{4,})\/vote$/);
      if (method === "POST" && forkMatch) {
        const id = forkMatch[1];
        const who = await whoIs(req.headers.authorization);
        const cid = String(body.cid ?? "");
        const option = clean(body.option, 24);
        if (!FORK_ID.test(id) || !FORK_OPTION.test(option)) {
          res.status(400).json({error: "bad fork"});
          return;
        }
        if (!who && !isCid(cid)) {
          res.status(400).json({error: "bad cid"});
          return;
        }
        if (!(await takeQuota(who?.uid ?? cid, "fork", FORK_VOTES_PER_DAY))) {
          res.status(429).json({error: "too many today"});
          return;
        }
        // ログインしている人は端末が変わっても1票。していない人は端末ごと。
        const voteRef = PVOTES.doc(`${id}_${who?.uid ?? cid}`);
        const ref = POLLS.doc(id);
        let out: {votes: Record<string, number>; mine: string};
        try {
          out = await db.runTransaction(async (tx) => {
            const [v, p] = await Promise.all([tx.get(voteRef), tx.get(ref)]);
            const data = p.exists ? p.data() ?? {} : {};
            // 引っ込めたわかれ道は、id を知っていても押せない
            if (data.hidden === true) throw new Error("closed");
            const votes = forkCounts(data.votes);
            // もう押している人は数えない。押し直しもさせない(1人1票)
            if (v.exists) {
              return {votes, mine: clean(v.data()?.option, 24)};
            }
            const known = option in votes;
            if (!known && Object.keys(votes).length >= FORK_MAX_OPTIONS) {
              throw new Error("bad option");
            }
            votes[option] = (votes[option] ?? 0) + 1;
            tx.set(voteRef, {
              at: Date.now(),
              option,
              cid: cid || null,
              uid: who?.uid ?? null,
            });
            /* はじめの1票で入れ物ができる。問いの字はここに書かない。
               createdAt を持たせておくのは、島の「今夜のおたずね」が
               同じコレクションを新しい順に見ているため。 */
            tx.set(
              ref,
              {
                at: forkAt(id),
                votes,
                createdAt: (data.createdAt as number) ?? Date.now(),
              },
              {merge: true},
            );
            return {votes, mine: option};
          });
        } catch (e) {
          res.status(400).json({error: String(e).replace("Error: ", "")});
          return;
        }
        res.set("Cache-Control", "no-store");
        res.json({id, votes: out.votes, mine: out.mine});
        return;
      }

      /* ---------------- 今日、島に来た人 ----------------
         「誰かがそこにいる」を、同時接続ではなく日単位で出す
         (docs/island-play.md 仕掛け16・および「移さないもの」の18)。

         ブラウザは1日1回しか叩かない（数えた日を覚えている）。
         それでも消された端末や新しい端末から何度も来るので、
         takeQuota で1日1回に締める。**誰が来たかは残さない。**
         残るのは islandRate の「visit を1回使った」だけで、これは翌日には意味を失う。 */
      if (method === "POST" && path === "/visit") {
        const who = await whoIs(req.headers.authorization);
        const cid = String(body.cid ?? "");
        if (!who && !isCid(cid)) {
          res.status(400).json({error: "bad cid"});
          return;
        }
        const day = today();
        // 数える前に、この人の今日ぶんが残っているかを見る。
        // 残っていなければ足さずに、いまの数だけ返す
        const fresh = await takeQuota(who?.uid ?? cid, "visit", 1);
        const ref = VISITS.doc(day);
        /* 1日1ドキュメントなので、書き込みが集まると詰まる。
           Firestore は同じドキュメントに毎秒1回までなので、
           1日に数千人まではこれで足りる。足りなくなったら分割する。 */
        const n = await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          const cur = (snap.data()?.n as number) ?? 0;
          if (!fresh) return cur;
          tx.set(ref, {n: cur + 1, day, updatedAt: Date.now()}, {merge: true});
          return cur + 1;
        });
        res.json({day, visits: n});
        return;
      }

      /* ---------------- 付箋 ---------------- */
      if (method === "POST" && path === "/notes") {
        const who = await whoIs(req.headers.authorization);
        const text = clean(body.text, MAX_NOTE_LEN);
        const planId = clean(body.planId, 40);
        const cid = String(body.cid ?? "");
        if (text.length < 2 || !planId) {
          res.status(400).json({error: "bad input"});
          return;
        }
        if (!isCid(cid)) {
          res.status(400).json({error: "bad cid"});
          return;
        }
        if (!(await takeQuota(who?.uid ?? cid, "note", NOTES_PER_DAY))) {
          res.status(429).json({error: "too many today"});
          return;
        }
        const now = Date.now();
        const ref = await NOTES.add({
          planId,
          text,
          hidden: false,
          cid,
          uid: who?.uid ?? null,
          name: who?.name ?? null,
          createdAt: now,
        });
        res.json({
          note: {
            id: ref.id,
            planId,
            text,
            createdAt: new Date(now).toISOString(),
          },
        });
        return;
      }

      /* ---------------- テーマ付きの付箋(#160) ----------------
         **旧来の `/notes` とは口を分けてある。** 入れ物（islandNotes）は
         同じだが、あちらは企画に貼るもので `planId` を持ち、こちらは
         テーマに貼るもので `theme` を持つ。同じ口にすると、画面を
         切り替えている途中の日に、両方が混ざったものが両方の画面に出る。
         旧来のぶんが移り終わったら（#162）、あちらの口を畳む。 */
      if (method === "GET" && path === "/stickies") {
        const theme = clean(req.query.theme, 40);
        if (theme && !THEME_ID.test(theme)) {
          res.status(400).json({error: "bad theme"});
          return;
        }
        /* じぶんが貼った付箋だけ(#163)。**ログインした人が、自分のぶんを引く。**
           一覧の口(`stickyShape`)は uid も cid も返さないので、
           「どれが自分のか」は画面の側では作れない。ここで絞る。

           **`where` に `orderBy` を足さない。** 複合索引が要るが、その索引は
           サービスアカウントに作る権限が無くて配れない(#168)。組んだ日に
           本番が 500 になる。テーマで絞るとき(`listStickies`)と同じく、
           引いてから手元で並べる。1人ぶんは多くても数十枚。

           しまわれたものは出さない。掲示板から下ろしたものが、書いた人の
           手元にだけ残っていると、まだ貼ってあるように読める。 */
        if (req.query.mine === "1") {
          const who = await whoIs(req.headers.authorization);
          if (!who) {
            res.status(401).json({error: "no token"});
            return;
          }
          const snap = await NOTES.where("uid", "==", who.uid).limit(300).get();
          const rows = snap.docs
            .filter((d) => d.get("hidden") !== true)
            .filter((d) => d.get("archived") !== true)
            .sort(
              (a, b) =>
                (Number(b.get("createdAt")) || 0) -
                (Number(a.get("createdAt")) || 0),
            );
          res.set("Cache-Control", "no-store");
          res.json({notes: rows.map(stickyShape), more: false, next: null});
          return;
        }
        /* しまったぶんは、戻す人にしか見せない。ここを開けると
           「消さずにしまう」が「畳んで隠しただけ」になる。 */
        const archived = req.query.archived === "1";
        if (archived && !(await ownerUid(req.headers.authorization))) {
          res.status(403).json({error: "not allowed"});
          return;
        }
        const page = await listStickies({
          theme: theme || undefined,
          archived,
          byHearts: req.query.sort === "hearts",
          limit: req.query.limit ?? 200,
          before: req.query.before,
        });
        /* ハートは押した瞬間に数字が動くのが要なので、短めに寝かせる。
           しまったぶんは1人しか見ないので、置いておく意味がない。 */
        res.set(
          "Cache-Control",
          archived ?
            "no-store" :
            "public, max-age=15, s-maxage=30, stale-while-revalidate=120",
        );
        res.json({notes: page.items, more: page.more, next: page.next});
        return;
      }

      if (method === "POST" && path === "/stickies") {
        const who = await whoIs(req.headers.authorization);
        const theme = clean(body.theme, 40);
        const text = clean(body.text, MAX_NOTE_LEN);
        const cid = String(body.cid ?? "");
        if (!THEME_ID.test(theme)) {
          res.status(400).json({error: "bad theme"});
          return;
        }
        if (text.length < 2) {
          res.status(400).json({error: "text too short"});
          return;
        }
        if (!isCid(cid)) {
          res.status(400).json({error: "bad cid"});
          return;
        }
        /* 運営者が立てた付箋（おたずねの選択肢になるもの）。
           **`/me` の admin ではなく、ここでもう一度見る。**
           あちらは画面に道具を出すかどうかだけの返事で、
           そこを信じて権限を決めているわけではない。 */
        const byOwner =
          body.byOwner === true &&
          !!(await ownerUid(req.headers.authorization));
        if (body.byOwner === true && !byOwner) {
          res.status(403).json({error: "not allowed"});
          return;
        }
        if (
          !byOwner &&
          !(await takeQuota(who?.uid ?? cid, "sticky", STICKIES_PER_DAY))
        ) {
          res.status(429).json({error: "too many today"});
          return;
        }
        const now = Date.now();
        const ref = await NOTES.add({
          theme,
          text,
          /* 名乗った名前。ログインしている人は、島に出す名前をそのまま使う。
             **本文に「by まこも」と書かせない**ための欄なので、
             ログインしていない人にも空けてある。 */
          by: who?.name || clean(body.by, MAX_NAME_LEN) || null,
          hearts: 0,
          byOwner,
          hidden: false,
          archived: false,
          cid,
          uid: who?.uid ?? null,
          createdAt: now,
          ip: fwd(req.headers["x-forwarded-for"]),
        });
        res.json({
          note: {
            id: ref.id,
            theme,
            text,
            by: who?.name || clean(body.by, MAX_NAME_LEN) || undefined,
            hearts: 0,
            byOwner,
            createdAt: new Date(now).toISOString(),
          },
        });
        return;
      }

      /* ハート。**ログイン不要で、もう一度押すと外れる。**
         企画の「さんせい」と違って取り消せるので、押したことは
         「islandHearts に書類があるか」で持つ。消す＝解除。 */
      const heartMatch = path.match(
        /^\/stickies\/([A-Za-z0-9_-]{6,})\/heart$/,
      );
      if (method === "POST" && heartMatch) {
        const id = heartMatch[1];
        const who = await whoIs(req.headers.authorization);
        const cid = String(body.cid ?? "");
        if (!who && !isCid(cid)) {
          res.status(400).json({error: "bad cid"});
          return;
        }
        const key = who?.uid ?? cid;
        if (!(await takeQuota(key, "heart", HEARTS_PER_DAY))) {
          res.status(429).json({error: "too many today"});
          return;
        }
        const heartRef = HEARTS.doc(`${id}_${key}`);
        const noteRef = NOTES.doc(id);
        let out: {hearts: number; on: boolean};
        try {
          out = await db.runTransaction(async (tx) => {
            const [h, n] = await Promise.all([
              tx.get(heartRef),
              tx.get(noteRef),
            ]);
            if (!n.exists) throw new Error("no note");
            const data = n.data() ?? {};
            // しまった付箋・隠した付箋は、IDを知っていても押せない。
            // 一覧に出さないだけだと、前に開いた画面から押し続けられる。
            if (data.hidden === true || data.archived === true) {
              throw new Error("closed");
            }
            const cur = Math.max(0, Math.floor(Number(data.hearts ?? 0)) || 0);
            if (h.exists) {
              tx.delete(heartRef);
              const next = Math.max(0, cur - 1);
              tx.update(noteRef, {hearts: next});
              return {hearts: next, on: false};
            }
            tx.set(heartRef, {at: Date.now(), note: id});
            tx.update(noteRef, {hearts: cur + 1});
            return {hearts: cur + 1, on: true};
          });
        } catch (e) {
          const why = String(e).replace("Error: ", "");
          res.status(why === "no note" ? 404 : 400).json({error: why});
          return;
        }
        res.set("Cache-Control", "no-store");
        res.json(out);
        return;
      }

      /* あやとからの返信。1枚につき1つ。**空で送ると取り消し。**
         直すのも同じ口で、書き直せば上書きになる。 */
      const replyMatch = path.match(
        /^\/stickies\/([A-Za-z0-9_-]{6,})\/reply$/,
      );
      if (method === "POST" && replyMatch) {
        const uid = await ownerUid(req.headers.authorization);
        if (!uid) {
          res.status(403).json({error: "not allowed"});
          return;
        }
        const text = clean(body.text, MAX_REPLY_LEN);
        const ref = NOTES.doc(replyMatch[1]);
        const cur = await ref.get();
        if (!cur.exists) {
          res.status(404).json({error: "no note"});
          return;
        }
        const now = Date.now();
        await ref.set(
          text ?
            {reply: text, repliedAt: now, repliedBy: uid} :
            {
              reply: admin.firestore.FieldValue.delete(),
              repliedAt: admin.firestore.FieldValue.delete(),
              repliedBy: admin.firestore.FieldValue.delete(),
            },
          {merge: true},
        );
        res.set("Cache-Control", "no-store");
        res.json({
          reply: text || null,
          repliedAt: text ? new Date(now).toISOString() : null,
        });
        return;
      }

      /* しまう・戻す。**あやとだけ。消さない。**
         二重投稿も荒れたものもこれで片付く。ハートの数はそのまま残るので、
         戻したときに数が消えていない。 */
      const archiveMatch = path.match(
        /^\/stickies\/([A-Za-z0-9_-]{6,})\/archive$/,
      );
      if (method === "POST" && archiveMatch) {
        const uid = await ownerUid(req.headers.authorization);
        if (!uid) {
          res.status(403).json({error: "not allowed"});
          return;
        }
        const on = body.on !== false;
        const ref = NOTES.doc(archiveMatch[1]);
        const cur = await ref.get();
        if (!cur.exists) {
          res.status(404).json({error: "no note"});
          return;
        }
        await ref.set(
          on ?
            {archived: true, archivedAt: Date.now(), archivedBy: uid} :
            {
              archived: false,
              archivedAt: admin.firestore.FieldValue.delete(),
              archivedBy: admin.firestore.FieldValue.delete(),
            },
          {merge: true},
        );
        res.set("Cache-Control", "no-store");
        res.json({id: ref.id, archived: on});
        return;
      }

      /* ---------------- 企画(#161) ----------------
         **`/ideas`(一言120字・ログイン不要)と `/drafts`(ページ1枚・ログイン必須)を
         1つにした口。** 同じものの粒度違いだったのに入れ物が割れていて、
         一言を出したあと下書きへ進む道が無かった。

         題1つで出せて、あとから日付・場所・本文・リンク・写真を足して育てられる。
         ログインは要らない。直せるのは、ログインしていれば自分のぶんをいつでも、
         していなければ端末の印で24時間だけ(`canEditPlan`)。

         **旧来の `/ideas` `/drafts` は動いたまま残してある。** Functions と
         Hosting は別々に手で起動するので、画面が先に出た日も古い日も、
         どちらかが 404 で止まらないようにする。 */
      if (method === "GET" && path === "/nextplans") {
        /* しまったぶんは、戻す人にしか見せない(付箋と同じ)。 */
        const archived = req.query.archived === "1";
        if (archived && !(await ownerUid(req.headers.authorization))) {
          res.status(403).json({error: "not allowed"});
          return;
        }
        const page = await listPlans({
          archived,
          limit: req.query.limit ?? 200,
          before: req.query.before,
        });
        res.set(
          "Cache-Control",
          archived ?
            "no-store" :
            "public, max-age=15, s-maxage=30, stale-while-revalidate=120",
        );
        res.json({plans: page.items, more: page.more, next: page.next});
        return;
      }

      /* 1件だけ読む。育てる画面(`/next/new?id=…`)が続きを書くために引く。
         **端末IDは受け取らない。** 直せるかどうかは画面側が
         「自分が出したもの」の控えで決めて、実際に直せるかは書く口が見る。
         ここに端末IDを渡すと、鍵が URL とアクセスログに残る。 */
      const planOne = path.match(/^\/nextplans\/([A-Za-z0-9_-]{6,})$/);
      if (method === "GET" && planOne) {
        const snap = await NEXTPLANS.doc(planOne[1]).get();
        if (!snap.exists || snap.get("hidden") === true) {
          res.status(404).json({error: "no plan"});
          return;
        }
        res.set(
          "Cache-Control",
          "public, max-age=15, s-maxage=30, stale-while-revalidate=120",
        );
        res.json({plan: planShape(snap)});
        return;
      }

      if (method === "POST" && path === "/nextplans") {
        const who = await whoIs(req.headers.authorization);
        const cid = String(body.cid ?? "");
        if (JSON.stringify(body).length > MAX_PLAN_LEN) {
          res.status(400).json({error: "too long"});
          return;
        }
        const plan = shapeDraft(body);
        if ((plan.title as string).length < 4) {
          res.status(400).json({error: "title too short"});
          return;
        }
        /* 端末の印は、ここでは「連投を数える鍵」ではなく
           「あとで自分の企画を直す鍵」なので、長さで縛る。 */
        if (!isStrongCid(cid)) {
          res.status(400).json({error: "bad cid"});
          return;
        }
        if (!(await takeQuota(who?.uid ?? cid, "plan", PLANS_PER_DAY))) {
          res.status(429).json({error: "too many today"});
          return;
        }
        const now = Date.now();
        const by = who?.name || clean(body.by, MAX_NAME_LEN) || null;
        const ref = await NEXTPLANS.add({
          ...plan,
          by,
          hearts: 0,
          status: "proposed",
          hidden: false,
          archived: false,
          cid,
          uid: who?.uid ?? null,
          createdAt: now,
          updatedAt: now,
          ip: fwd(req.headers["x-forwarded-for"]),
        });
        res.set("Cache-Control", "no-store");
        res.json({plan: planShape(await ref.get())});
        return;
      }

      /* 育てる。**同じ口で、題1つのものにも写真つきのものにも書ける。**
         送られてきた中身でまるごと置き換える(画面は必ず全部を持って開く)。 */
      if (method === "POST" && planOne) {
        const who = await whoIs(req.headers.authorization);
        const owner = !!(await ownerUid(req.headers.authorization));
        if (JSON.stringify(body).length > MAX_PLAN_LEN) {
          res.status(400).json({error: "too long"});
          return;
        }
        const ref = NEXTPLANS.doc(planOne[1]);
        const cur = await ref.get();
        if (!cur.exists || cur.get("hidden") === true) {
          res.status(404).json({error: "no plan"});
          return;
        }
        const guard = canEditPlan(cur.data() ?? {}, who, body.cid, owner);
        if (guard !== "ok") {
          /* 「時間が切れた」と「あなたのではない」を分けて返す。
             同じ 403 にすると、画面が「もう直せません」としか言えない。 */
          const why = guard === "expired" ? "expired" : "not yours";
          res.status(403).json({error: why});
          return;
        }
        const plan = shapeDraft(body);
        if ((plan.title as string).length < 4) {
          res.status(400).json({error: "title too short"});
          return;
        }
        /* あやとは数えない。仕上げるときに1件を何度も書き直すので、
           出す側と同じ12回で止まると、その日の途中で直せなくなる
           （付箋の `byOwner` を数えないのと同じ考え）。 */
        const key = who?.uid ?? String(body.cid);
        if (!owner && !(await takeQuota(key, "plan", PLANS_PER_DAY))) {
          res.status(429).json({error: "too many today"});
          return;
        }
        const patch: Json = {...plan, updatedAt: Date.now()};
        /* 名乗り直しは受ける。ログインしている人は島に出す名前で固定。
           **書いた人(`uid` `cid`)は上書きしない。** 直すたびに持ち主が
           入れ替わると、24時間の窓が押すたびに延びる。 */
        const by = who?.name || clean(body.by, MAX_NAME_LEN);
        if (by) patch.by = by;
        await ref.set(patch, {merge: true});
        res.set("Cache-Control", "no-store");
        res.json({plan: planShape(await ref.get())});
        return;
      }

      /* ハート。**付箋とまったく同じ仕組み**(#161 の指定)。
         ログイン不要で、もう一度押すと外れる。押したことは
         `islandHearts/<企画のID>_<uid か端末ID>` の有無で持つ。 */
      const planHeart = path.match(
        /^\/nextplans\/([A-Za-z0-9_-]{6,})\/heart$/,
      );
      if (method === "POST" && planHeart) {
        const id = planHeart[1];
        const who = await whoIs(req.headers.authorization);
        const cid = String(body.cid ?? "");
        if (!who && !isCid(cid)) {
          res.status(400).json({error: "bad cid"});
          return;
        }
        const key = who?.uid ?? cid;
        if (!(await takeQuota(key, "heart", HEARTS_PER_DAY))) {
          res.status(429).json({error: "too many today"});
          return;
        }
        const heartRef = HEARTS.doc(`${id}_${key}`);
        const planRef = NEXTPLANS.doc(id);
        let out: {hearts: number; on: boolean};
        try {
          out = await db.runTransaction(async (tx) => {
            const [h, p] = await Promise.all([
              tx.get(heartRef),
              tx.get(planRef),
            ]);
            if (!p.exists) throw new Error("no plan");
            const data = p.data() ?? {};
            if (data.hidden === true || data.archived === true) {
              throw new Error("closed");
            }
            const n = Math.max(0, Math.floor(Number(data.hearts ?? 0)) || 0);
            if (h.exists) {
              tx.delete(heartRef);
              const next = Math.max(0, n - 1);
              tx.update(planRef, {hearts: next});
              return {hearts: next, on: false};
            }
            tx.set(heartRef, {at: Date.now(), plan: id});
            tx.update(planRef, {hearts: n + 1});
            return {hearts: n + 1, on: true};
          });
        } catch (e) {
          const why = String(e).replace("Error: ", "");
          res.status(why === "no plan" ? 404 : 400).json({error: why});
          return;
        }
        res.set("Cache-Control", "no-store");
        res.json(out);
        return;
      }

      /* 段を進める。**あやとだけ。** 提案 → これから → やった。
         ページとして立ったら、Git 側の企画の id(`planId`)で結び付ける。
         結び付けないと、「これから」に上がった提案と、実際に立っている
         ページが画面の上で他人のままになる。 */
      const planStatus = path.match(
        /^\/nextplans\/([A-Za-z0-9_-]{6,})\/status$/,
      );
      if (method === "POST" && planStatus) {
        if (!(await ownerUid(req.headers.authorization))) {
          res.status(403).json({error: "not allowed"});
          return;
        }
        const status = clean(body.status, 16);
        if (!PLAN_STATUS.includes(status as typeof PLAN_STATUS[number])) {
          res.status(400).json({error: "bad status"});
          return;
        }
        const planId = clean(body.planId, 40);
        if (planId && !GIT_PLAN_ID.test(planId)) {
          res.status(400).json({error: "bad planId"});
          return;
        }
        const ref = NEXTPLANS.doc(planStatus[1]);
        if (!(await ref.get()).exists) {
          res.status(404).json({error: "no plan"});
          return;
        }
        await ref.set(
          {
            status,
            // 空で送ると外れる。取り違えて結んだときに戻せるようにする
            planId: planId || admin.firestore.FieldValue.delete(),
            updatedAt: Date.now(),
          },
          {merge: true},
        );
        res.set("Cache-Control", "no-store");
        res.json({plan: planShape(await ref.get())});
        return;
      }

      /* しまう・戻す。**あやとだけ。消さない。**(付箋と同じ) */
      const planArchive = path.match(
        /^\/nextplans\/([A-Za-z0-9_-]{6,})\/archive$/,
      );
      if (method === "POST" && planArchive) {
        const uid = await ownerUid(req.headers.authorization);
        if (!uid) {
          res.status(403).json({error: "not allowed"});
          return;
        }
        const on = body.on !== false;
        const ref = NEXTPLANS.doc(planArchive[1]);
        if (!(await ref.get()).exists) {
          res.status(404).json({error: "no plan"});
          return;
        }
        await ref.set(
          on ?
            {archived: true, archivedAt: Date.now(), archivedBy: uid} :
            {
              archived: false,
              archivedAt: admin.firestore.FieldValue.delete(),
              archivedBy: admin.firestore.FieldValue.delete(),
            },
          {merge: true},
        );
        res.set("Cache-Control", "no-store");
        res.json({id: ref.id, archived: on});
        return;
      }

      /* ---------------- ルーレット(#164) ----------------
         コントローラー(`/me/roulette`・あやとだけ)と
         表示(`/roulette?s=…`・スマホ版 OBS)を繋ぐ。
         **読むのは表示側だけが誰でも。** それ以外は全部あやただけ。 */

      /* コントローラーを開いたとき。**id は作り直さない。**
         毎回変わると、配信のたびに OBS の URL を貼り替えることになる。
         `clear` を付けたときだけ、選択肢を空にして「はじめから」にする。

         **チャットの栞は、開くたびに引き直す。** あやとの決め(#164)で
         流すのは「コントローラーを起動してから」のぶんだけなので、
         ここで1回読んで、いま出ているぶんは捨てて栞だけを取る。 */
      if (method === "POST" && path === "/roulette/start") {
        const uid = await ownerUid(req.headers.authorization);
        if (!uid) {
          res.status(403).json({error: "not allowed"});
          return;
        }
        const user = await USERS.doc(uid).get();
        let id = String(user.data()?.rouletteId ?? "");
        if (!/^[0-9a-f]{32}$/.test(id)) {
          id = randomUUID().replace(/-/g, "");
          await USERS.doc(uid).set({rouletteId: id}, {merge: true});
        }
        let chatToken = "";
        let live = false;
        try {
          const page = await readLiveChat();
          chatToken = page.next;
          live = page.live;
        } catch (e) {
          // 配信を読めなくても、コントローラーは開けなければならない。
          // 手で足すぶんだけでルーレットは回る
          logger.warn("roulette chat anchor failed", String(e));
        }
        const ref = ROULETTE.doc(id);
        const had = await ref.get();
        /* 開き直しただけなら、選んであるものをそのまま残す。
           **配信の途中で1回読み込み直すことは普通に起きる。**
           20件選んだところで消えると、そこで配信が止まる。 */
        const prev: Json = had.exists && !body.clear ? had.data() ?? {} : {};
        const rec: Json = {
          owner: uid,
          status: prev.status ?? "準備中",
          items: prev.items ?? [],
          wait: Number(prev.wait) || ROULETTE_WAITS[1],
          duration: Number(prev.duration) || ROULETTE_SPIN.duration,
          turns: Number(prev.turns) || ROULETTE_SPIN.turns,
          theme: (prev.theme as string) || "classic",
          sound: prev.sound !== false,
          result: prev.result ?? null,
          resultIndex: prev.resultIndex ?? null,
          spunAt: prev.spunAt ?? null,
          postAt: prev.postAt ?? null,
          posted: prev.posted === true,
          say: prev.say ?? "",
          chatToken,
          updatedAt: Date.now(),
        };
        await ref.set(rec);
        res.set("Cache-Control", "no-store");
        res.json({
          session: rouletteShape(id, rec),
          live,
          doneru: doneruHint(user.data()?.doneruKey),
        });
        return;
      }

      /* Doneru の鍵をしまう。**あやとだけ。**

         鍵そのものは、入れるときにここへ通るきりで、以後どの返事にも
         出てこない(`doneruHint` は末尾4文字だけ)。静的書き出しの面に
         鍵を載せると `dist/` に焼かれて誰でも読めるので、
         **ブラウザに置かない**のが要点。 */
      if (method === "POST" && path === "/roulette/doneru") {
        const uid = await ownerUid(req.headers.authorization);
        if (!uid) {
          res.status(403).json({error: "not allowed"});
          return;
        }
        const key = clean(body.key, 200);
        await USERS.doc(uid).set(
          {
            doneruKey: key ||
              admin.firestore.FieldValue.delete(),
          },
          {merge: true},
        );
        res.set("Cache-Control", "no-store");
        res.json({doneru: doneruHint(key)});
        return;
      }

      /* ブラウザが YouTube を直に読むための、寿命の短いトークン。
         **あやとだけ。**

         ここを通す理由は割り当て(quota)。`liveChatMessages.list` は
         1回5単位で、こちらの OAuth で読むと1日10,000単位の枠を
         コントローラーが削っていく。Doneru が出したトークンなら、
         減るのは Doneru 側の枠になる。

         `refresh` が来たら、先に Doneru 側で取り直させてから取る。
         ブラウザで 401 が出たときに1回だけ呼ばれる。 */
      if (method === "POST" && path === "/roulette/yt-token") {
        const uid = await ownerUid(req.headers.authorization);
        if (!uid) {
          res.status(403).json({error: "not allowed"});
          return;
        }
        const me = await USERS.doc(uid).get();
        const key = String(me.data()?.doneruKey ?? "");
        if (!key) {
          /* 鍵がまだ無いだけ。**これは異常ではない。** コントローラーは
             これを見て、今までどおり Functions ごしの読み方に落ちる。 */
          res.set("Cache-Control", "no-store");
          res.status(404).json({error: "no doneru key"});
          return;
        }
        try {
          if (body.refresh === true) await doneruYoutubeRefreshToken(key);
          const t = await doneruYoutubeToken(key);
          res.set("Cache-Control", "no-store");
          res.json(t);
        } catch (e) {
          logger.warn("doneru token failed", String(e));
          res.set("Cache-Control", "no-store");
          res.status(502).json({error: "doneru unavailable"});
        }
        return;
      }

      const rlOne = path.match(/^\/roulette\/([0-9a-f]{32})$/);
      /* 表示側(OBS)が1秒ごとに読むところ。**ここだけログインが要らない。**
         OBS のブラウザソースは合言葉を持てないので、
         推測できない id を知っていることが合言葉になっている。
         `now` を返すのは、OBS の時計とサーバーの時計がずれていても
         回り始めが合うようにするため。 */
      if (method === "GET" && rlOne) {
        const snap = await ROULETTE.doc(rlOne[1]).get();
        if (!snap.exists) {
          res.status(404).json({error: "no session"});
          return;
        }
        res.set("Cache-Control", "no-store");
        res.json({
          session: rouletteShape(snap.id, snap.data() ?? {}),
          now: Date.now(),
        });
        return;
      }

      /* 新しく来たコメント。**栞をここで進めるので GET ではない。**
         同じ栞で2回読むと同じコメントが2回流れる。 */
      const rlChat = path.match(/^\/roulette\/([0-9a-f]{32})\/comments$/);
      if (method === "POST" && rlChat) {
        const uid = await ownerUid(req.headers.authorization);
        if (!uid) {
          res.status(403).json({error: "not allowed"});
          return;
        }
        const ref = ROULETTE.doc(rlChat[1]);
        const snap = await ref.get();
        if (!snap.exists || snap.data()?.owner !== uid) {
          res.status(404).json({error: "no session"});
          return;
        }
        try {
          const page = await readLiveChat(
            String(snap.data()?.chatToken ?? "") || undefined,
          );
          if (page.next) await ref.set({chatToken: page.next}, {merge: true});
          res.set("Cache-Control", "no-store");
          res.json({lines: page.lines, wait: page.wait, live: page.live});
        } catch (e) {
          /* 配信が終わった・割り当てが尽きた。**コントローラーを止めない。**
             手で足すほうは生きているので、次の周期でまた聞く。 */
          logger.warn("roulette chat read failed", String(e));
          res.set("Cache-Control", "no-store");
          res.json({lines: [], wait: 15000, live: false, down: true});
        }
        return;
      }

      /* 選択肢を置き換える。**丸ごと置き換えるのが正しい。**
         押す人は1人(あやと)しかいないので、足す・消すを別々の口にすると
         順番の食い違いだけが増える。37件目はここで落ちる。 */
      const rlItems = path.match(/^\/roulette\/([0-9a-f]{32})\/items$/);
      if (method === "POST" && rlItems) {
        const uid = await ownerUid(req.headers.authorization);
        if (!uid) {
          res.status(403).json({error: "not allowed"});
          return;
        }
        const ref = ROULETTE.doc(rlItems[1]);
        const snap = await ref.get();
        if (!snap.exists || snap.data()?.owner !== uid) {
          res.status(404).json({error: "no session"});
          return;
        }
        if (snap.data()?.status === "回っている") {
          res.status(409).json({error: "spinning"});
          return;
        }
        const raw = Array.isArray(body.items) ? body.items : [];
        const items: RouletteItem[] = [];
        for (const r of raw.slice(0, ROULETTE_MAX)) {
          const it = rouletteItem(r);
          if (it) items.push(it);
        }
        /* 選び直したら、前の結果は消す。**残すと、表示側に
           古い当たりが出たまま次の選択肢が並ぶ。** */
        const rec: Json = {
          items,
          status: "準備中",
          result: null,
          resultIndex: null,
          spunAt: null,
          postAt: null,
          posted: false,
          updatedAt: Date.now(),
        };
        await ref.set(rec, {merge: true});
        res.set("Cache-Control", "no-store");
        res.json({session: rouletteShape(ref.id, {...snap.data(), ...rec})});
        return;
      }

      /* 待ち秒数・回る秒数・周・色。**URL を書き換える代わりがここ。** */
      const rlSet = path.match(/^\/roulette\/([0-9a-f]{32})\/settings$/);
      if (method === "POST" && rlSet) {
        const uid = await ownerUid(req.headers.authorization);
        if (!uid) {
          res.status(403).json({error: "not allowed"});
          return;
        }
        const ref = ROULETTE.doc(rlSet[1]);
        const snap = await ref.get();
        if (!snap.exists || snap.data()?.owner !== uid) {
          res.status(404).json({error: "no session"});
          return;
        }
        const rec: Json = {updatedAt: Date.now()};
        if (ROULETTE_WAITS.includes(Number(body.wait))) {
          rec.wait = Number(body.wait);
        }
        if (Number.isFinite(Number(body.duration))) {
          rec.duration = Math.min(15, Math.max(1, Number(body.duration)));
        }
        if (Number.isFinite(Number(body.turns))) {
          rec.turns = Math.round(Math.min(15, Math.max(2, Number(body.turns))));
        }
        if (ROULETTE_THEMES.includes(String(body.theme))) {
          rec.theme = String(body.theme);
        }
        if (typeof body.sound === "boolean") rec.sound = body.sound;
        await ref.set(rec, {merge: true});
        res.set("Cache-Control", "no-store");
        res.json({session: rouletteShape(ref.id, {...snap.data(), ...rec})});
        return;
      }

      /* 回す。**当たりをここで決めて、結果のコメントもここから投げる。**

         表示側から投げると、OBS が落ちていたら投げられない。だから
         この1回の呼び出しが、回り終わるまで(最長 15秒)と
         配信のラグぶん(5/10/15秒)を待ってから投げて、それから返す。
         **コントローラーは、この返事を待たずに次の操作へ進める。**
         画面の状態は、表示側と同じように読み直して作っている。 */
      const rlSpin = path.match(/^\/roulette\/([0-9a-f]{32})\/spin$/);
      if (method === "POST" && rlSpin) {
        const uid = await ownerUid(req.headers.authorization);
        if (!uid) {
          res.status(403).json({error: "not allowed"});
          return;
        }
        const ref = ROULETTE.doc(rlSpin[1]);
        const snap = await ref.get();
        const cur = snap.data() ?? {};
        if (!snap.exists || cur.owner !== uid) {
          res.status(404).json({error: "no session"});
          return;
        }
        if (cur.status === "回っている") {
          res.status(409).json({error: "spinning"});
          return;
        }
        const items = (cur.items as RouletteItem[]) ?? [];
        if (items.length < 2) {
          res.status(400).json({error: "need items"});
          return;
        }
        const wait = ROULETTE_WAITS.includes(Number(body.wait)) ?
          Number(body.wait) :
          Number(cur.wait) || ROULETTE_WAITS[1];
        const duration = Number(cur.duration) || ROULETTE_SPIN.duration;
        /* 当たり。**crypto の乱数を使う。** `Math.random` でも実害は
           無いが、ここは「配信で1回だけ引く籤」なので、偏りの理屈を
           説明できるほうを取る。 */
        const idx = randomInt(items.length);
        const spunAt = Date.now() + ROULETTE_LEAD;
        const postAt = spunAt + duration * 1000 + wait * 1000;
        const text = rouletteText(body.template, items[idx].label);
        const rec: Json = {
          status: "回っている",
          result: items[idx].id,
          resultIndex: idx,
          spunAt,
          postAt,
          wait,
          say: text,
          posted: false,
          updatedAt: Date.now(),
        };
        await ref.set(rec, {merge: true});
        await naps(postAt - Date.now());
        let posted = false;
        try {
          posted = await sayOnLive(text);
        } catch (e) {
          logger.warn("roulette say failed", String(e));
        }
        await ref.set(
          {status: "結果が出た", posted, updatedAt: Date.now()},
          {merge: true},
        );
        res.set("Cache-Control", "no-store");
        res.json({
          session: rouletteShape(ref.id, {
            ...cur, ...rec, status: "結果が出た", posted,
          }),
          posted,
        });
        return;
      }

      /* 結果のコメントを投げ直す。**投げられなかったときの受け皿。**
         上の口は1回の呼び出しの中で待っているので、その途中で
         入れ物が畳まれると投げられずに終わる。二重に投げないよう、
         もう投げてあるものはここで止める。 */
      const rlPost = path.match(/^\/roulette\/([0-9a-f]{32})\/say$/);
      if (method === "POST" && rlPost) {
        const uid = await ownerUid(req.headers.authorization);
        if (!uid) {
          res.status(403).json({error: "not allowed"});
          return;
        }
        const ref = ROULETTE.doc(rlPost[1]);
        const snap = await ref.get();
        const cur = snap.data() ?? {};
        if (!snap.exists || cur.owner !== uid) {
          res.status(404).json({error: "no session"});
          return;
        }
        if (cur.posted === true) {
          res.json({posted: true, already: true});
          return;
        }
        const items = (cur.items as RouletteItem[]) ?? [];
        const won = items.find((x) => x.id === cur.result);
        if (!won) {
          res.status(400).json({error: "no result"});
          return;
        }
        const text = clean(cur.say, 190) ||
          rouletteText(body.template, won.label);
        let posted = false;
        try {
          posted = await sayOnLive(text);
        } catch (e) {
          logger.warn("roulette say retry failed", String(e));
        }
        if (posted) await ref.set({posted: true}, {merge: true});
        res.set("Cache-Control", "no-store");
        res.json({posted});
        return;
      }

      res.status(404).json({error: "not found", path});
    } catch (e) {
      logger.error("islandApi failed", {
        path,
        method,
        error: String(e),
      });
      res.status(500).json({error: "internal"});
    }
  },
);
