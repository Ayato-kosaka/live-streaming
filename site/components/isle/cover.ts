import { CHAPTER_STATS } from "@/content/chapterStats";
import { chapterDays, type Chapter } from "@/content/chapters";
import { COUNTRIES } from "@/content/countries";
import { NORDIC_COUNTRIES } from "@/content/nordic";
import { RESIDENTS } from "@/content/residents";
import { artOf } from "@/components/chain/shapes";
import { PLACES } from "@/components/island/layout";
/* 「あと◯日」の日を引くためだけ。**`content/plans.ts` の `nextPlan()` は
   読まない**——あちらは先の予定が0件になると行ってきた企画を返すので、
   島が過ぎた日からシールを数えることになる（`lib/leadPlan.ts` の注・#673）。 */
import { leadPlan } from "@/lib/leadPlan";
import { pier } from "./pier";
import { chapterCountries } from "@/content/walked";
/* **値を2つだけ借りる。** どちらも `content/` しか読まない小さいもので、
   表紙の束に配信の一覧や伝説が付いてくることはない（`spec.ts` の `nordicSpec`
   の注と同じ心配をしたが、ここは島を組む側＝サーバだけが通る道。
   `Cover.tsx`（"use client"）が読むのは型だけ）。 */
import { GUIDE_BLURB, GUIDE_LABEL, guideOf, type IslePlaceSpec, type IsleSpec } from "./spec";

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
 * 「あと◯日」のシールを貼る入口と、その日。
 *
 * `components/island/layout.ts` は「これから」のテントに `countdown: true` と
 * 書いているのに、上の写しがその欄を落としていた。**島に1枚だけ出してよい
 * シール**（`docs/island-design.md` 3-4「あと◯日」）が、表紙の島には
 * 1度も出ていなかった——手で作った島にも、章が入れ替わった島にも。
 *
 * **渡すのは日付だけ。** 数えるのは画面が出てから（`IsleStage` の `left` が
 * 1分ごとに数え直す）。日数を焼くと、配った日の数で止まる。
 *
 * **日本時間の0時**にそろえる。日付だけ（`2026-10-31`）を渡すと UTC の0時＝
 * 9時 JST になり、その日の朝9時まで「あと1日」と出る（`/next` の
 * `daysUntil` は JST の暦日で切っている。`content/plans.ts`）。
 *
 * 近い予定が無ければ欄ごと落とす。`IsleStage` は過ぎた日のシールを出さないが、
 * **出すものが無い日に空の欄を渡さない**ほうが、読む側の分岐が1つ減る。
 */
function withCountdown(today: Date): IslePlaceSpec[] {
  const day = leadPlan(today)?.date;
  if (!day) return HOME_PLACES;
  const at = `${day}T00:00:00+09:00`;
  return HOME_PLACES.map((p) =>
    PLACES.find((x) => x.id === p.id)?.countdown ? { ...p, countdown: at } : p,
  );
}

/**
 * 表紙の島の大きさ。**日数からは出さない。**
 *
 * `isleRadius` は「何日いたか」で島を大きくする式で、`/atlas` の連なりで
 * 島どうしを比べるために決めた値（`docs/island-atlas.md` 3章）。
 * 表紙の島に当てると、出発した日の北欧は1日ぶんの島になり、
 * 常設の10軒が重なって建つ。**式が正しくても、当てる先を間違えれば絵は壊れる**
 * （`docs/island-standards.md` 12）。
 *
 * ここが決めているのは「建つものが、重ならずに一周する広さ」。
 * いちばん大きい章の島（コーカサス 434）と同じくらいで、比べ合いは
 * `/atlas` の航路の丸が持っている。
 *
 * **ここに14軒目を建てない。** いまいる国の案内を1軒足したら、寄りで
 * **入口3つが届かなくなった**（`tools/sprites/islereach.mjs` で 11/11 → 7/10）。
 * かたちを3通り、広さを 410 / 426 / 470 と試しても戻らない——
 * **13軒ぶんに詰めてある島**なので、軒数そのものが効いている。
 * だから国の案内は建物を増やさず、「この島のこと」の板の中に入れた（`tripPlace`）。
 */
const COVER_R = 410;

/** その旅そのものの入口。中身は章によって変わる */
function tripPlace(c: Chapter, days: number, today: Date): IslePlaceSpec {
  /* 北欧は、旅の面（`/nordic`）がもうそろっている。**島の中に作り直さない。**
     しおりも国もあちらにあるので、板からはそこへ送る */
  if (c.slug === "nordic") {
    return {
      id: "trip",
      label: "この旅のこと",
      /* **日数をここで数えない。** ここは `chapterDays` で「何日目か」を出して
         いて、章の島（`spec.ts` の `nordicSpec`）は焼いた見立て（17日）を
         出していた。**同じ名前・同じ絵の札が、面によって違う数を言っていた。**
         出どころを揃える——見立て（`plannedDays`）を両方が直に読む。
         何日目かは、下の「この島のこと」の札が持っている。 */
      blurb: `${NORDIC_COUNTRIES.length}カ国、${c.plannedDays ?? 0}日`,
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
      /* 「なぜ北欧まで行くのか」と書いてあった。**帰ってきたあとも
         出しっぱなしになる字**なので、時点を言わない形にする */
      more: { label: "この旅のこと", sub: "なぜ北欧なのか", href: "/nordic" },
    };
  }
  /* **アルバニアの風船は、ここには建てない**（2026-10-11）。
     あやとの言葉（2026-09-27）:

     > 島に対する風船みたいな感じで、アルバニアでやってほしいこととか、
     > 今後やってほしいことみたいな付箋の貼り場所を作ってほしい

     この「貼り場所」は、表紙では**常設の「やってほしいこと」**が持っている
     （`components/island/layout.ts` の `board`。行き先も `/board` で同じ）。
     旅あての風船をその隣に建てていたあいだ、表紙には**同じ用事の入口が2つ**
     並んでいた。あやとが 2026-10-11 にアルバニアあての宛先を畳んでからは、
     そのうち片方（風船）だけが「やってほしいことを貼る」と言い続けて、
     **押した先で貼れない**状態になっていた。

     旅あての付箋そのものは、章の島（`/island/albania`）の板で読める
     （`components/isle/spec.ts` の `albaniaSpec`）。表紙の旅の札は、
     下の「この島のこと」——いま何日目で、何本配信して、何人来てくれたか——に戻す。
     **それが、旅ごとに字を書き足さずに済む唯一の形。** */
  /* 旅の面を持たない章。**行き先を作らない。**
     数字を板に出して、そこから先は常設の入口に任せる。

     **いまいる国の案内（`/north-macedonia`）だけは、ここに入れる。**
     島に1軒足したかったが、表紙の島は13軒ぶんに詰めてあるので、
     14軒目を建てると寄りで入口が3つ届かなくなった（`COVER_R` の注）。
     行き先を減らさずに軒数を増やさない形が、この板の中。
     **字は表から作る**（`spec.ts` の `GUIDES`）——ここに国の名前を書かない。 */
  const st = CHAPTER_STATS[c.slug];
  /* **歩いている最中の国も数える**（`content/walked.ts` の `chapterCountries`）。
     章の `countries` は歩き終わってからしか埋まらない。 */
  const countries = chapterCountries(c, today).length;
  const g = guideOf(c.slug);
  return {
    id: "trip",
    label: "この島のこと",
    /* **数は焼かない。** 字にしてから渡すと、表紙の札がデプロイした日の数で
       止まる（`since` と `ChapDays.tsx`）。表紙は島がまるごとブラウザへ渡る
       ので、`blurb` が焼いた字のまま配られていた。 */
    blurb: `${days.toLocaleString()}日目`,
    since: { chapter: c.slug, tail: "日目" },
    icon: "statue",
    size: 54,
    note: c.note,
    facts: [
      { n: String(days), unit: "日", cap: "この島にいる", since: c.slug },
      ...(st ? [{ n: String(st.streams), unit: "本", cap: "配信した" }] : []),
      ...(st ? [{ n: st.people.toLocaleString(), unit: "人", cap: "来てくれた" }] : []),
      ...(countries ? [{ n: String(countries), unit: "カ国", cap: "歩いた" }] : []),
    ],
    ...(g ?
      {
        items: [
          { label: GUIDE_LABEL, sub: GUIDE_BLURB, href: g.href, icon: "stall-green" },
        ],
      } :
      {}),
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
    /* **島に建てるものは増やさない**（`COVER_R` の注）。いまいる国の案内は
       「この島のこと」の板の中（`tripPlace`）。 */
    places: [tripPlace(c, days, today), ...withCountdown(today), { ...pier(), sign: undefined }],
    /* 住人。その章の顔ぶれがまだ数えられていない島（出発したばかりの島）は、
       いまの島の顔ぶれをそのまま立たせる。**表紙に誰もいない日を作らない。**

       名簿からは `score`（島に出るえらばれやすさ）も一緒に渡す。
       ここで落とすと、表紙だけが出席日数しか見ない島になる——
       投げ銭の額を足した意味が、いちばん人の目に触れる面から消える。

       受け取りを広く書いてあるのは、**`residents.ts` にまだ `score` の列が
       無いから**（毎晩の焼き直しが次に回ったときに入る。
       `python/build_residents.py`）。入るまでのあいだは undefined が渡り、
       選ぶほうは出席の順位だけで点を付ける。 */
    folk:
      st?.residents.length
        ? st.residents
        : RESIDENTS.filter((r) => r.icon).map(
            (r: { icon?: string; days: number; score?: number }) =>
              ({ icon: r.icon!, days: r.days, score: r.score }),
          ),
    art,
  };
}
