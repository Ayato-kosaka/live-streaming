import { PROJECTS, type Project } from "./projects";

/*
 * **下書きの企画と、下書きまで読む口**（M-33・`docs/adr/0018-upcoming-project-page.md`）。
 *
 * 企画の表（`content/projects.ts`）は、掲示板やお題の棚（client）の束にも入る。下書きの行をあちらに置くと、
 * 出す前の企画の名前が島じゅうの面の JS に乗る。だから下書きの行と、それを読む口は、ここ（面の名簿と面だけが読む。client から読まない）に置く。
 */

/**
 * **下書きの企画**（下書きの印 `draft: true` を持つ行だけ。M-33・`docs/adr/0018-upcoming-project-page.md`）。
 *
 * 面は在るが、島のどこからも引かない。**引く所ごとに印を見ない**——島じゅうの読み手（TS の面も、字で読む見張りも）は
 * `content/projects.ts` の `PROJECTS` を読むので、行をこちらに置くだけで、どこにも出ない。下書きまで読むのは面の名簿（`lib/pages.ts`）と面だけ
 * （`PROJECT_ROWS`・`BOOK_PROJECTS`）。
 *
 * **出す日**: 行の `draft: true` を消して、行ごと `content/projects.ts` の `PROJECTS` へ移す（印を消してここに残すと、下の確かめが止める）。
 * 結ぶ旅・滞在・お題の行も、その日に足す。見張りは `site/selftest/draftproject_selftest.mjs`（移すと出ることまで対照で見る）
 */
export const DRAFT_PROJECTS: Project[] = [
  /* インド屋台飯100食（#1404。企画書は本文・2026-11-23 にあやとが承認）。**始まる前から面を持つ**（面の印。M-8）。
     「まだ動線をつなげるのは待ってほしい」（あやと 2026-11-23）ので下書き（M-33）。日付はムンバイに入る日の見立て（「ごろ」）。
     旅（インド・スリランカ）と滞在の行・付箋の宛先（お題）は、あやとの「繋いでいい」で印を外す日に足す */
  {
    slug: "india-street-food",
    title: "インド屋台飯100食、食べるまで出られません",
    date: "2027-01-15",
    book: true,
    draft: true,
  },
];

/** 企画の表の行ぜんぶ（**下書きも入る**）。読むのは面の名簿と、面の印の付いた企画の面だけ */
export const PROJECT_ROWS: Project[] = [...PROJECTS, ...DRAFT_PROJECTS];

/** 面の印の付いた企画（**下書きも入る**）。`/legends/<企画>` に面が建つ（M-8） */
export const BOOK_PROJECTS: Project[] = PROJECT_ROWS.filter((p) => p.book);

/* 印の組み合わせを確かめる。読み込んだときに1回 */
for (const p of PROJECTS) {
  if (p.draft) throw new Error(`content/projects.ts: 企画 "${p.slug}" は下書きの印を持つのに、島じゅうが読む PROJECTS に居る（content/projectDrafts.ts の DRAFT_PROJECTS へ）`);
}
for (const p of DRAFT_PROJECTS) {
  if (!p.draft) throw new Error(`content/projectDrafts.ts: 企画 "${p.slug}" は下書きの印が無いのに DRAFT_PROJECTS に居る（出すなら行ごと content/projects.ts の PROJECTS へ移す）`);
}
for (const p of PROJECT_ROWS) {
  /* 下書きは「面は在るが引かない」の意味（M-33）。面の無い企画に付けると、ただ消えるだけになる */
  if (p.draft && !p.book) throw new Error(`content/projectDrafts.ts: 企画 "${p.slug}" は下書きの印を持つのに、面の印（book）が無い`);
  /* 伝説の面（`app/legends/[slug]`）と、面の印の面（`app/legends/<企画>/page.tsx`）が同じ道を作る。
     伝説の印を付ける日に、面の側（`app/legends/<企画>/page.tsx` に伝説の節を足すか、[slug] から外す）を直す */
  if (p.book && p.legend) throw new Error(`content/projects.ts: 企画 "${p.slug}" は伝説の印と面の印を両方持つ（同じ道に面が2つ建つ）`);
}
