import type { Metadata } from "next";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { STREAM_TYPES } from "@/content/streamTypes";
import { STATS_FALLBACK } from "@/content/site";
import { RECIPES } from "@/content/recipes";
import { LEGENDS } from "@/content/legends";
import { LiveNumber } from "@/lib/liveStats";
import { Panel } from "@/components/ui/Bits";
import Fold from "@/components/ui/Fold";
import Icon from "@/components/ui/Icon";
import WeekRail from "@/components/streams/WeekRail";
import { Vid } from "@/components/streams/Vid";
import { H, Rec, Sheet, Zone } from "@/components/streams/Sheet";
import { ArtCam, ArtMedal, ArtStamp } from "@/components/streams/Art";

export const metadata: Metadata = {
  title: "配信",
  description: "クッキング、おさんぽ、アプリ作り、企画会議、月末配信。あやと島の配信は5つの型でできています。",
};

/**
 * 型ごとに1つだけ出す数字。
 *
 * 「配信本数」を5回並べても何も分からないので、
 * その型をやり続けた結果として島に残っているものを数える。
 * 数えられないもの（企画会議・月末配信）には数字を付けない。
 */
const NUM: Record<string, { n: string; cap: string }> = {
  cooking: { n: `${RECIPES.length}品`, cap: "「作った料理」にたまった品数" },
  walk: { n: `${STATS_FALLBACK.countries}カ国`, cap: "歩いた国" },
  making: { n: "1本", cap: "公開までいったアプリ" },
  meeting: { n: `${LEGENDS.length}個`, cap: "ここから生まれた伝説" },
};

export default function StreamsPage() {
  const s = STATS_FALLBACK;
  return (
    <PageShell current="streams" crumbs={[{ label: "配信" }]}>
      {/* h1 は場所の名前にそろえる（`docs/island-world.md` 7.5）。
          「どんな配信をしてるか」は問いなので、すぐ下の1行で受ける。 */}
      <PageHead
        icon="tower-studio"
        title="配信"
        lead="毎晩22時から、世界のどこかで生放送。やってることは大きく5つ。"
      />

      {/* 番組表と数えたものは「やぐらに貼ってある紙」。押すものではないので、
          板の見出しと板の数字カードをやめて、蛍光ペンの帯と罫のます目にする
          （`docs/ac-reference.md` 7章 / `docs/island-world.md` 2.1）。 */}
      <Sheet>
        <Zone>
          <H art={<ArtCam size={32} />}>今夜は、何をやってる日</H>
          <WeekRail />
        </Zone>
        <Zone tight>
          <Rec
            items={[
              {
                n: <LiveNumber statKey="streams" fallback={s.streams} />,
                unit: "回",
                label: "配信した",
                note: `${s.since.replace(/-/g, "/")} から`,
              },
              {
                n: <LiveNumber statKey="streamDays" fallback={s.streamDays} />,
                unit: "日",
                label: "配信した日数",
                note: "休んだ日のほうが少ない",
              },
              {
                n: <LiveNumber statKey="comments" fallback={s.comments} />,
                label: "流れたコメント",
                note: "月末に全部読み返す",
              },
              {
                n: <LiveNumber statKey="people" fallback={s.people} />,
                label: "のべ参加人数",
                note: "島の住人になった人も",
              },
            ]}
          />
        </Zone>
      </Sheet>

      <div className="tys">
        {STREAM_TYPES.map((t, i) => {
          const num = NUM[t.slug];
          // いちばん本数の多いクッキングだけ横幅いっぱい。
          // 5枚が均等に並ぶと、どれから見ればいいのか分からない
          return (
            <details
              className={`ty${t.slug === "cooking" ? " is-wide" : ""}`}
              key={t.slug}
              // 型の色は屋根の帯にだけ渡す（`docs/island-world.md` 3.3）。
              // カードごと染めると、中の数字もボタンも動画の縁も色を持ってしまって、
              // 「この色は何を指しているか」に答えられなくなる。
              // 5枚とも開いていると、この面だけで6画面ぶんになる。屋根（名前と曜日）は
              // 5つとも見せたまま、中身は畳む。開いておくのは1枚目だけ
              // （`docs/island-ux.md` 5.5・`docs/island-design.md` 4章）。
              open={i === 0}
            >
              <summary className="ty-roof" style={{ ["--ty" as string]: t.color }}>
                <img src={`/sprites/${t.icon}.webp`} alt="" />
                <span className="ty-name">
                  <b>{t.name}</b>
                  <span className="ty-when">
                    <Icon name="clock" size={12} />
                    {t.when}
                  </span>
                </span>
                <Icon name="chevron" size={20} className="ty-c" />
              </summary>
              <div className="ty-in">
                <p className="ty-lead">{t.short}</p>
                <ol className="beat">
                  {t.beat.map((b, k) => (
                    <li key={b}>
                      <em>{k + 1}</em>
                      <b>{b}</b>
                    </li>
                  ))}
                </ol>
                {num && (
                  <span className="ty-num">
                    <b>{num.n}</b>
                    <i>{num.cap}</i>
                  </span>
                )}
                <Fold title="もっと詳しく" lead={t.lead} note={`${t.samples.length}本`}>
                  {t.body.map((p, k) => (
                    <p key={k}>{p}</p>
                  ))}
                  <div className="vids is-one" style={{ marginTop: "var(--sp-3)" }}>
                    {t.samples.map((v) => (
                      <Vid key={v.videoId} {...v} />
                    ))}
                  </div>
                </Fold>
                {/* 5つの型ぶんを画面に入った時点で先読みしない。指が乗ってから読む */}
                <Link className="ty-go" href={`/streams/${t.slug}`} prefetch={false}>
                  この型だけ見る
                  <Icon name="right" size={15} />
                </Link>
              </div>
            </details>
          );
        })}
      </div>

      <Panel className="paper">
        <h2>配信のあと、何が島に残るんだろう</h2>
        <p className="muted">配信した日そのものは流れていく。あとに残るのは、この2つ。</p>
        <div className="tiles" style={{ marginTop: "var(--sp-3)" }}>
          {/* 桃（--roof-coral）はクッキング配信の型の色。行き先の飾りに使うと、
              「桃＝クッキングの型」の対応が崩れる。小屋の屋根の色に置き換える。 */}
          <Link className="tile" href="/kitchen" style={{ ["--tile" as string]: "var(--roof-wood)" }}>
            <ArtStamp size={44} className="tile-icon" />
            <span className="tile-text">
              <b>作った料理</b>
              <i>作ってきた {RECIPES.length}品 のスタンプ帳</i>
            </span>
            <Icon name="right" size={15} className="tile-go" />
          </Link>
          <Link className="tile" href="/legends" style={{ ["--tile" as string]: "var(--gold)" }}>
            <ArtMedal size={44} className="tile-icon" />
            <span className="tile-text">
              <b>伝説の企画</b>
              <i>いまも話に出てくる {LEGENDS.length}つ の企画</i>
            </span>
            <Icon name="right" size={15} className="tile-go" />
          </Link>
        </div>
      </Panel>
    </PageShell>
  );
}
