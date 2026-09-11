import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import Icon from "@/components/ui/Icon";
import Flag from "@/components/ui/Flag";
import Fold from "@/components/ui/Fold";
import { Mark } from "@/components/nordic/Marks";
import DaySay, { type SayItem } from "@/components/nordic/DaySay";
import CityMap, { cityKeys, type SpotKey } from "@/components/nordic/CityMap";
import WantList, { type WantItem } from "@/components/nordic/WantList";
import DayLog from "@/components/nordic/DayLog";
import Notes from "@/components/live/Notes";
import { themeById } from "@/content/themes";
import {
  DAY_PAGES,
  LEAVE,
  MAIN,
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
  wantsOf,
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
  /* 区間のある日は「◯から◯」、無い日は「◯で休む」。
     **休んでいない日は `way` で上書きする**（9/27 は動く区間を持たないが
     夜の便で発つので、自動だと「ストックホルムで休む」と名乗ってしまう）。 */
  const way =
    day.way ??
    (legs.length > 0
      ? `${cityName(legs[0].from)}から${cityName(legs[legs.length - 1].to)}`
      : `${day.city}で休む`);
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
 * 街の見どころを、**4つの種類が先に出そろう順**に並べ替える。
 *
 * ここは前まで、JSON に並んでいる順のまま上から4〜5件を出していた。
 * ヴィリニュスは「見る」が13件のうち9件あるので、**出てくるのが見るものばかり**で、
 * その街で何を食べられるのかも、何ができるのかも、この面からは分からなかった。
 *
 * オーナーの言い方（「食べる、見る、体験する、買う」）に合わせて、
 * まず種類ごとに1つずつ取り、残りは元の順で後ろに付ける。
 *
 * **切らない。** 切るのは畳み（`Longer`）の仕事で、押せば最後まで出る。
 * ここで上から4件に切ると、押しても5件目が出てこない一覧になる。
 */
function byCat(list: NordicSpot[]): NordicSpot[] {
  const picked: NordicSpot[] = [];
  for (const c of CATS) {
    const s = list.find((x) => x.cat === c.key);
    if (s) picked.push(s);
  }
  for (const s of list) {
    if (!picked.includes(s)) picked.push(s);
  }
  return picked;
}

/**
 * その街で見たいもの。**教えてもらったものを先に、ガイドの見どころをあとに。**
 *
 * 付箋で挙がったものの多くは、ガイド（`content/nordic/*.json`）にもう入っている。
 * **同じものを2行にしない。** `id` を持つ提案はその見どころの行そのものになって、
 * 「誰が教えてくれたか」だけが足される。ガイドに無いものは、付箋のほうが字を持つ。
 */
function wantItems(
  city: string,
  spots: NordicSpot[],
  keys: Record<string, SpotKey>,
): WantItem[] {
  const list = spots.filter((s) => s.city === city);
  const byId = new Map(list.map((s) => [s.id, s]));
  const used = new Set<string>();
  const items: WantItem[] = [];
  for (const w of wantsOf(city)) {
    const s = w.id ? byId.get(w.id) : undefined;
    // 指していた見どころが消えていたら、その行は出さない。
    // 字を持っていないので、出しても名前の無い行になる。
    if (w.id && !s) continue;
    if (s) used.add(s.id);
    const k = s ? keys[s.id] : undefined;
    items.push({
      key: s ? s.id : `${city}-${w.title}`,
      cat: s?.cat ?? w.cat ?? "see",
      title: s?.title ?? w.title ?? "",
      point: s?.point ?? w.point,
      img: s?.img,
      n: k?.n,
      href: k?.href,
      far: k?.far,
      want: true,
      by: w.by,
      // 付箋の言葉と返事は、その付箋の1件目にだけ
      say: w.head ? w.say : undefined,
      reply: w.head ? w.reply : undefined,
    });
  }
  for (const s of byCat(list)) {
    if (used.has(s.id)) continue;
    const k = keys[s.id];
    items.push({
      key: s.id,
      cat: s.cat,
      title: s.title,
      point: s.point,
      img: s.img,
      n: k?.n,
      href: k?.href,
      far: k?.far,
    });
  }
  return items;
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
      // 番号は地図の点への行き先を持つ。地図を出さない「寄るかもしれない街」に
      // 渡すと、どこへも行けない番号になる
      items: wantItems(city, spots, maybe.includes(city) ? {} : cityKeys(city)),
    }))
    // ガイドに1件も無くても、付箋で教えてもらったものがあれば区画は立てる
    .filter((c) => c.items.length > 0);
  const goCities = byCity.filter((c) => !c.maybe);
  const maybeCities = byCity.filter((c) => c.maybe);

  // 国が変わる区間。入る国のページと、その国の言葉へつなぐ。
  const enters = legs
    .map((l) => (l.enters ? nordicCountry(l.enters) : undefined))
    .filter(Boolean) as NonNullable<ReturnType<typeof nordicCountry>>[];
  const phrases = enters
    .map((c) => NORDIC_GUIDE.phrases.find((p) => p.country === c.name))
    .filter(Boolean) as (typeof NORDIC_GUIDE.phrases)[number][];

  /* 止まる街の並びに、旅程の日付を足す。**いる場所の一次情報はこちら。**
     手で打つ `current.place` は上書きに降りている（`components/nordic/where.ts`）。
     ここが無かったあいだ、この面は本番の「ジョージア・トビリシ」（打たれたのは
     出発の1週間前）をそのまま読んでいたので、旅のあいだじゅう**すでに越えた日の
     問いに票が入り続けていた**。

     組み方は `/nordic` の `stops` と同じ。`route[i]` を発つのが `MAIN[i]`、
     `route[i]` へ着くのが `MAIN[i-1]`。 */
  const route = STOP_SEQ.map((s, i) => ({
    ...s,
    leaveOn: MAIN[i]?.date,
    arriveOn: i > 0 ? MAIN[i - 1]?.date : undefined,
  }));

  /* わかれ道。区間にぶら下がっているものと、動かない日（休息日）のぶん。
     休息日には区間が無いので、行そのものが問いを持つ（`content/nordic.ts` の `Day.fork`）。

     **動かない日の位置は、その街そのもの**＝その街を発つ区間の半歩手前
     （`components/nordic/here.ts`）。区間にそろえていたころ、9月15日
     （ヴィリニュスの休息日）の問いが、翌16日にヴィリニュスを発っても閉じなかった。
     どちらの日も「ヴィリニュスにいる」ので、街の番号だけでは見分けられない。

     旅程に無い街だったら、閉じない側に倒す（終点より先の数を置く）。
     判断がつかないときに黙って閉じると、まだ決まっていないことに答えられなくなる。 */
  const restAt = day.city ? route.findIndex((s) => s.name === day.city) : -1;
  const restSeq = restAt >= 0 ? route[restAt].seq - 0.5 : ROUTE.length + 1;
  /* この日の区間のうち、付箋の宛先を持っているもの。
     テーマの id は `leg-<区間の id>`（`content/themes.ts`）。 */
  const legThemes = legs
    .map((l) => themeById(`leg-${l.id}`))
    .filter((t) => !!t);

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
            seq: restSeq,
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

      {/* 朝、どこから立つか。**区間の「立つところ」とは別もの。**
          あちらは幹線のどこに立つかで、こちらは**宿からそこへどう出るか。**
          ワルシャワの宿は幹線まで9.3kmあって、朝いちばんの1時間がそこに消える。
          距離の話より先に読まれるべきなので、時間の区画のすぐ下に置く。 */}
      {(day.wake || day.start) && (
        <section className="panel paper" id="start">
          <h2>朝、どこから立つか</h2>
          {day.wake && (
            <p className="nday-wake">
              起きる <b>{day.wake}</b>
            </p>
          )}
          {day.start && (
            <p className="nday-lead">
              <b>{day.start.from}</b> から。{day.start.how}
            </p>
          )}
        </section>
      )}

      {/* 気をつけること。**書いてあるのは、行程表で名指しになっている懸念だけ。**
          「たぶん大丈夫」は書かない。埋めると、本当に危ない日が埋もれる。 */}
      {(day.worry?.length ?? 0) > 0 && (
        <section className="panel paper" id="worry">
          <h2>気をつけること</h2>
          <ul className="nday-worry">
            {day.worry!.map((w) => (
              <li key={w}>{w.replace(/\*\*/g, "")}</li>
            ))}
          </ul>
        </section>
      )}

      {/* わかれ道。**この面に入ったときに出す**（オーナーの指示）。
          数が読めないときは、区画ごと出ない。 */}
      {/* 止まる街の並びと、旅程の日付を渡す。**この面には司令塔（`TripNow`）が
          居ない**ので、いまどこかはここが自分で読む。渡すのは字と数字と日付だけに
          して、旅程表そのものを面の JS に連れてこない。 */}
      <DaySay items={asks} route={route} until={LEAVE.date} />

      {/* その区間あての付箋。**宛先を持っている区間だけ出す**（#160）。
          10区間ぶん先に並べると、そのうち9つが空の区画になる。
          付箋が集まった区間から `content/themes.ts` に1行足していく
          （あやとの指示「付箋が集まった日だけ足す」）。

          **「言う」ではなく「貼る」。** すぐ上の `DaySay` が「この日に、言う」で、
          あちらは押すだけの分かれ道。同じ言葉にすると、押す区画と書く区画が
          見出しで見分けられなくなる。 */}
      {legThemes.map((t) => (
        <Notes key={t.id} theme={t.id} title={`${t.name}に、貼る`} />
      ))}

      {/* 順調だったら、寄る。**寄ると決まっていない。**
          ヒッチハイクは着く時刻が読めないので、予定として書くと嘘になる。
          「順調だったら」を見出しに入れて、決まりごとに見えないようにする。 */}
      {(day.detour?.length ?? 0) > 0 && (
        <section className="panel paper" id="detour">
          <h2>順調だったら、寄る</h2>
          <ul className="nday-detour">
            {day.detour!.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </section>
      )}

      {/* その街で見たいもの。**この日に着く街ごとに、1枚ずつ。**

          あやとの言葉（2026-09-09）:

          > その日程表のところに「この街で見たいもの」みたいな欄をつけてもらって、
          > 例えば1日目だったらワルシャワがつくと思うんですけど、「ワルシャワで
          > 見たいもの」みたいな欄をつけてもらって、もちろん1日のルートの部分は
          > 残しつつ、（…）欄を作って地図を貼って、で、見るべきものを
          > ポンポンってリストアップしてください

          **街の名前は旅程（`DAYS` `ROUTE`）から出す。** ここにも見出しにも
          街名を書かない。旅程は #91 で一度ぜんぶ変わっていて、そのとき
          手で書いた街名だけが古いまま残る。

          地図は OpenStreetMap の実データを焼いたもの（`tools/nordic/citymap.py`）。
          外の地図サービスを画面から呼ぶことはしない（書き出しに全部入っている）。 */}
      {goCities.map((c) => (
        <section key={c.city} className="panel paper" id={`want-${c.city}`}>
          <h2>{c.city}で見たいもの</h2>
          {/* まず地図。**どこに何があるかが先で、一覧は後。**
              道・川・旧市街まで描いてある実データの地図（`CityMap`）。
              **地図の下に番号の札を並べない。** 番号は一覧の行が持っている */}
          <CityMap city={c.city} />
          <WantList items={c.items} />
          {c.country && c.list.length > 0 && (
            <Link
              className="chip link"
              href={`/nordic/${c.country.slug}#city-${encodeURIComponent(c.city)}`}
            >
              {c.city}の{c.list.length}件を読む
              <Icon name="right" size={14} />
            </Link>
          )}
        </section>
      ))}

      {/* 寄るかどうかがまだ決まっていない街。**畳んでおく。**
          着く街と同じ高さで開いていると、寄ると決まって見える。
          地図も畳みの中に入れる（開くまで、そこは寄る街ではない）。 */}
      {maybeCities.length > 0 && (
        <section className="panel paper" id="maybe">
          <h2>寄るかもしれない街</h2>
          {maybeCities.map((c) => (
            <div key={c.city} className="folds ndcity">
              <Fold
                title={`${c.city}で見たいもの`}
                lead={`通り道にある${c.items.length}件`}
              >
                      <WantList items={c.items} />
                {c.country && c.list.length > 0 && (
                  <Link
                    className="chip link"
                    href={`/nordic/${c.country.slug}#city-${encodeURIComponent(c.city)}`}
                  >
                    {c.city}の{c.list.length}件を読む
                    <Icon name="right" size={14} />
                  </Link>
                )}
              </Fold>
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
          **入るのは旅の最中で、そのときあやとは道の上にいる。** Git を編集して
          commit して Hosting を手で起動する、は回らないので、ここは
          画面が出てから読みにいく（`components/nordic/DayLog.tsx`）。
          焼いてあるぶん（`NORDIC_LOG`）は、旅が終わってから写す正本。 */}
      <DayLog day={day.id} baked={NORDIC_LOG[day.id]} />

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
