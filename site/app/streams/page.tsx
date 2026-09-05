import type { Metadata } from "next";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { GUIDE } from "@/content/voice";
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
import { ArtCam, ArtMedal, ArtStamp } from "@/components/streams/Art";

export const metadata: Metadata = {
  title: "どんな配信をしてるか",
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
  cooking: { n: `${RECIPES.length}品`, cap: "キッチン小屋にたまった料理" },
  walk: { n: `${STATS_FALLBACK.countries}カ国`, cap: "歩いた国" },
  making: { n: "1本", cap: "公開までいったアプリ" },
  meeting: { n: `${LEGENDS.length}個`, cap: "ここから生まれた伝説" },
};

export default function StreamsPage() {
  const s = STATS_FALLBACK;
  return (
    <PageShell current="streams" crumbs={[{ label: "配信やぐら" }]}>
      <PageHead
        icon="tower-studio"
        title="どんな配信をしてるか"
        lead="毎晩22時から、世界のどこかで生放送。やってることは大きく5つに分かれています。"
        say={GUIDE.streams}
      />

      <Panel>
        <h2>
          <ArtCam size={30} /> 今夜は、何をやってる日
        </h2>
        <WeekRail />
        <div className="stats" style={{ marginTop: 16 }}>
          <Stat value={<LiveNumber statKey="streams" fallback={s.streams} />} label="配信した回数" sub={`${s.since.replace(/-/g, "/")} から`} />
          <Stat value={<LiveNumber statKey="streamDays" fallback={s.streamDays} />} label="配信した日数" sub="休んだ日のほうが少ない" />
          <Stat value={<LiveNumber statKey="comments" fallback={s.comments} />} label="流れたコメント" sub="月末に全部読み返す" />
          <Stat value={<LiveNumber statKey="people" fallback={s.people} />} label="のべ参加人数" sub="島の住人になった人も" />
        </div>
      </Panel>

      <div className="tys">
        {STREAM_TYPES.map((t, i) => {
          const num = NUM[t.slug];
          return (
            {/* いちばん本数の多いクッキングだけ横幅いっぱい。
                5枚が均等に並ぶと、どれから見ればいいのか分からない */}
            <article
              className={`ty${t.slug === "cooking" ? " is-wide" : ""}`}
              key={t.slug}
              style={{ ["--ty" as string]: t.color }}
            >
              <div className="ty-roof">
                <img src={`/sprites/${t.icon}.webp`} alt="" />
                <span className="ty-name">
                  <b>{t.name}</b>
                  <span className="ty-when">
                    <Icon name="clock" size={12} />
                    {t.when}
                  </span>
                </span>
              </div>
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
                <Fold title="もっと詳しく" lead={t.lead} note={`${t.samples.length}本`} open={i === 0}>
                  {t.body.map((p, k) => (
                    <p key={k}>{p}</p>
                  ))}
                  <div className="vids is-one" style={{ marginTop: 12 }}>
                    {t.samples.map((v) => (
                      <Vid key={v.videoId} {...v} />
                    ))}
                  </div>
                </Fold>
                <Link className="ty-go" href={`/streams/${t.slug}`}>
                  この型だけ見る
                  <Icon name="right" size={15} />
                </Link>
              </div>
            </article>
          );
        })}
      </div>

      <Panel>
        <h2>配信のあとに、島に残るもの</h2>
        <p className="muted">やった日は流れていくけれど、作ったものと大きい企画はここにたまっていきます。</p>
        <div className="tiles" style={{ marginTop: 14 }}>
          <Link className="tile" href="/kitchen" style={{ ["--tile" as string]: "var(--roof-coral)" }}>
            <ArtStamp size={44} className="tile-icon" />
            <span className="tile-text">
              <b>キッチン小屋</b>
              <i>作ってきた {RECIPES.length}品 のスタンプ帳</i>
            </span>
            <Icon name="right" size={15} className="tile-go" />
          </Link>
          <Link className="tile" href="/legends" style={{ ["--tile" as string]: "var(--gold)" }}>
            <ArtMedal size={44} className="tile-icon" />
            <span className="tile-text">
              <b>伝説の丘</b>
              <i>いまも話に出てくる {LEGENDS.length}つ の企画</i>
            </span>
            <Icon name="right" size={15} className="tile-go" />
          </Link>
        </div>
      </Panel>
    </PageShell>
  );
}

/** 数字ひとつ。`Bits.tsx` の Stat と同じ形だが、説明を必ず1行付ける。 */
function Stat({ value, label, sub }: { value: React.ReactNode; label: string; sub: string }) {
  return (
    <div className="stat">
      <b>{value}</b>
      <span>{label}</span>
      <i>{sub}</i>
    </div>
  );
}
