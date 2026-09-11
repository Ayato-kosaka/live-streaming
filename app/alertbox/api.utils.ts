// API utility functions for GAS and Cloud Functions

import { AlertboxCharacter, GASApiResponse } from "./types";

/**
 * Get data from a GAS table
 * @param table Table name (e.g., "Viewers", "Goals", "SuperChats")
 * @returns Response data
 */
export async function getTable<T>(table: string): Promise<GASApiResponse<T>> {
  const url = `${process.env.EXPO_PUBLIC_GAS_API_URL}?table=${table}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${table}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get a specific record by ID from a GAS table
 * @param table Table name
 * @param id Record ID
 * @returns Response data
 */
export async function getById<T>(
  table: string,
  id: string
): Promise<GASApiResponse<T>> {
  const url = `${process.env.EXPO_PUBLIC_GAS_API_URL}?table=${table}&id=${id}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${table} with id ${id}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Insert a record into a GAS table
 * @param table Table name
 * @param record Record to insert
 * @returns Response data
 */
export async function insert<T>(
  table: string,
  record: T
): Promise<GASApiResponse<unknown>> {
  const url = `${process.env.EXPO_PUBLIC_GAS_API_URL}?table=${table}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ record }),
  });

  if (!response.ok) {
    throw new Error(`Failed to insert into ${table}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get doneruAmount from Cloud Functions
 * @param key Donery goal key
 * @returns Amount as a number
 */
export async function getDoneruAmount(key: string): Promise<number> {
  const url = `https://doneruamount-3phus6cpxa-uc.a.run.app/doneruAmount?key=${key}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch doneruAmount: ${response.statusText}`);
  }

  const data = await response.json();
  const amount = Number(data.amount);

  if (isNaN(amount)) {
    throw new Error(`Invalid doneruAmount response: ${data}`);
  }

  return amount;
}

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