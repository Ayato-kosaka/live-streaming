"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SPOTS, spotOfPath } from "../island/layout";

/**
 * 看板の札6つ（900px から上でだけ出る帯）。
 *
 * **いまその面にいる札だけ朱枠**（`.ih-link.is-on`。`app/css/pages.css`）。
 * 砂浜の「いま居る場所」と同じことを言う印なので、**同じ式から引く**
 * （`layout.ts` の `spotOfPath`）。
 *
 * 前はここも面から `current` を受け取っていた。砂浜と帯で同じ値を
 * 同じ経路で受けていたので、面が渡し忘れると**上と下が揃って消えた**
 * （#718）。いまはどちらも道から引くので、渡す口そのものが無い。
 *
 * 札を別ファイルにしたのは、ここだけ画面側で道を読むから。看板の残り
 * （島へ戻る板・いまどこ・自分のアイコン）は焼いたまま出す。
 */
export default function IslandNav() {
  const current = spotOfPath(usePathname());
  return (
    <nav className="ih-nav" aria-label="島のなか">
      {SPOTS.map((s) => (
        <Link
          key={s.id}
          href={s.href}
          prefetch={false}
          className={`ih-link${current === s.id ? " is-on" : ""}`}
        >
          <img src={`/sprites/${s.icon}.webp`} alt="" />
          {s.label}
        </Link>
      ))}
    </nav>
  );
}
