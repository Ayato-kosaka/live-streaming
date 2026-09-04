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

export default function Home() {
  const s = STATS_FALLBACK;
  const latestRecipes = [...RECIPES].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6);
  return (
    <main>
      <section className="hero">
        <IslandStage residents={RESIDENTS} />
        <div className="hero-ui">
          <div className="hero-copy">
            <p className="eyebrow">毎晩 22:00 — 世界のどこかから生配信</p>
            <h1>あやと島</h1>
            <p className="lede">
              旅と、ごはんと、アプリ作り。
              <br />
              あやとと愉快な仲間達が住んでいる島です。
            </p>
            <div className="hero-badges">
              <Link className="badge" href="/now">
                <em>📍</em> いま {NOW_FALLBACK.place}
              </Link>
            </div>
          </div>
        </div>
        <div className="scroll-cue" aria-hidden>
          <span>島の外も見る</span>
          <i>↓</i>
        </div>
      </section>

      <div className="page">
        <Panel>
          <h2>はじめまして</h2>
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
          <h2>どんな配信をしてるか</h2>
          <p className="muted">やってることは大きく5つ。押すとその中身まで見られます。</p>
          <div className="tiles" style={{ marginTop: 12 }}>
            {STREAM_TYPES.map((t) => (
              <TileLink
                key={t.slug}
                href={`/streams/${t.slug}`}
                emoji={t.emoji}
                title={t.name}
                note={t.when}
                accent={t.color}
              />
            ))}
          </div>
        </Panel>

        <Panel>
          <h2>これまで</h2>
          <div className="tiles">
            <TileLink href="/map" emoji="🗺️" title={`歩いた ${s.countries} カ国`} note="パリからジョージアまでの道のり" />
            <TileLink href="/kitchen" emoji="🍳" title={`作った ${RECIPES.length} 品`} note="クッキング・スタンプ帳" />
            <TileLink href="/apps" emoji="💻" title="アプリ2つ" note="なに食べよ / なにこれオーディオガイド" />
            <TileLink href="/legends" emoji="🏆" title={`伝説の企画 ${LEGENDS.length} 個`} note="イランまで歩いた話ほか" />
          </div>

          <h3 className="sub">最近のごはん</h3>
          <div className="stamps">
            {latestRecipes.map((r) => (
              <Link key={r.slug} href={`/kitchen/${r.slug}`} className="stamp">
                <span className="stamp-emoji" aria-hidden>{r.emoji}</span>
                <b>{r.name}</b>
                <i>{r.date.replace(/-/g, "/")}</i>
              </Link>
            ))}
          </div>

          <h3 className="sub">最近まわった国</h3>
          <div className="chips">
            {[...COUNTRIES].reverse().slice(0, 6).map((c) => (
              <Link key={c.slug} className="chip" href={`/map/${c.slug}`}>
                {c.flag} {c.name}
              </Link>
            ))}
          </div>
        </Panel>

        <Panel>
          <h2>いまと、これから</h2>
          <div className="tiles">
            <TileLink href="/now" emoji="📮" title={`いま ${NOW_FALLBACK.place}`} note={NOW_FALLBACK.word} />
            {NEXT_FALLBACK.map((n) => (
              <TileLink key={n.id} href="/next" emoji="✈️" title={n.title} note={n.when} />
            ))}
          </div>
        </Panel>

        <Panel>
          <h2>みんなで作ってます</h2>
          <p>
            行き先も、作る料理も、アプリの機能も、だいたい配信で相談しながら決めています。
            {ACTIVE_FRIENDS}人が今の島の住人で、これまでにのべ{s.people.toLocaleString()}人が来てくれました。
          </p>
          <div className="tiles" style={{ marginTop: 12 }}>
            <TileLink href="/board" emoji="📋" title="企画掲示板" note="ログインなしで企画を出せます" accent="var(--accent)" />
            <TileLink href="/friends" emoji="⛺" title="愉快な仲間達" note="島に住んでいる人たち" />
          </div>
        </Panel>

        <Panel>
          <h2>今夜の配信は</h2>
          <p className="muted">毎晩22:00(日本時間)から。だいたい2〜3時間。</p>
          <div className="scards" style={{ marginTop: 12 }}>
            {STREAM_TYPES[0].samples.slice(0, 2).map((v) => (
              <StreamCard key={v.videoId} {...v} />
            ))}
          </div>
          <div className="tiles" style={{ marginTop: 14 }}>
            {LINKS.map((l) => (
              <a key={l.id} className="tile" href={l.href} target="_blank" rel="noopener noreferrer">
                <span className="tile-emoji" aria-hidden>{l.emoji}</span>
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
