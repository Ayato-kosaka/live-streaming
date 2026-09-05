import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { Panel } from "@/components/ui/Bits";
import Icon from "@/components/ui/Icon";
import Flag from "@/components/ui/Flag";
import Fold from "@/components/ui/Fold";
import CountryIdeas from "@/components/nordic/CountryIdeas";
import RouteMapSvg from "@/components/nordic/RouteMapSvg";
import { Mark } from "@/components/nordic/Marks";
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

/**
 * 見どころの種類。
 *
 * 印は使わない。同じ目のマークが1ページに20個並ぶと行の頭が全部同じになって、
 * どの行がどれだか分からなくなる。かわりに平らな札へ**言葉**で出す。
 * 平らな札は「押せないもの」の見た目（`docs/ac-reference.md` 7章 紙の型）。
 */
const CAT: Record<string, string> = { see: "見る", do: "やる", eat: "食べる", buy: "買う" };

const MOVE: Record<string, string> = { hitch: "ヒッチハイク", ferry: "フェリー", fly: "飛行機", walk: "歩き" };

/**
 * 見どころ1件。
 *
 * 閉じているときは、写真・種類の札・題名・「ここが面白い」の一行だけ。
 * 本文まで並べると1国で数千字になって、探すのがつらくなる。
 *
 * 閉じたままでも写真を出すのは、20段ならんだときに1段ずつ違って見えるのが
 * いちばん効くから。字だけの段が20並ぶと、目が滑って何も残らない。
 */
function Spot({ s }: { s: NordicSpot }) {
  return (
    <Fold
      title={
        <span className="nspot-h">
          {s.img && (
            <img className="nspot-th" src={s.img} alt="" loading="lazy" referrerPolicy="no-referrer" />
          )}
          <span className="nspot-hb">
            <span className="nspot-cat">{CAT[s.cat] ?? "見る"}</span>
            <span className="nspot-name">{s.title}</span>
          </span>
        </span>
      }
      lead={s.point || s.local}
      note={s.budget || undefined}
    >
      {s.img && (
        <a className="nspot-img" href={s.cm || s.big} target="_blank" rel="noopener noreferrer">
          <img src={s.big || s.img} alt={s.title} loading="lazy" referrerPolicy="no-referrer" />
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

/** 入る道・出る道。区間ごとの絵を添えて、どんな一日になるかまで見せる。 */
function Way({ kind, leg }: { kind: string; leg: NonNullable<(typeof ROUTE)[number]> }) {
  return (
    <div className="ncway">
      {leg.art && <Mark art={leg.art} size={46} className="ncway-art" />}
      <span className="ncway-b">
        <i>{kind}</i>
        <b>
          {leg.from} <span aria-hidden>→</span> {leg.to}
        </b>
        <em>
          {MOVE[leg.move]}
          {leg.km ? ` ${leg.km.toLocaleString()}km` : ""}
          {leg.time ? ` / ${leg.time}` : ""}
        </em>
        {leg.fixed && <span className="ncway-fix">{leg.fixed}</span>}
      </span>
    </div>
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

  // その国の顔になる写真。最初の見どころのものを使う。
  const hero = spots.find((s) => s.big) ?? spots[0];

  const idx = NORDIC_COUNTRIES.findIndex((x) => x.slug === c.slug);
  const prev = NORDIC_COUNTRIES[idx - 1];
  const next = NORDIC_COUNTRIES[idx + 1];
  // この国に入る区間と、この国から出る区間。「入って、出る」の形で見せると、
  // ルート全体のどこに挟まっている国なのかが1目で分かる。
  const inAt = ROUTE.findIndex((l) => l.enters === c.slug);
  const arrive = inAt >= 0 ? ROUTE[inAt] : undefined;
  const leave = ROUTE.slice(inAt + 1).find((l) => l.enters && l.enters !== c.slug);
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
      {hero?.big && (
        <div className="nchero">
          <img src={hero.big} alt="" loading="eager" referrerPolicy="no-referrer" />
          <span className="nchero-credit">{hero.title} — Wikimedia Commons</span>
        </div>
      )}
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
        <h2>どこで入って、どこから出るのか</h2>
        <RouteMapSvg here={firstCity} />
        <div className="ncways">
          {arrive && <Way kind="入る" leg={arrive} />}
          {leave && <Way kind="出る" leg={leave} />}
        </div>
        {arrive?.note && <p className="ncway-note">{arrive.note}</p>}
      </section>

      <Panel>
        <h2>{c.name}で行くところ</h2>
        <p className="muted">
          {spots.length}件。街ごとに並べています。段を押すと開きます。
          写真は Wikimedia Commons から借りたもので、開いてから押すと出どころに飛びます。
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
