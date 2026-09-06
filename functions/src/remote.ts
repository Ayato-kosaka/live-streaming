/**
 * 島の遠隔操作(#165)。
 *
 * 配信中、あやとが手元のコントローラー(`/me/remote`)を押すと、
 * スマホ版 OBS に映っている島(`?remote=<sessionId>`)が動く。
 *
 * ## なぜ islandApi.ts の中に書かないか
 *
 * あの1本はもう3,000行あって、同じ日に何人もが別々の口を足している。
 * ここは丸ごと新しい機能で、既存の口と共有するものが `ownerUid` しか
 * 無いので、外に出して**取り付けの数行だけ**を向こうに足す。
 *
 * ## 繋ぎ方
 *
 * `islandRemote/{sessionId}` に1つのドキュメントを置いて、
 * 書くのはオーナーだけ、読むのは sessionId を知っている人だけ。
 *
 * **`where` も `orderBy` も使わない**(#168)。サービスアカウントに
 * 複合索引を作る権限が無いので、索引の要る読み方をすると本番で 500 になる。
 * ここは id を指してドキュメントを1つ読み書きするだけなので、そもそも要らない。
 */

import {logger} from "firebase-functions";
import * as admin from "firebase-admin";
import {randomUUID} from "crypto";

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

/** 遠隔操作の入れ物。ドキュメントIDがそのまま表示側の合言葉になる。 */
const REMOTE = db.collection("islandRemote");
/** オーナーの控え。sessionId をここに置いて**ずっと変えない**。 */
const USERS = db.collection("islandUsers");

/**
 * 送ってよい行き先の表。
 *
 * **文字列をそのまま信じない。** 表示側は受け取った値で `router.push` する。
 * `at` を素通しすると、島の外の URL や `javascript:` を書き込める人が
 * 配信の画面を好きなところへ飛ばせる。ここに無いものは黙って捨てる。
 *
 * 中身は #165 のコメントで決まった表そのまま。
 *   島         … `/`
 *   6つの入口  … `docs/island-design.md` 6章の表
 *   面         … これから・いまどこ・掲示板
 *   北欧の日   … 出発と1〜9日目(`site/content/nordic.ts` の DAY_PAGES)
 */
const PLACES: string[] = [
  "/",
  // 看板を出す6つ
  "/about",
  "/streams",
  "/apps",
  "/next",
  "/board",
  "/map",
  // 面
  "/now",
  // 北欧の日。**旅程表ぜんぶ(`/nordic`)は入れない。**
  // コントローラーに札が無いものを通しても、押せる場所が増えないので
  "/nordic/day/depart",
  "/nordic/day/1",
  "/nordic/day/2",
  "/nordic/day/3",
  "/nordic/day/4",
  "/nordic/day/5",
  "/nordic/day/6",
  "/nordic/day/7",
  "/nordic/day/8",
  "/nordic/day/9",
];

/** 島の寄り引き。表示側の `IslandStage` が持っている2つの状態そのまま。 */
const VIEWS = ["wide", "near"];

/**
 * 送ってよいスクロールの指示。
 *
 * #165 の本文は「要素の id か、割合(0〜1)」だが、それだけだと
 * **「少し下へ」が書けない。** 割合は絶対の位置なので、いま画面が
 * どこにいるかを知らないコントローラーからは指せない。
 * 相対で送る3つ(`down`/`far`/`top`)を足してある。
 *
 *   top    … いちばん上へ
 *   down   … 少し下へ(1画面ぶん弱)
 *   far    … だいぶ下へ(3画面ぶん)
 *   bottom … いちばん下へ
 *   #<id>  … その要素まで
 *   0〜1   … 面の高さに対する割合
 */
const SCROLL_WORDS = ["top", "down", "far", "bottom"];
const SCROLL_ID = /^#[A-Za-z0-9_-]{1,64}$/;
const SCROLL_RATIO = /^(0(\.\d{1,4})?|1(\.0{1,4})?)$/;

/** 表示側に出す一言の長さ。「ひきで見る を押しました」が入れば足りる。 */
const MAX_SAY = 40;

/** 表示側が読みにくる間隔(ミリ秒)。返事に入れて、こちらから決める。 */
const POLL_MS = 2000;

type Json = Record<string, unknown>;

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
 * 表示側に返す形。**持ち主の uid は返さない。**
 *
 * `GET /remote` はログインが要らない口なので、ここに uid を混ぜると
 * sessionId を知っている人にオーナーの uid が漏れる。
 * @param {string} id セッションのID
 * @param {Json} v Firestore に入っている値
 * @return {Json} 表示側に返すもの
 */
function shape(id: string, v: Json): Json {
  return {
    sessionId: id,
    at: (v.at as string) || null,
    view: (v.view as string) || null,
    scrollTo: (v.scrollTo as string) || null,
    say: (v.say as string) || "",
    /* 「押したものを表示側に出す」の入切。既定は出す。
       うるさければコントローラーから切れる(#165 の決め)。 */
    showSay: v.showSay !== false,
    seq: Number(v.seq) || 0,
    updatedAt: Number(v.updatedAt) || 0,
    pollMs: POLL_MS,
  };
}

/** 遠隔操作の口が受け取るもの。Express の req から要るものだけを抜いて渡す。 */
export type RemoteReq = {
  method: string;
  path: string;
  /** Authorization ヘッダ。オーナーかどうかはこれで見る */
  auth?: string;
  /** `GET /remote?sessionId=…` */
  sessionId?: string;
  body: Json;
};

/** 返す側。Express の res のうち、ここで使うものだけ。 */
export type RemoteRes = {
  set(k: string, v: string): unknown;
  status(n: number): RemoteRes;
  json(b: unknown): unknown;
};

/**
 * 島の遠隔操作の口。**扱った URL なら true を返す。**
 *
 * 呼ぶ側(`islandApi.ts`)は true が返ったらそこで終わる。
 * false のときは何も書いていないので、そのまま次の口へ落ちてよい。
 * @param {RemoteReq} q 受け取ったもの
 * @param {RemoteRes} res 返す先
 * @param {function(string=): Promise<string|null>} ownerUid オーナーの uid を返す関数
 * @return {Promise<boolean>} ここで扱ったかどうか
 */
export async function handleRemote(
  q: RemoteReq,
  res: RemoteRes,
  ownerUid: (header?: string) => Promise<string | null>,
): Promise<boolean> {
  /* ---- セッションを出す。**あやとだけ。** ----
     id は作り直さない。毎回変わると、配信のたびに OBS の URL を
     貼り替えることになって、この道具が無くしたかった手間が戻る
     (ルーレット #164 と同じ理由)。`fresh` を付けたときだけ作り直す。 */
  if (q.method === "POST" && q.path === "/remote/session") {
    const uid = await ownerUid(q.auth);
    if (!uid) {
      res.status(403).json({error: "not allowed"});
      return true;
    }
    const user = await USERS.doc(uid).get();
    let id = String(user.data()?.remoteId ?? "");
    /* 128ビット。sessionId を知っている人だけが表示側を読めるので、
       総当たりで当てられない長さにする(ルーレットの id と同じ形)。 */
    if (q.body.fresh === true || !/^[0-9a-f]{32}$/.test(id)) {
      id = randomUUID().replace(/-/g, "");
      await USERS.doc(uid).set({remoteId: id}, {merge: true});
    }
    const ref = REMOTE.doc(id);
    const had = await ref.get();
    const prev: Json = had.exists ? had.data() ?? {} : {};
    const rec: Json = {
      owner: uid,
      at: prev.at ?? null,
      view: prev.view ?? null,
      scrollTo: prev.scrollTo ?? null,
      say: prev.say ?? "",
      showSay: prev.showSay !== false,
      /* **seq は引き継ぐ。** 0 に戻すと、表示側が「戻った」と気づけずに
         次の1回を取りこぼす(表示側は増えたときだけ従う)。 */
      seq: Number(prev.seq) || 0,
      updatedAt: Date.now(),
    };
    await ref.set(rec);
    res.set("Cache-Control", "no-store");
    res.json({session: shape(id, rec)});
    return true;
  }

  /* ---- 押す。**あやとだけ。** ----
     `seq` はここで +1 する。ブラウザに数えさせると、2つの端末から
     押したときに同じ番号が出て、表示側が片方を捨てる。 */
  if (q.method === "POST" && q.path === "/remote") {
    const uid = await ownerUid(q.auth);
    if (!uid) {
      res.status(403).json({error: "not allowed"});
      return true;
    }
    const id = clean(q.body.sessionId, 64);
    if (!/^[0-9a-f]{32}$/.test(id)) {
      res.status(400).json({error: "bad session"});
      return true;
    }
    const at = clean(q.body.at, 64);
    const view = clean(q.body.view, 8);
    const scrollTo = clean(q.body.scrollTo, 72);
    /* 表の中に無いものは、黙って捨てるのではなく断る。
       コントローラーの押し間違いではなく作り間違いなので、出したほうがよい。 */
    if (at && !PLACES.includes(at)) {
      res.status(400).json({error: "bad place"});
      return true;
    }
    if (view && !VIEWS.includes(view)) {
      res.status(400).json({error: "bad view"});
      return true;
    }
    if (
      scrollTo &&
      !SCROLL_WORDS.includes(scrollTo) &&
      !SCROLL_ID.test(scrollTo) &&
      !SCROLL_RATIO.test(scrollTo)
    ) {
      res.status(400).json({error: "bad scroll"});
      return true;
    }

    /* **番号は読んで書くので、取引にする。** 2つの端末から同時に押されても
       同じ番号にならない。同じ番号が出ると、表示側は片方を捨てる。 */
    const ref = REMOTE.doc(id);
    const done = await db.runTransaction<
      {ok: true; rec: Json} | {ok: false; why: "missing" | "denied"}
    >(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return {ok: false, why: "missing"};
      const prev = snap.data() ?? {};
      /* **持ち主でなければ書かせない。** オーナーは1人ではない作りなので、
         他の管理者のセッションへ書き込めると、その人の配信が動く。 */
      if (prev.owner !== uid) return {ok: false, why: "denied"};
      const rec: Json = {
        at: at || null,
        view: view || null,
        scrollTo: scrollTo || null,
        say: clean(q.body.say, MAX_SAY),
        showSay:
          q.body.showSay === undefined ?
            prev.showSay !== false :
            q.body.showSay !== false,
        seq: (Number(prev.seq) || 0) + 1,
        updatedAt: Date.now(),
      };
      tx.set(ref, rec, {merge: true});
      return {ok: true, rec};
    });
    if (!done.ok) {
      if (done.why === "missing") {
        /* コントローラーを開き直せば作り直せる。**押した側に、そう出す。** */
        res.status(404).json({error: "no session"});
      } else {
        res.status(403).json({error: "not allowed"});
      }
      return true;
    }
    res.set("Cache-Control", "no-store");
    res.json({session: shape(id, done.rec)});
    return true;
  }

  /* ---- 表示側が読むところ。**ログインが要らない唯一の口。** ----
     OBS はログインできないので、sessionId を知っていることが合言葉。
     **キャッシュさせない。** 1回でも挟まれると、押しても画面が動かない
     時間ができて、配信の途中でそれを直す手立てが無い。 */
  if (q.method === "GET" && q.path === "/remote") {
    const id = clean(q.sessionId, 64);
    res.set("Cache-Control", "no-store");
    if (!/^[0-9a-f]{32}$/.test(id)) {
      res.status(400).json({error: "bad session"});
      return true;
    }
    try {
      const snap = await REMOTE.doc(id).get();
      if (!snap.exists) {
        /* まだ1回も開いていないだけ。**404 にしない。** 表示側を先に
           開いておく使い方があるので、空のまま「何も押されていない」を返す。 */
        res.json({session: shape(id, {}), open: false});
        return true;
      }
      res.json({session: shape(id, snap.data() ?? {}), open: true});
    } catch (e) {
      logger.warn("remote read failed", String(e));
      res.status(502).json({error: "unavailable"});
    }
    return true;
  }

  return false;
}
