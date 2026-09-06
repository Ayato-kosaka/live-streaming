/**
 * Doneru が発行している YouTube のアクセストークンを、サーバー側で取る。
 *
 * ## なぜこれが要るか
 *
 * 配信のコメントを読む `liveChatMessages.list` は**1回5単位**で、
 * 既定の枠は1日10,000単位。こちらの OAuth（`youtubeClient.ts`）で読むと、
 * ルーレットのコントローラーを開けっぱなしにしただけで枠が減っていく。
 * 30分ごとの定期コメントや、月末の集計と同じ枠を食い合う。
 *
 * **割り当ては、トークンを発行したプロジェクトに付く。** Doneru が出した
 * トークンで読めば、減るのは Doneru 側の枠で、こちらのぶんは減らない。
 * 配信の OBS に出しているアラートボックス（`app/alertbox`）は前からこの形。
 *
 * ## 鍵をブラウザに渡さない
 *
 * アラートボックスは OBS の URL に `?key=` で鍵を載せていて、鍵を持つ人は
 * 誰でも上の2つの口（どちらも `cors: true` で公開）を叩ける。
 * ルーレットのコントローラーは静的書き出しの面なので、同じことをすると
 * **鍵が `dist/` に焼かれて誰でも読める。**
 *
 * だから鍵は Firestore（`islandUsers/{uid}.doneruKey`）に置いたままにして、
 * ここで鍵を使い、**ブラウザには寿命の短いアクセストークンだけを返す。**
 * `/fund` が Doneru の goal key をここに置いたままにしているのと同じ考え。
 */

import {logger} from "firebase-functions";

/** Doneru のトークンの口。`doneruToken.ts` が中継しているのと同じ先。 */
const TOKEN_URL = "https://api.doneru.jp/widget/token";
/** Doneru の取り直しの口。`doneruYoutubeRefresh.ts` と同じ先。 */
const REFRESH_URL = "https://api.doneru.jp/widget/youtube/refresh";
/** 相手先が黙ったときに、こちらが道連れにならないための打ち切り。 */
const TIMEOUT_MS = 10000;

/** ブラウザに返すぶん。**鍵は入れない。** */
export type YoutubeToken = {
  /** アクセストークン。これで googleapis を直に叩く */
  at: string;
  /** チャンネルID。取れないこともある */
  channel: string;
  /** 期限。**必ずミリ秒の epoch にそろえてある** */
  expiresAt: number;
};

/**
 * Doneru が返してくる `exp` を、ミリ秒の epoch にそろえる。
 *
 * **単位が仕様として決まっていない。** アラートボックスの
 * `YouTubeConnector` にも「秒なら *1000 が必要」という但し書きが
 * 残ったままで、どちらで来ているのか確かめられていない。
 * 桁で見分けて、分からなければ短めに倒す（早く取り直すぶんには害がない）。
 * @param {unknown} raw Doneru の `exp`
 * @return {number} ミリ秒の epoch
 */
function expiryMs(raw: unknown): number {
  const n = Number(raw);
  const now = Date.now();
  if (!Number.isFinite(n) || n <= 0) return now + 30 * 60 * 1000;
  // 1e12 を超えていればミリ秒の epoch（2001年以降）
  if (n > 1e12) return n;
  // 1e9 を超えていれば秒の epoch（2001年以降）
  if (n > 1e9) return n * 1000;
  // それ以下は「あと何秒」とみなす
  return now + n * 1000;
}

/**
 * Doneru から YouTube のアクセストークンを1つもらう。
 * @param {string} key Doneru のアラートボックスの鍵
 * @return {Promise<YoutubeToken>} トークン
 */
export async function doneruYoutubeToken(
  key: string,
): Promise<YoutubeToken> {
  const ctl = new AbortController();
  const stop = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const url =
      `${TOKEN_URL}?key=${encodeURIComponent(key)}&type=alertbox`;
    const res = await fetch(url, {signal: ctl.signal});
    if (!res.ok) {
      throw new Error(`doneru token ${res.status}`);
    }
    const j = (await res.json()) as {
      youtube?: {at?: string; channel?: string; exp?: number};
    };
    const at = String(j.youtube?.at ?? "");
    if (!at) throw new Error("doneru token empty");
    return {
      at,
      channel: String(j.youtube?.channel ?? ""),
      expiresAt: expiryMs(j.youtube?.exp),
    };
  } finally {
    clearTimeout(stop);
  }
}

/**
 * Doneru 側でトークンを取り直させる。
 *
 * 401 が返ったときに1回だけ呼ぶ。**失敗しても投げない。** 取り直しが
 * できなくても、次に `doneruYoutubeToken` を呼べば新しいものが来る
 * ことがあるので、ここで止めない。
 * @param {string} key Doneru のアラートボックスの鍵
 * @return {Promise<boolean>} 取り直せたか
 */
export async function doneruYoutubeRefreshToken(
  key: string,
): Promise<boolean> {
  const ctl = new AbortController();
  const stop = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(REFRESH_URL, {
      method: "POST",
      signal: ctl.signal,
      headers: {"content-type": "application/json", "accept": "*/*"},
      body: JSON.stringify({key, type: "alertbox", version: "1.0.0"}),
    });
    if (!res.ok) {
      logger.warn(`doneru refresh ${res.status}`);
      return false;
    }
    return true;
  } catch (e) {
    logger.warn("doneru refresh failed", String(e));
    return false;
  } finally {
    clearTimeout(stop);
  }
}
