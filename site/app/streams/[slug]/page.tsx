import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { Panel } from "@/components/ui/Bits";
import Fold from "@/components/ui/Fold";
import Icon from "@/components/ui/Icon";
import { STREAM_TYPES, streamTypeBySlug } from "@/content/streamTypes";
import { Vid } from "@/components/streams/Vid";
import {
  ArtBasket,
  ArtBoots,
  ArtCam,
  ArtFlame,
  ArtLaptop,
  ArtMedal,
  ArtMeeting,
  ArtPot,
  ArtStamp,
  ArtSun,
  ArtTrophy,
} from "@/components/streams/Art";

export function generateStaticParams() {
  return STREAM_TYPES.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const t = streamTypeBySlug(slug);
  if (!t) return {};
  return { title: t.name, description: t.lead };
}

/**
 * 流れの3つのマスに置く絵。
 *
 * 「①②③」と番号だけ並べても、何をしている日なのかは伝わらない。
 * その型で実際にやっていることの絵を、順番に置く。
 */
const BEAT_ART: Record<string, React.ComponentType<{ size?: number }>[]> = {
  cooking: [ArtMeeting, ArtBasket, ArtPot],
  walk: [ArtSun, ArtBoots, ArtCam],
  making: [ArtMeeting, ArtLaptop, ArtFlame],
  meeting: [ArtCam, ArtMeeting, ArtStamp],
  monthly: [ArtMeeting, ArtMedal, ArtTrophy],
};

export default async function StreamTypePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = streamTypeBySlug(slug);
  if (!t) notFound();
  const i = STREAM_TYPES.findIndex((x) => x.slug === t.slug);
  const prev = STREAM_TYPES[i - 1];
  const next = STREAM_TYPES[i + 1];
  const art = BEAT_ART[t.slug] ?? [];

  return (
    <PageShell current="streams" crumbs={[{ label: "配信やぐら", href: "/streams" }, { label: t.name }]}>
      <PageHead
        icon={t.icon}
        title={t.name}
        lead={t.short}
        meta={
          <span className="chip dark">
            <Icon name="clock" size={13} />
            {t.when}
          </span>
        }
      />

      <div style={{ ["--ty" as string]: t.color }}>
        <Panel>
          <h2 style={{ ["--frame" as string]: t.color }}>この日は、こういう順で進む</h2>
          <ol className="rt">
            {t.beat.map((b, k) => {
              const A = art[k];
              return (
                <li key={b}>
                  <span className="rt-stop">
                    <span className="rt-n">{k + 1}</span>
                    {A ? <A size={40} /> : null}
                  </span>
                  <span className="rt-body">
                    <span className="rt-head">
                      <b>{b}</b>
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
          <p style={{ marginTop: 16 }}>{t.lead}</p>
          <Fold title="この型のこと、もう少し" lead={t.body[0]} note={`${t.body.length}つ`}>
            {t.body.map((p, k) => (
              <p key={k}>{p}</p>
            ))}
          </Fold>
        </Panel>

        <Panel>
          <h2 style={{ ["--frame" as string]: t.color }}>まずは、この回から</h2>
          <p className="muted">どれも1本で完結します。押すと YouTube が開きます。</p>
          <div className="vids" style={{ marginTop: 14 }}>
            {t.samples.map((v, k) => (
              <Vid key={v.videoId} {...v} no={k + 1} />
            ))}
          </div>
        </Panel>

        {t.deeper && (
          <Link className="tile" href={t.deeper.href} style={{ ["--tile" as string]: t.color }}>
            <img className="tile-icon" src={`/sprites/${t.icon}.webp`} alt="" />
            <span className="tile-text">
              <b>{t.deeper.label}</b>
              <i>この型をやり続けて、島にたまったもの</i>
            </span>
            <Icon name="right" size={15} className="tile-go" />
          </Link>
        )}
      </div>

      <nav className="pager" style={{ marginTop: 18 }}>
        {prev ? (
          <Link href={`/streams/${prev.slug}`}>
            <Icon name="right" size={13} className="is-flip" />
            <img className="mini-icon" src={`/sprites/${prev.icon}.webp`} alt="" />
            {prev.name}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={`/streams/${next.slug}`}>
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
