/**
 * **「そのチャンネルは、本当にその人のものか」を YouTube に訊いて確かめる。**
 *
 * ## なぜ要るか
 *
 * `POST /me` は長いあいだ、**画面が送ってきた `channelId` をそのまま
 * `islandUsers/{uid}.channelId` に書いていた。** 画面は
 * `youtube/v3/channels?mine=true` を自分で叩いて取っていたが、
 * **サーバーは一度もそれを確かめていなかった。**
 *
 * チャンネルIDは公開の値なので、島にログインできる人なら誰でも
 * 他人のIDを名乗れる。そして `islandUsers.channelId` を鍵にして読む口は
 * 6か所ある:
 *
 * - `cards.ts` の `GET /cards/mine` … その人のカードが全部返る
 *   （どの日に投げたか・絵・名乗り）
 * - `stampLine.ts` の `POST /stampline/mine` …
 *   **`islandStampLine.lines` を上書きできる**（2026-10-14 に口ごと閉じた。#860）。
 *   `island-db.md` 3.1 が「戻らない。人の字」と書いている正本
 * - `islandApi.ts` の `listResidents()` …
 *   島の名札に、その人のキャラクターの絵が出る
 *
 * **3つとも「送られてきた値を信じず `islandUsers` から引き直す」**という
 * 正しい形で書いてあった。引き直した先が、その人が前に自分で名乗った値
 * だったので、関所が1段ぶん空回りしていた。
 *
 * ## どう直したか — `byOwner` と同じ形
 *
 * `islandApi.ts` の `byOwner` は「`/me` の admin ではなく、ここでもう一度
 * 見る」と書いて、実際に `ownerUid()` をもう一度通している。ここも同じ:
 * **画面には合言葉（Google の OAuth アクセストークン）だけ送らせて、
 * `channels?mine=true` は、この箱が自分で引く。**
 *
 * `mine=true` は**トークンの持ち主のチャンネルしか返さない。**
 * だからチャンネルIDを body で受け取る必要がそもそも無くなる。
 * 入口から「名乗る」という言葉が消えるのがこの直しの要点で、
 * 「名乗った値を検算する」ではない（検算だと、検算を1か所忘れた日に戻る）。
 *
 * ## 取れなかったときは、書かない
 *
 * トークンが腐っていても、YouTube が落ちていても、**返すのは `null` ひとつ。**
 * 呼ぶ側は `null` のとき `channelId` に1バイトも書かない——**消しもしない。**
 * すでに結んである人は、そのまま結んだままになる（`merge` で書くので）。
 *
 * **2つを区別しない**のは、区別しても呼ぶ側のすることが変わらないから。
 * 「トークンが嘘」でも「YouTube が落ちた」でも、いま分かっているのは
 * 「このチャンネルがこの人のものだと確かめられなかった」だけで、
 * そこで書けば、確かめていない値を書くことになる。
 */

import {logger} from "firebase-functions";
import {clean} from "./streamEvents";

/** Google の OAuth アクセストークンの長さ。これを超える字は受け取らない。 */
export const MAX_YT_TOKEN = 4096;

/** YouTube を待つ時間。ログインの途中なので、長く待たない。 */
export const TIMEOUT_MS = 6000;

/** 訊きに行く先。**`mine=true` 以外を付けない**（他人を引ける形にしない）。 */
export const MINE_URL =
  "https://www.googleapis.com/youtube/v3/channels" +
  "?part=snippet&mine=true&maxResults=1";

/** ハンドルの長さ。`@` を足して31（`islandApi.ts` の `MAX_HANDLE_LEN`）。 */
const MAX_HANDLE = 31;

/** 確かめの取れたチャンネル1つぶん。 */
export type OwnedChannel = {
  /** YouTube のチャンネルID。**YouTube がトークンから返したもの** */
  channelId: string;
  /** `@…`。無ければ空 */
  handle: string;
  /** チャンネル名。無ければ空 */
  title: string;
  /** アイコンの URL。無ければ空 */
  thumbnail: string;
};

/**
 * `customUrl` を `@…` の形にそろえる。
 * @param {unknown} v YouTube が返した `customUrl`
 * @return {string} `@…`。無ければ空
 */
const handleOf = (v: unknown): string => {
  const s = clean(v, MAX_HANDLE).replace(/^[/@]+/, "");
  return s ? `@${s}`.slice(0, MAX_HANDLE) : "";
};

/** 差し替えられるようにしてある（確かめのときだけ渡す）。 */
export type Fetcher = (
  url: string,
  init: {headers: Record<string, string>; signal: AbortSignal},
) => Promise<{ok: boolean; status: number; json: () => Promise<unknown>}>;

/**
 * アクセストークンの持ち主のチャンネルを、YouTube に訊く。
 *
 * **ここが、この島で `islandUsers.channelId` に値が入る唯一の道。**
 * ほかに道を作らない——1本なら、ここを直せば全部直る。
 * @param {unknown} accessToken 画面から来た Google の OAuth アクセストークン
 * @param {Fetcher} [doFetch] 差し替え用。既定は global の `fetch`
 * @return {Promise<OwnedChannel | null>} 確かめの取れたチャンネル。取れなければ null
 */
export async function ownedChannel(
  accessToken: unknown,
  doFetch?: Fetcher,
): Promise<OwnedChannel | null> {
  const token = clean(accessToken, MAX_YT_TOKEN);
  /* **空なら、叩きに行かない。** `POST /me` は空の body でも叩かれる口
     （画面が開くたびに呼ぶ `loadMe`）なので、ここが毎回 YouTube へ
     往復すると、島を開くだけで割り当てを削ることになる。 */
  if (!token) return null;
  /* 改行や空白が混ざった字をそのまま `Authorization` に入れると、
     ヘッダが壊れて何が起きるか読めない。**形で落とす。** */
  if (!/^[A-Za-z0-9._~+/=-]+$/.test(token)) return null;

  const go = doFetch ?? (fetch as unknown as Fetcher);
  const ctl = new AbortController();
  const stop = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await go(MINE_URL, {
      headers: {authorization: `Bearer ${token}`},
      signal: ctl.signal,
    });
    if (!res.ok) {
      /* **トークンそのものを1文字も出さない。** このリポジトリは公開で、
         Actions のログも誰でも読める。出すのは状態だけ。 */
      logger.warn("youtube mine failed", res.status);
      return null;
    }
    const j = (await res.json()) as {
      items?: {
        id?: unknown;
        snippet?: {
          customUrl?: unknown;
          title?: unknown;
          thumbnails?: {default?: {url?: unknown}; medium?: {url?: unknown}};
        };
      }[];
    };
    const it = j.items?.[0];
    const channelId = clean(it?.id, 64);
    /* YouTube のチャンネルは必ず `UC` で始まる24文字。**形で確かめる。**
       ここを緩めると、`items` が空のときに空文字が「確かめの取れた
       チャンネル」として通る。 */
    if (!/^UC[A-Za-z0-9_-]{22}$/.test(channelId)) {
      logger.warn("youtube mine: no channel");
      return null;
    }
    const sn = it?.snippet ?? {};
    return {
      channelId,
      handle: handleOf(sn.customUrl),
      title: clean(sn.title, 64),
      thumbnail: clean(
        sn.thumbnails?.medium?.url ?? sn.thumbnails?.default?.url,
        300,
      ),
    };
  } catch (e) {
    /* 落ちてもログインは通す。**結んでいない状態になるだけで、
       いま結んである値は消えない**（呼ぶ側が null のとき書かない）。 */
    logger.warn("youtube mine error", String(e));
    return null;
  } finally {
    clearTimeout(stop);
  }
}
