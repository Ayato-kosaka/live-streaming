import type { Metadata } from "next";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import NowLive from "@/components/live/NowLive";
import { LINKS } from "@/content/site";
import Icon from "@/components/ui/Icon";
import Link from "next/link";
import { NowCountry, NowTrail } from "./parts";
import "./now.css";

export const metadata: Metadata = {
  title: "いま何してる",
  description: "あやとが今どこにいて、今週なにをするか。",
};

/**
 * いまどこ。
 *
 * 上半分は「板の型」。いまどこにいるか、今夜あるか、次の企画はいつか。
 * 押すものと、しらせだけを置く。
 *
 * 下半分は「紙の型」の島だより。今週やること、いまいる国、その前にいた国。
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
  const youtube = LINKS.find((l) => l.id === "youtube")!;

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
        lead="いまどこにいて、今週なにをするか。配信のある日は、22時までの残りもここに出る。"
      />
      <NowLive letter>
        <NowCountry />
        <NowTrail />

        <section className="pap-sec">
          <h2 className="pap-h">この先の話</h2>
          <p className="pap-note">
            島だよりは今週ぶん。日にちの決まっている企画は、これからの面にまとまっています。
          </p>
          <div className="pap-gos" style={{ marginTop: "var(--sp-3)" }}>
            <Link className="pap-go" href="/next">
              <img src="/sprites/tent.webp" alt="" />
              <span>
                <b>これから</b>
                <i>次に行くところ、次にやること。付箋も貼れます</i>
              </span>
              <Icon name="right" size={14} />
            </Link>
            <a className="pap-go" href={youtube.href} target="_blank" rel="noopener noreferrer">
              <img src="/sprites/tower-studio.webp" alt="" />
              <span>
                <b>{youtube.label}</b>
                <i>{youtube.note}</i>
              </span>
              <Icon name="external" size={14} />
            </a>
          </div>
        </section>
      </NowLive>
    </PageShell>
  );
}
