import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/ui/PageShell";
import { Panel } from "@/components/ui/Bits";
import Icon from "@/components/ui/Icon";
import Fold from "@/components/ui/Fold";
import TripNow, { type Stop } from "@/components/nordic/TripNow";
import RouteMapSvg from "@/components/nordic/RouteMapSvg";
import RouteLegs from "@/components/nordic/RouteLegs";
import { CarriedBy, MapSync } from "@/components/nordic/Carry";
import MapLegend from "@/components/nordic/MapLegend";
import CountryIdeas from "@/components/nordic/CountryIdeas";
import Countries from "@/components/nordic/Countries";
import {
  DEPART,
  HITCH_KM,
  MAIN,
  NORDIC_GUIDE,
  FARE_POUR,
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
 * **この面は、毎晩の配信で「見てね」と言われる面になる。** だから並びは
 * 「読み物として面白い順」ではなく、**開いた人が次にする動作の順**にしてある。
 *
 *   1. いま何が起きているか  … あと何日／いまどこ／つぎどこ（TripNow）
 *   2. どこを通るのか        … 地図
 *   3. 自分に何ができるか    … 区間ボード。道しるべを書く・足代を出す
 *   4. どこへ行けばもっと見られるか … 通る6カ国 → 国のページ
 *   5. もっと知りたい人だけが開くもの … なぜバスに乗らないのか／総論の意見
 *
 * **3 を 5 より先に置いてある。** 企画の説明（どうしてバスに乗らないのか）を
 * 参加のしかたより前に置くと、読み終わる前に離脱した人は何もできない。
 * 説明は開きたい人が開く。参加は開かなくてもできるところに置く。
 *
 * 縦は 8,098px（9.6画面）あった。`docs/island-ux.md` 8.1 の目安は
 * 「入口の面は3画面まで」。畳んだのではなく、**同じものを2回出すのをやめた**のが
 * いちばん効いている（一本道の帯／見どころと6カ国／出発前の残りkm）。
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
        mainLegs={MAIN.map((l) => l.id)}
        legOrder={ROUTE.map((l) => l.id)}
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
        {/* 地図と、下の区間ボードを同じものとして見せる（docs/nordic-fund.md 提案3）。
            見た目を持たない。区間の状態を地図の線に写すだけ。
            `content/nordic` はここで開いて、必要な数字だけ渡す。
            クライアント側で読むと、見どころ161件ぶんの JSON が丸ごと落ちてくる。 */}
        <MapSync
          legs={ROUTE.map((l) => ({
            id: l.id,
            needsFare: !!l.fare,
            cost: l.fare?.yen,
            before: FARE_POUR[l.id].before,
            reach: FARE_POUR[l.id].reach,
          }))}
        />
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
            lead="ヒッチハイク・フェリー・寄り道・飛行機・国境・つながった区間"
          >
            <MapLegend />
          </Fold>
        </div>
      </section>

      {/* 連れていくボード。新しいセクションを作らず、区間カードに席を2つ置いてある
          （`docs/nordic-fund.md` 提案1）。旅は集まらなくても行くので、
          「届かないと行けません」とは書かない。

          **企画の説明より前に置く。** ここが、開いた人がその場でできることの全部。 */}
      <section className="panel paper" id="carry">
        <h2>この10日を、連れていく</h2>
        {/* 席の決まりを、ここで全部説明していた（4行）。同じことを、
            区間カードの読み上げ（`Carry.tsx` の `Tie`）が10枚ぜんぶで
            **いまの状態として**言っている。決まりの説明は1回、短く。 */}
        {/* 句点のうしろで改行しない。JSX が改行と字下げを半角空白1つに畳むので、
            和文の途中に空きが1つ入る（「つながります。 まだ」と出ていた）。 */}
        <p className="muted">
          区間を押すと、<b>道しるべ</b>と<b>足代</b>の席が出てきます。両方そろって、区間はつながります。まだ決めていないことは<b>わかれ道</b>にしてあるので、押すだけで答えられます。
        </p>
        <CarriedBy />
        <RouteLegs />
        <div className="carry-give">
          <p>
            足代は、通る順に上から入ります。どの区間に入るかは、こちらでは決めません。集まらなかったぶんは、あやとが自分で出して越えます。
            <b>旅は止まりません。</b>
          </p>
          <a className="carry-go" href={doneru.href} target="_blank" rel="noopener noreferrer">
            足代を出す（Doneru）
            <Icon name="external" size={14} />
          </a>
        </div>
      </section>

      {/* 通る6カ国。**この面から国のページへ出ていく入口は、ここ1つだけ。**
          以前はこのすぐ上に「いちばん見たいもの」の写真8枚があって、
          押した先はどちらも同じ国のページだった（`Countries.tsx`）。 */}
      <Panel>
        <h2>通る6カ国</h2>
        <p className="muted">
          写真は、その国でいちばん見たいもの。押すと、その国の見どころが全部出ます。
        </p>
        <Countries />
      </Panel>

      {/* ここから下は、開きたい人だけが開くもの。 */}
      <Panel>
        <h2>もっと知りたい人へ</h2>
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
          {/* 北欧旅ぜんぶへの意見。区間ごとの道しるべが上にあるので、
              ここは「どの区間にも紐づかない話」の行き先。畳んでおく。 */}
          <Fold
            title="この旅ぜんぶに、言いたいこと"
            lead="区間に紐づかない話は、ここへ。ルートへの口出しも、知り合いの話も"
          >
            <div id="voices">
              <CountryIdeas
                bare
                country="北欧旅"
                note="区間ごとの話は、上の道しるべへ。ここは、どの区間にも紐づかない話の行き先です。ルートへの口出しも、やってほしい企画も、乗せてくれそうな知り合いの話も。行く前に全部読みます。"
                placeholder="例）ヒッチハイクで拾ってくれた人に、その国のごはんを教えてもらう企画にしてほしい"
              />
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
    </PageShell>
  );
}
