import dynamic from "next/dynamic";
import Link from "next/link";
import IslandStage from "@/components/island/IslandStage";
import Cover from "@/components/isle/Cover";
import { HAND_MADE_CHAPTER } from "@/components/isle/handmade";
import { coverSpec } from "@/components/isle/cover";
import { NOW_CHAPTER } from "@/content/chapters";
import { RESIDENTS } from "@/content/residents";
import { LiveNumber } from "@/lib/liveStats";
import { IslandFooter } from "@/components/ui/PageShell";
import { LINKS, STATS_FALLBACK } from "@/content/site";
import { HERO, HOME } from "@/content/voice";
import NextUp from "@/components/live/NextUp";
import Icon from "@/components/ui/Icon";
import Chapter from "@/components/home/Chapter";
import Meishi from "@/components/home/Meishi";
import Shelf from "@/components/home/Shelf";
import Latest from "@/components/home/Latest";

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
/* 島のエンジンは、**使う日が来てから配る。** 手で作った島が表紙のあいだ
   （＝いまの章がその島の章のあいだ）は、1バイトも取りにいかない。
   `ssr: false` にはしない。サーバ側で焼いておけば、島が HTML に入って
   すぐ出る（画面が出てから組むと、スマホで 1.6秒ぶん遅れる。実測）。 */
const IsleStage = dynamic(() => import("@/components/isle/IsleStage"));

export default function Home() {
  const s = STATS_FALLBACK;
  /* ビルドしたときの島。**手で作った島が描いている章のあいだは、あちらを焼く。**
     章が進んでいれば、常設の入口ぜんぶが建つ表紙の島を焼く
     （`components/isle/cover.ts`）。日付をまたいだ直後だけは、焼いた島と
     今日が食い違うので、画面が出てから入れ替わる（`Cover.tsx`）。 */
  const baked = NOW_CHAPTER;
  const cover = baked.slug === HAND_MADE_CHAPTER ? null : coverSpec(baked);

  return (
    <main>
      <section className="hero">
        {/* 降り立つ島は、**いま何章か**で変わる（あやと「北欧ヒッチハイクの
            期間に入れば、あやと島の表紙は初期表示が北欧周遊の島のものに変わる」）。
            静的書き出しに焼くと出発の日をまたいでも変わらないので、
            入れ替えは画面が出てから（`components/isle/Cover.tsx`）。 */}
        {/* 入れ替わったあとの島にも、常設の入口はぜんぶ建つ
            （`components/isle/cover.ts`）。となりの島は渡さない——表紙に
            なっているあいだ、ひとつ前の島は連なりの上ではまだ `/` なので、
            押した先が自分自身になる。船着き場からは島の地図へ出る。 */}
        <Cover
          baked={baked.slug}
          now={cover ? <IsleStage spec={cover} cover /> : <IslandStage residents={RESIDENTS} />}
        />
        <div className="hero-ui">
          {/* 島の上に文字を重ねると絵が死ぬので、看板ロゴ1枚だけ置く。
              引き（島ぜんぶ）は上部中央にフル、寄り（あやとを追う）は右上に小さく。
              置き場所の出し分けは .stage[data-view] からの兄弟セレクタでCSS側が決める。 */}
          <div className="hero-copy">
            <h1 className="hero-logo">
              {/* 引きは看板まるごと。寄りは下がった札を落としたバッジだけ（小さいと読めないので）。
                  看板は `loading="lazy"`。**スマホの既定は寄りなので、ここは隠れている**
                  （`hero.css`）。隠れているあいだは1バイトも取りにいかず、
                  「島ぜんぶ」を押して出てきたときに取る。前は焼いた HTML が引きを
                  名乗っていたので、スマホでも 92KB の看板を取って描いてから捨てていた
                  （実測でそれが LCP・4,756ms）。PC は最初から見えているので
                  lazy でもすぐ取る（画面の中にある絵は後回しにされない）。 */}
              {/* **帯から下は切って出す**（`width`/`height` が切ったあとの寸法）。
                  焼いてある帯（旅して、…）と吊り板（毎晩22時、…）は、
                  268px で 9px と 13px にしかならない。読ませたい字は絵に焼かず、
                  下の板に本文として置く（`.hero-say`）。 */}
              <img
                className="hero-logo-full"
                src="/logos/ayato-island.webp"
                alt=""
                aria-hidden
                width={900}
                height={410}
                loading="lazy"
              />
              {/* 寄りの印はスマホの1画面目に出るので、こちらは先に取る。
                  こちらも帯から下は切る（`height` が切ったあとの寸法）。
                  124px の絵に22文字＝約5px で、dpr2 でも読めなかった */}
              <img
                className="hero-logo-mark"
                src="/logos/ayato-island-mark.webp"
                alt=""
                aria-hidden
                width={520}
                height={240}
                fetchPriority="high"
              />
              {/* 見出しは絵なので、読み上げと検索のために字も置いておく。
                  一言のほうは絵ではなく本文なので、ここには入れない */}
              <span className="sr-only">あやと島</span>
            </h1>
            {/* 看板の言葉を、**絵ではなく字で**置く。
                焼いてある帯と吊り板は、寄りで 5px、引きでも 7〜13px にしかならず、
                dpr2 でも読めなかった。島に降りた人が最初に読む1文がそこにあるのに
                読めない、というのは `docs/island-play.md` 6章の 0:06 が
                埋まっていないのと同じ。**絵は帯の手前で切って**（上の img）、
                言葉はここが持つ。 */}
            <p className="hero-say">
              <b>毎晩22時、世界のどこかから生配信</b>
              <i>旅して、食べて、グルメアプリを作る、夜の居場所</i>
            </p>
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
        >
          <Shelf />
        </Chapter>

        <Chapter id="watch" kicker="見にいく" title={HOME.tonight} note={HOME.tonightNote}>
          {/* **直近の2本。手で選んだ見本ではない。**
              ここは「クッキング配信の代表」として選んだ見本の先頭2本を出していて、
              旅に出る前日の本番で 3週間前と2ヶ月前の回が「今夜も22時から」の下に
              並んでいた。直近は `/island-api/state` に毎晩入っていて、この面が
              もう読んでいる（`components/home/Latest.tsx`）。 */}
          <Latest />
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
