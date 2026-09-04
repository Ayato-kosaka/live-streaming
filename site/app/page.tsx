import Link from "next/link";
import IslandStage from "@/components/island/IslandStage";
import { RESIDENTS, ACTIVE_FRIENDS } from "@/content/residents";
import { Panel, Stat, TileLink, StreamCard } from "@/components/ui/Bits";
import { IslandFooter } from "@/components/ui/PageShell";
import { STREAM_TYPES } from "@/content/streamTypes";
import { COUNTRIES } from "@/content/countries";
import { RECIPES } from "@/content/recipes";
import { LEGENDS } from "@/content/legends";
import { LINKS, NOW_FALLBACK, NEXT_FALLBACK, PROFILE, STATS_FALLBACK } from "@/content/site";
import { GUIDE, HERO, HOME } from "@/content/voice";
import { Gull } from "@/components/island/Guide";

export default function Home() {
  const s = STATS_FALLBACK;
  const latestRecipes = [...RECIPES].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6);
  return (
    <main>
      <section className="hero">
        <IslandStage residents={RESIDENTS} />
        <div className="hero-ui">
          <div className="hero-copy">
            <p className="eyebrow">{HERO.eyebrow}</p>
            <h1>あやと島</h1>
            <p className="lede">
              {HERO.lede[0]}
              <br />
              {HERO.lede[1]}
            </p>
            <div className="hero-badges">
              <Link className="badge" href="/now">
                いま {NOW_FALLBACK.place}
              </Link>
            </div>
          </div>
        </div>
        <div className="scroll-cue" aria-hidden>
          <span>{HERO.scroll}</span>
          <i>↓</i>
        </div>
      </section>

      <div className="page">
        <Panel>
          <div className="gsay" style={{ marginBottom: 14 }}>
            <span className="gsay-bird"><Gull size={54} /></span>
            <p className="gsay-bubble">{GUIDE.island}</p>
          </div>
          <h2>{HOME.about}</h2>
          <p>
            <b>{PROFILE.lead}</b>
          </p>
          {PROFILE.body.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          <div className="stats" style={{ marginTop: 16 }}>
            <Stat value={s.streams.toLocaleString()} label="配信本数" sub={`${s.since.replace(/-/g, "/")} から`} />
            <Stat value={s.countries} label="歩いた国" />
            <Stat value={RECIPES.length} label="作った料理" />
            <Stat value={ACTIVE_FRIENDS} label="島の住人" sub="直近90日" />
          </div>
        </Panel>

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
        </Panel>

        <Panel>
          <h2>{HOME.past}</h2>
          <div className="tiles">
            <TileLink href="/map" icon="signpost" title={`歩いた ${s.countries} カ国`} note="パリからジョージアまでの道のり" />
            <TileLink href="/kitchen" icon="hut-kitchen" title={`作った ${RECIPES.length} 品`} note="クッキング・スタンプ帳" />
            <TileLink href="/apps" icon="hut-workshop" title="アプリ2つ" note="なに食べよ / なにこれオーディオガイド" />
            <TileLink href="/legends" icon="hall-museum" title={`伝説の企画 ${LEGENDS.length} 個`} note="イランまで歩いた話ほか" />
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

          <h3 className="sub">{HOME.recentCountries}</h3>
          <div className="chips">
            {[...COUNTRIES].reverse().slice(0, 6).map((c) => (
              <Link key={c.slug} className="chip" href={`/map/${c.slug}`}>
                {c.flag} {c.name}
              </Link>
            ))}
          </div>
        </Panel>

        <Panel>
          <h2>{HOME.nowNext}</h2>
          <div className="tiles">
            <TileLink href="/now" icon="lantern" title={`いま ${NOW_FALLBACK.place}`} note={NOW_FALLBACK.word} />
            {NEXT_FALLBACK.map((n) => (
              <TileLink key={n.id} href="/next" icon="tent" title={n.title} note={n.when} />
            ))}
          </div>
        </Panel>

        <Panel>
          <h2>{HOME.together}</h2>
          <p>
            行き先も、作る料理も、アプリの機能も、だいたい配信で相談しながら決めています。
            いまの島の住人は{ACTIVE_FRIENDS}人。これまでにのべ{s.people.toLocaleString()}人が来てくれました。
          </p>
          <div className="tiles" style={{ marginTop: 12 }}>
            <TileLink href="/board" icon="signboard" title="企画掲示板" note="名前がなくても貼れる" accent="var(--accent)" />
            <TileLink href="/friends" icon="campfire" title="愉快な仲間達" note="島に住んでいる人たち" />
          </div>
        </Panel>

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
                <img className="tile-icon" src={`/sprites/${l.icon}.webp`} alt="" />
                <span className="tile-text">
                  <b>{l.label}</b>
                  <i>{l.note}</i>
                </span>
                <span className="tile-go" aria-hidden>↗</span>
              </a>
            ))}
          </div>
        </Panel>
      </div>
      <IslandFooter />
    </main>
  );
}
