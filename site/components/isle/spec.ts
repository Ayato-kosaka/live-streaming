/**
 * 島に建てるものを、章のデータから決める。
 *
 * ## その章に無かったものは建てない
 *
 * **`docs/island-atlas.md` 4章。** 「作った料理」はジョージアに落ち着いてから
 * 始めたことなので、ヨーロッパの島には建てない。**その章に無かったものを
 * 建てると、島が嘘をつく。** だから章ごとに手で並べるのではなく、
 * **中身のあるものだけが建つ**ようにしてある。
 * 歩いた国が0なら道しるべは立たないし、伝説の企画が無い章に館は建たない。
 *
 * ## どの島も最大6つ
 *
 * 同 4章。ここが返す数がそのまま島に建つ数になる。
 *
 * ## 建物の中身は、島の中で見る
 *
 * あやとの言葉:「その中のやぐらみたいな感じで、この島で歩いた国とか、
 * この島で起きたこととか、この島の代表的な企画とかが見れて」。
 * だから**押しても島から出ない。** 建物を押すと島の上に板が開いて、
 * その中に一覧が出る。島の外へ出るのは、その一覧の1つを押したときだけ。
 */

import { CHAPTER_STATS } from "@/content/chapterStats";
import { CHAPTER_STREAMS } from "@/content/chapterStreams";
import { chapterDays, type Chapter } from "@/content/chapters";
import { COUNTRIES } from "@/content/countries";
import { LEGENDS } from "@/content/legends";
import { NORDIC_COUNTRIES } from "@/content/nordic";
import { shortsOf, type Short } from "@/content/shorts";
import { artOf, type IslandArt } from "@/components/chain/shapes";

export type IsleItem = {
  label: string;
  sub?: string;
  href: string;
  /** 国旗を出す国（`content/countries.ts` の slug） */
  flag?: string;
  /** 絵（`site/public/sprites/`） */
  icon?: string;
  /** 島の外（YouTube）へ出るか */
  ext?: boolean;
};

export type IsleFact = { n: string; unit?: string; cap: string };

/** となりの島。名前と、そこへの行き先 */
export type Neighbour = { name: string; href: string };

export type IslePlaceSpec = {
  id: string;
  /** 札に出る名前。**中身をそのまま言う**（`docs/island-design.md` 6章） */
  label: string;
  /** 押す前に答えが読める一言 */
  blurb: string;
  /** 建物の絵（`site/public/sprites/`） */
  icon: string;
  /** 絵の高さ（ワールド単位）。押せる範囲もここから作る */
  size: number;
  /** 押したらそのまま行く先。板を開くものには無い */
  href?: string;
  /** 板の中身 */
  items?: IsleItem[];
  facts?: IsleFact[];
  /** ショート動画。サムネイルの格子で出る（`components/isle/IsleSheet.tsx`） */
  shorts?: Short[];
  /** 板の中の1行 */
  note?: string;
  /** 「ぜんぶ見る」の行き先 */
  more?: { label: string; sub: string; href: string };
  /** 出発までの日数を出す。**画面が出てから数える**（焼き込まない） */
  countdown?: string;
  /** 島の「！」の札に出す6つ。いまは全部が出る（島に建つのが最大6つなので） */
  sign?: true;
};

export type IsleSpec = {
  slug: string;
  name: string;
  note: string;
  /** ビルドしたときの日数。**画面が出てから数え直す** */
  days: number;
  from: string;
  to: string;
  /** 島の色（`app/css/tokens.css` の [data-theme]） */
  theme?: "desert" | "nordic";
  places: IslePlaceSpec[];
  /** その章のあいだに来てくれていた人（絵のある人だけ） */
  folk: { icon: string; days: number }[];
  /** となりの島。行き先はビルド時に決める（`components/chain/route.ts`） */
  prev?: Neighbour;
  next?: Neighbour;
  /** 出発前の島か。建設中の絵を出す（`docs/island-atlas.md` 5章） */
  building?: string;
  art: IslandArt;
};

const ym = (d: string) => {
  const [y, m] = d.split("-");
  return `${y}年${Number(m)}月`;
};

/** 「2024年10月から12月まで」。年が同じなら二度書かない */
const span = (a: string, b: string) =>
  a.slice(0, 4) === b.slice(0, 4)
    ? `${ym(a)}から${Number(b.split("-")[1])}月まで`
    : `${ym(a)}から${ym(b)}まで`;

/** その章の期間に入っている伝説の企画 */
const legendsOf = (c: Chapter) =>
  c.from && c.to ? LEGENDS.filter((l) => l.date >= c.from && l.date <= c.to) : [];

/** いちばん古い配信。「はじめての配信」をどの島に建てるかは、これで決まる */
const FIRST_STREAM = (() => {
  let best: [string, string, string] | null = null;
  for (const list of Object.values(CHAPTER_STREAMS))
    for (const [date, id, title] of list) if (!best || date < best[0]) best = [date, id, title];
  return best;
})();

/**
 * 章ひとつぶんの島。
 *
 * @param c    章
 * @param prev となりの島（ひとつ前）
 * @param next となりの島（つぎ）
 */
export function isleSpec(c: Chapter, prev?: Neighbour, next?: Neighbour): IsleSpec {
  const days = chapterDays(c);
  const st = CHAPTER_STATS[c.slug];
  const countries = c.countries
    .map((s) => COUNTRIES.find((x) => x.slug === s))
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
  const art = artOf(c.slug, countries.map((k) => k.region));
  const streams = CHAPTER_STREAMS[c.slug] ?? [];
  const legends = legendsOf(c);
  const places: IslePlaceSpec[] = [];

  if (countries.length) {
    places.push({
      id: "countries",
      label: "この島で歩いた国",
      blurb: `${countries.length}カ国`,
      icon: "signpost-flags",
      size: 64,
      sign: true,
      note: "押すと、その国の1枚へ行けます。",
      items: countries.map((k) => ({
        label: k.name,
        // その国でどこにいたか。国名だけ並べても、島の記憶に結びつかない
        sub: k.stays.flatMap((s) => s.cities).slice(0, 3).join("・"),
        href: `/map/${k.slug}`,
        flag: k.slug,
      })),
    });
  }

  if (streams.length) {
    places.push({
      id: "streams",
      label: "この島で起きたこと",
      blurb: `${streams.length}本の配信`,
      icon: "tower-studio",
      size: 118,
      sign: true,
      note: `${ym(c.from)}から${c.to ? ym(c.to) : "いま"}まで、${streams.length}本。新しいほうから3本。`,
      items: streams.slice(0, 3).map(([date, id, title]) => ({
        label: title,
        sub: date,
        href: `https://www.youtube.com/watch?v=${id}`,
        ext: true,
      })),
      more: {
        label: "この島の配信を全部見る",
        sub: `${streams.length}本。この章のぶんだけ`,
        href: `/island/${c.slug}/streams`,
      },
    });
  }

  /* ショート動画。**配信とは別の建物にする。**
     やぐらの中は「新しい3本＋全部見る」で、押すと島の外（YouTube と `/island/<章>/streams`）へ
     出ていく作りになっている。そこにサムネイルの格子を足すと、1枚の板に
     出口が3種類できて、何を見ている板なのか分からなくなる。

     **埋め込まない。** 58本のうち31本が1つの章にあるので、iframe を並べると
     板を開いた瞬間にプレイヤーが31個立ち上がる。押したら YouTube へ行く絵にする。 */
  const shorts = shortsOf(c.slug);
  if (shorts.length) {
    places.push({
      id: "shorts",
      label: "ショート動画",
      blurb: `${shorts.length}本`,
      /* 板に色紙が何枚も貼ってある絵。**中に出るものと同じ形**にしてある。
         北欧の島の「この旅の掲示板」も同じ絵だが、あちらは別の島で、
         札に出る名前が違う（`docs/island-design.md` 6章「札は答えだけを言う」） */
      icon: "signboard",
      size: 58,
      note: `${span(shorts[0].date, shorts[shorts.length - 1].date)}、${shorts.length}本。押すと YouTube で開きます。`,
      shorts,
    });
  }

  if (legends.length) {
    places.push({
      id: "legends",
      label: "この島の代表的な企画",
      blurb: legends[0].title,
      icon: "hall-museum",
      size: 74,
      sign: true,
      note: "この島にいたあいだにやった、大きい企画。",
      items: legends.map((l) => ({
        label: l.title,
        sub: `${l.figure.n}${l.figure.unit ?? ""} — ${l.figure.cap}`,
        href: `/legends/${l.slug}`,
        icon: l.icon,
      })),
    });
  }

  /* はじめての配信。**いちばん古い配信を持っている島にだけ建つ。**
     「ヨーロッパの島に建てる」と書かずに済むので、章が増えても嘘にならない */
  if (FIRST_STREAM && streams.some(([, id]) => id === FIRST_STREAM[1])) {
    places.push({
      id: "first",
      label: "はじめての配信",
      blurb: FIRST_STREAM[0],
      icon: "campfire",
      size: 40,
      note: "ここから全部が始まった。1本目の配信。",
      items: [
        {
          label: FIRST_STREAM[2],
          sub: FIRST_STREAM[0],
          href: `https://www.youtube.com/watch?v=${FIRST_STREAM[1]}`,
          ext: true,
        },
      ],
    });
  }

  if (st) {
    places.push({
      id: "facts",
      label: "この島のこと",
      blurb: `${days.toLocaleString()}日いた`,
      icon: "statue",
      size: 54,
      note: c.note,
      facts: [
        { n: String(days), unit: "日", cap: "この島にいた" },
        { n: String(st.streams), unit: "本", cap: "配信した" },
        { n: st.people.toLocaleString(), unit: "人", cap: "来てくれた" },
        { n: String(countries.length), unit: "カ国", cap: "歩いた" },
      ],
    });
  }

  return {
    slug: c.slug,
    name: c.name,
    note: c.note,
    days,
    from: c.from,
    to: c.to,
    theme: art.theme,
    /* **どの島も最大6つ**（`docs/island-atlas.md` 4章）。
       あふれたら削るのは中身のほうで、船着き場は必ず残す。
       島から出る道が消えると、島が袋小路になる。

       **あふれるのはヨーロッパだけ**（6つ建つ）。押し出されるのは最後の
       「この島のこと」（石碑）で、これは順番の事故ではなく選んだ結果。
       石碑の4つの数字のうち、日数・本数・国数は同じ島の他の札にも出ているし、
       人数を含めた3つは、ここへ来る前に通る `/atlas` の島の札に出ている
       （`components/chain/Chain.tsx`）。ショート31本は、どこにも無い。 */
    places: [...places.slice(0, 5), pier(prev, next)],
    folk: st?.residents ?? [],
    prev,
    next,
    art,
  };
}

/**
 * 船着き場。**どの島にも建つ。**
 *
 * 島から島へは船で行く（`docs/island-atlas.md` 6章）。着いた舟がつないである
 * ところから歩きはじめて、帰るときも同じところから出る。
 * これが無いと、島から出る道が画面の隅のボタンだけになって、
 * 「島の中にいる」が切れる。
 */
function pier(prev?: Neighbour, next?: Neighbour): IslePlaceSpec {
  const items: IsleItem[] = [];
  if (prev) items.push({ label: prev.name, sub: "ひとつ前の島", href: prev.href, icon: "canoe" });
  if (next) items.push({ label: next.name, sub: "つぎの島", href: next.href, icon: "canoe" });
  items.push({ label: "島の地図", sub: "島の連なりぜんぶ", href: "/atlas", icon: "signpost" });
  return {
    id: "pier",
    label: "となりの島へ",
    blurb: "船で渡る",
    icon: "pier",
    size: 34,
    note: "旅は西から東へ。島は日付の順に並んでいます。",
    items,
  };
}

/**
 * 次の島（北欧）。
 *
 * **建てるものが違う**（`docs/island-atlas.md` 4章）。過去の島は
 * 「その章のときに何をしていたか」で建てるが、この島はまだ何も起きていない。
 * 建つのは、出発までの日数・企画の説明・旅のしおり・この旅の掲示板。
 *
 * 歩いた国のかわりに「これから歩く国」。行き先は `/nordic/<国>` で、
 * 中身はもう全部そろっている（見どころ・地図・値段）。
 * **島の中に同じものを作り直さない。**
 */
export function nordicSpec(c: Chapter, prev?: Neighbour): IsleSpec {
  const art = artOf(c.slug, []);
  const days = chapterDays(c);
  const places: IslePlaceSpec[] = [
    {
      id: "depart",
      label: "この旅のこと",
      blurb: "なぜ北欧まで行くのか",
      icon: "tent",
      size: 62,
      sign: true,
      href: "/nordic",
      countdown: c.opensAt,
    },
    {
      id: "countries",
      label: "これから歩く国",
      blurb: `${NORDIC_COUNTRIES.length}カ国、${days}日`,
      icon: "signpost-flags",
      size: 60,
      sign: true,
      note: "ポーランドから入って、ストックホルムまで。押すと、その国の1枚へ。",
      items: NORDIC_COUNTRIES.map((k) => ({
        label: k.name,
        sub: k.catch,
        href: `/nordic/${k.slug}`,
      })),
    },
    {
      id: "guide",
      label: "旅のしおり",
      blurb: "持ち物と、当日の動き",
      icon: "stall",
      size: 56,
      href: "/nordic/guide",
    },
    {
      id: "board",
      label: "この旅の掲示板",
      blurb: "行き先も、やることも出せる",
      icon: "signboard",
      size: 58,
      href: "/board",
    },
  ];
  return {
    slug: c.slug,
    name: c.name,
    note: c.note,
    days,
    from: c.from,
    to: c.to,
    theme: art.theme,
    places: [...places, pier(prev)],
    folk: [],
    prev,
    building: c.opensAt,
    art,
  };
}
