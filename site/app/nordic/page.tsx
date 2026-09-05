import type { Metadata } from "next";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { Panel } from "@/components/ui/Bits";
import Icon from "@/components/ui/Icon";
import Flag from "@/components/ui/Flag";
import Countdown from "@/components/nordic/Countdown";
import RouteMapSvg from "@/components/nordic/RouteMapSvg";
import RouteLegs from "@/components/nordic/RouteLegs";
import MapLegend from "@/components/nordic/MapLegend";
import CountryIdeas from "@/components/nordic/CountryIdeas";
import Highlights from "@/components/nordic/Highlights";
import { HITCH_KM, NORDIC_COUNTRIES, NORDIC_GUIDE, ROUTE } from "@/content/nordic";
import MAP from "@/content/nordic/map.json";
import { planById } from "@/content/plans";

export const metadata: Metadata = {
  title: "ヒッチハイクで北欧へ",
  description:
    "2026年9月11日、ジョージアを出て、ポーランドからバルト三国を北上して北欧へ。陸路1,541kmはぜんぶヒッチハイク。ルート地図、国ごとの見どころ、旅のしおり。",
};

/**
 * 北欧ヒッチハイク旅。
 *
 * 主役は地図。「どうやって行くのか」がこの企画のすべてなので、
 * 文章より先に、通る道が絵で見える状態にする。
 *
 * 数字は意味のあるものだけ置く。読んで何も分からない数字（「0回、戻らない」）は出さない。
 */
export default async function NordicPage() {
  const plan = planById("nordic");
  const stays = ROUTE.filter((l) => l.stay).length;
  const cities = MAP.cities.length;

  return (
    <PageShell current="next" crumbs={[{ label: "これから", href: "/next" }, { label: "北欧ヒッチハイク" }]}>
      <PageHead
        icon="signpost"
        title="ヒッチハイクで北欧へ"
        lead={plan?.note}
        say="いってらっしゃい、じゃなくて。どこかで一緒に乗せてもらう気持ちで見ててね。"
      />

      <Panel>
        <Countdown />
      </Panel>

      {/* 地図。このページの主役なので、いちばん上に、いちばん大きく。 */}
      <section className="panel is-map">
        <h2>通る道</h2>
        <p className="muted">街を押すと、その国のページへ。</p>
        <RouteMapSvg />
        <MapLegend />
        <div className="nfacts">
          <span>
            <b>{HITCH_KM.toLocaleString()}</b>
            <i>km を親指で</i>
          </span>
          <span>
            <b>6</b>
            <i>カ国を北へ</i>
          </span>
          <span>
            <b>{cities}</b>
            <i>の街に降りる</i>
          </span>
          <span>
            <b>{stays}</b>
            <i>泊まる街</i>
          </span>
        </div>
      </section>

      <Panel>
        <h2>どういう企画なのか</h2>
        {plan?.about?.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        <div className="nquote">
          <p>
            バスなら2日で終わる道です。それを親指1本で行くのは、
            <b>その土地の人に会わないと1mmも進まない</b>から。
            誰の車に乗せてもらえるかで、旅の中身が毎日変わります。
          </p>
        </div>
      </Panel>

      <Panel>
        <h2>区間ごとの話</h2>
        <p className="muted">押すと、その区間で何が起きるかが出てきます。</p>
        <RouteLegs />
      </Panel>

      <Panel>
        <h2>この旅でいちばん見たいもの</h2>
        <p className="muted">
          161件から、通る順に8つ。写真を押すと、その国のページの、そこに飛びます。
        </p>
        <Highlights />
      </Panel>

      <Panel>
        <h2>通る6カ国</h2>
        <div className="ncountries">
          {NORDIC_COUNTRIES.map((c) => (
            <Link key={c.slug} className="ncountry" href={`/nordic/${c.slug}`}>
              <span className="ncountry-leg">{c.leg}</span>
              <Flag slug={c.slug} size={34} />
              <span className="ncountry-body">
                <b>{c.name}</b>
                <i>{c.catch}</i>
                <em>
                  見どころ {c.spots}件 / {c.cities.slice(0, 3).join("・")}
                  {c.cities.length > 3 ? " ほか" : ""}
                </em>
              </span>
              <Icon name="right" size={16} className="ncountry-go" />
            </Link>
          ))}
        </div>
      </Panel>

      <Panel>
        <h2>持っていくもの</h2>
        <p className="muted">
          お金、通信、服、サウナの入り方、食べもの{NORDIC_GUIDE.food.length}品、おみやげ
          {NORDIC_GUIDE.souvenir.length}品、困ったとき。行かない人が読んでも面白いように書いてあります。
        </p>
        <Link className="tile" href="/nordic/guide">
          <span className="tile-mark">
            <Icon name="book" size={26} />
          </span>
          <span className="tile-text">
            <b>旅のしおり</b>
            <i>10のコーナー。目次から開いて読む</i>
          </span>
          <Icon name="right" size={16} className="tile-go" />
        </Link>
      </Panel>

      {/* 北欧旅ぜんぶへの意見。国ごとの募集は各国のページにある。 */}
      <CountryIdeas
        country="北欧旅"
        title="この旅、どうなってほしい？"
        note="行く前に全部読みます。ルートへの口出しも、やってほしい企画も、乗せてくれそうな知り合いの話も、なんでも。"
        placeholder="例）ヒッチハイクで拾ってくれた人に、その国のごはんを教えてもらう企画にしてほしい"
      />
    </PageShell>
  );
}
