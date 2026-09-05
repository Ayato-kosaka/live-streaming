import type { Metadata } from "next";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { Panel, Stat, TileLink } from "@/components/ui/Bits";
import Icon from "@/components/ui/Icon";
import Flag from "@/components/ui/Flag";
import NowLive from "@/components/live/NowLive";
import { LiveNumber } from "@/lib/liveStats";
import { STREAM_TYPES } from "@/content/streamTypes";
import { RECIPES } from "@/content/recipes";
import { ACTIVE_FRIENDS } from "@/content/residents";
import { COUNTRIES, countryBySlug } from "@/content/countries";
import { appBySlug } from "@/content/apps";
import { NOW_FALLBACK, PROFILE, STATS_FALLBACK } from "@/content/site";
import Days from "@/components/atlas/Days";
import { CampArt, PackArt, PotArt, CodeArt } from "@/components/atlas/art";

export const metadata: Metadata = {
  title: "あやと島について",
  description:
    "あやとって何者で、いま何をしていて、どこへ行くのか。旅と配信とアプリの年表、島でやっていること。",
};

/**
 * たき火広場＝あやと島について。
 *
 * 来た人の「この人だれ」に、読ませずに答える面。
 * 顔 → 数字 → いまどこ → 年表 → やっていること、の順で、
 * 上から下へ目を落とすだけで一周できるようにしてある。
 *
 * 住人（愉快な仲間達）の絵はここでは出さない。`/friends` と同じ絵を
 * 2ページに並べると、どちらが本体なのか分からなくなる。
 */

/** 節目の日付は、国とアプリのデータから引く。ここで西暦を手打ちしない。 */
const on = (slug: string, i = 0) => countryBySlug(slug)?.stays[i]?.from ?? "";
/** そのアプリで、その種類の節目がはじめて来た日。並び順の番号で指すと、間に1行入るとずれる。 */
const appOn = (slug: string, kind: string) =>
  appBySlug(slug)?.milestones.find((m) => m.kind === kind)?.date ?? "";

type Step = { date: string; what: string; note: string; kind: "live" | "travel" | "app" };

const STORY: Step[] = [
  { date: on("france"), kind: "live", what: "パリで配信を始めた", note: "「日本語を話したい」というタイトル。ここから全部が始まった" },
  { date: on("uk"), kind: "travel", what: "ヨーロッパを9カ国まわって、イギリスへ", note: "オランダ、ベルギー、中欧、ドイツ、そしてスコットランド" },
  { date: appOn("nanikore", "build"), kind: "app", what: "はじめてのアプリ「なにこれオーディオガイド」を出した", note: "目の前のものが何なのか分からない、という自分の困りごとから" },
  { date: on("egypt"), kind: "travel", what: "ヨーロッパを出て、エジプトへ降りた", note: "ピラミッドと砂漠と、アブ・シンベルまで" },
  { date: appOn("nanitabeyo", "build"), kind: "app", what: "「なに食べよ」を作り始めた", note: "ヨルダンで「みんなで外食の悩みを解決するアプリを作ろう」と言い出した" },
  { date: on("georgia"), kind: "travel", what: "ジョージアに着いた", note: "いちばん長くいる国。ここでクッキング配信が定着した" },
  { date: appOn("nanitabeyo", "release"), kind: "app", what: "「なに食べよ」をリリースした", note: "クタイシから報告。いまも毎週アップデートしている" },
  { date: on("iran-border"), kind: "travel", what: "アルメニアからイラン国境まで、380kmを歩いた", note: "10日間。帰りはヒッチハイクでエレバンへ" },
  { date: on("georgia", 1), kind: "travel", what: "トビリシに戻ってきた", note: "いまここ。毎晩22時から配信している" },
];

const DOT: Record<Step["kind"], string> = {
  live: "#ff7092",
  travel: "#ff8a1f",
  app: "#4fb089",
};

const fmtY = (d: string) => d.slice(0, 4);
const fmtMd = (d: string) => `${Number(d.slice(5, 7))}月${Number(d.slice(8, 10))}日`;

export default function AboutPage() {
  const s = STATS_FALLBACK;
  const steps = [...STORY].filter((x) => x.date).sort((a, b) => a.date.localeCompare(b.date));
  // 年でまとめる。年をまたぐところに区切りが入ると、旅の長さが目で分かる。
  const years: [string, Step[]][] = [];
  for (const x of steps) {
    const y = fmtY(x.date);
    if (years[years.length - 1]?.[0] !== y) years.push([y, []]);
    years[years.length - 1][1].push(x);
  }
  const ordered = [...COUNTRIES].sort((a, b) => a.order - b.order);

  return (
    <PageShell current="friends" crumbs={[{ label: "あやと島について" }]}>
      <PageHead
        mark={<CampArt size={74} />}
        title="あやと島について"
        lead="たき火のまわりで、はじめましての話を。"
        say="ここは配信の留守番の場所。あやとが何者なのかは、この面でひととおり分かるよ。"
      />

      <Panel>
        <div className="abio">
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
        <div className="stats" style={{ marginTop: 16 }}>
          <Stat
            value={<LiveNumber statKey="streams" fallback={s.streams} />}
            label="配信本数"
            sub={`${s.since.replace(/-/g, "/")} から`}
          />
          <Stat value={<Days from={s.since} />} label="旅した日数" />
          <Stat value={s.countries} label="歩いた国" />
          <Stat value={RECIPES.length} label="作った料理" />
          <Stat
            value={<LiveNumber statKey="people" fallback={s.people} />}
            label="来てくれた人"
            sub="のべ"
          />
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
        <h2>ここまで、何があったんだろう</h2>
        <p className="muted">旅の節目とアプリの節目だけ。国ぜんぶは旅の桟橋にあります。</p>
        <div className="anote">
          {years.map(([year, items]) => (
            <div key={year}>
              <div className="anote-year">{year}年</div>
              <ul className="aline">
                {items.map((x) => (
                  <li key={x.date + x.what}>
                    <span className="aline-rail" aria-hidden />
                    <span className="aline-dot" aria-hidden>
                      <i style={{ background: DOT[x.kind] }} />
                    </span>
                    <span className="aline-when">{fmtMd(x.date)}</span>
                    <b className="aline-what">{x.what}</b>
                    <span className="aline-note">{x.note}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <Link className="tile" href="/map" style={{ marginTop: 14 }}>
          <span className="tile-mark">
            <Icon name="signpost" size={24} />
          </span>
          <span className="tile-text">
            <b>旅の桟橋へ</b>
            <i>歩いた{s.countries}カ国を、1枚の地図で</i>
          </span>
          <Icon name="right" size={16} className="tile-go" />
        </Link>
        <div className="aflags" aria-hidden>
          {ordered.map((c) => (
            <Flag key={c.slug} slug={c.slug} size={26} />
          ))}
        </div>
      </Panel>

      <Panel>
        <h2>島でやっていること</h2>
        <div className="acards">
          <div className="acard">
            <PackArt size={54} />
            <b>歩く</b>
            <p>行き先は配信で相談して決める。歩いて越えた国境もある。</p>
          </div>
          <div className="acard">
            <PotArt size={54} />
            <b>作って食べる</b>
            <p>その土地の料理を、企画会議・買い出し・調理の3日がかりで作る。</p>
          </div>
          <div className="acard">
            <CodeArt size={54} />
            <b>アプリを作る</b>
            <p>グルメアプリ「なに食べよ」。機能も文言も、配信で意見をもらって決めている。</p>
          </div>
        </div>
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
        <h2>ひとりでやっているわけじゃない</h2>
        <p>
          島に住んでいるのは、配信に来てくれる人たち。キャラクターはみんな自分で作ったものです。
          いまの住人は<LiveNumber statKey="activeFriends" fallback={ACTIVE_FRIENDS} />人。
          これまでにのべ<LiveNumber statKey="people" fallback={s.people} />人が来てくれました。
        </p>
        <Link className="tile" href="/friends" style={{ marginTop: 12 }}>
          <span className="tile-mark">
            <Icon name="talk" size={24} />
          </span>
          <span className="tile-text">
            <b>愉快な仲間達</b>
            <i>島に住んでいる人たち、全員</i>
          </span>
          <Icon name="right" size={16} className="tile-go" />
        </Link>
      </Panel>
    </PageShell>
  );
}
