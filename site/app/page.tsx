import Link from "next/link";
import IslandStage from "@/components/island/IslandStage";
import { RESIDENTS, ACTIVE_FRIENDS } from "@/content/residents";
import { LiveNumber } from "@/lib/liveStats";
import { StreamCard } from "@/components/ui/Bits";
import { IslandFooter } from "@/components/ui/PageShell";
import { STREAM_TYPES } from "@/content/streamTypes";
import { LINKS, STATS_FALLBACK } from "@/content/site";
import { HERO, HOME } from "@/content/voice";
import NextUp from "@/components/live/NextUp";
import Icon from "@/components/ui/Icon";
import Chapter from "@/components/home/Chapter";
import Meishi from "@/components/home/Meishi";
import Shelf from "@/components/home/Shelf";

/**
 * トップページ。
 *
 * 島のステージと、その下に続く4章。
 *
 * ## 4章に、それぞれ違う顔をさせる
 *
 * 前は4章とも「絵・題・矢印」の横並びカードを積んだだけで、
 * 章ごとに違うのは吊り看板の文字だけだった。撮って並べると、章の境目が
 * 絵として見えない。中身をそれぞれ別の形にした。
 *
 *   これから … しらせと時計。いちばん近い企画と、いちばん大きい企画（NextUp）
 *   いま     … 名刺。顔と3行と数字と押しどころが1枚に（Meishi）
 *   これまで … 棚の格子。数を持った6マス（Shelf）
 *   見にいく … 画面。今夜の1本と、外へ出る口
 *
 * ## 消したもの
 *
 * 配信の型5つの帯（→ `/streams`）・国旗18（→ `/map`）・料理12品の帯（→ `/kitchen`）・
 * 行き先カード5枚。どれも**行き先のページの1画面目のコピー**で
 * （`docs/island-ux.md` 3.4）、そちらにもっと良い形で置いてある。
 * これで 5,357px（6.35画面）が半分以下になる。行ける先は1つも減っていない。
 *
 * ## 地
 *
 * 章は海の上ではなく、島の浜（砂の帯）の上に載る。理由は `Chapter.tsx` に書いた。
 */
export default function Home() {
  const s = STATS_FALLBACK;

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
          note="日にちが決まっているものは、島の入口にも出ています。"
        >
          <NextUp />
          {/* 掲示板への誘いは、絵と3行と大きいボタンの箱を積んでいた（290px）。
              ここで言いたいのは「行き先は自分でも出せる」の一言だけなので、
              押せる板1枚に畳んだ。読ませる文は掲示板の面が持っている。 */}
          <Link className="hjoin" href="/board">
            <img className="hjoin-art" src="/sprites/signboard.webp" alt="" loading="lazy" />
            <span className="hjoin-body">
              <b>{HOME.board}</b>
              <i>
                行き先も、作る料理も、配信で相談しながら決めています。のべ
                <LiveNumber statKey="people" fallback={s.people} />
                人が来てくれました
              </i>
            </span>
            <Icon name="right" size={16} className="hjoin-go" />
          </Link>
        </Chapter>

        <Chapter id="now" kicker="いま" title={HOME.about} note={HOME.aboutNote}>
          <Meishi />
        </Chapter>

        <Chapter
          id="past"
          kicker="これまで"
          title={HOME.past}
          note="押すと、その中身をぜんぶ並べた面へ行けます。"
        >
          <Shelf />
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
