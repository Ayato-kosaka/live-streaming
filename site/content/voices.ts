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
 * **名前とアイコンを出す。** チャットに出ている表示名と、そのときのアイコン。
 * どちらもコメントの生データ（`raw_item_json`）から引いたもので、手では書かない。
 * アイコンが取れなかった人は `icon` が空になる。画面は頭文字の丸に落とす。
 */
export type Voice = {
  /** 配信の日（UTC で切った配信日） */
  date: string;
  /** その配信 */
  videoId: string;
  /** チャットのイベントID。書いた人を引き直すための鍵 */
  eventId: string;
  /** YouTube の表示名 */
  name: string;
  /** YouTube のアイコン。取れなかったときは空 */
  icon: string;
  /** 書かれたままの本文 */
  text: string;
};

export const VOICES: Voice[] = [
  { date: "2025-10-28", videoId: "xxQ4XafROrQ", eventId: "ChwKGkNMN252cGVVeDVBREZYalp3Z1FkYjBBU3l3", name: "@Blackcoffee-j5h", icon: "https://yt4.ggpht.com/ytc/AIdro_l5ZIbBEgwtZgFkpa5rNV02u-8Vx6YggfmL2j0PeAXobTQsCm2wmmfwdUlmilBjHqr4mA=s64-c-k-c0x00ffffff-no-rj", text: "新参者ですが、あやとさんのお人柄とイケメンぷりにファンになりました。これからもあやとさんの魅力一杯の配信を楽しませて下さいね" },
  { date: "2026-09-03", videoId: "5-1bHix5X1s", eventId: "ChwKGkNNdmQzX19IMHBZREZWSEtMUUFkREljQm9n", name: "@dekobokov6229", icon: "https://yt4.ggpht.com/TBVbh4mgVwZC5oTx0QDAV1XspuVsfsWFiiI-j1IL7WVfd4lBU59qw_zH0aMO5b6k5fSfRMqW=s64-c-k-c0x00ffffff-no-rj", text: "あやとさんの人柄がいいんだね。" },
  { date: "2026-07-17", videoId: "Hc-z52fs108", eventId: "ChwKGkNLcVZ4Y2pvMlpVREZaX2V3Z1FkNXA4V1Bn", name: "@竹越知枝美", icon: "https://yt4.ggpht.com/ytc/AIdro_kSgzsn-PaGdvyWXb6AMhFa1gscZpG84RXiatevNLqmSu1hqWQ=s64-c-k-c0x00ffffff-no-rj", text: "あやとさん毎日だから感心してた　疲れないのかなと心配してた" },
  { date: "2026-07-17", videoId: "Hc-z52fs108", eventId: "ChwKGkNOS09oSnJwMlpVREZXX0N3Z1FkYlB3Sm93", name: "@123-u8", icon: "https://yt4.ggpht.com/mb6hDyT7OoEtMgMSeB23rKdCV1KFxbBfp-_7O54Y8KR6_17tatCM4i69O18XCJyv38qsj1HkXw=s64-c-k-c0x00ffffff-no-rj", text: "このアプリアヤトさんが作ったの？凄いな" },
  { date: "2026-02-11", videoId: "u2bIxRNKa6g", eventId: "ChwKGkNMS1U1N1BEMFpJREZSY19yUVlkWk4wRE93", name: "@凛凛-x9w", icon: "https://yt4.ggpht.com/A8aFdZ3beFbac0zXYOnoiEGMa4TWJQU9fUmil4qFst8pS3gz-_Ht5HfGCoyNL30xvLu4RPeSgw=s64-c-k-c0x00ffffff-no-rj", text: "あやとさんの配信まじで勉強になるし、おもろい" },
  { date: "2025-04-21", videoId: "ouCH9DYvTAA", eventId: "ChwKGkNNYXg4dWlwNll3REZYTWRyUVlkQURzRkFn", name: "@aoi1685", icon: "https://yt4.ggpht.com/7kIqlftaj8J6wMIiqSVp8-0QP72rbfrbnEkZYFZ58LI0o6SKSYID1enifwQrpf6JSs_-7xZCk9U=s64-c-k-c0x00ffffff-no-rj", text: "あやとくんは，日本に帰らずずーっと旅してるのは、ほんとすごいよね" },
  { date: "2026-05-16", videoId: "c-ogYrwX8iA", eventId: "ChwKGkNJenlfTXVMdnBRREZlckRMUUFkbDVNVkR3", name: "@ゆうチャンネル-w8v", icon: "https://yt4.ggpht.com/ytc/AIdro_k7zdfwxIuWjJ--pMk0DynSkThdMtWd9MD9Go8oomyrKCiLGsN81EIIz1Bz-vH9uDmCaTq2=s64-c-k-c0x00ffffff-no-rj", text: "最初アヤトさん武士の方かと思いました。　お城とかで武士の役やる人　それがIT系なのは凄すぎる" },
  { date: "2025-10-24", videoId: "I6PVjeSYwf0", eventId: "ChwKGkNQRzZ2NldMdlpBREZSSXVyUVlkRWtFcGdB", name: "@Blackcoffee-j5h", icon: "https://yt4.ggpht.com/ytc/AIdro_l5ZIbBEgwtZgFkpa5rNV02u-8Vx6YggfmL2j0PeAXobTQsCm2wmmfwdUlmilBjHqr4mA=s64-c-k-c0x00ffffff-no-rj", text: "あやとさんの関西弁と言葉選びがね、本当に気持ち良くて癒されるね。同じ関西人だから嬉しくてね。" },
  { date: "2026-07-12", videoId: "UeDyvW4zAgo", eventId: "ChwKGkNOUDA2dTZqelpVREZhVk9UQWdkVV9zdVdR", name: "@ひめひめ-r9z", icon: "https://yt4.ggpht.com/QBYOiPtFvPHlwRojOozZMmduu8_hr_YFDuCTwPDaOHZC3hnHiJz_ol-YH6VZ-u30fUd0dgPm=s64-c-k-c0x00ffffff-no-rj", text: "みんなが熱くなる料理配信を開発したあやとさんはすごい" },
  { date: "2025-10-18", videoId: "_g65QUd51Qc", eventId: "ChwKGkNPem5tSm1CcnBBREZiTEN3Z1Fkd0NneG53", name: "@aoi1685", icon: "https://yt4.ggpht.com/7kIqlftaj8J6wMIiqSVp8-0QP72rbfrbnEkZYFZ58LI0o6SKSYID1enifwQrpf6JSs_-7xZCk9U=s64-c-k-c0x00ffffff-no-rj", text: "あやとくんの配信をみて寝ることを楽しみに1日がんばってる" },
  { date: "2025-04-13", videoId: "7Amy9E2U7wo", eventId: "ChwKGkNOMmpoOFAzMUl3REZWWEh3Z1FkRzk4cE1n", name: "@aoi1685", icon: "https://yt4.ggpht.com/7kIqlftaj8J6wMIiqSVp8-0QP72rbfrbnEkZYFZ58LI0o6SKSYID1enifwQrpf6JSs_-7xZCk9U=s64-c-k-c0x00ffffff-no-rj", text: "あやとくんは大丈夫！わたしたちがついてるし！どこでも楽しく生きていける！！" },
];
