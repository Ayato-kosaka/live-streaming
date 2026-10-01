/**
 * 企画（`islandStreamEvent`）と、企画に付く画像（`islandStreamEventImage`）と、
 * 投げ銭の台帳（`islandTips`）。**カードはこの3つから組み上がる**(#202)。
 *
 * ## なぜ北欧から切り離すのか
 *
 * 元の形は「北欧旅のために急いで足したもの」がそのまま残っていた。
 * `nordicPhotos` も `nordicDays` も旅の名前がついていて、**日付が鍵**だった。
 * 章＝島 ⊃ 企画 ⊃ 配信という決めに合っていない。
 *
 * | 旧 | 新 |
 * | --- | --- |
 * | `nordicPhotos/{photoId}` | `islandStreamEventImage/{imageId}` |
 * | `nordicDays/{YYYY-MM-DD}.people` | `islandTips/{tipId}` |
 * | `islandNextPlans/{id}` | `islandStreamEvent/{id}` |
 *
 * ## 企画と配信は N:N
 *
 * **1本の配信に、企画が何本もぶら下がる。** 9月11日の配信がまさにそれで、
 * 「北欧旅の出発日」「海外出発二周年」「ジョージアバイバイ」の3本が
 * 同じ配信に乗っている（あやと・2026-09-07）。
 *
 * だから `videoId` から企画を引くところは、**必ず配列で返す。**
 * 1つ見つけたところで止めると、残りの企画のカードが黙って消える。
 * 消えたことは画面に出ないので、誰も気づけない
 * （`site/content/plans.ts` の `PLAN_BY_DAY` が同じ失敗をしていた）。
 *
 * ## 配信日の境目は日本時間の0時
 *
 * 旧来は `published_at` から9時間引いていた（＝**日本時間の18時**が境目）。
 * 旅で時差が9回変わると、そのたびに「その日いた人」が2日に割れる(#201)。
 *
 * **境目は `DATE(donated_at, "Asia/Tokyo")` に固定して、またいだぶんは
 * 人が決める。** 0時をまたいで配信が2本に割れたら、後半の `videoId` を
 * その企画の `videoIds` に足す。時差を追いかけるより、人が「この配信は
 * この企画」と決められる形のほうが強い。
 *
 * ## 索引を増やさない(#168)
 *
 * サービスアカウントに `datastore.indexAdmin` が無く、複合索引も
 * コレクショングループ索引も配れない。ここで使う `where` は
 * **単一フィールドの等価（と `in`）だけ**で、`orderBy` と混ぜない。
 * カードを**平置きの `islandCards`** にしてあるのも同じ理由
 * （サブコレクションにすると `/cards` がコレクショングループ索引を要る）。
 */

import {logger} from "firebase-functions";
import * as admin from "firebase-admin";

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

/** 企画。旧 `islandNextPlans`。**改名しただけで、中身の形は同じ。** */
export const EVENTS = db.collection("islandStreamEvent");
/** 企画に付く画像。旧 `nordicPhotos`。 */
export const IMAGES = db.collection("islandStreamEventImage");
/** 投げ銭の台帳。**クライアントからは読めない**（`firestore.rules`）。 */
export const TIPS = db.collection("islandTips");
/** 配られたカード。**平置き**(#202)。 */
export const CARDS = db.collection("islandCards");

/** 一度に読む企画の数。提案も含めて数百件の見立て。 */
export const MAX_EVENTS = 500;
/** 一度に読む画像の数。旅は10日で、1日に何枚でも貼れる。 */
export const MAX_IMAGES = 600;
/** 1回の問い合わせに入れる `in` の値の数。Firestore の上限は30。 */
const IN_CHUNK = 30;

/**
 * 名前の写しの長さ。**`islandCharacter.ts` の `MAX_NAME` と同じ 80字。**
 *
 * ここから `cards.ts` も引く。2か所に書くと、片方だけ切れた名前で鍵を
 * 作る日が来て、**焼いたときは当たっていた絵が、引くときだけ外れる。**
 */
export const MAX_NAME = 80;

type Json = Record<string, unknown>;

/** 画像の役目。カードになるのは `card` だけ。 */
export const IMAGE_ROLES = ["card", "gallery", "cover"] as const;
export type ImageRole = typeof IMAGE_ROLES[number];

/** 企画のうち、カードを組むために要るところだけ。 */
export type EventRef = {
  id: string;
  /** その日（YYYY-MM-DD）。無い企画（日付未定の提案）は空 */
  date: string;
  /** 「この配信は自分のもの」と名乗った動画。0時をまたいだ後半を手で足す */
  videoIds: string[];
};

/**
 * その日投げてくれた人ひとり（`channelsOfDay`）。
 *
 * **公開の面へそのまま出さない。** `channelId` は
 * `youtube.com/channel/UC…` を開けば本人の顔と名前に直結するし、
 * `nameSnapshot` は別名で投げた人の名乗りそのもの。外へ出るのは
 * `cards.ts` の `peopleForEveryone` を通したあと（絵と、名前を出してよいと
 * 言った人の名前だけ）。
 */
export type Tipper = {channelId: string; nameSnapshot: string};

/** 台帳の1行のうち、カードを組むために要るところだけ。 */
export type TipRef = {
  id: string;
  channelId: string | null;
  /**
   * **投げてくれたときに名乗っていた名前**（`islandTips.displayNameSnapshot`）。
   *
   * スパチャならそのときのチャンネル名、Doneru なら打った名前
   * （`python/island_tips.py` の `:301` と `:356`）。
   *
   * **カードに乗る絵は、まず `channelId` で決まる**（`cards.ts` の
   * `pickIcon`・#429 の A）。ここはその**受け皿**で、名簿が `channelId` を
   * 持っていない人の絵と、**名前を出してよいかの判定**に効く。
   * いまの表示名を引き直さないのは変わらない——引き直すと、あとから
   * 名前を変えた日に判定が動く。
   */
  nameSnapshot: string | null;
  /**
   * 台帳が持っている生の日（YYYY-MM-DD）。**投げてくれた瞬間の日本時間。**
   * 0時をまたいだ配信では、後半に投げた人がここで翌日になる。
   * **カードの当たりに使うのはここではなく `tipDay`。**
   */
  day: string;
  videoId: string | null;
  /**
   * **その配信が始まった時刻**（ミリ秒）。無ければ 0。
   *
   * `python/island_tips.py` が BigQuery の `started_ms` から入れている。
   * 日付の補正（`tipDay`）はここだけを見る。
   */
  videoStartedAt: number;
  /** もらった時刻（ミリ秒） */
  donatedAt: number;
};

/** 画像のうち、カードを組むために要るところだけ。 */
export type ImageRef = {
  id: string;
  /** 付いている企画。**空でよい**（企画の立っていない日にも貼れる） */
  streamEventId: string;
  role: ImageRole;
  url: string;
  w: number;
  h: number;
  note: string;
  at: number;
  /**
   * その写真の日（YYYY-MM-DD）。**貼った時点から入っている**
   * （`islandApi.ts` の `saveEventImage` が `doc.day` に書く）。
   *
   * **カードの軸はここ。** 企画ではない——企画の立っていない日があるため。
   */
  day: string;
  /**
   * 「この写真はこの配信のもの」と名乗る動画。**0時またぎの逃げ道。**
   *
   * 空なら企画（`EventRef.videoIds`）に落ちる。こうしておくと本番の
   * データを1バイトも動かさずにいまの挙動が保たれ、これから先は
   * 写真そのものに付けられる（`POST /streamevents/images/{id}`）。
   */
  videoIds: string[];
};

/**
 * 文字列にして、前後の空白を落として、長さで切る。
 * @param {unknown} v 受け取った値
 * @param {number} max 残す長さ
 * @return {string} 整えた文字列
 */
export function clean(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

/**
 * 日付の形か。
 * @param {unknown} v 入力
 * @return {boolean} YYYY-MM-DD なら true
 */
export const isDay = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** YouTube の動画IDの形。 */
export const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * 日本時間で日付に切る。**ここが配信日の境目**(#201・#202)。
 *
 * 9時間引く（＝18時が境目）のはやめた。旅で時差が変わるとずれる。
 * `Intl` を使わずに足し算で出しているのは、日本が夏時間を持たないから。
 * @param {number} ms ミリ秒
 * @return {string} YYYY-MM-DD
 */
export const jstDay = (ms: number): string =>
  new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);

/**
 * 「その人」を1つの文字列にする。カードIDの後ろ半分になる。
 *
 * チャンネルがあればそれ。無ければ絵の id に `i-` を付ける
 * （持ち主が分からない人。誰のマイページにも入らない）。
 * @param {string | null} channelId YouTube のチャンネルID
 * @param {string | null} icon キャラクターの絵の id
 * @return {string} 誰か。どちらも無ければ空
 */
export function whoKey(
  channelId: string | null,
  icon?: string | null,
): string {
  if (channelId) return channelId;
  if (icon) return `i-${icon}`;
  return "";
}

/**
 * カードのID。**画像と人が揃えば決まる。**
 *
 * 旧来の `<写真のID>__<チャンネルID>` と**同じ形にしてある。**
 * 移行で `nordicPhotos/{id}` を `islandStreamEventImage/{id}` に
 * 同じ書類IDで移すので、**すでに動かしてあるカードの置き方が生き残る。**
 * @param {string} imageId 画像のID
 * @param {string} who `whoKey` が返したもの
 * @return {string} カードのID
 */
export const cardId = (imageId: string, who: string): string =>
  `${imageId}__${who}`;

/**
 * 企画を読む形にする。
 * @param {string} id 書類ID
 * @param {Json} v 中身
 * @return {EventRef} カードを組むために要るところ
 */
export function eventRef(id: string, v: Json): EventRef {
  const raw = Array.isArray(v.videoIds) ? v.videoIds : [];
  return {
    id,
    date: isDay(v.date) ? v.date : "",
    videoIds: raw
      .map((x) => clean(x, 16))
      .filter((x) => VIDEO_ID.test(x))
      .slice(0, 40),
  };
}

/**
 * 企画をぜんぶ読む。**`where` を付けない。**
 *
 * 日付で絞って並べると複合索引が要る(#168)。数百件しかないので、
 * 引いてから手元で突き合わせる（`listStickies` と同じ型）。
 * @return {Promise<EventRef[]>} 企画
 */
export async function loadEvents(): Promise<EventRef[]> {
  const snap = await EVENTS.limit(MAX_EVENTS).get();
  const out: EventRef[] = [];
  snap.forEach((d) => {
    if (d.get("hidden") === true) return;
    out.push(eventRef(d.id, d.data() ?? {}));
  });
  return out;
}

/**
 * **その写真に当たる投げ銭**を引く。画像を貼った直後に、その場で
 * カードを作るため。
 *
 * 日次ジョブを待たない道が要る。名簿（旧 `nordicDays`）は翌朝に入るので
 * 「貼ったらその日のぶんが配られる」が成り立たなかったが、**台帳は
 * 投げ銭のたびに入る**ので、貼った時点でもう相手がいる。
 *
 * 当たり方は2つあって、**両方を足す**（片方で打ち切らない）。
 *
 * 1. `tipDay(tip)` が写真の日と同じ
 * 2. `tip.videoId` が写真の `videoIds`（**無ければ企画の `videoIds`**）
 *    に入っている。0時またぎを人が手で拾う逃げ道
 *
 * ## なぜ `day` を2本引くのか
 *
 * 引けるのは台帳の**生の** `day`（投げた瞬間の日本時間）だけで、
 * `tipDay` の補正は手元でしかかけられない。**`tipDay` は生の `day`
 * 以前にしかならない**——配信は投げ銭より先に始まるので、補正は
 * 「翌日に落ちていたものを前の日へ戻す」方向にしか効かない。
 * だから写真の日 `D` に当たる投げ銭の生の `day` は、`D` か `D+1` の
 * どちらかしかない。2本引いて、手元で `tipDay` で絞る。
 *
 * 引き方は**単一フィールドの等価と `in` だけ**（索引を増やさない・#168）。
 * @param {ImageRef} image 写真
 * @param {EventRef | null} ev 付いている企画。**無いこともある**
 * @return {Promise<TipRef[]>} その写真に当たる投げ銭
 */
export async function tipsForImage(
  image: ImageRef,
  ev: EventRef | null,
): Promise<TipRef[]> {
  const day = imageDay(image, ev);
  /* 写真が自分で名乗っていればそれ。無ければ企画のものに落ちる。
     本番で `videoIds` を持っているのは企画のほうだけなので、こうすると
     データを1バイトも動かさずにいまの挙動が保たれる。 */
  const vids = image.videoIds.length ? image.videoIds : ev?.videoIds ?? [];
  const jobs: Promise<FirebaseFirestore.QuerySnapshot>[] = [];
  if (day) {
    jobs.push(TIPS.where("day", "==", day).get());
    jobs.push(TIPS.where("day", "==", dayAfter(day)).get());
  }
  for (let i = 0; i < vids.length; i += IN_CHUNK) {
    jobs.push(TIPS.where("videoId", "in", vids.slice(i, i + IN_CHUNK)).get());
  }
  if (jobs.length === 0) return [];
  const snaps = await Promise.all(jobs);
  const inVids = new Set(vids);
  const seen = new Set<string>();
  const out: TipRef[] = [];
  for (const s of snaps) {
    s.forEach((d) => {
      if (seen.has(d.id)) return;
      seen.add(d.id);
      const t = tipRef(d.id, d.data() ?? {});
      /* **翌日ぶんを引いたままにしない。** `D+1` の問い合わせには
         「翌日に始まった別の配信」の投げ銭も混ざってくる。ここで
         落とさないと、その人たちに前の日の写真が渡る。 */
      const hit = (!!day && tipDay(t) === day) ||
        (!!t.videoId && inVids.has(t.videoId));
      if (hit) out.push(t);
    });
  }
  return out;
}

/**
 * 台帳の1行を読む形にする。
 * @param {string} id 書類ID
 * @param {Json} v 中身
 * @return {TipRef} カードを組むために要るところ
 */
export function tipRef(id: string, v: Json): TipRef {
  const at = v.donatedAt;
  const ms =
    at instanceof admin.firestore.Timestamp ?
      at.toMillis() :
      Number(at) || 0;
  /* **配信の始まった時刻も読む。** `donatedAt` と同じで、Timestamp で
     入っていることも数で入っていることもある（`python/island_tips.py` は
     数で書くが、口から入れ直したぶんは Timestamp になる）。
     ここを読み落とすと `tipDay` の補正がまるごと死ぬ——python 側では
     実際にそれで、22時に始まった配信の 00:23 に投げてくれた人が1人、
     本番で翌日に落ちていた。 */
  const started = v.videoStartedAt;
  const startedMs =
    started instanceof admin.firestore.Timestamp ?
      started.toMillis() :
      Number(started) || 0;
  return {
    id,
    channelId: clean(v.channelId, 64) || null,
    nameSnapshot: clean(v.displayNameSnapshot, MAX_NAME) || null,
    day: isDay(v.day) ? v.day : ms ? jstDay(ms) : "",
    videoId: clean(v.videoId, 16) || null,
    videoStartedAt: startedMs,
    donatedAt: ms,
  };
}

/**
 * その投げ銭が、**どの日の配信**のものか。
 *
 * **`videoStartedAt` を先に見るのが肝。** 配信が「どの日のものか」を
 * 決めるのは配信の始まりで、視聴者がいつ押したかではない。22時に始まった
 * 配信に 00:23 で投げてくれた人は、台帳の `day`（投げた瞬間の日本時間）が
 * 翌日になっている。そのまま当てると、**同じ配信なのにその人だけ翌日の
 * 写真に落ちる**（2026-09-06 の配信で実際に1人落ちた。`python/island_cards.py`
 * の `events_for_tip` に同じ補正が入っている。**TypeScript 側はこれを
 * 持っていなかった**ので、ここで揃える）。
 * @param {TipRef} tip 投げ銭1件
 * @return {string} 配信の日（YYYY-MM-DD）。決まらなければ空
 */
export function tipDay(tip: TipRef): string {
  if (tip.videoStartedAt) return jstDay(tip.videoStartedAt);
  return tip.day || (tip.donatedAt ? jstDay(tip.donatedAt) : "");
}

/**
 * 画像を読む形にする。
 * @param {string} id 書類ID
 * @param {Json} v 中身
 * @return {ImageRef} カードを組むために要るところ
 */
export function imageRef(id: string, v: Json): ImageRef {
  const role = clean(v.role, 12);
  /* 検め方は `eventRef` と同じ。写真に付ける動画IDも企画に付けるものも、
     同じ11文字・同じ上限で扱わないと、片方だけ通る形が生まれる。 */
  const vids = Array.isArray(v.videoIds) ? v.videoIds : [];
  return {
    id,
    streamEventId: clean(v.streamEventId, 64),
    role: (IMAGE_ROLES as readonly string[]).includes(role) ?
      (role as ImageRole) :
      "card",
    url: clean(v.url, 600),
    w: Number(v.w) || 0,
    h: Number(v.h) || 0,
    note: clean(v.note, 200),
    at: Number(v.at) || 0,
    day: isDay(v.day) ? v.day : "",
    videoIds: vids
      .map((x) => clean(x, 16))
      .filter((x) => VIDEO_ID.test(x))
      .slice(0, 40),
  };
}

/**
 * その写真が、**どの日のもの**か。**カードの `day` はここから決まる。**
 *
 * 貼るときに `day` が入る（`islandApi.ts` の `saveEventImage`）ので、
 * ふつうはそれで決まる。企画の日付に落ちるのは、移してきた古い書類の
 * ように `day` を持たないものだけ。
 *
 * **企画の日付を軸にしない。** 企画の立っていない日に貼った写真が
 * 落ちる先を失う（それで11日ぶんカードが0枚になっていた）。
 * @param {ImageRef} image 写真
 * @param {EventRef | null} ev 付いている企画。無いこともある
 * @return {string} その写真の日（YYYY-MM-DD）。決まらなければ空
 */
export function imageDay(image: ImageRef, ev: EventRef | null): string {
  if (image.day) return image.day;
  if (ev?.date) return ev.date;
  return image.at ? jstDay(image.at) : "";
}

/**
 * 次の日（YYYY-MM-DD）。
 *
 * 台帳を「その日」と「その翌日」の2本で引くために要る。日付の足し算
 * だけなので時差は関係ない（UTC の0時で足して、同じ UTC で読む）。
 * @param {string} day YYYY-MM-DD
 * @return {string} 翌日
 */
function dayAfter(day: string): string {
  const ms = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(ms)) return day;
  return new Date(ms + 86400000).toISOString().slice(0, 10);
}

/**
 * その企画の、カードになる画像。
 * @param {string} eventId 企画のID
 * @return {Promise<ImageRef[]>} `role: "card"` の画像
 */
export async function cardImagesOf(eventId: string): Promise<ImageRef[]> {
  /* **等価だけ。** `role` も足すと複合索引になるので、役目は手元で見る。 */
  const snap = await IMAGES.where("streamEventId", "==", eventId)
    .limit(MAX_IMAGES)
    .get();
  const out: ImageRef[] = [];
  snap.forEach((d) => {
    const im = imageRef(d.id, d.data() ?? {});
    if (im.role === "card" && im.url) out.push(im);
  });
  return out;
}

/** カードを作った結果。ログに出す。 */
export type MintResult = {made: number; kept: number; fixed: number};

/**
 * 画像 × 投げ銭ぶん、カードを作る。**置き方は上書きしない。**
 *
 * `x/y/rot/scale` に触らない。触ると**動かしたカードが元に戻る。**
 *
 * **もうある書類でも、素性の欄が欠けていたら足す。** 旧来の
 * `islandCards` には「本人が動かしたぶんの上書き」しか入っておらず、
 * `earnedAt` も `streamEventImageId` も無い。`/cards` は
 * `orderBy("earnedAt")` で引くので、足さないと**動かしたカードだけが
 * 一覧から消える**（並べ替えの欄が無い書類は、その問い合わせに載らない）。
 * @param {ImageRef} image カードになる画像。**1枚ぶん**
 * @param {TipRef[]} tips その写真に当たる投げ銭
 * @param {EventRef | null} ev 付いている企画。**無いこともある**
 * @return {Promise<MintResult>} 作った数、すでにあった数、素性を足した数
 */
export async function mintCards(
  image: ImageRef,
  tips: TipRef[],
  ev: EventRef | null,
): Promise<MintResult> {
  /* **日付は写真が決める。** 1回だけ出して、この写真から出る
     カード全部に同じものを入れる（下の `day` の注を見る）。 */
  const cardDay = imageDay(image, ev);
  /** 同じ人が同じ日に何度も投げても、カードは1枚。いちばん早い1回を採る。 */
  const first = new Map<string, TipRef>();
  for (const t of tips) {
    const who = whoKey(t.channelId);
    if (!who) continue;
    const had = first.get(who);
    if (!had || t.donatedAt < had.donatedAt) first.set(who, t);
  }
  const want: {id: string; tip: TipRef; who: string}[] = [];
  for (const [who, tip] of first) {
    want.push({id: cardId(image.id, who), tip, who});
  }
  if (want.length === 0) return {made: 0, kept: 0, fixed: 0};

  let made = 0;
  let kept = 0;
  let fixed = 0;
  const now = Date.now();
  /* Firestore の `getAll` も `batch` も上限があるので、切って回す。 */
  for (let i = 0; i < want.length; i += 200) {
    const part = want.slice(i, i + 200);
    const had = await db.getAll(...part.map((w) => CARDS.doc(w.id)));
    const batch = db.batch();
    let n = 0;
    part.forEach((w, k) => {
      const who = {
        channelId: w.tip.channelId,
        streamEventId: image.streamEventId,
        streamEventImageId: image.id,
        /* 日付も持つ。画面が企画の札を引くのに使う。画像から辿れば
           出せるが、`/cards` は毎回100枚単位で返すので、そのたびに
           企画まで往復すると読みが3倍になる。

           **入れるのは「写真の日」**（`imageDay`）。投げ銭の日ではない。
           台帳の `day` は投げてくれた瞬間の日本時間で、0時をまたいだ
           配信では後半の人が翌日になる。それをそのまま入れると
           **同じ1枚の写真から出たカードが2つの日付に割れる**（本番で
           実際に割れていた。food-wine-fest の3枚が 09-06 と 09-07）。
           画面は `day` で企画の札を引くので、割れたほうは札が出ず、
           日付も1日ずれる。

           **前は「企画の日」を入れていた。写真の日に変えたのは、
           企画の立っていない日があるから。** 企画が無ければ日付の
           落ち先も無くなり、そこに貼った写真のカードが丸ごと作られ
           なかった（本番で11日ぶん0枚）。写真は `day` を貼った時点から
           持っているので、企画の有る無しに関わらず必ず決まる。
           企画は「あれば落ち先として使う」だけに降りた（`imageDay`）。
           **割れさせない、という元の目的はそのまま。** */
        day: cardDay,
        earnedAt: w.tip.donatedAt || image.at || now,
        /* **投げてくれたときに名乗っていた名前を、ここで焼き込む。**

           絵の本筋は `channelId`（`cards.ts` の `pickIcon`）で、ここは
           名簿が `channelId` を持っていない人の**受け皿**。それと、
           **名前を出してよいか**はいまもこの写しだけで決まる。

           焼き込むのが肝で、あとから YouTube の名前を変えても Doneru の
           名前を変えても、**受け皿の側も動かない。** いまの表示名を引き
           直していたころは、別名で投げた人の本体が公開の面に出ていた
           （Doneru の別名 → `islandDonors` → いま名乗っている名前 → 絵）。 */
        nameSnapshot: w.tip.nameSnapshot,
      };
      if (had[k].exists) {
        if (had[k].get("streamEventImageId")) {
          /* 素性はそろっているが、欄が**台帳と食い違っている**書類。
             - 日付：0時をまたいだぶんが投げ銭の日で焼かれている
             - 名前の写し：写しを持たせる前に作られた51枚が、これ。
               **足さないと、いま絵が出ている人が全員消える。**
             置き方には触らないので、動かしたカードは動かない。 */
          const patch: Record<string, unknown> = {};
          if (who.day && had[k].get("day") !== who.day) patch.day = who.day;
          /* `??` で `undefined` を `null` に寄せてから比べる。寄せないと
             「写しを持たない書類」と「写しが空の書類」が毎回ちがう扱いに
             なって、**何も変わっていない晩でも全枚数を書き直す。** */
          if ((had[k].get("nameSnapshot") ?? null) !== who.nameSnapshot) {
            patch.nameSnapshot = who.nameSnapshot;
          }
          if (Object.keys(patch).length > 0) {
            batch.set(CARDS.doc(w.id), {...patch, updatedAt: now},
              {merge: true});
            fixed += 1;
            n += 1;
            return;
          }
          kept += 1;
          return;
        }
        // 旧来の「動かしたぶんだけ」の書類。**置き方には触らない。**
        batch.set(CARDS.doc(w.id), {...who, updatedAt: now}, {merge: true});
        fixed += 1;
        n += 1;
        return;
      }
      batch.set(CARDS.doc(w.id), {
        ...who,
        ...defaultPlace(w.id),
        createdAt: now,
        updatedAt: now,
      });
      made += 1;
      n += 1;
    });
    if (n > 0) await batch.commit();
  }
  return {made, kept, fixed};
}

/**
 * その画像ぶんのカードを、いま作る。
 *
 * **画像は日次ジョブより後にできることがある**（あやとが夜に貼る）。
 * そのときは貼った側で作る。日次ジョブは逆に「画像が先にあって、
 * 投げ銭が後から入った」ぶんを拾う。**両側から埋めて、どちらが
 * 先でも同じ結果になるようにする。**
 * @param {ImageRef} image 貼られた画像
 * @return {Promise<MintResult>} 作った数
 */
export async function mintForImage(image: ImageRef): Promise<MintResult> {
  if (image.role !== "card") return {made: 0, kept: 0, fixed: 0};
  /* **企画が無くてもカードは作る。** ここは長いあいだ「企画の書類が
     無ければ黙って `made: 0` で帰る」だった。企画の立っていない日に
     貼った写真のカードが、それで11日ぶん0枚になっていた。
     企画は「あれば `videoIds` と日付の落ち先に使う」だけ。 */
  const ev = await eventOf(image.streamEventId);
  const tips = await tipsForImage(image, ev);
  return mintCards(image, tips, ev);
}

/**
 * 企画を1本読む。**無ければ `null`。**
 * @param {string} id 企画のID。**空のこともある**（企画の無い日の写真）
 * @return {Promise<EventRef | null>} 企画。無ければ null
 */
async function eventOf(id: string): Promise<EventRef | null> {
  // 空の書類IDで `doc("")` を呼ぶと Firestore 側で落ちる。手前で止める
  if (!id) return null;
  const snap = await EVENTS.doc(id).get();
  return snap.exists ? eventRef(snap.id, snap.data() ?? {}) : null;
}

/**
 * 画像を別の企画へ付け替えたあと、カードを合わせ直す。
 *
 * **消してから作り直さない。** 消すと、本人が動かした置き方まで
 * 一緒に消える。**渡らなくなった人のぶんだけ消して、あとは足す。**
 * @param {ImageRef} image 付け替えたあとの画像
 * @return {Promise<MintResult>} 作った数
 */
export async function resyncCardsOfImage(
  image: ImageRef,
): Promise<MintResult> {
  const ev = await eventOf(image.streamEventId);
  /* **カードになるのは `role: "card"` だけ。** 役目を外されたら、
     当たる投げ銭は0件 ＝ 下の `keep` が空 ＝ ぜんぶ消える、で終わる。
     ここで役目を見ずに引くと、消したそばから `mintCards` が作り直して
     **本人が動かした置き方だけが既定値に戻る。** */
  const tips = image.role === "card" ? await tipsForImage(image, ev) : [];
  const keep = new Set(
    tips.map((t) => cardId(image.id, whoKey(t.channelId))),
  );
  const had = await CARDS.where("streamEventImageId", "==", image.id)
    .limit(1000)
    .get();
  const gone = had.docs.filter((d) => !keep.has(d.id));
  if (gone.length) {
    const batch = db.batch();
    gone.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    logger.info("dropped stale cards", image.id, gone.length);
  }
  return mintCards(image, tips, ev);
}

/* ---------------- 置き方の既定値 ----------------
   **旧 `cards.ts` から移した。値も式も変えていない。**
   変えると、まだ誰も動かしていないカードが一斉に別の場所へ動く。 */

/** 置き方。x/y は画像に対する割合で、y は**足元**の高さ。 */
export type Place = {x: number; y: number; rot: number; scale: number};

/**
 * id から 0〜1 の数を4つ出す。**同じ id なら毎回同じ数。**
 * @param {string} id カードのID
 * @return {number[]} 0〜1 の数を4つ
 */
function spread(id: string): number[] {
  const out: number[] = [];
  for (let k = 0; k < 4; k++) {
    // FNV-1a。暗号の用ではないので、短くて散ればよい
    let h = 0x811c9dc5 ^ (k * 0x9e3779b9);
    for (let i = 0; i < id.length; i++) {
      h ^= id.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    out.push(((h >>> 0) % 100000) / 100000);
  }
  return out;
}

/**
 * 何も動かしていないカードの置き方。
 *
 * **芯は見本の右下**（`docs/nordic-photos.md` 5章）。そこから id で
 * 少しだけ散らす。同じ画像に何人も乗るので、全員が寸分たがわず同じ
 * 場所に立つと、並べたときに「同じ絵が人数ぶん」に見える。
 * @param {string} id カードのID
 * @return {Place} 置き方
 */
export function defaultPlace(id: string): Place {
  const [a, b, c, d] = spread(id);
  return {
    // 右下から左へ少しだけ。真ん中までは寄せない(見本が右下なので)
    x: Math.round((0.62 + a * 0.26) * 1000) / 1000,
    // 足元の高さ。見本の「下端から5%」を挟む帯に収める
    y: Math.round((0.88 + b * 0.08) * 1000) / 1000,
    // 傾きは見本が0度。紙に貼ったように、気づく手前まで
    rot: Math.round((-4 + c * 8) * 10) / 10,
    scale: Math.round((0.92 + d * 0.16) * 1000) / 1000,
  };
}

/**
 * 送られてきた置き方を、置いてよい形にする。
 *
 * **画像の外へ出さない。** 出せると、カードを開いた人には何も見えない
 * ものが1枚できる。傾きと大きさも同じ理由で締める。
 * @param {Json} b 送られてきた中身
 * @param {Place} now いまの置き方。欠けている欄はここから埋める
 * @return {Place} 置く値
 */
export function shapePlace(b: Json, now: Place): Place {
  const num = (v: unknown, fall: number): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fall;
  };
  const clamp = (n: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, n));
  return {
    x: Math.round(clamp(num(b.x, now.x), 0, 1) * 1000) / 1000,
    y: Math.round(clamp(num(b.y, now.y), 0, 1) * 1000) / 1000,
    rot: Math.round(clamp(num(b.rot, now.rot), -180, 180) * 10) / 10,
    scale: Math.round(clamp(num(b.scale, now.scale), 0.2, 3) * 1000) / 1000,
  };
}

/**
 * その日に投げてくれた人（画面に出す用）。**金額は出さない。**
 *
 * 台帳には金額が入っているが、**島の画面では金額で並べない・出さない**
 * （#202 の決め。`docs/nordic-fund.md` からの継続）。ここが台帳と
 * 画面のあいだの唯一の口なので、そもそも金額を持ち出さない形にする。
 * **「その日いた人」ではない。「その日投げてくれた人」だけ。**
 * 前はここに「その日いた人のチャンネルID」と書いてあり、中身は台帳しか
 * 見ていなかった。**その食い違いを「説明が正、中身がバグ」と読んで、
 * コメントのほうへ寄せて広げたのが 2026-09-14 の障害**
 * （`docs/island-incident-2026-09-14-cards.md`）。正しいのは中身のほうで、
 * カードは投げ銭の特典（`docs/island-cards.md` 1章）。広げない。
 *
 * **返すのはチャンネルIDだけではない。** 絵は `channelId` が先だが、
 * 名簿がそれを持っていない人は「投げてくれたときに名乗っていた名前」に
 * 落ちる（`cards.ts` の `pickIcon`）ので、その写しも一緒に返す。
 * 名前を出してよいかの判定も、いまもこの写しだけで決まる。
 * `islandTips` の中にしか無い値なので、チャンネルIDから引き直さない。
 *
 * **当たり方はカード（`tipsForImage`）と同じものを使う。** ここだけ生の
 * `day` で引いていたので、0時をまたいだ晩に**写真の名札とカードが
 * 食い違っていた**（本番の 9/17 がそれで、カード136枚に対して名札は
 * 別の人数）。同じ日を同じ規則で出す。
 * @param {EventRef[]} events 企画ぜんぶ
 * @param {string} day その日（YYYY-MM-DD）
 * @return {Promise<Tipper[]>} その日**投げてくれた**人。**外へは出ない**
 */
export async function channelsOfDay(
  events: EventRef[],
  day: string,
): Promise<Tipper[]> {
  if (!isDay(day)) return [];
  /* その日の企画が `videoIds` で拾っている配信ぶんも入れる。
     0時をまたいで割れた後半は、日付だけでは当たらない。 */
  const vids = new Set<string>();
  for (const e of events) {
    if (e.date === day) e.videoIds.forEach((v) => vids.add(v));
  }
  /* **「その日」と「その翌日」の2本。** 理由は `tipsForImage` と同じで、
     台帳から引けるのは生の `day` だけ、`tipDay` の補正は手元でしか
     かけられない。補正は前の日へ戻す方向にしか効かないので、
     `D` の配信に当たる投げ銭の生の `day` は `D` か `D+1` しかない。 */
  const jobs = [
    TIPS.where("day", "==", day).get(),
    TIPS.where("day", "==", dayAfter(day)).get(),
  ];
  const list = [...vids];
  for (let i = 0; i < list.length; i += IN_CHUNK) {
    jobs.push(TIPS.where("videoId", "in", list.slice(i, i + IN_CHUNK)).get());
  }
  const snaps = await Promise.all(jobs);
  /* **同じ人は1回だけ。** 1日に何度も投げてくれた人が人数ぶん並ばない
     ように、チャンネルIDで畳む。

     残す名乗りは**いちばん早い1回のもの**。`mintCards` が「同じ人が同じ日に
     何度投げてもカードは1枚。いちばん早い1回を採る」としているので、
     そろえないと**同じ人のカードと写真の名札で別の絵が出る**（同じ日に
     名乗りを変えた人）。問い合わせの返る順に頼らない。 */
  const out = new Map<string, Tipper & {at: number}>();
  for (const s of snaps) {
    s.forEach((d) => {
      const t = tipRef(d.id, d.data() ?? {});
      const c = t.channelId;
      if (!c) return;
      /* **ここは「その日投げてくれた人」のまま。1人も広げない**
         （2026-09-14 の障害。`docs/island-incident-2026-09-14-cards.md`）。
         見ているのは台帳（`islandTips`）だけで、コメントした人も、
         来ていただけの人も、ここには1人も入らない。増えも減りもするのは
         **同じ投げ銭がどちらの日に数えられるか**だけで、
         投げていない人が入る道はこの関数のどこにも無い。

         絞り方は `tipsForImage` と同じ2つ:
         `tipDay` がその日か、企画が名乗っている配信か。 */
      const hit = tipDay(t) === day || (!!t.videoId && vids.has(t.videoId));
      if (!hit) return;
      const at = t.donatedAt;
      const had = out.get(c);
      if (had && had.at <= at) return;
      out.set(c, {
        channelId: c,
        nameSnapshot: t.nameSnapshot ?? "",
        at,
      });
    });
  }
  return [...out.values()].map(({channelId, nameSnapshot}) =>
    ({channelId, nameSnapshot}));
}

/**
 * 画像を1枚消したときに、その画像のカードも消す。
 *
 * **カードは平置きなので、画像を消しても勝手には消えない。**
 * 残すと、`/cards` が実体の無い URL を返し続ける。
 * @param {string} imageId 消した画像のID
 * @return {Promise<number>} 消したカードの枚数
 */
export async function dropCardsOfImage(imageId: string): Promise<number> {
  const snap = await CARDS.where("streamEventImageId", "==", imageId)
    .limit(1000)
    .get();
  if (snap.empty) return 0;
  let n = 0;
  let batch = db.batch();
  for (const d of snap.docs) {
    batch.delete(d.ref);
    n += 1;
    if (n % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (n % 400 !== 0) await batch.commit();
  logger.info("dropped cards of image", imageId, n);
  return n;
}
