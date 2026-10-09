/**
 * LINE スタンプの、住人のことば(#716)。
 *
 * スタンプは「絵 ＋ ことば」で1人1枚。絵は図鑑(`islandCharacter`)が持って
 * いるので、**ことばも図鑑の書類IDで並べる**(`islandStampLine/{図鑑のID}`)。
 *
 * ## 本人にだけ見せる
 *
 * 入れ物に書類があるのは、あやとが選んだ人だけ。**その名簿を公開の面に
 * 並べると、そのまま投げ銭の順位表になる**(`docs/island-money.md`
 * 「実額は視聴者には一切見せない」)。選ばれかたが「協力してくれた人」
 * なので、名簿が出た時点で順位が割れる。
 *
 * だから口は `/stampline/mine` の1本だけで、**パスに id を取らない。**
 * 他人を名指しする道が1本も無い形にしてある(`/cards/mine` と同じ考え。
 * `docs/island-api.md` 3章)。
 *
 * 誰のぶんかは **`islandUsers/{uid}.channelId`** から引き直す。
 * 送られてきた値も、合言葉に載っていた値も見ない。
 *
 * ## 言い直せる・足せる
 *
 * あやとの言葉(2026-10-09):
 *
 * > どのセリフにするか提案して言い直してもらおう。追加も可能という仕様
 *
 * - 提案(`suggested`)は機械が入れる。**人は触らない**(消えると、何を
 *   提案したのかが分からなくなる)
 * - 本人が決めたものは `lines` に入る。**1本の欄にまとめてある**——
 *   「選んだ1本」と「足した案」を別の欄にすると、どちらがスタンプに乗るのかが
 *   欄の形で決まらない。**並びの先頭が答え**、で1本にする
 */

import {logger} from "firebase-functions";
import * as admin from "firebase-admin";
import {clean} from "./streamEvents";

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

/** スタンプのことば。書類IDは図鑑(`islandCharacter`)の書類ID。 */
const LINES = db.collection("islandStampLine");

/** 持ち主を突き合わせる先。`islandUsers/{uid}.channelId`。 */
const USERS = db.collection("islandUsers");

/**
 * 1本の長さ。**スタンプに乗る字数。**
 *
 * LINE のスタンプは 370x320 の絵の中に字を置くので、長い文は入らない。
 * あやとの14枚でいちばん長いのが9字なので、倍の余裕を取って20字。
 */
export const MAX_LEN = 20;

/**
 * 置ける本数。**提案の3本に、自分の案を1本足せる。**
 *
 * 上限を置くのは、溜まっても背が変わらない形にするため
 * (`docs/island-standards.md` 7)。畳まずに 390px 幅へ並べられるのは4本まで。
 */
export const MAX_LINES = 4;

/** 出す提案の本数。**1本だと押しつけ、多すぎると選べない。** */
export const SUGGEST = 3;

/** 1人が1日に書き直せる回数。 */
const PER_DAY = 20;

/** ログインしている人。`islandApi.ts` の `whoIs` が返すもの。 */
type Who = {uid: string; name: string; channelId?: string} | null;

/** 呼ぶ側から借りるもの。判定を2か所に増やさないため、関数で受け取る。 */
export type StampDeps = {
  /** 合言葉から「誰か」を出す */
  whoIs: (header?: string) => Promise<Who>;
  /** 1日あたりの回数を1つ消費する */
  takeQuota: (key: string, kind: string, limit: number) => Promise<boolean>;
};

type Json = Record<string, unknown>;

/** 口が受け取るもの。Express の req から要るものだけ。 */
export type StampReq = {
  method: string;
  path: string;
  auth?: string;
  body: Json;
};

/** 返す側。Express の res のうち、ここで使うものだけ。 */
export type StampRes = {
  set(k: string, v: string): unknown;
  status(n: number): StampRes;
  json(b: unknown): unknown;
};

/**
 * 画面に返す形。
 *
 * **選ばれていない人には `picked: false` だけを返す。** 欄を空で付けて
 * 返すと、画面が「在るが空」と「無い」を見分けられなくなる。
 */
export type MyStampLine =
  | {picked: false}
  | {
      picked: true;
      /** 提案（本人の言い回しから引いたもの） */
      suggested: string[];
      /** 本人が決めたことば。空なら、まだ決めていない */
      lines: string[];
      /** 置ける本数 */
      max: number;
      /** 1本の字数 */
      maxLen: number;
    };

/**
 * 字の列を整える。**空と重なりを落として、上限で切る。**
 *
 * 落とすのは「保存しても意味のないもの」だけ。**書き換えはしない**——
 * 人の字なので、こちらで直すと本人の言い回しでなくなる。
 * @param {unknown} v 送られてきたもの
 * @return {string[]} 置いてよい形にしたもの
 */
export function shapeLines(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    /* **改行は落とす。** スタンプの絵に乗るのは1行で、改行を残すと
       画面では見えないまま字数だけ食う */
    const one = typeof x === "string" ? x.replace(/\s+/g, " ") : "";
    const t = clean(one, MAX_LEN);
    if (!t) continue;
    if (out.includes(t)) continue;
    out.push(t);
    if (out.length >= MAX_LINES) break;
  }
  return out;
}

/**
 * 置いてあるものを画面の形にする。
 * @param {Json} d 書類の中身
 * @return {MyStampLine} 返す形
 */
function shown(d: Json): MyStampLine {
  const sug = Array.isArray(d.suggested) ? d.suggested : [];
  return {
    picked: true,
    suggested: sug
      .map((x) => clean(x, MAX_LEN))
      .filter((x) => !!x)
      .slice(0, SUGGEST),
    lines: shapeLines(d.lines),
    max: MAX_LINES,
    maxLen: MAX_LEN,
  };
}

/**
 * その人のことばの書類を1件引く。**チャンネルで引く。**
 *
 * `where` は単一フィールドなので、自動でできる索引の範囲に収まる
 * （複合索引は作れない。`docs/island-api.md`）。
 * @param {string} channelId その人の YouTube チャンネル
 * @return {Promise<FirebaseFirestore.QueryDocumentSnapshot | null>} 書類
 */
async function mineOf(
  channelId: string,
): Promise<FirebaseFirestore.QueryDocumentSnapshot | null> {
  /* **2件引く。** 1件に絞ると、同じチャンネルに2つ付いてしまった日に
     どちらが答えか分からないまま片方を返す。見つけたら黙らずにログへ出す
     （**チャンネルIDは出さない**。件数だけ）。 */
  const snap = await LINES.where("channelId", "==", channelId).limit(2).get();
  if (snap.empty) return null;
  if (snap.docs.length > 1) {
    logger.warn("stampline: one channel has 2 docs", snap.docs.length);
  }
  return snap.docs[0];
}

/**
 * スタンプのことばの口。**扱った URL なら true を返す。**
 * @param {StampReq} q 受け取ったもの
 * @param {StampRes} res 返す先
 * @param {StampDeps} deps 呼ぶ側から借りるもの
 * @return {Promise<boolean>} ここで扱ったかどうか
 */
export async function handleStampLine(
  q: StampReq,
  res: StampRes,
  deps: StampDeps,
): Promise<boolean> {
  if (q.path !== "/stampline/mine") return false;
  if (q.method !== "GET" && q.method !== "POST") return false;

  /* **CDN にも中間にも置かせない。** 人によって中身が違うものを
     `s-maxage` に載せると、他人のことばが誰かの手元に届く。
     どの道を通っても付くように、いちばん先に付ける。 */
  res.set("Cache-Control", "no-store");

  const me = await deps.whoIs(q.auth);
  if (!me) {
    res.status(401).json({error: "sign in"});
    return true;
  }

  let myChannel = "";
  try {
    /* **チャンネルは `islandUsers` から取り直す。** 送られてきた値も、
       合言葉に載っていた値も信じない。ここが「自分のぶんか」を決める
       唯一の場所なので、置き場に入っているものだけを見る
       （`cards.ts` と同じ引き方にそろえてある）。 */
    const saved = await USERS.doc(me.uid).get();
    myChannel = clean(saved.data()?.channelId, 64);
  } catch (e) {
    /* **視聴者さんの素性をログに出さない。** チャンネルID・名前・本文は
       1文字も書かない。ここは公開のリポジトリで、ログも誰でも読める。 */
    logger.warn("stampline: user lookup failed", String(e));
    res.status(502).json({error: "unavailable"});
    return true;
  }

  /* **チャンネルが結ばれていない人は「入っていない」。**
     ことばはチャンネルに結ばれているので、無い人は入っていないのが
     正しい答え。ここで 500 を返すと、画面が「読めなかった」の顔になる
     （`docs/island-standards.md` 10）。 */
  if (!myChannel) {
    res.json({picked: false});
    return true;
  }

  let had: FirebaseFirestore.QueryDocumentSnapshot | null;
  try {
    had = await mineOf(myChannel);
  } catch (e) {
    logger.warn("stampline: lookup failed", String(e));
    res.status(502).json({error: "unavailable"});
    return true;
  }

  if (q.method === "GET") {
    res.json(had ? shown(had.data() as Json) : {picked: false});
    return true;
  }

  /* ---- 書く。**自分のぶんだけ。** ----
     書く先は `mineOf` が返した書類1件で、**送られてきた字から
     書類を決める道が1本も無い。** body に他人の id を入れても、
     ここは見ていないので届かない。 */
  if (!had) {
    /* **入っていない人は書けない。** 書けるようにすると、入れ物に
       書類を作れてしまう（＝自分で名簿に入れる）。 */
    res.status(403).json({error: "not yours"});
    return true;
  }
  if (!(await deps.takeQuota(me.uid, "stampline", PER_DAY))) {
    res.status(429).json({error: "too many"});
    return true;
  }
  const lines = shapeLines(q.body.lines);
  try {
    await had.ref.set(
      {lines, updatedAt: Date.now(), updatedBy: me.uid},
      {merge: true},
    );
  } catch (e) {
    logger.warn("stampline: save failed", String(e));
    res.status(502).json({error: "unavailable"});
    return true;
  }
  /* **書いたものをそのまま返す。** 落とされた行があることが画面で分かる */
  res.json(shown({...(had.data() as Json), lines}));
  return true;
}
