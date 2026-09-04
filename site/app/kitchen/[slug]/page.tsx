import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { Panel, StreamCard } from "@/components/ui/Bits";
import { RECIPES, recipeBySlug } from "@/content/recipes";
import { countryBySlug } from "@/content/countries";
import Flag from "@/components/ui/Flag";
import Icon from "@/components/ui/Icon";

export function generateStaticParams() {
  return RECIPES.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const r = recipeBySlug(slug);
  if (!r) return {};
  return { title: r.name, description: r.note };
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
    <PageShell current="streams" crumbs={[{ label: "配信やぐら", href: "/streams" }, { label: "キッチン小屋", href: "/kitchen" }, { label: r.name }]}>
      <PageHead
        icon={r.icon}
        title={r.name}
        lead={r.note}
        meta={
          <>
            <span className="chip dark">🗓 {r.date.replace(/-/g, "/")}</span>
            {c && (
              <Link className="chip dark" href={`/map/${c.slug}`}>
                <Flag slug={c.slug} size={20} />
                {c.name}で作った
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
        {prev ? (
          <Link href={`/kitchen/${prev.slug}`}>
            <Icon name="right" size={13} className="is-flip" />
            <img className="mini-icon" src={`/sprites/${prev.icon}.webp`} alt="" />
            {prev.name}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={`/kitchen/${next.slug}`}>
            <img className="mini-icon" src={`/sprites/${next.icon}.webp`} alt="" />
            {next.name}
            <Icon name="right" size={13} />
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </PageShell>
  );
}
