import type { Metadata } from "next";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import VoiceBubble from "@/components/ui/Voice";
import { Panel, Stat, TileLink } from "@/components/ui/Bits";
import Fold from "@/components/ui/Fold";
import Icon, { type IconName } from "@/components/ui/Icon";
import { LiveNumber } from "@/lib/liveStats";
import { STREAM_TYPES } from "@/content/streamTypes";
import { ACTIVE_FRIENDS } from "@/content/residents";
import CardStrip from "@/components/cards/CardStrip";
import { BEFORE_STREAM, BEFORE_STREAM_DAYS, countryBySlug } from "@/content/countries";
import { ALL_APPS, APPS, PAST_APPS } from "@/content/apps";
import { CHAPTERS } from "@/content/chapters";
import { VOICES } from "@/content/voices";
import { NOW_FALLBACK, PROFILE, STATS_FALLBACK } from "@/content/site";
import { placeWord } from "@/lib/stay";
import NowPlace from "@/components/home/NowPlace";
import Say from "@/components/ui/Say";
import { say } from "@/content/nights";
import Days from "@/components/atlas/Days";
import { PackArt, PotArt, CodeArt } from "@/components/atlas/art";
import Age from "./parts";
import "./about.css";

export const metadata: Metadata = {
  title: "あやとのこと",
  description:
    "アプリを作りたくて日本を出た人の、ここまで。旅と配信とアプリの年表と、視聴者さんから見たあやと。",
};

/**
 * あやとのこと。
 *
 * 来た人の「この人だれ」に、読ませずに答える面。実測で 0:06 で帰られていた面なので、
 * **上から順に読んで「アプリを作りたくて日本を出た人」に着地する**ことだけを狙う。
 *
 * ## 事実で作り直した（2026-09-05）
 *
 * 本人から経歴が届いたので、書き直した。前は「2024年の秋に日本を出て」までしか無く、
 * **なぜ出たのかが1行も無かった。** ここが無いと、毎晩配信していることも、
 * アプリを作っていることも、ばらばらの出来事に見える。
 *
 *   出た理由 … 自分で作った旅行計画アプリ（スペリーブ）を広めるため
 *   毎日になった理由 … プロモーションがうまくいかず、2024-12-31 に延長を決めた
 *   アプリは3つ … スペリーブ / なにこれオーディオガイド / なに食べよ
 *
 * ## 数え直した数字
 *
 * 「旅した日数（日本を出てから）」を、初回の配信日（2024-10-28）から数えていた。
 * 日本を出たのは 9月11日なので **47日足りていなかった。** `PROFILE.leftJapan` から数える。
 * 「毎日配信の日数」は `PROFILE.dailySince` から。どちらも画面が出てから数え直す。
 *
 * ## 積んである順と、その理由
 *
 *   はじめまして … 顔と4行。ここで「何をしている人か」に着地させる
 *   数字 … その4行の裏づけ
 *   視聴者さんの声 … こちらの言葉ではなく、来ている人の言葉で言ってもらう
 *   島でやっていること … 3つ。押すとその中身の面へ
 *   ここまでの道のり … 横に倒して指で送る。章（`content/chapters.ts`）で区切る
 *   作ってきたアプリ … 3つ。**終わった2つと、いま動いている1つを同じ見た目にしない**
 *
 * 住人（住んでる人）の絵はここでは出さない。`/friends` と同じ絵を2ページに並べると、
 * どちらが本体なのか分からなくなる。
 */

/** 節目の日付は、国とアプリのデータから引く。ここで西暦を手打ちしない。 */
const on = (slug: string, i = 0) => countryBySlug(slug)?.stays[i]?.from ?? "";
/** そのアプリで、その種類の節目がはじめて来た日。並び順の番号で指すと、間に1行入るとずれる。 */
const appOn = (slug: string, kind: string) =>
  [...APPS, ...PAST_APPS].find((a) => a.slug === slug)?.milestones.find((m) => m.kind === kind)?.date ?? "";

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
  {
    date: appOn("spelieve", "release"),
    kind: "app",
    what: "旅行計画アプリ「スペリーブ」を出した",
    note: "会社に勤めていたころ。これをヒットさせたかった",
  },
  {
    date: PROFILE.leftJapan,
    kind: "travel",
    what: "日本を出た",
    note: "自分のアプリで計画しながら旅する様子を撮るため。イギリス、バルセロナ、ローマと2週間ずつ",
  },
  {
    date: on("france"),
    kind: "live",
    what: "パリで配信を始めた",
    note: "「日本語を話したい」というタイトル。ここから全部が始まった",
    href: "/map/france",
    go: "フランスへ",
  },
  {
    date: PROFILE.dailySince,
    kind: "live",
    what: "帰らないと決めた",
    note: "3ヶ月で帰るはずだった。プロモーションがうまくいかず、延長を決めた日。ここから1日も休んでいない",
    href: "/streams",
    go: "配信のことへ",
  },
  {
    date: on("uk", 1),
    kind: "travel",
    what: "ヨーロッパを9カ国まわって、イギリスへ",
    note: "オランダ、ベルギー、中欧、ドイツ、そしてスコットランド",
    href: "/map/uk",
    go: "イギリスへ",
  },
  {
    date: on("egypt"),
    kind: "travel",
    what: "ヨーロッパを出て、エジプトへ降りた",
    note: "ピラミッドと砂漠と、アブ・シンベルまで",
    href: "/map/egypt",
    go: "エジプトへ",
  },
  {
    date: appOn("nanikore", "build"),
    kind: "app",
    what: "2つ目「なにこれオーディオガイド」を出した",
    note: "目の前のものが何なのか分からない、という自分の困りごとから",
    href: "/apps/nanikore",
    go: "このアプリへ",
  },
  {
    date: appOn("nanitabeyo", "build"),
    kind: "app",
    what: "3つ目「なに食べよ」を作り始めた",
    note: "ヨルダンで「みんなで外食の悩みを解決するアプリを作ろう」と言い出した",
    href: "/map/jordan",
    go: "ヨルダンへ",
  },
  {
    date: on("georgia"),
    kind: "travel",
    what: "ジョージアに着いた",
    note: "いちばん長くいる国。ここでクッキング配信が定着した",
    href: "/map/georgia",
    go: "ジョージアへ",
  },
  {
    date: appOn("nanitabeyo", "release"),
    kind: "app",
    what: "「なに食べよ」をリリースした",
    note: "クタイシから報告。いまも毎週アップデートしている",
    href: "/apps/nanitabeyo",
    go: "このアプリへ",
  },
  {
    date: on("iran-border"),
    kind: "travel",
    what: "アルメニアからイラン国境まで、380kmを歩いた",
    note: "10日間。帰りはヒッチハイクでエレバンへ",
    href: "/legends/iran-walk",
    go: "伝説の企画へ",
  },
  {
    date: on("georgia", 1),
    kind: "travel",
    what: "トビリシに戻ってきた",
    note: say("hereNow"),
    href: "/now",
    go: "いまどこへ",
  },
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

/**
 * その日がどの島（章）の話か。**章の切りかたは `content/chapters.ts` が唯一の出どころ**なので、
 * ここで期間を書かない。枝（イランまで歩く）は本線の中の出来事なので、背骨には出さない。
 */
const eraOf = (date: string) =>
  CHAPTERS.find((c) => !c.branchOf && c.from && c.from <= date && (!c.to || date <= c.to))?.name ??
  "配信のまえ";

/** 島でやっていること。3枚とも、その中身を持っている面へ行く。 */
const DOING = [
  {
    href: "/map",
    art: <PackArt size={46} />,
    title: "歩く",
    note: `${STATS_FALLBACK.countries}カ国`,
    go: "歩いた国",
  },
  {
    href: "/kitchen",
    art: <PotArt size={46} />,
    title: "作って食べる",
    note: `その土地の料理を${STATS_FALLBACK.recipes}品`,
    go: "作った料理",
  },
  {
    href: "/apps",
    art: <CodeArt size={46} />,
    title: "アプリを作る",
    note: "グルメアプリ「なに食べよ」",
    go: "アプリ",
  },
];

const fmtMd = (d: string) => `${Number(d.slice(5, 7))}月${Number(d.slice(8, 10))}日`;
const fmtYm = (d: string) => `${d.slice(0, 4)}年${Number(d.slice(5, 7))}月`;

/** 声は4つ開けて、残りは畳む。全部並べると、この面がコメント欄そのものになる。 */
const VOICE_OPEN = 4;

/** 声1つ。吹き出しそのものは `components/ui/Voice.tsx`（`/kitchen/[品]` と共通）。 */
function Voice({ v, i }: { v: (typeof VOICES)[number]; i: number }) {
  // 吹き出しは押せない。紙の上の引用なので、厚みは付けない（docs/island-world.md 3.4）
  return <VoiceBubble icon={v.icon} name={v.name} meta={fmtYm(v.date)} text={v.text} flip={i % 2 === 1} />;
}

export default function AboutPage() {
  const s = STATS_FALLBACK;
  const steps = [...STORY].filter((x) => x.date).sort((a, b) => a.date.localeCompare(b.date));
  /* 配信が始まる前だけを並べる。**パリを混ぜない。** パリは滞在の途中で配信が
     始まった街なので（`content/countries.ts` の `streamBegan`）、
     「配信を始めるまえ」の列に入れると、パリで配信していないことになる。 */
  const before = BEFORE_STREAM.filter((c) => !c.streamBegan)
    .map((c) => c.city ?? c.name)
    .join("、");

  return (
    <PageShell current="friends" crumbs={[{ label: "あやとのこと" }]}>
      <PageHead
        icon="hut-ayato"
        title="あやとのこと"
        lead="アプリを作りたくて日本を出た人の、ここまでと、いま。"
      />

      {/* 顔と4行が先。数字はそのあと。はじめて来た人が知りたいのは
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
            {/* 年齢は焼き込むと止まるので、画面が出てから数え直す */}
            <p className="abio-who">
              {PROFILE.name}（<Age born={PROFILE.born} />歳）
            </p>
            {PROFILE.body.map((p, i) => (
              <p key={i}><Say t={p} /></p>
            ))}
          </div>
        </div>
        {/* 「いま何してる」だけ、名乗りの続きとして置く。
            前はここに <NowLive /> をまるごと呼んでいて、「いまどこ」の2枚が
            この面の中にもう一度出ていた。それだけで 1,006px あった。
            「これから」の札も外した。ヘッダーの札と、道のりの最後の石から行ける。 */}
        <div className="tiles" style={{ marginTop: 14 }}>
          <Link className="tile" href="/now">
            <span className="tile-mark">
              <Icon name="globe" size={24} />
            </span>
            <span className="tile-text">
              <b>いま、どこで何してる</b>
              {/* 「いまどこ」は、表紙の名刺・`/now` と**同じ判定・同じ言い方**で出す
                  （`lib/stay.ts` の `placeWord`）。ここは `current.place` を素で
                  出していたので、旅の2日目に撮ると常設のこの面だけ
                  「ジョージア・トビリシ」と言っていた。**打つ人は走っている車の中に
                  いて、17日間その欄を直せない。** 部品は表紙と同じものを使う
                  （便りが届いたら人の字が勝つところまで、そちらが持っている）。
                  添え字のほうは、旅のあいだカウントダウンが消えるので `Say` で言い替える。 */}
              <i>
                <NowPlace baked={placeWord(NOW_FALLBACK.place, NOW_FALLBACK.updatedAt)} />
                。<Say t={say("nowLink")} />
              </i>
            </span>
            <Icon name="right" size={16} className="tile-go" />
          </Link>
        </div>
      </Panel>

      {/* 数字は6つ。「毎日休まず配信している人」がいちばん言いたいことなので先頭に置く
          （先頭を大きくするのは pages.css の .stat:first-child）。
          紙の面の数字は罫のます目のまま。押せる板にしない（docs/island-world.md 4章）。 */}
      <div className="stats astats" style={{ marginBottom: 16 }}>
        <Stat
          value={<Days from={PROFILE.dailySince} plus={1} />}
          label="毎日配信の日数"
          sub={`${PROFILE.dailySince.replace(/-/g, "/")} から1日も休まず`}
        />
        <Stat
          value={<LiveNumber statKey="streams" fallback={s.streams} />}
          label="配信本数"
          sub={`${s.since.replace(/-/g, "/")} にパリで1本目`}
        />
        <Stat
          value={<Days from={PROFILE.leftJapan} />}
          label="旅した日数"
          sub={`${PROFILE.leftJapan.replace(/-/g, "/")} に日本を出てから`}
        />
        <Stat value={s.countries} label="配信した国" sub="パリからトビリシまで" />
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

      {/* こちらが書いた紹介文をここに1行も混ぜない。混ぜると、どれが本当の声なのか
          分からなくなって、全部が疑わしくなる。出どころは配信のチャット
          （`python/build_voices.py` → `content/voices.ts`）。 */}
      <Panel>
        <h2>島のみんなから見た、あやと</h2>
        <p className="muted">配信のコメント欄から、書かれたまま。</p>
        <ul className="avoices">
          {VOICES.slice(0, VOICE_OPEN).map((v, i) => (
            <Voice key={v.eventId} v={v} i={i} />
          ))}
        </ul>
        {VOICES.length > VOICE_OPEN && (
          <div className="folds" style={{ marginTop: 12 }}>
            <Fold title="もっと聞く" note={`${VOICES.length - VOICE_OPEN}件`}>
              <ul className="avoices">
                {VOICES.slice(VOICE_OPEN).map((v, i) => (
                  <Voice key={v.eventId} v={v} i={i + VOICE_OPEN} />
                ))}
              </ul>
            </Fold>
          </div>
        )}
      </Panel>

      {/* ここが「何が面白いのか」への答え。畳まない。 */}
      <Panel>
        <h2>島で、なにをしているんだろう</h2>
        <p className="muted">3つとも、配信しながらやっている。</p>
        <div className="ado">
          {DOING.map((d) => (
            <Link className="ado-card" href={d.href} key={d.href}>
              {d.art}
              <b>{d.title}</b>
              <p>{d.note}</p>
              <span className="ado-go">
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
            <b>住んでる人</b>
            <i>島に住んでいる人たち、全員</i>
          </span>
          <Icon name="right" size={16} className="tile-go" />
        </Link>

        {/* あやと島カード（#173）。あやとの言葉:「導線は /about の
            住んでる人の下で一覧見れると良いかも」。**住んでる人の札の下。**
            企画の表はここ（server）で引いて値だけ渡す。client から
            `content/plans.ts`（20KB）を読ませないため。 */}
        <CardStrip />
      </Panel>

      {/* 道のり。縦に12段だと 1,000px を超えるので、横に倒して指で送る道にした。
          区切りは年ではなく島（章）。`content/chapters.ts` と同じ切りかたにしておくと、
          島の連なり（docs/island-atlas.md）が建ったときに言いかたが1つで済む。 */}
      <Panel>
        <h2>ここまで、何があったんだろう</h2>
        <p className="muted">日本を出るまえから、いままで。</p>
        <div className="aroad">
          <div className="aroad-rail">
            {steps.map((x, i) => {
              const era = eraOf(x.date);
              const newEra = i === 0 || eraOf(steps[i - 1].date) !== era;
              const stone = (
                <>
                  <span className="aroad-when">
                    <span className="aroad-mark" title={MARK[x.kind].label}>
                      <Icon name={MARK[x.kind].icon} size={15} />
                    </span>
                    {x.date.slice(0, 4)}年{fmtMd(x.date)}
                  </span>
                  <b className="aroad-what">{x.what}</b>
                  <p className="aroad-note"><Say t={x.note} /></p>
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
                  {newEra && <span className="aroad-era">{era}</span>}
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
        <p className="muted" style={{ marginTop: 12 }}>
          配信を始めるまえの{BEFORE_STREAM_DAYS}日、{before}と歩いて、パリで1本目を出しました。
        </p>
        <Link className="tile" href="/map" style={{ marginTop: 12 }}>
          <span className="tile-mark">
            <Icon name="flagpost" size={24} />
          </span>
          <span className="tile-text">
            <b>歩いた国へ</b>
            <i>配信した{s.countries}カ国を、1枚の地図で</i>
          </span>
          <Icon name="right" size={16} className="tile-go" />
        </Link>
      </Panel>

      {/* 作ってきたアプリ。**終わった2つと、いま動いている1つを同じ見せ方にしない。**
          いま動いているものは色のまま、終わったものは色を落として「サポート終了」の札を出す。
          押せるかどうか（厚み）とは別の軸なので、なにこれは灰色だが押せる。 */}
      <Panel>
        <h2>作ってきたアプリは、3つ</h2>
        <p className="muted">1つ目を広めるために日本を出て、いまは3つ目。</p>
        <div className="aappl">
          {ALL_APPS.map((a) => {
            const done = a.status === "サポート終了";
            const page = APPS.some((x) => x.slug === a.slug);
            const inner = (
              <>
                {a.logo && <img className="aappl-i" src={a.logo} alt="" width={52} height={52} />}
                <b>{a.name}</b>
                {/* 状態は「押せない札」（`docs/island-world.md` 4章）。平らなオリーブのまま */}
                <span className="chip">{a.status}</span>
              </>
            );
            const cls = `aappl-row${done ? " is-done" : ""}`;
            return page ? (
              <Link className={cls} href={`/apps/${a.slug}`} key={a.slug} prefetch={false}>
                {inner}
                <span className="aappl-go">
                  中を見る
                  <Icon name="right" size={12} />
                </span>
              </Link>
            ) : (
              <div className={`${cls} is-flat`} key={a.slug}>
                {inner}
              </div>
            );
          })}
        </div>
      </Panel>

      {/* 配信の型は `/streams` の中身。この面のものではないので畳んだままにする。 */}
      <div className="folds">
        <Fold
          title="どんな配信をしてるんだろう"
          lead="クッキングも、おさんぽも、アプリ作りも"
          note={`${STREAM_TYPES.length}の型`}
        >
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
