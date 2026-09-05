import Link from "next/link";
import IslandStage from "@/components/island/IslandStage";
import { RESIDENTS, ACTIVE_FRIENDS } from "@/content/residents";
import { LiveNumber } from "@/lib/liveStats";
import { StreamCard } from "@/components/ui/Bits";
import { IslandFooter } from "@/components/ui/PageShell";
import { STREAM_TYPES } from "@/content/streamTypes";
import { COUNTRIES } from "@/content/countries";
import { RECIPES } from "@/content/recipes";
import { LEGENDS } from "@/content/legends";
import { LINKS, NOW_FALLBACK, PROFILE, STATS_FALLBACK } from "@/content/site";
import { HERO, HOME } from "@/content/voice";
import NextUp from "@/components/live/NextUp";
import Icon from "@/components/ui/Icon";
import Flag from "@/components/ui/Flag";
import Chapter from "@/components/home/Chapter";
import { BigCard, Strip } from "@/components/home/Cards";

/**
 * トップページ。
 *
 * 以前は同じ形の白いパネルが7枚、同じ間隔で縦に積んであった。
 * どれも同じ重さに見えるので、来た人は何から見ればいいのか決められない。
 *
 * あやとが整理した並びに合わせて、3つの章に区切り直した。
 *   これから … いま来た人が真っ先に知りたいこと。いちばん大きく、いちばん先
 *   いま     … この人は誰で、何をしているのか
 *   これまで … どこへ行って、何を作ってきたのか
 * 章の中でも大きさに序列を付ける。全部を同じ大きさで出すのをやめた。
 */
export default function Home() {
  const s = STATS_FALLBACK;
  const latestRecipes = [...RECIPES].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 12);
  // 新しく行った国から先に見せる。古い順に出すと、いま追いかけている旅が最後になる
  const recentCountries = [...COUNTRIES].sort((a, b) => b.order - a.order);

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
          <i>
            <Icon name="chevron" size={15} />
          </i>
        </div>
      </section>

      <div className="page home">
        <Chapter
          id="next"
          kicker="これから"
          title={HOME.next}
          note="いちばん近い企画から。日にちが決まっているものは、島の入口にも出ている。"
        >
          <NextUp />
          <div className="hjoin">
            <span className="hjoin-art">
              <img src="/sprites/signboard.webp" alt="" loading="lazy" />
            </span>
            <div className="hjoin-body">
              <b>{HOME.board}</b>
              <p>
                行き先も、作る料理も、アプリの機能も、だいたい配信で相談しながら決めています。
                いまの島の住人は<LiveNumber statKey="activeFriends" fallback={ACTIVE_FRIENDS} />人。
                これまでにのべ<LiveNumber statKey="people" fallback={s.people} />人が来てくれました。
              </p>
              <Link className="hjoin-go" href="/board">
                <Icon name="talk" size={16} />
                企画を貼りにいく
                <Icon name="right" size={14} />
              </Link>
            </div>
          </div>
        </Chapter>

        <Chapter id="now" kicker="いま" title={HOME.about} note={HOME.aboutNote}>
          <p className="hlead">{PROFILE.lead}</p>

          <div className="hbigs">
            <BigCard
              href="/about"
              icon="campfire"
              title="あやとって、どんな人"
              note={PROFILE.body[0]}
              stat={s.countries}
              statLabel="カ国を歩いた"
              accent="var(--roof-gold)"
            />
            <BigCard
              href="/streams"
              icon="tower-studio"
              title={HOME.doing}
              note={HOME.doingNote}
              stat={<LiveNumber statKey="streams" fallback={s.streams} />}
              statLabel="本の配信"
              accent="var(--roof-coral)"
            />
            <BigCard
              href="/apps"
              icon="hut-workshop"
              title={HOME.apps}
              note={HOME.appsNote}
              stat={2}
              statLabel="つのアプリ"
              accent="var(--roof-sky)"
            />
          </div>

          <Strip title="配信は5つの型でできてる" more="/streams" moreLabel="配信やぐらへ">
            {STREAM_TYPES.map((t) => (
              <Link
                key={t.slug}
                className="hcard"
                href={`/streams/${t.slug}`}
                prefetch={false}
                style={{ ["--hb" as string]: t.color }}
              >
                <img src={`/sprites/${t.icon}.webp`} alt="" loading="lazy" />
                <b>{t.name}</b>
                <i>{t.when}</i>
              </Link>
            ))}
          </Strip>

          <div className="hduo">
            <Link className="hmini" href="/now">
              <span className="hmini-art">
                <img src="/sprites/lantern.webp" alt="" loading="lazy" />
              </span>
              <span className="hmini-text">
                <b>いま {NOW_FALLBACK.place}</b>
                <i>{NOW_FALLBACK.word}</i>
              </span>
              <Icon name="right" size={14} className="hmini-go" />
            </Link>
            <Link className="hmini" href="/friends">
              <span className="hmini-art">
                <img src="/sprites/tent.webp" alt="" loading="lazy" />
              </span>
              <span className="hmini-text">
                <b>愉快な仲間達</b>
                <i>島の住人 {ACTIVE_FRIENDS} 人</i>
              </span>
              <Icon name="right" size={14} className="hmini-go" />
            </Link>
          </div>
        </Chapter>

        <Chapter
          id="past"
          kicker="これまで"
          title={HOME.past}
          note={`2024年の秋に日本を出て、いまで ${s.countries} カ国目。作った料理は ${RECIPES.length} 品。`}
        >
          <BigCard
            href="/map"
            icon="signpost"
            title={`歩いた ${s.countries} カ国の地図`}
            note="パリからジョージアまで、どこをどう通ってきたか。国を押すと、そこで何をしていたかが出てくる。"
            stat={s.countries}
            statLabel="カ国"
            accent="var(--roof-mint)"
          />
          <div className="hflags">
            {recentCountries.map((c) => (
              <Link key={c.slug} className="hflag" href={`/map/${c.slug}`} prefetch={false}>
                <Flag slug={c.slug} size={26} />
                <span>{c.name}</span>
              </Link>
            ))}
          </div>

          <Strip title={HOME.recent} more="/kitchen" moreLabel="スタンプ帳へ">
            {latestRecipes.map((r) => (
              <Link key={r.slug} className="hdish" href={`/kitchen/${r.slug}`} prefetch={false}>
                <span className="hdish-art">
                  <img src={`/sprites/${r.icon}.webp`} alt="" loading="lazy" />
                </span>
                <b>{r.name}</b>
                <i>{r.date.replace(/-/g, "/")}</i>
              </Link>
            ))}
          </Strip>

          <BigCard
            href="/legends"
            icon="hall-museum"
            title="語り継がれてる企画"
            note={LEGENDS[0]?.lead ?? "イランまで12日間歩いた話ほか"}
            stat={LEGENDS.length}
            statLabel="の伝説"
            accent="var(--roof-gold)"
          />
        </Chapter>

        <Chapter id="watch" kicker="見にいく" title={HOME.tonight} note={HOME.tonightNote}>
          <div className="scards">
            {STREAM_TYPES[0].samples.slice(0, 2).map((v) => (
              <StreamCard key={v.videoId} {...v} />
            ))}
          </div>
          <div className="houts">
            {LINKS.map((l) => (
              <a key={l.id} className="hout" href={l.href} target="_blank" rel="noopener noreferrer">
                {l.logo ? (
                  <img className="hout-logo" src={l.logo} alt="" loading="lazy" />
                ) : (
                  <img className="hout-icon" src={`/sprites/${l.icon}.webp`} alt="" loading="lazy" />
                )}
                <span className="hout-text">
                  <b>{l.label}</b>
                  <i>{l.note}</i>
                </span>
                <Icon name="external" size={14} className="hout-go" />
              </a>
            ))}
          </div>
        </Chapter>
      </div>
      <IslandFooter />
    </main>
  );
}
