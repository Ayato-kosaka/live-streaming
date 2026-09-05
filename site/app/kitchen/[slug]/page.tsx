import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import PageShell from "@/components/ui/PageShell";
import { RECIPES, kindLabel, recipeBySlug, recipeNo, type RecipeStream } from "@/content/recipes";
import { countryBySlug } from "@/content/countries";
import Flag from "@/components/ui/Flag";
import Icon from "@/components/ui/Icon";
import { Vid } from "@/components/streams/Vid";
import { Dish } from "@/components/streams/KitchenCatalog";
import { H, Rec, Sheet, Tape, Zone } from "@/components/streams/Sheet";
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
  const steps = [...r.streams].sort((a, b) => (a.date < b.date ? -1 : 1));
  const no = recipeNo(r.slug);

  /** 同じ国のキッチンで作ったもの。旅の記憶はだいたい国でつながっている。 */
  const sameCountry = sorted.filter((x) => x.country === r.country && x.slug !== r.slug).slice(0, 10);
  /** 同じ種類の品。「粉ものばかり作っていた時期」がここから見える。 */
  const sameKind = sorted.filter((x) => x.kind === r.kind && x.slug !== r.slug).slice(0, 10);

  /** その日から今日まで何日か、ではなく「何品目だったか」を出す。日数は毎日ずれる。 */
  const total = RECIPES.length;

  return (
    <PageShell
      current="streams"
      crumbs={[
        { label: "配信やぐら", href: "/streams" },
        { label: "キッチン小屋", href: "/kitchen" },
        { label: r.name },
      ]}
    >
      <Sheet>
        {/* 図鑑の1ページ。まず絵、そのあとに名前。順番を逆にしない */}
        <Zone>
          <div className="zk-hero">
            <span className="zk-hero-no">
              No.{String(no).padStart(2, "0")} / {total}
            </span>
            <div className="zk-hero-art">
              <img src={`/sprites/${r.icon}.webp`} alt="" />
            </div>
            <h1 className="zk-tape-h">
              <Tape>{r.name}</Tape>
            </h1>
            <p className="zk-hero-note">{r.note}</p>
          </div>
        </Zone>

        <Zone tight>
          <Rec
            items={[
              {
                n: `${r.date.slice(5, 7).replace(/^0/, "")}/${r.date.slice(8, 10).replace(/^0/, "")}`,
                label: "作って食べた日",
                note: `${r.date.slice(0, 4)}年`,
              },
              { n: <Flag slug={r.country} size={30} />, label: "借りたキッチン", note: c?.name },
              { n: steps.length, unit: "日", label: "かかった日数", note: steps.map((s) => s.label).join(" → ") },
              { n: kindLabel(r.kind), label: "どんな料理", note: "スタンプ帳の分けかた" },
            ]}
          />
        </Zone>

        <Zone>
          <H note={`${steps.length}日ぶん`}>この1品は、こう進んだ</H>
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
                      <Vid videoId={s.videoId} title={s.title} />
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </Zone>

        {sameCountry.length > 0 && c && (
          <>
            <Zone tight>
              <H note={`${c.name}で ${sameCountry.length}品`}>同じキッチンで作ったもの</H>
            </Zone>
            <Zone flush>
              <div className="kt-near">
                {sameCountry.map((x) => (
                  <Dish key={x.slug} r={x} />
                ))}
              </div>
            </Zone>
          </>
        )}

        {sameKind.length > 0 && (
          <>
            <Zone tight>
              <H note={`${sameKind.length}品`}>おなじ「{kindLabel(r.kind)}」の棚</H>
            </Zone>
            <Zone flush>
              <div className="kt-near">
                {sameKind.map((x) => (
                  <Dish key={x.slug} r={x} />
                ))}
              </div>
            </Zone>
          </>
        )}
      </Sheet>

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
