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
// キッチン小屋の印はサイトで1つ。配信やぐらの札と同じ絵をそのまま使う
// （docs/island-world.md 4.2「同じ場所に絵を2つ作らない」）。
import { ArtStamp } from "@/components/streams/Art";

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

/** この面に出す料理の数。これより多い国は、のこりをキッチン小屋へ渡す。 */
const DISHES = 8;

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
  // まだ出国していない国は、書き出した日で数字が止まる。画面が出てから数え直す。
  const staying = c.stays.find((s) => !s.to);
  const days = closedDays(c.stays);

  return (
    <PageShell current="map" crumbs={[{ label: "旅の桟橋", href: "/map" }, { label: c.name }]}>
      {/* 旗はすぐ下のパスポートに出る。見出しにも置くと同じ絵が2つ並ぶので、
          ここは名前と1行だけにする（docs/island-world.md 7.6 の前置きを短く）。 */}
      <PageHead title={c.name} lead={c.summary} />

      {/* パスポートの1ページ。国の地図・入国のスタンプ・入出国の日付・数字を、
          1枚の紙に罫で割って収める（docs/ac-reference.md 7章）。
          17カ国ぶんが同じ型で並ぶので、国ごとの違いが中身だけになる。

          **主役は地図ひとつ。** 本物の図鑑の面は、絵が縦の半分以上を占めていて、
          そのまわりに何も載っていない（ac-reference 7章 4）。
          前は 64px の旗と国名と丸い印を1行に並べたうえで、
          地図を別のパネルに出していた。紙の上でいちばん大きいものが
          「入国と出国の表」だったので、どこを見ればいいのか言えていなかった。

          旗を大きくして主役にするのは試して、やめた。`Flag` は 20〜30px で
          読めるように角丸と縁の線を決めてあるので、186px にすると
          角丸が幅の1割、縁が 7px の灰色の帯になって、旗に見えない。

          日本語の国名はここには出さない。すぐ上の h1 が国名なので、
          同じ字が2回続く。ここに残すのはローマ字名と地方だけ。 */}
      <Panel className="apass">
        <div className="apass-top">
          <CountryMap slug={c.slug} name={c.name} />
          {/* スタンプは地図の右上に押す。紙に押した印なので、少し傾ける */}
          <span className="apass-stamp" aria-hidden>
            <b>{c.order}</b>
            <i>カ国目</i>
          </span>
        </div>

        <p className="apass-who">
          <span className="apass-flag">
            <Flag slug={c.slug} size={30} />
          </span>
          <em>{c.en}</em>
          <i>{c.region}</i>
        </p>

        <dl className="apass-log">
          {c.stays.map((st, i) => (
            <div key={i}>
              <dt>入国</dt>
              <dd>{fmt(st.from)}</dd>
              <dt>出国</dt>
              <dd>{st.to ? fmt(st.to) : "まだ、いる"}</dd>
            </div>
          ))}
        </dl>

        <div className="apass-num">
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
      </Panel>

      <Panel>
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

      <Panel>
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
        <Panel>
          <h2>この国で作ったごはん</h2>
          {/* 押せる札は 48px＋厚み6px なので、1品で1行 48px 使う。
              ジョージアは25品あって、これだけで 1,224px（1.5画面）あった。
              ここは料理の本体ではなく「この国で何を作ったか」を言う場所なので、
              8品まで出して、その先はキッチン小屋に渡す。 */}
          <div className="chips">
            {cooked.slice(0, DISHES).map((r) => (
              <Link key={r.slug} className="chip" href={`/kitchen/${r.slug}`}>
                <img className="mini-icon" src={`/sprites/${r.icon}.webp`} alt="" />
                {r.name}
              </Link>
            ))}
          </div>
          {cooked.length > DISHES && (
            <Link className="tile" href="/kitchen" style={{ marginTop: 12 }}>
              <ArtStamp size={44} className="tile-icon" />
              <span className="tile-text">
                <b>のこりの{cooked.length - DISHES}品も見る</b>
                <i>キッチン小屋のスタンプ帳に、{c.name}の{cooked.length}品ぜんぶ</i>
              </span>
              <Icon name="right" size={16} className="tile-go" />
            </Link>
          )}
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
