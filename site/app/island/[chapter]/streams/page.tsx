import type { Metadata } from "next";
import { share } from "@/lib/share";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { StreamCard } from "@/components/ui/Bits";
import Icon from "@/components/ui/Icon";
import Fold from "@/components/ui/Fold";
import { CHAPTER_STREAMS } from "@/content/chapterStreams";
import { ISLE_STREAM_CHAPTERS } from "@/components/chain/route";
import { chapterHref } from "@/content/chapters";

/**
 * 過去の島の配信だけを並べる面。
 *
 * **オーナーが決めた形**（`docs/island-atlas.md` 7章）:
 *
 * | | 何が出るか |
 * | --- | --- |
 * | `/island/europe/streams` | **その章の配信だけ** |
 * | `/streams` | **全部**（いまの島から入るのはこちら） |
 *
 * 過去は振り返る場所、いまは使う場所。だから**ここは絞る。**
 * いまの島（コーカサス）にこの面は無い。あそこから入るのは `/streams`。
 *
 * ## 型で分けない
 *
 * `/streams` は配信を5つの型（おさんぽ・クッキング・…）で分けているが、
 * ここは**日付の新しい順に、ただ並べる。** 振り返る面なので、
 * 「どういう配信だったか」より「いつ何があったか」で読まれる。
 * 型で分けると、その章に1本しかない型のかたまりが並ぶことになる。
 *
 * ## 月で畳む
 *
 * コーカサスは476本ある。素で並べると 51,479px ＝ **61画面**で、
 * いちばん下まで送るとサムネイルが476枚（約5MB）飛ぶ。
 * 月の見出しを差し込んだだけでは長さは1pxも減らなかったので、
 * **月ごと `<details>` に畳む**（`site/components/ui/Fold.tsx`）。
 * 閉じた `<details>` の中の `loading="lazy"` はブラウザが要求しないので、
 * 着いた時点で飛ぶのは開いている月のぶんだけになる。
 *
 * **「いちばん新しい月を開けておく」はやめた。** そこに何本入っているかは
 * **カレンダーの都合**で決まる。コーカサスを測った日は月が始まったばかりで
 * 12本しか無く 3,198px に収まっていたので、この形で通っていた。同じ作りのまま
 * ヨーロッパは 5,845px（6.9画面）、中東 5,217px、北欧 4,228px——
 * 先頭の月が 35本・34本・24本だから、ただそれだけの理由で
 * （`docs/island-standards.md` 7「溜まっても背が変わらない形にする」）。
 *
 * **かといって、全部畳むのも駄目だった。** 一度そうして、着いた瞬間に配信が
 * **1本も見えない**面になった。面の名前は「○○の配信」で、配信を見にきた人が
 * 索引だけ見せられる。軽くはなったが**面の仕事が落ちている**
 * （`docs/island-misses.md` #207）。
 *
 * ## いまの形
 *
 * **上に新しい3本を出して、残りぜんぶは「月でさがす」の中に置く。**
 *
 * - 着いた時点で見えるのは、いつも**3本**。月に何本あっても変わらない
 * - 月の索引も畳みの中。**月は増えつづける**（コーカサスはもう16か月）ので、
 *   並べたままだと索引だけで 912px になり、それだけで2画面に迫る
 * - だから背は「器＋1段＋3枚」で決まり、**章が変わっても月が増えても動かない**
 *
 * 上の3本は、開いた月の中にももう一度出る。**数を合わせるため**で、
 * 月の札には「35本」と書いてあるのに31本しか無い、という見え方のほうが困る。
 *
 * 3本という数は測って決めた。1枚の背は題名の行数で 100〜200px 変わるので、
 * いちばん長い題名が並んだときでも 390幅・いちばん下まで送って 2画面
 * （1,688px）に収まるのがここまで（実測は下の表）。
 */

export function generateStaticParams() {
  return ISLE_STREAM_CHAPTERS.map((c) => ({ chapter: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ chapter: string }>;
}): Promise<Metadata> {
  const { chapter } = await params;
  const c = ISLE_STREAM_CHAPTERS.find((x) => x.slug === chapter);
  if (!c) return {};
  const n = CHAPTER_STREAMS[c.slug]?.length ?? 0;
  return share({
    key: "atlas",
    title: `${c.name}の配信`,
    description: `${c.from} から ${c.to} まで、${c.name}のあいだに配信した${n}本。`,
    path: `/island/${chapter}/streams`,
  });
}

export default async function ChapterStreams({
  params,
}: {
  params: Promise<{ chapter: string }>;
}) {
  const { chapter } = await params;
  const c = ISLE_STREAM_CHAPTERS.find((x) => x.slug === chapter)!;
  const streams = CHAPTER_STREAMS[c.slug] ?? [];

  /* 同じ日に同じ題名が2本あるぶんだけ、「その日の何本目か」を控える。
     読み上げはリンクの字だけを並べて読むので、題名も日付も人数も同じ2枚は
     1文字も違わずに読まれる（2025-05-10 のエジプト・シワ。止まって
     立て直した回）。題名は YouTube に実在するものなので直せない
     （`docs/island-design.md` 1章の唯一の例外）。
     **ぶつかっていない配信には何も足さない。** どれにも「1本目」が付くと、
     読み上げがうるさいだけで見分けの役に立たない。 */
  const sameDay = new Map<string, string[]>();
  for (const [date, videoId, title] of streams) {
    const key = `${date}\u0000${title}`;
    sameDay.set(key, [...(sameDay.get(key) ?? []), videoId]);
  }
  const nthOf = (date: string, videoId: string, title: string) => {
    const ids = sameDay.get(`${date}\u0000${title}`);
    return ids && ids.length > 1 ? ids.indexOf(videoId) + 1 : undefined;
  };

  // 月ごとにまとめる。焼いてある表はもう新しい順なので、並べ替えない
  const months: { key: string; label: string; rows: typeof streams }[] = [];
  for (const row of streams) {
    const key = row[0].slice(0, 7);
    const last = months[months.length - 1];
    if (last?.key === key) last.rows.push(row);
    else months.push({ key, label: ymLabel(key), rows: [row] });
  }

  return (
    <PageShell
      crumbs={[
        { label: "島の地図", href: "/atlas" },
        /* **行き先を手で組み立てない。** いまいる章の島はトップそのものなので
           （`chapterHref`）、`/island/${c.slug}` と書くと、その章が「いまいる章」に
           なった日だけ**どこからもリンクの来ていない写しの面**へ送ることになる。 */
        { label: c.name, href: chapterHref(c) },
        { label: "配信" },
      ]}
    >
      <PageHead
        icon="tower-studio"
        title={`${c.name}の配信`}
        lead={`${ym(c.from)}から${ym(c.to)}まで、この島にいたあいだの${streams.length}本。新しい順。`}
      />

      {/* いまの配信を探しに来た人を、行き止まりに置かない。
          この面はこの章に絞ってあるので、外への口を先に出す */}
      <p className="chap-note chap-scope">
        ぜんぶ見るなら
        <Link href="/streams" prefetch={false}>
          配信の面
        </Link>
        へ。
      </p>

      {/* 着いた時点で見えるぶん。**数を固定する**ので、月に何本あっても背は変わらない */}
      <div className="scards">
        {streams.slice(0, NEWEST).map(([date, videoId, title, people]) => (
          <StreamCard
            key={videoId}
            videoId={videoId}
            title={title}
            date={date}
            tag={card(people)}
            nth={nthOf(date, videoId, title)}
          />
        ))}
      </div>

      <div className="folds">
        <Fold title="月でさがす" note={`${streams.length}本`}>
          <div className="folds">
            {months.map((m) => (
              <Fold key={m.key} title={m.label} note={`${m.rows.length}本`}>
                <div className="scards">
                  {m.rows.map(([date, videoId, title, people]) => (
                    <StreamCard
                      key={videoId}
                      videoId={videoId}
                      title={title}
                      date={date}
                      tag={card(people)}
                      nth={nthOf(date, videoId, title)}
                    />
                  ))}
                </div>
              </Fold>
            ))}
          </div>
        </Fold>
      </div>

      <p className="chain-foot">
        <Link href={chapterHref(c)} prefetch={false}>
          <Icon name="left" size={14} /> {c.name}の島にもどる
        </Link>
      </p>
    </PageShell>
  );
}

/** 着いた時点で出す本数。**背を決めているのはここ**（上の覚え書き） */
const NEWEST = 3;

/** その日に何人が書き込んだか。配信の大きさが、並べたときに見える */
const card = (people: number) => (people > 0 ? `${people}人` : undefined);

const ym = (d: string) => {
  const [y, m] = d.split("-");
  return `${y}年${Number(m)}月`;
};
const ymLabel = (key: string) => ym(`${key}-01`);
