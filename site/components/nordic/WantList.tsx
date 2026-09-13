"use client";

import FarMark from "@/components/nordic/FarMark";
import Longer from "@/components/ui/Longer";
import Wrote from "@/components/ui/Wrote";

/**
 * 「この街で見たいもの」の一覧。
 *
 * ## 1行が全部持つ。**同じものを2回並べない**
 *
 * ここは前まで、すぐ上の地図が**番号つきの札**を種類ごとに並べていて、その
 * 真下にこの一覧が写真つきで同じ見どころをもう一度出していた。ワルシャワは
 * まったく同じ5件が上下で2回出ていた。**中身が同じで、見た目だけ違うもの。**
 *
 * 1行が「番号・写真・種類・題・ひとこと」を全部持てるなら、2つに分ける理由が
 * ない。番号は地図の点と結ぶために要るので、**番号だけを行の中へ引き取った**
 * （`CityMap` の `cityKeys`）。押すとその点が光る（CSS の `:target`。
 * JavaScript は足していない）。
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
  /** 地図の点の番号。地図に載っているものだけ持つ */
  n?: number;
  /** その点への行き先。押すと点が光る（`:target`） */
  href?: string;
  /** 地図の窓に入らなかったもの。街の中心からの向きと距離 */
  far?: { km: number; dir: string; deg: number };
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
  /* **地図に番号を打ったものは、畳みの向こうへ入れない。**
     地図は点を15個見せているのに一覧が5行だと、残り10個は
     「押しても名前が分からない番号」になる。**面が約束したぶんは、面が出す。**
     場所を持たないもの（郷土料理・ミトン・気球）だけを畳みの向こうへ回す。
     番号も方角も無いものは 5件までにして、それより手前で切らない。 */
  const pinned = items.filter((s) => s.n != null || s.far).length;
  const first = Math.max(5, pinned);
  return (
    <Longer items={items} first={first} step={5} unit="件" className="ndsps">
      {(s: WantItem) => (
        <li key={s.key} className={`ndsp${s.want ? " is-want" : ""}`}>
          {(s.img || s.n != null || s.far) && (
            <span className="ndsp-fig">
              {s.img ? (
                <img className="ndsp-th" src={s.img} alt="" loading="lazy" referrerPolicy="no-referrer" />
              ) : (
                <span className="ndsp-th" aria-hidden="true" />
              )}
              {/* 番号。**地図の点と同じ形**（紙の地・種類の色の輪・墨の数字）で
                  出して、押すとその点が光る。押せるので厚みを持たせる
                  （`island-design.md` 3章3）。当たり判定は 48px まで
                  `::after` で広げてある */}
              {s.n != null && s.href && (
                <a
                  className={`ndsp-n cm-${s.cat}`}
                  href={s.href}
                  aria-label={`地図の${s.n}番を見る`}
                >
                  {s.n}
                </a>
              )}
              {/* 窓の外にあるもの。**押しても行き先が無いので平らにする** */}
              {s.far && <FarMark deg={s.far.deg} className={`ndsp-ar cm-${s.cat}`} />}
            </span>
          )}
          <span className="ndsp-b">
            <span className="ndsp-h">
              <span className="ndsp-cat">{CAT[s.cat] ?? "見る"}</span>
              <b>{s.title}</b>
            </span>
            {s.point && <i>{s.point}</i>}
            {/* 地図に載らないものは、**どっちへどれだけ行くか**を必ず添える。
                消さずに出す（旅程には入っている）。 */}
            {s.far && (
              <em className="ndsp-out">
                街の中心から{s.far.dir}へ{s.far.km}km
              </em>
            )}
            {s.want && (
              <em className="ndsp-by">
                これは {s.by ? `${s.by} さん` : "島の誰か"} が教えてくれたもの
              </em>
            )}
            {/* **書いてくれたまま出す。** 箇条書きを1本の棒にすると、行の終わりと
                次の行の頭がくっついて別の語に読める（#83） */}
            <Wrote t={s.say} className="ndsp-say" />
            {s.reply && (
              <span className="ndsp-reply">
                <b>あやと</b>
                <Wrote t={s.reply} as="q" />
              </span>
            )}
          </span>
        </li>
      )}
    </Longer>
  );
}
