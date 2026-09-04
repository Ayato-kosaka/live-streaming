import Link from "next/link";
import IslandStage from "@/components/island/IslandStage";
import { RESIDENTS, ACTIVE_FRIENDS } from "@/content/residents";
import { LiveNumber } from "@/lib/liveStats";
import { Panel, Stat, TileLink, StreamCard } from "@/components/ui/Bits";
import { IslandFooter } from "@/components/ui/PageShell";
import { STREAM_TYPES } from "@/content/streamTypes";
import { COUNTRIES } from "@/content/countries";
import { RECIPES } from "@/content/recipes";
import { LEGENDS } from "@/content/legends";
import { LINKS, NOW_FALLBACK, PROFILE, STATS_FALLBACK } from "@/content/site";
import { PLANS } from "@/content/plans";
import { GUIDE, HERO, HOME } from "@/content/voice";
import { Gull } from "@/components/island/Guide";
import NextUp from "@/components/live/NextUp";
import Icon from "@/components/ui/Icon";

export default function Home() {
  const s = STATS_FALLBACK;
  const latestRecipes = [...RECIPES].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6);
  return (
    <main>
      <section className="hero">
        <IslandStage residents={RESIDENTS} />
        <div className="hero-ui">
          {/* 島の上に文字を重ねると絵が死ぬので、看板ロゴ1枚だけ置く。
              引き（島ぜんぶ）は上部中央にフル、寄り（あやとを追う）は右上に小さく。
              置き場所の出し分けは .stage[data-view] からの兄弟セレクタでCSS側が決める。 */}
          <div className="hero-copy">
            <h1 className="hero-logo">
              {/* 引きは看板まるごと。寄りは下がった札を落としたバッジだけ（小さいと読めないので） */}
              <img
                className="hero-logo-full"
                src="/logos/ayato-island.webp"
                alt="あやと島 — 毎晩22時、世界のどこかから生配信"
                width={900}
                height={706}
              />
              <img
                className="hero-logo-mark"
                src="/logos/ayato-island-mark.webp"
                alt=""
                width={520}
                height={305}
                aria-hidden
              />
              {/* 見出しは絵だけなので、読み上げと検索のために文字も置いておく */}
              <span className="sr-only">あやと島 — 毎晩22時、世界のどこかから生配信</span>
            </h1>
          </div>
        </div>
        <div className="scroll-cue" aria-hidden>
          <span>{HERO.scroll}</span>
          <i>↓</i>
        </div>
      </section>

      <div className="page">
        {/* 1. いちばん近い企画。ここに来た人が真っ先に知りたいのはこれなので、
              どのコーナーよりも先に、いちばん大きく置く。 */}
        <NextUp />

        {/* 2. で、この人は誰なんだろう */}
        <Panel>
          <div className="gsay" style={{ marginBottom: 14 }}>
            <span className="gsay-bird"><Gull size={54} /></span>
            <p className="gsay-bubble">{GUIDE.island}</p>
          </div>
          <h2>{HOME.about}</h2>
          <p className="muted">{HOME.aboutNote}</p>
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
            <Stat value={<LiveNumber statKey="activeFriends" fallback={ACTIVE_FRIENDS} />} label="島の住人" sub="直近90日" />
          </div>
          <div className="tiles" style={{ marginTop: 14 }}>
            <TileLink href="/now" icon="lantern" title={`いま ${NOW_FALLBACK.place}`} note={NOW_FALLBACK.word} />
            <TileLink href="/friends" icon="campfire" title="愉快な仲間達" note={`島の住人 ${ACTIVE_FRIENDS} 人`} />
          </div>
        </Panel>

        {/* 3. どんな配信をしてる人なんだろう */}
        <Panel>
          <h2>{HOME.doing}</h2>
          <p className="muted">{HOME.doingNote}</p>
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

          <h3 className="sub">{HOME.recent}</h3>
          <div className="stamps">
            {latestRecipes.map((r) => (
              <Link key={r.slug} href={`/kitchen/${r.slug}`} className="stamp">
                <img className="stamp-icon" src={`/sprites/${r.icon}.webp`} alt="" />
                <b>{r.name}</b>
                <i>{r.date.replace(/-/g, "/")}</i>
              </Link>
            ))}
          </div>

          <h3 className="sub">語り継がれてる企画</h3>
          <div className="tiles">
            <TileLink
              href="/legends"
              icon="hall-museum"
              title={`伝説の企画 ${LEGENDS.length} 個`}
              note="イランまで12日間歩いた話ほか"
            />
            <TileLink href="/kitchen" icon="hut-kitchen" title={`作った ${RECIPES.length} 品`} note="クッキング・スタンプ帳" />
          </div>
        </Panel>

        {/* 4. グルメアプリを作ってるらしいけど、詳しく */}
        <Panel>
          <h2>{HOME.apps}</h2>
          <p className="muted">{HOME.appsNote}</p>
          <div className="tiles" style={{ marginTop: 12 }}>
            <TileLink href="/apps" icon="hut-workshop" title="アプリ工房" note="なに食べよ / なにこれオーディオガイド" accent="var(--accent)" />
            <TileLink href="/streams/making" icon="tower-studio" title="アプリ作り配信" note="作っているところを、そのまま流してる" />
          </div>
        </Panel>

        {/* 5. これから何をするんだろう / 自分も口を出せるのか */}
        <Panel>
          <h2>{HOME.next}</h2>
          <div className="tiles">
            {PLANS.map((n) => (
              <TileLink key={n.id} href={n.href ?? "/next"} icon="tent" title={n.title} note={n.when} />
            ))}
            <TileLink href="/next" icon="signpost" title="これから全部" note="日付が決まっていないものも" />
          </div>

          <h3 className="sub">{HOME.board}</h3>
          <p>
            行き先も、作る料理も、アプリの機能も、だいたい配信で相談しながら決めています。
            いまの島の住人は<LiveNumber statKey="activeFriends" fallback={ACTIVE_FRIENDS} />人。
            これまでにのべ<LiveNumber statKey="people" fallback={s.people} />人が来てくれました。
          </p>
          <div className="tiles" style={{ marginTop: 12 }}>
            <TileLink href="/board" icon="signboard" title="企画掲示板" note="名前がなくても貼れる" accent="var(--accent)" />
          </div>
        </Panel>

        {/* 6. これまでどこへ行ったんだろう */}
        <Panel>
          <h2>{HOME.past}</h2>
          <div className="tiles">
            <TileLink href="/map" icon="signpost" title={`歩いた ${s.countries} カ国`} note="パリからジョージアまでの道のり" />
          </div>
          <h3 className="sub">{HOME.recentCountries}</h3>
          <div className="chips">
            {[...COUNTRIES].reverse().slice(0, 6).map((c) => (
              <Link key={c.slug} className="chip" href={`/map/${c.slug}`}>
                {c.flag} {c.name}
              </Link>
            ))}
          </div>
        </Panel>

        {/* 7. 見にいく */}
        <Panel>
          <h2>{HOME.tonight}</h2>
          <p className="muted">{HOME.tonightNote}</p>
          <div className="scards" style={{ marginTop: 12 }}>
            {STREAM_TYPES[0].samples.slice(0, 2).map((v) => (
              <StreamCard key={v.videoId} {...v} />
            ))}
          </div>
          <div className="tiles" style={{ marginTop: 14 }}>
            {LINKS.map((l) => (
              <a key={l.id} className="tile" href={l.href} target="_blank" rel="noopener noreferrer">
                {l.logo ? (
                  <img className="tile-logo" src={l.logo} alt="" />
                ) : (
                  <img className="tile-icon" src={`/sprites/${l.icon}.webp`} alt="" />
                )}
                <span className="tile-text">
                  <b>{l.label}</b>
                  <i>{l.note}</i>
                </span>
                <Icon name="external" size={15} className="tile-go" />
              </a>
            ))}
          </div>
        </Panel>
      </div>
      <IslandFooter />
    </main>
  );
}
