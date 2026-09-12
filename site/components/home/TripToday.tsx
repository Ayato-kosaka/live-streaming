"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Icon from "@/components/ui/IconCore";
import { tripDate } from "@/content/chapters";
import { BUILT_AT } from "@/lib/builtAt";
import { travelNow, tripDayWord } from "@/lib/stay";

/**
 * 島の1画面目に出る、旅のしるべ。
 *
 * ## なぜ要るのか
 *
 * 島が公開された翌日（旅の1日目）に、**トップの1画面目で日付を持っている字が
 * 「今日の島 / 1年前の今日はジョージアにいました」1枚だけ**だった。
 * 嘘ではないが、はじめて来た人が最初に読むのが1年前の話になっていて、
 * **旅が始まっていることに気づけない。** 実測では
 *
 *   「進行中 ヒッチハイクで北欧へ」 … y=914（1.1画面ぶん送る）
 *   「いま ポーランド・カトヴィツェ」 … y=2341（2.8画面）
 *   「1日目」                       … トップに1度も出てこない
 *
 * だったので、**いちばん上に、いま何日目でどこにいるかを置く。**
 * 「今日の島」は消さない。あれは残したまま、日付を持つ字をもう1枚、先に出す。
 *
 * ## 焼き込みと、どう付き合うか
 *
 * 静的書き出し（`output: "export"`）なので、ここで `new Date()` を使うと
 * 焼いた HTML とブラウザの最初の描画が別の答えになって水あわせが落ちる
 * （`docs/island-misses.md` #30）。最初の描画は**焼いた時刻**（`BUILT_AT`。
 * `NEXT_PUBLIC_BUILT_AT` から来るので、サーバ側とブラウザ側で必ず同じ字になる）で
 * 出して、本物の今日で数え直すのは画面が出てから。
 *
 * ## 旅が終わったら、黙る
 *
 * 「旅が始まりました」を焼くと、10月には嘘になる。出るかどうかも、何日目かも、
 * **日付だけで決まる**ようにしてある。判定は `lib/stay.ts` の `travelNow()` ひとつで、
 * `/now` と `/about` と表紙の名刺（`NowPlace`）が同じところを見ている。
 * 旅が終われば `null` が返るので、この板はその日から出なくなる。
 *
 * 何日目かも同じ出どころ（`chapterDayNo`）。旅程表の「1日目」と同じ番号になる。
 *
 * ## 街の名前は、ここで書かない
 *
 * 旅程は `content/nordic.ts` が正で、あれをブラウザへ連れてくると見どころ161件の
 * JSON が丸ごと付いてくる（`components/nordic/TripNow.tsx` と同じ理由）。
 * だから **17行ぶんの日付・呼び名・行き先・街だけ**をサーバ側で抜いて渡す
 * （`app/page.tsx`）。手で書いた街の名前はここに1つも無い。
 */

export type TripDay = {
  /** その日（YYYY-MM-DD）。旅をしている土地の暦で切ってある */
  date: string;
  /** 旅程表での呼び名。「1日目」「出発」 */
  name: string;
  /** その日のページ。日ごとの面が無い日は旅程表のその行 */
  href: string;
  /** その日に動くところ。「カトヴィツェ → ワルシャワ」「ヴィリニュス」 */
  where: string;
};

export default function TripToday({ slug, days }: { slug: string; days: TripDay[] }) {
  /** いま。最初の描画は焼いた時刻で、画面が出てから本物に入れ替える */
  const [now, setNow] = useState(BUILT_AT);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    /* 日付が変わったら板も変わる。1分に1度で足りる（「あと◯分」は出していない）。 */
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  const trip = travelNow(now);
  // 旅に出ていない日は、この板ごと出ない。出発前も、旅の翌日も、その1ヶ月後も
  if (!trip) return null;

  /* 旅程表を持っているのは、いまのところ北欧の旅だけ。別の島を歩いている日は
     章の名前と「旅に出て◯日目」だけで言う（`lib/stay.ts` の `tripDayWord`）。 */
  const row = trip.slug === slug ? days.find((d) => d.date === tripDate(now)) : undefined;

  return (
    <Link
      className="htrip"
      href={row ? row.href : trip.href}
      /* **先読みしない。** 島に降りただけの人に、日ごとの面まで取らせない
         （`components/today/Today.tsx` の行き先と同じ決まり）。 */
      prefetch={false}
    >
      <span className="htrip-body">
        <em>いま、旅のとちゅう</em>
        <b>
          {trip.name} {row ? row.name : tripDayWord(trip.days)}
        </b>
        {row && <i>{row.where}</i>}
      </span>
      <Icon name="right" size={16} className="htrip-go" />
    </Link>
  );
}
