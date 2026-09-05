/**
 * 視聴者さんによる「他己紹介」。**手で書かない。**
 *
 * `python/build_voices.py` が配信のチャット（BigQuery）から候補を引いて、
 * `python/voices_picks.json` で選んだものを、このファイルに焼いている。
 * 直すときは元の2つを直して焼き直す（`docs/island-design.md` 「自動生成ファイル」）。
 *
 * **文章は1文字も直っていない。** 誤字も、全角カンマも、絵文字も、書かれたまま。
 * 島で絵文字を出していいのは、配信のタイトルの引用と、この文章だけ。
 *
 * **名前は入っていない。** 名前を出すかどうかは本人が決めるもので、
 * いまその許可の仕組みがログイン待ち。誰が書いたかは videoId と eventId で引き直せる。
 */
export type Voice = {
  /** 配信の日（JST） */
  date: string;
  /** その配信 */
  videoId: string;
  /** チャットのイベントID。あとで書いた人を引き直すための鍵 */
  eventId: string;
  /** 書かれたままの本文 */
  text: string;
};

export const VOICES: Voice[] = [
  { date: "2025-10-28", videoId: "xxQ4XafROrQ", eventId: "ChwKGkNMN252cGVVeDVBREZYalp3Z1FkYjBBU3l3", text: "新参者ですが、あやとさんのお人柄とイケメンぷりにファンになりました。これからもあやとさんの魅力一杯の配信を楽しませて下さいね" },
  { date: "2026-09-03", videoId: "5-1bHix5X1s", eventId: "ChwKGkNNdmQzX19IMHBZREZWSEtMUUFkREljQm9n", text: "あやとさんの人柄がいいんだね。" },
  { date: "2026-07-17", videoId: "Hc-z52fs108", eventId: "ChwKGkNLcVZ4Y2pvMlpVREZaX2V3Z1FkNXA4V1Bn", text: "あやとさん毎日だから感心してた　疲れないのかなと心配してた" },
  { date: "2026-07-17", videoId: "Hc-z52fs108", eventId: "ChwKGkNOS09oSnJwMlpVREZXX0N3Z1FkYlB3Sm93", text: "このアプリアヤトさんが作ったの？凄いな" },
  { date: "2026-02-11", videoId: "u2bIxRNKa6g", eventId: "ChwKGkNMS1U1N1BEMFpJREZSY19yUVlkWk4wRE93", text: "あやとさんの配信まじで勉強になるし、おもろい" },
  { date: "2025-04-21", videoId: "ouCH9DYvTAA", eventId: "ChwKGkNNYXg4dWlwNll3REZYTWRyUVlkQURzRkFn", text: "あやとくんは，日本に帰らずずーっと旅してるのは、ほんとすごいよね" },
  { date: "2026-05-17", videoId: "c-ogYrwX8iA", eventId: "ChwKGkNJenlfTXVMdnBRREZlckRMUUFkbDVNVkR3", text: "最初アヤトさん武士の方かと思いました。　お城とかで武士の役やる人　それがIT系なのは凄すぎる" },
  { date: "2025-10-24", videoId: "I6PVjeSYwf0", eventId: "ChwKGkNQRzZ2NldMdlpBREZSSXVyUVlkRWtFcGdB", text: "あやとさんの関西弁と言葉選びがね、本当に気持ち良くて癒されるね。同じ関西人だから嬉しくてね。" },
  { date: "2026-07-12", videoId: "UeDyvW4zAgo", eventId: "ChwKGkNOUDA2dTZqelpVREZhVk9UQWdkVV9zdVdR", text: "みんなが熱くなる料理配信を開発したあやとさんはすごい" },
  { date: "2025-05-06", videoId: "zlgM1S0yl2Q", eventId: "ChwKGkNQbTJ5WnJPakkwREZjWEx3Z1FkUk5nZWVn", text: "ホテルって，乾燥するし、布団も枕もなれないし、ホステル生活ずっとしてるあやとくんすごいって，改めておもった" },
  { date: "2026-03-05", videoId: "3rKxNKHTzIc", eventId: "ChwKGkNPVGpoT3J1aUpNREZZM3p3Z1FkbDRBcllR", text: "あやとくんの優しさが溢れてる" },
  { date: "2025-10-18", videoId: "_g65QUd51Qc", eventId: "ChwKGkNPem5tSm1CcnBBREZiTEN3Z1Fkd0NneG53", text: "あやとくんの配信をみて寝ることを楽しみに1日がんばってる" },
  { date: "2025-04-13", videoId: "7Amy9E2U7wo", eventId: "ChwKGkNOMmpoOFAzMUl3REZWWEh3Z1FkRzk4cE1n", text: "あやとくんは大丈夫！わたしたちがついてるし！どこでも楽しく生きていける！！" },
];
