import type { Metadata } from "next";
import Link from "next/link";

import { Crumbs, IslandFooter } from "@/components/ui/PageShell";
import Icon from "@/components/ui/Icon";
import IsleStage from "@/components/isle/IsleStage";
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
  // まだ始まっていない章は、建てるものが違う（`docs/island-atlas.md` 4章）
  const spec = c.from ? isleSpec(c, prev, next) : nordicSpec(c, prev);

  return (
    <>
      <IsleStage spec={spec} />

      <main className="page isle-page">
        <div className="wayrow">
          <Crumbs items={[{ label: "島の地図", href: "/atlas" }, { label: c.name }]} />
        </div>

        <p className="isle-lead">
          {c.from
            ? `${ym(c.from)}から${c.to ? ym(c.to) : "いま"}までいた島。島に建っているのは、この章のときにやっていたことだけです。`
            : "まだ誰も上陸していない島。集まったぶんだけ建っていきます。"}
        </p>

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

const ym = (d: string) => {
  const [y, m] = d.split("-");
  return `${y}年${Number(m)}月`;
};
