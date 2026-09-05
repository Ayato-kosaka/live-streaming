import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { Panel } from "@/components/ui/Bits";
import Fold from "@/components/ui/Fold";
import { LEGENDS, legendBySlug } from "@/content/legends";
import Icon from "@/components/ui/Icon";
import { Fig, Vid } from "@/components/streams/Vid";
import { ArtMedal } from "@/components/streams/Art";

export function generateStaticParams() {
  return LEGENDS.map((l) => ({ slug: l.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const l = legendBySlug(slug);
  if (!l) return {};
  return { title: l.title, description: l.lead };
}

export default async function LegendPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const l = legendBySlug(slug);
  if (!l) notFound();
  const i = LEGENDS.findIndex((x) => x.slug === l.slug);
  const prev = LEGENDS[i - 1];
  const next = LEGENDS[i + 1];
  const streams = [...l.streams].sort((a, b) => (a.date < b.date ? -1 : 1));

  return (
    <PageShell
      current="streams"
      crumbs={[
        { label: "配信やぐら", href: "/streams" },
        { label: "伝説の丘", href: "/legends" },
        { label: l.title },
      ]}
    >
      <PageHead
        icon={l.icon}
        title={l.title}
        meta={
          <span className="chip dark">
            <Icon name="calendar" size={13} />
            {l.span ?? l.date.replace(/-/g, "/")}
          </span>
        }
      />

      {/* 記念の額。この面でいちばん先に目に入るのが数字であってほしい */}
      <div className="lg-top">
        <span className="lg-top-tag">
          <ArtMedal size={24} />
          記録
        </span>
        <div style={{ marginTop: 12 }}>
          <Fig f={l.figure} />
        </div>
        <p>{l.lead}</p>
        <div className="figs">
          {(l.facts ?? []).map((f) => (
            <Fig key={f.cap} f={f} />
          ))}
          <div>
            <span className="fig">
              <b>{l.streams.length}</b>
              <i>本</i>
            </span>
            <span className="fig-cap">残っている配信</span>
          </div>
        </div>
      </div>

      <Panel>
        <h2>何があったか</h2>
        <p>{l.body[0]}</p>
        {l.body.length > 1 && (
          <Fold title="続きを読む" lead={l.body[1]} note={`あと${l.body.length - 1}つ`}>
            {l.body.slice(1).map((p, k) => (
              <p key={k}>{p}</p>
            ))}
          </Fold>
        )}
      </Panel>

      <Panel>
        <h2>その時の配信</h2>
        <p className="muted">古い順。上から下へ読むと、その日にどこまで進んだか分かります。</p>
        <ul className="days" style={{ marginTop: 14 }}>
          {streams.map((s, k) => (
            <li key={s.videoId}>
              <span className="days-n">
                {s.date.slice(5, 7).replace(/^0/, "")}/{s.date.slice(8, 10).replace(/^0/, "")}
              </span>
              <span className="vids is-one" style={{ flex: 1, minWidth: 0 }}>
                <Vid videoId={s.videoId} title={s.title} tag={`${k + 1}本目`} />
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <nav className="pager">
        {prev ? (
          <Link href={`/legends/${prev.slug}`}>
            <Icon name="right" size={13} className="is-flip" />
            <img className="mini-icon" src={`/sprites/${prev.icon}.webp`} alt="" />
            {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={`/legends/${next.slug}`}>
            <img className="mini-icon" src={`/sprites/${next.icon}.webp`} alt="" />
            {next.title}
            <Icon name="right" size={13} />
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </PageShell>
  );
}
