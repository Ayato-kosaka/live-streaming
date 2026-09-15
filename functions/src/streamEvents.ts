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

/** 台帳の1行のうち、カードを組むために要るところだけ。 */
export type TipRef = {
  id: string;
  channelId: string | null;
  /** 日本時間で切った配信日（YYYY-MM-DD） */
  day: string;
  videoId: string | null;
  /** もらった時刻（ミリ秒） */
  donatedAt: number;
};

/** 画像のうち、カードを組むために要るところだけ。 */
export type ImageRef = {
  id: string;
  streamEventId: string;
  role: ImageRole;
  url: string;
  w: number;
  h: number;
  note: string;
  at: number;
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
 * その投げ銭が、どの企画のものか。**当たったものを全部返す。**
 *
 * 当たり方は2つあって、**両方を足す**（片方で打ち切らない）。
 *
 * 1. **その企画が `videoIds` でこの配信を名乗っている。** 0時をまたいで
 *    2本に割れた配信の後半を、人が手で拾うための道
 * 2. **企画の日付と、投げ銭の日（日本時間）が同じ。**
 *
 * **1で当たったら2を見ない、にしない。** 9月11日の配信には企画が3本
 * 乗っていて、あやとが `videoIds` を足すのはたいてい1本だけ。そこで
 * 打ち切ると、残り2本のカードが黙って消える（あやと・2026-09-07）。
 * @param {EventRef[]} events 企画ぜんぶ
 * @param {TipRef} tip 投げ銭1件
 * @return {EventRef[]} 当たった企画。**0本のこともある**
 */
export function eventsForTip(events: EventRef[], tip: TipRef): EventRef[] {
  const out: EventRef[] = [];
  for (const e of events) {
    const byVideo = !!tip.videoId && e.videoIds.includes(tip.videoId);
    const byDate = !!e.date && e.date === tip.day;
    if (byVideo || byDate) out.push(e);
  }
  return out;
}

/**
 * その企画の投げ銭を引く。**画像を貼った直後に、その場でカードを作るため。**
 *
 * 日次ジョブを待たない道が要る。名簿（旧 `nordicDays`）は翌朝に入るので
 * 「貼ったらその日のぶんが配られる」が成り立たなかったが、**台帳は
 * 投げ銭のたびに入る**ので、貼った時点でもう相手がいる。
 *
 * 引き方は**単一フィールドの等価と `in` だけ**（索引が要らない範囲）。
 * @param {EventRef} ev 企画
 * @return {Promise<TipRef[]>} その企画に当たる投げ銭
 */
export async function tipsForEvent(ev: EventRef): Promise<TipRef[]> {
  const jobs: Promise<FirebaseFirestore.QuerySnapshot>[] = [];
  if (ev.date) jobs.push(TIPS.where("day", "==", ev.date).get());
  for (let i = 0; i < ev.videoIds.length; i += IN_CHUNK) {
    const part = ev.videoIds.slice(i, i + IN_CHUNK);
    jobs.push(TIPS.where("videoId", "in", part).get());
  }
  if (jobs.length === 0) return [];
  const snaps = await Promise.all(jobs);
  const seen = new Set<string>();
  const out: TipRef[] = [];
  for (const s of snaps) {
    s.forEach((d) => {
      if (seen.has(d.id)) return;
      seen.add(d.id);
      out.push(tipRef(d.id, d.data() ?? {}));
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
  return {
    id,
    channelId: clean(v.channelId, 64) || null,
    day: isDay(v.day) ? v.day : ms ? jstDay(ms) : "",
    videoId: clean(v.videoId, 16) || null,
    donatedAt: ms,
  };
}

/**
 * 画像を読む形にする。
 * @param {string} id 書類ID
 * @param {Json} v 中身
 * @return {ImageRef} カードを組むために要るところ
 */
export function imageRef(id: string, v: Json): ImageRef {
  const role = clean(v.role, 12);
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
  };
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
 * @param {ImageRef[]} images カードになる画像
 * @param {TipRef[]} tips その企画に当たる投げ銭
 * @param {string} eventDay その企画の日付。カードの `day` はここから決める
 * @return {Promise<MintResult>} 作った数、すでにあった数、素性を足した数
 */
export async function mintCards(
  images: ImageRef[],
  tips: TipRef[],
  eventDay: string,
): Promise<MintResult> {
  /** 同じ人が同じ日に何度も投げても、カードは1枚。いちばん早い1回を採る。 */
  const first = new Map<string, TipRef>();
  for (const t of tips) {
    const who = whoKey(t.channelId);
    if (!who) continue;
    const had = first.get(who);
    if (!had || t.donatedAt < had.donatedAt) first.set(who, t);
  }
  const want: {id: string; image: ImageRef; tip: TipRef; who: string}[] = [];
  for (const im of images) {
    for (const [who, tip] of first) {
      want.push({id: cardId(im.id, who), image: im, tip, who});
    }
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
        streamEventId: w.image.streamEventId,
        streamEventImageId: w.image.id,
        /* 日付も持つ。画面が企画の札を引くのに使う。画像から辿れば
           出せるが、`/cards` は毎回100枚単位で返すので、そのたびに
           企画まで往復すると読みが3倍になる。

           **投げ銭の日ではなく、企画の日を入れる。** 台帳の `day` は
           投げてくれた瞬間の日本時間で、0時をまたいだ配信では後半の人が
           翌日になる。それをそのまま入れると、**同じ1枚の写真から
           出たカードが2つの日付に割れる**（本番で実際に割れていた。
           food-wine-fest の3枚が 09-06 と 09-07）。画面は `day` で
           企画名を引くので、割れたほうは企画名が出ず、日付も1日ずれる。
           カードは企画に属するものなので、企画の日付を持たせる。
           日付の無い企画（提案）だけ、投げ銭の日に落ちる。 */
        day: eventDay || w.tip.day,
        earnedAt: w.tip.donatedAt || w.image.at || now,
      };
      if (had[k].exists) {
        if (had[k].get("streamEventImageId")) {
          /* 素性はそろっているが、**日付が企画とずれている**書類。
             0時をまたいだぶんが投げ銭の日で焼かれている。ここで直す。
             置き方には触らないので、動かしたカードは動かない。 */
          if (who.day && had[k].get("day") !== who.day) {
            batch.set(CARDS.doc(w.id), {day: who.day, updatedAt: now},
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
  const snap = await EVENTS.doc(image.streamEventId).get();
  if (!snap.exists) return {made: 0, kept: 0, fixed: 0};
  const ev = eventRef(snap.id, snap.data() ?? {});
  const tips = await tipsForEvent(ev);
  return mintCards([image], tips, ev.date);
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
  const snap = await EVENTS.doc(image.streamEventId).get();
  const ev = snap.exists ?
    eventRef(snap.id, snap.data() ?? {}) :
    null;
  const tips = ev ? await tipsForEvent(ev) : [];
  const keep = new Set(
    image.role === "card" ?
      tips.map((t) => cardId(image.id, whoKey(t.channelId))) :
      [],
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
  return mintCards([image], tips, ev?.date ?? "");
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
 * @param {EventRef[]} events 企画ぜんぶ
 * @param {string} day その日（YYYY-MM-DD）
 * @return {Promise<string[]>} その日いた人のチャンネルID
 */
export async function channelsOfDay(
  events: EventRef[],
  day: string,
): Promise<string[]> {
  if (!isDay(day)) return [];
  /* その日の企画が `videoIds` で拾っている配信ぶんも入れる。
     0時をまたいで割れた後半は、日付だけでは当たらない。 */
  const vids = new Set<string>();
  for (const e of events) {
    if (e.date === day) e.videoIds.forEach((v) => vids.add(v));
  }
  const jobs = [TIPS.where("day", "==", day).get()];
  const list = [...vids];
  for (let i = 0; i < list.length; i += IN_CHUNK) {
    jobs.push(TIPS.where("videoId", "in", list.slice(i, i + IN_CHUNK)).get());
  }
  const snaps = await Promise.all(jobs);
  const out = new Set<string>();
  for (const s of snaps) {
    s.forEach((d) => {
      const c = clean(d.get("channelId"), 64);
      if (c) out.add(c);
    });
  }
  return [...out];
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
