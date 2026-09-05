/**
 * いまいる国に、今日で何日いるか（`docs/island-play.md` 仕掛け10）。
 *
 * 旅は演出ではなく事実として進んでいるので、**この数字は毎日1ずつ増える**。
 * 「歩いた国」の面には、いままで「いまここ ジョージア」としか出ていなかった。
 * 国の名前は数ヶ月変わらないので、あの欄だけが止まって見えていた。
 *
 * 静的書き出しなので、**画面が出てから数え直す**（`components/atlas/StayDays.tsx`）。
 * ここで数えた値をそのまま焼くと、ビルドした日の日数が固定で出る。
 *
 * 「いまいる国」の決め方は `app/map/page.tsx` と同じで、
 * **滞在の終わり（`to`）が空いている国**。出国済みの国には終わりが入っている。
 */

import { COUNTRIES } from "@/content/countries";
import { jstNow } from "@/lib/nightly";

export type StayNow = {
  /** 国の名前 */
  name: string;
  /** 国の slug。国旗と行き先に使う */
  slug: string;
  /** その国に入って、今日で何日目か。入った日が1日目 */
  days: number;
  /** 入った日（YYYY-MM-DD） */
  from: string;
};

/**
 * いまいる国と、今日で何日目か。
 *
 * 日付は日本時間で切る。配信日と同じ切り方にしておかないと、
 * 「今日で107日目」と「今夜の配信」が別の日を指す時間帯ができる。
 */
export function stayNow(now: Date = new Date()): StayNow | null {
  for (const c of COUNTRIES) {
    const s = c.stays.find((x) => !x.to);
    if (!s) continue;
    const a = Date.parse(`${s.from}T00:00:00Z`);
    const b = Date.parse(`${jstNow(now).date}T00:00:00Z`);
    if (Number.isNaN(a) || Number.isNaN(b)) return null;
    // 入った日を1日目と数える。0日目という言い方をしない
    const days = Math.round((b - a) / 86400000) + 1;
    return days > 0 ? { name: c.name, slug: c.slug, days, from: s.from } : null;
  }
  return null;
}
