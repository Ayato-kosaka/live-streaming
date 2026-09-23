/* あやと島の口を叩くところ（#305 で GAS を落とした）。

   ここには長いあいだ、スプレッドシートを読み書きする道具が3つあった
   （`getTable` / `getById` / `insert`）。表を読むのも書くのも
   `EXPO_PUBLIC_GAS_API_URL` 1本で、**それは書き出しに焼かれる**ので、
   URL を知っていれば誰でも全件読めた。

   いまは名簿もスパチャも貯金箱も、合言葉の要るあやと島の口を通る。 */

import { AlertboxCharacter, SuperChatNotification } from "./types";

/* ---------------- あやと島ごしの口（#180） ----------------

   Doneru の鍵を書き出しに焼くのをやめたので、鍵が要るものは
   ぜんぶここを通す。OBS の URL に載っている 32 桁の合言葉（`k`）を
   渡すと、サーバーが持っている鍵を使って返してくれる。

   下の `getDoneruToken` / `refreshDoneruYoutubeToken` は、鍵を
   引数に取るので**もう呼べない**。消していないのは、Doneru の口の
   形（type=alertbox・version=1.0.0）がここにしか書き残っていないため。
*/

/** あやと島の口。OBS が開くのと同じ生い立ちなので、相対で足りる。 */
const ISLAND_API = "/island-api";

/**
 * 投げ銭の通知が流れてくる WebSocket の URL をもらう。
 * @param {string} k OBS の URL に載せた 32 桁の合言葉
 * @return {Promise<string>} wss:// で始まる URL
 */
export async function getAlertboxWss(k: string): Promise<string> {
  const res = await fetch(`${ISLAND_API}/alertbox/${k}/wss`);
  if (!res.ok) {
    throw new Error(`Failed to fetch alertbox wss: ${res.status}`);
  }
  const data = await res.json();
  const wss = String(data?.wss ?? "");
  if (!wss.startsWith("wss://")) {
    throw new Error("Invalid alertbox wss response");
  }
  return wss;
}

/**
 * キャラクターの名簿をもらう。**スプレッドシートの代わり。**
 *
 * 前は GAS 越しに Viewers 表を全件読んでいた（`getTable("Viewers")`）。
 * 原本を Firestore に移したので（#284）、こちらから取る。
 *
 * **投げ銭が来るたびに引きに行かない。** アラートは1秒が惜しいので、
 * 起動のときに全員ぶん受け取って、名前を当てるのは手元でやる
 * （表を読んでいたときと同じ形。`matching.utils.ts` はそのまま使える）。
 *
 * **合言葉が要る。** 名前の入った名簿なので、誰でも読める口には置いていない。
 * 移す前のスプレッドシートは URL を知っていれば誰でも全件読めたので、
 * ここは閉じるほうに変わっている。
 * @param {string} k OBS の URL に載せた 32 桁の合言葉
 * @return {Promise<AlertboxCharacter[]>} 絵のある人ぜんぶ
 */
export async function getAlertboxCharacters(
  k: string
): Promise<AlertboxCharacter[]> {
  const res = await fetch(`${ISLAND_API}/alertbox/${k}/characters`);
  if (!res.ok) {
    throw new Error(`Failed to fetch alertbox characters: ${res.status}`);
  }
  const data = await res.json();
  const list = Array.isArray(data?.characters) ? data.characters : [];
  return list as AlertboxCharacter[];
}

/**
 * スパチャ1件を、豚の貯金箱の台帳に入れてもらう（#305）。
 *
 * 前はスプレッドシートの `SuperChats` へ1件ずつ足していた
 * （`insert("SuperChats", …)`）。表を消すと貯金箱が止まるので、
 * あやと島の台帳（`islandFundSuperChats`）へ移した。
 *
 * **同じ通知を2回投げても増えない。** 書類IDは通知のID（`LCC.…`）を
 * ほどいた26文字で、サーバー側が上書きにする。配信の途中で OBS を
 * 開き直しても、毎晩の掃除が BigQuery から同じものを拾っても、1件に潰れる。
 *
 * **本文（`message`）は送らない。** 貯金箱に要るのは額と誰かだけで、
 * 視聴者さんが書いた字を台帳に残す理由が無い（表には残っていた）。
 * @param {string} k OBS の URL に載せた 32 桁の合言葉
 * @param {SuperChatNotification} n 受け取った通知
 * @return {Promise<string>} 入った書類ID（26文字）
 */
export async function postAlertboxSuperchat(
  k: string,
  n: SuperChatNotification
): Promise<string> {
  const res = await fetch(`${ISLAND_API}/alertbox/${k}/superchat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: n.id,
      currency: n.currency,
      jpy: n.jpy,
      nickname: n.nickname,
      test: n.test,
    }),
  });
  if (!res.ok) {
    throw new Error(`Failed to post alertbox superchat: ${res.status}`);
  }
  const data = await res.json();
  return String(data?.id ?? "");
}

/**
 * 配信の豚の貯金箱に出す額をもらう（#305）。
 *
 * 前は GAS の `Goals` を直に読んでいた（`getById("Goals", …)`）。
 * **伸びるのは台帳だけになった**ので、表を読み続けると配信の豚が
 * 投げ銭で伸びなくなる。
 *
 * 誰でも読める `GET /island-api/fund` を使わないのは、あちらが CDN に
 * 5〜10分焼き付くから。配信の途中で開き直した豚が、10分古い額から
 * 数え直すことになる。
 * @param {string} k OBS の URL に載せた 32 桁の合言葉
 * @return {Promise<{currentAmount: number; targetAmount: number; label: string}>} 豚に出す3つ
 */
export async function getAlertboxFund(k: string): Promise<{
  currentAmount: number;
  targetAmount: number;
  label: string;
}> {
  const res = await fetch(`${ISLAND_API}/alertbox/${k}/fund`);
  if (!res.ok) {
    throw new Error(`Failed to fetch alertbox fund: ${res.status}`);
  }
  const data = await res.json();
  const currentAmount = Number(data?.currentAmount);
  const targetAmount = Number(data?.targetAmount);
  /* **読めなかったものを 0 にしない。** 0円の豚は、豚が出ないより悪い
     （`docs/island-standards.md` 10章）。投げて、呼んだ側に印を出させる。 */
  if (!Number.isFinite(currentAmount) || !Number.isFinite(targetAmount)) {
    throw new Error("Invalid alertbox fund response");
  }
  return { currentAmount, targetAmount, label: String(data?.label ?? "") };
}

/**
 * YouTube を読むための、寿命の短いトークンをもらう。
 *
 * **鍵は返ってこない。** スパチャを拾うのに要るのはトークンだけ。
 * @param {string} k OBS の URL に載せた 32 桁の合言葉
 * @param {boolean} refresh Doneru 側で先に取り直させるか（401 のとき）
 * @return {Promise<{at: string; channel: string; expiresAt: number}>} トークン
 */
export async function getAlertboxYoutubeToken(
  k: string,
  refresh = false
): Promise<{ at: string; channel: string; expiresAt: number }> {
  const res = await fetch(`${ISLAND_API}/alertbox/${k}/yt-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch alertbox token: ${res.status}`);
  }
  return res.json();
}

/**
 * Get doneruToken from Cloud Functions
 * @param key Donery alertbox key
 * @returns Token data
 */
export async function getDoneruToken(key: string): Promise<{
  youtube: {
    at: string;
    channel: string;
    exp: number;
  }
}> {
  const url = `https://donerutoken-3phus6cpxa-uc.a.run.app/doneruToken?type=alertbox&key=${key}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch doneruToken: ${response.statusText}`);
  }

  const data = await response.json();
  return data;
}

/**
 * Refresh Doneru YouTube token via Cloud Functions
 * @param key Doneru alertbox key
 * @param type Type parameter (default: "alertbox")
 * @param version Version parameter (default: "1.0.0")
 * @returns Refresh response
 */
export async function refreshDoneruYoutubeToken(
  key: string,
  type = "alertbox",
  version = "1.0.0"
): Promise<unknown> {
  const encodedKey = encodeURIComponent(key);
  const encodedType = encodeURIComponent(type);
  const encodedVersion = encodeURIComponent(version);
  const url = `https://doneruyoutuberefresh-3phus6cpxa-uc.a.run.app/doneruYoutubeRefresh?key=${encodedKey}&type=${encodedType}&version=${encodedVersion}`;
  const response = await fetch(url, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Failed to refresh Doneru YouTube token: ${response.statusText}`);
  }

  const data = await response.json();
  return data;
}