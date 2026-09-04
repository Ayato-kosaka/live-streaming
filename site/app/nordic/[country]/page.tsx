import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { Panel } from "@/components/ui/Bits";
import Icon, { type IconName } from "@/components/ui/Icon";
import Flag from "@/components/ui/Flag";
import Fold from "@/components/ui/Fold";
import CountryIdeas from "@/components/nordic/CountryIdeas";
import RouteMapSvg from "@/components/nordic/RouteMapSvg";
import MAP from "@/content/nordic/map.json";
import { NORDIC_COUNTRIES, ROUTE, loadSpots, nordicCountry, type NordicSpot } from "@/content/nordic";

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

const CAT: Record<string, { label: string; icon: IconName }> = {
  see: { label: "見る", icon: "see" },
  do: { label: "やる", icon: "do" },
  eat: { label: "食べる", icon: "eat" },
  buy: { label: "買う", icon: "buy" },
};

/**
 * 見どころ1件。
 *
 * 閉じているときは、写真と「ここが面白い」の一行だけ。
 * 本文を全部並べると1国で数千字になって、探すのがつらくなる。
 */
function Spot({ s }: { s: NordicSpot }) {
  const cat = CAT[s.cat] ?? CAT.see;
  return (
    <Fold
      title={
        <span className="nspot-h">
          <Icon name={cat.icon} size={16} />
          {s.title}
        </span>
      }
      lead={s.point || s.local}
      note={s.budget || undefined}
    >
      {s.img && (
        <a className="nspot-img" href={s.cm || s.big} target="_blank" rel="noopener noreferrer">
          <img src={s.img} alt={s.title} loading="lazy" referrerPolicy="no-referrer" />
          <span className="nspot-credit">
            Wikimedia Commons
            <Icon name="external" size={11} />
          </span>
        </a>
      )}
      {s.local && <p className="nspot-local">{s.local}</p>}
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
    </Fold>
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
  // 地図で光らせる街。この国で最初に降りるところ。
  const firstCity = MAP.cities.find((m) => m.country === c.slug)?.id;

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
        title={c.name}
        lead={c.catch}
        mark={<Flag slug={c.slug} size={54} />}
        meta={
          <>
            <span>{c.leg}カ国目</span>
            <span>{c.cur}</span>
            <span>日本との時差 {c.tz}</span>
            <span>いい時期 {c.best}</span>
          </>
        }
      />

      <section className="panel is-map">
        <h2>ルートのなかの{c.name}</h2>
        <RouteMapSvg here={firstCity} />
        {arrive && (
          <div className="narrive">
            <b>
              {arrive.from} から {arrive.to} へ
            </b>
            <i>
              {arrive.move === "hitch" ? "ヒッチハイク" : arrive.move === "ferry" ? "フェリー" : "飛行機"}
              {arrive.km ? ` ${arrive.km.toLocaleString()}km` : ""}
              {arrive.time ? ` / ${arrive.time}` : ""}
            </i>
            {arrive.fixed && <span>{arrive.fixed}</span>}
            {arrive.note && <p>{arrive.note}</p>}
          </div>
        )}
      </section>

      <Panel>
        <h2>{c.name}で行くところ</h2>
        <p className="muted">
          {spots.length}件。街ごとに並べています。見出しを押すと中身が開きます。
          写真は Wikimedia Commons から借りたもので、押すと出どころに飛びます。
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
          <h2 className="ncity-name">
            {city}
            <em>{list.length}件</em>
          </h2>
          <div className="folds">
            {list.map((s) => (
              <Spot key={s.id} s={s} />
            ))}
          </div>
        </section>
      ))}

      <CountryIdeas country={c.name} />

      <div className="nnav">
        {prev ? (
          <Link href={`/nordic/${prev.slug}`}>
            <Icon name="right" size={14} className="is-flip" />
            <Flag slug={prev.slug} size={22} />
            {prev.name}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={`/nordic/${next.slug}`}>
            <Flag slug={next.slug} size={22} />
            {next.name}
            <Icon name="right" size={14} />
          </Link>
        ) : (
          <span />
        )}
      </div>
    </PageShell>
  );
}
