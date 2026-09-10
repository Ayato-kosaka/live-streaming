import type { Metadata } from "next";
import Link from "next/link";

import { Crumbs, IslandFooter } from "@/components/ui/PageShell";
import Icon from "@/components/ui/Icon";
import IsleReview from "@/components/isle/IsleReview";
import IsleSpan from "@/components/isle/IsleSpan";
import IsleStage from "@/components/isle/IsleStage";
import { isleLead } from "@/components/isle/span";
import { isleSpec, nordicSpec, type Neighbour } from "@/components/isle/spec";
import { chapterHref, ISLE_CHAPTERS } from "@/components/chain/route";
import { CHAIN, type Chapter } from "@/content/chapters";

/**
 * 過去の島と、次の島。**歩ける。**
 *
 * ## なぜ絵ではなく、歩けるのか
 *
 * あやとの言葉:「今だとヨーロッパ周遊島を行くと、なんかその島の絵が出てくるだけ
 * なんですけど、そうじゃなくてその中で動けて、その中のやぐらみたいな感じで、
 * この島で歩いた国とか、この島で起きたこととか、この島の代表的な企画とかが見れて。
 * **クオリティもそれぞれの島、全部同じくコーカサス周遊と同じぐらいのクオリティに。**」
 *
 * `docs/island-atlas.md` 10章に「過去の島を、歩ける島にするかどうか」と
 * 書いてあったのが、これで **"する" に決まった。**
 *
 * ## 島に建つものは、章から決まる
 *
 * 手で並べていない（`components/isle/spec.ts`）。**その章に中身のあるものだけが
 * 建つ。** 歩いた国が0なら道しるべは立たないし、伝説の企画が無い章に館は建たない。
 * だから `content/chapters.ts` に章を1行足すと、ここを触らずに島が1つ増える。
 *
 * ## 板と紙
 *
 * 島は**板**、その下は**紙**（`docs/island-world.md` 1.5）。
 * トップと同じ形で、島がまず画面いっぱいに出て、下に紙が続く。
 */

export function generateStaticParams() {
  return ISLE_CHAPTERS.map((c) => ({ chapter: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ chapter: string }>;
}): Promise<Metadata> {
  const { chapter } = await params;
  const c = ISLE_CHAPTERS.find((x) => x.slug === chapter);
  if (!c) return {};
  return {
    title: c.name,
    description: c.from ? `${c.from} から ${c.to || "いま"} まで。${c.note}` : c.note,
  };
}

const near = (c?: Chapter): Neighbour | undefined =>
  c && { name: c.name, href: chapterHref(c) };

export default async function ChapterIsland({
  params,
}: {
  params: Promise<{ chapter: string }>;
}) {
  const { chapter } = await params;
  const c = ISLE_CHAPTERS.find((x) => x.slug === chapter)!;
  const i = CHAIN.indexOf(c);
  const prev = near(CHAIN[i - 1]);
  const next = near(CHAIN[i + 1]);
  /* **`nordicSpec` は「まだ始まっていない章」の spec ではなく、北欧旅の spec。**
     中の板は `/nordic` を指し、「なぜ北欧まで行くのか」と書いてある。
     `c.from` の有無だけで振り分けていたので、アルバニアの島に北欧の板が5枚建ち、
     「これから歩く国 6カ国、0日」まで出ていた（島ぜんぶが別の旅のもの）。

     **振り分けは「日付が入っているか」ではなく「建てるものがあるか」で決める。**
     `!c.from` で見ていたころ、旅から帰って章の表に `from` を書き入れた瞬間に
     `isleSpec` へ落ちる作りだった。北欧の6カ国は歩いてから `countries.ts` に
     足す決まりなので（#140）、その日は歩いた国0・配信0・伝説0で、
     **桟橋しか建っていない島**になる。日付を1つ入れると島が消える地雷を、
     ここに置いたままにしない。

     素材が1つも無い島は、旅の spec を持っていればそちらで建てる。
     日どりの決まっていない島（アルバニア）は旅の spec を持たないので、
     いままでどおり素材のあるぶんだけ建って、船着き場は残る。 */
  const isle = isleSpec(c, prev, next);
  // 桟橋は素材が無くても建つので、それ以外が1つも無ければ「何も建っていない島」
  const bare = isle.places.length <= 1;
  const spec = bare && c.opensAt ? nordicSpec(c, prev) : isle;

  return (
    <>
      <IsleStage spec={spec} />

      <main className="page isle-page">
        <div className="wayrow">
          <Crumbs items={[{ label: "島の地図", href: "/atlas" }, { label: c.name }]} />
        </div>

        {/* **「〜いままで」を焼かない。** ここは `c.to` を直に見ていたので、
            北欧へ出発したあとも、コーカサスが「2025年6月からいままでいた島。」と
            言い続けていた。閉じ方は `chapterSpan()` が1か所で持っている
            （`components/isle/span.ts`）。画面が出てから引き直す。 */}
        <p className="isle-lead">
          <IsleSpan chapter={c} kind="lead" baked={isleLead(c)} />
        </p>

        {/* その章を、その島の中で振り返る紙（`components/isle/IsleReview.tsx`）。
            島に建っている建物の板は「島から出ずに見る1枚」で、こちらは
            **腰を据えて読むほう。** 段は中身のあるものだけ出る。 */}
        <IsleReview chapter={c} />

        {/* 島から島へ。船着き場からも渡れるが、紙の上にも渡し板を置いておく */}
        <nav className="chap-sail" aria-label="となりの島">
          {prev && (
            <Link className="chap-sail-go" href={prev.href} prefetch={false}>
              <Icon name="left" size={15} />
              <span>
                <i>ひとつ前の島</i>
                <b>{prev.name}</b>
              </span>
            </Link>
          )}
          {next && (
            <Link className="chap-sail-go is-next" href={next.href} prefetch={false}>
              <span>
                <i>つぎの島</i>
                <b>{next.name}</b>
              </span>
              <Icon name="right" size={15} />
            </Link>
          )}
        </nav>

        <p className="chain-foot">
          <Link href="/atlas" prefetch={false}>
            島の地図にもどる
          </Link>
        </p>
      </main>

      <IslandFooter />
    </>
  );
}

