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

import { APPS, PAST_APPS, type AppEntry, type AppMilestone } from "@/content/apps";
import { CHAPTER_STATS } from "@/content/chapterStats";
import { CHAPTER_STREAMS } from "@/content/chapterStreams";
import { chapterDays, chapterSpan, type Chapter } from "@/content/chapters";
import { COUNTRIES } from "@/content/countries";
import { LEGENDS } from "@/content/legends";
import { NORDIC_COUNTRIES } from "@/content/nordic";
import { shortsOf, type Short } from "@/content/shorts";
import { NORDIC_GROUP, THEMES, type Theme } from "@/content/themes";
import { artOf, type IslandArt } from "@/components/chain/shapes";
import { pier, type Neighbour } from "./pier";
import { isleSpanRange } from "./span";

export type { Neighbour };

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
  /** 板の中に出す掲示板の棚割り（`components/isle/IsleBoard.tsx`） */
  board?: Theme[];
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
  /**
   * 島の大きさ（ワールド単位）を、日数から出さずにここで決める。
   *
   * **表紙の島にだけ渡す。** 表紙は常設の入口10軒が建つ島なので、
   * 大きさは「何日いたか」ではなく「何軒建つか」で決まる。
   * 日数と大きさの比べ合いは `/atlas` の航路が持っている
   * （`docs/island-atlas.md` 4.5章）。
   */
  radius?: number;
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

/**
 * 章の期間（ミリ秒）。**終わりの日が入っていない章は、今日まで。**
 *
 * 前はここが `c.from && c.to` を見ていて、`to` の空いている章——つまり
 * **いま歩いている島**——だけ、伝説の企画もアプリも1つも拾えなかった。
 * コーカサスの島に建っていたのが石碑と道しるべと桟橋の3つだけだったのは、
 * 素材が無かったからではなく、ここが取りこぼしていたから。
 */
export function spanOf(c: Chapter, today = new Date()): [number, number] | null {
  const { from, to } = chapterSpan(c, today);
  if (from == null) return null;
  return [from, to ?? today.getTime()];
}

const inSpan = (date: string, s: [number, number]) => {
  const t = Date.parse(`${date}T00:00:00+09:00`);
  return t >= s[0] && t <= s[1];
};

/** その章の期間に入っている伝説の企画 */
export const legendsOf = (c: Chapter, today = new Date()) => {
  const s = spanOf(c, today);
  return s ? LEGENDS.filter((l) => inSpan(l.date, s)) : [];
};

/**
 * その章のあいだ、手を動かしていたアプリ。
 *
 * あやとの言葉:「この島でやったアプリのこととか（略）を**アーカイブとして
 * 置いとかないといけない**」。
 *
 * **章に紐づける欄は作らない。** アプリの年表（`content/apps.ts` の
 * `milestones`）に日付が入っているので、章の期間と重なるものを引くだけで
 * 「その島で何をしていたアプリか」まで一緒に出る。手で紐づけると、
 * 年表が伸びたときに**片方だけ古くなる**（`docs/island-misses.md` 決めごと3）。
 */
export type AppOnIsle = { app: AppEntry; marks: AppMilestone[] };
export const appsOf = (c: Chapter, today = new Date()): AppOnIsle[] => {
  const s = spanOf(c, today);
  if (!s) return [];
  return [...APPS, ...PAST_APPS]
    .map((app) => ({ app, marks: app.milestones.filter((m) => inSpan(m.date, s)) }))
    .filter((x) => x.marks.length > 0)
    .sort((a, b) => b.marks.length - a.marks.length);
};

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
      /* **`c.from` を直に割らない。** 章の表に日付が入るのは旅から帰ったときなので、
         その前に配信が焼かれると「年NaN月から」が出る（`./span.ts`）。 */
      note: `${isleSpanRange(c)}、${streams.length}本。`,
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
      note: `${span(shorts[0].date, shorts[shorts.length - 1].date)}、${shorts.length}本。`,
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

  /* この島で作っていたアプリ。**年表の日付から引く**（`appsOf`）。
     工房は常設の入口（`/apps`）にもあるが、あちらは「いま出ている2本」で、
     ここは「この島にいたあいだ、何をしていたか」。中に出るのも節目のほう。 */
  const apps = appsOf(c);
  if (apps.length) {
    places.push({
      id: "apps",
      label: "この島で作っていたアプリ",
      blurb: apps.map((x) => x.app.name).join("・"),
      icon: "hut-workshop",
      size: 78,
      sign: true,
      note: "旅先で、配信しながら作っていた。",
      items: apps.map(({ app, marks }) => ({
        label: app.name,
        // 何本目かではなく、**この島で何があったか**。年表の頭の1件を出す
        sub: `${marks.length}件の節目 — ${marks[0].title}`,
        href: `/apps/${app.slug}`,
        icon: app.icon,
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
      sign: true,
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
    /* **建つ数では切らない**（`docs/island-atlas.md` 4章を書き直した）。
       6つで切っていたころ、ヨーロッパの島からは石碑が、コーカサスの島からは
       そもそも素材が落ちて、島が3軒しかない空き地になっていた。
       島に建てられる数を決めているのは面の広さで、**引きで名前が出る数**の
       6つ（`docs/island-design.md` 3-4）とは別の話。名前のほうは `sign` で
       6つに絞ってあるので、建物は素材のあるだけ建ててよい。 */
    places: [...places, pier(prev, next)],
    folk: st?.residents ?? [],
    prev,
    next,
    art,
  };
}

/**
 * この旅の掲示板の棚割り。
 *
 * **宛先の表（`content/themes.ts`）から、北欧の棚だけを渡す。**
 * 前は本文の頭の `【国名】` を読んで分けていたが、宛先が正式な欄になり
 * （#160）、既存の8件もそちらへ移した（#162）。棚の名前と並びは表が持って
 * いるので、ここは**そのうちどれを島に出すかを選ぶだけ**。
 *
 * あやとの言葉:「北欧周遊島の掲示板には、北欧周遊関連だけ見れれば良い」。
 *
 * 並びは表の順（旅で通る順）。**枚数では動かさない**
 * （`docs/island-play.md`「順位表を作らない」）。
 */
function nordicThemes(): Theme[] {
  return THEMES.filter((t) => t.group === NORDIC_GROUP);
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
      note: "ポーランドから入って、ストックホルムまで。",
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
      blurb: "北欧に来ている付箋",
      icon: "signboard",
      size: 58,
      note: "行きたい場所も、やってほしいことも。",
      board: nordicThemes(),
      more: { label: "島の掲示板へ", sub: "北欧以外の企画も、ここから出せる", href: "/board" },
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
