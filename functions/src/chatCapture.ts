/**
 * 配信中のコメントを、そのあいだに溜めておく（#153）。
 *
 * ## なぜ配信中に取るのか
 *
 * **アーカイブのチャットは1日ほど遅れて出る**（あやとの読み。YouTube の都合）。
 * 配信が終わったその夜に切り抜こうとしても、コメントがまだ手に入らない。
 * 溜めるのが先で、切るのは後。
 *
 * BigQuery 側の `chat_messages` は yt-dlp で**配信が終わったあと**に取るもので、
 * こちらとは別物。名前を `streamChatMessages` にして、翌朝どちらを見ればいいか
 * 迷わないようにしてある。
 *
 * ## 止めずに動かさない
 *
 * あやとの心配（#153）「cloud functions を止めずに動かすということですか？
 * 30分ぶん取り逃すのと、課金が心配」。**どちらも起きない。**
 *
 * `liveChatMessages.list` は**カーソル**で、`nextPageToken` を控えておけば
 * 次に呼んだとき前回の続きから全部返る。「呼んだ瞬間のぶんだけ」ではない。
 * だから5分おきに数秒だけ起きればよく、**5分ぶんが丸ごと来る。**
 * 落ちた回があっても、次の回がその穴ごと持ってくる。
 *
 * 1日288回・1回数秒。無料枠は月200万回なので、月8,700回では届かない。
 * **配信していない時間は YouTube を1回も叩かない。**
 *
 * ## 割り当てはこちらの枠を使わない
 *
 * 読むのは Doneru が出したトークン（`doneruYoutube.ts`）。割り当ては
 * トークンを発行したプロジェクトに付くので、こちらの1日10,000単位は減らない。
 * アラートボックスと同じ形。鍵は Firestore に置いたままで、外へ出ない。
 */

import {logger} from "firebase-functions";
import {onSchedule} from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import {
  doneruYoutubeToken,
  doneruYoutubeRefreshToken,
} from "./doneruYoutube";

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

/** 溜めたコメント。書類IDは `{videoId}_{messageId}` で、二度読んでも増えない。 */
const MSGS = db.collection("streamChatMessages");
/** 配信1本ぶんの栞と数。**ここの `next` が取り逃さない仕組みの芯。** */
const RUNS = db.collection("streamChatRuns");
/** 鍵の置き場。アラートボックスとルーレットが使っているのと同じ。 */
const USERS = db.collection("islandUsers");
/**
 * 最後に起きたときの結果。**書類は1枚だけ。**
 *
 * 溜めたものではなく、**ここが生きているかどうかの札**。`RUNS` に混ぜると
 * 切り抜き(`clip_cuts`)が配信1本として数えてしまうので、置き場を分ける。
 *
 * なぜ要るか。この関数は5分おきに勝手に動くので、**壊れても誰も気づかない。**
 * 気づくには Cloud Logging が要るが、そこは権限が足りず 403 で読めない
 * (#236 があやと待ち)。実際それで、2026-09-10 の配信を丸ごと取り逃した。
 * Firestore を数えても「0件」しか分からず、そこから先があてずっぽうになる。
 * 札を1枚置いておけば、ログが読めなくても `firestore_read` で理由まで分かる。
 */
const HEALTH = db.collection("streamChatHealth");

/** 相手が黙ったときに、こちらが道連れにならないための打ち切り。 */
const TIMEOUT_MS = 10000;
/** Firestore の1バッチの上限は 500。余裕を持たせる。 */
const BATCH = 400;
/** 1回で読むページ数の上限。**長い配信の取りこぼしをここで吸収する。** */
const MAX_PAGES = 8;

/** 溜める1件。 */
type Msg = {
  videoId: string;
  messageId: string;
  at: number;
  text: string;
  channelId: string;
  name: string;
  /** `textMessageEvent` などの生の種類。スパチャを後から選り分けるため */
  kind: string;
};

/**
 * YouTube が断ってきたときの例外。**ステータスを持たせてある。**
 *
 * 前は `Error` に文字で埋めていたので、呼んだ側が 401（トークンが死んで
 * いる。取り直せば直る）と、それ以外（取り直しても直らない）を区別できず、
 * どちらも「配信を探せません」で黙って帰っていた。
 */
class YtError extends Error {
  /**
   * @param {number} status YouTube が返した HTTP ステータス
   * @param {string} path 叩いた先
   */
  constructor(readonly status: number, readonly path: string) {
    super(`${path} ${status}`);
    this.name = "YtError";
  }
}

/**
 * YouTube を叩く。**Doneru のトークンで。**
 * @param {string} path `liveBroadcasts` など
 * @param {Record<string, string>} qs 問い合わせ
 * @param {string} at アクセストークン
 * @return {Promise<any>} 返事
 */
async function yt(
  path: string,
  qs: Record<string, string>,
  at: string,
): Promise<Record<string, unknown>> {
  const ctl = new AbortController();
  const stop = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const url =
      `https://www.googleapis.com/youtube/v3/${path}?` +
      new URLSearchParams(qs).toString();
    const res = await fetch(url, {
      signal: ctl.signal,
      headers: {Authorization: `Bearer ${at}`},
    });
    if (!res.ok) throw new YtError(res.status, path);
    return (await res.json()) as Record<string, unknown>;
  } finally {
    clearTimeout(stop);
  }
}

/**
 * トークンを1つ持って、**401 のときだけ取り直す**入れ物。
 *
 * ## ここが、コメントが1件も溜まらなかった理由
 *
 * **Doneru は、こちらから頼まない限り前に配ったものを配り続ける。**
 * `widget/token` はいつでも 200 を返すが、中身は前に発行したままの
 * アクセストークンで、配信していない時間が続くと期限を過ぎたまま残る。
 * 実測では「316分前に切れている」ものが返ってきた。
 *
 * 取り直させる口（`widget/youtube/refresh`）は前からあって、OBS に出して
 * いるアラートボックスは**ブラウザから**それを叩くので生き返る。
 * ところが5分おきに勝手に動くこちらには、取り直させる人が誰もいなかった。
 * 結果、`liveBroadcasts` が毎回 401 を返し、「配信を探せません」と書いて
 * 帰る、を延々くり返していた（`streamChatRuns` が0件だったのはこれ）。
 *
 * だから **401 を見たら1度だけ取り直して、同じ問い合わせをやり直す。**
 * 2度目も 401 なら、それは Doneru と YouTube の繋ぎ直しが要るという
 * ことなので、こちらでは直せない。投げて、札に理由を残す。
 */
class Token {
  private at = "";
  private refreshed = false;

  /** @param {string} key Doneru のアラートボックスの鍵 */
  constructor(private readonly key: string) {}

  /** いま持っているトークン。無ければもらってくる。 */
  private async get(): Promise<string> {
    if (!this.at) this.at = (await doneruYoutubeToken(this.key)).at;
    return this.at;
  }

  /**
   * YouTube を叩く。401 なら**1度だけ**取り直してやり直す。
   * @param {Function} run トークンを受け取って叩く中身
   * @return {Promise<T>} 叩いた結果
   */
  async call<T>(run: (at: string) => Promise<T>): Promise<T> {
    try {
      return await run(await this.get());
    } catch (e) {
      const dead = e instanceof YtError && e.status === 401;
      if (!dead || this.refreshed) throw e;
      /* 取り直しは1回だけ。ここを回数無制限にすると、繋ぎが切れている
         あいだ5分おきに Doneru を叩き続けることになる。 */
      this.refreshed = true;
      logger.info("collectLiveChat: トークンが古いので取り直す");
      await doneruYoutubeRefreshToken(this.key);
      this.at = "";
      return await run(await this.get());
    }
  }
}

/** いま配信中の1本。していなければ null。 */
type Live = {videoId: string; liveChatId: string};

/**
 * いま配信中かを見る。**していなければ、ここで終わる。**
 *
 * アラートボックスと同じ順（`liveBroadcasts` → `videos`）で引く。
 * `liveBroadcasts` が `liveChatId` を持っていないことがあるので、
 * そのときだけ `videos` に聞き直す。
 * @param {Token} tok トークンの入れ物
 * @return {Promise<Live | null>} 配信中の1本
 */
async function findLive(tok: Token): Promise<Live | null> {
  const b = await tok.call((at) => yt(
    "liveBroadcasts",
    {part: "id,snippet,status", broadcastStatus: "active", maxResults: "1"},
    at,
  ));
  const item = (b.items as Array<Record<string, never>> | undefined)?.[0];
  if (!item) return null;
  const videoId = String(item.id ?? "");
  const snip = (item.snippet ?? {}) as Record<string, unknown>;
  let liveChatId = String(snip.liveChatId ?? "");
  if (!liveChatId && videoId) {
    const v = await tok.call((at) => yt(
      "videos",
      {part: "liveStreamingDetails", id: videoId},
      at,
    ));
    const vi = (v.items as Array<Record<string, never>> | undefined)?.[0];
    const d = (vi?.liveStreamingDetails ?? {}) as Record<string, unknown>;
    liveChatId = String(d.activeLiveChatId ?? "");
  }
  if (!videoId || !liveChatId) return null;
  return {videoId, liveChatId};
}

/** 1回の起動で読めたぶん。 */
type Drained = {added: number; next: string};

/**
 * 栞から先を読んで、溜める。
 *
 * **1回の起動で複数ページ読む。** 5分ぶんが200件を超えることがあり、
 * 1ページで打ち切ると次の回まで栞が進まない。ページが尽きるか
 * `MAX_PAGES` に当たるまで進める。
 * @param {Live} live 配信中の1本
 * @param {Token} tok トークンの入れ物
 * @param {string} from 前回の栞
 * @return {Promise<Drained>} 足した数と次の栞
 */
async function drain(
  live: Live,
  tok: Token,
  from: string,
): Promise<Drained> {
  let token = from;
  let added = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const qs: Record<string, string> = {
      liveChatId: live.liveChatId,
      part: "snippet,authorDetails",
      maxResults: "200",
    };
    if (token) qs.pageToken = token;
    const r = await tok.call((at) => yt("liveChatMessages", qs, at));

    const items = (r.items as Array<Record<string, never>> | undefined) ?? [];
    const rows: Msg[] = [];
    for (const m of items) {
      const s = (m.snippet ?? {}) as Record<string, unknown>;
      const a = (m.authorDetails ?? {}) as Record<string, unknown>;
      const text = String(s.displayMessage ?? "");
      const messageId = String(m.id ?? "");
      if (!messageId || !text) continue;
      rows.push({
        videoId: live.videoId,
        messageId,
        at: s.publishedAt ? Date.parse(String(s.publishedAt)) : 0,
        text,
        channelId: String(a.channelId ?? ""),
        name: String(a.displayName ?? ""),
        kind: String(s.type ?? ""),
      });
    }

    for (let i = 0; i < rows.length; i += BATCH) {
      const part = rows.slice(i, i + BATCH);
      const batch = db.batch();
      /* **書類IDを決め打ちにしてある**ので、同じ回を二度読んでも増えない。
         落ちた回のあとに読み直しても安全。 */
      part.forEach((v) =>
        batch.set(MSGS.doc(`${v.videoId}_${v.messageId}`), v));
      await batch.commit();
    }
    added += rows.length;

    const next = String(r.nextPageToken ?? "");
    /* 栞が進まなくなったら、そこが「いまのところ最後」。次の回に回す。 */
    if (!next || next === token) {
      token = next || token;
      break;
    }
    token = next;
    if (items.length === 0) break;
  }
  return {added, next: token};
}

/**
 * 5分おきに起きて、配信中ならコメントを溜める。
 *
 * **配信していなければ、YouTube を1回叩いて終わる。**
 */
export const collectLiveChat = onSchedule(
  {schedule: "every 5 minutes", timeZone: "Asia/Tokyo"},
  async () => {
    /* 最後に起きたときの結果を1枚だけ残す。**ログが読めなくても分かるように。**
       ここで投げない（札が書けないことで取り込みを止めない）。 */
    const note = async (step: string, detail = "") => {
      try {
        await HEALTH.doc("collectLiveChat").set(
          {step, detail, at: Date.now()},
          {merge: true},
        );
      } catch (e) {
        logger.warn("collectLiveChat: 札を書けません", String(e));
      }
    };

    /* 鍵はオーナーのところに1つ。無ければ何もしない（異常ではない）。 */
    const owner = await USERS.where("admin", "==", true).limit(1).get();
    const key = String(owner.docs[0]?.data()?.doneruKey ?? "");
    if (!key) {
      logger.info("collectLiveChat: Doneru の鍵がまだ入っていません");
      await note("鍵がない");
      return;
    }

    const tok = new Token(key);

    let live: Live | null = null;
    try {
      /* トークンを取るのも配信を探すのも、`Token` の中で1度に起きる。
         **401 はここで取り直されるので、もう素通りしない。** */
      live = await findLive(tok);
    } catch (e) {
      const status = e instanceof YtError ? e.status : 0;
      logger.warn("collectLiveChat: 配信を探せません", String(e));
      /* 取り直しても 401 なら、Doneru と YouTube の繋ぎが切れている。
         **それはあやとがブラウザで繋ぎ直すしかない。** 札にそう書く。 */
      await note(
        status === 401 ? "取り直しても 401（Doneru の繋ぎ直しが要る）" :
          "配信を探せない",
        String(e),
      );
      return;
    }
    if (!live) {
      logger.info("collectLiveChat: いま配信していません");
      await note("配信していない");
      return;
    }

    const runRef = RUNS.doc(live.videoId);
    const run = await runRef.get();
    const from = String(run.data()?.next ?? "");
    const now = Date.now();

    try {
      const {added, next} = await drain(live, tok, from);
      await runRef.set(
        {
          videoId: live.videoId,
          liveChatId: live.liveChatId,
          next,
          count: (Number(run.data()?.count) || 0) + added,
          startedAt: run.exists ? run.data()?.startedAt ?? now : now,
          lastPolledAt: now,
          done: false,
        },
        {merge: true},
      );
      const total = (Number(run.data()?.count) || 0) + added;
      logger.info(
        `collectLiveChat: ${live.videoId} に ${added}件 足した` +
          `（のべ ${total}件）`,
      );
      await note("溜めた", `${live.videoId} のべ${total}件`);
    } catch (e) {
      /* **栞を進めずに終わる。** 次の回が同じところから読み直す。 */
      logger.warn("collectLiveChat: 読めませんでした", String(e));
      await note("読めなかった", String(e));
    }
  },
);
