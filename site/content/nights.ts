/**
 * 配信の時間の言い方。**画面に時刻を直接書かない。ここから取る。**
 *
 * `content/voice.ts` から分けてあるのは、`content/site.ts` からも使うから。
 * 言葉を voice.ts に置くと site.ts ⇄ voice.ts の輪ができて、
 * 読み込む順で片方が空になる。
 */

import { looseStartNow } from "./chapters";

const FIXED = {
  /** 文の中に埋めこむ、いちばん短い形 */
  bare: "毎晩22時",
  /** 押しどころの添え字 */
  tile: "毎晩22時・YouTube",
  /** 島の「配信」の札 */
  types: "毎晩22時。5つの型でやってる",
  /** 島のなかぜんぶ（`/all`）の棚の見出し */
  typesLong: "毎晩22時。5つのうちどれかをやっている",
  /** 外へ出る口の添え字 */
  link: "毎晩22時から生配信",
  /** 表紙の目印 */
  eyebrow: "毎晩22時、世界のどこかから生放送",
  /** 島の足もと */
  foot: "あやと島 — あやとと愉快な仲間達。毎晩22時、世界のどこかから生放送しています。",
  /** 住んでる人（`/friends`）の1行 */
  friends: "毎晩22時に集まってくる、愉快な仲間達。",
  /** 配信（`/streams`）の1行 */
  streams: "毎晩22時から、世界のどこかで生放送。やってることは大きく5つ。",
  /** いまどこ（`/now`）の1行 */
  now: "いまいる国と、今週やること。配信のある日は、22時までの残りもここに出る。",
  /** あやとのこと（`/about`）の年表、いちばん下の行 */
  hereNow: "いまここ。毎晩22時から配信している",
  /** あやとのこと（`/about`）の紹介文 */
  profile: "2024年9月11日に日本を出て、いまは毎晩22時、旅先から生配信している。",
  /** いまどこの、まだ何も読めていないときの一言 */
  word: "トビリシに戻ってきて、毎晩22時から配信してます。",
  /** 「いまどこ」への口の添え字。カウントダウンがあることを言っている */
  nowLink: "今夜の配信まであと何時間か、今週やること",
  /** 見にいく章の見出し */
  tonight: "今夜も22時から",
  /** その下の1行 */
  span: "日本時間の22時から、だいたい2〜3時間。",
} as const;

const TRIP: Record<keyof typeof FIXED, string> = {
  bare: "毎日12時間くらい",
  tile: "毎日12時間くらい・YouTube",
  types: "毎日12時間くらい。5つの型でやってる",
  typesLong: "毎日12時間くらい。5つのうちどれかをやっている",
  link: "旅のあいだは1日12時間くらい",
  eyebrow: "旅のあいだは1日12時間くらい、世界のどこかから生放送",
  foot: "あやと島 — あやとと愉快な仲間達。旅のあいだは1日12時間くらい、世界のどこかから生放送しています。",
  friends: "配信のたびに集まってくる、愉快な仲間達。",
  streams: "旅のあいだは1日12時間くらい、世界のどこかで生放送。やってることは大きく5つ。",
  now: "いまいる国と、今週やること。",
  hereNow: "ここから北欧へ出発した",
  profile: "2024年9月11日に日本を出て、いまは旅先から生配信している。",
  word: "旅の途中から、1日12時間くらい配信してます。",
  nowLink: "いまいる国と、今週やること",
  tonight: "旅のあいだも配信してます",
  span: "休みの日をのぞいて、1日12時間くらい。",
};

export type NightWord = keyof typeof FIXED;

/**
 * いまの言い方。**画面が出てから呼ぶこと。**
 * 焼き込むと、旅に出た日から17日ぶん「毎晩22時」と言い続ける。
 */
export function nights(now: Date = new Date()): Record<NightWord, string> {
  return looseStartNow(now) ? TRIP : FIXED;
}

/**
 * 焼いた HTML に時刻を入れないための印。
 *
 * データの中に文そのものを置くと、静的書き出しのときに焼かれてしまう。
 * 代わりに「あとで差し替える」という印だけを置いて、`components/ui/Say.tsx`
 * が画面の出たあとに本文へ替える。**印の付いていない文はそのまま出る。**
 */
export const say = (k: NightWord) => `\u00a7${k}`;

/** 差し替えの印が付いた文か。 */
export const marked = (t: string) => t.startsWith("\u00a7");

/** 印の付いた文を、いまの言い方に替える。印が無ければそのまま返す。 */
export function said(t: string, now: Date = new Date()): string {
  if (!t.startsWith("\u00a7")) return t;
  return nights(now)[t.slice(1) as NightWord] ?? t;
}

