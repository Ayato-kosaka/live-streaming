"use client";

import Longer from "@/components/ui/Longer";

/**
 * 「この街で見たいもの」の一覧。
 *
 * ## なぜ client なのか
 *
 * 中身は全部書き出しに焼いてある。client にしているのは畳み（`Longer`）だけで、
 * **溜まったときに縦へ伸びない形にするため**（`CLAUDE.md`・#225）。
 * ヴィリニュスは13件あって、そのうえ提案が4件付く。全部開いたまま置くと
 * 「この日の道」より下の紙が一枚で 1,600px を超える。
 *
 * ## 教えてくれた人を、その行に書く
 *
 * あやとの言葉（2026-09-09）:
 *
 * > 〇〇さんから提案されたものは「これは誰々さんが提案してくれたもの」みたいな
 * > 感じで書いてくれると嬉しいです。
 *
 * 別の区画にまとめない。**まとめると、どれが教えてもらったものか分からなくなる。**
 * 名前は行の中に置いて、提案されたものを一覧の上へ寄せる。
 *
 * 付箋の言葉とあやとの返事は、その付箋の1件目にだけ付ける。1枚で4か所を
 * 挙げてくれた付箋があるので、全部に付けると同じ文が4回並ぶ。
 */

export type WantItem = {
  key: string;
  cat: string;
  title: string;
  point?: string;
  img?: string;
  /** 付箋から来た行かどうか */
  want?: boolean;
  /** 教えてくれた人。付箋の `by`。空のままなら「島の誰か」と出す */
  by?: string;
  /** 付箋の言葉。その付箋の1件目にだけ入っている */
  say?: string;
  /** あやとの返事。同じく1件目にだけ */
  reply?: string;
};

/** 見どころの種類。印の字は `content/nordic.ts` の `CATS` と同じもの。 */
const CAT: Record<string, string> = { see: "見る", eat: "食べる", do: "やる", buy: "買う" };

export default function WantList({ items }: { items: WantItem[] }) {
  return (
    <Longer items={items} first={5} step={5} unit="件" className="ndsps">
      {(s: WantItem) => (
        <li key={s.key} className={`ndsp${s.want ? " is-want" : ""}`}>
          {s.img && (
            <img className="ndsp-th" src={s.img} alt="" loading="lazy" referrerPolicy="no-referrer" />
          )}
          <span className="ndsp-b">
            <span className="ndsp-h">
              <span className="ndsp-cat">{CAT[s.cat] ?? "見る"}</span>
              <b>{s.title}</b>
            </span>
            {s.point && <i>{s.point}</i>}
            {s.want && (
              <em className="ndsp-by">
                これは {s.by ? `${s.by} さん` : "島の誰か"} が教えてくれたもの
              </em>
            )}
            {s.say && <span className="ndsp-say">{s.say}</span>}
            {s.reply && (
              <span className="ndsp-reply">
                <b>あやと</b>
                <q>{s.reply}</q>
              </span>
            )}
          </span>
        </li>
      )}
    </Longer>
  );
}
