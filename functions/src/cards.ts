/**
 * あやと島カード(#173)。組み立ての元を企画へ移した(#202)。
 *
 * その日に投げ銭してくれた人が、その日の写真を1枚もらう。
 * 焼き込もうがしまいが、もらった扱いになる(あやとの言葉)。
 *
 * ## いままでとの違い — カードは「置いてある」
 *
 * 前は**引くたびに組み立てていた**。写真(`nordicPhotos`)とその日の名簿
 * (`nordicDays`)を掛け合わせて、その場で作っていた。名簿が翌朝に入る
 * ので「貼った瞬間に配る」が成り立たなかったから。
 *
 * 台帳(`islandTips`)に変えて、そこが変わった。**投げ銭は投げられた
 * その日に台帳へ入る。** だから貼った時点でもう相手がいる。
 *
 *   カード = その企画の画像(`role: "card"`) × その企画に当たる投げ銭
 *
 * 作るのは2か所から。**どちらが先でも同じ結果になる。**
 *
 * | いつ | 誰が |
 * | --- | --- |
 * | 画像を貼ったとき | `mintForImage`(`streamEvents.ts`) |
 * | 毎日 | `python/island_cards.py` |
 *
 * ## 平置きにしてある(#202)
 *
 * `islandChannels/{channelId}/cards/{cardId}` にはできない。
 * `/cards`(島じゅうのカードを新しい順)がコレクショングループ索引を
 * 要るようになるが、**うちは索引を作れない**(#168)。だから
 * `islandCards/{cardId}` に `channelId` を欄で持つ。
 *
 * - 島じゅうのカード → `orderBy("earnedAt","desc")`（単一フィールド）
 * - その人のカード → `where("channelId","==",…)`（同じく単一フィールド）
 *
 * ## 返す形は変えていない
 *
 * `photoId` は画像のID、`day` は日本時間で切った配信日、`at` は
 * 画像が貼られた時刻。**画面が読んでいる欄の名前も意味もそのまま。**
 * 移行で `nordicPhotos/{id}` を `islandStreamEventImage/{id}` へ
 * 同じ書類IDで移すので、カードのIDも変わらない。
 */

import {logger} from "firebase-functions";
import * as admin from "firebase-admin";
import {keysOf} from "./islandCharacter";
import {
  CARDS,
  IMAGES,
  MAX_IMAGES,
  clean,
  defaultPlace,
  imageRef,
  shapePlace,
  type ImageRef,
  type Place,
} from "./streamEvents";

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

/** 持ち主を突き合わせる先。`islandUsers/{uid}.channelId`。 */
const USERS = db.collection("islandUsers");

/** 一度に返す枚数。新しいほうから。 */
const MAX_CARDS = 600;

/** キャラクターの名簿(#284)。**絵とチャンネル名の対応はここにしか無い。** */
const CHARACTERS = db.collection("islandCharacter");

/** チャンネルIDから、いま名乗っている名前を引く先。毎晩入れ直る。 */
const CHANNELS = db.collection("islandChannels");

/** 名簿を一度に読む人数。`/characters` の口と同じ上限。いま98人。 */
const MAX_CHARACTERS = 500;

/**
 * 名前のかぶりを見るために、辞書を一度に読む件数。本番でいま 2,272人。
 *
 * `select("name")` で名前の欄しか降ろさないので、件数のわりに軽い。
 * **ここで切れたら絵は1枚も当てない**(`sharedNames`)ので、4倍の余裕を取る。
 */
const MAX_CHANNELS = 10000;

/** 名前の長さ。`islandCharacter.ts` の MAX_NAME と同じ。 */
const MAX_NAME = 80;

type Json = Record<string, unknown>;

/** ログインしている人。`islandApi.ts` の `whoIs` が返すもの。 */
type Who = {uid: string; name: string; channelId?: string} | null;

/** 島に名前を出してよいと言った人。`islandApi.ts` の `listResidents`。 */
type Resident = Json;

/** 呼ぶ側から借りるもの。判定を2か所に増やさないため、関数で受け取る。 */
export type CardDeps = {
  /** 合言葉から「誰か」を出す */
  whoIs: (header?: string) => Promise<Who>;
  /** あやとなら uid、違えば null */
  ownerUid: (header?: string) => Promise<string | null>;
  /** 名前を出してよいと言った人だけの一覧 */
  listResidents: () => Promise<Resident[]>;
};

/** カードの口が受け取るもの。Express の req から要るものだけ。 */
export type CardsReq = {
  method: string;
  path: string;
  auth?: string;
  body: Json;
};

/** 返す側。Express の res のうち、ここで使うものだけ。 */
export type CardsRes = {
  set(k: string, v: string): unknown;
  status(n: number): CardsRes;
  json(b: unknown): unknown;
};

/**
 * 画面に出す1枚。**これは中の形で、そのまま外へは出さない。**
 *
 * `id` と `channelId` は人を指す。外へ出せるのは `/cards/mine`（本人が
 * 自分のものを見るだけ）まで。誰でも読める `/cards` には `forEveryone` を
 * 通してから返す。
 */
type Card = {
  id: string;
  day: string;
  /** 画像のID。旧 `nordicPhotos` の書類IDと同じものが入る */
  photoId: string;
  url: string;
  w: number;
  h: number;
  note: string;
  /** もらった人の YouTube チャンネル */
  channelId: string | null;
  /** キャラクターの書類ID。画面はこれで絵を引く(`lib/charImg.ts`) */
  icon: string | null;
  /** 島に名前を出してよいと言った人だけ */
  name: string | null;
  /** 画像の中のどこに立つか。0〜1 の割合。`y` は足元の高さ */
  x: number;
  y: number;
  rot: number;
  scale: number;
  /** 本人が動かしたか。既定のままなら false */
  moved: boolean;
  /** 画像が貼られた時刻。並べ替えに使う */
  at: number;
  /** どの企画のものか(#202 で足した。画面はまだ使わなくてよい) */
  streamEventId: string | null;
};

/* ---------------- 誰のカードかを、絵に結び付ける ----------------

   **チャンネルID → いま名乗っている名前 → キャラクターの `channelKeys`。**

   #202 / #204 の作り替えで絵を引くところごと消えたまま、新しい名簿
   (`islandCharacter`・#284)につなぎ直していなかった。画面は焼き込みの
   22人(`site/content/residents.ts`)から引き直して埋めていたので、
   **表に入っていない人のカードだけが黙って消えていた**（9月11日の4人中1人）。

   ## なぜ名前を経由するか。`channelId` で直に引かないか

   `islandCharacter` には `channelId` という欄が形だけ在るが、**それを書いて
   いるところがどこにも無い。** 本番で数えて 98人中1人だった
   (`python/admin/cards_icon_probe.py`)。**空の欄に向けて引いても0枚。**

   名前で引くと本番のカード8枚が8枚とも当たる。しかも**配信中のアラートと
   同じ引き方**(`islandCharacter.ts` の `findBy("channelKeys", …)`)なので、
   引き方が2つに散らない。

   ## `lookupKeys`(呼び名)は使わない

   呼び名は98人ぜんぶに付いていて当たりはするが、**人が付けたもので重なりえる。**
   当たりすぎるほうが危ない——別人の絵がカードに乗る。スパチャがチャンネル名
   しか見ないのと同じ理由(`islandCharacter.ts` 冒頭)。当たらなければ `null` のまま。

   ## 同じ名前を2人が名乗っていたら、どちらにも当てない

   あやとの決めごと(`docs/island-db.md` 2章・`python/island_channel_photos.py`・
   `docs/island-cards.md` 3章に同じ文がある):

   > キャラクターの割り当てはあやとが決めたもので、**YouTube を更新しても
   > 変わらないのが正しい。本人にキャラクターを選ばせる口は無い**
   > (他人の絵を自分のものにできてしまう)

   ところが上の引き方は `islandChannels.name`——**いま名乗っている名前**を
   通る。表示名は誰でも同じにできるので、他人と同じ名前を名乗れば
   **その人の絵が自分のカードに乗る。「選ばせる口は無い」と決めた、その口。**

   どねID の紐付け(`donors.ts` の `findChannel`)は、まったく同じ危険を
   「どちらか分からないまま保存すると**別の人にカードが行く**」として
   止めている。**守りを片側だけにしない。** ここも同じ理由で止める。

   止め方は `characterKeys` の裏返しで、**辞書ぜんぶを見て、2つ以上の
   チャンネルが名乗っている名前を落とす**(`sharedNames`)。渡された数人の
   中だけを見ても効かない——なりすます側は自分のカードを1枚開けばよく、
   相手が同じ並びに入っている保証がない。

   **本当は、あやとの表(`islandCharacter.channelId`)で引くのが正しい。**
   いまその欄を書いているところがどこにも無い(98人中1人)ので名前を通って
   いるだけで、埋まったらここは名前を見なくなる。

   ## カードが何枚でも、往復は増えない

   本番の `/island-api/cards` は Hosting に `no-cache` へ書き換えられていて
   （Functions は `s-maxage=60` を付けているが、届くのは `no-cache`）、
   **開かれるたびに handler が丸ごと走る。** 枚数ぶん問い合わせる形にはできない。
   名前は重複を落として `getAll` で1往復。名簿と辞書は**どちらも5分の控え**に
   載るので、温まっていればその1往復だけ。冷えている回だけ2本足される。 */

/** 引く鍵(`normKey` したチャンネル名) → キャラクターの書類ID。 */
type Keys = Map<string, string>;

/** 温かいインスタンスに持つ名簿。**名前は持たない**（下の理由）。 */
let cached: {at: number; keys: Keys} | null = null;

/**
 * 名簿を覚えておく長さ。
 *
 * **持つのは「鍵 → 絵」だけで、チャンネル名は毎回引き直す。**
 * `channelKeys` が変わるのはあやとが画面からキャラクターを直したときだけで、
 * 年に数回。`islandChannels.name` のほうは毎晩入れ直る(`island_channels.py`)
 * ので、そちらを抱えると「名前を変えた人の絵が出なくなる」が何時間も続く。
 *
 * 5分にしたのは、直した本人が画面を開き直したときに**待たされていると
 * 気づかない**長さだから。口が CDN に乗らない以上、98件の読み込みを
 * 毎回払う理由もない。
 */
const KEYS_TTL = 5 * 60 * 1000;

/**
 * 名簿から「鍵 → 絵」を作る。**2人に当たる鍵は捨てる。**
 * @return {Promise<Keys>} 引く鍵から書類IDへの対応
 */
async function characterKeys(): Promise<Keys> {
  const now = Date.now();
  if (cached && now - cached.at < KEYS_TTL) return cached.keys;
  const snap = await CHARACTERS.limit(MAX_CHARACTERS).get();
  const keys: Keys = new Map();
  /* **同じ鍵が2人に付いていたら、どちらも使わない。** 当てずっぽうに1人
     選ぶと、別人の絵が配信の画面とカードに乗る
     (`islandCharacter.ts` の `findBy` が `limit(2)` を取るのと同じ決め方)。 */
  const twice = new Set<string>();
  snap.forEach((d) => {
    const v = d.data() ?? {};
    const list = Array.isArray(v.channelKeys) ? v.channelKeys : [];
    for (const k of list) {
      if (typeof k !== "string" || !k) continue;
      const had = keys.get(k);
      if (had && had !== d.id) twice.add(k);
      else keys.set(k, d.id);
    }
  });
  twice.forEach((k) => keys.delete(k));
  cached = {at: now, keys};
  return keys;
}

/**
 * 辞書の名前を覚えておく長さ。`characterKeys` と同じ5分。
 *
 * **持つのは「2人が名乗っている名前」の集合だけで、名前そのものは持たない。**
 * `islandChannels.name` は毎晩まとめて入れ直る(`python/island_channels.py`)
 * ので、抱えても遅れるのは晩に一度きり。それでも5分にしてあるのは、
 * かぶりが解けた(片方が名前を戻した)ときに絵が戻るまでを短くするため。
 */
const SHARED_TTL = 5 * 60 * 1000;

/** 温かいインスタンスに持つ、かぶっている名前。`null` は読み切れなかった。 */
let cachedShared: {at: number; keys: Set<string> | null} | null = null;

/**
 * **2つ以上のチャンネルが名乗っている名前**を集める。当てない側に倒すため。
 * @return {Promise<Set<string> | null>} かぶった鍵。読み切れなければ null
 */
async function sharedNames(): Promise<Set<string> | null> {
  const now = Date.now();
  if (cachedShared && now - cachedShared.at < SHARED_TTL) {
    return cachedShared.keys;
  }
  const snap = await CHANNELS.select("name").limit(MAX_CHANNELS).get();
  /* **上限で切れたら、かぶりを見落とす。** 見落としたまま当てるのは
     「読み切れなかった」を「かぶっていない」と読み替えることなので、
     そのときは1枚も当てない(`docs/island-standards.md` 10)。
     ここが出たら上限を上げるか、あやとの表の `channelId` で引く。 */
  if (snap.size >= MAX_CHANNELS) {
    logger.warn("island channels truncated", snap.size);
    cachedShared = {at: now, keys: null};
    return null;
  }
  const owner = new Map<string, string>();
  const shared = new Set<string>();
  snap.forEach((d) => {
    /* 引く側(`channelNames`)と**同じ形にそろえてから**数える。80字で切るのも、
       `@` 付きと無しの両方を作るのも、あちらと同じでないと畳み残す。 */
    const name = clean(d.data()?.name, MAX_NAME);
    if (!name) return;
    for (const k of keysOf([name])) {
      const had = owner.get(k);
      if (had && had !== d.id) shared.add(k);
      else owner.set(k, d.id);
    }
  });
  cachedShared = {at: now, keys: shared};
  return shared;
}

/**
 * チャンネルIDから、いま名乗っている名前を引く。**1往復。**
 * @param {string[]} ids 重複を落としたチャンネルID
 * @return {Promise<Map<string, string>>} チャンネルID → 名前
 */
async function channelNames(ids: string[]): Promise<Map<string, string>> {
  const docs = await db.getAll(...ids.map((id) => CHANNELS.doc(id)));
  const out = new Map<string, string>();
  docs.forEach((d) => {
    if (!d.exists) return;
    const name = clean(d.data()?.name, MAX_NAME);
    if (name) out.set(d.id, name);
  });
  return out;
}

/**
 * チャンネルIDから、キャラクターの書類IDを引く。
 *
 * **同じ名前を2人以上が名乗っていたら、どちらにも当てない**(上の長い注)。
 * 表示名は誰でも同じにできるので、当てると「本人にキャラクターを選ばせる口」
 * になる。あやとの決めごとは「選ばせる口は無い」。`donors.ts` が
 * どねID の紐付けで止めているのと、同じ危険・同じ止め方。
 *
 * **落ちても投げない。** 絵が引けないことでカードそのものが返らなくなるのは、
 * 直そうとしているものより悪い(#34 と同じ形)。**ただし「読めなかったから
 * 当てる」には倒さない。** 読めなければ、当てない。
 *
 * **「1人も当たらなかった」と「読めなかった」を、同じ顔で返さない。**
 * 読めなかったときは `null`。前は空の表を返していて、呼んだ側からは
 * 見分けがつかなかった。公開の `/cards` が `channelId` を返していたあいだは
 * 画面が焼き込み(`site/content/residents.ts`)から引き直せたので、読めない回でも
 * 候補は出ていた。**その拾い直しを取り上げたので、ここで区別する。**
 * 区別せずに空を返すと、読めなかった回の画面が「その日は誰も投げ銭して
 * いない」と言い切る(`docs/island-standards.md` 10)。
 * @param {string[]} channelIds カードの持ち主
 * @return {Promise<Map<string, string> | null>} チャンネルID → キャラクターの
 *   書類ID。読めなかったときは `null`
 */
export async function iconsOf(
  channelIds: string[],
): Promise<Map<string, string> | null> {
  const ids = [...new Set(channelIds.filter((x) => x))].slice(0, MAX_CARDS);
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  try {
    const [keys, shared, names] = await Promise.all([
      characterKeys(),
      sharedNames(),
      channelNames(ids),
    ]);
    // 辞書を読み切れていない。かぶりが分からないので1枚も当てない。
    // **これも「読めなかった」側。** 当てないまま返すと 0人 と区別できない
    if (!shared) return null;
    for (const id of ids) {
      const name = names.get(id);
      if (!name) continue;
      /* `keysOf` が保存のときに「@ なし」も入れてあるので、引く側は
         そろえるだけでよい。両方見るのは、名簿の側が `@` を持っていて
         チャンネルの名前が持っていない(またはその逆)ときのため。
         **畳む鍵の作り方を `sharedNames` と1つにするため、同じ関数で作る。** */
      const mine = keysOf([name]);
      /* **どれか1つでもかぶっていたら当てない。** 当たった鍵だけを見ると、
         `@さくら` と `さくら` のように名簿の側で同じ鍵に畳まれる組を
         見落とす。 */
      if (mine.some((k) => shared.has(k))) continue;
      const icon = mine.map((k) => keys.get(k)).find((v) => v);
      if (icon) out.set(id, icon);
    }
  } catch (e) {
    logger.warn("card icons failed", String(e));
    return null;
  }
  return out;
}

/** 絵を引けなかった。**0人と同じ顔で返さないため**、ここで止める。 */
export class IconsUnavailable extends Error {}

/**
 * 置き場に入っている置き方を読む。
 * @param {Json} v 書類の中身
 * @param {string} id カードのID
 * @return {Place} 置き方
 */
const placeOf = (v: Json, id: string): Place => shapePlace(v, defaultPlace(id));

/**
 * 配られたカードを、新しい順に返す。
 *
 * **`where` と `orderBy` を混ぜない。** 混ぜると複合索引が要る(#168)。
 * だから引くのはどちらか片方だけで、並べ替えは最後の `sortCards` が手元でやる。
 * 画像は `getAll` で1往復。カードの枚数ぶん引きにいかない。
 * @param {CardDeps} deps 呼ぶ側から借りるもの
 * @param {string} [channelId] 渡すと、そのチャンネルのぶんだけ引く
 * @return {Promise<Card[]>} 新しい順のカード
 */
async function listCards(deps: CardDeps, channelId?: string): Promise<Card[]> {
  /* **`earnedAt` で並べる。** 単一フィールドの並べ替えなので索引は要らない。
     欄の無い書類はここに載らないが、素性の欠けたカードは日次ジョブと
     `mintCards` が足していく(`streamEvents.ts`)。

     その人のぶんだけ引くときは `where` 1本にする。**`orderBy` を足さない**
     （複合索引が要る）。並び順は下の `sortCards` が同じ規則で付け直すので、
     返るものの順番は公開の口と変わらない。 */
  const snap = channelId ?
    await CARDS.where("channelId", "==", channelId).limit(MAX_CARDS).get() :
    await CARDS.orderBy("earnedAt", "desc").limit(MAX_CARDS).get();
  if (snap.empty) return [];

  const rows = snap.docs.map((d) => ({id: d.id, v: d.data() ?? {}}));
  const imageIds = [
    ...new Set(
      rows
        .map((r) => clean(r.v.streamEventImageId, 64))
        .filter((x): x is string => !!x),
    ),
  ].slice(0, MAX_IMAGES);

  /* **絵の引き当ては、画像と名簿と一緒に投げる。** 順に待つと、
     カードが何枚でも往復は2本しか増えないのに、返るのが1本ぶん遅くなる。 */
  const [images, residents, icons] = await Promise.all([
    imageIds.length ?
      db.getAll(...imageIds.map((id) => IMAGES.doc(id))) :
      Promise.resolve([]),
    deps.listResidents(),
    iconsOf(rows.map((r) => clean(r.v.channelId, 64))),
  ]);
  /* **読めなかったら、そこで止める。** 絵の無いカードを並べて返すと、
     公開の面では候補が1人も出ない——それは「誰も投げ銭していない」と
     同じ絵になる。呼んだ側(`handleCards`)が 502 を返し、画面は
     「読めなかった。もう一度よみこむ」を出す。 */
  if (!icons) throw new IconsUnavailable("card icons unavailable");

  const imageOf = new Map<string, ImageRef>();
  images.forEach((d) => {
    if (d.exists) imageOf.set(d.id, imageRef(d.id, d.data() ?? {}));
  });

  /* **名前は、出してよいと言った人のぶんだけ。**
     BigQuery から来る author_name は、本人が島に名前を出すと決めたか
     どうかと関係なく取れてしまう(`listPhotoDays` と同じ判断)。 */
  const named = new Map<string, string>();
  residents.forEach((r) => {
    const id = r.channelId as string;
    if (id && r.name) named.set(id, r.name as string);
  });

  const out: Card[] = [];
  for (const r of rows) {
    const imageId = clean(r.v.streamEventImageId, 64);
    const im = imageOf.get(imageId);
    // 画像が消えたカードは出さない。実体の無い URL を返し続けない
    if (!im || !im.url) continue;
    const channelId = clean(r.v.channelId, 64) || null;
    out.push({
      id: r.id,
      day: clean(r.v.day, 10),
      photoId: im.id,
      url: im.url,
      w: im.w,
      h: im.h,
      note: im.note,
      channelId,
      /* **絵は、名前を出してよいと言っていない人にも出す。** 島の絵は
         `/friends` で98人ぶんもう公開されている。出さないのは名前だけ
         (すぐ下)。この線は動かさない。 */
      icon: (channelId && icons.get(channelId)) || null,
      name: (channelId && named.get(channelId)) || null,
      ...placeOf(r.v, r.id),
      moved: !!r.v.movedAt,
      at: im.at,
      streamEventId: im.streamEventId || null,
    });
  }
  return sortCards(out);
}

/**
 * 新しい順に並べる。同じ画像の中は id で固定して、開くたびに入れ替わらせない。
 * @param {Card[]} list 組み立てたカード
 * @return {Card[]} 並べ替えたもの
 */
function sortCards(list: Card[]): Card[] {
  return list.sort((a, b) => {
    if (a.day !== b.day) return a.day < b.day ? 1 : -1;
    if (a.at !== b.at) return b.at - a.at;
    return a.id < b.id ? -1 : 1;
  });
}

/* ---------------- 誰でも読める応答から、人を指す値を落とす ----------------

   カードは投げ銭の台帳(`islandTips`)からしか作られない。だから1枚ごとに
   `channelId` と `day` を返すのは、**「どのチャンネルが、どの日に投げ銭
   したか」の一覧を、鍵なしで配っている**のと同じことだった。
   `channelId` は `youtube.com/channel/UC…` を開けば本人の顔と名前に直結する。

   **「金額を出していないから投げ銭の情報は出していない」とは言わない。**
   これは内部の欄の話を、受け取る人にとっての意味の代わりに使う言い換えで、
   9月14日の障害の根っこと同じもの
   (`docs/island-incident-2026-09-14-cards.md` 8-2)。

   ## `id` も落とす

   カードの書類IDは `<画像のID>__<チャンネルID>` なので、**欄を消しても
   ID から読める。** ここで作り直す。

   代わりに置くのは `<画像のID>__<絵>__<通し番号>`。

   - **絵(`icon`)は、同じ応答の `icon` 欄でもう公開している**(図鑑 `/friends`
     でも98人ぶん公開されている)。**新しい情報を足さない**
   - 通し番号は、同じ写真に同じ絵が2枚あるとき(Doneru から手で入った人と
     YouTube の人が同じ絵に当たる)に分けるためだけのもの
   - **チャンネルIDのハッシュにしない。** 「同じ人だと分かる印」を新しく
     作ってしまう。落としたものを別の形で配り直すことになる

   ## これで足りる理由

   公開の `id` を使っているのは **React の key だけ**
   (`site/components/cards/CardSheet.tsx` の `picks`)。
   `POST /cards/<id>` は画面のどこからも呼ばれていない(本人とあやとが使う口で、
   IDは `GET /cards/mine` から取れる)。だから公開の `id` に要るのは
   「その応答の中で一意」「同じ中身なら毎回同じ」「人を指さない」の3つだけ。 */

/** 誰でも読める応答の1枚。**`channelId` を持たない。** */
export type PublicCard = Omit<Card, "channelId">;

/**
 * 公開の応答に直す。**残す欄を1つずつ書き出す。**
 *
 * `...c` と書いて `channelId` だけ削らないのは、ここが持ち出しの境目だから。
 * 書き出しておけば、`Card` に欄が増えた日に**黙って外へ出ることがない**
 * （型が合わなくなるので、出すかどうかをそのとき決めることになる）。
 * @param {Card[]} list 中の形のカード。並べ替え済み
 * @return {PublicCard[]} 人を指す値の入っていない1枚ずつ
 */
export function forEveryone(list: Card[]): PublicCard[] {
  /** `<画像のID>__<絵>` ごとの通し番号。同じ写真に同じ絵が2枚あるとき用 */
  const seq = new Map<string, number>();
  return list.map((c) => {
    const base = `${c.photoId}__${c.icon || "x"}`;
    const n = (seq.get(base) ?? 0) + 1;
    seq.set(base, n);
    return {
      id: `${base}__${n}`,
      day: c.day,
      photoId: c.photoId,
      url: c.url,
      w: c.w,
      h: c.h,
      note: c.note,
      icon: c.icon,
      name: c.name,
      x: c.x,
      y: c.y,
      rot: c.rot,
      scale: c.scale,
      moved: c.moved,
      at: c.at,
      streamEventId: c.streamEventId,
    };
  });
}

/** 写真の日ごとに出す1人。**こちらも `channelId` を持たない。** */
export type PublicPerson = {icon: string | null; name: string | null};

/**
 * 「その日いた人」を、公開の応答の形にする(`islandApi.ts` の `listPhotoDays`)。
 *
 * **カードと同じ台帳から出てくるので、同じ線を引く。** あちらだけ塞いで
 * こちらを開けておくと、`GET /nordic/photos` のほうから同じ名簿が読める。
 * 見分けるための値は返さない——出すのは絵と、名前を出してよいと言った人の
 * 名前だけ。**上の `forEveryone` と2か所に散らさないため、ここに置く。**
 * @param {string[]} channelIds その日いた人。**外へは出ない**
 * @param {Map<string, string>} icons チャンネルID → キャラクターの書類ID
 * @param {Map<string, string>} named チャンネルID → 出してよいと言った名前
 * @return {PublicPerson[]} 渡された順のまま、絵と名前だけ
 */
export function peopleForEveryone(
  channelIds: string[],
  icons: Map<string, string>,
  named: Map<string, string>,
): PublicPerson[] {
  return channelIds.map((channelId) => ({
    icon: icons.get(channelId) || null,
    name: named.get(channelId) || null,
  }));
}

/**
 * あやと島カードの口。**扱った URL なら true を返す。**
 *
 * 呼ぶ側(`islandApi.ts`)は true が返ったらそこで終わる。
 * @param {CardsReq} q 受け取ったもの
 * @param {CardsRes} res 返す先
 * @param {CardDeps} deps 呼ぶ側から借りるもの
 * @return {Promise<boolean>} ここで扱ったかどうか
 */
export async function handleCards(
  q: CardsReq,
  res: CardsRes,
  deps: CardDeps,
): Promise<boolean> {
  /* ---- 配られたカードぜんぶ。**ログインは要らない。** ----
     誰のカードかを絞るのは画面の側。`/cards` は誰でも見られる面なので、
     そもそも全部返すのが正しい。 */
  if (q.method === "GET" && q.path === "/cards") {
    try {
      res.set(
        "Cache-Control",
        "public, max-age=30, s-maxage=60, stale-while-revalidate=300",
      );
      /* **人を指す値を落としてから返す**（すぐ上の長い注）。
         `/cards/mine` は落とさない。自分のものを自分が見るだけなので。 */
      res.json({cards: forEveryone(await listCards(deps))});
    } catch (e) {
      logger.warn("cards list failed", String(e));
      res.status(502).json({error: "unavailable"});
    }
    return true;
  }

  /* ---- 自分のカードだけ。**ログインが要る。** ----

     公開の `/cards` は1枚ごとに `channelId` と `day` を返す。カードは
     投げ銭の台帳からしか作られないので、**それは「どのチャンネルが、どの日に
     投げ銭したか」の一覧**と同じもの。自分の1枚を出すためだけに、それを
     全ブラウザへ配っていた（`/me` が手元で絞っていた）。
     絞るのはここ。画面には自分のぶんしか降ろさない。

     **返す形は公開の口と1欄も変えない。** 画面（`MyStuff`・`CardSheet`）を
     作り替えずに寄せ先だけ差し替えられるようにするため。 */
  if (q.method === "GET" && q.path === "/cards/mine") {
    /* **CDN にも中間にも置かせない。** 人によって中身が違うものを
       `s-maxage` に載せると、他人のカードが誰かの手元に届く。
       返す前ではなく先に付けるのは、下のどの道を通っても付けるため。 */
    res.set("Cache-Control", "no-store");
    const me = await deps.whoIs(q.auth);
    if (!me) {
      res.status(401).json({error: "sign in"});
      return true;
    }
    try {
      /* **チャンネルは `islandUsers` から取り直す。** 送られてきた値も、
         合言葉に載っていた値も信じない。`POST /cards/<id>` が持ち主を
         決めるのと同じ引き方にそろえる（判定が2つに散らない）。 */
      const saved = await USERS.doc(me.uid).get();
      const myChannel = clean(saved.data()?.channelId, 64);
      /* **チャンネルが結ばれていない人は、空で返す。** カードは
         チャンネルに配られるので、無い人は0枚が正しい答え。
         ここで 500 を返すと、画面が「読めなかった」の顔になる
         （`island-standards.md` 10。0枚と読めなかったは別のもの）。 */
      if (!myChannel) {
        res.json({cards: []});
        return true;
      }
      res.json({cards: await listCards(deps, myChannel)});
    } catch (e) {
      /* **視聴者さんの素性をログに出さない。** チャンネルID・名前・本文は
         1文字も書かない。ここは公開のリポジトリで、ログも誰でも読める。 */
      logger.warn("my cards failed", String(e));
      res.status(502).json({error: "unavailable"});
    }
    return true;
  }

  /* ---- 置き方を動かす。**本人だけ。** ----
     あやとは全部動かせる(写真を貼る人が、写真の見え方を直せないのは変)。 */
  const move = /^\/cards\/([A-Za-z0-9_-]{6,64}__[A-Za-z0-9_-]{6,120})$/
    .exec(q.path);
  if (q.method === "POST" && move) {
    const id = move[1];
    const me = await deps.whoIs(q.auth);
    if (!me) {
      res.status(401).json({error: "sign in"});
      return true;
    }
    let had: FirebaseFirestore.DocumentSnapshot;
    try {
      had = await CARDS.doc(id).get();
    } catch (e) {
      logger.warn("card lookup failed", String(e));
      res.status(502).json({error: "unavailable"});
      return true;
    }
    /* **置き場を見る。** カードは配ってあるので、無ければ本当に無い。
       前は「写真 × 名簿」に聞いていたが、いまは書類そのものが答え。 */
    if (!had.exists) {
      res.status(404).json({error: "no card"});
      return true;
    }
    const mine = clean(had.get("channelId"), 64) || null;
    /* **チャンネルは `islandUsers` から取り直す。** 送られてきた値も、
       ログインのときに持っていた値も信じない。ここが「自分のカードか」を
       決める唯一の場所なので、置き場に入っているものだけを見る。 */
    const saved = await USERS.doc(me.uid).get();
    const myChannel = clean(saved.data()?.channelId, 64);
    const owner = await deps.ownerUid(q.auth);
    if (!owner && (!mine || mine !== myChannel)) {
      res.status(403).json({error: "not yours"});
      return true;
    }
    const place = shapePlace(q.body, placeOf(had.data() ?? {}, id));
    await CARDS.doc(id).set(
      {...place, movedBy: me.uid, movedAt: Date.now(), updatedAt: Date.now()},
      {merge: true},
    );
    res.set("Cache-Control", "no-store");
    res.json({id, ...place, moved: true});
    return true;
  }

  return false;
}
