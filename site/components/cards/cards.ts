"use client";

import { useEffect, useState } from "react";
import { getCards, type IslandCard } from "@/lib/api";
import { RESIDENTS } from "@/content/residents";

/**
 * あやと島カード（#173）の、画面まわりの共通のところ。
 *
 * カードは**配られていない。** サーバーが、その日の写真とその日の名簿から
 * 引くたびに組み立てている（`functions/src/cards.ts` 冒頭）。
 * こちら側でやるのは3つだけ。
 *
 *   1. どの絵の人かを突き合わせる（絵の割り当ては residents.ts だけが持つ）
 *   2. その日の企画を日付で引く（表は面が渡してくる。`content/plans.ts`）
 *   3. 4か所（`/cards`・`/about`・`/friends`・`/me`）で同じ形に出す
 */

/** キャラクターの絵は Google ドライブに置いてある。s の後ろが取り出す大きさ。 */
export const cardIcon = (id: string, size: number) =>
  `https://lh3.googleusercontent.com/d/${id}=s${size}`;

/** 面（server）から渡ってくる、その日の企画。`content/plans.ts` の表。 */
export type PlanBrief = { title: string; href: string };
export type PlanDays = Record<string, PlanBrief>;

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
      // 形の違うものが返っても面ごと落とさない（`PhotoWall` と同じ用心）
      .then((r) => setCards(withIcons(r?.cards ?? [])))
      .catch(() => {
        setCards([]);
        setOff(true);
      });
  }, []);
  return { cards, off };
}

/** 「2026-09-06」→「9月6日(日)」。島の中の日付の言い方にそろえる。 */
export function cardWhen(iso: string): string {
  const w = "日月火水木金土"[new Date(`${iso}T00:00:00Z`).getUTCDay()] ?? "";
  return `${Number(iso.slice(5, 7))}月${Number(iso.slice(8, 10))}日(${w})`;
}
