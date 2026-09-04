import type { Metadata } from "next";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { Panel, Stat } from "@/components/ui/Bits";
import { RESIDENTS, ACTIVE_FRIENDS } from "@/content/residents";
import { STATS_FALLBACK, CHARACTER_DRIVE, LINKS } from "@/content/site";

export const metadata: Metadata = {
  title: "愉快な仲間達",
  description: "島に住んでいる仲間たち。名前は出しませんが、みんなちゃんといます。",
};

export default function FriendsPage() {
  const doneru = LINKS.find((l) => l.id === "doneru")!;
  return (
    <PageShell current="friends" crumbs={[{ label: "たき火広場" }]}>
      <PageHead
        emoji="⛺"
        title="愉快な仲間達"
        lead="毎晩22時に集まってくる人たち。名前は出しませんが、ちゃんとここにいます。"
      />
      <div className="stats" style={{ marginBottom: 18 }}>
        <Stat value={ACTIVE_FRIENDS} label="いまの島の住人" sub="直近90日で5日以上" />
        <Stat value={STATS_FALLBACK.people.toLocaleString()} label="のべ参加人数" sub="2024/10から" />
        <Stat value={RESIDENTS.length} label="キャラクター登録済み" />
        <Stat value={STATS_FALLBACK.comments.toLocaleString()} label="みんなのコメント" />
      </div>

      <Panel>
        <h2>島を歩いている仲間</h2>
        <p className="muted">
          キャラクターを作った人が、島の中を歩いています。誰が誰かは出しません。
        </p>
        <div className="crowd">
          {RESIDENTS.map((r, i) => (
            <span className="crowd-one" key={i}>
              <span className="crowd-emoji" aria-hidden>{r.emoji ?? "🙂"}</span>
              {r.icon && (
                <img src={`https://lh3.googleusercontent.com/d/${r.icon}=s128`} alt="" loading="lazy" />
              )}
            </span>
          ))}
        </div>
      </Panel>

      <Panel>
        <h2>キャラクターを作りたい人へ</h2>
        <p>
          キャラクターは、100円から投げ銭してくれた方にお作りしています。作ったキャラクターは、投げ銭の演出のときに画面に出てきます。この島も歩きます。
        </p>
        <p>
          できあがったキャラクターの画像は、下のGoogleドライブから自由にダウンロードできます。アイコンなどに使ってもらって大丈夫です。
        </p>
        <div className="tiles" style={{ marginTop: 14 }}>
          <a className="tile" href={doneru.href} target="_blank" rel="noopener noreferrer">
            <span className="tile-emoji" aria-hidden>{doneru.emoji}</span>
            <span className="tile-text">
              <b>投げ銭してキャラクターを作る</b>
              <i>{doneru.note}</i>
            </span>
            <span className="tile-go" aria-hidden>↗</span>
          </a>
          <a className="tile" href={CHARACTER_DRIVE} target="_blank" rel="noopener noreferrer">
            <span className="tile-emoji" aria-hidden>📁</span>
            <span className="tile-text">
              <b>キャラクター置き場</b>
              <i>Googleドライブ・自由にダウンロードOK</i>
            </span>
            <span className="tile-go" aria-hidden>↗</span>
          </a>
        </div>
      </Panel>

      <Panel>
        <h2>数え方について</h2>
        <p className="muted">
          「島の住人」は、直近90日のあいだに5日以上コメントしてくれた人の数です。個人ごとのコメント数や順位は出しません。出席日数は月末配信のほうで表彰しています。
        </p>
      </Panel>
    </PageShell>
  );
}
