import type { Metadata } from "next";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { Panel, StreamCard } from "@/components/ui/Bits";
import Flag from "@/components/ui/Flag";
import Icon from "@/components/ui/Icon";
import { CHAIN, chapterDays, type Chapter } from "@/content/chapters";
import { CHAPTER_STATS } from "@/content/chapterStats";
import { CHAPTER_STREAMS } from "@/content/chapterStreams";
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
 * ## 住人
 *
 * **その章のあいだに来てくれていた人**（仕様 3章）。
 * どの絵が誰かは alertbox の Viewers 表だけが決める（`python/residents_map.json`）。
 * 表に載っていない人は絵が無いので、**人数には入るが島には立たない。**
 * だから「258人が来た」と並んでいる顔の数は合わない。**別のものを数えている。**
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

/** 住人の絵。島のステージと同じ大きさで取る（`components/island/IslandStage.tsx`） */
const residentIcon = (id: string) => `https://lh3.googleusercontent.com/d/${id}=s128`;

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
  // **その章の配信だけ。** 焼いてある表を、そのままの並び（新しい順）で使う
  const streams = CHAPTER_STREAMS[c.slug] ?? [];

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

      {st && st.residents.length > 0 && (
        <Panel className="chap-sec">
          <h2>この島にいた人</h2>
          <p className="chap-note">
            この期間に来てくれていた人のうち、キャラクターのある{st.residents.length}人。
            数字は、チャットを書いてくれた日の数です。
          </p>
          <ul className="chap-folk">
            {st.residents.map((r) => (
              <li key={r.icon}>
                <img src={residentIcon(r.icon)} alt="" loading="lazy" width={48} height={48} />
                <b>{r.days}日</b>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {streams.length > 0 && (
        <Panel className="chap-sec">
          <h2>この島の配信</h2>
          <p className="chap-note">
            この期間の{streams.length}本のうち、新しい3本。
            いまの島から入ると
            <Link href="/streams" prefetch={false}>
              全部の配信
            </Link>
            が見られます。
          </p>
          <div className="scards">
            {streams.slice(0, 3).map(([date, videoId, title]) => (
              <StreamCard key={videoId} videoId={videoId} title={title} date={date} />
            ))}
          </div>
          <Link className="chap-more" href={`/island/${c.slug}/streams`} prefetch={false}>
            <span>
              <b>この島の配信を全部見る</b>
              <i>{streams.length}本。この章のぶんだけ</i>
            </span>
            <Icon name="right" size={16} />
          </Link>
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
