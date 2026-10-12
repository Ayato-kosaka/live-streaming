"use client";

import { useState, type CSSProperties } from "react";
import { CAL_SHOT_H, CAL_SHOT_W, CAL_SHOWN } from "@/content/goods";

/**
 * 卓上カレンダーの、**絵のできた月**を見せる。
 *
 * あやとの言葉（2026-10-12、#759）は `content/goods.ts` の `CalMonth` の頭に
 * 置いてある。暦の N月のページに、思い出の月のイラストが1枚載る。
 *
 * ## 月は札で切り替える。縦に積まない
 *
 * 1か月ぶんの絵は、390px で 1枚 300px 前後ある。12か月そろうと積んだだけで
 * 3,600px を越えて、下の LINEスタンプと SUZURI が画面の遠くへ行く
 * （`docs/island-standards.md` 7章「溜まっても背が変わらない形」）。
 * だから**札（`.mp-tabs` / `.mp-tab`。じぶんのことや掲示板と同じ札）**で
 * 同時に1か月だけ出す。札は**絵のある月ぶんだけ**——絵の無い月の札は置かない。
 *
 * 1か月しか無いときは札を出さない（選ぶものが無い札は、押しても何も変わらない）。
 * 0か月のときは、この部品は何も描かない（面のほうが1行だけ言う）。
 *
 * ## 候補が2〜3枚ある月
 *
 * 決まる前の月は、候補を並べて「A案」「B案」と名前を付ける。
 * 付箋で「5月はBがいい」と書けるように、呼び名だけ置く（押して選ぶ仕掛けは
 * もう無い。#759「押して教えてください。の話はもう要らない」）。
 */
export default function CalendarMonths() {
  const [at, setAt] = useState(0);
  if (CAL_SHOWN.length === 0) return null;
  const cur = CAL_SHOWN[Math.min(at, CAL_SHOWN.length - 1)];
  const many = cur.picks.length > 1;

  return (
    /* 絵より広い板にしない。**大きさの出どころは `content/goods.ts` の1本**で、
       ここにも CSS にも数を書かない（焼き直して寸法が変わった日に、
       止める幅だけ古くなる） */
    <div className="gd-cals" style={{ "--cal-w": `${CAL_SHOT_W}px` } as CSSProperties}>
      {CAL_SHOWN.length > 1 && (
        <div className="mp-tabs gd-calmonths" role="tablist" aria-label="カレンダーの月">
          {CAL_SHOWN.map((m, i) => (
            <button
              key={m.month}
              type="button"
              role="tab"
              id={`gd-calm-${m.month}`}
              aria-selected={i === at}
              aria-controls="gd-calpage"
              className={`mp-tab${i === at ? " is-on" : ""}`}
              onClick={() => setAt(i)}
            >
              <span className="mp-tab-l">{m.month}月</span>
            </button>
          ))}
        </div>
      )}
      <div
        className="gd-calpage"
        id="gd-calpage"
        role={CAL_SHOWN.length > 1 ? "tabpanel" : undefined}
        aria-labelledby={CAL_SHOWN.length > 1 ? `gd-calm-${cur.month}` : undefined}
      >
        <h3 className="gd-calh">
          <b>{cur.month}月</b>
          <small>
            {cur.memory.year}年{cur.memory.month}月の思い出
          </small>
        </h3>
        <ul className={`gd-calshots${many ? " is-many" : ""}`}>
          {cur.picks.map((pick, i) => (
            <li key={pick.src}>
              {many && <span className="gd-calpick">{"ABC"[i]}案</span>}
              <img
                src={pick.src}
                alt={pick.alt}
                width={CAL_SHOT_W}
                height={CAL_SHOT_H}
                /* 場所を先に取る。**寸法は `content/goods.ts` の1本から** */
                style={{ aspectRatio: `${CAL_SHOT_W} / ${CAL_SHOT_H}` }}
                loading="lazy"
              />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
