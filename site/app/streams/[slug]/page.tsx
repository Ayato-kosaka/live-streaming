import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import Fold from "@/components/ui/Fold";
import Icon from "@/components/ui/Icon";
import { STREAM_TYPES, streamTypeBySlug } from "@/content/streamTypes";
import { RECIPES } from "@/content/recipes";
import { LEGENDS } from "@/content/legends";
import { STATS_FALLBACK } from "@/content/site";
import { Vid } from "@/components/streams/Vid";
import { H, Rec, Sheet, Zone } from "@/components/streams/Sheet";
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
  ArtBook,
  ArtSignpost,
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

/**
 * その型をやり続けた結果として、島に残っているもの。
 *
 * どの型にも同じ「配信◯本」を出しても何も分からないので、
 * 型ごとに数えられるものだけを数える。数えられない型は出さない。
 */
function figures(slug: string) {
  const cookingStreams = RECIPES.reduce((n, r) => n + r.streams.length, 0);
  const kitchens = new Set(RECIPES.map((r) => r.country)).size;
  switch (slug) {
    case "cooking":
      return [
        { n: RECIPES.length, unit: "品", label: "作って食べた", note: "スタンプ帳に押した数" },
        { n: cookingStreams, unit: "本", label: "そのための配信", note: "買い出しの日もふくめて" },
        { n: kitchens, unit: "カ国", label: "借りたキッチン", note: "宿と、山の中の宿と" },
      ];
    case "walk":
      return [
        { n: STATS_FALLBACK.countries, unit: "カ国", label: "歩いた国", note: "桟橋から地図が見られる" },
        { n: "380", unit: "km", label: "いちばん長く歩いた", note: "エレバンからイラン国境まで" },
      ];
    case "making":
      return [
        { n: 1, unit: "本", label: "公開までいったアプリ", note: "「なに食べよ」" },
        { n: 40, unit: "件", label: "1日でやると宣言した改善", note: "出来るまで終われません" },
      ];
    case "meeting":
      return [
        { n: LEGENDS.length, unit: "つ", label: "ここから生まれた伝説", note: "丘に立っている数" },
        { n: RECIPES.length, unit: "品", label: "ここで決まった料理", note: "メニューはこの日に決まる" },
      ];
    case "monthly":
      // 「1回 / 毎月末」は読んでも何も分からない数字だったのでやめた
      // （`docs/island-design.md` 4章）。数えられるのはこの2つ。
      return [
        { n: 4, unit: "つ", label: "その日に出す賞", note: "出席・名言・おもしろ・投げ銭" },
        { n: "全部", label: "読み返すコメント", note: "その月に流れたぶん" },
      ];
    default:
      return [];
  }
}

export default async function StreamTypePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = streamTypeBySlug(slug);
  if (!t) notFound();
  const i = STREAM_TYPES.findIndex((x) => x.slug === t.slug);
  const prev = STREAM_TYPES[i - 1];
  const next = STREAM_TYPES[i + 1];
  const art = BEAT_ART[t.slug] ?? [];
  const recs = figures(t.slug);

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

      {/*
        5つの型を別物に見せるのは、紙のわずかな染まりだけ（`docs/island-world.md` 3.3）。
        蛍光ペンの帯・動画の縁・下のタイルまで型の色にすると、色が4か所に増えて
        「この色は何を指しているか」に答えられなくなる。紙の作り（罫線・平らなチップ・
        厚みを付けない）は5つとも同じにしておく。
      */}
      <Sheet style={{ ["--zk-tint" as string]: `color-mix(in srgb, ${t.color} 10%, transparent)` }}>
        <Zone>
          {/* 見出しは型ごとに変える。5面とも同じ問いで始めると、
              紙の作りも同じなので5つが同じ面に見える。
              添えの一行は見出しの言い直しだったので落とした。 */}
          <H art={<ArtSignpost size={32} />}>{t.flow}</H>
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
        </Zone>

        {recs.length > 0 && (
          <Zone tight>
            <Rec items={recs} />
          </Zone>
        )}

        <Zone>
          <H art={<ArtBook size={32} />}>この型は、どういうものか</H>
          <p className="zk-lead">{t.lead}</p>
          {/* 畳んだときに見える1行が、開いたあと同じ場所にもう一度出ていた。
              先頭の段落は見出しの下に置いたままにして、続きだけを中に入れる。 */}
          {t.body.length > 1 && (
            <div className="folds" style={{ marginTop: "var(--sp-3)" }}>
              <Fold title="もう少し細かく" lead={t.body[0]} note={`あと${t.body.length - 1}つ`}>
                {t.body.slice(1).map((p, k) => (
                  <p key={k}>{p}</p>
                ))}
              </Fold>
            </div>
          )}
        </Zone>

        <Zone>
          <H art={<ArtCam size={32} />} note={`${t.samples.length}本`}>
            まずは、この回から
          </H>
          <p className="zk-lead">この型がいちばん出ている回。押すと YouTube が開く。</p>
          <div className="vids" style={{ marginTop: "var(--sp-3)" }}>
            {t.samples.map((v, k) => (
              <Vid key={v.videoId} {...v} no={k + 1} />
            ))}
          </div>
        </Zone>
      </Sheet>

      {/* 型の色は紙の染まりで使いきっている。行き先の板は、島の板と同じ木の色。 */}
      {t.deeper && (
        <Link className="tile" href={t.deeper.href} style={{ ["--tile" as string]: "var(--roof-wood)" }}>
          <img className="tile-icon" src={`/sprites/${t.icon}.webp`} alt="" />
          <span className="tile-text">
            <b>{t.deeper.label}</b>
            <i>この型をやり続けて、島にたまったもの</i>
          </span>
          <Icon name="right" size={15} className="tile-go" />
        </Link>
      )}

      {/* 前へ／次へも、指が乗ってから読む。画面に入っただけで両隣を先読みしない */}
      <nav className="pager" style={{ marginTop: "var(--sp-4)" }}>
        {prev ? (
          <Link href={`/streams/${prev.slug}`} prefetch={false}>
            <Icon name="right" size={13} className="is-flip" />
            <img className="mini-icon" src={`/sprites/${prev.icon}.webp`} alt="" />
            {prev.name}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={`/streams/${next.slug}`} prefetch={false}>
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
