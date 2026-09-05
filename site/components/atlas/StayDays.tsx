"use client";

import { useEffect, useState } from "react";
import { stayNow } from "@/lib/stay";

/**
 * いまいる国に、今日で何日目か（`docs/island-play.md` 仕掛け10）。
 *
 * 静的書き出しなので、ビルドした日の日数が焼き込まれる。
 * 焼いた値をまず出して、画面が出てから数え直す（`components/atlas/Days.tsx` と同じ形）。
 *
 * **数えられない日は、焼いた文字のまま黙る。** いまいる国が決まっていない
 * （全部の滞在に終わりが入っている＝移動の途中）ときに 0 や「-」を出すと、
 * 旅が終わったように読める。
 */
export default function StayDays({ fallback }: { fallback: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    const s = stayNow();
    if (s) setText(`滞在 ${s.days.toLocaleString()}日目`);
  }, []);
  return <>{text ?? fallback}</>;
}
