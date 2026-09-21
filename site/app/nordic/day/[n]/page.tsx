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
import RoadStops from "@/components/nordic/RoadStops";
import Shops from "@/components/nordic/Shops";
import DailyFood from "@/components/nordic/DailyFood";
import DayLog from "@/components/nordic/DayLog";
import Rides from "@/components/nordic/Rides";
import Strong from "@/components/nordic/Strong";
import Notes from "@/components/live/Notes";
import { themeById } from "@/content/themes";
import {
  DAY_PAGES,
  LEAVE,
  MAIN,
  NORDIC_GUIDE,
  NORDIC_LOG,
  NORDIC_RIDES,
  ROUTE,
  STOP_SEQ,
  cityCountry,
  cityName,
  dayBySlug,
  dayHref,
  dayName,
  loadSpots,
  nordicCountry,
  rideCount,
  wantsOf,
  type Day,
  type Leg,
  type NordicSpot,
} from "@/content/nordic";
import { SUN_CITIES, sunOn } from "@/content/nordicSun";
import { shopsOf } from "@/content/nordicShops";
import { foodsOf } from "@/content/nordicFood";

/**
 * 1日ぶんのページ。**この企画でいちばん詳しく読めるところ。**
 *
 * ## 責務は「旅の準備」から「旅の振り返り」へ移した（2026-09-21）
 *
 * あやとの言葉:
 *
 * > この画面を通して、「旅の準備」の画面から「旅の振返り」の画面に責務を変えて欲しい。
 * > なので、実際に通ったルートや載せてくれた人などガッツリ。
 * > 朝、どこから立つか とか 気をつけること、寄り道候補、見たいものなどは
 * > 優先度を下げるイメージ。
 *
 * 出発前は「その日を過ごすことになる人が知りたい順」で並べていた。
 * **旅が終わると、その順は誰の役にも立たなくなる。** 9月21日に開く人は
 * もう出発しないので、起きる時刻も、立つところの見立ても、読む理由が無い。
 * 読む理由があるのは、**誰が停まってくれたか**のほうだけ。
 *
 *   1. どんな日か           … 一行と、その日の絵
 *   2. **その日の道のり**   … 乗せてくれた人が、1人ずつ縦に並ぶ（`Rides`）
 *   3. この日、何が起きたか … 日誌と、その日の配信（`DayLog`）
 *   4. 実際に通った街       … 区間ごとに。**「通る」ではなく「通った」**
 *   5. この日、国が変わった … 国が変わる日だけ
 *   6. 旅の前に、決めていたこと … 上の4つ以外は**ぜんぶ畳んでここへ**。
 *                                朝立つところ・気をつけること・親指を上げる・
 *                                明るいうち・寄り道・見たいもの・寄るかもしれない街
 *   7. 買う／ごはん         … 畳んだ区画として、そのあとに
 *   8. わかれ道と、付箋
 *
 * **畳んだものは1つも消していない。** 押せば出発前と同じ中身が出る。
 * 旅は毎年あるものなので、次に走るときの下調べとしてそのまま使える。
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

/**
 * 「6:20」と「19:00」から「12時間40分」。出す数字どうしが必ず合うように、表示から計算する。
 *
 * **分に0を詰めない。** 「12時間06分」は数字の表の書き方で、文の中では
 * 読みがつまずく。ちょうどの時は「12時間」まで。
 */
function daylight(rise: string, set: string) {
  const m = (t: string) => Number(t.split(":")[0]) * 60 + Number(t.split(":")[1]);
  const d = m(set) - m(rise);
  return `${Math.floor(d / 60)}時間${d % 60 ? `${d % 60}分` : ""}`;
}

/**
 * その日いる街。**朝そこに立つ場所だけ。着く先で代わりを出さない。**
 *
 * 前は、朝の街を持っていなければ「その日どこかで着く街」に落としていた。
 * 出発の日（9/11）はそれで **カトヴィツェの日の出**が出ていた。あやとは
 * その日ジョージアにいて、カトヴィツェに降りるのは**翌日の1時5分**。
 * **その日一度も見ない空の明るさ**を「この日の、明るいうち」として
 * 出していたことになる。落とすくらいなら、出さない。
 */
function sunCity(day: Day) {
  const has = (c?: string) => !!c && SUN_CITIES.includes(c);
  const from = day.legs?.length ? cityName(day.legs[0].from) : day.city;
  return has(from) ? from : undefined;
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
        <i><Strong t={h.why} /></i>
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
 *
 * 値は**その日のもの**を出す（`content/nordicSun.ts`）。前は9月15日の値を
 * 街ごとに1つ持って「9月中旬の◯◯」と断って出していた。旅が9日で
 * 終わるあいだは足りていたが、ストックホルムの7泊を日ごとの面に割って
 * 9月27日まで伸びたので、**最終日は1時間ちがう値を分まで出していた。**
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
            {/* 日付はこの面の見出しにもう出ている。ここで繰り返さない */}
            この日の{sc}。明るいのは {daylight(sun.rise, sun.set)}
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
  const sun = sunOn(sc, day.date);
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

  /* お店を出す街。**その日の終わりに足をつけている街だけ。**
     通ってきた街のぶんまで並べると、1日の面に2つ3つと区画が積まれる。
     朝に発つ街で買いたくなったら、その街の日の面が持っている。 */
  const shopCities = sure;
  /** 頭に置く近道の行き先。**お店が1軒でもある街だけ。** */
  const shopJump = shopCities.find((c) => {
    const s = shopsOf(c);
    return s && s.shops.length > 0;
  });

  /* ふだんのごはんを出す国。**その日に足を置く国ぜんぶ。**
     区間の出発地と到着地の両方から引いて、通った順に重複を落とす。

     前は「その日の終わりにいる国」ひとつだけにしていた。**それだと
     フィンランドが1日も出なかった。** 8日目はタリンを出てヘルシンキを
     7時間歩いてからストックホルム行きの船に乗るので、終わりはスウェーデン。
     ヘルシンキの7時間がこの日いちばん長く地面に足を置いているのに、
     フィンランドのごはん7品がどの面にも出ない状態になっていた
     （あやとが名指しした ruisleipä・kaurapuuro・kahvi がそれ）。

     国が変わる日は2つ、8日目は3つ並ぶ。畳んであるので背は伸びない。
     旅程に無い国（出発日のジョージア）は `foodsOf` が空を返すので出ない。
     **ここに国名を書かない**（旅程が変わると古くなる）。 */
  const foodSlugs = [
    ...new Set(
      (legs.length > 0
        ? legs.flatMap((l) => [cityName(l.from), cityName(l.to)])
        : day.city
          ? [day.city]
          : []
      )
        .map((c) => cityCountry(c)?.slug)
        .filter(Boolean) as string[],
    ),
  ];

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

  /* その日、何に乗って進んだか。**この面の主役。**
     行を持たない日（動かないヴィリニュス・リガと、船だけで着いた9日目）は
     空になる。**「0台」とは書かない**——乗らなかったことは出来事ではない。 */
  const rides = NORDIC_RIDES[day.id] ?? [];
  const cars = rideCount(day.id);

  /* 旅の前に決めてあったぶん。**1つも無ければ、畳みの区画ごと出さない。**
     空の紙が1枚立つと、そこに何かあると思って押す人が出る。 */
  const roadStops = legs.filter((l) => (l.stops?.length ?? 0) > 0);
  const unsure =
    hitch || (legs.some((l) => l.fare && !l.fare.yen) && !!day.stay) || legs.length === 0;
  const hasHours = (!!sun && !!sc) || unsure;
  const hasPlan =
    !!(day.wake || day.start) ||
    (day.worry?.length ?? 0) > 0 ||
    hitchLegs.length > 0 ||
    hasHours ||
    roadStops.length > 0 ||
    (day.detour?.length ?? 0) > 0 ||
    goCities.length > 0 ||
    maybeCities.length > 0 ||
    shopCities.some((c) => !!shopsOf(c)) ||
    foodSlugs.some((s) => foodsOf(s).length > 0);

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

      {/* その日の道のり。**この面の主役。いちばん上、いちばん大きく。**

          あやとの言葉（2026-09-21）:

          > この画面を通して、「旅の準備」の画面から「旅の振返り」の画面に
          > 責務を変えて欲しい。なので、実際に通ったルートや載せてくれた人などガッツリ。

          旅が終わった日の面を開く人が知りたいのは、**誰が停まってくれたか。**
          何時に起きる予定だったかではない。だから見出しのすぐ下に置く。 */}
      <Rides rides={rides} count={cars} />

      {/* この日、何が起きたか。その日の配信への1本道もここが持っている。
          **焼いてあるものをそのまま出す**（`NORDIC_LOG`）。あやとが送ってきた
          一言は、受け取った側が Git に焼いて出す運用になった
          （`components/nordic/DayLog.tsx`）。

          道のりの真下に置くのは、**同じ日を2度読ませないため。**
          道のりが「誰の車で進んだか」で、こちらが「その車の外で何があったか」。 */}
      <DayLog entry={NORDIC_LOG[day.id]} />

      {/* 実際に通った街。**「通る」ではなく「通った」。**
          旅が終わってから開く面なので、よていの言い方のままだと
          いつまでも出発していないように読める。
          動かない日（休息日）は区間が無いので、この区画そのものを出さない。 */}
      {legs.length > 0 && (
        <section className="panel paper" id="road">
          <h2>実際に通った街</h2>
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
                  {l.note && (
                    <p className="nday-note">
                      <Strong t={l.note} />
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* 国が変わった日だけ。入った国のページと、その日から使った言葉。
          ポーランドの言葉はガイドに無いので、その日はこの区画が出ない。 */}
      {enters.length > 0 && (
        <section className="panel paper" id="enter">
          <h2>この日、国が変わった</h2>
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

      {/* 旅の前に、決めていたこと。**消さずに、畳んで下げる。**

          あやとの言葉（2026-09-21）:

          > 朝、どこから立つか とか 気をつけること、寄り道候補、見たいものなどは
          > 優先度を下げるイメージ

          どれも出発前に調べて書いたもので、**いま読むなら「そう決めていた」**
          という読み方になる。1枚の紙にまとめて、見出しでそう名乗る。
          既定は全部閉じ。押せば中身はそのまま出る。 */}
      {hasPlan && (
        <section className="panel paper" id="plan">
          <h2>旅の前に、決めていたこと</h2>
          <div className="folds">
            {(day.wake || day.start) && (
              <Fold title="朝、どこから立つか" lead={day.wake ? `起きる ${day.wake}` : undefined}>
                {day.start && (
                  <p className="nday-lead">
                    <b>{day.start.from}</b> から。<Strong t={day.start.how} />
                  </p>
                )}
              </Fold>
            )}

            {(day.worry?.length ?? 0) > 0 && (
              <Fold title="気をつけること" note={`${day.worry!.length}件`}>
                <ul className="nday-worry">
                  {day.worry!.map((w) => (
                    <li key={w}>
                      <Strong t={w} />
                    </li>
                  ))}
                </ul>
              </Fold>
            )}

            {/* 親指を上げるところ。**乗る道と国境は事実、立つところと
                難しさは見立て。** 印と断りは `Hitch` が持っている。 */}
            {hitchLegs.length > 0 && (
              <Fold title="親指を上げるところ" lead={`むずかしさ ${HARD[hitchLegs[0].hitch!.hard]}`}>
                {hitchLegs.map((l) => (
                  <Hitch key={l.id} leg={l} />
                ))}
              </Fold>
            )}

            {hasHours && (
              <Fold
                title="この日の、明るいうち"
                lead={sun ? `明るいのは ${daylight(sun.rise, sun.set)}` : undefined}
              >
                <Hours day={day} sun={sun} sc={sc} hitch={hitch} legs={legs} />
              </Fold>
            )}

            {/* 道すじの上にある寄り道。**区間ごとに1つ。**
                幹線から何km外れるかを持っているのはこちら。 */}
            {roadStops.map((l) => (
              <Fold
                key={l.id}
                title="道すじの上の、寄り道"
                lead={`${cityName(l.from)} から ${cityName(l.to)} まで`}
                note={`${l.stops!.length}件`}
              >
                <RoadStops stops={l.stops!} />
              </Fold>
            ))}

            {(day.detour?.length ?? 0) > 0 && (
              <Fold title="順調だったら、寄る" note={`${day.detour!.length}件`}>
                <ul className="nday-detour">
                  {day.detour!.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </Fold>
            )}

            {/* その街で見たいもの。地図も畳みの中へ。
                **街の名前は旅程から出す**（ここにも見出しにも手で書かない）。 */}
            {goCities.map((c) => (
              <Fold key={c.city} title={`${c.city}で見たいもの`} note={`${c.items.length}件`}>
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
              </Fold>
            ))}

            {maybeCities.map((c) => (
              <Fold
                key={c.city}
                title={`${c.city}に、寄るかもしれなかった`}
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
            ))}

            {/* その街の、おみやげと雑貨。
                ここは「これから買いに行く人」のための行き先だったが、旅の終わった
                面ではその用はもう無い。中身（地図アプリへの1本道）は畳みの中に残す。
                **頭にあった近道の札は外した**——行き先が閉じた畳みの中になったので、
                押しても何も開かない札になる。 */}
            {shopCities.map((city) => (
              <Shops key={city} city={city} date={day.date} bare />
            ))}

            {/* その日に足を置いた国の、ふだんのごはん。
                国の名前はここで書かない（`DailyFood` が slug から引く）。 */}
            {foodSlugs.map((slug) => (
              <DailyFood key={slug} country={slug} named={foodSlugs.length > 1} fold />
            ))}
          </div>
        </section>
      )}

      {/* わかれ道。越えた日は「もう越えました」と、集まった答えだけが残る。
          **この面には司令塔（`TripNow`）が居ない**ので、いまどこかはここが自分で読む。 */}
      <DaySay items={asks} route={route} until={LEAVE.date} />

      {/* その区間あての付箋。**宛先を持っている区間だけ出す**（#160）。 */}
      {legThemes.map((t) => (
        <Notes key={t.id} theme={t.id} title={`${t.name}に、貼る`} />
      ))}

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
