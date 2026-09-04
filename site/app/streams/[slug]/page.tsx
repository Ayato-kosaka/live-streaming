import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { Panel, StreamCard, TileLink } from "@/components/ui/Bits";
import { STREAM_TYPES, streamTypeBySlug } from "@/content/streamTypes";

export function generateStaticParams() {
  return STREAM_TYPES.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const t = streamTypeBySlug(slug);
  if (!t) return {};
  return { title: t.name, description: t.lead };
}

export default async function StreamTypePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = streamTypeBySlug(slug);
  if (!t) notFound();
  return (
    <PageShell current="streams" crumbs={[{ label: "配信やぐら", href: "/streams" }, { label: t.name }]}>
      <PageHead emoji={t.emoji} title={t.name} lead={t.lead} meta={<span className="chip dark">🕙 {t.when}</span>} />
      <Panel>
        <h2 style={{ ["--frame" as string]: t.color }}>どういう配信か</h2>
        {t.body.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </Panel>
      <Panel>
        <h2 style={{ ["--frame" as string]: t.color }}>代表的な回</h2>
        <div className="scards">
          {t.samples.map((v) => (
            <StreamCard key={v.videoId} {...v} />
          ))}
        </div>
      </Panel>
      {t.deeper && (
        <TileLink href={t.deeper.href} emoji={t.emoji} title={t.deeper.label} note="もっと深く見る" accent={t.color} />
      )}
    </PageShell>
  );
}
