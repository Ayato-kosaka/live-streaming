/**
 * あやと島カード(#173)。
 *
 * その日に投げ銭してくれた人が、その日の写真を1枚もらう。
 * 焼き込もうがしまいが、もらった扱いになる(あやとの言葉)。
 *
 * ## なぜ islandApi.ts の中に書かないか
 *
 * あの1本はもう3,000行ある。ここは丸ごと新しい機能で、向こうと
 * 共有するのは「誰か」を見る関数だけなので、外に出して
 * **取り付けの数行だけ**を向こうに足す(`remote.ts` が先例)。
 *
 * ## カードは「配る」のではなく「引くときに組み立てる」
 *
 * **配るやり方だと、その日ぶんが永久に0枚になる。**
 * 名簿(`nordicDays/{day}.people`)は BigQuery から**翌朝**に入る。
 * 写真を貼った時点では空なので、「写真を貼ったら、その日の人ぶん
 * カードを作る」にすると、貼った夜の写真は誰にも配られない。
 * あとから名簿が入っても、配る合図はもう過ぎている。
 *
 * だから、置き場には**何も配らない。**
 *
 *   カード = その日の写真 × その日の名簿にいる人
 *
 * どちらも既にあるものなので、**写真が先でも名簿が先でも同じ結果**になる。
 * id は写真と人から決め打ちで作る(`cardId`)ので、両方が揃った瞬間に
 * そのカードは勝手に存在している。置き方(x/y/rot/scale)の既定値も
 * id から決まる(`defaultPlace`)ので、毎回同じ場所に出る。
 *
 * `islandCards/{cardId}` に書くのは、**本人が動かしたときの上書きだけ。**
 * 誰も動かしていないカードは、置き場に1行も無い。
 *
 * ## 誰のカードか
 *
 * 名簿は YouTube のチャンネルIDを持っている。ログインしている人の uid とは
 * `islandUsers/{uid}.channelId` で結び付く。**自分のカードとは、
 * 自分のチャンネルIDのカード。**
 *
 * **`icon` しか無い人(Doneru の人)は、持ち主が分からない。**
 * あの人たちは `python/admin/nordic_supporter.py` から手で足されていて、
 * YouTube のチャンネルを持っていない。**カードは存在するが、
 * 誰のマイページにも入らない。** 絵の割り当て表(あやとのスプレッドシート)に
 * チャンネルが入るまでは、これで正しい。勝手に誰かのものにしない。
 *
 * ## 索引を使わない(#168)
 *
 * サービスアカウントに複合索引を作る権限が無いので、`where` と `orderBy` を
 * 組み合わせると本番で 500 になる。**引いてから並べ替える。**
 */

import {logger} from "firebase-functions";
import * as admin from "firebase-admin";

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

/* 動かしたぶんだけが入る置き場。**カードそのものはここに無い。**
   ドキュメントIDは `<写真のID>__<誰か>` で、写真と名簿から決め打ちで作れる。 */
const CARDS = db.collection("islandCards");
/* 元になるもの。どちらも既にある(`docs/nordic-photos.md`)。 */
const NPHOTOS = db.collection("nordicPhotos");
const NDAYS = db.collection("nordicDays");
/** 持ち主を突き合わせる先。`islandUsers/{uid}.channelId`。 */
const USERS = db.collection("islandUsers");

/** 一度に組み立てる枚数の上限。写真×人なので、日が進むと掛け算で増える。 */
const MAX_CARDS = 600;
/** 元にする写真の枚数。`listPhotoDays` と同じ。 */
const MAX_PHOTOS = 400;
/** 動かしたぶんを読む上限。動かした人のぶんしか無いので、当分これで足りる。 */
const MAX_MOVED = 2000;
/** 1日の名簿から見る人数。`listPhotoDays` と同じ。 */
const MAX_PEOPLE = 60;

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

/** 画面に出す1枚。**置き場にはこの形で入っていない。組み立てたもの。** */
type Card = {
  id: string;
  day: string;
  photoId: string;
  url: string;
  w: number;
  h: number;
  note: string;
  /** もらった人の YouTube チャンネル。Doneru の人は null */
  channelId: string | null;
  /** 名簿が絵まで持っていたときだけ。ふつうは画面側が residents.ts で引く */
  icon: string | null;
  /** 島に名前を出してよいと言った人だけ */
  name: string | null;
  /** 写真の中のどこに立つか。0〜1 の割合。写真の大きさが変わってもずれない */
  x: number;
  y: number;
  rot: number;
  scale: number;
  /** 本人が動かしたか。既定のままなら false */
  moved: boolean;
  /** 写真が貼られた時刻。並べ替えに使う */
  at: number;
};

/**
 * 文字列にして、前後の空白を落として、長さで切る。
 * @param {unknown} v 受け取った値
 * @param {number} max 残す長さ
 * @return {string} 整えた文字列
 */
function clean(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

/**
 * 「その人」を1つの文字列にする。カードIDの後ろ半分になる。
 *
 * チャンネルがあればそれ。無ければ絵の id に `i-` を付ける
 * (Doneru の人。持ち主が分からないので、誰のマイページにも入らない)。
 * @param {string | null} channelId YouTube のチャンネルID
 * @param {string | null} icon キャラクターの絵の id
 * @return {string} 誰か。どちらも無ければ空
 */
function whoKey(channelId: string | null, icon: string | null): string {
  if (channelId) return channelId;
  if (icon) return `i-${icon}`;
  return "";
}

/**
 * カードのID。**写真と人が揃えば、置き場を見ずに決まる。**
 *
 * ここが「引くときに組み立てる」の芯。id が決め打ちなので、
 * 名簿が翌朝に入っても、写真をあとから貼っても、同じ id になる。
 * @param {string} photoId 写真のID
 * @param {string} who `whoKey` が返したもの
 * @return {string} カードのID
 */
const cardId = (photoId: string, who: string): string => `${photoId}__${who}`;

/**
 * カードIDを写真と人に割る。**最初の `__` で割る。**
 *
 * 絵の id(Google ドライブ)は `_` を含むことがあるので、後ろから割ると
 * 人のほうが切れる。写真のIDは Firestore の自動採番で `_` を含まない。
 * @param {string} id カードのID
 * @return {{photoId: string, who: string} | null} 割れなければ null
 */
function splitCardId(id: string): {photoId: string; who: string} | null {
  const at = id.indexOf("__");
  if (at <= 0) return null;
  const photoId = id.slice(0, at);
  const who = id.slice(at + 2);
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(photoId)) return null;
  if (!/^[A-Za-z0-9_-]{6,120}$/.test(who)) return null;
  return {photoId, who};
}

/**
 * id から 0〜1 の数を4つ出す。**同じ id なら毎回同じ数。**
 *
 * 置き方の既定値をここから作る。置き場に書かずに散らばりを決められるので、
 * 「まだ誰も動かしていないカード」でも毎回同じ場所に立つ。
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

/** 置き方。x/y は写真に対する割合で、y は**足元**の高さ。 */
type Place = {x: number; y: number; rot: number; scale: number};

/**
 * 何も動かしていないカードの置き方。
 *
 * **芯は見本の右下**(`docs/nordic-photos.md` 5章)。あやとの見本は
 * 右端から2%・下端から5%にキャラクターが1体立っていて、持って帰る1枚は
 * いまもその位置に焼いている。カードもそこを基準にする。
 *
 * ただし**そこから少しだけ散らす。** 同じ日の同じ写真に何人も乗るので、
 * 全員を寸分たがわず同じ場所に立たせると、並べたときに
 * 「同じ絵が人数ぶん」に見える。散らばりは id から決まるので、
 * 同じカードは何度開いても同じ場所に立つ。
 * @param {string} id カードのID
 * @return {Place} 置き方
 */
function defaultPlace(id: string): Place {
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
 * **写真の外へ出さない。** 出せると、カードを開いた人には何も見えない
 * ものが1枚できる。傾きと大きさも同じ理由で締める。
 * @param {Json} b 送られてきた中身
 * @param {Place} now いまの置き方。欠けている欄はここから埋める
 * @return {Place} 置く値
 */
function shapePlace(b: Json, now: Place): Place {
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

/** 名簿の1人。BigQuery から来るぶんはチャンネルだけを持つ。 */
type Person = {channelId: string | null; icon: string | null};

/**
 * その日の名簿を読む形にする。
 * @param {Json[]} arr `nordicDays/{day}.people` の中身
 * @return {Person[]} 同じ人を1回だけにした一覧
 */
function shapePeople(arr: Json[]): Person[] {
  const out: Person[] = [];
  const seen = new Set<string>();
  arr.slice(0, MAX_PEOPLE).forEach((x) => {
    const channelId = clean(x.channelId, 64) || null;
    const icon = clean(x.icon, 80) || null;
    const key = whoKey(channelId, icon);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({channelId, icon});
  });
  return out;
}

/**
 * 配られたカードを、ぜんぶ組み立てて返す。**新しい順。**
 *
 * 写真と名簿を引いて掛け合わせ、動かしたぶんだけを上から重ねる。
 * どこにも「配る」処理が無いのは、それが要らない作りだから(冒頭)。
 * @param {CardDeps} deps 呼ぶ側から借りるもの
 * @return {Promise<Card[]>} 新しい順のカード
 */
async function listCards(deps: CardDeps): Promise<Card[]> {
  /* **`where` を付けない。** 日で絞って `orderBy` すると複合索引が要る(#168)。
     写真の総数はたかだか数百枚なので、引いてから手元で組む。 */
  const snap = await NPHOTOS.orderBy("at", "desc").limit(MAX_PHOTOS).get();
  type Photo = {
    id: string; day: string; url: string; w: number; h: number;
    note: string; at: number;
  };
  const photos: Photo[] = [];
  const days = new Set<string>();
  snap.forEach((d) => {
    const v = d.data() ?? {};
    const day = clean(v.day, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
    if (typeof v.url !== "string") return;
    photos.push({
      id: d.id,
      day,
      url: v.url,
      w: Number(v.w) || 0,
      h: Number(v.h) || 0,
      note: (v.note as string) || "",
      at: Number(v.at) || 0,
    });
    days.add(day);
  });
  if (photos.length === 0) return [];

  const dayList = [...days];
  const [people, residents, moved] = await Promise.all([
    db.getAll(...dayList.map((d) => NDAYS.doc(d))),
    deps.listResidents(),
    /* 動かしたぶん。**`where` も `orderBy` も付けない。** id を鍵にした
       上書きしか入っていないので、collection ごと読んで手元で引く。 */
    CARDS.limit(MAX_MOVED).get(),
  ]);

  const peopleOf = new Map<string, Person[]>();
  people.forEach((p) => {
    peopleOf.set(p.id, shapePeople((p.data()?.people ?? []) as Json[]));
  });

  /* **名前は、出してよいと言った人のぶんだけ。**
     BigQuery から来る author_name は、本人が島に名前を出すと決めたかどうかと
     関係なく取れてしまう(`listPhotoDays` と同じ判断)。 */
  const named = new Map<string, string>();
  residents.forEach((r) => {
    const id = r.channelId as string;
    if (id && r.name) named.set(id, r.name as string);
  });

  const overs = new Map<string, Json>();
  moved.forEach((d) => overs.set(d.id, d.data() ?? {}));

  const out: Card[] = [];
  for (const ph of photos) {
    for (const who of peopleOf.get(ph.day) ?? []) {
      const key = whoKey(who.channelId, who.icon);
      if (!key) continue;
      const id = cardId(ph.id, key);
      const over = overs.get(id);
      const place = over ?
        shapePlace(over, defaultPlace(id)) :
        defaultPlace(id);
      out.push({
        id,
        day: ph.day,
        photoId: ph.id,
        url: ph.url,
        w: ph.w,
        h: ph.h,
        note: ph.note,
        channelId: who.channelId,
        icon: who.icon,
        name: (who.channelId && named.get(who.channelId)) || null,
        ...place,
        moved: !!over,
        at: ph.at,
      });
      if (out.length >= MAX_CARDS) return sortCards(out);
    }
  }
  return sortCards(out);
}

/**
 * 新しい順に並べる。同じ写真の中は id で固定して、開くたびに入れ替わらせない。
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
 * そのカードが本当にあるか、あるなら誰のものかを確かめる。
 *
 * **置き場を見ない。** カードは組み立てもので、動かすまで1行も無いので、
 * 「あるか」は写真とその日の名簿に聞くしかない。
 * @param {string} id カードのID
 * @return {Promise<string | null | undefined>} 持ち主のチャンネル。
 *   持ち主の分からないカード(Doneru の人)は null、無いカードは undefined
 */
async function ownerOf(id: string): Promise<string | null | undefined> {
  const split = splitCardId(id);
  if (!split) return undefined;
  const photo = await NPHOTOS.doc(split.photoId).get();
  const day = clean(photo.data()?.day, 10);
  if (!photo.exists || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
  const roster = await NDAYS.doc(day).get();
  const list = shapePeople((roster.data()?.people ?? []) as Json[]);
  const hit = list.find((p) => whoKey(p.channelId, p.icon) === split.who);
  if (!hit) return undefined;
  return hit.channelId;
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
     誰のカードかを絞るのは画面の側。ここで uid を鍵に絞ると
     `where` が要るし(#168)、`/cards` は誰でも見られる面なので、
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
    let mine: string | null | undefined;
    try {
      mine = await ownerOf(id);
    } catch (e) {
      logger.warn("card owner lookup failed", String(e));
      res.status(502).json({error: "unavailable"});
      return true;
    }
    if (mine === undefined) {
      res.status(404).json({error: "no card"});
      return true;
    }
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
    const had = await CARDS.doc(id).get();
    const now = had.exists ?
      shapePlace(had.data() ?? {}, defaultPlace(id)) :
      defaultPlace(id);
    const place = shapePlace(q.body, now);
    await CARDS.doc(id).set(
      {...place, movedBy: me.uid, movedAt: Date.now()},
      {merge: true},
    );
    res.set("Cache-Control", "no-store");
    res.json({id, ...place, moved: true});
    return true;
  }

  return false;
}
