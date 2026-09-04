import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { Panel, StreamCard } from "@/components/ui/Bits";
import { COUNTRIES, countryBySlug } from "@/content/countries";
import { RECIPES } from "@/content/recipes";

export function generateStaticParams() {
  return COUNTRIES.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const c = countryBySlug(slug);
  if (!c) return {};
  return { title: `${c.flag} ${c.name}`, description: c.summary };
}

const fmt = (d: string) => (d ? d.replace(/-/g, "/") : "いま");

export default async function CountryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = countryBySlug(slug);
  if (!c) notFound();
  const idx = COUNTRIES.findIndex((x) => x.slug === c.slug);
  const prev = COUNTRIES[idx - 1];
  const next = COUNTRIES[idx + 1];
  const cooked = RECIPES.filter((r) => r.country === c.slug);

  return (
    <PageShell current="map" crumbs={[{ label: "旅の桟橋", href: "/map" }, { label: c.name }]}>
      <PageHead
        emoji={c.flag}
        title={c.name}
        lead={c.summary}
        meta={
          <>
            {c.stays.map((s, i) => (
              <span key={i} className="chip dark">
                🗓 {fmt(s.from)} – {fmt(s.to)}
              </span>
            ))}
          </>
        }
      />

      <Panel>
        <h2>行った街</h2>
        <div className="chips">
          {[...new Set(c.stays.flatMap((s) => s.cities))].map((city) => (
            <span key={city} className="chip">
              📍 {city}
            </span>
          ))}
        </div>
      </Panel>

      <Panel>
        <h2>この国であったこと</h2>
        <ul className="hlist">
          {c.highlights.map((h) => (
            <li key={h.title}>
              <div className="hlist-head">
                <b>{h.title}</b>
                {h.date && <time>{fmt(h.date)}</time>}
              </div>
              <p>{h.note}</p>
              {h.videoId && (
                <div className="scards">
                  <StreamCard videoId={h.videoId} title={h.title} date={h.date} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </Panel>

      {cooked.length > 0 && (
        <Panel>
          <h2>この国で作ったごはん</h2>
          <div className="chips">
            {cooked.map((r) => (
              <Link key={r.slug} className="chip" href={`/kitchen/${r.slug}`}>
                {r.emoji} {r.name}
              </Link>
            ))}
          </div>
        </Panel>
      )}

      <nav className="pager">
        {prev ? (
          <Link href={`/map/${prev.slug}`}>
            ← {prev.flag} {prev.name}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={`/map/${next.slug}`}>
            {next.flag} {next.name} →
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </PageShell>
  );
}
