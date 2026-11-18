import Link from "next/link";
import { Panel } from "@/components/ui/Bits";
import Fold from "@/components/ui/Fold";
import Icon from "@/components/ui/Icon";
import CityMap, { cityKeys, type SpotKey } from "@/components/nordic/CityMap";
import FarMark from "@/components/nordic/FarMark";
import Notes from "@/components/live/Notes";
import RouteMapSvg from "@/components/nordic/RouteMapSvg";
import Strong from "@/components/nordic/Strong";
import Shops from "@/components/nordic/Shops";
import { Mark } from "@/components/nordic/Marks";
import MAP from "@/content/nordic/map.json";
import {
  ROUTE,
  loadSpots,
  nordicCountry,
  splitSpots,
  visitCitiesOf,
  type NordicSpot,
  type SpotCity,
} from "@/content/nordic";
import { tripPageOf } from "@/content/trip";

/*
 * 北欧の国の「行く前に調べたこと」。国の面（`app/travel/[slug]/page.tsx`）の、
 * 歩いた記録の下に並ぶ。
 *
 * 2026-11-13 まではこれが1枚の面（`/nordic/<国>`）だった。同じ国の歩いた記録
 * （`/map/<国>`）とは互いにリンクが無く、見出しも同じ国名で、2枚に割れていた（#1201）。
 * 寄せるときに**中身は作り直していない**——面の頭（見出し・題・一文・パンくず）を
 * 歩いた記録のほうへ渡し、見出しの下にあった印（何カ国目・通貨・時差・いい時期）と
 * 写真を、この節の頭へ移しただけ。前の道は `firebase.json` が 301 で国の面へ送る。
 */

/**
 * 見どころの4つの種類。**この順・この言い方で出す。**
 *
 * あやとの言葉（2026-09-09）:
 *
 * > 見たい、食べたい、やりたい、買いたい みたいにわかると良いかも。
 *
 * データの `cat`（see / eat / do / buy）はもともとこの4つに分かれている。
 * これまでは1件ずつの頭に小さな札で出していただけで、街の中がどう分かれて
 * いるのかは、20件を上から読まないと分からなかった。**まとまりの見出しにする。**
 */
const CATS: { key: string; label: string }[] = [
  { key: "see", label: "見たい" },
  { key: "eat", label: "食べたい" },
  { key: "do", label: "やりたい" },
  { key: "buy", label: "買いたい" },
];

const MOVE: Record<string, string> = { hitch: "ヒッチハイク", ferry: "フェリー", fly: "飛行機", walk: "歩き" };

/**
 * 見どころ1件。
 *
 * 閉じているときは、写真・題名・「ここが面白い」の一行だけ。
 * 本文まで並べると1国で数千字になって、探すのがつらくなる。
 *
 * 閉じたままでも写真を出すのは、20段ならんだときに1段ずつ違って見えるのが
 * いちばん効くから。字だけの段が20並ぶと、目が滑って何も残らない。
 *
 * 種類の札は持たない。4つの見出しの下に並んでいるので、行の頭にもう一度
 * 「見る」と書いても、同じ言葉が縦に10個ならぶだけになる。
 *
 * ## 地図の番号は、この段が持つ
 *
 * 街の地図の下には前まで、番号つきの札が種類ごとに並んでいた。その真下に
 * この段が同じ見どころを並べるので、**同じものが上下で2回**出ていた。
 * 番号は写真の角に付けて、札のほうをやめた（`CityMap` の `cityKeys`）。
 *
 * ここの番号は**押せない。** この行そのものが押すと開く畳みなので、中に
 * もう1つ押しどころを入れると、押した先が2つになる。だから厚みも付けない
 * （`island-design.md` 3章3）。番号を押して点を光らせられるのは日ページ。
 *
 * ## 同じ写真を、2つの大きさで取りに行かない
 *
 * 段の頭は 52px 角なので、ふだんは `thumb`（幅 250）で足りる。
 * ただし**表紙に使った1枚だけは別**で、そちらはもう幅 960 で落ちている。
 * 小さい版をあらためて頼むと、同じ絵を2回ぶん払うことになるので、
 * 落ちているほうをそのまま使う（`thumb` で渡す）。
 */
function Spot({ s, k, thumb }: { s: NordicSpot; k?: SpotKey; thumb?: string }) {
  return (
    <Fold
      title={
        <span className="nspot-h">
          {(s.img || k?.n != null || k?.far) && (
            <span className="nspot-fig">
              {s.img ? (
                <img className="nspot-th" src={thumb ?? s.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" />
              ) : (
                <span className="nspot-th" aria-hidden="true" />
              )}
              {k?.n != null && <b className={`nspot-n cm-${k.cat}`}>{k.n}</b>}
              {k?.far && <FarMark deg={k.far.deg} className={`nspot-ar cm-${k.cat}`} />}
            </span>
          )}
          <span className="nspot-hb">
            <span className="nspot-name">{s.title}</span>
            {/* 地図の窓に入らなかったもの。**消さずに、どっちへどれだけかを言う** */}
            {k?.far && (
              <em className="nspot-out">
                街の中心から{k.far.dir}へ{k.far.km}km
              </em>
            )}
          </span>
        </span>
      }
      lead={s.point || s.local}
      note={s.budget || undefined}
    >
      {s.img && (
        <a className="nspot-img" href={s.cm || s.big} target="_blank" rel="noopener noreferrer">
          <img src={s.big || s.img} alt={s.title} loading="lazy" referrerPolicy="no-referrer" />
          <span className="nspot-credit">
            Wikimedia Commons
            <Icon name="external" size={11} />
          </span>
        </a>
      )}
      {s.local && <p className="nspot-local">{s.local}</p>}
      <p className="nspot-text">{s.body}</p>
      {s.tips?.length > 0 && (
        <ul className="nspot-tips">
          {s.tips.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      )}
      <dl className="nspot-meta">
        {s.budget && (
          <div>
            <dt>お金</dt>
            <dd>{s.budget}</dd>
          </div>
        )}
        {s.time && (
          <div>
            <dt>時間</dt>
            <dd>{s.time}</dd>
          </div>
        )}
        {s.season && (
          <div>
            <dt>時期</dt>
            <dd>{s.season}</dd>
          </div>
        )}
      </dl>
      {s.info && <p className="nspot-info">{s.info}</p>}
      {s.tags?.length > 0 && (
        <p className="nspot-tags">
          {s.tags.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </p>
      )}
    </Fold>
  );
}

/**
 * 1つの街の中を、見たい・食べたい・やりたい・買いたいで分けて並べる。
 *
 * **4つに入らないものを押し込まない。** いまのデータは全部この4つだが、
 * 増えたときに黙って消えるほうが悪いので、余りは最後に「そのほか」で出す。
 */
function Cats({ list, keys, hero }: { list: NordicSpot[]; keys?: Record<string, SpotKey>; hero?: string }) {
  const groups = CATS.map((c) => ({ label: c.label, list: list.filter((s) => s.cat === c.key) }));
  const rest = list.filter((s) => !CATS.some((c) => c.key === s.cat));
  if (rest.length > 0) groups.push({ label: "そのほか", list: rest });
  return (
    <>
      {groups
        .filter((g) => g.list.length > 0)
        .map((g) => (
          <div key={g.label} className="ncat">
            {/* 上は h2（`<Zone>` の見出し）。h4 にすると読み上げの目次で
                段が1つ飛ぶので h3（`docs/island-misses.md` #253） */}
            <h3>
              {g.label}
              <em>{g.list.length}件</em>
            </h3>
            <div className="folds">
              {g.list.map((s) => (
                <Spot key={s.id} s={s} k={keys?.[s.id]} thumb={s.big && s.big === hero ? s.big : undefined} />
              ))}
            </div>
          </div>
        ))}
    </>
  );
}

/** 街の畳み。行かない街と、寄るかもしれない街はこの形で置く。 */
function CityFold({ city, list, hero }: SpotCity & { hero?: string }) {
  return (
    <section className="gchap ncity" id={`city-${encodeURIComponent(city)}`}>
      <Fold title={<span className="gchap-h">{city}</span>} lead={list[0]?.title} note={`${list.length}件`}>
        <Cats list={list} hero={hero} />
      </Fold>
    </section>
  );
}

/** 入る道・出る道。区間ごとの絵を添えて、どんな一日になるかまで見せる。 */
function Way({ kind, leg }: { kind: string; leg: NonNullable<(typeof ROUTE)[number]> }) {
  return (
    <div className="ncway">
      {leg.art && <Mark art={leg.art} size={46} className="ncway-art" />}
      <span className="ncway-b">
        <i>{kind}</i>
        <b>
          {leg.from} <span aria-hidden>→</span> {leg.to}
        </b>
        <em>
          {MOVE[leg.move]}
          {leg.km ? ` ${leg.km.toLocaleString()}km` : ""}
          {leg.time ? ` / ${leg.time}` : ""}
        </em>
        {leg.fixed && <span className="ncway-fix">{leg.fixed}</span>}
      </span>
    </div>
  );
}

/** 節の見出しの id。島の中から「行く前に調べたこと」を指すときの錨 */
export const GUIDE_ID = "before";

export default async function CountryGuide({ slug }: { slug: string }) {
  const c = nordicCountry(slug);
  if (!c) return null;
  const country = c.slug;
  const trip = tripPageOf("nordic");
  const spots = await loadSpots(country);

  /* 行く街・寄るかもしれない街・行かない街。**分け方の出どころは旅程だけ**
     （`content/nordic.ts` の `splitSpots`）。ここに街の名前を書かない。 */
  const { go, maybe, skip, nation } = splitSpots(spots);
  const goSpots = go.reduce((n, g) => n + g.list.length, 0) + nation.length;
  const skipSpots = skip.reduce((n, g) => n + g.list.length, 0);

  // その国の顔になる写真。最初の見どころのものを使う。
  const hero = spots.find((s) => s.big) ?? spots[0];
  // 表紙に出す1枚の URL。**この絵を持っている段は、小さい版を頼まない**
  // （同じ写真を2つの大きさで取りに行かないため。`Spot` の覚え書き）。
  const heroSrc = hero?.big;

  // この国に入る区間と、この国から出る区間。「入って、出る」の形で見せると、
  // ルート全体のどこに挟まっている国なのかが1目で分かる。
  const inAt = ROUTE.findIndex((l) => l.enters === c.slug);
  const arrive = inAt >= 0 ? ROUTE[inAt] : undefined;
  const leave = ROUTE.slice(inAt + 1).find((l) => l.enters && l.enters !== c.slug);
  // 地図で光らせる街。この国で最初に降りるところ。
  const firstCity = MAP.cities.find((m) => m.country === c.slug)?.id;

  return (
    <section aria-labelledby={GUIDE_ID}>
      {/* 節の頭。前は面の見出し（`PageHead`）だった。見出しの字は国の面の h1 が持つので、
          ここは節の名前と、見出しの下にあった1行と印だけ */}
      <Panel>
        <h2 id={GUIDE_ID}>行く前に調べたこと</h2>
        <p className="muted">{c.catch}</p>
        <div className="phead-meta">
          {/* 前はパンくず（島 › 企画 › 北欧ヒッチハイク › 国）が旅の面へ戻る口だった。
              パンくずは歩いた国の形になったので、口はここへ移す。
              「何カ国目」も、上のスタンプ（歩いた国の通し番号）と別の数なので旅の名前を添える */}
          <span>
            {trip ? (
              <Link prefetch={false} className="phead-go" href={trip}>
                北欧ヒッチハイク
              </Link>
            ) : (
              "北欧ヒッチハイク"
            )}
            の{c.leg}カ国目
          </span>
          <span>{c.cur}</span>
          <span>日本との時差 {c.tz}</span>
          <span>いい時期 {c.best}</span>
        </div>
      </Panel>
      {hero?.big && (
        <div className="nchero is-plate">
          <img src={hero.big} alt="" loading="lazy" referrerPolicy="no-referrer" />
          <span className="nchero-credit">{hero.title} — Wikimedia Commons</span>
        </div>
      )}

      <section className="panel paper is-map">
        <h2>どこで入って、どこから出るのか</h2>
        <RouteMapSvg here={firstCity} />
        <div className="ncways">
          {arrive && <Way kind="入る" leg={arrive} />}
          {leave && <Way kind="出る" leg={leave} />}
        </div>
        {arrive?.note && (
          <p className="ncway-note">
            <Strong t={arrive.note} />
          </p>
        )}
      </section>

      {/* 行く街。**畳まない。この面でいちばん伝えたいのがここ。**
          （`island-design.md` 4章「開いた状態を初期値にしていいのは1つだけ」）

          ここは長いあいだ「国の見どころ全部を、街ごとに畳んだもの」だった。
          スウェーデンは「35件を15の街に分けています」と言いながら、
          あやとが降りるのはストックホルムだけで、上から3つ目に出てくる
          ヨーテボリも、キルナも、行かない街だった。**見出しが嘘をついていた。** */}
      {(go.length > 0 || nation.length > 0) && (
        <Panel>
          <h2>{c.name}で行くところ</h2>
          <p className="muted">
            {go.length === 1
              ? `行くのは${go[0].city}だけ。`
              : `行くのは${go.map((g) => g.city).join("・")}の${go.length}つ。`}
            {goSpots}件を、見たい・食べたい・やりたい・買いたいで分けました。
          </p>
          {go.map((g) => (
            <section key={g.city} className="ncgo" id={`city-${encodeURIComponent(g.city)}`}>
              <h3>{g.city}</h3>
              {/* 街の地図。**降りる街には必ず出す。** 日ページは「その日に着く街」
                  しか出さないので、出発の街（カトヴィツェ）はどこにも出ていなかった */}
              <CityMap city={g.city} />
              {/* 地図の下に番号の札を並べない。番号はこの段の行が持っている */}
              <Cats list={g.list} keys={cityKeys(g.city)} hero={heroSrc} />
            </section>
          ))}
          {/* 街に紐づかないもの（郷土料理など）。降りる街の下に置く。 */}
          {nation.length > 0 && (
            <section className="ncgo">
              <h3>{c.name}のどこでも</h3>
              <Cats list={nation} hero={heroSrc} />
            </section>
          )}
        </Panel>
      )}

      {/* その国で降りる街の、おみやげと雑貨。**街ごとに1枚。**

          日ごとの面（`/nordic/day/[n]`）にも同じものが出るが、あちらは
          「その日に着く街」しか持たない。**国から入ってきた人**——これから
          行く国を眺めている人や、配信で振り返る人——は日を知らないので、
          ここに無いと一生たどり着けない。

          街の名前は旅程から出す（`visitCitiesOf`）。見どころの有無では絞らない。
          ガイドに1件も無い街（カトヴィツェ）にも、お店はある。 */}
      {visitCitiesOf(c.slug).map((city) => (
        <Shops key={city} city={city} fold />
      ))}

      {/* 寄るかもしれない街。通り道にあって、まだ決まっていない
          （`content/nordic.ts` の `maybe`）。行く街と同じ高さで開いていると、
          寄ると決まっているように読める。 */}
      {maybe.length > 0 && (
        <Panel>
          <h2>寄るかもしれないところ</h2>
          <p className="muted">通り道にあるところ。寄るかどうかは、これから決まります。</p>
          {maybe.map((g) => (
            <CityFold key={g.city} {...g} hero={heroSrc} />
          ))}
        </Panel>
      )}

      {/* 行かない街。**消さない。** あやとの言葉（2026-09-09）
          「行く予定はないけどこんなところもある。みたいな説明なら良い」。
          街の名前は開いたまま見せて、中身だけ畳む。何があるのかが
          名前で分かるところまでが、この区画の用事。 */}
      {skip.length > 0 && (
        <Panel>
          <h2>行く予定はないけど、こんなところもある</h2>
          {/* 「街」と言い切らない。ラップランドや湖水地方のような、街ではない
              ひとまとまりも混じっている。 */}
          <p className="muted">
            今回のルートからは外れる{skip.length}か所。{skipSpots}件。
          </p>
          {skip.map((g) => (
            <CityFold key={g.city} {...g} hero={heroSrc} />
          ))}
        </Panel>
      )}

      {/* その国あての付箋。**宛先はもう決まっている**ので、テーマを選ばせない。
          テーマの id は国の slug と同じ（`content/themes.ts`）。 */}
      <Notes theme={c.slug} title={`${c.name}でこれやって`} />

    </section>
  );
}
