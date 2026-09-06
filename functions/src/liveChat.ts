import {logger} from "firebase-functions";
import {youtube, oauth2Client} from "./youtubeClient";

/**
 * 配信中のライブチャットを読む・書くところ。
 *
 * **ここに集めた理由。** 30分ごとの定期コメント(commentOnLive)と、
 * ルーレット(islandApi の /roulette)が、どちらも「いま配信中の
 * liveChatId を引いてくる」を必要とする。2か所に書くと、配信の探しかたが
 * 片方だけ直る日が来る。
 *
 * **YouTube の1日の割り当てを食う。** liveChatMessages.list は1回5単位で、
 * 既定の枠は1日10,000単位。5秒ごとに読むと1時間で3,600単位になる。
 * だから **API が返してくる pollingIntervalMillis より速く読まない**し、
 * 配信を探すほう(liveBroadcasts.list)は使い回す。
 */

/** 配信の探し直しを控える時間。配信は1日1回しか始まらないので長めでよい。 */
const CHAT_TTL_MS = 5 * 60 * 1000;
/** いま配信中のチャット。null は「探したが配信していなかった」。 */
let cached: {id: string | null; at: number} = {id: null, at: 0};

/**
 * いま配信中のライブチャットの id。配信していなければ null。
 * @param {boolean} fresh 使い回さずに探し直すか
 * @return {Promise<string | null>} liveChatId
 */
export async function liveChatId(fresh = false): Promise<string | null> {
  if (!fresh && Date.now() - cached.at < CHAT_TTL_MS) return cached.id;
  /* トークンを取り直す。googleapis は必要なら自動で更新するが、
     30分ごとのコメントが長くこの形で動いているので、その順序を変えない。 */
  await oauth2Client.getAccessToken();
  const live = await youtube.liveBroadcasts.list({
    part: ["id", "snippet", "status"],
    broadcastStatus: "active",
  });
  const id = live.data.items?.[0]?.snippet?.liveChatId ?? null;
  cached = {id, at: Date.now()};
  return id;
}

/** チャットの1行。名前とアイコンは、コントローラーに出すぶんだけ。 */
export type ChatLine = {
  id: string;
  name: string;
  text: string;
  icon: string;
  channelId: string;
  at: number;
};

/** チャットを1回ぶん読んだ結果。 */
export type ChatPage = {
  lines: ChatLine[];
  /** 次に読むときに渡す栞。ここから先が「まだ読んでいないぶん」になる */
  next: string;
  /** 次に読むまで空ける時間(ms)。YouTube が言ってきた値 */
  wait: number;
  /** 配信していなければ false。呼んだ側は「配信していない」と出す */
  live: boolean;
};

/**
 * ライブチャットを1回ぶん読む。
 *
 * **栞(pageToken)を持つのは呼んだ側。** ここは受け取ったところから読んで、
 * 次の栞を返すだけにする。ルーレットは「コントローラーを起動してから」の
 * ぶんだけを流すので、最初の1回は中身を捨てて栞だけを取る使いかたをする。
 * @param {string | undefined} pageToken 前回返した栞
 * @return {Promise<ChatPage>} 読めたぶん
 */
export async function readLiveChat(pageToken?: string): Promise<ChatPage> {
  const chat = await liveChatId();
  if (!chat) return {lines: [], next: "", wait: 15000, live: false};
  const res = await youtube.liveChatMessages.list({
    liveChatId: chat,
    part: ["snippet", "authorDetails"],
    pageToken: pageToken || undefined,
    maxResults: 200,
  });
  const lines: ChatLine[] = [];
  for (const m of res.data.items ?? []) {
    const text = m.snippet?.displayMessage ?? "";
    if (!text) continue;
    lines.push({
      id: m.id ?? "",
      name: m.authorDetails?.displayName ?? "",
      text,
      icon: m.authorDetails?.profileImageUrl ?? "",
      channelId: m.authorDetails?.channelId ?? "",
      at: m.snippet?.publishedAt ? Date.parse(m.snippet.publishedAt) : 0,
    });
  }
  return {
    lines,
    next: res.data.nextPageToken ?? "",
    /* 5秒より速くは読まない。YouTube の言う間隔がそれより短くても、
       こちらは1日の割り当てのほうが先に尽きる。 */
    wait: Math.max(res.data.pollingIntervalMillis ?? 5000, 5000),
    live: true,
  };
}

/**
 * 配信のチャットに1行書く。
 *
 * 配信していなければ何もせずに false を返す。**投げられなかったことを
 * 例外にしない。** 呼ぶ側（定期コメントもルーレットも）は、配信が
 * 終わっていたら黙って諦めるのが正しい。
 * @param {string} text 投げる文
 * @return {Promise<boolean>} 投げられたか
 */
export async function sayOnLive(text: string): Promise<boolean> {
  const chat = await liveChatId();
  if (!chat) {
    logger.info("ライブ配信は現在行われていません。");
    return false;
  }
  await youtube.liveChatMessages.insert({
    part: ["snippet"],
    requestBody: {
      snippet: {
        liveChatId: chat,
        type: "textMessageEvent",
        textMessageDetails: {messageText: text},
      },
    },
  });
  return true;
}
