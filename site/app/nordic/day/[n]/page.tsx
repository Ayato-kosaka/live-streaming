import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import Icon from "@/components/ui/Icon";
import Flag from "@/components/ui/Flag";
import { Mark } from "@/components/nordic/Marks";
import DaySay, { type SayItem } from "@/components/nordic/DaySay";
import {
  DAY_PAGES,
  NORDIC_GUIDE,
  NORDIC_LOG,
  ROUTE,
  SUN,
  cityCountry,
  cityName,
  dayBySlug,
  dayHref,
  dayName,
  loadSpots,
  nordicCountry,
  type Leg,
  type NordicSpot,
} from "@/content/nordic";

/**
 * 1日ぶんのページ。**この企画でいちばん詳しく読めるところ。**
 *
 * オーナーの言葉:
 *
 * > 旅の予定の部分はもっともっと1日1日どんなふうになるのかっていうのを詳しく見たい
 *
 * だから、行き先と距離を並べるだけにしない。**その日を過ごすことになる人が
 * 知りたい順**に置く。
 *
 *   1. どんな日か         … 一行と、その日の絵
 *   2. どこを、どうやって  … 区間ごとに。切符から決まっていることも
 *   3. **明るいうち**      … ヒッチハイクは日のあるあいだしかできない。
 *                            距離より先に、その日の長さが決まっている
 *   4. 決まっていないこと  … 日にち・着く時刻。**埋めない**
 *   5. この日に、言う      … わかれ道（オーナーの指示でここへ移した）
 *   6. その日に通る街      … 見どころ。国のページに全部ある
 *   7. 越える国境と、言葉  … 国が変わる日だけ
 *   8. その日に起きたこと  … 越えてから入る
 *
 * **書いていいのは、事実だけ。** `content/nordic.ts` の区間と、
 * `content/nordic/*.json`（あやとの用意したガイドから作った見どころ）に
 * 書いてあることだけを出す。ここで新しい予定を作らない。
 * 分からないことは「分からない」と書く。
 */

export function generateStaticParams() {
  return DAY_PAGES.map((d) => ({ n: d.id.replace(/^day-/, "") }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ n: string }>;
}): Promise<Metadata> {
  const { n } = await params;
  const day = dayBySlug(n);
  if (!day) return {};
  const legs = day.legs ?? [];
  return {
    title: `${dayName(day)} ${cityName(legs[0].from)}から${cityName(legs[legs.length - 1].to)} — 北欧ヒッチハイク`,
    description: day.lead,
  };
}

const MOVE: Record<Leg["move"], string> = {
  fly: "飛行機",
  hitch: "ヒッチハイク",
  ferry: "フェリー",
  walk: "歩き",
};

const CAT: Record<string, string> = { see: "見る", do: "やる", eat: "食べる", buy: "買う" };

/** 「2026-09-11」→「9月11日(金)」。書き出しは UTC で走るので、月日は文字列から取る。 */
function when(iso: string) {
  const w = "日月火水木金土"[new Date(`${iso}T00:00:00Z`).getUTCDay()];
  return `${Number(iso.slice(5, 7))}月${Number(iso.slice(8, 10))}日(${w})`;
}

/** 「6:20」と「19:00」から「12時間40分」。出す数字どうしが必ず合うように、表示から計算する。 */
function daylight(rise: string, set: string) {
  const m = (t: string) => Number(t.split(":")[0]) * 60 + Number(t.split(":")[1]);
  const d = m(set) - m(rise);
  return `${Math.floor(d / 60)}時間${String(d % 60).padStart(2, "0")}分`;
}

/** その日いる街。日の出を出すのは、朝そこに立つ場所。分からなければ着く先。 */
function sunCity(legs: Leg[]) {
  const from = cityName(legs[0].from);
  if (SUN[from]) return from;
  return legs.map((l) => cityName(l.to)).find((c) => SUN[c]);
}

/** 見どころ1件。**開かない。** 全部は国のページにあるので、ここは名前と一行だけ。 */
function SpotRow({ s }: { s: NordicSpot }) {
  return (
    <li className="ndsp">
      {s.img && (
        <img className="ndsp-th" src={s.img} alt="" loading="lazy" referrerPolicy="no-referrer" />
      )}
      <span className="ndsp-b">
        <span className="ndsp-h">
          <span className="ndsp-cat">{CAT[s.cat] ?? "見る"}</span>
          <b>{s.title}</b>
        </span>
        {s.point && <i>{s.point}</i>}
      </span>
    </li>
  );
}

export default async function NordicDayPage({ params }: { params: Promise<{ n: string }> }) {
  const { n } = await params;
  const day = dayBySlug(n);
  if (!day) notFound();
  const legs = day.legs ?? [];

  const i = DAY_PAGES.indexOf(day);
  const prev = DAY_PAGES[i - 1];
  const next = DAY_PAGES[i + 1];

  const km = legs.reduce((a, l) => a + (l.km ?? 0), 0);
  const hitch = legs.some((l) => l.move === "hitch");
  const sc = sunCity(legs);
  const sun = sc ? SUN[sc] : undefined;

  // 通る街と、寄るかもしれない街。**分けて出す。**
  // 混ぜると、寄ると決まっていない街まで決まっているように読める。
  const sure = [...new Set(legs.map((l) => cityName(l.to)))];
  const maybe = [...new Set(legs.flatMap((l) => l.maybe ?? []))];
  const cities = [...sure, ...maybe];

  // 見どころは国ごとの JSON にある。その日に関わる国のぶんだけ読む。
  const slugs = [...new Set(cities.map((c) => cityCountry(c)?.slug).filter(Boolean))] as string[];
  const spots = (await Promise.all(slugs.map((s) => loadSpots(s)))).flat();
  const byCity = cities
    .map((city) => ({
      city,
      maybe: maybe.includes(city),
      country: cityCountry(city),
      list: spots.filter((s) => s.city === city),
    }))
    .filter((c) => c.list.length > 0);

  // 国が変わる区間。入る国のページと、その国の言葉へつなぐ。
  const enters = legs
    .map((l) => (l.enters ? nordicCountry(l.enters) : undefined))
    .filter(Boolean) as NonNullable<ReturnType<typeof nordicCountry>>[];
  const phrases = enters
    .map((c) => NORDIC_GUIDE.phrases.find((p) => p.country === c.name))
    .filter(Boolean) as (typeof NORDIC_GUIDE.phrases)[number][];

  const asks: SayItem[] = legs
    .filter((l) => l.fork)
    .map((l) => ({
      leg: l.id,
      seq: ROUTE.indexOf(l),
      way: `${cityName(l.from)} → ${cityName(l.to)}`,
      fork: l.fork!,
    }));

  const log = legs.map((l) => ({ leg: l, log: NORDIC_LOG[l.id] })).filter((x) => x.log);

  return (
    <PageShell
      current="next"
      crumbs={[
        { label: "これから", href: "/next" },
        { label: "北欧ヒッチハイク", href: "/nordic" },
        { label: dayName(day) },
      ]}
    >
      <PageHead
        title={dayName(day)}
        lead={day.lead}
        mark={<Mark art={legs[0].art} size={54} />}
        meta={
          <>
            {/* 日付が入るのは切符のある2日だけ。**残りを埋めない。**
                空けておくより、空けてある理由を書くほうが分かる。 */}
            <span>{day.date ? when(day.date) : "日にちは未定"}</span>
            {km > 0 && <span>{km.toLocaleString()}km</span>}
            {day.stay && <span>泊まる {cityName(day.stay)}</span>}
          </>
        }
      />

      {/* この日の道。区間ごとに、絵・距離・時間・決まっている時刻・その区間の話。 */}
      <section className="panel paper" id="road">
        <h2>この日の道</h2>
        {legs.map((l) => {
          const c = l.enters ? nordicCountry(l.enters) : undefined;
          return (
            <div key={l.id} className="nday-go" data-leg={l.id}>
              <Mark art={l.art} size={46} className="nday-art" />
              <div className="nday-txt">
                <p className="nday-way">
                  {l.from} <span aria-hidden>→</span> {l.to}
                  {l.side && <i>日帰りの寄り道</i>}
                </p>
                <p className="nday-how">
                  {MOVE[l.move]}
                  {l.km ? ` ${l.km.toLocaleString()}km` : ""}
                  {l.time ? ` / ${l.time}` : ""}
                  {c && (
                    <span className="nday-enter">
                      <Flag slug={c.slug} size={16} />
                      {c.name}へ
                    </span>
                  )}
                </p>
                {l.fixed && <p className="nday-fixed">{l.fixed}</p>}
                {l.note && <p className="nday-note">{l.note}</p>}
              </div>
            </div>
          );
        })}

        {/* 明るいうち。**この企画では、距離より先にここが1日の形を決めている。**
            親指を上げて立てるのは日のあるあいだだけで、9月のバルトは
            そこが13時間しかない。9月中旬の値を1つだけ持っている
            （日ごとに持つと、決まっていない日にちを埋めることになる）。 */}
        {sun && sc && (
          <div className="ndsun">
            <Icon name="sunrise" size={30} />
            {/* 仕切りの「／」を置かない。`--ink-3` で 3.43:1 しか出ず、
                測って落ちた（`tools/sprites/inkpx.py`）。字を1つ増やさずに、
                あいだの空きだけで2つに分ける。 */}
            <p className="ndsun-n">
              <span>
                <b>{sun.rise}</b> 明ける
              </span>
              <span>
                <b>{sun.set}</b> 暮れる
              </span>
            </p>
            <p className="ndsun-w">
              9月中旬の{sc}。明るいのは {daylight(sun.rise, sun.set)}
              {hitch ? "。親指を上げられるのは、そのあいだだけ" : ""}
            </p>
          </div>
        )}

        {/* まだ決まっていないこと。**空けてあることを、空けたまま書く。**
            埋めると、決まっている日まで「たぶんこうだろう」に見える
            （`content/nordic.ts` の `DAYS`）。 */}
        <ul className="ndunsure">
          {!day.date && <li>日にち。乗せてもらえた日でずれます</li>}
          {hitch && <li>何時に着くか。停まってくれる車しだいです</li>}
          {day.stay && <li>{cityName(day.stay)}のどこに泊まるか</li>}
        </ul>
      </section>

      {/* わかれ道。**この面に入ったときに出す**（オーナーの指示）。
          数が読めないときは、区画ごと出ない。 */}
      <DaySay items={asks} />

      {/* その日に通る街。**中身は国のページにある。**
          ここは「その日、目の前に何があるか」だけを名前と一行で並べて、
          全部読みたい人はその街の段へ送る。同じ本文を2か所に置かない。 */}
      {byCity.length > 0 && (
        <section className="panel paper" id="see">
          <h2>この日、通る街にあるもの</h2>
          {byCity.map((c) => (
            <div key={c.city} className="ndcity">
              <h3 className="nsub">
                {c.city}
                {c.maybe && <em className="ndcity-if">寄るかどうかは、これから決まります</em>}
              </h3>
              <ul className="ndsps">
                {/* 街が2つある日は1つあたりを減らす。**面が2〜3画面を超えないため**
                    （`docs/island-ux.md` 8.1）。全部はその街の段に置いてある。 */}
                {c.list.slice(0, byCity.length > 1 ? 4 : 5).map((s) => (
                  <SpotRow key={s.id} s={s} />
                ))}
              </ul>
              {c.country && (
                <Link
                  className="chip link"
                  href={`/nordic/${c.country.slug}#city-${encodeURIComponent(c.city)}`}
                >
                  {c.city}の{c.list.length}件を読む
                  <Icon name="right" size={14} />
                </Link>
              )}
            </div>
          ))}
        </section>
      )}

      {/* 国が変わる日だけ。入る国と、その日から使う言葉。
          ポーランドの言葉はガイドに無いので、その日はこの区画が出ない。 */}
      {enters.length > 0 && (
        <section className="panel paper" id="enter">
          <h2>この日、国が変わる</h2>
          {enters.map((c) => (
            <Link key={c.slug} className="tile" href={`/nordic/${c.slug}`}>
              <span className="tile-mark">
                <Flag slug={c.slug} size={26} />
              </span>
              <span className="tile-text">
                <b>{c.name}</b>
                <i>
                  {c.catch} 見どころ{c.spots}件
                </i>
              </span>
              <Icon name="right" size={16} className="tile-go" />
            </Link>
          ))}
          {phrases.map((p) => (
            <div key={p.lang} className="ndph">
              <h3 className="nsub">{p.lang}を、3つだけ</h3>
              <ul className="ndph-list">
                {p.items.slice(0, 3).map((w) => (
                  <li key={w.jp}>
                    <b>{w.local}</b>
                    <em>{w.yomi}</em>
                    <i>{w.jp}</i>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {/* 越えた日にだけ入る。よていだけの面は、出発前にしか読む理由がない。 */}
      {log.length > 0 && (
        <section className="panel paper" id="was">
          <h2>この日、何が起きたか</h2>
          {log.map(({ leg, log: g }) => (
            <div key={leg.id} className="nday-log">
              <p>{g!.body}</p>
              {g!.video && (
                <a
                  className="nday-vid"
                  href={`https://www.youtube.com/watch?v=${g!.video}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  その日の配信を見る
                  <Icon name="external" size={14} />
                </a>
              )}
            </div>
          ))}
        </section>
      )}

      {/* 前の日・次の日。旅は一本道なので、めくって読めるようにする。 */}
      <div className="nnav">
        {prev ? (
          <Link href={dayHref(prev)}>
            <Icon name="right" size={14} className="is-flip" />
            {dayName(prev)}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={dayHref(next)}>
            {dayName(next)}
            <Icon name="right" size={14} />
          </Link>
        ) : (
          <span />
        )}
      </div>

      <Link className="tile" href="/nordic#plan">
        <span className="tile-mark">
          <Icon name="road" size={26} />
        </span>
        <span className="tile-text">
          <b>旅のよてい ぜんぶ</b>
          <i>出発から着いた朝まで、9日ぶん</i>
        </span>
        <Icon name="right" size={16} className="tile-go" />
      </Link>
    </PageShell>
  );
}
