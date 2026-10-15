"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE } from "@/lib/api";
import { withRead, type Read } from "@/lib/auth";
import { OTHER_GROUP, THEMES, type Theme } from "@/content/themes";

/**
 * 付箋の貼り先を1本にまとめる。
 *
 * ## なぜ要るのか
 *
 * 貼り先には出どころが2つある——**焼き込みの表**（`content/themes.ts`）と、
 * 机から足すぶん（`islandNoteThemes` / `GET /island-api/notes/themes`）。
 * 足す口は 2026-10-14 に入ったのに、**島のどこもその口を読んでいなかった。**
 * 机で足しても島には1枚も出ず、画面だけが「島じゅうに出ました」と言っていた。
 *
 * 出どころが2つあるなら、**重ねるところも1つ**にする。2か所で重ねると、
 * 片方だけが新しい規則で重なる日が来る（`docs/island-standards.md` 8章）。
 *
 * ## 重ねかた
 *
 * | | どうなるか |
 * | --- | --- |
 * | 同じ id が両方にある | 名前・一行・書く見本・締め切りは**足したぶんが勝つ** |
 * | 焼き込みにしか無い欄（`group` `href`） | 焼き込みのまま残す |
 * | 焼き込みに無い id | 新しい行として足す（見出しは「そのほか」） |
 * | **引けなかった** | **焼き込みだけを返す** |
 *
 * いちばん下の行がこの仕掛けの芯。`output: "export"` なので、焼いた HTML には
 * 焼き込みの貼り先が入っている。口が落ちている日に重ねようとして空を返すと、
 * **`/board` の貼り先がまるごと消える**——読めなかったことを、0件と同じ絵に
 * してはいけない（`docs/island-standards.md` §10）。
 */

/** 机から足したぶん1行（`GET /notes/themes` が返す形）。 */
export type AddedDest = {
  id: string;
  name: string;
  lead: string;
  placeholder: string;
  closed: boolean;
};

/** 焼き込みにもとから在る id。**ここに在るものは消せない。** */
const BAKED: ReadonlySet<string> = new Set(THEMES.map((t) => t.id));

/** その id は焼き込みにもとから在るか。 */
export const isBaked = (id: string): boolean => BAKED.has(id);

/** 焼き込みの1行を引く（重ねる前の、もとの字）。 */
export const bakedDest = (id: string): Theme | undefined =>
  THEMES.find((t) => t.id === id);

/** 一覧から id で1つ引く。知らない id は undefined。 */
export const destById = (list: Theme[], id: string): Theme | undefined =>
  list.find((t) => t.id === id);

/**
 * 足したぶんを口から引く。
 *
 * **`lib/api.ts` には置かない。** あそこは島じゅうが読む1本で、同じ日に
 * 何人も触っている。貼り先を読むのはこのファイルだけなので、ここに置く。
 */
export async function fetchDests(): Promise<AddedDest[]> {
  const r = await fetch(`${API_BASE}/notes/themes`, { cache: "no-store" });
  if (!r.ok) throw new Error(String(r.status));
  const j = (await r.json()) as { themes?: AddedDest[] };
  return Array.isArray(j.themes) ? j.themes : [];
}

/* 1枚の面に `Notes` がいくつも載ることがある（`/nordic/day/[n]` は区間ごとに
   1つずつ出す）。**部品ごとに引くと、同じ答えを何回も取りに行く。**
   読む先は島じゅうで1つなので、取りに行くのも1回にまとめる。 */
let cache: AddedDest[] | null = null;
let flight: Promise<AddedDest[]> | null = null;

/**
 * 足したぶんを読む。同じ画面の何人が呼んでも、往復は1回。
 *
 * @param fresh 取り直す（机で直した直後に使う）
 */
export function loadDests(fresh = false): Promise<AddedDest[]> {
  if (fresh) {
    cache = null;
    flight = null;
  }
  if (cache) return Promise.resolve(cache);
  if (!flight) {
    flight = fetchDests().then(
      (r) => {
        cache = r;
        flight = null;
        return r;
      },
      (e) => {
        flight = null;
        throw e;
      },
    );
  }
  return flight;
}

/**
 * 焼き込みに、足したぶんを重ねる。
 *
 * @param added 足したぶん。**読めていないときは null**（焼き込みをそのまま返す）
 */
export function mergeDests(added: AddedDest[] | null | undefined): Theme[] {
  if (!added?.length) return THEMES;
  const by = new Map(added.map((a) => [a.id, a]));
  const out = THEMES.map((t) => {
    const a = by.get(t.id);
    /* 焼き込みにしか無い欄（`group` `href`）は残す。足したぶんが持っているのは
       机から直せる4つだけで、島の道（`href`）は Git にしか無い。 */
    return a ?
      { ...t, name: a.name, lead: a.lead, placeholder: a.placeholder, closed: a.closed } :
      t;
  });
  for (const a of added) {
    if (BAKED.has(a.id)) continue;
    out.push({
      id: a.id,
      name: a.name,
      group: OTHER_GROUP,
      lead: a.lead,
      placeholder: a.placeholder,
      closed: a.closed,
    });
  }
  return out;
}

/**
 * 面が「この棚に並べる」と決めて渡してきた一覧に、足したぶんを重ねる。
 *
 * 渡された順と選びはそのまま。**焼き込みに無い行だけ**を末尾に足す
 * （焼き込みに在って渡されなかった行は、その面が外したものなので足さない）。
 */
export function overlayShelf(list: Theme[], all: Theme[]): Theme[] {
  const by = new Map(all.map((t) => [t.id, t]));
  const here = new Set(list.map((t) => t.id));
  const out = list.map((t) => by.get(t.id) ?? t);
  for (const t of all) if (!here.has(t.id) && !BAKED.has(t.id)) out.push(t);
  return out;
}

/**
 * 重ねた貼り先。**画面はこれを使う。**
 *
 * 焼き込みのぶんがすぐ出て、口の答えが来たところで重なる。読めなければ
 * 焼き込みのまま——**空にはならない。**
 */
export function useDests(): {
  /** 重ねた一覧 */
  dests: Theme[];
  /** 足したぶんだけ。読めていないあいだは null */
  added: AddedDest[] | null;
  /** 読めたか。**「読んでいる最中」と「読めなかった」を混ぜない** */
  read: Read;
  /** 取り直す */
  reload: () => void;
} {
  const [added, setAdded] = useState<AddedDest[] | null>(null);
  const [read, setRead] = useState<Read>("wait");
  const [again, setAgain] = useState(0);

  useEffect(() => {
    let gone = false;
    withRead(loadDests(again > 0)).then(
      (r) => {
        if (gone) return;
        setAdded(r);
        setRead("ok");
      },
      () => {
        if (gone) return;
        setRead("down");
      },
    );
    return () => {
      gone = true;
    };
  }, [again]);

  const dests = useMemo(() => mergeDests(added), [added]);
  const reload = useCallback(() => setAgain((n) => n + 1), []);
  return { dests, added, read, reload };
}
