import type { Metadata } from "next";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { Panel } from "@/components/ui/Bits";
import Countdown from "@/components/nordic/Countdown";
import RouteMap from "@/components/nordic/RouteMap";
import { HITCH_KM, NORDIC_COUNTRIES, NORDIC_GUIDE } from "@/content/nordic";
import { planById } from "@/content/plans";

export const metadata: Metadata = {
  title: "ヒッチハイクで北欧へ",
  description:
    "2026年9月11日、ジョージアを出て、ポーランドからバルト三国を北上して北欧へ。陸路はぜんぶヒッチハイク。ルート、国ごとの見どころ、旅のしおり。",
};

/**
 * 北欧ヒッチハイク旅のトップ。
 *
 * 見せる順は「いつ出るのか → どうやって行くのか → どこへ行くのか → 何を持っていくのか」。
 * この企画でいちばん伝わってほしいのは、距離をぜんぶ人の親切でつなぐという一点なので、
 * 数字（1,475km）を早いうちに出す。
 */
export default function NordicPage() {
  const plan = planById("nordic");
  return (
    <PageShell current="next" crumbs={[{ label: "これから", href: "/next" }, { label: "北欧ヒッチハイク" }]}>
      <PageHead
        emoji="👍"
        title="ヒッチハイクで北欧へ"
        lead={plan?.note}
        say="いってらっしゃい、じゃなくて。どこかで一緒に乗せてもらう気持ちで見ててね。"
      />

      <Panel>
        <Countdown />
        <div className="nfacts">
          <span>
            <b>{HITCH_KM.toLocaleString()}</b>
            <i>km をヒッチハイク</i>
          </span>
          <span>
            <b>6</b>
            <i>カ国を北へ</i>
          </span>
          <span>
            <b>1</b>
            <i>本だけ飛行機</i>
          </span>
          <span>
            <b>0</b>
            <i>回、戻らない</i>
          </span>
        </div>
        {plan?.about?.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </Panel>

      <Panel>
        <h2>どうやって行くのか</h2>
        <RouteMap />
      </Panel>

      <Panel>
        <h2>どこへ行くのか</h2>
        <p className="muted">
          通る順に6カ国。国を押すと、その国の見どころと、その国あての企画募集が出てきます。
        </p>
        <div className="ncountries">
          {NORDIC_COUNTRIES.map((c) => (
            <Link key={c.slug} className="ncountry" href={`/nordic/${c.slug}`} style={{ borderColor: c.color }}>
              <span className="ncountry-leg">{c.leg}</span>
              <span className="ncountry-flag" aria-hidden>
                {c.flag}
              </span>
              <span className="ncountry-body">
                <b>{c.name}</b>
                <i>{c.catch}</i>
                <em>
                  {c.spots}件 / {c.cities.slice(0, 4).join("・")}
                  {c.cities.length > 4 ? " ほか" : ""}
                </em>
              </span>
            </Link>
          ))}
        </div>
      </Panel>

      <Panel>
        <h2>何を持っていくのか</h2>
        <p className="muted">
          お金、通信、服、サウナの入り方、食べもの、おみやげ、困ったとき。
          ぜんぶ調べて1ページにまとめました。行かない人が読んでも面白いはず。
        </p>
        <div className="tiles" style={{ marginTop: 12 }}>
          <Link className="tile" href="/nordic/guide">
            <span className="tile-text">
              <b>旅のしおり</b>
              <i>
                お金・通信・服装・サウナ・食べもの{NORDIC_GUIDE.food.length}品・おみやげ
                {NORDIC_GUIDE.souvenir.length}品
              </i>
            </span>
            <span className="tile-go" aria-hidden>
              →
            </span>
          </Link>
        </div>
      </Panel>
    </PageShell>
  );
}
