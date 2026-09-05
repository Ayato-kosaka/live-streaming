import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/ui/PageShell";
import { Panel } from "@/components/ui/Bits";
import Icon from "@/components/ui/Icon";
import Fold from "@/components/ui/Fold";
import TripNow, { type Stop } from "@/components/nordic/TripNow";
import RouteMapSvg from "@/components/nordic/RouteMapSvg";
import Days from "@/components/nordic/Days";
import Support from "@/components/nordic/Support";
import MapLegend from "@/components/nordic/MapLegend";
import CountryIdeas from "@/components/nordic/CountryIdeas";
import Countries from "@/components/nordic/Countries";
import TripPhotos from "@/components/nordic/TripPhotos";
import {
  DAY_OF,
  DEPART,
  FARES,
  HITCH_KM,
  MAIN,
  NORDIC_COUNTRIES,
  NORDIC_GUIDE,
  ROUTE,
  WHY,
  nordicCountry,
} from "@/content/nordic";
import MAP from "@/content/nordic/map.json";
import { LINKS } from "@/content/site";

export const metadata: Metadata = {
  title: "スウェーデンまでヒッチハイクで",
  description:
    "スウェーデンに、会いたい人がいます。スウェーデン行きの飛行機が高いので、安いポーランド行きで飛んで、そこから1,541kmを人の車で北上します。2026年9月11日出発。旅のよてい、ルート地図、国ごとの見どころ、旅のしおり。",
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
 *   2. **なぜ行くのか**      … 会いたい人のことと、なぜ歩くのか（WHY）
 *   3. どこを通るのか        … 地図
 *   4. 何をするのか          … **旅のよてい。1日1行。押すとその日のページへ**（Days）
 *   5. どこへ行けばもっと見られるか … 通る6カ国 → 国のページ
 *   6. この旅に、言う        … やってほしいことを書く。**押して答えるわかれ道は
 *                              その日のページへ移した**（オーナーの指示）
 *   7. 応援する              … 投げ銭。**いちばん最後に、これだけで**
 *
 * **2 が長いあいだ無かった。** 面には「ヒッチハイクで行く」としか書いておらず、
 * なぜ行くのかも、なぜ歩くのかも、どこにも書いていなかった。
 * オーナーの指摘で足したのがここ。**地図より先に置く。**
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

  // 区間の id → 旅程表のどの行か。上の司令塔が「今日のところへ」で使う。
  // 何日目か分かっていない行もあるので、数字ではなく行の名前で持つ。
  const dayOf: Record<string, string> = Object.fromEntries(
    Object.entries(DAY_OF).map(([id, d]) => [id, d.id]),
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

      {/* なぜこの旅が起きるのか。**地図より先。**
          ここが無いあいだ、面には「ヒッチハイクで行く」としか書いていなかった。
          会いたい人がいることも、スウェーデン行きの飛行機が高いから
          ポーランドから歩くことも、どこにも書いていなかった。

          **箇条書きにしない。** 出会って、帰ってしまって、何度も近くまで来て、
          呼んでもらえた、という順に読めることに意味がある。
          相手の名前も素性も出さない（`docs/nordic-fund.md` 1章・GitHub #106）。
          出していいと分かったら `FRIEND.name` に入れるだけで、文は変えなくていい。

          **1段目だけ出して、残りは畳んだ。** 開いたまま4段並べると 531px あって、
          この面の主役であるルート地図が 1,315px 下＝1.6画面目に押し出されていた
          （`docs/island-ux.md` 5.11「地図とカウントダウン以外は畳む」）。
          **順番は変えていない。** 理由は地図より先のまま。
          いちばん短い理由（「スウェーデンに、会いたい人がいます。ポーランドから
          そこまで、人の車だけで 1,541km」）は h1 のすぐ下にいつも出ているので、
          畳んでも「なぜ行くのか」が画面から消えることはない。 */}
      <section className="panel paper" id="why">
        <h2>会いに行く理由</h2>
        <div className="nwhy">
          <p>{WHY[0]}</p>
        </div>
        <div className="folds">
          <Fold
            title="そのあと、どうなったか"
            lead="帰ってしまった人から「会いに来てよ」。飛行機が高いので、ポーランドから北へ"
          >
            <div className="nwhy">
              {WHY.slice(1).map((t, i) => (
                <p key={i}>{t}</p>
              ))}
            </div>
          </Fold>
        </div>
      </section>

      {/* 地図。このページの主役なので、いちばん上に、いちばん大きく。
          面は紙（`docs/island-world.md` 2章）。`Panel` は id を取らないので、
          ここは class を直に書く。 */}
      <section className="panel paper is-map" id="map">
        <h2>会いに行く道</h2>
        {/* 地図の上の街は、紙の上では押せない（390px だと的が 28px 角にしかならない。
            `components/atlas/MapZoom.tsx`）。押せるのは「大きく見る」と、下の6カ国。 */}
        <p className="muted">大きく見ると、街を押してその国のページへ行けます。</p>
        <RouteMapSvg />
        {/* 句点のうしろで改行しない。JSX が改行と字下げを半角空白1つに畳むので、
            和文の途中に空きが1つ入る（書き出した HTML の画素で拾った）。 */}
        {/* 「いちばん上のストックホルムが終点。そこまでの線は、ぜんぶ誰かの車と船です」
            を書いていた。**すぐ上の説明が同じことを言っている**（飛行機はポーランドまで、
            そこから先は人の車）。地図の下でもう一度言わない。 */}
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

      {/* 旅のよてい。**1日1行だけ。中身は `/nordic/day/[n]` にある。**
          9日ぶんの区間・注記・国境・わかれ道をここに全部並べていたころ、
          旅程表だけで 1,764px、面ぜんぶの3割近くを使っていた。
          「1日1日はシンプルにしながら、押せば詳しく見るページに入れる」
          というオーナーの言い方に合わせて、行は押す前に知りたいことで止める。 */}
      <section className="panel paper" id="plan">
        <h2>旅のよてい</h2>
        {/* 句点のうしろで改行しない。JSX が改行と字下げを半角空白1つに畳む。 */}
        <p className="muted">1日押すと、その日だけのページに入れます。</p>
        <Days />
        {/* その日の写真（`docs/nordic-photos.md`）。**貼られたときだけ出る1行。**
            写真そのものは `/nordic/photos` にある。旅は10日で1日に何枚でも
            貼るので、旅程表の中に並べると旅程表が写真置き場になる。 */}
        <TripPhotos />
      </section>

      {/* ここから先へ出ていく区画。国のページと、旅のしおりと、企画の説明。
          紙を2枚に分けていたが、どちらも「もっと見たい人が押すもの」なので1枚にする。 */}
      <Panel>
        <h2>通る6カ国</h2>
        {/* **畳んである。** 写真6枚で 505px あって、面の1割をここが使っていた。
            この面でいちばん読んでほしいのは、なぜ行くのかと、何日目にどこへ行くか。
            国ごとの見どころ161件は、読みたい人が開けば全部ある。 */}
        <div className="folds">
          <Fold
            title="国ごとの見どころ"
            lead={`ポーランド / リトアニア / ラトビア / エストニア / フィンランド / スウェーデン。${NORDIC_COUNTRIES.reduce((a, c) => a + c.spots, 0)}件`}
          >
            <Countries />
          </Fold>
        </div>
        {/* 「どうしてバスに乗らないのか」の畳みがここにあった。
            答え（スウェーデン行きの飛行機が高い）は面のいちばん上に移したので、
            同じ話を2か所でしない。 */}
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

      {/* 言う。**旅のよていには混ぜない。** */}
      <section className="panel paper" id="say">
        <h2>この旅に、言う</h2>
        {/* 押すだけで答えられるわかれ道は、**その日のページの中へ移した**
            （オーナーの指示）。ここに5つ並べていたころは、問いごとに
            「何日目の、どこからどこへ」を1行足さないと通じなかった。
            その日の面の中なら、面ぜんぶが「どこの話か」を言っている。
            **入口が消えないように、旅程表の行に「答えられることが◯つ」と出す。** */}
        <p className="muted">
          行く前に、全部読みます。日ごとのわかれ道は、その日のページの中にあります。
        </p>
        <CountryIdeas
          bare
          foldWrite
          country="北欧旅"
          note="ルートへの口出しも、やってほしい企画も、知り合いの話も。"
          placeholder="例）ヒッチハイクで拾ってくれた人に、その国のごはんを教えてもらう企画にしてほしい"
        />
      </section>

      {/* 応援。**いちばん最後に、これだけで。**
          旅は集まっても集まらなくても行く。ヒッチハイクは元々ただだし、
          飛行機はもう取ってある。だから「集まらないと行けません」とは書かない。 */}
      <section className="panel paper" id="back">
        <h2>応援する</h2>
        <p className="muted">
          出さなくても旅は行きます。乗せてもらうぶんはただで、お金が要るのは船と泊まるところだけです。
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
