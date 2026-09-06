import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import Icon from "@/components/ui/Icon";
import Flag from "@/components/ui/Flag";
import Fold from "@/components/ui/Fold";
import { Mark } from "@/components/nordic/Marks";
import DaySay, { type SayItem } from "@/components/nordic/DaySay";
import DayLog from "@/components/nordic/DayLog";
import {
  DAY_PAGES,
  NORDIC_GUIDE,
  NORDIC_LOG,
  ROUTE,
  STOP_SEQ,
  SUN,
  cityCountry,
  cityName,
  dayBySlug,
  dayHref,
  dayName,
  loadSpots,
  nordicCountry,
  type Day,
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
 * > `/nordic/day/x` には、ヒッチハイク情報、ルート中のよりたい場所、
 * > その街固有の楽しみ方（食べる、見る、体験する、買う）、などの情報があると良い
 *
 * だから、行き先と距離を並べるだけにしない。**その日を過ごすことになる人が
 * 知りたい順**に置く。
 *
 *   1. どんな日か          … 一行と、その日の絵
 *   2. どこを、どうやって   … 区間ごとに。切符から決まっていることも
 *   3. **親指を上げる**     … 乗る道・越える国境・立つところ・難しさ
 *   4. **明るいうち**       … ヒッチハイクは日のあるあいだしかできない。
 *                             距離より先に、その日の長さが決まっている
 *   5. 決まっていないこと   … 日にち以外の、着く時刻・泊まるところ。**埋めない**
 *   6. この日に、言う       … わかれ道（オーナーの指示でここへ移した）
 *   7. **その街で、食べる・見る・やる・買う**
 *   8. 越える国境と、言葉   … 国が変わる日だけ
 *   9. その日に起きたこと   … 越えてから入る
 *
 * **書いていいのは、事実だけ。** `content/nordic.ts` の区間と、
 * `content/nordic/*.json`（あやとの用意したガイドから作った見どころ）に
 * 書いてあることだけを出す。ここで新しい予定を作らない。
 *
 * **ヒッチハイクの区画だけは、事実と見立てが混ざる。** 道路番号と国境の名前は
 * 地図で追える事実で、立つところと難しさは見立て。**混ぜたまま出さない。**
 * 区画のいちばん下で、どちらがどちらかを断ってある（`Leg.hitch`）。
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
  const way =
    legs.length > 0
      ? `${cityName(legs[0].from)}から${cityName(legs[legs.length - 1].to)}`
      : `${day.city}で休む`;
  return {
    title: `${dayName(day)} ${way} — 北欧ヒッチハイク`,
    description: day.lead,
  };
}

const MOVE: Record<Leg["move"], string> = {
  fly: "飛行機",
  hitch: "ヒッチハイク",
  ferry: "フェリー",
  walk: "歩き",
  van: "マシュルートカ",
};

/** 見どころの4つの種類。**この順に並べる**（オーナーの言った順）。 */
const CATS: { key: string; label: string }[] = [
  { key: "eat", label: "食べる" },
  { key: "see", label: "見る" },
  { key: "do", label: "やる" },
  { key: "buy", label: "買う" },
];
const CAT: Record<string, string> = Object.fromEntries(CATS.map((c) => [c.key, c.label]));

/** 難しさの見立て。1〜3。**数字のまま出さない。** */
const HARD: Record<number, string> = { 1: "みじかい", 2: "ふつう", 3: "山場" };

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
function sunCity(day: Day) {
  const legs = day.legs ?? [];
  if (legs.length === 0) return day.city && SUN[day.city] ? day.city : undefined;
  const from = cityName(legs[0].from);
  if (SUN[from]) return from;
  return legs.map((l) => cityName(l.to)).find((c) => SUN[c]);
}

/**
 * 街の見どころから、**4つの種類を1つずつ**選ぶ。
 *
 * ここは前まで、JSON に並んでいる順のまま上から4〜5件を出していた。
 * ヴィリニュスは「見る」が13件のうち9件あるので、**出てくるのが見るものばかり**で、
 * その街で何を食べられるのかも、何ができるのかも、この面からは分からなかった。
 *
 * オーナーの言い方（「食べる、見る、体験する、買う」）に合わせて、
 * まず種類ごとに1つずつ取る。それでも足りなければ、残りから順に足す。
 */
function byCat(list: NordicSpot[], max: number): NordicSpot[] {
  const picked: NordicSpot[] = [];
  for (const c of CATS) {
    const s = list.find((x) => x.cat === c.key);
    if (s) picked.push(s);
  }
  for (const s of list) {
    if (picked.length >= max) break;
    if (!picked.includes(s)) picked.push(s);
  }
  return picked.slice(0, max);
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

/**
 * 親指を上げるところ。**この面でいちばん中身の要る区画。**
 *
 * 事実（乗る道・国境）と見立て（立つところ・難しさ）を、同じ列に並べない。
 * 見立てのほうには印を付けて、区画の下で断る。
 */
function Hitch({ leg }: { leg: Leg }) {
  const h = leg.hitch!;
  return (
    <div className="ndhh">
      {/* 見出しを `h3` で1行使わない。この面に区間は1つしか無いので、
          「親指を上げる」と難しさを同じ行に並べて、40px を返す。 */}
      <p className="ndhh-hard">
        <span className="ndhh-bars" aria-hidden>
          {[1, 2, 3].map((i) => (
            <i key={i} className={i <= h.hard ? "is-on" : undefined} />
          ))}
        </span>
        <b>
          親指を上げる むずかしさ {HARD[h.hard]}
          <em className="ndhh-guess">見立て</em>
        </b>
        <i>{h.why}</i>
      </p>
      <dl className="ndhh-l">
        <div>
          <dt>
            <Icon name="road" size={20} />
            乗る道
          </dt>
          <dd>{h.road}</dd>
        </div>
        {h.border && (
          <div>
            <dt>
              <Icon name="border" size={20} />
              陸の国境
            </dt>
            <dd>{h.border}</dd>
          </div>
        )}
        <div>
          <dt>
            <Icon name="hitchsign" size={20} />
            立つところ
          </dt>
          <dd>
            {h.stand}
            <em className="ndhh-guess">見立て</em>
          </dd>
        </div>
      </dl>
      <p className="ndhh-src">道と国境は地図から。立つところと難しさは走る前の見立てです。</p>
    </div>
  );
}

/**
 * 明るいうちと、まだ決まっていないこと。
 *
 * **この企画では、距離より先にここが1日の形を決めている。** 親指を上げて
 * 立てるのは日のあるあいだだけで、9月のバルトはそこが13時間しかない。
 * 値は9月中旬の1つだけ持っている（1週間で15分しか動かないので、
 * 日ごとに持つと同じ数字を11回書くことになる）。
 *
 * **「この日の道」と同じ紙に置く。** 別の紙に分けたら、見出しと紙のふちだけで
 * 90px 増えた（実測）。区間の無い休息日だけ、1枚の紙として立てる。
 */
function Hours({
  day,
  sun,
  sc,
  hitch,
  legs,
}: {
  day: Day;
  sun?: { rise: string; set: string };
  sc?: string;
  hitch: boolean;
  legs: Leg[];
}) {
  return (
    <>
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
          日にちは全部決まったので、ここに残るのは着く時刻と泊まるところだけ。 */}
      <ul className="ndunsure">
        {hitch && <li>何時に着くか。停まってくれる車しだいです</li>}
        {legs.some((l) => l.fare && !l.fare.yen) && day.stay && (
          <li>{cityName(day.stay)}のどこに泊まるか</li>
        )}
        {legs.length === 0 && <li>この日に何をするか。下のわかれ道で決めます</li>}
      </ul>
    </>
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
  const hitchLegs = legs.filter((l) => l.hitch);
  const hitch = legs.some((l) => l.move === "hitch");
  const sc = sunCity(day);
  const sun = sc ? SUN[sc] : undefined;
  const art = legs[0]?.art ?? day.art;

  // 通る街と、寄るかもしれない街。**分けて出す。**
  // 混ぜると、寄ると決まっていない街まで決まっているように読める。
  const sure =
    legs.length > 0
      ? [...new Set(legs.map((l) => cityName(l.to)))]
      : day.city
        ? [day.city]
        : [];
  const maybe = [...new Set([...legs.flatMap((l) => l.maybe ?? []), ...(day.maybe ?? [])])];
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

  /* わかれ道。区間にぶら下がっているものと、動かない日（休息日）のぶん。
     休息日には区間が無いので、行そのものが問いを持つ（`content/nordic.ts` の `Day.fork`）。
     並び順の中での位置は、**その日のあと最初に走る区間**にそろえる。
     そこを越えたら、この日ももう過ぎている。 */
  const asks: SayItem[] = [
    ...legs
      .filter((l) => l.fork)
      .map((l) => ({
        leg: l.id,
        seq: ROUTE.indexOf(l),
        way: `${cityName(l.from)} → ${cityName(l.to)}`,
        fork: l.fork!,
      })),
    ...(day.fork && day.city
      ? [
          {
            leg: day.id,
            seq: ROUTE.findIndex((l) => cityName(l.from) === day.city),
            way: day.city,
            fork: day.fork,
          },
        ]
      : []),
  ];

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
        mark={art ? <Mark art={art} size={54} /> : undefined}
        meta={
          <>
            <span>{day.date ? when(day.date) : "日にちは未定"}</span>
            {day.badge && <span className="ndayr-badge">{day.badge}</span>}
            {km > 0 && <span>{km.toLocaleString()}km</span>}
            {day.stay && <span>泊まる {cityName(day.stay)}</span>}
          </>
        }
      />

      {/* この日の道。区間ごとに、絵・距離・時間・決まっている時刻・その区間の話。
          動かない日（休息日）は区間が無いので、この区画そのものを出さない。 */}
      {legs.length > 0 && (
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

          {/* 親指を上げるところ。**ヒッチハイクの区間にだけ出る。** */}
          {hitchLegs.map((l) => (
            <Hitch key={l.id} leg={l} />
          ))}
          <Hours day={day} sun={sun} sc={sc} hitch={hitch} legs={legs} />
        </section>
      )}

      {/* 動かない日は「この日の道」が無いので、時間だけを1枚の紙にする。 */}
      {legs.length === 0 && (sun || day.stay) && (
        <section className="panel paper" id="hours">
          <h2>この日の、明るいうち</h2>
          <Hours day={day} sun={sun} sc={sc} hitch={hitch} legs={legs} />
        </section>
      )}

      {/* わかれ道。**この面に入ったときに出す**（オーナーの指示）。
          数が読めないときは、区画ごと出ない。 */}
      {/* 止まる街の並びを渡す。**この面には司令塔（`TripNow`）が居ない**ので、
          いま何本目かはここが自分で読む。渡すのは字と数字だけにして、
          旅程表そのものを面の JS に連れてこない。 */}
      <DaySay items={asks} route={STOP_SEQ} />

      {/* その街で、食べる・見る・やる・買う。**中身は国のページにある。**
          ここは4つの種類を1つずつ出して、全部読みたい人はその街の段へ送る。
          同じ本文を2か所に置かない。 */}
      {byCity.length > 0 && (
        <section className="panel paper" id="see">
          <h2>その街で、食べる・見る・やる・買う</h2>
          {byCity.map((c) => {
            const list = (
              <>
                <ul className="ndsps">
                  {byCat(c.list, 4).map((s) => (
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
              </>
            );
            /* 寄るかどうかがまだ決まっていない街は、畳んでおく。
               通ると決まった街と同じ高さで開いていると、寄ると決まって見える。 */
            return c.maybe ? (
              <div key={c.city} className="folds ndcity">
                <Fold
                  title={c.city}
                  lead={`寄るかどうかは、これから決まります。${c.list.length}件`}
                >
                  {list}
                </Fold>
              </div>
            ) : (
              <div key={c.city} className="ndcity">
                <h3 className="nsub">{c.city}</h3>
                {list}
              </div>
            );
          })}
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
            <div key={p.lang} className="folds">
              <Fold title={`${p.lang}を、3つだけ`} lead={p.items.slice(0, 3).map((w) => w.jp).join(" / ")}>
                <ul className="ndph-list">
                  {p.items.slice(0, 3).map((w) => (
                    <li key={w.jp}>
                      <b>{w.local}</b>
                      <em>{w.yomi}</em>
                      <i>{w.jp}</i>
                    </li>
                  ))}
                </ul>
              </Fold>
            </div>
          ))}
        </section>
      )}

      {/* 越えた日にだけ入る。よていだけの面は、出発前にしか読む理由がない。
          **書くのは旅の最中で、そのときあやとは道の上にいる。** Git を編集して
          commit して Hosting を手で起動する、は回らないので、ここは
          画面が出てから読みにいく（`components/nordic/DayLog.tsx`）。
          焼いてあるぶん（`NORDIC_LOG`）は、旅が終わってから写す正本。 */}
      <DayLog day={day.id} dayName={dayName(day)} baked={NORDIC_LOG[day.id]} />

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
          <i>出発から、ストックホルムを発つ日まで</i>
        </span>
        <Icon name="right" size={16} className="tile-go" />
      </Link>
    </PageShell>
  );
}
