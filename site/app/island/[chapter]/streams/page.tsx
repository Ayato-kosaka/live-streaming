import type { Metadata } from "next";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { StreamCard } from "@/components/ui/Bits";
import Icon from "@/components/ui/Icon";
import { CHAPTER_STREAMS } from "@/content/chapterStreams";
import { ISLE_STREAM_CHAPTERS } from "@/components/chain/route";

/**
 * 過去の島の配信だけを並べる面。
 *
 * **オーナーが決めた形**（`docs/island-atlas.md` 7章）:
 *
 * | | 何が出るか |
 * | --- | --- |
 * | `/island/europe/streams` | **その章の配信だけ** |
 * | `/streams` | **全部**（いまの島から入るのはこちら） |
 *
 * 過去は振り返る場所、いまは使う場所。だから**ここは絞る。**
 * いまの島（コーカサス）にこの面は無い。あそこから入るのは `/streams`。
 *
 * ## 型で分けない
 *
 * `/streams` は配信を5つの型（おさんぽ・クッキング・…）で分けているが、
 * ここは**日付の新しい順に、ただ並べる。** 振り返る面なので、
 * 「どういう配信だったか」より「いつ何があったか」で読まれる。
 * 型で分けると、その章に1本しかない型のかたまりが並ぶことになる。
 *
 * ## 月で畳む
 *
 * ヨーロッパは121本ある。素で並べると 40画面をこえる
 * （`docs/island-ux.md` 8.1 は入口の面を3画面までとしている）。
 * ここは入口ではなく一覧なので長くてよいが、**どこを読んでいるかは要る。**
 * 月の見出しを差し込んで、月ごとの本数を出す。
 */

export function generateStaticParams() {
  return ISLE_STREAM_CHAPTERS.map((c) => ({ chapter: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ chapter: string }>;
}): Promise<Metadata> {
  const { chapter } = await params;
  const c = ISLE_STREAM_CHAPTERS.find((x) => x.slug === chapter);
  if (!c) return {};
  const n = CHAPTER_STREAMS[c.slug]?.length ?? 0;
  return {
    title: `${c.name}の配信`,
    description: `${c.from} から ${c.to} まで、${c.name}のあいだに配信した${n}本。`,
  };
}

export default async function ChapterStreams({
  params,
}: {
  params: Promise<{ chapter: string }>;
}) {
  const { chapter } = await params;
  const c = ISLE_STREAM_CHAPTERS.find((x) => x.slug === chapter)!;
  const streams = CHAPTER_STREAMS[c.slug] ?? [];

  // 月ごとにまとめる。焼いてある表はもう新しい順なので、並べ替えない
  const months: { key: string; label: string; rows: typeof streams }[] = [];
  for (const row of streams) {
    const key = row[0].slice(0, 7);
    const last = months[months.length - 1];
    if (last?.key === key) last.rows.push(row);
    else months.push({ key, label: ymLabel(key), rows: [row] });
  }

  return (
    <PageShell
      crumbs={[
        { label: "島の地図", href: "/atlas" },
        { label: c.name, href: `/island/${c.slug}` },
        { label: "配信" },
      ]}
    >
      <PageHead
        icon="tower-studio"
        title={`${c.name}の配信`}
        lead={`${ym(c.from)}から${ym(c.to)}まで、この島にいたあいだの${streams.length}本。新しい順に並べています。`}
      />

      {/* いまの配信を探しに来た人を、行き止まりに置かない。
          この面はこの章に絞ってあるので、外への口を先に出す */}
      <p className="chap-note chap-scope">
        ここに出るのは<b>この島にいたあいだの配信だけ</b>です。ぜんぶ見るなら
        <Link href="/streams" prefetch={false}>
          配信の面
        </Link>
        へ。
      </p>

      {months.map((m) => (
        <section key={m.key} className="chap-month">
          <h2>
            {m.label}
            <i>{m.rows.length}本</i>
          </h2>
          <div className="scards">
            {m.rows.map(([date, videoId, title, people]) => (
              <StreamCard
                key={videoId}
                videoId={videoId}
                title={title}
                date={date}
                // その日に何人が書き込んだか。配信の大きさが、並べたときに見える
                tag={people > 0 ? `${people}人` : undefined}
              />
            ))}
          </div>
        </section>
      ))}

      <p className="chain-foot">
        <Link href={`/island/${c.slug}`} prefetch={false}>
          <Icon name="left" size={14} /> {c.name}の島にもどる
        </Link>
      </p>
    </PageShell>
  );
}

const ym = (d: string) => {
  const [y, m] = d.split("-");
  return `${y}年${Number(m)}月`;
};
const ymLabel = (key: string) => ym(`${key}-01`);
