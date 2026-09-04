import type { Metadata } from "next";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { Panel, Stat, TileLink } from "@/components/ui/Bits";
import Icon from "@/components/ui/Icon";
import NowLive from "@/components/live/NowLive";
import { LiveNumber } from "@/lib/liveStats";
import { STREAM_TYPES } from "@/content/streamTypes";
import { RECIPES } from "@/content/recipes";
import { RESIDENTS, ACTIVE_FRIENDS } from "@/content/residents";
import { NOW_FALLBACK, PROFILE, STATS_FALLBACK } from "@/content/site";
import { GUIDE } from "@/content/voice";

export const metadata: Metadata = {
  title: "あやと島について",
  description:
    "あやとって、どんな人。いま何をしていて、島で何をやっているか。配信の型5つと、島に住んでいる人たち。",
};

/**
 * たき火広場＝あやと島について。
 *
 * 島に来た人が最初に浮かべる「この人だれ」に、ひとつの場所で答える。
 * はじめまして → いま何してる → 島でやってること → 配信の型 → 仲間、の順。
 * それぞれの深いところは、この中からリンクで行く（島の入口は6つのままにするため）。
 */
export default function AboutPage() {
  const s = STATS_FALLBACK;
  return (
    <PageShell current="friends" crumbs={[{ label: "あやと島について" }]}>
      <PageHead
        icon="campfire"
        title="あやと島について"
        lead="たき火のまわりで、はじめましての話を。"
        say={GUIDE.friends}
      />

      <Panel>
        <h2>はじめまして</h2>
        <p>
          <b>{PROFILE.lead}</b>
        </p>
        {PROFILE.body.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        <div className="stats" style={{ marginTop: 16 }}>
          <Stat
            value={<LiveNumber statKey="streams" fallback={s.streams} />}
            label="配信本数"
            sub={`${s.since.replace(/-/g, "/")} から`}
          />
          <Stat value={s.countries} label="歩いた国" />
          <Stat value={RECIPES.length} label="作った料理" />
          <Stat
            value={<LiveNumber statKey="activeFriends" fallback={ACTIVE_FRIENDS} />}
            label="島の住人"
            sub="直近90日"
          />
        </div>
      </Panel>

      <Panel>
        <h2>いま何してる</h2>
        <NowLive />
        <Link className="tile" href="/now" style={{ marginTop: 12 }}>
          <span className="tile-mark">
            <Icon name="pin" size={24} />
          </span>
          <span className="tile-text">
            <b>いまのポスト</b>
            <i>{NOW_FALLBACK.place}。今週やることと、今月のテーマ</i>
          </span>
          <Icon name="right" size={16} className="tile-go" />
        </Link>
      </Panel>

      <Panel>
        <h2>島でやっていること</h2>
        <p>
          毎晩22時に配信して、旅先で自作のグルメアプリ「なに食べよ」を作っています。
          行き先も、作る料理も、アプリの機能も、だいたい配信で相談しながら決めています。
        </p>
        <p>
          この島は、その配信の留守番の場所。配信していない時間にも、
          来た人が何かを見て帰れるようにしてあります。
        </p>
      </Panel>

      <Panel>
        <h2>配信の型は5つ</h2>
        <p className="muted">押すと、その型の配信だけまとめて見られます。</p>
        <div className="tiles" style={{ marginTop: 12 }}>
          {STREAM_TYPES.map((t) => (
            <TileLink
              key={t.slug}
              href={`/streams/${t.slug}`}
              icon={t.icon}
              title={t.name}
              note={t.when}
              accent={t.color}
            />
          ))}
        </div>
      </Panel>

      <Panel>
        <h2>愉快な仲間達</h2>
        <p>
          島に住んでいるのは、配信に来てくれる人たち。
          キャラクターはみんな自分で作ったものです。いまの住人は
          <LiveNumber statKey="activeFriends" fallback={ACTIVE_FRIENDS} />人。
          これまでにのべ<LiveNumber statKey="people" fallback={s.people} />人が来てくれました。
        </p>
        <div className="crowd-peek">
          {RESIDENTS.filter((r) => r.icon)
            .slice(0, 12)
            .map((r) => (
              <img
                key={r.icon}
                src={`https://lh3.googleusercontent.com/d/${r.icon}=s96`}
                alt=""
                loading="lazy"
              />
            ))}
        </div>
        <Link className="tile" href="/friends" style={{ marginTop: 12 }}>
          <span className="tile-mark">
            <Icon name="talk" size={24} />
          </span>
          <span className="tile-text">
            <b>たき火広場へ</b>
            <i>島に住んでいる人たち、全員</i>
          </span>
          <Icon name="right" size={16} className="tile-go" />
        </Link>
      </Panel>
    </PageShell>
  );
}
