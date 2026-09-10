"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { tripNow, type TripDest } from "@/content/trip";

/**
 * 砂浜のいちばん上に出る「この旅のこと」。**旅のあいだだけ。**
 *
 * 名前は島の板と同じ「この旅のこと」にそろえてある
 * （`components/isle/cover.ts` の `tripPlace`）。同じ行き先を面によって
 * 別の名前で呼ぶと、それが同じ場所だと分からない。
 *
 * **旅が終われば黙って消える。** そのために、出すか出さないかは焼かずに
 * 画面が出てから決める（`content/trip.ts`）。`useEffect` の前は `null` を
 * 返すので、焼いた HTML と最初の描画は必ず同じ（水あわせが落ちない）。
 */
export default function TripDoor() {
  const [trip, setTrip] = useState<TripDest | null>(null);
  const path = usePathname();
  useEffect(() => setTrip(tripNow(new Date())), []);
  if (!trip) return null;
  /* その面そのものに居るときは出さない。押しても同じ紙が出てくる板は、
     厚みが「どこかへ行ける」と嘘をつく（`docs/island-design.md` 3-3）。

     **`.html` と終わりのスラッシュを落としてから比べる。** 本番は
     `/nordic` で配るが（`firebase.json` の `trailingSlash: false`）、
     手元で書き出しをそのまま配ると `/nordic.html` になる。
     そのまま比べると、手元でだけ自分への板が出て「直っていない」と読む。 */
  const here = (path ?? "").replace(/\.html$/, "").replace(/\/$/, "") || "/";
  if (here === trip.href) return null;
  return (
    <li className="is-trip">
      <Link href={trip.href} prefetch={false} className="ifoot-door is-trip">
        {/* テントは「これから」がもう使っている。同じ列に同じ絵が2つ並ぶと、
            どちらが旅なのか絵では言えない。島から島へ渡るのは船なので
            （`/atlas` の航路）、旅そのものは舟にする */}
        <img src="/sprites/canoe.webp" alt="" loading="lazy" />
        <em>いま</em>
        <b>この旅のこと</b>
        <i>{trip.name}</i>
      </Link>
    </li>
  );
}
