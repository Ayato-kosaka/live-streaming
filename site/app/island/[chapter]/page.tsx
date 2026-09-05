import type { Metadata } from "next";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { Panel, StreamCard } from "@/components/ui/Bits";
import Flag from "@/components/ui/Flag";
import Icon from "@/components/ui/Icon";
import { CHAIN, chapterDays, type Chapter } from "@/content/chapters";
import { CHAPTER_STATS } from "@/content/chapterStats";
import { COUNTRIES } from "@/content/countries";
import { LEGENDS } from "@/content/legends";
import IslandMark from "@/components/chain/IslandMark";
import { chapterHref, PAST_CHAPTERS } from "@/components/chain/route";

/**
 * 過去の島。
 *
 * ## いまの島の6つを写さない
 *
 * **その章のときに何をしていたかで決める**（`docs/island-atlas.md` 4章）。
 * 「作った料理」はジョージアに落ち着いてから始めたことなので、
 * ヨーロッパの島には建てない。その章に無かったものを建てると、島が嘘をつく。
 *
 * だから、建てるものを章ごとに手で並べるのではなく、
 * **その章に中身のあるものだけが建つ**ようにしてある。
 * 歩いた国が0なら国の区画は出ないし、伝説の企画が無い章には碑が立たない。
 * 素材の足りない章は、建つものが自然に減る。
 *
 * ## この島だけに絞る
 *
 * 過去は**振り返る場所**、いまは**使う場所**（同 7章）。
 * ここに出る国も配信も企画も、全部その章の期間に入っているものだけ。
 * 全部を見たい人は、いまの島から `/map` や `/streams` へ行く。
 *
 * ## まだ無いもの
 *
 * `/island/<章>/streams`（その章の配信だけを並べた面）は、まだ作っていない。
 * 章ごとの配信の一覧は BigQuery にしかなく、焼いた表がまだ無いため
 * （いまここに出しているのは、国のページが持っている「その国の見どころ配信」）。
 *
 * 住人も、キャラクターの絵と YouTube のチャンネルを結ぶ表が無いので
 * （GitHub #113）、**数だけ**出している。誰が来ていたかは出せない。
 */

export function generateStaticParams() {
  return PAST_CHAPTERS.map((c) => ({ chapter: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ chapter: string }>;
}): Promise<Metadata> {
  const { chapter } = await params;
  const c = PAST_CHAPTERS.find((x) => x.slug === chapter);
  if (!c) return {};
  return {
    title: c.name,
    description: `${c.from} から ${c.to} まで。${c.note}`,
  };
}

/** その章の期間に入っている伝説の企画 */
const legendsOf = (c: Chapter) => LEGENDS.filter((l) => l.date >= c.from && l.date <= c.to);

/**
 * その章の配信。
 *
 * 国のページが持っている「見どころ配信」から、章の期間に入るものだけ拾う。
 * **`/streams` の全部を持ってこない。**（過去の島は、その章に絞る）
 */
function streamsOf(c: Chapter) {
  const out: { videoId: string; title: string; date: string }[] = [];
  for (const slug of c.countries) {
    const country = COUNTRIES.find((x) => x.slug === slug);
    for (const h of country?.highlights ?? []) {
      if (h.videoId && h.date && h.date >= c.from && h.date <= c.to) {
        out.push({ videoId: h.videoId, title: h.title, date: h.date });
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
}

export default async function ChapterIsland({
  params,
}: {
  params: Promise<{ chapter: string }>;
}) {
  const { chapter } = await params;
  const c = PAST_CHAPTERS.find((x) => x.slug === chapter)!;
  const days = chapterDays(c);
  const st = CHAPTER_STATS[c.slug];
  const countries = c.countries
    .map((s) => COUNTRIES.find((x) => x.slug === s))
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
  const legends = legendsOf(c);
  const streams = streamsOf(c);

  const i = CHAIN.indexOf(c);
  const prev = CHAIN[i - 1];
  const next = CHAIN[i + 1];

  return (
    <PageShell crumbs={[{ label: "島の地図", href: "/atlas" }, { label: c.name }]}>
      <PageHead
        title={c.name}
        lead={c.note}
        say={`${ym(c.from)}から${ym(c.to)}まで、${days}日いた島だよ。`}
      />

      {/* 島そのもの。連なりの画面と同じ絵をそのまま大きく出す。
          別の絵を描くと、連なりで見た島とここの島が別のものに見える */}
      <div className="chap-hero" data-ch={c.slug}>
        <IslandMark slug={c.slug} days={days} />
      </div>

      <div className="chap-facts">
        <b>
          {ym(c.from)} 〜 {ym(c.to)}
        </b>
        <span>
          <b>{days.toLocaleString()}</b>日
        </span>
        {st && (
          <>
            <span>
              <b>{st.streams}</b>本の配信
            </span>
            <span>
              <b>{st.people.toLocaleString()}</b>人が来た
            </span>
          </>
        )}
        <span>
          <b>{countries.length}</b>カ国
        </span>
      </div>

      {countries.length > 0 && (
        <Panel className="chap-sec">
          <h2>この島で歩いた国</h2>
          <div className="chap-flags">
            {countries.map((k) => (
              <Link key={k.slug} className="chap-flag" href={`/map/${k.slug}`} prefetch={false}>
                <Flag slug={k.slug} size={26} />
                <b>{k.name}</b>
              </Link>
            ))}
          </div>
        </Panel>
      )}

      {legends.length > 0 && (
        <Panel className="chap-sec">
          <h2>この島で起きたこと</h2>
          <div className="chap-legends">
            {legends.map((l) => (
              <Link key={l.slug} className="chap-legend" href={`/legends/${l.slug}`} prefetch={false}>
                <img src={`/sprites/${l.icon}.webp`} alt="" loading="lazy" />
                <span>
                  <b>{l.title}</b>
                  <i>
                    {l.figure.n}
                    {l.figure.unit} — {l.figure.cap}
                  </i>
                </span>
                <Icon name="right" size={15} />
              </Link>
            ))}
          </div>
        </Panel>
      )}

      {streams.length > 0 && (
        <Panel className="chap-sec">
          <h2>この島の配信</h2>
          <p className="chap-note">
            この期間の配信から。いまの島から入ると
            <Link href="/streams" prefetch={false}>
              全部の配信
            </Link>
            が見られます。
          </p>
          <div className="scards">
            {streams.map((s) => (
              <StreamCard key={s.videoId} videoId={s.videoId} title={s.title} date={s.date} />
            ))}
          </div>
        </Panel>
      )}

      {/* 島から島へ。船はまだ無いので、いまは渡し板だけ */}
      <nav className="chap-sail" aria-label="となりの島">
        {prev && (
          <Link className="chap-sail-go" href={chapterHref(prev)} prefetch={false}>
            <Icon name="left" size={15} />
            <span>
              <i>ひとつ前の島</i>
              <b>{prev.name}</b>
            </span>
          </Link>
        )}
        {next && (
          <Link className="chap-sail-go is-next" href={chapterHref(next)} prefetch={false}>
            <span>
              <i>つぎの島</i>
              <b>{next.name}</b>
            </span>
            <Icon name="right" size={15} />
          </Link>
        )}
      </nav>

      <p className="chain-foot">
        <Link href="/atlas" prefetch={false}>
          島の地図にもどる
        </Link>
      </p>
    </PageShell>
  );
}

const ym = (d: string) => {
  const [y, m] = d.split("-");
  return `${y}年${Number(m)}月`;
};
