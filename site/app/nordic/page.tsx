import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/ui/PageShell";
import { Panel } from "@/components/ui/Bits";
import Icon from "@/components/ui/Icon";
import Fold from "@/components/ui/Fold";
import TripNow, { type Stop } from "@/components/nordic/TripNow";
import RouteMapSvg from "@/components/nordic/RouteMapSvg";
import Days from "@/components/nordic/Days";
import Asks, { type AskItem } from "@/components/nordic/Asks";
import Support from "@/components/nordic/Support";
import MapLegend from "@/components/nordic/MapLegend";
import CountryIdeas from "@/components/nordic/CountryIdeas";
import Countries from "@/components/nordic/Countries";
import {
  DAYS,
  DEPART,
  FARES,
  HITCH_KM,
  MAIN,
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
 * **この面は、毎晩の配信で「見てね」と言われる面になる。**
 *
 *   1. いま何が起きているか  … あと何日／いまどこ／つぎどこ（TripNow）
 *   2. どこを通るのか        … 地図
 *   3. 何をするのか          … **旅のよてい。日付ごと**（Days）
 *   4. どこへ行けばもっと見られるか … 通る6カ国 → 国のページ
 *   5. もっと知りたい人だけが開くもの … なぜバスに乗らないのか
 *   6. この旅に、言う        … まだ決めていないこと／やってほしいことを書く
 *   7. 応援する              … 投げ銭。**いちばん最後に、これだけで**
 *
 * **3 に、言うことと出すことを混ぜない。** ここは長いあいだ、区間ごとの
 * カード10枚の中に「足代の席」と「道しるべの席」があって、両方そろうと
 * 区間が「つながる」という作りだった。企画に提案することと投げ銭することを
 * 1つの言い方に押し込んでいて、**読む人には通じなかった**
 * （`docs/nordic-fund.md` 「捨てた設計」）。
 * 別のことは別の区画にする。言うことは 6、出すことは 7。
 *
 * **画面に出す言葉は、説明なしで意味が分かるものだけにする。**
 * 「9月12日」「フェリー」「泊まる」「応援する」「まだ決めていないこと」は
 * 説明が要らない。要る言葉を思いついたら、それは作り直しの合図。
 *
 * 数字は意味のあるものだけ置く。読んで何も分からない数字は出さない。
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

  // 区間の id → 何日目。旅程表のその日へ飛ぶのに使う。
  const dayOf: Record<string, number> = {};
  for (const d of DAYS) for (const l of d.legs) dayOf[l.id] = d.n;

  // まだ決めていないこと。何日目の話かを付けて、下の「言う」の区画に並べる。
  const asks: AskItem[] = DAYS.flatMap((d) =>
    d.legs
      .filter((l) => l.fork)
      .map((l) => ({ leg: l.id, seq: ROUTE.indexOf(l), day: d.n, fork: l.fork! })),
  );

  return (
    <PageShell current="next" crumbs={[{ label: "これから", href: "/next" }, { label: "北欧ヒッチハイク" }]}>
      <TripNow
        stops={stops}
        mainLegs={MAIN.map((l) => l.id)}
        legOrder={ROUTE.map((l) => l.id)}
        dayOf={dayOf}
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
        {/* 句点のうしろで改行しない。JSX が改行と字下げを半角空白1つに畳むので、
            和文の途中に空きが1つ入る（書き出した HTML の画素で拾った）。 */}
        {/* 「下の区間を開くと、その線に帯が敷かれます」を書いていた。
            画面の使い方の説明で、読んでも何もできない。開けば分かる。 */}
        <p className="nmap-say">
          いちばん上のストックホルムが終点。そこまでの線は、ぜんぶ誰かの車と船です。
        </p>
        {/* 線の読み方。**畳んである。** 6種類の線の見本は、地図を読むために
            要るものではあるが、初めて開いた人が最初に読むものではない。
            開いたままだと 200px、地図そのものと同じだけの場所を使っていた。 */}
        <div className="folds">
          <Fold
            title="線の読み方"
            lead="ヒッチハイク・フェリー・寄り道・飛行機・国境・通ったところ"
          >
            <MapLegend />
          </Fold>
        </div>
      </section>

      {/* 旅のよてい。**この面の本体。** 日付ごとに1つ。
          国ごとの話は `/nordic/[国]` にあるので、ここには書かない。 */}
      <section className="panel paper" id="plan">
        <h2>旅のよてい</h2>
        {/* 句点のうしろで改行しない。JSX が改行と字下げを半角空白1つに畳む。 */}
        <p className="muted">
          日付が入っているのは、切符のある最初の2日だけです。そこから先は乗せてもらえた日でずれるので、日にちを決めていません。
        </p>
        <Days />
      </section>

      {/* ここから先へ出ていく区画。国のページと、旅のしおりと、企画の説明。
          紙を2枚に分けていたが、どちらも「もっと見たい人が押すもの」なので1枚にする。 */}
      <Panel>
        <h2>通る6カ国</h2>
        <p className="muted">
          写真は、その国でいちばん見たいもの。押すと、その国の見どころが全部出ます。
        </p>
        <Countries />
        <div className="folds">
          <Fold
            title="どうしてバスに乗らないのか"
            lead="ジョージアに戻らない一方通行の旅。飛行機はクタイシ発の1本だけ"
          >
            {plan?.about?.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
            <div className="nquote">
              <p>
                バスなら2日で終わる道です。それを親指1本で行くのは、
                <b>そうやって行かないと、会いに行ったことにならない</b>
                から。誰の車に乗せてもらえるかで、旅の中身が毎日変わります。
              </p>
            </div>
          </Fold>
        </div>
        <Link className="tile" href="/nordic/guide">
          <span className="tile-mark">
            <Icon name="book" size={26} />
          </span>
          <span className="tile-text">
            <b>旅のしおり</b>
            <i>
              お金・通信・服・サウナ・食べもの{NORDIC_GUIDE.food.length}品・おみやげ
              {NORDIC_GUIDE.souvenir.length}品。10のコーナー
            </i>
          </span>
          <Icon name="right" size={16} className="tile-go" />
        </Link>
      </Panel>

      {/* 言う。**旅のよていには混ぜない。**
          押すだけで答えられるものを上に、書くところを下に置く。 */}
      <section className="panel paper" id="say">
        <h2>この旅に、言う</h2>
        <p className="muted">
          行き先も、やることも、まだ決まっていないところがあります。行く前に全部読みます。
        </p>
        <Asks items={asks} />
        <h3 className="nsub">やってほしいことを書く</h3>
        <CountryIdeas
          bare
          country="北欧旅"
          note="ルートへの口出しも、やってほしい企画も、乗せてくれそうな知り合いの話も。"
          placeholder="例）ヒッチハイクで拾ってくれた人に、その国のごはんを教えてもらう企画にしてほしい"
        />
      </section>

      {/* 応援。**いちばん最後に、これだけで。**
          旅は集まっても集まらなくても行く。ヒッチハイクは元々ただだし、
          飛行機はもう取ってある。だから「集まらないと行けません」とは書かない。 */}
      <section className="panel paper" id="back">
        <h2>応援する</h2>
        <p className="muted">
          出さなくても旅は行きます。飛行機はもう取ってあるし、乗せてもらうぶんはただです。お金が要るのは船と、泊まるところだけです。
        </p>
        <Support />
        <ul className="nback-what">
          {FARES.map((f) => (
            <li key={f.what}>
              <b>{f.what}</b>
              <i>{f.src}</i>
            </li>
          ))}
        </ul>
        <a className="carry-go" href={doneru.href} target="_blank" rel="noopener noreferrer">
          投げ銭で応援する（Doneru）
          <Icon name="external" size={14} />
        </a>
      </section>
    </PageShell>
  );
}
