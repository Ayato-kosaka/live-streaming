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
/* 島の遠隔操作(#165)。このファイルはもう長いので、丸ごと新しい機能は
   外に置いて、ここには取り付けだけを足す。 */
import {handleRemote} from "./remote";
/* あやと島カード(#173)。同じ理由で外に置いてある。
   **カードは配らない。写真と名簿から、引くときに組み立てる**(`cards.ts` 冒頭)。 */
import {handleCards, iconsOf} from "./cards";
/* Doneru の どねID を YouTube のアカウントにつなぐ(#190)。同じ理由で外。
   **北欧からスマホで直せないと、毎朝の取り込みが赤いまま残る**
   (`donors.ts` 冒頭)。 */
import {handleDonors} from "./donors";
/* キャラクターの絵と呼び名(#284 の C 群)。同じ理由で外に置いてある。
   **スプレッドシートとドライブに割れていた原本を、こちらへ寄せる。**
   引き方が2つ（スパチャ＝チャンネル名 / Doneru＝他の呼び名）あって、
   どちらも単一フィールドで引く（`islandCharacter.ts` 冒頭）。 */
import {handleCharacters} from "./islandCharacter";
/* 公開バケットの片づけ(#289)。**1回きりの道具。用が済んだら1本ごと外す。**
   投げ銭してくれた113人の名前と金額が、ログイン無しで誰でも読める置き場に
   残っている。Actions のサービスアカウントは `list` と `get` しか持って
   いないので消せない。Functions からなら何ができるかを、まず測る
   （`publicPurge.ts` 冒頭）。 */
import {handlePublicPurge} from "./publicPurge";
/* 企画・企画の画像・投げ銭の台帳(#202)。**カードの元がここへ移った。**
   北欧の名前(`nordicPhotos` / `nordicDays`)から切り離して、企画に寄せる。
   引き当ては N:N（1本の配信に企画が何本も乗る）なので、
   `eventsForTip` は**当たった企画を全部返す**(`streamEvents.ts` 冒頭)。 */
import {
  EVENTS,
  IMAGES,
  IMAGE_ROLES,
  MAX_IMAGES,
  VIDEO_ID,
  channelsOfDay,
  dropCardsOfImage,
  eventRef,
  imageRef,
  jstDay,
  loadEvents,
  mintForImage,
  resyncCardsOfImage,
  type ImageRole,
} from "./streamEvents";

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

const STATE_DOC = db.collection("island").doc("state");
const NOTES = db.collection("islandNotes");
const RATE = db.collection("islandRate");
const USERS = db.collection("islandUsers");
const CHANNELS = db.collection("islandChannels");
/* 企画(#161)。**「一言の提案」と「ページ1枚の下書き」を1つにした入れ物。**
   前は islandIdeas(120字・ログイン不要)と islandDrafts(12,000字・ログイン必須)に
   割れていて、一言を出したあと下書きへ進む道が無かった。同じものの粒度違いなので、
   題1つで出して、あとから日付・場所・本文・リンク・写真を足して育てられる形にする。

   **#202 で `islandNextPlans` から `islandStreamEvent` へ改名した。**
   「これから」だけのものではなくなったため。北欧◯日目も、もう終わった
   企画も、同じ入れ物に入る。**口(`/nextplans`)の名前は変えていない。**
   画面と API を同じ日に切り替えられない(Functions と Hosting は別々に
   手で起動する)ので、変えると片方が出た日に掲示板がまるごと落ちる。 */
const STREAM_EVENTS = EVENTS;
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

/* 豚の貯金箱に入ったスパチャの控え(`docs/nordic-fund.md` 9章)。
   入り口が3つ(OBS のアラートボックス・BigQuery・手入力)あるので、
   26文字の item id を書類IDにして、同じものを2回入れても増えない形。

   **ここを読めるのはあやただけ**(`GET /fund/history`)。名前と額が並ぶので、
   合計しか返さない `GET /fund` とは扱いを分ける。 */
const FUND_CHATS = db.collection("islandFundSuperChats");
/* 1回に返す件数。1件が1行なので、390px の1画面におよそ10行。
   3画面ぶんを1回で渡して、続きは押して出す。 */
const FUND_PAGE = 30;
/* 上限。**1回で415件を返さない。** 旅先の電波で受けきれない。 */
const FUND_PAGE_MAX = 60;

/* 北欧旅の、その日の写真(docs/nordic-photos.md)。
   **正は `islandStreamEventImage` に移った**(#202)。ここへ書くのは、
   画面が新しい口へ移るまでのあいだの写しで、書類IDは揃えてある。
   `/nordic` はまだこちらを読んでいるので、消すのは移り終わってから。 */
const NPHOTOS = db.collection("nordicPhotos");
/* **`nordicDays` はもう読まない**(#202)。その日いた人は台帳
   (`islandTips`)から引く。あちらは配信日の境目が日本時間の18時で、
   旅で時差が変わるたびに1日が2つに割れていた(#201)。
   入れ物は消さない（全部動いてから消す）が、読む側はここには居ない。 */
/* 北欧旅の「その日に起きたこと」は、**ここには無い**(docs/nordic-depart.md)。
   `nordicLog` は**あやと本人が旅先のスマホから自分で打つ**ために置いた。
   commit と Hosting の手動起動が道の上では回らない、というのが理由。

   **書く人が変わった。** いまはあやとが送ってきた一言を、受け取った側が
   `site/content/nordic.ts` の NORDIC_LOG に焼いて本番へ出す。打つ本人が
   ヒッチハイクをしていないので commit も deploy も回る。
   Firestore を経由する理由のほうが無くなったので、読み書きの口を外した。 */

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

/* 島だよりの「今週やること」。**1行ずつ消せる形で受ける。**
   ここに触る口が無かったあいだ、日付印だけが「今日書いた」と新しくなって、
   中身は2週間前の予定（「9/11 から北欧へ」）のまま出ていた。
   **日付が新しいのに中身だけ古いのは、いちばん気づかれにくい。**

   1行の長さは長めに取る。**GitHub Actions から入った長い行を、
   切り詰めて書き戻さない**ため(あちらは長さで縛っていない。
   `python/island_set_current.py`)。短く切ると「1行消しただけ」のつもりが
   別の行まで書き換わる。 */
const MAX_WEEK_LINE = 120;
const MAX_WEEK_LINES = 8;

/* 北欧旅の足代(docs/nordic-fund.md 提案5)。
   doneruAmount は cors: true なのでブラウザから直接叩けるが、叩かせない。
   静的書き出しのページに Doneru の goal key を焼き込むことになるので、
   鍵は Functions の中に置いたまま、こちらから叩いて数字だけ返す。 */
const DONERU_GOAL = "https://api.doneru.jp/widget/goal/data";
/* 豚の貯金箱の元（#305）。**いま額が正しいのは、こちらの GAS。**
   配信の OBS（app/alertbox）がスパチャを1件ずつこの表に書き足していて、
   `superChatAmount` が伸びるのはここだけ。だから読む順も GAS が先。

   鍵を GitHub の Secrets に置かないのは前のまま（GitHub #110 はそれ待ちで
   止まっていた）。OBS が読んでいるのと同じ表から実行時に引くので、
   鍵を2か所で持たずに済む。 */
const GOAL_ID = "2025-10-24";
const GAS_GOALS =
  "https://script.google.com/macros/s/" +
  "AKfycbycK8SzzuTbs6z-DUmju7eFjb4qXQPACCeq3PCWPTmZwtUxwokDgqnVa3uPl0UhBNEj" +
  `/exec?table=Goals&id=${GOAL_ID}`;
/* GAS が消えたときの控え（#305）。**表を消しても貯金箱が止まらないため**に
   置いてある。`python/admin/goal_migrate.py` が GAS の4欄をここへ写す。

   **順を逆にしない。** Firestore を先に読むと、配信で投げ銭が入っても
   サイトの豚が伸びなくなる（伸びるのは GAS 側だけで、こちらは人が
   写し直すまで止まったままになる）。あやとは旅のあいだ17日つながらないので、
   「配信のたびに人が写し直す」は置いていけない。
   **視聴者さんから見れば、自分が出したお金が島に出てこない。**

   Firestore を正にしてよくなるのは、スパチャの書き込み先を
   `POST /island-api/superchat` へ移したあと（#305 の3）。
   **額が増える側が正** ——それまではこの順が辻褄の合う唯一の順。 */
const GOAL_DOC = db.collection("islandGoal").doc(GOAL_ID);
/* Doneru の取り込みが最後に通った日（#294。`python/doneru_health.py` が写す）。
   Doneru の寄付は cookie ひとつで取りに行っているので、**切れた日から
   BigQuery に入らなくなる。** 豚の貯金箱はスパチャぶんだけ伸びて、
   Doneru で出してくれた人のぶんが島に出てこない。

   額が減るわけではないので誰も気づかない。**気づけるのは Actions を
   見ている人だけで、旅先のあやとは見ない。** だからここを島まで持ってくる。

   BigQuery の `doneru_ingest_runs` をこの Function から引けない
   （Functions に BigQuery のクライアントを足していない）ので、
   毎晩の取り込みのあとに python が Firestore へ1枚だけ写す。 */
const DONERU_HEALTH = db.collection("islandDoneruHealth").doc("last");
/* **何日ぶん入っていなかったら、島に出すか。**
   取りこぼした晩が2つ以上あって初めて出す、という線。

   1日では出さない。取り込みは 20:30 UTC の予定だが、**実測で1時間49分〜
   3時間32分遅れて走る**（`CLAUDE.md`）。ある瞬間に見れば、最後に入ってから
   28時間空いているのはふつうの姿で、そこで出すと遅れただけの晩に出る。

   2日でも出さない。1晩の失敗は実際にある（2026-09-06 に `error` が2回出て、
   どちらも数分後の実行で入っている）。GitHub Actions 側の都合で発火しない
   晩もある（`rebake.yml` が翌朝まで発火しなかった）。

   3日なら、遅れでも1回の失敗でも届かない。そして cookie が切れたときは
   必ずここを超える（入り直すまで二度と `ok` にならない）ので、
   **見つからずに終わることはない。** 出るまでの遅さより、
   ふだんの島に余計な1行が出ることのほうが害が大きい。 */
const DONERU_STALE_DAYS = 3;
/** Doneru を叩き直す間隔。1人ずつ叩くと相手先に迷惑なので、しばらく寝かせる。 */
const FUND_TTL_MS = 5 * 60 * 1000;
let fundCache: {at: number; doneru: number} | null = null;
/** 豚の貯金箱の1件ぶん。**サイトはここを配信とそっくり同じに読む。** */
type GoalRec = {key: string; start: number; superchat: number; goal: number};
/** 読んだままの4欄。**Firestore も GAS も、同じ名前で同じものを持つ。** */
type GoalRaw = {
  doneruGoalKey?: unknown;
  startAmount?: unknown;
  superChatAmount?: unknown;
  targetAmount?: unknown;
};
/* 鍵は変わらないが、スパチャの額は増える。**Doneru と同じ間隔で読み直す。** */
let goalCache: GoalRec | null = null;
let goalAt = 0;
/* 前回どちらから読めたか。**切り替わった回をログに立てるためだけに持つ。** */
let goalFrom: string | null = null;

/**
 * 読んだ4欄を、使える形にする。**半端に読めたものは通さない。**
 *
 * 欠けた欄を 0 で埋めない。起点（`startAmount`。25万円ほどの負の数）が
 * 欠けたまま 0 になると、貯金箱は実際より25万円多い額を出す。
 * **黙って違う額を出すくらいなら、次の出どころへ落とすほうがいい。**
 * @param {GoalRaw} d 読んだ4欄
 * @param {string} from どこから読んだか（ログ用。額は出さない）
 * @return {GoalRec | null} 使える値。1つでも欠けていれば null
 */
function goalRec(d: GoalRaw, from: string): GoalRec | null {
  const k = String(d.doneruGoalKey ?? "");
  if (!/^[0-9a-f]{16,64}$/.test(k)) {
    logger.warn("goal record: bad key", from);
    return null;
  }
  const start = Number(d.startAmount);
  const superchat = Number(d.superChatAmount);
  if (!Number.isFinite(start) || !Number.isFinite(superchat)) {
    logger.warn("goal record: bad amounts", from);
    return null;
  }
  /* 目標額だけは「いま貯まっている額」ではなく、バーの高さ。
     ここで落とすと貯まっている額まで消えるので、既定に落として通す。 */
  const goal = Number(d.targetAmount);
  return {key: k, start, superchat, goal: Number.isFinite(goal) ? goal : 50000};
}

/**
 * 貯金箱の元を Firestore（`islandGoal/{id}`）から読む。
 * **GAS の表が消えたときの控え。**
 * @return {Promise<GoalRec | null>} 読めた値。書類が無い・欠けていれば null
 */
async function goalFromFirestore(): Promise<GoalRec | null> {
  try {
    const snap = await GOAL_DOC.get();
    if (!snap.exists) return null;
    return goalRec((snap.data() ?? {}) as GoalRaw, "firestore");
  } catch (e) {
    logger.warn("goal record read failed (firestore)", String(e));
    return null;
  }
}

/**
 * 貯金箱の元を GAS の表から読む。**いまはこちらが正**（額が伸びる側）。
 * @return {Promise<GoalRec | null>} 読めた値。読めなければ null
 */
async function goalFromGas(): Promise<GoalRec | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(GAS_GOALS, {signal: ctl.signal});
    if (!r.ok) throw new Error(`gas ${r.status}`);
    const j = (await r.json()) as {data?: Json};
    return goalRec((j.data ?? {}) as GoalRaw, "gas");
  } catch (e) {
    logger.warn("goal record read failed (gas)", String(e));
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * 豚の貯金箱の元（鍵・起点・スパチャ・目標）を1件返す。
 *
 * 読む順は **GAS → 無ければ Firestore**。
 *
 * **Firestore を先にしない。** スパチャを書き足しているのは配信の OBS で、
 * 書き先はまだ GAS の表しかない。Firestore を先に読むと、配信で投げ銭が
 * 入ってもサイトの豚が伸びず、人が写し直すまで止まったままになる。
 * あやとは旅のあいだ17日つながらないので、その運用は置いていけない。
 * Firestore が正になるのは `SuperChats` の書き込み先を移したあと（#305 の3）。
 * **それまでは、額が増える側が正。**
 *
 * どちらも読めなかったときに **0 を作らない。** 前に読めた値（`goalCache`）が
 * あればそれを返し、それも無ければ null を返す。null を受けた `GET /fund` は
 * `island/state.fund` の集計値に落ち、そこも空なら 503 を返して、
 * 画面は足代の数字を黙って消す。
 * **貯金箱が「0円」と出るのは、止まるより悪い**
 * （`docs/island-standards.md` 10章）。
 * @return {Promise<GoalRec | null>} 元。1つも読めなければ null
 */
async function goalRecord(): Promise<GoalRec | null> {
  if (goalCache && Date.now() - goalAt < FUND_TTL_MS) return goalCache;
  let from = "gas";
  let rec = await goalFromGas();
  if (!rec) {
    from = "firestore";
    rec = await goalFromFirestore();
  }
  if (!rec) {
    // 数字が消えるより古いほうがまし。無ければ「無い」と言う（0 にしない）
    logger.warn("goal record: no source readable");
    return goalCache;
  }
  /* **どちらから読んだかを毎回残す。** 旅のあいだに GAS が切れても
     誰も見ていないので、「いつ控えに切り替わったか」がログにしか無い。
     切り替わった回だけは warn にして、grep で1行に絞れるようにする。 */
  if (goalFrom && goalFrom !== from) {
    logger.warn(`goal record: source changed ${goalFrom} -> ${from}`);
  }
  logger.info(`goal record: from ${from}`);
  goalFrom = from;
  goalCache = rec;
  goalAt = Date.now();
  return rec;
}

/**
 * Doneru の goal key を取る。環境変数があればそれ、無ければ貯金箱の元
 * （Firestore → GAS）から。
 * @return {Promise<string>} 鍵。取れなければ空文字
 */
async function doneruKeyOnly(): Promise<string> {
  const env = process.env.DONERU_GOAL_KEY ?? "";
  if (env) return env;
  return (await goalRecord())?.key ?? "";
}

const MAX_NOTE_LEN = 120;
const MAX_NAME_LEN = 20;
/* YouTube のハンドル(`@あやとグルメアプリ`)。
   ハンドルは最大30文字なので、`@` を足して31。名前(20)より長い。
   **切り詰めると別人の名前になる**ので、覚えておく側はここまで受ける。 */
const MAX_HANDLE_LEN = 31;
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
 * 「一緒にいた日数」の上位（#91）。**チャンネルID -> 日数。**
 *
 * `islandChannels` は毎晩 BigQuery から作り直していて（`python/island_channels.py`）、
 * そこに日数が入っている。ここはそれを画面へ渡すだけ。
 *
 * **上位だけ返す。** 辞書には 2,251人いるが、島に出るのは
 * キャラクターを作ってくれた 22人で、その人たちは日数の上位に固まっている。
 * 全員ぶん返すと `/state` が数十KB 太る。
 *
 * `days` を持っていない書類は返さない。日数を入れ始めたのが今日なので、
 * 入るまでは画面が焼き込みの値をそのまま使う（`content/residents.ts`）。
 * @return {Promise<Json>} チャンネルID -> 日数
 */
async function residentDays(): Promise<Json> {
  const snap = await CHANNELS.orderBy("days", "desc").limit(60).get();
  const out: Json = {};
  snap.forEach((d) => {
    const n = Number(d.data()?.days);
    if (Number.isFinite(n) && n > 0) out[d.id] = n;
  });
  return out;
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
    /* ひとことで言うと。打つ欄は `<textarea>`（`NextPlanEditor`）なので改行が来る */
    note: cleanText(b.note, 200),
    tags: Array.isArray(b.tags) ?
      b.tags.slice(0, 6).map((t) => clean(t, 16)) :
      [],
    place: {
      name: clean(place.name, 60),
      area: clean(place.area, 60),
      map: clean(place.map, 300),
    },
    about: Array.isArray(b.about) ?
      b.about.slice(0, 8).map((p) => cleanText(p, 600)) :
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
 *
 * **#202 の「配信日」とは別もの。** あちらは日本時間の0時で切る
 * （`streamEvents.ts` の `jstDay`）。ここは連投制限と訪問者数の1日で、
 * 揃える必要が無い。揃えると、いま数えている訪問者数の区切りが9時間
 * 動いて、その日の数字が1回だけ跳ねる。**意味の違うものを、名前が
 * 似ているというだけで揃えない。**
 * @return {string} YYYY-MM-DD
 */
const today = () => new Date().toISOString().slice(0, 10);

/**
 * C0 制御文字を落とす。**改行を通すかどうかだけが違う。**
 *
 * 落とす字を2か所に書くと、片方だけ直された日に
 * 「1行ものの口には入らないのに、本文の口には入る字」ができる。
 * 通す・通さないの判断は呼ぶ側（`clean` / `cleanText`）に置いて、
 * 落とす仕事はここ1つにまとめる。
 * @param {string} s 入力（`\r` はここへ来る前にそろえておく）
 * @param {boolean} keepLf 改行(U+000A)を通すか
 * @return {string} 落としたあとの字
 */
const dropCtrl = (s: string, keepLf: boolean): string => {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (keepLf && c === 0x0a) {
      out += ch;
      continue;
    }
    if (c < 0x20 || c === 0x7f) continue;
    out += ch;
  }
  return out;
};

/**
 * 制御文字を**改行ごと**落として、長さを切る。**1行ものの欄はこちら。**
 *
 * 題・名乗り・ハンドル・ふだ・URL・id・合言葉のように、
 * **1行で出ることを前提に置き場が組んであるもの**に使う。
 * ここに改行が通ると、札からはみ出したり、`alt` や配信のチャットのように
 * そもそも改行を持てない先で崩れたりする。
 *
 * **本文（付箋・返事・企画の説明・いまどこの一言）には `cleanText` を使う。**
 * あちらは改行だけ通す（#83。書いてくれた区切りを、こちらで潰さない）。
 * @param {unknown} v 入力
 * @param {number} max 最大文字数
 * @return {string} 整えた文字列
 */
const clean = (v: unknown, max: number): string =>
  dropCtrl(String(v ?? ""), false).trim().slice(0, max);

/**
 * 制御文字を落として、**改行だけ通して**、長さを切る。**本文の欄はこちら。**
 *
 * ## なぜ要るのか
 *
 * 打つ欄が `<textarea>` の字は、箇条書きで書かれてくる。`clean` は改行を
 * **空白に変えずに消す**ので、行の終わりと次の行の頭がくっついて別の語に
 * 読める。入れ物に入る前に消えるので、**あとから直しようがない**（#83）。
 *
 * ## どこまで整えるか（画面の `asWritten` と同じ規則）
 *
 * | すること | なぜ |
 * | --- | --- |
 * | `\r\n` `\r` を `\n` にそろえる | Windows から来たものが1行おきに空く |
 * | `\n` 以外の C0 と DEL は落とす | タブやベルは字ではない。`clean` と同じ |
 * | 各行の行末の空白を落とす | 見えないのに、そこだけ余分に折り返す |
 * | 空行が2つ以上続いたら1つにする | 段落の切れ目は意味だが、5行の空きは意味ではない |
 * | 前と後ろの空白・空行を落とす | 紙の頭とお尻が間延びするだけ |
 *
 * **行の中の空白は1つも触らない。** 字下げも語のあいだの全角空白も、
 * 書いた人が置いたもの。
 *
 * 画面（`site/components/ui/Wrote.tsx` の `asWritten`）と**同じ規則を、
 * わざと両方に置いている。** ここだけにすると、この口を通らずに入った
 * 古い書類（改行の消えているぶん）や、GitHub Actions ／ 口から直に書く
 * 道具の字が素通りする。あちらだけにすると、Firestore に入る字が
 * 荒れたままになり、画面以外（焼き込み・配信のチャット・OBS）が困る。
 * **どの規則も2回かけても結果が変わらない**ので、二重にかかっても害が無い。
 *
 * ## 長さの数えかた
 *
 * **改行も1字として数える。** `max` は打つ欄の `maxLength` と同じ数なので、
 * ブラウザが受け付ける字数と、ここが受ける字数がずれない。
 * 切ったお尻に空白や改行が残ることがあるので、切ったあとにもう一度落とす。
 * @param {unknown} v 入力
 * @param {number} max 最大文字数（改行も1字）
 * @return {string} 整えた字。改行は残る
 */
const cleanText = (v: unknown, max: number): string =>
  dropCtrl(String(v ?? "").replace(/\r\n?/g, "\n"), true)
    .replace(/[^\S\n]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max)
    .trimEnd();

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
  /* 返事は**読むときにも通す。** 入れ物には口を通さずに入った古いぶんも
     あるので、ここで形をそろえる。改行を落とすと、返事だけ1本の棒になる */
  const reply = cleanText(v.reply, MAX_REPLY_LEN);
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
  /**
   * この企画のものだと決めた配信(#202)。**足すのはあやとだけ。**
   *
   * 配信日の境目は日本時間の0時にした。0時をまたいで配信が2本に
   * 割れたら、後半の動画IDをここに足すと、その企画のカードができる。
   * **時差を追いかけるのではなく、人が決める**(#201)。
   *
   * 1本の配信に企画が何本も乗る(N:N)。9月11日の配信は「北欧旅の
   * 出発日」「海外出発二周年」「ジョージアバイバイ」の3本を兼ねている。
   * 同じ動画IDが3つの企画に入ってよい。
   */
  videoIds: string[];
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
    // 形をそろえるのは1か所（`eventRef`）にまとめてある
    videoIds: eventRef(d.id, v).videoIds,
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
  /** 運営側の企画（`board: false`）も混ぜる。`/me` が企画を選ぶのに要る */
  events?: boolean;
}): Promise<Page<PlanShape>> {
  const want = !!q.archived;
  const withEvents = !!q.events;
  return pageOf(
    STREAM_EVENTS,
    clampPage(q.limit),
    q.before,
    planShape,
    /* **掲示板に出すのは「みんなが出した提案」だけ。**
       #202 で、同じ入れ物に運営側の企画（Git 側の企画と北欧◯日目）が
       入るようになった。あれはカードを企画に紐付けるための行で、
       誰かが出した提案ではない。混ぜると掲示板が急に14件増える。

       `hidden` では隠さない。あれを立てると `loadEvents` からも
       落ちて、カードが1枚も作られなくなる。**出さないのと、
       無いことにするのは別。** */
    (d) =>
      (d.get("archived") === true) !== want ||
      (!withEvents && d.get("board") === false),
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

/**
 * 札に書いてある日を見て、島に出す日付を決める(#294)。
 *
 * **止まっているときだけ日付を返す。ふだんは null。**
 *
 * **分からないときは、止まっていることにしない。** 欄が無い・空・形が違う・
 * 日付が未来、のどれでも null を返して黙る。取り込みの記録が読めなかった
 * だけの日に「止まっています」と出すと、**それ自体が嘘になる**
 * (`docs/island-standards.md` 10章)。倒れる方向は黙る側へ。
 *
 * 日をまたぐ数え方は、島じゅうと同じ日本時間で切る
 * (`site/lib/nightly.ts` の `jstNow`。`docs/island-misses.md` #29)。
 *
 * **外に出してあるのは、ここだけを外から通せるようにするため**
 * (`functions/tools/fund/asofcheck.cjs`)。読めなかった・形が違う・未来、を
 * 本物の関数で1回ずつ通さないと、「黙る」ほうを確かめたことにならない。
 * @param {unknown} okDay 札の `okDay`。Doneru のぶんが最後に入った日(日本時間)
 * @param {number} nowMs いまの時刻
 * @return {string | null} 止まっていれば「2026-09-12」の形。ふだんは null
 */
export function doneruStaleDay(
  okDay: unknown,
  nowMs: number,
): string | null {
  if (!isDay(okDay)) return null;
  const today = jstDay(nowMs);
  const days = Math.round(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${okDay}T00:00:00Z`)) /
      86400000,
  );
  // 未来の日付は札のほうが壊れている。数えずに黙る
  if (!Number.isFinite(days) || days < 0) return null;
  return days >= DONERU_STALE_DAYS ? okDay : null;
}

/**
 * Doneru のぶんが、いつまで入っているか(#294)。
 *
 * 返した日付は `GET /fund` の `doneruAsOf` に乗って、島の応援の区画に
 * 「Doneru のぶんは、いま◯月◯日まで入っています」の1行として出る。
 *
 * 札の `okDay` は「Doneru のぶんが最後に BigQuery へ入った日(日本時間)」で、
 * **札を書いた日ではない。** だから写す側(`python/doneru_health.py`)が
 * 止まっても、この日付が新しくなることはない。**古いほうへしか倒れない。**
 *
 * **投げない。** ここが落ちても `GET /fund` の今までの欄は1つも欠けない。
 * @return {Promise<string | null>} 止まっていれば日付。ふだんは null
 */
async function doneruAsOf(): Promise<string | null> {
  try {
    const snap = await DONERU_HEALTH.get();
    if (!snap.exists) return null;
    return doneruStaleDay((snap.data() ?? {}).okDay, Date.now());
  } catch (e) {
    // 読めなかったことだけ残す。読めない=止まっている、ではない
    logger.warn("doneru health read failed", String(e));
    return null;
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

/* ---------------- アラートボックス(#180) ----------------

   OBS のブラウザソースが開く `/alertbox` に、Doneru の鍵を渡すところ。

   **もともとは書き出しに焼き込んでいた。** `EXPO_PUBLIC_DONERU_WSS_URL`
   という環境変数で、`EXPO_PUBLIC_` で始まるものは Expo が中身へ焼く。
   焼いた先は公開されているので、`/alertbox` を開いた人は誰でも
   `entry-….js` から鍵をそのまま読めた。GitHub Secret に入れてあっても、
   焼き込んだ先が公開されていれば意味がない。

   **そして、この鍵は作り直せない。** あやとの言葉(2026-09-08)
   「Doneru の鍵を新しく作る仕組みはありません」。ふつうなら
   「漏れたら作り直す」で済むところが、ここでは済まない。
   だから **二度と外へ出さない形にするしかない。**

   ## 鍵の代わりに、こちらが作った合言葉を OBS に持たせる

   OBS のブラウザソースはログインできないので、URL に何かを持たせる
   しかない。そこに置くのを **鍵そのものではなく、こちらが発行した
   32桁の合言葉(`alertboxId`)** にする。ルーレットの表示側(#164)と
   遠隔操作(#165)と同じ形。

   これで変わるのは「誰が鍵を取れるか」:

   | | 鍵を取れる人 | 漏れたとき |
   | --- | --- | --- |
   | 前 | `/alertbox` を開いた世界中の誰でも | 作り直せない。打つ手なし |
   | いま | 合言葉を知っている人だけ | **合言葉のほうを作り直す**(`fresh`) |

   鍵そのものは、Doneru の WebSocket を開くのにどうしても要る
   (`wss://push.doneru.jp/alertbox?key=…` が向こうの決めた形)ので、
   合言葉を知っている画面には渡る。**そこは避けられない。**
   避けられるのは「書き出しに焼くこと」で、それをやめた。

   YouTube のほうは渡さない。トークンを取るのはサーバーの中だけにして、
   ブラウザには寿命の短いアクセストークンを返す(`/yt-token`)。
   ルーレットの `/roulette/yt-token` とまったく同じ考え。

   ## ルーレットと id を分けた理由

   `rouletteId` を使い回さない。片方が漏れたときに、もう片方まで
   貼り替えることになる。配信中の機材の URL を2つ同時に替えるのは、
   いちばんやりたくない作業。
*/
/** Doneru の投げ銭通知が流れてくる WebSocket。向こうが決めた形。 */
const DONERU_WSS = "wss://push.doneru.jp/alertbox";

/**
 * 合言葉から、その持ち主の Doneru の鍵を引く。
 *
 * **ログインを要求しない口から呼ばれる。** 合言葉(32桁)を知っていることが
 * 合言葉なので、当てられない長さかどうかを先に見る。
 * @param {string} id 32桁の合言葉
 * @return {Promise<string>} Doneru の鍵。無ければ空文字
 */
async function alertboxKey(id: string): Promise<string> {
  if (!/^[0-9a-f]{32}$/.test(id)) return "";
  const q = await USERS.where("alertboxId", "==", id).limit(1).get();
  if (q.empty) return "";
  return String(q.docs[0].data()?.doneruKey ?? "");
}

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

/* ---- 企画に付く画像(#202) ----
   旧 `nordicPhotos`。**書く口は当面2つ動かす。**
   旅で毎日使っているものを出発直前に作り替えたくないので、
   `POST /nordic/photos` はそのまま残して、中で両方に書く。
   画面が新しい口へ移ったら、古いほうを畳む。 */

/** 画像に添える一言。旧 `MAX_PHOTO_NOTE` と同じ。 */
const IMAGE_NOTE = MAX_PHOTO_NOTE;

/** 候補として返す企画1件。**どの企画の写真かを画面が選べるように。** */
type EventBrief = {id: string; title: string; date: string};

/**
 * その日に立っている企画を、古い順に返す。
 *
 * **1日に企画は何本でも立つ。** 9月11日は「北欧旅の出発日」「海外出発
 * 二周年」「ジョージアバイバイ」の3本が同じ配信に乗っている。
 * だから**1本に決めて返さない。** 選ぶのは画面（と、あやと）。
 *
 * 引きかたは**単一フィールドの等価だけ**（索引が要らない範囲・#168）。
 * @param {string} day その日（YYYY-MM-DD）
 * @return {Promise<EventBrief[]>} その日の企画。古い順
 */
async function eventsOnDay(day: string): Promise<EventBrief[]> {
  if (!isDay(day)) return [];
  const snap = await STREAM_EVENTS.where("date", "==", day).limit(30).get();
  const rows = snap.docs
    .filter((d) => d.get("hidden") !== true && d.get("archived") !== true)
    .map((d) => ({
      id: d.id,
      title: clean(d.get("title"), MAX_PLAN_TITLE),
      date: day,
      /* 出しどころの見分け。**まだ誰も採っていない提案に写真を
         付けない。** 掲示板には日付だけ入った提案が並ぶので、
         そこへ黙って写真が付くと、提案が企画に化けたように見える。 */
      real:
        d.get("status") === "next" ||
        d.get("status") === "done" ||
        !!d.get("planId") ||
        !!d.get("source"),
      at: Number(d.get("createdAt")) || 0,
    }))
    .sort((a, b) => a.at - b.at);
  const real = rows.filter((r) => r.real);
  return (real.length ? real : rows).map((r) => ({
    id: r.id,
    title: r.title,
    date: r.date,
  }));
}

/** 画像を1枚置いた結果。 */
type SavedImage =
  | {ok: true; id: string; doc: Json; events: EventBrief[]}
  | {ok: false; code: number; error: string};

/**
 * 送られてきた画像を置き場に焼いて、`islandStreamEventImage` に書く。
 *
 * **旧 `nordicPhotos` にも同じ書類IDで書く。** 画面が切り替わるまでの
 * あいだ、`/nordic` は古いほうを読んでいる。書類IDを揃えてあるので、
 * カードのID（`<画像のID>__<チャンネルID>`）も移行の前後で変わらない。
 *
 * 置いたその場でカードも作る。**画像は日次ジョブより後にできる**
 * （あやとが夜に貼る）ので、貼った側から埋めないとその日ぶんが
 * 翌朝まで出ない。
 * @param {string} uid 貼った人（あやと）
 * @param {Json} b 送られてきた中身
 * @param {string} day その日（YYYY-MM-DD）
 * @param {string} wantEvent どの企画か。空なら日付から選ぶ
 * @param {ImageRole} role 役目
 * @return {Promise<SavedImage>} 置いた結果
 */
async function saveEventImage(
  uid: string,
  b: Json,
  day: string,
  wantEvent: string,
  role: ImageRole,
): Promise<SavedImage> {
  // data URL で来ても、中身だけで来ても受ける
  const b64 = String(b.image ?? "").replace(/^data:[^,]*,/, "");
  let buf: Buffer;
  try {
    buf = Buffer.from(b64, "base64");
  } catch {
    return {ok: false, code: 400, error: "bad image"};
  }
  if (buf.length < 1024 || buf.length > MAX_PHOTO_BYTES) {
    return {ok: false, code: 400, error: "bad size"};
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
  if (!kind) return {ok: false, code: 400, error: "not an image"};

  const events = await eventsOnDay(day);
  /* 打たれた企画を優先する。無ければ**その日のいちばん古い企画。**
     ここで1本に決めるのは「この画像はどれに付くか」だけで、
     **カードを配る先は絞らない**（配る側は当たった企画を全部見る）。 */
  let streamEventId = clean(wantEvent, 64);
  if (streamEventId) {
    if (!(await STREAM_EVENTS.doc(streamEventId).get()).exists) {
      return {ok: false, code: 404, error: "no plan"};
    }
  } else {
    streamEventId = events[0]?.id ?? "";
    if (!streamEventId) {
      // 企画の無い日にも貼れる。あとから `POST /streamevents/images/{id}` で結ぶ
      logger.warn("image with no stream event", day);
    }
  }

  /* **1日の枠は、断るものを全部断ってから数える。** 先に数えると、
     形が違って弾かれた1枚や、企画IDを打ち間違えた1枚で枠が減る。
     旅の途中に電波の悪いところで貼り直すので、そこは減らさない。 */
  if (!(await takeQuota(uid, "nphoto", PHOTOS_PER_DAY))) {
    return {ok: false, code: 429, error: "too many today"};
  }

  const ref = IMAGES.doc();
  const at = Date.now();
  const stored = `nordic/photos/${day}/${ref.id}.${kind}`;
  const token = randomUUID();
  await admin
    .storage()
    .bucket(BUCKET)
    .file(stored)
    .save(buf, {
      contentType: `image/${kind}`,
      metadata: {
        // 置き場の名前に id が入っていて中身は変わらないので、
        // ブラウザにも CDN にも長く持たせてよい
        cacheControl: "public, max-age=31536000, immutable",
        metadata: {firebaseStorageDownloadTokens: token},
      },
    });
  const url = photoUrl(stored, token);
  const w = Math.max(0, Math.min(20000, Number(b.w) || 0));
  const h = Math.max(0, Math.min(20000, Number(b.h) || 0));
  const note = clean(b.note, IMAGE_NOTE);
  const takenAt = isDay(b.takenAt) ? (b.takenAt as string) : day;
  const sortOrder = Math.max(0, Math.min(9999, Number(b.sortOrder) || 0));

  const doc: Json = {
    streamEventId,
    role,
    // 日付も持つ。旧 `/nordic` の画面が日ごとに並べているため
    day,
    storagePath: stored,
    url,
    w,
    h,
    note,
    takenAt,
    sortOrder,
    uid,
    at,
    createdAt: at,
    updatedAt: at,
  };
  /* **古いほうにも同じ書類IDで書く。** 画面が切り替わってから畳む。
     `path` という欄の名前は旧来のまま（あちらを読む口がまだある）。 */
  await Promise.all([
    ref.set(doc),
    NPHOTOS.doc(ref.id).set({day, path: stored, url, w, h, note, at, uid}),
  ]);

  if (streamEventId) {
    try {
      const made = await mintForImage(imageRef(ref.id, doc));
      logger.info("cards for image", ref.id, JSON.stringify(made));
    } catch (e) {
      // カードは日次ジョブでも作られる。ここで落ちても写真は貼れている
      logger.warn("mint for image failed", ref.id, String(e));
    }
  }
  return {ok: true, id: ref.id, doc, events};
}

/**
 * 画像を1枚消す。置き場の実体と、旧来の書類と、カードもまとめて。
 * @param {string} id 画像のID
 * @return {Promise<boolean>} 消せたか。無ければ false
 */
async function dropEventImage(id: string): Promise<boolean> {
  const [now, old] = await db.getAll(IMAGES.doc(id), NPHOTOS.doc(id));
  const stored =
    clean(now.get("storagePath"), 300) || clean(old.get("path"), 300);
  if (!now.exists && !old.exists) return false;
  /* 先に置き場から消す。Firestore だけ消えて実体が残ると、
     もう誰からも見えないのに URL を知っている人には見え続ける。 */
  if (stored) {
    await admin
      .storage()
      .bucket(BUCKET)
      .file(stored)
      .delete({ignoreNotFound: true});
  }
  /* **カードも消す。** カードは平置きなので、画像を消しても勝手には
     消えない。残すと `/cards` が実体の無い URL を返し続ける。 */
  await dropCardsOfImage(id);
  await Promise.all([
    now.exists ? IMAGES.doc(id).delete() : Promise.resolve(),
    old.exists ? NPHOTOS.doc(id).delete() : Promise.resolve(),
  ]);
  return true;
}

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
  /* **元は台帳(`islandTips`)。旧 `nordicDays` はもう読まない**(#202)。
     あちらは配信日の境目が**日本時間の18時**（`published_at` から9時間引く）
     だった。旅で時差が9回変わるとそのたびに1日が2つに割れる(#201)ので、
     境目を**日本時間の0時**に揃えた台帳へ移した。入れ物はまだ消していない
     （全部動いてから消す）が、読むのはやめる。

     **金額はここから出さない。** 台帳は持っているが、島の画面では
     金額で並べない・出さない(#202)。ここが台帳と画面のあいだの口なので、
     そもそもチャンネルIDしか持ち出さない形にしてある。 */
  const events = await loadEvents();
  const [peopleByDay, residents] = await Promise.all([
    Promise.all(days.map((d) => channelsOfDay(events, d))),
    listResidents(),
  ]);
  /* **絵は、出す人ぶんだけを1回で引く**(`cards.ts` の `iconsOf`)。
     日ごとに引くと旅の日数ぶん往復が増える。日が何日あっても2往復。
     引く前に日ごとの上限(60人)で切る。出さない人の絵は要らない。 */
  const shown = peopleByDay.map((x) => x.slice(0, 60));
  const icons = await iconsOf(shown.flat());
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
  days.forEach((day, i) => {
    peopleOf.set(
      day,
      shown[i].map((channelId) => ({
        channelId,
        /* **絵は誰にでも出す。名前は出してよいと言った人だけ**（すぐ下）。
           前はここも `null` と直に書いていて、画面が焼き込みの22人
           (`site/content/residents.ts`)から引き直して埋めていた。表に
           入っていない人は、そこで黙って消えていた（`cards.ts` と同じ根っこ）。 */
        icon: icons.get(channelId) || null,
        name: named.get(channelId) || null,
      })),
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
  /* **512MiB。既定の 256MiB では絵を1枚受け取れないことがある。**
     2026-09-11、キャラクターの移行が 65人目で 500 を返して止まった。
     ログは `Memory limit of 256 MiB exceeded with 256 MiB used`。

     絵は base64 で本文に乗ってくる。4MB の元絵なら本文が 5.3MB になり、
     受け取った生のバイト列・JSON にした文字列・`Buffer.from` で戻した
     バイト列が同時に載る。そこへ幅ごとに焼いたものが4枚加わる。

     旅の写真（`/nordic/photos`）が 256MiB で何か月も落ちていないのは、
     ブラウザ側が長辺 1600px の webp に焼いてから送っていて、1枚
     200〜400KB しか来ないから。**キャラクターの `full` は縮めない**
     （持ち帰るものなので。`islandCharacter.ts` の `WIDTHS` の説明）ので、
     元絵の大きさがそのまま効く。

     **移行だけの話ではない。** あやとが旅先のスマホから絵を入れ替える道
     （`site/components/me/Characters.tsx`）も同じ本文を送る。17日間、
     落ちても原因を見に行けないので、受け取れる側を広げておく。 */
  {region: "us-central1", cors: true, maxInstances: 10, memory: "512MiB"},
  async (req, res) => {
    // Hosting の rewrite 経由でも直叩きでも動くように、前置きのパスを落とす
    const path = (req.path || "/").replace(/^\/island-api/, "") || "/";
    const method = req.method.toUpperCase();
    const raw = req.body;
    const body: Json =
      typeof raw === "object" && raw ? (raw as Json) : ({} as Json);

    try {
      /* ---------------- 島の遠隔操作(#165) ----------------
         中身は `remote.ts`。ここは取り付けだけ。扱ったら true が返る。 */
      const sid = req.query?.sessionId;
      if (
        await handleRemote(
          {
            method,
            path,
            auth: req.headers.authorization,
            sessionId: typeof sid === "string" ? sid : "",
            body,
          },
          res,
          ownerUid,
        )
      ) {
        return;
      }

      /* ---------------- あやと島カード(#173) ----------------
         中身は `cards.ts`。ここは取り付けだけ。扱ったら true が返る。
         「誰か」を見るところを増やさないよう、判定は関数で渡す。 */
      if (
        await handleCards(
          {method, path, auth: req.headers.authorization, body},
          res,
          {whoIs, ownerUid, listResidents},
        )
      ) {
        return;
      }

      /* ---------------- Doneru の対応表(#190) ----------------
         中身は `donors.ts`。ここは取り付けだけ。扱ったら true が返る。
         「誰か」を見るところを増やさないよう、判定は関数で渡す。 */
      if (
        await handleDonors(
          {method, path, auth: req.headers.authorization, body},
          res,
          {ownerUid},
        )
      ) {
        return;
      }

      /* ---------------- キャラクター(#284) ----------------
         中身は `islandCharacter.ts`。ここは取り付けだけ。扱ったら true。
         「誰か」を見るところと、OBS の合言葉を見るところを増やさない
         よう、どちらも関数で渡す。 */
      if (
        await handleCharacters(
          {
            method,
            path,
            auth: req.headers.authorization,
            query: (req.query ?? {}) as Json,
            body,
          },
          res,
          {ownerUid, alertboxKey},
        )
      ) {
        return;
      }

      /* ---------------- 公開バケットの片づけ(#289) ----------------
         中身は `publicPurge.ts`。ここは取り付けだけ。扱ったら true。
         **既定では1バイトも書かない。** あやとだけが叩けて、消せるのは
         あちらの決め打ちの表に載っている2つだけ。
         **用が済んだら、この取り付けごと外す。** */
      if (
        await handlePublicPurge(
          {method, path, auth: req.headers.authorization, body},
          res,
          {ownerUid},
        )
      ) {
        return;
      }

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
        /* 自分のチャンネルの、いまの写真。**1件だけ読む。**
           失敗しても `/me` は返す（顔が古いだけで、ログインは通したい）。 */
        let chPhoto: string | undefined;
        const myCh = (saved.channelId as string) || "";
        if (myCh) {
          try {
            const c = await db.collection("islandChannels").doc(myCh).get();
            chPhoto = (c.data()?.photo as string) || undefined;
          } catch (e) {
            logger.warn("channel photo lookup failed", myCh, String(e));
          }
        }

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
          /* **YouTube でいま出ている写真。** `photo` はログインを押した日の
             ままで止まる（そのとき貰ったトークンに入っていたもの）。写真を
             変えても、島のマイページだけ古い顔のまま残っていた。

             `islandChannels` は日次で入れ直している（#202）。あそこは
             2,200人ぶんの名簿なのでクライアントには開けていないので、
             **自分のぶんだけここで渡す。**
             取れなければ返さない。画面は `photo` に落ちるので顔は消えない。 */
          channelPhoto: chPhoto,
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
         **畳んだ**(#171)。`GET/POST /drafts` はもう無い。

         役目は `/nextplans` に移っている(#161)。残してあったのは、
         Functions と Hosting を別々に手で起動するので、画面が古い日に
         404 で止まらないため。両方とも本番に出て3日たったので、
         古い画面を開きっぱなしのタブも、もう残っていない。

         **入れ物(`islandDrafts`)は消していない。** 本番0件だが、
         `firestore.rules` は deny のままにしてある。 */

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
        /* 中身は新しいほう(`islandStreamEventImage`)に寄せてある。
           **返す形は変えていない。** 企画のIDと候補は足したが、
           古い画面はその欄を見ないので影響が無い。 */
        const out = await saveEventImage(
          uid,
          body,
          day,
          clean(body.streamEventId, 64),
          "card",
        );
        if (!out.ok) {
          res.status(out.code).json({error: out.error});
          return;
        }
        res.set("Cache-Control", "no-store");
        res.json({photo: {id: out.id, ...out.doc}, events: out.events});
        return;
      }

      const photoMatch = path.match(/^\/nordic\/photos\/([A-Za-z0-9_-]{6,})$/);
      if (method === "DELETE" && photoMatch) {
        const uid = await ownerUid(req.headers.authorization);
        if (!uid) {
          res.status(403).json({error: "not allowed"});
          return;
        }
        if (!(await dropEventImage(photoMatch[1]))) {
          res.status(404).json({error: "not found"});
          return;
        }
        res.set("Cache-Control", "no-store");
        res.json({id: photoMatch[1]});
        return;
      }

      /* ---------------- 企画に付く画像(#202) ----------------
         上の `/nordic/photos` と同じものを、**企画から見た口**で出す。
         あちらは「日付 → 写真」で、こちらは「企画 → 画像」。

         **両方を当分動かす。** 旅で毎日使っているものを出発直前に
         作り替えない(#202 の順番)。画面が移ったら古いほうを畳む。 */
      /* その日に立っている企画。**写真を貼るときに選ぶための一覧。**
         1日に企画は何本でも立つので、1本に決めて返さない。 */
      if (method === "GET" && path === "/streamevents") {
        const day = String(req.query.day ?? "");
        if (!isDay(day)) {
          res.status(400).json({error: "bad day"});
          return;
        }
        res.set(
          "Cache-Control",
          "public, max-age=30, s-maxage=60, stale-while-revalidate=300",
        );
        res.json({day, events: await eventsOnDay(day)});
        return;
      }

      const eventImages = path.match(
        /^\/streamevents\/([A-Za-z0-9_-]{6,})\/images$/,
      );
      if (method === "GET" && eventImages) {
        /* **等価だけ。** 並べ替えと混ぜると複合索引が要る(#168)ので、
           貼った順に並べるのは手元でやる。 */
        const snap = await IMAGES
          .where("streamEventId", "==", eventImages[1])
          .limit(MAX_IMAGES)
          .get();
        const images = snap.docs
          .map((d) => imageRef(d.id, d.data() ?? {}))
          .sort((a, b) => a.at - b.at);
        res.set(
          "Cache-Control",
          "public, max-age=30, s-maxage=60, stale-while-revalidate=300",
        );
        res.json({images});
        return;
      }

      if (method === "POST" && eventImages) {
        const uid = await ownerUid(req.headers.authorization);
        if (!uid) {
          res.status(403).json({error: "not allowed"});
          return;
        }
        const ev = await STREAM_EVENTS.doc(eventImages[1]).get();
        if (!ev.exists) {
          res.status(404).json({error: "no plan"});
          return;
        }
        /* 画像の日付は、企画の日付を既定にする。**打てば上書きできる**
           （何日もある企画では、写真の日と企画の日が違う）。 */
        const day = isDay(body.day) ?
          (body.day as string) :
          shapeDay(ev.get("date"));
        if (!isDay(day)) {
          res.status(400).json({error: "bad day"});
          return;
        }
        const role = clean(body.role, 12);
        const out = await saveEventImage(
          uid,
          body,
          day,
          ev.id,
          (IMAGE_ROLES as readonly string[]).includes(role) ?
            (role as ImageRole) :
            "card",
        );
        if (!out.ok) {
          res.status(out.code).json({error: out.error});
          return;
        }
        res.set("Cache-Control", "no-store");
        res.json({image: {id: out.id, ...out.doc}});
        return;
      }

      /* 貼ったあとに、どの企画のものかを付け替える。**あやとだけ。**
         1日に企画が何本も立つので、貼るときの既定（その日のいちばん古い
         企画）が当たっているとは限らない。付け替えたらカードを作り直す。 */
      const imageOne = path.match(
        /^\/streamevents\/images\/([A-Za-z0-9_-]{6,})$/,
      );
      if (method === "POST" && imageOne) {
        const uid = await ownerUid(req.headers.authorization);
        if (!uid) {
          res.status(403).json({error: "not allowed"});
          return;
        }
        const ref = IMAGES.doc(imageOne[1]);
        const cur = await ref.get();
        if (!cur.exists) {
          res.status(404).json({error: "not found"});
          return;
        }
        const patch: Json = {updatedAt: Date.now()};
        const want = clean(body.streamEventId, 64);
        if (want) {
          if (!(await STREAM_EVENTS.doc(want).get()).exists) {
            res.status(404).json({error: "no plan"});
            return;
          }
          patch.streamEventId = want;
        }
        const role = clean(body.role, 12);
        if ((IMAGE_ROLES as readonly string[]).includes(role)) {
          patch.role = role;
        }
        if (typeof body.note === "string") {
          patch.note = clean(body.note, IMAGE_NOTE);
        }
        if (body.sortOrder !== undefined) {
          patch.sortOrder = Math.max(
            0,
            Math.min(9999, Number(body.sortOrder) || 0),
          );
        }
        await ref.set(patch, {merge: true});
        /* 付け替えたら、カードを合わせ直す。**消してから作り直さない。**
           消すと、本人が動かした置き方まで一緒に消える。
           渡らなくなった人のぶんだけ消して、あとは足す。 */
        const after = imageRef(ref.id, (await ref.get()).data() ?? {});
        try {
          await resyncCardsOfImage(after);
        } catch (e) {
          logger.warn("re-mint failed", ref.id, String(e));
        }
        res.set("Cache-Control", "no-store");
        res.json({image: after});
        return;
      }

      if (method === "DELETE" && imageOne) {
        const uid = await ownerUid(req.headers.authorization);
        if (!uid) {
          res.status(403).json({error: "not allowed"});
          return;
        }
        if (!(await dropEventImage(imageOne[1]))) {
          res.status(404).json({error: "not found"});
          return;
        }
        res.set("Cache-Control", "no-store");
        res.json({id: imageOne[1]});
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
         スマホから1回押せば出る口をここに置いた。

         **`week`(今週の予定)は、送られてきたときだけ書く。** 何行もある字なので
         親指で全部打ち直すものではないが、**消せないのはもっと悪い。**
         送らなければ今までどおり触らない(既存の呼び出しはそのまま動く)。 */
      if (method === "POST" && path === "/current") {
        const uid = await ownerUid(req.headers.authorization);
        if (!uid) {
          res.status(403).json({error: "not allowed"});
          return;
        }
        const place = clean(body.place, 60);
        /* ひとこと。打つ欄は `<textarea>`（`TripTools`）で、
           「着いた/今日はここから配信」を2行で書く人がいる */
        const word = cleanText(body.word, 140);
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
        /* 今週やること。**欄ごと送られてきたときだけ差し替える。**
           空の配列は「ぜんぶ消す」。1行だけ消すのは、残る行を送ってもらう。
           送ってこない呼び出し(GitHub Actions・今までの画面)は素通りする。 */
        if (Array.isArray(body.week)) {
          cur.week = (body.week as unknown[])
            .map((x) => clean(x, MAX_WEEK_LINE))
            .filter((x) => !!x)
            .slice(0, MAX_WEEK_LINES);
        }
        await STATE_DOC.set({current: cur}, {merge: true});
        res.set("Cache-Control", "no-store");
        res.json({current: cur});
        return;
      }

      /* ---------------- 読み取り ---------------- */
      if (method === "GET" && path === "/state") {
        const [stateSnap, notes, residents, days] = await Promise.all([
          STATE_DOC.get(),
          listNotes(200),
          listResidents(),
          residentDays(),
        ]);
        const state = stateSnap.exists ? stateSnap.data() ?? {} : {};
        res.set(
          "Cache-Control",
          "public, max-age=30, s-maxage=60, stale-while-revalidate=300",
        );
        /* `ideas` は返さなくなった(#171)。中身は8件とも #162 で付箋へ
           移してあって、`hidden: true` が付いている。**誰も出していない
           8件のために、島を開くたび Firestore を1回よけいに読んでいた。**

           `notes` は今までどおり配列で返して、そこに「まだ古いものが
           残っている」を添える。画面はこれを見て `/notes?before=` の
           続きを読める。**黙って切らない**のがこの役目。 */
        res.json({
          current: state.current ?? null,
          stats: state.stats ?? null,
          notes: notes.items,
          residents,
          /* 「一緒にいた日数」（#91）。チャンネルID -> 日数。
             画面はこれを次に開いたときのために控える。**その場では
             差し替えない。** 島に出ている人はこの数を重みに選んでいるので、
             読み込みの途中で入れ替えると、住人が目の前で入れ替わる。 */
          residentDays: days,
          /* 北欧旅の、日付で言える事実。いまは「着いた日」だけ。
             ここが入ると、企画が「いま行っている」から「行ってきた」に変わる
             (`site/content/plans.ts` の planPhase)。 */
          nordic: state.nordic ?? null,
          more: {
            notes: notes.more ? notes.next : null,
          },
        });
        return;
      }

      /* ---------------- 北欧旅の足代 ----------------
         返すのは合計と人数だけ。**個人の金額も順位も返さない**
         (`docs/nordic-fund.md` の決めごと)。

         **スパチャは半分だけ貯金箱に入る。これは仕様。** あやとの言葉
         「スパチャは投げ銭してくれたお金の半分を貯金箱に入れている」
         (2026-09-11)。ここに長いあいだ「OBS が半額にしているのは配信の
         演出上の都合」と書いてあったが、**それが間違いだった**
         (`docs/nordic-fund.md` 9.1)。 */
      if (method === "GET" && path === "/fund") {
        const [doneru, snap, goal, asOf] = await Promise.all([
          doneruNow(),
          STATE_DOC.get(),
          goalRecord(),
          /* **足すだけ。** ここが落ちても `doneruAsOf` が null を返すので、
             今までの4欄は1つも欠けない(`doneruAsOf` は投げない)。 */
          doneruAsOf(),
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
          /* Doneru のぶんが止まっている日だけ、いつまで入っているかを足す。
             **ふだんは欄ごと出さない**(#294)。元気な島に1行も足さないため。
             古い画面はこの欄を知らないので、あっても今までどおりに出る。 */
          ...(asOf ? {doneruAsOf: asOf} : {}),
        });
        return;
      }

      /* ---------------- スパチャの控え(#292) ----------------
         **あやとだけが読める。** 中身は投げ銭してくれた人の名前と額で、
         あやとの持ちものではない。公開のバケットに113件置きっぱなしに
         していた件(#289)と、まったく同じ性質のもの。

         上の `GET /fund` は合計しか返さない。1件ずつを見る道が
         スプレッドシートしか無く、それを外した日に**どこからも見られなく
         なった**(あやとの言葉 2026-09-11「アラートボックスをスプシから
         外した／スパチャ履歴はどこで見れる？」)。

         **キャッシュさせない。** 誰の手元にも焼き付けない。

         **ログに名前と額を出さない。** このリポジトリは公開で、
         Actions のログも誰でも読める(`CLAUDE.md`)。ここで `logger` を
         呼ぶのは合計が引けなかったときだけで、書くのは理由の文字だけ。

         並びは `day` の降順。**`createdAt` を持っていない**ので `pageOf` は
         使えない(あちらは付箋の形)。`day` はどの入り口からも必ず書かれる
         (`python/fund_box.py`)ので、抜けて消える書類は無い。日付の
         分からない手入力13件は空文字なので、降順のいちばん後ろに並ぶ。 */
      if (method === "GET" && path === "/fund/history") {
        if (!(await ownerUid(req.headers.authorization))) {
          res.status(403).json({error: "not allowed"});
          return;
        }
        const want = Number(req.query.limit ?? FUND_PAGE);
        const n = Number.isFinite(want) ?
          Math.min(Math.max(Math.trunc(want), 1), FUND_PAGE_MAX) :
          FUND_PAGE;
        /* 続きの位置。`day` は同じ日に何件も並ぶので、書類 id を第2の
           並び順に足す(単一フィールドの索引で足りる。うちは複合索引を
           作れない。GitHub #168)。 */
        let q = FUND_CHATS
          .orderBy("day", "desc")
          .orderBy(admin.firestore.FieldPath.documentId(), "desc");
        const before = String(req.query.before ?? "");
        const cur = /^([0-9-]{0,10})_(.+)$/.exec(before);
        if (cur) q = q.startAfter(cur[1], cur[2]);
        const snap = await q.limit(n + 1).get();
        const docs = snap.docs.slice(0, n);
        const more = snap.size > n;
        const last = docs[docs.length - 1];
        /* **合計は、いま数える。** 焼いてある `island/state.fund.box` を
           使うと、毎晩の掃除が走る前に入ったぶんだけ一覧と食い違って、
           「415件」と書いてある下に416行並ぶ。数え上げは1回の読みで済む。

           引けなかったら `null`。**0 を返さない**(`island-standards.md` 10)。 */
        let count: number | null = null;
        let yen: number | null = null;
        try {
          const agg = await FUND_CHATS.aggregate({
            count: admin.firestore.AggregateField.count(),
            yen: admin.firestore.AggregateField.sum("yen"),
          }).get();
          count = agg.data().count;
          yen = agg.data().yen;
        } catch (e) {
          // 額も名前も出さない。引けなかったことだけを残す
          logger.warn("fund history total failed", String(e));
        }
        res.set("Cache-Control", "no-store");
        res.json({
          chats: docs.map((d) => {
            const v = d.data();
            return {
              id: d.id,
              day: typeof v.day === "string" ? v.day : "",
              at: typeof v.at === "string" ? v.at : null,
              yen: Number(v.yen) || 0,
              who: typeof v.who === "string" ? v.who : "",
              /* 画面には出さない。手で入れたぶんは打った日しか分かって
                 いない(`at` が `00:00`)ので、時計を出すかどうかだけに使う。 */
              src: typeof v.src === "string" ? v.src : "",
            };
          }),
          more,
          next: more && last ? `${last.get("day") ?? ""}_${last.id}` : null,
          count,
          yen,
        });
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

      /* ---------------- 企画提案(旧) ----------------
         **畳んだ**(#171)。`GET/POST /ideas` と `POST /ideas/:id/vote` は
         もう無い。役目は `/nextplans`(#161) と付箋(#160) に移っている。

         残してあったのは、Functions と Hosting を別々に手で起動するので、
         画面が古い日に 404 で止まらないため。両方とも本番に出て3日たった。

         **入れ物は消していない。** `islandIdeas` の8件は #162 で付箋へ移して
         あって、`movedTo` の印と `hidden: true` が付いた状態で残っている。
         **書いた人の字なので消さない。** `islandVotes` の13件も同じ。
         `firestore.rules` はどちらも deny のまま。 */

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
        const text = cleanText(body.text, MAX_NOTE_LEN);
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
        const text = cleanText(body.text, MAX_NOTE_LEN);
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
          /* **IP は取らない**(#293)。読む仕組みが1つも無いまま、消す期限も
             決めずに溜めていた。付箋は消さない設計なので、持てば永久に残る。 */
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
        const text = cleanText(body.text, MAX_REPLY_LEN);
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
          /* `?events=1` で運営側の企画も混ぜる。**掲示板は付けない。**
             `/me` が「どの企画にこの配信を足すか」を選ぶために要る。 */
          events: req.query.events === "1",
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
        const snap = await STREAM_EVENTS.doc(planOne[1]).get();
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
        const ref = await STREAM_EVENTS.add({
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
          /* **IP は取らない**(#293)。付箋と同じ理由。 */
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
        const ref = STREAM_EVENTS.doc(planOne[1]);
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
        const planRef = STREAM_EVENTS.doc(id);
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
        const ref = STREAM_EVENTS.doc(planStatus[1]);
        if (!(await ref.get()).exists) {
          res.status(404).json({error: "no plan"});
          return;
        }
        /* **Git 側の企画1つに、結び付く行は1つだけ。**
           2つあると、掲示板には「提案」のまま並ぶ行と、カードの付く行が
           別々にできる。ジョージアバイバイと海外出発二周年が実際にそうで、
           清書したのに段が動かないように見えていた（#202 の種入れが、
           掲示板にもう出ていた提案を見ずに同じ企画をもう1件作った）。
           しまってあるものは数えない。付け替えの途中で行き止まりになる。 */
        if (planId) {
          const taken = await STREAM_EVENTS
            .where("planId", "==", planId)
            .limit(5)
            .get();
          const other = taken.docs.find(
            (d) => d.id !== planStatus[1] && d.get("archived") !== true,
          );
          if (other) {
            res.status(409).json({error: "planId taken", by: other.id});
            return;
          }
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

      /* この企画のものだと決めた配信(#202)。**あやとだけ。**
         `/me` から打てるようにしてあるのは、これを足す用事が
         **旅の途中に起きる**から。0時をまたいで配信が2本に割れた夜に、
         後半の動画IDを足さないと、その日の後半に投げてくれた人の
         カードができない。

         **足す/外すではなく、送られてきた一覧で置き換える。** 打ち間違えた
         ものを外す道が要るし、一覧で持つほうが画面が単純になる。 */
      const planVideos = path.match(
        /^\/nextplans\/([A-Za-z0-9_-]{6,})\/videos$/,
      );
      if (method === "POST" && planVideos) {
        if (!(await ownerUid(req.headers.authorization))) {
          res.status(403).json({error: "not allowed"});
          return;
        }
        const raw = Array.isArray(body.videoIds) ? body.videoIds : [];
        const seen = new Set<string>();
        const videoIds: string[] = [];
        for (const x of raw.slice(0, 40)) {
          /* URL を貼られても受ける。旅の途中にスマホで打つものなので、
             動画IDだけを抜き出させるほうが手間になる。 */
          const s = clean(x, 200);
          const hit = /([A-Za-z0-9_-]{11})(?:[^A-Za-z0-9_-]|$)/.exec(s);
          const id = hit?.[1] ?? "";
          if (!VIDEO_ID.test(id) || seen.has(id)) continue;
          seen.add(id);
          videoIds.push(id);
        }
        /* 打ったのに1本も読めなかったときだけ止める。**空で送るのは
           「ぜんぶ外す」なので、それは通す。** */
        if (raw.length > 0 && videoIds.length === 0) {
          res.status(400).json({error: "bad video"});
          return;
        }
        const ref = STREAM_EVENTS.doc(planVideos[1]);
        if (!(await ref.get()).exists) {
          res.status(404).json({error: "no plan"});
          return;
        }
        await ref.set({videoIds, updatedAt: Date.now()}, {merge: true});
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
        const ref = STREAM_EVENTS.doc(planArchive[1]);
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

      /* ---- アラートボックス(#180) ----

         OBS に貼る URL の合言葉を出す。**あやとだけ。**
         作り直さないのが既定。毎回変わると、配信のたびに OBS の URL を
         貼り替えることになる(ルーレット #164・遠隔操作 #165 と同じ理由)。
         `fresh` を付けたときだけ作り直す。**合言葉が漏れたときの手当てが
         これ。** Doneru の鍵のほうは作り直せないので、こちらを替える。 */
      if (method === "POST" && path === "/alertbox/session") {
        const uid = await ownerUid(req.headers.authorization);
        if (!uid) {
          res.status(403).json({error: "not allowed"});
          return;
        }
        const user = await USERS.doc(uid).get();
        let id = String(user.data()?.alertboxId ?? "");
        if (body.fresh === true || !/^[0-9a-f]{32}$/.test(id)) {
          id = randomUUID().replace(/-/g, "");
          await USERS.doc(uid).set({alertboxId: id}, {merge: true});
        }
        res.set("Cache-Control", "no-store");
        res.json({id, doneru: doneruHint(user.data()?.doneruKey)});
        return;
      }

      /* 投げ銭の通知が流れてくる WebSocket の URL。
         **ここだけログインが要らない。** OBS のブラウザソースは
         合言葉を持てないので、32桁の id を知っていることが合言葉。

         **鍵がここでブラウザへ渡る。** Doneru の WebSocket は
         `?key=` でしか繋げないので、避けようがない。避けられるのは
         「書き出しに焼くこと」のほうで、それはやめた。 */
      const abWss = path.match(/^\/alertbox\/([0-9a-f]{32})\/wss$/);
      if (method === "GET" && abWss) {
        const key = await alertboxKey(abWss[1]);
        if (!key) {
          /* 合言葉が違う・鍵がまだ入っていない。**どちらも 404 にする。**
             書き分けると、合言葉が当たったことだけを外から確かめられる。 */
          res.set("Cache-Control", "no-store");
          res.status(404).json({error: "no alertbox"});
          return;
        }
        res.set("Cache-Control", "no-store");
        res.json({wss: `${DONERU_WSS}?key=${encodeURIComponent(key)}`});
        return;
      }

      /* YouTube を読むための、寿命の短いトークン。
         **ここは鍵を返さない。** スパチャを拾うのに要るのはトークンだけで、
         鍵を渡す用事が無い。`/roulette/yt-token` と同じ形。

         ログインが要らないのは上と同じ理由(OBS が持てない)。
         `refresh` は、ブラウザで 401 が出たときに1回だけ来る。 */
      const abTok = path.match(/^\/alertbox\/([0-9a-f]{32})\/yt-token$/);
      if (method === "POST" && abTok) {
        const key = await alertboxKey(abTok[1]);
        if (!key) {
          res.set("Cache-Control", "no-store");
          res.status(404).json({error: "no alertbox"});
          return;
        }
        try {
          if (body.refresh === true) await doneruYoutubeRefreshToken(key);
          const t = await doneruYoutubeToken(key);
          res.set("Cache-Control", "no-store");
          res.json(t);
        } catch (e) {
          logger.warn("alertbox token failed", String(e));
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
