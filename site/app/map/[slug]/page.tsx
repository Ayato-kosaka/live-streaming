import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { Panel, StreamCard } from "@/components/ui/Bits";
import Fold from "@/components/ui/Fold";
import { COUNTRIES, countryBySlug } from "@/content/countries";
import { RECIPES } from "@/content/recipes";
import { streamsOfCity } from "@/content/cityStreams";
import Flag from "@/components/ui/Flag";
import Icon from "@/components/ui/Icon";
import CountryMap from "@/components/atlas/CountryMap";
import Days from "@/components/atlas/Days";
import { COUNTRY_MAPS } from "@/components/atlas/countryMaps";

export function generateStaticParams() {
  return COUNTRIES.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const c = countryBySlug(slug);
  if (!c) return {};
  return { title: c.name, description: c.summary };
}

const fmt = (d: string) => (d ? d.replace(/-/g, "/") : "いま");

/** 終わった滞在の日数。まだ続いている滞在はここに入れない（画面側で数え直す）。 */
function closedDays(stays: { from: string; to: string }[]) {
  const day = 86400000;
  return stays
    .filter((s) => s.to)
    .reduce((n, s) => n + Math.max(1, Math.round((new Date(s.to).getTime() - new Date(s.from).getTime()) / day)), 0);
}

/**
 * 国ひとつのページ。
 *
 * 上から順に「どこにいたか（地図）→ どんな街か → 何があったか」。
 * 出来事は畳んでおいて、見出しだけを並べる。開くと本文と配信が出る。
 * 縦に長い読み物にすると、17カ国ぶんのどれも同じ壁に見えてしまう。
 */
export default async function CountryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = countryBySlug(slug);
  if (!c) notFound();
  const ordered = [...COUNTRIES].sort((a, b) => a.order - b.order);
  const idx = ordered.findIndex((x) => x.slug === c.slug);
  const prev = ordered[idx - 1];
  const next = ordered[idx + 1];
  const cooked = RECIPES.filter((r) => r.country === c.slug);
  const towns = [...new Set(c.stays.flatMap((s) => s.cities))];
  const lives = towns.reduce((n, t) => n + streamsOfCity(c.slug, t).length, 0);
  const hasMap = Boolean(COUNTRY_MAPS[c.slug]);
  // まだ出国していない国は、書き出した日で数字が止まる。画面が出てから数え直す。
  const staying = c.stays.find((s) => !s.to);
  const days = closedDays(c.stays);

  return (
    <PageShell current="map" crumbs={[{ label: "旅の桟橋", href: "/map" }, { label: c.name }]}>
      <PageHead
        mark={<Flag slug={c.slug} size={56} />}
        title={c.name}
        lead={c.summary}
        meta={
          <>
            <span className="chip dark">
              <Icon name="signpost" size={13} />
              {c.order}カ国目
            </span>
            {c.stays.map((s, i) => (
              <span key={i} className="chip dark">
                <Icon name="calendar" size={13} />
                {fmt(s.from)} – {fmt(s.to)}
              </span>
            ))}
          </>
        }
      />

      <div className="acty-num">
        <div>
          <b>{staying ? <Days from={staying.from} plus={days} /> : days.toLocaleString()}</b>
          <span>いた日数</span>
        </div>
        <div>
          <b>{towns.length}</b>
          <span>回った街</span>
        </div>
        <div>
          <b>{lives}</b>
          <span>ここからの配信</span>
        </div>
      </div>

      {hasMap && (
        <Panel className="paper">
          <h2>この国のどこにいたんだろう</h2>
          <p className="muted">白い丸が行った街。線は移動したところです。</p>
          <CountryMap slug={c.slug} name={c.name} />
        </Panel>
      )}

      <Panel className="paper">
        <h2>行った街</h2>
        <div className="cities">
          {towns.map((city) => {
            const vids = streamsOfCity(c.slug, city);
            if (!vids.length) {
              return (
                <div key={city} className="city is-quiet">
                  <span className="city-head">
                    <b>{city}</b>
                    <i>配信はのこっていない</i>
                  </span>
                </div>
              );
            }
            return (
              <details key={city} className="city">
                <summary className="city-head">
                  <b>{city}</b>
                  <i>{vids.length}本の配信</i>
                </summary>
                <div className="scards">
                  {vids.map((v) => (
                    <StreamCard key={v.videoId} videoId={v.videoId} title={v.title} date={v.date} />
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      </Panel>

      <Panel className="paper">
        <h2>この国であったこと</h2>
        <div className="hlist">
          {c.highlights.map((h, i) => (
            <Fold key={h.title} title={h.title} note={h.date ? fmt(h.date) : undefined} open={i === 0}>
              <p>{h.note}</p>
              {h.videoId && (
                <div className="scards">
                  <StreamCard videoId={h.videoId} title={h.title} date={h.date} />
                </div>
              )}
            </Fold>
          ))}
        </div>
      </Panel>

      {cooked.length > 0 && (
        <Panel className="paper">
          <h2>この国で作ったごはん</h2>
          <div className="chips">
            {cooked.map((r) => (
              <Link key={r.slug} className="chip" href={`/kitchen/${r.slug}`}>
                <img className="mini-icon" src={`/sprites/${r.icon}.webp`} alt="" />
                {r.name}
              </Link>
            ))}
          </div>
        </Panel>
      )}

      <nav className="pager">
        {prev ? (
          <Link href={`/map/${prev.slug}`}>
            <Icon name="right" size={13} className="is-flip" />
            <Flag slug={prev.slug} size={20} />
            {prev.name}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={`/map/${next.slug}`}>
            <Flag slug={next.slug} size={20} />
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
