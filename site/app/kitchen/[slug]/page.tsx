import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { Panel } from "@/components/ui/Bits";
import { RECIPES, recipeBySlug, type RecipeStream } from "@/content/recipes";
import { countryBySlug } from "@/content/countries";
import Flag from "@/components/ui/Flag";
import Icon from "@/components/ui/Icon";
import { Vid } from "@/components/streams/Vid";
import { Dish } from "@/components/streams/KitchenCatalog";
import { ArtBasket, ArtCam, ArtFlame, ArtMeeting, ArtPot } from "@/components/streams/Art";

export function generateStaticParams() {
  return RECIPES.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const r = recipeBySlug(slug);
  if (!r) return {};
  return { title: r.name, description: r.note };
}

/** その日が何の日だったか。マスの絵と、ひとことの説明。 */
const STEP: Record<RecipeStream["label"], { art: React.ComponentType<{ size?: number }>; note: string }> = {
  企画会議: { art: ArtMeeting, note: "何を作るかを決めた日" },
  買い出し: { art: ArtBasket, note: "材料を探しに出た日" },
  調理: { art: ArtPot, note: "作って、食べた日" },
  リベンジ: { art: ArtFlame, note: "もう一度やり直した日" },
  配信: { art: ArtCam, note: "この日の配信" },
};

export default async function RecipePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = recipeBySlug(slug);
  if (!r) notFound();
  const c = countryBySlug(r.country);
  const sorted = [...RECIPES].sort((a, b) => (a.date < b.date ? 1 : -1));
  const i = sorted.findIndex((x) => x.slug === r.slug);
  const prev = sorted[i - 1];
  const next = sorted[i + 1];
  /** 同じ国のキッチンで作ったもの。旅の記憶はだいたい国でつながっている。 */
  const sameCountry = sorted.filter((x) => x.country === r.country && x.slug !== r.slug).slice(0, 8);
  const steps = [...r.streams].sort((a, b) => (a.date < b.date ? -1 : 1));

  return (
    <PageShell
      current="streams"
      crumbs={[
        { label: "配信やぐら", href: "/streams" },
        { label: "キッチン小屋", href: "/kitchen" },
        { label: r.name },
      ]}
    >
      <PageHead
        icon={r.icon}
        title={r.name}
        lead={r.note}
        meta={
          <>
            <span className="chip dark">
              <Icon name="calendar" size={13} />
              {r.date.replace(/-/g, "/")}
            </span>
            <span className="chip dark">
              <Icon name="clock" size={13} />
              {steps.length}日がかり
            </span>
            {c && (
              <Link className="chip dark" href={`/map/${c.slug}`}>
                <Flag slug={c.slug} size={20} />
                {c.name}で作った
              </Link>
            )}
          </>
        }
      />

      <Panel>
        <h2>この1品は、こう進んだ</h2>
        <ol className="rt">
          {steps.map((s, k) => {
            const st = STEP[s.label] ?? STEP["配信"];
            const A = st.art;
            return (
              <li key={s.videoId}>
                <span className="rt-stop">
                  <span className="rt-n">{k + 1}</span>
                  <A size={40} />
                </span>
                <span className="rt-body">
                  <span className="rt-head">
                    <b>{s.label}</b>
                    <time>{s.date.replace(/-/g, "/")}</time>
                    <span className="sub">{st.note}</span>
                  </span>
                  <span className="vids is-one">
                    <Vid videoId={s.videoId} title={s.title} date={s.date} />
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      </Panel>

      {sameCountry.length > 0 && c && (
        <Panel>
          <h2>
            <Flag slug={c.slug} size={26} /> 同じキッチンで作ったもの
          </h2>
          <p className="muted">{c.name}にいるあいだに押したスタンプ。</p>
          <div className="kt-near" style={{ marginTop: 12 }}>
            {sameCountry.map((x) => (
              <Dish key={x.slug} r={x} />
            ))}
          </div>
        </Panel>
      )}

      <nav className="pager">
        {prev ? (
          <Link href={`/kitchen/${prev.slug}`}>
            <Icon name="right" size={13} className="is-flip" />
            <img className="mini-icon" src={`/sprites/${prev.icon}.webp`} alt="" />
            {prev.name}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={`/kitchen/${next.slug}`}>
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
