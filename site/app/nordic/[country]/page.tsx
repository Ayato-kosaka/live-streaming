import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { Panel } from "@/components/ui/Bits";
import RouteMap from "@/components/nordic/RouteMap";
import CountryIdeas from "@/components/nordic/CountryIdeas";
import { CATS, NORDIC_COUNTRIES, ROUTE, loadSpots, nordicCountry, type NordicSpot } from "@/content/nordic";

export function generateStaticParams() {
  return NORDIC_COUNTRIES.map((c) => ({ country: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ country: string }>;
}): Promise<Metadata> {
  const { country } = await params;
  const c = nordicCountry(country);
  if (!c) return {};
  return {
    title: `${c.name} — 北欧ヒッチハイク`,
    description: `${c.catch} ${c.name}の見どころ${c.spots}件と、この国であやとにやってほしいこと。`,
  };
}

/** 見どころひとつ。写真は Wikimedia から借りているので、出どころを必ず添える。 */
function Spot({ s }: { s: NordicSpot }) {
  const cat = CATS[s.cat];
  return (
    <article className="nspot" id={s.id}>
      {s.img && (
        <a className="nspot-img" href={s.cm || s.big} target="_blank" rel="noopener noreferrer">
          <img src={s.img} alt={s.title} loading="lazy" referrerPolicy="no-referrer" />
          <span className="nspot-credit">Wikimedia Commons</span>
        </a>
      )}
      <div className="nspot-body">
        <span className="nspot-head">
          <em className="nspot-cat">
            {cat?.icon} {cat?.label}
          </em>
          <i className="nspot-city">{s.city}{s.area && s.area !== s.city ? ` / ${s.area}` : ""}</i>
        </span>
        <h3>{s.title}</h3>
        {s.local && <p className="nspot-local">{s.local}</p>}
        {s.point && <p className="nspot-point">{s.point}</p>}
        <p className="nspot-text">{s.body}</p>
        {s.tips?.length > 0 && (
          <ul className="nspot-tips">
            {s.tips.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        )}
        <dl className="nspot-meta">
          {s.budget && (
            <div>
              <dt>お金</dt>
              <dd>{s.budget}</dd>
            </div>
          )}
          {s.time && (
            <div>
              <dt>時間</dt>
              <dd>{s.time}</dd>
            </div>
          )}
          {s.season && (
            <div>
              <dt>時期</dt>
              <dd>{s.season}</dd>
            </div>
          )}
        </dl>
        {s.info && <p className="nspot-info">{s.info}</p>}
        {s.tags?.length > 0 && (
          <p className="nspot-tags">
            {s.tags.map((t) => (
              <span key={t}>{t}</span>
            ))}
          </p>
        )}
      </div>
    </article>
  );
}

export default async function NordicCountryPage({
  params,
}: {
  params: Promise<{ country: string }>;
}) {
  const { country } = await params;
  const c = nordicCountry(country);
  if (!c) notFound();
  const spots = await loadSpots(country);

  // 街ごとにまとめる。旅は街の単位で動くので、種類より街が先。
  const byCity = new Map<string, NordicSpot[]>();
  for (const s of spots) {
    const k = s.city || "その他";
    if (!byCity.has(k)) byCity.set(k, []);
    byCity.get(k)!.push(s);
  }

  const idx = NORDIC_COUNTRIES.findIndex((x) => x.slug === c.slug);
  const prev = NORDIC_COUNTRIES[idx - 1];
  const next = NORDIC_COUNTRIES[idx + 1];
  const arrive = ROUTE.find((l) => l.enters === c.slug);

  return (
    <PageShell
      current="next"
      crumbs={[
        { label: "これから", href: "/next" },
        { label: "北欧ヒッチハイク", href: "/nordic" },
        { label: c.name },
      ]}
    >
      <PageHead
        emoji={c.flag}
        title={c.name}
        lead={c.catch}
        meta={
          <>
            <span>{c.leg}カ国目</span>
            <span>{c.cur}</span>
            <span>日本との時差 {c.tz}</span>
            <span>いい時期 {c.best}</span>
          </>
        }
      />

      {arrive && (
        <Panel>
          <h2>ここへの入り方</h2>
          <p className="nspot-point">
            {arrive.from} から {arrive.to} へ
            {arrive.km ? ` ${arrive.km.toLocaleString()}km` : ""}
            {arrive.time ? ` / ${arrive.time}` : ""}
          </p>
          {arrive.fixed && <p className="nspot-info">{arrive.fixed}</p>}
          {arrive.note && <p>{arrive.note}</p>}
        </Panel>
      )}

      <Panel>
        <h2>{c.name}で行くところ</h2>
        <p className="muted">
          {spots.length}件。街ごとに並べています。写真は Wikimedia Commons から借りたもので、押すと出どころに飛びます。
        </p>
        <div className="chips" style={{ marginTop: 10 }}>
          {[...byCity.keys()].map((city) => (
            <a key={city} className="chip" href={`#city-${encodeURIComponent(city)}`}>
              {city} {byCity.get(city)!.length}
            </a>
          ))}
        </div>
      </Panel>

      {[...byCity.entries()].map(([city, list]) => (
        <section key={city} className="ncity" id={`city-${encodeURIComponent(city)}`}>
          <h2 className="ncity-name">{city}</h2>
          <div className="nspots">
            {list.map((s) => (
              <Spot key={s.id} s={s} />
            ))}
          </div>
        </section>
      ))}

      <CountryIdeas country={c.name} />

      <Panel>
        <h2>ルートのなかの、この国</h2>
        <RouteMap here={arrive?.to} />
      </Panel>

      <div className="nnav">
        {prev ? (
          <Link href={`/nordic/${prev.slug}`}>
            ← {prev.flag} {prev.name}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={`/nordic/${next.slug}`}>
            {next.flag} {next.name} →
          </Link>
        ) : (
          <span />
        )}
      </div>
    </PageShell>
  );
}
