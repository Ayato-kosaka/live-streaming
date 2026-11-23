import type { Metadata } from "next";
import { share } from "@/lib/share";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { SayRoom } from "@/components/ui/Say";
import { say } from "@/content/nights";
import NowLive from "@/components/live/NowLive";
import { NowCountry, NowTrail } from "./parts";
import "./now.css";

export const metadata: Metadata = share({
  key: "now",
  title: "あやとはいま何してる？",
  description: "あやとが今どこにいて、島だよりに何を書いていったか。その前にいた場所と、この先の話まで、旅の途中のいまを1枚に。",
  path: "/now",
});

/**
 * いまどこ。
 *
 * 上半分は「板の型」。いまどこにいるか、今夜あるか、次の企画はいつか。
 * 押すものと、しらせだけを置く。
 *
 * 下半分は「紙の型」の島だより。あやとが書いていったやること、いまいる国、その前にいた国。
 * 読むものは紙に刷ってある、という見え方にする（`docs/ac-reference.md` の 7章）。
 * 同じ形の板が延々と積まれるのを避けるため、この2つは必ず台紙ごと分ける。
 *
 * ## 薄かったのを、この面のものだけで埋め直した
 *
 * 2.33画面のうち、下半分は「あやとって誰」（`/about` の名乗りと同じ4段落）と
 * 「もっと先は」（`/next` と `/map` への札）だった。**どちらもよその面の写し。**
 * ヘッダーから `/about` へは1タップなので、ここに置いておく理由が無い。
 *
 * 代わりに「いま」からしか出てこないものを2つ置いた。
 *   いまいる国のこと … 何日目か、どの街をまわったか、ここで何を見たか
 *   その前は、どこに … 直前の4カ国。押すとその国の面へ
 *
 * 国は Firestore の `current.theme` から引く（`parts.tsx`）。
 * 焼き込みにすると、国境を越えた日から次のビルドまで嘘をつく。
 */
export default function NowPage() {
  return (
    <PageShell crumbs={[{ label: "いまどこ" }]}>
      {/* h1 は場所の名前。島の建物・パンくず・上の帯と1つの名前でそろえる
          （`docs/island-design.md` 6章 / `docs/island-world.md` 7.5）。
          「いま何してる」は問いなので、すぐ下の1行で受ける。
          カモメを出さないのは、ここが読むだけの面だから。遊び方のある面
          （掲示板・これから・作った料理・道しるべ）にだけ出す
          （`docs/island-ux.md` 5.2）。 */}
      <PageHead
        icon="globe-stand"
        title="いまどこ"
        /* 前置きは旅かどうかで長さが変わる（ふだん37文字／旅のあいだ14文字）。
           `Say` を素で置くと焼いた HTML は空白1文字ぶんしか場所を取らない。
           いまは旅の言い方（1行）が出ているので跳ねていないが、旅が明けた日に
           ふだんの言い方（幅390で2行）が入って、下が黙って逃げる
           （`docs/island-misses.md` #151 #152）。器（`p.phead-lead`）は
           `PageHead` が持っていて触れないので、中を `span` の `SayRoom` にする。 */
        lead={<SayRoom as="span" t={say("now")} />}
      />
      <NowLive letter>
        <NowCountry />
        <NowTrail />

      </NowLive>
    </PageShell>
  );
}
