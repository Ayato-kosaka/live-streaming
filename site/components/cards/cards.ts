"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getCards,
  getNordicPhotos,
  type IslandCard,
  type NordicPhoto,
} from "@/lib/api";
import { RESIDENTS } from "@/content/residents";

/**
 * あやと島カード（#173）の、画面まわりの共通のところ。
 *
 * カードは**置いてある**（#202）。台帳（`islandTips`）に投げ銭が入った時点で
 * 相手が決まるので、`islandCards/{cardId}` に1枚ずつ作られている
 * （`functions/src/cards.ts` 冒頭）。こちら側でやるのは4つだけ。
 *
 *   1. どの絵の人かを突き合わせる（絵の割り当ては residents.ts だけが持つ）
 *   2. その日の企画を日付で引く（表は面が渡してくる。`content/plans.ts`）
 *   3. 同じ写真から出たカードを、写真1枚にまとめる（`byPhoto`）
 *   4. 4か所（`/cards`・`/about`・`/friends`・`/me`）で同じ形に出す
 */

/** キャラクターの絵は Google ドライブに置いてある。s の後ろが取り出す大きさ。 */
export const cardIcon = (id: string, size: number) =>
  `https://lh3.googleusercontent.com/d/${id}=s${size}`;

/** 面（server）から渡ってくる、その日の企画。`content/plans.ts` の表。 */
export type PlanBrief = { title: string; href: string };
export type PlanDays = Record<string, PlanBrief[]>;

/** 絵の決まったカード。**画面に出るのはこれだけ。** */
export type ShownCard = IslandCard & { icon: string };

/**
 * カードに、キャラクターの絵を結び付ける。
 *
 * **どの絵が誰のものかは、あやとの表だけが決める**（`content/residents.ts` の
 * `channel`）。サーバーは名簿の持っているチャンネルをそのまま返してくるので、
 * 絵はここで引く。ここで引く形にしておくと、絵の割り当てが2か所に散らない。
 *
 * Doneru の人（`python/admin/nordic_supporter.py` から手で入る人）は
 * チャンネルを持たないかわりに絵を直に持っているので、そちらを使う。
 *
 * **絵に結びつかない人のカードは出さない。** カードは「写真の上に
 * その人が立っている1枚」なので、立つ人がいなければ絵にならない。
 * 「あなたのキャラクターがありません」とは言わない（本人のせいではない）。
 */
export function withIcons(list: IslandCard[]): ShownCard[] {
  const byChannel = new Map<string, string>();
  RESIDENTS.forEach((r) => {
    if (r.icon && r.channel) byChannel.set(r.channel, r.icon);
  });
  const out: ShownCard[] = [];
  for (const c of list) {
    const icon = c.icon ?? (c.channelId ? byChannel.get(c.channelId) : null);
    if (!icon) continue;
    out.push({ ...c, icon });
  }
  return out;
}

/** 取りにいっている最中は `cards` が null。0枚と区別する。 */
export type CardsState = { cards: ShownCard[] | null; off: boolean };

/**
 * 配られたカードを取ってくる。**新しい順で返ってくるので、並べ直さない。**
 *
 * 読めなかったときは空にして `off` を立てる。読み込み中と、
 * 空っぽと、読めなかったを、同じ顔で出さないため
 * （`docs/island-design.md` 4章）。
 */
export function useCards(): CardsState {
  const [cards, setCards] = useState<ShownCard[] | null>(null);
  const [off, setOff] = useState(false);
  useEffect(() => {
    getCards()
      // 形の違うものが返っても、面ごと落とさない
      .then((r) => setCards(withIcons(r?.cards ?? [])))
      .catch(() => {
        setCards([]);
        setOff(true);
      });
  }, []);
  return { cards, off };
}

/* ---------------- 写真でまとめる ----------------
   **カードは「写真 × その日に投げてくれた人」で増える。** 写真が3枚あって
   10人いれば30枚になり、`/cards` には同じ写真が10枚ずつ並ぶ。
   あやとの言葉:「埋め込みキャラクターごと全部表示するのではなく、
   カード画像を列挙してタップしたらキャラクター埋め込み版が見れるように
   しないと、カード一覧画面が散らかる気がする」。

   一覧が持つのは**写真1枚につき1つ**。キャラクターの入った版は、
   押して開いた先に置く（図鑑と同じ「一覧と1枚を分ける」形。
   `docs/ac-reference.md` 7章）。 */

/** 同じ写真から出たカードを、ひとまとめにしたもの。**一覧のマス1つぶん。** */
export type PhotoGroup = {
  photoId: string;
  url: string;
  w: number;
  h: number;
  note: string;
  /** その写真の日。まとめる単位が写真なので、中の1枚ずつは持たない */
  day: string;
  /** 何人ぶんか。**絵に結びついた人だけ**が入る（`withIcons` を通ったもの） */
  cards: ShownCard[];
};

/** 1日ぶんの棚。1日に写真は何枚でも貼られる。 */
export type DayShelf = { day: string; photos: PhotoGroup[] };

/**
 * 写真でまとめる。**並べ替えない。**
 *
 * サーバーがもう新しい順で返してくる（`functions/src/cards.ts` の
 * `sortCards`）ので、出てきた順にまとめるだけにする。ここで並べ直すと、
 * 同じものを2か所で決めることになる。
 */
export function byPhoto(list: ShownCard[]): PhotoGroup[] {
  const out: PhotoGroup[] = [];
  const at = new Map<string, PhotoGroup>();
  for (const c of list) {
    const had = at.get(c.photoId);
    if (had) {
      had.cards.push(c);
      continue;
    }
    const g: PhotoGroup = {
      photoId: c.photoId,
      url: c.url,
      w: c.w,
      h: c.h,
      note: c.note,
      day: c.day,
      cards: [c],
    };
    at.set(c.photoId, g);
    out.push(g);
  }
  return out;
}

/**
 * 日ごとに棚を作る。**日付と企画を、そこで1回だけ言うため。**
 *
 * 前は1枚ずつが日付と企画を持っていた。同じ写真が人数ぶん並ぶと、
 * 「9月6日(日) / Food & Wine Fest @ ムタツミンダ公園」も人数ぶん出る。
 * まとめる単位ができたので、字は棚の見出しへ上げる。
 */
export function byDay(groups: PhotoGroup[]): DayShelf[] {
  const out: DayShelf[] = [];
  const at = new Map<string, DayShelf>();
  for (const g of groups) {
    const had = at.get(g.day);
    if (had) {
      had.photos.push(g);
      continue;
    }
    const d: DayShelf = { day: g.day, photos: [g] };
    at.set(g.day, d);
    out.push(d);
  }
  return out;
}

/** 「2026-09-06」→「9月6日(日)」。島の中の日付の言い方にそろえる。 */
export function cardWhen(iso: string): string {
  const w = "日月火水木金土"[new Date(`${iso}T00:00:00Z`).getUTCDay()] ?? "";
  return `${Number(iso.slice(5, 7))}月${Number(iso.slice(8, 10))}日(${w})`;
}


/* ---------------- 写真の側からまとめる ----------------
   **一覧に並ぶのは写真で、カードではない。** カードは「写真 × その日に
   投げてくれた人」なので、カードだけを見ていると**まだ誰も投げていない
   写真が1枚も出ない。** あやとが貼った直後がちょうどそれで、貼った本人が
   「入らなかった」と思う。

   だから写真の一覧（`GET /nordic/photos`）を土台にして、そこへカードを
   重ねる。写真がどれだけあるかは写真の口が、誰が立てるかはカードの口が
   決める。片方が読めなくても、もう片方のぶんは出る。 */

/** 写真1枚に、その写真に立てる人を重ねたもの。**一覧のマス1つぶん。** */
export type PhotoSheet = PhotoGroup & { at: number };

const sheetOf = (p: NordicPhoto): PhotoSheet => ({
  photoId: p.id,
  url: p.url,
  w: p.w,
  h: p.h,
  note: p.note,
  day: p.day,
  at: p.at,
  cards: [],
});

/**
 * 新しい順。**まず「その日」で、同じ日のなかは貼った順。**
 *
 * `at` だけで並べない。貼った時刻とその写真の日付は別のもので（旅の
 * 途中に前の日のぶんをまとめて貼る）、`at` で並べると**画面に出ている
 * 日付が飛ぶ。** 見出しになるのは日付なので、そちらを先に見る。
 */
const newest = (a: { day: string; at: number }, b: { day: string; at: number }) =>
  a.day === b.day ? b.at - a.at : a.day < b.day ? 1 : -1;

/**
 * 写真とカードを1つにまとめて、日ごとの棚にする。
 *
 * 写真の口が落ちてもカードだけで並ぶし、逆も同じ。どちらも空なら空の棚。
 */
export function shelves(
  photos: NordicPhoto[],
  cards: ShownCard[],
): DayShelf[] {
  const at = new Map<string, PhotoSheet>();
  const order: PhotoSheet[] = [];
  for (const p of photos) {
    const g = sheetOf(p);
    at.set(p.id, g);
    order.push(g);
  }
  for (const c of cards) {
    let g = at.get(c.photoId);
    if (!g) {
      // 写真の口が落ちていても、カードの持っている写真で並べられる
      g = { ...sheetOf({ ...c, id: c.photoId, at: c.at }), cards: [] };
      at.set(c.photoId, g);
      order.push(g);
    }
    g.cards.push(c);
  }
  order.sort(newest);
  const days = new Map<string, DayShelf>();
  const out: DayShelf[] = [];
  for (const g of order) {
    const had = days.get(g.day);
    if (had) {
      had.photos.push(g);
      continue;
    }
    const d: DayShelf = { day: g.day, photos: [g] };
    days.set(g.day, d);
    out.push(d);
  }
  return out;
}

/** 一覧が持つ状態。写真とカードを別々に取りにいって、ここで合わせる。 */
export type WallState = {
  /** 取りにいっている最中は null。0枚と区別する */
  days: DayShelf[] | null;
  /** 両方とも読めなかった。読み込み中・空っぽと同じ顔で出さない */
  off: boolean;
  /** 貼れた1枚を、取り直さずにその場で並べる（あやとだけ） */
  add: (p: NordicPhoto) => void;
};

export function useCardWall(): WallState {
  const [photos, setPhotos] = useState<NordicPhoto[] | null>(null);
  const [cards, setCards] = useState<ShownCard[] | null>(null);
  const [bad, setBad] = useState(0);

  useEffect(() => {
    getNordicPhotos()
      // 形の違うものが返っても面ごと落とさない
      .then((r) => setPhotos((r?.days ?? []).flatMap((d) => d.photos ?? [])))
      .catch(() => {
        setPhotos([]);
        setBad((n) => n + 1);
      });
    getCards()
      .then((r) => setCards(withIcons(r?.cards ?? [])))
      .catch(() => {
        setCards([]);
        setBad((n) => n + 1);
      });
  }, []);

  const add = useCallback(
    (p: NordicPhoto) => setPhotos((cur) => [p, ...(cur ?? [])]),
    [],
  );

  const days = useMemo(
    () => (photos && cards ? shelves(photos, cards) : null),
    [photos, cards],
  );
  return { days, off: bad >= 2, add };
}

/* ---------------- 立ち位置 ----------------
   **既定の置き方は、写真の右下ひとところに決め打つ。**

   もとは ID から少しずつ散らしていた（`defaultPlace`）。一覧に同じ写真の
   カードが人数ぶん並んでいたころ、全員が寸分たがわず同じ場所に立つと
   「同じ絵が人数ぶん」に見えたため。**一覧が写真1枚につき1マスになり、
   立っている人は開いた先で1人ずつ入れ替えるようになったので、散らす
   理由が消えた。** 残っていたのは害だけで、あやとの言葉（2026-09-10）:

   > たいpi のキャラクターが見切れてる。あと大きさも不揃い。

   散らした先が写真の右端を越えると絵が切れ、`scale` の 0.92〜1.08 が
   1人ずつ大きさの違うカードになっていた。

   **本人が動かしたもの（`moved`）だけは、その値で置く。** 動かせるのは
   本人だけで、動かしたことを黙って戻さない。そのときも枠から出さない。 */

/** 焼く1枚（`components/nordic/stamp.ts` の `STAMP`）と同じ寸法。 */
const BASE = { byWidth: 0.34, byHeight: 0.2, right: 0.02, bottom: 0.05 };

/** 画面に出すときの置き方。そのまま CSS に入る。 */
export type CardPlace = {
  /** 縦の写真は横幅、横の写真は高さ。もう片方の辺は絵の比に任せる */
  width?: string;
  height?: string;
  /** 既定の置き方は右端から測る。**絵の比を知らなくても枠から出ない** */
  right?: string;
  /** 本人が動かしたぶんだけ、左から測る（原点は絵の中心） */
  left?: string;
  bottom: string;
  transform: string;
};

/**
 * カード1枚の置き方を決める。**焼く1枚と同じところに立つようにする。**
 *
 * 絵の縦横比は読むまで分からないので、基準になる辺だけを決めて、もう片方は
 * 絵に任せる。既定は右端から測るので、比が何であっても枠から出ない。
 * 焼くほう（`stamp.ts` の `stampBox`）も右下から同じ寸法で置くので、
 * 画面に出ている絵と、持って帰る1枚が同じになる。
 */
export function cardPlace(card: ShownCard): CardPlace {
  const tall = card.h > card.w;
  const size = tall ? BASE.byWidth : BASE.byHeight;
  const side = tall ? { width: `${size * 100}%` } : { height: `${size * 100}%` };
  if (!card.moved) {
    return {
      ...side,
      right: `${BASE.right * 100}%`,
      bottom: `${BASE.bottom * 100}%`,
      transform: "none",
    };
  }
  /* 動かしたぶん。**枠から出さない。** 横の写真は高さで決めているので、
     横幅は写真の縦横比から見積もる（絵はおおむね正方形）。 */
  const k = Math.min(2, Math.max(0.4, card.scale || 1));
  const w = (tall ? size : (size * card.h) / Math.max(1, card.w)) * k;
  const half = Math.min(0.5, w / 2);
  const cx = Math.min(1 - half, Math.max(half, card.x));
  return {
    ...(tall ? { width: `${size * k * 100}%` } : { height: `${size * k * 100}%` }),
    left: `${cx * 100}%`,
    bottom: `${Math.min(0.9, Math.max(0, 1 - card.y)) * 100}%`,
    transform: `translateX(-50%) rotate(${Math.max(-20, Math.min(20, card.rot || 0))}deg)`,
  };
}
