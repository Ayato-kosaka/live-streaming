import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { Panel, StreamCard } from "@/components/ui/Bits";
import { RECIPES, recipeBySlug } from "@/content/recipes";
import { countryBySlug } from "@/content/countries";

export function generateStaticParams() {
  return RECIPES.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const r = recipeBySlug(slug);
  if (!r) return {};
  return { title: `${r.emoji} ${r.name}`, description: r.note };
}

export default async function RecipePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = recipeBySlug(slug);
  if (!r) notFound();
  const c = countryBySlug(r.country);
  const sorted = [...RECIPES].sort((a, b) => (a.date < b.date ? 1 : -1));
  const i = sorted.findIndex((x) => x.slug === r.slug);
  const prev = sorted[i - 1];
  const next = sorted[i + 1];

  return (
    <PageShell current="kitchen" crumbs={[{ label: "キッチン小屋", href: "/kitchen" }, { label: r.name }]}>
      <PageHead
        emoji={r.emoji}
        title={r.name}
        lead={r.note}
        meta={
          <>
            <span className="chip dark">🗓 {r.date.replace(/-/g, "/")}</span>
            {c && (
              <Link className="chip dark" href={`/map/${c.slug}`}>
                {c.flag} {c.name}で作った
              </Link>
            )}
          </>
        }
      />
      <Panel>
        <h2>この料理ができるまで</h2>
        <div className="scards">
          {r.streams.map((s) => (
            <StreamCard key={s.videoId} videoId={s.videoId} title={s.title} date={s.date} tag={s.label} />
          ))}
        </div>
      </Panel>
      <nav className="pager">
        {prev ? <Link href={`/kitchen/${prev.slug}`}>← {prev.emoji} {prev.name}</Link> : <span />}
        {next ? <Link href={`/kitchen/${next.slug}`}>{next.emoji} {next.name} →</Link> : <span />}
      </nav>
    </PageShell>
  );
}
