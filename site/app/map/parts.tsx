"use client";

import { useEffect, useState } from "react";
import { PageHead } from "@/components/ui/PageShell";
import { Stat } from "@/components/ui/Bits";
import Flag from "@/components/ui/Flag";
import { stayNow, travelNow, type TravelNow } from "@/lib/stay";

/**
 * 「歩いた国」のうち、**いまどこにいるか**を言っているところ。
 *
 * この面は静的書き出し（`output: "export"`）なので、ビルドした日の答えが
 * HTML に焼かれる。「いま」と書いてあるものを焼くと、その日から嘘になる。
 * 旅に出た1週間後の本番が、前置きで「いまはコーカサスにいます」と言い、
 * 札で「滞在 126日目」と数え、年表のジョージアに「いまここ」を付けていた。
 *
 * **焼いた字をまず出して、画面が出てから引き直す**（`components/atlas/Days.tsx`
 * と同じ形）。旅に出る前は、引き直しても同じ字になる。
 */

/** 前置きのうち、動かないところ。旅がどこまで進んでも本当のこと。 */
const LEAD =
  "2024年10月28日、パリで「日本語を話したい」と言いながら配信を始めました。そこからヨーロッパを回って、中東に降りて、";

/**
 * 面の頭。**最後の1文だけが「いま」を言う。**
 *
 * @param region いちばん新しく歩いた国の地方（「コーカサス」）
 */
export function MapHead({ region }: { region: string }) {
  const [trip, setTrip] = useState<TravelNow | null>(null);
  useEffect(() => setTrip(travelNow(new Date())), []);
  const tail = trip
    ? `${region}まで来ました。いまは${trip.name}のとちゅうです。`
    : `いまは${region}にいます。`;
  return <PageHead icon="signpost-flags" title="歩いた国" lead={`${LEAD}${tail}`} />;
}

/**
 * 4つめの札。**いまどこにいて、そこで何日目か。**
 *
 * 国の名前は数ヶ月変わらないので、添え字を日数にして
 * 「旅が止まっていない」がここに出るようにしてある（`docs/island-play.md` 仕掛け10）。
 * 旅に出たら、まだ `content/countries.ts` に無い国を歩いているので、
 * 国ではなく旅そのものを出す。
 */
export function HereStat({ slug, name }: { slug: string; name: string }) {
  const [trip, setTrip] = useState<TravelNow | null>(null);
  const [days, setDays] = useState<number | null>(null);
  useEffect(() => {
    const now = new Date();
    setTrip(travelNow(now));
    setDays(stayNow(now)?.days ?? null);
  }, []);

  if (trip)
    return (
      <Stat
        /* **印を `<svg>` に入れて渡す。** この札だけ桃色に敷かれるのは
           「数ではなく、いま」の印で、その出しわけが `.stat:has(svg)`
           （`app/css/pages.css`）。旗のかわりに絵を置くと札の色が落ちて、
           4つのうちどれが「いま」なのか言えなくなる。
           枠は旗のために引いてある線なので、絵には引かない。 */
        value={
          <svg width={36} height={36} viewBox="0 0 36 36" aria-hidden style={{ border: 0 }}>
            <image href="/sprites/tent.webp" width="36" height="36" />
          </svg>
        }
        label={trip.name}
        sub={`旅に出て ${trip.days.toLocaleString()}日目`}
      />
    );
  return (
    <Stat
      value={<Flag slug={slug} size={34} />}
      label={name}
      /* 数えられない日は「いまここ」のまま黙る。0や「-」を出すと旅が終わって見える */
      sub={days === null ? "いまここ" : `滞在 ${days.toLocaleString()}日目`}
    />
  );
}

/**
 * 年表の「いまここ」。
 *
 * 付ける行はビルド時に決まる（いちばん新しく歩いた国）。
 * その国を出たかどうかだけを、画面が出てから見る。
 */
export function HereTag({ slug }: { slug: string }) {
  const [on, setOn] = useState(true);
  useEffect(() => setOn(stayNow(new Date())?.slug === slug), [slug]);
  return on ? <span className="atrip-here">いまここ</span> : null;
}
