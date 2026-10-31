"use client";

import { useMemo, useState } from "react";
import Icon from "@/components/ui/IconCore";
import DayPanel from "./DayPanel";
import { type DayShelf, type PhotoGroup, type PlanDays } from "./cards";

/**
 * カレンダーで選ぶ。**並び（`CardWall`）を消さずに足した、もう1つの見かた。**
 *
 * あやと（2026-10-13）:
 *
 * > あやと島カードはカレンダーから選べることもできたらもっと見やすいかも？
 *
 * 「**も**」なので、いままでの並びはそのまま。切り替えは札2枚で、
 * いまどちらで見ているかは押し込まれた札で分かる。
 *
 * ## カードの無い日を、どう見せるか
 *
 * **数字だけの、まったく平らなマス。** 枠も地も影も付けない。
 * 島の決まりは「押せるものには厚みがある。押せないものは完全に平ら」で、
 * **一面ぜんぶ押せるときだけ厚みを省いてよい**（`docs/island-design.md`
 * 3章の3）。カレンダーは押せる日と押せない日が必ず混ざるので、
 * その例外は使えない。**写真のある日は厚みのある札、無い日は字だけ。**
 *
 * 無い日に「カードがありません」とは書かない。読む人がこれからすることが
 * 1つも増えない字なので（`docs/island-standards.md` 6章）。
 *
 * ## 月の送り
 *
 * **カードのある月だけを行き来する。** 配信は 2024-10-28 からで、
 * 写真の貼られていない月は飛ばす——空の月を1枚ずつ送らせると、
 * 「次へ」を5回押して何も出ない、が起きる。
 */
export default function CardMonth({
  days,
  plans,
  onOpen,
}: {
  /** 新しい順の日。**並べ替えない**（`cards.ts` の `byDay`） */
  days: DayShelf[];
  plans: PlanDays;
  onOpen: (g: PhotoGroup) => void;
}) {
  /** カードのある月。新しい順の「2026-10」 */
  const months = useMemo(() => {
    const out: string[] = [];
    for (const d of days) {
      const m = d.day.slice(0, 7);
      if (!out.includes(m)) out.push(m);
    }
    return out;
  }, [days]);
  /** いま見ている月（`months` の何番目か）。0 がいちばん新しい */
  const [at, setAt] = useState(0);
  /** 開いている日。**その月でいちばん新しい日**から始める */
  const [pick, setPick] = useState<string | null>(null);

  const month = months[Math.min(at, months.length - 1)] ?? "";
  /** その月の、日ごとの棚 */
  const inMonth = useMemo(
    () => days.filter((d) => d.day.startsWith(month)),
    [days, month],
  );
  const shelf = useMemo(() => {
    const m = new Map<string, DayShelf>();
    for (const d of inMonth) m.set(d.day, d);
    return m;
  }, [inMonth]);
  /** 開く日。押していなければ、その月のいちばん新しい日 */
  const open = (pick && shelf.has(pick) ? pick : inMonth[0]?.day) ?? null;

  /** マスの並び。頭の空きは、その月の1日が何曜日か */
  const cells = useMemo(() => {
    if (!month) return [];
    const y = Number(month.slice(0, 4));
    const mm = Number(month.slice(5, 7));
    const first = new Date(Date.UTC(y, mm - 1, 1)).getUTCDay();
    const last = new Date(Date.UTC(y, mm, 0)).getUTCDate();
    const out: (string | null)[] = Array.from({ length: first }, () => null);
    for (let d = 1; d <= last; d++) {
      out.push(`${month}-${String(d).padStart(2, "0")}`);
    }
    return out;
  }, [month]);

  if (!months.length) return null;

  const 年 = Number(month.slice(0, 4));
  const 月 = Number(month.slice(5, 7));

  return (
    <>
      <section className="panel paper akd-cal">
        {/* **題は「カレンダー」で、月は下の段の真ん中。**
            前は題が「2026年10月」で、下の段には送りの札が片方だけ
            ぽつんと乗っていた。390px で**紙の上から曜日の行まで 109px**、
            その 48px が「札1枚と、あとは地」だった（実測）。
            月をその段の真ん中に置くと、段が仕事をする——
            **左に来た月・いまの月・右に行く月**が1行で読める。 */}
        <h2>カレンダー</h2>
        {/* 月の送り。**カードのある月だけ**なので、端では札を出さない
            （押せない札を置かない。`docs/island-design.md` 3章の3）。
            札が片方しか無くても、空の `<span>` で真ん中を保つ。 */}
        <div className="akd-cal-nav">
          {at < months.length - 1 ? (
            <button
              type="button"
              className="akd-cal-go"
              onClick={() => {
                setAt(at + 1);
                setPick(null);
              }}
            >
              <Icon name="left" size={14} />
              {Number(months[at + 1].slice(5, 7))}月
            </button>
          ) : (
            <span />
          )}
          <b className="akd-cal-now">
            {年}年{月}月
          </b>
          {at > 0 ? (
            <button
              type="button"
              className="akd-cal-go is-next"
              onClick={() => {
                setAt(at - 1);
                setPick(null);
              }}
            >
              {Number(months[at - 1].slice(5, 7))}月
              <Icon name="right" size={14} />
            </button>
          ) : (
            <span />
          )}
        </div>
        <div className="akd-cal-grid" role="group" aria-label={`${年}年${月}月のカード`}>
          {"日月火水木金土".split("").map((w) => (
            <b className="akd-cal-w" key={w} aria-hidden>
              {w}
            </b>
          ))}
          {cells.map((iso, i) => {
            if (!iso) return <span className="akd-cal-pad" key={`pad${i}`} aria-hidden />;
            const d = shelf.get(iso);
            const n = Number(iso.slice(8, 10));
            if (!d) {
              /* カードの無い日。**完全に平ら**（上の注） */
              return (
                <span className="akd-cal-day" key={iso}>
                  {n}
                </span>
              );
            }
            return (
              <button
                type="button"
                key={iso}
                className={`akd-cal-day is-has${open === iso ? " is-on" : ""}`}
                aria-pressed={open === iso}
                aria-label={`${月}月${n}日の写真 ${d.photos.length}枚`}
                onClick={() => setPick(iso)}
              >
                <img src={d.photos[0].url} alt="" loading="lazy" crossOrigin="anonymous" />
                <i>{n}</i>
              </button>
            );
          })}
        </div>
      </section>
      {/* 押した日の紙。**並びと同じ紙**（`DayPanel`）なので、押したあとの
          道は1本のまま */}
      {open && shelf.get(open) && (
        <DayPanel day={shelf.get(open)!} plans={plans[open]} onOpen={onOpen} />
      )}
    </>
  );
}
