/**
 * 島に建つ「掲示板」の字を、**宛先の表（`content/themes.ts`）から作る。**
 *
 * ## なぜ字を手で書かないのか
 *
 * 2026-10-11、あやとの指示で付箋の宛先「アルバニアでこれやって」と
 * 「北欧の旅」を畳んだ（`closed: true`）。畳んだ宛先は `/board` の
 * 「どこへ」から消える。ところが**島の板の字は手で書いてあった**ので、
 * 札は「アルバニアでこれやって／やってほしいことを貼る」、
 * 「ぜんぶ見る」は「島の掲示板へ・ここから貼れる」と言い続けた。
 *
 * **押して `/board` へ行っても、アルバニアあては選べない。**
 * 「ここから貼れる」と書いてある先で貼れない。赤くはならない——
 * 札は出るし、面も開くし、型も巡回も通る。**押しどころが嘘をついている**
 * だけ（`docs/island-design.md` 3-1 の親戚）。
 *
 * 旅が変わるたびに同じ形で壊れる。出どころが2つ（表の `closed` と、
 * 島に書いた字）あるかぎり、必ずいつか食い違う
 * （`docs/island-standards.md` 8章）。だから**島の側は字を持たない。**
 * 持つのは「どの旅の板か」だけで、誘うかどうかは表が決める。
 *
 * ## 焼き込みであること
 *
 * `/island/<章>` は静的に書き出されるので、ここで決まった字は**焼かれる。**
 * `closed` は人が手で立てる印なので、立てた日に焼き直せば直る
 * （毎晩 `rebake.yml` が回る）。日付で変わる判定（企画あて）は、
 * この板には入れていない——入れると、焼いた日の答えが残る。
 *
 * 見張りは `site/selftest/isleboard_selftest.mjs`。
 */

import { isOpenTheme, THEMES, type Theme } from "@/content/themes";

/** 板の中身。**1枚も無かったときの字まで、ここが持つ**（`IsleBoard.tsx`） */
export type IsleBoardSpec = {
  /**
   * この板がどの旅の板か。**字ではなく、字を作った材料。**
   *
   * 見張り（`site/selftest/isleboard_selftest.mjs`）はこの2つから
   * `boardPlate` をもう一度回して、**島に出ている字と1文字でも違えば落とす。**
   * 島の側で `label` や `more` を手で上書きしても、そこで捕まる。
   */
  name: string;
  group: string;
  /**
   * 棚に並べる見出し、ぜんぶ。**旅が国をまたぐと、宛先は1つではない。**
   *
   * バルカン諸国周遊はアルバニアと北マケドニアを1つの島にしたので
   * （`content/chapters.ts` の `balkans`）、島の板に出すのは**その旅に来た
   * 付箋ぜんぶ**。`group`（いま書ける先）だけで絞ると、**畳んだ国あての
   * 付箋が島から読めなくなる**——アルバニアあての5枚が実際にそうだった。
   */
  groups: string[];
  /** 板に並べる宛先。**読む側なので、畳んだものも入れる**（貼られた付箋は読める） */
  themes: Theme[];
  /**
   * **この板が、どこへ貼ることを誘っているか。**
   *
   *   `"here"` … この旅あてに、いま貼れる（札も添え書きも誘う）
   *   `"away"` … この旅あては畳んである。貼れるのは**ほかの宛先**だけ
   *   `"none"` … どこにも貼れる宛先が無い（誘いの字を1文字も出さない）
   *
   * 字と同じ枝で決まるので、**字だけが先に古くなることがない。**
   * 見張り（`site/selftest/isleboard_selftest.mjs`）は、この印が
   * **宛先の表といま合っているか**を数える——字を読んで当てにいかない。
   */
  aim: "here" | "away" | "none";
  /** 1枚も無かったときの字。**誘うのは、書ける宛先があるときだけ** */
  blank: { title: string; lead?: string; go?: { label: string; href: string } };
};

/** `IslePlaceSpec` にそのまま広げる、板の建物ぶん */
export type BoardPlate = {
  label: string;
  blurb: string;
  note?: string;
  board: IsleBoardSpec;
  more: { label: string; sub: string; href: string };
};

/** 書く場所。島じゅうの付箋が集まって、書く欄が開いている面はここ1つ */
const BOARD = "/board";

/**
 * その旅の板を1枚。
 *
 * @param name 旅の名前（「北マケドニア」「北欧」）。**島が名乗る字はこれだけ**
 * @param group 宛先の見出し（`content/themes.ts` の `*_GROUP`）。
 *   **誘うかどうかは、この見出しに書ける宛先が在るかで決まる**
 * @param also この旅の、ほかの国の見出し。**読むためだけに棚へ足す。**
 *   誘いの字はここからは作らない（畳んである国あてに「貼れる」と言わない）
 * @param now 画面が出てからの今。焼くときは渡さない（表と同じ決まり）
 */
export function boardPlate(o: {
  name: string;
  group: string;
  also?: string[];
  now?: Date | null;
}): BoardPlate {
  const now = o.now ?? null;
  /** この板が受け持つ見出し、ぜんぶ（いま書ける先が先頭） */
  const groups = [o.group, ...(o.also ?? []).filter((g) => g !== o.group)];
  /* 並べるのは**この旅あてだけ。** あやとの言葉:「北欧周遊島の掲示板には、
     北欧周遊関連だけ見れれば良い」。企画あてを混ぜていたころ、アルバニアの
     島に「ジョージアバイバイ」の付箋が並んでいた。
     **旅が国をまたぐぶんは混ぜる**（`groups`）——同じ島に来た付箋なので。 */
  const themes = THEMES.filter((t) => groups.includes(t.group));
  /** この旅あてに、いま書ける宛先。**ここだけが「誘ってよいか」を決める** */
  const here = themes.find((t) => isOpenTheme(t, now));
  /** 書ける宛先が、この旅の外にも在るか（`/board` へ送ってよいか） */
  const away = THEMES.some((t) => !groups.includes(t.group) && isOpenTheme(t, now));

  if (here) {
    return {
      label: `${o.name}でこれやって`,
      blurb: "やってほしいことを貼る",
      note: "行きたい場所も、やってほしいことも。",
      board: {
        name: o.name,
        group: o.group,
        groups,
        themes,
        aim: "here",
        blank: {
          title: `${o.name}あての付箋は、まだ1枚も無い`,
          lead: "行きたい場所も、やってほしいことも。いちばん乗りをどうぞ。",
          /* 書ける宛先がその話をしている面を持っていれば、そこへ送る。
             無ければ掲示板へ（`content/themes.ts` の `href`） */
          go: { label: "いちばんに貼る", href: here.href ?? BOARD },
        },
      },
      more: { label: "島の掲示板へ", sub: "ここから貼れる", href: BOARD },
    };
  }

  return {
    /* **誘わない。** この旅あての宛先は畳んである（`closed`）ので、
       札も添え書きも「読むところ」として名乗る */
    label: "この旅の掲示板",
    blurb: `${o.name}に来ている付箋`,
    board: {
      name: o.name,
      group: o.group,
      groups,
      themes,
      aim: away ? "away" : "none",
      blank: {
        title: `${o.name}あての付箋は、1枚も無い`,
        /* 空っぽで終わらせない。**次にすることを1つ**（`docs/island-design.md` 4章）。
           ただし書ける先が1つも無い日には、その1つも無い */
        ...(away ?
          {
            lead: "ほかの宛先には、いまも貼れるよ。",
            go: { label: "島の掲示板へ", href: BOARD },
          } :
          {}),
      },
    },
    more:
      away ?
        /* **「ここから貼れる」と言わない。** この旅あては畳んである。
           押した先で貼れるのは、ほかの宛先 */
        { label: "島の掲示板へ", sub: `${o.name}以外あての付箋も、ここから貼れる`, href: BOARD } :
        { label: "島の掲示板へ", sub: "島じゅうの付箋", href: BOARD },
  };
}
