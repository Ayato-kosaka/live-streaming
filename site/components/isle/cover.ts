import { CHAPTER_STATS } from "@/content/chapterStats";
import { chapterDays, type Chapter } from "@/content/chapters";
import { COUNTRIES } from "@/content/countries";
import { NORDIC_COUNTRIES } from "@/content/nordic";
import { RESIDENTS } from "@/content/residents";
import { artOf } from "@/components/chain/shapes";
import { PLACES } from "@/components/island/layout";
import { pier } from "./pier";
import type { IslePlaceSpec, IsleSpec } from "./spec";

/**
 * 表紙の島（＝いま歩いている島）。
 *
 * ## なぜ、章が変わっても入口が消えないのか
 *
 * 表紙は日付で章の島に入れ替わる（`components/isle/Cover.tsx`）。
 * その入れ替えを `nordicSpec` でやっていたころ、**入れ替わった瞬間に
 * あやとのこと・配信・アプリ・歩いた国・作った料理・住んでる人への入口が、
 * 表紙の島から全部消えていた。**
 *
 * あやとの言葉:「例えば配信とか、歩いた国、あやとのこと、アプリ、企画を出す、
 * これからとかっていうのは、**次の島でもデフォルトの島には常に引き継がないと、
 * 新しく入ってきた人からすると困りますよね。**」
 *
 * だから表紙の島は、**いつでも常設の入口ぜんぶ＋その旅のこと**で建てる。
 * 章が増えても、ここは1文字も変わらない。
 *
 * ## 常設の入口を、ここに書き写さない
 *
 * 出どころは `components/island/layout.ts` の `PLACES` ひとつ。
 * 名前も絵も行き先も看板の6つも、あちらが決める。写すと、あちらを直したときに
 * **表紙だけ古くなる**（`docs/island-misses.md` 決めごと3）。
 */
const HOME_PLACES: IslePlaceSpec[] = PLACES.map((p) => ({
  id: p.id,
  label: p.label,
  blurb: p.blurb,
  icon: p.icon,
  size: p.size,
  href: p.href,
  ...(p.sign ? { sign: true as const } : {}),
}));

/**
 * 表紙の島の大きさ。**日数からは出さない。**
 *
 * `isleRadius` は「何日いたか」で島を大きくする式で、`/atlas` の連なりで
 * 島どうしを比べるために決めた値（`docs/island-atlas.md` 3章）。
 * 表紙の島に当てると、出発した日の北欧は1日ぶんの島になり、
 * 常設の10軒が重なって建つ。**式が正しくても、当てる先を間違えれば絵は壊れる**
 * （`docs/island-standards.md` 12）。
 *
 * ここが決めているのは「常設の10軒＋その旅のことが、重ならずに一周する広さ」。
 * いちばん大きい章の島（コーカサス 434）と同じくらいで、比べ合いは
 * `/atlas` の航路の丸が持っている。
 */
const COVER_R = 410;

/** その旅そのものの入口。島に建つのは1軒で、中身は章によって変わる */
function tripPlace(c: Chapter, days: number): IslePlaceSpec {
  /* 北欧は、旅の面（`/nordic`）がもうそろっている。**島の中に作り直さない。**
     しおりも国もあちらにあるので、板からはそこへ送る */
  if (c.slug === "nordic") {
    return {
      id: "trip",
      label: "この旅のこと",
      blurb: `${NORDIC_COUNTRIES.length}カ国、${days}日`,
      icon: "tent",
      size: 62,
      note: "ポーランドから入って、ストックホルムまで。",
      items: [
        { label: "旅のしおり", sub: "持ち物と、当日の動き", href: "/nordic/guide", icon: "stall" },
        ...NORDIC_COUNTRIES.map((k) => ({
          label: k.name,
          sub: k.catch,
          href: `/nordic/${k.slug}`,
        })),
      ],
      more: { label: "この旅のこと", sub: "なぜ北欧まで行くのか", href: "/nordic" },
    };
  }
  /* 旅の面を持たない章。**行き先を作らない。**
     数字だけを板に出して、そこから先は常設の入口に任せる */
  const st = CHAPTER_STATS[c.slug];
  const countries = c.countries.length;
  return {
    id: "trip",
    label: "この島のこと",
    blurb: `${days.toLocaleString()}日目`,
    icon: "statue",
    size: 54,
    note: c.note,
    facts: [
      { n: String(days), unit: "日", cap: "この島にいる" },
      ...(st ? [{ n: String(st.streams), unit: "本", cap: "配信した" }] : []),
      ...(st ? [{ n: st.people.toLocaleString(), unit: "人", cap: "来てくれた" }] : []),
      ...(countries ? [{ n: String(countries), unit: "カ国", cap: "歩いた" }] : []),
    ],
  };
}

/**
 * 表紙の島をひとつ組む。**章が何であっても、常設の入口は全部建つ。**
 *
 * となりの島は渡さない（`app/page.tsx` の注）。船着き場からは島の地図へ出る。
 */
export function coverSpec(c: Chapter, today = new Date()): IsleSpec {
  const art = artOf(
    c.slug,
    c.countries
      .map((s) => COUNTRIES.find((x) => x.slug === s)?.region)
      .filter((x) => Boolean(x)) as string[],
  );
  const days = chapterDays(c, today);
  const st = CHAPTER_STATS[c.slug];
  return {
    slug: c.slug,
    name: c.name,
    note: c.note,
    days,
    radius: COVER_R,
    from: c.from,
    to: c.to,
    theme: art.theme,
    /* **旅のことが先頭。** 島に建つ順（＝島を一周する並び）がここで決まる。
       降り立つ場所は舟からいちばん近い建物のそばなので
       （`components/isle/world.ts`）、そこが旅のことになるとは限らない。 */
    /* **船着き場に看板は出さない。** 引きに札を出せるのは6つまでで
       （`docs/island-design.md` 6章、`island-atlas.md` 4章）、常設の6つで
       ちょうど埋まっている。ここに7枚目を足していたので、引きの島に
       札が7枚並んでいた。船着き場は黙って建っていて、押せば渡れる。
       島の連なりへは、島の隅の「島の地図」からも行ける（`.isle-atlas`）ので
       袋小路にはならない。**章の島（`/island/<章>`）はそのまま**——
       あちらは建つものが少なく、船着き場が出口の名前を持っている。 */
    places: [tripPlace(c, days), ...HOME_PLACES, { ...pier(), sign: undefined }],
    /* 住人。その章の顔ぶれがまだ数えられていない島（出発したばかりの島）は、
       いまの島の顔ぶれをそのまま立たせる。**表紙に誰もいない日を作らない。** */
    folk:
      st?.residents.length
        ? st.residents
        : RESIDENTS.filter((r) => r.icon).map((r) => ({ icon: r.icon!, days: r.days })),
    art,
  };
}
