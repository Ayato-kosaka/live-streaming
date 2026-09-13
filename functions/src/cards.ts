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
import {normKey} from "./islandCharacter";
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

/** 画面に出す1枚。**欄の名前も意味も、#202 の前と同じ。** */
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

   ## カードが何枚でも2往復

   本番の `/island-api/cards` は Hosting に `no-cache` へ書き換えられていて
   （Functions は `s-maxage=60` を付けているが、届くのは `no-cache`）、
   **開かれるたびに handler が丸ごと走る。** 枚数ぶん問い合わせる形にはできない。
   名簿は1回まとめて読み、名前は重複を落として `getAll` で1往復。 */

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
 * **落ちても投げない。** 絵が引けないことでカードそのものが返らなくなるのは、
 * 直そうとしているものより悪い(#34 と同じ形)。引けなければ空の表を返して、
 * 呼んだ側は `icon: null` のまま並べる。
 * @param {string[]} channelIds カードの持ち主
 * @return {Promise<Map<string, string>>} チャンネルID → キャラクターの書類ID
 */
export async function iconsOf(
  channelIds: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(channelIds.filter((x) => x))].slice(0, MAX_CARDS);
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  try {
    const [keys, names] = await Promise.all([
      characterKeys(),
      channelNames(ids),
    ]);
    for (const id of ids) {
      const name = names.get(id);
      if (!name) continue;
      /* `keysOf` が保存のときに「@ なし」も入れてあるので、引く側は
         そろえるだけでよい。両方見るのは、名簿の側が `@` を持っていて
         チャンネルの名前が持っていない(またはその逆)ときのため。 */
      const icon =
        keys.get(normKey(name)) ?? keys.get(normKey(name.replace(/^@+/, "")));
      if (icon) out.set(id, icon);
    }
  } catch (e) {
    logger.warn("card icons failed", String(e));
    return new Map();
  }
  return out;
}

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
 * **`where` を付けない。** 並べ替えと混ぜると複合索引が要る(#168)。
 * 画像は `getAll` で1往復。カードの枚数ぶん引きにいかない。
 * @param {CardDeps} deps 呼ぶ側から借りるもの
 * @return {Promise<Card[]>} 新しい順のカード
 */
async function listCards(deps: CardDeps): Promise<Card[]> {
  /* **`earnedAt` で並べる。** 単一フィールドの並べ替えなので索引は要らない。
     欄の無い書類はここに載らないが、素性の欠けたカードは日次ジョブと
     `mintCards` が足していく(`streamEvents.ts`)。 */
  const snap = await CARDS.orderBy("earnedAt", "desc").limit(MAX_CARDS).get();
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
      res.json({cards: await listCards(deps)});
    } catch (e) {
      logger.warn("cards list failed", String(e));
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
