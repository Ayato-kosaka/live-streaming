"use client";

import { useEffect, useState } from "react";
import { loadState } from "@/lib/liveStats";

/**
 * 旅程表のいちばん下の行。**着く前と、着いたあとで書き分ける。**
 *
 * ここは長いあいだ「着いた朝 / 船が着いたら終わりです」だけだった。
 * よていの言い方なので、**着いたあとも「これから着く」と言い続ける。**
 * 旅が終わったという事実が、サイトのどこにも無かった
 * （`docs/nordic-depart.md`「旅の終わりかた」）。
 *
 * 着いた日は島から届く（`/island-api/state` の `nordic.arrivedOn`）。
 * 旅の終わりは旅の途中に起きるので、Git には入らない。
 *
 * **届くまでは、いままでどおりの字を出す。** 読めなかった日に
 * 「着いたかどうか分かりません」と書くと、旅程表の最後の行が謎になる。
 */

/** 「2026-09-19」→「9月19日(土)」。書き出しは UTC で走るので、月日は文字列から取る。 */
function when(iso: string) {
  const w = "日月火水木金土"[new Date(`${iso}T00:00:00Z`).getUTCDay()];
  return `${Number(iso.slice(5, 7))}月${Number(iso.slice(8, 10))}日(${w})`;
}

/** 出発から着くまで、何日かかったか。どちらも動かない日付なので、数え直しは要らない。 */
function tookDays(depart: string, arrived: string): number | null {
  const ms = Date.parse(`${arrived}T00:00:00Z`) - Date.parse(`${depart}T00:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  const n = Math.round(ms / 86400000) + 1;
  return n > 0 && n < 100 ? n : null;
}

export default function GoalRow({ depart }: { depart: string }) {
  const [arrived, setArrived] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadState().then((s) => {
      const a = s?.nordic?.arrivedOn;
      if (alive && a) setArrived(a);
    });
    return () => {
      alive = false;
    };
  }, []);

  const took = arrived ? tookDays(depart, arrived) : null;

  return (
    <div className="ndayr is-flat">
      <span className="ndayr-body">
        <span className="ndayr-top">
          <b>{arrived ? "着いた" : "着いた朝"}</b>
          {arrived && <time dateTime={arrived}>{when(arrived)}</time>}
        </span>
        <span className="ndayr-way">
          <span>ストックホルム</span>
        </span>
        <span className="ndayr-say">
          {arrived ?
            /* 着いたあとの字。**会えたかどうかは書かない。** サイトの上の
               ゴールはストックホルムに着くことで、会えたかどうかはそのあとの
               配信の話（`docs/nordic-fund.md` 1章）。相手の都合で会えない
               ことは普通にあるし、そのとき相手が約束を破った人に見えるのが
               いちばんまずい。 */
            `ポーランドから${took ? `${took}日` : ""}、ぜんぶ人の車と船で来ました。ここに、会いたい人がいます。` :
            "船が着いたら終わりです。ここに、会いたい人がいます。友だちの家に約1週間。"}
        </span>
      </span>
    </div>
  );
}
