import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { Panel } from "@/components/ui/Bits";
import Icon from "@/components/ui/Icon";
import Flag from "@/components/ui/Flag";
import Fold from "@/components/ui/Fold";
import CityMap, { cityKeys, type SpotKey } from "@/components/nordic/CityMap";
import FarMark from "@/components/nordic/FarMark";
import Notes from "@/components/live/Notes";
import RouteMapSvg from "@/components/nordic/RouteMapSvg";
import Strong from "@/components/nordic/Strong";
import { Mark } from "@/components/nordic/Marks";
import MAP from "@/content/nordic/map.json";
import {
  NORDIC_COUNTRIES,
  ROUTE,
  loadSpots,
  nordicCountry,
  splitSpots,
  visitCitiesOf,
  type NordicSpot,
  type SpotCity,
} from "@/content/nordic";

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
  const go = visitCitiesOf(c.slug);
  return {
    title: `${c.name} — 北欧ヒッチハイク`,
    // 降りる街を先に言う。国の名前だけだと、国じゅうを回るように読める。
    description: `${c.catch} 行くのは${go.join("・")}。見どころ${c.spots}件と、この国であやとにやってほしいこと。`,
  };
}

/**
 * 見どころの4つの種類。**この順・この言い方で出す。**
 *
 * あやとの言葉（2026-09-09）:
 *
 * > 見たい、食べたい、やりたい、買いたい みたいにわかると良いかも。
 *
 * データの `cat`（see / eat / do / buy）はもともとこの4つに分かれている。
 * これまでは1件ずつの頭に小さな札で出していただけで、街の中がどう分かれて
 * いるのかは、20件を上から読まないと分からなかった。**まとまりの見出しにする。**
 */
const CATS: { key: string; label: string }[] = [
  { key: "see", label: "見たい" },
  { key: "eat", label: "食べたい" },
  { key: "do", label: "やりたい" },
  { key: "buy", label: "買いたい" },
];

const MOVE: Record<string, string> = { hitch: "ヒッチハイク", ferry: "フェリー", fly: "飛行機", walk: "歩き" };

/**
 * 見どころ1件。
 *
 * 閉じているときは、写真・題名・「ここが面白い」の一行だけ。
 * 本文まで並べると1国で数千字になって、探すのがつらくなる。
 *
 * 閉じたままでも写真を出すのは、20段ならんだときに1段ずつ違って見えるのが
 * いちばん効くから。字だけの段が20並ぶと、目が滑って何も残らない。
 *
 * 種類の札は持たない。4つの見出しの下に並んでいるので、行の頭にもう一度
 * 「見る」と書いても、同じ言葉が縦に10個ならぶだけになる。
 *
 * ## 地図の番号は、この段が持つ
 *
 * 街の地図の下には前まで、番号つきの札が種類ごとに並んでいた。その真下に
 * この段が同じ見どころを並べるので、**同じものが上下で2回**出ていた。
 * 番号は写真の角に付けて、札のほうをやめた（`CityMap` の `cityKeys`）。
 *
 * ここの番号は**押せない。** この行そのものが押すと開く畳みなので、中に
 * もう1つ押しどころを入れると、押した先が2つになる。だから厚みも付けない
 * （`island-design.md` 3章3）。番号を押して点を光らせられるのは日ページ。
 */
function Spot({ s, k }: { s: NordicSpot; k?: SpotKey }) {
  return (
    <Fold
      title={
        <span className="nspot-h">
          {(s.img || k?.n != null || k?.far) && (
            <span className="nspot-fig">
              {s.img ? (
                <img className="nspot-th" src={s.img} alt="" loading="lazy" referrerPolicy="no-referrer" />
              ) : (
                <span className="nspot-th" aria-hidden="true" />
              )}
              {k?.n != null && <b className={`nspot-n cm-${k.cat}`}>{k.n}</b>}
              {k?.far && <FarMark deg={k.far.deg} className={`nspot-ar cm-${k.cat}`} />}
            </span>
          )}
          <span className="nspot-hb">
            <span className="nspot-name">{s.title}</span>
            {/* 地図の窓に入らなかったもの。**消さずに、どっちへどれだけかを言う** */}
            {k?.far && (
              <em className="nspot-out">
                街の中心から{k.far.dir}へ{k.far.km}km
              </em>
            )}
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

/**
 * 1つの街の中を、見たい・食べたい・やりたい・買いたいで分けて並べる。
 *
 * **4つに入らないものを押し込まない。** いまのデータは全部この4つだが、
 * 増えたときに黙って消えるほうが悪いので、余りは最後に「そのほか」で出す。
 */
function Cats({ list, keys }: { list: NordicSpot[]; keys?: Record<string, SpotKey> }) {
  const groups = CATS.map((c) => ({ label: c.label, list: list.filter((s) => s.cat === c.key) }));
  const rest = list.filter((s) => !CATS.some((c) => c.key === s.cat));
  if (rest.length > 0) groups.push({ label: "そのほか", list: rest });
  return (
    <>
      {groups
        .filter((g) => g.list.length > 0)
        .map((g) => (
          <div key={g.label} className="ncat">
            <h4>
              {g.label}
              <em>{g.list.length}件</em>
            </h4>
            <div className="folds">
              {g.list.map((s) => (
                <Spot key={s.id} s={s} k={keys?.[s.id]} />
              ))}
            </div>
          </div>
        ))}
    </>
  );
}

/** 街の畳み。行かない街と、寄るかもしれない街はこの形で置く。 */
function CityFold({ city, list }: SpotCity) {
  return (
    <section className="gchap ncity" id={`city-${encodeURIComponent(city)}`}>
      <Fold title={<span className="gchap-h">{city}</span>} lead={list[0]?.title} note={`${list.length}件`}>
        <Cats list={list} />
      </Fold>
    </section>
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

  /* 行く街・寄るかもしれない街・行かない街。**分け方の出どころは旅程だけ**
     （`content/nordic.ts` の `splitSpots`）。ここに街の名前を書かない。 */
  const { go, maybe, skip, nation } = splitSpots(spots);
  const goSpots = go.reduce((n, g) => n + g.list.length, 0) + nation.length;
  const skipSpots = skip.reduce((n, g) => n + g.list.length, 0);

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
        <div className="nchero is-plate">
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

      <section className="panel paper is-map">
        <h2>どこで入って、どこから出るのか</h2>
        <RouteMapSvg here={firstCity} />
        <div className="ncways">
          {arrive && <Way kind="入る" leg={arrive} />}
          {leave && <Way kind="出る" leg={leave} />}
        </div>
        {arrive?.note && (
          <p className="ncway-note">
            <Strong t={arrive.note} />
          </p>
        )}
      </section>

      {/* 行く街。**畳まない。この面でいちばん伝えたいのがここ。**
          （`island-design.md` 4章「開いた状態を初期値にしていいのは1つだけ」）

          ここは長いあいだ「国の見どころ全部を、街ごとに畳んだもの」だった。
          スウェーデンは「35件を15の街に分けています」と言いながら、
          あやとが降りるのはストックホルムだけで、上から3つ目に出てくる
          ヨーテボリも、キルナも、行かない街だった。**見出しが嘘をついていた。** */}
      {(go.length > 0 || nation.length > 0) && (
        <Panel>
          <h2>{c.name}で行くところ</h2>
          <p className="muted">
            {go.length === 1
              ? `行くのは${go[0].city}だけ。`
              : `行くのは${go.map((g) => g.city).join("・")}の${go.length}つ。`}
            {goSpots}件を、見たい・食べたい・やりたい・買いたいで分けました。
          </p>
          {go.map((g) => (
            <section key={g.city} className="ncgo" id={`city-${encodeURIComponent(g.city)}`}>
              <h3>{g.city}</h3>
              {/* 街の地図。**降りる街には必ず出す。** 日ページは「その日に着く街」
                  しか出さないので、出発の街（カトヴィツェ）はどこにも出ていなかった */}
              <CityMap city={g.city} />
              {/* 地図の下に番号の札を並べない。番号はこの段の行が持っている */}
              <Cats list={g.list} keys={cityKeys(g.city)} />
            </section>
          ))}
          {/* 街に紐づかないもの（郷土料理など）。降りる街の下に置く。 */}
          {nation.length > 0 && (
            <section className="ncgo">
              <h3>{c.name}のどこでも</h3>
              <Cats list={nation} />
            </section>
          )}
        </Panel>
      )}

      {/* 寄るかもしれない街。通り道にあって、まだ決まっていない
          （`content/nordic.ts` の `maybe`）。行く街と同じ高さで開いていると、
          寄ると決まっているように読める。 */}
      {maybe.length > 0 && (
        <Panel>
          <h2>寄るかもしれないところ</h2>
          <p className="muted">通り道にあるところ。寄るかどうかは、これから決まります。</p>
          {maybe.map((g) => (
            <CityFold key={g.city} {...g} />
          ))}
        </Panel>
      )}

      {/* 行かない街。**消さない。** あやとの言葉（2026-09-09）
          「行く予定はないけどこんなところもある。みたいな説明なら良い」。
          街の名前は開いたまま見せて、中身だけ畳む。何があるのかが
          名前で分かるところまでが、この区画の用事。 */}
      {skip.length > 0 && (
        <Panel>
          <h2>行く予定はないけど、こんなところもある</h2>
          {/* 「街」と言い切らない。ラップランドや湖水地方のような、街ではない
              ひとまとまりも混じっている。 */}
          <p className="muted">
            今回のルートからは外れる{skip.length}か所。{skipSpots}件。
          </p>
          {skip.map((g) => (
            <CityFold key={g.city} {...g} />
          ))}
        </Panel>
      )}

      {/* その国あての付箋。**宛先はもう決まっている**ので、テーマを選ばせない。
          テーマの id は国の slug と同じ（`content/themes.ts`）。 */}
      <Notes theme={c.slug} title={`${c.name}でこれやって`} />

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
