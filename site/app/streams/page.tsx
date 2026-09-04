import type { Metadata } from "next";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { GUIDE } from "@/content/voice";
import { STREAM_TYPES } from "@/content/streamTypes";
import { STATS_FALLBACK } from "@/content/site";
import { Panel, StreamCard, Stat } from "@/components/ui/Bits";
import Link from "next/link";

export const metadata: Metadata = {
  title: "どんな配信をしてるか",
  description: "クッキング、おさんぽ、アプリ作り、企画会議、月末配信。あやと島の配信は5つの型でできています。",
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

      <div className="stats" style={{ marginBottom: 18 }}>
        <Stat value={s.streams.toLocaleString()} label="配信本数" sub={`${s.since.replace(/-/g, "/")} から`} />
        <Stat value={s.streamDays.toLocaleString()} label="配信した日数" />
        <Stat value={s.comments.toLocaleString()} label="流れたコメント" />
        <Stat value={s.people.toLocaleString()} label="のべ参加人数" />
      </div>

      {STREAM_TYPES.map((t) => (
        <Panel key={t.slug}>
          <h2 style={{ ["--frame" as string]: t.color }}>
            <img className="h2-icon" src={`/sprites/${t.icon}.webp`} alt="" /> {t.name}
          </h2>
          <div className="chips" style={{ marginBottom: 10 }}>
            <span className="chip">🕙 {t.when}</span>
          </div>
          <p>{t.lead}</p>
          <div className="scards" style={{ marginTop: 14 }}>
            {t.samples.slice(0, 2).map((v) => (
              <StreamCard key={v.videoId} {...v} />
            ))}
          </div>
          <Link className="tile" href={`/streams/${t.slug}`} style={{ marginTop: 14, ["--tile" as string]: t.color }}>
            <img className="tile-icon" src={`/sprites/${t.icon}.webp`} alt="" />
            <span className="tile-text">
              <b>{t.name}をくわしく</b>
              <i>{t.deeper ? t.deeper.label : "配信の中身を見る"}</i>
            </span>
            <span className="tile-go" aria-hidden>→</span>
          </Link>
        </Panel>
      ))}
    </PageShell>
  );
}
