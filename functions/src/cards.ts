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
  MAX_NAME,
  clean,
  defaultPlace,
  imageRef,
  shapePlace,
  type ImageRef,
  type Place,
  type Tipper,
} from "./streamEvents";

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

/** 持ち主を突き合わせる先。`islandUsers/{uid}.channelId`。 */
const USERS = db.collection("islandUsers");

/** 一度に返す枚数。新しいほうから。 */
const MAX_CARDS = 600;

/** キャラクターの名簿(#284)。**絵と呼び名の対応はここにしか無い。** */
const CHARACTERS = db.collection("islandCharacter");

/** 名簿を一度に読む人数。`/characters` の口と同じ上限。いま98人。 */
const MAX_CHARACTERS = 500;

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
  /**
   * キャラクターの書類ID。画面はこれで絵を引く(`lib/charImg.ts`)。
   * **投げたときの名乗り(`nameSnapshot`)からしか決まらない**（下の長い注）
   */
  icon: string | null;
  /**
   * 島に名前を出してよいと言った人だけ。**しかも、投げたときの名乗りで
   * 身元が分かったカードだけ**（別名で投げた1回には出さない）
   */
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

   **投げてくれたときに名乗っていた名前（`nameSnapshot`）→ 名簿の
   `lookupKeys` → 絵。** 配信中のアラートボックスと同じ引き方
   (`islandCharacter.ts` の `findBy("lookupKeys", …)`・
   `app/alertbox/matching.utils.ts`)。

   ## なぜチャンネルIDを通らないか

   前はこう引いていた。

     どねID → `islandDonors`（あやとが手で紐付けたもの）
       → チャンネルID → `islandChannels.name`（**いま名乗っている名前**）
       → 絵

   **Doneru に何と名乗って投げたかが、1文字も使われていない。**
   だから**別名で投げた人の絵が、公開の `/cards` に出ていた。**
   欄としての `name` も `channelId` も null にしてあったのに、絵だけが
   残っていて、図鑑(`/friends`)に同じ絵が並んでいるので照らせば誰か分かる。

   あやとの決め(2026-09-15):

   > 内部ロジックとして、かこさんが投げてくれた紐付けはしてもいいけど、
   > みんなが見える場所では匿名性を守りたい

   紐付け（どねID → チャンネルID）は残す。**それを公開の面の絵に使うのを
   やめる。** 名乗りは `islandTips.displayNameSnapshot` に入っていて、
   カードの書類に焼き込んである(`streamEvents.ts` の `mintCards`)。

   ## 焼き込みなので、あとから動かない

   名簿を引くのは「その名乗りが誰の呼び名か」だけ。**投げた時点の名乗りは
   カードの書類の中にあるので、YouTube の名前を変えても Doneru の名前を
   変えても、カードの絵は動かない。** あやとの決めごと
   (`docs/island-db.md` 2章)に、これで初めて沿う。

   > キャラクターの割り当てはあやとが決めたもので、**YouTube を更新しても
   > 変わらないのが正しい。本人にキャラクターを選ばせる口は無い**

   ## なりすましは見ない

   名乗りで当てる以上、他人の名前を打てば他人の絵が乗る。あやとの決め:

   > なりすましは、アラートボックスでも防げてないですよね。
   > なので、性善説で行きましょう

   だから `islandChannels` の辞書ぜんぶを読んで「2人が名乗っている名前」を
   落とす守り(`sharedNames`)は**丸ごと要らなくなった。** 2,272件の読みが
   毎回消える。**`islandChannels` は1回も読まない。**

   ## 「どちらか選べない」だけは残す

   **同じ鍵が2人のキャラクターに付いていたら、どちらも使わない。**
   これはなりすましの話ではなく「どちらか選べない」話で、当てずっぽうに
   1人選ぶと**別人の絵**が乗る。アラートボックスの `findBy` が
   `limit(2)` を取って `size !== 1` なら諦めるのと、同じ決め方。

   ## `lookupKeys` で引く（`channelKeys` ではない）

   アラートボックスが Doneru の名乗りに当てているのがこちら
   (`islandCharacter.ts` 冒頭の表)。`channelKeys` はチャンネル名しか
   入っていないので、**呼び名(aliases)で投げた人が当たらなくなる。**

   ## カードが何枚でも、往復は増えない

   本番の `/island-api/cards` は Hosting に `no-cache` へ書き換えられていて
   （Functions は `s-maxage=60` を付けているが、届くのは `no-cache`）、
   **開かれるたびに handler が丸ごと走る。** 引く先は名簿1つだけで、
   しかも5分の控えに載るので、温まっていれば**1往復も増えない。** */

/** 引く鍵(`normKey` した名乗り) → キャラクターの書類ID。 */
type Keys = Map<string, string>;

/** 温かいインスタンスに持つ名簿。 */
let cached: {at: number; keys: Keys} | null = null;

/**
 * 名簿を覚えておく長さ。
 *
 * `lookupKeys` が変わるのはあやとが画面からキャラクターを直したときだけで、
 * 年に数回。5分にしたのは、直した本人が画面を開き直したときに**待たされて
 * いると気づかない**長さだから。口が CDN に乗らない以上、98件の読み込みを
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
    /* **`lookupKeys` で引く。** アラートボックスが Doneru の名乗りに
       当てているのと同じ欄。`channelKeys` にするとチャンネル名しか
       入っていないので、呼び名(aliases)で投げた人が当たらない。 */
    const list = Array.isArray(v.lookupKeys) ? v.lookupKeys : [];
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
 * **投げたときに名乗っていた名前**から、キャラクターの書類IDを引く。
 *
 * **落ちても投げない。** 絵が引けないことでカードそのものが返らなくなるのは、
 * 直そうとしているものより悪い(#34 と同じ形)。**ただし「読めなかったから
 * 当てる」には倒さない。** 読めなければ、当てない。
 *
 * **「1人も当たらなかった」と「読めなかった」を、同じ顔で返さない。**
 * 読めなかったときは `null`。区別せずに空を返すと、読めなかった回の画面が
 * 「その日は誰も投げ銭していない」と言い切る(`docs/island-standards.md` 10)。
 * @param {string[]} names 投げたときの名乗り(`islandTips.displayNameSnapshot`)
 * @return {Promise<Map<string, string> | null>} 名乗り → キャラクターの
 *   書類ID。読めなかったときは `null`
 */
export async function iconsOf(
  names: string[],
): Promise<Map<string, string> | null> {
  const list = [...new Set(names.filter((x) => x))].slice(0, MAX_CARDS);
  const out = new Map<string, string>();
  if (list.length === 0) return out;
  try {
    const keys = await characterKeys();
    for (const name of list) {
      /* `keysOf` が保存のときに「@ なし」も入れてあるので、引く側は
         そろえるだけでよい。両方見るのは、名簿の側が `@` を持っていて
         名乗りのほうが持っていない(またはその逆)ときのため。 */
      const icon = keysOf([name]).map((k) => keys.get(k)).find((v) => v);
      if (icon) out.set(name, icon);
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
     カードが何枚でも往復は2本しか増えないのに、返るのが1本ぶん遅くなる。

     **渡すのはチャンネルIDではなく、投げたときの名乗り。** 書類に焼き込んで
     ある(`streamEvents.ts` の `mintCards`)ので、ここで辞書を引き直さない。 */
  const [images, residents, icons] = await Promise.all([
    imageIds.length ?
      db.getAll(...imageIds.map((id) => IMAGES.doc(id))) :
      Promise.resolve([]),
    deps.listResidents(),
    iconsOf(rows.map((r) => clean(r.v.nameSnapshot, MAX_NAME))),
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
    /* **公開の面での身元は、投げたときの名乗りだけで決まる。**
       当たらなければ、絵も名前も出さない（下の `name` も参照）。 */
    const icon = icons.get(clean(r.v.nameSnapshot, MAX_NAME)) || null;
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
      icon,
      /* **名前も、名乗りで身元が分かったときだけ。** 名前を出してよいと
         言った人でも、その1回を別名で投げたなら、そのカードには出さない。
         絵だけ閉じて名前を開けておくと、**絵より濃いもの**が残る
         （`CLAUDE.md`「1件直したら、同じ理由で壊れているところを探しに行く」）。 */
      name: (icon && channelId && named.get(channelId)) || null,
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
 *
 * **絵は名乗り（`nameSnapshot`）で引く。** カードと同じ引き方でないと、
 * こちらだけ「別名で投げた人の本体が出る」面が残る。名前も同じで、
 * 名乗りで身元が分かった人にしか出さない。
 * @param {Tipper[]} people その日投げてくれた人。**外へは出ない**
 * @param {Map<string, string>} icons 名乗り → キャラクターの書類ID
 * @param {Map<string, string>} named チャンネルID → 出してよいと言った名前
 * @return {PublicPerson[]} 渡された順のまま、絵と名前だけ
 */
export function peopleForEveryone(
  people: Tipper[],
  icons: Map<string, string>,
  named: Map<string, string>,
): PublicPerson[] {
  return people.map((p) => {
    const icon = icons.get(p.nameSnapshot) || null;
    return {
      icon,
      name: (icon && named.get(p.channelId)) || null,
    };
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
