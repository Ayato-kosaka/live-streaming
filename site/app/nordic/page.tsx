import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/ui/PageShell";
import { Panel } from "@/components/ui/Bits";
import Icon from "@/components/ui/Icon";
import Flag from "@/components/ui/Flag";
import TripNow, { type Stop } from "@/components/nordic/TripNow";
import RouteMapSvg from "@/components/nordic/RouteMapSvg";
import RouteLegs from "@/components/nordic/RouteLegs";
import { CarriedBy } from "@/components/nordic/Carry";
import MapLegend from "@/components/nordic/MapLegend";
import CountryIdeas from "@/components/nordic/CountryIdeas";
import Highlights from "@/components/nordic/Highlights";
import {
  DEPART,
  HITCH_KM,
  MAIN,
  NORDIC_COUNTRIES,
  NORDIC_GUIDE,
  ROUTE,
  nordicCountry,
} from "@/content/nordic";
import MAP from "@/content/nordic/map.json";
import { planById } from "@/content/plans";
import { LINKS } from "@/content/site";

export const metadata: Metadata = {
  title: "スウェーデンまでヒッチハイクで",
  description:
    "スウェーデンに、会いたい人がいます。ジョージアからそこまで1,541km。バスにも電車にも乗らず、人の車だけで行きます。2026年9月11日出発。ルート地図、国ごとの見どころ、旅のしおり。",
};

const MOVE: Record<string, string> = {
  fly: "飛行機",
  hitch: "ヒッチハイク",
  ferry: "フェリー",
  walk: "歩き",
};

/**
 * 北欧ヒッチハイク旅。
 *
 * この企画は「ヒッチハイクで北欧を回る」ではなく、
 * **会いたい人がいるので、スウェーデンまで陸路で会いに行く**話。
 * 行為ではなく目的があるので、終わりが想像できるし、1,541km が
 * そのまま「会えるまでの遠さ」になる。
 * その人が誰なのかは書かない。名前も写真も出さない。
 *
 * 並びは「来た人の頭に浮かぶ順」。
 *   1. いつ出て、会えるまであとどれだけで、いまどこにいるのか（TripNow）
 *   2. どの道を通るのか（地図）
 *   3. どうしてバスに乗らないのか
 *   4. その道で何が起きるのか（区間ごと）
 *   5. 途中で何を見るのか
 *   6. どの国を通るのか
 *   7. 持っていくもの
 *   8. 自分は何を言えるのか（意見）
 *
 * 数字は意味のあるものだけ置く。読んで何も分からない数字（「0回、戻らない」）は出さない。
 */
export default async function NordicPage() {
  const plan = planById("nordic");
  const doneru = LINKS.find((l) => l.id === "doneru")!;
  const cityId = Object.fromEntries(MAP.cities.map((c) => [c.name, c.id]));

  // 一本道の止まる場所。寄り道は数えない（行って戻ってくるので旅は進まない）。
  const stops: Stop[] = [
    { name: MAIN[0].from, country: "ジョージア" },
    ...MAIN.map((l) => {
      const nm = l.to.replace(/（.*$/, "");
      const c = l.enters ? nordicCountry(l.enters) : undefined;
      return {
        name: nm,
        id: cityId[nm],
        country: c?.name,
        how: `${MOVE[l.move]}${l.km ? ` ${l.km.toLocaleString()}km` : ""}${l.time ? ` / ${l.time}` : ""}`,
        art: l.art,
        note: l.note,
        hitch: l.move === "hitch" ? (l.km ?? 0) : 0,
      };
    }),
  ];
  // 国が変わらない区間は、直前の国をそのまま引き継ぐ。
  for (let i = 1; i < stops.length; i++) {
    if (!stops[i].country) stops[i].country = stops[i - 1].country;
  }
  // 寄り道ぶんの距離は、その日を過ごす街に足す。
  // 一本道に並べないだけで、親指を上げる距離には入っている（HITCH_KM と合わせる）。
  for (const l of ROUTE) {
    if (!l.side || l.move !== "hitch" || !l.km) continue;
    const s = stops.find((x) => x.name === l.from.replace(/（.*$/, ""));
    if (s) s.hitch = (s.hitch ?? 0) + l.km;
  }

  return (
    <PageShell current="next" crumbs={[{ label: "これから", href: "/next" }, { label: "北欧ヒッチハイク" }]}>
      <TripNow
        stops={stops}
        depart={DEPART}
        departWhen="2026年9月11日(金) 23:30 ジョージア時間 / 日本時間 9月12日 04:30"
        hitchKm={HITCH_KM}
      />

      {/* 地図。このページの主役なので、いちばん上に、いちばん大きく。
          面は紙（`docs/island-world.md` 2章）。`Panel` は id を取らないので、
          ここは class を直に書く。 */}
      <section className="panel paper is-map" id="map">
        <h2>会いに行く道</h2>
        <p className="muted">街を押すと、その国のページへ。</p>
        <RouteMapSvg />
        <MapLegend />
        <p className="nmap-say">
          いちばん上のストックホルムが終点。そこまでの線は、ぜんぶ誰かの車と船です。
        </p>
      </section>

      <Panel>
        <h2>どうしてバスに乗らないのか</h2>
        {plan?.about?.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        <div className="nquote">
          <p>
            バスなら2日で終わる道です。それを親指1本で行くのは、
            <b>そうやって行かないと、会いに行ったことにならない</b>から。
            誰の車に乗せてもらえるかで、旅の中身が毎日変わります。
          </p>
        </div>
      </Panel>

      {/* 連れていくボード。新しいセクションを作らず、区間カードに席を2つ置いてある
          （`docs/nordic-fund.md` 提案1）。旅は集まらなくても行くので、
          「届かないと行けません」とは書かない。 */}
      <Panel>
        <h2>この10日を、連れていく</h2>
        <p className="muted">
          区間を押すと、席が2つ出てきます。<b>道しるべ</b>は、その日に何をしてほしいかの言葉。
          <b>足代</b>は、その区間を越えるのに実際に要るもの1つ。
          両方そろって、その区間はつながります。
        </p>
        <CarriedBy />
        <RouteLegs />
        <div className="carry-give">
          <p>
            足代は、通る順に上から入ります。どの区間に入るかは、こちらでは決めません。
            集まらなかったぶんは、あやとが自分で出して越えます。<b>旅は止まりません。</b>
          </p>
          <a className="carry-go" href={doneru.href} target="_blank" rel="noopener noreferrer">
            足代を出す（Doneru）
            <Icon name="external" size={14} />
          </a>
        </div>
      </Panel>

      <Panel>
        <h2>会いに行く途中で、何を見るのか</h2>
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
      <div id="voices">
        <CountryIdeas
          country="北欧旅"
          title="この旅ぜんぶに、言いたいこと"
          note="区間ごとの話は、上の道しるべへ。ここは、どの区間にも紐づかない話の行き先です。ルートへの口出しも、やってほしい企画も、乗せてくれそうな知り合いの話も。行く前に全部読みます。"
          placeholder="例）ヒッチハイクで拾ってくれた人に、その国のごはんを教えてもらう企画にしてほしい"
        />
      </div>
    </PageShell>
  );
}
