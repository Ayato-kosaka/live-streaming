import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { Panel, StreamCard } from "@/components/ui/Bits";
import { LEGENDS, legendBySlug } from "@/content/legends";

export function generateStaticParams() {
  return LEGENDS.map((l) => ({ slug: l.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const l = legendBySlug(slug);
  if (!l) return {};
  return { title: `${l.emoji} ${l.title}`, description: l.lead };
}

export default async function LegendPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const l = legendBySlug(slug);
  if (!l) notFound();
  const i = LEGENDS.findIndex((x) => x.slug === l.slug);
  const prev = LEGENDS[i - 1];
  const next = LEGENDS[i + 1];
  return (
    <PageShell current="legends" crumbs={[{ label: "伝説の丘", href: "/legends" }, { label: l.title }]}>
      <PageHead
        emoji={l.emoji}
        title={l.title}
        lead={l.lead}
        meta={<span className="chip dark">🗓 {l.span ?? l.date.replace(/-/g, "/")}</span>}
      />
      <Panel>
        <h2>何があったか</h2>
        {l.body.map((p, k) => (
          <p key={k}>{p}</p>
        ))}
      </Panel>
      <Panel>
        <h2>その時の配信</h2>
        <div className="scards">
          {l.streams.map((s) => (
            <StreamCard key={s.videoId} {...s} />
          ))}
        </div>
      </Panel>
      <nav className="pager">
        {prev ? <Link href={`/legends/${prev.slug}`}>← {prev.emoji} {prev.title}</Link> : <span />}
        {next ? <Link href={`/legends/${next.slug}`}>{next.emoji} {next.title} →</Link> : <span />}
      </nav>
    </PageShell>
  );
}
