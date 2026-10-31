import type { Metadata } from "next";
import { share } from "@/lib/share";
import { notFound } from "next/navigation";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { H, Rec, Sheet, Zone } from "@/components/streams/Sheet";
import { Vid } from "@/components/streams/Vid";
import { ArtMedal, ArtMeeting, ArtTrophy } from "@/components/streams/Art";
import Icon from "@/components/ui/Icon";
import Fold from "@/components/ui/Fold";
import Phrase from "@/components/ui/Phrase";
import { MONTHS } from "@/content/months";
import { Attend, Flow, MonthNav, Perfect, Taps, Tips, md, monthLabel, yen } from "@/components/months/parts";

/** 出席日数リストを、開いたまま出す人数。ここから下は畳む。 */
const HEAD = 12;

export function generateStaticParams() {
  return MONTHS.map((m) => ({ key: m.key }));
}

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const { key } = await params;
  const m = MONTHS.find((x) => x.key === key);
  if (!m) return {};
  return share({
    key: "months",
    title: `${monthLabel(m)}のふりかえり`,
    description: `${md(m.from)}〜${md(m.to)} の${m.streams.length}本。出席ランキング、投げ銭ありがとう、タップタップ。`,
    path: `/months/${key}`,
  });
}

/**
 * 1ヶ月ぶんのふりかえり。
 *
 * これまで月末配信のページは `public/2026MM_monthly_review.html` を
 * **1枚ずつ手で書いて**いて、2026年1月〜7月は1枚も無かった。
 * ここは元のデータ（`content/months.ts`）から9ヶ月ぶんを同じ形で出す。
 *
 * ## 並び
 *
 * 数 → タップ → 投げ銭 → 出席 → 流れ、の順。
 * **先に「どんな月だったか」が1行で分かる数を置く。** 授賞式の進行
 * （`/monthly-review` 6-1）は読み上げる順なので、読む面ではそのまま使わない。
 * 読む人は上から順に読むとは限らないので、いちばん短いものを上に置く。
 *
 * ## 額
 *
 * **この面だけ、額を出してよい**（`docs/island-money.md` 2章の例外）。
 * 出すのは貢献額で、実額ではない。
 *
 * ## 出していないもの
 *
 * 個人別のコメント数（`/monthly-review` 3章）。
 * OBS の進行用の口（`?role=ctrl` / `?role=view`）も出さない。
 */
export default async function MonthPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const i = MONTHS.findIndex((x) => x.key === key);
  if (i < 0) notFound();
  const m = MONTHS[i];
  // MONTHS は新しい月が先頭。前の月は1つ後ろ、次の月は1つ前
  const prev = MONTHS[i + 1];
  const next = MONTHS[i - 1];

  /** いちばん人が集まった枠。その月の山がどこだったかを1枚で見せる */
  const peak = m.streams.reduce((a, b) => (b.p > a.p ? b : a), m.streams[0]);
  const perfect = m.attend.filter((a) => a.d >= m.denom).length;

  return (
    <PageShell crumbs={[{ label: "ふりかえり", href: "/months" }, { label: monthLabel(m) }]}>
      <PageHead
        icon="stage-award"
        /* 390px で「2026年9月のふりかえ／り」と、1文字だけ2行目に落ちていた。
           折ってよい場所を2つに減らす（`docs/island-standards.md` 16章）。 */
        title={<Phrase parts={[`${monthLabel(m)}の`, "ふりかえり"]} />}
        lead={`${md(m.from)}〜${md(m.to)}。配信${m.streams.length}本、${m.denom}日ぶんのチャットから。`}
      />

      <Sheet>
        <Zone tight>
          <Rec
            items={[
              { n: m.streams.length, unit: "本", label: "配信" },
              { n: m.denom, unit: "日", label: "配信のあった日" },
              { n: m.people, unit: "人", label: "しゃべってくれた人" },
              { n: m.newcomers, unit: "人", label: "はじめましての人" },
            ]}
          />
        </Zone>

        {m.taps !== undefined && (
          <Zone>
            <H art={<ArtMedal size={32} />} note="目標は毎月5万">
              タップタップ
            </H>
            <Taps taps={m.taps} />
          </Zone>
        )}

        {m.tips.length > 0 && (
          <Zone>
            {/* 画面で式を説明しない（`CLAUDE.md`）。出すのは順位と呼び名と額だけ */}
            <H art={<ArtTrophy size={32} />} note={`ぜんぶで ${yen(m.tipTotal)}円`}>
              投げ銭ありがとう
            </H>
            <Tips m={m} />
          </Zone>
        )}

        {/* **出席日数リストが先、皆勤賞が後**（あやと 2026-09-27、#656）。
            先に全員の日数を出して、いちばん上を最後に立てる。 */}
        <Zone>
          <H art={<ArtMeeting size={32} />} note={`いちばんで ${m.attend[0]?.d ?? 0}日`}>
            {m.denom}日のうち、何日いてくれたか
          </H>
          {/* 上から12人までを開いたまま、残りは畳む（`docs/island-design.md` 4）。
              5月はイランまで歩いた月で、2日以上来た人が212人いる。
              全部ひらいたまま並べると、その月だけ面が16,000px になった。 */}
          <Attend rows={m.attend.slice(0, HEAD)} denom={m.denom} />
          {m.attend.length > HEAD && (
            <Fold title="もっと下まで見る" note={`${m.attend.length - HEAD}人`}>
              <Attend rows={m.attend.slice(HEAD)} denom={m.denom} />
            </Fold>
          )}
          <p className="mnote">
            ほかに {m.once}人が、1日だけ来てくれた。
            {m.lost.length > 0 && `（${m.lost.map(md).join("・")} はコメントが残っていないので、前後に来ていた人を出席にしてある）`}
          </p>
        </Zone>

        {perfect > 0 && (
          <Zone>
            <H art={<ArtMedal size={32} />} note={`${perfect}人`}>
              {m.denom}日、ぜんぶいた人
            </H>
            <Perfect months={MONTHS} i={i} />
          </Zone>
        )}

        <Zone tight>
          <H art={<ArtMeeting size={32} />} note={`${m.streams.length}本`}>
            この1ヶ月、なにをしていたか
          </H>
          <div className="mpeak">
            <Vid videoId={peak.v} title={peak.title} date={peak.d} tag={`いちばん集まった日・${peak.p}人`} />
          </div>
        </Zone>

        <Zone>
          <Flow m={m} />
        </Zone>

        {m.review && (
          <Zone>
            <H art={<ArtTrophy size={32} />}>月末配信で出した授賞式</H>
            {/* 進行用の口（`?role=ctrl` / `?role=view`）は出さない。
                あれは配信の進行を送る口で、押した人が勝手に進めてしまう */}
            <a className="mreview" href={m.review}>
              <span className="mreview-b">
                <b>{monthLabel(m)}の授賞式をひらく</b>
                <i>配信で流したものと同じ。クリックで次へ進む</i>
              </span>
              <Icon name="right" size={18} className="mreview-go" />
            </a>
          </Zone>
        )}
      </Sheet>

      <MonthNav prev={prev} next={next} />
    </PageShell>
  );
}
