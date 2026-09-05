import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import PageShell from "@/components/ui/PageShell";
import Fold from "@/components/ui/Fold";
import { LEGENDS, legendBySlug } from "@/content/legends";
import Icon from "@/components/ui/Icon";
import { Fig, Vid } from "@/components/streams/Vid";
import { H, Sheet, Tape, Zone } from "@/components/streams/Sheet";
import { ArtBook, ArtCam } from "@/components/streams/Art";

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
  /** 何日にまたがっているか。1日で終わった日はここを出さない。 */
  const days = new Set(streams.map((s) => s.date)).size;

  return (
    <PageShell
      crumbs={[
        { label: "伝説の企画", href: "/legends" },
        { label: l.title },
      ]}
    >
      <Sheet>
        {/* この面でいちばん先に目に入るのが数字であってほしい */}
        <Zone>
          <div className="zk-hero">
            <span className="zk-hero-no">{l.span ?? l.date.replace(/-/g, "/")}</span>
            <h1 className="zk-tape-h">
              <Tape>{l.title}</Tape>
            </h1>
            <div className="zk-hero-art">
              {/* 主役の絵は、焼き直したほう（`sprites/hero/`）を直に指す。
                  1x/2x で配ると、等倍の画面がここだけ小さいほうを選ぶ */}
              <img src={`/sprites/hero/${l.icon}.webp`} alt="" />
            </div>
            <div className="lg-hero-fig">
              <Fig f={l.figure} />
            </div>
            <p className="zk-hero-note">{l.lead}</p>
          </div>
        </Zone>

        <Zone tight>
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
            {days > 1 && (
              <div>
                <span className="fig">
                  <b>{days}</b>
                  <i>日</i>
                </span>
                <span className="fig-cap">配信のあった日</span>
              </div>
            )}
          </div>
        </Zone>

        <Zone>
          <H art={<ArtBook size={32} />}>何があったか</H>
          <p className="zk-lead">{l.body[0]}</p>
          {/* 畳んだときに見える1行が、開いたあと同じ場所にもう一度出ていた。
              見出しの下に見せる段落は中に入れず、その続きだけを畳む。 */}
          {l.body.length === 2 && <p className="zk-lead">{l.body[1]}</p>}
          {l.body.length > 2 && (
            <div className="folds" style={{ marginTop: "var(--sp-3)" }}>
              <Fold title="この先に、まだ続きがある" lead={l.body[1]} note={`あと${l.body.length - 2}つ`}>
                {l.body.slice(2).map((p, k) => (
                  <p key={k}>{p}</p>
                ))}
              </Fold>
            </div>
          )}
        </Zone>

        <Zone>
          <H art={<ArtCam size={32} />} note={`${streams.length}本`}>
            その時の配信
          </H>
          <p className="zk-lead">古い順。上から下へ読むと、その日にどこまで進んだか分かります。</p>
          <ul className="days" style={{ marginTop: "var(--sp-3)" }}>
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
        </Zone>
      </Sheet>

      {/* 前へ／次へも、指が乗ってから読む。画面に入っただけで両隣を先読みしない */}
      <nav className="pager">
        {prev ? (
          <Link href={`/legends/${prev.slug}`} prefetch={false}>
            <Icon name="right" size={13} className="is-flip" />
            <img className="mini-icon" src={`/sprites/${prev.icon}.webp`} alt="" />
            {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={`/legends/${next.slug}`} prefetch={false}>
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
