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
import { LEGENDS } from "@/content/legends";
import { NORDIC_COUNTRIES } from "@/content/nordic";
import { shortsOf, type Short } from "@/content/shorts";
import { chapterCountries } from "@/content/walked";
import { ALBANIA_GROUP, MACEDONIA_GROUP, NORDIC_GROUP } from "@/content/themes";
import { artOf, type IslandArt } from "@/components/chain/shapes";
import { boardPlate, type IsleBoardSpec } from "./board";
import { isleIcon } from "./icons";
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

export type IsleFact = {
  n: string;
  unit?: string;
  cap: string;
  /**
   * 日数を名乗っている欄。**章の slug を渡すと、画面が出てから数え直す。**
   *
   * `n` は焼いたときの答え（最初の1枚ぶん）。いま歩いている島はここが
   * 毎日1ずつ増えるので、渡さないとデプロイした日で止まる
   * （`components/isle/ChapDays.tsx`）。
   */
  since?: string;
};

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
  /** 板の中に出す掲示板（`components/isle/IsleBoard.tsx`）。
      **字ごと `./board.ts` が作る**——島の側で書かない */
  board?: IsleBoardSpec;
  /** 出発までの日数を出す。**画面が出てから数える**（焼き込まない） */
  countdown?: string;
  /**
   * 添え字が日数を名乗っているとき、**数え直す材料**。
   *
   * `blurb` に「17日目」と字で入れてしまうと、焼いた HTML がその数を
   * 配り続ける（`output: "export"`）。札は字を持ち、数は持たない——
   * どの章を、どういう言い方で数えるかだけを渡して、数は画面が出てから
   * 作る（`components/isle/ChapDays.tsx` の `useSinceWord`）。
   */
  since?: { chapter: string; tail: string };
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
  /** 島の色（`app/css/tokens.css` の [data-theme]）。顔ぶれは `IslandArt` が持つ */
  theme?: IslandArt["theme"];
  places: IslePlaceSpec[];
  /** その章のあいだに来てくれていた人（絵のある人だけ）。
      `score` は島に出るえらばれやすさ（0〜1。額の順位＋出席の順位）。
      **無くてよい**——章ごとの名簿は日数しか数えていないので、
      そこでは出席の順位だけで点が付く（`components/island/roster.ts`）。 */
  folk: { icon: string; days: number; score?: number }[];
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

/**
 * 「2024年10月から12月まで」。年が同じなら二度書かない。
 *
 * **同じ月なら「から〜まで」を書かない。** 旅に出たばかりの島はショートが
 * 数日ぶんしかないので、そのままだと「2026年9月から9月まで」になる
 * （北欧の島が実際にそうなった）。始まりと終わりが同じものを、
 * 始まりと終わりの形で言わない。
 */
const span = (a: string, b: string) =>
  a.slice(0, 7) === b.slice(0, 7)
    ? ym(a)
    : a.slice(0, 4) === b.slice(0, 4)
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

/**
 * その章の期間に入っている伝説の企画。
 *
 * **見るのは `date` だけ**（`range` ではない）。だから伝説を1つ足すときは、
 * `date` をその章の期間の中に置くこと。1日でも外すと、丘（`/legends`）には
 * 出るのに島には1枚も建たない。
 *
 * **終わった章にここが0件になっていないか**は、毎晩 `python/upkeep_watch.py`
 * の引き金「終わった旅の伝説」が数えて #664 の札に出す。あちらも `date` だけを
 * 見る——見かたを2つ持つと、札が緑なのに島が空っぽ、が起きる。
 */
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
  /* **歩いている最中の国も数える**（`content/walked.ts` の `chapterCountries`）。
     章の `countries` だけを見ていたので、アルバニアを歩いて北マケドニアに居る日に
     「0カ国 歩いた」と出ていた。 */
  const countries = chapterCountries(c);
  /* **地形は、記録のある国だけで決める。** 歩いている最中の国に地方を持たせると、
     国に入った日に島の形が黙って変わる（`chapterCountries` の注）。 */
  const art = artOf(c.slug, countries.flatMap((k) => (k.region ? [k.region] : [])));
  const streams = CHAPTER_STREAMS[c.slug] ?? [];
  const legends = legendsOf(c);
  const places: IslePlaceSpec[] = [];

  if (countries.length) {
    places.push({
      id: "countries",
      label: "この島で歩いた国",
      blurb: `${countries.length}カ国`,
      icon: isleIcon(c.slug, "countries", "signpost-flags"),
      size: 64,
      sign: true,
      items: countries.map((k) => {
        // その国でどこにいたか。国名だけ並べても、島の記憶に結びつかない。
        // **歩いている最中の国には街がまだ無い。空の欄を置かない**
        const cities = k.stays.flatMap((s) => s.cities).slice(0, 3).join("・");
        return { label: k.name, ...(cities ? { sub: cities } : {}), href: k.href, flag: k.slug };
      }),
    });
  }

  if (streams.length) {
    places.push({
      id: "streams",
      label: "この島で起きたこと",
      blurb: `${streams.length}本の配信`,
      icon: isleIcon(c.slug, "streams", "tower-studio"),
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
      icon: isleIcon(c.slug, "shorts", "signboard"),
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
      icon: isleIcon(c.slug, "legends", "hall-museum"),
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
      icon: isleIcon(c.slug, "apps", "hut-workshop"),
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
      icon: isleIcon(c.slug, "first", "campfire"),
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
      /* **数は焼かない。** 字にしてから渡すと、いま歩いている島の札が
         デプロイした日の数で止まる（`since` と `ChapDays.tsx`）。 */
      blurb: `${days.toLocaleString()}日いた`,
      since: { chapter: c.slug, tail: "日いた" },
      icon: isleIcon(c.slug, "facts", "statue"),
      size: 54,
      sign: true,
      note: c.note,
      facts: [
        { n: String(days), unit: "日", cap: "この島にいた", since: c.slug },
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
    places: [...places, pier(c.slug, prev, next)],
    folk: st?.residents ?? [],
    prev,
    next,
    art,
  };
}

/**
 * いま歩いている旅あての板を、どの宛先で建てるか。
 *
 * **島の側で見出しを直書きしない。** 直書きすると、宛先を畳んだ日に
 * 島の板だけが前の旅の棚を出し続ける（`docs/island-misses.md` #223）。
 * ここが持つのは「この島に属する宛先の、名前と見出し」の組だけで、
 * **どれを建てるかは `boardPlate` が表（`content/themes.ts`）を見て決める。**
 *
 * 並びは**新しい国が先**。国を1つ越えたら、その国の組を先頭に足す。
 */
const BALKAN_BOARDS: { name: string; group: string }[] = [
  { name: "北マケドニア", group: MACEDONIA_GROUP },
  { name: "アルバニア", group: ALBANIA_GROUP },
];

/**
 * その国の案内（行く前に調べた面）。**章 → その章で行く国のうち、面の在るもの。**
 *
 * 章を国ごとに割らないので（`content/chapters.ts` の `balkans`）、
 * 「この国の歩きかた」の行き先は章の slug からは決まらない。だから表で持つ。
 *
 * - **並びは新しい国が先。** 国を1つ越えたら、その国の行を先頭に足す
 * - **面の無い国を書かない。** 書くと、押した先で島の玄関が 200 を返して、
 *   押した人には何が起きたのか分からない（`content/themes.ts` の同じ決まり）。
 *   アルバニアがここに無いのは、`/albania` という面が無いから
 * - **章の外へ持ち越さない。** 章が変われば、この表に無い章になって札は建たない。
 *   持ち越すと、次の島に前の国の案内が建つ
 *
 * 行き先が本当に在るかは `site/selftest/islechapter_selftest.mjs` が数える。
 */
const GUIDES: Record<string, { name: string; href: string; lead: string }[]> = {
  balkans: [
    {
      name: "北マケドニア",
      href: "/north-macedonia",
      /* 島の下の紙に出る1行。**時制も数も書かない**（`docs/island-standards.md` 16章）。
         国を越えた日にも、何ヶ月たっても本当のことだけ。 */
      lead: "海に出ない、山と湖の国。首都の歩きかたと、見どころと、食べもの",
    },
  ],
};

/**
 * その章で、いま案内の面を持っている国。**無ければ `null`。**
 *
 * 島の札（`guidePlace`）も、島の下の紙の板（`app/page.tsx`）も、ここから引く。
 * 国の名前を紙のほうへ書き写すと、国を越えた日に**紙だけが前の国を指す。**
 */
export const guideOf = (slug?: string) => (slug && GUIDES[slug]?.[0]) || null;

/**
 * 案内の札の字。**島の建物でも、板の中の1行でも、同じ字にする**
 * （`docs/island-design.md` 6章「島の固有名詞を名前にしない」。
 * 押す前に、中に何があるかが読めること）。
 * 表紙は建物を増やせないので板の中に入れていて（`components/isle/cover.ts`）、
 * **2か所で別の字になると、同じ行き先が別の部屋に見える。**
 */
export const GUIDE_LABEL = "この国の歩きかた";
export const GUIDE_BLURB = "首都・見どころ・食べもの";

/**
 * その章の「この国の歩きかた」。**案内の面を1枚も持たない章には建たない。**
 *
 * @param slug 章（`content/chapters.ts` の slug）
 */
export const guidePlace = (slug?: string): IslePlaceSpec | null => {
  const g = guideOf(slug);
  if (!g) return null;
  return {
    id: "guidebook",
    label: GUIDE_LABEL,
    blurb: GUIDE_BLURB,
    icon: isleIcon(slug, "guidebook", "signpost"),
    size: 58,
    sign: true,
    href: g.href,
  };
};

/**
 * バルカン諸国周遊の島。**素材の島に、板と案内を足したもの。**
 *
 * あやと（2026-10-12）:「北マケドニアとアルバニアの島をわけろなんて言ってない。
 * バルカン諸国周遊に島の名前を変えて統合してください。」
 * アルバニアの島（`albaniaSpec`）と北マケドニアの島（`macedoniaSpec`）は、
 * ここ1本になった。
 *
 * ## なぜ素材の島を**作り直さず、包む**のか
 *
 * ここが風船と桟橋だけを返していたころ、呼び出し側は「建つものの多いほうを採る」
 * （`app/island/[chapter]/page.tsx`）ので、**章の表に `from` が入って配信が
 * 焼かれた晩に、素材の島が追い越して、足したものが黙って消える。**
 * 赤くならない。島から1軒消えるだけ——北欧が5日間ショート1軒の島に
 * なっていたのと同じ壊れ方（`docs/island-misses.md` #185）。
 *
 * 板も案内も素材から生まれるものではないので、**素材と取り替えっこにしない。**
 * 素材の島を建ててから、その上に足す。こうすると配信・住人・伝説が焼かれる
 * たびに島が勝手に太り、板と案内は周遊が終わるまで残る。
 *
 * ## 足すのは2つ
 *
 * - **この旅あての付箋を読む板**（あやと 2026-09-27 の「風船」）。
 *   **札の字は手で書かない**（`components/isle/board.ts`）——2026-10-11 に
 *   アルバニアあての宛先を畳んだのに字が「ここから貼れる」のまま残って、
 *   押した先で貼れない板になっていた（#223）
 * - **いまいる国の案内**（`/north-macedonia`）。行く先の中身が先に分かって
 *   いる国なので、島に降りた人が最初に欲しいのはそれ
 */
export function balkansSpec(c: Chapter, prev?: Neighbour, next?: Neighbour): IsleSpec {
  const isle = isleSpec(c, prev, next);
  /* **いま書ける宛先のある国で板を名乗り、棚にはこの旅の国ぜんぶを並べる。**
     名乗りを書ける国に寄せるのは、「◯◯でこれやって」が注文の宛先だから。
     棚を旅ぜんぶにするのは、**畳んだ国あての付箋も、この島に来た付箋**だから——
     片方だけにすると、アルバニアあての5枚が島から読めなくなる。
     書ける国が1つも無ければいちばん新しい国で名乗って、`boardPlate` が
     「読むところ」として出す（誘いの字を1文字も出さない）。 */
  const also = BALKAN_BOARDS.map((b) => b.group);
  const pick =
    BALKAN_BOARDS.find((b) => boardPlate({ ...b, also }).board.aim === "here") ?? BALKAN_BOARDS[0];
  const wish: IslePlaceSpec = {
    /* **字は表から作る。** 手で書いた字をここに足さない——
       足した1行が、宛先を畳んだ日から嘘になる（`./board.ts`）。 */
    ...boardPlate({ ...pick, also }),
    id: "board",
    icon: isleIcon(c.slug, "board", "lantern-hanging"),
    size: 58,
    sign: true,
  };
  /* 桟橋は `isleSpec` が**いちばん最後**に足す。島から島へ渡るところなので
     並びの末尾に置いておきたい。だから足すものはその1つ手前に差す。 */
  const places = [...isle.places];
  const guide = guidePlace(c.slug);
  places.splice(Math.max(0, places.length - 1), 0, ...(guide ? [guide] : []), wish);
  return { ...isle, places, building: c.opensAt };
}

/**
 * 次の島（北欧）。
 *
 * **建てるものが違う**（`docs/island-atlas.md` 4章）。過去の島は
 * 「その章のときに何をしていたか」で建てるが、この島はまだ何も起きていない。
 * 建つのは、出発までの日数・企画の説明・旅のしおり・この旅の掲示板。
 *
 * 歩いた国のかわりに、その旅の国。行き先は `/nordic/<国>` で、
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
      /* **「この旅のこと」の副題は、表紙（`cover.ts`）と同じ字にする。**
         前は表紙が `chapterDays()` の**経過**（1日、2日…）、こちらが焼いた
         **見立て**（17日）を出していた。同じ名前・同じ絵の札が、面によって
         違う数を言っていた（`content/chapters.ts` の「同じ数を2か所に書かない」）。
         この札が答えるのは「どんな旅なのか」なので、見立てに寄せる。
         何日目かは、表紙の「この島のこと」の札が持っている。
         **式を1つにまとめて import し合うと、表紙の束に `spec.ts` の
         材料（配信の一覧・伝説・ショート）が丸ごと付いてくる。**
         だから同じ出どころ（`plannedDays` と `NORDIC_COUNTRIES`）を
         両方が直に読む。手で書いた数はどちらにも無い。 */
      blurb: `${NORDIC_COUNTRIES.length}カ国、${c.plannedDays ?? 0}日`,
      icon: "tent",
      size: 62,
      sign: true,
      href: "/nordic",
      countdown: c.opensAt,
    },
    {
      id: "countries",
      /* **「これから」と書かない。** 北欧の6カ国は歩いてから
         `content/countries.ts` に足す決まりなので（`AHEAD_COUNTRIES`）、
         誰かが手で足すまでこの札の字は変わらない。旅の最中も、帰ってきた
         あとも「これから歩く国 6カ国」と言い続けていた。
         かといって「歩いた国」にもできない——寄らない国が出るかもしれない。
         **時点を言わずに、板を押したら何が読めるかだけを言う。** */
      label: `旅の${NORDIC_COUNTRIES.length}カ国`,
      blurb: "国ごとの見どころと地図",
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
      /* **字は表から作る**（`./board.ts`）。手で書くと、宛先を畳んだ日に
         ここだけが「ここから貼れる」と言い続ける。

         **広げるのを先に書く**のは、あとから手で足した1行が
         ここで勝つようにするため。勝ったものは見張りが
         「表から作り直したものと違う」と言って落とす——
         黙って無視されるより、落ちたほうが直る。 */
      ...boardPlate({ name: "北欧", group: NORDIC_GROUP }),
      id: "board",
      icon: "signboard",
      size: 58,
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
    places: [...places, pier(c.slug, prev)],
    folk: [],
    prev,
    building: c.opensAt,
    art,
  };
}

/**
 * 旅そのものの島を建てる章。**章ごとに建てるものが違う。**
 *
 * ここに無い章は、素材（配信・歩いた国・伝説）だけで建つ（`isleSpec`）。
 * **「日どりが入っているか」で振り分けない**——アルバニアに日どりを入れた日に、
 * アルバニアの島が北欧の島になった（`app/island/[chapter]/page.tsx` の注）。
 *
 * **表はここ1枚。** 面（`app/island/[chapter]/page.tsx`）も見張り
 * （`site/selftest/isleplace_selftest.mjs` / `isleboard_selftest.mjs` /
 * `islechapter_selftest.mjs`）も、ここを読む。写しを置いていたあいだ、
 * 同じ表が3か所にあって、**章の名前を変えると3か所とも直さないと
 * 見張りだけが古い島を測り続ける**状態だった（`docs/island-standards.md` 8章）。
 */
export const TRIP_SPEC: Record<string, (c: Chapter, prev?: Neighbour, next?: Neighbour) => IsleSpec> = {
  nordic: nordicSpec,
  balkans: balkansSpec,
};

/**
 * 面と同じ建てかたで、その章の島を1つ。**建つものの多いほうを採る。**
 *
 * 数で切らない理由は `app/island/[chapter]/page.tsx` に書いてある
 * （機械が素材を1本焼いた晩に、旅の島が黙って消える）。
 * **面と見張りが同じ1本を呼ぶ**ので、建てかたを変えても両方が一緒に動く。
 */
export function chapterIsle(c: Chapter, prev?: Neighbour, next?: Neighbour): IsleSpec {
  const isle = isleSpec(c, prev, next);
  const trip = TRIP_SPEC[c.slug]?.(c, prev, next);
  return trip && isle.places.length < trip.places.length ? trip : isle;
}
