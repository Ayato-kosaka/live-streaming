import type { Metadata } from "next";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { Panel, Stat, TileLink } from "@/components/ui/Bits";
import Fold from "@/components/ui/Fold";
import Icon, { type IconName } from "@/components/ui/Icon";
import { LiveNumber } from "@/lib/liveStats";
import { STREAM_TYPES } from "@/content/streamTypes";
import { ACTIVE_FRIENDS } from "@/content/residents";
import { countryBySlug } from "@/content/countries";
import { appBySlug } from "@/content/apps";
import { NOW_FALLBACK, PROFILE, STATS_FALLBACK } from "@/content/site";
import Days from "@/components/atlas/Days";
import { PackArt, PotArt, CodeArt } from "@/components/atlas/art";
import "./about.css";

export const metadata: Metadata = {
  title: "あやとのこと",
  description:
    "あやとが何者で、いま何をしていて、これからどこへ行くのか。旅と配信とアプリの年表。",
};

/**
 * あやとのこと。
 *
 * 来た人の「この人だれ」に、読ませずに答える面。
 *
 * ## 畳みすぎていたのを戻した
 *
 * 前は6枚のパネルを全部開いて 5,465px（6.5画面）あった。長すぎたので3つ畳んだら、
 * 今度は **2.02画面** になった。**畳んだ3つが、この面の中身そのものだった。**
 * 顔と3行と数字4つだけが出ていて、この人が何をしてきた人なのかは
 * 押さないと1行も出てこない。はじめて来た人は押さずに帰る。
 *
 * 長さと中身のどちらかを捨てるのではなく、**形を変えて両方置く。**
 *
 *   ここまでの道のり … 縦9段（800px超）を横に倒した。指で送る道。380px
 *   島でやっていること … 3枚。開いて置く。ここが「何が面白いのか」への答え
 *   どんな配信 … 畳んだまま。これは `/streams` の中身で、この面のものではない
 *
 * ## 押せるものを増やした
 *
 * 道の石9つと、やっていること3枚を、行き先のある板にした。
 * 「パリで配信を始めた」を押すとフランスの面、「なに食べよ」を押すと「アプリ」、
 * 「イラン国境まで380km」を押すと「伝説の企画」。
 * 読むだけの年表は、読み終わったら行き止まりになる。
 *
 * h1 は場所の名前（`docs/island-world.md` 7.5）。ヘッダーの入口が
 * 「あやとのこと」なので、ここで「あやと島について」と名乗ると名前が2つになる。
 *
 * 住人（愉快な仲間達）の絵はここでは出さない。`/friends` と同じ絵を
 * 2ページに並べると、どちらが本体なのか分からなくなる。
 */

/** 節目の日付は、国とアプリのデータから引く。ここで西暦を手打ちしない。 */
const on = (slug: string, i = 0) => countryBySlug(slug)?.stays[i]?.from ?? "";
/** そのアプリで、その種類の節目がはじめて来た日。並び順の番号で指すと、間に1行入るとずれる。 */
const appOn = (slug: string, kind: string) =>
  appBySlug(slug)?.milestones.find((m) => m.kind === kind)?.date ?? "";

type Step = {
  date: string;
  what: string;
  note: string;
  kind: "live" | "travel" | "app";
  /** その節目の続きが置いてある面。無いものは押せない札にする */
  href?: string;
  go?: string;
};

const STORY: Step[] = [
  { date: on("france"), kind: "live", what: "パリで配信を始めた", note: "「日本語を話したい」というタイトル。ここから全部が始まった", href: "/map/france", go: "フランスの面へ" },
  { date: on("uk"), kind: "travel", what: "ヨーロッパを9カ国まわって、イギリスへ", note: "オランダ、ベルギー、中欧、ドイツ、そしてスコットランド", href: "/map/uk", go: "イギリスの面へ" },
  { date: appOn("nanikore", "build"), kind: "app", what: "はじめてのアプリ「なにこれオーディオガイド」を出した", note: "目の前のものが何なのか分からない、という自分の困りごとから", href: "/apps/nanikore", go: "アプリの面へ" },
  { date: on("egypt"), kind: "travel", what: "ヨーロッパを出て、エジプトへ降りた", note: "ピラミッドと砂漠と、アブ・シンベルまで", href: "/map/egypt", go: "エジプトの面へ" },
  { date: appOn("nanitabeyo", "build"), kind: "app", what: "「なに食べよ」を作り始めた", note: "ヨルダンで「みんなで外食の悩みを解決するアプリを作ろう」と言い出した", href: "/map/jordan", go: "ヨルダンの面へ" },
  { date: on("georgia"), kind: "travel", what: "ジョージアに着いた", note: "いちばん長くいる国。ここでクッキング配信が定着した", href: "/map/georgia", go: "ジョージアの面へ" },
  { date: appOn("nanitabeyo", "release"), kind: "app", what: "「なに食べよ」をリリースした", note: "クタイシから報告。いまも毎週アップデートしている", href: "/apps/nanitabeyo", go: "アプリの面へ" },
  { date: on("iran-border"), kind: "travel", what: "アルメニアからイラン国境まで、380kmを歩いた", note: "10日間。帰りはヒッチハイクでエレバンへ", href: "/legends/iran-walk", go: "伝説の企画へ" },
  { date: on("georgia", 1), kind: "travel", what: "トビリシに戻ってきた", note: "いまここ。毎晩22時から配信している", href: "/now", go: "いまどこへ" },
];

/**
 * 節目の種類は、色ではなく印で分ける。
 *
 * 前はここに桃・橙・緑の直値を置いていた。docs/island-world.md 3.1 で
 * 「色で分けていいのは配信の型だけ」と決まっているので、
 * 3色の点をやめて Icon.tsx の絵に置き換えた。色は増やさず、形だけ増やす。
 */
const MARK: Record<Step["kind"], { icon: IconName; label: string }> = {
  live: { icon: "mic", label: "配信" },
  travel: { icon: "walk", label: "旅" },
  app: { icon: "laptop", label: "アプリ" },
};

/** 島でやっていること。3枚とも、その中身を持っている面へ行く。 */
const DOING = [
  {
    href: "/map",
    art: <PackArt size={54} />,
    title: "歩く",
    note: "行き先は配信で相談して決める。歩いて越えた国境もある。",
    go: "歩いた国を見る",
  },
  {
    href: "/kitchen",
    art: <PotArt size={54} />,
    title: "作って食べる",
    note: "その土地の料理を、企画会議・買い出し・調理の3日がかりで作る。",
    go: "スタンプ帳を見る",
  },
  {
    href: "/apps",
    art: <CodeArt size={54} />,
    title: "アプリを作る",
    note: "グルメアプリ「なに食べよ」。機能も文言も、配信で意見をもらって決めている。",
    go: "アプリへ",
  },
];

const fmtY = (d: string) => d.slice(0, 4);
const fmtMd = (d: string) => `${Number(d.slice(5, 7))}月${Number(d.slice(8, 10))}日`;

export default function AboutPage() {
  const s = STATS_FALLBACK;
  const steps = [...STORY].filter((x) => x.date).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <PageShell current="friends" crumbs={[{ label: "あやとのこと" }]}>
      <PageHead
        icon="hut-ayato"
        title="あやとのこと"
        lead="あやとって何者で、いま何をしていて、これからどこへ行くのか。ここに座って、ひととおり。"
      />

      {/* 顔と3行が先。数字はそのあと。はじめて来た人が知りたいのは
          「どんな人か」で、「何本配信したか」はそれを裏づける数だから。 */}
      <Panel>
        <h2>はじめまして</h2>
        <div className="abio">
          {/* 写真は「誰かが紙に貼ったもの」として置く（docs/island-world.md 6.2-3）。
              生成りの縁を付けて、わずかに傾ける。写真そのものを裸で置かない。 */}
          <span className="abio-art">
            <img src="/characters/ayato-clay.jpg" alt="鍋をかきまぜているあやと" width={300} height={169} />
          </span>
          <div className="abio-word">
            <b>{PROFILE.lead}</b>
            {PROFILE.body.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </div>
        {/* 「いま何してる」「これからどこへ行く」は、名乗りの続きとして
            行き先だけ置く。前はここに <NowLive /> をまるごと呼んでいて、
            「いまどこ」の2枚（今夜までの残り時間と今週やること）が
            この面の中にもう一度出ていた。同じものが2面にあると、
            どちらが本体なのか分からなくなるし、それだけで 1,006px あった。 */}
        <div className="tiles" style={{ marginTop: 14 }}>
          <Link className="tile" href="/now">
            <span className="tile-mark">
              <Icon name="globe" size={24} />
            </span>
            <span className="tile-text">
              <b>いま、どこで何してる</b>
              <i>{NOW_FALLBACK.place}。今夜の配信まであと何時間か、今週やること</i>
            </span>
            <Icon name="right" size={16} className="tile-go" />
          </Link>
          <Link className="tile" href="/next">
            <span className="tile-mark">
              <Icon name="tent" size={24} />
            </span>
            <span className="tile-text">
              <b>これから、どこへ行く</b>
              <i>配信で決めた、これからの企画</i>
            </span>
            <Icon name="right" size={16} className="tile-go" />
          </Link>
        </div>
      </Panel>

      {/* 数字は6つ。「毎晩配信している人」がいちばん言いたいことなので先頭に置く
          （先頭を大きくするのは pages.css の .stat:first-child）。
          コメントの数を足した。この人の配信がどれだけ喋られているかは、
          本数や日数より伝わる。紙の面の数字は罫のます目のまま。押せる板にしない
          （docs/island-world.md 4章）。 */}
      <div className="stats" style={{ marginBottom: 16 }}>
        <Stat
          value={<LiveNumber statKey="streams" fallback={s.streams} />}
          label="配信本数"
          sub={`${s.since.replace(/-/g, "/")} から毎晩22時`}
        />
        <Stat value={<Days from={s.since} />} label="旅した日数" sub="日本を出てから" />
        <Stat value={s.countries} label="歩いた国" sub="パリからトビリシまで" />
        <Stat value={s.recipes} label="作った料理" sub="その土地のものを" />
        <Stat
          value={<LiveNumber statKey="comments" fallback={s.comments} />}
          label="ついたコメント"
          sub="配信のチャット"
        />
        <Stat
          value={<LiveNumber statKey="people" fallback={s.people} />}
          label="来てくれた人"
          sub="のべ"
        />
      </div>

      {/* ここが「何が面白いのか」への答え。畳まない。 */}
      <Panel>
        <h2>島で、なにをしているんだろう</h2>
        <p className="muted">3つ。どれも配信しながらやっています。押すと、その中身の面へ。</p>
        <div className="acards" style={{ marginTop: 14 }}>
          {DOING.map((d) => (
            <Link className="acard" href={d.href} key={d.href}>
              {d.art}
              <b>{d.title}</b>
              <p>{d.note}</p>
              <span className="acard-go">
                {d.go}
                <Icon name="right" size={12} />
              </span>
            </Link>
          ))}
        </div>
        <p style={{ marginTop: 16 }}>
          ひとりでやっているわけじゃない。島に住んでいるのは、配信に来てくれる人たち。
          いまの住人は<LiveNumber statKey="activeFriends" fallback={ACTIVE_FRIENDS} />人。
        </p>
        <Link className="tile" href="/friends" style={{ marginTop: 12 }}>
          <span className="tile-mark">
            <Icon name="friends" size={24} />
          </span>
          <span className="tile-text">
            <b>愉快な仲間達</b>
            <i>島に住んでいる人たち、全員</i>
          </span>
          <Icon name="right" size={16} className="tile-go" />
        </Link>
      </Panel>

      {/* 道のり。縦に9段だと 800px を超えるので、横に倒して指で送る道にした。 */}
      <Panel>
        <h2>ここまで、何があったんだろう</h2>
        <p className="muted">
          旅の節目とアプリの節目だけ。石を押すと、その国・そのアプリ・その伝説の面へ入れます。
        </p>
        <div className="aroad">
          <div className="aroad-rail">
            {steps.map((x, i) => {
              const newYear = i === 0 || fmtY(steps[i - 1].date) !== fmtY(x.date);
              const stone = (
                <>
                  <span className="aroad-when">
                    <span className="aroad-mark" title={MARK[x.kind].label}>
                      <Icon name={MARK[x.kind].icon} size={15} />
                    </span>
                    {fmtMd(x.date)}
                  </span>
                  <b className="aroad-what">{x.what}</b>
                  <p className="aroad-note">{x.note}</p>
                  {x.href && (
                    <span className="aroad-go">
                      {x.go}
                      <Icon name="right" size={12} />
                    </span>
                  )}
                </>
              );
              return (
                <div key={x.date + x.what} style={{ display: "contents" }}>
                  {newYear && <span className="aroad-year">{fmtY(x.date)}年</span>}
                  {x.href ? (
                    <Link className="aroad-stone" href={x.href} prefetch={false}>
                      {stone}
                    </Link>
                  ) : (
                    <div className="aroad-stone is-flat">{stone}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        {/* 旗17枚をここに並べていたが、押せないうえに `/map` と
            トップの棚に同じものがある。道のりの下は行き先1つでよい。 */}
        <Link className="tile" href="/map" style={{ marginTop: 14 }}>
          <span className="tile-mark">
            <Icon name="flagpost" size={24} />
          </span>
          <span className="tile-text">
            <b>歩いた国へ</b>
            <i>歩いた{s.countries}カ国を、1枚の地図で</i>
          </span>
          <Icon name="right" size={16} className="tile-go" />
        </Link>
      </Panel>

      {/* 配信の型は `/streams` の中身。この面のものではないので畳んだままにする。 */}
      <div className="folds">
        <Fold
          title="どんな配信をしてるんだろう"
          lead="クッキングも、おさんぽも、アプリ作りも"
          note={`${STREAM_TYPES.length}の型`}
        >
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
        </Fold>
      </div>
    </PageShell>
  );
}
